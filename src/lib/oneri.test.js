import { describe, it, expect, vi } from "vitest";
import { turOner, oneriBekleyen, sanitizeAciklama, turOnerAI, topluSinifla, geriAlSinifla, aiAdaylari, aiContext, aiGuvenBand, aiKabulUygula, gecmisKararlar } from "./oneri.js";
import { TUR } from "./siniftur.js";
import { donemHesap } from "./hesapla.js";

// ============================================================
// Sınıflandırma öneri motoru (v1.5.0).
// Amaç: her işlemi etiketlemek DEĞİL — KPI'yı bozabilecek / finansal anlamı
// düz gelir-gider'den FARKLI olan hareketleri bulup ÖNERMEK. Öneri asla
// otomatik uygulanmaz; ham kayıt (yön/tutar/başlık) değişmez.
// Örnekler gerçek production başlıklarından türetildi.
// ============================================================

const HANE = [{ id: "k1", ad: "Aşkım", hane: true, anahtarlar: ["helin ergüzel"] }];
const HESAPLAR = [
  { id: "h1", ad: "Enpara ••6523", son4: "6523", banka: "Enpara" },
  { id: "h2", ad: "Axess ••7189", son4: "7189", banka: "Axess" },
];

describe("turOner — stopaj (en yüksek değerli kural)", () => {
  it("'Vergi Kesintisi Faiz geliri' → stopaj (yüksek güven)", () => {
    const r = turOner({ baslik: "Vergi Kesintisi Faiz geliri vergi kesintisi", _yon: "gider", kategori: "Faiz/Yatırım" });
    expect(r?.tur).toBe(TUR.STOPAJ);
    expect(r?.guven).toBe("yuksek");
  });
});

describe("turOner — zaten doğru / sıradan kayıtlara öneri YOK", () => {
  it("gerçek faiz geliri (brüt) → null (doğru gelir, dokunma)", () => {
    expect(turOner({ baslik: "Faiz Geliri %30 faiz oranı ile 1 günlük brüt faiz geliri", _yon: "gelir", kategori: "Faiz/Yatırım" })).toBeNull();
  });
  it("sıradan market harcaması → null", () => {
    expect(turOner({ baslik: "Migros", _yon: "gider", kategori: "Market" })).toBeNull();
  });
  it("taksitli sıradan alışveriş → null", () => {
    expect(turOner({ baslik: "N11 ONLINE ALISVERIS (taksit 3/9)", _yon: "gider", kategori: "Teknoloji", kaynak: "taksit" })).toBeNull();
  });
  it("kredi kartı dönem faizi (gerçek gider) → null", () => {
    expect(turOner({ baslik: "Toplam Dönem Faizi", _yon: "gider", kategori: "Faiz/Yatırım" })).toBeNull();
  });
});

describe("turOner — hane transferi yalnız kisiBul kanıtıyla", () => {
  it("'Giden Transfer, Helin Ergüzel, EFT' + hane eşleşmesi → hane_transfer", () => {
    const r = turOner({ baslik: "Giden Transfer, Helin Ergüzel, Bireysel Ödeme, EFT", _yon: "gider", kategori: "Gönderim" }, HANE, HESAPLAR);
    expect(r?.tur).toBe(TUR.HANE_TRANSFER);
    expect(r?.neden).toMatch(/Aşkım/);
  });

  // FALSE-POSITIVE: transfer/EFT kelimesi var ama hane kişisi DEĞİL + kira → öneri hane olamaz
  it("'Giden Transfer, Mustafa Demir, Ev kirası' (hane değil) → hane_transfer ÖNERME", () => {
    const r = turOner({ baslik: "Giden Transfer, Mustafa Demir, Ev kirası 15 Mart - 15", _yon: "gider", kategori: "Gönderim" }, HANE, HESAPLAR);
    expect(r?.tur).not.toBe(TUR.HANE_TRANSFER);
  });

  // FALSE-POSITIVE: EFT/transfer kelimesi + tanınmayan kişi → düşük kanıt → null (tahmin etme)
  it("tanınmayan karşı tarafa giden transfer → null (guess yok)", () => {
    expect(turOner({ baslik: "Giden Transfer, Muzaffer Saibrasul, Bireysel Ödeme, EFT", _yon: "gider", kategori: "Gönderim" }, HANE, HESAPLAR)).toBeNull();
  });
});

