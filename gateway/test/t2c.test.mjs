// ============================================================
// T2C — Telegram AI gateway yönlendirme + konuşma belleği birim testleri.
// Sahte PB/Telegram istemcileri; gerçek router/loop/ai-memory kodu.
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { isle } from "../src/router.js";
import { updateIsle } from "../src/loop.js";
import { aiHafiza } from "../src/ai-memory.js";
import { TransientError, FatalConfigError, UserInputError } from "../src/errors.js";
import * as M from "../src/messages.js";

const TGID = "555000111";
const upd = (text, opts = {}) => ({
  update_id: opts.updateId || 9001,
  message: { chat: { id: 42, type: opts.chatType || "private" }, from: { id: opts.tgid || TGID, is_bot: false }, text },
});

function fakeTg(opts = {}) {
  const sent = [];
  return {
    sent,
    async sendMessage(chatId, text, extra) {
      sent.push({ chatId, text, extra });
      if (opts.fail) throw opts.fail;
      return { message_id: sent.length };
    },
  };
}

// aiYanit: sabit yanıt veya (cagriNo) => yanıt
function fakePb({ linked = true, aiYanit = { status: 200, json: { answer: "AI cevabı" } }, claim } = {}) {
  const cagrilar = [];
  const aiIstekler = [];
  let aiNo = 0;
  return {
    cagrilar, aiIstekler,
    async statusGet(tgid) { cagrilar.push(["status", tgid]); return { linked }; },
    async getData(tgid) { cagrilar.push(["data", tgid]); return { status: 200, json: { data: {}, revision: 1 } }; },
    async pairConsume(tgid, kod) { cagrilar.push(["pair", tgid]); return { status: 200, json: { ok: true } }; },
    async unlink(tgid) { cagrilar.push(["unlink", tgid]); return { status: 200, json: { ok: true } }; },
    async stateGet() { cagrilar.push(["state"]); return { next_offset: "" }; },
    async updateClaim(uid, tgid, kind) {
      cagrilar.push(["claim", uid]);
      return { status: 200, json: claim || { claimed: true, lease_token: "lt" } };
    },
    async updateComplete(uid, token, failed) { cagrilar.push(["complete", uid, !!failed]); return { status: 200, json: { ok: true } }; },
    async aiAsk(req) {
      aiNo += 1;
      aiIstekler.push(req);
      cagrilar.push(["ai", req.updateId]);
      return typeof aiYanit === "function" ? aiYanit(aiNo) : aiYanit;
    },
  };
}
const aiSayisi = (pb) => pb.cagrilar.filter((c) => c[0] === "ai").length;

// ---- Yönlendirme ----
test("AI-T2C-01 /sor bağlı kullanıcı → aiAsk", async () => {
  const pb = fakePb(), tg = fakeTg();
  const r = await isle(upd("/sor Bu ay en çok neye harcadım?"), { pb, tg });
  assert.equal(r.ok, "ai");
  assert.equal(aiSayisi(pb), 1);
  assert.equal(pb.aiIstekler[0].question, "Bu ay en çok neye harcadım?");
  assert.equal(tg.sent[0].text, "AI cevabı");
});

test("AI-T2C-02 bağlı kullanıcı serbest metni → aiAsk", async () => {
  const pb = fakePb(), tg = fakeTg();
  const r = await isle(upd("Geçen aya göre giderim arttı mı?"), { pb, tg });
  assert.equal(r.ok, "ai");
  assert.equal(pb.aiIstekler[0].question, "Geçen aya göre giderim arttı mı?");
});

test("AI-T2C-03 bağlı OLMAYAN serbest metin → bağlanma yönlendirmesi, AI çağrısı 0", async () => {
  const pb = fakePb({ linked: false }), tg = fakeTg();
  const r = await isle(upd("Bütçemi aşmış mıyım?"), { pb, tg });
  assert.equal(r.ok, "free_unlinked");
  assert.equal(aiSayisi(pb), 0);
  assert.equal(tg.sent[0].text, M.bagliDegilMesaji());
});

test("AI-T2C-04 bilinmeyen slash → yardım, AI çağrısı 0", async () => {
  for (const t of ["/foo", "/sil", "/ekle", "/sorx", "/"]) {
    const pb = fakePb(), tg = fakeTg();
    const r = await isle(upd(t), { pb, tg });
    assert.equal(r.ok, "help_fallback", t);
    assert.equal(aiSayisi(pb), 0, t);
    assert.equal(tg.sent[0].text, M.yardimMesaji(), t);
  }
});

