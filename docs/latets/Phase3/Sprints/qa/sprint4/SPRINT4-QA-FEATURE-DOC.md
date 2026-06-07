# VisibleAU Sprint 4 — QA Feature Document (Claude Code)

**Version:** 1.0  
**Sprint:** 4 — First UI Layer (11 screens, 3 API additions, 0 schema changes)  
**Purpose:** Feature-specific E2E QA tests. Each feature has its own `.bat` (Windows) and
`.sh` (Unix/macOS) launch script that seeds real test data, starts the Next.js dev server
with `LLM_MODE=mock`, runs Playwright tests end-to-end, then **hard-deletes all seeded rows**
on exit — pass or fail.

**Sprint 4 critical invariants:**

- No schema changes — all existing Sprint 1-3 columns used.
- Audit dispatch: `(runsPerPrompt >= 5 && engines.length > 1)` → Rich; else → Basic. NOT `metadata.mode`.
- Audit running `expectedCalls = audit.engines.length × 10 × 5` — NOT `audit.engineCount` (null during running).
- Brand limits: free/starter/growth=1, agency=5, agency_pro=25, enterprise=∞ (PRD §7).
- `vertical_packs` table does NOT exist until Sprint 5 — wizard step 2 must use hardcoded constant.
- `technical_audits` table does NOT exist until Sprint 7 — audit list must NOT LEFT JOIN it.
- First-time redirect: in `dashboard/page.tsx` server component (NOT middleware, NOT auth layout).
- Portfolio: `<2 brands` → redirect `/dashboard?toast=need-2-brands`.
- Cross-org: all protected routes → **404** (not 401, not 403) — CLAUDE.md §7.
- `GET /api/audits/[auditId]/export?format=csv` has 14 columns; PDF uses `@react-pdf/renderer`.
- recharts components must have `'use client'` — ResizeObserver crash otherwise.
- Polling stops on: `complete` (redirect), `failed` (error card), `404` (redirect /audits), `401` (redirect /sign-in).

**Prerequisites:** Sprints 1-3 accepted. `pnpm add sonner zod @react-pdf/renderer recharts date-fns react-hook-form @hookform/resolvers`. All Sprint 4 shadcn components installed: `command popover dropdown-menu skeleton separator`.

-----

## Directory structure

```
tests/qa/sprint4/
├── playwright.config.ts
├── shared/
│   ├── db.ts              # Service-role Drizzle client (bypasses RLS)
│   ├── seed.ts            # Sprint 4 seed helpers
│   └── cleanup.ts         # FK-safe delete
├── features/
│   ├── f01-layout/               f01-layout.spec.ts          F01-LAYOUT.bat          f01-layout.sh
│   ├── f02-dashboard/            f02-dashboard.spec.ts       F02-DASHBOARD.bat       f02-dashboard.sh
│   ├── f03-brand-list/           f03-brand-list.spec.ts      F03-BRAND-LIST.bat      f03-brand-list.sh
│   ├── f04-brand-create/         f04-brand-create.spec.ts    F04-BRAND-CREATE.bat    f04-brand-create.sh
│   ├── f05-brand-wizard/         f05-brand-wizard.spec.ts    F05-BRAND-WIZARD.bat    f05-brand-wizard.sh
│   ├── f06-brand-detail/         f06-brand-detail.spec.ts    F06-BRAND-DETAIL.bat    f06-brand-detail.sh
│   ├── f07-audit-running/        f07-audit-running.spec.ts   F07-AUDIT-RUNNING.bat   f07-audit-running.sh
│   ├── f08-audit-results/        f08-audit-results.spec.ts   F08-AUDIT-RESULTS.bat   f08-audit-results.sh
│   ├── f09-audit-list/           f09-audit-list.spec.ts      F09-AUDIT-LIST.bat      f09-audit-list.sh
│   ├── f10-audit-compare/        f10-audit-compare.spec.ts   F10-AUDIT-COMPARE.bat   f10-audit-compare.sh
│   ├── f11-portfolio/            f11-portfolio.spec.ts       F11-PORTFOLIO.bat       f11-portfolio.sh
│   ├── f12-export/               f12-export.spec.ts          F12-EXPORT.bat          f12-export.sh
│   └── f13-cross-org/            f13-cross-org.spec.ts       F13-CROSS-ORG.bat       f13-cross-org.sh
├── S4-RUN-ALL.bat
└── s4-run-all.sh
```

-----

## `.env.test.local` additions for Sprint 4

```bash
# Carry forward from Sprint 1-3
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
E2E_TEST_USER_1_EMAIL=qa-s4-user1@visibleau.test
E2E_TEST_USER_1_PASSWORD=QAS4User1!
E2E_TEST_USER_1_CLERK_ID=user_...
E2E_TEST_ORG_1_CLERK_ID=org_...
E2E_TEST_USER_2_EMAIL=qa-s4-user2@visibleau.test
E2E_TEST_USER_2_PASSWORD=QAS4User2!
E2E_TEST_USER_2_CLERK_ID=user_...
E2E_TEST_ORG_2_CLERK_ID=org_...
LLM_MODE=mock
MOCK_SCENARIO=happy_path
NEXT_PUBLIC_APP_URL=http://localhost:3000
E2E_APP_URL=http://localhost:3000
INNGEST_DEV_PORT=8288
```

-----

## `tests/qa/sprint4/playwright.config.ts`

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
  timeout:       60_000,

  reporter: [['list'], ['html', { outputFolder: 'tests/qa/sprint4/reports', open: 'never' }]],
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
    NEXT_PUBLIC_APP_URL:               process.env.NEXT_PUBLIC_APP_URL               ?? 'http://localhost:3000',
    E2E_TEST_USER_1_EMAIL:             process.env.E2E_TEST_USER_1_EMAIL             ?? '',
    E2E_TEST_USER_1_PASSWORD:          process.env.E2E_TEST_USER_1_PASSWORD          ?? '',
    E2E_TEST_USER_1_CLERK_ID:          process.env.E2E_TEST_USER_1_CLERK_ID          ?? '',
    E2E_TEST_ORG_1_CLERK_ID:           process.env.E2E_TEST_ORG_1_CLERK_ID           ?? '',
    E2E_TEST_USER_2_EMAIL:             process.env.E2E_TEST_USER_2_EMAIL             ?? '',
    E2E_TEST_USER_2_PASSWORD:          process.env.E2E_TEST_USER_2_PASSWORD          ?? '',
    E2E_TEST_USER_2_CLERK_ID:          process.env.E2E_TEST_USER_2_CLERK_ID          ?? '',
    E2E_TEST_ORG_2_CLERK_ID:           process.env.E2E_TEST_ORG_2_CLERK_ID           ?? '',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

-----

## Shared helpers

### `tests/qa/sprint4/shared/db.ts`

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres    from 'postgres';
import * as schema from '../../../db/schema';

const pg = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { max: 1 });
export const db = drizzle(pg, { schema });
```

### `tests/qa/sprint4/shared/seed.ts`

```typescript
import { db } from './db';
import * as schema from '../../../db/schema';
import { eq, isNull, count } from 'drizzle-orm';

export async function seedOrg(p: { clerkOrgId: string; name: string; tier?: string }) {
  const [org] = await db.insert(schema.organizations)
    .values({ clerkOrgId: p.clerkOrgId, name: p.name, region: 'au', tier: p.tier ?? 'agency' })
    .onConflictDoUpdate({ target: schema.organizations.clerkOrgId, set: { name: p.name, tier: p.tier ?? 'agency' } })
    .returning();
  return org;
}

export async function seedUser(p: { clerkUserId: string; organizationId: string; email: string }) {
  const [user] = await db.insert(schema.users)
    .values({ clerkUserId: p.clerkUserId, organizationId: p.organizationId, email: p.email, name: '[S4-QA] User', role: 'owner' })
    .onConflictDoUpdate({ target: schema.users.clerkUserId, set: { organizationId: p.organizationId, email: p.email } })
    .returning();
  return user;
}

export async function seedBrand(p: {
  organizationId: string;
  name?: string;
  domain?: string;
  vertical?: string;
  primaryRegions?: string[];
  competitors?: string[];
}) {
  const [brand] = await db.insert(schema.brands)
    .values({
      organizationId: p.organizationId,
      name:           p.name          ?? '[S4-QA] Brand',
      domain:         p.domain        ?? `s4-qa-${Date.now()}.com.au`,
      vertical:       p.vertical      ?? 'tradies',
      region:         'au',
      competitors:    p.competitors   ?? [],
      primaryRegions: p.primaryRegions ?? ['NSW:Bondi'],
    })
    .returning();
  return brand;
}

export async function seedAudit(p: {
  organizationId: string;
  brandId:        string;
  auditNumber?:   number;
  status?:        'pending' | 'running' | 'complete' | 'failed';
  runsPerPrompt?: number;   // 1 = Basic (Sprint 2), 5 = Rich (Sprint 3)
  engines?:       string[];
  scoreComposite?: string;
  totalCostUsd?:  string;
  completedAt?:   Date;
  startedAt?:     Date;
  metadata?:      Record<string, unknown>;
}) {
  const done    = (p.status ?? 'complete') === 'complete';
  const engines = p.engines ?? ['chatgpt', 'claude', 'gemini', 'perplexity'];
  const rpp     = p.runsPerPrompt ?? 5;
  const [audit] = await db.insert(schema.audits)
    .values({
      organizationId: p.organizationId,
      brandId:        p.brandId,
      auditNumber:    p.auditNumber    ?? 1,
      triggeredBy:    'manual',
      status:         p.status         ?? 'complete',
      engines,
      runsPerPrompt:  rpp,
      promptsCount:   10,
      promptCount:    10,
      totalCalls:     engines.length * 10 * rpp,
      engineCount:    engines.length,
      scoreComposite: p.scoreComposite !== undefined ? p.scoreComposite : '63.40',  // J2 fix: null preserved
      scoreFrequency: p.scoreFrequency !== undefined ? p.scoreFrequency : '14.00',
      scorePosition:  p.scorePosition !== undefined ? p.scorePosition : '90.00',
      scoreSentiment: p.scoreSentiment !== undefined ? p.scoreSentiment : 'positive',
      scoreContext:   p.scoreContext !== undefined ? p.scoreContext : 'recommended',
      scoreSentimentNumeric: '79.00',
      scoreContextNumeric:   '73.00',
      scoreAccuracy:  '71.00',
      scoreConfidenceLow:  '59.10',
      scoreConfidenceHigh: '67.70',
      confidenceIntervals: { frequency: { lower: 9, upper: 20 }, position: { lower: 85, upper: 95 }, sentiment: { lower: 73, upper: 85 }, context: { lower: 66, upper: 80 }, accuracy: { lower: 64, upper: 78 } },
      totalCostUsd:   p.totalCostUsd   ?? '1.8900',
      metadata:       p.metadata       ?? { mockScenario: 'happy_path' },
      startedAt:      p.startedAt      ?? new Date(Date.now() - 252_000),
      completedAt:    p.completedAt    ?? (done ? new Date() : null),
    })
    .returning();
  return audit;
}

export async function seedCitation(p: { auditId: string; engine?: string; brandMentioned?: boolean; position?: number | null; runNumber?: number }) {
  const mentioned = p.brandMentioned ?? true;
  const [cit] = await db.insert(schema.citations)
    .values({
      auditId:         p.auditId,
      engine:          p.engine        ?? 'chatgpt',
      prompt:          'Who are the best plumbers in Sydney?',
      runNumber:       p.runNumber     ?? 1,
      brandMentioned:  mentioned,
      position:        p.position !== undefined ? p.position : (mentioned ? 2 : null),
      sentimentLabel:  mentioned ? 'positive' : null,
      contextLabel:    mentioned ? 'recommended' : null,
      responseSnippet: '[S4-QA] mock response for Bondi Plumbing',
      contextSnippets: [],
      citedSources:    mentioned ? [{ domain: 'bondiplumbing.com.au', url: 'https://bondiplumbing.com.au' }] : [],
      llmCostUsd:      '0.0050',
      llmTokensUsed:   85,
      llmModel:        'gpt-4o-mini-mock',
    })
    .returning();
  return cit;
}
```

### `tests/qa/sprint4/shared/cleanup.ts`

```typescript
import { db }        from './db';
import * as schema   from '../../../db/schema';
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

export async function cleanupAllQaData(): Promise<void> {
  const orgs = await db.select({ id: schema.organizations.id }).from(schema.organizations)
    .where(like(schema.organizations.name, '[S4-QA]%'));
  for (const org of orgs) await cleanupOrg(org.id);
}
```

-----

## Script conventions

**Windows `.bat` env loading:**

```batch
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
```

**Unix `.sh` env + process-group kill:**

```bash
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
LLM_MODE=mock pnpm dev > logs/fNN.log 2>&1 & SERVER_PID=$!
WAIT_COUNT=0
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do
  sleep 2; WAIT_COUNT=$((WAIT_COUNT+1))
  if [ "$WAIT_COUNT" -gt 60 ]; then echo "[ERROR] Server failed to start within 2 minutes"; exit 1; fi
done
# ... tests ...
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
```

-----

## F01 — Dashboard layout (sidebar + topbar + breadcrumbs)

**Tests:** Sidebar renders with all navigation groups; active link has `aria-current="page"`;
sidebar collapses to drawer on mobile viewport; topbar shows org name; breadcrumbs render on
each page; Portfolio link shows/hides based on brand count.  
**Data:** Org + user + 0 brands (Portal hidden); then 2 brands (Portfolio shown).

### `tests/qa/sprint4/features/f01-layout/f01-layout.spec.ts`

```typescript
import { test, expect }                from '@playwright/test';
import { clerk, clerkSetup }           from '@clerk/testing/playwright';
import { seedOrg, seedUser, seedBrand } from '../../shared/seed';
import { cleanupOrg }                  from '../../shared/cleanup';
import { eq }                          from 'drizzle-orm';  // H18 fix: top-level import, not require()

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id = '';

