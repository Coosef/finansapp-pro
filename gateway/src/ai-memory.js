// ============================================================
// T2C — kısa konuşma belleği. YALNIZ RAM.
//
// TASARIM KARARI: PB koleksiyonu YOK, disk YOK, ham finans context'i YOK. Yalnız kullanıcının
// kendi soru/cevap METNİ, sınırlı sayıda ve sınırlı süreyle süreç belleğinde tutulur.
// Gateway yeniden başlarsa bellek KASITLI olarak kaybolur — bu kabul edilebilir ve gizlilik
// açısından olumludur; geçmiş PB'den veya Telegram'dan YENİDEN KURULMAZ.
//
// Anahtar = NUMERİK telegram_user_id. Username ASLA anahtar değildir (değiştirilebilir).
//
// COMMIT SIRASI GÜVENLİK-KRİTİKTİR (bkz. router/loop): geçmiş, PB updateComplete BAŞARILI
// olduktan SONRA işlenir. Aksi halde "cevap üretildi ama Telegram gönderimi/complete başarısız"
// penceresinde aynı Telegram update'i FARKLI history ile tekrar gönderilir ve T2B'nin
// history-bağlı request_hash'i haklı olarak 409 idempotency_conflict döner.
// ============================================================

export const VARSAYILAN = {
  ciftMax: 2,              // kullanıcı başına en fazla soru/cevap çifti
  alanMaxCp: 400,          // q ve a için ayrı ayrı Unicode code point sınırı
  ttlMs: 15 * 60000,       // hareketsizlik TTL'i
  girisMax: 500,           // global aktif kullanıcı girişi sınırı (LRU tahliye)
};

const cpKirp = (s, max) => {
  const a = Array.from(String(s == null ? "" : s));
  return a.length <= max ? String(s == null ? "" : s) : a.slice(0, max).join("");
};

// simdi(): test edilebilirlik için enjekte edilebilir saat.
export function aiHafiza(opts = {}) {
  const cfg = { ...VARSAYILAN, ...opts };
  const simdi = opts.simdi || (() => Date.now());
  // Map ekleme sırasını korur → en eski/en az kullanılan giriş ilk sıradadır (LRU).
  const depo = new Map();

  function bayatMi(giris) { return simdi() - giris.sonMs > cfg.ttlMs; }

  function suzTTL() {
    for (const [k, v] of depo) if (bayatMi(v)) depo.delete(k);
  }

  return {
    // Bu tgid için gönderilecek geçmiş (kopya döner; çağıran mutasyonu depoyu etkilemez).
    al(tgid) {
      const k = String(tgid);
      const g = depo.get(k);
      if (!g) return [];
      if (bayatMi(g)) { depo.delete(k); return []; }
      // Erişim LRU sırasını tazeler ama TTL saatini İLERLETMEZ (TTL = hareketsizlik).
      depo.delete(k); depo.set(k, g);
      return g.ciftler.map((c) => ({ q: c.q, a: c.a }));
    },

    // YALNIZ updateComplete başarılı olduktan SONRA çağrılır (best-effort RAM durumu).
    isle(tgid, q, a) {
      const soru = cpKirp(q, cfg.alanMaxCp);
      const cevap = cpKirp(a, cfg.alanMaxCp);
      if (!soru || !cevap) return; // eksik çift saklanmaz
      const k = String(tgid);
      suzTTL();
      let g = depo.get(k);
      if (g) depo.delete(k); else g = { ciftler: [], sonMs: 0 };
      g.ciftler = [...g.ciftler, { q: soru, a: cevap }].slice(-cfg.ciftMax);
      g.sonMs = simdi();
      depo.set(k, g);
      // Global sınır: en eski (LRU başı) girişleri tahliye et.
      while (depo.size > cfg.girisMax) depo.delete(depo.keys().next().value);
    },

    // Kimlik sınırı değişimlerinde (link/unlink/not_linked) çağrılır.
    temizle(tgid) { depo.delete(String(tgid)); },

    // Test/gözlem yardımcıları (üretim davranışını etkilemez).
    boyut() { suzTTL(); return depo.size; },
    _hamBoyut() { return depo.size; },
  };
}
