// ============================================================
// Nakit akış projeksiyonu (saf, test edilebilir)
// Likit (kart olmayan) hesap bakiyesinden başlayıp, önümüzdeki `gun` içindeki
// gelecek gelir/gider (taksitler dahil), abonelik ve tekrarlayan şablonları
// tarih sırasıyla uygulayarak yürüyen bakiyeyi ve ilk eksiye düşüşü çıkarır.
// ============================================================
import { sonrakiTarih } from "./format.js";

function tarihEkle(s, gun) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + gun)).toISOString().slice(0, 10);
}
// [start, end] aralığında her ayın `gun`'ündeki tarihler (start hariç, end dahil)
function aylikGunler(start, end, gun) {
  const out = [];
  let [y, m] = String(start).split("-").map(Number);
  for (let i = 0; i < 14; i++) {
    const t = new Date(Date.UTC(y, m - 1, gun)).toISOString().slice(0, 10);
    if (t > end) break;
    if (t > start) out.push(t);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

export function nakitAkisProjeksiyon(findata, bugunStr, gun = 45) {
  const d = findata || {};
  const bit = tarihEkle(bugunStr, gun);
  const likit = (d.hesaplar || []).filter((h) => h.tip !== "kart");
  const baslangic = likit.reduce((s, h) => s + (+h.bakiye || 0), 0);
  const olaylar = [];
  const kayit = (tarih, tutar, etiket) => {
    const t = String(tarih || "").slice(0, 10);
    if (t > bugunStr && t <= bit) olaylar.push({ tarih: t, tutar, etiket });
  };
  (d.giderler || []).forEach((g) => kayit(g.tarih, -(g.miktar || 0), g.baslik));
  (d.gelirler || []).forEach((g) => kayit(g.tarih, +(g.miktar || 0), g.baslik));
  (d.abonelikler || []).forEach((a) => {
    const gd = parseInt(String(a.tarih || "").slice(8, 10), 10) || 1;
    aylikGunler(bugunStr, bit, gd).forEach((t) => kayit(t, -(a.miktar || 0), a.baslik));
  });
  (d.sablonlar || []).forEach((s) => {
    const isaret = s.tip === "gelir" ? 1 : -1;
    let cursor = s.sonUretilen ? sonrakiTarih(s.sonUretilen, s.frekans) : s.baslangic;
    let guard = 0;
    while (cursor && cursor <= bit && guard < 400) {
      kayit(cursor, isaret * (s.miktar || 0), s.baslik);
      cursor = sonrakiTarih(cursor, s.frekans);
      guard++;
    }
  });

  olaylar.sort((a, b) => a.tarih.localeCompare(b.tarih));
  let bakiye = baslangic;
  const seri = [{ tarih: bugunStr, bakiye }];
  let ilkEksi = null;
  let enDusuk = { tarih: bugunStr, bakiye };
  let toplamGider = 0, toplamGelir = 0;
  for (const o of olaylar) {
    bakiye += o.tutar;
    if (o.tutar < 0) toplamGider += -o.tutar; else toplamGelir += o.tutar;
    seri.push({ tarih: o.tarih, bakiye, etiket: o.etiket });
    if (bakiye < enDusuk.bakiye) enDusuk = { tarih: o.tarih, bakiye };
    if (ilkEksi === null && bakiye < 0) ilkEksi = { tarih: o.tarih, bakiye };
  }
  return { baslangic, bitis: bakiye, seri, ilkEksi, enDusuk, toplamGider, toplamGelir, olaySayisi: olaylar.length, likitHesapVar: likit.length > 0 };
}
