/**
 * S02 part 4 (contract P02 view mode; LLD 8.2.2): the brand's Questions tab, read-only, question_library on for the
 * workspace. An invented business (tests/helpers/report-seeds.ts BLUEGUM's questions) with one finished audit and its
 * set version 1 made by prod-fix 0155's own backfill.
 * - The brand page's "Questions" tile opens /brands/:id/questions: the header line, the intro, "Everyday questions"
 *   with the last audit's count, rows with EngineDots (named, unconfirmed, not named, failed) and "Names your
 *   business" without dots.
 * - History opens by keyboard and Escape closes it, focus back on History; the row menu opens with its two actions.
 * - With question_library off: no tile, and the URL goes to the brand page.
 * Screenshots (P02) at 1240 and 390, light and dark, to .qa/screens/S02/.
 */
import postgres from "postgres";
import { backfillQuestionSets } from "@/tests/helpers/question-backfill";
import { BLUEGUM } from "@/tests/helpers/report-seeds";
import { expect, testSignedInAs } from "./helpers/auth";
import { e2eDatabaseUrl } from "./helpers/e2e-database";
import { createSpecAccount, removeSpecAccount, type SpecAccount } from "./helpers/spec-account";

const DIR = ".qa/screens/S02";
const ENGINES = ["chatgpt", "claude", "gemini", "perplexity"] as const;
let account: SpecAccount;
const test = testSignedInAs(() => account);
let brandId = "";

