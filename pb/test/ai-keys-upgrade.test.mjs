// ============================================================
// ai_keys ŞEMA ONARIMI — GERÇEK YÜKSELTME TESTİ (F3).
//
// Temiz/tam-migrate edilmiş bir DB'den BAŞLAMAZ. Önce production'ı temsil eden
// PRE-REPAIR durumu kurulur:
//   • yalnız 1735000400'e kadarki migration'lar uygulanır (bozuk 1735000200 davranışı dahil)
//   • ai_keys koleksiyonu VAR, ama user/keys alanları ve idx_ai_keys_user YOK
//   • en az 1 adet yalnız-id yetim ai_keys satırı eklenir
//   • kullanıcı + finansal veri (users.data/revision) seed edilir
// Sonra AYNI veri dizini üzerinde tam migration seti (1735000600 dahil) ile PB yeniden
// başlatılır ve onarım kanıtlanır. Ayrıca onarım sonrası tarayıcı davranışı doğrulanır.
//
// Gerçek AI sağlayıcı anahtarı GEREKMEZ; dış AI servisine çağrı yapılmaz.
// ============================================================
import { test, before, after } from "node:test";
import http from "node:http";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const REPO = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const PB_IMAGE = "ghcr.io/muchobien/pocketbase:0.39.10";
const CONTAINER = "finansapp-aikeys-upgrade";
const PORT = 8094;
const BASE = `http://localhost:${PORT}`;
const ADMIN_EMAIL = "upg-admin@finansapp.test";
const ADMIN_PASS = "adm-" + crypto.randomBytes(10).toString("hex");
const USER = { email: "upg-user@finansapp.test", password: "upgpassword123" };
// Bu sağlayıcı için env anahtarı TANIMLI; gemini için TANIMSIZ → ayrım yapılabilir.
const ENV_ANTHROPIC = "env-anthropic-" + crypto.randomBytes(6).toString("hex");

const FAKE_PORT = 8798;
const USER_B = { email: "upg-user-b@finansapp.test", password: "upgpasswordB123" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let DATA_DIR = "", ONCE_DIR = "", ADMIN = "", USER_ID = "", USER_TOKEN = "", FIN_ONCE = null;
let B_ID = "", B_TOKEN = "", fake = null;
// Fake AI upstream — gerçek sağlayıcıya HİÇ çağrı yapılmaz. İstek başlıklarını kaydeder ki
// hangi anahtarın kullanıldığı (kullanıcı mı env mi) kanıtlanabilsin.
const fakeState = { istekler: [] };
const FIN_SEED = { giderler: [{ id: "e1", baslik: "Test", kategori: "Market", miktar: 42, tarih: "2026-08-02" }] };

function docker(args) { return execFileSync("docker", args, { stdio: ["ignore", "pipe", "pipe"] }).toString(); }
function dockerSessiz(args) { try { docker(args); } catch { /* yoktu */ } }

// Yalnız <=1735000400 migration'larını içeren geçici dizin (bozuk PRE-REPAIR durumu).
function preRepairMigrationsDir() {
  const dir = mkdtempSync(join(tmpdir(), "fa-pre-mig-"));
  const src = join(REPO, "pb", "pb_migrations");
  for (const f of readdirSync(src)) {
    const n = parseInt(String(f).split("_")[0], 10);
    if (Number.isFinite(n) && n <= 1735000400) copyFileSync(join(src, f), join(dir, f));
  }
  return dir;
}

function pbBaslat(migrationsDir) {
  dockerSessiz(["rm", "-f", CONTAINER]);
  docker([
    "run", "-d", "--name", CONTAINER, "-p", `${PORT}:8090`,
    "-e", "FINANSAPP_CAS_ENFORCE=1",
    "-e", "TG_GATEWAY_SECRET=upg", "-e", "TG_PAIRING_PEPPER=upg",
    "-e", `ANTHROPIC_API_KEY=${ENV_ANTHROPIC}`,
    "-e", `AI_PROXY_TEST_UPSTREAM=http://host.docker.internal:${FAKE_PORT}`,
    "--add-host=host.docker.internal:host-gateway",
    "-v", `${REPO}/pb/pb_hooks:/pb_hooks`,
    "-v", `${migrationsDir}:/pb_migrations`,
    "-v", `${DATA_DIR}:/pb_data`,
    PB_IMAGE, "serve", "--http=0.0.0.0:8090", "--dir=/pb_data", "--migrationsDir=/pb_migrations", "--hooksDir=/pb_hooks",
  ]);
}

async function saglikBekle(maxSn = 45) {
  for (let i = 0; i < maxSn; i++) {
    try { if ((await fetch(BASE + "/api/health")).ok) return true; } catch { /* bekle */ }
    await sleep(1000);
  }
  return false;
}
async function adminAuth() {
  const r = await (await fetch(BASE + "/api/collections/_superusers/auth-with-password", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASS }),
  })).json();
  return r.token;
}
async function koleksiyon(ad) {
  const r = await fetch(BASE + `/api/collections/${ad}`, { headers: { Authorization: ADMIN } });
  return r.json();
}
// PB hata detayı dış yanıtta maskelenir; _logs üzerinden okunur (asenkron yazılır).
async function sonHata(desen, maxSn = 12) {
  for (let i = 0; i < maxSn; i++) {
    await sleep(1000);
    const r = await fetch(BASE + "/api/logs?perPage=20&sort=-created", { headers: { Authorization: ADMIN } });
    if (!r.ok) continue;
    const items = ((await r.json()).items) || [];
    for (const it of items) {
      const err = (it.data && it.data.error) || "";
      if (err && (!desen || desen.test(String(it.message) + " " + err))) return String(err);
    }
  }
  return "(log bulunamadı)";
}
async function kayitlar(coll) {
  const r = await fetch(BASE + `/api/collections/${coll}/records?perPage=200`, { headers: { Authorization: ADMIN } });
  return ((await r.json()).items) || [];
}

