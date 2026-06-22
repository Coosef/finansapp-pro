// ============================================================
// Bütçe & Hedef: kategori bütçesi, zarf bütçe, hedefler,
// tekrarlayanlar, başarımlar + meydan okumalar
// ============================================================
import { useState } from "react";
import { C, pageTitle, sectionTitle, inputStyle, rowStyle, tagStyle, GIDER_KAT } from "../lib/constants.js";
import { uid, TL, buAy, bugun } from "../lib/format.js";
import { rozetleriHesapla } from "../lib/finance.js";
import { Card, Btn, ProgressBar, DelBtn, Bos, Field, SubNav } from "../components/ui.jsx";

export function Planlama({ findata, setFindata, bildir }) {
  const [alt, setAlt] = useState("butce");
  return (
    <div>
      <h2 style={pageTitle}>Bütçe & Hedef</h2>
      <SubNav value={alt} onChange={setAlt} items={[{ id: "butce", label: "📊 Kategori Bütçeleri" }, { id: "zarf", label: "✉️ Zarf Bütçe" }, { id: "hedef", label: "🎯 Hedefler" }, { id: "tekrar", label: "🔁 Tekrarlayanlar" }, { id: "basarim", label: "🏆 Başarımlar" }]} />
      {alt === "butce" && <Butceler findata={findata} setFindata={setFindata} />}
      {alt === "zarf" && <Zarflar findata={findata} setFindata={setFindata} />}
      {alt === "hedef" && <Hedefler findata={findata} setFindata={setFindata} bildir={bildir} />}
      {alt === "tekrar" && <Tekrarlayanlar findata={findata} setFindata={setFindata} bildir={bildir} />}
      {alt === "basarim" && <Basarimlar findata={findata} setFindata={setFindata} bildir={bildir} />}
    </div>
  );
}

function Butceler({ findata, setFindata }) {
  const ay = buAy();
  const ayGider = {};
  findata.giderler.filter((g) => (g.tarih || "").startsWith(ay)).forEach((g) => { ayGider[g.kategori] = (ayGider[g.kategori] || 0) + g.miktar; });
  const set = (kat, val) => setFindata((d) => ({ ...d, butceler: { ...(d.butceler || {}), [kat]: parseFloat(val) || 0 } }));
  return (
    <Card>
      <h3 style={sectionTitle}>Aylık Kategori Limitleri ({ay})</h3>
      <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 1.25rem" }}>Limit gir; %80'de sarı, aşımda kırmızı uyarı verir, panelde takip edilir.</p>
      {GIDER_KAT.map((k) => {
        const h = ayGider[k] || 0,
          l = (findata.butceler || {})[k] || 0;
        return (
          <div key={k} style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem", gap: "0.75rem" }}>
              <span style={{ color: C.dim, fontSize: "0.85rem", minWidth: 90 }}>{k}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ color: C.dimmer, fontSize: "0.78rem" }}>{TL(h)} /</span>
                <input type="number" value={l || ""} onChange={(e) => set(k, e.target.value)} placeholder="limit" style={{ ...inputStyle, width: 110, padding: "0.35rem 0.5rem", fontSize: "0.82rem" }} />
              </div>
            </div>
            {l > 0 && <ProgressBar value={h} max={l} />}
          </div>
        );
      })}
    </Card>
  );
}

