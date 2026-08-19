// C2 — CAS atomiklik kanıtı: 20 eşzamanlı aynı-baseRevision write → tam 1 kazanan,
// 19 conflict (409), revision yalnız +1. Backend concurrency testi (browser yok).
import { test, expect } from "@playwright/test";
import { pbAuth, PB } from "./helpers.mjs";

const readRec = async (token, userId) =>
  (await fetch(PB.base + `/api/collections/users/records/${userId}`, { headers: { Authorization: token } })).json();

test("C2 — 20 concurrent same-baseRevision CAS → exactly 1 winner, 19 conflict, revision +1", async () => {
  const { token, userId } = await pbAuth();
  const rec0 = await readRec(token, userId);
  const base = rec0.revision || 0;

  const statuses = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      fetch(PB.base + "/api/findata/kaydet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ baseRevision: base, data: { ...(rec0.data || {}), _w: i } }),
      }).then((r) => r.status).catch(() => -1)
    )
  );
  const ok = statuses.filter((s) => s === 200).length;
  const conflict = statuses.filter((s) => s === 409).length;
  const other = statuses.filter((s) => s !== 200 && s !== 409);
  console.log("C2 statuses → ok:", ok, "conflict:", conflict, "other:", JSON.stringify(other));

  expect(other).toEqual([]); // busy/500/network YOK
  expect(ok).toBe(1); // tam 1 kazanan
  expect(conflict).toBe(19); // 19 conflict

  const rec1 = await readRec(token, userId);
  expect(rec1.revision).toBe(base + 1); // revision yalnız +1
});
