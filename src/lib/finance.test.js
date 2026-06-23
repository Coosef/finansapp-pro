import { describe, it, expect } from "vitest";
import { bosVeri, kurallariUygula, tekrarlariUret, rozetleriHesapla, giderKategorileri, gelirKategorileri } from "./finance.js";

describe("bosVeri", () => {
  it("beklenen alanları içerir", () => {
    const d = bosVeri();
    for (const k of ["gelirler", "giderler", "abonelikler", "yatirimlar", "butceler", "hesaplar", "kategoriler", "ayarlar"]) {
      expect(d).toHaveProperty(k);
    }
  });
  it("varsayılan accent zümrüt, sağlayıcı anthropic", () => {
    const a = bosVeri().ayarlar;
    expect(a.accent).toBe("#10B981");
    expect(a.aiSaglayici).toBe("anthropic");
  });
  it("varsayılan kategoriler dolu", () => {
    expect(bosVeri().kategoriler.gider).toContain("Market");
    expect(bosVeri().kategoriler.gelir).toContain("Maaş");
  });
});

describe("kurallariUygula", () => {
  it("kelimeye göre kategori atar", () => {
    const { kayit } = kurallariUygula({ baslik: "Migros AVM", miktar: 100, kategori: "Diğer" }, [{ tip: "kategori", kelime: "migros", kategori: "Market" }]);
    expect(kayit.kategori).toBe("Market");
  });
  it("tutar üstünde uyarı verir", () => {
    const { uyarilar } = kurallariUygula({ baslik: "X", miktar: 5000 }, [{ tip: "uyari", tutarUstu: 1000, mesaj: "çok harcadın" }]);
    expect(uyarilar.length).toBe(1);
  });
  it("eşleşme yoksa değiştirmez", () => {
    const { kayit, uyarilar } = kurallariUygula({ baslik: "Kira", miktar: 100, kategori: "Konut" }, [{ tip: "kategori", kelime: "migros", kategori: "Market" }]);
    expect(kayit.kategori).toBe("Konut");
    expect(uyarilar.length).toBe(0);
  });
});

describe("tekrarlariUret", () => {
  it("şablon yoksa değişiklik yok", () => {
    const d = bosVeri();
    const { degisti } = tekrarlariUret(d);
    expect(degisti).toBe(false);
  });
  it("geçmişe ait aylık gelir şablonundan kayıt üretir", () => {
    const d = { ...bosVeri(), sablonlar: [{ id: 1, tip: "gelir", baslik: "Maaş", miktar: 5000, kategori: "Maaş", frekans: "aylık", baslangic: "2020-01-01", sonUretilen: null }] };
    const { data, degisti } = tekrarlariUret(d);
    expect(degisti).toBe(true);
    expect(data.gelirler.length).toBeGreaterThan(0);
    expect(data.gelirler.every((g) => g.otomatik)).toBe(true);
    // sonUretilen bugünden ileri olmamalı
    expect(data.sablonlar[0].sonUretilen <= new Date().toISOString().split("T")[0]).toBe(true);
  });
});

describe("rozetleriHesapla", () => {
  it("boş veride 'ilk adım' kazanılmamış", () => {
    const r = rozetleriHesapla(bosVeri(), 0, 0);
    expect(r.find((x) => x.id === "ilk").kazanildi).toBe(false);
  });
  it("bir gelir varsa 'ilk adım' kazanılır", () => {
    const d = { ...bosVeri(), gelirler: [{ id: 1, miktar: 100 }] };
    const r = rozetleriHesapla(d, 100, 0);
    expect(r.find((x) => x.id === "ilk").kazanildi).toBe(true);
  });
  it("net 1.000.000+ ise 'altı sıfır' kazanılır", () => {
    const r = rozetleriHesapla(bosVeri(), 1500000, 0);
    expect(r.find((x) => x.id === "varlikli").kazanildi).toBe(true);
  });
});

describe("etkin kategoriler", () => {
  it("özel yoksa varsayılan döner", () => {
    expect(giderKategorileri({})).toContain("Market");
    expect(gelirKategorileri({})).toContain("Maaş");
  });
  it("özel kategoriler tanımlıysa onları döner", () => {
    expect(giderKategorileri({ kategoriler: { gider: ["A", "B"] } })).toEqual(["A", "B"]);
  });
});
