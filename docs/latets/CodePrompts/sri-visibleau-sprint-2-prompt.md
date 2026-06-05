# Sprint 2 — Single-Engine Audit + Mock LLM Mode

**Sprint:** 2 of 12
**Estimated effort:** 12-15 hours (~2 weekends at 8 hrs/week)
**Goal:** Run a one-engine (ChatGPT) audit end-to-end against a brand, persist citations, send a completion email. Add the canonical mock LLM mode for local dev + CI.
**Prerequisites:** Sprint 1 complete and accepted. Tables `organizations`, `users`, `brands` exist. Inngest client wired.
**Out of scope:** Multi-engine (Sprint 3), multidimensional scoring (Sprint 3), audit results UI (Sprint 4), vertical packs (Sprint 5). Sprint 2 uses an inline 10-prompt array.

---

## 0. Read first

1. `CLAUDE.md` — design doc (auto-loaded)
2. `sri-visibleau-foundations.md` v1.12 §3 schema additions for `audits` + `citations`
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

# Q6 fix: p-queue REMOVED from Sprint 2.
# Sprint 2 makes 10 LLM calls sequentially inside Inngest step.run() loops — no concurrency, no queue needed.
# p-queue belongs in Sprint 3 when 200 calls run in parallel and rate-limiting matters.
# Do NOT install p-queue this sprint or it will tempt parallelisation that breaks the sequential cost model.
```

No new dev deps.

---

## 3. Environment variables (additions)

```bash
# OpenAI
OPENAI_API_KEY=sk-proj-...

# Resend
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=srininbox@gmail.com
# Q5 fix: RESEND_DEV_RECIPIENT — in Sprint 2 we don't look up the user's real email yet.
# Set this to your own email for dev testing; Sprint 10 replaces with DB user email lookup.
RESEND_DEV_RECIPIENT=lakshmi.komman2001@gmail.com

# T1 fix: NEXT_PUBLIC_APP_URL used in send-audit-complete-email.ts to build the audit CTA link.
# Without this, the email button href is "undefined/audits/[id]".
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Production (set in Vercel dashboard, not committed):
# NEXT_PUBLIC_APP_URL=https://app.visibleau.com.au

# LLM mode (already set Sprint 1 — verify)
LLM_MODE=mock
E2E_USE_REAL_LLM=false
# Q5 fix: MOCK_SCENARIO — used in getLLMService() to pick which scenario MockLLM loads.
# Options: happy_path (default) | no_mention | partial_failure | rate_limited
# Override per audit via POST /api/audits { scenario: 'no_mention' } body field instead.
MOCK_SCENARIO=happy_path
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
└── webhooks/
    └── inngest/route.ts              # B fix: canonical path per CLAUDE.md §6 (was api/inngest/route.ts)

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
import { pgTable, uuid, text, integer, numeric, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { brands } from './brands';
import { organizations } from './organizations';

export const audits = pgTable('audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').references(() => brands.id).notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  // C fix: NOT serial() — serial is a DB global auto-increment that ignores org boundaries.
  // auditNumber is per-org sequential (Audit #1 in org A ≠ Audit #1 in org B).
  // Generated atomically at insert via lib/audit/numbering.ts (see Foundations v1.12 §3).
  auditNumber: integer('audit_number').notNull(),

  status: text('status').notNull().default('pending'),
    // 'pending' | 'running' | 'complete' | 'failed'

  // D fix: triggeredBy is required — Foundations v1.12 canonical. Sprint 2 always sets 'manual'.
  // Sprint 9 (scheduled audits) sets 'scheduled'; Sprint 8 (drift webhook) sets 'webhook'.
  triggeredBy: text('triggered_by').notNull().default('manual'),
    // 'manual' | 'scheduled' | 'webhook'

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
}, (table) => ({
  // C fix: per-org audit number must be unique (UI assumption: "Audit #143" is unambiguous within an org)
  uniqueOrgAuditNumber: uniqueIndex('audits_org_audit_number_idx').on(table.organizationId, table.auditNumber),
  // Query performance: tenant-filtered "recent audits" feed
  orgCompletedIdx: index('audits_org_completed_idx').on(table.organizationId, table.completedAt),
}));
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

  responseSnippet: text('response_snippet'),  // truncated LLM response (~500 chars) — CLAUDE.md §5 canonical
  // P1 fix: Foundations v1.12 also has contextSnippets — surrounding excerpts where brand was mentioned.
  // Sprint 3 sentiment analysis reads these. Sprint 2 populates an empty array; Sprint 3 fills it.
  contextSnippets: jsonb('context_snippets').default('[]').notNull(),
  citedSources: jsonb('cited_sources').default('[]').notNull(),  // [{ domain, url }]

  llmCostUsd: numeric('llm_cost_usd', { precision: 10, scale: 6 }),
  llmTokensUsed: integer('llm_tokens_used'),
  llmModel: text('llm_model'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### `db/schema/llm-response-cache.ts` — cross-reference (W1+W5 fix)

This file is **also a §5 schema file** but its full `pgTable` definition appears in §6.5 (where its columns are specified alongside the cache logic). Create it **before** running `drizzle-kit generate` or the build will fail with a missing export.

Summary of columns so you can create it without scrolling: `id uuid PK`, `cacheKey text unique notNull`, `prompt text notNull`, `model text notNull`, `response text notNull`, `tokensUsed integer notNull`, `costEstimateUsd numeric(10,6) notNull`, `hitCount integer default(1) notNull`, `createdAt timestamptz defaultNow()`, `expiresAt timestamptz notNull`.

See §6.5 for the complete `pgTable(...)` Drizzle definition.

Migrate:
```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

### Row Level Security — extend Sprint 1 migration (P2 fix)

PRD §10: "Row-level security on all tenant-scoped tables." Sprint 1 added policies for `organizations`, `users`, `brands`. Sprint 2 creates `audits` and `citations` — both carry `organizationId` and need policies. Create a new Supabase migration (`supabase migration new sprint2_rls`):

```sql
-- P2 fix: extend RLS to Sprint 2 tables
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_response_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see only their org's audits"
  ON audits FOR SELECT
  USING (organization_id::text = current_setting('app.current_org_id', true));

CREATE POLICY "Users mutate only their org's audits"
  ON audits FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));

-- Citations are scoped via their parent audit's organizationId
CREATE POLICY "Users see only their org's citations"
  ON citations FOR SELECT
  USING (
    audit_id IN (
      SELECT id FROM audits
      WHERE organization_id::text = current_setting('app.current_org_id', true)
    )
  );

