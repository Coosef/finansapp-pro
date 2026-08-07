/// <reference path="../pb_data/types.d.ts" />
// AI proxy — anahtarlar SUNUCUDA (ai_keys koleksiyonu, API'den okunamaz) veya env'de.
// İstemci yalnız mesaj gönderir; anahtar cihaza/tarayıcıya asla dönmez.
// Sağlayıcı whitelist'i → SSRF yok. Tüm uçlar giriş (auth) ister.

const UST = {
  anthropic: { url: "https://api.anthropic.com/v1/messages", tip: "anthropic", env: "ANTHROPIC_API_KEY" },
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", tip: "openai", env: "GEMINI_API_KEY" },
  openai: { url: "https://api.openai.com/v1/chat/completions", tip: "openai", env: "OPENAI_API_KEY" },
};

function anahtarKaydiBul(app, userId) {
  try {
    return app.findFirstRecordByFilter("ai_keys", "user = {:u}", { u: userId });
  } catch (_) {
    return null;
  }
}
function anahtarBul(app, userId, sag) {
  const rec = anahtarKaydiBul(app, userId);
  const keys = (rec && rec.get("keys")) || {};
  if (keys[sag]) return String(keys[sag]);
  return $os.getenv(UST[sag].env) || "";
}

// ---- Anahtar kaydet (write-only: istemci okuyamaz) ----
routerAdd("POST", "/ai/anahtar", (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new UnauthorizedError("Giriş gerekli.");
  const b = e.requestInfo().body || {};
  const sag = String(b.saglayici || "");
  if (!UST[sag]) throw new BadRequestError("Geçersiz sağlayıcı.");
  let rec = anahtarKaydiBul(e.app, auth.id);
  if (!rec) { rec = new Record(e.app.findCollectionByNameOrId("ai_keys")); rec.set("user", auth.id); rec.set("keys", {}); }
  const keys = rec.get("keys") || {};
  if (b.anahtar) keys[sag] = String(b.anahtar); else delete keys[sag];
  rec.set("keys", keys);
  e.app.save(rec);
  return e.json(200, { ok: true });
}, $apis.requireAuth());

// ---- Anahtar durumu (hangi sağlayıcıda kayıtlı anahtar var — değeri DÖNMEZ) ----
routerAdd("POST", "/ai/anahtar/durum", (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new UnauthorizedError("Giriş gerekli.");
  const rec = anahtarKaydiBul(e.app, auth.id);
  const keys = (rec && rec.get("keys")) || {};
  const durum = {};
  Object.keys(UST).forEach((k) => { durum[k] = !!keys[k] || !!$os.getenv(UST[k].env); });
  return e.json(200, durum);
}, $apis.requireAuth());

// ---- Proxy: mesajı sunucudan üst servise ilet (anahtar sunucudan) ----
routerAdd("POST", "/ai", (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new UnauthorizedError("Giriş gerekli.");
  const b = e.requestInfo().body || {};
  const sag = String(b.saglayici || "anthropic");
  const cfg = UST[sag];
  if (!cfg) throw new BadRequestError("Geçersiz sağlayıcı.");
  if (!b.govde || !b.govde.messages) throw new BadRequestError("govde.messages gerekli.");
  const key = anahtarBul(e.app, auth.id, sag);
  if (!key) return e.json(503, { message: sag + " için sunucuda kayıtlı anahtar yok." });
  const headers = { "content-type": "application/json" };
  if (cfg.tip === "anthropic") { headers["x-api-key"] = key; headers["anthropic-version"] = "2023-06-01"; }
  else { headers["Authorization"] = "Bearer " + key; }
  let res;
  try {
    res = $http.send({ url: cfg.url, method: "POST", headers, body: JSON.stringify(b.govde), timeout: 120 });
  } catch (err) {
    return e.json(502, { message: "Üst servise ulaşılamadı: " + err });
  }
  return e.json(res.statusCode, res.json);
}, $apis.requireAuth());
