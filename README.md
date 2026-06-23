# FinansApp Pro 💰

Türkçe, çok özellikli **kişisel finans yönetim uygulaması** — React + Vite.
Gelir/gider takibi, yatırım portföyü, bütçe & hedefler, analiz, raporlama ve
(isteğe bağlı) yapay zekâ asistanı. Tüm veriler tarayıcında kalır.

> Tüm özelliklerin ve mimarinin detaylı dökümü: **[SPEC.md](./SPEC.md)**

---

## Hızlı Başlangıç (yerel — Windows / Mac / Linux)

Gereksinim: **Node.js 18+** ([nodejs.org](https://nodejs.org))

```bash
npm install        # bağımlılıkları kur (ilk seferde)
npm run dev        # geliştirme sunucusu → http://localhost:5173
```

Tarayıcıda `http://localhost:5173` adresini aç.

**İlk giriş:** kullanıcı `admin` · şifre `admin123`
(Ayarlar → Kullanıcılar'dan yeni kullanıcı ekleyebilir, şifreyi değiştirebilirsin.)

### Üretim derlemesi

```bash
npm run build      # dist/ klasörüne statik site üretir
npm run preview    # üretim derlemesini yerel önizle → http://localhost:4173
```

`dist/` içeriği herhangi bir statik sunucuya (Netlify, Vercel, nginx, GitHub Pages…)
yüklenebilir.

### Testler

```bash
npm test           # çekirdek mantık birim testleri (Vitest)
```

---

## Docker ile çalıştırma

```bash
docker compose up --build      # → http://localhost:8080
```

veya elle:

```bash
docker build -t finansapp .
docker run -p 8080:80 finansapp
```

---

## Yapay Zekâ özelliklerini açma (isteğe bağlı)

Asistan, fiş/ekstre okuma, doğal dil giriş, içgörü ve döviz/altın fiyatı çekme
özellikleri Anthropic Claude ile çalışır:

1. [console.anthropic.com](https://console.anthropic.com) → bir **API anahtarı** oluştur.
2. Uygulamada **Ayarlar → 🤖 Yapay Zekâ** kartına anahtarı yapıştır, modeli seç, kaydet.

Anahtar yalnızca senin tarayıcında saklanır. Anahtar girmezsen AI özellikleri kapalı
kalır; uygulamanın geri kalanı (takip, bütçe, grafik, rapor, yedek) tam çalışır.

> Kripto fiyatları (CoinGecko) anahtar olmadan da çalışır.
>
> ⚠️ API anahtarı tarayıcıya yazıldığı için bu, **kişisel/yerel kullanım** içindir.
> Paylaşılan veya herkese açık bir dağıtımda anahtarı sunucu tarafında tutan bir
> proxy kullanılmalıdır (bkz. SPEC.md §5).

---

## Veri & yedekleme

- Tüm veriler tarayıcının **localStorage**'ında tutulur (`finansapp:` önekiyle).
- **Rapor** sekmesinden JSON yedek alıp geri yükleyebilir, CSV/PDF dışa aktarabilirsin.
- Tarayıcı verisini temizlemek tüm finans verisini siler — düzenli yedek al.

---

## Teknoloji

- **React 18** + **Vite 5** (bundler/dev server)
- Harici UI/grafik kütüphanesi **yok** — tüm grafikler elle SVG
- Depolama: localStorage (tek dosyada soyutlanmış — ileride backend'e geçirilebilir)
- AI: Anthropic Claude Messages API

Lisans: kişisel kullanım.
