import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, getFindata } from "./helpers.mjs";
import { makeXlsx } from "./fixtures/make-xlsx.mjs";
import { ekstreYukle, panele } from "./ui.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Hane kişisi (anahtar "helin"). "Helin Yilmaz" gideri haneIsaretle ile needs_review olur
// (açıklamada transfer anahtarı YOK → finansalTur null → hane eşleşmesi kisiId+needs_review yazar).
const HDR = ["Tarih", "Açıklama", "Tutar"];
const XLSX_G = join(mkdtempSync(join(tmpdir(), "fa-e2e-fix-")), "g.xlsx");
makeXlsx([HDR, ["05.08.2026", "Helin Yilmaz", "-9000"]], XLSX_G);

const G_FINDATA = {
  ...BASE_FINDATA,
  kisiler: [{ id: "k1", ad: "Kız arkadaşım", hane: true, anahtarlar: ["helin"], iban: "", son4: "", not: "" }],
};

const kisiGideri = async () => ((await getFindata()).giderler || []).find((g) => g.kisiId === "k1");

test.beforeEach(async ({ page }) => {
  await seedSession(page, G_FINDATA);
  await page.goto("/");
});

test("G — hane kişisi: needs_review → Hediye(gider) → Hane transferi(nötr); cash-flow sabit", async ({ page }) => {
  // 1) Import → hane eşleşmesi → needs_review + kisiId
  await ekstreYukle(page, XLSX_G, "Helin");
  await page.getByRole("button", { name: "Seçilenleri Ekle" }).click();
  await expect.poll(async () => (await kisiGideri())?.tur, { timeout: 15000 }).toBe("needs_review");

  // 2) Sınıflandırma öncesi: gider KPI dışı
  await panele(page);
  await expect(page.getByText("Bu dönemde gider yok").first()).toBeVisible({ timeout: 15000 });

  // 3) Kişi cash-flow (Hesaplar): gönderilen 9.000 (tur'dan bağımsız, ham miktar)
  await page.getByText("Hesaplar").first().click();
  await expect(page.getByText(/9\.000/).first()).toBeVisible({ timeout: 15000 });

  // 4) İncele → "Hediye (verdiğin)" → gift → gider sayılır
  await page.getByText("İşlemler").first().click();
  await page.getByRole("button", { name: /İncele/ }).click();
  await page.getByRole("button", { name: "Hediye (verdiğin)" }).click();
  await expect.poll(async () => (await kisiGideri())?.tur, { timeout: 15000 }).toBe("gift");
  await panele(page);
  await expect(page.getByText(/9\.000/).first()).toBeVisible({ timeout: 15000 }); // Toplam Gider 9.000

  // 5) Cash-flow DEĞİŞMEDEN 9.000 kalır (tur gider'e döndü ama kişi akışı ham)
  await page.getByText("Hesaplar").first().click();
  await expect(page.getByText(/9\.000/).first()).toBeVisible({ timeout: 15000 });

  // 6) Yeniden sınıfla → "Hane transferi" → nötr → gider KPI dışı
  await page.getByText("İşlemler").first().click();
  await page.getByRole("button", { name: /İncele/ }).click();
  await page.getByRole("button", { name: "Hane transferi" }).click();
  await expect.poll(async () => (await kisiGideri())?.tur, { timeout: 15000 }).toBe("household_transfer");
  await panele(page);
  await expect(page.getByText("Bu dönemde gider yok").first()).toBeVisible({ timeout: 15000 });

  // 7) Cash-flow YİNE değişmeden 9.000
  await page.getByText("Hesaplar").first().click();
  await expect(page.getByText(/9\.000/).first()).toBeVisible({ timeout: 15000 });

  // 8) Refresh: household_transfer + cash-flow korunur
  await page.reload();
  expect((await kisiGideri())?.tur).toBe("household_transfer");
  await page.getByText("Hesaplar").first().click();
  await expect(page.getByText(/9\.000/).first()).toBeVisible({ timeout: 20000 });
});
