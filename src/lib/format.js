// ============================================================
// Biçimlendirme ve küçük yardımcı fonksiyonlar
// ============================================================

export const TL = (n) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n || 0);

export const TL2 = (n) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n || 0);

export const bugun = () => new Date().toISOString().split("T")[0];
export const buAy = () => new Date().toISOString().slice(0, 7);

// Çakışma riski düşük benzersiz id
export const uid = () => Date.now() + Math.floor(Math.random() * 100000);

export function sonrakiTarih(dateStr, frekans) {
  // UTC ile çalış: saat diliminden bağımsız, kararlı takvim aritmetiği
  const [y, m, gun] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, gun));
  if (frekans === "haftalık") d.setUTCDate(d.getUTCDate() + 7);
  else if (frekans === "yıllık") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().split("T")[0];
}

export function aylikEsdeger(miktar, frekans) {
  return frekans === "haftalık" ? miktar * 4.33 : frekans === "yıllık" ? miktar / 12 : miktar;
}

export function kategoriAnahtar(baslik) {
  return (baslik || "").toLowerCase().trim().split(/\s+/).slice(0, 2).join(" ");
}

// AI metin yanıtından sayı çıkar (Türkçe ondalık formatlarını da çözer)
export function sayiCikar(txt) {
  const m = (txt || "").match(/[\d.,]+/);
  if (!m) return NaN;
  let s = m[0];
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  return parseFloat(s);
}

// AI yanıtındaki JSON'u (```json bloklarını temizleyerek) ayrıştır
export function parseJSON(text) {
  const clean = (text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  // İlk { veya [ ile son } veya ] arasını al (yerel modeller öncesine/sonrasına metin ekleyebilir)
  const start = Math.min(
    ...["{", "["].map((c) => {
      const i = clean.indexOf(c);
      return i === -1 ? Infinity : i;
    })
  );
  const end = Math.max(clean.lastIndexOf("}"), clean.lastIndexOf("]"));
  const sub = start === Infinity || end === -1 || end < start ? clean : clean.slice(start, end + 1);
  try {
    return JSON.parse(sub);
  } catch (ilkHata) {
    // Yaygın LLM hataları: yorumlar, sondaki virgül, öğeler arası EKSİK virgül
    const onar = sub
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/,(\s*[}\]])/g, "$1") // sondaki virgül
      .replace(/}(\s*){/g, "},$1{") // iki nesne arası eksik virgül
      .replace(/](\s*)\[/g, "],$1[") // iki dizi arası eksik virgül
      .replace(/"(\s*\n\s*)"/g, '",$1"'); // iki string arası eksik virgül
    try {
      return JSON.parse(onar);
    } catch (e) {
      // Son çare: kesik/bozuk yanıttan tam nesneleri kurtar (yoğun sayfa truncation)
      const kurtarilan = kurtarParse(clean);
      if (kurtarilan) return kurtarilan;
      throw ilkHata;
    }
  }
}

// Dengeli { } nesnelerini metinden ayıklar (eksik/kesik olanı atlar)
function dengeliNesneler(text) {
  const out = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") { if (depth === 0) start = i; depth++; }
    else if (c === "}") { if (depth > 0) { depth--; if (depth === 0 && start >= 0) { try { out.push(JSON.parse(text.slice(start, i + 1))); } catch { /* yarım nesne */ } start = -1; } } }
  }
  return out;
}

// Kesik {ozet, islemler:[...]} yanıtından mümkün olduğunca çok işlem kurtar
function kurtarParse(text) {
  const ai = text.indexOf('"islemler"');
  if (ai < 0) return null;
  const ab = text.indexOf("[", ai);
  if (ab < 0) return null;
  const islemler = dengeliNesneler(text.slice(ab + 1));
  if (!islemler.length) return null;
  let ozet = null;
  const oi = text.indexOf('"ozet"');
  if (oi >= 0 && oi < ai) {
    const ob = text.indexOf("{", oi);
    if (ob >= 0) ozet = dengeliNesneler(text.slice(ob))[0] || null;
  }
  return { ozet, islemler };
}

export function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
