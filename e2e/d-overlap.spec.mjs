import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, getFindata } from "./helpers.mjs";
import { makeXlsx } from "./fixtures/make-xlsx.mjs";
import { ekstreYukle, ekstreGiderSayisi, panele } from "./ui.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Örtüşen ekstreler: D2, D1'in tüm satırlarını (X) + bir yeni satır (Y) içerir.
const HDR = ["Tarih", "Açıklama", "Tutar"];
const X = [["05.08.2026", "Migros Market", "-1200"], ["06.08.2026", "Shell Benzin", "-800"]]; // 2000
const Y = ["07.08.2026", "Defacto Giyim", "-500"];
const dir = mkdtempSync(join(tmpdir(), "fa-e2e-fix-"));
const XLSX_D1 = join(dir, "d1.xlsx");
const XLSX_D2 = join(dir, "d2.xlsx");
makeXlsx([HDR, ...X], XLSX_D1);
makeXlsx([HDR, ...X, Y], XLSX_D2);

test.beforeEach(async ({ page }) => {
  await seedSession(page, BASE_FINDATA);
  await page.goto("/");
});

test("D — örtüşen ekstre: X tekrar oluşmaz, yalnız Y eklenir", async ({ page }) => {
  // 1) İlk ekstre (X) → 2 gider, KPI 2.000
  await ekstreYukle(page, XLSX_D1, "Migros Market");
  await page.getByRole("button", { name: "Seçilenleri Ekle" }).click();
  await expect.poll(ekstreGiderSayisi, { timeout: 15000 }).toBe(2);
  await panele(page);
  await expect(page.getByText(/2\.000/).first()).toBeVisible({ timeout: 15000 });

  // 2) Örtüşen ekstre (X+Y) → X "olası tekrar" (seçili değil), Y (Defacto) seçili
  await ekstreYukle(page, XLSX_D2, "Defacto Giyim");
  await expect(page.getByText("olası tekrar")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Seçilenleri Ekle" }).click();

  // 3) Yalnız Y eklendi → toplam 3 gider (X iki katına çıkmadı)
  await expect.poll(ekstreGiderSayisi, { timeout: 15000 }).toBe(3);

  // 4) KPI yalnız Y kadar arttı: 2.000 → 2.500
  await panele(page);
  await expect(page.getByText(/2\.500/).first()).toBeVisible({ timeout: 15000 });

  // 5) X kayıtları tekilleşti (Migros/Shell birer tane), Y bir tane
  const gid = (await getFindata()).giderler || [];
  expect(gid.filter((g) => (g.baslik || "").includes("Migros")).length).toBe(1);
  expect(gid.filter((g) => (g.baslik || "").includes("Shell")).length).toBe(1);
  expect(gid.filter((g) => (g.baslik || "").includes("Defacto")).length).toBe(1);

  // 6) Refresh sonrası aynı: 3 kayıt durur
  await page.reload();
  await page.getByText("İşlemler").first().click();
  await expect(page.getByText("Defacto Giyim").first()).toBeVisible({ timeout: 20000 });
  expect(await ekstreGiderSayisi()).toBe(3);
});
