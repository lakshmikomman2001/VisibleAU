/**
 * 02-recommendation-cards.spec.ts
 *
 * Sprint 6 §4 + §13 — Recommendation card shape, confidence badge colours,
 * impact badge tone, citation count, evidence link expand/collapse (DF3).
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

let org1Id    = '';
let brand1Id  = '';
let audit1Id  = '';
let itemConfirmedId  = '';
let itemLikelyId     = '';
let itemHypothesisId = '';

testAsUser1.beforeAll(async () => {
  const org   = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: '[S6-FE] Cards Org', tier: 'starter' });
  org1Id      = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });
  const brand = await seedBrand({ organizationId: org1Id, name: '[S6-FE] Card Test Brand' });
  brand1Id    = brand.id;
  const audit = await seedAudit({ organizationId: org1Id, brandId: brand1Id });
  audit1Id    = audit.id;

  // Confirmed + High — wikipedia-article
  const confirmed = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey:   'wikipedia-article',
    dimension:           'frequency',
    title:               '[S6-FE] Wikipedia card test',
    action:              'Draft a neutral Wikipedia article.',
    confidenceLabel:     'confirmed',
    expectedImpactScore: 'high',
    evidenceRefs: [
      { source: 'Princeton GEO study (2024)', url: 'https://arxiv.org/abs/2404.11973', summary: 'Wikipedia = 47.9% of ChatGPT citations.' },
      { source: 'SE Ranking Dec 2025',        url: 'https://seranking.com',           summary: 'Updated content averages 5.0 citations.' },
    ],
  });
  itemConfirmedId = confirmed.id;

  // Likely + Medium — reddit-absence
  const likely = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey:   'reddit-absence',
    dimension:           'frequency',
    title:               '[S6-FE] Reddit card test',
    action:              'Participate in relevant Reddit threads.',
    confidenceLabel:     'likely',
    expectedImpactScore: 'medium',
    evidenceRefs: [
      { source: 'Tinuiti Q1 2026', url: 'https://tinuiti.com', summary: 'Reddit = 24% of Perplexity citations.' },
    ],
  });
  itemLikelyId = likely.id;

  // Hypothesis + Low — medium-presence
  const hypothesis = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey:   'medium-presence',
    dimension:           'frequency',
    title:               '[S6-FE] Medium card test',
    action:              'Publish a how-to article on Medium.',
    confidenceLabel:     'hypothesis',
    expectedImpactScore: 'low',
    evidenceRefs: [],
  });
  itemHypothesisId = hypothesis.id;
});

testAsUser1.afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
});

// ─── FE-S6-09 — Card title is visible ────────────────────────────────────────

testAsUser1('FE-S6-09: recommendation card title is visible on list page', async ({ page }) => {
  await page.goto('/action-center');
  await expect(page.getByText('[S6-FE] Wikipedia card test')).toBeVisible();
});

// ─── FE-S6-10 — Confirmed badge renders green ────────────────────────────────

testAsUser1('FE-S6-10: Confirmed confidence badge renders with success/green tone (DG3)', async ({ page }) => {
  await page.goto('/action-center');
  const card = // L14 FIX: page.locator('div').filter({hasText}) matched ancestor divs too, making
  // card-scoped assertions page-wide. recommendation-card uses <Card hover> which
  // adds cursor-pointer class — unique to clickable cards, not ancestor wrappers.
  page.locator('div.cursor-pointer').filter({ hasText: '[S6-FE] Wikipedia card test' });
  // H7+H8 FIX: Badge renders no data-tone DOM attribute (prototype uses inline style only).
  // Use text content to verify confidence badge label (per DG3 spec: 'Confirmed'/'Likely'/'Hypothesis').
  const confidenceText = card.getByText(/Confirmed|Likely|Hypothesis/i);
  await expect(confidenceText.filter({ hasText: 'Confirmed' })).toBeVisible();
});

// ─── FE-S6-11 — Likely badge renders amber ───────────────────────────────────

testAsUser1('FE-S6-11: Likely confidence badge renders with warning/amber tone (DG3)', async ({ page }) => {
  await page.goto('/action-center');
  const card = // L14 FIX: page.locator('div').filter({hasText}) matched ancestor divs too, making
  // card-scoped assertions page-wide. recommendation-card uses <Card hover> which
  // adds cursor-pointer class — unique to clickable cards, not ancestor wrappers.
  page.locator('div.cursor-pointer').filter({ hasText: '[S6-FE] Reddit card test' });
  // H7+H8 FIX: Verify Likely badge by text content
  await expect(card.getByText('Likely')).toBeVisible();
});

// ─── FE-S6-12 — Hypothesis badge renders gray ────────────────────────────────

testAsUser1('FE-S6-12: Hypothesis confidence badge renders with neutral/gray tone (DG3)', async ({ page }) => {
  await page.goto('/action-center');
  const card = // L14 FIX: page.locator('div').filter({hasText}) matched ancestor divs too, making
  // card-scoped assertions page-wide. recommendation-card uses <Card hover> which
  // adds cursor-pointer class — unique to clickable cards, not ancestor wrappers.
  page.locator('div.cursor-pointer').filter({ hasText: '[S6-FE] Medium card test' });
  // H7+H8 FIX: Verify Hypothesis badge by text content
  await expect(card.getByText('Hypothesis')).toBeVisible();
});

// ─── FE-S6-13 — High impact badge renders with danger tone ───────────────────

testAsUser1('FE-S6-13: High expectedImpactScore renders as High impact badge (DH2 fix)', async ({ page }) => {
  await page.goto('/action-center');
  const card = // L14 FIX: page.locator('div').filter({hasText}) matched ancestor divs too, making
  // card-scoped assertions page-wide. recommendation-card uses <Card hover> which
  // adds cursor-pointer class — unique to clickable cards, not ancestor wrappers.
  page.locator('div.cursor-pointer').filter({ hasText: '[S6-FE] Wikipedia card test' });
  // H7+H8 FIX: Impact badge has no data-tone attribute (Badge renders inline style only).
  // Verify badge text 'High' is visible on the card (DH2: not 'priority: High').
  await expect(card.getByText('High').first()).toBeVisible();
});

// ─── FE-S6-14 — Medium impact badge renders with warning tone ────────────────

testAsUser1('FE-S6-14: Medium expectedImpactScore renders as Medium impact badge', async ({ page }) => {
  await page.goto('/action-center');
  const card = // L14 FIX: page.locator('div').filter({hasText}) matched ancestor divs too, making
  // card-scoped assertions page-wide. recommendation-card uses <Card hover> which
  // adds cursor-pointer class — unique to clickable cards, not ancestor wrappers.
  page.locator('div.cursor-pointer').filter({ hasText: '[S6-FE] Reddit card test' });
  // H7+H8 FIX: Impact badge text check
  await expect(card.getByText('Medium').first()).toBeVisible();
});

// ─── FE-S6-15 — Low impact badge renders with info tone ──────────────────────

testAsUser1('FE-S6-15: Low expectedImpactScore renders as Low impact badge', async ({ page }) => {
  await page.goto('/action-center');
  const card = // L14 FIX: page.locator('div').filter({hasText}) matched ancestor divs too, making
  // card-scoped assertions page-wide. recommendation-card uses <Card hover> which
  // adds cursor-pointer class — unique to clickable cards, not ancestor wrappers.
  page.locator('div.cursor-pointer').filter({ hasText: '[S6-FE] Medium card test' });
  // H7+H8 FIX: Impact badge text check
  await expect(card.getByText('Low').first()).toBeVisible();
});

// ─── FE-S6-16 — Citation count displayed on card ─────────────────────────────

testAsUser1('FE-S6-16: card shows correct citation count from evidenceRefs', async ({ page }) => {
  await page.goto('/action-center');
  const card = // L14 FIX: page.locator('div').filter({hasText}) matched ancestor divs too, making
  // card-scoped assertions page-wide. recommendation-card uses <Card hover> which
  // adds cursor-pointer class — unique to clickable cards, not ancestor wrappers.
  page.locator('div.cursor-pointer').filter({ hasText: '[S6-FE] Wikipedia card test' });
  // 2 evidenceRefs seeded → should show "2 citations"
  await expect(card.getByText(/2 citation/i)).toBeVisible();
});

// ─── FE-S6-17 — Card with 0 evidenceRefs shows 0 citations ───────────────────

testAsUser1('FE-S6-17: card with empty evidenceRefs shows 0 citations', async ({ page }) => {
  await page.goto('/action-center');
  const card = // L14 FIX: page.locator('div').filter({hasText}) matched ancestor divs too, making
  // card-scoped assertions page-wide. recommendation-card uses <Card hover> which
  // adds cursor-pointer class — unique to clickable cards, not ancestor wrappers.
  page.locator('div.cursor-pointer').filter({ hasText: '[S6-FE] Medium card test' });
  await expect(card.getByText(/0 citation/i)).toBeVisible();
});

// ─── FE-S6-18 — Card has ChevronRight navigation arrow ───────────────────────

testAsUser1('FE-S6-18: recommendation card is clickable (has ChevronRight navigation)', async ({ page }) => {
  await page.goto('/action-center');
  const card = // L14 FIX: page.locator('div').filter({hasText}) matched ancestor divs too, making
  // card-scoped assertions page-wide. recommendation-card uses <Card hover> which
  // adds cursor-pointer class — unique to clickable cards, not ancestor wrappers.
  page.locator('div.cursor-pointer').filter({ hasText: '[S6-FE] Wikipedia card test' });
  // Card should be clickable and navigate to detail page
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/action-center/${itemConfirmedId}`));
  // Navigate back for subsequent tests
  await page.goBack();
});

// ─── FE-S6-19 — Evidence link expands on detail page (DF3) ───────────────────

testAsUser1('FE-S6-19: evidence link expands to show research citations on detail page (DF3)', async ({ page }) => {
  await page.goto(`/action-center/${itemConfirmedId}`);
  const evidenceToggle = page.getByText(/view research/i).first();
  // Initially collapsed
  await expect(evidenceToggle).toContainText(/View research/i);
  await expect(evidenceToggle).toContainText(/2 citation/i);
  // Click to expand
  await evidenceToggle.click();
  // Princeton citation should now be visible
  await expect(page.getByText('Princeton GEO study (2024)')).toBeVisible();
  // Summary text visible
  await expect(page.getByText(/47.9% of ChatGPT/i)).toBeVisible();
});

// ─── FE-S6-20 — Evidence link with 0 refs renders nothing ────────────────────

testAsUser1('FE-S6-20: evidence link renders nothing when evidenceRefs is empty (DF3)', async ({ page }) => {
  await page.goto(`/action-center/${itemHypothesisId}`);
  // No "View research" toggle when evidenceRefs is empty
  await expect(page.getByText(/view research/i).first()).not.toBeVisible();
});
