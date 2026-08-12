import { describe, it, expect } from "vitest";
import {
  beklenenMaas, maasAyarHesapla, maasDurumu, maasGeliriUret,
  maasEslestirUygula, maasAdaylari, maasEslestirmeAdayi, maasCiftGuard,
} from "./maas.js";
import { donemHesap } from "./hesapla.js";

// Maaş modeli: base salary KALICI; aylık ek ödeme/override yalnız o ay; ekstre
// maaşı çift-sayım yapmadan eşleşir.

const maas = () => ({ id: "m1", ad: "Ana Maaş", tutar: 80000, hesapId: "h1", odemeGunu: 5, kategori: "Maaş", baslangic: "2026-06", aktif: true });

describe("beklenenMaas — o ayın beklenen tutarı", () => {
  it("ayarsız ay → baz maaş", () => {
    expect(beklenenMaas(maas(), null)).toBe(80000);
  });
  it("ek ödeme baz üstüne eklenir", () => {
    expect(beklenenMaas(maas(), { ekOdeme: 15000 })).toBe(95000);
  });
  it("override o ayın bazını değiştirir (ek ödeme override üstüne biner)", () => {
    expect(beklenenMaas(maas(), { override: 78500, ekOdeme: 0 })).toBe(78500);
    expect(beklenenMaas(maas(), { override: 70000, ekOdeme: 5000 })).toBe(75000);
  });
});

describe("maasAyarHesapla — gerçekleşen tutardan ayar üret", () => {
  it("gerçekleşen baz üstündeyse fark ek ödeme olur (baz değişmez)", () => {
    expect(maasAyarHesapla(80000, 95000)).toEqual({ override: null, ekOdeme: 15000, gerceklesen: 95000 });
  });
  it("gerçekleşen baz altındaysa o ay override olur (baz değişmez)", () => {
    expect(maasAyarHesapla(80000, 78500)).toEqual({ override: 78500, ekOdeme: 0, gerceklesen: 78500 });
  });
  it("gerçekleşen baza eşitse ek ödeme 0", () => {
    expect(maasAyarHesapla(80000, 80000)).toEqual({ override: null, ekOdeme: 0, gerceklesen: 80000 });
  });
});

describe("maasDurumu — kırılım (drill-down)", () => {
  it("95k gerçekleşen → 80k baz + 15k ek ödeme kırılımı", () => {
    const d = { maaslar: [maas()], maasAyarlari: [{ maasId: "m1", ay: "2026-08", override: null, ekOdeme: 15000, ekEtiket: "Prim", gerceklesen: 95000 }] };
    const s = maasDurumu(d, "m1", "2026-08");
    expect(s.geldiMi).toBe(true);
    expect(s.efektif).toBe(95000);
    expect(s.kalemler).toEqual([
      { etiket: "Baz maaş", tutar: 80000 },
      { etiket: "Prim", tutar: 15000 },
    ]);
  });
  it("ay bilinmiyorsa beklenen = baz, geldiMi false", () => {
    const d = { maaslar: [maas()], maasAyarlari: [] };
    const s = maasDurumu(d, "m1", "2026-09");
    expect(s.geldiMi).toBe(false);
    expect(s.beklenen).toBe(80000);
    expect(s.efektif).toBe(80000);
  });
  it("düşük gerçekleşen → tek 'bu ay maaş' kalemi", () => {
    const d = { maaslar: [maas()], maasAyarlari: [{ maasId: "m1", ay: "2026-09", override: 78500, ekOdeme: 0, gerceklesen: 78500 }] };
    const s = maasDurumu(d, "m1", "2026-09");
    expect(s.kalemler).toEqual([{ etiket: "Bu ay maaş", tutar: 78500 }]);
  });
});

