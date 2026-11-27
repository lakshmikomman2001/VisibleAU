/**
 * S03 part 7 (LLD 8.3.6, client request C4; contract P10 step 3), with parts 5 and 6's screens (P05, P07.mix/split):
 * - A new brand on Agency: "Confirm your business details" -> Next: questions -> the questions its first audit will
 *   ask; swap one for a suggestion, remove one to make room, add the agency's own through P03's drawer; "Confirm and
 *   start the first audit" opens the audit. That audit asks exactly the set shown (version 1, the agency's question
 *   among them), and the agency's question is labelled "Written by ..." in the brand's Questions tab; the audit page
 *   shows the mix line and the split under the headline.
 * - Workspace -> Questions lists the brand.
 * - A new brand on Starter: the step offers Swap, never "Add your own question".
 * Screens at 1240 (light and dark) and 390: .qa/screens/S03/P10-*, P07-*, P05-*.
 */
import postgres from "postgres";
import { expect, testSignedInAs } from "./helpers/auth";
import { e2eDatabaseUrl } from "./helpers/e2e-database";
import { createSpecAccount, removeSpecAccount, type SpecAccount } from "./helpers/spec-account";

const DIR = ".qa/screens/S03";
const TYPED = "Who fixes burst pipes in Chatswood quickly?";
let agency: SpecAccount;
let starter: SpecAccount;
const test = testSignedInAs(() => agency);
const starterTest = testSignedInAs(() => starter);
const brandIds: Record<"agency" | "starter", string> = { agency: "", starter: "" };

async function shoot(page: import("@playwright/test").Page, name: string) {
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${DIR}/${name}-${theme}.png`, fullPage: true });
  }
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
}

/** A brand just added in the wizard: its place confirmed, its type still to confirm, no audit, no questions. */
async function newBrand(sql: postgres.Sql, account: SpecAccount, name: string, domain: string) {
  const [brand] = await sql<{ id: string }[]>`
    INSERT INTO brands (organization_id, name, domain, vertical, region, primary_regions, suburb, state, country,
      location_mode, location_confirmed_at, classification_status)
    VALUES (${account.organizationId}, ${name}, ${domain}, 'tradies', 'au', ARRAY['NSW:Chatswood']::text[],
      'Chatswood', 'NSW', 'Australia', 'fixed', now(), 'needs_confirmation')
    RETURNING id`;
  for (const key of ["question_library", "agency_questions"]) {
    await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled)
      VALUES (${account.organizationId}, ${key}, true)`;
  }
  return brand.id;
}

/** Plumbing and Electrical (one type has at most 10 everyday questions; the second gives the spares), Households. */
async function openQuestionsStep(page: import("@playwright/test").Page, brandId: string) {
  await page.goto(`/brands/${brandId}`);
  const card = page
    .locator("#confirm-business-details > div")
    .filter({ hasText: "Confirm your business details" });
  await card.getByRole("button", { name: "Plumbing", exact: true }).click();
  await card.getByRole("button", { name: "Electrical", exact: true }).click();
  await card.getByRole("button", { name: "Households", exact: true }).click();
  await card.getByRole("button", { name: "Next: questions" }).click();
  const step = page.getByTestId("p10-step3");
  await expect(step).toBeVisible({ timeout: 30_000 });
  return step;
}

test.beforeAll(async () => {
  agency = await createSpecAccount({ key: "s03-p10-agency", plan: "agency" });
  starter = await createSpecAccount({ key: "s03-p10-starter", plan: "starter" });
  const sql = postgres(e2eDatabaseUrl(), { max: 1 });
  try {
    brandIds.agency = await newBrand(sql, agency, "Wattlebird Plumbing", "wattlebird-s03.com.au");
    brandIds.starter = await newBrand(sql, starter, "Kookaburra Plumbing", "kookaburra-s03.com.au");
  } finally {
    await sql.end();
  }
});

test.afterAll(async () => {
  await removeSpecAccount(agency);
  await removeSpecAccount(starter);
});

