import { defineConfig } from "@playwright/test";

// Telegram AI (T2B) E2E — T1A/PWA/normal suite'lerinden AYRI. Browser YOK: testler PB
// endpoint'lerine HMAC ile doğrudan vurur + host'ta fake AI upstream çalıştırır. *.t2b.mjs.
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.t2b\.mjs/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  globalSetup: "./e2e/t2b-global-setup.mjs",
  globalTeardown: "./e2e/t2b-global-teardown.mjs",
  reporter: [["list"]],
  projects: [{ name: "t2b-api" }],
});
