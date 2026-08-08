// ============================================================
// Ortak Hane Bütçesi — "hane" işaretli işlemlerin özeti
// DB-only: paylaşılan findata üzerinden hesaplanır (yerel kullanıcı yok).
// Üye yönetimi: Ayarlar → Hesap & Ortak Hane (PocketBase haneler).
// ============================================================
import { V, SERIF } from "../lib/constants.js";
import { TL } from "../lib/format.js";
import { Card, ProgressBar } from "../components/ui.jsx";
import { Icon } from "../components/icons.jsx";

export function Hane({ findata }) {
  const giderler = (findata.giderler || []).filter((g) => g.hane);
  const gelirler = (findata.gelirler || []).filter((g) => g.hane);
  const toplamGider = giderler.reduce((s, g) => s + g.miktar, 0);
  const toplamGelir = gelirler.reduce((s, g) => s + g.miktar, 0);
  const haneVar = toplamGider > 0 || toplamGelir > 0;

  // Kategori dağılımı (hane işaretli giderler)
  const katGider = {};
  giderler.forEach((g) => { katGider[g.kategori] = (katGider[g.kategori] || 0) + g.miktar; });
  const katlar = Object.entries(katGider).sort((a, b) => b[1] - a[1]);
  const enBuyuk = katlar[0]?.[1] || 1;

  const labelStyle = { fontSize: "11.5px", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em" };

  return (
    <div>
      <h2 className="serif" style={{ margin: "0 0 0.2rem", fontSize: "1.2rem", fontWeight: 600, fontFamily: SERIF, color: V.ink }}>
        Ortak Hane Bütçesi
      </h2>
      <p style={{ color: V.ink3, fontSize: "12.5px", margin: "0 0 1.25rem" }}>
        "Hane" işaretli işlemler burada birleşir. Ortak hane üyelerini <b>Ayarlar → Hesap &amp; Ortak Hane</b>'den yönetebilirsin.
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

      {!haneVar && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Icon d="users" size={17} stroke={V.accent} />
            <div className="serif" style={{ fontSize: "16px", fontWeight: 600, color: V.ink, fontFamily: SERIF }}>Henüz hane işlemi yok</div>
          </div>
          <p style={{ margin: 0, fontSize: "12.5px", color: V.ink3, lineHeight: 1.6 }}>
            Bir gelir/gideri "Hane ortak" olarak işaretlediğinde burada özetlenir. Eş/ailenle aynı veriyi paylaşmak için <b>Ayarlar → Hesap &amp; Ortak Hane</b>'den hane oluştur ya da davet koduyla katıl.
          </p>
        </Card>
      )}

      {haneVar && (
        <Card>
          <h3 style={{ margin: "0 0 1rem", fontSize: "0.82rem", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>Kategori Dağılımı (Hane Giderleri)</h3>
          {!katlar.length && <p style={{ color: V.ink3, fontSize: "0.85rem", margin: 0 }}>Kategori verisi yok.</p>}
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
      )}
    </div>
  );
}
