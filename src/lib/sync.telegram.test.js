// T1C — browser Telegram metadata istemcisi sözleşme testleri (TC-U01..U11).
// Kapsam: GET status / pair-code / unlink; 401 oturum sonlandırma; BOZUK 2xx başarı DEĞİL;
// sunucu hatası ASLA "bağlı değil" değil. Finansal yazma yolu hiç kullanılmaz.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const OTURUM = { url: "http://pb.test", token: "TOK", userId: "u1", email: "a@b.test" };

let sync;
async function tazeSync() {
  vi.resetModules();
  const store = { "finansapp:sync": JSON.stringify(OTURUM) };
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const m = await import("./sync.js");
  m.syncYukle(); // oturumu yükle (bagli = true)
  return m;
}
// fetch sahtesi: son çağrıyı kaydeder, verilen yanıtı döner.
function fetchVer(yanit) {
  const cagrilar = [];
  globalThis.fetch = async (url, opts = {}) => {
    cagrilar.push({ url: String(url), method: opts.method || "GET", headers: opts.headers || {}, body: opts.body, cache: opts.cache });
    if (yanit instanceof Error) throw yanit;
    return { ok: yanit.status >= 200 && yanit.status < 300, status: yanit.status, json: async () => { if (yanit.bozukJson) throw new Error("bad json"); return yanit.json; } };
  };
  return cagrilar;
}

beforeEach(async () => { sync = await tazeSync(); });
afterEach(() => { delete globalThis.fetch; });

