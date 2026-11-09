/**
 * tests/e2e/04-brand-detail.spec.ts
 *
 * Frontend E2E: /brands/[brandId] — brand detail, inline edit, delete
 *
 * Sprint 1 §11 acceptance criteria:
 *   ✓ User can click a brand → see detail page
 *   ✓ Detail page shows brand metadata (name, domain, vertical, region)
 *   ✓ Edit button enables inline edit mode
 *   ✓ User edits name → saves → updated name is shown
 *   ✓ Cancel edit restores original values without saving
 *   ✓ Delete button shows confirmation dialog
 *   ✓ Confirming delete removes brand from list (soft-delete)
 *   ✓ After delete, brand row has deletedAt set (verified via DB)
 *
 * From prototype (W8 fix): delete triggers shadcn AlertDialog for confirmation.
 * Sprint 1 §12 anti-pattern: hard-delete is forbidden — only soft-delete.
 *
 * Test data lifecycle:
 *   beforeEach: create one brand via API
 *   afterEach:  delete test brand via API (or DB if already soft-deleted)
 */

import { expect, testSignedInAs } from "./helpers/auth";
import { getBrandById } from "./helpers/db";
import { createSpecAccount, removeSpecAccount, type SpecAccount } from "./helpers/spec-account";

// Its own account and workspace (tests/e2e/helpers/spec-account.ts), on an Agency plan.
let account: SpecAccount;
const test = testSignedInAs(() => account);
let currentBrandId: string | null = null;

test.beforeAll(async () => {
  account = await createSpecAccount({ key: "root-04-brand-detail", plan: "agency" });
});

test.afterAll(async () => {
  await removeSpecAccount(account);
});

