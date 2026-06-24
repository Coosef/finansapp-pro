// ============================================================
// İçe Aktar: fiş tarama (görsel OCR) + banka ekstresi (PDF/CSV/görsel)
// Zümrüt & Altın — açık/koyu tema
// ============================================================
import { useState, useRef } from "react";
import { V, F, SERIF } from "../lib/constants.js";
import { TL, bugun, uid, fileToBase64, parseJSON } from "../lib/format.js";
import { claudeCall, aiHazir } from "../lib/ai.js";
import { giderKategorileri, gelirKategorileri } from "../lib/finance.js";
import { Card, Btn, Seg, Yukleniyor } from "../components/ui.jsx";
import { Icon } from "../components/icons.jsx";

export function IceAktar({ findata, setFindata, bildir, ekle, kategoriOgren }) {
  const [mod, setMod] = useState("fis");
  const [isleniyor, setIsleniyor] = useState(false);
  const [sonuc, setSonuc] = useState(null);
  const fisRef = useRef(),
    ekstreRef = useRef();

  function tekrarMi(yeni) {
    const aday = yeni.tip === "gelir" ? findata.gelirler : findata.giderler;
    return aday.some((x) => {
      const am = Math.abs(x.miktar - yeni.miktar) < 0.5;
      const gf = Math.abs(new Date(x.tarih) - new Date(yeni.tarih)) / 86400000;
      const bb = (x.baslik || "").toLowerCase().slice(0, 6) === (yeni.baslik || "").toLowerCase().slice(0, 6);
      return am && gf <= 3 && (bb || gf <= 1);
    });
  }

  // Gerçek hata mesajını göster (yutma); yoksa çağıran genel metni kullanır
  function aiHata(e) {
    return e?.message || null;
  }

  async function fisYukle(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsleniyor(true);
    setSonuc(null);
    try {
      const b64 = await fileToBase64(file);
      const txt = await claudeCall([
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } },
            { type: "text", text: `Alışveriş fişi. SADECE JSON: {"magaza":"...","tarih":"YYYY-MM-DD","toplam":sayı,"kategori":"Market|Restoran|Konut|Ulaşım|Sağlık|Giyim|Teknoloji|Faturalar|Diğer","kalemler":[{"ad":"ürün","miktar":sayı,"fiyat":sayı}]}. Tarih yoksa bugünü kullan.` },
          ],
        },
      ]);
      const j = parseJSON(txt);
      const kayit = {
        baslik: j.magaza || "Fiş",
        miktar: parseFloat(j.toplam) || 0,
        kategori: j.kategori || "Market",
        tarih: j.tarih || bugun(),
        kalemler: (j.kalemler || []).map((k) => ({ ad: k.ad, miktar: k.miktar, fiyat: parseFloat(k.fiyat) || 0 })),
        kaynak: "fis",
        tip: "gider",
      };
      setSonuc({ kayitlar: [{ ...kayit, _tekrar: tekrarMi(kayit), _sec: !tekrarMi(kayit) }] });
    } catch (err) {
      bildir(aiHata(err) || "Fiş okunamadı", "err");
    } finally {
      setIsleniyor(false);
      if (fisRef.current) fisRef.current.value = "";
    }
  }

  async function ekstreYukle(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsleniyor(true);
    setSonuc(null);
    try {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      const giderKat = giderKategorileri(findata);
      const gelirKat = gelirKategorileri(findata);
      const talimat = `Bu bir banka HESAP ekstresi veya KREDİ KARTI ekstresi olabilir. SADECE şu yapıda TEK bir JSON nesnesi döndür, başka hiçbir metin yazma:
{
  "ozet": {"ekstreTipi":"kart"|"hesap","donemBorcu":sayı|null,"asgariOdeme":sayı|null,"sonOdemeTarihi":"YYYY-MM-DD"|null,"krediLimiti":sayı|null,"kullanilabilirLimit":sayı|null},
  "islemler": [{"tarih":"YYYY-MM-DD","aciklama":"kısa açıklama","miktar":pozitif sayı,"tip":"gelir|gider|odeme","kategori":"..."}]
}

Özet alanlarını ekstrenin ÜST kısmından al (dönem borcu/güncel borç, asgari/en az ödeme tutarı, son ödeme tarihi, kredi/kart limiti, kullanılabilir limit). Yoksa ilgili alanı null bırak. Sayılar gerçek sayı olsun (1.234,56 → 1234.56).

Tip kuralları:
- Alışveriş, harcama, çekim, fatura, faiz, ücret/komisyon → "gider".
- Maaş, gelen havale/EFT, faiz geliri, iade/geri ödeme → "gelir".
- Kredi kartı borç ödemesi (ör. "ödemeniz için teşekkürler", "tahsilat", "kart ödemesi", "virman ile ödeme", "hesaptan ödeme") → "odeme". Bu bir BORÇ ÖDEMESİDİR; gelir veya gider DEĞİLDİR.

Kategori kuralları:
- "gider" için EN UYGUN olanı şu listeden seç: ${giderKat.join(", ")}.
- "gelir" için şu listeden seç: ${gelirKat.join(", ")}.
- "odeme" için kategori = "Kart Ödemesi".
- Açıklamadan tahmin et: market/zincir market→Market, restoran/kafe/yemek→Restoran, akaryakıt/petrol/ulaşım/otoyol/taksi→Ulaşım, fatura/telekom/elektrik/su/doğalgaz→Faturalar, e-ticaret/online mağaza→Teknoloji, yazılım/uygulama/abonelik/yapay zekâ→Teknoloji, eczane/hastane/sağlık→Sağlık, giyim→Giyim, sinema/oyun/eğlence→Eğlence. Emin değilsen "Diğer".

miktar her zaman pozitif. TÜM işlemleri ekle (en fazla 120).`;
      let content;
      if (ext === "csv" || ext === "txt" || (file.type || "").includes("text") || (file.type || "").includes("csv")) {
        const m = await file.text();
        content = [{ type: "text", text: talimat + "\n\nİçerik:\n" + m.slice(0, 6000) }];
      } else if (ext === "pdf" || file.type === "application/pdf") {
        const b64 = await fileToBase64(file);
        content = [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }, { type: "text", text: talimat }];
      } else {
        const b64 = await fileToBase64(file);
        content = [{ type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } }, { type: "text", text: talimat }];
      }
      const txt = await claudeCall([{ role: "user", content }]);
      const parsed = parseJSON(txt);
      // Yeni biçim: { ozet, islemler }; eski/yedek biçim: doğrudan dizi
      const ham = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.islemler) ? parsed.islemler : [];
      const ozet = !Array.isArray(parsed) && parsed?.ozet ? parsed.ozet : null;
      // Kart borcu ödemeleri gelir/gider değildir → içe aktarılmaz, yalnız bilgilendirilir
      const atlanan = ham.filter((x) => x.tip === "odeme").length;
      const kayitlar = ham
        .filter((x) => x.tip !== "odeme")
        .map((x) => {
          const kayit = { baslik: x.aciklama || "İşlem", miktar: Math.abs(parseFloat(x.miktar) || 0), kategori: x.kategori || "Diğer", tarih: x.tarih || bugun(), kaynak: "ekstre", tip: x.tip === "gelir" ? "gelir" : "gider" };
          const t = tekrarMi(kayit);
          return { ...kayit, _tekrar: t, _sec: !t };
        });
      if (!kayitlar.length && !atlanan && !ozet) bildir("İşlem bulunamadı", "err");
      else setSonuc({ kayitlar, atlanan, ozet });
    } catch (err) {
      let m = aiHata(err) || "Ekstre işlenemedi";
      // Yoğunluk hatasında, PDF yerine CSV/Excel öner (çok daha hafif, takılmaz)
      if (/yoğun/i.test(m)) m = "Gemini şu an yoğun. İpucu: ekstreyi bankadan CSV/Excel indirip yükle (çok daha hafif ve OCR'sız, takılmaz) ya da birkaç dakika sonra tekrar dene.";
      bildir(m, "err");
    } finally {
      setIsleniyor(false);
      if (ekstreRef.current) ekstreRef.current.value = "";
    }
  }

  function secimDegis(i) {
    setSonuc((s) => ({ ...s, kayitlar: s.kayitlar.map((k, j) => (j === i ? { ...k, _sec: !k._sec } : k)) }));
  }
  function onayla() {
    const secili = sonuc.kayitlar.filter((k) => k._sec);
    secili.forEach((k) => {
      const { _tekrar, _sec, tip, ...kayit } = k;
      ekle(tip, kayit);
      kategoriOgren(kayit.baslik, kayit.kategori);
    });
    bildir(`${secili.length} kayıt eklendi`);
    setSonuc(null);
  }

  // Ekstre özetindeki dönem borcunu kredi kartı hesabına işle (yoksa oluştur)
  function kartBorcuAyarla(borc) {
    if (!setFindata || !(borc > 0)) return;
    setFindata((d) => {
      const hesaplar = [...(d.hesaplar || [])];
      const i = hesaplar.findIndex((h) => h.tip === "kart");
      if (i >= 0) hesaplar[i] = { ...hesaplar[i], bakiye: borc };
      else hesaplar.push({ id: uid(), ad: "Kredi Kartı", tip: "kart", bakiye: borc });
      return { ...d, hesaplar };
    });
    bildir(`Kart borcu ${TL(borc)} olarak güncellendi`);
  }

  const sectionTitle = { margin: 0, fontSize: "0.82rem", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 };
  const ozetSatir = (sonuc?.ozet
    ? [["Dönem Borcu", sonuc.ozet.donemBorcu], ["Asgari Ödeme", sonuc.ozet.asgariOdeme], ["Kredi Limiti", sonuc.ozet.krediLimiti], ["Kullanılabilir", sonuc.ozet.kullanilabilirLimit]]
        .filter(([, v]) => v != null && !isNaN(parseFloat(v)))
    : []);

  return (
    <div>
      <p style={{ color: V.ink3, fontSize: "12.5px", margin: "0 0 1.25rem" }}>
        Fiş veya ekstre yükleyin; AI okur, kategoriler, tekrarları işaretler.
        {!aiHazir() && <span style={{ color: V.accent }}> (AI okuma için Ayarlar'dan anahtar gir.)</span>}
      </p>

      <div style={{ marginBottom: "1.25rem" }}>
        <Seg
          value={mod}
          onChange={(v) => { setMod(v); setSonuc(null); }}
          items={[{ id: "fis", label: "Fiş Tara" }, { id: "ekstre", label: "Banka Ekstresi" }]}
        />
      </div>

      <Card style={{ marginBottom: "1.25rem" }}>
        {isleniyor ? (
          <Yukleniyor
            baslik={mod === "fis" ? "Fiş okunuyor…" : "Ekstre okunuyor…"}
            mesaj="Yapay zekâ işliyor; büyük PDF'lerde 30 saniyeye kadar sürebilir. Lütfen bekle — sayfadan ayrılma."
          />
        ) : mod === "fis" ? (
          <div style={{ textAlign: "center", padding: "1.5rem 1rem" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", margin: "0 auto 14px", background: V.track, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon d="camera" size={26} stroke={V.accent} />
            </div>
            <p style={{ color: V.ink2, fontSize: "0.9rem", margin: "0 0 1rem" }}>Fişin fotoğrafını çek veya seç</p>
            <input ref={fisRef} type="file" accept="image/*" capture="environment" onChange={fisYukle} style={{ display: "none" }} />
            <Btn variant="gold" onClick={() => fisRef.current?.click()} disabled={isleniyor}>{isleniyor ? "Okunuyor…" : "Fiş Yükle"}</Btn>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "1.5rem 1rem" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", margin: "0 auto 14px", background: V.track, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon d="archive" size={24} stroke={V.accent} />
            </div>
            <p style={{ color: V.ink2, fontSize: "0.9rem", margin: "0 0 0.3rem" }}>Banka ekstresini yükle</p>
            <p style={{ color: V.ink3, fontSize: "0.75rem", margin: "0 0 1rem" }}>PDF · CSV · Görsel</p>
            <input ref={ekstreRef} type="file" accept=".pdf,.csv,.txt,image/*" onChange={ekstreYukle} style={{ display: "none" }} />
            <Btn variant="gold" onClick={() => ekstreRef.current?.click()} disabled={isleniyor}>{isleniyor ? "İşleniyor…" : "Ekstre Yükle"}</Btn>
          </div>
        )}
      </Card>

      {sonuc && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", gap: "0.5rem", flexWrap: "wrap" }}>
            <h3 style={sectionTitle}>Bulunan Kayıtlar ({sonuc.kayitlar.length})</h3>
            <Btn variant="primary" onClick={onayla} disabled={!sonuc.kayitlar.some((k) => k._sec)}>Seçilenleri Ekle</Btn>
          </div>
          {sonuc.ozet && (ozetSatir.length > 0 || sonuc.ozet.sonOdemeTarihi) && (
            <div style={{ background: V.emerald, borderRadius: 12, padding: "14px 16px", marginBottom: "0.9rem" }}>
              <div className="serif" style={{ fontSize: 14, fontWeight: 600, color: V.cream, marginBottom: 10 }}>Ekstre Özeti</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10 }}>
                {ozetSatir.map(([ad, v]) => (
                  <div key={ad}>
                    <div style={{ fontSize: 10.5, color: V.sage, textTransform: "uppercase", letterSpacing: "0.05em" }}>{ad}</div>
                    <div className="num" style={{ fontSize: 15, fontWeight: 600, color: V.cream, marginTop: 2 }}>{TL(parseFloat(v))}</div>
                  </div>
                ))}
                {sonuc.ozet.sonOdemeTarihi && (
                  <div>
                    <div style={{ fontSize: 10.5, color: V.sage, textTransform: "uppercase", letterSpacing: "0.05em" }}>Son Ödeme</div>
                    <div className="num" style={{ fontSize: 15, fontWeight: 600, color: V.cream, marginTop: 2 }}>{sonuc.ozet.sonOdemeTarihi}</div>
                  </div>
                )}
              </div>
              {sonuc.ozet.donemBorcu != null && !isNaN(parseFloat(sonuc.ozet.donemBorcu)) && setFindata && (
                <button onClick={() => kartBorcuAyarla(parseFloat(sonuc.ozet.donemBorcu))} className="fa-btn" style={{ marginTop: 12, padding: "8px 14px", borderRadius: 9, border: "none", background: V.accent, color: V.emerald, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: F }}>
                  Kart borcunu Hesaplar'a işle ({TL(parseFloat(sonuc.ozet.donemBorcu))})
                </button>
              )}
            </div>
          )}
          {sonuc.atlanan > 0 && (
            <p style={{ color: V.ink2, fontSize: "0.78rem", margin: "0 0 0.75rem", background: V.card2, border: `1px solid ${V.border}`, padding: "0.5rem 0.75rem", borderRadius: "0.6rem" }}>
              💳 {sonuc.atlanan} kart borcu ödemesi atlandı (gelir/gider sayılmaz).
            </p>
          )}
          {sonuc.kayitlar.some((k) => k._tekrar) && (
            <p style={{ color: V.accent, fontSize: "0.78rem", margin: "0 0 0.75rem", background: "var(--chip-gold)", border: `1px solid ${V.border2}`, padding: "0.5rem 0.75rem", borderRadius: "0.6rem" }}>
              ⚠️ Sarı işaretliler olası tekrar; varsayılan seçili değil.
            </p>
          )}
          {sonuc.kayitlar.map((k, i) => (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.7rem 0.85rem",
                background: k._tekrar ? "var(--chip-gold)" : V.card2,
                border: `1px solid ${k._tekrar ? V.accent + "55" : V.border}`,
                borderRadius: "0.6rem", marginBottom: "0.5rem",
              }}
            >
              <input type="checkbox" checked={k._sec} onChange={() => secimDegis(i)} style={{ width: 18, height: 18, accentColor: V.emerald2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: "0 0 0.15rem", fontWeight: 600, fontSize: "0.85rem", color: V.ink, fontFamily: F }}>
                  {k.baslik}
                  {k._tekrar && (
                    <span style={{ background: "var(--chip-gold)", border: `1px solid ${V.accent}55`, color: V.accent, fontSize: "0.62rem", padding: "0.1rem 0.4rem", borderRadius: "0.35rem", marginLeft: "0.4rem", fontWeight: 700, letterSpacing: "0.03em", verticalAlign: "middle" }}>OLASI TEKRAR</span>
                  )}
                  {k.kalemler?.length ? <span style={{ color: V.accent, fontSize: "0.7rem", marginLeft: 6 }}>{k.kalemler.length} kalem</span> : null}
                </p>
                <p style={{ margin: 0, color: V.ink3, fontSize: "0.72rem" }}>{k.kategori} · {k.tarih} · {k.tip === "gelir" ? "Gelir" : "Gider"}</p>
              </div>
              <p className="num" style={{ margin: 0, fontWeight: 700, color: k.tip === "gelir" ? V.pos : V.neg }}>{k.tip === "gelir" ? "+" : "−"}{TL(k.miktar)}</p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
