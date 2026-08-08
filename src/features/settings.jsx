// ============================================================
// Ayarlar — Zümrüt & Altın
// Profil, PWA, görünüm (tema/vurgu), güvenlik (PIN), Yapay Zekâ,
// bildirimler, para birimi, kategoriler, kurallar, kullanıcılar,
// veri & yedek. Tüm yazımlar setFindata üzerinden gider.
// ============================================================
import { useState, useRef, useEffect } from "react";
import { V, F, SERIF, MONO, ACCENT_SECENEK } from "../lib/constants.js";
import { uid, bugun, buAy, sayiCevir } from "../lib/format.js";
import { TL } from "../lib/format.js";
import { MODEL_SECENEK, GEMINI_MODEL_SECENEK, OPENAI_MODEL_SECENEK, configureAI, testAIBaglanti, SAGLAYICI_SECENEK, varsayilanAdres, yerelModelleriListele, anahtarKaydet, anahtarDurum } from "../lib/ai.js";
import { giderKategorileri, gelirKategorileri, bosVeri } from "../lib/finance.js";
import { syncYukle, syncDurum, pbFindataCek, pbFindataGonder, pbHaneBul, pbHaneOlustur, pbHaneKatil, pbHaneAyril, pbSifreDegistir } from "../lib/sync.js";
import { Card, Btn, Field, Toggle, Seg } from "../components/ui.jsx";
import { Icon } from "../components/icons.jsx";

const baslik = { fontSize: "15px", fontWeight: 600, color: V.ink, fontFamily: SERIF, margin: "0 0 14px" };
const altYazi = { margin: "0 0 14px", fontSize: "12px", color: V.ink3, lineHeight: 1.5 };
const etiket = { display: "block", fontSize: "11.5px", color: V.ink3, marginBottom: 8 };

export function Ayarlar({ findata, setFindata, bildir, user, onLogout }) {
  const ay = findata.ayarlar || {};
  const setAyar = (obj) => setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), ...obj } }));

  return (
    <div>
      <h2 style={{ margin: "0 0 18px", fontSize: "1.2rem", fontWeight: 600, fontFamily: SERIF }}>Ayarlar</h2>
      <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 14 }}>
        <ProfilKart user={user} onLogout={onLogout} />
        <SifreKart bildir={bildir} />
        <BulutKart findata={findata} setFindata={setFindata} bildir={bildir} />
        <PwaKart bildir={bildir} />
        <GorunumKart ay={ay} setAyar={setAyar} />
        <GuvenlikKart ay={ay} setAyar={setAyar} bildir={bildir} />
        <AiKart findata={findata} setFindata={setFindata} bildir={bildir} />
        <div className="fa-grid-2">
          <BildirimKart ay={ay} setAyar={setAyar} bildir={bildir} />
          <ParaBirimiKart ay={ay} setAyar={setAyar} />
        </div>
        <KategoriKart findata={findata} setFindata={setFindata} bildir={bildir} />
        <KurallarKart findata={findata} setFindata={setFindata} bildir={bildir} />
        <VeriKart findata={findata} setFindata={setFindata} user={user} bildir={bildir} />
      </div>
    </div>
  );
}

