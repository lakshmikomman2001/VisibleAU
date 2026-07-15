# Sprint 3 — Multi-Engine + Multidimensional Scoring

**Sprint:** 3 of 12
**Estimated effort:** 46-58 hours (~6-7 weekends at 8 hrs/week)
**Goal:** Expand the audit job from 1 engine × 1 run to **up to 4 engines × 5 runs per prompt = up to 200 LLM calls** (tier-derived: Free 2 engines/100 calls, paid 4 engines/200 calls per `TIER_ENGINES`). Add multidimensional scoring (5 dimensions), Wilson 95% confidence intervals, tier-aware model selector. Per-audit cost budget <US$3 (paid tier) or ~US$1.50 (Free).
**Prerequisites:** Sprint 2 complete. ChatGPT implementation + mock fixtures + audit Inngest job all working.
**Out of scope:** UI to display the rich results (Sprint 4), vertical pack tables (Sprint 5), Action Center recommendations (Sprint 6), drift detection (Sprint 8).

---

## 0. Read first

1. `CLAUDE.md`
2. `sri-visibleau-foundations.md` v1.12 §3 schema additions to `audits` (multidimensional columns + confidenceIntervals)
3. `sri-visibleau-architecture-overview.md` v1.4 §11 — tier-aware model selector commitment
4. `sri-visibleau-sprint-3-backend-tests.md` v1.3 — defines the test surface
5. PRD v1.15 §10 — multidimensional scoring spec + Wilson CI math

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
- ✓ Per-audit cost budget: **<US$3 (≈A$4.50)** for paid tiers (200 primary calls); ~US$1.50 for Free (100 primary calls)
  - **AB4 note: derived task calls are additional.** `classifySentiment()` and `classifyContext()` each make one extra LLM call per mention row (always using the cheapest model for that engine). With ~14% brand mention rate (28/200 calls) and 2 derived tasks × 28 rows = 56 extra calls at gpt-4o-mini rates ≈ US$0.03. Total budget with derived tasks: ~US$3.03 paid / ~US$1.53 Free. The `<US$3` figure covers primary calls only; acceptance test should check `audit.totalCostUsd < 4.00` to include derived task headroom.
  - `audit.totalCalls` should reflect **primary calls only** (200 or 100) — derived task calls are tracked in `citations.llmCostUsd` and summed into `audit.totalCostUsd` but not counted as "calls" for the purposes of the call-count budget metric.
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

Update `db/schema/audits.ts` to add multidimensional columns. **Match Foundations v1.12 exactly** — column types are canonical:

```typescript
// Existing columns + add these (AB1 fix: scoreSentiment and scoreContext are TEXT categorical
// labels per Foundations v1.12; their numeric companions are separate columns):

// Frequency dimension — 0-100 numeric
scoreFrequency: numeric('score_frequency', { precision: 5, scale: 2 }),

// Position dimension — 0-100 numeric (inverse-scaled average position)
scorePosition: numeric('score_position', { precision: 5, scale: 2 }),

// Sentiment: TEXT categorical label (for UI badges) + NUMERIC companion (for composite math)
// AB1 fix: Sprint 3 §5 originally had scoreSentiment: numeric — WRONG.
// Foundations v1.12: scoreSentiment is text (label), scoreSentimentNumeric is the numeric value.
scoreSentiment: text('score_sentiment'),
  // 'positive' | 'neutral' | 'negative' — majority label across all mention citations
scoreSentimentNumeric: numeric('score_sentiment_numeric', { precision: 5, scale: 2 }),
  // 0-100 score from SENTIMENT_SCORE_MAP; this feeds compositeVisibilityScore()

// Context: TEXT categorical label + NUMERIC companion
// AB1 fix: scoreContext originally numeric — WRONG per Foundations v1.12.
scoreContext: text('score_context'),
  // 'recommended' | 'listed' | 'mentioned' | 'commodified' — majority label
scoreContextNumeric: numeric('score_context_numeric', { precision: 5, scale: 2 }),
  // 0-100 from CONTEXT_SCORE_MAP (commodified=25, NOT 0 — Round 29 fix, do not regress)

// Accuracy dimension — 0-100 numeric
scoreAccuracy: numeric('score_accuracy', { precision: 5, scale: 2 }),

// Composite weighted score — 0-100 numeric (already exists from Sprint 2 for basic score)
// scoreComposite: already present from Sprint 2 — Sprint 3 now populates it from all 5 dimensions

// Overall composite CI bounds (AB2 fix: Foundations v1.12 has these; Sprint 3 §5 omitted them)
scoreConfidenceLow: numeric('score_confidence_low', { precision: 5, scale: 2 }),
scoreConfidenceHigh: numeric('score_confidence_high', { precision: 5, scale: 2 }),

// Per-dimension Wilson 95% CI jsonb (finer-grained than the two columns above)
confidenceIntervals: jsonb('confidence_intervals').default(sql`'{}'::jsonb`).notNull(),
  // Shape: { frequency: { lower, upper }, position: { lower, upper }, sentiment: { lower, upper },
  //          context: { lower, upper }, accuracy: { lower, upper }, composite: { lower, upper } }

// Audit scale columns (AB2 fix: Foundations v1.12 has these; referenced in §8 but missing from §5)
engineCount: integer('engine_count'),
  // Set to engines.length at finalize — 2 for Free, 4 for paid tiers
promptCount: integer('prompt_count'),
  // Set to prompts.length at finalize — always 10 in Sprint 3 (Sprint 5 DB-backed = variable)
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

### `lib/scoring/frequency.ts` (Z1 fix — content was not specified)

```typescript
/**
 * Frequency dimension: how often is the brand mentioned?
 * Input: total citation rows for the audit, how many have brandMentioned=true.
 * Output: 0-100 score (100 = mentioned in every call).
 */
export function frequencyDimensionScore(
  mentionedCount: number,
  totalCalls: number,
): number {
  if (totalCalls === 0) return 0;
  return (mentionedCount / totalCalls) * 100;
}
```

### `lib/scoring/position.ts` (Z1 fix)

```typescript
/**
 * Position dimension: when mentioned, how early in the response?
 * Uses the approximate capitalised-word-group position from detect-mention.ts.
 * Lower position (mentioned earlier) = higher score.
 * Normalise: assume max meaningful position = 20 (arbitrary cap; mentions beyond 20 = "buried").
 * Score = max(0, (1 - (avgPosition - 1) / 20)) × 100
 * Position 1 → score 100. Position 11 → score 50. Position 21+ → score 0.
 */
