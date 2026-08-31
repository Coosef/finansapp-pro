// ============================================================
// Komut yönlendirme + işleyiciler. Kimlik = NUMERİK telegram_user_id (username'e GÜVENİLMEZ).
// ÖZEL SOHBET zorunlu: grup/kanal → finansal veri/işlem YOK.
// READ-ONLY: /api/findata/kaydet YOK. Link-varlık kontrolleri /status (metadata); /data YALNIZ
// gerçek finansal okuma komutları için (R8). Hata sınıfları (Transient/Fatal/Permanent/UserInput)
// yukarı fırlar → loop.js taksonomisi yönetir.
// ============================================================
import { bugun as bugunBul } from "../../src/lib/format.js";
import { bakiyeOzeti, buAyOzeti, bugunOzeti, hesaplarOzeti } from "./summary.js";
import * as M from "./messages.js";
import { TransientError, UserInputError } from "./errors.js";

const SORU_MAX_CP = 500;                 // PB'deki sınırla aynı; burada ergonomi/trafik guard'ı
// T2C.2 — PB'nin dayanıklı upstream slot tavanının AYNASI. Karar PB'nin bildirdiği
// `attempt`/`exhausted` alanlarına göre verilir; gateway kendi başına sayım TUTMAZ.
const MAX_UPSTREAM_ATTEMPTS = 2;
const cpUzunluk = (s) => Array.from(String(s ?? "")).length;

const KOD_ALFABE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // pairing alfabesi (pb migration ile aynı)
const KOD_RE = new RegExp(`^[${KOD_ALFABE}]{8}$`);

export function komutCoz(text) {
  const t = String(text || "").trim();
  if (!t) return { cmd: "", arg: "" };
  if (t.startsWith("/")) {
    const bosluk = t.indexOf(" ");
    let cmd = bosluk === -1 ? t : t.slice(0, bosluk);
    const arg = bosluk === -1 ? "" : t.slice(bosluk + 1).trim();
    cmd = cmd.split("@")[0].toLowerCase();
    return { cmd, arg };
  }
  return { cmd: t, arg: "" };
}

