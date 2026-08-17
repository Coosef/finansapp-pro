// ============================================================
// İşlemler — birleşik liste (gelir + gider + abonelik), Zümrüt & Altın
// Pill filtre + arama + satır düzenleme/silme; tek İşlem/Abonelik modalı
// ============================================================
import { useState, useEffect } from "react";
import { V, F, SERIF, MONO, AY_ADI, inputStyle } from "../lib/constants.js";
import { TL, sayiCevir } from "../lib/format.js";
import { tryeCevir, pbSembol, PB_SECENEK } from "../lib/parabirimi.js";
import { bekleyenInceleme, siniflananHane, turSecenekleri, turEtkiIpucu, turEtiket } from "../lib/incele.js";
import { oneriBekleyen, topluSinifla, geriAlSinifla, aiAdaylari, turOnerAI, aiContext, aiGuvenBand, aiKabulUygula, gecmisKararlar } from "../lib/oneri.js";
import { merchantCoz, benzerAdaylar, merchantKuralUret } from "../lib/merchant.js";
import { claudeCall, aiHazir } from "../lib/ai.js";
import { Icon } from "../components/icons.jsx";
import { Card, Btn, Modal, Field, Toggle, DelBtn, Bos } from "../components/ui.jsx";

// KPI etki ipucu rengi (turEtkiIpucu.tip → renk)
const ETKI_RENK = { gider: V.neg, gelir: V.pos, iade: V.pos, stopaj: V.neg, notr: V.ink3 };

