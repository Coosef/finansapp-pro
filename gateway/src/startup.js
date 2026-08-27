// R3: FAIL-CLOSED preflight. Long-poll'dan ÖNCE + healthy heartbeat'ten ÖNCE:
//   Telegram getMe → geçersiz token (401) FatalConfigError
//   PB state/get   → HMAC 401/403 FatalConfigError; EXACT 200 + geçerli shape zorunlu
// Herhangi biri başarısız → throw → süreç nonzero exit (geçersiz kimlikte sonsuz retry YOK).
import { FatalConfigError } from "./errors.js";

export async function preflight({ pb, tg, signal }) {
  await tg.getMe(signal);                                  // FatalConfigError (401) | TransientError
  const st = await pb.stateGet();                          // FatalConfigError (HMAC) | TransientError
  if (!st || typeof st.next_offset === "undefined") throw new FatalConfigError("PB state/get geçersiz yanıt şekli");
  return true;
}
