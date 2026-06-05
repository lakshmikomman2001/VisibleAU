# VisibleAU — Sprint 10 Backend E2E Tests

**Sprint:** 10 — Onboarding · Sample Audit · Stripe Billing  
**Runner:** vitest (Node only — no browser, no dev server)  
**Approach:** Route handlers imported and called directly with `NextRequest`.
Auth mocked via `vi.mock`. Real test DB used for all assertions.
Every test seeds its own rows and deletes them on completion — pass or fail.

-----

## 1. Prerequisites

```bash
# Copy once — fill in your test DB and Stripe test keys
cp .env.example .env.test.local
```

```bash
# .env.test.local
DATABASE_URL=postgresql://postgres:secret@localhost:5432/visibleau_test
DIRECT_URL=postgresql://postgres:secret@localhost:5432/visibleau_test
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
STRIPE_PRICE_STARTER_MONTHLY=price_test_starter_monthly
STRIPE_PRICE_STARTER_ANNUAL=price_test_starter_annual
STRIPE_PRICE_GROWTH_MONTHLY=price_test_growth_monthly
STRIPE_PRICE_GROWTH_ANNUAL=price_test_growth_annual
STRIPE_PRICE_AGENCY_MONTHLY=price_test_agency_monthly
STRIPE_PRICE_AGENCY_ANNUAL=price_test_agency_annual
STRIPE_PRICE_AGENCY_PRO_MONTHLY=price_test_agency_pro_monthly
STRIPE_PRICE_AGENCY_PRO_ANNUAL=price_test_agency_pro_annual
STRIPE_PRICE_ONE_OFF_AUDIT=price_test_one_off_299
UPSTASH_REDIS_REST_URL=https://test.upstash.io
UPSTASH_REDIS_REST_TOKEN=test_token
NEXT_PUBLIC_BASE_URL=http://localhost:3000
LLM_MODE=mock
```

Run migrations against the test DB before the first run:

```bash
dotenv -e .env.test.local -- pnpm drizzle-kit migrate
```

-----

## 2. vitest config

Create `vitest.config.backend-e2e.ts` at the repo root:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    name:        'backend-e2e',
    environment: 'node',
    globals:     true,
    setupFiles:  ['./tests/backend-e2e/setup.ts'],
    include:     ['./tests/backend-e2e/**/*.test.ts'],
    sequence:    { concurrent: false },   // serial — shared DB
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
```

-----

## 3. Shared setup

### `tests/backend-e2e/setup.ts`

```typescript
import { config } from 'dotenv';
config({ path: '.env.test.local' });
```

### `tests/backend-e2e/helpers/db.ts`

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres     from 'postgres';
import * as schema  from '@/db/schema';

const client = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { max: 3 });
export const db = drizzle(client, { schema });
export { schema };
```

### `tests/backend-e2e/helpers/seed.ts`

```typescript
import { db, schema }  from './db';
import { eq, inArray } from 'drizzle-orm';

// ── Seed ────────────────────────────────────────────────────────────────────────
export async function seedOrg(clerkOrgId: string, opts: {
  name?: string; tier?: string; metadata?: Record<string, unknown>; slug?: string | null;
} = {}) {
  const [o] = await db.insert(schema.organizations).values({
    clerkOrgId,
    name:     opts.name ?? '[E2E] Org',
    region:   'au',
    tier:     opts.tier ?? 'free',
    metadata: opts.metadata ?? {},
    slug:     opts.slug ?? null,
    onboardingComplete: false,
  }).onConflictDoUpdate({
    target: schema.organizations.clerkOrgId,
    set: { name: opts.name ?? '[E2E] Org', tier: opts.tier ?? 'free', metadata: opts.metadata ?? {} },
  }).returning();
  return o;
}

export async function seedUser(clerkUserId: string, organizationId: string, email: string) {
  const [u] = await db.insert(schema.users).values({
    clerkUserId, organizationId, email, name: '[E2E]', role: 'owner',
  }).onConflictDoUpdate({
    target: schema.users.clerkUserId,
    set:    { organizationId },
  }).returning();
  return u;
}

export async function seedSubscription(organizationId: string, opts: {
  stripeSubscriptionId?: string; stripePriceId?: string; tier?: string;
  status?: string; cancelAtPeriodEnd?: boolean;
} = {}) {
  const ts = Date.now();
  const [s] = await db.insert(schema.subscriptions).values({
    organizationId,
    stripeCustomerId:     `cus_e2e_${ts}`,
    stripeSubscriptionId: opts.stripeSubscriptionId ?? `sub_e2e_${ts}`,
    stripePriceId:        opts.stripePriceId ?? process.env.STRIPE_PRICE_GROWTH_MONTHLY!,
    tier:                 opts.tier ?? 'growth',
    billingInterval:      'monthly',
    status:               opts.status ?? 'active',
    cancelAtPeriodEnd:    opts.cancelAtPeriodEnd ?? false,
    currentPeriodStart:   new Date(),
    currentPeriodEnd:     new Date(Date.now() + 30 * 86_400_000),
    metadata:             {},
    updatedAt:            new Date(),
  }).onConflictDoUpdate({
    target: schema.subscriptions.organizationId,
    set: { tier: opts.tier ?? 'growth', status: opts.status ?? 'active', updatedAt: new Date() },
  }).returning();
  return s;
}

export async function seedProcessedEvent(stripeEventId: string, type: string) {
  const [e] = await db.insert(schema.processedWebhookEvents)
    .values({ stripeEventId, type, processedAt: new Date() }).returning();
  return e;
}

// ── Cleanup ──────────────────────────────────────────────────────────────────────
export async function cleanupOrg(orgId: string) {
  await db.delete(schema.subscriptions)
    .where(eq(schema.subscriptions.organizationId, orgId)).catch(() => {});
  const brands = await db.select({ id: schema.brands.id })
    .from(schema.brands).where(eq(schema.brands.organizationId, orgId));
  if (brands.length)
    await db.delete(schema.audits)
      .where(inArray(schema.audits.brandId, brands.map(b => b.id))).catch(() => {});
  await db.delete(schema.brands)
    .where(eq(schema.brands.organizationId, orgId)).catch(() => {});
  await db.delete(schema.users)
    .where(eq(schema.users.organizationId, orgId)).catch(() => {});
  await db.delete(schema.organizations)
    .where(eq(schema.organizations.id, orgId)).catch(() => {});
}

export async function cleanupProcessedEvent(stripeEventId: string) {
  await db.delete(schema.processedWebhookEvents)
    .where(eq(schema.processedWebhookEvents.stripeEventId, stripeEventId)).catch(() => {});
}

export async function cleanupSampleOrg() {
  const [ex] = await db.select({ id: schema.organizations.id })
    .from(schema.organizations).where(eq(schema.organizations.slug, 'sample'));
  if (ex) await cleanupOrg(ex.id);
}
```

