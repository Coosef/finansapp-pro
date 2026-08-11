// Geçici SSR smoke testi — her ekranı render edip render-anı çökmesi var mı bakar.
import { describe, it, expect, beforeAll } from "vitest";
import { renderToString } from "react-dom/server";

// Tarayıcı globalleri (render sırasında erişilebilir olsun, yanlış-pozitif olmasın)
beforeAll(() => {
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  if (typeof window === "undefined") globalThis.window = globalThis;
  window.matchMedia = globalThis.matchMedia;
  window.localStorage = globalThis.localStorage;
  if (!globalThis.navigator) { try { globalThis.navigator = { userAgent: "node", standalone: false }; } catch { /* salt-okunur */ } }
  globalThis.Notification = function () {};
  globalThis.Notification.permission = "default";
  globalThis.Notification.requestPermission = async () => "default";
  // Bulut senkron BAĞLI + ORTAK HANE durumu: Ayarlar > BulutKart'ın bağlı ve
  // hane dalları (Icon kullanır) render edilsin ki eksik import gibi hatalar
  // testte yakalansın.
  globalThis.localStorage.setItem("finansapp:sync", JSON.stringify({
    url: "http://localhost:8090", token: "test-token", userId: "test-user", email: "test@ornek.com",
    haneId: "test-hane", haneAd: "Test Hane", haneKod: "ABC234",
  }));
});

const noop = () => {};
const aktarmaProps = (extra = {}) => ({ setFindata: noop, bildir: noop, ...extra });

async function load() {
  const { bosVeri } = await import("./lib/finance.js");
  const fd = bosVeri();
  fd.gelirler = [{ id: 1, baslik: "Maaş", miktar: 58000, kategori: "Maaş", tarih: "2026-06-01", otomatik: true }];
  fd.giderler = [{ id: 2, baslik: "Market", miktar: 1240, kategori: "Market", tarih: "2026-06-20", hesapId: 9 }];
  fd.abonelikler = [{ id: 3, baslik: "Spotify", miktar: 60, kategori: "Eğlence", tarih: "2026-06-05" }];
  fd.yatirimlar = [{ id: 4, tip: "kripto", ad: "Bitcoin", sembol: "BTC", adet: 0.5, alisFiyati: 97000, guncelFiyat: 114000, gecmis: [{ tarih: "2026-06-01", deger: 48500 }] }];
  fd.hesaplar = [{ id: 9, ad: "Garanti", tip: "banka", bakiye: 25000 }, { id: 10, ad: "Kart", tip: "kart", bakiye: 4000 }];
  fd.maaslar = [{ id: "m1", ad: "Ana Maaş", tutar: 58000, hesapId: 9, odemeGunu: 1, kategori: "Maaş", baslangic: "2026-06", aktif: true }];
  fd.maasAyarlari = [{ id: "a1", maasId: "m1", ay: "2026-06", override: null, ekOdeme: 5000, ekEtiket: "Prim", gerceklesen: 63000 }];
  fd.hedefler = [{ id: 5, ad: "Tatil", tip: "birikim", hedefTutar: 80000, mevcutTutar: 38000, aylikKatki: 5000, otomatikKatki: true, sonKatki: "2026-06" }];
  fd.butceler = { Market: 9000 };
  fd.kurlar = { usd: 32, eur: 35 };
  fd.ayarlar.kuruldu = true;
  return fd;
}

describe("ekran render smoke", () => {
  it("tüm ekranlar render-anı çökmeden render olur", async () => {
    const fd = await load();
    const user = { username: "mehmet@ornek.com", ad: "mehmet", bulut: true };

    const { Panel } = await import("./features/dashboard.jsx");
    const { Islemler, IslemModal } = await import("./features/transactions.jsx");
    const { Hesaplar } = await import("./features/accounts.jsx");
    const { Yatirimlar, YatirimModal } = await import("./features/investments.jsx");
    const { Planlama } = await import("./features/planning.jsx");
    const { Analiz } = await import("./features/analysis.jsx");
    const { Takvim } = await import("./features/calendar.jsx");
    const { Asistan } = await import("./features/assistant.jsx");
    const { Hane } = await import("./features/household.jsx");
    const { Veri } = await import("./features/report.jsx");
    const { Ayarlar } = await import("./features/settings.jsx");
    const { Login, PinGate, Onboarding } = await import("./features/auth.jsx");

    const ekranlar = [
      <Login onLogin={noop} onRegister={noop} />,
      <PinGate dogruPin="1234" onAc={noop} onCikis={noop} />,
      <Onboarding user={user} setFindata={noop} />,
      <Panel {...aktarmaProps({ findata: fd, fd, donem: "buAy", donemAdi: "Bu ay", toplamGelir: 58000, toplamGider: 1240, toplamAbonelik: 60, nakit: 56700, netDeger: 138700, yatirimDeger: 57000, yatirimKar: 8500, guncelDeger: (y) => y.adet * (y.guncelFiyat || y.alisFiyati), onHizliEkle: noop, kategoriOgren: noop, onGit: noop })} />,
      <Islemler findata={fd} fd={fd} donem="buAy" bildir={noop} onSil={noop} onDuzenle={noop} onGelirEkle={noop} onGiderEkle={noop} onAbonelikEkle={noop} />,
      <IslemModal mod="islem" form={{ tip: "gider", baslik: "", miktar: "", kategori: "Market", tarih: "2026-06-24" }} setForm={noop} kategorilerGelir={["Maaş"]} kategorilerGider={["Market"]} hesaplar={fd.hesaplar} hafiza={{}} onClose={noop} onKaydet={noop} />,
      <Hesaplar findata={fd} setFindata={noop} bildir={noop} />,
      <Yatirimlar findata={fd} setFindata={noop} guncelDeger={(y) => y.adet * (y.guncelFiyat || y.alisFiyati)} yatirimDeger={57000} yatirimKar={8500} yatirimMaliyet={48500} onEkle={noop} onSil={noop} onDuzenle={noop} onGuncelle={noop} guncelleniyor={false} />,
      <YatirimModal form={{ tip: "kripto", ad: "", sembol: "", adet: "", alisFiyati: "", alisTarihi: "2026-06-24" }} setForm={noop} onClose={noop} onKaydet={noop} />,
      <Planlama findata={fd} setFindata={noop} bildir={noop} />,
      <Analiz findata={fd} fd={fd} donem="buAy" donemAdi="Bu ay" toplamGelir={58000} />,
      <Takvim findata={fd} onDuzenle={noop} />,
      <Asistan findata={fd} guncelDeger={(y) => y.adet * (y.guncelFiyat || y.alisFiyati)} toplamGelir={58000} toplamGider={1240} toplamAbonelik={60} yatirimDeger={57000} netDeger={138700} bildir={noop} />,
      <Hane findata={fd} />,
      <Veri findata={fd} setFindata={noop} user={user} bildir={noop} ekle={noop} kategoriOgren={noop} toplamGelir={58000} toplamGider={1240} toplamAbonelik={60} yatirimDeger={57000} yatirimKar={8500} netDeger={138700} guncelDeger={(y) => y.adet * (y.guncelFiyat || y.alisFiyati)} />,
      <Ayarlar findata={fd} setFindata={noop} bildir={noop} user={user} onLogout={noop} />,
    ];
    for (const el of ekranlar) {
      expect(() => renderToString(el)).not.toThrow();
    }
  });
});
