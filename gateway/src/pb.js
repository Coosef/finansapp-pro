// ============================================================
// PocketBase T1A service istemcisi — HMAC v1 imzalı, outbound-only.
// YALNIZ T1A güvenlik endpoint'leri: state/get, update claim/complete, pair-consume,
// unlink, data (READ-ONLY). Finansal YAZMA YOK: /api/findata/kaydet ASLA çağrılmaz,
// users.data'ya generic PATCH ASLA yapılmaz.
// ============================================================
import { imzaBasliklari } from "./hmac.js";

// Zaman aşımlı fetch (AbortController). Ağ/PB askıda kalırsa döngü kilitlenmesin.
async function fetchZamanAsimli(url, opts, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

export function pbIstemci({ pbUrl, gwSecret, pbTimeoutMs = 15000, fetchImpl = fetch }) {
  async function cagir(path, body) {
    const raw = JSON.stringify(body || {});
    const headers = { ...imzaBasliklari({ secret: gwSecret, method: "POST", path, rawBody: raw }), "Content-Type": "application/json" };
    const res = await fetchZamanAsimli(pbUrl + path, { method: "POST", headers, body: raw }, pbTimeoutMs);
    let json = null;
    try { json = await res.json(); } catch { /* gövdesiz yanıt olabilir */ }
    return { status: res.status, json };
  }
  return {
    _fetch: fetchImpl,
    stateGet: () => cagir("/api/tg/service/state/get", {}),
    updateClaim: (updateId, tgid, kind) => cagir("/api/tg/service/update/claim", { update_id: String(updateId), telegram_user_id: tgid != null ? String(tgid) : "", kind: kind || "" }),
    updateComplete: (updateId, leaseToken, failed = false) => cagir("/api/tg/service/update/complete", failed ? { update_id: String(updateId), lease_token: leaseToken, status: "failed" } : { update_id: String(updateId), lease_token: leaseToken }),
    pairConsume: (tgid, code) => cagir("/api/tg/service/pair-consume", { telegram_user_id: String(tgid), code: String(code) }),
    unlink: (tgid) => cagir("/api/tg/service/unlink", { telegram_user_id: String(tgid) }),
    getData: (tgid) => cagir("/api/tg/service/data", { telegram_user_id: String(tgid) }),
  };
}
