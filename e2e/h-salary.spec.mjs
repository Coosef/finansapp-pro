import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, getFindata } from "./helpers.mjs";
import { makeXlsx } from "./fixtures/make-xlsx.mjs";
import { ekstreYukle, panele } from "./ui.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Maaş modeli (baz 50.000) + BASE_FINDATA'nın manuel "Maaş" 50.000 geliri (= manuel duplicate).
// Ekstre maaşı 52.000 → modele eşleşir (çift saymaz), baz 50.000 + bonus 2.000.
const HDR = ["Tarih", "Açıklama", "Tutar"];
const XLSX_H = join(mkdtempSync(join(tmpdir(), "fa-e2e-fix-")), "h.xlsx");
makeXlsx([HDR, ["05.08.2026", "XYZ A.Ş. Maaş Ödemesi", "52000"]], XLSX_H);

const H_FINDATA = {
  ...BASE_FINDATA, // gelirler: [{ Maaş 50000 kaynak:"elle" }] → çift-gelir guard bunu yakalar
  maaslar: [{ id: "m1", ad: "Maaş", tutar: 50000, hesapId: "h1", odemeGunu: 5, kategori: "Maaş", baslangic: "2026-08", aktif: true }],
  maasAyarlari: [],
};

const manuelGelir = async () => ((await getFindata()).gelirler || []).find((g) => g.kaynak === "elle" && (g.baslik || "").includes("Maaş"));
const maasGeliriToplam = async () => ((await getFindata()).gelirler || []).filter((g) => g.kaynak === "maas").reduce((s, x) => s + (+x.miktar || 0), 0);

test.beforeEach(async ({ page }) => {
  await seedSession(page, H_FINDATA);
  await page.goto("/");
});

test("H — maaş: model + ekstre maaş + manuel duplicate → tek gelir, base sabit, bonus ayrı", async ({ page }) => {
  // 1) Manuel "Maaş" çift-gelir guard'ıyla needs_review (dışlanır); tek ekonomik gelir 50.000
  await expect.poll(async () => (await manuelGelir())?.tur, { timeout: 15000 }).toBe("needs_review");
  await panele(page);
  await expect(page.getByText(/50\.000/).first()).toBeVisible({ timeout: 15000 });

  // 2) Ekstre maaşı 52.000 → maaş modeline eşleşir (yeni gelir eklenmez)
  await ekstreYukle(page, XLSX_H, "Maaş");
  await page.getByRole("button", { name: "Seçilenleri Ekle" }).click();
  await expect.poll(maasGeliriToplam, { timeout: 15000 }).toBe(52000);

  // 3) Tek ekonomik gelir 52.000 (manuel duplicate hâlâ dışlanmış)
  await panele(page);
  await expect(page.getByText(/52\.000/).first()).toBeVisible({ timeout: 15000 });
  expect((await manuelGelir())?.tur).toBe("needs_review");

  // 4) Base salary bozulmaz + bonus ayrı: Bütçe & Maaş → Maaş
  await page.getByText("Bütçe & Maaş").first().click();
  await page.getByRole("button", { name: "Maaş", exact: true }).click();
  await expect(page.getByText(/Baz maaş:.*50\.000/).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Ek ödeme:.*2\.000/).first()).toBeVisible({ timeout: 10000 });

  // 5) Refresh: base sabit, tek gelir 52.000 korunur
  await page.reload();
  await panele(page);
  await expect(page.getByText(/52\.000/).first()).toBeVisible({ timeout: 20000 });
  const fd = await getFindata();
  expect(fd.maaslar[0].tutar).toBe(50000);           // baz maaş değişmedi
  expect(await maasGeliriToplam()).toBe(52000);      // tek maaş geliri 52.000
});
