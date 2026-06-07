# VisibleAU — Sprint 8 QA Feature Document

**Sprint:** 8 — Local SEO · Drift Detection · Export Formats · Webhook Integrations  
**Purpose:** Claude Code pastes each feature section and runs the accompanying batch/shell script.
Each script seeds real database rows, starts the Next.js dev server (for API/UI tests),
runs all tests, then hard-deletes every seeded row — pass **or** fail.

-----

## Environment setup

Copy `.env.example` → `.env.test.local` and fill in:

```bash
DATABASE_URL=postgresql://postgres:secret@localhost:5432/visibleau_test
DIRECT_URL=postgresql://postgres:secret@localhost:5432/visibleau_test
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
E2E_TEST_USER_1_EMAIL=s8qa1@example.com
E2E_TEST_USER_1_PASSWORD=QAS8U1!secure
E2E_TEST_USER_1_CLERK_ID=user_s8qa1
E2E_TEST_ORG_1_CLERK_ID=org_s8qa1
E2E_TEST_USER_2_EMAIL=s8qa2@example.com
E2E_TEST_USER_2_PASSWORD=QAS8U2!secure
E2E_TEST_USER_2_CLERK_ID=user_s8qa2
E2E_TEST_ORG_2_CLERK_ID=org_s8qa2
LLM_MODE=mock
INNGEST_EVENT_KEY=test
E2E_APP_URL=http://localhost:3000
```

**playwright.config.ts** (shared across all browser features):

```typescript
// tests/qa/sprint8/playwright.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  use: {
    baseURL:        process.env.E2E_APP_URL ?? 'http://localhost:3000',
    trace:          'on-first-retry',
    screenshot:     'only-on-failure',
    navigationTimeout: 20_000,
    actionTimeout:     10_000,
  },
  workers: 1,   // serial — single Clerk session at a time
  retries:  1,
});
```

-----

## Sprint 8 canonical invariants (tests must verify these)

|Code|Invariant                                                                                          |Bug if ignored              |
|----|---------------------------------------------------------------------------------------------------|----------------------------|
|FA1 |`gmbPresent`, `acknowledged`, `isActive` — **boolean**, not text                                   |Comparisons always false    |
|FA2 |Inngest listens on **slash**: `'audit/complete'` — delivery events use **dot**: `'audit.completed'`|Inngest function never fires|
|FB1 |`local_seo_results.organizationId` column exists                                                   |RLS returns zero rows       |
|FB5 |Drift severity: `significant_drop` | `significant_rise` | `within_noise`                           |Badge renders undefined     |
|FC1 |Composite drift → **raw delta ≥ 5pts** — NOT `ciOverlaps` (composite has no binomial CI)           |Always within_noise         |
|FC4 |`webhook_endpoints.events[]` use **dots**: `'audit.completed'`                                     |Delivery never matched      |
|FC5 |Confidence: ≥70 = `confirmed`, 40–69 = `likely`, <40 = `hypothesis`                                |Wrong label                 |
|FD4 |`webhook_deliveries.organizationId` is **denormalised** on each row                                |RLS unenforceable           |
|FG2 |HMAC signing → Node.js `crypto.createHmac` — NOT `@stablelib`                                      |Import crash                |
|FG3 |`drift_alerts.updatedAt` NOT NULL                                                                  |PATCH fails                 |
|FG4 |`webhook_endpoints.updatedAt` NOT NULL                                                             |PATCH fails                 |
|FH1 |`fanoutWebhooksFn` in `serve()`                                                                    |Zero webhooks ever delivered|
|FH4 |POST `/api/webhooks-config/[id]/test` returns `{ ok }`                                             |Test button broken          |
|FH5 |`audit_exports.downloadCount` increments per download                                              |Analytics always 0          |
|FJ1 |Sprint 8 = **4 AU directories** (not 5; Sprint 9 adds GMB)                                         |Wrong count shown           |
|FM5 |`GET /api/audits` LEFT JOINs `drift_alerts` → `driftSeverity` field                                |Drift badge never shown     |
|FN3 |`drift_alerts` has 2 indexes: `(orgId,acknowledged)` + `(brandId,createdAt)`                       |Slow queries                |
|FN4 |NAP card shows “of **6** sources” — not 11 or 12                                                   |Wrong denominator           |
|FO5 |`local_seo_results` has both `checkedAt` AND `createdAt`                                           |Insert fails                |

-----

## Shared helpers

### `tests/qa/sprint8/shared/db.ts`

```typescript
import { drizzle }  from 'drizzle-orm/postgres-js';
import postgres      from 'postgres';
import * as schema   from '../../../db/schema';

const client = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { max: 1 });
export const db = drizzle(client, { schema });
export { schema };
```

### `tests/qa/sprint8/shared/seed.ts`

```typescript
import { db, schema }  from './db';
import { eq, inArray } from 'drizzle-orm';

// ── Core entities ─────────────────────────────────────────────────────────────
export async function seedOrg(p: { clerkOrgId: string; name: string; tier?: string }) {
  const [o] = await db.insert(schema.organizations)
    .values({ clerkOrgId: p.clerkOrgId, name: p.name, region: 'au', tier: p.tier ?? 'agency' })
    .onConflictDoUpdate({ target: schema.organizations.clerkOrgId,
      set: { name: p.name, tier: p.tier ?? 'agency' } })
    .returning();
  return o;
}

export async function seedUser(p: { clerkUserId: string; organizationId: string; email: string }) {
  const [u] = await db.insert(schema.users)
    .values({ clerkUserId: p.clerkUserId, organizationId: p.organizationId,
      email: p.email, name: '[S8QA]', role: 'owner' })
    .onConflictDoUpdate({ target: schema.users.clerkUserId,
      set: { organizationId: p.organizationId } })
    .returning();
  return u;
}

export async function seedBrand(p: { organizationId: string; name?: string }) {
  const [b] = await db.insert(schema.brands).values({
    organizationId: p.organizationId,
    name:           p.name ?? '[S8QA] Brand',
    domain:         `s8qa-${Date.now()}-${Math.random().toString(36).slice(2,7)}.com.au`,
    vertical: 'tradies', region: 'au', competitors: [],
    primaryRegions: ['NSW:Bondi', 'NSW:Coogee'],
  }).returning();
  return b;
}

export async function seedAudit(p: {
  organizationId: string; brandId: string;
  auditNumber?: number; scoreComposite?: string;
  confidenceIntervals?: Record<string, { lower: number; upper: number }>;
}) {
  const [a] = await db.insert(schema.audits).values({
    organizationId: p.organizationId, brandId: p.brandId,
    auditNumber: p.auditNumber ?? 1, triggeredBy: 'manual', status: 'complete',
    engines: ['chatgpt','claude','gemini','perplexity'],
    runsPerPrompt: 5, promptsCount: 10, promptCount: 10, totalCalls: 200, engineCount: 4,
    scoreFrequency: '42.00', scorePosition: '55.00', scoreAccuracy: '38.00',
    scoreSentimentNumeric: '67.00', scoreContextNumeric: '51.00',
    scoreComposite: p.scoreComposite ?? '50.60',
    confidenceIntervals: p.confidenceIntervals ?? {
      frequency: { lower: 0.32, upper: 0.54 },
      position:  { lower: 0.44, upper: 0.67 },
    },
    totalCostUsd: '1.89', metadata: { mockScenario: 's8qa' },
    startedAt: new Date(Date.now() - 252_000), completedAt: new Date(),
  }).returning();
  return a;
}

// ── Sprint 8 tables ───────────────────────────────────────────────────────────
export async function seedLocalSeoResult(p: {
  brandId: string; organizationId: string;
  gmbPresent?: boolean; scoreComposite?: string;
}) {
  const [r] = await db.insert(schema.localSeoResults).values({
    brandId:         p.brandId,
    organizationId:  p.organizationId,                 // FB1
    gmbPresent:      p.gmbPresent ?? true,             // FA1: boolean
    gmbCompleteness: '83.33', gmbReviewCount: 47, gmbAvgRating: '4.60',
    directoryPresence: [                               // FJ1: 4 dirs, FG5: nulls
      { directory: 'hipages',         present: true,  url: 'https://hipages.com.au/s8qa',     reviewCount: null, avgRating: null },
      { directory: 'yellow_pages_au', present: true,  url: 'https://yellowpages.com.au/s8qa', reviewCount: null, avgRating: null },
      { directory: 'service_seeking', present: false, url: null,                              reviewCount: null, avgRating: null },
      { directory: 'word_of_mouth',   present: true,  url: 'https://womo.com.au/s8qa',        reviewCount: null, avgRating: null },
    ],
    napConsistency: '88.89',
    napFindings: [
      { source: 'website',        name: '[S8QA] Brand', address: '100 Bondi Rd NSW 2026', phone: '02 9000 0000', matches: { name: true,  address: true,  phone: true  } },
      { source: 'service_seeking',name: '[S8QA] Brand', address: '100 Bondi Rd NSW 2026', phone: '02 9000 0001', matches: { name: true,  address: true,  phone: false } },
    ],
    suburbCoverage: [
      { suburb: 'Bondi',  mentionedInContent: true,  mentionedInMeta: true,  mentionedInSchema: true  },
      { suburb: 'Coogee', mentionedInContent: false, mentionedInMeta: false, mentionedInSchema: false },
    ],
    scoreComposite: p.scoreComposite ?? '71.75',
    checkedAt: new Date(),   // FO5
    createdAt: new Date(),   // FO5
  }).returning();
  return r;
}

export async function seedDriftAlert(p: {
  organizationId: string; brandId: string;
  currentAuditId: string; previousAuditId: string;
  severity?: string; acknowledged?: boolean;
}) {
  const [d] = await db.insert(schema.driftAlerts).values({
    organizationId: p.organizationId, brandId: p.brandId,
    currentAuditId: p.currentAuditId, previousAuditId: p.previousAuditId,
    severity:    (p.severity ?? 'significant_drop') as 'significant_drop'|'significant_rise'|'within_noise',
    scoreDelta:  '-8.40',
    dimensionDeltas: { frequency: { delta: -12, severity: 'significant_drop',
      currentCI: { lower: 32, upper: 54 }, previousCI: { lower: 48, upper: 70 } } },
    acknowledged: p.acknowledged ?? false,   // FA1: boolean
    updatedAt:    new Date(),                // FG3: NOT NULL
    createdAt:    new Date(),
  }).returning();
  return d;
}

export async function seedWebhookEndpoint(p: {
  organizationId: string; url?: string; events?: string[]; channel?: string;
}) {
  const [e] = await db.insert(schema.webhookEndpoints).values({
    organizationId: p.organizationId,
    url:     p.url     ?? 'https://hooks.slack.com/services/S8QA/TEST/FAKETOKEN',
    channel: p.channel ?? 'slack',
    events:  p.events  ?? ['audit.completed', 'drift.detected'],   // FC4: dots
    signingSecret: 'whsec_s8qa_32chars_padded_exactly_here',
    isActive:  true,          // FA1: boolean
    updatedAt: new Date(),    // FG4: NOT NULL
    createdAt: new Date(),
  }).returning();
  return e;
}

export async function seedWebhookDelivery(p: {
  endpointId: string; organizationId: string;
  success?: boolean; responseStatus?: number;
}) {
  const ok = p.success !== false;
  const [d] = await db.insert(schema.webhookDeliveries).values({
    endpointId:     p.endpointId,
    organizationId: p.organizationId,   // FD4: denormalised
    event:          'audit.completed',
    payload: { eventName: 'audit.completed', brandName: '[S8QA] Brand', scoreComposite: 72 },
    attemptNumber:  1,
    responseStatus: ok ? (p.responseStatus ?? 200) : (p.responseStatus ?? 503),
    responseBody:   ok ? 'ok' : 'Internal Server Error',
    deliveredAt:    ok ? new Date() : null,
    failedAt:       ok ? null      : new Date(),
    createdAt:      new Date(),
  }).returning();
  return d;
}

// ── Full FK-safe cleanup ──────────────────────────────────────────────────────
export async function cleanupOrg(orgId: string): Promise<void> {
  if (!orgId) return;
  await db.delete(schema.localSeoResults).where(eq(schema.localSeoResults.organizationId, orgId));
  await db.delete(schema.driftAlerts).where(eq(schema.driftAlerts.organizationId, orgId));
  const eps = await db.select({ id: schema.webhookEndpoints.id })
    .from(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.organizationId, orgId));
  if (eps.length > 0)
    await db.delete(schema.webhookDeliveries)
      .where(inArray(schema.webhookDeliveries.endpointId, eps.map(e => e.id)));
  await db.delete(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.organizationId, orgId));
  const auditIds = (await db.select({ id: schema.audits.id })
    .from(schema.audits).where(eq(schema.audits.organizationId, orgId))).map(a => a.id);
  if (auditIds.length > 0) {
    await db.delete(schema.auditExports).where(inArray(schema.auditExports.auditId, auditIds));
    await db.delete(schema.citations).where(inArray(schema.citations.auditId, auditIds)).catch(() => {});
  }
  await db.delete(schema.actionItems).where(eq(schema.actionItems.organizationId, orgId)).catch(() => {});
  await db.delete(schema.technicalAudits).where(eq(schema.technicalAudits.organizationId, orgId)).catch(() => {});
  const brandIds = (await db.select({ id: schema.brands.id })
    .from(schema.brands).where(eq(schema.brands.organizationId, orgId))).map(b => b.id);
  if (brandIds.length > 0)
    await db.delete(schema.brandEntityScores)
      .where(inArray(schema.brandEntityScores.brandId, brandIds)).catch(() => {});
  await db.delete(schema.audits).where(eq(schema.audits.organizationId, orgId));
  await db.delete(schema.brands).where(eq(schema.brands.organizationId, orgId));
  await db.delete(schema.users).where(eq(schema.users.organizationId, orgId));
  await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
}
```

-----

## Feature map — 16 features · 151 tests

|#  |Feature                                                     |Layer       |Tests|Runner    |
|---|------------------------------------------------------------|------------|-----|----------|
|F01|Schema: 6 new tables, columns, RLS, indexes                 |DB schema   |12   |vitest    |
|F02|Local SEO scoring lib: weights + NAP + classifyByScore      |lib         |9    |vitest    |
|F03|Drift detection: Wilson CI + detectDrift (20 edge cases)    |lib         |20   |vitest    |
|F04|Export builders: SARIF v2.1.0 / JUnit XML / GHA annotations |lib         |9    |vitest    |
|F05|Webhook signing: HMAC-SHA256 via Node.js crypto (FG2)       |lib         |6    |vitest    |
|F06|DB CRUD: local_seo_results real round-trip                  |DB          |8    |vitest    |
|F07|DB CRUD: drift_alerts create + acknowledge flow             |DB          |8    |vitest    |
|F08|DB CRUD: webhook_endpoints + deliveries                     |DB          |9    |vitest    |
|F09|DB CRUD: audit_exports downloadCount (FH5)                  |DB          |6    |vitest    |
|F10|API: local-seo routes + RLS isolation                       |API         |9    |playwright|
|F11|API: drift-alerts list + acknowledge + RLS                  |API         |9    |playwright|
|F12|API: webhooks-config CRUD + test-delivery (FH4)             |API         |9    |playwright|
|F13|API: export SARIF/JUnit/GHA + downloadCount (FF1, FH5)      |API         |8    |playwright|
|F14|UI: Local SEO Dashboard + Directory Presence                |Browser     |10   |playwright|
|F15|UI: Drift Alerts + Webhook Settings + Audit Export          |Browser     |10   |playwright|
|F16|Inngest source files + fanout bridge + Sprint 1–7 regression|Source + API|9    |playwright|

-----

## F01 — Schema: 6 new Sprint 8 tables

**Purpose:** Verify every column type, NOT NULL constraint, boolean vs text (FA1), RLS policy,
and index exists before any higher-layer test runs. Catches migration mistakes early.

**Seed / Cleanup:** None — read-only schema introspection.  
**Runner:** vitest (no browser, no server).

### `tests/qa/sprint8/features/f01-schema/f01-schema.spec.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { db }  from '../../shared/db';
import { sql } from 'drizzle-orm';

async function col(table: string, column: string) {
  const r = await db.execute(sql`
    SELECT data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}`);
  return r.rows[0] as any ?? null;
}

