// ============================================================
// Rapor & Yedek: CSV, PDF (HTML), JSON yedek/geri yükle, AI rapor
// ============================================================
import { useState, useRef } from "react";
import { C, pageTitle, sectionTitle } from "../lib/constants.js";
import { TL, buAy, bugun } from "../lib/format.js";
import { bosVeri } from "../lib/finance.js";
import { claudeCall, aiHazir } from "../lib/ai.js";
import { Card, Btn } from "../components/ui.jsx";

export function Rapor({ findata, setFindata, user, bildir, toplamGelir, toplamGider, toplamAbonelik, yatirimDeger, yatirimKar, netDeger }) {
  const [rapor, setRapor] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const geriRef = useRef();

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
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Finans Raporu</title><style>body{font-family:system-ui,Arial,sans-serif;max-width:720px;margin:40px auto;color:#1a1a1a;padding:0 20px}h1{color:#6366F1}.kart{display:inline-block;border:1px solid #ddd;border-radius:10px;padding:14px 18px;margin:6px 8px 6px 0}.kart b{display:block;font-size:1.3rem}table{width:100%;border-collapse:collapse;margin-top:10px}td,th{padding:8px;border-bottom:1px solid #eee;font-size:0.9rem}@media print{.no-print{display:none}}</style></head><body><h1>₺ FinansApp — Aylık Rapor</h1><p>${user.ad} · ${bugun()}</p><div><div class="kart">Net Varlık<b>${TL(netDeger)}</b></div><div class="kart">Toplam Gelir<b style="color:#16A34A">${TL(toplamGelir)}</b></div><div class="kart">Toplam Gider<b style="color:#DC2626">${TL(toplamGider)}</b></div><div class="kart">Yatırım<b style="color:#6366F1">${TL(yatirimDeger)}</b></div></div><h3>Bu Ay Kategori Giderleri (${ay})</h3><table><tr><th style="text-align:left">Kategori</th><th style="text-align:right">Tutar</th></tr>${katSatir || '<tr><td colspan=2>Veri yok</td></tr>'}</table><button class="no-print" onclick="window.print()" style="margin-top:24px;padding:10px 18px;background:#6366F1;color:#fff;border:none;border-radius:8px;cursor:pointer">PDF olarak yazdır / kaydet</button></body></html>`;
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
  return (
    <div>
      <h2 style={pageTitle}>Rapor & Yedek</h2>
      <p style={{ color: C.dimmer, fontSize: "0.85rem", margin: "0 0 1.25rem" }}>Dışa aktar, yedekle, PDF rapor al veya AI'dan analiz iste.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
        <Card>
          <h3 style={sectionTitle}>📊 CSV (Excel)</h3>
          <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 1rem" }}>Tüm işlemleri tablo olarak indir.</p>
          <Btn variant="ghost" onClick={csvAktar} style={{ width: "100%" }}>CSV İndir</Btn>
        </Card>
        <Card>
          <h3 style={sectionTitle}>📄 PDF Rapor</h3>
          <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 1rem" }}>Formatlı rapor; açıp PDF kaydet/yazdır.</p>
          <Btn variant="ghost" onClick={pdfRapor} style={{ width: "100%" }}>PDF Rapor</Btn>
        </Card>
        <Card>
          <h3 style={sectionTitle}>💾 Yedekle</h3>
          <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 1rem" }}>Tüm veriyi JSON indir.</p>
          <Btn variant="ghost" onClick={yedekAl} style={{ width: "100%" }}>Yedek Al</Btn>
        </Card>
        <Card>
          <h3 style={sectionTitle}>♻️ Geri Yükle</h3>
          <p style={{ color: C.dimmer, fontSize: "0.8rem", margin: "0 0 1rem" }}>JSON yedeği geri yükle.</p>
          <input ref={geriRef} type="file" accept=".json" onChange={geriYukle} style={{ display: "none" }} />
          <Btn variant="ghost" onClick={() => geriRef.current?.click()} style={{ width: "100%" }}>Yedek Seç</Btn>
        </Card>
      </div>
      <Card accent={C.cyan}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: rapor ? "1rem" : 0, flexWrap: "wrap", gap: "0.5rem" }}>
          <h3 style={{ ...sectionTitle, margin: 0 }}>✨ AI Aylık Rapor</h3>
          <Btn onClick={aiRapor} disabled={yukleniyor}>{yukleniyor ? "Yazılıyor…" : "Rapor Oluştur"}</Btn>
        </div>
        {!aiHazir() && !rapor && <p style={{ color: C.amber, fontSize: "0.78rem", margin: "0.75rem 0 0" }}>AI rapor için Ayarlar'dan Anthropic anahtarı gir.</p>}
        {rapor && <div style={{ color: C.dim, fontSize: "0.88rem", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{rapor}</div>}
      </Card>
    </div>
  );
}
