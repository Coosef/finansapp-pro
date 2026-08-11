import { describe, it, expect } from "vitest";
import { bosVeri, kurallariUygula, tekrarlariUret, rozetleriHesapla, giderKategorileri, gelirKategorileri, hesapDelta, hesabaUygula, transferUygula, transferleriEslestir, iceAktarilaniTemizle, yillikOzet, butceDevri, etkinButce, hedefKatkilariUret, yaklasanOdemeler, donemAraligi, donemde, donemFiltre, reelDeger, panelBrifing, netGecmisGuncelle, kartOdemeler, butceOnerisi } from "./finance.js";

describe("iceAktarilaniTemizle", () => {
  const f = {
    gelirler: [{ id: 1, kaynak: "ekstre" }, { id: 2 }],
    giderler: [{ id: 3, kaynak: "ekstre" }, { id: 4, kaynak: "taksit" }, { id: 5, kaynak: "manuel" }, { id: 6 }],
    hesaplar: [{ id: "a", son4: "0457" }, { id: "b", banka: "Enpara" }, { id: "c", ad: "Nakit" }],
    transferAkis: [{ id: 1 }],
    abonelikler: [{ id: 9 }],
  };
  const r = iceAktarilaniTemizle(f);
  it("ekstre/taksit işlemleri siler, elle gireni tutar", () => {
    expect(r.gelirler.map((x) => x.id)).toEqual([2]);
    expect(r.giderler.map((x) => x.id).sort()).toEqual([5, 6]);
  });
  it("içe aktarılan hesapları (son4/banka) siler, elle gireni tutar", () => {
    expect(r.hesaplar.map((h) => h.id)).toEqual(["c"]);
  });
  it("transfer akışını temizler, abonelikleri korur", () => {
    expect(r.transferAkis).toEqual([]);
    expect(r.abonelikler.length).toBe(1);
  });
});

describe("transferleriEslestir", () => {
  const findata = {
    hesaplar: [{ id: "a", ad: "DenizBank" }, { id: "b", ad: "Enpara" }],
    transferler: [{ id: "m1", kaynakId: "a", hedefId: "b", miktar: 1000, tarih: "2026-03-01" }],
    transferAkis: [
      { id: 1, hesapId: "a", tarih: "2026-04-04", miktar: -50000, aciklama: "Giden" },
      { id: 2, hesapId: "b", tarih: "2026-04-05", miktar: 50000, aciklama: "Gelen" },
      { id: 3, hesapId: "a", tarih: "2026-04-10", miktar: -9000, aciklama: "Helin Ergüzel" },
    ],
  };
  const r = transferleriEslestir(findata);

  it("çıkan↔giren bacakları farklı hesaplarda eşler", () => {
    const e = r.eslesen.find((x) => x.kaynak === "ekstre");
    expect(e.fromAd).toBe("DenizBank");
    expect(e.toAd).toBe("Enpara");
    expect(e.miktar).toBe(50000);
  });

  it("manuel transferi de eşleşmiş listeye katar", () => {
    expect(r.eslesen.some((x) => x.kaynak === "manuel" && x.miktar === 1000)).toBe(true);
  });

  it("karşılığı olmayan bacağı eşleşmeyen sayar", () => {
    expect(r.eslesmeyen.length).toBe(1);
    expect(r.eslesmeyen[0].aciklama).toBe("Helin Ergüzel");
  });

  it("hesap çiftine göre özet (korelasyon) çıkarır", () => {
    const yol = r.ozet.find((o) => o.fromAd === "DenizBank" && o.toAd === "Enpara");
    expect(yol.toplam).toBe(51000); // 50000 ekstre + 1000 manuel
    expect(yol.adet).toBe(2);
  });

  it("hane kişisi bacağını (kisiId) doğrudan akış olarak gösterir", () => {
    const d = {
      hesaplar: [{ id: "a", ad: "Garanti" }],
      kisiler: [{ id: "k1", ad: "Kız arkadaşım", hane: true }],
      transferAkis: [
        { id: 9, hesapId: "a", tarih: "2026-08-05", miktar: -8000, aciklama: "Helin", kisiId: "k1" },
        { id: 10, hesapId: "a", tarih: "2026-08-10", miktar: 2000, aciklama: "Helin", kisiId: "k1" },
      ],
    };
    const rr = transferleriEslestir(d);
    const giden = rr.eslesen.find((e) => e.kisiId === "k1" && e.fromAd === "Garanti");
    expect(giden.toAd).toBe("Kız arkadaşım");
    expect(giden.miktar).toBe(8000);
    const gelen = rr.eslesen.find((e) => e.kisiId === "k1" && e.toAd === "Garanti");
    expect(gelen.fromAd).toBe("Kız arkadaşım");
    expect(gelen.miktar).toBe(2000);
    // Kişi bacakları eşleşmeyen sayılmaz
    expect(rr.eslesmeyen.length).toBe(0);
  });
});

