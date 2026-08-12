// ============================================================
// Banka hesap ekstresi çözümleyici (XLSX ızgarasından, AI'sız).
// Satır ızgarası → { ozet, islemler }. İşlemleri gelir/gider/transfer/
// odeme (kart borcu) olarak sınıflar. Kendine yapılan transferleri
// (hesaplar arası) tanır; gelir/gider olarak SAYMAZ.
// ============================================================
import { sayiCevir, uid } from "./format.js";

// Türkçe-güvenli küçük harf (İ→i, I→ı) — anahtar kelime eşleştirmesi için
const kucuk = (s) => String(s ?? "").replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();

// IBAN banka kodu (baştaki sıfırlar atılmış) → banka adı. Yaygın TR bankaları.
export const BANKA_KODU = {
  10: "Ziraat Bankası", 12: "Halkbank", 15: "VakıfBank", 32: "TEB", 46: "Akbank",
  59: "Şekerbank", 62: "Garanti BBVA", 64: "İşbankası", 67: "Yapı Kredi", 92: "Citibank",
  99: "ING", 103: "Fibabanka", 108: "Turkish Bank", 111: "QNB Finansbank", 123: "HSBC",
  124: "Alternatif Bank", 125: "Burgan Bank", 134: "DenizBank", 135: "Anadolubank",
  143: "Aktif Bank", 146: "Odeabank", 157: "Enpara", 203: "Albaraka Türk", 205: "Kuveyt Türk",
  206: "Türkiye Finans", 209: "Ziraat Katılım", 210: "Vakıf Katılım", 211: "Emlak Katılım",
};

// IBAN → banka adı (yoksa null). TR IBAN: TR + 2 kontrol + 5 banka kodu + ...
export function ibanBanka(iban) {
  const d = String(iban || "").replace(/[^0-9]/g, "");
  if (d.length < 7) return null;
  const kod = parseInt(d.slice(2, 7), 10);
  return BANKA_KODU[kod] || null;
}

// "13.06.2026 14:00" | "13/06/2026" | Excel seri no → "YYYY-MM-DD" (yoksa null)
export function tarihCevir(raw) {
  const s = String(raw ?? "").trim();
  const m = s.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const n = Number(s.replace(",", "."));
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    // Excel seri no: 25569 = 1970-01-01
    return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  return null;
}

// Bilinen abonelik/dijital servisler → temiz ad (gider'den ayrı "abonelik" olur)
const SERVIS = [
  [/amazon ?prime|amazonprime/, "Amazon Prime"], [/spotify/, "Spotify"], [/netflix/, "Netflix"],
  [/youtube ?premium|youtubepremium/, "YouTube Premium"], [/disney ?\+?|disneyplus/, "Disney+"],
  [/blu ?tv/, "BluTV"], [/exxen/, "Exxen"], [/\bgain\b/, "Gain"], [/mubi/, "MUBI"], [/\btabii\b/, "tabii"],
  [/bein ?connect|beinconnect/, "beIN Connect"], [/s ?sport/, "S Sport+"], [/\btod\b|todtv/, "TOD"],
  [/hbo ?max|hbomax/, "HBO Max"], [/crunchyroll/, "Crunchyroll"], [/icloud|apple ?music|itunes|apple\.com/, "Apple"],
  [/google ?one|google ?storage|youtube ?music/, "Google One"], [/microsoft ?365|office ?365|microsoft365/, "Microsoft 365"],
  [/chatgpt|openai/, "ChatGPT"], [/anthropic|claude\.ai/, "Claude"], [/perplexity/, "Perplexity"], [/midjourney/, "Midjourney"],
  [/storytel|audible/, "Storytel"], [/\bfizy\b/, "fizy"], [/\bmuud\b/, "Muud"], [/deezer/, "Deezer"], [/\btidal\b/, "Tidal"],
  [/game ?pass|xbox/, "Xbox Game Pass"], [/playstation ?plus|ps ?plus|psn/, "PS Plus"], [/nintendo/, "Nintendo"],
  [/linkedin/, "LinkedIn"], [/\bcanva\b/, "Canva"], [/\badobe\b/, "Adobe"], [/dropbox/, "Dropbox"], [/duolingo/, "Duolingo"],
  [/\bmedium\b/, "Medium"], [/\bnotion\b/, "Notion"], [/\bfigma\b/, "Figma"], [/github/, "GitHub"], [/grammarly/, "Grammarly"],
  [/discord ?nitro|nitro/, "Discord Nitro"], [/twitch/, "Twitch"], [/patreon/, "Patreon"], [/telegram ?premium/, "Telegram Premium"],
  [/nordvpn|express ?vpn|surfshark|\bvpn\b/, "VPN"], [/skillshare|udemy|coursera|masterclass/, "Eğitim"],
  [/tv\+|tivibu|vodafone ?tv|d-?smart ?go/, "TV Aboneliği"], [/headspace|calm\b/, "Meditasyon"], [/strava/, "Strava"],
];
// Marka eşleştirmede hem Türkçe (I→ı) hem düz (I→i) normalize dene — yoksa
// İngilizce markalar (SPOTIFY→spotıfy) kaçar.
const ikiyon = (s) => [kucuk(s), String(s ?? "").toLowerCase()];
export function aboneTespit(aciklama) {
  const [a1, a2] = ikiyon(aciklama);
  for (const [re, ad] of SERVIS) if (re.test(a1) || re.test(a2)) return ad;
  return null;
}

