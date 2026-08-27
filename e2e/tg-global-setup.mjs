import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import crypto from "node:crypto";

// Telegram T1A E2E — izole throwaway PocketBase (prod ile aynı 0.39.10) + TG secret'ları.
// Secret'lar RUNTIME'da üretilir (crypto.randomBytes) → source/committed'a asla yazılmaz;
// gitignored e2e/.tg-runtime.json'a yazılır (teardown + test okur).
const PB_IMAGE = "ghcr.io/muchobien/pocketbase:0.39.10";
const CONTAINER = "finansapp-tg-pb";
const PORT = 8090;
const BASE = `http://localhost:${PORT}`;

export default async function globalSetup() {
  const repo = process.cwd();
  const rnd = (n) => crypto.randomBytes(n).toString("hex");
  const runtime = {
    base: BASE,
    gwSecret: rnd(24),
    gwPrevSecret: rnd(24),
    pepper: rnd(24),
    userA: { email: "tg-a@finansapp.test", password: "tgpasswordA123" },
    userB: { email: "tg-b@finansapp.test", password: "tgpasswordB123" },
    admin: { email: "tg-admin@finansapp.test", password: "adm-" + rnd(12) }, // runtime-random (committed credential yok)
  };

  try { execSync(`docker rm -f ${CONTAINER}`, { stdio: "ignore" }); } catch { /* yoktu */ }
  const dataDir = mkdtempSync(join(tmpdir(), "fa-tg-pb-"));
  writeFileSync(join(repo, "e2e", ".tg-datadir"), dataDir);

  // ENFORCE=1 (mevcut CAS aynen), + TG gateway/pairing secret'ları. PB dış port container-içi 8090.
  execSync(
    `docker run -d --name ${CONTAINER} -p ${PORT}:8090 ` +
      `-e FINANSAPP_CAS_ENFORCE=1 ` +
      `-e TG_GATEWAY_SECRET=${runtime.gwSecret} ` +
      `-e TG_GATEWAY_SECRET_PREV=${runtime.gwPrevSecret} ` +
      `-e TG_PAIRING_PEPPER=${runtime.pepper} ` +
      `-v "${repo}/pb/pb_hooks:/pb_hooks" -v "${repo}/pb/pb_migrations:/pb_migrations" -v "${dataDir}:/pb_data" ` +
      `${PB_IMAGE} serve --http=0.0.0.0:8090 --dir=/pb_data --migrationsDir=/pb_migrations --hooksDir=/pb_hooks`,
    { stdio: "ignore" }
  );

  let ok = false;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(BASE + "/api/health"); if (r.ok) { ok = true; break; } } catch { /* bekle */ }
    await new Promise((s) => setTimeout(s, 1000));
  }
  if (!ok) throw new Error("[tg-e2e] PocketBase health timeout");

  // Superuser (DB-state doğrulaması için; PB'de rules'u bypass eder).
  try { execSync(`docker exec ${CONTAINER} /usr/local/bin/pocketbase superuser upsert ${runtime.admin.email} ${runtime.admin.password} --dir=/pb_data`, { stdio: "ignore" }); } catch { /* geç */ }

  // Fixture user A + B (açık signup).
  for (const u of [runtime.userA, runtime.userB]) {
    await fetch(BASE + "/api/collections/users/records", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: u.email, password: u.password, passwordConfirm: u.password }),
    }).catch(() => {});
  }

  writeFileSync(join(repo, "e2e", ".tg-runtime.json"), JSON.stringify(runtime));
  console.log("[tg-e2e] PocketBase 0.39.10 hazır + TG secret'lar (runtime) + fixture A/B seed edildi");
}
