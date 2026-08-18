// Write-ahead journal (WAJ) — yalnız server tarafından ACK EDİLMEMİŞ pending mutation'ı
// kısa ömürlü tutan crash/reload güvenlik kuyruğu. PocketBase source-of-truth kalır;
// burada TÜM findata snapshot'ı DEĞİL, yalnız değişen top-level alanların (delta) net
// coalesced hali + hangi server revizyonuna (baseUpdated) karşı yapıldığı saklanır.
//
// Kayıt (kullanıcı başına tek, coalesced):
//   { userId, baseUpdated, patch:{degisenAlan:sonDeger,...}, rev, ts }
// Garantiler: user-namespaced (izolasyon), ACK'ten önce SİLİNMEZ, bozuk JSON crash
// ETTİRMEZ (→ null), idempotent (whole-doc replay), storage engelliyse sessiz geçer.

const KEY = (userId) => `finansapp:waj:${userId || "anon"}`;

function ls() {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

// Bozuk/eksik kayıt → null (asla throw). Şekil doğrulaması ile zehirli veriyi ele.
export function journalGet(userId) {
  try {
    const raw = ls()?.getItem(KEY(userId));
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object" || Array.isArray(j)) return null;
    if (!j.patch || typeof j.patch !== "object" || Array.isArray(j.patch)) return null;
    if (typeof j.rev !== "number") return null;
    return { userId: j.userId, baseUpdated: j.baseUpdated ?? null, patch: j.patch, rev: j.rev, ts: j.ts ?? null };
  } catch {
    return null;
  }
}

// Yeni mutation'ı journal'a coalesce et. İlk pending kaydında baseUpdated sabitlenir
// (o anki senkron server revizyonu); sonraki mutation'lar aynı base'e karşı birikir.
export function journalMerge(userId, patch, rev, baseUpdated) {
  try {
    const store = ls();
    if (!store || !patch || typeof patch !== "object") return;
    const mevcut = journalGet(userId);
    const simdi = typeof Date !== "undefined" && Date.now ? Date.now() : 0;
    const kayit = mevcut
      ? { userId, baseUpdated: mevcut.baseUpdated, patch: { ...mevcut.patch, ...patch }, rev, ts: mevcut.ts ?? simdi }
      : { userId, baseUpdated: baseUpdated ?? null, patch: { ...patch }, rev, ts: simdi }; // ilk pending → yaş damgası (TTL)
    store.setItem(KEY(userId), JSON.stringify(kayit));
  } catch {
    /* storage dolu/engelli → sessiz; app crash etmez */
  }
}

// Server ACK'i: gönderilen rev, journal'ın rev'ini kapsıyorsa (tüm pending gitti) → temizle.
// Atomik: tek removeItem. Daha yeni değişiklik varsa (rev > ackRev) kayıt korunur.
export function journalAck(userId, ackRev) {
  try {
    const store = ls();
    if (!store) return;
    const j = journalGet(userId);
    if (!j) return;
    if (j.rev <= ackRev) store.removeItem(KEY(userId));
  } catch {
    /* sessiz */
  }
}

// Kullanıcının journal'ını tamamen sil (conflict çözümü / logout).
export function journalClear(userId) {
  try {
    ls()?.removeItem(KEY(userId));
  } catch {
    /* sessiz */
  }
}