-- LLM response cache is shared across orgs (it's keyed by prompt+model, not org)
-- No RLS policy = service-role-only access. App routes never read cache directly; LLMService does.
-- Inngest jobs use service_role key which bypasses RLS.
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
  metadata?: {
    mockScenario?: MockScenario;
    runNumber?: number;
    // T2 fix: bypassCache used in openai-impl.ts but was missing from this type.
    // TypeScript error: "Property 'bypassCache' does not exist on type '{ mockScenario?… }'"
    // Used by canary prompts (Sprint 3) and drift detection (Sprint 8) to skip the 48h cache.
    bypassCache?: boolean;
  };
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
import { getCached, setCached } from './cache';       // R2 fix: cache was specified but never wired in
import { computeCostUsd } from '@/lib/audit/compute-cost';  // R3 fix: pricing table lives here; openai-impl had duplicate inline calc

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class OpenAIImpl implements LLMService {
  async complete(input: CompleteInput): Promise<CompleteOutput> {
    const modelId = input.model ?? 'gpt-4o-mini';

    // R2 fix: check cache before calling OpenAI. PRD §10: cache by (prompt, model) 48h TTL.
    // Bypass when input.metadata?.bypassCache === true (canary prompts, drift detection Sprint 8).
    if (!input.metadata?.bypassCache) {
      const hit = await getCached(input.prompt, modelId);
      // T7 fix: return hit directly — getCached() already returns a CompleteOutput-shaped object
      // { response, model, tokensUsed, costEstimateUsd: 0 }. Previous code did { ...hit, costEstimateUsd: 0 }
      // which spreads all DB row fields (id, cacheKey, expiresAt, hitCount…) into the return value.
      if (hit) return hit;
    }

    const result = await generateText({
      model: openai(modelId),
      prompt: input.prompt,
      temperature: 0.7,
      maxTokens: 800,
    });

    // R3 fix: use computeCostUsd() — single pricing table, not duplicated here and in compute-cost.ts
    const cost = computeCostUsd(
      modelId,
      result.usage.promptTokens,      // Vercel AI SDK v4 field names
      result.usage.completionTokens,
    );

    const output: CompleteOutput = {
      response: result.text,
      model: modelId,
      tokensUsed: result.usage.totalTokens,
      costEstimateUsd: cost,
    };

    // R2 fix: store in cache for subsequent identical prompts
    if (!input.metadata?.bypassCache) {
      await setCached(input.prompt, modelId, output).catch(() => {});  // fire-and-forget, don't block
    }

    return output;
  }
}
```

**Why Vercel AI SDK** (PRD §10 canonical): multi-provider abstraction is critical given the rapidly-evolving LLM landscape. Each engine impl wraps `generateText` from `ai` with the matching `@ai-sdk/<provider>` package. Sprint 3 adds Anthropic, Google, Perplexity providers under the same pattern.

### `lib/audit/extract-citations.ts` (P4 fix — content was never specified)

```typescript
export interface CitedSource {
  domain: string;
  url: string;
}

// Extracts URLs from three common LLM output formats:
// 1. Markdown: [text](https://example.com)
// 2. Plain URL: https://example.com
// 3. Domain-only reference: example.com.au (with TLD hint)
export function extractCitations(response: string): CitedSource[] {
  const seen = new Set<string>();
  const sources: CitedSource[] = [];

  // Format 1: markdown links
  const markdownLinks = [...response.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi)];
  for (const m of markdownLinks) {
    const url = m[2];
    const domain = new URL(url).hostname.replace(/^www\./, '');
    if (!seen.has(domain)) { seen.add(domain); sources.push({ domain, url }); }
  }

  // Format 2: bare https URLs not already captured
  const bareUrls = [...response.matchAll(/https?:\/\/[^\s,)>'"]+/gi)];
  for (const m of bareUrls) {
    const url = m[0].replace(/[.,;)]+$/, '');
    try {
      const domain = new URL(url).hostname.replace(/^www\./, '');
      if (!seen.has(domain)) { seen.add(domain); sources.push({ domain, url }); }
    } catch { /* malformed URL */ }
  }

  // Format 3: domain-only refs (e.g. "bondiplumbing.com.au")
  const domainRefs = [...response.matchAll(/\b([a-z0-9]([a-z0-9-]*[a-z0-9])?\.(?:com\.au|com|net|org|io|co\.nz))\b/gi)];
  for (const m of domainRefs) {
    const domain = m[1].toLowerCase();
    if (!seen.has(domain)) { seen.add(domain); sources.push({ domain, url: `https://${domain}` }); }
  }

  return sources;
}
```

### `lib/audit/compute-cost.ts` (P5 fix — content was never specified)

```typescript
// Pricing per 1K tokens — Sprint 3 update (AC1 fix: Sprint 3 models were all missing;
// computeCostUsd returned 0 for claude-3-5-haiku-20241022, claude-3-5-sonnet-20241022,
// gemini-1.5-pro, sonar, sonar-pro — silently under-counting every Sprint 3 audit cost).
// Note: 'claude-3-5-haiku' (Sprint 2 key) replaced by 'claude-3-5-haiku-20241022' (full name).
// Prices as of May 2026; verify against provider docs at build time.
const PRICING_PER_1K: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o-mini':                  { input: 0.00015,  output: 0.0006   },
  'gpt-4o':                       { input: 0.0025,   output: 0.01     },
  // Anthropic — full model names with date suffixes (Sprint 3 selectModel canonical strings)
  'claude-3-5-haiku-20241022':    { input: 0.00025,  output: 0.00125  },
  'claude-3-5-sonnet-20241022':   { input: 0.003,    output: 0.015    },
  // Google Gemini
  'gemini-1.5-flash':             { input: 0.000075, output: 0.0003   },
  'gemini-1.5-pro':               { input: 0.00125,  output: 0.005    },
  // Perplexity — pricing approximate (per 1K tokens); verify at build time
  'sonar':                        { input: 0.001,    output: 0.001    },
  'sonar-pro':                    { input: 0.003,    output: 0.015    },
};

export function computeCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = PRICING_PER_1K[model];
  if (!pricing) return 0;  // unknown model — log warning, return 0 rather than crash
  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}
```

### `lib/email/client.ts` (P6 fix — content was never specified)

```typescript
import { Resend } from 'resend';

// Singleton Resend client — import in send-audit-complete-email.ts and any future email function.
// Never import in client components. RESEND_API_KEY is server-only.
export const resend = new Resend(process.env.RESEND_API_KEY!);
```

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
    // R1 fix: partial_failure must throw for ~40% of calls (4 of 10), not ALL calls.
    // Previous logic: `if (match.error_status && scenario === 'partial_failure') throw ...`
    // — this threw for every call because both fixture entries have prompt_pattern:"" (match all),
    //   so the first fixture (with error_status) always matched every prompt.
    // Fix: only throw when callCount mod 5 < 2 (calls 1,2 of each 5 = 40% failure rate).
    if (match.error_status && scenario === 'partial_failure' && this.callCount % 5 < 2) {
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

### Fixture: `no_mention.json` (Q2 fix — never specified)

```json
[
  {
    "prompt_pattern": "",
    "response": "For plumbing services in Sydney, some well-known companies include Eastern Plumbing Co, Sydney Pipe Pros, and Rapid Rooter. When choosing a plumber, look for NCAT registration, public liability insurance, and online reviews on Google or hipages.com.au.",
    "tokens_used": 72,
    "cost_estimate_usd": 0.004
  }
]
```

`prompt_pattern: ""` matches every prompt (fallback — MockLLM finds no match → uses `fixtures[0]`). Response mentions zero brand names so `detectBrandMention` returns `found: false` for all 10 calls.

### Fixture: `partial_failure.json` (Q2 fix — never specified)

```json
[
  {
    "prompt_pattern": "plumber",
    "response": "Bondi Plumbing is highly regarded for emergency plumbing in Sydney's eastern suburbs.",
    "tokens_used": 45,
    "cost_estimate_usd": 0.003,
    "error_status": 500
  },
  {
    "prompt_pattern": "",
    "response": "For plumbing services I recommend checking hipages.com.au for local, verified tradies.",
    "tokens_used": 38,
    "cost_estimate_usd": 0.002,
    "error_status": 429
  }
]
```

6 of 10 calls succeed (MockLLM: `partial_failure` throws on every call — update mock-impl.ts to throw only on ~40% of calls by checking `this.callCount % 10 < 4`). Tests verify `audits.totalCostUsd` is less than full-run cost and citation rows exist for succeeded calls only.

### Fixture: `rate_limited.json` (Q2 fix — never specified)

```json
[
  {
    "prompt_pattern": "",
    "response": "",
    "tokens_used": 0,
    "cost_estimate_usd": 0,
    "error_status": 429,
    "delay_ms": 100
  },
  {
    "prompt_pattern": "",
    "response": "Bondi Plumbing offers reliable 24/7 emergency plumbing across the Sydney eastern suburbs and CBD.",
    "tokens_used": 52,
    "cost_estimate_usd": 0.003
  }
]
```

First fixture entry (index 0) has `error_status: 429` — `MockLLM` throws on `callCount === 1` (first call). Inngest's `step.run` retry fires the same step again; `callCount` is now 2, which hits index 1 (success). All remaining prompts succeed directly. Tests verify `audits.status = 'complete'` despite the initial 429.

### `lib/llm/index.ts` — unified dispatcher

```typescript
import { OpenAIImpl } from './openai-impl';
import { MockLLM } from './mock-impl';
import type { LLMService } from './interface';