// ---------- Profil ----------
// ---------- Bulut Senkron (PocketBase) ----------
function BulutKart({ findata, setFindata, bildir }) {
  const [durum, setDurum] = useState(() => syncYukle());
  const [mesgul, setMesgul] = useState(false);
  const [haneAd, setHaneAd] = useState("");
  const [katilKod, setKatilKod] = useState("");
  const [haneForm, setHaneForm] = useState(""); // "" | "olustur" | "katil"

  async function simdiSenkronla() {
    setMesgul(true);
    try { await pbFindataGonder(findata); bildir("Buluta yüklendi"); }
    catch (e) { bildir(e?.message || "Gönderilemedi", "err"); }
    finally { setMesgul(false); }
  }

  async function haneOlustur() {
    setMesgul(true);
    try {
      const h = await pbHaneOlustur(haneAd.trim() || "Ortak Hane", findata); // mevcut veriyi tohumla
      setDurum(syncDurum());
      setHaneForm(""); setHaneAd("");
      bildir(`Hane oluşturuldu · davet kodu: ${h.kod}`);
    } catch (e) { bildir(e?.message || "Hane oluşturulamadı", "err"); }
    finally { setMesgul(false); }
  }
  async function haneKatil() {
    const kod = katilKod.trim().toUpperCase();
    if (!kod) { bildir("Davet kodu gerekli", "err"); return; }
    if (!confirm("Haneye katılınca bu cihazdaki görünümün ORTAK veriyle değişir (kişisel verin hesabında saklı kalır). Devam edilsin mi?")) return;
    setMesgul(true);
    try {
      await pbHaneKatil(kod);
      const bulut = await pbFindataCek(); // artık hane verisi
      if (bulut?.data) setFindata({ ...bosVeri(), ...bulut.data });
      setDurum(syncDurum());
      setHaneForm(""); setKatilKod("");
      bildir("Haneye katıldın · ortak veri yüklendi");
    } catch (e) { bildir(e?.message || "Katılınamadı", "err"); }
    finally { setMesgul(false); }
  }
  async function haneAyril() {
    if (!confirm("Haneden ayrılınca kendi kişisel veri görünümüne dönersin. Ortak veri diğer üyelerde kalır. Ayrılınsın mı?")) return;
    setMesgul(true);
    try {
      await pbHaneAyril();
      const bulut = await pbFindataCek(); // artık kişisel veri
      if (bulut?.data) setFindata({ ...bosVeri(), ...bulut.data });
      setDurum(syncDurum());
      bildir("Haneden ayrıldın · kişisel verine dönüldü");
    } catch (e) { bildir(e?.message || "Ayrılınamadı", "err"); }
    finally { setMesgul(false); }
  }
  function koduKopyala() {
    try { navigator.clipboard?.writeText(durum.haneKod); bildir("Davet kodu kopyalandı"); }
    catch { bildir(`Davet kodu: ${durum.haneKod}`); }
  }

  return (
    <Card style={{ padding: 20 }}>
      <div style={{ ...baslik, marginBottom: 6 }}>Hesap & Ortak Hane</div>
      <p style={altYazi}>Verin sunucundaki PocketBase'de tutulur; aynı hesapla başka cihaz/tarayıcıdan girince veriler gelir. Oturumu kapatmak için üstteki profil kartından <b>Çıkış</b>.</p>
      <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--chip-green)", border: `1px solid ${V.pos}44`, borderRadius: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <Icon d="check" size={16} stroke={V.pos} />
            <span style={{ fontSize: 13, color: V.ink }}>Bağlı: <b>{durum.email}</b></span>
            <span style={{ marginLeft: "auto", fontSize: 11.5, color: V.ink3, fontFamily: MONO }}>{durum.url}</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Btn onClick={simdiSenkronla} disabled={mesgul}>{mesgul ? "…" : "↻ Şimdi Senkronla"}</Btn>
          </div>

          {/* ---- Ortak Hane ---- */}
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${V.border}` }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: V.ink, marginBottom: 4 }}>Ortak Hane</div>
            {durum.haneId ? (
              <div>
                <p style={{ ...altYazi, marginTop: 0 }}>Bu hanedeki herkes <b>aynı veriyi</b> görür ve düzenler. Davet kodunu paylaşarak yeni üye ekleyebilirsin.</p>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--chip-green)", border: `1px solid ${V.accent}55`, borderRadius: 10, marginBottom: 12, flexWrap: "wrap" }}>
                  <Icon d="users" size={16} stroke={V.accent} />
                  <span style={{ fontSize: 13, color: V.ink }}>{durum.haneAd || "Ortak Hane"}</span>
                  <span style={{ marginLeft: "auto", fontSize: 15, color: V.ink, fontFamily: MONO, fontWeight: 700, letterSpacing: "0.12em" }}>{durum.haneKod}</span>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Btn onClick={koduKopyala}>Davet Kodunu Kopyala</Btn>
                  <Btn variant="soft" onClick={haneAyril} disabled={mesgul} style={{ color: V.neg }}>Haneden Ayrıl</Btn>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ ...altYazi, marginTop: 0 }}>Eşin/ailenle aynı veriyi paylaşmak için bir hane oluştur ya da davet koduyla katıl.</p>
                {haneForm === "" && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Btn onClick={() => setHaneForm("olustur")}>Hane Oluştur</Btn>
                    <Btn variant="soft" onClick={() => setHaneForm("katil")}>Haneye Katıl</Btn>
                  </div>
                )}
                {haneForm === "olustur" && (
                  <div>
                    <Field label="Hane adı" value={haneAd} onChange={setHaneAd} placeholder="örn. Bizim Ev" />
                    <p style={{ fontSize: 11, color: V.ink3, lineHeight: 1.5, margin: "0 0 10px" }}>Şu anki verin haneye aktarılır ve bir davet kodu üretilir. Kodu diğer kişiyle paylaş.</p>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <Btn onClick={haneOlustur} disabled={mesgul}>{mesgul ? "…" : "Oluştur"}</Btn>
                      <Btn variant="soft" onClick={() => setHaneForm("")}>Vazgeç</Btn>
                    </div>
                  </div>
                )}
                {haneForm === "katil" && (
                  <div>
                    <Field label="Davet kodu" value={katilKod} onChange={setKatilKod} placeholder="6 haneli kod" mono />
                    <p style={{ fontSize: 11, color: V.ink3, lineHeight: 1.5, margin: "0 0 10px" }}>Katılınca görünümün ortak veriye geçer; kişisel verin hesabında saklı kalır.</p>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <Btn onClick={haneKatil} disabled={mesgul}>{mesgul ? "…" : "Katıl"}</Btn>
                      <Btn variant="soft" onClick={() => setHaneForm("")}>Vazgeç</Btn>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
    </Card>
  );
}

// ---------- Şifre Değiştir (PocketBase hesabı) ----------
function SifreKart({ bildir }) {
  const [eski, setEski] = useState("");
  const [yeni, setYeni] = useState("");
  const [tekrar, setTekrar] = useState("");
  const [mesgul, setMesgul] = useState(false);

  async function degistir() {
    if (!eski) { bildir("Mevcut şifre gerekli", "err"); return; }
    if (yeni.length < 8) { bildir("Yeni şifre en az 8 karakter olmalı", "err"); return; }
    if (yeni !== tekrar) { bildir("Yeni şifreler eşleşmiyor", "err"); return; }
    setMesgul(true);
    try {
      await pbSifreDegistir(eski, yeni);
      setEski(""); setYeni(""); setTekrar("");
      bildir("Şifre güncellendi");
    } catch (e) {
      bildir(e?.message || "Şifre değiştirilemedi", "err");
    } finally {
      setMesgul(false);
    }
  }

  return (
    <Card style={{ padding: 20 }}>
      <div style={{ ...baslik, marginBottom: 6 }}>Şifre Değiştir</div>
      <p style={altYazi}>Hesabının (PocketBase) giriş şifresini değiştir.</p>
      <Field label="Mevcut şifre" type="password" value={eski} onChange={setEski} placeholder="••••••" />
      <Field label="Yeni şifre" type="password" value={yeni} onChange={setYeni} placeholder="en az 8 karakter" />
      <Field label="Yeni şifre (tekrar)" type="password" value={tekrar} onChange={setTekrar} placeholder="••••••" />
      <Btn onClick={degistir} disabled={mesgul}>{mesgul ? "…" : "Şifreyi Güncelle"}</Btn>
    </Card>
  );
}

function ProfilKart({ user, onLogout }) {
  const ad = user?.ad || user?.username || "Kullanıcı";
  const harf = (ad[0] || "K").toUpperCase();
  const rol = user?.rol === "admin" ? "Yönetici" : "Kullanıcı";
  return (
    <Card style={{ padding: 20, display: "flex", alignItems: "center", gap: 15 }}>
      <div
        style={{
          width: 50, height: 50, borderRadius: "50%", flex: "none",
          background: V.emerald, color: V.cream,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 19, fontWeight: 700,
        }}
      >
        {harf}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: V.ink }}>{ad}</div>
        <div style={{ fontSize: 12, color: V.ink3 }}>@{user?.username || "kullanici"} · {rol}</div>
      </div>
      <Btn variant="soft" onClick={onLogout} style={{ color: V.neg }}>Çıkış</Btn>
    </Card>
  );
}

// ---------- PWA ----------
function PwaKart({ bildir }) {
  const kurulu =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator?.standalone);
  function yukle() {
    if (kurulu) {
      bildir("Uygulama zaten kurulu");
      return;
    }
    bildir("Tarayıcı menüsünden \"Ana ekrana ekle / Uygulamayı yükle\" seçeneğini kullan");
  }
  return (
    <div style={{ background: V.emerald, borderRadius: 14, padding: 20, display: "flex", alignItems: "center", gap: 15 }}>
      <div
        style={{
          width: 44, height: 44, borderRadius: 12, flex: "none",
          background: V.accent, color: V.emerald,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, fontWeight: 800,
        }}
      >
        ₺
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#F4F1E9" }}>Uygulamayı Yükle</div>
        <div style={{ fontSize: 12, color: V.sage }}>Telefon/masaüstüne kur, çevrimdışı çalışsın</div>
      </div>
      <Btn variant="gold" onClick={yukle}>{kurulu ? "Kurulu" : "Yükle"}</Btn>
    </div>
  );
}

// ---------- Görünüm ----------
function GorunumKart({ ay, setAyar }) {
  const temaDeger = ay.tema === "acik" ? "acik" : "koyu";
  const accent = ay.accent || "#C79A4B";
  return (
    <Card style={{ padding: 20 }}>
      <div style={baslik}>Görünüm</div>
      <div style={etiket}>Tema</div>
      <div style={{ marginBottom: 18 }}>
        <Seg
          full
          items={[{ id: "acik", label: "Açık" }, { id: "koyu", label: "Koyu" }]}
          value={temaDeger}
          onChange={(v) => setAyar({ tema: v })}
        />
      </div>
      <div style={etiket}>Vurgu rengi</div>
      <div style={{ display: "flex", gap: 11, flexWrap: "wrap" }}>
        {ACCENT_SECENEK.map((a) => {
          const secili = accent === a.renk;
          return (
            <button
              key={a.renk}
              onClick={() => setAyar({ accent: a.renk })}
              title={a.ad}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                background: "none", border: "none", cursor: "pointer", fontFamily: F,
              }}
            >
              <span
                style={{
                  width: 30, height: 30, borderRadius: "50%", background: a.renk,
                  boxShadow: secili ? `0 0 0 2px ${V.card}, 0 0 0 4px ${a.renk}` : "none",
                  border: secili ? "none" : `1px solid ${V.border2}`,
                }}
              />
              <span style={{ fontSize: 10.5, color: secili ? V.ink : V.ink3 }}>{a.ad}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ---------- Güvenlik (PIN) ----------
function GuvenlikKart({ ay, setAyar, bildir }) {
  const pinAktif = !!ay.pin;
  const [taslak, setTaslak] = useState(ay.pin || "");
  function togglePin(on) {
    if (on) {
      setTaslak("");
      // Toggle'ı açık göstermek için boş bir pin alanı aç; gerçek kayıt 4 hane girilince olur
      setAyar({ pin: "" });
    } else {
      setTaslak("");
      setAyar({ pin: null });
      bildir("PIN kaldırıldı");
    }
  }
  function pinGir(v) {
    const t = v.replace(/\D/g, "").slice(0, 4);
    setTaslak(t);
    if (t.length === 4) {
      setAyar({ pin: t });
      bildir("PIN kaydedildi (sonraki girişte sorulur)");
    } else {
      // 4 haneye ulaşana kadar geçerli pin'i sıfırla ama toggle'ı açık tut ("" = açık-ama-tanımsız)
      setAyar({ pin: "" });
    }
  }
  const acik = pinAktif || ay.pin === "";
  return (
    <Card style={{ padding: 20 }}>
      <div style={baslik}>Güvenlik</div>
      <Toggle
        label="PIN kilidi"
        sub="Uygulama açılışında 4 haneli PIN sor"
        checked={acik}
        onChange={togglePin}
      />
      {acik && (
        <div style={{ marginTop: 12, paddingTop: 14, borderTop: `1px solid ${V.line}` }}>
          <label style={etiket}>{ay.pin && ay.pin.length === 4 ? "PIN aktif — değiştir" : "Yeni PIN (4 hane)"}</label>
          <input
            value={taslak}
            onChange={(e) => pinGir(e.target.value)}
            inputMode="numeric"
            placeholder="••••"
            maxLength={4}
            style={{
              width: 120, padding: "10px 13px", letterSpacing: "6px", textAlign: "center",
              background: V.card2, border: `1px solid ${V.border}`, borderRadius: 10,
              color: V.ink, fontSize: 16, fontFamily: MONO, outline: "none",
            }}
          />
          {ay.pin && ay.pin.length === 4 && (
            <div style={{ fontSize: 11.5, color: V.pos, marginTop: 8 }}>✓ PIN aktif. Her girişte sorulur.</div>
          )}
        </div>
      )}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${V.line}` }}>
        <label style={etiket}>Oturum zaman aşımı (hareketsizlik)</label>
        <Seg
          items={[{ id: 15, label: "15 dk" }, { id: 30, label: "30 dk" }, { id: 60, label: "60 dk" }, { id: 0, label: "Kapalı" }]}
          value={ay.oturumIdleDk ?? 30}
          onChange={(v) => setAyar({ oturumIdleDk: v })}
        />
        <p style={{ fontSize: 11, color: V.ink3, lineHeight: 1.5, margin: "8px 0 0" }}>
          Bu süre boyunca işlem yapılmazsa oturum güvenlik için otomatik kapanır. Ayrıca en fazla 7 gün sonra (aktif olsan bile) yeniden giriş istenir.
        </p>
      </div>
    </Card>
  );
}

