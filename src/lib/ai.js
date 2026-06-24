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
// Google Gemini — OpenAI-uyumlu uç (görsel/fiş okuma destekler; web arama yok)
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
// Gemini native uç — PDF/belge okuma (OpenAI-uyumlu uç PDF desteklemez)
const GEMINI_NATIVE = "https://generativelanguage.googleapis.com/v1beta";
// OpenAI (ChatGPT) — standart OpenAI-uyumlu uç (görsel destekler; web arama yok)
const OPENAI_URL = "https://api.openai.com/v1";

// ---- Çalışma zamanı yapılandırması ----
let _provider = "anthropic"; // "anthropic" | "ollama" | "lmstudio" | "ozel"
let _apiKey = "";
let _model = "claude-opus-4-8";
let _baseURL = ""; // yerel için OpenAI-uyumlu temel adres (…/v1)
let _localModel = "";
let _bildirim = null; // UI bildirimi (örn. otomatik model yedeği)
// App, bildir fonksiyonunu buraya kaydeder; ai.js olay bildirebilir
export function aiBildirimAyarla(fn) { _bildirim = fn; }

export const SAGLAYICI_SECENEK = [
  { id: "anthropic", label: "Anthropic Claude (bulut · anahtar gerekir)" },
  { id: "gemini", label: "Google Gemini (bulut · ücretsiz katman)" },
  { id: "openai", label: "OpenAI ChatGPT (bulut · anahtar gerekir)" },
  { id: "ollama", label: "Ollama (yerel · ücretsiz)" },
  { id: "lmstudio", label: "LM Studio (yerel · ücretsiz)" },
  { id: "ozel", label: "Özel (OpenAI-uyumlu adres)" },
];

// OpenAI modelleri (görsel destekli)
export const OPENAI_MODEL_SECENEK = [
  { id: "gpt-4o-mini", label: "GPT-4o mini (hızlı/ucuz · önerilen)" },
  { id: "gpt-4o", label: "GPT-4o (güçlü · görsel)" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { id: "gpt-4.1", label: "GPT-4.1 (en yetenekli)" },
];
const OPENAI_VARSAYILAN_MODEL = "gpt-4o-mini";

export const MODEL_SECENEK = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 (en yetenekli)" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (hızlı/ekonomik)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (en ucuz)" },
];

// Gemini modelleri (OpenAI-uyumlu uç üzerinden)
export const GEMINI_MODEL_SECENEK = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (hızlı · önerilen)" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash (ücretsiz katman)" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (en yetenekli)" },
];
const GEMINI_VARSAYILAN_MODEL = "gemini-2.5-flash";

export function varsayilanAdres(saglayici) {
  if (saglayici === "lmstudio") return "http://localhost:1234/v1";
  if (saglayici === "ollama") return "http://localhost:11434/v1";
  if (saglayici === "gemini") return GEMINI_URL;
  if (saglayici === "openai") return OPENAI_URL;
  return "";
}

// Sağlayıcı, OpenAI-uyumlu /v1/chat/completions yolunu mu kullanıyor?
function openAIUyumlu(p) {
  return p !== "anthropic";
}
// Sağlayıcı bir API anahtarı gerektiriyor mu? (bulut)
function anahtarGerekli(p) {
  return p === "anthropic" || p === "gemini" || p === "openai";
}

// Tüm AI ayarlarını tek noktadan uygula (App, ayarlar değişince çağırır)
export function configureAI(ayarlar = {}) {
  _provider = ayarlar.aiSaglayici || "anthropic";
  _apiKey = ayarlar.apiKey || "";
  _model = ayarlar.model || "claude-opus-4-8";
  _localModel = (ayarlar.yerelModel || "").trim();
  if (_provider === "gemini") {
    // Gemini ucu sabittir; bayat yerel adresi yok say
    _baseURL = GEMINI_URL;
    if (!_localModel) _localModel = GEMINI_VARSAYILAN_MODEL;
  } else if (_provider === "openai") {
    _baseURL = OPENAI_URL;
    if (!_localModel) _localModel = OPENAI_VARSAYILAN_MODEL;
  } else {
    _baseURL = (ayarlar.yerelAdres || varsayilanAdres(_provider) || "").trim();
  }
}

export function yerelMi() {
  return openAIUyumlu(_provider);
}

export function aiHazir() {
  if (anahtarGerekli(_provider)) return !!_apiKey;
  return !!_baseURL;
}

