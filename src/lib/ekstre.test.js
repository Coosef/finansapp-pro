import { describe, it, expect } from "vitest";
import { ekstreParse, ibanBanka, tarihCevir, kategoriTahmin, aboneTespit, yenidenSiniflandir, ekstreDogrula, hesapBul, ekstreUygula } from "./ekstre.js";

const bosData = () => ({ gelirler: [], giderler: [], abonelikler: [], hesaplar: [], transferAkis: [], kategoriler: { gider: [], gelir: [] } });

describe("ekstreDogrula — bakiye zinciri", () => {
  it("tutarlı zincir + doğru adet → eksiksiz", () => {
    const d = ekstreDogrula({ beklenenSayisi: 2 }, [
      { tarih: "2026-01-15", miktar: 100, bakiye: 1100 },
      { tarih: "2026-01-14", miktar: -50, bakiye: 1000 },
    ]);
    expect(d.bakiyeTutarli).toBe(true);
    expect(d.adetTamam).toBe(true);
    expect(d.tamam).toBe(true);
  });
  it("kırık zinciri yakalar (atlanmış işlem)", () => {
    const d = ekstreDogrula({}, [
      { tarih: "2026-01-15", miktar: 100, bakiye: 1100 },
      { tarih: "2026-01-14", miktar: -50, bakiye: 1010 }, // 1100-1010=90 ≠ 100
    ]);
    expect(d.bakiyeTutarli).toBe(false);
    expect(d.tamam).toBe(false);
  });
  it("hiç işlem okunamadıysa sessizce 'tamam' demez", () => {
    // Axess gibi bozuk-font PDF'lerde 0 işlem çıkar; bunu başarı sayma.
    const d = ekstreDogrula({}, []);
    expect(d.tamam).toBe(false);
    expect(d.islemSayisi).toBe(0);
    expect(d.uyarilar.length).toBeGreaterThan(0);
  });
});

describe("siniflandir (ekstreParse üzerinden) — transfer/EFT düzeltmeleri", () => {
  const hesapRows = (aciklama, tutar) => [
    ["Ad Soyad", "Ahmet Yılmaz"],
    ["Tarih", "Açıklama", "Tutar", "Bakiye"],
    ["05.08.2026", aciklama, tutar, "10.000,00"],
  ];
  it("EFT/transfer ile kredi kartı ödemesi → odeme (gider değil)", () => {
    const { islemler } = ekstreParse(hesapRows("Giden Transfer Kredi kartı EFT", "-5.000,00"));
    expect(islemler[0].tip).toBe("odeme");
  });
  it("kira amaçlı giden transfer → gider + Kira kategorisi (Gönderim değil)", () => {
    const { islemler } = ekstreParse(hesapRows("Giden Transfer Ev kirası", "-8.000,00"));
    expect(islemler[0].tip).toBe("gider");
    expect(islemler[0].kategori).toBe("Kira");
  });
});

describe("hesapBul — farklı son4 birleşmez", () => {
  const data = { hesaplar: [{ id: "a", ad: "Enpara ••8551", tip: "banka", son4: "8551" }] };
  it("aynı banka farklı son4 → yeni hesap", () => {
    const hc = hesapBul(data, { ekstreTipi: "hesap", banka: "Enpara", son4: "0457" });
    expect(hc.hedef).toBeFalsy();
    expect(hc.yeni).toBeTruthy();
    expect(hc.ad).toBe("Enpara ••0457");
  });
  it("aynı son4 → mevcut hesabı bulur", () => {
    const hc = hesapBul(data, { ekstreTipi: "hesap", banka: "Enpara", son4: "8551" });
    expect(hc.hedef?.id).toBe("a");
  });
});

describe("ekstreUygula", () => {
  const r = ekstreUygula(bosData(), { ekstreTipi: "hesap", banka: "Enpara", son4: "0457", bakiye: 500 }, [
    { baslik: "Maaş", miktar: 1000, kategori: "Maaş", tarih: "2026-05-01", tip: "gelir", _sec: true },
    { baslik: "Transfer", miktar: 200, tarih: "2026-05-02", tip: "transfer", _transfer: true, _yon: "cikis" },
  ]);
  it("hesabı oluşturur ve bakiyeyi ekstreden ayarlar", () => {
    expect(r.data.hesaplar.length).toBe(1);
    expect(r.data.hesaplar[0].bakiye).toBe(500);
    expect(r.data.hesaplar[0].son4).toBe("0457");
  });
  it("geliri ekler, transfer bacağını saklar (gelir/gider değil)", () => {
    expect(r.data.gelirler.length).toBe(1);
    expect(r.data.giderler.length).toBe(0);
    expect(r.data.transferAkis.length).toBe(1);
    expect(r.data.transferAkis[0].miktar).toBe(-200);
  });
  it("kredi kartında son ödeme/asgari/limit bilgisini hesaba yazar", () => {
    const rk = ekstreUygula(bosData(), { ekstreTipi: "kart", banka: "Axess", son4: "7189", donemBorcu: 5000, asgariOdeme: 750, sonOdemeTarihi: "2026-09-15", krediLimiti: 30000 }, []);
    const h = rk.data.hesaplar[0];
    expect(h.tip).toBe("kart");
    expect(h.bakiye).toBe(5000);
    expect(h.sonOdeme).toBe("2026-09-15");
    expect(h.asgari).toBe(750);
    expect(h.krediLimiti).toBe(30000);
  });
});