describe("maasGeliriUret — aylık maaş gelir satırı türet", () => {
  it("baslangıçtan bugüne, ödeme günü geçmiş aylar için gelir üretir", () => {
    const d = { maaslar: [maas()], maasAyarlari: [], gelirler: [], giderler: [], abonelikler: [], sablonlar: [] };
    const { data, degisti } = maasGeliriUret(d, "2026-08-11");
    expect(degisti).toBe(true);
    const maasGelir = data.gelirler.filter((g) => g.kaynak === "maas");
    // Haziran, Temmuz, Ağustos (5'i <= 11) → 3 ay
    expect(maasGelir.map((g) => g.ay).sort()).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(maasGelir.every((g) => g.miktar === 80000 && g.kategori === "Maaş")).toBe(true);
  });
  it("ödeme günü henüz gelmemiş ay için gelir üretmez", () => {
    const d = { maaslar: [maas()], maasAyarlari: [], gelirler: [], sablonlar: [] };
    const { data } = maasGeliriUret(d, "2026-08-03"); // ayın 3'ü, ödeme günü 5
    expect(data.gelirler.some((g) => g.ay === "2026-08")).toBe(false);
    expect(data.gelirler.some((g) => g.ay === "2026-07")).toBe(true);
  });
  it("aynı ay iki kez üretmez (idempotent)", () => {
    const d = { maaslar: [maas()], maasAyarlari: [], gelirler: [], sablonlar: [] };
    const bir = maasGeliriUret(d, "2026-08-11").data;
    const iki = maasGeliriUret(bir, "2026-08-11").data;
    expect(iki.gelirler.filter((g) => g.kaynak === "maas").length).toBe(3);
    expect(maasGeliriUret(bir, "2026-08-11").degisti).toBe(false);
  });
  it("ek ödeme tanımlıysa o ayın gelir tutarını yansıtır", () => {
    const d = { maaslar: [maas()], maasAyarlari: [{ maasId: "m1", ay: "2026-08", ekOdeme: 15000, gerceklesen: null }], gelirler: [], sablonlar: [] };
    const { data } = maasGeliriUret(d, "2026-08-11");
    const ag = data.gelirler.find((g) => g.ay === "2026-08");
    expect(ag.miktar).toBe(95000);
    expect(ag.beklenenMi).toBe(true); // henüz gerçekleşmedi
  });
});

describe("maasEslestirUygula — ekstre maaşını çift-saymadan eşle", () => {
  it("ekstre maaşı yeni gelir EKLEMEZ, o ayın maaş gelirini günceller", () => {
    let d = { maaslar: [maas()], maasAyarlari: [], gelirler: [], sablonlar: [] };
    d = maasGeliriUret(d, "2026-08-11").data; // Ağustos beklenen 80000
    const oncekiSayi = d.gelirler.length;
    d = maasEslestirUygula(d, "m1", "2026-08", 95000, "ekstre");
    // Gelir sayısı ARTMADI (çift-sayım yok)
    expect(d.gelirler.length).toBe(oncekiSayi);
    const ag = d.gelirler.find((g) => g.ay === "2026-08");
    expect(ag.miktar).toBe(95000);
    expect(ag.beklenenMi).toBe(false); // artık gerçekleşti
    // Ayar kaydı: 15k ek ödeme, baz değişmedi
    const ayar = d.maasAyarlari.find((a) => a.ay === "2026-08");
    expect(ayar.ekOdeme).toBe(15000);
    expect(ayar.gerceklesen).toBe(95000);
    // Baz maaş hâlâ 80000
    expect(d.maaslar[0].tutar).toBe(80000);
  });
  it("eşleştirme sonraki ayı etkilemez (baz üzerinden devam)", () => {
    let d = { maaslar: [maas()], maasAyarlari: [], gelirler: [], sablonlar: [] };
    d = maasGeliriUret(d, "2026-08-11").data;
    d = maasEslestirUygula(d, "m1", "2026-08", 95000, "ekstre");
    // Eylül için beklenen hâlâ 80000
    expect(maasDurumu(d, "m1", "2026-09").beklenen).toBe(80000);
  });
});

