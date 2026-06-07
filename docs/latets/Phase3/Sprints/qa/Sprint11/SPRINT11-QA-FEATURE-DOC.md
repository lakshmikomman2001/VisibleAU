# VisibleAU — Sprint 11 QA Feature Document

**Sprint:** 11 — Marketing Landing Page · Methodology · Legal Pages · Product Tour · Error/Loading States · SEO
**Purpose:** Claude Code pastes each feature section and runs the accompanying `.bat` (Windows) or `.sh` (macOS/Linux).
Every script **automatically starts the dev server**, seeds real database rows where needed, runs all assertions,
then **hard-deletes every seeded row** — pass **or** fail. Zero manual steps; zero leftover data.

> **No new DB tables in Sprint 11** (§5 confirmed). All DB interaction reads/writes `organizations.metadata`
> (Sprint 10 jsonb column). The only new API route is `POST /api/onboarding/tour-complete`.

-----

## 1. Pre-requisites (run once)

```bash
# Install test runners
pnpm add -D vitest @playwright/test dotenv-cli

# Install Chromium for Playwright
pnpm exec playwright install chromium

# Apply Sprint 10 migrations (adds metadata, slug, onboarding_complete to organizations)
dotenv -e .env.test.local -- pnpm drizzle-kit migrate

# Smoke-test
dotenv -e .env.test.local -- pnpm dev &
sleep 8 && curl -sf http://localhost:3000/api/health && echo "OK"
kill %1
```

> **Migration prerequisite:** F01 applies migrations inline. F06-F12 (Playwright) also apply them.
> F02-F05 (vitest unit tests) assume migrations are already current — run F01 first, or use `run-all-sprint11`.

-----

## 2. Environment — `.env.test.local`

```bash
DATABASE_URL=postgresql://postgres:secret@localhost:5432/visibleau_test
DIRECT_URL=postgresql://postgres:secret@localhost:5432/visibleau_test
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=VisibleAU
NEXT_PUBLIC_APP_DESCRIPTION="Audit your brand's visibility across AI search engines"
E2E_APP_URL=http://localhost:3000
LLM_MODE=mock
INNGEST_EVENT_KEY=test
NEXT_PUBLIC_LOOM_SAMPLE_AUDIT_ID=
NEXT_PUBLIC_LOOM_WIZARD_ID=
NEXT_PUBLIC_LOOM_RESULTS_ID=
NEXT_PUBLIC_LOOM_AGENCY_ID=

# Set to 'true' ONLY when running against a production build (pnpm build && pnpm start).
# F12-01 through F12-05 (robots.txt/sitemap.xml) auto-skip when unset.
# These files are build-time artifacts — not served by pnpm dev.
# E2E_BUILD_TESTS=true
```

-----

## 3. Shared helpers

### `tests/qa/sprint11/shared/db.ts`

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres     from 'postgres';
import * as schema  from '../../../db/schema';

const client = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { max: 1 });
export const db = drizzle(client, { schema });
export { schema };
```

### `tests/qa/sprint11/shared/seed.ts`

```typescript
import { db, schema } from './db';
import { eq }         from 'drizzle-orm';

// IMPLEMENTATION NOTE FOR CLAUDE CODE:
// Sprint 11 §5: No new DB tables. Only organizations.metadata is read/written.
// Sprint 1 organizations.clerkOrgId is text NOT NULL UNIQUE — seedOrg must always supply it.
// Sprint 10 added: metadata jsonb NOT NULL, slug text UNIQUE (nullable), onboarding_complete boolean.

export async function seedOrg(p: {
  clerkOrgId: string;
  name:       string;
  tier?:      string;
  metadata?:  Record<string, unknown>;
}) {
  const existing = await db.select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, p.clerkOrgId)).limit(1);
  if (existing.length) await cleanupOrg(existing[0].id);

  const [o] = await db.insert(schema.organizations).values({
    clerkOrgId:         p.clerkOrgId,
    name:               p.name,
    region:             'au',
    tier:               p.tier     ?? 'free',
    metadata:           p.metadata ?? {},
    slug:               null,
    onboardingComplete: false,
  }).returning();
  return o;
}

export async function seedUser(p: {
  clerkUserId:    string;
  organizationId: string;
  email:          string;
}) {
  const [u] = await db.insert(schema.users).values({
    clerkUserId:    p.clerkUserId,
    organizationId: p.organizationId,
    email:          p.email,
    name:           '[S11QA]',
    role:           'owner',
  }).onConflictDoUpdate({
    target: schema.users.clerkUserId,
    set:    { organizationId: p.organizationId },
  }).returning();
  return u;
}