### `tests/backend-e2e/helpers/request.ts`

Helper that builds a `NextRequest` and calls an App Router route handler directly —
no HTTP server required.

```typescript
import { NextRequest } from 'next/server';

export interface CallOptions {
  method?:  'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?:    object;
  headers?: Record<string, string>;
  /** Simulate authenticated user (mocked — see auth mock below) */
  userId?:  string;
  orgId?:   string;
}

export function buildRequest(path: string, opts: CallOptions = {}): NextRequest {
  const url  = `http://localhost:3000${path}`;
  const body = opts.body ? JSON.stringify(opts.body) : undefined;
  return new NextRequest(url, {
    // Default to POST — all route tests call POST handlers.
    // Pass opts.method explicitly when testing a GET/PATCH/DELETE route.
    method:  opts.method ?? 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  });
}

/** Call any App Router route handler and return { status, body }. */
export async function call(
  handler: (req: NextRequest) => Promise<Response>,
  path: string,
  opts: CallOptions = {},
): Promise<{ status: number; body: any }> {
  const req = buildRequest(path, opts);
  const res = await handler(req);
  let body: any = null;
  try { body = await res.json(); } catch { /**/ }
  return { status: res.status, body };
}
```

-----

## 4. Auth mock

### `tests/backend-e2e/helpers/auth-mock.ts`

```typescript
/**
 * Shared mutable auth state for E2E tests.
 * Set clerkUserId + organizationId in beforeAll, reset to '' in afterAll.
 *
 * vi.mock() MUST be called directly in each test file (not here) so vitest
 * hoists it above all imports — including the route handler under test.
 * See the vi.mock block in tests 09, 10, 11.
 */
export const mockAuth = {
  clerkUserId:    '',
  organizationId: '',
};
```

**vi.mock pattern for every API test file** — place at the **top level** of the
test file, before any other imports. Vitest hoists `vi.mock` calls above all
`import` statements, ensuring the route module is loaded with the mock already in
place:

```typescript
import { vi } from 'vitest';
import { mockAuth } from './helpers/auth-mock';

// Hoisted by vitest — route handler sees mocked getCurrentUser from load time
vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUser: vi.fn(async () =>
    mockAuth.clerkUserId
      ? { clerkUserId: mockAuth.clerkUserId, organizationId: mockAuth.organizationId }
      : null,
  ),
}));
```

-----

## 5. Test files

-----

### `tests/backend-e2e/01-schema.test.ts`

Verify every Sprint 10 column, type and constraint is in the database.
No seed data needed — read-only introspection.

```typescript
import { describe, it, expect } from 'vitest';
import { db }  from './helpers/db';
import { sql } from 'drizzle-orm';

async function col(table: string, column: string) {
  const r = await db.execute(sql`
    SELECT data_type, is_nullable
    FROM   information_schema.columns
    WHERE  table_schema = 'public'
      AND  table_name   = ${table}
      AND  column_name  = ${column}`);
  return r.rows[0] as any ?? null;
}

async function hasUniqueIndex(table: string, colFragment: string) {
  const r = await db.execute(sql`
    SELECT 1 FROM pg_indexes
    WHERE tablename = ${table} AND indexdef ILIKE ${'%' + colFragment + '%'}`);
  return r.rows.length > 0;
}

