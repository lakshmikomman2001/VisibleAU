/**
 * S01 part 11 (contract P01.abnField, P01.abn; LLD 8.8.6): brand settings' ABN field and the ABN suggestion, on a
 * brand with no ABN in Australia, abn_suggestion on for the workspace. The suggestion route is stubbed with the ABR
 * answer recorded in S01 part 1 (no live ABR call from a test).
 * - The field: read-only until Edit; a bad checksum says so under the field.
 * - The banner: "Is this your ABN?" with the ABR's line; Confirm (stubbed) puts the ABN in the field with "ABN saved.
 *   We'll check the register now."
 * Screenshots (P01) at 1240 and 390, light and dark, to .qa/screens/S01/.
 */
import postgres from "postgres";
import { expect, testSignedInAs } from "./helpers/auth";
import { e2eDatabaseUrl } from "./helpers/e2e-database";
import { createSpecAccount, removeSpecAccount, type SpecAccount } from "./helpers/spec-account";

const DIR = ".qa/screens/S01";
let account: SpecAccount;
const test = testSignedInAs(() => account);
let brandId = "";

const SUGGESTION = {
  abn: "17701710947",
  entity: "ASTORIO GROUP PTY LTD",
  businessName: "TechCore IT",
  postcode: "2765",
  state: "NSW",
  abnStatus: "Active",
  checkedAt: "2026-11-23T00:00:00.000Z",
};

test.beforeAll(async () => {
  account = await createSpecAccount({ key: "s01-p01-abn", plan: "agency" });
  const sql = postgres(e2eDatabaseUrl(), { max: 1 });
  try {
    const [brand] = await sql<{ id: string }[]>`
      INSERT INTO brands (organization_id, name, domain, vertical, region, primary_regions, suburb, state, country,
        postcode, location_mode, location_confirmed_at, classification_status, category_confirmed_at, categories)
      VALUES (${account.organizationId}, 'TechCore IT', 'techcore-p01.com.au', 'local_business', 'au',
        ARRAY['NSW:Riverstone']::text[], 'Riverstone', 'NSW', 'Australia', '2765', 'fixed', now(), 'complete', now(),
        ARRAY['trades_general']::text[])
      RETURNING id`;
    brandId = brand.id;
    await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled)
      VALUES (${account.organizationId}, 'abn_suggestion', true)`;
  } finally {
    await sql.end();
  }
});

test.afterAll(async () => {
  await removeSpecAccount(account);
});

test.describe("S01 part 11: the ABN field and the ABN suggestion", () => {
  test("the banner offers the ABR's match; Confirm puts it in the field", async ({ page }) => {
    await page.route(`**/api/brands/${brandId}/abn-suggestion`, (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ abn: SUGGESTION.abn }) })
        : route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ suggestion: SUGGESTION }),
          }),
    );
    await page.goto(`/brands/${brandId}`);
    const banner = page.getByTestId("p01-abn");
    await expect(banner).toContainText("Is this your ABN?");
    await expect(page.getByTestId("p01-abn-line")).toHaveText(
      "17 701 710 947 · ASTORIO GROUP PTY LTD · NSW 2765 · Active",
    );
    await expect(page.getByLabel("ABN", { exact: true })).toBeDisabled();
    await banner.scrollIntoViewIfNeeded();
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      // The theme's colours ease in (120-160 ms transitions): wait them out before the screenshot.
      await page.waitForTimeout(800);
      for (const [w, h] of [
        [1240, 900],
        [390, 844],
      ] as const) {
        await page.setViewportSize({ width: w, height: h });
        await banner.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${DIR}/P01-abn-${w}-${theme}.png` });
      }
    }
    await page.setViewportSize({ width: 1240, height: 900 });
    await banner.getByRole("button", { name: "Confirm" }).click();
    await expect(banner).toHaveCount(0);
    await expect(page.getByLabel("ABN", { exact: true })).toHaveValue("17 701 710 947");
    await expect(page.getByText("ABN saved. We'll check the register now.")).toBeVisible();
  });

  test("a bad checksum says so under the field", async ({ page }) => {
    await page.route(`**/api/brands/${brandId}/abn-suggestion`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"suggestion":null}' }),
    );
    await page.goto(`/brands/${brandId}`);
    await page.getByRole("button", { name: "Edit" }).click();
    const field = page.getByLabel("ABN", { exact: true });
    await field.fill("17 701 710 948");
    await field.blur();
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("This isn't a valid ABN. Check the digits.")).toBeVisible();
  });
});
