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
    // Aynı user'ın önceki kullanılmamış kodlarını geçersiz kıl.
    const eski = tx.findRecordsByFilter("telegram_pair_codes", "user = {:u} && used_at = null", "-created", 50, 0, { u: auth.id });
    for (const r of eski) { r.set("used_at", T.isoAt(0)); tx.save(r); }
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
  e.app.runInTransaction((tx) => {
    let kod = null;
    try { kod = tx.findFirstRecordByFilter("telegram_pair_codes", "code_mac = {:m}", { m: codeMac }); } catch (_) { kod = null; }
    if (!kod) { sonuc = { hata: T.CODE_GENERIC }; return; }
    if (!kod.getDateTime("used_at").isZero()) { sonuc = { hata: T.CODE_GENERIC }; return; }        // single-use
    if (kod.getDateTime("expires_at").before(new DateTime())) { sonuc = { hata: T.CODE_GENERIC }; return; } // expiry
    const userId = kod.get("user");

    let tgLink = null;
    try { tgLink = tx.findFirstRecordByFilter("telegram_links", "telegram_user_id = {:t} && active = true", { t: tgid }); } catch (_) { tgLink = null; }
    if (tgLink && tgLink.get("user") !== userId) { sonuc = { hata: "Bu Telegram hesabı başka bir kullanıcıya bağlı." }; return; }

    let uLink = null;
    try { uLink = tx.findFirstRecordByFilter("telegram_links", "user = {:u}", { u: userId }); } catch (_) { uLink = null; }
    if (uLink && uLink.get("active") && String(uLink.get("telegram_user_id")) !== tgid) {
      sonuc = { hata: "Kullanıcı zaten başka bir Telegram hesabına bağlı." }; return;
    }
    if (!uLink) uLink = new Record(tx.findCollectionByNameOrId("telegram_links"));
    uLink.set("user", userId);
    uLink.set("telegram_user_id", tgid);
    uLink.set("scope", "personal"); // T1 HARDCODE
    uLink.set("active", true);
    uLink.set("linked_at", T.isoAt(0));
    uLink.set("unlinked_at", null);
    tx.save(uLink);

    kod.set("used_at", T.isoAt(0)); // consume
    tx.save(kod);
    sonuc = { ok: true };
  });
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

// Update claim — idempotent + crash-recovery lease.
routerAdd("POST", "/api/tg/service/update/claim", (e) => {
  const T = require(`${__hooks}/tg_lib.js`);
  const { body, tgid } = T.serviceAuth(e, "/api/tg/service/update/claim");
  const uid = String((body && body.update_id) || "");
  if (!uid) throw new BadRequestError("update_id gerekli.");
  const kind = String((body && body.kind) || "");
  let out = null;
  e.app.runInTransaction((tx) => {
    let rec = null;
    try { rec = tx.findFirstRecordByFilter("telegram_updates", "update_id = {:u}", { u: uid }); } catch (_) { rec = null; }
    if (rec) {
      const st = rec.get("status");
      if (st === "done") { out = { claimed: false, duplicate: true }; return; }
      if (st === "processing" && !rec.getDateTime("lease_until").isZero() && rec.getDateTime("lease_until").after(new DateTime())) { out = { claimed: false, busy: true }; return; }
      rec.set("status", "processing");
      rec.set("attempts", (rec.getInt("attempts") || 0) + 1);
      rec.set("lease_until", T.isoAt(T.UPDATE_LEASE_MS));
      if (tgid) rec.set("telegram_user_id", tgid);
      if (kind) rec.set("kind", kind);
      tx.save(rec);
      out = { claimed: true, reclaimed: true };
      return;
    }
    rec = new Record(tx.findCollectionByNameOrId("telegram_updates"));
    rec.set("update_id", uid);
    rec.set("telegram_user_id", tgid || "");
    rec.set("kind", kind);
    rec.set("status", "processing");
    rec.set("attempts", 1);
    rec.set("lease_until", T.isoAt(T.UPDATE_LEASE_MS));
    try { tx.save(rec); out = { claimed: true }; }
    catch (_) { out = { claimed: false, duplicate: true }; } // yarış: unique(update_id)
  });
  return e.json(200, out);
});

// Update complete — status=done + explicit next_offset.
routerAdd("POST", "/api/tg/service/update/complete", (e) => {
  const T = require(`${__hooks}/tg_lib.js`);
  const { body } = T.serviceAuth(e, "/api/tg/service/update/complete");
  const uid = String((body && body.update_id) || "");
  if (!uid) throw new BadRequestError("update_id gerekli.");
  const nextOffset = body && body.next_offset != null ? String(body.next_offset) : "";
  const status = body && body.status === "failed" ? "failed" : "done";
  e.app.runInTransaction((tx) => {
    let rec = null;
    try { rec = tx.findFirstRecordByFilter("telegram_updates", "update_id = {:u}", { u: uid }); } catch (_) { rec = null; }
    if (rec) {
      rec.set("status", status);
      if (status === "done") { rec.set("completed_at", T.isoAt(0)); rec.set("lease_until", null); }
      tx.save(rec);
    }
    if (nextOffset) {
      let st = null;
      try { st = tx.findFirstRecordByFilter("telegram_state", "key = {:k}", { k: "main" }); } catch (_) { st = null; }
      if (!st) { st = new Record(tx.findCollectionByNameOrId("telegram_state")); st.set("key", "main"); }
      st.set("next_offset", nextOffset); // EXPLICIT
      tx.save(st);
    }
  });
  return e.json(200, { ok: true });
});