async function rlsEnabled(table: string) {
  const r = await db.execute(sql`
    SELECT relrowsecurity FROM pg_class WHERE relname = ${table}`);
  return (r.rows[0] as any)?.relrowsecurity === true;
}

describe('Sprint 10 schema', () => {
  // subscriptions
  it('subscriptions.cancel_at_period_end is boolean NOT NULL (HA1)', async () => {
    const c = await col('subscriptions', 'cancel_at_period_end');
    expect(c?.data_type).toBe('boolean');
    expect(c?.is_nullable).toBe('NO');
  });

  it('subscriptions.organization_id is UNIQUE NOT NULL', async () => {
    const c = await col('subscriptions', 'organization_id');
    expect(c?.is_nullable).toBe('NO');
    expect(await hasUniqueIndex('subscriptions', 'organization_id')).toBe(true);
  });

  it('subscriptions.stripe_subscription_id is UNIQUE', async () => {
    expect(await hasUniqueIndex('subscriptions', 'stripe_subscription_id')).toBe(true);
  });

  it('subscriptions.metadata is jsonb NOT NULL', async () => {
    const c = await col('subscriptions', 'metadata');
    expect(c?.data_type).toBe('jsonb');
    expect(c?.is_nullable).toBe('NO');
  });

  it('subscriptions RLS is enabled', async () => {
    expect(await rlsEnabled('subscriptions')).toBe(true);
  });

  // processed_webhook_events
  it('processed_webhook_events.stripe_event_id is UNIQUE NOT NULL (S3)', async () => {
    const c = await col('processed_webhook_events', 'stripe_event_id');
    expect(c?.is_nullable).toBe('NO');
    expect(await hasUniqueIndex('processed_webhook_events', 'stripe_event_id')).toBe(true);
  });

  it('processed_webhook_events.processed_at is NOT NULL', async () => {
    const c = await col('processed_webhook_events', 'processed_at');
    expect(c?.is_nullable).toBe('NO');
  });

  it('processed_webhook_events has NO RLS (system table)', async () => {
    expect(await rlsEnabled('processed_webhook_events')).toBe(false);
  });

  // organizations Sprint 10 additions
  it('organizations.slug column added (HE5)', async () => {
    expect(await col('organizations', 'slug')).not.toBeNull();
    expect(await hasUniqueIndex('organizations', 'slug')).toBe(true);
  });

  it('organizations.metadata is jsonb NOT NULL (HC4)', async () => {
    const c = await col('organizations', 'metadata');
    expect(c?.data_type).toBe('jsonb');
    expect(c?.is_nullable).toBe('NO');
  });

  it('organizations.onboarding_complete is boolean NOT NULL', async () => {
    const c = await col('organizations', 'onboarding_complete');
    expect(c?.data_type).toBe('boolean');
    expect(c?.is_nullable).toBe('NO');
  });
});
```

-----

### `tests/backend-e2e/02-lib-gst.test.ts`

Pure function tests — GST utilities.

```typescript
import { describe, it, expect } from 'vitest';
import { addGst, removeGst, displayPrice } from '@/lib/pricing/gst';

describe('lib/pricing/gst — HC2', () => {
  it('addGst(90) = 99  (Starter)', ()    => expect(addGst(90)).toBe(99));
  it('addGst(270) = 297 (Growth)', ()    => expect(addGst(270)).toBe(297));
  it('addGst(450) = 495 (Agency)', ()    => expect(addGst(450)).toBe(495));
  it('addGst(1350) = 1485 (Agency Pro)', () => expect(addGst(1_350)).toBe(1_485));
  it('addGst(0) = 0 (Free)',         ()  => expect(addGst(0)).toBe(0));
  it('removeGst(99) = 90',           ()  => expect(removeGst(99)).toBe(90));

  it('displayPrice monthly inc-GST', () => {
    const r = displayPrice(90, { incGst: true, interval: 'monthly' });
    expect(r).toContain('99');
    expect(r).toContain('GST');
    expect(r).toContain('/mo');
  });

  it('displayPrice annual — caller passes annual total (HC2)', () => {
    // Annual = 10 × monthly ex-GST: 10 × 90 = 900 → addGst(900) = 990
    const r = displayPrice(900, { incGst: true, interval: 'annual' });
    expect(r).toContain('990');
    expect(r).toContain('/yr');
  });

  it('displayPrice ex-GST', () => {
    const r = displayPrice(90, { incGst: false, interval: 'monthly' });
    expect(r).toContain('90');
    expect(r).toContain('ex. GST');
  });
});
```

-----

### `tests/backend-e2e/03-lib-tiers.test.ts`

Tier metadata and audit limits — Sprint 10 revised values.

```typescript
import { describe, it, expect }           from 'vitest';
import { TIER_AUDIT_LIMITS, TIER_METADATA } from '@/lib/pricing/tiers';

