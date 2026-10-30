import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env.test.local") });

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  // The dev server compiles every route on its first visit.
  timeout: 240_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.E2E_APP_URL ?? "http://localhost:3000",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next dev --port 3000",
    port: 3000,
    cwd: path.resolve(process.cwd()),
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      LLM_MODE: "mock",
      STORAGE_DRIVER: "local",
    },
  },
});
