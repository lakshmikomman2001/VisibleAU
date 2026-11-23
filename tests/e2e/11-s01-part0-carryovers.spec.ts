/**
 * S01 part 0 (carry-over fixes from S00, not flagged):
 * - the wizard's first step offers the site's own name when the owner typed another (GET /api/brands/name-suggestion
 *   stubbed with the production answer recorded on 23 Nov 2026: no live site);
 * - /pricing: the Starter card no longer promises "Email reports" (reports are Growth and up);
 * - the audit page's headline band follows the figure shown (D-BAND): 4 of 41 answers is 9.76%, shown "10%",
 *   Developing (it was Low).
 *
 * Screenshots go to .qa/screens/S01/ (gitignored), named with S01_SHOT (default "after").
 */
import postgres from "postgres";
import { expect, testSignedInAs } from "./helpers/auth";
import { e2eDatabaseUrl } from "./helpers/e2e-database";
import { createSpecAccount, removeSpecAccount, type SpecAccount } from "./helpers/spec-account";

const SHOT = process.env.S01_SHOT ?? "after";
const DIR = ".qa/screens/S01";

let account: SpecAccount;
const test = testSignedInAs(() => account);
let auditId = "";

const HERO_ANSWER = {
  name: "Hero Home Services",
  source: "og:site_name",
  aliases: ["herohomeservices", "HeroHomeServices"],
};

test.beforeAll(async () => {
  account = await createSpecAccount({ key: "s01-part0", plan: "agency" });
  const sql = postgres(e2eDatabaseUrl(), { max: 1 });
  try {
    const [brand] = await sql<{ id: string }[]>`
      INSERT INTO brands (organization_id, name, domain, vertical, region, primary_regions, suburb, state, country,
        location_mode, location_confirmed_at, classification_status, category_confirmed_at)
      VALUES (${account.organizationId}, 'Band Edge Plumbing', 'band-edge-plumbing.com.au', 'tradies', 'au',
        ARRAY['NSW:Norwest']::text[], 'Norwest', 'NSW', 'Australia', 'fixed', now(), 'complete', now())
      RETURNING id
    `;
    const [audit] = await sql<{ id: string }[]>`
      INSERT INTO audits (brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count,
        prompts_count, runs_per_prompt, total_calls, score_composite, started_at, completed_at)
      VALUES (${brand.id}, ${account.organizationId}, 1, 'manual', 'complete', ARRAY['chatgpt']::text[], 1, 41, 1, 41,
        0, now() - interval '5 minutes', now())
      RETURNING id
    `;
    auditId = audit.id;
    // 41 everyday answers, 4 naming the business: 9.76%, shown "10%".
    for (let i = 0; i < 41; i += 1) {
      const mentioned = i < 4;
      const text = mentioned
        ? `Band Edge Plumbing is one option for question ${i}.`
        : `A plain answer to question ${i} that names no business.`;
      await sql`
        INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, is_branded_prompt,
          mention_verification, sentiment_label, context_label, response_text, response_snippet, cited_sources,
          llm_model, llm_cost_usd)
        VALUES (${audit.id}, 'chatgpt', ${`Best plumber in Norwest, question ${i}?`}, ${i}, 1, ${mentioned}, false,
          null, 'neutral', 'absent', ${text}, ${text}, ${sql.json([])}, 'test-model', '0.001000')
      `;
    }
  } finally {
    await sql.end();
  }
});

test.afterAll(async () => {
  await removeSpecAccount(account);
});

