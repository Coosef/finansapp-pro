// ============================================================
// REAL-PWA E2E — API cache izolasyonu, build identity, SW lifecycle güvenliği.
// (GERÇEK service worker aktif.)  playwright.pwa.config.js ile koşar.
// ============================================================
import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, getRecordRaw, pbAuth } from "./helpers.mjs";
import { swHazir, swKontrolluMu, rozetMetni, kaydedildiGorunmedi, inceleGiderYap, journalOku, nrGider } from "./pwa.helpers.mjs";

// ---- PW12: /pb ASLA cache'ten servis edilmez — fetch/XHR + POST network-only ----
test("PW12 — /pb/api asla SW cache'ten gelmez (POST kaydet + GET network-only)", async ({ page }) => {
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("c12", "Belirsiz EFT", 5000, "2026-08-05")] });
  const pbYanitlari = [];
  const assetSwServisli = [];
  page.on("response", (r) => {
    const u = r.url();
    if (u.includes("/pb/api/")) pbYanitlari.push({ url: u, sw: r.fromServiceWorker() });
    if (/\/assets\/.*\.js$/.test(u)) assetSwServisli.push(r.fromServiceWorker());
  });
  await swHazir(page);
  expect(await swKontrolluMu(page)).toBe(true);

  await inceleGiderYap(page); // POST /pb/api/findata/kaydet
  await expect(rozetMetni(page, "Kaydedildi")).toBeVisible({ timeout: 15000 });
  await page.reload(); // GET /pb/api/... (findata çek) + shell
  await expect(page.getByText("FinansApp").first()).toBeVisible({ timeout: 20000 });

  // Kanıt 1: hiçbir /pb/api yanıtı SW'den gelmedi (POST kaydet dahil).
  const kaydetVar = pbYanitlari.some((r) => r.url.includes("/findata/kaydet"));
  expect(kaydetVar).toBe(true);
  for (const r of pbYanitlari) expect(r.sw, `/pb SW-cache'ten gelmemeli: ${r.url}`).toBe(false);
  // Kanıt 2 (kontrast): app shell asset'i SW tarafından servis edilebiliyor (SW gerçekten çalışıyor).
  expect(assetSwServisli.some((x) => x === true)).toBe(true);
});

// ---- PW5: build identity gözlemlenebilir + SW-controlled (stale-tab teşhisi) ----
test("PW5 — build identity gözlemlenebilir; DOM sha == window.__finansappBuild == SW-controlled", async ({ page }) => {
  await seedSession(page, BASE_FINDATA);
  await swHazir(page);
  const domSha = await page.locator("[data-build-sha]").first().getAttribute("data-build-sha");
  const win = await page.evaluate(() => window.__finansappBuild);
  expect(domSha).toBeTruthy();
  expect(win).toBeTruthy();
  expect(win.buildSha).toBe(domSha);          // DOM ile statik pencere kimliği tutarlı
  expect(Number.isInteger(win.loadedAt)).toBe(true);
  expect("token" in win).toBe(false);          // hassas alan YOK
  // Canlı tanı: swControlled (o an) + sync durumu salt-okunur (stale-client teşhisi).
  const tani = await page.evaluate(() => window.__finansappTani && window.__finansappTani());
  expect(tani.swControlled).toBe(true);        // gerçek SW kontrolünde (canlı)
  expect(tani.buildSha).toBe(domSha);
  expect(tani.sync).toBeTruthy();
  expect("token" in tani).toBe(false);
});

// ---- PW6: update-while-pending — kirliyken reload guard'ı + veri güvenliği ----
// GERÇEK controllerchange'i (ikinci SW) deterministik tetiklemek zor; burada guard'ın
// GİRDİSİ (kirliMi wiring) uçtan uca doğrulanır (updater karar mantığı swupdate.test.js'te
// birim-testli), ARTI en kötü durumda (reload olsa bile) veri kaybı/false-save OLMADIĞI kanıtlanır.
test("PW6 — pending iken kirli sinyali doğru + reload olsa bile veri kaybı/false-save yok", async ({ page }) => {
  const { userId } = await pbAuth();
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("c6", "Belirsiz EFT", 6000, "2026-08-05")] });
  await page.route("**/pb/api/findata/kaydet", (route) => route.abort("failed")); // pending kalıcı
  await swHazir(page);
  const revOnce = (await getRecordRaw()).revision;

  await inceleGiderYap(page);
  await expect(rozetMetni(page, "Bağlantı yok")).toBeVisible({ timeout: 15000 });
  // Guard girdisi: kaydedilmemiş değişiklik var → main.jsx bir controllerchange reload'unu ERTELER.
  expect(await page.evaluate(() => typeof window.__finansappKirli === "function" && window.__finansappKirli())).toBe(true);

  // En kötü durum: yine de bir reload olursa (guard'ı zorla) → WAL kurtarır, false-save yok.
  await page.reload();
  await page.getByText("Panel").first().click();
  await expect(page.getByText(/6\.000/).first()).toBeVisible({ timeout: 15000 });
  await kaydedildiGorunmedi(page);
  expect(await journalOku(page, userId)).not.toBeNull();
  expect((await getRecordRaw()).revision).toBe(revOnce);

  // Reconnect → temizlenince kirli sinyali düşer (reload artık güvenli).
  await page.unroute("**/pb/api/findata/kaydet");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(async () => page.evaluate(() => window.__finansappKirli && window.__finansappKirli()), { timeout: 20000 }).toBe(false);
});

// ---- PW8: BFCache — pending'ken geri/ileri restore stale "Kaydedildi" GÖSTERMEZ ----
test("PW8 — BFCache restore: offline pending sonrası stale 'Kaydedildi' resurrect olmaz", async ({ page }) => {
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("c8", "Belirsiz EFT", 3500, "2026-08-05")] });
  await page.route("**/pb/api/findata/kaydet", (route) => route.abort("failed"));
  await swHazir(page);
  await inceleGiderYap(page);
  await expect(rozetMetni(page, "Bağlantı yok")).toBeVisible({ timeout: 15000 }); // hiç Kaydedildi olmadı
  await page.goto("about:blank");
  await page.goBack(); // BFCache/geri navigasyon
  await expect(page.getByText("FinansApp").first()).toBeVisible({ timeout: 20000 });
  await kaydedildiGorunmedi(page); // restore stale başarı badge'i getirmez
  await page.unroute("**/pb/api/findata/kaydet");
});

// ---- PW11: SW yokken (block) normal web app gibi çalışır; sync-correctness aynı ----
test.describe("PW11 — service worker devre dışı", () => {
  test.use({ serviceWorkers: "block" });
  test("PW11 — SW yok: controller yok ama başarılı CAS → Kaydedildi (sync-correctness korunur)", async ({ page }) => {
    await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("c11", "Belirsiz EFT", 4000, "2026-08-05")] });
    await page.goto("/");
    await expect(page.getByText("FinansApp").first()).toBeVisible({ timeout: 20000 });
    expect(await swKontrolluMu(page)).toBe(false); // SW yok
    const revOnce = (await getRecordRaw()).revision;
    await inceleGiderYap(page);
    await expect(rozetMetni(page, "Kaydedildi")).toBeVisible({ timeout: 15000 }); // gerçek ACK → Kaydedildi
    expect((await getRecordRaw()).revision).toBeGreaterThan(revOnce);
  });
});
