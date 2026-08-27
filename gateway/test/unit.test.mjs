// Gateway UNIT testleri — docker YOK. Fake pb/tg ile router dispatch + loop semantiği.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isle, komutCoz } from "../src/router.js";
import { updateIsle, pollOnce } from "../src/loop.js";

const FINDATA = {
  hesaplar: [{ ad: "Vadesiz", tip: "banka", bakiye: 5000 }, { ad: "Kart", tip: "kart", bakiye: 1500 }],
  yatirimlar: [{ adet: 2, guncelFiyat: 100 }],
  gelirler: [{ tarih: "2026-08-27", miktar: 1000, baslik: "Maaş", kategori: "Maaş" }],
  giderler: [{ tarih: "2026-08-27", miktar: 200, baslik: "Market", kategori: "Market" }],
  abonelikler: [{ miktar: 100 }],
};

function fakeTg() {
  const sent = [];
  return { sent, sendMessage: async (chat_id, text, extra) => { sent.push({ chat_id, text, extra }); return { message_id: sent.length }; } };
}
function fakePb(opts = {}) {
  const calls = [];
  const dataStatus = opts.dataStatus ?? 200;
  return {
    calls,
    stateGet: async () => ({ status: 200, json: { next_offset: opts.nextOffset ?? "" } }),
    getData: async (tgid) => { calls.push(["getData", tgid]); return dataStatus === 200 ? { status: 200, json: { data: opts.data ?? FINDATA, revision: 1, updated: "2026-08-27 10:00:00", scope: "personal" } } : { status: dataStatus, json: null }; },
    pairConsume: async (tgid, code) => { calls.push(["pairConsume", tgid, code]); return { status: opts.pairStatus ?? 200, json: (opts.pairStatus === 400) ? { message: "Kod geçersiz veya süresi dolmuş." } : { ok: true } }; },
    unlink: async (tgid) => { calls.push(["unlink", tgid]); return { status: 200, json: { ok: true } }; },
    updateClaim: async (uid, tgid, kind) => { calls.push(["claim", String(uid)]); return opts.claim ? opts.claim(uid) : { status: 200, json: { claimed: true, lease_token: "lease-" + uid } }; },
    updateComplete: async (uid, token, failed = false) => { calls.push(["complete", String(uid), failed ? "failed" : "done"]); return { status: 200, json: { ok: true } }; },
  };
}
const upd = (id, text, o = {}) => ({ update_id: id, message: { chat: { id: o.chatId ?? 999, type: o.type ?? "private" }, from: { id: o.fromId ?? 555, is_bot: o.isBot ?? false }, text } });

test("komutCoz: slash/arg/@bot/menü", () => {
  assert.deepEqual(komutCoz("/link ABC"), { cmd: "/link", arg: "ABC" });
  assert.deepEqual(komutCoz("/bakiye@FinBot"), { cmd: "/bakiye", arg: "" });
  assert.deepEqual(komutCoz("📊 Bugün"), { cmd: "📊 Bugün", arg: "" });
});

test("/bakiye (linked) → Net Varlık mesajı", async () => {
  const tg = fakeTg(); const pb = fakePb();
  await isle(upd(1, "/bakiye"), { pb, tg, bugunStr: "2026-08-27" });
  assert.match(tg.sent[0].text, /Net Varlık/);
  assert.match(tg.sent[0].text, /₺3\.700/); // 3500 nakit + 200 yatırım
});

test("📅 Bu Ay ve /buay aynı özeti verir", async () => {
  const tg = fakeTg(); const pb = fakePb();
  await isle(upd(1, "📅 Bu Ay"), { pb, tg, bugunStr: "2026-08-27" });
  await isle(upd(2, "/buay"), { pb, tg, bugunStr: "2026-08-27" });
  assert.match(tg.sent[0].text, /Gelir:\s+₺1\.000/);
  assert.equal(tg.sent[0].text, tg.sent[1].text);
});

