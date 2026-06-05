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
- ✓ Per-action-type metadata: why-it-matters, estimated effort (low/medium/high), expected lift (with research-derived effect size), per-engine impact ranking, AI-generated draft of the fix, mark-complete tracking, re-audit trigger 14 days after marking complete
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
│   ├── index.ts                          # generateRecommendations(auditId)
│   ├── confidence-labels.ts              # classify by research backing
│   ├── anti-patterns.ts                  # 12 patterns + filter
│   ├── triggers.ts                       # score thresholds that trigger each type
│   └── types.ts

inngest/functions/
└── generate-recommendations.ts           # NEW — triggered by audit.complete event

app/(auth)/
└── action-center/
    └── page.tsx                          # NEW

app/api/
└── action-items/
    ├── route.ts                          # GET (list for org)
    └── [id]/
        ├── route.ts                      # GET (single)
        └── status/route.ts               # PATCH (mark done / dismiss)

components/domain/
└── action-center/
    ├── recommendation-card.tsx
    ├── confidence-badge.tsx              # Confirmed | Likely | Hypothesis
    ├── evidence-link.tsx                 # Click to expand research citations
    ├── dimension-group.tsx               # Groups recs by dimension
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

---

## 5. Database schema

### `action_items.ts`

```typescript
import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { audits } from './audits';
import { brands } from './brands';
import { organizations } from './organizations';

export const actionItems = pgTable('action_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  brandId: uuid('brand_id').references(() => brands.id).notNull(),
  auditId: uuid('audit_id').references(() => audits.id).notNull(),
  recommendationKey: text('recommendation_key').notNull(),  // 'add-business-schema', 'expand-suburb-pages', etc.
  dimension: text('dimension').notNull(),  // 'frequency' | 'position' | 'sentiment' | 'context' | 'accuracy'
  title: text('title').notNull(),
  action: text('action').notNull(),  // The "do this" sentence
  confidenceLabel: text('confidence_label').notNull(),  // 'confirmed' | 'likely' | 'hypothesis'
  expectedImpactScore: text('expected_impact_score'),  // 'high' | 'medium' | 'low'
  evidenceRefs: jsonb('evidence_refs').default('[]').notNull(),  // [{ source, url, summary }]
  status: text('status').default('open').notNull(),  // 'open' | 'in_progress' | 'done' | 'dismissed'
  dismissedReason: text('dismissed_reason'),
  doneAt: timestamp('done_at', { withTimezone: true }),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### `recommendation_research.ts`

```typescript
import { pgTable, uuid, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const recommendationResearch = pgTable('recommendation_research', {
  id: uuid('id').primaryKey().defaultRandom(),
  recommendationKey: text('recommendation_key').notNull(),  // FK by string to seed data
  source: text('source').notNull(),  // 'OpenAI docs' | 'Anthropic research' | 'Google Search central' | 'operator-observed'
  url: text('url'),
  summary: text('summary').notNull(),
  confidenceLevel: text('confidence_level').notNull(),  // 'confirmed' | 'likely' | 'hypothesis'
  citedAt: timestamp('cited_at', { withTimezone: true }),
  retrievedAt: timestamp('retrieved_at', { withTimezone: true }).defaultNow().notNull(),
});
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

---

## 7. Recommendation generation

Triggered by `audit.complete` event:

```typescript
// inngest/functions/generate-recommendations.ts
export const generateRecommendations = inngest.createFunction(
  { id: 'generate-recommendations' },
  { event: 'audit.complete' },
  async ({ event, step }) => {
    const { auditId } = event.data;
    const audit = await loadAuditWithScores(auditId);
    const brand = await loadBrand(audit.brandId);

    const triggered = evaluateTriggers({
      scores: audit.scores,
      confidenceIntervals: audit.confidenceIntervals,
      vertical: brand.vertical,
    });

    const filtered = applyAntiPatternFilter(triggered);

    const withConfidence = filtered.map(rec => ({
      ...rec,
      confidenceLabel: classifyConfidence(rec.recommendationKey),
    }));

    await step.run('persist-recommendations', async () => {
      await db.insert(actionItems).values(
        withConfidence.map(rec => ({
          organizationId: audit.organizationId,
          brandId: audit.brandId,
          auditId,
          ...rec,
        }))
      );
    });
  }
);
```

### Trigger examples

- `frequency < 30` → "Expand brand presence on local directories" (Confirmed)
- `position avg > 5` → "Improve content depth for primary services" (Likely)
- `sentiment.negative > 0.2` → "Audit recent reviews and customer feedback channels" (Confirmed)
- `context = 'commodified' in >50% mentions` → "Differentiate brand positioning" (Hypothesis — requires entity strategy)
- `accuracy < 70` → "Update outdated business info on directory listings" (Confirmed)

Total ~25 trigger types per vertical, each with its own threshold logic.

---

## 8. Confidence label classification

```typescript
// lib/recommendations/confidence-labels.ts

const CONFIDENCE_LEVELS = {
  // Backed by official LLM provider documentation
  'add-business-schema': 'confirmed',
  'fix-outdated-directory-listings': 'confirmed',
  'expand-google-business-profile': 'confirmed',

  // Backed by independent research (e.g., Google Search Central, Anthropic research papers)
  'increase-content-depth': 'likely',
  'improve-internal-linking': 'likely',
  'add-faq-schema': 'likely',

  // Operator hypothesis — works in some cases, untested at scale
  'differentiate-brand-positioning': 'hypothesis',
  'add-customer-testimonials': 'hypothesis',
};
```

Each recommendation's confidence is seeded into `recommendation_research` table with backing citations.

---

## 9. API routes

### `GET /api/action-items`

- Auth required
- Returns open + in_progress action items for current org
- Query params: `?brandId=X`, `?status=open`, `?dimension=frequency`

### `PATCH /api/action-items/[id]/status`

- Body: `{ status: 'in_progress' | 'done' | 'dismissed', dismissedReason?: string }`
- Cross-org → 404

---

## 10. Action Center UI

`/action-center` page structure:

1. **Header:** "X open recommendations across Y brands"
2. **Filter:** Brand picker (multi-select), Dimension filter, Confidence filter
3. **Grouped by dimension:** 5 sections (Frequency, Position, Sentiment, Context, Accuracy)
4. **Per section:** stacked recommendation cards with title, action, confidence badge, evidence link, "Mark done" + "Dismiss" buttons

**Tier gate (`tier-gate.tsx`):**
- Free tier: Recommendations show titles but action text is blurred with "Upgrade to Starter to unlock"
- Starter+: Full content visible

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
   - drizzle-kit generate + migrate

2. SEED DATA
   - 25 recommendation templates per vertical (tradies, allied-health, saas)
   - Each template: recommendationKey, dimension, title template, action template, default confidence
   - Plus recommendation_research seed: 1-3 research citations per template

3. RECOMMENDATIONS ENGINE
   - lib/recommendations/triggers.ts: evaluateTriggers({ scores, confidenceIntervals, vertical })
   - lib/recommendations/anti-patterns.ts: 12 patterns, both keyword + content-match
   - lib/recommendations/confidence-labels.ts: map recommendationKey → confidence
   - lib/recommendations/index.ts: orchestrates triggers → anti-pattern filter → confidence → persist

4. INNGEST FUNCTION
   - inngest/functions/generate-recommendations.ts triggered by audit.complete event
   - Register in app/api/inngest/route.ts

5. API ROUTES
   - GET /api/action-items + GET /api/action-items/[id]
   - PATCH /api/action-items/[id]/status

6. UI
   - app/(auth)/action-center/page.tsx
   - components/domain/action-center/* per §4
   - Wire up sidebar Insights → Action Center (was placeholder)
   - tier-gate.tsx: blur action text for Free tier

7. TESTS
   - Each of 12 anti-patterns blocks correctly (12 explicit tests)
   - Confidence label classification matches research backing
   - Audit complete → recommendations generated within Inngest test harness

POTENTIAL BLOCKERS:
- Authoring 75 templates is the time-consuming part
- Research citations: keep them honest — only cite real sources
- Free tier blur effect: use CSS filter: blur(4px) with a "Click to unlock" overlay

Start with step 1. After schema migrates, step 2 (seed authoring) is where you spend
most of the sprint.
```

---

## 12. Tests required

- Unit: each of 12 anti-patterns blocks (12 separate test cases)
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

- v1.2 (13 May 2026): **Third-pass-fix audit B5+B8.** §0 line 14 "PRD v1.14 §11" was broken — §11 is Roadmap and Milestones, not Action Center. Action Center spec lives at PRD §8 Module 5; the 12 anti-patterns table lives at PRD §8.5. Both references corrected. PRD version bumped to v1.15. Foundations reference bumped v1.9 → v1.10 to match current bundle. §6 line 171 "Per PRD §11.4" → "Per PRD §8.5 anti-pattern table" — §11.4 doesn't exist.
- v1.1 (12 May 2026): Conflict-resolution fix per audit L3. Recommendation structure changed from "25 per-vertical templates (75 total)" to **11 universal action types per PRD §8 Module 5**, each with named research citation (Tinuiti, SE Ranking, Princeton GEO, HubSpot AEO, Profound, TEAM LEWIS PR). Per-vertical overlays remain as optional decoration on top of the universal base. Anti-pattern filter clarification: 4 from PRD §8 + 8 additional catching real harms (e.g., buying reviews illegal in AU under ACL).
- v1.0 (12 May 2026): Initial. Net-new sprint prompt.
