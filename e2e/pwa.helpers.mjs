// REAL-PWA E2E yardımcıları — GERÇEK service worker altında sync-correctness.
// Normal suite helper'larını (helpers.mjs) yeniden kullanır; buraya yalnız SW'ye
// özgü bekleme/gözlem eklenir.
import { expect } from "@playwright/test";

// Sayfayı aç ve GERÇEK SW devralana kadar bekle. autoUpdate SW ilk aktivasyonda
// clientsClaim → controllerchange tetikler → (temiz olduğu için) main.jsx bir kez
// reload eder. Bu reload'u yut: controller set olana + app kabuğu (reload sonrası)
// yeniden render olana kadar bekle. Böylece testler kontrollü/stabil sayfada koşar.
export async function swHazir(page, path = "/") {
  await page.goto(path);
  // SW register + activate + (olası tek) reload → controller non-null (kontrol ediliyor).
  await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller), null, { timeout: 30000 });
  // Reload sonrası app mount (sidebar başlığı stabil).
  await expect(page.getByText("FinansApp").first()).toBeVisible({ timeout: 30000 });
}

// Bu sekme gerçekten bir SW tarafından kontrol ediliyor mu?
export async function swKontrolluMu(page) {
  return page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
}

// Senkron rozeti (header'daki SenkronRozet — div.fa-deskonly). Metin: "Kaydediliyor…"
// | "Kaydedildi" | "Bağlantı yok" | "Çakışma". "bekliyor"da rozet render edilmez.
export const rozetMetni = (page, metin) => page.locator("div.fa-deskonly", { hasText: metin });

// "Kaydedildi" HİÇ görünmemeli — bir süre boyunca 0 kalır (false-positive save guard).
export async function kaydedildiGorunmedi(page, ms = 2500) {
  await expect(page.getByText("Kaydedildi", { exact: true })).toHaveCount(0);
  await page.waitForTimeout(ms);
  await expect(page.getByText("Kaydedildi", { exact: true })).toHaveCount(0);
}

// İşlemler → İncele → "Gider (harcama)" — bir needs_review kaydını sınıflandırır
// (findata mutation → persister CAS write). p-persistence akışıyla aynı.
export async function inceleGiderYap(page) {
  await page.getByText("İşlemler").first().click();
  await page.getByRole("button", { name: /İncele/ }).click();
  await page.getByRole("button", { name: "Gider (harcama)" }).click();
}

export const journalOku = async (page, uid) => page.evaluate((u) => localStorage.getItem("finansapp:waj:" + u), uid);

// needs_review gider fabrikası (İncele'de görünür).
export const nrGider = (id, baslik, miktar, tarih) => ({ id, baslik, miktar, kategori: "Gönderim", tarih, tur: "needs_review" });
