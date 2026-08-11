# Maaş Sistemi + Finansal Doğruluk + Dashboard Yeniden Mimarisi

Tarih: 2026-08-11
Durum: uygulanıyor (aşamalı, geriye dönük uyumlu, non-destructive)

## Amaç
Uygulamayı "banka hareketi listeleyen panel"den, ekstreleri anlayan, hesaplar
arası ilişkileri doğru kuran, gelir/gideri tek ve tutarlı bir katmandan hesaplayan
ve finansal durumu birkaç saniyede anlatan bir sisteme dönüştürmek. Öncelik: **finansal
doğruluk > veri kaybını önleme > eşleştirme/dedup > transfer/KK çift-sayım > maaş modeli
> ekstre analizi > ortak hesaplama katmanı > dashboard IA > UX > görsel.**

## Mevcut mimari (özet)
Tek `findata` nesnesi (PocketBase senkron). Diziler: `gelirler, giderler, abonelikler,
yatirimlar, hesaplar, transferler, transferAkis, sablonlar, hedefler, butceler,
kategoriler, kategoriHafiza, netGecmis, ayarlar…`. Tüm tutarlar TRY. Saf mantık
`src/lib/*`, ekranlar `src/features/*`.

## Tespit edilen sorunlar
1. **Maaş birinci-sınıf değil.** `kategori:"Maaş"` gelir satırı ve/veya sabit-tutarlı
   `sablon`. Base salary + aylık ek ödeme/override/gerçekleşen ayrımı yok.
2. **Onboarding maaştan otomatik "Banka Hesabım" hesabı üretiyor** (auth.jsx). Maaş
   var olan hesaba bağlanmalı, hesap yaratmamalı.
3. **Recurring income UI'dan tanımlanamıyor** (yalnız işlem "tekrarla" veya onboarding).
4. **Maaş↔ekstre eşleştirme/dedup yok** → manuel maaş + ekstre maaşı çift gelir.
   Generic `tekrarMi` (±0.5₺, ±3g, ilk-6-harf) farklı başlık/tutarı yakalamaz.
5. **Ortak hesaplama katmanı yok.** Aylık gelir/gider/tasarruf ≥6 yerde ayrı toplanıyor;
   **abonelik tutarsız** dahil ediliyor (Panel çıkarır, Analiz/Karne yok sayar). Panel ile
   Analiz farklı "gider" gösterebilir.
6. **Dashboard:** hesap/banka dağılımı yok, "maaş geldi mi/normalden farklı mı" yok, kart
   başına MoM delta yok, sabit/değişken ayrımı yok, **drill-down yok.**
7. (Sağlam, korunacak) Transfer tarafı: `transferAkis` + `transferleriEslestir` +
   kart-ödemesi ("odeme") atlama zaten çift-sayımı önlüyor.

## Tasarım kararları (seçilen yaklaşım + gerekçe)

### A. Ortak hesaplama katmanı — `src/lib/hesapla.js` (Faz 1, en yüksek öncelik)
Tüm ekranların kullandığı **tek** özet fonksiyonu. Kanonik kurallar:
- `donemOzet(findata, donem, bugun)` → `{ gelir, giderKalem, aboneAylik, giderToplam,
  net, tasarrufOrani, kategoriler, onceki, degisim }`.
- **Kanon:** `giderToplam = giderKalem + aboneAylik*(dönemdeki ay sayısı, min 1)`. Abonelik
  aylık tekrar eden giderdir → her ay bir kez sayılır. Ay-bazlı dönemlerde ×1.
- `onceki` = bir önceki eş dönem; `degisim` = kart başına MoM % (gelir/gider/tasarruf/kategori).
- Transfer ve kart-ödemesi gelir/gidere hiç girmez (zaten `gelirler/giderler`de yok).
Panel, Analiz, Rapor, Karne bunu kullanır → tutarlılık garanti. Drill-down aynı filtreli
listeleri kullanır.