describe("maasCiftGuard — maaş modeli + elle gelir çift-sayım (item 3)", () => {
  it("aynı ay benzer tutarlı ELLE maaş → needs_review; income 80k (160k değil)", () => {
    let d = { maaslar: [maas()], maasAyarlari: [], gelirler: [{ id: "man", baslik: "Maaş", miktar: 80000, kategori: "Maaş", tarih: "2026-08-05", kaynak: "manuel" }], sablonlar: [] };
    d = maasGeliriUret(d, "2026-08-11").data;
    const r = maasCiftGuard(d);
    expect(r.degisti).toBe(true);
    expect(r.data.gelirler.find((g) => g.id === "man").tur).toBe("needs_review");
    expect(donemHesap(r.data, "buAy", "2026-08-11").gelir).toBe(80000);
  });
  it("gerçek prim (uzak tutar) flag'lenmez", () => {
    let d = { maaslar: [maas()], maasAyarlari: [], gelirler: [{ id: "prim", baslik: "Maaş farkı", miktar: 15000, kategori: "Maaş", tarih: "2026-08-20", kaynak: "manuel" }], sablonlar: [] };
    d = maasGeliriUret(d, "2026-08-11").data;
    expect(maasCiftGuard(d).data.gelirler.find((g) => g.id === "prim").tur).toBeUndefined();
  });
  it("idempotent — ikinci çağrıda değişiklik yok", () => {
    let d = { maaslar: [maas()], maasAyarlari: [], gelirler: [{ id: "man", baslik: "Maaş", miktar: 80000, kategori: "Maaş", tarih: "2026-08-05", kaynak: "manuel" }], sablonlar: [] };
    d = maasGeliriUret(d, "2026-08-11").data;
    const bir = maasCiftGuard(d).data;
    expect(maasCiftGuard(bir).degisti).toBe(false);
  });
});

describe("maasAdaylari — mevcut maaş verisinden aday çıkar (migrasyon)", () => {
  it("maaş sablonundan aday üretir (hesap = son Maaş gelirinden)", () => {
    const d = {
      sablonlar: [{ id: "s1", tip: "gelir", baslik: "Maaş", miktar: 80000, kategori: "Maaş", frekans: "aylık", baslangic: "2026-01-05", sonUretilen: "2026-07-05" }],
      gelirler: [{ baslik: "Maaş", miktar: 80000, kategori: "Maaş", tarih: "2026-07-05", hesapId: "h1" }],
    };
    const adaylar = maasAdaylari(d);
    expect(adaylar.length).toBe(1);
    expect(adaylar[0]).toMatchObject({ tutar: 80000, hesapId: "h1", odemeGunu: 5 });
  });
  it("maaş verisi yoksa boş döner", () => {
    expect(maasAdaylari({ sablonlar: [], gelirler: [] })).toEqual([]);
  });
});

describe("maasEslestirmeAdayi — ekstre gelirini tanımlı maaşla eşle", () => {
  const d = () => ({ maaslar: [maas()], maasAyarlari: [] });
  it("maaş kategorili ekstre gelirini o ayın maaşıyla eşler", () => {
    const aday = maasEslestirmeAdayi(d(), { tip: "gelir", baslik: "XYZ ŞTİ MAAŞ ÖDEMESİ", miktar: 95000, kategori: "Maaş", tarih: "2026-08-05" });
    expect(aday).toEqual({ maasId: "m1", ay: "2026-08" });
  });
  it("maaş sinyali yoksa null (normal gelir olarak kalır)", () => {
    expect(maasEslestirmeAdayi(d(), { tip: "gelir", baslik: "Serbest iş", miktar: 5000, kategori: "Serbest", tarih: "2026-08-05" })).toBe(null);
  });
  it("tanımlı maaş yoksa null", () => {
    expect(maasEslestirmeAdayi({ maaslar: [] }, { tip: "gelir", baslik: "Maaş", miktar: 80000, kategori: "Maaş", tarih: "2026-08-05" })).toBe(null);
  });
  it("gider satırı için null", () => {
    expect(maasEslestirmeAdayi(d(), { tip: "gider", baslik: "Maaş avansı iadesi", miktar: 100, kategori: "Diğer", tarih: "2026-08-05" })).toBe(null);
  });
  it("birden çok maaş varsa beklenen tutara en yakını seçer", () => {
    const dd = { maaslar: [{ ...maas(), id: "m1", tutar: 80000 }, { ...maas(), id: "m2", ad: "Eş maaş", tutar: 30000 }], maasAyarlari: [] };
    const aday = maasEslestirmeAdayi(dd, { tip: "gelir", baslik: "Maaş", miktar: 31000, kategori: "Maaş", tarih: "2026-08-05" });
    expect(aday.maasId).toBe("m2");
  });
});