export function positionDimensionScore(
  positions: (number | null)[],  // position from each mention; null = not mentioned
): number {
  const mentioned = positions.filter((p): p is number => p !== null);
  if (mentioned.length === 0) return 0;
  const avg = mentioned.reduce((sum, p) => sum + p, 0) / mentioned.length;
  const MAX_POSITION = 20;
  return Math.max(0, (1 - (avg - 1) / MAX_POSITION)) * 100;
}
```

### `lib/scoring/sentiment.ts` (Z1 fix)

```typescript
import { SENTIMENT_SCORE_MAP } from './constants';

type SentimentLabel = keyof typeof SENTIMENT_SCORE_MAP;

/**
 * Classify response sentiment for mentions only.
 * Sprint 2 stub: all = 'neutral'. Sprint 3 uses derived LLM call with cheapest model.
 */
export async function classifySentiment(
  response: string,
  brandName: string,
  llmService: import('@/lib/llm/interface').LLMService,
  engine: import('@/lib/llm/interface').Engine,
  model: string,
): Promise<SentimentLabel> {
  try {
    const result = await llmService.complete({
      engine,
      prompt: `The following AI response mentions "${brandName}". Classify the overall sentiment toward ${brandName} as exactly one of: positive, neutral, negative. Reply with just the word.\n\nResponse: ${response.slice(0, 800)}`,
      task: 'sentiment',
      model,
    });
    const label = result.response.trim().toLowerCase();
    if (label === 'positive' || label === 'negative') return label;
    return 'neutral';
  } catch {
    return 'neutral';  // safe default on classification failure
  }
}

/**
 * Aggregate sentiment scores across all mention citations.
 * Returns average of SENTIMENT_SCORE_MAP values, 0-100.
 */
export function sentimentDimensionScore(labels: SentimentLabel[]): number {
  if (labels.length === 0) return 0;
  const total = labels.reduce((sum, l) => sum + SENTIMENT_SCORE_MAP[l], 0);
  return total / labels.length;
}
```

### `lib/scoring/context.ts` (Z1 fix)

```typescript
import { CONTEXT_SCORE_MAP } from './constants';

type ContextLabel = keyof typeof CONTEXT_SCORE_MAP;

/**
 * Context dimension: HOW is the brand mentioned?
 * recommended=100, listed=50, mentioned=25, commodified=25.
 * IMPORTANT: commodified ≠ 0. Round 29 fix — do not regress.
 */
export async function classifyContext(
  response: string,
  brandName: string,
  llmService: import('@/lib/llm/interface').LLMService,
  engine: import('@/lib/llm/interface').Engine,
  model: string,
): Promise<ContextLabel> {
  try {
    const result = await llmService.complete({
      engine,
      prompt: `Classify how "${brandName}" is mentioned in the following AI response.
- recommended: explicitly recommended or highly suggested
- listed: included in a list without special emphasis
- mentioned: referenced briefly without listing or recommendation
- commodified: mentioned in a price-comparison or substitutable-product context
Reply with exactly one word: recommended, listed, mentioned, or commodified.

Response: ${response.slice(0, 800)}`,
      task: 'context',
      model,
    });
    const label = result.response.trim().toLowerCase();
    if (label in CONTEXT_SCORE_MAP) return label as ContextLabel;
    return 'mentioned';  // safe default
  } catch {
    return 'mentioned';
  }
}

/**
 * Average context scores (0-100) across all citation rows.
 */
export function contextDimensionScore(labels: ContextLabel[]): number {
  if (labels.length === 0) return 0;
  const total = labels.reduce((sum, l) => sum + CONTEXT_SCORE_MAP[l], 0);
  return total / labels.length;
}
```

### `lib/scoring/accuracy.ts` (Z1 fix)

```typescript
/**
 * Accuracy dimension: are cited sources real and correctly attributed?
 * Sprint 3: proxy metric — if citedSources is non-empty AND the response has
 * verifiable URL-like references, we treat that citation as accurate.
 * Sprint 7 wires real-URL verification (robots.txt check + domain existence).
 * For Sprint 3: accuracy = % of mention rows that have ≥1 cited source.
 */
export function accuracyDimensionScore(
  citationRows: Array<{ brandMentioned: boolean; citedSources: unknown }>,
): number {
  const mentionRows = citationRows.filter(c => c.brandMentioned);
  if (mentionRows.length === 0) return 0;
  const withSources = mentionRows.filter(c => {
    const sources = c.citedSources as Array<unknown>;
    return Array.isArray(sources) && sources.length > 0;
  });
  return (withSources.length / mentionRows.length) * 100;
}
```

---

## 8. Audit job changes (`inngest/functions/run-audit.ts`)

The job structure expands. Key changes:

```typescript
import { enginesForTier } from '@/lib/llm/tier-engines';

// X2 fix: 'audit.brand.organization.tier' requires a three-table join.
// The load step must fetch organization alongside brand so tier is available.
// Without the join, organization.tier is undefined → enginesForTier(undefined)
// falls back to 'free' → every audit silently runs as Free tier (2 engines).

// Engines for THIS audit = the tier's allowlist (Free=2, paid=4) per PRD §7.
// v1.2 N1 fix: do NOT hardcode all 4 engines.

// Updated load step pattern:
const loaded = await step.run('load-audit', async () => {
  const [a] = await db.select().from(audits).where(eq(audits.id, auditId));
  const [b] = await db.select().from(brands).where(eq(brands.id, a.brandId));
  const [org] = await db.select().from(organizations).where(eq(organizations.id, a.organizationId));
  await db.update(audits).set({ status: 'running', startedAt: new Date() })
    .where(eq(audits.id, auditId));
  return { audit: a, brand: b, tier: org.tier };  // tier passed explicitly
});

const engines = enginesForTier(loaded.tier);
const RUNS_PER_PROMPT = 5;

