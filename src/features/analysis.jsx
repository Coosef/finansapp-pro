// ============================================================
// Analiz — Zümrüt & Altın
// Genel · Karşılaştırma · Yıllık · Görseller
// ============================================================
import { useState } from "react";
import { V, SERIF, PALET, AY_ADI } from "../lib/constants.js";
import { TL, bugun } from "../lib/format.js";
import { Card, Btn, Seg, ProgressBar, Bos } from "../components/ui.jsx";
import { BarChart } from "../components/charts.jsx";
import { Gorseller } from "./visuals.jsx";
import { yillikOzet, etkinButce } from "../lib/finance.js";
import { donemHesap } from "../lib/hesapla.js";

const pageTitle = { margin: "0 0 1.1rem", fontSize: "1.3rem", fontWeight: 600, fontFamily: SERIF, color: V.ink };
const cardTitle = { margin: 0, fontSize: "16px", fontWeight: 600, color: V.ink, fontFamily: SERIF };

// ---- yardımcılar ----
const ayPrefixGeri = (n) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - n, 1).toISOString().slice(0, 7);
};
const buAyP = () => new Date().toISOString().slice(0, 7);
const oncekiAyP = () => ayPrefixGeri(1);

function katTopla(liste, prefix) {
  const o = {};
  (liste || []).forEach((g) => {
    if ((g.tarih || "").startsWith(prefix)) o[g.kategori] = (o[g.kategori] || 0) + (g.miktar || 0);
  });
  return o;
}

export function Analiz({ findata, fd, donem, donemAdi, toplamGelir }) {
  const [alt, setAlt] = useState("genel");
  return (
    <div>
      <h2 style={pageTitle}>Analiz</h2>
      <div style={{ marginBottom: "1.3rem" }}>
        <Seg
          value={alt}
          onChange={setAlt}
          items={[
            { id: "genel", label: "Genel" },
            { id: "karsilastir", label: "Karşılaştırma" },
            { id: "yillik", label: "Yıllık" },
            { id: "gorsel", label: "Görseller" },
          ]}
        />
      </div>
      {alt === "genel" && <Genel findata={findata} fd={fd} donem={donem} donemAdi={donemAdi} />}
      {alt === "karsilastir" && <Karsilastir findata={findata} />}
      {alt === "yillik" && <YillikOzet findata={findata} />}
      {alt === "gorsel" && <Gorseller findata={findata} toplamGelir={toplamGelir} />}
    </div>
  );
}

