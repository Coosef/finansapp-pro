import { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   FinansApp Pro v3  — tüm gelişmiş özellikler
   ============================================================ */

const TL = (n) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n || 0);
const TL2 = (n) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n || 0);
const bugun = () => new Date().toISOString().split("T")[0];
const buAy = () => new Date().toISOString().slice(0, 7);
const uid = () => Date.now() + Math.floor(Math.random() * 100000);
const AY_ADI = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function sonrakiTarih(dateStr, frekans) {
  const d = new Date(dateStr + "T00:00:00");
  if (frekans === "haftalık") d.setDate(d.getDate() + 7);
  else if (frekans === "yıllık") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().split("T")[0];
}
function aylikEsdeger(miktar, frekans) { return frekans === "haftalık" ? miktar * 4.33 : frekans === "yıllık" ? miktar / 12 : miktar; }

const KRIPTO_MAP = { BTC: "bitcoin", BITCOIN: "bitcoin", ETH: "ethereum", ETHEREUM: "ethereum", SOL: "solana", SOLANA: "solana", BNB: "binancecoin", XRP: "ripple", ADA: "cardano", DOGE: "dogecoin", AVAX: "avalanche-2", DOT: "polkadot", USDT: "tether", LTC: "litecoin", LINK: "chainlink", TRX: "tron" };
const VARLIK_TIPLERI = [
  { id: "kripto", label: "Kripto", renk: "#F7931A", birim: "adet" },
  { id: "altin", label: "Altın", renk: "#F59E0B", birim: "gram" },
  { id: "doviz", label: "Döviz", renk: "#10B981", birim: "birim" },
  { id: "hisse", label: "Hisse Senedi", renk: "#6366F1", birim: "lot" },
  { id: "fon", label: "Fon / Diğer", renk: "#A855F7", birim: "pay" },
  { id: "bes", label: "BES (Emeklilik)", renk: "#14B8A6", birim: "pay" },
];
const GIDER_KAT = ["Market", "Konut", "Ulaşım", "Sağlık", "Eğlence", "Giyim", "Eğitim", "Faturalar", "Restoran", "Teknoloji", "Diğer"];
const GELIR_KAT = ["Maaş", "Ek Gelir", "Serbest", "Kira Geliri", "Temettü", "Yatırım", "Diğer"];

const C = { bg: "#07090F", card: "#0F1117", card2: "#0A0C13", line: "#1E2130", line2: "#2A2D3A", text: "#E2E8F0", dim: "#94A3B8", dimmer: "#64748B", faint: "#475569", green: "#22C55E", greenL: "#4ADE80", red: "#EF4444", redL: "#F87171", amber: "#F59E0B", indigo: "#6366F1", indigoL: "#818CF8", purple: "#8B5CF6", cyan: "#06B6D4" };
const F = "'Sora', sans-serif";
const inputStyle = { width: "100%", padding: "0.65rem 0.85rem", background: "#1A1D27", border: `1px solid ${C.line2}`, borderRadius: "0.5rem", color: C.text, fontSize: "0.9rem", fontFamily: F, boxSizing: "border-box", outline: "none" };
const sectionTitle = { margin: "0 0 1rem", fontSize: "0.82rem", color: C.dim, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 };
const pageTitle = { margin: "0 0 0.2rem", fontSize: "1.2rem", fontWeight: 700 };
const rowStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.8rem 1rem", background: C.card2, borderRadius: "0.6rem", marginBottom: "0.5rem", border: `1px solid ${C.line}` };
const tagStyle = (col) => ({ background: col + "22", border: `1px solid ${col}55`, color: col, fontSize: "0.62rem", padding: "0.1rem 0.35rem", borderRadius: "0.3rem", marginLeft: "0.4rem", fontWeight: 700, letterSpacing: "0.03em", verticalAlign: "middle" });

