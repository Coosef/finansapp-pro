// ============================================================
// Finansal tür (transaction'ın finansal ANLAMI) — "kim"(ilişki)den ayrı.
// Bir gelir/gider kaydının income/expense KPI'sına katkısını verir.
// Etiketsiz kayıt = eski davranış → geriye tam uyum. (Audit item 2/5/6/7)
// ============================================================
export const TUR = {
  GELIR: "gelir", GIDER: "gider",
  IADE: "iade", REIMBURSE: "reimbursement", STOPAJ: "stopaj",
  IC_TRANSFER: "internal_transfer", HANE_TRANSFER: "household_transfer",
  BORC_VERME: "loan_given", BORC_ODEME: "loan_repayment",
  HEDIYE: "gift", VARLIK_SATIS: "asset_sale", INCELE: "needs_review", DIGER: "other",
};

// tabanTip: kaydın bulunduğu liste ("gelir" | "gider").
// Dönüş: { gelir, gider } — income/expense katkısı (iade/stopaj negatif olabilir).
export function turEtkisi(kayit, tabanTip) {
  const m = Math.abs(+kayit?.miktar || 0);
  const t = kayit?.tur;
  if (!t || t === TUR.GELIR || t === TUR.GIDER) {
    return tabanTip === "gelir" ? { gelir: m, gider: 0 } : { gelir: 0, gider: m };
  }
  switch (t) {
    case TUR.IADE:
    case TUR.REIMBURSE:
      return { gelir: 0, gider: -m }; // gideri azaltır, income değil
    case TUR.STOPAJ:
      return { gelir: -m, gider: 0 }; // faiz stopajı → net faizi düşürür, tüketim gideri değil
    // needs_review + ilişki/transfer türleri + hediye/varlık satışı → KPI DIŞI (nötr)
    default:
      return { gelir: 0, gider: 0 };
  }
}
