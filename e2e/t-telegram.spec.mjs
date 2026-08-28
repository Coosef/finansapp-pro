// T1C — Ayarlar › Entegrasyonlar › Telegram (browser UX + gerçek PocketBase 0.39.10).
// Gateway TAKLİT EDİLİR: UI'ın gösterdiği pairing kodu, T1B'nin kullandığı service HMAC
// endpoint'i (/api/tg/service/pair-consume) ile tüketilir → UI "Bağlı"ya geçer.
// Kanıtlar: iç Telegram ID DOM'da YOK, kod storage'a YAZILMAZ, unlink ACK'siz "kaldırıldı"
// göstermez, finansal veri (users.data/revision) DEĞİŞMEZ.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import { seedSession, BASE_FINDATA, PB, getRecordRaw, casKaydet, pbAuth } from "./helpers.mjs";
import { signHeaders } from "./tg-hmac.mjs";

const TG = JSON.parse(readFileSync(join(process.cwd(), "e2e", ".t1c-runtime.json"), "utf8"));
const KOD_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
// Sentetik numerik Telegram kimliği (DOM'da GÖRÜNMEMELİ). HER TEST KENDİ tgid'ini alır:
// pair-consume rate-limit'i (5 / tgid / 15 dk) testler arasında paylaşılmasın.
let TGID = "770000000000";
let tgSayac = 0;

// Gateway'i taklit et: HMAC v1 imzalı service çağrısı.
async function svc(path, body) {
  const raw = JSON.stringify(body);
  const headers = signHeaders({ secret: TG.gwSecret, method: "POST", path, rawBody: raw });
  const res = await fetch(PB.base + path, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: raw });
  let json = null;
  try { json = await res.json(); } catch { /* boş */ }
  return { status: res.status, json };
}
// Backend gerçeği: bu tgid için AKTİF link var mı? (T1B service /status — metadata-only)
async function tgBagliMi() {
  const r = await svc("/api/tg/service/status", { telegram_user_id: TGID });
  return r.json?.linked === true;
}
async function linkTemizle() { await svc("/api/tg/service/unlink", { telegram_user_id: TGID }); }
// Kullanıcı-kapsamlı temizlik: her test KENDİ tgid'ini kullandığından (rate-limit izolasyonu),
// önceki testin linki tgid ile silinemez — fixture kullanıcının aktif linki browser endpoint'i
// ile kaldırılır, böylece her test "bağlı değil" durumundan başlar.
async function kullaniciLinkTemizle() {
  const { token } = await pbAuth();
  await fetch(PB.base + "/api/tg/user/unlink", { method: "POST", headers: { Authorization: token, "Content-Type": "application/json" }, body: "{}" });
}

const ayarlara = async (page) => {
  await page.goto("/");
  await page.getByText("Ayarlar").first().click();
  await expect(page.getByText("Entegrasyonlar").first()).toBeVisible({ timeout: 15000 });
};
const telegramKart = (page) => page.locator(".fa-card").filter({ hasText: "Entegrasyonlar" });
const kodMetni = async (page) => (await telegramKart(page).getByText(KOD_RE).first().innerText()).trim();

// Uygulamanın kendi açılış yazımı (normalizasyon/persister) revision'ı ilerletebilir; bu T1C
// kapsamı DIŞIDIR. Telegram akışının finansal veriye dokunmadığını kanıtlamak için taban
// ölçümü, uygulama yazımı DURULDUKTAN sonra alınır.
// Persister debounce'u 1200 ms → taban, revision en az ~4 sn boyunca SABİT kaldığında alınır.
async function taban() {
  let son = await getRecordRaw();
  let sabit = 0;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const simdi = await getRecordRaw();
    sabit = simdi.revision === son.revision ? sabit + 1 : 0;
    son = simdi;
    if (sabit >= 4) return simdi; // 4 sn sessizlik → uygulama açılış yazımı bitti
  }
  return son;
}

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test.beforeEach(async ({ page }) => {
  TGID = String(770000100000 + (++tgSayac) * 7 + crypto.randomInt(1, 999)); // teste özel tgid
  await linkTemizle();
  await kullaniciLinkTemizle();
  await seedSession(page, BASE_FINDATA);
});

