import { describe, it, expect } from "vitest";
import { donemHesap, aylikHesap, oncekiAy, ayAraligi, aylikKarsilastir, kategoriDagilim, aylarGeri } from "./hesapla.js";

// Ortak hesaplama katmanı — tüm ekranların TEK doğruluk kaynağı.
// Kanon: giderToplam = giderKalem + aboneAylik*(dönemdeki ay sayısı).

const veri = () => ({
  gelirler: [
    { id: "g1", baslik: "Maaş", miktar: 80000, kategori: "Maaş", tarih: "2026-08-05" },
    { id: "g2", baslik: "Serbest", miktar: 5000, kategori: "Serbest", tarih: "2026-08-20" },
    { id: "g3", baslik: "Temmuz maaş", miktar: 80000, kategori: "Maaş", tarih: "2026-07-05" },
  ],
  giderler: [
    { id: "e1", baslik: "Market A", miktar: 3000, kategori: "Market", tarih: "2026-08-03" },
    { id: "e2", baslik: "Market B", miktar: 2000, kategori: "Market", tarih: "2026-08-10" },
    { id: "e3", baslik: "Restoran", miktar: 1000, kategori: "Restoran", tarih: "2026-08-15" },
    { id: "e4", baslik: "Temmuz market", miktar: 4000, kategori: "Market", tarih: "2026-07-12" },
  ],
  abonelikler: [
    { id: "a1", baslik: "Spotify", miktar: 60, kategori: "Abonelik", tarih: "2026-08-01" },
    { id: "a2", baslik: "Netflix", miktar: 140, kategori: "Abonelik", tarih: "2026-08-01" },
  ],
});

describe("donemHesap — dönem özeti (tek doğruluk kaynağı)", () => {
  it("buAy gelir/gider/abonelik/net doğru toplar", () => {
    const r = donemHesap(veri(), "buAy", "2026-08-11");
    expect(r.gelir).toBe(85000);
    expect(r.giderKalem).toBe(6000); // 3000+2000+1000
    expect(r.aboneAylik).toBe(200); // 60+140
    expect(r.abone).toBe(200); // buAy → ×1
    expect(r.giderToplam).toBe(6200); // 6000 + 200
    expect(r.net).toBe(78800); // 85000 - 6200
  });

  it("tasarruf oranını net/gelir olarak verir", () => {
    const r = donemHesap(veri(), "buAy", "2026-08-11");
    expect(Math.round(r.tasarrufOrani)).toBe(93); // 78800/85000
  });

  it("filtrelenmiş listeleri drill-down için döndürür", () => {
    const r = donemHesap(veri(), "buAy", "2026-08-11");
    expect(r.gelirler.map((g) => g.id).sort()).toEqual(["g1", "g2"]);
    expect(r.giderler.map((g) => g.id).sort()).toEqual(["e1", "e2", "e3"]);
  });

  it("gecenAy yalnız o ayın kayıtlarını sayar", () => {
    const r = donemHesap(veri(), "gecenAy", "2026-08-11");
    expect(r.gelir).toBe(80000); // sadece temmuz maaş
    expect(r.giderKalem).toBe(4000); // sadece temmuz market
  });

  it("buYil aboneliği 12 ayla çarpar (yıllık yük)", () => {
    const r = donemHesap(veri(), "buYil", "2026-08-11");
    expect(r.aboneAylik).toBe(200);
    expect(r.abone).toBe(2400); // 200*12
    expect(r.giderToplam).toBe(10000 + 2400); // yıl geneli 6000+4000 kalem + 2400 abone
  });

  it("tum döneminde tüm kalemleri, aboneliği bir kez sayar", () => {
    const r = donemHesap(veri(), "tum", "2026-08-11");
    expect(r.gelir).toBe(165000);
    expect(r.giderKalem).toBe(10000);
    expect(r.abone).toBe(200); // tum → ×1 (sınırsız şişme yok)
  });

  it("gelir yoksa tasarruf oranı 0 döner (bölme yok)", () => {
    const r = donemHesap({ gelirler: [], giderler: [], abonelikler: [] }, "buAy", "2026-08-11");
    expect(r.tasarrufOrani).toBe(0);
    expect(r.net).toBe(0);
  });
});

