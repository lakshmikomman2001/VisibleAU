/**
 * tests/e2e/frontend/sprint4/helpers/db.ts
 *
 * Service-role Drizzle client + seed / teardown helpers for Sprint 4 UI E2E.
 *
 * All data seeded here is hard-deleted in afterAll (brands, audits, citations).
 * Org rows are idempotent (created once, reused across runs).
 */

import { drizzle }                       from 'drizzle-orm/postgres-js';
import postgres                           from 'postgres';
import { eq, inArray, and, isNull, sql } from 'drizzle-orm';
import * as schema                        from '../../../../../db/schema';
import type { Organization, User, Brand, Audit, Citation } from '../../../../../db/schema';

const pgClient = postgres(process.env.DATABASE_URL!, { max: 1 });
export const db = drizzle(pgClient, { schema });

// ─── Org / user (idempotent) ───────────────────────────────────────────────────

export async function seedOrganization(data: {
  clerkOrgId: string;
  name:       string;
  tier?:      Organization['tier'];
}): Promise<Organization> {
  const [existing] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, data.clerkOrgId));
  if (existing) {
    if (data.tier && existing.tier !== data.tier) {
      const [updated] = await db
        .update(schema.organizations)
        .set({ tier: data.tier })
        .where(eq(schema.organizations.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }
  const [org] = await db
    .insert(schema.organizations)
    .values({ clerkOrgId: data.clerkOrgId, name: data.name, region: 'au', tier: data.tier ?? 'agency' })
    .returning();
  return org;
}

export async function seedUser(data: {
  clerkUserId:    string;
  organizationId: string;
  email:          string;
}): Promise<User> {
  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.clerkUserId, data.clerkUserId));
  if (existing) return existing;
  const [user] = await db
    .insert(schema.users)
    .values({ clerkUserId: data.clerkUserId, organizationId: data.organizationId, email: data.email, name: 'S4 UI Test User', role: 'owner' })
    .returning();
  return user;
}

// ─── Brand ────────────────────────────────────────────────────────────────────

export async function seedBrand(data: {
  organizationId: string;
  name:           string;
  domain:         string;
  vertical?:      Brand['vertical'];
}): Promise<Brand> {
  const [brand] = await db
    .insert(schema.brands)
    .values({
      organizationId: data.organizationId,
      name:           `[S4-UI] ${data.name}`,
      domain:         data.domain,
      vertical:       data.vertical ?? 'tradies',
      region:         'au',
      primaryRegions: ['NSW:Sydney CBD'],
      competitors:    [],
    })
    .returning();
  return brand;
}

// ─── Audit (Sprint 3 schema — Sprint 4 read-only) ─────────────────────────────

export interface AuditSeed {
  organizationId:    string;
  brandId:           string;
  auditNumber:       number;
  status?:           'complete' | 'running' | 'pending' | 'failed';
  engines?:          string[];
  runsPerPrompt?:    number;
  scoreComposite?:   number;
  scoreFrequency?:   number;
  scorePosition?:    number;
  scoreSentiment?:   'positive' | 'neutral' | 'negative';
  scoreSentimentNumeric?: number;
  scoreContext?:     'recommended' | 'listed' | 'mentioned' | 'commodified';
  scoreContextNumeric?: number;
  scoreAccuracy?:    number;
  scoreConfidenceLow?:  number;
  scoreConfidenceHigh?: number;
  totalCostUsd?:     number;
  completedAt?:      Date;
}

