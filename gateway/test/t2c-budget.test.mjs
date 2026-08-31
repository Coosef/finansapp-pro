// ============================================================
// T2C.2 — DAYANIKLI UPSTREAM DENEME BÜTÇESİ (AI-T2C-BUDGET-01..08)
//
// GERÇEK PocketBase 0.39.10 (T2B/T2C.1/T2C.2 hook + migration'ları) + GERÇEK gateway
// (router / pb istemcisi / loop) + FAKE AI upstream + FAKE Telegram + PB hata enjeksiyon
// vekili. Dış AI servisi YOK, gerçek sağlayıcı anahtarı YOK.
//
// KANITLANAN SÖZLEŞME: ücretli sağlayıcı retry bütçesinin otoritesi PB'deki dayanıklı
// `telegram_ai_results.upstream_attempts` sayacıdır — gateway'in `reclaimed` bayrağı DEĞİL.
// 409 processing ve PB iç 5xx bu bütçeyi TÜKETMEZ; slot yalnız gerçek bir $http.send
// yapılacakken ve KALICILAŞTIRILDIKTAN SONRA harcanır.
// ============================================================
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pbIstemci } from "../src/pb.js";
import { tgIstemci } from "../src/telegram.js";
import { pollOnce } from "../src/loop.js";
import { aiHafiza } from "../src/ai-memory.js";

const REPO = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const C = "finansapp-t2c-budget", PORT = 8099, PB = `http://localhost:${PORT}`;
const AI_PORT = 8796;      // fake AI upstream
const PROXY_PORT = 8097;   // gateway → (vekil) → PB   [PB iç 5xx enjeksiyonu için]
const GW = crypto.randomBytes(24).toString("hex"), PEP = crypto.randomBytes(24).toString("hex");
const BOT = "123456:BUD-" + crypto.randomBytes(6).toString("hex");
const TGID = "666000333";
const USER = { email: "budget@finansapp.test", password: "budgetpassword123" };
const ADMIN = { email: "budget-admin@finansapp.test", password: "adm-" + crypto.randomBytes(8).toString("hex") };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let DD = "", adminTok = "", userTok = "", userId = "", linkId = "", pb = null, tg = null, FIN_ONCE = null;
let fakeAi = null, fakeTgSrv = null, proxy = null, tgBase = "";
const aiState = { istekler: [], mod: "ok" };
const tgState = { updates: [], sent: [], sendFail: false };
const proxyState = { enjekte: 0, kod: 503, yol: "/api/tg/service/ai", gecen: 0 };

const docker = (a) => execFileSync("docker", a, { stdio: ["ignore", "pipe", "pipe"] }).toString();
const dockerSessiz = (a) => { try { docker(a); } catch { /* yoktu */ } };

// ---- Fake AI upstream: mod'a göre 200 / 500 / askıda ----
function fakeAiBaslat() {
  return new Promise((res) => {
    const s = http.createServer(async (req, r) => {
      const ch = []; for await (const c of req) ch.push(c);
      let b = {}; try { b = JSON.parse(Buffer.concat(ch).toString() || "{}"); } catch { /* */ }
      aiState.istekler.push({ url: req.url, body: b });
      if (aiState.mod === "hang") return;                       // yanıt yok → PB timeout → 504
      if (aiState.mod === "500") { r.writeHead(500, { "Content-Type": "application/json" }); return r.end('{"error":"sim"}'); }
      const metin = `Bütçe cevabı [#${aiState.istekler.length}]`;
      r.writeHead(200, { "Content-Type": "application/json" });
      r.end(JSON.stringify({ content: [{ type: "text", text: metin }] }));
    });
    s.listen(AI_PORT, "0.0.0.0", () => res(s));
  });
}

