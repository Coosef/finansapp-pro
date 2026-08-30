// ============================================================
// T2B — pb/pb_hooks/tg_ai_context.js ile KANONİK src/lib finans semantiği arasında PARİTE.
//
// PocketBase Goja, src/lib ESM modüllerini import edemediği için tg_ai_context.js matematiği
// KOPYALAR. Bu "paylaşılan kod" değildir; bu dosya kopyayı kanonik kaynağa BAĞLAR — kanonik
// semantik değişip kopya değişmezse burası kırılır.
//
// Modül CommonJS olduğundan (repo "type":"module") Node loader'ı ile require edilemez;
// kaynak okunup izole bir CJS kabuğunda değerlendirilir (PB'nin yaptığına eşdeğer).
// ============================================================
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { turEtkisi as canonTurEtkisi, TUR } from "./siniftur.js";
import { donemAraligi as canonDonemAraligi, donemde as canonDonemde } from "./finance.js";
import { donemHesap as canonDonemHesap, kategoriDagilim as canonKategoriDagilim } from "./hesapla.js";
import { netVarlik as canonNetVarlik, nakitToplam as canonNakit, yatirimDegeri as canonYatirim,
         hesapVarlikToplam as canonHVar, hesapBorcToplam as canonHBorc, hesapNet as canonHNet } from "./ozet.js";

function pbModulYukle(rel) {
  const yol = fileURLToPath(new URL(rel, import.meta.url));
  const kaynak = readFileSync(yol, "utf8");
  const mod = { exports: {} };
  // PB hook sandbox'ına eşdeğer minimal CJS kabuğu (bu modül require/PB global'i KULLANMAZ).
  new Function("module", "exports", "require", "__hooks", kaynak)(mod, mod.exports, () => {
    throw new Error("tg_ai_context.js require KULLANMAMALI (saf modül olmalı)");
  }, "");
  return mod.exports;
}
const C = pbModulYukle("../../pb/pb_hooks/tg_ai_context.js");

const BUGUN = "2026-08-15";

// Kanonik semantiğin tüm kenarlarını dolaşan zengin fixture.
const FIX = {
  gelirler: [
    { id: "i1", baslik: "Maaş", kategori: "Maaş", miktar: 60000, tarih: "2026-08-01" },
    { id: "i2", baslik: "Faiz", kategori: "Faiz", miktar: 1500, tarih: "2026-08-10" },
    { id: "i3", baslik: "Stopaj", kategori: "Faiz", miktar: 200, tarih: "2026-08-10", tur: TUR.STOPAJ },
    { id: "i4", baslik: "Varlık satışı", kategori: "Diğer", miktar: 5000, tarih: "2026-08-12", tur: TUR.VARLIK_SATIS },
    { id: "i5", baslik: "Geçen ay maaş", kategori: "Maaş", miktar: 58000, tarih: "2026-07-01" },
    { id: "i6", baslik: "Hane transferi", kategori: "Diğer", miktar: 9000, tarih: "2026-08-03", tur: TUR.HANE_TRANSFER },
  ],
  giderler: [
    { id: "e1", baslik: "Migros alışveriş", kategori: "Market", miktar: 4200, tarih: "2026-08-02" },
    { id: "e2", baslik: "Restoran", kategori: "Yeme-İçme", miktar: 1800, tarih: "2026-08-05" },
    { id: "e3", baslik: "İade", kategori: "Market", miktar: 300, tarih: "2026-08-06", tur: TUR.IADE },
    { id: "e4", baslik: "Kira", kategori: "Kira", miktar: 22000, tarih: "2026-08-01" },
    { id: "e5", baslik: "İncelenecek", kategori: "Diğer", miktar: 7777, tarih: "2026-08-07", tur: TUR.INCELE },
    { id: "e6", baslik: "İç transfer", kategori: "Diğer", miktar: 5000, tarih: "2026-08-08", tur: TUR.IC_TRANSFER },
    { id: "e7", baslik: "Verilen borç", kategori: "Diğer", miktar: 2500, tarih: "2026-08-09", tur: TUR.BORC_VERME },
    { id: "e8", baslik: "Geçen ay market", kategori: "Market", miktar: 3900, tarih: "2026-07-14" },
    { id: "e9", baslik: "Kategorisiz", miktar: 640, tarih: "2026-08-11" },
    { id: "e10", baslik: "Hediye verildi", kategori: "Hediye", miktar: 1200, tarih: "2026-08-13", tur: TUR.HEDIYE },
  ],
  abonelikler: [
    { id: "s1", baslik: "Netflix", miktar: 300 },
    { id: "s2", baslik: "Spotify", miktar: 150 },
  ],
  hesaplar: [
    { id: "a1", ad: "Vadesiz", tip: "banka", bakiye: 120000 },
    { id: "a2", ad: "Kredi Kartı", tip: "kart", bakiye: 18000 },
    { id: "a3", ad: "Nakit", tip: "nakit", bakiye: 2500 },
  ],
  yatirimlar: [
    { id: "y1", sembol: "ALTIN", adet: 10, alisFiyati: 3000, guncelFiyat: 3400 },
    { id: "y2", sembol: "USD", adet: 500, alisFiyati: 34 },
  ],
  butceler: { Market: 6000, "Yeme-İçme": 2500, Kira: 25000, Bos: 0 },
  hedefler: [
    { id: "h1", ad: "Acil Fon", tip: "birikim", hedefTutar: 100000, mevcutTutar: 40000 },
    { id: "h2", ad: "Kredi Kapat", tip: "borc", hedefTutar: 50000, mevcutTutar: 12000 },
  ],
  ayarlar: { aiSaglayici: "anthropic", model: "claude-opus-4-8", apiKey: "sk-GIZLI-OLMAMALI", pin: "1234" },
  kategoriHafiza: { migros: "Market" },
  kisiler: [{ id: "k1", ad: "Mustafa Demir", iban: "TR000" }],
};