test("TC-UI01/02 ilk yükleme 'Bağlı değil' FLAŞLAMAZ; durum gelince bağsız arayüz", async ({ page }) => {
  // status yanıtını geciktir → yükleme penceresi deterministik olarak gözlemlenebilir.
  await page.route("**/api/tg/user/status", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await ayarlara(page);
  const kart = telegramKart(page);
  await expect(kart.getByText("Telegram bağlantı durumu kontrol ediliyor…")).toBeVisible();
  await expect(kart.getByText("Bağlı değil")).toHaveCount(0); // flaş YOK
  await expect(kart.getByRole("button", { name: "Telegram'ı Bağla" })).toHaveCount(0);
  await page.unroute("**/api/tg/user/status");
  await expect(kart.getByRole("button", { name: "Telegram'ı Bağla" })).toBeVisible({ timeout: 15000 }); // TC-UI02
  await expect(kart.getByText("Durum:").first()).toBeVisible();
});

test("TC-UI03/04/05 kod üret → 8 karakter görünür · '/link KOD' kopyalanır · storage'a YAZILMAZ", async ({ page }) => {
  await ayarlara(page);
  const kart = telegramKart(page);
  await kart.getByRole("button", { name: "Telegram'ı Bağla" }).click();
  await expect(kart.getByText("Telegram bağlantı kodun")).toBeVisible({ timeout: 15000 });
  const kod = await kodMetni(page);
  expect(kod).toMatch(KOD_RE); // TC-UI03
  await expect(kart.getByText(`/link ${kod}`)).toBeVisible();

  await kart.getByRole("button", { name: "Komutu Kopyala" }).click(); // TC-UI04
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`/link ${kod}`);

  const depo = await page.evaluate(() => { // TC-UI05
    const d = (s) => Object.keys(s).map((k) => `${k}=${s.getItem(k)}`).join("|");
    return { ls: d(localStorage), ss: d(sessionStorage), url: location.href };
  });
  expect(depo.ls).not.toContain(kod);
  expect(depo.ss).not.toContain(kod);
  expect(depo.url).not.toContain(kod);
});

test("TC-UI06 kod süresi dolunca kopyalama kapanır; yeni kod AÇIK eylem ister", async ({ page }) => {
  // expires_in'i 2 sn'ye indir (gerçek 5 dk beklenmez); sunucudaki kod geçerli kalır.
  await page.route("**/api/tg/user/pair-code", async (route) => {
    const res = await route.fetch();
    const j = await res.json();
    await route.fulfill({ response: res, json: { ...j, expires_in: 2 } });
  });
  await ayarlara(page);
  const kart = telegramKart(page);
  await kart.getByRole("button", { name: "Telegram'ı Bağla" }).click();
  const kod = await kodMetni(page);
  await expect(kart.getByText("Kodun süresi doldu.")).toBeVisible({ timeout: 15000 });
  await expect(kart.getByRole("button", { name: "Komutu Kopyala" })).toHaveCount(0);
  await expect(kart.getByRole("button", { name: "Yeni Kod Üret" })).toBeVisible();
  await page.unroute("**/api/tg/user/pair-code");
  await kart.getByRole("button", { name: "Yeni Kod Üret" }).click(); // yalnız açık eylemle
  await expect.poll(async () => (await kodMetni(page)) !== kod, { timeout: 15000 }).toBe(true);
});

test("TC-UI07/08/09 uçtan uca: kod → gateway pair-consume → Bağlı; iç ID DOM'da YOK; polling durur", async ({ page }) => {
  let statusIstek = 0;
  page.on("request", (r) => { if (r.url().includes("/api/tg/user/status")) statusIstek++; });

  await ayarlara(page);
  const once = await taban(); // uygulama açılış yazımı durduktan SONRA taban
  const kart = telegramKart(page);
  await kart.getByRole("button", { name: "Telegram'ı Bağla" }).click();
  const kod = await kodMetni(page);

  expect((await svc("/api/tg/service/pair-consume", { telegram_user_id: TGID, code: kod })).status).toBe(200);

  await expect(kart.getByText("● Bağlı")).toBeVisible({ timeout: 20000 }); // otomatik yoklama yakaladı
  // TC-UI08 (exact: hane uyarısındaki "kişisel" kelimesiyle karışmasın)
  await expect(kart.getByText("Kişisel", { exact: true })).toBeVisible();
  await expect(kart.getByText("Yalnız okuma", { exact: true })).toBeVisible();
  const govde = await page.locator("body").innerText();
  expect(govde).not.toContain(TGID); // TC-UI09: numerik Telegram ID DOM'da yok
  expect(govde).not.toContain(kod); // bağlanınca plaintext kod DOM'dan silindi

  // TC-UI07: bağlanınca yoklama durur. (Uçuştaki son istek tamamlanabilsin diye kısa yerleşme.)
  await page.waitForTimeout(1000);
  const n1 = statusIstek;
  await page.waitForTimeout(9000); // 2 poll aralığından uzun → yeni istek OLMAMALI
  expect(statusIstek).toBe(n1);

  const sonra = await getRecordRaw(); // finansal veri DOKUNULMADI
  expect(sonra.revision).toBe(once.revision);
  expect(JSON.stringify(sonra.data)).toBe(JSON.stringify(once.data));
});

