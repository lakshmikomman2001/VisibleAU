# VisibleAU Sprint 3 — Claude Code UI QA

## What these tests cover

Sprint 3 frontend E2E tests validate the three UI changes that ship in Sprint 3,
plus the two new API routes that power them:

| Feature | What it tests |
|---|---|
| F01 | Run Audit button: Sprint 3 regression (4-engine subtitle after click) |
| F02 | AuditRunning screen: Sprint 3 multi-engine subtitle (R4/Y4 fix) |
| F03 | AuditResultsBasic: "View rich version →" now navigable (was disabled Sprint 2) |
| F04 | no_mention scenario: score=0, all 200 calls ran |
| F05 | partial_failure scenario: score>0, some calls failed |
| F06 | rate_limited scenario: Inngest retry recovers 429 |
| F07 | GET /api/audits/[id]/full: Sprint 3 API (AA1 fix: /rich page is Sprint 4) |
| F08 | Cross-org isolation: /api/audits/[id]/full and /audits/[id]/rich → 404 |
| F09 | Failed audit: state visible, rich page unavailable |
| F10 | Sprint 3 §12 acceptance criteria (browser-facing) |

## Sprint 3 frontend scope (what actually ships)

> **AA1/AA2/AA4 FIX (audit pass):** The AuditResultsRich PAGE (`/audits/[id]/rich`) is
> **Sprint 4 scope**, not Sprint 3. Sprint 3 ships the API only.
> - Sprint 3 §0: "Out of scope: UI to display the rich results (Sprint 4)"
> - Sprint 3 §14: "Not ready: Audit results UI (Sprint 4)"
> - Prototype shows AuditResultsRich as a **design reference** for Sprint 4, not a shipping spec.
> - F07 has been converted to test `GET /api/audits/[id]/full` (the Sprint 3 API).
> - F03 TC-F03-05/06 corrected: the "View rich version →" link stays **disabled** (Sprint 4).
> - F08/F09/F10 corrected: `/rich` route references removed.

## Sprint 3 frontend scope (what actually ships)

**Sprint 3 spec explicitly says:** "Out of scope: UI to display the rich results (Sprint 4)"

**BUT Sprint 3 DOES ship these frontend changes:**

1. **AuditRunning screen UPDATE** — subtitle now shows:
   `"Querying ChatGPT, Claude, Gemini, Perplexity × 10 prompts × 5 runs = 200 LLM calls.
   Estimated 4-6 minutes."`
   (was: ChatGPT × 10 prompts × 1 run = 10 calls in Sprint 2)

