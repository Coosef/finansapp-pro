import { describe, it, expect } from "vitest";
import { aylikKarne, runwayAy } from "./karne.js";

const findata = {
  gelirler: [{ miktar: 10000, tarih: "2026-08-03", kategori: "Maaş" }],
  giderler: [
    { miktar: 3000, tarih: "2026-08-05", kategori: "Market" },
    { miktar: 2000, tarih: "2026-08-10", kategori: "Teknoloji" },
    { miktar: 4000, tarih: "2026-07-05", kategori: "Market" }, // önceki ay
    { miktar: 5000, tarih: "2026-06-05", kategori: "Market" },
  ],
  hesaplar: [{ tip: "banka", bakiye: 12000 }, { tip: "kart", bakiye: 8000 }],
};

describe("aylikKarne", () => {
  const k = aylikKarne(findata, "2026-08");
  it("gelir/gider/net ve tasarruf oranını hesaplar", () => {
    expect(k.toplamGelir).toBe(10000);
    expect(k.toplamGider).toBe(5000);
    expect(k.net).toBe(5000);
    expect(k.tasarrufOrani).toBe(50);
    expect(k.not).toBe("A");
  });
  it("en büyük kategoriyi oranıyla verir", () => {
    expect(k.enBuyukKategori).toEqual({ ad: "Market", tutar: 3000, oran: 60 });
  });
  it("ay-üstü gider değişimini hesaplar (5000 vs 4000 = +%25)", () => {
    expect(k.degisimPct).toBe(25);
  });
  it("gelir yoksa tasarruf oranı null, not '—'", () => {
    const k2 = aylikKarne({ giderler: [{ miktar: 100, tarih: "2026-08-01", kategori: "X" }] }, "2026-08");
    expect(k2.tasarrufOrani).toBe(null);
    expect(k2.not).toBe("—");
  });
  it("aboneliği aylık gidere dahil eder (Panel ile tutarlı)", () => {
    const d = { gelirler: [{ miktar: 10000, tarih: "2026-08-03", kategori: "Maaş" }], giderler: [{ miktar: 3000, tarih: "2026-08-05", kategori: "Market" }], abonelikler: [{ miktar: 200, tarih: "2026-08-01" }] };
    const k = aylikKarne(d, "2026-08");
    expect(k.toplamGider).toBe(3200);
    expect(k.net).toBe(6800);
  });
});

describe("runwayAy", () => {
  it("likit ÷ son 3 ay ortalama gider = dayanma süresi (ay)", () => {
    // son 3 ay gider: Ağu 5000 + Tem 4000 + Haz 5000 = 14000 → ort 4666.67; likit 12000 (kart hariç)
    const r = runwayAy(findata, "2026-08-15");
    expect(r.likit).toBe(12000);
    expect(r.aylikGider).toBe(4667);
    expect(r.ay).toBeCloseTo(2.6, 1);
  });
  it("gider yoksa null", () => {
    expect(runwayAy({ hesaplar: [{ tip: "banka", bakiye: 100 }] }, "2026-08-15")).toBe(null);
  });
});
