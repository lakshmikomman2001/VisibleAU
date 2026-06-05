/**
 * tests/e2e/backend/sprint4/helpers/db.ts
 *
 * Service-role Drizzle client + Sprint 4 seed / teardown helpers.
 *
 * Import depth: tests/e2e/backend/sprint4/helpers/db.ts
 *   → ../../../../../db/schema  (5 levels to project root)
 *
 * Sprint 4 adds no new schema — this file extends Sprint 3 helpers with
 * Sprint 4-specific seed data (soft-deleted brands, multi-brand orgs, etc.)
 */

import { drizzle }                        from 'drizzle-orm/postgres-js';
import postgres                            from 'postgres';
import { eq, inArray, sql, isNull, and }  from 'drizzle-orm';
import * as schema                         from '../../../../../db/schema';
import type { Organization, User, Brand, Audit, Citation } from '../../../../../db/schema';

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
export const testDb = drizzle(client, { schema });

// ─── Org / user seed (idempotent) ─────────────────────────────────────────────

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
  if (existing) {
    // Ensure correct tier for this test run
    if (data.tier && existing.tier !== data.tier) {
      const [updated] = await testDb
        .update(schema.organizations)
        .set({ tier: data.tier })
        .where(eq(schema.organizations.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }
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
      name:           'E2E Sprint4 User',
      role:           data.role ?? 'owner',
    })
    .returning();
  return user;
}

// ─── Brand seed ────────────────────────────────────────────────────────────────

/**
 * Creates a brand with [S4-E2E] prefix for easy identification and cleanup.
 * Sprint 4: brands now have a deletedAt column (Sprint 1 schema) used for soft delete.
 */
export async function seedBrand(data: {
  organizationId: string;
  name:           string;
  domain:         string;
  vertical?:      Brand['vertical'];
  deletedAt?:     Date | null;
}): Promise<Brand> {
  const [brand] = await testDb
    .insert(schema.brands)
    .values({
      organizationId: data.organizationId,
      name:           `[S4-E2E] ${data.name}`,
      domain:         data.domain,
      vertical:       data.vertical ?? 'tradies',
      region:         'au',
      competitors:    [],
      primaryRegions: ['sydney'],
    })
    .returning();

  if (data.deletedAt) {
    // Apply soft-delete immediately if requested
    const [deleted] = await testDb
      .update(schema.brands)
      .set({ deletedAt: data.deletedAt })
      .where(eq(schema.brands.id, brand.id))
      .returning();
    return deleted;
  }
  return brand;
}

// ─── Audit seed (Sprint 3 schema — Sprint 4 is read-only on schema) ───────────

export interface AuditSeedOpts {
  organizationId:      string;
  brandId:             string;
  auditNumber:         number;
  status?:             Audit['status'];
  engines?:            string[];
  runsPerPrompt?:      number;
  scoreComposite?:     number;
  scoreFrequency?:     number;
  scorePosition?:      number;
  scoreSentiment?:     'positive' | 'neutral' | 'negative';
  scoreSentimentNumeric?: number;
  scoreContext?:       'recommended' | 'listed' | 'mentioned' | 'commodified';
  scoreContextNumeric?: number;
  scoreAccuracy?:      number;
  scoreConfidenceLow?: number;
  scoreConfidenceHigh?: number;
  confidenceIntervals?: Record<string, { lower: number; upper: number }>;
  totalCalls?:         number;
  totalCostUsd?:       number;
  mockScenario?:       string;
  completedAt?:        Date;
  startedAt?:          Date;
}

export async function seedAudit(opts: AuditSeedOpts): Promise<Audit> {
  const engines       = opts.engines       ?? ['chatgpt', 'claude', 'gemini', 'perplexity'];
  const runsPerPrompt = opts.runsPerPrompt ?? 5;
  const promptCount   = 10;
  const engineCount   = engines.length;
  const totalCalls    = opts.totalCalls    ?? engineCount * promptCount * runsPerPrompt;

  const composite  = opts.scoreComposite   ?? 63.4;
  const confidLow  = opts.scoreConfidenceLow  ?? 55.0;
  const confidHigh = opts.scoreConfidenceHigh ?? 75.0;

  const ci = opts.confidenceIntervals ?? {
    frequency: { lower: 40, upper: 90 },
    position:  { lower: 45, upper: 92 },
    sentiment: { lower: 50, upper: 88 },
    context:   { lower: 38, upper: 85 },
    accuracy:  { lower: 42, upper: 87 },
  };

  const isComplete = (opts.status ?? 'complete') === 'complete';

  const [audit] = await testDb
    .insert(schema.audits)
    .values({
      organizationId:       opts.organizationId,
      brandId:              opts.brandId,
      auditNumber:          opts.auditNumber,
      triggeredBy:          'manual',
      status:               opts.status ?? 'complete',
      engines,
      engineCount,
      promptCount,
      promptsCount:         promptCount,
      runsPerPrompt,
      totalCalls,
      scoreComposite:       isComplete ? String(composite.toFixed(2))                        : null,
      scoreFrequency:       isComplete ? String((opts.scoreFrequency  ?? 14).toFixed(2))     : null,
      scorePosition:        isComplete ? String((opts.scorePosition   ?? 90).toFixed(2))     : null,
      scoreSentiment:       isComplete ? (opts.scoreSentiment ?? 'positive')                 : null,
      scoreSentimentNumeric:isComplete ? String((opts.scoreSentimentNumeric ?? 79).toFixed(2)) : null,
      scoreContext:         isComplete ? (opts.scoreContext   ?? 'recommended')               : null,
      scoreContextNumeric:  isComplete ? String((opts.scoreContextNumeric ?? 73).toFixed(2)) : null,
      scoreAccuracy:        isComplete ? String((opts.scoreAccuracy   ?? 71).toFixed(2))     : null,
      scoreConfidenceLow:   isComplete ? String(confidLow.toFixed(2))                        : null,
      scoreConfidenceHigh:  isComplete ? String(confidHigh.toFixed(2))                       : null,
      confidenceIntervals:  isComplete ? ci                                                   : {},
      totalCostUsd:         String((opts.totalCostUsd ?? 0.89).toFixed(4)),
      metadata:             { mockScenario: opts.mockScenario ?? 'happy_path' },
      startedAt:            opts.startedAt ?? new Date(Date.now() - 180_000),
      completedAt:          isComplete ? (opts.completedAt ?? new Date()) : null,
    })
    .returning();
  return audit;
}

