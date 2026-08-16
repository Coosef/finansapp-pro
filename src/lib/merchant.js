// ============================================================
// Merchant normalization & memory (Increment 2) — saf enrichment.
// INVARYANT: ham baslik ASLA değişmez; merchant KPI'ya (tur/gelir/gider/net/yön/
// tutar) 0 TL etki eder — yalnız görünürlük katmanı.
// Precedence: override > user_memory > alias(high) > format_kod/psp(medium) >
// candidate(low, OTOMATİK DEĞİL) > null. PSP ≠ merchant.
// merchant: yalnız high/medium. merchantCandidate: low/fuzzy (öneri).
// ============================================================

// Türkçe-güvenli eşleştirme foldu: I/İ/ı→I, Ş→S, Ğ→G, Ü→U, Ö→O, Ç→C (ASCII upper).
const fold = (s) =>
  String(s ?? "").toUpperCase()
    .replace(/İ/g, "I").replace(/Ş/g, "S").replace(/Ğ/g, "G")
    .replace(/Ü/g, "U").replace(/Ö/g, "O").replace(/Ç/g, "C");

// Gürültü temizliği (taksit/tutar/tarih/kod/#/IBAN/punctuation). "." korunur (.com).
function temizle(raw) {
  let t = fold(raw);
  t = t.replace(/\(TAKSIT[^)]*\)/g, " ");
  t = t.replace(/\(FAST\)/g, " ");
  t = t.replace(/\([\d.,]+ ?TL\)/g, " ");            // (5,037.90 TL)
  t = t.replace(/SORGU NO:?\s*\d+/g, " ");
  t = t.replace(/\bNO:?\s*\d+/g, " ");
  t = t.replace(/#\s*\d+/g, " ");
  t = t.replace(/TR\d{2}[\d ]{10,}/g, " ");           // IBAN
  t = t.replace(/\d{1,2}[.\/]\d{1,2}([.\/]\d{2,4})?/g, " "); // tarih
  t = t.replace(/\d{4,}/g, " ");                       // uzun kod/store no
  t = t.replace(/[^A-Z0-9. ]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

const baslikCase = (folded) =>
  String(folded || "").toLowerCase().split(" ").filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

const keyOf = (m) => (m ? fold(m).toLowerCase().replace(/\s+/g, " ").trim() : null);

// Bilinen marka alias'ları (contains, kelime-sınırlı). Genişletilebilir.
const ALIAS = [
  [/\bTAHTAKALE SPOT\b/, "Tahtakale Spot"],
  [/\bMOD MARKET\b/, "Mod Market"],
  [/\bTAMER TANCA\b/, "Tamer Tanca"],
  [/\bAKSU FRIGO\b/, "Aksu Frigo"],
  [/\bCLAUDE.AI\b/, "Claude.ai"],
  [/\bANTHROPIC\b/, "Anthropic"],
  [/\bMIGROS\b/, "Migros"],
  [/\bTRENDYOL\b/, "Trendyol"],
  [/\bAMAZON\b/, "Amazon"],
  [/\bYOUTUBE\b/, "YouTube"],
  [/\bN11\b/, "N11"],
  [/\bMAVI\b/, "Mavi"],
  [/\bA101\b/, "A101"],
  [/\bBIM\b/, "BİM"],
  [/\bCARREFOUR\b/, "CarrefourSA"],
];
function aliasBul(folded) {
  for (const [rx, ad] of ALIAS) if (rx.test(folded)) return ad;
  return null;
}

// PSP/aggregator — gerçek merchant DEĞİL. "PSP<sep>MERCHANT" (sep: / veya *).
const PSP = ["IYZICO", "PAYTR", "PARAM", "STRIPE", "PAYPAL", "GOOGLE", "SIPAY", "MOKA", "CRAFTGATE"];
function pspAyir(raw) {
  const f = fold(raw);
  for (const p of PSP) {
    const m = f.match(new RegExp("^\\s*" + p + "\\b[^*/]*[*/]\\s*(.+)$"));
    if (m) return { psp: p, kalan: m[1].trim() };
  }
  return { psp: null, kalan: raw };
}

// Merchant OLMAYAN kayıtlar (faiz/transfer/vergi) → merchant null.
const merchantYok = (raw) =>
  /faiz gel|faiz oran|donem faizi|limit asim faizi|vergi kesin|stopaj|giden transfer|gelen transfer/.test(fold(raw).toLowerCase());

// STOP token'ları: konum + transfer gürültüsü. Merchant leading-brand-run bunlarda
// DURUR (ortada geçince merchant'a sızmaz; aynı merchant'ı konumla ikiye bölmez).
const STOP = new Set([
  "ANTALYA", "ISTANBUL", "IST", "ANKARA", "IZMIR", "BURSA", "TR", "TURKIYE", "DIGER", "ODEME", "TL", "TRY", "SANAL",
  "GIDEN", "GELEN", "TRANSFER", "HAVALE", "EFT", "LONDON", "DUBLIN", "AMSTERDAM", "IRELAND", "SINGAPORE",
]);

// Bir metinden (raw ya da psp sonrası kalan) merchant türet.
function turet(text) {
  const kod = String(text).match(/\d{5,}\s*-\s*(.+)$/); // "...KOD-MERCHANT"
  const hadCode = !!kod;
  const base = temizle(hadCode ? kod[1] : text);
  const al = aliasBul(base) || aliasBul(temizle(text));
  if (al) return { merchant: al, candidate: null, kaynak: "alias_exact", guven: "high" };
  const brand = [];
  for (const t of base.split(" ")) {
    if (t.length < 2) continue;
    if (STOP.has(t)) break;                 // konum/transfer gürültüsünde dur
    brand.push(t);
    if (brand.length >= (hadCode ? 3 : 2)) break;
  }
  if (!brand.length) return { merchant: null, candidate: null, kaynak: null, guven: null };
  const marka = baslikCase(brand.join(" "));
  if (hadCode) return { merchant: marka, candidate: null, kaynak: "format_kod", guven: "medium" };
  return { merchant: null, candidate: marka, kaynak: "fuzzy_candidate", guven: "low" }; // alias/kod yok → yalnız aday
}

function paket(raw, norm, merchant, candidate, kaynak, guven, psp) {
  return {
    rawDescription: raw,
    normalizedDescription: norm,
    merchant: merchant || null,
    merchantCandidate: candidate || null,
    merchantKey: merchant ? keyOf(merchant) : null,
    merchantConfidence: guven || null,
    merchantSource: kaynak || null,
    psp: psp || null,
  };
}

// Ana çözümleyici. hafiza: kullanıcı merchant kuralları; override: record.merchantOverride.
export function merchantCoz(raw, hafiza = [], override = null) {
  const norm = temizle(raw);
  const { psp } = pspAyir(raw);
  // 1) record override — en yüksek öncelik, motor ezmez
  if (override != null && String(override).trim()) {
    return paket(raw, norm, String(override).trim(), null, "user_override", "high", psp);
  }
  // 2) kullanıcı merchant hafızası
  const hit = hafizaEslesme(norm, hafiza);
  if (hit) return paket(raw, norm, hit.merchant, null, "user_memory", "high", psp);
  // 3) PSP varsa: merchant PSP sonrasından (PSP ≠ merchant)
  if (psp) {
    const r = turet(pspAyir(raw).kalan);
    let merchant = r.merchant, guven = r.guven;
    if (!merchant && r.candidate) { merchant = r.candidate; guven = "medium"; } // PSP formatı merchant'ı güvenle sınırlar
    if (merchant) return paket(raw, norm, merchant, null, "psp_extracted", guven, psp);
    return paket(raw, norm, null, null, null, null, psp);
  }
  // 4) merchant olmayan kayıt (faiz/transfer/vergi) → null
  if (merchantYok(raw)) return paket(raw, norm, null, null, null, null, null);
  // 5) deterministik türet
  const r = turet(raw);
  if (r.merchant) return paket(raw, norm, r.merchant, null, r.kaynak, r.guven, null);
  return paket(raw, norm, null, r.candidate, r.kaynak, r.guven, null); // yalnız candidate (low)
}

// ---- Merchant memory (kontrollü kapsam) ----
function hafizaEslesmeTek(normDesc, kural) {
  const hay = fold(normDesc);
  const an = fold(kural.anahtar || "");
  if (!an) return false;
  if (kural.tip === "exact") return hay === an;
  if (kural.tip === "prefix") return hay.startsWith(an);
  if (kural.tip === "contains") return hay.includes(an);
  if (kural.tip === "regex") { try { return new RegExp(kural.anahtar, "i").test(normDesc); } catch { return false; } }
  return false;
}
function hafizaEslesme(normDesc, hafiza) {
  for (const k of hafiza || []) if (hafizaEslesmeTek(normDesc, k)) return k;
  return null;
}

// Kullanıcı düzeltmesinden kontrollü kapsamlı kural üret (varsayılan: dar 'exact').
// Tek transaction düzeltmesi otomatik geniş global pattern üretmez.
export function merchantKuralUret(raw, merchant, tip = "exact") {
  const norm = temizle(raw);
  let anahtar;
  if (tip === "prefix") anahtar = norm.split(" ").slice(0, 2).join(" ");
  else if (tip === "contains") anahtar = norm.split(" ")[0] || norm;
  else anahtar = norm; // exact
  return { anahtar: (anahtar || "").toLowerCase(), tip, merchant, source: "user" };
}

// "Benzerlere uygula" önizlemesi: kuralın etkileyeceği kayıtlar (ham açıklama görünür).
export function benzerAdaylar(kayitlar, kural) {
  return (kayitlar || [])
    .filter((x) => hafizaEslesmeTek(temizle(x.baslik), kural))
    .map((x) => ({ id: x.id, baslik: x.baslik }));
}
