import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export default async function globalTeardown() {
  try { execSync("docker rm -f finansapp-e2e-pb", { stdio: "ignore" }); } catch { /* yoktu */ }
  try {
    const dir = readFileSync(join(process.cwd(), "e2e", ".pb-datadir"), "utf8").trim();
    if (dir && dir.includes("fa-e2e-pb-")) rmSync(dir, { recursive: true, force: true });
  } catch { /* yoksay */ }
}
