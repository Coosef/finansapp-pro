// ============================================================
// T2C ENTEGRASYON — GERÇEK PocketBase 0.39.10 (T2B hook/migration'ları) + FAKE AI upstream
// + FAKE Telegram + GERÇEK gateway (router / pb istemcisi / loop).
// Dış AI servisi YOK, gerçek bot YOK, gerçek sağlayıcı anahtarı YOK.
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
const C = "finansapp-t2c-it", PORT = 8098, PB = `http://localhost:${PORT}`;
const AI_PORT = 8799;
const GW = crypto.randomBytes(24).toString("hex"), PEP = crypto.randomBytes(24).toString("hex");
const BOT = "123456:T2C-" + crypto.randomBytes(6).toString("hex");
const TGID = "666000222";
const USER = { email: "t2c@finansapp.test", password: "t2cpassword123" };
const ADMIN = { email: "t2c-admin@finansapp.test", password: "adm-" + crypto.randomBytes(8).toString("hex") };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let DD = "", adminTok = "", userTok = "", userId = "", pb = null, tg = null;
let fakeAi = null, fakeTgSrv = null;
const aiState = { istekler: [] };
const tgState = { updates: [], sent: [], sendFail: false };

const docker = (a) => execFileSync("docker", a, { stdio: ["ignore", "pipe", "pipe"] }).toString();
const dockerSessiz = (a) => { try { docker(a); } catch { /* yoktu */ } };

