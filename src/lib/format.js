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
  } catch {
    // Yaygın LLM hataları: yorumlar, sondaki virgül, öğeler arası EKSİK virgül
    const onar = sub
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/,(\s*[}\]])/g, "$1") // sondaki virgül
      .replace(/}(\s*){/g, "},$1{") // iki nesne arası eksik virgül
      .replace(/](\s*)\[/g, "],$1[") // iki dizi arası eksik virgül
      .replace(/"(\s*\n\s*)"/g, '",$1"'); // iki string arası eksik virgül
    return JSON.parse(onar);
  }
}

export function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