describe('lib/pricing/tiers — HE1', () => {
  it.each([
    ['free',       3],
    ['starter',   20],
    ['growth',    60],
    ['agency',   200],
    ['agency_pro', 500],
  ])('%s auditsPerMonth = %i', (tier, n) =>
    expect(TIER_AUDIT_LIMITS[tier].auditsPerMonth).toBe(n));

  it('enterprise = Infinity', () =>
    expect(TIER_AUDIT_LIMITS.enterprise.auditsPerMonth).toBe(Infinity));

  it.each([
    ['free',       0,     1, 2, 'Free'],
    ['starter',    90,    3, 4, 'Starter'],
    ['growth',     270,  10, 4, 'Growth'],
    ['agency',     450,  30, 4, 'Agency'],
    ['agency_pro', 1350, 100, 4, 'Agency Pro'],
  ])('TIER_METADATA.%s', (tier, price, brands, engines, label) => {
    const t = (TIER_METADATA as any)[tier];
    expect(t.priceAudExGst).toBe(price);
    expect(t.brands).toBe(brands);
    expect(t.engines).toBe(engines);
    expect(t.label).toBe(label);
  });
});
```

-----

### `tests/backend-e2e/04-lib-price-map.test.ts`

Stripe price map and tier reverse-lookup.

```typescript
import { describe, it, expect }     from 'vitest';
import { PRICE_MAP, ONE_OFF_PRICE_ID,
         tierFromPriceId }          from '@/lib/stripe/price-map';

