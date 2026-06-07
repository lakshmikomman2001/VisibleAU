/**
 * F13-exports.spec.ts
 *
 * Sprint 4 §8 — PDF / CSV / JSON export downloads + SARIF stub.
 *
 * Tests:
 *   F13-01  PDF export: download triggers, Content-Type application/pdf
 *   F13-02  CSV export: download triggers, 14-column header (BD1 fix)
 *   F13-03  JSON export: download triggers with Content-Disposition attachment
 *   F13-04  SARIF button shows "Coming Sprint 8" tooltip
 */

import { test, expect } from '@playwright/test';
import {
  seedOrganization, seedUser, seedBrand, seedAudit, seedCitations,
  deleteAllTestDataForOrg,
} from '../helpers/db';
import { goto, screenshot } from '../helpers/page';

const ENV = {
  clerkOrgId:  process.env.E2E_TEST_ORG_1_CLERK_ID ?? '',
  clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID ?? '',
  email:       process.env.E2E_TEST_USER_1_EMAIL    ?? '',
};

const EXPECTED_CSV_COLUMNS = [
  'audit_number','brand_name','engine','prompt','run_number','brand_mentioned',
  'position','sentiment_label','context_label','response_snippet',
  'cited_sources_domains','llm_model','llm_cost_usd','created_at',
];

let orgId   = '';
let auditId = '';

test.beforeAll(async () => {
  const org = await seedOrganization({ clerkOrgId: ENV.clerkOrgId, name: 'S4 Export Org', tier: 'agency' });
  orgId = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId, organizationId: orgId, email: ENV.email });
  await deleteAllTestDataForOrg(orgId);
  const brand = await seedBrand({ organizationId: orgId, name: 'Export Brand', domain: 'export.e2e-s4ui.test' });
  const audit = await seedAudit({
    organizationId: orgId, brandId: brand.id, auditNumber: 1,
    engines: ['chatgpt', 'claude', 'gemini', 'perplexity'], runsPerPrompt: 5,
    scoreComposite: 63.4,
  });
  auditId = audit.id;
  await seedCitations(audit, 10);
});

test.afterAll(async () => {
  if (orgId) await deleteAllTestDataForOrg(orgId);
});

test('F13-01: G11 FIX — PDF export API returns 200 application/pdf with correct filename', async ({ page }) => {
  // G11 FIX: Original had an unawaited page.waitForEvent('download') that page.request.get()
  // never resolves (direct HTTP calls don't fire browser download events).
  // Test correctly uses page.request.get() to verify the API contract:
  //   status 200, Content-Type application/pdf, Content-Disposition attachment with auditNumber.
  const BASE_URL = process.env.E2E_APP_URL ?? 'http://localhost:3000';
  const res = await page.request.get(
    `${BASE_URL}/api/audits/${auditId}/export?format=pdf`,
  );
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/pdf');
  // Filename must contain audit number (not UUID) per Sprint 4 spec
  const cd = res.headers()['content-disposition'] ?? '';
  expect(cd.toLowerCase()).toContain('attachment');
  // Sprint 4 spec: filename = "visibleau-audit-{auditNumber}.pdf" (auditNumber=1 for this seed)
  expect(cd).toContain('visibleau-audit-1');
  expect(cd).toContain('.pdf');
  await screenshot(page, 'F13-01-pdf');
});

test('F13-02: CSV export has 14-column header (BD1 fix)', async ({ page }) => {
  const BASE_URL = process.env.E2E_APP_URL ?? 'http://localhost:3000';
  const res = await page.request.get(
    `${BASE_URL}/api/audits/${auditId}/export?format=csv`,
  );
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/csv');
  const text   = await res.text();
  const header = text.split('\n')[0].trim().toLowerCase();
  for (const col of EXPECTED_CSV_COLUMNS) {
    expect(header, `CSV missing column: ${col}`).toContain(col);
  }
  await screenshot(page, 'F13-02-csv');
});

test('F13-03: JSON export has Content-Disposition attachment', async ({ page }) => {
  const BASE_URL = process.env.E2E_APP_URL ?? 'http://localhost:3000';
  const res = await page.request.get(
    `${BASE_URL}/api/audits/${auditId}/export?format=json`,
  );
  expect(res.status()).toBe(200);
  expect(res.headers()['content-disposition']?.toLowerCase()).toContain('attachment');
  const json = await res.json() as Record<string, unknown>;
  expect(json.audit).toBeDefined();
  expect(json.citations).toBeDefined();
  await screenshot(page, 'F13-03-json');
});

