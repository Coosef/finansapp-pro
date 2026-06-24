// ============================================================
// İçe Aktar: fiş tarama (görsel OCR) + banka ekstresi (PDF/CSV/görsel)
// Zümrüt & Altın — açık/koyu tema
// ============================================================
import { useState, useRef } from "react";
import { V, F, SERIF } from "../lib/constants.js";
import { TL, bugun, buAy, uid, fileToBase64, parseJSON, sonrakiTarih } from "../lib/format.js";
import { claudeCall, aiHazir } from "../lib/ai.js";
import { giderKategorileri, gelirKategorileri } from "../lib/finance.js";
import { Card, Btn, Seg, Yukleniyor } from "../components/ui.jsx";
import { Icon } from "../components/icons.jsx";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

// PDF'i sayfa sayfa görsele çevir (yerel model PDF okuyamaz; görseli okur).
// Banka fontu sorunu yaşamaz çünkü pdf.js sayfayı piksel olarak render eder.
// Worker, Vite'ın ?worker'ı ile oluşturulur → nginx MIME'ına/önbelleğine bağımlı değil.
async function pdfSayfalariGorsel(file) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const out = [];
  const n = Math.min(pdf.numPages, 12);
  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    out.push({ data: canvas.toDataURL("image/jpeg", 0.85).split(",")[1], mime: "image/jpeg" });
  }
  return out;
}

