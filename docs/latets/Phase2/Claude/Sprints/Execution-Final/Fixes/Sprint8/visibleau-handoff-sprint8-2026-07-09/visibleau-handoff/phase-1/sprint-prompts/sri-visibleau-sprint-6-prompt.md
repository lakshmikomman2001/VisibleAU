# Sprint 6 — Action Center

**Sprint:** 6 of 12
**Estimated effort:** 30-40 hours (~4-5 weekends at 8 hrs/week)
**Goal:** Turn audit results into recommended actions. Research-backed recommendations with Confirmed/Likely/Hypothesis confidence labels. Anti-pattern filter prevents common bad advice. Tier-gated (Starter+).
**Prerequisites:** Sprint 5 complete. Vertical packs in DB. Audits producing multidimensional scores.
**Out of scope:** Recommendation effectiveness tracking (v1.1), drift-triggered recommendations (Sprint 8), recommendation marketplace (out of scope entirely).

---

## 0. Read first

1. `CLAUDE.md`
2. `sri-geo-aeo-prd-v1.md` v1.15 §8 Module 5 — Action Center spec (11 universal action types + confidence labels Confirmed/Likely/Hypothesis) — and §8.5 anti-pattern table for the 12 anti-patterns (7 v1.0 + 5 v1.3)
3. `sri-visibleau-foundations.md` v1.10 §3 — `action_items` schema

---

## 1. What ships this sprint

