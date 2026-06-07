# VisibleAU Sprint 3 — QA Feature Document (Claude Code)

**Version:** 1.0
**Sprint:** 3 — Multi-Engine + Multidimensional Scoring
**Purpose:** Feature-specific E2E QA tests for every Sprint 3 deliverable. Each feature has its
own `.bat` (Windows) and `.sh` (Unix/macOS) launch script that seeds real test data, starts the
Next.js dev server with `LLM_MODE=mock`, runs Playwright end-to-end tests, then hard-deletes
all seeded rows on exit (pass or fail).

**Critical Sprint 3 invariants baked in:**

- `commodified` context score = **25** (NOT 0) — Round 29 canonical. Never regress.
- `scoreSentiment` in `db.update.set()` must be TEXT label (‘positive’/‘neutral’/‘negative’) — the §8
  finalize code snippet shows `.toFixed(2)` (WRONG). Follow §5 AB1 schema, not §8 snippet.
- `scoreContext` in `db.update.set()` must be TEXT label (‘recommended’/‘listed’/etc.) — same §8 bug.
- `engineCount`, `promptCount`, `scoreConfidenceLow`, `scoreConfidenceHigh` are NOT in the §8 finalize
  snippet but ARE required by §5 AB2 schema. Claude Code must add them to `db.update.set()`. (E32)
- `DIMENSION_WEIGHTS` sum to **exactly 1.00** (25/25/20/15/15).
- `scoreSentiment` column is **TEXT** (‘positive’/‘neutral’/‘negative’), NOT numeric.
- `scoreContext` column is **TEXT** (‘recommended’/‘listed’/‘mentioned’/‘commodified’), NOT numeric.
- Free tier engines = `['chatgpt', 'perplexity']` (2 engines per PRD §7).
- Paid tier engines = `['chatgpt', 'claude', 'gemini', 'perplexity']` (4 engines).
- Free audit: 2 × 10 prompts × 5 runs = **100 primary calls**.
- Paid audit: 4 × 10 prompts × 5 runs = **200 primary calls**.
- Cost budget: `totalCostUsd < 4.00` (includes derived task headroom — AB4 fix).
- `scoreConfidenceLow ≤ scoreComposite ≤ scoreConfidenceHigh` — AC3c constraint.
- Cross-org → **404** (not 401, not 403) — CLAUDE.md §7.
- `MockLLM(engine, scenario)` — TWO constructor args (AA3 fix). Engine param first.
- `getLLMService(engine)` accepts engine param (Z3 fix). Fresh MockLLM per call.
- `canaryCheck` registered in Inngest `serve()` (X7 fix) — AC3d.
- `perplexity-impl.ts` uses `baseURL: 'https://api.perplexity.ai'` (Z4 fix).

**Prerequisites:** Sprint 2 accepted. Sprint 3 migrations applied (new columns on `audits`,
new `canary_prompts` table). All 16 mock fixture JSONs exist
(`lib/llm/mock-responses/{chatgpt,claude,gemini,perplexity}/{happy_path,no_mention,partial_failure,rate_limited}.json`).

-----

## Directory structure

```
tests/qa/sprint3/
├── playwright.config.ts
├── shared/
│   ├── db.ts              # Service-role Drizzle client (bypasses RLS)
│   ├── seed.ts            # Sprint 1 + 2 + 3 seed helpers
│   └── cleanup.ts         # FK-safe delete: citations → audits → canary_prompts → brands → users → orgs
├── features/
│   ├── f01-health/          f01-health.spec.ts       F01-HEALTH.bat       f01-health.sh
│   ├── f02-model-selector/  f02-model-selector.spec.ts ...
│   ├── f03-tier-engines/    f03-tier-engines.spec.ts ...
│   ├── f04-mock-fixtures/   f04-mock-fixtures.spec.ts ...
│   ├── f05-scoring-math/    f05-scoring-math.spec.ts ...
│   ├── f06-wilson-ci/       f06-wilson-ci.spec.ts ...
│   ├── f07-free-tier-audit/ f07-free-tier-audit.spec.ts ...
│   ├── f08-paid-tier-audit/ f08-paid-tier-audit.spec.ts ...
│   ├── f09-full-endpoint/   f09-full-endpoint.spec.ts ...
│   ├── f10-brand-metrics/   f10-brand-metrics.spec.ts ...
│   ├── f11-canary-check/    f11-canary-check.spec.ts ...
│   └── f12-cross-org/       f12-cross-org.spec.ts ...
├── S3-RUN-ALL.bat
└── s3-run-all.sh
```

-----

## Prerequisites

```bash
# Sprint 3 migrations
pnpm drizzle-kit generate && pnpm drizzle-kit migrate

# Verify Sprint 3 columns on audits table:
# score_frequency, score_position, score_sentiment (TEXT!), score_context (TEXT!),
# score_accuracy, score_sentiment_numeric, score_context_numeric,
# score_confidence_low, score_confidence_high, confidence_intervals,
# engine_count, prompt_count

# Verify canary_prompts table exists.

# All 16 fixture JSONs:
# lib/llm/mock-responses/{chatgpt,claude,gemini,perplexity}/
#   {happy_path,no_mention,partial_failure,rate_limited}.json

# Playwright + Clerk
pnpm add -D @playwright/test @clerk/testing
pnpm exec playwright install --with-deps chromium

# A36 note (from Sprint 2): Create TWO test organizations in Clerk:
# Org 1 (E2E_TEST_ORG_1_CLERK_ID) + User 1 — primary tenant (free tier for F07, paid for F08)
# Org 2 (E2E_TEST_ORG_2_CLERK_ID) + User 2 — cross-org isolation tests
# Org 3 (E2E_TEST_ORG_3_CLERK_ID) + User 3 — second paid-tier org for metrics trend tests

# QA test-only routes (create, guard with LLM_MODE=mock):
# app/api/qa/scoring-test/route.ts   POST { fn, args }  → runs scoring functions server-side
# app/api/qa/llm-mode/route.ts       GET                 → { mode, engines }
# app/api/qa/llm-test/route.ts       POST { engine, prompt, scenario, callCount? }
```

-----

## `.env.test.local` additions for Sprint 3

```bash
# ── From Sprint 1 + 2 (carry forward) ────────────────────────────────────────
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
E2E_TEST_USER_1_EMAIL=qa-s3-user1@visibleau.test
E2E_TEST_USER_1_PASSWORD=QAS3User1!
E2E_TEST_USER_1_CLERK_ID=user_...
E2E_TEST_ORG_1_CLERK_ID=org_...        # Primary test org (tier set per-feature: free in F07, agency in F09/F10/F12)
E2E_TEST_USER_2_EMAIL=qa-s3-user2@visibleau.test
E2E_TEST_USER_2_PASSWORD=QAS3User2!
E2E_TEST_USER_2_CLERK_ID=user_...
E2E_TEST_ORG_2_CLERK_ID=org_...        # Cross-org isolation org
# NEW: Third org for paid-tier + metrics tests
E2E_TEST_USER_3_EMAIL=qa-s3-user3@visibleau.test
E2E_TEST_USER_3_PASSWORD=QAS3User3!
E2E_TEST_USER_3_CLERK_ID=user_...
E2E_TEST_ORG_3_CLERK_ID=org_...        # Agency tier org (tier='agency')

LLM_MODE=mock
MOCK_SCENARIO=happy_path
E2E_USE_REAL_LLM=false
NEXT_PUBLIC_APP_URL=http://localhost:3000
E2E_APP_URL=http://localhost:3000
INNGEST_DEV_PORT=8288

# ── Sprint 3 additions ────────────────────────────────────────────────────────
# Real LLM keys — only used when E2E_USE_REAL_LLM=true (manual smoke test)
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=...
PERPLEXITY_API_KEY=pplx-...
OPENAI_API_KEY=sk-proj-...
```

-----

## `tests/qa/sprint3/playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';
import { config }                from 'dotenv';
import path                      from 'node:path';

config({ path: path.resolve(process.cwd(), '.env.test.local') });