// ---------- UI parçaları ----------
function Field({ label, type = "text", value, onChange, options, placeholder }) {
  return (<div style={{ marginBottom: "0.9rem" }}><label style={{ display: "block", color: C.dim, fontSize: "0.74rem", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>{options ? <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>{options.map((o) => (typeof o === "object" ? <option key={o.id} value={o.id}>{o.label}</option> : <option key={o} value={o}>{o}</option>))}</select> : <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={inputStyle} />}</div>);
}
function Toggle({ label, checked, onChange }) {
  return (<div onClick={() => onChange(!checked)} style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer", marginBottom: "0.9rem" }}><div style={{ width: 40, height: 22, borderRadius: 999, background: checked ? C.indigo : C.line2, position: "relative", transition: "all .2s", flexShrink: 0 }}><div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: checked ? 21 : 3, transition: "all .2s" }} /></div><span style={{ color: C.dim, fontSize: "0.85rem" }}>{label}</span></div>);
}
function Card({ children, style = {}, accent }) { return (<div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: "1rem", padding: "1.4rem", position: "relative", overflow: "hidden", ...style }}>{accent && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent }} />}{children}</div>); }
function Btn({ children, onClick, variant = "primary", style = {}, disabled }) {
  const v = { primary: { background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff" }, green: { background: "linear-gradient(135deg,#22C55E,#16A34A)", color: "#fff" }, red: { background: "linear-gradient(135deg,#EF4444,#B91C1C)", color: "#fff" }, amber: { background: "linear-gradient(135deg,#F59E0B,#D97706)", color: "#fff" }, ghost: { background: "#1A1D27", color: C.dim, border: `1px solid ${C.line2}` } };
  return <button onClick={onClick} disabled={disabled} style={{ border: "none", padding: "0.6rem 1.1rem", borderRadius: "0.6rem", cursor: disabled ? "not-allowed" : "pointer", fontFamily: F, fontWeight: 600, fontSize: "0.85rem", opacity: disabled ? 0.5 : 1, ...v[variant], ...style }}>{children}</button>;
}
function Modal({ title, onClose, children, wide }) {
  return (<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", overflow: "auto" }}><div style={{ background: C.card, border: `1px solid ${C.line2}`, borderRadius: "1rem", padding: "1.75rem", width: "100%", maxWidth: wide ? 640 : 440, maxHeight: "90vh", overflow: "auto", boxShadow: "0 25px 60px rgba(0,0,0,0.6)" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}><h3 style={{ color: C.text, fontFamily: F, fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>{title}</h3><button onClick={onClose} style={{ background: "#1E2130", border: "none", color: C.dim, width: 30, height: 30, borderRadius: "50%", cursor: "pointer" }}>✕</button></div>{children}</div></div>);
}
function ProgressBar({ value, max, color, height = 8 }) {
  const pct = Math.min(100, Math.max(0, (value / (max || 1)) * 100));
  const renk = color || (pct >= 100 ? C.red : pct >= 80 ? C.amber : C.green);
  return <div style={{ background: C.line, borderRadius: 999, height }}><div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: renk, transition: "width .6s" }} /></div>;
}
function Sparkline({ points, color = C.indigo, height = 60, width = 240, fill = true }) {
  if (!points || points.length < 2) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: C.faint, fontSize: "0.75rem" }}>Yeterli veri yok</div>;
  const ys = points.map((p) => p.deger); const min = Math.min(...ys), max = Math.max(...ys), range = max - min || 1; const stepX = width / (points.length - 1);
  const coord = (p, i) => [i * stepX, height - ((p.deger - min) / range) * (height - 8) - 4];
  const path = points.map((p, i) => { const [x, y] = coord(p, i); return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`; }).join(" ");
  const id = "g" + color.replace("#", "") + Math.round(width) + Math.round(height);
  return (<svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>{fill && (<><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.35" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs><path d={`${path} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} /></>)}<path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>);
}
function BarChart({ data, height = 160 }) {
  if (!data.length) return <div style={{ color: C.faint, fontSize: "0.8rem", padding: "1rem 0" }}>Veri yok</div>;
  const max = Math.max(...data.flatMap((d) => [d.gelir, d.gider]), 1);
  return (<div style={{ display: "flex", alignItems: "flex-end", gap: "0.75rem", height, paddingTop: "1rem" }}>{data.map((d) => (<div key={d.ay} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem" }}><div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: height - 30, width: "100%", justifyContent: "center" }}><div title={`Gelir ${TL(d.gelir)}`} style={{ width: "40%", maxWidth: 22, height: `${(d.gelir / max) * 100}%`, background: "linear-gradient(180deg,#4ADE80,#22C55E)", borderRadius: "3px 3px 0 0", minHeight: 2 }} /><div title={`Gider ${TL(d.gider)}`} style={{ width: "40%", maxWidth: 22, height: `${(d.gider / max) * 100}%`, background: "linear-gradient(180deg,#F87171,#EF4444)", borderRadius: "3px 3px 0 0", minHeight: 2 }} /></div><span style={{ color: C.dimmer, fontSize: "0.68rem" }}>{d.ay}</span></div>))}</div>);
}
function Stat({ title, value, sub, subColor, color, icon }) {
  return (<Card accent={color}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}><div><p style={{ color: C.dimmer, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 0.5rem" }}>{title}</p><p style={{ color: C.text, fontSize: "1.4rem", fontWeight: 700, margin: 0 }}>{value}</p>{sub && <p style={{ color: subColor || C.dimmer, fontSize: "0.74rem", margin: "0.3rem 0 0" }}>{sub}</p>}</div><span style={{ fontSize: "1.6rem", opacity: 0.75 }}>{icon}</span></div></Card>);
}
function DelBtn({ onClick }) { return <button onClick={onClick} style={{ background: "#1E1525", border: "1px solid #3D1A2E", color: C.redL, width: 28, height: 28, borderRadius: "0.4rem", cursor: "pointer", fontSize: "0.78rem", flexShrink: 0 }}>✕</button>; }
function Bos({ mesaj }) { return <div style={{ background: C.card2, border: `1px dashed ${C.line2}`, borderRadius: "0.8rem", padding: "2rem", textAlign: "center", color: C.dimmer, fontSize: "0.85rem", marginBottom: "1rem" }}>{mesaj}</div>; }

// ---------- API ----------
async function claudeCall(messages, useSearch = false) {
  const body = { model: "claude-sonnet-4-6", max_tokens: 1000, messages };
  if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!data.content) throw new Error("API yanıtı alınamadı");
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}
function parseJSON(text) { const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim(); const start = Math.min(...["{", "["].map((c) => { const i = clean.indexOf(c); return i === -1 ? Infinity : i; })); return JSON.parse(start === Infinity ? clean : clean.slice(start)); }
async function fileToBase64(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(file); }); }
function sayiCikar(txt) { const m = txt.match(/[\d.,]+/); if (!m) return NaN; let s = m[0]; if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", "."); else if (s.includes(",")) s = s.replace(",", "."); return parseFloat(s); }
async function fiyatCek(y) {
  if (y.tip === "kripto") { const id = KRIPTO_MAP[(y.sembol || "").toUpperCase()]; if (id) { try { const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=try`); const j = await r.json(); if (j[id]?.try) return j[id].try; } catch {} } }
  const soru = { altin: `Türkiye'de 1 gram ${y.sembol || "altın"} fiyatı kaç TL?`, doviz: `1 ${y.sembol || "USD"} kaç Türk Lirası?`, hisse: `Borsa İstanbul'da ${y.sembol} hissesinin güncel fiyatı kaç TL?`, fon: `${y.sembol || y.ad} güncel birim fiyatı kaç TL?` }[y.tip] || `${y.sembol || y.ad} güncel TL fiyatı nedir?`;
  const txt = await claudeCall([{ role: "user", content: `${soru} Yalnızca sayıyı yaz (ondalık nokta, simge/açıklama YOK). Örn: 2456.50` }], true);
  const val = sayiCikar(txt); if (isNaN(val)) throw new Error("Fiyat okunamadı"); return val;
}
async function kurCek() {
  const usdTxt = await claudeCall([{ role: "user", content: "1 USD kaç Türk Lirası? Sadece sayı yaz." }], true);
  const eurTxt = await claudeCall([{ role: "user", content: "1 EUR kaç Türk Lirası? Sadece sayı yaz." }], true);
  return { usd: sayiCikar(usdTxt), eur: sayiCikar(eurTxt), tarih: bugun() };
}

// ---------- Veri / tekrar ----------
const bosVeri = () => ({ gelirler: [], giderler: [], abonelikler: [], yatirimlar: [], butceler: {}, hedefler: [], sablonlar: [], hedefDagilim: {}, ayarlar: { enflasyon: 50, pin: null, tema: "koyu", accent: "#6366F1", kuruldu: false }, kategoriHafiza: {}, kurlar: null, hesaplar: [], zarflar: {}, kurallar: [], meydanOkumalar: [], netGecmis: [] });

// ---- Hesap tipleri, rozetler, kural motoru ----
const HESAP_TIP = [{ id: "nakit", label: "Nakit", icon: "💵", renk: "#22C55E" }, { id: "banka", label: "Banka", icon: "🏦", renk: "#6366F1" }, { id: "kart", label: "Kredi Kartı", icon: "💳", renk: "#EF4444" }, { id: "birikim", label: "Birikim", icon: "🐷", renk: "#F59E0B" }];
const ACCENT_SECENEK = [{ ad: "Indigo", renk: "#6366F1" }, { ad: "Mor", renk: "#8B5CF6" }, { ad: "Camgöbeği", renk: "#06B6D4" }, { ad: "Yeşil", renk: "#22C55E" }, { ad: "Amber", renk: "#F59E0B" }, { ad: "Pembe", renk: "#EC4899" }];
function rozetleriHesapla(d, netDeger, toplamGider) {
  const r = [];
  const gSay = (d.giderler || []).length, ySay = (d.yatirimlar || []).length, hSay = (d.hedefler || []).length;
  r.push({ id: "ilk", ad: "İlk Adım", icon: "🌱", aciklama: "İlk işlemini ekle", kazanildi: gSay + (d.gelirler || []).length > 0 });
  r.push({ id: "kasif", ad: "Kâşif", icon: "🧭", aciklama: "10+ işlem kaydet", kazanildi: gSay >= 10 });
  r.push({ id: "yatirimci", ad: "Yatırımcı", icon: "📈", aciklama: "İlk yatırımını ekle", kazanildi: ySay > 0 });
  r.push({ id: "cesitli", ad: "Çeşitlendirici", icon: "🎯", aciklama: "3 farklı varlık tipi", kazanildi: new Set((d.yatirimlar || []).map((y) => y.tip)).size >= 3 });
  r.push({ id: "hedefci", ad: "Hedef Avcısı", icon: "🏆", aciklama: "Bir hedef oluştur", kazanildi: hSay > 0 });
  r.push({ id: "butceli", ad: "Disiplinli", icon: "📊", aciklama: "Kategori bütçesi belirle", kazanildi: Object.values(d.butceler || {}).some((v) => v > 0) });
  r.push({ id: "varlikli", ad: "Altı Sıfır", icon: "💎", aciklama: "Net varlık 1.000.000₺", kazanildi: netDeger >= 1000000 });
  r.push({ id: "tasarruf", ad: "Kumbara", icon: "🐷", aciklama: "Bir birikim hesabı aç", kazanildi: (d.hesaplar || []).some((h) => h.tip === "birikim") });
  return r;
}
function kurallariUygula(kayit, kurallar) {
  let sonuc = { ...kayit }; const uyarilar = [];
  (kurallar || []).forEach((k) => {
    const eslesme = (kayit.baslik || "").toLowerCase().includes((k.kelime || "").toLowerCase()) && k.kelime;
    const tutarEslesme = k.tutarUstu ? kayit.miktar >= k.tutarUstu : false;
    if ((k.tip === "kategori" && eslesme) || (k.tip === "kategori" && tutarEslesme && !k.kelime)) sonuc.kategori = k.kategori;
    if (k.tip === "uyari" && (eslesme || tutarEslesme)) uyarilar.push(`${k.kelime || k.tutarUstu + "₺ üstü"}: ${k.mesaj || "dikkat"}`);
  });
  return { kayit: sonuc, uyarilar };
}
function tekrarlariUret(data) {
  const t = bugun(); let degisti = false;
  const yeni = { ...data, gelirler: [...data.gelirler], giderler: [...data.giderler], abonelikler: [...data.abonelikler], sablonlar: [...(data.sablonlar || [])] };
  yeni.sablonlar = yeni.sablonlar.map((s) => {
    let cursor = s.sonUretilen ? sonrakiTarih(s.sonUretilen, s.frekans) : s.baslangic; let guard = 0, son = s.sonUretilen;
    while (cursor <= t && guard < 600) {
      const kayit = { id: uid(), baslik: s.baslik, miktar: s.miktar, kategori: s.kategori, tarih: cursor, kaynak: "otomatik", otomatik: true, hane: !!s.hane };
      if (s.tip === "gelir") { kayit.tekrar = s.frekans; yeni.gelirler.push(kayit); } else if (s.tip === "abonelik") yeni.abonelikler.push(kayit); else yeni.giderler.push(kayit);
      son = cursor; degisti = true; cursor = sonrakiTarih(cursor, s.frekans); guard++;
    }
    return { ...s, sonUretilen: son };
  });
  return { data: yeni, degisti };
}
function kategoriAnahtar(baslik) { return (baslik || "").toLowerCase().trim().split(/\s+/).slice(0, 2).join(" "); }

// ============================================================
export default function FinansAppPro() {
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kullanicilar, setKullanicilar] = useState(null);
  const [aktif, setAktif] = useState(null);
  const [findata, setFindataState] = useState(null);
  const [kilitli, setKilitli] = useState(false);
  const [tab, setTab] = useState("panel");

  useEffect(() => { (async () => { try { let users = null; try { const r = await window.storage.get("users", true); users = r ? JSON.parse(r.value) : null; } catch {} if (!users) { users = [{ username: "admin", sifre: "admin123", rol: "admin", ad: "Yönetici" }]; try { await window.storage.set("users", JSON.stringify(users), true); } catch {} } setKullanicilar(users); } finally { setYukleniyor(false); } })(); }, []);

  async function girisYap(username, sifre) {
    const u = kullanicilar.find((x) => x.username === username && x.sifre === sifre); if (!u) return false;
    let veri = bosVeri(); try { const r = await window.storage.get(`findata:${username}`, true); if (r) veri = { ...bosVeri(), ...JSON.parse(r.value) }; } catch {}
    const { data, degisti } = tekrarlariUret(veri); if (degisti) { try { await window.storage.set(`findata:${username}`, JSON.stringify(data), true); } catch {} }
    setAktif(u); setFindataState(data); setKilitli(!!data.ayarlar?.pin); setTab("panel"); return true;
  }
  const setFindata = useCallback((updater) => { setFindataState((prev) => { const next = typeof updater === "function" ? updater(prev) : updater; if (aktif) window.storage.set(`findata:${aktif.username}`, JSON.stringify(next), true).catch(() => {}); return next; }); }, [aktif]);
  async function kullanicilariKaydet(yeni) { setKullanicilar(yeni); try { await window.storage.set("users", JSON.stringify(yeni), true); } catch {} }

  if (yukleniyor) return <div style={{ minHeight: "100vh", background: C.bg, color: C.dim, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F }}>Yükleniyor…</div>;
  if (!aktif) return <><FontLink /><Login onLogin={girisYap} /></>;
  if (kilitli) return <><FontLink /><PinGate dogruPin={findata.ayarlar.pin} onAc={() => setKilitli(false)} onCikis={() => { setAktif(null); setFindataState(null); }} /></>;
  if (!findata.ayarlar?.kuruldu) return <><FontLink /><Onboarding user={aktif} setFindata={setFindata} /></>;
  return <><FontLink /><Uygulama user={aktif} users={kullanicilar} onUsersChange={kullanicilariKaydet} findata={findata} setFindata={setFindata} tab={tab} setTab={setTab} onLogout={() => { setAktif(null); setFindataState(null); }} /></>;
}
function FontLink() { return <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />; }

function Login({ onLogin }) {
  const [u, setU] = useState(""), [p, setP] = useState(""), [hata, setHata] = useState("");
  async function dene() { if (!(await onLogin(u.trim(), p))) setHata("Kullanıcı adı veya şifre hatalı"); }
  return (<div style={{ minHeight: "100vh", background: `radial-gradient(circle at 30% 20%, #1A1530, ${C.bg} 60%)`, fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}><div style={{ width: "100%", maxWidth: 380 }}><div style={{ textAlign: "center", marginBottom: "2rem" }}><div style={{ width: 56, height: 56, borderRadius: "1rem", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem", margin: "0 auto 1rem" }}>₺</div><h1 style={{ color: C.text, margin: "0 0 0.3rem", fontSize: "1.5rem", fontWeight: 800 }}>FinansApp Pro</h1><p style={{ color: C.dimmer, margin: 0, fontSize: "0.85rem" }}>Çok kullanıcılı finans yönetimi</p></div><Card><Field label="Kullanıcı Adı" value={u} onChange={setU} placeholder="admin" /><Field label="Şifre" type="password" value={p} onChange={setP} placeholder="••••••" />{hata && <p style={{ color: C.redL, fontSize: "0.8rem", margin: "0 0 0.75rem" }}>{hata}</p>}<Btn onClick={dene} style={{ width: "100%", padding: "0.75rem" }}>Giriş Yap</Btn><p style={{ color: C.faint, fontSize: "0.72rem", textAlign: "center", marginTop: "1rem", marginBottom: 0 }}>İlk giriş: <b style={{ color: C.dim }}>admin</b> / <b style={{ color: C.dim }}>admin123</b></p></Card></div></div>);
}

// PIN kilidi
function PinGate({ dogruPin, onAc, onCikis }) {
  const [pin, setPin] = useState(""); const [hata, setHata] = useState(false);
  function bas(d) { if (pin.length >= 4) return; const yeni = pin + d; setPin(yeni); if (yeni.length === 4) { if (yeni === dogruPin) onAc(); else { setHata(true); setTimeout(() => { setPin(""); setHata(false); }, 600); } } }
  return (<div style={{ minHeight: "100vh", background: C.bg, fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "2rem", padding: "1rem" }}>
    <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}`}</style>
    <div style={{ textAlign: "center" }}><div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>🔒</div><p style={{ color: C.dim, margin: 0 }}>PIN kodunu gir</p></div>
    <div style={{ display: "flex", gap: "0.75rem", animation: hata ? "shake .3s" : "none" }}>{[0, 1, 2, 3].map((i) => <div key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: i < pin.length ? (hata ? C.red : C.indigo) : C.line2, transition: "all .15s" }} />)}</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,72px)", gap: "0.75rem" }}>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => <button key={d} onClick={() => bas(String(d))} style={{ width: 72, height: 72, borderRadius: "50%", background: C.card, border: `1px solid ${C.line2}`, color: C.text, fontSize: "1.4rem", fontFamily: F, cursor: "pointer" }}>{d}</button>)}<div /><button onClick={() => bas("0")} style={{ width: 72, height: 72, borderRadius: "50%", background: C.card, border: `1px solid ${C.line2}`, color: C.text, fontSize: "1.4rem", fontFamily: F, cursor: "pointer" }}>0</button><button onClick={() => setPin(pin.slice(0, -1))} style={{ width: 72, height: 72, borderRadius: "50%", background: "transparent", border: "none", color: C.dim, fontSize: "1.2rem", cursor: "pointer" }}>⌫</button></div>
    <button onClick={onCikis} style={{ background: "none", border: "none", color: C.faint, fontFamily: F, cursor: "pointer", fontSize: "0.85rem" }}>Çıkış yap</button>
  </div>);
}

// ============================================================
function Uygulama({ user, users, onUsersChange, findata, setFindata, tab, setTab, onLogout }) {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [fiyatGuncelleniyor, setFiyatGuncelleniyor] = useState(false);
  const [bildirim, setBildirim] = useState(null);
  const isAdmin = user.rol === "admin";
  const accent = findata.ayarlar?.accent || C.indigo;

  const TABS = [
    { id: "panel", label: "📊 Panel" }, { id: "asistan", label: "💬 Asistan" }, { id: "yatirim", label: "📈 Yatırım" }, { id: "hesap", label: "👛 Hesaplar" }, { id: "gelir", label: "💰 Gelir" }, { id: "gider", label: "💸 Gider" }, { id: "abonelik", label: "🔄 Abonelik" },
    { id: "planlama", label: "🎯 Bütçe & Hedef" }, { id: "analiz", label: "🔬 Analiz" }, { id: "gorsel", label: "🌊 Görseller" }, { id: "takvim", label: "📅 Takvim" }, { id: "hane", label: "🏠 Hane" }, { id: "ice", label: "📥 İçe Aktar" }, { id: "rapor", label: "📄 Rapor" }, { id: "ayar", label: "⚙️ Ayarlar" },
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

  function bildir(msg, tip = "ok") { setBildirim({ msg, tip }); setTimeout(() => setBildirim(null), 3500); }
  function ekle(tur, kayit) { const m = { gelir: "gelirler", gider: "giderler", abonelik: "abonelikler", yatirim: "yatirimlar" }; let son = kayit; if (tur === "gelir" || tur === "gider") { const { kayit: k2, uyarilar } = kurallariUygula(kayit, findata.kurallar); son = k2; if (uyarilar.length) bildir("⚠️ " + uyarilar[0]); } setFindata((d) => ({ ...d, [m[tur]]: [...d[m[tur]], { id: uid(), ...son }] })); }
  function sil(tur, id) { const m = { gelir: "gelirler", gider: "giderler", abonelik: "abonelikler", yatirim: "yatirimlar" }; setFindata((d) => ({ ...d, [m[tur]]: d[m[tur]].filter((x) => x.id !== id) })); }
  function kategoriOgren(baslik, kategori) { const k = kategoriAnahtar(baslik); if (k) setFindata((d) => ({ ...d, kategoriHafiza: { ...(d.kategoriHafiza || {}), [k]: kategori } })); }

  async function tumFiyatlariGuncelle() {
    if (!findata.yatirimlar.length) { bildir("Güncellenecek yatırım yok"); return; }
    setFiyatGuncelleniyor(true); const t = bugun(); let basari = 0; const yeni = [...findata.yatirimlar];
    for (let i = 0; i < yeni.length; i++) { try { const f = await fiyatCek(yeni[i]); const g = yeni[i].gecmis || []; const yd = yeni[i].adet * f; const son = g[g.length - 1]; const g2 = son && son.tarih === t ? [...g.slice(0, -1), { tarih: t, deger: yd }] : [...g, { tarih: t, deger: yd }]; yeni[i] = { ...yeni[i], oncekiFiyat: yeni[i].guncelFiyat || yeni[i].alisFiyati, guncelFiyat: f, sonGuncelleme: t, gecmis: g2 }; basari++; } catch {} }
    setFindata((d) => ({ ...d, yatirimlar: yeni })); setFiyatGuncelleniyor(false); bildir(`${basari}/${yeni.length} yatırım güncellendi`);
  }
  const ilk = useRef(true);
  useEffect(() => { if (ilk.current && findata.yatirimlar.length) { ilk.current = false; tumFiyatlariGuncelle(); } }, []); // eslint-disable-line

  return (
    <div style={{ minHeight: "100vh", background: { gece: "#0A0F1E", antrasit: "#0D0D11" }[findata.ayarlar?.tema] || C.bg, fontFamily: F, color: C.text }}>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}`}</style>
      {bildirim && <div style={{ position: "fixed", top: 16, right: 16, zIndex: 2000, background: bildirim.tip === "err" ? "#1F0A0A" : "#0D2718", border: `1px solid ${bildirim.tip === "err" ? "#7F1D1D" : "#166534"}`, color: bildirim.tip === "err" ? C.redL : C.greenL, padding: "0.75rem 1.1rem", borderRadius: "0.6rem", fontSize: "0.85rem", maxWidth: 340, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>{bildirim.msg}</div>}

      <div style={{ borderBottom: `1px solid ${C.line}`, padding: "1rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", background: C.card2, flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}><div style={{ width: 36, height: 36, borderRadius: "0.6rem", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>₺</div><div><h1 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>FinansApp Pro</h1><p style={{ margin: 0, fontSize: "0.7rem", color: C.faint }}>{user.ad} · {isAdmin ? "Yönetici" : "Kullanıcı"}</p></div></div>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
          <div style={{ background: netDeger >= 0 ? "#0D2718" : "#1F0A0A", border: `1px solid ${netDeger >= 0 ? "#166534" : "#7F1D1D"}`, borderRadius: "0.6rem", padding: "0.4rem 0.85rem", textAlign: "right" }}><div><span style={{ color: netDeger >= 0 ? C.greenL : C.redL, fontWeight: 700, fontSize: "0.9rem" }}>{TL(netDeger)}</span><span style={{ color: C.dimmer, fontSize: "0.68rem", marginLeft: "0.4rem" }}>net varlık</span></div>{findata.kurlar && <div style={{ color: C.faint, fontSize: "0.65rem", marginTop: 1 }}>${(netDeger / findata.kurlar.usd).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} · €{(netDeger / findata.kurlar.eur).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</div>}</div>
          <Btn variant="ghost" onClick={onLogout} style={{ padding: "0.45rem 0.8rem", fontSize: "0.8rem" }}>Çıkış</Btn>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.25rem", padding: "0.85rem 1.5rem 0", borderBottom: `1px solid ${C.line}`, overflowX: "auto" }}>{TABS.map((t) => <button key={t.id} onClick={() => setTab(t.id)} style={{ background: tab === t.id ? accent : "transparent", border: `1px solid ${tab === t.id ? accent : "transparent"}`, color: tab === t.id ? "#fff" : C.dimmer, padding: "0.5rem 0.9rem", borderRadius: "0.5rem 0.5rem 0 0", cursor: "pointer", fontFamily: F, fontWeight: tab === t.id ? 600 : 400, fontSize: "0.8rem", whiteSpace: "nowrap", marginBottom: -1 }}>{t.label}</button>)}</div>

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

      {modal === "yatirim" && <YatirimModal form={form} setForm={setForm} onClose={() => setModal(null)} onKaydet={() => { if (!form.ad || !form.adet || !form.alisFiyati) return; const adet = parseFloat(form.adet), af = parseFloat(form.alisFiyati); ekle("yatirim", { tip: form.tip, ad: form.ad, sembol: form.sembol || form.ad, adet, alisFiyati: af, alisTarihi: form.alisTarihi, guncelFiyat: af, gecmis: [{ tarih: form.alisTarihi, deger: adet * af }] }); setModal(null); bildir("Yatırım eklendi"); }} />}
      {modal === "gelir" && <IslemModal title="Gelir Ekle" form={form} setForm={setForm} kategoriler={GELIR_KAT} variant="green" hafiza={findata.kategoriHafiza} onClose={() => setModal(null)} onKaydet={() => kaydetIslem("gelir")} />}
      {modal === "gider" && <IslemModal title="Gider Ekle" form={form} setForm={setForm} kategoriler={GIDER_KAT} variant="red" hafiza={findata.kategoriHafiza} onClose={() => setModal(null)} onKaydet={() => kaydetIslem("gider")} />}
      {modal === "abonelik" && <IslemModal title="Abonelik Ekle" form={form} setForm={setForm} kategoriler={["Eğlence", "Müzik", "Yazılım", "Sağlık", "Eğitim", "Haberler", "Diğer"]} miktarLabel="Aylık Ücret (₺)" variant="amber" noTekrar noHane onClose={() => setModal(null)} onKaydet={() => { if (!form.baslik || !form.miktar) return; ekle("abonelik", { baslik: form.baslik, miktar: parseFloat(form.miktar), kategori: form.kategori, tarih: form.tarih }); setModal(null); }} />}
    </div>
  );

  function kaydetIslem(tur) {
    if (!form.baslik || !form.miktar) return;
    ekle(tur, { baslik: form.baslik, miktar: parseFloat(form.miktar), kategori: form.kategori, tarih: form.tarih, hane: !!form.hane });
    kategoriOgren(form.baslik, form.kategori);
    if (form.tekrarla) setFindata((d) => ({ ...d, sablonlar: [...(d.sablonlar || []), { id: uid(), tip: tur, baslik: form.baslik, miktar: parseFloat(form.miktar), kategori: form.kategori, frekans: form.frekans || "aylık", baslangic: form.tarih, sonUretilen: form.tarih, hane: !!form.hane }] }));
    setModal(null); bildir(form.tekrarla ? "Eklendi + otomatik tekrara alındı" : "Eklendi");
  }
}

// ---------- HIZLI EKLE (doğal dil + ses) ----------
function HizliEkle({ findata, ekle, kategoriOgren, bildir }) {
  const [metin, setMetin] = useState(""); const [bekle, setBekle] = useState(false); const [dinliyor, setDinliyor] = useState(false);
  const sesVar = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  function dinle() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    const r = new SR(); r.lang = "tr-TR"; r.interimResults = false;
    r.onresult = (e) => { setMetin(e.results[0][0].transcript); setDinliyor(false); }; r.onerror = () => setDinliyor(false); r.onend = () => setDinliyor(false);
    setDinliyor(true); try { r.start(); } catch { setDinliyor(false); }
  }
  async function isle() {
    if (!metin.trim()) return; setBekle(true);
    try {
      const txt = await claudeCall([{ role: "user", content: `Kullanıcı bir finansal işlem yazdı: "${metin}". Bugün ${bugun()}. SADECE şu JSON: {"tip":"gelir|gider","baslik":"kısa açıklama","miktar":sayı,"kategori":"${GIDER_KAT.join("|")}|Maaş|Ek Gelir","tarih":"YYYY-MM-DD"}. Tarih belirtilmemişse bugünü kullan.` }]);
      const j = parseJSON(txt);
      const tip = j.tip === "gelir" ? "gelir" : "gider";
      const k = kategoriAnahtar(j.baslik); const hatirla = (findata.kategoriHafiza || {})[k];
      ekle(tip, { baslik: j.baslik, miktar: Math.abs(parseFloat(j.miktar) || 0), kategori: hatirla || j.kategori || (tip === "gelir" ? "Ek Gelir" : "Diğer"), tarih: j.tarih || bugun() });
      kategoriOgren(j.baslik, hatirla || j.kategori);
      bildir(`${tip === "gelir" ? "Gelir" : "Gider"} eklendi: ${j.baslik} ${TL(j.miktar)}`); setMetin("");
    } catch (e) { bildir("Anlaşılamadı, tekrar dener misin?", "err"); } finally { setBekle(false); }
  }
  return (
    <Card style={{ marginBottom: "1rem" }} accent={C.cyan}>
      <h3 style={{ ...sectionTitle, margin: "0 0 0.75rem" }}>⚡ Hızlı Ekle</h3>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input value={metin} onChange={(e) => setMetin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && isle()} placeholder='Örn: "Bugün markete 350 lira verdim"' style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
        {sesVar && <Btn variant="ghost" onClick={dinle} disabled={dinliyor} style={{ padding: "0.6rem 0.8rem" }}>{dinliyor ? "🎙️…" : "🎤"}</Btn>}
        <Btn onClick={isle} disabled={bekle}>{bekle ? "…" : "Ekle"}</Btn>
      </div>
      <p style={{ color: C.faint, fontSize: "0.72rem", margin: "0.6rem 0 0" }}>Doğal dille yaz, AI tutar/kategori/tarihi çıkarıp kaydeder. {sesVar ? "Mikrofonla sesli de girebilirsin." : ""}</p>
    </Card>
  );
}

// ---------- PANEL ----------
function Panel({ findata, ekle, kategoriOgren, guncelDeger, toplamGelir, toplamGider, toplamAbonelik, yatirimDeger, yatirimKar, yatirimMaliyet, nakit, netDeger, bildir }) {
  const [icgoru, setIcgoru] = useState(null); const [icYukleniyor, setIcYukleniyor] = useState(false);
  const aylik = {};
  findata.gelirler.forEach((g) => { const a = (g.tarih || "").slice(0, 7); if (a) { aylik[a] = aylik[a] || { gelir: 0, gider: 0 }; aylik[a].gelir += g.miktar; } });
  findata.giderler.forEach((g) => { const a = (g.tarih || "").slice(0, 7); if (a) { aylik[a] = aylik[a] || { gelir: 0, gider: 0 }; aylik[a].gider += g.miktar; } });
  const barData = Object.keys(aylik).sort().slice(-6).map((a) => ({ ay: a.slice(5) + "/" + a.slice(2, 4), ...aylik[a] }));
  const tarihSet = {}; findata.yatirimlar.forEach((y) => (y.gecmis || []).forEach((p) => { tarihSet[p.tarih] = true; }));
  const portfoyGecmis = Object.keys(tarihSet).sort().map((t) => ({ tarih: t, deger: findata.yatirimlar.reduce((s, y) => { const g = (y.gecmis || []).filter((p) => p.tarih <= t).pop(); return s + (g ? g.deger : 0); }, 0) }));
  const karYuzde = yatirimMaliyet ? (yatirimKar / yatirimMaliyet) * 100 : 0;
  const ay = buAy();
  const ayGider = {}; findata.giderler.filter((g) => (g.tarih || "").startsWith(ay)).forEach((g) => { ayGider[g.kategori] = (ayGider[g.kategori] || 0) + g.miktar; });
  const butceliler = Object.keys(findata.butceler || {}).filter((k) => findata.butceler[k] > 0);

  const aylikGelirTekrar = (findata.sablonlar || []).filter((s) => s.tip === "gelir").reduce((s, x) => s + aylikEsdeger(x.miktar, x.frekans), 0);
  const aylikGiderTekrar = (findata.sablonlar || []).filter((s) => s.tip === "gider").reduce((s, x) => s + aylikEsdeger(x.miktar, x.frekans), 0);
  const aylikNet = aylikGelirTekrar - aylikGiderTekrar - toplamAbonelik;
  const tahmin = []; let bak = nakit; for (let i = 1; i <= 6; i++) { bak += aylikNet; tahmin.push({ deger: bak, ay: i }); }
  const negatifAy = tahmin.find((t) => t.deger < 0);

  const oncekiAylar = {}; findata.giderler.forEach((g) => { const a = (g.tarih || "").slice(0, 7); if (a && a < ay) { oncekiAylar[a] = oncekiAylar[a] || {}; oncekiAylar[a][g.kategori] = (oncekiAylar[a][g.kategori] || 0) + g.miktar; } });
  const aySayisi = Object.keys(oncekiAylar).length || 1;
  const ortKategori = {}; Object.values(oncekiAylar).forEach((m) => Object.entries(m).forEach(([k, v]) => { ortKategori[k] = (ortKategori[k] || 0) + v; }));
  Object.keys(ortKategori).forEach((k) => { ortKategori[k] /= aySayisi; });
  const anomaliler = Object.entries(ayGider).filter(([k, v]) => ortKategori[k] && v > ortKategori[k] * 1.5).map(([k, v]) => ({ kategori: k, simdi: v, ort: ortKategori[k], kat: (v / ortKategori[k]).toFixed(1) }));

  const bugunD = new Date(); const yaklasan = [];
  findata.abonelikler.forEach((a) => { const gun = new Date(a.tarih + "T00:00:00").getDate(); const sonraki = new Date(bugunD.getFullYear(), bugunD.getMonth(), gun); if (sonraki < bugunD) sonraki.setMonth(sonraki.getMonth() + 1); const fark = Math.ceil((sonraki - bugunD) / 86400000); if (fark <= 7) yaklasan.push({ ad: a.baslik, miktar: a.miktar, gun: fark, tip: "Abonelik" }); });
  (findata.sablonlar || []).filter((s) => s.tip === "gider").forEach((s) => { const sonraki = s.sonUretilen ? sonrakiTarih(s.sonUretilen, s.frekans) : s.baslangic; const fark = Math.ceil((new Date(sonraki + "T00:00:00") - bugunD) / 86400000); if (fark >= 0 && fark <= 7) yaklasan.push({ ad: s.baslik, miktar: s.miktar, gun: fark, tip: "Tekrar" }); });
  yaklasan.sort((a, b) => a.gun - b.gun);

  async function icgoruOlustur() {
    setIcYukleniyor(true);
    try { const ozet = { toplamGelir, toplamGider, toplamAbonelik, yatirimDeger, yatirimKar: Math.round(yatirimKar), netDeger: Math.round(netDeger), buAyGider: ayGider, aylikTrend: barData, butceler: findata.butceler, tahminiAylikNet: Math.round(aylikNet) }; const txt = await claudeCall([{ role: "user", content: `Kişisel finans asistanısın. Türk kullanıcının verisine göre kısa, eyleme dönük 4-5 içgörü üret. Para TL. SADECE JSON: {"ozet":"tek cümle","maddeler":["...","..."]}\n\nVeri: ${JSON.stringify(ozet)}` }]); setIcgoru(parseJSON(txt)); } catch (e) { bildir("İçgörü oluşturulamadı", "err"); } finally { setIcYukleniyor(false); }
  }

  return (
    <div>
      <HizliEkle findata={findata} ekle={ekle} kategoriOgren={kategoriOgren} bildir={bildir} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
        <Stat title="Net Varlık" value={TL(netDeger)} sub="nakit + yatırım" color={C.purple} icon="💎" />
        <Stat title="Yatırım Değeri" value={TL(yatirimDeger)} sub={`${karYuzde >= 0 ? "+" : ""}${karYuzde.toFixed(1)}% (${TL(yatirimKar)})`} subColor={yatirimKar >= 0 ? C.greenL : C.redL} color={C.indigo} icon="📈" />
        <Stat title="Toplam Gelir" value={TL(toplamGelir)} sub={`${findata.gelirler.length} kayıt`} color={C.green} icon="💰" />
        <Stat title="Gider + Abonelik" value={TL(toplamGider + toplamAbonelik)} sub={`${findata.giderler.length} gider · ${findata.abonelikler.length} abonelik`} color={C.red} icon="💸" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "1rem", marginBottom: "1rem" }}>
        <AcilFon nakit={nakit} toplamGider={toplamGider} toplamAbonelik={toplamAbonelik} aylik={aylik} />
        <NetVarlikGecmisKart findata={findata} portfoyGecmis={portfoyGecmis} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "1rem", marginBottom: "1rem" }}>
        <Card accent={negatifAy ? C.red : C.green}>
          <h3 style={sectionTitle}>🔮 Nakit Akış Tahmini</h3>
          {aylikNet === 0 && !findata.sablonlar?.length ? <p style={{ color: C.faint, fontSize: "0.82rem" }}>Tahmin için tekrarlayan gelir/gider ekleyin.</p> : (<>
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: C.dim }}>Tahmini aylık net: <b style={{ color: aylikNet >= 0 ? C.greenL : C.redL }}>{aylikNet >= 0 ? "+" : ""}{TL(aylikNet)}</b></p>
            <Sparkline points={tahmin} color={negatifAy ? C.red : C.greenL} height={70} width={280} />
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: C.dimmer }}>{negatifAy ? <span style={{ color: C.redL }}>⚠️ ~{negatifAy.ay} ay sonra bakiye negatife düşebilir ({TL(negatifAy.deger)})</span> : `6 ay sonra tahmini: ${TL(tahmin[5].deger)}`}</p>
          </>)}
        </Card>
        <Card accent={C.amber}>
          <h3 style={sectionTitle}>🔔 Yaklaşan Ödemeler (7 gün)</h3>
          {!yaklasan.length ? <p style={{ color: C.faint, fontSize: "0.82rem" }}>Önümüzdeki 7 günde ödeme yok.</p> : yaklasan.slice(0, 5).map((y, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.45rem 0", borderBottom: i < Math.min(yaklasan.length, 5) - 1 ? `1px solid ${C.line}` : "none" }}><span style={{ fontSize: "0.83rem", color: C.dim }}>{y.ad} <span style={tagStyle(y.tip === "Abonelik" ? C.amber : C.cyan)}>{y.gun === 0 ? "BUGÜN" : y.gun + " gün"}</span></span><span style={{ fontSize: "0.83rem", fontWeight: 600 }}>{TL(y.miktar)}</span></div>)}
        </Card>
      </div>

      {anomaliler.length > 0 && (
        <Card style={{ marginBottom: "1rem" }} accent={C.red}>
          <h3 style={sectionTitle}>🚨 Olağandışı Harcamalar (bu ay)</h3>
          {anomaliler.map((a) => <div key={a.kategori} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: `1px solid ${C.line}` }}><span style={{ fontSize: "0.85rem", color: C.dim }}>{a.kategori} <span style={tagStyle(C.red)}>{a.kat}× ORTALAMA</span></span><span style={{ fontSize: "0.82rem" }}><b style={{ color: C.redL }}>{TL(a.simdi)}</b> <span style={{ color: C.faint }}>(ort. {TL(a.ort)})</span></span></div>)}
        </Card>
      )}

      <Card style={{ marginBottom: "1rem" }} accent={C.cyan}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: icgoru ? "1rem" : 0, flexWrap: "wrap", gap: "0.5rem" }}><h3 style={{ ...sectionTitle, margin: 0 }}>✨ Akıllı İçgörüler</h3><Btn variant="ghost" onClick={icgoruOlustur} disabled={icYukleniyor}>{icYukleniyor ? "Analiz ediliyor…" : "İçgörü Oluştur"}</Btn></div>
        {icgoru && <div><p style={{ color: C.text, fontSize: "0.92rem", margin: "0 0 0.85rem", lineHeight: 1.5 }}>{icgoru.ozet}</p>{(icgoru.maddeler || []).map((m, i) => <div key={i} style={{ display: "flex", gap: "0.6rem", marginBottom: "0.5rem", alignItems: "flex-start" }}><span style={{ color: C.cyan, flexShrink: 0 }}>▸</span><span style={{ color: C.dim, fontSize: "0.85rem", lineHeight: 1.45 }}>{m}</span></div>)}</div>}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <Card><h3 style={sectionTitle}>Aylık Gelir / Gider</h3><BarChart data={barData} /><div style={{ display: "flex", gap: "1rem", marginTop: "0.75rem", fontSize: "0.75rem" }}><span style={{ color: C.greenL }}>● Gelir</span><span style={{ color: C.redL }}>● Gider</span></div></Card>
        <Card><h3 style={sectionTitle}>Portföy Büyümesi</h3><Sparkline points={portfoyGecmis} color={C.indigoL} height={140} width={300} /></Card>
      </div>

      {butceliler.length > 0 && (<Card style={{ marginBottom: "1rem" }}><h3 style={sectionTitle}>Bu Ay Bütçe Durumu ({ay})</h3>{butceliler.map((k) => { const h = ayGider[k] || 0, l = findata.butceler[k], pct = (h / l) * 100; return (<div key={k} style={{ marginBottom: "0.85rem" }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem", fontSize: "0.82rem" }}><span style={{ color: C.dim }}>{k} {pct >= 100 && <span style={tagStyle(C.red)}>AŞILDI</span>}</span><span style={{ color: C.text, fontWeight: 600 }}>{TL(h)} / {TL(l)}</span></div><ProgressBar value={h} max={l} /></div>); })}</Card>)}

      <Card><h3 style={sectionTitle}>Varlık Dağılımı</h3><DonutDagilim yatirimlar={findata.yatirimlar} guncelDeger={guncelDeger} /></Card>
    </div>
  );
}
function DonutDagilim({ yatirimlar, guncelDeger }) {
  const grup = {}; yatirimlar.forEach((y) => { grup[y.tip] = (grup[y.tip] || 0) + guncelDeger(y); });
  const toplam = Object.values(grup).reduce((a, b) => a + b, 0) || 1; const tipler = Object.keys(grup);
  if (!tipler.length) return <p style={{ color: C.faint, fontSize: "0.85rem" }}>Henüz yatırım yok.</p>;
  return <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.5rem" }}>{tipler.map((t) => { const vt = VARLIK_TIPLERI.find((v) => v.id === t); const y = (grup[t] / toplam) * 100; return <div key={t}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}><span style={{ color: C.dim, fontSize: "0.82rem" }}>{vt?.label} <span style={{ color: C.faint }}>%{y.toFixed(0)}</span></span><span style={{ color: C.text, fontWeight: 600, fontSize: "0.82rem" }}>{TL(grup[t])}</span></div><ProgressBar value={y} max={100} color={vt?.renk} /></div>; })}</div>;
}

// ---------- YATIRIM ----------
function Yatirimlar({ findata, setFindata, guncelDeger, onEkle, onSil, onGuncelle, guncelleniyor }) {
  const [hedefAcik, setHedefAcik] = useState(false);
  const enf = findata.ayarlar?.enflasyon || 0;
  const toplam = findata.yatirimlar.reduce((s, y) => s + guncelDeger(y), 0);
  const maliyet = findata.yatirimlar.reduce((s, y) => s + y.adet * y.alisFiyati, 0);
  const kar = toplam - maliyet;
  const reelDeger = findata.yatirimlar.reduce((s, y) => { const yil = Math.max(0, (Date.now() - new Date(y.alisTarihi)) / (365 * 86400000)); const kat = Math.pow(1 + enf / 100, yil); return s + guncelDeger(y) / kat; }, 0);
  const reelKar = reelDeger - maliyet;
  const grup = {}; findata.yatirimlar.forEach((y) => { grup[y.tip] = (grup[y.tip] || 0) + guncelDeger(y); });
  const hedefDagilim = findata.hedefDagilim || {};
  const kur = findata.kurlar;

  const gunluk = (y) => (!y.oncekiFiyat || !y.guncelFiyat) ? null : ((y.guncelFiyat - y.oncekiFiyat) / y.oncekiFiyat) * 100;
  const haftalik = (y) => { const g = y.gecmis || []; if (g.length < 2) return null; const son = g[g.length - 1]; const ht = new Date(); ht.setDate(ht.getDate() - 7); const t = ht.toISOString().split("T")[0]; const o = g.filter((p) => p.tarih <= t).pop() || g[0]; if (!o || !o.deger) return null; return ((son.deger - o.deger) / o.deger) * 100; };
  const hedefKaydet = (tip, val) => setFindata((d) => ({ ...d, hedefDagilim: { ...(d.hedefDagilim || {}), [tip]: parseFloat(val) || 0 } }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div><h2 style={pageTitle}>Yatırımlar</h2><p style={{ margin: 0, color: C.indigoL, fontWeight: 600, fontSize: "0.9rem" }}>Portföy: {TL(toplam)}{kur && <span style={{ color: C.faint, fontWeight: 400 }}> · ${(toplam / kur.usd).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</span>}</p></div>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}><Btn variant="ghost" onClick={() => setHedefAcik(!hedefAcik)}>🎯 Hedef Dağılım</Btn><Btn variant="ghost" onClick={onGuncelle} disabled={guncelleniyor}>{guncelleniyor ? "Güncelleniyor…" : "🔄 Fiyatları Güncelle"}</Btn><Btn onClick={onEkle}>+ Yatırım</Btn></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <Stat title="Nominal Kâr/Zarar" value={`${kar >= 0 ? "+" : ""}${TL(kar)}`} sub={`${maliyet ? ((kar / maliyet) * 100).toFixed(1) : 0}% getiri`} subColor={kar >= 0 ? C.greenL : C.redL} color={kar >= 0 ? C.green : C.red} icon="📊" />
        <Stat title={`Reel K/Z (enf. %${enf})`} value={`${reelKar >= 0 ? "+" : ""}${TL(reelKar)}`} sub={reelKar >= 0 ? "Enflasyonu yendin 👍" : "Enflasyonun altında kaldı"} subColor={reelKar >= 0 ? C.greenL : C.redL} color={C.cyan} icon="🔥" />
      </div>

      {hedefAcik && (
        <Card style={{ marginBottom: "1rem" }}>
          <h3 style={sectionTitle}>Hedef Dağılım vs Gerçek</h3>
          {VARLIK_TIPLERI.map((vt) => { const gercek = toplam ? ((grup[vt.id] || 0) / toplam) * 100 : 0; const hedef = hedefDagilim[vt.id] || 0; const sapma = gercek - hedef; return (<div key={vt.id} style={{ marginBottom: "0.9rem" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem", gap: "0.75rem" }}><span style={{ color: C.dim, fontSize: "0.82rem", minWidth: 90 }}>{vt.label}</span><div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.78rem" }}><span style={{ color: C.text }}>%{gercek.toFixed(0)}</span><span style={{ color: C.dimmer }}>Hedef</span><input type="number" value={hedef || ""} onChange={(e) => hedefKaydet(vt.id, e.target.value)} placeholder="0" style={{ ...inputStyle, width: 56, padding: "0.25rem 0.4rem", fontSize: "0.78rem" }} /><span style={{ color: C.dimmer }}>%</span>{hedef > 0 && Math.abs(sapma) > 5 && <span style={tagStyle(sapma > 0 ? C.amber : C.cyan)}>{sapma > 0 ? "FAZLA" : "AZ"}</span>}</div></div><div style={{ position: "relative" }}><ProgressBar value={gercek} max={100} color={vt.renk} />{hedef > 0 && <div style={{ position: "absolute", top: -2, left: `${Math.min(100, hedef)}%`, width: 2, height: 12, background: "#fff" }} />}</div></div>); })}
        </Card>
      )}

      {!findata.yatirimlar.length && <Bos mesaj="Henüz yatırım yok. Kripto, altın, döviz veya hisse ekleyin." />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: "1rem" }}>
        {findata.yatirimlar.map((y) => { const vt = VARLIK_TIPLERI.find((v) => v.id === y.tip); const deger = guncelDeger(y), mal = y.adet * y.alisFiyati, kz = deger - mal, kzY = mal ? (kz / mal) * 100 : 0; const gun = gunluk(y), haf = haftalik(y); return (
          <Card key={y.id} accent={vt?.renk}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}><div><p style={{ margin: "0 0 0.15rem", fontWeight: 700, fontSize: "1rem" }}>{y.ad} <span style={{ color: C.faint, fontWeight: 400, fontSize: "0.78rem" }}>{y.sembol}</span></p><p style={{ margin: 0, color: C.dimmer, fontSize: "0.74rem" }}>{vt?.label} · {y.adet} {vt?.birim}</p></div><DelBtn onClick={() => onSil(y.id)} /></div>
            <p style={{ margin: "0 0 0.4rem", fontWeight: 700, fontSize: "1.3rem" }}>{TL2(deger)}</p>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap" }}><span style={{ background: kz >= 0 ? "#0D2718" : "#1F0A0A", border: `1px solid ${kz >= 0 ? "#166534" : "#7F1D1D"}`, color: kz >= 0 ? C.greenL : C.redL, padding: "0.18rem 0.5rem", borderRadius: 999, fontSize: "0.72rem", fontWeight: 600 }}>Top {kz >= 0 ? "+" : ""}{kzY.toFixed(1)}%</span>{gun !== null && <span style={{ color: gun >= 0 ? C.greenL : C.redL, fontSize: "0.72rem", fontWeight: 600 }}>Gün {gun >= 0 ? "+" : ""}{gun.toFixed(1)}%</span>}{haf !== null && <span style={{ color: haf >= 0 ? C.greenL : C.redL, fontSize: "0.72rem", fontWeight: 600 }}>Hafta {haf >= 0 ? "+" : ""}{haf.toFixed(1)}%</span>}</div>
            <Sparkline points={y.gecmis} color={vt?.renk} height={48} width={260} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.6rem", fontSize: "0.72rem", color: C.faint }}><span>Alış {TL2(y.alisFiyati)}</span><span>Güncel {y.guncelFiyat ? TL2(y.guncelFiyat) : "—"}</span></div>
          </Card>); })}
      </div>
    </div>
  );
}
function YatirimModal({ form, setForm, onClose, onKaydet }) {
  const vt = VARLIK_TIPLERI.find((v) => v.id === form.tip);
  return (<Modal title="Yatırım Ekle" onClose={onClose}><Field label="Varlık Tipi" value={form.tip} onChange={(v) => setForm((f) => ({ ...f, tip: v }))} options={VARLIK_TIPLERI} /><Field label="Ad" value={form.ad} onChange={(v) => setForm((f) => ({ ...f, ad: v }))} placeholder="Bitcoin / Gram Altın / THYAO" /><Field label="Sembol (fiyat için)" value={form.sembol} onChange={(v) => setForm((f) => ({ ...f, sembol: v }))} placeholder={form.tip === "kripto" ? "BTC, ETH…" : form.tip === "doviz" ? "USD, EUR…" : form.tip === "hisse" ? "THYAO…" : "altın"} /><div style={{ display: "flex", gap: "0.75rem" }}><div style={{ flex: 1 }}><Field label={`Miktar (${vt?.birim})`} type="number" value={form.adet} onChange={(v) => setForm((f) => ({ ...f, adet: v }))} /></div><div style={{ flex: 1 }}><Field label="Alış Fiyatı (₺)" type="number" value={form.alisFiyati} onChange={(v) => setForm((f) => ({ ...f, alisFiyati: v }))} /></div></div><Field label="Alış Tarihi" type="date" value={form.alisTarihi} onChange={(v) => setForm((f) => ({ ...f, alisTarihi: v }))} /><Btn onClick={onKaydet} style={{ width: "100%", padding: "0.7rem", marginTop: "0.3rem" }}>Yatırımı Ekle</Btn></Modal>);
}

// ---------- İŞLEM MODALI ----------
function IslemModal({ title, form, setForm, kategoriler, miktarLabel, variant, noTekrar, noHane, hafiza, onClose, onKaydet }) {
  const oneri = (hafiza || {})[kategoriAnahtar(form.baslik)];
  return (<Modal title={title} onClose={onClose}>
    <Field label="Başlık" value={form.baslik} onChange={(v) => setForm((f) => ({ ...f, baslik: v }))} />
    {oneri && oneri !== form.kategori && <p style={{ margin: "-0.4rem 0 0.8rem", fontSize: "0.74rem", color: C.cyan, cursor: "pointer" }} onClick={() => setForm((f) => ({ ...f, kategori: oneri }))}>💡 Önceki seçimine göre kategori: <b>{oneri}</b> (uygulamak için dokun)</p>}
    <Field label={miktarLabel || "Miktar (₺)"} type="number" value={form.miktar} onChange={(v) => setForm((f) => ({ ...f, miktar: v }))} />
    <Field label="Kategori" value={form.kategori} onChange={(v) => setForm((f) => ({ ...f, kategori: v }))} options={kategoriler} />
    <Field label="Tarih" type="date" value={form.tarih} onChange={(v) => setForm((f) => ({ ...f, tarih: v }))} />
    {!noTekrar && <Toggle label="Otomatik tekrarla" checked={!!form.tekrarla} onChange={(v) => setForm((f) => ({ ...f, tekrarla: v }))} />}
    {!noTekrar && form.tekrarla && <Field label="Sıklık" value={form.frekans || "aylık"} onChange={(v) => setForm((f) => ({ ...f, frekans: v }))} options={["haftalık", "aylık", "yıllık"]} />}
    {!noHane && <Toggle label="Ortak hane bütçesine dahil et" checked={!!form.hane} onChange={(v) => setForm((f) => ({ ...f, hane: v }))} />}
    <Btn variant={variant} onClick={onKaydet} style={{ width: "100%", padding: "0.7rem", marginTop: "0.3rem" }}>Kaydet</Btn>
  </Modal>);
}

// ---------- LİSTELER ----------
function Liste({ baslik, renk, toplam, kayitlar, onEkle, onSil, altBilgi }) {
  return (<div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}><div><h2 style={pageTitle}>{baslik}</h2><p style={{ margin: 0, color: renk, fontWeight: 600 }}>Toplam: {TL(toplam)}</p></div><Btn onClick={onEkle}>+ Ekle</Btn></div>{!kayitlar.length && <Bos mesaj="Henüz kayıt yok." />}{kayitlar.slice().sort((a, b) => (b.tarih || "").localeCompare(a.tarih || "")).map((x) => (<div key={x.id} style={rowStyle}><div><p style={{ margin: "0 0 0.2rem", fontWeight: 600, fontSize: "0.9rem" }}>{x.baslik}{x.otomatik && <span style={tagStyle(C.cyan)}>OTOMATİK</span>}{x.hane && <span style={tagStyle(C.purple)}>HANE</span>}</p><p style={{ margin: 0, color: C.dimmer, fontSize: "0.73rem" }}>{altBilgi(x)}</p></div><div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}><p style={{ margin: 0, fontWeight: 700 }}>{TL(x.miktar)}</p><DelBtn onClick={() => onSil(x.id)} /></div></div>))}</div>);
}
function GiderListe({ findata, onEkle, onSil }) {
  const toplam = findata.giderler.reduce((s, x) => s + x.miktar, 0); const [acik, setAcik] = useState(null);
  return (<div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}><div><h2 style={pageTitle}>Giderler</h2><p style={{ margin: 0, color: C.redL, fontWeight: 600 }}>Toplam: {TL(toplam)}</p></div><Btn onClick={onEkle}>+ Ekle</Btn></div>{!findata.giderler.length && <Bos mesaj="Henüz gider yok. Manuel ekleyin veya 'İçe Aktar'dan fiş/ekstre yükleyin." />}{findata.giderler.slice().sort((a, b) => (b.tarih || "").localeCompare(a.tarih || "")).map((x) => (<div key={x.id}><div style={{ ...rowStyle, cursor: x.kalemler?.length ? "pointer" : "default" }} onClick={() => x.kalemler?.length && setAcik(acik === x.id ? null : x.id)}><div><p style={{ margin: "0 0 0.2rem", fontWeight: 600, fontSize: "0.9rem" }}>{x.baslik}{x.kalemler?.length ? <span style={{ color: C.indigoL, fontSize: "0.72rem", marginLeft: 6 }}>▸ {x.kalemler.length} kalem</span> : null}{x.kaynak === "fis" && <span style={tagStyle("#10A37F")}>FİŞ</span>}{x.kaynak === "ekstre" && <span style={tagStyle("#6366F1")}>EKSTRE</span>}{x.otomatik && <span style={tagStyle(C.cyan)}>OTOMATİK</span>}{x.hane && <span style={tagStyle(C.purple)}>HANE</span>}</p><p style={{ margin: 0, color: C.dimmer, fontSize: "0.73rem" }}>{x.kategori} · {x.tarih}</p></div><div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}><p style={{ margin: 0, fontWeight: 700 }}>{TL(x.miktar)}</p><DelBtn onClick={(e) => { e.stopPropagation(); onSil(x.id); }} /></div></div>{acik === x.id && x.kalemler?.length > 0 && <div style={{ background: "#080A10", border: `1px solid ${C.line}`, borderTop: "none", borderRadius: "0 0 0.6rem 0.6rem", padding: "0.5rem 1rem", marginTop: -8, marginBottom: "0.5rem" }}>{x.kalemler.map((k, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0", fontSize: "0.8rem", borderBottom: i < x.kalemler.length - 1 ? `1px solid ${C.line}` : "none" }}><span style={{ color: C.dim }}>{k.ad} {k.miktar ? <span style={{ color: C.faint }}>× {k.miktar}</span> : null}</span><span style={{ color: C.text }}>{TL2(k.fiyat)}</span></div>)}</div>}</div>))}</div>);
}
function Abonelikler({ findata, bildir, onEkle, onSil }) {
  const toplam = findata.abonelikler.reduce((s, x) => s + x.miktar, 0);
  const [denetim, setDenetim] = useState(null); const [denetleniyor, setDenetleniyor] = useState(false);
  async function denetle() {
    if (!findata.abonelikler.length) { bildir("Önce abonelik ekleyin"); return; }
    setDenetleniyor(true);
    try { const liste = findata.abonelikler.map((a) => ({ ad: a.baslik, kategori: a.kategori, aylik: a.miktar })); const txt = await claudeCall([{ role: "user", content: `Türk kullanıcının abonelikleri: ${JSON.stringify(liste)}. Toplam aylık ${toplam}₺. Tasarruf gözüyle değerlendir: hangileri pahalı/gereksiz olabilir, yıllık plana geçilebilir mi, benzer ucuz alternatif var mı. SADECE JSON: {"ozet":"tek cümle","oneriler":["...","..."]}` }], true); setDenetim(parseJSON(txt)); } catch { bildir("Denetim yapılamadı", "err"); } finally { setDenetleniyor(false); }
  }
  return (<div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.6rem" }}><div><h2 style={pageTitle}>Abonelikler</h2><p style={{ margin: 0, color: C.amber, fontWeight: 600 }}>Aylık: {TL(toplam)} · Yıllık: {TL(toplam * 12)}</p></div><div style={{ display: "flex", gap: "0.5rem" }}><Btn variant="ghost" onClick={denetle} disabled={denetleniyor}>{denetleniyor ? "Denetleniyor…" : "🔍 Denetle"}</Btn><Btn onClick={onEkle}>+ Ekle</Btn></div></div>{denetim && <Card accent={C.cyan} style={{ marginBottom: "1rem" }}><h3 style={sectionTitle}>🔍 Abonelik Denetimi</h3><p style={{ color: C.text, fontSize: "0.9rem", margin: "0 0 0.85rem", lineHeight: 1.5 }}>{denetim.ozet}</p>{(denetim.oneriler || []).map((o, i) => <div key={i} style={{ display: "flex", gap: "0.6rem", marginBottom: "0.5rem", alignItems: "flex-start" }}><span style={{ color: C.amber, flexShrink: 0 }}>💡</span><span style={{ color: C.dim, fontSize: "0.85rem", lineHeight: 1.45 }}>{o}</span></div>)}</Card>}{!findata.abonelikler.length && <Bos mesaj="Henüz abonelik yok." />}<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: "1rem" }}>{findata.abonelikler.map((a) => <Card key={a.id} accent={C.amber}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}><div><p style={{ margin: "0 0 0.25rem", fontWeight: 700, fontSize: "1rem" }}>{a.baslik}</p><p style={{ margin: "0 0 0.6rem", color: C.dimmer, fontSize: "0.74rem" }}>{a.kategori}</p><p style={{ margin: 0, fontWeight: 700, fontSize: "1.1rem" }}>{TL(a.miktar)}<span style={{ color: C.faint, fontWeight: 400, fontSize: "0.72rem" }}>/ay</span></p></div><DelBtn onClick={() => onSil(a.id)} /></div></Card>)}</div></div>);
}

// ---------- PLANLAMA ----------
function Planlama({ findata, setFindata, bildir }) {
  const [alt, setAlt] = useState("butce");
  return (<div><h2 style={pageTitle}>Bütçe & Hedef</h2><div style={{ display: "flex", gap: "0.5rem", margin: "0.75rem 0 1.25rem", flexWrap: "wrap" }}><Btn variant={alt === "butce" ? "primary" : "ghost"} onClick={() => setAlt("butce")}>📊 Kategori Bütçeleri</Btn><Btn variant={alt === "zarf" ? "primary" : "ghost"} onClick={() => setAlt("zarf")}>✉️ Zarf Bütçe</Btn><Btn variant={alt === "hedef" ? "primary" : "ghost"} onClick={() => setAlt("hedef")}>🎯 Hedefler</Btn><Btn variant={alt === "tekrar" ? "primary" : "ghost"} onClick={() => setAlt("tekrar")}>🔁 Tekrarlayanlar</Btn><Btn variant={alt === "basarim" ? "primary" : "ghost"} onClick={() => setAlt("basarim")}>🏆 Başarımlar</Btn></div>{alt === "butce" && <Butceler findata={findata} setFindata={setFindata} />}{alt === "zarf" && <Zarflar findata={findata} setFindata={setFindata} bildir={bildir} />}{alt === "hedef" && <Hedefler findata={findata} setFindata={setFindata} bildir={bildir} />}{alt === "tekrar" && <Tekrarlayanlar findata={findata} setFindata={setFindata} bildir={bildir} />}{alt === "basarim" && <Basarimlar findata={findata} setFindata={setFindata} bildir={bildir} />}</div>);
}
function Butceler({ findata, setFindata }) {
  const ay = buAy(); const ayGider = {}; findata.giderler.filter((g) => (g.tarih || "").startsWith(ay)).forEach((g) => { ayGider[g.kategori] = (ayGider[g.kategori] || 0) + g.miktar; });
  const set = (kat, val) => setFindata((d) => ({ ...d, butceler: { ...(d.butceler || {}), [kat]: parseFloat(val) || 0 } }));
  return (<Card><h3 style={sectionTitle}>Aylık Kategori Limitleri ({ay})</h3><p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 1.25rem" }}>Limit gir; %80'de sarı, aşımda kırmızı uyarı verir, panelde takip edilir.</p>{GIDER_KAT.map((k) => { const h = ayGider[k] || 0, l = (findata.butceler || {})[k] || 0; return (<div key={k} style={{ marginBottom: "1rem" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem", gap: "0.75rem" }}><span style={{ color: C.dim, fontSize: "0.85rem", minWidth: 90 }}>{k}</span><div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><span style={{ color: C.dimmer, fontSize: "0.78rem" }}>{TL(h)} /</span><input type="number" value={l || ""} onChange={(e) => set(k, e.target.value)} placeholder="limit" style={{ ...inputStyle, width: 110, padding: "0.35rem 0.5rem", fontSize: "0.82rem" }} /></div></div>{l > 0 && <ProgressBar value={h} max={l} />}</div>); })}</Card>);
}
function Hedefler({ findata, setFindata, bildir }) {
  const [form, setForm] = useState({ ad: "", tip: "birikim", hedefTutar: "", mevcutTutar: "", aylikKatki: "" }); const hedefler = findata.hedefler || [];
  function ekle() { if (!form.ad || !form.hedefTutar) { bildir("Ad ve hedef tutar gerekli", "err"); return; } setFindata((d) => ({ ...d, hedefler: [...(d.hedefler || []), { id: uid(), ad: form.ad, tip: form.tip, hedefTutar: parseFloat(form.hedefTutar), mevcutTutar: parseFloat(form.mevcutTutar) || 0, aylikKatki: parseFloat(form.aylikKatki) || 0 }] })); setForm({ ad: "", tip: "birikim", hedefTutar: "", mevcutTutar: "", aylikKatki: "" }); bildir("Hedef eklendi"); }
  function guncelle(id, delta) { setFindata((d) => ({ ...d, hedefler: d.hedefler.map((h) => h.id === id ? { ...h, mevcutTutar: Math.max(0, h.mevcutTutar + delta) } : h) })); }
  function sil(id) { setFindata((d) => ({ ...d, hedefler: d.hedefler.filter((h) => h.id !== id) })); }
  return (<div><Card style={{ marginBottom: "1.25rem" }}><h3 style={sectionTitle}>Yeni Hedef</h3><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}><Field label="Ad" value={form.ad} onChange={(v) => setForm((f) => ({ ...f, ad: v }))} placeholder="Acil fon / Araba kredisi" /><Field label="Tür" value={form.tip} onChange={(v) => setForm((f) => ({ ...f, tip: v }))} options={[{ id: "birikim", label: "Birikim" }, { id: "borc", label: "Borç Ödeme" }]} /><Field label="Hedef Tutar (₺)" type="number" value={form.hedefTutar} onChange={(v) => setForm((f) => ({ ...f, hedefTutar: v }))} /><Field label={form.tip === "borc" ? "Kalan Borç (₺)" : "Mevcut (₺)"} type="number" value={form.mevcutTutar} onChange={(v) => setForm((f) => ({ ...f, mevcutTutar: v }))} /><Field label="Aylık Katkı/Ödeme (₺)" type="number" value={form.aylikKatki} onChange={(v) => setForm((f) => ({ ...f, aylikKatki: v }))} /></div><Btn onClick={ekle}>+ Hedef Ekle</Btn></Card>{!hedefler.length && <Bos mesaj="Henüz hedef yok." />}<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: "1rem" }}>{hedefler.map((h) => { const borc = h.tip === "borc"; const kalan = borc ? h.mevcutTutar : h.hedefTutar - h.mevcutTutar; const pct = borc ? ((h.hedefTutar - h.mevcutTutar) / h.hedefTutar) * 100 : (h.mevcutTutar / h.hedefTutar) * 100; const ayT = h.aylikKatki > 0 ? Math.ceil(kalan / h.aylikKatki) : null; return (<Card key={h.id} accent={borc ? C.red : C.green}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}><div><p style={{ margin: "0 0 0.15rem", fontWeight: 700, fontSize: "1rem" }}>{h.ad}</p><p style={{ margin: 0, color: C.dimmer, fontSize: "0.73rem" }}>{borc ? "Borç ödeme" : "Birikim"}</p></div><DelBtn onClick={() => sil(h.id)} /></div><p style={{ margin: "0.5rem 0 0.3rem", fontSize: "0.85rem", color: C.dim }}>{borc ? `Kalan: ${TL(h.mevcutTutar)}` : `${TL(h.mevcutTutar)} / ${TL(h.hedefTutar)}`}</p><ProgressBar value={borc ? h.hedefTutar - h.mevcutTutar : h.mevcutTutar} max={h.hedefTutar} color={borc ? C.green : C.indigo} /><p style={{ margin: "0.5rem 0 0", fontSize: "0.78rem", color: C.dimmer }}>%{Math.min(100, Math.max(0, pct)).toFixed(0)} {borc ? "ödendi" : "tamam"}{ayT ? ` · ~${ayT} ay kaldı` : ""}</p><Btn variant="ghost" onClick={() => guncelle(h.id, h.aylikKatki || 100)} style={{ width: "100%", fontSize: "0.78rem", padding: "0.4rem", marginTop: "0.75rem" }}>{borc ? "− Ödeme" : "+ Katkı"} {h.aylikKatki ? TL(h.aylikKatki) : ""}</Btn></Card>); })}</div></div>);
}
function Tekrarlayanlar({ findata, setFindata, bildir }) {
  const sablonlar = findata.sablonlar || [];
  function sil(id) { setFindata((d) => ({ ...d, sablonlar: d.sablonlar.filter((s) => s.id !== id) })); bildir("Tekrar şablonu silindi"); }
  return (<Card><h3 style={sectionTitle}>Aktif Tekrarlayan İşlemler</h3><p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 1.25rem" }}>"Otomatik tekrarla" seçtiğin işlemler burada; her dönem otomatik oluşturulur.</p>{!sablonlar.length && <Bos mesaj="Tekrarlayan işlem yok." />}{sablonlar.map((s) => <div key={s.id} style={rowStyle}><div><p style={{ margin: "0 0 0.2rem", fontWeight: 600, fontSize: "0.9rem" }}>{s.baslik} <span style={tagStyle(s.tip === "gelir" ? C.green : s.tip === "abonelik" ? C.amber : C.red)}>{s.tip.toUpperCase()}</span><span style={tagStyle(C.cyan)}>{s.frekans.toUpperCase()}</span></p><p style={{ margin: 0, color: C.dimmer, fontSize: "0.73rem" }}>{s.kategori} · son: {s.sonUretilen || "—"}</p></div><div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}><p style={{ margin: 0, fontWeight: 700 }}>{TL(s.miktar)}</p><DelBtn onClick={() => sil(s.id)} /></div></div>)}</Card>);
}

// ---------- ANALİZ ----------
function Analiz({ findata, guncelDeger }) {
  const [alt, setAlt] = useState("karsilastir");
  return (<div><h2 style={pageTitle}>Analiz</h2><div style={{ display: "flex", gap: "0.5rem", margin: "0.75rem 0 1.25rem", flexWrap: "wrap" }}><Btn variant={alt === "karsilastir" ? "primary" : "ghost"} onClick={() => setAlt("karsilastir")}>📊 Dönem Karşılaştırma</Btn><Btn variant={alt === "birikim" ? "primary" : "ghost"} onClick={() => setAlt("birikim")}>💰 Birikim Simülasyonu</Btn><Btn variant={alt === "borc" ? "primary" : "ghost"} onClick={() => setAlt("borc")}>🏦 Borç Hesaplayıcı</Btn><Btn variant={alt === "enflasyon" ? "primary" : "ghost"} onClick={() => setAlt("enflasyon")}>🔥 Enflasyon Aşındırma</Btn></div>{alt === "karsilastir" && <DonemKarsilastir findata={findata} />}{alt === "birikim" && <BirikimSim />}{alt === "borc" && <BorcHesap />}{alt === "enflasyon" && <EnflasyonAsindirma findata={findata} />}</div>);
}
function DonemKarsilastir({ findata }) {
  const ayTopla = (prefix) => { const o = { gelir: 0, gider: 0, kat: {} }; findata.gelirler.filter((g) => (g.tarih || "").startsWith(prefix)).forEach((g) => o.gelir += g.miktar); findata.giderler.filter((g) => (g.tarih || "").startsWith(prefix)).forEach((g) => { o.gider += g.miktar; o.kat[g.kategori] = (o.kat[g.kategori] || 0) + g.miktar; }); return o; };
  const d = new Date(); const buAyP = d.toISOString().slice(0, 7);
  const onceki = new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 7);
  const gecenYil = new Date(d.getFullYear() - 1, d.getMonth(), 1).toISOString().slice(0, 7);
  const a = ayTopla(buAyP), b = ayTopla(onceki), c = ayTopla(gecenYil);
  const fark = (x, y) => y === 0 ? (x > 0 ? 100 : 0) : ((x - y) / y) * 100;
  const tumKat = [...new Set([...Object.keys(a.kat), ...Object.keys(b.kat)])];
  const Sat = ({ ad, x, y }) => { const f = fark(x, y); return (<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: `1px solid ${C.line}`, fontSize: "0.83rem" }}><span style={{ color: C.dim }}>{ad}</span><div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}><span style={{ color: C.text }}>{TL(x)}</span><span style={{ color: f > 0 ? C.redL : f < 0 ? C.greenL : C.faint, fontSize: "0.75rem", minWidth: 52, textAlign: "right" }}>{f > 0 ? "▲" : f < 0 ? "▼" : ""}{Math.abs(f).toFixed(0)}%</span></div></div>); };
  return (<div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "1rem", marginBottom: "1rem" }}><Stat title={`Bu Ay (${buAyP.slice(5)})`} value={TL(a.gider)} sub={`Gelir ${TL(a.gelir)}`} color={C.indigo} icon="📅" /><Stat title={`Geçen Ay (${onceki.slice(5)})`} value={TL(b.gider)} sub={`Gelir ${TL(b.gelir)}`} color={C.dimmer} icon="📆" /><Stat title={`Geçen Yıl (${gecenYil.slice(0, 4)})`} value={TL(c.gider)} sub={`Gelir ${TL(c.gelir)}`} color={C.faint} icon="🗓️" /></div><Card><h3 style={sectionTitle}>Kategori Bazında: Bu Ay vs Geçen Ay</h3>{!tumKat.length && <p style={{ color: C.faint, fontSize: "0.85rem" }}>Karşılaştırılacak veri yok.</p>}{tumKat.map((k) => <Sat key={k} ad={k} x={a.kat[k] || 0} y={b.kat[k] || 0} />)}<div style={{ marginTop: "0.75rem" }}><Sat ad="TOPLAM GİDER" x={a.gider} y={b.gider} /></div></Card></div>);
}
function BirikimSim() {
  const [aylik, setAylik] = useState("5000"); const [getiri, setGetiri] = useState("40"); const [yil, setYil] = useState("5"); const [baslangic, setBaslangic] = useState("0");
  const ay = parseFloat(aylik) || 0, r = (parseFloat(getiri) || 0) / 100 / 12, n = (parseFloat(yil) || 0) * 12, p0 = parseFloat(baslangic) || 0;
  const seri = []; let bak = p0; for (let i = 1; i <= n; i++) { bak = bak * (1 + r) + ay; if (i % Math.max(1, Math.round(n / 30)) === 0 || i === n) seri.push({ deger: bak, ay: i }); }
  const sonuc = bak; const yatirilan = p0 + ay * n; const kazanc = sonuc - yatirilan;
  return (<Card><h3 style={sectionTitle}>Birikim Simülasyonu</h3><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "0.75rem", marginBottom: "1rem" }}><Field label="Aylık Yatırım (₺)" type="number" value={aylik} onChange={setAylik} /><Field label="Yıllık Getiri (%)" type="number" value={getiri} onChange={setGetiri} /><Field label="Süre (yıl)" type="number" value={yil} onChange={setYil} /><Field label="Başlangıç (₺)" type="number" value={baslangic} onChange={setBaslangic} /></div><Sparkline points={seri} color={C.greenL} height={120} width={400} /><div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.75rem", marginTop: "1rem" }}><div style={{ textAlign: "center" }}><p style={{ color: C.dimmer, fontSize: "0.72rem", margin: "0 0 0.25rem" }}>Yatırdığın</p><p style={{ color: C.text, fontWeight: 700, margin: 0 }}>{TL(yatirilan)}</p></div><div style={{ textAlign: "center" }}><p style={{ color: C.dimmer, fontSize: "0.72rem", margin: "0 0 0.25rem" }}>Kazanç</p><p style={{ color: C.greenL, fontWeight: 700, margin: 0 }}>{TL(kazanc)}</p></div><div style={{ textAlign: "center" }}><p style={{ color: C.dimmer, fontSize: "0.72rem", margin: "0 0 0.25rem" }}>Toplam</p><p style={{ color: C.indigoL, fontWeight: 700, margin: 0 }}>{TL(sonuc)}</p></div></div><p style={{ color: C.faint, fontSize: "0.72rem", margin: "1rem 0 0", textAlign: "center" }}>Bileşik getiri varsayımıyla; gerçek getiri değişkendir.</p></Card>);
}
function BorcHesap() {
  const [borc, setBorc] = useState("100000"); const [faiz, setFaiz] = useState("3"); const [odeme, setOdeme] = useState("5000");
  const P = parseFloat(borc) || 0, r = (parseFloat(faiz) || 0) / 100, A = parseFloat(odeme) || 0;
  let bak = P, ay = 0, toplamFaiz = 0; const seri = [{ deger: P, ay: 0 }];
  if (A > P * r) { while (bak > 0 && ay < 600) { const f = bak * r; toplamFaiz += f; bak = bak + f - A; ay++; if (ay % 2 === 0 || bak <= 0) seri.push({ deger: Math.max(0, bak), ay }); } }
  const bitmiyor = A <= P * r;
  return (<Card><h3 style={sectionTitle}>Borç Ödeme Hesaplayıcı</h3><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "0.75rem", marginBottom: "1rem" }}><Field label="Kalan Borç (₺)" type="number" value={borc} onChange={setBorc} /><Field label="Aylık Faiz (%)" type="number" value={faiz} onChange={setFaiz} /><Field label="Aylık Ödeme (₺)" type="number" value={odeme} onChange={setOdeme} /></div>{bitmiyor ? <p style={{ color: C.redL, fontSize: "0.85rem" }}>⚠️ Aylık ödeme faizi karşılamıyor; bu ödemeyle borç kapanmaz. Ödemeyi artırın.</p> : (<><Sparkline points={seri} color={C.redL} height={110} width={400} fill={false} /><div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.75rem", marginTop: "1rem" }}><div style={{ textAlign: "center" }}><p style={{ color: C.dimmer, fontSize: "0.72rem", margin: "0 0 0.25rem" }}>Süre</p><p style={{ color: C.text, fontWeight: 700, margin: 0 }}>{ay} ay (~{(ay / 12).toFixed(1)} yıl)</p></div><div style={{ textAlign: "center" }}><p style={{ color: C.dimmer, fontSize: "0.72rem", margin: "0 0 0.25rem" }}>Toplam Faiz</p><p style={{ color: C.redL, fontWeight: 700, margin: 0 }}>{TL(toplamFaiz)}</p></div><div style={{ textAlign: "center" }}><p style={{ color: C.dimmer, fontSize: "0.72rem", margin: "0 0 0.25rem" }}>Toplam Ödeme</p><p style={{ color: C.amber, fontWeight: 700, margin: 0 }}>{TL(P + toplamFaiz)}</p></div></div></>)}</Card>);
}

// ---------- TAKVİM ----------
function Takvim({ findata }) {
  const [ref, setRef] = useState(new Date());
  const yil = ref.getFullYear(), ayIdx = ref.getMonth();
  const ilkGun = new Date(yil, ayIdx, 1); const baslangicGun = (ilkGun.getDay() + 6) % 7;
  const gunSayisi = new Date(yil, ayIdx + 1, 0).getDate();
  const ayPrefix = `${yil}-${String(ayIdx + 1).padStart(2, "0")}`;
  const gunVerisi = {};
  findata.gelirler.filter((g) => (g.tarih || "").startsWith(ayPrefix)).forEach((g) => { const d = parseInt(g.tarih.slice(8, 10)); gunVerisi[d] = gunVerisi[d] || { gelir: 0, gider: 0, abonelik: 0 }; gunVerisi[d].gelir += g.miktar; });
  findata.giderler.filter((g) => (g.tarih || "").startsWith(ayPrefix)).forEach((g) => { const d = parseInt(g.tarih.slice(8, 10)); gunVerisi[d] = gunVerisi[d] || { gelir: 0, gider: 0, abonelik: 0 }; gunVerisi[d].gider += g.miktar; });
  findata.abonelikler.forEach((a) => { const d = new Date(a.tarih + "T00:00:00").getDate(); if (d <= gunSayisi) { gunVerisi[d] = gunVerisi[d] || { gelir: 0, gider: 0, abonelik: 0 }; gunVerisi[d].abonelik += a.miktar; } });
  const bugunStr = bugun();
  const hucreler = []; for (let i = 0; i < baslangicGun; i++) hucreler.push(null); for (let g = 1; g <= gunSayisi; g++) hucreler.push(g);
  return (<div><h2 style={pageTitle}>Takvim</h2><Card style={{ marginTop: "1rem" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}><Btn variant="ghost" onClick={() => setRef(new Date(yil, ayIdx - 1, 1))}>‹</Btn><h3 style={{ margin: 0, fontSize: "1rem" }}>{AY_ADI[ayIdx]} {yil}</h3><Btn variant="ghost" onClick={() => setRef(new Date(yil, ayIdx + 1, 1))}>›</Btn></div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>{["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((g) => <div key={g} style={{ textAlign: "center", color: C.dimmer, fontSize: "0.7rem", padding: "0.3rem 0" }}>{g}</div>)}
      {hucreler.map((g, i) => { if (!g) return <div key={i} />; const v = gunVerisi[g]; const buGun = `${ayPrefix}-${String(g).padStart(2, "0")}` === bugunStr; return (<div key={i} style={{ minHeight: 56, background: buGun ? "#1A1A3A" : C.card2, border: `1px solid ${buGun ? C.indigo : C.line}`, borderRadius: "0.4rem", padding: "0.25rem", fontSize: "0.65rem" }}><div style={{ color: buGun ? C.indigoL : C.dim, fontWeight: buGun ? 700 : 400, marginBottom: 2 }}>{g}</div>{v?.gelir > 0 && <div style={{ color: C.greenL }}>+{(v.gelir / 1000).toFixed(0)}k</div>}{v?.gider > 0 && <div style={{ color: C.redL }}>−{(v.gider / 1000).toFixed(1)}k</div>}{v?.abonelik > 0 && <div style={{ color: C.amber }}>🔄{(v.abonelik).toFixed(0)}</div>}</div>); })}
    </div>
    <div style={{ display: "flex", gap: "1rem", marginTop: "1rem", fontSize: "0.72rem", flexWrap: "wrap" }}><span style={{ color: C.greenL }}>● Gelir</span><span style={{ color: C.redL }}>● Gider</span><span style={{ color: C.amber }}>🔄 Abonelik</span></div>
  </Card></div>);
}

// ---------- HANE ----------
function Hane({ users }) {
  const [yukleniyor, setYukleniyor] = useState(true); const [veriler, setVeriler] = useState([]);
  useEffect(() => { (async () => { setYukleniyor(true); const s = []; for (const u of users) { try { const r = await window.storage.get(`findata:${u.username}`, true); if (r) s.push({ user: u, findata: JSON.parse(r.value) }); } catch {} } setVeriler(s); setYukleniyor(false); })(); }, [users]);
  if (yukleniyor) return <div style={{ color: C.dim, padding: "2rem" }}>Hane verileri yükleniyor…</div>;
  const kisiler = veriler.map(({ user, findata }) => ({ ad: user.ad || user.username, hgider: (findata.giderler || []).filter((g) => g.hane).reduce((s, g) => s + g.miktar, 0), hgelir: (findata.gelirler || []).filter((g) => g.hane).reduce((s, g) => s + g.miktar, 0) }));
  const toplamGider = kisiler.reduce((s, k) => s + k.hgider, 0), toplamGelir = kisiler.reduce((s, k) => s + k.hgelir, 0);
  const katGider = {}; veriler.forEach(({ findata }) => (findata.giderler || []).filter((g) => g.hane).forEach((g) => { katGider[g.kategori] = (katGider[g.kategori] || 0) + g.miktar; }));
  const katlar = Object.entries(katGider).sort((a, b) => b[1] - a[1]); const enBuyuk = katlar[0]?.[1] || 1;
  return (<div><h2 style={pageTitle}>Ortak Hane Bütçesi</h2><p style={{ color: C.dimmer, fontSize: "0.85rem", margin: "0 0 1.25rem" }}>"Hane" işaretli tüm kullanıcı işlemleri burada birleşir.</p><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "1rem", marginBottom: "1.25rem" }}><Stat title="Hane Geliri" value={TL(toplamGelir)} color={C.green} icon="💰" /><Stat title="Hane Gideri" value={TL(toplamGider)} color={C.red} icon="💸" /><Stat title="Hane Dengesi" value={TL(toplamGelir - toplamGider)} subColor={toplamGelir - toplamGider >= 0 ? C.greenL : C.redL} color={C.purple} icon="⚖️" /></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}><Card><h3 style={sectionTitle}>Kişi Katkısı</h3>{!kisiler.some((k) => k.hgider || k.hgelir) && <p style={{ color: C.faint, fontSize: "0.85rem" }}>Henüz hane işlemi yok.</p>}{kisiler.filter((k) => k.hgider || k.hgelir).map((k) => <div key={k.ad} style={{ marginBottom: "1rem" }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem", fontSize: "0.85rem" }}><span style={{ color: C.text, fontWeight: 600 }}>{k.ad}</span><span style={{ color: C.dim }}>Gider {TL(k.hgider)}</span></div><ProgressBar value={k.hgider} max={toplamGider || 1} color={C.purple} /></div>)}</Card><Card><h3 style={sectionTitle}>Kategori Dağılımı</h3>{!katlar.length && <p style={{ color: C.faint, fontSize: "0.85rem" }}>Veri yok.</p>}{katlar.map(([k, v]) => <div key={k} style={{ marginBottom: "0.85rem" }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem", fontSize: "0.82rem" }}><span style={{ color: C.dim }}>{k}</span><span style={{ color: C.text, fontWeight: 600 }}>{TL(v)}</span></div><ProgressBar value={v} max={enBuyuk} color={C.cyan} /></div>)}</Card></div></div>);
}