test("TC-UI11/12 unlink: onay ister · backend hatasında BAĞLI kalır · ACK'te kaldırılır", async ({ page }) => {
  await ayarlara(page);
  const once = await taban(); // uygulama açılış yazımı durduktan SONRA taban
  const kart = telegramKart(page);
  await kart.getByRole("button", { name: "Telegram'ı Bağla" }).click();
  const kod = await kodMetni(page);
  expect((await svc("/api/tg/service/pair-consume", { telegram_user_id: TGID, code: kod })).status).toBe(200);
  await expect(kart.getByText("● Bağlı")).toBeVisible({ timeout: 20000 });

  await kart.getByRole("button", { name: "Bağlantıyı Kaldır" }).click(); // TC-UI11: onay şart
  await expect(kart.getByText("Telegram bağlantısı kaldırılsın mı?")).toBeVisible();
  await expect(kart.getByText("● Bağlı")).toBeVisible(); // henüz kaldırılmadı
  expect(await tgBagliMi()).toBe(true);

  await page.route("**/api/tg/user/unlink", (route) => route.fulfill({ status: 500, json: {} })); // TC-UI12
  await kart.getByRole("button", { name: "Evet, Kaldır" }).click();
  await expect(kart.getByText(/kaldırılamadı \(500\)/)).toBeVisible({ timeout: 15000 });
  await expect(kart.getByText("● Bağlı")).toBeVisible(); // iyimser UI YOK
  expect(await tgBagliMi()).toBe(true);

  await page.unroute("**/api/tg/user/unlink");
  await kart.getByRole("button", { name: "Evet, Kaldır" }).click();
  await expect(kart.getByRole("button", { name: "Telegram'ı Bağla" })).toBeVisible({ timeout: 15000 });
  expect(await tgBagliMi()).toBe(false); // backend doğrulaması
  const sonra = await getRecordRaw();
  expect(sonra.revision).toBe(once.revision);
  expect(JSON.stringify(sonra.data)).toBe(JSON.stringify(once.data));
});

