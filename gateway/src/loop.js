// ============================================================
// Poll döngüsü — durable state/claim/lease/complete + AÇIK HATA TAKSONOMİSİ (R1).
// "N denemede done" YOK. Sınıf davranışı belirler:
//   FatalConfigError     → complete YOK, yukarı fırlat → süreç fail-closed exit.
//   TransientError       → complete(failed) (offset İLERLEMEZ) + üst döngüde bounded backoff.
//   PermanentUpdateError → complete(done) (yalnız teslim-edilemez gibi ispatlı sınıf).
//   UserInputError       → güvenli yanıt gönder → başarılı gönderim → done.
// SIRALAMA (R6): Telegram'ın döndürdüğü sıra AYNEN korunur (client sort YOK, max() YOK).
// Bir update done/permanent olmadan (failed/busy) sonrakine GEÇİLMEZ → offset atlanmaz.
// ============================================================
import { offsetSayi } from "./telegram.js";
import { isle } from "./router.js";
import { FatalConfigError, TransientError, PermanentUpdateError, UserInputError, LeaseConflictError } from "./errors.js";

// Tek update: claim → işle → complete. Dönüş: {done|duplicate|busy|permanent|failed(+transient)}.
export async function updateIsle(u, deps) {
  const { pb, tg } = deps;
  const uid = u.update_id;
  const tgid = u.message && u.message.from ? u.message.from.id : "";
  const kind = u.message ? "message" : "other";

  const c = await pb.updateClaim(uid, tgid, kind); // Transient/Fatal → yukarı (poll/backoff/exit)
  if (!(c.json && c.json.claimed)) {
    if (c.json && c.json.duplicate) return { duplicate: true }; // zaten done → güvenle ilerle
    return { busy: true };                                       // in-flight lease → ilerleme yok
  }
  const leaseToken = c.json.lease_token;
  // Bu update DAHA ÖNCE claim edilip başarısız olmuş ve yeniden claim edilmiş mi?
  // T2C.2: bu YALNIZCA genel dayanıklı-update teşhisi içindir. Ücretli AI upstream retry
  // bütçesini BELİRLEMEZ — o bütçenin otoritesi PB'deki `upstream_attempts` sayacıdır
  // (bkz. router.js aiIsle). `reclaimed` gerçek bir sağlayıcı çağrısı yapıldığını kanıtlamaz.
  const reclaimed = !!(c.json && c.json.reclaimed);
  try {
    const sonuc = await isle(u, { ...deps, reclaimed });   // reply (yan etki)
    await pb.updateComplete(uid, leaseToken);              // done → next_offset = uid + 1
    // T2C: konuşma belleği YALNIZ dayanıklı complete BAŞARILI olduktan SONRA işlenir → aynı
    // update'in retry'ı AYNI history ile gider, konuşma tutarlı kalır. (T2C.1: bu bir tutarlılık
    // güvencesidir; request_hash history'yi bağlamadığı için farklı history idempotency'yi
    // BOZMAZ.) Bellek best-effort RAM durumudur: hatası tamamlanmış update'i GERİ ALMAZ.
    sonrasiUygula(sonuc, deps);
    return { done: true };
  } catch (e) {
    return await hataYonet(e, u, uid, leaseToken, deps);
  }
}

// Router'ın döndürdüğü complete-sonrası yan etkileri uygular (şimdilik yalnız AI bellek commit'i).
function sonrasiUygula(sonuc, deps) {
  const a = sonuc && sonuc.afterComplete;
  if (!a || a.type !== "ai_memory_commit" || !deps.aiHafiza) return;
  try { deps.aiHafiza.isle(a.tgid, a.q, a.a); } catch (_) { /* best-effort RAM durumu */ }
}

