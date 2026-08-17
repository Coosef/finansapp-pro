// ============================================================
// Sınıflandırma öneri motoru (v1.5.0) — saf, test edilebilir.
// Amaç: HER işlemi etiketlemek DEĞİL. KPI'yı bozabilecek / finansal anlamı düz
// gelir-gider'den FARKLI olan hareketleri bulup ÖNERMEK. Ham kayıt (yön/tutar/
// başlık) hiç değişmez; öneri ASLA otomatik uygulanmaz — kullanıcı kabul eder.
// Hibrit: deterministik kurallar (turOner) + isteğe bağlı AI fallback (turOnerAI).
// ============================================================
import { TUR } from "./siniftur.js";
import { kisiBul } from "./kisi.js";
import { turEtiket } from "./incele.js";
import { merchantCoz } from "./merchant.js";

const kucuk = (s) => String(s ?? "").replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();

// Transfer benzeri mi? (kategori Gönderim ya da başlıkta transfer/havale/eft/fast/
// virman/gönder — "eft" YALNIZ kelime sınırında, "NEFTUNE" gibi içine kaçmaz).
function transferBenzeri(x) {
  const b = kucuk(x.baslik);
  return x.kategori === "Gönderim" ||
    /\btransfer\b|\bhavale\b|\beft\b|\bfast\b|\bvirman\b|gönder|gonder/.test(b);
}

// Başlık kendi hesaplarından biriyle eşleşiyor mu? (son4 ya da hesap adı)
function kendiHesapMi(baslik, hesaplar) {
  const b = kucuk(baslik);
  for (const h of hesaplar || []) {
    if (h.son4 && String(h.son4).length === 4 && b.includes(String(h.son4))) return h;
    const ad = kucuk(h.ad).trim();
    if (ad && ad.length >= 4 && b.includes(ad)) return h;
  }
  return null;
}

// Bir kayıt için önerilen finansal anlam. kayit._yon = "gelir" | "gider".
// { tur, guven: "yuksek"|"orta", neden } ya da null (öneri yok / tahmin etme).
export function turOner(kayit, kisiler = [], hesaplar = []) {
  if (!kayit) return null;
  if (kayit.tur) return null; // zaten sınıflı (provenance) → override korunur, önerme
  const b = kucuk(kayit.baslik);

  // 1) STOPAJ — faiz gelirinden kesilen vergi. "vergi kesintisi" + faiz bağlamı gerekir;
  //    "Motorlu Taşıtlar Vergisi" gibi gerçek vergiler stopaj DEĞİL → önerilmez.
  if (/vergi kesintisi/.test(b) && /faiz/.test(b)) {
    return { tur: TUR.STOPAJ, guven: "yuksek", neden: "Faiz gelirinden kesilen stopaj — geliri düşürür (tüketim gideri değil)" };
  }

  // 2) Transfer benzeri → yalnız KANITLA öner (EFT kelimesi tek başına yetmez)
  if (transferBenzeri(kayit)) {
    // Merchant/PSP izi (PAYTR/IYZICO/harcama/alışveriş) varsa aslında kart harcaması
    // olabilir; içinde kişi adı geçse bile hane/iç transfer TAHMİN ETME (false-positive).
    if (/paytr|iyzico|encard|harcama|ali[şsıi]veri[şsıi]/i.test(kayit.baslik || "")) return null;
    const hane = (kisiler || []).filter((k) => k.hane);
    const k = kisiBul(hane, kayit.baslik, kayit.iban);
    if (k) return { tur: TUR.HANE_TRANSFER, guven: "orta", neden: `Hane kişisi: ${k.ad} — KPI dışı (nötr) olabilir` };
    if (kendiHesapMi(kayit.baslik, hesaplar)) return { tur: TUR.IC_TRANSFER, guven: "orta", neden: "Kendi hesabın — hesaplar arası transfer (nötr)" };
    return null; // tanınmayan karşı taraf → tahmin etme
  }

  return null;
}

