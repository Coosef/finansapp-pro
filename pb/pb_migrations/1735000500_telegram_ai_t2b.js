/// <reference path="../pb_data/types.d.ts" />
// Telegram AI (T2B) — response-loss / idempotency deposu.
// TÜM API kuralları NULL → generic REST ile erişilemez; yalnız server hook'ları okur/yazar.
//
// VERİ SINIFLANDIRMASI (dürüst): `answer` alanı kullanıcının finansal verisinden TÜRETİLMİŞ
// içeriktir ve KALICI olarak (SQLite'ta) yazılır. Kalıcılığı KISA ÖMÜRLÜDÜR: expires_at =
// +30 dk ve tg_cleanup cron'u süresi geçen satırları siler. "AI cevabı hiç saklanmıyor"
// İDDİASI YANLIŞ OLURDU — saklanır, sınırlı süreyle.
//
// SAKLANMAYANLAR: soru düz metni, konuşma geçmişi, finans context'i, Telegram user id,
// PB user id, AI anahtarı. Bunların tümü yalnız request_hash içinde (geri döndürülemez
// HMAC-SHA256 özeti olarak) temsil edilir.
migrate(
  (app) => {
    const c = new Collection({ type: "base", name: "telegram_ai_results" });
    c.listRule = null; c.viewRule = null; c.createRule = null; c.updateRule = null; c.deleteRule = null;
    c.fields.add(new TextField({ name: "update_id", required: true, pattern: "^[0-9]{1,19}$" }));
    // request_hash: tgid + update_id + normalize soru + sınırlı geçmiş + sağlayıcı/model özeti.
    c.fields.add(new TextField({ name: "request_hash", required: true }));
    c.fields.add(new SelectField({ name: "status", required: true, maxSelect: 1, values: ["processing", "done"] }));
    c.fields.add(new TextField({ name: "answer", max: 20000 }));
    c.fields.add(new DateField({ name: "lease_until" }));
    c.fields.add(new DateField({ name: "expires_at", required: true }));
    c.fields.add(new AutodateField({ name: "created", onCreate: true }));
    c.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }));
    c.indexes = [
      // Idempotency invariant: update_id başına EN FAZLA BİR satır. Eşzamanlı ikinci claimant
      // burada düşer → çift upstream çağrısı DB seviyesinde de engellenir.
      "CREATE UNIQUE INDEX idx_tg_ai_uid ON telegram_ai_results (update_id)",
      "CREATE INDEX idx_tg_ai_exp ON telegram_ai_results (expires_at)",
    ];
    app.save(c);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("telegram_ai_results"));
  }
);