2. **AuditResultsBasic UPDATE** — "View rich version →" link is now navigable
   (was disabled with `opacity-40` in Sprint 2 because the rich screen didn't exist)

3. **NEW: GET /api/audits/[auditId]/full** — rich payload API (Sprint 4 UI consumes this):
   (AA1 FIX: AuditResultsRich PAGE is Sprint 4. Sprint 3 ships the API only.)
   API response includes:
   - Composite score 63.4 with "95% CI: 59.1 — 67.7"
   - 5-dimension breakdown tiles: Frequency=14, Position=90, Sentiment=79, Context=73, Accuracy=71
   - Per-engine performance card (ChatGPT/Claude/Gemini/Perplexity)
   - Sentiment breakdown card (positive/neutral/negative)
   - Competitor context card (Sprint 6 preview teaser)
   - Action Center card ("Coming in Sprint 6")
   - Export button visible (full export ships Sprint 4)

4. **GET /api/audits/[auditId]/full** — new API route (AC4 fix)
5. **GET /api/brands/[brandId]/metrics** — new API route for trend data

## Prerequisites

```
1. Sprint 2 complete and all Sprint 2 migrations applied
2. Sprint 3 migrations applied:
     pnpm drizzle-kit generate && pnpm drizzle-kit migrate
   New columns: score_frequency, score_position, score_sentiment (TEXT),
   score_sentiment_numeric, score_context (TEXT), score_context_numeric,
   score_accuracy, score_confidence_low, score_confidence_high,
   confidence_intervals, engine_count, prompt_count
   New table: canary_prompts
3. All 4 engine mock fixtures exist:
     lib/llm/mock-responses/chatgpt/happy_path.json   (Sprint 2)
     lib/llm/mock-responses/claude/happy_path.json    (Sprint 3 new)
     lib/llm/mock-responses/gemini/happy_path.json    (Sprint 3 new)
     lib/llm/mock-responses/perplexity/happy_path.json(Sprint 3 new)
   Each scenario (no_mention/partial_failure/rate_limited) also needs
   all 4 engine fixtures.
4. Inngest dev server for F01-F06 (started automatically by bat scripts)
5. F07-F10 do NOT require Inngest (DB-seeded audits)
6. @clerk/testing package installed: pnpm add -D @clerk/testing
7. .env.test.local populated — see below
```

## .env.test.local required variables

```bash
# App
E2E_APP_URL=http://localhost:3000

# Database (test project — service role bypasses RLS)
DATABASE_URL=postgresql://postgres.[ref]:[pass]@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres

# Clerk test-mode keys
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

# Test User 1 — Org 1 (agency tier — 4 engines for Sprint 3 paid-tier tests)
E2E_TEST_USER_EMAIL=e2e-user-1@visibleau.test
E2E_TEST_USER_PASSWORD=Test1234!
E2E_TEST_USER_1_CLERK_ID=user_...
E2E_TEST_ORG_1_CLERK_ID=org_...

# Test User 2 — Org 2 (free tier — 2 engines: chatgpt + perplexity)
E2E_TEST_USER_2_EMAIL=e2e-user-2@visibleau.test
E2E_TEST_USER_2_PASSWORD=Test1234!
E2E_TEST_USER_2_CLERK_ID=user_...
E2E_TEST_ORG_2_CLERK_ID=org_...

# LLM — always mock for E2E tests
LLM_MODE=mock
MOCK_SCENARIO=happy_path
E2E_USE_REAL_LLM=false

# Inngest (dev server)
INNGEST_EVENT_KEY=local
INNGEST_SIGNING_KEY=local

# Sprint 3 new API keys (can be dummy in mock mode)
ANTHROPIC_API_KEY=sk-ant-dummy
GOOGLE_AI_API_KEY=dummy
PERPLEXITY_API_KEY=pplx-dummy
```

## How to run

### Run all compatible features (F01–F03, F07–F10)
```cmd
scripts\run-all-sprint3.bat
scripts\run-all-sprint3.bat --headless
```

### Run a single feature
```cmd
scripts\F01-run-audit-btn.bat
scripts\F07-audit-results-rich.bat
scripts\F07-audit-results-rich.bat --headless
```

### Run F04/F05/F06 (need different MOCK_SCENARIO — individual bats only)
```cmd
scripts\F04-no-mention.bat
scripts\F05-partial-failure.bat
scripts\F06-rate-limited.bat
```

### Run via Playwright directly (after server is already running)
```cmd
pnpm exec playwright test visibleau-sprint3-claude-code-qa/features/F07-audit-results-rich.spec.ts \
  --config=visibleau-sprint3-claude-code-qa/playwright.config.ts \
  --project=chromium --headed
```

## Feature index

| Script | MOCK_SCENARIO | Inngest? | DB seed? | Key assertions |
|---|---|---|---|---|
| F01-run-audit-btn.bat | happy_path | ✅ | Auto | 4-engine subtitle after click |
| F02-audit-running-sprint3.bat | happy_path | ✅ | Auto | 200 LLM calls, 4 engine names |
| F03-audit-results-basic-sprint3.bat | happy_path | ✅ | Auto | View rich version → navigable |
| F04-no-mention.bat | **no_mention** | ✅ | Auto | Score≈0, 200 citations, no mentions |
| F05-partial-failure.bat | **partial_failure** | ✅ | Auto | Score>0, citationCount<200 |
| F06-rate-limited.bat | **rate_limited** | ✅ | Auto | Retry recovers, completes |
| F07-audit-results-rich.bat | happy_path | ❌ | ✅ pre-seeded | /full API: scores, CI, cross-org 404 (AA1 fix) |
| F08-cross-org-isolation.bat | happy_path | ❌ | ✅ pre-seeded | /full and /rich → 404 cross-org |
| F09-failed-audit.bat | happy_path | ❌ | ✅ pre-seeded | Failed badge, rich unavailable |
| F10-acceptance.bat | happy_path | ❌ | ✅ pre-seeded | §12 acceptance: API + AuditResultsBasic (AA4 fix) |

## Key Sprint 3 spec points

### BC7: MOCK_SCENARIO env drives LLM behaviour (NOT the POST body)
`getLLMService(engine)` reads `process.env.MOCK_SCENARIO` — NOT the `scenario` field in the
POST body. The POST body field only sets `metadata.mockScenario`. This is why F04/F05/F06
must be run via their individual bat scripts, which set the correct env before starting pnpm dev.

### AC3a: scoreSentiment and scoreContext are TEXT labels
`scoreSentiment` stores `'positive'|'neutral'|'negative'` (not `'79.00'`).
`scoreContext` stores `'recommended'|'listed'|'mentioned'|'commodified'` (not `'73.00'`).
F10 TC-F10-07/08 verify these render as text labels on the rich page.

### commodified = 25, NOT 0 (Round 29 fix)
The Context score for a `commodified` mention is 25. Any code asserting 0 is a regression.

### Free tier = 2 engines (ChatGPT + Perplexity)
`enginesForTier('free')` returns `['chatgpt','perplexity']`. Free-tier audits create 100 citations
(2×10×5), not 200. Org 2 is seeded as `tier:'free'`.

### X7/X9 fix: browser.newContext() needs baseURL
All `browser.newContext()` calls in unauthenticated test cases pass
`{ baseURL: process.env.E2E_APP_URL ?? 'http://localhost:3000' }`.

## Test data cleanup

All test brands use the `[QA-S3]` prefix. `deleteQAData(orgId)` in `afterAll`:
1. Deletes all citations for all org audits
2. Deletes all audits for the org
3. Deletes all brands for the org

The org and user rows are preserved (idempotent `ensureOrg1/2`).

## Viewing the HTML report
```cmd
pnpm exec playwright show-report sprint3-qa-report
```
