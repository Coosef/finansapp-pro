// Gateway ENTEGRASYON — GERÇEK PocketBase 0.39.10 (docker, T1A şeması) + FAKE Telegram.
// Gerçek gateway istemcileri (HMAC pb + tg) ve loop. Kapsam: /link e2e + W5 crash-window,
// komut e2e, READ-ONLY (revision sabit + kaydet/users-PATCH=0), duplicate, crash→reclaim,
// durable offset, /status metadata, private-chat + not-linked, group=zero-mutation,
// F1 lease fencing (gerçek complete 409), F2 enjekte DB hatası (tablo rename → 500; yanlış
// linked:false / yalan unlink 200 YOK).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pbIstemci } from "../src/pb.js";
import { tgIstemci } from "../src/telegram.js";
import { pollOnce, updateIsle } from "../src/loop.js";
import { TransientError } from "../src/errors.js";

const REPO = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const C = "finansapp-tg-gw-it", PORT = 8099, PB = `http://localhost:${PORT}`;
const GW = crypto.randomBytes(24).toString("hex"), PEP = crypto.randomBytes(24).toString("hex");
const BOT_TOKEN = "123456:TEST-" + crypto.randomBytes(6).toString("hex");
const TGID = "555000111";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ADMIN = "", USER = null, pb = null, tg = null, fake = null, fetchLog = [], DD = "";

async function pbBekle(maxSn = 60) {
  for (let i = 0; i < maxSn; i++) { try { if ((await fetch(PB + "/api/health")).ok) return; } catch { /* */ } await sleep(1000); }
  assert.fail("PB sağlık bekleme zaman aşımı");
}

function fakeTelegram() {
  const state = { updates: [], sent: [] };
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    let body = {}; try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch { /* */ }
    const metot = req.url.split("/").pop().split("?")[0];
    res.setHeader("Content-Type", "application/json");
    if (metot === "getUpdates") {
      if (body.offset != null) state.updates = state.updates.filter((u) => u.update_id >= body.offset);
      res.end(JSON.stringify({ ok: true, result: state.updates }));
    } else if (metot === "sendMessage") {
      state.sent.push({ chat_id: body.chat_id, text: body.text, reply_markup: body.reply_markup });
      res.end(JSON.stringify({ ok: true, result: { message_id: state.sent.length } }));
    } else { res.statusCode = 404; res.end(JSON.stringify({ ok: false, description: "unknown" })); }
  });
  return { state, server };
}
async function adminList(coll, filter) { const q = filter ? `?filter=${encodeURIComponent(filter)}&perPage=200` : "?perPage=200"; return (await (await fetch(PB + `/api/collections/${coll}/records${q}`, { headers: { Authorization: ADMIN } })).json()).items || []; }
async function adminPatch(coll, id, data) { return fetch(PB + `/api/collections/${coll}/records/${id}`, { method: "PATCH", headers: { Authorization: ADMIN, "Content-Type": "application/json" }, body: JSON.stringify(data) }); }
async function userRec(id) { return (await fetch(PB + `/api/collections/users/records/${id}`, { headers: { Authorization: ADMIN } })).json(); }
const msg = (id, text, o = {}) => ({ update_id: id, message: { chat: { id: o.chatId ?? 42, type: o.type ?? "private" }, from: { id: o.fromId ?? TGID, is_bot: false }, text } });

const FINDATA = {
  hesaplar: [{ id: "h1", ad: "Vadesiz", tip: "banka", bakiye: 8000 }, { id: "h2", ad: "Kart", tip: "kart", bakiye: 2000 }],
  yatirimlar: [{ adet: 10, guncelFiyat: 50, alisFiyati: 40 }],
  gelirler: [{ id: "g1", tarih: "2026-08-27", miktar: 3000, baslik: "Maaş", kategori: "Maaş" }],
  giderler: [{ id: "e1", tarih: "2026-08-27", miktar: 400, baslik: "Market", kategori: "Market" }],
  abonelikler: [{ id: "a1", miktar: 150, baslik: "Netflix" }],
};

