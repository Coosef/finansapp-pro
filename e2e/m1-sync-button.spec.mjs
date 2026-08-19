// M1 — "Şimdi Senkronla" (Ayarlar → Bulut) stale-overwrite guard.
// Buton DOĞRUDAN pbFindataGonder(freshRevision) YAPMAMALI (stale local'ı taze revision'a
// base'leyip server'ı ezerdi). Persister'ın authoritative base'i + WAL/conflict yolu:
// A local pending @rev N → B server @rev N+1 → A "Şimdi Senkronla" → CAS 409 → SERVER KORUNUR,
// A pending WAL'da KORUNUR, OTOMATİK ikinci CAS YOK (revision ilerlemez), çakışma yüzeyde.
import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, getRecordRaw, setFindata, pbAuth } from "./helpers.mjs";

const nrGider = (id, baslik, miktar, tarih) => ({ id, baslik, miktar, kategori: "Gönderim", tarih, tur: "needs_review" });
const journalOku = async (page, uid) => page.evaluate((u) => localStorage.getItem("finansapp:waj:" + u), uid);

async function offlineYap(page) {
  await page.route("**/pb/api/findata/kaydet", (route) => route.abort("failed"));
  return () => page.unroute("**/pb/api/findata/kaydet");
}

test("M1 — 'Şimdi Senkronla' stale overwrite YAPMAZ: 409 → server+WAL korunur, otomatik write yok", async ({ page }) => {
  const { userId } = await pbAuth();
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("m1", "Belirsiz M1", 4000, "2026-08-05")] });
  const online = await offlineYap(page);
  await page.goto("/");
  await page.getByText("İşlemler").first().click();
  await page.getByRole("button", { name: /İncele/ }).click();
  await page.getByRole("button", { name: "Gider (harcama)" }).click(); // A local pending: m1→gider (base=N)
  await page.waitForTimeout(1500); // debounce offline → _send abort → status hata, WAL KORUNUR
  expect(await journalOku(page, userId)).not.toBeNull();

  // B "başka cihaz" server'ı CAS ile ilerletir (farklı alan: gelirler) → base stale
  await setFindata({
    ...BASE_FINDATA,
    giderler: [nrGider("m1", "Belirsiz M1", 4000, "2026-08-05")],
    gelirler: [...BASE_FINDATA.gelirler, { id: "srvM1", baslik: "Server Gelir M1", miktar: 777, kategori: "Maaş", tarih: "2026-08-10", kaynak: "elle" }],
  });
  const afterB = await getRecordRaw(); // server @rev N+1 (B'nin durumu)

  // Online yap (auto-retry event'i TETİKLEME → tek tetikleyici buton olsun), Ayarlar → butona bas
  await online();
  await page.getByText("Ayarlar").first().click();
  await page.getByRole("button", { name: /Şimdi Senkronla/ }).click(); // → persister flush/retry (base=N) → 409

  // Çakışma yüzeyde
  await expect(page.getByText(/Çakışma/).first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1500); // olası (hatalı) otomatik write penceresi geçsin

  const son = await getRecordRaw();
  expect(son.revision).toBe(afterB.revision);                              // otomatik ikinci CAS YOK
  expect((son.data.gelirler || []).some((g) => g.id === "srvM1")).toBe(true); // B KORUNDU (no-clobber)
  expect((son.data.giderler || []).find((g) => g.id === "m1")?.tur).toBe("needs_review"); // A YAZILMADI
  expect(await journalOku(page, userId)).not.toBeNull();                   // A pending WAL'da KORUNDU
});
