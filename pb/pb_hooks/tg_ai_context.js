// ============================================================
// Telegram AI — SANITIZE finans context üreticisi (T2B). SAF CommonJS modül:
// PB global'i ($app/$security/$os/DateTime) KULLANMAZ → hem PocketBase Goja hook'ları
// hem de Node (vitest parity testi) tarafından require edilebilir.
//
// NEDEN KOPYA MATEMATİK: PocketBase Goja, src/lib/*.js ESM modüllerini import EDEMEZ
// (import/export sözdizimi + relatif çözümleme hook sandbox'ında çalışmaz). Bu yüzden
// src/lib/{siniftur,finance,hesapla,ozet}.js semantiği burada BİREBİR yeniden yazılmıştır.
// Bu "paylaşılan kod" DEĞİLDİR ve öyle sunulmaz — src/lib kanonik kaynaktır; buradaki her
// hesaplama src/lib karşılığına karşı PARITE TESTİ ile bağlanır (bkz. pb/tg_ai_context.parity.test.js).
// Kanonik semantik değişirse parite testi kırılır.
//
// GİZLİLİK: Çıktı ALLOW-LIST'tir. users.data ham dönmez. Kayıt/PB id'leri, Telegram id,
// chat id, e-posta, ilişki id'leri, CAS revision, hane davet kodu, ayarlar nesnesi, AI
// anahtarları ve İŞLEM AÇIKLAMALARI (baslik/merchant metni) ASLA çıktıya girmez.
// ============================================================

// ---- Sınırlar (sunucu sabitleri; istemci etkileyemez) ----
const LIMIT = {
  SORU: 500,            // Unicode code point
  HISTORY_CIFT: 2,
  HISTORY_ALAN: 400,    // q ve a için ayrı ayrı
  CONTEXT_BYTE: 8192,   // 8 KiB serileştirilmiş JSON — HARD CAP
  KATEGORI: 12,
  BUTCE: 12,
  HEDEF: 8,
  ABONELIK: 12,
  TOP_GIDER: 15,
  CEVAP: 3000,          // Unicode code point
};

// ---- Unicode-güvenli uzunluk/kırpma (surrogate bölmez) ----
function cpUzunluk(s) { return Array.from(String(s == null ? "" : s)).length; }
function cpKirp(s, max) {
  const a = Array.from(String(s == null ? "" : s));
  return a.length <= max ? String(s == null ? "" : s) : a.slice(0, max).join("");
}
const yuvarla2 = (n) => Math.round((+n || 0) * 100) / 100;

// UTF-8 bayt uzunluğu — Buffer/TextEncoder KULLANMAZ (PocketBase Goja'da yok).
function utf8Bayt(s) {
  const str = String(s == null ? "" : s);
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) { n += 4; i++; } // surrogate çifti
    else n += 3;
  }
  return n;
}

// ============================================================
// KANONİK MATEMATİK KOPYASI — src/lib parite hedefleri
// ============================================================

// PARITE: src/lib/siniftur.js → turEtkisi
const TUR = {
  GELIR: "gelir", GIDER: "gider",
  IADE: "iade", REIMBURSE: "reimbursement", STOPAJ: "stopaj",
  IC_TRANSFER: "internal_transfer", HANE_TRANSFER: "household_transfer",
  BORC_VERME: "loan_given", BORC_ODEME: "loan_repayment",
  HEDIYE: "gift", VARLIK_SATIS: "asset_sale", INCELE: "needs_review", DIGER: "other",
};
function turEtkisi(kayit, tabanTip) {
  const m = Math.abs(+(kayit && kayit.miktar) || 0);
  const t = kayit && kayit.tur;
  if (!t || t === TUR.GELIR || t === TUR.GIDER) {
    return tabanTip === "gelir" ? { gelir: m, gider: 0 } : { gelir: 0, gider: m };
  }
  switch (t) {
    case TUR.IADE:
    case TUR.REIMBURSE:
      return { gelir: 0, gider: -m };
    case TUR.STOPAJ:
      return { gelir: -m, gider: 0 };
    case TUR.HEDIYE:
      return tabanTip === "gelir" ? { gelir: m, gider: 0 } : { gelir: 0, gider: m };
    case TUR.VARLIK_SATIS:
      return { gelir: m, gider: 0 };
    default:
      return { gelir: 0, gider: 0 };
  }
}

