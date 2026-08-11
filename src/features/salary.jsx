// ============================================================
// Maaş yönetimi — baz maaş + aylık ek ödeme/override + gerçekleşen (ekstre/manuel)
// Zümrüt & Altın tasarımı. Maaş var olan bir banka hesabına bağlanır; otomatik
// hesap OLUŞTURMAZ. Model: lib/maas.js (gelir hattını yeniden kullanır).
// ============================================================
import { useState } from "react";
import { V, F, SERIF, MONO } from "../lib/constants.js";
import { uid, TL, bugun } from "../lib/format.js";
import { maasDurumu, maasGeliriUret, maasAyarHesapla, maasAdaylari } from "../lib/maas.js";
import { Card, Btn, Modal, Field, Toggle, Bos, DelBtn } from "../components/ui.jsx";
import { Icon } from "../components/icons.jsx";

const lbl = { display: "block", fontSize: "11.5px", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" };
const inp = { width: "100%", padding: "11px 13px", background: V.card2, border: `1px solid ${V.border}`, borderRadius: "10px", color: V.ink, fontSize: "13.5px", fontFamily: MONO, outline: "none", boxSizing: "border-box" };
const AY_ADI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const ayEtiket = (ay) => { const [y, m] = String(ay).split("-").map(Number); return `${AY_ADI[(m || 1) - 1]} ${y}`; };
// Son N ayı "YYYY-MM" olarak (bugünden geriye) üret
function sonAylar(bugunStr, n = 6) {
  const [y, m] = String(bugunStr).slice(0, 7).split("-").map(Number);
  const out = [];
  for (let i = 0; i < n; i++) out.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  return out;
}

export function Maaslar({ findata, setFindata, bildir }) {
  const maaslar = findata.maaslar || [];
  const hesaplar = (findata.hesaplar || []).filter((h) => h.tip !== "kart");
  const buAyStr = String(bugun()).slice(0, 7);
  const [duzenle, setDuzenle] = useState(null); // maaş ekle/düzenle modalı
  const [ayar, setAyar] = useState(null); // aylık ayar modalı {maasId, ay, ...}

  const hesapAd = (id) => (findata.hesaplar || []).find((h) => String(h.id) === String(id))?.ad || null;

  // ---- Migrasyon: mevcut maaş sablonu/geliri → maaş tanımı (non-destructive) ----
  const adaylar = maaslar.length ? [] : maasAdaylari(findata);
  function adayiUygula(a) {
    setFindata((d) => {
      const yeniMaas = { id: uid(), ad: a.ad || "Maaş", tutar: a.tutar, hesapId: a.hesapId || "", odemeGunu: a.odemeGunu || 1, kategori: "Maaş", baslangic: a.baslangic || buAyStr, aktif: true };
      // İlgili maaş sablonunu durdur (pasif) — çift üretim olmasın (geri alınabilir)
      const sablonlar = (d.sablonlar || []).map((s) => (s.id === a._sablonId ? { ...s, pasif: true } : s));
      const ara = { ...d, maaslar: [...(d.maaslar || []), yeniMaas], sablonlar };
      return maasGeliriUret(ara, bugun()).data;
    });
    bildir("Maaş yeni modele taşındı — baz maaş + aylık ek ödeme artık ayrı");
  }

  // ---- Maaş ekle/düzenle ----
  function maasAc(m) {
    setDuzenle(m
      ? { id: m.id, ad: m.ad, tutar: String(m.tutar || ""), hesapId: m.hesapId || "", odemeGunu: String(m.odemeGunu || 1), aktif: m.aktif !== false, baslangic: m.baslangic || buAyStr }
      : { ad: "Maaş", tutar: "", hesapId: hesaplar[0] ? String(hesaplar[0].id) : "", odemeGunu: "5", aktif: true, baslangic: buAyStr });
  }
  function maasKaydet() {
    const tutar = Number(String(duzenle.tutar).replace(/[^\d]/g, "")) || 0;
    if (!tutar) { bildir("Baz maaş tutarı gerekli", "err"); return; }
    const gun = Math.min(31, Math.max(1, parseInt(duzenle.odemeGunu, 10) || 1));
    setFindata((d) => {
      const list = [...(d.maaslar || [])];
      if (duzenle.id) {
        const i = list.findIndex((x) => x.id === duzenle.id);
        if (i >= 0) list[i] = { ...list[i], ad: duzenle.ad || "Maaş", tutar, hesapId: duzenle.hesapId, odemeGunu: gun, aktif: !!duzenle.aktif, baslangic: duzenle.baslangic };
      } else {
        list.push({ id: uid(), ad: duzenle.ad || "Maaş", tutar, hesapId: duzenle.hesapId, odemeGunu: gun, kategori: "Maaş", baslangic: duzenle.baslangic, aktif: !!duzenle.aktif });
      }
      return maasGeliriUret({ ...d, maaslar: list }, bugun()).data;
    });
    bildir(duzenle.id ? "Maaş güncellendi" : "Maaş tanımlandı");
    setDuzenle(null);
  }
  function maasSil(id) {
    setFindata((d) => ({
      ...d,
      maaslar: (d.maaslar || []).filter((m) => m.id !== id),
      maasAyarlari: (d.maasAyarlari || []).filter((a) => String(a.maasId) !== String(id)),
      // Türetilmiş maaş gelir satırlarını da temizle (kaynak:"maas")
      gelirler: (d.gelirler || []).filter((g) => !(g.kaynak === "maas" && String(g.maasId) === String(id))),
    }));
    bildir("Maaş tanımı ve türetilmiş gelirleri kaldırıldı");
    setDuzenle(null);
  }

  // ---- Aylık ayar (prim / gerçekleşen) ----
  function ayarAc(maas) {
    const s = maasDurumu(findata, maas.id, buAyStr);
    setAyar({ maasId: maas.id, ad: maas.ad, ay: buAyStr, ekOdeme: s?.ekOdeme ? String(s.ekOdeme) : "", ekEtiket: s?.ekEtiket && s.ekEtiket !== "Ek ödeme" ? s.ekEtiket : "", gerceklesen: s?.gerceklesen != null ? String(s.gerceklesen) : "" });
  }
  function ayarKaydet() {
    const maasId = ayar.maasId, ay = ayar.ay;
    const ekOdeme = ayar.ekOdeme ? Number(String(ayar.ekOdeme).replace(/[^\d]/g, "")) : 0;
    const gerceklesenRaw = ayar.gerceklesen ? Number(String(ayar.gerceklesen).replace(/[^\d]/g, "")) : null;
    setFindata((d) => {
      const maas = (d.maaslar || []).find((m) => m.id === maasId);
      if (!maas) return d;
      let override = null, ek = ekOdeme, grc = gerceklesenRaw;
      if (gerceklesenRaw != null) {
        const h = maasAyarHesapla(maas.tutar, gerceklesenRaw);
        override = h.override;
        ek = ayar.ekOdeme ? ekOdeme : h.ekOdeme; // kullanıcı prim girdiyse onu koru, yoksa çıkar
        grc = h.gerceklesen;
      }
      const ayarlar = [...(d.maasAyarlari || [])];
      const i = ayarlar.findIndex((a) => String(a.maasId) === String(maasId) && a.ay === ay);
      const rec = { id: ayarlar[i]?.id || uid(), maasId, ay, override, ekOdeme: ek, ekEtiket: ayar.ekEtiket || (ek > 0 ? "Ek ödeme" : ""), gerceklesen: grc, _kaynak: gerceklesenRaw != null ? "manuel" : (ayarlar[i]?._kaynak || null) };
      if (i >= 0) ayarlar[i] = rec; else ayarlar.push(rec);
      return maasGeliriUret({ ...d, maasAyarlari: ayarlar }, bugun()).data;
    });
    bildir("Aylık maaş ayarı kaydedildi");
    setAyar(null);
  }
  function ayarSifirla() {
    const { maasId, ay } = ayar;
    setFindata((d) => {
      const ayarlar = (d.maasAyarlari || []).filter((a) => !(String(a.maasId) === String(maasId) && a.ay === ay));
      return maasGeliriUret({ ...d, maasAyarlari: ayarlar }, bugun()).data;
    });
    bildir("Bu ayın özel ayarı temizlendi (baz maaşa döndü)");
    setAyar(null);
  }

  return (
    <div>
      {/* Migrasyon önerisi */}
      {adaylar.map((a, i) => (
        <Card key={i} style={{ padding: "16px 18px", marginBottom: "14px", borderLeft: `3px solid ${V.accent}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Icon d="repeat" size={18} stroke={V.accent} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ margin: "0 0 3px", fontWeight: 600, fontSize: "13.5px", color: V.ink }}>Mevcut maaşını yeni modele taşı</p>
              <p style={{ margin: 0, fontSize: "12px", color: V.ink3 }}>{a.ad} · {TL(a.tutar)} · her ayın {a.odemeGunu}'i{a.hesapId ? ` · ${hesapAd(a.hesapId) || "hesap"}` : ""} — baz maaş sabitlenir, prim/ek ödeme ayrı tutulur.</p>
            </div>
            <Btn variant="primary" onClick={() => adayiUygula(a)} style={{ padding: "9px 14px", fontSize: "12.5px" }}>Taşı</Btn>
          </div>
        </Card>
      ))}

      <Card style={{ padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "0.5rem" }}>
          <div className="serif" style={{ fontSize: "16px", fontWeight: 600, color: V.ink, fontFamily: SERIF }}>Maaşlarım</div>
          <Btn variant="gold" onClick={() => maasAc(null)} style={{ padding: "8px 13px", fontSize: "12.5px" }}><Icon d="plus" size={14} /> Maaş</Btn>
        </div>

        {!maaslar.length && <Bos mesaj="Henüz maaş tanımlı değil. Baz maaşını ekle; her ay tekrar eder." icon="wallet" />}

        {maaslar.map((m) => {
          const s = maasDurumu(findata, m.id, buAyStr);
          const geldi = s?.geldiMi;
          const paydayGecti = s && s.odemeTarihi <= bugun();
          const hes = hesapAd(m.hesapId);
          const durumRenk = geldi ? V.pos : paydayGecti ? V.accent : V.ink3;
          const durumMetin = geldi
            ? `Bu ay geldi: ${TL(s.efektif)}`
            : paydayGecti
              ? `Bu ay beklenen olarak işlendi: ${TL(s.efektif)} · gerçekleşeni gir`
              : `Bekleniyor · her ayın ${m.odemeGunu}'i · ~${TL(s ? s.beklenen : m.tutar)}`;
          return (
            <div key={m.id} style={{ padding: "14px 16px", background: V.card2, borderRadius: "12px", marginBottom: "10px", border: `1px solid ${V.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: "0 0 3px", fontWeight: 600, fontSize: "14px", color: V.ink, display: "flex", alignItems: "center", gap: 6 }}>
                    {m.ad}
                    {m.aktif === false && <span style={{ background: V.track, color: V.ink3, fontSize: "9.5px", fontWeight: 700, padding: "1px 6px", borderRadius: 5 }}>PASİF</span>}
                  </p>
                  <p style={{ margin: 0, fontSize: "12px", color: V.ink3 }}>
                    Baz {TL(m.tutar)} · {hes ? <span style={{ color: V.ink2 }}>{hes}</span> : <span style={{ color: V.accent }}>hesap bağlı değil</span>}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => maasAc(m)} title="Düzenle" className="fa-btn" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${V.border}`, background: V.card, color: V.ink2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon d="edit" size={14} /></button>
                </div>
              </div>
              {/* Bu ayki durum + kırılım (drill-down) */}
              <div style={{ marginTop: 10, padding: "10px 12px", background: V.card, borderRadius: 9, border: `1px solid ${V.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5, color: durumRenk, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: durumRenk }} />{durumMetin}
                  </span>
                  <Btn variant="ghost" onClick={() => ayarAc(m)} style={{ padding: "6px 11px", fontSize: "12px" }}>Prim / Gerçekleşen</Btn>
                </div>
                {s && s.kalemler.length > 1 && (
                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {s.kalemler.map((k, i) => (
                      <span key={i} className="num" style={{ fontSize: 11.5, color: V.ink2, background: V.card2, border: `1px solid ${V.border}`, borderRadius: 7, padding: "3px 8px", fontFamily: MONO }}>
                        {k.etiket}: {TL(k.tutar)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <p style={{ margin: "10px 2px 0", fontSize: "11.5px", color: V.ink3, lineHeight: 1.6 }}>
          Baz maaş her ay tekrar eder ve <b>değişmez</b>. Prim/ek ödeme yalnız girdiğin aya işler. Ekstre içe aktarınca maaş hareketi bu tanımla eşleşir → çift gelir olmaz.
        </p>
      </Card>

      {/* Maaş ekle/düzenle modalı */}
      {duzenle && (
        <Modal title={duzenle.id ? "Maaşı Düzenle" : "Maaş Ekle"} maxWidth={420} onClose={() => setDuzenle(null)}>
          <label style={lbl}>Ad</label>
          <input value={duzenle.ad} onChange={(e) => setDuzenle((m) => ({ ...m, ad: e.target.value }))} placeholder="Ana Maaş" style={{ ...inp, fontFamily: F, marginBottom: 14 }} />
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Baz maaş (₺)</label>
              <input value={duzenle.tutar} onChange={(e) => setDuzenle((m) => ({ ...m, tutar: e.target.value }))} inputMode="decimal" placeholder="80.000" style={inp} />
            </div>
            <div style={{ width: 120 }}>
              <label style={lbl}>Ödeme günü</label>
              <input value={duzenle.odemeGunu} onChange={(e) => setDuzenle((m) => ({ ...m, odemeGunu: e.target.value }))} inputMode="numeric" placeholder="5" style={inp} />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <Field label="Yattığı banka hesabı" value={duzenle.hesapId} onChange={(v) => setDuzenle((m) => ({ ...m, hesapId: v }))}
              options={[{ id: "", label: hesaplar.length ? "Hesap seç (opsiyonel)…" : "Hesap yok — Hesaplar'dan ekle" }, ...hesaplar.map((h) => ({ id: String(h.id), label: h.ad }))]} />
          </div>
          <div style={{ marginTop: 4 }}>
            <Toggle label="Aktif" sub="Pasifse yeni ay maaşı üretilmez" checked={!!duzenle.aktif} onChange={(v) => setDuzenle((m) => ({ ...m, aktif: v }))} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <Btn variant="primary" onClick={maasKaydet} style={{ flex: 1, padding: "13px", fontSize: 14 }}>Kaydet</Btn>
            {duzenle.id && <Btn variant="danger" onClick={() => maasSil(duzenle.id)} style={{ padding: "13px 16px", fontSize: 14 }}>Sil</Btn>}
          </div>
        </Modal>
      )}

      {/* Aylık ayar modalı (prim / gerçekleşen) */}
      {ayar && (
        <Modal title={`${ayar.ad} — Aylık Ayar`} maxWidth={400} onClose={() => setAyar(null)}>
          <Field label="Ay" value={ayar.ay} onChange={(v) => setAyar((a) => ({ ...a, ay: v }))}
            options={sonAylar(bugun(), 8).map((ay) => ({ id: ay, label: ayEtiket(ay) }))} />
          <div style={{ marginTop: 14 }}>
            <label style={lbl}>Prim / Ek ödeme (₺)</label>
            <input value={ayar.ekOdeme} onChange={(e) => setAyar((a) => ({ ...a, ekOdeme: e.target.value }))} inputMode="decimal" placeholder="0" style={inp} />
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={lbl}>Ek ödeme etiketi</label>
            <input value={ayar.ekEtiket} onChange={(e) => setAyar((a) => ({ ...a, ekEtiket: e.target.value }))} placeholder="Prim / Fazla mesai / Bonus" style={{ ...inp, fontFamily: F }} />
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={lbl}>Bu ay gerçekleşen (₺) — opsiyonel</label>
            <input value={ayar.gerceklesen} onChange={(e) => setAyar((a) => ({ ...a, gerceklesen: e.target.value }))} inputMode="decimal" placeholder="banka hesabına yatan tutar" style={inp} />
            <p style={{ margin: "6px 2px 0", fontSize: "11px", color: V.ink3, lineHeight: 1.5 }}>Doldurursan o ay için kesinleşir. Baz üstüyse fark ek ödeme, altındaysa o ay override olur — <b>baz maaş değişmez</b>.</p>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <Btn variant="primary" onClick={ayarKaydet} style={{ flex: 1, padding: "13px", fontSize: 14 }}>Kaydet</Btn>
            <Btn variant="ghost" onClick={ayarSifirla} style={{ padding: "13px 14px", fontSize: 13 }}>Sıfırla</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
