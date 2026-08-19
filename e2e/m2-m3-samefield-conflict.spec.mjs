// M2/M3 — SAME top-level field conflict (lost-update önleme çekirdeği).
// Journal yalnız top-level delta (tüm array) tuttuğundan, iki client AYNI alanı (giderler)
// değiştirirse otomatik {...server, ...patch} merge server item'larını SİLERDİ. Bu increment'te
// otomatik merge YOK → 409'da server canonical KORUNUR (B'nin item'ı kalır), A pending WAL'da
// KORUNUR, otomatik write YOK, çakışma yüzeyde. M2 = runtime (reconnect), M3 = reload.
import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, getRecordRaw, setFindata, pbAuth } from "./helpers.mjs";

const nrGider = (id, baslik, miktar, tarih) => ({ id, baslik, miktar, kategori: "Gönderim", tarih, tur: "needs_review" });
const journalOku = async (page, uid) => page.evaluate((u) => localStorage.getItem("finansapp:waj:" + u), uid);

async function offlineYap(page) {
  await page.route("**/pb/api/findata/kaydet", (route) => route.abort("failed"));
  return () => page.unroute("**/pb/api/findata/kaydet");
}

// Ortak kurulum: A offline mA'yı classify eder (giderler pending), B AYNI alana mB ekler.
async function kurulum(page) {
  const { userId } = await pbAuth();
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("mA", "Belirsiz mA", 4000, "2026-08-05")] });
  const online = await offlineYap(page);
  await page.goto("/");
  await page.getByText("İşlemler").first().click();
  await page.getByRole("button", { name: /İncele/ }).click();
  await page.getByRole("button", { name: "Gider (harcama)" }).click(); // A: mA→gider (giderler pending, base=N)
  await page.waitForTimeout(1500); // debounce offline → status hata, WAL KORUNUR
  expect(await journalOku(page, userId)).not.toBeNull();
  // B AYNI top-level alana (giderler) yeni item ekler → server rev N+1, giderler=[mA(nr), mB]
  await setFindata({
    ...BASE_FINDATA,
    giderler: [nrGider("mA", "Belirsiz mA", 4000, "2026-08-05"), nrGider("mB", "Server mB", 5000, "2026-08-06")],
  });
  const afterB = await getRecordRaw();
  return { userId, online, afterB };
}

async function dogrula(page, userId, afterB) {
  await expect(page.getByText(/Çakışma/).first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1500); // olası (hatalı) otomatik merge/write penceresi geçsin
  const son = await getRecordRaw();
  expect(son.revision).toBe(afterB.revision);                               // otomatik ikinci CAS YOK
  // LOST-UPDATE ÖNLEME: B'nin AYNI alandaki item'ı (mB) KORUNDU (auto-merge onu silerdi)
  expect((son.data.giderler || []).some((g) => g.id === "mB")).toBe(true);
  expect((son.data.giderler || []).find((g) => g.id === "mA")?.tur).toBe("needs_review"); // A YAZILMADI
  expect(await journalOku(page, userId)).not.toBeNull();                    // A pending WAL'da KORUNDU
}

// M2 — runtime (reconnect): stale base _send → 409 → güvenli surface, mB korunur
test("M2 — same-field runtime conflict: 409 → B'nin item'ı korunur, otomatik merge yok", async ({ page }) => {
  const { userId, online, afterB } = await kurulum(page);
  await online();
  await page.evaluate(() => window.dispatchEvent(new Event("online"))); // retry → stale _send → 409
  await dogrula(page, userId, afterB);
});

// M3 — reload: load-path serverRev ≠ journal.base → güvenli surface, mB korunur
test("M3 — same-field reload conflict: 409 → B'nin item'ı korunur, otomatik merge yok", async ({ page }) => {
  const { userId, online, afterB } = await kurulum(page);
  await online();
  await page.reload();
  await dogrula(page, userId, afterB);
});
