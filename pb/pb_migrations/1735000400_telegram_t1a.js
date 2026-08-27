/// <reference path="../pb_data/types.d.ts" />
// Telegram Finance Gateway — T1A foundation (metadata only).
// TÜM koleksiyonların API kuralları NULL → generic REST ile normal user ASLA erişemez;
// yalnız server hook'ları (superuser bağlamı) okur/yazar. Finansal veri (users/haneler
// data/revision) BURADA DEĞİL — bu koleksiyonlar yalnız pairing/link/inbox/offset metadata'sı.
// NOT: field'lar c.fields.add(...) ile eklenir (haneler migration deseni; constructor fields:[]
// dizisi PB 0.39.10'da güvenilir değil).
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const kilitle = (c) => { c.listRule = null; c.viewRule = null; c.createRule = null; c.updateRule = null; c.deleteRule = null; };

    // A) telegram_links
    // F1: benzersizlik YALNIZ AKTİF link'ler için (partial unique index). Pasif tarihsel
    // satırlar bir kimliği SONSUZA reserve ETMEZ → açık unlink'ten sonra başka PB user aynı
    // Telegram ID'yi (veya user başka bir ID'yi) yeniden bağlayabilir. Invariant: en fazla BİR
    // aktif link / PB user, en fazla BİR aktif link / telegram_user_id. `WHERE active = 1`
    // PB 0.39.10/SQLite'ta bool=1 depolamasıyla ENFORCE edilir (probe ile doğrulandı).
    const links = new Collection({ type: "base", name: "telegram_links" });
    kilitle(links);
    links.fields.add(new RelationField({ name: "user", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true }));
    links.fields.add(new TextField({ name: "telegram_user_id", required: true, pattern: "^[0-9]{1,20}$" }));
    links.fields.add(new SelectField({ name: "scope", required: true, maxSelect: 1, values: ["personal"] }));
    links.fields.add(new BoolField({ name: "active" }));
    links.fields.add(new DateField({ name: "linked_at" }));
    links.fields.add(new DateField({ name: "unlinked_at" }));
    links.fields.add(new AutodateField({ name: "created", onCreate: true }));
    links.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }));
    links.indexes = [
      "CREATE UNIQUE INDEX idx_tg_links_user_active ON telegram_links (user) WHERE active = 1",
      "CREATE UNIQUE INDEX idx_tg_links_tgid_active ON telegram_links (telegram_user_id) WHERE active = 1",
      "CREATE INDEX idx_tg_links_user ON telegram_links (user)",
      "CREATE INDEX idx_tg_links_tgid ON telegram_links (telegram_user_id)",
    ];
    app.save(links);

    // B) telegram_pair_codes — plaintext kod ASLA saklanmaz; yalnız keyed-HMAC (pepper) code_mac.
    const codes = new Collection({ type: "base", name: "telegram_pair_codes" });
    kilitle(codes);
    codes.fields.add(new RelationField({ name: "user", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true }));
    codes.fields.add(new TextField({ name: "code_mac", required: true }));
    codes.fields.add(new DateField({ name: "expires_at", required: true }));
    codes.fields.add(new DateField({ name: "used_at" }));
    codes.fields.add(new AutodateField({ name: "created", onCreate: true }));
    codes.indexes = [
      "CREATE UNIQUE INDEX idx_tg_codes_mac ON telegram_pair_codes (code_mac)",
      // DB invariant: her PB user için EN FAZLA BİR kullanılmamış (current) kod. Boş DateField
      // SQLite'ta '' saklanır (probe ile doğrulandı) → yeni kod üretmeden önce eskiyi used
      // işaretlemek zorunlu; keyfi 500 limitine korrektlik bağımlılığı kalmaz.
      "CREATE UNIQUE INDEX idx_tg_codes_user_unused ON telegram_pair_codes (user) WHERE used_at = ''",
      "CREATE INDEX idx_tg_codes_user ON telegram_pair_codes (user)",
      "CREATE INDEX idx_tg_codes_exp ON telegram_pair_codes (expires_at)",
    ];
    app.save(codes);

    // C) telegram_state — singleton bot işleme durumu. next_offset EXPLICIT.
    const state = new Collection({ type: "base", name: "telegram_state" });
    kilitle(state);
    state.fields.add(new TextField({ name: "key", required: true }));
    state.fields.add(new TextField({ name: "next_offset" }));
    state.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }));
    state.indexes = ["CREATE UNIQUE INDEX idx_tg_state_key ON telegram_state (key)"];
    app.save(state);

    // D) telegram_updates — durable inbox / idempotency (minimum metadata).
    const updates = new Collection({ type: "base", name: "telegram_updates" });
    kilitle(updates);
    updates.fields.add(new TextField({ name: "update_id", required: true }));
    updates.fields.add(new TextField({ name: "telegram_user_id" }));
    updates.fields.add(new TextField({ name: "kind" }));
    updates.fields.add(new SelectField({ name: "status", required: true, maxSelect: 1, values: ["received", "processing", "done", "failed"] }));
    updates.fields.add(new NumberField({ name: "attempts", onlyInt: true, min: 0 }));
    updates.fields.add(new DateField({ name: "lease_until" }));
    updates.fields.add(new TextField({ name: "lease_token" })); // opaque fencing token
    updates.fields.add(new DateField({ name: "completed_at" }));
    updates.fields.add(new AutodateField({ name: "created", onCreate: true }));
    updates.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }));
    updates.indexes = [
      "CREATE UNIQUE INDEX idx_tg_updates_uid ON telegram_updates (update_id)",
      "CREATE INDEX idx_tg_updates_status ON telegram_updates (status)",
    ];
    app.save(updates);

    // E) telegram_service_requests — HMAC replay (unique nonce) + pairing rate-limit denetimi.
    const reqs = new Collection({ type: "base", name: "telegram_service_requests" });
    kilitle(reqs);
    reqs.fields.add(new TextField({ name: "nonce", required: true }));
    reqs.fields.add(new NumberField({ name: "timestamp", onlyInt: true }));
    reqs.fields.add(new TextField({ name: "endpoint" }));
    reqs.fields.add(new TextField({ name: "telegram_user_id" }));
    reqs.fields.add(new DateField({ name: "expires_at", required: true }));
    reqs.fields.add(new AutodateField({ name: "created", onCreate: true }));
    reqs.indexes = [
      "CREATE UNIQUE INDEX idx_tg_reqs_nonce ON telegram_service_requests (nonce)",
      "CREATE INDEX idx_tg_reqs_rl ON telegram_service_requests (telegram_user_id, endpoint, created)",
      "CREATE INDEX idx_tg_reqs_exp ON telegram_service_requests (expires_at)",
    ];
    app.save(reqs);
  },
  (app) => {
    for (const ad of ["telegram_service_requests", "telegram_updates", "telegram_state", "telegram_pair_codes", "telegram_links"]) {
      try { app.delete(app.findCollectionByNameOrId(ad)); } catch (_) { /* yoksa geç */ }
    }
  }
);
