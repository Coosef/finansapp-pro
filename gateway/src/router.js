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
  // Finansal veri getir (YALNIZ finansal komutlar). 401 → bağlı değil.
  async function findataGetir() {
    const r = await pb.getData(tgid);
    if (r.status === 200 && r.json) return r.json;
    await gonder(M.bagliDegilMesaji());
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
      if (r.status === 200) { await gonder(M.linkBasariMesaji(), { reply_markup: M.ANA_MENU }); return { ok: "link" }; }
      if (r.status === 429) { await gonder(M.cokFazlaDenemeMesaji()); return { ok: "link_rl" }; }
      if (r.status === 409) { await gonder(M.linkHataMesaji("Bağlantı çakışması. Tekrar dene.")); return { ok: "link_conflict" }; }
      if (r.status === 400) {
        // R2: commit-then-reply crash penceresi — kod "used" ama tgid ZATEN doğru bağlıysa
        // replay idempotent BAŞARI'dır; yanlış "kod geçersiz" DEME.
        if (await bagliMi()) { await gonder(M.linkBasariMesaji(), { reply_markup: M.ANA_MENU }); return { ok: "link_idem" }; }
        await gonder(M.linkHataMesaji(r.json && r.json.message));
        return { ok: "link_bad" };
      }
      // beklenmeyen 2xx/4xx → güvenli fallback
      await gonder(M.linkHataMesaji());
      return { ok: "link_unexpected" };
    }
    case "/unlink":
      await pb.unlink(tgid);                               // 5xx→Transient throw → yalan yok (R7)
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

    default:
      await gonder(M.yardimMesaji());
      return { ok: "help_fallback" };
  }
}
