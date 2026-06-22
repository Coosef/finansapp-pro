// ============================================================
// Görseller: para akışı (Sankey) + harcama ısı haritası
// ============================================================
import { C, sectionTitle, PALET } from "../lib/constants.js";
import { Card } from "../components/ui.jsx";
import { Sankey, IsiHaritasi } from "../components/charts.jsx";

export function Gorseller({ findata, toplamGelir }) {
  const giderKat = {};
  findata.giderler.forEach((g) => { giderKat[g.kategori] = (giderKat[g.kategori] || 0) + g.miktar; });
  const aboToplam = findata.abonelikler.reduce((s, a) => s + a.miktar, 0);
  if (aboToplam > 0) giderKat["Abonelikler"] = (giderKat["Abonelikler"] || 0) + aboToplam;
  const giderTop = Object.values(giderKat).reduce((a, b) => a + b, 0);
  const kalan = Math.max(0, toplamGelir - giderTop);
  const kalemler = [
    ...Object.entries(giderKat)
      .sort((a, b) => b[1] - a[1])
      .map(([ad, deger], i) => ({ ad, deger, renk: PALET[i % PALET.length] })),
    ...(kalan > 0 ? [{ ad: "Kalan / Birikim", deger: kalan, renk: C.green }] : []),
  ];
  return (
    <div>
      <Card style={{ marginBottom: "1rem" }}>
        <h3 style={sectionTitle}>🌊 Para Akışı (Sankey)</h3>
        {toplamGelir <= 0 ? <p style={{ color: C.faint, fontSize: "0.85rem" }}>Gelir ekleyince akış çizilir.</p> : <Sankey gelir={toplamGelir} kalemler={kalemler} />}
      </Card>
      <Card>
        <h3 style={sectionTitle}>🔥 Harcama Isı Haritası</h3>
        <IsiHaritasi findata={findata} />
      </Card>
    </div>
  );
}
