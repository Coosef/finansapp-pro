// C3 — runtime stale WAL: reconnect → 409/no-clobber + WAL preserved + controlled reconcile.
// P9 reload-path'i test eder; C3 RUNTIME path'i (reload YOK): offline pending → server ilerler
// → reconnect → persister _send stale base ile 409 → catisma → runtime cozumle reconcile.
import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, getFindata, setFindata, pbAuth } from "./helpers.mjs";
import { panele } from "./ui.mjs";

const nrGider = (id, baslik, miktar, tarih) => ({ id, baslik, miktar, kategori: "Gönderim", tarih, tur: "needs_review" });
const journalOku = async (page, uid) => page.evaluate((u) => localStorage.getItem("finansapp:waj:" + u), uid);

async function offlineYap(page) {
  await page.route("**/pb/api/findata/kaydet", (route) => route.abort("failed"));
  return () => page.unroute("**/pb/api/findata/kaydet");
}

test("C3 — runtime stale WAL: reconnect → 409/no-clobber, WAL preserved, controlled reconcile", async ({ page }) => {
  const { userId } = await pbAuth();
  await seedSession(page, { ...BASE_FINDATA, giderler: [nrGider("c3", "Belirsiz C3", 4000, "2026-08-05")] });
  const online = await offlineYap(page);
  await page.goto("/");
  await page.getByText("İşlemler").first().click();
  await page.getByRole("button", { name: /İncele/ }).click();
  await page.getByRole("button", { name: "Gider (harcama)" }).click(); // local pending → WAL
  await page.waitForTimeout(1500); // debounce offline'da ateşlenir → _send abort → status hata, WAL KORUNUR
  expect(await journalOku(page, userId)).not.toBeNull();

  // "Başka cihaz" server'ı CAS ile ilerletir (FARKLI top-level alan: gelirler) → base artık stale
  await setFindata({
    ...BASE_FINDATA,
    giderler: [nrGider("c3", "Belirsiz C3", 4000, "2026-08-05")],
    gelirler: [...BASE_FINDATA.gelirler, { id: "srv3", baslik: "Server Gelir C3", miktar: 999, kategori: "Maaş", tarih: "2026-08-10", kaynak: "elle" }],
  });

  // Reconnect (reload YOK): stale base _send → 409 → catisma → runtime cozumle reconcile
  await online();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  // No-clobber: server'ın bağımsız değişikliği (srv3) korunur (stale kör PATCH bunu silerdi)
  await expect.poll(async () => ((await getFindata()).gelirler || []).some((g) => g.id === "srv3"), { timeout: 20000 }).toBe(true);
  // Controlled reconcile: local pending (c3→gider) taze state üstüne yeniden uygulanır
  await expect.poll(async () => ((await getFindata()).giderler || []).find((g) => g.id === "c3")?.tur, { timeout: 20000 }).toBe("gider");
  // WAL sonunda ACK ile temizlenir (reconcile başarıyla persist oldu)
  await expect.poll(async () => journalOku(page, userId), { timeout: 10000 }).toBeNull();
  // UI de tutarlı: gider görünür
  await panele(page);
  await expect(page.getByText(/4\.000/).first()).toBeVisible({ timeout: 15000 });
});
