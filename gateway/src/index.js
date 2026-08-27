// ============================================================
// FinansApp Telegram Finance Gateway (T1B) — giriş noktası.
// Outbound-only long-poll; webhook/açık port YOK. HMAC ile PB T1A endpoint'leri.
// READ-ONLY: finansal yazma yok. Token/secret ASLA loglanmaz.
// ============================================================
import { yapilandir } from "./config.js";
import { pbIstemci } from "./pb.js";
import { tgIstemci } from "./telegram.js";
import { runLoop } from "./loop.js";
import { kalpAtisiYaz } from "./health.js";

function log(msg) { console.log(`[tg-gateway] ${msg}`); } // yalnız güvenli metin

async function main() {
  const cfg = yapilandir(); // eksik zorunlu değer → fail-closed throw
  log(`başlıyor · build ${cfg.buildSha} · PB ${cfg.pbUrl} · poll ${cfg.pollTimeout}s (read-only)`);
  const pb = pbIstemci({ pbUrl: cfg.pbUrl, gwSecret: cfg.gwSecret, pbTimeoutMs: cfg.pbTimeoutMs });
  const tg = tgIstemci({ apiBase: cfg.tgApiBase, botToken: cfg.botToken });

  const durum = { dur: false };
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { log(`${sig} alındı → kapanıyor`); durum.dur = true; });

  kalpAtisiYaz(cfg.heartbeatFile); // ilk atış: healthcheck başlangıçta geçsin
  await runLoop({
    pb, tg, log,
    pollTimeout: cfg.pollTimeout, pollLimit: cfg.pollLimit, poisonMax: cfg.poisonMax,
    kalpAtisi: () => kalpAtisiYaz(cfg.heartbeatFile),
    dur: () => durum.dur,
  });
  log("döngü durdu");
}

main().catch((e) => { console.error(`[tg-gateway] ölümcül: ${e.message}`); process.exit(1); });