describe("turOner — iç transfer (kendi hesap eşleşmesi)", () => {
  it("kendi hesabına (son4 eşleşmesi) transfer → internal_transfer", () => {
    const r = turOner({ baslik: "Hesaplar arası virman Enpara ••6523", _yon: "gider", kategori: "Gönderim" }, HANE, HESAPLAR);
    expect(r?.tur).toBe(TUR.IC_TRANSFER);
  });
});

describe("turOner — false-positive korumaları", () => {
  it("'eft' bir kelimenin İÇİNDE (NEFTUNE) → transfer tetiklemez → null", () => {
    expect(turOner({ baslik: "NEFTUNE KOZMETIK ANTALYA", _yon: "gider", kategori: "Giyim" }, HANE, HESAPLAR)).toBeNull();
  });
  it("stopaj olmayan vergi (Motorlu Taşıtlar Vergisi) → stopaj ÖNERME (null)", () => {
    const r = turOner({ baslik: "Motorlu Taşıtlar Vergisi MTV 1. taksit", _yon: "gider", kategori: "Vergi/Resmi" }, HANE, HESAPLAR);
    expect(r?.tur).not.toBe(TUR.STOPAJ);
  });
  it("merchant/PSP içeren transfer (PAYTR…Helin Ergüzel) → hane ÖNERME (kart harcaması olabilir)", () => {
    const r = turOner({ baslik: "PAYTR/BELEKDOGAFLOWERS ANTALYA TR Giden Transfer, Helin Ergüzel, Bireysel", _yon: "gider", kategori: "Gönderim" }, HANE, HESAPLAR);
    expect(r?.tur).not.toBe(TUR.HANE_TRANSFER);
  });
  it("giden 'iade bedeli' (para ÇIKIŞI) → gelir-iadesi (IADE) ÖNERME", () => {
    // IADE geliri azaltır; yalnız GELEN parada anlamlı. Giden 'iade' income-iade değildir.
    const r = turOner({ baslik: "işlemi iade bedeli Giden Transfer, Barış Öztürk", _yon: "gider", kategori: "Gönderim" }, HANE, HESAPLAR);
    expect(r?.tur).not.toBe(TUR.IADE);
  });
});

describe("turOner — provenance / override koruması", () => {
  it("zaten sınıflı kayıt (tur set) → null (yeniden önerme)", () => {
    expect(turOner({ baslik: "Vergi Kesintisi Faiz geliri", _yon: "gider", tur: TUR.STOPAJ, turKaynak: "user" })).toBeNull();
  });
});

describe("oneriBekleyen — gruplama + override koruması", () => {
  const findata = {
    kisiler: HANE,
    hesaplar: HESAPLAR,
    gelirler: [
      { id: "gl1", baslik: "Faiz Geliri %30 brüt faiz geliri", miktar: 500, kategori: "Faiz/Yatırım" }, // doğru gelir → öneri yok
    ],
    giderler: [
      { id: "s1", baslik: "Vergi Kesintisi Faiz geliri", miktar: 100, kategori: "Faiz/Yatırım" },
      { id: "s2", baslik: "Vergi Kesintisi Faiz geliri", miktar: 150, kategori: "Faiz/Yatırım" },
      { id: "h1", baslik: "Giden Transfer, Helin Ergüzel, EFT", miktar: 9000, kategori: "Gönderim" },
      { id: "m1", baslik: "Migros", miktar: 300, kategori: "Market" }, // öneri yok
      { id: "u1", baslik: "Vergi Kesintisi Faiz geliri", miktar: 999, kategori: "Faiz/Yatırım", tur: TUR.GIDER, turKaynak: "user" }, // kullanıcı sınıflamış → dokunma
    ],
  };
  it("untagged önerileri türe göre gruplar, tutarı toplar", () => {
    const { gruplar, toplamAdet } = oneriBekleyen(findata);
    const stopaj = gruplar.find((g) => g.tur === TUR.STOPAJ);
    expect(stopaj.adet).toBe(2);
    expect(stopaj.toplam).toBe(250);
    expect(gruplar.find((g) => g.tur === TUR.HANE_TRANSFER).adet).toBe(1);
    expect(toplamAdet).toBe(3); // 2 stopaj + 1 hane (migros ve faiz-geliri önerilmez)
  });
  it("kullanıcı-sınıflı kayıt (turKaynak:user) hiç önerilmez (override korunur)", () => {
    const { gruplar } = oneriBekleyen(findata);
    const hepsi = gruplar.flatMap((g) => g.kayitlar.map((k) => k.id));
    expect(hepsi).not.toContain("u1");
  });
});