export async function isle(update, deps) {
  const { pb, tg } = deps;
  const bugunStr = deps.bugunStr || bugunBul();
  const msg = update && update.message;
  if (!msg) return { skip: "no_message" };
  const chat = msg.chat || {};
  const from = msg.from || {};
  if (from.is_bot) return { skip: "from_bot" };

  if (chat.type !== "private") {                          // ÖZEL SOHBET zorunlu → sızıntı yok
    await tg.sendMessage(chat.id, M.ozelDegilMesaji());
    return { skip: "not_private" };
  }
  const tgid = String(from.id);
  const chatId = chat.id;
  const { cmd, arg } = komutCoz(msg.text);
  const gonder = (text, extra) => tg.sendMessage(chatId, M.uzunlukGuvenli(text), extra); // R11 generic guard

  // /status ile bağlı mı? (metadata; finansal veri YOK) — R8.
  const bagliMi = async () => (await pb.statusGet(tgid)).linked;
  // Finansal veri getir (YALNIZ finansal komutlar). F2: 404 → GERÇEKTEN bağlı değil (iş yanıtı);
  // 401/403 auth-drift pb.getData'da Fatal fırlar → ASLA "Önce hesabını bağla" olarak raporlanmaz.
  async function findataGetir() {
    const r = await pb.getData(tgid);
    if (r.status === 200) return r.json;
    await gonder(M.bagliDegilMesaji()); // yalnız 404 buraya ulaşır (diğer her şey throw)
    return null;
  }

  switch (cmd) {
    case "/start": {
      const bagli = await bagliMi();                      // R7/R8: /status, /data DEĞİL
      await gonder(M.karsilamaMesaji(bagli), bagli ? { reply_markup: M.ANA_MENU } : undefined);
      return { ok: "start" };
    }
    case "/help":
      await gonder(M.yardimMesaji());
      return { ok: "help" };

    case "/link": {
      const kod = String(arg || "").split(/\s+/)[0].toUpperCase();
      if (!kod) { await gonder(M.linkKullanimMesaji()); return { ok: "link_usage" }; }
      // R15: yerel doğrulama — 8 haneli, doğru alfabe. Geçersiz → güvenli mesaj + pair-consume YOK.
      if (!KOD_RE.test(kod)) { await gonder(M.linkGecersizFormatMesaji()); return { ok: "link_badformat" }; } // kod LOGLANMAZ
      const r = await pb.pairConsume(tgid, kod);
      if (r.status === 200) { hafizaTemizle(deps, tgid); await gonder(M.linkBasariMesaji(), { reply_markup: M.ANA_MENU }); return { ok: "link" }; }
      if (r.status === 429) { await gonder(M.cokFazlaDenemeMesaji()); return { ok: "link_rl" }; }
      if (r.status === 409) { await gonder(M.linkHataMesaji("Bağlantı çakışması. Tekrar dene.")); return { ok: "link_conflict" }; }
      if (r.status === 400) {
        // R2: commit-then-reply crash penceresi — kod "used" ama tgid ZATEN doğru bağlıysa
        // replay idempotent BAŞARI'dır; yanlış "kod geçersiz" DEME.
        if (await bagliMi()) { hafizaTemizle(deps, tgid); await gonder(M.linkBasariMesaji(), { reply_markup: M.ANA_MENU }); return { ok: "link_idem" }; }
        await gonder(M.linkHataMesaji(r.json && r.json.message));
        return { ok: "link_bad" };
      }
      // F1: pb.pairConsume yalnız 200/400/409/429 döndürür; başka durum orada AÇIK HATA olarak
      // fırlar (fallback-done YOK) → buraya ulaşılamaz.
      throw new Error("pairConsume sözleşme dışı durum"); // savunma; erişilemez
    }
    case "/unlink":
      await pb.unlink(tgid);                               // 5xx→Transient throw → yalan yok (R7)
      hafizaTemizle(deps, tgid);                           // T2C: kimlik sınırı → konuşma belleği sıfırlanır
      await gonder(M.unlinkMesaji());
      return { ok: "unlink" };

    case "/durum":
    case M.BTN.BAGLANTI: {
      const s = await pb.statusGet(tgid);                 // R8 metadata; R9 iç ID gösterilmez
      if (s.linked) { await gonder(cmd === "/durum" ? M.durumMesaji() : M.baglantiMesaji()); return { ok: "durum" }; }
      await gonder(M.bagliDegilMesaji());
      return { ok: "durum_unlinked" };
    }

    case "/bakiye": {
      const fd = await findataGetir(); if (!fd) return { ok: "bakiye_unlinked" };
      await gonder(M.bakiyeMesaji(bakiyeOzeti(fd.data)));
      return { ok: "bakiye" };
    }
    case "/buay":
    case M.BTN.BUAY: {
      const fd = await findataGetir(); if (!fd) return { ok: "buay_unlinked" };
      await gonder(M.buAyMesaji(buAyOzeti(fd.data, bugunStr), bugunStr));
      return { ok: "buay" };
    }
    case M.BTN.BUGUN: {
      const fd = await findataGetir(); if (!fd) return { ok: "bugun_unlinked" };
      await gonder(M.bugunMesaji(bugunOzeti(fd.data, bugunStr)));
      return { ok: "bugun" };
    }
    case M.BTN.HESAPLAR: {
      const fd = await findataGetir(); if (!fd) return { ok: "hesaplar_unlinked" };
      await gonder(M.hesaplarMesaji(hesaplarOzeti(fd.data)));
      return { ok: "hesaplar" };
    }

    case "/sor": {
      const soru = String(arg || "").trim();
      if (!soru) { await gonder(M.sorKullanimMesaji()); return { ok: "sor_usage" }; } // AI çağrısı YOK
      return await aiIsle({ deps, gonder, tgid, update, soru });
    }

    default: {
      // BİLİNMEYEN/BOZUK SLASH KOMUT → yardım. ASLA AI'ya gitmez (yazım hatası ücretli
      // çağrı üretmemeli). Menü butonları ve bilinen komutlar zaten yukarıda ele alındı.
      if (cmd.startsWith("/")) { await gonder(M.yardimMesaji()); return { ok: "help_fallback" }; }
      // SERBEST METİN (özel sohbet, slash yok, menü butonu değil):
      //   bağlı  → AI
      //   değil  → mevcut bağlanma yönlendirmesi
      if (!(await bagliMi())) { await gonder(M.bagliDegilMesaji()); return { ok: "free_unlinked" }; }
      return await aiIsle({ deps, gonder, tgid, update, soru: String(msg.text || "").trim() });
    }
  }
}

// T2C: konuşma belleği kimlik sınırında temizlenir (best-effort RAM durumu).
function hafizaTemizle(deps, tgid) {
  try { if (deps.aiHafiza) deps.aiHafiza.temizle(tgid); } catch (_) { /* RAM durumu; kritik değil */ }
}

