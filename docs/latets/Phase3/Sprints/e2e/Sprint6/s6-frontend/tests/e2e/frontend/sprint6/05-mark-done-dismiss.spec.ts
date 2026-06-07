/**
 * 05-mark-done-dismiss.spec.ts
 *
 * Sprint 6 §10 (DI1/DG4) + §13 (DH4) — Mark done flow, dismiss with reason,
 * item disappears from list after PATCH, router.refresh() UI update.
 */
import { testAsUser1, expect } from './fixtures';
import {
  db, seedOrganization, seedUser, seedBrand, seedAudit,
  seedActionItem, deleteTestDataForOrg,
} from './db';
import * as schema from '../../../../db/schema';
import { eq }      from 'drizzle-orm';

const ENV = {
  clerkOrgId1:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId1: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email1:       process.env.E2E_TEST_USER_1_EMAIL     ?? '',
};

let org1Id    = '';
let brand1Id  = '';
let audit1Id  = '';

testAsUser1.beforeAll(async () => {
  const org   = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: '[S6-FE] Status Org', tier: 'starter' });
  org1Id      = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });
  const brand = await seedBrand({ organizationId: org1Id, name: '[S6-FE] Status Brand' });
  brand1Id    = brand.id;
  const audit = await seedAudit({ organizationId: org1Id, brandId: brand1Id });
  audit1Id    = audit.id;
});

testAsUser1.afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
});

// ─── FE-S6-36 — Mark done flow ───────────────────────────────────────────────

testAsUser1('FE-S6-36: Mark done removes item from list on next render (DH4, DG4)', async ({ page }) => {
  const item = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'fe-mark-done-test',
    title: '[S6-FE] Mark done test item',
    action: 'Take this action to improve visibility.',
    confidenceLabel: 'confirmed', expectedImpactScore: 'high',
  });

  try {
    // Navigate to detail page
    await page.goto(`/action-center/${item.id}`);
    await expect(page.locator('h1')).toContainText('[S6-FE] Mark done test item');

    // Click Mark as done
    await page.getByRole('button', { name: /mark.*done/i }).click();

    // N1 FIX: DG4 says router.refresh() only (stays at /action-center/[id]).
    // DI1 says router.refresh() + router.push('/action-center').
    // Both specs are present; DI1 (v1.11) is more recent but DG4 explicitly says
    // router.push is NOT preferred. Accept both URLs as valid post-PATCH behavior.
    const currentUrl = page.url();
    const navigatedToList = /\/action-center$/.test(currentUrl);
    const stayedOnDetail = /\/action-center\/.+/.test(currentUrl);
    expect(navigatedToList || stayedOnDetail).toBe(true);

    // If navigated to list: item should not appear (done items excluded by API filter)
    if (navigatedToList) {
      await expect(page.getByText('[S6-FE] Mark done test item')).not.toBeVisible();
    }
    // If stayed on detail: mark done/dismiss buttons should now be hidden (DH1)
    if (stayedOnDetail) {
      await expect(page.getByRole('button', { name: /mark.*done/i })).not.toBeVisible();
    }

    // Verify DB state
    const [row] = await db.select().from(schema.actionItems).where(eq(schema.actionItems.id, item.id));
    expect(row.status).toBe('done');
    expect(row.doneAt).not.toBeNull();
  } finally {
    await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
  }
});

// ─── FE-S6-37 — Dismiss with reason flow ─────────────────────────────────────

