// ============================================================
// Analiz — Zümrüt & Altın
// Genel · Karşılaştırma · Yıllık · Görseller
// Rakamlar tıklanabilir (drill-down) · aylar TZ-güvenli (hesapla.js)
// ============================================================
import { useState } from "react";
import { V, SERIF, PALET, AY_ADI } from "../lib/constants.js";
import { TL, bugun } from "../lib/format.js";
import { Card, Btn, Seg, ProgressBar, Bos, DrilldownModal } from "../components/ui.jsx";
import { BarChart } from "../components/charts.jsx";
import { Gorseller } from "./visuals.jsx";
import { yillikOzet, etkinButce } from "../lib/finance.js";
import { donemHesap, aylikHesap, kategoriDagilim, aylarGeri, oncekiAy, buAyYerel } from "../lib/hesapla.js";

const pageTitle = { margin: "0 0 1.1rem", fontSize: "1.3rem", fontWeight: 600, fontFamily: SERIF, color: V.ink };
const cardTitle = { margin: 0, fontSize: "16px", fontWeight: 600, color: V.ink, fontFamily: SERIF };
const kisaAy = (ay) => AY_ADI[(parseInt(String(ay).slice(5, 7), 10) || 1) - 1] || "";

// Bir ay-prefix'ine ait gider/gelir kayıtları (drill-down için)
const ayKayitlari = (liste, ay) => (liste || []).filter((x) => String(x.tarih || "").slice(0, 7) === ay);

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
// GENEL: Kategori bazlı harcama (drill-down) + aylık trend (metrik seçmeli) + içgörüler
// ============================================================
function Genel({ findata, fd, donem, donemAdi }) {
  const [drill, setDrill] = useState(null);
  const [metrik, setMetrik] = useState("gider"); // gider | gelir | net

  // (1) Kategori bazlı harcama — dönem filtreli, tıkla → o kategorinin işlemleri
  const katlar = kategoriDagilim(fd.giderler || []); // [{kategori, toplam, pct}]
  const maxKat = katlar[0]?.toplam || 1;
  const oz = donemHesap(findata, donem || "buAy", bugun());

  // (2) Son 6 ay — TZ-güvenli aylar + tek doğruluk kaynağı (aylikHesap)
  const son6 = aylarGeri(buAyYerel(), 6).map((ay) => {
    const h = aylikHesap(findata, ay);
    return { ay, label: kisaAy(ay), gelir: h.gelir, gider: h.giderToplam, net: h.net };
  });
  const deg = (m) => (metrik === "gider" ? m.gider : metrik === "gelir" ? m.gelir : m.net);
  const maxTrend = Math.max(...son6.map((m) => Math.abs(deg(m))), 1);
  const barRenk = (v) => (metrik === "gelir" ? V.emerald2 : metrik === "net" ? (v >= 0 ? V.pos : V.neg) : V.accent);

  const insights = icgoruler(findata, fd, katlar, oz);

  const drillKat = (kat) =>
    setDrill({ baslik: `${kat} · ${donemAdi || "seçili dönem"}`, tip: "gider", kayitlar: (fd.giderler || []).filter((g) => (g.kategori || "Diğer") === kat) });
  const drillAy = (m) => {
    if (metrik === "gelir") setDrill({ baslik: `Gelir · ${m.label}`, tip: "gelir", kayitlar: ayKayitlari(findata.gelirler, m.ay) });
    else setDrill({ baslik: `Gider · ${m.label}`, tip: "gider", kayitlar: ayKayitlari(findata.giderler, m.ay) });
  };

  return (
    <div>
      <div className="fa-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        {/* Kategori Bazlı Harcama — tıklanabilir */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "18px", gap: 8 }}>
            <h3 className="serif" style={cardTitle}>Kategori Bazlı Harcama</h3>
            <span style={{ fontSize: "11px", color: V.ink3 }}>tıkla → işlemler</span>
          </div>
          {!katlar.length ? (
            <Bos mesaj={`${donemAdi || "Bu dönem"} için gider yok.`} icon="wallet" />
          ) : (
            katlar.map((k, i) => (
              <div key={k.kategori} onClick={() => drillKat(k.kategori)} className="fa-btn" style={{ marginBottom: "13px", cursor: "pointer", padding: "2px 0" }} title="İşlemleri gör">
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", marginBottom: "5px" }}>
                  <span style={{ color: V.ink2, display: "flex", alignItems: "center", gap: 6 }}>{k.kategori} <span style={{ color: V.ink3, fontSize: "11px" }}>%{Math.round(k.pct)}</span></span>
                  <span className="num" style={{ color: V.ink }}>{TL(k.toplam)}</span>
                </div>
                <ProgressBar value={k.toplam} max={maxKat} color={PALET[i % PALET.length]} />
              </div>
            ))
          )}
        </Card>

        {/* Aylık Trend — metrik seçmeli, kendi ölçeğinde, tıkla → o ayın işlemleri */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", gap: 8, flexWrap: "wrap" }}>
            <h3 className="serif" style={cardTitle}>Aylık Trend</h3>
            <div style={{ display: "flex", gap: 3, padding: 3, background: V.card2, border: `1px solid ${V.border}`, borderRadius: 9 }}>
              {[["gider", "Gider"], ["gelir", "Gelir"], ["net", "Net"]].map(([id, l]) => (
                <button key={id} onClick={() => setMetrik(id)} className="fa-btn"
                  style={{ border: "none", borderRadius: 7, padding: "5px 11px", fontSize: "12px", fontWeight: 600, cursor: "pointer", background: metrik === id ? V.emerald : "transparent", color: metrik === id ? "#F4F1E9" : V.ink2 }}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", height: "168px", padding: "14px 2px 0" }}>
            {son6.map((m) => {
              const v = deg(m);
              const h = Math.max(2, (Math.abs(v) / maxTrend) * 120);
              return (
                <div key={m.ay} onClick={() => drillAy(m)} className="fa-btn" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", cursor: "pointer", minWidth: 0 }} title={`${m.label}: ${TL(v)} — işlemleri gör`}>
                  <span className="num" style={{ fontSize: "9.5px", color: V.ink3, whiteSpace: "nowrap" }}>{Math.abs(v) >= 1000 ? Math.round(Math.abs(v) / 1000) + "b" : Math.round(Math.abs(v))}</span>
                  <div style={{ width: "62%", maxWidth: 30, height: `${h}px`, background: barRenk(v), borderRadius: "4px 4px 0 0", minHeight: 2, transition: "height .3s" }} />
                  <span style={{ fontSize: "11px", color: V.ink3 }}>{m.label}</span>
                </div>
              );
            })}
          </div>
          <p style={{ margin: "4px 2px 0", fontSize: "10.5px", color: V.ink3 }}>Her metrik kendi ölçeğinde — bir aya tıkla, o ayın işlemlerini gör.</p>
        </Card>
      </div>

      {/* Akıllı İçgörüler */}
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

      {drill && <DrilldownModal {...drill} onClose={() => setDrill(null)} />}
    </div>
  );
}

// İçgörü hesaplama — React span dizileri döner (dangerouslySetInnerHTML YOK)
function icgoruler(findata, fd, katlar, oz) {
  const out = [];
  const vurgu = (txt) => <strong style={{ color: V.cream, fontWeight: 600 }}>{txt}</strong>;
  const altin = (txt) => <strong style={{ color: V.accent, fontWeight: 600 }}>{txt}</strong>;

  // Panel ile tutarlı: gelir + giderToplam (abonelik dahil)
  const gelir = oz ? oz.gelir : (fd.gelirler || []).reduce((s, g) => s + (g.miktar || 0), 0);
  const giderKalem = oz ? oz.giderKalem : (fd.giderler || []).reduce((s, g) => s + (g.miktar || 0), 0);
  const giderToplam = oz ? oz.giderToplam : giderKalem;

  // 1) En yüksek harcama kategorisi
  if (katlar.length) {
    const { kategori, toplam } = katlar[0];
    const pay = giderKalem > 0 ? (toplam / giderKalem) * 100 : 0;
    out.push(<>En çok harcama {vurgu(kategori)} kategorisinde: {altin(TL(toplam))} (giderin %{pay.toFixed(0)}'i).</>);
  }

  // 2) Tasarruf oranı (net / gelir) — abonelik dahil
  if (gelir > 0) {
    const oran = ((gelir - giderToplam) / gelir) * 100;
    out.push(
      <>
        Tasarruf oranın {altin("%" + oran.toFixed(0))} —{" "}
        {oran >= 20 ? vurgu("harika gidiyorsun") : oran >= 0 ? "fena değil, biraz daha kısabilirsin" : vurgu("bu dönem açık verdin")}.
      </>
    );
  }

  // 3) En büyük aylık kategori değişimi (bu ay vs geçen ay) — TZ-güvenli aylar
  const buAyStr = buAyYerel(), gecenAyStr = oncekiAy(buAyStr);
  const buKat = {}, gecenKat = {};
  ayKayitlari(findata.giderler, buAyStr).forEach((g) => { buKat[g.kategori] = (buKat[g.kategori] || 0) + (g.miktar || 0); });
  ayKayitlari(findata.giderler, gecenAyStr).forEach((g) => { gecenKat[g.kategori] = (gecenKat[g.kategori] || 0) + (g.miktar || 0); });
  let enBuyuk = null;
  [...new Set([...Object.keys(buKat), ...Object.keys(gecenKat)])].forEach((k) => {
    const diff = (buKat[k] || 0) - (gecenKat[k] || 0);
    if (!enBuyuk || Math.abs(diff) > Math.abs(enBuyuk.diff)) enBuyuk = { k, diff, y: gecenKat[k] || 0 };
  });
  if (enBuyuk && Math.abs(enBuyuk.diff) > 0) {
    const artti = enBuyuk.diff > 0;
    const pct = enBuyuk.y > 0 ? Math.abs((enBuyuk.diff / enBuyuk.y) * 100) : 100;
    out.push(<>{vurgu(enBuyuk.k)} harcaman geçen aya göre {artti ? "arttı" : "azaldı"}: {altin((artti ? "+" : "−") + "%" + pct.toFixed(0))} ({TL(Math.abs(enBuyuk.diff))}).</>);
  }

  // 4) Bütçe uyarıları
  const butceler = findata.butceler || {};
  const uyarilar = [];
  Object.keys(butceler).forEach((k) => {
    const limit = etkinButce(findata, k, buAyStr);
    if (limit <= 0) return;
    const yuzde = ((buKat[k] || 0) / limit) * 100;
    if (yuzde >= 85) uyarilar.push({ k, yuzde });
  });
  if (uyarilar.length) {
    const u = uyarilar.sort((a, b) => b.yuzde - a.yuzde)[0];
    out.push(<>{vurgu(u.k)} bütçesinin {altin("%" + u.yuzde.toFixed(0))}'ini kullandın — {u.yuzde >= 100 ? vurgu("limiti aştın") : "limite yaklaştın"}.</>);
  }

  return out.slice(0, 5);
}

// ============================================================
// KARŞILAŞTIRMA: Bu ay vs Geçen ay (kategori bazlı) — satıra tıkla → işlemler
// ============================================================
function Karsilastir({ findata }) {
  const [drill, setDrill] = useState(null);
  const bu = buAyYerel(), gecen = oncekiAy(bu);
  const buKat = {}, gecenKat = {};
  ayKayitlari(findata.giderler, bu).forEach((g) => { buKat[g.kategori] = (buKat[g.kategori] || 0) + (g.miktar || 0); });
  ayKayitlari(findata.giderler, gecen).forEach((g) => { gecenKat[g.kategori] = (gecenKat[g.kategori] || 0) + (g.miktar || 0); });
  const tumKat = [...new Set([...Object.keys(buKat), ...Object.keys(gecenKat)])]
    .map((k) => ({ ad: k, buAy: buKat[k] || 0, gecenAy: gecenKat[k] || 0 }))
    .sort((a, b) => b.buAy - a.buAy);
  const maxV = Math.max(...tumKat.flatMap((k) => [k.buAy, k.gecenAy]), 1);
  const buTop = Object.values(buKat).reduce((a, b) => a + b, 0);
  const gecenTop = Object.values(gecenKat).reduce((a, b) => a + b, 0);
  const fark = (x, y) => (y === 0 ? (x > 0 ? 100 : 0) : ((x - y) / y) * 100);

  const Chip = ({ x, y }) => {
    const f = fark(x, y);
    const renk = f > 0 ? V.neg : f < 0 ? V.pos : V.ink3;
    return (
      <span className="num" style={{ fontSize: "11px", fontWeight: 700, color: renk, background: "color-mix(in srgb, currentColor 14%, transparent)", padding: "2px 8px", borderRadius: "99px" }}>
        {f > 0 ? "▲" : f < 0 ? "▼" : "–"} %{Math.abs(f).toFixed(0)}
      </span>
    );
  };

  const Satir = ({ ad, buAy, gecenAy, tikla }) => (
    <div onClick={tikla} className={tikla ? "fa-btn" : ""} style={{ marginBottom: "18px", cursor: tikla ? "pointer" : "default", padding: tikla ? "2px 0" : 0 }} title={tikla ? "Bu ayki işlemleri gör" : undefined}>
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", flexWrap: "wrap", gap: 8 }}>
        <h3 className="serif" style={cardTitle}>Bu Ay / Geçen Ay <span style={{ fontSize: 11, color: V.ink3, fontWeight: 400 }}>· satıra tıkla</span></h3>
        <div style={{ display: "flex", gap: "14px", fontSize: "11px", color: V.ink3 }}>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><span style={{ width: 9, height: 9, borderRadius: 2, background: V.emerald2 }} />Bu ay</span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><span style={{ width: 9, height: 9, borderRadius: 2, background: V.border2 }} />Geçen ay</span>
        </div>
      </div>
      {tumKat.map((k) => (
        <Satir key={k.ad} ad={k.ad} buAy={k.buAy} gecenAy={k.gecenAy}
          tikla={() => setDrill({ baslik: `${k.ad} · ${kisaAy(bu)}`, tip: "gider", kayitlar: ayKayitlari(findata.giderler, bu).filter((g) => g.kategori === k.ad) })} />
      ))}
      <div style={{ borderTop: `1px solid ${V.line}`, paddingTop: "14px", marginTop: "2px" }}>
        <Satir ad="TOPLAM GİDER" buAy={buTop} gecenAy={gecenTop} />
      </div>
      {drill && <DrilldownModal {...drill} onClose={() => setDrill(null)} />}
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
        <Mini baslik="Tasarruf Oranı" deger={`%${o.tasarrufOrani.toFixed(0)}`} renk={V.accent}
          alt={o.tasarrufOrani >= 20 ? "İyi" : o.tasarrufOrani >= 0 ? "İdare eder" : "Açık var"} altRenk={o.tasarrufOrani >= 0 ? V.pos : V.neg} />
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