// ---------- İÇE AKTAR ----------
function IceAktar({ findata, bildir, ekle, kategoriOgren }) {
  const [mod, setMod] = useState("fis"); const [isleniyor, setIsleniyor] = useState(false); const [sonuc, setSonuc] = useState(null);
  const fisRef = useRef(), ekstreRef = useRef();
  function tekrarMi(yeni) { const aday = yeni.tip === "gelir" ? findata.gelirler : findata.giderler; return aday.some((x) => { const am = Math.abs(x.miktar - yeni.miktar) < 0.5; const gf = Math.abs(new Date(x.tarih) - new Date(yeni.tarih)) / 86400000; const bb = (x.baslik || "").toLowerCase().slice(0, 6) === (yeni.baslik || "").toLowerCase().slice(0, 6); return am && gf <= 3 && (bb || gf <= 1); }); }
  async function fisYukle(e) { const file = e.target.files?.[0]; if (!file) return; setIsleniyor(true); setSonuc(null); try { const b64 = await fileToBase64(file); const txt = await claudeCall([{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } }, { type: "text", text: `Alışveriş fişi. SADECE JSON: {"magaza":"...","tarih":"YYYY-MM-DD","toplam":sayı,"kategori":"Market|Restoran|Konut|Ulaşım|Sağlık|Giyim|Teknoloji|Faturalar|Diğer","kalemler":[{"ad":"ürün","miktar":sayı,"fiyat":sayı}]}. Tarih yoksa bugünü kullan.` }] }]); const j = parseJSON(txt); const kayit = { baslik: j.magaza || "Fiş", miktar: parseFloat(j.toplam) || 0, kategori: j.kategori || "Market", tarih: j.tarih || bugun(), kalemler: (j.kalemler || []).map((k) => ({ ad: k.ad, miktar: k.miktar, fiyat: parseFloat(k.fiyat) || 0 })), kaynak: "fis", tip: "gider" }; setSonuc({ kayitlar: [{ ...kayit, _tekrar: tekrarMi(kayit), _sec: !tekrarMi(kayit) }] }); } catch (err) { bildir("Fiş okunamadı", "err"); } finally { setIsleniyor(false); if (fisRef.current) fisRef.current.value = ""; } }
  async function ekstreYukle(e) { const file = e.target.files?.[0]; if (!file) return; setIsleniyor(true); setSonuc(null); try { const ext = (file.name.split(".").pop() || "").toLowerCase(); const talimat = `Banka ekstresi. TÜM işlemleri çıkar. SADECE JSON dizi: [{"tarih":"YYYY-MM-DD","aciklama":"...","miktar":pozitif,"tip":"gelir|gider","kategori":"uygun"}]. Çıkış gider, giriş gelir. En fazla 25 işlem.`; let content; if (ext === "csv" || ext === "txt" || (file.type || "").includes("text") || (file.type || "").includes("csv")) { const m = await file.text(); content = [{ type: "text", text: talimat + "\n\nİçerik:\n" + m.slice(0, 6000) }]; } else if (ext === "pdf" || file.type === "application/pdf") { const b64 = await fileToBase64(file); content = [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }, { type: "text", text: talimat }]; } else { const b64 = await fileToBase64(file); content = [{ type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } }, { type: "text", text: talimat }]; } const txt = await claudeCall([{ role: "user", content }]); const arr = parseJSON(txt); const kayitlar = (Array.isArray(arr) ? arr : []).map((x) => { const kayit = { baslik: x.aciklama || "İşlem", miktar: Math.abs(parseFloat(x.miktar) || 0), kategori: x.kategori || "Diğer", tarih: x.tarih || bugun(), kaynak: "ekstre", tip: x.tip === "gelir" ? "gelir" : "gider" }; const t = tekrarMi(kayit); return { ...kayit, _tekrar: t, _sec: !t }; }); if (!kayitlar.length) bildir("İşlem bulunamadı", "err"); else setSonuc({ kayitlar }); } catch (err) { bildir("Ekstre işlenemedi", "err"); } finally { setIsleniyor(false); if (ekstreRef.current) ekstreRef.current.value = ""; } }
  function secimDegis(i) { setSonuc((s) => ({ ...s, kayitlar: s.kayitlar.map((k, j) => j === i ? { ...k, _sec: !k._sec } : k) })); }
  function onayla() { const secili = sonuc.kayitlar.filter((k) => k._sec); secili.forEach((k) => { const { _tekrar, _sec, tip, ...kayit } = k; ekle(tip, kayit); kategoriOgren(kayit.baslik, kayit.kategori); }); bildir(`${secili.length} kayıt eklendi`); setSonuc(null); }
  return (<div><h2 style={pageTitle}>İçe Aktar</h2><p style={{ color: C.dimmer, fontSize: "0.85rem", margin: "0 0 1.25rem" }}>Fiş veya ekstre yükleyin; AI okur, kategoriler, tekrarları işaretler.</p><div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}><Btn variant={mod === "fis" ? "primary" : "ghost"} onClick={() => { setMod("fis"); setSonuc(null); }}>🧾 Fiş Tara</Btn><Btn variant={mod === "ekstre" ? "primary" : "ghost"} onClick={() => { setMod("ekstre"); setSonuc(null); }}>🏦 Banka Ekstresi</Btn></div><Card style={{ marginBottom: "1.25rem" }}>{mod === "fis" ? (<div style={{ textAlign: "center", padding: "1.5rem 1rem" }}><div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🧾</div><p style={{ color: C.dim, fontSize: "0.9rem", margin: "0 0 1rem" }}>Fişin fotoğrafını çek veya seç</p><input ref={fisRef} type="file" accept="image/*" capture="environment" onChange={fisYukle} style={{ display: "none" }} /><Btn onClick={() => fisRef.current?.click()} disabled={isleniyor}>{isleniyor ? "Okunuyor…" : "Fiş Yükle"}</Btn></div>) : (<div style={{ textAlign: "center", padding: "1.5rem 1rem" }}><div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🏦</div><p style={{ color: C.dim, fontSize: "0.9rem", margin: "0 0 0.3rem" }}>Banka ekstresini yükle</p><p style={{ color: C.faint, fontSize: "0.75rem", margin: "0 0 1rem" }}>PDF · CSV · Görsel</p><input ref={ekstreRef} type="file" accept=".pdf,.csv,.txt,image/*" onChange={ekstreYukle} style={{ display: "none" }} /><Btn onClick={() => ekstreRef.current?.click()} disabled={isleniyor}>{isleniyor ? "İşleniyor…" : "Ekstre Yükle"}</Btn></div>)}</Card>{sonuc && (<Card><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}><h3 style={{ ...sectionTitle, margin: 0 }}>Bulunan Kayıtlar ({sonuc.kayitlar.length})</h3><Btn variant="green" onClick={onayla} disabled={!sonuc.kayitlar.some((k) => k._sec)}>Seçilenleri Ekle</Btn></div>{sonuc.kayitlar.some((k) => k._tekrar) && <p style={{ color: C.amber, fontSize: "0.78rem", margin: "0 0 0.75rem", background: "#251A08", border: "1px solid #422D08", padding: "0.5rem 0.75rem", borderRadius: "0.5rem" }}>⚠️ Sarı işaretliler olası tekrar; varsayılan seçili değil.</p>}{sonuc.kayitlar.map((k, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.7rem 0.85rem", background: k._tekrar ? "#1A1408" : C.card2, border: `1px solid ${k._tekrar ? "#422D08" : C.line}`, borderRadius: "0.6rem", marginBottom: "0.5rem" }}><input type="checkbox" checked={k._sec} onChange={() => secimDegis(i)} style={{ width: 18, height: 18, accentColor: C.indigo }} /><div style={{ flex: 1 }}><p style={{ margin: "0 0 0.15rem", fontWeight: 600, fontSize: "0.85rem" }}>{k.baslik}{k._tekrar && <span style={tagStyle(C.amber)}>OLASI TEKRAR</span>}{k.kalemler?.length ? <span style={{ color: C.indigoL, fontSize: "0.7rem", marginLeft: 6 }}>{k.kalemler.length} kalem</span> : null}</p><p style={{ margin: 0, color: C.dimmer, fontSize: "0.72rem" }}>{k.kategori} · {k.tarih} · {k.tip === "gelir" ? "Gelir" : "Gider"}</p></div><p style={{ margin: 0, fontWeight: 700, color: k.tip === "gelir" ? C.greenL : C.redL }}>{k.tip === "gelir" ? "+" : "−"}{TL(k.miktar)}</p></div>)}</Card>)}</div>);
}

// ---------- RAPOR ----------
function Rapor({ findata, setFindata, user, bildir, toplamGelir, toplamGider, toplamAbonelik, yatirimDeger, yatirimKar, netDeger, guncelDeger }) {
  const [rapor, setRapor] = useState(null); const [yukleniyor, setYukleniyor] = useState(false); const geriRef = useRef();
  function indir(icerik, ad, mime) { try { const blob = new Blob([icerik], { type: mime }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = ad; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); bildir("İndirildi: " + ad); } catch { bildir("İndirme engellenmiş olabilir", "err"); } }
  function yedekAl() { indir(JSON.stringify(findata, null, 2), `finansapp-yedek-${user.username}-${bugun()}.json`, "application/json"); }
  function csvAktar() { const s = [["Tip", "Başlık", "Kategori", "Tarih", "Tutar", "Kaynak"]]; findata.gelirler.forEach((g) => s.push(["Gelir", g.baslik, g.kategori, g.tarih, g.miktar, g.kaynak || "manuel"])); findata.giderler.forEach((g) => s.push(["Gider", g.baslik, g.kategori, g.tarih, g.miktar, g.kaynak || "manuel"])); findata.abonelikler.forEach((a) => s.push(["Abonelik", a.baslik, a.kategori, a.tarih, a.miktar, "manuel"])); const csv = "\uFEFF" + s.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n"); indir(csv, `finansapp-islemler-${bugun()}.csv`, "text/csv;charset=utf-8"); }
  function pdfRapor() {
    const ay = buAy(); const ayGider = {}; findata.giderler.filter((g) => (g.tarih || "").startsWith(ay)).forEach((g) => { ayGider[g.kategori] = (ayGider[g.kategori] || 0) + g.miktar; });
    const katSatir = Object.entries(ayGider).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right">${TL(v)}</td></tr>`).join("");
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Finans Raporu</title><style>body{font-family:system-ui,Arial,sans-serif;max-width:720px;margin:40px auto;color:#1a1a1a;padding:0 20px}h1{color:#6366F1}.kart{display:inline-block;border:1px solid #ddd;border-radius:10px;padding:14px 18px;margin:6px 8px 6px 0}.kart b{display:block;font-size:1.3rem}table{width:100%;border-collapse:collapse;margin-top:10px}td,th{padding:8px;border-bottom:1px solid #eee;font-size:0.9rem}@media print{.no-print{display:none}}</style></head><body><h1>₺ FinansApp — Aylık Rapor</h1><p>${user.ad} · ${bugun()}</p><div><div class="kart">Net Varlık<b>${TL(netDeger)}</b></div><div class="kart">Toplam Gelir<b style="color:#16A34A">${TL(toplamGelir)}</b></div><div class="kart">Toplam Gider<b style="color:#DC2626">${TL(toplamGider)}</b></div><div class="kart">Yatırım<b style="color:#6366F1">${TL(yatirimDeger)}</b></div></div><h3>Bu Ay Kategori Giderleri (${ay})</h3><table><tr><th style="text-align:left">Kategori</th><th style="text-align:right">Tutar</th></tr>${katSatir || '<tr><td colspan=2>Veri yok</td></tr>'}</table><button class="no-print" onclick="window.print()" style="margin-top:24px;padding:10px 18px;background:#6366F1;color:#fff;border:none;border-radius:8px;cursor:pointer">PDF olarak yazdır / kaydet</button></body></html>`;
    indir(html, `finansapp-rapor-${bugun()}.html`, "text/html");
    bildir("Rapor indirildi — açıp 'PDF olarak yazdır' ile kaydedebilirsin");
  }
  function geriYukle(e) { const file = e.target.files?.[0]; if (!file) return; const r = new FileReader(); r.onload = () => { try { const v = JSON.parse(r.result); setFindata({ ...bosVeri(), ...v }); bildir("Yedek geri yüklendi"); } catch { bildir("Geçersiz yedek", "err"); } }; r.readAsText(file); if (geriRef.current) geriRef.current.value = ""; }
  async function aiRapor() { setYukleniyor(true); try { const ay = buAy(); const ayGider = {}; findata.giderler.filter((g) => (g.tarih || "").startsWith(ay)).forEach((g) => { ayGider[g.kategori] = (ayGider[g.kategori] || 0) + g.miktar; }); const veri = { toplamGelir, toplamGider, toplamAbonelik, yatirimDeger, yatirimKar: Math.round(yatirimKar), netDeger: Math.round(netDeger), buAyGider: ayGider, hedefler: (findata.hedefler || []).map((h) => ({ ad: h.ad, tip: h.tip })) }; const txt = await claudeCall([{ role: "user", content: `Türk kullanıcı için kısa aylık finans raporu yaz. Düz metin, 2 paragraf + 3 öneri. TL. Veri: ${JSON.stringify(veri)}` }]); setRapor(txt); } catch { bildir("Rapor oluşturulamadı", "err"); } finally { setYukleniyor(false); } }
  return (<div><h2 style={pageTitle}>Rapor & Yedek</h2><p style={{ color: C.dimmer, fontSize: "0.85rem", margin: "0 0 1.25rem" }}>Dışa aktar, yedekle, PDF rapor al veya AI'dan analiz iste.</p><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: "1rem", marginBottom: "1.25rem" }}><Card><h3 style={sectionTitle}>📊 CSV (Excel)</h3><p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 1rem" }}>Tüm işlemleri tablo olarak indir.</p><Btn variant="ghost" onClick={csvAktar} style={{ width: "100%" }}>CSV İndir</Btn></Card><Card><h3 style={sectionTitle}>📄 PDF Rapor</h3><p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 1rem" }}>Formatlı rapor; açıp PDF kaydet/yazdır.</p><Btn variant="ghost" onClick={pdfRapor} style={{ width: "100%" }}>PDF Rapor</Btn></Card><Card><h3 style={sectionTitle}>💾 Yedekle</h3><p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 1rem" }}>Tüm veriyi JSON indir.</p><Btn variant="ghost" onClick={yedekAl} style={{ width: "100%" }}>Yedek Al</Btn></Card><Card><h3 style={sectionTitle}>♻️ Geri Yükle</h3><p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 1rem" }}>JSON yedeği geri yükle.</p><input ref={geriRef} type="file" accept=".json" onChange={geriYukle} style={{ display: "none" }} /><Btn variant="ghost" onClick={() => geriRef.current?.click()} style={{ width: "100%" }}>Yedek Seç</Btn></Card></div><Card accent={C.cyan}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: rapor ? "1rem" : 0, flexWrap: "wrap", gap: "0.5rem" }}><h3 style={{ ...sectionTitle, margin: 0 }}>✨ AI Aylık Rapor</h3><Btn onClick={aiRapor} disabled={yukleniyor}>{yukleniyor ? "Yazılıyor…" : "Rapor Oluştur"}</Btn></div>{rapor && <div style={{ color: C.dim, fontSize: "0.88rem", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{rapor}</div>}</Card></div>);
}

// ---------- AYARLAR ----------
function Ayarlar({ findata, setFindata, bildir }) {
  const [pin, setPin] = useState(""); const [enf, setEnf] = useState(String(findata.ayarlar?.enflasyon ?? 50)); const [kurBekle, setKurBekle] = useState(false);
  function pinKaydet() { if (pin.length !== 4 || !/^\d{4}$/.test(pin)) { bildir("PIN 4 haneli olmalı", "err"); return; } setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), pin } })); setPin(""); bildir("PIN kaydedildi (sonraki girişte sorulur)"); }
  function pinKaldir() { setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), pin: null } })); bildir("PIN kaldırıldı"); }
  function enfKaydet() { setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), enflasyon: parseFloat(enf) || 0 } })); bildir("Enflasyon oranı güncellendi"); }
  async function kurGuncelle() { setKurBekle(true); try { const k = await kurCek(); if (isNaN(k.usd) || isNaN(k.eur)) throw new Error(); setFindata((d) => ({ ...d, kurlar: k })); bildir(`Kurlar güncellendi: $${k.usd} · €${k.eur}`); } catch { bildir("Kur alınamadı", "err"); } finally { setKurBekle(false); } }
  function hafizaTemizle() { setFindata((d) => ({ ...d, kategoriHafiza: {} })); bildir("Kategori hafızası temizlendi"); }
  const hafizaSayi = Object.keys(findata.kategoriHafiza || {}).length;
  return (<div><h2 style={pageTitle}>Ayarlar</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "1rem", marginTop: "1rem" }}>
    <Card accent={C.indigo}><h3 style={sectionTitle}>🔒 PIN Kilidi</h3>{findata.ayarlar?.pin ? (<><p style={{ color: C.greenL, fontSize: "0.85rem", margin: "0 0 1rem" }}>✓ PIN aktif. Her girişte sorulur.</p><Btn variant="ghost" onClick={pinKaldir} style={{ width: "100%" }}>PIN'i Kaldır</Btn></>) : (<><p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 0.75rem" }}>4 haneli PIN belirle, açılışta sorulsun.</p><input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="1234" maxLength={4} style={{ ...inputStyle, marginBottom: "0.75rem", letterSpacing: "0.3em", textAlign: "center" }} /><Btn onClick={pinKaydet} style={{ width: "100%" }}>PIN Kaydet</Btn></>)}</Card>
    <Card accent={C.cyan}><h3 style={sectionTitle}>🔥 Enflasyon Oranı</h3><p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 0.75rem" }}>Yatırımların reel getirisini hesaplamak için yıllık enflasyon (%).</p><div style={{ display: "flex", gap: "0.5rem" }}><input type="number" value={enf} onChange={(e) => setEnf(e.target.value)} style={{ ...inputStyle }} /><Btn onClick={enfKaydet}>Kaydet</Btn></div></Card>
    <Card accent={C.green}><h3 style={sectionTitle}>💱 Döviz Kurları</h3><p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 0.75rem" }}>Net varlığını USD/EUR olarak da görmek için güncel kurları çek.</p>{findata.kurlar && <p style={{ color: C.dim, fontSize: "0.8rem", margin: "0 0 0.75rem" }}>Güncel: $1={TL2(findata.kurlar.usd)} · €1={TL2(findata.kurlar.eur)} <span style={{ color: C.faint }}>({findata.kurlar.tarih})</span></p>}<Btn variant="ghost" onClick={kurGuncelle} disabled={kurBekle} style={{ width: "100%" }}>{kurBekle ? "Çekiliyor…" : "Kurları Güncelle"}</Btn></Card>
    <Card accent={C.purple}><h3 style={sectionTitle}>🧠 Kategori Hafızası</h3><p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 0.75rem" }}>Öğrenilen kategori sayısı: <b style={{ color: C.text }}>{hafizaSayi}</b>. Aynı başlığı girince kategoriyi otomatik önerir.</p><Btn variant="ghost" onClick={hafizaTemizle} style={{ width: "100%" }} disabled={!hafizaSayi}>Hafızayı Temizle</Btn></Card>
    <KurallarKart findata={findata} setFindata={setFindata} bildir={bildir} />
    <TemaKart findata={findata} setFindata={setFindata} bildir={bildir} />
  </div></div>);
}

