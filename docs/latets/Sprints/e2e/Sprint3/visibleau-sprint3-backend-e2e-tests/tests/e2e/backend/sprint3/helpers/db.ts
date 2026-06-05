/**
 * tests/e2e/backend/sprint3/helpers/db.ts
 *
 * Service-role Drizzle client + Sprint 3 seed / teardown helpers.
 *
 * Import depth from tests/e2e/backend/sprint3/helpers/db.ts:
 *   ../../../../../db/schema  (5 levels to project root)
 */

import { drizzle }   from 'drizzle-orm/postgres-js';
import postgres       from 'postgres';
import { eq, inArray, sql } from 'drizzle-orm';
import * as schema    from '../../../../../db/schema';
import type { Organization, User, Brand, Audit, Citation } from '../../../../../db/schema';

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
export const testDb = drizzle(client, { schema });

// ─── Seed helpers ─────────────────────────────────────────────────────────────

export async function seedOrganization(data: {
  clerkOrgId: string;
  name:        string;
  region?:     Organization['region'];
  tier?:       Organization['tier'];
}): Promise<Organization> {
  const [existing] = await testDb
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, data.clerkOrgId));
  if (existing) return existing;

  const [org] = await testDb
    .insert(schema.organizations)
    .values({
      clerkOrgId: data.clerkOrgId,
      name:       data.name,
      region:     data.region ?? 'au',
      tier:       data.tier   ?? 'agency',
    })
    .returning();
  return org;
}

export async function seedUser(data: {
  clerkUserId:    string;
  organizationId: string;
  email:          string;
  role?:          User['role'];
}): Promise<User> {
  const [existing] = await testDb
    .select()
    .from(schema.users)
    .where(eq(schema.users.clerkUserId, data.clerkUserId));
  if (existing) return existing;

  const [user] = await testDb
    .insert(schema.users)
    .values({
      clerkUserId:    data.clerkUserId,
      organizationId: data.organizationId,
      email:          data.email,
      name:           'E2E Sprint3 User',
      role:           data.role ?? 'owner',
    })
    .returning();
  return user;
}

export async function seedBrand(data: {
  organizationId: string;
  name:           string;
  domain:         string;
  vertical?:      Brand['vertical'];
}): Promise<Brand> {
  const [brand] = await testDb
    .insert(schema.brands)
    .values({
      organizationId: data.organizationId,
      name:           data.name,
      domain:         data.domain,
      vertical:       data.vertical ?? 'tradies',
      region:         'au',
      competitors:    [],
      primaryRegions: [],
    })
    .returning();
  return brand;
}

/**
 * Seed a Sprint 3 completed audit with all 5 dimension scores + CI bands.
 * All numeric fields are strings (Drizzle numeric columns → serialised as string).
 */