// PARITE: src/lib/finance.js → donemAraligi / donemde
function donemAraligi(donem, bugunStr) {
  const parcalar = String(bugunStr).split("-").map(Number);
  const y = parcalar[0], m = parcalar[1];
  const iso = (yy, mm, dd) => new Date(Date.UTC(yy, mm, dd)).toISOString().slice(0, 10);
  if (donem === "buAy") return { start: iso(y, m - 1, 1), end: iso(y, m, 0) };
  if (donem === "gecenAy") return { start: iso(y, m - 2, 1), end: iso(y, m - 1, 0) };
  if (donem === "buYil") return { start: `${y}-01-01`, end: `${y}-12-31` };
  return null;
}
function donemde(tarih, aralik) {
  if (!aralik) return true;
  const t = String(tarih || "").slice(0, 10);
  return t >= aralik.start && t <= aralik.end;
}

// PARITE: src/lib/hesapla.js → kategoriDagilim / araliktanOzet / donemHesap
const topla = (liste) => (liste || []).reduce((s, x) => s + (+x.miktar || 0), 0);
function aboneCarpani(donem) { return donem === "buYil" ? 12 : 1; }

function kategoriDagilim(giderler) {
  const kat = {};
  (giderler || []).forEach((g) => {
    const m = turEtkisi(g, "gider").gider;
    if (m <= 0) return;
    const k = g.kategori || "Diğer";
    kat[k] = (kat[k] || 0) + m;
  });
  const toplam = Object.keys(kat).reduce((s, k) => s + kat[k], 0);
  return Object.keys(kat)
    .map((kategori) => ({ kategori, toplam: kat[kategori], pct: toplam > 0 ? (kat[kategori] / toplam) * 100 : 0 }))
    .sort((a, b) => b.toplam - a.toplam);
}

function araliktanOzet(findata, aralik, donem) {
  const d = findata || {};
  const gelirler = (d.gelirler || []).filter((g) => donemde(g.tarih, aralik));
  const giderler = (d.giderler || []).filter((g) => donemde(g.tarih, aralik));
  let gelir = 0, giderKalem = 0;
  gelirler.forEach((g) => { const e = turEtkisi(g, "gelir"); gelir += e.gelir; giderKalem += e.gider; });
  giderler.forEach((g) => { const e = turEtkisi(g, "gider"); gelir += e.gelir; giderKalem += e.gider; });
  const aboneAylik = topla(d.abonelikler);
  const abone = aboneAylik * aboneCarpani(donem);
  const giderToplam = giderKalem + abone;
  const net = gelir - giderToplam;
  const tasarrufOrani = gelir > 0 ? (net / gelir) * 100 : 0;
  return { aralik, gelirler, giderler, gelir, giderKalem, aboneAylik, abone, giderToplam, net, tasarrufOrani, kategoriler: kategoriDagilim(giderler) };
}
function donemHesap(findata, donem, bugunStr) {
  return araliktanOzet(findata, donemAraligi(donem, bugunStr), donem);
}

// PARITE: src/lib/ozet.js
const yatirimGuncelDeger = (y) => (+y.adet || 0) * (+y.guncelFiyat || +y.alisFiyati || 0);
function yatirimDegeri(d) { return ((d && d.yatirimlar) || []).reduce((s, y) => s + yatirimGuncelDeger(y), 0); }
function hesapVarlikToplam(d) { return ((d && d.hesaplar) || []).filter((h) => h.tip !== "kart").reduce((s, h) => s + (+h.bakiye || 0), 0); }
function hesapBorcToplam(d) { return ((d && d.hesaplar) || []).filter((h) => h.tip === "kart").reduce((s, h) => s + (+h.bakiye || 0), 0); }
function hesapNet(d) { return hesapVarlikToplam(d) - hesapBorcToplam(d); }
function nakitToplam(findata) {
  const d = findata || {};
  if ((d.hesaplar || []).length > 0) return hesapNet(d);
  const gelir = (d.gelirler || []).reduce((s, x) => s + (+x.miktar || 0), 0);
  const gider = (d.giderler || []).reduce((s, x) => s + (+x.miktar || 0), 0);
  const abone = (d.abonelikler || []).reduce((s, x) => s + (+x.miktar || 0), 0);
  return gelir - gider - abone;
}
function netVarlik(d) { return nakitToplam(d) + yatirimDegeri(d); }

// ============================================================
// CONTEXT ÜRETİCİ — ALLOW-LIST
// ============================================================

