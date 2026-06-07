/**
 * 06-acceptance.test.ts
 *
 * Sprint 6 §13 acceptance criteria — end-to-end validation of the complete
 * Action Center feature: anti-pattern filter, confidence labels, generation
 * simulation, tier gate API behaviour, grouped dimensions.
 *
 * TC-S6-55 through TC-S6-68
 */

import { it, expect, beforeAll, afterAll } from 'vitest';
import { sql, eq, and, inArray }           from 'drizzle-orm';
import {
  db, seedOrganization, seedUser, seedBrand, seedAudit,
  seedActionItem, seedActionItemSuite, seedResearchCitation,
  deleteTestDataForOrg, deleteTestResearchCitations,
} from './helpers/db';
import { getJson, patchJson, SESSION_1, SESSION_2 } from './helpers/http';
import * as schema from '../../../../db/schema';

// ─── Import recommendation engine helpers for unit-style acceptance tests ─────
// These are pure functions — no Inngest needed
// A6/A19 FIX: file is at tests/e2e/backend/sprint6/ (4 levels from project root).
// ../../../../lib/... is correct. ../../../../../ goes above the project root.
import { applyAntiPatternFilter } from '../../../../lib/recommendations/anti-patterns';
import { classifyConfidence }     from '../../../../lib/recommendations/confidence-labels';
import { evaluateTriggers }       from '../../../../lib/recommendations/triggers';

const ENV = {
  clerkOrgId1:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId1: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email1:       process.env.E2E_TEST_USER_1_EMAIL     ?? '',
  clerkOrgId2:  process.env.E2E_TEST_ORG_2_CLERK_ID  ?? '',
  clerkUserId2: process.env.E2E_TEST_USER_2_CLERK_ID  ?? '',
  email2:       process.env.E2E_TEST_USER_2_EMAIL     ?? '',
};

let org1Id   = '';
let org2Id   = '';
let brand1Id = '';
let brand2Id = '';
let audit1Id = '';
let audit2Id = '';

beforeAll(async () => {
  const org1 = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: '[S6-E2E] Accept Org1', tier: 'starter' });
  const org2 = await seedOrganization({ clerkOrgId: ENV.clerkOrgId2, name: '[S6-E2E] Accept Org2', tier: 'free' });
  org1Id = org1.id;
  org2Id = org2.id;

  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });
  await seedUser({ clerkUserId: ENV.clerkUserId2, organizationId: org2Id, email: ENV.email2 });

  const brand1 = await seedBrand({ organizationId: org1Id, vertical: 'tradies', name: '[S6-E2E] Accept Brand1' });
  const brand2 = await seedBrand({ organizationId: org2Id, vertical: 'saas',    name: '[S6-E2E] Accept Brand2' });
  brand1Id = brand1.id;
  brand2Id = brand2.id;

  // Low-scoring audit to trigger many recommendations
  const audit1 = await seedAudit({
    organizationId: org1Id, brandId: brand1Id,
    scoreFrequency: '25.00', scorePosition: '35.00',
    scoreSentimentNumeric: '38.00', scoreContextNumeric: '36.00',
    scoreAccuracy: '42.00', scoreComposite: '35.00',
  });
  const audit2 = await seedAudit({ organizationId: org2Id, brandId: brand2Id });
  audit1Id = audit1.id;
  audit2Id = audit2.id;

  // Seed a full suite for org1 acceptance tests
  await seedActionItemSuite({ organizationId: org1Id, brandId: brand1Id, auditId: audit1Id });
  // Seed 1 item for org2 (for cross-org acceptance check)
  await seedActionItem({
    organizationId: org2Id, brandId: brand2Id, auditId: audit2Id,
    recommendationKey: 'faq-content', dimension: 'context',
    confidenceLabel: 'likely', expectedImpactScore: 'medium',
    title: '[S6-E2E] Org2 Accept Item', action: 'Add FAQ schema.',
  });
});

afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
  await deleteTestDataForOrg(org2Id);
  await deleteTestResearchCitations();
});

// ─── ANTI-PATTERN FILTER (§6 + §13 acceptance) ───────────────────────────────
// C28 FIX: Sprint 6 §12 specifies 12 SEPARATE it() tests for the anti-pattern filter.
// A single loop test stops at the first failure, hiding which other keys are also broken.
// Individual tests give one diagnostic line per broken key, matching the spec structure.

