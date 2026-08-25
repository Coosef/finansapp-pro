import { describe, it, expect } from "vitest";
import { surumKarsilastir, SURUM, BUILD_SHA, BUILD_TIME, buildKimligi, swKontrolluMu } from "./surum.js";

describe("build kimliği (diagnostics — stale-tab teşhisi)", () => {
  it("BUILD_SHA/BUILD_TIME inject edilmese bile güvenli string fallback", () => {
    expect(typeof BUILD_SHA).toBe("string");
    expect(BUILD_SHA.length).toBeGreaterThan(0); // en az "dev"
    expect(typeof BUILD_TIME).toBe("string");
  });
  it("buildKimligi appVersion/buildSha/loadedAt/swControlled döner; hassas alan YOK", () => {
    const b = buildKimligi();
    expect(b.appVersion).toBe(SURUM);
    expect(b.buildSha).toBe(BUILD_SHA);
    expect(Number.isInteger(b.loadedAt)).toBe(true);
    expect(typeof b.swControlled).toBe("boolean");
    expect("token" in b).toBe(false);
    expect("data" in b).toBe(false);
  });
  it("swKontrolluMu navigator yoksa/patlarsa güvenli boolean döner", () => {
    expect(typeof swKontrolluMu()).toBe("boolean");
  });
});

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
