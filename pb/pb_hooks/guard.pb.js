/// <reference path="../pb_data/types.d.ts" />
// CAS bypass hard-gate. findata (users.data / haneler.data) ve server-owned revision
// YALNIZ atomik CAS endpoint'i (POST /api/findata/kaydet) üzerinden yazılabilir.
// Generic REST PATCH ile data/revision değiştirmek YASAK → optimistic concurrency
// (compare-and-swap) atlanamaz, lost-update olmaz, revision client tarafından spoof edilemez.
//
// Neden onRecordUpdateRequest: yalnız REST API kayıt-güncelleme isteği için tetiklenir;
// custom route'un e.app / txApp.save() çağrısı model-seviyesi (onRecordUpdate) olduğundan
// bu request-hook'a TAKILMAZ → CAS endpoint'i etkilenmez (empirik olarak doğrulanır).
// Superuser (admin) muaf: bakım/seed işlemleri için. Diğer alanlar (email/password/members)
// serbest — yalnız data ve revision kilitli.
onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    const body = (e.requestInfo() && e.requestInfo().body) || {};
    if (Object.prototype.hasOwnProperty.call(body, "data") || Object.prototype.hasOwnProperty.call(body, "revision")) {
      throw new ForbiddenError("findata yalnız CAS endpoint'i (/api/findata/kaydet) ile yazılabilir.");
    }
  }
  e.next();
}, "users", "haneler");
