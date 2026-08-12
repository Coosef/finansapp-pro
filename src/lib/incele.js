// ============================================================
// İncelenecek işlemler katmanı (item 6 UI).
// needs_review = ham kaydı bozmadan "finansal anlamı bekliyor" durumu.
// KPI etkisi tek kaynaktan (turEtkisi) türetilir — burada hardcode YOK.
// ============================================================
import { TUR, turEtkisi } from "./siniftur.js";

// needs_review bekleyen gelir/gider kayıtları (global backlog, döneme bağlı değil).
// { adet, toplam, kayitlar } döner; kayıtlara ham yön (_yon) eklenir.
export function bekleyenInceleme(findata) {
  const d = findata || {};
  const al = (arr, yon) => (arr || []).filter((x) => x?.tur === TUR.INCELE).map((x) => ({ ...x, _yon: yon }));
  const kayitlar = [...al(d.gelirler, "gelir"), ...al(d.giderler, "gider")]
    .sort((a, b) => String(b.tarih || "").localeCompare(String(a.tarih || "")));
  const toplam = kayitlar.reduce((s, x) => s + Math.abs(+x.miktar || 0), 0);
  return { adet: kayitlar.length, toplam, kayitlar };
}

// Ham yöne (gelir=gelen / gider=giden) uygun finansal anlam seçenekleri.
// İnvaryant: ham yön DEĞİŞMEZ; yalnız anlam seçilir. Bu yüzden karşı-yön
// birincil seçenekleri (gidene "Gelir") sunulmaz.
const SEC_GIDER = [
  { tur: TUR.GIDER, label: "Gider (harcama)" },
  { tur: TUR.HANE_TRANSFER, label: "Hane transferi" },
  { tur: TUR.BORC_VERME, label: "Verilen borç" },
  { tur: TUR.BORC_ODEME, label: "Borç geri ödemesi" },
  { tur: TUR.HEDIYE, label: "Hediye (verdiğin)" },
  { tur: TUR.IC_TRANSFER, label: "Hesaplar arası transfer" },
  { tur: TUR.DIGER, label: "Diğer" },
];
const SEC_GELIR = [
  { tur: TUR.GELIR, label: "Gelir" },
  { tur: TUR.IADE, label: "İade / geri ödeme" },
  { tur: TUR.BORC_ODEME, label: "Borç geri ödemesi (sana)" },
  { tur: TUR.HANE_TRANSFER, label: "Hane transferi" },
  { tur: TUR.HEDIYE, label: "Hediye (aldığın)" },
  { tur: TUR.VARLIK_SATIS, label: "Varlık satışı" },
  { tur: TUR.IC_TRANSFER, label: "Hesaplar arası transfer" },
  { tur: TUR.DIGER, label: "Diğer" },
];
export function turSecenekleri(yon) {
  return yon === "gelir" ? SEC_GELIR : SEC_GIDER;
}

// Bir tür seçiminin KPI etkisini insan-okur ipucuna çevir (kaynak: turEtkisi).
// tip: "gider" | "iade" | "gelir" | "stopaj" | "notr"
export function turEtkiIpucu(tur, yon) {
  const e = turEtkisi({ miktar: 1, tur }, yon);
  if (e.gider > 0) return { metin: "gideri artırır", tip: "gider" };
  if (e.gider < 0) return { metin: "gideri azaltır", tip: "iade" };
  if (e.gelir > 0) return { metin: "geliri artırır", tip: "gelir" };
  if (e.gelir < 0) return { metin: "geliri azaltır", tip: "stopaj" };
  return { metin: "KPI'a girmez (nötr)", tip: "notr" };
}

// İnsan-okur tür etiketi (rozet/özet için).
const ETIKET = {
  [TUR.GELIR]: "Gelir", [TUR.GIDER]: "Gider", [TUR.IADE]: "İade",
  [TUR.REIMBURSE]: "Masraf iadesi", [TUR.STOPAJ]: "Stopaj",
  [TUR.IC_TRANSFER]: "İç transfer", [TUR.HANE_TRANSFER]: "Hane transferi",
  [TUR.BORC_VERME]: "Verilen borç", [TUR.BORC_ODEME]: "Borç geri ödemesi",
  [TUR.HEDIYE]: "Hediye", [TUR.VARLIK_SATIS]: "Varlık satışı",
  [TUR.INCELE]: "İnceleniyor", [TUR.DIGER]: "Diğer",
};
export function turEtiket(tur) {
  return ETIKET[tur] || tur || "";
}
