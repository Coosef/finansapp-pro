// ============================================================
// Bounded exponential backoff + jitter (R4). 1s→2s→4s→8s→16s→30s(max).
// Başarılı işlem sonrası reset(). sleep/random ENJEKTE edilebilir → deterministik testler.
// TransientError.retryAfterMs verilirse (429) o değer ONURLANDIRILIR (exp yerine).
// ============================================================
export function makeBackoff({ base = 1000, max = 30000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), random = Math.random } = {}) {
  let deneme = 0;
  return {
    get attempt() { return deneme; },
    reset() { deneme = 0; },
    // retryAfterMs verilirse onu bekler; yoksa exp(base*2^n, max) + [0,%25) jitter.
    async wait(retryAfterMs = null) {
      let ms;
      if (retryAfterMs != null && retryAfterMs >= 0) {
        ms = retryAfterMs;
      } else {
        const exp = Math.min(max, base * Math.pow(2, deneme));
        ms = exp + Math.floor(random() * exp * 0.25);
      }
      deneme += 1;
      await sleep(ms);
      return ms;
    },
  };
}