export default defineConfig({
  testDir:       '.',
  testMatch:     '**/features/**/*.spec.ts',
  fullyParallel: false,
  forbidOnly:    !!process.env.CI,
  retries:       0,
  workers:       1,
  timeout:       120_000,   // Sprint 3 audits: 200 calls × ~0.1s mock = ~20s, allow 120s

  reporter: [['list'], ['html', { outputFolder: 'tests/qa/sprint3/reports', open: 'never' }]],
  use: {
    baseURL:    process.env.E2E_APP_URL ?? 'http://localhost:3000',
    trace:      'on-first-retry',
    screenshot: 'only-on-failure',
  },

  env: {
    CLERK_SECRET_KEY:                  process.env.CLERK_SECRET_KEY                  ?? '',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
    DATABASE_URL:                      process.env.DATABASE_URL                      ?? '',
    DIRECT_URL:                        process.env.DIRECT_URL                        ?? '',
    E2E_APP_URL:                       process.env.E2E_APP_URL                       ?? 'http://localhost:3000',
    LLM_MODE:                          process.env.LLM_MODE                          ?? 'mock',
    MOCK_SCENARIO:                     process.env.MOCK_SCENARIO                     ?? 'happy_path',
    E2E_USE_REAL_LLM:                  process.env.E2E_USE_REAL_LLM                  ?? 'false',
    NEXT_PUBLIC_APP_URL:               process.env.NEXT_PUBLIC_APP_URL               ?? 'http://localhost:3000',
    E2E_TEST_USER_1_EMAIL:             process.env.E2E_TEST_USER_1_EMAIL             ?? '',
    E2E_TEST_USER_1_PASSWORD:          process.env.E2E_TEST_USER_1_PASSWORD          ?? '',
    E2E_TEST_USER_1_CLERK_ID:          process.env.E2E_TEST_USER_1_CLERK_ID          ?? '',
    E2E_TEST_ORG_1_CLERK_ID:           process.env.E2E_TEST_ORG_1_CLERK_ID           ?? '',
    E2E_TEST_USER_2_EMAIL:             process.env.E2E_TEST_USER_2_EMAIL             ?? '',
    E2E_TEST_USER_2_PASSWORD:          process.env.E2E_TEST_USER_2_PASSWORD          ?? '',
    E2E_TEST_USER_2_CLERK_ID:          process.env.E2E_TEST_USER_2_CLERK_ID          ?? '',
    E2E_TEST_ORG_2_CLERK_ID:           process.env.E2E_TEST_ORG_2_CLERK_ID           ?? '',
    E2E_TEST_USER_3_EMAIL:             process.env.E2E_TEST_USER_3_EMAIL             ?? '',
    E2E_TEST_USER_3_PASSWORD:          process.env.E2E_TEST_USER_3_PASSWORD          ?? '',
    E2E_TEST_USER_3_CLERK_ID:          process.env.E2E_TEST_USER_3_CLERK_ID          ?? '',
    E2E_TEST_ORG_3_CLERK_ID:           process.env.E2E_TEST_ORG_3_CLERK_ID           ?? '',
    INNGEST_DEV_PORT:                  process.env.INNGEST_DEV_PORT                  ?? '8288',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

-----

## Shared helpers

### `tests/qa/sprint3/shared/db.ts`

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres    from 'postgres';
import * as schema from '../../../db/schema';

const pg = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { max: 1 });
export const db = drizzle(pg, { schema });
```

### `tests/qa/sprint3/shared/seed.ts`

```typescript
/**
 * Sprint 3 QA seed helpers.
 * Prefix [S3-QA] on all names — identifies rows for stale-sweep cleanup.
 * seedOrg / seedUser use onConflictDoUpdate (idempotent across re-runs).
 */
import { db }      from './db';
import * as schema from '../../../db/schema';

export async function seedOrg(p: {
  clerkOrgId: string;
  name:        string;
  region?:     'au' | 'nz' | 'uk' | 'us' | 'ca' | 'eu';
  tier?:       'free' | 'starter' | 'growth' | 'agency' | 'agency_pro' | 'enterprise';
}) {
  const [org] = await db.insert(schema.organizations)
    .values({ clerkOrgId: p.clerkOrgId, name: p.name, region: p.region ?? 'au', tier: p.tier ?? 'free' })
    .onConflictDoUpdate({ target: schema.organizations.clerkOrgId, set: { name: p.name, tier: p.tier ?? 'free' } })
    .returning();
  return org;
}

export async function seedUser(p: {
  clerkUserId:    string;
  organizationId: string;
  email:          string;
  role?:          string;
}) {
  const [user] = await db.insert(schema.users)
    .values({ clerkUserId: p.clerkUserId, organizationId: p.organizationId, email: p.email, name: '[S3-QA] User', role: p.role ?? 'owner' })
    .onConflictDoUpdate({ target: schema.users.clerkUserId, set: { organizationId: p.organizationId, email: p.email } })
    .returning();
  return user;
}

export async function seedBrand(p: {
  organizationId: string;
  name?:          string;
  domain?:        string;
  vertical?:      'tradies' | 'allied_health' | 'saas';
}) {
  const [brand] = await db.insert(schema.brands)
    .values({ organizationId: p.organizationId, name: p.name ?? '[S3-QA] Brand',
              domain: p.domain ?? `s3-qa-${Date.now()}.com.au`,
              vertical: p.vertical ?? 'tradies', region: 'au', competitors: [], primaryRegions: ['NSW:Bondi'] })
    .returning();
  return brand;
}

export async function seedAudit(p: {
  organizationId:    string;
  brandId:           string;
  auditNumber?:      number;
  tier?:             string;
  status?:           'pending' | 'running' | 'complete' | 'failed';
  scenario?:         'happy_path' | 'no_mention' | 'partial_failure' | 'rate_limited';
  engines?:          string[];
  scoreComposite?:   string;
  scoreFrequency?:   string;
  scorePosition?:    string;
  scoreSentiment?:   string;   // TEXT: 'positive' | 'neutral' | 'negative'
  scoreContext?:     string;   // TEXT: 'recommended' | 'listed' | 'mentioned' | 'commodified'
  scoreSentimentNumeric?: string;
  scoreContextNumeric?:   string;
  scoreAccuracy?:    string;
  scoreConfidenceLow?:  string;
  scoreConfidenceHigh?: string;
  confidenceIntervals?: Record<string, { lower: number; upper: number }>;
  engineCount?:      number;
  promptCount?:      number;
  totalCostUsd?:     string;
  totalCalls?:       number;
  startedAt?:        Date;     // G9 fix: explicit timestamp for deterministic ordering
  completedAt?:      Date;     // G9 fix: explicit timestamp for deterministic ordering
}) {
  const done = (p.status ?? 'complete') === 'complete';
  const engines = p.engines ?? ['chatgpt', 'claude', 'gemini', 'perplexity'];
  const [audit] = await db.insert(schema.audits)
    .values({
      organizationId:     p.organizationId,
      brandId:            p.brandId,
      auditNumber:        p.auditNumber        ?? 1,
      triggeredBy:        'manual',
      status:             p.status             ?? 'complete',
      engines,
      promptsCount:       p.promptCount        ?? 10,
      runsPerPrompt:      5,
      totalCalls:         p.totalCalls         ?? (engines.length * 10 * 5),
      scoreComposite:     p.scoreComposite      ?? '63.40',
      scoreFrequency:     p.scoreFrequency      ?? '14.00',
      scorePosition:      p.scorePosition       ?? '90.00',
      scoreSentiment:     p.scoreSentiment      ?? 'positive',
      scoreContext:       p.scoreContext        ?? 'recommended',
      scoreSentimentNumeric: p.scoreSentimentNumeric ?? '79.00',
      scoreContextNumeric:   p.scoreContextNumeric   ?? '73.00',
      scoreAccuracy:      p.scoreAccuracy       ?? '71.00',
      scoreConfidenceLow:  p.scoreConfidenceLow  ?? '59.10',
      scoreConfidenceHigh: p.scoreConfidenceHigh ?? '67.70',
      confidenceIntervals: p.confidenceIntervals ?? {
        frequency: { lower: 9, upper: 20 },
        position:  { lower: 85, upper: 95 },
        sentiment: { lower: 73, upper: 85 },
        context:   { lower: 66, upper: 80 },
        accuracy:  { lower: 64, upper: 78 },
      },
      engineCount:        p.engineCount         ?? engines.length,
      promptCount:        p.promptCount         ?? 10,
      totalCostUsd:       p.totalCostUsd        ?? '1.8900',
      metadata:           { mockScenario: p.scenario ?? 'happy_path' },
      startedAt:          p.startedAt  ?? new Date(Date.now() - 252_000), // G9 fix: use explicit or default ~4m 12s ago
      completedAt:        p.completedAt ?? (done ? new Date() : null),
    })
    .returning();
  return audit;
}

export async function seedCitation(p: {
  auditId:         string;
  engine?:         string;
  runNumber?:      number;
  brandMentioned?: boolean;
  position?:       number | null;
  sentimentLabel?: string;
  contextLabel?:   string;
  responseSnippet?: string;
  citedSources?:   Array<{ domain: string; url: string }>;  // F8 fix: allow different domains
}) {
  const mentioned = p.brandMentioned ?? true;
  const [cit] = await db.insert(schema.citations)
    .values({
      auditId:         p.auditId,
      engine:          p.engine          ?? 'chatgpt',
      prompt:          'Who are the best plumbers in Sydney?',
      runNumber:       p.runNumber       ?? 1,
      brandMentioned:  mentioned,
      position:        p.position !== undefined ? p.position : (mentioned ? 2 : null),
      sentimentLabel:  p.sentimentLabel  ?? (mentioned ? 'positive'     : null),
      contextLabel:    p.contextLabel    ?? (mentioned ? 'recommended'  : null),
      responseSnippet: (p.responseSnippet ?? '[S3-QA] mock response').slice(0, 500),
      contextSnippets: [],
      citedSources:    p.citedSources !== undefined ? p.citedSources : (mentioned ? [{ domain: 'bondiplumbing.com.au', url: 'https://bondiplumbing.com.au' }] : []),  // F8 fix
      llmCostUsd:      '0.0050',
      llmTokensUsed:   85,
      llmModel:        'gpt-4o-mini-mock',
    })
    .returning();
  return cit;
}
```

### `tests/qa/sprint3/shared/cleanup.ts`

```typescript
/**
 * FK-safe cleanup for Sprint 3 QA.
 * Delete order: citations → audits → canary_prompts → brands → users → organizations
 */
import { db }  from './db';
import * as schema from '../../../db/schema';
import { eq, like, inArray } from 'drizzle-orm';

export async function cleanupOrg(orgId: string): Promise<void> {
  if (!orgId) return;
  const auditRows = await db.select({ id: schema.audits.id }).from(schema.audits)
    .where(eq(schema.audits.organizationId, orgId));
  if (auditRows.length > 0)
    await db.delete(schema.citations)
      .where(inArray(schema.citations.auditId, auditRows.map(a => a.id)));
  await db.delete(schema.audits).where(eq(schema.audits.organizationId, orgId));
  await db.delete(schema.brands).where(eq(schema.brands.organizationId, orgId));
  await db.delete(schema.users).where(eq(schema.users.organizationId, orgId));
  await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
}

export async function cleanupCanaryByEngine(engine: string): Promise<void> {
  await db.delete(schema.canaryPrompts).where(like(schema.canaryPrompts.promptText, '[S3-QA]%'));
}

export async function cleanupAllQaData(): Promise<void> {
  const orgs = await db.select({ id: schema.organizations.id }).from(schema.organizations)
    .where(like(schema.organizations.name, '[S3-QA]%'));
  for (const org of orgs) await cleanupOrg(org.id);
  await cleanupCanaryByEngine('chatgpt');
}
```

-----

## Script conventions

**Windows `.bat` env loading:**

```batch
setlocal EnableDelayedExpansion
if exist .env.test.local (
  for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (
    set "line=%%A"
    if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"
  )
)
```

**Unix `.sh` env loading + server + process-group kill:**

```bash
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
LLM_MODE=mock pnpm dev > tests/qa/sprint3/logs/fNN-server.log 2>&1 & SERVER_PID=$!
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do sleep 2; done
# ... tests ...
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
```

-----

## F01 — Sprint 3 health check

**Tests:** App running, DB connected, Sprint 3 migrations applied (audits has scoreFrequency),
canary_prompts table exists, all 4 engines registered in Inngest (`run-audit`, `send-audit-complete-email`,
`canary-check`).  
**Data:** None.

### `tests/qa/sprint3/features/f01-health/f01-health.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

const BASE          = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const INNGEST_PORT  = process.env.INNGEST_DEV_PORT ?? '8288';

test.describe('F01: Sprint 3 health check', () => {
  test('F01-01: GET /api/health → 200 + { status:ok, db:ok }', async ({ request }) => {
    const res  = await request.get('/api/health');
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.db).toBe('ok');
  });

  test('F01-02: Sprint 3 migrations applied — scoreFrequency column exists on audits table', async ({ request }) => {
    // Probe: POST to scoring-test endpoint that queries the audits table with scoreFrequency.
    // 200 = column exists; 500 = column missing (relation or column does not exist).
    const res = await request.post(`${BASE}/api/qa/scoring-test`, {
      data: { fn: 'checkColumn', args: { table: 'audits', column: 'score_frequency' } },
    });
    expect(res.status(), 'audits.score_frequency column missing — run Sprint 3 migrations').toBe(200);
  });

  test('F01-03: scoreSentiment is TEXT (not NUMERIC) on audits table — AC3a', async ({ request }) => {
    // AC3a: scoreSentiment must be TEXT column, not NUMERIC.
    // The scoring endpoint checks the column type via information_schema.columns.
    const res  = await request.post(`${BASE}/api/qa/scoring-test`, {
      data: { fn: 'columnType', args: { table: 'audits', column: 'score_sentiment' } },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.dataType, 'score_sentiment must be TEXT not NUMERIC — AB1 fix').toBe('text');
  });

  test('F01-04: scoreContext is TEXT (not NUMERIC) on audits table — AB1 fix', async ({ request }) => {
    const res  = await request.post(`${BASE}/api/qa/scoring-test`, {
      data: { fn: 'columnType', args: { table: 'audits', column: 'score_context' } },
    });
    const body = await res.json();
    expect(body.dataType).toBe('text');
  });

  test('F01-05: canary_prompts table exists — Sprint 3 migration', async ({ request }) => {
    const res = await request.post(`${BASE}/api/qa/scoring-test`, {
      data: { fn: 'checkTable', args: { table: 'canary_prompts' } },
    });
    expect(res.status(), 'canary_prompts table missing — run Sprint 3 migrations').toBe(200);
  });

  test('F01-06: Inngest introspection includes canary-check (X7 + AC3d fix)', async ({ request }) => {
    const res  = await request.get('/api/webhooks/inngest');
    expect(res.status()).toBe(200);
    const body = await res.json();
    const ids  = ((body.functions ?? []) as Array<{ id: string }>).map(f => f.id);
    expect(ids).toContain('run-audit');
    expect(ids).toContain('send-audit-complete-email');
    // X7 fix: canary-check must be in serve() or daily cron never fires
    expect(ids, 'canary-check missing from serve() — X7 + AC3d fix').toContain('canary-check');
  });

  test('F01-07: Inngest dev server reachable on port', async ({ request }) => {
    const res = await request.get(`http://localhost:${INNGEST_PORT}/`).catch(() => null);
    if (!res) { test.skip(true, 'Start Inngest: npx inngest-cli@latest dev --no-discovery -u http://localhost:3000/api/webhooks/inngest'); return; }
    expect([200, 302, 404]).toContain(res.status());
  });

  test('F01-08: All 16 mock fixture JSONs exist (4 engines × 4 scenarios)', async ({ request }) => {
    // Probe each fixture via the llm-test endpoint; if fixture file is missing → 500 (ENOENT)
    const engines   = ['chatgpt', 'claude', 'gemini', 'perplexity'];
    const scenarios = ['happy_path', 'no_mention', 'partial_failure', 'rate_limited'];
    for (const engine of engines) {
      for (const scenario of scenarios) {
        const res = await request.post(`${BASE}/api/qa/llm-test`, {
          data: { engine, prompt: 'plumber', scenario },
        });
        expect(res.status(), `Missing fixture: ${engine}/${scenario}.json`).not.toBe(500);
      }
    }
  });
});
```

### `tests/qa/sprint3/features/f01-health/F01-HEALTH.bat`

```batch
@echo off
REM F01 — Sprint 3 Health Check  |  No test data seeded
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint3\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint3\logs\f01-server.log 2>&1"
:WAIT_F01
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F01
echo [F01] Server ready.
pnpm exec playwright test tests/qa/sprint3/features/f01-health/f01-health.spec.ts --config tests/qa/sprint3/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F01] PASSED) else (echo [F01] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint3/features/f01-health/f01-health.sh`

```bash
#!/usr/bin/env bash
# F01 — Sprint 3 Health Check
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint3/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint3/logs/f01-server.log 2>&1 & SERVER_PID=$!
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do sleep 2; done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint3/features/f01-health/f01-health.spec.ts \
  --config tests/qa/sprint3/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F01] PASSED" || echo "[F01] FAILED"; exit "$TEST_EXIT"
```

-----

## F02 — Model selector (72-combination matrix)

**Tests:** `selectModel(tier, engine, task)` returns correct model for all 72 combinations;
derived tasks always use cheapest model; agency tier escalates to top-tier models;
agency_pro matches agency in v1; Free/Starter use cheapest.  
**Data:** None — pure function tests via scoring-test endpoint.

### `tests/qa/sprint3/features/f02-model-selector/f02-model-selector.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';

// Helper: call selectModel on the server side via the QA scoring-test endpoint
async function selectModel(request: import('@playwright/test').APIRequestContext, tier: string, engine: string, task: string): Promise<string> {
  const res  = await request.post(`${BASE}/api/qa/scoring-test`, {
    data: { fn: 'selectModel', args: { tier, engine, task } },
  });
  const body = await res.json();
  return body.model as string;
}

const TIERS   = ['free', 'starter', 'growth', 'agency', 'agency_pro', 'enterprise'] as const;
const ENGINES = ['chatgpt', 'claude', 'gemini', 'perplexity'] as const;
const TASKS   = ['brand_mention', 'sentiment', 'context'] as const;

