/**
 * F01 — Run Audit button (Sprint 3 regression)
 *
 * Verifies the Run Audit button on the brand detail page still works correctly
 * after the Sprint 3 multi-engine job expansion. Sprint 3 did NOT change the
 * button itself — this is a regression guard to confirm the UI entry point
 * still functions correctly with the expanded backend.
 *
 * TC-F01-01  "Run audit" button visible on brand detail page
 * TC-F01-02  Clicking it navigates to the AuditRunning screen (R4 fix: 4-engine subtitle)
 * TC-F01-03  POST /api/audits returns 201 + { auditId, auditNumber }
 * TC-F01-04  AuditRunning shows Sprint 3 multi-engine subtitle (Y4 fix)
 * TC-F01-05  AuditRunning subtitle mentions all 4 engines by name
 * TC-F01-06  AuditRunning subtitle mentions "200 LLM calls" (Sprint 3 vs Sprint 2's 10)
 * TC-F01-07  Unauthenticated user → redirect to sign-in when accessing brand page
 */

import {
  test, expect, assertEnvVars,
  ensureOrg1, createQABrand, deleteQAData,
} from '../helpers/setup';
import { test as base } from '@playwright/test';

let org1Id   = '';
let brand1Id = '';

base.beforeAll(async () => {
  assertEnvVars();
  const { orgId } = await ensureOrg1();
  org1Id = orgId;
  await deleteQAData(org1Id);
  brand1Id = await createQABrand(org1Id, 'F01');
});

base.afterAll(async () => {
  if (org1Id) await deleteQAData(org1Id);
});

test.describe('F01 — Run Audit Button: Sprint 3 regression', () => {

  test('TC-F01-01: "Run audit" button visible on brand detail page', async ({ page }) => {
    await page.goto(`/brands/${brand1Id}`);
    await expect(page).not.toHaveURL(/sign-in/);
    const btn = page.getByRole('button', { name: /run audit/i });
    await expect(btn).toBeVisible({ timeout: 12_000 });
  });

  test('TC-F01-02: Clicking "Run audit" navigates to AuditRunning screen', async ({ page }) => {
    await page.goto(`/brands/${brand1Id}`);
    const btn = page.getByRole('button', { name: /run audit/i });
    await expect(btn).toBeVisible({ timeout: 12_000 });
    await btn.click();
    await expect(page).toHaveURL(/\/audits\//, { timeout: 15_000 });
  });

  test('TC-F01-03: POST /api/audits returns 201 + { auditId, auditNumber }', async ({ page }) => {
    const postPromise = page.waitForResponse(
      r => r.url().includes('/api/audits') && r.request().method() === 'POST',
    );
    await page.goto(`/brands/${brand1Id}`);
    await page.getByRole('button', { name: /run audit/i }).click();
    const res  = await postPromise;
    expect(res.status()).toBe(201);
    const body = await res.json() as { auditId: string; auditNumber: number };
    expect(body.auditId).toBeTruthy();
    expect(body.auditNumber).toBeGreaterThan(0);
  });

  test('TC-F01-04: AuditRunning shows Sprint 3 subtitle (4 engines × 10 prompts × 5 runs)', async ({ page }) => {
    // Y4 fix: Sprint 3 = 4 engines × 10 prompts × 5 runs = 200 calls (was 10 calls in Sprint 2)
    await page.goto(`/brands/${brand1Id}`);
    await page.getByRole('button', { name: /run audit/i }).click();
    await expect(page).toHaveURL(/\/audits\//, { timeout: 15_000 });
    await expect(
      page.getByText(/200 LLM calls|4.6 minutes|Estimated 4/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test('TC-F01-05: AuditRunning subtitle mentions all 4 engine names (Sprint 3 R4 fix)', async ({ page }) => {
    await page.goto(`/brands/${brand1Id}`);
    await page.getByRole('button', { name: /run audit/i }).click();
    await expect(page).toHaveURL(/\/audits\//, { timeout: 15_000 });
    await expect(page.getByText(/ChatGPT/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Claude/i).first()).toBeVisible();
    await expect(page.getByText(/Gemini/i).first()).toBeVisible();
    await expect(page.getByText(/Perplexity/i).first()).toBeVisible();
  });

  test('TC-F01-06: AuditRunning subtitle says "200 LLM calls" not "10" (Sprint 3 expansion)', async ({ page }) => {
    await page.goto(`/brands/${brand1Id}`);
    await page.getByRole('button', { name: /run audit/i }).click();
    await expect(page).toHaveURL(/\/audits\//, { timeout: 15_000 });
    const bodyText = await page.locator('body').innerText({ timeout: 15_000 });
    expect(bodyText, 'Sprint 3 running screen must show 200 calls').toContain('200');
  });

  test('TC-F01-07: Unauthenticated user → redirect to sign-in', async ({ browser }) => {
    const ctx  = await browser.newContext({ baseURL: process.env.E2E_APP_URL ?? 'http://localhost:3000' });
    const page = await ctx.newPage();
    await page.goto(`/brands/${brand1Id}`);
    await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });
    await ctx.close();
  });
});
