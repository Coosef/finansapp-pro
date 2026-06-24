/// <reference path="../pb_data/types.d.ts" />
// users (auth) koleksiyonuna kullanıcının kendi findata'sını saklayacağı
// json `data` alanı ekle. Her kullanıcı yalnız kendi kaydına erişir (PB varsayılan auth kuralları).
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("users");
    collection.fields.add(
      new JSONField({
        name: "data",
        maxSize: 5000000, // ~5MB findata için yeterli
      })
    );
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("users");
    collection.fields.removeByName("data");
    app.save(collection);
  }
);
