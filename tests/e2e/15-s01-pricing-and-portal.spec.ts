/**
 * S01 parts 8 and 12, report-back screenshots (LLD 8.1.7 "Public claims", contract P13):
 * - /pricing's comparison table with report_v2 off (today's table, no Reports row) and on globally (the Reports row
 *   and its footnote). The global value is put back as it was after the test.
 * - The client portal's Reports card (report_v2 on for the agency's workspace) at 1240 and 390.
 * Screenshots to .qa/screens/S01/.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { e2eDatabaseUrl } from "./helpers/e2e-database";
import { createSpecAccount, removeSpecAccount, type SpecAccount } from "./helpers/spec-account";

const DIR = ".qa/screens/S01";
let account: SpecAccount;
let token = "";
let before: unknown;

test.beforeAll(async () => {
  account = await createSpecAccount({ key: "s01-p13", plan: "agency" });
  const sql = postgres(e2eDatabaseUrl(), { max: 1 });
  try {
    const [row] = await sql<
      { value: unknown }[]
    >`SELECT value FROM feature_settings WHERE key = 'report_v2'`;
    before = row ? row.value : undefined;
    const [brand] = await sql<{ id: string }[]>`
      INSERT INTO brands (organization_id, name, domain, vertical, region)
      VALUES (${account.organizationId}, 'Wren Home Services', 'hero-p13.com.au', 'tradies', 'au') RETURNING id`;
    const [audit] = await sql<{ id: string }[]>`
      INSERT INTO audits (brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count,
        prompts_count, runs_per_prompt, total_calls, started_at, completed_at)
      VALUES (${brand.id}, ${account.organizationId}, 54, 'manual', 'complete', ARRAY['chatgpt']::text[], 1, 10, 1, 10,
        now() - interval '5 minutes', now()) RETURNING id`;
    for (const [i, tierName, tier, mentioned] of [
      [0, "Premium Audit", "enhanced", 7],
      [1, "Growth Plan", "standard", 4],
    ] as const) {
      await sql`INSERT INTO generated_reports (brand_id, organization_id, audit_id, report_type, period_label,
          narrative_text, headline, report_tier, contents_snapshot, pdf_url, created_at)
        VALUES (${brand.id}, ${account.organizationId}, ${audit.id}, 'weekly', ${`2026-W${47 - i}`}, 'n', 'h', ${tier},
          ${sql.json({ schema: 1, tierName, headline: { mentioned, answers: 40 } })},
          ${`${account.organizationId}/r${i}.pdf`}, now() - ${`${i * 7} days`}::interval)`;
    }
    token = `e2e-p13-${brand.id}`;
    await sql`INSERT INTO client_portal_invites (organization_id, brand_id, invite_token, invitee_name)
      VALUES (${account.organizationId}, ${brand.id}, ${token}, 'Wren client')`;
    await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled)
      VALUES (${account.organizationId}, 'report_v2', true)`;
  } finally {
    await sql.end();
  }
});

test.afterAll(async () => {
  const sql = postgres(e2eDatabaseUrl(), { max: 1 });
  try {
    if (before === undefined) await sql`DELETE FROM feature_settings WHERE key = 'report_v2'`;
    else
      await sql`UPDATE feature_settings SET value = ${sql.json(before as boolean)} WHERE key = 'report_v2'`;
  } finally {
    await sql.end();
  }
  await removeSpecAccount(account);
});

async function setGlobal(on: boolean) {
  const sql = postgres(e2eDatabaseUrl(), { max: 1 });
  try {
    await sql`INSERT INTO feature_settings (key, value) VALUES ('report_v2', ${sql.json(on)})
      ON CONFLICT (key) DO UPDATE SET value = ${sql.json(on)}, updated_at = now()`;
  } finally {
    await sql.end();
  }
}

/** Light theme (the screenshots' names say so) and the cookie banner out of the way. */
async function lightAndNoBanner(page: import("@playwright/test").Page) {
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  const decline = page.getByRole("button", { name: "Decline" });
  if (await decline.isVisible().catch(() => false)) await decline.click();
  // The theme's colours ease in (120-160 ms transitions): wait them out before the screenshot.
  await page.waitForTimeout(800);
}

test("pricing: no Reports row with report_v2 off; the row and its footnote with it on", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1240, height: 900 });
  await setGlobal(false);
  await page.goto("/pricing");
  const table = page.locator("table").last();
  await expect(table).toBeVisible();
  await expect(page.locator('[data-row="value:Reports"]')).toHaveCount(0);
  await lightAndNoBanner(page);
  await table.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${DIR}/pricing-reports-row-off-1240.png`, fullPage: true });
  await setGlobal(true);
  await page.goto("/pricing");
  const row = page.locator('[data-row="value:Reports"]');
  await expect(row).toContainText("Basic and Standard");
  await expect(row).toContainText(
    "Basic, Standard and Enhanced, chosen per client report, with your own names",
  );
  await expect(page.locator("[data-reports-footnote]")).toContainText("What each report contains");
  await lightAndNoBanner(page);
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${DIR}/pricing-reports-row-on-1240.png`, fullPage: true });
  await setGlobal(false);
});

test("the client portal's Reports card (P13)", async ({ page }) => {
  await page.goto(`/client-portal/${token}`);
  const card = page.getByTestId("p13-reports");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("p13-row")).toHaveCount(2);
  await expect(card).toContainText("Premium Audit");
  await expect(card).toContainText("Audit #54");
  await expect(card).toContainText("18%");
  await lightAndNoBanner(page);
  for (const [w, h] of [
    [1240, 900],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await card.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: `${DIR}/P13-${w}-light.png` });
  }
});
