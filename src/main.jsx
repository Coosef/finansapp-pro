import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import FinansAppPro from "./App.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { createSwUpdater } from "./lib/swupdate.js";

// Yeni sürüm deploy edilip service worker güncellenince, açık sekmeyi otomatik
// yenile (bayat paket asılı kalmasın; "Clear site data" gerekmez). ANCAK
// kaydedilmemiş değişiklik (persister pending / inFlight / CAS çakışması) varken
// KOŞULSUZ reload risklidir → uçuştaki write kesilir, çakışma kaybolur. Bu yüzden
// reload createSwUpdater ile guard'lanır: temiz+ACK'liyken hemen, kirliyken temizlenene
// dek (ACK nudge'ı + fallback poll) ERTELENİR. Kirli/temiz durumunu App penceredeki
// window.__finansappKirli üzerinden bildirir (persister.hasUnsaved()).
if ("serviceWorker" in navigator) {
  const swUpdater = createSwUpdater({
    kirliMi: () => typeof window.__finansappKirli === "function" && window.__finansappKirli() === true,
    yenile: () => window.location.reload(),
  });
  window.__finansappSwNudge = () => swUpdater.tekrarDene(); // App, ACK sonrası çağırır
  navigator.serviceWorker.addEventListener("controllerchange", () => swUpdater.guncellemeGeldi());
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <FinansAppPro />
    </ErrorBoundary>
  </StrictMode>
);
