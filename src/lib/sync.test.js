import { describe, it, expect, beforeEach, vi } from "vitest";
import { pbGiris, pbSifreDegistir, syncBagliMi, pbCikis } from "./sync.js";

beforeEach(() => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  pbCikis(); // modül durumunu temizle
});

function mockFetch(handler) { globalThis.fetch = vi.fn(handler); }

describe("pbSifreDegistir (DB-only şifre değişimi)", () => {
  it("giriş yapılmadan hata verir", async () => {
    await expect(pbSifreDegistir("eski", "yenisifre8")).rejects.toThrow(/giriş/i);
  });

  it("8 karakterden kısa yeni şifreyi reddeder", async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ token: "T", record: { id: "U1" } }) }));
    await pbGiris("http://x", "a@b.com", "sifre1234");
    await expect(pbSifreDegistir("sifre1234", "kisa")).rejects.toThrow(/8 karakter/);
  });

  it("başarılı değişimde PATCH gönderir ve yeni şifreyle yeniden giriş yapar", async () => {
    const cagrilar = [];
    mockFetch(async (url, opts) => {
      cagrilar.push({ url, method: opts?.method || "GET", body: opts?.body });
      if (url.includes("/auth-with-password")) return { ok: true, status: 200, json: async () => ({ token: "T2", record: { id: "U1" } }) };
      if (opts?.method === "PATCH") return { ok: true, status: 200, json: async () => ({ id: "U1" }) };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    await pbGiris("http://x", "a@b.com", "sifre1234");
    await pbSifreDegistir("sifre1234", "yenisifre8");

    const patch = cagrilar.find((c) => c.method === "PATCH");
    expect(patch).toBeTruthy();
    const gov = JSON.parse(patch.body);
    expect(gov.oldPassword).toBe("sifre1234");
    expect(gov.password).toBe("yenisifre8");
    expect(gov.passwordConfirm).toBe("yenisifre8");

    // Şifre değişince eski token geçersizleşir → yeniden giriş (2. auth çağrısı) yapılır
    expect(syncBagliMi()).toBe(true);
    expect(cagrilar.filter((c) => c.url.includes("/auth-with-password")).length).toBe(2);
  });

  it("yanlış mevcut şifrede (400) anlamlı hata verir", async () => {
    mockFetch(async (url, opts) => {
      if (url.includes("/auth-with-password")) return { ok: true, status: 200, json: async () => ({ token: "T", record: { id: "U1" } }) };
      if (opts?.method === "PATCH") return { ok: false, status: 400, json: async () => ({ data: { oldPassword: { message: "Invalid old password." } } }) };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    await pbGiris("http://x", "a@b.com", "sifre1234");
    await expect(pbSifreDegistir("yanlis1234", "yenisifre8")).rejects.toThrow();
  });
});
