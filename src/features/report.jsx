// ============================================================
// Rapor & Yedek: CSV, PDF (HTML), JSON yedek/geri yükle, AI rapor
// Zümrüt & Altın — açık/koyu tema
// ============================================================
import { useState, useRef } from "react";
import { V, F, SERIF } from "../lib/constants.js";
import { TL, buAy, bugun } from "../lib/format.js";
import { bosVeri } from "../lib/finance.js";
import { aylikKarne, runwayAy } from "../lib/karne.js";
import { claudeCall, aiHazir } from "../lib/ai.js";
import { Card, Btn, SubNav } from "../components/ui.jsx";
import { Icon } from "../components/icons.jsx";
import { IceAktar } from "./importing.jsx";

// Veri sekmesi: İçe Aktar + Rapor & Yedek (alt sekmeli)
export function Veri(props) {
  const [alt, setAlt] = useState("ice");
  return (
    <div>
      <h2 className="serif" style={{ margin: "0 0 0.85rem", fontSize: "1.2rem", fontWeight: 600, fontFamily: SERIF, color: V.ink }}>Veri</h2>
      <SubNav value={alt} onChange={setAlt} items={[{ id: "ice", label: "İçe Aktar" }, { id: "rapor", label: "Rapor & Yedek" }]} />
      {alt === "ice" && <IceAktar findata={props.findata} setFindata={props.setFindata} bildir={props.bildir} ekle={props.ekle} kategoriOgren={props.kategoriOgren} />}
      {alt === "rapor" && <Rapor {...props} />}
    </div>
  );
}

