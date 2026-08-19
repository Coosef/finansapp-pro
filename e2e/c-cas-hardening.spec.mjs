// CAS hardening — C1/C4–C8 backend garantileri (concurrency + controlled retry + guard
// bypass + spoof + cross-user + household authz). Browser YOK; throwaway PB'ye node fetch.
import { test, expect } from "@playwright/test";
import { pbAuth, PB, BASE_FINDATA } from "./helpers.mjs";

const H = (token) => ({ "Content-Type": "application/json", Authorization: token });
async function json(res) { try { return await res.json(); } catch { return null; } }
async function register(email, password) {
  await fetch(PB.base + "/api/collections/users/records", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, passwordConfirm: password }),
  }).catch(() => {});
}
async function authAs(email, password) {
  const r = await json(await fetch(PB.base + "/api/collections/users/auth-with-password", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password }),
  }));
  return { token: r.token, userId: r.record.id };
}
const readUser = (token, userId) => fetch(PB.base + `/api/collections/users/records/${userId}`, { headers: { Authorization: token } }).then(json);
const readHane = (token, haneId) => fetch(PB.base + `/api/collections/haneler/records/${haneId}`, { headers: { Authorization: token } }).then(json);
const casPost = (token, body) => fetch(PB.base + "/api/findata/kaydet", { method: "POST", headers: H(token), body: JSON.stringify(body) });
let _k = 0;
const uniqKod = (p) => (p + Date.now().toString(36) + _k++).toUpperCase().slice(0, 12);
async function createHane(token, userId, data) {
  return json(await fetch(PB.base + "/api/collections/haneler/records", {
    method: "POST", headers: H(token),
    body: JSON.stringify({ kod: uniqKod("H"), ad: "CAS Hane", data, members: [userId] }),
  }));
}

// ---- C1: two-device CAS — stale base 409 → re-read + reconcile; lost-update YOK ----
test("C1 — two-device CAS: stale base 409 → re-read reconcile, lost-update yok", async () => {
  const { token, userId } = await pbAuth();
  const rec0 = await readUser(token, userId);
  const base = rec0.revision || 0;

  // Cihaz A: güncel base ile yazar → success (rev+1)
  const a = await casPost(token, { baseRevision: base, data: { ...(rec0.data || {}), A: 1 } });
  expect(a.status).toBe(200);
  expect((await json(a)).revision).toBe(base + 1);

  // Cihaz B: ESKİ base ile yazmaya çalışır → 409 (A'nın yazısını kör EZMEZ)
  const b1 = await casPost(token, { baseRevision: base, data: { ...(rec0.data || {}), B: 1 } });
  expect(b1.status).toBe(409);
  expect((await json(b1)).revision).toBe(base + 1); // server güncel revision'ı döner

  // Cihaz B: taze state oku → A'yı koruyarak reconcile + yeni base ile yaz → success (rev+2)
  const fresh = await readUser(token, userId);
  const b2 = await casPost(token, { baseRevision: fresh.revision, data: { ...(fresh.data || {}), B: 1 } });
  expect(b2.status).toBe(200);
  expect((await json(b2)).revision).toBe(base + 2);

  // Lost-update YOK: hem A hem B kalıcı
  const final = await readUser(token, userId);
  expect(final.data.A).toBe(1);
  expect(final.data.B).toBe(1);
  expect(final.revision).toBe(base + 2);
});

// ---- C4: controlled retry — kör retry (aynı base) hep 409; yalnız taze base save geçer ----
test("C4 — controlled retry: aynı base kör retry hep 409, yalnız taze base geçer", async () => {
  const { token, userId } = await pbAuth();
  const rec0 = await readUser(token, userId);
  const base = rec0.revision || 0;

  expect((await casPost(token, { baseRevision: base, data: { ...(rec0.data || {}), c4: "v1" } })).status).toBe(200);
  // Kör retry: AYNI (artık stale) base ile → 409; tekrar → yine 409 (kör retry ASLA geçmez)
  expect((await casPost(token, { baseRevision: base, data: { ...(rec0.data || {}), c4: "v2" } })).status).toBe(409);
  expect((await casPost(token, { baseRevision: base, data: { ...(rec0.data || {}), c4: "v2" } })).status).toBe(409);
  // Controlled: taze base oku → save → success (rev+2), veri v2
  const fresh = await readUser(token, userId);
  expect((await casPost(token, { baseRevision: fresh.revision, data: { ...(fresh.data || {}), c4: "v2" } })).status).toBe(200);
  const final = await readUser(token, userId);
  expect(final.data.c4).toBe("v2");
  expect(final.revision).toBe(base + 2);
});