describe('lib/stripe/price-map — HA5', () => {
  it('PRICE_MAP has 4 paid tiers each with monthly + annual', () => {
    for (const tier of ['starter', 'growth', 'agency', 'agency_pro']) {
      const t = (PRICE_MAP as any)[tier];
      expect(typeof t.monthly).toBe('string');
      expect(typeof t.annual).toBe('string');
      expect(t.monthly.length).toBeGreaterThan(0);
      expect(t.annual.length).toBeGreaterThan(0);
    }
  });

  it('ONE_OFF_PRICE_ID is a non-empty string', () => {
    expect(typeof ONE_OFF_PRICE_ID).toBe('string');
    expect(ONE_OFF_PRICE_ID.length).toBeGreaterThan(0);
  });

  it('tierFromPriceId correctly reverses all 8 price IDs', () => {
    for (const [tier, intervals] of Object.entries(PRICE_MAP) as any) {
      expect(tierFromPriceId(intervals.monthly)).toBe(tier);
      expect(tierFromPriceId(intervals.annual)).toBe(tier);
    }
  });

  it('tierFromPriceId unknown → returns safe string fallback', () => {
    const r = tierFromPriceId('price_unknown_xyz');
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });

  it('no duplicate price IDs across all tiers and intervals', () => {
    const ids = Object.values(PRICE_MAP).flatMap((t: any) => [t.monthly, t.annual]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

-----

### `tests/backend-e2e/05-db-subscriptions.test.ts`

Real DB round-trip for the subscriptions table.

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema }   from './helpers/db';
import { seedOrg, seedUser, seedSubscription, cleanupOrg } from './helpers/seed';
import { eq }           from 'drizzle-orm';

const ORG_CLERK_ID  = 'org_e2e_sub_test';
const USER_CLERK_ID = 'user_e2e_sub_test';
let orgId = '';

beforeAll(async () => {
  const ex = await db.select({ id: schema.organizations.id }).from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, ORG_CLERK_ID)).limit(1);
  if (ex.length) await cleanupOrg(ex[0].id);
  const o = await seedOrg(ORG_CLERK_ID, { name: '[E2E] Sub Org', tier: 'free' });
  orgId = o.id;
  await seedUser(USER_CLERK_ID, orgId, 'sub-e2e@test.com');
});

afterAll(async () => { await cleanupOrg(orgId); });

describe('subscriptions CRUD — HA1', () => {
  it('insert returns boolean cancelAtPeriodEnd (HA1)', async () => {
    const s = await seedSubscription(orgId, { cancelAtPeriodEnd: false });
    expect(typeof s.cancelAtPeriodEnd).toBe('boolean');
    expect(s.cancelAtPeriodEnd).toBe(false);
  });

  it('update cancelAtPeriodEnd to true — stays boolean (HA1)', async () => {
    await db.update(schema.subscriptions)
      .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
      .where(eq(schema.subscriptions.organizationId, orgId));
    const [r] = await db.select({ cpe: schema.subscriptions.cancelAtPeriodEnd })
      .from(schema.subscriptions).where(eq(schema.subscriptions.organizationId, orgId));
    expect(typeof r.cpe).toBe('boolean');
    expect(r.cpe).toBe(true);
  });

  it('upsert on same orgId — exactly one row (no duplicate)', async () => {
    await seedSubscription(orgId, { tier: 'agency' });
    const rows = await db.select().from(schema.subscriptions)
      .where(eq(schema.subscriptions.organizationId, orgId));
    expect(rows).toHaveLength(1);
  });

  it('status update stored correctly', async () => {
    await db.update(schema.subscriptions)
      .set({ status: 'past_due', updatedAt: new Date() })
      .where(eq(schema.subscriptions.organizationId, orgId));
    const [r] = await db.select({ status: schema.subscriptions.status })
      .from(schema.subscriptions).where(eq(schema.subscriptions.organizationId, orgId));
    expect(r.status).toBe('past_due');
  });

  it('delete subscription', async () => {
    await db.delete(schema.subscriptions)
      .where(eq(schema.subscriptions.organizationId, orgId));
    const rows = await db.select().from(schema.subscriptions)
      .where(eq(schema.subscriptions.organizationId, orgId));
    expect(rows).toHaveLength(0);
  });
});
```

-----

### `tests/backend-e2e/06-db-webhook-events.test.ts`

Idempotency guard via `processed_webhook_events`.

```typescript
import { describe, it, expect, afterAll } from 'vitest';
import { db, schema }    from './helpers/db';
import { seedProcessedEvent, cleanupProcessedEvent } from './helpers/seed';
import { eq }            from 'drizzle-orm';

const EVT_ID = `evt_e2e_${Date.now()}`;

afterAll(async () => {
  const rows = await db.select({ id: schema.processedWebhookEvents.stripeEventId })
    .from(schema.processedWebhookEvents);
  for (const r of rows.filter(r => r.id.startsWith('evt_e2e_')))
    await cleanupProcessedEvent(r.id);
});

describe('processed_webhook_events — HJ3, S3', () => {
  it('insert succeeds', async () => {
    const e = await seedProcessedEvent(EVT_ID, 'customer.subscription.created');
    expect(e.stripeEventId).toBe(EVT_ID);
    expect(e.processedAt).toBeInstanceOf(Date);
  });

  it('select by stripeEventId returns the row (idempotency lookup pattern)', async () => {
    const [r] = await db.select().from(schema.processedWebhookEvents)
      .where(eq(schema.processedWebhookEvents.stripeEventId, EVT_ID));
    expect(r).toBeTruthy();
  });

  it('duplicate insert violates UNIQUE constraint (S3)', async () => {
    await expect(
      db.insert(schema.processedWebhookEvents)
        .values({ stripeEventId: EVT_ID, type: 'duplicate', processedAt: new Date() })
    ).rejects.toThrow();
  });

  it('processedAt column is a Date', async () => {
    const [r] = await db.select({ pa: schema.processedWebhookEvents.processedAt })
      .from(schema.processedWebhookEvents)
      .where(eq(schema.processedWebhookEvents.stripeEventId, EVT_ID));
    expect(r.pa).toBeInstanceOf(Date);
  });

  it('delete cleans the row', async () => {
    await cleanupProcessedEvent(EVT_ID);
    const rows = await db.select().from(schema.processedWebhookEvents)
      .where(eq(schema.processedWebhookEvents.stripeEventId, EVT_ID));
    expect(rows).toHaveLength(0);
  });
});
```

-----

### `tests/backend-e2e/07-lib-onboarding.test.ts`

`isFirstTimeUser` and `markFirstTimeComplete` against the real DB.

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema }   from './helpers/db';
import { seedOrg, seedUser, cleanupOrg } from './helpers/seed';
import { isFirstTimeUser, markFirstTimeComplete } from '@/lib/onboarding/state-machine';
import { eq }           from 'drizzle-orm';

const ORG_ID  = 'org_e2e_onboard';
const USER_ID = 'user_e2e_onboard';
let orgId = '';

beforeAll(async () => {
  const ex = await db.select({ id: schema.organizations.id }).from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, ORG_ID)).limit(1);
  if (ex.length) await cleanupOrg(ex[0].id);
  const o = await seedOrg(ORG_ID, { metadata: {} });
  orgId = o.id;
  await seedUser(USER_ID, orgId, 'onboard-e2e@test.com');
});

afterAll(async () => { await cleanupOrg(orgId); });

describe('lib/onboarding/state-machine — HC4', () => {
  it('isFirstTimeUser → true for fresh org', async () => {
    expect(await isFirstTimeUser(orgId)).toBe(true);
  });

  it('markFirstTimeComplete sets metadata.firstTimeFlowComplete = true', async () => {
    await markFirstTimeComplete(orgId);
    const [o] = await db.select({ m: schema.organizations.metadata })
      .from(schema.organizations).where(eq(schema.organizations.id, orgId));
    expect((o.m as any).firstTimeFlowComplete).toBe(true);
  });

  it('isFirstTimeUser → false after marking complete', async () => {
    expect(await isFirstTimeUser(orgId)).toBe(false);
  });

  it('markFirstTimeComplete preserves other metadata fields', async () => {
    await db.update(schema.organizations)
      .set({ metadata: { extra: 'keep', firstTimeFlowComplete: false } })
      .where(eq(schema.organizations.id, orgId));
    await markFirstTimeComplete(orgId);
    const [o] = await db.select({ m: schema.organizations.metadata })
      .from(schema.organizations).where(eq(schema.organizations.id, orgId));
    expect((o.m as any).extra).toBe('keep');
    expect((o.m as any).firstTimeFlowComplete).toBe(true);
  });

  it('markFirstTimeComplete is idempotent', async () => {
    await expect(markFirstTimeComplete(orgId)).resolves.not.toThrow();
  });
});
```

-----

### `tests/backend-e2e/08-lib-sample-org.test.ts`

`ensureSampleOrg` — idempotent synthetic org.

```typescript
import { describe, it, expect, afterAll } from 'vitest';
import { db, schema }   from './helpers/db';
import { cleanupSampleOrg } from './helpers/seed';
import { ensureSampleOrg }  from '@/lib/sample-audit/synthetic-org';
import { eq }           from 'drizzle-orm';

afterAll(async () => { await cleanupSampleOrg(); });

describe('lib/sample-audit/synthetic-org — S2, HE5', () => {
  it('creates org with slug="sample"', async () => {
    await ensureSampleOrg();
    const [r] = await db.select({ slug: schema.organizations.slug })
      .from(schema.organizations).where(eq(schema.organizations.slug, 'sample'));
    expect(r?.slug).toBe('sample');
  });

  it('returns same id on second call (idempotent)', async () => {
    const a = await ensureSampleOrg();
    const b = await ensureSampleOrg();
    expect(a.id).toBe(b.id);
  });

  it('exactly one org with slug="sample" exists', async () => {
    const rows = await db.select().from(schema.organizations)
      .where(eq(schema.organizations.slug, 'sample'));
    expect(rows).toHaveLength(1);
  });

  it('sample org has tier="free"', async () => {
    const [r] = await db.select({ tier: schema.organizations.tier })
      .from(schema.organizations).where(eq(schema.organizations.slug, 'sample'));
    expect(r?.tier).toBe('free');
  });
});
```

-----

### `tests/backend-e2e/09-api-billing-checkout.test.ts`

Route handler imported directly — no HTTP server.

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mockAuth } from './helpers/auth-mock';

// vi.mock is hoisted by vitest above all imports — getCurrentUser is mocked
// before the route handler module is evaluated
vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUser: vi.fn(async () =>
    mockAuth.clerkUserId
      ? { clerkUserId: mockAuth.clerkUserId, organizationId: mockAuth.organizationId }
      : null,
  ),
}));

