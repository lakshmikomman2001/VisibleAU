/**
 * S03 part 4 (LLD 8.3.1; contract P02 edit mode, P03, P04): edit a brand's questions in the browser, apply them, and
 * the next audit asks the new set -- run by the inline runner (in this environment Inngest's dev server isn't running,
 * so POST /api/audits runs the audit inline with the mock model).
 * Screenshots (P02 edit mode, P03, P04) at 1240 and 390, light and dark, to .qa/screens/S03/.
 */
import postgres from "postgres";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { backfillQuestionSets } from "@/tests/helpers/question-backfill";
import { BLUEGUM } from "@/tests/helpers/report-seeds";
import { expect, testSignedInAs } from "./helpers/auth";
import { e2eDatabaseUrl } from "./helpers/e2e-database";
import { createSpecAccount, removeSpecAccount, type SpecAccount } from "./helpers/spec-account";

const DIR = ".qa/screens/S03";
const NEW_QUESTION = "Who fixes burst pipes in Chatswood quickly?";
let account: SpecAccount;
const test = testSignedInAs(() => account);
let brandId = "";

async function shoot(page: import("@playwright/test").Page, name: string) {
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${DIR}/${name}-${theme}.png` });
  }
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
}

test.beforeAll(async () => {
  account = await createSpecAccount({ key: "s03-p02-edit", plan: "agency" });
  const sql = postgres(e2eDatabaseUrl(), { max: 1 });
  try {
    const pack = [...BLUEGUM.everyday, ...BLUEGUM.branded];
    const [brand] = await sql<{ id: string }[]>`
      INSERT INTO brands (organization_id, name, domain, vertical, region, primary_regions, suburb, state, country,
        location_mode, location_confirmed_at, classification_status, classification, category_confirmed_at, categories,
        audience, prompt_pack, prompt_pack_generator_version)
      VALUES (${account.organizationId}, ${BLUEGUM.brandName}, 'bluegumhome-s03.com.au', 'tradies', 'au',
        ARRAY['NSW:Chatswood']::text[], 'Chatswood', 'NSW', 'Australia', 'fixed', now(), 'complete',
        ${sql.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
        now(), ARRAY['trades_plumbing']::text[], 'households', ${sql.json(pack)}, ${PROMPT_GENERATOR_VERSION})
      RETURNING id`;
    brandId = brand.id;
    await backfillQuestionSets(sql, account.organizationId);
    for (const key of ["question_library", "agency_questions"]) {
      await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled)
        VALUES (${account.organizationId}, ${key}, true)`;
    }
  } finally {
    await sql.end();
  }
});

test.afterAll(async () => {
  await removeSpecAccount(account);
});

test.describe("S03 part 4: edit, apply, and the next audit asks the new set", () => {
  test("edit mode by keyboard and menu, add through the drawer, apply; the next audit asks version 2", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1240, height: 900 });
    await page.goto(`/brands/${brandId}/questions`);
    await page.getByTestId("p02-header-edit").click({ timeout: 30_000 });
    await expect(page).toHaveURL(/\?edit=1$/);
    const bar = page.getByTestId("p02-draft-bar");
    await expect(bar).toContainText("No changes yet");
    await expect(bar).toContainText("10 of 10 everyday");

    // Keyboard: Alt+↓ on the first handle moves it.
    const first = BLUEGUM.everyday[0];
    await page.getByRole("button", { name: `Reorder: ${first}` }).focus();
    await page.keyboard.press("Alt+ArrowDown");
    await expect(page.getByTestId("p02-live")).toHaveText("Moved to position 2 of 10");
    await expect(bar).toContainText("moved");

    // The menu removes one, so there's room for a new one.
    await page.getByRole("button", { name: `More actions for ${BLUEGUM.everyday[9]}` }).click();
    await page.getByRole("menuitem", { name: "Remove from set" }).click();
    await expect(bar).toContainText("−1 removed");
    await shoot(page, "P02-edit-1240");

    await page.getByTestId("p02-add-question").click();
    const drawer = page.getByRole("dialog", { name: "Add a question" });
    await drawer.getByLabel("Question a customer would ask AI").fill(NEW_QUESTION);
    const add = drawer.getByRole("button", { name: "Add to draft" });
    await expect(add).toBeEnabled({ timeout: 30_000 });
    await expect(drawer.getByTestId("p03-label")).toContainText("Written by");
    await shoot(page, "P03-1240");
    await add.click();
    await expect(bar).toContainText("+1 added");

    await bar.getByRole("button", { name: "Apply from the next audit" }).click();
    const modal = page.getByRole("dialog", { name: "Apply new questions from the next audit?" });
    await expect(modal.getByTestId("p04-changes")).toContainText(NEW_QUESTION);
    await expect(modal.getByTestId("p04-notice")).toContainText("This starts a new comparison.");
    await expect(modal.getByRole("button", { name: "Cancel" })).toBeFocused();
    await shoot(page, "P04-1240");
    await modal.getByRole("button", { name: "Apply from the next audit" }).click();
    await expect(page.getByTestId("p02-applied")).toHaveText(
      "Questions applied. The next audit will use version 2.",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("p02-header")).toContainText("Version 2");

    // The next audit asks version 2, the agency's question among them.
    const sql = postgres(e2eDatabaseUrl(), { max: 1 });
    try {
      const [set] = await sql<{ id: string }[]>`
        SELECT id FROM brand_question_sets WHERE brand_id = ${brandId} AND is_current AND version = 2`;
      expect(set).toBeTruthy();
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
      const [audit] = await sql<{ id: string; question_set_id: string }[]>`
        SELECT id, question_set_id FROM audits WHERE brand_id = ${brandId} ORDER BY audit_number DESC LIMIT 1`;
      expect(audit.question_set_id).toBe(set.id);
      const asked = await sql<{ prompt: string }[]>`
        SELECT DISTINCT prompt FROM citations WHERE audit_id = ${audit.id}
        UNION SELECT DISTINCT prompt FROM engine_call_failures WHERE audit_id = ${audit.id}`;
      expect(asked.map((r) => r.prompt)).toContain(NEW_QUESTION);
      expect(asked.map((r) => r.prompt)).not.toContain(BLUEGUM.everyday[9]);
    } finally {
      await sql.end();
    }
  });

  test("at 390: the draft bar fixed to the bottom, the drawer a full-screen sheet", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/brands/${brandId}/questions?edit=1`);
    const bar = page.getByTestId("p02-draft-bar");
    await expect(bar).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /^Reorder:/ }).first()).toBeHidden();
    await shoot(page, "P02-edit-390");
    await page.getByTestId("p02-add-question").click();
    const drawer = page.getByRole("dialog", { name: "Add a question" });
    await expect(drawer).toBeVisible();
    const box = await drawer.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(389);
    await shoot(page, "P03-390");
    await drawer.getByRole("button", { name: "Close" }).click();
  });
});