// Açıklamadan kategori tahmini (gider/gelir). AI yok; kullanıcı düzeltebilir.
const KATEGORI_DESEN = [
  [/maaş|maas|ücret ödeme|özlük|bordro/, "Maaş"],
  [/migros|bim\b|a101|a 101|şok market|şok mar|carrefour|tarım kredi|file market|hakmar|onur market|macrocenter|metro market|market|bakkal|manav|kasap/, "Market"],
  [/yemeksepeti|getir ?yemek|trendyol ?yemek|migros ?yemek|mcdonald|burger ?king|dominos|popeyes|kfc|starbucks|kahve dünya|gloria jean|caffe|cafe|kafe|restoran|restaurant|lokanta|pizza|burger|döner|doner|fırın|firin|pastane|simit/, "Restoran"],
  [/opet|shell|\bbp\b|petrol ofisi|\bpo\b|total\b|aytemiz|akaryakıt|akaryakit|benzin|motorin|otoyol|köprü|hgs|ogs|otobüs|metro\b|metrobüs|taksi|uber\b|bitaksi|marti|martı|scooter|iett|ego|ulaşım|ulasim|park ?yeri|otopark/, "Ulaşım"],
  [/superonline|türknet|turknet|millenicom|kablonet|d-?smart|digiturk|ttnet|türk ?telekom|turk ?telekom|turkcell|vodafone|netgsm|aydem|\bck\b|akdeniz elektrik|başkent|baskent|enerjisa|gdz|uedaş|uedas|igdaş|igdas|aksa doğal|asat|i̇ski|iski|aski|aská|elektrik|doğalgaz|dogalgaz|\bsu \b|\bsu faturas|internet|fatura|telekom/, "Faturalar"],
  [/eczane|pharma|hastane|medical ?park|acıbadem|acibadem|memorial|medikal|poliklinik|laboratuvar|doktor|diş|\bdent|optik|gözlük/, "Sağlık"],
  [/lc ?waikiki|defacto|de facto|koton|\bmavi\b|boyner|\bzara\b|pull ?& ?bear|bershka|stradivarius|h&m|ayakkabı|\bflo\b|deichmann|sneaks|giyim|tekstil|moda/, "Giyim"],
  [/trendyol|hepsiburada|amazon|\bn11\b|gittigidiyor|teknosa|\bvatan\b|mediamarkt|media ?markt|incehesap|itopya|microsoft|samsung|\bapple\b|yazılım|yazilim/, "Teknoloji"],
  [/sinema|cinemaximum|cineverse|tiyatro|konser|festival|bilet|biletix|passo|\boyun\b|steam|playstation|epic ?games|eğlence|eglence/, "Eğlence"],
  [/spor ?salon|gym\b|fitness|macfit|sporium|mac ?fit|hms\b/, "Spor"],
  // Kira, Gönderim'den ÖNCE gelmeli: "Giden Transfer Ev kirası" → Gönderim değil Kira.
  [/\bkira/, "Kira"],
  [/giden transfer|para ?gönder|para ?gonder|gönderim|gonderim|havale|\beft\b|\bfast\b/, "Gönderim"],
  [/faiz|temettü|temettu|kâr payı|kar payı|kar payi|getiri/, "Faiz/Yatırım"],
  [/vergi|mtv|harç|harc|ceza|trafik ceza|sgk|bağkur|bagkur/, "Vergi/Resmi"],
];
export function kategoriTahmin(aciklama, tip) {
  const [a1, a2] = ikiyon(aciklama);
  for (const [re, kat] of KATEGORI_DESEN) if (re.test(a1) || re.test(a2)) return kat;
  return tip === "gelir" ? "Diğer Gelir" : "Diğer";
}