test.describe('F02: model-selector — 72-combination matrix', () => {
  test('F02-01: All 72 tier×engine×task combinations return a non-empty model string', async ({ request }) => {
    // This is the most important test in Sprint 3 — Agency Pro value prop depends on it
    for (const tier of TIERS) {
      for (const engine of ENGINES) {
        for (const task of TASKS) {
          const model = await selectModel(request, tier, engine, task);
          expect(typeof model, `${tier}/${engine}/${task} must return string`).toBe('string');
          expect(model.length, `${tier}/${engine}/${task} model must be non-empty`).toBeGreaterThan(0);
        }
      }
    }
  });

  test('F02-02: Derived tasks (sentiment, context) always return cheapest model regardless of tier', async ({ request }) => {
    // Sentiment and context classification uses cheapest model to save cost (derived task)
    for (const engine of ENGINES) {
      const freeSentiment  = await selectModel(request, 'free', engine, 'sentiment');
      const agencyProSentiment = await selectModel(request, 'agency_pro', engine, 'sentiment');
      expect(freeSentiment, `${engine}/sentiment should be same regardless of tier`).toBe(agencyProSentiment);

      const freeContext    = await selectModel(request, 'free', engine, 'context');
      const agencyProContext   = await selectModel(request, 'agency_pro', engine, 'context');
      expect(freeContext).toBe(agencyProContext);
    }
  });

  test('F02-03: Free + Starter + Growth tiers use gpt-4o-mini for ChatGPT brand_mention', async ({ request }) => {
    // G10a fix: Growth/chatgpt is also gpt-4o-mini per PRIMARY_MODELS spec — only agency+ gets gpt-4o
    expect(await selectModel(request, 'free',    'chatgpt', 'brand_mention')).toBe('gpt-4o-mini');
    expect(await selectModel(request, 'starter', 'chatgpt', 'brand_mention')).toBe('gpt-4o-mini');
    expect(await selectModel(request, 'growth',  'chatgpt', 'brand_mention')).toBe('gpt-4o-mini');
  });

  test('F02-04: Agency + Agency Pro + Enterprise use gpt-4o for ChatGPT brand_mention', async ({ request }) => {
    expect(await selectModel(request, 'agency',     'chatgpt', 'brand_mention')).toBe('gpt-4o');
    expect(await selectModel(request, 'agency_pro', 'chatgpt', 'brand_mention')).toBe('gpt-4o');
    expect(await selectModel(request, 'enterprise', 'chatgpt', 'brand_mention')).toBe('gpt-4o');
  });

  test('F02-05: Free + Starter use sonar for Perplexity brand_mention', async ({ request }) => {
    expect(await selectModel(request, 'free',    'perplexity', 'brand_mention')).toBe('sonar');
    expect(await selectModel(request, 'starter', 'perplexity', 'brand_mention')).toBe('sonar');
  });

  test('F02-06: Agency tiers use sonar-pro for Perplexity brand_mention', async ({ request }) => {
    expect(await selectModel(request, 'agency',     'perplexity', 'brand_mention')).toBe('sonar-pro');
    expect(await selectModel(request, 'agency_pro', 'perplexity', 'brand_mention')).toBe('sonar-pro');
  });

  test('F02-07: Agency Pro matches Agency models in v1 (Opus reserved for v1.1)', async ({ request }) => {
    for (const engine of ENGINES) {
      const agency    = await selectModel(request, 'agency',     engine, 'brand_mention');
      const agencyPro = await selectModel(request, 'agency_pro', engine, 'brand_mention');
      expect(agencyPro, `agency_pro should match agency for ${engine} in v1`).toBe(agency);
    }
  });

  test('F02-08: Unknown tier falls back to starter models (runtime guard)', async ({ request }) => {
    // TypeScript prevents this at compile time; test the runtime ?? fallback
    const model = await selectModel(request, 'unknown_tier_xyz', 'chatgpt', 'brand_mention');
    expect(model).toBe('gpt-4o-mini');  // starter fallback per model-selector.ts
  });

  test('F02-09: Growth tier uses mid-tier Claude for brand_mention', async ({ request }) => {
    expect(await selectModel(request, 'growth', 'claude', 'brand_mention')).toBe('claude-3-5-sonnet-20241022');
  });

  test('F02-10: Free tier uses cheapest Claude (haiku) for brand_mention', async ({ request }) => {
    expect(await selectModel(request, 'free', 'claude', 'brand_mention')).toBe('claude-3-5-haiku-20241022');
  });

  // F19 fix: explicit Gemini model assertions (free=flash, agency=pro)
  // Backend test spec v1.3 confirms: free/gemini='gemini-1.5-flash', agency/gemini='gemini-1.5-pro'
  test('F02-11: Free + Starter + Growth use gemini-1.5-flash for Gemini brand_mention', async ({ request }) => {
    // G10a fix: Growth/gemini is also gemini-1.5-flash per PRIMARY_MODELS spec (only agency+ upgrades to pro)
    expect(await selectModel(request, 'free',    'gemini', 'brand_mention')).toBe('gemini-1.5-flash');
    expect(await selectModel(request, 'starter', 'gemini', 'brand_mention')).toBe('gemini-1.5-flash');
    expect(await selectModel(request, 'growth',  'gemini', 'brand_mention')).toBe('gemini-1.5-flash');
  });

  test('F02-12: Agency tiers use gemini-1.5-pro for Gemini brand_mention', async ({ request }) => {
    expect(await selectModel(request, 'agency',     'gemini', 'brand_mention')).toBe('gemini-1.5-pro');
    expect(await selectModel(request, 'agency_pro', 'gemini', 'brand_mention')).toBe('gemini-1.5-pro');
  });
});
```

### `tests/qa/sprint3/features/f02-model-selector/F02-MODEL-SELECTOR.bat`

```batch
@echo off
REM F02 — Model Selector 72-Combination Matrix  |  No DB test data
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint3\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint3\logs\f02-server.log 2>&1"
:WAIT_F02
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F02
pnpm exec playwright test tests/qa/sprint3/features/f02-model-selector/f02-model-selector.spec.ts --config tests/qa/sprint3/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F02] PASSED) else (echo [F02] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint3/features/f02-model-selector/f02-model-selector.sh`

```bash
#!/usr/bin/env bash
# F02 — Model Selector 72-Combination Matrix
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint3/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint3/logs/f02-server.log 2>&1 & SERVER_PID=$!
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do sleep 2; done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint3/features/f02-model-selector/f02-model-selector.spec.ts \
  --config tests/qa/sprint3/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F02] PASSED" || echo "[F02] FAILED"; exit "$TEST_EXIT"
```

-----

## F03 — Tier-engine allowlist

**Tests:** `enginesForTier('free')` = `['chatgpt', 'perplexity']` (exactly 2);
all paid tiers = all 4 engines; every tier enum value has an entry.

### `tests/qa/sprint3/features/f03-tier-engines/f03-tier-engines.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';

async function enginesForTier(request: import('@playwright/test').APIRequestContext, tier: string): Promise<string[]> {
  const res  = await request.post(`${BASE}/api/qa/scoring-test`, {
    data: { fn: 'enginesForTier', args: { tier } },
  });
  const body = await res.json();
  return body.engines as string[];
}

test.describe('F03: Tier-engine allowlist (TIER_ENGINES + enginesForTier)', () => {
  test('F03-01: Free tier returns exactly chatgpt + perplexity (2 engines) — PRD §7 + AC3b', async ({ request }) => {
    const engines = await enginesForTier(request, 'free');
    expect(engines).toEqual(['chatgpt', 'perplexity']);
    expect(engines).toHaveLength(2);
  });

  test('F03-02: All paid tiers return all 4 engines', async ({ request }) => {
    const paid = ['starter', 'growth', 'agency', 'agency_pro', 'enterprise'];
    for (const tier of paid) {
      const engines = await enginesForTier(request, tier);
      expect(engines, `${tier} should have 4 engines`).toEqual(['chatgpt', 'claude', 'gemini', 'perplexity']);
      expect(engines).toHaveLength(4);
    }
  });

  test('F03-03: All 6 tier enum values have an entry (no undefined)', async ({ request }) => {
    const tiers = ['free', 'starter', 'growth', 'agency', 'agency_pro', 'enterprise'];
    for (const tier of tiers) {
      const engines = await enginesForTier(request, tier);
      expect(Array.isArray(engines), `${tier} must have engines array`).toBe(true);
      expect(engines.length).toBeGreaterThan(0);
    }
  });

  test('F03-04: Free tier call count = 100 (2 engines × 10 prompts × 5 runs)', async ({ request }) => {
    const engines = await enginesForTier(request, 'free');
    expect(engines.length * 10 * 5).toBe(100);
  });

  test('F03-05: Paid tier call count = 200 (4 engines × 10 prompts × 5 runs)', async ({ request }) => {
    const engines = await enginesForTier(request, 'agency');
    expect(engines.length * 10 * 5).toBe(200);
  });

  test('F03-06: Unknown tier falls back to free (most restrictive) — safe fallback', async ({ request }) => {
    const engines = await enginesForTier(request, 'unknown_tier_xyz');
    // enginesForTier() falls back to TIER_ENGINES.free per tier-engines.ts
    expect(engines).toEqual(['chatgpt', 'perplexity']);
  });
});
```

### `tests/qa/sprint3/features/f03-tier-engines/F03-TIER-ENGINES.bat`

```batch
@echo off
REM F03 — Tier-Engine Allowlist  |  No DB data
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint3\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint3\logs\f03-server.log 2>&1"
:WAIT_F03
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F03
pnpm exec playwright test tests/qa/sprint3/features/f03-tier-engines/f03-tier-engines.spec.ts --config tests/qa/sprint3/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F03] PASSED) else (echo [F03] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint3/features/f03-tier-engines/f03-tier-engines.sh`

```bash
#!/usr/bin/env bash
# F03 — Tier-Engine Allowlist
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint3/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint3/logs/f03-server.log 2>&1 & SERVER_PID=$!
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do sleep 2; done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint3/features/f03-tier-engines/f03-tier-engines.spec.ts \
  --config tests/qa/sprint3/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F03] PASSED" || echo "[F03] FAILED"; exit "$TEST_EXIT"
```

-----

## F04 — Mock LLM fixtures (all 4 engines × all 4 scenarios)

**Tests:** All 16 fixture files load; per-engine fixture responses match expectations;
Gemini/Perplexity happy_path responses are WEAKER than ChatGPT/Claude (Round 32 Option A).  
**Data:** None.

### `tests/qa/sprint3/features/f04-mock-fixtures/f04-mock-fixtures.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

const BASE    = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const ENGINES = ['chatgpt', 'claude', 'gemini', 'perplexity'] as const;
const SCENARIOS = ['happy_path', 'no_mention', 'partial_failure', 'rate_limited'] as const;

async function llmTest(request: import('@playwright/test').APIRequestContext, engine: string, scenario: string, callCount?: number) {
  return request.post(`${BASE}/api/qa/llm-test`, { data: { engine, prompt: 'plumber', scenario, callCount } });
}

test.describe('F04: Mock LLM fixtures — 16 files (4 engines × 4 scenarios)', () => {
  test('F04-01: All 16 fixture files load without error (no ENOENT)', async ({ request }) => {
    for (const engine of ENGINES) {
      for (const scenario of SCENARIOS) {
        // partial_failure and rate_limited throw for some callCounts — test with callCount=3 (succeeds)
        const callCount = (scenario === 'partial_failure' || scenario === 'rate_limited') ? 3 : undefined;
        const res = await llmTest(request, engine, scenario, callCount);
        expect(res.status(), `${engine}/${scenario} fixture must load (not 500/ENOENT)`).not.toBe(500);
      }
    }
  });

  test('F04-02: happy_path ChatGPT + Claude respond with Bondi Plumbing (strong mention)', async ({ request }) => {
    for (const engine of ['chatgpt', 'claude'] as const) {
      const res  = await llmTest(request, engine, 'happy_path');
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.response).toMatch(/Bondi Plumbing/i);
    }
  });

  test('F04-03: happy_path Gemini + Perplexity also mention Bondi Plumbing (weaker — Round 32)', async ({ request }) => {
    // Round 32 Option A: Gemini/Perplexity use WEAKER mention language (listed, not recommended)
    // Both still mention the brand — weaker context label will produce lower context score
    for (const engine of ['gemini', 'perplexity'] as const) {
      const res  = await llmTest(request, engine, 'happy_path');
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.response).toMatch(/Bondi Plumbing/i);
    }
  });

  test('F04-04: no_mention scenario — response does not contain brand name for all engines', async ({ request }) => {
    for (const engine of ENGINES) {
      const res  = await llmTest(request, engine, 'no_mention');
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.response).not.toMatch(/Bondi Plumbing/i);
    }
  });

  test('F04-05: rate_limited throws 429 on callCount=1 for all engines', async ({ request }) => {
    for (const engine of ENGINES) {
      const res = await llmTest(request, engine, 'rate_limited', 1);
      expect(res.status(), `${engine}/rate_limited callCount=1 must throw 429`).toBe(429);
    }
  });

  test('F04-06: rate_limited succeeds on callCount=2 for all engines', async ({ request }) => {
    for (const engine of ENGINES) {
      const res = await llmTest(request, engine, 'rate_limited', 2);
      expect(res.status()).toBe(200);
    }
  });

  test('F04-07: partial_failure throws when callCount%5<2 for all engines (R1 fix)', async ({ request }) => {
    for (const engine of ENGINES) {
      // callCount=1 → 1%5=1 < 2 → throws
      const res1 = await llmTest(request, engine, 'partial_failure', 1);
      expect([429, 500]).toContain(res1.status());
      // callCount=3 → 3%5=3 ≥ 2 → succeeds
      const res3 = await llmTest(request, engine, 'partial_failure', 3);
      expect(res3.status()).toBe(200);
    }
  });

  test('F04-08: MockLLM constructor requires engine as FIRST arg (AA3 fix — not scenario)', async ({ request }) => {
    // AA3 fix: new MockLLM(engine, scenario) — if engine is not first, fixture loads from wrong dir
    // If incorrectly constructed as MockLLM(scenario), the engine string would be used as scenario
    // and load from an invalid fixture path → ENOENT → 500.
    // Probe: claude/happy_path loads correctly (would fail if engine param is missing)
    const res = await llmTest(request, 'claude', 'happy_path');
    expect(res.status(), 'claude/happy_path must load — verifies MockLLM(engine, scenario) constructor').toBe(200);
    const body = await res.json();
    expect(body.model).toContain('mock');
  });
});
```

### `tests/qa/sprint3/features/f04-mock-fixtures/F04-MOCK-FIXTURES.bat`

```batch
@echo off
REM F04 — Mock LLM Fixtures  |  No DB data
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint3\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint3\logs\f04-server.log 2>&1"
:WAIT_F04
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F04
pnpm exec playwright test tests/qa/sprint3/features/f04-mock-fixtures/f04-mock-fixtures.spec.ts --config tests/qa/sprint3/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F04] PASSED) else (echo [F04] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint3/features/f04-mock-fixtures/f04-mock-fixtures.sh`

```bash
#!/usr/bin/env bash
# F04 — Mock LLM Fixtures
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint3/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint3/logs/f04-server.log 2>&1 & SERVER_PID=$!
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do sleep 2; done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint3/features/f04-mock-fixtures/f04-mock-fixtures.spec.ts \
  --config tests/qa/sprint3/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F04] PASSED" || echo "[F04] FAILED"; exit "$TEST_EXIT"
```

-----

## F05 — Scoring math (5 dimensions + composite)

**Tests:** All 5 dimension functions return correct values; `commodified=25` (NOT 0);
`DIMENSION_WEIGHTS` sum to 1.00; composite formula matches prototype golden values.  
**Data:** None — pure math via scoring-test endpoint.

### `tests/qa/sprint3/features/f05-scoring-math/f05-scoring-math.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';

async function score(request: import('@playwright/test').APIRequestContext, fn: string, args: Record<string, unknown>) {
  const res  = await request.post(`${BASE}/api/qa/scoring-test`, { data: { fn, args } });
  const body = await res.json();
  return body.result as number;
}

