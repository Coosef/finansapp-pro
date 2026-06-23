// ============================================================
// FinansApp Pro — ana uygulama (kimlik doğrulama + sekmeler)
// ============================================================
import { useState, useEffect, useRef, useCallback } from "react";
import { C, F } from "./lib/constants.js";
import { uid, bugun } from "./lib/format.js";
import { storage } from "./lib/storage.js";
import { bosVeri, tekrarlariUret, kurallariUygula, giderKategorileri, gelirKategorileri, hesabaUygula } from "./lib/finance.js";
import { fiyatCek, configureAI } from "./lib/ai.js";

import { Login, PinGate, Onboarding } from "./features/auth.jsx";
import { Panel } from "./features/dashboard.jsx";
import { Asistan } from "./features/assistant.jsx";
import { Yatirimlar, YatirimModal } from "./features/investments.jsx";
import { Hesaplar } from "./features/accounts.jsx";
import { Islemler, IslemModal } from "./features/transactions.jsx";
import { Planlama } from "./features/planning.jsx";
import { Analiz } from "./features/analysis.jsx";
import { Takvim } from "./features/calendar.jsx";
import { Hane } from "./features/household.jsx";
import { Veri } from "./features/report.jsx";
import { Ayarlar } from "./features/settings.jsx";
import { Btn } from "./components/ui.jsx";
import { TL } from "./lib/format.js";
import { GELIR_KAT, GIDER_KAT } from "./lib/constants.js";

