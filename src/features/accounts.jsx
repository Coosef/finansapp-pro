// ============================================================
// Hesaplar & Cüzdanlar
// ============================================================
import { useState } from "react";
import { C, pageTitle, inputStyle, HESAP_TIP } from "../lib/constants.js";
import { uid, TL } from "../lib/format.js";
import { transferUygula } from "../lib/finance.js";
import { Card, Btn, DelBtn, Bos, Field, Modal } from "../components/ui.jsx";

export function Hesaplar({ findata, setFindata, bildir }) {
  const [form, setForm] = useState({ ad: "", tip: "banka", bakiye: "" });
  const [acik, setAcik] = useState(false);
  const [transfer, setTransfer] = useState(null);
  const hesaplar = findata.hesaplar || [];
  const varlik = hesaplar.filter((h) => h.tip !== "kart").reduce((s, h) => s + (+h.bakiye || 0), 0);
  const borc = hesaplar.filter((h) => h.tip === "kart").reduce((s, h) => s + (+h.bakiye || 0), 0);
  function ekle() {
    if (!form.ad) {
      bildir("Hesap adı gerekli", "err");
      return;
    }
    setFindata((d) => ({ ...d, hesaplar: [...(d.hesaplar || []), { id: uid(), ad: form.ad, tip: form.tip, bakiye: parseFloat(form.bakiye) || 0 }] }));
    setForm({ ad: "", tip: "banka", bakiye: "" });
    setAcik(false);
    bildir("Hesap eklendi");
  }
  function sil(id) {
    setFindata((d) => ({ ...d, hesaplar: d.hesaplar.filter((h) => h.id !== id) }));
  }
  function bakiye(id, val) {
    setFindata((d) => ({ ...d, hesaplar: d.hesaplar.map((h) => (h.id === id ? { ...h, bakiye: parseFloat(val) || 0 } : h)) }));
  }
  function adGuncelle(id, val) {
    setFindata((d) => ({ ...d, hesaplar: d.hesaplar.map((h) => (h.id === id ? { ...h, ad: val } : h)) }));
  }
  function tipGuncelle(id, val) {
    setFindata((d) => ({ ...d, hesaplar: d.hesaplar.map((h) => (h.id === id ? { ...h, tip: val } : h)) }));
  }
  function transferAc() {
    setTransfer({ kaynak: String(hesaplar[0]?.id || ""), hedef: String(hesaplar[1]?.id || ""), miktar: "" });
  }
  function transferYap() {
    const m = parseFloat(transfer.miktar);
    if (!transfer.kaynak || !transfer.hedef || transfer.kaynak === transfer.hedef) {
      bildir("Farklı iki hesap seç", "err");
      return;
    }
    if (!m || m <= 0) {
      bildir("Geçerli tutar gir", "err");
      return;
    }
    setFindata((d) => transferUygula(d, transfer.kaynak, transfer.hedef, m));
    setTransfer(null);
    bildir("Transfer yapıldı");
  }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.6rem" }}>
        <div>
          <h2 style={pageTitle}>Hesaplar & Cüzdanlar</h2>
          <p style={{ margin: 0, color: C.dim, fontSize: "0.88rem" }}>
            Varlık: <b style={{ color: C.greenL }}>{TL(varlik)}</b> · Kart borcu: <b style={{ color: C.redL }}>{TL(borc)}</b> · Net: <b style={{ color: varlik - borc >= 0 ? C.greenL : C.redL }}>{TL(varlik - borc)}</b>
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {hesaplar.length >= 2 && <Btn variant="ghost" onClick={transferAc}>⇄ Transfer</Btn>}
          <Btn onClick={() => setAcik(!acik)}>+ Hesap</Btn>
        </div>
      </div>
      {acik && (
        <Card style={{ marginBottom: "1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "0.6rem" }}>
            <Field label="Ad" value={form.ad} onChange={(v) => setForm((f) => ({ ...f, ad: v }))} placeholder="Garanti / Cüzdan" />
            <Field label="Tip" value={form.tip} onChange={(v) => setForm((f) => ({ ...f, tip: v }))} options={HESAP_TIP} />
            <Field label={form.tip === "kart" ? "Borç (₺)" : "Bakiye (₺)"} type="number" value={form.bakiye} onChange={(v) => setForm((f) => ({ ...f, bakiye: v }))} />
          </div>
          <Btn onClick={ekle} style={{ marginTop: "0.3rem" }}>Kaydet</Btn>
        </Card>
      )}
      {!hesaplar.length && <Bos mesaj="Henüz hesap yok. Nakit, banka, kredi kartı veya birikim hesabı ekleyin." />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: "1rem" }}>
        {hesaplar.map((h) => {
          const ht = HESAP_TIP.find((t) => t.id === h.tip);
          return (
            <Card key={h.id} accent={ht?.renk}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem", gap: "0.5rem" }}>
                <span style={{ fontSize: "1.5rem" }}>{ht?.icon}</span>
                <DelBtn onClick={() => sil(h.id)} />
              </div>
              <input value={h.ad} onChange={(e) => adGuncelle(h.id, e.target.value)} placeholder="Hesap adı" style={{ ...inputStyle, fontWeight: 600, marginBottom: "0.5rem" }} />
              <select value={h.tip} onChange={(e) => tipGuncelle(h.id, e.target.value)} style={{ ...inputStyle, marginBottom: "0.5rem", fontSize: "0.82rem" }}>
                {HESAP_TIP.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
              </select>
              <label style={{ display: "block", color: C.dimmer, fontSize: "0.7rem", marginBottom: "0.2rem" }}>{h.tip === "kart" ? "Borç (₺)" : "Bakiye (₺)"}</label>
              <input type="number" value={h.bakiye} onChange={(e) => bakiye(h.id, e.target.value)} style={{ ...inputStyle, fontSize: "1.1rem", fontWeight: 700, color: h.tip === "kart" ? C.redL : C.text }} />
            </Card>
          );
        })}
      </div>

      {transfer && (
        <Modal title="Hesaplar Arası Transfer" onClose={() => setTransfer(null)}>
          <Field label="Kaynak hesap" value={transfer.kaynak} onChange={(v) => setTransfer((t) => ({ ...t, kaynak: v }))} options={hesaplar.map((h) => ({ id: String(h.id), label: `${h.ad} (${TL(h.bakiye)})` }))} />
          <Field label="Hedef hesap" value={transfer.hedef} onChange={(v) => setTransfer((t) => ({ ...t, hedef: v }))} options={hesaplar.map((h) => ({ id: String(h.id), label: `${h.ad} (${TL(h.bakiye)})` }))} />
          <Field label="Tutar (₺)" type="number" value={transfer.miktar} onChange={(v) => setTransfer((t) => ({ ...t, miktar: v }))} />
          <p style={{ color: C.faint, fontSize: "0.72rem", margin: "0 0 0.5rem" }}>Kredi kartına transfer borcu azaltır; karttan transfer borcu artırır.</p>
          <Btn onClick={transferYap} style={{ width: "100%", padding: "0.7rem", marginTop: "0.2rem" }}>Transfer Et</Btn>
        </Modal>
      )}
    </div>
  );
}
