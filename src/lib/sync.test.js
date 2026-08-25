import { describe, it, expect, beforeEach, vi } from "vitest";
import { pbGiris, pbSifreDegistir, syncBagliMi, pbCikis, pbFindataGonder } from "./sync.js";

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

// ============================================================
// pbFindataGonder — ACK kontratı: geçerli server ACK YOKSA sessiz "başarı"
// (null / geçersiz revision / bozuk JSON) DÖNMEZ; hata fırlatır. Böylece
// persister false "Kaydedildi" üretemez, WAL korunur. (False-positive save fix.)
// ============================================================
describe("pbFindataGonder — sessiz başarı YOK (ACK kontratı)", () => {
  it("R3 — bağlantı yokken (token/userId yok) sessiz null DÖNMEZ, hata fırlatır", async () => {
    // beforeEach → pbCikis(): _token/_userId boş → syncBagliMi() false
    expect(syncBagliMi()).toBe(false);
    await expect(pbFindataGonder({ x: 1 }, 0)).rejects.toThrow();
  });

  it("R4 — HTTP 200 ama revision geçersiz (null): başarı sayılmaz, hata fırlatır", async () => {
    mockFetch(async (url) => {
      if (url.includes("/auth-with-password")) return { ok: true, status: 200, json: async () => ({ token: "T", record: { id: "U1" } }) };
      if (url.includes("/api/findata/kaydet")) return { ok: true, status: 200, json: async () => ({ revision: null, updated: null }) };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    await pbGiris("http://x", "a@b.com", "sifre1234");
    await expect(pbFindataGonder({ x: 1 }, 0)).rejects.toThrow();
  });

  it("R4b — HTTP 200 ama gövde JSON parse edilemiyor: başarı sayılmaz, hata fırlatır", async () => {
    mockFetch(async (url) => {
      if (url.includes("/auth-with-password")) return { ok: true, status: 200, json: async () => ({ token: "T", record: { id: "U1" } }) };
      if (url.includes("/api/findata/kaydet")) return { ok: true, status: 200, json: async () => { throw new Error("bozuk gövde"); } };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    await pbGiris("http://x", "a@b.com", "sifre1234");
    await expect(pbFindataGonder({ x: 1 }, 0)).rejects.toThrow();
  });

  it("kontrol: geçerli ACK {revision:5} → { revision:5 } döner (regresyon değil)", async () => {
    mockFetch(async (url) => {
      if (url.includes("/auth-with-password")) return { ok: true, status: 200, json: async () => ({ token: "T", record: { id: "U1" } }) };
      if (url.includes("/api/findata/kaydet")) return { ok: true, status: 200, json: async () => ({ revision: 5, updated: "2026-01-01" }) };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    await pbGiris("http://x", "a@b.com", "sifre1234");
    const r = await pbFindataGonder({ x: 1 }, 0);
    expect(r).toEqual({ revision: 5, updated: "2026-01-01" });
  });

  it("kontrol: 409 → ConflictError (regresyon değil)", async () => {
    mockFetch(async (url) => {
      if (url.includes("/auth-with-password")) return { ok: true, status: 200, json: async () => ({ token: "T", record: { id: "U1" } }) };
      if (url.includes("/api/findata/kaydet")) return { ok: false, status: 409, json: async () => ({ revision: 9, updated: "2026-02-02" }) };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    await pbGiris("http://x", "a@b.com", "sifre1234");
    await expect(pbFindataGonder({ x: 1 }, 0)).rejects.toMatchObject({ conflict: true, revision: 9 });
  });
});