// findata'daki UNTAGGED gelir/giderleri tarar, öneri üretenleri türe göre gruplar.
// Kullanıcının sınıfladığı (tur set) kayıtlar HİÇ taranmaz (override korunur).
// { gruplar: [{tur,label,guven,adet,toplam,kayitlar}], toplamAdet } döner.
export function oneriBekleyen(findata) {
  const d = findata || {};
  const kisiler = d.kisiler || [];
  const hesaplar = d.hesaplar || [];
  const grupMap = {};
  let toplamAdet = 0;
  const tara = (arr, yon) =>
    (arr || []).forEach((x) => {
      if (x.tur) return; // sınıflı → dokunma
      const o = turOner({ ...x, _yon: yon }, kisiler, hesaplar);
      if (!o) return;
      toplamAdet++;
      const g = (grupMap[o.tur] = grupMap[o.tur] || { tur: o.tur, label: turEtiket(o.tur), guven: o.guven, adet: 0, toplam: 0, kayitlar: [] });
      g.adet++;
      g.toplam += Math.abs(+x.miktar || 0);
      if (o.guven === "orta") g.guven = "orta"; // grup güveni en düşüğe iner
      g.kayitlar.push({ ...x, _yon: yon, _oneriTur: o.tur, _oneriGuven: o.guven, _oneriNeden: o.neden });
    });
  tara(d.gelirler, "gelir");
  tara(d.giderler, "gider");
  const gruplar = Object.values(grupMap).sort((a, b) => b.toplam - a.toplam);
  return { gruplar, toplamAdet };
}

// Öneri kayıtlarını toplu uygula (kullanıcı tetikli). Her kayda _oneriTur (ya da
// verilmişse tur) + turKaynak yazar; ham alanlar korunur. { data, geriAl } döner;
// geriAl önceki tur/turKaynak'ı taşır → tam geri-al. Ham kayıt asla bozulmaz.
export function topluSinifla(findata, kayitlar, kaynak = "rule") {
  const d = findata || {};
  const geriAl = [];
  const hedef = { gelirler: new Map(), giderler: new Map() };
  for (const r of kayitlar || []) {
    const list = r._yon === "gelir" ? "gelirler" : "giderler";
    hedef[list].set(String(r.id), r._oneriTur || r.tur);
  }
  const uygula = (arr, list) =>
    (arr || []).map((x) => {
      if (!hedef[list].has(String(x.id))) return x;
      geriAl.push({ list, id: x.id, onceki: { tur: x.tur, turKaynak: x.turKaynak } });
      return { ...x, tur: hedef[list].get(String(x.id)), turKaynak: kaynak };
    });
  return { data: { ...d, gelirler: uygula(d.gelirler, "gelirler"), giderler: uygula(d.giderler, "giderler") }, geriAl };
}

// topluSinifla'nın geriAl tokenini uygulayarak önceki duruma döndür.
export function geriAlSinifla(findata, geriAl) {
  const d = findata || {};
  const harita = { gelirler: new Map(), giderler: new Map() };
  for (const g of geriAl || []) harita[g.list].set(String(g.id), g.onceki || {});
  const restore = (arr, list) =>
    (arr || []).map((x) => {
      if (!harita[list].has(String(x.id))) return x;
      const o = harita[list].get(String(x.id));
      const nx = { ...x };
      if (o.tur === undefined) delete nx.tur; else nx.tur = o.tur;
      if (o.turKaynak === undefined) delete nx.turKaynak; else nx.turKaynak = o.turKaynak;
      return nx;
    });
  return { ...d, gelirler: restore(d.gelirler, "gelirler"), giderler: restore(d.giderler, "giderler") };
}

// AI'a göndermeden gereksiz kişisel bilgiyi maskele (IBAN/kart/e-posta/telefon).
export function sanitizeAciklama(s) {
  let t = String(s ?? "");
  t = t.replace(/TR\d{2}\s?(?:\d{4}\s?){5}\d{2}/gi, "[IBAN]"); // TR IBAN (gruplu)
  t = t.replace(/\bTR\d{2}(?:\s?\d){18,22}\b/gi, "[IBAN]"); // TR IBAN (esnek)
  t = t.replace(/\b(?:\d[ -]?){15,16}\b/g, "[KART]"); // kart no
  t = t.replace(/\b\d{11}\b/g, "[KIMLIK]"); // TC benzeri 11 hane
  t = t.replace(/\b0?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g, "[TEL]"); // TR cep (ref'ten ÖNCE)
  t = t.replace(/\b\d{7,10}\b/g, "[REF]"); // banka referans / sorgu no
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[EPOSTA]"); // e-posta
  return t;
}