function yapilandirmaHatasi() {
  const msg = _provider === "anthropic"
    ? "AI anahtarı tanımlı değil. Ayarlar → Yapay Zekâ'dan Anthropic API anahtarını gir."
    : _provider === "gemini"
      ? "Gemini API anahtarı tanımlı değil. Ayarlar → Yapay Zekâ'dan Google AI Studio anahtarını gir."
      : _provider === "openai"
        ? "OpenAI API anahtarı tanımlı değil. Ayarlar → Yapay Zekâ'dan OpenAI anahtarını gir."
        : "Yerel model adresi tanımlı değil. Ayarlar → Yapay Zekâ'dan Ollama/LM Studio adresini gir.";
  const e = new Error(msg);
  e.name = "AIAnahtarYok"; // özellikler bu adı kontrol ediyor
  return e;
}

// ---- Geçici hatalarda otomatik tekrar (backoff) ----
const GECICI_KODLAR = new Set([429, 500, 502, 503, 529]);
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const GEMINI_YOGUN = "Gemini sunucuları şu an yoğun (Google tarafında geçici, yeniden denendi). Birkaç dakika sonra tekrar dene — genelde kısa sürede düzelir. Acele edersen Ayarlar'dan Claude veya yerel modele geçebilirsin.";
// Ağ hatası veya geçici durum kodunda tekrar dener (model yedeği ayrıca devrede)
async function fetchYeniden(url, opts, deneme = 3) {
  let sonHata;
  for (let i = 0; i < deneme; i++) {
    let res;
    try {
      res = await fetch(url, opts);
    } catch (e) {
      sonHata = e;
      if (i < deneme - 1) { await bekle(1000 * (i + 1)); continue; }
      throw e;
    }
    if (GECICI_KODLAR.has(res.status) && i < deneme - 1) {
      await bekle(1500 * (i + 1)); // 1.5s, 3s, 4.5s
      continue;
    }
    return res;
  }
  throw sonHata;
}