// ============================================================
// GENEL: Kategori bazlı harcama + Gelir/Gider trendi + Akıllı İçgörüler
// ============================================================
function Genel({ findata, fd, donem, donemAdi }) {
  // (1) Kategori bazlı harcama (dönem filtreli)
  const katMap = {};
  (fd.giderler || []).forEach((g) => { katMap[g.kategori] = (katMap[g.kategori] || 0) + (g.miktar || 0); });
  const katlar = Object.entries(katMap).sort((a, b) => b[1] - a[1]);
  const maxKat = katlar.length ? katlar[0][1] : 1;
  // Panel ile AYNI hesaplama: tasarruf/gider abonelik dahil, tek doğruluk kaynağı
  const oz = donemHesap(findata, donem || "buAy", bugun());

  // (2) Son 6 ay gelir/gider (tüm veriden)
  const aylar6 = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    const pd = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const prefix = pd.toISOString().slice(0, 7);
    let gelir = 0, gider = 0;
    (findata.gelirler || []).forEach((x) => { if ((x.tarih || "").slice(0, 7) === prefix) gelir += x.miktar || 0; });
    (findata.giderler || []).forEach((x) => { if ((x.tarih || "").slice(0, 7) === prefix) gider += x.miktar || 0; });
    aylar6.push({ ay: AY_ADI[pd.getMonth()], gelir, gider });
  }
  const max6 = Math.max(...aylar6.flatMap((m) => [m.gelir, m.gider]), 1);

  const insights = icgoruler(findata, fd, katlar, oz);

  return (
    <div>
      <div className="fa-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        {/* Kategori Bazlı Harcama */}
        <Card>
          <h3 className="serif" style={{ ...cardTitle, marginBottom: "18px" }}>Kategori Bazlı Harcama</h3>
          {!katlar.length ? (
            <p style={{ color: V.ink3, fontSize: "0.85rem", margin: 0 }}>{donemAdi || "Bu dönem"} için gider yok.</p>
          ) : (
            katlar.map(([ad, amt], i) => (
              <div key={ad} style={{ marginBottom: "13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", marginBottom: "5px" }}>
                  <span style={{ color: V.ink2 }}>{ad}</span>
                  <span className="num" style={{ color: V.ink }}>{TL(amt)}</span>
                </div>
                <ProgressBar value={amt} max={maxKat} color={PALET[i % PALET.length]} />
              </div>
            ))
          )}
        </Card>

        {/* Gelir / Gider Trendi */}
        <Card>
          <h3 className="serif" style={{ ...cardTitle, marginBottom: "6px" }}>Gelir / Gider Trendi</h3>
          <div style={{ display: "flex", gap: "16px", fontSize: "11.5px", marginBottom: "14px" }}>
            <span style={{ color: V.emerald2 }}>● Gelir</span>
            <span style={{ color: V.accent }}>● Gider</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", height: "170px", padding: "0 4px" }}>
            {aylar6.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "7px", flex: 1 }}>
                <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: "140px" }}>
                  <div title={`Gelir ${TL(m.gelir)}`} style={{ width: 13, height: `${Math.max(2, (m.gelir / max6) * 140)}px`, background: V.emerald2, borderRadius: "3px 3px 0 0" }} />
                  <div title={`Gider ${TL(m.gider)}`} style={{ width: 13, height: `${Math.max(2, (m.gider / max6) * 140)}px`, background: V.accent, borderRadius: "3px 3px 0 0" }} />
                </div>
                <span style={{ fontSize: "11px", color: V.ink3 }}>{m.ay}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Akıllı İçgörüler — zümrüt hero kartı */}
      <div style={{ background: V.emerald, borderRadius: "14px", padding: "22px 24px" }}>
        <div className="serif" style={{ fontSize: "16px", fontWeight: 600, color: V.cream, marginBottom: "14px", fontFamily: SERIF }}>Akıllı İçgörüler</div>
        {insights.length ? (
          insights.map((parts, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", marginBottom: "9px", alignItems: "flex-start" }}>
              <span style={{ color: V.accent, flexShrink: 0 }}>▸</span>
              <span style={{ fontSize: "13px", color: "#CDE0D5", lineHeight: 1.5 }}>{parts}</span>
            </div>
          ))
        ) : (
          <div style={{ fontSize: "13px", color: V.sage }}>Daha fazla işlem ekledikçe içgörüler burada belirir.</div>
        )}
      </div>
    </div>
  );
}

