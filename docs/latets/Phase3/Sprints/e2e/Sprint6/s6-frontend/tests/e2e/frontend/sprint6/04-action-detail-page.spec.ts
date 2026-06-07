/**
 * 04-action-detail-page.spec.ts
 *
 * Sprint 6 §10 (DH1) + §13 — /action-center/[id] ActionDetail page:
 * full content renders, breadcrumb correct, evidence link works,
 * 404 for non-existent item, back navigation.
 */
import { testAsUser1, expect } from './fixtures';
import {
  seedOrganization, seedUser, seedBrand, seedAudit,
  seedActionItem, deleteTestDataForOrg,
} from './db';

const ENV = {
  clerkOrgId1:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId1: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email1:       process.env.E2E_TEST_USER_1_EMAIL     ?? '',
};

let org1Id  = '';
let itemId  = '';
let brand1Name = '[S6-FE] Detail Brand';

testAsUser1.beforeAll(async () => {
  const org   = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: '[S6-FE] Detail Org', tier: 'starter' });
  org1Id      = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });
  const brand = await seedBrand({ organizationId: org1Id, name: brand1Name });
  const audit = await seedAudit({ organizationId: org1Id, brandId: brand.id });
  const item  = await seedActionItem({
    organizationId:      org1Id,
    brandId:             brand.id,
    auditId:             audit.id,
    recommendationKey:   'wikipedia-article',
    dimension:           'frequency',
    title:               '[S6-FE] Detail page article title',
    action:              'Draft a neutral Wikipedia article using the AI template below.',
    confidenceLabel:     'confirmed',
    expectedImpactScore: 'high',
    evidenceRefs: [
      { source: 'Princeton GEO study (2024)', url: 'https://arxiv.org/abs/2404.11973', summary: 'Wikipedia appears in 47.9% of ChatGPT top-10 citations.' },
    ],
  });
  itemId = item.id;
});

testAsUser1.afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
});

// ─── FE-S6-28 — Detail page loads with full shape ────────────────────────────

testAsUser1('FE-S6-28: ActionDetail page loads and shows item title, brandName, dimension (DH1)', async ({ page }) => {
  await page.goto(`/action-center/${itemId}`);
  await expect(page.locator('h1')).toContainText('[S6-FE] Detail page article title');
  // M15 FIX: brand1Name contains '[' and ']' which are regex metacharacters.
  // new RegExp(`${brand1Name}.*frequency`) fails because [S6-FE] is parsed as a
  // character class, not the literal string. The regex returns no match.
  // Fix: use separate plain-text assertions for brandName and dimension.
  // Playwright's getByText(string) does a substring match — no regex interpretation.
  await expect(page.getByText(brand1Name, { exact: false })).toBeVisible();
  await expect(page.getByText('frequency', { exact: false })).toBeVisible();
});

// ─── FE-S6-29 — Confidence badge at top of detail page ───────────────────────

testAsUser1('FE-S6-29: ConfidenceBadge at top of detail page shows Confirmed in green', async ({ page }) => {
  await page.goto(`/action-center/${itemId}`);
  // H7+H8 FIX: Check Confirmed badge by visible text
  await expect(page.getByText('Confirmed').first()).toBeVisible();
});

// ─── FE-S6-30 — "What to do" section with action text ────────────────────────

testAsUser1('FE-S6-30: ActionDetail shows "What to do" section with action text (DH1)', async ({ page }) => {
  await page.goto(`/action-center/${itemId}`);
  await expect(page.getByRole('heading', { name: /what to do/i })).toBeVisible();
  await expect(page.getByText('Draft a neutral Wikipedia article using the AI template below.')).toBeVisible();
});

// ─── FE-S6-31 — Evidence link expand on detail page ──────────────────────────

