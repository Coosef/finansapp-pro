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
  const d = new Date(dateStr + "T00:00:00");
  if (frekans === "haftalık") d.setDate(d.getDate() + 7);
  else if (frekans === "yıllık") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
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
  const start = Math.min(
    ...["{", "["].map((c) => {
      const i = clean.indexOf(c);
      return i === -1 ? Infinity : i;
    })
  );
  return JSON.parse(start === Infinity ? clean : clean.slice(start));
}

export function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
