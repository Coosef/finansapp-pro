// ============================================================
// REAL-PWA E2E — HISTORICAL TRIGGER reproduction (Step 4).
// Üretimde ~45 dk boyunca UI "Kaydedildi" gösterirken PB'ye HİÇ istek gitmedi.
// Kök hata (R1–R4) kanıtlı: send() geçerli ACK vermeyince eski kod false "Kaydedildi"
// üretiyordu. Bu test, "syncBagliMi() neden false oldu?" tetikleyici YOLUNU deterministik
// olarak yeniden üretir: bir 401 (token süresi/geçersizleşme) → pbFindataGonder pbCikis()
// çağırır → token temizlenir → sonraki write'lar bağlantısız. ESKİ kod bunları sessiz null
// ile "başarı" sayardı; YENİ kod hata fırlatır → ASLA false "Kaydedildi".
// ============================================================
import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, getRecordRaw, pbAuth } from "./helpers.mjs";
import { swHazir, rozetMetni, kaydedildiGorunmedi, inceleGiderYap, journalOku, nrGider } from "./pwa.helpers.mjs";

// ---- PW-T1: 401 → pbCikis() → disconnected write → false "Kaydedildi" YOK ----
test("PW-T1 — 401 token expiry tetikleyicisi: bağlantısız sonraki write false 'Kaydedildi' üretmez", async ({ page }) => {
  const { userId } = await pbAuth();
  await seedSession(page, {
    ...BASE_FINDATA,
    giderler: [nrGider("t1", "Belirsiz EFT A", 1000, "2026-08-05"), nrGider("t2", "Belirsiz EFT B", 2000, "2026-08-06")],
  });
  // İlk kaydet isteği 401 → pbFindataGonder içinde pbCikis() → token temizlenir (syncBagliMi false).
  let n = 0;
  await page.route("**/pb/api/findata/kaydet", (route) => {
    n += 1;
    if (n === 1) return route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
    return route.continue();
  });
  await swHazir(page);
  const revOnce = (await getRecordRaw()).revision;

  // Mutation 1 → CAS write → 401 → pbCikis() → "Bağlantı yok".
  await inceleGiderYap(page);
  await expect(rozetMetni(page, "Bağlantı yok")).toBeVisible({ timeout: 15000 });

  // Mutation 2: token artık yok (syncBagliMi false = üretimdeki durum). Bu, tam olarak
  // eski kodun sessiz null → false "Kaydedildi" + WAL sessiz temizliği ürettiği yol.
  await inceleGiderYap(page);

  await kaydedildiGorunmedi(page);                          // YENİ kod: ASLA false "Kaydedildi"
  expect(await journalOku(page, userId)).not.toBeNull();    // WAL KORUNDU (sessiz temizlik yok)
  expect((await getRecordRaw()).revision).toBe(revOnce);    // hiçbir write server'a gitmedi
  // Kanıt: mutation 2 için pbFindataGonder isteği HİÇ oluşmadı (bağlantısız → önce throw).
  expect(n).toBe(1);
});
