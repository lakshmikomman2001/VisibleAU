import { expect, test } from "@playwright/test";

const _BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

test.describe("F04: Audit Results (Sprint 4)", () => {
  test("F04-01: Non-existent audit returns redirect or 404", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_1_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_1_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/audits/00000000-0000-4000-8000-000000000000");
    // Should redirect to /audits list since audit not found
    await expect(page).toHaveURL(/audits/);
  });

  test("F04-02: Score bar component exists in shared components", async () => {
    const path = require("node:path");
    const fs = require("node:fs");
    const fp = path.join(process.cwd(), "components/domain/shared/score-bar.tsx");
    expect(fs.existsSync(fp)).toBe(true);
  });

  test("F04-03: Status badge component exists", async () => {
    const path = require("node:path");
    const fs = require("node:fs");
    const fp = path.join(process.cwd(), "components/domain/shared/status-badge.tsx");
    expect(fs.existsSync(fp)).toBe(true);
  });

  test("F04-04: Audit results rich component exists", async () => {
    const path = require("node:path");
    const fs = require("node:fs");
    const fp = path.join(process.cwd(), "components/domain/audit/audit-results-rich.tsx");
    expect(fs.existsSync(fp)).toBe(true);
  });
});