export function Rapor({ findata, setFindata, user, bildir, toplamGelir, toplamGider, toplamAbonelik, yatirimDeger, yatirimKar, netDeger }) {
  const [rapor, setRapor] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const geriRef = useRef();

  const karne = aylikKarne(findata, buAy());
  const runway = runwayAy(findata, bugun());
  const notRenk = (n) => ({ A: V.pos, B: V.pos, C: V.accent, D: V.accent, F: V.neg }[n] || V.ink3);

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
    indir(JSON.stringify(findata, null, 2), `finansapp-yedek-${user.username}-${bugun()}.json`, "application/json");
  }
  function csvAktar() {
    const s = [["Tip", "Başlık", "Kategori", "Tarih", "Tutar", "Kaynak"]];
    findata.gelirler.forEach((g) => s.push(["Gelir", g.baslik, g.kategori, g.tarih, g.miktar, g.kaynak || "manuel"]));
    findata.giderler.forEach((g) => s.push(["Gider", g.baslik, g.kategori, g.tarih, g.miktar, g.kaynak || "manuel"]));
    findata.abonelikler.forEach((a) => s.push(["Abonelik", a.baslik, a.kategori, a.tarih, a.miktar, "manuel"]));
    const csv = "﻿" + s.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    indir(csv, `finansapp-islemler-${bugun()}.csv`, "text/csv;charset=utf-8");
  }
  function pdfRapor() {
    const ay = buAy();
    const ayGider = {};
    findata.giderler.filter((g) => (g.tarih || "").startsWith(ay)).forEach((g) => { ayGider[g.kategori] = (ayGider[g.kategori] || 0) + g.miktar; });
    const katSatir = Object.entries(ayGider).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right">${TL(v)}</td></tr>`).join("");
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Finans Raporu</title><style>body{font-family:system-ui,Arial,sans-serif;max-width:720px;margin:40px auto;color:#1a1a1a;padding:0 20px}h1{color:#1D5240}.kart{display:inline-block;border:1px solid #ddd;border-radius:10px;padding:14px 18px;margin:6px 8px 6px 0}.kart b{display:block;font-size:1.3rem}table{width:100%;border-collapse:collapse;margin-top:10px}td,th{padding:8px;border-bottom:1px solid #eee;font-size:0.9rem}@media print{.no-print{display:none}}</style></head><body><h1>₺ FinansApp — Aylık Rapor</h1><p>${user.ad} · ${bugun()}</p><div><div class="kart">Net Varlık<b>${TL(netDeger)}</b></div><div class="kart">Toplam Gelir<b style="color:#1E7A50">${TL(toplamGelir)}</b></div><div class="kart">Toplam Gider<b style="color:#C75D4A">${TL(toplamGider)}</b></div><div class="kart">Yatırım<b style="color:#1D5240">${TL(yatirimDeger)}</b></div></div><h3>Bu Ay Kategori Giderleri (${ay})</h3><table><tr><th style="text-align:left">Kategori</th><th style="text-align:right">Tutar</th></tr>${katSatir || '<tr><td colspan=2>Veri yok</td></tr>'}</table><button class="no-print" onclick="window.print()" style="margin-top:24px;padding:10px 18px;background:#1D5240;color:#E9D9B4;border:none;border-radius:8px;cursor:pointer">PDF olarak yazdır / kaydet</button></body></html>`;
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
  async function aiRapor() {
    setYukleniyor(true);
    try {
      const ay = buAy();
      const ayGider = {};
      findata.giderler.filter((g) => (g.tarih || "").startsWith(ay)).forEach((g) => { ayGider[g.kategori] = (ayGider[g.kategori] || 0) + g.miktar; });
      const veri = { toplamGelir, toplamGider, toplamAbonelik, yatirimDeger, yatirimKar: Math.round(yatirimKar), netDeger: Math.round(netDeger), buAyGider: ayGider, hedefler: (findata.hedefler || []).map((h) => ({ ad: h.ad, tip: h.tip })) };
      const txt = await claudeCall([{ role: "user", content: `Türk kullanıcı için kısa aylık finans raporu yaz. Düz metin, 2 paragraf + 3 öneri. TL. Veri: ${JSON.stringify(veri)}` }]);
      setRapor(txt);
    } catch (e) {
      bildir(e?.name === "AIAnahtarYok" ? e.message : "Rapor oluşturulamadı", "err");
    } finally {
      setYukleniyor(false);
    }
  }

  const sectionTitle = { margin: "0 0 0.4rem", fontSize: "0.82rem", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 };
  const enInk = "#F4F1E9"; // emerald hero üstü açık metin

  // Tema kartı — başlık, açıklama, ikon, aksiyon
  function AksiyonKart({ icon, baslik, aciklama, children }) {
    return (
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "0.4rem" }}>
          <Icon d={icon} size={16} stroke={V.accent} />
          <h3 style={{ ...sectionTitle, margin: 0 }}>{baslik}</h3>
        </div>
        <p style={{ color: V.ink3, fontSize: "0.8rem", margin: "0 0 1rem" }}>{aciklama}</p>
        {children}
      </Card>
    );
  }

  return (
    <div>
      <p style={{ color: V.ink3, fontSize: "12.5px", margin: "0 0 1.25rem" }}>Dışa aktar, yedekle, PDF rapor al veya AI'dan analiz iste.</p>

      {/* Emerald hero — net varlık */}
      <div style={{ background: V.emerald, borderRadius: 16, padding: "22px 24px", marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ fontSize: "11.5px", color: V.sage, textTransform: "uppercase", letterSpacing: "0.06em" }}>Net Varlık</div>
          <div className="num" style={{ fontSize: "32px", fontWeight: 700, color: enInk, margin: "8px 0 0", letterSpacing: "-0.02em" }}>{TL(netDeger)}</div>
        </div>
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "10.5px", color: V.sage, textTransform: "uppercase", letterSpacing: "0.06em" }}>Gelir</div>
            <div className="num" style={{ fontSize: "15px", fontWeight: 600, color: V.cream, marginTop: 4 }}>{TL(toplamGelir)}</div>
          </div>
          <div>
            <div style={{ fontSize: "10.5px", color: V.sage, textTransform: "uppercase", letterSpacing: "0.06em" }}>Gider</div>
            <div className="num" style={{ fontSize: "15px", fontWeight: 600, color: V.cream, marginTop: 4 }}>{TL(toplamGider)}</div>
          </div>
          <div>
            <div style={{ fontSize: "10.5px", color: V.sage, textTransform: "uppercase", letterSpacing: "0.06em" }}>Yatırım</div>
            <div className="num" style={{ fontSize: "15px", fontWeight: 600, color: V.cream, marginTop: 4 }}>{TL(yatirimDeger)}</div>
          </div>
        </div>
      </div>

      {/* Ay Karnesi — mevcut veriden, AI'sız */}
      <Card style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 62, height: 62, borderRadius: 16, background: notRenk(karne.not), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800, fontFamily: SERIF, flexShrink: 0 }}>{karne.not}</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="serif" style={{ fontSize: 16, fontWeight: 600, color: V.ink }}>Ay Karnesi</div>
            <div style={{ fontSize: 12.5, color: V.ink2, marginTop: 5, lineHeight: 1.6 }}>
              Tasarruf oranı <b className="num" style={{ color: karne.tasarrufOrani >= 20 ? V.pos : karne.tasarrufOrani < 0 ? V.neg : V.ink }}>{karne.tasarrufOrani == null ? "—" : `%${karne.tasarrufOrani}`}</b>
              {karne.enBuyukKategori && <> · en çok <b>{karne.enBuyukKategori.ad}</b> (%{karne.enBuyukKategori.oran})</>}
              {karne.degisimPct != null && <> · gider ay-üstü <b className="num" style={{ color: karne.degisimPct > 0 ? V.neg : V.pos }}>{karne.degisimPct > 0 ? "+" : ""}%{karne.degisimPct}</b></>}
            </div>
          </div>
          {runway && (
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 11, color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Dayanma süresi</div>
              <div className="num" style={{ fontSize: 20, fontWeight: 700, color: V.ink, marginTop: 2 }}>{runway.ay} ay</div>
              <div style={{ fontSize: 11, color: V.ink3 }}>likit ÷ aylık gider</div>
            </div>
          )}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: "12px", marginBottom: "1.25rem" }}>
        <AksiyonKart icon="doc" baslik="CSV (Excel)" aciklama="Tüm işlemleri tablo olarak indir.">
          <Btn variant="soft" onClick={csvAktar} style={{ width: "100%" }}><Icon d="download" size={15} /> CSV İndir</Btn>
        </AksiyonKart>
        <AksiyonKart icon="doc" baslik="PDF Rapor" aciklama="Formatlı rapor; açıp PDF kaydet/yazdır.">
          <Btn variant="soft" onClick={pdfRapor} style={{ width: "100%" }}><Icon d="download" size={15} /> PDF Rapor</Btn>
        </AksiyonKart>
        <AksiyonKart icon="download" baslik="JSON Yedek Al" aciklama="Tüm veriyi JSON dosyası olarak indir.">
          <Btn variant="soft" onClick={yedekAl} style={{ width: "100%" }}><Icon d="download" size={15} /> Yedek Al</Btn>
        </AksiyonKart>
        <AksiyonKart icon="upload" baslik="Yedek Yükle" aciklama="JSON yedeği geri yükle.">
          <input ref={geriRef} type="file" accept="application/json,.json" onChange={geriYukle} style={{ display: "none" }} />
          <Btn variant="soft" onClick={() => geriRef.current?.click()} style={{ width: "100%" }}><Icon d="upload" size={15} /> Yedek Seç</Btn>
        </AksiyonKart>
      </div>

      {/* AI Aylık Rapor — altın aksanlı kart */}
      <Card style={{ borderColor: V.border2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: rapor ? "1rem" : 0, flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon d="spark" size={17} stroke={V.accent} />
            <h3 style={{ ...sectionTitle, margin: 0 }}>AI Aylık Rapor</h3>
          </div>
          <Btn variant="gold" onClick={aiRapor} disabled={yukleniyor}>{yukleniyor ? "Yazılıyor…" : "Rapor Oluştur"}</Btn>
        </div>
        {!aiHazir() && !rapor && <p style={{ color: V.accent, fontSize: "0.78rem", margin: "0.75rem 0 0" }}>AI rapor için Ayarlar'dan Anthropic anahtarı gir.</p>}
        {rapor && <div style={{ color: V.ink2, fontSize: "0.88rem", lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: F, marginTop: "1rem" }}>{rapor}</div>}
      </Card>
    </div>
  );
}
