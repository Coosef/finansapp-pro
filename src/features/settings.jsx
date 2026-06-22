// ============================================================
// Ayarlar: PIN, enflasyon, döviz, kategori hafızası, kurallar,
// tema ve Yapay Zekâ (API anahtarı + model)
// ============================================================
import { useState } from "react";
import { C, pageTitle, sectionTitle, inputStyle, rowStyle, GIDER_KAT, ACCENT_SECENEK } from "../lib/constants.js";
import { uid, TL2 } from "../lib/format.js";
import { kurCek, MODEL_SECENEK, aiHazir } from "../lib/ai.js";
import { Card, Btn, DelBtn, Field } from "../components/ui.jsx";
import { Kullanicilar } from "./users.jsx";

export function Ayarlar({ findata, setFindata, bildir, user, users, onUsersChange }) {
  const [pin, setPin] = useState("");
  const [enf, setEnf] = useState(String(findata.ayarlar?.enflasyon ?? 50));
  const [kurBekle, setKurBekle] = useState(false);
  function pinKaydet() {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      bildir("PIN 4 haneli olmalı", "err");
      return;
    }
    setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), pin } }));
    setPin("");
    bildir("PIN kaydedildi (sonraki girişte sorulur)");
  }
  function pinKaldir() {
    setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), pin: null } }));
    bildir("PIN kaldırıldı");
  }
  function enfKaydet() {
    setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), enflasyon: parseFloat(enf) || 0 } }));
    bildir("Enflasyon oranı güncellendi");
  }
  async function kurGuncelle() {
    setKurBekle(true);
    try {
      const k = await kurCek();
      if (isNaN(k.usd) || isNaN(k.eur)) throw new Error();
      setFindata((d) => ({ ...d, kurlar: k }));
      bildir(`Kurlar güncellendi: $${k.usd} · €${k.eur}`);
    } catch (e) {
      bildir(e?.name === "AIAnahtarYok" ? e.message : "Kur alınamadı", "err");
    } finally {
      setKurBekle(false);
    }
  }
  function hafizaTemizle() {
    setFindata((d) => ({ ...d, kategoriHafiza: {} }));
    bildir("Kategori hafızası temizlendi");
  }
  const hafizaSayi = Object.keys(findata.kategoriHafiza || {}).length;
  return (
    <div>
      <h2 style={pageTitle}>Ayarlar</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "1rem", marginTop: "1rem" }}>
        <Card accent={C.indigo}>
          <h3 style={sectionTitle}>🔒 PIN Kilidi</h3>
          {findata.ayarlar?.pin ? (
            <>
              <p style={{ color: C.greenL, fontSize: "0.85rem", margin: "0 0 1rem" }}>✓ PIN aktif. Her girişte sorulur.</p>
              <Btn variant="ghost" onClick={pinKaldir} style={{ width: "100%" }}>PIN'i Kaldır</Btn>
            </>
          ) : (
            <>
              <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 0.75rem" }}>4 haneli PIN belirle, açılışta sorulsun.</p>
              <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="1234" maxLength={4} style={{ ...inputStyle, marginBottom: "0.75rem", letterSpacing: "0.3em", textAlign: "center" }} />
              <Btn onClick={pinKaydet} style={{ width: "100%" }}>PIN Kaydet</Btn>
            </>
          )}
        </Card>

        <Card accent={C.cyan}>
          <h3 style={sectionTitle}>🔥 Enflasyon Oranı</h3>
          <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 0.75rem" }}>Yatırımların reel getirisini hesaplamak için yıllık enflasyon (%).</p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input type="number" value={enf} onChange={(e) => setEnf(e.target.value)} style={{ ...inputStyle }} />
            <Btn onClick={enfKaydet}>Kaydet</Btn>
          </div>
        </Card>

        <Card accent={C.green}>
          <h3 style={sectionTitle}>💱 Döviz Kurları</h3>
          <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 0.75rem" }}>Net varlığını USD/EUR olarak da görmek için güncel kurları çek (AI gerekir).</p>
          {findata.kurlar && <p style={{ color: C.dim, fontSize: "0.8rem", margin: "0 0 0.75rem" }}>Güncel: $1={TL2(findata.kurlar.usd)} · €1={TL2(findata.kurlar.eur)} <span style={{ color: C.faint }}>({findata.kurlar.tarih})</span></p>}
          <Btn variant="ghost" onClick={kurGuncelle} disabled={kurBekle} style={{ width: "100%" }}>{kurBekle ? "Çekiliyor…" : "Kurları Güncelle"}</Btn>
        </Card>

        <Card accent={C.purple}>
          <h3 style={sectionTitle}>🧠 Kategori Hafızası</h3>
          <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 0.75rem" }}>Öğrenilen kategori sayısı: <b style={{ color: C.text }}>{hafizaSayi}</b>. Aynı başlığı girince kategoriyi otomatik önerir.</p>
          <Btn variant="ghost" onClick={hafizaTemizle} style={{ width: "100%" }} disabled={!hafizaSayi}>Hafızayı Temizle</Btn>
        </Card>

        <ApiKeyKart findata={findata} setFindata={setFindata} bildir={bildir} />
        <KurallarKart findata={findata} setFindata={setFindata} bildir={bildir} />
        <TemaKart findata={findata} setFindata={setFindata} />
      </div>

      {user?.rol === "admin" && users && (
        <div style={{ marginTop: "1.75rem", paddingTop: "1.5rem", borderTop: `1px solid ${C.line}` }}>
          <Kullanicilar users={users} onChange={onUsersChange} bildir={bildir} mevcut={user} />
        </div>
      )}
    </div>
  );
}