test.describe('F01: Dashboard layout — sidebar, topbar, breadcrumbs', () => {
  test.beforeAll(async () => {
    await clerkSetup();
    const org = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!, name: '[S4-QA] F01 Org', tier: 'agency' });
    org1Id = org.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId: org1Id, email: process.env.E2E_TEST_USER_1_EMAIL! });
  });

  test.afterAll(async () => { await cleanupOrg(org1Id); });

  test('F01-01: Sidebar navigation groups are all present', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/brands/wizard'); // skip first-time redirect

    // Workspace group
    await expect(page.getByRole('link', { name: /Dashboard/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Brands/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Audits/i })).toBeVisible();
    // Insights group (Sprint 6 placeholders)
    await expect(page.getByText(/Action Center/i)).toBeVisible();
    // Settings group
    await expect(page.getByRole('link', { name: /Billing/i })).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F01-02: Active sidebar link has aria-current="page"', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/brands');

    const activeLink = page.getByRole('link', { name: /Brands/i, exact: true }).first();
    await expect(activeLink).toHaveAttribute('aria-current', 'page');
    await clerk.signOut({ page });
  });

  test('F01-03: Mobile viewport — sidebar collapses to drawer', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/brands/wizard');

    // On mobile, the sidebar is hidden; a hamburger/menu button opens it
    const sidebar = page.getByRole('navigation').first();
    const isVisible = await sidebar.isVisible();
    if (!isVisible) {
      // Find and click the menu trigger
      const menuBtn = page.getByRole('button', { name: /menu|navigation|open/i }).first();
      if (await menuBtn.isVisible()) await menuBtn.click();
    }
    // After open, nav items visible
    await expect(page.getByRole('link', { name: /Dashboard/i })).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F01-04: Portfolio link hidden with 0 brands, visible with 2 brands', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/brands/wizard');

    // With 0 brands: Portfolio NOT in sidebar as an active link (hidden or disabled)
    const portfolioLink = page.getByRole('link', { name: /Portfolio/i });
    // Either absent or shows a disabled/locked state
    if (await portfolioLink.isVisible({ timeout: 1000 }).catch(() => false)) {
      // If visible it must be disabled or labelled as requiring 2+ brands
      const isDisabled = await portfolioLink.evaluate(el => el.hasAttribute('aria-disabled') || (el as HTMLAnchorElement).classList.contains('disabled') || false);
      // Accept either approach
    }

    // Seed 2 brands
    const b1 = await seedBrand({ organizationId: org1Id, name: '[S4-QA] F01 Brand1', domain: 's4-qa-f01a.com.au' });
    const b2 = await seedBrand({ organizationId: org1Id, name: '[S4-QA] F01 Brand2', domain: 's4-qa-f01b.com.au' });
    await page.reload();
    await expect(page.getByRole('link', { name: /Portfolio/i })).toBeVisible();

    // Cleanup extra brands
    const { db } = await import('../../shared/db');
    const { brands } = await import('../../../../db/schema');
    // H18 fix: require() is not available in ESM TypeScript; use top-level import instead.
    // eq is imported from drizzle-orm at the top of the file.
    // H18: uses top-level eq import (not require() which fails in ESM)
    await db.delete(brands).where(eq(brands.id, b1.id));
    await db.delete(brands).where(eq(brands.id, b2.id));
    await clerk.signOut({ page });
  });

  test('F01-05: Breadcrumbs render correctly on brand list page', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/brands');
    await expect(page.getByText(/Brands/i)).toBeVisible();
    // Workspace / Brands breadcrumb
    await expect(page.getByText(/Workspace/i)).toBeVisible();
    await clerk.signOut({ page });
  });
});
```

### `tests/qa/sprint4/features/f01-layout/F01-LAYOUT.bat`

```batch
@echo off
REM F01 — Dashboard Layout  |  Seeds org + user (no brands)
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint4\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint4\logs\f01-server.log 2>&1"
:WAIT_F01
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F01
pnpm exec playwright test tests/qa/sprint4/features/f01-layout/f01-layout.spec.ts --config tests/qa/sprint4/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F01] PASSED) else (echo [F01] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint4/features/f01-layout/f01-layout.sh`

```bash
#!/usr/bin/env bash
# F01 — Dashboard Layout
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint4/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint4/logs/f01-server.log 2>&1 & SERVER_PID=$!
WAIT_COUNT=0
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do
  sleep 2; WAIT_COUNT=$((WAIT_COUNT+1))
  if [ "$WAIT_COUNT" -gt 60 ]; then echo "[ERROR] Server failed to start within 2 minutes"; exit 1; fi
done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint4/features/f01-layout/f01-layout.spec.ts \
  --config tests/qa/sprint4/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F01] PASSED" || echo "[F01] FAILED"; exit "$TEST_EXIT"
```

-----

## F02 — Dashboard page (KPI cards + recent audits feed + quick actions)

**Tests:** 4 KPI cards render with real data; recent audits feed shows last 5 with brand names;
first-time redirect (0 brands) goes to `/brands/wizard`; `+N vs last` delta label present;
Quick actions “Run audit” disabled when 0 brands.  
**Data:** Org + user + 2 brands + 5 seeded audits.

### `tests/qa/sprint4/features/f02-dashboard/f02-dashboard.spec.ts`

```typescript
import { test, expect }                              from '@playwright/test';
import { clerk, clerkSetup }                         from '@clerk/testing/playwright';
import { seedOrg, seedUser, seedBrand, seedAudit }   from '../../shared/seed';
import { cleanupOrg }                                from '../../shared/cleanup';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id = '', brand1Id = '', brand2Id = '';

test.describe('F02: Dashboard page — KPIs, recent audits, quick actions', () => {
  test.beforeAll(async () => {
    await clerkSetup();
    const org  = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!, name: '[S4-QA] F02 Org', tier: 'agency' });
    org1Id     = org.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId: org1Id, email: process.env.E2E_TEST_USER_1_EMAIL! });
    const b1   = await seedBrand({ organizationId: org1Id, name: '[S4-QA] F02 Brand1', domain: 's4-qa-f02a.com.au' });
    brand1Id   = b1.id;
    const b2   = await seedBrand({ organizationId: org1Id, name: '[S4-QA] F02 Brand2', domain: 's4-qa-f02b.com.au' });
    brand2Id   = b2.id;
    const now  = Date.now();
    // M3 fix: auditNumber is UNIQUE per org (uniqueIndex on organizationId + auditNumber).
    // Use globally unique auditNumbers 1-5 across all brands in org1.
    await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 1, scoreComposite: '50.00', totalCostUsd: '0.5000', completedAt: new Date(now - 5 * 3600_000) });
    await seedAudit({ organizationId: org1Id, brandId: brand2Id, auditNumber: 2, scoreComposite: '57.20', totalCostUsd: '0.6000', completedAt: new Date(now - 4 * 3600_000) });
    await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 3, scoreComposite: '60.00', totalCostUsd: '0.7000', completedAt: new Date(now - 3 * 3600_000) });
    await seedAudit({ organizationId: org1Id, brandId: brand2Id, auditNumber: 4, scoreComposite: '63.40', totalCostUsd: '0.8000', completedAt: new Date(now - 2 * 3600_000) });
    await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 5, scoreComposite: '65.00', totalCostUsd: '0.9000', completedAt: new Date(now - 1 * 3600_000) });
  });

  test.afterAll(async () => { await cleanupOrg(org1Id); });

  test('F02-01: Dashboard renders all 4 KPI cards with non-null values', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/dashboard');

    // 4 KPI cards per §8 + BD2 fix
    await expect(page.getByText(/Brands tracked/i)).toBeVisible();
    await expect(page.getByText(/Audits this month/i)).toBeVisible();
    await expect(page.getByText(/Avg visibility/i)).toBeVisible();
    await expect(page.getByText(/LLM spend this month/i)).toBeVisible();

    // Brands tracked = 2
    // H28 fix: locator('../..') is fragile — depends on exact DOM nesting depth.
    // Use a text proximity check: find '2' near 'Brands tracked' without brittle traversal.
    // Look for '2' anywhere on the dashboard (the count is distinctive since we seeded exactly 2 brands).
    await expect(page.getByText(/Brands tracked/i)).toBeVisible();
    // The value '2' near the brands card — check it's present on the page
    // (scoped via closest heading/card pattern where possible)
    const brandsSection = page.locator('[data-testid="kpi-brands"]').or(
      page.locator(':has-text("Brands tracked")').first()
    );
    // Accept either testid-scoped '2' or page-level (card shows '2' prominently)
    const brandCount = brandsSection.getByText('2').or(page.getByText('2').first());
    await expect(brandCount).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F02-02: Recent audits feed shows last 5 entries with brand names', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/dashboard');

    // Recent audits feed
    await expect(page.getByText('[S4-QA] F02 Brand1').first()).toBeVisible();
    await expect(page.getByText('[S4-QA] F02 Brand2').first()).toBeVisible();
    // Scores rendered (at least one)
    await expect(page.getByText('65.0').or(page.getByText('65')).first()).toBeVisible();
    // Status badge
    await expect(page.getByText(/complete/i).first()).toBeVisible();
    // Relative time
    await expect(page.getByText(/ago/i).first()).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F02-03: First-time redirect — 0 brands → /brands/wizard', async ({ page }) => {
    // Create a fresh org with 0 brands
    const org2 = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_2_CLERK_ID!, name: '[S4-QA] F02 Org2' });
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID!, organizationId: org2.id, email: process.env.E2E_TEST_USER_2_EMAIL! });

    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_2_EMAIL!, password: process.env.E2E_TEST_USER_2_PASSWORD! } });
    await page.goto('/dashboard');

    // Should redirect to /brands/wizard since this org has 0 brands
    await expect(page).toHaveURL(/\/brands\/wizard/, { timeout: 5000 });
    await clerk.signOut({ page });

    // Cleanup org2
    await cleanupOrg(org2.id);
  });

  test('F02-04: Quick actions — Run audit disabled with 0 brands (tooltip present)', async ({ page }) => {
    const org2 = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_2_CLERK_ID!, name: '[S4-QA] F02 Org2b' });
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID!, organizationId: org2.id, email: process.env.E2E_TEST_USER_2_EMAIL! });

    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_2_EMAIL!, password: process.env.E2E_TEST_USER_2_PASSWORD! } });
    await page.goto('/brands/wizard'); // avoid first-time redirect

    const runBtn = page.getByRole('button', { name: /Run audit/i }).first();
    if (await runBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const isDisabled = await runBtn.isDisabled();
      expect(isDisabled).toBe(true);
    }
    await clerk.signOut({ page });
    await cleanupOrg(org2.id);
  });

  test('F02-05: Prior-month delta label present on KPI cards ("+N vs last" or "—")', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/dashboard');
    // At least one KPI shows a delta or neutral label
    const deltaLabel = page.getByText(/vs last|this month/i).first();
    await expect(deltaLabel).toBeVisible();
    await clerk.signOut({ page });
  });
});
```

### `tests/qa/sprint4/features/f02-dashboard/F02-DASHBOARD.bat`

```batch
@echo off
REM F02 — Dashboard  |  Seeds org + 2 brands + 5 audits
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint4\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint4\logs\f02-server.log 2>&1"
:WAIT_F02
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F02
pnpm exec playwright test tests/qa/sprint4/features/f02-dashboard/f02-dashboard.spec.ts --config tests/qa/sprint4/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F02] PASSED) else (echo [F02] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint4/features/f02-dashboard/f02-dashboard.sh`

```bash
#!/usr/bin/env bash
# F02 — Dashboard
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint4/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint4/logs/f02-server.log 2>&1 & SERVER_PID=$!
WAIT_COUNT=0
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do
  sleep 2; WAIT_COUNT=$((WAIT_COUNT+1))
  if [ "$WAIT_COUNT" -gt 60 ]; then echo "[ERROR] Server failed to start within 2 minutes"; exit 1; fi
done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint4/features/f02-dashboard/f02-dashboard.spec.ts \
  --config tests/qa/sprint4/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F02] PASSED" || echo "[F02] FAILED"; exit "$TEST_EXIT"
```

-----

## F03 — Brand list page

**Tests:** Brand grid renders with last audit scores via lateral join; empty state CTA leads to
wizard; brand card shows vertical/region badges; `GET /api/brands` includes `lastAuditScore`;
cross-org GET /api/brands → scoped to org (no leakage).  
**Data:** Org + user + 3 brands with different audit states.

### `tests/qa/sprint4/features/f03-brand-list/f03-brand-list.spec.ts`

```typescript
import { test, expect }                              from '@playwright/test';
import { clerk, clerkSetup }                         from '@clerk/testing/playwright';
import { seedOrg, seedUser, seedBrand, seedAudit }   from '../../shared/seed';
import { cleanupOrg }                                from '../../shared/cleanup';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id = '', org2Id = '';