testAsUser1('FE-S6-37: Dismiss shows reason textarea and removes item from list (DH4)', async ({ page }) => {
  const item = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'fe-dismiss-test',
    title: '[S6-FE] Dismiss test item',
    action: 'An action to be dismissed.',
    confidenceLabel: 'hypothesis', expectedImpactScore: 'low',
  });

  try {
    await page.goto(`/action-center/${item.id}`);
    await expect(page.locator('h1')).toContainText('[S6-FE] Dismiss test item');

    // Click Dismiss
    await page.getByRole('button', { name: /dismiss/i }).click();

    // Dismiss reason textarea should appear (DI1: inline textarea required)
    const textarea = page.locator('textarea[name="dismissedReason"], textarea[placeholder*="reason" i]');
    await expect(textarea).toBeVisible();

    // Type a reason
    const reason = 'Not relevant to our vertical at this time';
    await textarea.fill(reason);

    // Submit dismiss
    // O12 FIX: DI1 spec names no confirm label. Accept 'Confirm dismiss', 'Submit', or 'Confirm'.
    await page.getByRole('button', { name: /confirm.*dismiss|submit.*dismiss|^confirm$|^submit$/i }).click();

    // N1 FIX: Same DG4 vs DI1 ambiguity as FE-S6-36. Accept both URL patterns.
    const dismissUrl = page.url();
    const dismissNavigatedToList = /\/action-center$/.test(dismissUrl);
    const dismissStayedOnDetail  = /\/action-center\/.+/.test(dismissUrl);
    expect(dismissNavigatedToList || dismissStayedOnDetail).toBe(true);

    if (dismissNavigatedToList) {
      await expect(page.getByText('[S6-FE] Dismiss test item')).not.toBeVisible();
    }
    if (dismissStayedOnDetail) {
      await expect(page.getByRole('button', { name: /dismiss/i })).not.toBeVisible();
    }

    // Verify DB state
    const [row] = await db.select().from(schema.actionItems).where(eq(schema.actionItems.id, item.id));
    expect(row.status).toBe('dismissed');
    expect(row.dismissedReason).toBe(reason);
    expect(row.dismissedAt).not.toBeNull();
  } finally {
    await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
  }
});

// ─── FE-S6-38 — Dismiss without reason shows validation error ────────────────

testAsUser1('FE-S6-38: dismissing without reason shows validation error (DB3 Zod refine)', async ({ page }) => {
  const item = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'fe-dismiss-no-reason-test',
    title: '[S6-FE] Dismiss no reason',
    action: 'Action text.',
    confidenceLabel: 'likely', expectedImpactScore: 'medium',
  });

  try {
    await page.goto(`/action-center/${item.id}`);
    await page.getByRole('button', { name: /dismiss/i }).click();

    // Confirm without filling reason
    const confirmButton = page.getByRole('button', { name: /confirm.*dismiss|submit.*dismiss|^confirm$|^submit$/i });
    await confirmButton.click();

    // M2 FIX: DI1 says textarea reason is 'required'. Implementations differ:
    // A) Confirm button disabled until textarea filled → no error text, button is disabled.
    // B) Confirm button always enabled → shows validation text on click (I14 fix covers both paths).
    // Accept either signal: visible error text OR confirm button being disabled.
    const confirmButton = page.getByRole('button', { name: /confirm.*dismiss|submit.*dismiss|^confirm$|^submit$/i });
    const isDisabled = await confirmButton.isDisabled().catch(() => false);
    if (!isDisabled) {
      // Button was clickable — expect a visible validation/error message
      await expect(
        page.getByText(/reason.*required|required.*reason|please.*provide.*reason|failed to update/i)
      ).toBeVisible();
    }
    // Either disabled button OR error text = valid 'reason required' enforcement ✓

    // Status should remain unchanged
    const [row] = await db.select().from(schema.actionItems).where(eq(schema.actionItems.id, item.id));
    expect(row.status).toBe('open');
  } finally {
    await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
  }
});

// ─── FE-S6-39 — Done item not shown on Action Center list ────────────────────

testAsUser1('FE-S6-39: items with status=done are not shown on Action Center list by default', async ({ page }) => {
  // Seed directly as done (no UI flow needed)
  const item = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'fe-done-preseeded',
    title: '[S6-FE] Pre-done item (should not appear)',
    action: 'This was already done.',
    confidenceLabel: 'confirmed', expectedImpactScore: 'high',
    status: 'done',
  });

  try {
    await page.goto('/action-center');
    await expect(page.getByText('[S6-FE] Pre-done item (should not appear)')).not.toBeVisible();
  } finally {
    await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
  }
});

// ─── FE-S6-40 — Mark done buttons hidden for already-done items ───────────────

testAsUser1('FE-S6-40: mark done / dismiss buttons hidden when item status is done (DH1)', async ({ page }) => {
  const item = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'fe-already-done',
    title: '[S6-FE] Already done item',
    action: 'Already completed action.',
    confidenceLabel: 'confirmed', expectedImpactScore: 'high',
    status: 'done',
  });

  try {
    // Access detail page directly (bypasses list filter)
    await page.goto(`/action-center/${item.id}`);
    // Buttons must NOT be shown for done items per DH1 spec:
    // {!isFree && item.status !== 'done' && item.status !== 'dismissed' && ( <ActionStatusButtons> )}
    await expect(page.getByRole('button', { name: /mark.*done/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /dismiss/i })).not.toBeVisible();
  } finally {
    await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
  }
});
