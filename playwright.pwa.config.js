import { defineConfig, devices } from "@playwright/test";

// REAL-PWA E2E — normal suite'ten AYRI. Fark: serviceWorkers "allow" (GERÇEK service
// worker aktif). Amaç: sync-correctness invariant'ının canlı SW altında da tuttuğunu
// kanıtlamak (server ACK yoksa "Kaydedildi" YOK; /pb asla cache'ten servis edilmez).
// http://localhost secure-context istisnası → SW register olur. Normal *.spec.mjs suite'i
// (serviceWorkers:"block") DEĞİŞTİRİLMEZ; bu config yalnız *.pwa.mjs dosyalarını toplar.
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.pwa\.mjs/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  globalSetup: "./e2e/global-setup.mjs",
  globalTeardown: "./e2e/global-teardown.mjs",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-pwa" }]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    serviceWorkers: "allow", // ← GERÇEK SW (normal suite'te block)
  },
  projects: [{ name: "chromium-pwa", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.CI ? "npm run preview" : "npm run build && npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
