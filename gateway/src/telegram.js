// ============================================================
// Telegram Bot API istemcisi — OUTBOUND-ONLY (getMe + getUpdates long-poll + sendMessage).
// Webhook YOK, gelen port YOK. Bot token URL'de → token ASLA log/hata mesajına GİRMEZ.
// Hata taksonomisi (R4): 401→FatalConfigError (geçersiz token); 429→TransientError(retry_after);
// 5xx/ağ/timeout→TransientError; sendMessage 400/403 (teslim edilemez)→PermanentUpdateError.
// Shutdown signal (R12) getUpdates fetch'ine iletilir → uzun poll anında iptal edilir.
// ============================================================
import { TransientError, FatalConfigError, PermanentUpdateError } from "./errors.js";

export function tgIstemci({ apiBase, botToken, fetchImpl = fetch }) {
  const kok = `${apiBase}/bot${botToken}`;
  async function ham(metot, body, timeoutMs, extSignal) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error("timeout")), timeoutMs);
    const sig = extSignal ? AbortSignal.any([ac.signal, extSignal]) : ac.signal;
    let res;
    try {
      res = await fetchImpl(`${kok}/${metot}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}), signal: sig });
    } catch (e) {
      if (extSignal && extSignal.aborted) throw e;                 // shutdown → yukarı
      throw new TransientError(`Telegram ${metot} ağ/timeout`);     // token/URL İÇERMEZ
    } finally { clearTimeout(timer); }
    let json = null; try { json = await res.json(); } catch { /* boş */ }
    return { status: res.status, ok: res.ok, json };
  }
  function kodDesc(r) {
    return { kod: (r.json && r.json.error_code) || r.status, desc: (r.json && r.json.description) || `HTTP ${r.status}`, retryAfter: r.json && r.json.parameters && r.json.parameters.retry_after };
  }
  // getMe/getUpdates sınıflandırma.
  function cagriSonuc(r, metot) {
    if (r.ok && r.json && r.json.ok === true) return r.json.result;
    const { kod, desc, retryAfter } = kodDesc(r);
    if (kod === 401) throw new FatalConfigError(`Telegram ${metot} yetkisiz (geçersiz bot token): ${desc}`);
    if (kod === 429) throw new TransientError(`Telegram ${metot} 429`, retryAfter ? retryAfter * 1000 : 1000);
    throw new TransientError(`Telegram ${metot} ${kod}: ${desc}`); // 5xx + diğer 4xx → geçici (token içermez)
  }
  return {
    getMe: (extSignal) => ham("getMe", {}, 15000, extSignal).then((r) => cagriSonuc(r, "getMe")),
    getUpdates: ({ offset, timeout = 25, limit = 50, signal } = {}) => {
      const body = { timeout, limit, allowed_updates: ["message"] };
      if (offset != null) body.offset = offset;
      return ham("getUpdates", body, (timeout + 10) * 1000, signal).then((r) => cagriSonuc(r, "getUpdates"));
    },
    sendMessage: (chatId, text, opts = {}) =>
      ham("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true, ...opts }, 15000, opts.signal).then((r) => {
        if (r.ok && r.json && r.json.ok === true) return r.json.result;
        const { kod, desc, retryAfter } = kodDesc(r);
        if (kod === 401) throw new FatalConfigError(`Telegram sendMessage yetkisiz: ${desc}`);
        if (kod === 429) throw new TransientError("Telegram sendMessage 429", retryAfter ? retryAfter * 1000 : 1000);
        if (kod >= 500) throw new TransientError(`Telegram sendMessage ${kod}`);
        if (kod === 400 || kod === 403) throw new PermanentUpdateError(`Telegram sendMessage teslim edilemez ${kod}: ${desc}`); // bot blocked / chat not found / bad request
        throw new TransientError(`Telegram sendMessage ${kod}: ${desc}`);
      }),
  };
}

// Telegram getUpdates offset (T1A: son tamamlanan update_id + 1). Boş/geçersiz→null (offset atlanır).
// R6: 19-haneli sözleşme için GÜVENLİ tamsayı sınırı — MAX_SAFE_INTEGER üstü değeri Number'a
// ÇEVİRME (hassasiyet kaybı); sınır aşımında null→tüm bekleyenleri getir (güvenli fallback).
export function offsetSayi(nextOffset) {
  const s = String(nextOffset || "").trim();
  if (!/^[0-9]{1,19}$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return null; // Telegram update_id ≤ 2^53 (JSON number); sınır aşımı → fallback
  return n;
}
