/**
 * S04B part 4 (LLD amendment 102; contract P02.section, P02.row.more, P02.addQuestion, P03.area, P07.responses,
 * P07.reachFilter), behind visibility_reach, on an invented 3-reach brand (Bluegum: 4 Local, 3 NSW, 3 Australia):
 * - edit mode keeps the sections; a Local question moves to NSW ("1 moved"), one NSW question is removed, and a typed
 *   question is added in Australia from that section's "+ Add question" (P03 opens on Australia); apply;
 * - the next audit (the e2e server's mock model): the Responses tab has one section per reach (3 Local, 3 NSW,
 *   4 Australia) and the names-your-business questions last; the reach filter's figures for each area add up to that
 *   area's tile, and the tiles to the headline; "All areas" is the page without the filter.
 * Screenshots (P02 edit mode by reach and P07 with the filter, 1240 and 390, light and dark) to .qa/screens/S04B/.
 */
import postgres from "postgres";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { backfillQuestionSets } from "@/tests/helpers/question-backfill";
import { BLUEGUM } from "@/tests/helpers/report-seeds";
import { expect, testSignedInAs } from "./helpers/auth";
import { e2eDatabaseUrl } from "./helpers/e2e-database";
import { createSpecAccount, removeSpecAccount, type SpecAccount } from "./helpers/spec-account";

const DIR = ".qa/screens/S04B";
let account: SpecAccount;
const test = testSignedInAs(() => account);
let brandId = "";
let auditId = "";
const TYPED = "Who are the most trusted plumbers in Australia for blocked drains?";

async function both(
  page: import("@playwright/test").Page,
  name: string,
  shot: (path: string) => Promise<unknown>,
) {
  const decline = page.getByRole("button", { name: "Decline" });
  if (await decline.isVisible().catch(() => false)) await decline.click();
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.waitForTimeout(800);
    await shot(`${DIR}/${name}-${theme}.png`);
  }
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
}