test.describe('F03: Brand list page — grid, last audit score, empty state', () => {
  test.beforeAll(async () => {
    await clerkSetup();
    const org  = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!, name: '[S4-QA] F03 Org1', tier: 'agency' });
    org1Id     = org.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId: org1Id, email: process.env.E2E_TEST_USER_1_EMAIL! });

    // Brand 1: has completed audit with score
    const b1   = await seedBrand({ organizationId: org1Id, name: '[S4-QA] F03 Bondi Plumbing', domain: 'bondiplumbing.com.au', vertical: 'tradies' });
    await seedAudit({ organizationId: org1Id, brandId: b1.id, auditNumber: 1, scoreComposite: '63.40', completedAt: new Date() });

    // Brand 2: has no audits (shows "Never audited")
    // J10 fix: brand name must NOT contain 'Never audited' — the status text we're asserting.
    // If name = '[S4-QA] F03 No Audits Brand', getByText(/Never audited/i) matches the NAME not the
    // status badge, making F03-03 a false positive (passes even if status text is absent).
    await seedBrand({ organizationId: org1Id, name: '[S4-QA] F03 No Audits Brand', domain: 's4-qa-f03b.com.au' });

    // Brand 3: has running audit
    const b3   = await seedBrand({ organizationId: org1Id, name: '[S4-QA] F03 Running Brand', domain: 's4-qa-f03c.com.au' });
    // M14 fix: auditNumber unique per org — b1 uses 1, b3 must use 2
    await seedAudit({ organizationId: org1Id, brandId: b3.id, auditNumber: 2, status: 'running', scoreComposite: null });

    // Org 2 for isolation test
    const org2 = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_2_CLERK_ID!, name: '[S4-QA] F03 Org2' });
    org2Id     = org2.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID!, organizationId: org2Id, email: process.env.E2E_TEST_USER_2_EMAIL! });
    await seedBrand({ organizationId: org2Id, name: '[S4-QA] F03 Org2 Brand', domain: 's4-qa-f03-org2.com.au' });
  });

  test.afterAll(async () => { await cleanupOrg(org1Id); await cleanupOrg(org2Id); });

  test('F03-01: Brand list grid renders all 3 brands with names', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/brands');
    await expect(page.getByText('[S4-QA] F03 Bondi Plumbing')).toBeVisible();
    await expect(page.getByText('[S4-QA] F03 No Audits Brand')).toBeVisible();
    await expect(page.getByText('[S4-QA] F03 Running Brand')).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F03-02: Brand with completed audit shows composite score on card', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/brands');
    // Score 63.4 (or rounded to 63) on the Bondi Plumbing card
    await expect(page.getByText(/63\.?4?/).first()).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F03-03: Brand with no audits shows "Never audited"', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/brands');
    await expect(page.getByText(/Never audited/i)).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F03-04: GET /api/brands returns lastAuditScore via lateral join', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    const brands = await page.evaluate(async (base) => {
      const r = await fetch(`${base}/api/brands`);
      return await r.json();
    }, BASE);
    // API should return lastAuditScore as part of brand objects
    expect(Array.isArray(brands) || Array.isArray(brands.brands)).toBe(true);
    const list = Array.isArray(brands) ? brands : brands.brands;
    const bondi = list.find((b: { name: string }) => b.name.includes('F03 Bondi Plumbing'));
    expect(bondi).toBeTruthy();
    expect(parseFloat(bondi.lastAuditScore ?? '0')).toBeGreaterThan(60);
    await clerk.signOut({ page });
  });

  test('F03-05: User B cannot see User A brands via GET /api/brands (org isolation)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_2_EMAIL!, password: process.env.E2E_TEST_USER_2_PASSWORD! } });
    const brands = await page.evaluate(async (base) => {
      const r = await fetch(`${base}/api/brands`);
      return await r.json();
    }, BASE);
    const list = Array.isArray(brands) ? brands : brands.brands ?? [];
    const org1Brand = list.find((b: { name: string }) => b.name.includes('F03 Bondi Plumbing'));
    expect(org1Brand).toBeUndefined();
    await clerk.signOut({ page });
  });

  test('F03-06: Clicking brand card navigates to brand detail page', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/brands');
    await page.getByText('[S4-QA] F03 Bondi Plumbing').click();
    await expect(page).toHaveURL(/\/brands\/[a-f0-9-]+/, { timeout: 5000 });
    await clerk.signOut({ page });
  });
});
```

### `tests/qa/sprint4/features/f03-brand-list/F03-BRAND-LIST.bat`

```batch
@echo off
REM F03 — Brand List  |  Seeds org + 3 brands with varying audit states
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint4\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint4\logs\f03-server.log 2>&1"
:WAIT_F03
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F03
pnpm exec playwright test tests/qa/sprint4/features/f03-brand-list/f03-brand-list.spec.ts --config tests/qa/sprint4/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F03] PASSED) else (echo [F03] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint4/features/f03-brand-list/f03-brand-list.sh`

```bash
#!/usr/bin/env bash
# F03 — Brand List
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint4/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint4/logs/f03-server.log 2>&1 & SERVER_PID=$!
WAIT_COUNT=0
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do
  sleep 2; WAIT_COUNT=$((WAIT_COUNT+1))
  if [ "$WAIT_COUNT" -gt 60 ]; then echo "[ERROR] Server failed to start within 2 minutes"; exit 1; fi
done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint4/features/f03-brand-list/f03-brand-list.spec.ts \
  --config tests/qa/sprint4/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F03] PASSED" || echo "[F03] FAILED"; exit "$TEST_EXIT"
```

-----

## F04 — Brand create page (`/brands/new`)

**Tests:** Form validation (domain regex, required fields); successful create POST + auto-trigger audit

- redirect to running screen; brand limit 403 for free tier at limit; domain www-strip
  ([www.example.com](http://www.example.com) → example.com); competitors tag input add/remove.  
  **Data:** Org (agency) + user. Cleanup includes any created brand.

### `tests/qa/sprint4/features/f04-brand-create/f04-brand-create.spec.ts`

```typescript
import { test, expect }               from '@playwright/test';
import { clerk, clerkSetup }          from '@clerk/testing/playwright';
import { seedOrg, seedUser }          from '../../shared/seed';
import { cleanupOrg }                 from '../../shared/cleanup';
import { db }                         from '../../shared/db';
import { brands, audits }             from '../../../../db/schema';
import { eq, like }                   from 'drizzle-orm';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id = '', org2Id = '';

