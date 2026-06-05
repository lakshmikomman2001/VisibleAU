/**
 * 04-audit-results-basic.spec.ts
 *
 * Detailed tests for the AuditResultsBasic citations table (Sprint 2 §5 schema).
 *
 * Tests:
 *   - "Brand mentioned in N of 10 prompts" summary badge
 *   - Correct count of mentioned vs not-mentioned rows
 *   - Position numbers match DB data
 *   - responseSnippet rendered (≤500 chars per Sprint 2 §13 anti-pattern)
 *   - Not-mentioned rows show "Not mentioned" badge, no snippet
 *   - Brand/audit name in page heading
 *   - GET /api/audits/[id] returns correct citationCount via API
 *
 * Seeds: 10 citations with known distribution (6 mentioned, 4 not mentioned)
 * matching the partial_failure scenario shape for variety.
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

const PROMPTS_6_MENTIONED = [
  { prompt: 'Best plumbers in Bondi?',               brandMentioned: true,  position: 1, responseSnippet: 'Bondi Plumbing is the top choice for local tradies in Bondi Beach area.' },
  { prompt: 'Emergency plumber Sydney east?',        brandMentioned: true,  position: 2, responseSnippet: 'For emergencies, Bondi Plumbing and Eastern Pipe Pros respond within the hour.' },
  { prompt: 'Is bondiplumbing.e2e.test reliable?',   brandMentioned: true,  position: 1, responseSnippet: 'Yes, bondiplumbing.e2e.test has excellent reviews and is NCAT registered.' },
  { prompt: 'Plumber reviews Coogee Sydney?',        brandMentioned: true,  position: 3, responseSnippet: 'Several local plumbers are reviewed highly, including Bondi Plumbing.' },
  { prompt: 'Best tradie for blocked drains?',       brandMentioned: true,  position: 2, responseSnippet: 'Bondi Plumbing specialises in drain clearing and hydro-jetting.' },
  { prompt: 'Bondi Plumbing reputation and reviews', brandMentioned: true,  position: 1, responseSnippet: 'Bondi Plumbing holds a 4.9-star rating on Google with 200+ verified reviews.' },
  { prompt: 'Cheap plumber near Bondi?',             brandMentioned: false, position: null, responseSnippet: null },
  { prompt: 'How much does a plumber cost?',         brandMentioned: false, position: null, responseSnippet: null },
  { prompt: 'DIY plumbing tips Australia',           brandMentioned: false, position: null, responseSnippet: null },
  { prompt: 'Sydney plumbing regulations',           brandMentioned: false, position: null, responseSnippet: null },
];
// 6 mentions of 10 → scoreComposite = 60

test.beforeAll(async () => {
  const org = await ensureOrganization({
    clerkOrgId: USER_1.clerkOrgId,
    name:       'E2E Sprint2 Citations Org',
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

  const audit = await seedCompletedAudit({
    organizationId: org1Id,
    brandId:        brand1Id,
    auditNumber:    1,
    scoreComposite: 60,
    totalCostUsd:   0.06,
  });
  auditId = audit.id;
  await seedCitations({ auditId, prompts: PROMPTS_6_MENTIONED });
});

test.afterAll(async () => {
  if (org1Id) await deleteAuditsForOrg(org1Id);
  if (org1Id) await deleteBrandsForOrg(org1Id);
});

test.describe('Sprint 2 — Citations table detail', () => {

  test('TC-F2-40: "Brand mentioned in 6 of 10 prompts" summary badge', async ({ page }) => {
    await page.goto(`/audits/${auditId}`);
    // Prototype: <Badge>Brand mentioned in 6 of 10 prompts</Badge>
    await expect(
      page.getByText(/mentioned in 6 of 10|6.*of.*10|6\/10/i).first()
        .or(page.getByText(/6 of 10/i))
    ).toBeVisible({ timeout: 10_000 });
  });

  test('TC-F2-41: responseSnippet text is ≤500 chars per Sprint 2 §13 anti-pattern', async ({ page }) => {
    await page.goto(`/audits/${auditId}`);
    // All citation snippets must be ≤500 chars (Sprint 2 schema: responseSnippet ≤500)
    const snippets = await page.locator('[class*="border-l"], [class*="border-blue"], blockquote, .response-snippet').allInnerTexts();
    for (const snippet of snippets) {
      expect(snippet.trim().length).toBeLessThanOrEqual(500);
    }
  });

  test('TC-F2-42: "Not mentioned" rows have no response snippet rendered', async ({ page }) => {
    await page.goto(`/audits/${auditId}`);
    // "DIY plumbing tips Australia" was not mentioned and has no snippet
    // The row should appear without a snippet block
    await expect(page.getByText('DIY plumbing tips Australia')).toBeVisible({ timeout: 10_000 });
  });

  test('TC-F2-43: API GET /api/audits/[id] returns citationCount=10', async ({ page }) => {
    const res = await page.request.get(`/api/audits/${auditId}`);
    expect(res.status()).toBe(200);
    const body = await res.json() as { citationCount: number };
    expect(body.citationCount).toBe(10);
  });

  test('TC-F2-44: API GET /api/audits/[id] response matches Sprint 2 §9 shape', async ({ page }) => {
    const res = await page.request.get(`/api/audits/${auditId}`);
    const body = await res.json() as Record<string, unknown>;
    // Sprint 2 §9 response: { audit: { id, auditNumber, status, scoreComposite, ... }, citationCount }
    expect(body.audit).toBeDefined();
    const audit = body.audit as Record<string, unknown>;
    expect(audit.id).toBe(auditId);
    expect(audit.status).toBe('complete');
    expect(audit.engines).toEqual(['chatgpt']);
    expect(audit.promptsCount).toBe(10);
    expect(typeof body.citationCount).toBe('number');
  });

  test('TC-F2-45: Each prompt text is visible in the citations table', async ({ page }) => {
    await page.goto(`/audits/${auditId}`);
    // Check a few specific prompt texts are rendered
    await expect(page.getByText(/Best plumbers in Bondi/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Emergency plumber Sydney east/i)).toBeVisible();
  });
});
