// ============================================================
// Tema renkleri, fontlar, ortak stiller ve alan sabitleri
// ============================================================

export const C = {
  bg: "#07090F",
  card: "#0F1117",
  card2: "#0A0C13",
  line: "#1E2130",
  line2: "#2A2D3A",
  text: "#E2E8F0",
  dim: "#94A3B8",
  dimmer: "#64748B",
  faint: "#475569",
  green: "#22C55E",
  greenL: "#4ADE80",
  red: "#EF4444",
  redL: "#F87171",
  amber: "#F59E0B",
  indigo: "#6366F1",
  indigoL: "#818CF8",
  purple: "#8B5CF6",
  cyan: "#06B6D4",
};

export const F = "'Sora', sans-serif";

export const inputStyle = {
  width: "100%",
  padding: "0.65rem 0.85rem",
  background: "#1A1D27",
  border: `1px solid ${C.line2}`,
  borderRadius: "0.5rem",
  color: C.text,
  fontSize: "0.9rem",
  fontFamily: F,
  boxSizing: "border-box",
  outline: "none",
};

export const sectionTitle = {
  margin: "0 0 1rem",
  fontSize: "0.82rem",
  color: C.dim,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  fontWeight: 600,
};

export const pageTitle = { margin: "0 0 0.2rem", fontSize: "1.2rem", fontWeight: 700 };

export const rowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "0.8rem 1rem",
  background: C.card2,
  borderRadius: "0.6rem",
  marginBottom: "0.5rem",
  border: `1px solid ${C.line}`,
};

export const tagStyle = (col) => ({
  background: col + "22",
  border: `1px solid ${col}55`,
  color: col,
  fontSize: "0.62rem",
  padding: "0.1rem 0.35rem",
  borderRadius: "0.3rem",
  marginLeft: "0.4rem",
  fontWeight: 700,
  letterSpacing: "0.03em",
  verticalAlign: "middle",
});

export const PALET = [
  "#6366F1", "#EF4444", "#F59E0B", "#22C55E", "#06B6D4", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#A855F7", "#84CC16",
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
  { id: "kripto", label: "Kripto", renk: "#F7931A", birim: "adet" },
  { id: "altin", label: "Altın", renk: "#F59E0B", birim: "gram" },
  { id: "doviz", label: "Döviz", renk: "#10B981", birim: "birim" },
  { id: "hisse", label: "Hisse Senedi", renk: "#6366F1", birim: "lot" },
  { id: "fon", label: "Fon / Diğer", renk: "#A855F7", birim: "pay" },
  { id: "bes", label: "BES (Emeklilik)", renk: "#14B8A6", birim: "pay" },
];

export const GIDER_KAT = [
  "Market", "Konut", "Ulaşım", "Sağlık", "Eğlence", "Giyim",
  "Eğitim", "Faturalar", "Restoran", "Teknoloji", "Diğer",
];

export const GELIR_KAT = ["Maaş", "Ek Gelir", "Serbest", "Kira Geliri", "Temettü", "Yatırım", "Diğer"];

export const HESAP_TIP = [
  { id: "nakit", label: "Nakit", icon: "💵", renk: "#22C55E" },
  { id: "banka", label: "Banka", icon: "🏦", renk: "#6366F1" },
  { id: "kart", label: "Kredi Kartı", icon: "💳", renk: "#EF4444" },
  { id: "birikim", label: "Birikim", icon: "🐷", renk: "#F59E0B" },
];

export const ACCENT_SECENEK = [
  { ad: "Indigo", renk: "#6366F1" },
  { ad: "Mor", renk: "#8B5CF6" },
  { ad: "Camgöbeği", renk: "#06B6D4" },
  { ad: "Yeşil", renk: "#22C55E" },
  { ad: "Amber", renk: "#F59E0B" },
  { ad: "Pembe", renk: "#EC4899" },
];
