// Merkezi persistence controller — debounce + monotonik rev + single-flight + trailing
// + stale-response guard + explicit flush() + error/conflict/pending state. Server-side
// CAS (revision) ile yazar: send(data, baseRevision) → { revision, updated } | ConflictError.
// React'ten bağımsız düz nesne; App.jsx sürer. Journal (WAL) ile crash/reload güvenliği.
//
// send(data, baseRevision) → Promise<{revision,updated}>  (pbFindataGonder; 409'da .conflict throw)
// journal   → { merge(userId,patch,rev,baseRev), ack(userId,rev), clear(userId), get(userId) }
// onStatus(status) → "kaydediliyor" | "kaydedildi" | "hata" | "catisma"
export function createPersister({ send, journal, onStatus, delay = 1200 }) {
  let userId = null;
  let syncedRevision = 0; // en son ACK'lenmiş / fetch'lenmiş server revision (CAS base)
  let syncedUpdated = null; // bilgi amaçlı (görüntü)
  let rev = 0; // monotonik; her mutation artırır
  let sentRev = 0; // başarıyla gönderilmiş en yüksek rev
  let pendingData = null;
  let inFlight = false;
  let timer = null;
  let status = "kaydedildi";

  const durum = (s) => { status = s; onStatus && onStatus(s); };

  async function _send() {
    if (inFlight || rev <= sentRev) return; // gönderilecek yeni bir şey yok / uçuşta
    inFlight = true;
    const myRev = rev;
    const data = pendingData;
    try {
      const res = await send(data, syncedRevision); // CAS: baseRevision == syncedRevision
      if (res && Number.isInteger(res.revision)) syncedRevision = res.revision;
      if (res && res.updated) syncedUpdated = res.updated;
      sentRev = myRev;
      journal.ack(userId, myRev); // pending gitti → ACK sonrası atomik temizlik
      inFlight = false;
      if (rev > sentRev) { _send(); }            // trailing: bu sırada gelen daha yeni değişiklik
      else durum("kaydedildi");
    } catch (err) {
      inFlight = false;
      if (err && err.conflict) {
        // CAS çakışması: server daha yeni revision'da. KÖR RETRY YOK; WAL KORUNUR.
        // App fresh no-store fetch + controlled reconcile (cozumle) yapar.
        durum("catisma");
      } else {
        durum("hata"); // ağ/geçici → focus/online retry; journal korunur
      }
    }
  }

  return {
    bind(uid, revision, updated) { userId = uid; syncedRevision = Number.isInteger(revision) ? revision : 0; syncedUpdated = updated ?? null; },
    setSynced(revision, updated) { if (Number.isInteger(revision)) syncedRevision = revision; if (updated) syncedUpdated = updated; },
    getSyncedRevision() { return syncedRevision; },
    getSyncedUpdated() { return syncedUpdated; },

    // UI mutation → journal (delta + base revision) → debounced single-flight CAS persist.
    schedule(next, patch) {
      rev += 1;
      pendingData = next;
      if (patch && Object.keys(patch).length) journal.merge(userId, patch, rev, syncedRevision);
      durum("kaydediliyor");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; _send(); }, delay);
    },

    // Controlled reconcile (C4): fresh server state alındıktan SONRA pending mutation'ı
    // taze veriye açıkça yeniden uygula + yeni baseRevision ile save. Kör auto-merge DEĞİL;
    // çağıran (App) fresh no-store GET yapıp bunu çağırır. Reconcile edilmiş veriyi döner.
    cozumle(freshData, freshRevision, patch) {
      if (Number.isInteger(freshRevision)) syncedRevision = freshRevision;
      const p = patch || journal.get(userId)?.patch || null;
      pendingData = p ? { ...freshData, ...p } : freshData;
      rev += 1;
      if (p) journal.merge(userId, p, rev, syncedRevision);
      durum("kaydediliyor");
      _send();
      return pendingData;
    },

    // Bekleyen (ACK edilmemiş) yerel değişiklik var mı? — CEK/merge guard için.
    hasPending() { return inFlight || rev > sentRev; },

    // Debounce'u atla, pending'i hemen gönder. HATA/ÇATIŞMA durumunda göndermez (guard).
    flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!inFlight && status !== "hata" && status !== "catisma") _send();
    },

    // Yalnız ağ/geçici hatada yeniden dene (çatışmada DEĞİL — kör retry yok).
    retry() { if (status === "hata") _send(); },

    getStatus() { return status; },

    _reset() { userId = null; syncedRevision = 0; syncedUpdated = null; rev = 0; sentRev = 0; pendingData = null; inFlight = false; if (timer) clearTimeout(timer); timer = null; status = "kaydedildi"; },
  };
}