describe("T2B parite — turEtkisi", () => {
  const turler = [undefined, ...Object.values(TUR)];
  it("her tür ve taban için kanonik ile birebir", () => {
    for (const t of turler) {
      for (const taban of ["gelir", "gider"]) {
        for (const m of [0, 100, -250.5]) {
          const kayit = { miktar: m, ...(t ? { tur: t } : {}) };
          expect(C.turEtkisi(kayit, taban)).toEqual(canonTurEtkisi(kayit, taban));
        }
      }
    }
  });
});

describe("T2B parite — dönem araligi/filtre", () => {
  it("buAy/gecenAy/buYil/tum kanonikle aynı", () => {
    for (const d of ["buAy", "gecenAy", "buYil", "tum"]) {
      for (const g of ["2026-08-15", "2026-01-05", "2026-12-31", "2026-03-01"]) {
        expect(C.donemAraligi(d, g)).toEqual(canonDonemAraligi(d, g));
      }
    }
  });
  it("donemde kanonikle aynı", () => {
    const a = canonDonemAraligi("buAy", BUGUN);
    for (const t of ["2026-07-31", "2026-08-01", "2026-08-31", "2026-09-01", "", undefined]) {
      expect(C.donemde(t, a)).toBe(canonDonemde(t, a));
      expect(C.donemde(t, null)).toBe(canonDonemde(t, null));
    }
  });
});

describe("T2B parite — dönem özeti ve kategori dağılımı", () => {
  it("donemHesap alanları kanonikle birebir", () => {
    for (const d of ["buAy", "gecenAy", "buYil"]) {
      const a = C.donemHesap(FIX, d, BUGUN);
      const b = canonDonemHesap(FIX, d, BUGUN);
      for (const alan of ["gelir", "giderKalem", "aboneAylik", "abone", "giderToplam", "net", "tasarrufOrani"]) {
        expect(`${d}.${alan}=${a[alan]}`).toBe(`${d}.${alan}=${b[alan]}`);
      }
      expect(a.kategoriler).toEqual(b.kategoriler);
    }
  });
  it("kategoriDagilim kanonikle birebir", () => {
    expect(C.kategoriDagilim(FIX.giderler)).toEqual(canonKategoriDagilim(FIX.giderler));
    expect(C.kategoriDagilim([])).toEqual(canonKategoriDagilim([]));
  });
});

