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

  return {
    botToken,
    gwSecret,
    pbUrl,
    // Telegram Bot API tabanı — testte fake sunucuya yönlendirilebilir.
    tgApiBase: (env.TG_API_BASE || "https://api.telegram.org").trim().replace(/\/+$/, ""),
    pollTimeout: sayi(env, "TG_POLL_TIMEOUT", 25), // getUpdates long-poll saniye
    pollLimit: sayi(env, "TG_POLL_LIMIT", 50),
    pbTimeoutMs: sayi(env, "PB_TIMEOUT_MS", 15000),
    heartbeatFile: (env.HEARTBEAT_FILE || "/tmp/tg-gateway-heartbeat").trim(),
    poisonMax: sayi(env, "TG_POISON_MAX", 3), // aynı update geçici hatada en çok N deneme → skip
    buildSha: (env.BUILD_SHA || "dev").trim(),
  };
}
