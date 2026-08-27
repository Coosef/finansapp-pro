/// <reference path="../pb_data/types.d.ts" />
// ============================================================
// Telegram Finance Gateway — T1A internal security API (metadata only).
// Browser USER-AUTH: pair-code üret / durum / unlink.
// Gateway SERVICE-AUTH (HMAC v1): pair-consume / unlink / data / state / update claim+complete.
// FİNANSAL YAZMA YOK: users/haneler data|revision BU DOSYADA hiç değişmez (yalnız okunur).
// findata.pb.js / guard.pb.js semantiğine DOKUNULMAZ.
//
// NOT: PB routerAdd handler'ları dosya-seviyesi scope'u GÖRMEZ → paylaşılan yardımcılar
// tg_lib.js modülünde; her handler require(`${__hooks}/tg_lib.js`) ile içeri alır.
// ============================================================

// ---- BROWSER USER-AUTH ----

// Pair code üret — yalnız e.auth kullanıcısı için (body'den user id ALINMAZ).
routerAdd("POST", "/api/tg/user/pair-code", (e) => {
  const T = require(`${__hooks}/tg_lib.js`);
  const auth = e.auth;
  if (!auth) throw new UnauthorizedError("Giriş gerekli.");
  const pepper = T.tgSecret("TG_PAIRING_PEPPER");
  if (!pepper) throw new ApiError(503, "Pairing yapılandırılmamış."); // FAIL CLOSED

  const code = $security.randomStringWithAlphabet(8, T.PAIR_ALFABE).toUpperCase();
  const codeMac = $security.hs256(code, pepper);
  const expIso = T.isoAt(T.CODE_TTL_MS);

  e.app.runInTransaction((tx) => {
    // R5+F: aynı user'ın TÜM kullanılmamış kodlarını geçersiz kıl — DETERMİNİSTİK TAM İTERASYON.
    // Sayfa boyutu üzerinden offset ile tüm geçmiş taranır (keyfi 500 KORREKTLİK limiti YOK);
    // used_at boşsa (isZero) used işaretlenir. DB invariant (partial unique WHERE used_at='')
    // zaten ≤1 kullanılmamış kod garanti eder — iterasyon yine de eksiksizdir.
    const SAYFA = 200;
    for (let ofs = 0; ; ofs += SAYFA) {
      const sayfa = tx.findRecordsByFilter("telegram_pair_codes", "user = {:u}", "created", SAYFA, ofs, { u: auth.id });
      if (!sayfa.length) break;
      for (const r of sayfa) { if (r.getDateTime("used_at").isZero()) { r.set("used_at", T.isoAt(0)); tx.save(r); } }
      if (sayfa.length < SAYFA) break;
    }
    const rec = new Record(tx.findCollectionByNameOrId("telegram_pair_codes"));
    rec.set("user", auth.id);
    rec.set("code_mac", codeMac);
    rec.set("expires_at", expIso);
    tx.save(rec);
  });
  return e.json(200, { code, expires_in: Math.floor(T.CODE_TTL_MS / 1000) }); // plaintext YALNIZ burada, bir kez
}, $apis.requireAuth("users"));

// Durum — yalnız kendi link metadata'sı.
routerAdd("POST", "/api/tg/user/status", (e) => {
  const auth = e.auth;
  if (!auth) throw new UnauthorizedError("Giriş gerekli.");
  let link = null;
  try { link = e.app.findFirstRecordByFilter("telegram_links", "user = {:u} && active = true", { u: auth.id }); } catch (_) { link = null; }
  if (!link) return e.json(200, { linked: false });
  return e.json(200, { linked: true, telegram_user_id: link.get("telegram_user_id"), scope: link.get("scope"), linked_at: link.get("linked_at") });
}, $apis.requireAuth("users"));

// Unlink — yalnız kendi link'i. users.data/revision'a DOKUNMAZ.
routerAdd("POST", "/api/tg/user/unlink", (e) => {
  const T = require(`${__hooks}/tg_lib.js`);
  const auth = e.auth;
  if (!auth) throw new UnauthorizedError("Giriş gerekli.");
  let link = null;
  try { link = e.app.findFirstRecordByFilter("telegram_links", "user = {:u} && active = true", { u: auth.id }); } catch (_) { link = null; }
  if (link) { link.set("active", false); link.set("unlinked_at", T.isoAt(0)); e.app.save(link); }
  return e.json(200, { ok: true });
}, $apis.requireAuth("users"));

// ---- GATEWAY SERVICE-AUTH (HMAC v1) ----

