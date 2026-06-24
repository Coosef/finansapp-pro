// ============================================================
// Finans Asistanı (sohbet) — Zümrüt & Altın
// ============================================================
import { useState, useRef, useEffect } from "react";
import { V, F, SERIF } from "../lib/constants.js";
import { buAy } from "../lib/format.js";
import { claudeCall, aiHazir } from "../lib/ai.js";
import { Icon } from "../components/icons.jsx";

// App tarafından üretilen metni güvenli biçimde render et:
// **kalın** → <strong>, satır araları korunur. HTML enjeksiyonu yok.
function MesajMetni({ metin }) {
  const parcalar = String(metin).split(/(\*\*[^*]+\*\*)/g);
  return (
    <span style={{ whiteSpace: "pre-wrap" }}>
      {parcalar.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </span>
  );
}

export function Asistan({ findata, guncelDeger, toplamGelir, toplamGider, toplamAbonelik, yatirimDeger, netDeger, bildir }) {
  const [mesajlar, setMesajlar] = useState([
    {
      rol: "asistan",
      metin:
        "Merhaba! Ben **FinansApp finans asistanınım**. Senin verilerine — gelir-gider, bütçe, hedef, yatırım ve hesaplarına — bakarak sorularını yanıtlar, harcamalarını analiz eder, tasarruf ve bütçe önerileri sunarım.\n\nÖrnek sorular:\n• Bu ay en çok nereye harcadım?\n• Tasarruf için ne önerirsin?\n• Şu krediyi kapatmalı mıyım?\n\nNot: Genel finansal rehberlik veririm; profesyonel yatırım/vergi danışmanlığı değil — son karar senin.",
    },
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
      const prompt = `Sen FinansApp uygulamasının kişisel finans asistanısın. Rolün: kullanıcının KENDİ finansal verisine dayanarak Türkçe, kısa ve net yanıtlar vermek; harcamalarını analiz etmek; bütçe, tasarruf, borç ve hedef konularında pratik öneriler sunmak. Kullanıcı "sen kimsin / ne yapabilirsin" diye sorarsa rolünü kısaca açıkla.

Kurallar:
- Yalnızca aşağıdaki kullanıcı verisine ve konuşmaya dayan; veri yoksa rakam uydurma.
- Gerektiğinde veriden hesap yap (toplam, oran, fark).
- Veri yetersizse dürüstçe söyle ve hangi bilginin gerektiğini belirt.
- Yatırım/borç önerirken bunun kesin finansal tavsiye olmadığını, son kararın kullanıcıya ait olduğunu ekle.
- Para birimi TL. Yalnızca cevap metnini yaz (başlık veya sistem notu ekleme).

Kullanıcının güncel verisi: ${JSON.stringify(ozet())}

Konuşma:
${konusma}

Son kullanıcı sorusunu yukarıdaki role ve verilere göre yanıtla.`;
      const txt = await claudeCall([{ role: "user", content: prompt }]);
      setMesajlar((m) => [...m, { rol: "asistan", metin: txt }]);
    } catch (e) {
      const msg = e?.name === "AIAnahtarYok" ? e.message : "Üzgünüm, şu an cevap veremedim. Tekrar dener misin?";
      setMesajlar((m) => [...m, { rol: "asistan", metin: msg }]);
    } finally {
      setBekle(false);
    }
  }

  const avatar = (
    <div style={{ width: 30, height: 30, borderRadius: "50%", flex: "none", background: V.emerald, color: V.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, fontFamily: SERIF }}>₺</div>
  );

  const dot = (gecikme) => (
    <span style={{ width: 7, height: 7, borderRadius: "50%", background: V.ink3, animation: `obfade .9s ease-in-out ${gecikme} infinite alternate` }} />
  );

  return (
    <div>
      <style>{"@keyframes obfade{from{opacity:.25}to{opacity:1}}"}</style>
      <h2 style={{ margin: "0 0 0.2rem", fontSize: "1.2rem", fontWeight: 600, fontFamily: SERIF, color: V.ink }}>Finans Asistanı</h2>
      <p style={{ color: V.ink3, fontSize: "0.85rem", margin: "0 0 1rem" }}>
        Senin gelir-gider, bütçe, hedef ve yatırım verine bakarak Türkçe yanıt verir; harcamanı analiz eder, tasarruf ve bütçe önerileri sunar.
        {!aiHazir() && <span style={{ color: V.accent }}> (Çalışması için Ayarlar → Yapay Zekâ'dan bir sağlayıcı bağla: Claude, Gemini veya yerel model.)</span>}
      </p>

      <div className="fa-card" style={{ padding: 24, minHeight: 440, display: "flex", flexDirection: "column" }}>
        <div ref={kaydirRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {mesajlar.map((m, i) =>
            m.rol === "user" ? (
              <div key={i} style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ maxWidth: "80%", background: V.emerald, color: V.cream, borderRadius: "14px 14px 4px 14px", padding: "14px 18px", fontSize: "13.5px", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                  {m.metin}
                </div>
              </div>
            ) : (
              <div key={i} style={{ display: "flex", gap: 11, maxWidth: "85%" }}>
                {avatar}
                <div style={{ background: V.bubble, color: V.ink, borderRadius: "4px 14px 14px 14px", padding: "14px 18px", fontSize: "13.5px", lineHeight: 1.55 }}>
                  <MesajMetni metin={m.metin} />
                </div>
              </div>
            )
          )}
          {bekle && (
            <div style={{ display: "flex", gap: 11, maxWidth: "80%" }}>
              {avatar}
              <div style={{ background: V.bubble, borderRadius: "4px 14px 14px 14px", padding: "14px 18px", display: "flex", gap: 5, alignItems: "center" }}>
                {dot(".0s")}
                {dot(".3s")}
                {dot(".6s")}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 9, marginTop: 18 }}>
          <input
            value={girdi}
            onChange={(e) => setGirdi(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && gonder()}
            placeholder={'Bir şey sor ya da "350 lira market" yaz…'}
            style={{ flex: 1, padding: "12px 15px", background: V.card2, border: `1px solid ${V.border}`, borderRadius: 11, color: V.ink, fontSize: "13.5px", fontFamily: F, outline: "none" }}
          />
          <button
            onClick={gonder}
            disabled={bekle}
            className="fa-btn"
            title="Gönder"
            style={{ width: 46, borderRadius: 11, border: "none", background: V.emerald, color: V.cream, cursor: bekle ? "not-allowed" : "pointer", opacity: bekle ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            <Icon d="send" size={18} stroke={V.cream} />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 9, marginTop: "0.85rem", flexWrap: "wrap" }}>
        {["Bu ay en çok nereye harcadım?", "Tasarruf için ne önerirsin?", "Bütçemi aşıyor muyum?"].map((s) => (
          <button
            key={s}
            onClick={() => setGirdi(s)}
            className="fa-btn"
            style={{ background: V.card, color: V.ink2, border: `1px solid ${V.border2}`, borderRadius: 10, padding: "8px 13px", fontSize: "12.5px", fontFamily: F, fontWeight: 600, cursor: "pointer" }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
