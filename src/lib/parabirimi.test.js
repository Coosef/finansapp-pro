import { describe, it, expect } from "vitest";
import { tryeCevir, pbSembol, PB_SECENEK } from "./parabirimi.js";

describe("tryeCevir", () => {
  const kurlar = { usd: 40, eur: 44 };
  it("TRY aynen döner (kur gerekmez)", () => {
    expect(tryeCevir(1000, "TRY", null)).toBe(1000);
    expect(tryeCevir(1000, undefined, null)).toBe(1000);
  });
  it("USD/EUR'yu kurla çarpar", () => {
    expect(tryeCevir(100, "USD", kurlar)).toBe(4000);
    expect(tryeCevir(100, "EUR", kurlar)).toBe(4400);
  });
  it("kur yoksa null döner", () => {
    expect(tryeCevir(100, "USD", null)).toBe(null);
    expect(tryeCevir(100, "EUR", { usd: 40 })).toBe(null);
  });
});

describe("pbSembol", () => {
  it("bilinen para birimlerinin sembolünü verir", () => {
    expect(pbSembol("USD")).toBe("$");
    expect(pbSembol("EUR")).toBe("€");
    expect(pbSembol("TRY")).toBe("₺");
    expect(pbSembol("XYZ")).toBe("");
  });
  it("3 para birimi seçeneği tanımlı", () => {
    expect(PB_SECENEK.map((p) => p.id)).toEqual(["TRY", "USD", "EUR"]);
  });
});
