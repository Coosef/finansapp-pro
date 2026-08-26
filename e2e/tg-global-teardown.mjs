import { execSync } from "node:child_process";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const CONTAINER = "finansapp-tg-pb";

export default async function globalTeardown() {
  const repo = process.cwd();
  try { execSync(`docker rm -f ${CONTAINER}`, { stdio: "ignore" }); } catch { /* yoktu */ }
  for (const f of [".tg-datadir", ".tg-runtime.json"]) {
    const p = join(repo, "e2e", f);
    try {
      if (f === ".tg-datadir" && existsSync(p)) { const dir = readFileSync(p, "utf8").trim(); if (dir) rmSync(dir, { recursive: true, force: true }); }
      if (existsSync(p)) rmSync(p, { force: true });
    } catch { /* yoksay */ }
  }
}
