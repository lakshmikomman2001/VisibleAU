/**
 * helpers/setup.ts — Sprint 3 Claude Code UI QA
 *
 * Shared Playwright fixtures + DB seed/teardown helpers for all Sprint 3 feature specs.
 *
 * Provides:
 *   test            — authenticated as User 1 (Org 1, agency tier — 4 engines)
 *   testAsUser2     — authenticated as User 2 (Org 2, different org)
 *   assertEnvVars() — fails fast if required env vars are missing
 *   assertMockScenario(expected) — BC7 pattern: fails fast if MOCK_SCENARIO is wrong
 *   ensureOrg1()    — idempotent org + user seed for User 1 (agency tier)
 *   ensureOrg2()    — idempotent org + user seed for User 2 (free tier)
 *   createQABrand() — creates a [QA-S3] prefixed brand for this test run
 *   deleteQAData()  — hard-deletes all [QA-S3] audits + citations + brands for an org
 *   seedSprint3Audit() — DB-seeds a complete Sprint 3 audit with all dimension scores
 *   pollAuditStatus()  — polls GET /api/audits/[id] until status=complete|failed
 *   QA_PREFIX       — '[QA-S3]' brand name prefix for easy cleanup
 *
 * Sprint 3 key additions vs Sprint 2:
 *   - assertMockScenario() guard (BC7 pattern from Sprint 2 audit)
 *   - seedSprint3Audit() seeds all 5 dimension scores + CI bands for UI tests
 *     that don't need Inngest (F07 rich results page, F10 cross-org)
 *   - deleteQAData() also deletes canary_prompts (Sprint 3 new table) for Org 1
 */

import { test as base, expect }          from '@playwright/test';
import { clerk, clerkSetup }             from '@clerk/testing/playwright';
import { drizzle }                       from 'drizzle-orm/postgres-js';
import postgres                          from 'postgres';
import { eq, inArray }                   from 'drizzle-orm';
import * as schema                       from '../../db/schema';

export { expect };

// ─── Constants ────────────────────────────────────────────────────────────────
export const QA_PREFIX   = '[QA-S3]';
export const INNGEST_URL = 'http://localhost:8288';

// ─── Test users ───────────────────────────────────────────────────────────────
export const USER_1 = {
  email:      process.env.E2E_TEST_USER_EMAIL    ?? '',
  password:   process.env.E2E_TEST_USER_PASSWORD ?? '',
  clerkId:    process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID   ?? '',
};

export const USER_2 = {
  email:      process.env.E2E_TEST_USER_2_EMAIL    ?? '',
  password:   process.env.E2E_TEST_USER_2_PASSWORD ?? '',
  clerkId:    process.env.E2E_TEST_USER_2_CLERK_ID  ?? '',
  clerkOrgId: process.env.E2E_TEST_ORG_2_CLERK_ID   ?? '',
};

// ─── DB client (service-role — bypasses RLS) ──────────────────────────────────
const pgClient = postgres(process.env.DATABASE_URL!, { max: 1 });
export const db = drizzle(pgClient, { schema });

// ─── Env guard ────────────────────────────────────────────────────────────────
export function assertEnvVars(): void {
  const required = [
    'DATABASE_URL', 'CLERK_SECRET_KEY', 'E2E_APP_URL',
    'E2E_TEST_USER_EMAIL', 'E2E_TEST_USER_PASSWORD',
    'E2E_TEST_USER_1_CLERK_ID', 'E2E_TEST_ORG_1_CLERK_ID',
    'E2E_TEST_USER_2_CLERK_ID', 'E2E_TEST_ORG_2_CLERK_ID',
    'LLM_MODE',
  ];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) throw new Error(
    `Sprint 3 QA: missing .env.test.local vars:\n  ${missing.join('\n  ')}`
  );
  if (process.env.LLM_MODE !== 'mock')
    throw new Error('LLM_MODE must be "mock" for Sprint 3 QA. Set LLM_MODE=mock in .env.test.local');
}

/**
 * BC7 pattern: asserts MOCK_SCENARIO env matches the expected value.
 * getLLMService(engine) reads MOCK_SCENARIO env — NOT the POST body scenario field.
 * F04/F05/F06 each require a specific MOCK_SCENARIO and must be run via their individual bat.
 */