// ---- AI fallback (Increment 3) — 1. katman DEĞİL; deterministik oneri.js + merchant
// sonrası. YALNIZ öneri üretir (asla tur yazmaz). ----

// Untagged kayıt GERÇEKTEN belirsiz mi (AI'a değer)? Kesin merchant'lı sıradan
// alışveriş (default gider doğru) ve net faiz geliri (default gelir doğru) belirsiz
// DEĞİL → AI'a gönderme. Merchant'sız transfer/counterparty → belirsiz.
function belirsizMi(kayit, merchantKurallari) {
  const b = kucuk(kayit.baslik);
  if (/faiz gel|faiz oran|toplam dönem faizi|limit aşım faizi/.test(b)) return false;
  const m = merchantCoz(kayit.baslik, merchantKurallari || [], kayit.merchantOverride);
  if (m.merchant && (m.merchantConfidence === "high" || m.merchantConfidence === "medium")) return false;
  return true;
}

// AI adayları: yalnız UNRESOLVED + BELİRSİZ — (tur yok VEYA needs_review) + deterministik
// çözemedi (turOner null) + kullanıcı sınıflamamış + (needs_review VEYA belirsiz). Final
// classification, sıradan merchant alışverişi ve net faiz geliri hariç. "Bütün transaction'ları
// AI'a gönderme" guardrail'i.
export function aiAdaylari(findata) {
  const d = findata || {};
  const kisiler = d.kisiler || [], hesaplar = d.hesaplar || [], mk = d.merchantKurallari || [];
  const uygun = (arr, yon) =>
    (arr || [])
      .filter((x) => {
        if (x.tur && x.tur !== TUR.INCELE) return false; // final classification → hariç
        if (x.turKaynak === "user") return false;         // kullanıcı sınıflamış → hariç
        if (turOner({ ...x, _yon: yon }, kisiler, hesaplar)) return false; // deterministik çözdü → hariç
        if (x.tur === TUR.INCELE) return true;            // needs_review → her zaman aday
        return belirsizMi(x, mk);                          // untagged → yalnız belirsizse
      })
      .map((x) => ({ ...x, _yon: yon }));
  return [...uygun(d.gelirler, "gelir"), ...uygun(d.giderler, "gider")];
}

// AI'a gönderilecek YAPILANDIRILMIŞ + sanitize context (ham metin tek başına değil).
// merchantOverride güvenilir context olarak kullanılır (AI onu DEĞİŞTİREMEZ).
export function aiContext(kayit, merchantKurallari = []) {
  const m = merchantCoz(kayit.baslik, merchantKurallari, kayit.merchantOverride);
  return {
    id: kayit.id,
    direction: kayit._yon === "gelir" ? "incoming" : "outgoing",
    amount: Math.abs(+kayit.miktar || 0),
    description: sanitizeAciklama(kayit.baslik),
    merchant: m.merchant || m.merchantCandidate || null,
    merchantConfidence: m.merchantConfidence || null,
    psp: m.psp || null,
    kategori: kayit.kategori || null,
    recurring: !!(kayit.otomatik || kayit.tekrar),
  };
}

