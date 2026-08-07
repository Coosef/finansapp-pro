import { describe, it, expect } from "vitest";
import { nakitAkisProjeksiyon } from "./nakitakis.js";

const bugun = "2026-08-07";

describe("nakitAkisProjeksiyon", () => {
  it("likit hesap toplamından başlar, olay yoksa bakiye sabit", () => {
    const fd = { hesaplar: [{ tip: "banka", bakiye: 5000 }, { tip: "kart", bakiye: 20000 }] };
    const r = nakitAkisProjeksiyon(fd, bugun, 45);
    expect(r.baslangic).toBe(5000); // kart borcu başlangıca katılmaz
    expect(r.bitis).toBe(5000);
    expect(r.seri.length).toBe(1);
    expect(r.ilkEksi).toBe(null);
  });

  it("gelecek gider/gelir'i tarih sırasıyla uygular", () => {
    const fd = {
      hesaplar: [{ tip: "banka", bakiye: 3000 }],
      giderler: [{ baslik: "Taksit", miktar: 2000, tarih: "2026-08-26" }],
      gelirler: [{ baslik: "Maaş", miktar: 1000, tarih: "2026-08-20" }],
    };
    const r = nakitAkisProjeksiyon(fd, bugun, 45);
    expect(r.bitis).toBe(2000); // 3000 + 1000 - 2000
    expect(r.olaySayisi).toBe(2);
    expect(r.ilkEksi).toBe(null);
  });

  it("bakiye eksiye düşerse ilkEksi'yi işaretler", () => {
    const fd = {
      hesaplar: [{ tip: "banka", bakiye: 1000 }],
      giderler: [{ baslik: "Büyük taksit", miktar: 2500, tarih: "2026-08-26" }],
    };
    const r = nakitAkisProjeksiyon(fd, bugun, 45);
    expect(r.bitis).toBe(-1500);
    expect(r.ilkEksi).toEqual({ tarih: "2026-08-26", bakiye: -1500 });
    expect(r.enDusuk.bakiye).toBe(-1500);
  });

  it("aboneliği her ay gününde tekrarlı işler", () => {
    const fd = {
      hesaplar: [{ tip: "banka", bakiye: 1000 }],
      abonelikler: [{ baslik: "Netflix", miktar: 100, tarih: "2026-01-15" }],
    };
    const r = nakitAkisProjeksiyon(fd, bugun, 45); // 08-07 → 09-21 arası → 08-15 ve 09-15
    expect(r.olaySayisi).toBe(2);
    expect(r.bitis).toBe(800);
  });

  it("aralık dışındaki (uzak gelecek) olayları saymaz", () => {
    const fd = {
      hesaplar: [{ tip: "banka", bakiye: 1000 }],
      giderler: [{ baslik: "Uzak", miktar: 500, tarih: "2027-01-01" }],
    };
    const r = nakitAkisProjeksiyon(fd, bugun, 45);
    expect(r.olaySayisi).toBe(0);
    expect(r.bitis).toBe(1000);
  });
});
