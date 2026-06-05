# Sprint 3 — Multi-Engine + Multidimensional Scoring

**Sprint:** 3 of 12
**Estimated effort:** 46-58 hours (~6-7 weekends at 8 hrs/week)
**Goal:** Expand the audit job from 1 engine × 1 run to **up to 4 engines × 5 runs per prompt = up to 200 LLM calls** (tier-derived: Free 2 engines/100 calls, paid 4 engines/200 calls per `TIER_ENGINES`). Add multidimensional scoring (5 dimensions), Wilson 95% confidence intervals, tier-aware model selector. Per-audit cost budget <US$3 (paid tier) or ~US$1.50 (Free).
**Prerequisites:** Sprint 2 complete. ChatGPT implementation + mock fixtures + audit Inngest job all working.
**Out of scope:** UI to display the rich results (Sprint 4), vertical pack tables (Sprint 5), Action Center recommendations (Sprint 6), drift detection (Sprint 8).

---

## 0. Read first

1. `CLAUDE.md`
2. `sri-visibleau-foundations.md` v1.9 §3 schema additions to `audits` (multidimensional columns + confidenceIntervals)
3. `sri-visibleau-architecture-overview.md` v1.4 §11 — tier-aware model selector commitment
4. `sri-visibleau-sprint-3-backend-tests.md` v1.3 — defines the test surface
5. PRD v1.14 §10 — multidimensional scoring spec + Wilson CI math

---

## 1. What ships this sprint

- ✓ 3 new engine implementations: Anthropic (Claude), Google (Gemini), Perplexity
- ✓ Mock fixtures extended to all 4 engines (16 fixture JSONs total: 4 engines × 4 scenarios)
- ✓ `lib/llm/model-selector.ts` — tier-aware: `selectModel(tier, engine, task)` pure function
- ✓ PRIMARY_MODELS map: tier × engine → model string (brand_mention task uses this)
- ✓ DERIVED_TASK_MODELS map: engine → cheapest model (sentiment + context tasks always use this)
- ✓ `lib/llm/tier-engines.ts` — **NEW (v1.2 second-pass-fix N1):** tier→engine allowlist. Free tier = `['chatgpt', 'perplexity']` (2 engines per PRD §7); paid tiers = all 4. The audit job iterates this list, not a hardcoded 4-engine constant.
- ✓ Audit job expanded: **up to** 4 engines × 10 prompts × 5 runs = up to 200 LLM calls per audit. Free tier = 2 engines × 10 prompts × 5 runs = 100 calls. Engine count per audit = `TIER_ENGINES[tier].length`.
- ✓ 5-dimension scoring: frequency, position, sentiment, context, accuracy
- ✓ Wilson 95% confidence intervals per dimension (5 runs → CI math)
- ✓ Composite visibility score 0-100 using DIMENSION_WEIGHTS (25/25/20/15/15)
- ✓ Sentiment classification (positive/neutral/negative) per citation
- ✓ Context labeling (recommended/listed/mentioned/commodified) per citation
- ✓ `commodified` context score = **25** (NOT 0 — Round 29 fix)
- ✓ Schema additions: `scoreFrequency`, `scorePosition`, `scoreSentiment`, `scoreContext`, `scoreAccuracy`, `scoreSentimentNumeric`, `scoreContextNumeric`, `confidenceIntervals jsonb`
- ✓ `GET /api/audits/[auditId]/full` returns rich payload
- ✓ `GET /api/brands/[brandId]/metrics` endpoint for trend data
- ✓ Per-audit cost budget: **<US$3 (≈A$4.50)** for paid tiers (200 calls); ~US$1.50 for Free (100 calls)
- ✓ Tests: model-selector 72 combinations + tier-engines 6-tier coverage + scoring math + Wilson CI math

**Definition of done:** A paid-tier user triggers an audit → 200 LLM calls run across 4 engines × 10 prompts × 5 runs → 5-dimension scoring computes deterministic numbers → composite score 0-100 with Wilson 95% CI → user can fetch full payload via API. A Free-tier user triggers an audit → 100 LLM calls run across **2 engines (ChatGPT + Perplexity)** × 10 prompts × 5 runs → same scoring with reduced engine breakdown.

