// ============================================================
// Taksit takibi (saf, test edilebilir)
// Ekstreden gelen taksit giderleri başlıkta "(taksit N/M)" taşır ve her taksit
// ayrı, tarihli bir gider kaydıdır. Buradan aktif planları, aylık yükü ve kalan
// borcu çıkarırız. Ağ/DOM bağımlılığı yok.
// ============================================================

// "N11 ALISVERIS (25,499.15 TL) (taksit 5/9)" → { temiz:"N11 ALISVERIS", no:5, toplam:9 }
export function taksitAyristir(baslik) {
  const b = String(baslik || "");
  const m = b.match(/\(?\s*taksit\s*(\d+)\s*\/\s*(\d+)\s*\)?/i);
  if (!m) return null;
  const no = parseInt(m[1], 10);
  const toplam = parseInt(m[2], 10);
  if (!toplam) return null;
  const temiz = b
    .replace(/\(?\s*taksit\s*\d+\s*\/\s*\d+\s*\)?/i, "") // "(taksit 5/9)" at
    .replace(/\(\s*[\d.,]+\s*(?:TL|₺|tl)?\s*\)/i, "") // "(25,499.15 TL)" tutar parantezi at
    .replace(/\s{2,}/g, " ")
    .trim();
  return { temiz, no, toplam };
}

// Bir gider kaydı taksit mi?
function taksitMi(x) {
  return x && (x.kaynak === "taksit" || /taksit/i.test(x.baslik || ""));
}

// Aktif taksit planları — bugüne göre kalan (gelecek) taksiti olanlar.
// Her plan: { baslik, toplamTaksit, aylikTutar, odenmis, kalan, kalanTutar, sonrakiTarih, sonrakiNo }
export function taksitPlanlari(findata, bugunStr) {
  const g = (findata?.giderler || []).filter(taksitMi);
  const planlar = {};
  for (const x of g) {
    const p = taksitAyristir(x.baslik);
    if (!p) continue;
    const anahtar = `${p.temiz}__${p.toplam}`;
    const pl = planlar[anahtar] || (planlar[anahtar] = { baslik: p.temiz, toplamTaksit: p.toplam, aylikTutar: 0, odenmis: 0, kalan: 0, kalanTutar: 0, sonrakiTarih: null, sonrakiNo: null });
    pl.aylikTutar = Math.max(pl.aylikTutar, x.miktar || 0);
    if ((x.tarih || "") > bugunStr) {
      pl.kalan++;
      pl.kalanTutar += x.miktar || 0;
      if (!pl.sonrakiTarih || x.tarih < pl.sonrakiTarih) { pl.sonrakiTarih = x.tarih; pl.sonrakiNo = p.no; }
    } else {
      pl.odenmis++;
    }
  }
  return Object.values(planlar)
    .filter((p) => p.kalan > 0)
    .sort((a, b) => String(a.sonrakiTarih).localeCompare(String(b.sonrakiTarih)));
}

// Önümüzdeki ayCount ay için aylık taksit yükü (gelecek taksit giderleri toplamı).
export function aylikTaksitYuku(findata, bugunStr, ayCount = 6) {
  const aylar = {};
  (findata?.giderler || [])
    .filter((x) => taksitMi(x) && (x.tarih || "") > bugunStr)
    .forEach((x) => { const ay = (x.tarih || "").slice(0, 7); aylar[ay] = (aylar[ay] || 0) + (x.miktar || 0); });
  return Object.entries(aylar).sort().slice(0, ayCount).map(([ay, tutar]) => ({ ay, tutar }));
}

// Tüm gelecek taksitlerin toplamı = kalan taksit borcu.
export function kalanTaksitBorcu(findata, bugunStr) {
  return (findata?.giderler || [])
    .filter((x) => taksitMi(x) && (x.tarih || "") > bugunStr)
    .reduce((s, x) => s + (x.miktar || 0), 0);
}