describe("topluSinifla / geriAlSinifla — provenance + batch undo", () => {
  const fd = { gelirler: [], giderler: [{ id: "a", baslik: "x", miktar: 1 }, { id: "b", baslik: "y", miktar: 2 }] };
  it("öneri kayıtlarını _oneriTur + turKaynak ile uygular, diğerine dokunmaz", () => {
    const { data } = topluSinifla(fd, [{ id: "a", _yon: "gider", _oneriTur: TUR.STOPAJ }], "rule");
    expect(data.giderler.find((x) => x.id === "a").tur).toBe(TUR.STOPAJ);
    expect(data.giderler.find((x) => x.id === "a").turKaynak).toBe("rule");
    expect(data.giderler.find((x) => x.id === "b").tur).toBeUndefined();
  });
  it("geriAl tokeni ile toplu sınıflama tam geri alınır (untagged'e döner)", () => {
    const { data, geriAl } = topluSinifla(fd, [{ id: "a", _yon: "gider", _oneriTur: TUR.STOPAJ }], "rule");
    const geri = geriAlSinifla(data, geriAl);
    expect(geri.giderler.find((x) => x.id === "a").tur).toBeUndefined();
    expect(geri.giderler.find((x) => x.id === "a").turKaynak).toBeUndefined();
  });
});

describe("sanitizeAciklama — AI'a göndermeden PII temizliği", () => {
  it("IBAN / kart / e-posta / telefon maskelenir", () => {
    const s = sanitizeAciklama("Havale TR33 0006 1005 1978 6457 8413 26 kart 4242 4242 4242 4242 mail a@b.com tel 0532 111 22 33");
    expect(s).not.toMatch(/TR\d{2}\s?\d{4}/);
    expect(s).not.toMatch(/4242\s?4242/);
    expect(s).not.toMatch(/a@b\.com/);
    expect(s).not.toMatch(/0532/);
  });
});

describe("turOnerAI — yalnız öneri, PII sanitize (Increment 3 schema)", () => {
  it("suggestedTur şemasını parse eder + girdiyi sanitize eder + suggestionSource=ai", async () => {
    const spy = vi.fn(async () => JSON.stringify([{ id: "x1", suggestedTur: TUR.HANE_TRANSFER, reason: "test", evidence: ["e"] }]));
    const kayitlar = [{ id: "x1", baslik: "Giden Transfer TR33 0006 1005 1978 6457 8413 26", _yon: "gider" }];
    const out = await turOnerAI(kayitlar, spy);
    expect(out[0].suggestedTur).toBe(TUR.HANE_TRANSFER);
    expect(out[0].suggestionSource).toBe("ai");
    const gonderilen = JSON.stringify(spy.mock.calls[0][0]);
    expect(gonderilen).not.toMatch(/TR33\s?0006/);
  });
});

