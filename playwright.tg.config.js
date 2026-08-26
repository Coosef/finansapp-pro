import { defineConfig } from "@playwright/test";

// Telegram T1A E2E — normal/PWA suite'lerinden AYRI. Browser YOK: testler PB endpoint'lerine
// doğrudan fetch + HMAC ile vurur (throwaway PB, tg-global-setup ile TG secret'lı). *.tg.mjs.
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.tg\.mjs/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  globalSetup: "./e2e/tg-global-setup.mjs",
  globalTeardown: "./e2e/tg-global-teardown.mjs",
  reporter: [["list"]],
  projects: [{ name: "tg-api" }],
});
