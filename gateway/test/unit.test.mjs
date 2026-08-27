// Gateway UNIT testleri — docker YOK. Fake pb/tg/fetch/clock ile router + loop taksonomisi +
// backoff/retry + preflight + config + abort + liveness. Deterministik (enjekte sleep/random).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isle, komutCoz } from "../src/router.js";
import { updateIsle, pollOnce } from "../src/loop.js";
import { makeBackoff } from "../src/backoff.js";
import { tgIstemci, offsetSayi } from "../src/telegram.js";
import { pbIstemci } from "../src/pb.js";
import { preflight } from "../src/startup.js";
import { yapilandir } from "../src/config.js";
import { kalpAtisiBaslat } from "../src/health.js";
import { FatalConfigError, TransientError, PermanentUpdateError, UserInputError } from "../src/errors.js";
import * as M from "../src/messages.js";

const FINDATA = {
  hesaplar: [{ ad: "Vadesiz", tip: "banka", bakiye: 5000 }, { ad: "Kart", tip: "kart", bakiye: 1500 }],
  yatirimlar: [{ adet: 2, guncelFiyat: 100 }],
  gelirler: [{ tarih: "2026-08-27", miktar: 1000, baslik: "Maaş", kategori: "Maaş" }],
  giderler: [{ tarih: "2026-08-27", miktar: 200, baslik: "Market", kategori: "Market" }],
  abonelikler: [{ miktar: 100 }],
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeTg(o = {}) {
  const sent = [];
  return { sent, sendMessage: async (chat_id, text, extra) => { if (o.sendThrows) throw o.sendThrows; sent.push({ chat_id, text, extra }); return { message_id: sent.length }; }, getUpdates: async () => o.updates || [] };
}
function fakePb(o = {}) {
  const calls = [];
  const rec = (n, ...a) => calls.push([n, ...a.map((x) => String(x))]);
  return {
    calls,
    stateGet: async () => { rec("stateGet"); if (o.stateGet) return o.stateGet(); return { next_offset: o.nextOffset ?? "" }; },
    statusGet: async (t) => { rec("statusGet", t); if (o.statusGet) return o.statusGet(t); return { linked: o.linked ?? true, scope: "personal" }; },
    getData: async (t) => { rec("getData", t); if (o.getData) return o.getData(t); return o.dataStatus === 401 ? { status: 401, json: null } : { status: 200, json: { data: o.data ?? FINDATA, revision: 1, updated: "2026-08-27 10:00:00", scope: "personal" } }; },
    pairConsume: async (t, c) => { rec("pairConsume", t, c); if (o.pairConsume) return o.pairConsume(t, c); return { status: o.pairStatus ?? 200, json: o.pairStatus === 400 ? { message: "Kod geçersiz veya süresi dolmuş." } : { ok: true } }; },
    unlink: async (t) => { rec("unlink", t); if (o.unlink) return o.unlink(t); return { ok: true }; },
    updateClaim: async (u) => { rec("claim", u); if (o.claim) return o.claim(u); return { status: 200, json: { claimed: true, lease_token: "L" + u } }; },
    updateComplete: async (u, tok, failed = false) => { rec("complete", u, failed ? "failed" : "done"); if (o.complete) return o.complete(u, failed); return { status: 200, json: { ok: true } }; },
  };
}
const upd = (id, text, o = {}) => ({ update_id: id, message: { chat: { id: o.chatId ?? 999, type: o.type ?? "private" }, from: { id: o.fromId ?? 555, is_bot: o.isBot ?? false }, text } });

// ---- router dispatch ----
test("komutCoz slash/arg/@bot/menü", () => {
  assert.deepEqual(komutCoz("/link ABC"), { cmd: "/link", arg: "ABC" });
  assert.deepEqual(komutCoz("/bakiye@FinBot"), { cmd: "/bakiye", arg: "" });
  assert.deepEqual(komutCoz("📊 Bugün"), { cmd: "📊 Bugün", arg: "" });
});
test("/start (linked via /status, NOT /data) → menü + gizlilik; /data çağrılmaz", async () => {
  const tg = fakeTg(); const pb = fakePb({ linked: true });
  await isle(upd(1, "/start"), { pb, tg });
  assert.ok(tg.sent[0].extra.reply_markup);
  assert.match(tg.sent[0].text, /Telegram altyapısından geçer/); // R10 gizlilik
  assert.equal(pb.calls.filter((c) => c[0] === "getData").length, 0); // R8: /data yok
  assert.ok(pb.calls.some((c) => c[0] === "statusGet"));
});
test("/bakiye → Net Varlık (₺3.700)", async () => {
  const tg = fakeTg(); const pb = fakePb();
  await isle(upd(1, "/bakiye"), { pb, tg, bugunStr: "2026-08-27" });
  assert.match(tg.sent[0].text, /Net Varlık/);
  assert.match(tg.sent[0].text, /₺3\.700/);
});
test("📅 Bu Ay == /buay", async () => {
  const tg = fakeTg(); const pb = fakePb();
  await isle(upd(1, "📅 Bu Ay"), { pb, tg, bugunStr: "2026-08-27" });
  await isle(upd(2, "/buay"), { pb, tg, bugunStr: "2026-08-27" });
  assert.equal(tg.sent[0].text, tg.sent[1].text);
});
test("💳 Hesaplar + 📊 Bugün", async () => {
  const tg = fakeTg(); const pb = fakePb();
  await isle(upd(1, "💳 Hesaplar"), { pb, tg });
  await isle(upd(2, "📊 Bugün"), { pb, tg, bugunStr: "2026-08-27" });
  assert.match(tg.sent[0].text, /Net: ₺3\.500/);
  assert.match(tg.sent[1].text, /Günün gideri: ₺200/);
});
test("ÖZEL SOHBET: grup → veri sızmaz, status/data çağrılmaz", async () => {
  const tg = fakeTg(); const pb = fakePb();
  const r = await isle(upd(1, "/bakiye", { type: "group" }), { pb, tg });
  assert.equal(r.skip, "not_private");
  assert.match(tg.sent[0].text, /özel sohbet/);
  assert.equal(pb.calls.length, 0);
});
test("bottan mesaj işlenmez", async () => {
  const tg = fakeTg(); const pb = fakePb();
  const r = await isle(upd(1, "/bakiye", { isBot: true }), { pb, tg });
  assert.equal(r.skip, "from_bot"); assert.equal(tg.sent.length, 0);
});
test("bağlı değil → /bakiye 'önce bağlan'", async () => {
  const tg = fakeTg(); const pb = fakePb({ dataStatus: 401 });
  await isle(upd(1, "/bakiye"), { pb, tg });
  assert.match(tg.sent[0].text, /Önce hesabını bağla/);
});
test("/durum ve ⚙️ Bağlantı: iç ID GÖSTERİLMEZ (R9)", async () => {
  const tg = fakeTg(); const pb = fakePb({ linked: true });
  await isle(upd(1, "/durum", { fromId: 777123 }), { pb, tg });
  await isle(upd(2, "⚙️ Bağlantı", { fromId: 777123 }), { pb, tg });
  for (const s of tg.sent) { assert.doesNotMatch(s.text, /777123/); assert.doesNotMatch(s.text, /Telegram ID/); }
  assert.match(tg.sent[0].text, /bağlı/);
});

// ---- R15 local /link validation ----
test("R15 /link geçersiz format → güvenli mesaj + ZERO pair-consume", async () => {
  const tg = fakeTg(); const pb = fakePb();
  await isle(upd(1, "/link abc"), { pb, tg });          // 3 harf, küçük
  await isle(upd(2, "/link 12345678"), { pb, tg });      // yasak alfabe (0/1 yok ama rakam-only? 1 yasak)
  await isle(upd(3, "/link ABCDEFGI"), { pb, tg });      // I yasak
  assert.equal(pb.calls.filter((c) => c[0] === "pairConsume").length, 0);
  for (const s of tg.sent) assert.match(s.text, /8 karakter/);
});
test("R15 /link geçerli format → pair-consume (uppercase normalize)", async () => {
  const tg = fakeTg(); const pb = fakePb({ pairStatus: 200 });
  await isle(upd(1, "/link abcd2345"), { pb, tg });      // geçerli, küçük → upper
  assert.deepEqual(pb.calls.find((c) => c[0] === "pairConsume"), ["pairConsume", "555", "ABCD2345"]);
  assert.match(tg.sent[0].text, /tamamlandı/);
});
test("R15 kod mesajda/loglanmaz (geçersiz)", async () => {
  const tg = fakeTg(); const pb = fakePb();
  await isle(upd(1, "/link SECRET99"), { pb, tg });      // 8 ama 9? 'SECRET99' = 8 char, '9' ok, ama uzunluk 8? S-E-C-R-E-T-9-9 =8 → geçerli aslında
  // geçerli olduğundan pairConsume çağrılır; kod yalnız pb'ye gider, mesaja değil
  for (const s of tg.sent) assert.doesNotMatch(s.text, /SECRET99/);
});

// ---- R11 length bounding ----
test("R11 Bugün 500+ işlem → satır sınırı + '… X daha' + ≤3500 char", async () => {
  const big = { giderler: Array.from({ length: 500 }, (_, i) => ({ tarih: "2026-08-27", miktar: 10 + i, baslik: "İşlem" + i, kategori: "Market" })), gelirler: [] };
  const tg = fakeTg(); const pb = fakePb({ data: big });
  await isle(upd(1, "📊 Bugün"), { pb, tg, bugunStr: "2026-08-27" });
  assert.match(tg.sent[0].text, /işlem daha/);
  assert.ok(Array.from(tg.sent[0].text).length <= 3500);
});
test("R11 Hesaplar 100+ hesap → sınır + '… X daha' + ≤3500", async () => {
  const big = { hesaplar: Array.from({ length: 120 }, (_, i) => ({ ad: "Hesap" + i, tip: "banka", bakiye: 1000 + i })) };
  const tg = fakeTg(); const pb = fakePb({ data: big });
  await isle(upd(1, "💳 Hesaplar"), { pb, tg });
  assert.match(tg.sent[0].text, /hesap daha/);
  assert.ok(Array.from(tg.sent[0].text).length <= 3500);
});
test("R11 uzunlukGuvenli surrogate bölmez", () => {
  const s = "😀".repeat(4000);
  const g = M.uzunlukGuvenli(s, 100);
  assert.ok(Array.from(g).length <= 100);
  assert.ok(!/�/.test(g)); // bozuk replacement char yok
});

// ---- R10 privacy ----
test("R10 /help + /start gizlilik notu içerir; dosya yükleme kapalı der", async () => {
  const tg = fakeTg(); const pb = fakePb({ linked: false });
  await isle(upd(1, "/help"), { pb, tg });
  await isle(upd(2, "/start"), { pb, tg });
  for (const s of tg.sent) assert.match(s.text, /Hassas belge yükleme özelliği bu aşamada aktif değildir/);
});

// ---- R1 error taxonomy (loop) ----
test("R1 TG-BR01: PB 500 ×10 → HER seferinde failed, ASLA done (offset ilerlemez)", async () => {
  let done = 0, failed = 0;
  for (let i = 0; i < 10; i++) {
    const tg = fakeTg(); const pb = fakePb({ getData: () => { throw new TransientError("PB data 500"); } });
    const r = await updateIsle(upd(100, "/bakiye"), { pb, tg });
    assert.equal(r.failed, true);
    done += pb.calls.filter((c) => c[0] === "complete" && c[2] === "done").length;
    failed += pb.calls.filter((c) => c[0] === "complete" && c[2] === "failed").length;
  }
  assert.equal(done, 0); assert.equal(failed, 10); // poison→done YOK
});
test("R1 TG-BR02: Telegram 5xx (sendMessage) ×10 → hep failed, done YOK", async () => {
  let done = 0;
  for (let i = 0; i < 10; i++) {
    const tg = fakeTg({ sendThrows: new TransientError("sendMessage 500") }); const pb = fakePb();
    const r = await updateIsle(upd(101, "/help"), { pb, tg });
    assert.equal(r.failed, true);
    done += pb.calls.filter((c) => c[0] === "complete" && c[2] === "done").length;
  }
  assert.equal(done, 0);
});
test("R1 TG-BR03: sendMessage transient ASLA poison-skip (done) olmaz", async () => {
  const tg = fakeTg({ sendThrows: new TransientError("net") }); const pb = fakePb();
  const r = await updateIsle(upd(102, "/help"), { pb, tg });
  assert.equal(r.failed, true);
  assert.ok(pb.calls.some((c) => c[0] === "complete" && c[2] === "failed"));
  assert.ok(!pb.calls.some((c) => c[0] === "complete" && c[2] === "done"));
});
test("R1 FatalConfigError → yukarı fırlar, complete YOK", async () => {
  const tg = fakeTg({ sendThrows: new FatalConfigError("HMAC 401") }); const pb = fakePb();
  await assert.rejects(() => updateIsle(upd(103, "/help"), { pb, tg }), FatalConfigError);
  assert.equal(pb.calls.filter((c) => c[0] === "complete").length, 0);
});
test("R1 PermanentUpdateError (sendMessage 403 bot-blocked) → done, offset ilerler", async () => {
  const tg = fakeTg({ sendThrows: new PermanentUpdateError("bot blocked 403") }); const pb = fakePb();
  const r = await updateIsle(upd(104, "/help"), { pb, tg });
  assert.equal(r.permanent, true);
  assert.ok(pb.calls.some((c) => c[0] === "complete" && c[2] === "done"));
});
test("R1 UserInputError → güvenli yanıt + done", async () => {
  // isle içine UserInputError enjekte etmek için sendMessage ilk çağrıda UserInput fırlatan router yok;
  // updateIsle'ı doğrudan test et: sahte isle davranışı yerine gerçek /help sonrası done zaten kapsanır.
  // Burada hataYonet UserInput dalını sendThrows ile kanıtlayalım: ilk gönderim UserInput → safeText gönderilir.
  let n = 0;
  const tg = { sent: [], getUpdates: async () => [], sendMessage: async (c, t) => { n++; if (n === 1) throw new UserInputError("bad", "Güvenli mesaj"); tg.sent.push({ c, t }); return {}; } };
  const pb = fakePb();
  const r = await updateIsle(upd(105, "/help"), { pb, tg });
  assert.equal(r.done, true);
  assert.equal(tg.sent[0].t, "Güvenli mesaj");
});
test("updateIsle duplicate/busy", async () => {
  const dup = await updateIsle(upd(1, "/help"), { pb: fakePb({ claim: () => ({ status: 200, json: { claimed: false, duplicate: true } }) }), tg: fakeTg() });
  assert.equal(dup.duplicate, true);
  const busy = await updateIsle(upd(2, "/help"), { pb: fakePb({ claim: () => ({ status: 200, json: { claimed: false, busy: true } }) }), tg: fakeTg() });
  assert.equal(busy.busy, true);
});

// ---- R6 order preservation ----
test("R6 pollOnce: Telegram [1000,5] → SIRA korunur (1000 sonra 5), sort YOK, max YOK", async () => {
  const tg = { sent: [], getUpdates: async () => [upd(1000, "/help"), upd(5, "/help")], sendMessage: async () => ({}) };
  const pb = fakePb();
  const r = await pollOnce({ pb, tg });
  const completeSira = pb.calls.filter((c) => c[0] === "complete").map((c) => c[1]);
  assert.deepEqual(completeSira, ["1000", "5"]); // döndüğü sıra; max(1000) DEĞİL
  assert.equal(r.islenmis, 2);
});
test("R6 pollOnce: ilk update transient → BREAK + transient döner", async () => {
  const tg = { sent: [], getUpdates: async () => [upd(1, "/bakiye"), upd(2, "/help")], sendMessage: async () => ({}) };
  const pb = fakePb({ getData: () => { throw new TransientError("PB 500"); } });
  const r = await pollOnce({ pb, tg });
  assert.equal(r.islenmis, 0);
  assert.ok(r.transient instanceof TransientError);
  assert.equal(pb.calls.filter((c) => c[0] === "claim" && c[1] === "2").length, 0); // 2 claim edilmedi
});
test("R6 offsetSayi güvenli tamsayı sınırı", () => {
  assert.equal(offsetSayi("1001"), 1001);
  assert.equal(offsetSayi(""), null);
  assert.equal(offsetSayi("99999999999999999999"), null); // 20 hane → reddedilir
  assert.equal(offsetSayi("9007199254740993"), null); // > MAX_SAFE_INTEGER
});

// ---- R4 backoff + retry taxonomy ----
test("R4 backoff exp 1,2,4,8,16,30(max) + reset; retry_after honored", async () => {
  const uyku = []; const b = makeBackoff({ sleep: async (ms) => uyku.push(ms), random: () => 0 });
  for (let i = 0; i < 7; i++) await b.wait();
  assert.deepEqual(uyku, [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  b.reset(); uyku.length = 0;
  await b.wait(5000); // retry_after
  assert.deepEqual(uyku, [5000]);
});
test("R4 TG-B34: Telegram 429 → TransientError.retryAfterMs = retry_after×1000", async () => {
  const fetchImpl = async () => ({ ok: false, status: 429, json: async () => ({ ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 7 } }) });
  const tg = tgIstemci({ apiBase: "http://x", botToken: "T", fetchImpl });
  await assert.rejects(() => tg.getUpdates({ timeout: 1 }), (e) => e instanceof TransientError && e.retryAfterMs === 7000);
});
test("R4 TG-B35: Telegram 5xx → TransientError (retryAfterMs null)", async () => {
  const fetchImpl = async () => ({ ok: false, status: 502, json: async () => ({ ok: false, error_code: 502, description: "Bad Gateway" }) });
  const tg = tgIstemci({ apiBase: "http://x", botToken: "T", fetchImpl });
  await assert.rejects(() => tg.getUpdates({ timeout: 1 }), (e) => e instanceof TransientError && e.retryAfterMs == null);
});
test("R4 Telegram 401 → FatalConfigError (token mesajda yok)", async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ ok: false, error_code: 401, description: "Unauthorized" }) });
  const tg = tgIstemci({ apiBase: "http://x", botToken: "SECRETTOKEN", fetchImpl });
  await assert.rejects(() => tg.getMe(), (e) => e instanceof FatalConfigError && !/SECRETTOKEN/.test(e.message));
});
test("R4 TG-B36: PB 5xx → TransientError; PB 401/403 → FatalConfigError", async () => {
  const pb500 = pbIstemci({ pbUrl: "http://pb", gwSecret: "s", fetchImpl: async () => ({ status: 503, json: async () => ({}) }) });
  await assert.rejects(() => pb500.stateGet(), TransientError);
  const pb401 = pbIstemci({ pbUrl: "http://pb", gwSecret: "s", fetchImpl: async () => ({ status: 401, json: async () => ({}) }) });
  await assert.rejects(() => pb401.stateGet(), FatalConfigError);
});
test("R4/R14 TG-B15: PB her istek YENİ nonce + fetchImpl gerçekten kullanılır", async () => {
  const nonces = [];
  const fetchImpl = async (url, opts) => { nonces.push(opts.headers["X-TG-Nonce"]); return { status: 200, json: async () => ({ next_offset: "" }) }; };
  const pb = pbIstemci({ pbUrl: "http://pb", gwSecret: "s", fetchImpl });
  await pb.stateGet(); await pb.stateGet();
  assert.equal(nonces.length, 2);
  assert.notEqual(nonces[0], nonces[1]); // taze nonce (imza yeniden kullanılmaz)
});

