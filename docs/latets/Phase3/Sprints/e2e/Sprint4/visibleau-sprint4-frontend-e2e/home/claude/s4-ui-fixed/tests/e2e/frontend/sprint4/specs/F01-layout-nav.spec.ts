/**
 * F01-layout-nav.spec.ts
 *
 * Sprint 4 §8 — Dashboard layout: sidebar, topbar, breadcrumbs.
 *
 * Tests:
 *   F01-01  Sidebar visible on desktop (≥1024px)
 *   F01-02  Sidebar contains all required nav links
 *   F01-03  Workspace group: Dashboard, Brands, Audits, Portfolio
 *   F01-04  Portfolio nav item present (BB4 fix — was missing from sidebar)
 *   F01-05  Breadcrumb shows "Workspace" segment on dashboard
 *   F01-06  Sidebar nav link → correct URL navigation
 *   F01-07  Unauthenticated → redirects to /sign-in
 */

import { test, expect } from '@playwright/test';
import { seedOrganization, seedUser, seedBrand, deleteAllTestDataForOrg } from '../helpers/db';
import { goto, expectBreadcrumb, screenshot } from '../helpers/page';

const ENV = {
  clerkOrgId:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email:       process.env.E2E_TEST_USER_1_EMAIL      ?? '',
};

let orgId = '';

test.beforeAll(async () => {
  const org = await seedOrganization({ clerkOrgId: ENV.clerkOrgId, name: 'S4 Layout Org', tier: 'agency' });
  orgId = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId, organizationId: orgId, email: ENV.email });
  await deleteAllTestDataForOrg(orgId);
  // Seed 1 brand so dashboard does NOT redirect to /brands/wizard
  await seedBrand({ organizationId: orgId, name: 'Layout Test Brand', domain: 'layout.e2e-s4ui.test' });
});

test.afterAll(async () => {
  if (orgId) await deleteAllTestDataForOrg(orgId);
});

test('F01-01: sidebar visible on desktop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await goto(page, '/dashboard');
  // Sidebar is a persistent nav at ≥1024px — look for the nav element
  const sidebar = page.locator('nav, aside, [class*="sidebar"]').first();
  await expect(sidebar).toBeVisible({ timeout: 15_000 });
  await screenshot(page, 'F01-01-sidebar');
});

test('F01-02: sidebar contains required nav sections', async ({ page }) => {
  await goto(page, '/dashboard');
  // Check for key nav labels from the sprint 4 sidebar groups spec
  await expect(page.getByRole('link', { name: /dashboard/i }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /brands/i }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /audits/i }).first()).toBeVisible();
});

test('F01-03: workspace nav group has Dashboard, Brands, Audits, Portfolio', async ({ page }) => {
  await goto(page, '/dashboard');
  const nav = page.locator('nav, aside').first();
  for (const label of ['Dashboard', 'Brands', 'Audits', 'Portfolio']) {
    await expect(nav.getByText(label, { exact: false })).toBeVisible({ timeout: 10_000 });
  }
});

test('F01-04: Portfolio link present in sidebar (BB4 fix)', async ({ page }) => {
  // BB4 fix: Portfolio was absent from sidebar groups before v1.7. Must appear.
  await goto(page, '/dashboard');
  const portfolioLink = page.getByRole('link', { name: /portfolio/i }).first();
  await expect(portfolioLink).toBeVisible({ timeout: 10_000 });
});

test('F01-05: breadcrumb shows "Workspace" segment on dashboard', async ({ page }) => {
  await goto(page, '/dashboard');
  await expectBreadcrumb(page, /workspace/i);
  await screenshot(page, 'F01-05-breadcrumb');
});

test('F01-06: clicking Brands nav link navigates to /brands', async ({ page }) => {
  await goto(page, '/dashboard');
  await page.getByRole('link', { name: /brands/i }).first().click();
  await expect(page).toHaveURL(/\/brands/, { timeout: 15_000 });
});

test('F01-07: unauthenticated access redirects to sign-in', async ({ browser }) => {
  const context = await browser.newContext(); // no storageState → unauthenticated
  const page = await context.newPage();
  await page.goto(`${process.env.E2E_APP_URL}/dashboard`);
  await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });
  await context.close();
});
