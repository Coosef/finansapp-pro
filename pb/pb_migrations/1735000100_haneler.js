/// <reference path="../pb_data/types.d.ts" />
// Ortak Hane: birden çok kullanıcının AYNI findata'yı paylaştığı koleksiyon.
// Erişim üyelikle sınırlı — yalnız `members` içindeki kullanıcılar görüp düzenler.
// Davet kodu (`kod`) ile katılma, bir hook üzerinden yapılır (pb_hooks/hane.pb.js).
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const c = new Collection({ type: "base", name: "haneler" });

    // Sadece üyeler erişebilir
    c.listRule = '@request.auth.id != "" && members.id ?= @request.auth.id';
    c.viewRule = '@request.auth.id != "" && members.id ?= @request.auth.id';
    // Oluştururken kendini üye olarak eklemek zorunlu
    c.createRule = '@request.auth.id != "" && members.id ?= @request.auth.id';
    // Sadece üyeler güncelleyebilir (ortak veri yazımı)
    c.updateRule = 'members.id ?= @request.auth.id';
    c.deleteRule = null; // sadece admin

    c.fields.add(new TextField({ name: "kod", required: true }));
    c.fields.add(new TextField({ name: "ad" }));
    c.fields.add(new JSONField({ name: "data", maxSize: 5000000 }));
    c.fields.add(new RelationField({
      name: "members",
      required: true,
      minSelect: 1,
      maxSelect: 50,
      collectionId: users.id,
      cascadeDelete: false,
    }));

    app.save(c);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("haneler"));
  }
);
