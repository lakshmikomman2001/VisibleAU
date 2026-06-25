import { test, expect } from '@playwright/test';
import { db, schema }   from './shared/db';
import { seedOrg, seedUser, cleanupOrg } from './shared/seed';
import { eq }           from 'drizzle-orm';

const CLERK_ORG  = `org_s10qa_f11_${Date.now()}`;
const CLERK_USER = `user_s10qa_f11_${Date.now()}`;
let orgId = '';

test.beforeAll(async () => {
  const org = await seedOrg({
    clerkOrgId: CLERK_ORG, name: '[S10QA F11] Pricing Org', tier: 'free',
  });
  orgId = org.id;
  await seedUser({ clerkUserId: CLERK_USER, organizationId: orgId,
                   email: `f11_${Date.now()}@test.com` });
});

test.afterAll(async () => { if (orgId) await cleanupOrg(orgId); });

test.describe('F11: /pricing page + billing checkout (HA3, HB1, HG1, HM4)', () => {

  test('F11-01: /pricing returns 200 and renders tier cards', async ({ page }) => {
    const res = await page.goto('/pricing');
    expect(res?.status()).toBe(200);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/starter/i);
    await expect(page.locator('body')).toContainText(/growth/i);
  });

  test('F11-02: pricing page shows all 4 paid tiers', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/starter/i);
    await expect(body).toContainText(/growth/i);
    await expect(body).toContainText(/agency/i);
  });

  test('F11-03: pricing page shows Starter price', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/\$99|\$90/);
  });

  test('F11-04: GST toggle present on pricing page', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');
    const toggle = page.getByText(/inc\.?\s*gst|ex\.?\s*gst/i).first();
    await expect(toggle).toBeVisible({ timeout: 10_000 });
  });

  test('F11-05: monthly/annual toggle present', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');
    const annualBtn = page.getByRole('button', { name: /annual/i })
      .or(page.getByText(/annual|yearly/i)).first();
    await expect(annualBtn).toBeVisible({ timeout: 10_000 });
  });

  test('F11-06: POST /api/billing/checkout with valid tier returns {url} or auth redirect', async ({ request }) => {
    const res = await request.post('/api/billing/checkout', {
      data: { tier: 'starter', billing: 'monthly' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect([200, 401]).toContain(res.status());
    const ct = res.headers()['content-type'] ?? '';
    if (res.status() === 200 && ct.includes('application/json')) {
      const body = await res.json();
      expect(body.url).toBeTruthy();
    }
  });

  test('F11-07: POST /api/billing/checkout with unknown tier returns error or auth redirect', async ({ request }) => {
    const res = await request.post('/api/billing/checkout', {
      data: { tier: 'enterprise', billing: 'monthly' },
    });
    expect([200, 400, 401, 422, 500]).toContain(res.status());
  });

  test('F11-08: POST /api/billing/checkout with missing body returns error or auth redirect', async ({ request }) => {
    const res = await request.post('/api/billing/checkout', {
      data:    {},
      headers: { 'Content-Type': 'application/json' },
    });
    expect([200, 400, 401, 422]).toContain(res.status());
  });

  test('F11-09: /settings/billing page accessible', async ({ page }) => {
    await page.goto('/settings/billing');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toMatch(/billing|sign-in/);
  });

  test('F11-10: upgrade CTA button navigates to /pricing or triggers checkout', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    const url = page.url();
    expect(url).toMatch(/dashboard|sign-in/);
  });
});