// Pair consume — kod tüket + link oluştur/yeniden etkinleştir. Single-use, atomik, personal.
routerAdd("POST", "/api/tg/service/pair-consume", (e) => {
  const T = require(`${__hooks}/tg_lib.js`);
  const PATH = "/api/tg/service/pair-consume";
  const { body, tgid } = T.serviceAuth(e, PATH);
  if (!T.TGID_RE.test(tgid)) throw new BadRequestError("Geçersiz telegram_user_id.");
  if (T.rateLimitAsildi(e.app, tgid, PATH)) return e.json(429, { message: "Çok fazla deneme. Sonra tekrar dene." });

  const pepper = T.tgSecret("TG_PAIRING_PEPPER");
  if (!pepper) throw new ApiError(503, "Pairing yapılandırılmamış.");
  const code = String((body && body.code) || "").trim().toUpperCase();
  if (!code) return e.json(400, { message: T.CODE_GENERIC });
  const codeMac = $security.hs256(code, pepper);

  let sonuc = null;
  try {
    e.app.runInTransaction((tx) => {
      let kod = null;
      try { kod = tx.findFirstRecordByFilter("telegram_pair_codes", "code_mac = {:m}", { m: codeMac }); } catch (_) { kod = null; }
      if (!kod) { sonuc = { hata: T.CODE_GENERIC }; return; }
      if (!kod.getDateTime("used_at").isZero()) { sonuc = { hata: T.CODE_GENERIC }; return; }        // single-use
      if (kod.getDateTime("expires_at").before(new DateTime())) { sonuc = { hata: T.CODE_GENERIC }; return; } // expiry
      const userId = kod.get("user");

      // F1: YALNIZ AKTİF link'lere göre karar ver; keyfi bir pasif tarihsel satır YENİDEN KULLANILMAZ.
      // Aktif link tgid'i BAŞKA bir user'a mı ait? → reddet (en fazla bir aktif link / tgid).
      let tgActive = null;
      try { tgActive = tx.findFirstRecordByFilter("telegram_links", "telegram_user_id = {:t} && active = true", { t: tgid }); } catch (_) { tgActive = null; }
      if (tgActive && tgActive.get("user") !== userId) { sonuc = { hata: "Bu Telegram hesabı başka bir kullanıcıya bağlı." }; return; }
      // User'ın aktif link'i BAŞKA bir tgid'e mi bağlı? → reddet (en fazla bir aktif link / user).
      let userActive = null;
      try { userActive = tx.findFirstRecordByFilter("telegram_links", "user = {:u} && active = true", { u: userId }); } catch (_) { userActive = null; }
      if (userActive && String(userActive.get("telegram_user_id")) !== tgid) { sonuc = { hata: "Kullanıcı zaten başka bir Telegram hesabına bağlı." }; return; }

      // Idempotent: user zaten AYNI tgid'e aktif bağlıysa mevcut aktif satırı tazele; aksi halde
      // YENİ aktif satır oluştur (pasif geçmiş satırlarını asla reaktive etme).
      let link = userActive && String(userActive.get("telegram_user_id")) === tgid ? userActive : new Record(tx.findCollectionByNameOrId("telegram_links"));
      link.set("user", userId);
      link.set("telegram_user_id", tgid);
      link.set("scope", "personal"); // T1 HARDCODE
      link.set("active", true);
      link.set("linked_at", T.isoAt(0));
      link.set("unlinked_at", null);
      tx.save(link); // partial unique (active) index backstop; yarış → constraint → dış catch

      kod.set("used_at", T.isoAt(0)); // consume
      tx.save(kod);
      sonuc = { ok: true };
    });
  } catch (err) {
    // T1B error taxonomy: GERÇEK active-link uniqueness yarışı mı, İLGİSİZ operasyonel hata mı?
    // Re-query ile sınıflandır (F2 nonce deseniyle aynı): bu tgid'e BAŞKA user aktif bağlı VEYA
    // kodun user'ı BAŞKA tgid'e aktif bağlıysa → yarış → KONTROLLÜ 409 (kod tüketilmez, retry).
    // Aksi (bilinmeyen DB/storage/operasyonel hata) → YAY: conflict diye YANLIŞ sınıflandırma
    // YOK; transaction rollback + fail-closed davranışı korunur.
    let cakisma = false;
    let uid2 = null;
    try { const kod2 = e.app.findFirstRecordByFilter("telegram_pair_codes", "code_mac = {:m}", { m: codeMac }); uid2 = kod2 ? kod2.get("user") : null; } catch (_) { uid2 = null; }
    try { const tgA = e.app.findFirstRecordByFilter("telegram_links", "telegram_user_id = {:t} && active = true", { t: tgid }); if (tgA && tgA.get("user") !== uid2) cakisma = true; } catch (_) { /* yok */ }
    if (uid2) { try { const uA = e.app.findFirstRecordByFilter("telegram_links", "user = {:u} && active = true", { u: uid2 }); if (uA && String(uA.get("telegram_user_id")) !== tgid) cakisma = true; } catch (_) { /* yok */ } }
    if (cakisma) return e.json(409, { message: "Bağlantı çakışması. Tekrar dene." });
    throw err; // ilgisiz hata — yanlış 409 sınıflandırması YOK
  }
  if (sonuc && sonuc.hata) return e.json(400, { message: sonuc.hata });
  return e.json(200, { ok: true, scope: "personal" });
});