test("TC-UI10 ortak hane modunda kişisel-kapsam uyarısı görünür", async ({ page }) => {
  // AYRI throwaway kullanıcı (p-persistence deseni): paylaşılan fixture kullanıcı hiçbir zaman
  // hane üyesi olmaz → sonraki testler kişisel modda kalır (haneler deleteRule=null, admin-only).
  const eposta = `t1c-hane-${crypto.randomBytes(4).toString("hex")}@finansapp.test`;
  const sifre = "t1chanepassword123";
  await fetch(PB.base + "/api/collections/users/records", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: eposta, password: sifre, passwordConfirm: sifre }),
  }).catch(() => {});
  const auth = await (await fetch(PB.base + "/api/collections/users/auth-with-password", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: eposta, password: sifre }),
  })).json();
  const kod = "T" + crypto.randomBytes(4).toString("hex").toUpperCase().replace(/[01OI]/g, "2").slice(0, 5);
  // Hane verisi BASE_FINDATA ile tohumlanır → onboarding ekranı çıkmaz (deterministik).
  const h = await (await fetch(PB.base + "/api/collections/haneler/records", {
    method: "POST",
    headers: { Authorization: auth.token, "Content-Type": "application/json" },
    body: JSON.stringify({ kod, ad: "T1C Hane", members: [auth.record.id], data: BASE_FINDATA }),
  })).json();
  await page.addInitScript(([t, u, e, hid, hkod]) => {
    localStorage.setItem("finansapp:sync", JSON.stringify({ url: "", token: t, userId: u, email: e, haneId: hid, haneAd: "T1C Hane", haneKod: hkod }));
  }, [auth.token, auth.record.id, eposta, h.id, kod]);
  await ayarlara(page);
  const kart = telegramKart(page);
  await expect(kart.getByText(/Ortak Hane verileri henüz Telegram'da desteklenmiyor/)).toBeVisible({ timeout: 15000 });
  await expect(kart.getByRole("button", { name: "Telegram'ı Bağla" })).toBeVisible(); // bağlama ENGELLENMEZ

  // §21: hane modundayken kod üretimi hane finansal verisine DOKUNMAZ (data + revision sabit).
  const haneOku = async () => {
    const r = await (await fetch(PB.base + `/api/collections/haneler/records/${h.id}`, { headers: { Authorization: auth.token } })).json();
    return { data: JSON.stringify(r.data || {}), revision: Number.isInteger(r.revision) ? r.revision : 0 };
  };
  const once = await haneOku();
  await kart.getByRole("button", { name: "Telegram'ı Bağla" }).click();
  await expect(kart.getByText("Telegram bağlantı kodun")).toBeVisible({ timeout: 15000 });
  const sonra = await haneOku();
  expect(sonra.revision).toBe(once.revision);
  expect(sonra.data).toBe(once.data);
});

// ============================================================
// F2/F3/F5/F6/F7 remediation kanıtları (TC-R01..R12)
// ============================================================

// Kart eşleşme durumuna kadar getir; görünen kodu döndür.
async function eslesmeyeGec(page) {
  await ayarlara(page);
  const kart = telegramKart(page);
  await kart.getByRole("button", { name: "Telegram'ı Bağla" }).click();
  await expect(kart.getByText("Telegram bağlantı kodun")).toBeVisible({ timeout: 15000 });
  return { kart, kod: await kodMetni(page) };
}

test("TC-R03b (F3) yeni kod isteği PB'ye ULAŞIR ama yanıt kaybolur → eski kod ASLA geçerli gösterilmez", async ({ page }) => {
  const { kart, kod: kodA } = await eslesmeyeGec(page);
  // Replacement isteği gerçekten PB'ye gider (A sunucuda geçersizleşir), yanıt DÜŞÜRÜLÜR.
  await page.route("**/api/tg/user/pair-code", async (route) => {
    await route.fetch();          // PB'de B üretildi + A geçersizleşti
    await route.abort("failed");  // tarayıcı yanıtı kaybetti (belirsiz pencere)
  });
  await kart.getByRole("button", { name: "Yeni Kod Üret" }).click();
  await expect(kart.getByText(/Bağlantı kodu üretilemedi|ulaşılamadı|alınamadı/)).toBeVisible({ timeout: 15000 });
  await expect(kart.getByText(kodA, { exact: true })).toHaveCount(0);                       // A gösterilmiyor
  await expect(kart.getByText(`/link ${kodA}`)).toHaveCount(0);            // kopyalanamaz
  await expect(kart.getByRole("button", { name: "Komutu Kopyala" })).toHaveCount(0);
  expect((await svc("/api/tg/service/pair-consume", { telegram_user_id: TGID, code: kodA })).status).toBe(400); // A gerçekten geçersiz

  await page.unroute("**/api/tg/user/pair-code");                          // AÇIK yeni tıklama → C
  await kart.getByRole("button", { name: "Yeni Kod Üret" }).click();
  await expect(kart.getByText("Telegram bağlantı kodun")).toBeVisible({ timeout: 15000 });
  const kodC = await kodMetni(page);
  expect(kodC).not.toBe(kodA);
  expect((await svc("/api/tg/service/pair-consume", { telegram_user_id: TGID, code: kodC })).status).toBe(200); // C kullanılabilir
  await linkTemizle();
});