// Ekstre işleminden FİNANSAL TÜR tahmini (KPI'yı şişirmeyi önler; siniftur.js).
// İade → gideri netler; stopaj → geliri netler; kişiyle EFT (generic) → needs_review.
// null → normal gelir/gider (etiketsiz).
export function finansalTur(aciklama, tip, kategori) {
  const a = kucuk(aciklama);
  if (tip === "gider") {
    if (/stopaj|bsmv|vergi kesint/.test(a)) return "stopaj";
    if (kategori === "Gönderim") return "needs_review"; // kişiye generic gönderim → incelensin
    return null;
  }
  if (tip === "gelir") {
    if (/[iı]ade|geri öde|geri ode|ters kay|refund/.test(a)) return "iade";
    if (/transfer|havale|\beft\b|\bfast\b|gönderim|gonderim/.test(a)) return "needs_review"; // kişiden gelen belirsiz
    return null;
  }
  return null;
}

// Bir işlemi sınıfla: "odeme" (kart borcu) | "transfer" | "gelir" | "gider"
// sahipTokens: hesap sahibinin ad parçaları (kendine transferi yakalamak için)
// ekstreTipi: "kart" ise işaret bazlı (çıkış=ödeme, giriş=harcama)
function siniflandir(islem, aciklama, miktar, sahipTokens, ekstreTipi) {
  const i = kucuk(islem);
  const a = kucuk(aciklama);
  const hepsi = i + " " + a;
  // Kart ekstresi: çıkış (−) = ödeme/iade (borç azaltır) → odeme; giriş (+) = harcama → gider
  if (ekstreTipi === "kart") return miktar < 0 ? "odeme" : "gider";
  // 1) Kredi kartı borç ödemesi → gelir/gider değil. Hesap ekstresinde "kredi
  // kartı" geçen transfer/EFT/ödeme satırı kart borcu ödemesidir (harcama değil).
  if (/kredi kart.*öde|kart ödeme|kart borç|hesaptan ödeme|kredi kart.*tahsil/.test(hepsi)) return "odeme";
  if (/kredi kart/.test(hepsi) && /(öde|borç|tahsil|transfer|eft|fast|virman|gönder|gonder)/.test(hepsi)) return "odeme";
  // 2) Maaş → gelir
  if (/maaş|maas/.test(a)) return "gelir";
  // 3) Vergi/komisyon kesintisi → gider; faiz/temettü geliri → gelir (sıra önemli)
  if (/vergi kesint|bsmv|stopaj|işlem ücret|hesap işletim/.test(a)) return "gider";
  if (/faiz gelir|temettü|temettu|kâr payı|kar payı/.test(a)) return "gelir";
  // 4) Transfer mi? Transfer tipli işlem + kendine/iç hesap işareti; ATM nakit hareketi
  const transferTipi = /transfer|virman|havale|eft|fast|gönder|gonder|para çek|para cek|para yat/.test(hepsi);
  if (/para çekme|para cekme|para yatırma|para yatirma|atm/.test(a)) return "transfer"; // nakit ↔ hesap
  const kendine =
    /virman|hesaptan para transfer|hesaplar aras|kendi hesab|yatırım hesab|yatirim hesab|hesabımdan|hesabıma|hesabimdan|hesabima/.test(a) ||
    (sahipTokens.length >= 2 && sahipTokens.every((t) => a.includes(t)));
  if ((transferTipi && kendine) || /virman/.test(hepsi)) return "transfer";
  // 5) İşaret: çıkış gider, giriş gelir
  return miktar < 0 ? "gider" : "gelir";
}

