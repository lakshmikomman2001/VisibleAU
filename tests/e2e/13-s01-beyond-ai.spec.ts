/**
 * S01 part 6 (LLD 8.1.4, contract P07.beyond): the audit page's "Beyond AI answers" card, report_v2 on for the
 * workspace (a workspace override, as Sri switches it on for one workspace).
 * - On: four tiles in order; each with its own date; "No ABN on file" with "Add your ABN"; blocked search crawlers
 *   as a warning; the technical score of its own maximum.
 * - Off: no card (the page is today's).
 * Screenshots (P07) at 1240 and 390, light and dark, to .qa/screens/S01/.
 */
import postgres from "postgres";
import { expect, testSignedInAs } from "./helpers/auth";
import { e2eDatabaseUrl } from "./helpers/e2e-database";
import { createSpecAccount, removeSpecAccount, type SpecAccount } from "./helpers/spec-account";

const DIR = ".qa/screens/S01";
let account: SpecAccount;
const test = testSignedInAs(() => account);
let auditId = "";

async function setFlag(on: boolean) {
  const sql = postgres(e2eDatabaseUrl(), { max: 1 });
  try {
    await sql`DELETE FROM org_feature_flags WHERE organization_id = ${account.organizationId} AND flag_key = 'report_v2'`;
    if (on)
      await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${account.organizationId}, 'report_v2', true)`;
  } finally {
    await sql.end();
  }
}

test.beforeAll(async () => {
  account = await createSpecAccount({ key: "s01-p07", plan: "agency" });
  const sql = postgres(e2eDatabaseUrl(), { max: 1 });
  try {
    const [brand] = await sql<{ id: string }[]>`
      INSERT INTO brands (organization_id, name, domain, vertical, region, primary_regions, suburb, state, country,
        location_mode, location_confirmed_at, classification_status, category_confirmed_at, categories)
      VALUES (${account.organizationId}, 'TechCore IT', 'techcore-p07.com.au', 'local_business', 'au',
        ARRAY['NSW:Riverstone']::text[], 'Riverstone', 'NSW', 'Australia', 'fixed', now(), 'complete', now(),
        ARRAY['trades_general']::text[])
      RETURNING id`;
    const [audit] = await sql<{ id: string }[]>`
      INSERT INTO audits (brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count,
        prompts_count, runs_per_prompt, total_calls, score_composite, started_at, completed_at)
      VALUES (${brand.id}, ${account.organizationId}, 1, 'manual', 'complete', ARRAY['chatgpt']::text[], 1, 10, 1, 10,
        10, now() - interval '5 minutes', now())
      RETURNING id`;
    auditId = audit.id;
    for (let i = 0; i < 10; i += 1) {
      await sql`
        INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, is_branded_prompt,
          mention_verification, sentiment_label, context_label, response_text, response_snippet, cited_sources,
          llm_model, llm_cost_usd)
        VALUES (${audit.id}, 'chatgpt', ${`Best managed IT provider in Western Sydney? (${i})`}, ${i}, 1, ${i === 0},
          false, null, 'neutral', 'absent', 'Here are some providers.', 'Here are some providers.', ${sql.json([])},
          'test-model', '0.001000')`;
    }
    await sql`INSERT INTO technical_audits (brand_id, organization_id, score_composite, score_schema, score_meta,
        findings, created_at)
      VALUES (${brand.id}, ${account.organizationId}, '38.00', '2.00', '6.00', ${sql.json({
        scoringVersion: 4,
        robots: {
          present: true,
          aiBotsAllowed: ["OAI-SearchBot", "PerplexityBot", "Googlebot"],
          aiBotsBlocked: ["Claude-SearchBot"],
          fetchStatus: "found",
        },
      })}, now() - interval '1 day')`;
    await sql`INSERT INTO youtube_presence_audits (brand_id, organization_id, check_status, channel_title,
        channel_total_videos, last_upload_at, audited_at)
      VALUES (${brand.id}, ${account.organizationId}, 'confirmed', 'TechCore IT', 14, now() - interval '20 days',
        now() - interval '2 days')`;
  } finally {
    await sql.end();
  }
});

test.afterAll(async () => {
  const sql = postgres(e2eDatabaseUrl(), { max: 1 });
  try {
    await sql`DELETE FROM technical_audits WHERE organization_id = ${account.organizationId}`;
    await sql`DELETE FROM youtube_presence_audits WHERE organization_id = ${account.organizationId}`;
  } finally {
    await sql.end();
  }
  await removeSpecAccount(account);
});

test.describe("S01 part 6: Beyond AI answers on the audit page (P07)", () => {
  test("report_v2 on: the four tiles, each with its own date", async ({ page }) => {
    await setFlag(true);
    await page.setViewportSize({ width: 1240, height: 900 });
    await page.goto(`/audits/${auditId}`);
    const card = page.getByTestId("p07-beyond");
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading", { name: "Beyond AI answers" })).toBeVisible();
    await expect(page.getByTestId("p07-beyond-identity")).toContainText("No ABN on file");
    await expect(
      page.getByTestId("p07-beyond-identity").getByRole("link", { name: "Add your ABN" }),
    ).toBeVisible();
    await expect(page.getByTestId("p07-beyond-youtube")).toContainText("Channel found");
    await expect(page.getByTestId("p07-beyond-youtube")).toContainText("14 videos");
    await expect(page.getByTestId("p07-beyond-crawlers")).toContainText("1 search crawler blocked");
    // S01C part 4, LLD amendment 63: "Crawlers: '{allowed} of {total} AI search crawlers allowed · checked {date}'";
    // "Website technical: '{score} of {max} points'".
    await expect(page.getByTestId("p07-beyond-crawlers")).toContainText(
      "3 of 4 AI search crawlers allowed · checked",
    );
    await expect(page.getByTestId("p07-beyond-technical")).toContainText("38 of 74 points");

    await card.scrollIntoViewIfNeeded();
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await page.waitForTimeout(800);
      await page.setViewportSize({ width: 1240, height: 900 });
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${DIR}/P07-1240-${theme}.png` });
      await page.setViewportSize({ width: 390, height: 844 });
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${DIR}/P07-390-${theme}.png` });
    }
  });

  test("report_v2 off: no card", async ({ page }) => {
    await setFlag(false);
    await page.goto(`/audits/${auditId}`);
    await expect(page.getByText("Per-engine performance")).toBeVisible();
    await expect(page.getByTestId("p07-beyond")).toHaveCount(0);
  });
});
