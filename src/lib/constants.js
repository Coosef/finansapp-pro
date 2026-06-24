// ============================================================
// Tema belirteçleri (CSS değişkenleri), fontlar, ortak stiller
// Zümrüt & Altın — açık/koyu tema, var(--...) ile temalanır
// ============================================================

// Yeni tasarım belirteçleri (CSS değişkenlerine işaret eder, temayla değişir)
export const V = {
  bg: "var(--bg)", card: "var(--card)", card2: "var(--card2)",
  border: "var(--border)", border2: "var(--border2)",
  line: "var(--line)", track: "var(--track)",
  ink: "var(--ink)", ink2: "var(--ink2)", ink3: "var(--ink3)",
  pos: "var(--pos)", neg: "var(--neg)", accent: "var(--accent)",
  gold: "var(--gold-t)", bubble: "var(--bubble)",
  chipRed: "var(--chip-red)", chipGold: "var(--chip-gold)",
  chipGreen: "var(--chip-green)", chipAmber: "var(--chip-amber)",
  emerald: "#143A2B", emerald2: "#1D5240", cream: "#E9D9B4", sage: "#8FAE9E",
};

// Geriye dönük uyumluluk: eski C anahtarları artık CSS değişkenlerine eşlenir,
// böylece henüz yeniden yazılmamış ekranlar da temayı (açık/koyu) takip eder.
export const C = {
  bg: V.bg, card: V.card, card2: V.card2,
  line: V.line, line2: V.border2,
  text: V.ink, dim: V.ink2, dimmer: V.ink3, faint: V.ink3,
  green: V.pos, greenL: V.pos, red: V.neg, redL: V.neg,
  amber: V.accent, indigo: V.accent, indigoL: V.accent, purple: V.gold, cyan: V.accent,
};

export const F = "'Schibsted Grotesk', system-ui, sans-serif";
export const MONO = "'IBM Plex Mono', monospace";
export const SERIF = "'Newsreader', serif";

export const inputStyle = {
  width: "100%",
  padding: "0.7rem 0.85rem",
  background: V.card2,
  border: `1px solid ${V.border}`,
  borderRadius: "0.65rem",
  color: V.ink,
  fontSize: "0.9rem",
  fontFamily: F,
  boxSizing: "border-box",
  outline: "none",
};

export const sectionTitle = {
  margin: "0 0 1rem",
  fontSize: "0.82rem",
  color: V.ink3,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  fontWeight: 600,
};

export const pageTitle = { margin: "0 0 0.2rem", fontSize: "1.2rem", fontWeight: 600, fontFamily: SERIF };

export const rowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "0.8rem 1rem",
  background: V.card2,
  borderRadius: "0.7rem",
  marginBottom: "0.5rem",
  border: `1px solid ${V.border}`,
};

export const tagStyle = (col) => ({
  background: "var(--chip-gold)",
  border: `1px solid ${col}55`,
  color: col,
  fontSize: "0.62rem",
  padding: "0.1rem 0.4rem",
  borderRadius: "0.35rem",
  marginLeft: "0.4rem",
  fontWeight: 700,
  letterSpacing: "0.03em",
  verticalAlign: "middle",
});

// Grafik/kategori renkleri (sıcak zümrüt-altın paleti)
export const PALET = [
  "#1D5240", "#C79A4B", "#B4623A", "#6B8E7B", "#9A7626",
  "#C75D4A", "#3E7CA8", "#8A7BB8", "#5C8A6E", "#D4A84B",
];

export const AY_ADI = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

// ---- Yatırım & kategori sabitleri ----
export const KRIPTO_MAP = {
  BTC: "bitcoin", BITCOIN: "bitcoin", ETH: "ethereum", ETHEREUM: "ethereum",
  SOL: "solana", SOLANA: "solana", BNB: "binancecoin", XRP: "ripple",
  ADA: "cardano", DOGE: "dogecoin", AVAX: "avalanche-2", DOT: "polkadot",
  USDT: "tether", LTC: "litecoin", LINK: "chainlink", TRX: "tron",
};

export const VARLIK_TIPLERI = [
  { id: "kripto", label: "Kripto", renk: "#C79A4B", birim: "adet" },
  { id: "altin", label: "Altın", renk: "#D4A84B", birim: "gram" },
  { id: "doviz", label: "Döviz", renk: "#1E7A50", birim: "birim" },
  { id: "hisse", label: "Hisse Senedi", renk: "#3E7CA8", birim: "lot" },
  { id: "fon", label: "Fon / Diğer", renk: "#8A7BB8", birim: "pay" },
  { id: "bes", label: "BES (Emeklilik)", renk: "#6B8E7B", birim: "pay" },
];

export const GIDER_KAT = [
  "Market", "Konut", "Ulaşım", "Sağlık", "Eğlence", "Giyim",
  "Eğitim", "Faturalar", "Restoran", "Teknoloji", "Diğer",
];

export const GELIR_KAT = ["Maaş", "Ek Gelir", "Serbest", "Kira Geliri", "Temettü", "Yatırım", "Diğer"];

// Hesap tipleri — çizgi ikon yolu (icons.jsx IK anahtarı) + renk
export const HESAP_TIP = [
  { id: "nakit", label: "Nakit", icon: "💵", ipath: "cash", renk: "var(--pos)" },
  { id: "banka", label: "Banka", icon: "🏦", ipath: "bank", renk: "var(--accent)" },
  { id: "kart", label: "Kredi Kartı", icon: "💳", ipath: "card", renk: "var(--neg)" },
  { id: "birikim", label: "Birikim", icon: "🐷", ipath: "piggy", renk: "var(--gold-t)" },
];

// Vurgu rengi seçenekleri (altın öncelikli)
export const ACCENT_SECENEK = [
  { ad: "Altın", renk: "#C79A4B" },
  { ad: "Zümrüt", renk: "#1E7A50" },
  { ad: "Bakır", renk: "#C0763D" },
  { ad: "Mercan", renk: "#C75D4A" },
  { ad: "Okyanus", renk: "#3E7CA8" },
  { ad: "Lavanta", renk: "#8A7BB8" },
];
