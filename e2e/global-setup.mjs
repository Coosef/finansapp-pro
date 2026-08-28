import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import crypto from "node:crypto";
import { PB, BASE_FINDATA, casKaydet } from "./helpers.mjs";

// PB sürümü production ile BİREBİR pinli (0.39.10); repo hooks/migrations mount edilir
// (finansapp-pb container tanımının reuse'u). Throwaway data dir, run sonunda silinir.
const PB_IMAGE = "ghcr.io/muchobien/pocketbase:0.39.10";
const CONTAINER = "finansapp-e2e-pb";

export default async function globalSetup() {
  const repo = process.cwd();
  try { execSync(`docker rm -f ${CONTAINER}`, { stdio: "ignore" }); } catch { /* yoktu */ }
  const dataDir = mkdtempSync(join(tmpdir(), "fa-e2e-pb-"));
  writeFileSync(join(repo, "e2e", ".pb-datadir"), dataDir);
  // T1C: Telegram browser akışı (pair-code) için TG secret'ları gerekir. RUNTIME'da üretilir
  // (crypto.randomBytes) → kaynağa/commit'e ASLA yazılmaz; gitignored .t1c-runtime.json'a yazılır
  // (t-telegram.spec gateway'i taklit ederken service HMAC'i buradan okur).
  const tg = { gwSecret: crypto.randomBytes(24).toString("hex"), pepper: crypto.randomBytes(24).toString("hex") };
  writeFileSync(join(repo, "e2e", ".t1c-runtime.json"), JSON.stringify(tg));
  // Ana suite ENFORCE modunda koşar (guard aktif): C5 generic-PATCH-403 + seeder'lar CAS.
  // Compatibility modu (enforce kapalı) ayrı bir throwaway PB ile c-cas-compat.spec test eder.
  execSync(
    `docker run -d --name ${CONTAINER} -p 8090:8090 -e FINANSAPP_CAS_ENFORCE=1 ` +
      `-e TG_GATEWAY_SECRET=${tg.gwSecret} -e TG_PAIRING_PEPPER=${tg.pepper} ` +
      `-v "${repo}/pb/pb_hooks:/pb_hooks" -v "${repo}/pb/pb_migrations:/pb_migrations" -v "${dataDir}:/pb_data" ` +
      `${PB_IMAGE} serve --http=0.0.0.0:8090 --dir=/pb_data --migrationsDir=/pb_migrations --hooksDir=/pb_hooks`,
    { stdio: "ignore" }
  );
  let ok = false;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(PB.base + "/api/health"); if (r.ok) { ok = true; break; } } catch { /* bekle */ }
    await new Promise((s) => setTimeout(s, 1000));
  }
  if (!ok) throw new Error("[e2e] PocketBase health timeout");
  // Fixture user (idempotent) + base findata (onboarding'i atlamak için).
  await fetch(PB.base + "/api/collections/users/records", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: PB.email, password: PB.password, passwordConfirm: PB.password }),
  }).catch(() => {});
  const auth = await (await fetch(PB.base + "/api/collections/users/auth-with-password", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: PB.email, password: PB.password }),
  })).json();
  // Seed generic PATCH data GUARD tarafından 403'lenir → atomik CAS endpoint'i ile yaz
  // (yeni kullanıcı: revision null→0, base 0 eşleşir).
  await casKaydet(PB.base, auth.token, auth.record.id, BASE_FINDATA);
  console.log("[e2e] PocketBase 0.39.10 hazır + fixture user seed edildi (CAS)");
}