describe("bosVeri", () => {
  it("beklenen alanları içerir", () => {
    const d = bosVeri();
    for (const k of ["gelirler", "giderler", "abonelikler", "yatirimlar", "butceler", "hesaplar", "kategoriler", "ayarlar"]) {
      expect(d).toHaveProperty(k);
    }
  });
  it("varsayılan accent altın, tema açık, sağlayıcı anthropic", () => {
    const a = bosVeri().ayarlar;
    expect(a.accent).toBe("#C79A4B");
    expect(a.tema).toBe("acik");
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
  it("pasif şablon kayıt üretmez (maaşa dönüştürülmüş)", () => {
    const d = { ...bosVeri(), sablonlar: [{ id: 1, tip: "gelir", baslik: "Maaş", miktar: 5000, kategori: "Maaş", frekans: "aylık", baslangic: "2020-01-01", sonUretilen: null, pasif: true }] };
    const { data, degisti } = tekrarlariUret(d);
    expect(degisti).toBe(false);
    expect(data.gelirler.length).toBe(0);
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

describe("bütçe devri", () => {
  const base = { butceler: { Market: 1000 }, giderler: [{ kategori: "Market", tarih: "2026-02-10", miktar: 600 }], ayarlar: { butceDevri: true } };
  it("devir kapalıysa 0", () => {
    expect(butceDevri({ ...base, ayarlar: { butceDevri: false } }, "Market", "2026-03")).toBe(0);
  });
  it("önceki ay 600 harcandıysa 400 devreder", () => {
    expect(butceDevri(base, "Market", "2026-03")).toBe(400);
  });
  it("etkin bütçe = baz + devir", () => {
    expect(etkinButce(base, "Market", "2026-03")).toBe(1400);
  });
  it("aşım negatif devreder", () => {
    const asan = { ...base, giderler: [{ kategori: "Market", tarih: "2026-02-10", miktar: 1300 }] };
    expect(butceDevri(asan, "Market", "2026-03")).toBe(-300);
  });
});

describe("hedefKatkilariUret", () => {
  it("otomatik kapalıysa değişmez", () => {
    const d = { hedefler: [{ id: 1, tip: "birikim", hedefTutar: 10000, mevcutTutar: 0, aylikKatki: 500, otomatikKatki: false }] };
    expect(hedefKatkilariUret(d).degisti).toBe(false);
  });
  it("birikim: katkı uygular, hedefi aşmaz", () => {
    const d = { hedefler: [{ id: 1, tip: "birikim", hedefTutar: 10000, mevcutTutar: 0, aylikKatki: 500, otomatikKatki: true, sonKatki: "2020-01" }] };
    const r = hedefKatkilariUret(d);
    expect(r.degisti).toBe(true);
    expect(r.data.hedefler[0].mevcutTutar).toBeGreaterThan(0);
    expect(r.data.hedefler[0].mevcutTutar).toBeLessThanOrEqual(10000);
  });
  it("borç: mevcut azalır, 0'ın altına inmez", () => {
    const d = { hedefler: [{ id: 1, tip: "borc", hedefTutar: 10000, mevcutTutar: 3000, aylikKatki: 500, otomatikKatki: true, sonKatki: "2020-01" }] };
    const r = hedefKatkilariUret(d);
    expect(r.data.hedefler[0].mevcutTutar).toBeGreaterThanOrEqual(0);
    expect(r.data.hedefler[0].mevcutTutar).toBeLessThan(3000);
  });
});

describe("yaklasanOdemeler", () => {
  it("aralıktaki ödemeleri güne göre sıralar", () => {
    const findata = {
      abonelikler: [{ baslik: "Netflix", miktar: 100, tarih: "2026-06-25" }],
      sablonlar: [{ tip: "gider", baslik: "Kira", miktar: 5000, frekans: "aylık", sonUretilen: "2026-05-22", baslangic: "2026-05-22" }],
    };
    const r = yaklasanOdemeler(findata, "2026-06-20", 7);
    expect(r.length).toBe(2);
    expect(r[0].ad).toBe("Kira");
    expect(r[0].gun).toBe(2);
    expect(r[1].gun).toBe(5);
  });
  it("aralık dışındakileri elemeler", () => {
    const r = yaklasanOdemeler({ abonelikler: [{ baslik: "X", miktar: 1, tarih: "2026-06-25" }], sablonlar: [] }, "2026-06-01", 3);
    expect(r.length).toBe(0);
  });
});

describe("donemAraligi / donemde / donemFiltre", () => {
  it("buAy ayın ilk ve son gününü döner", () => {
    const a = donemAraligi("buAy", "2026-06-24");
    expect(a).toEqual({ start: "2026-06-01", end: "2026-06-30" });
  });
  it("gecenAy bir önceki ayı döner", () => {
    expect(donemAraligi("gecenAy", "2026-06-24")).toEqual({ start: "2026-05-01", end: "2026-05-31" });
  });
  it("yıl başında gecenAy önceki yılın aralığına geçer", () => {
    expect(donemAraligi("gecenAy", "2026-01-10")).toEqual({ start: "2025-12-01", end: "2025-12-31" });
  });
  it("buYil tüm yılı, tum ise null döner", () => {
    expect(donemAraligi("buYil", "2026-06-24")).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    expect(donemAraligi("tum", "2026-06-24")).toBe(null);
  });
  it("donemde aralığı kapsar (sınırlar dahil)", () => {
    const a = donemAraligi("buAy", "2026-06-24");
    expect(donemde("2026-06-01", a)).toBe(true);
    expect(donemde("2026-06-30", a)).toBe(true);
    expect(donemde("2026-05-31", a)).toBe(false);
    expect(donemde("2026-07-01", a)).toBe(false);
    expect(donemde("2026-05-31", null)).toBe(true);
  });
  it("donemFiltre gelir/gideri döneme göre eler, tum ise dokunmaz", () => {
    const fd = {
      gelirler: [{ tarih: "2026-06-10", miktar: 100 }, { tarih: "2026-05-10", miktar: 50 }],
      giderler: [{ tarih: "2026-06-20", miktar: 30 }, { tarih: "2026-04-01", miktar: 20 }],
    };
    const r = donemFiltre(fd, "buAy", "2026-06-24");
    expect(r.gelirler.length).toBe(1);
    expect(r.giderler.length).toBe(1);
    expect(donemFiltre(fd, "tum", "2026-06-24")).toBe(fd);
  });
});

describe("reelDeger", () => {
  it("enflasyon 0 veya tarih yoksa tutarı aynen döndürür", () => {
    expect(reelDeger(1000, "2025-08-07", 0, "2026-08-07")).toBe(1000);
    expect(reelDeger(1000, null, 50, "2026-08-07")).toBe(1000);
  });
  it("gelecek/bugün tarihte düzeltme yapmaz", () => {
    expect(reelDeger(1000, "2026-08-07", 50, "2026-08-07")).toBe(1000);
    expect(reelDeger(1000, "2027-01-01", 50, "2026-08-07")).toBe(1000);
  });
  it("bir yıl önce %50 enflasyonda ~1.5 katına şişer", () => {
    const r = reelDeger(1000, "2025-08-07", 50, "2026-08-07");
    expect(r).toBeGreaterThan(1480);
    expect(r).toBeLessThan(1510);
  });
  it("eski tarih daha yüksek bugünkü karşılık verir (monotonluk)", () => {
    const yakin = reelDeger(1000, "2025-08-07", 40, "2026-08-07");
    const uzak = reelDeger(1000, "2023-08-07", 40, "2026-08-07");
    expect(uzak).toBeGreaterThan(yakin);
  });
});

describe("panelBrifing", () => {
  it("boş veride 'ilk işlem' manşetini kurar, kırılmaz", () => {
    const r = panelBrifing({}, "2026-08-15");
    expect(r.manset.vurgu).toContain("ilk işlemini");
    expect(Array.isArray(r.destek)).toBe(true);
  });
  it("ay-üstü gider artışını manşete taşır", () => {
    const fd = {
      giderler: [
        { tarih: "2026-08-05", miktar: 1200, kategori: "Market" },
        { tarih: "2026-07-05", miktar: 1000, kategori: "Market" },
      ],
    };
    const r = panelBrifing(fd, "2026-08-15");
    expect(r.manset.vurgu).toBe("%20 arttı");
    expect(r.manset.sonrasi).toContain("Market");
  });
  it("gider yoksa ama gelir varsa tasarruf oranını gösterir", () => {
    const fd = { gelirler: [{ tarih: "2026-08-03", miktar: 10000, kategori: "Maaş" }] };
    const r = panelBrifing(fd, "2026-08-15");
    expect(r.manset.vurgu).toContain("%100");
    expect(r.destek.some((s) => s.etiket === "Tasarruf oranı")).toBe(true);
  });
});

describe("netGecmisGuncelle", () => {
  it("boş geçmişe bugünün noktasını ekler", () => {
    const r = netGecmisGuncelle([], 1000, "2026-08-07");
    expect(r).toEqual([{ tarih: "2026-08-07", deger: 1000 }]);
  });
  it("farklı günde yeni nokta ekler", () => {
    const r = netGecmisGuncelle([{ tarih: "2026-08-06", deger: 900 }], 1000, "2026-08-07");
    expect(r.length).toBe(2);
    expect(r[1]).toEqual({ tarih: "2026-08-07", deger: 1000 });
  });
  it("aynı gün değişmemişse aynı diziyi (no-op) döndürür", () => {
    const ng = [{ tarih: "2026-08-07", deger: 1000 }];
    expect(netGecmisGuncelle(ng, 1000.4, "2026-08-07")).toBe(ng);
  });
  it("aynı gün değişmişse son noktayı günceller", () => {
    const r = netGecmisGuncelle([{ tarih: "2026-08-07", deger: 1000 }], 1500, "2026-08-07");
    expect(r).toEqual([{ tarih: "2026-08-07", deger: 1500 }]);
  });
  it("en çok 60 kayıt tutar", () => {
    const uzun = Array.from({ length: 60 }, (_, i) => ({ tarih: `d${i}`, deger: i }));
    const r = netGecmisGuncelle(uzun, 999, "2026-08-07");
    expect(r.length).toBe(60);
    expect(r[r.length - 1]).toEqual({ tarih: "2026-08-07", deger: 999 });
  });
});

describe("kartOdemeler", () => {
  const findata = { hesaplar: [
    { id: 1, ad: "Axess ••7189", tip: "kart", bakiye: 5000, asgari: 750, sonOdeme: "2026-08-15" },
    { id: 2, ad: "Enpara ••0457", tip: "banka", bakiye: 1000 },
    { id: 3, ad: "Uzak kart", tip: "kart", bakiye: 200, sonOdeme: "2026-12-01" },
  ]};
  it("aralıktaki kart son ödemesini asgari tutarıyla döndürür", () => {
    const r = kartOdemeler(findata, "2026-08-07", 15);
    expect(r.length).toBe(1);
    expect(r[0].tip).toBe("Kart");
    expect(r[0].gun).toBe(8);
    expect(r[0].miktar).toBe(750); // asgari öncelikli
    expect(r[0].ad).toContain("Axess");
  });
  it("banka hesabını ve sonOdeme'si olmayanı katmaz, uzak tarihi eler", () => {
    expect(kartOdemeler(findata, "2026-08-07", 15).some((x) => x.ad.includes("Uzak"))).toBe(false);
    expect(kartOdemeler({ hesaplar: [{ tip: "banka", bakiye: 5 }] }, "2026-08-07").length).toBe(0);
  });
});

describe("butceOnerisi", () => {
  const findata = { giderler: [
    { baslik: "Market A", miktar: 3000, kategori: "Market", tarih: "2026-08-05" },
    { baslik: "Market B", miktar: 3000, kategori: "Market", tarih: "2026-07-05" },
    { baslik: "Market C", miktar: 3000, kategori: "Market", tarih: "2026-06-05" },
    { baslik: "N11 (taksit 2/9)", miktar: 2833, kategori: "Teknoloji", tarih: "2026-08-01" }, // taksit → hariç
    { baslik: "Eski", miktar: 9999, kategori: "Konut", tarih: "2026-01-01" }, // aralık dışı
  ]};
  const o = butceOnerisi(findata, "2026-08-15", 3);
  it("son 3 ay ortalamasından %10 pay + 100'e yuvarlama önerir", () => {
    expect(o.Market).toBe(3300); // 3000 ort × 1.1 = 3300
  });
  it("taksitleri ve aralık dışını önermez", () => {
    expect(o.Teknoloji).toBeUndefined();
    expect(o.Konut).toBeUndefined();
  });
});
