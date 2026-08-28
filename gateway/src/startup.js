// R3: FAIL-CLOSED preflight. Long-poll'dan ÖNCE + healthy heartbeat'ten ÖNCE:
//   Telegram getMe → geçersiz token (401) / webhook conflict (409) FatalConfigError
//   PB state/get   → HMAC 401/403 FatalConfigError; EXACT 200 + geçerli shape zorunlu
// F4: geçici (ağ/5xx/429) başlangıç hatası FATAL DEĞİLDİR — süreç ayakta kalır, bounded
// exponential backoff ile preflight TEKRARLANIR; shutdown AbortSignal'a saygı duyar.
// FatalConfigError (config/token/HMAC/webhook-conflict) → derhal yukarı → nonzero exit.
// "Hazır" heartbeat preflight TAM başarana kadar BAŞLATILMAZ (index.js sıralaması).
import { FatalConfigError, TransientError } from "./errors.js";

export async function preflight({ pb, tg, signal }) {
  await tg.getMe(signal);                                  // FatalConfigError (401/409) | TransientError
  const st = await pb.stateGet();                          // FatalConfigError (HMAC) | TransientError
  if (!st || typeof st.next_offset === "undefined") throw new FatalConfigError("PB state/get geçersiz yanıt şekli");
  return true;
}

// F4: preflight'ı geçici hatalarda bounded backoff ile tekrarla.
// Dönüş: true = başarı; false = shutdown sinyali (temiz çıkış). Fatal → throw (fail-closed).
export async function preflightBekle({ pb, tg, signal, backoff, log }) {
  while (true) {
    if (signal && signal.aborted) return false;            // F4-05: kapanış → temiz çık
    try {
      await preflight({ pb, tg, signal });
      return true;
    } catch (e) {
      if (e instanceof FatalConfigError) throw e;          // config/token/HMAC → derhal fatal
      if (signal && signal.aborted) return false;          // abort kaynaklı hata → temiz çık
      const ra = e instanceof TransientError ? e.retryAfterMs : null;
      const ms = await backoff.wait(ra);                   // bounded — sonsuz hızlı döngü YOK
      log && log(`preflight geçici hata: ${e.message} · ${Math.round((ms || 0) / 1000)}s sonra tekrar`);
    }
  }
}