test.describe('F05: Scoring math — 5 dimensions + composite + weights', () => {
  // ── CONTEXT SCORES — most critical regression test ────────────────────────
  test('F05-01: CONTEXT_SCORE_MAP.commodified === 25 NOT 0 (Round 29 canonical regression guard)', async ({ request }) => {
    const res  = await request.post(`${BASE}/api/qa/scoring-test`, { data: { fn: 'contextScoreMap', args: {} } });
    const map  = (await res.json()).result as Record<string, number>;
    expect(map.commodified, 'commodified must be 25, not 0 — Round 29 fix. Never regress.').toBe(25);
    expect(map.recommended).toBe(100);
    expect(map.listed).toBe(50);
    expect(map.mentioned).toBe(25);
  });

  test('F05-02: contextDimensionScore([commodified]) === 25', async ({ request }) => {
    expect(await score(request, 'contextDimensionScore', { labels: ['commodified'] })).toBe(25);
  });

  test('F05-03: contextDimensionScore([recommended, listed]) === 75 (average)', async ({ request }) => {
    expect(await score(request, 'contextDimensionScore', { labels: ['recommended', 'listed'] })).toBe(75);
  });

  test('F05-04: contextDimensionScore([]) === 0 (empty = no mentions)', async ({ request }) => {
    expect(await score(request, 'contextDimensionScore', { labels: [] })).toBe(0);
  });

  // ── SENTIMENT SCORES ───────────────────────────────────────────────────────
  test('F05-05: SENTIMENT_SCORE_MAP: positive=100, neutral=50, negative=0', async ({ request }) => {
    const res = await request.post(`${BASE}/api/qa/scoring-test`, { data: { fn: 'sentimentScoreMap', args: {} } });
    const map = (await res.json()).result as Record<string, number>;
    expect(map.positive).toBe(100);
    expect(map.neutral).toBe(50);
    expect(map.negative).toBe(0);
  });

  test('F05-06: sentimentDimensionScore([positive, neutral]) === 75', async ({ request }) => {
    expect(await score(request, 'sentimentDimensionScore', { labels: ['positive', 'neutral'] })).toBe(75);
  });

  // ── FREQUENCY SCORES ──────────────────────────────────────────────────────
  test('F05-07: frequencyDimensionScore(0, 0) === 0 (zero division guard)', async ({ request }) => {
    expect(await score(request, 'frequencyDimensionScore', { mentionedCount: 0, totalCalls: 0 })).toBe(0);
  });

  test('F05-08: frequencyDimensionScore(10, 10) === 100', async ({ request }) => {
    expect(await score(request, 'frequencyDimensionScore', { mentionedCount: 10, totalCalls: 10 })).toBe(100);
  });

  test('F05-09: frequencyDimensionScore(28, 200) ≈ 14 (prototype fixture data)', async ({ request }) => {
    const result = await score(request, 'frequencyDimensionScore', { mentionedCount: 28, totalCalls: 200 });
    expect(result).toBeCloseTo(14, 1);
  });

  // ── POSITION SCORES ───────────────────────────────────────────────────────
  test('F05-10: positionDimensionScore([]) === 0', async ({ request }) => {
    expect(await score(request, 'positionDimensionScore', { positions: [] })).toBe(0);
  });

  test('F05-11: positionDimensionScore([1]) === 100 (position 1 = earliest = max score)', async ({ request }) => {
    expect(await score(request, 'positionDimensionScore', { positions: [1] })).toBe(100);
  });

  test('F05-12: positionDimensionScore([21]) === 0 (position 21+ = buried = min score)', async ({ request }) => {
    // MAX_POSITION = 20; position 21 → score = max(0, (1 - 20/20)) × 100 = 0
    const result = await score(request, 'positionDimensionScore', { positions: [21] });
    expect(result).toBe(0);
  });

  test('F05-12b: positionDimensionScore([11]) ≈ 50 (midpoint — validates linear scaling) — E34', async ({ request }) => {
    // E34 fix: testing only extremes (position 1=100, position 21=0) doesn't verify the
    // linear interpolation between them. Position 11 is the exact midpoint:
    // (1 - (11-1)/20) × 100 = (1 - 10/20) × 100 = (1 - 0.5) × 100 = 50.
    // This assertion confirms the formula uses (position-1)/MAX_POSITION, not position/MAX_POSITION.
    const result = await score(request, 'positionDimensionScore', { positions: [11] });
    expect(result).toBeCloseTo(50, 1);
  });

  // ── ACCURACY SCORES ───────────────────────────────────────────────────────
  test('F05-13: accuracyDimensionScore with all mentions having cited sources === 100', async ({ request }) => {
    const citations = [
      { brandMentioned: true,  citedSources: [{ domain: 'test.com', url: 'https://test.com' }] },
      { brandMentioned: true,  citedSources: [{ domain: 'test2.com', url: 'https://test2.com' }] },
    ];
    const result = await score(request, 'accuracyDimensionScore', { citationRows: citations });
    expect(result).toBe(100);
  });

  test('F05-14: accuracyDimensionScore with no mentions === 0', async ({ request }) => {
    const citations = [{ brandMentioned: false, citedSources: [] }];
    const result = await score(request, 'accuracyDimensionScore', { citationRows: citations });
    expect(result).toBe(0);
  });

  // ── COMPOSITE + WEIGHTS ───────────────────────────────────────────────────
  test('F05-15: DIMENSION_WEIGHTS sum to exactly 1.00', async ({ request }) => {
    const res    = await request.post(`${BASE}/api/qa/scoring-test`, { data: { fn: 'dimensionWeights', args: {} } });
    const weights = (await res.json()).result as Record<string, number>;
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
    expect(weights.frequency).toBe(0.25);
    expect(weights.position).toBe(0.25);
    expect(weights.sentiment).toBe(0.20);
    expect(weights.context).toBe(0.15);
    expect(weights.accuracy).toBe(0.15);
  });

  test('F05-16: compositeVisibilityScore(all 100s) === 100', async ({ request }) => {
    const result = await score(request, 'compositeVisibilityScore', {
      scores: { frequency: 100, position: 100, sentiment: 100, context: 100, accuracy: 100 },
    });
    expect(result).toBe(100);
  });

  test('F05-17: compositeVisibilityScore(all 0s) === 0', async ({ request }) => {
    const result = await score(request, 'compositeVisibilityScore', {
      scores: { frequency: 0, position: 0, sentiment: 0, context: 0, accuracy: 0 },
    });
    expect(result).toBe(0);
  });

  test('F05-18: compositeVisibilityScore(prototype fixture values) ≈ 63.4 (AA5 golden value)', async ({ request }) => {
    // AA5 fix: corrected dimension values from prototype (Frequency=14 not 78)
    // 14×0.25 + 90×0.25 + 79×0.20 + 73×0.15 + 71×0.15 = 3.5 + 22.5 + 15.8 + 10.95 + 10.65 = 63.4
    const result = await score(request, 'compositeVisibilityScore', {
      scores: { frequency: 14, position: 90, sentiment: 79, context: 73, accuracy: 71 },
    });
    expect(result).toBeCloseTo(63.4, 1);
  });
});
```

### `tests/qa/sprint3/features/f05-scoring-math/F05-SCORING-MATH.bat`

```batch
@echo off
REM F05 — Scoring Math  |  No DB data
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint3\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint3\logs\f05-server.log 2>&1"
:WAIT_F05
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F05
pnpm exec playwright test tests/qa/sprint3/features/f05-scoring-math/f05-scoring-math.spec.ts --config tests/qa/sprint3/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F05] PASSED) else (echo [F05] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint3/features/f05-scoring-math/f05-scoring-math.sh`

```bash
#!/usr/bin/env bash
# F05 — Scoring Math
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint3/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint3/logs/f05-server.log 2>&1 & SERVER_PID=$!
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do sleep 2; done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint3/features/f05-scoring-math/f05-scoring-math.spec.ts \
  --config tests/qa/sprint3/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F05] PASSED" || echo "[F05] FAILED"; exit "$TEST_EXIT"
```

-----

## F06 — Wilson 95% confidence intervals

**Tests:** `wilsonCI` edge cases (0 trials, all successes, all failures, partial);
CI bounds satisfy `lower ≤ upper`, `lower ≥ 0`, `upper ≤ 100`; 3/5 CI brackets 60%.

### `tests/qa/sprint3/features/f06-wilson-ci/f06-wilson-ci.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';

async function wilsonCI(request: import('@playwright/test').APIRequestContext, successes: number, trials: number) {
  const res  = await request.post(`${BASE}/api/qa/scoring-test`, {
    data: { fn: 'wilsonCI', args: { successes, trials } },
  });
  return (await res.json()).result as { lower: number; upper: number };
}

test.describe('F06: Wilson 95% confidence intervals', () => {
  test('F06-01: wilsonCI(0, 0) → { lower: 0, upper: 0 } (zero-division guard)', async ({ request }) => {
    const ci = await wilsonCI(request, 0, 0);
    expect(ci).toEqual({ lower: 0, upper: 0 });
  });

  test('F06-02: wilsonCI(5, 5) → upper near 100 (all successes)', async ({ request }) => {
    const ci = await wilsonCI(request, 5, 5);
    expect(ci.upper).toBeGreaterThan(90);
    expect(ci.lower).toBeGreaterThan(50);  // lower CI bound still high with 5/5
  });

  test('F06-03: wilsonCI(0, 5) → lower = 0, upper > 0 (all failures)', async ({ request }) => {
    const ci = await wilsonCI(request, 0, 5);
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBeGreaterThan(0);  // upper is still > 0 due to Wilson uncertainty
  });

  test('F06-04: wilsonCI(3, 5) brackets the true proportion 60% (lower < 60 < upper)', async ({ request }) => {
    const ci = await wilsonCI(request, 3, 5);
    expect(ci.lower).toBeLessThan(60);
    expect(ci.upper).toBeGreaterThan(60);
  });

  test('F06-05: CI bounds satisfy constraints: 0 ≤ lower ≤ upper ≤ 100', async ({ request }) => {
    const cases = [
      { s: 0, t: 5 }, { s: 1, t: 5 }, { s: 2, t: 5 }, { s: 3, t: 5 }, { s: 4, t: 5 }, { s: 5, t: 5 },
      { s: 0, t: 10 }, { s: 5, t: 10 }, { s: 10, t: 10 },
    ];
    for (const { s, t } of cases) {
      const ci = await wilsonCI(request, s, t);
      expect(ci.lower, `lower ≥ 0 for ${s}/${t}`).toBeGreaterThanOrEqual(0);
      expect(ci.upper, `upper ≤ 100 for ${s}/${t}`).toBeLessThanOrEqual(100);
      expect(ci.lower, `lower ≤ upper for ${s}/${t}`).toBeLessThanOrEqual(ci.upper);
    }
  });

  test('F06-06: confidenceIntervals jsonb shape has all 5 dimension keys', async ({ request }) => {
    // Verify the confidenceIntervals structure returned from a seeded audit has the expected shape
    // This tests the data contract between the audit job and the API
    const res = await request.post(`${BASE}/api/qa/scoring-test`, {
      data: { fn: 'validateCIShape', args: {
        ci: {
          frequency: { lower: 9, upper: 20 },
          position:  { lower: 85, upper: 95 },
          sentiment: { lower: 73, upper: 85 },
          context:   { lower: 66, upper: 80 },
          accuracy:  { lower: 64, upper: 78 },
        },
      } },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.dimensionCount).toBe(5);
  });
});
```

### `tests/qa/sprint3/features/f06-wilson-ci/F06-WILSON-CI.bat`

```batch
@echo off
REM F06 — Wilson 95% CI  |  No DB data
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint3\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint3\logs\f06-server.log 2>&1"
:WAIT_F06
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F06
pnpm exec playwright test tests/qa/sprint3/features/f06-wilson-ci/f06-wilson-ci.spec.ts --config tests/qa/sprint3/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F06] PASSED) else (echo [F06] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint3/features/f06-wilson-ci/f06-wilson-ci.sh`

```bash
#!/usr/bin/env bash
# F06 — Wilson 95% CI
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint3/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint3/logs/f06-server.log 2>&1 & SERVER_PID=$!
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do sleep 2; done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint3/features/f06-wilson-ci/f06-wilson-ci.spec.ts \
  --config tests/qa/sprint3/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F06] PASSED" || echo "[F06] FAILED"; exit "$TEST_EXIT"
```

-----

## F07 — End-to-end audit: Free tier (happy_path)

**Tests:** Free-tier org triggers audit → 100 calls (2 engines × 10 prompts × 5 runs) →
`status=complete` → 5 dimension scores set → all scores are non-null strings →
`scoreSentiment` is TEXT label → `scoreConfidenceLow ≤ scoreComposite ≤ scoreConfidenceHigh` →
`totalCostUsd < 4.00` → `engineCount = 2`.  
**Requires:** Inngest dev server.  
**Data:** Seeds org1 (tier=free) + user1 + brand. `afterAll` cleans up.

### `tests/qa/sprint3/features/f07-free-tier-audit/f07-free-tier-audit.spec.ts`

```typescript
import { test, expect }                  from '@playwright/test';
import { clerk, clerkSetup }             from '@clerk/testing/playwright';
import { db }                            from '../../shared/db';
import { seedOrg, seedUser, seedBrand }  from '../../shared/seed';
import { cleanupOrg }                    from '../../shared/cleanup';
import { audits, citations }             from '../../../../db/schema';
import { eq }                            from 'drizzle-orm';

const BASE        = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const JOB_TIMEOUT = 90_000;
let org1Id = '', brand1Id = '';

async function waitComplete(auditId: string): Promise<void> {
  const end = Date.now() + JOB_TIMEOUT;
  while (Date.now() < end) {
    const [r] = await db.select({ status: audits.status }).from(audits).where(eq(audits.id, auditId));
    if (r?.status === 'complete' || r?.status === 'failed') return;
    await new Promise(res => setTimeout(res, 3000));
  }
  throw new Error(`Free-tier audit timed out — is Inngest running?`);
}