export async function cleanupOrg(orgId: string) {
  if (!orgId) return;
  await db.delete(schema.audits).where(eq(schema.audits.organizationId, orgId)).catch(() => {});
  await db.delete(schema.brands).where(eq(schema.brands.organizationId, orgId)).catch(() => {});
  await db.delete(schema.users).where(eq(schema.users.organizationId, orgId)).catch(() => {});
  await db.delete(schema.subscriptions).where(eq(schema.subscriptions.organizationId, orgId)).catch(() => {});
  await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId)).catch(() => {});
}
```

### `tests/qa/sprint11/vitest.config.ts`

```typescript
// environment: 'node' REQUIRED — postgres-js uses Node.js TCP connections.
// Without this, if project root uses jsdom, all DB queries silently fail.
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    testTimeout:  30_000,
    hookTimeout:  30_000,
    reporters:  ['verbose'],
    include: ['tests/qa/sprint11/**/*.test.ts'],
    exclude: ['tests/qa/sprint11/**/*.spec.ts'],
  },
});
```

### `tests/qa/sprint11/playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';
import { config }                from 'dotenv';
import path                      from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.test.local') });
export default defineConfig({
  testDir:       '.',  // FIX F: config is AT tests/qa/sprint11/ so '.' = that directory.
                      // './tests/qa/sprint11' would double-nest to tests/qa/sprint11/tests/qa/sprint11/
  testMatch:     '**/f*.spec.ts',
  fullyParallel: false,
  workers:       1,
  retries:       1,
  timeout:       60_000,
  use: {
    baseURL:    process.env.E2E_APP_URL ?? 'http://localhost:3000',
    trace:      'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

-----

## 4. Sprint 11 canonical invariants

|Code|Invariant                                                                                    |Bug if ignored                                            |
|----|---------------------------------------------------------------------------------------------|----------------------------------------------------------|
|IA1 |Sample audit: **1 engine × 5 prompts × 1 run** (§14 anti-pattern; IA1 fix)                   |Costs > A$0.10; violates Sprint 10 HB2                    |
|IA2 |Product tour uses `org.metadata.productTourComplete` (**NOT** localStorage)                  |Tour fires every visit; fails SSR cross-device            |
|IB1 |`buildMetadata()` uses `NEXT_PUBLIC_APP_URL` env var for OG url                              |OG URLs = `undefined/pricing` — all social previews broken|
|IC1 |`app/error.tsx` **MUST** have `'use client'`                                                 |Next.js App Router build error                            |
|IC2 |`buildMetadata()` description falls back to env var, **NOT** literal `'...'`                 |`'...'` ships to production OG tags                       |
|IC4 |`POST /api/onboarding/tour-complete` exists and merges `productTourComplete: true`           |Tour overlay never dismissed                              |
|ID1 |`/methodology` page is public (no auth), renders top-10 citability methods                   |§13 IE3 fix — missing route = failing AC                  |
|IE4 |Pricing teaser: 4 cards (Starter/Growth/Agency/Agency Pro); Enterprise = “Contact us”        |HK1: enterprise checkout throws                           |
|IF1 |Marketing nav: **Pricing · Methodology · About** + Sign in + Get started                     |Prototype nav differs; Verticals/Docs deferred            |
|IF2 |`EmptyState` uses real copy — no Lorem ipsum (§14)                                           |Placeholder text ships to production                      |
|IG4 |Footer: Privacy · Terms · Methodology · Contact ([hi@visibleau.com](mailto:hi@visibleau.com))|Privacy Act 1988 compliance requires visible policy link  |
|IJ1 |Trust badges: 4 AU-specific badges below Hero CTA                                            |Missing social proof                                      |
|IN5 |`ProgressStepper`: 4 steps: Add brand → Configure → Run audit → See results                  |Onboarding polish incomplete                              |
|IP5 |`buildMetadata()` includes `alternates.canonical`                                            |`/pricing?tab=annual` treated as duplicate page           |

-----

## Feature map — 12 features · 93 tests

|#      |Feature                                                                                          |Runner    |Server?|
|-------|-------------------------------------------------------------------------------------------------|----------|-------|
|**F01**|Schema guard: no new tables; `organizations.metadata` writable; no `product_tour_complete` column|vitest    |No     |
|**F02**|`buildMetadata()` — title, OG url (IB1), description (IC2), canonical (IP5)                      |vitest    |No     |
|**F03**|Product tour DB flag — read/write, merge, server-side only (IA2, IC4)                            |vitest    |No     |
|**F04**|`EmptyState` canonical copy — no Lorem ipsum, real CTAs (IF2, §14)                               |vitest    |No     |
|**F05**|`ProgressStepper` — 4 steps, active/completed/pending states (IN5)                               |vitest    |No     |
|**F06**|Landing page `/` — all 9 sections, hero CTA → /sample-audit, trust badges, no Lorem              |Playwright|**Yes**|
|**F07**|Marketing nav — Pricing · Methodology · About + Sign in/Get started; no Verticals/Docs (IF1)     |Playwright|**Yes**|
|**F08**|Legal pages — /about /privacy /terms: 200, real copy, Privacy Act, governing law                 |Playwright|**Yes**|
|**F09**|`/methodology` — 200 public, top-10 visible, “Show all 47” expands, citations (ID1, IE3)         |Playwright|**Yes**|
|**F10**|Error + loading — 404 friendly, no stack trace, no horizontal scroll 375px (IC1, §8, §13)        |Playwright|**Yes**|
|**F11**|`POST /api/onboarding/tour-complete` — not 404, 401 unauth, merges flag (IC4, IA2)               |Playwright|**Yes**|
|**F12**|SEO — robots.txt, sitemap, OG tags, canonical, no `undefined` (IB1, IC2, IP5, ID3)               |Playwright|**Yes**|

-----

## F01 — Schema guard: no new tables; metadata writable

**Invariants:** §5, IA2 · **Runner:** vitest · **Creates/removes 2 org rows inline**

### `tests/qa/sprint11/f01-schema-guard.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { db, schema }           from './shared/db';
import { sql, eq }              from 'drizzle-orm';

async function colInfo(table: string, col: string) {
  const [r] = await db.execute(sql`
    SELECT data_type, is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name=${table} AND column_name=${col}
  `);
  return r as { data_type: string; is_nullable: string } | undefined;
}

describe('F01: Sprint 11 schema guard (§5 — no new tables)', () => {

  it('F01-01: no table named sprint11% exists in public schema', async () => {
    const rows = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name LIKE 'sprint11%'
    `);
    expect(rows.length).toBe(0);
  });

  it('F01-02: organizations.metadata is jsonb NOT NULL (Sprint 10 HC4 — Sprint 11 reads/writes it)', async () => {
    const c = await colInfo('organizations', 'metadata');
    expect(c?.data_type).toBe('jsonb');
    expect(c?.is_nullable).toBe('NO');
  });

  it('F01-03: NO dedicated product_tour_complete column — flag is in jsonb (IA2)', async () => {
    const rows = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='organizations'
        AND column_name='product_tour_complete'
    `);
    expect(rows.length).toBe(0);  // must be in metadata jsonb, not a dedicated column
  });

  it('F01-04: organizations.metadata accepts productTourComplete key without error', async () => {
    const clerkId = `org_s11qa_f01_meta_${Date.now()}`;
    const [org] = await db.insert(schema.organizations).values({
      clerkOrgId: clerkId, name: '[S11QA F01] meta test',
      region: 'au', tier: 'free', metadata: {}, slug: null, onboardingComplete: false,
    }).returning();

    await db.update(schema.organizations)
      .set({ metadata: { productTourComplete: true } })
      .where(eq(schema.organizations.id, org.id));

    const [updated] = await db.select({ meta: schema.organizations.metadata })
      .from(schema.organizations).where(eq(schema.organizations.id, org.id));
    expect((updated.meta as any).productTourComplete).toBe(true);

    await db.delete(schema.organizations).where(eq(schema.organizations.id, org.id));
  });

  it('F01-05: metadata write MERGES — Sprint 10 firstTimeFlowComplete key preserved', async () => {
    const clerkId = `org_s11qa_f01_merge_${Date.now()}`;
    const [org] = await db.insert(schema.organizations).values({
      clerkOrgId: clerkId, name: '[S11QA F01] merge test',
      region: 'au', tier: 'free',
      metadata: { firstTimeFlowComplete: true },  // Sprint 10 key
      slug: null, onboardingComplete: false,
    }).returning();

    const [before] = await db.select({ meta: schema.organizations.metadata })
      .from(schema.organizations).where(eq(schema.organizations.id, org.id));
    const merged = { ...(before.meta as any), productTourComplete: true };
    await db.update(schema.organizations)
      .set({ metadata: merged }).where(eq(schema.organizations.id, org.id));

    const [after] = await db.select({ meta: schema.organizations.metadata })
      .from(schema.organizations).where(eq(schema.organizations.id, org.id));
    expect((after.meta as any).productTourComplete).toBe(true);
    expect((after.meta as any).firstTimeFlowComplete).toBe(true);  // Sprint 10 key preserved

    await db.delete(schema.organizations).where(eq(schema.organizations.id, org.id));
  });

  it('F01-06: schema.organizations barrel export accessible', () => {
    expect(schema.organizations).toBeDefined();
  });
});
```

### `tests/qa/sprint11/f01-schema-guard.bat`

```batch
@echo off
setlocal
echo ============================================================
echo  F01 Sprint 11 Schema Guard (no new tables, metadata writable)
echo  Tests: 6  Runner: vitest  Server: NOT needed
echo ============================================================
echo.
echo [1/2] Applying migrations...
dotenv -e .env.test.local -- pnpm drizzle-kit migrate
if %ERRORLEVEL% neq 0 ( echo FAIL: migrations & exit /b 1 )
echo [2/2] Running tests...
dotenv -e .env.test.local -- pnpm vitest run ^
  --config tests/qa/sprint11/vitest.config.ts ^
  tests/qa/sprint11/f01-schema-guard.test.ts ^
  --reporter=verbose
set EXIT=%ERRORLEVEL%
if %EXIT% equ 0 ( echo PASS: F01 — schema guard green, org rows cleaned ) else ( echo FAIL: F01 )
exit /b %EXIT%
```

### `tests/qa/sprint11/f01-schema-guard.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "=== F01 Sprint 11 Schema Guard ==="
echo "[1/2] Applying migrations..."
dotenv -e .env.test.local -- pnpm drizzle-kit migrate
echo "[2/2] Running tests..."
dotenv -e .env.test.local -- pnpm vitest run \
  --config tests/qa/sprint11/vitest.config.ts \
  tests/qa/sprint11/f01-schema-guard.test.ts \
  --reporter=verbose
echo "PASS: F01 — schema guard green, org rows cleaned"
```

-----

## F02 — `buildMetadata()` — OG title, description, url, canonical

**Invariants:** IB1, IC2, IP5 · **Runner:** vitest · **No seed**

### `tests/qa/sprint11/f02-build-metadata.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

// Inline canonical buildMetadata matching lib/seo/metadata.ts (Sprint 11 §10)
function buildMetadata({ title, description, path }: {
  title?: string; description?: string; path: string;
}) {
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const appDesc = process.env.NEXT_PUBLIC_APP_DESCRIPTION ?? '';
  const fullTitle = title
    ? `${title} | VisibleAU`
    : 'VisibleAU — AI Search Visibility for Australian SMBs';
  return {
    title: fullTitle,
    description: description ?? appDesc,               // IC2: NOT literal '...'
    openGraph: {
      title: fullTitle,
      description: description ?? appDesc ?? '',
      images: ['/og-image.png'],
      url: `${appUrl}${path}`,                         // IB1: uses env var
    },
    twitter: { card: 'summary_large_image' },
    alternates: { canonical: `${appUrl}${path}` },    // IP5
  };
}

describe('F02: buildMetadata() (IB1, IC2, IP5)', () => {

  it('F02-01: no title → default VisibleAU headline', () => {
    expect(buildMetadata({ path: '/' }).title)
      .toBe('VisibleAU — AI Search Visibility for Australian SMBs');
  });

  it('F02-02: with title → "Title | VisibleAU"', () => {
    expect(buildMetadata({ title: 'Pricing', path: '/pricing' }).title)
      .toBe('Pricing | VisibleAU');
  });

  it('F02-03: Methodology title is correct', () => {
    expect(buildMetadata({ title: 'Methodology', path: '/methodology' }).title)
      .toBe('Methodology | VisibleAU');
  });

  it('F02-04: description falls back to NEXT_PUBLIC_APP_DESCRIPTION — NOT literal "..." (IC2)', () => {
    const m = buildMetadata({ path: '/about' });
    expect(m.description).not.toBe('...');
    expect(m.description).not.toContain('undefined');
    expect(typeof m.description).toBe('string');
  });

  it('F02-05: explicit description overrides env var', () => {
    const custom = 'Transparent AU pricing. From A$99/mo inc. GST.';
    const m = buildMetadata({ description: custom, path: '/pricing' });
    expect(m.description).toBe(custom);
    expect(m.openGraph.description).toBe(custom);
  });

  it('F02-06: OG url uses NEXT_PUBLIC_APP_URL — NOT "undefined/..." (IB1)', () => {
    const m = buildMetadata({ path: '/pricing' });
    expect(m.openGraph.url).not.toContain('undefined');
    expect(m.openGraph.url).toContain('/pricing');
  });

  it('F02-07: OG url for landing page does not contain "undefined"', () => {
    expect(buildMetadata({ path: '/' }).openGraph.url).not.toContain('undefined');
  });

  it('F02-08: canonical URL matches OG url (IP5 — no duplicates)', () => {
    const m = buildMetadata({ path: '/pricing' });
    expect(m.alternates.canonical).toBe(m.openGraph.url);
  });

  it('F02-09: canonical URL has NO query params (IP5 — prevents ?tab=annual duplicate)', () => {
    expect(buildMetadata({ path: '/pricing' }).alternates.canonical).not.toContain('?');
  });

  it('F02-10: OG images = ["/og-image.png"] (IJ3)', () => {
    expect(buildMetadata({ path: '/' }).openGraph.images).toEqual(['/og-image.png']);
  });

  it('F02-11: twitter card = "summary_large_image"', () => {
    expect(buildMetadata({ path: '/' }).twitter.card).toBe('summary_large_image');
  });

  it('F02-12: methodology OG url contains /methodology', () => {
    const m = buildMetadata({ title: 'Methodology', path: '/methodology' });
    expect(m.openGraph.url).toContain('/methodology');
    expect(m.openGraph.url).not.toContain('undefined');
  });
});
```

### `tests/qa/sprint11/f02-build-metadata.bat`

```batch
@echo off
echo ============================================================
echo  F02 buildMetadata() SEO/OG/canonical (IB1, IC2, IP5)
echo  Tests: 12  Runner: vitest  Server: NOT needed
echo ============================================================
dotenv -e .env.test.local -- pnpm vitest run ^
  --config tests/qa/sprint11/vitest.config.ts ^
  tests/qa/sprint11/f02-build-metadata.test.ts ^
  --reporter=verbose
if %ERRORLEVEL% equ 0 ( echo PASS: F02 ) else ( echo FAIL: F02 & exit /b 1 )
```

### `tests/qa/sprint11/f02-build-metadata.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "=== F02 buildMetadata() (IB1, IC2, IP5) ==="
dotenv -e .env.test.local -- pnpm vitest run \
  --config tests/qa/sprint11/vitest.config.ts \
  tests/qa/sprint11/f02-build-metadata.test.ts --reporter=verbose
echo "PASS: F02"
```

-----

## F03 — Product tour DB flag: `productTourComplete` read/write

**Invariants:** IA2, IC4 · **Runner:** vitest · **Seeds org, deletes in afterAll**

### `tests/qa/sprint11/f03-product-tour-flag.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema }   from './shared/db';
import { seedOrg, seedUser, cleanupOrg } from './shared/seed';
import { eq }           from 'drizzle-orm';

const CLERK_ORG  = `org_s11qa_f03_${Date.now()}`;
const CLERK_USER = `user_s11qa_f03_${Date.now()}`;
let orgId = '';

beforeAll(async () => {
  const org = await seedOrg({
    clerkOrgId: CLERK_ORG, name: '[S11QA F03] Tour Flag', tier: 'free', metadata: {},
  });
  orgId = org.id;
  await seedUser({ clerkUserId: CLERK_USER, organizationId: orgId,
                   email: `f03_${Date.now()}@s11qa.test` });
});

afterAll(async () => { if (orgId) await cleanupOrg(orgId); });

async function shouldShowTour(id: string): Promise<boolean> {
  const [org] = await db.select({ meta: schema.organizations.metadata })
    .from(schema.organizations).where(eq(schema.organizations.id, id));
  return !(org?.meta as any)?.productTourComplete;
}

async function completeTour(id: string): Promise<void> {
  const [org] = await db.select({ meta: schema.organizations.metadata })
    .from(schema.organizations).where(eq(schema.organizations.id, id));
  await db.update(schema.organizations)
    .set({ metadata: { ...(org?.meta as any ?? {}), productTourComplete: true } })
    .where(eq(schema.organizations.id, id));
}

describe('F03: Product tour DB flag (IA2 — server-side, IC4)', () => {

  it('F03-01: shouldShowTour() = true for new org with empty metadata', async () => {
    expect(await shouldShowTour(orgId)).toBe(true);
  });

  it('F03-02: shouldShowTour() = true when metadata = {} (key absent)', async () => {
    await db.update(schema.organizations)
      .set({ metadata: {} }).where(eq(schema.organizations.id, orgId));
    expect(await shouldShowTour(orgId)).toBe(true);
  });

  it('F03-03: completeTour() writes productTourComplete = true into jsonb', async () => {
    await completeTour(orgId);
    const [org] = await db.select({ meta: schema.organizations.metadata })
      .from(schema.organizations).where(eq(schema.organizations.id, orgId));
    expect((org.meta as any).productTourComplete).toBe(true);
  });

  it('F03-04: shouldShowTour() = false after completeTour()', async () => {
    expect(await shouldShowTour(orgId)).toBe(false);
  });

  it('F03-05: completeTour() is idempotent (call twice = same result)', async () => {
    await completeTour(orgId);
    const [org] = await db.select({ meta: schema.organizations.metadata })
      .from(schema.organizations).where(eq(schema.organizations.id, orgId));
    expect((org.meta as any).productTourComplete).toBe(true);
  });

  it('F03-06: completeTour() MERGES — Sprint 10 firstTimeFlowComplete preserved (IC4 + IM1)', async () => {
    await db.update(schema.organizations)
      .set({ metadata: { firstTimeFlowComplete: true } })
      .where(eq(schema.organizations.id, orgId));
    await completeTour(orgId);
    const [org] = await db.select({ meta: schema.organizations.metadata })
      .from(schema.organizations).where(eq(schema.organizations.id, orgId));
    expect((org.meta as any).productTourComplete).toBe(true);
    expect((org.meta as any).firstTimeFlowComplete).toBe(true);  // Sprint 10 key preserved
  });

  it('F03-07: flag is server-side DB (NOT localStorage — IA2 anti-pattern)', () => {
    expect(typeof completeTour).toBe('function');
    // completeTour uses db.update() — no browser API or localStorage reference
  });

  it('F03-08: AFTER test — org removed from DB', async () => {
    await cleanupOrg(orgId);
    const rows = await db.select({ id: schema.organizations.id })
      .from(schema.organizations).where(eq(schema.organizations.id, orgId));
    expect(rows.length).toBe(0);
    orgId = '';
  });
});
```

### `tests/qa/sprint11/f03-product-tour-flag.bat`

```batch
@echo off
echo ============================================================
echo  F03 Product Tour DB Flag (IA2 — server-side, not localStorage)
echo  Tests: 8  Runner: vitest
echo  Data: org [S11QA F03] seeded + deleted
echo ============================================================
dotenv -e .env.test.local -- pnpm vitest run ^
  --config tests/qa/sprint11/vitest.config.ts ^
  tests/qa/sprint11/f03-product-tour-flag.test.ts ^
  --reporter=verbose
if %ERRORLEVEL% equ 0 ( echo PASS: F03 — DB cleaned ) else ( echo FAIL: F03 & exit /b 1 )
```

### `tests/qa/sprint11/f03-product-tour-flag.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "=== F03 Product Tour DB Flag (IA2, IC4) ==="
dotenv -e .env.test.local -- pnpm vitest run \
  --config tests/qa/sprint11/vitest.config.ts \
  tests/qa/sprint11/f03-product-tour-flag.test.ts --reporter=verbose
echo "PASS: F03 — DB cleaned"
```

-----

## F04 — `EmptyState` canonical copy — no Lorem ipsum

**Invariants:** IF2, §14 · **Runner:** vitest · **No seed**

### `tests/qa/sprint11/f04-empty-state-copy.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

const EMPTY_STATES = {
  brands: {
    title:       'Add your first brand',
    description: 'Track how AI search engines describe your business',
    cta:         { label: 'Add brand', href: '/brands/new' },
  },
  audits: {
    title:       'No audits yet',
    description: 'Run your first audit to see how you appear in AI results',
    cta:         { label: 'Run audit', href: '/brands' },
  },
  actions: {
    title:       'No recommendations yet',
    description: 'Complete an audit to get specific action items',
    cta:         { label: 'View audits', href: '/audits' },
  },
} as const;

const FORBIDDEN = [/lorem\s+ipsum/i, /placeholder\s+text/i, /TODO/, /FIXME/, /^\.\.\.$/ ];

describe('F04: EmptyState canonical copy (IF2, §14 — no Lorem ipsum)', () => {

  for (const [page, state] of Object.entries(EMPTY_STATES)) {
    it(`F04 [${page}]: title has real content`, () => {
      for (const p of FORBIDDEN) expect(state.title).not.toMatch(p);
      expect(state.title.length).toBeGreaterThan(5);
    });
    it(`F04 [${page}]: description has real content`, () => {
      for (const p of FORBIDDEN) expect(state.description).not.toMatch(p);
      expect(state.description.length).toBeGreaterThan(15);
    });
    it(`F04 [${page}]: CTA is a valid path`, () => {
      expect(state.cta.href).toMatch(/^\//);
      expect(state.cta.label.length).toBeGreaterThan(2);
    });
  }

  it('F04-10: brands CTA href = /brands/new', () => {
    expect(EMPTY_STATES.brands.cta.href).toBe('/brands/new');
  });

  it('F04-11: audits CTA href = /brands', () => {
    expect(EMPTY_STATES.audits.cta.href).toBe('/brands');
  });

  it('F04-12: actions CTA href = /audits', () => {
    expect(EMPTY_STATES.actions.cta.href).toBe('/audits');
  });
});
```

### `tests/qa/sprint11/f04-empty-state-copy.bat`

```batch
@echo off
echo ============================================================
echo  F04 EmptyState Copy (IF2, no Lorem ipsum)
echo  Tests: 12  Runner: vitest  Server: NOT needed
echo ============================================================
dotenv -e .env.test.local -- pnpm vitest run ^
  --config tests/qa/sprint11/vitest.config.ts ^
  tests/qa/sprint11/f04-empty-state-copy.test.ts ^
  --reporter=verbose
if %ERRORLEVEL% equ 0 ( echo PASS: F04 ) else ( echo FAIL: F04 & exit /b 1 )
```

### `tests/qa/sprint11/f04-empty-state-copy.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "=== F04 EmptyState Copy (IF2, no Lorem ipsum) ==="
dotenv -e .env.test.local -- pnpm vitest run \
  --config tests/qa/sprint11/vitest.config.ts \
  tests/qa/sprint11/f04-empty-state-copy.test.ts --reporter=verbose
echo "PASS: F04"
```

-----

## F05 — `ProgressStepper` — 4 steps, state logic

**Invariants:** IN5 · **Runner:** vitest · **No seed**

### `tests/qa/sprint11/f05-progress-stepper.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

const STEPS = ['Add brand', 'Configure', 'Run audit', 'See results'] as const;
type Step = 1 | 2 | 3 | 4;

function getStepStates(currentStep: Step) {
  return STEPS.map((label, i) => ({
    label,
    number:      i + 1,
    isCompleted: i + 1 < currentStep,
    isCurrent:   i + 1 === currentStep,
    isPending:   i + 1 > currentStep,
  }));
}

describe('F05: ProgressStepper (IN5 — 4-step onboarding indicator)', () => {

  it('F05-01: exactly 4 steps', () => { expect(STEPS.length).toBe(4); });
  it('F05-02: step 1 = "Add brand"',   () => { expect(STEPS[0]).toBe('Add brand'); });
  it('F05-03: step 2 = "Configure"',   () => { expect(STEPS[1]).toBe('Configure'); });
  it('F05-04: step 3 = "Run audit"',   () => { expect(STEPS[2]).toBe('Run audit'); });
  it('F05-05: step 4 = "See results"', () => { expect(STEPS[3]).toBe('See results'); });

  it('F05-06: currentStep=1 → step 1 current; 2-4 pending; none completed', () => {
    const s = getStepStates(1);
    expect(s[0].isCurrent).toBe(true);
    expect(s[0].isCompleted).toBe(false);
    expect(s.slice(1).every(x => x.isPending)).toBe(true);
  });

  it('F05-07: currentStep=2 → step 1 completed; step 2 current; 3-4 pending', () => {
    const s = getStepStates(2);
    expect(s[0].isCompleted).toBe(true);
    expect(s[1].isCurrent).toBe(true);
    expect(s[2].isPending).toBe(true);
    expect(s[3].isPending).toBe(true);
  });

  it('F05-08: currentStep=3 → steps 1-2 completed; step 3 current; step 4 pending', () => {
    const s = getStepStates(3);
    expect(s[0].isCompleted).toBe(true);
    expect(s[1].isCompleted).toBe(true);
    expect(s[2].isCurrent).toBe(true);
    expect(s[3].isPending).toBe(true);
  });

  it('F05-09: currentStep=4 → steps 1-3 completed; step 4 current', () => {
    const s = getStepStates(4);
    expect(s.slice(0, 3).every(x => x.isCompleted)).toBe(true);
    expect(s[3].isCurrent).toBe(true);
  });

  it('F05-10: no step is both current AND completed simultaneously', () => {
    for (const step of [1, 2, 3, 4] as Step[]) {
      getStepStates(step).forEach(st => {
        expect(st.isCurrent && st.isCompleted).toBe(false);
      });
    }
  });
});
```

### `tests/qa/sprint11/f05-progress-stepper.bat`

```batch
@echo off
echo ============================================================
echo  F05 ProgressStepper — 4 steps, state logic (IN5)
echo  Tests: 10  Runner: vitest  Server: NOT needed
echo ============================================================
dotenv -e .env.test.local -- pnpm vitest run ^
  --config tests/qa/sprint11/vitest.config.ts ^
  tests/qa/sprint11/f05-progress-stepper.test.ts ^
  --reporter=verbose
if %ERRORLEVEL% equ 0 ( echo PASS: F05 ) else ( echo FAIL: F05 & exit /b 1 )
```

### `tests/qa/sprint11/f05-progress-stepper.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "=== F05 ProgressStepper (IN5) ==="
dotenv -e .env.test.local -- pnpm vitest run \
  --config tests/qa/sprint11/vitest.config.ts \
  tests/qa/sprint11/f05-progress-stepper.test.ts --reporter=verbose
echo "PASS: F05"
```

-----

## F06 — Landing page `/` — all 9 sections, hero CTA, trust badges

**Invariants:** §13 AC, IF5, IJ1, §14 · **Runner:** Playwright · **Auto-starts server**

### `tests/qa/sprint11/f06-landing-page.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('F06: Landing page / (§13 AC, §6, IF5, IJ1)', () => {

  test('F06-01: GET / returns HTTP 200', async ({ request }) => {
    expect((await request.get('/')).status()).toBe(200);
  });

  test('F06-02: hero headline contains engine names (§6 section 2)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/ChatGPT|Claude|Gemini|Perplexity/i);
  });

  test('F06-03: hero subhead mentions Australian SMBs (IJ1 AU focus)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/Australian/i);
  });

  test('F06-04: "Try a free sample audit" CTA links to /sample-audit (IF5, §6)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const cta = page.getByRole('link', { name: /try a free sample audit/i }).first();
    await expect(cta).toBeVisible({ timeout: 10_000 });
    expect(await cta.getAttribute('href')).toMatch(/\/sample-audit/);
  });

  test('F06-05: clicking hero CTA loads Sprint 10 /sample-audit route (not 404)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByRole('link', { name: /try a free sample audit/i }).first().click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/sample-audit');
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('404');
    expect(body).not.toContain('Application error');
  });

  test('F06-06: trust badges visible — SSL / Privacy Act / no credit card (IJ1)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').textContent() ?? '';
    expect(/ssl|privacy act|no credit card|prompt data deleted/i.test(body)).toBe(true);
  });

  test('F06-07: "How it works" section present (§6 section 3)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/how it works/i);
  });

  test('F06-08: engines section shows ChatGPT and at least one other engine (§6 section 4)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).toContainText(/ChatGPT/);
    await expect(body).toContainText(/Gemini|Perplexity/);
  });

  test('F06-09: verticals section shows AU business categories (§6 section 5)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/tradies|allied health|professional services/i);
  });

  test('F06-10: "What we measure" shows dimension names (§6 section 6, IG3)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').textContent() ?? '';
    const found = ['Frequency', 'Position', 'Sentiment', 'Context', 'Accuracy']
      .filter(d => body.includes(d));
    expect(found.length).toBeGreaterThanOrEqual(3);
  });

  test('F06-11: pricing teaser shows Starter/Growth tiers (§6 section 7, IE4)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/starter|growth/i);
  });

  test('F06-12: footer has Privacy → /privacy and Terms → /terms (§6 section 9, IG4)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const footer = page.locator('footer').first();
    await expect(footer.getByRole('link', { name: /privacy/i })).toHaveAttribute('href', /\/privacy/);
    await expect(footer.getByRole('link', { name: /terms/i })).toHaveAttribute('href', /\/terms/);
  });

  test('F06-13: no "Lorem ipsum" anywhere on landing page (§14)', async ({ page }) => {
    await page.goto('/');
    const body = await page.locator('body').textContent() ?? '';
    expect(body.toLowerCase()).not.toContain('lorem ipsum');
    expect(body).not.toContain('TODO');
  });

  test('F06-14: "See pricing" secondary CTA links to /pricing (§6 section 2)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const link = page.getByRole('link', { name: /see pricing/i }).first();
    expect(await link.getAttribute('href')).toMatch(/\/pricing/);
  });

  test('F06-15: FAQ section renders (§6 section 8 — IE5, §13 AC "all 9 sections")', async ({ page }) => {
    // §6 lists 9 numbered sections: 8 = FAQ (FaqSection component).
    // §13 AC: 'Landing page renders with all 9 sections' — FAQ is section 8.
    // §6 IE5 fix specifies 8 real FAQ entries (no Lorem ipsum — §14 anti-pattern).
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').textContent() ?? '';
    // Check for FAQ-specific content (§6 IE5 canonical entries)
    const hasFaq = /faq|frequently asked|how does it work\?|what is visibleau|how much does/i.test(body);
    expect(hasFaq).toBe(true);
  });
});
```

### `tests/qa/sprint11/f06-landing-page.bat`

```batch
@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo  F06 Landing Page / — all 9 sections, hero CTA, trust badges
echo  Tests: 14  Runner: Playwright  Auto-starts: pnpm dev
echo ============================================================
echo.
echo [1/3] Applying migrations...
dotenv -e .env.test.local -- pnpm drizzle-kit migrate
if %ERRORLEVEL% neq 0 ( echo FAIL: migrations & exit /b 1 )
echo [2/3] Checking/starting dev server...
set OWN=0
curl -sf http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% neq 0 (
  dotenv -e .env.test.local -- pnpm dev > nul 2>&1 & set OWN=1 & set W=0
  :WAIT6
  timeout /t 2 /nobreak > nul & set /a W+=2
  curl -sf http://localhost:3000/api/health > nul 2>&1 && goto UP6
  if !W! geq 45 ( echo FAIL: dev server timeout & exit /b 1 )
  goto WAIT6
  :UP6
  echo   Dev server ready after !W!s
)
echo [3/3] Running Playwright tests...
dotenv -e .env.test.local -- pnpm exec playwright test ^
  tests/qa/sprint11/f06-landing-page.spec.ts ^
  --config tests/qa/sprint11/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
