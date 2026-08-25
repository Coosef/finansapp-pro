// ============================================================
// Service Worker güncelleme yöneticisi — GÜVENLİ otomatik reload
// ------------------------------------------------------------
// autoUpdate SW yeni sürümü aktive edince controllerchange tetiklenir ve açık
// sekme kendini yeniler (bayat paket asılı kalmasın). ANCAK kaydedilmemiş
// değişiklik (persister pending / inFlight / CAS çakışması) varken KOŞULSUZ
// reload risklidir: uçuştaki write kesilebilir, çakışma durumu kaybolabilir,
// kullanıcı senkron beklerken sayfa sıfırlanır. Bu yönetici reload'u yalnız
// "temiz + ACK'lenmiş" durumda yapar; kirliyken ERTELER ve temizlenince (ACK
// nudge'ı veya fallback poll) yeniler.
//
// NOT: Bu, false "Kaydedildi" düzeltmesinden AYRI bir güvenlik katmanıdır
// (WAL zaten reload'da kurtarır; bu katman gereksiz reload kesintisini önler).
//
// kirliMi() → boolean   (true = kaydedilmemiş değişiklik var; tanımsız = temiz say)
// yenile()              (genelde () => window.location.reload())
export function createSwUpdater({ kirliMi, yenile, aralik = 3000, _setInterval = setInterval, _clearInterval = clearInterval } = {}) {
  let tetiklendi = false; // birden çok controllerchange gelse de tek reload
  let timer = null;

  const kirli = () => typeof kirliMi === "function" && kirliMi() === true;

  function dene() {
    if (kirli()) return false; // kaydedilmemiş değişiklik → ertele
    if (timer) { _clearInterval(timer); timer = null; }
    yenile();
    return true;
  }

  return {
    // controllerchange geldiğinde çağrılır.
    guncellemeGeldi() {
      if (tetiklendi) return;
      tetiklendi = true;
      if (dene()) return;                    // temizse hemen yenile
      timer = _setInterval(dene, aralik);    // kirliyse temizlenene dek beklemeli dene
    },
    // Dışarıdan "artık temiz olabilir" bildirimi (ör. persister ACK sonrası).
    // Yalnız bekleyen bir güncelleme varsa etkindir.
    tekrarDene() { if (tetiklendi) dene(); },
    _bekliyorMu() { return timer !== null; },
  };
}
