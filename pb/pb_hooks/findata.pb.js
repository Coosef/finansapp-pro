/// <reference path="../pb_data/types.d.ts" />
// Server-side optimistic concurrency (CAS) for findata writes.
// Tek endpoint: baseRevision == mevcut server revision ise atomik yaz + revision+1;
// değilse 409 Conflict (yazma yok). runInTransaction ile record validation/autodate/
// hooks lifecycle korunur. revision SERVER-OWNED: yalnız burada +1; client spoof edemez.
routerAdd(
  "POST",
  "/api/findata/kaydet",
  (e) => {
    const info = e.requestInfo();
    const auth = info.auth;
    if (!auth) throw new UnauthorizedError("Giriş gerekli.");
    const body = info.body || {};
    const haneId = body.haneId ? String(body.haneId) : "";
    const base = body.baseRevision;
    if (!Number.isInteger(base) || base < 0) throw new BadRequestError("baseRevision (tamsayı ≥0) gerekli.");
    const data = body.data;
    if (data === null || typeof data !== "object") throw new BadRequestError("data (nesne) gerekli.");

    let out = null;
    e.app.runInTransaction((txApp) => {
      let rec;
      if (haneId) {
        rec = txApp.findRecordById("haneler", haneId);
        const members = rec.get("members") || [];
        if (members.indexOf(auth.id) === -1) throw new ForbiddenError("Hane üyesi değilsin.");
      } else {
        rec = txApp.findRecordById("users", auth.id);
      }
      const cur = rec.getInt("revision"); // null → 0
      if (cur !== base) { out = { conflict: true, revision: cur, updated: rec.get("updated") }; return; }
      rec.set("data", data);
      rec.set("revision", cur + 1); // SERVER +1 (yalnızca burada)
      txApp.save(rec); // validation/autodate/onRecordUpdate hooks korunur
      out = { conflict: false, revision: cur + 1, updated: rec.get("updated") };
    });
    if (out.conflict) return e.json(409, { code: 409, revision: out.revision, updated: out.updated });
    return e.json(200, { revision: out.revision, updated: out.updated });
  },
  $apis.requireAuth()
);