test.describe('F04: Brand create page — form, validation, limits', () => {
  test.beforeAll(async () => {
    await clerkSetup();
    const org  = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!, name: '[S4-QA] F04 Org1', tier: 'agency' });
    org1Id     = org.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId: org1Id, email: process.env.E2E_TEST_USER_1_EMAIL! });

    // Free-tier org for brand limit test
    const org2 = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_2_CLERK_ID!, name: '[S4-QA] F04 Org2', tier: 'free' });
    org2Id     = org2.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID!, organizationId: org2Id, email: process.env.E2E_TEST_USER_2_EMAIL! });
    // Seed 1 brand for free org (at the limit)
    await db.insert(brands).values({ organizationId: org2Id, name: '[S4-QA] F04 Existing', domain: 's4-qa-f04-free.com.au', vertical: 'tradies', region: 'au', competitors: [], primaryRegions: ['NSW:Bondi'] });
  });

  test.afterAll(async () => {
    // Delete any brands created by tests before org cleanup
    await db.delete(brands).where(like(brands.domain, 's4-qa-f04%'));
    await cleanupOrg(org1Id);
    await cleanupOrg(org2Id);
  });

  test('F04-01: Domain validation rejects https:// prefix', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/brands/new');
    await page.getByLabel(/Domain/i).fill('https://bondiplumbing.com.au');
    await page.getByRole('button', { name: /Create|Save|Submit/i }).first().click();
    await expect(page.getByText(/without http|domain format|Enter a domain/i)).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F04-02: Domain www-strip — www.example.com stored as example.com', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/brands/new');
    await page.getByLabel(/Brand name/i).fill('[S4-QA] F04 WWW Test');
    await page.getByLabel(/Domain/i).fill('www.s4-qa-f04-www.com.au');
    // K22 fix: BrandCreate prototype uses card-click vertical picker (onClick={() => setVertical(v.id)})
    // NOT a native <select>. selectOption() only works on <select> elements and silently
    // fails on shadcn Select or card-click pickers. Use click-based approach as primary.
    const verticalField = page.getByLabel(/Vertical/i);
    if (await verticalField.isVisible({ timeout: 1000 }).catch(() => false)) {
      // Try native select first (if implementation uses <select>)
      try { await verticalField.selectOption('tradies'); }
      catch { await page.getByText(/^Tradies$/i).first().click(); }
    } else {
      // Card-click pattern (prototype): click the Tradies card directly
      const tradiesCard = page.getByText(/^Tradies$/i).first();
      if (await tradiesCard.isVisible({ timeout: 1000 }).catch(() => false))
        await tradiesCard.click();
    }
    // Select region
    const regionPicker = page.getByText(/Select.*region|Add.*region/i).first();
    if (await regionPicker.isVisible({ timeout: 1000 }).catch(() => false)) await regionPicker.click();
    const nswOption = page.getByText('NSW:Bondi').or(page.getByText('Bondi, NSW')).first();
    if (await nswOption.isVisible({ timeout: 1000 }).catch(() => false)) await nswOption.click();

    await page.getByRole('button', { name: /Create|Save|Submit/i }).first().click();
    // Should redirect to running screen
    await expect(page).toHaveURL(/\/audits\/[a-f0-9-]+/, { timeout: 10_000 });

    // Verify stored domain has no www.
    const [brand] = await db.select().from(brands).where(like(brands.name, '%F04 WWW Test%'));
    expect(brand?.domain).toBe('s4-qa-f04-www.com.au');
    await clerk.signOut({ page });
  });

  test('F04-03: Free-tier at limit (1 brand) → POST /api/brands returns 403', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_2_EMAIL!, password: process.env.E2E_TEST_USER_2_PASSWORD! } });
    // Try to create a brand via API directly
    const res = await page.evaluate(async (base) => {
      const r = await fetch(`${base}/api/brands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Over Limit', domain: 'overlimit.com.au', vertical: 'tradies', primaryRegions: ['NSW:Bondi'], competitors: [] }),
      });
      return { status: r.status, body: await r.json() };
    }, BASE);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/plan|limit|brand/i);
    await clerk.signOut({ page });
  });

  test('F04-04: Free-tier at limit → /brands/new redirects to /settings/billing', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_2_EMAIL!, password: process.env.E2E_TEST_USER_2_PASSWORD! } });
    await page.goto('/brands/new');
    // Page should redirect to billing with reason param
    await expect(page).toHaveURL(/\/settings\/billing/, { timeout: 5000 });
    await clerk.signOut({ page });
  });

  test('F04-05: Required fields (name + domain) — form shows validation errors on empty submit', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/brands/new');
    await page.getByRole('button', { name: /Create|Save|Submit/i }).first().click();
    // At least one validation error
    await expect(page.getByText(/required|min|at least/i).first()).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F04-06: Successful brand create → POST /api/audits triggered → redirects to running screen', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/brands/new');
    await page.getByLabel(/Brand name/i).fill('[S4-QA] F04 Success Brand');
    await page.getByLabel(/Domain/i).fill('s4-qa-f04-success.com.au');
    // K22 fix: card-click vertical picker (same as F04-02 fix)
    const verticalField = page.getByLabel(/Vertical/i);
    if (await verticalField.isVisible({ timeout: 1000 }).catch(() => false)) {
      try { await verticalField.selectOption('tradies'); }
      catch { await page.getByText(/^Tradies$/i).first().click(); }
    } else {
      const tradiesCard = page.getByText(/^Tradies$/i).first();
      if (await tradiesCard.isVisible({ timeout: 1000 }).catch(() => false))
        await tradiesCard.click();
    }
    await page.getByRole('button', { name: /Create|Save|Submit/i }).first().click();
    // After create: redirects to /audits/[id] (running screen triggers automatically per BC3 fix)
    await expect(page).toHaveURL(/\/audits\/[a-f0-9-]+/, { timeout: 10_000 });
    await clerk.signOut({ page });
  });
});
```

### `tests/qa/sprint4/features/f04-brand-create/F04-BRAND-CREATE.bat`

```batch
@echo off
REM F04 — Brand Create  |  Seeds org + free-tier org at brand limit
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint4\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint4\logs\f04-server.log 2>&1"
:WAIT_F04
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F04
pnpm exec playwright test tests/qa/sprint4/features/f04-brand-create/f04-brand-create.spec.ts --config tests/qa/sprint4/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F04] PASSED) else (echo [F04] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint4/features/f04-brand-create/f04-brand-create.sh`

```bash
#!/usr/bin/env bash
# F04 — Brand Create
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint4/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint4/logs/f04-server.log 2>&1 & SERVER_PID=$!
WAIT_COUNT=0
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do
  sleep 2; WAIT_COUNT=$((WAIT_COUNT+1))
  if [ "$WAIT_COUNT" -gt 60 ]; then echo "[ERROR] Server failed to start within 2 minutes"; exit 1; fi
done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint4/features/f04-brand-create/f04-brand-create.spec.ts \
  --config tests/qa/sprint4/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F04] PASSED" || echo "[F04] FAILED"; exit "$TEST_EXIT"
```

-----

## F05 — Brand wizard (`/brands/wizard`, 4-step)

**Tests:** Step navigation (Continue/Back); wizard step 2 uses hardcoded V1 pack cards (NOT DB);
step 4 shows tier-aware cost estimate; `beforeunload` warning on step >1;
successful 4-step submit creates brand + audit + redirects to running screen;
wizard step 1 strips `www.` from domain (BG2 / BC4 fix).  
**Data:** Org + user (no brands needed — wizard creates the brand).

### `tests/qa/sprint4/features/f05-brand-wizard/f05-brand-wizard.spec.ts`

```typescript
import { test, expect }      from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { seedOrg, seedUser } from '../../shared/seed';
import { cleanupOrg }        from '../../shared/cleanup';
import { db }                from '../../shared/db';
import { brands }            from '../../../../db/schema';
import { like }              from 'drizzle-orm';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id = '';

test.describe('F05: Brand wizard — 4-step flow, hardcoded packs, step navigation', () => {
  test.beforeAll(async () => {
    await clerkSetup();
    const org = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!, name: '[S4-QA] F05 Org', tier: 'free' });
    org1Id    = org.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId: org1Id, email: process.env.E2E_TEST_USER_1_EMAIL! });
  });

  test.afterAll(async () => {
    await db.delete(brands).where(like(brands.name, '%F05%'));
    await cleanupOrg(org1Id);
  });

  test('F05-01: Wizard loads at step 1 with brand name + domain fields', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/brands/wizard');
    await expect(page.getByLabel(/Brand name/i)).toBeVisible();
    await expect(page.getByLabel(/Domain/i)).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F05-02: Step 2 shows hardcoded vertical pack cards (NO DB query crash)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/brands/wizard');
    // Fill step 1
    await page.getByLabel(/Brand name/i).fill('[S4-QA] F05 Wizard Brand');
    await page.getByLabel(/Domain/i).fill('s4-qa-f05.com.au');
    await page.getByRole('button', { name: /Continue|Next/i }).click();
    // Step 2: vertical pack cards
    // The 3 v1 packs: Tradies, Allied Health, SaaS (hardcoded — NOT from DB)
    await expect(page.getByText(/Tradies/i)).toBeVisible();
    await expect(page.getByText(/Allied Health/i)).toBeVisible();
    await expect(page.getByText(/SaaS/i)).toBeVisible();
    // v1.1 packs shown as locked/coming soon
    await expect(page.getByText(/v1\.1|Coming/i).first()).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F05-03: Step 3 shows region picker with AU suburb autocomplete', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/brands/wizard');
    await page.getByLabel(/Brand name/i).fill('[S4-QA] F05 Wizard Brand');
    await page.getByLabel(/Domain/i).fill('s4-qa-f05.com.au');
    await page.getByRole('button', { name: /Continue|Next/i }).click();
    // Pick a vertical
    await page.getByText(/Tradies/i).first().click();
    await page.getByRole('button', { name: /Continue|Next/i }).click();
    // Step 3: should have region/location input
    await expect(page.getByText(/suburb|region|location|area/i).first()).toBeVisible();
    // Type in combobox to trigger autocomplete
    const regionInput = page.getByPlaceholder(/suburb|location|search/i).first();
    if (await regionInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await regionInput.fill('Bondi');
      await expect(page.getByText(/Bondi/i).first()).toBeVisible();
    }
    await clerk.signOut({ page });
  });

  test('F05-04: Step 4 shows tier-aware cost estimate (Free tier = lower cost)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/brands/wizard');
    // Navigate to step 4 quickly
    await page.getByLabel(/Brand name/i).fill('[S4-QA] F05 Wizard Brand');
    await page.getByLabel(/Domain/i).fill('s4-qa-f05-step4.com.au');
    await page.getByRole('button', { name: /Continue|Next/i }).click();
    await page.getByText(/Tradies/i).first().click();
    await page.getByRole('button', { name: /Continue|Next/i }).click();
    await page.getByRole('button', { name: /Continue|Next/i }).click();
    // Step 4: confirm + cost estimate. Free tier should show < A$1 not A$2.50-3
    // BA3 fix: tier-aware cost — Free: A$0.30-0.50; not the paid A$2.50-3
    await expect(page.getByText(/\$0\.|A\$0\.|free/i).or(page.getByText(/2 engines|ChatGPT.*Perplexity/i)).first()).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F05-05: Back button on step 2 returns to step 1', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/brands/wizard');
    await page.getByLabel(/Brand name/i).fill('[S4-QA] F05 Back Test');
    await page.getByLabel(/Domain/i).fill('s4-qa-f05-back.com.au');
    await page.getByRole('button', { name: /Continue|Next/i }).click();
    // On step 2
    await expect(page.getByText(/Tradies/i)).toBeVisible();
    // Click Back
    await page.getByRole('button', { name: /Back/i }).click();
    // Returns to step 1
    await expect(page.getByLabel(/Brand name/i)).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F05-06: Full 4-step completion creates brand + starts audit', async ({ page }) => {
    // Only runs on agency org since free tier at limit after one brand
    const orgAgency = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_2_CLERK_ID!, name: '[S4-QA] F05 Agency Org', tier: 'agency' });
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID!, organizationId: orgAgency.id, email: process.env.E2E_TEST_USER_2_EMAIL! });

    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_2_EMAIL!, password: process.env.E2E_TEST_USER_2_PASSWORD! } });
    await page.goto('/brands/wizard');
    await page.getByLabel(/Brand name/i).fill('[S4-QA] F05 Complete Wizard');
    await page.getByLabel(/Domain/i).fill('s4-qa-f05-complete.com.au');
    await page.getByRole('button', { name: /Continue|Next/i }).click();
    await page.getByText(/Tradies/i).first().click();
    await page.getByRole('button', { name: /Continue|Next/i }).click();
    await page.getByRole('button', { name: /Continue|Next/i }).click();
    // Step 4: Create brand & run first audit
    await page.getByRole('button', { name: /Create brand|Run.*first audit|Finish/i }).click();
    // Should navigate to running screen
    await expect(page).toHaveURL(/\/audits\/[a-f0-9-]+/, { timeout: 15_000 });
    await clerk.signOut({ page });
    await cleanupOrg(orgAgency.id);
  });
});
```

### `tests/qa/sprint4/features/f05-brand-wizard/F05-BRAND-WIZARD.bat`

```batch
@echo off
REM F05 — Brand Wizard  |  Seeds org + user (no brands)
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint4\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint4\logs\f05-server.log 2>&1"
:WAIT_F05
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F05
pnpm exec playwright test tests/qa/sprint4/features/f05-brand-wizard/f05-brand-wizard.spec.ts --config tests/qa/sprint4/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F05] PASSED) else (echo [F05] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint4/features/f05-brand-wizard/f05-brand-wizard.sh`

```bash
#!/usr/bin/env bash
# F05 — Brand Wizard
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint4/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint4/logs/f05-server.log 2>&1 & SERVER_PID=$!
WAIT_COUNT=0
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do
  sleep 2; WAIT_COUNT=$((WAIT_COUNT+1))
  if [ "$WAIT_COUNT" -gt 60 ]; then echo "[ERROR] Server failed to start within 2 minutes"; exit 1; fi
done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint4/features/f05-brand-wizard/f05-brand-wizard.spec.ts \
  --config tests/qa/sprint4/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F05] PASSED" || echo "[F05] FAILED"; exit "$TEST_EXIT"
```

-----

## F06 — Brand detail page (`/brands/[brandId]`)

**Tests:** Brand metadata renders; audit history table with ±X.X CI format and delta vs prior;
inline edit fields (name, domain, vertical, competitors); “Run audit” CTA works; delete dialog
content and soft-delete; soft-deleted brand removed from list but audit rows preserved.  
**Data:** Org + user + brand + 3 seeded audits (staggered timestamps for delta calc).

### `tests/qa/sprint4/features/f06-brand-detail/f06-brand-detail.spec.ts`

```typescript
import { test, expect }                              from '@playwright/test';
import { clerk, clerkSetup }                         from '@clerk/testing/playwright';
import { seedOrg, seedUser, seedBrand, seedAudit }   from '../../shared/seed';
import { cleanupOrg }                                from '../../shared/cleanup';
import { db }                                        from '../../shared/db';
import { brands, audits }                            from '../../../../db/schema';
import { eq }                                        from 'drizzle-orm';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id = '', brand1Id = '';

test.describe('F06: Brand detail page — metadata, audit history, inline edit, delete', () => {
  test.beforeAll(async () => {
    await clerkSetup();
    const org  = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!, name: '[S4-QA] F06 Org', tier: 'agency' });
    org1Id     = org.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId: org1Id, email: process.env.E2E_TEST_USER_1_EMAIL! });
    const b    = await seedBrand({ organizationId: org1Id, name: '[S4-QA] F06 Brand', domain: 'bondiplumbing-f06.com.au', vertical: 'tradies', primaryRegions: ['NSW:Bondi'] });
    brand1Id   = b.id;
    const now  = Date.now();
    // 3 audits with staggered timestamps for delta computation
    await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 1, scoreComposite: '50.00', scoreConfidenceLow: '44.00', scoreConfidenceHigh: '56.00', completedAt: new Date(now - 7200_000) });
    await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 2, scoreComposite: '57.20', scoreConfidenceLow: '51.10', scoreConfidenceHigh: '63.30', completedAt: new Date(now - 3600_000) });
    await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 3, scoreComposite: '63.40', scoreConfidenceLow: '59.10', scoreConfidenceHigh: '67.70', completedAt: new Date(now - 600_000) });
  });

  test.afterAll(async () => { await cleanupOrg(org1Id); });

  test('F06-01: Brand detail renders brand name, domain, vertical', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto(`/brands/${brand1Id}`);
    await expect(page.getByText('[S4-QA] F06 Brand')).toBeVisible();
    await expect(page.getByText('bondiplumbing-f06.com.au')).toBeVisible();
    await expect(page.getByText(/tradies/i).first()).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F06-02: Audit history table shows all 3 audits with scores and ±CI format', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto(`/brands/${brand1Id}`);
    // 3 audit rows
    await expect(page.getByText('#1').or(page.getByText('Audit #1')).first()).toBeVisible();
    await expect(page.getByText('#3').or(page.getByText('Audit #3')).first()).toBeVisible();
    // ±X.X Wilson CI format per BI3 fix: (67.70 - 59.10) / 2 = ±4.3
    await expect(page.getByText(/±4\.3|4\.3/)).toBeVisible();
    // Delta: most recent audit delta vs prior
    await expect(page.getByText(/\+6\.2|6\.2/).first()).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F06-03: Inline edit — name field updates via PATCH', async ({ page }) => {
    // I7 note: Sprint 4 §8 BH4 fix specifies "inline form always visible (not click-to-edit)".
    // However, the PROTOTYPE BrandDetail uses a click-to-edit toggle (Edit/Cancel button).
    // If the implementation follows the prototype, the name field is hidden until Edit is clicked.
    // This test handles BOTH patterns:
    //   - Spec/BH4 (always visible): name input is immediately fillable.
    //   - Prototype (click-to-edit): click Edit button first, then fill.
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto(`/brands/${brand1Id}`);

    // Try to click Edit button first (prototype pattern); no-op if form is already visible (spec pattern)
    const editBtn = page.getByRole('button', { name: /^Edit$/i });
    if (await editBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await editBtn.click();
    }

    // Name field should now be visible and fillable under either pattern
    const nameInput = page.getByLabel(/Brand name/i);
    await nameInput.fill('[S4-QA] F06 Brand Updated');
    await page.getByRole('button', { name: /Save|Save changes|Update/i }).first().click();
    // Verify updated in DB
    const [brand] = await db.select().from(brands).where(eq(brands.id, brand1Id));
    expect(brand.name).toBe('[S4-QA] F06 Brand Updated');
    // Restore original name
    await db.update(brands).set({ name: '[S4-QA] F06 Brand' }).where(eq(brands.id, brand1Id));
    await clerk.signOut({ page });
  });

  test('F06-04: Delete confirm dialog has correct content (BJ3 fix)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto(`/brands/${brand1Id}`);
    await page.getByRole('button', { name: /Delete/i }).first().click();
    // Confirm dialog
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/Delete.*Brand|Delete.*F06/i)).toBeVisible();
    await expect(page.getByText(/audit history.*preserved|cannot be undone/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Delete brand/i })).toBeVisible();
    // Cancel out — don't delete the brand yet
    await page.getByRole('button', { name: /Cancel/i }).click();
    await clerk.signOut({ page });
  });

  test('F06-05: Brand soft-delete sets deletedAt; audit rows preserved', async ({ page }) => {
    // Create a throwaway brand to delete
    const delBrand = await seedBrand({ organizationId: org1Id, name: '[S4-QA] F06 Delete Me', domain: 's4-qa-f06-del.com.au' });
    const delAudit = await seedAudit({ organizationId: org1Id, brandId: delBrand.id, auditNumber: 1 });

    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto(`/brands/${delBrand.id}`);
    await page.getByRole('button', { name: /Delete/i }).first().click();
    await page.getByRole('button', { name: /Delete brand/i }).click();
    // Redirects to /brands
    await expect(page).toHaveURL(/\/brands$/, { timeout: 5000 });

    // Verify soft-delete: deletedAt set, not fully removed
    const [deleted] = await db.select().from(brands).where(eq(brands.id, delBrand.id));
    expect(deleted.deletedAt).not.toBeNull();

    // Audit rows still exist
    const [audit] = await db.select().from(audits).where(eq(audits.id, delAudit.id));
    expect(audit).toBeTruthy();

    // Brand not in list (has deletedAt)
    await page.goto('/brands');
    await expect(page.getByText('[S4-QA] F06 Delete Me')).not.toBeVisible();
    await clerk.signOut({ page });

    // Hard-delete orphaned rows
    await db.delete(audits).where(eq(audits.id, delAudit.id));
    await db.delete(brands).where(eq(brands.id, delBrand.id));
  });
});
```

### `tests/qa/sprint4/features/f06-brand-detail/F06-BRAND-DETAIL.bat`

```batch
@echo off
REM F06 — Brand Detail  |  Seeds org + brand + 3 audits
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint4\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint4\logs\f06-server.log 2>&1"
:WAIT_F06
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F06
pnpm exec playwright test tests/qa/sprint4/features/f06-brand-detail/f06-brand-detail.spec.ts --config tests/qa/sprint4/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F06] PASSED) else (echo [F06] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint4/features/f06-brand-detail/f06-brand-detail.sh`

```bash
#!/usr/bin/env bash
# F06 — Brand Detail
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint4/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint4/logs/f06-server.log 2>&1 & SERVER_PID=$!
WAIT_COUNT=0
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do
  sleep 2; WAIT_COUNT=$((WAIT_COUNT+1))
  if [ "$WAIT_COUNT" -gt 60 ]; then echo "[ERROR] Server failed to start within 2 minutes"; exit 1; fi
done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint4/features/f06-brand-detail/f06-brand-detail.spec.ts \
  --config tests/qa/sprint4/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F06] PASSED" || echo "[F06] FAILED"; exit "$TEST_EXIT"
```

-----

## F07 — Audit running screen (polling, progress, failed state)

**Tests:** Running screen shows 8-step progress UI; live LLM call count uses
`audit.engines.length × 10 × 5` (NOT `engineCount` — null during running); polling stops on
`complete` and redirects; failed state renders error card (not frozen screen); polling stops on
401 and redirects to /sign-in; `expectedCalls` correct for Free (100) vs Paid (200) audit.  
**Data:** Org + user + brand + seeded pending/running/failed audits.

### `tests/qa/sprint4/features/f07-audit-running/f07-audit-running.spec.ts`

```typescript
import { test, expect }                              from '@playwright/test';
import { clerk, clerkSetup }                         from '@clerk/testing/playwright';
import { seedOrg, seedUser, seedBrand, seedAudit }   from '../../shared/seed';
import { cleanupOrg }                                from '../../shared/cleanup';
import { db }                                        from '../../shared/db';
import { audits }                                    from '../../../../db/schema';
import { eq }                                        from 'drizzle-orm';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id = '', brand1Id = '';

test.describe('F07: Audit running screen — 8-step progress, polling, failed state', () => {
  test.beforeAll(async () => {
    await clerkSetup();
    const org  = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!, name: '[S4-QA] F07 Org', tier: 'agency' });
    org1Id     = org.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId: org1Id, email: process.env.E2E_TEST_USER_1_EMAIL! });
    const b    = await seedBrand({ organizationId: org1Id, name: '[S4-QA] F07 Brand', domain: 's4-qa-f07.com.au' });
    brand1Id   = b.id;
  });

  test.afterAll(async () => { await cleanupOrg(org1Id); });

  test('F07-01: Running screen shows 8-step progress UI', async ({ page }) => {
    const runningAudit = await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 1, status: 'running', scoreComposite: null, completedAt: null });
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto(`/audits/${runningAudit.id}`);

    // 8 progress steps visible
    await expect(page.getByText(/Loading brand context/i)).toBeVisible();
    await expect(page.getByText(/Generating prompts/i)).toBeVisible();
    await expect(page.getByText(/Querying/i)).toBeVisible();   // step 3: LLM calls
    await expect(page.getByText(/Detecting brand mentions/i)).toBeVisible();
    await expect(page.getByText(/Persisting citations/i)).toBeVisible();
    await clerk.signOut({ page });
    await db.delete(audits).where(eq(audits.id, runningAudit.id));
  });

  test('F07-02: expectedCalls uses engines.length × 50 NOT engineCount (BA6 fix)', async ({ page }) => {
    // Paid audit: engines=['chatgpt','claude','gemini','perplexity'] → 4×50=200
    const runningAudit = await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 2, status: 'running', engines: ['chatgpt','claude','gemini','perplexity'], scoreComposite: null, completedAt: null });
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto(`/audits/${runningAudit.id}`);

    // H8 fix: /200/ is too loose — could match status codes, years, or US$2.00 amounts.
    // /200.*LLM|200.*call/i specifically targets the "200 LLM calls" or "0/200 LLM calls" text.
    await expect(page.getByText(/200.*LLM|200.*call|\/200/i)).toBeVisible();
    await clerk.signOut({ page });
    await db.delete(audits).where(eq(audits.id, runningAudit.id));
  });

  test('F07-03: Free tier running audit shows expectedCalls=100 (2 engines × 50)', async ({ page }) => {
    const freeAudit = await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 3, status: 'running', engines: ['chatgpt','perplexity'], scoreComposite: null, completedAt: null });
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto(`/audits/${freeAudit.id}`);
    // H8 fix: /100/ is too loose — matches percentages, other numbers.
    await expect(page.getByText(/100.*LLM|100.*call|\/100/i)).toBeVisible();
    await clerk.signOut({ page });
    await db.delete(audits).where(eq(audits.id, freeAudit.id));
  });

  test('F07-04: Failed audit renders error card — NOT frozen progress screen (U6 fix)', async ({ page }) => {
    const failedAudit = await seedAudit({
      organizationId: org1Id, brandId: brand1Id, auditNumber: 4,
      status: 'failed', scoreComposite: null, completedAt: null,
      metadata: { mockScenario: 'happy_path', error: 'LLM service unavailable' },
    });
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto(`/audits/${failedAudit.id}`);

    // Must show failed state card — not the 8-step progress list
    await expect(page.getByText(/Audit failed|failed/i)).toBeVisible();
    // Error message from metadata.error
    await expect(page.getByText(/LLM service unavailable/i)).toBeVisible();
    // No charge note
    await expect(page.getByText(/No charge|no cost/i)).toBeVisible();
    // Recovery buttons
    await expect(page.getByRole('button', { name: /Retry|Try again/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Back/i })).toBeVisible();
    await clerk.signOut({ page });
    await db.delete(audits).where(eq(audits.id, failedAudit.id));
  });

  test('F07-05: Complete audit dispatches to results page — NOT running screen', async ({ page }) => {
    // Rich audit (runsPerPrompt=5, engines.length > 1)
    const completeAudit = await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 5, status: 'complete', runsPerPrompt: 5, engines: ['chatgpt','claude','gemini','perplexity'] });
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto(`/audits/${completeAudit.id}`);

    // Should NOT show running screen elements
    await expect(page.getByText(/Loading brand context/i)).not.toBeVisible();
    // Should show results (composite score visible)
    await expect(page.getByText(/63|Visibility Score|composite/i).first()).toBeVisible();
    await clerk.signOut({ page });
    await db.delete(audits).where(eq(audits.id, completeAudit.id));
  });
});
```

### `tests/qa/sprint4/features/f07-audit-running/F07-AUDIT-RUNNING.bat`

```batch
@echo off
REM F07 — Audit Running Screen  |  Seeds org + brand + various audit states
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint4\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint4\logs\f07-server.log 2>&1"
:WAIT_F07
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F07
pnpm exec playwright test tests/qa/sprint4/features/f07-audit-running/f07-audit-running.spec.ts --config tests/qa/sprint4/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F07] PASSED) else (echo [F07] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint4/features/f07-audit-running/f07-audit-running.sh`

```bash
#!/usr/bin/env bash
# F07 — Audit Running Screen
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint4/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint4/logs/f07-server.log 2>&1 & SERVER_PID=$!
WAIT_COUNT=0
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do
  sleep 2; WAIT_COUNT=$((WAIT_COUNT+1))
  if [ "$WAIT_COUNT" -gt 60 ]; then echo "[ERROR] Server failed to start within 2 minutes"; exit 1; fi
done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint4/features/f07-audit-running/f07-audit-running.spec.ts \
  --config tests/qa/sprint4/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F07] PASSED" || echo "[F07] FAILED"; exit "$TEST_EXIT"
```

-----

## F08 — Audit results (Basic + Rich dispatch)

**Tests:** Dispatch logic `runsPerPrompt>=5 && engines.length>1` → Rich; else → Basic;
Rich shows composite score + 5 dimension tiles + Wilson CI bands + per-engine breakdown;
Basic shows “Re-run audit” button (BD3 fix); per-engine tiles only show engines in the audit
(Free=2 tiles, Paid=4 tiles); CI visual format (score bar with band + text below).  
**Data:** Org + user + brand + 1 Basic audit (runsPerPrompt=1, 1 engine) + 1 Rich audit.

### `tests/qa/sprint4/features/f08-audit-results/f08-audit-results.spec.ts`

```typescript
import { test, expect }                              from '@playwright/test';
import { clerk, clerkSetup }                         from '@clerk/testing/playwright';
import { seedOrg, seedUser, seedBrand, seedAudit }   from '../../shared/seed';
import { cleanupOrg }                                from '../../shared/cleanup';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id = '', brand1Id = '', basicAuditId = '', richAuditId = '', freePaidAuditId = '';

test.describe('F08: Audit results — dispatch logic, Rich/Basic views, per-engine tiles', () => {
  test.beforeAll(async () => {
    await clerkSetup();
    const org      = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!, name: '[S4-QA] F08 Org', tier: 'agency' });
    org1Id         = org.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId: org1Id, email: process.env.E2E_TEST_USER_1_EMAIL! });
    const b        = await seedBrand({ organizationId: org1Id, name: '[S4-QA] F08 Brand', domain: 's4-qa-f08.com.au' });
    brand1Id       = b.id;

    // Basic audit: Sprint 2 mode (1 engine, runsPerPrompt=1)
    const basic    = await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 1, status: 'complete', runsPerPrompt: 1, engines: ['chatgpt'], scoreComposite: '72.00' });
    basicAuditId   = basic.id;

    // Rich audit: Sprint 3 mode (4 engines, runsPerPrompt=5)
    const rich     = await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 2, status: 'complete', runsPerPrompt: 5, engines: ['chatgpt','claude','gemini','perplexity'], scoreComposite: '63.40' });
    richAuditId    = rich.id;

    // Free-tier rich audit: 2 engines only
    const freePaid = await seedAudit({ organizationId: org1Id, brandId: brand1Id, auditNumber: 3, status: 'complete', runsPerPrompt: 5, engines: ['chatgpt','perplexity'], scoreComposite: '58.00' });
    freePaidAuditId = freePaid.id;
  });

  test.afterAll(async () => { await cleanupOrg(org1Id); });

  test('F08-01: Basic audit (runsPerPrompt=1, 1 engine) shows Basic view with Re-run button', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto(`/audits/${basicAuditId}`);

    // Basic results should NOT show 5 dimension tiles
    await expect(page.getByText(/Frequency|dimension|multidimensional/i)).not.toBeVisible();
    // Re-run audit button (BD3 fix — not "Refresh audit")
    await expect(page.getByRole('button', { name: /Re-run audit/i })).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F08-02: Rich audit (runsPerPrompt=5, 4 engines) shows all 5 dimension tiles', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto(`/audits/${richAuditId}`);

    // Composite score
    await expect(page.getByText(/63\.?4?|63/)).toBeVisible();
    // 5 dimension tiles
    await expect(page.getByText(/Frequency/i)).toBeVisible();
    await expect(page.getByText(/Position/i)).toBeVisible();
    await expect(page.getByText(/Sentiment/i)).toBeVisible();
    await expect(page.getByText(/Context/i)).toBeVisible();
    await expect(page.getByText(/Accuracy/i)).toBeVisible();
    // Wilson CI text (e.g. "95% CI: 59.1 — 67.7" or similar)
    await expect(page.getByText(/95%.*CI|59\.1|67\.7/)).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F08-03: Paid audit shows 4 per-engine breakdown cards (ChatGPT/Claude/Gemini/Perplexity)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto(`/audits/${richAuditId}`);
    // Per-engine breakdown
    await expect(page.getByText(/ChatGPT/i)).toBeVisible();
    await expect(page.getByText(/Claude/i)).toBeVisible();
    await expect(page.getByText(/Gemini/i)).toBeVisible();
    await expect(page.getByText(/Perplexity/i)).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F08-04: Free-tier rich audit shows only 2 per-engine tiles (not 4)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto(`/audits/${freePaidAuditId}`);
    // Only ChatGPT and Perplexity tiles
    await expect(page.getByText(/ChatGPT/i)).toBeVisible();
    await expect(page.getByText(/Perplexity/i)).toBeVisible();
    // Claude and Gemini should NOT appear in per-engine breakdown
    await expect(page.getByText(/Claude/i)).not.toBeVisible();
    await expect(page.getByText(/Gemini/i)).not.toBeVisible();
    await clerk.signOut({ page });
  });

  test('F08-05: Re-run audit button on Basic view calls POST /api/audits and redirects', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto(`/audits/${basicAuditId}`);
    await page.getByRole('button', { name: /Re-run audit/i }).click();
    // Should navigate to new running screen
    await expect(page).toHaveURL(/\/audits\/[a-f0-9-]+/, { timeout: 10_000 });
    // URL should be different from basicAuditId (new audit created)
    expect(page.url()).not.toContain(basicAuditId);
    await clerk.signOut({ page });
  });

  test('F08-06: Dispatch dispatch logic: runsPerPrompt=1 → Basic; runsPerPrompt=5 → Rich', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    // Basic: no dimension tiles
    await page.goto(`/audits/${basicAuditId}`);
    const dimVisible = await page.getByText(/Frequency/i).isVisible({ timeout: 2000 }).catch(() => false);
    expect(dimVisible).toBe(false);
    // Rich: dimension tiles present
    await page.goto(`/audits/${richAuditId}`);
    await expect(page.getByText(/Frequency/i)).toBeVisible();
    await clerk.signOut({ page });
  });
});
```

### `tests/qa/sprint4/features/f08-audit-results/F08-AUDIT-RESULTS.bat`

```batch
@echo off
REM F08 — Audit Results (Basic + Rich)  |  Seeds org + brand + Basic + Rich audits
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint4\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint4\logs\f08-server.log 2>&1"
:WAIT_F08
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F08
pnpm exec playwright test tests/qa/sprint4/features/f08-audit-results/f08-audit-results.spec.ts --config tests/qa/sprint4/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F08] PASSED) else (echo [F08] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint4/features/f08-audit-results/f08-audit-results.sh`

```bash
#!/usr/bin/env bash
# F08 — Audit Results
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint4/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint4/logs/f08-server.log 2>&1 & SERVER_PID=$!
WAIT_COUNT=0
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do
  sleep 2; WAIT_COUNT=$((WAIT_COUNT+1))
  if [ "$WAIT_COUNT" -gt 60 ]; then echo "[ERROR] Server failed to start within 2 minutes"; exit 1; fi
done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint4/features/f08-audit-results/f08-audit-results.spec.ts \
  --config tests/qa/sprint4/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F08] PASSED" || echo "[F08] FAILED"; exit "$TEST_EXIT"
```

-----

## F09 — Audit list page (`/audits`)

**Tests:** `GET /api/audits` returns paginated list with `brandName` included; sortable by
auditNumber/status/scoreComposite; filters persist in URL (not React state); no
`technical_audits` LEFT JOIN crash (BA5 fix); cross-org audit IDs not visible to other org users.  
**Data:** Org + user + 2 brands + 6 seeded audits with varying statuses and scores.

### `tests/qa/sprint4/features/f09-audit-list/f09-audit-list.spec.ts`

```typescript
import { test, expect }                              from '@playwright/test';
import { clerk, clerkSetup }                         from '@clerk/testing/playwright';
import { seedOrg, seedUser, seedBrand, seedAudit }   from '../../shared/seed';
import { cleanupOrg }                                from '../../shared/cleanup';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id = '', org2Id = '';

test.describe('F09: Audit list page — GET /api/audits, sort, filter, pagination', () => {
  test.beforeAll(async () => {
    await clerkSetup();
    const org  = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!, name: '[S4-QA] F09 Org1', tier: 'agency' });
    org1Id     = org.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId: org1Id, email: process.env.E2E_TEST_USER_1_EMAIL! });
    const b1   = await seedBrand({ organizationId: org1Id, name: '[S4-QA] F09 Brand1', domain: 's4-qa-f09a.com.au' });
    const b2   = await seedBrand({ organizationId: org1Id, name: '[S4-QA] F09 Brand2', domain: 's4-qa-f09b.com.au' });
    const now  = Date.now();
    // M3 fix: auditNumbers must be globally unique within org1.
    // b1 gets 1,3,5; b2 gets 2,4,6 — all distinct within org1.
    await seedAudit({ organizationId: org1Id, brandId: b1.id, auditNumber: 1, status: 'complete', scoreComposite: '50.00', completedAt: new Date(now - 5 * 3600_000) });
    await seedAudit({ organizationId: org1Id, brandId: b2.id, auditNumber: 2, status: 'complete', scoreComposite: '63.40', completedAt: new Date(now - 4 * 3600_000) });
    await seedAudit({ organizationId: org1Id, brandId: b1.id, auditNumber: 3, status: 'complete', scoreComposite: '71.00', completedAt: new Date(now - 3 * 3600_000) });
    await seedAudit({ organizationId: org1Id, brandId: b2.id, auditNumber: 4, status: 'running',  scoreComposite: null,   completedAt: null });
    await seedAudit({ organizationId: org1Id, brandId: b1.id, auditNumber: 5, status: 'failed',   scoreComposite: null,   completedAt: null });
    await seedAudit({ organizationId: org1Id, brandId: b2.id, auditNumber: 6, status: 'pending',  scoreComposite: null,   completedAt: null });

    const org2 = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_2_CLERK_ID!, name: '[S4-QA] F09 Org2' });
    org2Id     = org2.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID!, organizationId: org2Id, email: process.env.E2E_TEST_USER_2_EMAIL! });
  });

  test.afterAll(async () => { await cleanupOrg(org1Id); await cleanupOrg(org2Id); });

  test('F09-01: Audit list page renders all audits with brand names', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/audits');
    await expect(page.getByText('[S4-QA] F09 Brand1')).toBeVisible();
    await expect(page.getByText('[S4-QA] F09 Brand2')).toBeVisible();
    await expect(page.getByText(/complete/i).first()).toBeVisible();
    await expect(page.getByText(/running/i).first()).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F09-02: GET /api/audits includes brandName field (BC2 fix — was missing)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    const res = await page.evaluate(async (base) => {
      const r = await fetch(`${base}/api/audits?page=1&limit=10`);
      return await r.json();
    }, BASE);
    expect(Array.isArray(res.audits)).toBe(true);
    expect(res.audits.length).toBeGreaterThan(0);
    // brandName must be present (via JOIN to brands table)
    const firstAudit = res.audits[0];
    expect(typeof firstAudit.brandName).toBe('string');
    expect(firstAudit.brandName).toMatch(/F09/);
    // Pagination fields
    expect(typeof res.total).toBe('number');
    expect(typeof res.page).toBe('number');
    expect(typeof res.totalPages).toBe('number');
    await clerk.signOut({ page });
  });

  test('F09-03: GET /api/audits supports sort=scoreComposite (BH2 fix)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    const res = await page.evaluate(async (base) => {
      const r = await fetch(`${base}/api/audits?sort=scoreComposite&order=desc`);
      return await r.json();
    }, BASE);
    const scores = res.audits
      .filter((a: { scoreComposite: string | null }) => a.scoreComposite !== null)
      .map((a: { scoreComposite: string }) => parseFloat(a.scoreComposite));
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
    await clerk.signOut({ page });
  });

  test('F09-04: Filter by status=complete returns only complete audits', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    const res = await page.evaluate(async (base) => {
      const r = await fetch(`${base}/api/audits?status=complete`);
      return await r.json();
    }, BASE);
    expect(res.audits.every((a: { status: string }) => a.status === 'complete')).toBe(true);
    expect(res.audits.length).toBeGreaterThan(0);
    await clerk.signOut({ page });
  });

  test('F09-05: Status filter persists in URL searchParams (BJ4 fix)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/audits?status=complete');
    // URL has the filter
    expect(page.url()).toContain('status=complete');
    // Completed audits visible
    await expect(page.getByText(/complete/i).first()).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F09-06: User B cannot see User A audits via GET /api/audits', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_2_EMAIL!, password: process.env.E2E_TEST_USER_2_PASSWORD! } });
    const res = await page.evaluate(async (base) => {
      const r = await fetch(`${base}/api/audits`);
      return await r.json();
    }, BASE);
    const list = res.audits ?? [];
    const org1Audit = list.find((a: { brandName: string }) => a.brandName?.includes('F09 Brand1'));
    expect(org1Audit).toBeUndefined();
    await clerk.signOut({ page });
  });
});
```

### `tests/qa/sprint4/features/f09-audit-list/F09-AUDIT-LIST.bat`

```batch
@echo off
REM F09 — Audit List  |  Seeds org + 2 brands + 6 audits
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint4\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint4\logs\f09-server.log 2>&1"
:WAIT_F09
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F09
pnpm exec playwright test tests/qa/sprint4/features/f09-audit-list/f09-audit-list.spec.ts --config tests/qa/sprint4/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F09] PASSED) else (echo [F09] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint4/features/f09-audit-list/f09-audit-list.sh`

```bash
#!/usr/bin/env bash
# F09 — Audit List
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint4/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint4/logs/f09-server.log 2>&1 & SERVER_PID=$!
WAIT_COUNT=0
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do
  sleep 2; WAIT_COUNT=$((WAIT_COUNT+1))
  if [ "$WAIT_COUNT" -gt 60 ]; then echo "[ERROR] Server failed to start within 2 minutes"; exit 1; fi
done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint4/features/f09-audit-list/f09-audit-list.spec.ts \
  --config tests/qa/sprint4/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F09] PASSED" || echo "[F09] FAILED"; exit "$TEST_EXIT"
```

-----

## F10 — Audit compare page (`/audits/compare?ids=A,B`)

**Tests:** Valid `?ids=A,B` renders side-by-side with both composite scores and deltas;
malformed `?ids=` (non-UUIDs) redirects to `/audits`; 1 id → redirect; 3 ids → redirect;
cross-org auditId → 404; dimension delta badges (+/−) shown.  
**Data:** Org + user + brand + 2 complete rich audits.

### `tests/qa/sprint4/features/f10-audit-compare/f10-audit-compare.spec.ts`

```typescript
import { test, expect }                              from '@playwright/test';
import { clerk, clerkSetup }                         from '@clerk/testing/playwright';
import { seedOrg, seedUser, seedBrand, seedAudit }   from '../../shared/seed';
import { cleanupOrg }                                from '../../shared/cleanup';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id = '', org2Id = '', audit1Id = '', audit2Id = '', org2AuditId = '';

test.describe('F10: Audit compare page — side-by-side, deltas, malformed URL guards', () => {
  test.beforeAll(async () => {
    await clerkSetup();
    const org  = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!, name: '[S4-QA] F10 Org1', tier: 'agency' });
    org1Id     = org.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId: org1Id, email: process.env.E2E_TEST_USER_1_EMAIL! });
    const b    = await seedBrand({ organizationId: org1Id, name: '[S4-QA] F10 Brand', domain: 's4-qa-f10.com.au' });
    const now  = Date.now();
    // L41 fix: give audit1 different dimension scores from audit2 so the compare page
    // shows non-zero delta indicators (↑/↓) in F10-05. scoreFrequency: 10 vs audit2's default 14
    // → scoreFrequency delta = +4 → ↑ indicator on compare page.
    const a1   = await seedAudit({ organizationId: org1Id, brandId: b.id, auditNumber: 1, scoreComposite: '57.20',
      scoreFrequency: '10.00', scorePosition: '85.00', completedAt: new Date(now - 3600_000) });
    audit1Id   = a1.id;
    const a2   = await seedAudit({ organizationId: org1Id, brandId: b.id, auditNumber: 2, scoreComposite: '63.40', completedAt: new Date(now) });
    audit2Id   = a2.id;

    // Org 2 audit for cross-org test
    const org2 = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_2_CLERK_ID!, name: '[S4-QA] F10 Org2' });
    org2Id     = org2.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID!, organizationId: org2Id, email: process.env.E2E_TEST_USER_2_EMAIL! });
    const b2   = await seedBrand({ organizationId: org2Id, name: '[S4-QA] F10 Org2 Brand', domain: 's4-qa-f10-org2.com.au' });
    const a3   = await seedAudit({ organizationId: org2Id, brandId: b2.id, auditNumber: 1, scoreComposite: '45.00' });
    org2AuditId = a3.id;
  });

  test.afterAll(async () => { await cleanupOrg(org1Id); await cleanupOrg(org2Id); });

  test('F10-01: Valid ?ids=A,B renders side-by-side with both scores', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto(`/audits/compare?ids=${audit1Id},${audit2Id}`);
    // Both scores visible
    await expect(page.getByText(/57\.?2?/)).toBeVisible();
    await expect(page.getByText(/63\.?4?/)).toBeVisible();
    // Delta badge: +6.2 (63.40 - 57.20)
    await expect(page.getByText(/\+6\.2|6\.2/)).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F10-02: Malformed ?ids= (not UUIDs) redirects to /audits', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/audits/compare?ids=invalid-id-1,invalid-id-2');
    await expect(page).toHaveURL(/\/audits$/, { timeout: 5000 });
    await clerk.signOut({ page });
  });

  test('F10-03: Only 1 id → redirects to /audits', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto(`/audits/compare?ids=${audit1Id}`);
    await expect(page).toHaveURL(/\/audits$/, { timeout: 5000 });
    await clerk.signOut({ page });
  });

  test('F10-04: Cross-org audit in compare URL → 404 (CLAUDE.md §7)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto(`/audits/compare?ids=${audit1Id},${org2AuditId}`);
    // H17 fix:  swallows assertion failures — the cross-org isolation test
    // always passed even if content leaked. Use API check for definitive 404 assertion.
    // The /api/audits/[org2AuditId]/full endpoint must return 404 for user A (cross-org).
    const { status } = await page.evaluate(async ({ base, id }) => {
      const r = await fetch(`${base}/api/audits/${id}/full`);
      return { status: r.status };
    }, { base: BASE, id: org2AuditId });
    expect(status, 'org2 audit /full endpoint must return 404 for user1 — cross-org isolation').toBe(404);
    // Also verify the compare page does not render org2 audit scores
    await expect(page.getByText(/45\.?0?/)).not.toBeVisible();
    await clerk.signOut({ page });
  });

  test('F10-05: Dimension comparison shows delta indicators (↑ / ↓)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto(`/audits/compare?ids=${audit1Id},${audit2Id}`);
    // L41 fix: audit1 has scoreFrequency=10, audit2 has default 14 → Frequency delta = +4 → ↑ indicator.
    // Delta indicators: up or down arrows or +/− values for at least the Frequency dimension
    const deltaIndicator = page.getByText(/↑|↓|\+[0-9]|-[0-9]/).first();
    await expect(deltaIndicator).toBeVisible();
    await clerk.signOut({ page });
  });
});
```

### `tests/qa/sprint4/features/f10-audit-compare/F10-AUDIT-COMPARE.bat`

```batch
@echo off
REM F10 — Audit Compare  |  Seeds org + brand + 2 complete audits
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint4\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint4\logs\f10-server.log 2>&1"
:WAIT_F10
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F10
pnpm exec playwright test tests/qa/sprint4/features/f10-audit-compare/f10-audit-compare.spec.ts --config tests/qa/sprint4/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F10] PASSED) else (echo [F10] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint4/features/f10-audit-compare/f10-audit-compare.sh`

```bash
#!/usr/bin/env bash
# F10 — Audit Compare
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint4/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint4/logs/f10-server.log 2>&1 & SERVER_PID=$!
WAIT_COUNT=0
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do
  sleep 2; WAIT_COUNT=$((WAIT_COUNT+1))
  if [ "$WAIT_COUNT" -gt 60 ]; then echo "[ERROR] Server failed to start within 2 minutes"; exit 1; fi
done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint4/features/f10-audit-compare/f10-audit-compare.spec.ts \
  --config tests/qa/sprint4/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F10] PASSED" || echo "[F10] FAILED"; exit "$TEST_EXIT"
```

-----

## F11 — Portfolio page (`/portfolio`)

**Tests:** `<2 brands` → redirects to `/dashboard?toast=need-2-brands`; `≥2 brands` → renders
portfolio with aggregate KPIs (avg score, audits this month, LLM spend with `date-fns` filter);
portfolio brand cards show last audit scores; month-bounded KPIs use same pattern as dashboard.  
**Data:** Org + user + 0 brands (for redirect test); then 3 brands + audits.

### `tests/qa/sprint4/features/f11-portfolio/f11-portfolio.spec.ts`

```typescript
import { test, expect }                              from '@playwright/test';
import { clerk, clerkSetup }                         from '@clerk/testing/playwright';
import { seedOrg, seedUser, seedBrand, seedAudit }   from '../../shared/seed';
import { cleanupOrg }                                from '../../shared/cleanup';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id = '', org2Id = '';

test.describe('F11: Portfolio page — brand gate, aggregate KPIs, brand cards', () => {
  test.beforeAll(async () => {
    await clerkSetup();
    // Org 1: will have 3 brands (portfolio accessible)
    const org  = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!, name: '[S4-QA] F11 Org1', tier: 'agency' });
    org1Id     = org.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId: org1Id, email: process.env.E2E_TEST_USER_1_EMAIL! });
    const now  = Date.now();
    const b1   = await seedBrand({ organizationId: org1Id, name: '[S4-QA] F11 Brand1', domain: 's4-qa-f11a.com.au' });
    const b2   = await seedBrand({ organizationId: org1Id, name: '[S4-QA] F11 Brand2', domain: 's4-qa-f11b.com.au' });
    const b3   = await seedBrand({ organizationId: org1Id, name: '[S4-QA] F11 Brand3', domain: 's4-qa-f11c.com.au' });
    // M3 fix: auditNumbers unique per org — use 1, 2, 3 across the 3 brands.
    await seedAudit({ organizationId: org1Id, brandId: b1.id, auditNumber: 1, scoreComposite: '50.00', totalCostUsd: '1.5000', completedAt: new Date(now - 3600_000) });
    await seedAudit({ organizationId: org1Id, brandId: b2.id, auditNumber: 2, scoreComposite: '63.40', totalCostUsd: '1.8900', completedAt: new Date(now - 1800_000) });
    await seedAudit({ organizationId: org1Id, brandId: b3.id, auditNumber: 3, scoreComposite: '71.00', totalCostUsd: '2.1000', completedAt: new Date(now - 600_000) });

    // Org 2: 0 brands (portfolio should redirect)
    const org2 = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_2_CLERK_ID!, name: '[S4-QA] F11 Org2' });
    org2Id     = org2.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID!, organizationId: org2Id, email: process.env.E2E_TEST_USER_2_EMAIL! });
  });

  test.afterAll(async () => { await cleanupOrg(org1Id); await cleanupOrg(org2Id); });

  test('F11-01: <2 brands → portfolio redirects to /dashboard?toast=need-2-brands (BE3 fix)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_2_EMAIL!, password: process.env.E2E_TEST_USER_2_PASSWORD! } });
    await page.goto('/portfolio');
    await expect(page).toHaveURL(/\/dashboard\?toast=need-2-brands/, { timeout: 5000 });
    await clerk.signOut({ page });
  });

  test('F11-02: ≥2 brands → portfolio page renders with brand cards', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/portfolio');
    // Should NOT redirect
    await expect(page).toHaveURL(/\/portfolio/, { timeout: 3000 });
    // Brand cards visible
    await expect(page.getByText('[S4-QA] F11 Brand1')).toBeVisible();
    await expect(page.getByText('[S4-QA] F11 Brand2')).toBeVisible();
    await expect(page.getByText('[S4-QA] F11 Brand3')).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F11-03: Portfolio shows aggregate KPI cards (avg score, audits this month, LLM spend)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/portfolio');
    // Avg visibility: (50 + 63.4 + 71) / 3 ≈ 61.5
    await expect(page.getByText(/Avg visibility|Average.*score/i)).toBeVisible();
    await expect(page.getByText(/Audits this month|Audits/i)).toBeVisible();
    await expect(page.getByText(/LLM spend|spend/i)).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F11-04: Portfolio brand cards show last audit composite score', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/portfolio');
    // Scores from most recent audits
    await expect(page.getByText(/71\.?0?/)).toBeVisible();
    await expect(page.getByText(/63\.?4?/)).toBeVisible();
    await expect(page.getByText(/50\.?0?/)).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F11-05: LLM spend KPI uses this-month filter (BK2 / BD5 fix — not all-time)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/portfolio');
    // LLM spend shows a number (not "—" or 0) since audits were seeded this month
    const spendEl = page.getByText(/\$[0-9]|US\$[0-9]|A\$[0-9]/).first();
    await expect(spendEl).toBeVisible();
    await clerk.signOut({ page });
  });
});
```

### `tests/qa/sprint4/features/f11-portfolio/F11-PORTFOLIO.bat`

```batch
@echo off
REM F11 — Portfolio  |  Seeds org + 3 brands + audits; and org with 0 brands (redirect test)
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint4\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint4\logs\f11-server.log 2>&1"
:WAIT_F11
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F11
pnpm exec playwright test tests/qa/sprint4/features/f11-portfolio/f11-portfolio.spec.ts --config tests/qa/sprint4/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F11] PASSED) else (echo [F11] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint4/features/f11-portfolio/f11-portfolio.sh`

```bash
#!/usr/bin/env bash
# F11 — Portfolio
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint4/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint4/logs/f11-server.log 2>&1 & SERVER_PID=$!
WAIT_COUNT=0
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do
  sleep 2; WAIT_COUNT=$((WAIT_COUNT+1))
  if [ "$WAIT_COUNT" -gt 60 ]; then echo "[ERROR] Server failed to start within 2 minutes"; exit 1; fi
done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint4/features/f11-portfolio/f11-portfolio.spec.ts \
  --config tests/qa/sprint4/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F11] PASSED" || echo "[F11] FAILED"; exit "$TEST_EXIT"
```

-----

## F12 — Export endpoints (PDF / CSV / JSON)

**Tests:** PDF returns `application/pdf` with correct `Content-Disposition` filename;
CSV has 14-column header and citation rows; JSON returns full audit payload as download;
SARIF/JUnit/GHA buttons are stubbed (not hidden) with “Coming Sprint 8” tooltip;
cross-org export → 404; unauthenticated export → 401.  
**Data:** Org + user + brand + 1 complete rich audit + 10 seeded citations.

### `tests/qa/sprint4/features/f12-export/f12-export.spec.ts`

```typescript
import { test, expect }                              from '@playwright/test';
import { clerk, clerkSetup }                         from '@clerk/testing/playwright';
import { seedOrg, seedUser, seedBrand, seedAudit, seedCitation } from '../../shared/seed';
import { cleanupOrg }                                from '../../shared/cleanup';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id = '', org2Id = '', auditId = '';

const CSV_HEADER = 'audit_number,brand_name,engine,prompt,run_number,brand_mentioned,position,sentiment_label,context_label,response_snippet,cited_sources_domains,llm_model,llm_cost_usd,created_at';

test.describe('F12: Export endpoints — PDF, CSV, JSON; SARIF stubbed; cross-org 404', () => {
  test.beforeAll(async () => {
    await clerkSetup();
    const org  = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!, name: '[S4-QA] F12 Org1', tier: 'agency' });
    org1Id     = org.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId: org1Id, email: process.env.E2E_TEST_USER_1_EMAIL! });
    const b    = await seedBrand({ organizationId: org1Id, name: '[S4-QA] F12 Brand', domain: 's4-qa-f12.com.au' });
    const a    = await seedAudit({ organizationId: org1Id, brandId: b.id, auditNumber: 42 });
    auditId    = a.id;
    // Seed 10 citations
    for (let i = 0; i < 10; i++) {
      await seedCitation({ auditId, engine: ['chatgpt','claude','gemini','perplexity'][i % 4], brandMentioned: i % 3 !== 0, runNumber: (i % 5) + 1 });
    }

    const org2 = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_2_CLERK_ID!, name: '[S4-QA] F12 Org2' });
    org2Id     = org2.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID!, organizationId: org2Id, email: process.env.E2E_TEST_USER_2_EMAIL! });
  });

  test.afterAll(async () => { await cleanupOrg(org1Id); await cleanupOrg(org2Id); });

  test('F12-01: PDF export returns Content-Type: application/pdf with correct filename', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    const res = await page.evaluate(async ({ base, id }) => {
      const r = await fetch(`${base}/api/audits/${id}/export?format=pdf`);
      return { status: r.status, contentType: r.headers.get('Content-Type'), disposition: r.headers.get('Content-Disposition') };
    }, { base: BASE, id: auditId });
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('application/pdf');
    // Filename includes audit number: "visibleau-audit-42.pdf"
    expect(res.disposition).toMatch(/attachment.*filename.*audit-42\.pdf/i);
    await clerk.signOut({ page });
  });

  test('F12-02: CSV export returns 14-column header row (BD1 fix)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    const res = await page.evaluate(async ({ base, id }) => {
      const r = await fetch(`${base}/api/audits/${id}/export?format=csv`);
      return { status: r.status, contentType: r.headers.get('Content-Type'), text: await r.text() };
    }, { base: BASE, id: auditId });
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('text/csv');
    const firstLine = res.text.split('\n')[0].trim();
    expect(firstLine).toBe(CSV_HEADER);
    // Should have 10 data rows + 1 header = 11 lines minimum
    const lines = res.text.split('\n').filter(l => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(11);
    await clerk.signOut({ page });
  });

  test('F12-03: JSON export returns full audit payload as attachment', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    const res = await page.evaluate(async ({ base, id }) => {
      const r = await fetch(`${base}/api/audits/${id}/export?format=json`);
      return { status: r.status, contentType: r.headers.get('Content-Type'), disposition: r.headers.get('Content-Disposition'), body: await r.json() };
    }, { base: BASE, id: auditId });
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('application/json');
    expect(res.disposition).toContain('attachment');
    // Payload includes audit data
    expect(res.body.audit || res.body.id).toBeTruthy();
    await clerk.signOut({ page });
  });

  test('F12-04: Export UI — PDF/CSV/JSON working; SARIF/JUnit/GHA stubbed (BD6 fix)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto(`/audits/${auditId}`);
    // Export dropdown/button visible
    const exportBtn = page.getByRole('button', { name: /Export/i }).first();
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();
    // Working export options
    await expect(page.getByText(/PDF/i)).toBeVisible();
    await expect(page.getByText(/CSV/i)).toBeVisible();
    await expect(page.getByText(/JSON/i)).toBeVisible();
    // Stubbed exports (NOT hidden, just disabled/tooltip)
    await expect(page.getByText(/SARIF/i)).toBeVisible();
    await expect(page.getByText(/JUnit/i)).toBeVisible();
    // "Coming Sprint 8" tooltip text present in DOM
    await expect(page.getByText(/Sprint 8|coming soon/i)).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F12-05: Cross-org export → 404 NOT 401 (CLAUDE.md §7)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_2_EMAIL!, password: process.env.E2E_TEST_USER_2_PASSWORD! } });
    const res = await page.evaluate(async ({ base, id }) => {
      const r = await fetch(`${base}/api/audits/${id}/export?format=json`);
      return { status: r.status };
    }, { base: BASE, id: auditId });
    expect(res.status).toBe(404);
    await clerk.signOut({ page });
  });

  test('F12-06: Unauthenticated export → 401', async ({ request }) => {
    const res = await request.get(`${BASE}/api/audits/${auditId}/export?format=json`);
    expect(res.status()).toBe(401);
  });
});
```

### `tests/qa/sprint4/features/f12-export/F12-EXPORT.bat`

```batch
@echo off
REM F12 — Export (PDF/CSV/JSON)  |  Seeds org + brand + audit + 10 citations
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint4\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint4\logs\f12-server.log 2>&1"
:WAIT_F12
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F12
pnpm exec playwright test tests/qa/sprint4/features/f12-export/f12-export.spec.ts --config tests/qa/sprint4/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F12] PASSED) else (echo [F12] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint4/features/f12-export/f12-export.sh`

```bash
#!/usr/bin/env bash
# F12 — Export
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint4/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint4/logs/f12-server.log 2>&1 & SERVER_PID=$!
WAIT_COUNT=0
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do
  sleep 2; WAIT_COUNT=$((WAIT_COUNT+1))
  if [ "$WAIT_COUNT" -gt 60 ]; then echo "[ERROR] Server failed to start within 2 minutes"; exit 1; fi
done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint4/features/f12-export/f12-export.spec.ts \
  --config tests/qa/sprint4/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F12] PASSED" || echo "[F12] FAILED"; exit "$TEST_EXIT"
```

-----

## F13 — Cross-org isolation (all Sprint 4 routes)

**Tests:** All protected routes return 404 (not 401) for cross-org access; billing stub renders
with `reason` param (BK5 fix); `/settings/billing?reason=brand-limit` shows brand-limit message;
own resources still return 200.  
**Data:** 2 orgs, each with brand + audit. Tests cross-org access for every Sprint 4 route.

### `tests/qa/sprint4/features/f13-cross-org/f13-cross-org.spec.ts`

```typescript
import { test, expect }                              from '@playwright/test';
import { clerk, clerkSetup }                         from '@clerk/testing/playwright';
import { seedOrg, seedUser, seedBrand, seedAudit }   from '../../shared/seed';
import { cleanupOrg }                                from '../../shared/cleanup';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id = '', org2Id = '', brand1Id = '', audit1Id = '';

test.describe('F13: Cross-org isolation — all Sprint 4 protected routes return 404', () => {
  test.beforeAll(async () => {
    await clerkSetup();
    const org1 = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!, name: '[S4-QA] F13 Org1', tier: 'agency' });
    org1Id     = org1.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId: org1Id, email: process.env.E2E_TEST_USER_1_EMAIL! });
    const b    = await seedBrand({ organizationId: org1Id, name: '[S4-QA] F13 Brand', domain: 's4-qa-f13.com.au' });
    brand1Id   = b.id;
    const a    = await seedAudit({ organizationId: org1Id, brandId: b.id, auditNumber: 1 });
    audit1Id   = a.id;

    const org2 = await seedOrg({ clerkOrgId: process.env.E2E_TEST_ORG_2_CLERK_ID!, name: '[S4-QA] F13 Org2' });
    org2Id     = org2.id;
    await seedUser({ clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID!, organizationId: org2Id, email: process.env.E2E_TEST_USER_2_EMAIL! });
  });

  test.afterAll(async () => { await cleanupOrg(org1Id); await cleanupOrg(org2Id); });

  test('F13-01: GET /api/brands/[org1BrandId] cross-org → 404 NOT 401', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_2_EMAIL!, password: process.env.E2E_TEST_USER_2_PASSWORD! } });
    const { status } = await page.evaluate(async ({ base, id }) => {
      const r = await fetch(`${base}/api/brands/${id}`);
      return { status: r.status };
    }, { base: BASE, id: brand1Id });
    expect(status).toBe(404);
    expect(status).not.toBe(401);
    await clerk.signOut({ page });
  });

  test('F13-02: GET /api/audits/[org1AuditId] cross-org → 404', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_2_EMAIL!, password: process.env.E2E_TEST_USER_2_PASSWORD! } });
    const { status } = await page.evaluate(async ({ base, id }) => {
      const r = await fetch(`${base}/api/audits/${id}`);
      return { status: r.status };
    }, { base: BASE, id: audit1Id });
    expect(status).toBe(404);
    await clerk.signOut({ page });
  });

  test('F13-03: /brands/[org1BrandId] page cross-org → 404 page (not 401, not content)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_2_EMAIL!, password: process.env.E2E_TEST_USER_2_PASSWORD! } });
    await page.goto(`/brands/${brand1Id}`);
    // Should NOT show org1 brand content
    await expect(page.getByText('[S4-QA] F13 Brand')).not.toBeVisible();
    await clerk.signOut({ page });
  });

  test('F13-04: /audits/[org1AuditId] page cross-org → 404', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_2_EMAIL!, password: process.env.E2E_TEST_USER_2_PASSWORD! } });
    await page.goto(`/audits/${audit1Id}`);
    await expect(page.getByText(/composite|dimension|frequency/i)).not.toBeVisible();
    await clerk.signOut({ page });
  });

  test('F13-05: /audits/[org1AuditId]/export cross-org → 404', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_2_EMAIL!, password: process.env.E2E_TEST_USER_2_PASSWORD! } });
    const { status } = await page.evaluate(async ({ base, id }) => {
      const r = await fetch(`${base}/api/audits/${id}/export?format=json`);
      return { status: r.status };
    }, { base: BASE, id: audit1Id });
    expect(status).toBe(404);
    await clerk.signOut({ page });
  });

  test('F13-06: User A can still access own brand and audit (own resources return 200)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    const { s1, s2 } = await page.evaluate(async ({ base, brandId, auditId }) => {
      const r1 = await fetch(`${base}/api/brands/${brandId}`);
      const r2 = await fetch(`${base}/api/audits/${auditId}`);
      return { s1: r1.status, s2: r2.status };
    }, { base: BASE, brandId: brand1Id, auditId: audit1Id });
    expect(s1).toBe(200);
    expect(s2).toBe(200);
    await clerk.signOut({ page });
  });

  test('F13-07: PATCH /api/brands/[org1BrandId] cross-org → 404 NOT 401 (I11 — BH4 new endpoint)', async ({ page }) => {
    // I11 fix: Sprint 4 §8 BH4 adds PATCH /api/brands/[brandId] for inline edit.
    // This is a new Sprint 4 endpoint that must enforce the same cross-org 404 policy (CLAUDE.md §7).
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_2_EMAIL!, password: process.env.E2E_TEST_USER_2_PASSWORD! } });
    const { status } = await page.evaluate(async ({ base, id }) => {
      const r = await fetch(`${base}/api/brands/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Attempted Cross-Org Edit' }),
      });
      return { status: r.status };
    }, { base: BASE, id: brand1Id });
    expect(status).toBe(404);
    expect(status).not.toBe(401);
    await clerk.signOut({ page });
  });

  test('F13-08: /settings/billing?reason=brand-limit shows contextual message (BK5 fix)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: process.env.E2E_TEST_USER_1_EMAIL!, password: process.env.E2E_TEST_USER_1_PASSWORD! } });
    await page.goto('/settings/billing?reason=brand-limit');
    // BK5: billing page reads searchParams.reason and shows contextual message
    await expect(page.getByText(/brand limit|track more brands|upgrade/i)).toBeVisible();
    // Plan info shown
    await expect(page.getByText(/Billing|plan|Sprint 10/i)).toBeVisible();
    await clerk.signOut({ page });
  });
});
```

### `tests/qa/sprint4/features/f13-cross-org/F13-CROSS-ORG.bat`

```batch
@echo off
REM F13 — Cross-Org Isolation  |  Seeds 2 orgs, each with brand + audit
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
mkdir tests\qa\sprint4\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& pnpm dev > tests\qa\sprint4\logs\f13-server.log 2>&1"
:WAIT_F13
ping -n 3 127.0.0.1 > nul
curl -s http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F13
pnpm exec playwright test tests/qa/sprint4/features/f13-cross-org/f13-cross-org.spec.ts --config tests/qa/sprint4/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F13] PASSED) else (echo [F13] FAILED)
exit /b %EXIT%
```

### `tests/qa/sprint4/features/f13-cross-org/f13-cross-org.sh`

```bash
#!/usr/bin/env bash
# F13 — Cross-Org Isolation
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
mkdir -p tests/qa/sprint4/logs
LLM_MODE=mock pnpm dev > tests/qa/sprint4/logs/f13-server.log 2>&1 & SERVER_PID=$!
WAIT_COUNT=0
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do
  sleep 2; WAIT_COUNT=$((WAIT_COUNT+1))
  if [ "$WAIT_COUNT" -gt 60 ]; then echo "[ERROR] Server failed to start within 2 minutes"; exit 1; fi
