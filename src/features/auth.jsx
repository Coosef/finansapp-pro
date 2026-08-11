// ============================================================
// Giriş, PIN kilidi ve onboarding — Zümrüt & Altın tasarımı
// ============================================================
import { useState, useEffect } from "react";
import { V, F, SERIF, MONO } from "../lib/constants.js";
import { uid, bugun, sayiCevir } from "../lib/format.js";
import { maasGeliriUret } from "../lib/maas.js";
import { Icon } from "../components/icons.jsx";

// Tüm ekranların ortak zemini: tam ekran zümrüt
const ekran = {
  position: "fixed", inset: 0, zIndex: 500, background: V.emerald,
  fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
};

export function Login({ onLogin, onRegister }) {
  const [mod, setMod] = useState("giris"); // "giris" | "kayit"
  const [email, setEmail] = useState("");
  const [p, setP] = useState("");
  const [p2, setP2] = useState("");
  const [hata, setHata] = useState("");
  const [mesgul, setMesgul] = useState(false);
  const kayit = mod === "kayit";

  async function dene() {
    setHata("");
    const e = email.trim();
    if (!e || !p) { setHata("E-posta ve şifre gerekli"); return; }
    if (kayit) {
      if (p.length < 8) { setHata("Şifre en az 8 karakter olmalı"); return; }
      if (p !== p2) { setHata("Şifreler eşleşmiyor"); return; }
    }
    setMesgul(true);
    try {
      if (kayit) await onRegister(e, p);
      else await onLogin(e, p);
    } catch (err) {
      // pbGiris/pbFetch mesajları bağlantı ile kimlik hatasını ayırır
      setHata(err?.message || (kayit ? "Kayıt başarısız" : "Giriş başarısız"));
    } finally {
      setMesgul(false);
    }
  }
  function onKey(e) {
    if (e.key === "Enter" && !mesgul) dene();
  }
  function modDegis(m) { setMod(m); setHata(""); setP2(""); }

  const inp = {
    width: "100%", padding: "12px 14px", marginBottom: "14px", background: V.card2,
    border: `1px solid ${V.border}`, borderRadius: "11px", color: V.ink,
    fontSize: "14px", fontFamily: F, outline: "none", boxSizing: "border-box",
  };
  const lbl = { display: "block", fontSize: "11.5px", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" };
  const seg = (aktif) => ({ flex: 1, padding: "9px 0", borderRadius: "9px", border: "none", cursor: "pointer", fontFamily: F, fontSize: "13.5px", fontWeight: 600, background: aktif ? V.emerald2 : "transparent", color: aktif ? V.cream : V.ink3 });
  return (
    <div style={ekran}>
      <div style={{ width: "100%", maxWidth: 380, animation: "obfade .4s both" }}>
        <div style={{ textAlign: "center", marginBottom: "26px" }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", margin: "0 auto 16px", background: V.accent, color: V.emerald, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", fontWeight: 800 }}>₺</div>
          <h1 className="serif" style={{ margin: 0, fontSize: "26px", fontWeight: 600, color: "#F4F1E9" }}>FinansApp</h1>
          <p style={{ margin: "5px 0 0", fontSize: "13px", color: V.sage }}>Kişisel finans yönetimi</p>
        </div>
        <div style={{ background: V.card, borderRadius: "18px", padding: "26px" }}>
          <div style={{ display: "flex", gap: 6, padding: 4, background: V.card2, border: `1px solid ${V.border}`, borderRadius: 12, marginBottom: 20 }}>
            <button onClick={() => modDegis("giris")} style={seg(!kayit)}>Giriş</button>
            <button onClick={() => modDegis("kayit")} style={seg(kayit)}>Kayıt</button>
          </div>
          <label style={lbl}>E-posta</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onKey} type="email" placeholder="sen@ornek.com" style={inp} />
          <label style={lbl}>Şifre</label>
          <input value={p} onChange={(e) => setP(e.target.value)} onKeyDown={onKey} type="password" placeholder={kayit ? "en az 8 karakter" : "••••••"} style={{ ...inp, marginBottom: kayit ? "14px" : "6px" }} />
          {kayit && (
            <>
              <label style={lbl}>Şifre (tekrar)</label>
              <input value={p2} onChange={(e) => setP2(e.target.value)} onKeyDown={onKey} type="password" placeholder="••••••" style={{ ...inp, marginBottom: "6px" }} />
            </>
          )}
          {hata && <p style={{ margin: "2px 0 0", fontSize: "12px", color: V.neg }}>{hata}</p>}
          <button onClick={dene} disabled={mesgul} style={{ width: "100%", marginTop: "16px", padding: "14px", borderRadius: "12px", border: "none", background: V.emerald2, color: V.cream, fontSize: "14.5px", fontWeight: 600, fontFamily: F, cursor: mesgul ? "default" : "pointer", opacity: mesgul ? 0.7 : 1 }}>
            {mesgul ? "…" : kayit ? "Kayıt Ol" : "Giriş Yap"}
          </button>
          <p style={{ margin: "14px 0 0", fontSize: "11.5px", color: V.ink3, textAlign: "center", lineHeight: 1.6 }}>
            {kayit
              ? "Hesabın sunucudaki PocketBase'de oluşturulur; verilerin cihazlar arası senkronlanır."
              : "İlk kez mi? Yukarıdan \"Kayıt\" ile hesap oluştur."}
          </p>
        </div>
      </div>
    </div>
  );
}

