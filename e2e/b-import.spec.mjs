import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, getFindata } from "./helpers.mjs";
import { makeXlsx, STATEMENT_B } from "./fixtures/make-xlsx.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Gerçek fixture XLSX (sentetik): 3 gider (Migros 1200, Shell 800, Defacto 500) = 2500.
const XLSX_B = join(mkdtempSync(join(tmpdir(), "fa-e2e-fix-")), "statement-b.xlsx");
makeXlsx(STATEMENT_B, XLSX_B);

test.beforeEach(async ({ page }) => {
  await seedSession(page, BASE_FINDATA); // giriş yapılmış, 0 gider, onboarding'siz (kuruldu:true)
  await page.goto("/");
});

test("B — gerçek XLSX import → transaction + KPI + drill-down + persistence", async ({ page }) => {
  // Gerçek yol: Veri & Yedek → İçe Aktar → Banka Ekstresi → dosya seç
  await page.getByRole("button", { name: "Veri & Yedek" }).click();
  await expect(page.getByRole("button", { name: "Banka Ekstresi" })).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Banka Ekstresi" }).click({ force: true });
  await expect(page.getByRole("button", { name: "Ekstre Yükle" })).toBeVisible({ timeout: 10000 });
  // GERÇEK <input type=file> + setInputFiles (parser bypass YOK; gerçek file-picker yolu)
  await page.locator('input[type="file"][accept*="xlsx"]').setInputFiles(XLSX_B);
  // Önizlemede parse edilen kayıtlar görünür
  await expect(page.getByText("Migros Market")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("Shell Benzin")).toBeVisible();
  // Uygula
  await page.getByRole("button", { name: "Seçilenleri Ekle" }).click();

  // Dashboard KPI değişti: Toplam Gider = 2.500
  await page.getByText("Panel").first().click();
  await expect(page.getByText("Toplam Gider").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/2\.500/).first()).toBeVisible({ timeout: 15000 });

  // İşlemler ekranında imported kayıtlar
  await page.getByText("İşlemler").first().click();
  await expect(page.getByText("Migros Market").first()).toBeVisible();
  await expect(page.getByText("Defacto Giyim").first()).toBeVisible();

  // Persistence sync noktası: bulut kaydı debounce'lı (App.jsx: 1200ms) → reload'dan
  // ÖNCE verinin gerçekten PB'ye flush olduğunu doğrula (aksi halde reload debounce'ı iptal eder).
  await expect
    .poll(async () => (((await getFindata()).giderler) || []).filter((g) => g.kaynak === "ekstre").length, { timeout: 15000 })
    .toBe(3);

  // Refresh sonrası persistence (kullanıcı-görünür: reload sonrası kayıtlar durur)
  await page.reload();
  await page.getByText("İşlemler").first().click();
  await expect(page.getByText("Migros Market").first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("Defacto Giyim").first()).toBeVisible();
});
