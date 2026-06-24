// ============================================================
// Takvim görünümü — Zümrüt & Altın tasarımı
// ============================================================
import { useState } from "react";
import { V, F, SERIF, MONO } from "../lib/constants.js";
import { TL } from "../lib/format.js";
import { Card } from "../components/ui.jsx";
import { Icon } from "../components/icons.jsx";

const AY_UZUN = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUN_ADI = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const pad = (n) => String(n).padStart(2, "0");

export function Takvim({ findata, onDuzenle }) {
  const today = new Date();
  const [yil, setYil] = useState(today.getFullYear());
  const [ay, setAy] = useState(today.getMonth());
  const [secili, setSecili] = useState(null);

  const gelirler = findata?.gelirler || [];
  const giderler = findata?.giderler || [];

  const ilkGun = new Date(yil, ay, 1);
  const oncekiBos = (ilkGun.getDay() + 6) % 7; // Pazartesi-başlangıç
  const gunSayisi = new Date(yil, ay + 1, 0).getDate();
  const bugunStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  // Gün -> { gelir, gider } özetleri
  const gunVeri = {};
  const ekle = (liste, alan) =>
    liste.forEach((x) => {
      const t = x.tarih || "";
      if (t.slice(0, 7) === `${yil}-${pad(ay + 1)}`) {
        const d = parseInt(t.slice(8, 10), 10);
        (gunVeri[d] = gunVeri[d] || { gelir: 0, gider: 0 })[alan] += x.miktar || 0;
      }
    });
  ekle(gelirler, "gelir");
  ekle(giderler, "gider");

  const ayDegistir = (delta) => {
    let y = yil, m = ay + delta;
    if (m < 0) { m = 11; y -= 1; }
    else if (m > 11) { m = 0; y += 1; }
    setYil(y); setAy(m); setSecili(null);
  };

  // Hücreler: önce boşluklar, sonra günler
  const hucreler = [];
  for (let i = 0; i < oncekiBos; i++) hucreler.push(null);
  for (let g = 1; g <= gunSayisi; g++) hucreler.push(g);

  // Seçili gün detayları
  const seciliStr = secili ? `${yil}-${pad(ay + 1)}-${pad(secili)}` : null;
  const seciliGelir = secili ? gelirler.filter((x) => (x.tarih || "") === seciliStr) : [];
  const seciliGider = secili ? giderler.filter((x) => (x.tarih || "") === seciliStr) : [];
  const seciliGelirTop = seciliGelir.reduce((s, x) => s + (x.miktar || 0), 0);
  const seciliGiderTop = seciliGider.reduce((s, x) => s + (x.miktar || 0), 0);
  const islemler = [
    ...seciliGelir.map((x) => ({ ...x, tip: "gelir" })),
    ...seciliGider.map((x) => ({ ...x, tip: "gider" })),
  ];

  const okBtn = { width: 30, height: 30, borderRadius: 8, border: `1px solid ${V.border2}`, background: V.card2, color: V.ink2, cursor: "pointer", fontFamily: F, fontSize: 16, lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center" };
  const nokta = (c) => ({ width: 5, height: 5, borderRadius: "50%", background: c });

  return (
    <div>
      <Card style={{ padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div className="serif" style={{ fontSize: 18, fontWeight: 600, color: V.ink, fontFamily: SERIF }}>
            {AY_UZUN[ay]} {yil}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="fa-btn" onClick={() => ayDegistir(-1)} style={okBtn} title="Önceki ay">‹</button>
            <button className="fa-btn" onClick={() => ayDegistir(1)} style={okBtn} title="Sonraki ay">›</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 7 }}>
          {GUN_ADI.map((g) => (
            <div key={g} style={{ textAlign: "center", fontSize: 11, color: V.ink3, paddingBottom: 4 }}>{g}</div>
          ))}
          {hucreler.map((g, i) => {
            if (!g) return <div key={`b${i}`} />;
            const v = gunVeri[g];
            const gunStr = `${yil}-${pad(ay + 1)}-${pad(g)}`;
            const buGun = gunStr === bugunStr;
            const isSecili = g === secili;
            return (
              <div
                key={g}
                onClick={() => setSecili(isSecili ? null : g)}
                style={{
                  minHeight: 54, borderRadius: 10, padding: "7px 6px 6px", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  background: isSecili ? "var(--chip-gold)" : buGun ? V.card2 : "transparent",
                  border: `1px solid ${isSecili ? V.accent : buGun ? V.accent : V.line}`,
                  transition: "background .15s, border-color .15s",
                }}
              >
                <span className="num" style={{ fontSize: 13, fontFamily: MONO, fontWeight: buGun ? 700 : 500, color: buGun ? V.accent : V.ink }}>{g}</span>
                <span style={{ display: "flex", gap: 3, height: 5 }}>
                  {v?.gelir > 0 && <span style={nokta(V.emerald2)} />}
                  {v?.gider > 0 && <span style={nokta(V.neg)} />}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 18, marginTop: 18, fontSize: 11.5, color: V.ink2, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: V.emerald2 }} />Gelir
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: V.neg }} />Gider
          </span>
          <span style={{ color: V.ink3 }}>· Bir güne tıkla, işlemleri gör</span>
        </div>
      </Card>

      {secili && (
        <Card style={{ padding: 20, marginTop: 14, animation: "obfade .3s both" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div className="serif" style={{ fontSize: 16, fontWeight: 600, color: V.ink, fontFamily: SERIF }}>
              {secili} {AY_UZUN[ay]}
            </div>
            <div style={{ display: "flex", gap: 14, fontSize: 12.5 }}>
              <span className="num" style={{ color: V.pos, fontFamily: MONO }}>+{TL(seciliGelirTop)}</span>
              <span className="num" style={{ color: V.neg, fontFamily: MONO }}>−{TL(seciliGiderTop)}</span>
            </div>
          </div>

          {islemler.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: V.ink3, textAlign: "center", padding: "14px 0" }}>Bu gün için işlem yok.</p>
          ) : (
            islemler.map((t, i) => {
              const gelir = t.tip === "gelir";
              const renk = gelir ? V.pos : V.neg;
              return (
                <div
                  key={`${t.tip}-${t.id ?? i}`}
                  onClick={() => onDuzenle && onDuzenle(t.tip, t)}
                  style={{ display: "flex", alignItems: "center", gap: 13, padding: "11px 0", borderBottom: i === islemler.length - 1 ? "none" : `1px solid ${V.line}`, cursor: "pointer" }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: gelir ? "var(--chip-green)" : "var(--chip-red)", color: renk }}>
                    <Icon d={gelir ? "arrowDown" : "arrowUp"} size={17} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: V.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.baslik || (gelir ? "Gelir" : "Gider")}</div>
                    <div style={{ fontSize: 11.5, color: V.ink3 }}>{t.kategori || "—"}</div>
                  </div>
                  <span className="num" style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 600, color: renk }}>{gelir ? "+" : "−"}{TL(t.miktar)}</span>
                </div>
              );
            })
          )}
        </Card>
      )}
    </div>
  );
}