function fakeUpstreamBaslat(port) {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const ch = []; for await (const c of req) ch.push(c);
      let body = {}; try { body = JSON.parse(Buffer.concat(ch).toString() || "{}"); } catch { /* */ }
      fakeState.istekler.push({ url: req.url, headers: req.headers, body });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ content: [{ type: "text", text: "ok" }], choices: [{ message: { content: "ok" } }] }));
    });
    server.listen(port, "0.0.0.0", () => resolve(server));
  });
}
// Yanit basliklarindan HANGI anahtarin kullanildigini cikar (deger raporlanmaz, yalnizca
// beklenen fixture ile karsilastirilir).
function sonAnahtar(tip) {
  const h = fakeState.istekler[fakeState.istekler.length - 1].headers;
  return tip === "anthropic" ? h["x-api-key"] : String(h.authorization || "").replace(/^Bearer /, "");
}

before(async () => {
  DATA_DIR = mkdtempSync(join(tmpdir(), "fa-upg-pb-"));
  ONCE_DIR = preRepairMigrationsDir();

  // ---- FAZ 1: PRE-REPAIR durumu ----
  pbBaslat(ONCE_DIR);
  assert.ok(await saglikBekle(), "PB (pre-repair) sağlık zaman aşımı");
  docker(["exec", CONTAINER, "/usr/local/bin/pocketbase", "superuser", "upsert", ADMIN_EMAIL, ADMIN_PASS, "--dir=/pb_data"]);
  ADMIN = await adminAuth();

  await fetch(BASE + "/api/collections/users/records", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: USER.email, password: USER.password, passwordConfirm: USER.password }),
  });
  const auth = await (await fetch(BASE + "/api/collections/users/auth-with-password", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: USER.email, password: USER.password }),
  })).json();
  USER_ID = auth.record.id; USER_TOKEN = auth.token;

  await fetch(BASE + "/api/collections/users/records", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: USER_B.email, password: USER_B.password, passwordConfirm: USER_B.password }),
  });
  const authB = await (await fetch(BASE + "/api/collections/users/auth-with-password", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: USER_B.email, password: USER_B.password }),
  })).json();
  B_ID = authB.record.id; B_TOKEN = authB.token;

  fake = await fakeUpstreamBaslat(FAKE_PORT);

  // Finansal veri seed (onarımın dokunmadığını kanıtlamak için)
  const seed = await fetch(BASE + `/api/collections/users/records/${USER_ID}`, {
    method: "PATCH", headers: { Authorization: ADMIN, "Content-Type": "application/json" },
    body: JSON.stringify({ data: FIN_SEED, revision: 7 }),
  });
  assert.equal(seed.status, 200, "finans seed başarısız: " + (await seed.text()));
  FIN_ONCE = await (await fetch(BASE + `/api/collections/users/records/${USER_ID}`, { headers: { Authorization: ADMIN } })).json();

  // Yetim (yalnız id) ai_keys satırları — bozuk şemada başka türlüsü mümkün değil.
  for (let i = 0; i < 2; i++) {
    await fetch(BASE + "/api/collections/ai_keys/records", {
      method: "POST", headers: { Authorization: ADMIN, "Content-Type": "application/json" }, body: "{}",
    });
  }
});

