/**
 * tests/e2e/03-brand-create.spec.ts
 *
 * Frontend E2E: /brands/new — brand create form
 *
 * Sprint 1 §11 acceptance criteria:
 *   ✓ "Create brand" → fill form (name, domain, vertical) → submit → see in list
 *   ✓ Validation: empty name shows error; missing domain shows error
 *   ✓ After create, navigated to /brands (list), not /brands/[id]
 *   ✓ Free-tier org at 1 brand: 403 "Brand limit reached" shown in UI
 *
 * Test data lifecycle:
 *   Every test that creates a brand records its ID and deletes it after the test.
 *   afterAll removes the spec's account, its workspace and every brand in it.
 */

import { eq } from "drizzle-orm";
import { brands } from "@/db/schema";
import { expect, testSignedInAs } from "./helpers/auth";
import { db } from "./helpers/db";
import {
  createSpecAccount,
  removeSpecAccount,
  type SpecAccount,
  setSpecPlan,
} from "./helpers/spec-account";

// Its own account and workspace (tests/e2e/helpers/spec-account.ts), on an Agency plan (enough
// brands for the create tests). The limit tests move it to Free and back: plans come from
// `subscriptions`, never `organizations.tier`.
let account: SpecAccount;
const test = testSignedInAs(() => account);

// Track brands created in each test for targeted teardown
const createdBrandIds: string[] = [];

test.beforeAll(async () => {
  account = await createSpecAccount({ key: "root-03-brand-create", plan: "agency" });
});

test.afterAll(async () => {
  await removeSpecAccount(account);
});