export function assertMockScenario(expected: string): void {
  const actual = process.env.MOCK_SCENARIO;
  if (actual !== expected) throw new Error(
    `This spec requires MOCK_SCENARIO=${expected} but got: ${actual ?? 'unset'}.\n` +
    `Run via the individual bat script which sets the correct MOCK_SCENARIO env.`
  );
}

// ─── DB seed helpers ──────────────────────────────────────────────────────────

export async function ensureOrg1(): Promise<{ orgId: string }> {
  let [org] = await db.select().from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, USER_1.clerkOrgId));
  if (!org) {
    [org] = await db.insert(schema.organizations).values({
      clerkOrgId: USER_1.clerkOrgId,
      name: 'E2E Sprint3 Org 1',
      region: 'au',
      tier: 'agency',  // paid tier → 4 engines in Sprint 3
    }).returning();
  }
  const [user] = await db.select().from(schema.users)
    .where(eq(schema.users.clerkUserId, USER_1.clerkId));
  if (!user) {
    await db.insert(schema.users).values({
      clerkUserId: USER_1.clerkId, organizationId: org.id,
      email: USER_1.email, name: 'E2E User 1', role: 'owner',
    });
  }
  return { orgId: org.id };
}

export async function ensureOrg2(): Promise<{ orgId: string }> {
  let [org] = await db.select().from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, USER_2.clerkOrgId));
  if (!org) {
    [org] = await db.insert(schema.organizations).values({
      clerkOrgId: USER_2.clerkOrgId,
      name: 'E2E Sprint3 Org 2',
      region: 'au',
      tier: 'free',  // free tier → 2 engines (chatgpt + perplexity)
    }).returning();
  }
  const [user] = await db.select().from(schema.users)
    .where(eq(schema.users.clerkUserId, USER_2.clerkId));
  if (!user) {
    await db.insert(schema.users).values({
      clerkUserId: USER_2.clerkId, organizationId: org.id,
      email: USER_2.email, name: 'E2E User 2', role: 'owner',
    });
  }
  return { orgId: org.id };
}

export async function createQABrand(orgId: string, suffix = ''): Promise<string> {
  const name = `${QA_PREFIX} Bondi Plumbing${suffix ? ' ' + suffix : ''}`;
  const [brand] = await db.insert(schema.brands).values({
    organizationId: orgId, name,
    domain:   'bondiplumbing.e2e.test',
    vertical: 'tradies', region: 'au',
    competitors: [], primaryRegions: [],
  }).returning();
  return brand.id;
}

/**
 * Seeds a Sprint 3 complete audit directly into the DB.
 * Used by specs that test the AuditResultsRich page without triggering an Inngest job.
 * All 5 dimension scores, CI bands, and per-engine data match prototype AA5 fix values.
 */
export async function seedSprint3Audit(data: {
  organizationId: string;
  brandId:        string;
  auditNumber:    number;
  scoreComposite?:       number;
  scoreFrequency?:       number;
  scorePosition?:        number;
  scoreSentiment?:       'positive' | 'neutral' | 'negative';
  scoreSentimentNumeric?: number;
  scoreContext?:         'recommended' | 'listed' | 'mentioned' | 'commodified';
  scoreContextNumeric?:  number;
  scoreAccuracy?:        number;
  scoreConfidenceLow?:   number;
  scoreConfidenceHigh?:  number;
  confidenceIntervals?:  Record<string, { lower: number; upper: number }>;
  engines?:              string[];
  engineCount?:          number;
  totalCalls?:           number;
  totalCostUsd?:         number;
  mockScenario?:         string;
}): Promise<string> {
  const engines = data.engines ?? ['chatgpt', 'claude', 'gemini', 'perplexity'];
  const engineCount = data.engineCount ?? engines.length;
  const runsPerPrompt = 5;
  const promptsCount  = 10;
  const totalCalls = data.totalCalls ?? engineCount * promptsCount * runsPerPrompt;

  const ci = data.confidenceIntervals ?? {
    frequency: { lower: 9,  upper: 20 },
    position:  { lower: 85, upper: 95 },
    sentiment: { lower: 73, upper: 85 },
    context:   { lower: 66, upper: 80 },
    accuracy:  { lower: 64, upper: 78 },
  };

  const composite = data.scoreComposite ?? 63.4;

  const [audit] = await db.insert(schema.audits).values({
    organizationId:       data.organizationId,
    brandId:              data.brandId,
    auditNumber:          data.auditNumber,
    triggeredBy:          'manual',
    status:               'complete',
    engines,
    engineCount,
    promptCount:          promptsCount,
    promptsCount:         promptsCount,
    runsPerPrompt,
    totalCalls,
    scoreComposite:       String(composite.toFixed(2)),
    scoreFrequency:       String((data.scoreFrequency ?? 14).toFixed(2)),
    scorePosition:        String((data.scorePosition  ?? 90).toFixed(2)),
    scoreSentiment:       data.scoreSentiment     ?? 'positive',  // TEXT label (AB1 fix)
    scoreSentimentNumeric: String((data.scoreSentimentNumeric ?? 79).toFixed(2)),
    scoreContext:         data.scoreContext        ?? 'recommended', // TEXT label (AB1 fix)
    scoreContextNumeric:  String((data.scoreContextNumeric  ?? 73).toFixed(2)),
    scoreAccuracy:        String((data.scoreAccuracy ?? 71).toFixed(2)),
    scoreConfidenceLow:   String((data.scoreConfidenceLow  ?? 59.1).toFixed(1)),
    scoreConfidenceHigh:  String((data.scoreConfidenceHigh ?? 67.7).toFixed(1)),
    confidenceIntervals:  ci,
    totalCostUsd:         String((data.totalCostUsd ?? 1.89).toFixed(4)),
    metadata:             { mockScenario: data.mockScenario ?? 'happy_path' },
    startedAt:            new Date(Date.now() - 252_000), // 4m 12s ago
    completedAt:          new Date(),
  }).returning();
  return audit.id;
}