describe("T1C browser Telegram istemcisi", () => {
  it("TC-U01 status GET + geçerli unlinked → {linked:false}", async () => {
    const c = fetchVer({ status: 200, json: { linked: false } });
    const d = await sync.pbTelegramDurum();
    expect(d).toEqual({ linked: false });
    expect(c[0].method).toBe("GET");                                   // POST DEĞİL
    expect(c[0].url).toBe("http://pb.test/api/tg/user/status");
    expect(c[0].headers.Authorization).toBe("TOK");
    expect(c[0].cache).toBe("no-store");
  });

  it("TC-U02 status GET + geçerli linked → scope/linkedAt; iç ID yok", async () => {
    fetchVer({ status: 200, json: { linked: true, scope: "personal", linked_at: "2026-08-28 07:00:00.000Z" } });
    const d = await sync.pbTelegramDurum();
    expect(d.linked).toBe(true);
    expect(d.scope).toBe("personal");
    expect(d.linkedAt).toBe("2026-08-28 07:00:00.000Z");
    expect(Object.keys(d).sort()).toEqual(["linked", "linkedAt", "scope"]); // telegram_user_id/user id YOK
  });

  it("TC-U03 status bozuk 200 → hata (sessiz 'bağlı değil' DEĞİL)", async () => {
    fetchVer({ status: 200, json: { durum: "ok" } });                   // linked yok
    await expect(sync.pbTelegramDurum()).rejects.toThrow(/çözümlenemedi/);
    fetchVer({ status: 200, json: { linked: "evet" } });                // yanlış tip
    await expect(sync.pbTelegramDurum()).rejects.toThrow(/çözümlenemedi/);
    fetchVer({ status: 200, bozukJson: true });                         // JSON parse hatası
    await expect(sync.pbTelegramDurum()).rejects.toThrow(/çözümlenemedi/);
  });

  it("TC-U04 status 401 → oturum sonlandırılır + oturum hatası", async () => {
    fetchVer({ status: 401, json: {} });
    await expect(sync.pbTelegramDurum()).rejects.toThrow(/Oturum süresi doldu/);
    expect(sync.syncBagliMi()).toBe(false);                             // pbCikis() çağrıldı
  });

  it("TC-U05 status 500/ağ → hata; ASLA linked:false", async () => {
    fetchVer({ status: 500, json: {} });
    await expect(sync.pbTelegramDurum()).rejects.toThrow(/alınamadı \(500\)/);
    fetchVer(new Error("offline"));
    await expect(sync.pbTelegramDurum()).rejects.toThrow(/ulaşılamadı/);
    expect(sync.syncBagliMi()).toBe(true);                              // 5xx oturumu kapatmaz
  });

  it("TC-U06 pair-code geçerli yanıt → kod + süre", async () => {
    const c = fetchVer({ status: 200, json: { code: "ABCD2345", expires_in: 300 } });
    const r = await sync.pbTelegramKodUret();
    expect(r).toEqual({ kod: "ABCD2345", saniye: 300 });
    expect(c[0].method).toBe("POST");
    expect(c[0].url).toBe("http://pb.test/api/tg/user/pair-code");
    expect(c[0].body).toBe("{}");                                       // finansal veri gönderilmez
  });

  it("TC-U07 pair-code bozuk 2xx → hata (uzunluk/alfabe/süre doğrulanır)", async () => {
    for (const json of [
      { code: "ABC", expires_in: 300 },                                  // kısa
      { code: "ABCD23456", expires_in: 300 },                            // uzun
      { code: "ABCD234I", expires_in: 300 },                             // yasak harf (I)
      { code: "abcd2345", expires_in: 300 },                             // küçük harf
      { code: "ABCD2345", expires_in: 0 },                               // süre ≤ 0
      { code: "ABCD2345", expires_in: -5 },
      { code: "ABCD2345", expires_in: 12.5 },                            // tam sayı değil
      { code: "ABCD2345" },                                              // süre yok
      { expires_in: 300 },                                               // kod yok
    ]) {
      fetchVer({ status: 200, json });
      await expect(sync.pbTelegramKodUret()).rejects.toThrow(/geçerli bir bağlantı kodu/);
    }
    fetchVer({ status: 200, bozukJson: true });
    await expect(sync.pbTelegramKodUret()).rejects.toThrow(/çözümlenemedi/);
  });

  it("TC-U08 pair-code 401 → oturum sonlandırma; 5xx → açık hata", async () => {
    fetchVer({ status: 401, json: {} });
    await expect(sync.pbTelegramKodUret()).rejects.toThrow(/Oturum süresi doldu/);
    expect(sync.syncBagliMi()).toBe(false);
    sync = await tazeSync();
    fetchVer({ status: 503, json: {} });
    await expect(sync.pbTelegramKodUret()).rejects.toThrow(/üretilemedi \(503\)/);
  });

  it("TC-U09 unlink YALNIZ 200 + {ok:true} başarıdır", async () => {
    const c = fetchVer({ status: 200, json: { ok: true } });
    expect(await sync.pbTelegramBaglantiyiKes()).toEqual({ ok: true });
    expect(c[0].method).toBe("POST");
    expect(c[0].url).toBe("http://pb.test/api/tg/user/unlink");
  });

  it("TC-U10 unlink bozuk 200 → hata (yalan başarı yok)", async () => {
    fetchVer({ status: 200, json: { ok: false } });
    await expect(sync.pbTelegramBaglantiyiKes()).rejects.toThrow(/onaylamadı/);
    fetchVer({ status: 200, json: {} });
    await expect(sync.pbTelegramBaglantiyiKes()).rejects.toThrow(/onaylamadı/);
    fetchVer({ status: 200, bozukJson: true });
    await expect(sync.pbTelegramBaglantiyiKes()).rejects.toThrow(/çözümlenemedi/);
  });

  it("TC-U11 unlink 500/ağ → yalan başarı YOK", async () => {
    fetchVer({ status: 500, json: {} });
    await expect(sync.pbTelegramBaglantiyiKes()).rejects.toThrow(/kaldırılamadı \(500\)/);
    fetchVer(new Error("offline"));
    await expect(sync.pbTelegramBaglantiyiKes()).rejects.toThrow(/ulaşılamadı/);
  });

  it("TC-U12 oturum yokken üç fonksiyon da çağrı YAPMADAN hata verir", async () => {
    sync.pbCikis();
    const c = fetchVer({ status: 200, json: { linked: false } });
    await expect(sync.pbTelegramDurum()).rejects.toThrow(/Önce giriş yap/);
    await expect(sync.pbTelegramKodUret()).rejects.toThrow(/Önce giriş yap/);
    await expect(sync.pbTelegramBaglantiyiKes()).rejects.toThrow(/Önce giriş yap/);
    expect(c.length).toBe(0);
  });
});
