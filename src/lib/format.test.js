import { describe, it, expect } from "vitest";
import { TL, TL2, bugun, buAy, sonrakiTarih, aylikEsdeger, kategoriAnahtar, sayiCikar, parseJSON } from "./format.js";

describe("para biçimleme", () => {
  it("TL binlik ayracı ve ₺ içerir, ondalık yok", () => {
    const s = TL(1234);
    expect(s).toContain("1.234");
    expect(s).toContain("₺");
    expect(s).not.toContain(",");
  });
  it("TL null/undefined → 0", () => {
    expect(TL(null)).toContain("0");
    expect(TL(undefined)).toContain("0");
  });
  it("TL2 iki ondalık (virgül) gösterir", () => {
    expect(TL2(1234.5)).toContain("1.234,50");
  });
});

describe("tarih yardımcıları", () => {
  it("bugun YYYY-MM-DD biçiminde", () => {
    expect(bugun()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("buAy YYYY-MM biçiminde", () => {
    expect(buAy()).toMatch(/^\d{4}-\d{2}$/);
  });
  it("sonrakiTarih aylık", () => {
    expect(sonrakiTarih("2026-01-15", "aylık")).toBe("2026-02-15");
  });
  it("sonrakiTarih haftalık (+7 gün)", () => {
    expect(sonrakiTarih("2026-01-15", "haftalık")).toBe("2026-01-22");
  });
  it("sonrakiTarih yıllık", () => {
    expect(sonrakiTarih("2026-01-15", "yıllık")).toBe("2027-01-15");
  });
});

describe("aylikEsdeger", () => {
  it("aylık aynı kalır", () => expect(aylikEsdeger(100, "aylık")).toBe(100));
  it("haftalık ×4.33", () => expect(aylikEsdeger(100, "haftalık")).toBeCloseTo(433));
  it("yıllık ÷12", () => expect(aylikEsdeger(120, "yıllık")).toBe(10));
});

describe("kategoriAnahtar", () => {
  it("ilk iki kelime, küçük harf", () => {
    expect(kategoriAnahtar("Migros Market Alışverişi")).toBe("migros market");
  });
  it("boşlukları kırpar", () => expect(kategoriAnahtar("  Spotify ")).toBe("spotify"));
  it("boş girdi → boş", () => expect(kategoriAnahtar("")).toBe(""));
});

describe("sayiCikar (Türkçe sayı çözümleme)", () => {
  it("nokta ondalık", () => expect(sayiCikar("2456.50")).toBe(2456.5));
  it("Türkçe: nokta binlik, virgül ondalık", () => expect(sayiCikar("2.456,50")).toBe(2456.5));
  it("metin içinden sayı + birim", () => expect(sayiCikar("1.234,5 TL")).toBe(1234.5));
  it("yalnız virgül ondalık", () => expect(sayiCikar("3,14")).toBe(3.14));
  it("sayı yoksa NaN", () => expect(sayiCikar("abc")).toBeNaN());
});

describe("parseJSON (AI yanıtı temizleme)", () => {
  it("```json bloğunu temizler", () => {
    expect(parseJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("metin arasındaki nesneyi bulur", () => {
    expect(parseJSON('cevap: {"x":2} bitti')).toEqual({ x: 2 });
  });
  it("dizi ayrıştırır", () => {
    expect(parseJSON("[1,2,3]")).toEqual([1, 2, 3]);
  });
  it("satır-başı // yorumlarını tolere eder", () => {
    expect(parseJSON('{\n"a":1\n// buraya ekle\n}')).toEqual({ a: 1 });
  });
  it("sondaki virgülü tolere eder", () => {
    expect(parseJSON('{"a":1,"b":[2,3,],}')).toEqual({ a: 1, b: [2, 3] });
  });
  it("iki nesne arası eksik virgülü tolere eder", () => {
    expect(parseJSON('[{"a":1}\n{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }]);
  });
});