// ---------- Yapay Zekâ ----------
function AiKart({ findata, setFindata, bildir }) {
  const ay = findata.ayarlar || {};
  const saglayici = ay.aiSaglayici || "anthropic";
  const gemini = saglayici === "gemini";
  const openai = saglayici === "openai";
  const yerel = saglayici !== "anthropic" && saglayici !== "gemini" && saglayici !== "openai";
  // Write-only: kayıtlı anahtar alana GERİ BASILMAZ (güvenlik). Alan boş başlar;
  // kayıtlı durum ayrı bir göstergeyle bilinir.
  const [anahtar, setAnahtar] = useState("");
  const [adres, setAdres] = useState(ay.yerelAdres || "");
  const [yModel, setYModel] = useState(ay.yerelModel || "");
  const [test, setTest] = useState(null);
  const [modeller, setModeller] = useState([]);
  const [modelDurum, setModelDurum] = useState(""); // "yukleniyor" | hata metni | ""
  const [srvDurum, setSrvDurum] = useState(null); // sunucuda kayıtlı sağlayıcılar { anthropic, gemini, openai }

  const setAyar = (obj) => setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), ...obj } }));

  // Bulut sağlayıcılarda proxy (sunucu-taraflı anahtar) varsayılan AÇIK — DB-only'de
  // sunucu hep var ve anahtar cihazda tutulmaz. Kullanıcı açıkça kapatabilir.
  const proxyAcik = ay.proxyMod ?? true;

  // Sunucuda hangi sağlayıcıların anahtarı kayıtlı? (write-only göstergesi için)
  useEffect(() => {
    let iptal = false;
    anahtarDurum().then((d) => { if (!iptal) setSrvDurum(d); });
    return () => { iptal = true; };
  }, []);
  const srvKayitli = !!srvDurum?.[saglayici];
  const cihazKayitli = !!ay.apiKey; // eski tarayıcı-modu anahtarı
  const anahtarKayitli = srvKayitli || cihazKayitli;

  // Yerel sunucudaki yüklü modelleri çek
  async function modelleriGetir(ad = adres) {
    setModelDurum("yukleniyor");
    try {
      const liste = await yerelModelleriListele(ad, anahtar.trim());
      setModeller(liste);
      setModelDurum(liste.length ? "" : "Sunucuda model bulunamadı");
      if (liste.length && !liste.includes(yModel.trim())) { setYModel(liste[0]); setAyar({ yerelModel: liste[0] }); }
    } catch (e) {
      setModeller([]);
      setModelDurum(e?.message || "Modeller alınamadı");
    }
  }
  // Yerel sağlayıcı seçiliyse modelleri otomatik getir (bulut sağlayıcıların kendi listesi var)
  useEffect(() => {
    if (saglayici !== "anthropic" && saglayici !== "gemini" && saglayici !== "openai") modelleriGetir(adres || varsayilanAdres(saglayici));
    else { setModeller([]); setModelDurum(""); }
  }, [saglayici]); // eslint-disable-line

  function saglayiciSec(v) {
    const guncel = { aiSaglayici: v };
    if (v === "gemini") {
      // Gemini modeli seçili değilse varsayılana al
      const gm = GEMINI_MODEL_SECENEK.some((m) => m.id === yModel) ? yModel : GEMINI_MODEL_SECENEK[0].id;
      setYModel(gm);
      guncel.yerelModel = gm;
    } else if (v === "openai") {
      const om = OPENAI_MODEL_SECENEK.some((m) => m.id === yModel) ? yModel : OPENAI_MODEL_SECENEK[0].id;
      setYModel(om);
      guncel.yerelModel = om;
    } else if (v !== "anthropic") {
      const ad = adres || varsayilanAdres(v);
      setAdres(ad);
      guncel.yerelAdres = ad;
    }
    setAyar(guncel);
    setTest(null);
  }
  const bulut = saglayici === "anthropic" || gemini || openai;
  async function kaydet() {
    const key = anahtar.trim();
    try {
      if (bulut && proxyAcik) {
        // Anahtarı SUNUCUYA yaz, cihazda tutma. proxyMod'u kalıcı olarak açık işaretle.
        if (key) { await anahtarKaydet(saglayici, key); setAnahtar(""); }
        setAyar({ apiKey: "", proxyMod: true, yerelAdres: adres.trim(), yerelModel: yModel.trim() });
        setSrvDurum((d) => ({ ...(d || {}), [saglayici]: key ? true : !!d?.[saglayici] }));
        bildir(key ? "Anahtar sunucuya kaydedildi (cihazda saklanmadı)" : "AI ayarları kaydedildi");
      } else {
        // Tarayıcı modu (açıkça proxy kapalı): anahtar cihazda saklanır.
        setAyar({ apiKey: key || ay.apiKey || "", proxyMod: false, yerelAdres: adres.trim(), yerelModel: yModel.trim() });
        setAnahtar("");
        bildir("AI ayarları kaydedildi");
      }
    } catch (e) {
      bildir(e?.message || "Kaydedilemedi", "err");
    }
  }
  async function baglantiTest() {
    // Test için anahtarı yalnızca bellekte kullan (findata'ya YAZMA — sızıntı olmasın).
    const key = anahtar.trim();
    configureAI({ ...ay, aiSaglayici: saglayici, proxyMod: bulut ? proxyAcik : false, apiKey: bulut && proxyAcik ? "" : (key || ay.apiKey || ""), yerelAdres: adres.trim(), yerelModel: yModel.trim() });
    setTest({ durum: "bekle", mesaj: "Test ediliyor…" });
    try {
      await testAIBaglanti();
      setTest({ durum: "ok", mesaj: "✓ Bağlantı başarılı" });
      bildir("Bağlantı başarılı");
    } catch (e) {
      const m = "✗ " + (e?.message || "Bağlantı başarısız");
      setTest({ durum: "err", mesaj: m });
      bildir(e?.message || "Bağlantı başarısız", "err");
    } finally {
      // Kalıcı ayarları geri uygula (test'in geçici configi kalmasın)
      configureAI(ay);
    }
  }

  // Seg sağlayıcı: anthropic + yerel seçenekler (anthropic / ollama / lmstudio / ozel)
  const segItems = SAGLAYICI_SECENEK.map((s) => ({
    id: s.id,
    label: s.id === "anthropic" ? "Claude" : s.id === "gemini" ? "Gemini" : s.id === "openai" ? "OpenAI" : s.id === "ollama" ? "Ollama" : s.id === "lmstudio" ? "LM Studio" : "Özel",
  }));

  return (
    <Card style={{ padding: 20 }}>
      <div style={{ ...baslik, marginBottom: 6 }}>Yapay Zekâ</div>
      <p style={altYazi}>
        Asistan, fiş okuma ve doğal dil girişi için. Bulut sağlayıcılarda anahtar
        varsayılan olarak <b>sunucunda</b> (write-only) tutulur; cihaza yazılmaz ve burada gösterilmez.
      </p>
      <div style={etiket}>Sağlayıcı</div>
      <div style={{ marginBottom: 16 }}>
        <Seg full items={segItems} value={saglayici} onChange={saglayiciSec} />
      </div>

      {yerel ? (
        <>
          <div className="fa-grid-2">
            <Field
              label="Yerel sunucu adresi (…/v1)"
              value={adres}
              onChange={setAdres}
              placeholder={varsayilanAdres(saglayici) || "http://localhost:11434/v1"}
              mono
            />
            {modeller.length > 0 ? (
              <Field
                label="Model"
                value={modeller.includes(yModel) ? yModel : modeller[0]}
                onChange={(v) => { setYModel(v); setAyar({ yerelModel: v }); }}
                options={modeller}
              />
            ) : (
              <Field
                label="Model adı"
                value={yModel}
                onChange={setYModel}
                placeholder={saglayici === "lmstudio" ? "yüklü model adı" : "llama3.1"}
                mono
              />
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "-4px 0 12px", flexWrap: "wrap" }}>
            <Btn variant="soft" onClick={() => modelleriGetir()} disabled={modelDurum === "yukleniyor"} style={{ padding: "8px 13px" }}>
              {modelDurum === "yukleniyor" ? "Getiriliyor…" : "↻ Modelleri Getir"}
            </Btn>
            {modeller.length > 0 && <span style={{ fontSize: 12, color: V.pos }}>{modeller.length} model bulundu</span>}
            {modelDurum && modelDurum !== "yukleniyor" && <span style={{ fontSize: 12, color: V.ink3 }}>{modelDurum}</span>}
          </div>
          <div style={{ fontSize: 11, color: V.ink3, lineHeight: 1.5, margin: "0 0 12px" }}>
            {saglayici === "ollama" && (
              <span>Ollama: modeli indir, CORS için <span style={{ fontFamily: MONO }}>OLLAMA_ORIGINS=* ollama serve</span> ile başlat.</span>
            )}
            {saglayici === "lmstudio" && (
              <span>LM Studio: "Local Server" sekmesinde modeli yükle, sunucuyu başlat ve CORS'u aç.</span>
            )}
            {saglayici === "ozel" && <span>OpenAI-uyumlu herhangi bir /v1 adresi (CORS açık olmalı).</span>}
            <br />PDF ve web arama (fiyat/kur) yerelde çalışmaz.
          </div>
        </>
      ) : gemini ? (
        <>
          <Field
            label="Gemini API Anahtarı"
            type="password"
            value={anahtar}
            onChange={setAnahtar}
            placeholder="AIza..."
            mono
          />
          <Field
            label="Model"
            value={GEMINI_MODEL_SECENEK.some((m) => m.id === yModel) ? yModel : GEMINI_MODEL_SECENEK[0].id}
            onChange={setYModel}
            options={GEMINI_MODEL_SECENEK}
          />
          <div style={{ fontSize: 11, color: V.ink3, lineHeight: 1.5, margin: "0 0 12px" }}>
            Ücretsiz anahtarı <span style={{ fontFamily: MONO }}>aistudio.google.com</span>'dan alırsın (Google hesabı yeter). Fiş okuma ve Türkçe desteklenir; yalnızca bu tarayıcıda saklanır. Canlı fiyat/kur (web arama) yalnızca Claude'da çalışır.
          </div>
        </>
      ) : openai ? (
        <>
          <Field
            label="OpenAI API Anahtarı"
            type="password"
            value={anahtar}
            onChange={setAnahtar}
            placeholder="sk-..."
            mono
          />
          <Field
            label="Model"
            value={OPENAI_MODEL_SECENEK.some((m) => m.id === yModel) ? yModel : OPENAI_MODEL_SECENEK[0].id}
            onChange={setYModel}
            options={OPENAI_MODEL_SECENEK}
          />
          <div style={{ fontSize: 11, color: V.ink3, lineHeight: 1.5, margin: "0 0 12px" }}>
            Anahtarı <span style={{ fontFamily: MONO }}>platform.openai.com</span>'dan alırsın (ücretli). GPT-4o görsel okur (fiş/ekstre). Yalnızca bu tarayıcıda saklanır.
          </div>
        </>
      ) : (
        <>
          <Field
            label="API Anahtarı"
            type="password"
            value={anahtar}
            onChange={setAnahtar}
            placeholder="sk-ant-..."
            mono
          />
          <Field
            label="Model"
            value={ay.model || "claude-opus-4-8"}
            onChange={(m) => setAyar({ model: m })}
            options={MODEL_SECENEK}
          />
          <div style={{ fontSize: 11, color: V.ink3, lineHeight: 1.5, margin: "0 0 12px" }}>
            Anahtarını console.anthropic.com'dan alırsın; yalnızca bu tarayıcıda saklanır.
          </div>
        </>
      )}

      {bulut && (
        <div style={{ marginBottom: 14, padding: "10px 12px", background: V.card2, border: `1px solid ${V.border}`, borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: anahtarKayitli ? V.pos : V.ink3, marginBottom: 10 }}>
            {srvKayitli
              ? "✓ Bu sağlayıcı için sunucuda kayıtlı anahtar var (write-only)"
              : cihazKayitli
                ? "• Cihazda kayıtlı anahtar var — sunucuya taşımak için proxy açıkken kaydet"
                : "Kayıtlı anahtar yok — yeni anahtar girip kaydet"}
          </div>
          <Toggle
            label="Anahtarı sunucuda tut (proxy)"
            sub="Anahtar cihazda saklanmaz; sunucundaki PocketBase'de tutulur ve AI çağrısı sunucudan yapılır. (Giriş gerekir.)"
            checked={proxyAcik}
            onChange={(v) => setAyar({ proxyMod: v })}
          />
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Btn onClick={kaydet}>Kaydet</Btn>
        <Btn variant="soft" onClick={baglantiTest}>Bağlantıyı Test Et</Btn>
        {test && (
          <span style={{ fontSize: 12.5, color: test.durum === "ok" ? V.pos : test.durum === "err" ? V.neg : V.ink3 }}>
            {test.mesaj}
          </span>
        )}
      </div>
    </Card>
  );
}

// ---------- Bildirimler ----------
function BildirimKart({ ay, setAyar, bildir }) {
  const acik = !!ay.bildirimler;
  // Tarayıcı bildirimleri yalnızca güvenli bağlamda (HTTPS veya localhost) çalışır.
  // http://<LAN-IP> gibi güvensiz origin'de tarayıcı izni sessizce reddeder.
  const guvenli = typeof window === "undefined" ? true : (window.isSecureContext !== false);
  const desteklenir = typeof Notification !== "undefined";
  async function degis(on) {
    if (!on) {
      setAyar({ bildirimler: false });
      bildir("Bildirimler kapandı");
      return;
    }
    if (!guvenli) {
      bildir("Bildirimler yalnızca güvenli bağlantıda (HTTPS) çalışır — HTTP/LAN-IP'de tarayıcı izin vermez", "err");
      return;
    }
    if (!desteklenir) {
      bildir("Tarayıcı bildirimi desteklemiyor", "err");
      return;
    }
    let p = Notification.permission;
    if (p !== "granted") { try { p = await Notification.requestPermission(); } catch { p = "denied"; } }
    if (p === "granted") {
      setAyar({ bildirimler: true });
      bildir("Bildirimler açıldı");
    } else {
      bildir("Bildirim izni verilmedi (tarayıcı ayarlarından da açabilirsin)", "err");
    }
  }
  return (
    <Card style={{ padding: 20 }}>
      <div style={baslik}>Bildirimler</div>
      <Toggle label="Yaklaşan ödemeler" sub="3 gün önce uyar" checked={acik} onChange={degis} />
      {!guvenli && (
        <p style={{ ...altYazi, margin: "12px 0 0" }}>
          ⚠️ Bu sayfa güvensiz bağlantıda (HTTP). Tarayıcı bildirimlerini engeller. Sunucunu <b>HTTPS</b> (ör. Cloudflare Tunnel) ile açarsan bildirimler çalışır.
        </p>
      )}
    </Card>
  );
}

// ---------- Para Birimi ----------
function ParaBirimiKart({ ay, setAyar }) {
  const pb = ay.paraBirimi || "TRY";
  return (
    <Card style={{ padding: 20 }}>
      <div style={baslik}>Para Birimi</div>
      <Seg
        full
        items={[{ id: "TRY", label: "TRY" }, { id: "USD", label: "USD" }, { id: "EUR", label: "EUR" }]}
        value={pb}
        onChange={(v) => setAyar({ paraBirimi: v })}
      />
    </Card>
  );
}

// ---------- Kategoriler ----------
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

  const chip = (k, tur) => (
    <span
      key={k}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "5px 7px 5px 11px", background: V.track, borderRadius: 8,
        fontSize: 12.5, color: V.ink2,
      }}
    >
      {k}
      <button
        onClick={() => sil(tur, k)}
        title="Sil"
        style={{ border: "none", background: "none", cursor: "pointer", color: V.ink3, fontSize: 13, lineHeight: 1, padding: 0 }}
      >
        ✕
      </button>
    </span>
  );

  const ekleSatir = (tur, yeni, setYeni) => (
    <div style={{ display: "flex", gap: 8 }}>
      <input
        value={yeni}
        onChange={(e) => setYeni(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && ekle(tur, yeni, setYeni)}
        placeholder={tur === "gider" ? "Yeni gider kategorisi" : "Yeni gelir kategorisi"}
        style={{
          flex: 1, padding: "9px 12px", background: V.card2, border: `1px solid ${V.border}`,
          borderRadius: 9, color: V.ink, fontSize: 13, fontFamily: F, outline: "none", boxSizing: "border-box",
        }}
      />
      <Btn onClick={() => ekle(tur, yeni, setYeni)}>Ekle</Btn>
    </div>
  );

  return (
    <Card style={{ padding: 20 }}>
      <div style={baslik}>Kategoriler</div>
      <div style={etiket}>Gider kategorileri</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 11 }}>
        {gider.map((k) => chip(k, "gider"))}
      </div>
      <div style={{ marginBottom: 18 }}>{ekleSatir("gider", yeniGider, setYeniGider)}</div>
      <div style={etiket}>Gelir kategorileri</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 11 }}>
        {gelir.map((k) => chip(k, "gelir"))}
      </div>
      {ekleSatir("gelir", yeniGelir, setYeniGelir)}
    </Card>
  );
}

