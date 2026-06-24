// ============================================================
// Yatırımlar + Yatırım ekleme/düzenleme modalı — Zümrüt & Altın
// ============================================================
import { useState } from "react";
import { V, F, VARLIK_TIPLERI, PALET } from "../lib/constants.js";
import { TL, bugun, sayiCevir } from "../lib/format.js";
import { Card, Btn, Modal, Field, DelBtn, EditBtn, Bos } from "../components/ui.jsx";
import { Icon } from "../components/icons.jsx";

// Tek yatırımın güncel fiyatını elle güncelle (AI/CoinGecko gerekmeden)
// — manuel fiyat mantığı korunur: guncelFiyat + sonGuncelleme + bugünün gecmis noktası
function manuelFiyatUygula(setFindata, y, fiyat) {
  const f = sayiCevir(fiyat);
  if (f <= 0) return;
  const t = bugun();
  setFindata((d) => ({
    ...d,
    yatirimlar: d.yatirimlar.map((z) => {
      if (z.id !== y.id) return z;
      const g = z.gecmis || [];
      const yd = z.adet * f;
      const son = g[g.length - 1];
      const g2 = son && son.tarih === t ? [...g.slice(0, -1), { tarih: t, deger: yd }] : [...g, { tarih: t, deger: yd }];
      return { ...z, oncekiFiyat: z.guncelFiyat || z.alisFiyati, guncelFiyat: f, sonGuncelleme: t, gecmis: g2 };
    }),
  }));
}

// Manuel fiyat girişi modalı (yerel)
function FiyatModal({ y, setFindata, onClose }) {
  const [val, setVal] = useState(String(y.guncelFiyat || y.alisFiyati || ""));
  const vt = VARLIK_TIPLERI.find((v) => v.id === y.tip);
  function kaydet() {
    manuelFiyatUygula(setFindata, y, val);
    onClose();
  }
  return (
    <Modal title="Güncel Fiyat" maxWidth={360} onClose={onClose}>
      <div style={{ fontSize: "13px", color: V.ink2, marginBottom: 14 }}>
        <span style={{ fontWeight: 600, color: V.ink }}>{y.ad}</span>
        <span className="num" style={{ color: V.ink3 }}> · {y.adet} {vt?.birim || "adet"}</span>
      </div>
      <Field label="Güncel birim fiyat (₺)" value={val} onChange={setVal} mono placeholder="0" />
      <Btn variant="primary" onClick={kaydet} style={{ width: "100%", marginTop: 4 }}>Fiyatı Uygula</Btn>
    </Modal>
  );
}

