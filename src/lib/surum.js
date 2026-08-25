// ============================================================
// Sürüm bilgisi + güncelleme kontrolü
// SURUM: build'de package.json'dan enjekte edilir (vite define __APP_VERSION__).
// sonSurumKontrol: GitHub main'deki package.json sürümünü çeker; yenisi varsa bildirir.
// ============================================================

/* global __APP_VERSION__, __BUILD_SHA__, __BUILD_TIME__ */
export const SURUM = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

// Build kimliği (stale-client teşhisi). vite define ile enjekte edilir; yoksa fallback.
export const BUILD_SHA = typeof __BUILD_SHA__ !== "undefined" ? __BUILD_SHA__ : "dev";
export const BUILD_TIME = typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "";
export const LOADED_AT = Date.now(); // bu sekmenin bu paketle yüklendiği an (ms)

// Bu sekme bir service worker tarafından kontrol ediliyor mu? (HTTP/LAN'de olmayabilir)
export function swKontrolluMu() {
  try { return typeof navigator !== "undefined" && "serviceWorker" in navigator && !!navigator.serviceWorker.controller; }
  catch { return false; }
}

// Salt-okunur build kimliği anlık görüntüsü (Ayarlar/Hakkında). Token/veri İÇERMEZ.
export function buildKimligi() {
  return { appVersion: SURUM, buildSha: BUILD_SHA, buildTime: BUILD_TIME, loadedAt: LOADED_AT, swControlled: swKontrolluMu() };
}

const REPO = "Coosef/finansapp-pro";
export const SURUM_URL = `https://github.com/${REPO}/releases`;

// semver-benzeri karşılaştırma: a<b → -1, a==b → 0, a>b → 1
export function surumKarsilastir(a, b) {
  const pa = String(a || "0").replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0").replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

// main branch package.json sürümünü çek; yereldden yeniyse güncelleme var.
// Çevrimdışı/hata → null (sessiz). Günde bir çağrılması yeterli.
export async function sonSurumKontrol(mevcut = SURUM) {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${REPO}/main/package.json`, { cache: "no-store" });
    if (!res.ok) return null;
    const pkg = await res.json();
    if (!pkg || !pkg.version) return null;
    return { sonSurum: pkg.version, guncellemeVar: surumKarsilastir(mevcut, pkg.version) < 0 };
  } catch {
    return null;
  }
}
