// ============================================================
// FinansApp — ana uygulama (kimlik doğrulama + kabuk + sekmeler)
// Zümrüt & Altın tasarımı, açık/koyu tema
// ============================================================
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { V } from "./lib/constants.js";
import { uid, bugun, TL, sayiCevir } from "./lib/format.js";
import { syncYukle, syncDurum, syncBagliMi, pbGiris, pbKayit, pbCikis, pbFindataCek, pbFindataGonder, pbHaneBul } from "./lib/sync.js";
import { createPersister } from "./lib/persistence.js";
import { journalGet, journalMerge, journalAck, journalClear } from "./lib/journal.js";

// Write-ahead journal TTL: terk edilmiş/çok eski pending replay edilmez (WAL, kalıcı kopya değil).
const WAJ_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün

// Refresh sonrası bulunulan view'da kal: YALNIZ güvenli navigasyon (tab id) sessionStorage'da,
// user-namespaced. Finansal veri/ID YAZILMAZ. WAL (finansapp:waj:) ile ayrı key; logout'ta temizlenir.
const NAV_KEY = (uid) => `finansapp:nav:${uid || "anon"}`;
function navKaydet(uid, tab) { try { sessionStorage.setItem(NAV_KEY(uid), tab); } catch { /* yoksay */ } }
function navOku(uid) { try { return sessionStorage.getItem(NAV_KEY(uid)); } catch { return null; } }
function navTemizle(uid) { try { sessionStorage.removeItem(NAV_KEY(uid)); } catch { /* yoksay */ } }
import { oturumBaslat, oturumSurdur, oturumDokun, oturumTemizle, oturumDurum, IDLE_VARSAYILAN_DK, UYARI_ESIK_MS } from "./lib/oturum.js";
import { bosVeri, tekrarlariUret, kurallariUygula, giderKategorileri, gelirKategorileri, hesabaUygula, hedefKatkilariUret, yaklasanOdemeler, donemFiltre, netGecmisGuncelle } from "./lib/finance.js";
import { maasGeliriUret, maasCiftGuard } from "./lib/maas.js";
import { fiyatCek, configureAI, aiBildirimAyarla } from "./lib/ai.js";
import { tryeCevir } from "./lib/parabirimi.js";
import { bildirimOzeti } from "./lib/bildirim.js";
import { SURUM, sonSurumKontrol, SURUM_URL, BUILD_SHA, buildKimligi, swKontrolluMu } from "./lib/surum.js";
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

// Idle timeout: kapanmadan ~1 dk önce çıkan uyarı modalı.
function OturumUyariModal({ onDevam, onCikis }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(8,14,11,0.6)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="fa-page" style={{ width: "100%", maxWidth: 380, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 26, textAlign: "center", boxShadow: "0 24px 60px rgba(0,0,0,0.4)" }}>
        <Icon d="lock" size={30} stroke="var(--accent)" width={1.6} style={{ marginBottom: 12 }} />
        <h3 className="serif" style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>Oturumun kapanmak üzere</h3>
        <p style={{ margin: "0 0 20px", fontSize: 13.5, color: "var(--ink3)", lineHeight: 1.6 }}>Güvenlik için hareketsizlik nedeniyle çok yakında çıkış yapılacak. Devam etmek ister misin?</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCikis} className="fa-btn" style={{ flex: 1, padding: 12, borderRadius: 11, border: "1px solid var(--neg)", background: "transparent", color: "var(--neg)", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>Çıkış Yap</button>
          <button onClick={onDevam} className="fa-btn" style={{ flex: 1, padding: 12, borderRadius: 11, border: "none", background: "var(--emerald)", color: "#E9D9B4", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>Devam Et</button>
        </div>
      </div>
    </div>
  );
}

// Header senkron durum göstergesi (saf DB — verinin buluta gittiği güvencesi).
function SenkronRozet({ durum }) {
  const harita = {
    kaydediliyor: { renk: "var(--ink3)", nokta: "var(--ink3)", metin: "Kaydediliyor…" },
    kaydedildi: { renk: "var(--pos)", nokta: "var(--pos)", metin: "Kaydedildi" },
    hata: { renk: "var(--neg)", nokta: "var(--neg)", metin: "Bağlantı yok" },
    catisma: { renk: "var(--neg)", nokta: "var(--neg)", metin: "Çakışma" },
  };
  const s = harita[durum];
  if (!s) return null; // "bekliyor" → gösterme
  return (
    <div className="fa-deskonly" title={durum === "hata" ? "Sunucuya ulaşılamıyor — yeniden deneniyor" : durum === "catisma" ? "Sunucuda daha yeni bir sürüm var — değişikliklerin yerelde korunuyor" : s.metin}
      style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 9, border: "1px solid var(--border2)", background: "var(--card)", fontSize: 12, color: s.renk, whiteSpace: "nowrap" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.nokta, flex: "none", animation: durum === "kaydediliyor" ? "obfade 1s infinite alternate" : "none" }} />
      {s.metin}
    </div>
  );
}