// Ekstre eksiksiz mi? Bakiye zinciri + işlem adedi + açılış/kapanış kontrolü.
// Bakiye kolonu olan banka ekstrelerinde, ardışık bakiyelerin farkı işlemin
// tutarına eşit olmalı; değilse aradan işlem KAÇMIŞTIR (matematik garanti).
export function ekstreDogrula(ozet, islemler) {
  const uyarilar = [];
  const n = islemler.length;
  // 0) Hiç işlem okunamadıysa: bunu ASLA "eksiksiz" sayma. Bozuk-font/taranmış
  // PDF'lerde (ör. Axess) 0 işlem çıkar; sessiz "tamam:true" yanıltıcıdır.
  if (n === 0) {
    return {
      tamam: false, bakiyeTutarli: null, adetTamam: null, toplamTamam: null,
      kirilma: 0, islemSayisi: 0, beklenenSayisi: ozet?.beklenenSayisi ?? null,
      uyarilar: ["Hiç işlem okunamadı — taranmış/görsel PDF ya da desteklenmeyen biçim olabilir. AI ile tekrar deneyin veya bankadan Excel (.xlsx) indirin."],
    };
  }
  // 1) İşlem adedi (özet belirtmişse)
  let adetTamam = null;
  if (ozet?.beklenenSayisi != null) {
    adetTamam = n === ozet.beklenenSayisi;
    if (!adetTamam) uyarilar.push(`İşlem adedi: ${n} okundu, ekstre ${ozet.beklenenSayisi} diyor — ${ozet.beklenenSayisi - n > 0 ? `${ozet.beklenenSayisi - n} işlem eksik olabilir` : "fazladan satır var"}.`);
  }
  // 2) Bakiye zinciri (tüm satırlarda bakiye varsa)
  let bakiyeTutarli = null, kirilma = 0;
  const bakiyeli = islemler.every((x) => x.bakiye != null && isFinite(x.bakiye));
  if (n >= 2 && bakiyeli) {
    const yeniIlk = String(islemler[0].tarih) >= String(islemler[n - 1].tarih); // en yeni ilk mi?
    bakiyeTutarli = true;
    for (let i = 0; i < n - 1; i++) {
      const a = islemler[i], b = islemler[i + 1];
      // yeniIlk: bakiye[i] = bakiye[i+1] + tutar[i]; eskiIlk: bakiye[i+1] = bakiye[i] + tutar[i+1]
      const beklenen = yeniIlk ? a.bakiye - b.bakiye : b.bakiye - a.bakiye;
      const gercek = yeniIlk ? a.miktar : b.miktar;
      if (Math.abs(beklenen - gercek) > 0.02) { bakiyeTutarli = false; kirilma++; }
    }
    if (!bakiyeTutarli) uyarilar.push(`Bakiye zinciri ${kirilma} noktada tutmuyor — eksik ya da yanlış okunmuş işlem olabilir.`);
  }
  // 3) Açılış + Σtutar = kapanış (varsa)
  let toplamTamam = null;
  if (ozet?.acilisBakiye != null && ozet?.bakiye != null && n) {
    const toplam = islemler.reduce((s, x) => s + (+x.miktar || 0), 0);
    toplamTamam = Math.abs(ozet.acilisBakiye + toplam - ozet.bakiye) <= 0.02;
    if (!toplamTamam) uyarilar.push("Açılış + işlemler ≠ kapanış bakiyesi — bir işlem kaçmış olabilir.");
  }
  const tamam = uyarilar.length === 0 && (bakiyeTutarli !== false) && (adetTamam !== false) && (toplamTamam !== false);
  return { tamam, bakiyeTutarli, adetTamam, toplamTamam, kirilma, islemSayisi: n, beklenenSayisi: ozet?.beklenenSayisi ?? null, uyarilar };
}

