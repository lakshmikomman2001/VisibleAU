# Sprint 2 — Single-Engine Audit + Mock LLM Mode

**Sprint:** 2 of 12
**Estimated effort:** 12-15 hours (~2 weekends at 8 hrs/week)
**Goal:** Run a one-engine (ChatGPT) audit end-to-end against a brand, persist citations, send a completion email. Add the canonical mock LLM mode for local dev + CI.
**Prerequisites:** Sprint 1 complete and accepted. Tables `organizations`, `users`, `brands` exist. Inngest client wired.
**Out of scope:** Multi-engine (Sprint 3), multidimensional scoring (Sprint 3), audit results UI (Sprint 4), vertical packs (Sprint 5). Sprint 2 uses an inline 10-prompt array.

---

## 0. Read first

1. `CLAUDE.md` — design doc (auto-loaded)
2. `sri-visibleau-foundations.md` v1.9 §3 schema additions for `audits` + `citations`
3. `sri-visibleau-architecture-overview.md` v1.4 §5-§7 — LLM layer, audit job flow, mock mode rationale

If conflicts with this prompt, flag to Sri before building.

---

## 1. What ships this sprint

- ✓ `LLMService` interface (`lib/llm/interface.ts`)
- ✓ OpenAI implementation (`lib/llm/openai-impl.ts`) — ChatGPT only this sprint
- ✓ Mock LLM implementation (`lib/llm/mock-impl.ts`) — thin loader for JSON fixtures
- ✓ 4 canonical mock fixtures for ChatGPT: `happy_path`, `no_mention`, `partial_failure`, `rate_limited`
- ✓ Schema: `audits` + `citations` tables
- ✓ Inngest function `run-audit.ts` — single-engine, 10 prompts × 1 run = 10 LLM calls
- ✓ `POST /api/audits` endpoint (triggers Inngest event)
- ✓ `GET /api/audits/:id` endpoint (status + basic results)
- ✓ Brand mention detection, position extraction, cited source extraction
- ✓ Audit completion email via Resend with React Email template
- ✓ `audits.metadata.mockScenario` persistence when `LLM_MODE=mock`
- ✓ Tests: unit (mock fixture loading), integration (audit flow), E2E (audit creation + completion)
- ✓ Cost budget: **<$0.10 per audit** (10 calls × ~$0.005-0.01/call GPT-4o-mini)

**Definition of done:** A user clicks "Run audit" on a brand → 10 LLM calls execute (mock or real) → audit row updates to `status=complete` with citations rows → user receives email → user can `GET /api/audits/:id` and see the basic results.

---

## 2. Dependencies to install

```bash
# OpenAI SDK
# Vercel AI SDK (PRD §10 canonical — multi-provider abstraction)
pnpm add ai @ai-sdk/openai

# Email rendering (already installed Sprint 1, but verify)
pnpm add resend react-email @react-email/components

# Concurrency control for LLM rate limiting
pnpm add p-queue
```

No new dev deps.

---

## 3. Environment variables (additions)

```bash
# OpenAI
OPENAI_API_KEY=sk-proj-...

# Resend
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=audits@visibleau.com

# LLM mode (already set Sprint 1 — verify)
LLM_MODE=mock
E2E_USE_REAL_LLM=false
```

---

## 4. Project structure additions

