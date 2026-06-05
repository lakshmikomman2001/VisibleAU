/**
 * tests/e2e/frontend/sprint6/db.ts
 *
 * Service-role Drizzle client + seed/teardown helpers for Sprint 6 frontend E2E.
 * Identical contract to the backend E2E helpers — shared patterns.
 *
 * Called from Playwright spec afterAll() blocks to clean up test data.
 * Service-role client bypasses RLS — full access to all tables.
 *
 * Delete order (FK-safe):
 *   action_items → citations → audits → brands → users → organizations
 *   (action_items.brandId has onDelete RESTRICT — must precede brands)
 */
import { drizzle }             from 'drizzle-orm/postgres-js';
import postgres                from 'postgres';
import { eq, and, inArray, sql } from 'drizzle-orm';
import * as schema             from '../../../../db/schema';
import type {
  Organization, User, Brand, Audit, ActionItem,
} from '../../../../db/schema';

const pgClient = postgres(process.env.DATABASE_URL!, { max: 1 });
export const db = drizzle(pgClient, { schema });

// ─── Organization ─────────────────────────────────────────────────────────────

export async function seedOrganization(data: {
  clerkOrgId: string;
  name:        string;
  tier?:       Organization['tier'];
}): Promise<Organization> {
  const [existing] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, data.clerkOrgId));
  if (existing) return existing;
  const [org] = await db
    .insert(schema.organizations)
    .values({ clerkOrgId: data.clerkOrgId, name: data.name, region: 'au', tier: data.tier ?? 'starter' })
    .returning();
  return org;
}

// ─── User ─────────────────────────────────────────────────────────────────────

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
    .values({ clerkUserId: data.clerkUserId, organizationId: data.organizationId, email: data.email, name: 'S6 FE E2E User', role: 'owner' })
    .returning();
  return user;
}

// ─── Brand ────────────────────────────────────────────────────────────────────