test.describe("S01 part 0: carry-over fixes", () => {
  test("the wizard offers the site's name next to Keep, and fills it only on a click", async ({
    page,
  }) => {
    await page.route("**/api/brands/name-suggestion**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(HERO_ANSWER),
      }),
    );
    await page.setViewportSize({ width: 1240, height: 900 });
    await page.goto("/brands/wizard");
    await page.getByLabel("Brand name").fill("herohomeservices");
    await page.getByLabel("Domain").fill("herohomeservices.com.au");
    await page.getByLabel("Domain").blur();
    const notice = page.locator("[data-name-run-together]");
    await expect(notice).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/wizard-step1-1240-light-${SHOT}.png`, fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${DIR}/wizard-step1-390-light-${SHOT}.png`, fullPage: false });
    await page.setViewportSize({ width: 1240, height: 900 });

    await expect(notice).toContainText("Use “Hero Home Services” · Keep “herohomeservices”");
    await expect(page.getByLabel("Brand name")).toHaveValue("herohomeservices");
    await page.getByTestId("wizard-use-site-name").click();
    await expect(page.getByLabel("Brand name")).toHaveValue("Hero Home Services");
    await expect(page.locator('[data-name-suggested="site"]')).toHaveText(
      "Suggested from your website's name. Edit if it's different.",
    );
    await expect(notice).toHaveCount(0);
  });

  test("another typed name: the site's name is offered on its own line (LLD amendment 35 copy)", async ({
    page,
  }) => {
    await page.route("**/api/brands/name-suggestion**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(HERO_ANSWER),
      }),
    );
    await page.setViewportSize({ width: 1240, height: 900 });
    await page.goto("/brands/wizard");
    await page.getByLabel("Brand name").fill("Hero Plumbing");
    await page.getByLabel("Domain").fill("herohomeservices.com.au");
    await page.getByLabel("Domain").blur();
    const offer = page.getByTestId("wizard-site-name-offer");
    await expect(offer).toHaveText(
      "Your website calls the business “Hero Home Services”. Use “Hero Home Services”",
    );
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `${DIR}/wizard-step1-offer-1240-light-${SHOT}.png`,
      fullPage: false,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: `${DIR}/wizard-step1-offer-390-light-${SHOT}.png`,
      fullPage: false,
    });
    await page.setViewportSize({ width: 1240, height: 900 });
    await expect(page.getByLabel("Brand name")).toHaveValue("Hero Plumbing");
    await page.getByTestId("wizard-use-site-name").click();
    await expect(page.getByLabel("Brand name")).toHaveValue("Hero Home Services");
    await expect(offer).toHaveCount(0);
  });

  test("a failed suggestion leaves the first step usable", async ({ page }) => {
    await page.route("**/api/brands/name-suggestion**", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Internal"}' }),
    );
    await page.goto("/brands/wizard");
    await page.getByLabel("Domain").fill("herohomeservices.com.au");
    await page.getByLabel("Domain").blur();
    await expect(page.locator('[data-site-name-ask="failed"]')).toHaveCount(1);
    await page.getByLabel("Brand name").fill("Hero Home Services");
    await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  test("/pricing: the Starter card promises no reports", async ({ page }) => {
    await page.setViewportSize({ width: 1240, height: 900 });
    await page.goto("/pricing");
    const starter = page
      .locator("section, div")
      .filter({ hasText: /^Starter/ })
      .first();
    await page.screenshot({ path: `${DIR}/pricing-1240-light-${SHOT}.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${DIR}/pricing-390-light-${SHOT}.png`, fullPage: true });
    await expect(starter).toBeVisible();
    await expect(page.getByText("Email reports")).toHaveCount(0);
  });

  test("the audit page: 4 of 41 shows 10% and is Developing", async ({ page }) => {
    await page.setViewportSize({ width: 1240, height: 900 });
    await page.goto(`/audits/${auditId}`);
    const band = page.locator("[data-visibility-band]");
    await expect(band).toBeVisible();
    await page.screenshot({
      path: `${DIR}/audit-band-edge-1240-light-${SHOT}.png`,
      fullPage: false,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: `${DIR}/audit-band-edge-390-light-${SHOT}.png`,
      fullPage: false,
    });
    await expect(page.getByText("10%", { exact: true }).first()).toBeVisible();
    await expect(band).toHaveAttribute("data-visibility-band", "developing");
    await expect(band).toHaveText("Developing");
  });
});
