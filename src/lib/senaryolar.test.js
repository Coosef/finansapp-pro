import { describe, it, expect } from "vitest";
import { ekstreUygula } from "./ekstre.js";
import { donemHesap, kategoriDagilim } from "./hesapla.js";
import { maasGeliriUret, maasEslestirUygula, maasCiftGuard } from "./maas.js";
import { haneYenidenSinifla } from "./kisi.js";
import { mevcutParmakSeti, hesapAnahtar, batchDedup } from "./parmakizi.js";

// ============================================================
// E2E senaryoları (headless) — gerçek fonksiyon zinciriyle uçtan uca akış.
// Tarayıcı/login/production yok; import → dedup → sınıflama → turEtkisi → KPI
// zincirinin finansal doğruluğunu regresyona karşı kilitler.
// Dönem "tum" → tarih penceresinden bağımsız, deterministik.
// ============================================================
const BUGUN = "2026-08-12";
const bosData = () => ({ gelirler: [], giderler: [], abonelikler: [], hesaplar: [], kategoriler: { gelir: [], gider: [] } });

describe("E2E-A — normal import → işlem → dashboard → drill-down", () => {
  it("ekstre kayıtları eklenir, KPI ve kategori drill-down tutarlı", () => {
    const kayitlar = [
      { tip: "gelir", baslik: "Maaş", miktar: 50000, kategori: "Maaş", tarih: "2026-08-01", kaynak: "ekstre" },
      { tip: "gider", baslik: "Migros", miktar: 1200, kategori: "Market", tarih: "2026-08-03", kaynak: "ekstre" },
      { tip: "gider", baslik: "Benzin", miktar: 800, kategori: "Ulaşım", tarih: "2026-08-05", kaynak: "ekstre" },
      { tip: "gider", baslik: "Migros 2", miktar: 300, kategori: "Market", tarih: "2026-08-07", kaynak: "ekstre" },
    ];
    const { data } = ekstreUygula(bosData(), {}, kayitlar);
    expect(data.gelirler.length).toBe(1);
    expect(data.giderler.length).toBe(3);

    const ozet = donemHesap(data, "tum", BUGUN);
    expect(ozet.gelir).toBe(50000);
    expect(ozet.giderToplam).toBe(2300);
    expect(ozet.net).toBe(47700);

    // Drill-down: kategori dağılımı (Market = 1200 + 300)
    const dagilim = kategoriDagilim(data.giderler);
    expect(dagilim[0].kategori).toBe("Market");
    expect(dagilim.find((x) => x.kategori === "Market").toplam).toBe(1500);
    expect(dagilim.find((x) => x.kategori === "Ulaşım").toplam).toBe(800);
  });
});

describe("E2E-B — belirsiz EFT → needs_review → KPI dışı → Gider seç → KPI değişir", () => {
  it("needs_review gider KPI'a girmez; Gider sınıflanınca girer", () => {
    let data = {
      ...bosData(),
      giderler: [
        { id: "g1", baslik: "Migros", miktar: 1000, kategori: "Market", tarih: "2026-08-03" },
        { id: "eft", baslik: "Giden EFT ADAY", miktar: 5000, kategori: "Diğer", tarih: "2026-08-04", tur: "needs_review" },
      ],
    };
    expect(donemHesap(data, "tum", BUGUN).giderToplam).toBe(1000); // EFT hariç

    // Kullanıcı "Gider" seçer (ham kayıt korunur, yalnız tur değişir)
    data = { ...data, giderler: data.giderler.map((g) => (g.id === "eft" ? { ...g, tur: "gider" } : g)) };
    const o = donemHesap(data, "tum", BUGUN);
    expect(o.giderToplam).toBe(6000); // artık dahil
    expect(data.giderler.find((g) => g.id === "eft").baslik).toBe("Giden EFT ADAY"); // ham bozulmadı
  });
});

describe("E2E-C — gider + tam/kısmi iade → net gider doğru", () => {
  it("kısmi iade gideri azaltır, tam iade sıfırlar (iade gelir sayılmaz)", () => {
    const kismi = {
      ...bosData(),
      gelirler: [{ id: "i1", baslik: "İade", miktar: 300, tarih: "2026-08-05", tur: "iade" }],
      giderler: [{ id: "g1", baslik: "Ayakkabı", miktar: 1000, kategori: "Giyim", tarih: "2026-08-01" }],
    };
    let o = donemHesap(kismi, "tum", BUGUN);
    expect(o.gelir).toBe(0); // iade income değil
    expect(o.giderToplam).toBe(700); // 1000 − 300
    expect(o.net).toBe(-700);

    const tam = { ...kismi, gelirler: [{ ...kismi.gelirler[0], miktar: 1000 }] };
    o = donemHesap(tam, "tum", BUGUN);
    expect(o.giderToplam).toBe(0);
    expect(o.net).toBe(0);
  });
});