// Bu ayın gider KPI'sına katkı veren kayıtlarından en büyükleri.
// AÇIKLAMA/BAŞLIK/MERCHANT METNİ ALINMAZ — yalnız kategori + tutar + tarih.
function enBuyukGiderler(findata, aralik, adet) {
  const out = [];
  ((findata && findata.giderler) || []).forEach((g) => {
    if (!donemde(g.tarih, aralik)) return;
    const m = turEtkisi(g, "gider").gider;
    if (m <= 0) return;
    out.push({ category: cpKirp(g.kategori || "Diğer", 60), amount: yuvarla2(m), date: String(g.tarih || "").slice(0, 10) });
  });
  out.sort((a, b) => b.amount - a.amount);
  return out.slice(0, adet);
}

// Ana giriş: findata (users.data) + bugün (YYYY-MM-DD) → sanitize context nesnesi.
function finansContext(findata, bugunStr) {
  const d = findata || {};
  const buAy = donemHesap(d, "buAy", bugunStr);
  const gecenAy = donemHesap(d, "gecenAy", bugunStr);
  const aralik = donemAraligi("buAy", bugunStr);

  const buAyKat = {};
  buAy.kategoriler.forEach((k) => { buAyKat[k.kategori] = k.toplam; });

  const butceMap = d.butceler || {};
  const budgets = Object.keys(butceMap)
    .filter((k) => (+butceMap[k] || 0) > 0)
    .map((k) => ({ category: cpKirp(k, 60), limit: yuvarla2(butceMap[k]), actual: yuvarla2(buAyKat[k] || 0) }))
    .sort((a, b) => b.limit - a.limit)
    .slice(0, LIMIT.BUTCE);

  const ctx = {
    asOf: String(bugunStr).slice(0, 10),
    currency: "TRY",
    netWorth: yuvarla2(netVarlik(d)),
    cashTotal: yuvarla2(nakitToplam(d)),
    investmentTotal: yuvarla2(yatirimDegeri(d)),
    currentMonth: {
      income: yuvarla2(buAy.gelir),
      expenses: yuvarla2(buAy.giderToplam),
      subscriptions: yuvarla2(buAy.abone),
      net: yuvarla2(buAy.net),
      savingsRate: yuvarla2(buAy.tasarrufOrani),
    },
    previousMonth: {
      income: yuvarla2(gecenAy.gelir),
      expenses: yuvarla2(gecenAy.giderToplam),
      net: yuvarla2(gecenAy.net),
      savingsRate: yuvarla2(gecenAy.tasarrufOrani),
    },
    // Kategori adları kullanıcı metnidir → 60 code point ile sınırlanır (boyut + yüzey kontrolü).
    expenseByCategory: buAy.kategoriler.slice(0, LIMIT.KATEGORI).map((k) => ({ category: cpKirp(k.kategori, 60), amount: yuvarla2(k.toplam) })),
    budgets,
    goals: ((d.hedefler) || []).slice(0, LIMIT.HEDEF).map((h) => ({
      name: cpKirp(h.ad || "Hedef", 60), type: String(h.tip || ""), target: yuvarla2(h.hedefTutar), current: yuvarla2(h.mevcutTutar),
    })),
    subscriptions: ((d.abonelikler) || []).slice(0, LIMIT.ABONELIK).map((a) => ({
      name: cpKirp(a.baslik || "Abonelik", 60), monthlyAmount: yuvarla2(a.miktar),
    })),
    topExpenses: enBuyukGiderler(d, aralik, LIMIT.TOP_GIDER),
    context_truncated: false,
  };

  return boyutaSigdir(ctx);
}

// 8 KiB HARD CAP. Aşarsa listeler belirlenmiş sırayla kısaltılır; sınır aşılamaz.
function boyutaSigdir(ctx) {
  const boyut = (o) => utf8Bayt(JSON.stringify(o));
  if (boyut(ctx) <= LIMIT.CONTEXT_BYTE) return ctx;
  const sira = ["topExpenses", "subscriptions", "goals", "budgets", "expenseByCategory"];
  ctx.context_truncated = true;
  for (const alan of sira) {
    while (ctx[alan].length > 0 && boyut(ctx) > LIMIT.CONTEXT_BYTE) ctx[alan].pop();
    if (boyut(ctx) <= LIMIT.CONTEXT_BYTE) return ctx;
  }
  return ctx; // listeler boşaldı; sabit alanlar zaten sınır altında
}

