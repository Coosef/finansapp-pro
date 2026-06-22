// ============================================================
// Analiz: dönem karşılaştırma, birikim/borç simülasyonu, enflasyon
// ============================================================
import { useState } from "react";
import { C, pageTitle, sectionTitle } from "../lib/constants.js";
import { TL } from "../lib/format.js";
import { Card, Btn, Stat, Field, SubNav } from "../components/ui.jsx";
import { Sparkline } from "../components/charts.jsx";
import { Gorseller } from "./visuals.jsx";

export function Analiz({ findata, toplamGelir }) {
  const [alt, setAlt] = useState("karsilastir");
  return (
    <div>
      <h2 style={pageTitle}>Analiz</h2>
      <SubNav value={alt} onChange={setAlt} items={[{ id: "karsilastir", label: "📊 Karşılaştırma" }, { id: "gorsel", label: "🌊 Görseller" }, { id: "birikim", label: "💰 Birikim" }, { id: "borc", label: "🏦 Borç" }, { id: "enflasyon", label: "🔥 Enflasyon" }]} />
      {alt === "karsilastir" && <DonemKarsilastir findata={findata} />}
      {alt === "gorsel" && <Gorseller findata={findata} toplamGelir={toplamGelir} />}
      {alt === "birikim" && <BirikimSim />}
      {alt === "borc" && <BorcHesap />}
      {alt === "enflasyon" && <EnflasyonAsindirma findata={findata} />}
    </div>
  );
}

function DonemKarsilastir({ findata }) {
  const ayTopla = (prefix) => {
    const o = { gelir: 0, gider: 0, kat: {} };
    findata.gelirler.filter((g) => (g.tarih || "").startsWith(prefix)).forEach((g) => (o.gelir += g.miktar));
    findata.giderler.filter((g) => (g.tarih || "").startsWith(prefix)).forEach((g) => {
      o.gider += g.miktar;
      o.kat[g.kategori] = (o.kat[g.kategori] || 0) + g.miktar;
    });
    return o;
  };
  const d = new Date();
  const buAyP = d.toISOString().slice(0, 7);
  const onceki = new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 7);
  const gecenYil = new Date(d.getFullYear() - 1, d.getMonth(), 1).toISOString().slice(0, 7);
  const a = ayTopla(buAyP),
    b = ayTopla(onceki),
    c = ayTopla(gecenYil);
  const fark = (x, y) => (y === 0 ? (x > 0 ? 100 : 0) : ((x - y) / y) * 100);
  const tumKat = [...new Set([...Object.keys(a.kat), ...Object.keys(b.kat)])];
  const Sat = ({ ad, x, y }) => {
    const f = fark(x, y);
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: `1px solid ${C.line}`, fontSize: "0.83rem" }}>
        <span style={{ color: C.dim }}>{ad}</span>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <span style={{ color: C.text }}>{TL(x)}</span>
          <span style={{ color: f > 0 ? C.redL : f < 0 ? C.greenL : C.faint, fontSize: "0.75rem", minWidth: 52, textAlign: "right" }}>{f > 0 ? "▲" : f < 0 ? "▼" : ""}{Math.abs(f).toFixed(0)}%</span>
        </div>
      </div>
    );
  };
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "1rem", marginBottom: "1rem" }}>
        <Stat title={`Bu Ay (${buAyP.slice(5)})`} value={TL(a.gider)} sub={`Gelir ${TL(a.gelir)}`} color={C.indigo} icon="📅" />
        <Stat title={`Geçen Ay (${onceki.slice(5)})`} value={TL(b.gider)} sub={`Gelir ${TL(b.gelir)}`} color={C.dimmer} icon="📆" />
        <Stat title={`Geçen Yıl (${gecenYil.slice(0, 4)})`} value={TL(c.gider)} sub={`Gelir ${TL(c.gelir)}`} color={C.faint} icon="🗓️" />
      </div>
      <Card>
        <h3 style={sectionTitle}>Kategori Bazında: Bu Ay vs Geçen Ay</h3>
        {!tumKat.length && <p style={{ color: C.faint, fontSize: "0.85rem" }}>Karşılaştırılacak veri yok.</p>}
        {tumKat.map((k) => <Sat key={k} ad={k} x={a.kat[k] || 0} y={b.kat[k] || 0} />)}
        <div style={{ marginTop: "0.75rem" }}>
          <Sat ad="TOPLAM GİDER" x={a.gider} y={b.gider} />
        </div>
      </Card>
    </div>
  );
}

