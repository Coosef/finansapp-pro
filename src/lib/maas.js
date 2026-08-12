// ============================================================
// Maaş modeli (saf, test edilebilir) — birinci sınıf ama GELİR hattını yeniden
// kullanır (geriye dönük uyum + çift-sayım yok).
//
//  findata.maaslar:      [{ id, ad, tutar(base), hesapId, odemeGunu,
//                          kategori:"Maaş", baslangic:"YYYY-MM", aktif }]
//  findata.maasAyarlari: [{ id, maasId, ay:"YYYY-MM", override:null|sayı,
//                          ekOdeme, ekEtiket, gerceklesen:null|sayı, _kaynak }]
//
//  - Baz maaş KALICI. Aylık ek ödeme/override yalnız o ay geçerli.
//  - Her aktif maaş, ödeme günü geçmiş her ay için TEK bir "gelir" satırı üretir
//    (kaynak:"maas", maasId, ay). Ekstre maaşı bu satırı GÜNCELLER, yeni eklemez.
// ============================================================
import { uid } from "./format.js";
import { TUR } from "./siniftur.js";

const iki = (n) => String(n).padStart(2, "0");
const ayParcala = (ay) => String(ay).split("-").map(Number); // [y, m]

// Bir ayda gün sayısı (UTC kararlı)
function ayGunSayisi(ay) {
  const [y, m] = ayParcala(ay);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
// Ödeme tarihi: ay + ödeme günü (ay sonunu aşmaz) → "YYYY-MM-DD"
function odemeTarihi(ay, odemeGunu) {
  const gun = Math.min(Math.max(1, +odemeGunu || 1), ayGunSayisi(ay));
  return `${ay}-${iki(gun)}`;
}
// "YYYY-MM" → bir sonraki ay
function sonrakiAy(ay) {
  const [y, m] = ayParcala(ay);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}

// Bir ayın ayar kaydını bul (yoksa null)
export function maasAyari(findata, maasId, ay) {
  return (findata?.maasAyarlari || []).find((a) => String(a.maasId) === String(maasId) && a.ay === ay) || null;
}

// O ayın beklenen tutarı = (override ?? baz) + ekOdeme
export function beklenenMaas(maas, ayar) {
  const baz = +maas?.tutar || 0;
  const taban = ayar && ayar.override != null ? +ayar.override : baz;
  return taban + (+ayar?.ekOdeme || 0);
}

// Gerçekleşen tutardan ayar üret: baz üstü → ek ödeme; baz altı → override.
// Baz maaş HİÇBİR durumda değişmez.
export function maasAyarHesapla(baz, gerceklesen) {
  const b = +baz || 0, g = +gerceklesen || 0;
  if (g >= b) return { override: null, ekOdeme: Math.round(g - b), gerceklesen: g };
  return { override: g, ekOdeme: 0, gerceklesen: g };
}

// Bir ayın maaş durumu + kırılım (drill-down için)
export function maasDurumu(findata, maasId, ay) {
  const maas = (findata?.maaslar || []).find((m) => String(m.id) === String(maasId));
  if (!maas) return null;
  const ayar = maasAyari(findata, maasId, ay);
  const baz = +maas.tutar || 0;
  const override = ayar && ayar.override != null ? +ayar.override : null;
  const ekOdeme = +ayar?.ekOdeme || 0;
  const ekEtiket = ayar?.ekEtiket || "Ek ödeme";
  const gerceklesen = ayar && ayar.gerceklesen != null ? +ayar.gerceklesen : null;
  const beklenen = beklenenMaas(maas, ayar);
  const efektif = gerceklesen != null ? gerceklesen : beklenen;

  const kalemler = [];
  const tabanTutar = override != null ? override : baz;
  kalemler.push({ etiket: override != null ? "Bu ay maaş" : "Baz maaş", tutar: tabanTutar });
  if (ekOdeme > 0) kalemler.push({ etiket: ekEtiket, tutar: ekOdeme });

  return {
    maasId, ay, ad: maas.ad || "Maaş", baz, override, ekOdeme, ekEtiket, gerceklesen,
    beklenen, efektif, geldiMi: gerceklesen != null, hesapId: maas.hesapId || "",
    odemeGunu: maas.odemeGunu, odemeTarihi: odemeTarihi(ay, maas.odemeGunu), kalemler,
  };
}

// Aktif maaşlar için, ödeme günü geçmiş her ay için gelir satırı türet/güncelle.
// Var olan (kaynak:"maas", maasId, ay) satırı bulunursa tutarı/beklenenMi güncellenir.
export function maasGeliriUret(findata, bugunStr) {
  const bugAy = String(bugunStr).slice(0, 7);
  const gelirler = [...(findata?.gelirler || [])];
  let degisti = false;

  (findata?.maaslar || []).filter((m) => m.aktif !== false).forEach((maas) => {
    let ay = maas.baslangic || bugAy;
    let guard = 0;
    while (ay <= bugAy && guard < 240) {
      guard++;
      const odeme = odemeTarihi(ay, maas.odemeGunu);
      if (odeme <= bugunStr) {
        const ayar = maasAyari(findata, maas.id, ay);
        const beklenen = beklenenMaas(maas, ayar);
        const gerceklesen = ayar && ayar.gerceklesen != null ? +ayar.gerceklesen : null;
        const efektif = gerceklesen != null ? gerceklesen : beklenen;
        const beklenenMi = gerceklesen == null;
        const idx = gelirler.findIndex((g) => g.kaynak === "maas" && String(g.maasId) === String(maas.id) && g.ay === ay);
        if (idx < 0) {
          gelirler.push({ id: uid(), baslik: maas.ad || "Maaş", miktar: efektif, kategori: maas.kategori || "Maaş", tarih: odeme, kaynak: "maas", maasId: maas.id, ay, hesapId: maas.hesapId || "", beklenenMi, otomatik: true });
          degisti = true;
        } else {
          const g = gelirler[idx];
          if (g.miktar !== efektif || g.beklenenMi !== beklenenMi || g.tarih !== odeme || g.hesapId !== (maas.hesapId || "")) {
            gelirler[idx] = { ...g, miktar: efektif, tarih: odeme, hesapId: maas.hesapId || "", beklenenMi };
            degisti = true;
          }
        }
      }
      ay = sonrakiAy(ay);
    }
  });

  return { data: degisti ? { ...findata, gelirler } : findata, degisti };
}

// Ekstre/manuel gerçekleşen maaşı çift-saymadan eşle: ayar kaydını güncelle,
// o ayın maaş gelirini gerçekleşen tutara çek (yeni gelir EKLEMEZ).
export function maasEslestirUygula(findata, maasId, ay, tutar, kaynak = "ekstre") {
  const maas = (findata?.maaslar || []).find((m) => String(m.id) === String(maasId));
  if (!maas) return findata;
  const hesap = maasAyarHesapla(maas.tutar, tutar);
  const ayarlar = [...(findata?.maasAyarlari || [])];
  const idx = ayarlar.findIndex((a) => String(a.maasId) === String(maasId) && a.ay === ay);
  const mevcut = idx >= 0 ? ayarlar[idx] : null;
  const yeniAyar = {
    id: mevcut?.id || uid(), maasId, ay,
    override: hesap.override,
    ekOdeme: hesap.ekOdeme,
    ekEtiket: mevcut?.ekEtiket || (hesap.ekOdeme > 0 ? "Ek ödeme" : ""),
    gerceklesen: hesap.gerceklesen, _kaynak: kaynak,
  };
  if (idx >= 0) ayarlar[idx] = yeniAyar; else ayarlar.push(yeniAyar);
  // Gelir satırını yeniden türet (çift-sayım yok, idempotent)
  const araData = { ...findata, maasAyarlari: ayarlar };
  return maasGeliriUret(araData, `${ay}-31`).data; // ay içi türet (ödeme günü kesin geçmiş)
}

// Bir ekstre/işlem gelir kaydı tanımlı bir maaşa ait olabilir mi? → {maasId, ay} | null.
// Çift-sayımı önlemek için import akışında raw gelir eklemek yerine eşleştirme önerilir.
export function maasEslestirmeAdayi(findata, kayit) {
  if (!kayit || kayit.tip !== "gelir") return null;
  const salaryish = kayit.kategori === "Maaş" || /maaş|maas/i.test(kayit.baslik || "");
  if (!salaryish) return null;
  const ay = String(kayit.tarih || "").slice(0, 7);
  if (!ay) return null;
  const aktifler = (findata?.maaslar || []).filter((m) => m.aktif !== false);
  if (!aktifler.length) return null;
  const tutar = +kayit.miktar || 0;
  // Beklenen tutara en yakın maaşı seç (tek maaşta doğrudan o)
  let sec = aktifler[0], enIyi = Infinity;
  aktifler.forEach((m) => {
    const bek = beklenenMaas(m, maasAyari(findata, m.id, ay));
    const uzaklik = Math.abs(bek - tutar);
    if (uzaklik < enIyi) { enIyi = uzaklik; sec = m; }
  });
  return { maasId: sec.id, ay };
}

// Çift-sayım guard'ı (audit item 3): tanımlı maaşla aynı ayda BENZER tutarlı ELLE
// girilmiş "Maaş" gelirini needs_review'e alır (KPI'dan çıkar) — SİLMEZ, geri
// alınabilir. Gerçek prim/farklı tutar (uzak) dokunulmaz. Idempotent (etiketliyi atlar).
export function maasCiftGuard(findata) {
  const d = findata || {};
  const aktif = (d.maaslar || []).filter((m) => m.aktif !== false);
  const maasGelir = (d.gelirler || []).filter((g) => g.kaynak === "maas");
  if (!aktif.length || !maasGelir.length) return { data: findata, degisti: false };
  const ayBeklenen = {};
  maasGelir.forEach((g) => { ayBeklenen[g.ay] = (ayBeklenen[g.ay] || 0) + (+g.miktar || 0); });
  let degisti = false;
  const gelirler = (d.gelirler || []).map((g) => {
    if (g.kaynak === "maas" || g.tur) return g; // maaş satırı ya da zaten sınıflı
    const salaryish = g.kategori === "Maaş" || /maaş|maas/i.test(g.baslik || "");
    if (!salaryish) return g;
    const bek = ayBeklenen[String(g.tarih || "").slice(0, 7)];
    if (bek && Math.abs((+g.miktar || 0) - bek) <= bek * 0.25) {
      degisti = true;
      return { ...g, tur: TUR.INCELE, incelemeNeden: "Tanımlı maaşla çakışıyor olabilir (çift gelir?)" };
    }
    return g;
  });
  return { data: degisti ? { ...d, gelirler } : findata, degisti };
}

// Mevcut maaş verisinden (sablon/gelir) maaş adayı çıkar — kullanıcı-onaylı migrasyon.
export function maasAdaylari(findata) {
  const d = findata || {};
  const adaylar = [];
  const maasGelirleri = (d.gelirler || []).filter((g) => (g.kategori === "Maaş") || /maaş|maas/i.test(g.baslik || ""));
  // 1) Maaş sablonu (recurring gelir)
  (d.sablonlar || []).filter((s) => s.tip === "gelir" && (s.kategori === "Maaş" || /maaş|maas/i.test(s.baslik || ""))).forEach((s) => {
    const sonGelir = maasGelirleri.slice().sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)))[0];
    const gun = parseInt(String(s.baslangic || sonGelir?.tarih || "").slice(8, 10), 10) || 1;
    adaylar.push({
      ad: s.baslik || "Maaş", tutar: +s.miktar || 0,
      hesapId: sonGelir?.hesapId || "", odemeGunu: gun,
      baslangic: String(s.baslangic || "").slice(0, 7) || undefined,
      kaynakTipi: "sablon", _sablonId: s.id,
    });
  });
  // 2) Sablon yok ama Maaş gelir satırları var → onlardan aday
  if (!adaylar.length && maasGelirleri.length) {
    const son = maasGelirleri.slice().sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)))[0];
    adaylar.push({
      ad: son.baslik || "Maaş", tutar: +son.miktar || 0,
      hesapId: son.hesapId || "", odemeGunu: parseInt(String(son.tarih).slice(8, 10), 10) || 1,
      kaynakTipi: "gelir",
    });
  }
  return adaylar;
}