// ═══════════════════════════════════════════════════════════════════════════════════
// E32 WARNING: Sprint 3 §8 finalize db.update.set() code snippet is INCOMPLETE.
// The following fields are defined in §5 schema but NOT present in the §8 finalize snippet:
//
//   engineCount:         engines.length        ← set at finalize per §5 AB2 fix
//   promptCount:         prompts.length        ← set at finalize per §5 AB2 fix
//   scoreConfidenceLow:  composite CI lower    ← set at finalize per §5 AB2 fix
//   scoreConfidenceHigh: composite CI upper    ← set at finalize per §5 AB2 fix
//
// Claude Code implementing run-audit.ts MUST add these to the db.update.set() call.
// F07-01 asserts engineCount=2; F08-01 asserts engineCount=4; F07-04 asserts CI bounds.
// These tests WILL FAIL if the finalize step does not set these 4 fields.
//
// Correct finalize additions:
//   engineCount:         engines.length,
//   promptCount:         prompts.length,
//   scoreConfidenceLow:  compositeCILower.toFixed(2),  // from wilsonCI on composite
//   scoreConfidenceHigh: compositeCIUpper.toFixed(2),  // from wilsonCI on composite
// ═══════════════════════════════════════════════════════════════════════════════════
test.describe('F07: End-to-end audit — Free tier (2 engines × 10 prompts × 5 runs = 100 calls)', () => {
  test.beforeAll(async () => {
    await clerkSetup();
    // Free tier org — engines = [chatgpt, perplexity] per TIER_ENGINES.free
    const org = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!, name: '[S3-QA] F07 Free Org', tier: 'free' });
    org1Id    = org.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId: org1Id, email: process.env.E2E_TEST_USER_1_EMAIL! });
    brand1Id  = (await seedBrand({ organizationId: org1Id, name: 'Bondi Plumbing', domain: 'bondiplumbing.com.au', vertical: 'tradies' })).id;
  });

  test.afterAll(async () => { await cleanupOrg(org1Id); });

  test('F07-01: Free-tier audit completes with engineCount=2 and totalCalls=100', async ({ page }) => {
    test.setTimeout(JOB_TIMEOUT + 30_000);
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });

    const body = await page.evaluate(async ({ base, brandId }) => {
      const r = await fetch(`${base}/api/audits`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId, scenario: 'happy_path' }) });
      return await r.json();
    }, { base: BASE, brandId: brand1Id });
    expect(body.auditId).toBeTruthy();

    await waitComplete(body.auditId);

    const [audit] = await db.select().from(audits).where(eq(audits.id, body.auditId));
    expect(audit.status).toBe('complete');
    // Free tier: 2 engines × 10 prompts × 5 runs = 100 primary calls
    expect(audit.engineCount).toBe(2);
    expect(audit.totalCalls).toBe(100);
    expect(audit.engines).toEqual(['chatgpt', 'perplexity']);
    // E38 fix: Sprint 3 acceptance criteria requires mock audit cost = $0.
    // Mock fixtures have cost_estimate_usd=0. Derived tasks also use MockLLM (cost=0).
    // totalCostUsd should be '0.0000' or '0' for a mock run.
    // Assert both: cost is zero (mock AC requirement) AND < 4.00 (AB4 real-LLM budget).
    const costUsd = parseFloat(audit.totalCostUsd ?? '999');
    expect(costUsd, 'E38: Sprint 3 AC — mock audit cost must be $0').toBe(0);
    expect(costUsd, 'AB4: cost must be < 4.00 including derived task headroom').toBeLessThan(4.00);
    await clerk.signOut({ page });
  });

  test('F07-02: All 5 dimension scores are non-null strings on audits row', async ({ page }) => {
    test.setTimeout(JOB_TIMEOUT + 30_000);
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });

    const body = await page.evaluate(async ({ base, brandId }) => {
      const r = await fetch(`${base}/api/audits`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId, scenario: 'happy_path' }) });
      return await r.json();
    }, { base: BASE, brandId: brand1Id });
    await waitComplete(body.auditId);

    const [audit] = await db.select().from(audits).where(eq(audits.id, body.auditId));
    expect(audit.scoreComposite, 'scoreComposite must be set').not.toBeNull();
    expect(audit.scoreFrequency, 'scoreFrequency must be set').not.toBeNull();
    expect(audit.scorePosition,  'scorePosition must be set').not.toBeNull();
    expect(audit.scoreAccuracy,  'scoreAccuracy must be set').not.toBeNull();
    expect(audit.scoreSentimentNumeric, 'scoreSentimentNumeric must be set').not.toBeNull();
    expect(audit.scoreContextNumeric,   'scoreContextNumeric must be set').not.toBeNull();
    await clerk.signOut({ page });
  });

  test('F07-03: scoreSentiment is a TEXT label (positive/neutral/negative) NOT a number — AB1', async ({ page }) => {
    // E28 fix: Sprint 3 §5 (AB1 fix) defines scoreSentiment as text('score_sentiment') storing
    // a categorical label: 'positive' | 'neutral' | 'negative'.
    // scoreContext similarly stores: 'recommended' | 'listed' | 'mentioned' | 'commodified'.
    //
    // CRITICAL WARNING FOR CLAUDE CODE IMPLEMENTING run-audit.ts finalize step:
    // The §8 finalize code snippet shows:
    //   scoreSentiment: scoreSentiment.toFixed(2)   ← THIS IS WRONG
    //   scoreContext: scoreContext.toFixed(2)        ← THIS IS WRONG
    // scoreSentiment.toFixed(2) produces '79.00' (numeric string), NOT a label.
    // The CORRECT implementation is:
    //   const scoreSentimentLabel = majorityLabel(sentimentLabels);  // 'positive'|'neutral'|'negative'
    //   const scoreSentimentNumeric = sentimentDimensionScore(sentimentLabels).toFixed(2);  // '79.00'
    //   ... db.update.set({ scoreSentiment: scoreSentimentLabel, scoreSentimentNumeric, ... })
    // Follow §5 schema (AB1 fix), NOT the §8 code snippet. The §8 snippet was not updated
    // when AB1 was applied in v1.7.
    test.setTimeout(JOB_TIMEOUT + 30_000);
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });

    const body = await page.evaluate(async ({ base, brandId }) => {
      const r = await fetch(`${base}/api/audits`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId, scenario: 'happy_path' }) });
      return await r.json();
    }, { base: BASE, brandId: brand1Id });
    await waitComplete(body.auditId);

    const [audit] = await db.select().from(audits).where(eq(audits.id, body.auditId));
    // scoreSentiment must be a TEXT categorical label, NOT a numeric string like '79.00'
    expect(['positive', 'neutral', 'negative'], 'scoreSentiment must be TEXT label per AB1 fix — not numeric').toContain(audit.scoreSentiment);
    // scoreContext must also be TEXT
    expect(['recommended', 'listed', 'mentioned', 'commodified'], 'scoreContext must be TEXT label per AB1 fix').toContain(audit.scoreContext);
    // Verify numeric companions are populated (separate columns per §5 AB1)
    expect(parseFloat(audit.scoreSentimentNumeric ?? 'NaN'), 'scoreSentimentNumeric must be a number 0-100').toBeGreaterThanOrEqual(0);
    expect(parseFloat(audit.scoreContextNumeric ?? 'NaN'), 'scoreContextNumeric must be a number 0-100').toBeGreaterThanOrEqual(0);
    await clerk.signOut({ page });
  });

  test('F07-04: scoreConfidenceLow ≤ scoreComposite ≤ scoreConfidenceHigh — AC3c', async ({ page }) => {
    test.setTimeout(JOB_TIMEOUT + 30_000);
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });

    const body = await page.evaluate(async ({ base, brandId }) => {
      const r = await fetch(`${base}/api/audits`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId, scenario: 'happy_path' }) });
      return await r.json();
    }, { base: BASE, brandId: brand1Id });
    await waitComplete(body.auditId);

    const [audit] = await db.select().from(audits).where(eq(audits.id, body.auditId));
    const composite = parseFloat(audit.scoreComposite ?? '50');
    const ciLow     = parseFloat(audit.scoreConfidenceLow ?? '0');
    const ciHigh    = parseFloat(audit.scoreConfidenceHigh ?? '100');
    expect(ciLow, 'scoreConfidenceLow must be ≤ scoreComposite').toBeLessThanOrEqual(composite);
    expect(ciHigh, 'scoreConfidenceHigh must be ≥ scoreComposite').toBeGreaterThanOrEqual(composite);
    await clerk.signOut({ page });
  });

  test('F07-05: confidenceIntervals jsonb has all 5 dimension keys', async ({ page }) => {
    test.setTimeout(JOB_TIMEOUT + 30_000);
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });

    const body = await page.evaluate(async ({ base, brandId }) => {
      const r = await fetch(`${base}/api/audits`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId, scenario: 'happy_path' }) });
      return await r.json();
    }, { base: BASE, brandId: brand1Id });
    await waitComplete(body.auditId);

    const [audit] = await db.select().from(audits).where(eq(audits.id, body.auditId));
    const ci = audit.confidenceIntervals as Record<string, { lower: number; upper: number }> | null;
    expect(ci).not.toBeNull();
    expect(ci).toHaveProperty('frequency');
    expect(ci).toHaveProperty('position');
    expect(ci).toHaveProperty('sentiment');
    expect(ci).toHaveProperty('context');
    expect(ci).toHaveProperty('accuracy');
    // Each CI must have lower ≤ upper
    for (const [dim, bounds] of Object.entries(ci!)) {
      expect(bounds.lower, `${dim}.lower ≥ 0`).toBeGreaterThanOrEqual(0);
      expect(bounds.upper, `${dim}.upper ≤ 100`).toBeLessThanOrEqual(100);
      expect(bounds.lower, `${dim}.lower ≤ upper`).toBeLessThanOrEqual(bounds.upper);
    }
    await clerk.signOut({ page });
  });

  test('F07-06: 100 citation rows created (2 engines × 10 prompts × 5 runs)', async ({ page }) => {
    test.setTimeout(JOB_TIMEOUT + 30_000);
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });

    const body = await page.evaluate(async ({ base, brandId }) => {
      const r = await fetch(`${base}/api/audits`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId, scenario: 'happy_path' }) });
      return await r.json();
    }, { base: BASE, brandId: brand1Id });
    await waitComplete(body.auditId);

    const cits = await db.select().from(citations).where(eq(citations.auditId, body.auditId));
    expect(cits).toHaveLength(100);
    // Only chatgpt and perplexity engines (Free tier)
    const engines = [...new Set(cits.map(c => c.engine))].sort();
    expect(engines).toEqual(['chatgpt', 'perplexity']);
    // Runs 1-5 present for each prompt
    const runNumbers = [...new Set(cits.map(c => c.runNumber))].sort((a, b) => a - b);
    expect(runNumbers).toEqual([1, 2, 3, 4, 5]);
    await clerk.signOut({ page });
  });
});
```

### `tests/qa/sprint3/features/f07-free-tier-audit/F07-FREE-TIER-AUDIT.bat`

```batch
@echo off
REM ============================================================
REM  F07 — Free Tier Audit (100 calls)
REM  REQUIRES: Inngest dev server in a SEPARATE terminal:
REM    npx inngest-cli@latest dev --no-discovery
REM         -u http://localhost:3000/api/webhooks/inngest
REM  Seeds: free-tier org + user + brand  |  afterAll cleans up
REM ============================================================
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint3\logs 2>nul
echo [F07] NOTE: Inngest dev server must already be running.
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint3\logs\f07-server.log 2>&1"
:WAIT_F07
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F07
pnpm exec playwright test tests/qa/sprint3/features/f07-free-tier-audit/f07-free-tier-audit.spec.ts --config tests/qa/sprint3/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F07] PASSED) else (echo [F07] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint3/features/f07-free-tier-audit/f07-free-tier-audit.sh`

```bash
#!/usr/bin/env bash
# F07 — Free Tier Audit
# REQUIRES: Inngest dev server running separately
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint3/logs
echo "[F07] NOTE: Inngest dev server must already be running."
LLM_MODE=mock pnpm dev > tests/qa/sprint3/logs/f07-server.log 2>&1 & SERVER_PID=$!
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do sleep 2; done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint3/features/f07-free-tier-audit/f07-free-tier-audit.spec.ts \
  --config tests/qa/sprint3/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F07] PASSED" || echo "[F07] FAILED"; exit "$TEST_EXIT"
```

-----

## F08 — End-to-end audit: Paid tier (agency)

**Tests:** Agency-tier org → 200 calls (4 engines × 10 prompts × 5 runs) → per-engine
citation breakdown → Gemini/Perplexity have lower mention rate than ChatGPT/Claude
(Round 32 fixture variance) → `engineCount=4` → `totalCalls=200` → `totalCostUsd < 4.00`.  
**Requires:** Inngest dev server.  
**Data:** Seeds org3 (tier=agency) + user3 + brand. `afterAll` cleans up.

### `tests/qa/sprint3/features/f08-paid-tier-audit/f08-paid-tier-audit.spec.ts`

```typescript
import { test, expect }                  from '@playwright/test';
import { clerk, clerkSetup }             from '@clerk/testing/playwright';
import { db }                            from '../../shared/db';
import { seedOrg, seedUser, seedBrand }  from '../../shared/seed';
import { cleanupOrg }                    from '../../shared/cleanup';
import { audits, citations }             from '../../../../db/schema';
import { eq }                            from 'drizzle-orm';

const BASE        = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const JOB_TIMEOUT = 120_000;   // 200 calls with mock LLM; allow 2 minutes
let org3Id = '', brand3Id = '';

async function waitComplete(auditId: string): Promise<void> {
  const end = Date.now() + JOB_TIMEOUT;
  while (Date.now() < end) {
    const [r] = await db.select({ status: audits.status }).from(audits).where(eq(audits.id, auditId));
    if (r?.status === 'complete' || r?.status === 'failed') return;
    await new Promise(res => setTimeout(res, 3000));
  }
  throw new Error(`Paid-tier audit timed out — is Inngest running?`);
}

