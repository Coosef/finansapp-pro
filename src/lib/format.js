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

// AI/fiş yanıtındaki tarihi güvenli ISO "YYYY-MM-DD"ye çevir. ISO, DD.MM.YYYY,
// DD/MM/YY biçimlerini kabul eder; çözülemez/geçersiz takvim günü → fallback (bugün).
// Neden: dashboard hızlı-fiş akışında bozuk tarih, dönem filtresini kırıp işlemi
// "eklendi ama görünmüyor" hâline getiriyordu.
export function tarihNormalize(raw, fallback = bugun()) {
  const s = String(raw ?? "").trim();
  if (!s) return fallback;
  let y, mo, d;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // ISO
  if (m) { [, y, mo, d] = m; }
  else {
    m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/); // DD.MM.YYYY / DD/MM/YY
    if (!m) return fallback;
    [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
  }
  y = +y; mo = +mo; d = +d;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1970 || y > 3000) return fallback;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(iso + "T00:00:00Z"); // gerçek takvim günü mü (31 Şubat'ı reddet)
  if (isNaN(+dt) || dt.getUTCMonth() + 1 !== mo || dt.getUTCDate() !== d) return fallback;
  return iso;
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

// Kullanıcı girişinden tutar/sayı çöz. Türkçe biçim varsayılan: nokta binlik,
// virgül ondalık. Örnekler:
//   "100.000"   → 100000      "1.234.567" → 1234567
//   "1.234,56"  → 1234.56     "100,5"     → 100.5
//   "100.50"    → 100.5  (tek nokta + 1-2 hane = ondalık; binlik grupları 3 hanedir)
//   "1,234.56"  → 1234.56 (İngilizce biçim de tolere edilir)
export function sayiCevir(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v ?? "").trim();
  if (!s) return 0;
  const negatif = /^-/.test(s);
  s = s.replace(/[^\d.,]/g, ""); // ₺, boşluk, harf vb. at
  if (!s) return 0;
  const sonNokta = s.lastIndexOf(".");
  const sonVirgul = s.lastIndexOf(",");
  if (sonNokta !== -1 && sonVirgul !== -1) {
    // İkisi de var → en sağdaki ondalık ayraçtır
    if (sonVirgul > sonNokta) s = s.replace(/\./g, "").replace(",", "."); // 1.234,56 (Türkçe)
    else s = s.replace(/,/g, ""); // 1,234.56 (İngilizce binlik virgül)
  } else if (sonVirgul !== -1) {
    // Sadece virgül: tek virgül = ondalık; birden çok = İngilizce binlik
    if ((s.match(/,/g) || []).length > 1) s = s.replace(/,/g, "");
    else s = s.replace(",", ".");
  } else if (sonNokta !== -1) {
    // Sadece nokta: tek nokta + son grup 1-2 hane → ondalık; aksi halde binlik
    const p = s.split(".");
    if (!(p.length === 2 && p[1].length < 3)) s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return negatif ? -n : n;
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