// Ekstre özetinden hesabı bul/adlandır (data.hesaplar'a göre, saf).
// Banka adıyla eşleşme YALNIZCA son4 çakışmıyorsa (farklı hesap birleşmesin).
export function hesapBul(data, oz) {
  oz = oz || {};
  const tip = oz.ekstreTipi === "hesap" ? "banka" : "kart";
  const son4 = String(oz.son4 || "").replace(/\D/g, "").slice(-4);
  const banka = (oz.banka || "").trim();
  const mevcut = data?.hesaplar || [];
  let hedef = son4 ? mevcut.find((h) => h.son4 === son4 || (h.ad || "").includes(son4)) : null;
  if (!hedef && banka) hedef = mevcut.find((h) => h.tip === tip && (h.ad || "").toLowerCase().includes(banka.toLowerCase()) && (!son4 || !h.son4 || h.son4 === son4));
  const ad = hedef?.ad || ((banka || (tip === "kart" ? "Kredi Kartı" : "Hesap")) + (son4 ? ` ••${son4}` : ""));
  return { tip, son4, banka, hedef, ad, yeni: !hedef && (son4 || banka) };
}

// Bir ekstrenin seçili kayıtlarını veriye uygula (saf, tek kaynak). Tek ve
// çoklu içe aktarma bunu kullanır. kayitlar: eklenecek gelir/gider/abonelik
// + (akış için) _transfer'li kayıtlar. Dön: { data, ozet }.
export function ekstreUygula(data, ozet, kayitlar) {
  const oz = ozet || {};
  const gelirler = [...(data.gelirler || [])];
  const giderler = [...(data.giderler || [])];
  const abonelikler = [...(data.abonelikler || [])];
  const aboSet = new Set(abonelikler.map((a) => (a.baslik || "").toLowerCase().trim()));
  const giderKat = [...(data.kategoriler?.gider || [])];
  const gelirKat = [...(data.kategoriler?.gelir || [])];
  const gidSet = new Set(giderKat), gelSet = new Set(gelirKat);
  const hesaplar = [...(data.hesaplar || [])];
  const hc = hesapBul({ ...data, hesaplar }, oz);
  let hesapId = hc.hedef?.id || null;
  const borc = parseFloat(oz.donemBorcu), hesB = parseFloat(oz.bakiye);
  const yeniBakiye = hc.tip === "kart" ? (isNaN(borc) ? null : borc) : (isNaN(hesB) ? null : hesB);
  // Kredi kartı ek bilgileri (son ödeme / asgari / limit) — varsa hesaba yaz
  const kartBilgi = {};
  if (hc.tip === "kart") {
    const so = oz.sonOdemeTarihi || oz.sonOdeme;
    if (so) { const iso = /^\d{4}-\d{2}-\d{2}/.test(so) ? String(so).slice(0, 10) : tarihCevir(so); if (iso) kartBilgi.sonOdeme = iso; }
    const as = parseFloat(oz.asgariOdeme ?? oz.asgari);
    if (!isNaN(as)) kartBilgi.asgari = as;
    const kl = parseFloat(oz.krediLimiti);
    if (!isNaN(kl)) kartBilgi.krediLimiti = kl;
  }
  if (hc.son4 || hc.banka) {
    const idx = hc.hedef ? hesaplar.findIndex((h) => h.id === hc.hedef.id) : -1;
    if (idx < 0) { hesapId = uid(); hesaplar.push({ id: hesapId, ad: hc.ad, tip: hc.tip, bakiye: yeniBakiye ?? 0, son4: hc.son4 || undefined, banka: hc.banka || undefined, ...kartBilgi }); }
    else if (yeniBakiye != null || Object.keys(kartBilgi).length) hesaplar[idx] = { ...hesaplar[idx], ...(yeniBakiye != null ? { bakiye: yeniBakiye } : {}), son4: hesaplar[idx].son4 || hc.son4 || undefined, ...kartBilgi };
  }
  let eklenen = 0, aboEklenen = 0;
  (kayitlar || []).forEach((k, i) => {
    if (k._transfer) return;
    if (k.tip === "abonelik") {
      const ad = (k.baslik || "").toLowerCase().trim();
      if (ad && !aboSet.has(ad)) { aboSet.add(ad); abonelikler.push({ id: uid() + 8000 + i, baslik: k.baslik, miktar: k.miktar, kategori: "Abonelik", tarih: k.tarih }); aboEklenen++; }
      return;
    }
    const { _tekrar, _sec, _taksit, _yon, _abonelik, _haneAd, _kesinTekrar, kalemler, tip: t, ...kayit } = k;
    const rec = { id: uid() + i, ...kayit, ...(kalemler ? { kalemler } : {}), hesapId: t === "gelir" || t === "gider" ? hesapId || "" : "" };
    if (t === "gelir") { gelirler.push(rec); if (rec.kategori && !gelSet.has(rec.kategori)) { gelSet.add(rec.kategori); gelirKat.push(rec.kategori); } }
    else { giderler.push(rec); if (rec.kategori && !gidSet.has(rec.kategori)) { gidSet.add(rec.kategori); giderKat.push(rec.kategori); } }
    eklenen++;
  });
  // Transfer bacaklarını sakla (akış/korelasyon) — tekrarsız
  const transferAkis = [...(data.transferAkis || [])];
  let transferN = 0;
  if (hesapId) {
    const anahtar = (l) => `${l.hesapId}|${l.tarih}|${Math.round(l.miktar)}|${(l.aciklama || "").slice(0, 14)}`;
    const mevcut = new Set(transferAkis.map(anahtar));
    (kayitlar || []).filter((k) => k._transfer).forEach((k, i) => {
      const leg = { id: uid() + 7000 + i, hesapId, tarih: k.tarih, miktar: k._yon === "cikis" ? -k.miktar : k.miktar, aciklama: k.baslik, ...(k._kisiId ? { kisiId: k._kisiId } : {}) };
      if (!mevcut.has(anahtar(leg))) { mevcut.add(anahtar(leg)); transferAkis.push(leg); transferN++; }
    });
  }
  const yeni = { ...data, gelirler, giderler, abonelikler, hesaplar, transferAkis, kategoriler: { gider: giderKat, gelir: gelirKat } };
  return { data: yeni, ozet: { hesapAd: hc.ad, yeni: hc.yeni, eklenen, aboEklenen, transferN } };
}