test("📊 Bugün → bugünkü işlemler + gün toplamı", async () => {
  const tg = fakeTg(); const pb = fakePb();
  await isle(upd(1, "📊 Bugün"), { pb, tg, bugunStr: "2026-08-27" });
  assert.match(tg.sent[0].text, /Bugün \(2026-08-27\)/);
  assert.match(tg.sent[0].text, /Günün gideri: ₺200/);
});

test("💳 Hesaplar → hesap listesi + varlık/borç/net", async () => {
  const tg = fakeTg(); const pb = fakePb();
  await isle(upd(1, "💳 Hesaplar"), { pb, tg });
  assert.match(tg.sent[0].text, /Vadesiz/);
  assert.match(tg.sent[0].text, /Net: ₺3\.500/);
});

test("ÖZEL SOHBET zorunlu: grup → veri sızmaz, getData çağrılmaz", async () => {
  const tg = fakeTg(); const pb = fakePb();
  const r = await isle(upd(1, "/bakiye", { type: "group" }), { pb, tg });
  assert.equal(r.skip, "not_private");
  assert.match(tg.sent[0].text, /özel sohbet/);
  assert.equal(pb.calls.filter((c) => c[0] === "getData").length, 0); // finansal veri çözülmedi
});

test("bottan gelen mesaj işlenmez", async () => {
  const tg = fakeTg(); const pb = fakePb();
  const r = await isle(upd(1, "/bakiye", { isBot: true }), { pb, tg });
  assert.equal(r.skip, "from_bot");
  assert.equal(tg.sent.length, 0);
});

test("bağlı değil → /bakiye 'önce bağlan'", async () => {
  const tg = fakeTg(); const pb = fakePb({ dataStatus: 401 });
  await isle(upd(1, "/bakiye"), { pb, tg });
  assert.match(tg.sent[0].text, /Önce hesabını bağla/);
});

test("/link KOD → pairConsume + başarı; /link (arg yok) → kullanım", async () => {
  const tg = fakeTg(); const pb = fakePb({ pairStatus: 200 });
  await isle(upd(1, "/link ABC123"), { pb, tg });
  assert.deepEqual(pb.calls.find((c) => c[0] === "pairConsume"), ["pairConsume", "555", "ABC123"]);
  assert.match(tg.sent[0].text, /bağlandı/);
  const tg2 = fakeTg();
  await isle(upd(2, "/link"), { pb: fakePb(), tg: tg2 });
  assert.match(tg2.sent[0].text, /Kullanım: \/link/);
});

test("/link geçersiz kod (400) → hata mesajı", async () => {
  const tg = fakeTg(); const pb = fakePb({ pairStatus: 400 });
  await isle(upd(1, "/link WRONG"), { pb, tg });
  assert.match(tg.sent[0].text, /Kod geçersiz/);
});

test("/link 429 → çok fazla deneme", async () => {
  const tg = fakeTg(); const pb = fakePb({ pairStatus: 429 });
  await isle(upd(1, "/link X"), { pb, tg });
  assert.match(tg.sent[0].text, /Çok fazla deneme/);
});

test("/help ve /start(linked) menü ile", async () => {
  const tg = fakeTg(); const pb = fakePb();
  await isle(upd(1, "/help"), { pb, tg });
  assert.match(tg.sent[0].text, /Komutlar/);
  await isle(upd(2, "/start"), { pb, tg });
  assert.ok(tg.sent[1].extra && tg.sent[1].extra.reply_markup); // menü klavyesi
});

test("bilinmeyen komut → yardım fallback", async () => {
  const tg = fakeTg(); const pb = fakePb();
  await isle(upd(1, "asdfqwer"), { pb, tg });
  assert.match(tg.sent[0].text, /Komutlar/);
});

// ---- loop semantiği ----
test("updateIsle: claimed → işle + complete(done)", async () => {
  const tg = fakeTg(); const pb = fakePb();
  const r = await updateIsle(upd(10, "/help"), { pb, tg, poisonSayac: new Map() });
  assert.equal(r.done, true);
  assert.ok(pb.calls.some((c) => c[0] === "complete" && c[1] === "10" && c[2] === "done"));
});

