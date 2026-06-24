// ============================================================
// Bulut Senkron — self-hosted PocketBase istemcisi
// ------------------------------------------------------------
// Opt-in: bağlı değilken uygulama tamamen localStorage ile çalışır.
// Bağlıyken findata, PocketBase'deki kullanıcının `data` alanında tutulur.
// Auth + veri PocketBase'de; localStorage çevrimdışı önbellek olarak kalır.
// ============================================================

const ANAHTAR = "finansapp:sync";
const VARSAYILAN_ADRES = "http://localhost:8090";

let _url = "";
let _token = "";
let _userId = "";
let _email = "";

function kaydet() {
  try {
    localStorage.setItem(ANAHTAR, JSON.stringify({ url: _url, token: _token, userId: _userId, email: _email }));
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
  } catch { /* yoksay */ }
  return syncDurum();
}

export function syncDurum() {
  return { url: _url || VARSAYILAN_ADRES, token: _token, userId: _userId, email: _email, bagli: !!(_token && _userId) };
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
  kaydet();
}

// Buluttaki findata'yı çek → { data, updated } | null
export async function pbFindataCek() {
  if (!syncBagliMi()) return null;
  const res = await pbFetch(_url, `/api/collections/users/records/${_userId}`, { headers: { Authorization: _token } });
  if (res.status === 401) { pbCikis(); throw new Error("Oturum süresi doldu, tekrar giriş yap."); }
  if (!res.ok) throw new Error(`Veri çekilemedi (${res.status}).`);
  const d = await res.json();
  return { data: d.data && Object.keys(d.data).length ? d.data : null, updated: d.updated || null };
}

// findata'yı buluta yaz
export async function pbFindataGonder(data) {
  if (!syncBagliMi()) return;
  const res = await pbFetch(_url, `/api/collections/users/records/${_userId}`, {
    method: "PATCH",
    headers: { Authorization: _token, "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  if (res.status === 401) { pbCikis(); throw new Error("Oturum süresi doldu, tekrar giriş yap."); }
  if (!res.ok) throw new Error(`Veri gönderilemedi (${res.status}).`);
}
