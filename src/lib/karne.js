// ============================================================
// Aylık finans karnesi + runway (saf, test edilebilir)
//   aylikKarne: bir ayın tasarruf oranı, notu, en büyük kategori, ay-üstü değişim
//   runwayAy: likit bakiye ÷ son 3 ayın ortalama gideri → kaç ay dayanır
// ============================================================

function oncekiAy(ayStr) {
  const [y, m] = String(ayStr).split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}
const inAy = (arr, ay) => (arr || []).filter((x) => (x.tarih || "").startsWith(ay));

export function aylikKarne(findata, ayStr) {
  const d = findata || {};
  const gid = inAy(d.giderler, ayStr);
  const gel = inAy(d.gelirler, ayStr);
  const toplamGider = gid.reduce((s, x) => s + (x.miktar || 0), 0);
  const toplamGelir = gel.reduce((s, x) => s + (x.miktar || 0), 0);
  const net = toplamGelir - toplamGider;
  const tasarrufOrani = toplamGelir > 0 ? Math.round((net / toplamGelir) * 100) : null;

  const kat = {};
  gid.forEach((x) => { kat[x.kategori] = (kat[x.kategori] || 0) + (x.miktar || 0); });
  const sirali = Object.entries(kat).sort((a, b) => b[1] - a[1]);
  const enBuyukKategori = sirali[0]
    ? { ad: sirali[0][0], tutar: sirali[0][1], oran: toplamGider > 0 ? Math.round((sirali[0][1] / toplamGider) * 100) : 0 }
    : null;

  const oncekiGider = inAy(d.giderler, oncekiAy(ayStr)).reduce((s, x) => s + (x.miktar || 0), 0);
  const degisimPct = oncekiGider > 0 ? Math.round(((toplamGider - oncekiGider) / oncekiGider) * 100) : null;

  const not = tasarrufOrani == null ? "—" : tasarrufOrani >= 30 ? "A" : tasarrufOrani >= 20 ? "B" : tasarrufOrani >= 10 ? "C" : tasarrufOrani >= 0 ? "D" : "F";

  return { ay: ayStr, toplamGelir, toplamGider, net, tasarrufOrani, enBuyukKategori, degisimPct, islemSayisi: gid.length + gel.length, not };
}

// Likit (kart olmayan) bakiye, son 3 ayın ortalama giderine bölünür → dayanma süresi (ay).
export function runwayAy(findata, bugunStr) {
  const d = findata || {};
  const likit = (d.hesaplar || []).filter((h) => h.tip !== "kart").reduce((s, h) => s + (+h.bakiye || 0), 0);
  const [y, m] = String(bugunStr).slice(0, 7).split("-").map(Number);
  const aylar = [0, 1, 2].map((k) => new Date(Date.UTC(y, m - 1 - k, 1)).toISOString().slice(0, 7));
  const toplam = aylar.reduce((s, ay) => s + inAy(d.giderler, ay).reduce((a, x) => a + (x.miktar || 0), 0), 0);
  const aylikGider = toplam / 3;
  if (aylikGider <= 0) return null;
  return { likit, aylikGider: Math.round(aylikGider), ay: Math.round((likit / aylikGider) * 10) / 10 };
}