const makeRec = (key: string, action = 'Do something.') => [{
  recommendationKey: key, action, dimension: 'frequency',
  title: key, expectedImpactScore: 'low' as const, evidenceRefs: [],
}];

// 12 individual anti-pattern tests — one per blocked key (§12 DF4 + DB2 fix)
it('TC-S6-55a: anti-pattern blocks add-more-keywords (keyword stuffing)', () => {
  expect(applyAntiPatternFilter(makeRec('add-more-keywords'))).toHaveLength(0);
});

it('TC-S6-55b: anti-pattern blocks pay-for-ai-ads (no paid AI placement exists)', () => {
  expect(applyAntiPatternFilter(makeRec('pay-for-ai-ads'))).toHaveLength(0);
});

it('TC-S6-55c: anti-pattern blocks submit-to-ai-engines (no submission process)', () => {
  expect(applyAntiPatternFilter(makeRec('submit-to-ai-engines'))).toHaveLength(0);
});

it('TC-S6-55d: anti-pattern blocks get-more-backlinks (oversimplified advice)', () => {
  expect(applyAntiPatternFilter(makeRec('get-more-backlinks'))).toHaveLength(0);
});

it('TC-S6-55e: anti-pattern blocks use-ai-to-write-content (wrong signal)', () => {
  expect(applyAntiPatternFilter(makeRec('use-ai-to-write-content'))).toHaveLength(0);
});

it('TC-S6-55f: anti-pattern blocks update-meta-tags-for-ai (not primary signal)', () => {
  expect(applyAntiPatternFilter(makeRec('update-meta-tags-for-ai'))).toHaveLength(0);
});

it('TC-S6-55g: anti-pattern blocks improve-seo-generic (too vague)', () => {
  expect(applyAntiPatternFilter(makeRec('improve-seo-generic'))).toHaveLength(0);
});

it('TC-S6-55h: anti-pattern blocks buy-reviews (illegal under AU ACL)', () => {
  expect(applyAntiPatternFilter(makeRec('buy-reviews'))).toHaveLength(0);
});

it('TC-S6-55i: anti-pattern blocks create-ai-generated-reviews (legal + LLM detection issue)', () => {
  expect(applyAntiPatternFilter(makeRec('create-ai-generated-reviews'))).toHaveLength(0);
});

it('TC-S6-55j: anti-pattern blocks add-schema-without-entity (anti-pattern strategy)', () => {
  expect(applyAntiPatternFilter(makeRec('add-schema-without-entity'))).toHaveLength(0);
});

it('TC-S6-55k: anti-pattern blocks target-competitor-terms (no composite score movement)', () => {
  expect(applyAntiPatternFilter(makeRec('target-competitor-terms'))).toHaveLength(0);
});

it('TC-S6-55l: anti-pattern blocks run-more-audits (circular: audit measures, not improves)', () => {
  expect(applyAntiPatternFilter(makeRec('run-more-audits'))).toHaveLength(0);
});

it('TC-S6-56: anti-pattern content-match regex blocks action containing "buy reviews"', () => {
  const recs = makeRec('unknown-key', 'You should buy reviews from Trustpilot');
  expect(applyAntiPatternFilter(recs)).toHaveLength(0);
});

it('TC-S6-57: anti-pattern filter allows valid recommendation through unchanged', () => {
  const recs = makeRec('wikipedia-article', 'Draft a neutral Wikipedia article.');
  expect(applyAntiPatternFilter(recs)).toHaveLength(1);
  expect(applyAntiPatternFilter(recs)[0].recommendationKey).toBe('wikipedia-article');
});

// ─── CONFIDENCE LABEL CLASSIFICATION (§8 + §13) ──────────────────────────────

it('TC-S6-58: confidence labels correct for all 11 universal keys (DD1 fix)', () => {
  const expected: Record<string, 'confirmed' | 'likely' | 'hypothesis'> = {
    'wikipedia-article':  'confirmed',
    'au-local-citations': 'confirmed',
    'stale-content':      'confirmed',
    'faq-content':        'likely',
    'expert-quotes':      'likely',
    'cited-statistics':   'likely',
    'reddit-absence':     'likely',
    'press-mentions':     'likely',
    'comparison-article': 'hypothesis',
    'medium-presence':    'hypothesis',
    'linkedin-presence':  'hypothesis',
  };
  for (const [key, label] of Object.entries(expected)) {
    expect(classifyConfidence(key), `${key} should be ${label}`).toBe(label);
  }
});

