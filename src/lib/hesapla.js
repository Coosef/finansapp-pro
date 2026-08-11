// ============================================================
// Ortak finansal hesaplama katmanı (saf, test edilebilir).
// TEK doğruluk kaynağı: Panel, Analiz, Rapor, Karne hepsi bunu kullanır ki
// aynı "gelir/gider/tasarruf" her ekranda AYNI çıksın.
//
// Kanon kurallar:
//  - giderToplam = giderKalem (giderler) + aboneAylik * (dönemdeki ay sayısı)
//    Abonelik aylık tekrar eden giderdir; ay-bazlı dönemde bir kez, yılda 12 kez.
//  - Transfer ve kredi kartı borç ödemesi gelir/gidere HİÇ girmez (zaten
//    gelirler/giderler listelerinde değildir; transferAkis'te tutulur).
// ============================================================
import { donemAraligi, donemde } from "./finance.js";

const topla = (liste) => (liste || []).reduce((s, x) => s + (+x.miktar || 0), 0);

// Bir dönemde kaç "aylık abonelik döngüsü" sayılır? Yıl → 12, aksi halde 1.
function aboneCarpani(donem) {
  return donem === "buYil" ? 12 : 1;
}

// Kategori dağılımı: {kategori: toplam} → azalan sıralı [{kategori, toplam, pct}]
export function kategoriDagilim(giderler) {
  const kat = {};
  (giderler || []).forEach((g) => {
    const k = g.kategori || "Diğer";
    kat[k] = (kat[k] || 0) + (+g.miktar || 0);
  });
  const toplam = Object.values(kat).reduce((s, v) => s + v, 0);
  return Object.entries(kat)
    .map(([kategori, tutar]) => ({ kategori, toplam: tutar, pct: toplam > 0 ? (tutar / toplam) * 100 : 0 }))
    .sort((a, b) => b.toplam - a.toplam);
}

// Bir aralık (start/end veya null) için özet üret. donem: abone çarpanı için.
function araliktanOzet(findata, aralik, donem) {
  const d = findata || {};
  const gelirler = (d.gelirler || []).filter((g) => donemde(g.tarih, aralik));
  const giderler = (d.giderler || []).filter((g) => donemde(g.tarih, aralik));
  const gelir = topla(gelirler);
  const giderKalem = topla(giderler);
  const aboneAylik = topla(d.abonelikler);
  const abone = aboneAylik * aboneCarpani(donem);
  const giderToplam = giderKalem + abone;
  const net = gelir - giderToplam;
  const tasarrufOrani = gelir > 0 ? (net / gelir) * 100 : 0;
  return {
    aralik, gelirler, giderler,
    gelir, giderKalem, aboneAylik, abone, giderToplam,
    net, tasarrufOrani,
    kategoriler: kategoriDagilim(giderler),
  };
}

// Seçili döneme göre özet (buAy | gecenAy | buYil | tum). Ana giriş noktası.
export function donemHesap(findata, donem, bugunStr) {
  const aralik = donemAraligi(donem, bugunStr);
  return araliktanOzet(findata, aralik, donem);
}

// "YYYY-MM" → { start, end } (ayın ilk/son günü, UTC kararlı)
export function ayAraligi(ay) {
  const [y, m] = String(ay).split("-").map(Number);
  const iso = (dd) => new Date(Date.UTC(y, m - 1, dd)).toISOString().slice(0, 10);
  const son = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: iso(1), end: iso(son) };
}

// "YYYY-MM" → bir önceki ay
export function oncekiAy(ay) {
  const [y, m] = String(ay).split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

// Belirli bir ayın özeti (abone ×1). Karne/maaş durumu/MoM için.
export function aylikHesap(findata, ay) {
  return araliktanOzet(findata, ayAraligi(ay), "ay");
}

const farkNesne = (bu, onceki) => {
  const fark = bu - onceki;
  const pct = onceki !== 0 ? (fark / Math.abs(onceki)) * 100 : null;
  return { bu, onceki, fark, pct };
};

// Bir ayı önceki ayla karşılaştır: her metrik için {bu, onceki, fark, pct}.
// pct null → önceki ay tabanı 0 (yeni kalem, oran anlamsız).
export function aylikKarsilastir(findata, ay) {
  const bu = aylikHesap(findata, ay);
  const onceki = aylikHesap(findata, oncekiAy(ay));
  const alanlar = ["gelir", "giderKalem", "giderToplam", "net", "tasarrufOrani"];
  const degisim = {};
  alanlar.forEach((a) => { degisim[a] = farkNesne(bu[a], onceki[a]); });
  // Kategori bazlı MoM (birleşik kategori kümesi)
  const map = (liste) => Object.fromEntries((liste || []).map((k) => [k.kategori, k.toplam]));
  const buKat = map(bu.kategoriler), onKat = map(onceki.kategoriler);
  const katlar = new Set([...Object.keys(buKat), ...Object.keys(onKat)]);
  degisim.kategoriler = {};
  katlar.forEach((k) => { degisim.kategoriler[k] = farkNesne(buKat[k] || 0, onKat[k] || 0); });
  return { bu, onceki, degisim };
}
