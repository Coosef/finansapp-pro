// ============================================================
// Çoklu para birimi (saf, test edilebilir)
// Yabancı para tutarını, girişte anlık kurla TRY'ye çevirir. Kayıtlar TRY olarak
// saklanır (tüm toplamlar TRY varsayar → bozulmaz); orijinal tutar+PB ayrıca tutulur.
// kurlar: { usd, eur } — 1 birim döviz = kaç TL.
// ============================================================
import { kurus } from "./para.js";

export const PB_SECENEK = [
  { id: "TRY", label: "₺ TL", sembol: "₺" },
  { id: "USD", label: "$ USD", sembol: "$" },
  { id: "EUR", label: "€ EUR", sembol: "€" },
];

export function pbSembol(pb) {
  return (PB_SECENEK.find((p) => p.id === pb) || {}).sembol || "";
}

// Tutarı TRY'ye çevirir. TRY ise aynen döner; kur yoksa null (çağıran uyarır).
export function tryeCevir(tutar, pb, kurlar) {
  const t = +tutar || 0;
  if (!pb || pb === "TRY") return t;
  const kur = pb === "USD" ? kurlar?.usd : pb === "EUR" ? kurlar?.eur : null;
  if (!kur || kur <= 0) return null;
  // Kalıcı kayda giren değer → kuruşa yuvarla (float çarpım artığını temizle, item 10)
  return kurus(t * kur);
}
