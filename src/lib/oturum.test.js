import { describe, it, expect, beforeEach } from "vitest";
import {
  oturumBaslat, oturumSurdur, oturumDokun, oturumTemizle, oturumDurum,
  IDLE_VARSAYILAN_DK, MUTLAK_GUN,
} from "./oturum.js";

const DK = 60 * 1000;
const GUN = 24 * 60 * 60 * 1000;
const T0 = 1_700_000_000_000; // sabit sahte saat (Date.now kullanılmaz)

beforeEach(() => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
});

describe("oturum zaman aşımı", () => {
  it("oturumBaslat basladi ve sonHareket'i now'a kurar", () => {
    const s = oturumBaslat(T0);
    expect(s).toEqual({ basladi: T0, sonHareket: T0 });
  });

  it("başlatınca geçerli ve kalanMs ~ idle penceresi", () => {
    oturumBaslat(T0);
    const d = oturumDurum(IDLE_VARSAYILAN_DK, T0 + 5 * DK);
    expect(d.gecerli).toBe(true);
    expect(d.sebep).toBe(null);
    expect(d.kalanMs).toBe((IDLE_VARSAYILAN_DK - 5) * DK);
  });

  it("hareketsizlik penceresi aşılınca idle sebebiyle geçersiz", () => {
    oturumBaslat(T0);
    const d = oturumDurum(30, T0 + 31 * DK);
    expect(d.gecerli).toBe(false);
    expect(d.sebep).toBe("idle");
  });

  it("oturumDokun hareketsizlik sayacını sıfırlar", () => {
    oturumBaslat(T0);
    oturumDokun(T0 + 29 * DK);           // pencere dolmadan dokun
    const d = oturumDurum(30, T0 + 45 * DK); // dokunuştan 16 dk sonra → hâlâ geçerli
    expect(d.gecerli).toBe(true);
  });

  it("mutlak tavan aşılınca aktif olsa bile mutlak sebebiyle geçersiz", () => {
    oturumBaslat(T0);
    // sürekli dokunulmuş gibi sonHareket güncel olsa da basladi eski
    oturumDokun(T0 + MUTLAK_GUN * GUN + DK);
    const d = oturumDurum(30, T0 + MUTLAK_GUN * GUN + DK);
    expect(d.gecerli).toBe(false);
    expect(d.sebep).toBe("mutlak");
  });

  it("idleDk<=0 hareketsizlik zaman aşımını kapatır (mutlak yürür)", () => {
    oturumBaslat(T0);
    const d = oturumDurum(0, T0 + 10 * GUN); // idle kapalı ama 10 gün > 7 gün mutlak
    expect(d.gecerli).toBe(false);
    expect(d.sebep).toBe("mutlak");
    const d2 = oturumDurum(0, T0 + 2 * GUN); // idle kapalı, mutlak içinde → geçerli
    expect(d2.gecerli).toBe(true);
  });

  it("oturumSurdur basladi'yı korur, sonHareket'i tazeler", () => {
    oturumBaslat(T0);
    const s = oturumSurdur(T0 + 3 * DK);
    expect(s.basladi).toBe(T0);
    expect(s.sonHareket).toBe(T0 + 3 * DK);
  });

  it("oturum yoksa durum 'yok' döner; temizle geçersiz yapar", () => {
    expect(oturumDurum(30, T0).sebep).toBe("yok");
    oturumBaslat(T0);
    oturumTemizle();
    expect(oturumDurum(30, T0).gecerli).toBe(false);
    expect(oturumDurum(30, T0).sebep).toBe("yok");
  });
});
