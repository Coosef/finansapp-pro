import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import crypto from "node:crypto";

// T2B (Telegram AI) E2E — T1A suite'inden AYRI izole PocketBase. Fark: fake AI upstream'e
// yönlendirme (TG_AI_TEST_UPSTREAM) + kısa upstream timeout knob'ı + ANTHROPIC_API_KEY env'i
// (env fallback'in Telegram AI'da KULLANILMADIĞINI ispatlamak için bilerek TANIMLI bırakılır).
const PB_IMAGE = "ghcr.io/muchobien/pocketbase:0.39.10";
const CONTAINER = "finansapp-t2b-pb";
const PORT = 8092;
const BASE = `http://localhost:${PORT}`;
export const FAKE_AI_PORT = 8797;

export default async function globalSetup() {
  const repo = process.cwd();
  const rnd = (n) => crypto.randomBytes(n).toString("hex");
  const runtime = {
    base: BASE,
    gwSecret: rnd(24),
    pepper: rnd(24),
    fakeAiPort: FAKE_AI_PORT,
    // Bilerek TANIMLI: Telegram AI bu env'i ASLA kullanmamalı (AI-T2-10B).
    envAnthropicKey: "env-key-" + rnd(8),
    userA: { email: "t2b-a@finansapp.test", password: "t2bpasswordA123" },
    userB: { email: "t2b-b@finansapp.test", password: "t2bpasswordB123" },
    admin: { email: "t2b-admin@finansapp.test", password: "adm-" + rnd(12) },
  };

  try { execSync(`docker rm -f ${CONTAINER}`, { stdio: "ignore" }); } catch { /* yoktu */ }
  const dataDir = mkdtempSync(join(tmpdir(), "fa-t2b-pb-"));
  writeFileSync(join(repo, "e2e", ".t2b-datadir"), dataDir);

  execSync(
    `docker run -d --name ${CONTAINER} -p ${PORT}:8090 ` +
      `--add-host=host.docker.internal:host-gateway ` +
      `-e FINANSAPP_CAS_ENFORCE=1 ` +
      `-e TG_GATEWAY_SECRET=${runtime.gwSecret} ` +
      `-e TG_PAIRING_PEPPER=${runtime.pepper} ` +
      `-e ANTHROPIC_API_KEY=${runtime.envAnthropicKey} ` +
      `-e TG_AI_TEST_UPSTREAM=http://host.docker.internal:${FAKE_AI_PORT} ` +
      `-e TG_AI_TEST_TIMEOUT_SN=3 ` +
      `-v "${repo}/pb/pb_hooks:/pb_hooks" -v "${repo}/pb/pb_migrations:/pb_migrations" -v "${dataDir}:/pb_data" ` +
      `${PB_IMAGE} serve --http=0.0.0.0:8090 --dir=/pb_data --migrationsDir=/pb_migrations --hooksDir=/pb_hooks`,
    { stdio: "ignore" }
  );

  let ok = false;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(BASE + "/api/health"); if (r.ok) { ok = true; break; } } catch { /* bekle */ }
    await new Promise((s) => setTimeout(s, 1000));
  }
  if (!ok) throw new Error("[t2b-e2e] PocketBase health timeout");

  try { execSync(`docker exec ${CONTAINER} /usr/local/bin/pocketbase superuser upsert ${runtime.admin.email} ${runtime.admin.password} --dir=/pb_data`, { stdio: "ignore" }); } catch { /* geç */ }

  for (const u of [runtime.userA, runtime.userB]) {
    await fetch(BASE + "/api/collections/users/records", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: u.email, password: u.password, passwordConfirm: u.password }),
    }).catch(() => {});
  }

  writeFileSync(join(repo, "e2e", ".t2b-runtime.json"), JSON.stringify(runtime));
  console.log("[t2b-e2e] PocketBase 0.39.10 + T2B AI şeması hazır (fake upstream :" + FAKE_AI_PORT + ")");
}