---

## 2. Dependencies to install

```bash
# LLM SDKs
pnpm add @ai-sdk/anthropic
pnpm add @ai-sdk/google
# Perplexity uses OpenAI-compatible endpoint; configure via createOpenAI with custom baseURL
# Perplexity uses OpenAI-compatible API (reuse openai package)

# Statistics
pnpm add simple-statistics
```

---

## 3. Environment variables (additions)

```bash
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=...
PERPLEXITY_API_KEY=pplx-...
```

---

## 4. Project structure additions

```
lib/
├── llm/
│   ├── model-selector.ts             # NEW — tier × engine × task → model string
│   ├── tier-engines.ts               # NEW — tier → engine[] allowlist (Free=2, paid=4)
│   ├── anthropic-impl.ts             # NEW — Claude implementation
│   ├── google-impl.ts                # NEW — Gemini implementation
│   ├── perplexity-impl.ts            # NEW — Perplexity implementation
│   └── mock-responses/
│       ├── chatgpt/                  # exists from Sprint 2
│       ├── claude/                   # NEW — 4 scenario JSONs
│       │   ├── happy_path.json
│       │   ├── no_mention.json
│       │   ├── partial_failure.json
│       │   └── rate_limited.json
│       ├── gemini/                   # NEW — 4 scenario JSONs
│       └── perplexity/               # NEW — 4 scenario JSONs
├── scoring/
│   ├── frequency.ts                  # frequencyDimensionScore(mentions, total)
│   ├── position.ts                   # positionDimensionScore(avgPosition)
│   ├── sentiment.ts                  # sentimentDimensionScore(label) + classify(response)
│   ├── context.ts                    # contextDimensionScore(label) + classify(response)
│   ├── accuracy.ts                   # accuracyDimensionScore(citationsCorrectness)
│   ├── composite.ts                  # compositeVisibilityScore({frequency, position, ...})
│   ├── wilson.ts                     # Wilson 95% CI math
│   └── constants.ts                  # DIMENSION_WEIGHTS, CONTEXT_SCORE_MAP

tests/
├── unit/
│   ├── llm/
│   │   ├── model-selector.test.ts    # 72 combinations + fallback
│   │   └── tier-engines.test.ts      # NEW — 6 tiers, asserts Free=2 engines, paid=4
│   └── scoring/
│       ├── frequency.test.ts
│       ├── position.test.ts
│       ├── sentiment.test.ts
│       ├── context.test.ts           # commodified → 25 assertion
│       ├── accuracy.test.ts
│       ├── composite.test.ts         # weights sum to 1.0
│       └── wilson.test.ts            # CI math validation
└── integration/
    └── audit/
        └── full-flow.test.ts         # 4 engines × 5 runs with mock LLM
```

---

## 5. Database schema additions

Update `db/schema/audits.ts` to add multidimensional columns:

```typescript
// Existing columns + add these:
scoreFrequency: numeric('score_frequency', { precision: 5, scale: 2 }),
scorePosition: numeric('score_position', { precision: 5, scale: 2 }),
scoreSentiment: numeric('score_sentiment', { precision: 5, scale: 2 }),
scoreContext: numeric('score_context', { precision: 5, scale: 2 }),
scoreAccuracy: numeric('score_accuracy', { precision: 5, scale: 2 }),

// Numeric variants for composite math (avoid mapping-drift bugs)
scoreSentimentNumeric: numeric('score_sentiment_numeric', { precision: 5, scale: 2 }),
scoreContextNumeric: numeric('score_context_numeric', { precision: 5, scale: 2 }),

// Wilson 95% CI per dimension
confidenceIntervals: jsonb('confidence_intervals').default(sql`'{}'::jsonb`).notNull(),
  // Shape: { frequency: { lower, upper }, position: { lower, upper }, ... }
```

