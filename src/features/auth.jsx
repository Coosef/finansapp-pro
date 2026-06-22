// ============================================================
// Giriş, PIN kilidi ve onboarding
// ============================================================
import { useState } from "react";
import { C, F, inputStyle, ACCENT_SECENEK } from "../lib/constants.js";
import { uid, bugun } from "../lib/format.js";
import { Card, Btn, Field } from "../components/ui.jsx";

export function Login({ onLogin }) {
  const [u, setU] = useState(""),
    [p, setP] = useState(""),
    [hata, setHata] = useState("");
  async function dene() {
    if (!(await onLogin(u.trim(), p))) setHata("Kullanıcı adı veya şifre hatalı");
  }
  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(circle at 30% 20%, #1A1530, ${C.bg} 60%)`, fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ width: 56, height: 56, borderRadius: "1rem", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem", margin: "0 auto 1rem" }}>₺</div>
          <h1 style={{ color: C.text, margin: "0 0 0.3rem", fontSize: "1.5rem", fontWeight: 800 }}>FinansApp Pro</h1>
          <p style={{ color: C.dimmer, margin: 0, fontSize: "0.85rem" }}>Çok kullanıcılı finans yönetimi</p>
        </div>
        <Card>
          <Field label="Kullanıcı Adı" value={u} onChange={setU} placeholder="admin" />
          <Field label="Şifre" type="password" value={p} onChange={setP} placeholder="••••••" />
          {hata && <p style={{ color: C.redL, fontSize: "0.8rem", margin: "0 0 0.75rem" }}>{hata}</p>}
          <Btn onClick={dene} style={{ width: "100%", padding: "0.75rem" }}>Giriş Yap</Btn>
          <p style={{ color: C.faint, fontSize: "0.72rem", textAlign: "center", marginTop: "1rem", marginBottom: 0 }}>
            İlk giriş: <b style={{ color: C.dim }}>admin</b> / <b style={{ color: C.dim }}>admin123</b>
          </p>
        </Card>
      </div>
    </div>
  );
}