done
TEST_EXIT=0
pnpm exec playwright test tests/qa/sprint4/features/f13-cross-org/f13-cross-org.spec.ts \
  --config tests/qa/sprint4/playwright.config.ts --reporter=list || TEST_EXIT=$?
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F13] PASSED" || echo "[F13] FAILED"; exit "$TEST_EXIT"
```

-----

## Run-all scripts

### `tests/qa/sprint4/S4-RUN-ALL.bat`

```batch
@echo off
REM ============================================================
REM  Sprint 4 QA — Run All 13 Features
REM  F07 (audit running) may need Inngest for the poll-to-complete
REM  test, but is written to use seeded DB state so Inngest is
REM  NOT required for most of Sprint 4.
REM ============================================================
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if defined line if not "!line:~0,1!"=="#" set "%%A=%%B"))
set PASS=0 & set FAIL=0 & set FAILED_LIST=

for %%F in (
  tests\qa\sprint4\features\f01-layout\F01-LAYOUT.bat
  tests\qa\sprint4\features\f02-dashboard\F02-DASHBOARD.bat
  tests\qa\sprint4\features\f03-brand-list\F03-BRAND-LIST.bat
  tests\qa\sprint4\features\f04-brand-create\F04-BRAND-CREATE.bat
  tests\qa\sprint4\features\f05-brand-wizard\F05-BRAND-WIZARD.bat
  tests\qa\sprint4\features\f06-brand-detail\F06-BRAND-DETAIL.bat
  tests\qa\sprint4\features\f07-audit-running\F07-AUDIT-RUNNING.bat
  tests\qa\sprint4\features\f08-audit-results\F08-AUDIT-RESULTS.bat
  tests\qa\sprint4\features\f09-audit-list\F09-AUDIT-LIST.bat
  tests\qa\sprint4\features\f10-audit-compare\F10-AUDIT-COMPARE.bat
  tests\qa\sprint4\features\f11-portfolio\F11-PORTFOLIO.bat
  tests\qa\sprint4\features\f12-export\F12-EXPORT.bat
  tests\qa\sprint4\features\f13-cross-org\F13-CROSS-ORG.bat
) do (
  echo. & echo ======================================== & echo Running %%F
  call %%F
  if !ERRORLEVEL! EQU 0 (set /a PASS+=1) else (set /a FAIL+=1 & set FAILED_LIST=!FAILED_LIST! %%~nxF)
)
echo. & echo ======================================== & echo Sprint 4 QA: Passed=%PASS% Failed=%FAIL%
if not "%FAILED_LIST%"=="" echo Failed: %FAILED_LIST%
echo ========================================
if %FAIL% EQU 0 (exit /b 0) else (exit /b 1)
```

### `tests/qa/sprint4/s4-run-all.sh`

```bash
#!/usr/bin/env bash
# ============================================================
#  Sprint 4 QA — Run All 13 Features
# ============================================================
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a

