/// <reference path="../pb_data/types.d.ts" />
// ai_keys SEMA ONARIMI — T2B sirasinda tespit edilen ONCEDEN VAR OLAN kusur.
//
// BULGU: 1735000200_ai_keys.js koleksiyonu `new Collection({ ..., fields: [...] })` constructor
// dizisiyle olusturuyor. PocketBase 0.39.10'da bu dizi SESSIZCE yok sayiliyor (ayni tuzak
// 1735000400 yorumunda da notlanmis). Sonuc: `ai_keys` yalniz `id` alaniyla, indekssiz olustu:
//   • `user` / `keys` alanlari HIC var olmadi -> kullanici anahtari DEPOLANMADI,
//   • "user = {:u}" filtresi `unknown field "user"` hatasi verdi,
//   • ai.pb.js'teki try/catch bu hatayi yuttugu icin sistem SESSIZCE env anahtarina dustu.
// Yani /ai/anahtar bugune kadar hicbir sey saklamadi; /ai her zaman env anahtarini kullandi.
//
// KADEMELI ONARIM (sira ONEMLI — yorum ile uygulama BIREBIR ayni):
//   1) `user` iliskisini once NON-REQUIRED, `keys` JSON alanini ekle, semayi kaydet.
//      (Yetim satirlar dururken alani dogrudan required yapmak, sema ile veri arasinda
//       tutarsiz bir ara durum birakir; bu yuzden once gevsek eklenir.)
//   2) Artik `user` alani sorgulanabilir oldugundan, yetim satirlari (user = '') SIL.
//      Bu satirlar yalnizca `id` tasir; `keys` alani hic var olmadigi icin iclerinde
//      saklanmis bir anahtar YOKTUR -> bilgi kaybi yok.
//   3) `user` alanini REQUIRED yap ve kaydet (artik ihlal eden satir kalmadi).
//   4) UNIQUE index'i ekle ve kaydet (kullanici basina tek anahtar kaydi).
//
// DAVRANIS ETKISI (bilerek ve acikca): bu onarimdan SONRA tarayici /ai akisi, tasariminda
// yazdigi gibi once kullanicinin kendi anahtarini, yoksa env anahtarini kullanir. ai.pb.js
// KAYNAGI DEGISMEDI; degisen tek sey, o kodun zaten amacladigi davranisin artik gercekten
// calisabilmesidir. Telegram AI (T2B) tarafinda env fallback ZATEN yoktur (D2).
migrate(
  (app) => {
    let col;
    try { col = app.findCollectionByNameOrId("ai_keys"); } catch (_) { return; } // yoksa yapacak bir sey yok
    const users = app.findCollectionByNameOrId("users");
    const alan = (ad) => { try { return col.fields.getByName(ad); } catch (_) { return null; } };

    // --- 1) Eksik alanlari GEVSEK ekle ---
    let semaDegisti = false;
    if (!alan("user")) {
      col.fields.add(new RelationField({ name: "user", required: false, maxSelect: 1, collectionId: users.id, cascadeDelete: true }));
      semaDegisti = true;
    }
    if (!alan("keys")) {
      col.fields.add(new JSONField({ name: "keys", maxSize: 100000 }));
      semaDegisti = true;
    }
    if (semaDegisti) app.save(col);

    // --- 2) Yetim satirlari sil (artik `user` sorgulanabilir) ---
    // sort: "" — ai_keys'te autodate alani YOK (orijinal tasarimda da yoktu).
    for (;;) {
      const rows = app.findRecordsByFilter("ai_keys", "user = ''", "", 200, 0);
      if (!rows.length) break;
      for (const r of rows) app.delete(r);
      if (rows.length < 200) break;
    }

    // --- 3) `user` alanini REQUIRED yap ---
    col = app.findCollectionByNameOrId("ai_keys"); // taze kopya
    const uAlan = (() => { try { return col.fields.getByName("user"); } catch (_) { return null; } })();
    if (uAlan && !uAlan.required) { uAlan.required = true; app.save(col); }

    // --- 4) UNIQUE index ---
    col = app.findCollectionByNameOrId("ai_keys");
    const mevcut = col.indexes || [];
    if (!mevcut.some((s) => String(s).indexOf("idx_ai_keys_user") !== -1)) {
      col.indexes = mevcut.concat(["CREATE UNIQUE INDEX idx_ai_keys_user ON ai_keys (user)"]);
      app.save(col);
    }
  },
  (app) => {
    // GERI ALMA: alanlar KASITLI olarak silinmez — silmek kullanicilarin kayitli AI
    // anahtarlarini yok ederdi. Yalniz bu migration'in ekledigi index geri alinir.
    let col;
    try { col = app.findCollectionByNameOrId("ai_keys"); } catch (_) { return; }
    col.indexes = (col.indexes || []).filter((s) => String(s).indexOf("idx_ai_keys_user") === -1);
    app.save(col);
  }
);
