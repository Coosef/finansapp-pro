// ============================================================
// Ayarlar: PIN, enflasyon, döviz, kategori hafızası, kurallar,
// tema ve Yapay Zekâ (API anahtarı + model)
// ============================================================
import { useState } from "react";
import { C, pageTitle, sectionTitle, inputStyle, rowStyle, GIDER_KAT, ACCENT_SECENEK } from "../lib/constants.js";
import { uid, TL2 } from "../lib/format.js";
import { kurCek, MODEL_SECENEK, aiHazir, configureAI, testAIBaglanti, SAGLAYICI_SECENEK, varsayilanAdres } from "../lib/ai.js";
import { Card, Btn, DelBtn, Field } from "../components/ui.jsx";
import { Kullanicilar } from "./users.jsx";
import { giderKategorileri, gelirKategorileri } from "../lib/finance.js";

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

        <BildirimKart findata={findata} setFindata={setFindata} bildir={bildir} />
        <ApiKeyKart findata={findata} setFindata={setFindata} bildir={bildir} />
        <KategoriKart findata={findata} setFindata={setFindata} bildir={bildir} />
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
  const ay = findata.ayarlar || {};
  const saglayici = ay.aiSaglayici || "anthropic";
  const yerel = saglayici !== "anthropic";
  const [anahtar, setAnahtar] = useState(ay.apiKey || "");
  const [adres, setAdres] = useState(ay.yerelAdres || "");
  const [yModel, setYModel] = useState(ay.yerelModel || "");
  const [test, setTest] = useState(null);

  const setAyar = (obj) => setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), ...obj } }));

  function saglayiciSec(v) {
    const guncel = { aiSaglayici: v };
    if (v !== "anthropic") {
      const ad = adres || varsayilanAdres(v);
      setAdres(ad);
      guncel.yerelAdres = ad;
    }
    setAyar(guncel);
    setTest(null);
  }
  function kaydet() {
    setAyar({ apiKey: anahtar.trim(), yerelAdres: adres.trim(), yerelModel: yModel.trim() });
    bildir("AI ayarları kaydedildi");
  }
  async function baglantiTest() {
    configureAI({ ...ay, aiSaglayici: saglayici, apiKey: anahtar.trim(), yerelAdres: adres.trim(), yerelModel: yModel.trim() });
    setAyar({ apiKey: anahtar.trim(), yerelAdres: adres.trim(), yerelModel: yModel.trim() });
    setTest({ durum: "bekle", mesaj: "Test ediliyor…" });
    try {
      await testAIBaglanti();
      setTest({ durum: "ok", mesaj: "✓ Bağlantı başarılı" });
    } catch (e) {
      setTest({ durum: "err", mesaj: "✗ " + (e?.message || "Bağlantı başarısız") });
    }
  }

  return (
    <Card accent={C.cyan} style={{ gridColumn: "1 / -1" }}>
      <h3 style={sectionTitle}>🤖 Yapay Zekâ</h3>
      <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 0.85rem" }}>
        Asistan, doğal dil giriş, içgörü, fiş okuma vb. bunu kullanır. Bulut (Anthropic, anahtar gerekir) ya da
        bilgisayarında çalışan ücretsiz yerel model (Ollama / LM Studio) seçebilirsin.
        Durum: {aiHazir() ? <b style={{ color: C.greenL }}>aktif</b> : <b style={{ color: C.amber }}>tanımlı değil</b>}
      </p>

      <div style={{ maxWidth: 380 }}>
        <Field label="Sağlayıcı" value={saglayici} onChange={saglayiciSec} options={SAGLAYICI_SECENEK} />
      </div>

      {!yerel && (
        <>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Field label="API Anahtarı" type="password" value={anahtar} onChange={setAnahtar} placeholder="sk-ant-..." />
            </div>
            <Btn onClick={kaydet} style={{ marginBottom: "0.9rem" }}>Kaydet</Btn>
          </div>
          <div style={{ maxWidth: 320 }}>
            <Field label="Model" value={ay.model || "claude-opus-4-8"} onChange={(m) => setAyar({ model: m })} options={MODEL_SECENEK} />
          </div>
          <p style={{ color: C.faint, fontSize: "0.72rem", margin: "0 0 0.5rem" }}>
            Anahtarını <b style={{ color: C.dim }}>console.anthropic.com</b>'dan alırsın; yalnızca bu tarayıcıda saklanır.
          </p>
        </>
      )}

      {yerel && (
        <>
          <div className="fa-grid-2">
            <Field label="Yerel Adres (…/v1)" value={adres} onChange={setAdres} placeholder={varsayilanAdres(saglayici) || "http://localhost:11434/v1"} />
            <Field label="Model adı" value={yModel} onChange={setYModel} placeholder={saglayici === "lmstudio" ? "yüklü model adı" : "llama3.1"} />
          </div>
          <Btn onClick={kaydet} style={{ marginTop: "0.2rem" }}>Kaydet</Btn>
          <div style={{ color: C.faint, fontSize: "0.72rem", margin: "0.75rem 0 0", lineHeight: 1.5 }}>
            {saglayici === "ollama" && (
              <span>
                <b style={{ color: C.dim }}>Ollama:</b> modeli indir (<code>ollama pull llama3.1</code>), CORS için şöyle başlat:
                <br /><code>OLLAMA_ORIGINS=* ollama serve</code> &nbsp;·&nbsp; adres <code>http://localhost:11434/v1</code>
              </span>
            )}
            {saglayici === "lmstudio" && (
              <span>
                <b style={{ color: C.dim }}>LM Studio:</b> "Local Server" sekmesinde modeli yükle, sunucuyu başlat ve <b>CORS'u aç</b>.
                Adres <code>http://localhost:1234/v1</code>, model = yüklü model adı.
              </span>
            )}
            {saglayici === "ozel" && <span>OpenAI-uyumlu herhangi bir <code>/v1</code> adresi (CORS açık olmalı).</span>}
            <br />Fiş (görsel) için görme yeteneği olan model gerekir (örn. <code>llama3.2-vision</code>). <b>PDF</b> ve <b>web arama (fiyat/kur)</b> yerelde çalışmaz.
          </div>
        </>
      )}

      <div style={{ marginTop: "0.9rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <Btn variant="ghost" onClick={baglantiTest}>Bağlantıyı Test Et</Btn>
        {test && <span style={{ color: test.durum === "ok" ? C.greenL : test.durum === "err" ? C.redL : C.dim, fontSize: "0.8rem" }}>{test.mesaj}</span>}
      </div>
    </Card>
  );
}

function BildirimKart({ findata, setFindata, bildir }) {
  const acik = !!findata.ayarlar?.bildirimler;
  const izin = typeof Notification !== "undefined" ? Notification.permission : "yok";
  async function ac() {
    if (typeof Notification === "undefined") {
      bildir("Tarayıcı bildirimi desteklemiyor", "err");
      return;
    }
    let p = Notification.permission;
    if (p !== "granted") p = await Notification.requestPermission();
    if (p === "granted") {
      setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), bildirimler: true } }));
      bildir("Bildirimler açıldı");
    } else {
      bildir("Bildirim izni verilmedi", "err");
    }
  }
  function kapat() {
    setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), bildirimler: false } }));
    bildir("Bildirimler kapandı");
  }
  return (
    <Card accent={C.amber}>
      <h3 style={sectionTitle}>🔔 Bildirimler</h3>
      <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 0.75rem" }}>Yaklaşan abonelik/ödemeler için uygulama açıkken günde bir hatırlatma.</p>
      {acik && izin === "granted" ? (
        <Btn variant="ghost" onClick={kapat} style={{ width: "100%" }}>Bildirimleri Kapat</Btn>
      ) : (
        <Btn onClick={ac} style={{ width: "100%" }}>Bildirimlere İzin Ver</Btn>
      )}
      {izin === "denied" && <p style={{ color: C.redL, fontSize: "0.72rem", margin: "0.5rem 0 0" }}>Tarayıcı izni reddedilmiş; tarayıcı ayarlarından açman gerekir.</p>}
    </Card>
  );
}