const counts = (text: string | null) => {
  const m = (text ?? "").match(/(\d+) of (\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
};

test.beforeAll(async () => {
  account = await createSpecAccount({ key: "s04b-reach-views", plan: "agency" });
  const sql = postgres(e2eDatabaseUrl(), { max: 1 });
  try {
    const pack = [...BLUEGUM.everyday, ...BLUEGUM.branded];
    const [brand] = await sql<{ id: string }[]>`
      INSERT INTO brands (organization_id, name, domain, vertical, region, primary_regions, suburb, state, country,
        postcode, location_mode, location_confirmed_at, classification_status, classification, category_confirmed_at,
        categories, audience, prompt_pack, prompt_pack_generator_version)
      VALUES (${account.organizationId}, ${BLUEGUM.brandName}, 'bluegumhome-s04b.com.au', 'tradies', 'au',
        ARRAY['NSW:Chatswood']::text[], 'Chatswood', 'NSW', 'Australia', '2067', 'fixed', now(), 'complete',
        ${sql.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
        now(), ARRAY['trades_plumbing']::text[], 'households', ${sql.json(pack)}, ${PROMPT_GENERATOR_VERSION})
      RETURNING id`;
    brandId = brand.id;
    await backfillQuestionSets(sql, account.organizationId);
    for (const key of ["question_library", "agency_questions", "visibility_reach"]) {
      await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled)
        VALUES (${account.organizationId}, ${key}, true)`;
    }
    // Three reaches on, and the set in them: the first 4 everyday questions Local, then 3 NSW, then 3 Australia.
    for (const [reach, target] of [
      ["local", 4],
      ["state", 3],
      ["country", 3],
    ] as const) {
      await sql`INSERT INTO brand_visibility_scopes (brand_id, organization_id, reach, enabled, place, target_count)
        VALUES (${brandId}, ${account.organizationId}, ${reach}, true, ${sql.json({})}, ${target})
        ON CONFLICT (brand_id, reach) DO UPDATE SET enabled = true, target_count = EXCLUDED.target_count`;
    }
    await sql`
      WITH ranked AS (
        SELECT i.set_id, i.question_id, row_number() OVER (ORDER BY i.position) AS n
        FROM brand_question_set_items i JOIN brand_question_sets s ON s.id = i.set_id AND s.is_current
        WHERE s.brand_id = ${brandId} AND i.kind = 'everyday'
      )
      UPDATE brand_question_set_items i
      SET reach = CASE WHEN r.n <= 4 THEN 'local' WHEN r.n <= 7 THEN 'state' ELSE 'country' END
      FROM ranked r WHERE r.set_id = i.set_id AND r.question_id = i.question_id`;
    await sql`
      UPDATE brand_questions q SET reach = i.reach FROM brand_question_set_items i
      JOIN brand_question_sets s ON s.id = i.set_id AND s.is_current
      WHERE s.brand_id = ${brandId} AND q.id = i.question_id`;
  } finally {
    await sql.end();
  }
});

test.afterAll(async () => {
  await removeSpecAccount(account);
});

test.describe("S04B part 4: reach views", () => {
  test.describe.configure({ mode: "serial", timeout: 300_000 });

  test("edit mode by reach: move a row to NSW, add one in Australia, apply", async ({ page }) => {
    await page.setViewportSize({ width: 1240, height: 900 });
    await page.goto(`/brands/${brandId}/questions?edit=1`);
    const edit = page.getByTestId("p02-edit");
    await expect(edit.getByTestId("p02-section-country")).toBeVisible({ timeout: 90_000 });
    const local = edit.getByTestId("p02-section-local");
    const nsw = edit.getByTestId("p02-section-state");
    const australia = edit.getByTestId("p02-section-country");
    await expect(local.getByTestId("p02-row")).toHaveCount(4);
    await expect(nsw.getByTestId("p02-row")).toHaveCount(3);
    await expect(australia.getByTestId("p02-row")).toHaveCount(3);

    // Move the first Local question to NSW.
    const moving =
      (await local.getByTestId("p02-row").first().locator("p").first().textContent()) ?? "";
    await local.getByTestId("p02-row").first().getByTestId("p02-row-more").click();
    await page.getByRole("menuitem", { name: "Move to another area" }).click();
    await page.getByRole("menuitem", { name: "NSW", exact: true }).click();
    await expect(nsw.getByTestId("p02-row").last()).toContainText(moving);
    const bar = page.getByTestId("p02-draft-bar");
    await expect(bar).toContainText("1 moved");

    // At 10 of 10: remove one NSW question, then add one in Australia from its own section.
    await nsw.getByTestId("p02-row").first().getByTestId("p02-row-more").click();
    await page.getByRole("menuitem", { name: "Remove from set" }).click();
    await australia.getByTestId("p02-add-question").click();
    const drawer = page.getByRole("dialog", { name: "Add a question" });
    await expect(
      drawer.getByTestId("p03-area").getByRole("radio", { name: "Australia" }),
    ).toBeChecked();
    await drawer.getByLabel("Question a customer would ask AI").fill(TYPED);
    const add = drawer.getByRole("button", { name: "Add to draft" });
    await expect(add).toBeEnabled({ timeout: 30_000 });
    await add.click();
    await expect(australia.getByTestId("p02-row").last()).toContainText(TYPED);
    await expect(bar).toContainText("+1 added");
    await expect(bar).toContainText("10 of 10 everyday");

    await both(page, "P02-edit-by-reach-1240", (path) => page.screenshot({ path, fullPage: true }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await both(page, "P02-edit-by-reach-390", (path) => page.screenshot({ path, fullPage: true }));
    await page.setViewportSize({ width: 1240, height: 900 });

    await bar.getByRole("button", { name: "Apply from the next audit" }).click();
    const modal = page.getByRole("dialog", { name: "Apply new questions from the next audit?" });
    await modal.getByRole("button", { name: "Apply from the next audit" }).click();
    await expect(page.getByTestId("p02-applied")).toContainText("Questions applied.", {
      timeout: 30_000,
    });

    const sql = postgres(e2eDatabaseUrl(), { max: 1 });
    try {
      const rows = await sql<{ reach: string; n: number }[]>`
        SELECT i.reach, count(*)::int AS n FROM brand_question_set_items i
        JOIN brand_question_sets s ON s.id = i.set_id AND s.is_current
        WHERE s.brand_id = ${brandId} AND i.kind = 'everyday' GROUP BY i.reach ORDER BY i.reach`;
      expect(rows.map((r) => [r.reach, r.n])).toEqual([
        ["country", 4],
        ["local", 3],
        ["state", 3],
      ]);
    } finally {
      await sql.end();
    }

    // LLD amendment 102: view mode's reach sections at 1240 and 390, light and dark (owed since S04).
    await page.goto(`/brands/${brandId}/questions`);
    await expect(page.getByTestId("p02-section-country")).toBeVisible({ timeout: 60_000 });
    await both(page, "P02-view-by-reach-1240", (path) => page.screenshot({ path, fullPage: true }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await both(page, "P02-view-by-reach-390", (path) => page.screenshot({ path, fullPage: true }));
  });

  test("the next audit: Responses by reach, and the filter's figures add up", async ({ page }) => {
    await page.setViewportSize({ width: 1240, height: 900 });
    const sql = postgres(e2eDatabaseUrl(), { max: 1 });
    try {
      const res = await page.request.post("/api/audits", { data: { brandId } });
      expect([200, 201, 202]).toContain(res.status());
      await expect
        .poll(
          async () =>
            (
              await sql<{ status: string }[]>`
                SELECT status FROM audits WHERE brand_id = ${brandId} ORDER BY audit_number DESC LIMIT 1`
            )[0]?.status,
          { timeout: 180_000, intervals: [2_000] },
        )
        .toMatch(/^(complete|partial)$/);
      const [audit] = await sql<{ id: string }[]>`
        SELECT id FROM audits WHERE brand_id = ${brandId} ORDER BY audit_number DESC LIMIT 1`;
      auditId = audit.id;
    } finally {
      await sql.end();
    }

    await page.goto(`/audits/${auditId}?tab=responses`);
    const sections = page.getByTestId("p07-responses");
    await expect(sections.first()).toBeVisible({ timeout: 90_000 });
    await expect(sections).toHaveCount(3);
    expect(
      await sections.evaluateAll((els) => els.map((e) => e.getAttribute("data-reach"))),
    ).toEqual(["local", "state", "country"]);
    await expect(sections.nth(0)).toContainText("3 questions");
    await expect(sections.nth(1)).toContainText("NSW");
    await expect(sections.nth(2)).toContainText("4 questions");
    await expect(page.getByText("Mentions your name, not counted")).toBeVisible();

    await page.goto(`/audits/${auditId}`);
    const filter = page.getByTestId("p07-reach-filter");
    await expect(filter).toBeVisible({ timeout: 90_000 });
    // "Mentioned in {m} of {n} answers · across Local, NSW and Australia" (P07.score).
    const headline = counts(
      await page.getByTestId("p07-score-reach").locator("xpath=..").textContent(),
    );
    const tileSum = [0, 0];
    for (const [value, reach] of [
      ["Local", "local"],
      ["NSW", "state"],
      ["Australia", "country"],
    ] as const) {
      const tile = counts(await page.getByTestId(`p07-reach-tile-${reach}`).textContent());
      tileSum[0] += tile[0];
      tileSum[1] += tile[1];
      await filter.getByText(value, { exact: value !== "Local" }).click();
      await expect(page).toHaveURL(new RegExp(`area=${reach}`), { timeout: 60_000 });
      await expect(filter.getByRole("radio", { checked: true })).toHaveValue(reach, {
        timeout: 60_000,
      });
      const engines = await page.locator('[id^="engine-"][id$="-counts"]').allTextContents();
      const sum = engines.map(counts).reduce(([a, b], [c, d]) => [a + c, b + d], [0, 0]);
      expect([reach, ...sum]).toEqual([reach, ...tile]);
      if (reach === "state") {
        // The filter and the row of cards it filters (the per-engine table, the competitor context).
        await filter.scrollIntoViewIfNeeded();
        const cards = page.getByText("Per-engine performance").locator("xpath=ancestor::div[2]");
        await both(page, "P07-reach-filter-1240", async (path) => {
          const f = await filter.boundingBox();
          const g = await cards.boundingBox();
          if (!f || !g) throw new Error("no filter or cards on the page");
          const x = Math.min(f.x, g.x);
          return page.screenshot({
            path,
            clip: { x, y: f.y - 8, width: g.x + g.width - x, height: g.y + g.height - f.y + 16 },
          });
        });
      }
    }
    expect(tileSum).toEqual(headline);

    await filter.getByText("All areas").click();
    await expect(page).not.toHaveURL(/area=/, { timeout: 60_000 });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await both(page, "P07-reach-filter-390", (path) => page.screenshot({ path, fullPage: true }));
  });
});
