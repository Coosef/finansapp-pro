// Kalp atışı — her başarılı poll turunda dosyaya zaman damgası yazılır. Docker HEALTHCHECK
// (health-check.js) dosyanın tazeliğine bakar. Böylece AÇIK PORT olmadan sağlık izlenir.
import { writeFileSync } from "node:fs";

export function kalpAtisiYaz(file) {
  try { writeFileSync(file, String(Date.now())); } catch { /* healthcheck bayat okur → görünür */ }
}