// Mock Stripe checkout so no real Stripe API call is made with fake price IDs
vi.mock('@/lib/stripe/checkout', () => ({
  createCheckoutSession: vi.fn(async () => 'https://checkout.stripe.com/test_session_url'),
}));

import { call }        from './helpers/request';
import { db, schema }  from './helpers/db';
import { seedOrg, seedUser, cleanupOrg } from './helpers/seed';
import { eq }          from 'drizzle-orm';
import { POST } from '@/app/api/billing/checkout/route';

const ORG_ID  = 'org_e2e_checkout';
const USER_ID = 'user_e2e_checkout';
let orgId = '';

beforeAll(async () => {
  const ex = await db.select({ id: schema.organizations.id }).from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, ORG_ID)).limit(1);
  if (ex.length) await cleanupOrg(ex[0].id);
  const o = await seedOrg(ORG_ID, { tier: 'free' });
  orgId = o.id;
  await seedUser(USER_ID, orgId, 'checkout-e2e@test.com');
});

afterAll(async () => {
  mockAuth.clerkUserId = '';
  mockAuth.organizationId = '';
  await cleanupOrg(orgId);
});

describe('POST /api/billing/checkout — HB2', () => {
  it('unauthenticated → 401', async () => {
    mockAuth.clerkUserId = '';
    const r = await call(POST, '/api/billing/checkout',
      { body: { tier: 'growth', billing: 'monthly' } });
    expect(r.status).toBe(401);
  });

  it('invalid tier → 400', async () => {
    mockAuth.clerkUserId = USER_ID;
    mockAuth.organizationId = orgId;
    const r = await call(POST, '/api/billing/checkout',
      { body: { tier: 'ultra_plus', billing: 'monthly' } });
    expect([400, 422]).toContain(r.status);
  });

  it('invalid billing interval → 400', async () => {
    const r = await call(POST, '/api/billing/checkout',
      { body: { tier: 'growth', billing: 'quarterly' } });
    expect([400, 422]).toContain(r.status);
  });

  it('missing body → 400', async () => {
    const r = await call(POST, '/api/billing/checkout', { body: {} });
    expect([400, 422]).toContain(r.status);
  });

  it('valid growth + monthly → 200 with checkout url', async () => {
    const r = await call(POST, '/api/billing/checkout',
      { body: { tier: 'growth', billing: 'monthly' } });
    expect(r.status).toBe(200);
    const hasUrl = !!(r.body?.url || r.body?.sessionId || r.body?.id);
    expect(hasUrl).toBe(true);
  });
});
```

-----

### `tests/backend-e2e/10-api-billing-downgrade.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mockAuth } from './helpers/auth-mock';

vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUser: vi.fn(async () =>
    mockAuth.clerkUserId
      ? { clerkUserId: mockAuth.clerkUserId, organizationId: mockAuth.organizationId }
      : null,
  ),
}));

// Mock Stripe client so downgrade route doesn't call real Stripe API
vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    subscriptions: {
      update: vi.fn(async () => ({ id: 'sub_mock', cancel_at_period_end: true })),
    },
  },
}));

import { call }        from './helpers/request';
import { db, schema }  from './helpers/db';
import { seedOrg, seedUser, seedSubscription, cleanupOrg } from './helpers/seed';
import { eq }          from 'drizzle-orm';
import { POST } from '@/app/api/billing/downgrade/route';

