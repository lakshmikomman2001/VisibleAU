/**
 * 02-verticals-browser.spec.ts
 *
 * Sprint 5 vertical pack browser — /verticals page.
 * FE-S5-13 through FE-S5-22.
 *
 * C7 FIX: PackBrowser uses ONE shared renderCard function for both wizard and browser modes.
 * BROWSER_PAGE selectors use 'pack-card-X' (same prefix as WIZARD) not 'browser-pack-card-X'.
 */

import { test, expect } from '@playwright/test';
import { gotoAuthenticated } from './helpers/auth';
import { getProductionPack, seedOrganization, seedUser, deleteTestDataForOrg } from './helpers/db';
import { BROWSER_PAGE } from './helpers/selectors';

const ENV = {
  clerkOrgId:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email:       process.env.E2E_TEST_USER_1_EMAIL      ?? '',
};

let orgId = '';

test.beforeAll(async () => {
  const org = await seedOrganization({ clerkOrgId: ENV.clerkOrgId });
  orgId = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId, organizationId: orgId, email: ENV.email });
});

test.afterAll(async () => {
  await deleteTestDataForOrg(orgId);
});

test('FE-S5-13: /verticals page is reachable and shows "Vertical packs" heading', async ({ page }) => {
  await gotoAuthenticated(page, '/verticals');
  await expect(page.locator(BROWSER_PAGE.heading)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(BROWSER_PAGE.heading)).toContainText('Vertical packs');
});

test('FE-S5-14: subtitle contains "3 active" and "v1.1" references (CJ3 fix)', async ({ page }) => {
  await gotoAuthenticated(page, '/verticals');
  await expect(page.locator(BROWSER_PAGE.subtitle)).toBeVisible({ timeout: 10_000 });
  const subtitle = await page.locator(BROWSER_PAGE.subtitle).textContent();
  expect(subtitle).toMatch(/3\s*active/i);
  expect(subtitle).toMatch(/v1\.1/i);
});

test('FE-S5-15: exactly 8 pack cards shown (3 active + 2 coming-v1.1 + 3 coming-soon)', async ({ page }) => {
  await gotoAuthenticated(page, '/verticals');
  await expect(page.locator(BROWSER_PAGE.packCard('tradies'))).toBeVisible({ timeout: 10_000 });
  // C7: allCards uses unified 'pack-card-' prefix matching the shared renderCard testid
  await expect(page.locator(BROWSER_PAGE.allCards)).toHaveCount(8);
});

test('FE-S5-16: Tradies, SaaS, Allied Health cards show "Active" badge and prompt counts', async ({ page }) => {
  await gotoAuthenticated(page, '/verticals');
  await expect(page.locator(BROWSER_PAGE.packCard('tradies'))).toBeVisible({ timeout: 10_000 });
  for (const [name, count] of [['tradies', 124], ['saas', 108], ['allied-health', 104]] as const) {
    const card = page.locator(BROWSER_PAGE.packCard(name));
    await expect(card).toContainText('Active');
    await expect(card).toContainText(String(count));
    await expect(card).toContainText('prompts');
  }
});

test('FE-S5-17: Professional Services and Real Estate show "Coming v1.1" badge', async ({ page }) => {
  await gotoAuthenticated(page, '/verticals');
  await expect(page.locator(BROWSER_PAGE.packCard('tradies'))).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(BROWSER_PAGE.packCard('professional-services'))).toContainText('Coming v1.1');
  await expect(page.locator(BROWSER_PAGE.packCard('real-estate'))).toContainText('Coming v1.1');
});

test('FE-S5-18: Exactly 3 coming-soon badges rendered (Hospitality, Retail, Beauty)', async ({ page }) => {
  await gotoAuthenticated(page, '/verticals');
  await expect(page.locator(BROWSER_PAGE.packCard('tradies'))).toBeVisible({ timeout: 10_000 });
  const comingSoonBadges = page.locator('text=Coming soon');
  await expect(comingSoonBadges.first()).toBeVisible({ timeout: 5_000 });
  await expect(comingSoonBadges).toHaveCount(3);
});

test('FE-S5-19: clicking Tradies card navigates to /verticals/[packId]', async ({ page }) => {
  const tradiesPack = await getProductionPack('tradies');
  expect(tradiesPack).not.toBeNull();
  await gotoAuthenticated(page, '/verticals');
  await expect(page.locator(BROWSER_PAGE.packCard('tradies'))).toBeVisible({ timeout: 10_000 });
  await page.locator(BROWSER_PAGE.packCard('tradies')).click();
  await page.waitForURL(`**/verticals/${tradiesPack!.id}`, { timeout: 10_000 });
  expect(page.url()).toContain(`/verticals/${tradiesPack!.id}`);
});

test('FE-S5-20: clicking a coming-soon card does NOT navigate away from /verticals', async ({ page }) => {
  await gotoAuthenticated(page, '/verticals');
  await expect(page.locator(BROWSER_PAGE.packCard('tradies'))).toBeVisible({ timeout: 10_000 });
  const currentURL = page.url();
  const comingSoonCard = page.locator(BROWSER_PAGE.allCards).filter({
    has: page.locator('text=Coming soon'),
  }).first();
  await expect(comingSoonCard).toBeVisible();
  await comingSoonCard.click();
  await page.waitForTimeout(1000);
  expect(page.url()).toBe(currentURL);
});

test('FE-S5-21: info banner is visible at the bottom of the packs grid', async ({ page }) => {
  await gotoAuthenticated(page, '/verticals');
  await expect(page.locator(BROWSER_PAGE.heading)).toBeVisible({ timeout: 10_000 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator(BROWSER_PAGE.infoBanner)).toBeVisible({ timeout: 5_000 });
  const bannerText = await page.locator(BROWSER_PAGE.infoBanner).textContent();
  expect(bannerText).toMatch(/updated|prompts|monthly/i);
});

test('FE-S5-22: unauthenticated access to /verticals redirects to /sign-in', async ({ page }) => {
  // Each test gets a fresh BrowserContext — no auth cookie from prior tests
  await page.goto(`${process.env.E2E_APP_URL ?? 'http://localhost:3000'}/verticals`);
  await page.waitForURL('**/sign-in**', { timeout: 10_000 });
  expect(page.url()).toContain('sign-in');
});
