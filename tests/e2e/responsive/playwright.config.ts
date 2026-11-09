import { defineConfig, devices } from "@playwright/test";
import { e2eBaseUrl, e2eWebServer, loadE2eEnv } from "../helpers/e2e-config";

// .env.test.local only, and the local e2e database only (tests/e2e/helpers/e2e-config.ts).
loadE2eEnv();

/** Run: npx playwright test --config tests/e2e/responsive/playwright.config.ts */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  // Each page is loaded at four widths, and the dev server compiles every
  // route on its first visit.
  timeout: 240_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: e2eBaseUrl(),
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: e2eWebServer({ timeout: 180_000 }),
});
