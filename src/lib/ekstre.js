// ============================================================
// Banka hesap ekstresi çözümleyici (XLSX ızgarasından, AI'sız).
// Satır ızgarası → { ozet, islemler }. İşlemleri gelir/gider/transfer/
// odeme (kart borcu) olarak sınıflar. Kendine yapılan transferleri
// (hesaplar arası) tanır; gelir/gider olarak SAYMAZ.
// ============================================================
import { sayiCevir } from "./format.js";

// Türkçe-güvenli küçük harf (İ→i, I→ı) — anahtar kelime eşleştirmesi için
const kucuk = (s) => String(s ?? "").replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();

// IBAN banka kodu (baştaki sıfırlar atılmış) → banka adı. Yaygın TR bankaları.
export const BANKA_KODU = {
  10: "Ziraat Bankası", 12: "Halkbank", 15: "VakıfBank", 32: "TEB", 46: "Akbank",
  59: "Şekerbank", 62: "Garanti BBVA", 64: "İşbankası", 67: "Yapı Kredi", 92: "Citibank",
  99: "ING", 103: "Fibabanka", 108: "Turkish Bank", 111: "QNB Finansbank", 123: "HSBC",
  124: "Alternatif Bank", 125: "Burgan Bank", 134: "DenizBank", 135: "Anadolubank",
  143: "Aktif Bank", 146: "Odeabank", 203: "Albaraka Türk", 205: "Kuveyt Türk",
  206: "Türkiye Finans", 209: "Ziraat Katılım", 210: "Vakıf Katılım", 211: "Emlak Katılım",
};

// IBAN → banka adı (yoksa null). TR IBAN: TR + 2 kontrol + 5 banka kodu + ...
export function ibanBanka(iban) {
  const d = String(iban || "").replace(/[^0-9]/g, "");
  if (d.length < 7) return null;
  const kod = parseInt(d.slice(2, 7), 10);
  return BANKA_KODU[kod] || null;
}

// "13.06.2026 14:00" | "13/06/2026" | Excel seri no → "YYYY-MM-DD" (yoksa null)
export function tarihCevir(raw) {
  const s = String(raw ?? "").trim();
  const m = s.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const n = Number(s.replace(",", "."));
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    // Excel seri no: 25569 = 1970-01-01
    return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  return null;
}

// Açıklamadan kaba kategori tahmini (gider/gelir). AI yok; kullanıcı düzeltebilir.
const KATEGORI_DESEN = [
  [/maaş|maas|ücret ödeme|özlük/, "Maaş"],
  [/market|migros|bim|a101|şok|sok|carrefour|metro|tarım kredi/, "Market"],
  [/restoran|kafe|cafe|yemek|lokanta|getir yemek|yemeksepeti|burger|pizza|starbucks/, "Restoran"],
  [/akaryakıt|akaryakit|petrol|benzin|opet|shell|bp |po |otoyol|hgs|ogs|otobüs|metro|taksi|uber|bitaksi|ulaşım|ulasim/, "Ulaşım"],
  [/elektrik|su |doğalgaz|dogalgaz|fatura|telekom|turkcell|vodafone|türk telekom|internet|tv\+/, "Faturalar"],
  [/eczane|hastane|sağlık|saglik|medikal|doktor|diş|dis /, "Sağlık"],
  [/giyim|defacto|lc waikiki|koton|mavi|boyner|zara|h&m|trendyol|ayakkabı/, "Giyim"],
  [/teknosa|vatan|media markt|apple|google|microsoft|yazılım|yazilim|abonelik|spotify|netflix|amazon|hepsiburada/, "Teknoloji"],
  [/sinema|oyun|eğlence|eglence|konser|bilet|steam|playstation/, "Eğlence"],
  [/faiz|temettü|temettu|kar payı|kar payi/, "Faiz/Yatırım"],
  [/kira/, "Kira"],
];
export function kategoriTahmin(aciklama, tip) {
  const a = kucuk(aciklama);
  for (const [re, kat] of KATEGORI_DESEN) if (re.test(a)) return kat;
  return tip === "gelir" ? "Diğer Gelir" : "Diğer";
}

// Bir işlemi sınıfla: "odeme" (kart borcu) | "transfer" | "gelir" | "gider"
// sahipTokens: hesap sahibinin ad parçaları (kendine transferi yakalamak için)
function siniflandir(islem, aciklama, miktar, sahipTokens) {
  const i = kucuk(islem);
  const a = kucuk(aciklama);
  const hepsi = i + " " + a;
  // 1) Kredi kartı borç ödemesi → gelir/gider değil
  if (/kredi kart.*öde|kart ödeme|kart borç|hesaptan ödeme|kredi kart.*tahsil/.test(hepsi)) return "odeme";
  // 2) Maaş → gelir
  if (/maaş|maas/.test(a)) return "gelir";
  // 3) Transfer mi? Transfer tipli işlem + kendine/iç hesap işareti
  const transferTipi = /transfer|virman|havale|eft|fast|gönderme|gonderme|para çek|para cek/.test(hepsi);
  const kendine =
    /virman|hesaptan para transfer|hesaplar aras|kendi hesab|yatırım hesab|yatirim hesab/.test(a) ||
    (sahipTokens.length >= 2 && sahipTokens.every((t) => a.includes(t)));
  if ((transferTipi && kendine) || /virman/.test(hepsi)) return "transfer";
  // 4) İşaret: çıkış gider, giriş gelir
  return miktar < 0 ? "gider" : "gelir";
}