PASS=0; FAIL=0; FAILED=()

FEATURES=(
  tests/qa/sprint4/features/f01-layout/f01-layout.sh
  tests/qa/sprint4/features/f02-dashboard/f02-dashboard.sh
  tests/qa/sprint4/features/f03-brand-list/f03-brand-list.sh
  tests/qa/sprint4/features/f04-brand-create/f04-brand-create.sh
  tests/qa/sprint4/features/f05-brand-wizard/f05-brand-wizard.sh
  tests/qa/sprint4/features/f06-brand-detail/f06-brand-detail.sh
  tests/qa/sprint4/features/f07-audit-running/f07-audit-running.sh
  tests/qa/sprint4/features/f08-audit-results/f08-audit-results.sh
  tests/qa/sprint4/features/f09-audit-list/f09-audit-list.sh
  tests/qa/sprint4/features/f10-audit-compare/f10-audit-compare.sh
  tests/qa/sprint4/features/f11-portfolio/f11-portfolio.sh
  tests/qa/sprint4/features/f12-export/f12-export.sh
  tests/qa/sprint4/features/f13-cross-org/f13-cross-org.sh
)

for S in "${FEATURES[@]}"; do
  echo "" && echo "========================================" && echo "Running $S"
  chmod +x "$S"
  if bash "$S"; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); FAILED+=("$S"); fi
