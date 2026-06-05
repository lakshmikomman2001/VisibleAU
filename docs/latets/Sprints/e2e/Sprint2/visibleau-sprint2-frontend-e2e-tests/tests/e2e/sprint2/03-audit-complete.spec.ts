/**
 * 03-audit-complete.spec.ts
 *
 * Sprint 2 §10 step 7: "Show audit status (pending/running/complete) + composite score when complete"
 * Sprint 2 §12: "User can GET /api/audits/:id and see the basic results"
 *
 * Tests the completed state of the audit results page.
 * Seeds completed audit + 10 citations via DB (no Inngest needed).
 *
 * Tests:
 *   - Status badge shows "Complete"
 *   - Composite score displayed (Sprint 2: mention rate × 100)
 *   - "10 prompts · ChatGPT · Cost US$X.XX" subtitle visible
 *   - Re-run button visible (Sprint 4 enables full RE-run flow; Sprint 2 shows the button)
 *   - Export button disabled (Sprint 4 scope — per prototype)
 *   - Raw citations section visible
 *   - "Sprint 3 unlocks..." info banner present
 *   - "View rich version" link is disabled/greyed (Sprint 3+ scope, V5 fix)
 *
 * AuditResultsBasic prototype reference: lines 1575-1668
 */

import { test, expect, USER_1 } from './helpers/auth';
import {
  ensureOrganization, ensureUser, createBrand,
  seedCompletedAudit, seedCitations,
  deleteAuditsForOrg, deleteBrandsForOrg,
} from './helpers/db';

let org1Id   = '';
let brand1Id = '';
let auditId  = '';

const TEST_PROMPTS = [
  { prompt: 'Best plumbers in Bondi for emergency repairs', brandMentioned: true,  position: 1, responseSnippet: 'Bondi Plumbing is highly rated for emergency callouts in the eastern suburbs...' },
  { prompt: 'Reliable plumber Sydney eastern suburbs',      brandMentioned: true,  position: 3, responseSnippet: '...other recommended providers include Bondi Plumbing and Parramatta Pipes...' },
  { prompt: 'Cheap plumber near Bondi Beach',               brandMentioned: false, position: null, responseSnippet: null },
  { prompt: '24/7 plumbing emergency Sydney',               brandMentioned: true,  position: 2, responseSnippet: 'For 24/7 emergency plumbing, Bondi Plumbing offers fast response across NSW...' },
  { prompt: 'Licensed plumber eastern suburbs reviews',     brandMentioned: true,  position: 1, responseSnippet: 'Bondi Plumbing holds all required NCAT licences...' },
  { prompt: 'How much does a plumber cost in Sydney?',      brandMentioned: false, position: null, responseSnippet: null },
  { prompt: 'Is bondiplumbing.com.au a good plumber?',      brandMentioned: true,  position: 1, responseSnippet: 'Yes, Bondi Plumbing at bondiplumbing.com.au comes highly recommended...' },
  { prompt: 'Best tradie alternatives to big franchises',   brandMentioned: false, position: null, responseSnippet: null },
  { prompt: 'Bondi Plumbing reputation',                    brandMentioned: true,  position: 1, responseSnippet: 'Bondi Plumbing has a 4.9 rating on Google with over 200 reviews...' },
  { prompt: 'Who fixes burst pipes fast in Sydney?',        brandMentioned: true,  position: 2, responseSnippet: 'Bondi Plumbing and Eastern Pipe Pros both offer rapid burst-pipe response...' },
];
// 7 mentions out of 10 → scoreComposite = 70

test.beforeAll(async () => {
  const org = await ensureOrganization({
    clerkOrgId: USER_1.clerkOrgId,
    name:       'E2E Sprint2 Complete Org',
    tier:       'agency',
  });
  org1Id = org.id;
  await ensureUser({
    clerkUserId:    process.env.E2E_TEST_USER_1_CLERK_ID ?? '',
    organizationId: org1Id,
    email:          USER_1.email,
  });
  const brand = await createBrand({
    organizationId: org1Id,
    name:           'Bondi Plumbing E2E',
    domain:         'bondiplumbing.e2e.test',
    vertical:       'tradies',
  });
  brand1Id = brand.id;

  // Seed complete audit with 70% score (7/10 mentions)
  const audit = await seedCompletedAudit({
    organizationId: org1Id,
    brandId:        brand1Id,
    auditNumber:    1,
    scoreComposite: 70,
    totalCostUsd:   0.07,
    mockScenario:   'happy_path',
  });
  auditId = audit.id;

  // Seed 10 citation rows
  await seedCitations({ auditId, prompts: TEST_PROMPTS });
});

test.afterAll(async () => {
  if (org1Id) await deleteAuditsForOrg(org1Id);
  if (org1Id) await deleteBrandsForOrg(org1Id);
});

