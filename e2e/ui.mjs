// Tekrar kullanılabilir gerçek-DOM UI akışları (lib fonksiyonlarını bypass etmeden).
import { expect } from "@playwright/test";
import { getFindata } from "./helpers.mjs";

// Veri & Yedek → İçe Aktar → Banka Ekstresi → gerçek <input type=file> ile XLSX yükle.
// ilkSatirMetni verilirse önizlemede o metnin göründüğünü doğrular (parse kanıtı).
export async function ekstreYukle(page, xlsxPath, ilkSatirMetni) {
  await page.getByRole("button", { name: "Veri & Yedek" }).click();
  await expect(page.getByRole("button", { name: "Banka Ekstresi" })).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Banka Ekstresi" }).click({ force: true });
  await expect(page.getByRole("button", { name: "Ekstre Yükle" })).toBeVisible({ timeout: 10000 });
  await page.locator('input[type="file"][accept*="xlsx"]').setInputFiles(xlsxPath);
  if (ilkSatirMetni) await expect(page.getByText(ilkSatirMetni).first()).toBeVisible({ timeout: 20000 });
}

// PB'deki kaynak==="ekstre" gider sayısı — persistence sync noktası + ekstra kanıt.
export async function ekstreGiderSayisi() {
  return (((await getFindata()).giderler) || []).filter((g) => g.kaynak === "ekstre").length;
}

// Panel'e dön (KPI doğrulaması için).
export async function panele(page) {
  await page.getByText("Panel").first().click();
}