// ---------- KULLANICILAR ----------
function Kullanicilar({ users, onChange, bildir, mevcut }) {
  const [yeni, setYeni] = useState({ username: "", sifre: "", ad: "", rol: "kullanici" });
  function ekle() { if (!yeni.username || !yeni.sifre) { bildir("Kullanıcı adı ve şifre gerekli", "err"); return; } if (users.some((u) => u.username === yeni.username)) { bildir("Bu kullanıcı adı var", "err"); return; } onChange([...users, { ...yeni }]); setYeni({ username: "", sifre: "", ad: "", rol: "kullanici" }); bildir("Kullanıcı eklendi"); }
  function sil(username) { if (username === mevcut.username) { bildir("Kendinizi silemezsiniz", "err"); return; } onChange(users.filter((u) => u.username !== username)); window.storage.delete(`findata:${username}`, true).catch(() => {}); bildir("Kullanıcı silindi"); }
  function rolDegis(username, rol) { onChange(users.map((u) => u.username === username ? { ...u, rol } : u)); }
  return (<div><h2 style={pageTitle}>Kullanıcı Yönetimi</h2><p style={{ color: C.dimmer, fontSize: "0.85rem", margin: "0 0 1.25rem" }}>Her kullanıcının verisi ayrıdır.</p><Card style={{ marginBottom: "1.25rem" }}><h3 style={sectionTitle}>Yeni Kullanıcı</h3><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}><Field label="Ad Soyad" value={yeni.ad} onChange={(v) => setYeni((y) => ({ ...y, ad: v }))} /><Field label="Kullanıcı Adı" value={yeni.username} onChange={(v) => setYeni((y) => ({ ...y, username: v }))} /><Field label="Şifre" value={yeni.sifre} onChange={(v) => setYeni((y) => ({ ...y, sifre: v }))} /><Field label="Rol" value={yeni.rol} onChange={(v) => setYeni((y) => ({ ...y, rol: v }))} options={[{ id: "kullanici", label: "Kullanıcı" }, { id: "admin", label: "Yönetici" }]} /></div><Btn onClick={ekle}>+ Kullanıcı Ekle</Btn></Card><Card><h3 style={sectionTitle}>Kullanıcılar ({users.length})</h3>{users.map((u) => <div key={u.username} style={rowStyle}><div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}><div style={{ width: 36, height: 36, borderRadius: "50%", background: u.rol === "admin" ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "#1E2130", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.85rem" }}>{(u.ad || u.username)[0]?.toUpperCase()}</div><div><p style={{ margin: "0 0 0.15rem", fontWeight: 600, fontSize: "0.88rem" }}>{u.ad || u.username} {u.username === mevcut.username && <span style={{ color: C.indigoL, fontSize: "0.7rem" }}>(siz)</span>}</p><p style={{ margin: 0, color: C.dimmer, fontSize: "0.72rem" }}>@{u.username}</p></div></div><div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}><select value={u.rol} onChange={(e) => rolDegis(u.username, e.target.value)} disabled={u.username === mevcut.username} style={{ ...inputStyle, width: "auto", padding: "0.35rem 0.5rem", fontSize: "0.78rem" }}><option value="kullanici">Kullanıcı</option><option value="admin">Yönetici</option></select>{u.username !== mevcut.username && <DelBtn onClick={() => sil(u.username)} />}</div></div>)}</Card></div>);
}

/* ============================================================
   v4 yeni bileşenler
   ============================================================ */
const PALET = ["#6366F1", "#EF4444", "#F59E0B", "#22C55E", "#06B6D4", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#A855F7", "#84CC16"];

// ---------- ASİSTAN (sohbet) ----------
function Asistan({ findata, guncelDeger, toplamGelir, toplamGider, toplamAbonelik, yatirimDeger, netDeger, bildir }) {
  const [mesajlar, setMesajlar] = useState([{ rol: "asistan", metin: "Merhaba! Finansınla ilgili her şeyi sorabilirsin. Örn: \"Bu ay en çok nereye harcadım?\", \"Tasarruf için ne önerirsin?\", \"Bu krediyi kapatmalı mıyım?\"" }]);
  const [girdi, setGirdi] = useState(""); const [bekle, setBekle] = useState(false); const kaydirRef = useRef();
  useEffect(() => { if (kaydirRef.current) kaydirRef.current.scrollTop = kaydirRef.current.scrollHeight; }, [mesajlar, bekle]);
  function ozet() {
    const ay = buAy(); const ayGider = {}; findata.giderler.filter((g) => (g.tarih || "").startsWith(ay)).forEach((g) => { ayGider[g.kategori] = (ayGider[g.kategori] || 0) + g.miktar; });
    const sonGiderler = findata.giderler.slice().sort((a, b) => (b.tarih || "").localeCompare(a.tarih || "")).slice(0, 12).map((g) => ({ b: g.baslik, k: g.kategori, m: g.miktar, t: g.tarih }));
    return { toplamGelir, toplamGider, toplamAbonelik, yatirimDeger: Math.round(yatirimDeger), netDeger: Math.round(netDeger), buAyKategoriGider: ayGider, butceler: findata.butceler, hedefler: (findata.hedefler || []).map((h) => ({ ad: h.ad, tip: h.tip, hedef: h.hedefTutar, mevcut: h.mevcutTutar })), abonelikler: findata.abonelikler.map((a) => ({ ad: a.baslik, aylik: a.miktar })), sonGiderler };
  }
  async function gonder() {
    if (!girdi.trim() || bekle) return; const soru = girdi.trim(); setGirdi(""); const yeni = [...mesajlar, { rol: "user", metin: soru }]; setMesajlar(yeni); setBekle(true);
    try {
      const konusma = yeni.slice(-8).map((m) => `${m.rol === "user" ? "Kullanıcı" : "Asistan"}: ${m.metin}`).join("\n");
      const prompt = `Sen bir kişisel finans asistanısın. Kullanıcının güncel verisi (tutarlar TL): ${JSON.stringify(ozet())}.\n\nKonuşma:\n${konusma}\n\nSon kullanıcı sorusuna Türkçe, kısa ve net cevap ver. Gerektiğinde veriden rakam hesapla. Veri yetersizse dürüstçe söyle. Yatırım tavsiyesi verirken bunun kesin tavsiye olmadığını ekle. Sadece cevap metnini yaz.`;
      const txt = await claudeCall([{ role: "user", content: prompt }]);
      setMesajlar((m) => [...m, { rol: "asistan", metin: txt }]);
    } catch { setMesajlar((m) => [...m, { rol: "asistan", metin: "Üzgünüm, şu an cevap veremedim. Tekrar dener misin?" }]); } finally { setBekle(false); }
  }
  return (<div><h2 style={pageTitle}>Finans Asistanı</h2><p style={{ color: C.dimmer, fontSize: "0.85rem", margin: "0 0 1rem" }}>Verilerine bakarak cevaplar; tüm sekmelerin yerine tek bir "sor" kutusu.</p>
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div ref={kaydirRef} style={{ height: 420, overflowY: "auto", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {mesajlar.map((m, i) => <div key={i} style={{ alignSelf: m.rol === "user" ? "flex-end" : "flex-start", maxWidth: "85%", background: m.rol === "user" ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : C.card2, color: m.rol === "user" ? "#fff" : C.text, border: m.rol === "user" ? "none" : `1px solid ${C.line}`, padding: "0.7rem 0.95rem", borderRadius: m.rol === "user" ? "1rem 1rem 0.2rem 1rem" : "1rem 1rem 1rem 0.2rem", fontSize: "0.88rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.metin}</div>)}
        {bekle && <div style={{ alignSelf: "flex-start", color: C.dimmer, fontSize: "0.85rem", padding: "0.5rem 0.95rem" }}>yazıyor…</div>}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", padding: "0.85rem", borderTop: `1px solid ${C.line}` }}>
        <input value={girdi} onChange={(e) => setGirdi(e.target.value)} onKeyDown={(e) => e.key === "Enter" && gonder()} placeholder="Sorunu yaz…" style={{ ...inputStyle, flex: 1 }} />
        <Btn onClick={gonder} disabled={bekle}>Gönder</Btn>
      </div>
    </Card>
    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.85rem", flexWrap: "wrap" }}>{["Bu ay en çok nereye harcadım?", "Tasarruf için ne önerirsin?", "Bütçemi aşıyor muyum?"].map((s) => <Btn key={s} variant="ghost" onClick={() => setGirdi(s)} style={{ fontSize: "0.78rem" }}>{s}</Btn>)}</div>
  </div>);
}

// ---------- HESAPLAR / CÜZDANLAR ----------
function Hesaplar({ findata, setFindata, bildir }) {
  const [form, setForm] = useState({ ad: "", tip: "banka", bakiye: "" }); const [acik, setAcik] = useState(false);
  const hesaplar = findata.hesaplar || [];
  const varlik = hesaplar.filter((h) => h.tip !== "kart").reduce((s, h) => s + (+h.bakiye || 0), 0);
  const borc = hesaplar.filter((h) => h.tip === "kart").reduce((s, h) => s + (+h.bakiye || 0), 0);
  function ekle() { if (!form.ad) { bildir("Hesap adı gerekli", "err"); return; } setFindata((d) => ({ ...d, hesaplar: [...(d.hesaplar || []), { id: uid(), ad: form.ad, tip: form.tip, bakiye: parseFloat(form.bakiye) || 0 }] })); setForm({ ad: "", tip: "banka", bakiye: "" }); setAcik(false); bildir("Hesap eklendi"); }
  function sil(id) { setFindata((d) => ({ ...d, hesaplar: d.hesaplar.filter((h) => h.id !== id) })); }
  function bakiye(id, val) { setFindata((d) => ({ ...d, hesaplar: d.hesaplar.map((h) => h.id === id ? { ...h, bakiye: parseFloat(val) || 0 } : h) })); }
  return (<div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.6rem" }}><div><h2 style={pageTitle}>Hesaplar & Cüzdanlar</h2><p style={{ margin: 0, color: C.dim, fontSize: "0.88rem" }}>Varlık: <b style={{ color: C.greenL }}>{TL(varlik)}</b> · Kart borcu: <b style={{ color: C.redL }}>{TL(borc)}</b> · Net: <b style={{ color: varlik - borc >= 0 ? C.greenL : C.redL }}>{TL(varlik - borc)}</b></p></div><Btn onClick={() => setAcik(!acik)}>+ Hesap</Btn></div>
    {acik && <Card style={{ marginBottom: "1rem" }}><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "0.6rem" }}><Field label="Ad" value={form.ad} onChange={(v) => setForm((f) => ({ ...f, ad: v }))} placeholder="Garanti / Cüzdan" /><Field label="Tip" value={form.tip} onChange={(v) => setForm((f) => ({ ...f, tip: v }))} options={HESAP_TIP} /><Field label={form.tip === "kart" ? "Borç (₺)" : "Bakiye (₺)"} type="number" value={form.bakiye} onChange={(v) => setForm((f) => ({ ...f, bakiye: v }))} /></div><Btn onClick={ekle} style={{ marginTop: "0.3rem" }}>Kaydet</Btn></Card>}
    {!hesaplar.length && <Bos mesaj="Henüz hesap yok. Nakit, banka, kredi kartı veya birikim hesabı ekleyin." />}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: "1rem" }}>{hesaplar.map((h) => { const ht = HESAP_TIP.find((t) => t.id === h.tip); return (<Card key={h.id} accent={ht?.renk}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}><div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><span style={{ fontSize: "1.4rem" }}>{ht?.icon}</span><div><p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem" }}>{h.ad}</p><p style={{ margin: 0, color: C.dimmer, fontSize: "0.72rem" }}>{ht?.label}</p></div></div><DelBtn onClick={() => sil(h.id)} /></div><input type="number" value={h.bakiye} onChange={(e) => bakiye(h.id, e.target.value)} style={{ ...inputStyle, fontSize: "1.1rem", fontWeight: 700, color: h.tip === "kart" ? C.redL : C.text }} /></Card>); })}</div>
  </div>);
}

// ---------- GÖRSELLER (Sankey + ısı haritası) ----------
function Gorseller({ findata, guncelDeger, toplamGelir, netDeger }) {
  const giderKat = {}; findata.giderler.forEach((g) => { giderKat[g.kategori] = (giderKat[g.kategori] || 0) + g.miktar; });
  const aboToplam = findata.abonelikler.reduce((s, a) => s + a.miktar, 0); if (aboToplam > 0) giderKat["Abonelikler"] = (giderKat["Abonelikler"] || 0) + aboToplam;
  const giderTop = Object.values(giderKat).reduce((a, b) => a + b, 0); const kalan = Math.max(0, toplamGelir - giderTop);
  const kalemler = [...Object.entries(giderKat).sort((a, b) => b[1] - a[1]).map(([ad, deger], i) => ({ ad, deger, renk: PALET[i % PALET.length] })), ...(kalan > 0 ? [{ ad: "Kalan / Birikim", deger: kalan, renk: C.green }] : [])];
  return (<div><h2 style={pageTitle}>Görseller</h2><p style={{ color: C.dimmer, fontSize: "0.85rem", margin: "0 0 1rem" }}>Paranın akışı ve harcama yoğunluğu.</p>
    <Card style={{ marginBottom: "1rem" }}><h3 style={sectionTitle}>🌊 Para Akışı (Sankey)</h3>{toplamGelir <= 0 ? <p style={{ color: C.faint, fontSize: "0.85rem" }}>Gelir ekleyince akış çizilir.</p> : <Sankey gelir={toplamGelir} kalemler={kalemler} />}</Card>
    <Card><h3 style={sectionTitle}>🔥 Harcama Isı Haritası</h3><IsiHaritasi findata={findata} /></Card>
  </div>);
}
function Sankey({ gelir, kalemler }) {
  const W = 560, pad = 10; const sayi = kalemler.length || 1; const H = Math.max(220, sayi * 42 + 30);
  const toplamSag = kalemler.reduce((s, k) => s + k.deger, 0) || 1; const taban = Math.max(gelir, toplamSag);
  const olcek = (H - pad * 2) / taban; const solH = gelir * olcek;
  let sagY = pad; const nodes = kalemler.map((k) => { const h = Math.max(2, k.deger * olcek); const o = { ...k, y: sagY, h }; sagY += h + 4; return o; });
  const x1 = 56, x2 = W - 72; let linkSolY = pad;
  return (<svg width="100%" viewBox={`0 0 ${W} ${H + 20}`} style={{ display: "block" }} fontFamily={F}>
    <rect x={40} y={pad} width={14} height={solH} rx={3} fill={C.greenL} />
    {nodes.map((n, i) => { const h = Math.max(2, n.deger * olcek); const sy = linkSolY + h / 2; linkSolY += h; const ty = n.y + n.h / 2; const cx = (x1 + x2) / 2; return <path key={i} d={`M${x1},${sy} C${cx},${sy} ${cx},${ty} ${x2},${ty}`} stroke={n.renk} strokeWidth={Math.max(1.5, n.h)} fill="none" opacity={0.32} />; })}
    {nodes.map((n, i) => <g key={"n" + i}><rect x={x2} y={n.y} width={14} height={n.h} rx={3} fill={n.renk} /><text x={x2 + 20} y={n.y + n.h / 2 + 4} fill={C.dim} fontSize="11">{n.ad} · {TL(n.deger)}</text></g>)}
    <text x={40} y={pad + solH + 15} fill={C.greenL} fontSize="11" fontWeight="600">Gelir {TL(gelir)}</text>
  </svg>);
}
function IsiHaritasi({ findata }) {
  const [ref, setRef] = useState(new Date()); const yil = ref.getFullYear(), ayIdx = ref.getMonth();
  const ayPrefix = `${yil}-${String(ayIdx + 1).padStart(2, "0")}`; const gunSayisi = new Date(yil, ayIdx + 1, 0).getDate();
  const baslangicGun = (new Date(yil, ayIdx, 1).getDay() + 6) % 7;
  const gunGider = {}; findata.giderler.filter((g) => (g.tarih || "").startsWith(ayPrefix)).forEach((g) => { const d = parseInt(g.tarih.slice(8, 10)); gunGider[d] = (gunGider[d] || 0) + g.miktar; });
  const maxG = Math.max(...Object.values(gunGider), 1);
  const renk = (v) => { if (!v) return C.card2; const t = v / maxG; const a = 0.15 + t * 0.85; return `rgba(239,68,68,${a.toFixed(2)})`; };
  const hucreler = []; for (let i = 0; i < baslangicGun; i++) hucreler.push(null); for (let g = 1; g <= gunSayisi; g++) hucreler.push(g);
  return (<div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}><Btn variant="ghost" onClick={() => setRef(new Date(yil, ayIdx - 1, 1))}>‹</Btn><span style={{ fontSize: "0.9rem", fontWeight: 600 }}>{AY_ADI[ayIdx]} {yil}</span><Btn variant="ghost" onClick={() => setRef(new Date(yil, ayIdx + 1, 1))}>›</Btn></div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>{["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((g) => <div key={g} style={{ textAlign: "center", color: C.dimmer, fontSize: "0.68rem" }}>{g}</div>)}{hucreler.map((g, i) => g ? <div key={i} title={gunGider[g] ? TL(gunGider[g]) : ""} style={{ aspectRatio: "1", background: renk(gunGider[g]), border: `1px solid ${C.line}`, borderRadius: "0.3rem", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.62rem", color: gunGider[g] > maxG * 0.5 ? "#fff" : C.dimmer }}>{g}</div> : <div key={i} />)}</div>
    <p style={{ color: C.faint, fontSize: "0.72rem", margin: "0.75rem 0 0" }}>Koyu kırmızı = daha yüksek harcama. En yoğun gün: {TL(maxG)}</p></div>);
}

// ---------- ZARF BÜTÇE ----------
function Zarflar({ findata, setFindata, bildir }) {
  const ay = buAy(); const ayGider = {}; findata.giderler.filter((g) => (g.tarih || "").startsWith(ay)).forEach((g) => { ayGider[g.kategori] = (ayGider[g.kategori] || 0) + g.miktar; });
  const zarflar = findata.zarflar || {}; const set = (k, v) => setFindata((d) => ({ ...d, zarflar: { ...(d.zarflar || {}), [k]: parseFloat(v) || 0 } }));
  const toplamTahsis = Object.values(zarflar).reduce((a, b) => a + (+b || 0), 0); const aktifler = GIDER_KAT.filter((k) => zarflar[k] > 0);
  return (<div><Card style={{ marginBottom: "1rem" }}><h3 style={sectionTitle}>✉️ Zarf Bütçe ({ay})</h3><p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 0.5rem" }}>Ayın başında her kategoriye para "zarfla"; harcadıkça zarf boşalır. Toplam tahsis: <b style={{ color: C.text }}>{TL(toplamTahsis)}</b></p></Card>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: "1rem" }}>{GIDER_KAT.map((k) => { const tah = zarflar[k] || 0, harc = ayGider[k] || 0, kalanZ = tah - harc; const bitti = tah > 0 && kalanZ < 0; return (<Card key={k} accent={tah > 0 ? (bitti ? C.red : C.amber) : C.line2}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}><span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{k}</span><input type="number" value={tah || ""} onChange={(e) => set(k, e.target.value)} placeholder="tahsis" style={{ ...inputStyle, width: 90, padding: "0.3rem 0.45rem", fontSize: "0.8rem" }} /></div>{tah > 0 && <><ProgressBar value={harc} max={tah} color={bitti ? C.red : C.amber} /><p style={{ margin: "0.5rem 0 0", fontSize: "0.78rem", color: bitti ? C.redL : C.dim }}>{bitti ? `${TL(-kalanZ)} aşıldı` : `${TL(kalanZ)} kaldı`} <span style={{ color: C.faint }}>· {TL(harc)} harcandı</span></p></>}</Card>); })}</div>
  </div>);
}

// ---------- BAŞARIMLAR + MEYDAN OKUMA ----------
function Basarimlar({ findata, setFindata, bildir }) {
  const gd = (y) => y.adet * (y.guncelFiyat || y.alisFiyati);
  const yd = (findata.yatirimlar || []).reduce((s, y) => s + gd(y), 0);
  const nakit = (findata.gelirler || []).reduce((s, x) => s + x.miktar, 0) - (findata.giderler || []).reduce((s, x) => s + x.miktar, 0) - (findata.abonelikler || []).reduce((s, x) => s + x.miktar, 0);
  const netDeger = nakit + yd; const toplamGider = (findata.giderler || []).reduce((s, x) => s + x.miktar, 0);
  const rozetler = rozetleriHesapla(findata, netDeger, toplamGider); const kazanilan = rozetler.filter((r) => r.kazanildi).length;
  const mo = findata.meydanOkumalar || []; const [form, setForm] = useState({ ad: "", gun: "30" });
  function baslat() { if (!form.ad) { bildir("Meydan okuma adı gerekli", "err"); return; } setFindata((d) => ({ ...d, meydanOkumalar: [...(d.meydanOkumalar || []), { id: uid(), ad: form.ad, hedefGun: parseInt(form.gun) || 30, baslangic: bugun() }] })); setForm({ ad: "", gun: "30" }); bildir("Meydan okuma başladı! 💪"); }
  function vazgec(id) { setFindata((d) => ({ ...d, meydanOkumalar: d.meydanOkumalar.filter((m) => m.id !== id) })); }
  return (<div>
    <Card style={{ marginBottom: "1rem" }}><h3 style={sectionTitle}>🏆 Rozetler ({kazanilan}/{rozetler.length})</h3><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: "0.75rem" }}>{rozetler.map((r) => <div key={r.id} style={{ textAlign: "center", padding: "1rem 0.5rem", background: r.kazanildi ? "#0D2718" : C.card2, border: `1px solid ${r.kazanildi ? "#166534" : C.line}`, borderRadius: "0.75rem", opacity: r.kazanildi ? 1 : 0.5 }}><div style={{ fontSize: "1.8rem", marginBottom: "0.35rem", filter: r.kazanildi ? "none" : "grayscale(1)" }}>{r.icon}</div><p style={{ margin: "0 0 0.15rem", fontWeight: 600, fontSize: "0.82rem", color: r.kazanildi ? C.greenL : C.dim }}>{r.ad}</p><p style={{ margin: 0, fontSize: "0.68rem", color: C.faint }}>{r.aciklama}</p></div>)}</div></Card>
    <Card><h3 style={sectionTitle}>💪 Tasarruf Meydan Okumaları</h3><div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}><div style={{ flex: 1, minWidth: 160 }}><Field label="Meydan okuma" value={form.ad} onChange={(v) => setForm((f) => ({ ...f, ad: v }))} placeholder="Dışarıda yemek yok" /></div><div style={{ width: 90 }}><Field label="Gün" type="number" value={form.gun} onChange={(v) => setForm((f) => ({ ...f, gun: v }))} /></div><Btn onClick={baslat} style={{ marginBottom: "0.9rem" }}>Başlat</Btn></div>
      {!mo.length && <Bos mesaj="Aktif meydan okuma yok. Bir hedef belirle ve seriyi sürdür!" />}
      {mo.map((m) => { const gecen = Math.floor((new Date(bugun()) - new Date(m.baslangic)) / 86400000); const pct = Math.min(100, (gecen / m.hedefGun) * 100); const bitti = gecen >= m.hedefGun; return (<div key={m.id} style={{ marginBottom: "0.85rem", padding: "0.85rem 1rem", background: C.card2, border: `1px solid ${bitti ? "#166534" : C.line}`, borderRadius: "0.7rem" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}><span style={{ fontWeight: 600, fontSize: "0.88rem" }}>{m.ad} {bitti && "🎉"}</span><div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}><span style={{ fontSize: "0.8rem", color: bitti ? C.greenL : C.dim }}>{Math.min(gecen, m.hedefGun)}/{m.hedefGun} gün</span><DelBtn onClick={() => vazgec(m.id)} /></div></div><ProgressBar value={gecen} max={m.hedefGun} color={bitti ? C.green : C.amber} /></div>); })}
    </Card>
  </div>);
}

// ---------- ENFLASYON AŞINDIRMA ----------
function EnflasyonAsindirma({ findata }) {
  const [tutar, setTutar] = useState("100000"); const [yil, setYil] = useState("5"); const [enf, setEnf] = useState(String(findata.ayarlar?.enflasyon ?? 50));
  const P = parseFloat(tutar) || 0, n = parseInt(yil) || 0, e = (parseFloat(enf) || 0) / 100;
  const seri = [{ deger: P, ay: 0 }]; for (let i = 1; i <= n; i++) seri.push({ deger: P / Math.pow(1 + e, i), ay: i });
  const son = seri[seri.length - 1].deger; const kayip = P - son;
  return (<Card><h3 style={sectionTitle}>🔥 Enflasyon Aşındırma — Param Eriyor mu?</h3><p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 1rem" }}>Yastık altındaki paranın alım gücü zamanla nasıl erir?</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: "0.75rem", marginBottom: "1rem" }}><Field label="Bugünkü Tutar (₺)" type="number" value={tutar} onChange={setTutar} /><Field label="Süre (yıl)" type="number" value={yil} onChange={setYil} /><Field label="Yıllık Enflasyon (%)" type="number" value={enf} onChange={setEnf} /></div>
    <Sparkline points={seri} color={C.amber} height={120} width={400} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "0.75rem", marginTop: "1rem" }}><div style={{ textAlign: "center" }}><p style={{ color: C.dimmer, fontSize: "0.72rem", margin: "0 0 0.25rem" }}>{n} yıl sonra alım gücü</p><p style={{ color: C.amber, fontWeight: 700, margin: 0, fontSize: "1.2rem" }}>{TL(son)}</p></div><div style={{ textAlign: "center" }}><p style={{ color: C.dimmer, fontSize: "0.72rem", margin: "0 0 0.25rem" }}>Erien değer</p><p style={{ color: C.redL, fontWeight: 700, margin: 0, fontSize: "1.2rem" }}>−{TL(kayip)}</p></div></div>
    <p style={{ color: C.faint, fontSize: "0.72rem", margin: "1rem 0 0", textAlign: "center" }}>Yani bugün {TL(P)}, {n} yıl sonra sadece {TL(son)} değerinde alışveriş yapabilir.</p></Card>);
}

// ---------- PANEL KARTLARI: ACİL FON + NET VARLIK ----------
function AcilFon({ nakit, toplamGider, toplamAbonelik, aylik }) {
  const ayCount = Math.max(1, Object.keys(aylik || {}).length); const aylikOrt = toplamGider / ayCount + toplamAbonelik;
  const ay = aylikOrt > 0 ? nakit / aylikOrt : 0;
  const seviye = ay >= 6 ? { r: C.green, t: "Çok güvende" } : ay >= 3 ? { r: C.amber, t: "İyi durumda" } : ay >= 1 ? { r: "#F97316", t: "Zayıf" } : { r: C.red, t: "Riskli" };
  return (<Card accent={seviye.r}><h3 style={sectionTitle}>🛟 Acil Fon Kapsamı</h3>{aylikOrt <= 0 ? <p style={{ color: C.faint, fontSize: "0.82rem" }}>Gider verisi biriktikçe hesaplanır.</p> : (<><p style={{ margin: "0 0 0.25rem", fontSize: "1.8rem", fontWeight: 700, color: seviye.r }}>{ay.toFixed(1)} ay</p><p style={{ margin: "0 0 0.75rem", fontSize: "0.8rem", color: C.dim }}>{seviye.t} — nakitin ~{ay.toFixed(1)} aylık gideri karşılıyor</p><ProgressBar value={Math.min(ay, 6)} max={6} color={seviye.r} /><p style={{ margin: "0.5rem 0 0", fontSize: "0.72rem", color: C.faint }}>Önerilen: 3-6 ay · aylık ort. gider {TL(aylikOrt)}</p></>)}</Card>);
}
function NetVarlikGecmisKart({ findata, portfoyGecmis }) {
  const aylar = new Set(); [...findata.gelirler, ...findata.giderler].forEach((t) => { const a = (t.tarih || "").slice(0, 7); if (a) aylar.add(a); });
  const sirali = [...aylar].sort();
  const seri = sirali.map((a) => { const sonGun = a + "-31"; const gel = findata.gelirler.filter((g) => (g.tarih || "") <= sonGun).reduce((s, g) => s + g.miktar, 0); const gid = findata.giderler.filter((g) => (g.tarih || "") <= sonGun).reduce((s, g) => s + g.miktar, 0); const inv = (portfoyGecmis || []).filter((p) => p.tarih <= sonGun).pop(); return { deger: gel - gid + (inv ? inv.deger : 0), tarih: a }; });
  return (<Card accent={C.purple}><h3 style={sectionTitle}>📈 Net Varlık (zaman içinde)</h3>{seri.length < 2 ? <p style={{ color: C.faint, fontSize: "0.82rem" }}>En az iki aylık veri gerekiyor.</p> : (<><Sparkline points={seri} color={C.purple} height={90} width={300} /><div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem", fontSize: "0.72rem", color: C.faint }}><span>{seri[0].tarih}: {TL(seri[0].deger)}</span><span style={{ color: C.dim }}>{seri[seri.length - 1].tarih}: {TL(seri[seri.length - 1].deger)}</span></div></>)}</Card>);
}

// ---------- KURALLAR (Ayarlar kartı) ----------
function KurallarKart({ findata, setFindata, bildir }) {
  const [form, setForm] = useState({ tip: "kategori", kelime: "", tutarUstu: "", kategori: "Market", mesaj: "" }); const kurallar = findata.kurallar || [];
  function ekle() { if (!form.kelime && !form.tutarUstu) { bildir("Kelime veya tutar gir", "err"); return; } setFindata((d) => ({ ...d, kurallar: [...(d.kurallar || []), { id: uid(), tip: form.tip, kelime: form.kelime, tutarUstu: parseFloat(form.tutarUstu) || 0, kategori: form.kategori, mesaj: form.mesaj }] })); setForm({ tip: "kategori", kelime: "", tutarUstu: "", kategori: "Market", mesaj: "" }); bildir("Kural eklendi"); }
  function sil(id) { setFindata((d) => ({ ...d, kurallar: d.kurallar.filter((k) => k.id !== id) })); }
  return (<Card accent={C.amber} style={{ gridColumn: "1 / -1" }}><h3 style={sectionTitle}>⚙️ Otomatik Kurallar</h3><p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 0.75rem" }}>Başlıkta kelime geçince kategori ata, ya da tutar aşımında uyarı ver. Yeni işlemlere otomatik uygulanır.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: "0.5rem", marginBottom: "0.5rem" }}><Field label="Tip" value={form.tip} onChange={(v) => setForm((f) => ({ ...f, tip: v }))} options={[{ id: "kategori", label: "Kategori Ata" }, { id: "uyari", label: "Uyarı Ver" }]} /><Field label="Kelime" value={form.kelime} onChange={(v) => setForm((f) => ({ ...f, kelime: v }))} placeholder="Migros" /><Field label="Tutar üstü (₺)" type="number" value={form.tutarUstu} onChange={(v) => setForm((f) => ({ ...f, tutarUstu: v }))} />{form.tip === "kategori" ? <Field label="Kategori" value={form.kategori} onChange={(v) => setForm((f) => ({ ...f, kategori: v }))} options={GIDER_KAT} /> : <Field label="Uyarı mesajı" value={form.mesaj} onChange={(v) => setForm((f) => ({ ...f, mesaj: v }))} placeholder="Çok harcadın!" />}</div><Btn onClick={ekle}>+ Kural Ekle</Btn>
    <div style={{ marginTop: "1rem" }}>{!kurallar.length && <p style={{ color: C.faint, fontSize: "0.8rem" }}>Henüz kural yok.</p>}{kurallar.map((k) => <div key={k.id} style={rowStyle}><p style={{ margin: 0, fontSize: "0.82rem", color: C.dim }}>{k.tip === "kategori" ? `"${k.kelime || k.tutarUstu + "₺+"}" → ${k.kategori}` : `"${k.kelime || k.tutarUstu + "₺+"}" → uyarı`}</p><DelBtn onClick={() => sil(k.id)} /></div>)}</div>
  </Card>);
}

// ---------- TEMA (Ayarlar kartı) ----------
function TemaKart({ findata, setFindata, bildir }) {
  const tema = findata.ayarlar?.tema || "koyu"; const accent = findata.ayarlar?.accent || "#6366F1";
  const setAyar = (k, v) => setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), [k]: v } }));
  return (<Card accent={accent} style={{ gridColumn: "1 / -1" }}><h3 style={sectionTitle}>🎨 Tema & Renk</h3>
    <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 0.6rem" }}>Arka plan tonu</p>
    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>{[{ id: "koyu", ad: "Koyu" }, { id: "gece", ad: "Gece Mavisi" }, { id: "antrasit", ad: "Antrasit" }].map((t) => <Btn key={t.id} variant={tema === t.id ? "primary" : "ghost"} onClick={() => setAyar("tema", t.id)}>{t.ad}</Btn>)}</div>
    <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 0.6rem" }}>Vurgu rengi</p>
    <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>{ACCENT_SECENEK.map((a) => <button key={a.renk} onClick={() => setAyar("accent", a.renk)} title={a.ad} style={{ width: 34, height: 34, borderRadius: "50%", background: a.renk, border: accent === a.renk ? "3px solid #fff" : `2px solid ${C.line2}`, cursor: "pointer" }} />)}</div>
  </Card>);
}

