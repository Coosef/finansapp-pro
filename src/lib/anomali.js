// ============================================================
// Harcama anomalileri (saf, test edilebilir)
// sessizZamlar: tekrarlayan bir giderin (abonelik/fatura) tutarı önceki aylarda
// STABİLKEN son ayda belirgin arttıysa "sessiz zam" olarak işaretler. Stabillik
// koşulu, düzensiz harcamaların (market vb.) yanlış alarm vermesini engeller.
// ============================================================
import { kategoriAnahtar } from "./format.js";

export function sessizZamlar(findata, esikPct = 8) {
  const gruplar = {};
  for (const x of (findata?.giderler || [])) {
    if (!x.tarih || !(x.miktar > 0)) continue;
    if (/taksit/i.test(x.baslik || "")) continue; // taksitler zam değil
    const anahtar = kategoriAnahtar(x.baslik);
    if (!anahtar || anahtar.length < 3) continue;
    (gruplar[anahtar] = gruplar[anahtar] || []).push(x);
  }
  const zamlar = [];
  for (const [anahtar, kayitlar] of Object.entries(gruplar)) {
    const aylik = {};
    kayitlar.forEach((k) => { const ay = k.tarih.slice(0, 7); (aylik[ay] = aylik[ay] || []).push(k.miktar); });
    const aylar = Object.keys(aylik).sort();
    if (aylar.length < 3) continue; // tekrarlayan sayılmaz
    const ort = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const aylikOrt = aylar.map((a) => ort(aylik[a]));
    const oncekiler = aylikOrt.slice(0, -1);
    const yeni = aylikOrt[aylikOrt.length - 1];
    const baz = ort(oncekiler);
    if (baz <= 0) continue;
    const stabil = oncekiler.every((v) => Math.abs(v - baz) / baz <= 0.08); // önceki aylar tutarlı
    const artis = (yeni - baz) / baz;
    if (stabil && artis >= esikPct / 100) {
      const son = kayitlar.filter((k) => k.tarih.slice(0, 7) === aylar[aylar.length - 1]).pop() || kayitlar[kayitlar.length - 1];
      zamlar.push({
        baslik: son.baslik,
        anahtar,
        eskiTutar: Math.round(baz * 100) / 100,
        yeniTutar: Math.round(yeni * 100) / 100,
        artisPct: Math.round(artis * 100),
        ayCount: aylar.length,
        kategori: son.kategori,
      });
    }
  }
  return zamlar.sort((a, b) => b.artisPct - a.artisPct);
}
