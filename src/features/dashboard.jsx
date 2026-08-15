// ============================================================
// Panel (dashboard) — Zümrüt & Altın tasarımı
// Hızlı Ekle (doğal dil + fiş fotoğrafı) + özet kartları,
// net varlık grafiği, harcama dağılımı, yaklaşan ödemeler, bütçe
// ============================================================
import { useRef, useState } from "react";
import { V, PALET, GIDER_KAT, AY_ADI } from "../lib/constants.js";
import { TL, bugun, buAy, kategoriAnahtar, parseJSON, fileToBase64, tarihNormalize, sayiCevir } from "../lib/format.js";
import { claudeCall, aiHazir } from "../lib/ai.js";
import { yaklasanOdemeler, etkinButce, panelBrifing, donemAraligi, donemde, kartOdemeler, butceOnerisi, giderKategorileri } from "../lib/finance.js";
import { donemHesap, aylikKarsilastir } from "../lib/hesapla.js";
import { maasDurumu } from "../lib/maas.js";
import { faturaKategori } from "../lib/fatura.js";
import { taksitPlanlari, aylikTaksitYuku, kalanTaksitBorcu } from "../lib/taksit.js";
import { nakitAkisProjeksiyon } from "../lib/nakitakis.js";
import { sessizZamlar } from "../lib/anomali.js";
import { bekleyenInceleme } from "../lib/incele.js";
import { oneriBekleyen } from "../lib/oneri.js";
import { Card, Btn, Stat, ProgressBar, Bos, Brifing, Para, Modal, Field } from "../components/ui.jsx";
import { Icon } from "../components/icons.jsx";

function aiHata(e) {
  return e?.name === "AIAnahtarYok" ? e.message : null;
}

const baslik = { fontSize: 16, fontWeight: 600, color: V.ink };
const kisaAy = (ay) => AY_ADI[(parseInt((ay || "").slice(5, 7), 10) || 1) - 1] || "";
const kisaTarih = (t) => (t ? `${parseInt(t.slice(8, 10), 10)} ${kisaAy(t)}` : "");

