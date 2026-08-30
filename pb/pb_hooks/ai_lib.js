// ============================================================
// Tarayici AI proxy'si — paylasilan yardimcilar (CommonJS modul).
//
// NEDEN VAR: PocketBase 0.39.10 JSVM'de routerAdd() handler'lari dosya-seviyesi leksik
// sembolleri GOREMEZ. ai.pb.js handler'lari `UST` / `anahtarKaydiBul` / `anahtarBul`
// sembollerine dogrudan basvuruyordu ve bu yuzden /ai, /ai/anahtar, /ai/anahtar/durum
// HER ZAMAN "ReferenceError: ... is not defined" -> 400 donuyordu (sunucu-tarafli tarayici
// AI proxy'si hic calismadi). Cozum tg.pb.js'te zaten kanitlanmis desendir: paylasilan
// yardimcilar bir modulde durur, her handler bunu KENDI ICINDE require() eder.
//
// URUN DAVRANISI DEGISMEZ — bu yalniz calisma-modeli onarimidir:
//   • saglayici whitelist'i ayni (anthropic | gemini | openai), URL'ler SABIT (SSRF yok),
//   • /ai anahtar oncelik sirasi ayni: KULLANICI anahtari -> yoksa sunucu env fallback,
//   • anahtar degeri istemciye ASLA donmez.
//
// DIKKAT — Telegram T2 ile KASITLI FARK: Telegram servis ucu (tg_ai_lib.anahtarCoz)
// YALNIZ kullanicinin ai_keys kaydini kullanir, env fallback YOKTUR. Burasi tarayici
// yoludur ve env fallback KORUNUR. Iki kural birlestirilmemelidir.
// ============================================================

// Saglayici whitelist'i — URL'ler sunucu kontrollu ve SABIT. Yerel saglayicilar
// (ollama/lmstudio/ozel) ve kullanici tanimli adresler BU YOLA GIRMEZ.
const UST = {
  anthropic: { url: "https://api.anthropic.com/v1/messages", tip: "anthropic", env: "ANTHROPIC_API_KEY" },
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", tip: "openai", env: "GEMINI_API_KEY" },
  openai: { url: "https://api.openai.com/v1/chat/completions", tip: "openai", env: "OPENAI_API_KEY" },
};

// PB JSONField Goja'da duz JS nesnesi olarak gelmeyebilir (ham JSON sarmalayici).
// Property erisimi o durumda sessizce undefined verir -> gercek nesneye normalize et.
// Bu, "ikinci saglayici anahtari kaydedilirken birincisinin silinmesi" sinifindaki
// sessiz veri kaybini da onler.
function jsonNesne(deger) {
  if (deger == null) return {};
  if (typeof deger === "object" && !Array.isArray(deger)) {
    try { if (Object.keys(deger).length > 0) return deger; } catch (_) { /* sarmalayici */ }
  }
  try {
    const m = typeof deger === "string" ? deger : String(deger);
    const p = JSON.parse(m);
    return p && typeof p === "object" && !Array.isArray(p) ? p : {};
  } catch (_) { return {}; }
}

// Kullanicinin ai_keys kaydi (yoksa null). "kayit yok" ile "operasyonel hata" ayrimi:
// findRecordsByFilter bos eslesmede BOS DIZI doner; gercek DB hatasi throw eder ve
// burada YUTULMAZ -> route'ta 500 olarak yuzeye cikar.
function anahtarKaydiBul(app, userId) {
  const rows = app.findRecordsByFilter("ai_keys", "user = {:u}", "", 1, 0, { u: userId });
  return rows.length ? rows[0] : null;
}

// Kullanicinin bir saglayici icin sakli anahtarlari (normalize edilmis nesne).
function kullaniciAnahtarlari(app, userId) {
  const rec = anahtarKaydiBul(app, userId);
  return rec ? jsonNesne(rec.get("keys")) : {};
}

// TARAYICI yolu anahtar cozumu: KULLANICI anahtari once, sunucu env fallback sonra.
function anahtarBul(app, userId, sag) {
  const keys = kullaniciAnahtarlari(app, userId);
  if (keys[sag]) return String(keys[sag]);
  const cfg = UST[sag];
  return (cfg && $os.getenv(cfg.env)) || "";
}

// ---- TEST-ONLY upstream yonlendirmesi ----
// Sabit uretim URL'leri fake upstream'i imkansiz kilar. Override YALNIZ AI_PROXY_TEST_UPSTREAM
// env'i TANIMLI ve http + loopback/docker-host + acik port bicimindeyse kabul edilir; yalniz
// ORIGIN degistirilir, kanonik saglayici YOLU korunur. Uretimde bu env yoktur; olsa bile hedef
// loopback ile sinirlidir -> whitelist ZAYIFLAMAZ, yeni SSRF yuzeyi olusmaz.
// Kullanici kontrollu hicbir ayar (yerelAdres vb.) bu yola GIRMEZ.
const TEST_ORIGIN_RE = /^http:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal):[0-9]{2,5}$/;
function ustUrl(sag) {
  const cfg = UST[sag];
  if (!cfg) return "";
  let ov = "";
  try { ov = String($os.getenv("AI_PROXY_TEST_UPSTREAM") || "").trim().replace(/\/+$/, ""); } catch (_) { ov = ""; }
  if (!ov || !TEST_ORIGIN_RE.test(ov)) return cfg.url;
  return ov + cfg.url.replace(/^https?:\/\/[^/]+/, "");
}

module.exports = { UST, jsonNesne, anahtarKaydiBul, kullaniciAnahtarlari, anahtarBul, ustUrl };
