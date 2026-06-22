// ============================================================
// FinansApp Pro — ana uygulama (kimlik doğrulama + sekmeler)
// ============================================================
import { useState, useEffect, useRef, useCallback } from "react";
import { C, F } from "./lib/constants.js";
import { uid, bugun } from "./lib/format.js";
import { storage } from "./lib/storage.js";
import { bosVeri, tekrarlariUret, kurallariUygula } from "./lib/finance.js";
import { fiyatCek, setApiKey, setModel } from "./lib/ai.js";

import { Login, PinGate, Onboarding } from "./features/auth.jsx";
import { Panel } from "./features/dashboard.jsx";
import { Asistan } from "./features/assistant.jsx";
import { Yatirimlar, YatirimModal } from "./features/investments.jsx";
import { Hesaplar } from "./features/accounts.jsx";
import { Liste, GiderListe, Abonelikler, IslemModal } from "./features/transactions.jsx";
import { Planlama } from "./features/planning.jsx";
import { Analiz } from "./features/analysis.jsx";
import { Gorseller } from "./features/visuals.jsx";
import { Takvim } from "./features/calendar.jsx";
import { Hane } from "./features/household.jsx";
import { IceAktar } from "./features/importing.jsx";
import { Rapor } from "./features/report.jsx";
import { Ayarlar } from "./features/settings.jsx";
import { Kullanicilar } from "./features/users.jsx";
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
    setApiKey(findata?.ayarlar?.apiKey || "");
    setModel(findata?.ayarlar?.model || "claude-opus-4-8");
  }, [findata?.ayarlar?.apiKey, findata?.ayarlar?.model]);

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
  const isAdmin = user.rol === "admin";
  const accent = findata.ayarlar?.accent || C.indigo;

  const TABS = [
    { id: "panel", label: "📊 Panel" },
    { id: "asistan", label: "💬 Asistan" },
    { id: "yatirim", label: "📈 Yatırım" },
    { id: "hesap", label: "👛 Hesaplar" },
    { id: "gelir", label: "💰 Gelir" },
    { id: "gider", label: "💸 Gider" },
    { id: "abonelik", label: "🔄 Abonelik" },
    { id: "planlama", label: "🎯 Bütçe & Hedef" },
    { id: "analiz", label: "🔬 Analiz" },
    { id: "gorsel", label: "🌊 Görseller" },
    { id: "takvim", label: "📅 Takvim" },
    { id: "hane", label: "🏠 Hane" },
    { id: "ice", label: "📥 İçe Aktar" },
    { id: "rapor", label: "📄 Rapor" },
    { id: "ayar", label: "⚙️ Ayarlar" },
    ...(isAdmin ? [{ id: "kullanici", label: "👥 Kullanıcılar" }] : []),
  ];

  const guncelDeger = (y) => y.adet * (y.guncelFiyat || y.alisFiyati);
  const toplamGelir = findata.gelirler.reduce((s, x) => s + x.miktar, 0);
  const toplamGider = findata.giderler.reduce((s, x) => s + x.miktar, 0);
  const toplamAbonelik = findata.abonelikler.reduce((s, x) => s + x.miktar, 0);
  const yatirimDeger = findata.yatirimlar.reduce((s, y) => s + guncelDeger(y), 0);
  const yatirimMaliyet = findata.yatirimlar.reduce((s, y) => s + y.adet * y.alisFiyati, 0);
  const yatirimKar = yatirimDeger - yatirimMaliyet;
  const nakit = toplamGelir - toplamGider - toplamAbonelik;
  const netDeger = nakit + yatirimDeger;

  function bildir(msg, tip = "ok") {
    setBildirim({ msg, tip });
    setTimeout(() => setBildirim(null), 3500);
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
    setFindata((d) => ({ ...d, [m[tur]]: d[m[tur]].filter((x) => x.id !== id) }));
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
    ekle(tur, { baslik: form.baslik, miktar: parseFloat(form.miktar), kategori: form.kategori, tarih: form.tarih, hane: !!form.hane });
    kategoriOgren(form.baslik, form.kategori);
    if (form.tekrarla)
      setFindata((d) => ({ ...d, sablonlar: [...(d.sablonlar || []), { id: uid(), tip: tur, baslik: form.baslik, miktar: parseFloat(form.miktar), kategori: form.kategori, frekans: form.frekans || "aylık", baslangic: form.tarih, sonUretilen: form.tarih, hane: !!form.hane }] }));
    setModal(null);
    bildir(form.tekrarla ? "Eklendi + otomatik tekrara alındı" : "Eklendi");
  }

  return (
    <div style={{ minHeight: "100vh", background: { gece: "#0A0F1E", antrasit: "#0D0D11" }[findata.ayarlar?.tema] || C.bg, fontFamily: F, color: C.text }}>
      {bildirim && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 2000, background: bildirim.tip === "err" ? "#1F0A0A" : "#0D2718", border: `1px solid ${bildirim.tip === "err" ? "#7F1D1D" : "#166534"}`, color: bildirim.tip === "err" ? C.redL : C.greenL, padding: "0.75rem 1.1rem", borderRadius: "0.6rem", fontSize: "0.85rem", maxWidth: 340, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
          {bildirim.msg}
        </div>
      )}

      <div style={{ borderBottom: `1px solid ${C.line}`, padding: "1rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", background: C.card2, flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ width: 36, height: 36, borderRadius: "0.6rem", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>₺</div>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>FinansApp Pro</h1>
            <p style={{ margin: 0, fontSize: "0.7rem", color: C.faint }}>{user.ad} · {isAdmin ? "Yönetici" : "Kullanıcı"}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
          <div style={{ background: netDeger >= 0 ? "#0D2718" : "#1F0A0A", border: `1px solid ${netDeger >= 0 ? "#166534" : "#7F1D1D"}`, borderRadius: "0.6rem", padding: "0.4rem 0.85rem", textAlign: "right" }}>
            <div>
              <span style={{ color: netDeger >= 0 ? C.greenL : C.redL, fontWeight: 700, fontSize: "0.9rem" }}>{TL(netDeger)}</span>
              <span style={{ color: C.dimmer, fontSize: "0.68rem", marginLeft: "0.4rem" }}>net varlık</span>
            </div>
            {findata.kurlar && (
              <div style={{ color: C.faint, fontSize: "0.65rem", marginTop: 1 }}>
                ${(netDeger / findata.kurlar.usd).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} · €{(netDeger / findata.kurlar.eur).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}
              </div>
            )}
          </div>
          <Btn variant="ghost" onClick={onLogout} style={{ padding: "0.45rem 0.8rem", fontSize: "0.8rem" }}>Çıkış</Btn>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.25rem", padding: "0.85rem 1.5rem 0", borderBottom: `1px solid ${C.line}`, overflowX: "auto" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ background: tab === t.id ? accent : "transparent", border: `1px solid ${tab === t.id ? accent : "transparent"}`, color: tab === t.id ? "#fff" : C.dimmer, padding: "0.5rem 0.9rem", borderRadius: "0.5rem 0.5rem 0 0", cursor: "pointer", fontFamily: F, fontWeight: tab === t.id ? 600 : 400, fontSize: "0.8rem", whiteSpace: "nowrap", marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "1.5rem", maxWidth: 1150, margin: "0 auto" }}>
        {tab === "panel" && <Panel findata={findata} setFindata={setFindata} ekle={ekle} kategoriOgren={kategoriOgren} guncelDeger={guncelDeger} toplamGelir={toplamGelir} toplamGider={toplamGider} toplamAbonelik={toplamAbonelik} yatirimDeger={yatirimDeger} yatirimKar={yatirimKar} yatirimMaliyet={yatirimMaliyet} nakit={nakit} netDeger={netDeger} bildir={bildir} />}
        {tab === "asistan" && <Asistan findata={findata} guncelDeger={guncelDeger} toplamGelir={toplamGelir} toplamGider={toplamGider} toplamAbonelik={toplamAbonelik} yatirimDeger={yatirimDeger} netDeger={netDeger} bildir={bildir} />}
        {tab === "yatirim" && <Yatirimlar findata={findata} setFindata={setFindata} guncelDeger={guncelDeger} onEkle={() => { setForm({ tip: "kripto", ad: "", sembol: "", adet: "", alisFiyati: "", alisTarihi: bugun() }); setModal("yatirim"); }} onSil={(id) => sil("yatirim", id)} onGuncelle={tumFiyatlariGuncelle} guncelleniyor={fiyatGuncelleniyor} />}
        {tab === "hesap" && <Hesaplar findata={findata} setFindata={setFindata} bildir={bildir} />}
        {tab === "gelir" && <Liste baslik="Gelirler" renk={C.greenL} toplam={toplamGelir} kayitlar={findata.gelirler} onEkle={() => { setForm({ baslik: "", miktar: "", kategori: "Maaş", tarih: bugun(), tekrarla: false, hane: false }); setModal("gelir"); }} onSil={(id) => sil("gelir", id)} altBilgi={(x) => `${x.kategori} · ${x.tarih}`} />}
        {tab === "gider" && <GiderListe findata={findata} onEkle={() => { setForm({ baslik: "", miktar: "", kategori: "Market", tarih: bugun(), tekrarla: false, hane: false }); setModal("gider"); }} onSil={(id) => sil("gider", id)} />}
        {tab === "abonelik" && <Abonelikler findata={findata} bildir={bildir} onEkle={() => { setForm({ baslik: "", miktar: "", kategori: "Eğlence", tarih: bugun() }); setModal("abonelik"); }} onSil={(id) => sil("abonelik", id)} />}
        {tab === "planlama" && <Planlama findata={findata} setFindata={setFindata} bildir={bildir} />}
        {tab === "analiz" && <Analiz findata={findata} guncelDeger={guncelDeger} />}
        {tab === "gorsel" && <Gorseller findata={findata} guncelDeger={guncelDeger} toplamGelir={toplamGelir} netDeger={netDeger} />}
        {tab === "takvim" && <Takvim findata={findata} />}
        {tab === "hane" && <Hane users={users} />}
        {tab === "ice" && <IceAktar findata={findata} bildir={bildir} ekle={ekle} kategoriOgren={kategoriOgren} />}
        {tab === "rapor" && <Rapor findata={findata} setFindata={setFindata} user={user} bildir={bildir} toplamGelir={toplamGelir} toplamGider={toplamGider} toplamAbonelik={toplamAbonelik} yatirimDeger={yatirimDeger} yatirimKar={yatirimKar} netDeger={netDeger} guncelDeger={guncelDeger} />}
        {tab === "ayar" && <Ayarlar findata={findata} setFindata={setFindata} bildir={bildir} />}
        {tab === "kullanici" && isAdmin && <Kullanicilar users={users} onChange={onUsersChange} bildir={bildir} mevcut={user} />}
      </div>

      {modal === "yatirim" && (
        <YatirimModal
          form={form}
          setForm={setForm}
          onClose={() => setModal(null)}
          onKaydet={() => {
            if (!form.ad || !form.adet || !form.alisFiyati) return;
            const adet = parseFloat(form.adet),
              af = parseFloat(form.alisFiyati);
            ekle("yatirim", { tip: form.tip, ad: form.ad, sembol: form.sembol || form.ad, adet, alisFiyati: af, alisTarihi: form.alisTarihi, guncelFiyat: af, gecmis: [{ tarih: form.alisTarihi, deger: adet * af }] });
            setModal(null);
            bildir("Yatırım eklendi");
          }}
        />
      )}
      {modal === "gelir" && <IslemModal title="Gelir Ekle" form={form} setForm={setForm} kategoriler={GELIR_KAT} variant="green" hafiza={findata.kategoriHafiza} onClose={() => setModal(null)} onKaydet={() => kaydetIslem("gelir")} />}
      {modal === "gider" && <IslemModal title="Gider Ekle" form={form} setForm={setForm} kategoriler={GIDER_KAT} variant="red" hafiza={findata.kategoriHafiza} onClose={() => setModal(null)} onKaydet={() => kaydetIslem("gider")} />}
      {modal === "abonelik" && (
        <IslemModal
          title="Abonelik Ekle"
          form={form}
          setForm={setForm}
          kategoriler={["Eğlence", "Müzik", "Yazılım", "Sağlık", "Eğitim", "Haberler", "Diğer"]}
          miktarLabel="Aylık Ücret (₺)"
          variant="amber"
          noTekrar
          noHane
          onClose={() => setModal(null)}
          onKaydet={() => {
            if (!form.baslik || !form.miktar) return;
            ekle("abonelik", { baslik: form.baslik, miktar: parseFloat(form.miktar), kategori: form.kategori, tarih: form.tarih });
            setModal(null);
          }}
        />
      )}
    </div>
  );
}