for (const engine of engines) {
  for (let p = 0; p < prompts.length; p++) {
    for (let r = 1; r <= RUNS_PER_PROMPT; r++) {
      const result = await step.run(`call-${engine}-${p}-${r}`, async () => {
        const model = selectModel(loaded.tier, engine, 'brand_mention');
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

```

**Citation aggregation algorithm (Z2 fix — never specified; Claude Code would invent inconsistent formulas):**

After all `engines × prompts × runs` calls complete, load all citations for this audit and compute dimension scores:

```typescript
// After all step.run loops complete:
await step.run('score-and-finalize', async () => {
  const allCitations = await db.select().from(citations).where(eq(citations.auditId, auditId));
  const totalCalls = engines.length * prompts.length * RUNS_PER_PROMPT;

  // Frequency: fraction of all calls where brand was mentioned
  const mentionedCount = allCitations.filter(c => c.brandMentioned).length;
  const scoreFrequency = frequencyDimensionScore(mentionedCount, totalCalls);

  // Position: average position across mention rows
  const positions = allCitations.filter(c => c.brandMentioned).map(c => c.position);
  const scorePosition = positionDimensionScore(positions);

  // Sentiment: average SENTIMENT_SCORE_MAP value across mention rows
  const sentimentLabels = allCitations
    .filter(c => c.brandMentioned && c.sentimentLabel)
    .map(c => c.sentimentLabel as SentimentLabel);
  const scoreSentiment = sentimentDimensionScore(sentimentLabels);
  const scoreSentimentNumeric = scoreSentiment;  // numeric variant = same value for now

  // Context: average CONTEXT_SCORE_MAP value across mention rows
  const contextLabels = allCitations
    .filter(c => c.brandMentioned && c.contextLabel)
    .map(c => c.contextLabel as ContextLabel);
  const scoreContext = contextDimensionScore(contextLabels);
  const scoreContextNumeric = scoreContext;

  // Accuracy: % of mention rows with ≥1 cited source (Sprint 3 proxy)
  const scoreAccuracy = accuracyDimensionScore(allCitations);

  // Wilson CI: applied per dimension using RUNS_PER_PROMPT as trials
  // (Wilson treats each run as a Bernoulli trial: mentioned=1, not-mentioned=0)
  const mentionsByRun = Array.from({ length: RUNS_PER_PROMPT }, (_, r) =>
    allCitations.filter(c => c.runNumber === r + 1 && c.brandMentioned).length
  );
  const totalPerRun = engines.length * prompts.length;
  const freqSuccesses = mentionsByRun.filter(m => m > 0).length;  // runs with ≥1 mention
  const confidenceIntervals = {
    frequency: wilsonCI(freqSuccesses, RUNS_PER_PROMPT),
    // Position CI: treat above-median position as success
    position: wilsonCI(mentionsByRun.filter(m => m > totalPerRun * 0.5).length, RUNS_PER_PROMPT),
    sentiment: wilsonCI(sentimentLabels.filter(l => l === 'positive').length, sentimentLabels.length || 1),
    context: wilsonCI(contextLabels.filter(l => l === 'recommended' || l === 'listed').length, contextLabels.length || 1),
    accuracy: wilsonCI(allCitations.filter(c => c.brandMentioned && (c.citedSources as unknown[])?.length > 0).length, mentionedCount || 1),
  };

  const composite = compositeVisibilityScore({ frequency: scoreFrequency, position: scorePosition, sentiment: scoreSentiment, context: scoreContext, accuracy: scoreAccuracy });

  await db.update(audits).set({
    status: 'complete',
    scoreComposite: composite.toFixed(2),
    scoreFrequency: scoreFrequency.toFixed(2),
    scorePosition: scorePosition.toFixed(2),
    scoreSentiment: scoreSentiment.toFixed(2),
    scoreContext: scoreContext.toFixed(2),
    scoreAccuracy: scoreAccuracy.toFixed(2),
    scoreSentimentNumeric: scoreSentimentNumeric.toFixed(2),
    scoreContextNumeric: scoreContextNumeric.toFixed(2),
    confidenceIntervals,
    totalCostUsd: totalCost.toFixed(4),
    engines: engines as string[],
    promptsCount: prompts.length,
    runsPerPrompt: RUNS_PER_PROMPT,
    totalCalls,
    completedAt: new Date(),
  }).where(eq(audits.id, auditId));
});
```

Parallelize across engines using `p-queue` to respect rate limits. Total time at production: ~4-6 minutes for paid tiers (200 calls), ~2-3 minutes for Free (100 calls).

---

## 8.5. Cost-control Layer 2: Canary prompts (PRD §10)

Per PRD §10: "Don't re-query a prompt every audit cycle if model behavior hasn't drifted. Detect drift via small 'canary prompts' tested daily. Only full re-audit when canary signals change. Reduces LLM calls another ~40%."

### Schema addition: `canary_prompts.ts`

```typescript
import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
// X4 fix: Foundations v1.12 §3 says engine is stored as text (not pgEnum) so new engines
// can be added via code change without a DB migration. Do NOT use engineEnum here.

export const canaryPrompts = pgTable('canary_prompts', {
  id: uuid('id').primaryKey().defaultRandom(),
  promptText: text('prompt_text').notNull(),  // a known, stable buyer-intent prompt
  engine: text('engine').notNull(),           // 'chatgpt' | 'claude' | 'gemini' | 'perplexity' (text, not enum)
  model: text('model').notNull(),
  lastResponseHash: text('last_response_hash').notNull(),  // sha256 of last response
  lastResponseSummary: text('last_response_summary'),     // 200-char excerpt for human eyes
  driftDetected: text('drift_detected').default('false').notNull(),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }).defaultNow().notNull(),
  driftFirstSeenAt: timestamp('drift_first_seen_at', { withTimezone: true }),
});
```

Index on `(engine, model, lastCheckedAt)`.

**Also add to `db/schema/index.ts` barrel (Z5 fix):**
```typescript
// Add alongside Sprint 2 exports:
export * from './canary-prompts';  // note: file named canary-prompts.ts

import { canaryPrompts } from './canary-prompts';
export type CanaryPrompt = InferSelectModel<typeof canaryPrompts>;
```
Without this export, `import { canaryPrompts } from '@/db/schema'` in `canary-check.ts` fails at build time.

### Daily Inngest cron: `inngest/functions/canary-check.ts`

```typescript
import { inngest } from '@/lib/inngest/client';
import { getLLMService } from '@/lib/llm';
import { selectModel } from '@/lib/llm/model-selector';  // X3 fix: was called but not imported
import { db } from '@/db/client';
import { canaryPrompts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';  // X3 fix: 'and' used in .where() but was missing
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
        // X5 fix: prompt.slice(0,16) risks collision if two prompts share the same prefix.
        // e.g. "Recommend plumbe..." and "Recommend plumbe..." (same 16 chars, different prompts)
        // would produce the same Inngest step key → memoised wrong result on replay.
        // Use a 12-char sha256 prefix of the full prompt text for stable unique keys.
        const promptKey = crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 12);
        const result = await step.run(`canary-${engine}-${promptKey}`, async () => {
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

**Both new routes must follow the Sprint 1 auth pattern (Z6 fix — never specified):**
```typescript
const currentUser = await getCurrentUser();
if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
await setRlsContext(db, currentUser.organizationId);
```
Then cross-org check: if the resource's `organizationId !== currentUser.organizationId` → return 404 (not 401).

### `GET /api/audits/[auditId]/full`

Auth: `getCurrentUser()` + `setRlsContext()`. Cross-org → 404.

Returns rich payload (AC4 fix — field names now explicit so Sprint 4 knows exactly what to read):
```typescript
// 200 response:
{
  audit: {
    id: string,
    auditNumber: number,
    status: 'pending' | 'running' | 'complete' | 'failed',
    engines: string[],
    engineCount: number | null,
    promptCount: number | null,
    runsPerPrompt: number | null,
    totalCalls: number | null,
    totalCostUsd: string | null,            // numeric serialised as string (Drizzle)
    scoreComposite: string | null,
    scoreFrequency: string | null,
    scorePosition: string | null,
    scoreSentiment: string | null,          // text: 'positive' | 'neutral' | 'negative'
    scoreSentimentNumeric: string | null,
    scoreContext: string | null,            // text: 'recommended' | 'listed' | 'commodified'
    scoreContextNumeric: string | null,
    scoreAccuracy: string | null,
    scoreConfidenceLow: string | null,
    scoreConfidenceHigh: string | null,
    confidenceIntervals: Record<string, { lower: number; upper: number }> | null,
    startedAt: string | null,
    completedAt: string | null,
    metadata: Record<string, unknown>,
  },
  citations: Array<{
    id: string, engine: string, prompt: string, runNumber: number,
    brandMentioned: boolean, position: number | null,
    sentimentLabel: string | null, contextLabel: string | null,
    responseSnippet: string | null,
    citedSources: Array<{ domain: string; url: string }>,
    llmCostUsd: string | null, llmModel: string | null,
  }>,   // all citation rows (up to 200 for paid; 100 for Free)
  perEngineSummary: Array<{
    engine: string,
    mentionRate: number,         // mentions / total calls for this engine (0-1)
    avgPosition: number | null,
    sentimentLabel: string | null,
    sampleMentions: string[],    // up to 3 responseSnippets where brandMentioned=true
  }>,
  citedSourcesByDomain: Array<{ domain: string; count: number }>, // sorted desc by count
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

   **`lib/llm/anthropic-impl.ts`** (AB3 fix — content was never specified):
   ```typescript
   import { createAnthropic } from '@ai-sdk/anthropic';
   import { generateText } from 'ai';
   import type { LLMService, CompleteInput, CompleteOutput } from './interface';
   import { computeCostUsd } from '@/lib/audit/compute-cost';

   const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

   export class AnthropicImpl implements LLMService {
     async complete(input: CompleteInput): Promise<CompleteOutput> {
       const modelId = input.model ?? 'claude-3-5-haiku-20241022';
       const result = await generateText({
         model: anthropic(modelId),
         prompt: input.prompt,
         temperature: 0.7,
         maxTokens: 800,
       });
       return {
         response: result.text,
         model: modelId,
         tokensUsed: result.usage.totalTokens,
         costEstimateUsd: computeCostUsd(modelId, result.usage.promptTokens, result.usage.completionTokens),
       };
     }
   }
   ```

   **`lib/llm/google-impl.ts`** (AB3 fix — content was never specified):
   ```typescript
   import { createGoogleGenerativeAI } from '@ai-sdk/google';
   import { generateText } from 'ai';
   import type { LLMService, CompleteInput, CompleteOutput } from './interface';
   import { computeCostUsd } from '@/lib/audit/compute-cost';

   // GOOGLE_AI_API_KEY is set in §3 env vars
   const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });

   export class GoogleImpl implements LLMService {
     async complete(input: CompleteInput): Promise<CompleteOutput> {
       const modelId = input.model ?? 'gemini-1.5-flash';
       const result = await generateText({
         model: google(modelId),
         prompt: input.prompt,
         temperature: 0.7,
         maxTokens: 800,
       });
       return {
         response: result.text,
         model: modelId,
         tokensUsed: result.usage.totalTokens,
         costEstimateUsd: computeCostUsd(modelId, result.usage.promptTokens, result.usage.completionTokens),
       };
     }
   }
   ```
   - Each implements LLMService interface; same shape as openai-impl.ts
   - Update lib/llm/index.ts dispatcher to dispatch to correct impl by engine

   **`lib/llm/perplexity-impl.ts`** (Z4 fix — baseURL never specified):
   ```typescript
   import { createOpenAI } from '@ai-sdk/openai';
   import { generateText } from 'ai';
   import type { LLMService, CompleteInput, CompleteOutput } from './interface';
   import { computeCostUsd } from '@/lib/audit/compute-cost';

   // Z4 fix: Perplexity uses an OpenAI-compatible API at this baseURL.
   // Without baseURL, createOpenAI defaults to api.openai.com — calls go to OpenAI, not Perplexity.
   const perplexity = createOpenAI({
     baseURL: 'https://api.perplexity.ai',
     apiKey: process.env.PERPLEXITY_API_KEY!,
   });

   export class PerplexityImpl implements LLMService {
     async complete(input: CompleteInput): Promise<CompleteOutput> {
       const modelId = input.model ?? 'sonar';
       const result = await generateText({
         model: perplexity(modelId),
         prompt: input.prompt,
         temperature: 0.7,
         maxTokens: 800,
       });
       return {
         response: result.text,
         model: modelId,
         tokensUsed: result.usage.totalTokens,
         costEstimateUsd: computeCostUsd(modelId, result.usage.promptTokens, result.usage.completionTokens),
       };
     }
   }
   ```

   **Updated `lib/llm/index.ts` dispatcher** (Z3 fix — Sprint 2 only had OpenAIImpl; Sprint 3 adds 3 more):
   ```typescript
   import { OpenAIImpl } from './openai-impl';
   import { AnthropicImpl } from './anthropic-impl';
   import { GoogleImpl } from './google-impl';
   import { PerplexityImpl } from './perplexity-impl';
   import { MockLLM } from './mock-impl';
   import type { Engine, LLMService, MockScenario } from './interface';

   // Real impl singletons — stateless, safe to cache per Lambda instance
   const realImpls: Partial<Record<Engine, LLMService>> = {};

   function getRealImpl(engine: Engine): LLMService {
     if (!realImpls[engine]) {
       switch (engine) {
         case 'chatgpt':    realImpls[engine] = new OpenAIImpl(); break;
         case 'claude':     realImpls[engine] = new AnthropicImpl(); break;
         case 'gemini':     realImpls[engine] = new GoogleImpl(); break;
         case 'perplexity': realImpls[engine] = new PerplexityImpl(); break;
       }
     }
     return realImpls[engine]!;
   }

   export function getLLMService(engine: Engine = 'chatgpt'): LLMService {
     if (process.env.LLM_MODE === 'mock' || process.env.NODE_ENV === 'test') {
       // Fresh MockLLM per call — stateful callCount must not persist across audits
       return new MockLLM(engine, (process.env.MOCK_SCENARIO as MockScenario | undefined) ?? 'happy_path');
     }
     return getRealImpl(engine);
   }
   ```

   Note: `getLLMService` now accepts an `engine` param. Update run-audit.ts to call `getLLMService(engine)` inside each engine loop iteration rather than once before the loop.

3. MOCK FIXTURES
   - Create 12 new JSON files: lib/llm/mock-responses/{claude,gemini,perplexity}/{happy_path,no_mention,partial_failure,rate_limited}.json
   - For happy_path: Gemini + Perplexity fixtures use WEAKER brand-mention language than ChatGPT + Claude (so per-engine variance manifests deterministically — per Round 32 Option A)
   - **Update `lib/llm/mock-impl.ts` MockLLM constructor** (AA3 fix — Sprint 2 constructor takes only `scenario`; the Z3 dispatcher now calls `new MockLLM(engine, scenario)` with engine first):

   ```typescript
   export class MockLLM implements LLMService {
     private fixtures: Map<Engine, Map<MockScenario, FixtureEntry[]>> = new Map();
     private callCount = 0;

     // AA3 fix: add engine as first constructor param to match updated getLLMService() call.
     // Sprint 2 had: constructor(private scenario: MockScenario)
     // Sprint 3 needs: constructor(private engine: Engine, private scenario: MockScenario)
     // The engine param is used to route to the correct fixture directory.
     constructor(private engine: Engine, private scenario: MockScenario = 'happy_path') {}

     private loadFixtures(engine: Engine, scenario: MockScenario): FixtureEntry[] {
       if (!this.fixtures.has(engine)) this.fixtures.set(engine, new Map());
       const cache = this.fixtures.get(engine)!;
       if (!cache.has(scenario)) {
         const fp = path.join(process.cwd(), 'lib/llm/mock-responses', engine, `${scenario}.json`);
         cache.set(scenario, JSON.parse(fs.readFileSync(fp, 'utf-8')));
       }
       return cache.get(scenario)!;
     }

     async complete(input: CompleteInput): Promise<CompleteOutput> {
       this.callCount++;
       const scenario = input.metadata?.mockScenario ?? this.scenario;
       // Use input.engine if provided, fall back to constructor engine
       const engine = input.engine ?? this.engine;
       const fixtures = this.loadFixtures(engine, scenario);
       // ... rest of implementation unchanged from Sprint 2 ...
     }
   }
   ```

   **Fixture content (AA4 fix — 12 files listed but content never specified; integration tests need real JSON):**

   `lib/llm/mock-responses/claude/happy_path.json` — strong mention (Claude-style verbose response):
   ```json
   [{"prompt_pattern":"","response":"In my assessment, Bondi Plumbing stands out as a highly recommended option for emergency plumbing needs in Sydney's eastern suburbs. The company has established a strong reputation for reliability and quality workmanship. I would particularly highlight their 24/7 availability and transparent pricing as key differentiators in the local market.","tokens_used":68,"cost_estimate_usd":0.003}]
   ```

   `lib/llm/mock-responses/gemini/happy_path.json` — **WEAKER** mention (Gemini-style neutral listing, per Round 32 Option A):
   ```json
   [{"prompt_pattern":"","response":"For plumbing services in Sydney you might consider several local providers. Bondi Plumbing is one option in the eastern suburbs area, along with Eastern Plumbing Co and Sydney Pipe Pros. Comparing reviews on hipages.com.au is recommended before making a decision.","tokens_used":52,"cost_estimate_usd":0.002}]
   ```

   `lib/llm/mock-responses/perplexity/happy_path.json` — **WEAKER** mention (Perplexity-style citation-heavy, brand mentioned but not strongly recommended):
   ```json
   [{"prompt_pattern":"","response":"Based on local search results and reviews, plumbing services in the Sydney eastern suburbs include Bondi Plumbing (bondiplumbing.com.au), Eastern Plumbing Co, and Parramatta Pipes. According to hipages.com.au, response times and pricing vary between providers. It is advisable to request multiple quotes.","tokens_used":58,"cost_estimate_usd":0.002}]
   ```

   For `no_mention.json`, `partial_failure.json`, `rate_limited.json` across all three engines: use the same structure as the existing `chatgpt/` fixtures — the scenarios are engine-agnostic (the error behaviour is in `error_status`, not the response text). Copy the chatgpt fixture content, adjusting `response` text to remove any chatgpt-specific phrasing.
   - Create lib/llm/model-selector.ts per §6 EXACTLY
   - Write tests/unit/llm/model-selector.test.ts with 72+ test cases:
     6 tiers × 4 engines × 3 tasks = 72 combinations
     Plus: unknown tier fallback to starter

   **`tests/unit/llm/model-selector.test.ts`** (AA1 fix — CLAUDE.md: "Do not skip writing these tests"):

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { selectModel } from '@/lib/llm/model-selector';
   import type { Tier, Engine, ModelTask } from '@/lib/llm/interface';

   const TIERS: Tier[] = ['free', 'starter', 'growth', 'agency', 'agency_pro', 'enterprise'];
   const ENGINES: Engine[] = ['chatgpt', 'claude', 'gemini', 'perplexity'];
   const TASKS: ModelTask[] = ['brand_mention', 'sentiment', 'context'];

   describe('selectModel — 72 combination matrix', () => {
     // Tier × Engine × Task coverage
     it.each(TIERS)('%s tier: returns a non-empty string for all engines and tasks', (tier) => {
       for (const engine of ENGINES) {
         for (const task of TASKS) {
           const model = selectModel(tier, engine, task);
           expect(typeof model).toBe('string');
           expect(model.length).toBeGreaterThan(0);
         }
       }
     });

     // Derived tasks always use cheapest model regardless of tier
     it('sentiment + context tasks always return derived (cheapest) model, regardless of tier', () => {
       for (const engine of ENGINES) {
         const agencyProSentiment = selectModel('agency_pro', engine, 'sentiment');
         const freeSentiment = selectModel('free', engine, 'sentiment');
         expect(agencyProSentiment).toBe(freeSentiment);  // same cheapest model
       }
     });

     // Tier quality escalation for brand_mention
     it('agency tier uses gpt-4o for ChatGPT (not gpt-4o-mini)', () => {
       expect(selectModel('agency', 'chatgpt', 'brand_mention')).toBe('gpt-4o');
     });
     it('agency_pro tier uses gpt-4o for ChatGPT', () => {
       expect(selectModel('agency_pro', 'chatgpt', 'brand_mention')).toBe('gpt-4o');
     });
     it('free/starter tier uses gpt-4o-mini for ChatGPT', () => {
       expect(selectModel('free', 'chatgpt', 'brand_mention')).toBe('gpt-4o-mini');
       expect(selectModel('starter', 'chatgpt', 'brand_mention')).toBe('gpt-4o-mini');
     });
     it('agency tier uses sonar-pro for Perplexity', () => {
       expect(selectModel('agency', 'perplexity', 'brand_mention')).toBe('sonar-pro');
     });
     it('free/starter tier uses sonar for Perplexity', () => {
       expect(selectModel('free', 'perplexity', 'brand_mention')).toBe('sonar');
       expect(selectModel('starter', 'perplexity', 'brand_mention')).toBe('sonar');
     });

     // Agency Pro value prop: same top-tier models as agency (Opus reserved for v1.1)
     it('agency_pro uses same models as agency in v1 (Opus reserved for v1.1)', () => {
       for (const engine of ENGINES) {
         expect(selectModel('agency_pro', engine, 'brand_mention'))
           .toBe(selectModel('agency', engine, 'brand_mention'));
       }
     });

     // Unknown tier fallback
     it('unknown tier falls back to starter models via ?? operator', () => {
       // TypeScript prevents this at compile time, but test the runtime guard
       const model = selectModel('unknown' as Tier, 'chatgpt', 'brand_mention');
       expect(model).toBe('gpt-4o-mini');  // starter fallback
     });

     // Exhaustive: test all 72 combinations explicitly
     describe('exhaustive 72-combination matrix', () => {
       it.each(
         TIERS.flatMap(tier =>
           ENGINES.flatMap(engine =>
             TASKS.map(task => ({ tier, engine, task }))
           )
         )
       )('$tier/$engine/$task → valid model string', ({ tier, engine, task }) => {
         expect(selectModel(tier, engine, task)).toBeTruthy();
       });
     });
   });
   ```

5. SCORING MATH
   - lib/scoring/constants.ts: DIMENSION_WEIGHTS (25/25/20/15/15), CONTEXT_SCORE_MAP (commodified=25!), SENTIMENT_SCORE_MAP
   - lib/scoring/frequency.ts, position.ts, sentiment.ts, context.ts, accuracy.ts: per-dimension calculators
   - lib/scoring/composite.ts: compositeVisibilityScore() weighted sum
   - lib/scoring/wilson.ts: Wilson 95% CI math per §7
   - Tests for each — test.commodified must assert 25 not 0
   - **Update `lib/audit/compute-cost.ts` pricing table** (AC1 fix — Sprint 3 models all return 0 from the Sprint 2 table):
     Sprint 3 `selectModel()` returns full model names like `claude-3-5-haiku-20241022`. The Sprint 2 table only has `claude-3-5-haiku` (no date suffix). Add all Sprint 3 model strings to the pricing table:
     `'claude-3-5-haiku-20241022'`, `'claude-3-5-sonnet-20241022'`, `'gemini-1.5-pro'`, `'sonar'`, `'sonar-pro'`.
     The updated table is specified in Sprint 2 v1.11 `lib/audit/compute-cost.ts` — verify it is present before running Sprint 3.

   **Key scoring tests (AA2 fix — test bodies never specified; these catch the most likely regressions):**

   ```typescript
   // tests/unit/scoring/context.test.ts
   import { contextDimensionScore } from '@/lib/scoring/context';
   import { CONTEXT_SCORE_MAP } from '@/lib/scoring/constants';

   describe('contextDimensionScore', () => {
     it('commodified = 25 NOT 0 (Round 29 canonical — do not regress)', () => {
       // This is the most important assertion in Sprint 3. commodified was 0 in an earlier
       // version. Round 29 fixed it to 25 (same as mentioned). Never let this regress.
       expect(CONTEXT_SCORE_MAP.commodified).toBe(25);
       expect(contextDimensionScore(['commodified'])).toBe(25);
     });
     it('recommended = 100', () => expect(contextDimensionScore(['recommended'])).toBe(100));
     it('listed = 50', () => expect(contextDimensionScore(['listed'])).toBe(50));
     it('mixed average: (100+50)/2 = 75', () => expect(contextDimensionScore(['recommended', 'listed'])).toBe(75));
     it('empty array = 0', () => expect(contextDimensionScore([])).toBe(0));
   });

   // tests/unit/scoring/composite.test.ts
   import { compositeVisibilityScore } from '@/lib/scoring/composite';
   import { DIMENSION_WEIGHTS } from '@/lib/scoring/constants';

   describe('compositeVisibilityScore', () => {
     it('weights sum to exactly 1.00', () => {
       const sum = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
       expect(sum).toBeCloseTo(1.0, 10);
     });
     it('all-100 inputs → 100', () => {
       expect(compositeVisibilityScore({ frequency: 100, position: 100, sentiment: 100, context: 100, accuracy: 100 })).toBe(100);
     });
     it('prototype fixture inputs → 77.1', () => {
       // X8 fix values: Frequency=78, Position=72, Sentiment=81, Context=64, Accuracy=92
       const result = compositeVisibilityScore({ frequency: 78, position: 72, sentiment: 81, context: 64, accuracy: 92 });
       expect(result).toBeCloseTo(77.1, 1);
     });
   });

   // tests/unit/scoring/wilson.test.ts
   import { wilsonCI } from '@/lib/scoring/wilson';

   describe('wilsonCI', () => {
     it('0 trials → { lower: 0, upper: 0 }', () => expect(wilsonCI(0, 0)).toEqual({ lower: 0, upper: 0 }));
     it('5/5 successes → upper near 100', () => expect(wilsonCI(5, 5).upper).toBeGreaterThan(90));
     it('0/5 successes → lower = 0', () => expect(wilsonCI(0, 5).lower).toBe(0));
     it('3/5 → lower < 60 < upper (brackets the true 60%)', () => {
       const { lower, upper } = wilsonCI(3, 5);
       expect(lower).toBeLessThan(60);
       expect(upper).toBeGreaterThan(60);
     });
   });

   // tests/unit/scoring/frequency.test.ts
   import { frequencyDimensionScore } from '@/lib/scoring/frequency';
   describe('frequencyDimensionScore', () => {
     it('0 calls → 0', () => expect(frequencyDimensionScore(0, 0)).toBe(0));
     it('10/10 → 100', () => expect(frequencyDimensionScore(10, 10)).toBe(100));
     it('28/200 → 14', () => expect(frequencyDimensionScore(28, 200)).toBeCloseTo(14, 1));
   });
   ```

6. AUDIT JOB EXPANSION
   - Update inngest/functions/run-audit.ts to call `enginesForTier(audit.brand.organization.tier)` for the engine list (NOT hardcoded 4). Loop `engines × 10 prompts × 5 runs` — paid tier = 200 calls; Free = 100 calls.
   - Use p-queue with concurrency `engines.length` (tier-derived: Free=2, paid=4). **Do not hardcode 4** — Free tier runs 2 engines; hardcoded 4 creates 2 idle queue slots and misleads future readers. (X6 fix)
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
   - **Register `canaryCheck` in `app/api/webhooks/inngest/route.ts`** (X7 fix — Sprint 3 adds this Inngest function; it must be added to the serve() functions array or the daily cron will never fire):
     ```typescript
     // app/api/webhooks/inngest/route.ts
     import { runAudit } from '@/inngest/functions/run-audit';
     import { sendAuditCompleteEmail } from '@/inngest/functions/send-audit-complete-email';
     import { canaryCheck } from '@/inngest/functions/canary-check';  // NEW Sprint 3

     export const { GET, POST, PUT } = serve({
       client: inngest,
       functions: [runAudit, sendAuditCompleteEmail, canaryCheck],
     });
     ```

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
- [ ] **(AC3a)** `audits.score_sentiment` is a text column containing `'positive'`, `'neutral'`, or `'negative'` — NOT a numeric value. Verify migration produced `TEXT` type, not `NUMERIC`.
- [ ] **(AC3b)** `enginesForTier('free')` returns exactly `['chatgpt', 'perplexity']` (2 engines). `enginesForTier('starter')` returns 4 engines. Verified by `tier-engines.test.ts`.
- [ ] **(AC3c)** `scoreConfidenceLow ≤ scoreComposite ≤ scoreConfidenceHigh` for every completed audit. Assert in `full-flow.test.ts`.
- [ ] **(AC3d)** `canaryCheck` appears in Inngest dashboard function list after `pnpm inngest-cli dev` — confirms it is registered in `serve()` and the cron schedule is active.

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
- **(AC2a) Do not** use `typeof db` as the transaction parameter type in `getNextAuditNumber`. Inside `db.transaction()`, `tx` is a `PgTransaction` type — not `typeof db`. Use `type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]`. TypeScript strict mode will catch this at compile time.
- **(AC2b) Do not** call `new MockLLM(scenario)` with only one argument. Sprint 3 requires `new MockLLM(engine, scenario)` so the fixture loader uses the correct engine subdirectory. A single-argument call assigns the engine string to `scenario` and loads from `undefined/happy_path.json` — ENOENT crash.
- **(AC2c) Do not** omit `canaryCheck` from the `serve()` call in `app/api/webhooks/inngest/route.ts`. Inngest only fires functions registered in `serve()`. An unregistered `canaryCheck` function means the daily 17:00 UTC cron never executes — Layer 2 cost control is permanently inactive with no error or warning.

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

- v1.8 (16 May 2026): **Fifth-pass audit — pricing table, anti-patterns, acceptance, /full response shape (AC1-AC5).** **(AC1)** `lib/audit/compute-cost.ts` pricing table (specified in Sprint 2) updated for Sprint 3 model strings — all 5 Sprint 3 models returned `0` cost: `claude-3-5-haiku-20241022`, `claude-3-5-sonnet-20241022`, `gemini-1.5-pro`, `sonar`, `sonar-pro`. Key issue: Sprint 2 used `'claude-3-5-haiku'` but Sprint 3 `selectModel()` returns `'claude-3-5-haiku-20241022'` — the only Anthropic model Sprint 2 priced was unreachable. Sprint 3 §10 step 5 now explicitly says to verify the pricing table is updated before running Sprint 3. **(AC2)** §13 anti-patterns: three new entries — (a) `typeof db` as transaction type causes TypeScript error; (b) `new MockLLM(scenario)` without engine param assigns engine string to scenario, loading from wrong fixture path; (c) `canaryCheck` omitted from `serve()` silently disables the daily cron. **(AC3)** §12 acceptance: four new checks — (a) `score_sentiment` is TEXT not NUMERIC in the migration; (b) `enginesForTier('free')` = exactly 2 engines; (c) `scoreConfidenceLow ≤ scoreComposite ≤ scoreConfidenceHigh`; (d) canaryCheck visible in Inngest dashboard. **(AC4)** `GET /api/audits/[auditId]/full` response shape now fully specified with all field names and types — Sprint 4 must know exactly what to read. **(AC5)** Prototype `AuditResultsRich` history comparison: upon inspection, the 73.9/68.2 values no longer exist in the prototype (corrected in earlier passes); no fix required.
- v1.7 (16 May 2026): **Fourth-pass audit — schema type correctness, missing columns, impl content, cost budget (AB1-AB5).** **(AB1)** §5 schema: `scoreSentiment` changed from `numeric` → `text` (categorical label `'positive'\|'neutral'\|'negative'`) and `scoreContext` changed from `numeric` → `text` (categorical label `'recommended'\|'listed'\|'commodified'`) — Foundations v1.12 canonical; numeric companions `scoreSentimentNumeric` and `scoreContextNumeric` are separate columns. **(AB2)** §5 schema: added four missing columns present in Foundations v1.12: `scoreConfidenceLow numeric`, `scoreConfidenceHigh numeric` (overall composite CI bounds), `engineCount integer` (set to `engines.length` at finalize), `promptCount integer` (set to `prompts.length`). **(AB3)** `anthropic-impl.ts` and `google-impl.ts` content now specified — both use `@ai-sdk/anthropic` / `@ai-sdk/google` + `generateText` + `computeCostUsd()`; env var names `ANTHROPIC_API_KEY` and `GOOGLE_AI_API_KEY` documented. **(AB4)** Budget note added: `classifySentiment()` + `classifyContext()` make ~56 additional LLM calls per paid-tier audit (~28 mention rows × 2 derived tasks); total cost including derived tasks ≈ US$3.03 paid / US$1.53 Free. Acceptance test threshold updated to `totalCostUsd < 4.00`. **(AB5)** Prototype `AuditResultsRich` per-engine card — see prototype changelog.
- v1.6 (16 May 2026): **Third-pass audit — test bodies, MockLLM constructor, fixture content, dimension consistency (AA1-AA5).** **(AA1)** §10 step 4: `model-selector.test.ts` content now specified — 72-combination matrix using `it.each` over all tier×engine×task tuples, plus quality-escalation assertions (agency uses gpt-4o/sonar-pro; free/starter use gpt-4o-mini/sonar), derived-task cheapest-model invariant, agency_pro value prop test (matches agency in v1), and unknown-tier fallback guard. CLAUDE.md: "Do not skip these tests." **(AA2)** §10 step 5: key scoring test bodies specified — `context.test.ts` asserts `commodified === 25` (Round 29 critical regression prevention); `composite.test.ts` asserts weights sum to 1.00 and prototype fixture inputs produce 77.1; `wilson.test.ts` asserts 0 trials, full success, partial; `frequency.test.ts` asserts 28/200→14. **(AA3)** §10 step 3: `MockLLM` constructor update specified — Sprint 2 constructor takes only `scenario`; the Z3 dispatcher now calls `new MockLLM(engine, scenario)` so the class must be updated with `engine` as the first parameter; `loadFixtures()` uses `input.engine ?? this.engine`. **(AA4)** §10 step 3: fixture content for `claude/happy_path.json` (strong verbose mention), `gemini/happy_path.json` (weaker neutral listing per Round 32 Option A), `perplexity/happy_path.json` (weaker citation-heavy mention) now specified. Other scenario files copy chatgpt structure with engine-neutral responses. **(AA5)** Prototype `AuditResultsRich`: Frequency dimension tile was 78 but `frequencyDimensionScore(28, 200)=14`; value 78 was reused from ChatGPT per-engine composite, not the frequency formula. All 5 dimension scores corrected to internal consistency with fixture data (28 mentions / 200 calls): Frequency=14, Position=90, Sentiment=79, Context=73, Accuracy=71. Composite updated from 77.1 → 63.4 (14×0.25 + 90×0.25 + 79×0.20 + 73×0.15 + 71×0.15).
- v1.5 (16 May 2026): **Second-pass audit — scoring formulas, aggregation, dispatcher, Perplexity baseURL, barrel, auth (Z1-Z7).** **(Z1)** §7: five dimension calculator implementations now specified — `frequency.ts` (mentionedCount/total × 100), `position.ts` (inverse-scaled avg position, max=20 cap), `sentiment.ts` (avg SENTIMENT_SCORE_MAP + `classifySentiment()` derived task), `context.ts` (avg CONTEXT_SCORE_MAP + `classifyContext()` derived task), `accuracy.ts` (% mention rows with ≥1 cited source, Sprint 3 proxy). Without these, Claude Code must invent formulas that won't match acceptance tests. **(Z2)** §8: citation aggregation algorithm now specified — after all loops, load all citation rows and compute each dimension; Wilson CI applied per-run; finalize step persists all 7 new score columns + `confidenceIntervals` jsonb. **(Z3)** §10 step 2: updated `lib/llm/index.ts` dispatcher now specified — Sprint 2 only had `OpenAIImpl`; Sprint 3 adds `AnthropicImpl`, `GoogleImpl`, `PerplexityImpl` dispatched by `engine` param. `getLLMService()` now accepts `engine: Engine` argument; fresh `MockLLM(engine, scenario)` per call. **(Z4)** `perplexity-impl.ts` baseURL now specified: `https://api.perplexity.ai` — without it `createOpenAI()` defaults to `api.openai.com`, silently sending Perplexity calls to OpenAI. **(Z5)** `db/schema/index.ts`: `canaryPrompts` / `canary-prompts.ts` barrel export now specified — missing export causes `import { canaryPrompts } from '@/db/schema'` in canary-check.ts to fail at build. **(Z6)** §9 API routes: `getCurrentUser()` + `setRlsContext()` auth pattern now specified for both new routes — without it RLS on audits/citations is bypassed. **(Z7)** Prototype `AuditResultsRich` sentiment average: see prototype changelog.
- v1.4 (16 May 2026): **First-pass audit — version refs, missing imports, schema correctness, Inngest registration (X1-X8).** **(X1)** §0: Foundations v1.9 → v1.12; PRD v1.14 → v1.15. **(X2)** §8 run-audit.ts: `audit.brand.organization.tier` requires a three-table join never specified in the load step. `enginesForTier(undefined)` falls back to `free` silently running every paid audit as 2 engines. Load step now fetches `organizations` row and returns `{ audit, brand, tier }` explicitly. **(X3)** §8.5 canary-check.ts: `selectModel` called but not imported; `and` used in `.where()` but missing from drizzle-orm import — both compile errors. **(X4)** §8.5 canary_prompts schema: `engineEnum('engine')` changed to `text('engine').notNull()` — Foundations v1.12 §3 explicitly stores engine as text so new engines don't require a migration. **(X5)** §8.5 canary-check.ts: step key `canary-${engine}-${prompt.slice(0,16)}` risks collision when two prompts share the same 16-char prefix → Inngest memoises wrong result on replay. Fixed to use 12-char sha256 hex prefix of full prompt. **(X6)** §10 step 6: `p-queue concurrency 4` changed to `engines.length` — Free tier runs 2 engines; hardcoded 4 creates idle queue slots. **(X7)** Sprint 3 `canaryCheck` Inngest function never registered in `app/api/webhooks/inngest/route.ts` serve() call — daily cron would never fire. Registration code now specified. **(X8)** Prototype `AuditResultsRich` composite score: shown as 71.4 but dimension math (78×0.25 + 72×0.25 + 81×0.20 + 64×0.15 + 92×0.15) = 77.1; 5.7-point discrepancy. Fixed to 77.1.
- v1.3 (13 May 2026): **Third-pass-fix audit B1.** Goal statement (§0 line 5) qualified — was "4 engines × 5 runs = 200 LLM calls" unqualified, contradicting the v1.2 TIER_ENGINES design. Now: "up to 4 engines × 5 runs per prompt = up to 200 LLM calls (tier-derived: Free 2 engines/100 calls, paid 4 engines/200 calls)." §11 handoff step 6 instruction updated to call `enginesForTier(tier)` instead of looping a hardcoded 4. Budget assertion mentions both tiers.
- v1.2 (13 May 2026): **Second-pass-fix audit** — 2 issues. **(N1)** Added `lib/llm/tier-engines.ts` with `TIER_ENGINES` map (Free = `['chatgpt', 'perplexity']` per PRD §7; paid tiers = all 4 engines). §1 "what ships" updated to make engine count tier-derived. §4 project structure adds `tier-engines.ts` + `tier-engines.test.ts`. §6.5 new section adds the full code + test. §8 audit job pseudocode replaces hardcoded `ENGINES = ['chatgpt','claude','gemini','perplexity']` with `enginesForTier(tier)` call. Audit cost now scales by tier: Free 100 calls/~US$1.50; paid 200 calls/~US$3. **(N12)** Added comment to `model-selector.ts` clarifying it picks WHICH model, not WHICH engines (tier engine gate is `tier-engines.ts`).
- v1.1 (12 May 2026): Conflict-resolution fixes. **LLM SDKs:** `@anthropic-ai/sdk` + `@google/generative-ai` → `@ai-sdk/anthropic` + `@ai-sdk/google` via Vercel AI SDK `generateText` per PRD §10. Perplexity uses OpenAI-compatible endpoint via `createOpenAI({ baseURL: ... })`. **Cost-control architecture:** added §8.5 Canary prompts (Layer 2) — `canary_prompts` table + daily 17:00 UTC Inngest cron + drift detection on response hash + Layer 1 cache invalidation on detected drift. Combined Layer 1 + 2 ≈ 82% LLM-call reduction at scale.
- v1.0 (12 May 2026): Initial. Supersedes Sprint 3 section of sri-visibleau-sprints-1-3.md v1.12.