export function PinGate({ dogruPin, onAc, onCikis }) {
  const [pin, setPin] = useState("");
  const [hata, setHata] = useState(false);
  const [yanlis, setYanlis] = useState(0); // ard arda yanlış deneme
  const [kilit, setKilit] = useState(0); // kalan kilit saniyesi
  const MAX = 5, BEKLE = 30;
  useEffect(() => {
    if (kilit <= 0) return undefined;
    const t = setInterval(() => setKilit((k) => Math.max(0, k - 1)), 1000);
    return () => clearInterval(t);
  }, [kilit]);
  function bas(d) {
    if (kilit > 0 || pin.length >= 4) return;
    const yeni = pin + d;
    setPin(yeni);
    if (yeni.length === 4) {
      if (yeni === dogruPin) { onAc(); return; }
      const say = yanlis + 1;
      setYanlis(say);
      setHata(true);
      if (say >= MAX) { setKilit(BEKLE); setYanlis(0); } // çok fazla deneme → kilitle
      setTimeout(() => { setPin(""); setHata(false); }, 600);
    }
  }
  // Fiziksel klavye desteği: rakam tuşları PIN girer, Backspace siler
  useEffect(() => {
    function onKey(e) {
      if (kilit > 0) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); bas(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); setPin((p) => p.slice(0, -1)); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pin, kilit, yanlis, dogruPin]);
  const mesaj = kilit > 0 ? `Çok fazla deneme — ${kilit} sn bekle` : yanlis > 0 ? `PIN'ini gir · ${MAX - yanlis} deneme kaldı` : "PIN'ini gir";
  const tus = {
    width: 72, height: 72, borderRadius: "50%", background: "rgba(255,255,255,0.05)",
    border: `1px solid #3A6B55`, color: "#F4F1E9", fontSize: "1.5rem",
    fontFamily: MONO, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  };
  return (
    <div style={ekran}>
      <div style={{ textAlign: "center", animation: "obfade .4s both" }}>
        <Icon d="lock" size={34} stroke={V.accent} width={1.6} style={{ marginBottom: "14px" }} />
        <p style={{ margin: "0 0 22px", fontSize: "15px", color: kilit > 0 ? V.neg : "#F4F1E9" }}>{mesaj}</p>
        <div style={{ display: "flex", gap: "14px", justifyContent: "center", marginBottom: "30px", animation: hata ? "shake .3s" : "none" }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{ width: 14, height: 14, borderRadius: "50%", boxSizing: "border-box", background: i < pin.length ? V.accent : "transparent", border: i < pin.length ? "none" : "2px solid #3A6B55", transition: "all .15s" }} />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,72px)", gap: "14px", opacity: kilit > 0 ? 0.4 : 1, pointerEvents: kilit > 0 ? "none" : "auto", transition: "opacity .2s" }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <button key={d} onClick={() => bas(String(d))} style={tus}>{d}</button>
          ))}
          <div />
          <button onClick={() => bas("0")} style={tus}>0</button>
          <button onClick={() => setPin(pin.slice(0, -1))} style={{ ...tus, background: "transparent", border: "none", color: V.sage, fontSize: "1.3rem" }}>⌫</button>
        </div>
        <button onClick={onCikis} style={{ background: "none", border: "none", color: V.sage, fontFamily: F, cursor: "pointer", fontSize: "13px", marginTop: "28px" }}>Çıkış yap</button>
      </div>
    </div>
  );
}