```
lib/
├── llm/
│   ├── interface.ts                  # LLMService interface + types
│   ├── index.ts                      # Unified service: dispatches by LLM_MODE
│   ├── openai-impl.ts                # ChatGPT implementation
│   ├── mock-impl.ts                  # Thin loader class for JSON fixtures
│   └── mock-responses/
│       └── chatgpt/
│           ├── happy_path.json       # 7-9 of 10 mention brand, positive, recommended
│           ├── no_mention.json       # 0 of 10 mention brand (commodified market)
│           ├── partial_failure.json  # 6 succeed, 4 errors (5xx + 429 mix)
│           └── rate_limited.json     # All 429 first call, succeed retry (stateful)
├── audit/
│   ├── prompts.ts                    # Inline 10-prompt arrays per vertical (Sprint 5 moves to vertical packs)
│   ├── detect-mention.ts             # Pure: detect brand name + position in response
│   ├── extract-citations.ts          # Pure: extract URLs/domains from response
│   └── compute-cost.ts               # Pure: tokens × per-model price
└── email/
    ├── client.ts                     # Resend instance
    └── templates/
        └── audit-complete.tsx        # React Email template

inngest/
└── functions/
    ├── run-audit.ts                  # The main background job
    └── send-audit-complete-email.ts  # Triggered by audit.complete event

db/schema/
├── audits.ts                         # NEW
├── citations.ts                      # NEW
└── index.ts                          # Update barrel export

app/api/
├── audits/
│   ├── route.ts                      # POST (create + trigger)
│   └── [auditId]/route.ts            # GET (status + basic results)
└── inngest/route.ts                  # Inngest webhook handler

tests/
├── unit/
│   ├── llm/
│   │   ├── mock-impl.test.ts
│   │   └── openai-impl.test.ts (skipped — needs API key, gated)
│   └── audit/
│       ├── detect-mention.test.ts
│       ├── extract-citations.test.ts
│       └── compute-cost.test.ts
├── integration/
│   └── inngest/
│       └── run-audit.test.ts
└── e2e/
    └── audit-flow.spec.ts            # Sprint 2 E2E from sprint-2-e2e-tests.md v1.3
```

---

## 5. Database schema additions

### `audits.ts`