// ---- AI dalı ----
// Sıra GÜVENLİK-KRİTİK: history OKUNUR → PB aiAsk → Telegram gönder → (loop) updateComplete →
// ANCAK BUNDAN SONRA bellek işlenir. Bu yüzden burada bellek YAZILMAZ; yalnız `afterComplete`
// metadata'sı döner ve loop.js başarılı complete'ten sonra uygular.
async function aiIsle({ deps, gonder, tgid, update, soru }) {
  const { pb } = deps;
  if (!soru) { await gonder(M.soruGecersizMesaji()); return { ok: "ai_bad_input" }; }
  if (cpUzunluk(soru) > SORU_MAX_CP) { await gonder(M.soruUzunMesaji()); return { ok: "ai_too_long" }; } // AI çağrısı YOK

  const history = deps.aiHafiza ? deps.aiHafiza.al(tgid) : [];
  const r = await pb.aiAsk({ tgid, updateId: update.update_id, question: soru, history });
  const j = r.json || {};

  if (r.status === 200) {
    await gonder(j.answer);                       // GÜVENİLMEZ düz metin: parse/eval/komut YOK
    // Bellek YALNIZ updateComplete başarılı olduktan sonra işlenir (response-loss güvenliği).
    return { ok: "ai", afterComplete: { type: "ai_memory_commit", tgid: String(tgid), q: soru, a: j.answer } };
  }
  if (r.status === 404) {                          // gerçekten bağlı değil
    hafizaTemizle(deps, tgid);
    await gonder(M.bagliDegilMesaji());
    return { ok: "ai_unlinked" };
  }
  if (r.status === 400) throw new UserInputError("ai bad_question", M.soruGecersizMesaji());
  if (r.status === 429) throw new UserInputError("ai rate_limited", M.aiLimitMesaji()); // aynı update RETRY EDİLMEZ
  if (r.status === 409) {
    if (j.error === "processing") throw new TransientError("PB ai processing (aktif lease)"); // 2. upstream YOK
    if (j.error === "idempotency_conflict") throw new UserInputError("ai idempotency_conflict", M.aiCakismaMesaji());
    // provider_unavailable
    if (j.reason === "no_key") throw new UserInputError("ai no_key", M.aiAnahtarYokMesaji());
    if (j.reason === "local_only") throw new UserInputError("ai local_only", M.aiYerelSaglayiciMesaji());
    throw new UserInputError("ai unsupported", M.aiModelDesteklenmiyorMesaji());
  }
  if (r.status === 502 && j.class === "auth") throw new UserInputError("ai upstream auth", M.aiAnahtarRedMesaji());
  if (r.status === 502 && j.class === "invalid") throw new UserInputError("ai upstream invalid", M.aiBozukYanitMesaji());

  // 502 transient | 504 upstream_timeout → SINIRLI retry bütçesi.
  //
  // T2C.2: BÜTÇE OTORİTESİ PB'DİR (`telegram_ai_results.upstream_attempts`), gateway'in
  // `reclaimed` bayrağı DEĞİL. `reclaimed=true` yalnızca "bu update daha önce bir kez
  // claim edilip başarısız oldu" demektir; GERÇEK bir ücretli çağrı yapıldığını KANITLAMAZ
  // (409 processing, PB iç 503 ve upstream öncesi hatalar da reclaimed üretir). Bu yüzden
  // `deps.reclaimed` burada KULLANILMAZ — kullanılırsa ilk gerçek 502/transient yanlışlıkla
  // ikinci başarısızlık sayılır ve 409 processing bütçe tüketmiş olurdu.
  //
  // exhausted=true  → bütçe zaten doluydu, sağlayıcı ÇAĞRILMADI → güvenli terminal mesaj.
  // attempt >= MAX  → gerçek ikinci başarısızlık → güvenli terminal mesaj + done.
  // attempt <  MAX  → TransientError (update failed → backoff → yeniden claim).
  if (j.exhausted === true) throw new UserInputError("ai upstream budget exhausted", M.aiGeciciHataMesaji());
  if (Number(j.attempt) >= MAX_UPSTREAM_ATTEMPTS) throw new UserInputError(`ai upstream transient (attempt ${j.attempt})`, M.aiGeciciHataMesaji());
  throw new TransientError(`PB ai upstream ${r.status}${j.class ? "/" + j.class : ""} attempt=${j.attempt}`);
}