function BirikimSim() {
  const [aylik, setAylik] = useState("5000");
  const [getiri, setGetiri] = useState("40");
  const [yil, setYil] = useState("5");
  const [baslangic, setBaslangic] = useState("0");
  const ay = parseFloat(aylik) || 0,
    r = (parseFloat(getiri) || 0) / 100 / 12,
    n = (parseFloat(yil) || 0) * 12,
    p0 = parseFloat(baslangic) || 0;
  const seri = [];
  let bak = p0;
  for (let i = 1; i <= n; i++) {
    bak = bak * (1 + r) + ay;
    if (i % Math.max(1, Math.round(n / 30)) === 0 || i === n) seri.push({ deger: bak, ay: i });
  }
  const sonuc = bak;
  const yatirilan = p0 + ay * n;
  const kazanc = sonuc - yatirilan;
  return (
    <Card>
      <h3 style={sectionTitle}>Birikim Simülasyonu</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
        <Field label="Aylık Yatırım (₺)" type="number" value={aylik} onChange={setAylik} />
        <Field label="Yıllık Getiri (%)" type="number" value={getiri} onChange={setGetiri} />
        <Field label="Süre (yıl)" type="number" value={yil} onChange={setYil} />
        <Field label="Başlangıç (₺)" type="number" value={baslangic} onChange={setBaslangic} />
      </div>
      <Sparkline points={seri} color={C.greenL} height={120} width={400} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.75rem", marginTop: "1rem" }}>
        <div style={{ textAlign: "center" }}><p style={{ color: C.dimmer, fontSize: "0.72rem", margin: "0 0 0.25rem" }}>Yatırdığın</p><p style={{ color: C.text, fontWeight: 700, margin: 0 }}>{TL(yatirilan)}</p></div>
        <div style={{ textAlign: "center" }}><p style={{ color: C.dimmer, fontSize: "0.72rem", margin: "0 0 0.25rem" }}>Kazanç</p><p style={{ color: C.greenL, fontWeight: 700, margin: 0 }}>{TL(kazanc)}</p></div>
        <div style={{ textAlign: "center" }}><p style={{ color: C.dimmer, fontSize: "0.72rem", margin: "0 0 0.25rem" }}>Toplam</p><p style={{ color: C.indigoL, fontWeight: 700, margin: 0 }}>{TL(sonuc)}</p></div>
      </div>
      <p style={{ color: C.faint, fontSize: "0.72rem", margin: "1rem 0 0", textAlign: "center" }}>Bileşik getiri varsayımıyla; gerçek getiri değişkendir.</p>
    </Card>
  );
}

