import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, getFindata } from "./helpers.mjs";
import { panele } from "./ui.mjs";

// Belirsiz transfer benzeri gider → aiAdaylari'na girer. ayarlar.proxyMod:true →
// uygulama GERÇEK üretim AI proxy'sini (POST {origin}/pb/ai) çağırır → page.route ile mock.
const L_FINDATA = {
  ...BASE_FINDATA,
  giderler: [
    { id: "e1", baslik: "Giden Transfer, Mustafa Demir, Ev kirası 15 Mart", miktar: 12000, kategori: "Diğer", tarih: "2026-08-05", kaynak: "elle" },
  ],
  merchantKurallari: [],
  ayarlar: { kuruldu: true, aiSaglayici: "anthropic", proxyMod: true },
};

const kayitTur = async () => ((await getFindata()).giderler || []).find((g) => g.id === "e1")?.tur;

// Anthropic başarılı yanıt şekli: content[0].text = JSON dizi string'i (strict schema).
const AI_BASARILI = {
  status: 200, contentType: "application/json",
  body: JSON.stringify({ content: [{ type: "text", text: JSON.stringify([
    { id: "e1", suggestedTur: "household_transfer", reason: "Kira ödemesi, kişi transferi", evidence: ["kira", "Mustafa Demir"] },
  ]) }] }),
};

async function aiOneriyeGit(page) {
  await page.getByText("İşlemler").first().click();
  await page.getByRole("button", { name: /İncele/ }).click();
  await page.getByRole("button", { name: "Kalanları AI ile öner" }).click();
  await expect(page.getByText("AI ile sınıflandırma önerisi")).toBeVisible({ timeout: 10000 });
}

test.beforeEach(async ({ page }) => {
  await seedSession(page, L_FINDATA);
});

test("L — AI success: privacy → öneri → kabul → KPI + provenance", async ({ page }) => {
  await page.route("**/pb/ai", (route) => route.fulfill(AI_BASARILI));
  await page.goto("/");

  // Başlangıç: belirsiz gider normal gider sayılır → Toplam Gider 12.000
  await panele(page);
  await expect(page.getByText(/12\.000/).first()).toBeVisible({ timeout: 15000 });

  // İncele → "Kalanları AI ile öner" → privacy onayı (maskeli veri)
  await aiOneriyeGit(page);
  await expect(page.getByText(/yalnız maskeli/)).toBeVisible();
  await page.getByRole("button", { name: /Gönder/ }).click();

  // Öneri UI görünür; KABUL EDİLMEDEN tur yazılmaz (KPI etkilenmez)
  await expect(page.getByRole("button", { name: "Kabul", exact: true }).first()).toBeVisible({ timeout: 15000 });
  expect(await kayitTur()).toBeUndefined();

  // Kabul → provenance yazılır (turKaynak:user, kaynak:ai)
  await page.getByRole("button", { name: "Kabul", exact: true }).first().click();
  await expect.poll(kayitTur, { timeout: 15000 }).toBe("household_transfer");
  const g = ((await getFindata()).giderler || []).find((x) => x.id === "e1");
  expect(g.turKaynak).toBe("user");
  expect(g.acceptedSuggestionSource).toBe("ai");

  // KPI: household_transfer nötr → Toplam Gider 0
  await panele(page);
  await expect(page.getByText("Bu dönemde gider yok").first()).toBeVisible({ timeout: 15000 });
});

// Tüm hata modları graceful: işlem MUTATE EDİLMEZ, app çalışmaya devam eder, anlaşılır hata.
const HATA_MODLARI = [
  { ad: "429", route: (r) => r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: { message: "rate limit" } }) }) },
  { ad: "timeout", route: (r) => r.abort("timedout") },
  { ad: "invalid-json", route: (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ content: [{ type: "text", text: "düz metin — JSON değil" }] }) }) },
  { ad: "unavailable-503", route: (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "no server key" } }) }) },
];

for (const m of HATA_MODLARI) {
  test(`L — AI hata (${m.ad}): graceful, mutation yok, app çalışır`, async ({ page }) => {
    await page.route("**/pb/ai", m.route);
    await page.goto("/");
    await aiOneriyeGit(page);
    await page.getByRole("button", { name: /Gönder/ }).click();

    // Graceful hata (retry/backoff sonrası) — kullanıcı anlaşılır mesaj görür
    await expect(page.getByText(/hepsi atlandı|çağrısı başarısız/)).toBeVisible({ timeout: 25000 });
    // İşlem MUTATE EDİLMEDİ
    expect(await kayitTur()).toBeUndefined();
    // Kapat → app çalışmaya devam eder
    await page.getByRole("button", { name: "Kapat" }).click();
    await panele(page);
    await expect(page.getByText(/12\.000/).first()).toBeVisible({ timeout: 15000 });
  });
}
