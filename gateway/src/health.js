// Kalp atışı / liveness (R13). Docker HEALTHCHECK (health-check.js) dosya tazeliğine bakar →
// AÇIK PORT olmadan sağlık. Liveness = EVENT LOOP canlı mı; Telegram/PB erişilebilirliğinden
// BAĞIMSIZ. Backoff/outage sırasında timer çalışmaya devam eder (healthy kalır); event loop
// takılırsa timer duraklar → stale → unhealthy. Gerçek stall gizlenmez.
import { writeFileSync } from "node:fs";

export function kalpAtisiYaz(file) {
  try { writeFileSync(file, String(Date.now())); } catch { /* stale okunur → görünür */ }
}

// Event-loop tabanlı heartbeat timer'ı başlat. unref → süreç çıkışını engellemez. Durdurucu döner.
export function kalpAtisiBaslat(file, aralikMs = 10000) {
  kalpAtisiYaz(file);
  const timer = setInterval(() => kalpAtisiYaz(file), aralikMs);
  if (timer.unref) timer.unref();
  return () => clearInterval(timer);
}