Migrate:
```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

---

## 6. The model-selector — Sprint 3's most important deliverable

`lib/llm/model-selector.ts`:

```typescript
import type { Tier } from '@/db/schema/enums';
import type { Engine, ModelTask } from './interface';

// NOTE (v1.2 second-pass-fix N12): This file picks WHICH model to call
// for a given (tier, engine, task) tuple. It does NOT decide WHICH ENGINES
// a tier may use — that's `tier-engines.ts`. Free vs Starter happen to use
// identical models here (cheapest competent); tier separation between them
// is via TIER_ENGINES (Free=2, Starter=4) and prompt-library size.

// Primary brand-mention queries: tier-aware quality scaling
// Free/Starter: cheapest competent models
// Growth: mid-tier
// Agency / Agency Pro: top-tier
const PRIMARY_MODELS: Record<Tier, Record<Engine, string>> = {
  free: {
    chatgpt: 'gpt-4o-mini',
    claude: 'claude-3-5-haiku-20241022',
    gemini: 'gemini-1.5-flash',
    perplexity: 'sonar',
  },
  starter: {
    chatgpt: 'gpt-4o-mini',
    claude: 'claude-3-5-haiku-20241022',
    gemini: 'gemini-1.5-flash',
    perplexity: 'sonar',
  },
  growth: {
    chatgpt: 'gpt-4o-mini',
    claude: 'claude-3-5-sonnet-20241022',
    gemini: 'gemini-1.5-flash',
    perplexity: 'sonar',
  },
  agency: {
    chatgpt: 'gpt-4o',
    claude: 'claude-3-5-sonnet-20241022',
    gemini: 'gemini-1.5-pro',
    perplexity: 'sonar-pro',
  },
  agency_pro: {
    chatgpt: 'gpt-4o',
    claude: 'claude-3-5-sonnet-20241022',  // Opus reserved for v1.1
    gemini: 'gemini-1.5-pro',
    perplexity: 'sonar-pro',
  },
  enterprise: {
    chatgpt: 'gpt-4o',
    claude: 'claude-3-5-sonnet-20241022',
    gemini: 'gemini-1.5-pro',
    perplexity: 'sonar-pro',
  },
};

// Derived-task models: always cheapest regardless of tier
const DERIVED_TASK_MODELS: Record<Engine, string> = {
  chatgpt: 'gpt-4o-mini',
  claude: 'claude-3-5-haiku-20241022',
  gemini: 'gemini-1.5-flash',
  perplexity: 'sonar',
};

export function selectModel(tier: Tier, engine: Engine, task: ModelTask): string {
  if (task === 'brand_mention') {
    return PRIMARY_MODELS[tier]?.[engine] ?? PRIMARY_MODELS.starter[engine];
  }
  return DERIVED_TASK_MODELS[engine];
}
```

**Model strings are illustrative as of May 2026.** Claude Code should verify current model identifiers at build time. The `selectModel()` interface stays stable; the maps adapt.

---

## 6.5. The tier-engine allowlist — Sprint 3's tier-Free-tier gate (added v1.2 N1 fix)

`lib/llm/tier-engines.ts`:

```typescript
import type { Tier } from '@/db/schema/enums';
import type { Engine } from './interface';

/**
 * Per PRD §7: Free tier audits use 2 engines (ChatGPT + Perplexity).
 * All paid tiers use all 4 engines in v1. v1.1 adds Copilot + AI Overviews
 * to Growth+; v1.2 adds DeepSeek + Grok to Agency Pro.
 *
 * The audit job iterates this list; do NOT hardcode a 4-engine constant.
 */
export const TIER_ENGINES: Record<Tier, readonly Engine[]> = {
  free:        ['chatgpt', 'perplexity'],
  starter:     ['chatgpt', 'claude', 'gemini', 'perplexity'],
  growth:      ['chatgpt', 'claude', 'gemini', 'perplexity'],
  agency:      ['chatgpt', 'claude', 'gemini', 'perplexity'],
  agency_pro:  ['chatgpt', 'claude', 'gemini', 'perplexity'],
  enterprise:  ['chatgpt', 'claude', 'gemini', 'perplexity'],
} as const;