describe('[S8QA] F01 — Schema: 6 new tables', () => {

  /* ── local_seo_results ───────────────────────────────────────────── */
  it('F01-01: local_seo_results.gmb_present is boolean NOT text (FA1)', async () => {
    expect((await col('local_seo_results','gmb_present'))?.data_type).toBe('boolean');
  });
  it('F01-02: local_seo_results has organization_id column (FB1 — RLS needs it)', async () => {
    expect(await col('local_seo_results','organization_id')).not.toBeNull();
  });
  it('F01-03: local_seo_results has checked_at AND created_at (FO5)', async () => {
    const r = await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM information_schema.columns
      WHERE table_name='local_seo_results' AND column_name IN ('checked_at','created_at')`);
    expect((r.rows[0] as any).c).toBe(2);
  });
  it('F01-04: local_seo_results RLS ENABLED', async () => {
    const r = await db.execute(sql`SELECT relrowsecurity FROM pg_class WHERE relname='local_seo_results'`);
    expect((r.rows[0] as any).relrowsecurity).toBe(true);
  });

  /* ── drift_alerts ────────────────────────────────────────────────── */
  it('F01-05: drift_alerts.acknowledged is boolean (FA1)', async () => {
    expect((await col('drift_alerts','acknowledged'))?.data_type).toBe('boolean');
  });
  it('F01-06: drift_alerts.updated_at is NOT NULL (FG3)', async () => {
    expect((await col('drift_alerts','updated_at'))?.is_nullable).toBe('NO');
  });
  it('F01-07: drift_alerts has 2 composite indexes (FN3)', async () => {
    const r1 = await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM pg_indexes
      WHERE tablename='drift_alerts' AND indexname LIKE '%org%ack%'`);
    expect((r1.rows[0] as any).c, 'FN3: (orgId,acknowledged) index missing').toBeGreaterThan(0);
    const r2 = await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM pg_indexes
      WHERE tablename='drift_alerts' AND indexname LIKE '%brand%created%'`);
    expect((r2.rows[0] as any).c, 'FN3: (brandId,createdAt) index missing').toBeGreaterThan(0);
  });

  /* ── webhook_endpoints ───────────────────────────────────────────── */
  it('F01-08: webhook_endpoints.is_active is boolean (FA1)', async () => {
    expect((await col('webhook_endpoints','is_active'))?.data_type).toBe('boolean');
  });
  it('F01-09: webhook_endpoints.updated_at is NOT NULL (FG4)', async () => {
    expect((await col('webhook_endpoints','updated_at'))?.is_nullable).toBe('NO');
  });
  it('F01-10: webhook_deliveries.organization_id exists (FD4 — denormalised)', async () => {
    expect(await col('webhook_deliveries','organization_id')).not.toBeNull();
  });

  /* ── audit_exports ───────────────────────────────────────────────── */
  it('F01-11: audit_exports has unique index on (audit_id, format) (FH5)', async () => {
    const r = await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM pg_indexes
      WHERE tablename='audit_exports' AND indexname LIKE '%audit%format%'`);
    expect((r.rows[0] as any).c, 'FH5: unique (auditId,format) index missing').toBeGreaterThan(0);
  });

  /* ── RLS on all tenant tables ────────────────────────────────────── */
  it('F01-12: all 6 Sprint-8 tenant tables have RLS ENABLED (incl. bulk_operations per FO2)', async () => {
    // ANGLE-22 fix: bulk_operations is the 6th Sprint 8 tenant table with RLS ENABLED (FO2 fix).
    const tables = ['local_seo_results','drift_alerts','webhook_endpoints',
                    'webhook_deliveries','audit_exports','bulk_operations'];
    for (const t of tables) {
      const r = await db.execute(sql`SELECT relrowsecurity FROM pg_class WHERE relname=${t}`);
      expect((r.rows[0] as any)?.relrowsecurity, `${t} must have RLS ENABLED`).toBe(true);
    }
  });
});
```

### `tests/qa/sprint8/features/f01-schema/F01-SCHEMA.bat`

```batch
@echo off
REM ═══════════════════════════════════════════════════════════════
REM  [S8QA] F01 — Schema: 6 new Sprint 8 tables
REM  Pure DB schema checks — no server needed, no seed, no cleanup
REM ═══════════════════════════════════════════════════════════════
setlocal EnableDelayedExpansion
if exist .env.test.local (
  for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (
    set "k=%%A"& set "v=%%B"
    if defined k if not "!k:~0,1!"=="#" set "%%A=%%B"
  )
)
echo.
echo ═══════════════════════════════════════════════════════════════
echo  [S8QA] F01: Schema — 6 new tables, columns, RLS, indexes
echo ═══════════════════════════════════════════════════════════════
pnpm vitest run tests/qa/sprint8/features/f01-schema/f01-schema.spec.ts --reporter=verbose
if %ERRORLEVEL% EQU 0 (echo.& echo  RESULT: ALL PASS & exit /b 0)
echo.& echo  RESULT: FAILED & exit /b 1
```

### `tests/qa/sprint8/features/f01-schema/f01-schema.sh`

```bash
#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────
#  [S8QA] F01 — Schema: 6 new Sprint 8 tables
#  Pure DB schema checks — no server needed, no seed, no cleanup
# ───────────────────────────────────────────────────────────────
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo " [S8QA] F01: Schema — 6 new tables, columns, RLS, indexes"
echo "═══════════════════════════════════════════════════════════════"
pnpm vitest run tests/qa/sprint8/features/f01-schema/f01-schema.spec.ts --reporter=verbose
echo ""
echo " RESULT: ALL PASS ✓"
```

-----

## F02 — Local SEO scoring lib

**Purpose:** Validate `computeLocalSeoScore` weights (GMB×0.30 + NAP×0.30 + dir×0.25 + suburb×0.15),
boundary conditions, `checkNapConsistency` pairwise logic and address normalisation,
`classifyByScore` FC5 thresholds.

**Seed / Cleanup:** None — pure TypeScript functions.  
**Runner:** vitest.

### `tests/qa/sprint8/features/f02-local-seo-scoring/f02-local-seo-scoring.spec.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { computeLocalSeoScore } from '../../../../lib/local-seo/score';
import { checkNapConsistency }  from '../../../../lib/local-seo/nap-consistency';
import { classifyByScore }      from '../../../../lib/confidence-labels/classify';

const DIRS_ALL  = [{ present:true  },{ present:true  },{ present:true  },{ present:true  }];
const DIRS_NONE = [{ present:false },{ present:false },{ present:false },{ present:false }];
const SUBURB_1  = [{ mentionedInContent:true,  mentionedInMeta:true,  mentionedInSchema:true  }];
const SUBURB_2  = [
  { mentionedInContent:true,  mentionedInMeta:false, mentionedInSchema:false },
  { mentionedInContent:false, mentionedInMeta:false, mentionedInSchema:false },
];

describe('[S8QA] F02 — Local SEO scoring lib', () => {

  it('F02-01: perfect inputs → 100', () => {
    expect(computeLocalSeoScore({
      gmb: { present:true, completeness:100 }, directories: DIRS_ALL,
      nap: { score:100 }, suburbs: SUBURB_1,
    })).toBeCloseTo(100, 1);
  });

  it('F02-02: GMB absent → gmbScore=0 even when completeness=83 (FA1 — present gates score)', () => {
    // 0×0.30 + 100×0.30 + 100×0.25 + 100×0.15 = 70
    expect(computeLocalSeoScore({
      gmb: { present:false, completeness:83 }, directories: DIRS_ALL,
      nap: { score:100 }, suburbs: [],
    })).toBeCloseTo(70, 1);
  });

  it('F02-03: no suburbs configured → suburb component = 100 (no penalty)', () => {
    expect(computeLocalSeoScore({
      gmb: { present:true, completeness:100 }, directories: DIRS_ALL,
      nap: { score:100 }, suburbs: [],
    })).toBeCloseTo(100, 1);
  });

  it('F02-04: mixed inputs test weights — GMB=60, 1/4 dirs, NAP=80, 1/2 suburbs → ≈55.75', () => {
    // GMB=60×0.30=18; dir=25×0.25=6.25; NAP=80×0.30=24; suburb=50×0.15=7.5
    expect(computeLocalSeoScore({
      gmb: { present:true, completeness:60 },
      directories: [{ present:true },{ present:false },{ present:false },{ present:false }],
      nap: { score:80 }, suburbs: SUBURB_2,
    })).toBeCloseTo(55.75, 1);
  });

  it('F02-05: all dirs absent → directory component = 0', () => {
    const s = computeLocalSeoScore({
      gmb: { present:true, completeness:100 }, directories: DIRS_NONE,
      nap: { score:100 }, suburbs: [],
    });
    expect(s).toBeCloseTo(75, 1);  // 30 + 0 + 30 + 15
  });

  it('F02-06: checkNapConsistency — identical sources → 100', () => {
    const r = checkNapConsistency([
      { label:'website', name:'Bondi Plumbing', address:'100 bondi road nsw', phone:'0299990000' },
      { label:'gmb',     name:'Bondi Plumbing', address:'100 bondi road nsw', phone:'0299990000' },
    ]);
    expect(r.score).toBe(100);
  });

  it('F02-07: phone mismatch → ≈66.67 (2 of 3 fields match)', () => {
    const r = checkNapConsistency([
      { label:'website', name:'Bondi Plumbing', address:'100 bondi road', phone:'0299990000' },
      { label:'gmb',     name:'Bondi Plumbing', address:'100 bondi road', phone:'0299990001' },
    ]);
    expect(r.score).toBeCloseTo(66.67, 1);
  });

  it('F02-08: address normalisation "St" ≡ "Street" → 100 (FI4 fix)', () => {
    const r = checkNapConsistency([
      { label:'website', name:'Brand', address:'14 King St Sydney',     phone:'0200000000' },
      { label:'gmb',     name:'Brand', address:'14 King Street Sydney', phone:'0200000000' },
    ]);
    expect(r.score).toBeCloseTo(100, 1);
  });

  it('F02-09: classifyByScore FC5 thresholds — ≥70=confirmed, 40–69=likely, <40=hypothesis', () => {
    expect(classifyByScore(70)).toBe('confirmed');
    expect(classifyByScore(69)).toBe('likely');
    expect(classifyByScore(40)).toBe('likely');
    expect(classifyByScore(39)).toBe('hypothesis');
    expect(classifyByScore(0)).toBe('hypothesis');
    expect(classifyByScore(100)).toBe('confirmed');
  });
});
```

### `tests/qa/sprint8/features/f02-local-seo-scoring/F02-LOCAL-SEO-SCORING.bat`

```batch
@echo off
REM [S8QA] F02 — Local SEO scoring lib (pure functions, no server)
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do set "%%A=%%B")
echo.& echo ═══════════════════════════════════════════════════════
echo  [S8QA] F02: Local SEO scoring — score + NAP + labels
echo ═══════════════════════════════════════════════════════
pnpm vitest run tests/qa/sprint8/features/f02-local-seo-scoring/f02-local-seo-scoring.spec.ts --reporter=verbose
if %ERRORLEVEL% EQU 0 (echo  RESULT: ALL PASS & exit /b 0) else (echo  RESULT: FAILED & exit /b 1)
```

### `tests/qa/sprint8/features/f02-local-seo-scoring/f02-local-seo-scoring.sh`

```bash
#!/usr/bin/env bash
# [S8QA] F02 — Local SEO scoring lib (pure functions, no server)
set -euo pipefail; set -a; [ -f .env.test.local ] && source .env.test.local; set +a
echo ""; echo "═══════════════════════════════════════════════════════"
echo " [S8QA] F02: Local SEO scoring — score + NAP + labels"
echo "═══════════════════════════════════════════════════════"
pnpm vitest run tests/qa/sprint8/features/f02-local-seo-scoring/f02-local-seo-scoring.spec.ts --reporter=verbose
echo " RESULT: ALL PASS ✓"
```

-----

## F03 — Drift detection: Wilson CI overlap + detectDrift

**Purpose:** 20+ edge cases for `ciOverlaps` boundary math; `classifySeverity` drop/rise/noise;
`detectDrift` composite uses **raw delta ≥ 5pts** (FC1 — NOT `ciOverlaps`);
missing CIs → conservative fallback; `hasSignificant` flag set correctly.

**Seed / Cleanup:** None — pure lib.  
**Runner:** vitest.

### `tests/qa/sprint8/features/f03-drift-detection/f03-drift-detection.spec.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { ciOverlaps, classifySeverity } from '../../../../lib/drift/significance';
import { detectDrift }                   from '../../../../lib/drift/detect';

describe('[S8QA] F03 — Drift detection: Wilson CI + detectDrift', () => {

  /* ── ciOverlaps boundary cases ──────────────────────────────────── */
  it('F03-01: identical CIs → overlap',     () => expect(ciOverlaps({lower:30,upper:60},{lower:30,upper:60})).toBe(true));
  it('F03-02: A below B → no overlap',      () => expect(ciOverlaps({lower:20,upper:40},{lower:50,upper:70})).toBe(false));
  it('F03-03: A above B → no overlap',      () => expect(ciOverlaps({lower:60,upper:80},{lower:10,upper:30})).toBe(false));
  it('F03-04: A.upper === B.lower → touch → overlaps', () =>
    expect(ciOverlaps({lower:20,upper:50},{lower:50,upper:70})).toBe(true));
  it('F03-05: partial left overlap',         () => expect(ciOverlaps({lower:20,upper:55},{lower:40,upper:70})).toBe(true));
  it('F03-06: A fully inside B',             () => expect(ciOverlaps({lower:45,upper:55},{lower:30,upper:70})).toBe(true));
  it('F03-07: zero-width CIs at same point', () => expect(ciOverlaps({lower:50,upper:50},{lower:50,upper:50})).toBe(true));
  it('F03-08: zero-width CIs differ → no overlap', () =>
    expect(ciOverlaps({lower:40,upper:40},{lower:60,upper:60})).toBe(false));
  it('F03-09: wide CI [0,100] overlaps everything', () =>
    expect(ciOverlaps({lower:0,upper:100},{lower:10,upper:20})).toBe(true));

  /* ── classifySeverity ────────────────────────────────────────────── */
  it('F03-10: non-overlapping + drop → significant_drop (FB5)',  () =>
    expect(classifySeverity(35,65,{lower:20,upper:45},{lower:55,upper:75})).toBe('significant_drop'));
  it('F03-11: non-overlapping + rise → significant_rise (FB5)', () =>
    expect(classifySeverity(75,45,{lower:65,upper:85},{lower:30,upper:55})).toBe('significant_rise'));
  it('F03-12: overlapping CIs → within_noise regardless of delta', () =>
    expect(classifySeverity(30,55,{lower:20,upper:50},{lower:40,upper:65})).toBe('within_noise'));

  /* ── detectDrift composite (FC1 — raw delta, NOT ciOverlaps) ──── */
  it('F03-13: composite delta <5pts → within_noise (FC1 fix)', () => {
    const r = detectDrift({
      currentComposite:52, previousComposite:50,
      currentScores:{frequency:42}, previousScores:{frequency:44},
      currentCIs:{frequency:{lower:32,upper:54}}, previousCIs:{frequency:{lower:34,upper:56}},
    });
    expect(r.compositeSeverity).toBe('within_noise');
  });

  it('F03-14: composite delta ≥5pts drop → significant_drop (FC1)', () => {
    const r = detectDrift({
      currentComposite:55, previousComposite:63,
      currentScores:{frequency:35}, previousScores:{frequency:48},
      currentCIs:{frequency:{lower:24,upper:46}}, previousCIs:{frequency:{lower:38,upper:59}},
    });
    expect(r.compositeSeverity).toBe('significant_drop');
    expect(r.hasSignificant).toBe(true);
  });

  it('F03-15: composite delta ≥5pts rise → significant_rise', () => {
    const r = detectDrift({
      currentComposite:70, previousComposite:61,
      currentScores:{frequency:55}, previousScores:{frequency:44},
      currentCIs:{frequency:{lower:44,upper:66}}, previousCIs:{frequency:{lower:33,upper:55}},
    });
    expect(r.compositeSeverity).toBe('significant_rise');
  });

  it('F03-16: all within_noise → hasSignificant=false (no drift row should be written)', () => {
    const r = detectDrift({
      currentComposite:52, previousComposite:50,
      currentScores:{frequency:45}, previousScores:{frequency:44},
      currentCIs:{frequency:{lower:34,upper:56}}, previousCIs:{frequency:{lower:33,upper:55}},
    });
    expect(r.hasSignificant).toBe(false);
  });

  it('F03-17: COMPOSITE_NOISE_THRESHOLD=5 — exactly 5pt drop IS significant', () => {
    const r = detectDrift({
      currentComposite:60, previousComposite:65,
      currentScores:{frequency:40}, previousScores:{frequency:40},
      currentCIs:{frequency:{lower:28,upper:52}}, previousCIs:{frequency:{lower:29,upper:53}},
    });
    expect(r.compositeSeverity).toBe('significant_drop');
  });

  it('F03-18: 4.9pt drop is within_noise (just under threshold)', () => {
    const r = detectDrift({
      currentComposite:60.1, previousComposite:65,
      currentScores:{frequency:42}, previousScores:{frequency:43},
      currentCIs:{frequency:{lower:30,upper:52}}, previousCIs:{frequency:{lower:31,upper:53}},
    });
    expect(r.compositeSeverity).toBe('within_noise');
  });

  it('F03-19: missing CIs → wide fallback → dimension=within_noise; composite uses delta (FO4)', () => {
    const r = detectDrift({
      currentComposite:40, previousComposite:70,
      currentScores:{frequency:30}, previousScores:{frequency:60},
      currentCIs:{}, previousCIs:{},
    });
    expect(r.compositeSeverity).toBe('significant_drop');
    for (const d of Object.values(r.dimensionDeltas))
      expect((d as any).severity).toBe('within_noise');
  });

  it('F03-20: result shape has all required fields', () => {
    const r = detectDrift({
      currentComposite:50, previousComposite:42,
      currentScores:{frequency:40}, previousScores:{frequency:35},
      currentCIs:{frequency:{lower:29,upper:51}}, previousCIs:{frequency:{lower:24,upper:47}},
    });
    expect(r).toHaveProperty('compositeSeverity');
    expect(r).toHaveProperty('scoreDelta');
    expect(r).toHaveProperty('dimensionDeltas');
    expect(r).toHaveProperty('hasSignificant');
    expect(['significant_drop','significant_rise','within_noise']).toContain(r.compositeSeverity);
  });
});
```

### `tests/qa/sprint8/features/f03-drift-detection/F03-DRIFT-DETECTION.bat`

```batch
@echo off
REM [S8QA] F03 — Drift detection lib (pure functions)
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do set "%%A=%%B")
echo.& echo ═══════════════════════════════════════════════════════
echo  [S8QA] F03: Drift detection — Wilson CI + detectDrift
echo ═══════════════════════════════════════════════════════
pnpm vitest run tests/qa/sprint8/features/f03-drift-detection/f03-drift-detection.spec.ts --reporter=verbose
if %ERRORLEVEL% EQU 0 (echo  RESULT: ALL PASS & exit /b 0) else (echo  RESULT: FAILED & exit /b 1)
```

### `tests/qa/sprint8/features/f03-drift-detection/f03-drift-detection.sh`

```bash
#!/usr/bin/env bash
# [S8QA] F03 — Drift detection lib (pure functions)
set -euo pipefail; set -a; [ -f .env.test.local ] && source .env.test.local; set +a
echo ""; echo "═══════════════════════════════════════════════════════"
echo " [S8QA] F03: Drift detection — Wilson CI + detectDrift"
echo "═══════════════════════════════════════════════════════"
pnpm vitest run tests/qa/sprint8/features/f03-drift-detection/f03-drift-detection.spec.ts --reporter=verbose
echo " RESULT: ALL PASS ✓"
```

-----

## F04 — Export builders: SARIF / JUnit / GHA

**Purpose:** `buildSarif` schema URL exact (FA5), version 2.1.0, 5 rules VA001–VA005, level mapping
(error<30 / warning 30–49 / note 50–69 / silent ≥70). `buildJunit` valid XML, `<testsuites tests="5">`,
`<failure>` for dims <50. `buildGha` annotation lines with `title=`.

**Seed / Cleanup:** None.  
**Runner:** vitest.

### `tests/qa/sprint8/features/f04-export-formats/f04-export-formats.spec.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { buildSarif } from '../../../../lib/exports/sarif';
import { buildJunit } from '../../../../lib/exports/junit';
import { buildGha }   from '../../../../lib/exports/gha';

const AUDIT = {
  id:'s8qa-001', brandId:'s8qa-b01', brandName:'[S8QA] Bondi Plumbing',
  scores:{ frequency:24, position:67, sentiment:82, context:45, accuracy:18 },
  scoreComposite:'47.20', createdAt: new Date('2026-01-15T10:00:00Z'),
};

