import { defineConfig, devices } from "@playwright/test";

// Browser E2E — tamamen izole: throwaway PocketBase (prod ile aynı sürüm 0.39.10) +
// build edilmiş Vite preview. İlk sürüm serial + deterministic (workers:1, retries:0).
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.mjs/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  globalSetup: "./e2e/global-setup.mjs",
  globalTeardown: "./e2e/global-teardown.mjs",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