// Mevcut (ekstreden gelmiş) giderleri yeniden sınıflandır: kategori tahminini
// güncelle, dijital abonelikleri tespit edip Abonelikler'e taşı. Elle girilen
// işlemlere (kaynak !== "ekstre") DOKUNMAZ. Geçmişe dönük temizlik içindir.
export function yenidenSiniflandir(findata) {
  const giderler = [];
  const abonelikler = [...(findata?.abonelikler || [])];
  const aboSet = new Set(abonelikler.map((a) => (a.baslik || "").toLowerCase().trim()));
  let kategoriDegisen = 0, aboneEklenen = 0;
  (findata?.giderler || []).forEach((g, i) => {
    if (g.kaynak !== "ekstre") { giderler.push(g); return; } // sadece içe aktarılanlar
    const servis = aboneTespit(g.baslik);
    if (servis) {
      const ad = servis.toLowerCase().trim();
      if (!aboSet.has(ad)) { aboSet.add(ad); abonelikler.push({ id: uid() + i, baslik: servis, miktar: g.miktar, kategori: "Abonelik", tarih: g.tarih }); aboneEklenen++; }
      return; // gider'den çıkar → abonelik oldu
    }
    const yeniKat = kategoriTahmin(g.baslik, "gider");
    if (yeniKat !== g.kategori) { kategoriDegisen++; giderler.push({ ...g, kategori: yeniKat }); }
    else giderler.push(g);
  });
  return { giderler, abonelikler, kategoriDegisen, aboneEklenen };
}

