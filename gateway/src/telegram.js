// ============================================================
// Telegram Bot API istemcisi — OUTBOUND-ONLY (getUpdates long-poll + sendMessage).
// Webhook YOK, gelen port YOK. Bot token URL'de taşınır → token ASLA log'lanmaz
// (hata mesajları URL/token içermez; yalnız yöntem adı + durum).
// apiBase testte fake Telegram sunucusuna yönlendirilebilir.
// ============================================================

async function fetchZamanAsimli(url, opts, ms, fetchImpl) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetchImpl(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

export function tgIstemci({ apiBase, botToken, fetchImpl = fetch }) {
  const kok = `${apiBase}/bot${botToken}`;
  async function cagir(metot, body, timeoutMs) {
    const res = await fetchZamanAsimli(`${kok}/${metot}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    }, timeoutMs, fetchImpl);
    let json = null;
    try { json = await res.json(); } catch { /* boş */ }
    if (!res.ok || !json || json.ok !== true) {
      // Token URL'de → mesaja URL EKLEME. Yalnız yöntem + durum + TG description.
      const desc = json && json.description ? String(json.description) : `HTTP ${res.status}`;
      const err = new Error(`Telegram ${metot} başarısız: ${desc}`);
      err.status = res.status;
      throw err;
    }
    return json.result;
  }
  return {
    // Long-poll: sunucu en çok `timeout` sn bekler; fetch abort'u timeout+10 sn.
    getUpdates: ({ offset, timeout = 25, limit = 50 } = {}) => {
      const body = { timeout, limit, allowed_updates: ["message"] };
      if (offset != null) body.offset = offset;
      return cagir("getUpdates", body, (timeout + 10) * 1000);
    },
    sendMessage: (chatId, text, opts = {}) =>
      cagir("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true, ...opts }, 15000),
  };
}

// Telegram getUpdates offset kuralı: next_offset (T1A: son tamamlanan update_id + 1).
// Boş/geçersizse offset atlanır (bekleyen tüm update'ler döner).
export function offsetSayi(nextOffset) {
  const s = String(nextOffset || "").trim();
  if (!/^[0-9]{1,19}$/.test(s)) return null;
  return Number(s);
}
