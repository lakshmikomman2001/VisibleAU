/**
 * tests/e2e/backend/sprint6/helpers/db.ts
 *
 * Service-role Drizzle client + seed/teardown helpers for Sprint 6 backend E2E.
 *
 * Sprint 6 adds action_items and recommendation_research tables.
 * These helpers insert MINIMAL test rows (not the full research citation seed).
 * The production research seed (≥11 rows per universal key) is assumed already
 * present from `pnpm seed`.
 *
 * All test action_items are scoped to orgs created in each test file's beforeAll.
 * Hard-delete order respects FKs:
 *   action_items → citations → audits → brands → users → organizations
 * (action_items.brandId has onDelete RESTRICT — brands deleted after action_items)
 *
 * ── TIER STRATEGY ────────────────────────────────────────────────────────────
 * Org 1: tier='starter' — sees full recommendations (no tier gate)
 * Org 2: tier='free'    — sees blurred content; used for cross-org isolation
 * The API returns full data regardless of tier; tier gate is UI-only in Sprint 6.
 */

import { drizzle }                               from 'drizzle-orm/postgres-js';
import postgres                                   from 'postgres';
import { eq, and, inArray, sql, isNull }          from 'drizzle-orm';
import * as schema                                from '../../../../../db/schema';
import type {
  Organization, User, Brand, Audit, ActionItem,
} from '../../../../../db/schema';

// ─── DB client ───────────────────────────────────────────────────────────────

const pgClient = postgres(process.env.DATABASE_URL!, { max: 1 });
export const db = drizzle(pgClient, { schema });

// ─── Org / user ───────────────────────────────────────────────────────────────

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
    .values({
      clerkOrgId: data.clerkOrgId,
      name:       data.name,
      region:     'au',
      tier:       data.tier ?? 'starter',
    })
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
    .values({
      clerkUserId:    data.clerkUserId,
      organizationId: data.organizationId,
      email:          data.email,
      name:           'S6 E2E User',
      role:           'owner',
    })
    .returning();
  return user;
}

// ─── Brand ───────────────────────────────────────────────────────────────────

export async function seedBrand(data: {
  organizationId: string;
  vertical?:      Brand['vertical'];
  name?:          string;
}): Promise<Brand> {
  const [brand] = await db
    .insert(schema.brands)
    .values({
      organizationId: data.organizationId,
      name:           data.name ?? '[S6-E2E] Test Brand',
      domain:         `s6-e2e-${Date.now()}.test`,
      vertical:       data.vertical ?? 'tradies',
      region:         'au',
      primaryRegions: ['NSW:Bondi'],
      competitors:    [],
    })
    .returning();
  return brand;
}

// ─── Audit ───────────────────────────────────────────────────────────────────

export async function seedAudit(data: {
  organizationId:         string;
  brandId:                string;
  status?:                'complete' | 'pending' | 'failed';
  scoreFrequency?:        string;
  scorePosition?:         string;
  scoreSentimentNumeric?: string;
  scoreContextNumeric?:   string;
  scoreAccuracy?:         string;
  scoreComposite?:        string;
}): Promise<Audit> {
  // A2 FIX: audits.auditNumber is NOT NULL with no default (Sprint 2 schema line 168).
  // Must derive the next auditNumber for this brand (1-based sequential per brand).
  // Service-role query bypasses RLS to count existing audits for the brand.
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
      auditNumber,                              // A2 FIX: required NOT NULL, no DB default
      status:                data.status ?? 'complete',
      triggeredBy:           'manual',
      engines:               ['chatgpt', 'perplexity'],
      promptsCount:          10,
      runsPerPrompt:         1,
      totalCalls:            10,
      scoreFrequency:        data.scoreFrequency        ?? '35.00',
      scorePosition:         data.scorePosition         ?? '38.00',
      scoreSentimentNumeric: data.scoreSentimentNumeric ?? '42.00',
      scoreContextNumeric:   data.scoreContextNumeric   ?? '38.00',
      scoreAccuracy:         data.scoreAccuracy         ?? '45.00',
      scoreComposite:        data.scoreComposite        ?? '39.60',
      totalCostUsd:          '0.0150',
      metadata:              { mockScenario: 'happy_path' },
    })
    .returning();
  return audit;
}

// ─── ActionItem ───────────────────────────────────────────────────────────────

export interface SeedActionItemData {
  organizationId:     string;
  brandId:            string;
  auditId:            string;
  recommendationKey?: string;
  dimension?:         string;
  title?:             string;
  action?:            string;
  confidenceLabel?:   'confirmed' | 'likely' | 'hypothesis';
  expectedImpactScore?: 'high' | 'medium' | 'low';
  evidenceRefs?:      Array<{ source: string; url: string; summary: string }>;
  status?:            'open' | 'in_progress' | 'done' | 'dismissed';
  dismissedReason?:   string;
}

