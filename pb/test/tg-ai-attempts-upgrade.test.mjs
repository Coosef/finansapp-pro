// ============================================================
// T2C.2 MIGRATION YÜKSELTME TESTİ — 1735000700_telegram_ai_attempts.js
//
// Temiz DB'den BAŞLAMAZ. Önce production'ı temsil eden PRE-UPGRADE durumu kurulur:
//   • yalnız <= 1735000600 migration'ları uygulanır → telegram_ai_results VAR ama
//     `upstream_attempts` alanı YOK
//   • gerçek bir DONE satırı (answer + request_hash + expires_at) ve bir PROCESSING satırı
//     yazılır; ayrıca users.data/revision seed edilir
// Sonra AYNI veri dizini üzerinde TAM migration seti ile PB yeniden başlatılır ve
// yükseltmenin hiçbir mevcut veriyi değiştirmediği kanıtlanır.
//
// Dış servis / gerçek AI anahtarı GEREKMEZ.
// ============================================================
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, copyFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const REPO = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const PB_IMAGE = "ghcr.io/muchobien/pocketbase:0.39.10";
const CONTAINER = "finansapp-tgai-attempts-upgrade";
const PORT = 8096;
const BASE = `http://localhost:${PORT}`;
const ADMIN_EMAIL = "att-admin@finansapp.test";
const ADMIN_PASS = "adm-" + crypto.randomBytes(10).toString("hex");
const USER = { email: "att-user@finansapp.test", password: "attpassword123" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let DATA_DIR = "", PRE_DIR = "", ADMIN = "", USER_ID = "";
let ONCE_DONE = null, ONCE_PROC = null, ONCE_USER = null, ONCE_KURALLAR = null;

const HASH_DONE = crypto.createHash("sha256").update("t2c2-done-fixture").digest("hex");
const HASH_PROC = crypto.createHash("sha256").update("t2c2-processing-fixture").digest("hex");
const CEVAP = "Bu ay en cok Kira kaleminde harcadin. (fixture)";
const FIN_SEED = { giderler: [{ id: "e1", baslik: "Test", kategori: "Market", miktar: 42, tarih: "2026-08-02" }] };

function docker(args) { return execFileSync("docker", args, { stdio: ["ignore", "pipe", "pipe"] }).toString(); }
function dockerSessiz(args) { try { docker(args); } catch { /* yoktu */ } }

// Yalnız <= sinir migration'larını içeren geçici dizin.
function migrationDizini(sinir) {
  const dir = mkdtempSync(join(tmpdir(), "fa-att-mig-"));
  const src = join(REPO, "pb", "pb_migrations");
  for (const f of readdirSync(src)) {
    const n = parseInt(String(f).split("_")[0], 10);
    if (Number.isFinite(n) && n <= sinir) copyFileSync(join(src, f), join(dir, f));
  }
  return dir;
}

function pbBaslat(migrationsDir) {
  dockerSessiz(["rm", "-f", CONTAINER]);
  docker([
    "run", "-d", "--name", CONTAINER, "-p", `${PORT}:8090`,
    "-e", "FINANSAPP_CAS_ENFORCE=1", "-e", "TG_GATEWAY_SECRET=att", "-e", "TG_PAIRING_PEPPER=att",
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
async function api(yol, opts = {}) {
  const r = await fetch(BASE + yol, opts);
  let j = null; try { j = await r.json(); } catch { /* */ }
  return { status: r.status, json: j };
}
const yonetici = () => ({ Authorization: ADMIN, "Content-Type": "application/json" });
async function adminAuth() {
  return (await api("/api/collections/_superusers/auth-with-password", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASS }),
  })).json.token;
}
const koleksiyon = async (ad) => (await api(`/api/collections/${ad}`, { headers: { Authorization: ADMIN } })).json;
const alanAdlari = (col) => (col.fields || []).map((f) => f.name).sort();
async function aiSatir(hash) {
  const q = encodeURIComponent(`request_hash="${hash}"`);
  const r = await api(`/api/collections/telegram_ai_results/records?filter=${q}`, { headers: { Authorization: ADMIN } });
  return ((r.json && r.json.items) || [])[0] || null;
}
const iso = (ms) => new Date(Date.now() + ms).toISOString().replace("T", " ");

before(async () => {
  DATA_DIR = mkdtempSync(join(tmpdir(), "fa-att-pb-"));
  PRE_DIR = migrationDizini(1735000600); // 1735000700 KASITLI olarak DIŞARIDA

  // ---- FAZ 1: PRE-UPGRADE ----
  pbBaslat(PRE_DIR);
  assert.ok(await saglikBekle(), "PB (pre-upgrade) sağlık zaman aşımı");
  docker(["exec", CONTAINER, "/usr/local/bin/pocketbase", "superuser", "upsert", ADMIN_EMAIL, ADMIN_PASS, "--dir=/pb_data"]);
  ADMIN = await adminAuth();

  await api("/api/collections/users/records", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: USER.email, password: USER.password, passwordConfirm: USER.password }),
  });
  const auth = (await api("/api/collections/users/auth-with-password", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: USER.email, password: USER.password }),
  })).json;
  USER_ID = auth.record.id;
  const seed = await api(`/api/collections/users/records/${USER_ID}`, {
    method: "PATCH", headers: yonetici(), body: JSON.stringify({ data: FIN_SEED, revision: 5 }),
  });
  assert.equal(seed.status, 200, "finans seed başarısız");

  // Gerçekçi iki satır: biri DONE (cevaplı), biri PROCESSING (aktif lease'li).
  const d = await api("/api/collections/telegram_ai_results/records", {
    method: "POST", headers: yonetici(),
    body: JSON.stringify({ update_id: "900001", request_hash: HASH_DONE, status: "done", answer: CEVAP, expires_at: iso(25 * 60000) }),
  });
  assert.equal(d.status, 200, "DONE fixture yazılamadı: " + JSON.stringify(d.json));
  const p = await api("/api/collections/telegram_ai_results/records", {
    method: "POST", headers: yonetici(),
    body: JSON.stringify({ update_id: "900002", request_hash: HASH_PROC, status: "processing", lease_until: iso(90000), expires_at: iso(29 * 60000) }),
  });
  assert.equal(p.status, 200, "PROCESSING fixture yazılamadı: " + JSON.stringify(p.json));

  ONCE_DONE = await aiSatir(HASH_DONE);
  ONCE_PROC = await aiSatir(HASH_PROC);
  ONCE_USER = (await api(`/api/collections/users/records/${USER_ID}`, { headers: { Authorization: ADMIN } })).json;
  const col = await koleksiyon("telegram_ai_results");
  ONCE_KURALLAR = { listRule: col.listRule, viewRule: col.viewRule, createRule: col.createRule, updateRule: col.updateRule, deleteRule: col.deleteRule };
  assert.ok(!alanAdlari(col).includes("upstream_attempts"), "PRE-UPGRADE'de upstream_attempts OLMAMALI");
});

