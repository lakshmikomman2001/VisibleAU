import { defineConfig, devices } from "@playwright/test";
import { e2eBaseUrl, e2eWebServer, loadE2eEnv } from "../../e2e/helpers/e2e-config";

// .env.test.local only, and the local e2e database only (tests/e2e/helpers/e2e-config.ts). The
// .bat/.sh wrappers that started `pnpm dev` in the main tree (reading .env.local) are gone (10 Nov).
loadE2eEnv();

/** Run: npx playwright test --config tests/qa/sprint4/playwright.config.ts (it starts its own server). */
export default defineConfig({
  testDir: ".",
  testMatch: "**/features/**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  // The dev server compiles every route on its first visit.
  timeout: 180_000,
  use: {
    baseURL: e2eBaseUrl(),
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: e2eWebServer({ timeout: 180_000 }),
});
