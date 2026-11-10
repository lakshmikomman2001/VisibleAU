import { defineConfig, devices } from "@playwright/test";
import { e2eBaseUrl, e2eWebServer, loadE2eEnv } from "./tests/e2e/helpers/e2e-config";

// .env.test.local only, and the local e2e database only (tests/e2e/helpers/e2e-config.ts).
loadE2eEnv();

/**
 * The root specs (tests/e2e/0N-*.spec.ts). The folders under tests/e2e have their own configs, so they
 * aren't matched here. (The vitest backend suite that was under tests/e2e/backend is archived, with
 * its reasons, since 10 Nov.)
 *
 * Run: npx playwright test
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /[\\/]tests[\\/]e2e[\\/]0\d-[\w-]+\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  // The dev server compiles every route on its first visit.
  timeout: 60_000,
  use: {
    baseURL: e2eBaseUrl(),
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: e2eWebServer(),
});