let cachedOpenAI: LLMService | null = null;  // S7 fix: renamed from 'cached' — only applies to OpenAIImpl path

export function getLLMService(): LLMService {
  // H fix: do NOT use a module-level singleton for MockLLM.
  // MockLLM has stateful callCount for the rate_limited scenario.
  // A cached singleton means callCount accumulates across audits in the same Lambda instance,
  // making rate_limited non-deterministic. Instantiate fresh per call in mock mode.
  // Real implementations (OpenAIImpl) are stateless and can be cached safely.
  if (process.env.LLM_MODE === 'mock' || process.env.NODE_ENV === 'test') {
    return new MockLLM(
      (process.env.MOCK_SCENARIO as MockScenario | undefined) ?? 'happy_path'
    );
  }
  // OpenAI is stateless — safe to cache across invocations in the same Lambda instance
  if (!cachedOpenAI) cachedOpenAI = new OpenAIImpl();
  return cachedOpenAI;
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
import { eq, gt, and, sql } from 'drizzle-orm';  // U1 fix: sql needed for onConflictDoUpdate hitCount increment

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
  }).onConflictDoUpdate({
    // S6 fix: onConflictDoNothing left expired entries unreplaced — if the same key exists
    // but is expired, a new insert would silently do nothing, leaving the expired row in place.
    // (Next getCached() would filter it out, so not a correctness bug, but wastes a write.)
    // onConflictDoUpdate refreshes the TTL and response for exact-duplicate prompts.
    target: llmResponseCache.cacheKey,
    set: {
      response: output.response,
      tokensUsed: output.tokensUsed,
      costEstimateUsd: output.costEstimateUsd.toString(),
      expiresAt: new Date(Date.now() + TTL_HOURS * 3600 * 1000),
      hitCount: sql`${llmResponseCache.hitCount} + 1`,
    },
  });
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
  // U2 fix: added 'none' — detectionMethod means HOW the brand was found.
  // When brand is NOT found, 'regex' is semantically wrong (implies regex detected it).
  // 'none' correctly means: no detection stage found a match.
  detectionMethod: 'regex' | 'entity' | 'llm' | 'none';
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
  // T6 fix: Position approximation — counts capitalised-word groups before the first match
  // as a proxy for "how many named entities appear before this brand."
  // This is an intentional approximation for Sprint 2; Sprint 3 replaces with a
  // sentence-position counter (1st sentence the brand appears in, among all sentences).
  // Values should be read as relative ("mentioned early/late") not absolute rank.
  const capitalGroupsBefore = (response.slice(0, firstIdx).match(/[A-Z][a-zA-Z]+/g) ?? []).length;
  return { found: true, position: capitalGroupsBefore + 1, confidence: 'high', detectionMethod: 'regex' };
}

// Stage 2: entity-graph lookup for domain/abbreviation matches
function entityDetect(response: string, brand: { name: string; domain: string }): MentionResult | null {
  // Strip TLD, look for domain stem (e.g., "bondiplumbing.com.au" → "bondi plumbing")
  const stem = brand.domain.replace(/\.(com\.au|com|net|org|io|co)$/i, '').replace(/[-.]/g, ' ');
  if (stem.length < 4) return null;
  const regex = new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, BRAND_NAME_REGEX_FLAGS);
  const match = regex.exec(response);
  if (match) {
    // T3 fix: entity detect computed position: same approximation as regexDetect.
    // Previously always returned position: null even on a found hit, meaning all
    // domain-stem matches would have position=null in citations.position — unusable for ranking.
    const capitalGroupsBefore = (response.slice(0, match.index ?? 0).match(/[A-Z][a-zA-Z]+/g) ?? []).length;
    return { found: true, position: capitalGroupsBefore + 1, confidence: 'medium', detectionMethod: 'entity' };
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
  // U2 fix: detectionMethod is 'none' when brand is NOT found — 'regex' was wrong
  // (it implied regex found something, but nothing was found by any stage)
  return { found: false, position: null, confidence: 'high', detectionMethod: 'none' };
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

    // G fix: wrap entire job in try/catch so failures set status='failed' per CLAUDE.md §7.
    // Without this, a throw leaves audit.status='running' forever.
    try {

    // Load audit + brand (E: renamed variable to 'loaded' to avoid confusing audit.audit.xxx access)
    const loaded = await step.run('load-audit', async () => {
      const [a] = await db.select().from(audits).where(eq(audits.id, auditId));
      const [b] = await db.select().from(brands).where(eq(brands.id, a.brandId));
      await db.update(audits).set({ status: 'running', startedAt: new Date() }).where(eq(audits.id, auditId));
      return { audit: a, brand: b };
    });

    // V2 fix: type promptMap as Record<Vertical, string[]> so TypeScript accepts loaded.brand.vertical as key
    const promptMap: Record<string, string[]> = {
      tradies: TRADIES_PROMPTS,
      allied_health: ALLIED_HEALTH_PROMPTS,
      saas: SAAS_PROMPTS,
    };
    // V6 fix: guard for unknown vertical (e.g. new enum value added before Sprint 5 DB-backed packs)
    const verticalPrompts = promptMap[loaded.brand.vertical];
    if (!verticalPrompts) {
      console.warn(`[run-audit] Unknown vertical '${loaded.brand.vertical}' — falling back to tradies prompts`);
    }
    const prompts = (verticalPrompts ?? TRADIES_PROMPTS).slice(0, 10);  // Sprint 2: top 10

    let totalCost = 0;
    let mentionedCount = 0;

    for (let i = 0; i < prompts.length; i++) {
      const expandedPrompt = prompts[i]
        .replace('{brand}', loaded.brand.name)
        .replace('{domain}', loaded.brand.domain);

      const result = await step.run(`call-llm-${i}`, async () => {
        try {
          return await llm.complete({
            engine: 'chatgpt',
            prompt: expandedPrompt,
            task: 'brand_mention',
            metadata: {
              mockScenario: (loaded.audit.metadata as { mockScenario?: MockScenario } | null)?.mockScenario,
            },
          });
        } catch (err) {
          return null;
        }
      });

      if (!result) continue;

      // V1 fix: detectBrandMention + extractCitations are async and were called OUTSIDE the persist step.
      // Inngest anti-pattern: async work that feeds a step.run should be INSIDE that step so Inngest
      // can serialise its inputs — if the outer function changes between retries the result diverges.
      // Moved both calls inside persist-citation-${i} so all computation is within the step boundary.
      const stepResult = await step.run(`persist-citation-${i}`, async () => {
        const mention = await detectBrandMention(result.response, loaded.brand);
        const sources = extractCitations(result.response);

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

        return { found: mention.found };
      });

      totalCost += result.costEstimateUsd;
      if (stepResult.found) mentionedCount++;

    // W2 fix: composite was computed outside the finalize step and passed in by closure.
    // Inngest anti-pattern: values from outer scope used inside step.run are not serialised
    // by Inngest — if the step is replayed after a function code change, the outer composite
    // would be re-computed (OK here since stepResult.found is memoised) but the pattern is
    // fragile. Moved composite + all DB columns into the step body so the step is self-contained.
    await step.run('finalize', async () => {
      const composite = (mentionedCount / prompts.length) * 100;
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
      return { composite };
    });

    await step.sendEvent('audit-complete-email', {
      name: 'audit.complete',
      data: { auditId },
    });

    return { auditId, totalCost };  // W2 fix: composite now scoped inside finalize step

    } catch (err) {
      // G fix: CLAUDE.md §7 — "Audit job errors persist to audits.metadata.error and set status='failed'"
      await db.update(audits).set({
        status: 'failed',
        failedAt: new Date(),
        metadata: { error: err instanceof Error ? err.message : String(err) },
      }).where(eq(audits.id, auditId)).catch(() => {});
      throw err;  // re-throw so Inngest records the failure and retries if retries > 0
    }
  }
);
```

---

## 8. Email: completion notification

### `lib/email/templates/audit-complete.tsx` (Q4 fix — content was never specified)

```tsx
import {
  Body, Button, Container, Head, Heading, Html,
  Preview, Section, Text, Hr,
} from '@react-email/components';
import * as React from 'react';

