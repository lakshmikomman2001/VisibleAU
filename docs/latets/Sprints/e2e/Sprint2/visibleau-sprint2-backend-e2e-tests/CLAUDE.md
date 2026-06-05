# VisibleAU Sprint 2 — Backend E2E Tests

## What these tests cover

Sprint 2 ships the single-engine audit flow: **POST /api/audits** triggers an Inngest job that makes 10 LLM calls (mock or real), persists citation rows, computes a composite score, and fires a completion email.

These backend E2E tests verify:

| File | What it tests |
|---|---|
| `01-audit-create.test.ts` | POST /api/audits — 201 shape, auditNumber per-org, cross-org 404, brand-not-in-org 404 |
| `02-audit-status.test.ts` | GET /api/audits/[auditId] — response shape, citationCount, cross-org 404 |
| `03-audit-flow-mock.test.ts` | Full happy_path mock scenario — status=complete, 10 citations, cost<$0.10 |
| `04-audit-scenarios.test.ts` | no_mention (score=0), partial_failure (6 citations), rate_limited (complete after retry) |
| `05-audit-numbering.test.ts` | auditNumber is per-org sequential; concurrent inserts don't collide |
| `06-rls-isolation.test.ts` | Org 1 audits/citations invisible to Org 2 via API — 404 not 401 |
| `07-llm-cache.test.ts` | Same prompt+model → second call reads from llm_response_cache, cost=$0 |
| `08-citations-schema.test.ts` | citations rows have correct fields: engine, prompt, brandMentioned, position, citedSources |
| `09-detect-mention.test.ts` | detectBrandMention pure function — 8 canonical cases from Sprint 2 §11 |
| `10-extract-citations.test.ts` | extractCitations pure function — markdown, bare URL, domain-only, dedup |
| `11-compute-cost.test.ts` | computeCostUsd — gpt-4o-mini pricing, unknown model=0, zero tokens |
| `12-acceptance.test.ts` | Sprint 2 §12 acceptance criteria checklist |

## How to run

### Prerequisites

```bash
# 1. Sprint 1 complete — organizations, users, brands tables exist with RLS
# 2. Sprint 2 migrations applied:
#    pnpm drizzle-kit generate && pnpm drizzle-kit migrate
#    — creates audits, citations, llm_response_cache tables
# 3. App running in mock LLM mode:
#    LLM_MODE=mock pnpm dev
# 4. Inngest dev server running in a separate terminal:
#    npx inngest-cli@latest dev
# 5. .env.test.local populated (see below)
```

### Run all Sprint 2 backend E2E tests

```bash
pnpm test:e2e:backend:sprint2
# or directly:
LLM_MODE=mock npx vitest run --config vitest.config.e2e.ts \
  --project backend-e2e \
  tests/e2e/backend/sprint2/
```

### Run a single file

```bash
npx vitest run tests/e2e/backend/sprint2/03-audit-flow-mock.test.ts \
  --config vitest.config.e2e.ts
```

## .env.test.local required variables

```bash
# App
E2E_APP_URL=http://localhost:3000

# Database (test project — separate from production)
DATABASE_URL=postgresql://postgres.[ref]:[pass]@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.[ref]:[pass]@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres

# Clerk test-mode keys
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# Test User 1 — Org 1 (agency tier)
E2E_TEST_USER_1_EMAIL=e2e-user-1@visibleau.test
E2E_TEST_USER_1_PASSWORD=Test1234!
E2E_TEST_USER_1_CLERK_ID=user_...
E2E_TEST_ORG_1_CLERK_ID=org_...
E2E_TEST_USER_1_SESSION_ID=sess_...   # Clerk Dashboard → Users → User 1 → Sessions

# Test User 2 — Org 2 (different org — for isolation tests)
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
```

## Test data strategy

- Every test file uses `beforeEach` to truncate `audits`, `citations`, and `llm_response_cache` for the test org(s)
- `afterAll` hard-deletes all seeded brands + audits for the test org(s)
- Organizations and users are seeded idempotently (upsert) — preserved across runs
- The `testDb` client uses the service-role DATABASE_URL which bypasses RLS for seeding/teardown
- **All HTTP calls go through the running app** (real auth, real middleware, real RLS enforcement)

## Inngest test strategy

Sprint 2 Inngest jobs (`run-audit`, `send-audit-complete-email`) run via the Inngest dev server.  
The E2E tests trigger the audit via `POST /api/audits`, then poll `GET /api/audits/[auditId]` until `status='complete'` or timeout.

For unit/integration tests of the Inngest job logic directly, see `tests/integration/inngest/run-audit.test.ts`.

## Anti-patterns to avoid

- **Never** set `E2E_USE_REAL_LLM=true` in CI — it calls the real OpenAI API and costs money
- **Never** use `LLM_MODE=` unset or `LLM_MODE=openai` for E2E tests without `E2E_USE_REAL_LLM=true` guard
- **Never** hardcode a brand domain that resolves to a real website — use `.test` TLD
- **Never** skip the Inngest dev server when testing the full audit flow — the job won't run
