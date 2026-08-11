import { describe, it, expect } from "vitest";
import { bosVeri } from "./finance.js";
import { maasGeliriUret, maasEslestirUygula, maasDurumu } from "./maas.js";
import { donemHesap } from "./hesapla.js";

// Uçtan uca: kullanıcının tarif ettiği senaryo.
// Baz 80.000; Ağustos bankaya 95.000 yattı → 80.000 baz + 15.000 ek ödeme.
// Eylül tekrar 80.000. Manuel + ekstre AYNI maaşı çift saymamalı.

describe("Entegrasyon — maaş + ekstre + dashboard tutarlılığı", () => {
  function kurulum() {
    const d = {
      ...bosVeri(),
      maaslar: [{ id: "m1", ad: "Ana Maaş", tutar: 80000, hesapId: "h1", odemeGunu: 5, kategori: "Maaş", baslangic: "2026-06", aktif: true }],
      hesaplar: [{ id: "h1", ad: "Maaş Hesabı", tip: "banka", bakiye: 0 }],
    };
    return maasGeliriUret(d, "2026-08-11").data; // Haz/Tem/Ağu gelir satırları
  }

  it("baz maaş her ay tek gelir satırı üretir (Haz/Tem/Ağu)", () => {
    const d = kurulum();
    const maasGelir = d.gelirler.filter((g) => g.kaynak === "maas");
    expect(maasGelir.length).toBe(3);
    expect(maasGelir.every((g) => g.miktar === 80000)).toBe(true);
  });

  it("ekstre 95.000 → Ağustos 80k+15k, çift gelir YOK", () => {
    let d = kurulum();
    const oncekiSayi = d.gelirler.length;
    // Ekstre içe aktarımının yaptığı: maaş hareketini tanımlı maaşla eşle
    d = maasEslestirUygula(d, "m1", "2026-08", 95000, "ekstre");

    // Gelir satırı sayısı ARTMADI (çift-sayım yok)
    expect(d.gelirler.length).toBe(oncekiSayi);
    const agu = d.gelirler.find((g) => g.kaynak === "maas" && g.ay === "2026-08");
    expect(agu.miktar).toBe(95000);

    // Kırılım: 80k baz + 15k ek ödeme; baz maaş değişmedi
    const durum = maasDurumu(d, "m1", "2026-08");
    expect(durum.kalemler).toEqual([{ etiket: "Baz maaş", tutar: 80000 }, { etiket: "Ek ödeme", tutar: 15000 }]);
    expect(d.maaslar[0].tutar).toBe(80000);

    // Dashboard Ağustos geliri tam olarak 95.000 (bir kez)
    const oz = donemHesap(d, "buAy", "2026-08-11");
    const agustosMaas = oz.gelirler.filter((g) => g.kaynak === "maas");
    expect(agustosMaas.length).toBe(1);
    expect(oz.gelir).toBe(95000);
  });

  it("Eylül tekrar baz 80.000 (ek ödeme taşınmaz)", () => {
    let d = kurulum();
    d = maasEslestirUygula(d, "m1", "2026-08", 95000, "ekstre");
    d = maasGeliriUret(d, "2026-09-11").data; // Eylül satırını üret
    const eyl = d.gelirler.find((g) => g.kaynak === "maas" && g.ay === "2026-09");
    expect(eyl.miktar).toBe(80000);
    expect(maasDurumu(d, "m1", "2026-09").beklenen).toBe(80000);
  });

  it("aynı ekstre iki kez içe aktarılırsa maaş yine tek kalır (idempotent)", () => {
    let d = kurulum();
    d = maasEslestirUygula(d, "m1", "2026-08", 95000, "ekstre");
    d = maasEslestirUygula(d, "m1", "2026-08", 95000, "ekstre"); // tekrar
    const agu = d.gelirler.filter((g) => g.kaynak === "maas" && g.ay === "2026-08");
    expect(agu.length).toBe(1);
    expect(donemHesap(d, "buAy", "2026-08-11").gelir).toBe(95000);
  });

  it("düşük gerçekleşen (78.500) baz maaşı bozmaz, sadece o ayı override eder", () => {
    let d = kurulum();
    d = maasEslestirUygula(d, "m1", "2026-08", 78500, "ekstre");
    expect(d.maaslar[0].tutar).toBe(80000); // baz sabit
    expect(maasDurumu(d, "m1", "2026-08").efektif).toBe(78500);
    expect(maasDurumu(d, "m1", "2026-09").beklenen).toBe(80000); // sonraki ay baz
  });
});