interface AuditCompleteEmailProps {
  brandName: string;
  auditNumber: number;
  compositeScore: number | null;
  auditResultsUrl: string;
  promptCount: number;
  engine: string;
}

export function AuditCompleteEmail({
  brandName,
  auditNumber,
  compositeScore,
  auditResultsUrl,
  promptCount,
  engine,
}: AuditCompleteEmailProps) {
  const scoreText = compositeScore !== null
    ? `${compositeScore.toFixed(1)}/100`
    : 'Calculating…';

  return (
    <Html>
      <Head />
      <Preview>Your VisibleAU audit for {brandName} is complete — score: {scoreText}</Preview>
      <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#f9fafb', padding: '24px 0' }}>
        <Container style={{ maxWidth: 560, margin: '0 auto', backgroundColor: '#fff', borderRadius: 8, padding: 32 }}>
          <Heading style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>
            Audit complete: {brandName}
          </Heading>
          <Text style={{ color: '#6b7280', marginTop: 4 }}>
            Audit #{auditNumber} · {promptCount} prompts · {engine}
          </Text>
          <Hr style={{ borderColor: '#e5e7eb', margin: '24px 0' }} />
          <Section>
            <Text style={{ fontSize: 14, color: '#374151' }}>
              <strong>AI Visibility Score:</strong>{' '}
              <span style={{ fontSize: 32, fontWeight: 700, color: '#2563eb' }}>{scoreText}</span>
            </Text>
            <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
              Sprint 2 score = mention rate × 100. Sprint 3 adds multidimensional scoring with confidence intervals.
            </Text>
          </Section>
          <Hr style={{ borderColor: '#e5e7eb', margin: '24px 0' }} />
          <Button
            href={auditResultsUrl}
            style={{
              backgroundColor: '#2563eb', color: '#fff',
              borderRadius: 6, padding: '12px 24px',
              fontSize: 14, fontWeight: 600, textDecoration: 'none',
            }}
          >
            View full audit results →
          </Button>
          <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 32 }}>
            VisibleAU · Built in Sydney · <a href="https://visibleau.com.au" style={{ color: '#9ca3af' }}>visibleau.com.au</a>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

### `inngest/functions/send-audit-complete-email.ts` (Q3 fix — content was never specified)

```typescript
import { inngest } from '@/lib/inngest/client';
import { resend } from '@/lib/email/client';
import { render } from '@react-email/render';
import { AuditCompleteEmail } from '@/lib/email/templates/audit-complete';
import { db } from '@/db/client';
import { audits, brands } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const sendAuditCompleteEmail = inngest.createFunction(
  { id: 'send-audit-complete-email', retries: 3 },
  { event: 'audit.complete' },
  async ({ event, step }) => {
    const { auditId } = event.data;

    const emailData = await step.run('load-audit-for-email', async () => {
      const [audit] = await db.select().from(audits).where(eq(audits.id, auditId));
      const [brand] = await db.select().from(brands).where(eq(brands.id, audit.brandId));
      // Fetch user email from organizations → users join
      // For Sprint 2, use the RESEND_FROM_EMAIL as a test; Sprint 10 adds real user email lookup
      return {
        auditNumber: audit.auditNumber,
        brandName: brand.name,
        compositeScore: audit.scoreComposite ? parseFloat(audit.scoreComposite) : null,
        promptCount: audit.promptsCount ?? 10,
        engine: (audit.engines ?? ['chatgpt'])[0],
      };
    });

    await step.run('send-email', async () => {
      const auditResultsUrl = `${process.env.NEXT_PUBLIC_APP_URL}/audits/${auditId}`;
      // Y2 fix: render() expects a React element (<Component ... />), not a plain function call.
      // AuditCompleteEmail({...}) returns JSX but bypasses React's element creation;
      // React Email's render() needs the element object, not the raw JSX return value.
      const html = await render(
        <AuditCompleteEmail {...emailData} auditResultsUrl={auditResultsUrl} />
      );

      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL!,
        to: process.env.RESEND_DEV_RECIPIENT ?? process.env.RESEND_FROM_EMAIL!,
        // Sprint 10 replaces this with the user's actual email from the DB
        subject: `Audit complete: ${emailData.brandName} — Score ${emailData.compositeScore?.toFixed(1) ?? '…'}/100`,
        html,
      });
    });
  }
);
```

Add `RESEND_DEV_RECIPIENT` to `.env.local` for Sprint 2 dev testing (see §3 additions).

---

## 9. API routes

### `POST /api/audits`

- Auth required; call `getCurrentUser()` + `setRlsContext(db, currentUser.organizationId)` (P8 fix — mandatory per Sprint 1 pattern)
- Body: `{ brandId, scenario?: MockScenario }`
- Verify brand belongs to current org (404 if not)
- Generate `auditNumber` atomically using `lib/audit/numbering.ts` (P3 fix):

  ```typescript
  // lib/audit/numbering.ts — content from Foundations v1.12 §3:
  import { db } from '@/db/client';
  import { audits } from '@/db/schema';
  import { eq, sql } from 'drizzle-orm';
  import type { PgTransaction } from 'drizzle-orm/pg-core';
  import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';

  // Y3 fix: tx inside db.transaction() is a PgTransaction, not typeof db.
  // typeof db is the DrizzleORM instance; the transaction callback receives a narrower type.
  // Using PgTransaction<PostgresJsQueryResultHKT, any> matches postgres-js's Drizzle adapter.
  // A simpler pattern: use Parameters<> to extract the type from db.transaction's callback.
  type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

  export async function getNextAuditNumber(orgId: string, tx: DbTransaction): Promise<number> {
    const [row] = await tx
      .select({ max: sql<number>`COALESCE(MAX(audit_number), 0)::int` })
      .from(audits)
      .where(eq(audits.organizationId, orgId))
      .for('update');   // SELECT … FOR UPDATE prevents race conditions on concurrent creates
    return row.max + 1;
  }
  ```

  `POST /api/audits` wraps insert in a DB transaction:
  ```typescript
  const { auditId, auditNumber } = await db.transaction(async (tx) => {
    const num = await getNextAuditNumber(currentUser.organizationId, tx);
    const [inserted] = await tx.insert(audits).values({
      brandId,
      organizationId: currentUser.organizationId,
      auditNumber: num,
      triggeredBy: 'manual',
      status: 'pending',
      metadata: { mockScenario: scenario ?? null },
    }).returning({ id: audits.id, auditNumber: audits.auditNumber });
    return { auditId: inserted.id, auditNumber: inserted.auditNumber };
  });
  ```

- Send Inngest event `audit.run` with `{ auditId }`
- Returns `201 + { auditId, auditNumber }` — auditNumber needed so UI can show "Audit #N" immediately

### `GET /api/audits/[auditId]`

- Auth required; call `getCurrentUser()` + `setRlsContext(db, currentUser.organizationId)` (P8 fix)
- Cross-org returns 404 (check `audit.organizationId === currentUser.organizationId`)
- Response shape (P7 fix — previously "audit row + citation count" with no JSON spec):

  ```typescript
  // 200 response:
  {
    audit: {
      id: string,
      auditNumber: number,
      status: 'pending' | 'running' | 'complete' | 'failed',
      scoreComposite: string | null,
      totalCostUsd: string | null,
      promptsCount: number | null,
      engines: string[],
      startedAt: string | null,
      completedAt: string | null,
      metadata: Record<string, unknown>,
    },
    citationCount: number,   // count of citations rows — used by Sprint 4 polling to show progress
  }
  ```

  Sprint 4 polls this every 5s while `status === 'running'`, reading `citationCount` for the live progress bar. Sprints 2–3 return citations = []; Sprint 4 extends this with optional `citations` array.

---

## 10. Claude Code prompt (paste this when starting Sprint 2)

