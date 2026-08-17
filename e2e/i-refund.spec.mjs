import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, getFindata } from "./helpers.mjs";
import { makeXlsx } from "./fixtures/make-xlsx.mjs";
import { ekstreYukle, panele } from "./ui.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Alış + kısmi iade + tam iade. İade = gelir satırı ama tur:"iade" → geliri ARTIRMAZ,
// net gideri DÜŞÜRÜR. Net gider = (1000+200) − (300+200) = 700. Gelir = 50.000 (değişmez).
const HDR = ["Tarih", "Açıklama", "Tutar"];
const XLSX_I = join(mkdtempSync(join(tmpdir(), "fa-e2e-fix-")), "i.xlsx");
makeXlsx([HDR,
  ["01.08.2026", "Migros Market", "-1000"],
  ["05.08.2026", "Migros Market İade", "300"],   // kısmi iade
  ["02.08.2026", "Defacto Giyim", "-200"],
  ["06.08.2026", "Defacto Giyim iade", "200"],    // tam iade
], XLSX_I);

test.beforeEach(async ({ page }) => {
  await seedSession(page, BASE_FINDATA);
  await page.goto("/");
});

test("I — iade: tam+kısmi refund gelir sayılmaz, net gider düşer", async ({ page }) => {
  await ekstreYukle(page, XLSX_I, "Migros Market");
  await page.getByRole("button", { name: "Seçilenleri Ekle" }).click();

  // İade kayıtları app tarafından tur:"iade" olarak sınıflandı (import esnasında, gerçek akış)
  await expect
    .poll(async () => ((await getFindata()).gelirler || []).filter((g) => g.tur === "iade").length, { timeout: 15000 })
    .toBe(2);

  // KPI: refund'lar geliri ARTIRMAZ (Toplam Gelir 50.000), net gider = 700
  await panele(page);
  await expect(page.getByText(/50\.000/).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/₺\s?700\b/).first()).toBeVisible({ timeout: 15000 });

  // Refresh sonrası aynı
  await page.reload();
  await panele(page);
  await expect(page.getByText(/₺\s?700\b/).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/50\.000/).first()).toBeVisible();
  const fd = await getFindata();
  expect((fd.gelirler || []).filter((g) => g.tur === "iade").length).toBe(2);
});
