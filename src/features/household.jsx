// ============================================================
// Ortak Hane Bütçesi (tüm kullanıcıların "hane" işaretli işlemleri)
// ============================================================
import { useState, useEffect } from "react";
import { C, pageTitle, sectionTitle } from "../lib/constants.js";
import { TL } from "../lib/format.js";
import { storage } from "../lib/storage.js";
import { Card, Stat, ProgressBar } from "../components/ui.jsx";

export function Hane({ users }) {
  const [yukleniyor, setYukleniyor] = useState(true);
  const [veriler, setVeriler] = useState([]);
  useEffect(() => {
    (async () => {
      setYukleniyor(true);
      const s = [];
      for (const u of users) {
        try {
          const r = await storage.get(`findata:${u.username}`);
          if (r) s.push({ user: u, findata: JSON.parse(r.value) });
        } catch {
          /* yoksay */
        }
      }
      setVeriler(s);
      setYukleniyor(false);
    })();
  }, [users]);
  if (yukleniyor) return <div style={{ color: C.dim, padding: "2rem" }}>Hane verileri yükleniyor…</div>;
  const kisiler = veriler.map(({ user, findata }) => ({
    ad: user.ad || user.username,
    hgider: (findata.giderler || []).filter((g) => g.hane).reduce((s, g) => s + g.miktar, 0),
    hgelir: (findata.gelirler || []).filter((g) => g.hane).reduce((s, g) => s + g.miktar, 0),
  }));
  const toplamGider = kisiler.reduce((s, k) => s + k.hgider, 0),
    toplamGelir = kisiler.reduce((s, k) => s + k.hgelir, 0);
  const katGider = {};
  veriler.forEach(({ findata }) =>
    (findata.giderler || []).filter((g) => g.hane).forEach((g) => {
      katGider[g.kategori] = (katGider[g.kategori] || 0) + g.miktar;
    })
  );
  const katlar = Object.entries(katGider).sort((a, b) => b[1] - a[1]);
  const enBuyuk = katlar[0]?.[1] || 1;
  return (
    <div>
      <h2 style={pageTitle}>Ortak Hane Bütçesi</h2>
      <p style={{ color: C.dimmer, fontSize: "0.85rem", margin: "0 0 1.25rem" }}>"Hane" işaretli tüm kullanıcı işlemleri burada birleşir.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
        <Stat title="Hane Geliri" value={TL(toplamGelir)} color={C.green} icon="💰" />
        <Stat title="Hane Gideri" value={TL(toplamGider)} color={C.red} icon="💸" />
        <Stat title="Hane Dengesi" value={TL(toplamGelir - toplamGider)} subColor={toplamGelir - toplamGider >= 0 ? C.greenL : C.redL} color={C.purple} icon="⚖️" />
      </div>
      <div className="fa-grid-2">
        <Card>
          <h3 style={sectionTitle}>Kişi Katkısı</h3>
          {!kisiler.some((k) => k.hgider || k.hgelir) && <p style={{ color: C.faint, fontSize: "0.85rem" }}>Henüz hane işlemi yok.</p>}
          {kisiler.filter((k) => k.hgider || k.hgelir).map((k) => (
            <div key={k.ad} style={{ marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem", fontSize: "0.85rem" }}>
                <span style={{ color: C.text, fontWeight: 600 }}>{k.ad}</span>
                <span style={{ color: C.dim }}>Gider {TL(k.hgider)}</span>
              </div>
              <ProgressBar value={k.hgider} max={toplamGider || 1} color={C.purple} />
            </div>
          ))}
        </Card>
        <Card>
          <h3 style={sectionTitle}>Kategori Dağılımı</h3>
          {!katlar.length && <p style={{ color: C.faint, fontSize: "0.85rem" }}>Veri yok.</p>}
          {katlar.map(([k, v]) => (
            <div key={k} style={{ marginBottom: "0.85rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem", fontSize: "0.82rem" }}>
                <span style={{ color: C.dim }}>{k}</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{TL(v)}</span>
              </div>
              <ProgressBar value={v} max={enBuyuk} color={C.cyan} />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
