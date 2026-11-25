/**
 * S01 part 5 (LLD 8.1.3, contract P08): the report contents panel on a brand's Reports page, report_v2 on for the
 * workspace (a workspace override, as Sri switches it on for one workspace).
 * - "Generate report" opens the panel: header with the basis audit, measured actions with their evidence, the
 *   agency's own action, the sections and the outline.
 * - Agency curates: hide an action, Save without generating -> "Report contents saved." (inline).
 * - Escape closes it. With report_v2 off, Generate starts today's report directly (no panel).
 * Screenshots (P08) at 1240 and 390, light and dark, to .qa/screens/S01/.
 */
import postgres from "postgres";
import { expect, testSignedInAs } from "./helpers/auth";
import { e2eDatabaseUrl } from "./helpers/e2e-database";
import { createSpecAccount, removeSpecAccount, type SpecAccount } from "./helpers/spec-account";

const DIR = ".qa/screens/S01";
let account: SpecAccount;
const test = testSignedInAs(() => account);
let brandId = "";

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
  account = await createSpecAccount({ key: "s01-p08", plan: "agency" });
  const sql = postgres(e2eDatabaseUrl(), { max: 1 });
  try {
    const [brand] = await sql<{ id: string }[]>`
      INSERT INTO brands (organization_id, name, domain, vertical, region, primary_regions, suburb, state, country,
        location_mode, location_confirmed_at, classification_status, category_confirmed_at, categories)
      VALUES (${account.organizationId}, 'TechCore IT', 'techcore-p08.com.au', 'local_business', 'au',
        ARRAY['NSW:Riverstone']::text[], 'Riverstone', 'NSW', 'Australia', 'fixed', now(), 'complete', now(),
        ARRAY['trades_general']::text[])
      RETURNING id`;
    brandId = brand.id;
    const [audit] = await sql<{ id: string }[]>`
      INSERT INTO audits (brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count,
        prompts_count, runs_per_prompt, total_calls, score_composite, started_at, completed_at)
      VALUES (${brandId}, ${account.organizationId}, 1, 'manual', 'complete', ARRAY['chatgpt']::text[], 1, 40, 1, 40,
        0, now() - interval '5 minutes', now())
      RETURNING id`;
    for (let i = 0; i < 40; i += 1) {
      const sources = [
        ...(i < 27
          ? [{ domain: "kangaroo-it.com.au", url: `https://kangaroo-it.com.au/s/${i}` }]
          : []),
        ...(i < 9
          ? [
              {
                domain: "localbusinessguide.com.au",
                url: `https://localbusinessguide.com.au/l/${i}`,
              },
            ]
          : []),
      ];
      await sql`
        INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, is_branded_prompt,
          mention_verification, sentiment_label, context_label, response_text, response_snippet, cited_sources,
          llm_model, llm_cost_usd)
        VALUES (${audit.id}, 'chatgpt', ${`Best managed IT provider in Western Sydney? (${i})`}, ${i}, 1, false, false,
          null, 'neutral', 'absent', 'Here are some providers.', 'Here are some providers.', ${sql.json(sources)},
          'test-model', '0.001000')`;
    }
    await sql`INSERT INTO agency_actions (organization_id, brand_id, title, priority, position)
      VALUES (${account.organizationId}, ${brandId}, 'Ask five clients for reviews', 'high', 0)`;
  } finally {
    await sql.end();
  }
});

test.afterAll(async () => {
  await removeSpecAccount(account);
});