export function PinGate({ dogruPin, onAc, onCikis }) {
  const [pin, setPin] = useState("");
  const [hata, setHata] = useState(false);
  function bas(d) {
    if (pin.length >= 4) return;
    const yeni = pin + d;
    setPin(yeni);
    if (yeni.length === 4) {
      if (yeni === dogruPin) onAc();
      else {
        setHata(true);
        setTimeout(() => {
          setPin("");
          setHata(false);
        }, 600);
      }
    }
  }
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "2rem", padding: "1rem" }}>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}`}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>🔒</div>
        <p style={{ color: C.dim, margin: 0 }}>PIN kodunu gir</p>
      </div>
      <div style={{ display: "flex", gap: "0.75rem", animation: hata ? "shake .3s" : "none" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: i < pin.length ? (hata ? C.red : C.indigo) : C.line2, transition: "all .15s" }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,72px)", gap: "0.75rem" }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button key={d} onClick={() => bas(String(d))} style={{ width: 72, height: 72, borderRadius: "50%", background: C.card, border: `1px solid ${C.line2}`, color: C.text, fontSize: "1.4rem", fontFamily: F, cursor: "pointer" }}>{d}</button>
        ))}
        <div />
        <button onClick={() => bas("0")} style={{ width: 72, height: 72, borderRadius: "50%", background: C.card, border: `1px solid ${C.line2}`, color: C.text, fontSize: "1.4rem", fontFamily: F, cursor: "pointer" }}>0</button>
        <button onClick={() => setPin(pin.slice(0, -1))} style={{ width: 72, height: 72, borderRadius: "50%", background: "transparent", border: "none", color: C.dim, fontSize: "1.2rem", cursor: "pointer" }}>⌫</button>
      </div>
      <button onClick={onCikis} style={{ background: "none", border: "none", color: C.faint, fontFamily: F, cursor: "pointer", fontSize: "0.85rem" }}>Çıkış yap</button>
    </div>
  );
}

export function Onboarding({ user, setFindata }) {
  const [adim, setAdim] = useState(0);
  const [gelir, setGelir] = useState("");
  const [bakiye, setBakiye] = useState("");
  const [enf, setEnf] = useState("50");
  const [accent, setAccent] = useState("#6366F1");
  function atla() {
    setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), kuruldu: true } }));
  }
  function bitir() {
    setFindata((d) => {
      const yeni = { ...d, gelirler: [...d.gelirler], sablonlar: [...(d.sablonlar || [])], hesaplar: [...(d.hesaplar || [])] };
      yeni.ayarlar = { ...(d.ayarlar || {}), enflasyon: parseFloat(enf) || 50, accent, kuruldu: true };
      if (parseFloat(gelir) > 0) {
        yeni.gelirler.push({ id: uid(), baslik: "Maaş", miktar: parseFloat(gelir), kategori: "Maaş", tarih: bugun() });
        yeni.sablonlar.push({ id: uid(), tip: "gelir", baslik: "Maaş", miktar: parseFloat(gelir), kategori: "Maaş", frekans: "aylık", baslangic: bugun(), sonUretilen: bugun() });
      }
      if (parseFloat(bakiye) > 0) yeni.hesaplar.push({ id: uid(), ad: "Banka Hesabım", tip: "banka", bakiye: parseFloat(bakiye) });
      return yeni;
    });
  }
  const adimlar = [
    { icon: "👋", baslik: `Hoş geldin, ${user.ad || user.username}!`, alt: "Birkaç adımda kurulumunu yapalım. Dilersen atlayabilirsin.", icerik: null },
    { icon: "💰", baslik: "Aylık gelirin?", alt: "Maaşını gir — otomatik aylık tekrara eklenir (boş bırakabilirsin).", icerik: <Field label="Aylık Gelir (₺)" type="number" value={gelir} onChange={setGelir} placeholder="50000" /> },
    { icon: "🏦", baslik: "Banka bakiyen?", alt: "İlk hesabını oluşturalım (isteğe bağlı).", icerik: <Field label="Banka Bakiyesi (₺)" type="number" value={bakiye} onChange={setBakiye} placeholder="25000" /> },
    {
      icon: "🎨",
      baslik: "Son rötuşlar",
      alt: "Enflasyon oranı (reel getiri için) ve vurgu rengini seç.",
      icerik: (
        <div>
          <Field label="Yıllık Enflasyon (%)" type="number" value={enf} onChange={setEnf} />
          <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0.5rem 0" }}>Vurgu rengi</p>
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            {ACCENT_SECENEK.map((a) => (
              <button key={a.renk} onClick={() => setAccent(a.renk)} style={{ width: 34, height: 34, borderRadius: "50%", background: a.renk, border: accent === a.renk ? "3px solid #fff" : `2px solid ${C.line2}`, cursor: "pointer" }} />
            ))}
          </div>
        </div>
      ),
    },
  ];
  const cur = adimlar[adim];
  const son = adim === adimlar.length - 1;
  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(circle at 30% 20%, #1A1530, ${C.bg} 60%)`, fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: "1.5rem" }}>
          {adimlar.map((_, i) => (
            <div key={i} style={{ width: 28, height: 4, borderRadius: 999, background: i <= adim ? accent : C.line2 }} />
          ))}
        </div>
        <Card>
          <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>{cur.icon}</div>
            <h2 style={{ margin: "0 0 0.35rem", fontSize: "1.25rem", fontWeight: 700 }}>{cur.baslik}</h2>
            <p style={{ margin: 0, color: C.dimmer, fontSize: "0.85rem" }}>{cur.alt}</p>
          </div>
          {cur.icerik && <div style={{ marginBottom: "0.5rem" }}>{cur.icerik}</div>}
          <div style={{ display: "flex", gap: "0.6rem", marginTop: "1rem" }}>
            {adim > 0 && <Btn variant="ghost" onClick={() => setAdim(adim - 1)}>Geri</Btn>}
            {son ? <Btn onClick={bitir} style={{ flex: 1 }}>Başla 🚀</Btn> : <Btn onClick={() => setAdim(adim + 1)} style={{ flex: 1 }}>İleri</Btn>}
          </div>
          <p onClick={atla} style={{ textAlign: "center", color: C.faint, fontSize: "0.78rem", marginTop: "1rem", marginBottom: 0, cursor: "pointer" }}>Şimdilik atla</p>
        </Card>
      </div>
    </div>
  );
}
