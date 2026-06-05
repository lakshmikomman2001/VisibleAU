/**
 * F08-audit-results-rich.spec.ts
 *
 * Sprint 4 §8 — AuditResultsRich: composite score, 5 dim cards, Wilson CIs, per-engine, export.
 *
 * Tests:
 *   F08-01  AuditResultsRich renders composite score (BC5c: runsPerPrompt≥5, engines.length>1)
 *   F08-02  5 dimension cards visible (frequency, position, sentiment, context, accuracy)
 *   F08-03  Wilson CI text visible on composite header
 *   F08-04  Per-engine breakdown cards: all 4 engines for paid audit
 *   F08-05  Export dropdown opens showing PDF/CSV/JSON options
 *   F08-06  SARIF/JUnit/GHA buttons show "Coming Sprint 8" tooltip (not hidden)
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

let orgId   = '';
let auditId = '';

test.beforeAll(async () => {
  const org = await seedOrganization({ clerkOrgId: ENV.clerkOrgId, name: 'S4 RichResults Org', tier: 'agency' });
  orgId = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId, organizationId: orgId, email: ENV.email });
  await deleteAllTestDataForOrg(orgId);

  const brand = await seedBrand({ organizationId: orgId, name: 'Rich Results Brand', domain: 'rich.e2e-s4ui.test' });
  // runsPerPrompt=5, engines.length=4 → isRich=true (BC5c)
  const audit = await seedAudit({
    organizationId: orgId, brandId: brand.id, auditNumber: 1,
    engines: ['chatgpt', 'claude', 'gemini', 'perplexity'], runsPerPrompt: 5,
    scoreComposite: 63.4,
    scoreConfidenceLow: 59.1, scoreConfidenceHigh: 67.7,
  });
  auditId = audit.id;
  await seedCitations(audit, 8);
});

test.afterAll(async () => {
  if (orgId) await deleteAllTestDataForOrg(orgId);
});

test('F08-01: AuditResultsRich shows composite score 63.4', async ({ page }) => {
  await goto(page, `/audits/${auditId}`);
  await expect(page.getByText(/63\.4|63\.40/i).first()).toBeVisible({ timeout: 15_000 });
  await screenshot(page, 'F08-01-rich-composite');
});

test('F08-02: 5 dimension cards visible (freq, pos, sentiment, context, accuracy)', async ({ page }) => {
  await goto(page, `/audits/${auditId}`);
  for (const dim of ['frequency', 'position', 'sentiment', 'context', 'accuracy']) {
    await expect(page.getByText(new RegExp(dim, 'i')).first()).toBeVisible({ timeout: 15_000 });
  }
  await screenshot(page, 'F08-02-dim-cards');
});

test('F08-03: Wilson CI text visible (95% CI: X — Y)', async ({ page }) => {
  await goto(page, `/audits/${auditId}`);
  // BG4: CI text below composite: "95% CI: 59.1 — 67.7"
  await expect(page.getByText(/95%.*CI|CI.*59\.1|CI.*67\.7|confidence.*interval/i).first()).toBeVisible({ timeout: 15_000 });
  await screenshot(page, 'F08-03-wilson-ci');
});

test('F08-04: 4 per-engine breakdown cards for paid audit', async ({ page }) => {
  await goto(page, `/audits/${auditId}`);
  for (const engine of ['ChatGPT', 'Claude', 'Gemini', 'Perplexity']) {
    await expect(page.getByText(new RegExp(engine, 'i')).first()).toBeVisible({ timeout: 15_000 });
  }
  await screenshot(page, 'F08-04-per-engine');
});

test('F08-05: export dropdown shows PDF, CSV, JSON options', async ({ page }) => {
  await goto(page, `/audits/${auditId}`);
  // Open export dropdown
  const exportBtn = page.getByRole('button', { name: /export|download/i }).first();
  await expect(exportBtn).toBeVisible({ timeout: 15_000 });
  await exportBtn.click();
  // PDF, CSV, JSON should be visible
  await expect(page.getByText(/pdf/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/csv/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/json/i).first()).toBeVisible({ timeout: 10_000 });
  await screenshot(page, 'F08-05-export-dropdown');
});

test('F08-06: SARIF/JUnit/GHA buttons show "Coming Sprint 8" (not hidden)', async ({ page }) => {
  await goto(page, `/audits/${auditId}`);
  const exportBtn = page.getByRole('button', { name: /export|download/i }).first();
  if (await exportBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await exportBtn.click();
  }
  // "Coming Sprint 8" must be visible on or near the stubbed buttons (not hidden)
  await expect(page.getByText(/coming sprint 8|sprint 8/i).first()).toBeVisible({ timeout: 10_000 });
  await screenshot(page, 'F08-06-sarif-stub');
});
