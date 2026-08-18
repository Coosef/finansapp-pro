import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, getFindata } from "./helpers.mjs";
import { makeXlsx } from "./fixtures/make-xlsx.mjs";
import { ekstreYukle, panele } from "./ui.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Belirsiz giden EFT → kategori "Gönderim" → finansalTur "needs_review" (İncele'ye düşer).
// Açıklamada kira/maaş/market vb. öncelikli kategori anahtarı YOK.
const HDR = ["Tarih", "Açıklama", "Tutar"];
const XLSX_F = join(mkdtempSync(join(tmpdir(), "fa-e2e-fix-")), "f.xlsx");
makeXlsx([HDR, ["05.08.2026", "Giden EFT Mehmet Yilmaz", "-9000"]], XLSX_F);

test.beforeEach(async ({ page }) => {
  await seedSession(page, BASE_FINDATA);
  await page.goto("/");
});

test("F — belirsiz EFT: needs_review → İncele → Gider → KPI + persistence", async ({ page }) => {
  // 1) Import → needs_review (gider KPI'ya girmez)
  await ekstreYukle(page, XLSX_F, "Giden EFT");
  await page.getByRole("button", { name: "Seçilenleri Ekle" }).click();

  // 2) Sınıflandırma ÖNCESİ: gider KPI dışı → Panel "Bu dönemde gider yok"
  await panele(page);
  await expect(page.getByText("Bu dönemde gider yok").first()).toBeVisible({ timeout: 15000 });
  // PB kanıtı: kayıt tur=needs_review
  await expect
    .poll(async () => ((await getFindata()).giderler || []).find((g) => (g.baslik || "").includes("Mehmet"))?.tur, { timeout: 15000 })
    .toBe("needs_review");

  // 3) İşlemler → İncele → "Gider (harcama)" ile sınıflandır
  await page.getByText("İşlemler").first().click();
  await page.getByRole("button", { name: /İncele/ }).click();
  await expect(page.getByText("Giden EFT Mehmet Yilmaz").first()).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Gider (harcama)" }).click();

  // 4) KPI beklendiği kadar değişir: Toplam Gider 0 → 9.000
  await panele(page);
  await expect(page.getByText("Bu dönemde gider yok")).toHaveCount(0);
  await expect(page.getByText(/9\.000/).first()).toBeVisible({ timeout: 15000 });

  // 5) Persistence: PB'de tur=gider, refresh sonrası korunur
  await expect
    .poll(async () => ((await getFindata()).giderler || []).find((g) => (g.baslik || "").includes("Mehmet"))?.tur, { timeout: 15000 })
    .toBe("gider");
  await page.reload();
  await panele(page);
  await expect(page.getByText(/9\.000/).first()).toBeVisible({ timeout: 20000 });
});
