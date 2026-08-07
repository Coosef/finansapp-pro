import { describe, it, expect } from "vitest";
import { surumKarsilastir, SURUM } from "./surum.js";

describe("surumKarsilastir", () => {
  it("büyük/küçük/eşit sürümleri doğru sıralar", () => {
    expect(surumKarsilastir("1.0.0", "1.0.1")).toBe(-1);
    expect(surumKarsilastir("1.2.0", "1.1.9")).toBe(1);
    expect(surumKarsilastir("1.0.0", "1.0.0")).toBe(0);
  });
  it("'v' önekini ve eksik parçaları tolere eder", () => {
    expect(surumKarsilastir("v1.0", "1.0.0")).toBe(0);
    expect(surumKarsilastir("v2", "1.9.9")).toBe(1);
    expect(surumKarsilastir("1.0.0", "v1.0.1")).toBe(-1);
  });
  it("SURUM tanımlı bir string", () => {
    expect(typeof SURUM).toBe("string");
  });
});