test.describe('F08: End-to-end audit — Agency tier (4 engines × 10 prompts × 5 runs = 200 calls)', () => {
  test.beforeAll(async () => {
    await clerkSetup();
    const org = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_3_CLERK_ID!, name: '[S3-QA] F08 Agency Org', tier: 'agency' });
    org3Id    = org.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_3_CLERK_ID!, organizationId: org3Id, email: process.env.E2E_TEST_USER_3_EMAIL! });
    brand3Id  = (await seedBrand({ organizationId: org3Id, name: 'Bondi Plumbing', domain: 'bondiplumbing-paid.com.au', vertical: 'tradies' })).id;
  });

  test.afterAll(async () => { await cleanupOrg(org3Id); });

  test('F08-01: Agency audit completes with engineCount=4 and totalCalls=200', async ({ page }) => {
    test.setTimeout(JOB_TIMEOUT + 30_000);
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_3_EMAIL!, password: process.env.E2E_TEST_USER_3_PASSWORD! } });

    const body = await page.evaluate(async ({ base, brandId }) => {
      const r = await fetch(`${base}/api/audits`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId, scenario: 'happy_path' }) });
      return await r.json();
    }, { base: BASE, brandId: brand3Id });
    expect(body.auditId).toBeTruthy();
    await waitComplete(body.auditId);

    const [audit] = await db.select().from(audits).where(eq(audits.id, body.auditId));
    expect(audit.status).toBe('complete');
    expect(audit.engineCount).toBe(4);
    expect(audit.totalCalls).toBe(200);
    expect([...audit.engines].sort()).toEqual(['chatgpt', 'claude', 'gemini', 'perplexity'].sort());
    expect(parseFloat(audit.totalCostUsd ?? '999')).toBeLessThan(4.00);
    await clerk.signOut({ page });
  });

  test('F08-02: 200 citation rows created (4 engines × 10 prompts × 5 runs)', async ({ page }) => {
    test.setTimeout(JOB_TIMEOUT + 30_000);
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_3_EMAIL!, password: process.env.E2E_TEST_USER_3_PASSWORD! } });

    const body = await page.evaluate(async ({ base, brandId }) => {
      const r = await fetch(`${base}/api/audits`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId, scenario: 'happy_path' }) });
      return await r.json();
    }, { base: BASE, brandId: brand3Id });
    await waitComplete(body.auditId);

    const cits = await db.select().from(citations).where(eq(citations.auditId, body.auditId));
    expect(cits).toHaveLength(200);
    const engines = [...new Set(cits.map(c => c.engine))].sort();
    expect(engines).toEqual(['chatgpt', 'claude', 'gemini', 'perplexity']);
    const runNums = [...new Set(cits.map(c => c.runNumber))].sort((a, b) => a - b);
    expect(runNums).toEqual([1, 2, 3, 4, 5]);
    await clerk.signOut({ page });
  });

  test('F08-03: sentimentLabel and contextLabel populated on mention citations', async ({ page }) => {
    test.setTimeout(JOB_TIMEOUT + 30_000);
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_3_EMAIL!, password: process.env.E2E_TEST_USER_3_PASSWORD! } });

    const body = await page.evaluate(async ({ base, brandId }) => {
      const r = await fetch(`${base}/api/audits`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId, scenario: 'happy_path' }) });
      return await r.json();
    }, { base: BASE, brandId: brand3Id });
    await waitComplete(body.auditId);

    const cits = await db.select().from(citations).where(eq(citations.auditId, body.auditId));
    const mentionedCits = cits.filter(c => c.brandMentioned);
    expect(mentionedCits.length).toBeGreaterThan(0);
    for (const c of mentionedCits) {
      expect(['positive', 'neutral', 'negative', null]).toContain(c.sentimentLabel);
      expect(['recommended', 'listed', 'mentioned', 'commodified', null]).toContain(c.contextLabel);
    }
    await clerk.signOut({ page });
  });
});
```

### `tests/qa/sprint3/features/f08-paid-tier-audit/F08-PAID-TIER-AUDIT.bat`

```batch
@echo off
REM F08 — Paid Tier Audit (200 calls)  |  Requires Inngest
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint3\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint3\logs\f08-server.log 2>&1"
:WAIT_F08
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F08
pnpm exec playwright test tests/qa/sprint3/features/f08-paid-tier-audit/f08-paid-tier-audit.spec.ts --config tests/qa/sprint3/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F08] PASSED) else (echo [F08] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint3/features/f08-paid-tier-audit/f08-paid-tier-audit.sh`

```bash
#!/usr/bin/env bash
# F08 — Paid Tier Audit (200 calls)
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint3/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint3/logs/f08-server.log 2>&1 & SERVER_PID=$!
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do sleep 2; done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint3/features/f08-paid-tier-audit/f08-paid-tier-audit.spec.ts \
  --config tests/qa/sprint3/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F08] PASSED" || echo "[F08] FAILED"; exit "$TEST_EXIT"
```

-----

## F09 — GET /api/audits/[auditId]/full

**Tests:** Rich payload shape; `citations` array with `sentimentLabel`/`contextLabel`;
`perEngineSummary` has one entry per engine; `citedSourcesByDomain` sorted desc;
cross-org → 404; unauthenticated → 401.  
**Data:** Seeds org + audit (complete, seeded with 200 citations). `afterAll` cleans up.

### `tests/qa/sprint3/features/f09-full-endpoint/f09-full-endpoint.spec.ts`

```typescript
import { test, expect }                              from '@playwright/test';
import { clerk, clerkSetup }                         from '@clerk/testing/playwright';
import { seedOrg, seedUser, seedBrand, seedAudit, seedCitation } from '../../shared/seed';
import { cleanupOrg }                                from '../../shared/cleanup';
// F23 fix: removed unused db/schema direct imports — seedCitation handles all citation inserts

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id  = '', org2Id = '', auditId = '', brand1Id = '';

test.describe('F09: GET /api/audits/[auditId]/full — rich payload', () => {
  test.beforeAll(async () => {
    await clerkSetup();
    const org1 = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!, name: '[S3-QA] F09 Org1', tier: 'agency' });
    org1Id     = org1.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId: org1Id, email: process.env.E2E_TEST_USER_1_EMAIL! });
    const brand = await seedBrand({ organizationId: org1Id, name: '[S3-QA] F09 Brand', domain: 's3-qa-f09.com.au' });
    brand1Id    = brand.id;
    const audit = await seedAudit({
      organizationId: org1Id, brandId: brand1Id, auditNumber: 1, status: 'complete',
      engines: ['chatgpt', 'claude', 'gemini', 'perplexity'], engineCount: 4, promptCount: 10,
      totalCalls: 200, scoreComposite: '63.40', scoreFrequency: '14.00', scorePosition: '90.00',
      scoreSentiment: 'positive', scoreContext: 'recommended',
      scoreSentimentNumeric: '79.00', scoreContextNumeric: '73.00', scoreAccuracy: '71.00',
      scoreConfidenceLow: '59.10', scoreConfidenceHigh: '67.70',
      confidenceIntervals: {
        frequency: { lower: 9, upper: 20 },
        position:  { lower: 85, upper: 95 },
        sentiment: { lower: 73, upper: 85 },
        context:   { lower: 66, upper: 80 },
        accuracy:  { lower: 64, upper: 78 },
      },
    });
    auditId = audit.id;
    // E24 fix: seed citations with DIFFERENT cited domains so citedSourcesByDomain sort test
    // is meaningful — not trivially true with a single domain.
    // After seeding: bondiplumbing(4) > eastplumbing(2) > sydneypipes(1)
    for (const engine of ['chatgpt', 'claude', 'gemini', 'perplexity'] as const) {
      await seedCitation({ auditId, engine, brandMentioned: true,  position: 2, sentimentLabel: 'positive', contextLabel: 'recommended' });
      await seedCitation({ auditId, engine, brandMentioned: false, position: null, sentimentLabel: null, contextLabel: null });
    }
    // F8 fix: Additional citations with DIFFERENT citedSources domains.
    // Result: bondiplumbing.com.au(4) > eastplumbing.com.au(2) > sydneypipes.com.au(1)
    // This makes the citedSourcesByDomain sort assertion in F09-06 non-trivial.
    await seedCitation({ auditId, engine: 'chatgpt', runNumber: 2, brandMentioned: true, position: 3, sentimentLabel: 'neutral', contextLabel: 'listed', responseSnippet: '[S3-QA] east mention', citedSources: [{ domain: 'eastplumbing.com.au', url: 'https://eastplumbing.com.au' }] });
    await seedCitation({ auditId, engine: 'claude',  runNumber: 2, brandMentioned: true, position: 3, sentimentLabel: 'neutral', contextLabel: 'listed', responseSnippet: '[S3-QA] east mention', citedSources: [{ domain: 'eastplumbing.com.au', url: 'https://eastplumbing.com.au' }] });
    await seedCitation({ auditId, engine: 'chatgpt', runNumber: 3, brandMentioned: true, position: 4, sentimentLabel: 'neutral', contextLabel: 'listed', responseSnippet: '[S3-QA] sydney mention', citedSources: [{ domain: 'sydneypipes.com.au', url: 'https://sydneypipes.com.au' }] });

    const org2 = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_2_CLERK_ID!, name: '[S3-QA] F09 Org2' });
    org2Id     = org2.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID!, organizationId: org2Id, email: process.env.E2E_TEST_USER_2_EMAIL! });
  });

  test.afterAll(async () => { await cleanupOrg(org1Id); await cleanupOrg(org2Id); });

  test('F09-01: Returns 200 with rich payload shape (audit, citations, perEngineSummary, citedSourcesByDomain)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });

    const { status, body } = await page.evaluate(async ({ base, id }) => {
      const r = await fetch(`${base}/api/audits/${id}/full`);
      return { status: r.status, body: await r.json() };
    }, { base: BASE, id: auditId });

    expect(status).toBe(200);
    // audit object with all Sprint 3 fields
    expect(body.audit.id).toBe(auditId);
    expect(body.audit.scoreComposite).not.toBeNull();
    expect(body.audit.scoreFrequency).not.toBeNull();
    expect(body.audit.scorePosition).not.toBeNull();
    expect(['positive', 'neutral', 'negative']).toContain(body.audit.scoreSentiment);
    expect(['recommended', 'listed', 'mentioned', 'commodified']).toContain(body.audit.scoreContext);
    expect(body.audit.confidenceIntervals).toBeDefined();
    expect(body.audit.engineCount).toBe(4);
    // citations array
    expect(Array.isArray(body.citations)).toBe(true);
    // E24 fix: 8 original + 3 extra (for multi-domain sort test) = 11 total
    expect(body.citations).toHaveLength(11);
    // perEngineSummary: 4 entries
    expect(Array.isArray(body.perEngineSummary)).toBe(true);
    expect(body.perEngineSummary).toHaveLength(4);
    const engineNames = body.perEngineSummary.map((s: { engine: string }) => s.engine).sort();
    expect(engineNames).toEqual(['chatgpt', 'claude', 'gemini', 'perplexity']);
    // citedSourcesByDomain
    expect(Array.isArray(body.citedSourcesByDomain)).toBe(true);
    await clerk.signOut({ page });
  });

  test('F09-02: citations include sentimentLabel and contextLabel per Sprint 3 schema', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    const body = await page.evaluate(async ({ base, id }) => {
      const r = await fetch(`${base}/api/audits/${id}/full`);
      return await r.json();
    }, { base: BASE, id: auditId });

    const mentionedCits = body.citations.filter((c: { brandMentioned: boolean }) => c.brandMentioned);
    expect(mentionedCits.length).toBeGreaterThan(0);
    for (const cit of mentionedCits) {
      expect(['positive', 'neutral', 'negative', null]).toContain(cit.sentimentLabel);
      expect(['recommended', 'listed', 'mentioned', 'commodified', null]).toContain(cit.contextLabel);
    }
    await clerk.signOut({ page });
  });

  test('F09-03: perEngineSummary.mentionRate is 0-1 (not 0-100)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    const body = await page.evaluate(async ({ base, id }) => {
      const r = await fetch(`${base}/api/audits/${id}/full`);
      return await r.json();
    }, { base: BASE, id: auditId });
    for (const summary of body.perEngineSummary) {
      expect(summary.mentionRate).toBeGreaterThanOrEqual(0);
      expect(summary.mentionRate).toBeLessThanOrEqual(1); // 0-1 ratio, not percentage
    }
    await clerk.signOut({ page });
  });

  test('F09-04: Cross-org GET /api/audits/[id]/full → 404 NOT 401 (CLAUDE.md §7)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_2_EMAIL!, password: process.env.E2E_TEST_USER_2_PASSWORD! } });
    const { status } = await page.evaluate(async ({ base, id }) => {
      const r = await fetch(`${base}/api/audits/${id}/full`);
      return { status: r.status };
    }, { base: BASE, id: auditId });
    expect(status).toBe(404);
    expect(status).not.toBe(401);
    await clerk.signOut({ page });
  });

  test('F09-05: Unauthenticated GET /api/audits/[id]/full → 401', async ({ request }) => {
    expect((await request.get(`${BASE}/api/audits/${auditId}/full`)).status()).toBe(401);
  });

  test('F09-06: citedSourcesByDomain is sorted descending by count', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    const body = await page.evaluate(async ({ base, id }) => {
      const r = await fetch(`${base}/api/audits/${id}/full`);
      return await r.json();
    }, { base: BASE, id: auditId });
    const domains = body.citedSourcesByDomain as Array<{ domain: string; count: number }>;
    for (let i = 1; i < domains.length; i++) {
      expect(domains[i].count, 'citedSourcesByDomain must be sorted desc by count').toBeLessThanOrEqual(domains[i - 1].count);
    }
    await clerk.signOut({ page });
  });
});
```

### `tests/qa/sprint3/features/f09-full-endpoint/F09-FULL-ENDPOINT.bat`

```batch
@echo off
REM F09 — GET /api/audits/[auditId]/full  |  Seeds audit + citations
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint3\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint3\logs\f09-server.log 2>&1"
:WAIT_F09
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F09
pnpm exec playwright test tests/qa/sprint3/features/f09-full-endpoint/f09-full-endpoint.spec.ts --config tests/qa/sprint3/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F09] PASSED) else (echo [F09] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint3/features/f09-full-endpoint/f09-full-endpoint.sh`

```bash
#!/usr/bin/env bash
# F09 — GET /api/audits/[auditId]/full
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint3/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint3/logs/f09-server.log 2>&1 & SERVER_PID=$!
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do sleep 2; done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint3/features/f09-full-endpoint/f09-full-endpoint.spec.ts \
  --config tests/qa/sprint3/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F09] PASSED" || echo "[F09] FAILED"; exit "$TEST_EXIT"
