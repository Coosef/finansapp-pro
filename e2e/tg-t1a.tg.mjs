// Telegram T1A — internal security API acceptance suite (TG-A01..A34).
// Browser YOK: PB endpoint'lerine doğrudan fetch + HMAC v1 (Node reference signer).
import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import crypto from "node:crypto";
import { signHeaders, hmacHex, sha256hex, canonicalString } from "./tg-hmac.mjs";

const RT = JSON.parse(readFileSync(new URL("./.tg-runtime.json", import.meta.url)));
const BASE = RT.base;
let ADMIN = "";
let tgSeq = 700000000;
const nextTgid = () => String(++tgSeq);

async function authUser(u) { const r = await (await fetch(BASE + "/api/collections/users/auth-with-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: u.email, password: u.password }) })).json(); return { token: r.token, id: r.record.id }; }
async function authAdmin() { const r = await (await fetch(BASE + "/api/collections/_superusers/auth-with-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: RT.admin.email, password: RT.admin.password }) })).json(); return r.token; }
async function svc(path, body = {}, opts = {}) {
  const rawBody = opts.rawOverride != null ? opts.rawOverride : JSON.stringify(body);
  const secret = opts.secret != null ? opts.secret : RT.gwSecret;
  const headers = opts.headers || signHeaders({ secret, method: "POST", path: opts.signPath || path, rawBody: opts.signBody != null ? opts.signBody : rawBody, ts: opts.ts, nonce: opts.nonce });
  if (opts.mut) opts.mut(headers);
  const res = await fetch(BASE + path, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: rawBody });
  let json = null; try { json = await res.json(); } catch { /* boş */ }
  return { status: res.status, json };
}
async function pairCode(token, extraBody) { const r = await fetch(BASE + "/api/tg/user/pair-code", { method: "POST", headers: { Authorization: token, "Content-Type": "application/json" }, body: JSON.stringify(extraBody || {}) }); return (await r.json()).code; }
async function adminList(coll, filter) { const q = filter ? `?filter=${encodeURIComponent(filter)}&perPage=200` : "?perPage=200"; const r = await fetch(BASE + `/api/collections/${coll}/records${q}`, { headers: { Authorization: ADMIN } }); return ((await r.json()).items) || []; }
async function adminPatch(coll, id, data) { return fetch(BASE + `/api/collections/${coll}/records/${id}`, { method: "PATCH", headers: { Authorization: ADMIN, "Content-Type": "application/json" }, body: JSON.stringify(data) }); }
async function adminCreate(coll, data) { const r = await fetch(BASE + `/api/collections/${coll}/records`, { method: "POST", headers: { Authorization: ADMIN, "Content-Type": "application/json" }, body: JSON.stringify(data) }); return r.json(); }
async function usersRecord(id) { const r = await fetch(BASE + `/api/collections/users/records/${id}`, { headers: { Authorization: ADMIN } }); return r.json(); }
async function wipe() { for (const c of ["telegram_links", "telegram_pair_codes", "telegram_service_requests", "telegram_updates", "telegram_state"]) { for (const it of await adminList(c)) await fetch(BASE + `/api/collections/${c}/records/${it.id}`, { method: "DELETE", headers: { Authorization: ADMIN } }); } }
const pastIso = () => new Date(Date.now() - 600000).toISOString().replace("T", " ");

test.beforeAll(async () => { ADMIN = await authAdmin(); expect(ADMIN, "superuser auth").toBeTruthy(); });
test.beforeEach(async () => { await wipe(); });

// ---- HMAC / service-auth ----
test("TG-A01 HMAC official vector: PB accepts Node-computed signature (PB==Node hs256)", async () => {
  const r = await svc("/api/tg/service/state/get", {}, { ts: Math.floor(Date.now() / 1000), nonce: "vector-nonce-0001-abcd" });
  expect(r.status).toBe(200);
  // fixed Node vector determinism (lowercase 64-hex)
  const sig = hmacHex(canonicalString(1700000000, "n", "POST", "/p", "{}"), "s");
  expect(sig).toMatch(/^[0-9a-f]{64}$/);
  expect(hmacHex(canonicalString(1700000000, "n", "POST", "/p", "{}"), "s")).toBe(sig);
});
test("TG-A02 reversed hs256 arg order fails", async () => {
  const path = "/api/tg/service/state/get", raw = "{}", ts = Math.floor(Date.now() / 1000), nonce = "rev-" + crypto.randomBytes(8).toString("hex");
  const canonical = canonicalString(ts, nonce, "POST", path, raw);
  const reversed = hmacHex(RT.gwSecret, canonical); // args swapped
  const r = await svc(path, {}, { headers: { "X-TG-Version": "1", "X-TG-Timestamp": String(ts), "X-TG-Nonce": nonce, "X-TG-Signature": reversed }, rawOverride: raw });
  expect(r.status).toBe(401);
});
test("TG-A04 wrong signature rejected", async () => { expect((await svc("/api/tg/service/state/get", {}, { mut: (h) => { h["X-TG-Signature"] = "0".repeat(64); } })).status).toBe(401); });
test("TG-A05 stale timestamp rejected", async () => { expect((await svc("/api/tg/service/state/get", {}, { ts: Math.floor(Date.now() / 1000) - 120 })).status).toBe(401); });
test("TG-A06 future timestamp beyond tolerance rejected", async () => { expect((await svc("/api/tg/service/state/get", {}, { ts: Math.floor(Date.now() / 1000) + 120 })).status).toBe(401); });
test("TG-A07 replay same nonce rejected", async () => {
  const ts = Math.floor(Date.now() / 1000), nonce = "replay-" + crypto.randomBytes(8).toString("hex");
  expect((await svc("/api/tg/service/state/get", {}, { ts, nonce })).status).toBe(200);
  expect((await svc("/api/tg/service/state/get", {}, { ts, nonce })).status).toBe(401);
});
test("TG-A08 concurrent same nonce → exactly one accepted", async () => {
  const ts = Math.floor(Date.now() / 1000), nonce = "conc-" + crypto.randomBytes(8).toString("hex");
  const rs = await Promise.all([svc("/api/tg/service/state/get", {}, { ts, nonce }), svc("/api/tg/service/state/get", {}, { ts, nonce })]);
  expect(rs.filter((x) => x.status === 200).length).toBe(1);
  expect(rs.filter((x) => x.status === 401).length).toBe(1);
});
test("TG-A09 body one-byte tamper rejected", async () => {
  const path = "/api/tg/service/data", body = { telegram_user_id: nextTgid() };
  const r = await svc(path, body, { signBody: JSON.stringify(body), rawOverride: JSON.stringify(body) + " " });
  expect(r.status).toBe(401);
});
test("TG-A10 method/path tamper rejected", async () => { expect((await svc("/api/tg/service/state/get", {}, { signPath: "/api/tg/service/unlink" })).status).toBe(401); });
test("TG-A11 previous secret accepted (configured); random secret rejected", async () => {
  expect((await svc("/api/tg/service/state/get", {}, { secret: RT.gwPrevSecret })).status).toBe(200);
  expect((await svc("/api/tg/service/state/get", {}, { secret: "totally-wrong-secret" })).status).toBe(401);
});

// ---- pairing ----
test("TG-A12/A13 pair code: plaintext absent from DB; stored as keyed HMAC (pepper), not plain sha256", async () => {
  const a = await authUser(RT.userA); const code = await pairCode(a.token);
  const rows = await adminList("telegram_pair_codes");
  expect(rows.length).toBe(1);
  const stored = rows[0].code_mac;
  expect(JSON.stringify(rows[0])).not.toContain(code);          // plaintext yok
  expect(stored).toBe(hmacHex(code, RT.pepper));                 // keyed-HMAC(pepper)
  expect(stored).not.toBe(sha256hex(code));                      // düz sha256 DEĞİL
});
test("TG-A14 pair code single use", async () => {
  const a = await authUser(RT.userA); const code = await pairCode(a.token); const tg = nextTgid();
  expect((await svc("/api/tg/service/pair-consume", { telegram_user_id: tg, code })).status).toBe(200);
  expect((await svc("/api/tg/service/pair-consume", { telegram_user_id: tg, code })).status).toBe(400);
});
test("TG-A15 pair code expiry", async () => {
  const a = await authUser(RT.userA); const code = await pairCode(a.token);
  const row = (await adminList("telegram_pair_codes"))[0];
  await adminPatch("telegram_pair_codes", row.id, { expires_at: pastIso() });
  expect((await svc("/api/tg/service/pair-consume", { telegram_user_id: nextTgid(), code })).status).toBe(400);
});
test("TG-A16 concurrent pair consume → only one success", async () => {
  const a = await authUser(RT.userA); const code = await pairCode(a.token); const tg = nextTgid();
  const rs = await Promise.all([svc("/api/tg/service/pair-consume", { telegram_user_id: tg, code }), svc("/api/tg/service/pair-consume", { telegram_user_id: tg, code })]);
  expect(rs.filter((x) => x.status === 200 && x.json && x.json.ok).length).toBe(1);
});
test("TG-A17 invalid pair attempts → 5/15m rate limit (429)", async () => {
  const tg = nextTgid(); let got429 = false;
  for (let i = 0; i < 7; i++) { const r = await svc("/api/tg/service/pair-consume", { telegram_user_id: tg, code: "WRONGCOD" }); if (r.status === 429) { got429 = true; break; } }
  expect(got429).toBe(true);
});
test("TG-A18 same telegram id cannot actively link two PB users", async () => {
  const a = await authUser(RT.userA), b = await authUser(RT.userB); const tg = nextTgid();
  expect((await svc("/api/tg/service/pair-consume", { telegram_user_id: tg, code: await pairCode(a.token) })).status).toBe(200);
  const r = await svc("/api/tg/service/pair-consume", { telegram_user_id: tg, code: await pairCode(b.token) });
  expect(r.status).toBe(400); // tgid başka user'a bağlı
});
test("TG-A19 same PB user cannot actively link two telegram ids", async () => {
  const a = await authUser(RT.userA);
  expect((await svc("/api/tg/service/pair-consume", { telegram_user_id: nextTgid(), code: await pairCode(a.token) })).status).toBe(200);
  const r = await svc("/api/tg/service/pair-consume", { telegram_user_id: nextTgid(), code: await pairCode(a.token) });
  expect(r.status).toBe(400); // user zaten başka tgid'e bağlı
});
test("TG-A20 username irrelevant — identity is numeric telegram_user_id only", async () => {
  const a = await authUser(RT.userA); const tg = nextTgid();
  expect((await svc("/api/tg/service/pair-consume", { telegram_user_id: tg, code: await pairCode(a.token), username: "@spoofed" })).status).toBe(200);
  const link = (await adminList("telegram_links"))[0];
  expect(link.telegram_user_id).toBe(tg);
  expect(JSON.stringify(link)).not.toContain("spoofed"); // username saklanmaz
});
test("TG-A21 browser pair-code only for current authed user (body user ignored)", async () => {
  const a = await authUser(RT.userA), b = await authUser(RT.userB);
  await pairCode(a.token, { user: b.id }); // body'de B iddiası
  const rows = await adminList("telegram_pair_codes");
  expect(rows.every((r) => r.user === a.id)).toBe(true); // yalnız A
});
test("TG-A22/A23 browser status + unlink own only", async () => {
  const a = await authUser(RT.userA); const tg = nextTgid();
  await svc("/api/tg/service/pair-consume", { telegram_user_id: tg, code: await pairCode(a.token) });
  const st = await (await fetch(BASE + "/api/tg/user/status", { method: "POST", headers: { Authorization: a.token, "Content-Type": "application/json" }, body: "{}" })).json();
  expect(st.linked).toBe(true); expect(st.telegram_user_id).toBe(tg);
  await fetch(BASE + "/api/tg/user/unlink", { method: "POST", headers: { Authorization: a.token, "Content-Type": "application/json" }, body: "{}" });
  expect((await adminList("telegram_links", `user = "${a.id}" && active = true`)).length).toBe(0);
});

// ---- F1: active-link uniqueness / relink lifecycle ----
test("TG-F01 A links TG-X → exactly one active link (A,X)", async () => {
  const a = await authUser(RT.userA); const X = nextTgid();
  expect((await svc("/api/tg/service/pair-consume", { telegram_user_id: X, code: await pairCode(a.token) })).status).toBe(200);
  const active = await adminList("telegram_links", `active = true`);
  expect(active.length).toBe(1);
  expect(active[0].user).toBe(a.id);
  expect(active[0].telegram_user_id).toBe(X);
});
test("TG-F02 A unlink → no active link remains (inactive history kept, reserves nothing)", async () => {
  const a = await authUser(RT.userA); const X = nextTgid();
  await svc("/api/tg/service/pair-consume", { telegram_user_id: X, code: await pairCode(a.token) });
  await fetch(BASE + "/api/tg/user/unlink", { method: "POST", headers: { Authorization: a.token, "Content-Type": "application/json" }, body: "{}" });
  expect((await adminList("telegram_links", `active = true`)).length).toBe(0);
  expect((await adminList("telegram_links", `user = "${a.id}"`)).length).toBe(1); // pasif tarihsel satır duruyor
});
test("TG-F03 B can link SAME TG-X after A explicitly unlinked (no perpetual reservation)", async () => {
  const a = await authUser(RT.userA), b = await authUser(RT.userB); const X = nextTgid();
  await svc("/api/tg/service/pair-consume", { telegram_user_id: X, code: await pairCode(a.token) });
  await fetch(BASE + "/api/tg/user/unlink", { method: "POST", headers: { Authorization: a.token, "Content-Type": "application/json" }, body: "{}" });
  const r = await svc("/api/tg/service/pair-consume", { telegram_user_id: X, code: await pairCode(b.token) });
  expect(r.status).toBe(200); // ESKİDEN 400 validation_not_unique → artık başarılı devir
  const active = await adminList("telegram_links", `active = true`);
  expect(active.length).toBe(1);
  expect(active[0].user).toBe(b.id);
  expect(active[0].telegram_user_id).toBe(X);
});
test("TG-F04 A can relink TG-X after unlink (fresh active row, not reactivated history)", async () => {
  const a = await authUser(RT.userA); const X = nextTgid();
  await svc("/api/tg/service/pair-consume", { telegram_user_id: X, code: await pairCode(a.token) });
  await fetch(BASE + "/api/tg/user/unlink", { method: "POST", headers: { Authorization: a.token, "Content-Type": "application/json" }, body: "{}" });
  const r = await svc("/api/tg/service/pair-consume", { telegram_user_id: X, code: await pairCode(a.token) });
  expect(r.status).toBe(200);
  const active = await adminList("telegram_links", `user = "${a.id}" && active = true`);
  expect(active.length).toBe(1);
  expect(active[0].telegram_user_id).toBe(X);
});
test("TG-F05 two users cannot simultaneously own same TG-X; concurrent → controlled, exactly one active, no 5xx", async () => {
  const a = await authUser(RT.userA), b = await authUser(RT.userB); const X = nextTgid();
  const codeA = await pairCode(a.token), codeB = await pairCode(b.token);
  const rs = await Promise.all([
    svc("/api/tg/service/pair-consume", { telegram_user_id: X, code: codeA }),
    svc("/api/tg/service/pair-consume", { telegram_user_id: X, code: codeB }),
  ]);
  expect(rs.filter((r) => r.status === 200).length).toBe(1); // tam olarak biri kazanır
  for (const r of rs) expect(r.status).toBeLessThan(500);    // ham 5xx YOK — kontrollü 400/409
  expect((await adminList("telegram_links", `active = true && telegram_user_id = "${X}"`)).length).toBe(1);
});
test("TG-F06 one PB user cannot hold two simultaneous active Telegram IDs", async () => {
  const a = await authUser(RT.userA); const X = nextTgid(), Y = nextTgid();
  expect((await svc("/api/tg/service/pair-consume", { telegram_user_id: X, code: await pairCode(a.token) })).status).toBe(200);
  const r = await svc("/api/tg/service/pair-consume", { telegram_user_id: Y, code: await pairCode(a.token) });
  expect(r.status).toBe(400); // user zaten aktif başka tgid'e bağlı
  const active = await adminList("telegram_links", `user = "${a.id}" && active = true`);
  expect(active.length).toBe(1);
  expect(active[0].telegram_user_id).toBe(X);
});
test("TG-F07 nonce 401 is tied to ACTUAL existence (replay), not blanket auth-fail", async () => {
  const ts = Math.floor(Date.now() / 1000), nonce = "cls-" + crypto.randomBytes(8).toString("hex");
  expect((await svc("/api/tg/service/state/get", {}, { ts, nonce })).status).toBe(200);
  expect((await adminList("telegram_service_requests", `nonce = "${nonce}"`)).length).toBe(1);
  const replay = await svc("/api/tg/service/state/get", {}, { ts, nonce });
  expect(replay.status).toBe(401);                                                        // gerçek replay
  expect((await adminList("telegram_service_requests", `nonce = "${nonce}"`)).length).toBe(1); // phantom kayıt yok
  expect((await svc("/api/tg/service/state/get", {}, { ts, nonce: "cls-" + crypto.randomBytes(8).toString("hex") })).status).toBe(200); // auth global bozulmadı
});
test("TG-F08 concurrent pair-code generation → at most one UNUSED code per user (DB invariant)", async () => {
  const a = await authUser(RT.userA);
  await Promise.all([pairCode(a.token), pairCode(a.token), pairCode(a.token)]);
  const all = await adminList("telegram_pair_codes", `user = "${a.id}"`);
  expect(all.filter((r) => !r.used_at).length).toBeLessThanOrEqual(1); // ≤1 kullanılmamış
});

// ---- service/status (metadata-only, R2/R8) ----
test("TG-S01 service/status: HMAC gerekli; linked/unlinked; finansal veri/user-id YOK; 200 (401 değil)", async () => {
  const a = await authUser(RT.userA); const tg = nextTgid();
  const u0 = await svc("/api/tg/service/status", { telegram_user_id: tg });
  expect(u0.status).toBe(200); expect(u0.json.linked).toBe(false);          // linksiz → 200 {linked:false}
  await svc("/api/tg/service/pair-consume", { telegram_user_id: tg, code: await pairCode(a.token) });
  const u1 = await svc("/api/tg/service/status", { telegram_user_id: tg });
  expect(u1.status).toBe(200); expect(u1.json.linked).toBe(true); expect(u1.json.scope).toBe("personal");
  expect(Object.keys(u1.json).sort()).toEqual(["linked", "scope"]);         // data/revision/user id YOK
  const bad = await svc("/api/tg/service/status", { telegram_user_id: tg }, { mut: (h) => { h["X-TG-Signature"] = "0".repeat(64); } });
  expect(bad.status).toBe(401);                                              // HMAC olmadan reddedilir
});

// ---- data + revision immutability ----
// F2-05: GERÇEK "bağlı değil" = İŞ yanıtı 404 + sabit payload (401/403 YALNIZ servis HMAC/auth için).
test("TG-A24/F2-05 unlinked service data → business 404 {error:not_linked} (401 değil)", async () => {
  const r = await svc("/api/tg/service/data", { telegram_user_id: nextTgid() });
  expect(r.status).toBe(404);
  expect(r.json.error).toBe("not_linked");
});
// F2-03: service/unlink — gerçek "link yok" → idempotent 200; aktif link → save sonrası 200 + pasif.
test("TG-F08/F2-03 service/unlink idempotent (no-link 200) + gerçek unlink 200 sonrası pasif", async () => {
  const r0 = await svc("/api/tg/service/unlink", { telegram_user_id: nextTgid() }); // hiç link yok
  expect(r0.status).toBe(200); expect(r0.json.ok).toBe(true);
  const a = await authUser(RT.userA); const tg = nextTgid();
  await svc("/api/tg/service/pair-consume", { telegram_user_id: tg, code: await pairCode(a.token) });
  const r1 = await svc("/api/tg/service/unlink", { telegram_user_id: tg });
  expect(r1.status).toBe(200);
  const s = await svc("/api/tg/service/status", { telegram_user_id: tg });
  expect(s.json.linked).toBe(false); // gerçekten pasifleşti (yalan 200 değil)
  const r2 = await svc("/api/tg/service/unlink", { telegram_user_id: tg }); // tekrar → idempotent
  expect(r2.status).toBe(200);
});
test("TG-A25/A26 linked service data resolves PB identity server-side; personal-only", async () => {
  const a = await authUser(RT.userA); const tg = nextTgid();
  await svc("/api/tg/service/pair-consume", { telegram_user_id: tg, code: await pairCode(a.token) });
  const r = await svc("/api/tg/service/data", { telegram_user_id: tg });
  expect(r.status).toBe(200); expect(r.json.scope).toBe("personal"); expect(typeof r.json.revision).toBe("number");
});
test("TG-A27/A28 T1A metadata calls do NOT change users data/revision", async () => {
  const a = await authUser(RT.userA); const tg = nextTgid();
  const before = await usersRecord(a.id);
  await pairCode(a.token);
  await svc("/api/tg/service/pair-consume", { telegram_user_id: tg, code: await pairCode(a.token) });
  await svc("/api/tg/service/data", { telegram_user_id: tg });
  await fetch(BASE + "/api/tg/user/unlink", { method: "POST", headers: { Authorization: a.token, "Content-Type": "application/json" }, body: "{}" });
  const after = await usersRecord(a.id);
  expect(after.revision).toBe(before.revision);
  expect(JSON.stringify(after.data || {})).toBe(JSON.stringify(before.data || {}));
});
test("TG-A29 generic REST cannot read Telegram internal collections", async () => {
  const a = await authUser(RT.userA);
  for (const c of ["telegram_links", "telegram_pair_codes", "telegram_state", "telegram_updates", "telegram_service_requests"]) {
    const r = await fetch(BASE + `/api/collections/${c}/records`, { headers: { Authorization: a.token } });
    expect([400, 403, 404]).toContain(r.status);
  }
});

// ---- durable offset / idempotency / lease fencing ----
const claim = (uid) => svc("/api/tg/service/update/claim", { update_id: uid });
const complete = (uid, token, extra) => svc("/api/tg/service/update/complete", { update_id: uid, lease_token: token, ...(extra || {}) });
const offset = async () => (await svc("/api/tg/service/state/get", {})).json.next_offset;

test("TG-A30/A31 + TG-R03/R04 server-derived next_offset = update_id+1; non-monotonic derives its own +1", async () => {
  const c1 = await claim("1000"); await complete("1000", c1.json.lease_token);
  expect(await offset()).toBe("1001"); // TG-R03: update_id+1
  const c2 = await claim("5"); await complete("5", c2.json.lease_token); // lower/week-gap id
  expect(await offset()).toBe("6");    // TG-R04: its own +1, NOT max(1000)
});
test("TG-A32 duplicate update claim idempotent", async () => {
  const c = await claim("42"); await complete("42", c.json.lease_token);
  const r = await claim("42");
  expect(r.json.claimed).toBe(false); expect(r.json.duplicate).toBe(true);
});
test("TG-A33/TG-R07 lease reclaim: fresh→busy; expired→reclaim with NEW token", async () => {
  const r1 = await claim("77"); expect(r1.json.claimed).toBe(true);
  const busy = await claim("77"); expect(busy.json.busy).toBe(true); // taze lease → busy (fencing)
  const row = (await adminList("telegram_updates", `update_id = "77"`))[0];
  await adminPatch("telegram_updates", row.id, { lease_until: pastIso() });
  const r2 = await claim("77");
  expect(r2.json.claimed).toBe(true); expect(r2.json.reclaimed).toBe(true);
  expect(r2.json.lease_token).not.toBe(r1.json.lease_token); // yeni token
});
test("TG-R01 complete without claim → 409, offset unchanged", async () => {
  const before = await offset();
  const r = await complete("9999", "sometoken");
  expect(r.status).toBe(409); expect(r.json.error).toBe("no_claim");
  expect(await offset()).toBe(before);
});
test("TG-R02 failed processing cannot advance offset", async () => {
  const before = await offset();
  const c = await claim("500"); const r = await complete("500", c.json.lease_token, { status: "failed" });
  expect(r.status).toBe(200); expect(r.json.status).toBe("failed");
  expect(await offset()).toBe(before); // offset İLERLEMEDİ
});
test("TG-R05/R06 stale lease token cannot complete after reclaim; current token completes", async () => {
  const c1 = await claim("88");
  const row = (await adminList("telegram_updates", `update_id = "88"`))[0];
  await adminPatch("telegram_updates", row.id, { lease_until: pastIso() });
  const c2 = await claim("88"); // reclaim → new token
  const stale = await complete("88", c1.json.lease_token); // R05: eski token
  expect(stale.status).toBe(409); expect(stale.json.error).toBe("lease_mismatch");
  const ok = await complete("88", c2.json.lease_token);    // R06: güncel token
  expect(ok.status).toBe(200); expect(ok.json.next_offset).toBe("89");
});

// ---- fail-closed + log hygiene ----
test("TG-A03 gateway secret missing → fail closed (503) [isolated container]", async () => {
  const C = "finansapp-tg-noSecret", PORT = 8093, B = `http://localhost:${PORT}`, repo = process.cwd();
  try { execSync(`docker rm -f ${C}`, { stdio: "ignore" }); } catch {}
  const dd = mkdtempSync(join(tmpdir(), "tg-nosec-"));
  execSync(`docker run -d --name ${C} -p ${PORT}:8090 -v "${repo}/pb/pb_hooks:/pb_hooks" -v "${repo}/pb/pb_migrations:/pb_migrations" -v "${dd}:/pb_data" ghcr.io/muchobien/pocketbase:0.39.10 serve --http=0.0.0.0:8090 --dir=/pb_data --migrationsDir=/pb_migrations --hooksDir=/pb_hooks`, { stdio: "ignore" });
  try {
    let up = false; for (let i = 0; i < 30; i++) { try { if ((await fetch(B + "/api/health")).ok) { up = true; break; } } catch {} await new Promise((s) => setTimeout(s, 1000)); }
    expect(up).toBe(true);
    const ts = Math.floor(Date.now() / 1000), nonce = "nosec-" + crypto.randomBytes(8).toString("hex");
    const headers = signHeaders({ secret: "irrelevant", method: "POST", path: "/api/tg/service/state/get", rawBody: "{}", ts, nonce });
    const res = await fetch(B + "/api/tg/service/state/get", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}" });
    expect(res.status).toBe(503); // FAIL CLOSED (gateway secret yok)
  } finally { try { execSync(`docker rm -f ${C}`, { stdio: "ignore" }); } catch {} }
});
test("TG-A34/TG-R07 secrets/token absent from logs; financial-data marker absent from logs", async () => {
  const a = await authUser(RT.userA); const tg = nextTgid();
  const marker = "FINMARK-" + crypto.randomBytes(8).toString("hex");
  await adminPatch("users", a.id, { data: { note: marker } }); // superuser guard-exempt
  await svc("/api/tg/service/pair-consume", { telegram_user_id: tg, code: await pairCode(a.token) });
  const d = await svc("/api/tg/service/data", { telegram_user_id: tg });
  expect(JSON.stringify(d.json.data || {})).toContain(marker); // data endpoint marker'ı döndürür
  const logs = execSync(`docker logs finansapp-tg-pb 2>&1 | tail -600`).toString();
  for (const s of [RT.gwSecret, RT.pepper, RT.gwPrevSecret, a.token, marker]) expect(logs, `log leak: ${s.slice(0, 6)}…`).not.toContain(s);
});

test("TG-R05b previous pair code deterministically invalidated when new one generated", async () => {
  const a = await authUser(RT.userA);
  const codeA = await pairCode(a.token);
  const codeB = await pairCode(a.token); // B üretimi A'yı geçersiz kılar
  expect((await svc("/api/tg/service/pair-consume", { telegram_user_id: nextTgid(), code: codeA })).status).toBe(400); // A fail
  expect((await svc("/api/tg/service/pair-consume", { telegram_user_id: nextTgid(), code: codeB })).status).toBe(200); // B ok
});

test("TG-R04 retention criteria: terminal/expired selectable; processing NEVER selected", async () => {
  const doneRow = await adminCreate("telegram_updates", { update_id: "rt-done-" + Date.now(), status: "done", completed_at: pastIso() });
  const procRow = await adminCreate("telegram_updates", { update_id: "rt-proc-" + Date.now(), status: "processing" });
  const future = new Date(Date.now() + 86400000).toISOString().replace("T", " ");
  const term = await adminList("telegram_updates", `(status = "done" || status = "failed") && updated < "${future}"`);
  expect(term.some((r) => r.id === doneRow.id)).toBe(true);   // terminal seçilir
  expect(term.some((r) => r.id === procRow.id)).toBe(false);  // processing ASLA
  // expired service_request + pair_code seçilebilir (expires_at ayarlanabilir DateField)
  await adminCreate("telegram_service_requests", { nonce: "rt-" + crypto.randomBytes(6).toString("hex"), endpoint: "x", expires_at: pastIso() });
  const now = new Date().toISOString().replace("T", " ");
  expect((await adminList("telegram_service_requests", `expires_at < "${now}"`)).length).toBeGreaterThan(0);
});

test("TG-R06 UPGRADE migration gate: apply 1735000400 onto DB with prior data → collections created, users/haneler data+revision unchanged, CAS still works", async () => {
  test.setTimeout(120000);
  const C = "finansapp-tg-upgrade", PORT = 8095, B = `http://localhost:${PORT}`, repo = process.cwd();
  const gw = crypto.randomBytes(24).toString("hex"), pep = crypto.randomBytes(24).toString("hex");
  try { execSync(`docker rm -f ${C}`, { stdio: "ignore" }); } catch { /* yok */ }
  const dd = mkdtempSync(join(tmpdir(), "tg-up-"));
  const migBefore = mkdtempSync(join(tmpdir(), "tg-mig-"));
  // Yalnız 1735000000..300 migration'ları (1735000400 HARİÇ) — mevcut prod şeması.
  execSync(`cp ${repo}/pb/pb_migrations/1735000000_users_data.js ${repo}/pb/pb_migrations/1735000100_haneler.js ${repo}/pb/pb_migrations/1735000200_ai_keys.js ${repo}/pb/pb_migrations/1735000300_findata_revision.js ${migBefore}/`, { stdio: "ignore" });
  const run = (mig) => execSync(`docker run -d --name ${C} -p ${PORT}:8090 -e FINANSAPP_CAS_ENFORCE=1 -e TG_GATEWAY_SECRET=${gw} -e TG_PAIRING_PEPPER=${pep} -v "${repo}/pb/pb_hooks:/pb_hooks" -v "${mig}:/pb_migrations" -v "${dd}:/pb_data" ghcr.io/muchobien/pocketbase:0.39.10 serve --http=0.0.0.0:8090 --dir=/pb_data --migrationsDir=/pb_migrations --hooksDir=/pb_hooks`, { stdio: "ignore" });
  const waitHealth = async () => { for (let i = 0; i < 30; i++) { try { if ((await fetch(B + "/api/health")).ok) return true; } catch { /* */ } await new Promise((s) => setTimeout(s, 1000)); } return false; };
  const sign = (path, body) => signHeaders({ secret: gw, method: "POST", path, rawBody: JSON.stringify(body) });
  try {
    run(migBefore);
    expect(await waitHealth()).toBe(true);
    // seed user + CAS write (revision 0→1, data marker)
    await fetch(B + "/api/collections/users/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "up@t.test", password: "uppassword123", passwordConfirm: "uppassword123" }) });
    const auth = await (await fetch(B + "/api/collections/users/auth-with-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: "up@t.test", password: "uppassword123" }) })).json();
    const seed = { note: "UPGRADE-MARK", giderler: [{ id: "g1", miktar: 42 }] };
    const w = await fetch(B + "/api/findata/kaydet", { method: "POST", headers: { Authorization: auth.token, "Content-Type": "application/json" }, body: JSON.stringify({ baseRevision: 0, data: seed }) });
    expect(w.status).toBe(200);
    const before = await (await fetch(B + `/api/collections/users/records/${auth.record.id}`, { headers: { Authorization: auth.token } })).json();
    expect(before.revision).toBe(1);
    // F3: GERÇEK haneler kaydı seed et — data marker + revision + member relation → yükseltme
    // sonrası TAM olarak değişmediğini kanıtla (sadece users değil).
    const hc = await fetch(B + "/api/collections/haneler/records", { method: "POST", headers: { Authorization: auth.token, "Content-Type": "application/json" }, body: JSON.stringify({ kod: "UPHANE", ad: "Up Hane", members: [auth.record.id], data: {} }) });
    expect(hc.ok, "hane create").toBe(true);
    const hane = await hc.json();
    const hseed = { note: "UPGRADE-HANE-MARK", ortak: [{ id: "h1", tutar: 99 }] };
    const hw = await fetch(B + "/api/findata/kaydet", { method: "POST", headers: { Authorization: auth.token, "Content-Type": "application/json" }, body: JSON.stringify({ haneId: hane.id, baseRevision: 0, data: hseed }) });
    expect(hw.status).toBe(200);
    const hbefore = await (await fetch(B + `/api/collections/haneler/records/${hane.id}`, { headers: { Authorization: auth.token } })).json();
    expect(hbefore.revision).toBe(1);
    execSync(`docker rm -f ${C}`, { stdio: "ignore" });

    // UPGRADE: aynı data dir, TAM migrations (1735000400 dahil) → yeni migration uygulanır.
    run(`${repo}/pb/pb_migrations`);
    expect(await waitHealth()).toBe(true);
    const adminPass = "up-adm-" + crypto.randomBytes(8).toString("hex");
    execSync(`docker exec ${C} /usr/local/bin/pocketbase superuser upsert up-admin@t.test ${adminPass} --dir=/pb_data`, { stdio: "ignore" });
    const admTok = (await (await fetch(B + "/api/collections/_superusers/auth-with-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: "up-admin@t.test", password: adminPass }) })).json()).token;
    // 5 tg koleksiyonu var mı
    for (const c of ["telegram_links", "telegram_pair_codes", "telegram_state", "telegram_updates", "telegram_service_requests"]) {
      const r = await fetch(B + `/api/collections/${c}`, { headers: { Authorization: admTok } });
      expect(r.status, `collection ${c} exists`).toBe(200);
    }
    // prior users data/revision EXACT unchanged
    const after = await (await fetch(B + `/api/collections/users/records/${auth.record.id}`, { headers: { Authorization: admTok } })).json();
    expect(after.revision).toBe(before.revision);
    expect(JSON.stringify(after.data)).toBe(JSON.stringify(before.data));
    // prior haneler data/revision EXACT unchanged (F3)
    const hafter = await (await fetch(B + `/api/collections/haneler/records/${hane.id}`, { headers: { Authorization: admTok } })).json();
    expect(hafter.revision).toBe(hbefore.revision);
    expect(JSON.stringify(hafter.data)).toBe(JSON.stringify(hbefore.data));
    // existing CAS endpoint still works — users (revision 1→2) ve haneler (revision 1→2)
    const w2 = await fetch(B + "/api/findata/kaydet", { method: "POST", headers: { Authorization: auth.token, "Content-Type": "application/json" }, body: JSON.stringify({ baseRevision: 1, data: { ...seed, extra: true } }) });
    expect(w2.status).toBe(200);
    expect((await w2.json()).revision).toBe(2);
    const hw2 = await fetch(B + "/api/findata/kaydet", { method: "POST", headers: { Authorization: auth.token, "Content-Type": "application/json" }, body: JSON.stringify({ haneId: hane.id, baseRevision: 1, data: { ...hseed, extra: true } }) });
    expect(hw2.status).toBe(200);
    expect((await hw2.json()).revision).toBe(2);
  } finally { try { execSync(`docker rm -f ${C}`, { stdio: "ignore" }); } catch { /* */ } }
});
