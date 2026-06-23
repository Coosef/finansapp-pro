# FinansApp Pro — Özellik & Mimari Dökümü

Bu belge, projenin **tüm özelliklerini, veri modelini ve teknik kararlarını** kayıt
altına alır. Eski tek dosyalık prototip (`_referans/finans-app-pro-v4.jsx`) referans
olarak saklanır; bu proje onun temiz, modüler ve gerçekten çalışan yeniden yazımıdır.

---

## 1. Genel Bakış

Türkçe, koyu temalı, **çok kullanıcılı kişisel finans yönetim uygulaması**.
React + Vite ile yazıldı; tüm veriler tarayıcıda (localStorage) tutulur.
Yapay zekâ özellikleri (asistan, fiş/ekstre okuma, doğal dil giriş, içgörü, fiyat
çekme) kullanıcının kendi Anthropic API anahtarıyla çalışır.

---

## 2. Sekmeler & Özellikler (11 üst sekme)

İlgili ekranlar birleştirildi; bazıları içinde **alt sekmeli** (segmented `SubNav`) gezinme var.

| Sekme | Açıklama |
|------|----------|
| 📊 **Panel** | Hızlı ekle (doğal dil + ses), 4 özet kart, acil fon kapsamı, net varlık geçmişi, nakit akış tahmini, yaklaşan ödemeler, olağandışı harcama tespiti, AI içgörü, aylık gelir/gider grafiği, bütçe durumu *(sadeleştirildi: portföy/varlık görselleri Yatırım'a taşındı)* |
| 💬 **Asistan** | Verilere bakarak cevap veren sohbet botu (AI) |
| 💳 **İşlemler** | *Alt sekmeli:* **Gider** (fiş kalemleri, kaynak etiketleri) · **Gelir** · **Abonelik** (+ AI tasarruf denetimi) |
| 👛 **Hesaplar** | Nakit/banka/kredi kartı/birikim hesapları; varlık-borç-net özeti |
| 📈 **Yatırım** | Kripto/altın/döviz/hisse/fon/BES; canlı fiyat, nominal & reel (enflasyon düzeltmeli) K/Z, günlük/haftalık değişim, hedef dağılım, **portföy büyümesi + varlık dağılımı** (Panel'den taşındı) |
| 🎯 **Bütçe & Hedef** | *Alt sekmeli:* kategori bütçeleri · zarf bütçe · hedefler (birikim/borç) · tekrarlayanlar · rozetler + tasarruf meydan okumaları |
| 🔬 **Analiz** | *Alt sekmeli:* dönem karşılaştırma · **görseller** (Sankey + ısı haritası) · birikim simülasyonu · borç hesaplayıcı · enflasyon aşındırma |
| 📅 **Takvim** | Aylık takvim; gün bazında gelir/gider/abonelik |
| 🏠 **Hane** | "Hane" işaretli tüm kullanıcı işlemlerini birleştiren ortak bütçe |
| 📦 **Veri** | *Alt sekmeli:* **İçe Aktar** (fiş/ekstre OCR) · **Rapor & Yedek** (CSV, PDF, JSON yedek/geri yükle, AI rapor) |
| ⚙️ **Ayarlar** | PIN, enflasyon, döviz kuru, kategori hafızası, otomatik kurallar, tema/renk, **AI anahtarı + model**; admin için en altta **Kullanıcı Yönetimi** |

**Diğer:** Onboarding sihirbazı, 4 haneli PIN kilidi, çoklu arka plan tonu (koyu/gece/antrasit),
8 vurgu rengi, kategori hafızası (öğrenen otomatik kategori önerisi).

### Tasarım & Tema
- **Renk:** Zümrüt & Altın — marka zümrüt yeşili (#10B981), vurgu altın (#EAB308). Eski indigo
  kayıtlı accent otomatik zümrüt'e eşlenir.
- **Stil:** Koyu + camsı (glassmorphism) kartlar, accent'e göre arka plan parıltısı, akıcı geçiş/animasyonlar.
- **Gezinme:** Masaüstünde sol kenar menü; mobilde üst bar + sabit alt sekme çubuğu (Panel/İşlemler/Yatırım/Asistan/Daha) + "Daha" alt sayfası. `prefers-reduced-motion` desteklenir.

---

## 3. Veri Modeli (`bosVeri()` — `src/lib/finance.js`)

Her kullanıcının verisi `localStorage` anahtarı `finansapp:findata:<username>` altında:

```js
{
  gelirler:     [{ id, baslik, miktar, kategori, tarih, hane?, otomatik?, kaynak? }],
  giderler:     [{ ...gelir alanları, kalemler?: [{ ad, miktar, fiyat }] }],
  abonelikler:  [{ id, baslik, miktar, kategori, tarih }],
  yatirimlar:   [{ id, tip, ad, sembol, adet, alisFiyati, alisTarihi,
                   guncelFiyat, oncekiFiyat?, gecmis: [{ tarih, deger }] }],
  butceler:     { [kategori]: limit },
  hedefler:     [{ id, ad, tip:"birikim"|"borc", hedefTutar, mevcutTutar, aylikKatki }],
  sablonlar:    [{ id, tip, baslik, miktar, kategori, frekans, baslangic, sonUretilen, hane? }],
  hedefDagilim: { [varlikTipi]: yuzde },
  ayarlar:      { enflasyon, pin, tema, accent, kuruldu, apiKey, model },
  kategoriHafiza: { [anahtar]: kategori },
  kurlar:       { usd, eur, tarih } | null,
  hesaplar:     [{ id, ad, tip, bakiye }],
  zarflar:      { [kategori]: tahsis },
  kurallar:     [{ id, tip, kelime, tutarUstu, kategori, mesaj }],
  meydanOkumalar: [{ id, ad, hedefGun, baslangic }],
  netGecmis:    []
}
```

Kullanıcı listesi: `finansapp:users` → `[{ username, sifre, rol, ad }]`.
Şema göçü: her okumada `{ ...bosVeri(), ...kayıtlı }` ile eksik alanlar otomatik dolar.

### Önemli iş mantığı
- **`tekrarlariUret`**: Her girişte, vadesi gelmiş tekrarlayan şablonlardan gerçek
  kayıt üretir (haftalık×4.33 / aylık / yıllık).
- **`kurallariUygula`**: Yeni gelir/gidere başlık-kelime veya tutar eşiğine göre
  otomatik kategori atar ya da uyarı verir.
- **`rozetleriHesapla`**: 8 rozet (ilk işlem, 10+ işlem, ilk yatırım, çeşitlilik,
  hedef, bütçe, milyonluk net, birikim hesabı).
- **Reel getiri**: `guncelDeger / (1+enflasyon)^yıl` ile enflasyon düzeltmeli K/Z.

---

## 4. Mimari (modül haritası)

```
src/
├── main.jsx                # React giriş noktası
├── App.jsx                 # Kimlik doğrulama + sekme yönlendirme + ortak hesaplamalar
├── index.css               # Reset + koyu tema
├── lib/
│   ├── constants.js        # Renkler (C), font (F), stiller, alan sabitleri
│   ├── format.js           # TL/tarih biçimleme, uid, JSON/sayı ayrıştırma
│   ├── storage.js          # localStorage adaptörü (window.storage yerine)
│   ├── finance.js          # Veri modeli + saf finansal mantık
│   └── ai.js               # Anthropic API istemcisi + fiyat/kur çekme
├── components/
│   ├── ui.jsx              # Field, Toggle, Card, Btn, Modal, Stat, ProgressBar...
│   └── charts.jsx          # Sparkline, BarChart, Donut, Sankey, ısı haritası (SVG)
└── features/               # Her sekme/alan ayrı dosya
    ├── auth.jsx            # Login, PinGate, Onboarding
    ├── dashboard.jsx       # Panel + Hızlı Ekle + alt kartlar
    ├── assistant.jsx       # Sohbet asistanı
    ├── investments.jsx     # Yatırımlar + modal
    ├── accounts.jsx        # Hesaplar
    ├── transactions.jsx    # Gelir/Gider/Abonelik listeleri + işlem modalı
    ├── planning.jsx        # Bütçe, zarf, hedef, tekrar, başarım
    ├── analysis.jsx        # Karşılaştırma & simülasyonlar
    ├── visuals.jsx         # Sankey + ısı haritası sayfası
    ├── calendar.jsx        # Takvim
    ├── household.jsx       # Hane bütçesi
    ├── importing.jsx       # Fiş/ekstre içe aktarma
    ├── report.jsx          # Rapor & yedek
    ├── settings.jsx        # Ayarlar (PIN, AI anahtarı, kurallar, tema...)
    └── users.jsx           # Kullanıcı yönetimi
```

---

## 5. Yapay Zekâ Entegrasyonu (`src/lib/ai.js`)

İki sağlayıcı; Ayarlar → Yapay Zekâ'dan seçilir (`configureAI(ayarlar)` ile tek noktadan
yapılandırılır). Tek ortak çağrı `claudeCall(messages, useSearch)` — mesajlar Anthropic
biçiminde tutulur, yerel sağlayıcı için OpenAI biçimine çevrilir.

**A) Anthropic Claude (bulut)** — `POST api.anthropic.com/v1/messages`
- Başlıklar: `x-api-key`, `anthropic-version: 2023-06-01`,
  `anthropic-dangerous-direct-browser-access: true`
- Model: `claude-opus-4-8` (varsayılan), `claude-sonnet-4-6`, `claude-haiku-4-5`
- Web arama: `web_search_20260209` (fiyat/kur); görsel/PDF: `image`/`document` blokları

**B) Yerel model (ücretsiz, anahtarsız)** — OpenAI-uyumlu `…/v1/chat/completions`
- **Ollama** (varsayılan `http://localhost:11434/v1`) ve **LM Studio**
  (`http://localhost:1234/v1`) ve "Özel" adres