// ---- PB hata enjeksiyon vekili: gateway → vekil → PB ----
// HMAC v1 kanoniği METHOD + PATH + sha256(rawBody) üzerindendir; vekil yolu ve gövdeyi
// BİREBİR iletir → imza bozulmaz. `enjekte` sayacı > 0 iken hedef yol PB'ye HİÇ ulaşmaz.
function vekilBaslat() {
  return new Promise((res) => {
    const s = http.createServer(async (req, r) => {
      const ch = []; for await (const c of req) ch.push(c);
      const ham = Buffer.concat(ch);
      if (proxyState.enjekte > 0 && req.url === proxyState.yol) {
        proxyState.enjekte -= 1;
        r.writeHead(proxyState.kod, { "Content-Type": "application/json" });
        return r.end(JSON.stringify({ error: "simulated_pb_internal" }));
      }
      proxyState.gecen += 1;
      const basliklar = { ...req.headers };
      delete basliklar.host; delete basliklar["content-length"];
      try {
        const ust = await fetch(PB + req.url, { method: req.method, headers: basliklar, body: ham.length ? ham : undefined });
        const govde = Buffer.from(await ust.arrayBuffer());
        r.writeHead(ust.status, { "Content-Type": ust.headers.get("content-type") || "application/json" });
        r.end(govde);
      } catch (e) {
        r.writeHead(502, { "Content-Type": "application/json" });
        r.end(JSON.stringify({ error: "proxy_upstream", detay: String(e && e.message) }));
      }
    });
    s.listen(PROXY_PORT, "127.0.0.1", () => res(s));
  });
}

function fakeTelegramBaslat() {
  return new Promise((res) => {
    const s = http.createServer(async (req, r) => {
      const ch = []; for await (const c of req) ch.push(c);
      let b = {}; try { b = JSON.parse(Buffer.concat(ch).toString() || "{}"); } catch { /* */ }
      const metot = req.url.split("/").pop().split("?")[0];
      r.setHeader("Content-Type", "application/json");
      if (metot === "getUpdates") {
        if (b.offset != null) tgState.updates = tgState.updates.filter((u) => u.update_id >= b.offset);
        return r.end(JSON.stringify({ ok: true, result: tgState.updates }));
      }
      if (metot === "sendMessage") {
        if (tgState.sendFail) { r.statusCode = 500; return r.end(JSON.stringify({ ok: false, error_code: 500, description: "sim" })); }
        tgState.sent.push(b);
        return r.end(JSON.stringify({ ok: true, result: { message_id: tgState.sent.length } }));
      }
      return r.end(JSON.stringify({ ok: true, result: {} }));
    });
    s.listen(0, "127.0.0.1", () => res(s));
  });
}

async function api(yol, opts = {}) {
  const r = await fetch(PB + yol, opts);
  let j = null; try { j = await r.json(); } catch { /* */ }
  return { status: r.status, json: j };
}
const yonetici = (extra = {}) => ({ Authorization: adminTok, "Content-Type": "application/json", ...extra });
const iso = (ms) => new Date(Date.now() + ms).toISOString().replace("T", " ");
const mesaj = (uid, text) => ({ update_id: uid, message: { chat: { id: 778, type: "private" }, from: { id: Number(TGID), is_bot: false }, text } });

// t2b-v3 kanoniği (tg_ai_context.hashKanonik ile BİREBİR aynı) → PB'nin ürettiği
// request_hash test tarafında bağımsız olarak yeniden üretilebilir.
const kanonik = (uid, soru) => JSON.stringify(["t2b-v3", String(linkId), String(userId), String(TGID), String(uid), String(soru)]);
const istekHash = (uid, soru) => crypto.createHash("sha256").update(kanonik(uid, soru)).digest("hex");

async function aiSatir(uid) {
  const q = encodeURIComponent(`update_id="${uid}"`);
  const r = await api(`/api/collections/telegram_ai_results/records?filter=${q}`, { headers: { Authorization: adminTok } });
  return ((r.json && r.json.items) || [])[0] || null;
}
const denemeSayisi = async (uid) => { const s = await aiSatir(uid); return s ? Number(s.upstream_attempts || 0) : null; };