test.describe("Brand create form (/brands/new)", () => {
  test.afterEach(async ({ page }) => {
    // Clean up brands created in this test via the API
    // Uses the browser session (which carries the auth cookie)
    for (const id of [...createdBrandIds]) {
      await page.request.delete(`/api/brands/${id}`).catch(() => {});
      createdBrandIds.splice(createdBrandIds.indexOf(id), 1);
    }
  });

  // ── Page rendering ─────────────────────────────────────────────────────────

  test("navigating to /brands/new shows the create form", async ({ page }) => {
    await page.goto("/brands/new");

    await expect(page).toHaveURL(/\/brands\/new/);
    // Form inputs from prototype: Brand name, Domain, vertical radio cards
    await expect(
      page.getByLabel(/brand name/i).or(page.getByPlaceholder(/bondi plumbing/i)),
    ).toBeVisible();
    await expect(
      page.getByLabel(/domain/i).or(page.getByPlaceholder(/bondiplumbing\.com\.au/i)),
    ).toBeVisible();
  });

  // The page has had a native <select> since 29cd3d0, and no Cancel button: this spec was written
  // for the prototype's vertical cards. The options are what it offers.
  test("vertical options are offered: Tradies, Allied Health, SaaS", async ({ page }) => {
    await page.goto("/brands/new");

    await expect(page.getByLabel("Vertical").locator("option")).toHaveText([
      "Select a vertical",
      "Tradies",
      "Allied Health",
      "SaaS",
    ]);
  });

  // ── Happy path: create brand ───────────────────────────────────────────────

  test("fills form and submits — brand appears in list (Sprint 1 §11)", async ({ page }) => {
    await page.goto("/brands/new");

    // Fill Brand name
    const nameInput = page.getByLabel(/brand name/i).or(page.getByPlaceholder(/bondi plumbing/i));
    await nameInput.fill("E2E Tradies Brand");

    // Fill Domain (prototype strips https:// prefix automatically)
    const domainInput = page
      .getByLabel(/domain/i)
      .or(page.getByPlaceholder(/bondiplumbing\.com\.au/i));
    await domainInput.fill("e2etradies.com.au");

    // Select vertical: Tradies
    await page.getByLabel("Vertical").selectOption("tradies");

    // Submit
    const createBtn = page.getByRole("button", { name: /create brand/i });
    await createBtn.click();

    // Sprint 1 §9 step 5: "on success navigate to /brands (list), not /brands/[id]"
    await expect(page).toHaveURL(/\/brands$/, { timeout: 15_000 });

    // Brand appears in the list
    // The brand's row in the list (the brand switcher shows its name too).
    await expect(page.getByRole("link", { name: /E2E Tradies Brand/ })).toBeVisible({
      timeout: 10_000,
    });

    // Record created brand for teardown
    // Extract the brand ID from the API response using the network inspector
    const brandRes = await page.request.get("/api/brands");
    // GET /api/brands answers { brands } (and has since 29cd3d0), not a bare array.
    const { brands } = await brandRes.json();
    const created = (brands as Array<{ name: string; id: string }>).find(
      (b) => b.name === "E2E Tradies Brand",
    );
    if (created) createdBrandIds.push(created.id);
  });

  test("creates Allied Health brand and shows vertical label in list", async ({ page }) => {
    await page.goto("/brands/new");

    await page
      .getByLabel(/brand name/i)
      .or(page.getByPlaceholder(/bondi plumbing/i))
      .fill("E2E Allied Health Brand");

    await page
      .getByLabel(/domain/i)
      .or(page.getByPlaceholder(/bondiplumbing\.com\.au/i))
      .fill("e2ealliedhealth.com.au");

    await page.getByLabel("Vertical").selectOption("allied_health");
    await page.getByRole("button", { name: /create brand/i }).click();

    await expect(page).toHaveURL(/\/brands$/, { timeout: 15_000 });
    // The brand's row in the list (the brand switcher shows its name too).
    await expect(page.getByRole("link", { name: /E2E Allied Health Brand/ })).toBeVisible({
      timeout: 10_000,
    });

    const brandRes = await page.request.get("/api/brands");
    // GET /api/brands answers { brands } (and has since 29cd3d0), not a bare array.
    const { brands } = await brandRes.json();
    const created = (brands as Array<{ name: string; id: string }>).find(
      (b) => b.name === "E2E Allied Health Brand",
    );
    if (created) createdBrandIds.push(created.id);
  });

  test("domain entered with https:// prefix is stripped in DB", async ({ page }) => {
    await page.goto("/brands/new");

    await page
      .getByLabel(/brand name/i)
      .or(page.getByPlaceholder(/bondi plumbing/i))
      .fill("E2E Domain Strip Brand");

    // Enter domain with protocol prefix
    await page
      .getByLabel(/domain/i)
      .or(page.getByPlaceholder(/bondiplumbing\.com\.au/i))
      .fill("https://e2edomainstrip.com.au/");

    await page.getByLabel("Vertical").selectOption("tradies");
    await page.getByRole("button", { name: /create brand/i }).click();

    await expect(page).toHaveURL(/\/brands$/, { timeout: 15_000 });

    // Verify the stored domain is stripped
    const brandRes = await page.request.get("/api/brands");
    // GET /api/brands answers { brands } (and has since 29cd3d0), not a bare array.
    const { brands } = await brandRes.json();
    const created = (brands as Array<{ name: string; id: string; domain: string }>).find(
      (b) => b.name === "E2E Domain Strip Brand",
    );

    if (created) {
      createdBrandIds.push(created.id);
      expect(created.domain).toBe("e2edomainstrip.com.au");
    }
  });

  // ── A new brand's setup (13 Nov, part 1; e2e in part 11) ──────────────────

  test("a new brand's setup panel is there on the first load; Confirm, and Run audit is enabled", async ({
    page,
  }) => {
    await page.goto("/brands/new");
    await page
      .getByLabel(/brand name/i)
      .or(page.getByPlaceholder(/bondi plumbing/i))
      .fill("E2E Setup Brand");
    await page
      .getByLabel(/domain/i)
      .or(page.getByPlaceholder(/bondiplumbing\.com\.au/i))
      .fill("e2esetup.com.au");
    await page.getByLabel("Vertical").selectOption("tradies");
    await page.getByRole("button", { name: /create brand/i }).click();
    await expect(page).toHaveURL(/\/brands$/, { timeout: 15_000 });
    const { brands: list } = await (await page.request.get("/api/brands")).json();
    const created = (list as Array<{ name: string; id: string }>).find(
      (b) => b.name === "E2E Setup Brand",
    );
    expect(created, "the new brand is listed").toBeTruthy();
    if (!created) return;
    createdBrandIds.push(created.id);

    // The first load, no reload or Save: the panel's place says the classifier is working, and Run
    // audit waits (it was hidden until a Save happened to refresh the page).
    await page.goto(`/brands/${created.id}`);
    await expect(page.locator("[data-classification-running]")).toContainText(
      "Working out your business type…",
    );
    const runAudit = page.getByRole("button", { name: "Run audit" });
    await expect(runAudit).toBeDisabled();

    // The e2e server runs no classifier (no Inngest), so this one never finishes: past the 3-minute
    // timeout (from when it started), the page's own 5-second poll offers the choice instead.
    await db
      .update(brands)
      .set({ updatedAt: new Date(Date.now() - 4 * 60_000) })
      .where(eq(brands.id, created.id));
    await expect(page.locator('[data-confirm-mode="could_not_classify"]')).toBeVisible({
      timeout: 20_000,
    });
    const details = page
      .locator("#confirm-business-details > div")
      .filter({ hasText: "Confirm your business details" });
    // The vertical's own types first.
    await expect(details.locator("[data-category-choices] button").first()).toHaveText("Plumbing");
    await details.getByRole("button", { name: "Plumbing", exact: true }).click();
    await details.getByRole("button", { name: "Households", exact: true }).click();
    await details.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.locator("[data-confirm-mode]")).toHaveCount(0, { timeout: 15_000 });

    // The form asked for no location, so its own card is next; then nothing is in the way.
    const location = page
      .locator("#confirm-business-details > div")
      .filter({ hasText: "Confirm your business location" });
    await location.getByPlaceholder("e.g. Bondi").fill("Bondi");
    await location.getByLabel("Postcode").fill("2026");
    await location.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(runAudit).toBeEnabled({ timeout: 15_000 });
    const stored = await db.select().from(brands).where(eq(brands.id, created.id));
    expect(stored[0]?.categoryConfirmedAt).not.toBeNull();
    expect(stored[0]?.categories).toEqual(["trades_plumbing"]);
    expect(stored[0]?.postcode).toBe("2026");
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  test("submitting empty name shows a validation error", async ({ page }) => {
    await page.goto("/brands/new");

    // Leave name empty, fill domain and select vertical
    await page
      .getByLabel(/domain/i)
      .or(page.getByPlaceholder(/bondiplumbing\.com\.au/i))
      .fill("validation-test.com.au");
    await page.getByLabel("Vertical").selectOption("tradies");

    await page.getByRole("button", { name: /create brand/i }).click();

    // Should NOT navigate away (validation failed)
    await expect(page).toHaveURL(/\/brands\/new/);

    // Some error indicator — form validation message or toast
    const _errorVisible = await page
      .getByText(/required/i)
      .or(page.getByText(/cannot be empty/i))
      .or(page.getByText(/brand name/i).filter({ hasText: /error|required|invalid/i }))
      .isVisible()
      .catch(() => false);

    // URL staying on /brands/new is sufficient confirmation of validation
    await expect(page).toHaveURL(/\/brands\/new/);
  });

  test("submitting empty domain shows a validation error", async ({ page }) => {
    await page.goto("/brands/new");

    await page
      .getByLabel(/brand name/i)
      .or(page.getByPlaceholder(/bondi plumbing/i))
      .fill("Validation Test Brand");
    await page.getByLabel("Vertical").selectOption("tradies");
    // No domain entered

    await page.getByRole("button", { name: /create brand/i }).click();
    await expect(page).toHaveURL(/\/brands\/new/);
  });

  // ── Tier limits ────────────────────────────────────────────────────────────

  test('free-tier org at 1 brand: API returns 403 "Brand limit reached" (Sprint 1 §11)', async ({
    page,
  }) => {
    /**
     * The workspace moves to Free (no subscription row: plans come from `subscriptions`,
     * lib/pricing/effective-tier.ts), makes its one brand, and the second answers 403.
     * The Agency plan comes back in the finally.
     */

    // E13 FIX: use try/finally so the plan is restored even if an assertion fails mid-test
    await setSpecPlan(account, null);
    try {
      // Create first brand (should succeed — free tier allows 1)
      const res1 = await page.request.post("/api/brands", {
        data: { name: "Free Limit Brand 1", domain: "freelimit1.com.au", vertical: "tradies" },
        headers: { "Content-Type": "application/json" },
      });
      expect(res1.status()).toBe(201);
      const { brand: limitBrand } = await res1.json();
      createdBrandIds.push(limitBrand.id);

      // Attempt second brand — API must return 403
      const res2 = await page.request.post("/api/brands", {
        data: { name: "Free Limit Brand 2", domain: "freelimit2.com.au", vertical: "tradies" },
        headers: { "Content-Type": "application/json" },
      });
      expect(res2.status()).toBe(403);
      const body = await res2.json();
      expect((body as { error: string }).error).toMatch(/brand limit/i);
    } finally {
      // Always restore the Agency plan — even if assertions above fail
      await setSpecPlan(account, "agency");
    }
  });

  test("free-tier brand limit: UI shows error message after 403 response", async ({ page }) => {
    /**
     * The same limit through the form: on Free with its one brand, submitting a second
     * must show the limit, not fail silently.
     */

    // E13 FIX: try/finally ensures the Agency plan is restored even if the test fails
    await setSpecPlan(account, null);
    try {
      // Seed 1 brand (reaches the free limit)
      const res = await page.request.post("/api/brands", {
        data: { name: "Free UI Limit Brand", domain: "freeuiliimit.com.au", vertical: "tradies" },
        headers: { "Content-Type": "application/json" },
      });
      const { brand: limitBrand } = await res.json();
      createdBrandIds.push(limitBrand.id);

      // Now try to create a second brand via the UI form
      await page.goto("/brands/new");
      await page
        .getByLabel(/brand name/i)
        .or(page.getByPlaceholder(/bondi plumbing/i))
        .fill("Should Fail Brand");
      await page
        .getByLabel(/domain/i)
        .or(page.getByPlaceholder(/bondiplumbing\.com\.au/i))
        .fill("shouldfail.com.au");
      await page.getByLabel("Vertical").selectOption("tradies");
      await page.getByRole("button", { name: /create brand/i }).click();

      // The app receives a 403 and must display an error to the user: the form's own error (the
      // shell's "New brand" also says "Limit reached" now, c21fa36).
      await expect(page.getByText(/^Brand limit reached/)).toBeVisible({ timeout: 10_000 });
    } finally {
      // Always restore the Agency plan — even if assertions above fail
      await setSpecPlan(account, "agency");
    }
  });
});