export async function seedActionItem(data: SeedActionItemData): Promise<ActionItem> {
  const [item] = await db
    .insert(schema.actionItems)
    .values({
      organizationId:     data.organizationId,
      brandId:            data.brandId,
      auditId:            data.auditId,
      recommendationKey:  data.recommendationKey ?? 'wikipedia-article',
      dimension:          data.dimension         ?? 'frequency',
      title:              data.title             ?? '[S6-E2E] Add a Wikipedia entry',
      action:             data.action            ?? 'Draft a neutral Wikipedia article.',
      confidenceLabel:    data.confidenceLabel   ?? 'confirmed',
      expectedImpactScore: data.expectedImpactScore ?? 'high',
      evidenceRefs:       data.evidenceRefs      ?? [
        { source: 'Princeton GEO study (2024)', url: 'https://arxiv.org/abs/2404.11973',
          summary: 'Wikipedia appears in 47.9% of ChatGPT top-10 citations.' },
      ],
      status:             data.status            ?? 'open',
      ...(data.dismissedReason ? { dismissedReason: data.dismissedReason } : {}),
    })
    .returning();
  return item;
}

/**
 * Seed a complete set of action items representing all 5 dimensions and all
 * 3 confidence labels — useful for filter and grouping tests.
 */
export async function seedActionItemSuite(data: {
  organizationId: string;
  brandId:        string;
  auditId:        string;
}): Promise<ActionItem[]> {
  const templates: SeedActionItemData[] = [
    {
      ...data, recommendationKey: 'wikipedia-article',
      dimension: 'frequency', confidenceLabel: 'confirmed', expectedImpactScore: 'high',
      title: '[S6-E2E] Wikipedia article', action: 'Draft a Wikipedia article.',
    },
    {
      ...data, recommendationKey: 'reddit-absence',
      dimension: 'frequency', confidenceLabel: 'likely', expectedImpactScore: 'medium',
      title: '[S6-E2E] Reddit absence', action: 'Participate in Reddit threads.',
    },
    {
      ...data, recommendationKey: 'medium-presence',
      dimension: 'frequency', confidenceLabel: 'hypothesis', expectedImpactScore: 'low',
      title: '[S6-E2E] Medium presence', action: 'Publish a how-to on Medium.',
    },
    {
      ...data, recommendationKey: 'comparison-article',
      dimension: 'position', confidenceLabel: 'hypothesis', expectedImpactScore: 'medium',
      title: '[S6-E2E] Comparison article', action: 'Write a competitor comparison guide.',
    },
    {
      ...data, recommendationKey: 'expert-quotes',
      dimension: 'accuracy', confidenceLabel: 'likely', expectedImpactScore: 'medium',
      title: '[S6-E2E] Expert quotes', action: 'Add expert quotes to your about page.',
    },
    {
      ...data, recommendationKey: 'faq-content',
      dimension: 'context', confidenceLabel: 'likely', expectedImpactScore: 'medium',
      title: '[S6-E2E] FAQ content', action: 'Add a FAQPage schema block.',
    },
    {
      ...data, recommendationKey: 'stale-content',
      dimension: 'accuracy', confidenceLabel: 'confirmed', expectedImpactScore: 'high',
      title: '[S6-E2E] Stale content', action: 'Update pages older than 12 months.',
    },
  ];

  const items: ActionItem[] = [];
  for (const t of templates) {
    items.push(await seedActionItem(t));
  }
  return items;
}

// ─── RecommendationResearch ───────────────────────────────────────────────────

export async function seedResearchCitation(data: {
  recommendationKey: string;
  source:            string;
  url?:              string;
  summary:           string;
  confidenceLevel:   string;
}) {
  const [row] = await db
    .insert(schema.recommendationResearch)
    .values({
      recommendationKey: data.recommendationKey,
      source:            data.source,
      url:               data.url ?? null,
      summary:           data.summary,
      confidenceLevel:   data.confidenceLevel,
    })
    .returning();
  return row;
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

/**
 * Hard-delete all test data for an org in FK-safe order.
 * action_items deleted before brands (onDelete RESTRICT on brandId FK).
 */
export async function deleteTestDataForOrg(orgId: string): Promise<void> {
  if (!orgId) return;

  // 1. Find audit IDs for this org
  const auditRows = await db
    .select({ id: schema.audits.id })
    .from(schema.audits)
    .where(eq(schema.audits.organizationId, orgId));
  const auditIds = auditRows.map(r => r.id);

  // 2. Delete action_items (must precede brands due to RESTRICT FK)
  await db.delete(schema.actionItems).where(eq(schema.actionItems.organizationId, orgId));

  // 3. Delete citations
  if (auditIds.length > 0) {
    await db.delete(schema.citations).where(inArray(schema.citations.auditId, auditIds));
  }

  // 4. Delete audits
  await db.delete(schema.audits).where(eq(schema.audits.organizationId, orgId));

  // 5. Delete brands
  await db.delete(schema.brands).where(eq(schema.brands.organizationId, orgId));

  // 6. Delete users
  await db.delete(schema.users).where(eq(schema.users.organizationId, orgId));

  // 7. Delete org
  await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
}

/**
 * Delete test research citations seeded inline (identified by '[S6-E2E]' source prefix).
 */
export async function deleteTestResearchCitations(): Promise<void> {
  await db
    .delete(schema.recommendationResearch)
    .where(sql`source LIKE '[S6-E2E]%'`);
}