before(async () => {
  try { execSync(`docker rm -f ${C}`, { stdio: "ignore" }); } catch { /* */ }
  DD = mkdtempSync(join(tmpdir(), "gw-it-"));
  execSync(`docker run -d --name ${C} -p ${PORT}:8090 -e TG_GATEWAY_SECRET=${GW} -e TG_PAIRING_PEPPER=${PEP} -v "${REPO}/pb/pb_hooks:/pb_hooks" -v "${REPO}/pb/pb_migrations:/pb_migrations" -v "${DD}:/pb_data" ghcr.io/muchobien/pocketbase:0.39.10 serve --http=0.0.0.0:8090 --dir=/pb_data --migrationsDir=/pb_migrations --hooksDir=/pb_hooks`, { stdio: "ignore" });
  await pbBekle(40);
  const adminPass = "gw-adm-" + crypto.randomBytes(6).toString("hex");
  execSync(`docker exec ${C} /usr/local/bin/pocketbase superuser upsert gw-admin@t.test ${adminPass} --dir=/pb_data`, { stdio: "ignore" });
  ADMIN = (await (await fetch(PB + "/api/collections/_superusers/auth-with-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: "gw-admin@t.test", password: adminPass }) })).json()).token;
  await fetch(PB + "/api/collections/users/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "gwuser@t.test", password: "gwpassword123", passwordConfirm: "gwpassword123" }) });
  USER = await (await fetch(PB + "/api/collections/users/auth-with-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: "gwuser@t.test", password: "gwpassword123" }) })).json();
  await adminPatch("users", USER.record.id, { data: FINDATA });

  fake = fakeTelegram();
  await new Promise((r) => fake.server.listen(0, "127.0.0.1", r));
  const fakePort = fake.server.address().port;
  // R16: TÜM outbound URL/method kaydı → kaydet=0 / users-PATCH=0 kanıtı.
  const recordingFetch = (url, opts) => { fetchLog.push({ url: String(url), method: (opts && opts.method) || "GET" }); return fetch(url, opts); };
  pb = pbIstemci({ pbUrl: PB, gwSecret: GW, pbTimeoutMs: 10000, fetchImpl: recordingFetch });
  tg = tgIstemci({ apiBase: `http://127.0.0.1:${fakePort}`, botToken: BOT_TOKEN });
});
after(async () => {
  try { if (fake) await new Promise((r) => fake.server.close(r)); } catch { /* */ }
  try { execSync(`docker rm -f ${C}`, { stdio: "ignore" }); } catch { /* */ }
});

async function pairCode() {
  const r = await fetch(PB + "/api/tg/user/pair-code", { method: "POST", headers: { Authorization: USER.token, "Content-Type": "application/json" }, body: "{}" });
  return (await r.json()).code;
}
const deps = () => ({ pb, tg, pollTimeout: 1, pollLimit: 50, bugunStr: "2026-08-27" });

test("GI1 /link e2e (local-valid kod → pair-consume) → aktif link", async () => {
  const code = await pairCode();
  fake.state.updates.length = 0; fake.state.sent.length = 0;
  fake.state.updates.push(msg(1000, "/link " + code));
  await pollOnce(deps());
  assert.match(fake.state.sent.at(-1).text, /tamamlandı/);
  const links = await adminList("telegram_links", `telegram_user_id = "${TGID}" && active = true`);
  assert.equal(links.length, 1); assert.equal(links[0].user, USER.record.id);
});
test("GI2 /bakiye e2e: gerçek /data → Net Varlık ₺6.500", async () => {
  fake.state.sent.length = 0; fake.state.updates.length = 0;
  fake.state.updates.push(msg(1001, "/bakiye"));
  await pollOnce(deps());
  assert.match(fake.state.sent.at(-1).text, /₺6\.500/);
});
test("GI3 READ-ONLY: komutlar user.data/revision değiştirmez", async () => {
  const once = await userRec(USER.record.id);
  fake.state.sent.length = 0; fake.state.updates.length = 0;
  fake.state.updates.push(msg(1002, "/buay"), msg(1003, "💳 Hesaplar"), msg(1004, "📊 Bugün"), msg(1005, "/durum"));
  await pollOnce(deps());
  const sonra = await userRec(USER.record.id);
  assert.equal(sonra.revision, once.revision);
  assert.equal(JSON.stringify(sonra.data), JSON.stringify(once.data));
});
test("GI4 duplicate idempotent", async () => {
  fake.state.sent.length = 0;
  const u = msg(2000, "/help");
  const r1 = await updateIsle(u, deps());
  const r2 = await updateIsle(u, deps());
  assert.equal(r1.done, true); assert.equal(r2.duplicate, true);
  assert.equal(fake.state.sent.length, 1);
});
test("GI5 crash→reclaim: in-flight lease → busy; expiry → reclaim → done", async () => {
  fake.state.sent.length = 0;
  const c = await pb.updateClaim(2100, TGID, "message");
  assert.equal(c.json.claimed, true);
  const busy = await updateIsle(msg(2100, "/help"), deps());
  assert.equal(busy.busy, true); assert.equal(fake.state.sent.length, 0);
  const row = (await adminList("telegram_updates", `update_id = "2100"`))[0];
  await adminPatch("telegram_updates", row.id, { lease_until: new Date(Date.now() - 600000).toISOString().replace("T", " ") });
  const r = await updateIsle(msg(2100, "/help"), deps());
  assert.equal(r.done, true); assert.equal(fake.state.sent.length, 1);
});
test("GI6 durable offset / in-order (sort YOK): next_offset = son işlenen + 1", async () => {
  fake.state.sent.length = 0; fake.state.updates.length = 0;
  fake.state.updates.push(msg(3000, "/help"), msg(3001, "/help"));
  const r1 = await pollOnce(deps());
  assert.equal(r1.islenmis, 2);
  assert.equal((await pb.stateGet()).next_offset, "3002");
  const r2 = await pollOnce(deps());
  assert.equal(r2.adet, 0);
});
test("GI7 private-chat + not-linked (gerçek path)", async () => {
  fake.state.sent.length = 0;
  await updateIsle(msg(4000, "/bakiye", { type: "group" }), deps());
  assert.match(fake.state.sent.at(-1).text, /özel sohbet/);
  fake.state.sent.length = 0;
  await updateIsle(msg(4001, "/bakiye", { fromId: "999888777" }), deps()); // linksiz → /data 404 (F2 iş yanıtı)
  assert.match(fake.state.sent.at(-1).text, /Önce hesabını bağla/);
});
test("GI8 /status endpoint metadata-only (linked/scope; fin data/id YOK)", async () => {
  const s = await pb.statusGet(TGID);
  assert.equal(s.linked, true); assert.equal(s.scope, "personal");
  assert.deepEqual(Object.keys(s).sort(), ["linked", "scope"]); // başka alan YOK (data/revision/user id yok)
  const s2 = await pb.statusGet("111222333"); // linksiz → 200 {linked:false}
  assert.equal(s2.linked, false);
});
test("GI9 group /link → ZERO PB mutation", async () => {
  const once = (await adminList("telegram_links")).length;
  fake.state.sent.length = 0;
  await updateIsle(msg(4500, "/link ABCD2345", { type: "group" }), deps());
  assert.match(fake.state.sent.at(-1).text, /özel sohbet/);
  assert.equal((await adminList("telegram_links")).length, once); // link tablosu değişmedi
});
test("GI10 /unlink e2e → aktif link pasifleşir", async () => {
  fake.state.sent.length = 0;
  await updateIsle(msg(5000, "/unlink"), deps());
  assert.match(fake.state.sent.at(-1).text, /kaldırıldı/);
  assert.equal((await adminList("telegram_links", `telegram_user_id = "${TGID}" && active = true`)).length, 0);
});
test("W5 commit-then-reply crash: pair-consume commit → reply crash → replay → idempotent success", async () => {
  // TGID artık unlinked (GI10). Taze pair-code al.
  const code = await pairCode();
  let n = 0;
  const crashTg = { sent: [], getUpdates: async () => [], sendMessage: async (c, t, e) => { n++; if (n === 1) throw new TransientError("reply crash"); crashTg.sent.push({ c, t }); return {}; } };
  const u = msg(6000, "/link " + code);
  const r1 = await updateIsle(u, { pb, tg: crashTg, bugunStr: "2026-08-27" });
  assert.equal(r1.failed, true);                       // pair-consume commit oldu ama reply çöktü
  const aktif1 = await adminList("telegram_links", `telegram_user_id = "${TGID}" && active = true`);
  assert.equal(aktif1.length, 1);                      // link ZATEN aktif (commit)
  // replay aynı update: kod artık "used" → status linked → idempotent BAŞARI (yanlış "geçersiz" YOK)
  const r2 = await updateIsle(u, { pb, tg: crashTg, bugunStr: "2026-08-27" });
  assert.equal(r2.done, true);
  assert.match(crashTg.sent.at(-1).t, /tamamlandı/);
  assert.doesNotMatch(crashTg.sent.at(-1).t, /geçersiz/);
  assert.equal((await adminList("telegram_links", `telegram_user_id = "${TGID}" && active = true`)).length, 1); // duplicate YOK
});
test("F1-01R real-PB fencing: complete 409 lease_mismatch → done DEĞİL, sonraki update claim edilmez, offset SABİT", async () => {
  const offsetOnce = (await pb.stateGet()).next_offset;
  const hijackTg = {
    getUpdates: async () => [msg(9000, "/help"), msg(9001, "/help")],
    sendMessage: async () => { // reply sırasında lease BAŞKA claimant'a geçer → gerçek 409 fencing
      const row = (await adminList("telegram_updates", `update_id = "9000"`))[0];
      await adminPatch("telegram_updates", row.id, { lease_token: "HIJACK-" + crypto.randomBytes(8).toString("hex") });
      return { message_id: 1 };
    },
  };
  const r = await pollOnce({ pb, tg: hijackTg, pollTimeout: 1, bugunStr: "2026-08-27" });
  assert.equal(r.islenmis, 0);                                                          // done/permanent YOK
  assert.ok(r.transient);                                                               // batch durdu + backoff sinyali
  assert.equal((await adminList("telegram_updates", `update_id = "9001"`)).length, 0);  // sonraki update claim EDİLMEDİ
  assert.notEqual((await adminList("telegram_updates", `update_id = "9000"`))[0].status, "done");
  assert.equal((await pb.stateGet()).next_offset, offsetOnce);                          // offset-success varsayımı YOK
});
test("F2-02/F2-04 enjekte DB hatası (tablo rename): status ASLA linked:false; unlink ASLA yalan 200; finansal komut done OLMAZ", async () => {
  // Seçici operasyonel hata: telegram_links tablosunu PB DIŞINDA yeniden adlandır → link sorguları
  // gerçek DB hatası üretir (HMAC/nonce tabloları sağlam → auth geçer, hata link katmanında).
  const { DatabaseSync } = await import("node:sqlite");
  const chmodDD = () => execSync(`docker run --rm --entrypoint /bin/sh -v "${DD}:/d" ghcr.io/muchobien/pocketbase:0.39.10 -c "chmod -R a+rwX /d"`, { stdio: "ignore" });
  const rename = (from, to) => { const db = new DatabaseSync(join(DD, "data.db")); db.exec(`ALTER TABLE ${from} RENAME TO ${to}`); db.close(); };
  execSync(`docker stop -t 20 ${C}`, { stdio: "ignore" });
  chmodDD();
  rename("telegram_links", "telegram_links_broken");
  execSync(`docker start ${C}`, { stdio: "ignore" });
  await pbBekle();
  try {
    await assert.rejects(() => pb.statusGet(TGID), TransientError);      // F2-02: 500 → Transient, {linked:false} DEĞİL
    await assert.rejects(() => pb.unlink(TGID), TransientError);         // F2-04: yalan 200/ok YOK
    const r = await updateIsle(msg(9500, "/bakiye"), deps());            // finansal komut DB hatasında
    assert.equal(r.failed, true);                                        // done DEĞİL → offset ilerlemez
    assert.notEqual((await adminList("telegram_updates", `update_id = "9500"`))[0].status, "done");
  } finally {
    execSync(`docker stop -t 20 ${C}`, { stdio: "ignore" });
    chmodDD();
    rename("telegram_links_broken", "telegram_links");
    execSync(`docker start ${C}`, { stdio: "ignore" });
    await pbBekle();
  }
  assert.equal((await pb.statusGet("999000999")).linked, false);         // restore doğrulama (gerçek no-link)
});
test("R16 outbound: /api/findata/kaydet = 0 ve users generic PATCH = 0 (tüm koşu boyunca)", () => {
  const kaydet = fetchLog.filter((f) => f.url.includes("/api/findata/kaydet"));
  const usersPatch = fetchLog.filter((f) => f.method === "PATCH" && /\/api\/collections\/users\//.test(f.url));
  assert.equal(kaydet.length, 0);
  assert.equal(usersPatch.length, 0);
  // gateway yalnız /api/tg/service/* çağırır
  assert.ok(fetchLog.every((f) => f.url.includes("/api/tg/service/")));
});