```
We're building VisibleAU Sprint 2: single-engine audit + mock LLM mode. Sprint 1
foundation is complete. Read CLAUDE.md and Foundations v1.12 first. The mock LLM
architecture is canonical — JSON fixtures at lib/llm/mock-responses/<engine>/<scenario>.json
loaded by a thin MockLLM class. Do NOT use the obsolete single-class TS approach.

Sprint 2 deliverables, in order:

1. SCHEMA ADDITIONS
   - Create db/schema/audits.ts and citations.ts per §5
   - Create db/schema/llm-response-cache.ts per §6.5
   - Update db/schema/index.ts barrel (S1 fix — what to add was never specified):

     ```typescript
     // Add to db/schema/index.ts — append to Sprint 1 exports:
     export * from './audits';
     export * from './citations';
     export * from './llm-response-cache';  // note: file named llm-response-cache.ts

     // New inferred types for Sprint 2
     import { audits } from './audits';
     import { citations } from './citations';
     import { llmResponseCache } from './llm-response-cache';
     import type { InferSelectModel } from 'drizzle-orm';

     export type Audit        = InferSelectModel<typeof audits>;
     export type Citation     = InferSelectModel<typeof citations>;
     export type LlmCacheRow  = InferSelectModel<typeof llmResponseCache>;
     ```

   **Create `next.config.ts`** (Y1+Y5 fix — never specified; required for JSON fixture bundling in Vercel serverless):

   ```typescript
   import type { NextConfig } from 'next';

   const nextConfig: NextConfig = {
     experimental: {
       // Y1 fix: MockLLM uses fs.readFileSync to load JSON fixture files at runtime.
       // Vercel bundles only statically-imported files. Without this config, the fixture
       // JSON files are absent in Lambda and every mock audit crashes with ENOENT.
       // This tells Vercel to trace and bundle the entire mock-responses directory.
       outputFileTracingIncludes: {
         '**/*': ['./lib/llm/mock-responses/**/*.json'],
       },
     },
   };

   export default nextConfig;
   ```

   > **Note:** `process.cwd()` resolves to the project root in `next dev`, Vitest (run from project root), and CI. The `outputFileTracingIncludes` config is only needed for Vercel/Lambda production deployments where files are bundled from a temp directory.

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
     Use {brand} and {domain} placeholders. **Content below (Q1 fix — never specified; run-audit.ts imports crash without this):**

     ```typescript
     // lib/audit/prompts.ts
     // AU-specific buyer-intent prompts per PRD §8.2 Module 2.
     // {brand} → brand name; {domain} → domain (e.g. bondiplumbing.com.au)
     // Sprint 2 uses top 10 of each; Sprint 5 moves to DB-backed vertical packs (100+ each).
     // Mix: generic buyer-intent, suburb-specific, comparison, price, entity-check.

     export const TRADIES_PROMPTS: string[] = [
       // Generic buyer-intent (LLM mentions local providers — {brand} may or may not appear)
       'Who are the best plumbers in Sydney for emergency repairs?',
       'What are the top-rated electricians in the eastern suburbs of Sydney?',
       'Best licensed builders in New South Wales for residential renovations?',
       // Suburb-specific (AU local intent)
       'Can you recommend a reliable plumber near Bondi Beach in Sydney?',
       'Who are the most trusted HVAC technicians in Melbourne CBD?',
       // Brand-aware (explicitly asks about {brand})
       'Is {brand} a reputable tradesperson in Australia? What do customers say?',
       'Can you tell me about {domain} — are they a good choice for plumbing in Sydney?',
       // Price / how-much
       'How much does emergency plumbing cost in Sydney, and who offers fair pricing?',
       // Comparison
       'What are the best alternatives to big plumbing franchises for local Sydney tradies?',
       // Authority / trust
       'Which plumbing companies in Sydney are licensed, insured, and have the best reviews?',
     ];

     export const ALLIED_HEALTH_PROMPTS: string[] = [
       'Who are the best physiotherapists in Sydney for sports injuries?',
       'Top-rated psychologists in Melbourne accepting new patients?',
       'Recommended dietitians in Brisbane who specialise in gut health?',
       'Best physiotherapy clinic near Surry Hills or the Sydney CBD?',
       'Who are the most trusted chiropractors in Sydney for back pain?',
       'Is {brand} a good allied health provider in Australia? What are they known for?',
       'Tell me about {domain} — would you recommend them for physiotherapy in Sydney?',
       'How much does a private physiotherapy session cost in Sydney?',
       'Best occupational therapists in Sydney registered with AHPRA?',
       'Which Sydney psychology practices offer bulk-billing or Medicare rebates?',
     ];

     export const SAAS_PROMPTS: string[] = [
       'What are the best project management tools for Australian small businesses?',
       'Top CRM software that integrates with Xero for Australian companies?',
       'Best invoicing and accounting software for Australian freelancers?',
       'What B2B SaaS tools are popular among Australian startups?',
       'Recommended HR software for small Australian businesses?',
       'Is {brand} a good software tool for Australian businesses? What do users say?',
       'Tell me about {domain} — is it a reputable SaaS product used in Australia?',
       'What are the best alternatives to Salesforce for Australian SMBs?',
       'Which project management tools are best suited for Australian time zones and teams?',
       'What SaaS tools do Australian agencies use for client reporting?',
     ];
     ```
   - lib/audit/detect-mention.ts: detectBrandMention(response, brandName) → { found, position }
   - lib/audit/extract-citations.ts: extract URLs/domains from response
   - lib/audit/compute-cost.ts: tokens × per-model pricing → USD

4. INNGEST JOB
   - inngest/functions/run-audit.ts per §7
   - Use step.run() for each LLM call so failures retry individually
   - app/api/webhooks/inngest/route.ts serves Inngest + registers run-audit function (B fix: canonical path per CLAUDE.md §6; was app/api/inngest/route.ts)
   - Register BOTH functions: `runAudit` AND `sendAuditCompleteEmail` in the serve() call (Q3 fix: email function never registered)
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

### `tests/unit/audit/detect-mention.test.ts` (R7 fix — cases described but never shown)

```typescript
import { detectBrandMention } from '@/lib/audit/detect-mention';

describe('detectBrandMention', () => {
  const brand = { name: 'Bondi Plumbing', domain: 'bondiplumbing.com.au' };

  it('exact match returns found=true, position=1', async () => {
    const r = await detectBrandMention('Bondi Plumbing is the best choice.', brand);
    expect(r.found).toBe(true);
    expect(r.detectionMethod).toBe('regex');
  });
  it('case-insensitive match', async () => {
    const r = await detectBrandMention('BONDI PLUMBING is highly rated.', brand);
    expect(r.found).toBe(true);
  });
  it('hyphenated variant: Bondi-Plumbing', async () => {
    const r = await detectBrandMention('Bondi-Plumbing offers great service.', brand);
    expect(r.found).toBe(true);
  });
  it('& vs and variant: Smith & Jones matches "Smith and Jones"', async () => {
    const b2 = { name: 'Smith and Jones Plumbing', domain: 'smithjones.com.au' };
    const r = await detectBrandMention('Smith & Jones Plumbing are recommended.', b2);
    expect(r.found).toBe(true);
  });
  it('not mentioned → found=false', async () => {
    const r = await detectBrandMention('Eastern Plumbing Co is the best.', brand);
    expect(r.found).toBe(false);
    // U6 fix: detectionMethod is 'none' when nothing found — not 'regex' (U2 fix)
    expect(r.detectionMethod).toBe('none');
  });
  it('domain stem fallback: bondiplumbing matches via entity detection', async () => {
    const r = await detectBrandMention('Check bondiplumbing.com.au for quotes.', brand);
    expect(r.found).toBe(true);
    expect(r.detectionMethod).toBe('entity');
  });
  it('empty response → found=false', async () => {
    const r = await detectBrandMention('', brand);
    expect(r.found).toBe(false);
  });
  it('partial name substring does not match (word boundary enforced)', async () => {
    // 'Bondi' alone should NOT match 'Bondi Plumbing' brand
    const r = await detectBrandMention('Bondi Beach is beautiful.', brand);
    expect(r.found).toBe(false);
  });
});
```

### `tests/unit/audit/extract-citations.test.ts`

```typescript
import { extractCitations } from '@/lib/audit/extract-citations';