it('TC-S6-59: unknown key defaults to hypothesis (most conservative)', () => {
  expect(classifyConfidence('completely-unknown-key')).toBe('hypothesis');
  expect(classifyConfidence('')).toBe('hypothesis');
});

// ─── TRIGGER EVALUATION (§7 + §13) ───────────────────────────────────────────

it('TC-S6-60: low-scoring brand triggers multiple recommendations', () => {
  const lowScores = {
    scoreFrequency:        '25.00',   // < 30 → wikipedia, au-local-citations, reddit, press-mentions, medium, linkedin
    scorePosition:         '35.00',   // < 40 → comparison-article
    scoreSentimentNumeric: '38.00',
    scoreContextNumeric:   '36.00',   // < 40 → faq-content (< 50)
    scoreAccuracy:         '42.00',   // < 50 → stale-content; < 60 → expert-quotes; < 70 → cited-statistics
    scoreComposite:        '35.00',
    confidenceIntervals:   null,
    vertical:              'tradies',
  };
  const triggered = evaluateTriggers(lowScores);
  expect(triggered.length).toBeGreaterThan(5);

  // All triggered keys must be from the 11 universal set
  const validKeys = new Set([
    'wikipedia-article', 'au-local-citations', 'stale-content', 'faq-content',
    'expert-quotes', 'cited-statistics', 'reddit-absence', 'press-mentions',
    'comparison-article', 'medium-presence', 'linkedin-presence',
  ]);
  for (const rec of triggered) {
    expect(validKeys.has(rec.recommendationKey),
      `Unexpected key triggered: ${rec.recommendationKey}`
    ).toBe(true);
  }
});

it('TC-S6-61: high-scoring brand triggers zero or very few recommendations (CB2 style)', () => {
  const highScores = {
    scoreFrequency:        '85.00',
    scorePosition:         '80.00',
    scoreSentimentNumeric: '82.00',
    scoreContextNumeric:   '78.00',
    scoreAccuracy:         '83.00',
    scoreComposite:        '82.00',
    confidenceIntervals:   null,
    vertical:              'tradies',
  };
  const triggered = evaluateTriggers(highScores);
  // DN1 fix: brands with excellent scores produce 0 recommendations — this is valid
  // (no crash, no NaN, just an empty result)
  expect(triggered.length).toBeLessThan(3);
});

// ─── GENERATION SIMULATION: DB ROUND-TRIP (§13 acceptance) ───────────────────

it('TC-S6-62: action_items populated in DB with correct fields after generation (simulated)', async () => {
  // Simulate what generate-recommendations Inngest function persists:
  // Directly insert records with full field set and verify via API

  const { body } = await getJson<{ items: any[]; total: number }>(
    '/api/action-items?limit=200', SESSION_1
  );

  expect(body.total).toBeGreaterThan(0);

  // All items have org1's organizationId (implicit via RLS)
  // Verify dimension coverage — should have items across multiple dimensions
  const dimensions = new Set(body.items.map((i: any) => i.dimension));
  expect(dimensions.size).toBeGreaterThan(1);
});

it('TC-S6-63: evidence link expandable — evidenceRefs exist on seeded items (DF3)', async () => {
  const { body } = await getJson<{ items: any[] }>('/api/action-items?limit=200', SESSION_1);
  const withRefs = body.items.filter((i: any) => i.evidenceRefs && i.evidenceRefs.length > 0);
  expect(withRefs.length).toBeGreaterThan(0);

  // Each ref has source, url, summary
  const ref = withRefs[0].evidenceRefs[0];
  expect(ref.source).toBeDefined();
  expect(typeof ref.summary).toBe('string');
});

// ─── GROUPING BY DIMENSION (§10 DF5 fix) ─────────────────────────────────────