async function setFlag(on: boolean) {
  const sql = postgres(e2eDatabaseUrl(), { max: 1 });
  try {
    await sql`DELETE FROM org_feature_flags WHERE organization_id = ${account.organizationId} AND flag_key = 'question_library'`;
    await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled)
      VALUES (${account.organizationId}, 'question_library', ${on})`;
  } finally {
    await sql.end();
  }
}

test.beforeAll(async () => {
  account = await createSpecAccount({ key: "s02-p02-questions", plan: "agency" });
  const sql = postgres(e2eDatabaseUrl(), { max: 1 });
  try {
    const pack = [...BLUEGUM.everyday, ...BLUEGUM.branded];
    const [brand] = await sql<{ id: string }[]>`
      INSERT INTO brands (organization_id, name, domain, vertical, region, primary_regions, suburb, state, country,
        location_mode, location_confirmed_at, classification_status, category_confirmed_at, categories, prompt_pack)
      VALUES (${account.organizationId}, ${BLUEGUM.brandName}, 'bluegumhome-p02.com.au', 'tradies', 'au',
        ARRAY['NSW:Chatswood']::text[], 'Chatswood', 'NSW', 'Australia', 'fixed', now(), 'complete', now(),
        ARRAY['trades_plumbing']::text[], ${sql.json(pack)})
      RETURNING id`;
    brandId = brand.id;
    const [audit] = await sql<{ id: string }[]>`
      INSERT INTO audits (brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count,
        prompts_count, runs_per_prompt, total_calls, score_composite, started_at, completed_at)
      VALUES (${brandId}, ${account.organizationId}, 1, 'manual', 'complete', ${[...ENGINES]}::text[], 4,
        ${pack.length}, 1, ${pack.length * 4}, 0, now() - interval '5 minutes', now())
      RETURNING id`;
    for (const [i, prompt] of pack.entries()) {
      const branded = i >= BLUEGUM.everyday.length;
      for (const engine of ENGINES) {
        // Question 3 on Perplexity failed: a failure in place of an answer.
        if (i === 2 && engine === "perplexity") {
          await sql`INSERT INTO engine_call_failures (audit_id, organization_id, engine, prompt, prompt_index,
              error_class, attempts, latency_ms, is_branded_prompt)
            VALUES (${audit.id}, ${account.organizationId}, ${engine}, ${prompt}, ${i}, 'other', 1, 10, false)`;
          continue;
        }
        // Named on ChatGPT for questions 1 and 4, Claude for 2; Gemini's answer to question 1 names a "Bluegum" it
        // couldn't confirm as this business.
        const named =
          (engine === "chatgpt" && (i === 0 || i === 3)) || (engine === "claude" && i === 1);
        const unconfirmed = engine === "gemini" && i === 0;
        await sql`
          INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, is_branded_prompt,
            mention_verification, sentiment_label, context_label, response_text, response_snippet, cited_sources,
            llm_model, llm_cost_usd)
          VALUES (${audit.id}, ${engine}, ${prompt}, ${i}, 1, ${named || unconfirmed || branded}, ${branded},
            ${unconfirmed ? "unverified" : null}, 'neutral', ${named ? "recommended" : "absent"},
            'Here are some providers.', 'Here are some providers.', ${sql.json([])}, 'test-model', '0.001000')`;
      }
    }
    await backfillQuestionSets(sql, account.organizationId);
    // The audit asked exactly the stored pack, so its question-set hash is the set's (Part 1's parity test).
    await sql`UPDATE audits SET question_set_hash = (
        SELECT comparison_hash FROM brand_question_sets WHERE brand_id = ${brandId} AND is_current)
      WHERE id = ${audit.id}`;
  } finally {
    await sql.end();
  }
});

test.afterAll(async () => {
  await removeSpecAccount(account);
});

test.describe("S02 part 4: the Questions tab, view mode (P02)", () => {
  test("the tile opens the tab: header, sections, results per engine, history and the row menu", async ({
    page,
  }) => {
    await setFlag(true);
    await page.setViewportSize({ width: 1240, height: 900 });
    await page.goto(`/brands/${brandId}`);
    await page.getByRole("link", { name: /^Questions\b/ }).click();
    await expect(page).toHaveURL(new RegExp(`/brands/${brandId}/questions$`));
    // A cold dev server compiles the page and its route on first use.
    const header = page.getByTestId("p02-header");
    await expect(header).toBeVisible({ timeout: 30_000 });
    await expect(header).toContainText(
      "Version 1 · your original questions · 10 everyday + 3 that name your business · comparing since audit #1",
    );
    await expect(page.getByTestId("p02-intro")).toContainText(
      "Every audit asks these questions on ChatGPT, Claude, Gemini and Perplexity.",
    );
    const everyday = page.getByRole("region", { name: "Everyday questions" });
    await expect(everyday).toContainText("10 questions");
    // 3 named of 39 answers (Perplexity's call for question 3 failed); the unconfirmed one isn't counted.
    await expect(everyday).toContainText("Last audit: 3 of 39 answers named you");
    await expect(everyday.getByRole("listitem")).toHaveCount(10);
    await expect(everyday.getByRole("img").first()).toHaveAttribute(
      "aria-label",
      "Named you on ChatGPT; unconfirmed on Gemini; not on Claude and Perplexity",
    );
    await expect(everyday.getByRole("img").nth(2)).toHaveAttribute(
      "aria-label",
      "Not on ChatGPT, Claude and Gemini; failed on Perplexity",
    );
    const branded = page.getByRole("region", { name: "Names your business" });
    await expect(branded).toContainText("3 questions · not scored");
    await expect(branded.getByRole("img")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Suggestions" })).toContainText(
      "From your business type",
    );

    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      // The theme's colours ease in (120-160 ms transitions): wait them out before the screenshot.
      await page.waitForTimeout(800);
      await page.setViewportSize({ width: 1240, height: 900 });
      await page.screenshot({ path: `${DIR}/P02-1240-${theme}.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `${DIR}/P02-390-${theme}.png`, fullPage: true });
      // The app's <main> scrolls on its own (fullPage can't reach below it): the branded section and Suggestions.
      for (const [w, h] of [
        [1240, 900],
        [390, 844],
      ] as const) {
        await page.setViewportSize({ width: w, height: h });
        await page.getByRole("region", { name: "Suggestions" }).scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        await page.screenshot({ path: `${DIR}/P02-${w}-${theme}-lower.png` });
        await page.locator("[data-app-main]").evaluate((el) => el.scrollTo(0, 0));
      }
    }
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await page.setViewportSize({ width: 1240, height: 900 });

    const history = page.getByRole("button", { name: "History", exact: true });
    await history.focus();
    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog", { name: "Question history" });
    await expect(drawer).toContainText("Version 1");
    await expect(drawer).toContainText("10 everyday · used in audit #1");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${DIR}/P02-history-1240-light.png` });
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(history).toBeFocused();

    await page.getByRole("button", { name: `More actions for ${BLUEGUM.everyday[0]}` }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "Copy text" })).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "See answers in the last audit" }),
    ).toHaveAttribute("href", /\/audits\/[0-9a-f-]{36}\?tab=responses$/);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });

  test("question_library off: no tile, and the URL goes to the brand page", async ({ page }) => {
    await setFlag(false);
    await page.goto(`/brands/${brandId}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(BLUEGUM.brandName);
    await expect(page.getByRole("link", { name: /^Questions\b/ })).toHaveCount(0);
    await page.goto(`/brands/${brandId}/questions`);
    await expect(page).toHaveURL(new RegExp(`/brands/${brandId}$`));
  });
});