export default function FinansAppPro() {
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kullanicilar, setKullanicilar] = useState(null);
  const [aktif, setAktif] = useState(null);
  const [findata, setFindataState] = useState(null);
  const [kilitli, setKilitli] = useState(false);
  const [tab, setTab] = useState("panel");

  // Kullanıcı listesini yükle (ilk açılışta admin oluştur)
  useEffect(() => {
    (async () => {
      try {
        let users = null;
        try {
          const r = await storage.get("users");
          users = r ? JSON.parse(r.value) : null;
        } catch {
          /* yoksay */
        }
        if (!users) {
          users = [{ username: "admin", sifre: "admin123", rol: "admin", ad: "Yönetici" }];
          try {
            await storage.set("users", JSON.stringify(users));
          } catch {
            /* yoksay */
          }
        }
        setKullanicilar(users);
      } finally {
        setYukleniyor(false);
      }
    })();
  }, []);

  // AI istemcisini aktif kullanıcının ayarlarına göre yapılandır
  useEffect(() => {
    configureAI(findata?.ayarlar || {});
  }, [findata?.ayarlar?.apiKey, findata?.ayarlar?.model, findata?.ayarlar?.aiSaglayici, findata?.ayarlar?.yerelAdres, findata?.ayarlar?.yerelModel]);

  async function girisYap(username, sifre) {
    const u = kullanicilar.find((x) => x.username === username && x.sifre === sifre);
    if (!u) return false;
    let veri = bosVeri();
    try {
      const r = await storage.get(`findata:${username}`);
      if (r) veri = { ...bosVeri(), ...JSON.parse(r.value) };
    } catch {
      /* yoksay */
    }
    const { data, degisti } = tekrarlariUret(veri);
    if (degisti) {
      try {
        await storage.set(`findata:${username}`, JSON.stringify(data));
      } catch {
        /* yoksay */
      }
    }
    setAktif(u);
    setFindataState(data);
    setKilitli(!!data.ayarlar?.pin);
    setTab("panel");
    return true;
  }

  const setFindata = useCallback(
    (updater) => {
      setFindataState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        if (aktif) storage.set(`findata:${aktif.username}`, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [aktif]
  );

  async function kullanicilariKaydet(yeni) {
    setKullanicilar(yeni);
    try {
      await storage.set("users", JSON.stringify(yeni));
    } catch {
      /* yoksay */
    }
  }

  if (yukleniyor)
    return <div style={{ minHeight: "100vh", background: C.bg, color: C.dim, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F }}>Yükleniyor…</div>;
  if (!aktif) return <Login onLogin={girisYap} />;
  if (kilitli) return <PinGate dogruPin={findata.ayarlar.pin} onAc={() => setKilitli(false)} onCikis={() => { setAktif(null); setFindataState(null); }} />;
  if (!findata.ayarlar?.kuruldu) return <Onboarding user={aktif} setFindata={setFindata} />;
  return (
    <Uygulama
      user={aktif}
      users={kullanicilar}
      onUsersChange={kullanicilariKaydet}
      findata={findata}
      setFindata={setFindata}
      tab={tab}
      setTab={setTab}
      onLogout={() => {
        setAktif(null);
        setFindataState(null);
      }}
    />
  );
}

function Uygulama({ user, users, onUsersChange, findata, setFindata, tab, setTab, onLogout }) {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [fiyatGuncelleniyor, setFiyatGuncelleniyor] = useState(false);
  const [bildirim, setBildirim] = useState(null);
  const [daha, setDaha] = useState(false);
  const isAdmin = user.rol === "admin";
  // Eski varsayılan indigo (#6366F1) kayıtlıysa yeni zümrüt'e eşle
  const savedAccent = findata.ayarlar?.accent;
  const accent = !savedAccent || savedAccent === "#6366F1" ? "#10B981" : savedAccent;

  const TABS = [
    { id: "panel", icon: "📊", label: "Panel" },
    { id: "asistan", icon: "💬", label: "Asistan" },
    { id: "islemler", icon: "💳", label: "İşlemler" },
    { id: "hesap", icon: "👛", label: "Hesaplar" },
    { id: "yatirim", icon: "📈", label: "Yatırım" },
    { id: "planlama", icon: "🎯", label: "Bütçe & Hedef" },
    { id: "analiz", icon: "🔬", label: "Analiz" },
    { id: "takvim", icon: "📅", label: "Takvim" },
    { id: "hane", icon: "🏠", label: "Hane" },
    { id: "veri", icon: "📦", label: "Veri" },
    { id: "ayar", icon: "⚙️", label: "Ayarlar" },
  ];
  // Mobil alt menüde gösterilecek ana sekmeler (gerisi "Daha"da)
  const MOBIL_ANA = ["panel", "islemler", "yatirim", "asistan"];

  const guncelDeger = (y) => y.adet * (y.guncelFiyat || y.alisFiyati);
  const toplamGelir = findata.gelirler.reduce((s, x) => s + x.miktar, 0);
  const toplamGider = findata.giderler.reduce((s, x) => s + x.miktar, 0);
  const toplamAbonelik = findata.abonelikler.reduce((s, x) => s + x.miktar, 0);
  const yatirimDeger = findata.yatirimlar.reduce((s, y) => s + guncelDeger(y), 0);
  const yatirimMaliyet = findata.yatirimlar.reduce((s, y) => s + y.adet * y.alisFiyati, 0);
  const yatirimKar = yatirimDeger - yatirimMaliyet;
  const nakit = toplamGelir - toplamGider - toplamAbonelik;
  const netDeger = nakit + yatirimDeger;

  const bildirimTimer = useRef(null);
  function bildir(msg, tip = "ok", action = null) {
    setBildirim({ msg, tip, action });
    if (bildirimTimer.current) clearTimeout(bildirimTimer.current);
    bildirimTimer.current = setTimeout(() => setBildirim(null), action ? 6000 : 3500);
  }
  function ekle(tur, kayit) {
    const m = { gelir: "gelirler", gider: "giderler", abonelik: "abonelikler", yatirim: "yatirimlar" };
    let son = kayit;
    if (tur === "gelir" || tur === "gider") {
      const { kayit: k2, uyarilar } = kurallariUygula(kayit, findata.kurallar);
      son = k2;
      if (uyarilar.length) bildir("⚠️ " + uyarilar[0]);
    }
    setFindata((d) => ({ ...d, [m[tur]]: [...d[m[tur]], { id: uid(), ...son }] }));
  }
  function sil(tur, id) {
    const m = { gelir: "gelirler", gider: "giderler", abonelik: "abonelikler", yatirim: "yatirimlar" };
    const kayit = findata[m[tur]].find((x) => x.id === id);
    const hesapEtkili = kayit?.hesapId && (tur === "gelir" || tur === "gider");
    setFindata((d) => {
      let nd = { ...d, [m[tur]]: d[m[tur]].filter((x) => x.id !== id) };
      if (hesapEtkili) nd = hesabaUygula(nd, kayit.hesapId, tur, kayit.miktar, -1);
      return nd;
    });
    bildir("Silindi", "ok", kayit ? {
      label: "↩ Geri al",
      onClick: () => {
        setFindata((d) => {
          let nd = { ...d, [m[tur]]: [...d[m[tur]], kayit] };
          if (hesapEtkili) nd = hesabaUygula(nd, kayit.hesapId, tur, kayit.miktar, +1);
          return nd;
        });
        setBildirim(null);
      },
    } : null);
  }
  function guncelle(tur, id, veri) {
    const m = { gelir: "gelirler", gider: "giderler", abonelik: "abonelikler", yatirim: "yatirimlar" };
    setFindata((d) => ({ ...d, [m[tur]]: d[m[tur]].map((x) => (x.id === id ? { ...x, ...veri } : x)) }));
  }
  function kategoriOgren(baslik, kategori) {
    const k = (baslik || "").toLowerCase().trim().split(/\s+/).slice(0, 2).join(" ");
    if (k) setFindata((d) => ({ ...d, kategoriHafiza: { ...(d.kategoriHafiza || {}), [k]: kategori } }));
  }

  async function tumFiyatlariGuncelle() {
    if (!findata.yatirimlar.length) {
      bildir("Güncellenecek yatırım yok");
      return;
    }
    setFiyatGuncelleniyor(true);
    const t = bugun();
    let basari = 0;
    const yeni = [...findata.yatirimlar];
    for (let i = 0; i < yeni.length; i++) {
      try {
        const f = await fiyatCek(yeni[i]);
        const g = yeni[i].gecmis || [];
        const yd = yeni[i].adet * f;
        const son = g[g.length - 1];
        const g2 = son && son.tarih === t ? [...g.slice(0, -1), { tarih: t, deger: yd }] : [...g, { tarih: t, deger: yd }];
        yeni[i] = { ...yeni[i], oncekiFiyat: yeni[i].guncelFiyat || yeni[i].alisFiyati, guncelFiyat: f, sonGuncelleme: t, gecmis: g2 };
        basari++;
      } catch {
        /* tek varlık atla */
      }
    }
    setFindata((d) => ({ ...d, yatirimlar: yeni }));
    setFiyatGuncelleniyor(false);
    bildir(`${basari}/${yeni.length} yatırım güncellendi`);
  }
  // İlk girişte yatırım varsa ve AI anahtarı tanımlıysa fiyatları çek
  const ilk = useRef(true);
  useEffect(() => {
    if (ilk.current && findata.yatirimlar.length && findata.ayarlar?.apiKey) {
      ilk.current = false;
      tumFiyatlariGuncelle();
    }
  }, []); // eslint-disable-line

  function kaydetIslem(tur) {
    if (!form.baslik || !form.miktar) return;
    const miktar = parseFloat(form.miktar);
    const hesapId = tur === "gelir" || tur === "gider" ? form.hesapId || "" : "";
    const veri = { baslik: form.baslik, miktar, kategori: form.kategori, tarih: form.tarih, hane: !!form.hane, hesapId };
    if (form._editId) {
      const m = { gelir: "gelirler", gider: "giderler", abonelik: "abonelikler" };
      const eski = (findata[m[tur]] || []).find((x) => x.id === form._editId);
      guncelle(tur, form._editId, veri);
      if (eski?.hesapId) setFindata((d) => hesabaUygula(d, eski.hesapId, tur, eski.miktar, -1));
      if (hesapId) setFindata((d) => hesabaUygula(d, hesapId, tur, miktar, +1));
      kategoriOgren(form.baslik, form.kategori);
      setModal(null);
      bildir("Güncellendi");
      return;
    }
    ekle(tur, veri);
    if (hesapId) setFindata((d) => hesabaUygula(d, hesapId, tur, miktar, +1));
    kategoriOgren(form.baslik, form.kategori);
    if (form.tekrarla)
      setFindata((d) => ({ ...d, sablonlar: [...(d.sablonlar || []), { id: uid(), tip: tur, baslik: form.baslik, miktar, kategori: form.kategori, frekans: form.frekans || "aylık", baslangic: form.tarih, sonUretilen: form.tarih, hane: !!form.hane }] }));
    setModal(null);
    bildir(form.tekrarla ? "Eklendi + otomatik tekrara alındı" : "Eklendi");
  }
  function duzenleIslem(tur, kayit) {
    setForm({ baslik: kayit.baslik, miktar: String(kayit.miktar), kategori: kayit.kategori, tarih: kayit.tarih, hane: !!kayit.hane, hesapId: kayit.hesapId || "", tekrarla: false, _editId: kayit.id });
    setModal(tur);
  }
  function duzenleYatirim(kayit) {
    setForm({ tip: kayit.tip, ad: kayit.ad, sembol: kayit.sembol, adet: String(kayit.adet), alisFiyati: String(kayit.alisFiyati), alisTarihi: kayit.alisTarihi, _editId: kayit.id });
    setModal("yatirim");
  }
  function kaydetYatirim() {
    if (!form.ad || !form.adet || !form.alisFiyati) return;
    const adet = parseFloat(form.adet),
      af = parseFloat(form.alisFiyati);
    if (form._editId) {
      guncelle("yatirim", form._editId, { tip: form.tip, ad: form.ad, sembol: form.sembol || form.ad, adet, alisFiyati: af, alisTarihi: form.alisTarihi });
      setModal(null);
      bildir("Yatırım güncellendi");
      return;
    }
    ekle("yatirim", { tip: form.tip, ad: form.ad, sembol: form.sembol || form.ad, adet, alisFiyati: af, alisTarihi: form.alisTarihi, guncelFiyat: af, gecmis: [{ tarih: form.alisTarihi, deger: adet * af }] });
    setModal(null);
    bildir("Yatırım eklendi");
  }

  const netChip = (
    <div className="fa-networth" style={{ textAlign: "right" }}>
      <div className="nw-val" style={{ color: netDeger >= 0 ? C.greenL : C.redL }}>{TL(netDeger)}</div>
      <div className="nw-lbl">net varlık</div>
      {findata.kurlar && (
        <div className="nw-fx">
          ${(netDeger / findata.kurlar.usd).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} · €{(netDeger / findata.kurlar.eur).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}
        </div>
      )}
    </div>
  );

  return (
    <div className="fa-root" style={{ minHeight: "100vh", background: { gece: "#0A0F1E", antrasit: "#0D0D11" }[findata.ayarlar?.tema] || C.bg, fontFamily: F, color: C.text, "--accent": accent }}>
      {bildirim && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 2000, background: bildirim.tip === "err" ? "#1F0A0A" : "#0D2718", border: `1px solid ${bildirim.tip === "err" ? "#7F1D1D" : "#166534"}`, color: bildirim.tip === "err" ? C.redL : C.greenL, padding: "0.75rem 1.1rem", borderRadius: "0.6rem", fontSize: "0.85rem", maxWidth: 360, boxShadow: "0 10px 30px rgba(0,0,0,0.5)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span>{bildirim.msg}</span>
          {bildirim.action && (
            <button onClick={bildirim.action.onClick} style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontFamily: F, fontWeight: 700, fontSize: "0.78rem", padding: "0.3rem 0.6rem", borderRadius: "0.45rem", cursor: "pointer", whiteSpace: "nowrap" }}>
              {bildirim.action.label}
            </button>
          )}
        </div>
      )}

      <div className="fa-shell">
        <aside className="fa-sidebar">
          <div className="fa-brand">
            <div className="fa-logo">₺</div>
            <div>
              <h1 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>FinansApp Pro</h1>
              <p style={{ margin: 0, fontSize: "0.7rem", color: C.faint }}>{user.ad} · {isAdmin ? "Yönetici" : "Kullanıcı"}</p>
            </div>
          </div>
          <nav className="fa-navlist">
            {TABS.map((t) => (
              <button key={t.id} className={`fa-navbtn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
                <span className="ico">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="fa-sidefoot">
            {netChip}
            <Btn variant="ghost" onClick={onLogout} style={{ width: "100%" }}>Çıkış</Btn>
          </div>
        </aside>

        <main className="fa-main">
          <header className="fa-topbar">
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <div className="fa-logo" style={{ width: 32, height: 32, fontSize: "1rem" }}>₺</div>
              <h1 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>FinansApp</h1>
            </div>
            {netChip}
          </header>

          <div className="fa-content">
            <div className="fa-page" key={tab}>
        {tab === "panel" && <Panel findata={findata} setFindata={setFindata} ekle={ekle} kategoriOgren={kategoriOgren} guncelDeger={guncelDeger} toplamGelir={toplamGelir} toplamGider={toplamGider} toplamAbonelik={toplamAbonelik} yatirimDeger={yatirimDeger} yatirimKar={yatirimKar} yatirimMaliyet={yatirimMaliyet} nakit={nakit} netDeger={netDeger} bildir={bildir} />}
        {tab === "asistan" && <Asistan findata={findata} guncelDeger={guncelDeger} toplamGelir={toplamGelir} toplamGider={toplamGider} toplamAbonelik={toplamAbonelik} yatirimDeger={yatirimDeger} netDeger={netDeger} bildir={bildir} />}
        {tab === "islemler" && <Islemler findata={findata} bildir={bildir} onSil={sil} onDuzenle={duzenleIslem} onGelirEkle={() => { setForm({ baslik: "", miktar: "", kategori: "Maaş", tarih: bugun(), tekrarla: false, hane: false }); setModal("gelir"); }} onGiderEkle={() => { setForm({ baslik: "", miktar: "", kategori: "Market", tarih: bugun(), tekrarla: false, hane: false }); setModal("gider"); }} onAbonelikEkle={() => { setForm({ baslik: "", miktar: "", kategori: "Eğlence", tarih: bugun() }); setModal("abonelik"); }} />}
        {tab === "hesap" && <Hesaplar findata={findata} setFindata={setFindata} bildir={bildir} />}
        {tab === "yatirim" && <Yatirimlar findata={findata} setFindata={setFindata} guncelDeger={guncelDeger} onEkle={() => { setForm({ tip: "kripto", ad: "", sembol: "", adet: "", alisFiyati: "", alisTarihi: bugun() }); setModal("yatirim"); }} onSil={(id) => sil("yatirim", id)} onDuzenle={duzenleYatirim} onGuncelle={tumFiyatlariGuncelle} guncelleniyor={fiyatGuncelleniyor} />}
        {tab === "planlama" && <Planlama findata={findata} setFindata={setFindata} bildir={bildir} />}
        {tab === "analiz" && <Analiz findata={findata} toplamGelir={toplamGelir} />}
        {tab === "takvim" && <Takvim findata={findata} />}
        {tab === "hane" && <Hane users={users} />}
        {tab === "veri" && <Veri findata={findata} setFindata={setFindata} user={user} bildir={bildir} ekle={ekle} kategoriOgren={kategoriOgren} toplamGelir={toplamGelir} toplamGider={toplamGider} toplamAbonelik={toplamAbonelik} yatirimDeger={yatirimDeger} yatirimKar={yatirimKar} netDeger={netDeger} guncelDeger={guncelDeger} />}
        {tab === "ayar" && <Ayarlar findata={findata} setFindata={setFindata} bildir={bildir} user={user} users={users} onUsersChange={onUsersChange} />}
            </div>
          </div>
        </main>
      </div>

      <nav className="fa-bottomnav">
        {MOBIL_ANA.map((id) => {
          const t = TABS.find((x) => x.id === id);
          return (
            <button key={id} className={`fa-tabbtn ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
              <span className="ico">{t.icon}</span>
              {t.label}
            </button>
          );
        })}
        <button className={`fa-tabbtn ${!MOBIL_ANA.includes(tab) ? "active" : ""}`} onClick={() => setDaha(true)}>
          <span className="ico">⋯</span>
          Daha
        </button>
      </nav>

      {daha && (
        <div className="fa-sheet-overlay" onClick={() => setDaha(false)}>
          <div className="fa-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="fa-sheet-grip" />
            <div className="fa-sheet-grid">
              {TABS.map((t) => (
                <button key={t.id} className={`fa-sheet-item ${tab === t.id ? "active" : ""}`} onClick={() => { setTab(t.id); setDaha(false); }}>
                  <span className="ico">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
            <Btn variant="ghost" onClick={() => { setDaha(false); onLogout(); }} style={{ width: "100%", marginTop: "1rem" }}>Çıkış Yap</Btn>
          </div>
        </div>
      )}

      {modal === "yatirim" && <YatirimModal title={form._editId ? "Yatırımı Düzenle" : "Yatırım Ekle"} form={form} setForm={setForm} onClose={() => setModal(null)} onKaydet={kaydetYatirim} />}
      {modal === "gelir" && <IslemModal title={form._editId ? "Gelir Düzenle" : "Gelir Ekle"} form={form} setForm={setForm} kategoriler={gelirKategorileri(findata)} hesaplar={findata.hesaplar} variant="green" hafiza={findata.kategoriHafiza} noTekrar={!!form._editId} onClose={() => setModal(null)} onKaydet={() => kaydetIslem("gelir")} />}
      {modal === "gider" && <IslemModal title={form._editId ? "Gider Düzenle" : "Gider Ekle"} form={form} setForm={setForm} kategoriler={giderKategorileri(findata)} hesaplar={findata.hesaplar} variant="red" hafiza={findata.kategoriHafiza} noTekrar={!!form._editId} onClose={() => setModal(null)} onKaydet={() => kaydetIslem("gider")} />}
      {modal === "abonelik" && (
        <IslemModal
          title={form._editId ? "Abonelik Düzenle" : "Abonelik Ekle"}
          form={form}
          setForm={setForm}
          kategoriler={["Eğlence", "Müzik", "Yazılım", "Sağlık", "Eğitim", "Haberler", "Diğer"]}
          miktarLabel="Aylık Ücret (₺)"
          variant="amber"
          noTekrar
          noHane
          noHesap
          onClose={() => setModal(null)}
          onKaydet={() => kaydetIslem("abonelik")}
        />
      )}
    </div>
  );
}