// Ham ızgara (string[][]) → { ozet, islemler }
export function ekstreParse(rows) {
  rows = rows || [];
  // ---- Başlık bloğu: "etiket | değer" satırlarından özet alanları ----
  const ust = {};
  for (const r of rows) {
    const k = kucuk(r?.[0]);
    const v = (r?.[1] ?? "").toString().trim();
    // IBAN değer hangi sütunda olursa olsun tanı (etiket "IBAN"→"ıban" olabilir)
    if (!ust.iban) for (const c of r || []) { const cs = String(c ?? "").trim(); if (/^tr\d{2}[\d ]{12,}$/i.test(cs)) { ust.iban = cs; break; } }
    if (!k || !v) continue;
    if (/ad soyad|ünvan|unvan/.test(k) && !ust.sahip) ust.sahip = v;
    else if (/[iı]ban/.test(k) && !ust.iban) ust.iban = v;
    else if (/hesap numara/.test(k) && !ust.hesapNo) ust.hesapNo = v;
    else if (/hesap tür|hesap turu/.test(k) && !ust.hesapTur) ust.hesapTur = v;
    else if (/tarih aralı|ekstre dönem|ekstre donem/.test(k) && !ust.donem) ust.donem = v;
    else if (/işlem aded|i̇şlem aded|işlem say|hareket say/.test(k) && ust.adet == null) ust.adet = v;
    else if (/dönem başı bakiye|donem bası bakiye/.test(k) && ust.acilis == null) ust.acilis = v;
    // Kredi kartı ekstresi alanları
    else if (/ekstre borcu|dönem borcu|donem borcu|güncel borç|guncel borc/.test(k) && ust.donemBorcu == null) ust.donemBorcu = v;
    else if (/kart numara/.test(k) && !ust.kartNo) ust.kartNo = v;
    else if (/kart limit/.test(k) && !/kullanıl|kullanil/.test(k) && ust.krediLimiti == null) ust.krediLimiti = v;
    else if (/kullanılabilir|kullanilabilir/.test(k) && ust.kullanilabilir == null) ust.kullanilabilir = v;
    else if (/(min|asgari).*(öde|ode)/.test(k) && ust.asgari == null) ust.asgari = v;
    else if (/son ödeme|son odeme/.test(k) && !ust.sonOdeme) ust.sonOdeme = v;
    else if (/dönem sonu bakiye|donem sonu bakiye/.test(k) && ust.sonBakiyeMetin == null) ust.sonBakiyeMetin = v;
  }
  const kart = ust.kartNo != null || ust.donemBorcu != null || /kredi kart/.test(kucuk(ust.hesapTur));
  // Banka markasını metinden yakala (IBAN yoksa, ör. kart ekstresi)
  const MARKA = [[/enpara/, "Enpara"], [/denizbank/, "DenizBank"], [/akbank/, "Akbank"], [/garanti/, "Garanti BBVA"], [/yap[ıi].?kredi/, "Yapı Kredi"], [/ziraat/, "Ziraat Bankası"], [/halkbank/, "Halkbank"], [/vak[ıi]fbank/, "VakıfBank"], [/finansbank|qnb/, "QNB"], [/kuveyt türk|kuveyt turk/, "Kuveyt Türk"]];
  marka: for (const r of rows) for (const c of r || []) { const cs = kucuk(c); for (const [re, ad] of MARKA) if (re.test(cs)) { ust.marka = ad; break marka; } }

  // ---- Tablo başlık satırını bul (Tarih + Tutar içeren satır) ----
  let basIdx = -1;
  const idx = { tarih: -1, islem: -1, aciklama: -1, tutar: -1, bakiye: -1 };
  for (let r = 0; r < rows.length; r++) {
    const hucre = (rows[r] || []).map(kucuk);
    const tarihC = hucre.findIndex((c) => c === "tarih" || c === "i̇şlem tarihi" || c === "işlem tarihi");
    const tutarC = hucre.findIndex((c) => /tutar/.test(c) && !/bakiye/.test(c));
    if (tarihC !== -1 && tutarC !== -1) {
      basIdx = r;
      idx.tarih = tarihC;
      idx.tutar = tutarC;
      idx.islem = hucre.findIndex((c) => /^işlem$|^islem$|işlem tür|islem tur|tür$/.test(c));
      idx.aciklama = hucre.findIndex((c) => /açıklama|aciklama/.test(c));
      idx.bakiye = hucre.findIndex((c) => /bakiye/.test(c));
      break;
    }
  }
  if (basIdx === -1) return { ozet: ozetKur(ust, null, kart), islemler: [] };

  // ---- Veri satırları ----
  const sahipTokens = kucuk(ust.sahip).split(/\s+/).filter((t) => t.length >= 3);
  const islemler = [];
  for (let r = basIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const tarih = tarihCevir(row[idx.tarih]);
    const tutarRaw = idx.tutar >= 0 ? row[idx.tutar] : "";
    if (!tarih || tutarRaw == null || String(tutarRaw).trim() === "") continue;
    const miktar = sayiCevir(tutarRaw);
    if (!miktar) continue;
    const islem = idx.islem >= 0 ? (row[idx.islem] || "") : "";
    const aciklama = idx.aciklama >= 0 ? (row[idx.aciklama] || "") : "";
    const bakiye = idx.bakiye >= 0 && String(row[idx.bakiye] ?? "").trim() !== "" ? sayiCevir(row[idx.bakiye]) : null;
    let tip = siniflandir(islem, aciklama, miktar, sahipTokens, kart ? "kart" : "hesap");
    let kategori = tip === "transfer" || tip === "odeme" ? null : kategoriTahmin(aciklama || islem, tip);
    // Abonelik tespiti: gider bir dijital servise aitse → "abonelik"
    let servis = null;
    if (tip === "gider") { servis = aboneTespit(aciklama || islem); if (servis) { tip = "abonelik"; kategori = "Abonelik"; } }
    islemler.push({
      tarih, miktar, bakiye, tip, kategori, servis,
      islem: String(islem).trim(),
      aciklama: String(aciklama).trim() || String(islem).trim() || "İşlem",
    });
  }

  // ---- Güncel bakiye: en yeni satırın bakiyesi (sıralamayı tespit et) ----
  let sonBakiye = null;
  if (islemler.length) {
    const ilk = islemler[0].tarih, son = islemler[islemler.length - 1].tarih;
    const enYeni = ilk >= son ? islemler[0] : islemler[islemler.length - 1];
    sonBakiye = enYeni.bakiye;
  }

  return { ozet: ozetKur(ust, sonBakiye, kart), islemler };
}

