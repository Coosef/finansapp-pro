import { describe, it, expect } from "vitest";
import { bildirimOzeti } from "./bildirim.js";

const bugun = "2026-08-07";

describe("bildirimOzeti", () => {
  it("yaklaşan abonelik + kart son ödemesini satırlara katar", () => {
    const fd = {
      abonelikler: [{ baslik: "Netflix", miktar: 100, tarih: "2026-01-09" }], // ayın 9'u → 2 gün
      hesaplar: [{ ad: "Axess", tip: "kart", bakiye: 5000, asgari: 750, sonOdeme: "2026-08-12" }],
    };
    const s = bildirimOzeti(fd, bugun, 3);
    expect(s.some((x) => x.includes("Netflix"))).toBe(true);
    expect(s.some((x) => x.includes("Axess"))).toBe(true);
  });

  it("nakit akış eksiye düşerse ⚠ satırı ekler", () => {
    const fd = {
      hesaplar: [{ tip: "banka", bakiye: 100 }],
      giderler: [{ baslik: "Büyük", miktar: 2000, tarih: "2026-08-20" }],
    };
    const s = bildirimOzeti(fd, bugun);
    expect(s.some((x) => x.startsWith("⚠"))).toBe(true);
  });

  it("sessiz zam varsa 🔔 satırı ekler", () => {
    const fd = { giderler: [
      { baslik: "Spotify abon", miktar: 60, tarih: "2026-05-10", kategori: "Abonelik" },
      { baslik: "Spotify abon", miktar: 60, tarih: "2026-06-10", kategori: "Abonelik" },
      { baslik: "Spotify abon", miktar: 90, tarih: "2026-07-10", kategori: "Abonelik" },
    ]};
    const s = bildirimOzeti(fd, bugun);
    expect(s.some((x) => x.startsWith("🔔"))).toBe(true);
  });

  it("hiçbir uyarı yoksa boş liste", () => {
    expect(bildirimOzeti({}, bugun)).toEqual([]);
  });
});
