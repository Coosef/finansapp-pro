import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "fs";
import { execFileSync } from "child_process";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url)));

// Build kimliği (stale-client teşhisi). Docker/CI'da git yoksa BUILD_SHA env veya
// "dev" fallback; runtime davranışını ETKİLEMEZ, yalnız diagnostics içindir.
// execFileSync + argüman dizisi: shell yok → komut enjeksiyonu riski yok (sabit komut).
function gitSha() {
  try { return execFileSync("git", ["rev-parse", "--short", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return ""; }
}
const buildSha = process.env.BUILD_SHA || gitSha() || "dev";
const buildTime = process.env.BUILD_TIME || new Date().toISOString();

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version), // uygulamada SURUM olarak okunur
    __BUILD_SHA__: JSON.stringify(buildSha),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "FinansApp Pro",
        short_name: "FinansApp",
        description: "Türkçe kişisel finans yönetimi",
        lang: "tr",
        dir: "ltr",
        theme_color: "#143A2B",
        background_color: "#143A2B",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    host: true, // Docker / LAN erişimi için
    port: 5173,
    // DB-only: geliştirmede /pb → yerel PocketBase (prod'da nginx aynısını yapar).
    // Dev için PocketBase'i :8090'da çalıştır (ör. `docker run -p 8090:8090 ...`).
    proxy: {
      "/pb": { target: "http://localhost:8090", changeOrigin: true, rewrite: (p) => p.replace(/^\/pb/, "") },
    },
  },
  preview: {
    host: true,
    port: 4173,
    proxy: {
      "/pb": { target: "http://localhost:8090", changeOrigin: true, rewrite: (p) => p.replace(/^\/pb/, "") },
    },
  },
  // Vitest yalnız src birim/entegrasyon testlerini toplar. e2e Playwright dosyaları
  // (*.spec.mjs) HARİÇ — aksi halde vitest'in varsayılan spec glob'u onları toplar ve
  // Playwright-only test.beforeEach() vitest bağlamında patlar. (Yalnız test toplama;
  // build/dev davranışı etkilenmez.)
  test: {
    include: ["src/**/*.test.{js,jsx}"],
  },
});
