import { describe, it, expect } from "vitest";
import { normalizeAciklama, hesapAnahtar, parmakIzi, mevcutParmakSeti, batchDedup } from "./parmakizi.js";
import { ekstreUygula } from "./ekstre.js";

describe("normalizeAciklama", () => {
  it("rakam/noktalama atar, küçük harfe indirir", () => {
    expect(normalizeAciklama("MİGROS AVM 12.08.2026 #4521")).toBe("migros avm");
  });
});

describe("hesapAnahtar — hesap kimliği (son4 kanonik)", () => {
  it("son4 verilirse s4: anahtarı", () => {
    expect(hesapAnahtar({}, { son4: "1234" })).toBe("s4:1234");
  });
  it("hesapId → hesabın son4'üne çözer", () => {
    const d = { hesaplar: [{ id: "h1", son4: "5678" }] };
    expect(hesapAnahtar(d, { hesapId: "h1" })).toBe("s4:5678");
  });
});

describe("parmakIzi — deterministik", () => {
  it("hesap+tarih+yön+kuruş+normDesc birleştirir", () => {
    const fp = parmakIzi({ tarih: "2026-08-05", miktar: 350, baslik: "Migros AVM", tip: "gider" }, "s4:1234");
    expect(fp).toBe("s4:1234|2026-08-05|-|35000|migros avm");
  });
  it("aynı tutar/tarih FARKLI açıklama → farklı parmak izi (yanlış-pozitif yok)", () => {
    const a = parmakIzi({ tarih: "2026-08-01", miktar: 500, baslik: "Market A", tip: "gider" }, "s4:1");
    const b = parmakIzi({ tarih: "2026-08-01", miktar: 500, baslik: "Market B", tip: "gider" }, "s4:1");
    expect(a).not.toBe(b);
  });
});

describe("batchDedup — çoklu dosya cross-file dedup (idempotent)", () => {
  const kayit = (baslik, miktar, tarih = "2026-08-05") => ({ baslik, miktar, tarih, tip: "gider" });
  it("A dosyası X + B dosyası X → B'deki kesin tekrar işaretlenir", () => {
    const gruplar = [
      { hesapAnahtar: "s4:1", kayitlar: [kayit("Market X", 500)] },
      { hesapAnahtar: "s4:1", kayitlar: [kayit("Market X", 500)] },
    ];
    const r = batchDedup(new Set(), gruplar);
    expect(r[0][0]._kesinTekrar).toBeFalsy();
    expect(r[1][0]._kesinTekrar).toBe(true);
    expect(r[1][0]._sec).toBe(false);
  });
  it("aynı dosyanın iki kez importu → ikinci tamamen kesin tekrar", () => {
    const g = { hesapAnahtar: "s4:1", kayitlar: [kayit("A", 100), kayit("B", 200)] };
    const r = batchDedup(new Set(), [g, { ...g }]);
    expect(r[1].every((k) => k._kesinTekrar)).toBe(true);
  });
  it("aynı tutar/tarih FARKLI işlem → ikisi de korunur", () => {
    const gruplar = [{ hesapAnahtar: "s4:1", kayitlar: [kayit("Market A", 500), kayit("Market B", 500)] }];
    const r = batchDedup(new Set(), gruplar);
    expect(r[0][0]._kesinTekrar).toBeFalsy();
    expect(r[0][1]._kesinTekrar).toBeFalsy();
  });
  // Gerçek apply-loop (importing.jsx cokluIceAktar mantığı) idempotency kanıtı
  const uygulaLoop = (findata, dosyalar) => {
    let cur = findata;
    const set = mevcutParmakSeti(cur);
    for (const s of dosyalar) {
      const hA = hesapAnahtar(cur, { son4: s.ozet?.son4 });
      const temiz = (s.kayitlar || []).filter((k) => { const fp = parmakIzi(k, hA); if (set.has(fp)) return false; set.add(fp); return true; });
      cur = ekstreUygula(cur, s.ozet, temiz).data;
    }
    return cur;
  };
  it("A dosyası + B dosyası aynı işlem (aynı hesap) → tek ekonomik gider", () => {
    const ozet = { ekstreTipi: "hesap", son4: "1234", banka: "Garanti" };
    const rec = { baslik: "Migros AVM", miktar: 500, kategori: "Market", tarih: "2026-08-05", tip: "gider" };
    const d = uygulaLoop({ gelirler: [], giderler: [], hesaplar: [] }, [{ ozet, kayitlar: [rec] }, { ozet, kayitlar: [{ ...rec }] }]);
    expect(d.giderler.filter((g) => g.baslik === "Migros AVM").length).toBe(1);
  });
  it("aynı gün/tutar FARKLI market → iki gider korunur (kayıp yok)", () => {
    const ozet = { ekstreTipi: "hesap", son4: "1234", banka: "Garanti" };
    const d = uygulaLoop({ gelirler: [], giderler: [], hesaplar: [] }, [{ ozet, kayitlar: [
      { baslik: "Market A", miktar: 500, kategori: "Market", tarih: "2026-08-05", tip: "gider" },
      { baslik: "Market B", miktar: 500, kategori: "Market", tarih: "2026-08-05", tip: "gider" },
    ] }]);
    expect(d.giderler.length).toBe(2);
  });
  it("mevcut findata parmak izine karşı da dedup", () => {
    const d = { hesaplar: [{ id: "h1", son4: "1234" }], giderler: [{ baslik: "Migros AVM", miktar: 350, tarih: "2026-08-05", hesapId: "h1" }], gelirler: [] };
    const set = mevcutParmakSeti(d);
    const r = batchDedup(set, [{ hesapAnahtar: "s4:1234", kayitlar: [kayit("Migros AVM", 350)] }]);
    expect(r[0][0]._kesinTekrar).toBe(true);
  });
});
