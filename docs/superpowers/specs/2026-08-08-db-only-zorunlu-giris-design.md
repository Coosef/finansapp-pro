# FinansApp — Local Mod Kaldırma → DB-only + Zorunlu Giriş

**Tarih:** 2026-08-08
**Durum:** Tasarım onaylandı, plan bekliyor

## 1. Bağlam / Mevcut Durum

Uygulama şu an **iki paralel sistem** çalıştırıyor:

- **Local mod (varsayılan, her zaman açık):**
  - `localStorage["finansapp:users"]` — yerel kullanıcı dizisi, `admin/admin123` ile seed'lenir
  - Şifreler yerelde doğrulanır (düz-metin veya hash — `kripto.js`)
  - findata `localStorage["finansapp:findata:<username>"]` altında saklanır (`storage.js`)
  - Açık oturum `localStorage["finansapp:aktif"]`'te tutulur
  - "Kullanıcılar" tab'ı (`users.jsx`) — admin yerel kullanıcı yönetir
  - Ayarlar'da "Şifre Değiştir" (yerel) kartı
  - `rol/isAdmin` (admin/kullanici) kavramı

- **DB modu (opt-in, Ayarlar → Bulut Senkron):**
  - PocketBase auth (e-posta + şifre), token `localStorage["finansapp:sync"]`
  - findata PB `users.data` (veya ortak hane için `haneler.data`) alanında
  - localStorage çevrimdışı önbellek olarak
  - "Ortak Hane" paylaşımı (`sync.js`)

**Giriş akışı (`girisYap`):** önce yerel kullanıcıları dener; kullanıcı adı `@` içeriyorsa PB'yi dener.

**Kritik hata:** Mevcut `cikisYap` yalnızca ekranı sıfırlıyor, `pbCikis()` çağırmıyor → PB token'ı çıkıştan sonra da localStorage'da kalıyor, yenilemede oturum geri gelebiliyor.

## 2. Hedef

PocketBase **hem kimlik hem veri için tek kaynak** olur. Yerel admin bypass'ı, yerel kullanıcı listesi ve cihazdaki finansal veri tamamen kalkar. Giriş yapmadan uygulamaya girilemez. Giriş sonrası veri **yalnızca DB'den** gelir ve **yalnızca DB'ye** yazılır.

## 3. Kararlar (locked)