// ---------- Otomatik Kurallar ----------
function KurallarKart({ findata, setFindata, bildir }) {
  const [form, setForm] = useState({ tip: "kategori", kelime: "", tutarUstu: "", kategori: "Market", mesaj: "" });
  const kurallar = findata.kurallar || [];
  function ekle() {
    if (!form.kelime && !form.tutarUstu) {
      bildir("Kelime veya tutar gir", "err");
      return;
    }
    setFindata((d) => ({
      ...d,
      kurallar: [
        ...(d.kurallar || []),
        { id: uid(), tip: form.tip, kelime: form.kelime, tutarUstu: sayiCevir(form.tutarUstu), kategori: form.kategori, mesaj: form.mesaj },
      ],
    }));
    setForm({ tip: "kategori", kelime: "", tutarUstu: "", kategori: "Market", mesaj: "" });
    bildir("Kural eklendi");
  }
  function sil(id) {
    setFindata((d) => ({ ...d, kurallar: d.kurallar.filter((k) => k.id !== id) }));
  }
  return (
    <Card style={{ padding: 20 }}>
      <div style={baslik}>Otomatik Kurallar</div>
      <p style={altYazi}>Başlıkta kelime geçince kategori ata, ya da tutar aşımında uyarı ver. Yeni işlemlere otomatik uygulanır.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
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
      <div style={{ marginTop: 14 }}>
        {!kurallar.length && <p style={{ color: V.ink3, fontSize: 12.5, margin: 0 }}>Henüz kural yok.</p>}
        {kurallar.map((k) => (
          <div
            key={k.id}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "9px 0", borderBottom: `1px solid ${V.line}`,
            }}
          >
            <span style={{ fontSize: 13, color: V.ink2 }}>
              {k.tip === "kategori"
                ? `"${k.kelime || k.tutarUstu + "₺+"}" → ${k.kategori}`
                : `"${k.kelime || k.tutarUstu + "₺+"}" → uyarı`}
            </span>
            <button
              onClick={() => sil(k.id)}
              title="Sil"
              style={{ border: "none", background: "none", cursor: "pointer", color: V.ink3, fontSize: 14, padding: 0 }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------- Veri & Yedek ----------
function VeriKart({ findata, setFindata, user, bildir }) {
  const geriRef = useRef();

  function indir(icerik, ad, mime) {
    try {
      const blob = new Blob([icerik], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = ad;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      bildir("İndirildi: " + ad);
    } catch {
      bildir("İndirme engellenmiş olabilir", "err");
    }
  }
  function yedekAl() {
    indir(JSON.stringify(findata, null, 2), `finansapp-yedek-${user?.username || "kullanici"}-${bugun()}.json`, "application/json");
  }
  function csvAktar() {
    const s = [["Tip", "Başlık", "Kategori", "Tarih", "Tutar", "Kaynak"]];
    (findata.gelirler || []).forEach((g) => s.push(["Gelir", g.baslik, g.kategori, g.tarih, g.miktar, g.kaynak || "manuel"]));
    (findata.giderler || []).forEach((g) => s.push(["Gider", g.baslik, g.kategori, g.tarih, g.miktar, g.kaynak || "manuel"]));
    (findata.abonelikler || []).forEach((a) => s.push(["Abonelik", a.baslik, a.kategori, a.tarih, a.miktar, "manuel"]));
    const csv = "﻿" + s.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    indir(csv, `finansapp-islemler-${bugun()}.csv`, "text/csv;charset=utf-8");
  }
  function pdfRapor() {
    const ay = buAy();
    const ayGider = {};
    (findata.giderler || []).filter((g) => (g.tarih || "").startsWith(ay)).forEach((g) => { ayGider[g.kategori] = (ayGider[g.kategori] || 0) + g.miktar; });
    const katSatir = Object.entries(ayGider).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right">${TL(v)}</td></tr>`).join("");
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Finans Raporu</title><style>body{font-family:system-ui,Arial,sans-serif;max-width:720px;margin:40px auto;color:#1a1a1a;padding:0 20px}h1{color:#1D5240}.kart{display:inline-block;border:1px solid #ddd;border-radius:10px;padding:14px 18px;margin:6px 8px 6px 0}.kart b{display:block;font-size:1.3rem}table{width:100%;border-collapse:collapse;margin-top:10px}td,th{padding:8px;border-bottom:1px solid #eee;font-size:0.9rem}@media print{.no-print{display:none}}</style></head><body><h1>₺ FinansApp — Aylık Rapor</h1><p>${user?.ad || user?.username || ""} · ${bugun()}</p><h3>Bu Ay Kategori Giderleri (${ay})</h3><table><tr><th style="text-align:left">Kategori</th><th style="text-align:right">Tutar</th></tr>${katSatir || '<tr><td colspan=2>Veri yok</td></tr>'}</table><button class="no-print" onclick="window.print()" style="margin-top:24px;padding:10px 18px;background:#1D5240;color:#fff;border:none;border-radius:8px;cursor:pointer">PDF olarak yazdır / kaydet</button></body></html>`;
    indir(html, `finansapp-rapor-${bugun()}.html`, "text/html");
    bildir("Rapor indirildi — açıp 'PDF olarak yazdır' ile kaydedebilirsin");
  }
  function geriYukle(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const v = JSON.parse(r.result);
        setFindata({ ...bosVeri(), ...v });
        bildir("Yedek geri yüklendi");
      } catch {
        bildir("Geçersiz yedek", "err");
      }
    };
    r.readAsText(file);
    if (geriRef.current) geriRef.current.value = "";
  }
  function temizle() {
    if (typeof window !== "undefined" && !window.confirm("Tüm veriler silinecek. Emin misin?")) return;
    setFindata({ ...bosVeri() });
    bildir("Tüm veriler temizlendi");
  }

  const dataBtn = {
    padding: "11px", borderRadius: 10, border: `1px solid ${V.border2}`,
    background: V.card2, color: V.ink, fontSize: 13, fontWeight: 500,
    cursor: "pointer", fontFamily: F, textAlign: "center", boxSizing: "border-box",
  };

  return (
    <Card style={{ padding: 20 }}>
      <div style={baslik}>Veri & Yedek</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <button onClick={yedekAl} style={dataBtn} className="fa-btn">↓ JSON Yedek Al</button>
        <label style={{ ...dataBtn }} className="fa-btn">
          ↑ Yedek Yükle
          <input ref={geriRef} type="file" accept="application/json,.json" onChange={geriYukle} style={{ display: "none" }} />
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <button onClick={csvAktar} style={dataBtn} className="fa-btn">CSV Aktar</button>
        <button onClick={pdfRapor} style={dataBtn} className="fa-btn">PDF Rapor</button>
      </div>
      <button
        onClick={temizle}
        className="fa-btn"
        style={{
          width: "100%", padding: "11px", borderRadius: 10, border: `1px solid ${V.neg}`,
          background: "transparent", color: V.neg, fontSize: 13, fontWeight: 500,
          cursor: "pointer", fontFamily: F,
        }}
      >
        Tüm Veriyi Temizle
      </button>
    </Card>
  );
}