/**
 * Seed citation rows for an audit (needed for CSV export tests).
 * Creates one citation per engine × prompt combination.
 */
export async function seedCitationsForAudit(
  audit: Audit,
  opts: { mentionedCount?: number } = {},
): Promise<Citation[]> {
  const engines = audit.engines as string[] ?? ['chatgpt'];
  const prompts = ['Best plumbers in Sydney?', 'Reliable tradie for emergencies?'];
  const mentioned = opts.mentionedCount ?? 1;
  const rows: Citation[] = [];

  for (const engine of engines) {
    for (let p = 0; p < prompts.length; p++) {
      for (let r = 1; r <= (audit.runsPerPrompt ?? 5); r++) {
        const isMentioned = rows.length < mentioned;
        const [row] = await testDb
          .insert(schema.citations)
          .values({
            auditId:       audit.id,
            organizationId: audit.organizationId,
            engine,
            prompt:         prompts[p],
            runNumber:      r,
            brandMentioned: isMentioned,
            position:       isMentioned ? p + 1 : null,
            sentimentLabel: isMentioned ? 'positive' : null,
            contextLabel:   isMentioned ? 'recommended' : null,
            responseSnippet: isMentioned
              ? `${engine.toUpperCase()} recommends this tradie for ${prompts[p]}`
              : null,
            citedSources:  isMentioned
              ? [{ domain: 'hipages.com.au', url: 'https://hipages.com.au/plumbers' }]
              : [],
            llmModel:      engine === 'chatgpt' ? 'gpt-4o' : `${engine}-model`,
            llmCostUsd:    '0.0030',
          })
          .returning();
        rows.push(row);
      }
    }
  }
  return rows;
}

// ─── Teardown helpers ──────────────────────────────────────────────────────────

/**
 * Hard-deletes all citations for org's audits, then all audits, then all brands
 * (including soft-deleted ones). Used in afterAll.
 */
export async function deleteAllTestDataForOrg(orgId: string): Promise<void> {
  if (!orgId) return;

  // 1. Citations (FK → audits)
  const orgAudits = await testDb
    .select({ id: schema.audits.id })
    .from(schema.audits)
    .where(eq(schema.audits.organizationId, orgId));
  if (orgAudits.length > 0) {
    await testDb
      .delete(schema.citations)
      .where(inArray(schema.citations.auditId, orgAudits.map(a => a.id)));
  }

  // 2. Audits
  await testDb
    .delete(schema.audits)
    .where(eq(schema.audits.organizationId, orgId));

  // 3. All brands (including soft-deleted — hard delete for clean test state)
  await testDb
    .delete(schema.brands)
    .where(eq(schema.brands.organizationId, orgId));
}

// ─── Query helpers ─────────────────────────────────────────────────────────────

export async function getBrandById(id: string): Promise<Brand | null> {
  const [row] = await testDb
    .select()
    .from(schema.brands)
    .where(eq(schema.brands.id, id));
  return row ?? null;
}

export async function getAuditById(id: string): Promise<Audit | null> {
  const [row] = await testDb
    .select()
    .from(schema.audits)
    .where(eq(schema.audits.id, id));
  return row ?? null;
}

/**
 * Count non-deleted brands for an org (mirrors the brand-limit check in POST /api/brands).
 */
export async function getActiveBrandCount(orgId: string): Promise<number> {
  const [row] = await testDb
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.brands)
    .where(
      and(
        eq(schema.brands.organizationId, orgId),
        isNull(schema.brands.deletedAt),
      )
    );
  return row.count;
}

export async function getAuditCountForOrg(orgId: string): Promise<number> {
  const [row] = await testDb
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.audits)
    .where(eq(schema.audits.organizationId, orgId));
  return row.count;
}