export async function seedAudit(opts: AuditSeed): Promise<Audit> {
  const engines      = opts.engines       ?? ['chatgpt', 'claude', 'gemini', 'perplexity'];
  const runsPerPrompt = opts.runsPerPrompt ?? 5;
  const promptCount  = 10;
  const totalCalls   = engines.length * promptCount * runsPerPrompt;
  const isComplete   = (opts.status ?? 'complete') === 'complete';
  const composite    = opts.scoreComposite ?? 63.4;

  const ci = {
    frequency: { lower: 40, upper: 90 },
    position:  { lower: 45, upper: 92 },
    sentiment: { lower: 50, upper: 88 },
    context:   { lower: 38, upper: 85 },
    accuracy:  { lower: 42, upper: 87 },
  };

  const [audit] = await db
    .insert(schema.audits)
    .values({
      organizationId:        opts.organizationId,
      brandId:               opts.brandId,
      auditNumber:           opts.auditNumber,
      triggeredBy:           'manual',
      status:                opts.status ?? 'complete',
      engines,
      engineCount:           isComplete ? engines.length : null,
      promptCount,
      promptsCount:          promptCount,
      runsPerPrompt,
      totalCalls,
      scoreComposite:        isComplete ? String(composite.toFixed(2)) : null,
      scoreFrequency:        isComplete ? String((opts.scoreFrequency  ?? 14).toFixed(2)) : null,
      scorePosition:         isComplete ? String((opts.scorePosition   ?? 90).toFixed(2)) : null,
      scoreSentiment:        isComplete ? (opts.scoreSentiment ?? 'positive') : null,
      scoreSentimentNumeric: isComplete ? String((opts.scoreSentimentNumeric ?? 79).toFixed(2)) : null,
      scoreContext:          isComplete ? (opts.scoreContext ?? 'recommended') : null,
      scoreContextNumeric:   isComplete ? String((opts.scoreContextNumeric ?? 73).toFixed(2)) : null,
      scoreAccuracy:         isComplete ? String((opts.scoreAccuracy ?? 71).toFixed(2)) : null,
      scoreConfidenceLow:    isComplete ? String((opts.scoreConfidenceLow ?? 59.1).toFixed(2)) : null,
      scoreConfidenceHigh:   isComplete ? String((opts.scoreConfidenceHigh ?? 67.7).toFixed(2)) : null,
      confidenceIntervals:   isComplete ? ci : {},
      totalCostUsd:          String((opts.totalCostUsd ?? 1.92).toFixed(4)),
      metadata:              { mockScenario: 'happy_path' },
      startedAt:             new Date(Date.now() - 200_000),
      completedAt:           isComplete ? (opts.completedAt ?? new Date()) : null,
    })
    .returning();
  return audit;
}

/** Seed a minimal set of citations for a completed audit (for export tests). */
export async function seedCitations(audit: Audit, count = 5): Promise<void> {
  const engines = (audit.engines as string[]) ?? ['chatgpt'];
  const prompts = ['Best plumbers in Sydney?', 'Emergency plumbing near me?'];

  const rows: typeof schema.citations.$inferInsert[] = [];
  let n = 0;
  outer: for (const engine of engines) {
    for (const prompt of prompts) {
      for (let r = 1; r <= (audit.runsPerPrompt ?? 5); r++) {
        if (n >= count) break outer;
        rows.push({
          auditId:        audit.id,
          organizationId: audit.organizationId,
          engine,
          prompt,
          runNumber:      r,
          brandMentioned: true,
          position:       1,
          sentimentLabel: 'positive',
          contextLabel:   'recommended',
          responseSnippet: `${engine} recommends this tradie for "${prompt}"`,
          citedSources:   [{ domain: 'hipages.com.au', url: 'https://hipages.com.au' }],
          llmModel:       engine === 'chatgpt' ? 'gpt-4o' : `${engine}-latest`,
          llmCostUsd:     '0.0030',
        });
        n++;
      }
    }
  }
  if (rows.length > 0) await db.insert(schema.citations).values(rows);
}

// ─── Teardown ──────────────────────────────────────────────────────────────────

export async function deleteAllTestDataForOrg(orgId: string): Promise<void> {
  if (!orgId) return;
  const auditIds = await db
    .select({ id: schema.audits.id })
    .from(schema.audits)
    .where(eq(schema.audits.organizationId, orgId));
  if (auditIds.length > 0) {
    await db.delete(schema.citations)
      .where(inArray(schema.citations.auditId, auditIds.map(a => a.id)));
  }
  await db.delete(schema.audits).where(eq(schema.audits.organizationId, orgId));
  await db.delete(schema.brands).where(eq(schema.brands.organizationId, orgId));
}

export async function getActiveBrandCount(orgId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.brands)
    .where(and(eq(schema.brands.organizationId, orgId), isNull(schema.brands.deletedAt)));
  return row.count;
}

export async function getBrandById(id: string): Promise<Brand | null> {
  const [row] = await db.select().from(schema.brands).where(eq(schema.brands.id, id));
  return row ?? null;
}

/** Poll the DB until the audit reaches 'complete' or 'failed' (for full-flow tests). */
export async function waitForAuditComplete(
  auditId: string,
  timeoutMs = 90_000,
): Promise<Audit> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3_000));
    const [audit] = await db
      .select()
      .from(schema.audits)
      .where(eq(schema.audits.id, auditId));
    if (audit?.status === 'complete' || audit?.status === 'failed') return audit;
  }
  throw new Error(`Audit ${auditId} did not complete within ${timeoutMs}ms`);
}
