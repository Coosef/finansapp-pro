// ============================================================
// Yapay Zekâ istemcisi — Anthropic (bulut) veya yerel model
// ------------------------------------------------------------
// İki sağlayıcı:
//   - "anthropic": api.anthropic.com (kullanıcının kendi anahtarı)
//   - yerel (Ollama / LM Studio / özel): OpenAI-uyumlu
//     /v1/chat/completions ucu. Anahtar/ücret yok.
//
// Mesajlar Anthropic biçiminde gelir; yerel sağlayıcı için
// OpenAI biçimine çevrilir (metin + görsel). PDF yerelde
// desteklenmez; web arama yalnızca Anthropic'te.
// ============================================================
import { KRIPTO_MAP } from "./constants.js";
import { sayiCikar, bugun } from "./format.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const WEB_SEARCH_TOOL = { type: "web_search_20260209", name: "web_search" };

// ---- Çalışma zamanı yapılandırması ----
let _provider = "anthropic"; // "anthropic" | "ollama" | "lmstudio" | "ozel"
let _apiKey = "";
let _model = "claude-opus-4-8";
let _baseURL = ""; // yerel için OpenAI-uyumlu temel adres (…/v1)
let _localModel = "";

export const SAGLAYICI_SECENEK = [
  { id: "anthropic", label: "Anthropic Claude (bulut · anahtar gerekir)" },
  { id: "ollama", label: "Ollama (yerel · ücretsiz)" },
  { id: "lmstudio", label: "LM Studio (yerel · ücretsiz)" },
  { id: "ozel", label: "Özel (OpenAI-uyumlu adres)" },
];

export const MODEL_SECENEK = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 (en yetenekli)" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (hızlı/ekonomik)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (en ucuz)" },
];

export function varsayilanAdres(saglayici) {
  if (saglayici === "lmstudio") return "http://localhost:1234/v1";
  if (saglayici === "ollama") return "http://localhost:11434/v1";
  return "";
}

// Tüm AI ayarlarını tek noktadan uygula (App, ayarlar değişince çağırır)
export function configureAI(ayarlar = {}) {
  _provider = ayarlar.aiSaglayici || "anthropic";
  _apiKey = ayarlar.apiKey || "";
  _model = ayarlar.model || "claude-opus-4-8";
  _baseURL = (ayarlar.yerelAdres || varsayilanAdres(_provider) || "").trim();
  _localModel = (ayarlar.yerelModel || "").trim();
}

export function yerelMi() {
  return _provider !== "anthropic";
}

export function aiHazir() {
  return _provider === "anthropic" ? !!_apiKey : !!_baseURL;
}

function yapilandirmaHatasi() {
  const msg = _provider === "anthropic"
    ? "AI anahtarı tanımlı değil. Ayarlar → Yapay Zekâ'dan Anthropic API anahtarını gir."
    : "Yerel model adresi tanımlı değil. Ayarlar → Yapay Zekâ'dan Ollama/LM Studio adresini gir.";
  const e = new Error(msg);
  e.name = "AIAnahtarYok"; // özellikler bu adı kontrol ediyor
  return e;
}

// ---- Anthropic çağrısı ----
async function anthropicCall(messages, useSearch) {
  const body = { model: _model, max_tokens: 2048, messages };
  if (useSearch) body.tools = [WEB_SEARCH_TOOL];
  let res;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": _apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Ağ hatası: Anthropic API'ye ulaşılamadı.");
  }
  if (!res.ok) {
    let detay = "";
    try { detay = (await res.json())?.error?.message || ""; } catch {}
    if (res.status === 401) throw new Error("API anahtarı geçersiz (401).");
    if (res.status === 429) throw new Error("İstek sınırı aşıldı (429), biraz sonra dene.");
    throw new Error(`API hatası ${res.status}${detay ? ": " + detay.slice(0, 160) : ""}`);
  }
  const data = await res.json();
  if (!data.content) throw new Error("API yanıtı alınamadı");
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

// ---- Yerel (OpenAI-uyumlu) çağrı ----
// Anthropic mesaj bloklarını OpenAI biçimine çevir
function toOpenAI(messages) {
  return messages.map((m) => {
    if (typeof m.content === "string") return { role: m.role, content: m.content };
    const parts = [];
    for (const b of m.content || []) {
      if (b.type === "text") parts.push({ type: "text", text: b.text });
      else if (b.type === "image") {
        const s = b.source || {};
        const url = s.type === "base64" ? `data:${s.media_type};base64,${s.data}` : s.url;
        parts.push({ type: "image_url", image_url: { url } });
      } else if (b.type === "document") {
        throw new Error("Yerel modelde PDF desteklenmiyor. Görsel veya CSV kullan.");
      }
    }
    return { role: m.role, content: parts };
  });
}

async function localCall(messages) {
  if (!_baseURL) throw yapilandirmaHatasi();
  if (!_localModel) throw new Error("Model adı gir (Ayarlar → Yapay Zekâ). Örn: llama3.1");
  const url = _baseURL.replace(/\/+$/, "") + "/chat/completions";
  const body = { model: _localModel, messages: toOpenAI(messages), stream: false, temperature: 0.3, max_tokens: 2048 };
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer local" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`Yerel modele ulaşılamadı (${_baseURL}). Ollama/LM Studio açık mı ve CORS izinli mi?`);
  }
  if (!res.ok) {
    let detay = "";
    try { detay = (await res.text())?.slice(0, 160) || ""; } catch {}
    throw new Error(`Yerel model hatası ${res.status}${detay ? ": " + detay : ""}`);
  }
  const data = await res.json();
  const txt = data?.choices?.[0]?.message?.content;
  if (!txt) throw new Error("Yerel model yanıtı boş");
  return txt.trim();
}

/**
 * Ortak AI çağrısı. messages = Anthropic biçimi.
 * useSearch yalnızca Anthropic'te etkilidir (yerelde web arama yok).
 */
export async function claudeCall(messages, useSearch = false) {
  if (!aiHazir()) throw yapilandirmaHatasi();
  if (_provider === "anthropic") return anthropicCall(messages, useSearch);
  return localCall(messages);
}

// Ayarlar'daki "Bağlantıyı test et" için
export async function testAIBaglanti() {
  const txt = await claudeCall([{ role: "user", content: "Sadece 'tamam' yaz." }]);
  return txt;
}

// ---- Fiyat çekme ----
export async function fiyatCek(y) {
  if (y.tip === "kripto") {
    const id = KRIPTO_MAP[(y.sembol || "").toUpperCase()];
    if (id) {
      try {
        const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=try`);
        const j = await r.json();
        if (j[id]?.try) return j[id].try;
      } catch {
        /* AI'a düş */
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