// Service unlink — link pasifleştir. Finansal veriye dokunmaz.
routerAdd("POST", "/api/tg/service/unlink", (e) => {
  const T = require(`${__hooks}/tg_lib.js`);
  const { tgid } = T.serviceAuth(e, "/api/tg/service/unlink");
  if (!T.TGID_RE.test(tgid)) throw new BadRequestError("Geçersiz telegram_user_id.");
  let link = null;
  try { link = e.app.findFirstRecordByFilter("telegram_links", "telegram_user_id = {:t} && active = true", { t: tgid }); } catch (_) { link = null; }
  if (link) { link.set("active", false); link.set("unlinked_at", T.isoAt(0)); e.app.save(link); }
  return e.json(200, { ok: true });
});

// Service data — PB link'i ÇÖZER (gateway iddiasına güvenmez). Personal-only, READ-ONLY.
routerAdd("POST", "/api/tg/service/data", (e) => {
  const T = require(`${__hooks}/tg_lib.js`);
  const { tgid } = T.serviceAuth(e, "/api/tg/service/data");
  if (!T.TGID_RE.test(tgid)) throw new BadRequestError("Geçersiz telegram_user_id.");
  let link = null;
  try { link = e.app.findFirstRecordByFilter("telegram_links", "telegram_user_id = {:t} && active = true", { t: tgid }); } catch (_) { link = null; }
  if (!link) throw new UnauthorizedError("Bağlı değil.");
  if (link.get("scope") !== "personal") throw new ApiError(400, "Yalnız personal desteklenir (T1).");
  const user = e.app.findRecordById("users", link.get("user")); // finansal kaynak — SADECE OKUMA
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, { data: user.get("data") || {}, revision: user.getInt("revision"), updated: user.get("updated"), scope: "personal" });
});

// Service status — METADATA-ONLY link kontrolü (R2/R8). PB tgid'i kendi çözer. Finansal veri YOK,
// PB user id YOK, mutation YOK. linked=false için de 200 döner (HMAC 401 = saf auth hatası →
// gateway'de FatalConfig). /link crash-window replay ve /start,/durum,Bağlantı bunu kullanır.
routerAdd("POST", "/api/tg/service/status", (e) => {
  const T = require(`${__hooks}/tg_lib.js`);
  const { tgid } = T.serviceAuth(e, "/api/tg/service/status");
  if (!T.TGID_RE.test(tgid)) throw new BadRequestError("Geçersiz telegram_user_id.");
  let link = null;
  try { link = e.app.findFirstRecordByFilter("telegram_links", "telegram_user_id = {:t} && active = true", { t: tgid }); } catch (_) { link = null; }
  if (!link) return e.json(200, { linked: false });
  return e.json(200, { linked: true, scope: link.get("scope") || "personal" });
});

// Durable state — explicit next_offset (max(update_id) DEĞİL). Yoksa oluştur.
routerAdd("POST", "/api/tg/service/state/get", (e) => {
  const T = require(`${__hooks}/tg_lib.js`);
  T.serviceAuth(e, "/api/tg/service/state/get");
  let st = null;
  try { st = e.app.findFirstRecordByFilter("telegram_state", "key = {:k}", { k: "main" }); } catch (_) { st = null; }
  if (!st) {
    st = new Record(e.app.findCollectionByNameOrId("telegram_state"));
    st.set("key", "main"); st.set("next_offset", "");
    try { e.app.save(st); } catch (_) { st = e.app.findFirstRecordByFilter("telegram_state", "key = {:k}", { k: "main" }); }
  }
  return e.json(200, { next_offset: st.get("next_offset") || "" });
});