export function IceAktar({ findata, setFindata, bildir, ekle, kategoriOgren }) {
  const [mod, setMod] = useState("fis");
  const [isleniyor, setIsleniyor] = useState(false);
  const [durum, setDurum] = useState("");
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
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const file = files[0];
    setIsleniyor(true);
    setSonuc(null);
    try {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      const giderKat = giderKategorileri(findata);
      const gelirKat = gelirKategorileri(findata);
      const talimat = `Bu bir banka HESAP ekstresi veya KREDİ KARTI ekstresi olabilir. SADECE şu yapıda TEK bir JSON nesnesi döndür, başka hiçbir metin yazma:
{
  "ozet": {"ekstreTipi":"kart"|"hesap","banka":"kart/banka adı veya null","son4":"kart/hesap numarasının son 4 hanesi veya null","donemBorcu":sayı|null,"asgariOdeme":sayı|null,"sonOdemeTarihi":"YYYY-MM-DD"|null,"krediLimiti":sayı|null,"kullanilabilirLimit":sayı|null},
  "islemler": [{"tarih":"YYYY-MM-DD","aciklama":"kısa açıklama","miktar":pozitif sayı,"tip":"gelir|gider|odeme","kategori":"...","taksit":{"no":sayı,"toplam":sayı} veya null}]
}

Özet alanlarını ekstrenin ÜST kısmından al (kart/banka adı ör. "Axess"/"Bonus"/"Maximum", kart/hesap numarasının son 4 hanesi, dönem borcu/güncel borç, asgari/en az ödeme tutarı, son ödeme tarihi, kredi/kart limiti, kullanılabilir limit). Yoksa ilgili alanı null bırak. Sayılar gerçek sayı olsun (1.234,56 → 1234.56).

Tip kuralları:
- Alışveriş, harcama, çekim, fatura, faiz, ücret/komisyon → "gider".
- Maaş, gelen havale/EFT, faiz geliri, iade/geri ödeme → "gelir".
- Kredi kartı borç ödemesi (ör. "ödemeniz için teşekkürler", "tahsilat", "kart ödemesi", "virman ile ödeme", "hesaptan ödeme") → "odeme". Bu bir BORÇ ÖDEMESİDİR; gelir veya gider DEĞİLDİR.

Taksit kuralı: İşlem taksitliyse (ör. "TAKSIT 2/3", "3/2.taksit", "2/3 TAKSİT") taksit alanını doldur: no = bu ay ödenen kaçıncı taksit, toplam = toplam taksit sayısı. miktar = TEK bir taksitin (bu ayki) tutarı. Taksitsiz işlemde taksit = null.

Kategori kuralları:
- "gider" için EN UYGUN olanı şu listeden seç: ${giderKat.join(", ")}.
- "gelir" için şu listeden seç: ${gelirKat.join(", ")}.
- "odeme" için kategori = "Kart Ödemesi".
- Açıklamadan tahmin et: market/zincir market→Market, restoran/kafe/yemek→Restoran, akaryakıt/petrol/ulaşım/otoyol/taksi→Ulaşım, fatura/telekom/elektrik/su/doğalgaz→Faturalar, e-ticaret/online mağaza→Teknoloji, yazılım/uygulama/abonelik/yapay zekâ→Teknoloji, eczane/hastane/sağlık→Sağlık, giyim→Giyim, sinema/oyun/eğlence→Eğlence. Emin değilsen "Diğer".

Tarih kuralı: tarihleri ekstreden AYNEN al (YIL dahil, ör. 2026). Tarih veya saat UYDURMA; açıklamaya saat ekleme.

Birden çok görsel verilirse bunlar AYNI ekstrenin sayfalarıdır; TÜM sayfalardaki işlemleri tek bir listede birleştir, tekrar etme. miktar her zaman pozitif. TÜM işlemleri ekle (en fazla 200).`;
      // Yardımcılar: yanıttan işlem listesi / özet çıkar
      const islemAl = (p) => (Array.isArray(p) ? p : Array.isArray(p?.islemler) ? p.islemler : []);
      const ozetAl = (p) => (!Array.isArray(p) && p?.ozet ? p.ozet : null);
      let ham = [];
      let ozet = null;
      // Görsel kaynaklarını ([{data,mime}]) sayfa sayfa oku, sonuçları birleştir.
      // Bir sayfa hata verse (bozuk JSON vb.) diğerleri devam eder.
      let okunamayan = 0;
      const sayfalariOku = async (kaynaklar) => {
        const gorulen = new Set();
        for (let pi = 0; pi < kaynaklar.length; pi++) {
          if (kaynaklar.length > 1) setDurum(`Sayfa ${pi + 1}/${kaynaklar.length} okunuyor…`);
          try {
            const p = parseJSON(await claudeCall([{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: kaynaklar[pi].mime, data: kaynaklar[pi].data } }, { type: "text", text: talimat }] }]));
            if (!ozet) ozet = ozetAl(p);
            for (const x of islemAl(p)) {
              const k = `${x.tarih}|${Math.abs(parseFloat(x.miktar) || 0)}|${(x.aciklama || "").slice(0, 10).toLowerCase()}`;
              if (gorulen.has(k)) continue; // sayfa sınırındaki tekrarları ele
              gorulen.add(k);
              ham.push(x);
            }
          } catch {
            okunamayan++; // bu sayfa atlandı; diğer sayfalar devam
          }
        }
        setDurum("");
      };
      if (ext === "csv" || ext === "txt" || (file.type || "").includes("text") || (file.type || "").includes("csv")) {
        const m = await file.text();
        const p = parseJSON(await claudeCall([{ role: "user", content: [{ type: "text", text: talimat + "\n\nİçerik:\n" + m.slice(0, 40000) }] }]));
        ham = islemAl(p); ozet = ozetAl(p);
      } else if (ext === "pdf" || file.type === "application/pdf") {
        // PDF'i sayfa görsellerine çevir (yerelde de çalışsın); olmazsa ham PDF'e düş
        let sayfalar = null;
        try { setDurum("PDF sayfalara çevriliyor…"); sayfalar = await pdfSayfalariGorsel(file); } catch { sayfalar = null; }
        if (sayfalar && sayfalar.length) {
          await sayfalariOku(sayfalar);
        } else {
          const b64 = await fileToBase64(file);
          const p = parseJSON(await claudeCall([{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }, { type: "text", text: talimat }] }]));
          ham = islemAl(p); ozet = ozetAl(p);
        }
      } else {
        // Yüklenen görseller — her sayfa ayrı okunur
        const resimler = files.filter((f) => !/\.(pdf|csv|txt)$/i.test(f.name));
        const kaynaklar = [];
        for (const f of resimler) kaynaklar.push({ data: await fileToBase64(f), mime: f.type || "image/jpeg" });
        await sayfalariOku(kaynaklar);
      }
      // Kart borcu ödemeleri gelir/gider değildir → içe aktarılmaz, yalnız bilgilendirilir
      const atlanan = ham.filter((x) => x.tip === "odeme").length;
      const kayitlar = [];
      let taksitSayisi = 0;
      ham.filter((x) => x.tip !== "odeme").forEach((x) => {
        const tip = x.tip === "gelir" ? "gelir" : "gider";
        const miktar = Math.abs(parseFloat(x.miktar) || 0);
        const temel = { baslik: x.aciklama || "İşlem", miktar, kategori: x.kategori || "Diğer", tarih: x.tarih || bugun(), kaynak: "ekstre", tip };
        const t = tekrarMi(temel);
        kayitlar.push({ ...temel, _tekrar: t, _sec: !t });
        // Taksit: kalan taksitleri gelecek aylara borç (gider) olarak ekle
        const no = parseInt(x?.taksit?.no, 10);
        const toplam = parseInt(x?.taksit?.toplam, 10);
        if (tip === "gider" && no > 0 && toplam > no && toplam <= 36) {
          for (let i = no + 1; i <= toplam; i++) {
            let tarih = temel.tarih;
            for (let k = 0; k < i - no; k++) tarih = sonrakiTarih(tarih, "aylık");
            const tkayit = { baslik: `${temel.baslik} (taksit ${i}/${toplam})`, miktar, kategori: temel.kategori, tarih, kaynak: "taksit", tip: "gider" };
            const tt = tekrarMi(tkayit); // re-import'ta zaten eklenmiş taksiti yakala
            kayitlar.push({ ...tkayit, _tekrar: tt, _taksit: true, _sec: !tt });
            if (!tt) taksitSayisi++;
          }
        }
      });
      if (!kayitlar.length && !atlanan && !ozet) {
        bildir(okunamayan ? "Sayfalar okunamadı (model geçersiz yanıt verdi). Tekrar dene ya da farklı model/bulut kullan." : "İşlem bulunamadı", "err");
      } else {
        if (okunamayan) bildir(`${okunamayan} sayfa okunamadı, atlandı — sonuçlar eksik olabilir`, "err");
        setSonuc({ kayitlar, atlanan, ozet, taksitSayisi });
      }
    } catch (err) {
      let m = aiHata(err) || "Ekstre işlenemedi";
      // Yoğunluk hatasında, PDF yerine CSV/Excel öner (çok daha hafif, takılmaz)
      if (/yoğun/i.test(m)) m = "Gemini şu an yoğun. İpucu: ekstreyi bankadan CSV/Excel indirip yükle (çok daha hafif ve OCR'sız, takılmaz) ya da birkaç dakika sonra tekrar dene.";
      bildir(m, "err");
    } finally {
      setIsleniyor(false);
      setDurum("");
      if (ekstreRef.current) ekstreRef.current.value = "";
    }
  }

  function secimDegis(i) {
    setSonuc((s) => ({ ...s, kayitlar: s.kayitlar.map((k, j) => (j === i ? { ...k, _sec: !k._sec } : k)) }));
  }
  // Ekstre özetinden kart/hesabı tanı: son4 ile eşle, yoksa null → onayla'da oluşturulur
  function hesapCoz() {
    const oz = sonuc?.ozet || {};
    const tip = oz.ekstreTipi === "hesap" ? "banka" : "kart";
    const son4 = String(oz.son4 || "").replace(/\D/g, "").slice(-4);
    const banka = (oz.banka || "").trim();
    const mevcut = findata.hesaplar || [];
    let hedef = son4 ? mevcut.find((h) => h.son4 === son4 || (h.ad || "").includes(son4)) : null;
    if (!hedef && banka) hedef = mevcut.find((h) => h.tip === tip && (h.ad || "").toLowerCase().includes(banka.toLowerCase()));
    const ad = hedef?.ad || ((banka || (tip === "kart" ? "Kredi Kartı" : "Hesap")) + (son4 ? ` ••${son4}` : ""));
    return { tip, son4, banka, hedef, ad, yeni: !hedef && (son4 || banka) };
  }

  function onayla() {
    const secili = sonuc.kayitlar.filter((k) => k._sec);
    const oz = sonuc.ozet || {};
    const hc = hesapCoz();
    // 1) Hesabı bağla/oluştur, kart bakiyesini dönem borcuna ayarla
    let hesapId = hc.hedef?.id || null;
    if (setFindata && (hc.son4 || hc.banka)) {
      const borc = parseFloat(oz.donemBorcu);
      if (!hc.hedef) {
        hesapId = uid();
        const yeni = { id: hesapId, ad: hc.ad, tip: hc.tip, bakiye: hc.tip === "kart" && !isNaN(borc) ? borc : 0, son4: hc.son4 || undefined, banka: hc.banka || undefined };
        setFindata((d) => ({ ...d, hesaplar: [...(d.hesaplar || []), yeni] }));
      } else if (hc.tip === "kart" && !isNaN(borc)) {
        setFindata((d) => ({ ...d, hesaplar: (d.hesaplar || []).map((h) => (h.id === hesapId ? { ...h, bakiye: borc, son4: h.son4 || hc.son4 || undefined } : h)) }));
      }
    }
    // 2) İşlemleri hesaba yazarak ekle
    secili.forEach((k) => {
      const { _tekrar, _sec, _taksit, tip: t, ...kayit } = k;
      ekle(t, { ...kayit, hesapId: (t === "gelir" || t === "gider") ? hesapId || "" : "" });
      kategoriOgren(kayit.baslik, kayit.kategori);
    });
    const ay = buAy();
    const gecmis = secili.filter((k) => !(k.tarih || "").startsWith(ay)).length;
    const ekHesap = hesapId ? ` → ${hc.ad}${hc.yeni ? " (yeni hesap)" : ""}` : "";
    bildir(`${secili.length} kayıt eklendi${ekHesap}` + (gecmis ? ` · görmek için dönemi "Tümü" yap` : ""));
    setSonuc(null);
  }

  // Ekstre özetindeki dönem borcunu tanınan kart hesabına işle (yoksa oluştur)
  function kartBorcuAyarla(borc) {
    if (!setFindata || !(borc > 0)) return;
    const hc = hesapCoz();
    setFindata((d) => {
      const hesaplar = [...(d.hesaplar || [])];
      const i = hc.hedef ? hesaplar.findIndex((h) => h.id === hc.hedef.id) : -1;
      if (i >= 0) hesaplar[i] = { ...hesaplar[i], bakiye: borc, son4: hesaplar[i].son4 || hc.son4 || undefined };
      else hesaplar.push({ id: uid(), ad: hc.ad, tip: hc.tip, bakiye: borc, son4: hc.son4 || undefined, banka: hc.banka || undefined });
      return { ...d, hesaplar };
    });
    bildir(`${hc.ad}: borç ${TL(borc)} olarak güncellendi`);
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
            baslik={durum || (mod === "fis" ? "Fiş okunuyor…" : "Ekstre okunuyor…")}
            mesaj="Yapay zekâ işliyor; çok sayfalı ekstrede her sayfa ayrı okunur, biraz sürebilir. Lütfen bekle — sayfadan ayrılma."
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
            <p style={{ color: V.ink3, fontSize: "0.75rem", margin: "0 0 1rem" }}>PDF · CSV · Görsel · çok sayfalı ekstre için birden çok resim seçebilirsin</p>
            <input ref={ekstreRef} type="file" accept=".pdf,.csv,.txt,image/*" multiple onChange={ekstreYukle} style={{ display: "none" }} />
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
              {(sonuc.ozet.banka || sonuc.ozet.son4) && (() => {
                const hc = hesapCoz();
                return (
                  <div style={{ marginTop: 12, fontSize: 12, color: V.sage, display: "flex", alignItems: "center", gap: 7 }}>
                    <Icon d={hc.tip === "kart" ? "card" : "bank"} size={15} stroke={V.cream} />
                    {hc.tip === "kart" ? "Kart" : "Hesap"}: <b style={{ color: V.cream }}>{hc.ad}</b>
                    <span style={{ opacity: 0.85 }}>· {hc.yeni ? "otomatik oluşturulacak" : "mevcut hesaba yazılacak"}</span>
                  </div>
                );
              })()}
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
          {sonuc.taksitSayisi > 0 && (
            <p style={{ color: V.ink2, fontSize: "0.78rem", margin: "0 0 0.75rem", background: V.card2, border: `1px solid ${V.border}`, padding: "0.5rem 0.75rem", borderRadius: "0.6rem" }}>
              📅 {sonuc.taksitSayisi} gelecek taksit, sonraki aylara borç olarak hazırlandı (mavi etiketli). İstemezsen işaretini kaldır.
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
                  {k._taksit && (
                    <span style={{ background: "var(--chip-green)", border: `1px solid ${V.pos}55`, color: V.pos, fontSize: "0.62rem", padding: "0.1rem 0.4rem", borderRadius: "0.35rem", marginLeft: "0.4rem", fontWeight: 700, letterSpacing: "0.03em", verticalAlign: "middle" }}>GELECEK TAKSİT</span>
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
