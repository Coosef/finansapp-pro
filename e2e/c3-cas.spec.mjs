// C3 — runtime stale WAL: reconnect → 409 → SERVER KORUNUR + WAL KORUNUR + çakışma yüzeyde,
// OTOMATİK reconcile/merge/write YOK. P9 reload-path'i; C3 RUNTIME path'i (reload YOK).
// Bu increment'te aynı-alan lost-update riski nedeniyle otomatik merge kaldırıldı → güvenli surface.
import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, getRecordRaw, setFindata, pbAuth } from "./helpers.mjs";

const nrGider = (id, baslik, miktar, tarih) => ({ id, baslik, miktar, kategori: "Gönderim", tarih, tur: "needs_review" });
const journalOku = async (page, uid) => page.evaluate((u) => localStorage.getItem("finansapp:waj:" + u), uid);

async function offlineYap(page) {
  await page.route("**/pb/api/findata/kaydet", (route) => route.abort("failed"));
  return () => page.unroute("**/pb/api/findata/kaydet");
}

test("C3 — runtime stale WAL: reconnect → 409, server+WAL korunur, çakışma yüzeyde, otomatik write yok", async ({ page }) => {
  const { userId } = await pbAuth();
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("c3", "Belirsiz C3", 4000, "2026-08-05")] });
  const online = await offlineYap(page);
  await page.goto("/");
  await page.getByText("İşlemler").first().click();
  await page.getByRole("button", { name: /İncele/ }).click();
  await page.getByRole("button", { name: "Gider (harcama)" }).click(); // local pending → WAL
  await page.waitForTimeout(1500); // debounce offline → _send abort → status hata, WAL KORUNUR
  expect(await journalOku(page, userId)).not.toBeNull();

  // "Başka cihaz" server'ı CAS ile ilerletir (farklı alan: gelirler) → base stale
  await setFindata({
    ...BASE_FINDATA,
    giderler: [nrGider("c3", "Belirsiz C3", 4000, "2026-08-05")],
    gelirler: [...BASE_FINDATA.gelirler, { id: "srv3", baslik: "Server Gelir C3", miktar: 999, kategori: "Maaş", tarih: "2026-08-10", kaynak: "elle" }],
  });
  const afterB = await getRecordRaw();

  // Reconnect (reload YOK): online event → retry → stale base _send → 409 → catisma
  await online();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await expect(page.getByText(/Çakışma/).first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1500); // olası (hatalı) otomatik reconcile penceresi geçsin

  const son = await getRecordRaw();
  expect(son.revision).toBe(afterB.revision);                               // otomatik write YOK
  expect((son.data.gelirler || []).some((g) => g.id === "srv3")).toBe(true); // server KORUNDU
  expect((son.data.giderler || []).find((g) => g.id === "c3")?.tur).toBe("needs_review"); // local YAZILMADI
  expect(await journalOku(page, userId)).not.toBeNull();                    // WAL KORUNDU
});
