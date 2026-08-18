import { describe, it, expect, beforeEach } from "vitest";
import { journalGet, journalMerge, journalAck, journalClear } from "./journal.js";

beforeEach(() => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
});

describe("journal (write-ahead journal)", () => {
  it("boşken null döner", () => {
    expect(journalGet("u1")).toBe(null);
  });

  it("merge + get: patch/rev/baseUpdated saklanır", () => {
    journalMerge("u1", { giderler: [1] }, 1, "U0");
    const j = journalGet("u1");
    expect(j.patch).toEqual({ giderler: [1] });
    expect(j.rev).toBe(1);
    expect(j.baseUpdated).toBe("U0");
  });

  it("coalesce: ikinci merge alanları birleştirir, baseUpdated KORUNUR", () => {
    journalMerge("u1", { giderler: [1] }, 1, "U0");
    journalMerge("u1", { giderler: [1, 2], gelirler: [9] }, 2, "U9"); // yeni base yok sayılır
    const j = journalGet("u1");
    expect(j.patch).toEqual({ giderler: [1, 2], gelirler: [9] });
    expect(j.rev).toBe(2);
    expect(j.baseUpdated).toBe("U0"); // ilk pending'in base'i sabit
  });

  it("ack: gönderilen rev kayıt rev'ini kapsıyorsa temizlenir; daha yeni korunur", () => {
    journalMerge("u1", { giderler: [1] }, 3, "U0");
    journalAck("u1", 2);
    expect(journalGet("u1")).not.toBe(null); // 3 > 2 → korunur
    journalAck("u1", 3);
    expect(journalGet("u1")).toBe(null); // 3 <= 3 → temizlenir
  });

  it("user isolation: A'nın journal'ı B'ye görünmez", () => {
    journalMerge("A", { giderler: [1] }, 1, "U0");
    expect(journalGet("B")).toBe(null);
    expect(journalGet("A")).not.toBe(null);
    journalClear("A");
    expect(journalGet("A")).toBe(null);
  });

  it("bozuk JSON → null (crash yok)", () => {
    localStorage.setItem("finansapp:waj:u1", "{bozuk json");
    expect(journalGet("u1")).toBe(null);
  });

  it("zehirli şekil (patch bir dizi) → null", () => {
    localStorage.setItem("finansapp:waj:u1", JSON.stringify({ patch: [1, 2], rev: 1 }));
    expect(journalGet("u1")).toBe(null);
  });

  it("rev sayı değilse → null", () => {
    localStorage.setItem("finansapp:waj:u1", JSON.stringify({ patch: { a: 1 }, rev: "x" }));
    expect(journalGet("u1")).toBe(null);
  });

  it("ts (yaş damgası) yazılır ve coalesce'te ilk ts korunur (TTL için)", () => {
    journalMerge("u1", { giderler: [1] }, 1, "U0");
    const j1 = journalGet("u1");
    expect(typeof j1.ts).toBe("number");
    expect(j1.ts).toBeGreaterThan(0);
    journalMerge("u1", { giderler: [1, 2] }, 2, "U0");
    expect(journalGet("u1").ts).toBe(j1.ts); // ilk pending'in yaşı korunur
  });
});