function ApiKeyKart({ findata, setFindata, bildir }) {
  const [anahtar, setAnahtar] = useState(findata.ayarlar?.apiKey || "");
  const model = findata.ayarlar?.model || "claude-opus-4-8";
  function kaydet() {
    setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), apiKey: anahtar.trim() } }));
    bildir(anahtar.trim() ? "API anahtarı kaydedildi" : "API anahtarı kaldırıldı");
  }
  function modelSec(m) {
    setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), model: m } }));
  }
  return (
    <Card accent={C.cyan} style={{ gridColumn: "1 / -1" }}>
      <h3 style={sectionTitle}>🤖 Yapay Zekâ (Anthropic API)</h3>
      <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 0.75rem" }}>
        Asistan, fiş/ekstre okuma, doğal dil giriş, içgörü ve fiyat çekme bu anahtarla çalışır.
        Anahtarını <b style={{ color: C.dim }}>console.anthropic.com</b>'dan alabilirsin. Anahtar yalnızca bu tarayıcıda saklanır.
        Durum: {aiHazir() ? <b style={{ color: C.greenL }}>aktif</b> : <b style={{ color: C.amber }}>tanımlı değil</b>}
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <Field label="API Anahtarı" type="password" value={anahtar} onChange={setAnahtar} placeholder="sk-ant-..." />
        </div>
        <Btn onClick={kaydet} style={{ marginBottom: "0.9rem" }}>Kaydet</Btn>
      </div>
      <div style={{ maxWidth: 320 }}>
        <Field label="Model" value={model} onChange={modelSec} options={MODEL_SECENEK} />
      </div>
      <p style={{ color: C.faint, fontSize: "0.72rem", margin: 0 }}>
        ⚠️ Not: Anahtar tarayıcıya yazıldığı için yerel/kişisel kullanım içindir. Paylaşılan cihazlarda dikkatli ol.
      </p>
    </Card>
  );
}

