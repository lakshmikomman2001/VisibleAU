/**
 * tests/e2e/sprint2/helpers/db.ts
 *
 * Direct DB access for Sprint 2 frontend E2E tests.
 * Uses the service-role postgres client (bypasses RLS) for:
 *   - Seeding org + user rows before tests (idempotent)
 *   - Seeding brands for tests to run audits against
 *   - Hard-deleting audits + citations + brands in afterAll teardown
 *
 * Sprint 2 additions over Sprint 1 db.ts:
 *   - seedAudit()            — insert a pre-completed audit for result page tests
 *   - seedCitation()         — insert citation rows for result display tests
 *   - deleteAuditsForOrg()   — hard-delete all audits + citations for an org
 *   - getAuditById()         — read audit row directly for state verification
 *   - getCitationsForAudit() — verify citation count/content after audit runs
 *
 * Import depth: helpers/db.ts is at tests/e2e/sprint2/helpers/db.ts
 * 4 levels up (../../../../) reaches the project root.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, inArray } from 'drizzle-orm'; // O12 FIX: removed unused 'and'
import * as schema from '../../../../db/schema';
import type { Organization, User, Brand, Audit, Citation } from '../../../../db/schema';

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
export const db = drizzle(client, { schema });

// ─── Sprint 1 seed helpers (reused) ──────────────────────────────────────────

export async function ensureOrganization(opts: {
  clerkOrgId: string;
  name:       string;
  region?:    Organization['region'];
  tier?:      Organization['tier'];
}): Promise<Organization> {
  const [existing] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, opts.clerkOrgId));
  if (existing) return existing;

  const [org] = await db
    .insert(schema.organizations)
    .values({
      clerkOrgId: opts.clerkOrgId,
      name:       opts.name,
      region:     opts.region ?? 'au',
      tier:       opts.tier   ?? 'agency',
    })
    .returning();
  return org;
}

export async function ensureUser(opts: {
  clerkUserId:    string;
  organizationId: string;
  email:          string;
}): Promise<User> {
  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.clerkUserId, opts.clerkUserId));
  if (existing) return existing;

  const [user] = await db
    .insert(schema.users)
    .values({
      clerkUserId:    opts.clerkUserId,
      organizationId: opts.organizationId,
      email:          opts.email,
      name:           'E2E Test User',
      role:           'owner',
    })
    .returning();
  return user;
}

export async function createBrand(opts: {
  organizationId: string;
  name:           string;
  domain:         string;
  vertical?:      Brand['vertical'];
}): Promise<Brand> {
  const [brand] = await db
    .insert(schema.brands)
    .values({
      organizationId: opts.organizationId,
      name:           opts.name,
      domain:         opts.domain,
      vertical:       opts.vertical ?? 'tradies',
      region:         'au',
      competitors:    [],
      primaryRegions: [],
    })
    .returning();
  return brand;
}

// ─── Sprint 2 seed helpers ────────────────────────────────────────────────────

/**
 * Seed a completed audit row directly in the DB.
 * Used for tests that need to view results without waiting for Inngest to run.
 */
export async function seedCompletedAudit(opts: {
  organizationId: string;
  brandId:        string;
  auditNumber:    number;
  scoreComposite?: number;
  totalCostUsd?:   number;
  mockScenario?:   string;
}): Promise<Audit> {
  const now = new Date();
  const [audit] = await db
    .insert(schema.audits)
    .values({
      organizationId: opts.organizationId,
      brandId:        opts.brandId,
      auditNumber:    opts.auditNumber,
      triggeredBy:    'manual',
      status:         'complete',
      engines:        ['chatgpt'],
      promptsCount:   10,
      runsPerPrompt:  1,
      totalCalls:     10,
      scoreComposite: String((opts.scoreComposite ?? 70).toFixed(2)),
      totalCostUsd:   String((opts.totalCostUsd ?? 0.07).toFixed(4)),
      metadata:       { mockScenario: opts.mockScenario ?? 'happy_path' },
      startedAt:      new Date(now.getTime() - 107_000), // ~1m 47s ago
      completedAt:    now,
    })
    .returning();
  return audit;
}

