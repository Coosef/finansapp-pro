// ============================================================
// Para aritmetiği yardımcıları (item 10 — finansal hassasiyet).
// JS ikili float'ta 0.1+0.2 ≠ 0.3; kuruş-altı artıklar toplamlarda birikir.
// Bu modül deterministik kuruş (2 ondalık) yuvarlaması + güvenli toplam sağlar.
//
// NOT: Tutarlar hâlâ float (TL) olarak saklanır. Tam sayı (kuruş int) modeline
// geçiş bilinçli olarak ertelendi — bkz docs/adr/0001-para-hassasiyeti.md.
// Bu yüzden yeni değer ÜRETEN kritik noktalarda (kur çevrimi vb.) kurus()
// uygulanır; mevcut kayıtlar toplu DÖNÜŞTÜRÜLMEZ.
// ============================================================

// Bir sayıyı deterministik olarak 2 ondalığa (kuruş) yuvarla. Yarım kuruş
// sıfırdan UZAĞA yuvarlanır (simetrik); float temsil artığı EPSILON ile yutulur.
export function kurus(n) {
  const x = +n || 0;
  if (!isFinite(x)) return 0;
  const s = x < 0 ? -1 : 1;
  return (s * Math.round((Math.abs(x) + Number.EPSILON) * 100)) / 100;
}

// Bir listeyi kuruş-güvenli topla. sec: opsiyonel değer seçici (varsayılan: öğe).
export function paraTopla(liste, sec) {
  const f = typeof sec === "function" ? sec : (x) => x;
  return kurus((liste || []).reduce((acc, x) => acc + (+f(x) || 0), 0));
}

// İki para değeri yarım kuruştan yakınsa eşit say (float karşılaştırma tuzağı).
export function paraEsit(a, b) {
  return Math.abs((+a || 0) - (+b || 0)) < 0.005;
}
