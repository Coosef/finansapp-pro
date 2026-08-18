import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PB, BASE_FINDATA } from "./helpers.mjs";

// PB sürümü production ile BİREBİR pinli (0.39.10); repo hooks/migrations mount edilir
// (finansapp-pb container tanımının reuse'u). Throwaway data dir, run sonunda silinir.
const PB_IMAGE = "ghcr.io/muchobien/pocketbase:0.39.10";
const CONTAINER = "finansapp-e2e-pb";

export default async function globalSetup() {
  const repo = process.cwd();
  try { execSync(`docker rm -f ${CONTAINER}`, { stdio: "ignore" }); } catch { /* yoktu */ }
  const dataDir = mkdtempSync(join(tmpdir(), "fa-e2e-pb-"));
  writeFileSync(join(repo, "e2e", ".pb-datadir"), dataDir);
  execSync(
    `docker run -d --name ${CONTAINER} -p 8090:8090 ` +
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
  await fetch(PB.base + `/api/collections/users/records/${auth.record.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: auth.token },
    body: JSON.stringify({ data: BASE_FINDATA }),
  });
  console.log("[e2e] PocketBase 0.39.10 hazır + fixture user seed edildi");
}