after(async () => {
  if (fake) await new Promise((r) => fake.close(r));
  dockerSessiz(["rm", "-f", CONTAINER]);
  for (const d of [DATA_DIR, ONCE_DIR]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* geç */ } }
});

test("UPG-01 PRE-REPAIR durumu production kusurunu birebir temsil eder", async () => {
  const col = await koleksiyon("ai_keys");
  const alanlar = (col.fields || []).map((f) => f.name);
  assert.deepEqual(alanlar, ["id"], "bozuk şema yalnız id alanı taşımalı");
  assert.deepEqual(col.indexes || [], [], "idx_ai_keys_user PRE-REPAIR'de OLMAMALI");
  const satirlar = await kayitlar("ai_keys");
  assert.equal(satirlar.length, 2, "yetim satırlar hazır");
  assert.ok(satirlar.every((r) => r.user === undefined), "yetim satırlarda user alanı yok");
});

test("UPG-02 bozuk şemada 'user' filtresi gerçekten kırık (kök neden kanıtı)", async () => {
  const r = await fetch(BASE + `/api/collections/ai_keys/records?filter=${encodeURIComponent('user="x"')}`, { headers: { Authorization: ADMIN } });
  assert.ok(r.status >= 400, "bozuk şemada `user` filtresi hata vermeli, alınan " + r.status);
  // Kontrol: VAR OLAN bir alan üzerindeki filtre AYNI koleksiyonda sorunsuz çalışır →
  // hata generic bir API sorunu değil, EKSİK `user` alanına özgüdür. (PB dış yanıtta
  // sebebi maskeler; ham "unknown field \"user\"" mesajı hook loglarında görülmüştür.)
  const kontrol = await fetch(BASE + `/api/collections/ai_keys/records?filter=${encodeURIComponent('id!=""')}`, { headers: { Authorization: ADMIN } });
  assert.equal(kontrol.status, 200, "var olan alanla filtre çalışmalı");
});

test("UPG-03 onarım migration'ı AYNI veri dizininde başarıyla uygulanır", async () => {
  dockerSessiz(["rm", "-f", CONTAINER]);
  pbBaslat(join(REPO, "pb", "pb_migrations")); // TAM migration seti (1735000500 + 1735000600)
  const ok = await saglikBekle();
  if (!ok) {
    const log = (() => { try { return docker(["logs", CONTAINER]); } catch { return "(log yok)"; } })();
    assert.fail("PB (post-repair) başlamadı — migration hatası olabilir:\n" + log);
  }
  ADMIN = await adminAuth();
  const log = docker(["logs", CONTAINER]);
  assert.ok(!/failed to apply migration/i.test(log), "migration hatası: " + log);
});

test("UPG-04 şema onarıldı: user (required) + keys + UNIQUE index", async () => {
  const col = await koleksiyon("ai_keys");
  const user = (col.fields || []).find((f) => f.name === "user");
  const keys = (col.fields || []).find((f) => f.name === "keys");
  assert.ok(user, "user alanı eklenmeli");
  assert.equal(user.type, "relation");
  assert.equal(user.required, true, "user REQUIRED olmalı");
  assert.equal(user.cascadeDelete, true);
  assert.ok(keys, "keys alanı eklenmeli");
  assert.equal(keys.type, "json");
  const idx = (col.indexes || []).join(" ");
  assert.match(idx, /UNIQUE INDEX idx_ai_keys_user/, "unique index eklenmeli");
});