| Karar | Seçim |
|---|---|
| Çevrimdışı önbellek | **Saf DB** — cihazda finansal veri tutulmaz |
| Hesap oluşturma | **Giriş ekranında "Kayıt Ol"** (self-servis `pbKayit`) |
| Eski yerel veri | **Temiz başlangıç** — migration yok |
| PB tabanlı şifre değiştir | **Evet, eklenir** |
| Token saklama | **Saklanır** (yenilemede oturum sürer) |
| Gerçek logout | **Eklenir** (`pbCikis` + state temizliği) |
| Idle timeout | **30 dk** (Ayarlar → Güvenlik'ten değiştirilebilir) |
| Mutlak timeout | **7 gün** tavan (aktifken bile) |
| Oturum kapanma uyarısı | **Evet** (~1 dk kala modal) |
| Senkron durum göstergesi | **Evet** (header) |
| Login Giriş/Kayıt cilası | **Evet** |
| Bağlantı kopunca banner | **Evet** |

## 4. Kapsam Dışı (YAGNI)

Şifre sıfırlama e-postası, çoklu-cihaz oturum yönetimi/global token iptali, çevrimdışı yazma kuyruğu (basit retry yeterli), PB rol/izin sistemi, `httpOnly` cookie auth (PB + nginx sunucu değişikliği gerektirir — ayrı iş).

## 5. Mimari Değişiklikler

### 5.1 Kimlik & Oturum (`App.jsx`, `auth.jsx`)

- **Login ekranı (`auth.jsx` `Login`):**
  - E-posta + şifre + **Giriş / Kayıt** geçiş sekmesi
  - `pbGiris(url, email, sifre)` / `pbKayit(url, email, sifre)` doğrudan buradan
  - Sunucu adresi otomatik türetilir (`sync.js` `VARSAYILAN_ADRES`: Docker'da `/pb`, dev'de `localhost:8090`); gizli/gelişmiş "sunucu adresi" alanı isteğe bağlı bırakılır
  - Hata ayrımı: "sunucuya ulaşılamıyor" (bağlantı) ≠ "e-posta/şifre hatalı" (kimlik); yükleniyor durumu; kayıtta şifre ≥ 8 doğrulaması

- **Açılış / oturum geri yükleme (`App.jsx` useEffect):**
  - `syncYukle()` → token var mı?
  - Token varsa: `pbHaneBul()` → `pbFindataCek()` ile oturumu geri yükle; aktif kullanıcı `syncDurum().email`'den kurulur
  - Token geçersizse (401): `pbCikis()` → Login
  - Token yoksa: Login
  - **Not:** `finansapp:aktif` okuması/yazması tamamen kaldırılır — oturum artık yalnızca PB token'ından (`finansapp:sync`) türer

- **`girisYap` (App.jsx):** Yalnızca PB yolu kalır. Yerel kullanıcı eşleştirme, düz-metin şifre doğrulama ve hash yükseltme mantığı silinir. Aktif kullanıcı objesi: `{ username: email, ad: email.split("@")[0], bulut: true }` — `rol` yok.

### 5.2 Veri Akışı (Saf DB) (`App.jsx`)

- **`setFindata`:** `storage.set("findata:...")` çağrıları silinir. Değişiklik yalnızca bellekte (`setFindataState`) tutulur + debounce (1500ms) ile `pbFindataGonder`.
- **Session restore & giriş:** findata yalnızca `pbFindataCek()`'ten gelir; localStorage findata okuma yolları silinir.
- **`storage.js`:** Dosya kalır ama artık yalnız `users`/`findata` için kullanılan yerler kalktığından uygulama kodunda çağrılmaz olur. (Silmeye gerek yok; ileride gerekebilir — ama importlar temizlenir.)

### 5.3 Oturum Güvenliği (yeni modül: `src/lib/oturum.js`)

localStorage'da `finansapp:session = { basladi, sonHareket }` tutulur.

- **Idle timeout:** kullanıcı etkileşiminde (`mousedown/keydown/touchstart`, throttle 30sn) `sonHareket` güncellenir. Açılışta + periyodik (60sn) kontrol: `now - sonHareket > T_idle` → otomatik çıkış.
- **Mutlak timeout:** `now - basladi > T_abs` → çıkış (aktif olsa bile).
- **Varsayılanlar:** `T_idle = 30 dk`, `T_abs = 7 gün`. `T_idle` Ayarlar → Güvenlik'ten seçilir (15/30/60 dk / Kapalı), `findata.ayarlar.oturumIdleDk` altında.
- **Uyarı modalı:** kapanmaya ~60sn kala "Oturumun kapanmak üzere — devam et?" modalı; "Devam Et" → `sonHareket` yenilenir, "Çıkış" → hemen logout.
- **Gerçek logout:** `onLogout` → `pbCikis()` (token + hane bilgisi temizlenir) + `finansapp:session` silinir + React state sıfırlanır. Mevcut üç çıkış tetikleyicisi (Profil kartı, mobil menü, komut paleti) buna bağlanır.

### 5.4 Şifre Değiştir — PB tabanlı (`sync.js` + `settings.jsx`)

- `sync.js`'e `pbSifreDegistir(oldPassword, newPassword)` eklenir: PB `PATCH /api/collections/users/records/:id` ile `{ oldPassword, password, passwordConfirm }`. PB yeni token döndürürse saklanır.
- `settings.jsx` `SifreKart` yerelden PB'ye taşınır: mevcut şifre + yeni şifre (≥ 8) + tekrar. Yerel `kripto` doğrulaması kalkar.

## 6. Kaldırılanlar

- `src/features/users.jsx` — **silinir**
- Ayarlar'da **Kullanıcılar** kartı ve `isAdmin` gate — kalkar
- `App.jsx`: `kullanicilar`/`setKullanicilar`/`kullanicilariKaydet`/`onUsersChange`, `users` prop'u, `rol/isAdmin`, `aktifKaydet` (finansapp:aktif) — kalkar
- `kripto.js` importları (`sifreHashle/sifreDogrula/sifreHashliMi`) App/settings/users'tan kalkar. **Dosya kalır** (`sifrele/coz` yedek şifreleme için duruyor + testleri var).
- `finansapp:users`, `finansapp:findata:*`, `finansapp:aktif` anahtarları artık yazılmaz. (İlk açılışta eski anahtarları temizleyen tek seferlik bir `localStorage.removeItem` bloğu eklenir — temiz başlangıç.)

## 7. "Hane" tab'ının onarımı (`household.jsx`)

Yerel `users` + `storage` döngüsü kalkar (DB-only'de yerel kullanıcı/findata yok → tab kırılırdı). Tab artık **mevcut (paylaşılan) `findata`** içindeki `hane` işaretli gelir/giderleri özetler: hane geliri / gideri / dengesi + kategori dağılımı. Kişi-başı katkı bölümü kaldırılır (tek paylaşılan blob'da kişi ayrımı yok); üye yönetimi zaten Ayarlar → Ortak Hane'de. `Hane` prop'u `users` almaz, yalnız `findata` alır.

## 8. Ayarlar Sadeleşmesi (`settings.jsx`)

- **BulutKart → "Hesap & Ortak Hane":** giriş/kayıt formu kalkar (zaten girişlisin). Bağlı hesap özeti + "Şimdi Senkronla" + Ortak Hane (oluştur / katıl / ayrıl) kalır. "Bağlantıyı Kes" kaldırılır (çıkış = logout ile birleşir).
- **ProfilKart:** çıkış → tek "gerçek logout".
- **GuvenlikKart:** PIN'e ek olarak **Idle timeout süresi** seçimi (15/30/60 dk / Kapalı) eklenir.
- **SifreKart:** PB tabanlı şifre değiştirme (bkz. 5.4).

## 9. UX Geliştirmeleri

1. **Senkron durum göstergesi (header):** `setFindata` sonrası durum — `kaydediliyor…` (debounce sırasında), `✓ kaydedildi` (gönderim başarılı), `⚠ bağlantı yok — yeniden deneniyor` (hata). Header'da mevcut ikon grubuna küçük bir gösterge.
2. **Bağlantı-kopması banner'ı:** `pbFindataGonder`/`pbFindataCek` art arda başarısızsa üstte ince kalıcı şerit; bağlantı gelince kaybolur.
3. **Retry:** gönderim hatasında son anlık görüntü pencere odağında (`focus`) + kısa aralıkla yeniden denenir. Bellekteki state korunur.
4. **Login cilası:** Giriş/Kayıt sekmeli tek ekran, ayrık hata mesajları, yükleniyor durumu, kayıt şifre doğrulaması.
5. **Oturum uyarı modalı:** bkz. 5.3.

## 10. Kenar Durumlar & Hata Yönetimi

- **Girişte PB erişilemez:** `pbFetch` net hata fırlatır → Login'de "Sunucuya ulaşılamadı" gösterilir; giriş başarısız.
- **Oturum içi yazma hatası:** toast + banner + retry (yukarıda). Veri bellekte durur, bağlantı gelince akar.
- **Token süresi dolar (401):** `pbCikis()` → Login'e düşülür, "Oturum süresi doldu" mesajı.
- **Hane 404/403:** mevcut `pbFindataCek` davranışı korunur (kişisele düşer).
- **Idle/mutlak timeout:** otomatik logout; uyarı modalı ile kullanıcı önceden bilgilendirilir.

## 11. Test Planı

- Oturum akışı: geçerli token → restore + `pbFindataCek` çağrısı; geçersiz token → `pbCikis` + Login.
- `setFindata` **localStorage'a yazmaz** (yalnız `pbFindataGonder`) doğrulaması.
- Logout `pbCikis` çağırır ve `finansapp:session`'ı siler.
- `oturum.js`: idle/mutlak timeout hesabı (sahte saat ile), uyarı eşiği.
- `pbSifreDegistir`: doğru payload, hata yolları.
- Repurpose Hane özeti: `hane` işaretli toplamlar doğru.
- `users.jsx` testleri (varsa) kalkar. Mevcut 132 lib testi etkilenmemeli.

## 12. Migration / Temizlik Notu

Temiz başlangıç: mevcut yerel veri **taşınmaz**. İlk açılışta `finansapp:users`, `finansapp:aktif` ve `finansapp:findata:*` anahtarları tek seferlik temizlenir. `finansapp:sync` (token) ve `finansapp:tema` (tema tercihi) korunur — bunlar finansal veri değil.