test("updateIsle: duplicate → işlenmez, complete YOK", async () => {
  const tg = fakeTg(); const pb = fakePb({ claim: () => ({ status: 200, json: { claimed: false, duplicate: true } }) });
  const r = await updateIsle(upd(11, "/help"), { pb, tg, poisonSayac: new Map() });
  assert.equal(r.duplicate, true);
  assert.equal(tg.sent.length, 0);
  assert.equal(pb.calls.filter((c) => c[0] === "complete").length, 0);
});

test("updateIsle: busy (lease aktif) → ilerleme yok", async () => {
  const tg = fakeTg(); const pb = fakePb({ claim: () => ({ status: 200, json: { claimed: false, busy: true } }) });
  const r = await updateIsle(upd(12, "/help"), { pb, tg, poisonSayac: new Map() });
  assert.equal(r.busy, true);
});

test("updateIsle: geçici hata → complete(failed), offset ilerlemez", async () => {
  const tg = fakeTg(); const pb = fakePb({ dataStatus: 500 }); // getData 500 → isle throw
  const r = await updateIsle(upd(13, "/bakiye"), { pb, tg, poisonSayac: new Map(), poisonMax: 3 });
  assert.equal(r.failed, true);
  assert.ok(pb.calls.some((c) => c[0] === "complete" && c[2] === "failed"));
});

test("updateIsle: poison guard → poisonMax'ta done olarak atlanır + özür", async () => {
  const sayac = new Map();
  let r;
  for (let i = 0; i < 3; i++) {
    const tg = fakeTg(); const pb = fakePb({ dataStatus: 500 });
    r = await updateIsle(upd(14, "/bakiye"), { pb, tg, poisonSayac: sayac, poisonMax: 3 });
    if (r.poison) { assert.ok(pb.calls.some((c) => c[0] === "complete" && c[2] === "done")); assert.match(tg.sent.at(-1).text, /sorun oluştu/); }
  }
  assert.equal(r.poison, true);
});

// pollOnce için tg: getUpdates + sendMessage birlikte.
function fakeTgFull(updates) {
  const sent = [];
  return { sent, getUpdates: async () => updates, sendMessage: async (chat_id, text, extra) => { sent.push({ chat_id, text, extra }); return { message_id: sent.length }; } };
}

test("pollOnce: sırasız gelen update'ler artan update_id ile işlenir; complete 1,2,3", async () => {
  const tg = fakeTgFull([upd(3, "/help"), upd(1, "/help"), upd(2, "/help")]);
  const pb = fakePb();
  const r = await pollOnce({ pb, tg, poisonSayac: new Map(), pollTimeout: 1, pollLimit: 50 });
  assert.equal(r.islenmis, 3);
  const completeSirasi = pb.calls.filter((c) => c[0] === "complete").map((c) => c[1]);
  assert.deepEqual(completeSirasi, ["1", "2", "3"]); // artan sırada tamamlandı
});

test("pollOnce: ilk update geçici hata → BREAK, sonrakine geçilmez (offset korunur)", async () => {
  const tg = fakeTgFull([upd(1, "/bakiye"), upd(2, "/help")]);
  const pb = fakePb({ dataStatus: 500 }); // update1 /bakiye → getData 500 → failed
  const r = await pollOnce({ pb, tg, poisonSayac: new Map(), pollTimeout: 1, pollLimit: 50 });
  assert.equal(r.islenmis, 0);
  assert.ok(pb.calls.some((c) => c[0] === "complete" && c[1] === "1" && c[2] === "failed"));
  assert.equal(pb.calls.filter((c) => c[0] === "claim" && c[1] === "2").length, 0); // update2 CLAIM edilmedi
});

test("pollOnce: kalpAtısı getUpdates sonrası çağrılır", async () => {
  const tg = fakeTgFull([]);
  let atti = false;
  await pollOnce({ pb: fakePb(), tg, poisonSayac: new Map(), kalpAtisi: () => { atti = true; } });
  assert.equal(atti, true);
});
