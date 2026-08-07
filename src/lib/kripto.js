// ============================================================
// Kripto yardımcıları — Web Crypto (SubtleCrypto)
//   • Parola/PIN hash'leme: PBKDF2-SHA256 + rastgele tuz (geriye uyumlu)
//   • Simetrik şifreleme: AES-GCM (yedek dışa aktarma / at-rest için)
// Saf, test edilebilir; ağ/DOM bağımlılığı yok.
// ============================================================

const enc = new TextEncoder();
const ITER = 150000; // PBKDF2 tur sayısı

function web() {
  const c = (typeof globalThis !== "undefined" && globalThis.crypto) || (typeof crypto !== "undefined" ? crypto : null);
  if (!c || !c.subtle) throw new Error("Web Crypto bu ortamda yok");
  return c;
}

// Büyük dizilerde de güvenli base64 (spread yerine parça parça)
function bufB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
function b64Buf(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function pbkdf2Bits(c, parola, salt, iter, bit = 256) {
  const base = await c.subtle.importKey("raw", enc.encode(parola), "PBKDF2", false, ["deriveBits"]);
  return c.subtle.deriveBits({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, bit);
}

// Sabit-zamanlı string karşılaştırma (zamanlama sızıntısına karşı)
function esitZamanSabit(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---- Parola/PIN hash ----
export function sifreHashliMi(s) {
  return typeof s === "string" && s.startsWith("pbkdf2$");
}

export async function sifreHashle(sifre) {
  const c = web();
  const salt = c.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2Bits(c, sifre, salt, ITER);
  return `pbkdf2$${ITER}$${bufB64(salt)}$${bufB64(bits)}`;
}

// Geriye uyum: saklanan değer hash değilse (eski düz-metin) doğrudan karşılaştırır.
export async function sifreDogrula(girilen, saklanan) {
  if (!sifreHashliMi(saklanan)) return girilen === saklanan;
  try {
    const [, iterStr, saltB64, hashB64] = saklanan.split("$");
    const bits = await pbkdf2Bits(web(), girilen, b64Buf(saltB64), parseInt(iterStr, 10) || ITER);
    return esitZamanSabit(bufB64(bits), hashB64);
  } catch {
    return false;
  }
}

// ---- Simetrik şifreleme (AES-GCM, parola türevli anahtar) ----
async function anahtarTuret(c, parola, salt) {
  const base = await c.subtle.importKey("raw", enc.encode(parola), "PBKDF2", false, ["deriveKey"]);
  return c.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function sifrele(metin, parola) {
  const c = web();
  const salt = c.getRandomValues(new Uint8Array(16));
  const iv = c.getRandomValues(new Uint8Array(12));
  const key = await anahtarTuret(c, parola, salt);
  const ct = await c.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(metin));
  return `aesgcm$${bufB64(salt)}$${bufB64(iv)}$${bufB64(ct)}`;
}

export async function coz(paket, parola) {
  const c = web();
  const [tag, saltB64, ivB64, ctB64] = String(paket).split("$");
  if (tag !== "aesgcm") throw new Error("Geçersiz şifreli paket");
  const key = await anahtarTuret(c, parola, b64Buf(saltB64));
  const pt = await c.subtle.decrypt({ name: "AES-GCM", iv: b64Buf(ivB64) }, key, b64Buf(ctB64));
  return new TextDecoder().decode(pt);
}