function Zarflar({ findata, setFindata }) {
  const ay = buAy();
  const ayGider = {};
  findata.giderler.filter((g) => (g.tarih || "").startsWith(ay)).forEach((g) => { ayGider[g.kategori] = (ayGider[g.kategori] || 0) + g.miktar; });
  const zarflar = findata.zarflar || {};
  const set = (k, v) => setFindata((d) => ({ ...d, zarflar: { ...(d.zarflar || {}), [k]: parseFloat(v) || 0 } }));
  const toplamTahsis = Object.values(zarflar).reduce((a, b) => a + (+b || 0), 0);
  return (
    <div>
      <Card style={{ marginBottom: "1rem" }}>
        <h3 style={sectionTitle}>✉️ Zarf Bütçe ({ay})</h3>
        <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 0.5rem" }}>
          Ayın başında her kategoriye para "zarfla"; harcadıkça zarf boşalır. Toplam tahsis: <b style={{ color: C.text }}>{TL(toplamTahsis)}</b>
        </p>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: "1rem" }}>
        {GIDER_KAT.map((k) => {
          const tah = zarflar[k] || 0,
            harc = ayGider[k] || 0,
            kalanZ = tah - harc;
          const bitti = tah > 0 && kalanZ < 0;
          return (
            <Card key={k} accent={tah > 0 ? (bitti ? C.red : C.amber) : C.line2}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{k}</span>
                <input type="number" value={tah || ""} onChange={(e) => set(k, e.target.value)} placeholder="tahsis" style={{ ...inputStyle, width: 90, padding: "0.3rem 0.45rem", fontSize: "0.8rem" }} />
              </div>
              {tah > 0 && (
                <>
                  <ProgressBar value={harc} max={tah} color={bitti ? C.red : C.amber} />
                  <p style={{ margin: "0.5rem 0 0", fontSize: "0.78rem", color: bitti ? C.redL : C.dim }}>
                    {bitti ? `${TL(-kalanZ)} aşıldı` : `${TL(kalanZ)} kaldı`} <span style={{ color: C.faint }}>· {TL(harc)} harcandı</span>
                  </p>
                </>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Hedefler({ findata, setFindata, bildir }) {
  const [form, setForm] = useState({ ad: "", tip: "birikim", hedefTutar: "", mevcutTutar: "", aylikKatki: "" });
  const hedefler = findata.hedefler || [];
  function ekle() {
    if (!form.ad || !form.hedefTutar) {
      bildir("Ad ve hedef tutar gerekli", "err");
      return;
    }
    setFindata((d) => ({ ...d, hedefler: [...(d.hedefler || []), { id: uid(), ad: form.ad, tip: form.tip, hedefTutar: parseFloat(form.hedefTutar), mevcutTutar: parseFloat(form.mevcutTutar) || 0, aylikKatki: parseFloat(form.aylikKatki) || 0 }] }));
    setForm({ ad: "", tip: "birikim", hedefTutar: "", mevcutTutar: "", aylikKatki: "" });
    bildir("Hedef eklendi");
  }
  function guncelle(id, delta) {
    setFindata((d) => ({ ...d, hedefler: d.hedefler.map((h) => (h.id === id ? { ...h, mevcutTutar: Math.max(0, h.mevcutTutar + delta) } : h)) }));
  }
  function sil(id) {
    setFindata((d) => ({ ...d, hedefler: d.hedefler.filter((h) => h.id !== id) }));
  }
  return (
    <div>
      <Card style={{ marginBottom: "1.25rem" }}>
        <h3 style={sectionTitle}>Yeni Hedef</h3>
        <div className="fa-grid-2">
          <Field label="Ad" value={form.ad} onChange={(v) => setForm((f) => ({ ...f, ad: v }))} placeholder="Acil fon / Araba kredisi" />
          <Field label="Tür" value={form.tip} onChange={(v) => setForm((f) => ({ ...f, tip: v }))} options={[{ id: "birikim", label: "Birikim" }, { id: "borc", label: "Borç Ödeme" }]} />
          <Field label="Hedef Tutar (₺)" type="number" value={form.hedefTutar} onChange={(v) => setForm((f) => ({ ...f, hedefTutar: v }))} />
          <Field label={form.tip === "borc" ? "Kalan Borç (₺)" : "Mevcut (₺)"} type="number" value={form.mevcutTutar} onChange={(v) => setForm((f) => ({ ...f, mevcutTutar: v }))} />
          <Field label="Aylık Katkı/Ödeme (₺)" type="number" value={form.aylikKatki} onChange={(v) => setForm((f) => ({ ...f, aylikKatki: v }))} />
        </div>
        <Btn onClick={ekle}>+ Hedef Ekle</Btn>
      </Card>
      {!hedefler.length && <Bos mesaj="Henüz hedef yok." />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: "1rem" }}>
        {hedefler.map((h) => {
          const borc = h.tip === "borc";
          const kalan = borc ? h.mevcutTutar : h.hedefTutar - h.mevcutTutar;
          const pct = borc ? ((h.hedefTutar - h.mevcutTutar) / h.hedefTutar) * 100 : (h.mevcutTutar / h.hedefTutar) * 100;
          const ayT = h.aylikKatki > 0 ? Math.ceil(kalan / h.aylikKatki) : null;
          return (
            <Card key={h.id} accent={borc ? C.red : C.green}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                <div>
                  <p style={{ margin: "0 0 0.15rem", fontWeight: 700, fontSize: "1rem" }}>{h.ad}</p>
                  <p style={{ margin: 0, color: C.dimmer, fontSize: "0.73rem" }}>{borc ? "Borç ödeme" : "Birikim"}</p>
                </div>
                <DelBtn onClick={() => sil(h.id)} />
              </div>
              <p style={{ margin: "0.5rem 0 0.3rem", fontSize: "0.85rem", color: C.dim }}>{borc ? `Kalan: ${TL(h.mevcutTutar)}` : `${TL(h.mevcutTutar)} / ${TL(h.hedefTutar)}`}</p>
              <ProgressBar value={borc ? h.hedefTutar - h.mevcutTutar : h.mevcutTutar} max={h.hedefTutar} color={borc ? C.green : C.indigo} />
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.78rem", color: C.dimmer }}>%{Math.min(100, Math.max(0, pct)).toFixed(0)} {borc ? "ödendi" : "tamam"}{ayT ? ` · ~${ayT} ay kaldı` : ""}</p>
              <Btn variant="ghost" onClick={() => guncelle(h.id, h.aylikKatki || 100)} style={{ width: "100%", fontSize: "0.78rem", padding: "0.4rem", marginTop: "0.75rem" }}>
                {borc ? "− Ödeme" : "+ Katkı"} {h.aylikKatki ? TL(h.aylikKatki) : ""}
              </Btn>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Tekrarlayanlar({ findata, setFindata, bildir }) {
  const sablonlar = findata.sablonlar || [];
  function sil(id) {
    setFindata((d) => ({ ...d, sablonlar: d.sablonlar.filter((s) => s.id !== id) }));
    bildir("Tekrar şablonu silindi");
  }
  return (
    <Card>
      <h3 style={sectionTitle}>Aktif Tekrarlayan İşlemler</h3>
      <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 1.25rem" }}>"Otomatik tekrarla" seçtiğin işlemler burada; her dönem otomatik oluşturulur.</p>
      {!sablonlar.length && <Bos mesaj="Tekrarlayan işlem yok." />}
      {sablonlar.map((s) => (
        <div key={s.id} style={rowStyle}>
          <div>
            <p style={{ margin: "0 0 0.2rem", fontWeight: 600, fontSize: "0.9rem" }}>
              {s.baslik} <span style={tagStyle(s.tip === "gelir" ? C.green : s.tip === "abonelik" ? C.amber : C.red)}>{s.tip.toUpperCase()}</span>
              <span style={tagStyle(C.cyan)}>{s.frekans.toUpperCase()}</span>
            </p>
            <p style={{ margin: 0, color: C.dimmer, fontSize: "0.73rem" }}>{s.kategori} · son: {s.sonUretilen || "—"}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <p style={{ margin: 0, fontWeight: 700 }}>{TL(s.miktar)}</p>
            <DelBtn onClick={() => sil(s.id)} />
          </div>
        </div>
      ))}
    </Card>
  );
}

function Basarimlar({ findata, setFindata, bildir }) {
  const gd = (y) => y.adet * (y.guncelFiyat || y.alisFiyati);
  const yd = (findata.yatirimlar || []).reduce((s, y) => s + gd(y), 0);
  const nakit = (findata.gelirler || []).reduce((s, x) => s + x.miktar, 0) - (findata.giderler || []).reduce((s, x) => s + x.miktar, 0) - (findata.abonelikler || []).reduce((s, x) => s + x.miktar, 0);
  const netDeger = nakit + yd;
  const toplamGider = (findata.giderler || []).reduce((s, x) => s + x.miktar, 0);
  const rozetler = rozetleriHesapla(findata, netDeger, toplamGider);
  const kazanilan = rozetler.filter((r) => r.kazanildi).length;
  const mo = findata.meydanOkumalar || [];
  const [form, setForm] = useState({ ad: "", gun: "30" });
  function baslat() {
    if (!form.ad) {
      bildir("Meydan okuma adı gerekli", "err");
      return;
    }
    setFindata((d) => ({ ...d, meydanOkumalar: [...(d.meydanOkumalar || []), { id: uid(), ad: form.ad, hedefGun: parseInt(form.gun) || 30, baslangic: bugun() }] }));
    setForm({ ad: "", gun: "30" });
    bildir("Meydan okuma başladı! 💪");
  }
  function vazgec(id) {
    setFindata((d) => ({ ...d, meydanOkumalar: d.meydanOkumalar.filter((m) => m.id !== id) }));
  }
  return (
    <div>
      <Card style={{ marginBottom: "1rem" }}>
        <h3 style={sectionTitle}>🏆 Rozetler ({kazanilan}/{rozetler.length})</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: "0.75rem" }}>
          {rozetler.map((r) => (
            <div key={r.id} style={{ textAlign: "center", padding: "1rem 0.5rem", background: r.kazanildi ? "#0D2718" : C.card2, border: `1px solid ${r.kazanildi ? "#166534" : C.line}`, borderRadius: "0.75rem", opacity: r.kazanildi ? 1 : 0.5 }}>
              <div style={{ fontSize: "1.8rem", marginBottom: "0.35rem", filter: r.kazanildi ? "none" : "grayscale(1)" }}>{r.icon}</div>
              <p style={{ margin: "0 0 0.15rem", fontWeight: 600, fontSize: "0.82rem", color: r.kazanildi ? C.greenL : C.dim }}>{r.ad}</p>
              <p style={{ margin: 0, fontSize: "0.68rem", color: C.faint }}>{r.aciklama}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <h3 style={sectionTitle}>💪 Tasarruf Meydan Okumaları</h3>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <Field label="Meydan okuma" value={form.ad} onChange={(v) => setForm((f) => ({ ...f, ad: v }))} placeholder="Dışarıda yemek yok" />
          </div>
          <div style={{ width: 90 }}>
            <Field label="Gün" type="number" value={form.gun} onChange={(v) => setForm((f) => ({ ...f, gun: v }))} />
          </div>
          <Btn onClick={baslat} style={{ marginBottom: "0.9rem" }}>Başlat</Btn>
        </div>
        {!mo.length && <Bos mesaj="Aktif meydan okuma yok. Bir hedef belirle ve seriyi sürdür!" />}
        {mo.map((m) => {
          const gecen = Math.floor((new Date(bugun()) - new Date(m.baslangic)) / 86400000);
          const bitti = gecen >= m.hedefGun;
          return (
            <div key={m.id} style={{ marginBottom: "0.85rem", padding: "0.85rem 1rem", background: C.card2, border: `1px solid ${bitti ? "#166534" : C.line}`, borderRadius: "0.7rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>{m.ad} {bitti && "🎉"}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <span style={{ fontSize: "0.8rem", color: bitti ? C.greenL : C.dim }}>{Math.min(gecen, m.hedefGun)}/{m.hedefGun} gün</span>
                  <DelBtn onClick={() => vazgec(m.id)} />
                </div>
              </div>
              <ProgressBar value={gecen} max={m.hedefGun} color={bitti ? C.green : C.amber} />
            </div>
          );
        })}
      </Card>
    </div>
  );
}
