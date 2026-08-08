# FinansApp Pro 💰

Türkçe, çok özellikli **kişisel finans yönetim uygulaması** — React + Vite.
Gelir/gider takibi, yatırım portföyü, bütçe & hedefler, analiz, raporlama ve
(isteğe bağlı) yapay zekâ asistanı. **DB-only:** giriş zorunludur; tüm veri kendi
sunucundaki **PocketBase**'de tutulur (tarayıcıda finansal veri saklanmaz).

> Tüm özelliklerin ve mimarinin detaylı dökümü: **[SPEC.md](./SPEC.md)**

---

## Hızlı Başlangıç (yerel — Windows / Mac / Linux)

Gereksinim: **Node.js 18+** ([nodejs.org](https://nodejs.org)) ve çalışan bir **PocketBase**
(uygulama DB-only'dir — kimlik ve veri PocketBase'den gelir).

```bash
npm install        # bağımlılıkları kur (ilk seferde)

# PocketBase'i :8090'da ayağa kaldır (ayrı terminal). En kolayı, repodaki pb imajı:
docker build -t finansapp-pb ./pb
docker run -d --name finansapp-pb -p 8090:8090 -v finansapp_pb:/pb_data finansapp-pb \
  serve --http=0.0.0.0:8090 --dir=/pb_data --migrationsDir=/pb_migrations --hooksDir=/pb_hooks

npm run dev        # geliştirme sunucusu → http://localhost:5173  (/pb → localhost:8090)
```

1. `http://localhost:8090/_/` → PocketBase **superuser**'ı oluştur (ilk açılışta sorar).
2. `http://localhost:5173` → giriş ekranında **Kayıt** ile ilk hesabını aç (e-posta + en az
   8 karakter şifre), sonra giriş yap. Giriş zorunludur.

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

## Docker / CasaOS ile çalıştırma (self-host)

Frontend + PocketBase (DB + auth + senkron) + isteğe bağlı sunucu-taraflı AI proxy — tek portta (8080).

```bash
cp .env.example .env            # ANTHROPIC_API_KEY (opsiyonel) + TZ
docker compose up -d --build    # → http://localhost:8080
```

PocketBase, nginx tarafından same-origin `/pb` altında proxy'lenir (CORS/IP ayarı yok).
CasaOS kurulumu, ilk çalıştırma, AI proxy, Cloudflare Tunnel ve yedekleme için: **[DEPLOY.md](./DEPLOY.md)**.

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

- Tüm finansal veri **PocketBase**'de (kendi sunucun) tutulur; tarayıcıda yalnızca oturum
  token'ı ve tema tercihi kalır. Aynı hesapla girdiğin her cihazda veriler senkron.
- **Rapor** sekmesinden JSON yedek alıp geri yükleyebilir, CSV/PDF dışa aktarabilirsin.
- Sunucu yedeği: `pb_data` volume snapshot'ı veya PocketBase admin → Backups (bkz. DEPLOY.md).

---

## Teknoloji

- **React 18** + **Vite 5** (bundler/dev server)
- Harici UI/grafik kütüphanesi **yok** — tüm grafikler elle SVG
- Backend: **PocketBase** (kimlik + veri + senkron); istemci `src/lib/sync.js` üzerinden konuşur
- AI: Anthropic Claude Messages API (kendi anahtarın veya sunucu-taraflı proxy)

Lisans: kişisel kullanım.
