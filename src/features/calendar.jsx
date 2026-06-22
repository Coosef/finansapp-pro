// ============================================================
// Takvim görünümü
// ============================================================
import { useState } from "react";
import { C, pageTitle, AY_ADI } from "../lib/constants.js";
import { bugun } from "../lib/format.js";
import { Card, Btn } from "../components/ui.jsx";

export function Takvim({ findata }) {
  const [ref, setRef] = useState(new Date());
  const yil = ref.getFullYear(),
    ayIdx = ref.getMonth();
  const ilkGun = new Date(yil, ayIdx, 1);
  const baslangicGun = (ilkGun.getDay() + 6) % 7;
  const gunSayisi = new Date(yil, ayIdx + 1, 0).getDate();
  const ayPrefix = `${yil}-${String(ayIdx + 1).padStart(2, "0")}`;
  const gunVerisi = {};
  findata.gelirler.filter((g) => (g.tarih || "").startsWith(ayPrefix)).forEach((g) => {
    const d = parseInt(g.tarih.slice(8, 10));
    gunVerisi[d] = gunVerisi[d] || { gelir: 0, gider: 0, abonelik: 0 };
    gunVerisi[d].gelir += g.miktar;
  });
  findata.giderler.filter((g) => (g.tarih || "").startsWith(ayPrefix)).forEach((g) => {
    const d = parseInt(g.tarih.slice(8, 10));
    gunVerisi[d] = gunVerisi[d] || { gelir: 0, gider: 0, abonelik: 0 };
    gunVerisi[d].gider += g.miktar;
  });
  findata.abonelikler.forEach((a) => {
    const d = new Date(a.tarih + "T00:00:00").getDate();
    if (d <= gunSayisi) {
      gunVerisi[d] = gunVerisi[d] || { gelir: 0, gider: 0, abonelik: 0 };
      gunVerisi[d].abonelik += a.miktar;
    }
  });
  const bugunStr = bugun();
  const hucreler = [];
  for (let i = 0; i < baslangicGun; i++) hucreler.push(null);
  for (let g = 1; g <= gunSayisi; g++) hucreler.push(g);
  return (
    <div>
      <h2 style={pageTitle}>Takvim</h2>
      <Card style={{ marginTop: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <Btn variant="ghost" onClick={() => setRef(new Date(yil, ayIdx - 1, 1))}>‹</Btn>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>{AY_ADI[ayIdx]} {yil}</h3>
          <Btn variant="ghost" onClick={() => setRef(new Date(yil, ayIdx + 1, 1))}>›</Btn>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((g) => (
            <div key={g} style={{ textAlign: "center", color: C.dimmer, fontSize: "0.7rem", padding: "0.3rem 0" }}>{g}</div>
          ))}
          {hucreler.map((g, i) => {
            if (!g) return <div key={i} />;
            const v = gunVerisi[g];
            const buGun = `${ayPrefix}-${String(g).padStart(2, "0")}` === bugunStr;
            return (
              <div key={i} style={{ minHeight: 56, background: buGun ? "#1A1A3A" : C.card2, border: `1px solid ${buGun ? C.indigo : C.line}`, borderRadius: "0.4rem", padding: "0.25rem", fontSize: "0.65rem" }}>
                <div style={{ color: buGun ? C.indigoL : C.dim, fontWeight: buGun ? 700 : 400, marginBottom: 2 }}>{g}</div>
                {v?.gelir > 0 && <div style={{ color: C.greenL }}>+{(v.gelir / 1000).toFixed(0)}k</div>}
                {v?.gider > 0 && <div style={{ color: C.redL }}>−{(v.gider / 1000).toFixed(1)}k</div>}
                {v?.abonelik > 0 && <div style={{ color: C.amber }}>🔄{v.abonelik.toFixed(0)}</div>}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: "1rem", marginTop: "1rem", fontSize: "0.72rem", flexWrap: "wrap" }}>
          <span style={{ color: C.greenL }}>● Gelir</span>
          <span style={{ color: C.redL }}>● Gider</span>
          <span style={{ color: C.amber }}>🔄 Abonelik</span>
        </div>
      </Card>
    </div>
  );
}
