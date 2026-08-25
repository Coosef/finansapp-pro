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
  let conflicted = false; // CAS çakışma kilidi: açıkken hiçbir otomatik gönderim/durum değişimi yok
  let lastAckRevision = null; // en son DOĞRULANMIŞ server ACK revision'ı (diagnostics)
  let lastAckAt = null; // en son geçerli ACK zamanı (ms) — stale-tab teşhisi

  const durum = (s) => { status = s; onStatus && onStatus(s); };

  async function _send() {
    if (inFlight || rev <= sentRev || conflicted) return; // yeni yok / uçuşta / çakışma kilidi
    inFlight = true;
    const myRev = rev;
    const data = pendingData;
    try {
      const res = await send(data, syncedRevision); // CAS: baseRevision == syncedRevision
      inFlight = false;
      // ACK KONTRATI: "Kaydedildi" YALNIZ doğrulanmış server ACK sonrası. Geçerli ACK =
      // res mevcut && Number.isInteger(res.revision) && res.revision >= 0. Aksi halde
      // (null / eksik / geçersiz revision) BAŞARI DEĞİL: sentRev İLERLEMEZ, journal
      // ACK'LENMEZ (WAL korunur), durum "hata" → retry/flush mümkün, sessiz veri kaybı yok.
      const gecerliAck = res && Number.isInteger(res.revision) && res.revision >= 0;
      if (!gecerliAck) { durum("hata"); return; }
      syncedRevision = res.revision;
      if (res.updated) syncedUpdated = res.updated;
      lastAckRevision = res.revision; // diagnostics: yalnız geçerli ACK'te güncellenir
      lastAckAt = Date.now();
      sentRev = myRev;
      journal.ack(userId, myRev); // pending gitti → ACK sonrası atomik temizlik
      if (rev > sentRev) { _send(); }            // trailing: bu sırada gelen daha yeni değişiklik
      else durum("kaydedildi");
    } catch (err) {
      inFlight = false;
      if (err && err.conflict) {
        // CAS çakışması: server daha yeni revision'da. KÖR RETRY/AUTO-MERGE YOK; WAL KORUNUR
        // (journal.ack ÇAĞRILMAZ → pending silinmez). Çakışma kilidi açılır → sonraki mutation'lar
        // WAL'a yazılır ama gönderilmez. App çakışmayı UI'da yüzeyler; kullanıcı çözer.
        conflicted = true;
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
    // ÇAKIŞMA kilidi açıkken: mutation yalnız WAL'a yazılır (kayıp olmasın) ama GÖNDERİLMEZ ve
    // durum "catisma" KALIR (yüzeyde). Böylece bir derivasyon/otomatik setFindata çakışmayı ezip
    // base'i eşleşen bir write ile sessizce kaydedemez (reload'da server rev'ine bind edilse bile).
    schedule(next, patch) {
      rev += 1;
      pendingData = next;
      if (patch && Object.keys(patch).length) journal.merge(userId, patch, rev, syncedRevision);
      if (conflicted) return; // kilit: WAL'a yazıldı, gönderme yok, durum korunur
      durum("kaydediliyor");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; _send(); }, delay);
    },

    // Çakışmayı DIŞARIDAN işaretle (load-path: serverRevision !== journal.baseRevision). Kilit açılır;
    // otomatik reconcile/merge/write YOK. NOT: journal yalnız top-level delta tuttuğundan
    // {...server, ...patch} aynı alanı iki client değiştirirse server item'larını silerdi (lost-update).
    catismaGir() { conflicted = true; durum("catisma"); },

    // Bekleyen (ACK edilmemiş) yerel değişiklik var mı? — CEK/merge guard için.
    hasPending() { return inFlight || rev > sentRev; },

    // Kaydedilmemiş değişiklik VAR mı? (pending || çakışma) — SW güncelleme reload
    // guard'ı için: kirliyken otomatik reload ERTELENİR (veri güvenliği).
    hasUnsaved() { return inFlight || rev > sentRev || conflicted; },

    // Salt-okunur teşhis anlık görüntüsü (Ayarlar/Hakkında). Token/veri İÇERMEZ.
    getDiagnostics() {
      return { status, pending: (inFlight || rev > sentRev), inFlight, conflicted, syncedRevision, lastAckRevision, lastAckAt };
    },

    // Debounce'u atla, pending'i hemen gönder. HATA/ÇATIŞMA durumunda göndermez (guard).
    flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!inFlight && !conflicted && status !== "hata") _send();
    },

    // Yalnız ağ/geçici hatada yeniden dene (çatışmada DEĞİL — kör retry yok).
    retry() { if (status === "hata" && !conflicted) _send(); },

    getStatus() { return status; },

    _reset() { userId = null; syncedRevision = 0; syncedUpdated = null; rev = 0; sentRev = 0; pendingData = null; inFlight = false; if (timer) clearTimeout(timer); timer = null; status = "kaydedildi"; conflicted = false; lastAckRevision = null; lastAckAt = null; },
  };
}