// ---- C5: generic PATCH bypass forbidden — users+haneler data/revision → 403 (guard); CAS → 200 ----
test("C5 — generic PATCH data/revision forbidden (users+haneler), CAS allowed", async () => {
  const { token, userId } = await pbAuth();
  // users generic PATCH data → 403 (guard mesajı CAS'e yönlendirir)
  const ud = await fetch(PB.base + `/api/collections/users/records/${userId}`, { method: "PATCH", headers: H(token), body: JSON.stringify({ data: { hack: 1 } }) });
  expect(ud.status).toBe(403);
  expect((await json(ud)).message || "").toContain("CAS");
  // users generic PATCH revision → 403
  expect((await fetch(PB.base + `/api/collections/users/records/${userId}`, { method: "PATCH", headers: H(token), body: JSON.stringify({ revision: 999 }) })).status).toBe(403);
  // CAS endpoint → 200
  const fresh = await readUser(token, userId);
  expect((await casPost(token, { baseRevision: fresh.revision, data: { ...(fresh.data || {}), c5: 1 } })).status).toBe(200);

  // haneler: DEDICATED owner (fixture'ı hane üyesi YAPMA → sonraki browser testleri kişisel kalır).
  await register("c5h@finansapp.test", "c5password123");
  const owner = await authAs("c5h@finansapp.test", "c5password123");
  const hane = await createHane(owner.token, owner.userId, BASE_FINDATA);
  expect((await fetch(PB.base + `/api/collections/haneler/records/${hane.id}`, { method: "PATCH", headers: H(owner.token), body: JSON.stringify({ data: { hack: 1 } }) })).status).toBe(403);
  expect((await fetch(PB.base + `/api/collections/haneler/records/${hane.id}`, { method: "PATCH", headers: H(owner.token), body: JSON.stringify({ revision: 999 }) })).status).toBe(403);
  expect((await casPost(owner.token, { haneId: hane.id, baseRevision: hane.revision || 0, data: { ...BASE_FINDATA, c5h: 1 } })).status).toBe(200);
});

// ---- C6: invalid/spoof revision — geçersiz base 400; spoof base 409; body.revision yok sayılır ----
test("C6 — invalid/spoof revision reddedilir; revision server-owned", async () => {
  const { token, userId } = await pbAuth();
  const rec0 = await readUser(token, userId);
  const base = rec0.revision || 0;

  // Geçersiz baseRevision → 400
  expect((await casPost(token, { baseRevision: "5", data: { x: 1 } })).status).toBe(400);
  expect((await casPost(token, { baseRevision: -1, data: { x: 1 } })).status).toBe(400);
  // Spoofed yüksek base (server'da yok) → 409 (zorla yazamaz)
  expect((await casPost(token, { baseRevision: base + 9999, data: { x: 1 } })).status).toBe(409);
  // body.revision SPOOF → server yok sayar; revision yalnız cur+1 (client kontrol EDEMEZ)
  expect((await casPost(token, { baseRevision: base, revision: 999999, data: { ...(rec0.data || {}), c6: 1 } })).status).toBe(200);
  const final = await readUser(token, userId);
  expect(final.revision).toBe(base + 1); // 999999 DEĞİL — server-owned +1
});

// ---- C7: cross-user isolation — A'nın yazısı B'yi etkilemez; A B'yi yazamaz ----
test("C7 — cross-user isolation: A B'nin verisini yazamaz/etkilemez", async () => {
  const aEmail = "c7a@finansapp.test", aPass = "c7password123";
  const bEmail = "c7b@finansapp.test", bPass = "c7passwordB123";
  await register(aEmail, aPass); await register(bEmail, bPass);
  const A = await authAs(aEmail, aPass);
  const B = await authAs(bEmail, bPass);

  const b0 = await readUser(B.token, B.userId);
  const bBase = b0.revision || 0;
  // A CAS yazar → endpoint users/{auth.id} yazar; yalnız A değişir
  const aFresh = await readUser(A.token, A.userId);
  expect((await casPost(A.token, { baseRevision: aFresh.revision || 0, data: { onlyA: 1 } })).status).toBe(200);
  expect((await readUser(B.token, B.userId)).revision).toBe(bBase); // B değişmedi
  // A, B'nin kaydını generic PATCH edemez → 403 (guard) veya 404 (rule)
  const cross = await fetch(PB.base + `/api/collections/users/records/${B.userId}`, { method: "PATCH", headers: H(A.token), body: JSON.stringify({ data: { hack: 1 } }) });
  expect([403, 404]).toContain(cross.status);
  expect((await readUser(B.token, B.userId)).revision).toBe(bBase); // B hâlâ değişmedi
});

// ---- C8: household authz — üye CAS yazar; üye-olmayan 403 (server verisini değiştiremez) ----
// DEDICATED owner + non-member (fixture'ı hane üyesi YAPMA → izolasyon korunur).
test("C8 — household authz: üye CAS yazar, üye-olmayan reddedilir", async () => {
  await register("c8owner@finansapp.test", "c8password123");
  const owner = await authAs("c8owner@finansapp.test", "c8password123");
  await register("c8nm@finansapp.test", "c8password123");
  const NM = await authAs("c8nm@finansapp.test", "c8password123");

  const hane = await createHane(owner.token, owner.userId, BASE_FINDATA);
  // Üye CAS → 200
  expect((await casPost(owner.token, { haneId: hane.id, baseRevision: hane.revision || 0, data: { ...BASE_FINDATA, m: 1 } })).status).toBe(200);
  // Üye-olmayan CAS → 403
  expect((await casPost(NM.token, { haneId: hane.id, baseRevision: 0, data: { ...BASE_FINDATA, hack: 1 } })).status).toBe(403);
  // Üye-olmayan hane verisini DEĞİŞTİREMEDİ (m:1 duruyor, hack yok)
  const after = await readHane(owner.token, hane.id);
  expect(after.data.m).toBe(1);
  expect(after.data.hack).toBeUndefined();
});
