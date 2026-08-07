// ============================================================
// Bildirim özeti (saf, test edilebilir)
// Bugün için bildirilmeye değer uyarıları tek listede toplar:
// yaklaşan ödemeler + kredi kartı son ödemeleri + nakit akış eksi uyarısı + sessiz zam.
// App bunu tarayıcı bildirimi gövdesi olarak kullanır.
// ============================================================
import { yaklasanOdemeler, kartOdemeler } from "./finance.js";
import { nakitAkisProjeksiyon } from "./nakitakis.js";
import { sessizZamlar } from "./anomali.js";
import { TL } from "./format.js";

export function bildirimOzeti(findata, bugunStr, gun = 3) {
  const satirlar = [];

  const odeme = [...yaklasanOdemeler(findata, bugunStr, gun), ...kartOdemeler(findata, bugunStr, Math.max(gun, 7))]
    .sort((a, b) => a.gun - b.gun)
    .slice(0, 3);
  odeme.forEach((y) => satirlar.push(`${y.gun === 0 ? "Bugün" : y.gun + " gün"}: ${y.ad} · ${TL(y.miktar)}`));

  const proj = nakitAkisProjeksiyon(findata, bugunStr, 45);
  if (proj.ilkEksi) satirlar.push(`⚠ ${proj.ilkEksi.tarih}: bakiye eksiye düşebilir (${TL(proj.ilkEksi.bakiye)})`);

  const zam = sessizZamlar(findata);
  if (zam.length) satirlar.push(`🔔 ${zam.length} kalemde sessiz zam — ör. ${zam[0].baslik} +%${zam[0].artisPct}`);

  return satirlar.slice(0, 5);
}
