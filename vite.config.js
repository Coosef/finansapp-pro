import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
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
  },
  preview: {
    host: true,
    port: 4173,
  },
});