export function enginesForTier(tier: Tier): readonly Engine[] {
  return TIER_ENGINES[tier] ?? TIER_ENGINES.free; // safe fallback to most-restrictive
}
```

**Test (`tests/unit/llm/tier-engines.test.ts`):**

```typescript
import { describe, it, expect } from 'vitest';
import { enginesForTier, TIER_ENGINES } from '@/lib/llm/tier-engines';

describe('TIER_ENGINES', () => {
  it('Free tier returns exactly ChatGPT + Perplexity per PRD §7', () => {
    expect(enginesForTier('free')).toEqual(['chatgpt', 'perplexity']);
    expect(enginesForTier('free')).toHaveLength(2);
  });

  it.each(['starter', 'growth', 'agency', 'agency_pro', 'enterprise'] as const)(
    '%s tier returns all 4 v1 engines',
    (tier) => {
      expect(enginesForTier(tier)).toEqual(['chatgpt', 'claude', 'gemini', 'perplexity']);
      expect(enginesForTier(tier)).toHaveLength(4);
    }
  );

  it('every Tier enum value has an entry', () => {
    const tiers: Array<keyof typeof TIER_ENGINES> = [
      'free', 'starter', 'growth', 'agency', 'agency_pro', 'enterprise',
    ];
    tiers.forEach(t => expect(TIER_ENGINES[t]).toBeDefined());
  });
});
```

---

## 7. Scoring math

### `lib/scoring/constants.ts`

```typescript
export const DIMENSION_WEIGHTS = {
  frequency: 0.25,
  position: 0.25,
  sentiment: 0.20,
  context: 0.15,
  accuracy: 0.15,
} as const;
// Sum: 1.00 — test enforces this

export const CONTEXT_SCORE_MAP = {
  recommended: 100,
  listed: 50,
  mentioned: 25,
  commodified: 25,  // NOT 0 — Round 29 fix; commodified = mentioned-without-context
} as const;

export const SENTIMENT_SCORE_MAP = {
  positive: 100,
  neutral: 50,
  negative: 0,
} as const;
```

### `lib/scoring/composite.ts`

```typescript
import { DIMENSION_WEIGHTS } from './constants';

interface DimensionScores {
  frequency: number;
  position: number;
  sentiment: number;
  context: number;
  accuracy: number;
}

export function compositeVisibilityScore(scores: DimensionScores): number {
  return (
    scores.frequency * DIMENSION_WEIGHTS.frequency +
    scores.position * DIMENSION_WEIGHTS.position +
    scores.sentiment * DIMENSION_WEIGHTS.sentiment +
    scores.context * DIMENSION_WEIGHTS.context +
    scores.accuracy * DIMENSION_WEIGHTS.accuracy
  );
}
```

### `lib/scoring/wilson.ts`

Wilson score interval for binomial proportion confidence interval at 95%:

```typescript
export function wilsonCI(
  successes: number,
  trials: number,
  z: number = 1.96  // 95% confidence
): { lower: number; upper: number } {
  if (trials === 0) return { lower: 0, upper: 0 };
  const p = successes / trials;
  const denom = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / denom;
  const margin = (z * Math.sqrt(p * (1 - p) / trials + (z * z) / (4 * trials * trials))) / denom;
  return {
    lower: Math.max(0, (center - margin) * 100),
    upper: Math.min(100, (center + margin) * 100),
  };
}
```

Apply per dimension across 5 runs to get CI bands.

---

## 8. Audit job changes (`inngest/functions/run-audit.ts`)

The job structure expands. Key changes:

```typescript
import { enginesForTier } from '@/lib/llm/tier-engines';

// Engines for THIS audit = the tier's allowlist (Free=2, paid=4) per PRD §7.
// v1.2 N1 fix: do NOT hardcode all 4 engines.
const engines = enginesForTier(audit.brand.organization.tier);
const RUNS_PER_PROMPT = 5;