// ---- R3 preflight ----
test("R3 TG-BR04: geçersiz Telegram token → preflight FatalConfig (fail-closed)", async () => {
  const pb = fakePb(); const tg = { getMe: async () => { throw new FatalConfigError("401"); } };
  await assert.rejects(() => preflight({ pb, tg }), FatalConfigError);
});
test("R3 TG-BR05: PB bad HMAC → preflight FatalConfig", async () => {
  const tg = { getMe: async () => ({ id: 1 }) };
  const pb = { getMe: async () => ({}), stateGet: async () => { throw new FatalConfigError("PB auth 401"); } };
  await assert.rejects(() => preflight({ pb, tg }), FatalConfigError);
});
test("R3 TG-BR06: getMe + PB state 200 → preflight OK", async () => {
  const tg = { getMe: async () => ({ id: 1, username: "bot" }) };
  const pb = { stateGet: async () => ({ next_offset: "" }) };
  assert.equal(await preflight({ pb, tg }), true);
});

// ---- R5 api-base lock ----
test("R5 TG-BR07: üretimde resmi-olmayan TG_API_BASE → fail-closed", () => {
  const base = { TG_BOT_TOKEN: "t", TG_GATEWAY_SECRET: "s", PB_URL: "http://pb" };
  assert.throws(() => yapilandir({ ...base, NODE_ENV: "production", TG_API_BASE: "http://evil.example" }));
  assert.equal(yapilandir({ ...base, NODE_ENV: "production" }).tgApiBase, "https://api.telegram.org");
  assert.equal(yapilandir({ ...base, NODE_ENV: "production", TG_API_BASE: "https://api.telegram.org" }).tgApiBase, "https://api.telegram.org");
  assert.equal(yapilandir({ ...base, NODE_ENV: "test", TG_API_BASE: "http://127.0.0.1:9" }).tgApiBase, "http://127.0.0.1:9"); // test override
});