const ORG1_ID  = 'org_e2e_dg1';
const USER1_ID = 'user_e2e_dg1';
const ORG2_ID  = 'org_e2e_dg2';
const USER2_ID = 'user_e2e_dg2';
let org1Id = '', org2Id = '';

beforeAll(async () => {
  for (const [cid, uid, email, setter] of [
    [ORG1_ID, USER1_ID, 'dg1@test.com', (id: string) => { org1Id = id; }],
    [ORG2_ID, USER2_ID, 'dg2@test.com', (id: string) => { org2Id = id; }],
  ] as any[]) {
    const ex = await db.select({ id: schema.organizations.id }).from(schema.organizations)
      .where(eq(schema.organizations.clerkOrgId, cid)).limit(1);
    if (ex.length) await cleanupOrg(ex[0].id);
    const o = await seedOrg(cid, { tier: 'growth' });
    setter(o.id);
    await seedUser(uid, o.id, email);
  }
  await seedSubscription(org1Id, { tier: 'growth', cancelAtPeriodEnd: false });
  // org2 has NO subscription
});

afterAll(async () => {
  mockAuth.clerkUserId = '';
  await cleanupOrg(org1Id);
  await cleanupOrg(org2Id);
});

describe('POST /api/billing/downgrade — HD5', () => {
  it('unauthenticated → 401', async () => {
    mockAuth.clerkUserId = '';
    const r = await call(POST, '/api/billing/downgrade');
    expect(r.status).toBe(401);
  });

  it('org with no subscription → 404', async () => {
    mockAuth.clerkUserId = USER2_ID;
    mockAuth.organizationId = org2Id;
    const r = await call(POST, '/api/billing/downgrade');
    expect(r.status).toBe(404);
  });

  it('org with subscription → 200 + cancelAtPeriodEnd=true in DB (HA1)', async () => {
    mockAuth.clerkUserId = USER1_ID;
    mockAuth.organizationId = org1Id;
    const r = await call(POST, '/api/billing/downgrade');
    expect(r.status).toBe(200);
    const [row] = await db.select({ cpe: schema.subscriptions.cancelAtPeriodEnd })
      .from(schema.subscriptions).where(eq(schema.subscriptions.organizationId, org1Id));
    expect(typeof row.cpe).toBe('boolean');   // HA1: must be boolean not string
    expect(row.cpe).toBe(true);
  });
});
```

-----

### `tests/backend-e2e/11-api-onboarding-complete.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mockAuth } from './helpers/auth-mock';

vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUser: vi.fn(async () =>
    mockAuth.clerkUserId
      ? { clerkUserId: mockAuth.clerkUserId, organizationId: mockAuth.organizationId }
      : null,
  ),
}));

import { call }        from './helpers/request';
import { db, schema }  from './helpers/db';
import { seedOrg, seedUser, cleanupOrg } from './helpers/seed';
import { eq }          from 'drizzle-orm';
import { POST } from '@/app/api/onboarding/complete/route';

const ORG_ID  = 'org_e2e_onb_api';
const USER_ID = 'user_e2e_onb_api';
let orgId = '';

beforeAll(async () => {
  const ex = await db.select({ id: schema.organizations.id }).from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, ORG_ID)).limit(1);
  if (ex.length) await cleanupOrg(ex[0].id);
  const o = await seedOrg(ORG_ID, { metadata: { firstTimeFlowComplete: false } });
  orgId = o.id;
  await seedUser(USER_ID, orgId, 'onbapi-e2e@test.com');
});

afterAll(async () => {
  mockAuth.clerkUserId = '';
  await cleanupOrg(orgId);
});

describe('POST /api/onboarding/complete — HF1, HC4', () => {
  it('unauthenticated → 401', async () => {
    mockAuth.clerkUserId = '';
    const r = await call(POST, '/api/onboarding/complete');
    expect(r.status).toBe(401);
  });

  it('authenticated → 200 + { ok: true }', async () => {
    mockAuth.clerkUserId = USER_ID;
    mockAuth.organizationId = orgId;
    const r = await call(POST, '/api/onboarding/complete');
    expect(r.status).toBe(200);
    expect(r.body?.ok).toBe(true);
  });

  it('DB: metadata.firstTimeFlowComplete = true after call (HC4)', async () => {
    const [o] = await db.select({ m: schema.organizations.metadata })
      .from(schema.organizations).where(eq(schema.organizations.id, orgId));
    expect((o.m as any)?.firstTimeFlowComplete).toBe(true);
  });

  it('calling again is idempotent → 200', async () => {
    const r = await call(POST, '/api/onboarding/complete');
    expect(r.status).toBe(200);
  });
});
```

-----

### `tests/backend-e2e/12-api-sample-audit.test.ts`

Public route — no auth. Zod validation tested directly.

```typescript
import { describe, it, expect, afterAll } from 'vitest';
import { call }         from './helpers/request';
import { cleanupSampleOrg } from './helpers/seed';
import { POST } from '@/app/api/sample-audit/route';

afterAll(async () => { await cleanupSampleOrg(); });

