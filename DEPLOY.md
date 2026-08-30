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

## Telegram Finance Gateway imajı (opsiyonel bileşen)

Telegram entegrasyonu ayrı bir konteyner olarak çalışır ve **ayrı** bir iş akışıyla yayınlanır
(`.github/workflows/gateway-publish.yml`; frontend/PB matrisinden bağımsız):

```
ghcr.io/coosef/finansapp-tg-gateway     # multi-arch: linux/amd64 + linux/arm64
```

- **Dağıtım otoritesi manifest digest'idir**; compose'da `latest` DEĞİL, `@sha256:…` kullan.
- Zorunlu çalışma-zamanı ayarları: `TG_BOT_TOKEN` (veya `TG_BOT_TOKEN_FILE`),
  `TG_GATEWAY_SECRET` (veya `TG_GATEWAY_SECRET_FILE`), `PB_URL` (PocketBase kökü, ör.
  `http://finansapp-pb:8090` — `/pb` eki YOK). `NODE_ENV`, `TZ`, `HEARTBEAT_FILE` imajda gömülü.
- PocketBase tarafı `TG_GATEWAY_SECRET` ve `TG_PAIRING_PEPPER` bekler (her ikisi de `_FILE`
  biçimini destekler).
- Gateway **dışarı port açmaz**, webhook kullanmaz (yalnız giden long-poll), non-root (uid 1000)
  çalışır ve heartbeat healthcheck'i vardır. Tek replika olmalıdır.

## Telegram AI (T2B — PocketBase servis ucu)

- Yeni servis ucu: `POST /api/tg/service/ai` (gateway HMAC v1 ile çağırır; tarayıcı `/ai`
  ucu **değişmedi**). Yalnız **metin** döner; ham `users.data`, PB id, e-posta veya AI anahtarı
  gateway'e gitmez.
- Kimlik bilgisi kaynağı **yalnız** ilgili kullanıcının `ai_keys` kaydıdır. Telegram AI için
  `ANTHROPIC_API_KEY`/`GEMINI_API_KEY`/`OPENAI_API_KEY` env fallback'i ve legacy
  `users.data.ayarlar.apiKey` **kullanılmaz**; anahtar yoksa `409 provider_unavailable/no_key`.
- Sağlayıcı whitelist'i: `anthropic`, `gemini`, `openai` (URL'ler sabit → SSRF yok). Yerel
  sağlayıcılar (`ollama`/`lmstudio`/`ozel`) sunucudan erişilemez → `409 .../local_only`.
- Yeni koleksiyon `telegram_ai_results`: response-loss/idempotency için cevap saklar (tüm API
  kuralları `null`). Soru metni, konuşma geçmişi, finans context'i, Telegram id ve PB id
  **saklanmaz**. İki sınır ayrıdır:
  **mantıksal geçerlilik ≤ 30 dk** (`expires_at`; süresi dolmuş satır diskte dursa bile asla
  cache olarak dönmez, taze upstream çağrısı yapılır ve kota tüketir) ·
  **fiziksel silme** bir sonraki `tg_cleanup` turunda (15 dk'da bir) ·
  **nominal disk kalıcılığı ≈ en fazla 45 dk** (30 dk + ≤15 dk cron gecikmesi).
- `request_hash` yapısal JSON serileştirmesidir (ayıraç birleştirme yok) ve çözülen **hesap
  kimliğini** (link id + PB user id) de bağlar → unlink/relink sonrası önceki kullanıcının
  cache'i asla döndürülemez (fail-closed `409 idempotency_conflict`). Ham id'ler saklanmaz.
- `UPDATE_LEASE_MS` 120 s → 180 s (AI turu için zaman payı). Fencing semantiği değişmedi.

### ⚠️ `ai_keys` şema onarımı (migration `1735000600`)

`1735000200_ai_keys.js`, koleksiyonu PB 0.39.10'da sessizce yok sayılan `fields: [...]`
constructor dizisiyle oluşturuyordu; sonuçta `ai_keys` yalnız `id` alanıyla, indekssiz kaldı.
Bu yüzden bugüne kadar **kullanıcının kaydettiği AI anahtarı hiç saklanmadı** ve `ai.pb.js`
her zaman sessizce env anahtarına düştü (filtre hatası oradaki `try/catch` tarafından
yutuluyordu). `1735000600_ai_keys_repair.js` eksik `user`/`keys` alanlarını ve unique index'i
idempotent biçimde ekler; yalnız `id` taşıyan (bilgi içermeyen) yetim satırları siler.

**Dağıtım etkisi:** bu migration'dan sonra tarayıcı `/ai` akışı, kodun zaten amaçladığı gibi
önce kullanıcının kendi anahtarını, yoksa env anahtarını kullanır. `ai.pb.js` kaynağı
değişmedi — değişen tek şey, o davranışın artık gerçekten çalışabilmesidir. Sunucu env
anahtarına bağlı bir kurulumda kullanıcıların kendi anahtarlarını girmesi gerekebilir.

### Test-only knob'lar (üretimde YOK)

`TG_AI_TEST_UPSTREAM` yalnız `http://127.0.0.1|localhost|host.docker.internal:<port>`
biçimindeyse kabul edilir ve yalnız upstream **origin**'ini değiştirir (yol korunur);
`TG_AI_TEST_TIMEOUT_SN` yalnız bu test origin'i aktifken ve 1..45 s aralığında geçerlidir.
Üretim PocketBase'inde bu env'ler tanımlı değildir; tanımlı olsalar bile hedef loopback ile
sınırlı olduğundan sağlayıcı whitelist'i zayıflamaz.

## Notlar

- İmajlar **multi-arch** (amd64 + arm64) — x86 mini-PC ve ARM (Raspberry vb.) çalışır.
- PocketBase admin şifresini güçlü seç; dışarı açıyorsan Cloudflare Access ek katman olabilir.