describe("T2B parite — net varlık / nakit / yatırım", () => {
  it("ozet.js ile birebir (hesaplı ve hesapsız)", () => {
    const hesapsiz = { ...FIX, hesaplar: [] };
    for (const d of [FIX, hesapsiz, {}]) {
      expect(C.netVarlik(d)).toBe(canonNetVarlik(d));
      expect(C.nakitToplam(d)).toBe(canonNakit(d));
      expect(C.yatirimDegeri(d)).toBe(canonYatirim(d));
      expect(C.hesapVarlikToplam(d)).toBe(canonHVar(d));
      expect(C.hesapBorcToplam(d)).toBe(canonHBorc(d));
      expect(C.hesapNet(d)).toBe(canonHNet(d));
    }
  });
});

describe("T2B — finansContext allow-list ve doğruluk", () => {
  const ctx = C.finansContext(FIX, BUGUN);
  const buAy = canonDonemHesap(FIX, "buAy", BUGUN);
  const gecenAy = canonDonemHesap(FIX, "gecenAy", BUGUN);
  const r2 = (n) => Math.round(n * 100) / 100;

  it("üst seviye anahtarlar TAM olarak allow-list", () => {
    expect(Object.keys(ctx).sort()).toEqual([
      "asOf", "budgets", "cashTotal", "context_truncated", "currency", "currentMonth",
      "expenseByCategory", "goals", "investmentTotal", "netWorth", "previousMonth",
      "subscriptions", "topExpenses",
    ]);
  });

  it("sayılar kanonik matematikle uyumlu", () => {
    expect(ctx.netWorth).toBe(r2(canonNetVarlik(FIX)));
    expect(ctx.cashTotal).toBe(r2(canonNakit(FIX)));
    expect(ctx.investmentTotal).toBe(r2(canonYatirim(FIX)));
    expect(ctx.currentMonth.income).toBe(r2(buAy.gelir));
    expect(ctx.currentMonth.expenses).toBe(r2(buAy.giderToplam));
    expect(ctx.currentMonth.subscriptions).toBe(r2(buAy.abone));
    expect(ctx.currentMonth.net).toBe(r2(buAy.net));
    expect(ctx.currentMonth.savingsRate).toBe(r2(buAy.tasarrufOrani));
    expect(ctx.previousMonth.income).toBe(r2(gecenAy.gelir));
    expect(ctx.previousMonth.expenses).toBe(r2(gecenAy.giderToplam));
  });

  it("expenseByCategory kanonik dağılımı izler", () => {
    expect(ctx.expenseByCategory).toEqual(buAy.kategoriler.slice(0, 12).map((k) => ({ category: k.kategori, amount: r2(k.toplam) })));
  });

  it("bütçeler yalnız limit>0 ve gerçek harcama bu aydan", () => {
    const kat = Object.fromEntries(buAy.kategoriler.map((k) => [k.kategori, k.toplam]));
    expect(ctx.budgets.find((b) => b.category === "Bos")).toBeUndefined();
    const market = ctx.budgets.find((b) => b.category === "Market");
    expect(market.limit).toBe(6000);
    expect(market.actual).toBe(r2(kat.Market));
  });

  it("topExpenses: açıklama YOK, yalnız kategori/tutar/tarih, azalan ve bu ay", () => {
    expect(ctx.topExpenses.length).toBeGreaterThan(0);
    for (const t of ctx.topExpenses) {
      expect(Object.keys(t).sort()).toEqual(["amount", "category", "date"]);
      expect(t.date >= "2026-08-01" && t.date <= "2026-08-31").toBe(true);
    }
    const tutarlar = ctx.topExpenses.map((t) => t.amount);
    expect([...tutarlar].sort((a, b) => b - a)).toEqual(tutarlar);
    // KPI-nötr türler (needs_review / iç-hane transfer / verilen borç) listeye GİRMEZ.
    expect(tutarlar).not.toContain(7777);
    expect(tutarlar).not.toContain(5000);
    expect(tutarlar).not.toContain(2500);
  });

  it("işlem açıklaması / id / ayar / gizli alan serileştirmede YOK", () => {
    const s = JSON.stringify(ctx);
    for (const yasak of ["Migros", "Restoran", "Kira ", "baslik", "sk-GIZLI", "pin", "1234",
                         "kategoriHafiza", "kisiler", "Mustafa", "TR000", "ayarlar", "revision",
                         "e1", "\"id\"", "aiSaglayici", "sembol"]) {
      expect(s.includes(yasak)).toBe(false);
    }
    // Hedef/abonelik ADLARI D6 gereği açıkça İZİNLİ.
    expect(s).toContain("Acil Fon");
    expect(s).toContain("Netflix");
  });

  it("boş findata çökmez", () => {
    const bos = C.finansContext({}, BUGUN);
    expect(bos.netWorth).toBe(0);
    expect(bos.topExpenses).toEqual([]);
    expect(bos.context_truncated).toBe(false);
  });
});