function KategoriKart({ findata, setFindata, bildir }) {
  const [yeniGider, setYeniGider] = useState("");
  const [yeniGelir, setYeniGelir] = useState("");
  const gider = giderKategorileri(findata);
  const gelir = gelirKategorileri(findata);
  function setKat(tur, liste) {
    setFindata((d) => ({ ...d, kategoriler: { ...(d.kategoriler || { gider, gelir }), [tur]: liste } }));
  }
  function ekle(tur, deger, temizle) {
    const v = (deger || "").trim();
    if (!v) return;
    const liste = tur === "gider" ? gider : gelir;
    if (liste.includes(v)) {
      bildir("Bu kategori zaten var", "err");
      return;
    }
    setKat(tur, [...liste, v]);
    temizle("");
    bildir("Kategori eklendi");
  }
  function sil(tur, k) {
    const liste = tur === "gider" ? gider : gelir;
    setKat(tur, liste.filter((x) => x !== k));
  }
  const blok = (tur, liste, yeni, setYeni) => (
    <div>
      <p style={{ color: C.dim, fontSize: "0.78rem", fontWeight: 600, margin: "0 0 0.5rem" }}>{tur === "gider" ? "Gider" : "Gelir"} kategorileri</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.6rem" }}>
        {liste.map((k) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", background: "rgba(255,255,255,0.04)", border: `1px solid ${C.line2}`, borderRadius: "0.5rem", padding: "0.25rem 0.5rem", fontSize: "0.78rem", color: C.dim }}>
            {k}
            <button onClick={() => sil(tur, k)} title="Sil" style={{ background: "none", border: "none", color: C.redL, cursor: "pointer", fontSize: "0.8rem", lineHeight: 1, padding: 0 }}>✕</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <input value={yeni} onChange={(e) => setYeni(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ekle(tur, yeni, setYeni)} placeholder="Yeni kategori" style={{ ...inputStyle, flex: 1 }} />
        <Btn variant="ghost" onClick={() => ekle(tur, yeni, setYeni)}>+ Ekle</Btn>
      </div>
    </div>
  );
  return (
    <Card accent={C.green} style={{ gridColumn: "1 / -1" }}>
      <h3 style={sectionTitle}>🏷️ Kategoriler</h3>
      <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 1rem" }}>Kendi gelir/gider kategorilerini ekle veya kaldır; işlem, bütçe, zarf ve kural ekranları otomatik uyum sağlar. (Silmek eski kayıtları değiştirmez.)</p>
      <div className="fa-grid-2">
        {blok("gider", gider, yeniGider, setYeniGider)}
        {blok("gelir", gelir, yeniGelir, setYeniGelir)}
      </div>
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
          <Field label="Kategori" value={form.kategori} onChange={(v) => setForm((f) => ({ ...f, kategori: v }))} options={giderKategorileri(findata)} />
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