// ---- Anthropic çağrısı ----
async function anthropicCall(messages, useSearch) {
  const body = { model: _model, max_tokens: 2048, messages };
  if (useSearch) body.tools = [WEB_SEARCH_TOOL];
  let res;
  try {
    res = await fetchYeniden(ANTHROPIC_URL, {
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

async function localCall(messages, modelOverride, json) {
  if (anahtarGerekli(_provider) && !_apiKey) throw yapilandirmaHatasi();
  if (!_baseURL) throw yapilandirmaHatasi();
  const model = modelOverride || _localModel;
  if (!model) throw new Error("Model adı gir (Ayarlar → Yapay Zekâ). Örn: llama3.1");
  const url = _baseURL.replace(/\/+$/, "") + "/chat/completions";
  const body = { model, messages: toOpenAI(messages), stream: false, temperature: 0.3, max_tokens: 16384 };
  if (json) body.response_format = { type: "json_object" }; // geçerli JSON'a zorla
  let res;
  try {
    res = await fetchYeniden(url, {
      method: "POST",
      // Bulut (Gemini) gerçek anahtarı ister; yerel sunucular "local" değerini yok sayar
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + (_apiKey || "local") },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(_provider === "gemini"
      ? "Gemini'ye ulaşılamadı. İnternet bağlantını ve API anahtarını kontrol et."
      : `Yerel modele ulaşılamadı (${_baseURL}). Ollama/LM Studio açık mı ve CORS izinli mi?`);
  }
  if (!res.ok) {
    if (_provider === "gemini" && (res.status === 503 || res.status === 429)) { const e = new Error(GEMINI_YOGUN); e.yogun = true; throw e; }
    let detay = "";
    try { detay = (await res.text())?.slice(0, 160) || ""; } catch {}
    throw new Error(`Yerel model hatası ${res.status}${detay ? ": " + detay : ""}`);
  }
  const data = await res.json();
  const txt = data?.choices?.[0]?.message?.content;
  if (!txt) throw new Error("Yerel model yanıtı boş");
  return txt.trim();
}

// ---- Gemini native çağrısı (PDF/belge için) ----
// Mesajlardan herhangi biri belge (PDF) bloğu içeriyor mu?
function belgeVarMi(messages) {
  return (messages || []).some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === "document"));
}
// Anthropic mesaj bloklarını Gemini native "contents" biçimine çevir (saf, test edilebilir)
export function toGemini(messages) {
  const contents = (messages || []).map((m) => {
    const role = m.role === "assistant" ? "model" : "user";
    if (typeof m.content === "string") return { role, parts: [{ text: m.content }] };
    const parts = (m.content || []).map((b) => {
      if (b.type === "text") return { text: b.text };
      if (b.type === "image" || b.type === "document") {
        const s = b.source || {};
        return { inline_data: { mime_type: s.media_type || (b.type === "document" ? "application/pdf" : "image/jpeg"), data: s.data } };
      }
      return { text: "" };
    });
    return { role, parts };
  });
  return { contents };
}
async function geminiNativeCall(messages, model, json) {
  if (!_apiKey) throw yapilandirmaHatasi();
  const m = model || _localModel || GEMINI_VARSAYILAN_MODEL;
  const url = `${GEMINI_NATIVE}/models/${m}:generateContent?key=${encodeURIComponent(_apiKey)}`;
  const reqBody = toGemini(messages);
  if (json) reqBody.generationConfig = { responseMimeType: "application/json", maxOutputTokens: 16384 };
  let res;
  try {
    res = await fetchYeniden(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reqBody) });
  } catch {
    throw new Error("Gemini'ye ulaşılamadı. İnternet bağlantını ve API anahtarını kontrol et.");
  }
  if (!res.ok) {
    let detay = "";
    try { detay = (await res.json())?.error?.message || ""; } catch { /* yoksay */ }
    if (res.status === 503 || res.status === 429) { const e = new Error(GEMINI_YOGUN); e.yogun = true; throw e; }
    throw new Error(`Gemini hatası ${res.status}${detay ? ": " + detay.slice(0, 160) : ""}`);
  }
  const data = await res.json();
  const txt = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
  if (!txt) throw new Error("Gemini yanıtı boş (belge çok büyük olabilir).");
  return txt;
}

// Gemini otomatik model yedeği: seçili model yoğunsa (503/429) sıradakini dener,
// her geçişte kullanıcıyı bilgilendirir.
const GEMINI_YEDEK = ["gemini-2.5-flash", "gemini-2.0-flash"];
const gEtiket = (m) => m.replace(/^gemini-/, "Gemini ").replace(/-/g, " ");
async function geminiCall(messages, native, json) {
  const tercih = _localModel || GEMINI_VARSAYILAN_MODEL;
  const sira = [tercih, ...GEMINI_YEDEK.filter((m) => m !== tercih)];
  let sonHata;
  for (let i = 0; i < sira.length; i++) {
    try {
      return native ? await geminiNativeCall(messages, sira[i], json) : await localCall(messages, sira[i], json);
    } catch (e) {
      sonHata = e;
      if (e?.yogun && i < sira.length - 1) {
        if (_bildirim) _bildirim(`${gEtiket(sira[i])} yoğun; ${gEtiket(sira[i + 1])} deneniyor…`);
        continue;
      }
      throw e;
    }
  }
  throw sonHata;
}

/**
 * Ortak AI çağrısı. messages = Anthropic biçimi.
 * useSearch yalnızca Anthropic'te etkilidir (yerelde web arama yok).
 * Gemini'de PDF/belge varsa native uç kullanılır (OpenAI-uyumlu uç PDF okumaz).
 */
export async function claudeCall(messages, useSearch = false, json = false) {
  if (!aiHazir()) throw yapilandirmaHatasi();
  if (_provider === "anthropic") return anthropicCall(messages, useSearch);
  if (_provider === "gemini") return geminiCall(messages, belgeVarMi(messages), json);
  return localCall(messages, undefined, json);
}

// Ayarlar'daki "Bağlantıyı test et" için
export async function testAIBaglanti() {
  const txt = await claudeCall([{ role: "user", content: "Sadece 'tamam' yaz." }]);
  return txt;
}

// Yerel sunucudaki (Ollama/LM Studio/OpenAI-uyumlu) yüklü modelleri listele
export async function yerelModelleriListele(adres, apiKey) {
  const base = (adres || "").replace(/\/+$/, "");
  if (!base) throw new Error("Önce sunucu adresini gir.");
  let res;
  try {
    res = await fetch(base + "/models", { headers: { Authorization: "Bearer " + (apiKey || "local") } });
  } catch {
    throw new Error(`Sunucuya ulaşılamadı (${base}). Açık ve CORS izinli mi?`);
  }
  if (!res.ok) throw new Error(`Model listesi alınamadı (${res.status}).`);
  const data = await res.json();
  const liste = (data?.data || data?.models || []).map((m) => m.id || m.name).filter(Boolean);
  return Array.from(new Set(liste)).sort();
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
