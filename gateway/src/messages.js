// ============================================================
// Telegram mesaj biçimlendirme (düz metin). Para: lib/format.js TL. Menü butonları dispatch ile
// birebir. R9: iç ID (Telegram/PB/link) gösterilmez. R10: gizlilik notu. R11: satır sınırı +
// generic uzunluk guard (surrogate güvenli). R15: geçersiz format mesajı (kod loglanmaz).
// ============================================================
import { TL } from "../../src/lib/format.js";
import { HESAP_TIP } from "../../src/lib/constants.js";

export const BTN = { BUGUN: "📊 Bugün", BUAY: "📅 Bu Ay", HESAPLAR: "💳 Hesaplar", BAGLANTI: "⚙️ Bağlantı" };
export const ANA_MENU = {
  keyboard: [[{ text: BTN.BUGUN }, { text: BTN.BUAY }], [{ text: BTN.HESAPLAR }, { text: BTN.BAGLANTI }]],
  resize_keyboard: true,
};

const MAX_UZUNLUK = 3500;         // Telegram güvenli iç sınır (limit 4096; pay bırak)
const MAX_SATIR_BUGUN = 20;       // Bugün: en çok N işlem satırı + "… X daha"
const MAX_SATIR_HESAP = 25;       // Hesaplar: en çok N hesap + "… X daha"

const AY_ADI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const ayAdiOf = (bugunStr) => AY_ADI[parseInt(String(bugunStr).slice(5, 7), 10) - 1] || "Bu ay";
const tipIcon = (tip) => (HESAP_TIP.find((t) => t.id === tip) || {}).icon || "•";
const tipLabel = (tip) => (HESAP_TIP.find((t) => t.id === tip) || {}).label || tip;

const GIZLILIK = "ℹ️ Telegram üzerinden görüntülediğin finansal özetler Telegram altyapısından geçer. Hassas belge yükleme özelliği bu aşamada aktif değildir.";

// R11: generic uzunluk guard — code point sınırı (surrogate/emoji bölmeden). Router her gönderimde uygular.
export function uzunlukGuvenli(text, max = MAX_UZUNLUK) {
  const cp = Array.from(String(text ?? ""));
  if (cp.length <= max) return String(text ?? "");
  return cp.slice(0, max - 14).join("") + "\n…(kısaltıldı)";
}

export function karsilamaMesaji(bagli) {
  if (bagli) return `👋 FinansApp'e bağlısın. Menüden veya komutlardan devam et.\n/bakiye · /buay · 📊 Bugün · 💳 Hesaplar\n\n${GIZLILIK}`;
  return [
    "👋 FinansApp Telegram botuna hoş geldin.",
    "",
    "Hesabını bağlamak için uygulamada Ayarlar → Telegram'dan bir eşleşme kodu al, sonra:",
    "/link KODUN",
    "",
    "Bu bot yalnızca OKUMA amaçlıdır — bakiye/gelir/gider görüntüler, hiçbir şey değiştirmez.",
    "",
    GIZLILIK,
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
    "",
    GIZLILIK,
  ].join("\n");
}

export const bagliDegilMesaji = () => "🔒 Önce hesabını bağla. Uygulamada Ayarlar → Telegram'dan kod al ve buraya yaz:\n\n/link KODUN";

// R9: iç ID YOK.
export const durumMesaji = () => "✅ Durum: bağlı\nKapsam: Kişisel\nYalnız okuma";
export const baglantiMesaji = () => "⚙️ Bağlantı\n\nDurum: bağlı\nKapsam: Kişisel\nYalnız okuma\n\nBağlantıyı kaldırmak için: /unlink";

export function bakiyeMesaji(oz) {
  return ["💰 Net Varlık", `${TL(oz.netVarlik)}`, "", `• Net Nakit: ${TL(oz.nakit)}`, `• Yatırım: ${TL(oz.yatirim)}`].join("\n");
}

export function buAyMesaji(oz, bugunStr) {
  const satirlar = [
    `📅 ${ayAdiOf(bugunStr)} özeti`, "",
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
  if (oz.islemSayisi === 0) { satirlar.push("Bugün kayıtlı işlem yok."); return satirlar.join("\n"); }
  // R11: giderler sonra gelirler, toplam gösterim MAX_SATIR_BUGUN ile sınırlı.
  const rows = [
    ...oz.giderler.map((x) => `− ${x.baslik}${x.kategori ? " · " + x.kategori : ""}: ${TL(x.miktar)}`),
    ...oz.gelirler.map((x) => `+ ${x.baslik}${x.kategori ? " · " + x.kategori : ""}: ${TL(x.miktar)}`),
  ];
  const goster = rows.slice(0, MAX_SATIR_BUGUN);
  satirlar.push(...goster);
  if (rows.length > goster.length) satirlar.push(`… ${rows.length - goster.length} işlem daha`);
  satirlar.push("", `Günün gideri: ${TL(oz.gunGider)} · geliri: ${TL(oz.gunGelir)}`);
  return satirlar.join("\n");
}

export function hesaplarMesaji(oz) {
  const satirlar = ["💳 Hesaplar", ""];
  if (!oz.hesaplar.length) { satirlar.push("Kayıtlı hesap yok."); return satirlar.join("\n"); }
  const goster = oz.hesaplar.slice(0, MAX_SATIR_HESAP);
  goster.forEach((h) => satirlar.push(`${tipIcon(h.tip)} ${h.ad} (${tipLabel(h.tip)}): ${TL(h.bakiye)}`));
  if (oz.hesaplar.length > goster.length) satirlar.push(`… ${oz.hesaplar.length - goster.length} hesap daha`);
  satirlar.push("", `Varlık: ${TL(oz.varlik)}  −  Borç: ${TL(oz.borc)}`, `Net: ${TL(oz.net)}`);
  return satirlar.join("\n");
}

export const linkBasariMesaji = () => "✅ Telegram bağlantısı tamamlandı. Artık bakiye ve özetleri görebilirsin.\n\n/bakiye · /buay · 📊 Bugün";
export const linkHataMesaji = (msg) => `⚠️ ${msg || "Kod geçersiz veya süresi dolmuş."}`;
export const linkGecersizFormatMesaji = () => "⚠️ Kod 8 karakterli olmalı (örn. ABCD2345). Kodu uygulamada Ayarlar → Telegram'dan alırsın.";
export const linkKullanimMesaji = () => "Kullanım: /link KODUN\n\nKodu uygulamada Ayarlar → Telegram'dan alırsın.";
export const unlinkMesaji = () => "🔌 Bağlantı kaldırıldı. İstersen /link ile tekrar bağlanabilirsin.";
export const cokFazlaDenemeMesaji = () => "⏳ Çok fazla deneme. Lütfen biraz sonra tekrar dene.";
export const hataMesaji = () => "⚠️ Şu an bir sorun oluştu. Lütfen biraz sonra tekrar dene.";
export const ozelDegilMesaji = () => "🔒 Bu bot yalnızca özel sohbette çalışır. Lütfen bana özelden yaz.";