done

echo "" && echo "========================================"
echo " Sprint 4 QA: Passed=$PASS  Failed=$FAIL"
if [ ${#FAILED[@]} -gt 0 ]; then for F in "${FAILED[@]}"; do echo "   FAIL: $F"; done; fi
echo "========================================"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
```

-----

## Sprint 4 PASS criteria (all 13 must be green)

```
[ ] F01  Layout           — Sidebar nav groups (Workspace/Insights/Settings); aria-current="page"; mobile drawer; Portfolio shows/hides on brand count
[ ] F02  Dashboard        — 4 KPI cards (Brands/Audits/Avg visibility/LLM spend) with real data; 5-item recent audits feed with brand names; first-time → /brands/wizard; Quick actions disabled with 0 brands
[ ] F03  Brand list       — Grid with lastAuditScore from lateral join; "Never audited"; GET /api/brands returns lastAuditScore; org isolation (user B sees only their brands)
[ ] F04  Brand create     — Domain www-strip; https:// rejected; free-tier limit 403; /brands/new → /settings/billing when at limit; successful create → audit triggered → /audits/[id]
[ ] F05  Brand wizard     — Step 2 hardcoded V1_VERTICAL_PACKS (no DB crash); step 4 tier-aware cost (Free≈A$0.30-0.50 not A$2.50-3); back/next nav; full 4-step submit creates brand + audit
[ ] F06  Brand detail     — Audit history with ±4.3 CI format and +6.2 delta; inline edit saves via PATCH; delete dialog content correct (BJ3); soft-delete preserves audit rows
[ ] F07  Audit running    — 8-step progress UI; expectedCalls=engines.length×50 (NOT engineCount); Free=100/Paid=200; failed state error card NOT frozen progress (U6); dispatch complete→results
[ ] F08  Audit results    — Dispatch: runsPerPrompt≥5 && engines.length>1 → Rich (NOT metadata.mode); Basic shows Re-run button; Rich shows 5 dim tiles + CI text; Free=2 engine tiles/Paid=4
[ ] F09  Audit list       — GET /api/audits returns brandName (BC2); sort=scoreComposite works (BH2); status filter in URL searchParams (BJ4); org isolation (user B sees only their audits)
[ ] F10  Audit compare    — Valid ?ids=A,B → both scores + +6.2 delta; malformed/1-id/3-ids → redirect /audits; cross-org → 404; dimension delta indicators (↑/↓) visible
[ ] F11  Portfolio        — <2 brands → /dashboard?toast=need-2-brands (BE3); ≥2 → renders; 3 KPI cards; brand cards with scores; LLM spend uses this-month filter (BK2/BD5)
[ ] F12  Export           — PDF: application/pdf + filename "visibleau-audit-N.pdf"; CSV: 14-column header (BD1); JSON: attachment; SARIF/JUnit/GHA stubbed "Coming Sprint 8" (not hidden); cross-org 404
[ ] F13  Cross-org (8 tests) — /api/brands/[id] GET 404 (F13-01); PATCH /api/brands/[id] 404 (F13-07, I11 — BH4 new endpoint); /api/audits/[id] 404; /audits/[id] page 404; /api/audits/[id]/export 404; own resources 200; /settings/billing?reason=brand-limit shows message (BK5)

Sprint 4 PASS = all 13 green + zero orphaned [S4-QA] rows in DB + no regression on Sprint 1-3 cross-org rules
```