export async function deleteQAData(orgId: string): Promise<void> {
  if (!orgId) return;
  const qaBrands = await db.select({ id: schema.brands.id })
    .from(schema.brands)
    .where(eq(schema.brands.organizationId, orgId));
  const brandIds = qaBrands.map(b => b.id);

  const orgAudits = await db.select({ id: schema.audits.id })
    .from(schema.audits)
    .where(eq(schema.audits.organizationId, orgId));
  if (orgAudits.length > 0) {
    const auditIds = orgAudits.map(a => a.id);
    await db.delete(schema.citations).where(inArray(schema.citations.auditId, auditIds));
  }
  await db.delete(schema.audits).where(eq(schema.audits.organizationId, orgId));
  if (brandIds.length > 0) {
    await db.delete(schema.brands).where(inArray(schema.brands.id, brandIds));
  }
}

// ─── Inngest poll helper ──────────────────────────────────────────────────────

export async function pollAuditStatus(
  page: import('@playwright/test').Page,
  auditId: string,
  timeoutMs = 90_000,
): Promise<{ status: string; body: Record<string, unknown> }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2_000);
    const res  = await page.request.get(`/api/audits/${auditId}`);
    if (!res.ok()) throw new Error(`GET /api/audits/${auditId} returned ${res.status()}`);
    const body = await res.json() as { audit: { status: string } };
    const s = body.audit?.status;
    if (s === 'complete' || s === 'failed') return { status: s, body: body as Record<string, unknown> };
  }
  throw new Error(
    `Audit ${auditId} did not complete within ${timeoutMs}ms.\n` +
    `Check Inngest dev server is running on port 8288.\n` +
    `Check LLM_MODE=mock and all 4 engine fixtures exist (lib/llm/mock-responses/*/happy_path.json)`
  );
}

// ─── Playwright fixtures ──────────────────────────────────────────────────────

/** Authenticated as User 1 (Org 1 — agency tier, 4 engines). */
export const test = base.extend<{ page: import('@playwright/test').Page }>({
  page: async ({ browser }, use) => {
    await clerkSetup();
    const ctx  = await browser.newContext({ baseURL: process.env.E2E_APP_URL ?? 'http://localhost:3000' });
    const page = await ctx.newPage();
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: USER_1.email, password: USER_1.password } });
    await use(page);
    await clerk.signOut({ page });
    await ctx.close();
  },
});

/** Authenticated as User 2 (Org 2 — free tier). Used in cross-org isolation tests. */
export const testAsUser2 = base.extend<{ page: import('@playwright/test').Page }>({
  page: async ({ browser }, use) => {
    await clerkSetup();
    const ctx  = await browser.newContext({ baseURL: process.env.E2E_APP_URL ?? 'http://localhost:3000' });
    const page = await ctx.newPage();
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: USER_2.email, password: USER_2.password } });
    await use(page);
    await clerk.signOut({ page });
    await ctx.close();
  },
});
