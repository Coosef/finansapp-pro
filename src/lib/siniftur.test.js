import { describe, it, expect } from "vitest";
import { TUR, turEtkisi } from "./siniftur.js";

// "Kim" (ilişki) ≠ "finansal anlam" (tur). turEtkisi bir gelir/gider kaydının
// income/expense KPI'sına katkısını verir. Etiketsiz = eski davranış (geriye uyum).

describe("turEtkisi — finansal etki", () => {
  it("etiketsiz gelir → income; gider → expense (geriye uyum)", () => {
    expect(turEtkisi({ miktar: 100 }, "gelir")).toEqual({ gelir: 100, gider: 0 });
    expect(turEtkisi({ miktar: 100 }, "gider")).toEqual({ gelir: 0, gider: 100 });
  });
  it("iade → gideri azaltır (income DEĞİL)", () => {
    expect(turEtkisi({ miktar: 5000, tur: TUR.IADE }, "gelir")).toEqual({ gelir: 0, gider: -5000 });
  });
  it("masraf geri ödemesi (reimbursement) → gideri azaltır", () => {
    expect(turEtkisi({ miktar: 2000, tur: TUR.REIMBURSE }, "gelir")).toEqual({ gelir: 0, gider: -2000 });
  });
  it("stopaj → geliri azaltır (tüketim gideri DEĞİL)", () => {
    expect(turEtkisi({ miktar: 150, tur: TUR.STOPAJ }, "gider")).toEqual({ gelir: -150, gider: 0 });
  });
  it("needs_review / iç-transfer / hane-transfer / borç ver-al / diğer → nötr (KPI DIŞI)", () => {
    for (const t of [TUR.INCELE, TUR.IC_TRANSFER, TUR.HANE_TRANSFER, TUR.BORC_VERME, TUR.BORC_ODEME, TUR.DIGER]) {
      expect(turEtkisi({ miktar: 1000, tur: t }, "gelir")).toEqual({ gelir: 0, gider: 0 });
      expect(turEtkisi({ miktar: 1000, tur: t }, "gider")).toEqual({ gelir: 0, gider: 0 });
    }
  });
  it("hediye → ekonomik, ham yönü izler (verdiğin=gider, aldığın=gelir)", () => {
    expect(turEtkisi({ miktar: 1000, tur: TUR.HEDIYE }, "gider")).toEqual({ gelir: 0, gider: 1000 });
    expect(turEtkisi({ miktar: 1000, tur: TUR.HEDIYE }, "gelir")).toEqual({ gelir: 1000, gider: 0 });
  });
  it("varlık satışı → ekonomik gelir (para girişi)", () => {
    expect(turEtkisi({ miktar: 5000, tur: TUR.VARLIK_SATIS }, "gelir")).toEqual({ gelir: 5000, gider: 0 });
  });
});
