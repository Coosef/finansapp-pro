// Merkezi persistence controller — debounce + monotonik revision + single-flight +
// trailing pending write + stale-response guard + explicit flush() + error/pending state.
// React'ten bağımsız düz nesne; App.jsx sürer. Journal (WAJ) ile crash/reload güvenliği.
//
// send(data) → Promise<updated|{updated}>  (pbFindataGonder; yeni server 'updated' döner)
// journal   → { merge(userId,patch,rev,base), ack(userId,rev), clear(userId), get(userId) }
// onStatus(status)  → "kaydediliyor" | "kaydedildi" | "hata"
export function createPersister({ send, journal, onStatus, delay = 1200 }) {
  let userId = null;
  let syncedUpdated = null; // en son ACK'lenmiş / fetch'lenmiş server revizyonu (baseUpdated)
  let rev = 0; // monotonik; her mutation artırır
  let sentRev = 0; // başarıyla gönderilmiş en yüksek rev
  let pendingData = null;
  let inFlight = false;
  let timer = null;
  let status = "kaydedildi";

  const durum = (s) => { status = s; onStatus && onStatus(s); };

  async function _send() {
    if (inFlight || rev <= sentRev) return; // gönderilecek yeni bir şey yok / zaten uçuşta
    inFlight = true;
    const myRev = rev;
    const data = pendingData;
    try {
      const res = await send(data);
      const updated = res && typeof res === "object" ? res.updated : res;
      if (updated) syncedUpdated = updated;
      sentRev = myRev;
      journal.ack(userId, myRev); // pending gitti → ACK sonrası atomik temizlik
      inFlight = false;
      if (rev > sentRev) { _send(); }           // trailing: bu sırada gelen daha yeni değişiklik
      else durum("kaydedildi");
    } catch {
      inFlight = false;
      durum("hata"); // journal KALIR → focus/online retry ile yeniden denenir; app crash etmez
    }
  }

  return {
    // Oturum açılışında bağla: kullanıcı + o anki server revizyonu.
    bind(uid, updated) { userId = uid; syncedUpdated = updated ?? null; },
    setSyncedUpdated(u) { syncedUpdated = u ?? null; },
    getSyncedUpdated() { return syncedUpdated; },

    // UI mutation → journal (delta) → debounced single-flight persist.
    schedule(next, patch) {
      rev += 1;
      pendingData = next;
      if (patch && Object.keys(patch).length) journal.merge(userId, patch, rev, syncedUpdated);
      durum("kaydediliyor");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; _send(); }, delay);
    },

    // Debounce'u atla, pending'i hemen gönder (lifecycle hidden/close). HATA durumundaki
    // pending'i BURADAN gönderme: unload anında conflict-check yapılamaz; bir kez başarısız
    // olmuş yazı (offline vs.) yeniden bağlanınca server'ı EZEBİLİR (multi-device lost-update).
    // O durum journal + load-path conflict-check ile güvenli ele alınır; retry() ayrıca dener.
    flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!inFlight && status !== "hata") _send();
    },

    // Bekleyen (ACK edilmemiş) yerel değişiklik var mı? — CEK/merge guard için.
    hasPending() { return inFlight || rev > sentRev; },

    // Hata sonrası yeniden dene (focus/online/interval).
    retry() { if (status === "hata") _send(); },

    getStatus() { return status; },

    // Test/teardown.
    _reset() { userId = null; syncedUpdated = null; rev = 0; sentRev = 0; pendingData = null; inFlight = false; if (timer) clearTimeout(timer); timer = null; status = "kaydedildi"; },
  };
}