function KurallarKart({ findata, setFindata, bildir }) {
  const [form, setForm] = useState({ tip: "kategori", kelime: "", tutarUstu: "", kategori: "Market", mesaj: "" });
  const kurallar = findata.kurallar || [];
  function ekle() {
    if (!form.kelime && !form.tutarUstu) {
      bildir("Kelime veya tutar gir", "err");
      return;
    }
    setFindata((d) => ({ ...d, kurallar: [...(d.kurallar || []), { id: uid(), tip: form.tip, kelime: form.kelime, tutarUstu: parseFloat(form.tutarUstu) || 0, kategori: form.kategori, mesaj: form.mesaj }] }));
    setForm({ tip: "kategori", kelime: "", tutarUstu: "", kategori: "Market", mesaj: "" });
    bildir("Kural eklendi");
  }
  function sil(id) {
    setFindata((d) => ({ ...d, kurallar: d.kurallar.filter((k) => k.id !== id) }));
  }
  return (
    <Card accent={C.amber} style={{ gridColumn: "1 / -1" }}>
      <h3 style={sectionTitle}>⚙️ Otomatik Kurallar</h3>
      <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 0.75rem" }}>Başlıkta kelime geçince kategori ata, ya da tutar aşımında uyarı ver. Yeni işlemlere otomatik uygulanır.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <Field label="Tip" value={form.tip} onChange={(v) => setForm((f) => ({ ...f, tip: v }))} options={[{ id: "kategori", label: "Kategori Ata" }, { id: "uyari", label: "Uyarı Ver" }]} />
        <Field label="Kelime" value={form.kelime} onChange={(v) => setForm((f) => ({ ...f, kelime: v }))} placeholder="Migros" />
        <Field label="Tutar üstü (₺)" type="number" value={form.tutarUstu} onChange={(v) => setForm((f) => ({ ...f, tutarUstu: v }))} />
        {form.tip === "kategori" ? (
          <Field label="Kategori" value={form.kategori} onChange={(v) => setForm((f) => ({ ...f, kategori: v }))} options={GIDER_KAT} />
        ) : (
          <Field label="Uyarı mesajı" value={form.mesaj} onChange={(v) => setForm((f) => ({ ...f, mesaj: v }))} placeholder="Çok harcadın!" />
        )}
      </div>
      <Btn onClick={ekle}>+ Kural Ekle</Btn>
      <div style={{ marginTop: "1rem" }}>
        {!kurallar.length && <p style={{ color: C.faint, fontSize: "0.8rem" }}>Henüz kural yok.</p>}
        {kurallar.map((k) => (
          <div key={k.id} style={rowStyle}>
            <p style={{ margin: 0, fontSize: "0.82rem", color: C.dim }}>
              {k.tip === "kategori" ? `"${k.kelime || k.tutarUstu + "₺+"}" → ${k.kategori}` : `"${k.kelime || k.tutarUstu + "₺+"}" → uyarı`}
            </p>
            <DelBtn onClick={() => sil(k.id)} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function TemaKart({ findata, setFindata }) {
  const tema = findata.ayarlar?.tema || "koyu";
  const accent = findata.ayarlar?.accent || "#10B981";
  const setAyar = (k, v) => setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), [k]: v } }));
  return (
    <Card accent={accent} style={{ gridColumn: "1 / -1" }}>
      <h3 style={sectionTitle}>🎨 Tema & Renk</h3>
      <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 0.6rem" }}>Arka plan tonu</p>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        {[{ id: "koyu", ad: "Koyu" }, { id: "gece", ad: "Gece Mavisi" }, { id: "antrasit", ad: "Antrasit" }].map((t) => (
          <Btn key={t.id} variant={tema === t.id ? "primary" : "ghost"} onClick={() => setAyar("tema", t.id)}>{t.ad}</Btn>
        ))}
      </div>
      <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 0.6rem" }}>Vurgu rengi</p>
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
        {ACCENT_SECENEK.map((a) => (
          <button key={a.renk} onClick={() => setAyar("accent", a.renk)} title={a.ad} style={{ width: 34, height: 34, borderRadius: "50%", background: a.renk, border: accent === a.renk ? "3px solid #fff" : `2px solid ${C.line2}`, cursor: "pointer" }} />
        ))}
      </div>
    </Card>
  );
}
