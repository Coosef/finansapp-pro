// ============================================================
// Anthropic (Claude) API istemcisi
// ------------------------------------------------------------
// Orijinal uygulama tarayıcıdan doğrudan api.anthropic.com'a
// kimlik doğrulamasız istek atıyordu (CORS + auth nedeniyle
// gerçek tarayıcıda çalışmaz). Burada:
//   - API anahtarı Ayarlar'dan girilir ve localStorage'da tutulur
//   - Tarayıcıdan doğrudan erişim için resmi başlık eklenir
//     (anthropic-dangerous-direct-browser-access)
//   - Anahtar yoksa AI özellikleri zarifçe devre dışı kalır
//
// NOT: Bu, anahtarı tarayıcıya koyar — kişisel/yerel kullanım
// içindir. Çok kullanıcılı/üretim senaryosunda anahtarı sunucu
// tarafında tutan bir proxy'ye geçilmelidir (mimari kararı sonraya
// bırakıldı).
// ============================================================
import { KRIPTO_MAP } from "./constants.js";
import { sayiCikar, bugun } from "./format.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const WEB_SEARCH_TOOL = { type: "web_search_20260209", name: "web_search" };

// Çalışma zamanı yapılandırması (App, Ayarlar'dan günceller)
let _apiKey = "";
let _model = "claude-opus-4-8";

export function setApiKey(key) {
  _apiKey = key || "";
}
export function setModel(model) {
  if (model) _model = model;
}
export function aiHazir() {
  return !!_apiKey;
}

// Ayarlar'da gösterilecek model seçenekleri
export const MODEL_SECENEK = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 (en yetenekli)" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (hızlı/ekonomik)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (en ucuz)" },
];

class AIAnahtarYok extends Error {
  constructor() {
    super("AI anahtarı tanımlı değil. Ayarlar → Yapay Zekâ'dan Anthropic API anahtarını gir.");
    this.name = "AIAnahtarYok";
  }
}
export { AIAnahtarYok };

/**
 * Claude Messages API çağrısı.
 * @param {Array} messages - Anthropic mesaj dizisi
 * @param {boolean} useSearch - web arama aracını etkinleştir
 * @returns {Promise<string>} - birleştirilmiş metin yanıtı
 */
export async function claudeCall(messages, useSearch = false) {
  if (!_apiKey) throw new AIAnahtarYok();

  const body = { model: _model, max_tokens: 2048, messages };
  if (useSearch) body.tools = [WEB_SEARCH_TOOL];

  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": _apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error("Ağ hatası: Anthropic API'ye ulaşılamadı.");
  }

  if (!res.ok) {
    let detay = "";
    try {
      const j = await res.json();
      detay = j?.error?.message || "";
    } catch {
      /* yoksay */
    }
    if (res.status === 401) throw new Error("API anahtarı geçersiz (401).");
    if (res.status === 429) throw new Error("İstek sınırı aşıldı (429), biraz sonra dene.");
    throw new Error(`API hatası ${res.status}${detay ? ": " + detay.slice(0, 160) : ""}`);
  }

  const data = await res.json();
  if (!data.content) throw new Error("API yanıtı alınamadı");
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// ---- Fiyat çekme ----
// Kripto: CoinGecko (anahtarsız, CORS açık). Diğerleri: web aramalı Claude.
export async function fiyatCek(y) {
  if (y.tip === "kripto") {
    const id = KRIPTO_MAP[(y.sembol || "").toUpperCase()];
    if (id) {
      try {
        const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=try`);
        const j = await r.json();
        if (j[id]?.try) return j[id].try;
      } catch {
        /* Claude'a düş */
      }
    }
  }
  const soru =
    {
      altin: `Türkiye'de 1 gram ${y.sembol || "altın"} fiyatı kaç TL?`,
      doviz: `1 ${y.sembol || "USD"} kaç Türk Lirası?`,
      hisse: `Borsa İstanbul'da ${y.sembol} hissesinin güncel fiyatı kaç TL?`,
      fon: `${y.sembol || y.ad} güncel birim fiyatı kaç TL?`,
    }[y.tip] || `${y.sembol || y.ad} güncel TL fiyatı nedir?`;
  const txt = await claudeCall(
    [{ role: "user", content: `${soru} Yalnızca sayıyı yaz (ondalık nokta, simge/açıklama YOK). Örn: 2456.50` }],
    true
  );
  const val = sayiCikar(txt);
  if (isNaN(val)) throw new Error("Fiyat okunamadı");
  return val;
}

export async function kurCek() {
  const usdTxt = await claudeCall([{ role: "user", content: "1 USD kaç Türk Lirası? Sadece sayı yaz." }], true);
  const eurTxt = await claudeCall([{ role: "user", content: "1 EUR kaç Türk Lirası? Sadece sayı yaz." }], true);
  return { usd: sayiCikar(usdTxt), eur: sayiCikar(eurTxt), tarih: bugun() };
}