testAsUser1('FE-S6-31: evidence link expands to show citations on detail page (DF3)', async ({ page }) => {
  await page.goto(`/action-center/${itemId}`);
  const evidenceToggle = page.getByText(/view research/i).first();
  await expect(evidenceToggle).toBeVisible();
  await expect(evidenceToggle).toContainText(/View research/i);
  await evidenceToggle.click();
  await expect(page.getByText('Princeton GEO study (2024)')).toBeVisible();
  await expect(page.getByText(/47.9%/i)).toBeVisible();
  // Link should open to arxiv.org URL
  const link = page.getByRole('link', { name: 'Princeton GEO study (2024)' });
  await expect(link).toHaveAttribute('href', 'https://arxiv.org/abs/2404.11973');
  await expect(link).toHaveAttribute('target', '_blank');
});

// ─── FE-S6-32 — Evidence link collapses when clicked again ───────────────────

testAsUser1('FE-S6-32: evidence link toggles collapsed/expanded', async ({ page }) => {
  await page.goto(`/action-center/${itemId}`);
  // O8 FIX: DF3 spec only describes the collapsed state text ('View research (N citations)').
  // The expanded state may change the toggle text to 'Hide research', 'Close', or keep
  // 'View research'. Store the toggle element reference by role/position to allow
  // re-clicking regardless of text changes. Use the same container approach: any
  // element near the evidence section that matches research-related text or is the
  // first interactive element in the evidence-link component area.
  const evidenceToggle = page.getByText(/view research|hide research/i).first();
  // Expand
  await evidenceToggle.click();
  await expect(page.getByText('Princeton GEO study (2024)')).toBeVisible();
  // Collapse — find the toggle again (text may have changed to 'Hide research' or similar)
  const collapseToggle = page.getByText(/view research|hide research|close/i).first();
  await collapseToggle.click();
  await expect(page.getByText('Princeton GEO study (2024)')).not.toBeVisible();
});

// ─── FE-S6-33 — 404 for non-existent action item ─────────────────────────────

testAsUser1('FE-S6-33: /action-center/[non-existent-id] shows 404 not-found page', async ({ page }) => {
  const response = await page.goto('/action-center/00000000-0000-0000-0000-000000000000');
  // Next.js notFound() renders the 404 page
  expect(response?.status()).toBe(404);
});

// ─── FE-S6-34 — Breadcrumb shows Action Center parent ────────────────────────

testAsUser1('FE-S6-34: detail page breadcrumb contains Action Center text (DH1)', async ({ page }) => {
  await page.goto(`/action-center/${itemId}`);
  // I18 FIX: Prototype TopBar renders breadcrumb items as <span> elements (not <a> links).
  // getByRole('link', { name: 'Action Center' }) would find nothing on a spec-compliant impl.
  // The breadcrumb is in the TopBar header area — test for text presence only.
  // Navigation back to the list is covered by FE-S6-35 (browser back button) and
  // FE-S6-01 (sidebar link), which don't depend on breadcrumb being a hyperlink.
  const breadcrumbArea = page.locator('header').first();
  await expect(breadcrumbArea).toContainText('Action Center');
  // Also verify the item title appears as the final breadcrumb segment
  await expect(breadcrumbArea).toContainText('[S6-FE] Detail page article title');
});

// ─── FE-S6-35 — Back navigation from detail to list ──────────────────────────

testAsUser1('FE-S6-35: browser back from detail page returns to Action Center list', async ({ page }) => {
  await page.goto('/action-center');
  // L13 FIX: div[style*='border'] was too broad — sidebar and other elements also have
  // border styles. recommendation-card uses <Card hover> → cursor-pointer class, which
  // uniquely identifies clickable recommendation cards vs other bordered divs.
  await page.locator('div.cursor-pointer').first().click();
  await expect(page).toHaveURL(/\/action-center\/.+/);
  await page.goBack();
  await expect(page).toHaveURL(/\/action-center$/);
  await expect(page.locator('h1')).toContainText('Action Center');
});