for (const engine of engines) {
  for (let p = 0; p < prompts.length; p++) {
    for (let r = 1; r <= RUNS_PER_PROMPT; r++) {
      const result = await step.run(`call-${engine}-${p}-${r}`, async () => {
        const model = selectModel(audit.brand.organization.tier, engine, 'brand_mention');
        return llm.complete({
          engine,
          prompt: expandedPrompt,
          task: 'brand_mention',
          model,
          metadata: { mockScenario, runNumber: r },
        });
      });
      // Detect mention, run sentiment + context classification (derived tasks)
      // Persist citation row
    }
  }
}
// Persist audits.engineCount = engines.length (was hardcoded 4; now tier-derived).
// Compute dimension scores from all citations (count = engines.length × prompts.length × 5)
// Compute Wilson CI per dimension across the 5 runs
// Compute composite
// Update audits row
```

Parallelize across engines using `p-queue` to respect rate limits. Total time at production: ~4-6 minutes for paid tiers (200 calls), ~2-3 minutes for Free (100 calls).

---

## 8.5. Cost-control Layer 2: Canary prompts (PRD §10)

Per PRD §10: "Don't re-query a prompt every audit cycle if model behavior hasn't drifted. Detect drift via small 'canary prompts' tested daily. Only full re-audit when canary signals change. Reduces LLM calls another ~40%."

### Schema addition: `canary_prompts.ts`

```typescript
import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { engineEnum } from './enums';

