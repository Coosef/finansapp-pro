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
export class PermanentUpdateError extends Error {
  constructor(msg) { super(msg); this.name = "PermanentUpdateError"; }
}
export class UserInputError extends Error {
  // safeText: kullanıcıya gösterilecek güvenli deterministik mesaj.
  constructor(msg, safeText) { super(msg); this.name = "UserInputError"; this.safeText = safeText; }
}
