import { describe, it, expect } from "vitest";
import { ekstreParse, ibanBanka, tarihCevir, kategoriTahmin } from "./ekstre.js";

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