test("AI-T2C-05 menü butonları ve mevcut komutlar deterministik kalır, AI çağrısı 0", async () => {
  const deterministik = ["/start", "/help", "/durum", "/bakiye", "/buay", "/unlink",
    M.BTN.BUGUN, M.BTN.BUAY, M.BTN.HESAPLAR, M.BTN.BAGLANTI];
  for (const t of deterministik) {
    const pb = fakePb(), tg = fakeTg();
    await isle(upd(t), { pb, tg });
    assert.equal(aiSayisi(pb), 0, t + " AI'ya gitmemeli");
  }
});

test("AI-T2C-06 /sor argümansız → kullanım mesajı, AI çağrısı 0", async () => {
  const pb = fakePb(), tg = fakeTg();
  const r = await isle(upd("/sor"), { pb, tg });
  assert.equal(r.ok, "sor_usage");
  assert.equal(aiSayisi(pb), 0);
  assert.equal(tg.sent[0].text, M.sorKullanimMesaji());
});

test("AI-T2C-07 500 code point üstü → yerel ret, AI çağrısı 0", async () => {
  const pb = fakePb(), tg = fakeTg();
  const r = await isle(upd("é".repeat(501)), { pb, tg });
  assert.equal(r.ok, "ai_too_long");
  assert.equal(aiSayisi(pb), 0);
  assert.equal(tg.sent[0].text, M.soruUzunMesaji());
});

test("AI-T2C-08 tam 500 code point → kabul edilir", async () => {
  const pb = fakePb(), tg = fakeTg();
  const r = await isle(upd("é".repeat(500)), { pb, tg });
  assert.equal(r.ok, "ai");
  assert.equal(aiSayisi(pb), 1);
});

test("AI-T2C-09/10 200 yanıt → TEK Telegram mesajı, düz metin olarak", async () => {
  const pb = fakePb({ aiYanit: { status: 200, json: { answer: "**kalın** <b>x</b> /start" } } });
  const tg = fakeTg();
  await isle(upd("soru"), { pb, tg });
  assert.equal(tg.sent.length, 1, "tek mesaj — bölme YOK");
  assert.equal(tg.sent[0].text, "**kalın** <b>x</b> /start", "yorumlanmadan iletilir");
  assert.equal(tg.sent[0].extra, undefined, "parse_mode verilmez");
});

test("AI-T2C-09b sözleşme dışı uzun yanıt savunmacı biçimde kırpılır", async () => {
  const pb = fakePb({ aiYanit: { status: 200, json: { answer: "x".repeat(9000) } } });
  const tg = fakeTg();
  await isle(upd("soru"), { pb, tg });
  assert.equal(tg.sent.length, 1);
  assert.ok(Array.from(tg.sent[0].text).length <= 3500);
});

// ---- Hata taksonomisi ----
const uiTest = async (yanit, beklenenMetin) => {
  const pb = fakePb({ aiYanit: yanit }), tg = fakeTg();
  await assert.rejects(() => isle(upd("soru"), { pb, tg }), (e) => {
    assert.ok(e instanceof UserInputError, "UserInputError bekleniyor, alınan " + e.name);
    assert.equal(e.safeText, beklenenMetin);
    return true;
  });
};

test("AI-T2C-11 no_key → kullanıcı yapılandırma yönlendirmesi", () =>
  uiTest({ status: 409, json: { error: "provider_unavailable", reason: "no_key" } }, M.aiAnahtarYokMesaji()));

test("AI-T2C-12 local_only → kullanıcı yapılandırma yönlendirmesi", () =>
  uiTest({ status: 409, json: { error: "provider_unavailable", reason: "local_only" } }, M.aiYerelSaglayiciMesaji()));

test("AI-T2C-13 unsupported → kullanıcı yapılandırma yönlendirmesi", () =>
  uiTest({ status: 409, json: { error: "provider_unavailable", reason: "unsupported" } }, M.aiModelDesteklenmiyorMesaji()));