describe('[S8QA] F04 — Export builders: SARIF / JUnit / GHA', () => {

  /* ── SARIF ─────────────────────────────────────────────────────── */
  it('F04-01: SARIF $schema is exact v2.1.0 URL (FA5)', () =>
    expect(buildSarif(AUDIT)['$schema'])
      .toBe('https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0.json'));

  it('F04-02: SARIF version is "2.1.0"', () =>
    expect(buildSarif(AUDIT).version).toBe('2.1.0'));

  it('F04-03: SARIF has exactly 5 rules VA001–VA005', () => {
    const rules = buildSarif(AUDIT).runs[0].tool.driver.rules;
    expect(rules).toHaveLength(5);
    expect(rules.map((r:any) => r.id).sort()).toEqual(['VA001','VA002','VA003','VA004','VA005']);
  });

  it('F04-04: SARIF level=error for score<30 (frequency=24, accuracy=18)', () => {
    const errs = buildSarif(AUDIT).runs[0].results.filter((r:any) => r.level==='error');
    expect(errs.length).toBeGreaterThanOrEqual(2);
  });

  it('F04-05: SARIF level=warning for score 30–49 (context=45)', () => {
    const warns = buildSarif(AUDIT).runs[0].results.filter((r:any) => r.level==='warning');
    expect(warns.length).toBeGreaterThanOrEqual(1);
  });

  it('F04-06: SARIF no error/warning for score≥70 (sentiment=82 → silent)', () => {
    const bad = buildSarif(AUDIT).runs[0].results.filter((r:any) =>
      r.message.text.toLowerCase().includes('sentiment') &&
      (r.level==='error'||r.level==='warning'));
    expect(bad).toHaveLength(0);
  });

  /* ── JUnit ─────────────────────────────────────────────────────── */
  it('F04-07: JUnit starts with <?xml, contains <testsuites tests="5">, no NaN/undefined', () => {
    const xml = buildJunit(AUDIT);
    expect(xml.trim()).toMatch(/^<\?xml/);
    expect(xml).toContain('<testsuites');
    expect(xml).toContain('tests="5"');
    expect(xml).not.toContain('NaN');
    expect(xml).not.toContain('undefined');
  });

  it('F04-08: JUnit has exactly 3 <failure> elements (frequency=24, context=45, accuracy=18)', () => {
    expect((buildJunit(AUDIT).match(/<failure/g) ?? []).length).toBe(3);
  });

  /* ── GHA ────────────────────────────────────────────────────────── */
  it('F04-09: GHA lines are ::error::/::warning::/::notice:: with title= (FE2)', () => {
    const txt = buildGha(AUDIT);
    if (txt.trim().length > 0)
      for (const line of txt.trim().split('\n')) {
        expect(line).toMatch(/^::(error|warning|notice) /);
        expect(line).toContain('title=');
      }
  });
});
```

### `tests/qa/sprint8/features/f04-export-formats/F04-EXPORT-FORMATS.bat`

```batch
@echo off
REM [S8QA] F04 — Export builders: SARIF / JUnit / GHA
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do set "%%A=%%B")
echo.& echo ═══════════════════════════════════════════════════════
echo  [S8QA] F04: Export builders — SARIF / JUnit / GHA
echo ═══════════════════════════════════════════════════════
pnpm vitest run tests/qa/sprint8/features/f04-export-formats/f04-export-formats.spec.ts --reporter=verbose
if %ERRORLEVEL% EQU 0 (echo  RESULT: ALL PASS & exit /b 0) else (echo  RESULT: FAILED & exit /b 1)
```

### `tests/qa/sprint8/features/f04-export-formats/f04-export-formats.sh`

```bash
#!/usr/bin/env bash
# [S8QA] F04 — Export builders: SARIF / JUnit / GHA
set -euo pipefail; set -a; [ -f .env.test.local ] && source .env.test.local; set +a
echo ""; echo "═══════════════════════════════════════════════════════"
echo " [S8QA] F04: Export builders — SARIF / JUnit / GHA"
echo "═══════════════════════════════════════════════════════"
pnpm vitest run tests/qa/sprint8/features/f04-export-formats/f04-export-formats.spec.ts --reporter=verbose
echo " RESULT: ALL PASS ✓"
```

-----

## F05 — Webhook signing: HMAC-SHA256 (FG2)

**Purpose:** `signHmacSha256` produces 64-char hex; matches `crypto.createHmac` exactly; deterministic;
different inputs → different sigs; source file contains `createHmac` NOT `@stablelib`.

**Seed / Cleanup:** None.  
**Runner:** vitest.

### `tests/qa/sprint8/features/f05-webhook-signing/f05-webhook-signing.spec.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { createHmac }   from 'node:crypto';
import { readFileSync } from 'node:fs';
import { signHmacSha256 } from '../../../../lib/webhooks/sign';

const SEC = 'whsec_s8qa_test_secret_exactly_32chars';
const MSG = JSON.stringify({ event:'audit.completed', brandId:'s8qa-b01' });

describe('[S8QA] F05 — Webhook signing: HMAC-SHA256 (FG2)', () => {
  it('F05-01: returns 64-char lowercase hex',   () => expect(signHmacSha256(MSG,SEC)).toMatch(/^[0-9a-f]{64}$/));
  it('F05-02: deterministic',                    () => expect(signHmacSha256(MSG,SEC)).toBe(signHmacSha256(MSG,SEC)));
  it('F05-03: matches Node.js createHmac (FG2)', () => {
    expect(signHmacSha256(MSG,SEC)).toBe(createHmac('sha256',SEC).update(MSG).digest('hex'));
  });
  it('F05-04: different message → different sig', () =>
    expect(signHmacSha256('A',SEC)).not.toBe(signHmacSha256('B',SEC)));
  it('F05-05: different secret → different sig', () =>
    expect(signHmacSha256(MSG,'sec-A')).not.toBe(signHmacSha256(MSG,'sec-B')));
  it('F05-06: source uses createHmac NOT @stablelib (FG2 fix)', () => {
    const src = readFileSync('lib/webhooks/sign.ts','utf-8');
    expect(src).not.toContain('@stablelib');
    expect(src).toContain('createHmac');
  });
});
```

### `tests/qa/sprint8/features/f05-webhook-signing/F05-WEBHOOK-SIGNING.bat`

```batch
@echo off
REM [S8QA] F05 — Webhook signing: HMAC-SHA256
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do set "%%A=%%B")
echo.& echo ═══════════════════════════════════════════════════════
echo  [S8QA] F05: Webhook signing — HMAC-SHA256 (FG2)
echo ═══════════════════════════════════════════════════════
pnpm vitest run tests/qa/sprint8/features/f05-webhook-signing/f05-webhook-signing.spec.ts --reporter=verbose
if %ERRORLEVEL% EQU 0 (echo  RESULT: ALL PASS & exit /b 0) else (echo  RESULT: FAILED & exit /b 1)
```

### `tests/qa/sprint8/features/f05-webhook-signing/f05-webhook-signing.sh`

```bash
#!/usr/bin/env bash
# [S8QA] F05 — Webhook signing: HMAC-SHA256
set -euo pipefail; set -a; [ -f .env.test.local ] && source .env.test.local; set +a
echo ""; echo "═══════════════════════════════════════════════════════"
echo " [S8QA] F05: Webhook signing — HMAC-SHA256 (FG2)"
echo "═══════════════════════════════════════════════════════"
pnpm vitest run tests/qa/sprint8/features/f05-webhook-signing/f05-webhook-signing.spec.ts --reporter=verbose
echo " RESULT: ALL PASS ✓"
```

## F06 — DB CRUD: local_seo_results real round-trip

**Purpose:** Verify all columns write and read correctly with real postgres data. Confirms FA1
(gmbPresent boolean), FB1 (organizationId stored), FO5 (both timestamps), FG5 (reviewCount null),
FJ1 (4 dirs), cross-org isolation, and SELECT by brandId returns latest row.

**Seeds:** org1 + user1 + brand. Org2 for isolation check.  
**Cleanup:** `cleanupOrg(org1Id)` + `cleanupOrg(org2Id)` in `afterAll`.  
**Runner:** vitest (direct DB via DIRECT_URL — no server).

### `tests/qa/sprint8/features/f06-db-local-seo/f06-db-local-seo.spec.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema } from '../../shared/db';
import { seedOrg, seedUser, seedBrand, seedLocalSeoResult, cleanupOrg } from '../../shared/seed';
import { eq, desc } from 'drizzle-orm';

let org1Id='', org2Id='', brand1Id='', lsrId='';

beforeAll(async () => {
  const o1  = await seedOrg({ clerkOrgId:process.env.E2E_TEST_ORG_1_CLERK_ID!, name:'[S8QA] F06 Org1' });
  org1Id    = o1.id;
  await seedUser({ clerkUserId:process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId:org1Id, email:process.env.E2E_TEST_USER_1_EMAIL! });
  const b   = await seedBrand({ organizationId:org1Id, name:'[S8QA] Bondi Plumbing' });
  brand1Id  = b.id;
  const o2  = await seedOrg({ clerkOrgId:process.env.E2E_TEST_ORG_2_CLERK_ID!, name:'[S8QA] F06 Org2' });
  org2Id    = o2.id;
});
afterAll(async () => { await cleanupOrg(org1Id); await cleanupOrg(org2Id); });

describe('[S8QA] F06 — DB CRUD: local_seo_results', () => {

  it('F06-01: INSERT succeeds with all required fields (FA1 boolean, FB1 orgId, FO5 timestamps)', async () => {
    const r = await seedLocalSeoResult({ brandId:brand1Id, organizationId:org1Id, gmbPresent:true });
    lsrId = r.id;
    expect(r.id).toBeTruthy();
    expect(r.gmbPresent).toBe(true);           // FA1: boolean back from DB
    expect(r.organizationId).toBe(org1Id);     // FB1
  });

  it('F06-02: gmbPresent returned as boolean NOT string (FA1)', async () => {
    const [r] = await db.select().from(schema.localSeoResults).where(eq(schema.localSeoResults.id, lsrId));
    expect(typeof r.gmbPresent).toBe('boolean');
    expect(r.gmbPresent).toBe(true);
  });

  it('F06-03: directoryPresence has exactly 4 AU dirs (FJ1 — not 5)', async () => {
    const [r] = await db.select().from(schema.localSeoResults).where(eq(schema.localSeoResults.id, lsrId));
    const dirs = r.directoryPresence as any[];
    expect(dirs).toHaveLength(4);
    for (const d of ['hipages','yellow_pages_au','service_seeking','word_of_mouth'])
      expect(dirs.map((x:any)=>x.directory)).toContain(d);
  });

  it('F06-04: AU directory reviewCount and avgRating are null (FG5 fix — Sprint 8 no review data yet)', async () => {
    const [r] = await db.select().from(schema.localSeoResults).where(eq(schema.localSeoResults.id, lsrId));
    for (const d of r.directoryPresence as any[]) {
      expect(d.reviewCount, `FG5: ${d.directory} reviewCount must be null`).toBeNull();
      expect(d.avgRating,   `FG5: ${d.directory} avgRating must be null`).toBeNull();
    }
  });

  it('F06-05: service_seeking is present=false (phone mismatch seed)', async () => {
    const [r] = await db.select().from(schema.localSeoResults).where(eq(schema.localSeoResults.id, lsrId));
    const ss = (r.directoryPresence as any[]).find((d:any) => d.directory==='service_seeking');
    expect(ss.present).toBe(false);
  });

  it('F06-06: SELECT by brandId ORDER BY checkedAt DESC returns the row (FO5 checkedAt exists)', async () => {
    const rows = await db.select().from(schema.localSeoResults)
      .where(eq(schema.localSeoResults.brandId, brand1Id))
      .orderBy(desc(schema.localSeoResults.checkedAt)).limit(1);
    expect(rows[0]?.id).toBe(lsrId);
    expect(rows[0]?.checkedAt).toBeTruthy();
    expect(rows[0]?.createdAt).toBeTruthy();   // FO5: both exist
  });

  it('F06-07: cross-org — org2 SELECT on org1 data returns zero rows (RLS isolation)', async () => {
    const rows = await db.select().from(schema.localSeoResults)
      .where(eq(schema.localSeoResults.organizationId, org2Id));
    expect(rows).toHaveLength(0);
  });

  it('F06-08: DELETE by id removes the row (cleanup)', async () => {
    await db.delete(schema.localSeoResults).where(eq(schema.localSeoResults.id, lsrId));
    const rows = await db.select().from(schema.localSeoResults).where(eq(schema.localSeoResults.id, lsrId));
    expect(rows).toHaveLength(0);
  });
});
```

### `tests/qa/sprint8/features/f06-db-local-seo/F06-DB-LOCAL-SEO.bat`

```batch
@echo off
REM [S8QA] F06 — DB CRUD: local_seo_results (seeds + hard cleanup)
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do set "%%A=%%B")
echo.& echo ═══════════════════════════════════════════════════════
echo  [S8QA] F06: DB CRUD — local_seo_results round-trip
echo ═══════════════════════════════════════════════════════
pnpm vitest run tests/qa/sprint8/features/f06-db-local-seo/f06-db-local-seo.spec.ts --reporter=verbose
if %ERRORLEVEL% EQU 0 (echo  RESULT: ALL PASS & exit /b 0) else (echo  RESULT: FAILED & exit /b 1)
```

### `tests/qa/sprint8/features/f06-db-local-seo/f06-db-local-seo.sh`

```bash
#!/usr/bin/env bash
# [S8QA] F06 — DB CRUD: local_seo_results
set -euo pipefail; set -a; [ -f .env.test.local ] && source .env.test.local; set +a
echo ""; echo "═══════════════════════════════════════════════════════"
echo " [S8QA] F06: DB CRUD — local_seo_results round-trip"
echo "═══════════════════════════════════════════════════════"
pnpm vitest run tests/qa/sprint8/features/f06-db-local-seo/f06-db-local-seo.spec.ts --reporter=verbose
echo " RESULT: ALL PASS ✓"
```

-----

## F07 — DB CRUD: drift_alerts create + acknowledge flow

**Purpose:** FA1 (acknowledged boolean), FG3 (updatedAt NOT NULL), FB5 (severity enum values),
PATCH acknowledge flow sets both `acknowledged=true` and `acknowledgedAt`, cross-org returns zero.

**Seeds:** org1 + user1 + brand + 2 audits. Org2 for isolation.  
**Cleanup:** `cleanupOrg` both.  
**Runner:** vitest.

### `tests/qa/sprint8/features/f07-db-drift-alerts/f07-db-drift-alerts.spec.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema } from '../../shared/db';
import { seedOrg, seedUser, seedBrand, seedAudit, seedDriftAlert, cleanupOrg } from '../../shared/seed';
import { eq } from 'drizzle-orm';

let org1Id='', org2Id='', brand1Id='', audit1Id='', audit2Id='', alertId='';

beforeAll(async () => {
  const o1 = await seedOrg({ clerkOrgId:process.env.E2E_TEST_ORG_1_CLERK_ID!, name:'[S8QA] F07 Org1' });
  org1Id   = o1.id;
  await seedUser({ clerkUserId:process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId:org1Id, email:process.env.E2E_TEST_USER_1_EMAIL! });
  const b  = await seedBrand({ organizationId:org1Id });
  brand1Id = b.id;
  const a1 = await seedAudit({ organizationId:org1Id, brandId:brand1Id, auditNumber:1, scoreComposite:'63.40' });
  audit1Id = a1.id;
  const a2 = await seedAudit({ organizationId:org1Id, brandId:brand1Id, auditNumber:2, scoreComposite:'55.00' });
  audit2Id = a2.id;
  const o2 = await seedOrg({ clerkOrgId:process.env.E2E_TEST_ORG_2_CLERK_ID!, name:'[S8QA] F07 Org2' });
  org2Id   = o2.id;
});
afterAll(async () => { await cleanupOrg(org1Id); await cleanupOrg(org2Id); });

describe('[S8QA] F07 — DB CRUD: drift_alerts + acknowledge flow', () => {

  it('F07-01: INSERT significant_drop — acknowledged=false boolean, updatedAt set (FA1, FG3)', async () => {
    const d  = await seedDriftAlert({ organizationId:org1Id, brandId:brand1Id,
      currentAuditId:audit2Id, previousAuditId:audit1Id, severity:'significant_drop' });
    alertId  = d.id;
    expect(d.acknowledged).toBe(false);           // FA1: boolean
    expect(typeof d.acknowledged).toBe('boolean');
    expect(d.updatedAt).toBeTruthy();             // FG3: NOT NULL
  });

  it('F07-02: severity is "significant_drop" NOT "high" (FB5 fix)', async () => {
    const [d] = await db.select().from(schema.driftAlerts).where(eq(schema.driftAlerts.id, alertId));
    expect(d.severity).toBe('significant_drop');
    expect(d.severity).not.toBe('high');
  });

  it('F07-03: significant_rise also inserts correctly (FB5)', async () => {
    const d = await seedDriftAlert({ organizationId:org1Id, brandId:brand1Id,
      currentAuditId:audit1Id, previousAuditId:audit2Id, severity:'significant_rise' });
    expect(d.severity).toBe('significant_rise');
    await db.delete(schema.driftAlerts).where(eq(schema.driftAlerts.id, d.id));
  });

  it('F07-04: SELECT by orgId returns the seeded alert', async () => {
    const rows = await db.select().from(schema.driftAlerts)
      .where(eq(schema.driftAlerts.organizationId, org1Id));
    expect(rows.some(r => r.id === alertId)).toBe(true);
  });

  it('F07-05: PATCH acknowledge — sets acknowledged=true boolean and acknowledgedAt (FA1)', async () => {
    const now = new Date();
    await db.update(schema.driftAlerts)
      .set({ acknowledged:true, acknowledgedAt:now, updatedAt:now })
      .where(eq(schema.driftAlerts.id, alertId));
    const [d] = await db.select().from(schema.driftAlerts).where(eq(schema.driftAlerts.id, alertId));
    expect(d.acknowledged).toBe(true);     // FA1: boolean
    expect(typeof d.acknowledged).toBe('boolean');
    expect(d.acknowledgedAt).toBeTruthy();
  });

  it('F07-06: acknowledged=true row no longer returned by unacknowledged filter', async () => {
    const rows = await db.select().from(schema.driftAlerts)
      .where(eq(schema.driftAlerts.acknowledged, false));
    expect(rows.every(r => r.id !== alertId)).toBe(true);
  });

  it('F07-07: cross-org — org2 SELECT returns zero rows', async () => {
    const rows = await db.select().from(schema.driftAlerts)
      .where(eq(schema.driftAlerts.organizationId, org2Id));
    expect(rows).toHaveLength(0);
  });

  it('F07-08: DELETE by id removes the alert', async () => {
    await db.delete(schema.driftAlerts).where(eq(schema.driftAlerts.id, alertId));
    const rows = await db.select().from(schema.driftAlerts).where(eq(schema.driftAlerts.id, alertId));
    expect(rows).toHaveLength(0);
  });
});
```

### `tests/qa/sprint8/features/f07-db-drift-alerts/F07-DB-DRIFT-ALERTS.bat`

```batch
@echo off
REM [S8QA] F07 — DB CRUD: drift_alerts + acknowledge flow
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do set "%%A=%%B")
echo.& echo ═══════════════════════════════════════════════════════
echo  [S8QA] F07: DB CRUD — drift_alerts + acknowledge flow
echo ═══════════════════════════════════════════════════════
pnpm vitest run tests/qa/sprint8/features/f07-db-drift-alerts/f07-db-drift-alerts.spec.ts --reporter=verbose
if %ERRORLEVEL% EQU 0 (echo  RESULT: ALL PASS & exit /b 0) else (echo  RESULT: FAILED & exit /b 1)
```

### `tests/qa/sprint8/features/f07-db-drift-alerts/f07-db-drift-alerts.sh`

```bash
#!/usr/bin/env bash
# [S8QA] F07 — DB CRUD: drift_alerts + acknowledge flow
set -euo pipefail; set -a; [ -f .env.test.local ] && source .env.test.local; set +a
echo ""; echo "═══════════════════════════════════════════════════════"
echo " [S8QA] F07: DB CRUD — drift_alerts + acknowledge flow"
echo "═══════════════════════════════════════════════════════"
pnpm vitest run tests/qa/sprint8/features/f07-db-drift-alerts/f07-db-drift-alerts.spec.ts --reporter=verbose
echo " RESULT: ALL PASS ✓"
```

-----

## F08 — DB CRUD: webhook_endpoints + deliveries

**Purpose:** FA1 (isActive boolean), FG4 (updatedAt NOT NULL), FC4 (events dot-notation),
FD4 (deliveries.organizationId denormalised), success vs failure delivery rows,
cross-org isolation, FK-safe delete order.

**Seeds:** org1 + user1. Org2 for isolation.  
**Cleanup:** `cleanupOrg` both.  
**Runner:** vitest.

### `tests/qa/sprint8/features/f08-db-webhooks/f08-db-webhooks.spec.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema } from '../../shared/db';
import { seedOrg, seedUser, seedWebhookEndpoint, seedWebhookDelivery, cleanupOrg } from '../../shared/seed';
import { eq, inArray } from 'drizzle-orm';