test("TC-R01 bağlı UI + status 401 → oturum kapanır, '● Bağlı' KAYBOLUR, hata gösterilir", async ({ page }) => {
  const { kart, kod } = await eslesmeyeGec(page);
  expect((await svc("/api/tg/service/pair-consume", { telegram_user_id: TGID, code: kod })).status).toBe(200);
  await expect(kart.getByText("● Bağlı")).toBeVisible({ timeout: 20000 });

  await page.route("**/api/tg/user/status", (route) => route.fulfill({ status: 401, json: { message: "unauthorized" } }));
  await kart.getByRole("button", { name: "Durumu Yenile" }).click();
  await expect(kart.getByText("● Bağlı")).toHaveCount(0, { timeout: 15000 }); // bayat "bağlı" YOK
  await expect(kart.getByText(/Oturum süresi doldu/)).toBeVisible();
  // PB oturumu gerçekten temizlendi (sync.js pbCikis)
  const oturum = await page.evaluate(() => localStorage.getItem("finansapp:sync"));
  expect(JSON.parse(oturum || "{}").token || "").toBe("");
  await page.unroute("**/api/tg/user/status");
  await linkTemizle();
});

test("TC-R02 eşleşme yoklaması 401 alırsa: yoklama DURUR, kod silinir, oturum hatası", async ({ page }) => {
  let istek = 0;
  page.on("request", (r) => { if (r.url().includes("/api/tg/user/status")) istek++; });
  const { kart, kod } = await eslesmeyeGec(page);
  await expect(kart.getByText(kod, { exact: true })).toBeVisible();

  await page.route("**/api/tg/user/status", (route) => route.fulfill({ status: 401, json: {} }));
  await expect(kart.getByText(/Oturum süresi doldu/)).toBeVisible({ timeout: 20000 });
  await expect(kart.getByText(kod, { exact: true })).toHaveCount(0);              // plaintext kod bellekten silindi
  await expect(kart.getByText("Telegram bağlantı kodun")).toHaveCount(0);

  const n = istek;
  await page.waitForTimeout(12000);                              // birkaç yoklama aralığı
  expect(istek).toBe(n);                                         // yoklama durdu
  await page.unroute("**/api/tg/user/status");
});

test("TC-R03 eşleşme sırasında geçici 500: kod KORUNUR, yıkıcı olmayan hata, 'bağlı değil' DEĞİL", async ({ page }) => {
  const { kart, kod } = await eslesmeyeGec(page);
  await page.route("**/api/tg/user/status", (route) => route.fulfill({ status: 500, json: {} }));
  await expect(kart.getByText(/alınamadı \(500\)/)).toBeVisible({ timeout: 20000 });
  await expect(kart.getByText(kod, { exact: true })).toBeVisible();               // kod imha EDİLMEDİ
  await expect(kart.getByText(`/link ${kod}`)).toBeVisible();
  await expect(kart.getByRole("button", { name: "Komutu Kopyala" })).toBeVisible();
  await expect(kart.getByText(/Oturum süresi doldu/)).toHaveCount(0);
  await page.unroute("**/api/tg/user/status");
});

test("TC-R07 manuel yenileme + otomatik yoklama AYNI uçuşu paylaşır (tek istek)", async ({ page }) => {
  const { kart } = await eslesmeyeGec(page);
  let acik = 0, enCok = 0, toplam = 0;
  await page.route("**/api/tg/user/status", async (route) => {
    acik++; toplam++; enCok = Math.max(enCok, acik);
    await new Promise((r) => setTimeout(r, 3000));               // uzun uçuş penceresi
    acik--;
    await route.fulfill({ status: 200, json: { linked: false } });
  });
  await page.waitForTimeout(4200);                               // otomatik yoklama uçuşa geçsin
  await kart.getByRole("button", { name: "Durumu Yenile" }).click(); // uçuş sürerken manuel
  await page.waitForTimeout(1500);
  expect(enCok).toBe(1);                                         // ASLA iki eşzamanlı status isteği
  expect(toplam).toBe(1);
  await page.unroute("**/api/tg/user/status");
});

