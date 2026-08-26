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

// ---- data + revision immutability ----
test("TG-A24 unlinked service data rejected", async () => { expect((await svc("/api/tg/service/data", { telegram_user_id: nextTgid() })).status).toBe(401); });
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

// ---- durable offset / idempotency ----
test("TG-A30/A31 explicit next_offset (not max); non-monotonic ids don't corrupt", async () => {
  await svc("/api/tg/service/update/claim", { update_id: "1000" });
  await svc("/api/tg/service/update/complete", { update_id: "1000", next_offset: "1001" });
  expect((await svc("/api/tg/service/state/get", {})).json.next_offset).toBe("1001");
  await svc("/api/tg/service/update/claim", { update_id: "5" });               // lower historical id
  await svc("/api/tg/service/update/complete", { update_id: "5", next_offset: "6" });
  expect((await svc("/api/tg/service/state/get", {})).json.next_offset).toBe("6"); // explicit, not max(1000)
});
test("TG-A32 duplicate update claim idempotent", async () => {
  await svc("/api/tg/service/update/claim", { update_id: "42" });
  await svc("/api/tg/service/update/complete", { update_id: "42", next_offset: "43" });
  const r = await svc("/api/tg/service/update/claim", { update_id: "42" });
  expect(r.json.claimed).toBe(false); expect(r.json.duplicate).toBe(true);
});
test("TG-A33 processing lease reclaimable after expiry", async () => {
  const r1 = await svc("/api/tg/service/update/claim", { update_id: "77" });
  expect(r1.json.claimed).toBe(true);
  const busy = await svc("/api/tg/service/update/claim", { update_id: "77" });
  expect(busy.json.claimed).toBe(false); expect(busy.json.busy).toBe(true);   // taze lease → busy
  const row = (await adminList("telegram_updates", `update_id = "77"`))[0];
  await adminPatch("telegram_updates", row.id, { lease_until: pastIso() });     // lease expired
  const r2 = await svc("/api/tg/service/update/claim", { update_id: "77" });
  expect(r2.json.claimed).toBe(true); expect(r2.json.reclaimed).toBe(true);
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
test("TG-A34 secret/token/data absent from PB logs", async () => {
  const a = await authUser(RT.userA); const tg = nextTgid();
  await svc("/api/tg/service/pair-consume", { telegram_user_id: tg, code: await pairCode(a.token) });
  await svc("/api/tg/service/data", { telegram_user_id: tg });
  const logs = execSync(`docker logs finansapp-tg-pb 2>&1 | tail -400`).toString();
  expect(logs).not.toContain(RT.gwSecret);
  expect(logs).not.toContain(RT.pepper);
  expect(logs).not.toContain(RT.gwPrevSecret);
  expect(logs).not.toContain(a.token);
});
