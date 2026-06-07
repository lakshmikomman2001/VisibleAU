/**
 * 03-tier-gate.spec.ts
 *
 * Sprint 6 §10 + §13 — Tier gating: Free tier sees blur + upgrade CTA.
 * Starter+ sees full action text + mark done/dismiss buttons (DG3/DD4/DH2).
 *
 * Uses USER 1 (starter) and USER 2 (free tier) from separate fixtures.
 */
import { testAsUser1, testAsUser2, expect } from './fixtures';
import {
  seedOrganization, seedUser, seedBrand, seedAudit,
  seedActionItem, deleteTestDataForOrg,
} from './db';

const ENV = {
  clerkOrgId1:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId1: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email1:       process.env.E2E_TEST_USER_1_EMAIL     ?? '',
  clerkOrgId2:  process.env.E2E_TEST_ORG_2_CLERK_ID  ?? '',
  clerkUserId2: process.env.E2E_TEST_USER_2_CLERK_ID  ?? '',
  email2:       process.env.E2E_TEST_USER_2_EMAIL     ?? '',
};

let org1Id   = '';
let org2Id   = '';
let item1Id  = '';
let item2Id  = '';

testAsUser1.beforeAll(async () => {
  // Org 1: Starter tier
  const org1   = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: '[S6-FE] TierGate Org1', tier: 'starter' });
  org1Id       = org1.id;
  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });
  const brand1 = await seedBrand({ organizationId: org1Id, name: '[S6-FE] TierGate Brand1' });
  const audit1 = await seedAudit({ organizationId: org1Id, brandId: brand1.id });
  const item1  = await seedActionItem({
    organizationId: org1Id, brandId: brand1.id, auditId: audit1.id,
    recommendationKey: 'wikipedia-article', title: '[S6-FE] Starter article',
    action: 'Draft a neutral Wikipedia article about your business.',
    confidenceLabel: 'confirmed', expectedImpactScore: 'high',
  });
  item1Id = item1.id;

  // Org 2: Free tier
  const org2   = await seedOrganization({ clerkOrgId: ENV.clerkOrgId2, name: '[S6-FE] TierGate Org2', tier: 'free' });
  org2Id       = org2.id;
  await seedUser({ clerkUserId: ENV.clerkUserId2, organizationId: org2Id, email: ENV.email2 });
  const brand2 = await seedBrand({ organizationId: org2Id, name: '[S6-FE] TierGate Brand2' });
  const audit2 = await seedAudit({ organizationId: org2Id, brandId: brand2.id });
  const item2  = await seedActionItem({
    organizationId: org2Id, brandId: brand2.id, auditId: audit2.id,
    recommendationKey: 'faq-content', title: '[S6-FE] Free article',
    action: 'Add a FAQPage schema block to your main service page.',
    confidenceLabel: 'likely', expectedImpactScore: 'medium',
  });
  item2Id = item2.id;
});

testAsUser1.afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
  await deleteTestDataForOrg(org2Id);
});

// ─── FE-S6-21 — Starter tier: action text visible on list card ────────────────

testAsUser1('FE-S6-21: Starter+ user sees unblurred action content on list cards (§10)', async ({ page }) => {
  await page.goto('/action-center');
  const card = // L14 FIX: page.locator('div').filter({hasText}) matched ancestor divs too, making
  // card-scoped assertions page-wide. recommendation-card uses <Card hover> which
  // adds cursor-pointer class — unique to clickable cards, not ancestor wrappers.
  page.locator('div.cursor-pointer').filter({ hasText: '[S6-FE] Starter article' });
  await expect(card).toBeVisible();
  // No blur filter on content wrapper for Starter
  const blurredWrapper = card.locator('[style*="blur"]');
  await expect(blurredWrapper).not.toBeVisible();
});

// ─── FE-S6-22 — Starter tier: full action text on detail page ────────────────

testAsUser1('FE-S6-22: Starter+ user sees full action text on ActionDetail page (DH1)', async ({ page }) => {
  await page.goto(`/action-center/${item1Id}`);
  // "What to do" section visible
  await expect(page.getByRole('heading', { name: /what to do/i })).toBeVisible();
  await expect(page.getByText('Draft a neutral Wikipedia article about your business.')).toBeVisible();
});

// ─── FE-S6-23 — Starter tier: mark done / dismiss buttons visible ─────────────

testAsUser1('FE-S6-23: Starter+ user sees Mark done and Dismiss buttons (DI1 fix)', async ({ page }) => {
  await page.goto(`/action-center/${item1Id}`);
  await expect(page.getByRole('button', { name: /mark.*done/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /dismiss/i })).toBeVisible();
});

// ─── FE-S6-24 — Free tier: action text is blurred on list cards ───────────────

testAsUser2('FE-S6-24: Free tier user sees blurred action content on list page (§10 DD4)', async ({ page }) => {
  await page.goto('/action-center');
  const card = // L14 FIX: page.locator('div').filter({hasText}) matched ancestor divs too, making
  // card-scoped assertions page-wide. recommendation-card uses <Card hover> which
  // adds cursor-pointer class — unique to clickable cards, not ancestor wrappers.
  page.locator('div.cursor-pointer').filter({ hasText: '[S6-FE] Free article' });
  await expect(card).toBeVisible();
  // Title should still be readable (not blurred)
  await expect(card.getByText('[S6-FE] Free article')).toBeVisible();
  // Blur wrapper present
  const tierGate = card.locator('[style*="blur"]');
  await expect(tierGate).toBeVisible();
  // Verify CSS blur is applied
  const filterStyle = await tierGate.evaluate(el => getComputedStyle(el).filter);
  expect(filterStyle).toMatch(/blur/i);
});

// ─── FE-S6-25 — Free tier: upgrade CTA visible on detail page ────────────────

testAsUser2('FE-S6-25: Free tier sees "Upgrade to Starter" CTA on ActionDetail page', async ({ page }) => {
  await page.goto(`/action-center/${item2Id}`);
  await expect(page.getByText(/upgrade to starter/i)).toBeVisible();
});

// ─── FE-S6-26 — Free tier: mark done / dismiss buttons NOT visible ────────────

testAsUser2('FE-S6-26: Free tier user does NOT see Mark done / Dismiss buttons (§10)', async ({ page }) => {
  await page.goto(`/action-center/${item2Id}`);
  await expect(page.getByRole('button', { name: /mark.*done/i })).not.toBeVisible();
  await expect(page.getByRole('button', { name: /dismiss/i })).not.toBeVisible();
});

// ─── FE-S6-27 — Free tier: card title still readable through blur ─────────────

testAsUser2('FE-S6-27: Free tier card title is visible even with blur overlay (DN4 fix)', async ({ page }) => {
  await page.goto('/action-center');
  const card = // L14 FIX: page.locator('div').filter({hasText}) matched ancestor divs too, making
  // card-scoped assertions page-wide. recommendation-card uses <Card hover> which
  // adds cursor-pointer class — unique to clickable cards, not ancestor wrappers.
  page.locator('div.cursor-pointer').filter({ hasText: '[S6-FE] Free article' });
  // Title wrapper is OUTSIDE the TierGate blur — always readable
  const title = card.locator('div.font-semibold, p.font-semibold, span.font-semibold').first();
  await expect(title).toBeVisible();
  await expect(title).toContainText('[S6-FE] Free article');
});