// Zümrüt renkli portföy büyüme grafiği (inline SVG)
function BuyumeGrafik({ points, height = 120 }) {
  if (!points || points.length < 2)
    return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: V.ink3, fontSize: "13px" }}>Yeterli veri yok</div>;
  const width = 320;
  const ys = points.map((p) => p.deger);
  const min = Math.min(...ys), max = Math.max(...ys), range = max - min || 1;
  const stepX = width / (points.length - 1);
  const coord = (p, i) => [i * stepX, height - ((p.deger - min) / range) * (height - 10) - 5];
  const path = points.map((p, i) => { const [x, yy] = coord(p, i); return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${yy.toFixed(1)}`; }).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="yatBuyume" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={V.emerald2} stopOpacity="0.35" />
          <stop offset="100%" stopColor={V.emerald2} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${width},${height} L0,${height} Z`} fill="url(#yatBuyume)" />
      <path d={path} fill="none" stroke={V.emerald2} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Varlık dağılımı (PALET renkli çubuklar)
function Dagilim({ yatirimlar, guncelDeger }) {
  const grup = {};
  yatirimlar.forEach((y) => { grup[y.tip] = (grup[y.tip] || 0) + guncelDeger(y); });
  const toplam = Object.values(grup).reduce((a, b) => a + b, 0) || 1;
  const tipler = Object.keys(grup);
  if (!tipler.length) return <div style={{ color: V.ink3, fontSize: "13px" }}>Henüz yatırım yok.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "13px", marginTop: 4 }}>
      {tipler.map((t, i) => {
        const vt = VARLIK_TIPLERI.find((v) => v.id === t);
        const yuzde = (grup[t] / toplam) * 100;
        const renk = vt?.renk || PALET[i % PALET.length];
        return (
          <div key={t}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ color: V.ink2, fontSize: "12.5px" }}>{vt?.label} <span style={{ color: V.ink3 }}>%{yuzde.toFixed(0)}</span></span>
              <span className="num" style={{ color: V.ink, fontWeight: 600, fontSize: "12.5px" }}>{TL(grup[t])}</span>
            </div>
            <div className="fa-bar" style={{ height: 8, background: V.track, borderRadius: 99, overflow: "hidden" }}>
              <div style={{ width: `${yuzde}%`, height: "100%", borderRadius: 99, background: renk }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Yatirimlar({ findata, setFindata, guncelDeger, yatirimDeger, yatirimKar, yatirimMaliyet, onEkle, onSil, onDuzenle, onGuncelle, guncelleniyor }) {
  const [fiyatY, setFiyatY] = useState(null); // manuel fiyat modalı için seçili yatırım

  const yatirimlar = findata.yatirimlar || [];
  const getiri = yatirimMaliyet > 0 ? (yatirimKar / yatirimMaliyet * 100).toFixed(1) + "%" : "—";
  const karRenk = yatirimKar >= 0 ? V.pos : V.neg;

  // Portföy büyüme serisi (tüm yatırımların gecmis noktalarından)
  const tarihSet = {};
  yatirimlar.forEach((y) => (y.gecmis || []).forEach((p) => { tarihSet[p.tarih] = true; }));
  const portfoyGecmis = Object.keys(tarihSet).sort().map((t) => ({
    tarih: t,
    deger: yatirimlar.reduce((s, y) => { const g = (y.gecmis || []).filter((p) => p.tarih <= t).pop(); return s + (g ? g.deger : 0); }, 0),
  }));

  return (
    <div className="fa-page">
      {/* Araç çubuğu */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginBottom: 14, flexWrap: "wrap" }}>
        <Btn variant="soft" onClick={onGuncelle} disabled={guncelleniyor}>
          <Icon d="refresh" size={15} />
          {guncelleniyor ? "Güncelleniyor…" : "Fiyatları Güncelle"}
        </Btn>
        <Btn variant="primary" onClick={onEkle}>
          <Icon d="plus" size={15} />
          Varlık
        </Btn>
      </div>

      {/* İstatistik kartları */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 16 }} className="fa-grid">
        <div style={{ background: V.emerald, borderRadius: 14, padding: "18px 20px", color: "#F4F1E9" }}>
          <div style={{ fontSize: "11.5px", color: V.sage, textTransform: "uppercase", letterSpacing: "0.05em" }}>Portföy Değeri</div>
          <div className="num" style={{ fontSize: 24, fontWeight: 600, marginTop: 7, color: V.cream }}>{TL(yatirimDeger)}</div>
        </div>
        <div className="fa-card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "11.5px", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Toplam Kâr</div>
          <div className="num" style={{ fontSize: 24, fontWeight: 600, marginTop: 7, color: karRenk }}>{yatirimKar >= 0 ? "+" : ""}{TL(yatirimKar)}</div>
        </div>
        <div className="fa-card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "11.5px", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Getiri</div>
          <div className="num" style={{ fontSize: 24, fontWeight: 600, marginTop: 7, color: getiri === "—" ? V.ink3 : karRenk }}>{getiri}</div>
        </div>
      </div>

      {/* Grafikler */}
      {yatirimlar.length > 0 && (
        <div className="fa-grid-2" style={{ marginBottom: 16 }}>
          <Card>
            <h3 className="serif" style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 600, color: V.ink }}>Portföy Büyümesi</h3>
            <BuyumeGrafik points={portfoyGecmis} />
          </Card>
          <Card>
            <h3 className="serif" style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 600, color: V.ink }}>Varlık Dağılımı</h3>
            <Dagilim yatirimlar={yatirimlar} guncelDeger={guncelDeger} />
          </Card>
        </div>
      )}

      {/* Liste */}
      {!yatirimlar.length ? (
        <Bos baslik="Portföy boş" mesaj="İlk yatırımını ekle." icon="trending" />
      ) : (
        <Card style={{ padding: "6px 18px" }}>
          {yatirimlar.map((y, idx) => {
            const vt = VARLIK_TIPLERI.find((v) => v.id === y.tip);
            const deger = guncelDeger(y);
            const mal = y.adet * y.alisFiyati;
            const kar = deger - mal;
            const karY = mal ? (kar / mal) * 100 : 0;
            const renk = vt?.renk || PALET[idx % PALET.length];
            const profitRenk = kar >= 0 ? V.pos : V.neg;
            return (
              <div key={y.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 0", borderBottom: idx === yatirimlar.length - 1 ? "none" : `1px solid ${V.line}` }}>
                <div className="num" style={{ width: 38, height: 38, borderRadius: 11, flex: "none", background: V.emerald, color: V.cream, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
                  {(y.sembol || y.ad || "").slice(0, 4)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13.5px", fontWeight: 600, color: V.ink, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{y.ad}</span>
                    <span style={{ background: `${renk}22`, color: renk, fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: 99, letterSpacing: "0.02em", flex: "none" }}>{vt?.label}</span>
                  </div>
                  <div className="num" style={{ fontSize: "11.5px", color: V.ink3, marginTop: 2 }}>{y.adet} {vt?.birim || "adet"}</div>
                </div>
                <div style={{ textAlign: "right", flex: "none" }}>
                  <div className="num" style={{ fontSize: 14, fontWeight: 600, color: V.ink }}>{TL(deger)}</div>
                  <div className="num" style={{ fontSize: "11.5px", color: profitRenk, marginTop: 2 }}>{kar >= 0 ? "+" : ""}{TL(kar)} ({karY.toFixed(1)}%)</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 2, flex: "none" }}>
                  <button className="fa-btn" onClick={() => setFiyatY(y)} title="Güncel fiyat gir" style={{ background: "transparent", border: "none", color: V.ink3, cursor: "pointer", display: "flex", alignItems: "center", padding: 4 }}>
                    <Icon d="edit" size={15} />
                  </button>
                  {onDuzenle && <EditBtn onClick={() => onDuzenle(y)} />}
                  <DelBtn onClick={() => onSil(y.id)} />
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {fiyatY && <FiyatModal y={fiyatY} setFindata={setFindata} onClose={() => setFiyatY(null)} />}
    </div>
  );
}

export function YatirimModal({ form, setForm, onClose, onKaydet }) {
  const upd = (patch) => setForm((f) => ({ ...f, ...patch }));
  const vt = VARLIK_TIPLERI.find((v) => v.id === form.tip);
  return (
    <Modal title={form._editId ? "Yatırımı Düzenle" : "Yatırım Ekle"} maxWidth={420} onClose={onClose}>
      <Field label="Varlık adı" value={form.ad} onChange={(v) => upd({ ad: v })} placeholder="Örn: Bitcoin, Gram Altın" />

      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <Field label="Sembol" value={form.sembol} onChange={(v) => upd({ sembol: v.toUpperCase() })} mono placeholder="BTC" />
        </div>
        <div style={{ flex: 1.4 }}>
          <label style={{ display: "block", fontSize: "11.5px", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Tür</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {VARLIK_TIPLERI.map((t) => {
              const on = form.tip === t.id;
              return (
                <button key={t.id} type="button" onClick={() => upd({ tip: t.id })} className="fa-btn"
                  style={{ border: `1px solid ${on ? V.emerald : V.border}`, borderRadius: 9, padding: "7px 11px", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: F, background: on ? V.emerald : V.card2, color: on ? V.cream : V.ink2 }}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
        <div style={{ flex: 1 }}>
          <Field label={`Adet / Miktar${vt ? ` (${vt.birim})` : ""}`} value={form.adet} onChange={(v) => upd({ adet: v })} mono placeholder="0" />
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Alış fiyatı (₺)" value={form.alisFiyati} onChange={(v) => upd({ alisFiyati: v })} mono placeholder="0" />
        </div>
      </div>

      <Btn variant="primary" onClick={onKaydet} style={{ width: "100%", padding: 13, marginTop: 6 }}>
        {form._editId ? "Kaydet" : "Portföye Ekle"}
      </Btn>
    </Modal>
  );
}