describe('POST /api/sample-audit — HB3, HB5, S1', () => {
  it('missing domain → 400', async () => {
    const r = await call(POST, '/api/sample-audit', { body: { vertical: 'tradies' } });
    expect([400, 422]).toContain(r.status);
  });

  it('missing vertical → 400', async () => {
    const r = await call(POST, '/api/sample-audit', { body: { domain: 's10e2e.com.au' } });
    expect([400, 422]).toContain(r.status);
  });

  it('domain too short (min 3, Zod) → 400', async () => {
    const r = await call(POST, '/api/sample-audit', { body: { domain: 'x', vertical: 'tradies' } });
    expect([400, 422]).toContain(r.status);
  });

  it('valid domain + vertical → 200 with auditId (mock mode)', async () => {
    const r = await call(POST, '/api/sample-audit',
      { body: { domain: 's10e2e-test.com.au', vertical: 'tradies' } });
    expect(r.status).toBe(200);
    const id = r.body?.auditId ?? r.body?.id ?? r.body?.jobId;
    expect(typeof id).toBe('string');
  });
});
```

-----

### `tests/backend-e2e/13-db-webhook-idempotency.test.ts`

DB-level idempotency guard — the UNIQUE constraint is the final protection
against race-condition double-processing (HJ3).

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema }   from './helpers/db';
import { seedOrg, seedUser, seedSubscription,
         cleanupOrg, seedProcessedEvent, cleanupProcessedEvent } from './helpers/seed';
import { eq }           from 'drizzle-orm';

const ORG_ID  = 'org_e2e_wh_idem';
const USER_ID = 'user_e2e_wh_idem';
const EVT_A   = `evt_e2e_idem_a_${Date.now()}`;
const EVT_B   = `evt_e2e_idem_b_${Date.now()}`;
let orgId = '';

beforeAll(async () => {
  const ex = await db.select({ id: schema.organizations.id }).from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, ORG_ID)).limit(1);
  if (ex.length) await cleanupOrg(ex[0].id);
  const o = await seedOrg(ORG_ID, { tier: 'growth' });
  orgId = o.id;
  await seedUser(USER_ID, orgId, 'wh-e2e@test.com');
  await seedSubscription(orgId, { stripeSubscriptionId: `sub_e2e_wh_${Date.now()}` });
});

afterAll(async () => {
  await cleanupOrg(orgId);
  for (const id of [EVT_A, EVT_B])
    await cleanupProcessedEvent(id);
});

describe('Webhook idempotency — HJ3, S3', () => {
  it('first insert of an event succeeds', async () => {
    const e = await seedProcessedEvent(EVT_A, 'invoice.paid');
    expect(e.stripeEventId).toBe(EVT_A);
  });

  it('duplicate insert of same stripeEventId throws UNIQUE error (S3)', async () => {
    await expect(
      db.insert(schema.processedWebhookEvents)
        .values({ stripeEventId: EVT_A, type: 'invoice.paid', processedAt: new Date() })
    ).rejects.toThrow();
  });

  it('after UNIQUE failure only one row exists — no double-process (HJ3)', async () => {
    const rows = await db.select().from(schema.processedWebhookEvents)
      .where(eq(schema.processedWebhookEvents.stripeEventId, EVT_A));
    expect(rows).toHaveLength(1);
  });

  it('second distinct event inserts fine', async () => {
    const e = await seedProcessedEvent(EVT_B, 'customer.subscription.updated');
    expect(e.stripeEventId).toBe(EVT_B);
  });

  it('processedAt is always a Date object', async () => {
    const [r] = await db.select({ pa: schema.processedWebhookEvents.processedAt })
      .from(schema.processedWebhookEvents)
      .where(eq(schema.processedWebhookEvents.stripeEventId, EVT_A));
    expect(r.pa).toBeInstanceOf(Date);
  });
});
```

-----

## 6. Run all tests

```bash
# Single command — all 13 test files, serial, test DB
dotenv -e .env.test.local -- \
  pnpm vitest run --config vitest.config.backend-e2e.ts --reporter=verbose
```

Run a single file during development:

```bash
dotenv -e .env.test.local -- \
  pnpm vitest run --config vitest.config.backend-e2e.ts \
  tests/backend-e2e/05-db-subscriptions.test.ts
```

-----

## 7. PASS criteria

All 13 test files green. Zero orphan rows in the test DB after the run.
The following must specifically pass:

|Test                                                      |Invariant             |
|----------------------------------------------------------|----------------------|
|`01` `cancel_at_period_end is boolean NOT NULL`           |HA1                   |
|`01` `stripe_event_id UNIQUE`                             |S3                    |
|`01` `organizations.slug UNIQUE`                          |HE5                   |
|`02` `addGst(270) = 297` and `addGst(450) = 495`          |HC2 (exact rounding)  |
|`03` `free.auditsPerMonth = 3` (not 1)                    |HE1 Sprint 10 revision|
|`05` `typeof cancelAtPeriodEnd === 'boolean'` after upsert|HA1                   |
|`06` duplicate stripeEventId throws                       |S3                    |
|`10` `cancelAtPeriodEnd = true` in DB after downgrade     |HD5 + HA1             |
|`13` duplicate event insert throws                        |HJ3                   |