// ============================================================
// PocketBase T1A service istemcisi — HMAC v1 imzalı, outbound-only.
// YALNIZ T1A güvenlik endpoint'leri: state/get, status, update claim/complete,
// pair-consume, unlink, data (READ-ONLY). Finansal YAZMA YOK: /api/findata/kaydet ASLA;
// users.data generic PATCH ASLA.
// Hata taksonomisi (R4): 5xx/ağ/timeout → TransientError; HMAC 401/403 → FatalConfigError.
// Her istek (retry dahil) YENİ ts/nonce/imza üretir (imzaBasliklari çağrısı içeride) — R4.
// fetchImpl ENJEKTE edilir ve gerçekten kullanılır (R14). Shutdown signal iletilir (R12).
// F1: ENDPOINT-SPESİFİK durum doğrulama — yalnız beklenen protokol yanıtları kabul edilir;
// beklenmeyen HTTP durumu ASLA başarı sayılmaz (açık hata). complete 409 → LeaseConflictError.
// ============================================================
import { imzaBasliklari } from "./hmac.js";
import { TransientError, FatalConfigError, LeaseConflictError } from "./errors.js";

export function pbIstemci({ pbUrl, gwSecret, pbTimeoutMs = 15000, pbAiTimeoutMs = 60000, fetchImpl = fetch, signal }) {
  // Tek düşük seviye istek: taze imza + timeout + (varsa) dış shutdown signal. {status,json}
  // döner; ağ/timeout/abort(shutdown-dışı) → TransientError.
  // T2C: timeoutMs UÇ-BAZLIDIR. Mevcut T1 uçları 15 s'te KALIR; yalnız AI ucu 60 s kullanır
  // (PB tarafındaki 45 s upstream timeout'una pay bırakır). Global timeout DEĞİŞTİRİLMEZ.
  async function istek(path, body, timeoutMs) {
    const raw = JSON.stringify(body || {});
    const headers = { ...imzaBasliklari({ secret: gwSecret, method: "POST", path, rawBody: raw }), "Content-Type": "application/json" };
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error("timeout")), timeoutMs || pbTimeoutMs);
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

    // T2C — Telegram AI (T2B servis ucu). UÇ-BAZLI sözleşme doğrulaması: yalnız belgelenmiş
    // durum+şema kabul edilir; başka her şey AÇIK sözleşme sapmasıdır (fail-closed).
    // Gövde YALNIZ şunları taşır: telegram_user_id, update_id, question, bounded history.
    // Ham users.data / PB user id / link id / AI anahtarı / e-posta / revision gateway'e GELMEZ.
    async aiAsk({ tgid, updateId, question, history }) {
      const govde = { telegram_user_id: String(tgid), update_id: String(updateId), question: String(question) };
      if (history && history.length) govde.history = history.map((h) => ({ q: String(h.q), a: String(h.a) }));
      const r = await istek("/api/tg/service/ai", govde, pbAiTimeoutMs);
      const j = r.json;
      // HMAC/servis-auth sapması → süreç fail-closed (T1 semantiği aynen).
      if (r.status === 401 || r.status === 403) throw new FatalConfigError(`PB ai auth ${r.status}`);
      if (r.status >= 500 && r.status !== 502 && r.status !== 504) throw new TransientError(`PB ai ${r.status}`);

      const gecerli =
        (r.status === 200 && j && typeof j.answer === "string" && j.answer.length > 0) ||
        (r.status === 400 && j && j.error === "bad_question") ||
        (r.status === 404 && j && j.error === "not_linked") ||
        (r.status === 409 && j && (
          (j.error === "provider_unavailable" && ["no_key", "local_only", "unsupported"].indexOf(j.reason) !== -1) ||
          j.error === "idempotency_conflict" || j.error === "processing")) ||
        (r.status === 429 && j && j.error === "rate_limited") ||
        (r.status === 502 && j && j.error === "upstream" && ["auth", "transient", "invalid"].indexOf(j.class) !== -1) ||
        (r.status === 504 && j && j.error === "upstream_timeout");
      // Sessizce "done" işaretlemek yerine sözleşme sapmasını AÇIKÇA bildir.
      if (!gecerli) throw new FatalConfigError(`PB ai sözleşme dışı yanıt: ${r.status}`);
      return r;
    },

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
    // F1: yalnız beklenen protokol yanıtı kabul: 200 + {claimed:true,lease_token} | {claimed:false,duplicate|busy}.
    async updateClaim(updateId, tgid, kind) {
      const r = infra(await istek("/api/tg/service/update/claim", { update_id: String(updateId), telegram_user_id: tgid != null ? String(tgid) : "", kind: kind || "" }), "claim");
      const j = r.status === 200 ? r.json : null;
      const gecerli = j && (j.claimed === true
        ? (typeof j.lease_token === "string" && j.lease_token.length > 0)
        : (j.claimed === false && (j.duplicate === true || j.busy === true)));
      if (gecerli) return r;
      throw new TransientError(`PB claim beklenmeyen yanıt: ${r.status}`); // asla başarı sayılmaz
    },
    // F1: 200 → başarı; 409 (no_claim|not_processing|lease_mismatch) → LeaseConflictError
    // (done DEĞİL, offset varsayımı YOK); diğer beklenmeyen → açık hata.
    async updateComplete(updateId, leaseToken, failed = false) {
      const r = infra(await istek("/api/tg/service/update/complete", failed ? { update_id: String(updateId), lease_token: leaseToken, status: "failed" } : { update_id: String(updateId), lease_token: leaseToken }), "complete");
      if (r.status === 200 && r.json && r.json.ok === true) return r;
      if (r.status === 409) throw new LeaseConflictError(`PB complete 409: ${(r.json && r.json.error) || "conflict"}`);
      throw new TransientError(`PB complete beklenmeyen yanıt: ${r.status}`);
    },
    // F1: İŞ durumları YALNIZ 200/400/409/429; başka hiçbir durum kullanıcı-başarısı/fallback-done değildir.
    async pairConsume(tgid, code) {
      const r = infra(await istek("/api/tg/service/pair-consume", { telegram_user_id: String(tgid), code: String(code) }), "pair-consume");
      if (r.status === 200 || r.status === 400 || r.status === 409 || r.status === 429) return r;
      throw new TransientError(`PB pair-consume beklenmeyen yanıt: ${r.status}`);
    },
    // F2: 200 → finansal payload; 404 → GERÇEKTEN bağlı değil (iş yanıtı); 401/403 → YALNIZ
    // servis HMAC/auth hatası → Fatal; 5xx/ağ → Transient; diğer → açık hata (asla "bağlı değil" değil).
    async getData(tgid) {
      const r = await istek("/api/tg/service/data", { telegram_user_id: String(tgid) });
      if (r.status === 401 || r.status === 403) throw new FatalConfigError(`PB data auth ${r.status}`);
      if (r.status >= 500) throw new TransientError(`PB data ${r.status}`);
      if (r.status === 200 && r.json && typeof r.json.data !== "undefined") return r;
      if (r.status === 404) return r; // {status:404} → bağlı değil
      throw new TransientError(`PB data beklenmeyen yanıt: ${r.status}`);
    },
    // /unlink: yalan yok (R7). 200→ok; 5xx/ağ→Transient; 401/403→Fatal; beklenmeyen→Transient(explicit fail).
    async unlink(tgid) {
      const r = infra(await istek("/api/tg/service/unlink", { telegram_user_id: String(tgid) }), "unlink");
      if (r.status === 200) return { ok: true };
      throw new TransientError(`PB unlink beklenmeyen yanıt: ${r.status}`);
    },
  };
}