test("AI-T2C-14 upstream auth → anahtar yönlendirmesi (süreç fatal DEĞİL)", () =>
  uiTest({ status: 502, json: { error: "upstream", class: "auth" } }, M.aiAnahtarRedMesaji()));

test("AI-T2C-15 rate limit → terminal kullanıcı mesajı", () =>
  uiTest({ status: 429, json: { error: "rate_limited" } }, M.aiLimitMesaji()));

test("AI-T2C-16 idempotency_conflict → fail-closed güvenli mesaj (eski cevap YOK)", async () => {
  const pb = fakePb({ aiYanit: { status: 409, json: { error: "idempotency_conflict" } } }), tg = fakeTg();
  await assert.rejects(() => isle(upd("soru"), { pb, tg }), (e) => {
    assert.ok(e instanceof UserInputError);
    assert.equal(e.safeText, M.aiCakismaMesaji());
    assert.ok(!/[0-9a-f]{16,}/.test(e.safeText), "iç kimlik/hash sızmamalı");
    return true;
  });
});

test("AI-T2C-17 processing → TransientError (retry; ikinci upstream YOK)", async () => {
  const pb = fakePb({ aiYanit: { status: 409, json: { error: "processing" } } }), tg = fakeTg();
  await assert.rejects(() => isle(upd("soru"), { pb, tg }), (e) => e instanceof TransientError);
});

test("AI-T2C-18 upstream transient İLK deneme → TransientError (failed/backoff)", async () => {
  for (const y of [{ status: 502, json: { error: "upstream", class: "transient" } }, { status: 504, json: { error: "upstream_timeout" } }]) {
    const pb = fakePb({ aiYanit: y }), tg = fakeTg();
    await assert.rejects(() => isle(upd("soru"), { pb, tg, reclaimed: false }), (e) => e instanceof TransientError);
  }
});

test("AI-T2C-19/20 reclaimed + ikinci geçici hata → güvenli terminal mesaj + done", async () => {
  for (const y of [{ status: 502, json: { error: "upstream", class: "transient" } }, { status: 504, json: { error: "upstream_timeout" } }]) {
    const pb = fakePb({ aiYanit: y }), tg = fakeTg();
    await assert.rejects(() => isle(upd("soru"), { pb, tg, reclaimed: true }), (e) => {
      assert.ok(e instanceof UserInputError);
      assert.equal(e.safeText, M.aiGeciciHataMesaji());
      return true;
    });
  }
  // loop seviyesinde: UserInputError → güvenli mesaj + complete(done)
  const pb = fakePb({ aiYanit: { status: 504, json: { error: "upstream_timeout" } }, claim: { claimed: true, reclaimed: true, lease_token: "lt" } });
  const tg = fakeTg();
  const r = await updateIsle(upd("soru"), { pb, tg });
  assert.deepEqual(r, { done: true, userInput: true });
  assert.equal(pb.cagrilar.filter((c) => c[0] === "complete" && c[2] === false).length, 1, "done olarak tamamlanmalı");
});

test("AI-T2C-21 PB HMAC 401/403 → FatalConfigError (pb istemcisinden)", async () => {
  const { pbIstemci } = await import("../src/pb.js");
  for (const st of [401, 403]) {
    const pb = pbIstemci({ pbUrl: "http://x", gwSecret: "s", fetchImpl: async () => ({ status: st, ok: false, json: async () => ({}) }) });
    await assert.rejects(() => pb.aiAsk({ tgid: "1", updateId: "2", question: "q", history: [] }), (e) => e instanceof FatalConfigError);
  }
});

test("AI-T2C-22 beklenmeyen PB durumu/şeması → fail-closed FatalConfigError", async () => {
  const { pbIstemci } = await import("../src/pb.js");
  const sapmalar = [
    { status: 200, body: {} },                                   // answer yok
    { status: 200, body: { answer: "" } },                        // boş answer
    { status: 204, body: {} },                                    // sözleşme dışı durum
    { status: 409, body: { error: "baska" } },                     // bilinmeyen 409 alt-türü
    { status: 502, body: { error: "upstream", class: "garip" } },  // bilinmeyen sınıf
    { status: 400, body: { error: "baska" } },
  ];
  for (const s of sapmalar) {
    const pb = pbIstemci({ pbUrl: "http://x", gwSecret: "s", fetchImpl: async () => ({ status: s.status, ok: true, json: async () => s.body }) });
    await assert.rejects(() => pb.aiAsk({ tgid: "1", updateId: "2", question: "q", history: [] }),
      (e) => e instanceof FatalConfigError, JSON.stringify(s));
  }
});

