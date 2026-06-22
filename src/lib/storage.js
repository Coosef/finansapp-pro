// ============================================================
// Depolama katmanı
// ------------------------------------------------------------
// Orijinal uygulama, özel bir sandbox'ın `window.storage` API'sine
// bağlıydı (tarayıcıda mevcut değil). Burada aynı async arayüzü
// localStorage üzerine kuruyoruz; ileride bir backend'e geçilmek
// istenirse yalnızca bu dosya değişir.
//
// API:
//   await storage.get(key)    -> { value: string } | null
//   await storage.set(key, value)
//   await storage.delete(key)
// ============================================================

const PREFIX = "finansapp:";

function safeLocalStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    // private mode vb.
  }
  return null;
}

export const storage = {
  async get(key) {
    const ls = safeLocalStorage();
    if (!ls) return null;
    const raw = ls.getItem(PREFIX + key);
    return raw == null ? null : { value: raw };
  },

  async set(key, value) {
    const ls = safeLocalStorage();
    if (!ls) return;
    ls.setItem(PREFIX + key, value);
  },

  async delete(key) {
    const ls = safeLocalStorage();
    if (!ls) return;
    ls.removeItem(PREFIX + key);
  },
};
