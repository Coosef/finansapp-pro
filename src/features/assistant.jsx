// ============================================================
// Finans Asistanı (sohbet)
// ============================================================
import { useState, useRef, useEffect } from "react";
import { C, pageTitle, inputStyle } from "../lib/constants.js";
import { buAy } from "../lib/format.js";
import { claudeCall, aiHazir } from "../lib/ai.js";
import { Card, Btn } from "../components/ui.jsx";

export function Asistan({ findata, guncelDeger, toplamGelir, toplamGider, toplamAbonelik, yatirimDeger, netDeger, bildir }) {
  const [mesajlar, setMesajlar] = useState([
    { rol: "asistan", metin: 'Merhaba! Finansınla ilgili her şeyi sorabilirsin. Örn: "Bu ay en çok nereye harcadım?", "Tasarruf için ne önerirsin?", "Bu krediyi kapatmalı mıyım?"' },
  ]);
  const [girdi, setGirdi] = useState("");
  const [bekle, setBekle] = useState(false);
  const kaydirRef = useRef();
  useEffect(() => {
    if (kaydirRef.current) kaydirRef.current.scrollTop = kaydirRef.current.scrollHeight;
  }, [mesajlar, bekle]);

  function ozet() {
    const ay = buAy();
    const ayGider = {};
    findata.giderler.filter((g) => (g.tarih || "").startsWith(ay)).forEach((g) => { ayGider[g.kategori] = (ayGider[g.kategori] || 0) + g.miktar; });
    const sonGiderler = findata.giderler.slice().sort((a, b) => (b.tarih || "").localeCompare(a.tarih || "")).slice(0, 12).map((g) => ({ b: g.baslik, k: g.kategori, m: g.miktar, t: g.tarih }));
    return { toplamGelir, toplamGider, toplamAbonelik, yatirimDeger: Math.round(yatirimDeger), netDeger: Math.round(netDeger), buAyKategoriGider: ayGider, butceler: findata.butceler, hedefler: (findata.hedefler || []).map((h) => ({ ad: h.ad, tip: h.tip, hedef: h.hedefTutar, mevcut: h.mevcutTutar })), abonelikler: findata.abonelikler.map((a) => ({ ad: a.baslik, aylik: a.miktar })), sonGiderler };
  }

  async function gonder() {
    if (!girdi.trim() || bekle) return;
    const soru = girdi.trim();
    setGirdi("");
    const yeni = [...mesajlar, { rol: "user", metin: soru }];
    setMesajlar(yeni);
    setBekle(true);
    try {
      const konusma = yeni.slice(-8).map((m) => `${m.rol === "user" ? "Kullanıcı" : "Asistan"}: ${m.metin}`).join("\n");
      const prompt = `Sen bir kişisel finans asistanısın. Kullanıcının güncel verisi (tutarlar TL): ${JSON.stringify(ozet())}.\n\nKonuşma:\n${konusma}\n\nSon kullanıcı sorusuna Türkçe, kısa ve net cevap ver. Gerektiğinde veriden rakam hesapla. Veri yetersizse dürüstçe söyle. Yatırım tavsiyesi verirken bunun kesin tavsiye olmadığını ekle. Sadece cevap metnini yaz.`;
      const txt = await claudeCall([{ role: "user", content: prompt }]);
      setMesajlar((m) => [...m, { rol: "asistan", metin: txt }]);
    } catch (e) {
      const msg = e?.name === "AIAnahtarYok" ? e.message : "Üzgünüm, şu an cevap veremedim. Tekrar dener misin?";
      setMesajlar((m) => [...m, { rol: "asistan", metin: msg }]);
    } finally {
      setBekle(false);
    }
  }

  return (
    <div>
      <h2 style={pageTitle}>Finans Asistanı</h2>
      <p style={{ color: C.dimmer, fontSize: "0.85rem", margin: "0 0 1rem" }}>
        Verilerine bakarak cevaplar; tüm sekmelerin yerine tek bir "sor" kutusu.
        {!aiHazir() && <span style={{ color: C.amber }}> (Çalışması için Ayarlar'dan Anthropic API anahtarı gir.)</span>}
      </p>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div ref={kaydirRef} style={{ height: 420, overflowY: "auto", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {mesajlar.map((m, i) => (
            <div key={i} style={{ alignSelf: m.rol === "user" ? "flex-end" : "flex-start", maxWidth: "85%", background: m.rol === "user" ? "linear-gradient(135deg,#10B981,#059669)" : C.card2, color: m.rol === "user" ? "#fff" : C.text, border: m.rol === "user" ? "none" : `1px solid ${C.line}`, padding: "0.7rem 0.95rem", borderRadius: m.rol === "user" ? "1rem 1rem 0.2rem 1rem" : "1rem 1rem 1rem 0.2rem", fontSize: "0.88rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {m.metin}
            </div>
          ))}
          {bekle && <div style={{ alignSelf: "flex-start", color: C.dimmer, fontSize: "0.85rem", padding: "0.5rem 0.95rem" }}>yazıyor…</div>}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", padding: "0.85rem", borderTop: `1px solid ${C.line}` }}>
          <input value={girdi} onChange={(e) => setGirdi(e.target.value)} onKeyDown={(e) => e.key === "Enter" && gonder()} placeholder="Sorunu yaz…" style={{ ...inputStyle, flex: 1 }} />
          <Btn onClick={gonder} disabled={bekle}>Gönder</Btn>
        </div>
      </Card>
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.85rem", flexWrap: "wrap" }}>
        {["Bu ay en çok nereye harcadım?", "Tasarruf için ne önerirsin?", "Bütçemi aşıyor muyum?"].map((s) => (
          <Btn key={s} variant="ghost" onClick={() => setGirdi(s)} style={{ fontSize: "0.78rem" }}>{s}</Btn>
        ))}
      </div>
    </div>
  );
}
