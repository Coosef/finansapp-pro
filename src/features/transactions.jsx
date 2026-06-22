// ============================================================
// Listeler: Gelir, Gider, Abonelik + İşlem ekleme modalı
// ============================================================
import { useState } from "react";
import { C, pageTitle, rowStyle, tagStyle, sectionTitle } from "../lib/constants.js";
import { TL, TL2, kategoriAnahtar, parseJSON } from "../lib/format.js";
import { claudeCall } from "../lib/ai.js";
import { Card, Btn, DelBtn, Bos, Modal, Field, Toggle } from "../components/ui.jsx";

export function Liste({ baslik, renk, toplam, kayitlar, onEkle, onSil, altBilgi }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <div>
          <h2 style={pageTitle}>{baslik}</h2>
          <p style={{ margin: 0, color: renk, fontWeight: 600 }}>Toplam: {TL(toplam)}</p>
        </div>
        <Btn onClick={onEkle}>+ Ekle</Btn>
      </div>
      {!kayitlar.length && <Bos mesaj="Henüz kayıt yok." />}
      {kayitlar
        .slice()
        .sort((a, b) => (b.tarih || "").localeCompare(a.tarih || ""))
        .map((x) => (
          <div key={x.id} style={rowStyle}>
            <div>
              <p style={{ margin: "0 0 0.2rem", fontWeight: 600, fontSize: "0.9rem" }}>
                {x.baslik}
                {x.otomatik && <span style={tagStyle(C.cyan)}>OTOMATİK</span>}
                {x.hane && <span style={tagStyle(C.purple)}>HANE</span>}
              </p>
              <p style={{ margin: 0, color: C.dimmer, fontSize: "0.73rem" }}>{altBilgi(x)}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <p style={{ margin: 0, fontWeight: 700 }}>{TL(x.miktar)}</p>
              <DelBtn onClick={() => onSil(x.id)} />
            </div>
          </div>
        ))}
    </div>
  );
}

