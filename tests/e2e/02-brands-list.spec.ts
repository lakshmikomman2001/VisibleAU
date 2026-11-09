/**
 * tests/e2e/02-brands-list.spec.ts
 *
 * Frontend E2E: /brands — brand list page
 *
 * Sprint 1 §11 coverage:
 *   ✓ User can navigate to /brands via sidebar
 *   ✓ Empty state shown when no brands exist
 *   ✓ Brand cards appear after a brand is created
 *   ✓ "New brand" opens the new-brand wizard
 *
 * Test data lifecycle:
 *   - beforeAll: the spec's own account and workspace (helpers/spec-account.ts)
 *   - afterAll:  the account, the workspace and every brand in it
 */

import { expect, testSignedInAs } from "./helpers/auth";
import { deleteAllBrandsForOrg } from "./helpers/db";
import { createSpecAccount, removeSpecAccount, type SpecAccount } from "./helpers/spec-account";

// Its own account and workspace (tests/e2e/helpers/spec-account.ts), on an Agency plan so the
// brands it makes through the API stay under the plan's limit.
let account: SpecAccount;
const test = testSignedInAs(() => account);
let orgId = "";

test.beforeAll(async () => {
  account = await createSpecAccount({ key: "root-02-brands-list", plan: "agency" });
  orgId = account.organizationId;
});

test.afterAll(async () => {
  await removeSpecAccount(account);
});

test.describe("Brand list page (/brands)", () => {
  test.beforeEach(async () => {
    // Start each test clean: delete all brands for org
    if (orgId) await deleteAllBrandsForOrg(orgId); // C14 FIX: guard against uninitialised orgId
  });

  test("navigating to /brands shows the brand list page", async ({ page }) => {
    await page.goto("/brands");
    await expect(page).toHaveURL(/\/brands$/);
    // Page heading or nav indicator
    // S8: the page's heading; an .or() with "any text that says brands" matched the nav link too.
    await expect(page.getByRole("heading", { name: "Brands", level: 1 })).toBeVisible();
  });

  test('sidebar "Brands" link navigates to /brands', async ({ page }) => {
    await page.goto("/dashboard");

    const brandsLink = page.getByRole("link", { name: /brands/i }).first();
    await brandsLink.click();

    await expect(page).toHaveURL(/\/brands/);
  });

  test("empty state is shown when org has no brands", async ({ page }) => {
    await page.goto("/brands");

    // The page's empty state. The loose list this replaced checked each pattern with isVisible(),
    // which doesn't wait and throws on two matches (swallowed): it never found anything.
    await expect(
      page.getByText("No brands yet. Create your first brand to get started."),
      "Expected the empty state when no brands exist",
    ).toBeVisible();
  });

  // Since c21fa36 (6 Nov) the one control is "New brand", and it opens the wizard.
  test('"New brand" is visible and opens the new-brand wizard', async ({ page }) => {
    await page.goto("/brands");

    const newBrand = page.locator("[data-app-main]").getByRole("link", { name: "New brand" });

    await expect(newBrand).toBeVisible();
    await newBrand.click();

    await expect(page).toHaveURL(/\/brands\/wizard/);
  });

  test("brand card appears in list after a brand exists", async ({ page }) => {
    // Seed a brand directly so it appears without going through the create form
    await page.request.post("/api/brands", {
      data: {
        name: "E2E List Brand",
        domain: "e2elistbrand.com.au",
        vertical: "tradies",
      },
      headers: {
        "Content-Type": "application/json",
      },
    });
    // Note: auth is via the browser session from the fixture; the request above
    // goes through the same browser context so it carries the __session cookie

    await page.goto("/brands");

    // The brand's row (its name is on the brand switcher too).
    await expect(page.getByRole("link", { name: /E2E List Brand/ })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("e2elistbrand.com.au")).toBeVisible();
  });

  test("brand card shows the vertical label", async ({ page }) => {
    await page.request.post("/api/brands", {
      data: { name: "E2E Vertical Brand", domain: "vertical.com.au", vertical: "allied_health" },
      headers: { "Content-Type": "application/json" },
    });

    await page.goto("/brands");

    // "Allied Health" or "allied_health" should appear in the card
    const verticalLabel = page.getByText(/allied health/i).or(page.getByText("allied_health"));
    await expect(verticalLabel).toBeVisible({ timeout: 10_000 });
  });

  test("clicking a brand card navigates to /brands/[brandId]", async ({ page }) => {
    const res = await page.request.post("/api/brands", {
      data: { name: "E2E Clickable Brand", domain: "clickable.com.au", vertical: "saas" },
      headers: { "Content-Type": "application/json" },
    });
    const { brand } = await res.json();

    await page.goto("/brands");

    const card = page.getByText("E2E Clickable Brand").first();
    await card.click();

    // Should navigate to the detail page for this brand
    await expect(page).toHaveURL(new RegExp(`/brands/${brand.id}`), { timeout: 10_000 });
  });
});