test("AI-T2C-23 PB İÇ 5xx (500/503) → TransientError, FatalConfigError DEĞİL (T2C.1 F8)", async () => {
  // BİLİNÇLİ İSTİSNA: PB'nin kendi altyapı hatası (restart / 503 unavailable / panic) bir
  // protokol sözleşmesi sapması DEĞİLDİR → süreci fail-closed kapatmaz, update yeniden denenir
  // (offset İLERLEMEZ). 502/504 ise PB'nin BELGELENMİŞ AI protokol kodlarıdır ve bu dala girmez.
  const { pbIstemci } = await import("../src/pb.js");
  for (const st of [500, 503, 599]) {
    const pb = pbIstemci({ pbUrl: "http://x", gwSecret: "s", fetchImpl: async () => ({ status: st, ok: false, json: async () => ({ error: "internal" }) }) });
    await assert.rejects(() => pb.aiAsk({ tgid: "1", updateId: "2", question: "q", history: [] }),
      (e) => e instanceof TransientError && !(e instanceof FatalConfigError), `status ${st}`);
  }
  // 502/504 TransientError DEĞİL: şema doğrulamasından geçer, router taksonomisi karar verir.
  for (const y of [{ status: 502, body: { error: "upstream", class: "transient" } }, { status: 504, body: { error: "upstream_timeout" } }]) {
    const pb = pbIstemci({ pbUrl: "http://x", gwSecret: "s", fetchImpl: async () => ({ status: y.status, ok: false, json: async () => y.body }) });
    const r = await pb.aiAsk({ tgid: "1", updateId: "2", question: "q", history: [] });
    assert.equal(r.status, y.status);
  }
});

test("AI-T2C-TIMEOUT AI ucu 60 s, diğer uçlar 15 s (global değişiklik YOK)", async () => {
  const { pbIstemci } = await import("../src/pb.js");
  const gorulen = [];
  const yavas = async (url) => { gorulen.push(url); return { status: 200, ok: true, json: async () => ({ answer: "a", next_offset: "", linked: true }) }; };
  const pb = pbIstemci({ pbUrl: "http://x", gwSecret: "s", pbTimeoutMs: 15000, pbAiTimeoutMs: 60000, fetchImpl: yavas });
  await pb.aiAsk({ tgid: "1", updateId: "2", question: "q", history: [] });
  await pb.stateGet();
  assert.deepEqual(gorulen, ["http://x/api/tg/service/ai", "http://x/api/tg/service/state/get"]);
});

// ---- Gizlilik / read-only ----
test("AI-T2C-PRIV-01 AI yolunda /data (ham findata) İSTENMEZ", async () => {
  const pb = fakePb(), tg = fakeTg();
  await isle(upd("soru"), { pb, tg });
  assert.equal(pb.cagrilar.filter((c) => c[0] === "data").length, 0, "ham users.data gateway'e çekilmemeli");
});

test("AI-T2C-PRIV-02 aiAsk gövdesi YALNIZ sözleşme alanlarını taşır", async () => {
  const pb = fakePb(), tg = fakeTg();
  const hafiza = aiHafiza();
  hafiza.isle(TGID, "önceki soru", "önceki cevap");
  await isle(upd("yeni soru"), { pb, tg, aiHafiza: hafiza });
  const istek = pb.aiIstekler[0];
  assert.deepEqual(Object.keys(istek).sort(), ["history", "question", "tgid", "updateId"]);
  const ham = JSON.stringify(istek);
  for (const y of ["apiKey", "anahtar", "revision", "email", "user_id", "link_id"]) {
    assert.ok(!ham.includes(y), "yasak alan: " + y);
  }
});

test("AI-T2C-RO-01/02/03 yazma niyetli metin AI'ya gider ama hiçbir yazma yolu yok", async () => {
  for (const q of ["500 TL market harcaması ekle", "Dünkü gideri sil", "Bakiyemi 10000 yap", "Bu transferi gerçekleştir"]) {
    const pb = fakePb(), tg = fakeTg();
    const r = await isle(upd(q), { pb, tg });
    assert.equal(r.ok, "ai", q);
    // pb istemcisinde finansal yazma metodu YOK; çağrılan uçlar yalnız status+ai.
    const uclar = new Set(pb.cagrilar.map((c) => c[0]));
    assert.ok(!uclar.has("kaydet") && !uclar.has("patch"), "finansal yazma ucu yok");
    assert.deepEqual([...uclar].sort(), ["ai", "status"], q);
  }
});

