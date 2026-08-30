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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let DATA_DIR = "", ONCE_DIR = "", ADMIN = "", USER_ID = "", USER_TOKEN = "", FIN_ONCE = null;
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
// UPG-07..09 — F3'ün "onarım sonrası tarayıcı davranışı" ispatı BLOKE.
//
// Şema onarımı çalışıyor (UPG-01..06), ancak ai.pb.js rotaları AYRI ve BAĞIMSIZ bir
// önceden var olan kusur yüzünden hiç çalışmıyor: handler'lar dosya-seviyesindeki
// `UST` / `anahtarKaydiBul` / `anahtarBul` sembollerine başvuruyor; PocketBase 0.39.10
// JSVM'de routerAdd handler'ları dosya-seviyesi scope'u GÖRMEZ (aynı kural tg.pb.js'te
// açıkça belgeli). Sonuç: /ai, /ai/anahtar, /ai/anahtar/durum HER ZAMAN 400 döner.
//
// T2B talimatı bu durumda "ai.pb.js DEĞİŞTİRİLMEZ → STOP ve raporla" diyor. Bu yüzden
// aşağıdaki test kusuru DÜZELTMEZ; MEVCUT gerçeği sabitler. ai.pb.js düzeltildiğinde bu
// test kırılır ve UPG-07..09'un gerçek davranış ispatına dönüştürülmesi gerektiğini bildirir.
// ============================================================
test("UPG-07 (BLOKE/kanıt) ai.pb.js handler-scope kusuru: tüm /ai rotaları 400 döner", async () => {
  const cagir = (yol, govde) => fetch(BASE + yol, {
    method: "POST", headers: { Authorization: USER_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(govde),
  });
  const a = await cagir("/ai/anahtar", { saglayici: "gemini", anahtar: "user-gemini-key" });
  const b = await cagir("/ai/anahtar/durum", {});
  const c = await cagir("/ai", { saglayici: "openai", govde: { model: "x", max_tokens: 1, messages: [{ role: "user", content: "ping" }] } });
  assert.equal(a.status, 400, "/ai/anahtar — bilinen kusur");
  assert.equal(b.status, 400, "/ai/anahtar/durum — bilinen kusur");
  assert.equal(c.status, 400, "/ai — bilinen kusur");
  const hata = await sonHata(/\/ai/);
  assert.match(hata, /is not defined/, "kök neden: handler dosya-seviyesi scope'u göremiyor; alınan: " + hata);
  // Kusur nedeniyle hiçbir anahtar YAZILAMAZ → depo boş kalır.
  assert.deepEqual(await kayitlar("ai_keys"), [], "kusurlu rota hiçbir kayıt oluşturamaz");
});

test("UPG-08 şema onarımı ai_keys deposunu GERÇEKTEN kullanılabilir yapar (rotadan bağımsız)", async () => {
  // ai.pb.js bloke olduğu için depo doğrudan (superuser) yazılıp okunur: onarımın asıl
  // kazanımı budur — onarım ÖNCESİ bu kayıt hiç saklanamıyordu (alanlar yoktu).
  const olustur = await fetch(BASE + "/api/collections/ai_keys/records", {
    method: "POST", headers: { Authorization: ADMIN, "Content-Type": "application/json" },
    body: JSON.stringify({ user: USER_ID, keys: { gemini: "user-gemini-key" } }),
  });
  assert.equal(olustur.status, 200, "kayıt oluşturulabilmeli: " + (await olustur.text()));
  const satirlar = await kayitlar("ai_keys");
  assert.equal(satirlar.length, 1);
  assert.equal(satirlar[0].user, USER_ID, "kayıt doğru kullanıcıya bağlı");
  assert.equal(satirlar[0].keys.gemini, "user-gemini-key", "anahtar GERÇEKTEN saklandı (onarım öncesi imkânsızdı)");
  // T2B Telegram AI yolu bu depoyu okur ve ÇALIŞIR (tg-t2b-ai suite'i kanıtlıyor);
  // yani onarım Telegram AI için yeterlidir, tarayıcı /ai için ai.pb.js düzeltmesi gerekir.
});
