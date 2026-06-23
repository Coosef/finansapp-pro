// ============================================================
// Veri modeli ve finansal mantık (saf fonksiyonlar)
// ============================================================
import { uid, bugun, sonrakiTarih } from "./format.js";
import { GIDER_KAT, GELIR_KAT } from "./constants.js";

// Etkin kategori listeleri (özel kategoriler varsa onları, yoksa varsayılanı)
export const giderKategorileri = (findata) => (findata?.kategoriler?.gider?.length ? findata.kategoriler.gider : GIDER_KAT);
export const gelirKategorileri = (findata) => (findata?.kategoriler?.gelir?.length ? findata.kategoriler.gelir : GELIR_KAT);

// ---- Hesap bakiyesi yardımcıları (saf, test edilebilir) ----
// Normal hesapta gelir +, gider −; kredi kartında (borç) gider +borç, gelir −borç
export function hesapDelta(tur, miktar, hesapTip) {
  if (hesapTip === "kart") return (tur === "gider" ? 1 : -1) * miktar;
  return (tur === "gelir" ? 1 : -1) * miktar;
}
// Bir işlemin etkisini hesaba uygula (isaret: +1 uygula, −1 geri al)
export function hesabaUygula(d, hesapId, tur, miktar, isaret) {
  if (!hesapId) return d;
  return {
    ...d,
    hesaplar: (d.hesaplar || []).map((h) => (String(h.id) === String(hesapId) ? { ...h, bakiye: (+h.bakiye || 0) + isaret * hesapDelta(tur, miktar, h.tip) } : h)),
  };
}
// Hesaplar arası transfer: kaynaktan çıkar, hedefe ekle (kredi kartı borç yönüyle)
export function transferUygula(d, kaynakId, hedefId, miktar) {
  const m = +miktar || 0;
  if (!kaynakId || !hedefId || kaynakId === hedefId || m <= 0) return d;
  return {
    ...d,
    hesaplar: (d.hesaplar || []).map((h) => {
      if (String(h.id) === String(kaynakId)) return { ...h, bakiye: (+h.bakiye || 0) + (h.tip === "kart" ? m : -m) };
      if (String(h.id) === String(hedefId)) return { ...h, bakiye: (+h.bakiye || 0) + (h.tip === "kart" ? -m : m) };
      return h;
    }),
  };
}

// Boş kullanıcı verisi — tüm okuma noktaları { ...bosVeri(), ...kayitli }
// ile birleştirilir, böylece eski yedeklerde eksik alanlar otomatik dolar.
export const bosVeri = () => ({
  gelirler: [],
  giderler: [],
  abonelikler: [],
  yatirimlar: [],
  butceler: {},
  kategoriler: { gider: [...GIDER_KAT], gelir: [...GELIR_KAT] },
  hedefler: [],
  sablonlar: [],
  hedefDagilim: {},
  ayarlar: { enflasyon: 50, pin: null, tema: "koyu", accent: "#10B981", kuruldu: false, apiKey: "", aiSaglayici: "anthropic", yerelAdres: "", yerelModel: "" },
  kategoriHafiza: {},
  kurlar: null,
  hesaplar: [],
  zarflar: {},
  kurallar: [],
  meydanOkumalar: [],
  netGecmis: [],
});

// ---- Rozetler ----
export function rozetleriHesapla(d, netDeger, toplamGider) {
  const r = [];
  const gSay = (d.giderler || []).length,
    ySay = (d.yatirimlar || []).length,
    hSay = (d.hedefler || []).length;
  r.push({ id: "ilk", ad: "İlk Adım", icon: "🌱", aciklama: "İlk işlemini ekle", kazanildi: gSay + (d.gelirler || []).length > 0 });
  r.push({ id: "kasif", ad: "Kâşif", icon: "🧭", aciklama: "10+ işlem kaydet", kazanildi: gSay >= 10 });
  r.push({ id: "yatirimci", ad: "Yatırımcı", icon: "📈", aciklama: "İlk yatırımını ekle", kazanildi: ySay > 0 });
  r.push({ id: "cesitli", ad: "Çeşitlendirici", icon: "🎯", aciklama: "3 farklı varlık tipi", kazanildi: new Set((d.yatirimlar || []).map((y) => y.tip)).size >= 3 });
  r.push({ id: "hedefci", ad: "Hedef Avcısı", icon: "🏆", aciklama: "Bir hedef oluştur", kazanildi: hSay > 0 });
  r.push({ id: "butceli", ad: "Disiplinli", icon: "📊", aciklama: "Kategori bütçesi belirle", kazanildi: Object.values(d.butceler || {}).some((v) => v > 0) });
  r.push({ id: "varlikli", ad: "Altı Sıfır", icon: "💎", aciklama: "Net varlık 1.000.000₺", kazanildi: netDeger >= 1000000 });
  r.push({ id: "tasarruf", ad: "Kumbara", icon: "🐷", aciklama: "Bir birikim hesabı aç", kazanildi: (d.hesaplar || []).some((h) => h.tip === "birikim") });
  return r;
}

// ---- Otomatik kural motoru ----
export function kurallariUygula(kayit, kurallar) {
  let sonuc = { ...kayit };
  const uyarilar = [];
  (kurallar || []).forEach((k) => {
    const eslesme = (kayit.baslik || "").toLowerCase().includes((k.kelime || "").toLowerCase()) && k.kelime;
    const tutarEslesme = k.tutarUstu ? kayit.miktar >= k.tutarUstu : false;
    if ((k.tip === "kategori" && eslesme) || (k.tip === "kategori" && tutarEslesme && !k.kelime)) sonuc.kategori = k.kategori;
    if (k.tip === "uyari" && (eslesme || tutarEslesme)) uyarilar.push(`${k.kelime || k.tutarUstu + "₺ üstü"}: ${k.mesaj || "dikkat"}`);
  });
  return { kayit: sonuc, uyarilar };
}

// ---- Tekrarlayan işlemleri üret (her girişte çalışır) ----
export function tekrarlariUret(data) {
  const t = bugun();
  let degisti = false;
  const yeni = {
    ...data,
    gelirler: [...data.gelirler],
    giderler: [...data.giderler],
    abonelikler: [...data.abonelikler],
    sablonlar: [...(data.sablonlar || [])],
  };
  yeni.sablonlar = yeni.sablonlar.map((s) => {
    let cursor = s.sonUretilen ? sonrakiTarih(s.sonUretilen, s.frekans) : s.baslangic;
    let guard = 0,
      son = s.sonUretilen;
    while (cursor <= t && guard < 600) {
      const kayit = { id: uid(), baslik: s.baslik, miktar: s.miktar, kategori: s.kategori, tarih: cursor, kaynak: "otomatik", otomatik: true, hane: !!s.hane };
      if (s.tip === "gelir") {
        kayit.tekrar = s.frekans;
        yeni.gelirler.push(kayit);
      } else if (s.tip === "abonelik") yeni.abonelikler.push(kayit);
      else yeni.giderler.push(kayit);
      son = cursor;
      degisti = true;
      cursor = sonrakiTarih(cursor, s.frekans);
      guard++;
    }
    return { ...s, sonUretilen: son };
  });
  return { data: yeni, degisti };
}
