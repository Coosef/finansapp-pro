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
- `request_hash` (**`t2b-v3`**) yapısal JSON serileştirmesidir (ayıraç birleştirme yok) ve
  **yalnız DEĞİŞMEZ istek kimliğini** bağlar: link id + PB user id + telegram_user_id +
  update_id + normalize soru. Ham id'ler saklanmaz, yalnız hash girdisidir. Unlink/relink
  sonrası önceki kullanıcının cache'i asla döndürülemez (fail-closed `409 idempotency_conflict`);
  aynı `update_id` ile farklı soru da fail-closed'dur.
- **T2C.1 — crash/restart güvenli idempotency.** `history`, sağlayıcı, model, AI anahtarı ve
  finans context'i hash'e **girmez**; bunlar *yürütme bağlamıdır* ve aynı Telegram update'i
  yeniden denenirken meşru olarak değişebilir/yok olabilir (gateway belleği RAM-only + 15 dk
  TTL; kullanıcı anahtarını silebilir veya sağlayıcı/model değiştirebilir). `t2b-v2` bunları
  bağladığı için dayanıklı bir DONE cevabı restart sonrası `409 idempotency_conflict` alıp
  **hiç teslim edilemiyordu**. Idempotency = "aynı değişmez Telegram isteği → ilk kabul edilen
  sonuç otoritedir", "retry her çalışma-zamanı ayarını bayt bayt yeniden üretmelidir" değil.
