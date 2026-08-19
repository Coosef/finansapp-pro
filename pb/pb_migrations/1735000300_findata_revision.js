/// <reference path="../pb_data/types.d.ts" />
// Server-owned monotonik revision — findata write'ları için optimistic concurrency (CAS).
// users.data ve haneler.data yanına `revision` (NUMBER, tamsayı, default 0).
// Mevcut kayıtlar için null → CAS endpoint getInt ile 0 sayar (ayrı backfill gerekmez).
migrate(
  (app) => {
    for (const ad of ["users", "haneler"]) {
      const c = app.findCollectionByNameOrId(ad);
      c.fields.add(new NumberField({ name: "revision", onlyInt: true, min: 0 }));
      app.save(c);
    }
  },
  (app) => {
    for (const ad of ["users", "haneler"]) {
      const c = app.findCollectionByNameOrId(ad);
      c.fields.removeByName("revision");
      app.save(c);
    }
  }
);
