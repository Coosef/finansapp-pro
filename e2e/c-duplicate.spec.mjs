import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, getFindata } from "./helpers.mjs";
import { makeXlsx, STATEMENT_B } from "./fixtures/make-xlsx.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// B ile AYNI ekstre (aynı 3 işlem) → ikinci yüklemede tekrar olarak tespit edilmeli.
const XLSX_C = join(mkdtempSync(join(tmpdir(), "fa-e2e-fix-")), "statement-c.xlsx");
makeXlsx(STATEMENT_B, XLSX_C);

// Gerçek İçe Aktar UI akışı: Veri & Yedek → Banka Ekstresi → gerçek <input type=file>.
async function ekstreYukleUI(page, xlsxPath) {
  await page.getByRole("button", { name: "Veri & Yedek" }).click();
  await expect(page.getByRole("button", { name: "Banka Ekstresi" })).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Banka Ekstresi" }).click({ force: true });
  await expect(page.getByRole("button", { name: "Ekstre Yükle" })).toBeVisible({ timeout: 10000 });
  await page.locator('input[type="file"][accept*="xlsx"]').setInputFiles(xlsxPath);
  await expect(page.getByText("Migros Market")).toBeVisible({ timeout: 20000 });
}

const ekstreSayisi = async () =>
  (((await getFindata()).giderler) || []).filter((g) => g.kaynak === "ekstre").length;

test.beforeEach(async ({ page }) => {
  await seedSession(page, BASE_FINDATA); // giriş yapılmış, 0 gider, onboarding'siz
  await page.goto("/");
});

test("C — aynı XLSX tekrar yüklenince tekrar tespit edilir → +0 ekonomik işlem", async ({ page }) => {
  // 1) İlk import → 3 gider, buluta kalıcı
  await ekstreYukleUI(page, XLSX_C);
  await page.getByRole("button", { name: "Seçilenleri Ekle" }).click();
  await expect.poll(ekstreSayisi, { timeout: 15000 }).toBe(3);

  // 2) AYNI dosyayı tekrar yükle → hepsi "olası tekrar", varsayılan seçili DEĞİL (kullanıcı-görünür dedup)
  await ekstreYukleUI(page, XLSX_C);
  await expect(page.getByText("olası tekrar")).toBeVisible({ timeout: 10000 });
  // Eklenecek yeni işlem yok → "Seçilenleri Ekle" pasif (kazara çift-ekleme engellenir)
  await expect(page.getByRole("button", { name: "Seçilenleri Ekle" })).toBeDisabled();

  // 3) +0 ekonomik işlem: PB'de hâlâ 3 gider (artmadı). Debounce'a fırsat için kısa poll.
  await expect.poll(ekstreSayisi, { timeout: 5000 }).toBe(3);

  // 4) KPI ₺2.500 kalır (değişmedi)
  await page.getByText("Panel").first().click();
  await expect(page.getByText("Toplam Gider").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/2\.500/).first()).toBeVisible({ timeout: 15000 });

  // 5) Refresh sonrası aynı: 3 kayıt durur, sayı değişmez
  await page.reload();
  await page.getByText("İşlemler").first().click();
  await expect(page.getByText("Migros Market").first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("Defacto Giyim").first()).toBeVisible();
  expect(await ekstreSayisi()).toBe(3);
});