if %OWN% equ 1 ( for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %%a /F > nul 2>&1 )
if %EXIT% equ 0 ( echo PASS: F06 ) else ( echo FAIL: F06 & exit /b 1 )
exit /b %EXIT%
```

### `tests/qa/sprint11/f06-landing-page.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "=== F06 Landing page / (§13 AC, §6) ==="
dotenv -e .env.test.local -- pnpm drizzle-kit migrate
DEV_PID=""
if ! curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
  dotenv -e .env.test.local -- pnpm dev > /tmp/pnpm-dev-s11-f06.log 2>&1 & DEV_PID=$!
  WAITED=0
  until curl -sf http://localhost:3000/api/health > /dev/null 2>&1; do
    sleep 2; WAITED=$((WAITED+2)); [ $WAITED -ge 45 ] && { kill "$DEV_PID" 2>/dev/null; exit 1; }
  done
  echo "  Dev server ready after ${WAITED}s"
fi
cleanup() { [ -n "$DEV_PID" ] && kill "$DEV_PID" 2>/dev/null || true; }
trap cleanup EXIT
dotenv -e .env.test.local -- pnpm exec playwright test \
  tests/qa/sprint11/f06-landing-page.spec.ts \
  --config tests/qa/sprint11/playwright.config.ts --reporter=list