// Bounded batch + strict schema + graceful. Çıktı: [{id, suggestedTur(enum), reason,
// evidence[], suggestionSource:'ai'}]. Bilinmeyen enum → reddedilir. Hata/parse/null →
// o batch atlanır (throw yok, retry storm yok — ai.js kendi backoff'unu yapar). Mutate yok.
export async function turOnerAI(kayitlar, aiCagir, opts = {}) {
  if (!aiCagir || !(kayitlar || []).length) return [];
  const batchSize = opts.batchSize || 25;
  const merchantKurallari = opts.merchantKurallari || [];
  const gecerli = new Set(Object.values(TUR));
  const out = [];
  for (let i = 0; i < kayitlar.length; i += batchSize) {
    const grup = kayitlar.slice(i, i + batchSize);
    const ctx = grup.map((k) => aiContext(k, merchantKurallari));
    const prompt =
      "Aşağıdaki banka işlemlerinin FİNANSAL ANLAMINI (tur) öner. Ham yön DEĞİŞMEZ. Emin değilsen ATLA. " +
      "Yalnız JSON array: [{\"id\":\"..\",\"suggestedTur\":\"..\",\"reason\":\"..\",\"evidence\":[\"..\"]}]. " +
      `Geçerli suggestedTur: ${[...gecerli].join(", ")}.\ncontext:\n` + JSON.stringify(ctx);
    let txt;
    try {
      txt = await aiCagir([{ role: "user", content: prompt }], false, true);
    } catch {
      continue; // batch atlanır; retry storm YOK
    }
    let arr;
    try {
      arr = JSON.parse(txt);
      if (!Array.isArray(arr)) arr = arr?.oneriler || arr?.suggestions || [];
    } catch {
      continue;
    }
    for (const o of arr || []) {
      if (!o || !o.id || !gecerli.has(o.suggestedTur)) continue; // bilinmeyen enum → reject
      out.push({ id: o.id, suggestedTur: o.suggestedTur, reason: o.reason || "", evidence: Array.isArray(o.evidence) ? o.evidence : [], suggestionSource: "ai" });
    }
  }
  return out;
}

// Confidence band — UYGULAMA TARAFI kanıttan (merchant + önceki kullanıcı kararları +
// evidence). Model'in kendi self-confidence'ı tek başına yüksek yapmaz.
export function aiGuvenBand(sug, ctx, gecmis = []) {
  let p = 0;
  if (ctx && ctx.merchant && ctx.merchantConfidence === "high") p += 2;
  else if (ctx && ctx.merchant) p += 1;
  if ((gecmis || []).some((g) => g.merchant && ctx && g.merchant === ctx.merchant && g.tur === sug.suggestedTur)) p += 2;
  if ((sug.evidence || []).length >= 2) p += 1;
  return p >= 3 ? "Yüksek" : p >= 1 ? "Orta" : "Düşük";
}

// Kullanıcı AI önerisini KABUL edince uygula: tur yazılır + provenance
// (classificationSource=user, acceptedSuggestionSource=ai). kabuller: [{id, yon, tur}].
// Ham baslik + merchantOverride korunur. Kabul edilmeden hiçbir tur yazılmaz.
export function aiKabulUygula(findata, kabuller) {
  const d = findata || {};
  const map = { gelirler: new Map(), giderler: new Map() };
  for (const k of kabuller || []) map[k.yon === "gelir" ? "gelirler" : "giderler"].set(String(k.id), k.tur);
  const upd = (arr, list) =>
    (arr || []).map((x) =>
      map[list].has(String(x.id)) ? { ...x, tur: map[list].get(String(x.id)), turKaynak: "user", acceptedSuggestionSource: "ai" } : x);
  return { ...d, gelirler: upd(d.gelirler, "gelirler"), giderler: upd(d.giderler, "giderler") };
}

// Learning seed: kullanıcının (elle ya da AI-kabul) sınıfladığı kayıtlardan
// {merchant, tur} kararları. AI confidence band'i besler; tekrarlı tutarlı kararlar
// ileride deterministik kural önerisine dönüştürülebilir (tek kabulden global kural YOK).
export function gecmisKararlar(findata, merchantKurallari = []) {
  const d = findata || {};
  const out = [];
  const tara = (arr) =>
    (arr || []).forEach((x) => {
      if (x.tur && x.tur !== TUR.INCELE && (x.turKaynak === "user" || x.acceptedSuggestionSource)) {
        const m = merchantCoz(x.baslik, merchantKurallari, x.merchantOverride);
        if (m.merchant) out.push({ merchant: m.merchant, tur: x.tur });
      }
    });
  tara(d.gelirler);
  tara(d.giderler);
  return out;
}