describe("E2E-D — maaş modeli + ekstre maaşı → tek ekonomik gelir; elle çift → guard", () => {
  it("ekstre maaşı çift saymaz; elle girilen ikinci maaş needs_review'e alınır", () => {
    const base = {
      ...bosData(),
      maaslar: [{ id: "m1", ad: "Maaş", tutar: 50000, odemeGunu: 1, baslangic: "2026-08", hesapId: "h1", aktif: true }],
      maasAyarlari: [],
    };
    // Maaş geliri üret (beklenen 50000)
    let data = maasGeliriUret(base, BUGUN).data;
    expect(data.gelirler.filter((g) => g.kaynak === "maas").length).toBe(1);

    // Ekstre maaşı 52000 gerçekleşen → yeni gelir EKLEMEZ, o ayı günceller
    data = maasEslestirUygula(data, "m1", "2026-08", 52000, "ekstre");
    data = maasGeliriUret(data, BUGUN).data; // gerçekleşeni yansıt
    const maasGelirleri = data.gelirler.filter((g) => g.kaynak === "maas");
    expect(maasGelirleri.length).toBe(1); // hâlâ tek (çift değil)
    expect(maasGelirleri[0].miktar).toBe(52000);

    // Elle ikinci "Maaş" gelir → çift-sayım guard needs_review'e alır
    data = { ...data, gelirler: [...data.gelirler, { id: "man1", baslik: "Maaş Ağustos", miktar: 51000, kategori: "Maaş", tarih: "2026-08-02", kaynak: "elle" }] };
    const guard = maasCiftGuard(data);
    expect(guard.degisti).toBe(true);
    expect(guard.data.gelirler.find((g) => g.id === "man1").tur).toBe("needs_review");

    // KPI: maaş tek kez sayılır (elle olan hariç)
    expect(donemHesap(guard.data, "tum", BUGUN).gelir).toBe(52000);
  });
});

describe("E2E-E — tekrar/örtüşen import → işlem çoğalmaz", () => {
  it("aynı ekstre ikinci kez içe aktarılınca kesin tekrarlar uygulanmaz", () => {
    const base = { ...bosData(), hesaplar: [{ id: "h1", ad: "Banka", son4: "1234" }] };
    const kayitlar = [
      { tip: "gider", baslik: "Migros", miktar: 1200, kategori: "Market", tarih: "2026-08-03" },
      { tip: "gider", baslik: "Benzin", miktar: 800, kategori: "Ulaşım", tarih: "2026-08-05" },
    ];
    const data = ekstreUygula(base, { son4: "1234" }, kayitlar).data;
    expect(data.giderler.length).toBe(2);

    // İkinci import: aynı kayıtlar → batchDedup hepsini kesin tekrar işaretler
    const set = mevcutParmakSeti(data);
    const hAnahtar = hesapAnahtar(data, { son4: "1234" });
    const ikinci = batchDedup(set, [{ hesapAnahtar: hAnahtar, kayitlar: kayitlar.map((k) => ({ ...k, _sec: true })) }])[0];
    expect(ikinci.every((k) => k._kesinTekrar)).toBe(true);

    const uygulanacak = ikinci.filter((k) => k._sec && !k._kesinTekrar);
    expect(uygulanacak.length).toBe(0);
    const data2 = ekstreUygula(data, { son4: "1234" }, uygulanacak).data;
    expect(data2.giderler.length).toBe(2); // çoğalma yok
  });
});

describe("E2E-F — hane EFT → needs_review → Hediye (gider KPI) → Hane transferi (nötr)", () => {
  it("sınıflama KPI'ı değiştirir; ham kayıt hiç bozulmaz", () => {
    let data = {
      ...bosData(),
      kisiler: [{ id: "k1", ad: "Kız arkadaşım", hane: true, anahtarlar: ["helin"] }],
      giderler: [{ id: "g1", baslik: "Giden EFT Helin", miktar: 9000, kategori: "Gönderim", tarih: "2026-08-05" }],
    };

    // Hane yeniden sınıfla → needs_review etiketi (taşınmaz, ham korunur)
    const r = haneYenidenSinifla(data);
    expect(r.tasindi).toBe(1);
    data = r.data;
    const g = data.giderler[0];
    expect(g.tur).toBe("needs_review");
    expect(g.kisiId).toBe("k1");
    expect(g.miktar).toBe(9000);
    expect(donemHesap(data, "tum", BUGUN).giderToplam).toBe(0); // needs_review KPI dışı

    // Kullanıcı "Hediye (verdiğin)" seçer → ham yön gider → KPI gideri artar
    data = { ...data, giderler: data.giderler.map((x) => (x.id === "g1" ? { ...x, tur: "gift" } : x)) };
    expect(donemHesap(data, "tum", BUGUN).giderToplam).toBe(9000);

    // Fikir değişir → "Hane transferi" → nötr
    data = { ...data, giderler: data.giderler.map((x) => (x.id === "g1" ? { ...x, tur: "household_transfer" } : x)) };
    expect(donemHesap(data, "tum", BUGUN).giderToplam).toBe(0);

    // Ham işlem tüm sınıflamalar boyunca hiç bozulmadı
    expect(data.giderler[0].baslik).toBe("Giden EFT Helin");
    expect(data.giderler[0].miktar).toBe(9000);
    expect(data.giderler[0].tarih).toBe("2026-08-05");
  });
});
