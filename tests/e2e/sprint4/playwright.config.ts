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
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_APP_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next dev --port 3000",
    port: 3000,
    cwd: path.resolve(process.cwd()),
    timeout: 120_000,
    reuseExistingServer: true,
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/visibleau",
      DIRECT_URL: process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/visibleau",
      LLM_MODE: "mock",
      STORAGE_DRIVER: "local",
    },
  },
});