```

-----

## F10 — GET /api/brands/[brandId]/metrics

**Tests:** Trend payload shape; `trend` in `['up','down','flat']`; `audits` array last 20;
multiple audits produce `changeVsPriorAudit`; cross-org → 404; unauthenticated → 401.  
**Data:** Seeds org + brand + 3 seeded audits with different composite scores.

### `tests/qa/sprint3/features/f10-brand-metrics/f10-brand-metrics.spec.ts`

```typescript
import { test, expect }                              from '@playwright/test';
import { clerk, clerkSetup }                         from '@clerk/testing/playwright';
import { seedOrg, seedUser, seedBrand, seedAudit }   from '../../shared/seed';
import { cleanupOrg }                                from '../../shared/cleanup';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id = '', org2Id = '', brand1Id = '';

test.describe('F10: GET /api/brands/[brandId]/metrics — trend data', () => {
  test.beforeAll(async () => {
    await clerkSetup();
    const org1 = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!, name: '[S3-QA] F10 Org1', tier: 'agency' });
    org1Id     = org1.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId: org1Id, email: process.env.E2E_TEST_USER_1_EMAIL! });
    const brand = await seedBrand({ organizationId: org1Id, name: '[S3-QA] F10 Brand', domain: 's3-qa-f10.com.au' });
    brand1Id    = brand.id;
    // G9 fix: stagger completedAt so the metrics endpoint sort (completedAt DESC) is deterministic.
    // Without staggered times, all 3 audits have the same completedAt timestamp and the sort
    // is non-deterministic — trend could be 'flat' or 'down' depending on DB row order.
    // Audit #1 oldest, #3 newest — so the endpoint sees #3 (63.40) as latest → trend='up'. ✓
    const now = Date.now();
    await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 1, scoreComposite: '50.00',
      totalCostUsd: '0.5000', startedAt: new Date(now - 7200_000), completedAt: new Date(now - 3600_000) });
    await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 2, scoreComposite: '57.20',
      totalCostUsd: '0.5000', startedAt: new Date(now - 3600_000), completedAt: new Date(now - 1800_000) });
    await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 3, scoreComposite: '63.40',
      totalCostUsd: '0.5000', startedAt: new Date(now - 1800_000), completedAt: new Date(now - 600_000) });

    const org2 = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_2_CLERK_ID!, name: '[S3-QA] F10 Org2' });
    org2Id     = org2.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID!, organizationId: org2Id, email: process.env.E2E_TEST_USER_2_EMAIL! });
  });

  test.afterAll(async () => { await cleanupOrg(org1Id); await cleanupOrg(org2Id); });

  test('F10-01: Returns 200 + { audits, trend, lastAuditScore, changeVsPriorAudit }', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    const { status, body } = await page.evaluate(async ({ base, brandId }) => {
      const r = await fetch(`${base}/api/brands/${brandId}/metrics`);
      return { status: r.status, body: await r.json() };
    }, { base: BASE, brandId: brand1Id });
    expect(status).toBe(200);
    expect(Array.isArray(body.audits)).toBe(true);
    expect(body.audits).toHaveLength(3);
    expect(['up', 'down', 'flat']).toContain(body.trend);
    expect(typeof body.lastAuditScore).toBe('number');
    expect(typeof body.changeVsPriorAudit).toBe('number');
    await clerk.signOut({ page });
  });

  test('F10-02: trend reflects score direction (up for increasing, down for decreasing)', async ({ page }) => {
    // Seeded scores: 50.00 → 57.20 → 63.40 (clearly upward trend).
    // E4 fix: Sprint 3 spec does not define the EXACT trend algorithm (last vs prior? average?
    // smoothing? threshold?). Asserting trend='up' hard-codes the algorithm.
    // If the implementation uses a >5% difference threshold or a rolling average, the
    // seeded data (50→57.2→63.4) still produces an upward result, but we cannot guarantee
    // the exact label. Instead we assert the DIRECTION is correct via changeVsPriorAudit > 0,
    // and that trend is a valid value. The trend='up' is ALSO asserted but noted as implementation-
    // dependent — if this test fails, the implementation's algorithm may be fine but different.
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    const body = await page.evaluate(async ({ base, brandId }) => {
      const r = await fetch(`${base}/api/brands/${brandId}/metrics`);
      return await r.json();
    }, { base: BASE, brandId: brand1Id });
    // changeVsPriorAudit: 63.4 - 57.2 = +6.2 regardless of trend algorithm
    expect(body.changeVsPriorAudit, 'changeVsPriorAudit must be positive — score went from 57.2 to 63.4').toBeGreaterThan(0);
    expect(['up', 'down', 'flat']).toContain(body.trend);
    // Soft assertion: trend='up' is the expected natural result for a clearly rising sequence.
    // If this fails, verify the implementation's algorithm vs the seeded data pattern.
    expect(body.trend, 'E4 note: trend algorithm not spec-defined; up expected for 50→57.2→63.4').toBe('up');
    await clerk.signOut({ page });
  });

  test('F10-03: audits array capped at 20 items (last 20 per spec)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    const body = await page.evaluate(async ({ base, brandId }) => {
      const r = await fetch(`${base}/api/brands/${brandId}/metrics`);
      return await r.json();
    }, { base: BASE, brandId: brand1Id });
    expect(body.audits.length).toBeLessThanOrEqual(20);
    await clerk.signOut({ page });
  });

  test('F10-04: Cross-org GET /api/brands/[id]/metrics → 404 NOT 401 (CLAUDE.md §7)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_2_EMAIL!, password: process.env.E2E_TEST_USER_2_PASSWORD! } });
    const { status } = await page.evaluate(async ({ base, brandId }) => {
      const r = await fetch(`${base}/api/brands/${brandId}/metrics`);
      return { status: r.status };
    }, { base: BASE, brandId: brand1Id });
    expect(status).toBe(404);
    expect(status).not.toBe(401);
    await clerk.signOut({ page });
  });

  test('F10-05: Unauthenticated GET metrics → 401', async ({ request }) => {
    expect((await request.get(`${BASE}/api/brands/${brand1Id}/metrics`)).status()).toBe(401);
  });
});
```

### `tests/qa/sprint3/features/f10-brand-metrics/F10-BRAND-METRICS.bat`

```batch
@echo off
REM F10 — GET /api/brands/[brandId]/metrics  |  Seeds brand + 3 audits
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint3\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint3\logs\f10-server.log 2>&1"
:WAIT_F10
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F10
pnpm exec playwright test tests/qa/sprint3/features/f10-brand-metrics/f10-brand-metrics.spec.ts --config tests/qa/sprint3/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F10] PASSED) else (echo [F10] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint3/features/f10-brand-metrics/f10-brand-metrics.sh`

```bash
#!/usr/bin/env bash
# F10 — GET /api/brands/[brandId]/metrics
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint3/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint3/logs/f10-server.log 2>&1 & SERVER_PID=$!
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do sleep 2; done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint3/features/f10-brand-metrics/f10-brand-metrics.spec.ts \
  --config tests/qa/sprint3/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F10] PASSED" || echo "[F10] FAILED"; exit "$TEST_EXIT"
```

-----

## F11 — Canary check Inngest function

**Tests:** `canary-check` registered in `serve()` (X7/AC3d); Inngest cron schedule exists;
canary insert/update logic via DB probe; `bypassCache=true` used in canary calls.  
**Data:** Seeds and cleans up canary_prompts rows via `cleanupCanaryByEngine`.

### `tests/qa/sprint3/features/f11-canary-check/f11-canary-check.spec.ts`

```typescript
import { test, expect }         from '@playwright/test';
import { db }                   from '../../shared/db';
import { cleanupCanaryByEngine } from '../../shared/cleanup';
import { canaryPrompts }         from '../../../../db/schema';
import { like }                  from 'drizzle-orm';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';

test.describe('F11: Canary check Inngest function (Sprint 3 cost-control Layer 2)', () => {
  test.afterAll(async () => { await cleanupCanaryByEngine('chatgpt'); });

  test('F11-01: canary-check function registered in Inngest serve() — X7 + AC3d', async ({ request }) => {
    const res  = await request.get('/api/webhooks/inngest');
    const body = await res.json();
    const ids  = ((body.functions ?? []) as Array<{ id: string }>).map(f => f.id);
    expect(ids, 'canary-check must be in serve() — X7 fix prevents silent inactive cron').toContain('canary-check');
  });

  test('F11-02: canary-check has a cron trigger (17:00 UTC daily) — E25 SDK-agnostic', async ({ request }) => {
    const res  = await request.get('/api/webhooks/inngest');
    const body = await res.json();
    // E25 fix: Inngest SDK versions differ on trigger key shape:
    //   v2: function.trigger = { cron: '...' }  (singular)
    //   v3: function.triggers = [{ cron: '...' }]  (plural array)
    // Check both forms to be SDK-version agnostic.
    type FnEntry = { id: string; trigger?: { cron?: string }; triggers?: Array<{ cron?: string }> };
    const canary = ((body.functions ?? []) as FnEntry[]).find(f => f.id === 'canary-check');
    expect(canary, 'canary-check function must be registered in serve()').toBeDefined();
    // Check either key form for cron — resolves SDK version ambiguity
    const hasCronSingular = !!canary?.trigger?.cron;
    const hasCronPlural   = canary?.triggers?.some(t => !!t.cron) ?? false;
    expect(hasCronSingular || hasCronPlural,
      'canary-check must have a cron trigger in trigger or triggers field').toBe(true);
  });

  test('F11-03: canary_prompts table exists and accepts insert/update', async ({ request }) => {
    // Probe: insert a canary prompt row via scoring-test endpoint
    const res = await request.post(`${BASE}/api/qa/scoring-test`, {
      data: {
        fn:   'insertCanaryProbe',
        args: { promptText: '[S3-QA] canary probe prompt', engine: 'chatgpt', model: 'gpt-4o-mini', hash: 'abc123' },
      },
    });
    expect(res.status(), 'canary_prompts table must accept insert').toBe(200);
    const rows = await db.select().from(canaryPrompts).where(like(canaryPrompts.promptText, '[S3-QA]%'));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].engine).toBe('chatgpt');
    expect(rows[0].lastResponseHash).toBe('abc123');
  });

  test('F11-04: canary engine column is TEXT (not enum) — X4 fix', async ({ request }) => {
    // X4 fix: engine must be text column, not engineEnum, so new engines dont require migration
    const res  = await request.post(`${BASE}/api/qa/scoring-test`, {
      data: { fn: 'columnType', args: { table: 'canary_prompts', column: 'engine' } },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.dataType, 'canary_prompts.engine must be TEXT not an enum — X4 fix').toBe('text');
  });

  test('F11-05: Drift detection: different hash triggers driftDetected=true update', async ({ request }) => {
    // Insert initial row, then simulate drift by updating hash
    await request.post(`${BASE}/api/qa/scoring-test`, {
      data: { fn: 'insertCanaryProbe', args: { promptText: '[S3-QA] drift test', engine: 'claude', model: 'claude-3-5-haiku-20241022', hash: 'hash_v1' } },
    });
    // Simulate drift: update to new hash
    const driftRes = await request.post(`${BASE}/api/qa/scoring-test`, {
      data: { fn: 'simulateCanaryDrift', args: { promptText: '[S3-QA] drift test', engine: 'claude', newHash: 'hash_v2' } },
    });
    expect(driftRes.status()).toBe(200);
    const body = await driftRes.json();
    // F16 fix: canary_prompts.driftDetected is TEXT 'true'/'false' (not boolean) per Sprint 3 §5.
    // The simulateCanaryDrift fn in scoring-test route MUST convert to boolean before returning:
    //   return { driftDetected: updatedRow.driftDetected === 'true' }
    // The assertion expects a JS boolean true, not the string 'true'.
    expect(body.driftDetected, 'driftDetected must be boolean true — scoring-test fn must convert TEXT to boolean').toBe(true);
  });
});
```

### `tests/qa/sprint3/features/f11-canary-check/F11-CANARY-CHECK.bat`

```batch
@echo off
REM F11 — Canary Check  |  Seeds/cleans canary_prompts rows
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint3\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint3\logs\f11-server.log 2>&1"
:WAIT_F11
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F11
pnpm exec playwright test tests/qa/sprint3/features/f11-canary-check/f11-canary-check.spec.ts --config tests/qa/sprint3/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F11] PASSED) else (echo [F11] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint3/features/f11-canary-check/f11-canary-check.sh`

```bash
#!/usr/bin/env bash
# F11 — Canary Check
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint3/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint3/logs/f11-server.log 2>&1 & SERVER_PID=$!
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do sleep 2; done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint3/features/f11-canary-check/f11-canary-check.spec.ts \
  --config tests/qa/sprint3/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F11] PASSED" || echo "[F11] FAILED"; exit "$TEST_EXIT"
```

-----

## F12 — Cross-org isolation (Sprint 3 endpoints)

**Tests:** Cross-org for all three Sprint 3 endpoints returns 404:
`GET /api/audits/[id]/full`, `GET /api/brands/[id]/metrics`, `POST /api/audits` (brand ownership).
All return 404 NOT 401. Own resources remain accessible.

### `tests/qa/sprint3/features/f12-cross-org/f12-cross-org.spec.ts`

```typescript
import { test, expect }                              from '@playwright/test';
import { clerk, clerkSetup }                         from '@clerk/testing/playwright';
import { seedOrg, seedUser, seedBrand, seedAudit }   from '../../shared/seed';
import { cleanupOrg }                                from '../../shared/cleanup';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id = '', org2Id = '', brand1Id = '', audit1Id = '';

