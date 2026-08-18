// ============================================================
// Bulut Senkron — self-hosted PocketBase istemcisi
// ------------------------------------------------------------
// Opt-in: bağlı değilken uygulama tamamen localStorage ile çalışır.
// Bağlıyken findata, PocketBase'deki kullanıcının `data` alanında tutulur.
// Auth + veri PocketBase'de; localStorage çevrimdışı önbellek olarak kalır.
// ============================================================

const ANAHTAR = "finansapp:sync";
// Docker/CasaOS'ta PocketBase, nginx tarafından same-origin /pb altında proxy'lenir
// → kullanıcı sunucu IP'si girmez. Dev/dosya modunda localhost:8090'a düşer.
const VARSAYILAN_ADRES =
  typeof location !== "undefined" && /^https?:/.test(location.origin || "")
    ? `${location.origin.replace(/\/+$/, "")}/pb`
    : "http://localhost:8090";

let _url = "";
let _token = "";
let _userId = "";
let _email = "";
let _haneId = ""; // boş = kişisel; dolu = ortak hane modu (veri haneler/{id}'de)
let _haneAd = "";
let _haneKod = "";

function kaydet() {
  try {
    localStorage.setItem(ANAHTAR, JSON.stringify({ url: _url, token: _token, userId: _userId, email: _email, haneId: _haneId, haneAd: _haneAd, haneKod: _haneKod }));
  } catch { /* yoksay */ }
}

// Uygulama açılışında çağrılır: kayıtlı oturumu yükler
export function syncYukle() {
  try {
    const s = JSON.parse(localStorage.getItem(ANAHTAR) || "{}");
    _url = s.url || "";
    _token = s.token || "";
    _userId = s.userId || "";
    _email = s.email || "";
    _haneId = s.haneId || "";
    _haneAd = s.haneAd || "";
    _haneKod = s.haneKod || "";
  } catch { /* yoksay */ }
  return syncDurum();
}

export function syncDurum() {
  return { url: _url || VARSAYILAN_ADRES, token: _token, userId: _userId, email: _email, bagli: !!(_token && _userId), haneId: _haneId, haneAd: _haneAd, haneKod: _haneKod };
}
export function syncBagliMi() {
  return !!(_token && _userId);
}

const temizUrl = (u) => (u || VARSAYILAN_ADRES).trim().replace(/\/+$/, "");

function pbHataMesaji(e, varsayilan) {
  if (e?.message) return e.message;
  const d = e?.data;
  if (d && typeof d === "object") {
    const ilk = Object.values(d)[0];
    if (ilk?.message) return ilk.message;
  }
  return varsayilan;
}

async function pbFetch(url, yol, opts = {}) {
  let res;
  try {
    res = await fetch(temizUrl(url) + yol, opts);
  } catch {
    throw new Error(`Sunucuya ulaşılamadı (${temizUrl(url)}). PocketBase açık ve erişilebilir mi?`);
  }
  return res;
}

// Yeni hesap oluştur ve giriş yap
export async function pbKayit(url, email, password) {
  if (!password || password.length < 8) throw new Error("Şifre en az 8 karakter olmalı.");
  const res = await pbFetch(url, "/api/collections/users/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, passwordConfirm: password }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(pbHataMesaji(e, res.status === 400 ? "Kayıt başarısız (e-posta kullanımda olabilir)." : `Kayıt hatası (${res.status}).`));
  }
  return pbGiris(url, email, password);
}

// Giriş yap → token sakla
export async function pbGiris(url, email, password) {
  const res = await pbFetch(url, "/api/collections/users/auth-with-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(pbHataMesaji(e, "E-posta veya şifre hatalı."));
  }
  const d = await res.json();
  _url = temizUrl(url);
  _token = d.token;
  _userId = d.record?.id || "";
  _email = email;
  kaydet();
  return syncDurum();
}

export function pbCikis() {
  _token = "";
  _userId = "";
  _email = "";
  _haneId = "";
  _haneAd = "";
  _haneKod = "";
  kaydet();
}

// Şifre değiştir (giriş yapılmışken). PB, şifre değişince eski token'ı geçersiz
// kılar → başarıdan sonra yeni şifreyle yeniden giriş yapıp token'ı tazeliyoruz.
export async function pbSifreDegistir(oldPassword, newPassword) {
  if (!syncBagliMi()) throw new Error("Önce giriş yap.");
  if (!newPassword || newPassword.length < 8) throw new Error("Yeni şifre en az 8 karakter olmalı.");
  const res = await pbFetch(_url, `/api/collections/users/records/${_userId}`, {
    method: "PATCH",
    headers: { Authorization: _token, "Content-Type": "application/json" },
    body: JSON.stringify({ oldPassword, password: newPassword, passwordConfirm: newPassword }),
  });
  if (res.status === 401) { pbCikis(); throw new Error("Oturum süresi doldu, tekrar giriş yap."); }
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(pbHataMesaji(e, res.status === 400 ? "Mevcut şifre yanlış olabilir." : `Şifre değiştirilemedi (${res.status}).`));
  }
  // Yeni şifreyle yeniden giriş → geçerli token (mevcut _email ve _url kullanılır)
  await pbGiris(_url, _email, newPassword);
}

// Aktif veri kaydının yolu: ortak hane modundaysa haneler, değilse users
function veriYolu() {
  return _haneId ? `/api/collections/haneler/records/${_haneId}` : `/api/collections/users/records/${_userId}`;
}