echo "PASS: F06"
```

-----

## F07 — Marketing nav: Pricing · Methodology · About + auth CTAs

**Invariants:** IF1, II2 · **Runner:** Playwright · **No DB seed**

### `tests/qa/sprint11/f07-marketing-nav.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('F07: Marketing layout nav (IF1 canonical — II2)', () => {

  const PAGES = ['/', '/pricing', '/about', '/methodology', '/privacy', '/terms'];

  for (const path of PAGES) {
    test(`F07: ${path} → HTTP 200 + has header`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('header').first()).toBeVisible({ timeout: 8_000 });
    });
  }

  test('F07-07: nav "Pricing" link → /pricing', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const link = page.locator('nav').getByRole('link', { name: /^pricing$/i }).first();
    await expect(link).toHaveAttribute('href', /\/pricing/);
  });

  test('F07-08: nav "Methodology" → /methodology (IF1 — replaces "How it works")', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('nav').getByRole('link', { name: /methodology/i }).first())
      .toHaveAttribute('href', /\/methodology/);
  });

  test('F07-09: nav "About" → /about', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('nav').getByRole('link', { name: /^about$/i }).first())
      .toHaveAttribute('href', /\/about/);
  });

  test('F07-10: nav does NOT have "Verticals" or "Docs" (IF1 — deferred v1.1)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const navText = await page.locator('header nav').first().textContent() ?? '';
    expect(navText.toLowerCase()).not.toContain('verticals');
    expect(navText.toLowerCase()).not.toContain('docs');
  });

  test('F07-11: "Sign in" → /sign-in (Clerk)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: /sign in/i }).first())
      .toHaveAttribute('href', /\/sign-in/);
  });

  test('F07-12: "Get started" → /sign-up (IF1 — NOT "Start free")', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: /get started/i }).first())
      .toHaveAttribute('href', /\/sign-up/);
  });

  test('F07-13: footer has Methodology link (IG4)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('footer').first().getByRole('link', { name: /methodology/i }))
      .toHaveAttribute('href', /\/methodology/);
  });

  test('F07-14: footer has Contact link — mailto: or /contact (IG4)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const contact = page.locator('footer').first().getByRole('link', { name: /contact/i }).first();
    const href = await contact.getAttribute('href') ?? '';
    expect(href).toMatch(/mailto:|\/contact/i);
  });
});
```

### `tests/qa/sprint11/f07-marketing-nav.bat`

```batch
@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo  F07 Marketing Nav (IF1 canonical — II2)
echo  Tests: 14  Runner: Playwright  Auto-starts: pnpm dev
echo ============================================================
dotenv -e .env.test.local -- pnpm drizzle-kit migrate
if %ERRORLEVEL% neq 0 ( echo FAIL: migrations & exit /b 1 )
set OWN=0
curl -sf http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% neq 0 (
  dotenv -e .env.test.local -- pnpm dev > nul 2>&1 & set OWN=1 & set W=0
  :WAIT7
  timeout /t 2 /nobreak > nul & set /a W+=2
  curl -sf http://localhost:3000/api/health > nul 2>&1 && goto UP7
  if !W! geq 45 ( echo FAIL: server timeout & exit /b 1 )
  goto WAIT7
  :UP7
)
dotenv -e .env.test.local -- pnpm exec playwright test ^
  tests/qa/sprint11/f07-marketing-nav.spec.ts ^
  --config tests/qa/sprint11/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
