import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import FinansAppPro from "./App.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";

// Yeni sürüm deploy edilip service worker güncellenince, açık sekmeyi bir kez
// otomatik yenile. Böylece bayat önbellek yüzünden eski paket asılı kalmaz
// ("Clear site data" yapmaya gerek kalmaz). autoUpdate SW skipWaiting+clientsClaim
// ile devreye girer → controllerchange tetiklenir → sayfa kendini yeniler.
if ("serviceWorker" in navigator) {
  let yenileniyor = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (yenileniyor) return;
    yenileniyor = true;
    window.location.reload();
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <FinansAppPro />
    </ErrorBoundary>
  </StrictMode>
);