// Hata sınıfına göre tamamlama kararı.
async function hataYonet(e, u, uid, leaseToken, deps) {
  const { pb, tg } = deps;
  if (e instanceof FatalConfigError) throw e; // → fail-closed exit (offset dokunulmaz)

  // F1: complete 409 (fencing kaybı) — done DEĞİL, offset varsayımı YOK, complete(failed)
  // DENENMEZ (lease bizde değil). failed döner → batch durur → bounded backoff (üst döngü).
  if (e instanceof LeaseConflictError) return { failed: true, transient: e };

  if (e instanceof UserInputError) {
    // Güvenli deterministik yanıt; başarılı gönderim → done. Gönderim hatası → alt sınıfa düş.
    try {
      if (u.message && u.message.chat) await tg.sendMessage(u.message.chat.id, e.safeText);
      await pb.updateComplete(uid, leaseToken);
      return { done: true, userInput: true };
    } catch (e2) { return await hataYonet(e2, u, uid, leaseToken, deps); }
  }
  if (e instanceof PermanentUpdateError) { // teslim edilemez / güvenle yok say → done
    try { await pb.updateComplete(uid, leaseToken); return { permanent: true }; }
    catch (e2) { return await hataYonet(e2, u, uid, leaseToken, deps); } // complete hatası da sınıflandırılır
  }
  // TransientError (veya beklenmeyen) → failed; offset İLERLEMEZ. complete(failed) de başarısızsa
  // lease expiry reclaim eder. Backoff üst döngüde (transient geri döner).
  try { await pb.updateComplete(uid, leaseToken, true); } catch (_) { /* lease expiry */ }
  return { failed: true, transient: e instanceof TransientError ? e : new TransientError(String(e && e.message || e)) };
}

// Tek poll turu. Dönüş: { adet, islenmis, transient }. stateGet/getUpdates hataları yukarı fırlar.
export async function pollOnce(deps) {
  const { pb, tg, pollTimeout = 25, pollLimit = 50, signal } = deps;
  const st = await pb.stateGet();                       // {next_offset} | Transient/Fatal throw
  const offset = offsetSayi(st.next_offset);
  const updates = await tg.getUpdates({ offset: offset == null ? undefined : offset, timeout: pollTimeout, limit: pollLimit, signal });

  let islenmis = 0, transient = null;
  for (const u of updates || []) {                      // R6: DÖNDÜĞÜ SIRA — sort YOK
    if (signal && signal.aborted) break;                // shutdown → yeni update'e başlama
    const r = await updateIsle(u, deps);
    if (r.done || r.permanent) islenmis++;
    if (r.failed) { transient = r.transient; break; }   // tamamlanmayanın ötesine geçme + backoff sinyali
    // F3: busy (aktif/stale lease) → sıra korunur, sonraki update İŞLENMEZ ve üst döngü
    // bounded backoff uygular (temiz poll gibi reset YOK) → hot-loop yok, keyfi skip yok.
    if (r.busy) { transient = new TransientError(`update ${u.update_id} claim busy (aktif lease)`); break; }
  }
  return { adet: (updates || []).length, islenmis, transient };
}

// Sürekli döngü. FatalConfigError → yukarı (index fail-closed exit). Transient → bounded backoff.
export async function runLoop(deps) {
  const { log, dur = () => false, backoff, signal } = deps;
  while (!dur()) {
    try {
      const r = await pollOnce(deps);
      if (r && r.transient) {                            // per-update geçici hata → backoff (reset YOK)
        const ms = backoff ? await backoff.wait(r.transient.retryAfterMs != null ? r.transient.retryAfterMs : null) : 0;
        log && log(`geçici işlem hatası: ${r.transient.message} · ${Math.round((ms || 0) / 1000)}s backoff`);
      } else if (backoff) { backoff.reset(); }           // temiz poll → backoff sıfırla
    } catch (e) {
      if (e instanceof FatalConfigError) throw e;        // → fail-closed exit
      if (signal && signal.aborted) break;               // shutdown sırasında abort → temiz çık
      const ra = e instanceof TransientError ? e.retryAfterMs : null;
      const ms = backoff ? await backoff.wait(ra) : await new Promise((r) => setTimeout(r, 3000));
      log && log(`geçici poll hatası: ${e.message} · ${Math.round((ms || 0) / 1000)}s backoff`);
    }
  }
}
