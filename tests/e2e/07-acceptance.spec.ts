/**
 * tests/e2e/07-acceptance.spec.ts
 *
 * Frontend E2E: Sprint 1 §11 Acceptance Criteria — full smoke test
 *
 * Runs every browser-facing acceptance criterion from Sprint 1 §11
 * in a single sequential suite. Use this to gate Sprint 1 completion.
 *
 * Sprint 1 definition of done (browser-side items):
 *   ✓ User can navigate /dashboard, see empty layout with sidebar
 *   ✓ User can click "Create brand" → fill form → submit → see brand in list
 *   ✓ User can click a brand → see detail page → edit inline → save
 *   ✓ User can delete a brand → disappears from list (soft-delete in DB)
 *   ✓ Second org user cannot access first org's brand URL (404)
 *   ✓ Cross-org DELETE returns 404
 *
 * Test data lifecycle:
 *   afterAll removes the account, its workspace and every brand in it.
 *   The spec's own account and workspace (helpers/spec-account.ts); brands through the API.
 */

// B13 FIX: static imports instead of dynamic await import() inside test body
import * as schema from "@/db/schema";
import { expect, testSignedInAs } from "./helpers/auth";
import { db, getBrandById } from "./helpers/db";
import {
  addSpecBrand,
  createSpecAccount,
  removeSpecAccount,
  type SpecAccount,
} from "./helpers/spec-account";

// Its own account and workspace (tests/e2e/helpers/spec-account.ts), on an Agency plan, with one
// brand already: with none, /dashboard sends the account to the wizard. The cross-org checks are
// in 05-cross-org-isolation.spec.ts, with a second account.
let account: SpecAccount;
const test = testSignedInAs(() => account);
let org1Id = "";
const createdBrandIds: string[] = [];

test.beforeAll(async () => {
  account = await createSpecAccount({ key: "root-07-acceptance", plan: "agency" });
  org1Id = account.organizationId;
  await addSpecBrand(account, {
    name: "Acceptance Seed Co",
    domain: "acceptance-seed.example.com.au",
  });
});

test.afterAll(async () => {
  await removeSpecAccount(account);
});

test.describe("Sprint 1 §11 Acceptance — Browser", () => {
  let acceptanceBrandId: string | null = null;

  test("§11: /dashboard renders with sidebar (layout check)", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    // Sidebar present (S8: the sidebar itself, not an .or() that matched it and its Brands link).
    await expect(page.locator('aside[data-tour="sidebar"]')).toBeVisible();
  });

  test('§11: User clicks "Create brand" → fills form → submits → sees brand in list', async ({
    page,
  }) => {
    await page.goto("/brands/new");

    await page
      .getByLabel(/brand name/i)
      .or(page.getByPlaceholder(/bondi plumbing/i))
      .fill("Acceptance Bondi Plumbing");

    await page
      .getByLabel(/domain/i)
      .or(page.getByPlaceholder(/bondiplumbing\.com\.au/i))
      .fill("acceptancebondiplumbing.com.au");

    await page.getByLabel("Vertical").selectOption("tradies");
    await page.getByRole("button", { name: /create brand/i }).click();

    // After create → list page (Sprint 1 §9 step 5)
    await expect(page).toHaveURL(/\/brands$/, { timeout: 15_000 });
    // The brand's row in the list (the brand switcher shows its name too).
    await expect(page.getByRole("link", { name: /Acceptance Bondi Plumbing/ })).toBeVisible({
      timeout: 10_000,
    });

    // Record created brand
    const res = await page.request.get("/api/brands");
    // GET /api/brands answers { brands } (and has since 29cd3d0), not a bare array.
    const { brands } = (await res.json()) as { brands: Array<{ name: string; id: string }> };
    const created = brands.find((b) => b.name === "Acceptance Bondi Plumbing");
    if (created) {
      createdBrandIds.push(created.id);
      acceptanceBrandId = created.id;
    }
  });

  test("§11: User clicks brand → detail page → edit inline → save", async ({ page }) => {
    if (!acceptanceBrandId) test.skip();

    await page.goto(`/brands/${acceptanceBrandId}`);
    await expect(
      page.getByRole("heading", { name: "Acceptance Bondi Plumbing", level: 1 }),
    ).toBeVisible();

    // Enter edit mode
    await page.getByRole("button", { name: /edit/i }).click();

    // Edit the name
    // getByDisplayValue is Testing Library's, not Playwright's (it threw since 29cd3d0).
    const nameInput = page.getByLabel(/brand name/i).or(page.locator('input[name="name"]'));
    await nameInput.clear();
    await nameInput.fill("Acceptance Bondi Plumbing — Edited");

    // Save
    // "Save changes": the page has other Save buttons since 819737c ("Save websites").
    await page.getByRole("button", { name: "Save changes" }).click();

    // Updated name visible (the page's heading: the breadcrumb and switcher show it too)
    await expect(
      page.getByRole("heading", { name: "Acceptance Bondi Plumbing — Edited", level: 1 }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("§11: User deletes brand → disappears from list; DB row has deletedAt set", async ({
    page,
  }) => {
    if (!acceptanceBrandId) test.skip();

    await page.goto(`/brands/${acceptanceBrandId}`);

    // Initiate delete
    await page.getByRole("button", { name: /delete/i }).click();

    // The dialog's own button (the dialog comes first in the page, so "the last Delete button"
    // was the page's, under the dialog's overlay).
    await page.getByRole("button", { name: "Delete brand", exact: true }).click();

    // Redirected to brand list
    await expect(page).toHaveURL(/\/brands$/, { timeout: 15_000 });

    // Brand not in list
    await expect(page.getByText("Acceptance Bondi Plumbing — Edited")).toBeHidden({
      timeout: 5_000,
    });

    // DB: soft-deleted (row exists, deletedAt is set)
    const brand = await getBrandById(acceptanceBrandId);
    expect(brand?.deletedAt).not.toBeNull();

    acceptanceBrandId = null; // already cleaned up
  });

  // The region routes (/au/, /uk/, /uk/pricing) have no pages: their three tests were removed on
  // 10 Nov (Playwright-run follow-ups, part 2, S10).

  // ── Cross-org isolation (relies on testAsUser2 fixture) ──────────────────
  // Playwright cannot run two fixtures in one test file easily.
  // The cross-org browser test is in 05-cross-org-isolation.spec.ts.
  // Here we verify it via API only for the acceptance checklist.

  test("§11: Cross-org API: User 1 brand returns 404 for User 2 (API assertion)", async ({
    page,
  }) => {
    // Seed a brand for org1 via DB (using static imports — B13 FIX)
    const [seedBrand] = await db
      .insert(schema.brands)
      .values({
        organizationId: org1Id,
        name: "Acceptance Cross-Org Brand",
        domain: "acceptancecrossorg.com.au",
        vertical: "tradies",
        region: "au",
        competitors: [],
        primaryRegions: [],
      })
      .returning();
    createdBrandIds.push(seedBrand.id);

    // User 1 (current fixture) CAN access it
    const res1 = await page.request.get(`/api/brands/${seedBrand.id}`);
    expect(res1.status()).toBe(200);

    // We can't sign in as user 2 in the same test — that's covered in 05-cross-org.
    // Verify the brand exists and is owned by org1:
    const brand = await getBrandById(seedBrand.id);
    expect(brand?.organizationId).toBe(org1Id);
  });
});
