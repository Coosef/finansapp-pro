// ============================================================
// Finansal ÖZETLER — TAMAMEN mevcut saf helper'lardan türetilir (paralel matematik YOK):
//   /bakiye  → lib/ozet.js netVarlik = nakit + yatırım (App.jsx üst-bar başlığı)
//   /buay    → lib/hesapla.js donemHesap(..,"buAy") (Panel/Analiz ile aynı kaynak)
//   Bugün    → tarih===bugün gelir/gider filtresi + lib/siniftur turEtkisi ile gün toplamı
//   Hesaplar → lib/ozet.js hesap varlık/borç/net (accounts.jsx ile birebir)
// READ-ONLY: hiçbir yazma yok.
// ============================================================
import { bugun as bugunBul } from "../../src/lib/format.js";
import { bosVeri } from "../../src/lib/finance.js";
import { donemHesap } from "../../src/lib/hesapla.js";
import { turEtkisi } from "../../src/lib/siniftur.js";
import { netVarlik, nakitToplam, yatirimDegeri, hesapVarlikToplam, hesapBorcToplam, hesapNet } from "../../src/lib/ozet.js";

// PB /data'dan gelen findata'yı güvenli tabana bindir (eski/eksik alanlar dolar).
export const guvenliFindata = (data) => ({ ...bosVeri(), ...(data || {}) });

// /bakiye → Net Varlık (netDeger) + kırılım (Net Nakit + Yatırım).
export function bakiyeOzeti(findata) {
  const d = guvenliFindata(findata);
  return { netVarlik: netVarlik(d), nakit: nakitToplam(d), yatirim: yatirimDegeri(d) };
}

// /buay & 📅 Bu Ay → donemHesap "buAy" (kanonik gelir/gider/net/tasarruf/kategori).
export function buAyOzeti(findata, bugunStr = bugunBul()) {
  const d = guvenliFindata(findata);
  const oz = donemHesap(d, "buAy", bugunStr);
  return { gelir: oz.gelir, giderToplam: oz.giderToplam, net: oz.net, tasarrufOrani: oz.tasarrufOrani, kategoriler: oz.kategoriler.slice(0, 5) };
}

// 📊 Bugün → tarih===bugün işlemleri + günün gelir/gider toplamı (turEtkisi ile tutarlı).
export function bugunOzeti(findata, bugunStr = bugunBul()) {
  const d = guvenliFindata(findata);
  const bugunku = (liste, taban) => (liste || [])
    .filter((x) => String(x.tarih || "").slice(0, 10) === bugunStr)
    .map((x) => ({ baslik: x.baslik || x.kategori || "İşlem", kategori: x.kategori || "", miktar: +x.miktar || 0, taban, etki: turEtkisi(x, taban) }));
  const gelirler = bugunku(d.gelirler, "gelir");
  const giderler = bugunku(d.giderler, "gider");
  // araliktanOzet ile aynı çapraz-toplam: gelir katkısı iki listeden, gider katkısı iki listeden.
  const gunGelir = [...gelirler, ...giderler].reduce((s, x) => s + x.etki.gelir, 0);
  const gunGider = [...gelirler, ...giderler].reduce((s, x) => s + x.etki.gider, 0);
  return { tarih: bugunStr, gelirler, giderler, gunGelir, gunGider, islemSayisi: gelirler.length + giderler.length };
}

// 💳 Hesaplar → hesap başına bakiye + Varlık(kart-dışı) − Borç(kart) = Net.
export function hesaplarOzeti(findata) {
  const d = guvenliFindata(findata);
  const hesaplar = (d.hesaplar || []).map((h) => ({ ad: h.ad || "Hesap", tip: h.tip || "banka", bakiye: +h.bakiye || 0 }));
  return { hesaplar, varlik: hesapVarlikToplam(d), borc: hesapBorcToplam(d), net: hesapNet(d) };
}
