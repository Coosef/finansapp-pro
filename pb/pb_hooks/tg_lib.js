/// <reference path="../pb_data/types.d.ts" />
// Telegram T1A — paylaşılan yardımcılar (CommonJS module; .pb.js DEĞİL → PB hook olarak yüklemez).
// PB routerAdd handler'ları dosya-seviyesi scope'u göremediğinden, handler'lar bu modülü
// require(`${__hooks}/tg_lib.js`) ile içeri alır ve T.* üzerinden kullanır.

const TGID_RE = /^[0-9]{1,20}$/;
const PAIR_ALFABE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const HMAC_TOLERANS = 60;          // ±60 s
const NONCE_TTL_MS = 30 * 60000;   // replay retention ≥ 30 dk
const CODE_TTL_MS = 5 * 60000;     // pairing code 5 dk
const RL_PENCERE_MS = 15 * 60000;  // rate-limit penceresi 15 dk
const RL_MAX = 5;                  // pair-consume 5 / tgid / 15 dk
const UPDATE_LEASE_MS = 2 * 60000; // claim lease 2 dk
const CODE_GENERIC = "Kod geçersiz veya süresi dolmuş.";

function tgSecret(ad) {
  const dosya = $os.getenv(ad + "_FILE");
  if (dosya) {
    try { const c = $os.readFile(dosya); return (typeof c === "string" ? c : toString(c)).trim(); }
    catch (_) { return ""; }
  }
  const v = $os.getenv(ad);
  return v ? String(v).trim() : "";
}

// Telegram update_id: pozitif decimal integer (≤19 hane, 64-bit güvenli aralık).
const UPDATE_ID_RE = /^[0-9]{1,19}$/;
function validUpdateId(s) { return UPDATE_ID_RE.test(String(s || "")); }
// next_offset SERVER-DERIVED: tamamlanan update_id + 1 (BigInt, historical MAX değil).
function deriveNextOffset(uid) { return (BigInt(uid) + 1n).toString(); }

function nowSec() { return Math.floor(Date.now() / 1000); }
// PB DateField "YYYY-MM-DD HH:MM:SS.sssZ" bekler (DateTime().string() formatı).
function isoAt(msFromNow) { return new Date(Date.now() + (msFromNow || 0)).toISOString().replace("T", " "); }

// HMAC v1 doğrula (raw body once). Başarılıysa nonce'u atomik unique-insert eder + {body,tgid,ts} döner.
function serviceAuth(e, path) {
  const gw = tgSecret("TG_GATEWAY_SECRET");
  if (!gw) throw new ApiError(503, "Gateway secret yapılandırılmamış."); // FAIL CLOSED
  const gwPrev = tgSecret("TG_GATEWAY_SECRET_PREV");

  const h = e.request.header;
  const ver = h.get("X-TG-Version");
  const tsRaw = h.get("X-TG-Timestamp");
  const nonce = h.get("X-TG-Nonce");
  const sig = (h.get("X-TG-Signature") || "").toLowerCase();
  if (ver !== "1") throw new UnauthorizedError("Geçersiz imza sürümü.");
  if (!/^[0-9]{1,15}$/.test(tsRaw || "")) throw new UnauthorizedError("Geçersiz zaman damgası.");
  if (!nonce || nonce.length < 16 || nonce.length > 128) throw new UnauthorizedError("Geçersiz nonce.");
  if (!/^[0-9a-f]{64}$/.test(sig)) throw new UnauthorizedError("Geçersiz imza.");

  const ts = parseInt(tsRaw, 10);
  if (Math.abs(nowSec() - ts) > HMAC_TOLERANS) throw new UnauthorizedError("Zaman damgası penceresi dışında.");

  const rawBody = toString(e.request.body, 65536) || "";
  const bodyHash = $security.sha256(rawBody);
  const canonical = "v1\n" + ts + "\n" + nonce + "\n" + String(e.request.method).toUpperCase() + "\n" + path + "\n" + bodyHash;

  let ok = $security.equal(sig, $security.hs256(canonical, gw));
  if (!ok && gwPrev) ok = $security.equal(sig, $security.hs256(canonical, gwPrev));
  if (!ok) throw new UnauthorizedError("İmza doğrulanamadı.");

  let body = {};
  try { body = JSON.parse(rawBody || "{}"); } catch (_) { throw new BadRequestError("Geçersiz gövde."); }
  const tgid = body && body.telegram_user_id != null ? String(body.telegram_user_id) : "";

  try {
    const rec = new Record(e.app.findCollectionByNameOrId("telegram_service_requests"));
    rec.set("nonce", nonce);
    rec.set("timestamp", ts);
    rec.set("endpoint", path);
    rec.set("telegram_user_id", tgid);
    rec.set("expires_at", isoAt(NONCE_TTL_MS));
    e.app.save(rec);
  } catch (err) {
    throw new UnauthorizedError("Nonce tekrar kullanıldı."); // replay
  }
  return { body, tgid, ts };
}

function rateLimitAsildi(app, tgid, endpoint) {
  const esik = isoAt(-RL_PENCERE_MS);
  const rows = app.findRecordsByFilter(
    "telegram_service_requests",
    "telegram_user_id = {:t} && endpoint = {:e} && created > {:c}",
    "-created", RL_MAX + 5, 0,
    { t: tgid, e: endpoint, c: esik }
  );
  return rows.length > RL_MAX;
}

module.exports = {
  TGID_RE, PAIR_ALFABE, CODE_TTL_MS, UPDATE_LEASE_MS, CODE_GENERIC,
  tgSecret, nowSec, isoAt, serviceAuth, rateLimitAsildi,
  validUpdateId, deriveNextOffset,
};
