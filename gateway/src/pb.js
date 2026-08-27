// ============================================================
// PocketBase T1A service istemcisi — HMAC v1 imzalı, outbound-only.
// YALNIZ T1A güvenlik endpoint'leri: state/get, status, update claim/complete,
// pair-consume, unlink, data (READ-ONLY). Finansal YAZMA YOK: /api/findata/kaydet ASLA;
// users.data generic PATCH ASLA.
// Hata taksonomisi (R4): 5xx/ağ/timeout → TransientError; HMAC 401/403 → FatalConfigError.
// Her istek (retry dahil) YENİ ts/nonce/imza üretir (imzaBasliklari çağrısı içeride) — R4.
// fetchImpl ENJEKTE edilir ve gerçekten kullanılır (R14). Shutdown signal iletilir (R12).
// ============================================================
import { imzaBasliklari } from "./hmac.js";
import { TransientError, FatalConfigError } from "./errors.js";

export function pbIstemci({ pbUrl, gwSecret, pbTimeoutMs = 15000, fetchImpl = fetch, signal }) {
  // Tek düşük seviye istek: taze imza + timeout + (varsa) dış shutdown signal. {status,json}
  // döner; ağ/timeout/abort(shutdown-dışı) → TransientError.
  async function istek(path, body) {
    const raw = JSON.stringify(body || {});
    const headers = { ...imzaBasliklari({ secret: gwSecret, method: "POST", path, rawBody: raw }), "Content-Type": "application/json" };
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error("timeout")), pbTimeoutMs);
    const sig = signal ? AbortSignal.any([ac.signal, signal]) : ac.signal;
    try {
      const res = await fetchImpl(pbUrl + path, { method: "POST", headers, body: raw, signal: sig });
      let json = null; try { json = await res.json(); } catch { /* gövdesiz olabilir */ }
      return { status: res.status, json };
    } catch (e) {
      if (signal && signal.aborted) throw e; // shutdown → yukarı (döngü durdurur)
      throw new TransientError(`PB ${path} ağ/timeout: ${e.message}`);
    } finally { clearTimeout(timer); }
  }
  // Ortak altyapı sınıflandırması: 5xx→Transient, HMAC 401/403→Fatal. İş kodları (400/409/429) geçer.
  function infra(r, path) {
    if (r.status >= 500) throw new TransientError(`PB ${path} ${r.status}`);
    if (r.status === 401 || r.status === 403) throw new FatalConfigError(`PB ${path} auth ${r.status}`);
    return r;
  }
  return {
    _fetch: fetchImpl,
    async stateGet() {
      const r = infra(await istek("/api/tg/service/state/get", {}), "state/get");
      if (r.status === 200 && r.json && typeof r.json.next_offset !== "undefined") return r.json;
      throw new TransientError(`PB state/get beklenmeyen yanıt: ${r.status}`);
    },
    // Metadata-only: {linked:bool, scope?}. Finansal veri/id YOK. 401/403→Fatal (status hep 200 döner).
    async statusGet(tgid) {
      const r = infra(await istek("/api/tg/service/status", { telegram_user_id: String(tgid) }), "status");
      if (r.status === 200 && r.json && typeof r.json.linked === "boolean") return r.json;
      throw new TransientError(`PB status beklenmeyen yanıt: ${r.status}`);
    },
    updateClaim: async (updateId, tgid, kind) => infra(await istek("/api/tg/service/update/claim", { update_id: String(updateId), telegram_user_id: tgid != null ? String(tgid) : "", kind: kind || "" }), "claim"),
    updateComplete: async (updateId, leaseToken, failed = false) => infra(await istek("/api/tg/service/update/complete", failed ? { update_id: String(updateId), lease_token: leaseToken, status: "failed" } : { update_id: String(updateId), lease_token: leaseToken }), "complete"),
    pairConsume: async (tgid, code) => infra(await istek("/api/tg/service/pair-consume", { telegram_user_id: String(tgid), code: String(code) }), "pair-consume"),
    // /data: 401 = "bağlı değil" (İŞ; HMAC state/get preflight+her poll ile kanıtlı) — Fatal DEĞİL.
    async getData(tgid) {
      const r = await istek("/api/tg/service/data", { telegram_user_id: String(tgid) });
      if (r.status >= 500) throw new TransientError(`PB data ${r.status}`);
      if (r.status === 403) throw new FatalConfigError(`PB data auth 403`);
      return r; // {status:200|401, json}
    },
    // /unlink: yalan yok (R7). 200→ok; 5xx/ağ→Transient; 401/403→Fatal; beklenmeyen→Transient(explicit fail).
    async unlink(tgid) {
      const r = infra(await istek("/api/tg/service/unlink", { telegram_user_id: String(tgid) }), "unlink");
      if (r.status === 200) return { ok: true };
      throw new TransientError(`PB unlink beklenmeyen yanıt: ${r.status}`);
    },
  };
}