// Aktif lease'li PROCESSING satırı kur → sonraki istek 409 processing alır.
async function islemdeSatirKur(uid, soru) {
  const mevcut = await aiSatir(uid);
  const govde = { update_id: String(uid), request_hash: istekHash(uid, soru), status: "processing", lease_until: iso(90000), expires_at: iso(29 * 60000) };
  if (mevcut) {
    await api(`/api/collections/telegram_ai_results/records/${mevcut.id}`, { method: "PATCH", headers: yonetici(), body: JSON.stringify({ lease_until: iso(90000) }) });
    return mevcut.id;
  }
  const r = await api("/api/collections/telegram_ai_results/records", { method: "POST", headers: yonetici(), body: JSON.stringify(govde) });
  assert.equal(r.status, 200, "processing fixture yazılamadı: " + JSON.stringify(r.json));
  return r.json.id;
}
async function aiLeaseSerbest(uid) {
  const s = await aiSatir(uid);
  if (s) await api(`/api/collections/telegram_ai_results/records/${s.id}`, { method: "PATCH", headers: yonetici(), body: JSON.stringify({ lease_until: null }) });
}
// telegram_updates satırını yeniden claim edilebilir yap (crash-recovery yolu).
async function updateLeaseGecmise(uid) {
  const q = encodeURIComponent(`update_id="${uid}"`);
  const s = (await api(`/api/collections/telegram_updates/records?filter=${q}`, { headers: { Authorization: adminTok } })).json.items[0];
  if (s) await api(`/api/collections/telegram_updates/records/${s.id}`, { method: "PATCH", headers: yonetici(), body: JSON.stringify({ lease_until: new Date(Date.now() - 600000).toISOString().replace("T", " ") }) });
}
// Taze-AI kota işaretçilerini temizle (kota T2B'nin kendi testlerinde ayrıca doğrulanır).
async function kotaSifirla() {
  const q = encodeURIComponent(`telegram_user_id="${TGID}"`);
  const r = await api(`/api/collections/telegram_service_requests/records?perPage=500&filter=${q}`, { headers: { Authorization: adminTok } });
  for (const it of (r.json && r.json.items) || []) {
    if (String(it.endpoint || "").indexOf("#fresh") !== -1) {
      await api(`/api/collections/telegram_service_requests/records/${it.id}`, { method: "DELETE", headers: yonetici() });
    }
  }
}
const yeniGateway = () => pbIstemci({ pbUrl: `http://127.0.0.1:${PROXY_PORT}`, gwSecret: GW, pbTimeoutMs: 15000, pbAiTimeoutMs: 60000 });
async function tur(uid, soru, hafiza, istemci) {
  tgState.updates = [mesaj(uid, soru)];
  return await pollOnce({ pb: istemci || pb, tg, aiHafiza: hafiza || aiHafiza(), pollTimeout: 1, pollLimit: 10 });
}
async function saglikBekle(maxSn = 45) {
  for (let i = 0; i < maxSn; i++) {
    try { if ((await fetch(PB + "/api/health")).ok) return true; } catch { /* */ }
    await sleep(1000);
  }
  return false;
}

