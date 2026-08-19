// Persistence / debounce hardening — write-ahead journal ile reload-kaybı çözümü.
// KURAL: reload'dan ÖNCE flush beklemek (expect.poll(getFindata)) YASAK — amaç tam
// olarak yarış durumunu sınamak. Kurtarma kullanıcı-görünür (UI) olarak doğrulanır.
// (Reconnect/ACK SONRASI PB/journal doğrulaması için poll meşrudur — yarışı gizlemez.)
import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, getFindata, getRecordRaw, setFindata, casKaydet, pbAuth, PB } from "./helpers.mjs";
import { panele } from "./ui.mjs";

const nrGider = (id, baslik, miktar, tarih) => ({ id, baslik, miktar, kategori: "Gönderim", tarih, tur: "needs_review" });
const journalOku = async (page, uid) => page.evaluate((u) => localStorage.getItem("finansapp:waj:" + u), uid);

// --- P6/P8 yardımcıları (throwaway PB, sentetik) ---
async function authAs(email, password) {
  const r = await (await fetch(PB.base + "/api/collections/users/auth-with-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: email, password }) })).json();
  return { token: r.token, userId: r.record.id };
}
async function pbRegister(email, password) {
  await fetch(PB.base + "/api/collections/users/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, passwordConfirm: password }) }).catch(() => {});
}
async function setFindataAs(email, password, findata) {
  const { token, userId } = await authAs(email, password);
  await casKaydet(PB.base, token, userId, findata); // guard: generic PATCH data yasak → CAS ile seed
}
async function getFindataAs(email, password) {
  const { token, userId } = await authAs(email, password);
  const d = await (await fetch(PB.base + `/api/collections/users/records/${userId}`, { headers: { Authorization: token } })).json();
  return d.data || {};
}
// Fixture user'ı üye yapan bir hane oluştur → { haneId, haneKod, haneAd }
async function createHane(token, userId, haneFindata) {
  const kod = "E2E" + userId.slice(-4);
  const r = await (await fetch(PB.base + "/api/collections/haneler/records", { method: "POST", headers: { "Content-Type": "application/json", Authorization: token }, body: JSON.stringify({ kod, ad: "E2E Hane", data: haneFindata, members: [userId] }) })).json();
  return { haneId: r.id, haneKod: r.kod, haneAd: r.ad };
}
async function seedHaneSession(page, token, userId, email, hane) {
  await page.addInitScript(([t, u, e, h]) => {
    localStorage.setItem("finansapp:sync", JSON.stringify({ url: "", token: t, userId: u, email: e, haneId: h.haneId, haneAd: h.haneAd, haneKod: h.haneKod }));
  }, [token, userId, email, hane]);
}

// CAS write'larını kes (offline); GET'ler ve diğer istekler geçer. Dönüş: kapatma fonksiyonu.
// findata artık generic PATCH ile değil, atomik POST /api/findata/kaydet ile yazılır.
async function offlineYap(page) {
  await page.route("**/pb/api/findata/kaydet", (route) => route.abort("failed"));
  return () => page.unroute("**/pb/api/findata/kaydet");
}

// ---- P1 (= R1 acceptance): needs_review→Gider + immediate reload → Gider KORUNUR ----
test("P1 — needs_review→Gider + immediate reload → Gider korunur (poll YOK)", async ({ page }) => {
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("nr1", "Belirsiz EFT Odemesi", 5000, "2026-08-05")] });
  await page.goto("/");
  await panele(page);
  await expect(page.getByText("Bu dönemde gider yok").first()).toBeVisible({ timeout: 15000 });
  await page.getByText("İşlemler").first().click();
  await page.getByRole("button", { name: /İncele/ }).click();
  await page.getByRole("button", { name: "Gider (harcama)" }).click();
  await page.reload(); // debounce beklemeden — yarış
  await panele(page);
  await expect(page.getByText(/5\.000/).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Bu dönemde gider yok")).toHaveCount(0);
});

// ---- P2: merchant override → hemen reload → override KORUNUR ----
test("P2 — merchant override + immediate reload → override korunur", async ({ page }) => {
  await seedSession(page, { ...BASE_FINDATA, giderler: [{ id: "e1", baslik: "STARBUCKS 1234 ISTANBUL", miktar: 185, kategori: "Yeme-İçme", tarih: "2026-08-05", kaynak: "elle" }], merchantKurallari: [] });
  await page.goto("/");
  await page.getByText("İşlemler").first().click();
  await page.getByText(/🏷 Starbucks \?/).first().click();
  await expect(page.getByText("Merchant düzelt")).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "Bu işleme uygula" }).click();
  await expect(page.getByText(/Starbucks \?/)).toHaveCount(0, { timeout: 8000 });
  await page.reload();
  await page.getByText("İşlemler").first().click();
  await expect(page.getByText(/🏷 Starbucks/).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Starbucks \?/)).toHaveCount(0);
});