test.describe("Brand detail page (/brands/[brandId])", () => {
  test.beforeEach(async ({ page }) => {
    // Create a fresh brand before each test
    const res = await page.request.post("/api/brands", {
      data: {
        name: "E2E Detail Brand",
        domain: "e2edetail.com.au",
        vertical: "tradies",
        competitors: ["competitor.com.au"],
        primaryRegions: ["NSW:Bondi"],
      },
      headers: { "Content-Type": "application/json" },
    });
    const { brand } = await res.json();
    currentBrandId = brand.id;
  });

  test.afterEach(async ({ page }) => {
    // Clean up: delete the brand created for this test
    if (currentBrandId) {
      await page.request.delete(`/api/brands/${currentBrandId}`).catch(() => {});
      currentBrandId = null;
    }
  });

  // ── Detail page rendering ─────────────────────────────────────────────────

  test("navigating to /brands/[id] shows brand metadata", async ({ page }) => {
    await page.goto(`/brands/${currentBrandId}`);

    await expect(page).toHaveURL(new RegExp(`/brands/${currentBrandId}`));

    // The brand's name is also in the breadcrumb and the brand switcher, so the page's heading.
    await expect(page.getByRole("heading", { name: "E2E Detail Brand", level: 1 })).toBeVisible();
    // Domain must be visible
    await expect(page.getByText("e2edetail.com.au")).toBeVisible();
    // Vertical label (the edit form's <select> holds a "Tradies" option too)
    await expect(page.getByText("tradies", { exact: true })).toBeVisible();
  });

  test("detail page has Edit button", async ({ page }) => {
    await page.goto(`/brands/${currentBrandId}`);

    const editBtn = page
      .getByRole("button", { name: /edit/i })
      .or(page.getByRole("link", { name: /edit/i }));
    await expect(editBtn).toBeVisible();
  });

  test("detail page has Delete button", async ({ page }) => {
    await page.goto(`/brands/${currentBrandId}`);

    const deleteBtn = page.getByRole("button", { name: /delete/i });
    await expect(deleteBtn).toBeVisible();
  });

  // ── Inline edit ────────────────────────────────────────────────────────────

  test("clicking Edit enters edit mode (Sprint 1 §11)", async ({ page }) => {
    await page.goto(`/brands/${currentBrandId}`);

    const editBtn = page.getByRole("button", { name: /edit/i });
    await editBtn.click();

    // In edit mode: inputs should appear OR the button text changes to Cancel/Save
    const saveBtn = page.getByRole("button", { name: /save/i });
    const cancelBtn = page.getByRole("button", { name: /cancel/i });

    const inEditMode =
      (await saveBtn.isVisible().catch(() => false)) ||
      (await cancelBtn.isVisible().catch(() => false));

    expect(inEditMode).toBe(true);
  });

  test("editing brand name and saving updates the display", async ({ page }) => {
    await page.goto(`/brands/${currentBrandId}`);

    // Enter edit mode
    await page.getByRole("button", { name: /edit/i }).click();

    // Find the name input in edit mode and change it
    // getByDisplayValue is Testing Library's, not Playwright's: since 29cd3d0 this threw before the
    // test could look at the page.
    const nameInput = page.getByLabel(/brand name/i).or(page.locator('input[name="name"]'));

    await nameInput.clear();
    await nameInput.fill("E2E Detail Brand — Renamed");

    // Save
    // "Save changes": the page has other Save buttons since 819737c ("Save websites").
    await page.getByRole("button", { name: "Save changes" }).click();

    // The brand's name is also in the breadcrumb and the brand switcher, so the page's heading.
    await expect(
      page.getByRole("heading", { name: "E2E Detail Brand — Renamed", level: 1 }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "E2E Detail Brand", exact: true })).toBeHidden();
  });

  test("cancelling edit reverts changes without saving", async ({ page }) => {
    await page.goto(`/brands/${currentBrandId}`);

    await page.getByRole("button", { name: /edit/i }).click();

    // getByDisplayValue is Testing Library's, not Playwright's: since 29cd3d0 this threw before the
    // test could look at the page.
    const nameInput = page.getByLabel(/brand name/i).or(page.locator('input[name="name"]'));

    await nameInput.clear();
    await nameInput.fill("Temporary Changed Name");

    // Cancel — do NOT save
    await page.getByRole("button", { name: /cancel/i }).click();

    // Original name still shown
    await expect(page.getByRole("heading", { name: "E2E Detail Brand", level: 1 })).toBeVisible();
    // Changed name should not appear
    await expect(page.getByText("Temporary Changed Name")).toBeHidden();

    // Verify via API that DB was not changed
    // GET /api/brands/[id] answers { brand } (since 29cd3d0).
    const res = await page.request.get(`/api/brands/${currentBrandId}`);
    const { brand } = (await res.json()) as { brand: { name: string } };
    expect(brand.name).toBe("E2E Detail Brand");
  });

  // ── Delete + confirmation dialog ───────────────────────────────────────────

  test("clicking Delete shows a confirmation dialog (W8 fix — Sprint 1 prototype)", async ({
    page,
  }) => {
    await page.goto(`/brands/${currentBrandId}`);

    await page.getByRole("button", { name: /delete/i }).click();

    // Prototype uses AlertDialog: "Delete Bondi Plumbing?" with cancel/confirm buttons
    const confirmDialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));

    // Either a dialog appears, or confirm/cancel buttons become visible
    const cancelDelete = page.getByRole("button", { name: /cancel/i });
    const confirmDelete = page.getByRole("button", { name: /delete brand|confirm|yes/i });

    const dialogAppeared =
      (await confirmDialog.isVisible().catch(() => false)) ||
      (await cancelDelete.isVisible().catch(() => false)) ||
      (await confirmDelete.isVisible().catch(() => false));

    expect(dialogAppeared).toBe(true);
  });

  test("cancelling delete dialog keeps the brand intact", async ({ page }) => {
    await page.goto(`/brands/${currentBrandId}`);

    await page.getByRole("button", { name: /delete/i }).click();

    // Cancel the delete confirmation
    const cancelBtn = page.getByRole("button", { name: /cancel/i }).last();
    await cancelBtn.click();

    // Still on detail page (or brand still visible)
    await expect(page.getByRole("heading", { name: "E2E Detail Brand", level: 1 })).toBeVisible({
      timeout: 5_000,
    });

    // Brand still exists in DB (not deleted)
    const brand = await getBrandById(currentBrandId!);
    expect(brand).not.toBeNull();
    expect(brand?.deletedAt).toBeNull();
  });

  test("confirming delete soft-deletes the brand and redirects to /brands (Sprint 1 §11)", async ({
    page,
  }) => {
    await page.goto(`/brands/${currentBrandId}`);

    await page.getByRole("button", { name: /delete/i }).click();

    // The dialog's own button. "The last Delete button" was the page's, under the dialog's
    // overlay: the dialog comes first in the page.
    await page.getByRole("button", { name: "Delete brand", exact: true }).click();

    // Sprint 1 prototype: after delete, navigate back to /brands (list)
    await expect(page).toHaveURL(/\/brands$/, { timeout: 15_000 });

    // Brand does NOT appear in the list
    await expect(page.getByText("E2E Detail Brand")).toBeHidden({ timeout: 5_000 });

    // DB: brand row still exists (soft-delete, not hard-delete — §12 anti-pattern)
    const brand = await getBrandById(currentBrandId!);
    expect(brand).not.toBeNull(); // row exists
    expect(brand?.deletedAt).not.toBeNull(); // deletedAt is set

    // Mark cleaned up so afterEach does not try to delete again
    currentBrandId = null;
  });
});
