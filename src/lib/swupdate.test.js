import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSwUpdater } from "./swupdate.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// Service worker controllerchange sonrası GÜVENLİ otomatik reload:
// kaydedilmemiş (pending/inFlight/çakışma) değişiklik varken reload ERTELENİR.
describe("createSwUpdater — controllerchange sonrası güvenli reload", () => {
  it("temiz durumda güncelleme gelince HEMEN yeniler", () => {
    const yenile = vi.fn();
    const u = createSwUpdater({ kirliMi: () => false, yenile });
    u.guncellemeGeldi();
    expect(yenile).toHaveBeenCalledTimes(1);
  });

  it("kirliMi tanımsızsa (temiz say) hemen yeniler — SW güncellemesi normal işler", () => {
    const yenile = vi.fn();
    const u = createSwUpdater({ yenile });
    u.guncellemeGeldi();
    expect(yenile).toHaveBeenCalledTimes(1);
  });

  it("kirli (pending/inFlight/çakışma) durumda YENİLEMEZ — reload ertelenir", () => {
    const yenile = vi.fn();
    const u = createSwUpdater({ kirliMi: () => true, yenile });
    u.guncellemeGeldi();
    expect(yenile).not.toHaveBeenCalled();
    expect(u._bekliyorMu()).toBe(true);
  });

  it("kirli→temiz: tekrarDene() ile yenilenir (ACK sonrası nudge)", () => {
    const yenile = vi.fn();
    let kirli = true;
    const u = createSwUpdater({ kirliMi: () => kirli, yenile });
    u.guncellemeGeldi();
    expect(yenile).not.toHaveBeenCalled();
    kirli = false;
    u.tekrarDene();
    expect(yenile).toHaveBeenCalledTimes(1);
    expect(u._bekliyorMu()).toBe(false);
  });

  it("kirli→temiz: fallback poll (interval) ile yenilenir", () => {
    const yenile = vi.fn();
    let kirli = true;
    const u = createSwUpdater({ kirliMi: () => kirli, yenile, aralik: 3000 });
    u.guncellemeGeldi();
    vi.advanceTimersByTime(3000);
    expect(yenile).not.toHaveBeenCalled(); // hâlâ kirli → ertelenmeye devam
    kirli = false;
    vi.advanceTimersByTime(3000);
    expect(yenile).toHaveBeenCalledTimes(1);
  });

  it("birden çok controllerchange → tek reload", () => {
    const yenile = vi.fn();
    const u = createSwUpdater({ kirliMi: () => false, yenile });
    u.guncellemeGeldi();
    u.guncellemeGeldi();
    expect(yenile).toHaveBeenCalledTimes(1);
  });

  it("tekrarDene() güncelleme gelmeden reload TETİKLEMEZ", () => {
    const yenile = vi.fn();
    const u = createSwUpdater({ kirliMi: () => false, yenile });
    u.tekrarDene();
    expect(yenile).not.toHaveBeenCalled();
  });
});
