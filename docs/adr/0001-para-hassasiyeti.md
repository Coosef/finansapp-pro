# ADR-0001 — Para hassasiyeti: float saklama + kuruş yuvarlama yardımcısı

- **Durum:** Kabul edildi (v1.4.2 hardening turu, item 10)
- **Tarih:** 2026-08-12
- **Bağlam:** finansal doğruluk & veri bütünlüğü hardening turu

## Bağlam

Tüm para tutarları (`miktar`) JavaScript `number` (IEEE-754 çift duyarlıklı
float) olarak saklanır ve PocketBase'de öyle tutulur. Float, ondalık kuruş
değerlerini kesin temsil edemez:

```
0.1 + 0.2 === 0.30000000000000004   // true
19.99 * 40.1 === 801.5990000000001  // kur çevriminde
```

Bu kuruş-altı artıklar iki yerde birikir:

1. **Değer üretimi** — özellikle döviz çevrimi (`tryeCevir`: `tutar * kur`).
   Sonuç kalıcı olarak kayda yazıldığı için artık *veriye* girer.
2. **Toplama** — `hesapla.js` içindeki KPI toplamları yüzlerce kaydı düz
   float ile toplar; her toplamda küçük artık birikebilir.

Mevcut durumda ekran katmanı bu drift'i büyük ölçüde **maskeler**: `TL`
biçimleyicisi `maximumFractionDigits: 0` ile tam liraya yuvarlar. Yani drift
kullanıcıya nadiren görünür; ancak kuruş hassasiyetli görünümlerde (`TL2`) ve
eşitlik karşılaştırmalarında (transfer eşleştirme, çift-sayım guard'ı) yanıltıcı
sonuç doğurabilir.

## Karar

**Bu turda tam sayı (kuruş int, "minor unit") modeline GEÇİLMEYECEK.** Bunun
yerine:

1. Deterministik para yardımcısı eklendi: `src/lib/para.js`
   - `kurus(n)` — 2 ondalığa simetrik (yarım → sıfırdan uzağa) yuvarlama;
     float temsil artığını `Number.EPSILON` ile yutar.
   - `paraTopla(liste, sec?)` — kuruş-güvenli toplam.
   - `paraEsit(a, b)` — yarım kuruş toleranslı eşitlik.
2. Yardımcı, **yeni değer üreten** en kritik noktaya bağlandı:
   `tryeCevir` artık `kurus(t * kur)` döner → yeni döviz kayıtları kuruş-temiz.
3. **Mevcut production kayıtları toplu DÖNÜŞTÜRÜLMEZ.** Şema/veri değişmez.

## Gerekçe

- **Risk/değer dengesi:** Tam kuruş-int migrasyonu her kaydı, PocketBase
  şemasını, tüm hesap/biçim/içe-aktarma yollarını ve geçmiş veriyi etkiler.
  Kendi başına bir sürüm + geri-göç (migration) + doğrulama gerektirir. Bu
  hardening turunun kapsamı "yeni özellik yok, mevcut veriyi koru" idi.
- **Drift bugün büyük ölçüde zararsız:** ekran tam liraya yuvarlıyor; asıl
  görünür risk döviz çevriminin *kalıcılaşması*, o da noktasal olarak kapatıldı.
- **Geriye tam uyum:** `kurus` yalnız artığı temizler; yuvarlak/temiz değerleri
  aynen korur (mevcut testler değişmeden geçer).

## Sonuçlar

- (+) Yeni döviz kayıtları kuruş-temiz; birikimli drift'in ana giriş kapısı kapandı.
- (+) `paraTopla`/`paraEsit` gerektiğinde toplam ve karşılaştırmalarda kullanılabilir.
- (−) `hesapla.js` toplamları hâlâ düz float; kuruş-altı artık teorik olarak
  kalabilir (ekranda tam liraya maskeli). Bilinçli kabul edilen teknik borç.
- Drift testleri: `src/lib/para.test.js` ham float drift'ini ve yardımcının
  düzeltmesini kanıtlar (regresyon koruması).

## Gelecek iş (ertelendi — sonraki sürüm teknik borcu)

Tam "minor unit" (kuruş `integer`) modeline geçiş için ayrı bir sürüm:

1. Yeni alan `miktarKurus: integer` (miktar × 100), kademeli çift-yazma.
2. Tüm hesap/biçim/içe-aktarma yollarını int üzerinden çalıştır.
3. Geçmiş kayıtlar için tek seferlik, yedekli, geri-alınabilir migration.
4. `miktar` (float) alanını schema'dan kaldır.

Bu ADR o sürümde güncellenmeli / yerini yeni bir ADR almalı.