export async function seedBrand(data: {
  organizationId: string;
  name?:          string;
  vertical?:      Brand['vertical'];
}): Promise<Brand> {
  const [brand] = await db
    .insert(schema.brands)
    .values({
      organizationId: data.organizationId,
      name:           data.name ?? '[S6-FE] Test Brand',
      domain:         `s6-fe-${Date.now()}.test`,
      vertical:       data.vertical ?? 'tradies',
      region:         'au',
      primaryRegions: ['NSW:Bondi'],
      competitors:    [],
    })
    .returning();
  return brand;
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export async function seedAudit(data: {
  organizationId:         string;
  brandId:                string;
  scoreFrequency?:        string;
  scorePosition?:         string;
  scoreSentimentNumeric?: string;
  scoreContextNumeric?:   string;
  scoreAccuracy?:         string;
  scoreComposite?:        string;
}): Promise<Audit> {
  // auditNumber is NOT NULL with no DB default — must compute sequentially per brand
  const existing = await db
    .select({ id: schema.audits.id })
    .from(schema.audits)
    .where(eq(schema.audits.brandId, data.brandId));
  const auditNumber = existing.length + 1;

  const [audit] = await db
    .insert(schema.audits)
    .values({
      organizationId:        data.organizationId,
      brandId:               data.brandId,
      auditNumber,
      status:                'complete',
      triggeredBy:           'manual',
      engines:               ['chatgpt', 'perplexity'],
      promptsCount:          10,
      runsPerPrompt:         1,
      totalCalls:            10,
      scoreFrequency:        data.scoreFrequency        ?? '25.00',
      scorePosition:         data.scorePosition         ?? '35.00',
      scoreSentimentNumeric: data.scoreSentimentNumeric ?? '42.00',
      scoreContextNumeric:   data.scoreContextNumeric   ?? '36.00',
      scoreAccuracy:         data.scoreAccuracy         ?? '45.00',
      scoreComposite:        data.scoreComposite        ?? '36.60',
      totalCostUsd:          '0.0150',
      metadata:              { mockScenario: 'happy_path' },
    })
    .returning();
  return audit;
}

// ─── ActionItem ───────────────────────────────────────────────────────────────

export interface SeedActionItemData {
  organizationId:      string;
  brandId:             string;
  auditId:             string;
  recommendationKey?:  string;
  dimension?:          string;
  title?:              string;
  action?:             string;
  confidenceLabel?:    'confirmed' | 'likely' | 'hypothesis';
  expectedImpactScore?: 'high' | 'medium' | 'low';
  evidenceRefs?:       Array<{ source: string; url: string; summary: string }>;
  status?:             'open' | 'in_progress' | 'done' | 'dismissed';
}

export async function seedActionItem(data: SeedActionItemData): Promise<ActionItem> {
  const [item] = await db
    .insert(schema.actionItems)
    .values({
      organizationId:      data.organizationId,
      brandId:             data.brandId,
      auditId:             data.auditId,
      recommendationKey:   data.recommendationKey   ?? 'wikipedia-article',
      dimension:           data.dimension            ?? 'frequency',
      title:               data.title               ?? '[S6-FE] Add a Wikipedia entry',
      action:              data.action              ?? 'Draft a neutral, citation-backed Wikipedia article.',
      confidenceLabel:     data.confidenceLabel     ?? 'confirmed',
      expectedImpactScore: data.expectedImpactScore ?? 'high',
      evidenceRefs:        data.evidenceRefs        ?? [
        {
          source:  'Princeton GEO study (2024)',
          url:     'https://arxiv.org/abs/2404.11973',
          summary: 'Wikipedia appears in 47.9% of ChatGPT top-10 citations.',
        },
      ],
      status: data.status ?? 'open',
    })
    .returning();
  return item;
}

/**
 * Seed a set of action items covering all 5 dimensions and all 3 confidence labels.
 * Useful for page-load, grouping, and filter tests.
 */
export async function seedActionItemSuite(data: {
  organizationId: string;
  brandId:        string;
  auditId:        string;
  brandName?:     string;
}): Promise<ActionItem[]> {
  const templates: SeedActionItemData[] = [
    { ...data, recommendationKey: 'wikipedia-article',  dimension: 'frequency', confidenceLabel: 'confirmed', expectedImpactScore: 'high',   title: '[S6-FE] Wikipedia article',    action: 'Draft a Wikipedia article about your business.' },
    { ...data, recommendationKey: 'reddit-absence',     dimension: 'frequency', confidenceLabel: 'likely',    expectedImpactScore: 'medium', title: '[S6-FE] Reddit absence',       action: 'Participate in relevant Reddit threads.' },
    { ...data, recommendationKey: 'medium-presence',    dimension: 'frequency', confidenceLabel: 'hypothesis', expectedImpactScore: 'low',  title: '[S6-FE] Medium presence',      action: 'Publish a how-to guide on Medium.' },
    { ...data, recommendationKey: 'comparison-article', dimension: 'position',  confidenceLabel: 'hypothesis', expectedImpactScore: 'medium', title: '[S6-FE] Comparison article',  action: 'Write a service comparison guide.' },
    { ...data, recommendationKey: 'expert-quotes',      dimension: 'accuracy',  confidenceLabel: 'likely',    expectedImpactScore: 'medium', title: '[S6-FE] Expert quotes',        action: 'Add expert quotes to your about page.' },
    { ...data, recommendationKey: 'faq-content',        dimension: 'context',   confidenceLabel: 'likely',    expectedImpactScore: 'medium', title: '[S6-FE] FAQ content',          action: 'Add a FAQPage schema block answering common questions.' },
    { ...data, recommendationKey: 'stale-content',      dimension: 'accuracy',  confidenceLabel: 'confirmed', expectedImpactScore: 'high',   title: '[S6-FE] Stale content',        action: 'Update pages that haven\'t been refreshed in 12+ months.' },
  ];
  const items: ActionItem[] = [];
  for (const t of templates) {
    items.push(await seedActionItem(t));
  }
  return items;
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

/**
 * Hard-delete all test data for an org in FK-safe order.
 * Safe to call even if some rows were never created (Postgres DELETE is a no-op for 0 rows).
 */
export async function deleteTestDataForOrg(orgId: string): Promise<void> {
  if (!orgId) return;

  // Find audit IDs for this org (needed for citations cleanup)
  const auditRows = await db
    .select({ id: schema.audits.id })
    .from(schema.audits)
    .where(eq(schema.audits.organizationId, orgId));
  const auditIds = auditRows.map(r => r.id);

  // 1. action_items first — has onDelete RESTRICT FK on brandId
  await db.delete(schema.actionItems).where(eq(schema.actionItems.organizationId, orgId));

  // 2. citations (Sprint 2 table — may be empty for Sprint 6 tests)
  if (auditIds.length > 0) {
    await db.delete(schema.citations).where(inArray(schema.citations.auditId, auditIds));
  }

  // 3. audits
  await db.delete(schema.audits).where(eq(schema.audits.organizationId, orgId));

  // 4. brands
  await db.delete(schema.brands).where(eq(schema.brands.organizationId, orgId));

  // 5. users
  await db.delete(schema.users).where(eq(schema.users.organizationId, orgId));

  // 6. organization last
  await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
}
