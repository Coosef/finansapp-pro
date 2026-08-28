// ============================================================
// FinansApp Telegram Finance Gateway (T1B) — giriş noktası.
// Outbound-only long-poll; webhook/açık port YOK. HMAC ile PB T1A endpoint'leri. READ-ONLY.
// R3 preflight fail-closed · R12 graceful shutdown (AbortController) · R13 event-loop heartbeat
// · R4 bounded backoff. Token/secret ASLA loglanmaz.
// ============================================================
import { yapilandir } from "./config.js";
import { pbIstemci } from "./pb.js";
import { tgIstemci } from "./telegram.js";
import { runLoop } from "./loop.js";
import { preflightBekle } from "./startup.js";
import { kalpAtisiBaslat } from "./health.js";
import { makeBackoff } from "./backoff.js";

function log(msg) { console.log(`[tg-gateway] ${msg}`); }

async function main() {
  const cfg = yapilandir(); // eksik/uretim-drift config → fail-closed throw
  const ac = new AbortController(); // R12 shutdown signal
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { log(`${sig} alındı → kapanıyor`); ac.abort(new Error("shutdown")); });

  const pb = pbIstemci({ pbUrl: cfg.pbUrl, gwSecret: cfg.gwSecret, pbTimeoutMs: cfg.pbTimeoutMs, signal: ac.signal });
  const tg = tgIstemci({ apiBase: cfg.tgApiBase, botToken: cfg.botToken });

  // F4: abort-uyanır uyku — shutdown sinyali backoff beklemesini DERHAL keser (startup + runtime).
  const uyku = (ms) => new Promise((res) => {
    const t = setTimeout(res, ms);
    ac.signal.addEventListener("abort", () => { clearTimeout(t); res(); }, { once: true });
  });
  const backoff = makeBackoff({ sleep: uyku });

  // R3/F4: PREFLIGHT — healthy heartbeat YAZMADAN önce. Geçici (ağ/5xx/429) → bounded backoff ile
  // tekrar (süreç ayakta); FatalConfig (token/HMAC/config/webhook-conflict) → fail-closed exit.
  log(`preflight · build ${cfg.buildSha} · PB ${cfg.pbUrl}`);
  try {
    const tamam = await preflightBekle({ pb, tg, signal: ac.signal, backoff, log });
    if (!tamam) { log("kapanış sinyali (preflight sırasında) → temiz çıkış"); process.exit(0); }
  } catch (e) {
    console.error(`[tg-gateway] preflight fail-closed: ${e.message}`); // token/secret İÇERMEZ
    process.exit(1);
  }
  log("preflight OK → long-poll başlıyor (read-only)");

  const durdurKalp = kalpAtisiBaslat(cfg.heartbeatFile); // R13: preflight SONRASI event-loop heartbeat
  backoff.reset(); // startup denemeleri runtime backoff'unu şişirmesin
  try {
    await runLoop({ pb, tg, log, backoff, signal: ac.signal, pollTimeout: cfg.pollTimeout, pollLimit: cfg.pollLimit, dur: () => ac.signal.aborted });
    durdurKalp();
    log("döngü durdu (temiz çıkış)");
    process.exit(0);
  } catch (e) {
    durdurKalp();
    console.error(`[tg-gateway] ölümcül (fail-closed): ${e.message}`); // mid-run FatalConfigError → exit
    process.exit(1);
  }
}

main().catch((e) => { console.error(`[tg-gateway] ölümcül: ${e.message}`); process.exit(1); });