- ✓ Schema: `action_items` table
- ✓ Schema: `recommendation_research` table (citations backing each recommendation type)
- ✓ Confidence-label classification (categorical: Confirmed | Likely | Hypothesis)
- ✓ Anti-pattern filter — 12 patterns (4 from PRD §8 + 8 additional catching real harms like buying reviews illegal in AU) — blocks bad-advice recommendations
- ✓ **11 universal action types per PRD §8 Module 5**, each with named research citation:
  1. **"You're not on Wikipedia"** → AI-drafted Wikipedia article suggestion *(Citation: Tinuiti Q1 2026 — Wikipedia = 47.9% of ChatGPT's top-10 citation share)*
  2. **"Your FAQ content needs improvement"** → AI-generated FAQ blocks for main page body *(Citation: SE Ranking AI Mode research Dec 2025 — pages with FAQ blocks in main content average 4.9 citations vs 4.4 without; FAQ schema markup itself shows ~zero impact)*
  3. **"Add expert quotes to top pages"** → AI-suggested quote opportunities + outreach templates *(Citation: Princeton GEO study 2024 — expert quotes boost AI visibility 41% across 10,000 queries)*
  4. **"Add cited statistics to thin content"** → AI-suggested data points + sources *(Citation: Princeton GEO 2024 — cited statistics boost visibility 30%; authoritative source references up to 115% for lower-ranked content)*
  5. **"Update stale content"** → list of pages > 2 months old, prioritised by traffic *(Citation: SE Ranking Dec 2025 — pages updated within last 2 months average 5.0 citations vs 3.9 for content > 2 years old)*
  6. **"Comparison article needed"** → AI-drafted "[Competitor] vs [You]" article outline *(Citation: HubSpot AEO Competitor Analysis 2026 — comparison and "best for" queries are high-intent and frequently answered by LLMs)*
  7. **"Reddit absence (Perplexity-critical)"** → AI-suggested Reddit threads to participate in genuinely *(Citation: Tinuiti Jan 2026 — Reddit = 24% of all Perplexity citations)*
  8. **"Medium presence (Gemini-critical)"** → AI-drafted Medium article suggestions *(Citation: Tinuiti Q1 2026 — Gemini favors Medium and first-party content; Reddit = only 0.1% of Gemini citations)*
  9. **"LinkedIn presence (rapidly rising)"** → suggested LinkedIn content topics for founder/team *(Citation: Profound, 1.4M citations tracked — LinkedIn surged from outside top 20 to #5 most-cited on ChatGPT between Nov 2025 - Feb 2026)*
  10. **"Press mentions low"** → AI-drafted press release for product/business update *(Citation: TEAM LEWIS PR / Machine Relations citation drift research — earned media is one of the most powerful GEO levers; creates corroboration redundancy that survives citation drift)*
  11. **"AU local citations weak"** → checklist of AU directories with submission links *(Citation: Local SEO signals — NAP consistency, GMB completeness, AU directory presence — heavily weight LLM responses for "near me" and suburb-level queries. No current GEO tool integrates these. VisibleAU original.)*
- ✓ Per-action-type metadata: why-it-matters, estimated effort (low/medium/high), expected lift (with research-derived effect size), per-engine impact ranking, AI-generated draft of the fix, mark-complete tracking
- **DE3 fix — "re-audit trigger 14 days after marking complete" listed as Sprint 6 deliverable but conflicts with §15 which explicitly defers "drift-triggered recommendations" to Sprint 8.** The PATCH endpoint has no scheduling logic. Corrected: re-audit trigger is **Sprint 8** scope. Sprint 6 delivers mark-complete tracking only (doneAt timestamp). Sprint 8 adds the scheduled Inngest function that fires a new audit 14 days after `doneAt` is set.
- ✓ Recommendation generation engine: triggered by `audit.complete` event
- ✓ Action Center page at `/action-center` with recommendations grouped by dimension
- ✓ Recommendation card UI: title, action, confidence badge, evidence-link expandable to research citations
- ✓ "Mark as done" + "Dismiss" actions per recommendation
- ✓ Tier gating: Free can SEE Action Center (count of recommendations) but recommendations are paywalled. Starter+ unlocks content.
- ✓ Sidebar item activates (was placeholder in Sprint 4)
- ✓ Optional per-vertical overlays on top of the universal 11 (e.g., AU plumber-specific phrasing of the Reddit recommendation) — but the base is universal-with-citations, not per-vertical-with-confidence-labels

**Definition of done:** Audit completes → recommendations generate within 30s using the 11 universal action types → Action Center page shows them grouped by dimension → each card links to research citation → Free user sees blurred recommendations with upgrade CTA → Starter+ user can mark done/dismiss → anti-pattern filter prevents at least one recommendation type from ever appearing.

---

## 2. Dependencies to install

```bash
# No new external deps — built on existing stack
```

---

## 3. Environment variables

No new env vars.

---

## 4. Project structure additions

```
db/schema/
├── action-items.ts                       # NEW
└── recommendation-research.ts            # NEW

db/seed/
└── recommendations/
    ├── tradies-recommendations.ts        # ~25 templates
    ├── allied-health-recommendations.ts  # ~25 templates
    └── saas-recommendations.ts           # ~25 templates

lib/
├── recommendations/
│   ├── index.ts                          # DE1 fix: NOT the same as the Inngest function.
│   │                                     # DG1 fix: body now specified below.
│   ├── confidence-labels.ts              # classify by research backing
│   ├── anti-patterns.ts                  # 12 patterns + filter
│   ├── triggers.ts                       # score thresholds that trigger each type
│   └── types.ts                          # DC4 fix — content never specified; all other lib/recommendations files import from here:
│       #
│       # export interface TriggerContext {
│       #   scoreFrequency: string | null;      // Sprint 3 numeric columns (nullable)
│       #   scorePosition: string | null;
│       #   scoreSentimentNumeric: string | null;
│       #   scoreContextNumeric: string | null;
│       #   scoreAccuracy: string | null;
│       #   scoreComposite: string | null;
│       #   confidenceIntervals: unknown;
│       #   vertical: string;
│       # }
│       #
│       # export interface TriggeredRecommendation {
│       #   recommendationKey: string;      // e.g. 'wikipedia-article', 'reddit-absence'
│       #   dimension: string;              // 'frequency'|'position'|'sentiment'|'context'|'accuracy'
│       #   title: string;
│       #   action: string;
│       #   expectedImpactScore: 'high' | 'medium' | 'low';
│       #   evidenceRefs: Array<{ source: string; url: string; summary: string }>;
│       # }
│       #
│       # export interface RecommendationWithConfidence extends TriggeredRecommendation {
│       #   confidenceLabel: 'confirmed' | 'likely' | 'hypothesis';
│       # }

inngest/functions/
└── generate-recommendations.ts           # NEW — triggered by audit.complete event

app/(auth)/
└── action-center/
    └── page.tsx                          # NEW

app/api/
└── action-items/
    ├── route.ts                          # GET (list for org)
    └── [id]/
        ├── route.ts                      # GET (single) — DD5 spec
        │                                 # DM3 fix: both route files must exist as separate files.
        │                                 # [id]/route.ts = GET only; [id]/status/route.ts = PATCH only.
        │                                 # Next.js cannot split GET/PATCH across sub-paths in one file.
        └── status/route.ts               # PATCH (mark done / dismiss) — DB3+DJ1 spec

components/domain/
└── action-center/
    ├── recommendation-card.tsx           # DG2 fix: never specified. Renders one action item in the grouped list.
    │   # 'use client' (has onClick). Props: item: ActionItem, isFree: boolean.
    │   # DH2 fix: prototype uses 'priority: High|Medium|Low' but DB field is 'expectedImpactScore: high|medium|low'.
    │   # Card must read item.expectedImpactScore and map it to display:
    │   # const IMPACT_TONE = { high: 'danger', medium: 'warning', low: 'info' };
    │   # const IMPACT_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };
    │   # Renders: <Badge tone={IMPACT_TONE[item.expectedImpactScore]}>{IMPACT_LABEL[item.expectedImpactScore]}</Badge>
    │   # | title | impact line (expectedImpactScore text) | citation count (evidenceRefs.length)
    │   # DJ5 fix: prototype shows narrative '+2-4 visibility points' as impact line.
    │   # action_items schema stores expectedImpactScore enum ('high'|'medium'|'low'), not a narrative.
    │   # Sprint 6 impact line: use the enum mapped to human copy:
    │   # const IMPACT_LINE = { high: 'High impact — significant visibility lift expected',
    │   #                        medium: 'Medium impact — moderate visibility improvement',
    │   #                        low: 'Low impact — minor or indirect benefit' };
    │   # The narrative '+X-Y visibility points' is Sprint 8 scope (requires per-engine scoring).
    │   # | ConfidenceBadge | ChevronRight → navigates to /action-center/[item.id]
    │   # Mark done / Dismiss live on ActionDetail page NOT the list card.
    │   # Free tier: wraps body except title in <TierGate isFree={isFree}>.
    │   # DI3 fix: prototype shows 'engines: [...]' badge on cards (per-engine impact ranking).
    │   # action_items schema has NO engines column. PRD §1 says "per-engine impact ranking"
    │   # but this is Sprint 8 scope. Sprint 6 card omits the engines badge.
    │   # Sprint 8 adds engines column and ranking logic.
    ├── confidence-badge.tsx              # DG3 fix: colours never specified despite acceptance requiring them.
    │   # Maps confidenceLabel to Badge tone:
    │   #   'confirmed'  → tone='success' (green)  — acceptance: Confirmed (green)
    │   #   'likely'     → tone='warning' (amber)  — acceptance: Likely (amber)
    │   #   'hypothesis' → tone='neutral' (gray)   — acceptance: Hypothesis (gray)
    │   # Props: { label: 'confirmed' | 'likely' | 'hypothesis' }
    │   # const TONE_MAP = { confirmed: 'success', likely: 'warning', hypothesis: 'neutral' };
    │   # const LABEL_MAP = { confirmed: 'Confirmed', likely: 'Likely', hypothesis: 'Hypothesis' };
    │   # export function ConfidenceBadge({ label }: { label: string }) {
    │   #   return <Badge tone={TONE_MAP[label] ?? 'neutral'}>{LABEL_MAP[label] ?? label}</Badge>;
    │   # }
    ├── evidence-link.tsx                 # Click to expand research citations — DF3 fix: never specified.
    │   # 'use client' — expand/collapse state.
    │   # interface EvidenceLinkProps { evidenceRefs: Array<{ source: string; url: string; summary: string }> }
    │   # Collapsed: "<ChevronDown /> View research (N citations)"
    │   # Expanded: renders each evidenceRef as:
    │   #   <a href={ref.url} target="_blank">{ref.source}</a>
    │   #   <p>{ref.summary}</p>
    │   # If evidenceRefs is empty, renders nothing (operator-only research not surfaced to users).
    ├── dimension-group.tsx               # Groups recs by dimension — DF5 fix: grouping logic never specified.
    │   # 'use client'. Receives ActionItem[] and renders 5 sections in fixed order.
    │   # DIMENSION_LABELS: { frequency: 'Frequency', position: 'Position', sentiment: 'Sentiment',
    │   #                      context: 'Context', accuracy: 'Accuracy' }
    │   # Group items: Object.groupBy(items, i => i.dimension)
    │   # DL1 fix: Object.groupBy requires Node 21+ / Node 20.10+.
    │   # CI config uses node-version:'20' — early 20.x patches lack it.
    │   # Use safe groupBy helper instead:
    │   # function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
    │   #   return arr.reduce((acc, item) => {
    │   #     const k = key(item);
    │   #     (acc[k] ??= []).push(item);
    │   #     return acc;
    │   #   }, {} as Record<string, T[]>);
    │   # }
    │   # const grouped = groupBy(items, i => i.dimension);
    │   # Skip empty sections (no recs triggered for that dimension) — don't render blank headers.
    │   # Each section: <h2>{DIMENSION_LABELS[dim]}</h2> + stack of <RecommendationCard> components.
    └── tier-gate.tsx                     # Blurs content for Free

tests/
├── unit/
│   └── recommendations/
│       ├── anti-patterns.test.ts         # Each of 12 patterns blocks correctly
│       ├── confidence-labels.test.ts
│       └── triggers.test.ts
└── integration/
    └── recommendations/
        └── generate-on-audit-complete.test.ts
```

**DG1 fix — `lib/recommendations/index.ts` body:**

```typescript
// lib/recommendations/index.ts
// DK5 fix: 'import { db as DbClient }' then 'db: typeof DbClient' creates a singleton instance type.
// When tests inject a mock DB or Inngest passes its own client, TypeScript may complain.
// Fix: use the Drizzle type from the client module directly.
import { db } from '@/db/client';
import { recommendationResearch } from '@/db/schema';
import { inArray } from 'drizzle-orm';
import { evaluateTriggers } from './triggers';
import { applyAntiPatternFilter } from './anti-patterns';
import { classifyConfidence } from './confidence-labels';
import type { TriggerContext, RecommendationWithConfidence } from './types';

type DbClient = typeof db;  // extract the inferred type from the singleton

export async function buildRecommendations(
  ctx: TriggerContext,
  dbClient: DbClient,
): Promise<RecommendationWithConfidence[]> {
  const triggered  = evaluateTriggers(ctx);
  const filtered   = applyAntiPatternFilter(triggered);
  const withConf   = filtered.map(rec => ({ ...rec, confidenceLabel: classifyConfidence(rec.recommendationKey) }));

  // Enrich evidenceRefs from recommendation_research table:
  const keys       = [...new Set(withConf.map(r => r.recommendationKey))];
  const research   = keys.length > 0
    ? await dbClient.select().from(recommendationResearch).where(inArray(recommendationResearch.recommendationKey, keys))
    : [];
  // DL1 fix: Object.groupBy requires Node 21+. Project CI uses Node 20. Use reduce instead:
  const byKey = research.reduce((acc, r) => {
    (acc[r.recommendationKey] ??= []).push(r);
    return acc;
  }, {} as Record<string, typeof research>);

  return withConf.map(rec => ({
    ...rec,
    evidenceRefs: (byKey[rec.recommendationKey] ?? []).map(r => ({
      source: r.source, url: r.url ?? '', summary: r.summary,
    })),
  }));
}
```

---

### `action_items.ts`

```typescript
import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
// DC3 fix: uniqueIndex needed for (auditId, recommendationKey) idempotency constraint.
import { audits } from './audits';
import { brands } from './brands';
import { organizations } from './organizations';

export const actionItems = pgTable('action_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  brandId: uuid('brand_id').references(() => brands.id).notNull(),
  // DN3 fix: no onDelete action specified — Drizzle defaults to RESTRICT.
  // This is intentional: Sprint 4 soft-deletes brands (sets deletedAt); brand rows are never
  // hard-deleted. RESTRICT prevents accidental hard-deletes at the DB level.
  // action_items for soft-deleted brands remain in the DB (status: done/dismissed naturally
  // over time). If a brand is ever hard-deleted in a future sprint, the FK must be relaxed first.
  auditId: uuid('audit_id').references(() => audits.id).notNull(),
  recommendationKey: text('recommendation_key').notNull(),  // 'add-business-schema', 'expand-suburb-pages', etc.
  dimension: text('dimension').notNull(),  // 'frequency' | 'position' | 'sentiment' | 'context' | 'accuracy'
  title: text('title').notNull(),
  action: text('action').notNull(),  // The "do this" sentence
  confidenceLabel: text('confidence_label').notNull(),  // 'confirmed' | 'likely' | 'hypothesis'
  expectedImpactScore: text('expected_impact_score').notNull(),
  // DM4 fix: was nullable (no .notNull()). UNIVERSAL_TEMPLATES always sets this field, but a
  // direct DB insert or future API could omit it, producing NULL → IMPACT_TONE[null] = undefined.
  // Add .notNull() to enforce at DB level; IMPACT_TONE map should also have a fallback:
  // const IMPACT_TONE = { high: 'danger', medium: 'warning', low: 'info', default: 'neutral' };
  // Use: IMPACT_TONE[item.expectedImpactScore] ?? IMPACT_TONE.default
  evidenceRefs: jsonb('evidence_refs').default('[]').notNull(),  // [{ source, url, summary }]
  status: text('status').default('open').notNull(),  // 'open' | 'in_progress' | 'done' | 'dismissed'
  dismissedReason: text('dismissed_reason'),
  doneAt: timestamp('done_at', { withTimezone: true }),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  // DA2 fix: updatedAt missing — PATCH /api/action-items/[id]/status modifies status/doneAt/dismissedAt
  // with no audit trail timestamp. Every mutable Foundations record needs updatedAt.
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // DC3 fix: no unique constraint — Inngest retries on failure reinsert identical recommendations.
  // The Action Center shows duplicates with no way to distinguish them.
  // Unique on (auditId, recommendationKey) ensures idempotent generation.
  uniqueAuditRec: uniqueIndex('action_items_audit_rec_idx').on(table.auditId, table.recommendationKey),
}));
```

### `recommendation_research.ts`

```typescript
import { pgTable, uuid, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const recommendationResearch = pgTable('recommendation_research', {
  id: uuid('id').primaryKey().defaultRandom(),
  recommendationKey: text('recommendation_key').notNull(),  // FK by string to seed data
  source: text('source').notNull(),  // 'OpenAI docs' | 'Anthropic research' | 'Google Search central' | 'operator-observed'
  url: text('url'),
  summary: text('summary').notNull(),
  confidenceLevel: text('confidence_level').notNull(),
  // DL4 fix: confidenceLevel is seeded but never read by buildRecommendations.
  // buildRecommendations uses classifyConfidence(key) from the hardcoded CONFIDENCE_LEVELS map.
  // The research table's confidenceLevel is DISPLAY-ONLY metadata for the operator/admin view.
  // It is NOT used to override the confidence classification at runtime.
  // Future Sprint 7 may use it to reconcile research-observed confidence with the map.
  // In Sprint 6: seed it accurately per the map, but do not read it in any application code.
  citedAt: timestamp('cited_at', { withTimezone: true }),
  retrievedAt: timestamp('retrieved_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // DE4 fix: recommendationKey queried in enrich-evidence step (WHERE recommendationKey = X).
  // Without index, every enrichment does a full table scan. Small table now, but index is cheap.
  recKeyIdx: index('recommendation_research_key_idx').on(table.recommendationKey),
}));
```

---

## 6. The 12 anti-patterns (do not generate these recommendations)

Per PRD §8.5 anti-pattern table. The filter `lib/recommendations/anti-patterns.ts` blocks these:

**v1.0 (7 patterns):**
1. "Add more keywords" — keyword stuffing is harmful, not helpful for AI search
2. "Pay for ads on ChatGPT" — paid ads don't influence brand_mention rate; misleading advice
3. "Submit your site to AI search engines" — no submission process exists; misleading
4. "Get more backlinks" — partial truth, but oversimplified; blocked unless we have specific link-type guidance
5. "Use AI to write your content" — distinct from the actual signal we care about
6. "Update meta tags for AI" — meta tags aren't the primary signal
7. "Generic 'improve SEO'" — too vague to be actionable

**v1.3 (5 additional patterns):**
8. "Buy reviews" — illegal in AU under ACL; explicit block
9. "Create AI-generated reviews" — same legal issue + LLM detection
10. "Add structured data without entity verification" — schema-only without entity strategy is anti-pattern
11. "Target competitor branded terms" — misleading; doesn't move composite score
12. "Run more audits to improve score" — circular; the audit measures, doesn't improve

The filter is implemented as a deny-list of `recommendationKey` strings + a content-match regex on `action` text.

**DB2 fix — neither the deny-list nor regex were ever written:**

```typescript
// lib/recommendations/anti-patterns.ts

// v1.0 patterns (7) — matched by recommendationKey:
const BLOCKED_KEYS = new Set([
  'add-more-keywords',          // keyword stuffing
  'pay-for-ai-ads',             // no paid placement mechanism exists in AI search
  'submit-to-ai-engines',       // no submission process exists
  'get-more-backlinks',         // oversimplified
  'use-ai-to-write-content',    // distinct from citability signal
  'update-meta-tags-for-ai',    // not a primary signal
  'improve-seo-generic',        // too vague
  // v1.3 patterns (5):
  'buy-reviews',                // illegal under AU ACL
  'create-ai-generated-reviews',// same legal issue + LLM detection
  'add-schema-without-entity',  // schema-only without entity strategy
  'target-competitor-terms',    // doesn't move composite score
  'run-more-audits',            // circular: audit measures, doesn't improve
]);

// Content-match regex catches generated variants that don't match exact keys:
const BLOCKED_PATTERNS = /\b(buy reviews|purchase reviews|keyword.?stuff|meta.?tag.*AI|submit.*AI.?engine|more backlink|AI.?generated review)\b/i;

export function applyAntiPatternFilter<T extends { recommendationKey: string; action: string }>(
  recs: T[]
): T[] {
  return recs.filter(r =>
    !BLOCKED_KEYS.has(r.recommendationKey) &&
    !BLOCKED_PATTERNS.test(r.action)
  );
}
```

---

## 7. Recommendation generation

Triggered by `audit.complete` event:

```typescript
// inngest/functions/generate-recommendations.ts
export const generateRecommendations = inngest.createFunction(
  { id: 'generate-recommendations' },
  // DA3 fix: Sprint 6 used { event: 'audit.complete' } but Sprint 2 fires the event with
  // name: 'audit/complete' (slash separator, Inngest convention). Verify by checking Sprint 2:
  //   step.sendEvent('audit-complete-email', { name: 'audit/complete', data: { auditId } })
  // If Sprint 2 uses 'audit/complete', use that here. If it uses 'audit.complete', use that.
  // CANONICAL: use 'audit/complete' (slash) — this is Inngest's recommended format per docs.
  // Both functions (email + recommendations) subscribe to the same event.
  { event: 'audit/complete' },
  async ({ event, step }) => {
    const { auditId } = event.data;
    // DC2 fix: loadAuditWithScores(auditId) was called but never specified.
    // It must query the audits table and return Sprint 3's score columns:
    const audit = await step.run('load-audit', async () => {
      const [row] = await db.select({
        id: audits.id,
        organizationId: audits.organizationId,
        brandId: audits.brandId,
        scoreFrequency: audits.scoreFrequency,
        scorePosition: audits.scorePosition,
        scoreSentimentNumeric: audits.scoreSentimentNumeric,
        scoreContextNumeric: audits.scoreContextNumeric,
        scoreAccuracy: audits.scoreAccuracy,
        scoreComposite: audits.scoreComposite,
        confidenceIntervals: audits.confidenceIntervals,
        status: audits.status,
      }).from(audits).where(eq(audits.id, auditId));
      if (!row || row.status !== 'complete') throw new Error(`Audit ${auditId} not complete`);
      return row;
    });
    const brand = await step.run('load-brand', async () => {
      const [row] = await db.select({ id: brands.id, vertical: brands.vertical, region: brands.region }).from(brands).where(eq(brands.id, audit.brandId));
      return row;
    });

    // DF2 fix: DE1 said buildRecommendations() is called inside a step.run() but the Inngest
    // function never actually called it — evaluateTriggers/filter/confidence were all inlined.
    // Reconcile: call lib/recommendations/index.ts buildRecommendations from a dedicated step.
    // This keeps business logic in lib/ (testable without Inngest) and step orchestration in Inngest.
    const enriched = await step.run('build-recommendations', async () => {
      const { buildRecommendations } = await import('@/lib/recommendations');
      return buildRecommendations({
        scoreFrequency: audit.scoreFrequency,
        scorePosition: audit.scorePosition,
        scoreSentimentNumeric: audit.scoreSentimentNumeric,
        scoreContextNumeric: audit.scoreContextNumeric,
        scoreAccuracy: audit.scoreAccuracy,
        scoreComposite: audit.scoreComposite,
        confidenceIntervals: audit.confidenceIntervals,
        vertical: brand.vertical,
      }, db);
    });

    // DF2: buildRecommendations (called above) handles triggers→filter→confidence→enrich.
    // enriched is a RecommendationWithConfidence[] with populated evidenceRefs.

    await step.run('persist-recommendations', async () => {
      // DN1 fix: if no recommendations triggered (brand with excellent scores across all dimensions),
      // enriched = []. db.insert().values([]) throws "values cannot be empty array" in Drizzle.
      // Skip the insert entirely — a brand with no triggered recommendations is valid and expected.
      if (enriched.length === 0) return { skipped: true, reason: 'no_recommendations_triggered' };

      // DD3 fix: DC3 added unique constraint (auditId, recommendationKey) but INSERT
      // still used plain db.insert() — Inngest retries threw unique constraint violations.
      // .onConflictDoNothing() makes the generation step fully idempotent.
      await db.insert(actionItems).values(
        enriched.map(rec => ({  // DE2: use enriched (has evidenceRefs) not withConfidence
          organizationId: audit.organizationId,
          brandId: audit.brandId,
          auditId,
          ...rec,
        }))
      ).onConflictDoNothing();
    });
  }
);
```

### Trigger examples

**DD2 fix — `evaluateTriggers()` body never specified. Signature and data flow:**

```typescript
// lib/recommendations/triggers.ts
import type { TriggerContext, TriggeredRecommendation } from './types';

// The 11 universal action templates are hardcoded here (not queried from DB at trigger time).
// The DB seed populates recommendation_research for the evidence links shown in the UI.
// evaluateTriggers returns an array of triggered recommendations based on score thresholds.
const UNIVERSAL_TEMPLATES: Array<{
  key: string; dimension: string; title: string; action: string;
  expectedImpactScore: 'high' | 'medium' | 'low';
  threshold: (ctx: TriggerContext) => boolean;
}> = [
  {
    key: 'wikipedia-article', dimension: 'frequency',
    title: 'Add a Wikipedia entry for {brandName}',
    action: 'Draft a neutral, citation-backed Wikipedia article about your business using the AI template below.',
    expectedImpactScore: 'high',
    threshold: ctx => parseFloat(ctx.scoreFrequency ?? '100') < 40,
  },
  {
    key: 'au-local-citations', dimension: 'frequency',
    title: 'Your AU local directory listings are incomplete',
    action: 'Submit your business to hipages, Yellow Pages AU, ServiceSeeking, and Word of Mouth with consistent NAP data.',
    expectedImpactScore: 'high',
    threshold: ctx => parseFloat(ctx.scoreFrequency ?? '100') < 50,
  },
  // ... remaining 9 universal types with analogous structure
  // DL2 fix: all 11 must be specified — Claude Code cannot invent thresholds/dimensions safely:
  { key: 'faq-content',          dimension: 'context',
    title: 'Add FAQ schema to your main service page',
    action: 'Add a FAQPage schema block answering "What suburbs do you service?" and "What is your call-out fee?".',
    expectedImpactScore: 'medium' as const,
    threshold: ctx => parseFloat(ctx.scoreContextNumeric ?? '100') < 50 },
  { key: 'expert-quotes',        dimension: 'accuracy',
    title: 'Add attributed expert quotes to your about page',
    action: 'Add 2-3 quotes from industry bodies (e.g. Master Plumbers AU) with attribution and date.',
    expectedImpactScore: 'medium' as const,
    threshold: ctx => parseFloat(ctx.scoreAccuracy ?? '100') < 60 },
  { key: 'cited-statistics',     dimension: 'accuracy',
    title: 'Cite verifiable statistics on your service pages',
    action: 'Add 1-2 industry statistics with source links (e.g. WaterNSW, ABS building permits).',
    expectedImpactScore: 'medium' as const,
    threshold: ctx => parseFloat(ctx.scoreAccuracy ?? '100') < 70 },
  { key: 'stale-content',        dimension: 'accuracy',
    title: 'Update pages that haven\'t changed in 12+ months',
    action: 'Add a "Last updated" date and refresh pricing, availability, and contact details.',
    expectedImpactScore: 'high' as const,
    threshold: ctx => parseFloat(ctx.scoreAccuracy ?? '100') < 50 },
  { key: 'comparison-article',   dimension: 'position',
    title: 'Write a service comparison guide',
    action: 'Publish a 600-word guide comparing your service type with alternatives, citing pros/cons.',
    expectedImpactScore: 'medium' as const,
    threshold: ctx => parseFloat(ctx.scorePosition ?? '100') < 40 },
  { key: 'reddit-absence',       dimension: 'frequency',
    title: 'Get mentioned in relevant Reddit threads',
    action: 'Identify 3 active subreddits (r/sydney, r/ausfinance, r/homeimprovement) and contribute helpful answers.',
    expectedImpactScore: 'medium' as const,
    threshold: ctx => parseFloat(ctx.scoreFrequency ?? '100') < 45 },
  { key: 'medium-presence',      dimension: 'frequency',
    title: 'Publish a how-to article on Medium',
    action: 'Write a 500-word practical guide on a common customer question. Link back to your service page.',
    expectedImpactScore: 'low' as const,
    threshold: ctx => parseFloat(ctx.scoreFrequency ?? '100') < 35 },
  { key: 'linkedin-presence',    dimension: 'frequency',
    title: 'Create or update your LinkedIn company page',
    action: 'Complete all sections: about, services, location. Post one update per fortnight.',
    expectedImpactScore: 'low' as const,
    threshold: ctx => parseFloat(ctx.scoreFrequency ?? '100') < 30 },
  { key: 'press-mentions',       dimension: 'frequency',
    title: 'Pitch your business story to local AU media',
    action: 'Contact one AU trade publication or local news outlet with a newsworthy angle (e.g. milestone, award).',
    expectedImpactScore: 'medium' as const,
    threshold: ctx => parseFloat(ctx.scoreFrequency ?? '100') < 40 &&
                      parseFloat(ctx.scoreSentimentNumeric ?? '100') > 50 },
];

export function evaluateTriggers(ctx: TriggerContext): TriggeredRecommendation[] {
  return UNIVERSAL_TEMPLATES
    .filter(t => t.threshold(ctx))
    .map(({ key, dimension, title, action, expectedImpactScore }) => ({
      recommendationKey: key, dimension, title, action, expectedImpactScore, evidenceRefs: [],
    }));
}
```
The `evidenceRefs` are enriched after trigger evaluation by querying the `recommendation_research` table for rows where `recommendationKey` matches.

- `scoreFrequency < 30` → "Expand brand presence on local directories" (Confirmed)
- `scorePosition > 70` → "Improve content depth for primary services" (Likely) — high position score means appearing later in lists
- `scoreSentimentNumeric < 40` → "Audit recent reviews and customer feedback channels" (Confirmed)
  **DB1 fix:** `sentiment.negative > 0.2` was wrong — Sprint 3 has no `sentiment.negative` field.
  `scoreSentimentNumeric` is 0-100 where lower = worse sentiment. Threshold < 40 ≈ negative-leaning.
- `scoreContextNumeric < 40` → "Differentiate brand positioning" (Hypothesis — requires entity strategy)
  **DB4 fix:** `context = 'commodified' in >50% mentions` required citation-level aggregation unavailable
  at trigger evaluation time. Use the aggregate `scoreContextNumeric` (< 40 = mostly commodified/generic).
- `scoreAccuracy < 70` → "Update outdated business info on directory listings" (Confirmed)

Total ~25 trigger types per vertical, each with its own threshold logic.

---

## 8. Confidence label classification

```typescript
// lib/recommendations/confidence-labels.ts

// DD1 fix: CONFIDENCE_LEVELS used old per-vertical keys that predate the v1.1 architectural change.
// None matched the 11 universal action type keys — classifyConfidence always returned undefined.
// Updated to the 11 canonical keys from §1 PRD §8 Module 5.
const CONFIDENCE_LEVELS: Record<string, 'confirmed' | 'likely' | 'hypothesis'> = {
  // Confirmed — backed by research with ≥20% effect size
  'wikipedia-article':   'confirmed',  // Princeton GEO: Wikipedia = 47.9% of ChatGPT top-10 citations
  'au-local-citations':  'confirmed',  // Local SEO: NAP + AU directories heavily weight LLM local responses
  'stale-content':       'confirmed',  // SE Ranking: updated content 5.0 vs 3.9 avg citations
  // Likely — independent research with moderate effect size
  'faq-content':         'likely',     // SE Ranking: FAQ in main content 4.9 vs 4.4 avg citations
  'expert-quotes':       'likely',     // Princeton GEO: expert quotes +41% across 10,000 queries
  'cited-statistics':    'likely',     // Princeton GEO: cited statistics +30% visibility
  'reddit-absence':      'likely',     // Tinuiti: Reddit = 24% of all Perplexity citations
  'press-mentions':      'likely',     // TEAM LEWIS: earned media = strong GEO lever
  // Hypothesis — emerging pattern, limited measurement evidence
  'comparison-article':  'hypothesis', // HubSpot AEO: high-intent but causality unproven
  'medium-presence':     'hypothesis', // Tinuiti: Gemini favours Medium — platform dependency risk
  'linkedin-presence':   'hypothesis', // Profound: LinkedIn surged to #5 — too recent to confirm
};

export function classifyConfidence(key: string): 'confirmed' | 'likely' | 'hypothesis' {
  return CONFIDENCE_LEVELS[key] ?? 'hypothesis';  // unknown keys default to most conservative
}
```

---

## 9. API routes

### `GET /api/action-items`

- Auth required + `setRlsContext(db, currentUser.organizationId)`
- Returns open + in_progress action items for current org
- Query params: `?brandId=X`, `?status=open`, `?dimension=frequency`
- **DK1 fix — no pagination; Agency org 5 brands × 11 recs × 12 audits = 660+ unbounded items.** Add: `?limit=50` (default, max 200), `?page=1`. Action Center page fetches with `limit=200` to avoid pagination UI complexity in Sprint 6.
- **DK4 fix — no ORDER BY; dimension-group.tsx renders sections in DB insertion order.** Add `ORDER BY dimension ASC, created_at DESC` so groups render in canonical order (accuracy, context, frequency, position, sentiment — alphabetical matches DF5's canonical order after `dimension-group.tsx` re-sorts them).
- **DN2 fix — actual Drizzle query never written. Spec said "returns open + in_progress" but no WHERE clause ever shown:**
  ```typescript
  // Condensed route body (auth + setRlsContext done first per DF1 fix):
  const activeStatuses = statusParam ? [statusParam] : ['open', 'in_progress'];
  const conditions = [
    inArray(actionItems.status, activeStatuses),
    ...(brandId   ? [eq(actionItems.brandId, brandId)]    : []),
    ...(dimension ? [eq(actionItems.dimension, dimension)] : []),
  ];
  const [items, [{ total }]] = await Promise.all([
    db.select({ id: actionItems.id, /* ...all DA5 fields... */, brandName: brands.name })
      .from(actionItems).innerJoin(brands, eq(actionItems.brandId, brands.id))
      .where(and(...conditions))
      .orderBy(asc(actionItems.dimension), desc(actionItems.createdAt))
      .limit(limit).offset((page - 1) * limit),
    db.select({ total: sql<number>`count(*)::int` }).from(actionItems).where(and(...conditions)),
  ]);
  return NextResponse.json({ items, total, page, totalPages: Math.ceil(total / limit) });
  ```
- **DA5 fix — response shape never specified:**
  ```typescript
  // Response: ActionItem[] (with brandName from JOIN)
  {
    id: string,
    recommendationKey: string,
    dimension: string,            // 'frequency'|'position'|'sentiment'|'context'|'accuracy'
    title: string,
    action: string,
    confidenceLabel: string,      // 'confirmed'|'likely'|'hypothesis'
    expectedImpactScore: string,  // 'high'|'medium'|'low'
    evidenceRefs: Array<{ source: string; url: string; summary: string }>,
    status: string,               // 'open'|'in_progress'|'done'|'dismissed'
    brandId: string,
    brandName: string,            // from JOIN to brands — needed for grouped header
    auditId: string,
    createdAt: string,
    updatedAt: string,
  }[]
  ```
  Include `brandName` via `INNER JOIN brands ON brands.id = action_items.brand_id` — the Action Center groups cards per brand and shows the brand name in section headers.

### `GET /api/action-items/[id]`

**DD5 fix — listed in project structure but spec said only "GET (single)" with no implementation details. ActionDetail prototype page requires full action item including `evidenceRefs`:**

```typescript
// app/api/action-items/[id]/route.ts
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await setRlsContext(db, currentUser.organizationId);

  const [item] = await db.select({
    id: actionItems.id, recommendationKey: actionItems.recommendationKey,
    dimension: actionItems.dimension, title: actionItems.title, action: actionItems.action,
    confidenceLabel: actionItems.confidenceLabel, expectedImpactScore: actionItems.expectedImpactScore,
    evidenceRefs: actionItems.evidenceRefs, status: actionItems.status,
    brandId: actionItems.brandId, brandName: brands.name, auditId: actionItems.auditId,
    createdAt: actionItems.createdAt, updatedAt: actionItems.updatedAt,
  })
  .from(actionItems)
  .innerJoin(brands, eq(actionItems.brandId, brands.id))
  .where(eq(actionItems.id, params.id));

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // RLS already scoped to org — cross-org returns empty → 404 above
  return NextResponse.json(item);
}
```

- Body: `{ status: 'in_progress' | 'done' | 'dismissed', dismissedReason?: string }`
- Cross-org → 404
- **DB3 fix — no Zod validation schema specified; `status: 'deleted'` would reach the DB update:**
  ```typescript
  import { z } from 'zod';

  const patchStatusSchema = z.object({
    status: z.enum(['in_progress', 'done', 'dismissed']),
    dismissedReason: z.string().max(500).optional(),
  }).refine(
    d => d.status !== 'dismissed' || !!d.dismissedReason,
    { message: 'dismissedReason required when status is dismissed', path: ['dismissedReason'] }
  );
  ```
  On `status: 'done'` → set `doneAt = NOW()`, `updatedAt = NOW()`.
  On `status: 'dismissed'` → set `dismissedAt = NOW()`, `dismissedReason`, `updatedAt = NOW()`.

  **DJ1 fix — no actual `db.update()` code written; prose spec alone is insufficient:**
  ```typescript
  // In PATCH /api/action-items/[id]/status handler (after Zod validation + auth):
  // DM5 fix: PATCH never specified setRlsContext — cross-org PATCH would succeed without it.
  // action_items RLS policy filters by organization_id, so without setRlsContext the update
  // returns 0 rows (the !updated check below catches it as 404), but setting context is canonical.
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await setRlsContext(db, currentUser.organizationId);
  const { status, dismissedReason } = body;
  const now = new Date();

  const updateValues: Partial<typeof actionItems.$inferInsert> = {
    status,
    updatedAt: now,
    ...(status === 'done'      ? { doneAt: now }                        : {}),
    ...(status === 'dismissed' ? { dismissedAt: now, dismissedReason }  : {}),
    ...(status === 'in_progress' ? { doneAt: null, dismissedAt: null }  : {}),
  };

  const [updated] = await db.update(actionItems)
    .set(updateValues)
    .where(eq(actionItems.id, params.id))
    .returning({ id: actionItems.id, status: actionItems.status });

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // RLS ensures cross-org items return no rows → 404 above
  return NextResponse.json({ id: updated.id, status: updated.status });
  ```

---

## 10. Action Center UI

`/action-center` page structure:

1. **Header:** "X open recommendations across Y brands"
2. **Filter:** Brand picker (multi-select), Dimension filter, Confidence filter. **DC5 fix — filter state never specified as URL or React state.** Must use URL `searchParams` (same pattern as Sprint 4 audit list BJ4 fix):
   - `app/(auth)/action-center/page.tsx` is a server component reading `searchParams`
   - Filter controls are a `'use client'` child component calling `router.push('/action-center?' + new URLSearchParams({...}))` on change
   - Bookmarkable, survives refresh, shareable between teammates
   - The server component passes `searchParams.brandId`, `searchParams.dimension`, `searchParams.confidence` to `GET /api/action-items` query params
3. **Grouped by dimension:** 5 sections (Frequency, Position, Sentiment, Context, Accuracy)
4. **Per section:** stacked recommendation cards with title, action, confidence badge, evidence link, "Mark done" + "Dismiss" buttons

**DG4 fix — post-PATCH UI behaviour never specified.** After a successful PATCH to mark done/dismiss:
- The `ActionDetail` page (`/action-center/[id]`) hosts the Mark done and Dismiss buttons (not the list card — consistent with prototype which shows chevron-right navigation)
- After PATCH success: call `router.refresh()` which re-executes the server component data fetch, removing the completed/dismissed item from the filtered list (since `GET /api/action-items` returns only `open` + `in_progress`)
- `router.refresh()` is preferred over `router.push('/action-center')` because it preserves URL filter params (DC5 fix)
- On PATCH error: show `toast.error('Failed to update — try again')` and leave status unchanged

**DH1 fix — `app/(auth)/action-center/[id]/page.tsx` never specified:**

```tsx
// app/(auth)/action-center/[id]/page.tsx — server component
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

export default async function ActionDetailPage({ params }: { params: { id: string } }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/sign-in');

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/action-items/${params.id}`,
    { headers: { Cookie: cookies().toString() }, cache: 'no-store' }
  );
  if (res.status === 404) notFound();
  const item: ActionItem = await res.json();
  const isFree = currentUser.tier === 'free';

  return (
    <PageShell breadcrumbs={['Action Center', item.title]}>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <ConfidenceBadge label={item.confidenceLabel} />
        <h1 className="text-2xl font-semibold mt-2 mb-1">{item.title}</h1>
        <p className="text-sm text-secondary mb-6">{item.brandName} · {item.dimension}</p>
        <TierGate isFree={isFree}>
          <section className="mb-6">
            <h2 className="text-sm uppercase tracking-wider text-tertiary mb-2">What to do</h2>
            <p className="text-[15px]">{item.action}</p>
          </section>
        </TierGate>
        <EvidenceLink evidenceRefs={item.evidenceRefs} />
        {!isFree && item.status !== 'done' && item.status !== 'dismissed' && (
          <ActionStatusButtons itemId={item.id} />  // 'use client' — calls PATCH then router.refresh()
        )}
      </div>
    </PageShell>
  );
}
```

**Tier gate (`tier-gate.tsx`):**
- Free tier: Recommendations show titles but action text is blurred with "Upgrade to Starter to unlock"
- Starter+: Full content visible
- **DD4 fix — tier value never specified as prop.** `tier-gate.tsx` is a `'use client'` component (uses CSS blur + `pointerEvents: 'none'`) but has no way to know the user's tier without receiving it as a prop. The server page component calls `getCurrentUser()` and passes `currentUser.tier` down:
  ```tsx
  // app/(auth)/action-center/page.tsx (server component):
  const currentUser = await getCurrentUser();
  const isFree = currentUser.tier === 'free';
  return <ActionCenterView actionItems={items} isFree={isFree} />;

  // components/domain/action-center/tier-gate.tsx ('use client'):
  interface TierGateProps { isFree: boolean; children: React.ReactNode; }
  export function TierGate({ isFree, children }: TierGateProps) {
    if (!isFree) return <>{children}</>;
    return (
      <div className="relative">
        <div style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none' }}>{children}</div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Button href="/settings/billing">Upgrade to Starter to unlock</Button>
        </div>
      </div>
    );
  }
  ```

---

## 11. Claude Code prompt (paste this when starting Sprint 6)

```
We're building VisibleAU Sprint 6: Action Center with research-backed recommendations.
Sprint 5 produces multidimensional audit scores; Sprint 6 turns them into recommendations.

The most important constraint: the 12 anti-patterns in §6 MUST be enforced. Bad SEO
advice is what users are tired of. Do not generate any recommendation matching those
patterns, even if a trigger fires.

Sprint 6 deliverables, in order:

1. SCHEMA
   - db/schema/action-items.ts and recommendation-research.ts per §5
   - **DA4 fix — barrel exports never specified:**
     ```typescript
     // Add to db/schema/index.ts:
     export * from './action-items';
     export * from './recommendation-research';
     import { actionItems } from './action-items';
     import { recommendationResearch } from './recommendation-research';
     export type ActionItem = InferSelectModel<typeof actionItems>;
     export type RecommendationResearch = InferSelectModel<typeof recommendationResearch>;
     ```
     Also add `actionItems` and `recommendationResearch` to the `db/client.ts` schema object (same pattern as Sprint 5 CH2/CN3 fixes for vertical packs).
   - drizzle-kit generate + migrate
   - **DH3 fix — RLS migration never shown as actual SQL (same gap as Sprint 5 CE4):** Add to the Sprint 6 Supabase migration SQL:
     ```sql
     -- action_items is tenant data — enable RLS and apply org-scoped policy:
     ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;
     -- DI4: confirm column name: Drizzle organizationId → physical column 'organization_id' (snake_case).
     -- The policy references the physical column name, not the TypeScript field name.
     CREATE POLICY "org_isolation" ON action_items
       USING (organization_id = current_setting('app.current_organization_id')::uuid);

     -- recommendation_research is global operator data — disable RLS explicitly:
     ALTER TABLE recommendation_research DISABLE ROW LEVEL SECURITY;
     ```
     Without the DISABLE on `recommendation_research`, Supabase may enable RLS by default → `buildRecommendations` enrichment returns 0 research rows → all `evidenceRefs` are empty.
   - Add RLS to `action_items` (tenant data — org-scoped); `recommendation_research` is global → DISABLE ROW LEVEL SECURITY

2. SEED DATA
   **DC1 fix — §11 step 2 still said "25 templates per vertical (75 total)" but v1.1 corrected §1 to 11 universal action types.** Seed step was never updated. Canonical:
   - `db/seed/recommendations/universal-recommendations.ts` — **11 universal seed entries** (one per PRD §8 Module 5 action type), each with: `recommendationKey`, `dimension`, `title` template, `action` template, `confidenceLabel`, `evidenceRefs[]`
   - `db/seed/recommendations/tradies-overlays.ts`, `allied-health-overlays.ts`, `saas-overlays.ts` — optional per-vertical **phrasing overlays** (e.g., "r/sydney and r/AusPlumbing" for the Reddit recommendation in Tradies) — short additions, not full separate templates
   - **DE5 fix — `recommendation_research` seed never specified despite enrich-evidence step querying it.** Add `db/seed/recommendations/research-citations.ts`:
     ```typescript
     // db/seed/recommendations/research-citations.ts
     // Shape: { recommendationKey, source, url, summary, confidenceLevel }
     export const RESEARCH_CITATIONS = [
       {
         recommendationKey: 'wikipedia-article',
         source: 'Princeton GEO study (2024)',
         url: 'https://arxiv.org/abs/2404.11973',
         summary: 'Wikipedia pages appear in 47.9% of ChatGPT top-10 citation share across 10,000 queries.',
         confidenceLevel: 'confirmed',
       },
       {
         recommendationKey: 'faq-content',
         source: 'SE Ranking AI Mode research (Dec 2025)',
         url: 'https://seranking.com/blog/ai-overviews-study/',
         summary: 'Pages with FAQ blocks in main content average 4.9 AI citations vs 4.4 without. Schema markup alone shows ~zero impact.',
         confidenceLevel: 'likely',
       },
       {
         recommendationKey: 'reddit-absence',
         source: 'Tinuiti Q1 2026 AI Citation Report',
         url: 'https://tinuiti.com/research/',
         summary: 'Reddit accounts for 24% of all Perplexity citations. Only 0.1% of Gemini citations.',
         confidenceLevel: 'likely',
       },
       // ... remaining 8 universal types with analogous structure (1-3 rows each, ~22 total)
       // DL5 fix: DO NOT have Claude Code invent research citations.
       // Citations must cite real published research. Sri must author the remaining 8 types:
       // expert-quotes: cite Princeton GEO study on expert quotes (+41% visibility)
       // cited-statistics: cite SE Ranking AU benchmarks
       // stale-content: cite SE Ranking freshness study (updated content avg 5.0 vs 3.9 citations)
       // comparison-article: cite HubSpot AEO study on high-intent comparison content
       // reddit-absence: already shown (Tinuiti 24% of Perplexity)
       // medium-presence: cite Tinuiti Gemini Medium preference data
       // linkedin-presence: cite Profound LinkedIn surge to #5 source
       // press-mentions: cite TEAM LEWIS earned media GEO study
       // Each needs a real URL or "operator-observed" if no published source exists.
     ];
     ```
     **DG5 fix — seed runner never extended for Sprint 6 data.** Sprint 5's `seed.ts` only seeds vertical packs. Sprint 6 must extend it:
     ```typescript
     // Add to the END of db/seed/seed.ts (after vertical pack seed):
     import { UNIVERSAL_RECOMMENDATIONS } from './recommendations/universal-recommendations';
     import { RESEARCH_CITATIONS } from './recommendations/research-citations';

     // Sprint 6: seed universal recommendation templates into recommendation_research
     // (action_items are generated dynamically by Inngest — not seeded)
     await db.insert(recommendationResearch).values(RESEARCH_CITATIONS).onConflictDoNothing();
     console.log(`Seeded ${RESEARCH_CITATIONS.length} research citations`);
     ```
     Note: `action_items` are NOT seeded — they're generated by the Inngest function when audits complete.
     Seed only: `recommendation_research` (static citation data).

3. RECOMMENDATIONS ENGINE
   - lib/recommendations/triggers.ts: evaluateTriggers({ scores, confidenceIntervals, vertical })
   - lib/recommendations/anti-patterns.ts: 12 patterns, both keyword + content-match
   - lib/recommendations/confidence-labels.ts: map recommendationKey → confidence
   - lib/recommendations/index.ts: orchestrates triggers → anti-pattern filter → confidence → persist

4. INNGEST FUNCTION
   - inngest/functions/generate-recommendations.ts triggered by audit.complete event
   - **DB5 fix — `generateRecommendations` never registered in `serve()`.** Sprint 2's `serve()` call only includes Sprint 2/3 functions. Without adding `generateRecommendations` to the serve array, Inngest cannot route `audit/complete` events to it — the function exists but never fires:
     ```typescript
     // app/api/inngest/route.ts — add to serve():
     import { generateRecommendations } from '@/inngest/functions/generate-recommendations';

     export const { GET, POST, PUT } = serve({
       client: inngest,
       functions: [
         runAudit,
         sendAuditCompleteEmail,
         generateRecommendations,  // DB5: was missing; function exists but never triggered
       ],
     });
     ```

5. API ROUTES
   - GET /api/action-items + GET /api/action-items/[id]
   - PATCH /api/action-items/[id]/status

6. UI
   - app/(auth)/action-center/page.tsx
   - app/(auth)/action-center/[id]/page.tsx (DH1 spec)
   - **DJ2 fix — `app/(auth)/action-center/loading.tsx` missing.** Sprint 4 BK3 added loading.tsx for brands/audits/dashboard/portfolio; action-center was Sprint 6 scope. Add Skeleton with filter bar + 3 dimension sections × 2 card Skeletons each.
   - **DJ3 fix — header "X open recommendations across Y brands" count queries never specified:**
     ```typescript
     const [{ count: totalCount }] = await db.select({ count: sql<number>`count(*)::int` })
       .from(actionItems).where(and(eq(actionItems.organizationId, currentUser.organizationId),
                                    inArray(actionItems.status, ['open', 'in_progress'])));
     const brandRows = await db.selectDistinct({ brandId: actionItems.brandId }).from(actionItems)
       .where(and(eq(actionItems.organizationId, currentUser.organizationId),
                  inArray(actionItems.status, ['open', 'in_progress'])));
     // Header: `${totalCount} open recommendation${totalCount !== 1 ? 's' : ''} across ${brandRows.length} brand${brandRows.length !== 1 ? 's' : ''}`
     ```
   - **DJ4 fix — Sprint 6 does NOT add a Dashboard KPI card.** The 4 Sprint 4 KPI cards remain unchanged. Recommendation counts live only in the Action Center header. Sprint 8 may add a Dashboard widget. Do not add a 5th KPI card.
   - components/domain/action-center/* per §4
   - **DI2+DI5 fix — sidebar entry:** activate Sprint 4 placeholder: `{ href: '/action-center', icon: Sparkles, label: 'Action Center' }` (remove `badge: 'Sprint 6'`)
   - **DK2 fix — `Sparkles` import never specified in layout.tsx.** Add to `app/(auth)/layout.tsx` imports: `import { Sparkles, BookOpen, MapPin } from 'lucide-react'` alongside existing icon imports. `Sparkles` was in Sprint 4 as a placeholder — verify it's already imported; if not, add it.
   - **DI1 fix — `ActionStatusButtons`:** 'use client'; Mark done → PATCH { status:'done' }; Dismiss → inline textarea for reason (required) → PATCH { status:'dismissed', dismissedReason }; both call `router.refresh()` + `router.push('/action-center')` on success
   - tier-gate.tsx: blur action text for Free tier

7. TESTS
   - Each of 12 anti-patterns blocks correctly (12 explicit tests)
   - Confidence label classification matches research backing
   - Audit complete → recommendations generated within Inngest test harness. **DL3 fix — `@inngest/test` never added to devDependencies and no test body written:**
  ```typescript
  // pnpm add -D @inngest/test
  // tests/integration/recommendations/generate-recommendations.test.ts
  import { InngestTestEngine } from '@inngest/test';
  import { generateRecommendations } from '@/inngest/functions/generate-recommendations';

  describe('generate-recommendations Inngest function', () => {
    it('fires on audit/complete and generates action items', async () => {
      const t = new InngestTestEngine({ function: generateRecommendations });
      const { result } = await t.execute({
        events: [{ name: 'audit/complete', data: { auditId: 'test-audit-id' } }],
      });
      // Stub DB responses: audit with low scoreFrequency triggers recommendations
      expect(result.state.steps['build-recommendations']).toBeDefined();
      expect(result.state.steps['persist-recommendations']).toBeDefined();
    });
  });
  ```

POTENTIAL BLOCKERS:
- Authoring 75 templates is the time-consuming part
- Research citations: keep them honest — only cite real sources
- Free tier blur effect: use CSS filter: blur(4px) with a "Click to unlock" overlay

Start with step 1. After schema migrates, step 2 (seed authoring) is where you spend
most of the sprint.
```

---

## 12. Tests required

- Unit: each of 12 anti-patterns blocks (12 separate test cases). **DF4 fix — test bodies never written; acceptance criterion "test enforces" requires automated tests:**
  ```typescript
  // tests/unit/recommendations/anti-patterns.test.ts
  import { describe, it, expect } from 'vitest';
  import { applyAntiPatternFilter } from '@/lib/recommendations/anti-patterns';

  const make = (key: string, action = 'do something') =>
    [{ recommendationKey: key, action, dimension: 'frequency', title: '', expectedImpactScore: 'low' as const, evidenceRefs: [] }];

  describe('applyAntiPatternFilter — 12 patterns blocked', () => {
    it('1. blocks add-more-keywords (keyword stuffing)', () => expect(applyAntiPatternFilter(make('add-more-keywords'))).toHaveLength(0));
    it('2. blocks pay-for-ai-ads (no paid placement mechanism)', () => expect(applyAntiPatternFilter(make('pay-for-ai-ads'))).toHaveLength(0));
    it('3. blocks submit-to-ai-engines (no process exists)', () => expect(applyAntiPatternFilter(make('submit-to-ai-engines'))).toHaveLength(0));
    it('4. blocks get-more-backlinks (oversimplified)', () => expect(applyAntiPatternFilter(make('get-more-backlinks'))).toHaveLength(0));
    it('5. blocks use-ai-to-write-content (wrong signal)', () => expect(applyAntiPatternFilter(make('use-ai-to-write-content'))).toHaveLength(0));
    it('6. blocks update-meta-tags-for-ai (not primary signal)', () => expect(applyAntiPatternFilter(make('update-meta-tags-for-ai'))).toHaveLength(0));
    it('7. blocks improve-seo-generic (too vague)', () => expect(applyAntiPatternFilter(make('improve-seo-generic'))).toHaveLength(0));
    it('8. blocks buy-reviews (illegal under AU ACL)', () => expect(applyAntiPatternFilter(make('buy-reviews'))).toHaveLength(0));
    it('9. blocks create-ai-generated-reviews (legal + detection issue)', () => expect(applyAntiPatternFilter(make('create-ai-generated-reviews'))).toHaveLength(0));
    it('10. blocks add-schema-without-entity (anti-pattern strategy)', () => expect(applyAntiPatternFilter(make('add-schema-without-entity'))).toHaveLength(0));
    it('11. blocks target-competitor-terms (no score movement)', () => expect(applyAntiPatternFilter(make('target-competitor-terms'))).toHaveLength(0));
    it('12. blocks run-more-audits (circular advice)', () => expect(applyAntiPatternFilter(make('run-more-audits'))).toHaveLength(0));
    it('content-match regex: blocks action containing "buy reviews"', () => expect(applyAntiPatternFilter(make('unknown-key', 'You should buy reviews from Trustpilot'))).toHaveLength(0));
    it('passes valid recommendation through unchanged', () => expect(applyAntiPatternFilter(make('wikipedia-article', 'Draft a Wikipedia article'))).toHaveLength(1));
  });
  ```
- Unit: confidence label classification
- Unit: trigger evaluation deterministic per fixture scores
- Integration: full flow audit.complete → recommendations persist
- E2E: Action Center page renders + mark done + dismiss + tier gate visible to Free user

---

## 13. Acceptance criteria

- [ ] `action_items` table populated by Inngest after audit completes
- [ ] All 12 anti-patterns blocked (test enforces)
- [ ] Confidence badges render: Confirmed (green), Likely (amber), Hypothesis (gray)
- [ ] Evidence link expands to show backing research citations
- [ ] Free tier sees count of recommendations + blurred content + upgrade CTA
- [ ] Starter+ tier sees full content + can mark done/dismiss
- [ ] Recommendations group by dimension (5 sections)
- [ ] Cross-org → 404 on all action-item routes
- [ ] ActionDetail page (`/action-center/[id]`) loads with full content including action text and evidenceRefs (DH4)
- [ ] Mark done/Dismiss PATCH calls succeed and item disappears from list on next load (DH4)
- [ ] Recommendations generate within 30s of audit completion — verify in Inngest dashboard (definition of done metric from §3)
- [ ] `expectedImpactScore` renders as High/Medium/Low priority badge with correct tone (DH2: not 'priority' field)
- [ ] `recommendation_research` table has at least 1 citation row for each of the 11 universal action type keys (DN5 fix: enrich-evidence silently returns empty evidenceRefs if seed is incomplete — run `SELECT recommendation_key, COUNT(*) FROM recommendation_research GROUP BY recommendation_key` and verify all 11 keys have rows)
- [ ] **Note (DH5):** `evidenceRefs` on `action_items` are written once at generation time and are immutable — PATCH status changes do NOT update evidenceRefs. This is intentional: research backing for a recommendation doesn't change when a user marks it done.

---

## 14. Common pitfalls / Sprint 6 anti-patterns

- **Do not** invent confidence labels. Use the categorical 3: Confirmed | Likely | Hypothesis. Numeric confidence (e.g., "87% confident") was a Round 24 anti-pattern — categorical is honest.
- **Do not** bypass the anti-pattern filter "just for this one case." The filter is the safeguard.
- **Do not** generate recommendations without backing research entries. Hypothesis-confidence is OK; "no backing at all" is not.
- **Do not** show full recommendation text to Free tier. Tier gate is the upsell.
- **Do not** auto-mark recommendations done when audit score improves. That's circular logic. User marks done manually.

---

## 15. Handoff to Sprint 7

Ready:
- ✓ Recommendations exist — Sprint 7 corpus validation can include "do these recommendations make sense for site X?"
- ✓ Anti-pattern filter — Sprint 7 validation can extend the filter based on corpus findings

Not ready:
- Drift-triggered recommendations (Sprint 8)
- Recommendation effectiveness tracking (v1.1)

---

## Changelog

- v1.10 (17 May 2026): **Eighth-pass audit — ActionDetail page, expectedImpactScore naming, RLS SQL, acceptance gaps, evidenceRefs immutability (DH1-DH5).** **(DH1)** §10: `app/(auth)/action-center/[id]/page.tsx` now specified — server component fetches via GET /api/action-items/[id] with cookie forwarding; renders ConfidenceBadge, title, TierGate-wrapped action, EvidenceLink, and ActionStatusButtons client component for PATCH. **(DH2)** §4 recommendation-card: `item.expectedImpactScore` (DB field, lowercase) corrected vs prototype `priority` (different name + capitalised); IMPACT_TONE and IMPACT_LABEL maps specified. **(DH3)** §11 step 1: explicit RLS migration SQL added — `action_items` ENABLE + policy; `recommendation_research` DISABLE; without DISABLE the enrichment returns 0 rows. **(DH4)** §12 acceptance: 3 items added — ActionDetail page loads correctly, Mark done/Dismiss works, 30s generation time check. **(DH5)** §12 note: `evidenceRefs` immutability documented — written once at generation; PATCH never updates them; intentional design.
- v1.9 (17 May 2026): **Seventh-pass audit — buildRecommendations body, card spec, confidence-badge, post-PATCH UX, seed runner (DG1-DG5).** **(DG1)** §4: `buildRecommendations(ctx, db)` TypeScript body now specified — calls evaluateTriggers→applyAntiPatternFilter→classifyConfidence→evidenceRefs enrichment in sequence; returns `RecommendationWithConfidence[]`; empty keys guard prevents `inArray` with no values. **(DG2)** §4 recommendation-card.tsx: component content specified — priority badge + title + impact line + citation count + ConfidenceBadge + ChevronRight; Mark done/Dismiss live on ActionDetail not the list card (consistent with prototype). **(DG3)** §4 confidence-badge.tsx: TONE_MAP and LABEL_MAP specified — confirmed=success(green), likely=warning(amber), hypothesis=neutral(gray); accepts any string with neutral fallback. **(DG4)** §10: post-PATCH UX specified — `router.refresh()` after successful PATCH (preserves URL filter params from DC5); `toast.error()` on failure; status unchanged on error. **(DG5)** §11 step 2: `seed.ts` extended with Sprint 6 RESEARCH_CITATIONS insert; clarified that `action_items` are NOT seeded (generated by Inngest); only `recommendation_research` is static seed data.
- v1.8 (17 May 2026): **Sixth-pass audit — setRlsContext confirmed, buildRecommendations call, evidence-link, anti-pattern tests, dimension-group (DF1-DF5).** **(DF1)** §9 GET /api/action-items: confirmed setRlsContext present (already added by DA5 fix). **(DF2)** §7: Inngest function now calls `buildRecommendations()` inside `step.run('build-recommendations', ...)` — DE1 specified lib/recommendations/index.ts as the orchestrator but the Inngest function used inline logic instead; reconciled to call lib from a single step. **(DF3)** §4 evidence-link.tsx: expand/collapse component specified — collapsed shows "View research (N citations)"; expanded renders source links + summaries; empty evidenceRefs renders nothing. **(DF4)** §12: anti-pattern test bodies written — 12 key-based tests + 1 content-match regex test + 1 passthrough test; `make()` helper creates minimal fixture; acceptance "test enforces" is now automated. **(DF5)** §4 dimension-group.tsx: grouping logic specified — `Object.groupBy(items, i => i.dimension)`; canonical order `['frequency','position','sentiment','context','accuracy']`; `DIMENSION_LABELS` maps to human-readable headers; empty sections skipped.
- v1.7 (17 May 2026): **Fifth-pass audit — index.ts vs Inngest, evidenceRefs step, re-audit scope, research index, research seed (DE1-DE5).** **(DE1)** §4 index.ts: renamed to `buildRecommendations(ctx, db)` — pure business logic without Inngest dependency; Inngest function calls it inside a step.run(); enables unit testing without Inngest harness. **(DE2)** §7: `enrich-evidence` step added between confidence classification and persist — evidenceRefs were always [] without it; queries `recommendation_research` by `inArray(recommendationKey, keys)`; persist step now uses `enriched` not `withConfidence`. **(DE3)** §1 deliverable: re-audit trigger corrected to Sprint 8 scope — §1 listed it as Sprint 6 "✓" but §15 defers drift-triggered recommendations to Sprint 8; no PATCH scheduling logic existed. **(DE4)** §5 `recommendation_research`: `index('recommendation_research_key_idx').on(table.recommendationKey)` added — enrich-evidence queries by this column; `index` added to import. **(DE5)** §11 step 2: `research-citations.ts` seed shape specified — `{ recommendationKey, source, url, summary, confidenceLevel }[]`; 3 sample rows shown (wikipedia, faq-content, reddit-absence); ~22 rows total; `onConflictDoNothing()` for idempotency.
- v1.6 (17 May 2026): **Fourth-pass audit — CONFIDENCE_LEVELS keys, evaluateTriggers body, onConflictDoNothing, tier prop, single route (DD1-DD5).** **(DD1)** §8: CONFIDENCE_LEVELS updated to 11 universal action type keys — old keys (`'add-business-schema'` etc.) predated v1.1 architecture change; none matched 11 universal types; `classifyConfidence()` always returned `undefined`. **(DD2)** §7: `evaluateTriggers()` body now specified — hardcoded `UNIVERSAL_TEMPLATES` array with threshold lambdas; returns `TriggeredRecommendation[]`; DB query enriches `evidenceRefs` post-trigger. **(DD3)** §7 persist step: `.onConflictDoNothing()` added — DC3's unique constraint was set but INSERT still threw on retry; idempotency now enforced end-to-end. **(DD4)** §10 tier-gate: `isFree` prop flow specified — server page calls `getCurrentUser()` and passes `currentUser.tier === 'free'` as prop; `TierGate` is a wrapper component receiving `isFree: boolean`. **(DD5)** §9: `GET /api/action-items/[id]` full implementation specified — auth + setRlsContext + JOIN to brands for brandName + 404 on cross-org; ActionDetail page needs full item including `evidenceRefs`.
- v1.16 (18 May 2026): **Eighteenth-pass audit — empty persist guard, GET query body, brandId FK comment, tier gate UX fix, research seed acceptance (DN1-DN5).** **(DN1)** §7 persist step: `if (enriched.length === 0) return { skipped: true }` guard added — `db.insert().values([])` throws in Drizzle; brand with excellent scores produces 0 recommendations legitimately. **(DN2)** §9 GET /api/action-items: actual Drizzle query written — `inArray(status, activeStatuses)` for default open+in_progress filter; `Promise.all` for items + count; `innerJoin(brands)` for brandName. **(DN3)** §5 schema: `brandId` FK onDelete RESTRICT documented as intentional — Sprint 4 soft-deletes brands; hard-delete never happens; RESTRICT prevents accidental hard-deletes. **(DN4)** Prototype ActionCenter tier gate comment corrected — original showed 5 visible + 6 separate blurred cards; spec says title visible + action text blurred per card via `TierGate` wrapper; comment now clarifies the correct pattern. **(DN5)** §12 acceptance: research seed coverage check added — `SELECT recommendation_key, COUNT(*) FROM recommendation_research GROUP BY recommendation_key` must show all 11 keys.
- v1.15 (17 May 2026): **Sixteenth-pass audit — ActionDetail Sprint 8 fields, route file clarity, expectedImpactScore notNull, PATCH setRlsContext (DM1-DM5).** **(DM1+DM2)** Prototype ActionDetail: Effort/Time to impact/Engines meta-cards + "Why this matters" narrative marked Sprint 8 scope — no schema columns exist for these; prototype dimmed with opacity-40 + Sprint 8 scope note. **(DM3)** §4 route structure: both `[id]/route.ts` (GET) and `[id]/status/route.ts` (PATCH) must exist as separate files — clarified with DM3 fix note. **(DM4)** §5 schema: `expectedImpactScore` now `.notNull()` + `?? 'neutral'` fallback in IMPACT_TONE map. **(DM5)** §9 PATCH: `setRlsContext` added — without it RLS silently returns 0 rows; explicit context is canonical.
- v1.14 (17 May 2026): **Fourteenth-pass audit — Object.groupBy compat, all 11 templates, Inngest test harness, confidenceLevel purpose, citation authoring flag (DL1-DL5).** §4+§7: `Object.groupBy` replaced with safe `reduce` polyfill — project CI uses Node 20; `Object.groupBy` requires Node 21+ / 20.10+; early 20.x throws TypeError. **(DL2)** §7 UNIVERSAL_TEMPLATES: all 11 action types now fully specified — only wikipedia + au-local-citations were written; remaining 9 (faq-content, expert-quotes, cited-statistics, stale-content, comparison-article, reddit-absence, medium-presence, linkedin-presence, press-mentions) now have dimension, action, expectedImpactScore, and threshold lambda. **(DL3)** §12 test 7: `@inngest/test` package and `InngestTestEngine` test body specified — `pnpm add -D @inngest/test`; basic step execution assertion. **(DL4)** §5 `recommendation_research.confidenceLevel`: documented as display-only operator metadata — buildRecommendations uses CONFIDENCE_LEVELS map; research table confidenceLevel is NOT read at runtime; Sprint 7 may reconcile. **(DL5)** research seed: remaining 8 types flagged as "Sri to author with real published URLs" — prevents Claude Code from fabricating research citations.
- v1.13 (17 May 2026): **Twelfth-pass audit — pagination, Sparkles import, dimension field, ORDER BY, db type fix (DK1-DK5).** **(DK1)** §9 GET /api/action-items: `?limit=50` default + `?page=1` added — Agency org generates 660+ items over time; unbounded response breaks the page. **(DK2)** §11 step 6: `import { Sparkles, BookOpen, MapPin } from 'lucide-react'` specified for layout.tsx — icon used in sidebar nav entry but import never shown. **(DK3)** Prototype ActionCenter data: `dimension: 'frequency'|'position'|'context'` fields added to each recommendation object — dimension-group.tsx groups by this field; without it all items fall into no group. **(DK4)** §9 GET /api/action-items: `ORDER BY dimension ASC, created_at DESC` added — without ORDER BY, dimension-group.tsx receives items in random DB insertion order; alphabetical DB order + component canonical reorder gives stable rendering. **(DK5)** §4 buildRecommendations: `db as DbClient` import alias replaced with `type DbClient = typeof db` pattern — singleton instance type creates test injection issues; DK5 uses proper local type alias with `dbClient` parameter name to avoid shadowing the module import.
- v1.12 (17 May 2026): **Eleventh-pass audit — PATCH db.update(), loading.tsx, header counts, Dashboard KPI clarification, impact line format (DJ1-DJ5).** **(DJ1)** §9 PATCH: actual `db.update(actionItems).set({...}).returning()` code now specified — prose "set doneAt = NOW()" was insufficient; sets `doneAt`, `dismissedAt`, `dismissedReason`, `updatedAt` conditionally; status='in_progress' clears done/dismissed timestamps. **(DJ2)** §11 step 6: `loading.tsx` added for action-center route — Sprint 4 BK3 covered 4 routes; action-center was Sprint 6 scope; Skeleton with filter bar + dimension section Skeletons. **(DJ3)** §11 step 6: header count queries specified — `count(*)` for total open+in_progress + `selectDistinct(brandId)` for brand count; both in `Promise.all`. **(DJ4)** §11 step 6: confirmed Sprint 6 does NOT add a 5th Dashboard KPI card — recommendation counts live in Action Center header only; Sprint 8 adds Dashboard widget. **(DJ5)** §4 recommendation-card: `IMPACT_LINE` map specified — prototype's narrative '+2-4 visibility points' is Sprint 8 scope (requires per-engine scoring); Sprint 6 uses enum-mapped copy (High impact/Medium impact/Low impact).
- v1.11 (17 May 2026): **Tenth-pass audit — ActionStatusButtons, sidebar entry, engines Sprint 8, RLS column confirm, prototype engines removed (DI1-DI5).** **(DI1)** §11 step 6: `ActionStatusButtons` specified — 'use client'; Mark done → PATCH { status:'done' }; Dismiss → inline textarea for dismissedReason (required per DB3) then PATCH; both paths call `router.refresh()` + `router.push('/action-center')` on success. **(DI2+DI5)** §11 step 6: exact sidebar nav entry — `{ href: '/action-center', icon: Sparkles, label: 'Action Center' }` activates Sprint 4 placeholder; Insights group ordering specified. **(DI3)** §4 recommendation-card + prototype: `engines` removed from Sprint 6 cards — `action_items` has no engines column; per-engine impact ranking is Sprint 8; prototype ActionCenter engines badge removed. **(DI4)** DH3 RLS SQL: `organization_id` confirmed as correct physical column name; clarifying comment added.
- v1.5 (17 May 2026): **Third-pass audit — seed count, loadAuditWithScores, deduplication, types.ts, filter state (DC1-DC5).** **(DC1)** §11 step 2: seed corrected to 11 universal entries + per-vertical overlays — v1.1 changed §1 from 25 per-vertical (75 total) to 11 universal types; step 2 was never updated; ~22 research rows (11 types × ~2 citations). **(DC2)** §7: `loadAuditWithScores()` replaced with inline `step.run('load-audit', ...)` DB query using Sprint 3's actual score column names; `loadBrand()` replaced with inline `step.run('load-brand', ...)`; both were undefined functions. **(DC3)** §5 action_items: `uniqueIndex('action_items_audit_rec_idx').on(table.auditId, table.recommendationKey)` added — Inngest retries on failure reinsert identical recommendations; unique constraint enforces idempotency; `uniqueIndex` added to import. **(DC4)** §4 types.ts: `TriggerContext`, `TriggeredRecommendation`, `RecommendationWithConfidence` interfaces now specified — all other `lib/recommendations/` files import these; without them every file has implicit `any` types. **(DC5)** §10: Action Center filter state now specified as URL `searchParams` — server component reads filters from URL; filter controls call `router.push` on change; bookmarkable and refresh-safe.
- v1.4 (17 May 2026): **Second-pass audit — sentiment field fix, anti-pattern deny-list, PATCH validation, context trigger fix, Inngest registration (DB1-DB5).** **(DB1)** §7 triggers: `sentiment.negative > 0.2` → `scoreSentimentNumeric < 40` — Sprint 3 has no `sentiment.negative` field; `scoreSentimentNumeric` is the 0-100 scale equivalent. **(DB2)** §6: actual `BLOCKED_KEYS` Set (12 entries) and `BLOCKED_PATTERNS` regex now specified — `applyAntiPatternFilter` body was an empty call-site; filter blocked nothing without the implementation. **(DB3)** §9 PATCH: Zod schema `patchStatusSchema` added — `status: z.enum([...])` with `.refine()` requiring `dismissedReason` when status is `'dismissed'`; `updatedAt = NOW()` on every PATCH. **(DB4)** §7 triggers: `context = 'commodified' in >50% mentions` → `scoreContextNumeric < 40` — citation-level context aggregation unavailable at trigger evaluation time; use the aggregate score. **(DB5)** §11 step 4: `generateRecommendations` added to Inngest `serve()` array — function existed but was never registered; Inngest cannot route events to unregistered functions.
- v1.3 (17 May 2026): **First-pass audit — audit.scores field names, updatedAt missing, event name, barrel exports, response shape (DA1-DA5).** **(DA1)** §7: `audit.scores` (undefined) → individual Sprint 3 column names (`scoreFrequency`, `scorePosition`, `scoreSentimentNumeric`, `scoreContextNumeric`, `scoreAccuracy`); Sprint 3 stores scores as flat columns not a nested object. **(DA2)** §5 `action_items`: `updatedAt` timestamp added — PATCH status changes have no audit trail without it. **(DA3)** §7 Inngest: `'audit.complete'` → `'audit/complete'` — Inngest uses slash separators; Sprint 2 fires `name: 'audit/complete'`; dot syntax would never trigger. **(DA4)** §11 step 1: barrel exports specified for `actionItems` + `recommendationResearch` + inferred types; `recommendation_research` is global data → DISABLE RLS. **(DA5)** §9: `GET /api/action-items` response shape specified — includes `brandName` via JOIN (needed for section headers).
- v1.2 (13 May 2026): **Third-pass-fix audit B5+B8.** §0 line 14 "PRD v1.14 §11" was broken — §11 is Roadmap and Milestones, not Action Center. Action Center spec lives at PRD §8 Module 5; the 12 anti-patterns table lives at PRD §8.5. Both references corrected. PRD version bumped to v1.15. Foundations reference bumped v1.9 → v1.10 to match current bundle. §6 line 171 "Per PRD §11.4" → "Per PRD §8.5 anti-pattern table" — §11.4 doesn't exist.
- v1.1 (12 May 2026): Conflict-resolution fix per audit L3. Recommendation structure changed from "25 per-vertical templates (75 total)" to **11 universal action types per PRD §8 Module 5**, each with named research citation (Tinuiti, SE Ranking, Princeton GEO, HubSpot AEO, Profound, TEAM LEWIS PR). Per-vertical overlays remain as optional decoration on top of the universal base. Anti-pattern filter clarification: 4 from PRD §8 + 8 additional catching real harms (e.g., buying reviews illegal in AU under ACL).
- v1.0 (12 May 2026): Initial. Net-new sprint prompt.
