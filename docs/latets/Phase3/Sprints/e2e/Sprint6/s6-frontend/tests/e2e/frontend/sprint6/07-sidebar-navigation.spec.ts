/**
 * 07-sidebar-navigation.spec.ts
 *
 * Sprint 6 §11 (DI2/DI5/DK2) — Sidebar Action Center entry is active,
 * uses Sparkles icon, has no "Sprint 6" placeholder badge (DI5 fix).
 *
 * H4 FIX: Separated from the combined 07-09 file. Mixing testAsUser1, testAsUser2,
 * and baseTest at file scope causes Playwright to interleave their beforeAll/afterAll
 * hooks unpredictably. Each fixture group must live in its own spec file.
 */
import { testAsUser1, expect } from './fixtures';
import {
  seedOrganization, seedUser, deleteTestDataForOrg,
} from './db';

const ENV = {
  clerkOrgId1:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId1: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email1:       process.env.E2E_TEST_USER_1_EMAIL     ?? '',
};

let org1Id = '';

testAsUser1.beforeAll(async () => {
  const org = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: '[S6-FE] Sidebar Org', tier: 'starter' });
  org1Id    = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });
});

testAsUser1.afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
});

// ─── FE-S6-48 — Sidebar shows Action Center link ──────────────────────────────

testAsUser1('FE-S6-48: sidebar shows Action Center link with correct label (DI2 fix)', async ({ page }) => {
  await page.goto('/dashboard');
  const link = page.locator('nav a[href="/action-center"]');
  await expect(link).toBeVisible();
  await expect(link).toContainText('Action Center');
});

// ─── FE-S6-49 — No Sprint 6 placeholder badge ────────────────────────────────

testAsUser1('FE-S6-49: sidebar Action Center link has no Sprint 6 badge (DI5 fix)', async ({ page }) => {
  await page.goto('/dashboard');
  const link = page.locator('nav a[href="/action-center"]');
  await expect(link).not.toContainText('Sprint 6');
});

// ─── FE-S6-50 — Clicking link navigates ──────────────────────────────────────

testAsUser1('FE-S6-50: clicking Action Center in sidebar navigates to /action-center', async ({ page }) => {
  await page.goto('/dashboard');
  await page.locator('nav a[href="/action-center"]').click();
  await expect(page).toHaveURL(/\/action-center$/);
});