export function Panel({
  findata, fd, donem, donemAdi, setFindata, bildir,
  toplamGelir, toplamGider, toplamAbonelik, nakit, netDeger,
  yatirimDeger, yatirimKar, guncelDeger, onHizliEkle, kategoriOgren, onGit, onIncele,
}) {
  const bekleyenIncele = bekleyenInceleme(findata); // sınıflandırma bekleyen (needs_review)
  const oneriDurum = oneriBekleyen(findata); // motor önerisi (untagged → KPI'yı etkileyebilir)
  const [metin, setMetin] = useState("");
  const [bekle, setBekle] = useState(false);
  const [fisOku, setFisOku] = useState(false);
  const [fisOnay, setFisOnay] = useState(null); // fiş önizleme/onay modalı
  const fisRef = useRef(null);

  // Hızlı eklenen kayıt seçili dönemin DIŞINDA kalırsa (ör. geçmiş tarihli fiş)
  // kullanıcıya nerede görüneceğini söyle — "eklendi ama görünmüyor" şaşkınlığını önler.
  const donemNotu = (tarih) =>
    donemde(tarih, donemAraligi(donem, bugun())) ? "" : ` · ${tarih} tarihli, "${donemAdi || "seçili dönem"}" dışında — görmek için üstten dönemi "Tümü" yap`;

  // ---- Hızlı Ekle: doğal dil ----
  async function isle() {
    if (!metin.trim() || bekle) return;
    setBekle(true);
    try {
      const txt = await claudeCall([
        { role: "user", content: `Kullanıcı bir finansal işlem yazdı: "${metin}". Bugün ${bugun()}. SADECE şu JSON: {"tip":"gelir|gider","baslik":"kısa açıklama","miktar":sayı,"kategori":"${GIDER_KAT.join("|")}|Maaş|Ek Gelir","tarih":"YYYY-MM-DD"}. Tarih belirtilmemişse bugünü kullan.` },
      ]);
      const j = parseJSON(txt);
      const tip = j.tip === "gelir" ? "gelir" : "gider";
      const k = kategoriAnahtar(j.baslik);
      const hatirla = (findata.kategoriHafiza || {})[k];
      const kategori = hatirla || j.kategori || (tip === "gelir" ? "Ek Gelir" : "Diğer");
      const tarih = tarihNormalize(j.tarih, bugun());
      const miktar = Math.abs(parseFloat(j.miktar) || 0);
      onHizliEkle(tip, { baslik: j.baslik, miktar, kategori, tarih, hesapId: "" });
      kategoriOgren(j.baslik, kategori);
      bildir(`${tip === "gelir" ? "Gelir" : "Gider"} eklendi: ${j.baslik} ${TL(miktar)}${donemNotu(tarih)}`);
      setMetin("");
    } catch (e) {
      bildir(aiHata(e) || "Anlaşılamadı, tekrar dener misin?", "err");
    } finally {
      setBekle(false);
    }
  }

  // ---- Hızlı Ekle: fiş fotoğrafı ----
  async function fisYukle(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFisOku(true);
    try {
      const b64 = await fileToBase64(file);
      const txt = await claudeCall([
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } },
            { type: "text", text: `Alışveriş fişi. SADECE JSON: {"magaza":"...","tarih":"YYYY-MM-DD","toplam":sayı,"kategori":"${GIDER_KAT.join("|")}"}. Tarih yoksa bugünü kullan.` },
          ],
        },
      ]);
      const j = parseJSON(txt);
      const adi = j.magaza || "Fiş";
      const kategori = faturaKategori(adi) || j.kategori || "Market";
      const miktar = Math.abs(parseFloat(j.toplam) || 0);
      const tarih = tarihNormalize(j.tarih, bugun());
      // Doğrudan eklemek yerine ÖNİZLEME/ONAY: kullanıcı tutar/tarih/kategoriyi
      // görüp düzeltebilsin (yanlış tarih → "eklendi ama görünmüyor"u önler).
      setFisOnay({ baslik: adi, miktar: String(miktar), kategori, tarih });
    } catch (err) {
      bildir(aiHata(err) || "Fiş okunamadı", "err");
    } finally {
      setFisOku(false);
      if (fisRef.current) fisRef.current.value = "";
    }
  }

  // Fiş önizlemesini onayla → gider olarak ekle
  function fisOnayla() {
    const miktar = Math.abs(sayiCevir(fisOnay.miktar));
    if (!String(fisOnay.baslik).trim() || !miktar) { bildir("Başlık ve tutar gerekli", "err"); return; }
    const tarih = tarihNormalize(fisOnay.tarih, bugun());
    const kategori = fisOnay.kategori || "Market";
    onHizliEkle("gider", { baslik: fisOnay.baslik.trim(), miktar, kategori, tarih, hesapId: "" });
    kategoriOgren(fisOnay.baslik, kategori);
    bildir(`Gider eklendi: ${fisOnay.baslik.trim()} ${TL(miktar)}${donemNotu(tarih)}`);
    setFisOnay(null);
  }

  // ---- Özet figürleri — TEK doğruluk kaynağı (hesapla.js) ----
  const oz = donemHesap(findata, donem, bugun()); // gelir/giderToplam/tasarruf tutarlı
  const giderToplam = oz.giderToplam; // abonelik kanonik dahil
  const tasarrufOrani = Math.round(oz.tasarrufOrani);
  const nakitRenk = nakit >= 0 ? V.pos : V.neg;
  // Geçen aya göre (her zaman içinde bulunulan takvim ayı üzerinden)
  const mom = aylikKarsilastir(findata, buAy());
  const yuzde = (d) => (d && d.pct != null ? `${d.pct > 0 ? "+" : ""}%${Math.round(d.pct)}` : "yeni");
  const momRenk = (d, tersi) => { if (!d || d.pct == null || d.fark === 0) return V.ink3; const kotu = tersi ? d.fark < 0 : d.fark > 0; return kotu ? V.neg : V.pos; };

  const [drill, setDrill] = useState(null); // { baslik, kayitlar, tip }
  const drillAc = (baslik, kayitlar, tip) => setDrill({ baslik, kayitlar: [...(kayitlar || [])].sort((a, b) => String(b.tarih).localeCompare(String(a.tarih))), tip });

  const stats = [
    { label: "Toplam Gelir", value: TL(oz.gelir), delta: `${donemAdi} · geçen aya göre ${yuzde(mom.degisim.gelir)}`, deltaColor: momRenk(mom.degisim.gelir, true), onClick: () => drillAc("Gelirler — " + donemAdi, oz.gelirler, "gelir") },
    { label: "Toplam Gider", value: TL(giderToplam), delta: `Abonelik dahil · ${yuzde(mom.degisim.giderToplam)}`, deltaColor: momRenk(mom.degisim.giderToplam, false), onClick: () => drillAc("Giderler — " + donemAdi, oz.giderler, "gider") },
    { label: "Net Nakit", value: TL(nakit), delta: `Tasarruf %${tasarrufOrani}`, deltaColor: nakitRenk },
    { label: "Net Varlık", value: TL(netDeger), delta: `Yatırım ${TL(yatirimDeger)}`, deltaColor: V.ink3, onClick: () => onGit && onGit("hesap") },
  ];

  // ---- Maaş durumu (tanımlı maaşlar için, içinde bulunulan ay) ----
  const buAyStr = buAy();
  const maasDurumlari = (findata.maaslar || []).filter((m) => m.aktif !== false).map((m) => maasDurumu(findata, m.id, buAyStr)).filter(Boolean);

  // ---- Param nerede: hesap/varlık dağılımı ----
  const hesaplar = findata.hesaplar || [];
  const grupla = (tip) => hesaplar.filter((h) => h.tip === tip).reduce((s, h) => s + (+h.bakiye || 0), 0);
  const dagilim = [
    { ad: "Nakit", tutar: grupla("nakit"), renk: V.pos },
    { ad: "Banka", tutar: grupla("banka"), renk: V.accent },
    { ad: "Birikim", tutar: grupla("birikim"), renk: "#6B8E7B" },
    { ad: "Yatırım", tutar: yatirimDeger, renk: "#8A7BB8" },
  ].filter((x) => x.tutar > 0);
  const kartBorc = hesaplar.filter((h) => h.tip === "kart").reduce((s, h) => s + (+h.bakiye || 0), 0);
  const dagilimToplam = dagilim.reduce((s, x) => s + x.tutar, 0);

  // ---- Net varlık gelişimi (SVG alan grafiği) ----
  const netGecmis = (findata.netGecmis || []).filter((p) => p && p.tarih).slice(-12);
  const W = 580, H = 180;
  let alanFill = "", alanLine = "", sonNokta = null;
  if (netGecmis.length >= 2) {
    const degerler = netGecmis.map((p) => p.deger || 0);
    const min = Math.min(...degerler), max = Math.max(...degerler);
    const span = max - min || 1;
    const pts = netGecmis.map((p, i) => {
      const x = netGecmis.length === 1 ? W : (i / (netGecmis.length - 1)) * W;
      const y = H - 18 - ((p.deger - min) / span) * (H - 40);
      return [x, y];
    });
    alanLine = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    alanFill = `${alanLine} L${W},${H} L0,${H} Z`;
    sonNokta = pts[pts.length - 1];
  }

  // ---- Harcama dağılımı (donut) — oz.kategoriler ile TUTARLI (turEtkisi: needs_review
  // / transfer / borç dışı). Kendi ham toplamı yerine tek doğruluk kaynağını kullan.
  const katSirali = oz.kategoriler.map((k) => [k.kategori, k.toplam]);
  const top5 = katSirali.slice(0, 5);
  const digerTutar = katSirali.slice(5).reduce((s, [, v]) => s + v, 0);
  const donutData = [...top5.map(([cat, amt], i) => ({ cat, amt, color: PALET[i % PALET.length] }))];
  if (digerTutar > 0) donutData.push({ cat: "Diğer", amt: digerTutar, color: PALET[5 % PALET.length] });
  const donutToplam = donutData.reduce((s, d) => s + d.amt, 0);
  let donutOffset = 0;
  const donutSegments = donutData.map((d) => {
    const pay = donutToplam > 0 ? (d.amt / donutToplam) * 100 : 0;
    const seg = { ...d, dash: `${pay} ${100 - pay}`, offset: -donutOffset };
    donutOffset += pay;
    return seg;
  });

  // ---- Yaklaşan ödemeler ----
  const yaklasan = [...yaklasanOdemeler(findata, bugun(), 7), ...kartOdemeler(findata, bugun(), 10)].sort((a, b) => a.gun - b.gun).slice(0, 6);

  // ---- Bütçe durumu ----
  const ay = buAy();
  const ayGider = {};
  (findata.giderler || []).filter((g) => (g.tarih || "").startsWith(ay)).forEach((g) => { ayGider[g.kategori] = (ayGider[g.kategori] || 0) + g.miktar; });
  const butceler = Object.entries(findata.butceler || {})
    .filter(([, limit]) => limit > 0)
    .map(([cat]) => {
      const harcanan = ayGider[cat] || 0;
      const limit = etkinButce(findata, cat, ay);
      return { cat, harcanan, limit, pct: limit > 0 ? (harcanan / limit) * 100 : 0 };
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4);

  // ---- Editoryal brifing + enflasyon referans tarihi ----
  const brifing = panelBrifing(findata, bugun());
  const refTarih = donemAraligi(donem, bugun())?.start; // seçili dönemin başı → enflasyon-flip referansı
  const enf = findata.ayarlar?.enflasyon;

  // ---- Taksit takibi (gelecek taksit yükümlülükleri) ----
  const taksitler = taksitPlanlari(findata, bugun());
  const kalanBorc = kalanTaksitBorcu(findata, bugun());
  const taksitYuku = aylikTaksitYuku(findata, bugun(), 4);

  // ---- Nakit akış projeksiyonu (45 gün) ----
  const projeksiyon = nakitAkisProjeksiyon(findata, bugun(), 45);

  // ---- Sessiz zam tespiti ----
  const zamlar = sessizZamlar(findata);

  function butceOner() {
    const oneri = butceOnerisi(findata, bugun());
    const n = Object.keys(oneri).length;
    if (!n) { bildir("Öneri için yeterli geçmiş gider yok", "err"); return; }
    setFindata((d) => ({ ...d, butceler: { ...(d.butceler || {}), ...oneri } }));
    bildir(`${n} kategori için başlangıç bütçesi önerildi`);
  }

  return (
    <div>
      {/* 0) Editoryal brifing (veriden üretilen manşet) */}
      <Brifing manset={brifing.manset} destek={brifing.destek} />

      {/* 0a) İnceleme uyarısı — finansal anlamı bekleyen (needs_review) işlemler.
          Tıkla → İşlemler'in İncele görünümü. KPI'a girmezler; sınıflanınca yansır. */}
      {bekleyenIncele.adet > 0 && (
        <div
          onClick={() => (onIncele ? onIncele() : onGit && onGit("islemler"))}
          role="button"
          style={{ background: "var(--chip-amber)", border: `1px solid ${V.accent}77`, borderRadius: 12, padding: "12px 16px", marginBottom: 16, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
        >
          <span style={{ fontSize: 18 }}>🔎</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: V.ink }}>{bekleyenIncele.adet} işlem · {TL(bekleyenIncele.toplam)} sınıflandırılmayı bekliyor</div>
            <div style={{ fontSize: 11.5, color: V.ink2 }}>Hane kişilerine giden/gelen para — KPI'a girmez. Finansal türünü seçmek için dokun.</div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: V.accent, flexShrink: 0 }}>İncele →</span>
        </div>
      )}

      {/* 0a-2) Öneri nudge — motor, untagged işlemlerde farklı finansal anlam öneriyor.
          Otomatik UYGULAMAZ; tıkla → İncele'de onayla. */}
      {oneriDurum.toplamAdet > 0 && (
        <div
          onClick={() => (onIncele ? onIncele() : onGit && onGit("islemler"))}
          role="button"
          style={{ background: "var(--chip-amber)", border: `1px solid ${V.accent}77`, borderRadius: 12, padding: "12px 16px", marginBottom: 16, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
        >
          <span style={{ fontSize: 18 }}>💡</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: V.ink }}>{oneriDurum.toplamAdet} işlem için sınıflandırma önerisi — finansal doğruluğu artır</div>
            <div style={{ fontSize: 11.5, color: V.ink2 }}>Stopaj, hane transferi gibi KPI'yı etkileyebilecek kalemler. Otomatik uygulanmaz — İncele'de onaylarsın.</div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: V.accent, flexShrink: 0 }}>İncele →</span>
        </div>
      )}

      {/* 0b) Sessiz zam uyarısı — tutarı sessizce artan tekrarlayan kalemler */}
      {zamlar.length > 0 && (
        <div style={{ background: "var(--chip-amber)", border: `1px solid ${V.accent}55`, borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 14 }}>🔔</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: V.ink }}>Sessiz zam uyarısı</span>
            <span style={{ fontSize: 11, color: V.ink3 }}>sessizce artan {zamlar.length} kalem</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {zamlar.slice(0, 3).map((z, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, color: V.ink2 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{z.baslik}</span>
                <span className="num" style={{ flexShrink: 0 }}>
                  {TL(z.eskiTutar)} → <span style={{ color: V.neg, fontWeight: 600 }}>{TL(z.yeniTutar)}</span> <span style={{ color: V.neg }}>(+%{z.artisPct})</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 1) Hızlı Ekle (zümrüt kart) */}
      <div style={{ background: V.emerald, borderRadius: 14, padding: "18px 20px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
          <Icon d="spark" size={18} stroke={V.accent} />
          <div className="serif" style={{ fontSize: 15, fontWeight: 600, color: V.cream }}>Hızlı Ekle</div>
          <span style={{ fontSize: 11, color: V.sage }}>
            {aiHazir() ? "Doğal dille yaz ya da fiş fotoğrafı yükle" : "AI için Ayarlar'dan anahtar gir"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <input
            value={metin}
            onChange={(e) => setMetin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && isle()}
            placeholder="Örn: bugün markete 350 lira verdim"
            style={{ flex: 1, minWidth: 180, padding: "12px 15px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 11, color: "#F4F1E9", fontSize: 13.5, fontFamily: "inherit", outline: "none" }}
          />
          <label
            title="Fiş/fatura fotoğrafı yükle"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "12px 15px", borderRadius: 11, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.05)", color: V.cream, cursor: fisOku ? "wait" : "pointer", whiteSpace: "nowrap" }}
          >
            {fisOku ? <span style={{ fontSize: 13 }}>Okunuyor…</span> : <Icon d="camera" size={18} stroke={V.cream} />}
            <input ref={fisRef} type="file" accept="image/*" capture="environment" onChange={fisYukle} disabled={fisOku} style={{ display: "none" }} />
          </label>
          <Btn variant="gold" onClick={isle} disabled={bekle} style={{ padding: "12px 22px" }}>
            {bekle ? "Ekleniyor…" : "Ekle"}
          </Btn>
        </div>
      </div>

      {/* 2) Özet kartları (tıklanınca drill-down) */}
      <div className="fa-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        {stats.map((s) =>
          s.onClick ? (
            <div key={s.label} onClick={s.onClick} className="fa-btn" style={{ cursor: "pointer" }} title="Ayrıntıyı gör">
              <Stat label={s.label} value={s.value} delta={s.delta} deltaColor={s.deltaColor} />
            </div>
          ) : (
            <Stat key={s.label} label={s.label} value={s.value} delta={s.delta} deltaColor={s.deltaColor} />
          )
        )}
      </div>

      {/* 2b) Bu ay maaş + Param nerede */}
      {(maasDurumlari.length > 0 || dagilim.length > 0) && (
        <div className="fa-grid" style={{ display: "grid", gridTemplateColumns: maasDurumlari.length && dagilim.length ? "1fr 1fr" : "1fr", gap: 14, marginBottom: 16 }}>
          {maasDurumlari.length > 0 && (
            <Card>
              <div className="serif" style={{ ...baslik, marginBottom: 12 }}>Bu Ay Maaş</div>
              {maasDurumlari.map((s) => {
                const gecti = s.odemeTarihi <= bugun();
                const renk = s.geldiMi ? V.pos : gecti ? V.accent : V.ink3;
                const metin = s.geldiMi ? "geldi" : gecti ? "beklenen (işlendi)" : `bekleniyor · her ayın ${s.odemeGunu}'i`;
                return (
                  <div key={s.maasId} style={{ padding: "9px 0", borderBottom: `1px solid ${V.line}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, color: V.ink2, display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: renk, flex: "none" }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.ad} · {metin}</span>
                      </span>
                      <span className="num" style={{ fontSize: 14, fontWeight: 700, color: V.ink, flexShrink: 0 }}>{TL(s.efektif)}</span>
                    </div>
                    {s.kalemler.length > 1 && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        {s.kalemler.map((k, i) => <span key={i} className="num" style={{ fontSize: 11, color: V.ink3, background: V.card2, border: `1px solid ${V.border}`, borderRadius: 6, padding: "2px 7px" }}>{k.etiket}: {TL(k.tutar)}</span>)}
                      </div>
                    )}
                  </div>
                );
              })}
              <div onClick={() => onGit && onGit("planlama")} style={{ fontSize: 11.5, color: V.accent, cursor: "pointer", marginTop: 10 }}>Maaş ayarları →</div>
            </Card>
          )}
          {dagilim.length > 0 && (
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div className="serif" style={baslik}>Param Nerede</div>
                <span onClick={() => onGit && onGit("hesap")} style={{ fontSize: 11, color: V.accent, cursor: "pointer" }}>Hesaplar →</span>
              </div>
              <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", marginBottom: 12, background: V.track }}>
                {dagilim.map((x, i) => <div key={i} style={{ width: `${(x.tutar / dagilimToplam) * 100}%`, background: x.renk }} title={`${x.ad} ${TL(x.tutar)}`} />)}
              </div>
              {dagilim.map((x, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, color: V.ink2, padding: "5px 0" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: x.renk }} />{x.ad}</span>
                  <span className="num" style={{ color: V.ink }}>{TL(x.tutar)}</span>
                </div>
              ))}
              {kartBorc > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, color: V.neg, padding: "8px 0 0", marginTop: 4, borderTop: `1px solid ${V.line}` }}>
                  <span>Kart borcu</span><span className="num">−{TL(kartBorc)}</span>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* 3) Net varlık gelişimi + harcama dağılımı */}
      <div className="fa-grid" style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 14, marginBottom: 16 }}>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="serif" style={baslik}>Net Varlık Gelişimi</div>
            <div style={{ fontSize: 11, color: V.ink3 }}>{netGecmis.length >= 2 ? `son ${netGecmis.length} kayıt` : ""}</div>
          </div>
          {alanLine ? (
            <svg width="100%" height="180" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
              <defs>
                <linearGradient id="gMain" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={V.emerald2} stopOpacity="0.18" />
                  <stop offset="1" stopColor={V.emerald2} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={alanFill} fill="url(#gMain)" />
              <path className="fa-area" style={{ "--len": 760 }} d={alanLine} fill="none" stroke={V.emerald2} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {sonNokta && <circle cx={sonNokta[0]} cy={sonNokta[1]} r="4.5" fill={V.accent} />}
            </svg>
          ) : (
            <div style={{ height: 180, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <div style={{ width: "100%", height: 1, background: V.line }} />
              <div style={{ fontSize: 13, color: V.ink3, textAlign: "center", paddingTop: 12 }}>Net varlık geçmişi biriktikçe burada görünecek.</div>
            </div>
          )}
        </Card>

        <Card>
          <div className="serif" style={{ ...baslik, marginBottom: 16 }}>Harcama Dağılımı</div>
          {donutSegments.length ? (
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <svg width="112" height="112" viewBox="0 0 42 42" style={{ flex: "none" }}>
                <circle cx="21" cy="21" r="15.9" fill="none" stroke={V.track} strokeWidth="6" />
                {donutSegments.map((d, i) => (
                  <circle key={i} cx="21" cy="21" r="15.9" fill="none" stroke={d.color} strokeWidth="6" strokeDasharray={d.dash} strokeDashoffset={d.offset} transform="rotate(-90 21 21)" style={{ transition: "stroke-dasharray .8s cubic-bezier(.4,0,.2,1)" }} />
                ))}
              </svg>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
                {donutSegments.map((d, i) => {
                  const top5Cats = new Set(top5.map(([c]) => c));
                  const kayitlar = d.cat === "Diğer" ? (fd.giderler || []).filter((g) => !top5Cats.has(g.kategori)) : (fd.giderler || []).filter((g) => g.kategori === d.cat);
                  return (
                    <div key={i} onClick={() => drillAc("Gider · " + d.cat, kayitlar, "gider")} className="fa-btn" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: V.ink2, cursor: "pointer", padding: "1px 0" }} title="İşlemleri gör">
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color, flex: "none" }} />
                      {d.cat}
                      <Para tutar={d.amt} tarih={refTarih} enflasyon={enf} renk={V.ink} style={{ marginLeft: "auto", fontWeight: 500 }} />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <Bos mesaj="Bu dönemde gider yok." icon="wallet" />
          )}
        </Card>
      </div>

      {/* 4) Yaklaşan ödemeler + bütçe durumu */}
      <div className="fa-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card>
          <div className="serif" style={{ ...baslik, marginBottom: 14 }}>Yaklaşan Ödemeler</div>
          {yaklasan.length ? (
            yaklasan.map((p, i) => {
              const tagRenk = p.tip === "Abonelik" ? V.accent : p.tip === "Kart" ? V.neg : V.pos;
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < yaklasan.length - 1 ? `1px solid ${V.line}` : "none" }}>
                  <span style={{ fontSize: 13, color: V.ink2 }}>
                    {p.ad}{" "}
                    <span style={{ background: "var(--chip-gold)", border: `1px solid ${tagRenk}55`, color: tagRenk, fontSize: 10, padding: "1px 6px", borderRadius: 6, fontWeight: 700, marginLeft: 4 }}>
                      {p.gun === 0 ? "BUGÜN" : `${p.gun} gün`}
                    </span>
                  </span>
                  <span className="num" style={{ fontSize: 13, fontWeight: 600, color: V.ink }}>{TL(p.miktar)}</span>
                </div>
              );
            })
          ) : (
            <div style={{ fontSize: 13, color: V.ink3, padding: "10px 0" }}>Önümüzdeki 7 günde ödeme yok.</div>
          )}
        </Card>

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div className="serif" style={baslik}>Bütçe Durumu</div>
            <span onClick={() => onGit && onGit("butceler")} style={{ fontSize: 11, color: V.accent, cursor: "pointer" }}>Tümü</span>
          </div>
          {butceler.length ? (
            butceler.map((b) => {
              const renk = b.pct >= 100 ? V.neg : b.pct >= 85 ? V.accent : V.pos;
              return (
                <div key={b.cat} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
                    <span style={{ color: V.ink2 }}>
                      {b.cat}
                      {b.pct >= 100 && <span style={{ background: "var(--chip-red)", color: V.neg, fontSize: 10, padding: "1px 6px", borderRadius: 6, fontWeight: 700, marginLeft: 6 }}>AŞILDI</span>}
                    </span>
                    <span className="num" style={{ color: V.ink }}>{TL(b.harcanan)} / {TL(b.limit)}</span>
                  </div>
                  <ProgressBar value={b.harcanan} max={b.limit} color={renk} height={7} />
                </div>
              );
            })
          ) : (
            <div style={{ padding: "6px 0" }}>
              <div style={{ fontSize: 13, color: V.ink3, marginBottom: 10 }}>Bütçe tanımlanmamış. Geçmiş harcamandan otomatik başlangıç limitleri önereyim mi?</div>
              <Btn variant="soft" onClick={butceOner} style={{ width: "100%" }}>Otomatik bütçe öner</Btn>
            </div>
          )}
        </Card>
      </div>

      {/* 5) Taksit takibi — yalnızca aktif (gelecek) taksit varsa */}
      {taksitler.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <div className="serif" style={baslik}>Taksit Takibi</div>
            <div style={{ fontSize: 12, color: V.ink3 }}>
              Kalan borç <span className="num" style={{ color: V.neg, fontWeight: 600 }}>{TL(kalanBorc)}</span>
            </div>
          </div>
          {taksitYuku.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {taksitYuku.map((y) => (
                <div key={y.ay} style={{ flex: 1, minWidth: 72, background: V.card2, border: `1px solid ${V.border}`, borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: 11, color: V.ink3 }}>{kisaAy(y.ay)}</div>
                  <div className="num" style={{ fontSize: 13.5, fontWeight: 600, color: V.ink, marginTop: 2 }}>{TL(y.tutar)}</div>
                </div>
              ))}
            </div>
          )}
          {taksitler.slice(0, 5).map((t, i) => {
            const n = Math.min(taksitler.length, 5);
            return (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < n - 1 ? `1px solid ${V.line}` : "none" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: V.ink2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.baslik}</div>
                  <div style={{ fontSize: 11, color: V.ink3, marginTop: 1 }}>{t.sonrakiNo}/{t.toplamTaksit} · {t.kalan} taksit kaldı · sonraki {kisaTarih(t.sonrakiTarih)}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div className="num" style={{ fontSize: 13, fontWeight: 600, color: V.ink }}>{TL(t.aylikTutar)}<span style={{ fontSize: 11, color: V.ink3, fontWeight: 400 }}>/ay</span></div>
                  <div className="num" style={{ fontSize: 11, color: V.ink3 }}>kalan {TL(t.kalanTutar)}</div>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* 6) Nakit akış projeksiyonu — gelecek olay varsa */}
      {projeksiyon.olaySayisi > 0 && (
        <Card style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <div className="serif" style={baslik}>Nakit Akış Projeksiyonu</div>
            <div style={{ fontSize: 11, color: V.ink3 }}>45 gün</div>
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: (projeksiyon.ilkEksi || projeksiyon.baslangic <= 0) ? 12 : 0, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 100 }}>
              <div style={{ fontSize: 11, color: V.ink3 }}>Bugün likit</div>
              <div className="num" style={{ fontSize: 18, fontWeight: 600, color: V.ink, marginTop: 2 }}>{TL(projeksiyon.baslangic)}</div>
            </div>
            <div style={{ fontSize: 16, color: V.ink3, alignSelf: "center" }}>→</div>
            <div style={{ flex: 1, minWidth: 100 }}>
              <div style={{ fontSize: 11, color: V.ink3 }}>45 gün sonra</div>
              <div className="num" style={{ fontSize: 18, fontWeight: 600, color: projeksiyon.bitis < 0 ? V.neg : V.pos, marginTop: 2 }}>{TL(projeksiyon.bitis)}</div>
            </div>
            <div style={{ flex: 1, minWidth: 120, textAlign: "right" }}>
              <div style={{ fontSize: 11, color: V.ink3 }}>Dönem gider / gelir</div>
              <div className="num" style={{ fontSize: 12.5, marginTop: 4, color: V.ink2 }}>−{TL(projeksiyon.toplamGider)} / +{TL(projeksiyon.toplamGelir)}</div>
            </div>
          </div>
          {projeksiyon.ilkEksi && (
            <div style={{ background: "var(--chip-red)", border: `1px solid ${V.neg}44`, borderRadius: 8, padding: "9px 12px", fontSize: 12.5, color: V.neg }}>
              ⚠ {kisaTarih(projeksiyon.ilkEksi.tarih)} — bakiye eksiye düşüyor: <span className="num" style={{ fontWeight: 600 }}>{TL(projeksiyon.ilkEksi.bakiye)}</span>
            </div>
          )}
          {projeksiyon.baslangic <= 0 && (
            <div style={{ fontSize: 11.5, color: V.ink3, marginTop: projeksiyon.ilkEksi ? 8 : 0 }}>
              Likit hesap bakiyen 0 görünüyor — Hesaplar'dan güncel bakiyeni girersen projeksiyon anlamlı olur.
            </div>
          )}
        </Card>
      )}

      {/* Drill-down: bir özet rakamının altındaki işlemler */}
      {drill && (
        <Modal title={drill.baslik} maxWidth={480} onClose={() => setDrill(null)}>
          {!drill.kayitlar.length ? (
            <Bos mesaj="Bu dönemde kayıt yok." icon="doc" />
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: V.ink3, marginBottom: 10 }}>
                <span>{drill.kayitlar.length} işlem</span>
                <span className="num">Toplam {TL(drill.kayitlar.reduce((s, k) => s + (+k.miktar || 0), 0))}</span>
              </div>
              <div style={{ maxHeight: "55vh", overflowY: "auto" }}>
                {drill.kayitlar.map((k, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${V.line}` }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: V.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.baslik || "İşlem"}</div>
                      <div style={{ fontSize: 11, color: V.ink3 }}>{k.tarih}{k.kategori ? " · " + k.kategori : ""}{k.beklenenMi ? " · beklenen" : ""}{k.kaynak === "maas" ? " · maaş" : ""}</div>
                    </div>
                    <div className="num" style={{ fontSize: 13, fontWeight: 600, color: drill.tip === "gelir" ? V.pos : V.neg, flexShrink: 0 }}>{drill.tip === "gelir" ? "+" : "−"}{TL(k.miktar)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Fiş önizleme/onay — eklemeden önce tutar/tarih/kategoriyi düzelt */}
      {fisOnay && (
        <Modal title="Fişi Onayla" maxWidth={400} onClose={() => setFisOnay(null)}>
          <p style={{ margin: "0 0 14px", fontSize: 12.5, color: V.ink3, lineHeight: 1.5 }}>Fiş okundu. Eklemeden önce kontrol et — özellikle <b style={{ color: V.ink2 }}>tarih</b> doğru mu?</p>
          <Field label="Başlık / Mağaza" value={fisOnay.baslik} onChange={(v) => setFisOnay((f) => ({ ...f, baslik: v }))} placeholder="Örn: Migros" />
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><Field label="Tutar (₺)" value={fisOnay.miktar} onChange={(v) => setFisOnay((f) => ({ ...f, miktar: v }))} mono /></div>
            <div style={{ flex: 1 }}><Field label="Tarih" type="date" value={fisOnay.tarih} onChange={(v) => setFisOnay((f) => ({ ...f, tarih: v }))} /></div>
          </div>
          <Field label="Kategori" value={fisOnay.kategori} onChange={(v) => setFisOnay((f) => ({ ...f, kategori: v }))} options={giderKategorileri(findata)} />
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <Btn variant="ghost" onClick={() => setFisOnay(null)} style={{ padding: 13 }}>İptal</Btn>
            <Btn variant="primary" onClick={fisOnayla} style={{ flex: 1, padding: 13 }}>Gider Olarak Ekle</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