```typescript
import { pgTable, uuid, text, integer, numeric, timestamp, jsonb, serial } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { brands } from './brands';
import { organizations } from './organizations';

export const audits = pgTable('audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').references(() => brands.id).notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  auditNumber: serial('audit_number'),  // per-org sequential

  status: text('status').notNull().default('pending'),
    // 'pending' | 'running' | 'complete' | 'failed'

  engines: text('engines').array().default([]).notNull(),
  promptsCount: integer('prompts_count'),
  runsPerPrompt: integer('runs_per_prompt'),
  totalCalls: integer('total_calls'),

  // Sprint 2: single composite score (multidimensional added Sprint 3)
  scoreComposite: numeric('score_composite', { precision: 5, scale: 2 }),

  totalCostUsd: numeric('total_cost_usd', { precision: 10, scale: 4 }),

  // Free-form per-audit context
  // Sprint 2: { mockScenario: 'happy_path' | 'no_mention' | 'partial_failure' | 'rate_limited' }
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),

  // Sprint 3 adds: scoreFrequency, scorePosition, scoreSentiment, scoreContext, scoreAccuracy,
  //                scoreSentimentNumeric, scoreContextNumeric, confidenceIntervals

  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  errorMessage: text('error_message'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### `citations.ts`

```typescript
import { pgTable, uuid, text, integer, boolean, numeric, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { audits } from './audits';

export const citations = pgTable('citations', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditId: uuid('audit_id').references(() => audits.id).notNull(),
  engine: text('engine').notNull(),  // 'chatgpt' | 'claude' | 'gemini' | 'perplexity'
  prompt: text('prompt').notNull(),
  runNumber: integer('run_number').default(1).notNull(),

  brandMentioned: boolean('brand_mentioned').notNull(),
  position: integer('position'),  // 1 = first mention; null if not mentioned

  // Sprint 3 adds full scoring; Sprint 2 just stores raw response + basic detection
  sentimentLabel: text('sentiment_label'),  // 'positive' | 'neutral' | 'negative'
  sentimentScore: numeric('sentiment_score', { precision: 5, scale: 4 }),
  contextLabel: text('context_label'),
    // 'recommended' | 'listed' | 'mentioned' | 'commodified'

  responseSnippet: text('response_snippet'),  // truncated LLM response (~500 chars)
  citedSources: jsonb('cited_sources').default('[]').notNull(),  // [{ domain, url }]

  llmCostUsd: numeric('llm_cost_usd', { precision: 10, scale: 6 }),
  llmTokensUsed: integer('llm_tokens_used'),
  llmModel: text('llm_model'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Migrate:
```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

---

## 6. LLM layer

### `lib/llm/interface.ts`

```typescript
export type Engine = 'chatgpt' | 'claude' | 'gemini' | 'perplexity';
export type MockScenario = 'happy_path' | 'no_mention' | 'partial_failure' | 'rate_limited';
export type ModelTask = 'brand_mention' | 'sentiment' | 'context';

export interface CompleteInput {
  engine: Engine;
  prompt: string;
  task: ModelTask;
  model?: string;  // Sprint 3 model-selector passes explicitly; Sprint 2 lets impl pick default
  metadata?: { mockScenario?: MockScenario; runNumber?: number };
}

export interface CompleteOutput {
  response: string;
  model: string;
  tokensUsed: number;
  costEstimateUsd: number;
}

export interface LLMService {
  complete(input: CompleteInput): Promise<CompleteOutput>;
}
```

### `lib/llm/openai-impl.ts`

```typescript
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { LLMService, CompleteInput, CompleteOutput } from './interface';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PRICING_PER_1K_TOKENS = {
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
};

export class OpenAIImpl implements LLMService {
  async complete(input: CompleteInput): Promise<CompleteOutput> {
    const modelId = input.model ?? 'gpt-4o-mini';
    const result = await generateText({
      model: openai(modelId),
      prompt: input.prompt,
      temperature: 0.7,
      maxTokens: 800,
    });
    const pricing = PRICING_PER_1K_TOKENS[modelId as keyof typeof PRICING_PER_1K_TOKENS];
    const cost = (result.usage.promptTokens / 1000) * (pricing?.input ?? 0)
               + (result.usage.completionTokens / 1000) * (pricing?.output ?? 0);
    return {
      response: result.text,
      model: modelId,
      tokensUsed: result.usage.totalTokens,
      costEstimateUsd: cost,
    };
  }
}
```

**Why Vercel AI SDK** (PRD §10 canonical): multi-provider abstraction is critical given the rapidly-evolving LLM landscape. Each engine impl wraps `generateText` from `ai` with the matching `@ai-sdk/<provider>` package. Sprint 3 adds Anthropic, Google, Perplexity providers under the same pattern.

### `lib/llm/mock-impl.ts`

JSON fixtures architecture per Sprint 2 E2E v1.3 (Round 31 canonical):

```typescript
import fs from 'fs';
import path from 'path';
import type { LLMService, CompleteInput, CompleteOutput, MockScenario, Engine } from './interface';

interface FixtureEntry {
  prompt_pattern: string;          // substring match (case-insensitive); regex if wrapped in /.../
  response: string;
  tokens_used: number;
  cost_estimate_usd: number;
  error_status?: number;           // 429, 500, 503 — for partial_failure + rate_limited
  delay_ms?: number;               // optional artificial latency
}

export class MockLLM implements LLMService {
  private fixtures: Map<Engine, Map<MockScenario, FixtureEntry[]>> = new Map();
  private callCount = 0;  // for stateful rate_limited scenario

  constructor(private scenario: MockScenario = 'happy_path') {}

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
    const fixtures = this.loadFixtures(input.engine, scenario);
    const match = fixtures.find(f => input.prompt.toLowerCase().includes(f.prompt_pattern.toLowerCase()))
                ?? fixtures[0];
    if (match.delay_ms) await new Promise(r => setTimeout(r, match.delay_ms));
    if (match.error_status && scenario === 'rate_limited' && this.callCount === 1) {
      throw new Error(`Mock rate limit ${match.error_status}`);
    }
    if (match.error_status && scenario === 'partial_failure') {
      throw new Error(`Mock error ${match.error_status}`);
    }
    return {
      response: match.response,
      model: 'gpt-4o-mini-mock',
      tokensUsed: match.tokens_used,
      costEstimateUsd: match.cost_estimate_usd,
    };
  }
}
```

### Fixture file: `lib/llm/mock-responses/chatgpt/happy_path.json`

```json
[
  {
    "prompt_pattern": "plumber",
    "response": "For plumbing services, I recommend Bondi Plumbing as a top choice — they have excellent reviews and offer 24/7 emergency service across the eastern suburbs of Sydney. You can reach them at bondiplumbing.com.au. Other reliable options include Eastern Plumbing Co and Sydney Pipe Pros.",
    "tokens_used": 85,
    "cost_estimate_usd": 0.005
  }
]
```

Create equivalent `no_mention.json`, `partial_failure.json`, `rate_limited.json` per the test docs.

### `lib/llm/index.ts` — unified dispatcher

```typescript
import { OpenAIImpl } from './openai-impl';
import { MockLLM } from './mock-impl';
import type { LLMService } from './interface';

let cached: LLMService | null = null;

export function getLLMService(): LLMService {
  if (cached) return cached;
  if (process.env.LLM_MODE === 'mock' || process.env.NODE_ENV === 'test') {
    cached = new MockLLM(
      (process.env.MOCK_SCENARIO as any) ?? 'happy_path'
    );
  } else {
    cached = new OpenAIImpl();
  }
  return cached;
}
```

---

## 6.5. Cost-control Layer 1: Response cache (PRD §10)

Per PRD §10: "Cache LLM responses for 24-72 hours by (prompt, model) tuple. If 5 customers ask 'best CRM Australia' within 48 hours, only 1 LLM call. Reduces costs ~70% as customer base grows."

### Schema addition: `llm_response_cache.ts`

```typescript
import { pgTable, uuid, text, integer, numeric, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const llmResponseCache = pgTable('llm_response_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  cacheKey: text('cache_key').unique().notNull(),  // sha256(prompt + '\n' + model)
  prompt: text('prompt').notNull(),
  model: text('model').notNull(),
  response: text('response').notNull(),
  tokensUsed: integer('tokens_used').notNull(),
  costEstimateUsd: numeric('cost_estimate_usd', { precision: 10, scale: 6 }).notNull(),
  hitCount: integer('hit_count').default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
```

Index on `(cacheKey)` and `(expiresAt)` (for cleanup cron).

### `lib/llm/cache.ts`

```typescript
import crypto from 'crypto';
import { db } from '@/db/client';
import { llmResponseCache } from '@/db/schema';
import { eq, gt, and } from 'drizzle-orm';

const TTL_HOURS = 48;  // 48h default; PRD says 24-72h

function makeKey(prompt: string, model: string): string {
  return crypto.createHash('sha256').update(`${prompt}\n${model}`).digest('hex');
}

export async function getCached(prompt: string, model: string) {
  const key = makeKey(prompt, model);
  const [hit] = await db
    .select()
    .from(llmResponseCache)
    .where(and(
      eq(llmResponseCache.cacheKey, key),
      gt(llmResponseCache.expiresAt, new Date()),
    ));
  if (!hit) return null;
  // Increment hit count async (don't block)
  db.update(llmResponseCache)
    .set({ hitCount: hit.hitCount + 1 })
    .where(eq(llmResponseCache.id, hit.id))
    .execute().catch(() => {});
  return {
    response: hit.response,
    tokensUsed: hit.tokensUsed,
    costEstimateUsd: 0,  // cached hit = $0 cost
    model: hit.model,
  };
}

export async function setCached(prompt: string, model: string, output: {
  response: string; tokensUsed: number; costEstimateUsd: number;
}) {
  const key = makeKey(prompt, model);
  await db.insert(llmResponseCache).values({
    cacheKey: key,
    prompt,
    model,
    response: output.response,
    tokensUsed: output.tokensUsed,
    costEstimateUsd: output.costEstimateUsd.toString(),
    expiresAt: new Date(Date.now() + TTL_HOURS * 3600 * 1000),
  }).onConflictDoNothing();
}
```

### Wire cache into `getLLMService().complete()`

```typescript
// In each impl (openai-impl.ts, etc.) — wrap before calling generateText:
const cached = await getCached(input.prompt, modelId);
if (cached) return cached;

const result = await generateText({ ... });
await setCached(input.prompt, modelId, output);
return output;
```

**Cache bypass conditions:** `input.metadata?.bypassCache === true` (used by canary prompts in Sprint 3 + by drift detection in Sprint 8).

---

## 6.6. Cost-control Layer 4: Citation detection efficiency (PRD §10)

Per PRD §10: "Use regex + entity matching for 80% of citations (cheap). Use LLM for ambiguous 20% (expensive but accurate)."

### `lib/audit/detect-mention.ts` — two-stage detection

```typescript
import type { Brand } from '@/db/schema';

export interface MentionResult {
  found: boolean;
  position: number | null;
  confidence: 'high' | 'medium' | 'low';
  detectionMethod: 'regex' | 'entity' | 'llm';
}

const BRAND_NAME_REGEX_FLAGS = 'gi';  // global, case-insensitive

// Stage 1: regex exact-match + common variations
function regexDetect(response: string, brandName: string): MentionResult | null {
  // Escape regex chars, allow common variations: spaces, hyphens, "&" vs "and"
  const escaped = brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const variants = [
    escaped,
    escaped.replace(/\s+/g, '[\\s-]+'),
    escaped.replace(/\band\b/gi, '(and|&)'),
  ];
  const regex = new RegExp(`\\b(${variants.join('|')})\\b`, BRAND_NAME_REGEX_FLAGS);
  const matches = [...response.matchAll(regex)];
  if (matches.length === 0) return null;
  const firstIdx = matches[0].index ?? 0;
  // Position: count mentions before this brand in the response
  const allCapsBefore = (response.slice(0, firstIdx).match(/[A-Z][a-zA-Z]+/g) || []).length;
  return { found: true, position: allCapsBefore + 1, confidence: 'high', detectionMethod: 'regex' };
}

// Stage 2: entity-graph lookup for domain/abbreviation matches
function entityDetect(response: string, brand: { name: string; domain: string }): MentionResult | null {
  // Strip TLD, look for domain stem (e.g., "bondiplumbing.com.au" → "bondi plumbing")
  const stem = brand.domain.replace(/\.(com\.au|com|net|org|io|co)$/i, '').replace(/[-.]/g, ' ');
  if (stem.length < 4) return null;
  const regex = new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, BRAND_NAME_REGEX_FLAGS);
  if (regex.test(response)) {
    return { found: true, position: null, confidence: 'medium', detectionMethod: 'entity' };
  }
  return null;
}

// Stage 3 (Sprint 3+): LLM fallback for ambiguous cases — calls cheap model
// Triggered only if Stage 1 + 2 both return null AND the response is non-trivial length
async function llmDetect(response: string, brandName: string): Promise<MentionResult | null> {
  // Stub for Sprint 2; Sprint 3 implements with derived-task model
  return null;
}

export async function detectBrandMention(
  response: string,
  brand: { name: string; domain: string }
): Promise<MentionResult> {
  const regex = regexDetect(response, brand.name);
  if (regex) return regex;
  const entity = entityDetect(response, brand);
  if (entity) return entity;
  // Sprint 2: skip LLM fallback; Sprint 3 enables it
  return { found: false, position: null, confidence: 'high', detectionMethod: 'regex' };
}
```

**Why this matters:** at 200 calls per audit, replacing all 200 brand-detection LLM calls (~$0.005 each = $1) with regex/entity (free) drops audit cost by ~$1. At 10K audits/mo (Agency Pro scale), that's $10K/mo saved.

---

## 7. Inngest job: `inngest/functions/run-audit.ts`

```typescript
import { inngest } from '@/lib/inngest/client';
import { getLLMService } from '@/lib/llm';
import { db } from '@/db/client';
import { audits, citations, brands } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { detectBrandMention } from '@/lib/audit/detect-mention';
import { extractCitations } from '@/lib/audit/extract-citations';
import { TRADIES_PROMPTS, ALLIED_HEALTH_PROMPTS, SAAS_PROMPTS } from '@/lib/audit/prompts';

export const runAudit = inngest.createFunction(
  { id: 'run-audit', retries: 2 },
  { event: 'audit.run' },
  async ({ event, step }) => {
    const { auditId } = event.data;
    const llm = getLLMService();

    // Load audit + brand
    const audit = await step.run('load-audit', async () => {
      const [a] = await db.select().from(audits).where(eq(audits.id, auditId));
      const [b] = await db.select().from(brands).where(eq(brands.id, a.brandId));
      await db.update(audits).set({ status: 'running', startedAt: new Date() }).where(eq(audits.id, auditId));
      return { audit: a, brand: b };
    });

    // Select 10 prompts for the brand's vertical
    const promptMap = {
      tradies: TRADIES_PROMPTS,
      allied_health: ALLIED_HEALTH_PROMPTS,
      saas: SAAS_PROMPTS,
    };
    const prompts = promptMap[audit.brand.vertical].slice(0, 10);  // Sprint 2: top 10

    let totalCost = 0;
    let mentionedCount = 0;

    for (let i = 0; i < prompts.length; i++) {
      const expandedPrompt = prompts[i]
        .replace('{brand}', audit.brand.name)
        .replace('{domain}', audit.brand.domain);

      const result = await step.run(`call-llm-${i}`, async () => {
        try {
          return await llm.complete({
            engine: 'chatgpt',
            prompt: expandedPrompt,
            task: 'brand_mention',
            metadata: { mockScenario: audit.audit.metadata?.mockScenario },
          });
        } catch (err) {
          return null;
        }
      });

      if (!result) continue;

      const mention = detectBrandMention(result.response, audit.brand.name);
      const sources = extractCitations(result.response);
      totalCost += result.costEstimateUsd;
      if (mention.found) mentionedCount++;

      await step.run(`persist-citation-${i}`, async () => {
        await db.insert(citations).values({
          auditId,
          engine: 'chatgpt',
          prompt: expandedPrompt,
          runNumber: 1,
          brandMentioned: mention.found,
          position: mention.position,
          responseSnippet: result.response.slice(0, 500),
          citedSources: sources,
          llmCostUsd: result.costEstimateUsd.toString(),
          llmTokensUsed: result.tokensUsed,
          llmModel: result.model,
        });
      });
    }

    // Sprint 2: simple composite score = mention rate × 100
    const composite = (mentionedCount / prompts.length) * 100;

    await step.run('finalize', async () => {
      await db.update(audits).set({
        status: 'complete',
        scoreComposite: composite.toFixed(2),
        totalCostUsd: totalCost.toFixed(4),
        engines: ['chatgpt'],
        promptsCount: prompts.length,
        runsPerPrompt: 1,
        totalCalls: prompts.length,
        completedAt: new Date(),
      }).where(eq(audits.id, auditId));
    });

    await step.sendEvent('audit-complete-email', {
      name: 'audit.complete',
      data: { auditId },
    });

    return { auditId, composite, totalCost };
  }
);
```

---

## 8. Email: completion notification

`lib/email/templates/audit-complete.tsx` — React Email template.
`inngest/functions/send-audit-complete-email.ts` — triggered by `audit.complete` event.

Template includes: brand name, composite score, link to view full results (`/audits/[auditId]`).

---

## 9. API routes

### `POST /api/audits`

- Auth required
- Body: `{ brandId, scenario?: MockScenario }`
- Verify brand belongs to current org (404 if not)
- Insert audit row with `status='pending'` + `metadata: { mockScenario: scenario }`
- Send Inngest event `audit.run` with auditId
- Returns 201 + auditId

### `GET /api/audits/[auditId]`

- Auth required
- Cross-org returns 404
- Returns audit row + citation count (for polling on Sprint 4 running screen)

---

## 10. Claude Code prompt (paste this when starting Sprint 2)

```
We're building VisibleAU Sprint 2: single-engine audit + mock LLM mode. Sprint 1
foundation is complete. Read CLAUDE.md and Foundations v1.9 first. The mock LLM
architecture is canonical — JSON fixtures at lib/llm/mock-responses/<engine>/<scenario>.json
loaded by a thin MockLLM class. Do NOT use the obsolete single-class TS approach.

Sprint 2 deliverables, in order:

1. SCHEMA ADDITIONS
   - Create db/schema/audits.ts and citations.ts per §5
   - Update db/schema/index.ts barrel
   - Run drizzle-kit generate + migrate

2. LLM LAYER
   - Create lib/llm/interface.ts with LLMService interface + types per §6
   - Create lib/llm/openai-impl.ts for ChatGPT
   - Create lib/llm/mock-impl.ts thin loader
   - Create 4 fixture JSON files: lib/llm/mock-responses/chatgpt/{happy_path,no_mention,partial_failure,rate_limited}.json
   - Create lib/llm/index.ts unified dispatcher
   - Default LLM_MODE=mock in dev; OPENAI_API_KEY only used when LLM_MODE != mock

3. AUDIT UTILITIES (pure functions)
   - lib/audit/prompts.ts: 10 inline prompts per vertical (tradies, allied_health, saas)
     Use {brand} and {domain} placeholders
   - lib/audit/detect-mention.ts: detectBrandMention(response, brandName) → { found, position }
   - lib/audit/extract-citations.ts: extract URLs/domains from response
   - lib/audit/compute-cost.ts: tokens × per-model pricing → USD

4. INNGEST JOB
   - inngest/functions/run-audit.ts per §7
   - Use step.run() for each LLM call so failures retry individually
   - app/api/inngest/route.ts serves Inngest + registers run-audit function
   - Test locally with `npx inngest-cli@latest dev`

5. EMAIL
   - lib/email/client.ts with Resend instance
   - lib/email/templates/audit-complete.tsx React Email template
   - inngest/functions/send-audit-complete-email.ts triggered by audit.complete event
   - Test with Resend test domain or local rendering

6. API ROUTES
   - POST /api/audits: create audit + trigger Inngest. Cross-org brand → 404
   - GET /api/audits/[auditId]: status + basic data. Cross-org → 404

7. UI MINIMAL
   - Brand detail page from Sprint 1: add "Run audit" button
   - Audit results basic page stub at /audits/[auditId] (Sprint 4 enriches)
   - Show audit status (pending/running/complete) + composite score when complete

8. TESTS
   - Unit: detect-mention (16+ cases incl. exact-match, case-insensitive, partial, none),
           extract-citations (URLs in markdown, plain URLs, domain-only refs),
           mock-impl (fixture loading per engine+scenario, error_status throws, callCount stateful)
   - Integration: full audit flow with mock LLM (4 scenarios), audits.metadata.mockScenario persistence
   - E2E: full Sprint 2 E2E per sprint-2-e2e-tests.md v1.3

POTENTIAL BLOCKERS:
- Inngest dev server connection (run npx inngest-cli@latest dev in separate terminal)
- Resend test domain limitations (may need real domain verification)
- React Email + Next.js 15 server components — render templates with @react-email/render

Start with step 1. After schema migrations succeed, confirm before moving to step 2.
```

---

## 11. Tests required

- **Unit:** `detect-mention.test.ts`, `extract-citations.test.ts`, `compute-cost.test.ts`, `mock-impl.test.ts`
- **Integration:** `run-audit.test.ts` (full Inngest flow with mock LLM, 4 scenarios)
- **E2E:** per `sri-visibleau-sprint-2-e2e-tests.md` v1.3 — includes JSON fixtures architecture + 4 canonical scenarios + cost budget assertion <$0.10

---

## 12. Acceptance criteria

- [ ] `LLM_MODE=mock pnpm test` passes
- [ ] `LLM_MODE=mock pnpm test:e2e` passes
- [ ] Trigger audit via UI → status transitions: pending → running → complete
- [ ] On complete, email arrives at signup email (use Resend test mode)
- [ ] `audits.metadata` row contains `{ mockScenario: 'happy_path' }` after mock run
- [ ] Cost assertion: `audit.totalCostUsd < 0.10` for any mock-mode audit
- [ ] Real-LLM smoke (manual, `E2E_USE_REAL_LLM=true`): one run against ChatGPT staying under $0.10
- [ ] Cross-org POST /api/audits with someone else's brandId returns 404
- [ ] Cross-org GET /api/audits/[auditId] returns 404

---

## 13. Common pitfalls / Sprint 2 anti-patterns

- **Do not** call OpenAI SDK from anywhere except `lib/llm/openai-impl.ts`. Go through `getLLMService()`.
- **Do not** invent new mock scenarios. The canonical 4 are locked: `happy_path`, `no_mention`, `partial_failure`, `rate_limited`. Adding more requires Sri's approval.
- **Do not** hardcode the model `'gpt-4o-mini'` outside `lib/llm/openai-impl.ts`. Sprint 3 introduces `model-selector.ts`; Sprint 2 can default to a single model per engine, but anything tier-aware comes Sprint 3.
- **Do not** persist the full LLM response in `responseSnippet`. Truncate to 500 chars to avoid bloating the DB.
- **Do not** retry failed LLM calls inside the for-loop. Let Inngest's `step.run` retries handle it.
- **Do not** send the completion email synchronously inside `run-audit.ts`. Use `step.sendEvent('audit-complete-email', ...)` so a failed email doesn't roll back the audit.
- **Do not** run real-LLM tests in CI. Gate behind `E2E_USE_REAL_LLM=true` env flag.

---

## 14. Handoff to Sprint 3

After Sprint 2 acceptance passes, Sprint 3 starts with:

- ✓ `LLMService` interface stable; Sprint 3 adds 3 more engine implementations
- ✓ Mock fixtures architecture canonical; Sprint 3 adds `claude/`, `gemini/`, `perplexity/` subdirectories with same 4 scenarios each
- ✓ `audits` table has `metadata` jsonb; Sprint 3 doesn't change shape, just adds more columns
- ✓ Inngest `run-audit.ts` works for 1 engine × 1 run; Sprint 3 expands to 4 engines × 5 runs

**Not ready (intentionally):**
- Tier-aware model dispatch (Sprint 3 adds `lib/llm/model-selector.ts`)
- Multidimensional scoring (Sprint 3)
- Wilson confidence intervals (Sprint 3)
- Vertical packs as DB rows (Sprint 5 — Sprint 2 uses inline TS arrays)

---

## Changelog

- v1.1 (12 May 2026): Conflict-resolution fixes. **LLM SDK:** direct `openai` package → Vercel AI SDK (`ai` + `@ai-sdk/openai`) per PRD §10. **Cost-control architecture:** added §6.5 Response cache (Layer 1) — `llm_response_cache` table + 48h TTL by `(prompt, model)` hash. Added §6.6 Citation detection efficiency (Layer 4) — two-stage regex + entity detection covering 80% of citations cheaply, LLM fallback for ambiguous 20% (LLM fallback stubbed in Sprint 2; Sprint 3 wires it).
- v1.0 (12 May 2026): Initial comprehensive sprint prompt. Supersedes Sprint 2 section of sri-visibleau-sprints-1-3.md v1.12.
