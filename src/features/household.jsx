// ============================================================
// Ortak Hane Bütçesi (tüm kullanıcıların "hane" işaretli işlemleri)
// Zümrüt & Altın — açık/koyu tema
// ============================================================
import { useState, useEffect } from "react";
import { V, F, SERIF } from "../lib/constants.js";
import { TL } from "../lib/format.js";
import { storage } from "../lib/storage.js";
import { Card, ProgressBar } from "../components/ui.jsx";
import { Icon } from "../components/icons.jsx";

export function Hane({ users, findata }) {
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

  if (yukleniyor)
    return (
      <div className="fa-card" style={{ padding: "44px 20px", textAlign: "center", color: V.ink3, fontSize: "13px" }}>
        Hane verileri yükleniyor…
      </div>
    );

  // Kişi başına hane gelir/gideri
  const kisiler = veriler.map(({ user, findata }) => ({
    ad: user.ad || user.username,
    hgider: (findata.giderler || []).filter((g) => g.hane).reduce((s, g) => s + g.miktar, 0),
    hgelir: (findata.gelirler || []).filter((g) => g.hane).reduce((s, g) => s + g.miktar, 0),
  }));
  const toplamGider = kisiler.reduce((s, k) => s + k.hgider, 0);
  const toplamGelir = kisiler.reduce((s, k) => s + k.hgelir, 0);
  const haneVar = kisiler.some((k) => k.hgider || k.hgelir);

  // Katkı payı: hane işlemi varsa gider toplamına oranla, yoksa eşit pay
  const katkiPay = (k) => {
    if (haneVar) {
      const t = k.hgider + k.hgelir;
      const tum = toplamGider + toplamGelir;
      return tum > 0 ? Math.round((t / tum) * 100) : 0;
    }
    return kisiler.length ? Math.round(100 / kisiler.length) : 0;
  };

  // Kategori dağılımı (hane işaretli giderler)
  const katGider = {};
  veriler.forEach(({ findata }) =>
    (findata.giderler || [])
      .filter((g) => g.hane)
      .forEach((g) => {
        katGider[g.kategori] = (katGider[g.kategori] || 0) + g.miktar;
      })
  );
  const katlar = Object.entries(katGider).sort((a, b) => b[1] - a[1]);
  const enBuyuk = katlar[0]?.[1] || 1;

  const harfRengi = (i) =>
    i % 2 === 0
      ? { background: V.emerald, color: V.cream }
      : { background: V.accent, color: V.emerald };

  const labelStyle = { fontSize: "11.5px", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em" };

  return (
    <div>
      <h2 className="serif" style={{ margin: "0 0 0.2rem", fontSize: "1.2rem", fontWeight: 600, fontFamily: SERIF, color: V.ink }}>
        Ortak Hane Bütçesi
      </h2>
      <p style={{ color: V.ink3, fontSize: "12.5px", margin: "0 0 1.25rem" }}>
        "Hane" işaretli tüm kullanıcı işlemleri burada birleşir.
      </p>

      {/* Özet kartları */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: "12px", marginBottom: "14px" }}>
        <div className="fa-card" style={{ padding: "16px 17px" }}>
          <div style={labelStyle}>Hane Geliri</div>
          <div className="num" style={{ fontSize: "23px", fontWeight: 600, color: V.pos, margin: "8px 0 0", letterSpacing: "-0.02em" }}>{TL(toplamGelir)}</div>
        </div>
        <div className="fa-card" style={{ padding: "16px 17px" }}>
          <div style={labelStyle}>Hane Gideri</div>
          <div className="num" style={{ fontSize: "23px", fontWeight: 600, color: V.neg, margin: "8px 0 0", letterSpacing: "-0.02em" }}>{TL(toplamGider)}</div>
        </div>
        <div className="fa-card" style={{ padding: "16px 17px" }}>
          <div style={labelStyle}>Hane Dengesi</div>
          <div className="num" style={{ fontSize: "23px", fontWeight: 600, color: V.ink, margin: "8px 0 0", letterSpacing: "-0.02em" }}>{TL(toplamGelir - toplamGider)}</div>
          <div className="num" style={{ fontSize: "12px", color: toplamGelir - toplamGider >= 0 ? V.pos : V.neg, marginTop: 5 }}>
            {toplamGelir - toplamGider >= 0 ? "Pozitif denge" : "Negatif denge"}
          </div>
        </div>
      </div>

      {/* Hane Üyeleri — tasarım kartı */}
      <Card style={{ marginBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Icon d="users" size={17} stroke={V.accent} />
          <div className="serif" style={{ fontSize: "16px", fontWeight: 600, color: V.ink, fontFamily: SERIF }}>Hane Üyeleri</div>
        </div>
        <p style={{ margin: "0 0 18px", fontSize: "12.5px", color: V.ink3 }}>Ortak bütçeyi paylaşan kişiler ve katkı payları.</p>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {kisiler.map((k, i) => (
            <div
              key={k.ad}
              style={{ flex: "1 1 140px", minWidth: 140, textAlign: "center", padding: 20, background: V.card2, border: `1px solid ${V.border}`, borderRadius: 12 }}
            >
              <div style={{ width: 52, height: 52, borderRadius: "50%", margin: "0 auto 10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, fontFamily: F, ...harfRengi(i) }}>
                {(k.ad || "?").charAt(0).toLocaleUpperCase("tr-TR")}
              </div>
              <div style={{ fontSize: "13.5px", fontWeight: 600, color: V.ink }}>{k.ad}</div>
              <div className="num" style={{ fontSize: "12px", color: V.pos, marginTop: 3 }}>%{katkiPay(k)} katkı</div>
            </div>
          ))}
        </div>
        {!haneVar && (
          <p style={{ margin: "14px 0 0", fontSize: "11.5px", color: V.ink3 }}>
            Henüz hane işlemi yok — paylar eşit gösteriliyor. İşlemleri "Hane ortak" olarak işaretleyince katkı payları hesaplanır.
          </p>
        )}
      </Card>

      <div className="fa-grid-2">
        <Card>
          <h3 style={{ margin: "0 0 1rem", fontSize: "0.82rem", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>Kişi Katkısı</h3>
          {!haneVar && <p style={{ color: V.ink3, fontSize: "0.85rem", margin: 0 }}>Henüz hane işlemi yok.</p>}
          {haneVar &&
            kisiler
              .filter((k) => k.hgider || k.hgelir)
              .map((k, i) => (
                <div key={k.ad} style={{ marginBottom: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem", fontSize: "0.85rem" }}>
                    <span style={{ color: V.ink, fontWeight: 600 }}>{k.ad}</span>
                    <span className="num" style={{ color: V.ink2 }}>Gider {TL(k.hgider)}</span>
                  </div>
                  <ProgressBar value={k.hgider} max={toplamGider || 1} color={i % 2 === 0 ? V.emerald2 : V.accent} />
                </div>
              ))}
        </Card>
        <Card>
          <h3 style={{ margin: "0 0 1rem", fontSize: "0.82rem", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>Kategori Dağılımı</h3>
          {!katlar.length && <p style={{ color: V.ink3, fontSize: "0.85rem", margin: 0 }}>Veri yok.</p>}
          {katlar.map(([k, v]) => (
            <div key={k} style={{ marginBottom: "0.85rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem", fontSize: "0.82rem" }}>
                <span style={{ color: V.ink2 }}>{k}</span>
                <span className="num" style={{ color: V.ink, fontWeight: 600 }}>{TL(v)}</span>
              </div>
              <ProgressBar value={v} max={enBuyuk} color={V.emerald2} />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
