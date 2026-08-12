import { describe, it, expect } from "vitest";
import { bekleyenInceleme, siniflananHane, turSecenekleri, turEtkiIpucu, turEtiket } from "./incele.js";
import { TUR } from "./siniftur.js";

// İncelenecek işlemler katmanı (item 6 UI): needs_review backlog + yön-uygun
// finansal anlam seçenekleri + KPI etki ipucu (turEtkisi'nden türetilir).

describe("bekleyenInceleme — needs_review backlog", () => {
  it("gelir+gider içinden needs_review kayıtlarını toplar, adet+toplam+kayıt döner", () => {
    const d = {
      gelirler: [
        { id: "gel1", baslik: "Gelen EFT", miktar: 2000, tarih: "2026-08-10", tur: TUR.INCELE },
        { id: "gel2", baslik: "Maaş", miktar: 50000, tarih: "2026-08-01" },
      ],
      giderler: [
        { id: "g1", baslik: "Giden EFT", miktar: 8000, tarih: "2026-08-05", tur: TUR.INCELE },
        { id: "g2", baslik: "Migros", miktar: 300, tarih: "2026-08-02" },
      ],
    };
    const r = bekleyenInceleme(d);
    expect(r.adet).toBe(2);
    expect(r.toplam).toBe(10000);
    // En yeni tarih önce
    expect(r.kayitlar[0].id).toBe("gel1");
    // Ham yön işaretlenir
    expect(r.kayitlar.find((x) => x.id === "g1")._yon).toBe("gider");
    expect(r.kayitlar.find((x) => x.id === "gel1")._yon).toBe("gelir");
  });
  it("needs_review yoksa boş backlog", () => {
    expect(bekleyenInceleme({ gelirler: [{ id: "a", tur: TUR.GELIR }], giderler: [] })).toEqual({ adet: 0, toplam: 0, kayitlar: [] });
    expect(bekleyenInceleme({})).toEqual({ adet: 0, toplam: 0, kayitlar: [] });
  });
});

describe("siniflananHane — sınıflanmış ama yeniden sınıflanabilir hane kayıtları", () => {
  it("kisiId/incelemeNeden taşıyan, needs_review OLMAYAN kayıtları döner; ham needs_review'ı ve etiketsizi dışlar", () => {
    const d = {
      gelirler: [
        { id: "gel1", baslik: "Gelen", miktar: 2000, tarih: "2026-08-10", kisiId: "k1", tur: TUR.HEDIYE }, // sınıflı hane → dahil
        { id: "gel2", baslik: "Maaş", miktar: 50000, tarih: "2026-08-01" }, // etiketsiz → hariç
      ],
      giderler: [
        { id: "g1", baslik: "Giden", miktar: 9000, tarih: "2026-08-05", kisiId: "k1", tur: TUR.INCELE }, // hâlâ incelemede → hariç
        { id: "g2", baslik: "Hediye", miktar: 500, tarih: "2026-08-06", incelemeNeden: "x", tur: TUR.GIDER }, // sınıflı → dahil
      ],
    };
    const r = siniflananHane(d);
    const ids = r.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["gel1", "g2"]));
    expect(ids).not.toContain("gel2"); // etiketsiz
    expect(ids).not.toContain("g1"); // hâlâ needs_review
    expect(r.find((x) => x.id === "gel1")._yon).toBe("gelir");
  });
  it("hane kaydı yoksa boş", () => {
    expect(siniflananHane({ gelirler: [], giderler: [] })).toEqual([]);
  });
});

describe("turSecenekleri — yön-uygun finansal anlam", () => {
  it("gider yönünde Gider/Hane/Borç/Hediye içerir, Gelir/Varlık satışı içermez", () => {
    const turler = turSecenekleri("gider").map((s) => s.tur);
    expect(turler).toContain(TUR.GIDER);
    expect(turler).toContain(TUR.HANE_TRANSFER);
    expect(turler).toContain(TUR.BORC_VERME);
    expect(turler).toContain(TUR.HEDIYE);
    expect(turler).not.toContain(TUR.GELIR);
    expect(turler).not.toContain(TUR.VARLIK_SATIS);
  });
  it("gelir yönünde Gelir/İade/Varlık satışı içerir, Gider/Verilen borç içermez", () => {
    const turler = turSecenekleri("gelir").map((s) => s.tur);
    expect(turler).toContain(TUR.GELIR);
    expect(turler).toContain(TUR.IADE);
    expect(turler).toContain(TUR.VARLIK_SATIS);
    expect(turler).not.toContain(TUR.GIDER);
    expect(turler).not.toContain(TUR.BORC_VERME);
  });
});

describe("turEtkiIpucu — KPI etkisi (turEtkisi'nden türetilir)", () => {
  it("gider→gideri artırır; iade→gideri azaltır; hane transfer→nötr", () => {
    expect(turEtkiIpucu(TUR.GIDER, "gider").tip).toBe("gider");
    expect(turEtkiIpucu(TUR.IADE, "gelir").tip).toBe("iade");
    expect(turEtkiIpucu(TUR.HANE_TRANSFER, "gider").tip).toBe("notr");
    expect(turEtkiIpucu(TUR.GELIR, "gelir").tip).toBe("gelir");
  });
});

describe("turEtiket — insan-okur tür adı", () => {
  it("bilinen türü çevirir, bilinmeyeni olduğu gibi döner", () => {
    expect(turEtiket(TUR.HEDIYE)).toBe("Hediye");
    expect(turEtiket(TUR.INCELE)).toBe("İnceleniyor");
    expect(turEtiket("bilinmeyen")).toBe("bilinmeyen");
  });
});