describe("donemHesap — finansal tür KPI netleme (audit item 2/5/7)", () => {
  it("iade gideri netler (income değil), stopaj geliri netler, needs_review nötr", () => {
    const d = {
      gelirler: [
        { miktar: 90000, tarih: "2026-08-05", kategori: "Maaş" },
        { miktar: 5000, tarih: "2026-08-07", kategori: "Diğer", tur: "iade" },        // gideri azaltmalı
        { miktar: 1000, tarih: "2026-08-08", kategori: "Faiz/Yatırım" },              // brüt faiz
        { miktar: 78000, tarih: "2026-08-09", kategori: "Diğer", tur: "needs_review" }, // 3rd-party EFT → nötr
      ],
      giderler: [
        { miktar: 5000, tarih: "2026-08-03", kategori: "Market" },
        { miktar: 150, tarih: "2026-08-08", kategori: "Vergi/Resmi", tur: "stopaj" },  // geliri azaltmalı
      ],
      abonelikler: [],
    };
    const r = donemHesap(d, "buAy", "2026-08-15");
    // gelir = 90000 + 1000(faiz) − 150(stopaj) = 90850 ; iade & needs_review income'a girmez
    expect(r.gelir).toBe(90850);
    // gider = 5000(market) − 5000(iade) = 0
    expect(r.giderToplam).toBe(0);
  });
});

describe("ay yardımcıları", () => {
  it("ayAraligi ayın ilk ve son gününü verir", () => {
    expect(ayAraligi("2026-08")).toEqual({ start: "2026-08-01", end: "2026-08-31" });
    expect(ayAraligi("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });

  it("oncekiAy yıl sınırını aşar", () => {
    expect(oncekiAy("2026-08")).toBe("2026-07");
    expect(oncekiAy("2026-01")).toBe("2025-12");
  });
});

describe("aylarGeri — son N ay (UTC kararlı, saat diliminden bağımsız)", () => {
  it("verilen aydan geriye N ayı eskiden yeniye sıralı verir", () => {
    expect(aylarGeri("2026-08", 6)).toEqual(["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
  });
  it("yıl sınırını doğru aşar", () => {
    expect(aylarGeri("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("aylikHesap — belirli ay", () => {
  it("verilen ayın toplamlarını verir (abone ×1)", () => {
    const r = aylikHesap(veri(), "2026-08");
    expect(r.gelir).toBe(85000);
    expect(r.giderToplam).toBe(6200);
  });
});

describe("aylikKarsilastir — geçen aya göre", () => {
  it("bu ay ve önceki ayı karşılaştırıp fark/pct verir", () => {
    const r = aylikKarsilastir(veri(), "2026-08");
    expect(r.bu.giderKalem).toBe(6000);
    expect(r.onceki.giderKalem).toBe(4000);
    expect(r.degisim.giderToplam.fark).toBe(6200 - 4200); // (6000+200) - (4000+200)
    expect(Math.round(r.degisim.giderToplam.pct)).toBe(48); // 2000/4200
  });

  it("önceki ay sıfırsa pct null (yeni, taban yok)", () => {
    const d = { gelirler: [{ miktar: 100, tarih: "2026-08-01", kategori: "X" }], giderler: [], abonelikler: [] };
    const r = aylikKarsilastir(d, "2026-08");
    expect(r.degisim.gelir.pct).toBe(null);
  });
});

describe("kategoriDagilim", () => {
  it("kategori toplamlarını azalan sıralar, yüzde verir", () => {
    const giderler = [
      { kategori: "Market", miktar: 3000 },
      { kategori: "Market", miktar: 2000 },
      { kategori: "Restoran", miktar: 1000 },
    ];
    const d = kategoriDagilim(giderler);
    expect(d[0]).toMatchObject({ kategori: "Market", toplam: 5000 });
    expect(Math.round(d[0].pct)).toBe(83); // 5000/6000
    expect(d[1]).toMatchObject({ kategori: "Restoran", toplam: 1000 });
  });
  it("needs_review / nötr türleri dışlar, sınıflı hediyeyi katar (turEtkisi tutarlı)", () => {
    const giderler = [
      { kategori: "Market", miktar: 1000 }, // düz gider → sayılır
      { kategori: "Diğer", miktar: 9000, tur: "needs_review" }, // incelemede → KPI dışı → sayılmaz
      { kategori: "Gönderim", miktar: 5000, tur: "household_transfer" }, // nötr → sayılmaz
      { kategori: "Hediye", miktar: 2000, tur: "gift" }, // hediye (gider yönü) → sayılır
    ];
    const d = kategoriDagilim(giderler);
    const kats = d.map((x) => x.kategori);
    expect(kats).toEqual(expect.arrayContaining(["Market", "Hediye"]));
    expect(kats).not.toContain("Diğer"); // needs_review dışlandı
    expect(kats).not.toContain("Gönderim"); // hane transfer dışlandı
    expect(d.find((x) => x.kategori === "Market").toplam).toBe(1000);
    expect(d.find((x) => x.kategori === "Hediye").toplam).toBe(2000);
  });
});
