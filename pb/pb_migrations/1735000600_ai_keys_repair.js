/// <reference path="../pb_data/types.d.ts" />
// ai_keys ŞEMA ONARIMI — T2B sırasında tespit edilen ÖNCEDEN VAR OLAN kusur.
//
// BULGU: 1735000200_ai_keys.js koleksiyonu `new Collection({ ..., fields: [...] })`
// constructor dizisiyle oluşturuyor. PocketBase 0.39.10'da bu dizi SESSİZCE yok sayılıyor
// (aynı tuzak 1735000400 yorumunda da not edilmiş). Sonuç: `ai_keys` yalnız `id` alanıyla,
// indekssiz oluştu. Bu yüzden:
//   • `user` / `keys` alanları HİÇ var olmadı → kullanıcı anahtarı DEPOLANMADI,
//   • "user = {:u}" filtresi "unknown field user" hatası verdi,
//   • ai.pb.js'teki try/catch bu hatayı yuttuğu için sistem SESSİZCE env anahtarına düştü.
// Yani /ai/anahtar bugüne kadar hiçbir şey saklamadı; /ai her zaman env anahtarını kullandı.
//
// ONARIM: eksik alanları ve unique index'i idempotent biçimde ekler. Alan eklemeden ÖNCE
// var olan (yalnız `id` taşıyan, hiçbir bilgi içermeyen) yetim satırlar silinir — aksi halde
// user üzerindeki UNIQUE index oluşturulamaz.
//
// DAVRANIŞ ETKİSİ (bilerek ve açıkça): bu onarımdan SONRA tarayıcı /ai akışı, tasarımında
// yazdığı gibi önce kullanıcının kendi anahtarını, yoksa env anahtarını kullanır. ai.pb.js
// KAYNAĞI DEĞİŞMEDİ; değişen tek şey, o kodun zaten amaçladığı davranışın artık gerçekten
// çalışabilmesidir. Telegram AI (T2B) tarafında env fallback ZATEN yoktur (D2).
migrate(
  (app) => {
    let col;
    try { col = app.findCollectionByNameOrId("ai_keys"); } catch (_) { return; } // yoksa yapacak bir şey yok
    const users = app.findCollectionByNameOrId("users");
    const varMi = (ad) => {
      try { return !!col.fields.getByName(ad); } catch (_) { return false; }
    };

    let degisti = false;
    if (!varMi("user")) {
      col.fields.add(new RelationField({ name: "user", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true }));
      degisti = true;
    }
    if (!varMi("keys")) {
      col.fields.add(new JSONField({ name: "keys", maxSize: 100000 }));
      degisti = true;
    }
    if (degisti) app.save(col);

    // Yetim satırlar: `user` boş (alan hiç var olmadığı için hiçbir satırda dolu olamazdı).
    // İçlerinde saklanmış bir anahtar YOKTUR (alan yoktu) → bilgi kaybı yok.
    for (;;) {
      // sort: "" — ai_keys'te autodate alanı YOK (orijinal tasarımda da yoktu).
      const rows = app.findRecordsByFilter("ai_keys", "user = ''", "", 200, 0);
      if (!rows.length) break;
      for (const r of rows) app.delete(r);
      if (rows.length < 200) break;
    }

    // Unique index (orijinal tasarım): kullanıcı başına tek anahtar kaydı.
    const mevcut = col.indexes || [];
    if (!mevcut.some((s) => String(s).indexOf("idx_ai_keys_user") !== -1)) {
      col.indexes = mevcut.concat(["CREATE UNIQUE INDEX idx_ai_keys_user ON ai_keys (user)"]);
      app.save(col);
    }
  },
  (app) => {
    // GERİ ALMA: alanlar KASITLI olarak silinmez — silmek kullanıcıların kayıtlı AI
    // anahtarlarını yok ederdi. Yalnız bu migration'ın eklediği index geri alınır.
    let col;
    try { col = app.findCollectionByNameOrId("ai_keys"); } catch (_) { return; }
    col.indexes = (col.indexes || []).filter((s) => String(s).indexOf("idx_ai_keys_user") === -1);
    app.save(col);
  }
);
