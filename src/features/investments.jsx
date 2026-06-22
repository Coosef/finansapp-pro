// ============================================================
// Yatırımlar + Yatırım ekleme modalı
// ============================================================
import { useState } from "react";
import { C, pageTitle, sectionTitle, inputStyle, tagStyle, VARLIK_TIPLERI } from "../lib/constants.js";
import { TL, TL2 } from "../lib/format.js";
import { Card, Btn, Stat, ProgressBar, DelBtn, Bos, Modal, Field } from "../components/ui.jsx";
import { Sparkline } from "../components/charts.jsx";

export function Yatirimlar({ findata, setFindata, guncelDeger, onEkle, onSil, onGuncelle, guncelleniyor }) {
  const [hedefAcik, setHedefAcik] = useState(false);
  const enf = findata.ayarlar?.enflasyon || 0;
  const toplam = findata.yatirimlar.reduce((s, y) => s + guncelDeger(y), 0);
  const maliyet = findata.yatirimlar.reduce((s, y) => s + y.adet * y.alisFiyati, 0);
  const kar = toplam - maliyet;
  const reelDeger = findata.yatirimlar.reduce((s, y) => {
    const yil = Math.max(0, (Date.now() - new Date(y.alisTarihi)) / (365 * 86400000));
    const kat = Math.pow(1 + enf / 100, yil);
    return s + guncelDeger(y) / kat;
  }, 0);
  const reelKar = reelDeger - maliyet;
  const grup = {};
  findata.yatirimlar.forEach((y) => { grup[y.tip] = (grup[y.tip] || 0) + guncelDeger(y); });
  const hedefDagilim = findata.hedefDagilim || {};
  const kur = findata.kurlar;

  const gunluk = (y) => (!y.oncekiFiyat || !y.guncelFiyat ? null : ((y.guncelFiyat - y.oncekiFiyat) / y.oncekiFiyat) * 100);
  const haftalik = (y) => {
    const g = y.gecmis || [];
    if (g.length < 2) return null;
    const son = g[g.length - 1];
    const ht = new Date();
    ht.setDate(ht.getDate() - 7);
    const t = ht.toISOString().split("T")[0];
    const o = g.filter((p) => p.tarih <= t).pop() || g[0];
    if (!o || !o.deger) return null;
    return ((son.deger - o.deger) / o.deger) * 100;
  };
  const hedefKaydet = (tip, val) => setFindata((d) => ({ ...d, hedefDagilim: { ...(d.hedefDagilim || {}), [tip]: parseFloat(val) || 0 } }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h2 style={pageTitle}>Yatırımlar</h2>
          <p style={{ margin: 0, color: C.indigoL, fontWeight: 600, fontSize: "0.9rem" }}>Portföy: {TL(toplam)}{kur && <span style={{ color: C.faint, fontWeight: 400 }}> · ${(toplam / kur.usd).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</span>}</p>
        </div>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <Btn variant="ghost" onClick={() => setHedefAcik(!hedefAcik)}>🎯 Hedef Dağılım</Btn>
          <Btn variant="ghost" onClick={onGuncelle} disabled={guncelleniyor}>{guncelleniyor ? "Güncelleniyor…" : "🔄 Fiyatları Güncelle"}</Btn>
          <Btn onClick={onEkle}>+ Yatırım</Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <Stat title="Nominal Kâr/Zarar" value={`${kar >= 0 ? "+" : ""}${TL(kar)}`} sub={`${maliyet ? ((kar / maliyet) * 100).toFixed(1) : 0}% getiri`} subColor={kar >= 0 ? C.greenL : C.redL} color={kar >= 0 ? C.green : C.red} icon="📊" />
        <Stat title={`Reel K/Z (enf. %${enf})`} value={`${reelKar >= 0 ? "+" : ""}${TL(reelKar)}`} sub={reelKar >= 0 ? "Enflasyonu yendin 👍" : "Enflasyonun altında kaldı"} subColor={reelKar >= 0 ? C.greenL : C.redL} color={C.cyan} icon="🔥" />
      </div>

      {hedefAcik && (
        <Card style={{ marginBottom: "1rem" }}>
          <h3 style={sectionTitle}>Hedef Dağılım vs Gerçek</h3>
          {VARLIK_TIPLERI.map((vt) => {
            const gercek = toplam ? ((grup[vt.id] || 0) / toplam) * 100 : 0;
            const hedef = hedefDagilim[vt.id] || 0;
            const sapma = gercek - hedef;
            return (
              <div key={vt.id} style={{ marginBottom: "0.9rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem", gap: "0.75rem" }}>
                  <span style={{ color: C.dim, fontSize: "0.82rem", minWidth: 90 }}>{vt.label}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.78rem" }}>
                    <span style={{ color: C.text }}>%{gercek.toFixed(0)}</span>
                    <span style={{ color: C.dimmer }}>Hedef</span>
                    <input type="number" value={hedef || ""} onChange={(e) => hedefKaydet(vt.id, e.target.value)} placeholder="0" style={{ ...inputStyle, width: 56, padding: "0.25rem 0.4rem", fontSize: "0.78rem" }} />
                    <span style={{ color: C.dimmer }}>%</span>
                    {hedef > 0 && Math.abs(sapma) > 5 && <span style={tagStyle(sapma > 0 ? C.amber : C.cyan)}>{sapma > 0 ? "FAZLA" : "AZ"}</span>}
                  </div>
                </div>
                <div style={{ position: "relative" }}>
                  <ProgressBar value={gercek} max={100} color={vt.renk} />
                  {hedef > 0 && <div style={{ position: "absolute", top: -2, left: `${Math.min(100, hedef)}%`, width: 2, height: 12, background: "#fff" }} />}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {!findata.yatirimlar.length && <Bos mesaj="Henüz yatırım yok. Kripto, altın, döviz veya hisse ekleyin." />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: "1rem" }}>
        {findata.yatirimlar.map((y) => {
          const vt = VARLIK_TIPLERI.find((v) => v.id === y.tip);
          const deger = guncelDeger(y),
            mal = y.adet * y.alisFiyati,
            kz = deger - mal,
            kzY = mal ? (kz / mal) * 100 : 0;
          const gun = gunluk(y),
            haf = haftalik(y);
          return (
            <Card key={y.id} accent={vt?.renk}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                <div>
                  <p style={{ margin: "0 0 0.15rem", fontWeight: 700, fontSize: "1rem" }}>{y.ad} <span style={{ color: C.faint, fontWeight: 400, fontSize: "0.78rem" }}>{y.sembol}</span></p>
                  <p style={{ margin: 0, color: C.dimmer, fontSize: "0.74rem" }}>{vt?.label} · {y.adet} {vt?.birim}</p>
                </div>
                <DelBtn onClick={() => onSil(y.id)} />
              </div>
              <p style={{ margin: "0 0 0.4rem", fontWeight: 700, fontSize: "1.3rem" }}>{TL2(deger)}</p>
              <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ background: kz >= 0 ? "#0D2718" : "#1F0A0A", border: `1px solid ${kz >= 0 ? "#166534" : "#7F1D1D"}`, color: kz >= 0 ? C.greenL : C.redL, padding: "0.18rem 0.5rem", borderRadius: 999, fontSize: "0.72rem", fontWeight: 600 }}>Top {kz >= 0 ? "+" : ""}{kzY.toFixed(1)}%</span>
                {gun !== null && <span style={{ color: gun >= 0 ? C.greenL : C.redL, fontSize: "0.72rem", fontWeight: 600 }}>Gün {gun >= 0 ? "+" : ""}{gun.toFixed(1)}%</span>}
                {haf !== null && <span style={{ color: haf >= 0 ? C.greenL : C.redL, fontSize: "0.72rem", fontWeight: 600 }}>Hafta {haf >= 0 ? "+" : ""}{haf.toFixed(1)}%</span>}
              </div>
              <Sparkline points={y.gecmis} color={vt?.renk} height={48} width={260} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.6rem", fontSize: "0.72rem", color: C.faint }}>
                <span>Alış {TL2(y.alisFiyati)}</span>
                <span>Güncel {y.guncelFiyat ? TL2(y.guncelFiyat) : "—"}</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function YatirimModal({ form, setForm, onClose, onKaydet }) {
  const vt = VARLIK_TIPLERI.find((v) => v.id === form.tip);
  return (
    <Modal title="Yatırım Ekle" onClose={onClose}>
      <Field label="Varlık Tipi" value={form.tip} onChange={(v) => setForm((f) => ({ ...f, tip: v }))} options={VARLIK_TIPLERI} />
      <Field label="Ad" value={form.ad} onChange={(v) => setForm((f) => ({ ...f, ad: v }))} placeholder="Bitcoin / Gram Altın / THYAO" />
      <Field label="Sembol (fiyat için)" value={form.sembol} onChange={(v) => setForm((f) => ({ ...f, sembol: v }))} placeholder={form.tip === "kripto" ? "BTC, ETH…" : form.tip === "doviz" ? "USD, EUR…" : form.tip === "hisse" ? "THYAO…" : "altın"} />
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <div style={{ flex: 1 }}>
          <Field label={`Miktar (${vt?.birim})`} type="number" value={form.adet} onChange={(v) => setForm((f) => ({ ...f, adet: v }))} />
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Alış Fiyatı (₺)" type="number" value={form.alisFiyati} onChange={(v) => setForm((f) => ({ ...f, alisFiyati: v }))} />
        </div>
      </div>
      <Field label="Alış Tarihi" type="date" value={form.alisTarihi} onChange={(v) => setForm((f) => ({ ...f, alisTarihi: v }))} />
      <Btn onClick={onKaydet} style={{ width: "100%", padding: "0.7rem", marginTop: "0.3rem" }}>Yatırımı Ekle</Btn>
    </Modal>
  );
}