test.describe("S03 part 7: the Questions step on a new brand's confirm screen", () => {
  test("Agency: swap, make room, add their own, confirm; the first audit asks exactly that, labelled", async ({
    page,
  }) => {
    test.setTimeout(420_000);
    await page.setViewportSize({ width: 1240, height: 900 });
    const brandId = brandIds.agency;
    const step = await openQuestionsStep(page, brandId);
    await expect(page.getByTestId("p10-steps").getByText("2 · Questions")).toHaveAttribute(
      "aria-current",
      "step",
    );
    await expect(step.getByText("Local · Chatswood")).toBeVisible();
    await expect(step.getByTestId("p10-count")).toHaveText("10 of 10 everyday");
    await expect(step.getByTestId("p10-add")).toBeDisabled();

    // Swap the first everyday question for a suggestion; remove the last to make room.
    const firstSwap = step.getByRole("button", { name: /^Swap / }).first();
    const swappedOut = ((await firstSwap.getAttribute("aria-label")) ?? "").replace(
      /^Swap “|”$/g,
      "",
    );
    await firstSwap.click();
    const menu = page.getByTestId("p10-swap-menu");
    const spare = (await menu.getByRole("button").first().textContent()) ?? "";
    await menu.getByRole("button").first().click();
    await expect(step.getByText(spare, { exact: true })).toBeVisible();
    await expect(step.getByText(swappedOut, { exact: true })).toHaveCount(0);
    await step
      .getByRole("button", { name: /^Remove / })
      .last()
      .click();
    await expect(step.getByTestId("p10-count")).toHaveText("9 of 10 everyday");

    // Their own question, through P03's drawer and checks.
    await step.getByTestId("p10-add").click();
    const drawer = page.getByRole("dialog", { name: "Add a question" });
    await drawer.getByLabel("Question a customer would ask AI").fill(TYPED);
    const add = drawer.getByRole("button", { name: "Add to draft" });
    await expect(add).toBeEnabled({ timeout: 15_000 });
    await add.click();
    const typedRow = step.getByTestId("p02-row").filter({ hasText: TYPED });
    await expect(typedRow).toContainText("Written by");
    await expect(step.getByTestId("p10-count")).toHaveText("10 of 10 everyday");
    await shoot(page, "P10-1240");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/P10-390-light.png`, fullPage: true });
    await page.setViewportSize({ width: 1240, height: 900 });

    // What the step shows, in order: each row's question.
    const rows = await step
      .getByTestId("p02-row")
      .evaluateAll((els) => els.map((el) => el.querySelector("p")?.textContent ?? ""));
    expect(rows).toContain(TYPED);
    expect(rows).not.toContain(swappedOut);

    await step.getByRole("button", { name: "Confirm and start the first audit" }).click();
    await expect(page).toHaveURL(/\/audits\/[0-9a-f-]{36}/, { timeout: 60_000 });
    const auditId = page.url().match(/\/audits\/([0-9a-f-]{36})/)?.[1] ?? "";

    const sql = postgres(e2eDatabaseUrl(), { max: 1 });
    try {
      await expect
        .poll(
          async () =>
            (await sql<{ status: string }[]>`SELECT status FROM audits WHERE id = ${auditId}`)[0]
              ?.status,
          { timeout: 240_000, intervals: [2_000] },
        )
        .toMatch(/^(complete|partial)$/);
      const [set] = await sql<{ id: string; version: number }[]>`
        SELECT s.id, s.version FROM audits a JOIN brand_question_sets s ON s.id = a.question_set_id
        WHERE a.id = ${auditId}`;
      expect(set.version).toBe(1);
      const items = await sql<{ text: string; source: string }[]>`
        SELECT q.text, i.source FROM brand_question_set_items i JOIN brand_questions q ON q.id = i.question_id
        WHERE i.set_id = ${set.id} ORDER BY i.position`;
      // Exactly the list shown, in order: the swapped-in suggestion, the agency's question, no removed one.
      expect(items.map((i) => i.text)).toEqual(rows);
      expect(items.find((i) => i.text === TYPED)?.source).toBe("agency");
      expect(items.find((i) => i.text === spare)?.source).toBe("template");
      const asked = await sql<{ prompt: string }[]>`
        SELECT DISTINCT prompt FROM citations WHERE audit_id = ${auditId}
        UNION SELECT DISTINCT prompt FROM engine_call_failures WHERE audit_id = ${auditId}`;
      expect(asked.map((r) => r.prompt).sort()).toEqual([...rows].sort());
    } finally {
      await sql.end();
    }

    // The audit page: the mix line and the split under the headline (both kinds were asked).
    await page.goto(`/audits/${auditId}`);
    await expect(page.getByTestId("p07-mix")).toContainText("9 AI-suggested, 1 written by");
    await expect(page.getByTestId("p07-split")).toContainText("AI-suggested questions:");
    await shoot(page, "P07-1240");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/P07-390-light.png`, fullPage: true });
    await page.setViewportSize({ width: 1240, height: 900 });

    // The Questions tab labels the agency's question.
    await page.goto(`/brands/${brandId}/questions`);
    await expect(page.getByTestId("p02-row").filter({ hasText: TYPED })).toContainText(
      "Written by",
      {
        timeout: 30_000,
      },
    );

    // Workspace -> Questions (P05) lists the brand.
    await page.goto("/settings/questions");
    const row = page.getByTestId("p05-brand-row").filter({ hasText: "Wattlebird Plumbing" });
    await expect(row).toContainText("10 / 10", { timeout: 30_000 });
    await shoot(page, "P05-1240");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/P05-390-light.png`, fullPage: true });
  });
});

test.describe("S03 part 7: Starter", () => {
  starterTest("Starter: Swap, never Add your own question", async ({ page }) => {
    await page.setViewportSize({ width: 1240, height: 900 });
    const step = await openQuestionsStep(page, brandIds.starter);
    await expect(step.getByRole("button", { name: /^Swap / }).first()).toBeVisible();
    await expect(step.getByTestId("p10-add")).toHaveCount(0);
    await expect(step.getByText("Add your own question")).toHaveCount(0);
  });
});
