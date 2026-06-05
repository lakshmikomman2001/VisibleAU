# VisibleAU Sprint 2 — Frontend E2E Tests (Playwright)

## What these tests cover

Sprint 2 ships the "Run audit" UI flow: a button on the brand detail page triggers
a real Inngest job, the app polls until complete, and results appear at /audits/[id].

These Playwright tests drive a real browser against the running Next.js app with
real DB data, real Clerk auth, and the mock LLM (LLM_MODE=mock).

| File | What it tests |
|---|---|
| `01-run-audit-button.spec.ts` | "Run audit" button on brand detail page — renders, navigates |
| `02-audit-running.spec.ts` | /audits/[id] running state: progress indicator, polling, breadcrumb |
| `03-audit-complete.spec.ts` | /audits/[id] complete: score, 10 citations, cost badge, Re-run button |
| `04-audit-results-basic.spec.ts` | Citations table: brandMentioned badges, position, responseSnippet |
| `05-audit-list.spec.ts` | /audits list page: audit rows, brand filter, status badge |
| `06-cross-org-isolation.spec.ts` | User 2 cannot view User 1's audit URL (404 page) |
| `07-audit-failed-state.spec.ts` | Failed audit UI card: error message, Retry button |
| `08-acceptance.spec.ts` | Sprint 2 §12 acceptance criteria — full happy-path UI flow |

## Pre-requisites

```bash
# 1. Sprint 2 migrations applied (audits, citations, llm_response_cache tables exist)
#    pnpm drizzle-kit generate && pnpm drizzle-kit migrate

# 2. Inngest dev server running in a separate terminal:
#    npx inngest-cli@latest dev

# 3. Dependencies:
pnpm add -D @playwright/test @clerk/testing vite-tsconfig-paths
pnpm exec playwright install --with-deps chromium

# 4. .env.test.local populated (see template below)
```

## .env.test.local required variables

```bash
# App
E2E_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Clerk test mode
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

# Test User 1 — Org 1 (agency tier)
E2E_TEST_USER_EMAIL=e2e-user-1@visibleau.test
E2E_TEST_USER_PASSWORD=Test1234!
E2E_TEST_USER_1_CLERK_ID=user_...
E2E_TEST_ORG_1_CLERK_ID=org_...

# Test User 2 — Org 2 (different org — for cross-org tests)
E2E_TEST_USER_2_EMAIL=e2e-user-2@visibleau.test
E2E_TEST_USER_2_PASSWORD=Test1234!
E2E_TEST_USER_2_CLERK_ID=user_...
E2E_TEST_ORG_2_CLERK_ID=org_...

# Database (Supabase test project)
DATABASE_URL=postgresql://postgres.[ref]:[pass]@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.[ref]:[pass]@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres

# LLM — always mock for E2E tests
LLM_MODE=mock
MOCK_SCENARIO=happy_path

# Inngest (dev server)
INNGEST_EVENT_KEY=local
INNGEST_SIGNING_KEY=local
```

## How to run

```bash
# Run all Sprint 2 frontend E2E tests
pnpm exec playwright test --config tests/e2e/sprint2/playwright.config.ts

# Run a single spec
pnpm exec playwright test tests/e2e/sprint2/03-audit-complete.spec.ts \
  --config tests/e2e/sprint2/playwright.config.ts

# Run headed (watch the browser)
pnpm exec playwright test --config tests/e2e/sprint2/playwright.config.ts --headed

# Debug a specific test
pnpm exec playwright test tests/e2e/sprint2/08-acceptance.spec.ts \
  --config tests/e2e/sprint2/playwright.config.ts --debug
```

## Add to package.json

```json
{
  "scripts": {
    "test:e2e:frontend:sprint2": "playwright test --config tests/e2e/sprint2/playwright.config.ts"
  }
}
```

## Test data strategy

- **Organisations + users**: seeded idempotently in `beforeAll` via `helpers/db.ts`
  (direct DB, bypasses RLS) — preserved across runs
- **Brands**: seeded in `beforeAll`, hard-deleted in `afterAll`
- **Audits + citations**: created by the tests via the real API, hard-deleted in `afterAll`
- All test brands use domain `*.e2e.test` so they're trivially identifiable
- `afterAll` guards: `if (org1Id)` before every teardown call (C14 pattern)

## Key Sprint 2 UI routes

| Route | Screen |
|---|---|
| `/brands/[brandId]` | BrandDetail — has "Run audit" button (Sprint 2 §10 step 7) |
| `/audits/[auditId]` | AuditRunning (status=pending/running) → AuditResultsBasic (complete) |
| `/audits` | AuditList — table of all org audits |

## Inngest requirement

Tests `02-audit-running` through `08-acceptance` require the Inngest dev server.
The polling helper waits up to **45 seconds** for `status=complete`.
If the server is not running, tests timeout with a clear error message.

## Anti-patterns to avoid

- **Never** set `LLM_MODE=openai` or `E2E_USE_REAL_LLM=true` in CI
- **Never** use `page.waitForTimeout()` for Inngest polling — use `page.waitForURL` or poll API
- **Never** hard-code audit IDs — always capture from the API response or URL
- **Never** assert on Sprint 3+ UI elements (rich scores, multidimensional charts)
