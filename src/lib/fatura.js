// ============================================================
// Fatura/fiş zekâsı (saf, test edilebilir)
//   • gibKareParse  — GİB e-Arşiv/e-Fatura karekod veya metin → alanlar (AI'sız)
//   • faturaKategori — satıcı adından "Faturalar" tahmini (elektrik/su/gaz/internet)
//   • yinelenenFaturaMi — aynı satıcının önceki ayda faturası var mı
//   • kalemDogrula  — fiş kalemleri toplamı, fiş toplamıyla tutuyor mu (güven)
// ============================================================
import { sayiCevir } from "./format.js";

// ---- Tarih normalizasyonu → YYYY-MM-DD ----
function tarihNorm(s) {
  if (!s) return null;
  const t = String(s).trim();
  let m = t.match(/(\d{4})-(\d{2})-(\d{2})/); // ISO
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/); // DD.MM.YYYY veya DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

// ---- GİB karekod / fatura metni çözümleme ----
const TOPLAM_ANAHTAR = ["odenecek", "odenecektutar", "vergidahiltoplamtutar", "malhizmettoplamtutari", "toplamtutar", "toplam", "geneltoplam", "payableamount", "amount"];
const TARIH_ANAHTAR = ["tarih", "belgetarihi", "faturatarihi", "duzenlemetarihi", "date"];
const SATICI_ANAHTAR = ["unvan", "satici", "seller", "issuer", "adsoyadunvan", "ticariunvan"];
const VKN_ANAHTAR = ["vkn", "vkntckn", "tckn", "taxnumber", "vergino"];
const NO_ANAHTAR = ["no", "belgeno", "faturano", "ettn", "documentid"];

function normKey(k) {
  return String(k).toLowerCase().replace(/[^a-z0-9]/g, "");
}
function ilkEslesen(obj, anahtarlar) {
  const map = {};
  Object.keys(obj || {}).forEach((k) => { map[normKey(k)] = obj[k]; });
  for (const a of anahtarlar) if (map[a] != null && map[a] !== "") return map[a];
  return null;
}

// Metin → {satici, tarih, toplam, vkn, no} | null. JSON, "anahtar=değer" ve
// ";"/"|"/satır ayraçlı biçimleri tolere eder; hiçbir alan yoksa null.
export function gibKareParse(text) {
  if (!text) return null;
  const s = String(text).trim();
  let obj = null;
  try { const p = JSON.parse(s); if (p && typeof p === "object") obj = p; } catch { /* JSON değil */ }
  if (!obj) {
    obj = {};
    s.split(/[\n;|]+/).forEach((par) => {
      const mm = par.match(/^\s*([^:=]+?)\s*[:=]\s*(.+?)\s*$/);
      if (mm) obj[mm[1]] = mm[2];
    });
    if (!Object.keys(obj).length) return null;
  }
  const toplamRaw = ilkEslesen(obj, TOPLAM_ANAHTAR);
  const satici = ilkEslesen(obj, SATICI_ANAHTAR);
  const vkn = ilkEslesen(obj, VKN_ANAHTAR);
  const no = ilkEslesen(obj, NO_ANAHTAR);
  const tarih = tarihNorm(ilkEslesen(obj, TARIH_ANAHTAR));
  const toplam = toplamRaw != null ? sayiCevir(toplamRaw) : null;
  if (!toplam && !tarih && !satici) return null;
  return {
    satici: satici ? String(satici).trim() : null,
    tarih,
    toplam: toplam || null,
    vkn: vkn ? String(vkn).trim() : null,
    no: no ? String(no).trim() : null,
  };
}

// ---- Satıcıdan fatura kategorisi tahmini ----
// Türkçe İ/ı ve diakritikleri düzleştir (İSKİ.toLowerCase() birleşik nokta üretir):
// "İGDAŞ"→"igdas", "Doğalgaz"→"dogalgaz" → eşleşme diakritik-duyarsız olur.
function sadelestir(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}
const FATURA_ANAHTAR = [
  "elektrik", "enerji", "edas", "bedas", "ayedas", "aydem", "dicle", "gdz", "uedas", "meram", "toroslar", "akedas", "enerjisa",
  "su idare", "aski", "iski", "suski", "asat", "muski", "buski", "izsu", "kaski", "denizsu",
  "dogalgaz", "igdas", "gazdas", "bursagaz", "izgaz", "palgaz", "aksa gaz",
  "internet", "turkcell", "vodafone", "turk telekom", "ttnet", "superonline", "millenicom", "turknet", "kablonet", "d-smart", "dsmart",
  "fatura", "abonelik bedeli",
];

export function faturaKategori(satici) {
  const s = sadelestir(satici);
  if (!s) return null;
  return FATURA_ANAHTAR.some((k) => s.includes(k)) ? "Faturalar" : null;
}

// ---- Yinelenen fatura tespiti ----
// Aynı satıcının önceki bir ayda "Faturalar" kategorisinde kaydı var mı?
export function yinelenenFaturaMi(kayit, gecmisGiderler) {
  if (!kayit || !kayit.baslik) return false;
  const anahtar = String(kayit.baslik).toLowerCase().split(/\s+/)[0];
  if (!anahtar || anahtar.length < 3) return false;
  const ay = String(kayit.tarih || "").slice(0, 7);
  return (gecmisGiderler || []).some((g) => {
    const gAy = String(g.tarih || "").slice(0, 7);
    return gAy && ay && gAy < ay && g.kategori === "Faturalar" && String(g.baslik || "").toLowerCase().includes(anahtar);
  });
}

// ---- Fiş kalemleri toplam doğrulama (güven skoru) ----
// Kalem satırlarının toplamı fiş toplamıyla tolerans içinde mi?
export function kalemDogrula(kalemler, toplam, tolerans = 0.05) {
  const list = (kalemler || []).filter((k) => k && (+(k.fiyat ?? k.miktar) || 0) > 0);
  const kalemToplam = list.reduce((s, k) => s + (+(k.fiyat ?? k.miktar) || 0), 0);
  if (!toplam || !list.length) return { gecerli: null, kalemToplam, fark: 0, oran: 0, guven: list.length ? "orta" : "yok" };
  const fark = Math.abs(kalemToplam - toplam);
  const oran = fark / Math.abs(toplam);
  const gecerli = oran <= tolerans;
  return { gecerli, kalemToplam, fark, oran, guven: gecerli ? "yuksek" : oran <= 0.15 ? "orta" : "dusuk" };
}
