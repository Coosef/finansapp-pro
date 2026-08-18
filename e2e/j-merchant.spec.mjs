import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, getFindata } from "./helpers.mjs";
import { panele } from "./ui.mjs";

// İki benzer gider (STARBUCKS ...) → merchantCoz düşük-güven aday "Starbucks" → chip "🏷 Starbucks ?".
const J_FINDATA = {
  ...BASE_FINDATA,
  giderler: [
    { id: "e1", baslik: "STARBUCKS 1234 ISTANBUL", miktar: 185, kategori: "Yeme-İçme", tarih: "2026-08-05", kaynak: "elle" },
    { id: "e2", baslik: "STARBUCKS 5678 ISTANBUL", miktar: 210, kategori: "Yeme-İçme", tarih: "2026-08-09", kaynak: "elle" },
  ],
  merchantKurallari: [],
};

test.beforeEach(async ({ page }) => {
  await seedSession(page, J_FINDATA);
  await page.goto("/");
});

test("J — merchant: türetilen chip → benzerlere uygula → kural sil; ham & KPI (0 TL) sabit", async ({ page }) => {
  // KPI baseline: Toplam Gider = 395
  await panele(page);
  await expect(page.getByText(/₺\s?395\b/).first()).toBeVisible({ timeout: 15000 });

  // İşlemler list view: türetilen aday chip (düşük güven → "Starbucks ?"), 2 kayıt
  await page.getByText("İşlemler").first().click();
  await expect(page.getByText(/Starbucks \?/)).toHaveCount(2, { timeout: 10000 });

  // Chip → editör
  await page.getByText(/🏷 Starbucks \?/).first().click();
  await expect(page.getByText("Merchant düzelt")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Ham açıklama (değişmez)")).toBeVisible();
  await expect(page.getByText("STARBUCKS 1234 ISTANBUL")).toBeVisible();

  // "Benzerlere uygula…" → preview 2 işlem → onayla (kuralEkle modalı kapatır)
  await page.getByRole("button", { name: "Benzerlere uygula…" }).click();
  await expect(page.getByText(/Bu kural 2 işlemi/)).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: /Onayla ve 2 işleme uygula/ }).click();

  // İki chip de kesin "🏷 Starbucks" (aday "?" kalmadı) — ham açıklama değişmedi
  await expect(page.getByText(/Starbucks \?/)).toHaveCount(0, { timeout: 10000 });
  await expect(page.getByText(/🏷 Starbucks/)).toHaveCount(2);
  await expect(page.getByText("STARBUCKS 1234 ISTANBUL")).toBeVisible();

  // PB kanıtı: kural buluta yazıldı (debounce), ham baslik korunuyor
  await expect.poll(async () => ((await getFindata()).merchantKurallari || []).length, { timeout: 15000 }).toBe(1);
  expect(((await getFindata()).giderler || []).map((g) => g.baslik).sort()).toEqual(["STARBUCKS 1234 ISTANBUL", "STARBUCKS 5678 ISTANBUL"]);

  // KPI değişmedi (0 TL)
  await panele(page);
  await expect(page.getByText(/₺\s?395\b/).first()).toBeVisible({ timeout: 15000 });

  // Kuralı sil → türetilene geri dön
  await page.getByText("İşlemler").first().click();
  await page.getByText(/🏷 Starbucks/).first().click();
  await expect(page.getByText(/Merchant kuralların \(1\)/)).toBeVisible({ timeout: 5000 });
  // Kural satırının kendi Sil (DelBtn) butonu — sayfadaki diğer "Sil"lerden ayrıştır
  await page.getByText(/← contains:/).locator("xpath=following-sibling::button").click();
  await expect(page.getByText(/Merchant kuralların/)).toHaveCount(0); // kural silindi
  await page.getByRole("button", { name: "✕" }).click(); // modalı kapat

  // Chip tekrar aday "?" (türetilmişe döndü)
  await expect(page.getByText(/Starbucks \?/)).toHaveCount(2, { timeout: 10000 });

  // KPI hâlâ 395, ham korunuyor
  await panele(page);
  await expect(page.getByText(/₺\s?395\b/).first()).toBeVisible({ timeout: 15000 });
  await expect.poll(async () => ((await getFindata()).merchantKurallari || []).length, { timeout: 15000 }).toBe(0);
  expect(((await getFindata()).giderler || []).map((g) => g.baslik).sort()).toEqual(["STARBUCKS 1234 ISTANBUL", "STARBUCKS 5678 ISTANBUL"]);
});
