// ============================================================
// Komut yönlendirme + işleyiciler. Kimlik = NUMERİK telegram_user_id (username'e GÜVENİLMEZ).
// ÖZEL SOHBET zorunlu: grup/kanal/supergroup → finansal veri ÇÖZÜLMEZ.
// READ-ONLY: yalnız T1A okuma endpoint'leri (pair-consume/unlink hariç); /api/findata/kaydet YOK.
// ============================================================
import { bugun as bugunBul } from "../../src/lib/format.js";
import { bakiyeOzeti, buAyOzeti, bugunOzeti, hesaplarOzeti } from "./summary.js";
import * as M from "./messages.js";

// "/link ABC" → { cmd:"/link", arg:"ABC" }; "📊 Bugün" → { cmd:"📊 Bugün", arg:"" }
export function komutCoz(text) {
  const t = String(text || "").trim();
  if (!t) return { cmd: "", arg: "" };
  if (t.startsWith("/")) {
    const bosluk = t.indexOf(" ");
    let cmd = bosluk === -1 ? t : t.slice(0, bosluk);
    const arg = bosluk === -1 ? "" : t.slice(bosluk + 1).trim();
    cmd = cmd.split("@")[0].toLowerCase(); // /bakiye@Bot → /bakiye
    return { cmd, arg };
  }
  return { cmd: t, arg: "" }; // menü butonu metni
}

// Bir güncellemeyi işle. deps: { pb, tg, bugunStr? }. Yan etki: tg.sendMessage.
export async function isle(update, deps) {
  const { pb, tg } = deps;
  const bugunStr = deps.bugunStr || bugunBul();
  const msg = update && update.message;
  if (!msg) return { skip: "no_message" };                 // yalnız message türü
  const chat = msg.chat || {};
  const from = msg.from || {};
  if (from.is_bot) return { skip: "from_bot" };            // botlardan gelen mesajı işleme

  // ÖZEL SOHBET zorunlu — grup/kanalda finansal veri sızdırma.
  if (chat.type !== "private") {
    await tg.sendMessage(chat.id, M.ozelDegilMesaji());
    return { skip: "not_private" };
  }
  const tgid = String(from.id);
  const chatId = chat.id;
  const { cmd, arg } = komutCoz(msg.text);

  // Bağlıysa findata getir; değilse null + kullanıcıya "önce bağlan" der (fin. komutları için).
  async function findataGetir() {
    const r = await pb.getData(tgid);
    if (r.status === 200 && r.json) return r.json; // { data, revision, updated, scope }
    if (r.status === 401) { await tg.sendMessage(chatId, M.bagliDegilMesaji()); return null; }
    throw new Error(`getData beklenmeyen durum: ${r.status}`); // → geçici hata (retry)
  }
  const gonder = (text, extra) => tg.sendMessage(chatId, text, extra);

  switch (cmd) {
    case "/start": {
      const r = await pb.getData(tgid);
      const bagli = r.status === 200;
      await gonder(M.karsilamaMesaji(bagli), bagli ? { reply_markup: M.ANA_MENU } : undefined);
      return { ok: "start" };
    }
    case "/help":
      await gonder(M.yardimMesaji());
      return { ok: "help" };

    case "/link": {
      if (!arg) { await gonder(M.linkKullanimMesaji()); return { ok: "link_usage" }; }
      const r = await pb.pairConsume(tgid, arg.split(/\s+/)[0]);
      if (r.status === 200) { await gonder(M.linkBasariMesaji(), { reply_markup: M.ANA_MENU }); return { ok: "link" }; }
      if (r.status === 429) { await gonder(M.cokFazlaDenemeMesaji()); return { ok: "link_rl" }; }
      if (r.status === 409) { await gonder(M.linkHataMesaji("Bağlantı çakışması. Tekrar dene.")); return { ok: "link_conflict" }; }
      if (r.status === 400) { await gonder(M.linkHataMesaji(r.json && r.json.message)); return { ok: "link_bad" }; }
      throw new Error(`pairConsume beklenmeyen durum: ${r.status}`);
    }
    case "/unlink":
      await pb.unlink(tgid);
      await gonder(M.unlinkMesaji());
      return { ok: "unlink" };

    case "/durum":
    case M.BTN.BAGLANTI: {
      const r = await pb.getData(tgid);
      if (r.status === 200 && r.json) {
        const mesaj = cmd === "/durum" ? M.durumMesaji({ tgid, scope: r.json.scope, updated: r.json.updated }) : M.baglantiMesaji({ tgid, scope: r.json.scope });
        await gonder(mesaj);
        return { ok: "durum" };
      }
      if (r.status === 401) { await gonder(M.bagliDegilMesaji()); return { ok: "durum_unlinked" }; }
      throw new Error(`getData beklenmeyen durum: ${r.status}`);
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