export function Onboarding({ user, setFindata }) {
  const [adim, setAdim] = useState(0);
  const [gelir, setGelir] = useState("");
  function parseGelir() {
    return sayiCevir(gelir); // Türkçe biçim: nokta binlik, virgül ondalık
  }
  function atla() {
    setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), kuruldu: true } }));
  }
  function bitir() {
    const miktar = parseGelir();
    setFindata((d) => {
      let yeni = { ...d, maaslar: [...(d.maaslar || [])] };
      yeni.ayarlar = { ...(d.ayarlar || {}), kuruldu: true };
      // Maaş bir TANIM olarak eklenir; otomatik banka hesabı OLUŞTURULMAZ.
      // (Kullanıcı hesabını sonra Bütçe & Maaş ekranından bağlayabilir.)
      if (miktar > 0) {
        const gun = Number(String(bugun()).slice(8, 10)) || 1;
        yeni.maaslar.push({ id: uid(), ad: "Maaş", tutar: miktar, hesapId: "", odemeGunu: gun, kategori: "Maaş", baslangic: String(bugun()).slice(0, 7), aktif: true });
        yeni = maasGeliriUret(yeni, bugun()).data; // bu ayın maaş gelirini hemen türet
      }
      return yeni;
    });
  }
  const ileri = () => setAdim((a) => Math.min(a + 1, 2));

  const buton = (etiket, onClick) => (
    <button onClick={onClick} style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "none", background: V.accent, color: V.emerald, fontSize: "15px", fontWeight: 700, fontFamily: F, cursor: "pointer" }}>{etiket}</button>
  );

  return (
    <div style={ekran}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "34px" }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: i === adim ? 28 : 8, height: 8, borderRadius: 999, background: i <= adim ? V.accent : "#3A6B55", transition: "all .25s" }} />
          ))}
        </div>

        {adim === 0 && (
          <div style={{ animation: "obfade .4s both" }}>
            <div style={{ width: 72, height: 72, borderRadius: "20px", margin: "0 auto 22px", background: V.accent, color: V.emerald, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "34px", fontWeight: 800 }}>₺</div>
            <h2 className="serif" style={{ margin: "0 0 12px", fontSize: "26px", fontWeight: 600, color: "#F4F1E9" }}>Hoş geldin{user && (user.ad || user.username) ? `, ${user.ad || user.username}` : ""}!</h2>
            <p style={{ margin: "0 0 30px", fontSize: "14.5px", color: "#A9C4B6", lineHeight: 1.6 }}>FinansApp ile gelir-giderini takip et, bütçe kur, yatırımlarını izle ve net varlığını tek ekranda gör. Birkaç adımda hazırız.</p>
            {buton("Başlayalım", ileri)}
          </div>
        )}

        {adim === 1 && (
          <div style={{ animation: "obfade .4s both" }}>
            <h2 className="serif" style={{ margin: "0 0 12px", fontSize: "24px", fontWeight: 600, color: "#F4F1E9" }}>Aylık maaşın ne kadar?</h2>
            <p style={{ margin: "0 0 26px", fontSize: "14px", color: "#A9C4B6", lineHeight: 1.6 }}>Baz maaşını tanımlayalım — her ay tekrar eder. Prim/ek ödeme ve hangi banka hesabına yattığını sonra <b>Bütçe &amp; Maaş</b>'tan ekleyebilirsin.</p>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: "14px", padding: "6px 16px", marginBottom: "26px" }}>
              <span style={{ fontSize: "24px", color: V.accent, fontFamily: MONO }}>₺</span>
              <input value={gelir} onChange={(e) => setGelir(e.target.value)} inputMode="decimal" placeholder="58.000" style={{ flex: 1, padding: "14px 0", background: "transparent", border: "none", color: "#F4F1E9", fontSize: "24px", fontFamily: MONO, outline: "none", minWidth: 0 }} />
            </div>
            {buton("Devam", ileri)}
          </div>
        )}

        {adim === 2 && (
          <div style={{ animation: "obfade .4s both" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", margin: "0 auto 22px", background: "rgba(199,154,75,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon d="check" size={34} stroke={V.accent} width={2} />
            </div>
            <h2 className="serif" style={{ margin: "0 0 12px", fontSize: "26px", fontWeight: 600, color: "#F4F1E9" }}>Hazırsın!</h2>
            <p style={{ margin: "0 0 30px", fontSize: "14.5px", color: "#A9C4B6", lineHeight: 1.6 }}>Hesabın kuruldu. Artık işlem ekleyebilir, bütçe kurabilir ve finansal durumunu takip edebilirsin.</p>
            {buton("FinansApp'e Gir", bitir)}
          </div>
        )}

        <p onClick={atla} style={{ textAlign: "center", color: V.sage, fontSize: "12.5px", marginTop: "20px", marginBottom: 0, cursor: "pointer" }}>Şimdilik atla</p>
      </div>
    </div>
  );
}