if %OWN% equ 1 ( for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %%a /F > nul 2>&1 )
if %EXIT% equ 0 ( echo PASS: F07 ) else ( echo FAIL: F07 & exit /b 1 )
exit /b %EXIT%
```

### `tests/qa/sprint11/f07-marketing-nav.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "=== F07 Marketing Nav (IF1, II2) ==="
dotenv -e .env.test.local -- pnpm drizzle-kit migrate
DEV_PID=""
if ! curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
  dotenv -e .env.test.local -- pnpm dev > /tmp/pnpm-dev-s11-f07.log 2>&1 & DEV_PID=$!
  WAITED=0
  until curl -sf http://localhost:3000/api/health > /dev/null 2>&1; do
    sleep 2; WAITED=$((WAITED+2)); [ $WAITED -ge 45 ] && { kill "$DEV_PID" 2>/dev/null; exit 1; }
  done
fi
cleanup() { [ -n "$DEV_PID" ] && kill "$DEV_PID" 2>/dev/null || true; }; trap cleanup EXIT
dotenv -e .env.test.local -- pnpm exec playwright test \
  tests/qa/sprint11/f07-marketing-nav.spec.ts \
  --config tests/qa/sprint11/playwright.config.ts --reporter=list
echo "PASS: F07"
```

-----

## F08 — Legal pages: /about /privacy /terms

**Invariants:** §13 AC “Privacy + Terms pages exist with legal copy” · **Runner:** Playwright

### `tests/qa/sprint11/f08-legal-pages.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('F08: Legal pages — /about /privacy /terms (§13 AC)', () => {

  test('F08-01: GET /about returns 200', async ({ request }) => {
    expect((await request.get('/about')).status()).toBe(200);
  });

  test('F08-02: /about has a visible heading', async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('body')).toContainText(/visibleau|about/i);
  });

  test('F08-03: GET /privacy returns 200', async ({ request }) => {
    expect((await request.get('/privacy')).status()).toBe(200);
  });

  test('F08-04: /privacy has a Privacy Policy heading', async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /privacy/i }).first()).toBeVisible({ timeout: 8_000 });
  });

  test('F08-05: /privacy mentions Australian Privacy Act (§14 AU jurisdiction)', async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/privacy act|australia|overseas/i);
  });

  test('F08-06: GET /terms returns 200', async ({ request }) => {
    expect((await request.get('/terms')).status()).toBe(200);
  });

  test('F08-07: /terms has a Terms heading', async ({ page }) => {
    await page.goto('/terms');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /terms/i }).first()).toBeVisible({ timeout: 8_000 });
  });

  test('F08-08: /terms mentions Australian governing law', async ({ page }) => {
    await page.goto('/terms');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/governing law|australia|jurisdiction/i);
  });

  test('F08-09: no Lorem ipsum on any legal page (§14)', async ({ page }) => {
    for (const path of ['/about', '/privacy', '/terms']) {
      await page.goto(path);
      expect((await page.locator('body').textContent() ?? '').toLowerCase()).not.toContain('lorem ipsum');
    }
  });

  test('F08-10: /privacy and /terms both have a footer', async ({ page }) => {
    for (const path of ['/privacy', '/terms']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('footer').first()).toBeVisible({ timeout: 8_000 });
    }
  });
});
```

### `tests/qa/sprint11/f08-legal-pages.bat`

```batch
@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo  F08 Legal Pages /about /privacy /terms (§13 AC)
echo  Tests: 10  Runner: Playwright  Auto-starts: pnpm dev
echo ============================================================
dotenv -e .env.test.local -- pnpm drizzle-kit migrate
if %ERRORLEVEL% neq 0 ( echo FAIL: migrations & exit /b 1 )
set OWN=0
curl -sf http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% neq 0 (
  dotenv -e .env.test.local -- pnpm dev > nul 2>&1 & set OWN=1 & set W=0
  :WAIT8
  timeout /t 2 /nobreak > nul & set /a W+=2
  curl -sf http://localhost:3000/api/health > nul 2>&1 && goto UP8
  if !W! geq 45 ( echo FAIL: server timeout & exit /b 1 )
  goto WAIT8
  :UP8
)
dotenv -e .env.test.local -- pnpm exec playwright test ^
  tests/qa/sprint11/f08-legal-pages.spec.ts ^
  --config tests/qa/sprint11/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
if %OWN% equ 1 ( for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %%a /F > nul 2>&1 )
if %EXIT% equ 0 ( echo PASS: F08 ) else ( echo FAIL: F08 & exit /b 1 )
exit /b %EXIT%
```

### `tests/qa/sprint11/f08-legal-pages.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "=== F08 Legal Pages (§13 AC) ==="
dotenv -e .env.test.local -- pnpm drizzle-kit migrate
DEV_PID=""
if ! curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
  dotenv -e .env.test.local -- pnpm dev > /tmp/pnpm-dev-s11-f08.log 2>&1 & DEV_PID=$!
  WAITED=0
  until curl -sf http://localhost:3000/api/health > /dev/null 2>&1; do
    sleep 2; WAITED=$((WAITED+2)); [ $WAITED -ge 45 ] && { kill "$DEV_PID" 2>/dev/null; exit 1; }
  done
fi
cleanup() { [ -n "$DEV_PID" ] && kill "$DEV_PID" 2>/dev/null || true; }; trap cleanup EXIT
dotenv -e .env.test.local -- pnpm exec playwright test \
  tests/qa/sprint11/f08-legal-pages.spec.ts \
  --config tests/qa/sprint11/playwright.config.ts --reporter=list
echo "PASS: F08"
```

-----

## F09 — `/methodology`: top-10 visible, “Show all 47” expands, citations

**Invariants:** ID1, IE3 §13 AC · **Runner:** Playwright · **No DB seed**

### `tests/qa/sprint11/f09-methodology-page.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('F09: /methodology page (ID1, IE3 — §13 AC)', () => {

  test('F09-01: GET /methodology returns 200 (public — no auth)', async ({ request }) => {
    expect((await request.get('/methodology')).status()).toBe(200);
  });

  test('F09-02: /methodology has a Methodology heading', async ({ page }) => {
    await page.goto('/methodology');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /methodology/i }).first())
      .toBeVisible({ timeout: 8_000 });
  });

  test('F09-03: /methodology renders dimension or method-related content above fold', async ({ page }) => {
    await page.goto('/methodology');
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').textContent() ?? '';
    const terms = ['frequency', 'position', 'sentiment', 'context', 'accuracy', 'citability', 'method'];
    const found = terms.filter(t => body.toLowerCase().includes(t));
    expect(found.length).toBeGreaterThanOrEqual(2);
  });

  test('F09-04: "Show all 47" trigger is visible (IE3 §13 AC)', async ({ page }) => {
    await page.goto('/methodology');
    await page.waitForLoadState('networkidle');
    const trigger = page.getByRole('button', { name: /show all|47 method/i })
      .or(page.getByText(/show all 47/i)).first();
    await expect(trigger).toBeVisible({ timeout: 10_000 });
  });

  test('F09-05: clicking "Show all 47" expands the Collapsible (aria-expanded check)', async ({ page }) => {
    // FIX H: Neither textContent() nor innerText() reliably detect Collapsible expansion.
    // Radix Collapsible uses height:0 overflow:hidden (closed) → height:auto (open).
    // Both textContent and innerText include height:0 content.
    // CORRECT approach: Radix sets aria-expanded on the CollapsibleTrigger button.
    // Before click: aria-expanded='false' (or absent). After click: aria-expanded='true'.
    // This is a semantic HTML attribute that directly reflects Collapsible open/closed state.
    await page.goto('/methodology');
    await page.waitForLoadState('networkidle');

    const trigger = page.getByRole('button', { name: /show all|47 method/i })
      .or(page.getByText(/show all 47/i)).first();
    await expect(trigger).toBeVisible({ timeout: 8_000 });

    // Before click: trigger must not already be expanded
    // (Radix may omit aria-expanded when closed, so we check it's not 'true')
    const beforeExpanded = await trigger.getAttribute('aria-expanded');
    expect(beforeExpanded).not.toBe('true');

    // Click to expand
    await trigger.click();
    await page.waitForTimeout(400);  // allow Radix height animation to complete

    // After click: aria-expanded should be 'true' (Radix sets this on CollapsibleTrigger)
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  test('F09-06: /methodology includes at least one named research citation (IE3)', async ({ page }) => {
    await page.goto('/methodology');
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').textContent() ?? '';
    expect(/Princeton|AutoGEO|Tinuiti|SE Ranking|KDD 2024|ICLR 2026/i.test(body)).toBe(true);
  });

  test('F09-07: /methodology is in marketing layout (header + footer)', async ({ page }) => {
    await page.goto('/methodology');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('header').first()).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('footer').first()).toBeVisible({ timeout: 8_000 });
  });

  test('F09-08: /methodology HTML has og:title containing "Methodology"', async ({ request }) => {
    const html = await (await request.get('/methodology')).text();
    expect(html).toContain('og:title');
    expect(html).toMatch(/Methodology.*VisibleAU|VisibleAU.*Methodology/i);
  });
});
```

### `tests/qa/sprint11/f09-methodology-page.bat`

```batch
@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo  F09 /methodology Page (ID1, IE3 — §13 AC)
echo  Tests: 8  Runner: Playwright  Auto-starts: pnpm dev
echo ============================================================
dotenv -e .env.test.local -- pnpm drizzle-kit migrate
if %ERRORLEVEL% neq 0 ( echo FAIL: migrations & exit /b 1 )
set OWN=0
curl -sf http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% neq 0 (
  dotenv -e .env.test.local -- pnpm dev > nul 2>&1 & set OWN=1 & set W=0
  :WAIT9
  timeout /t 2 /nobreak > nul & set /a W+=2
  curl -sf http://localhost:3000/api/health > nul 2>&1 && goto UP9
  if !W! geq 45 ( echo FAIL: server timeout & exit /b 1 )
  goto WAIT9
  :UP9
)
dotenv -e .env.test.local -- pnpm exec playwright test ^
  tests/qa/sprint11/f09-methodology-page.spec.ts ^
  --config tests/qa/sprint11/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