// Buluttaki findata'yı çek → { data, updated } | null
// Hane modundayken hane 404 dönerse (silinmiş / çıkarılmışsan) kişisele düşeriz.
export async function pbFindataCek() {
  if (!syncBagliMi()) return null;
  // no-store: reload/focus'ta bayat önbellek dönmesin → conflict tespiti (updated) doğru olsun.
  let res = await pbFetch(_url, veriYolu(), { headers: { Authorization: _token }, cache: "no-store" });
  if (_haneId && (res.status === 404 || res.status === 403)) {
    _haneId = ""; _haneAd = ""; _haneKod = ""; kaydet();
    res = await pbFetch(_url, veriYolu(), { headers: { Authorization: _token }, cache: "no-store" });
  }
  if (res.status === 401) { pbCikis(); throw new Error("Oturum süresi doldu, tekrar giriş yap."); }
  if (!res.ok) throw new Error(`Veri çekilemedi (${res.status}).`);
  const d = await res.json();
  return { data: d.data && Object.keys(d.data).length ? d.data : null, updated: d.updated || null };
}

// findata'yı buluta yaz → { updated } (server revizyon damgası; persistence guard için)
export async function pbFindataGonder(data) {
  if (!syncBagliMi()) return null;
  const res = await pbFetch(_url, veriYolu(), {
    method: "PATCH",
    headers: { Authorization: _token, "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  if (res.status === 401) { pbCikis(); throw new Error("Oturum süresi doldu, tekrar giriş yap."); }
  if (!res.ok) throw new Error(`Veri gönderilemedi (${res.status}).`);
  try { const d = await res.json(); return { updated: d?.updated || null }; } catch { return { updated: null }; }
}

// ============================================================
// Ortak Hane — birden çok kullanıcının aynı veriyi paylaşması
// ============================================================

export function haneModu() { return !!_haneId; }

// Giriş sonrası: kullanıcı bir haneye üye mi? Üyeyse hane moduna geç.
export async function pbHaneBul() {
  if (!syncBagliMi()) return null;
  const res = await pbFetch(_url, `/api/collections/haneler/records?perPage=1&filter=${encodeURIComponent(`members.id ?= "${_userId}"`)}`, { headers: { Authorization: _token } });
  if (!res.ok) { return null; }
  const d = await res.json();
  const h = (d.items || [])[0];
  if (h) {
    _haneId = h.id; _haneAd = h.ad || "Ortak Hane"; _haneKod = h.kod || ""; kaydet();
    return { id: h.id, ad: _haneAd, kod: _haneKod };
  }
  // Üye değil → kişisel mod
  if (_haneId) { _haneId = ""; _haneAd = ""; _haneKod = ""; kaydet(); }
  return null;
}

const kodUret = () => {
  const harf = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // karışabilen 0/O/1/I çıkarıldı
  let k = "";
  for (let i = 0; i < 6; i++) k += harf[Math.floor(Math.random() * harf.length)];
  return k;
};

// Hane oluştur — mevcut findata'yı haneye tohumlar, hane moduna geçer.
export async function pbHaneOlustur(ad, data) {
  if (!syncBagliMi()) throw new Error("Önce bulut hesabına giriş yap.");
  const kod = kodUret();
  const res = await pbFetch(_url, "/api/collections/haneler/records", {
    method: "POST",
    headers: { Authorization: _token, "Content-Type": "application/json" },
    body: JSON.stringify({ kod, ad: ad || "Ortak Hane", data: data || {}, members: [_userId] }),
  });
  if (res.status === 401) { pbCikis(); throw new Error("Oturum süresi doldu, tekrar giriş yap."); }
  if (!res.ok) throw new Error(`Hane oluşturulamadı (${res.status}).`);
  const h = await res.json();
  _haneId = h.id; _haneAd = h.ad || ad; _haneKod = kod; kaydet();
  return { id: h.id, ad: _haneAd, kod };
}

// Davet kodu ile haneye katıl (hook). Sonra hane verisini çekmek arayan tarafa kalır.
export async function pbHaneKatil(kod) {
  if (!syncBagliMi()) throw new Error("Önce bulut hesabına giriş yap.");
  const temiz = (kod || "").trim().toUpperCase();
  if (!temiz) throw new Error("Davet kodu gerekli.");
  const res = await pbFetch(_url, "/api/hane/katil", {
    method: "POST",
    headers: { Authorization: _token, "Content-Type": "application/json" },
    body: JSON.stringify({ kod: temiz }),
  });
  if (res.status === 401) { pbCikis(); throw new Error("Oturum süresi doldu, tekrar giriş yap."); }
  if (res.status === 404) throw new Error("Bu koda sahip bir hane bulunamadı.");
  if (!res.ok) throw new Error(`Haneye katılınamadı (${res.status}).`);
  const h = await res.json();
  _haneId = h.id; _haneAd = h.ad || "Ortak Hane"; _haneKod = temiz; kaydet();
  return { id: h.id, ad: _haneAd };
}

// Haneden ayrıl — kendini üyelerden çıkar, kişisel moda dön.
export async function pbHaneAyril() {
  if (!_haneId) return;
  try {
    const res = await pbFetch(_url, `/api/collections/haneler/records/${_haneId}`, { headers: { Authorization: _token } });
    if (res.ok) {
      const h = await res.json();
      const kalan = (h.members || []).filter((id) => id !== _userId);
      if (kalan.length >= 1) {
        await pbFetch(_url, `/api/collections/haneler/records/${_haneId}`, {
          method: "PATCH",
          headers: { Authorization: _token, "Content-Type": "application/json" },
          body: JSON.stringify({ members: kalan }),
        });
      }
      // kalan 0 ise: son üyesin; kayıt admin'e bırakılır, lokalde kişisele dönülür
    }
  } catch { /* çevrimdışı olsa bile lokalde ayır */ }
  _haneId = ""; _haneAd = ""; _haneKod = ""; kaydet();
}
