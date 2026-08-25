// ============================================================
// REAL-PWA E2E — sync-correctness invariant (GERÇEK service worker aktif).
// KRİTİK ASSERTION: server ACK yoksa "Kaydedildi" ASLA görünmez; WAL korunur;
// PB değişmez. (Production'da görülen false "Kaydedildi" + sessiz veri kaybının
// canlı-SW altında da kapandığını kanıtlar.)  playwright.pwa.config.js ile koşar.
// ============================================================
import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, getFindata, getRecordRaw, setFindata, pbAuth } from "./helpers.mjs";
import { swHazir, swKontrolluMu, rozetMetni, kaydedildiGorunmedi, inceleGiderYap, journalOku, nrGider } from "./pwa.helpers.mjs";

// CAS write'larını kes (offline); GET'ler geçer.
async function kaydetKes(page) {
  await page.route("**/pb/api/findata/kaydet", (route) => route.abort("failed"));
  return () => page.unroute("**/pb/api/findata/kaydet");
}

// ---- PW1: ACK truth — Kaydediliyor… → (CAS 200) → Kaydedildi + revision ilerler ----
test("PW1 — ACK truth: CAS 200 gelmeden Kaydedildi YOK; ACK sonrası Kaydedildi", async ({ page }) => {
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("p1", "Belirsiz EFT", 5000, "2026-08-05")] });
  await swHazir(page);
  expect(await swKontrolluMu(page)).toBe(true); // GERÇEK SW aktif
  const revOnce = (await getRecordRaw()).revision;

  await inceleGiderYap(page);
  await expect(rozetMetni(page, "Kaydediliyor…")).toBeVisible({ timeout: 5000 }); // önce pending
  await expect(rozetMetni(page, "Kaydedildi")).toBeVisible({ timeout: 15000 });   // ACK sonrası

  await expect.poll(async () => (await getRecordRaw()).revision, { timeout: 15000 }).toBeGreaterThan(revOnce);
  expect(((await getFindata()).giderler || []).find((g) => g.id === "p1")?.tur).toBe("gider");
});

// ---- PW2: network blackhole — CAS abort → Kaydedildi YOK, Bağlantı yok, WAL korunur ----
test("PW2 — network blackhole: CAS gitmezse Kaydedildi YOK, WAL korunur, PB değişmez", async ({ page }) => {
  const { userId } = await pbAuth();
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("p2", "Belirsiz EFT", 6000, "2026-08-05")] });
  const geriAc = await kaydetKes(page);
  await swHazir(page);
  const revOnce = (await getRecordRaw()).revision;

  await inceleGiderYap(page);
  await expect(rozetMetni(page, "Bağlantı yok")).toBeVisible({ timeout: 15000 }); // hata yüzeyde
  await kaydedildiGorunmedi(page);                                                 // ASLA Kaydedildi
  expect(await journalOku(page, userId)).not.toBeNull();                           // WAL KORUNDU
  expect((await getRecordRaw()).revision).toBe(revOnce);                           // PB DEĞİŞMEDİ
  expect(((await getFindata()).giderler || []).find((g) => g.id === "p2")?.tur).toBe("needs_review");
  await geriAc();
});

// ---- PW3: server 500/timeout — 2xx-değil → Kaydedildi YOK, WAL korunur ----
test("PW3 — server 500: başarısız yanıtta Kaydedildi YOK, WAL korunur, PB değişmez", async ({ page }) => {
  const { userId } = await pbAuth();
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("p3", "Belirsiz EFT", 7000, "2026-08-05")] });
  await page.route("**/pb/api/findata/kaydet", (route) => route.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
  await swHazir(page);
  const revOnce = (await getRecordRaw()).revision;

  await inceleGiderYap(page);
  await expect(rozetMetni(page, "Bağlantı yok")).toBeVisible({ timeout: 15000 });
  await kaydedildiGorunmedi(page);
  expect(await journalOku(page, userId)).not.toBeNull();
  expect((await getRecordRaw()).revision).toBe(revOnce);
  await page.unroute("**/pb/api/findata/kaydet");
});

// ---- PW3b: HTTP 200 ama geçersiz gövde (revision yok) → Kaydedildi YOK (ACK kontratı) ----
test("PW3b — 200 ama geçersiz ACK (revision yok): Kaydedildi YOK, WAL korunur", async ({ page }) => {
  const { userId } = await pbAuth();
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("p3b", "Belirsiz EFT", 7500, "2026-08-05")] });
  // 2xx döndür ama server revision'ı OLMAYAN gövde → sahte "başarı" olmamalı.
  await page.route("**/pb/api/findata/kaydet", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }));
  await swHazir(page);
  const revOnce = (await getRecordRaw()).revision;

  await inceleGiderYap(page);
  await expect(rozetMetni(page, "Bağlantı yok")).toBeVisible({ timeout: 15000 });
  await kaydedildiGorunmedi(page);
  expect(await journalOku(page, userId)).not.toBeNull();
  expect((await getRecordRaw()).revision).toBe(revOnce);
  await page.unroute("**/pb/api/findata/kaydet");
});