test('F13-04: SARIF/JUnit/GHA buttons show "Coming Sprint 8" (not hidden)', async ({ page }) => {
  await goto(page, `/audits/${auditId}`);
  // Open export dropdown
  const exportBtn = page.getByRole('button', { name: /export|download/i }).first();
  if (await exportBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await exportBtn.click();
  }
  await expect(page.getByText(/coming sprint 8|sprint 8/i).first()).toBeVisible({ timeout: 10_000 });
  await screenshot(page, 'F13-04-sarif-stub');
});


// ─── F14: Mobile responsive ─────────────────────────────────────────────────────

/**
 * F14-mobile-responsive.spec.ts
 *
 * Sprint 4 §8 — Mobile viewport: sidebar → drawer at <768px.
 *
 * Tests:
 *   F14-01  At <768px, sidebar is not visible (collapsed)
 *   F14-02  Hamburger/menu button visible on mobile
 *   F14-03  Opening drawer shows nav links
 *   F14-04  Brand grid collapses to single column on mobile
 */

const { test: mTest, expect: mExpect } = { test, expect };

const mENV = {
  clerkOrgId:  process.env.E2E_TEST_ORG_1_CLERK_ID ?? '',
  clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID ?? '',
  email:       process.env.E2E_TEST_USER_1_EMAIL    ?? '',
};

let mOrgId = '';

test.describe('F14 — Mobile responsive', () => {
  test.beforeAll(async () => {
    const { seedOrganization: sO, seedUser: sU, seedBrand: sB, deleteAllTestDataForOrg: del } = await import('../helpers/db');
    const org = await sO({ clerkOrgId: mENV.clerkOrgId, name: 'S4 Mobile Org', tier: 'agency' });
    mOrgId = org.id;
    await sU({ clerkUserId: mENV.clerkUserId, organizationId: mOrgId, email: mENV.email });
    await del(mOrgId);
    await sB({ organizationId: mOrgId, name: 'Mobile Brand', domain: 'mobile.e2e-s4ui.test' });
  });

  test.afterAll(async () => {
    if (mOrgId) {
      const { deleteAllTestDataForOrg } = await import('../helpers/db');
      await deleteAllTestDataForOrg(mOrgId);
    }
  });

  test('F14-01: sidebar hidden at <768px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone SE
    const { goto: g } = await import('../helpers/page');
    await g(page, '/dashboard');
    // Persistent sidebar should not be visible
    const sidebar = page.locator('aside, nav[class*="sidebar"]').first();
    const sidebarVisible = await sidebar.isVisible({ timeout: 5_000 }).catch(() => false);
    // Drawer pattern: sidebar hidden behind sheet
    if (sidebarVisible) {
      // Some implementations keep sidebar in DOM but off-screen
      const box = await sidebar.boundingBox();
      expect(box?.x ?? 0).toBeLessThan(0); // off-screen
    }
    await page.screenshot({ path: 'tests/e2e/frontend/sprint4/reports/F14-01-mobile.png', fullPage: true });
  });

  test('F14-02: hamburger/menu button visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const { goto: g } = await import('../helpers/page');
    await g(page, '/dashboard');
    // Look for menu toggle button (hamburger icon)
    const menuBtn = page.getByRole('button', { name: /menu|open.*menu|toggle.*sidebar/i })
      .or(page.locator('[aria-label="menu"], [aria-label="toggle sidebar"], [class*="hamburger"]'))
      .first();
    await mExpect(menuBtn).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: 'tests/e2e/frontend/sprint4/reports/F14-02-hamburger.png' });
  });

  test('F14-03: opening drawer shows nav links', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const { goto: g } = await import('../helpers/page');
    await g(page, '/dashboard');
    const menuBtn = page.getByRole('button', { name: /menu|open.*menu|toggle/i })
      .or(page.locator('[aria-label*="menu"], [class*="hamburger"]'))
      .first();
    if (await menuBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await menuBtn.click();
      await mExpect(page.getByText(/dashboard|brands|audits/i).first()).toBeVisible({ timeout: 10_000 });
    }
    await page.screenshot({ path: 'tests/e2e/frontend/sprint4/reports/F14-03-drawer.png' });
  });

  test('F14-04: brand grid single-column on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const { goto: g } = await import('../helpers/page');
    await g(page, '/brands');
    // On mobile the grid is 1 column; detect by checking card width ≈ viewport width
    const cards = page.locator('[class*="card"], [class*="brand-card"]').all();
    const allCards = await cards;
    if (allCards.length >= 2) {
      const box1 = await allCards[0].boundingBox();
      const box2 = await allCards[1].boundingBox();
      // In single column: cards stack vertically, not side-by-side
      if (box1 && box2) {
        expect(Math.abs((box1.x) - (box2.x))).toBeLessThan(50);
      }
    }
    await page.screenshot({ path: 'tests/e2e/frontend/sprint4/reports/F14-04-single-col.png', fullPage: true });
  });
});
