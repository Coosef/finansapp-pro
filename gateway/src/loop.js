// ============================================================
// Poll döngüsü — durable state/claim/lease/complete entegrasyonu.
//   1) stateGet → next_offset (T1A: son tamamlanan update_id + 1)
//   2) getUpdates(offset) long-poll
//   3) her update için: claim → işle(reply) → complete(done)  |  hata → complete(failed)
//
// SIRALAMA GARANTİSİ: bir update "done" olarak tamamlanmadıysa (failed/busy), o turda
// SONRAKİLERE GEÇİLMEZ (break). Aksi halde complete(done) next_offset'i ilerletir ve
// tamamlanmayan update KALICI olarak atlanır. Sonraki poll baştan (aynı offset) dener.
// ============================================================
import { offsetSayi } from "./telegram.js";
import { isle } from "./router.js";
import * as M from "./messages.js";

// Tek update: claim → işle → complete. Dönüş: { done|duplicate|busy|failed|poison }.
export async function updateIsle(u, deps) {
  const { pb, tg, poisonSayac, poisonMax = 3, log } = deps;
  const uid = u.update_id;
  const tgid = u.message && u.message.from ? u.message.from.id : "";
  const kind = u.message ? "message" : "other";

  const c = await pb.updateClaim(uid, tgid, kind);
  if (!(c.json && c.json.claimed)) {
    if (c.json && c.json.duplicate) return { duplicate: true }; // zaten done → güvenle ilerle
    return { busy: true };                                       // in-flight lease → ilerleme
  }
  const leaseToken = c.json.lease_token;
  try {
    await isle(u, deps);                        // reply gönderir (yan etki)
    await pb.updateComplete(uid, leaseToken);   // done → next_offset = uid + 1
    poisonSayac && poisonSayac.delete(String(uid));
    return { done: true };
  } catch (e) {
    const n = ((poisonSayac && poisonSayac.get(String(uid))) || 0) + 1;
    poisonSayac && poisonSayac.set(String(uid), n);
    if (n >= poisonMax) {
      // Zehirli/kalıcı hata: sonsuz retry yerine done olarak atla + özür.
      log && log(`update ${uid}: ${n}. hata → poison guard, done olarak atlanıyor`);
      try { if (u.message && u.message.chat) await tg.sendMessage(u.message.chat.id, M.hataMesaji()); } catch { /* */ }
      await pb.updateComplete(uid, leaseToken);
      poisonSayac && poisonSayac.delete(String(uid));
      return { poison: true };
    }
    await pb.updateComplete(uid, leaseToken, true); // failed → offset İLERLEMEZ → retry
    return { failed: true };
  }
}

// Tek poll turu. Dönüş: { adet, islenmis }.
export async function pollOnce(deps) {
  const { pb, tg, pollTimeout = 25, pollLimit = 50, kalpAtisi } = deps;
  const st = await pb.stateGet();
  const offset = offsetSayi(st.json && st.json.next_offset);
  const updates = await tg.getUpdates({ offset: offset == null ? undefined : offset, timeout: pollTimeout, limit: pollLimit });
  if (kalpAtisi) kalpAtisi(); // getUpdates döndü → canlıyız

  const sirali = [...(updates || [])].sort((a, b) => a.update_id - b.update_id);
  let islenmis = 0;
  for (const u of sirali) {
    const r = await updateIsle(u, deps);
    if (r.done || r.poison) islenmis++;
    if (r.failed || r.busy) break; // sıra korunur: tamamlanmayanın ötesine geçme
  }
  return { adet: sirali.length, islenmis };
}

// Sürekli döngü — iptal edilene kadar. Hatada kısa geri çekilme (long-poll zaten bekletir).
export async function runLoop(deps) {
  const { log, dur = () => false, bekle = (ms) => new Promise((r) => setTimeout(r, ms)) } = deps;
  const poisonSayac = deps.poisonSayac || new Map();
  while (!dur()) {
    try {
      await pollOnce({ ...deps, poisonSayac });
    } catch (e) {
      log && log(`poll hatası: ${e.message}`); // token/secret içermez
      await bekle(3000); // geçici PB/Telegram hatası → kısa bekle, tekrar dene
    }
  }
}
