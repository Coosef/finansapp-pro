# FinansApp Pro — Self-Host / CasaOS Dağıtımı

Kendi sunucunda (CasaOS, Docker) çalıştırma rehberi. Uygulama **yalnızca DB (PocketBase)**
ile çalışır: giriş zorunludur, tüm veri **senin sunucunda** tutulur (tarayıcıda finansal
veri saklanmaz). Cihazlar arası senkron, ortak hane ve isteğe bağlı sunucu-taraflı AI.

## Mimari

```
Tarayıcı ──> :8080 (nginx)
              ├─ /            → React arayüzü (statik)
              ├─ /pb/*        → PocketBase (DB + auth + senkron)      [same-origin proxy]
              └─ /pb/ai       → Anthropic proxy (anahtar sunucuda)    [PocketBase hook]

PocketBase → pb_data volume (SQLite, kalıcı)
```

- **Tek dışa açık port: 8080.** PocketBase dışarı port açmaz; nginx `/pb` altında proxy'ler
  → CORS yok, sunucu IP'si girmeye gerek yok.
- İki imaj: `ghcr.io/coosef/finansapp-pro` (frontend) + `ghcr.io/coosef/finansapp-pb`
  (PocketBase; hook + migration gömülü).

## Kurulum — CasaOS (önerilen)

1. CasaOS → **App Store → Custom Install / Import** → `docker-compose.yml`'i yapıştır.
2. (Opsiyonel) `ANTHROPIC_API_KEY` gir → sunucu-taraflı AI (anahtar tarayıcıya gitmez).
3. Kur → `http://<sunucu-ip>:8080`.

## Kurulum — düz Docker

```bash
cp .env.example .env      # ANTHROPIC_API_KEY (opsiyonel) + TZ
docker compose up -d --build
# → http://localhost:8080
```

## İlk çalıştırma

1. **PocketBase admin** oluştur: `http://<sunucu>:8080/pb/_/` (ilk açılışta superuser sorar).
   Migration'lar (users/haneler) otomatik uygulanır.
2. Uygulamayı aç (`:8080`) → giriş ekranında **Kayıt** ile ilk hesabını oluştur (e-posta +
   en az 8 karakter şifre), sonra **Giriş** yap. Giriş zorunludur; veri yalnızca PocketBase'de
   tutulur ve tüm cihazlar arasında senkronlanır.

> **Güvenlik:** Oturum, hareketsizlikte otomatik kapanır (varsayılan 30 dk; Ayarlar →
> Güvenlik'ten değişir) ve en fazla 7 gün sonra yeniden giriş ister. "Çıkış" oturumu
> (token'ı) tamamen kapatır.

## Yapay Zekâ (sunucu proxy)

`ANTHROPIC_API_KEY` verildiyse: uygulamada **Ayarlar → Yapay Zekâ → "Sunucu Proxy"** seç.
Anahtar sunucuda kalır, tarayıcıya asla gitmez. Anahtar boşsa AI çağrıları 503 döner;
takip/bütçe/grafik/rapor tam çalışır. (Alternatif: kendi anahtarınla doğrudan Anthropic,
ya da yerel Ollama/LM Studio.)

## Dışarıdan erişim (Cloudflare Tunnel)

Tüneli **tek origin** olarak `http://localhost:8080`'e yönlendir — hepsi (arayüz, `/pb`,
`/pb/ai`) aynı origin'den çalışır, ek ayar gerekmez. TLS'i Cloudflare üstlenir.

## Veri & Yedek

- Kalıcı veri: `/DATA/AppData/finansapp/pb_data` (SQLite, host bind mount). Konteyner
  silinse de kalır. (Düz Docker'da bu yolu `./pb_data` yapabilirsin.)
- Yedek: (a) `pb_data` klasörünü kopyala, (b) PocketBase admin → Backups,
  (c) uygulama içi **Veri → Rapor → JSON Yedek Al**.

## Güncelleme

```bash
docker compose pull && docker compose up -d      # GHCR'dan yeni imajlar
```

## Notlar

- İmajlar **multi-arch** (amd64 + arm64) — x86 mini-PC ve ARM (Raspberry vb.) çalışır.
- PocketBase admin şifresini güçlü seç; dışarı açıyorsan Cloudflare Access ek katman olabilir.