test("UPG-05 yetim satırlar güvenle silindi; finansal veri DOKUNULMADI", async () => {
  const kalan = await kayitlar("ai_keys");
  assert.equal(kalan.length, 0, "yalnız-id yetim satırlar temizlenmeli; kalan: " + JSON.stringify(kalan));
  const u = await (await fetch(BASE + `/api/collections/users/records/${USER_ID}`, { headers: { Authorization: ADMIN } })).json();
  assert.equal(u.revision, FIN_ONCE.revision, "revision değişmemeli");
  assert.equal(JSON.stringify(u.data), JSON.stringify(FIN_ONCE.data), "users.data değişmemeli");
  assert.equal(u.updated, FIN_ONCE.updated, "users kaydına hiç yazılmamalı");
});

test("UPG-06 unique index gerçekten uygulanıyor (kullanıcı başına tek kayıt)", async () => {
  const mk = () => fetch(BASE + "/api/collections/ai_keys/records", {
    method: "POST", headers: { Authorization: ADMIN, "Content-Type": "application/json" },
    body: JSON.stringify({ user: USER_ID, keys: { openai: "x" } }),
  });
  const ilk = await mk();
  assert.equal(ilk.status, 200);
  const ikinci = await mk();
  assert.ok(ikinci.status >= 400, "ikinci kayıt unique index ile reddedilmeli");
  for (const r of await kayitlar("ai_keys")) {
    await fetch(BASE + `/api/collections/ai_keys/records/${r.id}`, { method: "DELETE", headers: { Authorization: ADMIN } });
  }
});

// ============================================================
// UPG-07x / UPG-08x — TARAYICI AI PROXY GERCEK KABUL ISPATI (T2B.1).
// ai.pb.js handler-scope kusuru onarildi (paylasilan yardimcilar ai_lib.js'te, her handler
// KENDI ICINDE require ediyor). Asagidaki testler "bilinen bozuk 400" davranisini DEGIL,
// amaclanan urun davranisini dogrular. Gercek PB 0.39.10 + FAKE yerel upstream; dis AI
// servisine cagri YOK, gercek saglayici anahtari GEREKMEZ.
// ============================================================
const anahtarKaydet = (token, saglayici, anahtar) => fetch(BASE + "/ai/anahtar", {
  method: "POST", headers: { Authorization: token, "Content-Type": "application/json" },
  body: JSON.stringify(anahtar === null ? { saglayici } : { saglayici, anahtar }),
});
const anahtarDurum = (token) => fetch(BASE + "/ai/anahtar/durum", {
  method: "POST", headers: { Authorization: token, "Content-Type": "application/json" }, body: "{}",
});
const aiCagir = (token, saglayici) => fetch(BASE + "/ai", {
  method: "POST", headers: { Authorization: token, "Content-Type": "application/json" },
  body: JSON.stringify({ saglayici, govde: { model: "m", max_tokens: 8, messages: [{ role: "user", content: "ping" }] } }),
});
async function aiKeysTemizle() {
  for (const r of await kayitlar("ai_keys")) {
    await fetch(BASE + `/api/collections/ai_keys/records/${r.id}`, { method: "DELETE", headers: { Authorization: ADMIN } });
  }
}
const A_GEMINI = "user-A-gemini-" + crypto.randomBytes(4).toString("hex");
const A_OPENAI = "user-A-openai-" + crypto.randomBytes(4).toString("hex");
const A_ANTH = "user-A-anthropic-" + crypto.randomBytes(4).toString("hex");
const B_GEMINI = "user-B-gemini-" + crypto.randomBytes(4).toString("hex");

test("UPG-07A /ai/anahtar kullanıcı anahtarını kaydeder (200) ve değeri döndürmez", async () => {
  await aiKeysTemizle();
  const r = await anahtarKaydet(USER_TOKEN, "gemini", A_GEMINI);
  const govde = await r.text();
  assert.equal(r.status, 200, "yanıt: " + govde);
  assert.ok(!govde.includes(A_GEMINI), "anahtar değeri yanıtta DÖNMEMELİ");
  const satirlar = await kayitlar("ai_keys");
  assert.equal(satirlar.length, 1);
  assert.equal(satirlar[0].user, USER_ID);
  assert.equal(satirlar[0].keys.gemini, A_GEMINI, "anahtar gerçekten saklandı");
});

