import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPersister } from "./persistence.js";

// Bellek-içi journal mock'u (journal.js sarmalayıcı sözleşmesi).
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

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("createPersister", () => {
  it("debounce: delay içinde birden çok schedule → tek send, SON değer", async () => {
    const send = vi.fn(async () => ({ updated: "U1" }));
    const p = createPersister({ send, journal: mockJournal(), delay: 1200 });
    p.bind("u1", "U0");
    p.schedule({ n: 1 }, { n: 1 });
    p.schedule({ n: 2 }, { n: 2 });
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ n: 2 });
  });

  it("başarılı send → journal ACK ile temizlenir, status kaydedildi", async () => {
    const j = mockJournal();
    const send = vi.fn(async () => ({ updated: "U1" }));
    const p = createPersister({ send, journal: j, delay: 1200 });
    p.bind("u1", "U0");
    p.schedule({ n: 1 }, { n: 1 });
    expect(j.get("u1")).not.toBe(null); // pending yazıldı
    await vi.advanceTimersByTimeAsync(1200);
    expect(j.get("u1")).toBe(null); // ACK → temizlendi
    expect(p.getStatus()).toBe("kaydedildi");
    expect(p.getSyncedUpdated()).toBe("U1"); // base ilerledi
  });

  it("single-flight + trailing: send uçarken gelen mutation ACK sonrası gönderilir", async () => {
    let resolveA;
    const send = vi.fn()
      .mockImplementationOnce(() => new Promise((r) => { resolveA = () => r({ updated: "U1" }); }))
      .mockImplementationOnce(async () => ({ updated: "U2" }));
    const p = createPersister({ send, journal: mockJournal(), delay: 1200 });
    p.bind("u1", "U0");
    p.schedule({ n: "A" }, { n: "A" });
    await vi.advanceTimersByTimeAsync(1200); // A uçuşta (resolve edilmedi)
    expect(send).toHaveBeenCalledTimes(1);
    p.schedule({ n: "B" }, { n: "B" }); // A in-flight iken B
    await vi.advanceTimersByTimeAsync(1200);
    expect(send).toHaveBeenCalledTimes(1); // hâlâ tek (single-flight)
    resolveA();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2); // A bitince B gönderildi
    expect(send).toHaveBeenLastCalledWith({ n: "B" }); // en yeni state
  });

  it("hata → status hata, journal KALIR; retry başarılı olunca temizlenir", async () => {
    const j = mockJournal();
    let ok = false;
    const send = vi.fn(async () => { if (!ok) throw new Error("offline"); return { updated: "U1" }; });
    const p = createPersister({ send, journal: j, delay: 1200 });
    p.bind("u1", "U0");
    p.schedule({ n: 1 }, { n: 1 });
    await vi.advanceTimersByTimeAsync(1200);
    expect(p.getStatus()).toBe("hata");
    expect(j.get("u1")).not.toBe(null); // pending KORUNDU (recovery)
    ok = true;
    p.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(p.getStatus()).toBe("kaydedildi");
    expect(j.get("u1")).toBe(null);
  });

  it("hasPending: schedule sonrası true, ACK sonrası false", async () => {
    const send = vi.fn(async () => ({ updated: "U1" }));
    const p = createPersister({ send, journal: mockJournal(), delay: 1200 });
    p.bind("u1", "U0");
    expect(p.hasPending()).toBe(false);
    p.schedule({ n: 1 }, { n: 1 });
    expect(p.hasPending()).toBe(true);
    await vi.advanceTimersByTimeAsync(1200);
    expect(p.hasPending()).toBe(false);
  });

  it("flush(): debounce beklemeden hemen gönderir", async () => {
    const send = vi.fn(async () => ({ updated: "U1" }));
    const p = createPersister({ send, journal: mockJournal(), delay: 1200 });
    p.bind("u1", "U0");
    p.schedule({ n: 1 }, { n: 1 });
    p.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("flush(): HATA durumundaki pending'i GÖNDERMEZ (multi-device clobber guard)", async () => {
    const send = vi.fn(async () => { throw new Error("offline"); });
    const p = createPersister({ send, journal: mockJournal(), delay: 1200 });
    p.bind("u1", "U0");
    p.schedule({ n: 1 }, { n: 1 });
    await vi.advanceTimersByTimeAsync(1200);
    expect(p.getStatus()).toBe("hata");
    expect(send).toHaveBeenCalledTimes(1);
    p.flush(); // hata durumunda flush send TETİKLEMEZ
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1); // artmadı
  });
});
