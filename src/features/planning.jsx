// ============================================================
// Planlama — Bütçe & Hedef, Zarflar, Tekrarlayanlar, Başarımlar
// Zümrüt & Altın tasarımı (açık/koyu tema)
// ============================================================
import { useState } from "react";
import { V, F, SERIF, MONO, GIDER_KAT } from "../lib/constants.js";
import { Icon } from "../components/icons.jsx";
import { uid, TL, buAy, sayiCevir } from "../lib/format.js";
import { etkinButce, butceDevri, rozetleriHesapla } from "../lib/finance.js";
import { Card, Btn, Modal, Field, Toggle, Seg, ProgressBar, DelBtn, EditBtn, Bos } from "../components/ui.jsx";

const lbl = { display: "block", fontSize: "11.5px", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" };
const serifBaslik = { fontSize: "16px", fontWeight: 600, color: V.ink, marginBottom: "16px", fontFamily: SERIF };

// Etkin gider kategorileri (özel varsa onlar, yoksa varsayılan)
const giderKat = (findata) => (findata?.kategoriler?.gider?.length ? findata.kategoriler.gider : GIDER_KAT);

export function Planlama({ findata, setFindata, bildir }) {
  const [alt, setAlt] = useState("bh");
  const sekmeler = [
    { id: "bh", label: "Bütçe & Hedef" },
    { id: "zarf", label: "Zarflar" },
    { id: "tekrar", label: "Tekrarlayanlar" },
    { id: "basarim", label: "Başarımlar" },
  ];
  return (
    <div>
      <h2 className="serif" style={{ margin: "0 0 1rem", fontSize: "1.25rem", fontWeight: 600, color: V.ink, fontFamily: SERIF }}>Planlama</h2>
      <div style={{ marginBottom: "1.1rem" }}>
        <Seg items={sekmeler} value={alt} onChange={setAlt} />
      </div>
      {alt === "bh" && <ButceHedef findata={findata} setFindata={setFindata} bildir={bildir} />}
      {alt === "zarf" && <Zarflar findata={findata} setFindata={setFindata} />}
      {alt === "tekrar" && <Tekrarlayanlar findata={findata} setFindata={setFindata} bildir={bildir} />}
      {alt === "basarim" && <Basarimlar findata={findata} />}
    </div>
  );
}

// ============================================================
// Bütçe & Hedef — iki sütun (mobilde tek)
// ============================================================
function ButceHedef({ findata, setFindata, bildir }) {
  const ay = buAy();
  const devir = !!findata.ayarlar?.butceDevri;

  // Bu ayki kategori harcamaları
  const ayGider = {};
  (findata.giderler || []).filter((g) => (g.tarih || "").startsWith(ay)).forEach((g) => { ayGider[g.kategori] = (ayGider[g.kategori] || 0) + g.miktar; });

  const butceler = findata.butceler || {};
  const hedefler = findata.hedefler || [];
  const kategoriler = giderKat(findata);
  const butceliKats = kategoriler.filter((k) => (butceler[k] || 0) > 0);

  const [butceModal, setButceModal] = useState(null); // {cat, limit}
  const [hedefModal, setHedefModal] = useState(null); // {id?, ad, tip, hedefTutar, aylikKatki, otomatikKatki}

  // ---- Bütçe kaydet (limit 0 → kaldır) ----
  function butceKaydet() {
    const cat = butceModal.cat;
    if (!cat) { bildir("Kategori seç", "err"); return; }
    const limit = sayiCevir(butceModal.limit);
    setFindata((d) => {
      const yeni = { ...(d.butceler || {}) };
      if (limit > 0) yeni[cat] = limit; else delete yeni[cat];
      return { ...d, butceler: yeni };
    });
    bildir(limit > 0 ? "Bütçe kaydedildi" : "Bütçe kaldırıldı");
    setButceModal(null);
  }

  // ---- Hedef kaydet (yeni veya düzenle) ----
  function hedefKaydet() {
    const ad = (hedefModal.ad || "").trim();
    const hedefTutar = sayiCevir(hedefModal.hedefTutar);
    if (!ad || !hedefTutar) { bildir("Ad ve hedef tutar gerekli", "err"); return; }
    const aylikKatki = sayiCevir(hedefModal.aylikKatki);
    const tip = hedefModal.tip || "birikim";
    const oto = !!hedefModal.otomatikKatki;
    setFindata((d) => {
      const list = d.hedefler || [];
      if (hedefModal.id) {
        return { ...d, hedefler: list.map((h) => (h.id === hedefModal.id ? { ...h, ad, tip, hedefTutar, aylikKatki, otomatikKatki: oto } : h)) };
      }
      return { ...d, hedefler: [...list, { id: uid(), ad, tip, hedefTutar, mevcutTutar: 0, aylikKatki, otomatikKatki: oto, sonKatki: buAy() }] };
    });
    bildir(hedefModal.id ? "Hedef güncellendi" : "Hedef eklendi");
    setHedefModal(null);
  }

  function hedefSil(id) {
    setFindata((d) => ({ ...d, hedefler: (d.hedefler || []).filter((h) => h.id !== id) }));
    bildir("Hedef silindi");
    setHedefModal(null);
  }

  // ---- Tek hedefe katkı uygula (birikim +, borç −, clamp) ----
  function katkiUygula(h, miktar) {
    setFindata((d) => ({
      ...d,
      hedefler: (d.hedefler || []).map((x) => {
        if (x.id !== h.id) return x;
        const yeni = x.tip === "borc" ? Math.max(0, (x.mevcutTutar || 0) - miktar) : Math.min(x.hedefTutar, (x.mevcutTutar || 0) + miktar);
        return { ...x, mevcutTutar: yeni };
      }),
    }));
  }

  // ---- Tüm hedeflere aylık katkıyı uygula ----
  const aylikToplam = hedefler.reduce((s, h) => s + (h.aylikKatki || 0), 0);
  function tumKatkiUygula() {
    setFindata((d) => ({
      ...d,
      hedefler: (d.hedefler || []).map((h) => {
        const m = h.aylikKatki || 0;
        if (!m) return h;
        const yeni = h.tip === "borc" ? Math.max(0, (h.mevcutTutar || 0) - m) : Math.min(h.hedefTutar, (h.mevcutTutar || 0) + m);
        return { ...h, mevcutTutar: yeni };
      }),
    }));
    bildir("Aylık katkılar uygulandı");
  }

  return (
    <>
      <div className="fa-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
        {/* ---------- SOL: Aylık Bütçeler ---------- */}
        <Card style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div className="serif" style={{ fontSize: "16px", fontWeight: 600, color: V.ink, fontFamily: SERIF }}>Aylık Bütçeler</div>
            <Btn variant="primary" onClick={() => setButceModal({ cat: "", limit: "" })} style={{ padding: "8px 13px", fontSize: "12.5px" }}>
              <Icon d="plus" size={14} /> Bütçe
            </Btn>
          </div>
          {!butceliKats.length && <Bos mesaj="Henüz bütçe yok. Bir kategoriye limit ekle." icon="bars" />}
          {butceliKats.map((cat) => {
            const harcanan = ayGider[cat] || 0;
            const etkin = etkinButce(findata, cat, ay);
            const dv = devir ? butceDevri(findata, cat, ay) : 0;
            return (
              <div key={cat} onClick={() => setButceModal({ cat, limit: String(butceler[cat] || "") })} style={{ marginBottom: "16px", cursor: "pointer" }} title="Bütçe limitini düzenle">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", marginBottom: "6px", gap: "0.5rem" }}>
                  <span style={{ color: V.ink2, display: "flex", alignItems: "center", gap: "6px" }}>
                    {cat}
                    <Icon d="edit" size={12} stroke={V.ink3} />
                    {devir && dv !== 0 && <span style={{ color: dv > 0 ? V.pos : V.neg, fontSize: "11px" }}>{dv > 0 ? "+" : ""}{TL(dv)} devir</span>}
                  </span>
                  <span className="num" style={{ color: V.ink, fontFamily: MONO, whiteSpace: "nowrap" }}>{TL(harcanan)} / {TL(etkin)}</span>
                </div>
                <ProgressBar value={harcanan} max={Math.max(1, etkin)} />
              </div>
            );
          })}
        </Card>

        {/* ---------- SAĞ: Birikim Hedefleri ---------- */}
        <Card style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", gap: "0.5rem" }}>
            <div className="serif" style={{ fontSize: "16px", fontWeight: 600, color: V.ink, fontFamily: SERIF }}>Birikim Hedefleri</div>
            <div style={{ display: "flex", gap: "6px" }}>
              {hedefler.length > 0 && (
                <Btn variant="primary" onClick={tumKatkiUygula} title="Tüm hedeflere aylık katkıyı uygula" style={{ padding: "8px 13px", fontSize: "12.5px" }}>
                  <Icon d="plus" size={14} /> Aylık Katkı ({TL(aylikToplam)})
                </Btn>
              )}
              <Btn variant="gold" onClick={() => setHedefModal({ ad: "", tip: "birikim", hedefTutar: "", aylikKatki: "", otomatikKatki: false })} title="Yeni hedef" style={{ padding: "8px 11px", fontSize: "12.5px" }}>
                <Icon d="plus" size={14} />
              </Btn>
            </div>
          </div>
          {!hedefler.length && <Bos mesaj="Henüz hedef yok. Bir birikim hedefi ekle." icon="target" />}
          {hedefler.map((h) => {
            const borc = h.tip === "borc";
            const pct = Math.min(100, Math.max(0, ((h.mevcutTutar || 0) / (h.hedefTutar || 1)) * 100));
            const kalan = Math.max(0, (h.hedefTutar || 0) - (h.mevcutTutar || 0));
            const renk = borc ? V.accent : V.pos;
            const katkiTutar = h.aylikKatki > 0 ? h.aylikKatki : 1000;
            return (
              <div key={h.id} style={{ display: "flex", alignItems: "center", gap: "15px", marginBottom: "18px" }}>
                <Ring pct={pct} color={renk} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div onClick={() => setHedefModal({ id: h.id, ad: h.ad, tip: h.tip, hedefTutar: String(h.hedefTutar || ""), aylikKatki: String(h.aylikKatki || ""), otomatikKatki: !!h.otomatikKatki })} style={{ fontSize: "13.5px", fontWeight: 600, color: V.ink, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }} title="Hedefi düzenle">
                    {h.ad}
                    <Icon d="edit" size={12} stroke={V.ink3} />
                    {h.otomatikKatki && <span style={{ background: "var(--chip-gold)", color: V.accent, fontSize: "9.5px", fontWeight: 700, padding: "1px 5px", borderRadius: "5px", letterSpacing: "0.03em" }}>OTO</span>}
                  </div>
                  <div className="num" style={{ fontSize: "12px", color: V.ink3, fontFamily: MONO }}>{TL(h.mevcutTutar || 0)} / {TL(h.hedefTutar || 0)}</div>
                  <div style={{ fontSize: "11px", color: V.ink3, marginTop: "2px" }}>kalan: {TL(kalan)} · aylık: {TL(h.aylikKatki || 0)}</div>
                </div>
                <Btn variant="soft" onClick={() => katkiUygula(h, katkiTutar)} style={{ padding: "8px 12px", fontSize: "12px", flexShrink: 0 }}>+ Katkı</Btn>
              </div>
            );
          })}
        </Card>
      </div>

      {/* ---------- Bütçe Modal ---------- */}
      {butceModal && (
        <Modal title={`Bütçe — ${butceModal.cat || "Yeni"}`} maxWidth={380} onClose={() => setButceModal(null)}>
          {!butceModal.cat && (
            <Field label="Kategori" value={butceModal.cat} onChange={(v) => setButceModal((m) => ({ ...m, cat: v }))}
              options={[{ id: "", label: "Kategori seç…" }, ...kategoriler.filter((k) => !(butceler[k] > 0)).map((k) => ({ id: k, label: k }))]} />
          )}
          <label style={lbl}>Aylık limit (₺)</label>
          <input value={butceModal.limit} onChange={(e) => setButceModal((m) => ({ ...m, limit: e.target.value }))} inputMode="decimal" placeholder="0"
            style={{ width: "100%", padding: "12px 14px", marginBottom: "18px", background: V.card2, border: `1px solid ${V.border}`, borderRadius: "11px", color: V.ink, fontSize: "15px", fontFamily: MONO, outline: "none", boxSizing: "border-box" }} />
          <Btn variant="primary" onClick={butceKaydet} style={{ width: "100%", padding: "13px", fontSize: "14px" }}>Kaydet</Btn>
        </Modal>
      )}

      {/* ---------- Hedef Modal ---------- */}
      {hedefModal && (
        <Modal title={hedefModal.id ? "Hedefi Düzenle" : "Hedef Ekle"} maxWidth={400} onClose={() => setHedefModal(null)}>
          <label style={lbl}>Hedef adı</label>
          <input value={hedefModal.ad} onChange={(e) => setHedefModal((m) => ({ ...m, ad: e.target.value }))} placeholder="Acil fon / Araba kredisi"
            style={{ width: "100%", padding: "11px 13px", marginBottom: "14px", background: V.card2, border: `1px solid ${V.border}`, borderRadius: "10px", color: V.ink, fontSize: "13.5px", fontFamily: F, outline: "none", boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Hedef tutar (₺)</label>
              <input value={hedefModal.hedefTutar} onChange={(e) => setHedefModal((m) => ({ ...m, hedefTutar: e.target.value }))} inputMode="decimal" placeholder="0"
                style={{ width: "100%", padding: "11px 13px", background: V.card2, border: `1px solid ${V.border}`, borderRadius: "10px", color: V.ink, fontSize: "13.5px", fontFamily: MONO, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Aylık katkı (₺)</label>
              <input value={hedefModal.aylikKatki} onChange={(e) => setHedefModal((m) => ({ ...m, aylikKatki: e.target.value }))} inputMode="decimal" placeholder="0"
                style={{ width: "100%", padding: "11px 13px", background: V.card2, border: `1px solid ${V.border}`, borderRadius: "10px", color: V.ink, fontSize: "13.5px", fontFamily: MONO, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ margin: "16px 0" }}>
            <Field label="Tür" value={hedefModal.tip} onChange={(v) => setHedefModal((m) => ({ ...m, tip: v }))}
              options={[{ id: "birikim", label: "Birikim" }, { id: "borc", label: "Borç Ödeme" }]} />
            <Toggle label="Otomatik aylık katkı" sub="Her ay kendiliğinden uygulansın" checked={!!hedefModal.otomatikKatki} onChange={(v) => setHedefModal((m) => ({ ...m, otomatikKatki: v }))} />
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
            <Btn variant="primary" onClick={hedefKaydet} style={{ flex: 1, padding: "13px", fontSize: "14px" }}>Kaydet</Btn>
            {hedefModal.id && <Btn variant="danger" onClick={() => hedefSil(hedefModal.id)} style={{ padding: "13px 16px", fontSize: "14px" }}>Sil</Btn>}
          </div>
        </Modal>
      )}
    </>
  );
}

// Dairesel ilerleme halkası (SVG conic gradient)
function Ring({ pct, color }) {
  const p = Math.min(100, Math.max(0, pct));
  return (
    <div style={{ width: 54, height: 54, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: `conic-gradient(${color} ${p}%, ${V.track} ${p}%)` }}>
      <div style={{ width: 42, height: 42, borderRadius: "50%", background: V.card, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="num" style={{ fontSize: "11px", fontWeight: 700, color, fontFamily: MONO }}>%{p.toFixed(0)}</span>
      </div>
    </div>
  );
}

// ============================================================
// Zarflar — kategori başına "zarfla", harcadıkça boşalır
// ============================================================
function Zarflar({ findata, setFindata }) {
  const ay = buAy();
  const ayGider = {};
  (findata.giderler || []).filter((g) => (g.tarih || "").startsWith(ay)).forEach((g) => { ayGider[g.kategori] = (ayGider[g.kategori] || 0) + g.miktar; });
  const zarflar = findata.zarflar || {};
  const set = (k, v) => setFindata((d) => ({ ...d, zarflar: { ...(d.zarflar || {}), [k]: sayiCevir(v) } }));
  const toplamTahsis = Object.values(zarflar).reduce((a, b) => a + (+b || 0), 0);
  const kategoriler = giderKat(findata);
  return (
    <div>
      <Card style={{ marginBottom: "1rem", padding: "20px" }}>
        <div style={serifBaslik}>Zarf Bütçe ({ay})</div>
        <p style={{ color: V.ink3, fontSize: "13px", margin: 0, lineHeight: 1.5 }}>
          Ayın başında her kategoriye para "zarfla"; harcadıkça zarf boşalır. Toplam tahsis: <b className="num" style={{ color: V.accent, fontFamily: MONO }}>{TL(toplamTahsis)}</b>
        </p>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: "14px" }}>
        {kategoriler.map((k) => {
          const tah = zarflar[k] || 0, harc = ayGider[k] || 0, kalanZ = tah - harc;
          const bitti = tah > 0 && kalanZ < 0;
          const renk = bitti ? V.neg : V.accent;
          return (
            <Card key={k} style={{ padding: "16px 17px", borderTop: tah > 0 ? `2px solid ${renk}` : `2px solid ${V.border2}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", gap: "0.5rem" }}>
                <span style={{ fontWeight: 600, fontSize: "13.5px", color: V.ink }}>{k}</span>
                <input type="text" inputMode="decimal" value={tah || ""} onChange={(e) => set(k, e.target.value)} placeholder="tahsis"
                  style={{ width: 90, padding: "7px 9px", background: V.card2, border: `1px solid ${V.border}`, borderRadius: "8px", color: V.ink, fontSize: "12.5px", fontFamily: MONO, outline: "none", boxSizing: "border-box" }} />
              </div>
              {tah > 0 && (
                <>
                  <ProgressBar value={harc} max={tah} color={renk} />
                  <p style={{ margin: "8px 0 0", fontSize: "12px", color: bitti ? V.neg : V.ink2 }}>
                    {bitti ? `${TL(-kalanZ)} aşıldı` : `${TL(kalanZ)} kaldı`} <span style={{ color: V.ink3 }}>· {TL(harc)} harcandı</span>
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

// ============================================================
// Tekrarlayanlar — aktif şablon listesi
// ============================================================
function Tekrarlayanlar({ findata, setFindata, bildir }) {
  const sablonlar = findata.sablonlar || [];
  function sil(id) {
    setFindata((d) => ({ ...d, sablonlar: (d.sablonlar || []).filter((s) => s.id !== id) }));
    bildir("Tekrar şablonu silindi");
  }
  const chip = (col, txt) => (
    <span style={{ background: "var(--chip-gold)", color: col, fontSize: "9.5px", fontWeight: 700, padding: "2px 6px", borderRadius: "5px", marginLeft: "6px", letterSpacing: "0.03em" }}>{txt}</span>
  );
  return (
    <Card style={{ padding: "20px" }}>
      <div style={serifBaslik}>Aktif Tekrarlayan İşlemler</div>
      <p style={{ color: V.ink3, fontSize: "13px", margin: "0 0 1.25rem", lineHeight: 1.5 }}>"Otomatik tekrarla" seçtiğin işlemler burada; her dönem otomatik oluşturulur.</p>
      {!sablonlar.length && <Bos mesaj="Tekrarlayan işlem yok." icon="repeat" />}
      {sablonlar.map((s) => (
        <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: V.card2, borderRadius: "11px", marginBottom: "8px", border: `1px solid ${V.border}` }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: "0 0 3px", fontWeight: 600, fontSize: "13.5px", color: V.ink }}>
              {s.baslik}
              {chip(s.tip === "gelir" ? V.pos : s.tip === "abonelik" ? V.accent : V.neg, (s.tip || "").toUpperCase())}
              {chip(V.accent, (s.frekans || "").toUpperCase())}
            </p>
            <p style={{ margin: 0, color: V.ink3, fontSize: "11.5px" }}>{s.kategori} · son: {s.sonUretilen || "—"}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <p className="num" style={{ margin: 0, fontWeight: 700, color: V.ink, fontFamily: MONO }}>{TL(s.miktar)}</p>
            <DelBtn onClick={() => sil(s.id)} />
          </div>
        </div>
      ))}
    </Card>
  );
}

// ============================================================
// Başarımlar — kazanılan rozetler (altın) vs kilitli (soluk)
// ============================================================
function Basarimlar({ findata }) {
  const gd = (y) => y.adet * (y.guncelFiyat || y.alisFiyati);
  const yd = (findata.yatirimlar || []).reduce((s, y) => s + gd(y), 0);
  const netDeger =
    (findata.gelirler || []).reduce((s, x) => s + x.miktar, 0) -
    (findata.giderler || []).reduce((s, x) => s + x.miktar, 0) -
    (findata.abonelikler || []).reduce((s, x) => s + x.miktar, 0) +
    yd;
  const toplamGider = (findata.giderler || []).reduce((s, x) => s + x.miktar, 0);
  const rozetler = rozetleriHesapla(findata, netDeger, toplamGider);
  const kazanilan = rozetler.filter((r) => r.kazanildi).length;
  return (
    <Card style={{ padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div className="serif" style={{ fontSize: "16px", fontWeight: 600, color: V.ink, fontFamily: SERIF }}>Rozetler</div>
        <span className="num" style={{ fontSize: "12.5px", color: V.accent, fontFamily: MONO }}>{kazanilan} / {rozetler.length}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: "12px" }}>
        {rozetler.map((r) => (
          <div key={r.id} style={{
            textAlign: "center", padding: "16px 10px", borderRadius: "12px",
            background: r.kazanildi ? "var(--chip-gold)" : V.card2,
            border: `1px solid ${r.kazanildi ? V.accent : V.border}`,
            opacity: r.kazanildi ? 1 : 0.55,
          }}>
            <div style={{ fontSize: "1.8rem", marginBottom: "6px", filter: r.kazanildi ? "none" : "grayscale(1)" }}>{r.icon}</div>
            <p style={{ margin: "0 0 3px", fontWeight: 700, fontSize: "12.5px", color: r.kazanildi ? V.accent : V.ink2 }}>{r.ad}</p>
            <p style={{ margin: 0, fontSize: "10.5px", color: V.ink3, lineHeight: 1.4 }}>{r.aciklama}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
