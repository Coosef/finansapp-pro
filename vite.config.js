import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url)));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version), // uygulamada SURUM olarak okunur
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
