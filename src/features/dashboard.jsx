// ============================================================
// Panel (dashboard) + Hızlı Ekle + alt kartlar
// ============================================================
import { useState } from "react";
import { C, sectionTitle, tagStyle, inputStyle, GIDER_KAT } from "../lib/constants.js";
import { TL, bugun, buAy, aylikEsdeger, sonrakiTarih, kategoriAnahtar, parseJSON } from "../lib/format.js";
import { claudeCall, aiHazir } from "../lib/ai.js";
import { yaklasanOdemeler, etkinButce } from "../lib/finance.js";
import { Card, Btn, Stat, ProgressBar } from "../components/ui.jsx";
import { Sparkline, BarChart } from "../components/charts.jsx";

function aiHata(e) {
  return e?.name === "AIAnahtarYok" ? e.message : null;
}

export function HizliEkle({ findata, ekle, kategoriOgren, bildir }) {
  const [metin, setMetin] = useState("");
  const [bekle, setBekle] = useState(false);
  const [dinliyor, setDinliyor] = useState(false);
  const sesVar = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  function dinle() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = "tr-TR";
    r.interimResults = false;
    r.onresult = (e) => {
      setMetin(e.results[0][0].transcript);
      setDinliyor(false);
    };
    r.onerror = () => setDinliyor(false);
    r.onend = () => setDinliyor(false);
    setDinliyor(true);
    try {
      r.start();
    } catch {
      setDinliyor(false);
    }
  }
  async function isle() {
    if (!metin.trim()) return;
    setBekle(true);
    try {
      const txt = await claudeCall([
        { role: "user", content: `Kullanıcı bir finansal işlem yazdı: "${metin}". Bugün ${bugun()}. SADECE şu JSON: {"tip":"gelir|gider","baslik":"kısa açıklama","miktar":sayı,"kategori":"${GIDER_KAT.join("|")}|Maaş|Ek Gelir","tarih":"YYYY-MM-DD"}. Tarih belirtilmemişse bugünü kullan.` },
      ]);
      const j = parseJSON(txt);
      const tip = j.tip === "gelir" ? "gelir" : "gider";
      const k = kategoriAnahtar(j.baslik);
      const hatirla = (findata.kategoriHafiza || {})[k];
      ekle(tip, { baslik: j.baslik, miktar: Math.abs(parseFloat(j.miktar) || 0), kategori: hatirla || j.kategori || (tip === "gelir" ? "Ek Gelir" : "Diğer"), tarih: j.tarih || bugun() });
      kategoriOgren(j.baslik, hatirla || j.kategori);
      bildir(`${tip === "gelir" ? "Gelir" : "Gider"} eklendi: ${j.baslik} ${TL(j.miktar)}`);
      setMetin("");
    } catch (e) {
      bildir(aiHata(e) || "Anlaşılamadı, tekrar dener misin?", "err");
    } finally {
      setBekle(false);
    }
  }
  return (
    <Card style={{ marginBottom: "1rem" }} accent={C.cyan}>
      <h3 style={{ ...sectionTitle, margin: "0 0 0.75rem" }}>⚡ Hızlı Ekle</h3>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input value={metin} onChange={(e) => setMetin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && isle()} placeholder='Örn: "Bugün markete 350 lira verdim"' style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
        {sesVar && <Btn variant="ghost" onClick={dinle} disabled={dinliyor} style={{ padding: "0.6rem 0.8rem" }}>{dinliyor ? "🎙️…" : "🎤"}</Btn>}
        <Btn onClick={isle} disabled={bekle}>{bekle ? "…" : "Ekle"}</Btn>
      </div>
      <p style={{ color: C.faint, fontSize: "0.72rem", margin: "0.6rem 0 0" }}>
        Doğal dille yaz, AI tutar/kategori/tarihi çıkarıp kaydeder. {sesVar ? "Mikrofonla sesli de girebilirsin." : ""}
        {!aiHazir() && <span style={{ color: C.amber }}> (AI için Ayarlar'dan anahtar gir)</span>}
      </p>
    </Card>
  );
}

export function Panel({ findata, ekle, kategoriOgren, guncelDeger, toplamGelir, toplamGider, toplamAbonelik, yatirimDeger, yatirimKar, yatirimMaliyet, nakit, netDeger, bildir }) {
  const [icgoru, setIcgoru] = useState(null);
  const [icYukleniyor, setIcYukleniyor] = useState(false);
  const aylik = {};
  findata.gelirler.forEach((g) => {
    const a = (g.tarih || "").slice(0, 7);
    if (a) {
      aylik[a] = aylik[a] || { gelir: 0, gider: 0 };
      aylik[a].gelir += g.miktar;
    }
  });
  findata.giderler.forEach((g) => {
    const a = (g.tarih || "").slice(0, 7);
    if (a) {
      aylik[a] = aylik[a] || { gelir: 0, gider: 0 };
      aylik[a].gider += g.miktar;
    }
  });
  const barData = Object.keys(aylik).sort().slice(-6).map((a) => ({ ay: a.slice(5) + "/" + a.slice(2, 4), ...aylik[a] }));
  const tarihSet = {};
  findata.yatirimlar.forEach((y) => (y.gecmis || []).forEach((p) => { tarihSet[p.tarih] = true; }));
  const portfoyGecmis = Object.keys(tarihSet).sort().map((t) => ({ tarih: t, deger: findata.yatirimlar.reduce((s, y) => { const g = (y.gecmis || []).filter((p) => p.tarih <= t).pop(); return s + (g ? g.deger : 0); }, 0) }));
  const karYuzde = yatirimMaliyet ? (yatirimKar / yatirimMaliyet) * 100 : 0;
  const ay = buAy();
  const ayGider = {};
  findata.giderler.filter((g) => (g.tarih || "").startsWith(ay)).forEach((g) => { ayGider[g.kategori] = (ayGider[g.kategori] || 0) + g.miktar; });
  const butceliler = Object.keys(findata.butceler || {}).filter((k) => findata.butceler[k] > 0);

  const aylikGelirTekrar = (findata.sablonlar || []).filter((s) => s.tip === "gelir").reduce((s, x) => s + aylikEsdeger(x.miktar, x.frekans), 0);
  const aylikGiderTekrar = (findata.sablonlar || []).filter((s) => s.tip === "gider").reduce((s, x) => s + aylikEsdeger(x.miktar, x.frekans), 0);
  const aylikNet = aylikGelirTekrar - aylikGiderTekrar - toplamAbonelik;
  const tahmin = [];
  let bak = nakit;
  for (let i = 1; i <= 6; i++) {
    bak += aylikNet;
    tahmin.push({ deger: bak, ay: i });
  }
  const negatifAy = tahmin.find((t) => t.deger < 0);

  const oncekiAylar = {};
  findata.giderler.forEach((g) => {
    const a = (g.tarih || "").slice(0, 7);
    if (a && a < ay) {
      oncekiAylar[a] = oncekiAylar[a] || {};
      oncekiAylar[a][g.kategori] = (oncekiAylar[a][g.kategori] || 0) + g.miktar;
    }
  });
  const aySayisi = Object.keys(oncekiAylar).length || 1;
  const ortKategori = {};
  Object.values(oncekiAylar).forEach((m) => Object.entries(m).forEach(([k, v]) => { ortKategori[k] = (ortKategori[k] || 0) + v; }));
  Object.keys(ortKategori).forEach((k) => { ortKategori[k] /= aySayisi; });
  const anomaliler = Object.entries(ayGider).filter(([k, v]) => ortKategori[k] && v > ortKategori[k] * 1.5).map(([k, v]) => ({ kategori: k, simdi: v, ort: ortKategori[k], kat: (v / ortKategori[k]).toFixed(1) }));

  const yaklasan = yaklasanOdemeler(findata, bugun(), 7);

  async function icgoruOlustur() {
    setIcYukleniyor(true);
    try {
      const ozet = { toplamGelir, toplamGider, toplamAbonelik, yatirimDeger, yatirimKar: Math.round(yatirimKar), netDeger: Math.round(netDeger), buAyGider: ayGider, aylikTrend: barData, butceler: findata.butceler, tahminiAylikNet: Math.round(aylikNet) };
      const txt = await claudeCall([{ role: "user", content: `Kişisel finans asistanısın. Türk kullanıcının verisine göre kısa, eyleme dönük 4-5 içgörü üret. Para TL. SADECE JSON: {"ozet":"tek cümle","maddeler":["...","..."]}\n\nVeri: ${JSON.stringify(ozet)}` }]);
      setIcgoru(parseJSON(txt));
    } catch (e) {
      bildir(aiHata(e) || "İçgörü oluşturulamadı", "err");
    } finally {
      setIcYukleniyor(false);
    }
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
          {aylikNet === 0 && !findata.sablonlar?.length ? (
            <p style={{ color: C.faint, fontSize: "0.82rem" }}>Tahmin için tekrarlayan gelir/gider ekleyin.</p>
          ) : (
            <>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: C.dim }}>Tahmini aylık net: <b style={{ color: aylikNet >= 0 ? C.greenL : C.redL }}>{aylikNet >= 0 ? "+" : ""}{TL(aylikNet)}</b></p>
              <Sparkline points={tahmin} color={negatifAy ? C.red : C.greenL} height={70} width={280} />
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: C.dimmer }}>{negatifAy ? <span style={{ color: C.redL }}>⚠️ ~{negatifAy.ay} ay sonra bakiye negatife düşebilir ({TL(negatifAy.deger)})</span> : `6 ay sonra tahmini: ${TL(tahmin[5].deger)}`}</p>
            </>
          )}
        </Card>
        <Card accent={C.amber}>
          <h3 style={sectionTitle}>🔔 Yaklaşan Ödemeler (7 gün)</h3>
          {!yaklasan.length ? (
            <p style={{ color: C.faint, fontSize: "0.82rem" }}>Önümüzdeki 7 günde ödeme yok.</p>
          ) : (
            yaklasan.slice(0, 5).map((y, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.45rem 0", borderBottom: i < Math.min(yaklasan.length, 5) - 1 ? `1px solid ${C.line}` : "none" }}>
                <span style={{ fontSize: "0.83rem", color: C.dim }}>{y.ad} <span style={tagStyle(y.tip === "Abonelik" ? C.amber : C.cyan)}>{y.gun === 0 ? "BUGÜN" : y.gun + " gün"}</span></span>
                <span style={{ fontSize: "0.83rem", fontWeight: 600 }}>{TL(y.miktar)}</span>
              </div>
            ))
          )}
        </Card>
      </div>

      {anomaliler.length > 0 && (
        <Card style={{ marginBottom: "1rem" }} accent={C.red}>
          <h3 style={sectionTitle}>🚨 Olağandışı Harcamalar (bu ay)</h3>
          {anomaliler.map((a) => (
            <div key={a.kategori} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: `1px solid ${C.line}` }}>
              <span style={{ fontSize: "0.85rem", color: C.dim }}>{a.kategori} <span style={tagStyle(C.red)}>{a.kat}× ORTALAMA</span></span>
              <span style={{ fontSize: "0.82rem" }}><b style={{ color: C.redL }}>{TL(a.simdi)}</b> <span style={{ color: C.faint }}>(ort. {TL(a.ort)})</span></span>
            </div>
          ))}
        </Card>
      )}

      <Card style={{ marginBottom: "1rem" }} accent={C.cyan}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: icgoru ? "1rem" : 0, flexWrap: "wrap", gap: "0.5rem" }}>
          <h3 style={{ ...sectionTitle, margin: 0 }}>✨ Akıllı İçgörüler</h3>
          <Btn variant="ghost" onClick={icgoruOlustur} disabled={icYukleniyor}>{icYukleniyor ? "Analiz ediliyor…" : "İçgörü Oluştur"}</Btn>
        </div>
        {icgoru && (
          <div>
            <p style={{ color: C.text, fontSize: "0.92rem", margin: "0 0 0.85rem", lineHeight: 1.5 }}>{icgoru.ozet}</p>
            {(icgoru.maddeler || []).map((m, i) => (
              <div key={i} style={{ display: "flex", gap: "0.6rem", marginBottom: "0.5rem", alignItems: "flex-start" }}>
                <span style={{ color: C.cyan, flexShrink: 0 }}>▸</span>
                <span style={{ color: C.dim, fontSize: "0.85rem", lineHeight: 1.45 }}>{m}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: "1rem" }}>
        <h3 style={sectionTitle}>Aylık Gelir / Gider</h3>
        <BarChart data={barData} />
        <div style={{ display: "flex", gap: "1rem", marginTop: "0.75rem", fontSize: "0.75rem" }}>
          <span style={{ color: C.greenL }}>● Gelir</span>
          <span style={{ color: C.redL }}>● Gider</span>
        </div>
      </Card>

      {butceliler.length > 0 && (
        <Card style={{ marginBottom: "1rem" }}>
          <h3 style={sectionTitle}>Bu Ay Bütçe Durumu ({ay})</h3>
          {butceliler.map((k) => {
            const h = ayGider[k] || 0,
              l = etkinButce(findata, k, ay),
              pct = l > 0 ? (h / l) * 100 : 0;
            return (
              <div key={k} style={{ marginBottom: "0.85rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem", fontSize: "0.82rem" }}>
                  <span style={{ color: C.dim }}>{k} {pct >= 100 && <span style={tagStyle(C.red)}>AŞILDI</span>}</span>
                  <span style={{ color: C.text, fontWeight: 600 }}>{TL(h)} / {TL(l)}</span>
                </div>
                <ProgressBar value={h} max={l} />
              </div>
            );
          })}
        </Card>
      )}

    </div>
  );
}

export function AcilFon({ nakit, toplamGider, toplamAbonelik, aylik }) {
  const ayCount = Math.max(1, Object.keys(aylik || {}).length);
  const aylikOrt = toplamGider / ayCount + toplamAbonelik;
  const ay = aylikOrt > 0 ? nakit / aylikOrt : 0;
  const seviye = ay >= 6 ? { r: C.green, t: "Çok güvende" } : ay >= 3 ? { r: C.amber, t: "İyi durumda" } : ay >= 1 ? { r: "#F97316", t: "Zayıf" } : { r: C.red, t: "Riskli" };
  return (
    <Card accent={seviye.r}>
      <h3 style={sectionTitle}>🛟 Acil Fon Kapsamı</h3>
      {aylikOrt <= 0 ? (
        <p style={{ color: C.faint, fontSize: "0.82rem" }}>Gider verisi biriktikçe hesaplanır.</p>
      ) : (
        <>
          <p style={{ margin: "0 0 0.25rem", fontSize: "1.8rem", fontWeight: 700, color: seviye.r }}>{ay.toFixed(1)} ay</p>
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.8rem", color: C.dim }}>{seviye.t} — nakitin ~{ay.toFixed(1)} aylık gideri karşılıyor</p>
          <ProgressBar value={Math.min(ay, 6)} max={6} color={seviye.r} />
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.72rem", color: C.faint }}>Önerilen: 3-6 ay · aylık ort. gider {TL(aylikOrt)}</p>
        </>
      )}
    </Card>
  );
}

export function NetVarlikGecmisKart({ findata, portfoyGecmis }) {
  const aylar = new Set();
  [...findata.gelirler, ...findata.giderler].forEach((t) => {
    const a = (t.tarih || "").slice(0, 7);
    if (a) aylar.add(a);
  });
  const sirali = [...aylar].sort();
  const seri = sirali.map((a) => {
    const sonGun = a + "-31";
    const gel = findata.gelirler.filter((g) => (g.tarih || "") <= sonGun).reduce((s, g) => s + g.miktar, 0);
    const gid = findata.giderler.filter((g) => (g.tarih || "") <= sonGun).reduce((s, g) => s + g.miktar, 0);
    const inv = (portfoyGecmis || []).filter((p) => p.tarih <= sonGun).pop();
    return { deger: gel - gid + (inv ? inv.deger : 0), tarih: a };
  });
  return (
    <Card accent={C.purple}>
      <h3 style={sectionTitle}>📈 Net Varlık (zaman içinde)</h3>
      {seri.length < 2 ? (
        <p style={{ color: C.faint, fontSize: "0.82rem" }}>En az iki aylık veri gerekiyor.</p>
      ) : (
        <>
          <Sparkline points={seri} color={C.purple} height={90} width={300} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem", fontSize: "0.72rem", color: C.faint }}>
            <span>{seri[0].tarih}: {TL(seri[0].deger)}</span>
            <span style={{ color: C.dim }}>{seri[seri.length - 1].tarih}: {TL(seri[seri.length - 1].deger)}</span>
          </div>
        </>
      )}
    </Card>
  );
}
