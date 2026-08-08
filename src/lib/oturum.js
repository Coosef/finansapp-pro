// ============================================================
// Oturum zaman aşımı — istemci tarafı güvenlik katmanı
// ------------------------------------------------------------
// PB token'ı localStorage'da kalır (yenilemede oturum sürsün diye). Bunun
// üstüne uygulama seviyesinde iki zaman aşımı ekliyoruz:
//   • idle (hareketsizlik): son etkileşimden itibaren T_idle dk
//   • mutlak: oturum başından itibaren en fazla T_abs gün (aktifken bile)
// Süre bilgisi finansapp:session = { basladi, sonHareket } altında tutulur.
// Fonksiyonlar test edilebilirlik için `now`'ı parametre alır.
// ============================================================

const ANAHTAR = "finansapp:session";
const DK = 60 * 1000;
const GUN = 24 * 60 * 60 * 1000;

export const IDLE_VARSAYILAN_DK = 30; // Ayarlar → Güvenlik'ten değişir
export const MUTLAK_GUN = 7;          // sabit tavan
export const UYARI_ESIK_MS = 60 * 1000; // kapanmaya ~1 dk kala uyar

function oku() {
  try { return JSON.parse(localStorage.getItem(ANAHTAR) || "null"); }
  catch { return null; }
}
function yaz(s) {
  try { localStorage.setItem(ANAHTAR, JSON.stringify(s)); }
  catch { /* private mode vb. yoksay */ }
}

// Yeni oturum (giriş anında): sayaçları sıfırla
export function oturumBaslat(now = Date.now()) {
  const s = { basladi: now, sonHareket: now };
  yaz(s);
  return s;
}

// Yenilemede: var olan oturumu sürdür (basladi korunur), yoksa başlat
export function oturumSurdur(now = Date.now()) {
  const s = oku();
  if (s && typeof s.basladi === "number") { s.sonHareket = now; yaz(s); return s; }
  return oturumBaslat(now);
}

// Kullanıcı etkileşimi — hareketsizlik sayacını sıfırlar
export function oturumDokun(now = Date.now()) {
  const s = oku();
  if (!s || typeof s.basladi !== "number") return;
  s.sonHareket = now;
  yaz(s);
}

export function oturumTemizle() {
  try { localStorage.removeItem(ANAHTAR); }
  catch { /* yoksay */ }
}

// Durum değerlendirmesi.
//   idleDk <= 0 → hareketsizlik zaman aşımı kapalı (yalnız mutlak tavan geçerli)
// Döner: { gecerli, sebep, kalanMs }  sebep: "idle" | "mutlak" | "yok" | null
export function oturumDurum(idleDk = IDLE_VARSAYILAN_DK, now = Date.now()) {
  const s = oku();
  if (!s || typeof s.basladi !== "number") return { gecerli: false, sebep: "yok", kalanMs: 0 };

  const idleKalan = idleDk > 0 ? (s.sonHareket + idleDk * DK) - now : Infinity;
  const mutlakKalan = (s.basladi + MUTLAK_GUN * GUN) - now;

  if (mutlakKalan <= 0) return { gecerli: false, sebep: "mutlak", kalanMs: 0 };
  if (idleKalan <= 0) return { gecerli: false, sebep: "idle", kalanMs: 0 };

  return { gecerli: true, sebep: null, kalanMs: Math.min(idleKalan, mutlakKalan) };
}