function fakeAiBaslat() {
  return new Promise((res) => {
    const s = http.createServer(async (req, r) => {
      const ch = []; for await (const c of req) ch.push(c);
      let b = {}; try { b = JSON.parse(Buffer.concat(ch).toString() || "{}"); } catch { /* */ }
      aiState.istekler.push({ url: req.url, body: b });
      r.writeHead(200, { "Content-Type": "application/json" });
      r.end(JSON.stringify({ content: [{ type: "text", text: "Bu ay en çok Kira kaleminde harcadın." }] }));
    });
    s.listen(AI_PORT, "0.0.0.0", () => res(s));
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

before(async () => {
  DD = mkdtempSync(join(tmpdir(), "fa-t2c-pb-"));
  dockerSessiz(["rm", "-f", C]);
  docker(["run", "-d", "--name", C, "-p", `${PORT}:8090`, "--add-host=host.docker.internal:host-gateway",
    "-e", "FINANSAPP_CAS_ENFORCE=1", "-e", `TG_GATEWAY_SECRET=${GW}`, "-e", `TG_PAIRING_PEPPER=${PEP}`,
    "-e", `TG_AI_TEST_UPSTREAM=http://host.docker.internal:${AI_PORT}`, "-e", "TG_AI_TEST_TIMEOUT_SN=5",
    "-v", `${REPO}/pb/pb_hooks:/pb_hooks`, "-v", `${REPO}/pb/pb_migrations:/pb_migrations`, "-v", `${DD}:/pb_data`,
    "ghcr.io/muchobien/pocketbase:0.39.10", "serve", "--http=0.0.0.0:8090", "--dir=/pb_data",
    "--migrationsDir=/pb_migrations", "--hooksDir=/pb_hooks"]);
  for (let i = 0; i < 60; i++) { try { if ((await fetch(PB + "/api/health")).ok) break; } catch { /* */ } await sleep(1000); }
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
  await api("/api/collections/ai_keys/records", { method: "POST", headers: yonetici(), body: JSON.stringify({ user: userId, keys: { anthropic: "user-key-t2c" } }) });

  fakeAi = await fakeAiBaslat();
  fakeTgSrv = await fakeTelegramBaslat();
  const tgBase = `http://127.0.0.1:${fakeTgSrv.address().port}`;
  pb = pbIstemci({ pbUrl: PB, gwSecret: GW, pbTimeoutMs: 15000, pbAiTimeoutMs: 60000 });
  tg = tgIstemci({ apiBase: tgBase, botToken: BOT });

  // Gerçek pairing akışıyla bağla.
  const kod = (await api("/api/tg/user/pair-code", { method: "POST", headers: { Authorization: userTok, "Content-Type": "application/json" }, body: "{}" })).json.code;
  const c = await pb.pairConsume(TGID, kod);
  assert.equal(c.status, 200);
});

after(async () => {
  if (fakeAi) await new Promise((r) => fakeAi.close(r));
  if (fakeTgSrv) await new Promise((r) => fakeTgSrv.close(r));
  dockerSessiz(["rm", "-f", C]);
  try { rmSync(DD, { recursive: true, force: true }); } catch { /* */ }
});

const kullanici = async () => (await api(`/api/collections/users/records/${userId}`, { headers: { Authorization: adminTok } })).json;
const mesaj = (uid, text) => ({ update_id: uid, message: { chat: { id: 777, type: "private" }, from: { id: Number(TGID), is_bot: false }, text } });

test("AI-T2C-E2E-01 uçtan uca: serbest metin → imzalı PB /service/ai → fake AI → Telegram", async () => {
  const once = await kullanici();
  aiState.istekler = []; tgState.sent = []; tgState.sendFail = false;
  tgState.updates = [mesaj(4001, "Bu ay en çok neye harcadım?")];

  const hafiza = aiHafiza();
  const r = await pollOnce({ pb, tg, aiHafiza: hafiza, pollTimeout: 1, pollLimit: 10 });
  assert.equal(r.islenmis, 1, "update tamamlanmalı");
  assert.equal(aiState.istekler.length, 1, "tek upstream AI çağrısı");
  assert.equal(tgState.sent.length, 1, "tek Telegram mesajı");
  assert.match(tgState.sent[0].text, /Kira/);

  // Sanitize context: ham findata/id/e-posta upstream'e gitmemeli.
  const govde = JSON.stringify(aiState.istekler[0].body);
  for (const y of [userId, USER.email, "user-key-t2c", "Kira ödemesi", "baslik", "revision", TGID]) {
    assert.ok(!govde.includes(y), "yasak alan upstream'e gitti: " + y);
  }
  // Finansal değişmezlik
  const sonra = await kullanici();
  assert.equal(sonra.revision, once.revision, "revision değişmemeli");
  assert.equal(JSON.stringify(sonra.data), JSON.stringify(once.data), "users.data değişmemeli");
  // Bellek yalnız complete SONRASI işlendi
  assert.equal(hafiza.al(TGID).length, 1, "başarılı turdan sonra bellek işlenir");
});

test("AI-T2C-IDEM-02 teslim kaybı → retry T2B DONE cache'ini kullanır, upstream çağrısı 1'de kalır", async () => {
  aiState.istekler = []; tgState.sent = []; tgState.sendFail = true;
  tgState.updates = [mesaj(4002, "Geçen aya göre giderim arttı mı?")];
  const hafiza = aiHafiza();

  const r1 = await pollOnce({ pb, tg, aiHafiza: hafiza, pollTimeout: 1, pollLimit: 10 });
  assert.equal(r1.islenmis, 0, "gönderim başarısız → tamamlanmadı");
  assert.equal(aiState.istekler.length, 1, "AI bir kez çağrıldı");
  assert.deepEqual(hafiza.al(TGID), [], "complete olmadan bellek işlenmez");

  // Lease'i geçmişe çek → yeniden claim edilebilsin (crash-recovery yolu).
  const satir = (await api(`/api/collections/telegram_updates/records?filter=${encodeURIComponent('update_id="4002"')}`, { headers: { Authorization: adminTok } })).json.items[0];
  await api(`/api/collections/telegram_updates/records/${satir.id}`, { method: "PATCH", headers: yonetici(), body: JSON.stringify({ lease_until: new Date(Date.now() - 600000).toISOString().replace("T", " ") }) });

  tgState.sendFail = false;
  tgState.updates = [mesaj(4002, "Geçen aya göre giderim arttı mı?")];
  const r2 = await pollOnce({ pb, tg, aiHafiza: hafiza, pollTimeout: 1, pollLimit: 10 });
  assert.equal(r2.islenmis, 1, "retry tamamlanmalı");
  assert.equal(tgState.sent.length, 1, "kullanıcıya cevap iletildi");
  assert.equal(aiState.istekler.length, 1, "DONE cache kullanıldı — İKİNCİ upstream çağrısı YOK");
});

test("AI-T2C-E2E-02 bilinmeyen slash ve menü butonu AI'ya gitmez", async () => {
  aiState.istekler = []; tgState.sent = []; tgState.sendFail = false;
  tgState.updates = [mesaj(4003, "/foo"), mesaj(4004, "💳 Hesaplar")];
  const r = await pollOnce({ pb, tg, aiHafiza: aiHafiza(), pollTimeout: 1, pollLimit: 10 });
  assert.equal(r.islenmis, 2);
  assert.equal(aiState.istekler.length, 0, "AI çağrısı olmamalı");
  assert.equal(tgState.sent.length, 2);
});

test("AI-T2C-E2E-03 yazma niyetli soru AI'ya gider ama finansal veri değişmez", async () => {
  const once = await kullanici();
  aiState.istekler = []; tgState.sent = []; tgState.sendFail = false;
  tgState.updates = [mesaj(4005, "500 TL market harcaması ekle")];
  const r = await pollOnce({ pb, tg, aiHafiza: aiHafiza(), pollTimeout: 1, pollLimit: 10 });
  assert.equal(r.islenmis, 1);
  assert.equal(aiState.istekler.length, 1);
  const sonra = await kullanici();
  assert.equal(sonra.revision, once.revision);
  assert.equal(JSON.stringify(sonra.data), JSON.stringify(once.data));
  assert.equal(sonra.updated, once.updated, "users kaydına hiç yazılmamalı");
});
