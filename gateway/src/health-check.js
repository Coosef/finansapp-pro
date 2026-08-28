// Docker HEALTHCHECK giriş noktası — açık port YOK, kalp atışı dosyasının tazeliğini denetler.
// Taze (yaş ≤ HEARTBEAT_MAX_MS) → exit 0 (healthy); bayat/okunamaz → exit 1 (unhealthy).
import { readFileSync } from "node:fs";

const file = process.env.HEARTBEAT_FILE || "/tmp/tg-gateway-heartbeat";
const maxYasMs = parseInt(process.env.HEARTBEAT_MAX_MS || "", 10) || 90000; // poll ~25s → 90s tolerans

try {
  const t = parseInt(String(readFileSync(file, "utf8")).trim(), 10);
  const yas = Date.now() - t;
  if (Number.isFinite(t) && yas >= 0 && yas <= maxYasMs) process.exit(0);
  console.error(`heartbeat bayat: ${yas}ms > ${maxYasMs}ms`);
  process.exit(1);
} catch (e) {
  console.error(`heartbeat okunamadı: ${e.message}`);
  process.exit(1);
}