// İçgörü hesaplama — React span dizileri döner (dangerouslySetInnerHTML YOK)
function icgoruler(findata, fd, katlar, oz) {
  const out = [];
  const vurgu = (txt) => <strong style={{ color: V.cream, fontWeight: 600 }}>{txt}</strong>;
  const altin = (txt) => <strong style={{ color: V.accent, fontWeight: 600 }}>{txt}</strong>;

  // Panel ile tutarlı: gelir + giderToplam (abonelik dahil) tek doğruluk kaynağından
  const gelir = oz ? oz.gelir : (fd.gelirler || []).reduce((s, g) => s + (g.miktar || 0), 0);
  const giderKalem = oz ? oz.giderKalem : (fd.giderler || []).reduce((s, g) => s + (g.miktar || 0), 0);
  const giderToplam = oz ? oz.giderToplam : giderKalem;

  // 1) En yüksek harcama kategorisi (kategori payı kalem gidere göre)
  if (katlar.length) {
    const [ad, amt] = katlar[0];
    const pay = giderKalem > 0 ? (amt / giderKalem) * 100 : 0;
    out.push(<>En çok harcama {vurgu(ad)} kategorisinde: {altin(TL(amt))} (giderin %{pay.toFixed(0)}'i).</>);
  }

  // 2) Tasarruf oranı (net / gelir) — abonelik dahil giderToplam ile
  if (gelir > 0) {
    const net = gelir - giderToplam;
    const oran = (net / gelir) * 100;
    out.push(
      <>
        Tasarruf oranın {altin("%" + oran.toFixed(0))} —{" "}
        {oran >= 20 ? vurgu("harika gidiyorsun") : oran >= 0 ? "fena değil, biraz daha kısabilirsin" : vurgu("bu dönem açık verdin")}.
      </>
    );
  }

  // 3) En büyük aylık kategori değişimi (bu ay vs geçen ay)
  const buKat = katTopla(findata.giderler, buAyP());
  const gecenKat = katTopla(findata.giderler, oncekiAyP());
  let enBuyuk = null;
  [...new Set([...Object.keys(buKat), ...Object.keys(gecenKat)])].forEach((k) => {
    const x = buKat[k] || 0, y = gecenKat[k] || 0;
    const diff = x - y;
    if (!enBuyuk || Math.abs(diff) > Math.abs(enBuyuk.diff)) enBuyuk = { k, diff, x, y };
  });
  if (enBuyuk && Math.abs(enBuyuk.diff) > 0) {
    const artti = enBuyuk.diff > 0;
    const pct = enBuyuk.y > 0 ? Math.abs((enBuyuk.diff / enBuyuk.y) * 100) : 100;
    out.push(
      <>
        {vurgu(enBuyuk.k)} harcaman geçen aya göre {artti ? "arttı" : "azaldı"}: {altin((artti ? "+" : "−") + "%" + pct.toFixed(0))} ({TL(Math.abs(enBuyuk.diff))}).
      </>
    );
  }

  // 4) Bütçe uyarıları (etkin limite yakın / aşan kategoriler)
  const ay = buAyP();
  const butceler = findata.butceler || {};
  const uyarilar = [];
  Object.keys(butceler).forEach((k) => {
    const limit = etkinButce(findata, k, ay);
    if (limit <= 0) return;
    const harcanan = buKat[k] || 0;
    const yuzde = (harcanan / limit) * 100;
    if (yuzde >= 85) uyarilar.push({ k, yuzde });
  });
  if (uyarilar.length) {
    const u = uyarilar.sort((a, b) => b.yuzde - a.yuzde)[0];
    out.push(
      <>
        {vurgu(u.k)} bütçesinin {altin("%" + u.yuzde.toFixed(0))}'ini kullandın —{" "}
        {u.yuzde >= 100 ? vurgu("limiti aştın") : "limite yaklaştın"}.
      </>
    );
  }

  return out.slice(0, 5);
}

// ============================================================
// KARŞILAŞTIRMA: Bu ay vs Geçen ay (kategori bazlı mini-bar + delta çip)
// ============================================================
function Karsilastir({ findata }) {
  const bu = buAyP(), gecen = oncekiAyP();
  const buKat = katTopla(findata.giderler, bu);
  const gecenKat = katTopla(findata.giderler, gecen);
  const tumKat = [...new Set([...Object.keys(buKat), ...Object.keys(gecenKat)])]
    .map((k) => ({ ad: k, buAy: buKat[k] || 0, gecenAy: gecenKat[k] || 0 }))
    .sort((a, b) => b.buAy - a.buAy);
  const maxV = Math.max(...tumKat.flatMap((k) => [k.buAy, k.gecenAy]), 1);
  const buTop = Object.values(buKat).reduce((a, b) => a + b, 0);
  const gecenTop = Object.values(gecenKat).reduce((a, b) => a + b, 0);

  const fark = (x, y) => (y === 0 ? (x > 0 ? 100 : 0) : ((x - y) / y) * 100);

  const Chip = ({ x, y }) => {
    const f = fark(x, y);
    const yukseldi = f > 0;
    const renk = f > 0 ? V.neg : f < 0 ? V.pos : V.ink3;
    return (
      <span className="num" style={{ fontSize: "11px", fontWeight: 700, color: renk, background: "color-mix(in srgb, currentColor 14%, transparent)", padding: "2px 8px", borderRadius: "99px" }}>
        {f > 0 ? "▲" : f < 0 ? "▼" : "–"} %{Math.abs(f).toFixed(0)}
      </span>
    );
  };

  const Satir = ({ ad, buAy, gecenAy }) => (
    <div style={{ marginBottom: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "7px" }}>
        <span style={{ fontSize: "13.5px", color: V.ink, fontWeight: 500 }}>{ad}</span>
        <Chip x={buAy} y={gecenAy} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "5px" }}>
        <div style={{ flex: 1 }}><ProgressBar value={buAy} max={maxV} height={9} color={V.emerald2} /></div>
        <span className="num" style={{ fontSize: "12px", color: V.ink, width: 84, textAlign: "right" }}>{TL(buAy)}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ flex: 1 }}><ProgressBar value={gecenAy} max={maxV} height={9} color={V.border2} /></div>
        <span className="num" style={{ fontSize: "12px", color: V.ink3, width: 84, textAlign: "right" }}>{TL(gecenAy)}</span>
      </div>
    </div>
  );

  if (!tumKat.length) return <Bos baslik="Karşılaştırılacak veri yok" mesaj="Bu ay veya geçen ay için gider ekleyince karşılaştırma burada görünür." icon="bars" />;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
        <h3 className="serif" style={cardTitle}>Bu Ay / Geçen Ay</h3>
        <div style={{ display: "flex", gap: "14px", fontSize: "11px", color: V.ink3 }}>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: V.emerald2 }} />Bu ay
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: V.border2 }} />Geçen ay
          </span>
        </div>
      </div>
      {tumKat.map((k) => <Satir key={k.ad} {...k} />)}
      <div style={{ borderTop: `1px solid ${V.line}`, paddingTop: "14px", marginTop: "2px" }}>
        <Satir ad="TOPLAM GİDER" buAy={buTop} gecenAy={gecenTop} />
      </div>
    </Card>
  );
}

