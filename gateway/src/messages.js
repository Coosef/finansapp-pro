// ============================================================
// Telegram mesaj biçimlendirme (düz metin — parse_mode yok, kaçış derdi yok).
// Para biçimi: lib/format.js TL (Intl tr-TR TRY). Menü butonları (reply keyboard)
// dispatch ile BİREBİR eşleşen sabit metinler kullanır.
// ============================================================
import { TL } from "../../src/lib/format.js";
import { HESAP_TIP } from "../../src/lib/constants.js";

// Menü buton metinleri — router.js bunlarla eşleştirir.
export const BTN = { BUGUN: "📊 Bugün", BUAY: "📅 Bu Ay", HESAPLAR: "💳 Hesaplar", BAGLANTI: "⚙️ Bağlantı" };

export const ANA_MENU = {
  keyboard: [[{ text: BTN.BUGUN }, { text: BTN.BUAY }], [{ text: BTN.HESAPLAR }, { text: BTN.BAGLANTI }]],
  resize_keyboard: true,
};

const AY_ADI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const ayAdiOf = (bugunStr) => AY_ADI[parseInt(String(bugunStr).slice(5, 7), 10) - 1] || "Bu ay";
const tipIcon = (tip) => (HESAP_TIP.find((t) => t.id === tip) || {}).icon || "•";
const tipLabel = (tip) => (HESAP_TIP.find((t) => t.id === tip) || {}).label || tip;

export function karsilamaMesaji(bagli) {
  if (bagli) return "👋 FinansApp'e bağlısın. Aşağıdaki menüden veya komutlardan devam et.\n\n/bakiye · /buay · 📊 Bugün · 💳 Hesaplar";
  return [
    "👋 FinansApp Telegram botuna hoş geldin.",
    "",
    "Hesabını bağlamak için uygulamada Ayarlar → Telegram'dan bir eşleşme kodu al, sonra buraya yaz:",
    "",
    "/link KODUN",
    "",
    "Bu bot yalnızca OKUMA amaçlıdır — bakiye/gelir/gider görüntüler, hiçbir şey değiştirmez.",
  ].join("\n");
}

export function yardimMesaji() {
  return [
    "📖 Komutlar",
    "",
    "/link KOD — hesabını bağla (koda uygulamadan alırsın)",
    "/durum — bağlantı durumu",
    "/bakiye — Net Varlık (nakit + yatırım)",
    "/buay — bu ayın gelir/gider/net özeti",
    "/unlink — bağlantıyı kaldır",
    "",
    "Menü: 📊 Bugün · 📅 Bu Ay · 💳 Hesaplar · ⚙️ Bağlantı",
    "",
    "Yalnızca okuma — bot verini değiştirmez.",
  ].join("\n");
}

export function bagliDegilMesaji() {
  return "🔒 Önce hesabını bağla. Uygulamada Ayarlar → Telegram'dan kod al ve buraya yaz:\n\n/link KODUN";
}

export function durumMesaji(bilgi) {
  // bilgi: { tgid, scope, updated }
  const guncel = bilgi.updated ? `\nSon veri güncelleme: ${String(bilgi.updated).slice(0, 16).replace("T", " ")}` : "";
  return `✅ Bağlısın.\nTelegram ID: ${bilgi.tgid}\nKapsam: ${bilgi.scope || "personal"} (yalnız kişisel, okuma)${guncel}`;
}

export function baglantiMesaji(bilgi) {
  return [
    "⚙️ Bağlantı",
    "",
    `Durum: bağlı ✅`,
    `Telegram ID: ${bilgi.tgid}`,
    `Kapsam: ${bilgi.scope || "personal"} · yalnız okuma`,
    "",
    "Bağlantıyı kaldırmak için: /unlink",
  ].join("\n");
}

export function bakiyeMesaji(oz) {
  return [
    "💰 Net Varlık",
    `${TL(oz.netVarlik)}`,
    "",
    `• Net Nakit: ${TL(oz.nakit)}`,
    `• Yatırım: ${TL(oz.yatirim)}`,
  ].join("\n");
}

export function buAyMesaji(oz, bugunStr) {
  const satirlar = [
    `📅 ${ayAdiOf(bugunStr)} özeti`,
    "",
    `Gelir:  ${TL(oz.gelir)}`,
    `Gider:  ${TL(oz.giderToplam)}  (abonelik dahil)`,
    `Net:    ${TL(oz.net)}`,
    `Tasarruf oranı: %${Math.round(oz.tasarrufOrani)}`,
  ];
  if (oz.kategoriler.length) {
    satirlar.push("", "En çok harcama:");
    oz.kategoriler.forEach((k) => satirlar.push(`  • ${k.kategori}: ${TL(k.toplam)} (%${Math.round(k.pct)})`));
  }
  return satirlar.join("\n");
}

export function bugunMesaji(oz) {
  const satirlar = [`📊 Bugün (${oz.tarih})`, ""];
  if (oz.islemSayisi === 0) {
    satirlar.push("Bugün kayıtlı işlem yok.");
  } else {
    oz.giderler.forEach((x) => satirlar.push(`− ${x.baslik}${x.kategori ? " · " + x.kategori : ""}: ${TL(x.miktar)}`));
    oz.gelirler.forEach((x) => satirlar.push(`+ ${x.baslik}${x.kategori ? " · " + x.kategori : ""}: ${TL(x.miktar)}`));
    satirlar.push("", `Günün gideri: ${TL(oz.gunGider)} · geliri: ${TL(oz.gunGelir)}`);
  }
  return satirlar.join("\n");
}

export function hesaplarMesaji(oz) {
  const satirlar = ["💳 Hesaplar", ""];
  if (!oz.hesaplar.length) {
    satirlar.push("Kayıtlı hesap yok.");
  } else {
    oz.hesaplar.forEach((h) => satirlar.push(`${tipIcon(h.tip)} ${h.ad} (${tipLabel(h.tip)}): ${TL(h.bakiye)}`));
    satirlar.push("", `Varlık: ${TL(oz.varlik)}  −  Borç: ${TL(oz.borc)}`, `Net: ${TL(oz.net)}`);
  }
  return satirlar.join("\n");
}

export const linkBasariMesaji = () => "✅ Hesabın bağlandı. Artık bakiye ve özetleri görebilirsin.\n\n/bakiye · /buay · 📊 Bugün";
export const linkHataMesaji = (msg) => `⚠️ ${msg || "Kod geçersiz veya süresi dolmuş."}`;
export const linkKullanimMesaji = () => "Kullanım: /link KODUN\n\nKodu uygulamada Ayarlar → Telegram'dan alırsın.";
export const unlinkMesaji = () => "🔌 Bağlantı kaldırıldı. İstersen /link ile tekrar bağlanabilirsin.";
export const cokFazlaDenemeMesaji = () => "⏳ Çok fazla deneme. Lütfen biraz sonra tekrar dene.";
export const hataMesaji = () => "⚠️ Şu an bir sorun oluştu. Lütfen biraz sonra tekrar dene.";
export const ozelDegilMesaji = () => "🔒 Bu bot yalnızca özel sohbette çalışır. Lütfen bana özelden yaz.";
