// T1C — Entegrasyonlar kartı render sözleşmesi (SSR; mevcut _smoke deseni).
// İlk render (durum sunucudan gelmeden) ASLA "Bağlı değil" göstermez; kart Ayarlar akışında
// BulutKart'tan sonra yer alır ve iç kimlik/secret sızdırmaz.
import { describe, it, expect, beforeAll } from "vitest";
import { renderToString } from "react-dom/server";

beforeAll(() => {
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  if (typeof window === "undefined") globalThis.window = globalThis;
  window.matchMedia = globalThis.matchMedia;
  window.localStorage = globalThis.localStorage;
  globalThis.fetch = async () => { throw new Error("render sırasında ağ çağrısı yok"); };
  globalThis.localStorage.setItem("finansapp:sync", JSON.stringify({ url: "http://localhost:8090", token: "t", userId: "u", email: "a@b.test" }));
});

async function ayarlarHtml(extra = {}) {
  const { Ayarlar } = await import("./settings.jsx");
  const { bosVeri } = await import("../lib/finance.js");
  const fd = { ...bosVeri(), ayarlar: { kuruldu: true } };
  return renderToString(<Ayarlar findata={fd} setFindata={() => {}} bildir={() => {}} user={{ email: "a@b.test" }} onLogout={() => {}} senkronlaSimdi={() => {}} {...extra} />);
}

describe("T1C Entegrasyonlar kartı (ilk render)", () => {
  it("TC-UI01 ilk render 'Bağlı değil' göstermez; yükleniyor durumu görünür", async () => {
    const html = await ayarlarHtml();
    expect(html).toContain("Entegrasyonlar");
    expect(html).toContain("Telegram bağlantı durumu kontrol ediliyor");
    expect(html).not.toContain("Bağlı değil");          // flaş YOK
    expect(html).not.toContain("Telegram&#x27;ı Bağla"); // buton da durum bilinmeden çıkmaz
  });

  it("TC-UI14 kart Ayarlar akışında BulutKart'tan sonra, PWA kartından önce", async () => {
    const html = await ayarlarHtml();
    const bulut = html.indexOf("Hesap &amp; Ortak Hane");
    const ent = html.indexOf("Entegrasyonlar");
    const pwa = html.indexOf("Uygulama Olarak Kur");
    expect(bulut).toBeGreaterThan(-1);
    expect(ent).toBeGreaterThan(bulut);
    if (pwa > -1) expect(ent).toBeLessThan(pwa);
  });

  it("TC-UI15 render çıktısında secret/iç kimlik izleri yok", async () => {
    const html = await ayarlarHtml();
    for (const s of ["TG_GATEWAY_SECRET", "TG_PAIRING_PEPPER", "TELEGRAM_BOT_TOKEN", "X-TG-Signature"]) {
      expect(html).not.toContain(s);
    }
  });
});
