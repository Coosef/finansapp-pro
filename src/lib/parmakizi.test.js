import { describe, it, expect } from "vitest";
import { normalizeAciklama, hesapAnahtar, parmakIzi, mevcutParmakSeti, batchDedup } from "./parmakizi.js";

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
  it("mevcut findata parmak izine karşı da dedup", () => {
    const d = { hesaplar: [{ id: "h1", son4: "1234" }], giderler: [{ baslik: "Migros AVM", miktar: 350, tarih: "2026-08-05", hesapId: "h1" }], gelirler: [] };
    const set = mevcutParmakSeti(d);
    const r = batchDedup(set, [{ hesapAnahtar: "s4:1234", kayitlar: [kayit("Migros AVM", 350)] }]);
    expect(r[0][0]._kesinTekrar).toBe(true);
  });
});