test.describe("S01 part 5: the report contents panel (P08)", () => {
  test("report_v2 on: Generate opens the panel; hide an action and save; Escape closes", async ({
    page,
  }) => {
    await setFlag(true);
    await page.setViewportSize({ width: 1240, height: 900 });
    await page.goto(`/brands/${brandId}/reports`);
    await page.getByTestId("generate-report").click();
    const panel = page.getByTestId("p08-panel");
    // S01B part 6g: "If the warm times match and stay well under a second, raise that one expectation's wait to 15 s
    // (approved: a change to S01's test, with this line quoted)". The panel's GET report-preferences took 4.1-4.9 s on
    // a cold dev server (3.5-4.6 s of it compiling the route), on the parent of S01B and on S01B alike, against the
    // 5 s default; warm, 0.19-0.47 s on both.
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("p08-header")).toContainText("TechCore IT · based on audit #1");
    await expect(page.getByTestId("p08-measured-item").first()).toContainText(
      "See why AI recommends other providers",
    );
    await expect(page.getByTestId("p08-evidence").first()).toContainText("· audit #1");
    await expect(page.getByTestId("p08-agency")).toContainText("Ask five clients for reviews");
    await expect(page.getByTestId("p08-outline")).toContainText("Why, and what to do next");

    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      // The theme's colours ease in (120-160 ms transitions): wait them out before the screenshot.
      await page.waitForTimeout(800);
      await page.setViewportSize({ width: 1240, height: 900 });
      await page.screenshot({ path: `${DIR}/P08-1240-${theme}.png` });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `${DIR}/P08-390-${theme}.png` });
    }
    await page.setViewportSize({ width: 1240, height: 900 });

    await page.getByTestId("p08-save").click();
    await expect(
      page.getByRole("status").filter({ hasText: "Report contents saved." }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  });

  test("S01 part 8: the report type -- Basic shows today's pages, and Generate sends the tier", async ({
    page,
  }) => {
    await setFlag(true);
    // The POST is stubbed: this checks what the panel asks for, not the job.
    let body: Record<string, unknown> | null = null;
    await page.route(`**/api/brands/${brandId}/reports/generate`, (route) => {
      body = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({
        status: 202,
        contentType: "application/json",
        body: '{"message":"Report generation started"}',
      });
    });
    await page.goto(`/brands/${brandId}/reports`);
    await page.getByTestId("generate-report").click();
    await expect(page.getByTestId("p08-panel")).toBeVisible();
    const enhanced = page.getByRole("radio", { name: "Enhanced" });
    await expect(enhanced).toHaveAttribute("aria-checked", "true");
    await expect(enhanced).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("radio", { name: "Basic" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByTestId("p08-basic-note")).toContainText(
      "A Basic report has today's report pages",
    );
    await expect(page.getByTestId("p08-outline")).toContainText("Why your score is what it is");
    await expect(page.getByTestId("p08-outline")).not.toContainText("Beyond AI answers");
    await page.getByTestId("p08-generate").click();
    await expect.poll(() => body?.tier).toBe("basic");
    expect(body).not.toHaveProperty("contents");
    await expect(page.getByTestId("p08-panel")).toHaveCount(0);
  });

  test("S01 part 9: Enhanced lists the checks before the report; Standard doesn't", async ({
    page,
  }) => {
    await setFlag(true);
    await page.goto(`/brands/${brandId}/reports`);
    await page.getByTestId("generate-report").click();
    const checks = page.getByTestId("p08-checks");
    await expect(checks).toContainText("Checks before this report");
    const rows = page.getByTestId("p08-check");
    await expect(rows).toHaveCount(5);
    // The brand has never had a technical audit: those run; no YouTube channel is linked.
    await expect(rows.nth(0)).toContainText(
      "Business identity (ABN)Not checked yet · will run again",
    );
    await expect(rows.nth(1)).toContainText("No channel linked · shown as not linked");
    await expect(rows.nth(4)).toContainText("Your directory profilesFrom audit #1");
    await page.getByRole("radio", { name: "Standard" }).click();
    await expect(checks).toHaveCount(0);
  });

  test("S01 part 10: the reports list names each report's type; Report names on Report branding", async ({
    page,
  }) => {
    await setFlag(true);
    const sql = postgres(e2eDatabaseUrl(), { max: 1 });
    try {
      const [audit] = await sql<
        { id: string }[]
      >`SELECT id FROM audits WHERE brand_id = ${brandId} LIMIT 1`;
      await sql`INSERT INTO generated_reports (brand_id, organization_id, audit_id, report_type, period_label,
          narrative_text, headline, report_tier, contents_snapshot, pdf_failure_reason)
        VALUES (${brandId}, ${account.organizationId}, ${audit.id}, 'weekly', '2026-W47', 'n',
          'TechCore IT: AI visibility, week 47', 'standard', ${sql.json({ schema: 1, tierName: "Growth Plan" })},
          'render_error')`;
    } finally {
      await sql.end();
    }
    await page.goto(`/brands/${brandId}/reports`);
    await expect(page.getByTestId("p17-report-type").first()).toHaveText("Growth Plan");
    const light = async () => {
      await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
      // The theme's colours ease in (120-160 ms transitions): wait them out before the screenshot.
      await page.waitForTimeout(800);
    };
    await light();
    for (const [w, h] of [
      [1240, 900],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.screenshot({ path: `${DIR}/P17-${w}-light.png` });
    }
    await page.setViewportSize({ width: 1240, height: 900 });
    await page.goto("/settings/report-branding");
    const card = page.getByTestId("p18-card");
    await expect(card).toContainText("Report names");
    await page.getByLabel("Enhanced report name").fill("Premium Audit");
    await expect(page.getByTestId("p18-preview")).toContainText("PREMIUM AUDIT");
    await light();
    await card.scrollIntoViewIfNeeded();
    for (const [w, h] of [
      [1240, 900],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${DIR}/P18-${w}-light.png` });
    }
  });

  test("report_v2 off: Generate starts today's report directly, no panel", async ({ page }) => {
    await setFlag(false);
    // The POST is stubbed (as sprint4-reports does): this checks the page asks for today's report, not the job.
    let posted = false;
    await page.route(`**/api/brands/${brandId}/reports/generate`, (route) => {
      posted = true;
      return route.fulfill({
        status: 202,
        contentType: "application/json",
        body: '{"message":"Report generation started"}',
      });
    });
    await page.goto(`/brands/${brandId}/reports`);
    await page.getByTestId("generate-report").click();
    await expect.poll(() => posted).toBe(true);
    await expect(page.getByTestId("p08-panel")).toHaveCount(0);
  });
});