- Mesajlar OpenAI biçimine çevrilir; görsel → `image_url` (vision modeli gerekir)
- Sınır: **PDF** ve **web arama (fiyat/kur)** yerelde yok. Tarayıcı→yerel istek
  CORS gerektirir: Ollama `OLLAMA_ORIGINS=*`, LM Studio sunucu ayarında CORS açık
- Ayarlar'da **"Bağlantıyı Test Et"** butonu (`testAIBaglanti`)

**Kripto fiyatı:** CoinGecko (anahtarsız, CORS açık) — her iki sağlayıcıda da AI'a
düşmeden çalışır. **Elle fiyat:** her yatırım kartından girilebilir (AI gerekmez).

**Hazır değilse** AI özellikleri zarifçe devre dışı; takip/bütçe/grafik/rapor/yedek
tam çalışır.

> ⚠️ **Güvenlik notu:** Anthropic anahtarı tarayıcıya yazılır → yerel/kişisel kullanım
> içindir. Yerel model seçilirse anahtar/ücret yoktur. Çok kullanıcılı/üretim için
> bulut anahtarını sunucuda tutan bir proxy gerekir.

---

## 6. Orijinalden Yapılan Değişiklikler

| Sorun (orijinal) | Çözüm (bu proje) |
|---|---|
| `window.storage` (sandbox-özel, tarayıcıda yok) | `src/lib/storage.js` — localStorage adaptörü |
| `claudeCall` anahtarsız/CORS'suz, çalışmaz | `src/lib/ai.js` — anahtar + tarayıcı başlığı + zarif hata |
| Build altyapısı yok (tek `.jsx`) | Vite + React projesi, `npm run dev`/`build` |
| 859 satır tek dosya | ~20 modüle bölünmüş temiz yapı |
| `web_search_20250305` (eski araç) | `web_search_20260209` (güncel) |
| Sabit `claude-sonnet-4-6` | Ayarlardan seçilebilir, varsayılan Opus 4.8 |