describe("yenidenSiniflandir", () => {
  const findata = {
    giderler: [
      { id: 1, baslik: "0012 - SUPERONLINE - ODEME", kategori: "Diğer", miktar: 700, tarih: "2026-05-01", kaynak: "ekstre" },
      { id: 2, baslik: "IYZICO/AmazonPrimeTR ISTANBUL", kategori: "Diğer", miktar: 69.9, tarih: "2026-05-02", kaynak: "ekstre" },
      { id: 3, baslik: "elle girdiğim harcama", kategori: "Diğer", miktar: 100, tarih: "2026-05-03" },
    ],
    abonelikler: [],
  };
  const r = yenidenSiniflandir(findata);

  it("içe aktarılmış 'Diğer'i doğru kategoriye çeker", () => {
    expect(r.giderler.find((g) => g.id === 1).kategori).toBe("Faturalar");
    expect(r.kategoriDegisen).toBe(1);
  });
  it("aboneliği gider'den çıkarıp Abonelikler'e taşır", () => {
    expect(r.giderler.some((g) => g.id === 2)).toBe(false);
    expect(r.abonelikler.map((a) => a.baslik)).toContain("Amazon Prime");
    expect(r.aboneEklenen).toBe(1);
  });
  it("elle girilen işleme dokunmaz", () => {
    expect(r.giderler.find((g) => g.id === 3).kategori).toBe("Diğer");
  });
});

describe("aboneTespit + kategori (gelişmiş)", () => {
  it("dijital abonelikleri tanır", () => {
    expect(aboneTespit("IYZICO/AmazonPrimeTR ISTANBUL TR")).toBe("Amazon Prime");
    expect(aboneTespit("SPOTIFY AB STOCKHOLM")).toBe("Spotify");
    expect(aboneTespit("APPLE.COM/BILL")).toBe("Apple");
    expect(aboneTespit("MIGROS MARKET")).toBeNull();
  });
  it("fatura/gönderim/market kategorilerini ayırır", () => {
    expect(kategoriTahmin("0012278988 - SUPERONLINE - ODEME", "gider")).toBe("Faturalar");
    expect(kategoriTahmin("ANTALYA SU (ASAT)", "gider")).toBe("Faturalar");
    expect(kategoriTahmin("Giden Transfer, Helin Ergüzel, EFT (FAST)", "gider")).toBe("Gönderim");
    expect(kategoriTahmin("MIGROS 5M", "gider")).toBe("Market");
  });
  it("ekstreParse aboneliği 'abonelik' tipine ayırır", () => {
    const rows = [["Ad soyad", "ALI"], ["Tarih", "Açıklama", "Tutar", "Bakiye"], ["01/05/2026", "IYZICO/AmazonPrimeTR ISTANBUL", "-69,90", "100,00"]];
    const { islemler } = ekstreParse(rows);
    expect(islemler[0].tip).toBe("abonelik");
    expect(islemler[0].servis).toBe("Amazon Prime");
  });
});

// Gerçek banka XLSX biçimini taklit eden anonim ızgara
const ornekIzgara = () => [
  [],
  ["Ad Soyad/Ünvan", "AHMET YILMAZ"],
  ["IBAN", "TR00 0006 2123 4567 8901 2345 67"], // banka kodu 00062 → Garanti
  ["Hesap Türü", "TL-Vadesiz"],
  ["Tarih Aralığı", "01.01.2026 - 31.01.2026"],
  [],
  ["Tarih", "İşlem", "Açıklama", "Dekont Numarası", "Kanal", "Tutar (TL)", "Güncel Bakiye (TL)"],
  ["15.01.2026 10:00", "Diğer İşlemler", "OCAK MAAŞ ÖDEMESİ", "D1", "MAAS", "50000", "50000"],
  ["14.01.2026 12:00", "Para Transferi", "Ahmet Yılmaz  Banka: 0010 SN: 123", "D2", "MOB", "-20000", "30000"],
  ["13.01.2026 09:00", "Para Transferi", "MEHMET DEMIR  Banka: 0010 SN: 456", "D3", "MOB", "-1500", "28500"],
  ["12.01.2026 08:00", "Kredi Kartı Ödemesi", "KK: 1234 HESAPTAN ödeme", "D4", "MOB", "-3000", "25500"],
  ["11.01.2026 07:00", "Alışveriş", "MIGROS MARKET", "D5", "POS", "-450,75", "25049,25"],
  ["10.01.2026", "Para Transferi", "12345 Hesaptan Para Transferi VIRMAN", "D6", "MOB", "5000", "30049,25"],
];