test("TC-R08 sürekli geçici hata → SINIRLI gecikmeli yoklama (agresif döngü yok), kod korunur", async ({ page }) => {
  const { kart, kod } = await eslesmeyeGec(page);   // önce eşleşme ekranına gir (ilk yükleme sağlıklı)
  const damga = [];
  await page.route("**/api/tg/user/status", (route) => { damga.push(Date.now()); route.fulfill({ status: 500, json: {} }); });
  await page.waitForTimeout(26000);                              // 4+8+16 > 26 sn → en çok 3 deneme
  expect(damga.length).toBeGreaterThanOrEqual(2);                // yoklama devam ediyor
  expect(damga.length).toBeLessThanOrEqual(4);                   // ama sınırlı (sabit 4 sn olsaydı ~6)
  const araliklar = damga.slice(1).map((t, i) => t - damga[i]);
  if (araliklar.length >= 2) expect(araliklar[1]).toBeGreaterThan(araliklar[0] * 1.4); // gecikme büyüyor
  await expect(kart.getByText(kod, { exact: true })).toBeVisible();               // kod korunur
  await page.unroute("**/api/tg/user/status");
});

test("TC-R09/R10 kopyalama ACK'i gerçek: pano reddederse YANLIŞ başarı gösterilmez", async ({ page }) => {
  await page.addInitScript(() => {
    // Pano API'si reddetsin + senkron yedek de başarısız olsun.
    try {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")), readText: () => Promise.resolve("") } });
    } catch { /* yoksay */ }
    document.execCommand = () => false;
  });
  const { kart } = await eslesmeyeGec(page);
  await kart.getByRole("button", { name: "Komutu Kopyala" }).click();
  await expect(kart.getByText(/Panoya kopyalanamadı/)).toBeVisible({ timeout: 10000 }); // açık hata
  await expect(page.getByText("Komut kopyalandı")).toHaveCount(0);                      // yalan ACK YOK
});

test("TC-R11/R12 hane uyarısı CANLI: oluştur → uyarı çıkar, ayrıl → uyarı kaybolur (reload YOK)", async ({ page }) => {
  page.on("dialog", (d) => d.accept()); // hane oluştur/ayrıl onayları
  // Paylaşılan fixture kullanıcı kirlenmesin diye AYRI throwaway kullanıcı.
  const eposta = `t1c-live-${crypto.randomBytes(4).toString("hex")}@finansapp.test`;
  const sifre = "t1clivepassword123";
  await fetch(PB.base + "/api/collections/users/records", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: eposta, password: sifre, passwordConfirm: sifre }),
  }).catch(() => {});
  const auth = await (await fetch(PB.base + "/api/collections/users/auth-with-password", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: eposta, password: sifre }),
  })).json();
  await casKaydet(PB.base, auth.token, auth.record.id, BASE_FINDATA); // onboarding'i atla
  await page.addInitScript(([t, u, e]) => {
    localStorage.setItem("finansapp:sync", JSON.stringify({ url: "", token: t, userId: u, email: e }));
  }, [auth.token, auth.record.id, eposta]);

  await ayarlara(page);
  const kart = telegramKart(page);
  const uyari = kart.getByText(/Ortak Hane verileri henüz Telegram'da desteklenmiyor/);
  await expect(uyari).toHaveCount(0);                            // kişisel modda uyarı yok

  await page.getByRole("button", { name: "Hane Oluştur" }).click();
  await page.getByRole("button", { name: "Oluştur", exact: true }).click();
  await expect(uyari).toBeVisible({ timeout: 20000 });           // TC-R11: reload YOK

  await page.getByRole("button", { name: "Haneden Ayrıl" }).click();
  await expect(uyari).toHaveCount(0, { timeout: 20000 });        // TC-R12: reload YOK
});

test("TC-UI13 'Yeni Kod Üret' önceki kodu UNUTUR ve geçersiz kılar", async ({ page }) => {
  await ayarlara(page);
  const kart = telegramKart(page);
  await kart.getByRole("button", { name: "Telegram'ı Bağla" }).click();
  const kodA = await kodMetni(page);
  await kart.getByRole("button", { name: "Yeni Kod Üret" }).click();
  await expect.poll(async () => (await kodMetni(page)) !== kodA, { timeout: 15000 }).toBe(true);
  const kodB = await kodMetni(page);

  const govde = await page.locator("body").innerText();
  expect(govde).not.toContain(kodA); // A geçmişi tutulmaz
  await kart.getByRole("button", { name: "Komutu Kopyala" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`/link ${kodB}`);

  expect((await svc("/api/tg/service/pair-consume", { telegram_user_id: TGID, code: kodA })).status).toBe(400); // A geçersiz
  expect((await svc("/api/tg/service/pair-consume", { telegram_user_id: TGID, code: kodB })).status).toBe(200); // B geçerli
  await linkTemizle();
});
