// ============================================================
// Veri modeli ve finansal mantık (saf fonksiyonlar)
// ============================================================
import { uid, bugun, sonrakiTarih } from "./format.js";

// Boş kullanıcı verisi — tüm okuma noktaları { ...bosVeri(), ...kayitli }
// ile birleştirilir, böylece eski yedeklerde eksik alanlar otomatik dolar.
export const bosVeri = () => ({
  gelirler: [],
  giderler: [],
  abonelikler: [],
  yatirimlar: [],
  butceler: {},
  hedefler: [],
  sablonlar: [],
  hedefDagilim: {},
  ayarlar: { enflasyon: 50, pin: null, tema: "koyu", accent: "#10B981", kuruldu: false, apiKey: "" },
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