describe("aiAdaylari — yalnız unresolved (deterministik/user/final hariç)", () => {
  const findata = {
    kisiler: [], hesaplar: [], gelirler: [],
    giderler: [
      { id: "a", baslik: "Belirsiz odeme XYZ", miktar: 100 },                       // untagged, turOner null → aday
      { id: "b", baslik: "Vergi Kesintisi Faiz geliri", miktar: 5 },                 // turOner→stopaj → hariç
      { id: "c", baslik: "Migros", miktar: 200, tur: TUR.GIDER, turKaynak: "user" }, // user final → hariç
      { id: "d", baslik: "Bilinmeyen EFT", miktar: 300, tur: TUR.INCELE },           // needs_review → aday
      { id: "e", baslik: "Kira", miktar: 400, tur: TUR.GIDER, turKaynak: "rule" },   // rule final → hariç
    ],
  };
  it("untagged-unresolved + needs_review aday; deterministik/user/final elenir", () => {
    expect(aiAdaylari(findata).map((x) => x.id).sort()).toEqual(["a", "d"]);
  });
  it("kesin merchant'lı sıradan alışveriş ve net faiz geliri AI adayı DEĞİL (belirsiz değil)", () => {
    const fd = {
      kisiler: [], hesaplar: [],
      gelirler: [{ id: "faiz", baslik: "Faiz Geliri %30 faiz oranı ile 1 günlük brüt faiz geliri", miktar: 5 }],
      giderler: [
        { id: "mig", baslik: "MIGROS 5M ANTALYA", miktar: 100 },                      // kesin merchant → sıradan
        { id: "trf", baslik: "Gelen Transfer, Beste Ray, Bireysel Ödeme", miktar: 800 }, // merchantsız transfer → belirsiz
      ],
    };
    const ids = aiAdaylari(fd).map((x) => x.id);
    expect(ids).not.toContain("faiz");
    expect(ids).not.toContain("mig");
    expect(ids).toContain("trf");
  });
});

describe("aiContext — structured + sanitized + merchant/PSP", () => {
  it("PSP≠merchant + IBAN sanitize + direction/amount", () => {
    const c = aiContext({ id: "x", _yon: "gider", baslik: "IYZICO/amazon.com.tr TR33 0006 1005 1978 6457 8413 26", miktar: 1200, kategori: "Teknoloji" });
    expect(c.direction).toBe("outgoing");
    expect(c.amount).toBe(1200);
    expect(c.psp).toBe("IYZICO");
    expect(c.merchant).toBe("Amazon");
    expect(c.description).not.toMatch(/TR33\s?0006/);
  });
  it("merchantOverride context olarak kullanılır (AI değiştiremez)", () => {
    expect(aiContext({ id: "y", _yon: "gider", baslik: "ZZZ 999", miktar: 10, merchantOverride: "Özel" }).merchant).toBe("Özel");
  });
});

describe("sanitizeAciklama — genişletilmiş PII (TC, banka ref)", () => {
  it("11-hane TC ve uzun referans no maskelenir", () => {
    const s = sanitizeAciklama("TC 12345678901 sorgu no 4298597168 tutar");
    expect(s).not.toMatch(/\b\d{11}\b/);
    expect(s).not.toMatch(/4298597168/);
  });
});

describe("turOnerAI — bounded batch + strict schema + graceful", () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: "r" + i, _yon: "gider", baslik: "X" + i, miktar: 1 }));
  it("bounded batch: 25 kayıt / batchSize 10 → 3 çağrı", async () => {
    const spy = vi.fn(async () => "[]");
    await turOnerAI(mk(25), spy, { batchSize: 10 });
    expect(spy.mock.calls.length).toBe(3);
  });
  it("geçerli enum kalır, bilinmeyen enum reddedilir", async () => {
    const spy = vi.fn(async () => JSON.stringify([
      { id: "r0", suggestedTur: TUR.GIDER, reason: "ok", evidence: ["x"] },
      { id: "r1", suggestedTur: "uydurma_tur", reason: "no" },
    ]));
    const out = await turOnerAI(mk(2), spy, { batchSize: 10 });
    expect(out.map((o) => o.id)).toEqual(["r0"]);
  });
  it("invalid JSON → [] (batch atlanır, throw yok)", async () => {
    expect(await turOnerAI(mk(2), vi.fn(async () => "bu json değil"))).toEqual([]);
  });
  it("aiCagir throw (timeout/rate-limit/key-yok) → [] (retry storm yok: batch başına tek deneme)", async () => {
    const spy = vi.fn(async () => { throw new Error("429"); });
    expect(await turOnerAI(mk(2), spy)).toEqual([]);
    expect(spy.mock.calls.length).toBe(1);
  });
  it("AI null response → []", async () => {
    expect(await turOnerAI(mk(1), vi.fn(async () => "null"))).toEqual([]);
  });
  it("input kayıtları mutate edilmez", async () => {
    const cands = mk(1);
    await turOnerAI(cands, vi.fn(async () => JSON.stringify([{ id: "r0", suggestedTur: TUR.GIDER }])));
    expect(cands[0].tur).toBeUndefined();
  });
});

