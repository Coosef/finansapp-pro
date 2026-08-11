import { describe, it, expect } from "vitest";
import { kisiBul, karsiAnahtar, haneAdaylari, haneYenidenSinifla } from "./kisi.js";

// Hane kişileri: kendi/hanedeki kişilerin hesaplarına giden para TRANSFER;
// dışarıya giden HARCAMA. Kişi = etiketli karşı taraf (ör. "Kız arkadaşım").

const kisiler = () => [
  { id: "k1", ad: "Kız arkadaşım", hane: true, anahtarlar: ["helin", "ergüzel"], son4: null },
  { id: "k2", ad: "Kirala (ext)", hane: false, anahtarlar: ["kirala"], son4: null },
];

describe("kisiBul — açıklama/iban ile hane kişisi eşle", () => {
  it("anahtar kelime açıklamada geçerse kişiyi bulur", () => {
    expect(kisiBul(kisiler(), "Giden Transfer HELİN ERGÜZEL Ev kirası", "")?.id).toBe("k1");
  });
  it("eşleşme yoksa null", () => {
    expect(kisiBul(kisiler(), "Migros market alışverişi", "")).toBe(null);
  });
  it("iban son hanelerinden eşleştirir", () => {
    const ks = [{ id: "k1", ad: "Annem", hane: true, anahtarlar: [], iban: "TR12 0006 2000 0001 2345 6789 01" }];
    expect(kisiBul(ks, "Giden Transfer", "TR120006200000012345678901")?.id).toBe("k1");
  });
  it("çok kısa anahtarı (≤2) yok sayar (yanlış eşleşmeyi önle)", () => {
    const ks = [{ id: "k1", ad: "X", hane: true, anahtarlar: ["ab"] }];
    expect(kisiBul(ks, "kabak market", "")).toBe(null);
  });
});

describe("karsiAnahtar — açıklamadan karşı taraf anahtarı", () => {
  it("transfer/tarih/tutar kelimelerini atıp adı bırakır", () => {
    expect(karsiAnahtar("Giden Transfer HELİN ERGÜZEL 12.08.2026 Ev kirası")).toContain("helin");
  });
  it("boş/anlamsızda boş döner", () => {
    expect(karsiAnahtar("EFT")).toBe("");
  });
});

describe("haneAdaylari — mevcut transfer benzeri gelir/giderden kişi adayı çıkar", () => {
  it("transfer benzeri gider açıklamalarını gruplar", () => {
    const d = {
      kisiler: [],
      giderler: [
        { baslik: "Giden Transfer Ahmet Demir", miktar: 5000, tarih: "2026-08-01", kategori: "Gönderim" },
        { baslik: "Giden Transfer Ahmet Demir kira", miktar: 5000, tarih: "2026-07-01", kategori: "Gönderim" },
        { baslik: "Migros market", miktar: 300, tarih: "2026-08-02", kategori: "Market" },
      ],
      gelirler: [],
    };
    const adaylar = haneAdaylari(d);
    expect(adaylar.length).toBe(1);
    expect(adaylar[0].adet).toBe(2);
    expect(adaylar[0].toplam).toBe(10000);
    expect(adaylar[0].anahtar).toContain("ahmet");
  });
  it("zaten tanımlı kişiye eşleşenleri aday göstermez", () => {
    const d = {
      kisiler: [{ id: "k1", ad: "Ahmet", hane: true, anahtarlar: ["ahmet demir"] }],
      giderler: [{ baslik: "Giden Transfer Ahmet Demir", miktar: 5000, tarih: "2026-08-01", kategori: "Gönderim" }],
      gelirler: [],
    };
    expect(haneAdaylari(d).length).toBe(0);
  });
});

describe("haneYenidenSinifla — eşleşen gelir/gideri transfere taşı", () => {
  it("hane kişisine giden gideri transferAkis leg'ine çevirir (gider listesinden çıkar)", () => {
    const d = {
      kisiler: kisiler(),
      giderler: [
        { id: "g1", baslik: "Giden Transfer Helin Ergüzel", miktar: 8000, tarih: "2026-08-05", kategori: "Gönderim", hesapId: "h1" },
        { id: "g2", baslik: "Migros", miktar: 300, tarih: "2026-08-02", kategori: "Market", hesapId: "h1" },
      ],
      gelirler: [{ id: "gel1", baslik: "Gelen Transfer Helin Ergüzel", miktar: 2000, tarih: "2026-08-10", kategori: "Diğer", hesapId: "h1" }],
      transferAkis: [],
    };
    const { data, tasindi } = haneYenidenSinifla(d);
    expect(tasindi).toBe(2);
    // Gider listesinde artık sadece Migros
    expect(data.giderler.map((g) => g.id)).toEqual(["g2"]);
    expect(data.gelirler.length).toBe(0);
    // İki yeni leg (biri çıkış −, biri giriş +) kisiId ile
    const legler = data.transferAkis.filter((l) => l.kisiId === "k1");
    expect(legler.length).toBe(2);
    expect(legler.find((l) => l.miktar < 0).miktar).toBe(-8000);
    expect(legler.find((l) => l.miktar > 0).miktar).toBe(2000);
  });
  it("hane olmayan kişi (k2) taşınmaz — dış harcama gider kalır", () => {
    const d = {
      kisiler: kisiler(),
      giderler: [{ id: "g1", baslik: "Kirala ödemesi", miktar: 1000, tarih: "2026-08-05", kategori: "Gönderim", hesapId: "h1" }],
      gelirler: [], transferAkis: [],
    };
    const { data, tasindi } = haneYenidenSinifla(d);
    expect(tasindi).toBe(0);
    expect(data.giderler.length).toBe(1);
  });
});
