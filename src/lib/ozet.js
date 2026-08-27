// ============================================================
// Net varlık / nakit / yatırım — TEK doğruluk kaynağı (saf, test edilebilir).
// App.jsx (tarayıcı) VE Telegram gateway (Node) bu helper'ları paylaşır ki
// "Net Varlık / Net Nakit / Yatırım" her yerde AYNI çıksın (paralel matematik yok).
//
// Formüller App.jsx:448-463'ten source-derived; davranış birebir korunur:
//  - yatırım güncel değeri = adet * (guncelFiyat || alisFiyati)
//  - hesap net = kart-dışı bakiye toplamı − kart bakiye toplamı
//  - nakit = HESAP VARSA hesap net; yoksa akış (gelir − gider − abonelik) — RAW miktar,
//    tür-ayarı (siniftur) net-varlıkta UYGULANMAZ (mevcut davranış).
//  - net varlık = nakit + yatırım
// ============================================================

export const yatirimGuncelDeger = (y) => (+y.adet || 0) * (+y.guncelFiyat || +y.alisFiyati || 0);

export function yatirimDegeri(findata) {
  return (findata?.yatirimlar || []).reduce((s, y) => s + yatirimGuncelDeger(y), 0);
}

export function hesapVarlikToplam(findata) {
  return (findata?.hesaplar || []).filter((h) => h.tip !== "kart").reduce((s, h) => s + (+h.bakiye || 0), 0);
}

export function hesapBorcToplam(findata) {
  return (findata?.hesaplar || []).filter((h) => h.tip === "kart").reduce((s, h) => s + (+h.bakiye || 0), 0);
}

export function hesapNet(findata) {
  return hesapVarlikToplam(findata) - hesapBorcToplam(findata);
}

// Net nakit: hesap varsa gerçek bakiyeden (varlık−kart borcu); yoksa akış modeli.
export function nakitToplam(findata) {
  const d = findata || {};
  if ((d.hesaplar || []).length > 0) return hesapNet(d);
  const gelir = (d.gelirler || []).reduce((s, x) => s + (+x.miktar || 0), 0);
  const gider = (d.giderler || []).reduce((s, x) => s + (+x.miktar || 0), 0);
  const abone = (d.abonelikler || []).reduce((s, x) => s + (+x.miktar || 0), 0);
  return gelir - gider - abone;
}

// Net varlık = net nakit + yatırım güncel değeri (App.jsx üst-bar + Panel ana KPI başlığı).
export function netVarlik(findata) {
  return nakitToplam(findata) + yatirimDegeri(findata);
}