// ---- R12 abort ----
test("R12 TG-B39: aktif long-poll + abort → getUpdates DERHAL reddeder", async () => {
  const fetchImpl = (url, opts) => new Promise((_, rej) => { opts.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))); });
  const tg = tgIstemci({ apiBase: "http://x", botToken: "T", fetchImpl });
  const ac = new AbortController();
  const p = tg.getUpdates({ timeout: 50, signal: ac.signal });
  ac.abort(new Error("shutdown"));
  await assert.rejects(p, (e) => e.name === "AbortError" || /abort/i.test(e.message));
});

// ---- R13 liveness ----
test("R13 TG-B40: heartbeat timer Telegram'dan BAĞIMSIZ ilerler (outage-independent)", async () => {
  const f = join(mkdtempSync(join(tmpdir(), "hb-")), "beat");
  const stop = kalpAtisiBaslat(f, 20);
  const t1 = Number(readFileSync(f, "utf8"));
  await delay(80); // bu sürede HİÇ getUpdates yok (outage simülasyonu)
  const t2 = Number(readFileSync(f, "utf8"));
  stop();
  assert.ok(t2 > t1); // event-loop canlı → heartbeat taze
});
test("R16 heartbeat dosyası YALNIZ zaman damgası içerir (user/financial içerik YOK)", async () => {
  const f = join(mkdtempSync(join(tmpdir(), "hb2-")), "beat");
  const stop = kalpAtisiBaslat(f, 1000);
  const icerik = readFileSync(f, "utf8");
  stop();
  assert.match(icerik, /^[0-9]+$/); // yalnız epoch ms
});
