import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, getFindata } from "./helpers.mjs";
import { makeXlsx } from "./fixtures/make-xlsx.mjs";
import { ekstreYukle, ekstreGiderSayisi, panele } from "./ui.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// İki GERÇEK işlem: aynı gün (10.08.2026) + aynı tutar (450) + FARKLI merchant.
const HDR = ["Tarih", "Açıklama", "Tutar"];
const dir = mkdtempSync(join(tmpdir(), "fa-e2e-fix-"));
const XLSX_E1 = join(dir, "e1.xlsx");
const XLSX_E2 = join(dir, "e2.xlsx");
makeXlsx([HDR, ["10.08.2026", "Migros Market", "-450"]], XLSX_E1);
makeXlsx([HDR, ["10.08.2026", "Teknosa Elektronik", "-450"]], XLSX_E2);

test.beforeEach(async ({ page }) => {
  await seedSession(page, BASE_FINDATA);
  await page.goto("/");
});

test("E — yanlış-pozitif tekrar: aynı gün+tutar farklı merchant iki işlem de kalır", async ({ page }) => {
  // 1) İlk gerçek işlem: Migros -450 (10.08) → 1 gider
  await ekstreYukle(page, XLSX_E1, "Migros Market");
  await page.getByRole("button", { name: "Seçilenleri Ekle" }).click();
  await expect.poll(ekstreGiderSayisi, { timeout: 15000 }).toBe(1);

  // 2) İkinci GERÇEK işlem: Teknosa -450 aynı gün → tekrarMi (tutar+gün bazlı) YANLIŞLIKLA
  //    "olası tekrar" işaretler (varsayılan seçili değil). App otomatik birleştirmez/silmez.
  await ekstreYukle(page, XLSX_E2, "Teknosa Elektronik");
  await expect(page.getByText("olası tekrar")).toBeVisible({ timeout: 10000 });
  // Kullanıcı farklı merchant olduğunu görür ve işaretler (yanlış-pozitifi geçersiz kılar)
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Seçilenleri Ekle" }).click();

  // 3) İkisi de kalır → 2 AYRI gider (birleşmedi)
  await expect.poll(ekstreGiderSayisi, { timeout: 15000 }).toBe(2);
  const gid = (await getFindata()).giderler || [];
  expect(gid.filter((g) => (g.baslik || "").includes("Migros")).length).toBe(1);
  expect(gid.filter((g) => (g.baslik || "").includes("Teknosa")).length).toBe(1);

  // 4) KPI = ikisinin toplamı (900)
  await panele(page);
  await expect(page.getByText(/₺\s?900\b/).first()).toBeVisible({ timeout: 15000 });

  // 5) İşlemler'de ikisi de görünür; refresh sonrası kalıcı
  await page.getByText("İşlemler").first().click();
  await expect(page.getByText("Migros Market").first()).toBeVisible();
  await expect(page.getByText("Teknosa Elektronik").first()).toBeVisible();
  await page.reload();
  await page.getByText("İşlemler").first().click();
  await expect(page.getByText("Teknosa Elektronik").first()).toBeVisible({ timeout: 20000 });
  expect(await ekstreGiderSayisi()).toBe(2);
});