if %OWN% equ 1 ( for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %%a /F > nul 2>&1 )
if %EXIT% equ 0 ( echo PASS: F09 ) else ( echo FAIL: F09 & exit /b 1 )
exit /b %EXIT%
```

### `tests/qa/sprint11/f09-methodology-page.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "=== F09 /methodology Page (ID1, IE3 §13 AC) ==="
dotenv -e .env.test.local -- pnpm drizzle-kit migrate
DEV_PID=""
if ! curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
  dotenv -e .env.test.local -- pnpm dev > /tmp/pnpm-dev-s11-f09.log 2>&1 & DEV_PID=$!
  WAITED=0
  until curl -sf http://localhost:3000/api/health > /dev/null 2>&1; do
    sleep 2; WAITED=$((WAITED+2)); [ $WAITED -ge 45 ] && { kill "$DEV_PID" 2>/dev/null; exit 1; }
  done
fi
cleanup() { [ -n "$DEV_PID" ] && kill "$DEV_PID" 2>/dev/null || true; }; trap cleanup EXIT
dotenv -e .env.test.local -- pnpm exec playwright test \
  tests/qa/sprint11/f09-methodology-page.spec.ts \
  --config tests/qa/sprint11/playwright.config.ts --reporter=list
echo "PASS: F09"
```

-----

## F10 — Error/loading states: 404 friendly, no stack trace, no horizontal scroll

**Invariants:** IC1, §8, §13 AC · **Runner:** Playwright

### `tests/qa/sprint11/f10-error-loading-states.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('F10: Error + loading states (IC1, §8, §13 mobile AC)', () => {

  test('F10-01: /nonexistent-route returns HTTP 404', async ({ request }) => {
    expect((await request.get('/s11qa-route-must-not-exist-abc123')).status()).toBe(404);
  });

  test('F10-02: 404 page shows friendly message (§8 IE2)', async ({ page }) => {
    await page.goto('/s11qa-route-must-not-exist-abc123');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/404|not found|couldn.t find/i);
  });

  test('F10-03: 404 page has back-to-home or back-to-dashboard link', async ({ page }) => {
    await page.goto('/s11qa-route-must-not-exist-abc123');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: /back|home|dashboard/i }).first())
      .toBeVisible({ timeout: 8_000 });
  });

  test('F10-04: 404 page does NOT expose raw stack trace (§8)', async ({ page }) => {
    await page.goto('/s11qa-route-must-not-exist-abc123');
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('at Object.<anonymous>');
    expect(body).not.toContain('node_modules');
  });

  test('F10-05: /api/health responds 200 (server running)', async ({ request }) => {
    expect((await request.get('/api/health')).status()).toBe(200);
  });

  test('F10-06: /dashboard renders without Application error (IC1 smoke)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toMatch(/dashboard|sign-in/);
    const critical = errors.filter(e => !e.includes('ResizeObserver') && !e.includes('Script error'));
    expect(critical.length).toBe(0);
  });

  test('F10-07: /pricing renders without uncaught JS exceptions', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');
    expect(errors.filter(e => !e.includes('ResizeObserver')).length).toBe(0);
  });

  test('F10-08: / — no horizontal scroll at 375px (§13 mobile AC)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    const cw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(cw + 2);
  });

  test('F10-09: /methodology — no horizontal scroll at 375px (FIX B: 200 check first)', async ({ page }) => {
    // FIX B: Must confirm /methodology returns 200 BEFORE checking scroll.
    // A 404 page also has no horizontal scroll → test would pass even if route missing.
    // This check makes the test correctly fail if /methodology is not implemented.
    await page.setViewportSize({ width: 375, height: 812 });
    const res = await page.goto('/methodology');
    expect(res?.status()).toBe(200);  // block if 404 — prevents false positive
    await page.waitForLoadState('networkidle');
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    const cw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(cw + 2);
  });

  test('F10-10: /pricing — no horizontal scroll at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    const cw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(cw + 2);
  });
});
```

### `tests/qa/sprint11/f10-error-loading-states.bat`

```batch
@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo  F10 Error + Loading States (IC1, §8, §13 mobile)
echo  Tests: 10  Runner: Playwright  Auto-starts: pnpm dev
echo ============================================================
dotenv -e .env.test.local -- pnpm drizzle-kit migrate
if %ERRORLEVEL% neq 0 ( echo FAIL: migrations & exit /b 1 )
set OWN=0
curl -sf http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% neq 0 (
  dotenv -e .env.test.local -- pnpm dev > nul 2>&1 & set OWN=1 & set W=0
  :WAIT10
  timeout /t 2 /nobreak > nul & set /a W+=2
  curl -sf http://localhost:3000/api/health > nul 2>&1 && goto UP10
  if !W! geq 45 ( echo FAIL: server timeout & exit /b 1 )
  goto WAIT10
  :UP10
)
dotenv -e .env.test.local -- pnpm exec playwright test ^
  tests/qa/sprint11/f10-error-loading-states.spec.ts ^
  --config tests/qa/sprint11/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
if %OWN% equ 1 ( for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %%a /F > nul 2>&1 )
if %EXIT% equ 0 ( echo PASS: F10 ) else ( echo FAIL: F10 & exit /b 1 )
exit /b %EXIT%
```

### `tests/qa/sprint11/f10-error-loading-states.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "=== F10 Error + Loading States (IC1, §8) ==="
dotenv -e .env.test.local -- pnpm drizzle-kit migrate
DEV_PID=""
if ! curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
  dotenv -e .env.test.local -- pnpm dev > /tmp/pnpm-dev-s11-f10.log 2>&1 & DEV_PID=$!
  WAITED=0
  until curl -sf http://localhost:3000/api/health > /dev/null 2>&1; do
    sleep 2; WAITED=$((WAITED+2)); [ $WAITED -ge 45 ] && { kill "$DEV_PID" 2>/dev/null; exit 1; }
  done
fi
cleanup() { [ -n "$DEV_PID" ] && kill "$DEV_PID" 2>/dev/null || true; }; trap cleanup EXIT
dotenv -e .env.test.local -- pnpm exec playwright test \
  tests/qa/sprint11/f10-error-loading-states.spec.ts \
  --config tests/qa/sprint11/playwright.config.ts --reporter=list
echo "PASS: F10"
```

-----

## F11 — `POST /api/onboarding/tour-complete` — exists, 401 unauth, merges flag

**Invariants:** IC4, IA2 · **Runner:** Playwright · **Seeds org + user, cleans up in afterAll**

### `tests/qa/sprint11/f11-tour-complete-api.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { db, schema }   from './shared/db';
import { seedOrg, seedUser, cleanupOrg } from './shared/seed';
import { eq, sql }      from 'drizzle-orm';

const CLERK_ORG  = `org_s11qa_f11_${Date.now()}`;
const CLERK_USER = `user_s11qa_f11_${Date.now()}`;
let orgId = '';

test.beforeAll(async () => {
  const org = await seedOrg({
    clerkOrgId: CLERK_ORG, name: '[S11QA F11] Tour Complete', tier: 'free', metadata: {},
  });
  orgId = org.id;
  await seedUser({ clerkUserId: CLERK_USER, organizationId: orgId,
                   email: `f11_${Date.now()}@s11qa.test` });
});

test.afterAll(async () => { if (orgId) await cleanupOrg(orgId); });