describe('extractCitations', () => {
  it('extracts markdown link URLs', () => {
    const r = extractCitations('See [Bondi Plumbing](https://bondiplumbing.com.au) for details.');
    expect(r).toContainEqual(expect.objectContaining({ domain: 'bondiplumbing.com.au' }));
  });
  it('extracts bare https URLs', () => {
    const r = extractCitations('Visit https://bondiplumbing.com.au for a quote.');
    expect(r).toContainEqual(expect.objectContaining({ domain: 'bondiplumbing.com.au' }));
  });
  it('extracts domain-only .com.au references', () => {
    const r = extractCitations('You can also try bondiplumbing.com.au directly.');
    expect(r).toContainEqual(expect.objectContaining({ domain: 'bondiplumbing.com.au' }));
  });
  it('deduplicates same domain across formats', () => {
    const r = extractCitations('[Link](https://bondiplumbing.com.au) and bondiplumbing.com.au');
    expect(r.filter(s => s.domain === 'bondiplumbing.com.au')).toHaveLength(1);
  });
  it('empty response → empty array', () => {
    expect(extractCitations('')).toEqual([]);
  });
});
```

### `tests/unit/audit/compute-cost.test.ts`

```typescript
import { computeCostUsd } from '@/lib/audit/compute-cost';

describe('computeCostUsd', () => {
  it('gpt-4o-mini: 1000 input + 1000 output tokens', () => {
    const cost = computeCostUsd('gpt-4o-mini', 1000, 1000);
    expect(cost).toBeCloseTo(0.00015 + 0.0006, 6);
  });
  it('unknown model returns 0 without throwing', () => {
    expect(computeCostUsd('unknown-model', 1000, 1000)).toBe(0);
  });
  it('zero tokens = zero cost', () => {
    expect(computeCostUsd('gpt-4o-mini', 0, 0)).toBe(0);
  });
});
```

### `tests/integration/inngest/run-audit.test.ts` (R7 fix — assertions never shown)

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db/client';
import { audits, citations, brands, organizations } from '@/db/schema';
import { mockClerkAuth } from '../helpers/clerk-mock';

// Mock the LLM service to use mock mode
vi.mock('@/lib/llm', () => ({
  getLLMService: () => new (require('@/lib/llm/mock-impl').MockLLM)('happy_path'),
}));

describe('run-audit Inngest job', () => {
  beforeEach(() => mockClerkAuth());

  it('happy_path: status=complete, citationCount=10, totalCostUsd<0.10', async () => {
    // Seed org + brand
    const [org] = await db.insert(organizations).values({ /* ... */ }).returning();
    const [brand] = await db.insert(brands).values({ organizationId: org.id, vertical: 'tradies', /* ... */ }).returning();
    const [audit] = await db.insert(audits).values({
      organizationId: org.id, brandId: brand.id,
      auditNumber: 1, triggeredBy: 'manual', status: 'pending',
      metadata: { mockScenario: 'happy_path' },
    }).returning();

    // Run the job directly (without Inngest infra in tests)
    await runAuditHandler({ auditId: audit.id });

    const [updated] = await db.select().from(audits).where(eq(audits.id, audit.id));
    expect(updated.status).toBe('complete');
    expect(parseFloat(updated.totalCostUsd!)).toBeLessThan(0.10);
    expect(updated.scoreComposite).not.toBeNull();

    const cits = await db.select().from(citations).where(eq(citations.auditId, audit.id));
    expect(cits.length).toBe(10);
    expect(cits.some(c => c.brandMentioned)).toBe(true);
  });

  it('no_mention: status=complete, all citations brandMentioned=false, scoreComposite=0', async () => {
    // ... seed + run with scenario='no_mention'
    // expect(parseFloat(updated.scoreComposite!)).toBe(0);
    // expect(cits.every(c => !c.brandMentioned)).toBe(true);
  });

  it('partial_failure: status=complete with partial citations (6 of 10)', async () => {
    // ~4 calls throw, 6 succeed; audit still completes (thrown calls → null → continue)
    // expect(cits.length).toBeGreaterThanOrEqual(5);
    // expect(cits.length).toBeLessThan(10);
    // expect(updated.status).toBe('complete');  // partial failure doesn't fail the whole audit
  });

  it('rate_limited: Inngest retries first call, then status=complete', async () => {
    // rate_limited fixture throws on callCount===1, succeeds on retry
    // Requires Inngest step.run retry behaviour — test with a stub or check final state
    // expect(updated.status).toBe('complete');
  });
});
```

---

## 12. Acceptance criteria

