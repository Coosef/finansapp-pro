/// <reference path="../pb_data/types.d.ts" />
// AI anahtar deposu: kullanıcı başına sağlayıcı→anahtar eşlemesi.
// TÜM API kuralları null → istemci ASLA okuyamaz/yazamaz; yalnız sunucu hook'ları
// (superuser bağlamı) erişir. Anahtar cihaza/tarayıcıya hiç dönmez.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const col = new Collection({
      type: "base",
      name: "ai_keys",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        new RelationField({ name: "user", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true }),
        new JSONField({ name: "keys", maxSize: 100000 }),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_ai_keys_user ON ai_keys (user)"],
    });
    app.save(col);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("ai_keys"));
  }
);