// ---- PW4: successful CAS → Kaydedildi + WAL temizlenir + revision N→N+ ----
test("PW4 — successful CAS: Kaydedildi + WAL temizlenir + revision ilerler", async ({ page }) => {
  const { userId } = await pbAuth();
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("p4", "Belirsiz EFT", 8000, "2026-08-05")] });
  await swHazir(page);
  const revOnce = (await getRecordRaw()).revision;

  await inceleGiderYap(page);
  await expect(rozetMetni(page, "Kaydedildi")).toBeVisible({ timeout: 15000 });
  await expect.poll(async () => journalOku(page, userId), { timeout: 10000 }).toBeNull(); // WAL temizlendi
  expect((await getRecordRaw()).revision).toBeGreaterThan(revOnce);
});

// ---- PW7: reload with pending WAL — offline mutation + reload → kurtarma, false-save yok ----
test("PW7 — pending WAL ile reload: kurtarma + Kaydedildi YOK; reconnect → persist + WAL temizlenir", async ({ page }) => {
  const { userId } = await pbAuth();
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("p7", "Belirsiz EFT", 9000, "2026-08-05")] });
  const geriAc = await kaydetKes(page);
  await swHazir(page);
  const revOnce = (await getRecordRaw()).revision;

  await inceleGiderYap(page);
  await expect(rozetMetni(page, "Bağlantı yok")).toBeVisible({ timeout: 15000 });
  await page.reload(); // pending WAL ile reload (SW kontrollü)
  await page.getByText("Panel").first().click();
  await expect(page.getByText(/9\.000/).first()).toBeVisible({ timeout: 15000 }); // UI kurtardı (WAL)
  await kaydedildiGorunmedi(page);                                                 // hâlâ Kaydedildi YOK
  expect(await journalOku(page, userId)).not.toBeNull();                           // WAL korunuyor
  expect((await getRecordRaw()).revision).toBe(revOnce);                           // PB değişmedi

  await geriAc(); // reconnect
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(async () => (await getRecordRaw()).revision, { timeout: 20000 }).toBeGreaterThan(revOnce);
  await expect.poll(async () => journalOku(page, userId), { timeout: 10000 }).toBeNull();
});

// ---- PW9: offline reload — gerçek offline + reload → ACK yoksa "kaydedilmiş" değil ----
test("PW9 — offline reload: ACK olmadan kalıcı görünmez, pending/WAL korunur", async ({ page, context }) => {
  const { userId } = await pbAuth();
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("p9", "Belirsiz EFT", 4500, "2026-08-05")] });
  await swHazir(page); // online: SW kabuğu precache'lenir
  const revOnce = (await getRecordRaw()).revision;

  await context.setOffline(true);            // mutation'dan ÖNCE offline → write server'a gidemez
  await inceleGiderYap(page);
  await expect(rozetMetni(page, "Bağlantı yok")).toBeVisible({ timeout: 15000 }); // offline yüzeyde
  await kaydedildiGorunmedi(page);           // offline'da ASLA Kaydedildi

  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {}); // SW kabuğu offline yüklenir
  await expect(page.getByText("FinansApp").first()).toBeVisible({ timeout: 25000 }); // app remount
  await kaydedildiGorunmedi(page);           // reload sonrası da Kaydedildi YOK
  expect(await journalOku(page, userId)).not.toBeNull(); // pending korunuyor
  expect((await getRecordRaw()).revision).toBe(revOnce); // PB'ye hiçbir şey yazılmadı
  await context.setOffline(false);
});

// ---- PW10: CAS 409 conflict → Çakışma, WAL korunur, otomatik write/kör retry YOK ----
test("PW10 — CAS 409: Çakışma yüzeyde, WAL korunur, revision ilerlemez, false-save yok", async ({ page }) => {
  const { userId } = await pbAuth();
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("pa", "Belirsiz EFT Conflict", 8000, "2026-08-05")] });
  const geriAc = await kaydetKes(page);
  await swHazir(page);
  await inceleGiderYap(page); // offline pending (base = Rs), status hata
  await expect(rozetMetni(page, "Bağlantı yok")).toBeVisible({ timeout: 15000 });
  expect(await journalOku(page, userId)).not.toBeNull();

  // "Başka cihaz" server'ı CAS ile ilerletir (FARKLI top-level alan → no-clobber kanıtı).
  await setFindata({
    ...BASE_FINDATA,
    giderler: [nrGider("pa", "Belirsiz EFT Conflict", 8000, "2026-08-05")],
    gelirler: [...BASE_FINDATA.gelirler, { id: "srv1", baslik: "Server Gelir", miktar: 12345, kategori: "Maaş", tarih: "2026-08-10", kaynak: "elle" }],
  });
  const afterServer = await getRecordRaw();

  await geriAc();
  await page.reload(); // load-path: serverRev ≠ journal.base → çakışma yüzeyle (merge YOK)
  await expect(page.getByText(/Çakışma/).first()).toBeVisible({ timeout: 15000 });
  await kaydedildiGorunmedi(page); // çakışmada Kaydedildi YOK
  const son = await getRecordRaw();
  expect(son.revision).toBe(afterServer.revision);                               // otomatik write YOK
  expect((son.data.gelirler || []).some((g) => g.id === "srv1")).toBe(true);     // server KORUNDU
  expect((son.data.giderler || []).find((g) => g.id === "pa")?.tur).toBe("needs_review"); // local yazılmadı
  expect(await journalOku(page, userId)).not.toBeNull();                          // WAL KORUNDU
});
