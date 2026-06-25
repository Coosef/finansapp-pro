import { describe, it, expect } from "vitest";
import { satirlariCoz } from "./pdf.js";
import { ekstreParse } from "./ekstre.js";

// Enpara banka PDF düzenini taklit eden anonim metin öğeleri (x,y,s)
const bankaItems = () => [
  { y: 740, x: 35, s: "Ad soyad" }, { y: 740, x: 130, s: ":" }, { y: 740, x: 138, s: "ALI VELI" },
  { y: 720, x: 35, s: "IBAN" }, { y: 720, x: 130, s: ":" }, { y: 720, x: 138, s: "TR00 0006 2123 4567 8901 2345 67" },
  { y: 600, x: 39, s: "Tarih" }, { y: 600, x: 93, s: "Hareket tipi" }, { y: 600, x: 156, s: "Açıklama" }, { y: 600, x: 556, s: "İşlem Tutarı" }, { y: 600, x: 674, s: "Bakiye" },
  { y: 580, x: 39, s: "15.01.2026" }, { y: 580, x: 93, s: "Faiz Geliri" }, { y: 580, x: 156, s: "%30 faiz geliri" }, { y: 580, x: 574, s: "5,47 TL" }, { y: 580, x: 663, s: "1.005,47 TL" },
  // Sarmalanan açıklama: tutar satırının ÜSTÜNDE
  { y: 560, x: 156, s: "Giden Transfer, Tatil hesabıma" },
  { y: 545, x: 39, s: "14.01.2026" }, { y: 545, x: 560, s: "- 500,00 TL" }, { y: 545, x: 663, s: "1.000,00 TL" },
];

describe("satirlariCoz — PDF ızgara kurulumu", () => {
  const rows = satirlariCoz([bankaItems()]);
  const { ozet, islemler } = ekstreParse(rows);

  it(": ayraçlı IBAN'ı yakalar → banka", () => {
    expect(ozet.banka).toBe("Garanti BBVA");
    expect(ozet.sahip).toBe("ALI VELI");
  });

  it("güncel bakiyeyi en yeni satırdan alır", () => {
    expect(ozet.bakiye).toBe(1005.47);
  });

  it("iki işlemi de çıkarır, açıklamayı doğru işleme bağlar", () => {
    expect(islemler.length).toBe(2);
    const faiz = islemler.find((x) => x.aciklama.includes("faiz"));
    expect(faiz.tip).toBe("gelir");
    const tr = islemler.find((x) => x.aciklama.includes("Giden Transfer"));
    expect(tr.tip).toBe("transfer");
    expect(tr.miktar).toBe(-500);
    // Sarmalanan açıklama yanlış işleme bulaşmamalı
    expect(faiz.aciklama).not.toContain("Giden Transfer");
  });
});

describe("ekstreParse — kredi kartı ekstresi", () => {
  const rows = [
    ["Ekstre borcu", "1.813,44 TL"],
    ["Kart numarası", "5269 11** **** 6523"],
    ["Kart limiti", "5.550,00 TL"],
    ["Tarih", "Açıklama", "Tutar", "Bakiye"],
    ["13/04/2026", "Ödeme - Enpara.com Cep Şubesi", "-4269,12", ""],
    ["09/04/2026", "SUPERONLINE - ODEME", "700,00", ""],
    ["10/04/2026", "Trendyol - Yemek", "620,50", ""],
  ];
  const { ozet, islemler } = ekstreParse(rows);

  it("kart ekstresini tanır: tip, borç, son4, banka", () => {
    expect(ozet.ekstreTipi).toBe("kart");
    expect(ozet.donemBorcu).toBe(1813.44);
    expect(ozet.son4).toBe("6523");
    expect(ozet.banka).toBe("Enpara"); // metinden "enpara"
  });

  it("negatif satırı ödeme, pozitifleri gider sayar", () => {
    expect(islemler.find((x) => x.aciklama.includes("Ödeme")).tip).toBe("odeme");
    expect(islemler.filter((x) => x.tip === "gider").length).toBe(2);
  });
});

describe("ekstreParse — Enpara banka deyimleri", () => {
  const rows = [
    ["Ad soyad", "ALI VELI"],
    ["Tarih", "Açıklama", "Tutar", "Bakiye"],
    ["05/05/26", "Para Çekme, QNB ATM'sinden para çekme", "-12000,00", "0,00"],
    ["05/05/26", "Gelen Transfer, Tatil hesabımdan", "9000,00", "9000,00"],
    ["05/05/26", "Giden Transfer, Helin Ergüzel, Bireysel Ödeme, EFT", "-9000,00", "0,00"],
    ["06/05/26", "Vergi Kesintisi Faiz geliri vergi kesintisi", "-0,96", "10,00"],
  ];
  const { islemler } = ekstreParse(rows);
  const bul = (s) => islemler.find((x) => x.aciklama.includes(s));

  it("ATM para çekmeyi transfer sayar", () => expect(bul("Para Çekme").tip).toBe("transfer"));
  it("kendine geleni transfer sayar", () => expect(bul("hesabımdan").tip).toBe("transfer"));
  it("üçüncü kişiye gideni gider sayar", () => expect(bul("Helin").tip).toBe("gider"));
  it("vergi kesintisini gider sayar", () => expect(bul("Vergi Kesintisi").tip).toBe("gider"));
});