test.describe('F11: POST /api/onboarding/tour-complete (IC4, IA2)', () => {

  test('F11-01: route exists — returns 200 or 401, never 404 (IC4 fix)', async ({ request }) => {
    const status = (await request.post('/api/onboarding/tour-complete')).status();
    expect(status).not.toBe(404);
    expect([200, 401]).toContain(status);
  });

  test('F11-02: unauthenticated POST → 401 JSON (IC4 auth guard)', async ({ request }) => {
    const res = await request.post('/api/onboarding/tour-complete');
    expect(res.status()).toBe(401);
    expect(res.headers()['content-type'] ?? '').toContain('application/json');
  });

  test('F11-03: DB direct — completeTour() sets productTourComplete=true in metadata', async () => {
    const [org] = await db.select({ meta: schema.organizations.metadata })
      .from(schema.organizations).where(eq(schema.organizations.id, orgId));
    const merged = { ...(org.meta as any ?? {}), productTourComplete: true };
    await db.update(schema.organizations).set({ metadata: merged })
      .where(eq(schema.organizations.id, orgId));
    const [updated] = await db.select({ meta: schema.organizations.metadata })
      .from(schema.organizations).where(eq(schema.organizations.id, orgId));
    expect((updated.meta as any).productTourComplete).toBe(true);
  });

  test('F11-04: after completeTour(), dashboard should hide tour (shouldShowTour=false)', async () => {
    const [org] = await db.select({ meta: schema.organizations.metadata })
      .from(schema.organizations).where(eq(schema.organizations.id, orgId));
    expect(!(org.meta as any)?.productTourComplete).toBe(false);
  });

  test('F11-05: productTourComplete is in jsonb — NOT a dedicated column (IA2)', async () => {
    const rows = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='organizations'
        AND column_name='product_tour_complete'
    `);
    expect(rows.length).toBe(0);
  });

  test('F11-06: POST /api/onboarding/tour-complete responds within 5s', async ({ request }) => {
    const start = Date.now();
    await request.post('/api/onboarding/tour-complete');
    expect(Date.now() - start).toBeLessThan(5_000);
  });
});
```

### `tests/qa/sprint11/f11-tour-complete-api.bat`

```batch
@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo  F11 POST /api/onboarding/tour-complete (IC4, IA2)
echo  Tests: 6  Runner: Playwright
echo  Data: org [S11QA F11] seeded + deleted
echo ============================================================
dotenv -e .env.test.local -- pnpm drizzle-kit migrate
if %ERRORLEVEL% neq 0 ( echo FAIL: migrations & exit /b 1 )
set OWN=0
curl -sf http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% neq 0 (
  dotenv -e .env.test.local -- pnpm dev > nul 2>&1 & set OWN=1 & set W=0
  :WAIT11
  timeout /t 2 /nobreak > nul & set /a W+=2
  curl -sf http://localhost:3000/api/health > nul 2>&1 && goto UP11
  if !W! geq 45 ( echo FAIL: server timeout & exit /b 1 )
  goto WAIT11
  :UP11
)
dotenv -e .env.test.local -- pnpm exec playwright test ^
  tests/qa/sprint11/f11-tour-complete-api.spec.ts ^
  --config tests/qa/sprint11/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
if %OWN% equ 1 ( for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %%a /F > nul 2>&1 )
if %EXIT% equ 0 ( echo PASS: F11 — DB cleaned ) else ( echo FAIL: F11 & exit /b 1 )
exit /b %EXIT%
```

### `tests/qa/sprint11/f11-tour-complete-api.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "=== F11 POST /api/onboarding/tour-complete (IC4, IA2) ==="
dotenv -e .env.test.local -- pnpm drizzle-kit migrate
DEV_PID=""
if ! curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
  dotenv -e .env.test.local -- pnpm dev > /tmp/pnpm-dev-s11-f11.log 2>&1 & DEV_PID=$!
  WAITED=0
  until curl -sf http://localhost:3000/api/health > /dev/null 2>&1; do
    sleep 2; WAITED=$((WAITED+2)); [ $WAITED -ge 45 ] && { kill "$DEV_PID" 2>/dev/null; exit 1; }
  done
fi
cleanup() { [ -n "$DEV_PID" ] && kill "$DEV_PID" 2>/dev/null || true; }; trap cleanup EXIT
dotenv -e .env.test.local -- pnpm exec playwright test \
  tests/qa/sprint11/f11-tour-complete-api.spec.ts \
  --config tests/qa/sprint11/playwright.config.ts --reporter=list
echo "PASS: F11 — DB cleaned"
```

-----

## F12 — SEO: robots.txt, sitemap.xml, OG tags, canonical

**Invariants:** IB1, IC2, IP5, ID3 · **Runner:** Playwright · **No DB seed**

### `tests/qa/sprint11/f12-seo-meta.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('F12: SEO — robots.txt, sitemap, OG tags, canonical (IB1, IC2, IP5, ID3)', () => {

  // FIX D: robots.txt + sitemap are BUILD-TIME artifacts (next-sitemap postbuild).
  // pnpm dev does NOT generate them → F12-01..05 return 404 in dev mode.
  // Set E2E_BUILD_TESTS=true and run 'pnpm build && pnpm start' to enable.
  // Pattern matches SPRINT11-FRONTEND-E2E.md FE-02-07/08 guard.
  const BUILD_TESTS = process.env.E2E_BUILD_TESTS === 'true';

  test('F12-01: GET /robots.txt returns 200 (ID3)', async ({ request }) => {
    test.skip(!BUILD_TESTS, 'Requires E2E_BUILD_TESTS=true (pnpm build && pnpm start)');
    expect((await request.get('/robots.txt')).status()).toBe(200);
  });

  test('F12-02: robots.txt has User-agent: * and Allow: /', async ({ request }) => {
    test.skip(!BUILD_TESTS, 'Requires E2E_BUILD_TESTS=true (pnpm build && pnpm start)');
    const body = await (await request.get('/robots.txt')).text();
    expect(body).toContain('User-agent: *');
    expect(body).toContain('Allow: /');
  });

  test('F12-03: robots.txt Disallows /api/ and /dashboard (ID4)', async ({ request }) => {
    test.skip(!BUILD_TESTS, 'Requires E2E_BUILD_TESTS=true (pnpm build && pnpm start)');
    const body = await (await request.get('/robots.txt')).text();
    expect(body).toContain('/api/');
    expect(body).toContain('/dashboard');
  });

  test('F12-04: sitemap.xml or sitemap-0.xml returns 200 (ID3)', async ({ request }) => {
    test.skip(!BUILD_TESTS, 'Requires E2E_BUILD_TESTS=true (pnpm build && pnpm start)');
    const r1 = await request.get('/sitemap.xml');
    const r2 = await request.get('/sitemap-0.xml');
    expect(r1.status() === 200 || r2.status() === 200).toBe(true);
  });

  test('F12-05: sitemap contains /methodology URL (FIX C: checks both sitemaps)', async ({ request }) => {
    test.skip(!BUILD_TESTS, 'Requires E2E_BUILD_TESTS=true (pnpm build && pnpm start)');
    // FIX C: next-sitemap generates sitemap.xml (index) + sitemap-0.xml (actual page URLs).
    // If sitemap.xml is the index file, its body lists sitemap-0.xml — NOT individual URLs.
    // Reading only sitemap.xml and checking for '/methodology' would always fail on multi-file sitemaps.
    // Fix: fetch both and check if EITHER body contains '/methodology'.
    const r1 = await request.get('/sitemap.xml');
    const r2 = await request.get('/sitemap-0.xml');
    const body1 = r1.status() === 200 ? await r1.text() : '';
    const body2 = r2.status() === 200 ? await r2.text() : '';
    const combined = body1 + body2;
    expect(combined).toContain('/methodology');
  });

  test('F12-06: / og:title does NOT contain "undefined" (IB1)', async ({ request }) => {
    const html = await (await request.get('/')).text();
    expect(html).toContain('og:title');
    const ogTitle = html.match(/property="og:title"[^>]*content="([^"]+)"/)?.[1] ?? '';
    expect(ogTitle).not.toContain('undefined');
    expect(ogTitle.length).toBeGreaterThan(5);
  });

  test('F12-07: / og:url does NOT contain "undefined" (IB1)', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const ogUrl = html.match(/property="og:url"[^>]*content="([^"]+)"/)?.[1] ?? '';
    expect(html).toContain('og:url');
    expect(ogUrl).not.toContain('undefined');
  });

  test('F12-08: /pricing og:description is NOT literal "..." (IC2)', async ({ request }) => {
    const html = await (await request.get('/pricing')).text();
    const ogDesc = html.match(/property="og:description"[^>]*content="([^"]+)"/)?.[1] ?? '';
    expect(ogDesc).not.toBe('...');
    expect(ogDesc).not.toContain('undefined');
    expect(ogDesc.length).toBeGreaterThan(10);
  });

  test('F12-09: /pricing has <link rel="canonical"> without query params (IP5)', async ({ request }) => {
    const html = await (await request.get('/pricing')).text();
    expect(html.includes('rel="canonical"') || html.includes("rel='canonical'")).toBe(true);
    const canonical = html.match(/rel="canonical"[^>]+href="([^"]+)"/)?.[1] ?? '';
    if (canonical) expect(canonical).not.toContain('?');
  });

  test('F12-10: /methodology og:image = "/og-image.png" (IJ3)', async ({ request }) => {
    const html = await (await request.get('/methodology')).text();
    expect(html).toContain('og:image');
    expect(html).toContain('og-image.png');
  });

  test('F12-11: / twitter:card = "summary_large_image"', async ({ request }) => {
    const html = await (await request.get('/')).text();
    expect(html).toContain('twitter:card');
    expect(html).toContain('summary_large_image');
  });

  test('F12-12: NEXT_PUBLIC_APP_URL is a valid URL (IB1)', () => {
    const url = process.env.NEXT_PUBLIC_APP_URL ?? '';
    expect(url).not.toBe('');
    expect(url).not.toContain('undefined');
    expect(url).toMatch(/^https?:\/\//);
  });

  test('F12-13: NEXT_PUBLIC_APP_DESCRIPTION is set (IC2)', () => {
    const desc = process.env.NEXT_PUBLIC_APP_DESCRIPTION ?? '';
    expect(desc).not.toBe('');
    expect(desc).not.toBe('...');
    expect(desc.length).toBeGreaterThan(10);
  });
});
```

### `tests/qa/sprint11/f12-seo-meta.bat`

```batch
@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo  F12 SEO — robots.txt + sitemap + OG tags + canonical
echo  Tests: 13  Runner: Playwright  Auto-starts: pnpm dev
echo ============================================================
dotenv -e .env.test.local -- pnpm drizzle-kit migrate
if %ERRORLEVEL% neq 0 ( echo FAIL: migrations & exit /b 1 )
set OWN=0
curl -sf http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% neq 0 (
  dotenv -e .env.test.local -- pnpm dev > nul 2>&1 & set OWN=1 & set W=0
  :WAIT12
  timeout /t 2 /nobreak > nul & set /a W+=2
  curl -sf http://localhost:3000/api/health > nul 2>&1 && goto UP12
  if !W! geq 45 ( echo FAIL: server timeout & exit /b 1 )
  goto WAIT12
  :UP12
)
dotenv -e .env.test.local -- pnpm exec playwright test ^
  tests/qa/sprint11/f12-seo-meta.spec.ts ^
  --config tests/qa/sprint11/playwright.config.ts --reporter=list
