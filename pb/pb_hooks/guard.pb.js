/// <reference path="../pb_data/types.d.ts" />
// CAS bypass hard-gate — FEATURE-GATED (rollout uyumluluğu için).
// findata (users.data / haneler.data) ve server-owned revision YALNIZ atomik CAS endpoint'i
// (POST /api/findata/kaydet) üzerinden yazılabilir; generic REST PATCH ile data/revision
// değiştirmek YASAK → optimistic concurrency (CAS) atlanamaz, lost-update olmaz, revision
// client tarafından spoof edilemez.
//
// ENV GATE — FINANSAPP_CAS_ENFORCE:
//   "1"          → ENFORCE: generic data/revision PATCH → 403 (guard aktif).
//   unset / diğer → COMPATIBILITY (varsayılan): legacy generic PATCH GEÇİCİ olarak açık;
//                   CAS endpoint + migration yine aktif. Yeni PB image deploy'unda eski
//                   production frontend'in direct PATCH write'ları KIRILMAZ (rollout: image
//                   deploy compatibility'de → frontend cutover → sonra ENFORCE=1).
// Varsayılan KAPALI: güvenli rollout — enforcement yalnız açıkça FINANSAPP_CAS_ENFORCE=1 ile.
//
// Neden onRecordUpdateRequest: yalnız REST API kayıt-güncelleme isteği için tetiklenir;
// custom route'un e.app / txApp.save() çağrısı model-seviyesi (onRecordUpdate) olduğundan
// bu request-hook'a TAKILMAZ → CAS endpoint'i etkilenmez (empirik olarak doğrulanmıştır).
// Superuser (admin) muaf: bakım/seed işlemleri. Diğer alanlar (email/password/members) serbest.
onRecordUpdateRequest((e) => {
  const enforce = $os.getenv("FINANSAPP_CAS_ENFORCE") === "1";
  if (enforce && !e.hasSuperuserAuth()) {
    const body = (e.requestInfo() && e.requestInfo().body) || {};
    if (Object.prototype.hasOwnProperty.call(body, "data") || Object.prototype.hasOwnProperty.call(body, "revision")) {
      throw new ForbiddenError("findata yalnız CAS endpoint'i (/api/findata/kaydet) ile yazılabilir.");
    }
  }
  e.next();
}, "users", "haneler");