- [ ] `LLM_MODE=mock pnpm test` passes
- [ ] `LLM_MODE=mock pnpm test:e2e` passes
- [ ] Trigger audit via UI → status transitions: pending → running → complete
- [ ] On complete, email arrives at `RESEND_DEV_RECIPIENT` address (S2 fix: Sprint 2 sends to the dev recipient, not the user's signup email — Sprint 10 adds real user email lookup via DB)
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
- **(S4a) Do not** use `serial()` for `auditNumber`. `serial` is a DB-global auto-increment — Org A gets audit #1, Org B gets audit #2, breaking "Audit #N" per-org display. Use `integer().notNull()` with `getNextAuditNumber()` (SELECT MAX … FOR UPDATE in a transaction) per Foundations v1.12 §3.
- **(S4b) Do not** skip `setRlsContext(db, currentUser.organizationId)` in `POST /api/audits` or `GET /api/audits/[auditId]`. Without it, the RLS policies on `audits` and `citations` tables never fire — the DB security backstop is bypassed even though RLS is enabled.
- **(S4c) Do not** install `p-queue` in Sprint 2. Sprint 2 makes 10 sequential calls inside Inngest `step.run` — no concurrency, no queue needed. Installing it will tempt you to parallelise calls, breaking the sequential cost model. Add it in Sprint 3 when 200 concurrent calls make rate-limiting necessary.
- **(S4d) Do not** cache `MockLLM` as a module-level singleton. `MockLLM` holds stateful `callCount` for the `rate_limited` scenario. A singleton accumulates `callCount` across audits in the same Lambda instance, making `rate_limited` non-deterministic after the first audit. Instantiate fresh per call in mock mode; only cache `OpenAIImpl` (stateless).

---

## 14. Handoff to Sprint 3

After Sprint 2 acceptance passes, Sprint 3 starts with:

- ✓ `LLMService` interface stable; Sprint 3 adds 3 more engine implementations
- ✓ Mock fixtures architecture canonical; Sprint 3 adds `claude/`, `gemini/`, `perplexity/` subdirectories with same 4 scenarios each
- ✓ `audits` table has `metadata` jsonb; Sprint 3 doesn't change shape, just adds more columns
- ✓ Inngest `run-audit.ts` works for 1 engine × 10 prompts × 1 run (10 calls); Sprint 3 expands to 4 engines × 10 prompts × 5 runs (200 calls)

**Not ready (intentionally):**
- Tier-aware model dispatch (Sprint 3 adds `lib/llm/model-selector.ts`)
- Multidimensional scoring (Sprint 3)
- Wilson confidence intervals (Sprint 3)
- Vertical packs as DB rows (Sprint 5 — Sprint 2 uses inline TS arrays)

---

## Changelog

- v1.11 (16 May 2026): **Tenth-pass audit — serverless fixture bundling, React Email JSX, transaction type, AuditRunning progress data (Y1-Y5).** **(Y1+Y5)** `next.config.ts` content now specified — MockLLM uses `fs.readFileSync` at runtime to load JSON fixture files; Vercel serverless bundles only statically-imported files, so JSON files read dynamically would be absent in Lambda causing ENOENT on every mock audit. `outputFileTracingIncludes: { '**/*': ['./lib/llm/mock-responses/**/*.json'] }` ensures Vercel traces and bundles the fixture directory. **(Y2)** `send-audit-complete-email.ts`: `render(AuditCompleteEmail({...}))` changed to `render(<AuditCompleteEmail {...} />)` — React Email's `render()` expects a React element (JSX), not a plain function call return value. **(Y3)** `lib/audit/numbering.ts`: `tx: typeof db` changed to `tx: DbTransaction` where `type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]` — inside `db.transaction()`, `tx` is a `PgTransaction` type, not `typeof db`; using `typeof db` as the parameter type is technically incorrect and would cause TypeScript errors in strict mode. **(Y4)** Prototype `AuditRunning`: step 3 label "Querying 4 engines × 5 runs (87/200 LLM calls)" and cost card "US$0.72 of ~US$2 budget (200 calls)" were Sprint 3 data; corrected to Sprint 2 scope: "ChatGPT × 10 prompts × 1 run (7/10 LLM calls)" and "US$0.04 of ~US$0.10 budget (10 calls)". The R4 fix (pass 4) added a scope comment to the subtitle but the step label and cost card fixture data were missed.
- v1.10 (16 May 2026): **Twenty-second-pass audit — schema discoverability, finalize step replay safety, BrandSetupWizard cost accuracy (W1-W5).** **(W1+W5)** §5 schema: added `llm-response-cache.ts` cross-reference section immediately before the `Migrate:` block — the file was told to "Create per §6.5" in §10 step 1, but a developer reading §5 sequentially would create `audits.ts` and `citations.ts` then run `drizzle-kit generate` without `llm-response-cache.ts`, causing a build failure when `lib/llm/cache.ts` imports it. The cross-reference includes a column summary so the file can be created without scrolling to §6.5. **(W2)** `run-audit.ts` `finalize` step: moved `composite = (mentionedCount / prompts.length) * 100` computation from outer scope into the `step.run('finalize')` body — same Inngest closure anti-pattern as V1 (previous pass). Outer scope values captured by step closures are not serialised by Inngest; all computation feeding a step should live inside it. `finalize` now returns `{ composite }` and the outer `return` drops the `composite` field since it's now step-scoped. **(W3)** Prototype `BrandSetupWizard` step 4: "First audit cost ~A$2.50-3" fixed — A$2.50-3 is the paid tier (200 calls); Free tier (Sprint 3+) is ~A$0.30-0.50 (40 calls); Sprint 2 dev build is <A$0.15 (10 calls). Both tiers now shown. **(W4)** Prototype `BrandSetupWizard` step 4 info note: "Free = 2 engines × 100 calls" fixed to "Free: 2 engines × 20 prompts × 1 run = 40 calls" — PRD §7 canonical. **(W6 — confirmed correct)** `SelfServeSetup` step 3 "2 engines, 10 prompts" is accurate for the Free tier experience SelfServeSetup describes (Sprint 10 onboarding); no fix needed.
- v1.9 (16 May 2026): **Twenty-first-pass audit — Inngest replay safety, type safety, Free tier call count (V1-V6).** **(V1)** `run-audit.ts`: moved `detectBrandMention()` and `extractCitations()` calls from the outer loop scope into the `persist-citation-${i}` `step.run` body — Inngest anti-pattern: async work that feeds a step should be inside that step so Inngest serialises its result; async functions called outside the step boundary can produce different values on replay if the function changes between retries. `found` result is returned from the step and used to increment `mentionedCount`. **(V2)** `run-audit.ts`: `promptMap` now typed as `Record<string, string[]>` so TypeScript accepts `loaded.brand.vertical` (a `Vertical` pgEnum type) as an index — previously TypeScript would error "Type 'Vertical' cannot be used as an index type." **(V3)** Prototype `SampleAudit`: "2 engines × 100 calls" → "2 engines × 20 prompts × 1 run = 40 calls" — PRD §7 canonical Free tier is 20 prompts × 1 run = 40 calls/audit, not 100. **(V4)** Prototype `Methodology`: same fix — "Free tier: 100 calls × 2 engines" → "40 calls (2 engines × 20 prompts × 1 run)". **(V5)** Prototype `AuditResultsBasic`: "View rich version →" link disabled — it navigated to `audit-results-rich` which is Sprint 3+ only; Sprint 2 builds ship `AuditResultsBasic` only. **(V6)** `run-audit.ts`: added null-guard for unknown vertical — `promptMap[loaded.brand.vertical]` crashes with `TypeError: Cannot read properties of undefined (reading 'slice')` if a new vertical is added to the enum before Sprint 5's DB-backed packs. Falls back to `TRADIES_PROMPTS` with a console.warn.
- v1.8 (16 May 2026): **Twentieth-pass audit — import completeness, semantic correctness, navigation targets (U1-U6).** **(U1)** `lib/llm/cache.ts`: added `sql` to drizzle-orm imports — `onConflictDoUpdate` (S6 fix) uses `` sql`${llmResponseCache.hitCount} + 1` `` but `sql` was not in `{ eq, gt, and }` import, causing a TypeScript compile error. **(U2)** `lib/audit/detect-mention.ts` `MentionResult.detectionMethod`: added `'none'` to the union and changed the not-found return from `detectionMethod: 'regex'` to `detectionMethod: 'none'` — `'regex'` on a not-found result implies regex detected something, which is semantically wrong; `'none'` correctly means no detection stage found a match. **(U3)** Prototype `Dashboard` recent audit feed: `onNav('audit-results-rich')` → `onNav('audit-results-basic')` — Sprint 2 audits produce `AuditResultsBasic`; routing to the Sprint 3+ rich results screen was wrong. **(U4)** Prototype `AuditList` table rows: same fix — `onNav('audit-results-rich')` → `onNav('audit-results-basic')`. **(U5)** Prototype `Dashboard` comment: added Sprint 2 scope note — Sprint 2 produces real audit data, so the dashboard is not empty after Sprint 2; KPI cards require multi-audit aggregation (Sprint 4), but a basic feed entry should appear after the first Sprint 2 audit. **(U6)** §11 `detect-mention.test.ts`: updated not-found test assertion from `toBe('regex')` to `toBe('none')` — stale assertion that would fail after U2 fix.
- v1.7 (16 May 2026): **Nineteenth-pass audit — env completeness, interface types, position calculation, cache return shape (T1-T7).** **(T1)** §3 env: added `NEXT_PUBLIC_APP_URL=http://localhost:3000` — used in `send-audit-complete-email.ts` to build the audit CTA link; without it the email button href renders as `undefined/audits/[id]`. **(T2)** `lib/llm/interface.ts` `CompleteInput.metadata`: added `bypassCache?: boolean` — `openai-impl.ts` reads `input.metadata?.bypassCache` but the type didn't include it, causing a TypeScript compile error. **(T3)** `detect-mention.ts` `entityDetect()`: changed `position: null` to compute the same capitalised-word-group approximation as `regexDetect()` — entity hits always returned `null` position, making all domain-stem matches useless for ranking in `citations.position`. **(T4)** Prototype `AuditList` fixture data — see prototype changelog. **(T5)** Prototype `AuditList` Export CSV button — see prototype changelog. **(T6)** `detect-mention.ts` `regexDetect()` position comment: clarified the capitalised-word-count approximation is intentional for Sprint 2, with a Sprint 3 TODO for sentence-position counter. **(T7)** `openai-impl.ts` cache hit return: `return { ...hit, costEstimateUsd: 0 }` → `return hit` — spreading the full DB row into `CompleteOutput` added unexpected fields (`id`, `cacheKey`, `expiresAt`, `hitCount`); `getCached()` already returns the correctly-shaped object with `costEstimateUsd: 0`.
- v1.6 (15 May 2026): **Eighteenth-pass audit — data integrity, acceptance accuracy, anti-pattern completeness (S1-S7).** **(S1)** §10 step 1: `db/schema/index.ts` update content now specified — adds `export * from './audits'`, `'./citations'`, `'./llm-response-cache'` plus `Audit`, `Citation`, `LlmCacheRow` inferred types; without this `lib/llm/cache.ts` (`llmResponseCache` import) and `run-audit.ts` break at build. **(S2)** §12 acceptance: "email arrives at signup email" corrected to "arrives at `RESEND_DEV_RECIPIENT`" — Sprint 2 sends to the dev recipient env var, not the user's real email (Sprint 10 adds user lookup). **(S3)** §14 handoff: "1 engine × 1 run" corrected to "1 engine × 10 prompts × 1 run (10 calls)" — the missing "10 prompts" made Sprint 3's expansion description ambiguous. **(S4)** §13 anti-patterns: four new entries added — (a) serial() for auditNumber breaks per-org uniqueness; (b) skipping setRlsContext() bypasses RLS on audit routes; (c) p-queue must not be installed Sprint 2 (Sprint 3); (d) MockLLM must not be cached as singleton (stateful callCount). **(S5)** Prototype: AuditResultsRich Re-run + Export buttons — see prototype changelog. **(S6)** `lib/llm/cache.ts` `setCached()`: `onConflictDoNothing` → `onConflictDoUpdate` — expired-key entries now refresh TTL and response on upsert rather than silently doing nothing. **(S7)** `lib/llm/index.ts`: renamed `let cached` → `let cachedOpenAI` — the variable only applies to the OpenAIImpl path after the H fix; generic name was misleading.
- v1.5 (15 May 2026): **Seventeenth-pass audit — runtime type safety, cache integration, scenario logic, test detail (R1-R7).** **(R1)** `mock-impl.ts` `partial_failure` throw condition fixed: previous code threw for ALL calls with `error_status` (fixture `prompt_pattern:""` always matched → first fixture with error always used → 10/10 calls threw). Fixed to `callCount % 5 < 2` so ~40% of calls throw (4 of 10), matching the "6 succeed, 4 errors" spec. **(R2)** `openai-impl.ts` now calls `getCached()` before `generateText` and `setCached()` after — cache was fully specified in §6.5 but the actual impl never imported or called it. **(R3)** `openai-impl.ts` now calls `computeCostUsd()` instead of an inline pricing calculation — `compute-cost.ts` was specified and tested but never actually used, leaving duplicate pricing tables. **(R4)** Prototype `AuditRunning` — see prototype changelog. **(R5)** Prototype `BrandDetail` — see prototype changelog. **(R6)** `run-audit.ts`: `loaded.audit.metadata?.mockScenario` now has explicit cast `(loaded.audit.metadata as { mockScenario?: MockScenario } | null)?.mockScenario` — Drizzle types jsonb as `unknown`, direct property access fails TypeScript compilation. **(R7)** §11 tests: replaced high-level descriptions with actual test bodies — `detect-mention.test.ts` (8 cases: exact match, case-insensitive, hyphenated, & vs and, not found, domain stem entity, empty response, partial name word-boundary), `extract-citations.test.ts` (5 cases), `compute-cost.test.ts` (3 cases), `run-audit.test.ts` integration (4 scenario skeletons with explicit assertions).
- v1.4 (15 May 2026): **Sixteenth-pass audit — content completeness (Q1-Q6).** **(Q1)** `lib/audit/prompts.ts` content now specified — 10 AU-specific buyer-intent prompts per vertical (Tradies, Allied Health, SaaS) with `{brand}` and `{domain}` placeholders per PRD §8.2. Mix: generic buyer-intent, suburb-specific, brand-aware, price, comparison. Imported by run-audit.ts — without this file the audit job crashes at import. **(Q2)** Three missing mock fixture files now specified: `no_mention.json` (fallback empty `prompt_pattern`, response mentions no brand), `partial_failure.json` (error_status 429/500 triggers throw for ~40% of calls), `rate_limited.json` (first fixture throws 429, second succeeds — tests Inngest retry path). **(Q3)** `inngest/functions/send-audit-complete-email.ts` content now specified — Inngest function listening on `audit.complete` event, loads audit+brand from DB, renders React Email template via `@react-email/render`, sends via Resend. Also wired into Inngest `serve()` call in webhooks/inngest/route.ts. **(Q4)** `lib/email/templates/audit-complete.tsx` content now specified — full React Email JSX with brand name, audit number, composite score, CTA button linking to `/audits/[auditId]`. **(Q5)** `MOCK_SCENARIO` and `RESEND_DEV_RECIPIENT` env vars added to §3 — MOCK_SCENARIO was used in getLLMService() but never documented; RESEND_DEV_RECIPIENT is the Sprint 2 dev testing recipient until Sprint 10 adds real user email lookup. **(Q6)** `p-queue` removed from §2 deps — Sprint 2 makes 10 sequential calls; no concurrency or queue needed. p-queue belongs in Sprint 3 (200 parallel calls). Installing it in Sprint 2 misleads Claude Code into adding unnecessary parallelisation.
- v1.3 (15 May 2026): **Fifteenth-pass audit — API contracts, RLS, missing library specs (P1-P9).** **(P1)** §5 citations schema: added `contextSnippets jsonb default([])` column — Foundations v1.12 has this; Sprint 3 sentiment reads surrounding excerpts, not just the truncated full response. **(P2)** §5: added RLS policies for `audits` and `citations` tables via new Supabase migration — PRD §10 "all tenant-scoped tables" requires this; Sprint 2 created both tables without policies, leaving the RLS security backstop bypassed. **(P3)** §9 `POST /api/audits`: added `lib/audit/numbering.ts` content (Foundations v1.12 `getNextAuditNumber()` with `SELECT … FOR UPDATE` transaction) and wired into route — `auditNumber` was referenced in schema comment but never implemented. **(P4)** Added `lib/audit/extract-citations.ts` full implementation — 3-format URL extraction (markdown links, bare URLs, domain-only refs); was listed in project structure and imported by run-audit.ts but never specified. **(P5)** Added `lib/audit/compute-cost.ts` full implementation — model-name → per-1K pricing lookup; same structure as openai-impl.ts pricing. **(P6)** Added `lib/email/client.ts` full implementation — `new Resend(RESEND_API_KEY)` singleton. **(P7)** §9 `GET /api/audits/[auditId]`: response JSON shape now specified — `{ audit: AuditRow, citationCount: number }`; Sprint 4 polls this every 5s and reads `citationCount` for progress bar. **(P8)** §9: both routes now include `getCurrentUser()` + `setRlsContext()` call — mandatory per Sprint 1 pattern; without it RLS policies on audits/citations are never triggered. **(P9)** Prototype: see prototype changelog.
- v1.2 (15 May 2026): **Fourteenth-pass audit — schema, job logic, type safety (A-H).** **(A)** §0 + §10: Foundations version bumped v1.9 → v1.12. **(B)** §4 + §10: Inngest path corrected `app/api/inngest/route.ts` → `app/api/webhooks/inngest/route.ts` per CLAUDE.md §6. **(C)** §5 audits schema: `auditNumber` changed from `serial()` (DB-global auto-increment) to `integer().notNull()` with per-org unique index — `serial` ignores org boundaries, breaking the "Audit #143" UI assumption. Atomic generation now delegated to `lib/audit/numbering.ts` per Foundations v1.12. **(D)** §5 audits schema: added missing `triggeredBy text notNull default('manual')` column — Foundations v1.12 canonical; Sprint 9 scheduled audits set `'scheduled'`. **(E)** §7 `run-audit.ts`: renamed `audit` variable to `loaded` to eliminate confusing `audit.audit.xxx` double-nesting. **(F)** §7 `run-audit.ts`: `detectBrandMention(result.response, audit.brand.name)` → `detectBrandMention(result.response, loaded.brand)` — §6.6 signature expects `brand: { name, domain }` object, not string. **(G)** §7 `run-audit.ts`: added top-level `try/catch` that sets `status='failed'` + `metadata.error` on throw — CLAUDE.md §7 canonical; without it a thrown exception leaves audit stuck in `status='running'`. **(H)** §6 `getLLMService()`: removed singleton caching for MockLLM — `MockLLM.callCount` is stateful for the `rate_limited` scenario; caching across audits in the same Lambda instance makes rate_limited non-deterministic. Real implementations remain cached.
- v1.1 (12 May 2026): Conflict-resolution fixes. LLM SDK, cost-control architecture, citation detection efficiency.
- v1.0 (12 May 2026): Initial comprehensive sprint prompt.
