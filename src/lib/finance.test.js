import { describe, it, expect } from "vitest";
import { bosVeri, kurallariUygula, tekrarlariUret, rozetleriHesapla, giderKategorileri, gelirKategorileri, hesapDelta, hesabaUygula, transferUygula, yillikOzet } from "./finance.js";

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

describe("hesapDelta", () => {
  it("normal hesap: gelir +, gider −", () => {
    expect(hesapDelta("gelir", 100, "banka")).toBe(100);
    expect(hesapDelta("gider", 100, "banka")).toBe(-100);
  });
  it("kredi kartı: gider borcu artırır, gelir azaltır", () => {
    expect(hesapDelta("gider", 100, "kart")).toBe(100);
    expect(hesapDelta("gelir", 100, "kart")).toBe(-100);
  });
});

describe("hesabaUygula", () => {
  const d = { hesaplar: [{ id: 1, tip: "banka", bakiye: 1000 }] };
  it("gider bakiyeyi azaltır", () => {
    expect(hesabaUygula(d, 1, "gider", 200, +1).hesaplar[0].bakiye).toBe(800);
  });
  it("geri alma (isaret −1) tersine çevirir", () => {
    expect(hesabaUygula(d, 1, "gider", 200, -1).hesaplar[0].bakiye).toBe(1200);
  });
  it("hesapId yoksa değişmez", () => {
    expect(hesabaUygula(d, "", "gider", 200, +1)).toBe(d);
  });
});

describe("transferUygula", () => {
  const d = { hesaplar: [{ id: 1, tip: "banka", bakiye: 1000 }, { id: 2, tip: "banka", bakiye: 500 }, { id: 3, tip: "kart", bakiye: 800 }] };
  it("kaynaktan çıkar, hedefe ekler", () => {
    const r = transferUygula(d, 1, 2, 300);
    expect(r.hesaplar[0].bakiye).toBe(700);
    expect(r.hesaplar[1].bakiye).toBe(800);
  });
  it("kredi kartına transfer borcu azaltır", () => {
    const r = transferUygula(d, 1, 3, 200);
    expect(r.hesaplar[0].bakiye).toBe(800); // kaynak
    expect(r.hesaplar[2].bakiye).toBe(600); // kart borcu 800 → 600
  });
  it("aynı hesap / sıfır tutar → değişmez", () => {
    expect(transferUygula(d, 1, 1, 100)).toBe(d);
    expect(transferUygula(d, 1, 2, 0)).toBe(d);
  });
});

describe("yillikOzet", () => {
  const d = {
    gelirler: [{ tarih: "2026-01-05", miktar: 5000 }, { tarih: "2026-03-10", miktar: 5000 }, { tarih: "2025-01-01", miktar: 9999 }],
    giderler: [{ tarih: "2026-01-20", miktar: 2000 }],
  };
  const o = yillikOzet(d, 2026);
  it("yalnız seçili yılı toplar", () => {
    expect(o.toplamGelir).toBe(10000); // 2025 hariç
    expect(o.toplamGider).toBe(2000);
    expect(o.net).toBe(8000);
  });
  it("ayları doğru dağıtır", () => {
    expect(o.aylar[0].gelir).toBe(5000); // Ocak
    expect(o.aylar[2].gelir).toBe(5000); // Mart
    expect(o.aylar).toHaveLength(12);
  });
  it("tasarruf oranı = net/gelir", () => {
    expect(o.tasarrufOrani).toBe(80);
  });
});
