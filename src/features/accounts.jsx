// ============================================================
// Hesaplar & Cüzdanlar
// ============================================================
import { useState } from "react";
import { C, pageTitle, inputStyle, HESAP_TIP } from "../lib/constants.js";
import { uid, TL } from "../lib/format.js";
import { Card, Btn, DelBtn, Bos, Field } from "../components/ui.jsx";

export function Hesaplar({ findata, setFindata, bildir }) {
  const [form, setForm] = useState({ ad: "", tip: "banka", bakiye: "" });
  const [acik, setAcik] = useState(false);
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
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.6rem" }}>
        <div>
          <h2 style={pageTitle}>Hesaplar & Cüzdanlar</h2>
          <p style={{ margin: 0, color: C.dim, fontSize: "0.88rem" }}>
            Varlık: <b style={{ color: C.greenL }}>{TL(varlik)}</b> · Kart borcu: <b style={{ color: C.redL }}>{TL(borc)}</b> · Net: <b style={{ color: varlik - borc >= 0 ? C.greenL : C.redL }}>{TL(varlik - borc)}</b>
          </p>
        </div>
        <Btn onClick={() => setAcik(!acik)}>+ Hesap</Btn>
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "1.4rem" }}>{ht?.icon}</span>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem" }}>{h.ad}</p>
                    <p style={{ margin: 0, color: C.dimmer, fontSize: "0.72rem" }}>{ht?.label}</p>
                  </div>
                </div>
                <DelBtn onClick={() => sil(h.id)} />
              </div>
              <input type="number" value={h.bakiye} onChange={(e) => bakiye(h.id, e.target.value)} style={{ ...inputStyle, fontSize: "1.1rem", fontWeight: 700, color: h.tip === "kart" ? C.redL : C.text }} />
            </Card>
          );
        })}
      </div>
    </div>
  );
}
