// ============================================================
// İşlem parmak izi (deterministic fingerprint) — dedup için.
// Kesin duplicate = aynı parmak izi (hesap + tarih + yön + kuruş + norm.açıklama).
// possible_duplicate (fuzzy) AYRIDIR (importing.tekrarMi) ve asla sessizce silinmez.
// Not: bankalar işlem referans no vermediği için açıklama fingerprint'e dahildir;
// böylece aynı gün/tutar FARKLI işlemler yanlışlıkla tekrar sayılmaz.
// ============================================================
const kucuk = (s) => String(s ?? "").replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();

export function normalizeAciklama(s) {
  return kucuk(s).replace(/\d+/g, " ").replace(/[^a-zçğıöşü ]/g, " ").replace(/\s+/g, " ").trim();
}

// Hesap kimliği (son4 kanonik). ref: { son4? , hesapId? }
export function hesapAnahtar(findata, ref) {
  const s4 = (v) => "s4:" + String(v).replace(/\D/g, "").slice(-4);
  if (ref?.son4) return s4(ref.son4);
  if (ref?.hesapId != null && ref.hesapId !== "") {
    const h = (findata?.hesaplar || []).find((x) => String(x.id) === String(ref.hesapId));
    return h?.son4 ? s4(h.son4) : "id:" + ref.hesapId;
  }
  return "";
}

export function parmakIzi(kayit, hesapAnahtarStr) {
  const yon = kayit.tip === "gelir" ? "+" : "-";
  const tutar = Math.round(Math.abs(+kayit.miktar || 0) * 100); // kuruş, float drift'siz
  return [hesapAnahtarStr || "", String(kayit.tarih || "").slice(0, 10), yon, tutar, normalizeAciklama(kayit.baslik)].join("|");
}

// Mevcut gelir/giderden kesin-tekrar seti (her kaydın hesabına göre)
export function mevcutParmakSeti(findata) {
  const set = new Set();
  const ekle = (liste, tip) => (liste || []).forEach((r) => set.add(parmakIzi({ ...r, tip }, hesapAnahtar(findata, { hesapId: r.hesapId }))));
  ekle(findata?.gelirler, "gelir");
  ekle(findata?.giderler, "gider");
  return set;
}

// Bir parti kayıt grubunu (çoklu dosya) hem mevcut sete hem BİRBİRİNE karşı dedup et.
// gruplar: [{ hesapAnahtar, kayitlar:[...] }]. Kesin tekrarlar _kesinTekrar+_sec:false
// işaretlenir (uygulanmaz); transfer bacakları burada dokunulmaz (kendi dedup'u var).
export function batchDedup(mevcutSet, gruplar) {
  const set = new Set(mevcutSet);
  return (gruplar || []).map((g) =>
    (g.kayitlar || []).map((k) => {
      if (k._transfer) return { ...k };
      const fp = parmakIzi(k, g.hesapAnahtar);
      if (set.has(fp)) return { ...k, _kesinTekrar: true, _sec: false };
      set.add(fp);
      return { ...k };
    })
  );
}
