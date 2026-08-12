import { describe, it, expect } from "vitest";
import { kurus, paraTopla, paraEsit } from "./para.js";

// Item 10: JS ikili float'ta para aritmetiği kuruş-altı artık üretir
// (0.1+0.2 = 0.30000000000000004). Deterministik kuruş yuvarlaması bunu temizler.
// Tam sayı (kuruş int) migrasyonu ertelendi — bkz ADR-0001.

describe("kurus — deterministik 2 ondalık yuvarlama", () => {
  it("float artığını temizler (0.1+0.2 kanıtı)", () => {
    expect(0.1 + 0.2).not.toBe(0.3); // ham float drift eder
    expect(kurus(0.1 + 0.2)).toBe(0.3); // yardımcı düzeltir
  });
  it("yarım kuruşu yukarı yuvarlar (pozitif)", () => {
    expect(kurus(1.005)).toBe(1.01);
    expect(kurus(2.675)).toBe(2.68); // klasik toFixed hatası (2.67) burada olmaz
  });
  it("negatifte simetrik (yarım → sıfırdan uzağa)", () => {
    expect(kurus(-1.005)).toBe(-1.01);
    expect(kurus(-2.5 / 100)).toBe(-0.03);
  });
  it("geçersiz/boş girişte 0", () => {
    expect(kurus(null)).toBe(0);
    expect(kurus(undefined)).toBe(0);
    expect(kurus("abc")).toBe(0);
  });
  it("zaten kuruş-hassas değeri korur", () => {
    expect(kurus(1234.56)).toBe(1234.56);
    expect(kurus(0)).toBe(0);
  });
});

describe("paraTopla — birikimli float drift'e karşı güvenli toplam", () => {
  it("çok sayıda kuruş değerinin ham toplamı drift eder; paraTopla düzeltir", () => {
    const liste = Array.from({ length: 10 }, () => ({ miktar: 0.1 }));
    const hamToplam = liste.reduce((s, x) => s + x.miktar, 0);
    expect(hamToplam).not.toBe(1); // 0.9999999999999999
    expect(paraTopla(liste, (x) => x.miktar)).toBe(1);
  });
  it("seçici olmadan sayı listesini toplar", () => {
    expect(paraTopla([0.1, 0.2, 0.3])).toBe(0.6);
  });
  it("kur çevrimi artığını temizler (19.99 USD × 40.1)", () => {
    const ham = 19.99 * 40.1;
    expect(ham).not.toBe(801.6); // 801.5990000000001
    expect(kurus(ham)).toBe(801.6);
  });
});

describe("paraEsit — yarım kuruş toleranslı eşitlik", () => {
  it("float artığı olan iki değeri eşit sayar", () => {
    expect(paraEsit(0.1 + 0.2, 0.3)).toBe(true);
    expect(paraEsit(100.001, 100)).toBe(true); // < yarım kuruş
    expect(paraEsit(100.01, 100)).toBe(false); // 1 kuruş fark
  });
});