export async function seedSprint3Audit(data: {
  organizationId:    string;
  brandId:           string;
  auditNumber:       number;
  tier?:             Organization['tier'];
  scoreFrequency?:   number;
  scorePosition?:    number;
  scoreSentiment?:   'positive' | 'neutral' | 'negative';
  scoreSentimentNumeric?: number;
  scoreContext?:     'recommended' | 'listed' | 'mentioned' | 'commodified';
  scoreContextNumeric?: number;
  scoreAccuracy?:    number;
  scoreComposite?:   number;
  scoreConfidenceLow?:  number;
  scoreConfidenceHigh?: number;
  confidenceIntervals?: Record<string, { lower: number; upper: number }>;
  engines?:          string[];
  engineCount?:      number;
  promptCount?:      number;
  totalCalls?:       number;
  totalCostUsd?:     number;
  mockScenario?:     string;
  completedAtOverride?: Date; // V4 FIX: explicit completedAt for deterministic ordering in metrics tests
}): Promise<Audit> {
  const engines      = data.engines      ?? ['chatgpt', 'claude', 'gemini', 'perplexity'];
  const engineCount  = data.engineCount  ?? engines.length;
  const promptCount  = data.promptCount  ?? 10;
  const runsPerPrompt = 5;
  const totalCalls   = data.totalCalls   ?? engineCount * promptCount * runsPerPrompt;

  // Default CI bands: lower=40, upper=90 (brackets composite ~70)
  const freqCI = data.confidenceIntervals?.frequency ?? { lower: 40, upper: 90 };
  const ci = data.confidenceIntervals ?? {
    frequency: freqCI,
    position:  { lower: 45, upper: 92 },
    sentiment: { lower: 50, upper: 88 },
    context:   { lower: 38, upper: 85 },
    accuracy:  { lower: 42, upper: 87 },
  };

  const composite  = data.scoreComposite  ?? 70.00;
  const confidLow  = data.scoreConfidenceLow  ?? 55.00;
  const confidHigh = data.scoreConfidenceHigh ?? 82.00;

  const [audit] = await testDb
    .insert(schema.audits)
    .values({
      organizationId:     data.organizationId,
      brandId:            data.brandId,
      auditNumber:        data.auditNumber,
      triggeredBy:        'manual',
      status:             'complete',
      engines,
      engineCount,
      promptCount,
      promptsCount:       promptCount,
      runsPerPrompt,
      totalCalls,
      scoreComposite:     String(composite.toFixed(2)),
      scoreFrequency:     String((data.scoreFrequency  ?? 70).toFixed(2)),
      scorePosition:      String((data.scorePosition   ?? 80).toFixed(2)),
      scoreSentiment:     data.scoreSentiment    ?? 'positive',           // TEXT label (AB1 fix)
      scoreSentimentNumeric: String((data.scoreSentimentNumeric ?? 79).toFixed(2)),
      scoreContext:       data.scoreContext      ?? 'recommended',        // TEXT label (AB1 fix)
      scoreContextNumeric:   String((data.scoreContextNumeric   ?? 73).toFixed(2)),
      scoreAccuracy:      String((data.scoreAccuracy   ?? 71).toFixed(2)),
      scoreConfidenceLow:  String(confidLow.toFixed(2)),
      scoreConfidenceHigh: String(confidHigh.toFixed(2)),
      confidenceIntervals: ci,
      totalCostUsd:       String((data.totalCostUsd ?? 0.07).toFixed(4)),
      metadata:           { mockScenario: data.mockScenario ?? 'happy_path' },
      startedAt:          new Date(Date.now() - 180_000),
      completedAt:        data.completedAtOverride ?? new Date(), // V4 FIX
    })
    .returning();
  return audit;
}

// ─── Teardown helpers ──────────────────────────────────────────────────────────

export async function deleteAuditsForOrg(orgId: string): Promise<void> {
  if (!orgId) return;
  const orgAudits = await testDb
    .select({ id: schema.audits.id })
    .from(schema.audits)
    .where(eq(schema.audits.organizationId, orgId));
  if (orgAudits.length > 0) {
    await testDb
      .delete(schema.citations)
      .where(inArray(schema.citations.auditId, orgAudits.map(a => a.id)));
  }
  await testDb.delete(schema.audits).where(eq(schema.audits.organizationId, orgId));
}

export async function deleteBrandsForOrg(orgId: string): Promise<void> {
  if (!orgId) return;
  await testDb.delete(schema.brands).where(eq(schema.brands.organizationId, orgId));
}

export async function deleteCanaryPrompts(): Promise<void> {
  await testDb.delete(schema.canaryPrompts);
}

// ─── Query helpers ─────────────────────────────────────────────────────────────

export async function getAuditById(id: string): Promise<Audit | null> {
  const [row] = await testDb
    .select()
    .from(schema.audits)
    .where(eq(schema.audits.id, id));
  return row ?? null;
}

export async function getCitationsForAudit(auditId: string): Promise<Citation[]> {
  return testDb
    .select()
    .from(schema.citations)
    .where(eq(schema.citations.auditId, auditId));
}

export async function getAuditCount(orgId: string): Promise<number> {
  const [row] = await testDb
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.audits)
    .where(eq(schema.audits.organizationId, orgId));
  return row.count;
}

/** Poll DB until audit.status is complete or failed (for full-flow tests). */
export async function waitForAuditComplete(
  auditId:    string,
  timeoutMs = 90_000,
  intervalMs = 2_000,
): Promise<Audit> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, intervalMs));
    const audit = await getAuditById(auditId);
    if (audit?.status === 'complete' || audit?.status === 'failed') return audit;
  }
  throw new Error(
    `Audit ${auditId} did not complete within ${timeoutMs}ms.\n` +
    `Sprint 3 full-flow requires:\n` +
    `  1. Inngest dev server running (npx inngest-cli@latest dev)\n` +
    `  2. App running in mock mode (LLM_MODE=mock pnpm dev)\n` +
    `  3. All 4 engine mock fixtures present (lib/llm/mock-responses/*/happy_path.json)`
  );
}