// ---------- ONBOARDING ----------
function Onboarding({ user, setFindata }) {
  const [adim, setAdim] = useState(0); const [gelir, setGelir] = useState(""); const [bakiye, setBakiye] = useState(""); const [enf, setEnf] = useState("50"); const [accent, setAccent] = useState("#6366F1");
  function atla() { setFindata((d) => ({ ...d, ayarlar: { ...(d.ayarlar || {}), kuruldu: true } })); }
  function bitir() {
    setFindata((d) => {
      const yeni = { ...d, gelirler: [...d.gelirler], sablonlar: [...(d.sablonlar || [])], hesaplar: [...(d.hesaplar || [])] };
      yeni.ayarlar = { ...(d.ayarlar || {}), enflasyon: parseFloat(enf) || 50, accent, kuruldu: true };
      if (parseFloat(gelir) > 0) { yeni.gelirler.push({ id: uid(), baslik: "Maaş", miktar: parseFloat(gelir), kategori: "Maaş", tarih: bugun() }); yeni.sablonlar.push({ id: uid(), tip: "gelir", baslik: "Maaş", miktar: parseFloat(gelir), kategori: "Maaş", frekans: "aylık", baslangic: bugun(), sonUretilen: bugun() }); }
      if (parseFloat(bakiye) > 0) yeni.hesaplar.push({ id: uid(), ad: "Banka Hesabım", tip: "banka", bakiye: parseFloat(bakiye) });
      return yeni;
    });
  }
  const adimlar = [
    { icon: "👋", baslik: `Hoş geldin, ${user.ad || user.username}!`, alt: "Birkaç adımda kurulumunu yapalım. Dilersen atlayabilirsin.", icerik: null },
    { icon: "💰", baslik: "Aylık gelirin?", alt: "Maaşını gir — otomatik aylık tekrara eklenir (boş bırakabilirsin).", icerik: <Field label="Aylık Gelir (₺)" type="number" value={gelir} onChange={setGelir} placeholder="50000" /> },
    { icon: "🏦", baslik: "Banka bakiyen?", alt: "İlk hesabını oluşturalım (isteğe bağlı).", icerik: <Field label="Banka Bakiyesi (₺)" type="number" value={bakiye} onChange={setBakiye} placeholder="25000" /> },
    { icon: "🎨", baslik: "Son rötuşlar", alt: "Enflasyon oranı (reel getiri için) ve vurgu rengini seç.", icerik: <div><Field label="Yıllık Enflasyon (%)" type="number" value={enf} onChange={setEnf} /><p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0.5rem 0" }}>Vurgu rengi</p><div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>{ACCENT_SECENEK.map((a) => <button key={a.renk} onClick={() => setAccent(a.renk)} style={{ width: 34, height: 34, borderRadius: "50%", background: a.renk, border: accent === a.renk ? "3px solid #fff" : `2px solid ${C.line2}`, cursor: "pointer" }} />)}</div></div> },
  ];
  const cur = adimlar[adim]; const son = adim === adimlar.length - 1;
  return (<div style={{ minHeight: "100vh", background: `radial-gradient(circle at 30% 20%, #1A1530, ${C.bg} 60%)`, fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
    <div style={{ width: "100%", maxWidth: 420 }}>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: "1.5rem" }}>{adimlar.map((_, i) => <div key={i} style={{ width: 28, height: 4, borderRadius: 999, background: i <= adim ? accent : C.line2 }} />)}</div>
      <Card>
        <div style={{ textAlign: "center", marginBottom: "1.25rem" }}><div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>{cur.icon}</div><h2 style={{ margin: "0 0 0.35rem", fontSize: "1.25rem", fontWeight: 700 }}>{cur.baslik}</h2><p style={{ margin: 0, color: C.dimmer, fontSize: "0.85rem" }}>{cur.alt}</p></div>
        {cur.icerik && <div style={{ marginBottom: "0.5rem" }}>{cur.icerik}</div>}
        <div style={{ display: "flex", gap: "0.6rem", marginTop: "1rem" }}>{adim > 0 && <Btn variant="ghost" onClick={() => setAdim(adim - 1)}>Geri</Btn>}{son ? <Btn onClick={bitir} style={{ flex: 1 }}>Başla 🚀</Btn> : <Btn onClick={() => setAdim(adim + 1)} style={{ flex: 1 }}>İleri</Btn>}</div>
        <p onClick={atla} style={{ textAlign: "center", color: C.faint, fontSize: "0.78rem", marginTop: "1rem", marginBottom: 0, cursor: "pointer" }}>Şimdilik atla</p>
      </Card>
    </div>
  </div>);
}
