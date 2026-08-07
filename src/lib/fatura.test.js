import { describe, it, expect } from "vitest";
import { gibKareParse, faturaKategori, yinelenenFaturaMi, kalemDogrula } from "./fatura.js";

describe("gibKareParse", () => {
  it("JSON karekod içeriğini çözer (Türkçe sayı + DD.MM.YYYY)", () => {
    const r = gibKareParse(JSON.stringify({ unvan: "ENERJISA", belgeTarihi: "05.08.2026", odenecekTutar: "1.234,56", vkn: "1234567890" }));
    expect(r.satici).toBe("ENERJISA");
    expect(r.tarih).toBe("2026-08-05");
    expect(r.toplam).toBeCloseTo(1234.56, 2);
    expect(r.vkn).toBe("1234567890");
  });
  it("anahtar=değer / ayraçlı metni de çözer", () => {
    const r = gibKareParse("satici=BEDAS;tarih=2026-07-01;toplam=500,00");
    expect(r.satici).toBe("BEDAS");
    expect(r.tarih).toBe("2026-07-01");
    expect(r.toplam).toBeCloseTo(500, 2);
  });
  it("hiçbir alan yoksa null döner", () => {
    expect(gibKareParse("merhaba dünya")).toBe(null);
    expect(gibKareParse("")).toBe(null);
  });
});

describe("faturaKategori", () => {
  it("elektrik/su/gaz/internet satıcılarını 'Faturalar' sayar", () => {
    expect(faturaKategori("BEDAŞ Elektrik")).toBe("Faturalar");
    expect(faturaKategori("İSKİ Su İdaresi")).toBe("Faturalar");
    expect(faturaKategori("İGDAŞ Doğalgaz")).toBe("Faturalar");
    expect(faturaKategori("Turkcell Superonline")).toBe("Faturalar");
  });
  it("market/normal satıcıda null döner", () => {
    expect(faturaKategori("Migros")).toBe(null);
    expect(faturaKategori("")).toBe(null);
  });
});

describe("yinelenenFaturaMi", () => {
  const gecmis = [
    { baslik: "BEDAS Elektrik", kategori: "Faturalar", tarih: "2026-07-05" },
    { baslik: "Migros", kategori: "Market", tarih: "2026-07-10" },
  ];
  it("önceki ayda aynı satıcı 'Faturalar' varsa true", () => {
    expect(yinelenenFaturaMi({ baslik: "BEDAS Ağustos", tarih: "2026-08-05" }, gecmis)).toBe(true);
  });
  it("aynı ay veya farklı satıcıda false", () => {
    expect(yinelenenFaturaMi({ baslik: "BEDAS", tarih: "2026-07-20" }, gecmis)).toBe(false);
    expect(yinelenenFaturaMi({ baslik: "Vodafone", tarih: "2026-08-05" }, gecmis)).toBe(false);
  });
});

describe("kalemDogrula", () => {
  it("kalem toplamı fiş toplamıyla tutuyorsa yüksek güven", () => {
    const r = kalemDogrula([{ ad: "a", fiyat: 60 }, { ad: "b", fiyat: 40 }], 100);
    expect(r.gecerli).toBe(true);
    expect(r.guven).toBe("yuksek");
  });
  it("tutmuyorsa düşük güven", () => {
    const r = kalemDogrula([{ ad: "a", fiyat: 30 }], 100);
    expect(r.gecerli).toBe(false);
    expect(r.guven).toBe("dusuk");
  });
  it("kalem yoksa null (belirsiz)", () => {
    expect(kalemDogrula([], 100).gecerli).toBe(null);
  });
});