export const canaryPrompts = pgTable('canary_prompts', {
  id: uuid('id').primaryKey().defaultRandom(),
  promptText: text('prompt_text').notNull(),  // a known, stable buyer-intent prompt
  engine: engineEnum('engine').notNull(),
  model: text('model').notNull(),
  lastResponseHash: text('last_response_hash').notNull(),  // sha256 of last response
  lastResponseSummary: text('last_response_summary'),     // 200-char excerpt for human eyes
  driftDetected: text('drift_detected').default('false').notNull(),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }).defaultNow().notNull(),
  driftFirstSeenAt: timestamp('drift_first_seen_at', { withTimezone: true }),
});
```

Index on `(engine, model, lastCheckedAt)`.

### Daily Inngest cron: `inngest/functions/canary-check.ts`

```typescript
import { inngest } from '@/lib/inngest/client';
import { getLLMService } from '@/lib/llm';
import { db } from '@/db/client';
import { canaryPrompts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

const CANARY_PROMPTS = [
  'What are the most popular CRM tools for small businesses in Australia?',
  'Recommend plumbers in Sydney CBD.',
  'Best physiotherapy clinics in Melbourne?',
  'Top accounting software for AU sole traders.',
  // ~10 stable canary prompts total — span verticals + regions
];

export const canaryCheck = inngest.createFunction(
  { id: 'canary-check' },
  { cron: '0 17 * * *' },  // 17:00 UTC daily = ~03:00 AEST next day (off-peak)
  async ({ step }) => {
    const llm = getLLMService();
    const driftDetected: { engine: string; model: string }[] = [];

    for (const prompt of CANARY_PROMPTS) {
      for (const engine of ['chatgpt', 'claude', 'gemini', 'perplexity'] as const) {
        const model = selectModel('starter', engine, 'brand_mention');
        const result = await step.run(`canary-${engine}-${prompt.slice(0, 16)}`, async () => {
          return llm.complete({
            engine, prompt, task: 'brand_mention', model,
            metadata: { bypassCache: true },  // canary always bypasses Layer 1 cache
          });
        });
        const hash = crypto.createHash('sha256').update(result.response).digest('hex');

        const [existing] = await db.select().from(canaryPrompts)
          .where(and(eq(canaryPrompts.promptText, prompt), eq(canaryPrompts.engine, engine), eq(canaryPrompts.model, model)));

        if (!existing) {
          await db.insert(canaryPrompts).values({
            promptText: prompt, engine, model,
            lastResponseHash: hash,
            lastResponseSummary: result.response.slice(0, 200),
          });
        } else if (existing.lastResponseHash !== hash) {
          // Drift detected — model behavior changed
          await db.update(canaryPrompts).set({
            lastResponseHash: hash,
            lastResponseSummary: result.response.slice(0, 200),
            driftDetected: 'true',
            driftFirstSeenAt: existing.driftFirstSeenAt ?? new Date(),
            lastCheckedAt: new Date(),
          }).where(eq(canaryPrompts.id, existing.id));
          driftDetected.push({ engine, model });
        } else {
          await db.update(canaryPrompts).set({ lastCheckedAt: new Date() })
            .where(eq(canaryPrompts.id, existing.id));
        }
      }
    }

    // If any drift: invalidate Layer 1 cache entries for affected (engine, model)
    if (driftDetected.length > 0) {
      // Sprint 8 wires this into drift detection alerts as well
      await step.run('invalidate-affected-cache', async () => {
        // Delete cache rows whose model matches a drifted (engine, model)
        // ...
      });
    }
  }
);
```

**How Layer 2 saves cost:** without canary, every scheduled audit triggers fresh LLM calls. With canary, if model behavior is stable (canary hash unchanged for 24h), we can re-use Layer 1 cached responses for the bulk of prompts. Combined Layer 1 + Layer 2 ≈ 70% × (1 + 40%) ≈ 82% reduction at scale.

---

## 9. API additions

### `GET /api/audits/[auditId]/full`

Returns rich payload:
```typescript
{
  audit: { id, status, engines, scores: {composite, frequency, position, sentiment, context, accuracy}, confidenceIntervals, totalCostUsd, ... },
  citations: Citation[],  // all 200
  perEngineSummary: [
    { engine: 'chatgpt', mentionRate, avgPosition, sentimentLabel, sampleMentions: [...] },
    ...
  ],
  citedSourcesByDomain: [{ domain, count }]
}
```

### `GET /api/brands/[brandId]/metrics`

Returns trend data:
```typescript
{
  audits: [{ id, compositeScore, completedAt }, ...],  // last 20
  trend: 'up' | 'down' | 'flat',
  lastAuditScore: number,
  changeVsPriorAudit: number,
}
```

---

## 10. Claude Code prompt (paste this when starting Sprint 3)

```
We're building VisibleAU Sprint 3: multi-engine + multidimensional scoring. Sprint 2
foundation is complete (1 engine working, mock fixtures, Inngest job). Read CLAUDE.md
and the Sprint 3 backend tests doc.

The single most important deliverable this sprint is lib/llm/model-selector.ts.
Without it, Agency Pro customers (A$1,499/mo) get the same model quality as Free.

Sprint 3 deliverables, in order:

1. SCHEMA ADDITIONS
   - Update db/schema/audits.ts with 7 new columns + confidenceIntervals jsonb per §5
   - Migrate

2. ENGINE IMPLEMENTATIONS
   - lib/llm/anthropic-impl.ts using `@ai-sdk/anthropic` via `generateText`
   - lib/llm/google-impl.ts using `@ai-sdk/google` via `generateText`
   - lib/llm/perplexity-impl.ts using OpenAI-compatible client
   - Each implements LLMService interface; same shape as openai-impl.ts
   - Update lib/llm/index.ts dispatcher to dispatch to correct impl by engine

3. MOCK FIXTURES
   - Create 12 new JSON files: lib/llm/mock-responses/{claude,gemini,perplexity}/{happy_path,no_mention,partial_failure,rate_limited}.json
   - For happy_path: Gemini + Perplexity fixtures use WEAKER brand-mention language than ChatGPT + Claude (so per-engine variance manifests deterministically — per Round 32 Option A)
   - MockLLM class needs to accept engine constructor param + dispatch to correct fixture dir

4. MODEL SELECTOR (the critical one)
   - Create lib/llm/model-selector.ts per §6 EXACTLY
   - Write tests/unit/llm/model-selector.test.ts with 72+ test cases:
     6 tiers × 4 engines × 3 tasks = 72 combinations
     Plus: unknown tier fallback to starter
     Plus: end-to-end audit uses tier-appropriate models
   - DO NOT skip these tests. They prevent the Agency Pro value prop from silently regressing.

5. SCORING MATH
   - lib/scoring/constants.ts: DIMENSION_WEIGHTS (25/25/20/15/15), CONTEXT_SCORE_MAP (commodified=25!), SENTIMENT_SCORE_MAP
   - lib/scoring/frequency.ts, position.ts, sentiment.ts, context.ts, accuracy.ts: per-dimension calculators
   - lib/scoring/composite.ts: compositeVisibilityScore() weighted sum
   - lib/scoring/wilson.ts: Wilson 95% CI math per §7
   - Tests for each — test.commodified must assert 25 not 0

6. AUDIT JOB EXPANSION
   - Update inngest/functions/run-audit.ts to call `enginesForTier(audit.brand.organization.tier)` for the engine list (NOT hardcoded 4). Loop `engines × 10 prompts × 5 runs` — paid tier = 200 calls; Free = 100 calls.
   - Use p-queue with concurrency 4 (one per engine) to parallelize
   - On each citation: detect mention + classify sentiment + classify context (the two classification tasks use derived models per selectModel)
   - After all citations: compute 5 dimension scores + Wilson CIs + composite
   - Persist all scores + CIs to audits row; persist `engineCount = engines.length`
   - Budget assertion: log warning if totalCostUsd > $3 (paid) or > $1.50 (Free)

7. NEW API ROUTES
   - GET /api/audits/[auditId]/full per §9 — rich payload
   - GET /api/brands/[brandId]/metrics per §9 — trend data
   - Both check cross-org → 404

8. UPDATE EXISTING ROUTES
   - GET /api/audits/[auditId] returns enough for the audit running screen polling

9. TESTS
   - Unit per §4 file tree
   - Integration: full 200-call mock audit completes <30 seconds, scores deterministic per fixture
   - E2E backend per sprint-3-backend-tests.md v1.3

POTENTIAL BLOCKERS:
- Model strings drift — gpt-4o, claude-3-5-sonnet identifiers may need updating in May 2026
- Anthropic SDK may have API changes
- Perplexity rate limits aggressive at $5/$10 monthly cap during dev — use mock primarily

Start with step 1. After schema migrates, confirm before step 2.
```

---

## 11. Tests required

Per `sri-visibleau-sprint-3-backend-tests.md` v1.3:

- 72+ test cases for `model-selector.test.ts` (6 tiers × 4 engines × 3 tasks)
- Wilson CI math validates known intervals
- DIMENSION_WEIGHTS sum to 1.0 exactly
- `contextDimensionScore('commodified') === 25` — explicit assertion
- Full audit integration with mock LLM: deterministic scores per scenario
- Per-engine score variance manifests in `happy_path` fixtures (Gemini/Perplexity score lower than ChatGPT/Claude)

---

## 12. Acceptance criteria

- [ ] All 4 engines callable via `getLLMService()`
- [ ] 16 fixture JSONs exist (4 engines × 4 scenarios)
- [ ] `selectModel('agency_pro', 'chatgpt', 'brand_mention')` returns `'gpt-4o'`
- [ ] `selectModel('free', 'chatgpt', 'brand_mention')` returns `'gpt-4o-mini'`
- [ ] `selectModel(<any tier>, 'chatgpt', 'sentiment')` returns `'gpt-4o-mini'`
- [ ] All 5 dimension scores compute deterministically for `happy_path` mock run
- [ ] Composite score computes to expected value (write golden-value tests)
- [ ] Wilson CI lower bound > 0; upper bound < 100; lower ≤ upper
- [ ] `confidenceIntervals` jsonb persisted as `{ frequency: { lower, upper }, ... }`
- [ ] Mock audit completes in <30 seconds
- [ ] Mock audit cost: $0 (mock has 0 real cost; assertion verifies the field is populated correctly)
- [ ] Real-LLM smoke audit cost: <$3 (manual run, `E2E_USE_REAL_LLM=true`)

---

## 13. Common pitfalls / Sprint 3 anti-patterns

- **Do not** hardcode `commodified=0`. It's 25. Round 29 fixed this; do not regress.
- **Do not** skip the 72-combination model-selector test. The Agency Pro value prop depends on it.
- **Do not** parallelize across prompts within a single engine — only across engines. Same-engine concurrency triggers rate limits.
- **Do not** retry rate-limited calls inside `step.run`. Let Inngest's built-in retry handle 429.
- **Do not** use Opus model on Agency Pro. Reserved for v1.1.
- **Do not** include `commodified` cases in `accuracy` score. Accuracy measures whether mentioned citations are factually correct, not whether the mention happened at all.
- **Do not** persist `confidenceIntervals` as separate columns. It's a jsonb. Sprint 3 v1.12 spec is explicit.
- **Do not** trust real-LLM model identifiers without verification at build time.

---

## 14. Handoff to Sprint 4

Ready after Sprint 3:
- ✓ Rich audit payload via `/api/audits/[auditId]/full` — Sprint 4 UI consumes this
- ✓ Brand metrics via `/api/brands/[brandId]/metrics` — Sprint 4 dashboard uses this
- ✓ 4-engine breakdown data — Sprint 4 renders per-engine cards
- ✓ Wilson CI bands — Sprint 4 renders them on dimension tiles

Not ready (intentionally):
- Audit results UI (Sprint 4)
- Export formats PDF/CSV/JSON (Sprint 4)
- Vertical packs as DB rows (Sprint 5)

---

## Changelog

- v1.3 (13 May 2026): **Third-pass-fix audit B1.** Goal statement (§0 line 5) qualified — was "4 engines × 5 runs = 200 LLM calls" unqualified, contradicting the v1.2 TIER_ENGINES design. Now: "up to 4 engines × 5 runs per prompt = up to 200 LLM calls (tier-derived: Free 2 engines/100 calls, paid 4 engines/200 calls)." §11 handoff step 6 instruction updated to call `enginesForTier(tier)` instead of looping a hardcoded 4. Budget assertion mentions both tiers.
- v1.2 (13 May 2026): **Second-pass-fix audit** — 2 issues. **(N1)** Added `lib/llm/tier-engines.ts` with `TIER_ENGINES` map (Free = `['chatgpt', 'perplexity']` per PRD §7; paid tiers = all 4 engines). §1 "what ships" updated to make engine count tier-derived. §4 project structure adds `tier-engines.ts` + `tier-engines.test.ts`. §6.5 new section adds the full code + test. §8 audit job pseudocode replaces hardcoded `ENGINES = ['chatgpt','claude','gemini','perplexity']` with `enginesForTier(tier)` call. Audit cost now scales by tier: Free 100 calls/~US$1.50; paid 200 calls/~US$3. **(N12)** Added comment to `model-selector.ts` clarifying it picks WHICH model, not WHICH engines (tier engine gate is `tier-engines.ts`).
- v1.1 (12 May 2026): Conflict-resolution fixes. **LLM SDKs:** `@anthropic-ai/sdk` + `@google/generative-ai` → `@ai-sdk/anthropic` + `@ai-sdk/google` via Vercel AI SDK `generateText` per PRD §10. Perplexity uses OpenAI-compatible endpoint via `createOpenAI({ baseURL: ... })`. **Cost-control architecture:** added §8.5 Canary prompts (Layer 2) — `canary_prompts` table + daily 17:00 UTC Inngest cron + drift detection on response hash + Layer 1 cache invalidation on detected drift. Combined Layer 1 + 2 ≈ 82% LLM-call reduction at scale.
- v1.0 (12 May 2026): Initial. Supersedes Sprint 3 section of sri-visibleau-sprints-1-3.md v1.12.