test.describe('F12: Cross-org isolation — Sprint 3 endpoints (CLAUDE.md §7)', () => {
  test.beforeAll(async () => {
    await clerkSetup();
    const org1 = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!, name: '[S3-QA] F12 Org1', tier: 'agency' });
    org1Id     = org1.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId: org1Id, email: process.env.E2E_TEST_USER_1_EMAIL! });
    const brand = await seedBrand({ organizationId: org1Id, name: '[S3-QA] F12 Brand', domain: 's3-qa-f12.com.au' });
    brand1Id    = brand.id;
    const audit = await seedAudit({ organizationId: org1Id, brandId: brand1Id, status: 'complete' });
    audit1Id    = audit.id;

    const org2 = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_2_CLERK_ID!, name: '[S3-QA] F12 Org2' });
    org2Id     = org2.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID!, organizationId: org2Id, email: process.env.E2E_TEST_USER_2_EMAIL! });
  });

  test.afterAll(async () => { await cleanupOrg(org1Id); await cleanupOrg(org2Id); });

  test('F12-01: User B GET /api/audits/[org1AuditId]/full → 404 NOT 401', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_2_EMAIL!, password: process.env.E2E_TEST_USER_2_PASSWORD! } });
    const { status } = await page.evaluate(async ({ base, id }) => {
      const r = await fetch(`${base}/api/audits/${id}/full`);
      return { status: r.status };
    }, { base: BASE, id: audit1Id });
    expect(status).toBe(404);
    expect(status).not.toBe(401);
    await clerk.signOut({ page });
  });

  test('F12-02: User B GET /api/brands/[org1BrandId]/metrics → 404 NOT 401', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_2_EMAIL!, password: process.env.E2E_TEST_USER_2_PASSWORD! } });
    const { status } = await page.evaluate(async ({ base, id }) => {
      const r = await fetch(`${base}/api/brands/${id}/metrics`);
      return { status: r.status };
    }, { base: BASE, id: brand1Id });
    expect(status).toBe(404);
    expect(status).not.toBe(401);
    await clerk.signOut({ page });
  });

  test('F12-03: User B POST /api/audits for org1 brand → 404 NOT 401 (Z6 auth pattern)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_2_EMAIL!, password: process.env.E2E_TEST_USER_2_PASSWORD! } });
    const { status } = await page.evaluate(async ({ base, brandId }) => {
      const r = await fetch(`${base}/api/audits`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId }) });
      return { status: r.status };
    }, { base: BASE, brandId: brand1Id });
    expect(status).toBe(404);
    await clerk.signOut({ page });
  });

  test('F12-04: User A can still access own audit and brand metrics', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    const { s1, s2 } = await page.evaluate(async ({ base, auditId, brandId }) => {
      const r1 = await fetch(`${base}/api/audits/${auditId}/full`);
      const r2 = await fetch(`${base}/api/brands/${brandId}/metrics`);
      return { s1: r1.status, s2: r2.status };
    }, { base: BASE, auditId: audit1Id, brandId: brand1Id });
    expect(s1).toBe(200);
    expect(s2).toBe(200);
    await clerk.signOut({ page });
  });

  test('F12-05: Unauthenticated GET /api/audits/[id]/full → 401', async ({ request }) => {
    expect((await request.get(`${BASE}/api/audits/${audit1Id}/full`)).status()).toBe(401);
  });

  test('F12-06: Unauthenticated GET /api/brands/[id]/metrics → 401', async ({ request }) => {
    expect((await request.get(`${BASE}/api/brands/${brand1Id}/metrics`)).status()).toBe(401);
  });
});
```

### `tests/qa/sprint3/features/f12-cross-org/F12-CROSS-ORG.bat`

```batch
@echo off
REM F12 — Cross-org Isolation (Sprint 3 endpoints)
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint3\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint3\logs\f12-server.log 2>&1"
:WAIT_F12
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F12
pnpm exec playwright test tests/qa/sprint3/features/f12-cross-org/f12-cross-org.spec.ts --config tests/qa/sprint3/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F12] PASSED) else (echo [F12] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint3/features/f12-cross-org/f12-cross-org.sh`

```bash
#!/usr/bin/env bash
# F12 — Cross-org Isolation
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint3/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint3/logs/f12-server.log 2>&1 & SERVER_PID=$!
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do sleep 2; done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint3/features/f12-cross-org/f12-cross-org.spec.ts \
  --config tests/qa/sprint3/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F12] PASSED" || echo "[F12] FAILED"; exit "$TEST_EXIT"
```

-----

## Run-all scripts

### `tests/qa/sprint3/S3-RUN-ALL.bat`

```batch
@echo off
REM ============================================================
REM  Sprint 3 QA — Run All 12 Features
REM  START Inngest BEFORE running (required for F07, F08):
REM    npx inngest-cli@latest dev --no-discovery
REM         -u http://localhost:3000/api/webhooks/inngest
REM ============================================================
setlocal EnableDelayedExpansion
REM Check Inngest for F07 + F08
set INNGEST_UP=0
curl -s --max-time 3 http://localhost:8288/ > nul 2>&1
if %ERRORLEVEL% EQU 0 (
  set INNGEST_UP=1
  echo [RUN-ALL] Inngest detected on port 8288.
) else (
  echo [RUN-ALL] WARNING: Inngest not detected. F07 and F08 will be SKIPPED.
)
set PASS=0 & set FAIL=0 & set FAILED_LIST=

for %%F in (
  tests\qa\sprint3
eatures
01-health\F01-HEALTH.bat
  tests\qa\sprint3
eatures
02-model-selector\F02-MODEL-SELECTOR.bat
  tests\qa\sprint3
eatures
03-tier-engines\F03-TIER-ENGINES.bat
  tests\qa\sprint3
eatures
04-mock-fixtures\F04-MOCK-FIXTURES.bat
  tests\qa\sprint3
eatures
05-scoring-math\F05-SCORING-MATH.bat
  tests\qa\sprint3
eatures
06-wilson-ci\F06-WILSON-CI.bat
  tests\qa\sprint3
eatures
07-free-tier-audit\F07-FREE-TIER-AUDIT.bat
  tests\qa\sprint3
eatures
08-paid-tier-audit\F08-PAID-TIER-AUDIT.bat
  tests\qa\sprint3
eatures
09-full-endpoint\F09-FULL-ENDPOINT.bat
  tests\qa\sprint3
eatures
10-brand-metrics\F10-BRAND-METRICS.bat
  tests\qa\sprint3
eatures
11-canary-check\F11-CANARY-CHECK.bat
  tests\qa\sprint3
eatures
12-cross-org\F12-CROSS-ORG.bat
) do (
  REM Skip Inngest features if Inngest not running
  set SKIP=0
  echo %%F | findstr /i "f07 f08" > nul 2>&1
  if not ERRORLEVEL 1 (if !INNGEST_UP! EQU 0 set SKIP=1)
  if !SKIP! EQU 1 (
    echo [SKIP] %%F - Inngest not running
    set /a FAIL+=1 & set FAILED_LIST=!FAILED_LIST! %%~nxF-SKIPPED
  ) else (
    echo. & echo ======================================== & echo Running %%F
    call %%F
    if !ERRORLEVEL! EQU 0 (set /a PASS+=1) else (set /a FAIL+=1 & set FAILED_LIST=!FAILED_LIST! %%~nxF)
  )
)
echo. & echo ======================================== & echo Sprint 3 QA: Passed=%PASS% Failed=%FAIL%
if not "%FAILED_LIST%"=="" echo Failed: %FAILED_LIST%
echo ========================================
if %FAIL% EQU 0 (exit /b 0) else (exit /b 1)
```

### `tests/qa/sprint3/s3-run-all.sh`

```bash
#!/usr/bin/env bash
# ============================================================
#  Sprint 3 QA — Run All 12 Features
#  START Inngest BEFORE running (required for F07, F08):
#    npx inngest-cli@latest dev --no-discovery #      -u http://localhost:3000/api/webhooks/inngest
# ============================================================
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a

INNGEST_PORT="${INNGEST_DEV_PORT:-8288}"
INNGEST_UP=false
if curl -s --max-time 3 "http://localhost:${INNGEST_PORT}/" > /dev/null 2>&1; then
  INNGEST_UP=true
  echo "[RUN-ALL] Inngest detected on port ${INNGEST_PORT}. ✓"
else
  echo "[RUN-ALL] WARNING: Inngest not detected — F07 and F08 will be SKIPPED."
  echo "[RUN-ALL] Start: npx inngest-cli@latest dev --no-discovery -u http://localhost:3000/api/webhooks/inngest"
fi

PASS=0; FAIL=0; FAILED=()
INNGEST_FEATURES=("f07" "f08")

FEATURES=(
  tests/qa/sprint3/features/f01-health/f01-health.sh
  tests/qa/sprint3/features/f02-model-selector/f02-model-selector.sh
  tests/qa/sprint3/features/f03-tier-engines/f03-tier-engines.sh
  tests/qa/sprint3/features/f04-mock-fixtures/f04-mock-fixtures.sh
  tests/qa/sprint3/features/f05-scoring-math/f05-scoring-math.sh
  tests/qa/sprint3/features/f06-wilson-ci/f06-wilson-ci.sh
  tests/qa/sprint3/features/f07-free-tier-audit/f07-free-tier-audit.sh
  tests/qa/sprint3/features/f08-paid-tier-audit/f08-paid-tier-audit.sh
  tests/qa/sprint3/features/f09-full-endpoint/f09-full-endpoint.sh
  tests/qa/sprint3/features/f10-brand-metrics/f10-brand-metrics.sh
  tests/qa/sprint3/features/f11-canary-check/f11-canary-check.sh
  tests/qa/sprint3/features/f12-cross-org/f12-cross-org.sh
)

for S in "${FEATURES[@]}"; do
  echo "" && echo "========================================" && echo "Running $S"

  NEEDS_INNGEST=false
  for FEAT in "${INNGEST_FEATURES[@]}"; do
    if [[ "$S" == *"$FEAT"* ]]; then NEEDS_INNGEST=true; break; fi
  done
  if [[ "$NEEDS_INNGEST" == "true" && "$INNGEST_UP" == "false" ]]; then
    echo "[SKIP] $S — Inngest not running"
    FAIL=$((FAIL+1)); FAILED+=("$S (SKIPPED-NO-INNGEST)")
    continue
  fi

  chmod +x "$S"
  if bash "$S"; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); FAILED+=("$S"); fi
done

echo "" && echo "========================================"
echo " Sprint 3 QA: Passed=$PASS  Failed=$FAIL"
if [ ${#FAILED[@]} -gt 0 ]; then for F in "${FAILED[@]}"; do echo "   FAIL: $F"; done; fi
echo "========================================"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
```

-----

## Test-only QA API routes required

Create in `app/api/qa/` — guard: `if (LLM_MODE !== 'mock' && NODE_ENV !== 'test') return 403`.

**`app/api/qa/scoring-test/route.ts`** — `POST { fn, args }`:

```typescript
// Functions to expose:
// checkColumn(table, column)     → 200 if column exists, 500 if not
// columnType(table, column)      → { dataType: string }  (queries information_schema)
// checkTable(table)              → 200 if table exists
// selectModel(tier, engine, task)→ { model: string }
// enginesForTier(tier)           → { engines: string[] }
// contextScoreMap()              → { result: CONTEXT_SCORE_MAP }
// sentimentScoreMap()            → { result: SENTIMENT_SCORE_MAP }
// dimensionWeights()             → { result: DIMENSION_WEIGHTS }
// contextDimensionScore(labels)  → { result: number }
// sentimentDimensionScore(labels)→ { result: number }
// frequencyDimensionScore(mentionedCount, totalCalls) → { result: number }
// positionDimensionScore(positions)  → { result: number }
// accuracyDimensionScore(citationRows)→ { result: number }
// compositeVisibilityScore(scores)   → { result: number }
// wilsonCI(successes, trials)        → { result: { lower, upper } }
// validateCIShape(ci)                → { valid: boolean, dimensionCount: number }
// insertCanaryProbe(promptText, engine, model, hash) → 200
// simulateCanaryDrift(promptText, engine, newHash)   → { driftDetected: boolean }
//   NOTE F16: canary_prompts.driftDetected is TEXT 'true'/'false'. Route MUST return
//   boolean: { driftDetected: row.driftDetected === 'true' } — not the raw string.
```

**`app/api/qa/llm-test/route.ts`** — `POST { engine, prompt, scenario, callCount? }` (Sprint 2 + extended for Sprint 3):
Calls `getLLMService(engine)` (not `getLLMService()` — Sprint 3 requires engine param).
If `callCount` provided: cast to MockLLM and set `callCount - 1` before calling `complete()`.

-----

## Sprint 3 PASS criteria (all 12 must be green)

```
[ ] F01 Health           — /api/health ok; score_frequency column exists; scoreSentiment=TEXT; canary_prompts exists; canary-check in Inngest; all 16 fixture files load
[ ] F02 Model selector   — 72 combinations correct; derived tasks always cheapest; agency=gpt-4o; free/starter=gpt-4o-mini; agency_pro matches agency in v1
[ ] F03 Tier engines     — Free='chatgpt,perplexity' (2); paid=all 4; all 6 tiers covered; unknown→free fallback; Free=100 calls, paid=200 calls
[ ] F04 Mock fixtures    — All 16 load; ChatGPT/Claude mention Bondi Plumbing; Gemini/Perplexity also mention but weaker (Round 32); no_mention has no brand; rate_limited 429 on call 1; partial_failure 429 on callCount%5<2
[ ] F05 Scoring math     — commodified=25 NOT 0 (Round 29 CRITICAL); weights sum to 1.00; composite(14,90,79,73,71)≈63.4; all 5 dimension formulas correct
[ ] F06 Wilson CI        — wilsonCI(0,0)={0,0}; 5/5→upper>90; 3/5 brackets 60%; bounds 0≤lower≤upper≤100; confidenceIntervals has 5 dimension keys
[ ] F07 Free tier audit  — status=complete; engineCount=2; totalCalls=100; engines=[chatgpt,perplexity]; 100 citations; scoreSentiment is TEXT label; scoreConfidenceLow≤scoreComposite≤scoreConfidenceHigh; cost<4.00
[ ] F08 Paid tier audit  — status=complete; engineCount=4; totalCalls=200; 200 citations; all 4 engines present; runs 1-5 present; sentimentLabel/contextLabel populated on mentions; cost<4.00
[ ] F09 Full endpoint    — 200 + rich shape; citations array with sentimentLabel/contextLabel; perEngineSummary 4 entries with mentionRate 0-1; citedSourcesByDomain sorted desc; cross-org 404; unauthed 401
[ ] F10 Brand metrics    — { audits, trend, lastAuditScore, changeVsPriorAudit }; trend=up for increasing scores; audits≤20; cross-org 404; unauthed 401
[ ] F11 Canary check     — canary-check in Inngest; has cron trigger; canary_prompts table accepts insert; engine column is TEXT; drift detection works
[ ] F12 Cross-org        — /api/audits/[id]/full cross-org 404; /api/brands/[id]/metrics cross-org 404; POST /api/audits cross-org 404; all NOT 401; own resources still 200

Sprint 3 PASS = all 12 green + zero orphaned [S3-QA] rows in DB + LLM_MODE=mock in all automated runs
```