// ---- Girdi doğrulama (saf) ----
const UPDATE_ID_RE = /^[0-9]{1,19}$/;
const TGID_RE = /^[0-9]{1,20}$/;

// Gövde sözleşmesi: yalnız bilinen üst-seviye alanlar. Dönüş {ok:true,...} | {ok:false,kod}
function govdeDogrula(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, kod: "bad_question" };
  const izin = ["telegram_user_id", "update_id", "question", "history"];
  for (const k of Object.keys(body)) if (izin.indexOf(k) === -1) return { ok: false, kod: "bad_question" };

  const tgid = body.telegram_user_id == null ? "" : String(body.telegram_user_id);
  if (!TGID_RE.test(tgid)) return { ok: false, kod: "bad_tgid" };

  const uid = body.update_id == null ? "" : String(body.update_id);
  if (!UPDATE_ID_RE.test(uid)) return { ok: false, kod: "bad_update_id" };

  const soru = typeof body.question === "string" ? body.question.trim() : "";
  if (!soru) return { ok: false, kod: "bad_question" };
  if (cpUzunluk(soru) > LIMIT.SORU) return { ok: false, kod: "bad_question" };

  let history = [];
  if (body.history != null) {
    if (!Array.isArray(body.history)) return { ok: false, kod: "bad_question" };
    if (body.history.length > LIMIT.HISTORY_CIFT) return { ok: false, kod: "bad_question" };
    for (const h of body.history) {
      if (!h || typeof h !== "object" || Array.isArray(h)) return { ok: false, kod: "bad_question" };
      for (const k of Object.keys(h)) if (k !== "q" && k !== "a") return { ok: false, kod: "bad_question" };
      const q = typeof h.q === "string" ? h.q.trim() : "";
      const a = typeof h.a === "string" ? h.a.trim() : "";
      if (cpUzunluk(q) > LIMIT.HISTORY_ALAN || cpUzunluk(a) > LIMIT.HISTORY_ALAN) return { ok: false, kod: "bad_question" };
      history.push({ q, a });
    }
  }
  return { ok: true, tgid, uid, soru, history };
}

// request_hash kanonik girdisi (hash primitifi CAGIRAN tarafta — $security.sha256).
//
// F1 — AYIRAC BIRLESTIRME YOK: kullanici-kontrollu metinler (soru, gecmis) ayiracla duz metne
// katlanirsa farkli girdiler AYNI kanonigi uretebilir (satir sonu / U+0000 / U+0001 enjeksiyonu).
// Bunun yerine JSON dizi serilestirmesi kullanilir: her eleman kendi tirnakli+escape'li alaninda
// durur -> belirsizlik yok. (Onceki surum NUL/SOH ayiraci kullaniyordu; kaynakta ham kontrol
// baytlari da birakiyordu.)
//
// KIMLIK BAGLAMA: hash yalniz (tgid, update_id, soru, gecmis) degil, COZULEN HESAP KIMLIGINI de
// baglar (linkId + userId). Ayni tgid+update_id unlink/relink ile BASKA bir PB kullanicisina
// baglanirsa hash DEGISIR -> onceki kullanicinin cache'lenmis cevabi ASLA dondurulemez
// (fail-closed: idempotency_conflict).
//
// linkId/userId YALNIZ hash GIRDISIDIR; telegram_ai_results'a ham olarak YAZILMAZ.
function hashKanonik(linkId, userId, tgid, uid, soru, history, saglayici, model) {
  return JSON.stringify([
    "t2b-v2",
    String(linkId || ""),
    String(userId || ""),
    String(tgid || ""),
    String(uid || ""),
    String(soru || ""),
    (history || []).map((x) => [String((x && x.q) || ""), String((x && x.a) || "")]),
    String(saglayici || ""),
    String(model || ""),
  ]);
}

module.exports = {
  LIMIT, TUR,
  cpUzunluk, cpKirp, yuvarla2, utf8Bayt,
  turEtkisi, donemAraligi, donemde, kategoriDagilim, araliktanOzet, donemHesap,
  yatirimGuncelDeger, yatirimDegeri, hesapVarlikToplam, hesapBorcToplam, hesapNet, nakitToplam, netVarlik,
  finansContext, boyutaSigdir, enBuyukGiderler,
  govdeDogrula, hashKanonik,
  UPDATE_ID_RE, TGID_RE,
};