// ---- P3: in-flight trailing — A gönderilirken B → final ikisini de içerir ----
test("P3 — in-flight trailing: A uçuşta iken B → sonuncu kaybolmaz", async ({ page }) => {
  // İlk CAS write'ı geciktir → A uçuşta kalır
  let n = 0;
  await page.route("**/pb/api/findata/kaydet", async (route) => {
    if (++n === 1) await new Promise((r) => setTimeout(r, 1500));
    return route.continue();
  });
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("a1", "Belirsiz EFT A", 1000, "2026-08-05"), nrGider("a2", "Belirsiz EFT B", 2000, "2026-08-06")] });
  await page.goto("/");
  await page.getByText("İşlemler").first().click();
  await page.getByRole("button", { name: /İncele/ }).click();
  await page.getByRole("button", { name: "Gider (harcama)" }).first().click(); // A → debounce → PATCH (gecikmeli)
  await page.waitForTimeout(1300); // A uçuşta
  await page.getByRole("button", { name: "Gider (harcama)" }).first().click(); // B (trailing)
  // Her ikisi de kalıcı olmalı (single-flight sonrası B gönderilir)
  await expect.poll(async () => ((await getFindata()).giderler || []).filter((g) => g.tur === "gider").length, { timeout: 15000 }).toBe(2);
});

// ---- P4: out-of-order/stale — eski (yavaş) write response yeni state'i geri almaz ----
test("P4 — stale response: aynı öğe A→B (ilk PATCH yavaş) → final = B", async ({ page }) => {
  let n = 0;
  await page.route("**/pb/api/findata/kaydet", async (route) => {
    if (++n === 1) await new Promise((r) => setTimeout(r, 1500));
    return route.continue();
  });
  // Hane kişili item: sınıflandıktan SONRA da İncele'de kalır (reclassify edilebilir).
  await seedSession(page, {
    ...BASE_FINDATA,
    kisiler: [{ id: "k1", ad: "Kişi", hane: true, anahtarlar: ["stalex"], iban: "", son4: "", not: "" }],
    giderler: [{ id: "x1", baslik: "Stalex Kisi", miktar: 3000, kategori: "Gönderim", tarih: "2026-08-05", kisiId: "k1", tur: "needs_review" }],
  });
  await page.goto("/");
  await page.getByText("İşlemler").first().click();
  await page.getByRole("button", { name: /İncele/ }).click();
  await page.getByRole("button", { name: "Hediye (verdiğin)" }).click(); // A: gift → PATCH gecikmeli
  await page.waitForTimeout(1300); // A uçuşta
  await page.getByRole("button", { name: "Hane transferi" }).click(); // B (trailing, sınıflanmış-hane'de kalır)
  // Final = B (household_transfer); yavaş A cevabı B'yi geri almaz
  await expect.poll(async () => ((await getFindata()).giderler || []).find((g) => g.id === "x1")?.tur, { timeout: 15000 }).toBe("household_transfer");
});