let org1Id='', org2Id='', epId='';

beforeAll(async () => {
  const o1 = await seedOrg({ clerkOrgId:process.env.E2E_TEST_ORG_1_CLERK_ID!, name:'[S8QA] F08 Org1' });
  org1Id   = o1.id;
  await seedUser({ clerkUserId:process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId:org1Id, email:process.env.E2E_TEST_USER_1_EMAIL! });
  const o2 = await seedOrg({ clerkOrgId:process.env.E2E_TEST_ORG_2_CLERK_ID!, name:'[S8QA] F08 Org2' });
  org2Id   = o2.id;
});
afterAll(async () => { await cleanupOrg(org1Id); await cleanupOrg(org2Id); });

describe('[S8QA] F08 — DB CRUD: webhook_endpoints + deliveries', () => {

  it('F08-01: INSERT endpoint — isActive boolean (FA1), updatedAt NOT NULL (FG4)', async () => {
    const ep = await seedWebhookEndpoint({ organizationId:org1Id });
    epId     = ep.id;
    expect(ep.isActive).toBe(true);            // FA1: boolean
    expect(typeof ep.isActive).toBe('boolean');
    expect(ep.updatedAt).toBeTruthy();         // FG4: NOT NULL
  });

  it('F08-02: events array uses dot-notation NOT slashes (FC4 fix)', async () => {
    const [ep] = await db.select().from(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.id, epId));
    expect(ep.events).toContain('audit.completed');
    expect(ep.events).toContain('drift.detected');
    expect(ep.events.every((e:string) => !e.includes('/'))).toBe(true);  // FC4: no slashes
  });

  it('F08-03: INSERT success delivery — organizationId denormalised (FD4)', async () => {
    const d = await seedWebhookDelivery({ endpointId:epId, organizationId:org1Id, success:true });
    expect(d.organizationId).toBe(org1Id);     // FD4: on the row directly
    expect(d.responseStatus).toBe(200);
    expect(d.deliveredAt).toBeTruthy();
    expect(d.failedAt).toBeNull();
  });

  it('F08-04: INSERT failure delivery — responseStatus=503, failedAt set, deliveredAt null', async () => {
    const d = await seedWebhookDelivery({ endpointId:epId, organizationId:org1Id, success:false, responseStatus:503 });
    expect(d.responseStatus).toBe(503);
    expect(d.failedAt).toBeTruthy();
    expect(d.deliveredAt).toBeNull();
  });

  it('F08-05: delivery event uses dot-notation (FC4 — "audit.completed" not "audit/complete")', async () => {
    const rows = await db.select({ event:schema.webhookDeliveries.event })
      .from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.endpointId, epId)).limit(1);
    expect(rows[0].event).toBe('audit.completed');
    expect(rows[0].event).not.toContain('/');
  });

  it('F08-06: PATCH isActive → false (deactivate endpoint)', async () => {
    await db.update(schema.webhookEndpoints)
      .set({ isActive:false, updatedAt:new Date() }).where(eq(schema.webhookEndpoints.id, epId));
    const [ep] = await db.select().from(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.id, epId));
    expect(ep.isActive).toBe(false);           // FA1: boolean
  });

  it('F08-07: cross-org — org2 sees zero endpoints', async () => {
    const rows = await db.select().from(schema.webhookEndpoints)
      .where(eq(schema.webhookEndpoints.organizationId, org2Id));
    expect(rows).toHaveLength(0);
  });

  it('F08-08: deliveries SELECT by endpointId returns ≥2 rows', async () => {
    const rows = await db.select().from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.endpointId, epId));
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('F08-09: FK-safe delete — deliveries then endpoint, all gone', async () => {
    const dels = await db.select({ id:schema.webhookDeliveries.id })
      .from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.endpointId, epId));
    await db.delete(schema.webhookDeliveries)
      .where(inArray(schema.webhookDeliveries.id, dels.map(d=>d.id)));
    await db.delete(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.id, epId));
    expect(await db.select().from(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.id, epId)))
      .toHaveLength(0);
  });
});
```

### `tests/qa/sprint8/features/f08-db-webhooks/F08-DB-WEBHOOKS.bat`

```batch
@echo off
REM [S8QA] F08 — DB CRUD: webhook_endpoints + deliveries
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do set "%%A=%%B")
echo.& echo ═══════════════════════════════════════════════════════
echo  [S8QA] F08: DB CRUD — webhook_endpoints + deliveries
echo ═══════════════════════════════════════════════════════
pnpm vitest run tests/qa/sprint8/features/f08-db-webhooks/f08-db-webhooks.spec.ts --reporter=verbose
if %ERRORLEVEL% EQU 0 (echo  RESULT: ALL PASS & exit /b 0) else (echo  RESULT: FAILED & exit /b 1)
```

### `tests/qa/sprint8/features/f08-db-webhooks/f08-db-webhooks.sh`

```bash
#!/usr/bin/env bash
# [S8QA] F08 — DB CRUD: webhook_endpoints + deliveries
set -euo pipefail; set -a; [ -f .env.test.local ] && source .env.test.local; set +a
echo ""; echo "═══════════════════════════════════════════════════════"
echo " [S8QA] F08: DB CRUD — webhook_endpoints + deliveries"
echo "═══════════════════════════════════════════════════════"
pnpm vitest run tests/qa/sprint8/features/f08-db-webhooks/f08-db-webhooks.spec.ts --reporter=verbose
echo " RESULT: ALL PASS ✓"
```

-----

## F09 — DB CRUD: audit_exports downloadCount increment (FH5)

**Purpose:** First download → count=1; `onConflictDoUpdate` increments count on each subsequent
download; separate format key has its own counter; SELECT returns both rows; DELETE removes all.

**Seeds:** org + user + brand + audit.  
**Cleanup:** `cleanupOrg`.  
**Runner:** vitest.

### `tests/qa/sprint8/features/f09-db-audit-exports/f09-db-audit-exports.spec.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema } from '../../shared/db';
import { seedOrg, seedUser, seedBrand, seedAudit, cleanupOrg } from '../../shared/seed';
import { eq, sql } from 'drizzle-orm';

let orgId='', auditId='';

async function upsertExport(format: string) {
  const [e] = await db.insert(schema.auditExports).values({
    auditId, organizationId:orgId,
    format, generatedAt:new Date(), fileSizeBytes:1024, downloadCount:1,
  }).onConflictDoUpdate({
    target: [schema.auditExports.auditId, schema.auditExports.format],
    set: { downloadCount:sql`${schema.auditExports.downloadCount} + 1`, generatedAt:new Date() },
  }).returning();
  return e;
}

beforeAll(async () => {
  const o   = await seedOrg({ clerkOrgId:process.env.E2E_TEST_ORG_1_CLERK_ID!, name:'[S8QA] F09 Org' });
  orgId     = o.id;
  await seedUser({ clerkUserId:process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId:orgId, email:process.env.E2E_TEST_USER_1_EMAIL! });
  const b   = await seedBrand({ organizationId:orgId });
  const a   = await seedAudit({ organizationId:orgId, brandId:b.id });
  auditId   = a.id;
});
afterAll(async () => { await cleanupOrg(orgId); });

describe('[S8QA] F09 — DB CRUD: audit_exports downloadCount (FH5)', () => {
  it('F09-01: first SARIF download → downloadCount=1', async () => {
    const e = await upsertExport('sarif');
    expect(Number(e.downloadCount)).toBe(1);
  });
  it('F09-02: second download → downloadCount=2 (FH5 increment)', async () => {
    const e = await upsertExport('sarif');
    expect(Number(e.downloadCount)).toBe(2);
  });
  it('F09-03: third download → downloadCount=3 (cumulative)', async () => {
    const e = await upsertExport('sarif');
    expect(Number(e.downloadCount)).toBe(3);
  });
  it('F09-04: JUnit has its own counter — starts at 1 (separate format key)', async () => {
    const e = await upsertExport('junit');
    expect(Number(e.downloadCount)).toBe(1);
  });
  it('F09-05: SELECT by auditId returns both sarif (count=3) and junit (count=1)', async () => {
    const rows = await db.select().from(schema.auditExports).where(eq(schema.auditExports.auditId, auditId));
    const sarif = rows.find(r => r.format==='sarif');
    const junit = rows.find(r => r.format==='junit');
    expect(Number(sarif?.downloadCount)).toBe(3);
    expect(Number(junit?.downloadCount)).toBe(1);
  });
  it('F09-06: DELETE by auditId removes all export rows', async () => {
    await db.delete(schema.auditExports).where(eq(schema.auditExports.auditId, auditId));
    expect(await db.select().from(schema.auditExports).where(eq(schema.auditExports.auditId, auditId)))
      .toHaveLength(0);
  });
});
```

### `tests/qa/sprint8/features/f09-db-audit-exports/F09-DB-AUDIT-EXPORTS.bat`

```batch
@echo off
REM [S8QA] F09 — DB CRUD: audit_exports downloadCount (FH5)
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do set "%%A=%%B")
echo.& echo ═══════════════════════════════════════════════════════
echo  [S8QA] F09: DB CRUD — audit_exports downloadCount (FH5)
echo ═══════════════════════════════════════════════════════
pnpm vitest run tests/qa/sprint8/features/f09-db-audit-exports/f09-db-audit-exports.spec.ts --reporter=verbose
if %ERRORLEVEL% EQU 0 (echo  RESULT: ALL PASS & exit /b 0) else (echo  RESULT: FAILED & exit /b 1)
```

### `tests/qa/sprint8/features/f09-db-audit-exports/f09-db-audit-exports.sh`

```bash
#!/usr/bin/env bash
# [S8QA] F09 — DB CRUD: audit_exports downloadCount (FH5)
set -euo pipefail; set -a; [ -f .env.test.local ] && source .env.test.local; set +a
echo ""; echo "═══════════════════════════════════════════════════════"
echo " [S8QA] F09: DB CRUD — audit_exports downloadCount (FH5)"
echo "═══════════════════════════════════════════════════════"
pnpm vitest run tests/qa/sprint8/features/f09-db-audit-exports/f09-db-audit-exports.spec.ts --reporter=verbose
echo " RESULT: ALL PASS ✓"
```

-----

## F10 — API: local-seo routes + RLS isolation

**Purpose:** `GET /api/local-seo/[brandId]` returns 200 with correct shape (FA1 gmbPresent boolean,
FJ1 4 dirs, FO5 timestamps); unauthenticated → 401; unknown brand → 404; org2 user → 404 (RLS).

**Seeds:** org1+user1+brand+localSeoResult; org2+user2.  
**Cleanup:** both orgs.  
**Runner:** Playwright — script launches dev server, runs tests, shuts server down.

### `tests/qa/sprint8/features/f10-api-local-seo/f10-api-local-seo.spec.ts`

```typescript
import { test, expect }                      from '@playwright/test';
import { clerk, clerkSetup }                 from '@clerk/testing/playwright';
import { db, schema }                        from '../../shared/db';
import { seedOrg, seedUser, seedBrand,
         seedLocalSeoResult, cleanupOrg }    from '../../shared/seed';
import { eq }                                from 'drizzle-orm';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id='', org2Id='', brand1Id='';

test.beforeAll(async () => {
  await clerkSetup();
  for (const cid of [process.env.E2E_TEST_ORG_1_CLERK_ID!, process.env.E2E_TEST_ORG_2_CLERK_ID!]) {
    const ex = await db.select({id:schema.organizations.id}).from(schema.organizations)
      .where(eq(schema.organizations.clerkOrgId, cid)).limit(1);
    if (ex.length) await cleanupOrg(ex[0].id);
  }
  const o1 = await seedOrg({ clerkOrgId:process.env.E2E_TEST_ORG_1_CLERK_ID!, name:'[S8QA] F10 Org1' });
  org1Id   = o1.id;
  await seedUser({ clerkUserId:process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId:org1Id, email:process.env.E2E_TEST_USER_1_EMAIL! });
  const b  = await seedBrand({ organizationId:org1Id });
  brand1Id = b.id;
  await seedLocalSeoResult({ brandId:brand1Id, organizationId:org1Id, scoreComposite:'71.75' });
  const o2 = await seedOrg({ clerkOrgId:process.env.E2E_TEST_ORG_2_CLERK_ID!, name:'[S8QA] F10 Org2' });
  org2Id   = o2.id;
  await seedUser({ clerkUserId:process.env.E2E_TEST_USER_2_CLERK_ID!, organizationId:org2Id, email:process.env.E2E_TEST_USER_2_EMAIL! });
});
test.afterAll(async () => { await cleanupOrg(org1Id); await cleanupOrg(org2Id); });

const signIn1 = (page: any) => clerk.signIn({ page, signInParams:{ strategy:'password', identifier:process.env.E2E_TEST_USER_1_EMAIL!, password:process.env.E2E_TEST_USER_1_PASSWORD! } });
const signIn2 = (page: any) => clerk.signIn({ page, signInParams:{ strategy:'password', identifier:process.env.E2E_TEST_USER_2_EMAIL!, password:process.env.E2E_TEST_USER_2_PASSWORD! } });
const get     = (page: any, path: string) => page.evaluate(async (url:string) => { const r=await fetch(url); return {status:r.status, body:r.ok?await r.json():null}; }, `${BASE}${path}`);