### B. Maaş modeli — `src/lib/maas.js` + `findata.maaslar` / `findata.maasAyarlari` (Faz 2)
Birinci-sınıf ama **gelir hattını yeniden kullanır** (geriye dönük uyum + çift-sayım yok).
```
maaslar:      [{ id, ad, tutar(base), hesapId?, odemeGunu, kategori:"Maaş",
                baslangic:"YYYY-MM", aktif }]
maasAyarlari: [{ id, maasId, ay:"YYYY-MM", ekOdeme:0, ekEtiket:"",
                override:null|sayı, gerceklesen:null|sayı, _gelirId?, _kaynak }]
```
- **Beklenen(ay)** = `(override ?? base) + ekOdeme`. Base kalıcı; ek ödeme/override yalnız o ay.
- **Gerçekleşen(ay)** = eşleşen gelir/ekstre tutarı (varsa).
- **Türetme:** maaş her ay TEK bir `gelir` satırı üretir (`kaynak:"maas", maasId, ay`),
  tutarı beklenen (veya eşleşince gerçekleşen). Böylece hesap bakiyesi, dashboard, tüm
  mevcut hesaplamalar değişmeden çalışır. Ekstre maaşı **yeni gelir eklemez**, bu satırı
  günceller → çift-sayım yok.
- **Onboarding düzeltmesi:** maaş girince otomatik hesap YARATMA. Var olan hesabı seçtir;
  yoksa "hesapsız" bırak (kullanıcı Hesaplar'dan ekler).

### C. Maaş↔ekstre eşleştirme + dedup (Faz 4)
İçe aktarımda maaş tipli gelir tespit edilince: aynı ay tanımlı maaşla eşleştirme ÖNER
("Bu işlem Ağustos maaşınız olabilir — 80.000 baz + 15.000 ek ödeme olarak ayır?").
Onayda: raw gelir eklemek yerine o ayın maaş gelirini gerçekleşen=95.000 yapar, ek
ödeme=15.000 kaydeder, `matched` işaretler. Aynı maasId+ay için ikinci gelir eklenmez.

### D. Dashboard IA + drill-down (Faz 5)
- **Hesap/varlık dağılımı** kartı (nakit/banka/yatırım + banka başına bakiye).
- **Maaş durumu** kartı ("Ağustos: geldi 95.000 = 80.000 baz + 15.000 prim" / "bekleniyor").
- Özet kartlarında **açık MoM delta** (gelir/gider/tasarruf).
- **Sabit/değişken gider** + **abonelik toplamı** birinci-sınıf.
- **Drill-down:** özet kart/kategori satırına tıkla → alttaki işlemleri modalde göster
  (ortak katmanın filtreli listesinden).

### E. Ortak filtre altyapısı (Faz 5)
Üst-bar dönem seçici zaten global. Ortak katmana banka/hesap/kategori filtreleri eklenir;
drill-down ve Analiz aynı filtreyi kullanır.

## Geriye dönük uyum & veri güvenliği
- `bosVeri()`ye yeni alanlar (`maaslar:[]`, `maasAyarlari:[]`) — eski yedeklerde otomatik dolar.
- Mevcut maaş verisi (gelir satırı / sablon) **silinmez.** Yeni maaş modeline geçiş
  **kullanıcı onaylı** tek seferlik dönüştürme kartıyla; dönüşünce eski salary-sablon
  `pasif:true` ile durdurulur (tekrarlariUret saygı gösterir) — geri alınabilir.
- Destructive migration yok. Kritik belirsizlikte kullanıcı-onaylı state.

## Test kapsamı
salary calc (base/bonus/override/expected-vs-actual/next-month reset), salary↔statement
matching & dedup (no double count), shared calc consistency (period totals/savings/abonelik/
MoM), internal transfer & CC-payment exclusion (regresyon), migration/backward-compat,
statement re-import dedup. Mevcut 212 test yeşil kalmalı.

## Fazlar
1. Ortak hesaplama katmanı (`hesapla.js`) + testler + ekranları buna bağla.
2. Maaş modeli (`maas.js`) + testler + onboarding auto-hesap düzeltmesi.
3. Maaş & recurring-income UI (hesap seçimli tanım/düzenle).
4. Ekstre↔maaş eşleştirme + dedup (import akışı).
5. Dashboard IA: dağılım, maaş durumu, MoM, drill-down.
6. UX/görsel cila.
7. Tam test + rapor.
```
