/**
 * S04 part 6 (LLD 8.4.1, 8.4.7; contract P01.reach, P02 -> P04): a test brand turns on NSW and Australia in brand
 * settings, saves, and applies the draft in the Questions tab's edit mode; the new set holds 4 Local, 3 NSW and 3
 * Australia everyday questions. Local can't be switched off by mouse or keyboard. Nothing changes for audits until the
 * draft is applied (the set is still version 1 after Save).
 * Screenshots (P01 at 1240 light and dark, and 390) to .qa/screens/S04/.
 */
import postgres from "postgres";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { backfillQuestionSets } from "@/tests/helpers/question-backfill";
import { BLUEGUM } from "@/tests/helpers/report-seeds";
import { expect, testSignedInAs } from "./helpers/auth";
import { e2eDatabaseUrl } from "./helpers/e2e-database";
import { createSpecAccount, removeSpecAccount, type SpecAccount } from "./helpers/spec-account";

const DIR = ".qa/screens/S04";
let account: SpecAccount;
const test = testSignedInAs(() => account);
let brandId = "";

/** The card at 1240 (the element); the whole page at 390, where the shell's sticky header would cover the element. */
async function shoot(page: import("@playwright/test").Page, name: string, fullPage = false) {
  const decline = page.getByRole("button", { name: "Decline" });
  if (await decline.isVisible().catch(() => false)) await decline.click();
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.waitForTimeout(800);
    const path = `${DIR}/${name}-${theme}.png`;
    if (fullPage) await page.screenshot({ path, fullPage: true });
    else await page.getByTestId("p01-reach").screenshot({ path });
  }
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
}

async function setVersion(): Promise<number> {
  const sql = postgres(e2eDatabaseUrl(), { max: 1 });
  try {
    const [set] = await sql<{ version: number }[]>`
      SELECT version FROM brand_question_sets WHERE brand_id = ${brandId} AND is_current`;
    return set.version;
  } finally {
    await sql.end();
  }
}

test.beforeAll(async () => {
  account = await createSpecAccount({ key: "s04-p01-reach", plan: "agency" });
  const sql = postgres(e2eDatabaseUrl(), { max: 1 });
  try {
    const pack = [...BLUEGUM.everyday, ...BLUEGUM.branded];
    const [brand] = await sql<{ id: string }[]>`
      INSERT INTO brands (organization_id, name, domain, vertical, region, primary_regions, suburb, state, country,
        postcode, location_mode, location_confirmed_at, classification_status, classification, category_confirmed_at,
        categories, audience, prompt_pack, prompt_pack_generator_version)
      VALUES (${account.organizationId}, ${BLUEGUM.brandName}, 'bluegumhome-s04.com.au', 'tradies', 'au',
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
  } finally {
    await sql.end();
  }
});

test.afterAll(async () => {
  await removeSpecAccount(account);
});

test.describe("S04 part 6: reach settings through to apply", () => {
  test.describe.configure({ timeout: 240_000 });

  test("turn on NSW and Australia, save, apply: the set holds 4 Local, 3 NSW, 3 Australia", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1240, height: 900 });
    await page.goto(`/brands/${brandId}`);
    const card = page.getByTestId("p01-reach");
    await expect(
      card.getByRole("heading", { name: "Where do you want to be visible?" }),
    ).toBeVisible({
      timeout: 60_000,
    });
    await expect(card).toContainText("Local is always on. Add NSW, Australia or worldwide");
    await expect(card.getByTestId("p01-reach-plan")).toHaveText("Agency: up to 4 areas");
    await expect(card.getByTestId("p01-reach-total")).toContainText("10 of 10");

    // Local stays on: by mouse and by keyboard.
    const local = card.getByRole("switch", { name: "Local, always on" });
    await local.click({ force: true });
    await local.focus();
    await page.keyboard.press("Space");
    await expect(local).toHaveAttribute("aria-checked", "true");

    await card.getByRole("switch", { name: "State" }).click();
    await card.getByRole("switch", { name: "Country" }).click();
    for (const [reach, n] of [
      ["local", "4"],
      ["state", "3"],
      ["country", "3"],
    ] as const) {
      await expect(
        card.getByTestId(`p01-reach-row-${reach}`).getByRole("spinbutton"),
      ).toHaveAttribute("aria-valuenow", n);
    }
    await expect(card.getByRole("img", { name: "Local 4, NSW 3, Australia 3" })).toBeVisible();
    await expect(card.getByRole("button", { name: "More NSW questions" })).toBeDisabled();
    await shoot(page, "P01-1240");

    await card.getByTestId("p01-reach-save").click();
    await expect(page).toHaveURL(new RegExp(`/brands/${brandId}/questions\\?edit=1$`), {
      timeout: 60_000,
    });
    expect(await setVersion()).toBe(1);
    const bar = page.getByTestId("p02-draft-bar");
    await expect(bar).toContainText("10 of 10 everyday", { timeout: 30_000 });
    await expect(bar).toContainText("+6 added");
    await expect(bar).toContainText("−6 removed");

    await bar.getByRole("button", { name: "Apply from the next audit" }).click();
    const modal = page.getByRole("dialog", { name: "Apply new questions from the next audit?" });
    await modal.getByRole("button", { name: "Apply from the next audit" }).click();
    await expect(page.getByTestId("p02-applied")).toHaveText(
      "Questions applied. The next audit will use version 2.",
      { timeout: 30_000 },
    );

    const sql = postgres(e2eDatabaseUrl(), { max: 1 });
    try {
      const rows = await sql<{ reach: string; n: number }[]>`
        SELECT i.reach, count(*)::int AS n FROM brand_question_set_items i
        JOIN brand_question_sets s ON s.id = i.set_id AND s.is_current
        WHERE s.brand_id = ${brandId} AND i.kind = 'everyday' GROUP BY i.reach ORDER BY i.reach`;
      expect(rows.map((r) => [r.reach, r.n])).toEqual([
        ["country", 3],
        ["local", 4],
        ["state", 3],
      ]);
    } finally {
      await sql.end();
    }

    // Back on brand settings, the card reads the saved reaches.
    await page.goto(`/brands/${brandId}`);
    await expect(page.getByTestId("p01-reach-row-state").getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "true",
      { timeout: 60_000 },
    );
  });

  test("at 390: the stepper under the chips, Save and Cancel full width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/brands/${brandId}`);
    const card = page.getByTestId("p01-reach");
    await expect(card.getByTestId("p01-reach-list")).toBeVisible({ timeout: 60_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const save = card.getByTestId("p01-reach-save");
    const cancel = card.getByTestId("p01-reach-cancel");
    const [s, c] = [await save.boundingBox(), await cancel.boundingBox()];
    expect(s && c && s.y < c.y).toBe(true);
    expect(s && c && Math.abs(s.width - c.width) < 2).toBe(true);
    await shoot(page, "P01-390", true);
  });
});