describe("T2B — 8 KiB hard cap", () => {
  it("aşırı büyük findata'da bile sınır aşılmaz ve bayrak set edilir", () => {
    const buyuk = {
      ...FIX,
      giderler: Array.from({ length: 5000 }, (_, i) => ({
        id: "x" + i, baslik: "Çok uzun açıklama ".repeat(10), kategori: "Kat" + (i % 300), miktar: 1000 + i, tarih: "2026-08-0" + (1 + (i % 9)),
      })),
      abonelikler: Array.from({ length: 300 }, (_, i) => ({ baslik: "Abonelik-" + i, miktar: 10 + i })),
      hedefler: Array.from({ length: 200 }, (_, i) => ({ ad: "Hedef-" + i, tip: "birikim", hedefTutar: 1000, mevcutTutar: 10 })),
      butceler: Object.fromEntries(Array.from({ length: 400 }, (_, i) => ["Kat" + i, 500 + i])),
    };
    const ctx = C.finansContext(buyuk, BUGUN);
    const bayt = C.utf8Bayt(JSON.stringify(ctx));
    expect(bayt).toBeLessThanOrEqual(C.LIMIT.CONTEXT_BYTE);
    expect(ctx.topExpenses.length).toBeLessThanOrEqual(C.LIMIT.TOP_GIDER);
    expect(JSON.stringify(ctx).includes("Çok uzun açıklama")).toBe(false);
    // Liste sınırları tek başına 8 KiB'ın ALTINDA kalmaya yetiyor → truncation bayrağı
    // yalnız bir emniyet ağıdır ve burada beklenmez (dürüst iddia).
    expect(ctx.context_truncated).toBe(false);
  });

  it("boyutaSigdir emniyet ağı: sınırı aşan nesnede kırpar ve bayrak koyar", () => {
    const sisirilmis = {
      asOf: "2026-08-15", currency: "TRY", netWorth: 1, cashTotal: 1, investmentTotal: 1,
      currentMonth: { income: 1, expenses: 1, subscriptions: 1, net: 1, savingsRate: 1 },
      previousMonth: { income: 1, expenses: 1, net: 1, savingsRate: 1 },
      expenseByCategory: Array.from({ length: 30 }, (_, i) => ({ category: "K".repeat(200) + i, amount: i })),
      budgets: Array.from({ length: 30 }, (_, i) => ({ category: "B".repeat(200) + i, limit: 1, actual: 1 })),
      goals: Array.from({ length: 30 }, (_, i) => ({ name: "H".repeat(200) + i, type: "birikim", target: 1, current: 1 })),
      subscriptions: Array.from({ length: 30 }, (_, i) => ({ name: "A".repeat(200) + i, monthlyAmount: 1 })),
      topExpenses: Array.from({ length: 30 }, (_, i) => ({ category: "T".repeat(200) + i, amount: 1, date: "2026-08-01" })),
      context_truncated: false,
    };
    expect(C.utf8Bayt(JSON.stringify(sisirilmis))).toBeGreaterThan(C.LIMIT.CONTEXT_BYTE);
    const ctx = C.boyutaSigdir(sisirilmis);
    expect(C.utf8Bayt(JSON.stringify(ctx))).toBeLessThanOrEqual(C.LIMIT.CONTEXT_BYTE);
    expect(ctx.context_truncated).toBe(true);
    // Kırpma sırası: önce topExpenses, sonra subscriptions, goals, budgets, expenseByCategory.
    expect(ctx.topExpenses.length).toBe(0);
  });

  it("liste sınırları uygulanır", () => {
    const cok = {
      giderler: Array.from({ length: 60 }, (_, i) => ({ kategori: "K" + i, miktar: 100 + i, tarih: "2026-08-02" })),
      abonelikler: Array.from({ length: 40 }, (_, i) => ({ baslik: "A" + i, miktar: 5 })),
      hedefler: Array.from({ length: 40 }, (_, i) => ({ ad: "H" + i, tip: "birikim", hedefTutar: 1, mevcutTutar: 0 })),
      butceler: Object.fromEntries(Array.from({ length: 40 }, (_, i) => ["K" + i, 900])),
    };
    const ctx = C.finansContext(cok, BUGUN);
    expect(ctx.expenseByCategory.length).toBeLessThanOrEqual(12);
    expect(ctx.budgets.length).toBeLessThanOrEqual(12);
    expect(ctx.goals.length).toBeLessThanOrEqual(8);
    expect(ctx.subscriptions.length).toBeLessThanOrEqual(12);
    expect(ctx.topExpenses.length).toBeLessThanOrEqual(15);
  });
});

