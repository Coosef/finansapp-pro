/// <reference path="../pb_data/types.d.ts" />
// AI proxy — anahtarlar SUNUCUDA (ai_keys koleksiyonu, API'den okunamaz) veya env'de.
// İstemci yalnız mesaj gönderir; anahtar cihaza/tarayıcıya asla dönmez.
// Sağlayıcı whitelist'i → SSRF yok. Tüm uçlar giriş (auth) ister.
//
// T2B.1 — ÇALIŞMA-MODELİ ONARIMI: PB 0.39.10 JSVM'de routerAdd() handler'ları dosya-seviyesi
// leksik sembolleri GÖRMEZ. Bu dosya daha önce handler'lardan doğrudan `UST` /
// `anahtarKaydiBul` / `anahtarBul` sembollerine başvuruyordu → her istek
// "ReferenceError: ... is not defined" ile 400 dönüyordu (sunucu-taraflı proxy hiç çalışmadı).
// Artık paylaşılan yardımcılar ai_lib.js modülündedir ve HER handler bunu KENDİ İÇİNDE
// require() eder (tg.pb.js'te kanıtlanmış desen). ÜRÜN DAVRANIŞI DEĞİŞMEDİ.

// ---- Anahtar kaydet (write-only: istemci okuyamaz) ----
routerAdd("POST", "/ai/anahtar", (e) => {
  const L = require(`${__hooks}/ai_lib.js`);
  const auth = e.requestInfo().auth;
  if (!auth) throw new UnauthorizedError("Giriş gerekli.");
  const b = e.requestInfo().body || {};
  const sag = String(b.saglayici || "");
  if (!L.UST[sag]) throw new BadRequestError("Geçersiz sağlayıcı.");

  let rec = L.anahtarKaydiBul(e.app, auth.id);
  if (!rec) {
    rec = new Record(e.app.findCollectionByNameOrId("ai_keys"));
    rec.set("user", auth.id);
    rec.set("keys", {});
  }
  // JSONField normalize edilmeden okunursa property erişimi sessizce boş kalır ve BAŞKA bir
  // sağlayıcının anahtarı kaybolurdu → jsonNesne ile gerçek nesneye çevrilir (birlikte var olma).
  const keys = L.jsonNesne(rec.get("keys"));
  if (b.anahtar) keys[sag] = String(b.anahtar); else delete keys[sag];
  rec.set("keys", keys);
  e.app.save(rec);
  return e.json(200, { ok: true }); // anahtar DEĞERİ asla dönmez
}, $apis.requireAuth());

// ---- Anahtar durumu (hangi sağlayıcıda kayıtlı anahtar var — değeri DÖNMEZ) ----
routerAdd("POST", "/ai/anahtar/durum", (e) => {
  const L = require(`${__hooks}/ai_lib.js`);
  const auth = e.requestInfo().auth;
  if (!auth) throw new UnauthorizedError("Giriş gerekli.");
  const keys = L.kullaniciAnahtarlari(e.app, auth.id);
  const durum = {};
  Object.keys(L.UST).forEach((k) => { durum[k] = !!keys[k] || !!$os.getenv(L.UST[k].env); });
  return e.json(200, durum); // YALNIZ boolean'lar: değer/prefix/hash/uzunluk YOK
}, $apis.requireAuth());

// ---- Proxy: mesajı sunucudan üst servise ilet (anahtar sunucudan) ----
// Anahtar önceliği: KULLANICI ai_keys → yoksa sunucu env fallback.
// (Telegram servis ucu bilerek FARKLIDIR: orada env fallback YOKTUR.)
routerAdd("POST", "/ai", (e) => {
  const L = require(`${__hooks}/ai_lib.js`);
  const auth = e.requestInfo().auth;
  if (!auth) throw new UnauthorizedError("Giriş gerekli.");
  const b = e.requestInfo().body || {};
  const sag = String(b.saglayici || "anthropic");
  const cfg = L.UST[sag];
  if (!cfg) throw new BadRequestError("Geçersiz sağlayıcı.");
  if (!b.govde || !b.govde.messages) throw new BadRequestError("govde.messages gerekli.");
  const key = L.anahtarBul(e.app, auth.id, sag);
  if (!key) return e.json(503, { message: sag + " için sunucuda kayıtlı anahtar yok." });
  const headers = { "content-type": "application/json" };
  if (cfg.tip === "anthropic") { headers["x-api-key"] = key; headers["anthropic-version"] = "2023-06-01"; }
  else { headers["Authorization"] = "Bearer " + key; }
  let res;
  try {
    res = $http.send({ url: L.ustUrl(sag), method: "POST", headers, body: JSON.stringify(b.govde), timeout: 120 });
  } catch (err) {
    return e.json(502, { message: "Üst servise ulaşılamadı: " + err });
  }
  return e.json(res.statusCode, res.json);
}, $apis.requireAuth());
