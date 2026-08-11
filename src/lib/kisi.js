// ============================================================
// Hane kişileri / karşı hesaplar (saf, test edilebilir).
// Kendi + hanedeki kişilerin hesaplarına giden para TRANSFER'dir (harcama değil).
// Kişi = etiketli karşı taraf: { id, ad, hane, anahtarlar:[], iban?, son4?, not? }.
// Eşleşen gelir/gider transferAkis leg'ine (kisiId ile) taşınır → gelir/gidere girmez.
// ============================================================
import { uid } from "./format.js";

const kucuk = (s) => String(s ?? "").replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();

// Bir açıklama/iban verilen kişilerden hangisiyle eşleşir? (iban > son4 > anahtar)
export function kisiBul(kisiler, metin, iban) {
  const m = kucuk(metin);
  const ibanD = String(iban || "").replace(/\s/g, "").toLowerCase();
  for (const k of kisiler || []) {
    const kIban = String(k.iban || "").replace(/\s/g, "").toLowerCase();
    if (kIban && kIban.length >= 10 && ibanD && ibanD.includes(kIban)) return k;
    if (k.son4 && String(k.son4).length === 4 && m.includes(String(k.son4))) return k;
    for (const a of k.anahtarlar || []) {
      const ak = kucuk(a).trim();
      if (ak && ak.length >= 3 && m.includes(ak)) return k;
    }
  }
  return null;
}

// Bir transfer açıklamasını karşı-taraf anahtarına indir (tarih/saat/tutar/
// transfer-kelimelerini atıp ad benzeri ilk kelimeleri bırakır).
export function karsiAnahtar(aciklama) {
  let s = kucuk(aciklama);
  s = s
    .replace(/\d[\d.,:\/]*\d|\d/g, " ") // tarih/saat/tutar/rakamlar
    .replace(/\b(giden|gelen)\b/g, " ")
    .replace(/\b(transfer|havale|eft|fast|virman|gönderim|gonderim|ödeme|odeme|para\s*(gönder|gonder|çekme|cekme|yatırma|yatirma))\b/g, " ")
    .replace(/\b(ile|için|icin|no|tl|try)\b/g, " ")
    .replace(/[^a-zçğıöşü\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // İlk 2 anlamlı kelime (genelde ad soyad) → aynı kişinin farklı notlu
  // transferleri aynı anahtarda gruplanır.
  return s.split(" ").filter((w) => w.length >= 3).slice(0, 2).join(" ");
}

// Transfer benzeri mi? (kategori Gönderim ya da açıklamada transfer/havale/eft…)
const transferBenzeri = (x) =>
  x.kategori === "Gönderim" || /transfer|havale|\beft\b|\bfast\b|gönderim|gonderim|para ?gönder|para ?gonder/.test(kucuk(x.baslik));

// Mevcut transfer benzeri gelir/giderlerden, henüz kişiye eşleşmeyen adayları
// grupla (etiketleyip hane kişisi eklemek için). → [{anahtar, ornek, adet, toplam, yon}]
export function haneAdaylari(findata) {
  const d = findata || {};
  const kisiler = d.kisiler || [];
  const grup = {};
  const ekle = (x, yon) => {
    if (!transferBenzeri(x)) return;
    if (kisiBul(kisiler, x.baslik, x.iban)) return; // zaten tanımlı
    const anahtar = karsiAnahtar(x.baslik);
    if (!anahtar) return;
    const g = (grup[anahtar] = grup[anahtar] || { anahtar, ornek: x.baslik, adet: 0, toplam: 0, yon });
    g.adet++;
    g.toplam += Math.abs(+x.miktar || 0);
  };
  (d.giderler || []).forEach((x) => ekle(x, "gider"));
  (d.gelirler || []).forEach((x) => ekle(x, "gelir"));
  return Object.values(grup).sort((a, b) => b.toplam - a.toplam);
}

// Var olan gelir/gideri hane kişilerine göre yeniden sınıfla → transferAkis leg'ine
// taşı (kisiId ile). Bakiyeye dokunmaz (para zaten hesaptan çıkmış/girmiştir).
// { data, tasindi } döner; çağıran geri-al için önceki durumu saklayabilir.
export function haneYenidenSinifla(findata) {
  const d = findata || {};
  const hane = (d.kisiler || []).filter((k) => k.hane);
  if (!hane.length) return { data: findata, tasindi: 0 };
  const gelirler = [], giderler = [];
  const yeniLegs = [];
  let tasindi = 0, i = 0;
  const isle = (liste, yon) =>
    (liste || []).forEach((x) => {
      const k = kisiBul(hane, x.baslik, x.iban);
      if (k) {
        yeniLegs.push({ id: uid() + 5000 + i++, hesapId: x.hesapId || "", tarih: x.tarih, miktar: yon === "gider" ? -Math.abs(+x.miktar || 0) : Math.abs(+x.miktar || 0), aciklama: x.baslik, kisiId: k.id });
        tasindi++;
      } else {
        (yon === "gider" ? giderler : gelirler).push(x);
      }
    });
  isle(d.gelirler, "gelir");
  isle(d.giderler, "gider");
  if (!tasindi) return { data: findata, tasindi: 0 };
  return { data: { ...d, gelirler, giderler, transferAkis: [...(d.transferAkis || []), ...yeniLegs] }, tasindi };
}