/**
 * Seed a failed audit row directly in the DB.
 * Used for the failed-state UI test.
 */
export async function seedFailedAudit(opts: {
  organizationId: string;
  brandId:        string;
  auditNumber:    number;
  errorMessage?:  string;
}): Promise<Audit> {
  const now = new Date();
  const [audit] = await db
    .insert(schema.audits)
    .values({
      organizationId: opts.organizationId,
      brandId:        opts.brandId,
      auditNumber:    opts.auditNumber,
      triggeredBy:    'manual',
      status:         'failed',
      engines:        [],
      metadata:       {
        error: opts.errorMessage ?? 'rate_limited — OpenAI API returned 429 after 3 retries',
      },
      failedAt:       now,
    })
    .returning();
  return audit;
}

/**
 * Seed citation rows for a completed audit.
 * Mirrors the Sprint 2 citations schema exactly.
 */
export async function seedCitations(opts: {
  auditId: string;
  prompts: Array<{
    prompt:         string;
    brandMentioned: boolean;
    position?:      number | null;
    responseSnippet?: string | null;
  }>;
}): Promise<Citation[]> {
  const rows = opts.prompts.map((p, i) => ({
    auditId:        opts.auditId,
    engine:         'chatgpt' as const,
    prompt:         p.prompt,
    runNumber:      1,
    brandMentioned: p.brandMentioned,
    position:       p.position ?? null,
    responseSnippet: p.responseSnippet ?? null,
    citedSources:   [] as unknown[],
    contextSnippets: [] as unknown[],
    llmCostUsd:     '0.0050',
    llmTokensUsed:  85,
    llmModel:       'gpt-4o-mini-mock',
  }));

  return db.insert(schema.citations).values(rows).returning();
}

// ─── Teardown helpers ─────────────────────────────────────────────────────────

/** Hard-delete all audits + citations for an org. */
export async function deleteAuditsForOrg(orgId: string): Promise<void> {
  if (!orgId) return;
  const orgAudits = await db
    .select({ id: schema.audits.id })
    .from(schema.audits)
    .where(eq(schema.audits.organizationId, orgId));

  if (orgAudits.length > 0) {
    await db
      .delete(schema.citations)
      .where(inArray(schema.citations.auditId, orgAudits.map(a => a.id)));
  }
  await db.delete(schema.audits).where(eq(schema.audits.organizationId, orgId));
}

/** Hard-delete brands for an org (including soft-deleted). */
export async function deleteBrandsForOrg(orgId: string): Promise<void> {
  if (!orgId) return;
  await db.delete(schema.brands).where(eq(schema.brands.organizationId, orgId));
}

// ─── Query helpers ────────────────────────────────────────────────────────────

export async function getAuditById(id: string): Promise<Audit | null> {
  const [row] = await db
    .select()
    .from(schema.audits)
    .where(eq(schema.audits.id, id));
  return row ?? null;
}

// R15 FIX: getCitationsForAudit removed — exported but never imported by any spec file.
// getAuditById is kept: it is used internally by waitForAuditComplete below.

/** Wait for an audit to reach a terminal status by polling the DB directly. */
export async function waitForAuditComplete(
  auditId:    string,
  timeoutMs = 45_000,
  intervalMs = 1_000,
): Promise<Audit> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, intervalMs));
    const audit = await getAuditById(auditId);
    if (audit?.status === 'complete' || audit?.status === 'failed') return audit;
  }
  throw new Error(
    `Audit ${auditId} did not complete within ${timeoutMs}ms.\n` +
    `Is the Inngest dev server running? (npx inngest-cli@latest dev)\n` +
    `Is LLM_MODE=mock set on the app server?`,
  );
}