// ============================================================
// YILLIK ÖZET
// ============================================================
function YillikOzet({ findata }) {
  const yillar = [...new Set([...(findata.gelirler || []), ...(findata.giderler || [])].map((x) => (x.tarih || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const [yil, setYil] = useState(yillar[0] || String(new Date().getFullYear()));
  const o = yillikOzet(findata, yil);
  const secenekler = yillar.length ? yillar : [String(new Date().getFullYear())];

  const Mini = ({ baslik, deger, renk, alt, altRenk }) => (
    <div className="fa-card" style={{ padding: "16px 17px" }}>
      <div style={{ fontSize: "11.5px", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{baslik}</div>
      <div className="num" style={{ fontSize: "21px", fontWeight: 600, color: renk || V.ink, margin: "8px 0 5px", letterSpacing: "-0.02em" }}>{deger}</div>
      {alt && <div className="num" style={{ fontSize: "12px", color: altRenk || V.ink3 }}>{alt}</div>}
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: "1rem" }}>
        <Seg value={yil} onChange={setYil} items={secenekler} />
      </div>
      <div className="fa-grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "14px", marginBottom: "14px" }}>
        <Mini baslik="Yıllık Gelir" deger={TL(o.toplamGelir)} renk={V.pos} />
        <Mini baslik="Yıllık Gider" deger={TL(o.toplamGider)} renk={V.neg} />
        <Mini baslik="Net" deger={TL(o.net)} renk={o.net >= 0 ? V.pos : V.neg} />
        <Mini
          baslik="Tasarruf Oranı"
          deger={`%${o.tasarrufOrani.toFixed(0)}`}
          renk={V.accent}
          alt={o.tasarrufOrani >= 20 ? "İyi" : o.tasarrufOrani >= 0 ? "İdare eder" : "Açık var"}
          altRenk={o.tasarrufOrani >= 0 ? V.pos : V.neg}
        />
      </div>
      <Card>
        <h3 className="serif" style={{ ...cardTitle, marginBottom: "16px" }}>Aylık Gelir / Gider ({yil})</h3>
        <BarChart data={o.aylar} />
        <div style={{ display: "flex", gap: "16px", marginTop: "0.9rem", fontSize: "11.5px" }}>
          <span style={{ color: V.emerald2 }}>● Gelir</span>
          <span style={{ color: V.accent }}>● Gider</span>
        </div>
      </Card>
    </div>
  );
}