after(async () => {
  dockerSessiz(["rm", "-f", CONTAINER]);
  for (const d of [DATA_DIR, PRE_DIR]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* geç */ } }
});

test("ATT-01 PRE-UPGRADE durumu gerçekçidir (alan yok, DONE + PROCESSING satırı var)", async () => {
  assert.ok(ONCE_DONE && ONCE_PROC, "fixture satırları oluşmalı");
  assert.equal(ONCE_DONE.status, "done");
  assert.equal(ONCE_DONE.answer, CEVAP);
  assert.equal(ONCE_PROC.status, "processing");
  assert.equal(ONCE_DONE.upstream_attempts, undefined, "alan PRE-UPGRADE'de bulunmamalı");
});

test("ATT-02 tam migration seti AYNI veri dizininde uygulanır", async () => {
  pbBaslat(join(REPO, "pb", "pb_migrations"));
  assert.ok(await saglikBekle(), "PB (post-upgrade) sağlık zaman aşımı — migration başarısız olabilir");
  ADMIN = await adminAuth();
  assert.ok(ADMIN, "yükseltme sonrası admin auth başarılı olmalı");
});

test("ATT-03 upstream_attempts alanı eklendi (tamsayı, min 0, required DEĞİL)", async () => {
  const col = await koleksiyon("telegram_ai_results");
  const f = (col.fields || []).find((x) => x.name === "upstream_attempts");
  assert.ok(f, "upstream_attempts alanı olmalı");
  assert.equal(f.type, "number");
  assert.equal(f.onlyInt, true, "tamsayı olmalı");
  assert.equal(f.min, 0, "min 0 olmalı");
  assert.notEqual(f.required, true, "required OLMAMALI (0 geçerli bir başlangıç değeridir)");
});