export function GiderListe({ findata, onEkle, onSil }) {
  const toplam = findata.giderler.reduce((s, x) => s + x.miktar, 0);
  const [acik, setAcik] = useState(null);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <div>
          <h2 style={pageTitle}>Giderler</h2>
          <p style={{ margin: 0, color: C.redL, fontWeight: 600 }}>Toplam: {TL(toplam)}</p>
        </div>
        <Btn onClick={onEkle}>+ Ekle</Btn>
      </div>
      {!findata.giderler.length && <Bos mesaj="Henüz gider yok. Manuel ekleyin veya 'İçe Aktar'dan fiş/ekstre yükleyin." />}
      {findata.giderler
        .slice()
        .sort((a, b) => (b.tarih || "").localeCompare(a.tarih || ""))
        .map((x) => (
          <div key={x.id}>
            <div style={{ ...rowStyle, cursor: x.kalemler?.length ? "pointer" : "default" }} onClick={() => x.kalemler?.length && setAcik(acik === x.id ? null : x.id)}>
              <div>
                <p style={{ margin: "0 0 0.2rem", fontWeight: 600, fontSize: "0.9rem" }}>
                  {x.baslik}
                  {x.kalemler?.length ? <span style={{ color: C.indigoL, fontSize: "0.72rem", marginLeft: 6 }}>▸ {x.kalemler.length} kalem</span> : null}
                  {x.kaynak === "fis" && <span style={tagStyle("#10A37F")}>FİŞ</span>}
                  {x.kaynak === "ekstre" && <span style={tagStyle("#6366F1")}>EKSTRE</span>}
                  {x.otomatik && <span style={tagStyle(C.cyan)}>OTOMATİK</span>}
                  {x.hane && <span style={tagStyle(C.purple)}>HANE</span>}
                </p>
                <p style={{ margin: 0, color: C.dimmer, fontSize: "0.73rem" }}>{x.kategori} · {x.tarih}</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <p style={{ margin: 0, fontWeight: 700 }}>{TL(x.miktar)}</p>
                <DelBtn onClick={(e) => { e.stopPropagation(); onSil(x.id); }} />
              </div>
            </div>
            {acik === x.id && x.kalemler?.length > 0 && (
              <div style={{ background: "#080A10", border: `1px solid ${C.line}`, borderTop: "none", borderRadius: "0 0 0.6rem 0.6rem", padding: "0.5rem 1rem", marginTop: -8, marginBottom: "0.5rem" }}>
                {x.kalemler.map((k, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0", fontSize: "0.8rem", borderBottom: i < x.kalemler.length - 1 ? `1px solid ${C.line}` : "none" }}>
                    <span style={{ color: C.dim }}>{k.ad} {k.miktar ? <span style={{ color: C.faint }}>× {k.miktar}</span> : null}</span>
                    <span style={{ color: C.text }}>{TL2(k.fiyat)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
    </div>
  );
}

export function Abonelikler({ findata, bildir, onEkle, onSil }) {
  const toplam = findata.abonelikler.reduce((s, x) => s + x.miktar, 0);
  const [denetim, setDenetim] = useState(null);
  const [denetleniyor, setDenetleniyor] = useState(false);
  async function denetle() {
    if (!findata.abonelikler.length) {
      bildir("Önce abonelik ekleyin");
      return;
    }
    setDenetleniyor(true);
    try {
      const liste = findata.abonelikler.map((a) => ({ ad: a.baslik, kategori: a.kategori, aylik: a.miktar }));
      const txt = await claudeCall(
        [{ role: "user", content: `Türk kullanıcının abonelikleri: ${JSON.stringify(liste)}. Toplam aylık ${toplam}₺. Tasarruf gözüyle değerlendir: hangileri pahalı/gereksiz olabilir, yıllık plana geçilebilir mi, benzer ucuz alternatif var mı. SADECE JSON: {"ozet":"tek cümle","oneriler":["...","..."]}` }],
        true
      );
      setDenetim(parseJSON(txt));
    } catch (e) {
      bildir(e?.name === "AIAnahtarYok" ? e.message : "Denetim yapılamadı", "err");
    } finally {
      setDenetleniyor(false);
    }
  }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.6rem" }}>
        <div>
          <h2 style={pageTitle}>Abonelikler</h2>
          <p style={{ margin: 0, color: C.amber, fontWeight: 600 }}>Aylık: {TL(toplam)} · Yıllık: {TL(toplam * 12)}</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Btn variant="ghost" onClick={denetle} disabled={denetleniyor}>{denetleniyor ? "Denetleniyor…" : "🔍 Denetle"}</Btn>
          <Btn onClick={onEkle}>+ Ekle</Btn>
        </div>
      </div>
      {denetim && (
        <Card accent={C.cyan} style={{ marginBottom: "1rem" }}>
          <h3 style={sectionTitle}>🔍 Abonelik Denetimi</h3>
          <p style={{ color: C.text, fontSize: "0.9rem", margin: "0 0 0.85rem", lineHeight: 1.5 }}>{denetim.ozet}</p>
          {(denetim.oneriler || []).map((o, i) => (
            <div key={i} style={{ display: "flex", gap: "0.6rem", marginBottom: "0.5rem", alignItems: "flex-start" }}>
              <span style={{ color: C.amber, flexShrink: 0 }}>💡</span>
              <span style={{ color: C.dim, fontSize: "0.85rem", lineHeight: 1.45 }}>{o}</span>
            </div>
          ))}
        </Card>
      )}
      {!findata.abonelikler.length && <Bos mesaj="Henüz abonelik yok." />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: "1rem" }}>
        {findata.abonelikler.map((a) => (
          <Card key={a.id} accent={C.amber}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <p style={{ margin: "0 0 0.25rem", fontWeight: 700, fontSize: "1rem" }}>{a.baslik}</p>
                <p style={{ margin: "0 0 0.6rem", color: C.dimmer, fontSize: "0.74rem" }}>{a.kategori}</p>
                <p style={{ margin: 0, fontWeight: 700, fontSize: "1.1rem" }}>{TL(a.miktar)}<span style={{ color: C.faint, fontWeight: 400, fontSize: "0.72rem" }}>/ay</span></p>
              </div>
              <DelBtn onClick={() => onSil(a.id)} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function IslemModal({ title, form, setForm, kategoriler, miktarLabel, variant, noTekrar, noHane, hafiza, onClose, onKaydet }) {
  const oneri = (hafiza || {})[kategoriAnahtar(form.baslik)];
  return (
    <Modal title={title} onClose={onClose}>
      <Field label="Başlık" value={form.baslik} onChange={(v) => setForm((f) => ({ ...f, baslik: v }))} />
      {oneri && oneri !== form.kategori && (
        <p style={{ margin: "-0.4rem 0 0.8rem", fontSize: "0.74rem", color: C.cyan, cursor: "pointer" }} onClick={() => setForm((f) => ({ ...f, kategori: oneri }))}>
          💡 Önceki seçimine göre kategori: <b>{oneri}</b> (uygulamak için dokun)
        </p>
      )}
      <Field label={miktarLabel || "Miktar (₺)"} type="number" value={form.miktar} onChange={(v) => setForm((f) => ({ ...f, miktar: v }))} />
      <Field label="Kategori" value={form.kategori} onChange={(v) => setForm((f) => ({ ...f, kategori: v }))} options={kategoriler} />
      <Field label="Tarih" type="date" value={form.tarih} onChange={(v) => setForm((f) => ({ ...f, tarih: v }))} />
      {!noTekrar && <Toggle label="Otomatik tekrarla" checked={!!form.tekrarla} onChange={(v) => setForm((f) => ({ ...f, tekrarla: v }))} />}
      {!noTekrar && form.tekrarla && <Field label="Sıklık" value={form.frekans || "aylık"} onChange={(v) => setForm((f) => ({ ...f, frekans: v }))} options={["haftalık", "aylık", "yıllık"]} />}
      {!noHane && <Toggle label="Ortak hane bütçesine dahil et" checked={!!form.hane} onChange={(v) => setForm((f) => ({ ...f, hane: v }))} />}
      <Btn variant={variant} onClick={onKaydet} style={{ width: "100%", padding: "0.7rem", marginTop: "0.3rem" }}>Kaydet</Btn>
    </Modal>
  );
}