test("AI-T2C-PRIVATE-01 grup/kanal serbest metni → AI çağrısı 0", async () => {
  for (const tip of ["group", "supergroup", "channel"]) {
    const pb = fakePb(), tg = fakeTg();
    const r = await isle(upd("Bu ay ne harcadım?", { chatType: tip }), { pb, tg });
    assert.equal(r.skip, "not_private", tip);
    assert.equal(aiSayisi(pb), 0, tip);
  }
});

// ---- Konuşma belleği ----
test("AI-T2C-MEM-01 ilk soruda history boş", async () => {
  const pb = fakePb(), tg = fakeTg();
  await isle(upd("ilk"), { pb, tg, aiHafiza: aiHafiza() });
  assert.deepEqual(pb.aiIstekler[0].history, []);
});

test("AI-T2C-MEM-02 başarılı complete SONRASI sonraki soru önceki çifti taşır", async () => {
  const hafiza = aiHafiza();
  const pb = fakePb(), tg = fakeTg();
  await updateIsle(upd("soru1", { updateId: 1 }), { pb, tg, aiHafiza: hafiza });
  await updateIsle(upd("soru2", { updateId: 2 }), { pb, tg, aiHafiza: hafiza });
  assert.deepEqual(pb.aiIstekler[0].history, []);
  assert.deepEqual(pb.aiIstekler[1].history, [{ q: "soru1", a: "AI cevabı" }]);
});

test("AI-T2C-MEM-03 yalnız son 2 çift tutulur", async () => {
  const hafiza = aiHafiza();
  const pb = fakePb(), tg = fakeTg();
  for (let i = 1; i <= 4; i++) await updateIsle(upd("soru" + i, { updateId: i }), { pb, tg, aiHafiza: hafiza });
  assert.deepEqual(pb.aiIstekler[3].history.map((h) => h.q), ["soru2", "soru3"]);
});

test("AI-T2C-MEM-04 q/a 400 code point ile sınırlı", () => {
  const h = aiHafiza();
  h.isle(TGID, "é".repeat(600), "à".repeat(700));
  const g = h.al(TGID)[0];
  assert.equal(Array.from(g.q).length, 400);
  assert.equal(Array.from(g.a).length, 400);
});

test("AI-T2C-MEM-05 TTL 15 dk hareketsizlikten sonra düşer", () => {
  let t = 1_000_000;
  const h = aiHafiza({ simdi: () => t });
  h.isle(TGID, "q", "a");
  t += 14 * 60000; assert.equal(h.al(TGID).length, 1, "14 dk'da hâlâ var");
  t += 2 * 60000;  assert.deepEqual(h.al(TGID), [], "16 dk'da düşmeli");
  assert.equal(h._hamBoyut(), 0, "bayat giriş silinmeli");
});

test("AI-T2C-MEM-06 global 500 giriş sınırı + LRU tahliye", () => {
  const h = aiHafiza();
  for (let i = 0; i < 520; i++) h.isle("tg" + i, "q", "a");
  assert.equal(h.boyut(), 500);
  assert.deepEqual(h.al("tg0"), [], "en eski tahliye edilmeli");
  assert.equal(h.al("tg519").length, 1, "en yeni durmalı");
});

test("AI-T2C-MEM-07 bellek updateComplete'ten ÖNCE işlenmez", async () => {
  const hafiza = aiHafiza();
  const pb = fakePb(), tg = fakeTg();
  const r = await isle(upd("soru"), { pb, tg, aiHafiza: hafiza });
  assert.equal(r.afterComplete.type, "ai_memory_commit");
  assert.deepEqual(hafiza.al(TGID), [], "router bellek YAZMAZ");
});