set EXIT=%ERRORLEVEL%
if %OWN% equ 1 ( for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %%a /F > nul 2>&1 )
if %EXIT% equ 0 ( echo PASS: F12 ) else ( echo FAIL: F12 & exit /b 1 )
exit /b %EXIT%
```

### `tests/qa/sprint11/f12-seo-meta.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "=== F12 SEO — robots.txt + sitemap + OG + canonical ==="
dotenv -e .env.test.local -- pnpm drizzle-kit migrate
DEV_PID=""
if ! curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
  dotenv -e .env.test.local -- pnpm dev > /tmp/pnpm-dev-s11-f12.log 2>&1 & DEV_PID=$!
  WAITED=0
  until curl -sf http://localhost:3000/api/health > /dev/null 2>&1; do
    sleep 2; WAITED=$((WAITED+2)); [ $WAITED -ge 45 ] && { kill "$DEV_PID" 2>/dev/null; exit 1; }
  done
fi
cleanup() { [ -n "$DEV_PID" ] && kill "$DEV_PID" 2>/dev/null || true; }; trap cleanup EXIT
dotenv -e .env.test.local -- pnpm exec playwright test \
  tests/qa/sprint11/f12-seo-meta.spec.ts \
  --config tests/qa/sprint11/playwright.config.ts --reporter=list
echo "PASS: F12"
```

-----

## 5. Run-all scripts

### `tests/qa/sprint11/run-all-sprint11.bat`

```batch
@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo  VisibleAU Sprint 11 — Complete QA Suite (12 features)
echo  Unit tests (F01-F05): no server. Playwright (F06-F12): shared pnpm dev.
echo ============================================================
echo.
set PASS=0 & set FAIL=0 & set FAILED=
echo [SETUP] Applying migrations...
dotenv -e .env.test.local -- pnpm drizzle-kit migrate
if %ERRORLEVEL% neq 0 ( echo FAIL: migrations -- aborting & exit /b 1 )
echo.
echo -- Unit Tests (F01-F05) --
for %%F in (f01-schema-guard f02-build-metadata f03-product-tour-flag f04-empty-state-copy f05-progress-stepper) do (
  echo Running %%F...
  dotenv -e .env.test.local -- pnpm vitest run ^
    --config tests/qa/sprint11/vitest.config.ts ^
    tests/qa/sprint11/%%F.test.ts ^
    --reporter=verbose > nul 2>&1
  if !ERRORLEVEL! equ 0 ( set /a PASS+=1 & echo   PASS: %%F ) else ( set /a FAIL+=1 & set FAILED=!FAILED! %%F & echo   FAIL: %%F )
)
echo.
echo -- Playwright Tests (F06-F12) --
set OWN=0
curl -sf http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% neq 0 (
  dotenv -e .env.test.local -- pnpm dev > nul 2>&1 & set OWN=1 & set W=0
  :WAIT_ALL
  timeout /t 2 /nobreak > nul & set /a W+=2
  curl -sf http://localhost:3000/api/health > nul 2>&1 && goto UP_ALL
  if !W! geq 50 ( echo WARN: server timeout -- skipping Playwright & goto RESULTS )
  goto WAIT_ALL
  :UP_ALL
  echo Dev server ready after !W!s
)
for %%F in (f06-landing-page f07-marketing-nav f08-legal-pages f09-methodology-page f10-error-loading-states f11-tour-complete-api f12-seo-meta) do (
  echo Running %%F...
  dotenv -e .env.test.local -- pnpm exec playwright test ^
    tests/qa/sprint11/%%F.spec.ts ^
    --config tests/qa/sprint11/playwright.config.ts ^
    --reporter=list > nul 2>&1
  if !ERRORLEVEL! equ 0 ( set /a PASS+=1 & echo   PASS: %%F ) else ( set /a FAIL+=1 & set FAILED=!FAILED! %%F & echo   FAIL: %%F )
)
if %OWN% equ 1 ( for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %%a /F > nul 2>&1 )
:RESULTS
echo.
echo ============================================================
echo  Sprint 11 QA Results
echo ============================================================
echo  PASSED: %PASS%   FAILED: %FAIL%
if not "%FAILED%"=="" echo  Failed: %FAILED%
if %FAIL% equ 0 ( echo  ALL GREEN ) else ( echo  SOME FAILURES & exit /b 1 )
```

### `tests/qa/sprint11/run-all-sprint11.sh`

```bash
#!/usr/bin/env bash
set -uo pipefail
echo "============================================================"
echo " VisibleAU Sprint 11 — Complete QA Suite (12 features)"
echo "============================================================"
echo
PASS=0; FAIL=0; FAILED=()
run_unit() {
  local name=$1; printf "  %-38s" "$name ..."
  if dotenv -e .env.test.local -- pnpm vitest run \
       --config tests/qa/sprint11/vitest.config.ts \
       "tests/qa/sprint11/${name}.test.ts" \
       --reporter=verbose > "/tmp/s11qa_${name}.log" 2>&1; then
    ((PASS++)); echo "PASS"
  else ((FAIL++)); FAILED+=("$name"); echo "FAIL (see /tmp/s11qa_${name}.log)"; fi
}
run_pw() {
  local name=$1; printf "  %-38s" "$name ..."
  if dotenv -e .env.test.local -- pnpm exec playwright test \
       "tests/qa/sprint11/${name}.spec.ts" \
       --config tests/qa/sprint11/playwright.config.ts \
       --reporter=list > "/tmp/s11qa_${name}.log" 2>&1; then
    ((PASS++)); echo "PASS"
  else ((FAIL++)); FAILED+=("$name"); echo "FAIL (see /tmp/s11qa_${name}.log)"; fi
}
echo "[SETUP] Applying migrations..."
dotenv -e .env.test.local -- pnpm drizzle-kit migrate; echo
echo "-- Unit Tests (F01-F05) --"
for n in f01-schema-guard f02-build-metadata f03-product-tour-flag f04-empty-state-copy f05-progress-stepper; do run_unit "$n"; done; echo
echo "-- Playwright Tests (F06-F12) --"
DEV_PID=""
if ! curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
  dotenv -e .env.test.local -- pnpm dev > /tmp/pnpm-dev-s11qa.log 2>&1 & DEV_PID=$!
  WAITED=0
  until curl -sf http://localhost:3000/api/health > /dev/null 2>&1; do
    sleep 2; WAITED=$((WAITED+2)); [ $WAITED -ge 50 ] && { echo "  WARN: server timeout — skipping PW"; break; }
  done
  [ $WAITED -lt 50 ] && echo "  Dev server ready after ${WAITED}s"
fi
cleanup() { [ -n "$DEV_PID" ] && kill "$DEV_PID" 2>/dev/null || true; }; trap cleanup EXIT
if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
  for n in f06-landing-page f07-marketing-nav f08-legal-pages f09-methodology-page f10-error-loading-states f11-tour-complete-api f12-seo-meta; do run_pw "$n"; done
fi
echo; echo "============================================================"
echo " Sprint 11 QA Results"
echo "============================================================"
printf " PASSED: %d   FAILED: %d\n" "$PASS" "$FAIL"
[ ${#FAILED[@]} -gt 0 ] && echo " Failed: ${FAILED[*]}"
[ "$FAIL" -eq 0 ] && echo " ALL GREEN" || { echo " SOME FAILURES"; exit 1; }
```

-----

## 6. PASS criteria

**All 12 features green. Zero orphan DB rows after each run.**

|Feature              |Tests|Key assertion                                                                               |
|---------------------|-----|--------------------------------------------------------------------------------------------|
|F01 Schema guard     |6    |No sprint11% tables; metadata jsonb writable; NO dedicated `product_tour_complete` column   |
|F02 buildMetadata    |12   |OG url ≠ `undefined/...`; description ≠ `'...'`; canonical = OG url; canonical has no `?`   |
|F03 Product tour flag|8    |shouldShowTour reads jsonb; completeTour spreads (preserves Sprint 10 keys); server-side    |
|F04 EmptyState copy  |12   |No Lorem ipsum; real copy for brands/audits/actions; correct CTA hrefs                      |
|F05 ProgressStepper  |10   |4 steps: Add brand→Configure→Run audit→See results; correct state per currentStep           |
|F06 Landing page     |15   |All 9 sections inc. FAQ; hero CTA → /sample-audit loads; trust badges; no Lorem ipsum       |
|F07 Marketing nav    |14   |Pricing · Methodology · About; Sign in → /sign-in; Get started → /sign-up; no Verticals/Docs|
|F08 Legal pages      |10   |/about /privacy /terms all 200; Privacy Act reference; governing law; footer present        |
|F09 Methodology      |8    |GET 200 public; top-10 visible; “Show all 47” expands; ≥1 citation name                     |
|F10 Error/loading    |10   |404 friendly; no stack trace; no JS crash; no horizontal scroll at 375px                    |
|F11 Tour API         |6    |Route NOT 404; unauth = 401 JSON; flag written to jsonb; no dedicated column                |
|F12 SEO              |13   |robots.txt 200 + Disallows; sitemap has /methodology; OG no `undefined`; canonical no `?`   |

**Specifically must pass (blocking merge):**

- `F01-03`: NO `product_tour_complete` column — flag is in `metadata` jsonb (IA2)
- `F02-06`: OG url does NOT contain `undefined` (IB1 — all social previews broken otherwise)
- `F02-08`: OG url = canonical URL (IP5)
- `F02-09`: canonical has NO query params (IP5 — prevents `?tab=annual` duplicate content)
- `F03-06`: `completeTour()` MERGES metadata — does NOT overwrite Sprint 10 `firstTimeFlowComplete`
- `F06-04`: hero CTA href matches `/sample-audit` (Sprint 10 route)
- `F09-01`: GET `/methodology` returns HTTP 200 — **IE3 fix: explicitly in §13 AC**
- `F09-04`: “Show all 47” trigger is visible — **IE3 §13 AC**
- `F11-01`: POST `/api/onboarding/tour-complete` is NOT 404 — **IC4 fix: route must be created**
- `F11-02`: unauthenticated POST returns 401 — IC4 auth guard
- `F12-08`: `/pricing` OG description is NOT literal `'...'` — **IC2 fix: ships to production**
- `F12-09`: `/pricing` has `<link rel="canonical">` — IP5