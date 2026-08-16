import { describe, it, expect } from "vitest";
import { merchantCoz, merchantKuralUret, benzerAdaylar } from "./merchant.js";
import { donemHesap } from "./hesapla.js";

// ============================================================
// Merchant normalization & memory (Increment 2) — saf enrichment.
// INVARYANT: ham baslik/rawDescription ASLA değişmez; merchant KPI'yı etkilemez
// (0 TL). Precedence: override > user_memory > alias/high > format/medium >
// candidate(low, otomatik değil) > null. PSP ≠ merchant.
// Örnekler gerçek production başlıklarından.
// ============================================================

describe("merchantCoz — alias (kesin) yüksek güven", () => {
  it("MIGROS varyasyonları tek merchant + aynı key", () => {
    const a = merchantCoz("MIGROS 5M ANTALYA");
    const b = merchantCoz("MIGROS SANAL MARKET");
    const c = merchantCoz("MIGROS #1234");
    expect(a.merchant).toBe("Migros");
    expect(a.merchantConfidence).toBe("high");
    expect(a.merchantSource).toBe("alias_exact");
    expect(new Set([a.merchantKey, b.merchantKey, c.merchantKey]).size).toBe(1);
  });
  it("case + punctuation farkı önemsiz", () => {
    expect(merchantCoz("migros ticaret a.s").merchant).toBe("Migros");
  });
  it("aynı merchant farklı store ID → aynı key", () => {
    expect(merchantCoz("MIGROS #1234").merchantKey).toBe(merchantCoz("MIGROS 9987 ANTALYA").merchantKey);
  });
});

describe("merchantCoz — PSP ≠ merchant", () => {
  it("IYZICO/amazon.com.tr → psp=IYZICO, merchant=Amazon", () => {
    const r = merchantCoz("IYZICO/amazon.com.tr");
    expect(r.psp).toBe("IYZICO");
    expect(r.merchant).toBe("Amazon");
    expect(r.merchantSource).not.toBe(null);
  });
  it("PAYTR ÖD/XENONSMART → psp=PAYTR, merchant PAYTR DEĞİL", () => {
    const r = merchantCoz("PAYTR ÖD/XENONSMART");
    expect(r.psp).toBe("PAYTR");
    expect((r.merchant || "").toUpperCase()).not.toBe("PAYTR");
    expect((r.merchant || "").toUpperCase()).toContain("XENON");
  });
  it("GOOGLE *YOUTUBE ve GOOGLE *GOOGLE ONE tek 'Google'a birleşmez", () => {
    const yt = merchantCoz("GOOGLE *YOUTUBE");
    const one = merchantCoz("GOOGLE *GOOGLE ONE");
    expect(yt.psp).toBe("GOOGLE");
    expect(one.psp).toBe("GOOGLE");
    expect(yt.merchantKey).not.toBe(one.merchantKey);
    expect((yt.merchant || "").toLowerCase()).toContain("youtube");
  });
});

describe("merchantCoz — transfer/konum gürültüsü merchant'a sızmaz", () => {
  it("PSP merchant'ında 'Giden' sızmaz (Belekdogaflowers)", () => {
    const r = merchantCoz("PAYTR/BELEKDOGAFLOWERS ANTALYA TR Giden Transfer, Helin Ergüzel");
    expect(r.psp).toBe("PAYTR");
    expect((r.merchant || "").toLowerCase()).toContain("belekdogaflowers");
    expect((r.merchant || "").toLowerCase()).not.toContain("giden");
  });
  it("konum eki aynı merchant'ı iki key'e bölmez (YouTubePremium LONDON = YouTubePremium)", () => {
    expect(merchantCoz("GOOGLE *YouTubePremium").merchantKey).toBe(merchantCoz("GOOGLE *YouTubePremium LONDON").merchantKey);
  });
});

describe("merchantCoz — collision koruması (leading-token birleştirme YOK)", () => {
  it("ANTALYA TR KOD-ERDEM PETROL ≠ ANTALYA TR KOD-A101 (aynı 'Antalya'ya düşmez)", () => {
    const erdem = merchantCoz("ANTALYA TR Diğer, 000000000491469-ERDEM ANTALYA PETROL");
    const a101 = merchantCoz("ANTALYA TR Diğer, 1802149917 -9959 I568 A101 ATA PARK");
    expect(erdem.merchantKey).not.toBe(a101.merchantKey);
    expect((erdem.merchantKey || "")).not.toBe("antalya");
    expect((a101.merchantKey || "")).not.toBe("antalya");
  });
});

