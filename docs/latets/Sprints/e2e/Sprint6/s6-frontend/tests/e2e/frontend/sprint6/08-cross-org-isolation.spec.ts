/**
 * 08-cross-org-isolation.spec.ts
 *
 * Sprint 6 §13 — Cross-org action item URL shows 404 not-found.
 * Org 2 user cannot view Org 1 action items in browser.
 *
 * H4 FIX: Separated from the combined 07-09 file. testAsUser2 hooks run
 * independently in this file without interleaving with testAsUser1 hooks.
 */
import { testAsUser2, expect } from './fixtures';
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
let itemId   = '';

testAsUser2.beforeAll(async () => {
  // Org 1: item belongs here (seeded for cross-org check)
  const org1   = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: '[S6-FE] CrossOrg Org1', tier: 'starter' });
  org1Id       = org1.id;
  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });
  const brand1 = await seedBrand({ organizationId: org1Id, name: '[S6-FE] CrossOrg Brand1' });
  const audit1 = await seedAudit({ organizationId: org1Id, brandId: brand1.id });
  const item   = await seedActionItem({
    organizationId: org1Id, brandId: brand1.id, auditId: audit1.id,
    recommendationKey: 'wikipedia-article', title: '[S6-FE] Org1 private item',
    action: 'Org1 private action.', confidenceLabel: 'confirmed', expectedImpactScore: 'high',
  });
  itemId = item.id;

  // Org 2: User 2 belongs here
  const org2   = await seedOrganization({ clerkOrgId: ENV.clerkOrgId2, name: '[S6-FE] CrossOrg Org2', tier: 'starter' });
  org2Id       = org2.id;
  await seedUser({ clerkUserId: ENV.clerkUserId2, organizationId: org2Id, email: ENV.email2 });
});

testAsUser2.afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
  await deleteTestDataForOrg(org2Id);
});

// ─── FE-S6-51 — Cross-org detail returns 404 ─────────────────────────────────

testAsUser2('FE-S6-51: cross-org /action-center/[id] shows 404 not-found page (RLS)', async ({ page }) => {
  const response = await page.goto(`/action-center/${itemId}`);
  expect(response?.status()).toBe(404);
});

// ─── FE-S6-52 — Cross-org list excludes other org items ──────────────────────

testAsUser2('FE-S6-52: Org 2 action-center list does not show Org 1 items (RLS)', async ({ page }) => {
  await page.goto('/action-center');
  await expect(page.getByText('[S6-FE] Org1 private item')).not.toBeVisible();
});
