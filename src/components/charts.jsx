// ============================================================
// SVG tabanlı grafikler (harici kütüphane yok) — Zümrüt & Altın
// Tüm renkler V belirteçleri / PALET üzerinden temalanır (açık/koyu)
// ============================================================
import { V, F, AY_ADI, VARLIK_TIPLERI, PALET } from "../lib/constants.js";
import { TL } from "../lib/format.js";
import { ProgressBar, Btn } from "./ui.jsx";
import { useState } from "react";

export function Sparkline({ points, color = V.emerald2, height = 60, width = 240, fill = true }) {
  if (!points || points.length < 2)
    return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: V.ink3, fontSize: "0.75rem" }}>Yeterli veri yok</div>;
  const ys = points.map((p) => p.deger);
  const min = Math.min(...ys),
    max = Math.max(...ys),
    range = max - min || 1;
  const stepX = width / (points.length - 1);
  const coord = (p, i) => [i * stepX, height - ((p.deger - min) / range) * (height - 8) - 4];
  const path = points
    .map((p, i) => {
      const [x, y] = coord(p, i);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const id = "g" + String(color).replace(/[^a-zA-Z0-9]/g, "") + Math.round(width) + Math.round(height);
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      {fill && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.32" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${path} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} />
        </>
      )}
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function BarChart({ data, height = 160 }) {
  if (!data.length) return <div style={{ color: V.ink3, fontSize: "0.8rem", padding: "1rem 0" }}>Veri yok</div>;
  const max = Math.max(...data.flatMap((d) => [d.gelir, d.gider]), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "0.75rem", height, paddingTop: "1rem" }}>
      {data.map((d) => (
        <div key={d.ay} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem" }}>
          <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: height - 30, width: "100%", justifyContent: "center" }}>
            <div title={`Gelir ${TL(d.gelir)}`} style={{ width: "40%", maxWidth: 22, height: `${(d.gelir / max) * 100}%`, background: V.emerald2, borderRadius: "3px 3px 0 0", minHeight: 2 }} />
            <div title={`Gider ${TL(d.gider)}`} style={{ width: "40%", maxWidth: 22, height: `${(d.gider / max) * 100}%`, background: V.accent, borderRadius: "3px 3px 0 0", minHeight: 2 }} />
          </div>
          <span style={{ color: V.ink3, fontSize: "0.68rem" }}>{d.ay}</span>
        </div>
      ))}
    </div>
  );
}

export function DonutDagilim({ yatirimlar, guncelDeger }) {
  const grup = {};
  yatirimlar.forEach((y) => {
    grup[y.tip] = (grup[y.tip] || 0) + guncelDeger(y);
  });
  const toplam = Object.values(grup).reduce((a, b) => a + b, 0) || 1;
  const tipler = Object.keys(grup);
  if (!tipler.length) return <p style={{ color: V.ink3, fontSize: "0.85rem" }}>Henüz yatırım yok.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.5rem" }}>
      {tipler.map((t) => {
        const vt = VARLIK_TIPLERI.find((v) => v.id === t);
        const y = (grup[t] / toplam) * 100;
        return (
          <div key={t}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
              <span style={{ color: V.ink2, fontSize: "0.82rem" }}>{vt?.label} <span style={{ color: V.ink3 }}>%{y.toFixed(0)}</span></span>
              <span style={{ color: V.ink, fontWeight: 600, fontSize: "0.82rem" }}>{TL(grup[t])}</span>
            </div>
            <ProgressBar value={y} max={100} color={vt?.renk} />
          </div>
        );
      })}
    </div>
  );
}