// İncelenecek işlem kartı: ham kaydı bozmadan finansal anlam seçtirir.
// Ham başlık/tutar/yön/kişi gösterilir; her seçenek KPI etkisini canlı belirtir.
function InceleSatir({ rec, kisiAd, son, onSinifla, aktifTur }) {
  const cikis = rec._yon === "gider";
  const secenekler = turSecenekleri(rec._yon);
  const altMeta = [isoKisa(rec.tarih), cikis ? "giden" : "gelen", kisiAd || rec.incelemeNeden].filter(Boolean).join(" · ");
  return (
    <div style={{ padding: "13px 0", borderBottom: son ? "none" : `1px solid ${V.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 9 }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: cikis ? V.chipRed : V.chipGreen, color: cikis ? V.neg : V.pos, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon d={cikis ? "arrowDown" : "arrowUp"} size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: V.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {rec.baslik}
            {aktifTur && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: V.accent, background: V.chipGold, border: `1px solid ${V.accent}55`, padding: "1px 6px", borderRadius: 5 }}>{turEtiket(aktifTur)}</span>}
          </div>
          <div style={{ fontSize: 11.5, color: V.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{altMeta}</div>
        </div>
        <span className="num" style={{ fontSize: 14, fontWeight: 700, color: cikis ? V.neg : V.pos, fontFamily: MONO, flexShrink: 0 }}>{cikis ? "−" : "+"}{TL(rec.miktar)}</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingLeft: 46 }}>
        {secenekler.map((s) => {
          const ip = turEtkiIpucu(s.tur, rec._yon);
          const secili = aktifTur === s.tur;
          return (
            <button
              key={s.tur}
              onClick={() => onSinifla(rec, s.tur)}
              className="fa-btn"
              title={`${s.label} → ${ip.metin}`}
              style={{ border: `1px solid ${secili ? V.accent : V.border2}`, borderRadius: 8, padding: "5px 9px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: F, background: secili ? V.chipGold : V.card2, color: secili ? V.accent : V.ink2, display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}
            >
              {s.label}
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: ETKI_RENK[ip.tip], flexShrink: 0 }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ISO tarihi "23 Haz" gibi kısa biçimde göster
const isoKisa = (iso) => {
  const [, m, d] = String(iso).split("-");
  return `${+d} ${AY_ADI[+m - 1]}`;
};

// Tip -> ikon dairesi + tutar rengi/işaret bilgileri
const TIP_STIL = {
  gelir: { bg: V.chipGreen, renk: V.pos, icon: "arrowUp", sign: "+", amtRenk: V.pos },
  gider: { bg: V.chipRed, renk: V.neg, icon: "arrowDown", sign: "−", amtRenk: V.neg },
  abonelik: { bg: V.chipGold, renk: V.gold, icon: "repeat", sign: "−", amtRenk: V.neg },
};

function IslemSatir({ t, hesapAd, son, onDuzenle, onSil, merchant, onMerchant }) {
  const s = TIP_STIL[t.tip] || TIP_STIL.gider;
  const tekrar = t.otomatik || t.tekrar || t.tip === "abonelik";
  const meta = [hesapAd, t.kategori, isoKisa(t.tarih)].filter(Boolean).join(" · ");
  const mAd = merchant && (merchant.merchant || merchant.merchantCandidate);
  const mKesin = merchant && merchant.merchant; // high/medium = kesin; candidate = aday
  return (
    <div
      onClick={() => onDuzenle(t.tip, t)}
      style={{
        display: "flex", alignItems: "center", gap: "13px",
        padding: "12px 0", borderBottom: son ? "none" : `1px solid ${V.line}`, cursor: "pointer",
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: s.bg, color: s.renk, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon d={s.icon} size={17} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13.5px", fontWeight: 500, color: V.ink, display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.baslik}</span>
          {tekrar && (
            <span title="Her ay tekrarlanır" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "10px", color: V.gold, background: V.chipGold, padding: "1px 6px", borderRadius: 6, fontWeight: 600, flexShrink: 0 }}>⟳ aylık</span>
          )}
          {t.kaynak === "ekstre" && (
            <span title="Ekstreden içe aktarıldı" style={{ fontSize: "9.5px", color: V.ink3, border: `1px solid ${V.border2}`, padding: "1px 5px", borderRadius: 5, fontWeight: 600, flexShrink: 0, letterSpacing: "0.03em" }}>EKSTRE</span>
          )}
          {t.tur === "needs_review" && (
            <span title="Finansal anlamı bekliyor — İncele filtresinde sınıfla" style={{ fontSize: "9.5px", color: V.accent, background: V.chipGold, border: `1px solid ${V.accent}55`, padding: "1px 5px", borderRadius: 5, fontWeight: 700, flexShrink: 0, letterSpacing: "0.03em" }}>İNCELE</span>
          )}
          {mAd && onMerchant && (
            <span
              onClick={(e) => { e.stopPropagation(); onMerchant(t); }}
              title={mKesin ? `Merchant: ${merchant.merchant} — düzelt` : `Merchant adayı (düşük güven): ${merchant.merchantCandidate} — onayla/düzelt`}
              style={{ fontSize: "9.5px", color: mKesin ? V.emerald : V.ink3, background: V.card2, border: `1px solid ${mKesin ? V.emerald + "55" : V.border2}`, padding: "1px 6px", borderRadius: 5, fontWeight: 600, flexShrink: 0, letterSpacing: "0.02em", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >🏷 {mAd}{mKesin ? "" : " ?"}{merchant.psp ? ` · ${merchant.psp}` : ""}</span>
          )}
        </div>
        <div style={{ fontSize: "11.5px", color: V.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {meta}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <span className="num" style={{ fontSize: "14px", fontWeight: 600, color: s.amtRenk, fontFamily: MONO }}>
          {s.sign}{TL(t.miktar)}
        </span>
        {t.orjinalPb && t.orjinalPb !== "TRY" && (
          <div style={{ fontSize: "10.5px", color: V.ink3, fontFamily: MONO }}>{pbSembol(t.orjinalPb)}{(t.orjinalTutar || 0).toLocaleString("tr-TR")}</div>
        )}
      </div>
      <DelBtn onClick={() => onSil(t.tip, t.id)} />
    </div>
  );
}

export function Islemler({ findata, fd, donem, bildir, setFindata, baslangicFiltre, onFiltreTemizle, onSil, onDuzenle, onGelirEkle, onGiderEkle, onAbonelikEkle }) {
  const [filter, setFilter] = useState(() => (baslangicFiltre === "incele" ? "incele" : "tumu"));
  const [q, setQ] = useState("");
  const [kat, setKat] = useState(""); // kategori filtresi ("" = tümü)
  // Panel'den gelen tek-seferlik "İncele" odağını mount'ta tüket → sonraki
  // ziyaretlerde normal aç (sticky olmasın).
  useEffect(() => { if (baslangicFiltre && onFiltreTemizle) onFiltreTemizle(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // İncelenecek işlemler (needs_review) — global backlog, döneme bağlı değil.
  const bekleyen = bekleyenInceleme(findata);
  const kisiAdi = (id) => (findata.kisiler || []).find((k) => String(k.id) === String(id))?.ad || "";

  // Bir kaydın finansal anlamını (tur) ayarla — ham başlık/tutar/tarih/kişi KORUNUR.
  // kaynak: "user" (elle) | "rule" (öneri kabul) | "ai" — provenance kaydı.
  // Sınıf sonrası KPI/Analiz/Karne paylaşılan turEtkisi katmanından güncellenir.
  function siniflaKayit(rec, yeniTur, kaynak = "user") {
    if (!setFindata) return;
    const list = rec._yon === "gelir" ? "gelirler" : "giderler";
    setFindata((d) => ({ ...d, [list]: (d[list] || []).map((x) => (String(x.id) === String(rec.id) ? { ...x, tur: yeniTur, turKaynak: kaynak } : x)) }));
    bildir && bildir(`"${rec.baslik}" → ${turEtiket(yeniTur)} olarak sınıflandı`, "ok");
  }

  // Öneri motoru (deterministik): untagged kayıtlardan finansal anlamı düz gelir/
  // gider'den FARKLI olanları grupla. Otomatik UYGULAMAZ — kullanıcı onaylar.
  const oneri = oneriBekleyen(findata);
  const [oneriAcik, setOneriAcik] = useState({}); // grup önizleme aç/kapa
  const [sonToplu, setSonToplu] = useState(null); // batch undo tokeni

  // Yüksek güvenli grubu toplu uygula (kullanıcı tetikli, önizlemeli, geri-alınır).
  function siniflaGrup(g) {
    if (!setFindata || !g.kayitlar.length) return;
    const { data, geriAl } = topluSinifla(findata, g.kayitlar, "rule");
    setFindata(() => data);
    setSonToplu({ geriAl, adet: g.kayitlar.length, label: g.label });
    bildir && bildir(`${g.kayitlar.length} işlem "${g.label}" olarak sınıflandı — geri alınabilir`, "ok");
  }
  function topluGeriAl() {
    if (!sonToplu || !setFindata) return;
    setFindata((d) => geriAlSinifla(d, sonToplu.geriAl));
    bildir && bildir(`${sonToplu.adet} işlem geri alındı`, "ok");
    setSonToplu(null);
  }

  // ---- Merchant enrichment (runtime-derived; ham baslik ASLA değişmez; KPI 0 TL) ----
  const merchantKurallari = findata.merchantKurallari || [];
  const mCoz = (t) => merchantCoz(t.baslik, merchantKurallari, t.merchantOverride);
  const [mDuzen, setMDuzen] = useState(null); // merchant editörü açık olan işlem
  const [mAd, setMAd] = useState("");
  const [mBenzer, setMBenzer] = useState(false); // "benzerlere uygula" önizleme açık
  const yeniId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "mk_" + Date.now());
  const listOf = (tip) => (tip === "gelir" ? "gelirler" : tip === "abonelik" ? "abonelikler" : "giderler");

  function merchantAc(t) { setMDuzen(t); setMAd(mCoz(t).merchant || mCoz(t).merchantCandidate || ""); setMBenzer(false); }
  function merchantAyarla(t, ad) {
    if (!setFindata) return;
    const L = listOf(t.tip);
    setFindata((d) => ({ ...d, [L]: (d[L] || []).map((x) => (String(x.id) === String(t.id) ? { ...x, merchantOverride: ad } : x)) }));
    bildir && bildir(`Merchant: "${ad}" (bu işlem)`, "ok");
    setMDuzen(null);
  }
  function merchantTemizle(t) {
    if (!setFindata) return;
    const L = listOf(t.tip);
    setFindata((d) => ({ ...d, [L]: (d[L] || []).map((x) => (String(x.id) === String(t.id) ? (() => { const { merchantOverride, ...r } = x; return r; })() : x)) }));
    bildir && bildir("Merchant override kaldırıldı (türetilmişe döndü)", "ok");
    setMDuzen(null);
  }
  function kuralEkle(kural) {
    if (!setFindata) return;
    setFindata((d) => ({ ...d, merchantKurallari: [...(d.merchantKurallari || []), { id: yeniId(), ...kural }] }));
    bildir && bildir(`"${kural.merchant}" kuralı eklendi (benzer işlemlere uygulanır)`, "ok");
    setMDuzen(null);
  }
  function kuralSil(id) {
    if (!setFindata) return;
    setFindata((d) => ({ ...d, merchantKurallari: (d.merchantKurallari || []).filter((k) => k.id !== id) }));
    bildir && bildir("Merchant kuralı silindi (türetilmişe döner)", "ok");
  }

  // ---- AI fallback (Increment 3): deterministik + merchant SONRASI, opsiyonel.
  // Yalnız belirsiz/unresolved adaylar; kullanıcı aksiyonuyla; asla otomatik yazmaz. ----
  const aiAdaylar = aiAdaylari(findata);
  const [aiDurum, setAiDurum] = useState(null); // null | onay | calisiyor | sonuc | hata
  const [aiSonuc, setAiSonuc] = useState([]);
  const [aiHataMsg, setAiHataMsg] = useState("");
  async function aiCalistir() {
    setAiDurum("calisiyor");
    try {
      const adaylar = aiAdaylari(findata);
      const oneriler = await turOnerAI(adaylar, claudeCall, { merchantKurallari, batchSize: 20 });
      const idx = {}; adaylar.forEach((a) => (idx[a.id] = a));
      const gecmis = gecmisKararlar(findata, merchantKurallari); // learning: önceki kullanıcı kararları band'i güçlendirir
      const zengin = oneriler.map((o) => {
        const kayit = idx[o.id]; if (!kayit) return null;
        const ctx = aiContext(kayit, merchantKurallari);
        return { ...o, yon: kayit._yon, kayit, merchant: ctx.merchant, band: aiGuvenBand(o, ctx, gecmis) };
      }).filter(Boolean);
      if (!zengin.length) { setAiHataMsg("AI, belirsiz kayıtlar için öneri üretmedi (hepsi atlandı)."); setAiDurum("hata"); return; }
      setAiSonuc(zengin); setAiDurum("sonuc");
    } catch (e) {
      setAiHataMsg("AI çağrısı başarısız: " + (e?.message || "bilinmeyen hata") + ". Uygulama normal çalışmaya devam eder; hiçbir işlem değişmedi.");
      setAiDurum("hata");
    }
  }
  function aiKabulEt(sec) {
    if (!setFindata || !sec.length) return;
    setFindata((d) => aiKabulUygula(d, sec.map((x) => ({ id: x.id, yon: x.yon, tur: x._secTur || x.suggestedTur }))));
    bildir && bildir(`${sec.length} işlem AI önerisiyle sınıflandı (senin onayınla)`, "ok");
    setAiSonuc((s) => s.filter((x) => !sec.some((k) => k.id === x.id && k.yon === x.yon)));
  }
  function aiYoksay(x) { setAiSonuc((s) => s.filter((y) => !(y.id === x.id && y.yon === x.yon))); }

  const hepsi = [
    ...(fd.gelirler || []).map((x) => ({ ...x, tip: "gelir" })),
    ...(fd.giderler || []).map((x) => ({ ...x, tip: "gider" })),
    ...(findata.abonelikler || []).map((x) => ({ ...x, tip: "abonelik" })),
  ].sort((a, b) => String(b.tarih || "").localeCompare(String(a.tarih || "")));

  const hesapAdi = (id) => (findata.hesaplar || []).find((h) => String(h.id) === String(id))?.ad || "";
  // Mevcut listedeki kategoriler (filtre açılır menüsü için)
  const katSecenek = [...new Set(hepsi.map((t) => t.kategori).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));

  const aranan = q.trim().toLocaleLowerCase("tr");
  const liste = hepsi.filter((t) => {
    if (filter !== "tumu" && t.tip !== filter) return false;
    if (kat && (t.kategori || "") !== kat) return false;
    if (!aranan) return true;
    const metin = `${t.baslik || ""} ${t.kategori || ""} ${hesapAdi(t.hesapId)}`.toLocaleLowerCase("tr");
    return metin.includes(aranan);
  });

  // Özet (filtreli liste): gelir / gider / net
  const ozetGelir = liste.filter((t) => t.tip === "gelir").reduce((s, t) => s + (+t.miktar || 0), 0);
  const ozetGider = liste.filter((t) => t.tip !== "gelir").reduce((s, t) => s + (+t.miktar || 0), 0);

  // Aya göre grupla (YYYY-MM), her grupta net alt-toplam
  const gruplar = {};
  liste.forEach((t) => { const ay = String(t.tarih || "").slice(0, 7) || "—"; (gruplar[ay] = gruplar[ay] || []).push(t); });
  const aylar = Object.keys(gruplar).sort().reverse();
  const ayBaslik = (ay) => { const [y, m] = ay.split("-"); return AY_ADI[+m - 1] ? `${AY_ADI[+m - 1]} ${y}` : ay; };
  const ayNet = (arr) => arr.reduce((s, t) => s + (t.tip === "gelir" ? +t.miktar : -t.miktar), 0);

  const sinifliAdet = siniflananHane(findata).length; // yeniden sınıflanabilir (sınıflanmış hane)
  const inceleSayac = bekleyen.adet || oneri.toplamAdet; // pill rozetinde göster (needs_review yoksa öneri)
  const FILTRELER = [
    { id: "tumu", label: "Tümü" },
    { id: "gelir", label: "Gelir" },
    { id: "gider", label: "Gider" },
    { id: "abonelik", label: "Abonelik" },
    ...(bekleyen.adet || sinifliAdet || oneri.toplamAdet || (aiHazir() && aiAdaylar.length) ? [{ id: "incele", label: inceleSayac ? `İncele · ${inceleSayac}` : "İncele", uyari: bekleyen.adet > 0 || oneri.toplamAdet > 0 }] : []),
  ];

  return (
    <div className="fa-page">
      <div style={{ display: "flex", gap: "9px", marginBottom: "18px", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, padding: 4, background: V.card2, border: `1px solid ${V.border}`, borderRadius: 11 }}>
          {FILTRELER.map((ff) => {
            const on = filter === ff.id;
            const bg = on ? (ff.uyari ? V.accent : V.emerald) : "transparent";
            const renk = on ? "#F4F1E9" : ff.uyari ? V.accent : V.ink2;
            return (
              <button
                key={ff.id}
                onClick={() => setFilter(ff.id)}
                className="fa-btn"
                style={{ border: "none", borderRadius: 8, padding: "8px 13px", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: F, background: bg, color: renk, whiteSpace: "nowrap" }}
              >
                {ff.label}
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: "8px", padding: "8px 13px", background: V.card2, border: `1px solid ${V.border}`, borderRadius: 11, color: V.ink3 }}>
          <Icon d="search" size={15} stroke={V.ink3} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="İşlem ara…"
            style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none", color: V.ink, fontSize: "13px", fontFamily: F }}
          />
        </div>
        {katSecenek.length > 0 && (
          <select
            value={kat}
            onChange={(e) => setKat(e.target.value)}
            title="Kategoriye göre filtrele"
            style={{ padding: "9px 11px", background: kat ? V.emerald : V.card2, color: kat ? "#F4F1E9" : V.ink2, border: `1px solid ${V.border}`, borderRadius: 11, fontSize: "13px", fontFamily: F, fontWeight: 600, cursor: "pointer", outline: "none", maxWidth: 170 }}
          >
            <option value="">Tüm kategoriler</option>
            {katSecenek.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
          <Btn variant="ghost" onClick={onGelirEkle} style={{ padding: "9px 13px" }}><Icon d="plus" size={15} /> Gelir</Btn>
          <Btn variant="ghost" onClick={onGiderEkle} style={{ padding: "9px 13px" }}><Icon d="plus" size={15} /> Gider</Btn>
          <Btn variant="ghost" onClick={onAbonelikEkle} style={{ padding: "9px 13px" }}><Icon d="plus" size={15} /> Abonelik</Btn>
        </div>
      </div>

      {filter === "incele" ? (
        (() => {
          const ara = (r) => !aranan || `${r.baslik || ""} ${kisiAdi(r.kisiId)}`.toLocaleLowerCase("tr").includes(aranan);
          const bekleyenListe = bekleyen.kayitlar.filter(ara);
          const sinifliListe = siniflananHane(findata).filter(ara);
          const oneriGruplar = oneri.gruplar.map((g) => ({ ...g, kayitlar: g.kayitlar.filter(ara) })).filter((g) => g.kayitlar.length);
          const aiVar = aiHazir() && aiAdaylar.length > 0;
          return bekleyenListe.length === 0 && sinifliListe.length === 0 && oneriGruplar.length === 0 && !aiVar ? (
            <Bos baslik="İncelenecek işlem yok" mesaj="Sınıflandırılmayı bekleyen ya da önerilen işlem yok." icon="doc" />
          ) : (
            <>
              {aiVar && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: V.card2, border: `1px solid ${V.border}`, borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
                  <div style={{ fontSize: 12.5, color: V.ink2 }}>🤖 <b style={{ color: V.ink }}>{aiAdaylar.length}</b> belirsiz işlem için AI önerisi alınabilir <span style={{ color: V.ink3 }}>(deterministik + merchant sonrası kalanlar; otomatik uygulanmaz)</span></div>
                  <Btn onClick={() => setAiDurum("onay")} style={{ padding: "7px 12px", fontSize: 12 }}>Kalanları AI ile öner</Btn>
                </div>
              )}
              {oneriGruplar.length > 0 && (
                <>
                  <div style={{ background: "var(--chip-amber)", border: `1px solid ${V.accent}55`, borderRadius: 12, padding: "12px 16px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 12.5, color: V.ink2, lineHeight: 1.5, flex: 1, minWidth: 200 }}>💡 <b style={{ color: V.ink }}>{oneri.toplamAdet} işlem</b> için sınıflandırma önerisi — <b>otomatik uygulanmaz</b>, sen onaylarsın. Ham işleme dokunulmaz, geri alınır.</div>
                    {sonToplu && (
                      <button onClick={topluGeriAl} className="fa-btn" style={{ border: `1px solid ${V.border2}`, borderRadius: 8, padding: "6px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F, background: V.card2, color: V.ink2, whiteSpace: "nowrap" }}>↩︎ Geri al ({sonToplu.adet})</button>
                    )}
                  </div>
                  {oneriGruplar.map((g) => {
                    const ip = turEtkiIpucu(g.tur, g.kayitlar[0]?._yon);
                    const yuksek = g.guven === "yuksek";
                    const acik = oneriAcik[g.tur];
                    return (
                      <Card key={g.tur} style={{ padding: "12px 18px", marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 600, color: V.ink, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: yuksek ? V.pos : V.accent, background: yuksek ? V.chipGreen : V.chipGold, border: `1px solid ${(yuksek ? V.pos : V.accent)}55`, padding: "1px 7px", borderRadius: 5 }}>{yuksek ? "yüksek güven" : "gözden geçir"}</span>
                              {g.adet} işlem → {g.label}
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: V.ink3, fontWeight: 500 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: ETKI_RENK[ip.tip] }} />{ip.metin}</span>
                            </div>
                            <div style={{ fontSize: 11.5, color: V.ink3, fontFamily: MONO, marginTop: 2 }}>{TL(g.toplam)}</div>
                          </div>
                          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            <Btn variant="ghost" onClick={() => setOneriAcik((s) => ({ ...s, [g.tur]: !acik }))} style={{ padding: "7px 11px", fontSize: 12 }}>{acik ? "Gizle" : "Önizle"}</Btn>
                            {yuksek && <Btn onClick={() => siniflaGrup(g)} style={{ padding: "7px 11px", fontSize: 12 }}>Bu grubu uygula ({g.adet})</Btn>}
                          </div>
                        </div>
                        {(acik || !yuksek) && (
                          <div style={{ marginTop: 4 }}>
                            {g.kayitlar.map((r, i) => (
                              <InceleSatir key={`o-${r._yon}-${r.id}`} rec={r} kisiAd={kisiAdi(r.kisiId)} son={i === g.kayitlar.length - 1} onSinifla={(rec, tur) => siniflaKayit(rec, tur, tur === r._oneriTur ? "rule" : "user")} aktifTur={r._oneriTur} />
                            ))}
                          </div>
                        )}
                        {!yuksek && <div style={{ fontSize: 11.5, color: V.ink3, marginTop: 6 }}>Yüksek etkili — her birini tek tek onayla (toplu yok). Anlamı sen seç: transfer / hediye / borç…</div>}
                      </Card>
                    );
                  })}
                </>
              )}
              {bekleyen.adet > 0 && (
                <div style={{ background: "var(--chip-amber)", border: `1px solid ${V.accent}55`, borderRadius: 12, padding: "12px 16px", marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: V.ink, marginBottom: 3 }}>🔎 {bekleyen.adet} işlem · {TL(bekleyen.toplam)} sınıflandırılmayı bekliyor</div>
                  <div style={{ fontSize: 12, color: V.ink2, lineHeight: 1.5 }}>Ham işleme dokunulmaz — yalnızca <b>finansal anlamını</b> seçersin. Renkli nokta KPI etkisini gösterir: <span style={{ color: V.neg }}>● gider</span> · <span style={{ color: V.pos }}>● gelir/iade</span> · <span style={{ color: V.ink3 }}>● nötr</span>. İstediğin zaman değiştirebilirsin.</div>
                </div>
              )}
              {bekleyenListe.length > 0 && (
                <Card style={{ padding: "4px 18px", marginBottom: sinifliListe.length ? 14 : 0 }}>
                  {bekleyenListe.map((r, i) => (
                    <InceleSatir key={`${r._yon}-${r.id}`} rec={r} kisiAd={kisiAdi(r.kisiId)} son={i === bekleyenListe.length - 1} onSinifla={siniflaKayit} />
                  ))}
                </Card>
              )}
              {sinifliListe.length > 0 && (
                <>
                  <div style={{ margin: "0 4px 7px", fontSize: 11.5, color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Sınıflanmış · değiştirebilirsin</div>
                  <Card style={{ padding: "4px 18px" }}>
                    {sinifliListe.map((r, i) => (
                      <InceleSatir key={`s-${r._yon}-${r.id}`} rec={r} kisiAd={kisiAdi(r.kisiId)} son={i === sinifliListe.length - 1} onSinifla={siniflaKayit} aktifTur={r.tur} />
                    ))}
                  </Card>
                </>
              )}
            </>
          );
        })()
      ) : liste.length === 0 ? (
        <Bos baslik="İşlem yok" mesaj="Bu dönemde işlem bulunmuyor." icon="doc" />
      ) : (
        <>
          {/* Özet şeridi */}
          <Card style={{ marginBottom: 14, padding: "13px 18px", display: "flex", gap: 22, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 10.5, color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em" }}>İşlem</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: V.ink, fontFamily: MONO }}>{liste.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Gelir</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: V.pos, fontFamily: MONO }}>+{TL(ozetGelir)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Gider</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: V.neg, fontFamily: MONO }}>−{TL(ozetGider)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Net</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: ozetGelir - ozetGider >= 0 ? V.pos : V.neg, fontFamily: MONO }}>{TL(ozetGelir - ozetGider)}</div>
            </div>
          </Card>

          {/* Aya göre gruplu liste */}
          {aylar.map((ay) => {
            const net = ayNet(gruplar[ay]);
            return (
              <div key={ay} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "0 4px 7px" }}>
                  <span className="serif" style={{ fontSize: 13.5, fontWeight: 600, color: V.ink2, fontFamily: SERIF }}>{ayBaslik(ay)}</span>
                  <span style={{ fontSize: 11.5, color: V.ink3 }}>
                    {gruplar[ay].length} işlem · net <b className="num" style={{ color: net >= 0 ? V.pos : V.neg, fontFamily: MONO }}>{TL(net)}</b>
                  </span>
                </div>
                <Card style={{ padding: "6px 18px" }}>
                  {gruplar[ay].map((t, i) => (
                    <IslemSatir key={`${t.tip}-${t.id}`} t={t} hesapAd={hesapAdi(t.hesapId)} son={i === gruplar[ay].length - 1} onDuzenle={onDuzenle} onSil={onSil} merchant={mCoz(t)} onMerchant={merchantAc} />
                  ))}
                </Card>
              </div>
            );
          })}
        </>
      )}
      {aiDurum && (
        <Modal title="AI ile sınıflandırma önerisi" onClose={() => setAiDurum(null)} maxWidth={520}>
          {aiDurum === "onay" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 13, color: V.ink }}><b>{aiAdaylar.length}</b> belirsiz işlem için AI önerisi oluşturulacak.</div>
              <div style={{ fontSize: 11.5, color: V.ink2, background: V.card2, border: `1px solid ${V.border}`, borderRadius: 8, padding: "9px 11px", lineHeight: 1.55 }}>
                🔒 AI'a yalnız <b>maskeli</b> yapılandırılmış veri gider: yön, tutar, <b>sanitize açıklama</b> (IBAN/kart/telefon/TC/referans maskeli), normalize merchant, kategori. Ham işlem <b>değişmez</b>, anahtarın sunucuda; öneriler <b>otomatik uygulanmaz</b> — sen onaylarsın.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn onClick={aiCalistir} style={{ padding: "8px 13px" }}>Gönder ({aiAdaylar.length})</Btn>
                <Btn variant="ghost" onClick={() => setAiDurum(null)} style={{ padding: "8px 13px" }}>Vazgeç</Btn>
              </div>
            </div>
          )}
          {aiDurum === "calisiyor" && <div style={{ fontSize: 13, color: V.ink2, padding: "14px 0" }}>AI önerileri alınıyor… (batch'ler halinde, ham veri maskeli)</div>}
          {aiDurum === "hata" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12.5, color: V.neg, lineHeight: 1.5 }}>{aiHataMsg}</div>
              <Btn variant="ghost" onClick={() => setAiDurum(null)} style={{ padding: "8px 13px" }}>Kapat</Btn>
            </div>
          )}
          {aiDurum === "sonuc" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, color: V.ink2 }}>{aiSonuc.length} öneri — Kabul / Başka tür / Yoksay. <b>Otomatik uygulanmaz.</b></div>
                <Btn onClick={() => aiKabulEt(aiSonuc.filter((x) => x.band === "Yüksek"))} style={{ padding: "6px 10px", fontSize: 11.5 }}>Yüksek güvenlileri kabul ({aiSonuc.filter((x) => x.band === "Yüksek").length})</Btn>
              </div>
              <div style={{ maxHeight: 340, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                {aiSonuc.map((x) => {
                  const secTur = x._secTur || x.suggestedTur;
                  const ip = turEtkiIpucu(secTur, x.yon);
                  return (
                    <div key={`${x.yon}-${x.id}`} style={{ border: `1px solid ${V.border}`, borderRadius: 10, padding: "9px 11px", background: V.card2 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: V.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.kayit.baslik}</div>
                      <div style={{ fontSize: 11, color: V.ink3, margin: "2px 0 6px" }}>{x.merchant ? `${x.merchant} · ` : ""}{TL(x.kayit.miktar)} · {x.yon === "gelir" ? "gelen" : "giden"} · <span style={{ color: x.band === "Yüksek" ? V.pos : x.band === "Orta" ? V.gold : V.ink3, fontWeight: 600 }}>{x.band} güven</span></div>
                      <div style={{ fontSize: 11, color: V.ink2, marginBottom: 7 }}>Öneri: <b style={{ color: V.accent }}>{turEtiket(secTur)}</b> · <span style={{ color: ETKI_RENK[ip.tip] }}>{ip.metin}</span>{x.reason ? ` — ${x.reason}` : ""}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <Btn onClick={() => aiKabulEt([x])} style={{ padding: "5px 10px", fontSize: 11.5 }}>Kabul</Btn>
                        <select value={secTur} onChange={(e) => setAiSonuc((s) => s.map((y) => (y.id === x.id && y.yon === x.yon ? { ...y, _secTur: e.target.value } : y)))} style={{ padding: "5px 8px", fontSize: 11.5, background: V.card, color: V.ink2, border: `1px solid ${V.border2}`, borderRadius: 7, fontFamily: F }}>
                          {turSecenekleri(x.yon).map((s) => <option key={s.tur} value={s.tur}>{s.label}</option>)}
                        </select>
                        <button onClick={() => aiYoksay(x)} className="fa-btn" style={{ border: `1px solid ${V.border2}`, borderRadius: 7, padding: "5px 10px", fontSize: 11.5, cursor: "pointer", fontFamily: F, background: "transparent", color: V.ink3 }}>Yoksay</button>
                      </div>
                    </div>
                  );
                })}
                {aiSonuc.length === 0 && <div style={{ fontSize: 12, color: V.ink3, padding: "10px 0" }}>Tüm öneriler işlendi.</div>}
              </div>
            </div>
          )}
        </Modal>
      )}
      {mDuzen && (() => {
        const r = mCoz(mDuzen);
        const kural = mAd.trim() ? merchantKuralUret(mDuzen.baslik, mAd.trim(), "contains") : null;
        const tumIslemler = [...(findata.gelirler || []), ...(findata.giderler || []), ...(findata.abonelikler || [])];
        const etkilenen = kural ? benzerAdaylar(tumIslemler, kural) : [];
        return (
          <Modal title="Merchant düzelt" onClose={() => setMDuzen(null)} maxWidth={460}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 10.5, color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Ham açıklama (değişmez)</div>
                <div style={{ fontSize: 12.5, color: V.ink2, background: V.card2, border: `1px solid ${V.border}`, borderRadius: 8, padding: "8px 10px", wordBreak: "break-word" }}>{mDuzen.baslik}</div>
              </div>
              <div style={{ fontSize: 11.5, color: V.ink3 }}>
                Türetilen: <b style={{ color: r.merchant ? V.emerald : V.ink2 }}>{r.merchant || r.merchantCandidate || "—"}</b>
                {r.merchantSource ? ` · ${r.merchantSource}` : ""}{r.merchantConfidence ? ` · ${r.merchantConfidence}` : ""}{r.psp ? ` · PSP: ${r.psp}` : ""}
              </div>
              <Field label="Merchant" value={mAd} onChange={setMAd} placeholder="Örn: Migros" />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn onClick={() => mAd.trim() && merchantAyarla(mDuzen, mAd.trim())} style={{ padding: "8px 12px", opacity: mAd.trim() ? 1 : 0.5 }}>Bu işleme uygula</Btn>
                {mDuzen.merchantOverride && <Btn variant="ghost" onClick={() => merchantTemizle(mDuzen)} style={{ padding: "8px 12px" }}>Override'ı kaldır</Btn>}
                {mAd.trim() && <Btn variant="ghost" onClick={() => setMBenzer((v) => !v)} style={{ padding: "8px 12px" }}>{mBenzer ? "Gizle" : "Benzerlere uygula…"}</Btn>}
              </div>
              {mBenzer && kural && (
                <div style={{ border: `1px solid ${V.border}`, borderRadius: 10, padding: "10px 12px", background: V.card2 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: V.ink, marginBottom: 6 }}>Bu kural <b>{etkilenen.length}</b> işlemi "{mAd.trim()}" yapar (kapsam: içerir "{kural.anahtar}"):</div>
                  <div style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                    {etkilenen.slice(0, 40).map((x) => (
                      <div key={x.id} style={{ fontSize: 11, color: V.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {x.baslik}</div>
                    ))}
                    {etkilenen.length > 40 && <div style={{ fontSize: 11, color: V.ink3 }}>… +{etkilenen.length - 40} daha</div>}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Btn onClick={() => etkilenen.length && kuralEkle(kural)} style={{ padding: "8px 12px", opacity: etkilenen.length ? 1 : 0.5 }}>Onayla ve {etkilenen.length} işleme uygula</Btn>
                  </div>
                </div>
              )}
              {merchantKurallari.length > 0 && (
                <div>
                  <div style={{ margin: "4px 0 6px", fontSize: 11, color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Merchant kuralların ({merchantKurallari.length})</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 140, overflowY: "auto" }}>
                    {merchantKurallari.map((k) => (
                      <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: V.ink2 }}>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><b style={{ color: V.ink }}>{k.merchant}</b> ← {k.tip}:"{k.anahtar}"</span>
                        <DelBtn onClick={() => kuralSil(k.id)} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

export function IslemModal({ mod, form, setForm, kategorilerGelir, kategorilerGider, hesaplar, hafiza, kurlar, onClose, onKaydet }) {
  const abonelik = mod === "abonelik";
  const baslik = abonelik
    ? (form._editId ? "Abonelik Düzenle" : "Abonelik Ekle")
    : (form._editId ? "İşlem Düzenle" : "İşlem Ekle");

  // İçinde bulunulan tip için kategori listesi
  const katListe = abonelik ? (kategorilerGider || []) : (form.tip === "gelir" ? (kategorilerGelir || []) : (kategorilerGider || []));

  // Gelir/Gider geçişi: kategori yeni listede yoksa listenin ilkine çek
  function tipSec(tip) {
    const liste = tip === "gelir" ? (kategorilerGelir || []) : (kategorilerGider || []);
    setForm((f) => ({ ...f, tip, kategori: liste.includes(f.kategori) ? f.kategori : (liste[0] || f.kategori) }));
  }

  // Başlık değişiminde hafızadan kategori önerisi uygula
  function baslikDegis(v) {
    const key = (v || "").toLowerCase().trim().split(/\s+/).slice(0, 2).join(" ");
    const oneri = key && hafiza ? hafiza[key] : undefined;
    setForm((f) => ({ ...f, baslik: v, ...(oneri ? { kategori: oneri } : {}) }));
  }

  const segBtn = (tip, etiket) => {
    const on = form.tip === tip;
    return (
      <button
        type="button"
        onClick={() => tipSec(tip)}
        className="fa-btn"
        style={{ flex: 1, border: "none", borderRadius: 9, padding: "10px", fontSize: "13.5px", fontWeight: 600, cursor: "pointer", fontFamily: F, background: on ? V.emerald : V.card2, color: on ? "#F4F1E9" : V.ink2, ...(on ? {} : { border: `1px solid ${V.border}` }) }}
      >
        {etiket}
      </button>
    );
  };

  return (
    <Modal title={baslik} onClose={onClose} maxWidth={420}>
      {!abonelik && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          {segBtn("gelir", "Gelir")}
          {segBtn("gider", "Gider")}
        </div>
      )}

      <Field label="Başlık" value={form.baslik} onChange={baslikDegis} placeholder="Örn: Migros market" />

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: "11.5px", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{abonelik ? "Aylık Ücret" : "Tutar"}</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={form.miktar}
            onChange={(e) => setForm((f) => ({ ...f, miktar: e.target.value }))}
            inputMode="decimal"
            placeholder="0"
            style={{ ...inputStyle, fontFamily: MONO, flex: 1, width: "auto" }}
          />
          <select
            value={form.pb || "TRY"}
            onChange={(e) => setForm((f) => ({ ...f, pb: e.target.value }))}
            style={{ ...inputStyle, width: 96, flex: "none", cursor: "pointer" }}
          >
            {PB_SECENEK.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        {form.pb && form.pb !== "TRY" && (
          <div style={{ fontSize: "11.5px", marginTop: 6, color: kurlar ? V.ink3 : V.neg }}>
            {kurlar
              ? `≈ ${TL(tryeCevir(sayiCevir(form.miktar), form.pb, kurlar) || 0)} olarak kaydedilir (${pbSembol(form.pb)}1 = ${TL(form.pb === "USD" ? kurlar.usd : kurlar.eur)})`
              : "Kur bilgisi yok — Ayarlar → Kur'dan güncelle."}
          </div>
        )}
      </div>

      <Field
        label="Kategori"
        value={form.kategori}
        onChange={(v) => setForm((f) => ({ ...f, kategori: v }))}
        options={katListe}
      />

      <Field
        label="Tarih"
        type="date"
        value={form.tarih}
        onChange={(v) => setForm((f) => ({ ...f, tarih: v }))}
      />

      {!abonelik && (
        <>
          <Field
            label="Hesap"
            value={form.hesapId || ""}
            onChange={(v) => setForm((f) => ({ ...f, hesapId: v }))}
            options={[{ id: "", label: "Hesap yok" }, ...((hesaplar || []).map((h) => ({ id: String(h.id), label: h.ad || "Hesap" })))]}
          />

          {!form._editId && (
            <div style={{ marginBottom: "14px" }}>
              <Toggle
                label="Her ay tekrarla"
                sub="Kira, maaş, abonelik gibi sabit kalemler"
                checked={!!form.tekrarla}
                onChange={(v) => setForm((f) => ({ ...f, tekrarla: v }))}
              />
            </div>
          )}

          <div style={{ marginBottom: "16px" }}>
            <Toggle label="Hane ortak" checked={!!form.hane} onChange={(v) => setForm((f) => ({ ...f, hane: v }))} />
          </div>
        </>
      )}

      <Btn variant="primary" onClick={onKaydet} style={{ width: "100%", padding: "13px", marginTop: "2px" }}>Kaydet</Btn>
    </Modal>
  );
}
