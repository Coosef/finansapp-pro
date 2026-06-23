// ============================================================
// Veri modeli ve finansal mantık (saf fonksiyonlar)
// ============================================================
import { uid, bugun, buAy, sonrakiTarih } from "./format.js";
import { GIDER_KAT, GELIR_KAT, AY_ADI } from "./constants.js";

// "YYYY-MM" → bir sonraki ay (UTC, kararlı)
function sonrakiAy(ay) {
  const [y, m] = ay.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}

// ---- Bütçe devri ----
// Devir açıksa, bir kategorinin önceki aydan devreden tutarı (+ artan / − aşım)
export function butceDevri(findata, kategori, ay) {
  if (!findata?.ayarlar?.butceDevri) return 0;
  const base = (findata.butceler || {})[kategori] || 0;
  if (!base) return 0;
  const [y, m] = ay.split("-").map(Number);
  const onceki = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const harcanan = (findata.giderler || []).filter((g) => g.kategori === kategori && (g.tarih || "").startsWith(onceki)).reduce((s, g) => s + g.miktar, 0);
  return base - harcanan;
}
export function etkinButce(findata, kategori, ay) {
  return ((findata.butceler || {})[kategori] || 0) + butceDevri(findata, kategori, ay);
}

// ---- Hedeflere otomatik aylık katkı ----
// otomatikKatki açık hedeflerde, sonKatki'dan bu aya kadar her ay aylikKatki uygulanır
export function hedefKatkilariUret(data) {
  const t = buAy();
  let degisti = false;
  const hedefler = (data.hedefler || []).map((h) => {
    if (!h.otomatikKatki || !(h.aylikKatki > 0)) return h;
    let son = h.sonKatki || t;
    let mevcut = h.mevcutTutar || 0;
    let cursor = sonrakiAy(son);
    let guard = 0;
    while (cursor <= t && guard < 600) {
      mevcut = h.tip === "borc" ? Math.max(0, mevcut - h.aylikKatki) : Math.min(h.hedefTutar, mevcut + h.aylikKatki);
      son = cursor;
      degisti = true;
      cursor = sonrakiAy(cursor);
      guard++;
    }
    return { ...h, mevcutTutar: mevcut, sonKatki: son };
  });
  return { data: { ...data, hedefler }, degisti };
}

// ---- Yaklaşan ödemeler (abonelik + tekrarlayan gider) ----
export function yaklasanOdemeler(findata, bugunStr, gun = 7) {
  const bugunD = new Date(bugunStr + "T00:00:00");
  const list = [];
  (findata.abonelikler || []).forEach((a) => {
    const g = new Date(a.tarih + "T00:00:00").getDate();
    const sonraki = new Date(bugunD.getFullYear(), bugunD.getMonth(), g);
    if (sonraki < bugunD) sonraki.setMonth(sonraki.getMonth() + 1);
    const fark = Math.ceil((sonraki - bugunD) / 86400000);
    if (fark >= 0 && fark <= gun) list.push({ ad: a.baslik, miktar: a.miktar, gun: fark, tip: "Abonelik" });
  });
  (findata.sablonlar || []).filter((s) => s.tip === "gider").forEach((s) => {
    const sonraki = s.sonUretilen ? sonrakiTarih(s.sonUretilen, s.frekans) : s.baslangic;
    const fark = Math.ceil((new Date(sonraki + "T00:00:00") - bugunD) / 86400000);
    if (fark >= 0 && fark <= gun) list.push({ ad: s.baslik, miktar: s.miktar, gun: fark, tip: "Tekrar" });
  });
  return list.sort((a, b) => a.gun - b.gun);
}

// Bir yılın aylık gelir/gider özeti + tasarruf oranı (saf, test edilebilir)
export function yillikOzet(findata, yil) {
  const aylar = Array.from({ length: 12 }, (_, i) => ({ ay: AY_ADI[i], gelir: 0, gider: 0 }));
  const pre = String(yil);
  const ekle = (liste, alan) =>
    (liste || []).forEach((x) => {
      if ((x.tarih || "").startsWith(pre)) {
        const m = parseInt((x.tarih || "").slice(5, 7), 10) - 1;
        if (m >= 0 && m < 12) aylar[m][alan] += x.miktar || 0;
      }
    });
  ekle(findata.gelirler, "gelir");
  ekle(findata.giderler, "gider");
  const toplamGelir = aylar.reduce((s, a) => s + a.gelir, 0);
  const toplamGider = aylar.reduce((s, a) => s + a.gider, 0);
  const net = toplamGelir - toplamGider;
  const tasarrufOrani = toplamGelir > 0 ? (net / toplamGelir) * 100 : 0;
  return { aylar, toplamGelir, toplamGider, net, tasarrufOrani };
}

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
  ayarlar: { enflasyon: 50, pin: null, tema: "koyu", accent: "#10B981", kuruldu: false, apiKey: "", aiSaglayici: "anthropic", yerelAdres: "", yerelModel: "", butceDevri: false, bildirimler: false, sonBildirim: "" },
  kategoriHafiza: {},
  kurlar: null,
  hesaplar: [],
  transferler: [],
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