export default function FinansAppPro() {
  const [yukleniyor, setYukleniyor] = useState(true);
  const [aktif, setAktif] = useState(null);
  const [findata, setFindataState] = useState(null);
  const [kilitli, setKilitli] = useState(false);
  const [tab, setTab] = useState("panel");
  const [temaHint, setTemaHint] = useState("acik"); // giriş ekranı için son bilinen tema
  const [senkron, setSenkron] = useState("bekliyor"); // bekliyor|kaydediliyor|kaydedildi|hata
  const [oturumUyari, setOturumUyari] = useState(false); // idle timeout uyarı modalı

  // Idle süresi kullanıcı ayarından (yoksa varsayılan). Ayarlar → Güvenlik'ten değişir.
  const idleDk = findata?.ayarlar?.oturumIdleDk ?? IDLE_VARSAYILAN_DK;

  // ---- Açılış: eski local-mod kalıntılarını temizle + PB token'ından oturumu geri yükle ----
  useEffect(() => {
    // Temiz başlangıç: DB-only'de finansal veri cihazda tutulmaz. Eski yerel
    // kullanıcı listesi, açık-oturum blob'u ve per-user findata önbelleği silinir.
    try {
      localStorage.removeItem("finansapp:users");
      localStorage.removeItem("finansapp:aktif");
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("finansapp:findata:")) localStorage.removeItem(k);
      }
    } catch { /* yoksay */ }

    syncYukle(); // kayıtlı PB oturumunu (token) yükle
    (async () => {
      try {
        try { const th = localStorage.getItem("finansapp:tema"); if (th) setTemaHint(th); } catch { /* yoksay */ }
        if (!syncBagliMi()) return; // token yok → giriş ekranı

        // Kayıtlı idle tercihiyle süre kontrolü (findata henüz yüklenmedi)
        const raw = (() => { try { return localStorage.getItem("finansapp:idleDk"); } catch { return null; } })();
        const idleKayitli = raw == null ? IDLE_VARSAYILAN_DK : Number(raw);
        const d = oturumDurum(idleKayitli);
        if (d.sebep === "idle" || d.sebep === "mutlak") { pbCikis(); oturumTemizle(); return; }

        // Token geçerli → veriyi DB'den çek, oturumu sürdür
        try { await pbHaneBul(); } catch { /* kişisel devam */ }
        const b = await pbFindataCek(); // 401 ise fırlatır → çıkışa düşülür
        const { veri, pendingVar, catisma } = oturumVeriHazirla(b); // bind(revision) + replay/çakışma-surface
        const email = syncDurum().email || "";
        const u = { username: email, ad: email.split("@")[0], bulut: true };
        oturumSurdur();
        girisTamamla(u, veri, !b?.data, pendingVar, catisma);
      } catch { pbCikis(); oturumTemizle(); /* token geçersiz/expired → giriş ekranı */ }
      finally { setYukleniyor(false); }
    })();
  }, []);

  useEffect(() => {
    configureAI(findata?.ayarlar || {});
  }, [findata?.ayarlar?.apiKey, findata?.ayarlar?.model, findata?.ayarlar?.aiSaglayici, findata?.ayarlar?.proxyMod, findata?.ayarlar?.yerelAdres, findata?.ayarlar?.yerelModel]);

  // tema değişince giriş ekranı ipucunu da güncelle
  useEffect(() => {
    const tm = findata?.ayarlar?.tema;
    if (tm) { setTemaHint(tm); try { localStorage.setItem("finansapp:tema", tm); } catch { /* yoksay */ } }
  }, [findata?.ayarlar?.tema]);

  // Idle tercihini localStorage'a yansıt (yenilemede oturum-restore doğru süreyi bilsin).
  useEffect(() => {
    const v = findata?.ayarlar?.oturumIdleDk;
    try {
      if (v == null) localStorage.removeItem("finansapp:idleDk");
      else localStorage.setItem("finansapp:idleDk", String(v));
    } catch { /* yoksay */ }
  }, [findata?.ayarlar?.oturumIdleDk]);

  // Veriyi hazırla (tekrarlar + hedef katkıları) ve oturumu aç. DB tek kaynak:
  // türetilmiş değişiklik veya boş DB varsa buluta yazılır, yerele yazılmaz.
  function girisTamamla(u, veri, ilkBulutGonder, pendingVar = false, catisma = false) {
    let { data, degisti } = tekrarlariUret(veri);
    const mg = maasGeliriUret(data, bugun()); // aylık maaş gelir satırlarını türet
    data = mg.data;
    degisti = degisti || mg.degisti;
    const cg = maasCiftGuard(data); // elle-gelir + maaş modeli çift-sayım guard'ı
    data = cg.data;
    degisti = degisti || cg.degisti;
    const hk = hedefKatkilariUret(data);
    data = hk.data;
    degisti = degisti || hk.degisti;
    // TEK yazım noktası: türetilmiş değişiklik / ilk-gönderim / aynı-revision recovery → persister
    // üzerinden CAS (syncedRevision base, single-flight, journal). Doğrudan PATCH DEĞİL.
    // ÇAKIŞMA'da (server ilerlemiş) hiçbir otomatik yazım yapılmaz → server + WAL korunur.
    if (!catisma && (degisti || ilkBulutGonder || pendingVar) && syncBagliMi()) {
      const patch = {}; for (const k in data) patch[k] = data[k];
      persister.schedule(data, patch);
    }
    setAktif(u);
    setFindataState(data);
    setKilitli(!!data.ayarlar?.pin);
    // Refresh sonrası bulunulan ana view'da kal; geçersiz/stale/başka-kullanıcı → Dashboard fallback.
    const kayitliTab = navOku(syncDurum().userId);
    setTab(TABS.some((t) => t.id === kayitliTab) ? kayitliTab : "panel");
    return true;
  }

  // Gerçek çıkış: PB oturumunu (token) ve oturum sayaçlarını temizle.
  function cikisYap() {
    navTemizle(syncDurum().userId); // eski private view başka kullanıcıya taşınmasın (pbCikis'ten ÖNCE, uid dururken)
    pbCikis();
    oturumTemizle();
    persister._reset(); // controller durumunu sıfırla (journal namespace'li kalır → başka kullanıcıya replay olmaz)
    setAktif(null);
    setFindataState(null);
    setSenkron("bekliyor");
    setOturumUyari(false);
  }

  // DB-only giriş/kayıt. Hata olursa fırlatır; Login mesajı gösterir (bağlantı
  // hatası ile kimlik hatası pbGiris/pbFetch mesajlarıyla ayrışır).
  async function oturumAc(email) {
    const e = (email || "").trim();
    try { await pbHaneBul(); } catch { /* kişisel devam */ }
    const b = await pbFindataCek();
    const bulutBos = !b?.data;
    const { veri, pendingVar, catisma } = oturumVeriHazirla(b); // bind(revision) + replay/çakışma-surface
    oturumBaslat();
    return girisTamamla({ username: e, ad: e.split("@")[0], bulut: true }, veri, bulutBos, pendingVar, catisma);
  }
  async function girisYap(email, sifre) {
    await pbGiris(syncDurum().url, (email || "").trim(), sifre);
    return oturumAc(email);
  }
  async function kayitOl(email, sifre) {
    await pbKayit(syncDurum().url, (email || "").trim(), sifre); // kayıt + otomatik giriş
    return oturumAc(email);
  }

  // Merkezi persistence controller — debounce + monotonik rev + single-flight + trailing
  // + stale-guard + write-ahead journal (crash/reload güvenliği). Tek örnek (ref).
  const persisterRef = useRef(null);
  if (!persisterRef.current) {
    persisterRef.current = createPersister({
      send: pbFindataGonder,
      journal: { merge: journalMerge, ack: journalAck, clear: journalClear, get: journalGet },
      // ACK sonrası ("kaydedildi") SW güncelleme yöneticisine "artık temiz" nudge'ı ver →
      // pending yüzünden ertelenmiş bir reload varsa güvenle uygulanır (Step 5).
      onStatus: (s) => { setSenkron(s); if (s === "kaydedildi" && typeof window !== "undefined") window.__finansappSwNudge?.(); },
    });
  }
  const persister = persisterRef.current;

  // SW güncelleme guard'ı: pencereye kaydedilmemiş-değişiklik durumunu bildir.
  // main.jsx controllerchange reload'unu kirliyken (pending/çakışma) erteler.
  // Ayrıca salt-okunur build+sync teşhisini pencereye ver (Ayarlar/Hakkında + tanı).
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.__finansappKirli = () => persister.hasUnsaved();
    window.__finansappBuild = buildKimligi(); // STATİK build kimliği (token/veri YOK)
    // Canlı tanı: statik kimlik + o anki swControlled + sync durumu (stale-tab teşhisi).
    window.__finansappTani = () => ({ ...buildKimligi(), swControlled: swKontrolluMu(), sync: persister.getDiagnostics() });
    return () => { window.__finansappKirli = undefined; window.__finansappTani = undefined; };
  }, [persister]);

  // Oturum verisini hazırla: persister'ı bağla + write-ahead journal replay. Server
  // değişmediyse pending mutation'ı kurtar; başka cihaz/oturum ilerlettiyse stale local
  // snapshot ile OVERWRITE YAPMA (conflict → server kazanır, sessiz değil).
  function oturumVeriHazirla(b) {
    const serverData = b?.data ? { ...bosVeri(), ...b.data } : bosVeri();
    const serverRev = Number.isInteger(b?.revision) ? b.revision : 0;
    const uid = syncDurum().userId;
    persister.bind(uid, serverRev, b?.updated || null); // CAS base = server revision
    let veri = serverData;
    let pendingVar = false; // yeniden persist gerekiyor mu? (yalnız aynı-revision recovery)
    let catisma = false; // server ilerlemiş = çakışma (otomatik merge/write yok)
    const j = journalGet(uid);
    if (j) {
      const eski = j.ts && Date.now() - j.ts > WAJ_TTL_MS; // terk edilmiş/çok eski pending (TTL)
      if (eski) {
        journalClear(uid); // TTL politikası → eski pending'i replay etme (güvenli temizlik)
      } else if (serverRev === j.baseUpdated) {
        veri = { ...serverData, ...j.patch }; // server AYNI revizyon → pending'i uygula (recovery)
        pendingVar = true; // yazımı girisTamamla TEK noktadan yapar (setTimeout sıra-yarışı yok)
      } else {
        // Server İLERLEMİŞ (base uyuşmuyor) = ÇAKIŞMA. Bu increment'te OTOMATİK MERGE/WRITE YOK:
        // {...server, ...patch} aynı top-level alanda (giderler/gelirler) server item'larını
        // silerdi → lost-update. Güvenli: server canonical GÖSTERİLİR, WAL KORUNUR (SİLİNMEZ),
        // otomatik schedule YOK, çakışma yüzeylenir. persister.catismaGir() KİLİDİ açar →
        // bind server rev'ine yapılsa bile derivasyon/otomatik setFindata çakışmayı sessizce
        // ezip base'i eşleşen bir write ile kaydedemez. Kullanıcı çözer (item-ID merge ayrı increment).
        veri = serverData;
        catisma = true;
        persister.catismaGir();
      }
    }
    return { veri, pendingVar, catisma };
  }

  // Saf DB: değişiklik yalnız bellekte + persister (debounce/journal/single-flight) ile buluta.
  // Journal'a yalnız DEĞİŞEN top-level alanlar (delta) yazılır (tüm snapshot değil).
  const setFindata = useCallback((updater) => {
    setFindataState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (syncBagliMi()) {
        const patch = {};
        if (prev) { for (const k in next) if (next[k] !== prev[k]) patch[k] = next[k]; }
        else Object.assign(patch, next);
        persister.schedule(next, patch);
      }
      return next;
    });
  }, [persister]);

  // "Şimdi senkronla" (Ayarlar → Bulut): DOĞRUDAN pbFindataGonder YOK (stale local'ı taze
  // revision'a base'leyip server'ı ezerdi). Persister'ın authoritative syncedRevision base'i
  // kullanılır: retry() hata durumunu, flush() bekleyen pending'i gönderir; stale ise CAS 409 →
  // "catisma" (server + WAL korunur, otomatik merge/write YOK, çakışma yüzeylenir).
  const senkronlaSimdi = useCallback(() => { persister.retry(); persister.flush(); }, [persister]);

  // Hata sonrası yeniden dene: pencere odağı + online + periyodik (persister status-guard'lı).
  useEffect(() => {
    if (!aktif) return undefined;
    const retry = () => persister.retry();
    window.addEventListener("focus", retry);
    window.addEventListener("online", retry);
    const iv = setInterval(retry, 20000);
    return () => { window.removeEventListener("focus", retry); window.removeEventListener("online", retry); clearInterval(iv); };
  }, [aktif, persister]);

  // CAS çakışması (409 → "catisma"): server daha yeni revision'da. Bu increment'te OTOMATİK
  // reconcile/merge/write YOK (journal yalnız top-level delta tutar; aynı alanı iki client
  // değiştirirse {...server, ...patch} server item'larını silerdi → lost-update). Güvenli
  // semantik: server canonical KORUNUR, WAL KORUNUR (persister journal'ı ACK'siz silmez),
  // kör retry/auto-merge YOK, çakışma UI'da yüzeylenir (banner + rozet). Kullanıcı çözer;
  // gerçek item-ID bazlı 3-way merge ayrı bir increment. (Otomatik reconcile effect'i kaldırıldı.)

  // Bulunulan ana view'ı (tab) güvenli şekilde sakla → refresh sonrası aynı view'da kal.
  useEffect(() => {
    if (!aktif) return;
    navKaydet(syncDurum().userId, tab);
  }, [tab, aktif]);

  // NOT: Durability write-ahead journal ile sağlanır (load-path'te conflict-check'li recovery).
  // Eager unload/hidden flush BİLEREK yok: debounce (1200ms) arka plan sekmelerde de ateşlenir;
  // erken kapanışta journal kurtarır. Kör unload-flush, offline-pending + başka-cihaz durumunda
  // server'ı ezebilirdi (multi-device lost-update) — kaldırıldı. persister.flush() metodu
  // (conflict-check'siz) yalnız explicit/güvenli bağlamlar için mevcut; lifecycle'a bağlı değil.

  // Oturum zaman aşımı: etkileşim sayacı + periyodik kontrol + kapanış uyarısı.
  useEffect(() => {
    if (!aktif) return undefined;
    let sonDokun = 0;
    const dokun = () => {
      const t = Date.now();
      if (t - sonDokun > 15000) { sonDokun = t; oturumDokun(t); }
      setOturumUyari(false); // etkileşim uyarıyı kapatır (zaten false ise no-op)
    };
    const olaylar = ["mousedown", "keydown", "touchstart"];
    olaylar.forEach((ev) => window.addEventListener(ev, dokun));
    const iv = setInterval(() => {
      const durum = oturumDurum(idleDk);
      if (!durum.gecerli) { cikisYap(); return; }
      setOturumUyari(durum.kalanMs <= UYARI_ESIK_MS);
    }, 15000);
    return () => { olaylar.forEach((ev) => window.removeEventListener(ev, dokun)); clearInterval(iv); };
  }, [aktif, idleDk]);

  // Ortak hane modunda, uygulamaya geri dönünce (pencere odağı) en güncel ortak
  // veriyi çek; böylece diğer üyelerin değişiklikleri görünür. Kişisel modda gerek
  // yok. Sessiz güncelleme (setFindataState) — yazıma yol açmaz, eko döngüsü olmaz.
  useEffect(() => {
    if (!aktif) return undefined;
    let iptal = false;
    const cek = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (!syncBagliMi() || !syncDurum().haneId) return;
      try {
        const b = await pbFindataCek();
        // Bekleyen (ACK edilmemiş) yerel değişiklik varken bulut merge YAPMA → pending'i ezmez (R3).
        if (!iptal && b?.data && !persister.hasPending()) setFindataState((prev) => ({ ...prev, ...b.data }));
      } catch { /* çevrimdışı */ }
    };
    window.addEventListener("focus", cek);
    document.addEventListener("visibilitychange", cek);
    return () => { iptal = true; window.removeEventListener("focus", cek); document.removeEventListener("visibilitychange", cek); };
  }, [aktif]);

  const dark = (findata?.ayarlar?.tema || temaHint) === "koyu";

  const uyariModali = oturumUyari ? (
    <OturumUyariModal onDevam={() => { oturumDokun(); setOturumUyari(false); }} onCikis={cikisYap} />
  ) : null;

  if (yukleniyor)
    return <ThemeWrap dark={temaHint === "koyu"}><div style={{ minHeight: "100vh", background: "var(--emerald)", color: V.sage, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>Yükleniyor…</div></ThemeWrap>;
  if (!aktif) return <ThemeWrap dark={temaHint === "koyu"}><Login onLogin={girisYap} onRegister={kayitOl} /></ThemeWrap>;
  if (kilitli) return <ThemeWrap dark={dark}><PinGate dogruPin={findata.ayarlar.pin} onAc={() => setKilitli(false)} onCikis={cikisYap} />{uyariModali}</ThemeWrap>;
  if (!findata.ayarlar?.kuruldu) return <ThemeWrap dark={dark}><Onboarding user={aktif} setFindata={setFindata} />{uyariModali}</ThemeWrap>;
  return (
    <>
      <Uygulama
        user={aktif}
        findata={findata}
        setFindata={setFindata}
        tab={tab}
        setTab={setTab}
        dark={dark}
        onLogout={cikisYap}
        senkron={senkron}
        senkronlaSimdi={senkronlaSimdi}
      />
      {uyariModali}
    </>
  );
}

const TABS = [
  { id: "panel", icon: "home", label: "Panel" },
  { id: "islemler", icon: "repeat", label: "İşlemler" },
  { id: "hesap", icon: "wallet", label: "Hesaplar" },
  { id: "yatirim", icon: "trending", label: "Yatırım" },
  { id: "planlama", icon: "target", label: "Bütçe & Maaş" },
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

function Uygulama({ user, findata, setFindata, tab, setTab, dark, onLogout, senkron, senkronlaSimdi }) {
  const [modal, setModal] = useState(null);
  const [guncelleme, setGuncelleme] = useState(null); // yeni sürüm bilgisi
  const [form, setForm] = useState({});
  const [fiyatGuncelleniyor, setFiyatGuncelleniyor] = useState(false);
  const [bildirim, setBildirim] = useState(null);
  const [daha, setDaha] = useState(false);
  const [donem, setDonem] = useState("buAy");
  const [islemFiltre, setIslemFiltre] = useState(null); // Panel→İşlemler tek-seferlik "İncele" odağı
  const [donemAcik, setDonemAcik] = useState(false);
  const [bildirimAcik, setBildirimAcik] = useState(false);
  const [paletAcik, setPaletAcik] = useState(false);
  const [paletQ, setPaletQ] = useState("");

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
  // Net nakit/varlık: HESAP VARSA gerçek bakiyelerden (varlık − kart borcu);
  // hesap yoksa eski akış modeline (gelir − gider) düşülür. Böylece ekstreden
  // gelen ama başka hesaba aktarılan para "elimde varmış" gibi görünmez.
  const hesapVarlik = (findata.hesaplar || []).filter((h) => h.tip !== "kart").reduce((s, h) => s + (+h.bakiye || 0), 0);
  const hesapBorc = (findata.hesaplar || []).filter((h) => h.tip === "kart").reduce((s, h) => s + (+h.bakiye || 0), 0);
  const hesapNet = hesapVarlik - hesapBorc;
  const hesapVarMi = (findata.hesaplar || []).length > 0;
  const nakitTum = hesapVarMi ? hesapNet : toplamGelirTum - toplamGiderTum - toplamAbonelik;
  const netDeger = nakitTum + yatirimDeger;

  // Net varlık geçmişini günlük besle (grafik zamanla dolsun) — açılışta bir kez
  const netKaydedildi = useRef(false);
  useEffect(() => {
    if (netKaydedildi.current) return;
    netKaydedildi.current = true;
    setFindata((d) => {
      const ng = netGecmisGuncelle(d.netGecmis, netDeger, bugun());
      return ng === (d.netGecmis || []) ? d : { ...d, netGecmis: ng };
    });
  }, []);

  // Yeni sürüm kontrolü (açılışta bir kez; çevrimdışıysa sessiz)
  useEffect(() => {
    let iptal = false;
    sonSurumKontrol().then((r) => { if (!iptal && r?.guncellemeVar) setGuncelleme(r); });
    return () => { iptal = true; };
  }, []);

  // ---- Döneme göre filtrelenmiş veriler ----
  const fd = useMemo(() => donemFiltre(findata, donem, bugun()), [findata, donem]);
  const toplamGelir = fd.gelirler.reduce((s, x) => s + x.miktar, 0);
  const toplamGider = fd.giderler.reduce((s, x) => s + x.miktar, 0);
  // "Net Nakit" kartı: hesap varsa gerçek bakiye, yoksa dönem akışı
  const nakit = hesapVarMi ? hesapNet : toplamGelir - toplamGider - toplamAbonelik;

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
    const satirlar = bildirimOzeti(findata, t, ay.bildirimGun || 3);
    if (satirlar.length) {
      try {
        new Notification("FinansApp", { body: satirlar.join("\n"), icon: "/pwa-192.png" });
      } catch { /* yoksay */ }
      setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), sonBildirim: t } }));
    }
  }, []); // eslint-disable-line

  // ---- İşlem modalı (gelir/gider tek modal, tip değiştirilebilir) ----
  function islemAc(tip = "gider") {
    // Hesap modelinde işlem bir hesaba bağlanmalı ki bakiyeyi (ve net varlığı)
    // etkilesin. Varsayılan: ilk vadesiz/nakit hesap (modalde değiştirilebilir).
    const ilkHesap = (findata.hesaplar || []).find((h) => h.tip !== "kart") || (findata.hesaplar || [])[0];
    setForm({ tip, baslik: "", miktar: "", kategori: tip === "gelir" ? "Maaş" : "Market", tarih: bugun(), tekrarla: false, hane: false, hesapId: ilkHesap ? String(ilkHesap.id) : "" });
    setModal("islem");
  }
  function abonelikAc() {
    setForm({ tip: "abonelik", baslik: "", miktar: "", kategori: "Eğlence", tarih: bugun() });
    setModal("abonelik");
  }
  function kaydetIslem(tur) {
    if (!form.baslik || !form.miktar) { bildir("Başlık ve tutar gerekli", "err"); return; }
    const girilen = sayiCevir(form.miktar);
    if (girilen <= 0) { bildir("Geçerli tutar gir", "err"); return; }
    // Yabancı para → girişte TRY'ye çevir (kayıtlar TRY saklanır); orijinali sakla
    const pb = form.pb || "TRY";
    let miktar = girilen, orjinal = {};
    if (pb !== "TRY") {
      const cev = tryeCevir(girilen, pb, findata.kurlar);
      if (cev == null) { bildir("Kur bilgisi yok — Ayarlar → Kur'dan güncelle", "err"); return; }
      miktar = cev; orjinal = { orjinalTutar: girilen, orjinalPb: pb };
    }
    const hesapId = tur === "gelir" || tur === "gider" ? form.hesapId || "" : "";
    const veri = { baslik: form.baslik, miktar, kategori: form.kategori, tarih: form.tarih, hane: !!form.hane, hesapId, ...orjinal };
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
    setForm({ tip: tur, baslik: kayit.baslik, miktar: String(kayit.orjinalPb ? kayit.orjinalTutar : kayit.miktar), pb: kayit.orjinalPb || "TRY", kategori: kayit.kategori, tarih: kayit.tarih, hane: !!kayit.hane, hesapId: kayit.hesapId || "", tekrarla: false, _editId: kayit.id });
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
    const adet = sayiCevir(form.adet), af = sayiCevir(form.alisFiyati);
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
            <div style={{ fontSize: 11, color: "#8FAE9E" }}>{user.username}</div>
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
        {/* Sürüm + güncelleme bildirimi (sol alt) */}
        <div style={{ marginTop: 10, textAlign: "center" }}>
          {guncelleme?.guncellemeVar && (
            <a href={SURUM_URL} target="_blank" rel="noreferrer"
              style={{ display: "block", marginBottom: 8, padding: "7px 10px", borderRadius: 9, background: "var(--accent)", color: "#143A2B", fontSize: 11.5, fontWeight: 700, textDecoration: "none", animation: "obfade .4s both" }}>
              ⬆ Yeni sürüm v{guncelleme.sonSurum}
            </a>
          )}
          <div className="num" style={{ fontSize: 10.5, color: "#6E8B7C" }}>v{SURUM}</div>
          {/* Build kimliği (diagnostics): stale-tab teşhisi. Tooltip'te tam kimlik. */}
          <div
            className="num"
            data-build-sha={BUILD_SHA}
            title={`v${SURUM} · build ${BUILD_SHA} · yüklendi ${new Date(buildKimligi().loadedAt).toLocaleString("tr-TR")}`}
            style={{ fontSize: 9, color: "#546B5E", marginTop: 1, letterSpacing: "0.02em" }}
          >
            build {BUILD_SHA}
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="fa-main">
        {senkron === "hata" && (
          <div style={{ background: "var(--neg)", color: "#fff", fontSize: 12.5, fontWeight: 600, textAlign: "center", padding: "7px 12px" }}>
            ⚠ Sunucuya ulaşılamıyor — değişiklikler kaydedilemedi, yeniden deneniyor…
          </div>
        )}
        {senkron === "catisma" && (
          <div style={{ background: "var(--neg)", color: "#fff", fontSize: 12.5, fontWeight: 600, textAlign: "center", padding: "7px 12px" }}>
            ⚠ Çakışma — sunucuda daha yeni bir sürüm var; değişikliklerin kaydedilmedi ve yerelde korunuyor.
          </div>
        )}
        <header className="fa-header">
          <div>
            <div style={{ fontSize: 12.5, color: "var(--ink3)" }}>{selamMetni()}, {user.ad?.split(" ")[0] || user.username} · {tarihUzun()}</div>
            <h1 className="serif" style={{ margin: "1px 0 0", fontSize: 24, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em" }}>{BASLIK[tab]}</h1>
          </div>
          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <SenkronRozet durum={senkron} />
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
            {tab === "panel" && <Panel {...ekranOrtak} donemAdi={DONEMLER.find((d) => d.id === donem)?.ad} toplamGelir={toplamGelir} toplamGider={toplamGider} toplamAbonelik={toplamAbonelik} nakit={nakit} netDeger={netDeger} yatirimDeger={yatirimDeger} yatirimKar={yatirimKar} guncelDeger={guncelDeger} onHizliEkle={ekle} kategoriOgren={kategoriOgren} onGit={setTab} onIncele={() => { setIslemFiltre("incele"); setTab("islemler"); }} />}
            {tab === "islemler" && <Islemler findata={findata} fd={fd} donem={donem} bildir={bildir} setFindata={setFindata} baslangicFiltre={islemFiltre} onFiltreTemizle={() => setIslemFiltre(null)} onSil={sil} onDuzenle={duzenleIslem} onGelirEkle={() => islemAc("gelir")} onGiderEkle={() => islemAc("gider")} onAbonelikEkle={abonelikAc} />}
            {tab === "hesap" && <Hesaplar findata={findata} setFindata={setFindata} bildir={bildir} />}
            {tab === "yatirim" && <Yatirimlar findata={findata} setFindata={setFindata} guncelDeger={guncelDeger} yatirimDeger={yatirimDeger} yatirimKar={yatirimKar} yatirimMaliyet={yatirimMaliyet} onEkle={yatirimAc} onSil={(id) => sil("yatirim", id)} onDuzenle={duzenleYatirim} onGuncelle={tumFiyatlariGuncelle} guncelleniyor={fiyatGuncelleniyor} />}
            {tab === "asistan" && <Asistan findata={findata} guncelDeger={guncelDeger} toplamGelir={toplamGelirTum} toplamGider={toplamGiderTum} toplamAbonelik={toplamAbonelik} yatirimDeger={yatirimDeger} netDeger={netDeger} bildir={bildir} />}
            {tab === "planlama" && <Planlama findata={findata} setFindata={setFindata} bildir={bildir} />}
            {tab === "analiz" && <Analiz findata={findata} fd={fd} donem={donem} donemAdi={DONEMLER.find((d) => d.id === donem)?.ad} toplamGelir={toplamGelir} />}
            {tab === "takvim" && <Takvim findata={findata} onDuzenle={duzenleIslem} />}
            {tab === "hane" && <Hane findata={findata} />}
            {tab === "veri" && <Veri findata={findata} setFindata={setFindata} user={user} bildir={bildir} ekle={ekle} kategoriOgren={kategoriOgren} toplamGelir={toplamGelirTum} toplamGider={toplamGiderTum} toplamAbonelik={toplamAbonelik} yatirimDeger={yatirimDeger} yatirimKar={yatirimKar} netDeger={netDeger} guncelDeger={guncelDeger} />}
            {tab === "ayar" && <Ayarlar findata={findata} setFindata={setFindata} bildir={bildir} user={user} onLogout={onLogout} senkronlaSimdi={senkronlaSimdi} />}
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
      {modal === "islem" && <IslemModal mod="islem" form={form} setForm={setForm} kategorilerGelir={gelirKategorileri(findata)} kategorilerGider={giderKategorileri(findata)} hesaplar={findata.hesaplar} hafiza={findata.kategoriHafiza} kurlar={findata.kurlar} onClose={() => setModal(null)} onKaydet={() => kaydetIslem(form.tip)} />}
      {modal === "abonelik" && <IslemModal mod="abonelik" form={form} setForm={setForm} kategorilerGider={["Eğlence", "Müzik", "Yazılım", "Sağlık", "Eğitim", "Haberler", "Diğer"]} kurlar={findata.kurlar} onClose={() => setModal(null)} onKaydet={() => kaydetIslem("abonelik")} />}
      {modal === "yatirim" && <YatirimModal form={form} setForm={setForm} onClose={() => setModal(null)} onKaydet={kaydetYatirim} />}
    </div>
  );
}