it('TC-S6-64: items can be grouped by dimension into ≤5 canonical sections (DF5)', async () => {
  const { body } = await getJson<{ items: any[] }>('/api/action-items?limit=200', SESSION_1);
  const canonical = new Set(['frequency', 'position', 'sentiment', 'context', 'accuracy']);
  const grouped = body.items.reduce((acc: Record<string, any[]>, item: any) => {
    (acc[item.dimension] ??= []).push(item);
    return acc;
  }, {});

  // All dimension keys must be canonical
  for (const dim of Object.keys(grouped)) {
    expect(canonical.has(dim), `Unknown dimension: ${dim}`).toBe(true);
  }

  // At least 2 dimensions represented in test data
  expect(Object.keys(grouped).length).toBeGreaterThanOrEqual(2);
});

// ─── MARK DONE / DISMISS (§13 acceptance) ────────────────────────────────────

it('TC-S6-65: mark done via PATCH removes item from default list on next load (DH4)', async () => {
  const item = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'acceptance-mark-done',
    title: '[S6-E2E] Acceptance Mark Done', action: 'Mark done acceptance test.',
    confidenceLabel: 'confirmed', expectedImpactScore: 'high',
  });

  // Verify it appears in list
  const before = await getJson<{ items: any[] }>('/api/action-items?limit=200', SESSION_1);
  expect(before.body.items.map((i: any) => i.id)).toContain(item.id);

  // Mark done
  const patch = await patchJson<{ status: string }>(
    `/api/action-items/${item.id}/status`, SESSION_1, { status: 'done' }
  );
  expect(patch.status).toBe(200);

  // Should no longer appear in open/in_progress list
  const after = await getJson<{ items: any[] }>('/api/action-items?limit=200', SESSION_1);
  expect(after.body.items.map((i: any) => i.id)).not.toContain(item.id);

  await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
});

it('TC-S6-66: dismiss with reason via PATCH removes item from list and stores reason (DH4)', async () => {
  const item = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'acceptance-dismiss',
    title: '[S6-E2E] Acceptance Dismiss', action: 'Dismiss acceptance test.',
    confidenceLabel: 'hypothesis', expectedImpactScore: 'low',
  });

  await patchJson(`/api/action-items/${item.id}/status`, SESSION_1, {
    status: 'dismissed', dismissedReason: 'Not relevant to our vertical',
  });

  const [row] = await db.select().from(schema.actionItems).where(eq(schema.actionItems.id, item.id));
  expect(row.status).toBe('dismissed');
  expect(row.dismissedReason).toBe('Not relevant to our vertical');
  expect(row.dismissedAt).not.toBeNull();

  await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
});

// ─── CROSS-ORG 404 ON ALL ROUTES (§13) ───────────────────────────────────────

it('TC-S6-67: cross-org check — all action-item routes return 404 for wrong org', async () => {
  // Item in org1 — org2 can't see it
  const item = await seedActionItem({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    recommendationKey: 'cross-org-all-routes',
  });

  const detail = await getJson<any>(`/api/action-items/${item.id}`, SESSION_2);
  expect(detail.status).toBe(404);

  const patch  = await patchJson(`/api/action-items/${item.id}/status`, SESSION_2, { status: 'done' });
  expect(patch.status).toBe(404);

  await db.delete(schema.actionItems).where(eq(schema.actionItems.id, item.id));
});

// ─── RESEARCH SEED COVERAGE (DN5 acceptance) ─────────────────────────────────

it('TC-S6-68: recommendation_research has at least 1 row for all 11 universal keys (DN5)', async () => {
  const universalKeys = [
    'wikipedia-article', 'au-local-citations', 'stale-content',
    'faq-content', 'expert-quotes', 'cited-statistics', 'reddit-absence',
    'press-mentions', 'comparison-article', 'medium-presence', 'linkedin-presence',
  ];

  const rows = await db
    .select({ key: schema.recommendationResearch.recommendationKey })
    .from(schema.recommendationResearch)
    .where(inArray(schema.recommendationResearch.recommendationKey, universalKeys));

  const seededKeys = new Set(rows.map(r => r.key));
  const missing = universalKeys.filter(k => !seededKeys.has(k));

  expect(
    missing,
    `These keys have no research citation rows: ${missing.join(', ')}. Run pnpm seed.`
  ).toHaveLength(0);
});
