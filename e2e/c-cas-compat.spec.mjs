// CAS rollout COMPATIBILITY modu — guard feature-gate (FINANSAPP_CAS_ENFORCE) KAPALI (default).
// Kendi throwaway PB'sini (port 8092) yönetir; ana suite'in enforce'lu PB'sinden (8090) izole.
// Doğrular: enforce kapalıyken legacy generic PATCH data GEÇER (eski frontend kırılmaz) VE
// CAS endpoint çalışır. Enforce modu (generic PATCH 403 + CAS) ana suite C5 ile kanıtlanır.
import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PB_IMAGE = "ghcr.io/muchobien/pocketbase:0.39.10";
const CONTAINER = "finansapp-e2e-compat-pb";
const BASE = "http://localhost:8092";
const EMAIL = "compat@finansapp.test", PASS = "compatpassword123";
const H = (t) => ({ "Content-Type": "application/json", Authorization: t });
const jsonOf = async (r) => { try { return await r.json(); } catch { return null; } };

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  try { execSync(`docker rm -f ${CONTAINER}`, { stdio: "ignore" }); } catch { /* yoktu */ }
  const dataDir = mkdtempSync(join(tmpdir(), "fa-compat-pb-"));
  const repo = process.cwd();
  // FINANSAPP_CAS_ENFORCE VERİLMEZ → guard default KAPALI (compatibility).
  execSync(
    `docker run -d --name ${CONTAINER} -p 8092:8090 ` +
      `-v "${repo}/pb/pb_hooks:/pb_hooks" -v "${repo}/pb/pb_migrations:/pb_migrations" -v "${dataDir}:/pb_data" ` +
      `${PB_IMAGE} serve --http=0.0.0.0:8090 --dir=/pb_data --migrationsDir=/pb_migrations --hooksDir=/pb_hooks`,
    { stdio: "ignore" }
  );
  let ok = false;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(BASE + "/api/health"); if (r.ok) { ok = true; break; } } catch { /* bekle */ }
    await new Promise((s) => setTimeout(s, 1000));
  }
  if (!ok) throw new Error("[compat] PB health timeout");
  await fetch(BASE + "/api/collections/users/records", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASS, passwordConfirm: PASS }),
  }).catch(() => {});
});

test.afterAll(() => { try { execSync(`docker rm -f ${CONTAINER}`, { stdio: "ignore" }); } catch { /* yoksay */ } });

test("compat — enforce kapalı: legacy generic PATCH data GEÇER + CAS çalışır", async () => {
  const auth = await jsonOf(await fetch(BASE + "/api/collections/users/auth-with-password", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: EMAIL, password: PASS }),
  }));
  const uid = auth.record.id, tok = auth.token;

  // Legacy generic PATCH data → 200 (compatibility: eski frontend write'ları KIRILMAZ)
  const legacy = await fetch(BASE + `/api/collections/users/records/${uid}`, {
    method: "PATCH", headers: H(tok), body: JSON.stringify({ data: { legacy: 1 } }),
  });
  expect(legacy.status).toBe(200);
  const afterLegacy = await jsonOf(await fetch(BASE + `/api/collections/users/records/${uid}`, { headers: { Authorization: tok } }));
  expect(afterLegacy.data.legacy).toBe(1); // legacy PATCH gerçekten yazdı

  // CAS endpoint aynı anda çalışır → 200, revision ilerler
  const base = afterLegacy.revision || 0;
  const cas = await fetch(BASE + "/api/findata/kaydet", {
    method: "POST", headers: H(tok), body: JSON.stringify({ baseRevision: base, data: { legacy: 1, cas: 1 } }),
  });
  expect(cas.status).toBe(200);
  expect((await jsonOf(cas)).revision).toBe(base + 1);
  const afterCas = await jsonOf(await fetch(BASE + `/api/collections/users/records/${uid}`, { headers: { Authorization: tok } }));
  expect(afterCas.data.cas).toBe(1);
  expect(afterCas.revision).toBe(base + 1);
});