---

## 7. Ek Özellikler & Sınırlamalar

**Sonradan eklenenler:**
- **Düzenleme/undo/filtre:** kayıt düzenleme (✎), silmede geri-al, listelerde arama+kategori/ay filtresi
- **Yerel AI:** Ollama / LM Studio (OpenAI-uyumlu), anahtarsız/ücretsiz
- **PWA:** `vite-plugin-pwa` (manifest + service worker) → telefona kurulabilir, çevrimdışı çalışır
- **Özel kategoriler:** Ayarlar → Kategoriler; bütçe/zarf/kural/işlem otomatik uyum
- **Hesap–işlem bağlantısı:** gelir/gider'e hesap seç → bakiye ekle/düzenle/sil/geri-al'da tutarlı güncellenir (kredi kartında borç yönü)

**Bilinen sınırlamalar / gelecek:**
- **Güvenlik:** Şifre/PIN düz metin, "çok kullanıcı" aynı tarayıcıda — gerçek izolasyon yok
  (gerçek çok kullanıcı için backend + DB + auth gerekir).
- **Anthropic anahtarı tarayıcıda** — üretim için sunucu proxy'si önerilir (yerel model bu sorunu yaşamaz).
- Otomatik testler henüz yok. İsteğe bağlı: masaüstü (Tauri) paketleme, çoklu para birimi.