describe("merchantCoz — merchant OLMAYAN kayıtlar → null", () => {
  it("faiz geliri → merchant null", () => {
    expect(merchantCoz("Faiz Geliri %30 faiz oranı ile 1 günlük brüt faiz geliri").merchant).toBeNull();
  });
  it("kişi transferi (Ev kirası) → merchant null", () => {
    expect(merchantCoz("Giden Transfer, Mustafa Demir, Ev kirası 15 Mart - 15").merchant).toBeNull();
  });
  it("vergi kesintisi → merchant null", () => {
    expect(merchantCoz("Vergi Kesintisi Faiz geliri vergi kesintisi").merchant).toBeNull();
  });
});

describe("merchantCoz — düşük güven merchant DEĞİL, candidate", () => {
  it("belirsiz açıklama → merchant null, merchantCandidate dolu, confidence low", () => {
    const r = merchantCoz("ZORLU 4471 REF");
    expect(r.merchant).toBeNull();
    expect(r.merchantCandidate).toBeTruthy();
    expect(r.merchantConfidence).toBe("low");
  });
});

describe("merchantCoz — precedence (override > memory > derived)", () => {
  it("record override motoru ezer (user_override, high)", () => {
    const r = merchantCoz("TRendyol*934294", [{ anahtar: "trendyol", tip: "contains", merchant: "BAŞKA", source: "user" }], "Trendyol");
    expect(r.merchant).toBe("Trendyol");
    expect(r.merchantSource).toBe("user_override");
    expect(r.merchantConfidence).toBe("high");
  });
  it("user memory derived'ı ezer (user_memory)", () => {
    const hafiza = [{ anahtar: "zzz market", tip: "contains", merchant: "Özel Bakkal", source: "user" }];
    const r = merchantCoz("ZZZ MARKET 999 X", hafiza);
    expect(r.merchant).toBe("Özel Bakkal");
    expect(r.merchantSource).toBe("user_memory");
  });
  it("memory silinince derived sonuca döner (memory yok → memory değeri yok)", () => {
    const r = merchantCoz("ZZZ MARKET 999 X", []);
    expect(r.merchant).not.toBe("Özel Bakkal");
  });
});

describe("merchant memory — kontrollü kapsam", () => {
  it("merchantKuralUret varsayılan dar kapsam (exact)", () => {
    const k = merchantKuralUret("TRendyol*934294", "Trendyol");
    expect(k.tip).toBe("exact");
    expect(k.merchant).toBe("Trendyol");
    expect(k.source).toBe("user");
    expect(typeof k.anahtar).toBe("string");
  });
  it("benzerAdaylar 'benzerlere uygula' önizlemesi — etkilenecek kayıtları döner (ham görünür)", () => {
    const kayitlar = [
      { id: "1", baslik: "MIGROS 5M ANTALYA" },
      { id: "2", baslik: "MIGROS SANAL MARKET" },
      { id: "3", baslik: "BIM A.S. 123" },
    ];
    const kural = { anahtar: "migros", tip: "contains", merchant: "Migros", source: "user" };
    const adaylar = benzerAdaylar(kayitlar, kural);
    expect(adaylar.map((x) => x.id).sort()).toEqual(["1", "2"]);
    expect(adaylar[0].baslik).toBeTruthy(); // ham açıklama önizlemede görünür
  });
});

describe("INVARYANT — ham değişmez + KPI 0 TL etki", () => {
  it("merchantCoz ham baslik'i döndürür ve mutasyona uğratmaz", () => {
    const raw = "MIGROS 5M ANTALYA";
    const r = merchantCoz(raw);
    expect(r.rawDescription).toBe(raw);
  });
  it("merchantOverride eklenmiş kayıtlarla donemHesap birebir AYNI (0 TL etki)", () => {
    const base = {
      gelirler: [{ id: "g1", baslik: "MIGROS", miktar: 5000, tarih: "2026-08-01" }],
      giderler: [{ id: "e1", baslik: "IYZICO/amazon.com.tr", miktar: 1200, kategori: "Teknoloji", tarih: "2026-08-03" }],
    };
    const oncesi = donemHesap(base, "tum", "2026-08-15");
    // merchant enrichment: yalnız merchantOverride ekle (KPI alanlarına dokunma)
    const zengin = {
      ...base,
      giderler: base.giderler.map((x) => ({ ...x, merchantOverride: "Amazon" })),
    };
    const sonrasi = donemHesap(zengin, "tum", "2026-08-15");
    expect(sonrasi.gelir).toBe(oncesi.gelir);
    expect(sonrasi.giderToplam).toBe(oncesi.giderToplam);
    expect(sonrasi.net).toBe(oncesi.net);
  });
});