// ---- P5: offline + reload + recovery ----
test("P5 — offline mutation + reload → kaybolmaz; reconnect → persist + journal temizlenir", async ({ page }) => {
  const { userId } = await pbAuth();
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("o1", "Belirsiz EFT Ofline", 4000, "2026-08-05")] });
  const online = await offlineYap(page); // PB PATCH kesildi
  await page.goto("/");
  await page.getByText("İşlemler").first().click();
  await page.getByRole("button", { name: /İncele/ }).click();
  await page.getByRole("button", { name: "Gider (harcama)" }).click();
  await page.reload(); // offline'ken reload
  // Kurtarma: reload sonrası değişiklik UI'da (journal'dan), PB'de henüz yok
  await panele(page);
  await expect(page.getByText(/4\.000/).first()).toBeVisible({ timeout: 15000 });
  expect(await journalOku(page, userId)).not.toBeNull(); // pending korunuyor
  expect(((await getFindata()).giderler || []).find((g) => g.id === "o1")?.tur).toBe("needs_review"); // PB hâlâ eski
  // Reconnect → retry → PB'ye yazılır, journal temizlenir
  await online();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(async () => ((await getFindata()).giderler || []).find((g) => g.id === "o1")?.tur, { timeout: 20000 }).toBe("gider");
  await expect.poll(async () => journalOku(page, userId), { timeout: 10000 }).toBeNull();
});

// ---- P7: repeated reload / idempotency ----
test("P7 — pending ile tekrar tekrar reload → duplicate/yan etki yok", async ({ page }) => {
  const { userId } = await pbAuth();
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("i1", "Belirsiz EFT Idem", 7000, "2026-08-05")] });
  const online = await offlineYap(page);
  await page.goto("/");
  await page.getByText("İşlemler").first().click();
  await page.getByRole("button", { name: /İncele/ }).click();
  await page.getByRole("button", { name: "Gider (harcama)" }).click();
  // Birden çok reload (her seferinde journal'dan kurtarır, offline → PB'ye gitmez)
  for (let i = 0; i < 3; i++) { await page.reload(); await page.waitForTimeout(200); }
  await panele(page);
  await expect(page.getByText(/7\.000/).first()).toBeVisible({ timeout: 15000 });
  // Reconnect → tek klasifikasyon, duplicate yok
  await online();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(async () => ((await getFindata()).giderler || []).filter((g) => g.tur === "gider").length, { timeout: 20000 }).toBe(1);
  expect(((await getFindata()).giderler || []).length).toBe(1); // öğe çoğalmadı
});

// ---- P9: server conflict (reload) — 409 → server+WAL korunur, çakışma yüzeyde, otomatik merge YOK ----
// Stale local base'i KÖR EZMEZ (CAS 409). Bu increment'te OTOMATİK reconcile/merge YOK: journal
// yalnız top-level delta tuttuğundan aynı alanı iki client değiştirirse merge server item'larını
// silerdi (lost-update). Güvenli: server canonical KORUNUR, WAL KORUNUR, çakışma yüzeylenir.
test("P9 — server conflict (reload): 409 → server+WAL korunur, çakışma yüzeyde, otomatik merge yok", async ({ page }) => {
  const { userId } = await pbAuth();
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("c1", "Belirsiz EFT Conflict", 8000, "2026-08-05")] });
  const online = await offlineYap(page);
  await page.goto("/");
  await page.getByText("İşlemler").first().click();
  await page.getByRole("button", { name: /İncele/ }).click();
  await page.getByRole("button", { name: "Gider (harcama)" }).click(); // local pending: c1→gider (offline, base=Rs)
  await page.waitForTimeout(1500); // debounce offline → status hata, WAL KORUNUR
  expect(await journalOku(page, userId)).not.toBeNull();
  // "Başka cihaz" server'ı CAS ile ilerletir: FARKLI top-level alan (gelirler) → srv geliri ekler.
  await setFindata({
    ...BASE_FINDATA,
    giderler: [nrGider("c1", "Belirsiz EFT Conflict", 8000, "2026-08-05")],
    gelirler: [...BASE_FINDATA.gelirler, { id: "srv1", baslik: "Server Gelir", miktar: 12345, kategori: "Maaş", tarih: "2026-08-10", kaynak: "elle" }],
  });
  const afterB = await getRecordRaw();
  await online();
  await page.reload(); // load-path: serverRev ≠ journal.base → çakışma-surface (merge YOK)
  await expect(page.getByText(/Çakışma/).first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1500); // olası (hatalı) otomatik yazım penceresi geçsin
  const son = await getRecordRaw();
  expect(son.revision).toBe(afterB.revision);                               // otomatik write YOK
  expect((son.data.gelirler || []).some((g) => g.id === "srv1")).toBe(true); // server KORUNDU (no-clobber)
  expect((son.data.giderler || []).find((g) => g.id === "c1")?.tur).toBe("needs_review"); // local YAZILMADI
  expect(await journalOku(page, userId)).not.toBeNull();                    // WAL KORUNDU
});