test("UPG-07B /ai/anahtar/durum yalnız boolean döner, değeri sızdırmaz", async () => {
  const r = await anahtarDurum(USER_TOKEN);
  const ham = await r.text();
  assert.equal(r.status, 200, "yanıt: " + ham);
  const j = JSON.parse(ham);
  assert.deepEqual(Object.keys(j).sort(), ["anthropic", "gemini", "openai"]);
  for (const v of Object.values(j)) assert.equal(typeof v, "boolean", "yalnız boolean");
  assert.equal(j.gemini, true, "kullanıcı anahtarı görünmeli (env'de GEMINI_API_KEY YOK)");
  assert.equal(j.anthropic, true, "env fallback görünmeli");
  assert.equal(j.openai, false, "ne kullanıcı ne env → false");
  assert.ok(!ham.includes(A_GEMINI) && !ham.includes(ENV_ANTHROPIC), "hiçbir anahtar değeri sızmamalı");
});

test("UPG-07C ikinci sağlayıcı kaydı birincisini YOK ETMEZ", async () => {
  assert.equal((await anahtarKaydet(USER_TOKEN, "openai", A_OPENAI)).status, 200);
  const keys = (await kayitlar("ai_keys"))[0].keys;
  assert.equal(keys.gemini, A_GEMINI, "önceki sağlayıcı anahtarı korunmalı");
  assert.equal(keys.openai, A_OPENAI, "yeni sağlayıcı anahtarı eklenmeli");
  const j = await (await anahtarDurum(USER_TOKEN)).json();
  assert.deepEqual([j.gemini, j.openai], [true, true]);
});

test("UPG-07D tek sağlayıcı anahtarını silmek diğerlerini etkilemez", async () => {
  assert.equal((await anahtarKaydet(USER_TOKEN, "openai", "")).status, 200); // boş → sil
  const keys = (await kayitlar("ai_keys"))[0].keys;
  assert.equal(keys.openai, undefined, "openai anahtarı silinmeli");
  assert.equal(keys.gemini, A_GEMINI, "gemini anahtarı korunmalı");
  const j = await (await anahtarDurum(USER_TOKEN)).json();
  assert.equal(j.openai, false);
  assert.equal(j.gemini, true);
});

test("UPG-07E kullanıcı A'nın anahtarı B için kişisel anahtar SAYILMAZ", async () => {
  const j = await (await anahtarDurum(B_TOKEN)).json();
  assert.equal(j.gemini, false, "B'nin kendi gemini anahtarı yok (A'nınki görünmemeli)");
  assert.equal(j.anthropic, true, "env fallback herkes için geçerli");
  assert.equal((await anahtarKaydet(B_TOKEN, "gemini", B_GEMINI)).status, 200);
  const satirlar = await kayitlar("ai_keys");
  assert.equal(satirlar.length, 2, "kullanıcı başına ayrı kayıt");
  const aRow = satirlar.find((r) => r.user === USER_ID);
  const bRow = satirlar.find((r) => r.user === B_ID);
  assert.equal(aRow.keys.gemini, A_GEMINI);
  assert.equal(bRow.keys.gemini, B_GEMINI);
});

test("UPG-07F ai_keys generic REST kuralları NULL — normal kullanıcı erişemez", async () => {
  const col = await koleksiyon("ai_keys");
  for (const k of ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]) {
    assert.equal(col[k], null, `${k} null olmalı`);
  }
  const liste = await fetch(BASE + "/api/collections/ai_keys/records", { headers: { Authorization: USER_TOKEN } });
  assert.ok(liste.status === 403 || liste.status === 404, "kullanıcı generic REST ile listeleyememeli, alınan " + liste.status);
  const govde = await liste.text();
  assert.ok(!govde.includes(A_GEMINI), "anahtar değeri sızmamalı");
});

