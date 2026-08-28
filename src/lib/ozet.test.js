import { describe, it, expect } from "vitest";
import { yatirimGuncelDeger, yatirimDegeri, hesapVarlikToplam, hesapBorcToplam, hesapNet, nakitToplam, netVarlik } from "./ozet.js";

// Bu helper'lar App.jsx:448-463 net-varlık/nakit/yatırım mantığının TEK doğruluk kaynağı.
// Davranış birebir korunmalı (raw miktar toplamları; tür-ayarı net-varlıkta UYGULANMAZ).
describe("ozet — net varlık / nakit / yatırım (source-derived, App.jsx ile birebir)", () => {
  it("yatırım güncel değeri: guncelFiyat varsa onu, yoksa alisFiyati'nı kullanır", () => {
    expect(yatirimGuncelDeger({ adet: 2, guncelFiyat: 100, alisFiyati: 80 })).toBe(200);
    expect(yatirimGuncelDeger({ adet: 3, alisFiyati: 50 })).toBe(150); // guncelFiyat yok
    expect(yatirimGuncelDeger({ adet: 3, guncelFiyat: 0, alisFiyati: 50 })).toBe(150); // 0 → alis
  });

  it("yatirimDegeri: tüm yatırımların güncel değer toplamı", () => {
    const d = { yatirimlar: [{ adet: 2, guncelFiyat: 100 }, { adet: 1, alisFiyati: 40 }] };
    expect(yatirimDegeri(d)).toBe(240);
    expect(yatirimDegeri({})).toBe(0);
  });

  it("hesap varlık/borç/net: kart-dışı bakiye toplamı − kart bakiye toplamı", () => {
    const d = { hesaplar: [
      { tip: "nakit", bakiye: 1000 }, { tip: "banka", bakiye: 5000 },
      { tip: "birikim", bakiye: 2000 }, { tip: "kart", bakiye: 1500 },
    ] };
    expect(hesapVarlikToplam(d)).toBe(8000);
    expect(hesapBorcToplam(d)).toBe(1500);
    expect(hesapNet(d)).toBe(6500);
  });

  it("nakitToplam: HESAP VARSA gerçek bakiyeden (varlık−borç)", () => {
    const d = { hesaplar: [{ tip: "banka", bakiye: 5000 }, { tip: "kart", bakiye: 1500 }],
      gelirler: [{ miktar: 999 }], giderler: [{ miktar: 111 }], abonelikler: [{ miktar: 50 }] };
    expect(nakitToplam(d)).toBe(3500); // hesap var → akış YOK SAYILIR
  });

  it("nakitToplam: HESAP YOKSA akış modeline düşer (gelir−gider−abonelik, RAW)", () => {
    const d = { hesaplar: [], gelirler: [{ miktar: 10000 }], giderler: [{ miktar: 3000 }], abonelikler: [{ miktar: 500 }] };
    expect(nakitToplam(d)).toBe(6500);
  });

  it("netVarlik: nakit + yatırım", () => {
    const d = { hesaplar: [{ tip: "banka", bakiye: 5000 }, { tip: "kart", bakiye: 1000 }],
      yatirimlar: [{ adet: 2, guncelFiyat: 100 }] };
    expect(netVarlik(d)).toBe(4000 + 200); // nakit 4000 + yatırım 200
  });

  it("boş/eksik findata güvenli 0", () => {
    expect(netVarlik({})).toBe(0);
    expect(netVarlik(null)).toBe(0);
    expect(nakitToplam({})).toBe(0);
  });
});
