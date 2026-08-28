import { defineConfig, devices } from "@playwright/test";

// DEV-MODE smoke — React.StrictMode'un kurulum→temizlik→kurulum probu YALNIZ development
// derlemesinde çalışır; production preview (playwright.config.js) bu davranışı KANITLAYAMAZ.
// Bu yüzden `vite dev` sunucusuna karşı dar bir koşu: aynı throwaway PocketBase 0.39.10.
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.dev\.mjs/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  globalSetup: "./e2e/global-setup.mjs",
  globalTeardown: "./e2e/global-teardown.mjs",
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  projects: [{ name: "chromium-dev", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