// Ham ızgara (string[][]) → { ozet, islemler }
export function ekstreParse(rows) {
  rows = rows || [];
  // ---- Başlık bloğu: "etiket | değer" satırlarından özet alanları ----
  const ust = {};
  for (const r of rows) {
    const k = kucuk(r?.[0]);
    const v = (r?.[1] ?? "").toString().trim();
    if (!k || !v) continue;
    // IBAN'ı değerden de tanı (etiket "IBAN" küçükte "ıban" olabilir)
    if (!ust.iban && /^tr\d{2}[\d ]{12,}$/i.test(v)) ust.iban = v;
    if (/ad soyad|ünvan|unvan/.test(k) && !ust.sahip) ust.sahip = v;
    else if (/[iı]ban/.test(k) && !ust.iban) ust.iban = v;
    else if (/hesap numara/.test(k) && !ust.hesapNo) ust.hesapNo = v;
    else if (/hesap tür|hesap turu/.test(k) && !ust.hesapTur) ust.hesapTur = v;
    else if (/tarih aralı/.test(k) && !ust.donem) ust.donem = v;
  }

  // ---- Tablo başlık satırını bul (Tarih + Tutar içeren satır) ----
  let basIdx = -1;
  const idx = { tarih: -1, islem: -1, aciklama: -1, tutar: -1, bakiye: -1 };
  for (let r = 0; r < rows.length; r++) {
    const hucre = (rows[r] || []).map(kucuk);
    const tarihC = hucre.findIndex((c) => c === "tarih" || c === "i̇şlem tarihi" || c === "işlem tarihi");
    const tutarC = hucre.findIndex((c) => /tutar/.test(c) && !/bakiye/.test(c));
    if (tarihC !== -1 && tutarC !== -1) {
      basIdx = r;
      idx.tarih = tarihC;
      idx.tutar = tutarC;
      idx.islem = hucre.findIndex((c) => /^işlem$|^islem$|işlem tür|islem tur|tür$/.test(c));
      idx.aciklama = hucre.findIndex((c) => /açıklama|aciklama/.test(c));
      idx.bakiye = hucre.findIndex((c) => /bakiye/.test(c));
      break;
    }
  }
  if (basIdx === -1) return { ozet: ozetKur(ust), islemler: [] };

  // ---- Veri satırları ----
  const sahipTokens = kucuk(ust.sahip).split(/\s+/).filter((t) => t.length >= 3);
  const islemler = [];
  for (let r = basIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const tarih = tarihCevir(row[idx.tarih]);
    const tutarRaw = idx.tutar >= 0 ? row[idx.tutar] : "";
    if (!tarih || tutarRaw == null || String(tutarRaw).trim() === "") continue;
    const miktar = sayiCevir(tutarRaw);
    if (!miktar) continue;
    const islem = idx.islem >= 0 ? (row[idx.islem] || "") : "";
    const aciklama = idx.aciklama >= 0 ? (row[idx.aciklama] || "") : "";
    const bakiye = idx.bakiye >= 0 && String(row[idx.bakiye] ?? "").trim() !== "" ? sayiCevir(row[idx.bakiye]) : null;
    const tip = siniflandir(islem, aciklama, miktar, sahipTokens);
    const kategori = tip === "transfer" || tip === "odeme" ? null : kategoriTahmin(aciklama || islem, tip);
    islemler.push({
      tarih, miktar, bakiye, tip, kategori,
      islem: String(islem).trim(),
      aciklama: String(aciklama).trim() || String(islem).trim() || "İşlem",
    });
  }

  // ---- Güncel bakiye: en yeni satırın bakiyesi (sıralamayı tespit et) ----
  let sonBakiye = null;
  if (islemler.length) {
    const ilk = islemler[0].tarih, son = islemler[islemler.length - 1].tarih;
    const enYeni = ilk >= son ? islemler[0] : islemler[islemler.length - 1];
    sonBakiye = enYeni.bakiye;
  }

  return { ozet: ozetKur(ust, sonBakiye), islemler };
}

function ozetKur(ust, sonBakiye) {
  const banka = ibanBanka(ust.iban);
  const ibanD = String(ust.iban || "").replace(/[^0-9]/g, "");
  const son4 = ibanD ? ibanD.slice(-4) : String(ust.hesapNo || "").replace(/\D/g, "").slice(-4) || null;
  const kart = /kredi kart/.test(kucuk(ust.hesapTur));
  return {
    ekstreTipi: kart ? "kart" : "hesap",
    banka: banka || null,
    son4: son4 || null,
    sahip: ust.sahip || null,
    iban: ust.iban || null,
    donem: ust.donem || null,
    bakiye: sonBakiye != null ? sonBakiye : null,
  };
}