describe("ekstreParse — sınıflandırma ve özet", () => {
  const { ozet, islemler } = ekstreParse(ornekIzgara());

  it("özeti başlık bloğundan çıkarır", () => {
    expect(ozet.ekstreTipi).toBe("hesap");
    expect(ozet.banka).toBe("Garanti BBVA");
    expect(ozet.sahip).toBe("AHMET YILMAZ");
    expect(ozet.son4).toBe("4567");
  });

  it("güncel bakiyeyi en yeni satırdan alır", () => {
    expect(ozet.bakiye).toBe(50000);
  });

  it("tüm işlem satırlarını çıkarır (6)", () => {
    expect(islemler.length).toBe(6);
  });

  it("maaşı gelir+Maaş olarak sınıflar", () => {
    const m = islemler.find((x) => x.aciklama.includes("MAAŞ"));
    expect(m.tip).toBe("gelir");
    expect(m.kategori).toBe("Maaş");
    expect(m.tarih).toBe("2026-01-15");
  });

  it("kendine transferi (isim eşleşmesi) transfer sayar", () => {
    const t = islemler.find((x) => x.aciklama.startsWith("Ahmet Yılmaz"));
    expect(t.tip).toBe("transfer");
    expect(t.miktar).toBe(-20000);
  });

  it("üçüncü kişiye transferi gider sayar (kendine değil)", () => {
    const g = islemler.find((x) => x.aciklama.startsWith("MEHMET"));
    expect(g.tip).toBe("gider");
  });

  it("kredi kartı ödemesini odeme sayar (gelir/gider değil)", () => {
    const o = islemler.find((x) => x.aciklama.includes("HESAPTAN"));
    expect(o.tip).toBe("odeme");
  });

  it("market harcamasını gider+Market, virgüllü tutarı doğru çözer", () => {
    const mg = islemler.find((x) => x.aciklama.includes("MIGROS"));
    expect(mg.tip).toBe("gider");
    expect(mg.kategori).toBe("Market");
    expect(mg.miktar).toBe(-450.75);
  });

  it("virman satırını transfer sayar", () => {
    const v = islemler.find((x) => x.aciklama.includes("VIRMAN"));
    expect(v.tip).toBe("transfer");
    expect(v.miktar).toBe(5000);
  });

  it("transfer/odeme satırlarına kategori atamaz", () => {
    islemler.filter((x) => x.tip === "transfer" || x.tip === "odeme").forEach((x) => expect(x.kategori).toBeNull());
  });
});

describe("ibanBanka", () => {
  it("DenizBank IBAN'ını tanır", () => {
    expect(ibanBanka("TR98 0013 4000 0160 0501 4000 05")).toBe("DenizBank");
  });
  it("Garanti IBAN'ını tanır", () => {
    expect(ibanBanka("TR00 0006 2123 4567 8901 2345 67")).toBe("Garanti BBVA");
  });
  it("bilinmeyen/eksik IBAN'da null döner", () => {
    expect(ibanBanka("")).toBeNull();
    expect(ibanBanka("TR00 0099 9123 4567 8901 2345 67")).toBeNull(); // 00999 bilinmiyor
  });
});

describe("tarihCevir", () => {
  it("nokta biçimli tarih+saati YYYY-MM-DD'ye çevirir", () => {
    expect(tarihCevir("13.06.2026 14:00")).toBe("2026-06-13");
  });
  it("slash ve 2 haneli yılı çözer", () => {
    expect(tarihCevir("03/04/26")).toBe("2026-04-03");
  });
  it("geçersizde null döner", () => {
    expect(tarihCevir("")).toBeNull();
    expect(tarihCevir("abc")).toBeNull();
  });
});

describe("kategoriTahmin", () => {
  it("anahtar kelimeden kategori bulur", () => {
    expect(kategoriTahmin("MIGROS MARKET", "gider")).toBe("Market");
    expect(kategoriTahmin("Shell akaryakıt", "gider")).toBe("Ulaşım");
    expect(kategoriTahmin("OCAK MAAŞ", "gelir")).toBe("Maaş");
  });
  it("eşleşme yoksa varsayılana düşer", () => {
    expect(kategoriTahmin("XYZ", "gider")).toBe("Diğer");
    expect(kategoriTahmin("XYZ", "gelir")).toBe("Diğer Gelir");
  });
});
