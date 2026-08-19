// M1 — "Şimdi Senkronla" (Ayarlar → Bulut) stale-overwrite guard.
// Buton DOĞRUDAN pbFindataGonder(freshRevision) YAPMAMALI (stale local'ı taze revision'a
// base'leyip server'ı ezerdi). Persister'ın authoritative base'i + WAL/conflict yolunu
// kullanır: A local rev N pending → B server rev N+1 → A "Şimdi Senkronla" → CAS 409 →
// B (bağımsız server değişikliği) KORUNUR + A pending/WAL taze state üstüne yeniden uygulanır.
import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, getFindata, setFindata, pbAuth } from "./helpers.mjs";

const nrGider = (id, baslik, miktar, tarih) => ({ id, baslik, miktar, kategori: "Gönderim", tarih, tur: "needs_review" });
const journalOku = async (page, uid) => page.evaluate((u) => localStorage.getItem("finansapp:waj:" + u), uid);

async function offlineYap(page) {
  await page.route("**/pb/api/findata/kaydet", (route) => route.abort("failed"));
  return () => page.unroute("**/pb/api/findata/kaydet");
}

test("M1 — 'Şimdi Senkronla' stale overwrite YAPMAZ: 409 → B korunur, A pending reapply", async ({ page }) => {
  const { userId } = await pbAuth();
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("m1", "Belirsiz M1", 4000, "2026-08-05")] });
  const online = await offlineYap(page);
  await page.goto("/");
  await page.getByText("İşlemler").first().click();
  await page.getByRole("button", { name: /İncele/ }).click();
  await page.getByRole("button", { name: "Gider (harcama)" }).click(); // A local pending: m1→gider (base=N)
  await page.waitForTimeout(1500); // debounce offline'da ateşlenir → _send abort → status hata, WAL KORUNUR
  expect(await journalOku(page, userId)).not.toBeNull();

  // B "başka cihaz" server'ı CAS ile ilerletir (FARKLI top-level alan: gelirler) → base stale
  await setFindata({
    ...BASE_FINDATA,
    giderler: [nrGider("m1", "Belirsiz M1", 4000, "2026-08-05")],
    gelirler: [...BASE_FINDATA.gelirler, { id: "srvM1", baslik: "Server Gelir M1", miktar: 777, kategori: "Maaş", tarih: "2026-08-10", kaynak: "elle" }],
  });

  // Online yap (auto-retry event'i TETİKLEME → tek tetikleyici buton olsun), Ayarlar'a git, butona bas
  await online();
  await page.getByText("Ayarlar").first().click();
  await page.getByRole("button", { name: /Şimdi Senkronla/ }).click(); // → persister flush/retry (base=N) → 409

  // B KORUNUR (no-clobber): stale-fresh-base kör PATCH srvM1'i silerdi; controlled reconcile korur
  await expect.poll(async () => ((await getFindata()).gelirler || []).some((g) => g.id === "srvM1"), { timeout: 20000 }).toBe(true);
  // A pending/WAL KORUNDU → taze state üstüne yeniden uygulandı (m1→gider)
  await expect.poll(async () => ((await getFindata()).giderler || []).find((g) => g.id === "m1")?.tur, { timeout: 20000 }).toBe("gider");
  // WAL sonunda ACK ile temizlenir (reconcile persist oldu)
  await expect.poll(async () => journalOku(page, userId), { timeout: 10000 }).toBeNull();
});