describe("T2B — govdeDogrula sözleşmesi", () => {
  const temel = { telegram_user_id: "123456", update_id: "42", question: "Bu ay ne harcadım?" };
  it("geçerli gövde", () => {
    const v = C.govdeDogrula(temel);
    expect(v.ok).toBe(true);
    expect(v.tgid).toBe("123456");
    expect(v.uid).toBe("42");
    expect(v.history).toEqual([]);
  });
  it("bilinmeyen üst-seviye alan reddedilir", () => {
    expect(C.govdeDogrula({ ...temel, model: "gpt-4o" }).ok).toBe(false);
    expect(C.govdeDogrula({ ...temel, max_tokens: 9999 }).ok).toBe(false);
    expect(C.govdeDogrula({ ...temel, saglayici: "openai" }).ok).toBe(false);
  });
  it("geçersiz tgid / update_id", () => {
    expect(C.govdeDogrula({ ...temel, telegram_user_id: "abc" }).kod).toBe("bad_tgid");
    expect(C.govdeDogrula({ ...temel, update_id: "-1" }).kod).toBe("bad_update_id");
    expect(C.govdeDogrula({ ...temel, update_id: "" }).kod).toBe("bad_update_id");
    expect(C.govdeDogrula({ ...temel, update_id: "1".repeat(20) }).kod).toBe("bad_update_id");
  });
  it("soru sınırları", () => {
    expect(C.govdeDogrula({ ...temel, question: "   " }).kod).toBe("bad_question");
    expect(C.govdeDogrula({ ...temel, question: "é".repeat(500) }).ok).toBe(true);
    expect(C.govdeDogrula({ ...temel, question: "é".repeat(501) }).kod).toBe("bad_question");
  });
  it("history sınırları", () => {
    expect(C.govdeDogrula({ ...temel, history: [{ q: "a", a: "b" }, { q: "c", a: "d" }] }).ok).toBe(true);
    expect(C.govdeDogrula({ ...temel, history: [{ q: "a", a: "b" }, { q: "c", a: "d" }, { q: "e", a: "f" }] }).ok).toBe(false);
    expect(C.govdeDogrula({ ...temel, history: [{ q: "a", a: "b", rol: "x" }] }).ok).toBe(false);
    expect(C.govdeDogrula({ ...temel, history: [{ q: "x".repeat(401), a: "b" }] }).ok).toBe(false);
    expect(C.govdeDogrula({ ...temel, history: "abc" }).ok).toBe(false);
  });
  it("AI-T2-IDEM-HASH-02 aynı istek aynı kanoniği üretir", () => {
    const a = C.hashKanonik("L1", "U1", "1", "2", "soru", [{ q: "a", a: "b" }], "anthropic", "claude-opus-4-8");
    const b = C.hashKanonik("L1", "U1", "1", "2", "soru", [{ q: "a", a: "b" }], "anthropic", "claude-opus-4-8");
    expect(a).toBe(b);
  });

  it("her bağlayıcı girdi hash'i değiştirir (link/user/tgid/update/soru/geçmiş/sağlayıcı/model)", () => {
    const t = ["L1", "U1", "1", "2", "soru", [], "anthropic", "claude-opus-4-8"];
    const taban = C.hashKanonik(...t);
    const varyantlar = [
      ["L2", "U1", "1", "2", "soru", [], "anthropic", "claude-opus-4-8"],
      ["L1", "U2", "1", "2", "soru", [], "anthropic", "claude-opus-4-8"],
      ["L1", "U1", "9", "2", "soru", [], "anthropic", "claude-opus-4-8"],
      ["L1", "U1", "1", "3", "soru", [], "anthropic", "claude-opus-4-8"],
      ["L1", "U1", "1", "2", "başka", [], "anthropic", "claude-opus-4-8"],
      ["L1", "U1", "1", "2", "soru", [{ q: "a", a: "b" }], "anthropic", "claude-opus-4-8"],
      ["L1", "U1", "1", "2", "soru", [], "openai", "claude-opus-4-8"],
      ["L1", "U1", "1", "2", "soru", [], "anthropic", "claude-haiku-4-5"],
    ];
    const hepsi = new Set([taban, ...varyantlar.map((v) => C.hashKanonik(...v))]);
    expect(hepsi.size).toBe(varyantlar.length + 1);
  });

  it("AI-T2-IDEM-HASH-01 kontrol karakteri/satır sonu enjeksiyonu çakışma ÜRETEMEZ", () => {
    // Ayıraç birleştirmede bu çiftler AYNI düz metne katlanırdı.
    const ciftler = [
      [[{ q: "a", a: "b" }], [{ q: "a\u0000b", a: "" }]],
      [[{ q: "a", a: "b" }], [{ q: "a", a: "" }, { q: "b", a: "" }]],
      [[{ q: "a\nb", a: "c" }], [{ q: "a", a: "b\nc" }]],
      [[{ q: "x\u0001y", a: "" }], [{ q: "x", a: "y" }]],
      [[{ q: '", "', a: "" }], [{ q: "", a: "" }]],
    ];
    for (const [h1, h2] of ciftler) {
      const a = C.hashKanonik("L", "U", "1", "2", "s", h1, "anthropic", "m");
      const b = C.hashKanonik("L", "U", "1", "2", "s", h2, "anthropic", "m");
      expect(`${JSON.stringify(h1)} vs ${JSON.stringify(h2)}`).toBe(`${JSON.stringify(h1)} vs ${JSON.stringify(h2)}`);
      expect(a === b).toBe(false);
    }
    // Soru metnindeki enjeksiyon da geçmişe/sağlayıcıya sızamaz.
    const s1 = C.hashKanonik("L", "U", "1", "2", 'x", "openai', [], "anthropic", "m");
    const s2 = C.hashKanonik("L", "U", "1", "2", "x", [], "openai", "m");
    expect(s1 === s2).toBe(false);
  });

  it("kanonik biçim geçerli JSON dizisidir ve sürüm etiketi taşır", () => {
    const k = C.hashKanonik("L", "U", "12", "34", "soru", [{ q: "a", a: "b" }], "gemini", "gemini-2.5-flash");
    const dizi = JSON.parse(k);
    expect(Array.isArray(dizi)).toBe(true);
    expect(dizi[0]).toBe("t2b-v2");
    expect(dizi.length).toBe(9);
    expect(dizi[6]).toEqual([["a", "b"]]);
  });
});