function BorcHesap() {
  const [borc, setBorc] = useState("100000");
  const [faiz, setFaiz] = useState("3");
  const [odeme, setOdeme] = useState("5000");
  const P = parseFloat(borc) || 0,
    r = (parseFloat(faiz) || 0) / 100,
    A = parseFloat(odeme) || 0;
  let bak = P,
    ay = 0,
    toplamFaiz = 0;
  const seri = [{ deger: P, ay: 0 }];
  if (A > P * r) {
    while (bak > 0 && ay < 600) {
      const f = bak * r;
      toplamFaiz += f;
      bak = bak + f - A;
      ay++;
      if (ay % 2 === 0 || bak <= 0) seri.push({ deger: Math.max(0, bak), ay });
    }
  }
  const bitmiyor = A <= P * r;
  return (
    <Card>
      <h3 style={sectionTitle}>Borç Ödeme Hesaplayıcı</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
        <Field label="Kalan Borç (₺)" type="number" value={borc} onChange={setBorc} />
        <Field label="Aylık Faiz (%)" type="number" value={faiz} onChange={setFaiz} />
        <Field label="Aylık Ödeme (₺)" type="number" value={odeme} onChange={setOdeme} />
      </div>
      {bitmiyor ? (
        <p style={{ color: C.redL, fontSize: "0.85rem" }}>⚠️ Aylık ödeme faizi karşılamıyor; bu ödemeyle borç kapanmaz. Ödemeyi artırın.</p>
      ) : (
        <>
          <Sparkline points={seri} color={C.redL} height={110} width={400} fill={false} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.75rem", marginTop: "1rem" }}>
            <div style={{ textAlign: "center" }}><p style={{ color: C.dimmer, fontSize: "0.72rem", margin: "0 0 0.25rem" }}>Süre</p><p style={{ color: C.text, fontWeight: 700, margin: 0 }}>{ay} ay (~{(ay / 12).toFixed(1)} yıl)</p></div>
            <div style={{ textAlign: "center" }}><p style={{ color: C.dimmer, fontSize: "0.72rem", margin: "0 0 0.25rem" }}>Toplam Faiz</p><p style={{ color: C.redL, fontWeight: 700, margin: 0 }}>{TL(toplamFaiz)}</p></div>
            <div style={{ textAlign: "center" }}><p style={{ color: C.dimmer, fontSize: "0.72rem", margin: "0 0 0.25rem" }}>Toplam Ödeme</p><p style={{ color: C.amber, fontWeight: 700, margin: 0 }}>{TL(P + toplamFaiz)}</p></div>
          </div>
        </>
      )}
    </Card>
  );
}

function EnflasyonAsindirma({ findata }) {
  const [tutar, setTutar] = useState("100000");
  const [yil, setYil] = useState("5");
  const [enf, setEnf] = useState(String(findata.ayarlar?.enflasyon ?? 50));
  const P = parseFloat(tutar) || 0,
    n = parseInt(yil) || 0,
    e = (parseFloat(enf) || 0) / 100;
  const seri = [{ deger: P, ay: 0 }];
  for (let i = 1; i <= n; i++) seri.push({ deger: P / Math.pow(1 + e, i), ay: i });
  const son = seri[seri.length - 1].deger;
  const kayip = P - son;
  return (
    <Card>
      <h3 style={sectionTitle}>🔥 Enflasyon Aşındırma — Param Eriyor mu?</h3>
      <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 1rem" }}>Yastık altındaki paranın alım gücü zamanla nasıl erir?</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
        <Field label="Bugünkü Tutar (₺)" type="number" value={tutar} onChange={setTutar} />
        <Field label="Süre (yıl)" type="number" value={yil} onChange={setYil} />
        <Field label="Yıllık Enflasyon (%)" type="number" value={enf} onChange={setEnf} />
      </div>
      <Sparkline points={seri} color={C.amber} height={120} width={400} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "0.75rem", marginTop: "1rem" }}>
        <div style={{ textAlign: "center" }}><p style={{ color: C.dimmer, fontSize: "0.72rem", margin: "0 0 0.25rem" }}>{n} yıl sonra alım gücü</p><p style={{ color: C.amber, fontWeight: 700, margin: 0, fontSize: "1.2rem" }}>{TL(son)}</p></div>
        <div style={{ textAlign: "center" }}><p style={{ color: C.dimmer, fontSize: "0.72rem", margin: "0 0 0.25rem" }}>Erien değer</p><p style={{ color: C.redL, fontWeight: 700, margin: 0, fontSize: "1.2rem" }}>−{TL(kayip)}</p></div>
      </div>
      <p style={{ color: C.faint, fontSize: "0.72rem", margin: "1rem 0 0", textAlign: "center" }}>Yani bugün {TL(P)}, {n} yıl sonra sadece {TL(son)} değerinde alışveriş yapabilir.</p>
    </Card>
  );
}