describe("gecmisKararlar — kullanıcı kararlarından learning seed", () => {
  it("kullanıcı/AI-kabul sınıflı kayıtlardan {merchant, tur} çıkarır; untagged hariç", () => {
    const fd = {
      gelirler: [],
      giderler: [
        { id: "1", baslik: "MIGROS 5M ANTALYA", miktar: 100, tur: TUR.GIDER, turKaynak: "user" },
        { id: "2", baslik: "Belirsiz odeme", miktar: 50 },
        { id: "3", baslik: "TRENDYOL", miktar: 20, tur: TUR.IADE, acceptedSuggestionSource: "ai" },
      ],
    };
    const g = gecmisKararlar(fd);
    expect(g).toContainEqual({ merchant: "Migros", tur: TUR.GIDER });
    expect(g).toContainEqual({ merchant: "Trendyol", tur: TUR.IADE });
    expect(g.length).toBe(2);
  });
});

describe("aiGuvenBand — app-side kanıt (model self-confidence DEĞİL)", () => {
  it("merchant high + önceki kullanıcı kararı → Yüksek", () => {
    expect(aiGuvenBand({ suggestedTur: TUR.GIDER, evidence: ["a", "b"] }, { merchant: "Amazon", merchantConfidence: "high" }, [{ merchant: "Amazon", tur: TUR.GIDER }])).toBe("Yüksek");
  });
  it("yalnız zayıf merchant → Orta", () => {
    expect(aiGuvenBand({ suggestedTur: TUR.GIDER, evidence: [] }, { merchant: "X", merchantConfidence: "medium" }, [])).toBe("Orta");
  });
  it("kanıt yok → Düşük (model'in kendi %99'u sayılmaz)", () => {
    expect(aiGuvenBand({ suggestedTur: TUR.GIDER, evidence: [], modelConfidence: 0.99 }, { merchant: null }, [])).toBe("Düşük");
  });
});

describe("aiKabulUygula — provenance + KPI yalnız kabulden sonra + raw/override korunur", () => {
  const BUGUN = "2026-08-16";
  const findata = { gelirler: [], giderler: [{ id: "a", baslik: "Bilinmeyen EFT", miktar: 100, merchantOverride: "Özel", tarih: "2026-08-01" }] };
  it("kabul öncesi KPI değişmez (suggestion ayrı state)", () => {
    expect(donemHesap(findata, "tum", BUGUN).giderToplam).toBe(100);
  });
  it("kabul → tur + provenance; ham/override korunur; KPI yalnız kabulden sonra değişir", () => {
    const after = aiKabulUygula(findata, [{ id: "a", yon: "gider", tur: TUR.IC_TRANSFER }]);
    const r = after.giderler[0];
    expect(r.tur).toBe(TUR.IC_TRANSFER);
    expect(r.turKaynak).toBe("user");
    expect(r.acceptedSuggestionSource).toBe("ai");
    expect(r.baslik).toBe("Bilinmeyen EFT");
    expect(r.merchantOverride).toBe("Özel");
    expect(r.miktar).toBe(100);
    expect(donemHesap(after, "tum", BUGUN).giderToplam).toBe(0);
  });
});