before(async () => {
  DD = mkdtempSync(join(tmpdir(), "fa-bud-pb-"));
  dockerSessiz(["rm", "-f", C]);
  docker(["run", "-d", "--name", C, "-p", `${PORT}:8090`, "--add-host=host.docker.internal:host-gateway",
    "-e", "FINANSAPP_CAS_ENFORCE=1", "-e", `TG_GATEWAY_SECRET=${GW}`, "-e", `TG_PAIRING_PEPPER=${PEP}`,
    "-e", `TG_AI_TEST_UPSTREAM=http://host.docker.internal:${AI_PORT}`, "-e", "TG_AI_TEST_TIMEOUT_SN=3",
    "-v", `${REPO}/pb/pb_hooks:/pb_hooks`, "-v", `${REPO}/pb/pb_migrations:/pb_migrations`, "-v", `${DD}:/pb_data`,
    "ghcr.io/muchobien/pocketbase:0.39.10", "serve", "--http=0.0.0.0:8090", "--dir=/pb_data",
    "--migrationsDir=/pb_migrations", "--hooksDir=/pb_hooks"]);
  assert.ok(await saglikBekle(60), "PB sağlık zaman aşımı");
  docker(["exec", C, "/usr/local/bin/pocketbase", "superuser", "upsert", ADMIN.email, ADMIN.password, "--dir=/pb_data"]);
  adminTok = (await api("/api/collections/_superusers/auth-with-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: ADMIN.email, password: ADMIN.password }) })).json.token;

  await api("/api/collections/users/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: USER.email, password: USER.password, passwordConfirm: USER.password }) });
  const auth = (await api("/api/collections/users/auth-with-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: USER.email, password: USER.password }) })).json;
  userTok = auth.token; userId = auth.record.id;

  const n = new Date(); const ay = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  await api(`/api/collections/users/records/${userId}`, { method: "PATCH", headers: yonetici(), body: JSON.stringify({
    data: { giderler: [{ id: "e1", baslik: "Kira ödemesi", kategori: "Kira", miktar: 22000, tarih: `${ay}-03` }],
            hesaplar: [{ id: "a1", ad: "Vadesiz", tip: "banka", bakiye: 100000 }],
            ayarlar: { kuruldu: true, aiSaglayici: "anthropic", model: "claude-opus-4-8" } }, revision: 3 }) });
  await api("/api/collections/ai_keys/records", { method: "POST", headers: yonetici(), body: JSON.stringify({ user: userId, keys: { anthropic: "user-key-budget" } }) });

  fakeAi = await fakeAiBaslat();
  fakeTgSrv = await fakeTelegramBaslat();
  proxy = await vekilBaslat();
  tgBase = `http://127.0.0.1:${fakeTgSrv.address().port}`;
  pb = yeniGateway();                                  // gateway HER ZAMAN vekil üzerinden konuşur
  tg = tgIstemci({ apiBase: tgBase, botToken: BOT });

  const kod = (await api("/api/tg/user/pair-code", { method: "POST", headers: { Authorization: userTok, "Content-Type": "application/json" }, body: "{}" })).json.code;
  assert.equal((await pb.pairConsume(TGID, kod)).status, 200);
  const link = (await api(`/api/collections/telegram_links/records?filter=${encodeURIComponent(`telegram_user_id="${TGID}"`)}`, { headers: { Authorization: adminTok } })).json.items[0];
  linkId = link.id;
  FIN_ONCE = (await api(`/api/collections/users/records/${userId}`, { headers: { Authorization: adminTok } })).json; // finansal değişmezlik referansı
});

after(async () => {
  for (const s of [fakeAi, fakeTgSrv, proxy]) if (s) await new Promise((r) => s.close(r));
  dockerSessiz(["rm", "-f", C]);
  try { rmSync(DD, { recursive: true, force: true }); } catch { /* */ }
});

// ------------------------------------------------------------

test("AI-T2C-BUDGET-01 409 processing bütçe TÜKETMEZ → sonraki GERÇEK transient attempt=1", async () => {
  await kotaSifirla();
  aiState.istekler = []; aiState.mod = "ok"; tgState.sent = []; tgState.sendFail = false;
  const UID = 5001, SORU = "Bütçe sorusu bir";

  // (1) İlk servis denemesi 409 processing alsın: aktif lease'li satır önceden kurulur.
  //     Bu satır PB'nin ürettiğiyle AYNI t2b-v3 hash'ini taşır (aksi hâlde conflict gelirdi).
  await islemdeSatirKur(UID, SORU);
  const r1 = await tur(UID, SORU);
  assert.equal(r1.islenmis, 0, "409 processing → TransientError, update tamamlanmamalı");
  assert.ok(r1.transient, "geçici hata sinyali beklenir");
  assert.equal(tgState.sent.length, 0, "terminal mesaj GÖNDERİLMEMELİ (conflict değil, processing)");
  assert.equal(aiState.istekler.length, 0, "sağlayıcı ÇAĞRILMAMALI");
  assert.equal(await denemeSayisi(UID), 0, "409 processing upstream_attempts'i ARTIRMAMALI");

  // (2) Lease serbest + update yeniden claim edilebilir; artık GERÇEK upstream çağrısı olur.
  await aiLeaseSerbest(UID);
  await updateLeaseGecmise(UID);
  aiState.mod = "500"; // sağlayıcı geçici hata → PB 502/transient

  const r2 = await tur(UID, SORU);
  assert.equal(r2.islenmis, 0, "İLK gerçek transient hâlâ retry edilebilir olmalı (terminal DEĞİL)");
  assert.ok(r2.transient, "TransientError beklenir");
  assert.equal(tgState.sent.length, 0, "attempt=1'de terminal güvenli mesaj gönderilmez");
  assert.equal(aiState.istekler.length, 1, "tam olarak bir sağlayıcı çağrısı");
  assert.equal(await denemeSayisi(UID), 1, "ilk GERÇEK çağrı slot 1'i tüketmeli");
});

test("AI-T2C-BUDGET-02 tekrarlanan 409 processing → upstream_attempts 0'da kalır", async () => {
  await kotaSifirla();
  aiState.istekler = []; aiState.mod = "ok";
  const UID = 5011, SORU = "Bütçe sorusu iki";
  await islemdeSatirKur(UID, SORU);

  for (let i = 0; i < 3; i++) {
    const r = await pb.aiAsk({ tgid: TGID, updateId: String(UID), question: SORU, history: [] });
    assert.equal(r.status, 409, `#${i + 1} 409 beklenir`);
    assert.deepEqual(r.json, { error: "processing" }, `#${i + 1} processing beklenir`);
  }
  assert.equal(aiState.istekler.length, 0, "hiç sağlayıcı çağrısı olmamalı");
  assert.equal(await denemeSayisi(UID), 0, "upstream_attempts 0'da kalmalı");
});

test("AI-T2C-BUDGET-03 PB iç 503 bütçe TÜKETMEZ → sonraki gerçek transient hâlâ attempt=1", async () => {
  await kotaSifirla();
  aiState.istekler = []; aiState.mod = "500"; tgState.sent = []; tgState.sendFail = false;
  const UID = 5021, SORU = "Bütçe sorusu üç";

  // PB iç 503: istek PB'ye HİÇ ulaşmaz (vekil keser) → upstream slot da yazılamaz.
  proxyState.enjekte = 1; proxyState.kod = 503;
  const r1 = await tur(UID, SORU);
  assert.equal(proxyState.enjekte, 0, "enjeksiyon tüketilmeli");
  assert.equal(r1.islenmis, 0, "PB iç 5xx → TransientError");
  assert.equal(aiState.istekler.length, 0, "sağlayıcı çağrısı olmamalı");
  assert.equal(await aiSatir(UID), null, "PB isteği hiç görmediği için satır bile oluşmamalı");

  // Şimdi GERÇEK upstream çağrısı: dayanıklı sayaç hâlâ sıfırdan başlar.
  await updateLeaseGecmise(UID);
  const r2 = await tur(UID, SORU);
  assert.equal(r2.islenmis, 0, "ilk gerçek transient → retry");
  assert.equal(tgState.sent.length, 0, "terminal mesaj yok");
  assert.equal(aiState.istekler.length, 1, "tam olarak bir sağlayıcı çağrısı");
  assert.equal(await denemeSayisi(UID), 1, "503 SONRASI ilk gerçek çağrı attempt=1 olmalı");
});

test("AI-T2C-BUDGET-04 gerçek transient 1 → retry, 2 → terminal; sağlayıcı çağrısı TAM 2", async () => {
  await kotaSifirla();
  aiState.istekler = []; aiState.mod = "500"; tgState.sent = []; tgState.sendFail = false;
  const UID = 5031, SORU = "Bütçe sorusu dört";

  const r1 = await tur(UID, SORU);
  assert.equal(r1.islenmis, 0, "attempt=1 → retry");
  assert.equal(await denemeSayisi(UID), 1);
  assert.equal(aiState.istekler.length, 1);
  assert.equal(tgState.sent.length, 0);

  await updateLeaseGecmise(UID);
  const r2 = await tur(UID, SORU);
  assert.equal(r2.islenmis, 1, "attempt=2 → güvenli mesaj + done (terminal)");
  assert.equal(tgState.sent.length, 1, "kullanıcıya bir güvenli geçici-hata mesajı");
  assert.equal(await denemeSayisi(UID), 2, "ikinci slot tüketildi");
  assert.equal(aiState.istekler.length, 2, "sağlayıcı TAM 2 kez çağrıldı");
});

test("AI-T2C-BUDGET-05 tükenmişken güvenli mesaj teslimi başarısız → exhausted, sağlayıcı çağrısı 2'de kalır", async () => {
  await kotaSifirla();
  aiState.istekler = []; aiState.mod = "500"; tgState.sent = []; tgState.sendFail = false;
  const UID = 5041, SORU = "Bütçe sorusu beş";

  await tur(UID, SORU);                       // attempt 1
  await updateLeaseGecmise(UID);
  tgState.sendFail = true;                     // attempt 2 terminal olur ama MESAJ İLETİLEMEZ
  const r2 = await tur(UID, SORU);
  assert.equal(r2.islenmis, 0, "gönderim başarısız → tamamlanmadı");
  assert.equal(await denemeSayisi(UID), 2, "iki slot tüketildi");
  assert.equal(aiState.istekler.length, 2, "sağlayıcı 2 kez çağrıldı");

  // Aynı update yeniden claim edilir: PB bütçe dolu olduğu için sağlayıcıyı ÇAĞIRMAZ.
  await updateLeaseGecmise(UID);
  await aiLeaseSerbest(UID);
  tgState.sendFail = false; tgState.sent = [];
  const r3 = await tur(UID, SORU);
  assert.equal(r3.islenmis, 1, "exhausted → güvenli terminal mesaj + done");
  assert.equal(tgState.sent.length, 1, "güvenli mesaj sonunda iletildi");
  assert.equal(aiState.istekler.length, 2, "EK sağlayıcı çağrısı YOK (tam 2)");
  assert.equal(await denemeSayisi(UID), 2, "sayaç 2'de kalır, artmaz");

  // Sözleşme düzeyinde de doğrula: exhausted=true, attempt=2, sağlayıcı çağrılmadı.
  await aiLeaseSerbest(UID);
  const dogrudan = await pb.aiAsk({ tgid: TGID, updateId: String(UID), question: SORU, history: [] });
  assert.equal(dogrudan.status, 502);
  assert.deepEqual(dogrudan.json, { error: "upstream", class: "transient", attempt: 2, exhausted: true });
  assert.equal(aiState.istekler.length, 2, "exhausted yanıtı sağlayıcıya gitmez");
});

test("AI-T2C-BUDGET-06 gateway süreç restart'ı bütçeyi KORUR (attempt 1 → restart → attempt 2)", async () => {
  await kotaSifirla();
  aiState.istekler = []; aiState.mod = "500"; tgState.sent = []; tgState.sendFail = false;
  const UID = 5051, SORU = "Bütçe sorusu altı";

  const hafiza1 = aiHafiza();
  await tur(UID, SORU, hafiza1);
  assert.equal(await denemeSayisi(UID), 1, "attempt 1");
  assert.equal(aiState.istekler.length, 1);

  // SÜREÇ YENİDEN BAŞLADI: yeni pb istemcisi + yeni (boş) bellek. Gateway'de sayaç YOK.
  const pb2 = yeniGateway();
  const hafiza2 = aiHafiza();
  assert.deepEqual(hafiza2.al(TGID), [], "restart sonrası bellek boş");

  await updateLeaseGecmise(UID);
  const r2 = await tur(UID, SORU, hafiza2, pb2);
  assert.equal(r2.islenmis, 1, "dayanıklı sayaç sayesinde ikinci deneme TERMİNAL olmalı");
  assert.equal(tgState.sent.length, 1, "güvenli terminal mesaj");
  assert.equal(await denemeSayisi(UID), 2, "sayaç restart'tan etkilenmez");
  assert.equal(aiState.istekler.length, 2, "sağlayıcı TAM 2 kez çağrıldı");
});

test("AI-T2C-BUDGET-07 PB restart sayacı KORUR; sayaç ASLA azalmaz, toplam çağrı 2'yi aşamaz", async () => {
  await kotaSifirla();
  aiState.istekler = []; aiState.mod = "500"; tgState.sent = []; tgState.sendFail = false;
  const UID = 5061, SORU = "Bütçe sorusu yedi";

  await tur(UID, SORU);                       // attempt 1 → sayaç KALICI olarak 1
  assert.equal(await denemeSayisi(UID), 1);
  assert.equal(aiState.istekler.length, 1);

  // PB süreci yeniden başlatılır (artırım kalıcılaştıktan SONRA çökme senaryosu).
  docker(["restart", C]);
  assert.ok(await saglikBekle(60), "PB restart sonrası sağlık zaman aşımı");
  assert.equal(await denemeSayisi(UID), 1, "sayaç restart'tan sağ çıkmalı ve AZALMAMALI");

  await updateLeaseGecmise(UID);
  await aiLeaseSerbest(UID);
  const r2 = await tur(UID, SORU);
  assert.equal(r2.islenmis, 1, "ikinci (son) slot → terminal");
  assert.equal(await denemeSayisi(UID), 2);
  assert.equal(aiState.istekler.length, 2, "toplam sağlayıcı çağrısı 2");

  // Üçüncü bir sağlayıcı çağrısı MÜMKÜN DEĞİL.
  await aiLeaseSerbest(UID);
  for (let i = 0; i < 3; i++) {
    const r = await pb.aiAsk({ tgid: TGID, updateId: String(UID), question: SORU, history: [] });
    assert.equal(r.json.exhausted, true, `#${i + 1} exhausted beklenir`);
    assert.equal(r.json.attempt, 2);
    await aiLeaseSerbest(UID);
  }
  assert.equal(aiState.istekler.length, 2, "sağlayıcı çağrısı 2'yi ASLA aşmaz");
  assert.equal(await denemeSayisi(UID), 2, "sayaç 2'de sabit kalır");
});

test("AI-T2C-BUDGET-08 finansal veri hiç değişmedi (bütün bütçe senaryoları READ-ONLY)", async () => {
  const u = (await api(`/api/collections/users/records/${userId}`, { headers: { Authorization: adminTok } })).json;
  assert.equal(u.revision, FIN_ONCE.revision, "revision değişmemeli");
  assert.deepEqual(u.data, FIN_ONCE.data, "users.data değişmemeli");   // anahtar sırası önemsiz
  assert.equal(u.updated, FIN_ONCE.updated, "users kaydına hiç yazılmamalı");
});