test("ATT-04 eski satırlar 0 okunur (bütçelerini tüketmiş sayılmaz)", async () => {
  for (const h of [HASH_DONE, HASH_PROC]) {
    const row = await aiSatir(h);
    assert.ok(row, "satır yükseltmeden sağ çıkmalı: " + h);
    assert.equal(Number(row.upstream_attempts || 0), 0, "eski satır 0 okunmalı");
  }
});

test("ATT-05 DONE satırı BİREBİR korunur (answer/hash/status/expires_at/update_id)", async () => {
  const row = await aiSatir(HASH_DONE);
  assert.equal(row.id, ONCE_DONE.id, "kayıt id değişmemeli");
  assert.equal(row.answer, ONCE_DONE.answer, "answer değişmemeli");
  assert.equal(row.request_hash, ONCE_DONE.request_hash, "request_hash değişmemeli");
  assert.equal(row.status, ONCE_DONE.status, "status değişmemeli");
  assert.equal(row.expires_at, ONCE_DONE.expires_at, "expires_at değişmemeli");
  assert.equal(row.update_id, ONCE_DONE.update_id, "update_id değişmemeli");
});

test("ATT-06 PROCESSING satırı BİREBİR korunur (lease dahil)", async () => {
  const row = await aiSatir(HASH_PROC);
  assert.equal(row.id, ONCE_PROC.id);
  assert.equal(row.status, ONCE_PROC.status);
  assert.equal(row.request_hash, ONCE_PROC.request_hash);
  assert.equal(row.lease_until, ONCE_PROC.lease_until, "lease_until değişmemeli");
  assert.equal(row.expires_at, ONCE_PROC.expires_at, "expires_at değişmemeli");
  assert.equal(row.answer, ONCE_PROC.answer, "answer değişmemeli");
});

test("ATT-07 generic API kuralları hâlâ NULL (REST erişimi açılmadı)", async () => {
  const col = await koleksiyon("telegram_ai_results");
  for (const k of ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]) {
    assert.equal(col[k], null, `${k} NULL kalmalı`);
    assert.equal(col[k], ONCE_KURALLAR[k], `${k} değişmemeli`);
  }
  // Kimliksiz generic okuma hâlâ reddedilir.
  const r = await api("/api/collections/telegram_ai_results/records");
  assert.ok(r.status === 400 || r.status === 403 || r.status === 404, "generic liste erişimi açılmamalı: " + r.status);
});

test("ATT-08 users/haneler finansal verisi DEĞİŞMEDİ", async () => {
  const u = (await api(`/api/collections/users/records/${USER_ID}`, { headers: { Authorization: ADMIN } })).json;
  assert.equal(JSON.stringify(u.data), JSON.stringify(ONCE_USER.data), "users.data değişmemeli");
  assert.equal(u.revision, ONCE_USER.revision, "revision değişmemeli");
  assert.equal(u.updated, ONCE_USER.updated, "users kaydına hiç yazılmamalı");
});

test("ATT-09 migration idempotenttir (ikinci kez uygulama no-op)", async () => {
  // Aynı veri dizini + aynı tam migration seti ile bir kez daha yeniden başlat.
  pbBaslat(join(REPO, "pb", "pb_migrations"));
  assert.ok(await saglikBekle(), "ikinci yeniden başlatma sağlık zaman aşımı");
  ADMIN = await adminAuth();
  const col = await koleksiyon("telegram_ai_results");
  const alanlar = alanAdlari(col).filter((n) => n === "upstream_attempts");
  assert.equal(alanlar.length, 1, "alan yalnız bir kez eklenmeli");
  const row = await aiSatir(HASH_DONE);
  assert.equal(row.answer, ONCE_DONE.answer, "veri yine değişmemeli");
});
