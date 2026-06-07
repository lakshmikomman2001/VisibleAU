# VisibleAU Sprint 3 — Backend E2E Tests

## What these tests cover

Sprint 3 expands the audit engine to 4 engines × 5 runs per prompt (up to 200 LLM calls),
adds 5-dimension scoring (frequency, position, sentiment, context, accuracy), Wilson 95% CI
intervals, the tier-aware model selector, tier-engine allowlist (Free=2, paid=4), canary
prompt infrastructure, and two new API routes.

| File | What it tests |
|---|---|
| `01-schema-additions.test.ts` | Sprint 3 DB columns exist with correct types (text vs numeric) |
| `02-tier-engines.test.ts` | enginesForTier(): Free=2 engines, paid=4 (AC3b) |
| `03-model-selector.test.ts` | selectModel() 72-combination matrix |
| `04-audit-create-multiengine.test.ts` | POST /api/audits creates pending audit, paid tier engines recorded |
| `05-audit-flow-paid.test.ts` | Full paid-tier mock: 200 calls, 5 dimensions, CI bands, composite |
| `06-audit-flow-free.test.ts` | Full free-tier mock: 100 calls, 2 engines only (ChatGPT+Perplexity) |
| `07-dimension-scoring.test.ts` | Each dimension score correct from DB; commodified=25 not 0 |
| `08-wilson-ci.test.ts` | confidenceIntervals jsonb shape + AC3c: CI bounds bracket composite |
| `09-api-full-route.test.ts` | GET /api/audits/[auditId]/full — response shape + RLS isolation |
| `10-api-metrics-route.test.ts` | GET /api/brands/[brandId]/metrics — trend data + RLS isolation |
| `11-canary-schema.test.ts` | canary_prompts table schema, engine stored as text not enum |
| `12-acceptance.test.ts` | Sprint 3 §12 acceptance criteria checklist |

## Prerequisites

```bash
# 1. Sprint 2 complete. All Sprint 2 migrations applied.
# 2. Sprint 3 schema migrations applied:
#    pnpm drizzle-kit generate && pnpm drizzle-kit migrate
#    New columns on audits: score_frequency, score_position, score_sentiment (TEXT),
#    score_sentiment_numeric, score_context (TEXT), score_context_numeric, score_accuracy,
#    score_confidence_low, score_confidence_high, confidence_intervals, engine_count, prompt_count
#    New table: canary_prompts
# 3. Inngest dev server running for full-flow tests:
#    npx inngest-cli@latest dev
# 4. App running: LLM_MODE=mock pnpm dev
# 5. .env.test.local populated — see below

# 6. Install simple-statistics (Sprint 3 dependency):
#    pnpm add simple-statistics
```

## .env.test.local required variables

```bash
# App
E2E_APP_URL=http://localhost:3000

# Database (test project)
DATABASE_URL=postgresql://postgres.[ref]:[pass]@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.[ref]:[pass]@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres

# Clerk test-mode keys
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

# Test User 1 — Org 1 (paid/agency tier for multi-engine tests)
E2E_TEST_USER_1_EMAIL=e2e-user-1@visibleau.test
E2E_TEST_USER_1_PASSWORD=Test1234!
E2E_TEST_USER_1_CLERK_ID=user_...
E2E_TEST_ORG_1_CLERK_ID=org_...
E2E_TEST_USER_1_SESSION_ID=sess_...

# Test User 2 — Org 2 (free tier for Free-tier engine tests)
E2E_TEST_USER_2_EMAIL=e2e-user-2@visibleau.test
E2E_TEST_USER_2_PASSWORD=Test1234!
E2E_TEST_USER_2_CLERK_ID=user_...
E2E_TEST_ORG_2_CLERK_ID=org_...
E2E_TEST_USER_2_SESSION_ID=sess_...

# LLM — always mock for E2E tests
LLM_MODE=mock
MOCK_SCENARIO=happy_path
E2E_USE_REAL_LLM=false

# Inngest (dev server)
INNGEST_EVENT_KEY=local
INNGEST_SIGNING_KEY=local

# Sprint 3 new keys (can be dummy values in mock mode)
ANTHROPIC_API_KEY=sk-ant-dummy
GOOGLE_AI_API_KEY=dummy
PERPLEXITY_API_KEY=pplx-dummy
```

## How to run

```bash
# All Sprint 3 backend E2E tests
LLM_MODE=mock npx vitest run --config vitest.config.e2e.ts \
  tests/e2e/backend/sprint3/

# Single file
npx vitest run tests/e2e/backend/sprint3/05-audit-flow-paid.test.ts \
  --config vitest.config.e2e.ts
```

## Package.json script

```json
{
  "test:e2e:backend:sprint3": "LLM_MODE=mock npx vitest run --config vitest.config.e2e.ts tests/e2e/backend/sprint3/"
}
```

## Test data strategy

- **Organisations + users**: seeded idempotently — preserved across runs
- **Brands**: seeded in beforeAll, hard-deleted in afterAll
- **Audits, citations, canary_prompts**: created by tests, hard-deleted in afterAll
- All test brands use domain `*.e2e.test`
- `afterAll` guards: `if (org1Id)` before every teardown (M10/N2 pattern)

## Critical Sprint 3 spec points to remember

### scoreSentiment and scoreContext are TEXT columns (AC3a)
Not numeric. They contain label strings: `'positive'|'neutral'|'negative'` and
`'recommended'|'listed'|'mentioned'|'commodified'`. Their numeric companions are
`scoreSentimentNumeric` and `scoreContextNumeric` (numeric).

### commodified context score = 25, NOT 0 (Round 29 fix)
`CONTEXT_SCORE_MAP = { recommended:100, listed:50, mentioned:25, commodified:25 }`
Any test asserting commodified=0 is a regression.

### Free tier = 2 engines only (ChatGPT + Perplexity) (AC3b)
`enginesForTier('free') === ['chatgpt', 'perplexity']`
Free audit: 2 × 10 × 5 = 100 calls. Paid audit: 4 × 10 × 5 = 200 calls.

### AC3c: CI bounds bracket the composite score
`scoreConfidenceLow ≤ scoreComposite ≤ scoreConfidenceHigh`

### totalCostUsd budget
Mock mode: cost = 0 (mock fixtures return 0.00x). Real LLM: < $4.00 (includes derived tasks).
Accept test uses mock — checks cost < 0.10 is meaningful for mock, < 4.00 for real LLM.

### Inngest requirement
Tests 05 and 06 (full flow) require the Inngest dev server on port 8288.
Tests 01-04, 07-12 do NOT require Inngest (DB-seeded audits or pure function tests).

## Anti-patterns (Sprint 3 §13)

- Never hardcode 4 engines — use `enginesForTier(tier)`
- Never set `commodified = 0` — it's 25
- Never retry rate-limited calls inside `step.run` — Inngest handles retries
- Never call `new MockLLM(scenario)` with only one arg — Sprint 3 requires `new MockLLM(engine, scenario)`
- Never parallelize within a single engine — only across engines (rate limits)
- Never assert scoreSentiment or scoreContext as numeric columns — they are TEXT
