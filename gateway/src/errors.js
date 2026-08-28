// ============================================================
// Açık hata taksonomisi (R1). "N denemede done" YOK — sınıf, davranışı belirler:
//   FatalConfigError     → update TAMAMLANMAZ; süreç fail-closed exit (geçersiz token/HMAC/config).
//   TransientError       → complete(status=failed); offset İLERLEMEZ; bounded backoff (5xx/ağ/429).
//   PermanentUpdateError → YALNIZ açıkça ispatlı "güvenle yok sayılabilir" update sınıfı → done.
//   UserInputError       → güvenli deterministik yanıt gönder; başarılı gönderim → done (inline).
// "permanent" ASLA deneme sayısından çıkarılmaz.
// ============================================================
export class FatalConfigError extends Error {
  constructor(msg) { super(msg); this.name = "FatalConfigError"; }
}
export class TransientError extends Error {
  // retryAfterMs: 429 gibi durumlarda sunucunun istediği bekleme (ms). Yoksa null → exp backoff.
  constructor(msg, retryAfterMs = null) { super(msg); this.name = "TransientError"; this.retryAfterMs = retryAfterMs; }
}
// F1: update/complete 409 (no_claim | not_processing | lease_mismatch) — fencing kaybı.
// ASLA başarı/done değildir; batch durur, offset ilerlemez, bounded backoff (Transient alt sınıfı).
// complete(failed) DENENMEZ (lease zaten bizde değil).
export class LeaseConflictError extends TransientError {
  constructor(msg) { super(msg); this.name = "LeaseConflictError"; }
}
export class PermanentUpdateError extends Error {
  constructor(msg) { super(msg); this.name = "PermanentUpdateError"; }
}
export class UserInputError extends Error {
  // safeText: kullanıcıya gösterilecek güvenli deterministik mesaj.
  constructor(msg, safeText) { super(msg); this.name = "UserInputError"; this.safeText = safeText; }
}
