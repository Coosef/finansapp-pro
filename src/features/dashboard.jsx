// ============================================================
// Panel (dashboard) — Zümrüt & Altın tasarımı
// Hızlı Ekle (doğal dil + fiş fotoğrafı) + özet kartları,
// net varlık grafiği, harcama dağılımı, yaklaşan ödemeler, bütçe
// ============================================================
import { useRef, useState } from "react";
import { V, PALET, GIDER_KAT } from "../lib/constants.js";
import { TL, bugun, buAy, kategoriAnahtar, parseJSON, fileToBase64 } from "../lib/format.js";
import { claudeCall, aiHazir } from "../lib/ai.js";
import { yaklasanOdemeler, etkinButce } from "../lib/finance.js";
import { Card, Btn, Stat, ProgressBar, Bos } from "../components/ui.jsx";
import { Icon } from "../components/icons.jsx";

function aiHata(e) {
  return e?.name === "AIAnahtarYok" ? e.message : null;
}

const baslik = { fontSize: 16, fontWeight: 600, color: V.ink };

export function Panel({
  findata, fd, donem, donemAdi, setFindata, bildir,
  toplamGelir, toplamGider, toplamAbonelik, nakit, netDeger,
  yatirimDeger, yatirimKar, guncelDeger, onHizliEkle, kategoriOgren, onGit,
}) {
  const [metin, setMetin] = useState("");
  const [bekle, setBekle] = useState(false);
  const [fisOku, setFisOku] = useState(false);
  const fisRef = useRef(null);

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
      onHizliEkle(tip, { baslik: j.baslik, miktar: Math.abs(parseFloat(j.miktar) || 0), kategori, tarih: j.tarih || bugun(), hesapId: "" });
      kategoriOgren(j.baslik, kategori);
      bildir(`${tip === "gelir" ? "Gelir" : "Gider"} eklendi: ${j.baslik} ${TL(j.miktar)}`);
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
      const kategori = j.kategori || "Market";
      const miktar = Math.abs(parseFloat(j.toplam) || 0);
      onHizliEkle("gider", { baslik: adi, miktar, kategori, tarih: j.tarih || bugun(), hesapId: "" });
      kategoriOgren(adi, kategori);
      bildir(`Fişten gider eklendi: ${adi} ${TL(miktar)}`);
    } catch (err) {
      bildir(aiHata(err) || "Fiş okunamadı", "err");
    } finally {
      setFisOku(false);
      if (fisRef.current) fisRef.current.value = "";
    }
  }

  // ---- Özet figürleri ----
  const giderToplam = toplamGider + toplamAbonelik;
  const tasarrufOrani = toplamGelir > 0 ? Math.round(((toplamGelir - giderToplam) / toplamGelir) * 100) : 0;
  const nakitRenk = nakit >= 0 ? V.pos : V.neg;

  const stats = [
    { label: "Toplam Gelir", value: TL(toplamGelir), delta: donemAdi, deltaColor: V.ink3 },
    { label: "Toplam Gider", value: TL(giderToplam), delta: `Abonelik dahil`, deltaColor: V.ink3 },
    { label: "Net Nakit", value: TL(nakit), delta: `Tasarruf %${tasarrufOrani}`, deltaColor: nakitRenk },
    { label: "Net Varlık", value: TL(netDeger), delta: `Yatırım ${TL(yatirimDeger)}`, deltaColor: V.ink3 },
  ];

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

  // ---- Harcama dağılımı (donut) ----
  const katToplam = {};
  (fd.giderler || []).forEach((g) => { katToplam[g.kategori] = (katToplam[g.kategori] || 0) + g.miktar; });
  const katSirali = Object.entries(katToplam).sort((a, b) => b[1] - a[1]);
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
  const yaklasan = yaklasanOdemeler(findata, bugun(), 7).slice(0, 5);

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

  return (
    <div>
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

      {/* 2) Özet kartları */}
      <div className="fa-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        {stats.map((s) => (
          <Stat key={s.label} label={s.label} value={s.value} delta={s.delta} deltaColor={s.deltaColor} />
        ))}
      </div>

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
                {donutSegments.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: V.ink2 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color, flex: "none" }} />
                    {d.cat}
                    <span className="num" style={{ marginLeft: "auto", color: V.ink, fontWeight: 500 }}>{TL(d.amt)}</span>
                  </div>
                ))}
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
              const tagRenk = p.tip === "Abonelik" ? V.accent : V.pos;
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
            <div style={{ fontSize: 13, color: V.ink3, padding: "10px 0" }}>Bütçe tanımlanmamış. Ayarlar'dan kategori limiti ekleyin.</div>
          )}
        </Card>
      </div>
    </div>
  );
}
