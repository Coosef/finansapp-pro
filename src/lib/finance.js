// ============================================================
// Veri modeli ve finansal mantık (saf fonksiyonlar)
// ============================================================
import { uid, bugun, buAy, sonrakiTarih, TL } from "./format.js";
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

// Kategori bütçe önerisi: veride bulunan EN YENİ ayCount ayın (bu aydan eski/eşit)
// kategori-bazlı ortalamasından, %10 pay bırakıp 100'e yuvarlayarak limit önerir.
// Takvim ayına değil mevcut veriye bakar → seyrek/geçmiş ekstrede de çalışır. Taksit hariç.
export function butceOnerisi(findata, bugunStr, ayCount = 3) {
  const d = findata || {};
  const buAyStr = String(bugunStr).slice(0, 7);
  const aylikKat = {}; // ay -> { kategori: toplam }
  (d.giderler || []).forEach((g) => {
    if (/taksit/i.test(g.baslik || "")) return;
    const ay = (g.tarih || "").slice(0, 7);
    if (!ay || ay > buAyStr) return;
    aylikKat[ay] = aylikKat[ay] || {};
    aylikKat[ay][g.kategori] = (aylikKat[ay][g.kategori] || 0) + (g.miktar || 0);
  });
  const aylar = Object.keys(aylikKat).sort().slice(-ayCount);
  if (!aylar.length) return {};
  const kat = {};
  aylar.forEach((ay) => Object.entries(aylikKat[ay]).forEach(([k, v]) => { kat[k] = (kat[k] || 0) + v; }));
  const oneri = {};
  Object.entries(kat).forEach(([k, toplam]) => {
    const aylik = toplam / aylar.length;
    if (aylik < 1) return;
    oneri[k] = Math.max(100, Math.round((aylik * 1.1) / 100) * 100);
  });
  return oneri;
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

// ---- Yaklaşan kredi kartı son ödemeleri (ekstreden gelen sonOdeme tarihi) ----
export function kartOdemeler(findata, bugunStr, gun = 15) {
  const bugunD = new Date(bugunStr + "T00:00:00");
  const out = [];
  (findata?.hesaplar || []).filter((h) => h.tip === "kart" && h.sonOdeme).forEach((h) => {
    const t = new Date(String(h.sonOdeme).slice(0, 10) + "T00:00:00");
    if (isNaN(+t)) return;
    const fark = Math.ceil((t - bugunD) / 86400000);
    if (fark >= 0 && fark <= gun) out.push({ ad: `${h.ad} son ödeme`, miktar: h.asgari || h.bakiye || 0, gun: fark, tip: "Kart", asgari: h.asgari, borc: h.bakiye });
  });
  return out.sort((a, b) => a.gun - b.gun);
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

// ---- Dönem (periyot) filtresi ----
// donem: "buAy" | "gecenAy" | "buYil" | "tum"
// Verilen bugün tarihine göre [start, end] ISO aralığı döner; "tum" için null.
export function donemAraligi(donem, bugunStr) {
  const [y, m] = bugunStr.split("-").map(Number); // m: 1-12
  const iso = (yy, mm, dd) => new Date(Date.UTC(yy, mm, dd)).toISOString().slice(0, 10);
  if (donem === "buAy") return { start: iso(y, m - 1, 1), end: iso(y, m, 0) };
  if (donem === "gecenAy") return { start: iso(y, m - 2, 1), end: iso(y, m - 1, 0) };
  if (donem === "buYil") return { start: `${y}-01-01`, end: `${y}-12-31` };
  return null; // "tum"
}

// Bir tarih (YYYY-MM-DD) verilen aralıkta mı? aralik null ise her zaman true.
export function donemde(tarih, aralik) {
  if (!aralik) return true;
  const t = (tarih || "").slice(0, 10);
  return t >= aralik.start && t <= aralik.end;
}

// gelir/gider listelerini döneme göre filtreler (abonelikler aylık olduğundan dokunulmaz)
export function donemFiltre(findata, donem, bugunStr) {
  const aralik = donemAraligi(donem, bugunStr);
  if (!aralik) return findata;
  return {
    ...findata,
    gelirler: (findata.gelirler || []).filter((g) => donemde(g.tarih, aralik)),
    giderler: (findata.giderler || []).filter((g) => donemde(g.tarih, aralik)),
  };
}

// ---- Enflasyon: geçmiş tutarın bugünkü alım gücü ----
// tarih'te harcanan tutar'ı bugüne kadar enflasyonla şişirir → bugünkü karşılığı.
// enflasyonYuzde: yıllık % (ör. 50). Veri eksik veya gelecek tarih ise tutarı aynen döndürür.
export function reelDeger(tutar, tarih, enflasyonYuzde, bugunStr = bugun()) {
  const oran = (+enflasyonYuzde || 0) / 100;
  if (!tutar || !tarih || oran <= 0) return tutar || 0;
  const t = new Date((tarih || "").slice(0, 10) + "T00:00:00Z");
  const b = new Date((bugunStr || "").slice(0, 10) + "T00:00:00Z");
  if (isNaN(+t) || isNaN(+b)) return tutar;
  const yil = (b - t) / (365.25 * 86400000);
  if (yil <= 0) return tutar; // gelecek/bugün → düzeltme yok
  return tutar * Math.pow(1 + oran, yil);
}

// ---- Net varlık geçmişi snapshot'ı ----
// Bugünün net değerini geçmişe ekler (günde bir kayıt; aynı gün değişmişse günceller).
// Değişiklik yoksa aynı diziyi döndürür (çağıran no-op'u anlar). En çok 60 kayıt tutar.
export function netGecmisGuncelle(netGecmis, deger, bugunStr) {
  const ng = Array.isArray(netGecmis) ? netGecmis : [];
  const son = ng[ng.length - 1];
  if (son && son.tarih === bugunStr) {
    if (Math.round(son.deger) === Math.round(deger)) return ng; // aynı gün, değişmedi
    return [...ng.slice(0, -1), { tarih: bugunStr, deger }];
  }
  return [...ng, { tarih: bugunStr, deger }].slice(-60);
}

// ---- Panel editoryal brifing (saf, test edilebilir) ----
const AY_UZUN_BRIFING = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
function ayGiderOzet(findata, aralik) {
  const g = (findata.giderler || []).filter((x) => donemde(x.tarih, aralik));
  const toplam = g.reduce((s, x) => s + (x.miktar || 0), 0);
  const kat = {};
  g.forEach((x) => { kat[x.kategori] = (kat[x.kategori] || 0) + (x.miktar || 0); });
  return { toplam, kat };
}
// Veriden tek cümlelik manşet ({oncesi,vurgu,sonrasi}) + en çok 3 destek göstergesi üretir.
// Ay-üstü gider değişimi → tasarruf oranı → toplam harcama → "ilk işlem" sırasıyla düşer.
export function panelBrifing(findata, bugunStr = bugun()) {
  const d = findata || {};
  const ay = (bugunStr || "").slice(0, 7);
  const ayAdi = AY_UZUN_BRIFING[parseInt((bugunStr || "").slice(5, 7), 10) - 1] || "Bu ay";
  const buAralik = donemAraligi("buAy", bugunStr);
  const gecenAralik = donemAraligi("gecenAy", bugunStr);
  const bu = ayGiderOzet(d, buAralik);
  const gecen = ayGiderOzet(d, gecenAralik);
  const gelirBu = (d.gelirler || []).filter((x) => donemde(x.tarih, buAralik)).reduce((s, x) => s + (x.miktar || 0), 0);
  const tasarruf = gelirBu > 0 ? Math.round(((gelirBu - bu.toplam) / gelirBu) * 100) : null;

  let artan = null;
  Object.keys(bu.kat).forEach((k) => {
    const fark = bu.kat[k] - (gecen.kat[k] || 0);
    if (fark > 0 && (!artan || fark > artan.fark)) artan = { kategori: k, fark };
  });

  const asim = Object.entries(d.butceler || {})
    .filter(([, lim]) => lim > 0)
    .filter(([kat]) => (bu.kat[kat] || 0) > etkinButce(d, kat, ay)).length;

  const degisimPct = gecen.toplam > 0 ? Math.round(((bu.toplam - gecen.toplam) / gecen.toplam) * 100) : null;

  let manset;
  if (degisimPct != null && Math.abs(degisimPct) >= 5 && bu.toplam > 0) {
    const yon = degisimPct > 0 ? "arttı" : "azaldı";
    manset = { oncesi: `${ayAdi}: giderin geçen aya göre `, vurgu: `%${Math.abs(degisimPct)} ${yon}`, sonrasi: artan && degisimPct > 0 ? ` — en çok ${artan.kategori} kaleminde.` : "." };
  } else if (tasarruf != null) {
    manset = { oncesi: `${ayAdi}: gelirinin `, vurgu: `%${Math.max(0, tasarruf)}'ini`, sonrasi: tasarruf >= 20 ? " biriktirdin — iyi gidiyorsun." : " biriktirdin." };
  } else if (bu.toplam > 0) {
    manset = { oncesi: `${ayAdi}: bu ay `, vurgu: TL(bu.toplam), sonrasi: " harcadın." };
  } else {
    manset = { oncesi: `${ayAdi}: `, vurgu: "ilk işlemini", sonrasi: " ekleyerek panelini canlandır." };
  }

  const destek = [];
  if (tasarruf != null) destek.push({ etiket: "Tasarruf oranı", deger: `%${Math.max(0, tasarruf)}`, ton: tasarruf >= 20 ? "pos" : tasarruf < 0 ? "neg" : "notr" });
  if (degisimPct != null && bu.toplam > 0) destek.push({ etiket: "Geçen aya göre gider", deger: `${degisimPct > 0 ? "+" : ""}%${degisimPct}`, ton: degisimPct > 0 ? "neg" : "pos" });
  if (asim > 0) destek.push({ etiket: "Bütçe aşımı", deger: `${asim} kategori`, ton: "neg" });
  const ng = (d.netGecmis || []).filter((p) => p && typeof p.deger === "number");
  if (ng.length >= 2) {
    const fark = ng[ng.length - 1].deger - ng[ng.length - 2].deger;
    if (fark !== 0) destek.push({ etiket: "Net varlık", deger: `${fark > 0 ? "+" : "−"}${TL(Math.abs(fark))}`, ton: fark > 0 ? "pos" : "neg" });
  }

  return { manset, destek: destek.slice(0, 3) };
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

// ---- Hesaplar arası transfer eşleştirme (korelasyon) ----
// Ekstrelerden gelen tek-yönlü bacakları (transferAkis) ve manuel iki-yönlü
// transferleri (transferler) birleştirir; çıkan↔giren bacakları farklı
// hesaplarda eşler (aynı tutar, ±4 gün). Eşleşmeyenler "dış" sayılır.
export function transferleriEslestir(findata) {
  const hesaplar = findata?.hesaplar || [];
  const kisiler = findata?.kisiler || [];
  const ad = (id) => hesaplar.find((h) => String(h.id) === String(id))?.ad || "Bilinmeyen hesap";
  const kisiAd = (id) => kisiler.find((k) => String(k.id) === String(id))?.ad || "Kişi";
  const eslesen = [];
  // Manuel transferler her zaman eşleşmiş kabul edilir
  (findata?.transferler || []).forEach((t) =>
    eslesen.push({ fromAd: ad(t.kaynakId), toAd: ad(t.hedefId), miktar: Math.abs(+t.miktar || 0), tarih: t.tarih, kaynak: "manuel", aciklama: "" })
  );
  const legs = (findata?.transferAkis || []).map((l, i) => ({ ...l, _i: i }));
  // Hane kişisi bacakları (kisiId): karşı taraf hane kişisi → doğrudan akış (eşleştirmeye girmez)
  legs.filter((l) => l.kisiId).forEach((l) => {
    const cikis = (+l.miktar || 0) < 0;
    eslesen.push({ fromAd: cikis ? ad(l.hesapId) : kisiAd(l.kisiId), toAd: cikis ? kisiAd(l.kisiId) : ad(l.hesapId), miktar: Math.abs(+l.miktar || 0), tarih: l.tarih, kaynak: "hane", kisiId: l.kisiId, aciklama: l.aciklama || "" });
  });
  // Kendi hesaplar arası bacaklar: çıkan (−) ile giren (+) eşle
  const hesapLegs = legs.filter((l) => !l.kisiId);
  const cikan = hesapLegs.filter((l) => (+l.miktar || 0) < 0);
  const giren = hesapLegs.filter((l) => (+l.miktar || 0) > 0);
  const used = new Set();
  for (const c of cikan) {
    const g = giren.find(
      (x) =>
        !used.has(x._i) &&
        String(x.hesapId) !== String(c.hesapId) &&
        Math.abs(Math.abs(+x.miktar) - Math.abs(+c.miktar)) < 1 &&
        Math.abs(new Date(x.tarih) - new Date(c.tarih)) <= 4 * 86400000
    );
    if (g) {
      used.add(g._i);
      used.add(c._i);
      eslesen.push({ fromAd: ad(c.hesapId), toAd: ad(g.hesapId), miktar: Math.abs(+c.miktar), tarih: c.tarih, kaynak: "ekstre", aciklama: c.aciklama || g.aciklama || "" });
    }
  }
  // Eşleşmeyen = kendi-hesap bacaklarından karşılığı bulunamayanlar (kişi bacakları hariç)
  const eslesmeyen = hesapLegs
    .filter((l) => !used.has(l._i))
    .map((l) => ({ hesapAd: ad(l.hesapId), miktar: +l.miktar || 0, tarih: l.tarih, aciklama: l.aciklama }));
  // Hesap/kişi çiftine göre özet (korelasyon haritası)
  const ozetMap = {};
  eslesen.forEach((e) => {
    const k = `${e.fromAd}→${e.toAd}`;
    (ozetMap[k] = ozetMap[k] || { fromAd: e.fromAd, toAd: e.toAd, toplam: 0, adet: 0, kisiId: e.kisiId }).toplam += e.miktar;
    ozetMap[k].adet++;
  });
  const ozet = Object.values(ozetMap).sort((a, b) => b.toplam - a.toplam);
  eslesen.sort((a, b) => new Date(b.tarih) - new Date(a.tarih));
  return { eslesen, eslesmeyen, ozet };
}

// İçe aktarılan veriyi temizle (temiz baştan içe aktarmak için). Ekstreden
// gelen gelir/gider/taksit, içe aktarılan hesaplar (son4/banka'lı) ve transfer
// akışını siler. ELLE girilen işlem/hesaplar ve abonelikler korunur.
export function iceAktarilaniTemizle(findata) {
  return {
    ...findata,
    gelirler: (findata.gelirler || []).filter((x) => x.kaynak !== "ekstre"),
    giderler: (findata.giderler || []).filter((x) => x.kaynak !== "ekstre" && x.kaynak !== "taksit"),
    hesaplar: (findata.hesaplar || []).filter((h) => !h.son4 && !h.banka),
    transferAkis: [],
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
  maaslar: [], // birinci-sınıf maaş tanımları (bkz. lib/maas.js)
  maasAyarlari: [], // aylık ek ödeme/override/gerçekleşen kayıtları
  hedefDagilim: {},
  ayarlar: { enflasyon: 50, pin: null, tema: "acik", accent: "#C79A4B", kuruldu: false, apiKey: "", aiSaglayici: "anthropic", yerelAdres: "", yerelModel: "", butceDevri: false, bildirimler: false, bildirimGun: 3, paraBirimi: "TRY", sonBildirim: "" },
  kategoriHafiza: {},
  kurlar: null,
  hesaplar: [],
  kisiler: [], // hane kişileri / karşı hesaplar (bkz. lib/kisi.js)
  transferler: [],
  transferAkis: [], // ekstrelerden gelen tek-yönlü transfer bacakları (eşleştirme için)
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
    if (s.pasif) return s; // maaşa dönüştürülmüş şablon → maas.js üretir, burada üretme
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
