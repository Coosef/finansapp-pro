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

// Item 6: KİM (kisiId) / ham YÖN (gelir/gider) / finansal ANLAM (tur) bağımsız.
// Yeniden sınıflama artık kaydı transfere TAŞIMAZ; yerinde bırakıp kisiId +
// tur:needs_review ile etiketler (ham tutar/başlık/tarih dokunulmaz).
describe("haneYenidenSinifla — eşleşen gelir/gideri incelemeye etiketle", () => {
  it("hane kişisine giden gider listede kalır ama kisiId + tur:needs_review ile etiketlenir", () => {
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
    // Ham kayıtlar listede KALIR — taşınmaz, çoğalmaz
    expect(data.giderler.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(data.gelirler.map((g) => g.id)).toEqual(["gel1"]);
    // Eşleşen gider etiketlendi; ham tutar/başlık/tarih değişmedi
    const g1 = data.giderler.find((g) => g.id === "g1");
    expect(g1.kisiId).toBe("k1");
    expect(g1.tur).toBe("needs_review");
    expect(g1.incelemeNeden).toContain("Kız arkadaşım");
    expect(g1.miktar).toBe(8000);
    expect(g1.baslik).toBe("Giden Transfer Helin Ergüzel");
    // Eşleşen gelir de etiketlendi (ham yön: gelir listesinde kaldı)
    const gel1 = data.gelirler.find((g) => g.id === "gel1");
    expect(gel1.kisiId).toBe("k1");
    expect(gel1.tur).toBe("needs_review");
    // Eşleşmeyen Migros'a dokunulmadı
    const g2 = data.giderler.find((g) => g.id === "g2");
    expect(g2.kisiId).toBeUndefined();
    expect(g2.tur).toBeUndefined();
    // Leg üretilmez (eski davranış terk edildi)
    expect((data.transferAkis || []).length).toBe(0);
  });
  it("hane olmayan kişi (k2) etiketlenmez — dış harcama sade gider kalır", () => {
    const d = {
      kisiler: kisiler(),
      giderler: [{ id: "g1", baslik: "Kirala ödemesi", miktar: 1000, tarih: "2026-08-05", kategori: "Gönderim", hesapId: "h1" }],
      gelirler: [], transferAkis: [],
    };
    const { data, tasindi } = haneYenidenSinifla(d);
    expect(tasindi).toBe(0);
    expect(data.giderler.length).toBe(1);
    expect(data.giderler[0].kisiId).toBeUndefined();
  });
  it("zaten sınıflı/etiketli kayda ikinci kez dokunmaz (idempotent)", () => {
    const d = {
      kisiler: kisiler(),
      giderler: [{ id: "g1", baslik: "Giden Transfer Helin Ergüzel", miktar: 8000, tarih: "2026-08-05", kategori: "Gönderim", hesapId: "h1", kisiId: "k1", tur: "gift" }],
      gelirler: [], transferAkis: [],
    };
    const { data, tasindi } = haneYenidenSinifla(d);
    expect(tasindi).toBe(0);
    expect(data.giderler[0].tur).toBe("gift"); // kullanıcı seçimi korunur
  });
});