// Update claim — idempotent + crash-recovery lease + opaque lease_token (fencing).
routerAdd("POST", "/api/tg/service/update/claim", (e) => {
  const T = require(`${__hooks}/tg_lib.js`);
  const { body, tgid } = T.serviceAuth(e, "/api/tg/service/update/claim");
  const uid = String((body && body.update_id) || "");
  if (!T.validUpdateId(uid)) throw new BadRequestError("Geçersiz update_id.");
  const kind = String((body && body.kind) || "");
  const leaseToken = $security.randomString(40);
  let out = null;
  e.app.runInTransaction((tx) => {
    let rec = null;
    try { rec = tx.findFirstRecordByFilter("telegram_updates", "update_id = {:u}", { u: uid }); } catch (_) { rec = null; }
    if (rec) {
      const st = rec.get("status");
      if (st === "done") { out = { claimed: false, duplicate: true }; return; }
      if (st === "processing" && !rec.getDateTime("lease_until").isZero() && rec.getDateTime("lease_until").after(new DateTime())) { out = { claimed: false, busy: true }; return; }
      // received/failed veya stale lease → yeni token ile yeniden claim (eski claimant fenced).
      rec.set("status", "processing");
      rec.set("attempts", (rec.getInt("attempts") || 0) + 1);
      rec.set("lease_until", T.isoAt(T.UPDATE_LEASE_MS));
      rec.set("lease_token", leaseToken);
      if (tgid) rec.set("telegram_user_id", tgid);
      if (kind) rec.set("kind", kind);
      tx.save(rec);
      out = { claimed: true, reclaimed: true, lease_token: leaseToken };
      return;
    }
    rec = new Record(tx.findCollectionByNameOrId("telegram_updates"));
    rec.set("update_id", uid);
    rec.set("telegram_user_id", tgid || "");
    rec.set("kind", kind);
    rec.set("status", "processing");
    rec.set("attempts", 1);
    rec.set("lease_until", T.isoAt(T.UPDATE_LEASE_MS));
    rec.set("lease_token", leaseToken);
    try { tx.save(rec); out = { claimed: true, lease_token: leaseToken }; }
    catch (err) {
      // R2: kör "duplicate" YOK. Kayıt gerçekten var mı? → durumuna göre çöz; yoksa hatayı YAY.
      let exist = null;
      try { exist = tx.findFirstRecordByFilter("telegram_updates", "update_id = {:u}", { u: uid }); } catch (_) { exist = null; }
      if (!exist) throw err; // gerçek DB/validation hatası
      out = exist.get("status") === "done" ? { claimed: false, duplicate: true } : { claimed: false, busy: true };
    }
  });
  return e.json(200, out);
});

// Update complete — YALNIZ mevcut+processing+lease_token eşleşen claim'i tamamlar.
// next_offset SERVER-DERIVED = update_id + 1 (gateway keyfi değeri YOK). failed → offset İLERLEMEZ.
routerAdd("POST", "/api/tg/service/update/complete", (e) => {
  const T = require(`${__hooks}/tg_lib.js`);
  const { body } = T.serviceAuth(e, "/api/tg/service/update/complete");
  const uid = String((body && body.update_id) || "");
  if (!T.validUpdateId(uid)) throw new BadRequestError("Geçersiz update_id.");
  const leaseToken = String((body && body.lease_token) || "");
  if (!leaseToken) throw new BadRequestError("lease_token gerekli.");
  const failed = body && body.status === "failed";
  let http = 200, out = { ok: true };
  e.app.runInTransaction((tx) => {
    let rec = null;
    try { rec = tx.findFirstRecordByFilter("telegram_updates", "update_id = {:u}", { u: uid }); } catch (_) { rec = null; }
    if (!rec) { http = 409; out = { error: "no_claim" }; return; }                     // R1: claim yok → offset dokunulmaz
    if (rec.get("status") !== "processing") { http = 409; out = { error: "not_processing" }; return; }
    if (!$security.equal(String(rec.get("lease_token") || ""), leaseToken)) { http = 409; out = { error: "lease_mismatch" }; return; } // R3 fencing
    if (failed) {
      rec.set("status", "failed"); rec.set("lease_until", null); rec.set("lease_token", null);
      tx.save(rec);
      out = { ok: true, status: "failed" }; return;                                    // R1: failed → offset İLERLEMEZ
    }
    rec.set("status", "done"); rec.set("completed_at", T.isoAt(0)); rec.set("lease_until", null); rec.set("lease_token", null);
    tx.save(rec);
    const nextOffset = T.deriveNextOffset(uid);                                         // R1: server-derived update_id+1
    let st = null;
    try { st = tx.findFirstRecordByFilter("telegram_state", "key = {:k}", { k: "main" }); } catch (_) { st = null; }
    if (!st) { st = new Record(tx.findCollectionByNameOrId("telegram_state")); st.set("key", "main"); }
    st.set("next_offset", nextOffset); tx.save(st);
    out = { ok: true, next_offset: nextOffset };
  });
  return e.json(http, out);
});