// ---- P6: CEK merge guard — hane modunda local pending varken cloud fetch pending'i EZMEZ ----
test("P6 — hane CEK: local pending varken cloud fetch pending'i ezmez", async ({ page }) => {
  const { token, userId } = await pbAuth();
  const hane = await createHane(token, userId, { ...BASE_FINDATA, giderler: [nrGider("h1", "Hane Belirsiz", 6000, "2026-08-05")] });
  await seedHaneSession(page, token, userId, PB.email, hane);
  const online = await offlineYap(page); // pending kalıcı (PATCH abort → hasPending true)
  await page.goto("/");
  await page.getByText("İşlemler").first().click();
  await page.getByRole("button", { name: /İncele/ }).click();
  await page.getByRole("button", { name: "Gider (harcama)" }).click(); // h1 → gider (pending)
  // Cloud fetch tetikle (CEK): hane verisi (h1 needs_review) çekilir; guard hasPending → merge YAPMAZ
  await page.evaluate(() => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(600);
  // Pending EZİLMEDİ: h1 gider kaldı (CEK needs_review'a döndürmedi) → Toplam Gider 6.000
  await panele(page);
  await expect(page.getByText(/6\.000/).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Bu dönemde gider yok")).toHaveCount(0);
  await online();
});

// ---- P8: user isolation — A'nın journal'ı logout/login sonrası B'ye uygulanmaz ----
test("P8 — user isolation: A pending journal, logout → login B → B'ye uygulanmaz", async ({ page }) => {
  const bEmail = "e2e-b@finansapp.test", bPass = "e2epasswordB123";
  await pbRegister(bEmail, bPass);
  await setFindataAs(bEmail, bPass, BASE_FINDATA); // B temiz + onboarding'siz
  const { userId: aId } = await pbAuth();
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("a1", "A Belirsiz", 9000, "2026-08-05")] });
  const online = await offlineYap(page);
  await page.goto("/");
  await page.getByText("İşlemler").first().click();
  await page.getByRole("button", { name: /İncele/ }).click();
  await page.getByRole("button", { name: "Gider (harcama)" }).click(); // journal A
  expect(await journalOku(page, aId)).not.toBeNull();
  await online();
  // Gerçek logout: Ayarlar → Çıkış
  await page.getByText("Ayarlar").first().click();
  await page.getByRole("button", { name: "Çıkış", exact: true }).click();
  // Gerçek login B
  await expect(page.getByPlaceholder("sen@ornek.com")).toBeVisible({ timeout: 10000 });
  await page.getByPlaceholder("sen@ornek.com").click();
  await page.getByPlaceholder("sen@ornek.com").pressSequentially(bEmail);
  await page.locator('input[type="password"]').first().click();
  await page.locator('input[type="password"]').first().pressSequentially(bPass);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  // B Dashboard: A'nın değişikliği/kaydı B'de YOK (journal namespace izolasyonu)
  await expect(page.getByText("Toplam Gelir").first()).toBeVisible({ timeout: 20000 });
  const bFindata = await getFindataAs(bEmail, bPass);
  expect((bFindata.giderler || []).some((g) => g.id === "a1")).toBe(false);
});
