import { describe, it, expect } from "vitest";
import { sifreHashle, sifreDogrula, sifreHashliMi, sifrele, coz } from "./kripto.js";

describe("parola hash (PBKDF2)", () => {
  it("hash 'pbkdf2$' ile başlar ve düz metni içermez", async () => {
    const h = await sifreHashle("admin123");
    expect(sifreHashliMi(h)).toBe(true);
    expect(h).not.toContain("admin123");
  });
  it("doğru parola doğrulanır, yanlış reddedilir", async () => {
    const h = await sifreHashle("s3cret!");
    expect(await sifreDogrula("s3cret!", h)).toBe(true);
    expect(await sifreDogrula("yanlis", h)).toBe(false);
  });
  it("aynı parola her seferinde farklı hash üretir (tuz), ikisi de doğrulanır", async () => {
    const a = await sifreHashle("ayni");
    const b = await sifreHashle("ayni");
    expect(a).not.toBe(b);
    expect(await sifreDogrula("ayni", a)).toBe(true);
    expect(await sifreDogrula("ayni", b)).toBe(true);
  });
  it("geriye uyum: düz-metin saklanan değer doğrudan karşılaştırılır", async () => {
    expect(sifreHashliMi("admin123")).toBe(false);
    expect(await sifreDogrula("admin123", "admin123")).toBe(true);
    expect(await sifreDogrula("x", "admin123")).toBe(false);
  });
});

describe("AES-GCM şifreleme", () => {
  it("şifrele→çöz turu orijinali verir, çıktı düz metni içermez", async () => {
    const p = JSON.stringify({ gizli: 42, ad: "Yusuf" });
    const paket = await sifrele(p, "parola");
    expect(paket.startsWith("aesgcm$")).toBe(true);
    expect(paket).not.toContain("Yusuf");
    expect(await coz(paket, "parola")).toBe(p);
  });
  it("yanlış parola çözmeyi başarısız kılar", async () => {
    const paket = await sifrele("veri", "dogru");
    await expect(coz(paket, "yanlis")).rejects.toBeTruthy();
  });
  it("bozuk/geçersiz paket reddedilir", async () => {
    await expect(coz("duztext", "x")).rejects.toBeTruthy();
  });
});
