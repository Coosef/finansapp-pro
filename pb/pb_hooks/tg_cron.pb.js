/// <reference path="../pb_data/types.d.ts" />
// R4 — bounded retention cleanup (cron, her 15 dk). Batched (≤500/koleksiyon/çalışma).
// processing update'ler, telegram_links ve telegram_state ASLA silinmez.
cronAdd("tg_cleanup", "*/15 * * * *", () => {
  const T = require(`${__hooks}/tg_lib.js`);
  const nowIso = T.isoAt(0);
  const sil = (coll, filter, params) => {
    try {
      const rows = $app.findRecordsByFilter(coll, filter, "created", 500, 0, params || {});
      for (const r of rows) { try { $app.delete(r); } catch (_) { /* geç */ } }
    } catch (_) { /* geç */ }
  };
  // service_requests: expired (expires_at=now+30dk → nonce TTL ≥30dk, 15dk RL penceresi korunur).
  sil("telegram_service_requests", "expires_at < {:n}", { n: nowIso });
  // pair_codes: 1 saatten fazla süredir expired olanlar (TTL 5dk → used/unused hepsi expired). Grace=1h.
  sil("telegram_pair_codes", "expires_at < {:g}", { g: T.isoAt(-60 * 60000) });
  // updates: YALNIZ terminal (done/failed) ve 7 günden eski. processing dokunulmaz.
  sil("telegram_updates", "(status = 'done' || status = 'failed') && updated < {:o}", { o: T.isoAt(-7 * 24 * 60 * 60000) });
  // T2B: ai_results — mantıksal geçerliliği (expires_at, en fazla 30 dk) dolmuş idempotency/
  // DONE satırları. Bu cron FİZİKSEL silme backstop'udur: cache okuma tarafı süresi dolmuş
  // satırı zaten ASLA döndürmez. Cron 15 dk'da bir koştuğundan nominal disk kalıcılığı
  // 30 dk + ≤15 dk ≈ en fazla ~45 dk'dır (30 dk DEĞİL).
  sil("telegram_ai_results", "expires_at < {:n}", { n: nowIso });
  // telegram_links, telegram_state: rutin silme YOK.
});
