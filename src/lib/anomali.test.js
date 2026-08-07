import { describe, it, expect } from "vitest";
import { sessizZamlar } from "./anomali.js";

describe("sessizZamlar", () => {
  it("stabil sonra artan aboneliği yakalar (Netflix 99→119)", () => {
    const fd = { giderler: [
      { baslik: "Netflix abonelik", miktar: 99, tarih: "2026-05-15", kategori: "Abonelik" },
      { baslik: "Netflix abonelik", miktar: 99, tarih: "2026-06-15", kategori: "Abonelik" },
      { baslik: "Netflix abonelik", miktar: 119, tarih: "2026-07-15", kategori: "Abonelik" },
    ]};
    const r = sessizZamlar(fd);
    expect(r.length).toBe(1);
    expect(r[0].eskiTutar).toBe(99);
    expect(r[0].yeniTutar).toBe(119);
    expect(r[0].artisPct).toBe(20);
  });

  it("düzensiz harcamayı (market) alarm vermez", () => {
    const fd = { giderler: [
      { baslik: "Migros market", miktar: 150, tarih: "2026-05-02" },
      { baslik: "Migros market", miktar: 420, tarih: "2026-06-02" },
      { baslik: "Migros market", miktar: 210, tarih: "2026-07-02" },
    ]};
    expect(sessizZamlar(fd).length).toBe(0);
  });

  it("3 aydan az veya artış yoksa işaretlemez", () => {
    const az = { giderler: [
      { baslik: "Spotify abon", miktar: 60, tarih: "2026-06-10" },
      { baslik: "Spotify abon", miktar: 80, tarih: "2026-07-10" },
    ]};
    expect(sessizZamlar(az).length).toBe(0);
    const sabit = { giderler: [
      { baslik: "Spotify abon", miktar: 60, tarih: "2026-05-10" },
      { baslik: "Spotify abon", miktar: 60, tarih: "2026-06-10" },
      { baslik: "Spotify abon", miktar: 60, tarih: "2026-07-10" },
    ]};
    expect(sessizZamlar(sabit).length).toBe(0);
  });

  it("taksit kayıtlarını görmezden gelir", () => {
    const fd = { giderler: [
      { baslik: "N11 (taksit 1/9)", miktar: 100, tarih: "2026-05-01" },
      { baslik: "N11 (taksit 2/9)", miktar: 100, tarih: "2026-06-01" },
      { baslik: "N11 (taksit 3/9)", miktar: 500, tarih: "2026-07-01" },
    ]};
    expect(sessizZamlar(fd).length).toBe(0);
  });
});