test("AI-T2C-MEM-08 Telegram gönderimi başarısız → retry AYNI history'yi gönderir", async () => {
  const hafiza = aiHafiza();
  const pb = fakePb();
  const tgHatali = fakeTg({ fail: new TransientError("sendMessage 500") });
  const r1 = await updateIsle(upd("soru1", { updateId: 7 }), { pb, tg: tgHatali, aiHafiza: hafiza });
  assert.ok(r1.failed, "gönderim hatası → failed");
  assert.deepEqual(hafiza.al(TGID), [], "bellek işlenmemeli");
  const tgOk = fakeTg();
  await updateIsle(upd("soru1", { updateId: 7 }), { pb, tg: tgOk, aiHafiza: hafiza });
  assert.deepEqual(pb.aiIstekler[0].history, pb.aiIstekler[1].history, "history birebir aynı");
  assert.equal(pb.aiIstekler[0].updateId, pb.aiIstekler[1].updateId);
  assert.equal(pb.aiIstekler[0].question, pb.aiIstekler[1].question);
});

test("AI-T2C-MEM-09 updateComplete başarısız → retry AYNI history'yi gönderir", async () => {
  const hafiza = aiHafiza();
  const pb = fakePb();
  let ilk = true;
  const orj = pb.updateComplete.bind(pb);
  pb.updateComplete = async (uid, token, failed) => {
    if (ilk && !failed) { ilk = false; throw new TransientError("complete 500"); }
    return orj(uid, token, failed);
  };
  const tg = fakeTg();
  const r1 = await updateIsle(upd("soru1", { updateId: 8 }), { pb, tg, aiHafiza: hafiza });
  assert.ok(r1.failed);
  assert.deepEqual(hafiza.al(TGID), [], "complete başarısızken bellek işlenmez");
  await updateIsle(upd("soru1", { updateId: 8 }), { pb, tg, aiHafiza: hafiza });
  assert.deepEqual(pb.aiIstekler[0].history, pb.aiIstekler[1].history);
});

test("AI-T2C-MEM-10/11/12 kimlik sınırı bellek temizler", async () => {
  // /unlink
  let hafiza = aiHafiza(); hafiza.isle(TGID, "q", "a");
  await isle(upd("/unlink"), { pb: fakePb(), tg: fakeTg(), aiHafiza: hafiza });
  assert.deepEqual(hafiza.al(TGID), [], "/unlink temizler");
  // /link başarı
  hafiza = aiHafiza(); hafiza.isle(TGID, "q", "a");
  await isle(upd("/link ABCD2345"), { pb: fakePb(), tg: fakeTg(), aiHafiza: hafiza });
  assert.deepEqual(hafiza.al(TGID), [], "/link başarısı temizler");
  // AI not_linked
  hafiza = aiHafiza(); hafiza.isle(TGID, "q", "a");
  const pb = fakePb({ aiYanit: { status: 404, json: { error: "not_linked" } } });
  const r = await isle(upd("soru"), { pb, tg: fakeTg(), aiHafiza: hafiza });
  assert.equal(r.ok, "ai_unlinked");
  assert.deepEqual(hafiza.al(TGID), [], "not_linked temizler");
});

test("AI-T2C-MEM-13 bellek NUMERİK tgid ile anahtarlanır (kullanıcılar izole)", async () => {
  const hafiza = aiHafiza();
  const pb = fakePb(), tg = fakeTg();
  await updateIsle(upd("A sorusu", { updateId: 11, tgid: "111" }), { pb, tg, aiHafiza: hafiza });
  await updateIsle(upd("B sorusu", { updateId: 12, tgid: "222" }), { pb, tg, aiHafiza: hafiza });
  assert.deepEqual(pb.aiIstekler[1].history, [], "B, A'nın geçmişini görmez");
});

test("AI-T2C-IDEM-01 cevap üretildi ama teslim başarısız → aynı update_id + soru + history", async () => {
  const hafiza = aiHafiza();
  const pb = fakePb();
  const r1 = await updateIsle(upd("tek soru", { updateId: 55 }), { pb, tg: fakeTg({ fail: new TransientError("net") }), aiHafiza: hafiza });
  assert.ok(r1.failed);
  await updateIsle(upd("tek soru", { updateId: 55 }), { pb, tg: fakeTg(), aiHafiza: hafiza });
  const [a, b] = pb.aiIstekler;
  assert.equal(JSON.stringify(a), JSON.stringify(b), "PB'ye giden istek byte-eşdeğer olmalı");
});
