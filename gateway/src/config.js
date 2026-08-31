// ============================================================
// Gateway yapılandırması — env (+ *_FILE). Gizli değerler için *_FILE önceliklidir
// (Docker secret / bind-mount). Zorunlu değer eksikse FAIL-CLOSED (başlangıçta throw).
// Üretim token/secret ASLA log'a yazılmaz.
// ============================================================
import { readFileSync } from "node:fs";

// env veya <ad>_FILE (dosya içeriği trim'lenir). Yoksa "".
export function gizli(ad, env = process.env) {
  const dosya = env[ad + "_FILE"];
  if (dosya) {
    try { return String(readFileSync(dosya, "utf8")).trim(); }
    catch (e) { throw new Error(`${ad}_FILE okunamadı: ${e.message}`); }
  }
  const v = env[ad];
  return v ? String(v).trim() : "";
}

function sayi(env, ad, varsayilan) {
  const v = env[ad];
  if (v == null || v === "") return varsayilan;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : varsayilan;
}

export function yapilandir(env = process.env) {
  const botToken = gizli("TG_BOT_TOKEN", env);
  const gwSecret = gizli("TG_GATEWAY_SECRET", env);
  const pbUrl = (env.PB_URL || "").trim().replace(/\/+$/, "");

  // FAIL-CLOSED: zorunlu değerler eksikse başlama.
  const eksik = [];
  if (!botToken) eksik.push("TG_BOT_TOKEN");
  if (!gwSecret) eksik.push("TG_GATEWAY_SECRET");
  if (!pbUrl) eksik.push("PB_URL");
  if (eksik.length) throw new Error(`Yapılandırma eksik (fail-closed): ${eksik.join(", ")}`);

  // R5: Telegram API tabanı ÜRETİMDE sabit (resmi). Token URL'de taşındığından keyfi TG_API_BASE
  // bir exfiltration/token-sızma kanalı olurdu. Override YALNIZ üretim-dışında (test/dev) veya
  // testlerde constructor DI ile. Üretimde resmi-olmayan TG_API_BASE → FAIL-CLOSED.
  const RESMI_TG = "https://api.telegram.org";
  const uretim = env.NODE_ENV === "production";
  const istenen = env.TG_API_BASE ? env.TG_API_BASE.trim().replace(/\/+$/, "") : "";
  let tgApiBase = RESMI_TG;
  if (uretim) {
    if (istenen && istenen !== RESMI_TG) throw new Error("Üretimde TG_API_BASE resmi Telegram API'sinden farklı olamaz (fail-closed).");
  } else if (istenen) {
    tgApiBase = istenen; // test/dev override (fake Telegram)
  }

  return {
    botToken,
    gwSecret,
    pbUrl,
    tgApiBase,
    pollTimeout: sayi(env, "TG_POLL_TIMEOUT", 25), // getUpdates long-poll saniye
    pollLimit: sayi(env, "TG_POLL_LIMIT", 50),
    pbTimeoutMs: sayi(env, "PB_TIMEOUT_MS", 15000),
    // T2C: AI ucu için AYRI timeout. PB tarafında upstream timeout 45 s olduğundan 60 s pay
    // bırakır; diğer T1 uçları 15 s'te KALIR (global değişiklik YOK). Update lease 180 s.
    pbAiTimeoutMs: sayi(env, "PB_AI_TIMEOUT_MS", 60000),
    heartbeatFile: (env.HEARTBEAT_FILE || "/tmp/tg-gateway-heartbeat").trim(),
    buildSha: (env.BUILD_SHA || "dev").trim(),
  };
}