export function Sankey({ gelir, kalemler }) {
  // En büyük 7 kalem + "Diğer" — tek dev blok / kalabalık yerine dengeli.
  const sirali = [...kalemler].sort((a, b) => b.deger - a.deger);
  const nodes = sirali.slice(0, 7).map((k) => ({ ...k }));
  const kuyruk = sirali.slice(7);
  if (kuyruk.length) nodes.push({ ad: "Diğer", deger: kuyruk.reduce((s, k) => s + k.deger, 0), renk: PALET[7 % PALET.length] });
  const totalRight = nodes.reduce((s, n) => s + n.deger, 0) || 1;
  const pctOf = gelir > 0 ? gelir : totalRight;

  // Sabit koordinat sistemi; YÜKSEKLİK KAPALI (ekranı doldurmasın). Üstte
  // "Gelir" etiketi için ayrı satır (topPad) → kırpılmaz.
  const W = 1000, pad = 8, gap = 6, topPad = 22;
  const bodyH = Math.min(320, Math.max(150, nodes.length * 40 + 20));
  const H = bodyH + topPad;
  const drawH = bodyH - pad * 2 - gap * Math.max(0, nodes.length - 1);
  const olcek = drawH / totalRight;
  const barW = 15, leftX = 34, x1 = leftX + barW, x2 = W - 250;

  let y = topPad + pad;
  const drawn = nodes.map((n) => {
    const h = Math.max(4, n.deger * olcek);
    const o = { ...n, y, h };
    y += h + gap;
    return o;
  });
  const solTop = topPad + pad, solBot = y - gap, solH = solBot - solTop;
  let linkSolY = solTop;
  const cx = (x1 + x2) / 2;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }} fontFamily={F}>
      {/* Gelir (sol) */}
      <text x={leftX} y={14} fill={V.emerald2} fontSize="13" fontWeight="700">Gelir · {TL(gelir)}</text>
      <rect x={leftX} y={solTop} width={barW} height={solH} rx={4} fill={V.emerald2} />
      {/* Akış bağlantıları */}
      {drawn.map((n, i) => {
        const sy = linkSolY + n.h / 2; linkSolY += n.h;
        const ty = n.y + n.h / 2;
        return <path key={"l" + i} d={`M${x1},${sy} C${cx},${sy} ${cx},${ty} ${x2},${ty}`} stroke={n.renk} strokeWidth={Math.max(2, n.h)} fill="none" opacity={0.34} />;
      })}
      {/* Kategori düğümleri (sağ) + etiket (ad · tutar · %) */}
      {drawn.map((n, i) => (
        <g key={"n" + i}>
          <rect x={x2} y={n.y} width={barW} height={n.h} rx={4} fill={n.renk} />
          <text x={x2 + barW + 9} y={n.y + n.h / 2 + 4} fill={V.ink2} fontSize="12.5">{n.ad} · {TL(n.deger)} · %{Math.round((n.deger / pctOf) * 100)}</text>
        </g>
      ))}
    </svg>
  );
}

export function IsiHaritasi({ findata }) {
  const [ref, setRef] = useState(new Date());
  const yil = ref.getFullYear(),
    ayIdx = ref.getMonth();
  const ayPrefix = `${yil}-${String(ayIdx + 1).padStart(2, "0")}`;
  const gunSayisi = new Date(yil, ayIdx + 1, 0).getDate();
  const baslangicGun = (new Date(yil, ayIdx, 1).getDay() + 6) % 7;
  const gunGider = {};
  findata.giderler
    .filter((g) => (g.tarih || "").startsWith(ayPrefix))
    .forEach((g) => {
      const d = parseInt(g.tarih.slice(8, 10));
      gunGider[d] = (gunGider[d] || 0) + g.miktar;
    });
  const maxG = Math.max(...Object.values(gunGider), 1);
  // Sıcaklık: düşükten yükseğe sage → altın → bakır (zümrüt-altın paleti)
  const renk = (v) => {
    if (!v) return V.card2;
    const t = v / maxG;
    if (t < 0.34) return `color-mix(in srgb, ${V.accent} ${(25 + t * 60).toFixed(0)}%, transparent)`;
    if (t < 0.67) return `color-mix(in srgb, var(--gold-t) ${(45 + t * 45).toFixed(0)}%, transparent)`;
    return `color-mix(in srgb, var(--neg) ${(55 + t * 40).toFixed(0)}%, transparent)`;
  };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <Btn variant="ghost" onClick={() => setRef(new Date(yil, ayIdx - 1, 1))}>‹</Btn>
        <span className="serif" style={{ fontSize: "0.95rem", fontWeight: 600, color: V.ink }}>{AY_ADI[ayIdx]} {yil}</span>
        <Btn variant="ghost" onClick={() => setRef(new Date(yil, ayIdx + 1, 1))}>›</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((g) => (
          <div key={g} style={{ textAlign: "center", color: V.ink3, fontSize: "0.68rem" }}>{g}</div>
        ))}
        {hucreler(baslangicGun, gunSayisi).map((g, i) =>
          g ? (
            <div key={i} title={gunGider[g] ? TL(gunGider[g]) : ""} style={{ aspectRatio: "1", background: renk(gunGider[g]), border: `1px solid ${V.line}`, borderRadius: "0.4rem", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.62rem", fontWeight: gunGider[g] > maxG * 0.5 ? 700 : 500, color: gunGider[g] > maxG * 0.5 ? "#F4F1E9" : V.ink3 }}>
              {g}
            </div>
          ) : (
            <div key={i} />
          )
        )}
      </div>
      <p style={{ color: V.ink3, fontSize: "0.72rem", margin: "0.75rem 0 0" }}>Koyu = daha yüksek harcama. En yoğun gün: {TL(maxG)}</p>
    </div>
  );
}

function hucreler(baslangicGun, gunSayisi) {
  const arr = [];
  for (let i = 0; i < baslangicGun; i++) arr.push(null);
  for (let g = 1; g <= gunSayisi; g++) arr.push(g);
  return arr;
}
