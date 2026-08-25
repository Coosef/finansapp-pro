import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPersister } from "./persistence.js";

function mockJournal() {
  const m = new Map();
  return {
    _m: m,
    merge: (uid, patch, rev, base) => {
      const c = m.get(uid);
      m.set(uid, { patch: { ...(c?.patch || {}), ...patch }, rev, base: c?.base ?? base });
    },
    ack: (uid, rev) => { const c = m.get(uid); if (c && c.rev <= rev) m.delete(uid); },
    clear: (uid) => m.delete(uid),
    get: (uid) => m.get(uid) || null,
  };
}
const conflictErr = (revision) => { const e = new Error("çakışma"); e.conflict = true; e.revision = revision; return e; };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("createPersister (CAS)", () => {
  it("debounce: birden çok schedule → tek send, SON değer + baseRevision", async () => {
    const send = vi.fn(async () => ({ revision: 1, updated: "U1" }));
    const p = createPersister({ send, journal: mockJournal(), delay: 1200 });
    p.bind("u1", 0);
    p.schedule({ n: 1 }, { n: 1 });
    p.schedule({ n: 2 }, { n: 2 });
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ n: 2 }, 0); // data + baseRevision=0
  });

  it("başarılı CAS → journal ACK, revision ilerler, status kaydedildi", async () => {
    const j = mockJournal();
    const send = vi.fn(async () => ({ revision: 5, updated: "U1" }));
    const p = createPersister({ send, journal: j, delay: 1200 });
    p.bind("u1", 4);
    p.schedule({ n: 1 }, { n: 1 });
    expect(j.get("u1")).not.toBe(null);
    await vi.advanceTimersByTimeAsync(1200);
    expect(j.get("u1")).toBe(null);
    expect(p.getStatus()).toBe("kaydedildi");
    expect(p.getSyncedRevision()).toBe(5); // server revision ilerledi
  });

  it("single-flight + trailing: send uçarken B → base güncel revision ile gönderilir", async () => {
    let resolveA;
    const send = vi.fn()
      .mockImplementationOnce(() => new Promise((r) => { resolveA = () => r({ revision: 1, updated: "U1" }); }))
      .mockImplementationOnce(async () => ({ revision: 2, updated: "U2" }));
    const p = createPersister({ send, journal: mockJournal(), delay: 1200 });
    p.bind("u1", 0);
    p.schedule({ n: "A" }, { n: "A" });
    await vi.advanceTimersByTimeAsync(1200);
    expect(send).toHaveBeenCalledTimes(1);
    p.schedule({ n: "B" }, { n: "B" });
    await vi.advanceTimersByTimeAsync(1200);
    expect(send).toHaveBeenCalledTimes(1); // single-flight
    resolveA();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith({ n: "B" }, 1); // A ACK sonrası base=1
  });

  it("409 çakışma → status catisma, journal KORUNUR, retry() TETİKLEMEZ (kör retry yok)", async () => {
    const j = mockJournal();
    const send = vi.fn(async () => { throw conflictErr(7); });
    const p = createPersister({ send, journal: j, delay: 1200 });
    p.bind("u1", 3);
    p.schedule({ n: 1 }, { n: 1 });
    await vi.advanceTimersByTimeAsync(1200);
    expect(p.getStatus()).toBe("catisma");
    expect(j.get("u1")).not.toBe(null); // WAL KORUNDU
    p.retry(); // çatışmada retry send tetiklemez
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("409 çakışma → KİLİT: sonraki schedule WAL'a yazar ama GÖNDERMEZ, durum catisma kalır", async () => {
    const j = mockJournal();
    const send = vi.fn(async () => { throw conflictErr(7); }); // ilk gönderim çakışır (server rev=7)
    const p = createPersister({ send, journal: j, delay: 1200 });
    p.bind("u1", 3);
    p.schedule({ giderler: [1] }, { giderler: [1] });
    await vi.advanceTimersByTimeAsync(1200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith({ giderler: [1] }, 3);
    expect(p.getStatus()).toBe("catisma");
    expect(j.get("u1")).not.toBe(null); // WAL KORUNDU (ACK yok)
    // Kilit: yeni mutation WAL'a işlenir ama GÖNDERİLMEZ, durum catisma KALIR (otomatik write yok)
    p.schedule({ giderler: [1, 2] }, { giderler: [1, 2] });
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).toHaveBeenCalledTimes(1); // ikinci schedule göndermedi (kilit)
    expect(p.getStatus()).toBe("catisma");
    expect(j.get("u1").patch).toEqual({ giderler: [1, 2] }); // yeni mutation WAL'a işlendi
  });

  it("catismaGir (load-path kilidi): schedule WAL'a yazar ama GÖNDERMEZ, durum catisma", async () => {
    const j = mockJournal();
    const send = vi.fn(async () => ({ revision: 5, updated: "U" }));
    const p = createPersister({ send, journal: j, delay: 1200 });
    p.bind("u1", 3);
    p.catismaGir();
    expect(p.getStatus()).toBe("catisma");
    p.schedule({ x: 1 }, { x: 1 });     // reload sonrası derivasyon/otomatik setFindata simülasyonu
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).not.toHaveBeenCalled(); // kilitli → gönderim yok (çakışma sessizce ezilmez)
    expect(p.getStatus()).toBe("catisma");
    expect(j.get("u1")).not.toBe(null);  // WAL'a yazıldı (kayıp yok)
  });

  it("ağ hatası → status hata, journal KORUNUR; retry başarılı → temizlenir", async () => {
    const j = mockJournal();
    let ok = false;
    const send = vi.fn(async () => { if (!ok) throw new Error("offline"); return { revision: 1, updated: "U1" }; });
    const p = createPersister({ send, journal: j, delay: 1200 });
    p.bind("u1", 0);
    p.schedule({ n: 1 }, { n: 1 });
    await vi.advanceTimersByTimeAsync(1200);
    expect(p.getStatus()).toBe("hata");
    expect(j.get("u1")).not.toBe(null);
    ok = true;
    p.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(p.getStatus()).toBe("kaydedildi");
    expect(j.get("u1")).toBe(null);
  });

  it("hasPending + flush(hata/catisma guard)", async () => {
    const send = vi.fn(async () => { throw conflictErr(2); });
    const p = createPersister({ send, journal: mockJournal(), delay: 1200 });
    p.bind("u1", 0);
    expect(p.hasPending()).toBe(false);
    p.schedule({ n: 1 }, { n: 1 });
    expect(p.hasPending()).toBe(true);
    await vi.advanceTimersByTimeAsync(1200);
    expect(p.getStatus()).toBe("catisma");
    p.flush(); // catisma'da göndermez
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// ACK KONTRATI — "Kaydedildi" YALNIZ doğrulanmış server ACK sonrası.
// send() geçerli bir { revision:int>=0 } döndürmedikçe (null / {revision:null}
// / eksik-revision) BAŞARI SAYILMAZ: journal ACK'lenmez, sentRev ilerlemez,
// pending korunur, status "kaydedildi" OLMAZ. (False-positive save fix.)
// ============================================================
describe("createPersister — ACK kontratı (server ACK olmadan Kaydedildi YOK)", () => {
  it("R1 — send()→null: ACK YOK, kaydedildi DEĞİL, WAL korunur, pending kalır", async () => {
    const j = mockJournal();
    const send = vi.fn(async () => null); // istek gitmedi / geçerli ACK yok
    const p = createPersister({ send, journal: j, delay: 1200 });
    p.bind("u1", 3);
    p.schedule({ n: 1 }, { n: 1 });
    expect(j.get("u1")).not.toBe(null);
    await vi.advanceTimersByTimeAsync(1200);
    expect(p.getStatus()).not.toBe("kaydedildi"); // FALSE "Kaydedildi" olmamalı
    expect(j.get("u1")).not.toBe(null);           // WAL KORUNMALI (ACK/clear yok)
    expect(p.hasPending()).toBe(true);            // pending mutation kalır → retry mümkün
    expect(p.getSyncedRevision()).toBe(3);        // server revision ilerlememeli
  });

  it("R2 — send()→{revision:null}: geçersiz ACK, kaydedildi DEĞİL, WAL korunur", async () => {
    const j = mockJournal();
    const send = vi.fn(async () => ({ revision: null, updated: null }));
    const p = createPersister({ send, journal: j, delay: 1200 });
    p.bind("u1", 3);
    p.schedule({ n: 1 }, { n: 1 });
    await vi.advanceTimersByTimeAsync(1200);
    expect(p.getStatus()).not.toBe("kaydedildi");
    expect(j.get("u1")).not.toBe(null);
    expect(p.hasPending()).toBe(true);
    expect(p.getSyncedRevision()).toBe(3);
  });

  it("R2b — send()→{} (revision alanı yok): geçersiz ACK, kaydedildi DEĞİL", async () => {
    const j = mockJournal();
    const send = vi.fn(async () => ({}));
    const p = createPersister({ send, journal: j, delay: 1200 });
    p.bind("u1", 3);
    p.schedule({ n: 1 }, { n: 1 });
    await vi.advanceTimersByTimeAsync(1200);
    expect(p.getStatus()).not.toBe("kaydedildi");
    expect(j.get("u1")).not.toBe(null);
    expect(p.hasPending()).toBe(true);
  });

  it("kontrol: geçerli ACK {revision:4} → kaydedildi + WAL temizlenir (regresyon değil)", async () => {
    const j = mockJournal();
    const send = vi.fn(async () => ({ revision: 4, updated: "U" }));
    const p = createPersister({ send, journal: j, delay: 1200 });
    p.bind("u1", 3);
    p.schedule({ n: 1 }, { n: 1 });
    await vi.advanceTimersByTimeAsync(1200);
    expect(p.getStatus()).toBe("kaydedildi");
    expect(j.get("u1")).toBe(null);
    expect(p.getSyncedRevision()).toBe(4);
  });
});

// ============================================================
// State modeli / diagnostics — lastAckRevision & lastAckAt YALNIZ geçerli
// server ACK sonrası set olur; hasUnsaved() pending veya çakışmayı yansıtır.
// (Stale-tab teşhisi + SW-reload güvenlik guard'ı için.)
// ============================================================
describe("createPersister — diagnostics & hasUnsaved", () => {
  it("lastAckRevision/lastAckAt YALNIZ geçerli ACK sonrası set olur", async () => {
    const j = mockJournal();
    let ok = false;
    const send = vi.fn(async () => (ok ? { revision: 6, updated: "U" } : null));
    const p = createPersister({ send, journal: j, delay: 1200 });
    p.bind("u1", 5);
    p.schedule({ n: 1 }, { n: 1 });
    await vi.advanceTimersByTimeAsync(1200);
    // null ACK → başarı değil: lastAck set OLMAZ, pending kalır, durum hata
    expect(p.getDiagnostics().lastAckRevision).toBe(null);
    expect(p.getDiagnostics().status).toBe("hata");
    expect(p.getDiagnostics().pending).toBe(true);
    ok = true;
    p.retry();
    await vi.advanceTimersByTimeAsync(0);
    const d = p.getDiagnostics();
    expect(d.lastAckRevision).toBe(6);
    expect(Number.isInteger(d.lastAckAt)).toBe(true);
    expect(d.pending).toBe(false);
    expect(d.status).toBe("kaydedildi");
  });

  it("hasUnsaved: pending veya çakışma açıkken true, temizken false", async () => {
    const j = mockJournal();
    const send = vi.fn(async () => { throw conflictErr(9); });
    const p = createPersister({ send, journal: j, delay: 1200 });
    p.bind("u1", 3);
    expect(p.hasUnsaved()).toBe(false);
    p.schedule({ n: 1 }, { n: 1 });
    expect(p.hasUnsaved()).toBe(true); // pending
    await vi.advanceTimersByTimeAsync(1200);
    expect(p.getStatus()).toBe("catisma");
    expect(p.hasUnsaved()).toBe(true); // çakışma kilidi
  });
});
