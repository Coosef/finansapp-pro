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

  it("cozumle: fresh revision + patch yeniden uygulanır, yeni base ile gönderilir", async () => {
    const send = vi.fn(async () => ({ revision: 9, updated: "U9" }));
    const p = createPersister({ send, journal: mockJournal(), delay: 1200 });
    p.bind("u1", 3);
    p.schedule({ giderler: [1] }, { giderler: [1] });
    const yeni = p.cozumle({ giderler: [], gelirler: [5] }, 8, { giderler: [1] }); // taze server rev=8
    expect(yeni).toEqual({ giderler: [1], gelirler: [5] }); // patch taze veriye uygulandı
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenLastCalledWith({ giderler: [1], gelirler: [5] }, 8); // base=8 (taze)
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