test("UPG-08A kullanıcı anahtarı varsa upstream'e KULLANICI anahtarı gider", async () => {
  fakeState.istekler = [];
  const r = await aiCagir(USER_TOKEN, "gemini");
  assert.equal(r.status, 200, "yanıt: " + (await r.text()));
  assert.equal(fakeState.istekler.length, 1, "tek upstream çağrısı");
  assert.equal(sonAnahtar("openai"), A_GEMINI, "kullanıcı anahtarı kullanılmalı");
  assert.match(fakeState.istekler[0].url, /\/v1beta\/openai\/chat\/completions$/, "kanonik sağlayıcı yolu korunmalı");
});

test("UPG-08B kullanıcı anahtarı yoksa env fallback kullanılır", async () => {
  fakeState.istekler = [];
  const r = await aiCagir(USER_TOKEN, "anthropic"); // A'nın anthropic anahtarı YOK, env VAR
  assert.equal(r.status, 200);
  assert.equal(fakeState.istekler.length, 1);
  assert.equal(sonAnahtar("anthropic"), ENV_ANTHROPIC, "env anahtarı kullanılmalı");
  assert.match(fakeState.istekler[0].url, /\/v1\/messages$/, "kanonik sağlayıcı yolu korunmalı");
});

test("UPG-08C hem kullanıcı hem env varsa KULLANICI anahtarı kazanır", async () => {
  assert.equal((await anahtarKaydet(USER_TOKEN, "anthropic", A_ANTH)).status, 200);
  fakeState.istekler = [];
  const r = await aiCagir(USER_TOKEN, "anthropic");
  assert.equal(r.status, 200);
  assert.equal(sonAnahtar("anthropic"), A_ANTH, "kullanıcı anahtarı env'i geçmeli");
  assert.notEqual(sonAnahtar("anthropic"), ENV_ANTHROPIC);
  // temizle: sonraki testler env fallback'e bakıyor
  assert.equal((await anahtarKaydet(USER_TOKEN, "anthropic", "")).status, 200);
});

test("UPG-08D ne kullanıcı ne env anahtarı olan sağlayıcı → 503, upstream çağrısı YOK", async () => {
  fakeState.istekler = [];
  const r = await aiCagir(USER_TOKEN, "openai"); // openai: kullanıcı anahtarı silindi, env yok
  assert.equal(r.status, 503);
  assert.match(JSON.stringify(await r.json()), /anahtar yok/i);
  assert.equal(fakeState.istekler.length, 0, "anahtar yokken upstream çağrılmamalı");
});

test("UPG-08E geçersiz sağlayıcı → 400, upstream çağrısı = 0", async () => {
  fakeState.istekler = [];
  for (const sag of ["ollama", "lmstudio", "ozel", "http://evil.example/v1", ""]) {
    const r = await fetch(BASE + "/ai", {
      method: "POST", headers: { Authorization: USER_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ saglayici: sag, govde: { messages: [{ role: "user", content: "x" }] } }),
    });
    // "" → varsayılan anthropic'e düşer (mevcut davranış); diğerleri whitelist dışı → 400.
    if (sag === "") { assert.ok(r.status === 200 || r.status === 503, "boş sağlayıcı varsayılana düşer"); continue; }
    assert.equal(r.status, 400, `${sag} whitelist dışı olmalı`);
  }
  const yerelCagri = fakeState.istekler.filter((x) => !/\/v1\/messages$/.test(x.url));
  assert.equal(yerelCagri.length, 0, "whitelist dışı sağlayıcı için upstream çağrısı olmamalı");
});

test("UPG-08F kullanıcı B, A'nın anahtarının kullanılmasına yol açamaz", async () => {
  fakeState.istekler = [];
  const r = await aiCagir(B_TOKEN, "gemini");
  assert.equal(r.status, 200);
  assert.equal(sonAnahtar("openai"), B_GEMINI, "B kendi anahtarını kullanmalı");
  assert.notEqual(sonAnahtar("openai"), A_GEMINI, "A'nın anahtarı ASLA kullanılmamalı");
});

test("UPG-09 şema onarımı ai_keys deposunu gerçekten kullanılabilir yapar (özet)", async () => {
  const satirlar = await kayitlar("ai_keys");
  assert.ok(satirlar.length >= 1, "kayıtlar kalıcı");
  assert.ok(satirlar.every((r) => typeof r.user === "string" && r.user.length > 0), "her kayıt bir kullanıcıya bağlı");
});