function ozetKur(ust, sonBakiye, kart) {
  const banka = ibanBanka(ust.iban) || ust.marka || null;
  const ibanD = String(ust.iban || "").replace(/[^0-9]/g, "");
  const son4 =
    (kart && ust.kartNo ? String(ust.kartNo).replace(/\D/g, "").slice(-4) : null) ||
    (ibanD ? ibanD.slice(-4) : null) ||
    (String(ust.hesapNo || "").replace(/\D/g, "").slice(-4) || null);
  // Banka: önce "Dönem sonu bakiyesi", yoksa satırlardan hesaplanan son bakiye
  const hesapBakiye = ust.sonBakiyeMetin != null ? sayiCevir(ust.sonBakiyeMetin) : sonBakiye;
  return {
    ekstreTipi: kart ? "kart" : "hesap",
    banka: banka || null,
    son4: son4 || null,
    sahip: ust.sahip || null,
    iban: ust.iban || null,
    donem: ust.donem || null,
    beklenenSayisi: ust.adet != null ? parseInt(String(ust.adet).replace(/[^0-9]/g, ""), 10) || null : null,
    acilisBakiye: ust.acilis != null ? sayiCevir(ust.acilis) : null,
    bakiye: kart ? null : hesapBakiye != null ? hesapBakiye : null,
    donemBorcu: kart && ust.donemBorcu != null ? sayiCevir(ust.donemBorcu) : null,
    krediLimiti: kart && ust.krediLimiti != null ? sayiCevir(ust.krediLimiti) : null,
    kullanilabilirLimit: kart && ust.kullanilabilir != null ? sayiCevir(ust.kullanilabilir) : null,
    asgariOdeme: kart && ust.asgari != null ? sayiCevir(ust.asgari) : null,
    sonOdemeTarihi: kart ? tarihCevir(ust.sonOdeme) || ust.sonOdeme || null : null,
  };
}