- **Sıralama sözleşmesi:** HMAC → gövde doğrula → link/hesap kimliği → `request_hash` →
  `telegram_ai_results` incele → *süresi dolmamış DONE + hash eşleşmesi ⇒ cache'i HEMEN dön* →
  ancak bundan **sonra** finans verisi, sağlayıcı/model, `ai_keys`, taze-AI kotası ve upstream.
  Böylece DONE bir sonuç, kullanıcı arkasından anahtarını silse / sağlayıcı-model değiştirse
  bile mantıksal TTL dolana kadar teslim edilebilir kalır (`no_key` cache'i maskeleyemez).
  Süresi dolmuş DONE ise taze yürütmedir: yapılandırma o an neyse onunla çalışılır.
- **T2C.2 — dayanıklı upstream deneme bütçesi.** Yeni migration `1735000700_telegram_ai_attempts.js`
  `telegram_ai_results`'a `upstream_attempts` (tamsayı, min 0, required değil) ekler; yalnız şema
  ekler, mevcut `answer`/`request_hash`/`status`/`expires_at` değerlerine dokunmaz, API kuralları
  NULL kalır, idempotenttir ve alanı olmayan eski satırlar 0 okunur. Tarihsel `1735000500`
  **değiştirilmedi**. Sayaç, gerçek bir `$http.send`'den **hemen önce** fence'lenip artırılır ve
  **kalıcılaştırıldıktan sonra** çağrı yapılır (*persist-before-call*): PB artırım ile çağrı
  arasında çökerse bir slot temkinli olarak yanar — bu kabul edilebilir; kabul edilemez olan
  tersidir (çağrı yapılıp sayımın kaybolması → sınırsız ücretli retry). Tavan
  `MAX_UPSTREAM_ATTEMPTS = 2`. `409 processing`, PB iç 5xx, `provider_unavailable`, `rate_limited`
  ve cache hit yolları bu satıra hiç gelmez → **slot tüketmezler**. Yanıt sözleşmesi: gerçek
  geçici hatalarda `502 {error:"upstream",class:"transient",attempt:n}` / `504 {error:"upstream_timeout",attempt:n}`;
  bütçe doluyken sağlayıcı **çağrılmadan** `502 {…,attempt:2,exhausted:true}` (yeni bir upstream
  hatası iddiası değildir). Sayaç kalıcılaştırılamazsa sağlayıcı **çağrılmaz** → `500 attempt_persist_failed`.
  Sayaç `update_id` başına **monotondur**: mantıksal TTL dolduğunda satır taze yürütmeye açılırken
  `upstream_attempts` bilerek sıfırlanmaz — aksi hâlde "aynı update için en fazla 2 ücretli çağrı"
  tavanı TTL beklenerek aşılabilirdi.
- `UPDATE_LEASE_MS` 120 s → 180 s (AI turu için zaman payı). Fencing semantiği değişmedi.

### ⚠️ `ai_keys` şema onarımı (migration `1735000600`)

`1735000200_ai_keys.js`, koleksiyonu PB 0.39.10'da sessizce yok sayılan `fields: [...]`
constructor dizisiyle oluşturuyordu; sonuçta `ai_keys` yalnız `id` alanıyla, indekssiz kaldı.
Bu yüzden bugüne kadar **kullanıcının kaydettiği AI anahtarı hiç saklanmadı** ve `ai.pb.js`
her zaman sessizce env anahtarına düştü (filtre hatası oradaki `try/catch` tarafından
yutuluyordu). `1735000600_ai_keys_repair.js` eksik `user`/`keys` alanlarını ve unique index'i
idempotent biçimde ekler; yalnız `id` taşıyan (bilgi içermeyen) yetim satırları siler.

### ⚠️ `ai.pb.js` handler-scope onarımı (T2B.1)

Şema onarımı sırasında **ikinci, bağımsız** bir kusur çıktı: `ai.pb.js` içindeki `routerAdd()`
handler'ları dosya-seviyesindeki `UST` / `anahtarKaydiBul` / `anahtarBul` sembollerine
başvuruyordu. PocketBase 0.39.10 JSVM'de handler'lar dosya-seviyesi leksik scope'u **görmez**
(aynı kural `tg.pb.js` başında belgeli). Sonuç: `/ai`, `/ai/anahtar` ve `/ai/anahtar/durum`
**her zaman** `400 ReferenceError` dönüyordu — sunucu-taraflı tarayıcı AI proxy'si hiç
çalışmamıştı. (`l-ai-fallback` E2E'si `/pb/ai`'yi tarayıcıda mocklandığı için yakalanmamıştı.)

Onarım **çalışma modeliyle** sınırlıdır: paylaşılan yardımcılar `pb/pb_hooks/ai_lib.js`
modülüne taşındı ve her handler bunu **kendi içinde** `require()` ediyor (`tg.pb.js` deseni).
Ürün davranışı değişmedi: sağlayıcı whitelist'i (`anthropic|gemini|openai`), sabit upstream
URL'leri, anahtar önceliği (**kullanıcı anahtarı → sunucu env fallback**), anahtar değerinin
istemciye asla dönmemesi ve anahtarsızken `503` aynen korunuyor. Ek olarak `keys` JSON alanı
artık normalize ediliyor → bir sağlayıcının anahtarını kaydetmek diğerininkini silmiyor.

**Dağıtım etkisi:** bu iki onarım birlikte deploy edildiğinde tarayıcı `/ai` akışı **ilk kez
gerçekten çalışır** ve kodun zaten amaçladığı sırayı izler: önce kullanıcının kendi anahtarı,
yoksa sunucu env anahtarı. Bugüne kadar hiçbir kullanıcı anahtarı saklanamadığı için pratikte
yalnız env anahtarı devredeydi; kullanıcılar kendi anahtarlarını girmek isteyebilir.

`AI_PROXY_TEST_UPSTREAM` yalnız test içindir: `http://127.0.0.1|localhost|host.docker.internal:<port>`
biçimindeyse kabul edilir, yalnız **origin**'i değiştirir, kanonik sağlayıcı yolunu korur.
Üretimde tanımlı değildir; tanımlı olsa bile hedef loopback ile sınırlıdır (SSRF yüzeyi yok).

### Test-only knob'lar (üretimde YOK)

`TG_AI_TEST_UPSTREAM` yalnız `http://127.0.0.1|localhost|host.docker.internal:<port>`
biçimindeyse kabul edilir ve yalnız upstream **origin**'ini değiştirir (yol korunur);
`TG_AI_TEST_TIMEOUT_SN` yalnız bu test origin'i aktifken ve 1..45 s aralığında geçerlidir.
Üretim PocketBase'inde bu env'ler tanımlı değildir; tanımlı olsalar bile hedef loopback ile
sınırlı olduğundan sağlayıcı whitelist'i zayıflamaz.

## Telegram AI yönlendirme (T2C — gateway)

- `/sor SORUN` ve **bağlı** kullanıcının özel sohbetteki serbest metni AI'ya gider. Bilinen
  komutlar (`/start`, `/help`, `/link`, `/unlink`, `/durum`, `/bakiye`, `/buay`) ve menü
  butonları **deterministik** kalır; **bilinmeyen slash komutu yardım gösterir, AI'ya GİTMEZ**
  (yazım hatası ücretli çağrı üretmez). Bağlı olmayan serbest metin bağlanma yönlendirmesi alır.
- Gateway PB'ye YALNIZ `telegram_user_id`, `update_id`, `question` ve sınırlı `history` gönderir.
  Ham `users.data`, PB user id, link id, e-posta, CAS revision ve AI anahtarı gateway'e **hiç gelmez**.
- **Uç-bazlı timeout:** AI ucu `PB_AI_TIMEOUT_MS` (varsayılan **60 s**); diğer T1 uçları
  `PB_TIMEOUT_MS` (**15 s**) ile **değişmeden** kalır. Update lease 180 s → toplam yolda pay var.
- **Sınırlı upstream retry bütçesi — otorite PB'dir (T2C.2).** Karar, PB'nin bildirdiği dayanıklı
  `attempt`/`exhausted` alanlarına göre verilir; gateway'in `reclaimed` bayrağı bu bütçeyi
  **BELİRLEMEZ**. (`reclaimed=true` yalnız "bu update daha önce bir kez claim edilip başarısız
  oldu" demektir; gerçek bir ücretli çağrı yapıldığını kanıtlamaz — `409 processing`, PB iç 503
  ve upstream öncesi hatalar da `reclaimed` üretir. Eski davranışta bu, `409 processing` sonrası
  **ilk** gerçek `502/transient`'ı yanlışlıkla ikinci başarısızlık sayıyordu.)
  `attempt=1` → `TransientError` (update `failed`, backoff, yeniden claim) · `attempt>=2` veya
  `exhausted:true` → güvenli terminal mesaj + `done` · `409 processing` → **her zaman**
  `TransientError`, bütçe değişmez. `pb.aiAsk()` bu alanları doğrular: `attempt` 1..2 tamsayı,
  `exhausted` varsa yalnız `true`; eksik/bozuk deneme verisi sessizce tahmin edilmez →
  `FatalConfigError`.
- **Konuşma belleği: YALNIZ RAM.** PB koleksiyonu/disk yok. Kullanıcı başına en fazla 2 soru/cevap
  çifti, alan başına 400 code point, 15 dk hareketsizlik TTL'i, global 500 giriş (LRU tahliye).
  Gateway restart'ında **kasıtlı olarak kaybolur**; PB/Telegram'dan yeniden kurulmaz.
  Anahtar yalnız **numerik Telegram id**'dir.
- **Commit sırası:** bellek YALNIZ `updateComplete` başarılı olduktan SONRA işlenir → aynı
  update'in retry'ı aynı `history` ile gider ve konuşma tutarlı kalır. (T2C.1'den itibaren bu
  bir *doğruluk* değil *tutarlılık* güvencesidir: `history` artık `request_hash`'e girmediği
  için farklı/boş geçmişle yapılan retry de dayanıklı DONE cevabına yakınsar.) `/link`,
  `/unlink` ve `not_linked` kimlik sınırlarında bellek temizlenir.
- **PB 5xx sınıflandırması (bilinçli istisna):** PB'nin kendi altyapı hatası (500/503/… —
  restart, unavailable, panic) `TransientError`'dır → offset ilerlemez, update yeniden denenir.
  `502`/`504` ise PB'nin **belgelenmiş** AI protokol kodlarıdır (upstream sağlayıcı hatası /
  timeout) ve router taksonomisine gider. Beklenmeyen 2xx/4xx/502 **şeması** ve HMAC `401/403`
  → `FatalConfigError` (fail-closed). Regresyon: `AI-T2C-23`.
- Bir AI cevabı **tek** Telegram mesajıdır (çoklu-mesaj bölme YOK); PB zaten 3000 code point'te
  sınırlar, gateway `uzunlukGuvenli` ile savunmacı guard uygular.
- AI cevabı **güvenilmez düz metindir**: parse/eval/komut yorumlaması yok, `parse_mode` verilmez.

## Notlar

- İmajlar **multi-arch** (amd64 + arm64) — x86 mini-PC ve ARM (Raspberry vb.) çalışır.
- PocketBase admin şifresini güçlü seç; dışarı açıyorsan Cloudflare Access ek katman olabilir.