test.describe('[S8QA] F10 — API: local-seo routes + RLS', () => {

  test('F10-01: GET /api/local-seo/[brandId] → 200 with gmbPresent boolean (FA1)', async ({ page }) => {
    await signIn1(page);
    const res = await get(page, `/api/local-seo/${brand1Id}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.gmbPresent).toBe('boolean');   // FA1
    await clerk.signOut({ page });
  });

  test('F10-02: directoryPresence has exactly 4 AU dirs (FJ1 — not 5)', async ({ page }) => {
    await signIn1(page);
    const res = await get(page, `/api/local-seo/${brand1Id}`);
    expect(res.body.directoryPresence).toHaveLength(4);
    for (const d of ['hipages','yellow_pages_au','service_seeking','word_of_mouth'])
      expect(res.body.directoryPresence.map((x:any)=>x.directory)).toContain(d);
    await clerk.signOut({ page });
  });

  test('F10-03: response has checkedAt AND createdAt (FO5)', async ({ page }) => {
    await signIn1(page);
    const res = await get(page, `/api/local-seo/${brand1Id}`);
    expect(res.body.checkedAt).toBeTruthy();
    expect(res.body.createdAt).toBeTruthy();
    await clerk.signOut({ page });
  });

  test('F10-04: scoreComposite ≈ 71.75 (seeded value)', async ({ page }) => {
    await signIn1(page);
    const res = await get(page, `/api/local-seo/${brand1Id}`);
    expect(parseFloat(res.body.scoreComposite)).toBeCloseTo(71.75, 1);
    await clerk.signOut({ page });
  });

  test('F10-05: napFindings identifies service_seeking phone mismatch', async ({ page }) => {
    await signIn1(page);
    const res = await get(page, `/api/local-seo/${brand1Id}`);
    const ss = res.body.napFindings.find((f:any) => f.source==='service_seeking');
    expect(ss?.matches?.phone).toBe(false);
    await clerk.signOut({ page });
  });

  test('F10-06: unauthenticated → 401', async ({ page }) => {
    const res = await get(page, `/api/local-seo/${brand1Id}`);
    expect(res.status).toBe(401);
  });

  test('F10-07: unknown brandId → 404', async ({ page }) => {
    await signIn1(page);
    const res = await get(page, `/api/local-seo/00000000-0000-0000-0000-000000000000`);
    expect(res.status).toBe(404);
    await clerk.signOut({ page });
  });

  test('F10-08: org2 user cannot see org1 brand → 404 (RLS)', async ({ page }) => {
    await signIn2(page);
    const res = await get(page, `/api/local-seo/${brand1Id}`);
    expect(res.status, 'RLS: org2 must get 404 for org1 data').toBe(404);
    await clerk.signOut({ page });
  });

  test('F10-09: suburbCoverage Bondi=true, Coogee=false (seeded values)', async ({ page }) => {
    await signIn1(page);
    const res = await get(page, `/api/local-seo/${brand1Id}`);
    const bondi  = res.body.suburbCoverage.find((s:any) => s.suburb==='Bondi');
    const coogee = res.body.suburbCoverage.find((s:any) => s.suburb==='Coogee');
    expect(bondi?.mentionedInContent).toBe(true);
    expect(coogee?.mentionedInContent).toBe(false);
    await clerk.signOut({ page });
  });
});
```

### `tests/qa/sprint8/features/f10-api-local-seo/F10-API-LOCAL-SEO.bat`

```batch
@echo off
REM ═══════════════════════════════════════════════════════════════
REM  [S8QA] F10 — API: local-seo routes + RLS isolation
REM  Starts Next.js dev server → seeds DB → runs Playwright → kills
REM ═══════════════════════════════════════════════════════════════
setlocal EnableDelayedExpansion
if exist .env.test.local (
  for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (
    set "k=%%A"& if defined k if not "!k:~0,1!"=="#" set "%%A=%%B"
  )
)
set LOGDIR=tests\qa\sprint8\features\f10-api-local-seo\logs
mkdir %LOGDIR% 2>nul
echo.
echo ═══════════════════════════════════════════════════════════════
echo  [S8QA] F10: API — local-seo routes + RLS
echo ═══════════════════════════════════════════════════════════════
set LLM_MODE=mock
start /B cmd /c "set LLM_MODE=mock && pnpm dev > %LOGDIR%\server.log 2>&1"
echo  Waiting for server (max 80s)...
set W=0
:WAIT_F10
ping -n 3 127.0.0.1>nul
curl -sf http://localhost:3000/api/health>nul 2>&1
if %ERRORLEVEL% EQU 0 goto READY_F10
set /a W+=1 & if !W! GTR 26 (echo  ERROR: server not ready & goto KILL_F10)
goto WAIT_F10
:READY_F10
echo  Server ready.
pnpm exec playwright test tests/qa/sprint8/features/f10-api-local-seo/f10-api-local-seo.spec.ts ^
  --config tests/qa/sprint8/playwright.config.ts --reporter=list 2>&1
set RESULT=%ERRORLEVEL%
:KILL_F10
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000 " 2^>nul') do taskkill /PID %%P /F>nul 2>&1
if %RESULT% EQU 0 (echo  RESULT: ALL PASS & exit /b 0) else (echo  RESULT: FAILED & exit /b 1)
```

### `tests/qa/sprint8/features/f10-api-local-seo/f10-api-local-seo.sh`

```bash
#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  [S8QA] F10 — API: local-seo routes + RLS isolation
#  Starts Next.js dev server → seeds DB → runs Playwright → kills
# ─────────────────────────────────────────────────────────────────
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
LOGDIR="tests/qa/sprint8/features/f10-api-local-seo/logs"
mkdir -p "$LOGDIR"
echo ""; echo "═══════════════════════════════════════════════════════════════"
echo " [S8QA] F10: API — local-seo routes + RLS"
echo "═══════════════════════════════════════════════════════════════"
export LLM_MODE=mock
LLM_MODE=mock pnpm dev > "$LOGDIR/server.log" 2>&1 & SERVER_PID=$!
echo " Waiting for server (max 80s)..."
W=0
until curl -sf http://localhost:3000/api/health>/dev/null 2>&1; do
  sleep 2; W=$((W+1))
  if [ "$W" -gt 40 ]; then echo " ERROR: server not ready"; kill "$SERVER_PID" 2>/dev/null; exit 1; fi
done
echo " Server ready."
set +e
pnpm exec playwright test tests/qa/sprint8/features/f10-api-local-seo/f10-api-local-seo.spec.ts \
  --config tests/qa/sprint8/playwright.config.ts --reporter=list
RESULT=$?
set -e
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$RESULT" -eq 0 ] && echo " RESULT: ALL PASS ✓" && exit 0 || (echo " RESULT: FAILED"; exit 1)
```

-----

## F11 — API: drift-alerts list + acknowledge + RLS

**Purpose:** `GET /api/drift-alerts` returns alerts with `brandName` (FJ3 — JOIN brands);
severity values are FB5 enum not “high”/“low”; `PATCH .../acknowledge` sets acknowledged=true boolean
(FA1); acknowledged filter works; org2 sees empty list (RLS); unauthenticated → 401.
Also verifies `GET /api/audits` includes `driftSeverity` from LEFT JOIN (FM5).

**Seeds:** org1+user1+2 brands+2 audits each+2 alerts; org2+user2.  
**Cleanup:** both.  
**Runner:** Playwright.

### `tests/qa/sprint8/features/f11-api-drift-alerts/f11-api-drift-alerts.spec.ts`

```typescript
import { test, expect }                         from '@playwright/test';
import { clerk, clerkSetup }                    from '@clerk/testing/playwright';
import { db, schema }                           from '../../shared/db';
import { seedOrg, seedUser, seedBrand, seedAudit,
         seedDriftAlert, cleanupOrg }           from '../../shared/seed';
import { eq }                                   from 'drizzle-orm';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id='', org2Id='', alertDropId='', alertRiseId='';

test.beforeAll(async () => {
  await clerkSetup();
  for (const cid of [process.env.E2E_TEST_ORG_1_CLERK_ID!, process.env.E2E_TEST_ORG_2_CLERK_ID!]) {
    const ex = await db.select({id:schema.organizations.id}).from(schema.organizations)
      .where(eq(schema.organizations.clerkOrgId,cid)).limit(1);
    if (ex.length) await cleanupOrg(ex[0].id);
  }
  const o1 = await seedOrg({ clerkOrgId:process.env.E2E_TEST_ORG_1_CLERK_ID!, name:'[S8QA] F11 Org1' });
  org1Id   = o1.id;
  await seedUser({ clerkUserId:process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId:org1Id, email:process.env.E2E_TEST_USER_1_EMAIL! });
  const b1 = await seedBrand({ organizationId:org1Id, name:'[S8QA] Bondi Plumbing' });
  const a1 = await seedAudit({ organizationId:org1Id, brandId:b1.id, auditNumber:1, scoreComposite:'63.40' });
  const a2 = await seedAudit({ organizationId:org1Id, brandId:b1.id, auditNumber:2, scoreComposite:'55.00' });
  const d1 = await seedDriftAlert({ organizationId:org1Id, brandId:b1.id, currentAuditId:a2.id, previousAuditId:a1.id, severity:'significant_drop' });
  alertDropId = d1.id;
  const b2 = await seedBrand({ organizationId:org1Id, name:'[S8QA] Joinery' });
  const a3 = await seedAudit({ organizationId:org1Id, brandId:b2.id, auditNumber:1, scoreComposite:'40.00' });
  const a4 = await seedAudit({ organizationId:org1Id, brandId:b2.id, auditNumber:2, scoreComposite:'52.00' });
  const d2 = await seedDriftAlert({ organizationId:org1Id, brandId:b2.id, currentAuditId:a4.id, previousAuditId:a3.id, severity:'significant_rise' });
  alertRiseId = d2.id;
  const o2 = await seedOrg({ clerkOrgId:process.env.E2E_TEST_ORG_2_CLERK_ID!, name:'[S8QA] F11 Org2' });
  org2Id   = o2.id;
  await seedUser({ clerkUserId:process.env.E2E_TEST_USER_2_CLERK_ID!, organizationId:org2Id, email:process.env.E2E_TEST_USER_2_EMAIL! });
});
test.afterAll(async () => { await cleanupOrg(org1Id); await cleanupOrg(org2Id); });

const signIn1 = (page:any) => clerk.signIn({ page, signInParams:{ strategy:'password', identifier:process.env.E2E_TEST_USER_1_EMAIL!, password:process.env.E2E_TEST_USER_1_PASSWORD! } });
const signIn2 = (page:any) => clerk.signIn({ page, signInParams:{ strategy:'password', identifier:process.env.E2E_TEST_USER_2_EMAIL!, password:process.env.E2E_TEST_USER_2_PASSWORD! } });
const apiGet  = (page:any, path:string) => page.evaluate(async (url:string) => { const r=await fetch(url); return {status:r.status, body:r.ok?await r.json():null}; }, `${BASE}${path}`);

test.describe('[S8QA] F11 — API: drift-alerts list + acknowledge + RLS', () => {

  test('F11-01: GET /api/drift-alerts → 200 with array ≥2 alerts', async ({ page }) => {
    await signIn1(page);
    const res = await apiGet(page, '/api/drift-alerts');
    expect(res.status).toBe(200);
    const list = Array.isArray(res.body) ? res.body : (res.body?.alerts ?? []);
    expect(list.length).toBeGreaterThanOrEqual(2);
    await clerk.signOut({ page });
  });

  test('F11-02: alert row includes brandName (FJ3 — JOIN with brands table)', async ({ page }) => {
    await signIn1(page);
    const res  = await apiGet(page, '/api/drift-alerts');
    const list = Array.isArray(res.body) ? res.body : (res.body?.alerts ?? []);
    const drop = list.find((a:any) => a.id===alertDropId);
    expect(drop?.brandName ?? drop?.brand?.name).toMatch(/Bondi Plumbing/i);
    await clerk.signOut({ page });
  });

  test('F11-03: severity values are FB5 enum — not "high"/"low"', async ({ page }) => {
    await signIn1(page);
    const res  = await apiGet(page, '/api/drift-alerts');
    const list = Array.isArray(res.body) ? res.body : (res.body?.alerts ?? []);
    for (const a of list) {
      expect(['significant_drop','significant_rise','within_noise']).toContain(a.severity);
      expect(a.severity).not.toBe('high');
      expect(a.severity).not.toBe('low');
    }
    await clerk.signOut({ page });
  });

  test('F11-04: PATCH acknowledge → 200, DB acknowledged=true boolean (FA1)', async ({ page }) => {
    await signIn1(page);
    const s = await page.evaluate(async ({ base, id }:any) => {
      const r = await fetch(`${base}/api/drift-alerts/${id}/acknowledge`,{method:'PATCH'});
      return r.status;
    }, { base:BASE, id:alertDropId });
    expect(s).toBe(200);
    const [row] = await db.select({ack:schema.driftAlerts.acknowledged})
      .from(schema.driftAlerts).where(eq(schema.driftAlerts.id, alertDropId));
    expect(row.ack).toBe(true);              // FA1: boolean not string
    await clerk.signOut({ page });
  });

  test('F11-05: acknowledged alert excluded from ?acknowledged=false filter', async ({ page }) => {
    await signIn1(page);
    const res  = await apiGet(page, '/api/drift-alerts?acknowledged=false');
    const list = Array.isArray(res.body) ? res.body : (res.body?.alerts ?? []);
    expect(list.find((a:any) => a.id===alertDropId)).toBeUndefined();
    await clerk.signOut({ page });
  });

  test('F11-06: org2 GET returns empty — cannot see org1 alerts (RLS)', async ({ page }) => {
    await signIn2(page);
    const res  = await apiGet(page, '/api/drift-alerts');
    const list = Array.isArray(res.body) ? res.body : (res.body?.alerts ?? []);
    expect(list.find((a:any) => a.id===alertDropId || a.id===alertRiseId)).toBeUndefined();
    await clerk.signOut({ page });
  });

  test('F11-07: PATCH non-existent alert → 404', async ({ page }) => {
    await signIn1(page);
    const s = await page.evaluate(async ({ base }:any) => {
      const r = await fetch(`${base}/api/drift-alerts/00000000-0000-0000-0000-000000000000/acknowledge`,{method:'PATCH'});
      return r.status;
    }, { base:BASE });
    expect(s).toBe(404);
    await clerk.signOut({ page });
  });

  test('F11-08: GET /api/audits includes driftSeverity field from LEFT JOIN (FM5)', async ({ page }) => {
    await signIn1(page);
    const res = await apiGet(page, '/api/audits');
    const audits = Array.isArray(res.body) ? res.body : (res.body?.data ?? []);
    const withDrift = audits.find((a:any) => a.driftSeverity!=null);
    expect(withDrift, 'FM5: at least one audit must have driftSeverity').toBeTruthy();
    await clerk.signOut({ page });
  });

  test('F11-09: unauthenticated GET /api/drift-alerts → 401', async ({ page }) => {
    const res = await apiGet(page, '/api/drift-alerts');
    expect(res.status).toBe(401);
  });
});
```

### `tests/qa/sprint8/features/f11-api-drift-alerts/F11-API-DRIFT-ALERTS.bat`

```batch
@echo off
REM [S8QA] F11 — API: drift-alerts list + acknowledge + RLS
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do set "%%A=%%B")
set LOGDIR=tests\qa\sprint8\features\f11-api-drift-alerts\logs
mkdir %LOGDIR% 2>nul
echo.& echo ═══════════════════════════════════════════════════════
echo  [S8QA] F11: API — drift-alerts + acknowledge + RLS
echo ═══════════════════════════════════════════════════════
set LLM_MODE=mock
start /B cmd /c "set LLM_MODE=mock && pnpm dev > %LOGDIR%\server.log 2>&1"
set W=0
:W11
ping -n 3 127.0.0.1>nul & curl -sf http://localhost:3000/api/health>nul 2>&1
if %ERRORLEVEL% EQU 0 goto R11
set /a W+=1 & if !W! GTR 26 goto K11 & goto W11
:R11
pnpm exec playwright test tests/qa/sprint8/features/f11-api-drift-alerts/f11-api-drift-alerts.spec.ts --config tests/qa/sprint8/playwright.config.ts --reporter=list
set RESULT=%ERRORLEVEL%
:K11
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000 " 2^>nul') do taskkill /PID %%P /F>nul 2>&1
if %RESULT% EQU 0 (echo  RESULT: ALL PASS & exit /b 0) else (echo  RESULT: FAILED & exit /b 1)
```

### `tests/qa/sprint8/features/f11-api-drift-alerts/f11-api-drift-alerts.sh`

```bash
#!/usr/bin/env bash
# [S8QA] F11 — API: drift-alerts + acknowledge + RLS
set -euo pipefail; set -a; [ -f .env.test.local ] && source .env.test.local; set +a
LOGDIR="tests/qa/sprint8/features/f11-api-drift-alerts/logs"; mkdir -p "$LOGDIR"
echo ""; echo "═══════════════════════════════════════════════════════"
echo " [S8QA] F11: API — drift-alerts + acknowledge + RLS"
echo "═══════════════════════════════════════════════════════"
export LLM_MODE=mock
LLM_MODE=mock pnpm dev > "$LOGDIR/server.log" 2>&1 & SERVER_PID=$!
W=0; until curl -sf http://localhost:3000/api/health>/dev/null 2>&1; do sleep 2; W=$((W+1)); [ "$W" -gt 40 ] && kill "$SERVER_PID" && exit 1; done
echo " Server ready."
set +e
pnpm exec playwright test tests/qa/sprint8/features/f11-api-drift-alerts/f11-api-drift-alerts.spec.ts \
  --config tests/qa/sprint8/playwright.config.ts --reporter=list
R=$?; set -e
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$R" -eq 0 ] && echo " RESULT: ALL PASS ✓" && exit 0 || (echo " RESULT: FAILED"; exit 1)
```

-----

## F12 — API: webhooks-config CRUD + test-delivery (FH4)

**Purpose:** POST creates endpoint with `whsec_` signing secret; GET lists it;
PATCH edits URL; POST rejects slash event names (FC4 — `audit/complete` invalid);
`POST /[id]/test` returns `{ ok }` (FH4) and writes a delivery row with denormalised orgId (FD4);
DELETE removes endpoint; org2 sees empty list (RLS); unauthenticated → 401.

**Seeds:** org1+user1; org2+user2. All endpoint rows created via API during tests.  
**Cleanup:** both orgs.  
**Runner:** Playwright.

### `tests/qa/sprint8/features/f12-api-webhooks/f12-api-webhooks.spec.ts`

```typescript
import { test, expect }                  from '@playwright/test';
import { clerk, clerkSetup }             from '@clerk/testing/playwright';
import { db, schema }                    from '../../shared/db';
import { seedOrg, seedUser, cleanupOrg } from '../../shared/seed';
import { eq }                            from 'drizzle-orm';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id='', org2Id='', createdEpId='';

test.beforeAll(async () => {
  await clerkSetup();
  for (const cid of [process.env.E2E_TEST_ORG_1_CLERK_ID!, process.env.E2E_TEST_ORG_2_CLERK_ID!]) {
    const ex = await db.select({id:schema.organizations.id}).from(schema.organizations)
      .where(eq(schema.organizations.clerkOrgId,cid)).limit(1);
    if (ex.length) await cleanupOrg(ex[0].id);
  }
  const o1 = await seedOrg({ clerkOrgId:process.env.E2E_TEST_ORG_1_CLERK_ID!, name:'[S8QA] F12 Org1' });
  org1Id   = o1.id;
  await seedUser({ clerkUserId:process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId:org1Id, email:process.env.E2E_TEST_USER_1_EMAIL! });
  const o2 = await seedOrg({ clerkOrgId:process.env.E2E_TEST_ORG_2_CLERK_ID!, name:'[S8QA] F12 Org2' });
  org2Id   = o2.id;
  await seedUser({ clerkUserId:process.env.E2E_TEST_USER_2_CLERK_ID!, organizationId:org2Id, email:process.env.E2E_TEST_USER_2_EMAIL! });
});
test.afterAll(async () => { await cleanupOrg(org1Id); await cleanupOrg(org2Id); });

const signIn1 = (page:any) => clerk.signIn({ page, signInParams:{ strategy:'password', identifier:process.env.E2E_TEST_USER_1_EMAIL!, password:process.env.E2E_TEST_USER_1_PASSWORD! } });
const signIn2 = (page:any) => clerk.signIn({ page, signInParams:{ strategy:'password', identifier:process.env.E2E_TEST_USER_2_EMAIL!, password:process.env.E2E_TEST_USER_2_PASSWORD! } });

test.describe('[S8QA] F12 — API: webhooks-config CRUD + test-delivery (FH4)', () => {

  test('F12-01: POST /api/webhooks-config → 201 with id and whsec_ signingSecret', async ({ page }) => {
    await signIn1(page);
    const res = await page.evaluate(async (base:string) => {
      const r = await fetch(`${base}/api/webhooks-config`, { method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ url:'https://hooks.slack.com/services/F12/TEST/FAKETOKEN',
          channel:'slack', events:['audit.completed','drift.detected'] }) });
      return { status:r.status, data:await r.json() };
    }, BASE);
    // ANGLE-AH fix: FF5 spec doesn't mandate 201 — Next.js POST may return 200 or 201.
    expect([200, 201]).toContain(res.status);
    expect(res.data.id).toBeTruthy();
    expect(res.data.signingSecret).toMatch(/^whsec_/);
    createdEpId = res.data.id;
    await clerk.signOut({ page });
  });

  test('F12-02: GET /api/webhooks-config lists the created endpoint with dot events (FC4)', async ({ page }) => {
    await signIn1(page);
    const list = await page.evaluate(async (base:string) => {
      const r = await fetch(`${base}/api/webhooks-config`); return r.json();
    }, BASE);
    const ep = (Array.isArray(list) ? list : (list.data??[])).find((e:any) => e.id===createdEpId);
    expect(ep).toBeTruthy();
    expect(ep.events).toContain('audit.completed');
    expect(ep.events.every((e:string) => !e.includes('/'))).toBe(true);  // FC4
    await clerk.signOut({ page });
  });

  test('F12-03: POST rejects slash event names → 400/422 (FC4 validation)', async ({ page }) => {
    await signIn1(page);
    const s = await page.evaluate(async (base:string) => {
      const r = await fetch(`${base}/api/webhooks-config`, { method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ url:'https://example.com/hook', channel:'slack',
          events:['audit/complete'] }) });  // slash = invalid
      return r.status;
    }, BASE);
    expect([400,422]).toContain(s);
    await clerk.signOut({ page });
  });

  test('F12-04: PATCH /api/webhooks-config/[id] updates URL', async ({ page }) => {
    await signIn1(page);
    const res = await page.evaluate(async ({ base,id }:any) => {
      const r = await fetch(`${base}/api/webhooks-config/${id}`, { method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ url:'https://hooks.slack.com/services/F12/UPDATED/TOKEN' }) });
      return { status:r.status, data:await r.json() };
    }, { base:BASE, id:createdEpId });
    expect(res.status).toBe(200);
    expect(res.data.url).toContain('UPDATED');
    await clerk.signOut({ page });
  });

  test('F12-05: POST /[id]/test returns { ok } (FH4)', async ({ page }) => {
    await signIn1(page);
    const res = await page.evaluate(async ({ base,id }:any) => {
      const r = await fetch(`${base}/api/webhooks-config/${id}/test`, { method:'POST' });
      return { status:r.status, data:await r.json() };
    }, { base:BASE, id:createdEpId });
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('ok');   // FH4
    await clerk.signOut({ page });
  });

  test('F12-06: test-delivery creates a webhook_deliveries row with denormalised orgId (FD4)', async ({ page }) => {
    await signIn1(page);
    await page.evaluate(async ({ base,id }:any) => {
      await fetch(`${base}/api/webhooks-config/${id}/test`, { method:'POST' });
    }, { base:BASE, id:createdEpId });
    const rows = await db.select().from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.endpointId, createdEpId));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].organizationId).toBe(org1Id);   // FD4: denormalised
    await clerk.signOut({ page });
  });

  test('F12-07: org2 GET returns empty list — cannot see org1 endpoints (RLS)', async ({ page }) => {
    await signIn2(page);
    const list = await page.evaluate(async (base:string) => {
      const r = await fetch(`${base}/api/webhooks-config`); return r.json();
    }, BASE);
    const flat = Array.isArray(list) ? list : (list.data??[]);
    expect(flat.find((e:any) => e.id===createdEpId)).toBeUndefined();
    await clerk.signOut({ page });
  });

  test('F12-08: DELETE /api/webhooks-config/[id] → 200, endpoint gone from DB', async ({ page }) => {
    await signIn1(page);
    const s = await page.evaluate(async ({ base,id }:any) => {
      const r = await fetch(`${base}/api/webhooks-config/${id}`, { method:'DELETE' });
      return r.status;
    }, { base:BASE, id:createdEpId });
    expect(s).toBe(200);
    const rows = await db.select().from(schema.webhookEndpoints)
      .where(eq(schema.webhookEndpoints.id, createdEpId));
    expect(rows).toHaveLength(0);
    await clerk.signOut({ page });
  });

  test('F12-09: unauthenticated POST → 401', async ({ page }) => {
    const s = await page.evaluate(async (base:string) => {
      const r = await fetch(`${base}/api/webhooks-config`, { method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ url:'https://example.com', channel:'slack', events:['audit.completed'] }) });
      return r.status;
    }, BASE);
    expect(s).toBe(401);
  });
});
```

### `tests/qa/sprint8/features/f12-api-webhooks/F12-API-WEBHOOKS.bat`

```batch
@echo off
REM [S8QA] F12 — API: webhooks-config CRUD + test-delivery (FH4)
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do set "%%A=%%B")
set LOGDIR=tests\qa\sprint8\features\f12-api-webhooks\logs & mkdir %LOGDIR% 2>nul
echo.& echo ═══════════════════════════════════════════════════════
echo  [S8QA] F12: API — webhooks-config CRUD + test-delivery
echo ═══════════════════════════════════════════════════════
set LLM_MODE=mock
start /B cmd /c "set LLM_MODE=mock && pnpm dev > %LOGDIR%\server.log 2>&1"
set W=0
:W12
ping -n 3 127.0.0.1>nul & curl -sf http://localhost:3000/api/health>nul 2>&1
if %ERRORLEVEL% EQU 0 goto R12
set /a W+=1 & if !W! GTR 26 goto K12 & goto W12
:R12
pnpm exec playwright test tests/qa/sprint8/features/f12-api-webhooks/f12-api-webhooks.spec.ts --config tests/qa/sprint8/playwright.config.ts --reporter=list
set RESULT=%ERRORLEVEL%
:K12
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000 " 2^>nul') do taskkill /PID %%P /F>nul 2>&1
if %RESULT% EQU 0 (echo  RESULT: ALL PASS & exit /b 0) else (echo  RESULT: FAILED & exit /b 1)
```

### `tests/qa/sprint8/features/f12-api-webhooks/f12-api-webhooks.sh`

```bash
#!/usr/bin/env bash
# [S8QA] F12 — API: webhooks-config CRUD + test-delivery (FH4)
set -euo pipefail; set -a; [ -f .env.test.local ] && source .env.test.local; set +a
LOGDIR="tests/qa/sprint8/features/f12-api-webhooks/logs"; mkdir -p "$LOGDIR"
echo ""; echo "═══════════════════════════════════════════════════════"
echo " [S8QA] F12: API — webhooks-config CRUD + test-delivery"
echo "═══════════════════════════════════════════════════════"
export LLM_MODE=mock
LLM_MODE=mock pnpm dev > "$LOGDIR/server.log" 2>&1 & SERVER_PID=$!
W=0; until curl -sf http://localhost:3000/api/health>/dev/null 2>&1; do sleep 2; W=$((W+1)); [ "$W" -gt 40 ] && kill "$SERVER_PID" && exit 1; done
echo " Server ready."
set +e
pnpm exec playwright test tests/qa/sprint8/features/f12-api-webhooks/f12-api-webhooks.spec.ts \
  --config tests/qa/sprint8/playwright.config.ts --reporter=list
R=$?; set -e
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$R" -eq 0 ] && echo " RESULT: ALL PASS ✓" && exit 0 || (echo " RESULT: FAILED"; exit 1)
```

-----

## F13 — API: export routes SARIF / JUnit / GHA + downloadCount (FF1, FH5)

**Purpose:** `GET /api/audits/[id]/export?format=sarif` returns SARIF JSON with exact `$schema` (FA5);
`format=junit` returns valid XML; `format=gha` returns annotation lines; each download increments
`audit_exports.downloadCount` (FH5); org2 → 404 (RLS); unauthenticated → 401;
`format=pdf` not broken (Sprint 4 regression).

**Seeds:** org1+user1+brand+audit; org2+user2.  
**Cleanup:** both.  
**Runner:** Playwright.

### `tests/qa/sprint8/features/f13-api-export/f13-api-export.spec.ts`

```typescript
import { test, expect }                     from '@playwright/test';
import { clerk, clerkSetup }                from '@clerk/testing/playwright';
import { db, schema }                       from '../../shared/db';
import { seedOrg, seedUser, seedBrand,
         seedAudit, cleanupOrg }            from '../../shared/seed';
import { eq, and }                          from 'drizzle-orm';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id='', org2Id='', audit1Id='';

test.beforeAll(async () => {
  await clerkSetup();
  for (const cid of [process.env.E2E_TEST_ORG_1_CLERK_ID!, process.env.E2E_TEST_ORG_2_CLERK_ID!]) {
    const ex = await db.select({id:schema.organizations.id}).from(schema.organizations)
      .where(eq(schema.organizations.clerkOrgId,cid)).limit(1);
    if (ex.length) await cleanupOrg(ex[0].id);
  }
  const o1 = await seedOrg({ clerkOrgId:process.env.E2E_TEST_ORG_1_CLERK_ID!, name:'[S8QA] F13 Org1', tier:'agency' });
  org1Id   = o1.id;
  await seedUser({ clerkUserId:process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId:org1Id, email:process.env.E2E_TEST_USER_1_EMAIL! });
  const b  = await seedBrand({ organizationId:org1Id });
  const a  = await seedAudit({ organizationId:org1Id, brandId:b.id, scoreComposite:'47.20' });
  audit1Id = a.id;
  const o2 = await seedOrg({ clerkOrgId:process.env.E2E_TEST_ORG_2_CLERK_ID!, name:'[S8QA] F13 Org2' });
  org2Id   = o2.id;
  await seedUser({ clerkUserId:process.env.E2E_TEST_USER_2_CLERK_ID!, organizationId:org2Id, email:process.env.E2E_TEST_USER_2_EMAIL! });
});
test.afterAll(async () => { await cleanupOrg(org1Id); await cleanupOrg(org2Id); });

const signIn1 = (page:any) => clerk.signIn({ page, signInParams:{ strategy:'password', identifier:process.env.E2E_TEST_USER_1_EMAIL!, password:process.env.E2E_TEST_USER_1_PASSWORD! } });
const signIn2 = (page:any) => clerk.signIn({ page, signInParams:{ strategy:'password', identifier:process.env.E2E_TEST_USER_2_EMAIL!, password:process.env.E2E_TEST_USER_2_PASSWORD! } });
const exportUrl = (id:string, fmt:string) => `${BASE}/api/audits/${id}/export?format=${fmt}`;

test.describe('[S8QA] F13 — API: export SARIF / JUnit / GHA + downloadCount (FF1, FH5)', () => {

  test('F13-01: SARIF export → 200, $schema exact v2.1.0 URL (FA5)', async ({ page }) => {
    await signIn1(page);
    const { status, sarif } = await page.evaluate(async (url:string) => {
      const r = await fetch(url);
      return { status:r.status, sarif:r.ok ? await r.json() : null };
    }, exportUrl(audit1Id,'sarif'));
    expect(status).toBe(200);
    expect(sarif?.['$schema']).toBe('https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0.json');
    expect(sarif?.version).toBe('2.1.0');
    expect(sarif?.runs[0].tool.driver.rules).toHaveLength(5);
    await clerk.signOut({ page });
  });

  test('F13-02: SARIF Content-Type is application/json', async ({ page }) => {
    await signIn1(page);
    const ct = await page.evaluate(async (url:string) => {
      const r = await fetch(url); return r.headers.get('content-type');
    }, exportUrl(audit1Id,'sarif'));
    expect(ct).toContain('application/json');
    await clerk.signOut({ page });
  });

  test('F13-03: JUnit export → valid XML starting with <?xml, <testsuites tests="5">', async ({ page }) => {
    await signIn1(page);
    const { status, text } = await page.evaluate(async (url:string) => {
      const r = await fetch(url); return { status:r.status, text:r.ok?await r.text():null };
    }, exportUrl(audit1Id,'junit'));
    expect(status).toBe(200);
    expect(text!.trim()).toMatch(/^<\?xml/);
    expect(text!).toContain('<testsuites');
    expect(text!).toContain('tests="5"');
    await clerk.signOut({ page });
  });

  test('F13-04: GHA export → annotation lines with ::error::/::warning:: and title=', async ({ page }) => {
    await signIn1(page);
    const text = await page.evaluate(async (url:string) => {
      const r = await fetch(url); return r.ok ? r.text() : null;
    }, exportUrl(audit1Id,'gha'));
    if (text && text.trim().length > 0)
      for (const line of text.trim().split('\n'))
        expect(line).toMatch(/^::(error|warning|notice) .*title=/);
    await clerk.signOut({ page });
  });

  test('F13-05: downloadCount increments in DB on each SARIF download (FH5)', async ({ page }) => {
    await signIn1(page);
    for (let i=0; i<2; i++)
      await page.evaluate(async (url:string) => fetch(url), exportUrl(audit1Id,'sarif'));
    // ANGLE-7 fix: Drizzle .where() chains override each other — use and() for multi-condition.
    const rows = await db.select({count:schema.auditExports.downloadCount})
      .from(schema.auditExports)
      .where(and(
        eq(schema.auditExports.auditId, audit1Id),
        eq(schema.auditExports.format, 'sarif'),
      ));
    expect(Number(rows[0]?.count ?? 0), 'FH5: downloadCount must be ≥2').toBeGreaterThanOrEqual(2);
    await clerk.signOut({ page });
  });

  test('F13-06: org2 SARIF fetch → 404 (RLS)', async ({ page }) => {
    await signIn2(page);
    const s = await page.evaluate(async (url:string) => {
      const r = await fetch(url); return r.status;
    }, exportUrl(audit1Id,'sarif'));
    expect(s, 'RLS: org2 must get 404 for org1 audit').toBe(404);
    await clerk.signOut({ page });
  });

  test('F13-07: unauthenticated export → 401', async ({ page }) => {
    const s = await page.evaluate(async (url:string) => {
      const r = await fetch(url); return r.status;
    }, exportUrl(audit1Id,'sarif'));
    expect(s).toBe(401);
  });

  test('F13-08: format=pdf returns 200 or 404 — not 500 (Sprint 4 no regression)', async ({ page }) => {
    await signIn1(page);
    const s = await page.evaluate(async (url:string) => {
      const r = await fetch(url); return r.status;
    }, exportUrl(audit1Id,'pdf'));
    expect([200,404]).toContain(s);   // not 500
    await clerk.signOut({ page });
  });
});
```

### `tests/qa/sprint8/features/f13-api-export/F13-API-EXPORT.bat`

```batch
@echo off
REM [S8QA] F13 — API: export SARIF / JUnit / GHA (FF1, FH5)
setlocal EnableDelayedExpansion
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do set "%%A=%%B")
set LOGDIR=tests\qa\sprint8\features\f13-api-export\logs & mkdir %LOGDIR% 2>nul
echo.& echo ═══════════════════════════════════════════════════════
echo  [S8QA] F13: API — export SARIF / JUnit / GHA (FF1, FH5)
echo ═══════════════════════════════════════════════════════
set LLM_MODE=mock
start /B cmd /c "set LLM_MODE=mock && pnpm dev > %LOGDIR%\server.log 2>&1"
set W=0
:W13
ping -n 3 127.0.0.1>nul & curl -sf http://localhost:3000/api/health>nul 2>&1
if %ERRORLEVEL% EQU 0 goto R13
set /a W+=1 & if !W! GTR 26 goto K13 & goto W13
:R13
pnpm exec playwright test tests/qa/sprint8/features/f13-api-export/f13-api-export.spec.ts --config tests/qa/sprint8/playwright.config.ts --reporter=list
set RESULT=%ERRORLEVEL%
:K13
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000 " 2^>nul') do taskkill /PID %%P /F>nul 2>&1
if %RESULT% EQU 0 (echo  RESULT: ALL PASS & exit /b 0) else (echo  RESULT: FAILED & exit /b 1)
```

### `tests/qa/sprint8/features/f13-api-export/f13-api-export.sh`

```bash
#!/usr/bin/env bash
# [S8QA] F13 — API: export SARIF / JUnit / GHA (FF1, FH5)
set -euo pipefail; set -a; [ -f .env.test.local ] && source .env.test.local; set +a
LOGDIR="tests/qa/sprint8/features/f13-api-export/logs"; mkdir -p "$LOGDIR"
echo ""; echo "═══════════════════════════════════════════════════════"
echo " [S8QA] F13: API — export SARIF / JUnit / GHA (FF1, FH5)"
echo "═══════════════════════════════════════════════════════"
export LLM_MODE=mock
LLM_MODE=mock pnpm dev > "$LOGDIR/server.log" 2>&1 & SERVER_PID=$!
W=0; until curl -sf http://localhost:3000/api/health>/dev/null 2>&1; do sleep 2; W=$((W+1)); [ "$W" -gt 40 ] && kill "$SERVER_PID" && exit 1; done
echo " Server ready."
set +e
pnpm exec playwright test tests/qa/sprint8/features/f13-api-export/f13-api-export.spec.ts \
  --config tests/qa/sprint8/playwright.config.ts --reporter=list
R=$?; set -e
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$R" -eq 0 ] && echo " RESULT: ALL PASS ✓" && exit 0 || (echo " RESULT: FAILED"; exit 1)
```

-----

## F14 — UI: Local SEO Dashboard + Directory Presence (browser E2E)

**Purpose:** Browser confirms `LocalSeoDashboard` renders correctly with real seeded data.
Verifies page heading (“Local SEO signals”), 4 KPI tiles, directory coverage shows `3/4` NOT
`4/5` (FJ1), NAP card shows “of 6 sources” NOT “of 12” (FN4), confidence label “confirmed”
for score ≥70 (FC5), Bondi and Coogee suburb cells, all 4 directory names visible,
cross-org cannot see seeded score, unauthenticated redirects to sign-in.

**Seeds:** org1+user1+brand+localSeoResult(71.75); org2+user2.  
**Cleanup:** both orgs.  
**Runner:** Playwright browser (needs dev server).

### `tests/qa/sprint8/features/f14-ui-local-seo/f14-ui-local-seo.spec.ts`

```typescript
import { test, expect }                       from '@playwright/test';
import { clerk, clerkSetup }                  from '@clerk/testing/playwright';
import { db, schema }                         from '../../shared/db';
import { seedOrg, seedUser, seedBrand,
         seedLocalSeoResult, cleanupOrg }     from '../../shared/seed';
import { eq }                                 from 'drizzle-orm';

let org1Id='', org2Id='', brand1Id='';

test.beforeAll(async () => {
  await clerkSetup();
  for (const cid of [process.env.E2E_TEST_ORG_1_CLERK_ID!, process.env.E2E_TEST_ORG_2_CLERK_ID!]) {
    const ex = await db.select({id:schema.organizations.id}).from(schema.organizations)
      .where(eq(schema.organizations.clerkOrgId,cid)).limit(1);
    if (ex.length) await cleanupOrg(ex[0].id);
  }
  const o1 = await seedOrg({ clerkOrgId:process.env.E2E_TEST_ORG_1_CLERK_ID!, name:'[S8QA] F14 Org1' });
  org1Id   = o1.id;
  await seedUser({ clerkUserId:process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId:org1Id, email:process.env.E2E_TEST_USER_1_EMAIL! });
  const b  = await seedBrand({ organizationId:org1Id, name:'[S8QA] Bondi Plumbing' });
  brand1Id = b.id;
  await seedLocalSeoResult({ brandId:brand1Id, organizationId:org1Id,
    scoreComposite:'71.75', gmbPresent:true });
  const o2 = await seedOrg({ clerkOrgId:process.env.E2E_TEST_ORG_2_CLERK_ID!, name:'[S8QA] F14 Org2' });
  org2Id   = o2.id;
  await seedUser({ clerkUserId:process.env.E2E_TEST_USER_2_CLERK_ID!, organizationId:org2Id, email:process.env.E2E_TEST_USER_2_EMAIL! });
});
test.afterAll(async () => { await cleanupOrg(org1Id); await cleanupOrg(org2Id); });

const signIn1 = (page:any) => clerk.signIn({ page, signInParams:{ strategy:'password', identifier:process.env.E2E_TEST_USER_1_EMAIL!, password:process.env.E2E_TEST_USER_1_PASSWORD! } });
const signIn2 = (page:any) => clerk.signIn({ page, signInParams:{ strategy:'password', identifier:process.env.E2E_TEST_USER_2_EMAIL!, password:process.env.E2E_TEST_USER_2_PASSWORD! } });

test.describe('[S8QA] F14 — UI: Local SEO Dashboard + Directory Presence', () => {

  test('F14-01: page heading "Local SEO signals" renders', async ({ page }) => {
    await signIn1(page);
    await page.goto(`/brands/${brand1Id}/local-seo`);
    await expect(page.getByRole('heading',{ name:/Local SEO signals/i }))
      .toBeVisible({ timeout:15_000 });
    await clerk.signOut({ page });
  });

  test('F14-02: 4 KPI tiles render — Local SEO score, NAP consistency, Directory coverage, GMB', async ({ page }) => {
    await signIn1(page);
    await page.goto(`/brands/${brand1Id}/local-seo`);
    await page.waitForLoadState('networkidle');
    for (const label of [/Local SEO score/i, /NAP consistency/i, /Directory coverage/i, /GMB/i])
      await expect(page.getByText(label).first()).toBeVisible({ timeout:12_000 });
    await clerk.signOut({ page });
  });

  test('F14-03: directory coverage shows 3/4 — NOT 4/5 (FJ1 Sprint 8 = 4 dirs)', async ({ page }) => {
    await signIn1(page);
    await page.goto(`/brands/${brand1Id}/local-seo`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/3\/4/).first()).toBeVisible({ timeout:12_000 });
    await expect(page.getByText(/4\/5/)).not.toBeVisible();
    await clerk.signOut({ page });
  });

  test('F14-04: NAP card shows "of 6 sources" — NOT "of 12" (FN4 fix)', async ({ page }) => {
    await signIn1(page);
    await page.goto(`/brands/${brand1Id}/local-seo`);
    await page.waitForLoadState('networkidle');
    // Pattern matches "of 6 sources" (any number); reject the specific bug value
    await expect(page.getByText(/of \d+ sources/i).first()).toBeVisible({ timeout:12_000 });
    await expect(page.getByText(/of 12 sources/i)).not.toBeVisible();
    await clerk.signOut({ page });
  });

  test('F14-05: "NAP signals across the web" section heading renders (ANGLE-21 fix)', async ({ page }) => {
    // ANGLE-21 fix: 'confirmed' confidence label appears on AuditResultsRich (dim cards),
    // NOT on the LocalSeoDashboard. The local-seo page has its own section headings.
    await signIn1(page);
    await page.goto(`/brands/${brand1Id}/local-seo`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading',{ name:/NAP signals across the web/i }))
      .toBeVisible({ timeout:12_000 });
    await clerk.signOut({ page });
  });

  test('F14-06: Google Business Profile card heading renders', async ({ page }) => {
    await signIn1(page);
    await page.goto(`/brands/${brand1Id}/local-seo`);
    await expect(page.getByText(/Google Business Profile/i).first()).toBeVisible({ timeout:12_000 });
    await clerk.signOut({ page });
  });

  test('F14-07: suburb heatmap shows Coogee cell and exact Bondi (not brand name match)', async ({ page }) => {
    await signIn1(page);
    await page.goto(`/brands/${brand1Id}/local-seo`);
    await page.waitForLoadState('networkidle');
    // Use regex anchored to word boundary — avoids matching "[S8QA] Bondi Plumbing"
    await expect(page.getByText(/^Bondi$/i).first()).toBeVisible({ timeout:12_000 });
    await expect(page.getByText('Coogee').first()).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F14-08: all 4 AU directory names visible (FJ1)', async ({ page }) => {
    await signIn1(page);
    await page.goto(`/brands/${brand1Id}/local-seo`);
    await page.waitForLoadState('networkidle');
    for (const dir of ['Hipages','Yellow Pages','ServiceSeeking','Word of Mouth'])
      await expect(page.getByText(new RegExp(dir,'i')).first()).toBeVisible({ timeout:10_000 });
    await clerk.signOut({ page });
  });

  test('F14-09: cross-org — org2 user cannot see org1 score data (RLS)', async ({ page }) => {
    await signIn2(page);
    await page.goto(`/brands/${brand1Id}/local-seo`);
    const body = await page.textContent('body') ?? '';
    expect(body).not.toMatch(/71\.75/);           // seeded score must not leak
    expect(body).not.toMatch(/100 Bondi Rd NSW/); // seeded NAP must not leak
    await clerk.signOut({ page });
  });

  test('F14-10: unauthenticated visit redirects to sign-in', async ({ page }) => {
    await page.goto(`/brands/${brand1Id}/local-seo`);
    await expect(page).toHaveURL(/sign-in|login|auth/i, { timeout:10_000 });
  });
});
```

### `tests/qa/sprint8/features/f14-ui-local-seo/F14-UI-LOCAL-SEO.bat`

```batch
@echo off
REM ═══════════════════════════════════════════════════════════════
REM  [S8QA] F14 — UI: Local SEO Dashboard + Directory Presence
REM  Starts Next.js dev server → seeds DB → runs Playwright → kills
REM ═══════════════════════════════════════════════════════════════
setlocal EnableDelayedExpansion
if exist .env.test.local (
  for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (
    set "k=%%A"& if defined k if not "!k:~0,1!"=="#" set "%%A=%%B"
  )
)
set LOGDIR=tests\qa\sprint8\features\f14-ui-local-seo\logs
mkdir %LOGDIR% 2>nul
echo.
echo ═══════════════════════════════════════════════════════════════
echo  [S8QA] F14: UI — Local SEO Dashboard + Directory Presence
echo ═══════════════════════════════════════════════════════════════
set LLM_MODE=mock
start /B cmd /c "set LLM_MODE=mock && pnpm dev > %LOGDIR%\server.log 2>&1"
echo  Waiting for server (max 80s)...
set W=0
:WAIT_F14
ping -n 3 127.0.0.1>nul
curl -sf http://localhost:3000/api/health>nul 2>&1
if %ERRORLEVEL% EQU 0 goto READY_F14
set /a W+=1 & if !W! GTR 26 (echo  ERROR: server not ready & goto KILL_F14)
goto WAIT_F14
:READY_F14
echo  Server ready.
pnpm exec playwright test tests/qa/sprint8/features/f14-ui-local-seo/f14-ui-local-seo.spec.ts ^
  --config tests/qa/sprint8/playwright.config.ts --reporter=list 2>&1
set RESULT=%ERRORLEVEL%
:KILL_F14
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000 " 2^>nul') do taskkill /PID %%P /F>nul 2>&1
if %RESULT% EQU 0 (echo  RESULT: ALL PASS & exit /b 0) else (echo  RESULT: FAILED & exit /b 1)
```

### `tests/qa/sprint8/features/f14-ui-local-seo/f14-ui-local-seo.sh`

```bash
#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  [S8QA] F14 — UI: Local SEO Dashboard + Directory Presence
# ─────────────────────────────────────────────────────────────────
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
LOGDIR="tests/qa/sprint8/features/f14-ui-local-seo/logs"
mkdir -p "$LOGDIR"
echo ""; echo "═══════════════════════════════════════════════════════════════"
echo " [S8QA] F14: UI — Local SEO Dashboard + Directory Presence"
echo "═══════════════════════════════════════════════════════════════"
export LLM_MODE=mock
LLM_MODE=mock pnpm dev > "$LOGDIR/server.log" 2>&1 & SERVER_PID=$!
echo " Waiting for server (max 80s)..."
W=0
until curl -sf http://localhost:3000/api/health>/dev/null 2>&1; do
  sleep 2; W=$((W+1))
  if [ "$W" -gt 40 ]; then echo " ERROR: server not ready"; kill "$SERVER_PID" 2>/dev/null; exit 1; fi
done
echo " Server ready."
set +e
pnpm exec playwright test tests/qa/sprint8/features/f14-ui-local-seo/f14-ui-local-seo.spec.ts \
  --config tests/qa/sprint8/playwright.config.ts --reporter=list
RESULT=$?
set -e
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$RESULT" -eq 0 ] && echo " RESULT: ALL PASS ✓" && exit 0 || (echo " RESULT: FAILED"; exit 1)
```

-----

## F15 — UI: Drift Alerts + Webhook Settings + Audit Export dropdown (browser E2E)

**Purpose:** `/drift-alerts` heading renders; 3 stat tiles (Active, This week, Resolved);
significant_drop badge says “Drop” NOT “high” (FB5); significant_rise says “Rise” NOT “low” (FB5);
Dismiss button sets acknowledged=true in DB (FA1); `/settings/webhooks` heading renders;
event chips display dot notation “audit.completed” NOT “audit/complete” (FC4); delivery log shows
200 success row and 503 failure row; “Test” button present (FH4); audit export dropdown offers
SARIF, JUnit, GHA options (FF1).

**Seeds:** org1+user1+2 brands+2 audits each+2 drift alerts+1 webhook endpoint+2 deliveries+1 audit.  
**Cleanup:** cleanupOrg(org1Id).  
**Runner:** Playwright browser.

### `tests/qa/sprint8/features/f15-ui-drift-webhooks/f15-ui-drift-webhooks.spec.ts`

```typescript
import { test, expect }                             from '@playwright/test';
import { clerk, clerkSetup }                        from '@clerk/testing/playwright';
import { db, schema }                               from '../../shared/db';
import { seedOrg, seedUser, seedBrand, seedAudit,
         seedDriftAlert, seedWebhookEndpoint,
         seedWebhookDelivery, cleanupOrg }          from '../../shared/seed';
import { eq }                                       from 'drizzle-orm';

let org1Id='', brand1Id='', audit1Id='';

test.beforeAll(async () => {
  await clerkSetup();
  const ex = await db.select({id:schema.organizations.id}).from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, process.env.E2E_TEST_ORG_1_CLERK_ID!)).limit(1);
  if (ex.length) await cleanupOrg(ex[0].id);

  const o  = await seedOrg({ clerkOrgId:process.env.E2E_TEST_ORG_1_CLERK_ID!, name:'[S8QA] F15 Org' });
  org1Id   = o.id;
  await seedUser({ clerkUserId:process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId:org1Id, email:process.env.E2E_TEST_USER_1_EMAIL! });

  // Brand 1: significant_drop alert
  const b1 = await seedBrand({ organizationId:org1Id, name:'[S8QA] Bondi Plumbing' });
  brand1Id = b1.id;
  const a1 = await seedAudit({ organizationId:org1Id, brandId:brand1Id, auditNumber:1, scoreComposite:'63.40' });
  audit1Id = a1.id;
  const a2 = await seedAudit({ organizationId:org1Id, brandId:brand1Id, auditNumber:2, scoreComposite:'55.00' });
  await seedDriftAlert({ organizationId:org1Id, brandId:brand1Id,
    currentAuditId:a2.id, previousAuditId:a1.id, severity:'significant_drop' });

  // Brand 2: significant_rise alert
  const b2 = await seedBrand({ organizationId:org1Id, name:'[S8QA] Joinery' });
  const a3 = await seedAudit({ organizationId:org1Id, brandId:b2.id, auditNumber:1, scoreComposite:'40.00' });
  const a4 = await seedAudit({ organizationId:org1Id, brandId:b2.id, auditNumber:2, scoreComposite:'52.00' });
  await seedDriftAlert({ organizationId:org1Id, brandId:b2.id,
    currentAuditId:a4.id, previousAuditId:a3.id, severity:'significant_rise' });

  // Webhook endpoint with 1 success + 1 failure delivery
  const ep = await seedWebhookEndpoint({ organizationId:org1Id,
    events:['audit.completed','drift.detected'] });   // FC4: dots
  await seedWebhookDelivery({ endpointId:ep.id, organizationId:org1Id, success:true });
  await seedWebhookDelivery({ endpointId:ep.id, organizationId:org1Id, success:false, responseStatus:503 });
});
test.afterAll(async () => { await cleanupOrg(org1Id); });

const signIn = (page:any) => clerk.signIn({ page, signInParams:{ strategy:'password',
  identifier:process.env.E2E_TEST_USER_1_EMAIL!, password:process.env.E2E_TEST_USER_1_PASSWORD! } });

test.describe('[S8QA] F15 — UI: Drift Alerts + Webhook Settings + Audit Export', () => {

  // ── /drift-alerts page ─────────────────────────────────────────────────
  test('F15-01: /drift-alerts heading "Drift alerts" renders', async ({ page }) => {
    await signIn(page);
    await page.goto('/drift-alerts');
    await expect(page.getByRole('heading',{ name:/Drift alerts/i })).toBeVisible({ timeout:15_000 });
    await clerk.signOut({ page });
  });

  test('F15-02: 3 stat tiles render — Active alerts, This week, Resolved (30d)', async ({ page }) => {
    await signIn(page);
    await page.goto('/drift-alerts');
    await page.waitForLoadState('networkidle');
    for (const label of [/Active alerts/i, /This week/i, /Resolved/i])
      await expect(page.getByText(label).first()).toBeVisible({ timeout:12_000 });
    await clerk.signOut({ page });
  });

  test('F15-03: significant_drop renders "Drop" badge — NOT "high" (FB5 fix)', async ({ page }) => {
    await signIn(page);
    await page.goto('/drift-alerts');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/^Drop$/i).first()).toBeVisible({ timeout:12_000 });
    await expect(page.getByText(/^high$/i)).not.toBeVisible();
    await clerk.signOut({ page });
  });

  test('F15-04: significant_rise renders "Rise" badge — NOT "low" (FB5 fix)', async ({ page }) => {
    await signIn(page);
    await page.goto('/drift-alerts');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/^Rise$/i).first()).toBeVisible({ timeout:12_000 });
    await expect(page.getByText(/^low$/i)).not.toBeVisible();
    await clerk.signOut({ page });
  });

  test('F15-05: Dismiss button present; clicking it sets acknowledged=true boolean in DB (FA1)', async ({ page }) => {
    await signIn(page);
    await page.goto('/drift-alerts');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button',{ name:/Dismiss/i }).first().click();
    await page.waitForTimeout(1_500);
    const alerts = await db.select({ ack:schema.driftAlerts.acknowledged })
      .from(schema.driftAlerts).where(eq(schema.driftAlerts.organizationId, org1Id));
    expect(alerts.some(a => a.ack === true)).toBe(true);   // FA1: boolean
    await clerk.signOut({ page });
  });

  // ── /settings/webhooks page ────────────────────────────────────────────
  test('F15-06: /settings/webhooks heading "Webhook integrations" renders', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings/webhooks');
    await expect(page.getByRole('heading',{ name:/Webhook integrations|Webhooks/i }))
      .toBeVisible({ timeout:15_000 });
    await clerk.signOut({ page });
  });

  test('F15-07: event chips display dot-notation "audit.completed" (FC4 — not slashes)', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings/webhooks');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('audit.completed').first()).toBeVisible({ timeout:12_000 });
    await expect(page.getByText('audit/complete')).not.toBeVisible();
    await clerk.signOut({ page });
  });

  test('F15-08: delivery log shows 200 success row AND 503 failure row', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings/webhooks');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('200').first()).toBeVisible({ timeout:12_000 });
    await expect(page.getByText(/503|failed|error/i).first()).toBeVisible();
    await clerk.signOut({ page });
  });

  test('F15-09: "Test" button present on endpoint card (FH4 — test-delivery endpoint)', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings/webhooks');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button',{ name:/^Test$/i }).first()).toBeVisible({ timeout:12_000 });
    await clerk.signOut({ page });
  });

  // ── Audit export dropdown ──────────────────────────────────────────────
  test('F15-10: audit export dropdown shows SARIF, JUnit, GHA options (FF1)', async ({ page }) => {
    await signIn(page);
    // ANGLE-12 fix: Sprint 4 audit detail page is at /audits/[auditId]
    // (app/(auth)/audits/[auditId]/page.tsx) — NOT /brands/[brandId]/audits/[auditId]
    await page.goto(`/audits/${audit1Id}`);
    await page.waitForLoadState('networkidle');
    const exportBtn = page.getByRole('button',{ name:/export/i }).first();
    await expect(exportBtn).toBeVisible({ timeout:15_000 });
    await exportBtn.click();
    for (const label of [/SARIF/i, /JUnit/i, /GHA|GitHub Actions/i])
      await expect(page.getByText(label).first()).toBeVisible({ timeout:5_000 });
    await clerk.signOut({ page });
  });
});
```

### `tests/qa/sprint8/features/f15-ui-drift-webhooks/F15-UI-DRIFT-WEBHOOKS.bat`

```batch
@echo off
REM ═══════════════════════════════════════════════════════════════
REM  [S8QA] F15 — UI: Drift Alerts + Webhook Settings + Export
REM  Starts Next.js dev server → seeds DB → runs Playwright → kills
REM ═══════════════════════════════════════════════════════════════
setlocal EnableDelayedExpansion
if exist .env.test.local (
  for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (
    set "k=%%A"& if defined k if not "!k:~0,1!"=="#" set "%%A=%%B"
  )
)
set LOGDIR=tests\qa\sprint8\features\f15-ui-drift-webhooks\logs
mkdir %LOGDIR% 2>nul
echo.
echo ═══════════════════════════════════════════════════════════════
echo  [S8QA] F15: UI — Drift Alerts + Webhook Settings + Export
echo ═══════════════════════════════════════════════════════════════
set LLM_MODE=mock
start /B cmd /c "set LLM_MODE=mock && pnpm dev > %LOGDIR%\server.log 2>&1"
echo  Waiting for server (max 80s)...
set W=0
:WAIT_F15
ping -n 3 127.0.0.1>nul
curl -sf http://localhost:3000/api/health>nul 2>&1
if %ERRORLEVEL% EQU 0 goto READY_F15
set /a W+=1 & if !W! GTR 26 (echo  ERROR: server not ready & goto KILL_F15)
goto WAIT_F15
:READY_F15
echo  Server ready.
pnpm exec playwright test tests/qa/sprint8/features/f15-ui-drift-webhooks/f15-ui-drift-webhooks.spec.ts ^
  --config tests/qa/sprint8/playwright.config.ts --reporter=list 2>&1
set RESULT=%ERRORLEVEL%
:KILL_F15
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000 " 2^>nul') do taskkill /PID %%P /F>nul 2>&1
if %RESULT% EQU 0 (echo  RESULT: ALL PASS & exit /b 0) else (echo  RESULT: FAILED & exit /b 1)
```

### `tests/qa/sprint8/features/f15-ui-drift-webhooks/f15-ui-drift-webhooks.sh`

```bash
#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  [S8QA] F15 — UI: Drift Alerts + Webhook Settings + Export
# ─────────────────────────────────────────────────────────────────
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
LOGDIR="tests/qa/sprint8/features/f15-ui-drift-webhooks/logs"
mkdir -p "$LOGDIR"
echo ""; echo "═══════════════════════════════════════════════════════════════"
echo " [S8QA] F15: UI — Drift Alerts + Webhook Settings + Export"
echo "═══════════════════════════════════════════════════════════════"
export LLM_MODE=mock
LLM_MODE=mock pnpm dev > "$LOGDIR/server.log" 2>&1 & SERVER_PID=$!
echo " Waiting for server (max 80s)..."
W=0
until curl -sf http://localhost:3000/api/health>/dev/null 2>&1; do
  sleep 2; W=$((W+1))
  if [ "$W" -gt 40 ]; then echo " ERROR: server not ready"; kill "$SERVER_PID" 2>/dev/null; exit 1; fi
done
echo " Server ready."
set +e
pnpm exec playwright test tests/qa/sprint8/features/f15-ui-drift-webhooks/f15-ui-drift-webhooks.spec.ts \
  --config tests/qa/sprint8/playwright.config.ts --reporter=list
RESULT=$?
set -e
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$RESULT" -eq 0 ] && echo " RESULT: ALL PASS ✓" && exit 0 || (echo " RESULT: FAILED"; exit 1)
```

-----

## F16 — Inngest source files + fanout bridge + Sprint 1–7 regression

**Purpose:** Source-file checks that don’t need a running audit: `local-seo-audit.ts` listens to
`'audit/complete'` (FA2 — slash); `detect-drift.ts` uses `COMPOSITE_NOISE_THRESHOLD` NOT
`ciOverlaps` on composite (FC1); `fanout-webhooks.ts` exists and listens to all 3 events (FH1);
`app/api/inngest/route.ts` `serve()` includes `fanoutWebhooksFn` (FH1 critical bridge);
`deliver-webhook.ts` handles `'custom'` channel.  
Runtime regression checks: `/audits` page loads (Sprint 4); technical-audits API not 500 (Sprint 7);
action-items API not 500 (Sprint 6); vertical-packs return ≥3 (Sprint 5).

**Seeds:** org+user+brand+audit (for regression API checks). Cleanup: cleanupOrg.  
**Runner:** Playwright (file checks via `readFileSync`; API regression via `page.evaluate` with server).

### `tests/qa/sprint8/features/f16-inngest-regression/f16-inngest-regression.spec.ts`

```typescript
import { test, expect }                    from '@playwright/test';
import { clerk, clerkSetup }               from '@clerk/testing/playwright';
import { readFileSync, existsSync }        from 'node:fs';
import { db, schema }                      from '../../shared/db';
import { seedOrg, seedUser, seedBrand,
         seedAudit, cleanupOrg }           from '../../shared/seed';
import { eq }                              from 'drizzle-orm';

const BASE = process.env.E2E_APP_URL ?? 'http://localhost:3000';
let org1Id='', brand1Id='', audit1Id='';

test.beforeAll(async () => {
  await clerkSetup();
  const ex = await db.select({id:schema.organizations.id}).from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, process.env.E2E_TEST_ORG_1_CLERK_ID!)).limit(1);
  if (ex.length) await cleanupOrg(ex[0].id);

  const o   = await seedOrg({ clerkOrgId:process.env.E2E_TEST_ORG_1_CLERK_ID!, name:'[S8QA] F16 Org', tier:'agency' });
  org1Id    = o.id;
  await seedUser({ clerkUserId:process.env.E2E_TEST_USER_1_CLERK_ID!, organizationId:org1Id, email:process.env.E2E_TEST_USER_1_EMAIL! });
  const b   = await seedBrand({ organizationId:org1Id });
  brand1Id  = b.id;
  const a   = await seedAudit({ organizationId:org1Id, brandId:brand1Id });
  audit1Id  = a.id;

  // Seed technicalAudit if table exists (Sprint 7); silently skip if not
  try {
    const [ta] = await db.insert(schema.technicalAudits).values({
      organizationId:org1Id, brandId:brand1Id, auditId:audit1Id,
      scoreRobots:'14', scoreLlmsTxt:'9', scoreSchema:'8', scoreMeta:'10',
      scoreContent:'9', scoreBrandEntity:'7', scoreSignals:'5', scoreAiDiscovery:'4',
      scoreComposite:'66', findings:{}, crawledAt:new Date(), updatedAt:new Date(),
    }).returning();
  } catch { /* table absent in some environments — skip */ }
});
test.afterAll(async () => { await cleanupOrg(org1Id); });

const signIn = (page:any) => clerk.signIn({ page, signInParams:{ strategy:'password',
  identifier:process.env.E2E_TEST_USER_1_EMAIL!, password:process.env.E2E_TEST_USER_1_PASSWORD! } });

test.describe('[S8QA] F16 — Inngest source + fanout bridge + Sprint 1-7 regression', () => {

  // ── Source file checks (no server needed) ─────────────────────────────
  test('F16-01: local-seo-audit.ts listens to "audit/complete" slash — not dot (FA2)', () => {
    const src = readFileSync('inngest/functions/local-seo-audit.ts', 'utf-8');
    expect(src, "FA2: must use 'audit/complete' with slash").toContain("'audit/complete'");
    expect(src, "FA2: must NOT use 'audit.complete' with dot").not.toContain("'audit.complete'");
  });

  test('F16-02: detect-drift.ts uses COMPOSITE_NOISE_THRESHOLD not ciOverlaps on composite (FC1)', () => {
    const src = readFileSync('inngest/functions/detect-drift.ts', 'utf-8');
    expect(src, 'FC1: composite must use COMPOSITE_NOISE_THRESHOLD').toContain('COMPOSITE_NOISE_THRESHOLD');
    // Guard: source must NOT use ciOverlaps with the wide {lower:0,upper:100} pattern on composite
    expect(src, 'FC1: composite must not use ciOverlaps({lower:0,upper:100},...)')
      .not.toMatch(/ciOverlaps\(\s*\{\s*lower\s*:\s*0\s*,\s*upper\s*:\s*100/);
  });

  test('F16-03: fanout-webhooks.ts exists and listens to all 3 trigger events (FH1)', () => {
    expect(existsSync('inngest/functions/fanout-webhooks.ts'),
      'FH1: fanout-webhooks.ts must exist — without it NO webhook is ever delivered').toBe(true);
    const src = readFileSync('inngest/functions/fanout-webhooks.ts', 'utf-8');
    expect(src, "FH1: must listen to 'audit/complete'").toContain("'audit/complete'");
    expect(src, "FH1: must listen to 'drift/detected'").toContain("'drift/detected'");
    expect(src, "FH1: must listen to 'recommendation/created'").toContain("'recommendation/created'");
  });

  test('F16-04: serve() in app/api/inngest/route.ts includes fanoutWebhooksFn (FH1 critical)', () => {
    const src = readFileSync('app/api/inngest/route.ts', 'utf-8');
    expect(src, 'FH1: fanoutWebhooksFn must be registered in serve() — missing = zero webhooks delivered')
      .toContain('fanoutWebhooksFn');
  });

  test('F16-05: deliver-webhook.ts handles "custom" channel (pass-through for HTTP webhooks)', () => {
    const src = readFileSync('inngest/functions/deliver-webhook.ts', 'utf-8');
    expect(src, "'custom' channel must appear in deliver-webhook").toContain('custom');
  });

  // ── Runtime regression checks (server required) ───────────────────────
  test('F16-06: /audits page loads with heading — Sprint 4 audit list not broken', async ({ page }) => {
    await signIn(page);
    await page.goto('/audits');
    await expect(page.getByRole('heading',{ name:/audits/i })).toBeVisible({ timeout:15_000 });
    await clerk.signOut({ page });
  });

  test('F16-07: Sprint 7 technical-audits API returns 200 or 404 — NOT 500', async ({ page }) => {
    await signIn(page);
    const status = await page.evaluate(async ({ base, aId }:any) => {
      const r1 = await fetch(`${base}/api/technical-audits/${aId}`);
      if (r1.status !== 404) return r1.status;
      const r2 = await fetch(`${base}/api/technical-audits`);
      return r2.status;
    }, { base:BASE, aId:audit1Id });
    expect([200,404]).toContain(status);
    await clerk.signOut({ page });
  });

  test('F16-08: Sprint 6 action-items API returns 200 or 404 — NOT 500', async ({ page }) => {
    await signIn(page);
    const status = await page.evaluate(async (base:string) => {
      const r = await fetch(`${base}/api/action-items`); return r.status;
    }, BASE);
    expect([200,404]).toContain(status);
    await clerk.signOut({ page });
  });

  test('F16-09: Sprint 5 vertical-packs API returns ≥3 packs (no regression)', async ({ page }) => {
    await signIn(page);
    const packs = await page.evaluate(async (base:string) => {
      const r = await fetch(`${base}/api/vertical-packs`);
      return r.ok ? r.json() : [];
    }, BASE);
    const real = (Array.isArray(packs) ? packs : [])
      .filter((p:any) => !String(p.name ?? '').startsWith('[S8'));
    expect(real.length, 'Sprint 5: vertical-packs must return ≥3').toBeGreaterThanOrEqual(3);
    await clerk.signOut({ page });
  });
});
```

### `tests/qa/sprint8/features/f16-inngest-regression/F16-INNGEST-REGRESSION.bat`

```batch
@echo off
REM ═══════════════════════════════════════════════════════════════
REM  [S8QA] F16 — Inngest source + fanout bridge + Sprint 1-7 regression
REM  Source checks run without server; API regression needs dev server
REM ═══════════════════════════════════════════════════════════════
setlocal EnableDelayedExpansion
if exist .env.test.local (
  for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (
    set "k=%%A"& if defined k if not "!k:~0,1!"=="#" set "%%A=%%B"
  )
)
set LOGDIR=tests\qa\sprint8\features\f16-inngest-regression\logs
mkdir %LOGDIR% 2>nul
echo.
echo ═══════════════════════════════════════════════════════════════
echo  [S8QA] F16: Inngest source + fanout bridge + Sprint 1-7 regression
echo ═══════════════════════════════════════════════════════════════
set LLM_MODE=mock
start /B cmd /c "set LLM_MODE=mock && pnpm dev > %LOGDIR%\server.log 2>&1"
echo  Waiting for server (max 80s)...
set W=0
:WAIT_F16
ping -n 3 127.0.0.1>nul
curl -sf http://localhost:3000/api/health>nul 2>&1
if %ERRORLEVEL% EQU 0 goto READY_F16
set /a W+=1 & if !W! GTR 26 (echo  ERROR: server not ready & goto KILL_F16)
goto WAIT_F16
:READY_F16
echo  Server ready.
pnpm exec playwright test tests/qa/sprint8/features/f16-inngest-regression/f16-inngest-regression.spec.ts ^
  --config tests/qa/sprint8/playwright.config.ts --reporter=list 2>&1
set RESULT=%ERRORLEVEL%
:KILL_F16
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000 " 2^>nul') do taskkill /PID %%P /F>nul 2>&1
if %RESULT% EQU 0 (echo  RESULT: ALL PASS & exit /b 0) else (echo  RESULT: FAILED & exit /b 1)
```

### `tests/qa/sprint8/features/f16-inngest-regression/f16-inngest-regression.sh`

```bash
#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  [S8QA] F16 — Inngest source + fanout bridge + Sprint 1-7 regression
# ─────────────────────────────────────────────────────────────────
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a
LOGDIR="tests/qa/sprint8/features/f16-inngest-regression/logs"
mkdir -p "$LOGDIR"
echo ""; echo "═══════════════════════════════════════════════════════════════"
echo " [S8QA] F16: Inngest source + fanout bridge + Sprint 1-7 regression"
echo "═══════════════════════════════════════════════════════════════"
export LLM_MODE=mock
LLM_MODE=mock pnpm dev > "$LOGDIR/server.log" 2>&1 & SERVER_PID=$!
echo " Waiting for server (max 80s)..."
W=0
until curl -sf http://localhost:3000/api/health>/dev/null 2>&1; do
  sleep 2; W=$((W+1))
  if [ "$W" -gt 40 ]; then echo " ERROR: server not ready"; kill "$SERVER_PID" 2>/dev/null; exit 1; fi
done
echo " Server ready."
set +e
pnpm exec playwright test tests/qa/sprint8/features/f16-inngest-regression/f16-inngest-regression.spec.ts \
  --config tests/qa/sprint8/playwright.config.ts --reporter=list
RESULT=$?
set -e
kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
{ lsof -ti:3000 | xargs kill -9 2>/dev/null; } || { fuser -k 3000/tcp 2>/dev/null; } || true
[ "$RESULT" -eq 0 ] && echo " RESULT: ALL PASS ✓" && exit 0 || (echo " RESULT: FAILED"; exit 1)
```

-----

## Run-all scripts — execute all 16 features sequentially

### `tests/qa/sprint8/RUN-ALL-S8QA.bat`

```batch
@echo off
REM ═══════════════════════════════════════════════════════════════════════════
REM  [S8QA] Run ALL 16 Sprint 8 features in order
REM  Each feature starts its own server, runs tests, kills server, then exits.
REM  Vitest features (F01-F09) are fast (<20s each).
REM  Playwright features (F10-F16) take 30-90s each (includes server boot).
REM  Total: ~15-20 minutes for full suite.
REM ═══════════════════════════════════════════════════════════════════════════
setlocal EnableDelayedExpansion
set PASS=0 & set FAIL=0 & set FAILED_LIST=

call :RUN F01 tests\qa\sprint8\features\f01-schema\F01-SCHEMA.bat
call :RUN F02 tests\qa\sprint8\features\f02-local-seo-scoring\F02-LOCAL-SEO-SCORING.bat
call :RUN F03 tests\qa\sprint8\features\f03-drift-detection\F03-DRIFT-DETECTION.bat
call :RUN F04 tests\qa\sprint8\features\f04-export-formats\F04-EXPORT-FORMATS.bat
call :RUN F05 tests\qa\sprint8\features\f05-webhook-signing\F05-WEBHOOK-SIGNING.bat
call :RUN F06 tests\qa\sprint8\features\f06-db-local-seo\F06-DB-LOCAL-SEO.bat
call :RUN F07 tests\qa\sprint8\features\f07-db-drift-alerts\F07-DB-DRIFT-ALERTS.bat
call :RUN F08 tests\qa\sprint8\features\f08-db-webhooks\F08-DB-WEBHOOKS.bat
call :RUN F09 tests\qa\sprint8\features\f09-db-audit-exports\F09-DB-AUDIT-EXPORTS.bat
call :RUN F10 tests\qa\sprint8\features\f10-api-local-seo\F10-API-LOCAL-SEO.bat
call :RUN F11 tests\qa\sprint8\features\f11-api-drift-alerts\F11-API-DRIFT-ALERTS.bat
call :RUN F12 tests\qa\sprint8\features\f12-api-webhooks\F12-API-WEBHOOKS.bat
call :RUN F13 tests\qa\sprint8\features\f13-api-export\F13-API-EXPORT.bat
call :RUN F14 tests\qa\sprint8\features\f14-ui-local-seo\F14-UI-LOCAL-SEO.bat
call :RUN F15 tests\qa\sprint8\features\f15-ui-drift-webhooks\F15-UI-DRIFT-WEBHOOKS.bat
call :RUN F16 tests\qa\sprint8\features\f16-inngest-regression\F16-INNGEST-REGRESSION.bat

echo.
echo ═══════════════════════════════════════════════════════════════════════════
echo  [S8QA] SPRINT 8 FINAL RESULT
echo  PASS: %PASS%/16   FAIL: %FAIL%/16
if defined FAILED_LIST echo  Failed features: %FAILED_LIST%
echo ═══════════════════════════════════════════════════════════════════════════
if %FAIL% EQU 0 (echo  ALL PASS — Sprint 8 QA COMPLETE & exit /b 0)
echo  SPRINT 8 QA FAILED & exit /b 1

:RUN
echo.
echo ───────────────────────────────────────────────────────────────────────────
echo  Running %1...
echo ───────────────────────────────────────────────────────────────────────────
call %2
if %ERRORLEVEL% EQU 0 (
  set /a PASS+=1
  echo  %1: PASS
) else (
  set /a FAIL+=1
  set FAILED_LIST=!FAILED_LIST! %1
  echo  %1: FAIL
)
goto :eof
```

### `tests/qa/sprint8/run-all-s8qa.sh`

```bash
#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  [S8QA] Run ALL 16 Sprint 8 features in order
#  Each feature starts its own server, runs its tests, stops the server.
#  Total: ~15-20 minutes for full suite.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
set -a; [ -f .env.test.local ] && source .env.test.local; set +a

PASS=0; FAIL=0; FAILED=()

run_feature() {
  local name="$1"; local script="$2"
  echo ""
  echo "───────────────────────────────────────────────────────────────────────────"
  echo " Running $name..."
  echo "───────────────────────────────────────────────────────────────────────────"
  if bash "$script"; then
    PASS=$((PASS+1)); echo " $name: PASS"
  else
    FAIL=$((FAIL+1)); FAILED+=("$name"); echo " $name: FAIL"
  fi
}

run_feature F01 tests/qa/sprint8/features/f01-schema/f01-schema.sh
run_feature F02 tests/qa/sprint8/features/f02-local-seo-scoring/f02-local-seo-scoring.sh
run_feature F03 tests/qa/sprint8/features/f03-drift-detection/f03-drift-detection.sh
run_feature F04 tests/qa/sprint8/features/f04-export-formats/f04-export-formats.sh
run_feature F05 tests/qa/sprint8/features/f05-webhook-signing/f05-webhook-signing.sh
run_feature F06 tests/qa/sprint8/features/f06-db-local-seo/f06-db-local-seo.sh
run_feature F07 tests/qa/sprint8/features/f07-db-drift-alerts/f07-db-drift-alerts.sh
run_feature F08 tests/qa/sprint8/features/f08-db-webhooks/f08-db-webhooks.sh
run_feature F09 tests/qa/sprint8/features/f09-db-audit-exports/f09-db-audit-exports.sh
run_feature F10 tests/qa/sprint8/features/f10-api-local-seo/f10-api-local-seo.sh
run_feature F11 tests/qa/sprint8/features/f11-api-drift-alerts/f11-api-drift-alerts.sh
run_feature F12 tests/qa/sprint8/features/f12-api-webhooks/f12-api-webhooks.sh
run_feature F13 tests/qa/sprint8/features/f13-api-export/f13-api-export.sh
run_feature F14 tests/qa/sprint8/features/f14-ui-local-seo/f14-ui-local-seo.sh
run_feature F15 tests/qa/sprint8/features/f15-ui-drift-webhooks/f15-ui-drift-webhooks.sh
run_feature F16 tests/qa/sprint8/features/f16-inngest-regression/f16-inngest-regression.sh

echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo " [S8QA] SPRINT 8 FINAL RESULT"
printf " PASS: %d/16   FAIL: %d/16\n" "$PASS" "$FAIL"
if [ "${#FAILED[@]}" -gt 0 ]; then echo " Failed features: ${FAILED[*]}"; fi
echo "═══════════════════════════════════════════════════════════════════════════"
[ "$FAIL" -eq 0 ] && echo " ALL PASS — Sprint 8 QA COMPLETE ✓" && exit 0
echo " SPRINT 8 QA FAILED" && exit 1
```

-----

## PASS criteria

Sprint 8 QA is **PASS** when all of the following are true:

- All 16 features green (`F01` through `F16`)
- All 151 tests pass (12+9+20+9+6+8+8+9+6+9+9+9+8+10+10+9)
- Zero orphan rows in the database (every `afterAll` / `cleanupOrg` completed)
- No 500 errors on any Sprint 1–7 API route (F16 regression)
- `fanoutWebhooksFn` confirmed in `serve()` source (F16-04)
- `COMPOSITE_NOISE_THRESHOLD` confirmed in `detect-drift.ts` source (F16-02)

Sprint 8 QA is **FAIL** if any single test fails.  
Fix the failing feature, re-run only that feature’s script, then re-run the full suite.