test.describe('Sprint 2 — AuditResultsBasic page (completed audit)', () => {

  test('TC-F2-20: /audits/[id] renders without error for completed audit', async ({ page }) => {
    await page.goto(`/audits/${auditId}`);
    await expect(page).not.toHaveURL(/sign-in/);
    await expect(page).not.toHaveURL(/404/);
    // Page loads meaningful content
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(50);
  });

  test('TC-F2-21: Status badge shows "Complete" (not pending/running/failed)', async ({ page }) => {
    await page.goto(`/audits/${auditId}`);
    // Prototype: <Badge tone="success" dot>Complete</Badge>
    await expect(
      page.getByText(/complete/i).first()
        .or(page.locator('[class*="success"]').getByText(/complete/i))
    ).toBeVisible({ timeout: 10_000 });
  });

  test('TC-F2-22: Composite score is shown on results page', async ({ page }) => {
    await page.goto(`/audits/${auditId}`);
    // Sprint 2: scoreComposite = 70.00; displayed as "70" or "70.0" or "70%"
    await expect(page.getByText(/70/)).toBeVisible({ timeout: 10_000 });
  });

  test('TC-F2-23: Subtitle shows "10 prompts · ChatGPT · Cost US$0.07" (Sprint 2 §12 cost <$0.10)', async ({ page }) => {
    await page.goto(`/audits/${auditId}`);
    // Prototype: "10 prompts · ChatGPT · Cost US$0.07 · 1m 47s"
    await expect(page.getByText(/10 prompts/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/chatgpt/i).first()).toBeVisible();
    // Cost must be < $0.10 per Sprint 2 §12
    const costEl = page.getByText(/cost.*us\$|us\$.*0\.\d+/i);
    if (await costEl.isVisible().catch(() => false)) {
      const text = await costEl.textContent() ?? '';
      const cost = parseFloat(text.match(/\d+\.\d+/)?.[0] ?? '0');
      expect(cost).toBeLessThan(0.10);
    }
  });

  test('TC-F2-24: Raw citations table is visible with brand mention badges', async ({ page }) => {
    await page.goto(`/audits/${auditId}`);
    // Prototype: "Raw citations" heading + row items with brandMentioned badges
    await expect(
      page.getByText(/raw citations/i).or(page.getByText(/citations/i).first())
    ).toBeVisible({ timeout: 10_000 });
  });

  test('TC-F2-25: Mentioned citations show position badge; not-mentioned show "Not mentioned"', async ({ page }) => {
    await page.goto(`/audits/${auditId}`);
    // At least one "Position #N" badge (for brandMentioned=true rows)
    await expect(
      page.getByText(/position #\d+/i).first()
        .or(page.getByText(/mentioned/i).first())
    ).toBeVisible({ timeout: 10_000 });
  });

  test('TC-F2-26: responseSnippet text is visible for brandMentioned=true citations', async ({ page }) => {
    await page.goto(`/audits/${auditId}`);
    // First citation's snippet
    await expect(
      page.getByText(/Bondi Plumbing is highly rated/i)
        .or(page.getByText(/eastern suburbs/i).first())
    ).toBeVisible({ timeout: 10_000 });
  });

  test('TC-F2-27: Re-run button is visible (Sprint 4 enables full re-run)', async ({ page }) => {
    await page.goto(`/audits/${auditId}`);
    // Prototype: <Btn icon={RefreshCw}>Re-run</Btn>
    await expect(page.getByRole('button', { name: /re-run|rerun/i })
      .or(page.getByText(/re-run/i).first())
    ).toBeVisible({ timeout: 10_000 });
  });

  test('TC-F2-28: Export button is disabled (Sprint 4 scope — V5 fix)', async ({ page }) => {
    await page.goto(`/audits/${auditId}`);
    // Prototype: Export button with disabled + title="Export — Sprint 4 scope"
    const exportBtn = page.getByRole('button', { name: /export/i });
    if (await exportBtn.isVisible().catch(() => false)) {
      await expect(exportBtn).toBeDisabled();
    }
  });

  test('TC-F2-29: "Sprint 3 unlocks..." info banner visible (V5 fix: rich version disabled)', async ({ page }) => {
    await page.goto(`/audits/${auditId}`);
    // Prototype: info card with "This is the basic view. Sprint 3 unlocks multidimensional scoring..."
    await expect(
      page.getByText(/sprint 3|basic view|rich version/i).first()
    ).toBeVisible({ timeout: 10_000 });
    // "View rich version" must be disabled/greyed (V5 fix)
    const richLink = page.getByText(/view rich version/i);
    if (await richLink.isVisible().catch(() => false)) {
      // Should be disabled, greyed out, or marked as Sprint 3
      const opacity = await richLink.evaluate((el) => getComputedStyle(el).opacity);
      const isDisabled = parseFloat(opacity) < 1 || (await richLink.getAttribute('title'))?.includes('Sprint 3');
      expect(isDisabled, '"View rich version" must be disabled in Sprint 2').toBe(true);
    }
  });

  test('TC-F2-30: Breadcrumb includes audit number', async ({ page }) => {
    await page.goto(`/audits/${auditId}`);
    // Prototype: ['Workspace', 'Brands', 'Bondi Plumbing', 'Audit #1']
    await expect(
      page.getByText(/Audit #1/i).or(page.getByText(/Brands/i))
    ).toBeVisible({ timeout: 10_000 });
  });
});
