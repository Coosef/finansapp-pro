import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, getFindata } from "./helpers.mjs";
import { panele } from "./ui.mjs";

// Deterministik öneri motoru: STOPAJ (yüksek güven, toplu-uygulanır) + IC_TRANSFER (orta).
// İkinci grup, tek grup uygulandıktan sonra undo banner'ının kaybolmasını önler.
const K_FINDATA = {
  ...BASE_FINDATA,
  giderler: [
    { id: "sx1", baslik: "Vergi Kesintisi Faiz geliri", miktar: 100, kategori: "Faiz/Yatırım", tarih: "2026-08-08", kaynak: "elle" },
    { id: "ic1", baslik: "Virman 1234 Banka", miktar: 5000, kategori: "Diğer", tarih: "2026-08-07", kaynak: "elle" },
  ],
};

test.beforeEach(async ({ page }) => {
  await seedSession(page, K_FINDATA);
  await page.goto("/");
});

test("K — deterministik öneri: görünür → önizle → uygula → geri al → refresh state", async ({ page }) => {
  // 1) İşlemler → İncele: STOPAJ önerisi görünür (toplu-uygulanır)
  await page.getByText("İşlemler").first().click();
  await page.getByRole("button", { name: /İncele/ }).click();
  const uygula = page.getByRole("button", { name: "Bu grubu uygula (1)" });
  await expect(uygula).toBeVisible({ timeout: 10000 });

  // 2) Önizle → yüksek grup satırı görünür (stopaj kaydı)
  await uygula.locator("xpath=preceding-sibling::button[1]").click();
  await expect(page.getByText("Vergi Kesintisi Faiz geliri").first()).toBeVisible({ timeout: 5000 });

  // 3) Uygula → sınıflandı; ikinci grup banner'ı yaşattığı için batch-undo görünür
  await uygula.click();
  const geriAl = page.getByRole("button", { name: /Geri al/ });
  await expect(geriAl).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("button", { name: "Bu grubu uygula (1)" })).toHaveCount(0); // stopaj grubu uygulandı

  // 4) Geri al → öneri geri döner (apply butonu tekrar görünür)
  await geriAl.click();
  await expect(page.getByRole("button", { name: "Bu grubu uygula (1)" })).toBeVisible({ timeout: 10000 });

  // 5) Tekrar uygula → PB'ye yaz (tur:stopaj)
  await page.getByRole("button", { name: "Bu grubu uygula (1)" }).click();
  await expect
    .poll(async () => ((await getFindata()).giderler || []).find((g) => (g.baslik || "").includes("Vergi"))?.tur, { timeout: 15000 })
    .toBe("stopaj");

  // 6) KPI: stopaj geliri düşürür → Toplam Gelir 49.900 (persist)
  await panele(page);
  await expect(page.getByText(/49\.900/).first()).toBeVisible({ timeout: 15000 });
  await page.reload();
  await panele(page);
  await expect(page.getByText(/49\.900/).first()).toBeVisible({ timeout: 20000 });

  // 7) refresh sonrası İncele'de STOPAJ önerisi yok (sınıflandı); IC_TRANSFER orta grup kalır
  await page.getByText("İşlemler").first().click();
  await page.getByRole("button", { name: /İncele/ }).click();
  await expect(page.getByRole("button", { name: /Bu grubu uygula/ })).toHaveCount(0);
});
