# CAS (findata optimistic concurrency) — rollout & rollback

Server-side compare-and-swap for findata writes. This document is the deploy plan; it is
**not executed by this PR** (no production deploy here). It exists so the enforcement of the
CAS bypass guard can be rolled out and rolled back **without breaking writes** for a frontend
that has not yet been cut over.

## The problem the gate solves

`pb/pb_hooks/guard.pb.js` forbids generic REST `PATCH` of `data`/`revision` on `users` and
`haneler` — that is what makes CAS unbypassable. But an **old** production frontend writes
findata via exactly that generic PATCH. If the guard were unconditional, deploying the new PB
image would instantly 403 every write from the not-yet-updated frontend.

So the guard is **feature-gated** by an environment variable:

| `FINANSAPP_CAS_ENFORCE` | Guard | Generic PATCH of data/revision | CAS endpoint | Migration |
|---|---|---|---|---|
| unset / anything else (**default**) | OFF — **compatibility** | allowed (legacy frontend keeps working) | works | active |
| `1` | ON — **enforce** | 403 Forbidden | works | active |

Default is **compatibility** so that simply pulling the new image never breaks writes;
enforcement is opt-in and reversible with an env change + restart (no image change).

## Rollout phases

- **Phase A — image (compatibility).** Deploy the new PB image with `FINANSAPP_CAS_ENFORCE`
  unset (or `0`). Migration adds `revision`; CAS endpoint `POST /api/findata/kaydet` is live;
  the guard is OFF. Old frontend keeps writing via generic PATCH; nothing breaks. New frontend,
  if present, already uses CAS. Both write paths coexist.
- **Phase B — frontend cutover.** Deploy the new frontend (this PR's client): it writes findata
  **only** via the CAS endpoint and reads `revision`. No PB change. After every client is on the
  new frontend, no legitimate writer uses generic PATCH anymore.
- **Phase C — enforce.** Set `FINANSAPP_CAS_ENFORCE=1` and restart PB. Generic PATCH of
  data/revision now 403s; the CAS bypass is closed. CAS endpoint + new frontend unaffected.

Each phase is independently verifiable and independently reversible.

## Rollback matrix

Rollback direction matters: **the frontend and the enforcement flag are coupled.** A new
frontend needs the CAS endpoint (present from Phase A on, so it is safe in every state). An old
frontend needs generic PATCH, which only works while enforcement is OFF.

| Current state | Rollback action | Writes work? | Required accompanying step |
|---|---|---|---|
| After **A** (image, compat) | revert to old PB image | ✅ | none — old frontend used generic PATCH, old image has no guard |
| After **B** (new frontend, compat) | revert frontend to old build | ✅ | none — enforcement still OFF, generic PATCH still allowed |
| After **B** (new frontend, compat) | revert PB image to old | ✅ | none — new frontend's CAS endpoint disappears, but old frontend build is what ships on rollback; if only PB is reverted while new frontend stays, new frontend loses the CAS endpoint → **also roll frontend back** |
| After **C** (enforce) | revert **frontend** to old build | ❌ if enforce stays `1` | **must** also set `FINANSAPP_CAS_ENFORCE=0` (or unset) and restart PB first/together — otherwise the reverted old frontend's generic PATCH is 403'd |
| After **C** (enforce) | set `FINANSAPP_CAS_ENFORCE=0`, keep new frontend | ✅ | none — new frontend still uses CAS; compatibility just also re-opens legacy PATCH |

**The one trap:** rolling the frontend back to the legacy build after Phase C **without** first
returning enforcement to compatibility. The old frontend writes via generic PATCH, which the
guard 403s → all writes fail. Rule: **enforcement may only be `1` while every frontend in use is
the CAS frontend.** Roll enforcement back to `0` before (or atomically with) any frontend
rollback that reintroduces generic-PATCH writers.

## Tests

- **Enforce mode** (`FINANSAPP_CAS_ENFORCE=1`): the main E2E suite runs the PB with enforce on
  (`e2e/global-setup.mjs`); `C5` proves generic PATCH of data/revision → 403 while CAS works.
- **Compatibility mode** (default/unset): `e2e/c-cas-compat.spec.mjs` spins up a separate
  throwaway PB with the flag unset and proves legacy generic PATCH is allowed **and** the CAS
  endpoint works simultaneously.
