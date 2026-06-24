// ============================================================
// FinansApp — ana uygulama (kimlik doğrulama + kabuk + sekmeler)
// Zümrüt & Altın tasarımı, açık/koyu tema
// ============================================================
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { V } from "./lib/constants.js";
import { uid, bugun, TL } from "./lib/format.js";
import { storage } from "./lib/storage.js";
import { syncYukle, syncDurum, syncBagliMi, pbGiris, pbFindataCek, pbFindataGonder } from "./lib/sync.js";
import { bosVeri, tekrarlariUret, kurallariUygula, giderKategorileri, gelirKategorileri, hesabaUygula, hedefKatkilariUret, yaklasanOdemeler, donemFiltre } from "./lib/finance.js";
import { fiyatCek, configureAI, aiBildirimAyarla } from "./lib/ai.js";
import { Icon, IK } from "./components/icons.jsx";

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

const AY_UZUN = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const ACCENT_ESKI = ["#6366F1", "#10B981", "#818cf8", "#34D399"];

function ThemeWrap({ dark, children }) {
  return (
    <div className="fa-app" data-theme={dark ? "dark" : undefined} style={{ display: "block", height: "auto", minHeight: "100vh", overflow: "visible" }}>
      {children}
    </div>
  );
}

export default function FinansAppPro() {
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kullanicilar, setKullanicilar] = useState(null);
  const [aktif, setAktif] = useState(null);
  const [findata, setFindataState] = useState(null);
  const [kilitli, setKilitli] = useState(false);
  const [tab, setTab] = useState("panel");
  const [temaHint, setTemaHint] = useState("acik"); // giriş ekranı için son bilinen tema

  useEffect(() => {
    syncYukle(); // kayıtlı bulut oturumunu (varsa) yükle
    (async () => {
      try {
        try {
          const th = localStorage.getItem("finansapp:tema");
          if (th) setTemaHint(th);
        } catch { /* yoksay */ }
        let users = null;
        try {
          const r = await storage.get("users");
          users = r ? JSON.parse(r.value) : null;
        } catch { /* yoksay */ }
        if (!users) {
          users = [{ username: "admin", sifre: "admin123", rol: "admin", ad: "Yönetici" }];
          try { await storage.set("users", JSON.stringify(users)); } catch { /* yoksay */ }
        }
        setKullanicilar(users);
      } finally {
        setYukleniyor(false);
      }
    })();
  }, []);

  useEffect(() => {
    configureAI(findata?.ayarlar || {});
  }, [findata?.ayarlar?.apiKey, findata?.ayarlar?.model, findata?.ayarlar?.aiSaglayici, findata?.ayarlar?.yerelAdres, findata?.ayarlar?.yerelModel]);

  // tema değişince giriş ekranı ipucunu da güncelle
  useEffect(() => {
    const tm = findata?.ayarlar?.tema;
    if (tm) { setTemaHint(tm); try { localStorage.setItem("finansapp:tema", tm); } catch { /* yoksay */ } }
  }, [findata?.ayarlar?.tema]);

  // Veriyi hazırla (tekrarlar + hedef katkıları) ve oturumu aç
  function girisTamamla(u, veri, ilkBulutGonder) {
    let { data, degisti } = tekrarlariUret(veri);
    const hk = hedefKatkilariUret(data);
    data = hk.data;
    degisti = degisti || hk.degisti;
    if (degisti) storage.set(`findata:${u.username}`, JSON.stringify(data)).catch(() => {});
    if (ilkBulutGonder) pbFindataGonder(data).catch(() => {}); // bulut boştuysa ilk senkron
    setAktif(u);
    setFindataState(data);
    setKilitli(!!data.ayarlar?.pin);
    setTab("panel");
    return true;
  }

  async function girisYap(username, sifre) {
    // 1) Yerel kullanıcı (admin gibi)
    const u = kullanicilar.find((x) => x.username === username && x.sifre === sifre);
    if (u) {
      let veri = bosVeri();
      let bulutVar = false;
      if (syncBagliMi()) {
        try { const b = await pbFindataCek(); if (b?.data) { veri = { ...bosVeri(), ...b.data }; bulutVar = true; } } catch { /* çevrimdışı */ }
      }
      if (!bulutVar) {
        try { const r = await storage.get(`findata:${username}`); if (r) veri = { ...bosVeri(), ...JSON.parse(r.value) }; } catch { /* yoksay */ }
      }
      return girisTamamla(u, veri, syncBagliMi() && !bulutVar);
    }
    // 2) Bulut hesabı (e-posta + şifre) — herhangi bir tarayıcı/cihazdan
    if (username.includes("@")) {
      try {
        await pbGiris(syncDurum().url, username.trim(), sifre);
        let veri = bosVeri();
        const b = await pbFindataCek();
        const bulutBos = !b?.data;
        if (b?.data) veri = { ...bosVeri(), ...b.data };
        return girisTamamla({ username: username.trim(), ad: username.split("@")[0], rol: "kullanici", bulut: true }, veri, bulutBos);
      } catch { /* bulut da olmadı */ }
    }
    return false;
  }

  const bulutTimer = useRef(null);
  const setFindata = useCallback(
    (updater) => {
      setFindataState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        if (aktif) storage.set(`findata:${aktif.username}`, JSON.stringify(next)).catch(() => {});
        // Bulut bağlıysa değişikliği gönder (debounce: hızlı ardışık değişiklikleri birleştir)
        if (syncBagliMi()) {
          if (bulutTimer.current) clearTimeout(bulutTimer.current);
          bulutTimer.current = setTimeout(() => { pbFindataGonder(next).catch(() => {}); }, 1500);
        }
        return next;
      });
    },
    [aktif]
  );

  async function kullanicilariKaydet(yeni) {
    setKullanicilar(yeni);
    try { await storage.set("users", JSON.stringify(yeni)); } catch { /* yoksay */ }
  }

  const dark = (findata?.ayarlar?.tema || temaHint) === "koyu";

  if (yukleniyor)
    return <ThemeWrap dark={temaHint === "koyu"}><div style={{ minHeight: "100vh", background: "var(--emerald)", color: V.sage, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>Yükleniyor…</div></ThemeWrap>;
  if (!aktif) return <ThemeWrap dark={temaHint === "koyu"}><Login onLogin={girisYap} /></ThemeWrap>;
  if (kilitli) return <ThemeWrap dark={dark}><PinGate dogruPin={findata.ayarlar.pin} onAc={() => setKilitli(false)} onCikis={() => { setAktif(null); setFindataState(null); }} /></ThemeWrap>;
  if (!findata.ayarlar?.kuruldu) return <ThemeWrap dark={dark}><Onboarding user={aktif} setFindata={setFindata} /></ThemeWrap>;
  return (
    <Uygulama
      user={aktif}
      users={kullanicilar}
      onUsersChange={kullanicilariKaydet}
      findata={findata}
      setFindata={setFindata}
      tab={tab}
      setTab={setTab}
      dark={dark}
      onLogout={() => { setAktif(null); setFindataState(null); }}
    />
  );
}

const TABS = [
  { id: "panel", icon: "home", label: "Panel" },
  { id: "islemler", icon: "repeat", label: "İşlemler" },
  { id: "hesap", icon: "wallet", label: "Hesaplar" },
  { id: "yatirim", icon: "trending", label: "Yatırım" },
  { id: "planlama", icon: "target", label: "Bütçe & Hedef" },
  { id: "analiz", icon: "bars", label: "Analiz" },
  { id: "takvim", icon: "calendar", label: "Takvim" },
  { id: "asistan", icon: "chat", label: "Asistan" },
  { id: "hane", icon: "users", label: "Hane" },
  { id: "veri", icon: "archive", label: "Veri & Yedek" },
  { id: "ayar", icon: "settings", label: "Ayarlar" },
];
const BASLIK = Object.fromEntries(TABS.map((t) => [t.id, t.label]));
const MOBIL_ANA = ["panel", "islemler", "yatirim", "asistan"];
const DONEMLER = [
  { id: "buAy", ad: "Bu ay" },
  { id: "gecenAy", ad: "Geçen ay" },
  { id: "buYil", ad: "Bu yıl" },
  { id: "tum", ad: "Tümü" },
];

function selamMetni() {
  const h = new Date().getHours();
  return h < 6 ? "İyi geceler" : h < 12 ? "Günaydın" : h < 18 ? "İyi günler" : "İyi akşamlar";
}
function tarihUzun() {
  const d = new Date();
  return `${d.getDate()} ${AY_UZUN[d.getMonth()]}`;
}

function Uygulama({ user, users, onUsersChange, findata, setFindata, tab, setTab, dark, onLogout }) {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [fiyatGuncelleniyor, setFiyatGuncelleniyor] = useState(false);
  const [bildirim, setBildirim] = useState(null);
  const [daha, setDaha] = useState(false);
  const [donem, setDonem] = useState("buAy");
  const [donemAcik, setDonemAcik] = useState(false);
  const [bildirimAcik, setBildirimAcik] = useState(false);
  const [paletAcik, setPaletAcik] = useState(false);
  const [paletQ, setPaletQ] = useState("");
  const isAdmin = user.rol === "admin";

  const rawAccent = findata.ayarlar?.accent;
  const accent = !rawAccent || ACCENT_ESKI.includes(rawAccent) ? "#C79A4B" : rawAccent;

  // ---- Tüm-zaman toplamlar (net varlık, hesaplar) ----
  const guncelDeger = (y) => y.adet * (y.guncelFiyat || y.alisFiyati);
  const yatirimDeger = findata.yatirimlar.reduce((s, y) => s + guncelDeger(y), 0);
  const yatirimMaliyet = findata.yatirimlar.reduce((s, y) => s + y.adet * y.alisFiyati, 0);
  const yatirimKar = yatirimDeger - yatirimMaliyet;
  const toplamGelirTum = findata.gelirler.reduce((s, x) => s + x.miktar, 0);
  const toplamGiderTum = findata.giderler.reduce((s, x) => s + x.miktar, 0);
  const toplamAbonelik = findata.abonelikler.reduce((s, x) => s + x.miktar, 0);
  const nakitTum = toplamGelirTum - toplamGiderTum - toplamAbonelik;
  const netDeger = nakitTum + yatirimDeger;

  // ---- Döneme göre filtrelenmiş veriler ----
  const fd = useMemo(() => donemFiltre(findata, donem, bugun()), [findata, donem]);
  const toplamGelir = fd.gelirler.reduce((s, x) => s + x.miktar, 0);
  const toplamGider = fd.giderler.reduce((s, x) => s + x.miktar, 0);
  const nakit = toplamGelir - toplamGider - toplamAbonelik;

  const bildirimTimer = useRef(null);
  function bildir(msg, tip = "ok", action = null) {
    setBildirim({ msg, tip, action });
    if (bildirimTimer.current) clearTimeout(bildirimTimer.current);
    bildirimTimer.current = setTimeout(() => setBildirim(null), action ? 6000 : 3200);
  }
  // AI olaylarını (ör. otomatik model yedeği) toast olarak göster
  const bildirRef = useRef(null);
  bildirRef.current = bildir;
  useEffect(() => {
    aiBildirimAyarla((msg) => bildirRef.current?.(msg));
    return () => aiBildirimAyarla(null);
  }, []);

  // ---- İşlem ekle/sil/güncelle ----
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
    if (!findata.yatirimlar.length) { bildir("Güncellenecek yatırım yok"); return; }
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
      } catch { /* tek varlık atla */ }
    }
    setFindata((d) => ({ ...d, yatirimlar: yeni }));
    setFiyatGuncelleniyor(false);
    bildir(`${basari}/${yeni.length} yatırım güncellendi`);
  }
  const ilk = useRef(true);
  useEffect(() => {
    if (ilk.current && findata.yatirimlar.length && findata.ayarlar?.apiKey) {
      ilk.current = false;
      tumFiyatlariGuncelle();
    }
  }, []); // eslint-disable-line

  // Yaklaşan ödeme tarayıcı bildirimi (günde bir)
  useEffect(() => {
    const ay = findata.ayarlar || {};
    if (!ay.bildirimler || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const t = bugun();
    if (ay.sonBildirim === t) return;
    const yak = yaklasanOdemeler(findata, t, ay.bildirimGun || 3);
    if (yak.length) {
      try {
        new Notification("FinansApp — Yaklaşan ödeme", { body: yak.slice(0, 3).map((y) => `${y.ad} · ${y.gun === 0 ? "bugün" : y.gun + " gün"} · ${TL(y.miktar)}`).join("\n"), icon: "/pwa-192.png" });
      } catch { /* yoksay */ }
      setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), sonBildirim: t } }));
    }
  }, []); // eslint-disable-line

  // ---- İşlem modalı (gelir/gider tek modal, tip değiştirilebilir) ----
  function islemAc(tip = "gider") {
    setForm({ tip, baslik: "", miktar: "", kategori: tip === "gelir" ? "Maaş" : "Market", tarih: bugun(), tekrarla: false, hane: false, hesapId: "" });
    setModal("islem");
  }
  function abonelikAc() {
    setForm({ tip: "abonelik", baslik: "", miktar: "", kategori: "Eğlence", tarih: bugun() });
    setModal("abonelik");
  }
  function kaydetIslem(tur) {
    if (!form.baslik || !form.miktar) { bildir("Başlık ve tutar gerekli", "err"); return; }
    const miktar = parseFloat(String(form.miktar).replace(",", ".")) || 0;
    if (miktar <= 0) { bildir("Geçerli tutar gir", "err"); return; }
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
    setForm({ tip: tur, baslik: kayit.baslik, miktar: String(kayit.miktar), kategori: kayit.kategori, tarih: kayit.tarih, hane: !!kayit.hane, hesapId: kayit.hesapId || "", tekrarla: false, _editId: kayit.id });
    setModal(tur === "abonelik" ? "abonelik" : "islem");
  }

  // ---- Yatırım modalı ----
  function yatirimAc() {
    setForm({ tip: "kripto", ad: "", sembol: "", adet: "", alisFiyati: "", alisTarihi: bugun() });
    setModal("yatirim");
  }
  function duzenleYatirim(kayit) {
    setForm({ tip: kayit.tip, ad: kayit.ad, sembol: kayit.sembol, adet: String(kayit.adet), alisFiyati: String(kayit.alisFiyati), alisTarihi: kayit.alisTarihi, _editId: kayit.id });
    setModal("yatirim");
  }
  function kaydetYatirim() {
    if (!form.ad || !form.adet || !form.alisFiyati) { bildir("Ad, adet ve alış fiyatı gerekli", "err"); return; }
    const adet = parseFloat(String(form.adet).replace(",", ".")), af = parseFloat(String(form.alisFiyati).replace(",", "."));
    if (form._editId) {
      guncelle("yatirim", form._editId, { tip: form.tip, ad: form.ad, sembol: form.sembol || form.ad, adet, alisFiyati: af, alisTarihi: form.alisTarihi });
      setModal(null); bildir("Yatırım güncellendi"); return;
    }
    ekle("yatirim", { tip: form.tip, ad: form.ad, sembol: form.sembol || form.ad, adet, alisFiyati: af, alisTarihi: form.alisTarihi, guncelFiyat: af, gecmis: [{ tarih: form.alisTarihi, deger: adet * af }] });
    setModal(null); bildir("Yatırım eklendi");
  }

  // ---- Tema & vurgu ----
  function toggleTheme() {
    setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), tema: (d.ayarlar?.tema === "koyu" ? "acik" : "koyu") } }));
  }

  // ---- Komut paleti (⌘K) ----
  const paletKomutlar = useMemo(() => {
    const navlar = TABS.map((t) => ({ ad: t.label, ipucu: "Sayfa", icon: t.icon, yap: () => setTab(t.id) }));
    const aksiyonlar = [
      { ad: "Yeni Gider", ipucu: "Ekle", icon: "arrowDown", yap: () => islemAc("gider") },
      { ad: "Yeni Gelir", ipucu: "Ekle", icon: "arrowUp", yap: () => islemAc("gelir") },
      { ad: "Yeni Abonelik", ipucu: "Ekle", icon: "repeat", yap: abonelikAc },
      { ad: "Yeni Yatırım", ipucu: "Ekle", icon: "trending", yap: yatirimAc },
      { ad: "Fiyatları Güncelle", ipucu: "Yatırım", icon: "refresh", yap: tumFiyatlariGuncelle },
      { ad: dark ? "Açık Tema" : "Koyu Tema", ipucu: "Görünüm", icon: dark ? "sun" : "moon", yap: toggleTheme },
      { ad: "Çıkış Yap", ipucu: "Oturum", icon: "logout", yap: onLogout },
    ];
    return [...aksiyonlar, ...navlar];
  }, [dark]); // eslint-disable-line
  const paletFiltreli = useMemo(() => {
    const q = paletQ.toLocaleLowerCase("tr");
    return q ? paletKomutlar.filter((k) => k.ad.toLocaleLowerCase("tr").includes(q)) : paletKomutlar;
  }, [paletQ, paletKomutlar]);
  function paletCalistir(k) { setPaletAcik(false); setPaletQ(""); k.yap(); }

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); setPaletAcik((v) => !v); setPaletQ(""); }
      else if (e.key === "Escape") { setPaletAcik(false); setBildirimAcik(false); setDonemAcik(false); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- Bildirimler (yaklaşan ödemeler) ----
  const yaklasan = useMemo(() => yaklasanOdemeler(findata, bugun(), (findata.ayarlar?.bildirimGun || 3)), [findata]);

  const ekleLabel = tab === "yatirim" ? "Varlık" : "İşlem";
  function ekleAc() { if (tab === "yatirim") yatirimAc(); else islemAc("gider"); }

  // ---- Net varlık kartı içeriği ----
  const fxSatir = findata.kurlar ? `$${(netDeger / findata.kurlar.usd).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} · €${(netDeger / findata.kurlar.eur).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}` : "";

  const ekranOrtak = { findata, fd, donem, setFindata, bildir };

  return (
    <div className="fa-app" data-theme={dark ? "dark" : undefined} style={{ "--accent": accent }}>
      {/* SIDEBAR (masaüstü) */}
      <aside className="fa-sb">
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "6px 8px 20px" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "#143A2B", fontWeight: 800, fontSize: 19 }}>₺</div>
          <div>
            <div className="serif" style={{ fontSize: 16, fontWeight: 600, color: "#F4F1E9" }}>FinansApp</div>
            <div style={{ fontSize: 11, color: "#8FAE9E" }}>{user.ad || user.username} · {isAdmin ? "Yönetici" : "Kullanıcı"}</div>
          </div>
        </div>
        <nav className="fa-nav" style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, overflowY: "auto" }}>
          {TABS.map((t) => (
            <button key={t.id} className={`fa-navbtn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              <Icon d={t.icon} size={18} style={{ flex: "none" }} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div style={{ padding: 13, borderRadius: 12, background: "var(--emerald2)", marginTop: 8 }}>
          <div style={{ fontSize: 10.5, color: "#8FAE9E", textTransform: "uppercase", letterSpacing: "0.07em" }}>Net Varlık</div>
          <div className="num" style={{ fontSize: 19, fontWeight: 600, color: "#E9D9B4", marginTop: 3 }}>{TL(netDeger)}</div>
          {fxSatir && <div className="num" style={{ fontSize: 10.5, color: "#8FAE9E" }}>{fxSatir}</div>}
        </div>
      </aside>

      {/* MAIN */}
      <main className="fa-main">
        <header className="fa-header">
          <div>
            <div style={{ fontSize: 12.5, color: "var(--ink3)" }}>{selamMetni()}, {user.ad?.split(" ")[0] || user.username} · {tarihUzun()}</div>
            <h1 className="serif" style={{ margin: "1px 0 0", fontSize: 24, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em" }}>{BASLIK[tab]}</h1>
          </div>
          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
            {/* Bildirimler */}
            <div style={{ position: "relative" }}>
              <button onClick={() => { setBildirimAcik((v) => !v); setDonemAcik(false); }} title="Bildirimler" className="fa-ibtn fa-btn">
                <Icon d="bell" size={17} />
                {yaklasan.length > 0 && <span style={{ position: "absolute", top: 5, right: 6, minWidth: 15, height: 15, padding: "0 3px", borderRadius: 99, background: "var(--neg)", color: "#fff", fontSize: 9.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>{yaklasan.length}</span>}
              </button>
              {bildirimAcik && (
                <div className="fa-page" style={{ position: "absolute", top: 46, right: 0, zIndex: 300, width: 340, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "0 18px 50px rgba(0,0,0,0.25)", overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 18px", borderBottom: "1px solid var(--line)" }}>
                    <span className="serif" style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>Bildirimler</span>
                    <span style={{ fontSize: 11.5, color: "var(--ink3)" }}>{yaklasan.length} yeni</span>
                  </div>
                  <div style={{ maxHeight: 360, overflowY: "auto" }}>
                    {!yaklasan.length && <p style={{ margin: 0, padding: "30px 18px", textAlign: "center", fontSize: 13, color: "var(--ink3)" }}>Yeni bildirim yok 🎉</p>}
                    {yaklasan.map((y, i) => (
                      <div key={i} style={{ display: "flex", gap: 12, padding: "13px 18px", borderBottom: "1px solid var(--line)", alignItems: "flex-start" }}>
                        <div style={{ width: 32, height: 32, borderRadius: 9, flex: "none", background: "var(--chip-amber)", color: "var(--gold-t)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon d="calendar" size={16} /></div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{y.ad}</div>
                          <div style={{ fontSize: 11.5, color: "var(--ink3)", marginTop: 1 }}>{y.gun === 0 ? "Bugün" : `${y.gun} gün sonra`} · {TL(y.miktar)} · {y.tip}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* Komut paleti */}
            <button onClick={() => { setPaletAcik(true); setPaletQ(""); }} title="Komut paleti (⌘K)" className="fa-deskonly fa-btn" style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", borderRadius: 9, border: "1px solid var(--border2)", background: "var(--card)", color: "var(--ink3)", cursor: "pointer", fontSize: 12.5 }}>
              <Icon d="search" size={15} />
              <span style={{ border: "1px solid var(--border2)", borderRadius: 5, padding: "1px 6px", fontFamily: "'IBM Plex Mono',monospace" }}>⌘K</span>
            </button>
            {/* Tema */}
            <button onClick={toggleTheme} title="Tema değiştir" className="fa-ibtn fa-btn"><Icon d={dark ? "sun" : "moon"} size={17} /></button>
            {/* Dönem */}
            <div className="fa-deskonly" style={{ position: "relative" }}>
              <button onClick={() => { setDonemAcik((v) => !v); setBildirimAcik(false); }} className="fa-btn" style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 9, border: "1px solid var(--border2)", background: "var(--card)", fontSize: 13, color: "var(--ink2)", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>
                {DONEMLER.find((d) => d.id === donem)?.ad}<Icon d="chevronDown" size={12} />
              </button>
              {donemAcik && (
                <div className="fa-page" style={{ position: "absolute", top: 44, right: 0, zIndex: 300, width: 170, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 11, boxShadow: "0 14px 40px rgba(0,0,0,0.2)", overflow: "hidden", padding: 5 }}>
                  {DONEMLER.map((d) => (
                    <div key={d.id} onClick={() => { setDonem(d.id); setDonemAcik(false); }} style={{ padding: "9px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer", color: donem === d.id ? "var(--ink)" : "var(--ink2)", fontWeight: donem === d.id ? 600 : 400, background: donem === d.id ? "var(--track)" : "transparent" }}>{d.ad}</div>
                  ))}
                </div>
              )}
            </div>
            {/* Ekle */}
            <button onClick={ekleAc} className="fa-btn" style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 9, border: "none", background: "var(--emerald)", color: "#E9D9B4", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
              <Icon d="plus" size={14} width={2.2} />{ekleLabel}
            </button>
          </div>
        </header>

        <div className="fa-scr">
          <div className="fa-page" key={tab} style={{ maxWidth: 1120, margin: "0 auto" }}>
            {tab === "panel" && <Panel {...ekranOrtak} donemAdi={DONEMLER.find((d) => d.id === donem)?.ad} toplamGelir={toplamGelir} toplamGider={toplamGider} toplamAbonelik={toplamAbonelik} nakit={nakit} netDeger={netDeger} yatirimDeger={yatirimDeger} yatirimKar={yatirimKar} guncelDeger={guncelDeger} onHizliEkle={ekle} kategoriOgren={kategoriOgren} onGit={setTab} />}
            {tab === "islemler" && <Islemler findata={findata} fd={fd} donem={donem} bildir={bildir} onSil={sil} onDuzenle={duzenleIslem} onGelirEkle={() => islemAc("gelir")} onGiderEkle={() => islemAc("gider")} onAbonelikEkle={abonelikAc} />}
            {tab === "hesap" && <Hesaplar findata={findata} setFindata={setFindata} bildir={bildir} />}
            {tab === "yatirim" && <Yatirimlar findata={findata} setFindata={setFindata} guncelDeger={guncelDeger} yatirimDeger={yatirimDeger} yatirimKar={yatirimKar} yatirimMaliyet={yatirimMaliyet} onEkle={yatirimAc} onSil={(id) => sil("yatirim", id)} onDuzenle={duzenleYatirim} onGuncelle={tumFiyatlariGuncelle} guncelleniyor={fiyatGuncelleniyor} />}
            {tab === "asistan" && <Asistan findata={findata} guncelDeger={guncelDeger} toplamGelir={toplamGelirTum} toplamGider={toplamGiderTum} toplamAbonelik={toplamAbonelik} yatirimDeger={yatirimDeger} netDeger={netDeger} bildir={bildir} />}
            {tab === "planlama" && <Planlama findata={findata} setFindata={setFindata} bildir={bildir} />}
            {tab === "analiz" && <Analiz findata={findata} fd={fd} donem={donem} donemAdi={DONEMLER.find((d) => d.id === donem)?.ad} toplamGelir={toplamGelir} />}
            {tab === "takvim" && <Takvim findata={findata} onDuzenle={duzenleIslem} />}
            {tab === "hane" && <Hane users={users} findata={findata} />}
            {tab === "veri" && <Veri findata={findata} setFindata={setFindata} user={user} bildir={bildir} ekle={ekle} kategoriOgren={kategoriOgren} toplamGelir={toplamGelirTum} toplamGider={toplamGiderTum} toplamAbonelik={toplamAbonelik} yatirimDeger={yatirimDeger} yatirimKar={yatirimKar} netDeger={netDeger} guncelDeger={guncelDeger} />}
            {tab === "ayar" && <Ayarlar findata={findata} setFindata={setFindata} bildir={bildir} user={user} users={users} onUsersChange={onUsersChange} onLogout={onLogout} />}
          </div>
        </div>
      </main>

      {/* Toast */}
      {bildirim && (
        <div className="fa-page" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 350, background: bildirim.tip === "err" ? "var(--neg)" : "var(--emerald)", color: bildirim.tip === "err" ? "#fff" : "#E9D9B4", padding: "12px 22px", borderRadius: 12, fontSize: 13.5, fontWeight: 500, boxShadow: "0 10px 30px rgba(0,0,0,0.3)", display: "flex", alignItems: "center", gap: 12, maxWidth: "calc(100vw - 32px)" }}>
          <span>{bildirim.msg}</span>
          {bildirim.action && (
            <button onClick={bildirim.action.onClick} className="fa-btn" style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", fontWeight: 700, fontSize: 12.5, padding: "4px 9px", borderRadius: 7, cursor: "pointer", whiteSpace: "nowrap" }}>{bildirim.action.label}</button>
          )}
        </div>
      )}

      {/* Alt menü (mobil) */}
      <nav className="fa-bn">
        {MOBIL_ANA.map((id) => {
          const t = TABS.find((x) => x.id === id);
          return (
            <button key={id} className={`fa-tabbtn ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
              <Icon d={t.icon} size={21} />
              <span>{t.label}</span>
            </button>
          );
        })}
        <button className={`fa-tabbtn ${!MOBIL_ANA.includes(tab) ? "active" : ""}`} onClick={() => setDaha(true)}>
          <Icon d="settings" size={21} /><span>Menü</span>
        </button>
      </nav>

      {/* Mobil "Menü" alt sayfası */}
      {daha && (
        <div onClick={() => setDaha(false)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(8,14,11,0.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} className="fa-page" style={{ width: "100%", background: "var(--card)", borderRadius: "20px 20px 0 0", border: "1px solid var(--border)", padding: "16px 14px calc(20px + env(safe-area-inset-bottom))", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ width: 40, height: 4, borderRadius: 99, background: "var(--border2)", margin: "0 auto 16px" }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {TABS.map((t) => (
                <button key={t.id} onClick={() => { setTab(t.id); setDaha(false); }} className="fa-btn" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, padding: "16px 6px", borderRadius: 12, border: "1px solid var(--border)", background: tab === t.id ? "var(--track)" : "var(--card2)", color: tab === t.id ? "var(--accent)" : "var(--ink2)", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
                  <Icon d={t.icon} size={22} /><span>{t.label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => { setDaha(false); onLogout(); }} className="fa-btn" style={{ width: "100%", marginTop: 14, padding: 13, borderRadius: 11, border: "1px solid var(--neg)", background: "transparent", color: "var(--neg)", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>Çıkış Yap</button>
          </div>
        </div>
      )}

      {/* Komut paleti */}
      {paletAcik && (
        <div onClick={() => setPaletAcik(false)} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(8,14,11,0.5)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "14vh" }}>
          <div onClick={(e) => e.stopPropagation()} className="fa-page" style={{ width: "100%", maxWidth: 520, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.35)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "16px 18px", borderBottom: "1px solid var(--line)" }}>
              <Icon d="search" size={18} stroke="var(--ink3)" />
              <input autoFocus value={paletQ} onChange={(e) => setPaletQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && paletFiltreli[0]) paletCalistir(paletFiltreli[0]); }} placeholder="Komut ara veya sayfaya git…" style={{ flex: 1, border: "none", background: "transparent", outline: "none", color: "var(--ink)", fontSize: 15, fontFamily: "inherit" }} />
              <span style={{ fontSize: 10.5, color: "var(--ink3)", border: "1px solid var(--border2)", borderRadius: 6, padding: "2px 7px" }}>ESC</span>
            </div>
            <div style={{ padding: 8, maxHeight: "50vh", overflowY: "auto" }}>
              {!paletFiltreli.length && <p style={{ margin: 0, padding: "24px", textAlign: "center", color: "var(--ink3)", fontSize: 13 }}>Sonuç yok</p>}
              {paletFiltreli.map((k, i) => (
                <div key={i} onClick={() => paletCalistir(k)} className="fa-btn" style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 12px", borderRadius: 10, cursor: "pointer" }} onMouseDown={(e) => e.preventDefault()}>
                  <Icon d={k.icon} size={17} stroke="var(--ink2)" />
                  <span style={{ flex: 1, fontSize: 14, color: "var(--ink)", fontWeight: 500 }}>{k.ad}</span>
                  <span style={{ fontSize: 11.5, color: "var(--ink3)" }}>{k.ipucu}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modallar */}
      {modal === "islem" && <IslemModal mod="islem" form={form} setForm={setForm} kategorilerGelir={gelirKategorileri(findata)} kategorilerGider={giderKategorileri(findata)} hesaplar={findata.hesaplar} hafiza={findata.kategoriHafiza} onClose={() => setModal(null)} onKaydet={() => kaydetIslem(form.tip)} />}
      {modal === "abonelik" && <IslemModal mod="abonelik" form={form} setForm={setForm} kategorilerGider={["Eğlence", "Müzik", "Yazılım", "Sağlık", "Eğitim", "Haberler", "Diğer"]} onClose={() => setModal(null)} onKaydet={() => kaydetIslem("abonelik")} />}
      {modal === "yatirim" && <YatirimModal form={form} setForm={setForm} onClose={() => setModal(null)} onKaydet={kaydetYatirim} />}
    </div>
  );
}
