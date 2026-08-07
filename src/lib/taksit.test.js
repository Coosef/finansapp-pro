import { describe, it, expect } from "vitest";
import { taksitAyristir, taksitPlanlari, aylikTaksitYuku, kalanTaksitBorcu } from "./taksit.js";

describe("taksitAyristir", () => {
  it("başlıktan no/toplam ve temiz adı çıkarır (tutar parantezini de atar)", () => {
    const r = taksitAyristir("N11 ONLINE ALISVERIS (25,499.15 TL) (taksit 5/9)");
    expect(r).toEqual({ temiz: "N11 ONLINE ALISVERIS", no: 5, toplam: 9 });
  });
  it("basit '(taksit 3/3)' biçimini çözer", () => {
    expect(taksitAyristir("Bambi Deri Mam. AŞ. (taksit 3/3)")).toEqual({ temiz: "Bambi Deri Mam. AŞ.", no: 3, toplam: 3 });
  });
  it("taksit olmayan başlıkta null", () => {
    expect(taksitAyristir("Migros market")).toBe(null);
  });
});

const findata = {
  giderler: [
    { baslik: "N11 (25,499.15 TL) (taksit 4/9)", miktar: 2833.31, tarih: "2026-07-26", kaynak: "taksit" },
    { baslik: "N11 (25,499.15 TL) (taksit 5/9)", miktar: 2833.31, tarih: "2026-08-26", kaynak: "taksit" },
    { baslik: "N11 (25,499.15 TL) (taksit 6/9)", miktar: 2833.31, tarih: "2026-09-26", kaynak: "taksit" },
    { baslik: "Bambi AŞ (taksit 3/3)", miktar: 1699.99, tarih: "2026-05-01", kaynak: "taksit" }, // bitmiş
    { baslik: "Migros market", miktar: 500, tarih: "2026-08-01", kaynak: "ekstre" },
  ],
};
const bugun = "2026-08-07";

describe("taksitPlanlari", () => {
  const p = taksitPlanlari(findata, bugun);
  it("yalnız kalan taksiti olan planları döndürür (biten Bambi düşer)", () => {
    expect(p.length).toBe(1);
    expect(p[0].baslik).toBe("N11");
  });
  it("kalan sayısı ve tutarı doğru hesaplar", () => {
    expect(p[0].kalan).toBe(2); // 5/9 ve 6/9 gelecek
    expect(p[0].kalanTutar).toBeCloseTo(5666.62, 2);
    expect(p[0].odenmis).toBe(1); // 4/9 geçmiş
    expect(p[0].sonrakiTarih).toBe("2026-08-26");
    expect(p[0].toplamTaksit).toBe(9);
  });
});

describe("aylikTaksitYuku", () => {
  it("gelecek taksitleri aya göre gruplar", () => {
    const y = aylikTaksitYuku(findata, bugun);
    expect(y).toEqual([
      { ay: "2026-08", tutar: 2833.31 },
      { ay: "2026-09", tutar: 2833.31 },
    ]);
  });
});

describe("kalanTaksitBorcu", () => {
  it("tüm gelecek taksitlerin toplamı", () => {
    expect(kalanTaksitBorcu(findata, bugun)).toBeCloseTo(5666.62, 2);
  });
});
