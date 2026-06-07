# VisibleAU — Sprint 11 Backend E2E Tests

**Sprint:** 11 — Polish · Landing · Onboarding  
**Runner:** vitest (Node only — no browser, no dev server)  
**Approach:** Route handlers imported and called directly with `NextRequest`.
Auth mocked via `vi.mock` at test-file top-level (hoisted above imports).
Real test DB for all DB assertions. Every test seeds its own rows and
hard-deletes them on completion — pass or fail.

-----

## Sprint 11 canonical invariants

|Code|Invariant                                                                            |
|----|-------------------------------------------------------------------------------------|
|IC4 |`POST /api/onboarding/tour-complete` writes `org.metadata.productTourComplete = true`|
|IJ5 |Product tour shows once; `productTourComplete` flag is DB-only (never localStorage)  |
|IB1 |`buildMetadata` uses `NEXT_PUBLIC_APP_URL` — must not produce `undefined/...` URLs   |
|IB4 |`robots.txt` and `sitemap.xml` publicly accessible (no auth, HTTP 200)               |

**Sprint 11 adds no new DB tables.** All DB mutations go to `organizations.metadata`.

-----

## 1. Prerequisites

```bash
# .env.test.local
DATABASE_URL=postgresql://postgres:secret@localhost:5432/visibleau_test
DIRECT_URL=postgresql://postgres:secret@localhost:5432/visibleau_test
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_GROWTH_MONTHLY=price_test_growth_monthly
LLM_MODE=mock
```

Run migrations before first run:

```bash
dotenv -e .env.test.local -- pnpm drizzle-kit migrate
```

> **Test 02 prerequisite — `next-sitemap.config.js`:** Sprint 11 ID3 requires this config
> file at the project root. Without it the `postbuild` step fails and no `public/robots.txt`
> or `public/sitemap.xml` is written. A minimal version:
> 
> ```javascript
> // next-sitemap.config.js (project root)
> /** @type {import('next-sitemap').IConfig} */
> module.exports = {
>   siteUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://visibleau.com',
>   generateRobotsTxt: true,
>   exclude: ['/api/*', '/dashboard/*', '/settings/*', '/brands/*',
>             '/audit/*', '/agency/*', '/onboarding', '/welcome'],
> };
> ```
> 
> Also add to `package.json`: `"postbuild": "next-sitemap"`
> 
> Install the package if not already present:
> 
> ```bash
> pnpm add next-sitemap
> ```

-----

## 2. vitest config

```typescript
// vitest.config.backend-e2e-s11.ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths    from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name:        'backend-e2e-s11',
    environment: 'node',
    globals:     true,
    setupFiles:  ['./tests/backend-e2e-s11/setup.ts'],
    include:     ['./tests/backend-e2e-s11/**/*.test.ts'],
    sequence:    { concurrent: false },
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
```

-----

## 3. Shared setup

### `tests/backend-e2e-s11/setup.ts`

```typescript
import { config } from 'dotenv';
config({ path: '.env.test.local' });
```

### `tests/backend-e2e-s11/helpers/db.ts`

```typescript
import { drizzle }  from 'drizzle-orm/postgres-js';
import postgres      from 'postgres';
import * as schema   from '@/db/schema';

const client = postgres(
  process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  { max: 3 },
);
export const db = drizzle(client, { schema });
export { schema };
```

### `tests/backend-e2e-s11/helpers/seed.ts`

```typescript
import { db, schema }  from './db';
import { eq }          from 'drizzle-orm';

export async function seedOrg(p: {
  clerkOrgId:  string;
  name?:       string;
  tier?:       string;
  metadata?:   Record<string, unknown>;
}) {
  const [o] = await db.insert(schema.organizations)
    .values({
      clerkOrgId:         p.clerkOrgId,
      name:               p.name     ?? '[S11-E2E] Org',
      region:             'au',
      tier:               p.tier     ?? 'free',
      metadata:           p.metadata ?? {},
      slug:               null,
      onboardingComplete: false,
    })
    .onConflictDoUpdate({
      target: schema.organizations.clerkOrgId,
      set: {
        name:     p.name     ?? '[S11-E2E] Org',
        tier:     p.tier     ?? 'free',
        metadata: p.metadata ?? {},
      },
    })
    .returning();
  return o;
}

export async function seedUser(p: {
  clerkUserId:    string;
  organizationId: string;
  email:          string;
}) {
  const [u] = await db.insert(schema.users)
    .values({
      clerkUserId:    p.clerkUserId,
      organizationId: p.organizationId,
      email:          p.email,
      name:           '[S11-E2E]',
      role:           'owner',
    })
    .onConflictDoUpdate({
      target: schema.users.clerkUserId,
      set:    { organizationId: p.organizationId },
    })
    .returning();
  return u;
}

export async function cleanupOrg(orgId: string) {
  await db.delete(schema.users)
    .where(eq(schema.users.organizationId, orgId)).catch(() => {});
  await db.delete(schema.organizations)
    .where(eq(schema.organizations.id, orgId)).catch(() => {});
}
```

### `tests/backend-e2e-s11/helpers/request.ts`

```typescript
import { NextRequest } from 'next/server';

export interface CallOptions {
  method?:  'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?:    object;
  headers?: Record<string, string>;
}

export function buildRequest(path: string, opts: CallOptions = {}): NextRequest {
  const url  = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}${path}`;
  const body = opts.body ? JSON.stringify(opts.body) : undefined;
  return new NextRequest(url, {
    method:  opts.method ?? 'POST',   // default POST — all routes tested are POST
    body,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
}

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

## 4. Test files

-----

### `tests/backend-e2e-s11/01-lib-seo-metadata.test.ts`

Pure function — no DB, no HTTP. Verifies `buildMetadata` output shape,
that `NEXT_PUBLIC_APP_URL` is used correctly in OG url (IB1),
that `alternates.canonical` is correctly formed (IP5),
and that `openGraph.description` never contains placeholder copy (IC2).

```typescript
import { describe, it, expect } from 'vitest';
import { buildMetadata }        from '@/lib/seo/metadata';

describe('lib/seo/metadata — buildMetadata (IB1 + IP5 + IC2)', () => {

  it('01-01: returns title with site name appended', () => {
    const m = buildMetadata({ title: 'Pricing', path: '/pricing' });
    // Metadata.title can be string OR { default, template, absolute } object
    const titleStr = JSON.stringify(m.title ?? '');
    // Spec: fullTitle = `${title} | VisibleAU` — verify BOTH the input AND site name
    expect(titleStr.toLowerCase()).toContain('pricing');
    expect(titleStr.toLowerCase()).toContain('visibleau');  // site name must be appended
  });

  it('01-02: OpenGraph url uses NEXT_PUBLIC_APP_URL — not undefined (IB1)', () => {
    const m = buildMetadata({ title: 'Home', path: '/' });
    const ogUrl = String((m.openGraph as any)?.url ?? '');
    expect(ogUrl).not.toContain('undefined');
    expect(ogUrl.startsWith('http')).toBe(true);
  });

  it('01-03: OpenGraph url is correctly formed for /pricing', () => {
    const m = buildMetadata({ title: 'Pricing', path: '/pricing' });
    const ogUrl = String((m.openGraph as any)?.url ?? '');
    expect(ogUrl).toContain('/pricing');
  });

  it('01-04: description is a non-empty string when provided', () => {
    const m = buildMetadata({
      title: 'Pricing',
      path: '/pricing',
      description: 'Transparent AU pricing',
    });
    // m.description is string | null | undefined — avoid unsafe `as string` cast
    expect(m.description).toBeTruthy();
    expect(m.description).toContain('pricing');
  });

  it('01-05: default title used when title is undefined', () => {
    const m = buildMetadata({ title: undefined, path: '/' });
    // Metadata.title may be a string OR a { default, template } object — use JSON.stringify
    const titleStr = JSON.stringify(m.title ?? '');
    expect(titleStr.length).toBeGreaterThan(2); // at least something besides empty quotes
    // Spec: default = 'VisibleAU — AI Search Visibility for Australian SMBs'
    expect(titleStr.toLowerCase()).toContain('visibleau');
  });

  it('01-06: openGraph images array present (from spec)', () => {
    const m = buildMetadata({ title: 'Test', path: '/test' });
    // Spec: openGraph.images = ['/og-image.png'] — concrete spec requirement
    const images = (m.openGraph as any)?.images;
    expect(Array.isArray(images)).toBe(true);
    expect(images.length).toBeGreaterThan(0);
  });

  it('01-07: twitter card is summary_large_image (from spec)', () => {
    const m = buildMetadata({ title: 'Test', path: '/test' });
    // Spec: twitter: { card: 'summary_large_image' } — verify exact value not just existence
    expect((m.twitter as any)?.card).toBe('summary_large_image');
  });

  it('01-08: openGraph url has no double slashes (no trailing slash in env var)', () => {
    const m = buildMetadata({ title: 'Methodology', path: '/methodology' });
    const ogUrl = String((m.openGraph as any)?.url ?? '');
    expect(ogUrl).not.toContain('//methodology');
    expect(ogUrl).toMatch(/methodology$/);
  });

  it('01-09: alternates.canonical is correctly formed — no undefined, no double slashes (IP5, IB1)', () => {
    // IP5 fix: buildMetadata returns alternates: { canonical: `${APP_URL}${path}` }
    // Same undefined-URL risk and double-slash risk as openGraph.url (tested in 01-08)
    const m = buildMetadata({ title: 'Pricing', path: '/pricing' });
    const canonical = String((m.alternates as any)?.canonical ?? '');
    expect(canonical).not.toContain('undefined');
    expect(canonical.startsWith('http')).toBe(true);
    expect(canonical).toContain('/pricing');
    expect(canonical).not.toContain('//pricing');  // guards against trailing slash in APP_URL
  });

  it('01-10: openGraph.description is never the literal placeholder "..." (IC2 regression)', () => {
    // IC2 fix: the old impl used `description ?? '...'` — literal dots ship to production.
    // Fixed to: `description ?? process.env.NEXT_PUBLIC_APP_DESCRIPTION ?? ''`
    // When no description is passed and env var is absent → OG description = '' (not '...')
    const m = buildMetadata({ title: 'Test', path: '/test' });
    const ogDesc = String((m.openGraph as any)?.description ?? '');
    expect(ogDesc).not.toBe('...');
    expect(ogDesc).not.toContain('Lorem');  // guards against any placeholder copy
    // OG description is '' (empty) when no description provided in test env
    expect(typeof ogDesc).toBe('string');
  });
});
```

-----

### `tests/backend-e2e-s11/02-public-seo-routes.test.ts`

Verifies `robots.txt` and `sitemap.xml` are publicly accessible via HTTP
without authentication (IB4). Uses `fetch` against `NEXT_PUBLIC_APP_URL`.
Requires a production build (`pnpm build && pnpm start`) — both files are
generated by `next-sitemap` as a postbuild step (Sprint 11 ID3).

> **Note — production build required for all test 02 cases:**
> 
> Sprint 11 ID3 uses `next-sitemap` with `generateRobotsTxt: true`. This means:
> 
> - `public/robots.txt` is written by `next-sitemap` at **postbuild** (not by `app/robots.ts`)
> - `public/sitemap.xml` is also written at **postbuild**
> 
> **Both files only exist after `pnpm build`.** A dev server alone is not sufficient.
> 
> ```bash
> pnpm build && pnpm start   # in a separate terminal, then run test 02
> ```

```typescript
import { describe, it, expect } from 'vitest';

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

describe('Public SEO routes (IB4)', () => {

  it('02-01: GET /robots.txt → 200 with text/plain content', async () => {
    const res = await fetch(`${BASE}/robots.txt`);
    expect(res.status).toBe(200);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toContain('text');
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
    // Must contain Allow or Disallow directive
    expect(text).toMatch(/User-agent:|Disallow:|Allow:/i);
  });

  it('02-02: GET /sitemap.xml → 200 with XML content', async () => {
    const res = await fetch(`${BASE}/sitemap.xml`);
    expect(res.status).toBe(200);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toMatch(/xml/i);
    const text = await res.text();
    expect(text).toContain('<urlset');
  });

  it('02-03: sitemap.xml contains the landing page URL', async () => {
    const res  = await fetch(`${BASE}/sitemap.xml`);
    const text = await res.text();
    expect(text).toContain('<loc>');
    // Root URL should be in sitemap
    expect(text).toMatch(/https?:\/\//);
  });

  it('02-04: sitemap.xml contains /pricing', async () => {
    const res  = await fetch(`${BASE}/sitemap.xml`);
    const text = await res.text();
    expect(text).toContain('/pricing');
  });

  it('02-05: sitemap.xml contains /methodology', async () => {
    const res  = await fetch(`${BASE}/sitemap.xml`);
    const text = await res.text();
    expect(text).toContain('/methodology');
  });

  it('02-06: robots.txt does NOT disallow /pricing or /methodology (public routes)', async () => {
    const res  = await fetch(`${BASE}/robots.txt`);
    const text = await res.text();
    // Public marketing pages should not be blocked
    expect(text).not.toMatch(/Disallow:\s*\/pricing/);
    expect(text).not.toMatch(/Disallow:\s*\/methodology/);
  });
});
```

-----

### `tests/backend-e2e-s11/03-api-tour-complete.test.ts`

Route handler imported directly — no HTTP server needed.
Tests `POST /api/onboarding/tour-complete` (IC4 / IJ5).

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mockAuth } from './helpers/auth-mock';

// vi.mock hoisted above all imports — getCurrentUser is mocked before route loads
vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUser: vi.fn(async () =>
    mockAuth.clerkUserId
      ? { clerkUserId: mockAuth.clerkUserId, organizationId: mockAuth.organizationId }
      : null,
  ),
}));

import { call }         from './helpers/request';
import { db, schema }   from './helpers/db';
import { seedOrg, seedUser, cleanupOrg } from './helpers/seed';
import { eq }           from 'drizzle-orm';
import { POST }         from '@/app/api/onboarding/tour-complete/route';

const ORG_CLERK_ID  = 'org_s11e2e_tour';
const USER_CLERK_ID = 'user_s11e2e_tour';
let orgId = '';

beforeAll(async () => {
  const ex = await db.select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, ORG_CLERK_ID))
    .limit(1);
  if (ex.length) await cleanupOrg(ex[0].id);

  const org = await seedOrg({
    clerkOrgId: ORG_CLERK_ID,
    name:       '[S11-E2E] Tour Org',
    metadata:   {},   // productTourComplete not set yet
  });
  orgId = org.id;
  await seedUser({
    clerkUserId:    USER_CLERK_ID,
    organizationId: orgId,
    email:          'tour-e2e@visibleau.test',
  });
});

afterAll(async () => {
  mockAuth.clerkUserId    = '';
  mockAuth.organizationId = '';
  await cleanupOrg(orgId);
});

describe('POST /api/onboarding/tour-complete (IC4, IJ5)', () => {

  it('03-01: unauthenticated → 401', async () => {
    mockAuth.clerkUserId = '';
    const r = await call(POST, '/api/onboarding/tour-complete');
    expect(r.status).toBe(401);
  });

  it('03-02: authenticated → 200 with { ok: true }', async () => {
    mockAuth.clerkUserId    = USER_CLERK_ID;
    mockAuth.organizationId = orgId;
    const r = await call(POST, '/api/onboarding/tour-complete');
    expect(r.status).toBe(200);
    expect(r.body?.ok).toBe(true);
  });

  it('03-03: DB: org.metadata.productTourComplete = true after call (IC4)', async () => {
    const [o] = await db
      .select({ m: schema.organizations.metadata })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId));
    expect((o.m as any)?.productTourComplete).toBe(true);
  });

  it('03-04: calling again is idempotent — still 200, flag stays true (IJ5)', async () => {
    const r = await call(POST, '/api/onboarding/tour-complete');
    expect(r.status).toBe(200);

    const [o] = await db
      .select({ m: schema.organizations.metadata })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId));
    expect((o.m as any)?.productTourComplete).toBe(true);
  });

  it('03-05: existing metadata fields are preserved (spread, not overwrite)', async () => {
    // Reset with extra field in metadata
    await db.update(schema.organizations)
      .set({ metadata: { someOtherFlag: 'keep-me', productTourComplete: false } })
      .where(eq(schema.organizations.id, orgId));

    const r = await call(POST, '/api/onboarding/tour-complete');
    expect(r.status).toBe(200);

    const [o] = await db
      .select({ m: schema.organizations.metadata })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId));
    expect((o.m as any)?.productTourComplete).toBe(true);
    expect((o.m as any)?.someOtherFlag).toBe('keep-me');  // spread preserved
  });
});
```

-----

### `tests/backend-e2e-s11/04-db-product-tour-flag.test.ts`

Direct DB assertions for the `productTourComplete` flag in
`organizations.metadata` — no route call. Verifies the jsonb column
behaves correctly as the IJ5 tour-shows-once mechanism.

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema }   from './helpers/db';
import { seedOrg, cleanupOrg } from './helpers/seed';
import { eq, sql }      from 'drizzle-orm';

const ORG_CLERK_ID = 'org_s11e2e_flag';
let orgId = '';

beforeAll(async () => {
  const ex = await db.select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, ORG_CLERK_ID))
    .limit(1);
  if (ex.length) await cleanupOrg(ex[0].id);

  const org = await seedOrg({
    clerkOrgId: ORG_CLERK_ID,
    name:       '[S11-E2E] Flag Org',
    metadata:   {},
  });
  orgId = org.id;
});

afterAll(async () => { await cleanupOrg(orgId); });

describe('DB: productTourComplete flag in org.metadata (IJ5)', () => {

  it('04-01: fresh org has no productTourComplete flag (undefined/null/false)', async () => {
    const [o] = await db
      .select({ m: schema.organizations.metadata })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId));
    const flag = (o.m as any)?.productTourComplete;
    // Fresh org: flag is absent (undefined) or false — never true
    expect(flag).toBeFalsy();
  });

  it('04-02: setting productTourComplete=true persists to jsonb column', async () => {
    await db.update(schema.organizations)
      .set({ metadata: { productTourComplete: true } })
      .where(eq(schema.organizations.id, orgId));

    const [o] = await db
      .select({ m: schema.organizations.metadata })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId));
    expect((o.m as any)?.productTourComplete).toBe(true);
  });

  it('04-03: metadata is jsonb — spreads correctly when adding second flag', async () => {
    // Simulate the route's spread pattern: { ...existing, productTourComplete: true }
    const [current] = await db
      .select({ m: schema.organizations.metadata })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId));

    await db.update(schema.organizations)
      .set({ metadata: { ...(current.m as any ?? {}), firstTimeFlowComplete: true } })
      .where(eq(schema.organizations.id, orgId));

    const [o] = await db
      .select({ m: schema.organizations.metadata })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId));
    // Both flags must coexist
    expect((o.m as any)?.productTourComplete).toBe(true);
    expect((o.m as any)?.firstTimeFlowComplete).toBe(true);
  });

  it('04-04: productTourComplete can be reset to false (for test harness / admin)', async () => {
    await db.update(schema.organizations)
      .set({ metadata: { productTourComplete: false } })
      .where(eq(schema.organizations.id, orgId));

    const [o] = await db
      .select({ m: schema.organizations.metadata })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId));
    expect((o.m as any)?.productTourComplete).toBe(false);
  });

  it('04-05: metadata column is jsonb NOT NULL', async () => {
    const r = await db.execute(sql`
      SELECT data_type, is_nullable
      FROM   information_schema.columns
      WHERE  table_schema = 'public'
        AND  table_name   = 'organizations'
        AND  column_name  = 'metadata'
    `);
    const row = (r as any).rows?.[0] ?? (r as any)[0];
    expect(row?.data_type).toBe('jsonb');
    expect(row?.is_nullable).toBe('NO');
  });
});
```

-----

### `tests/backend-e2e-s11/05-lib-methodology.test.ts`

Pure function test — validates `lib/methodology/methods.ts` data shape.
No DB, no HTTP. Sprint 11 delivers the methodology page; this test ensures
the data file is correctly typed so the page renders without runtime errors.

```typescript
import { describe, it, expect } from 'vitest';
// Dynamic import — methods.ts is authored by operator, may not exist yet.
// These tests fail gracefully and guide the developer to author the file.

describe('lib/methodology/methods.ts — data shape (IE3)', () => {

  it('05-01: module exports METHODS array', async () => {
    const mod = await import('@/lib/methodology/methods').catch(() => null);
    expect(mod).not.toBeNull();
    const methods = mod?.METHODS ?? mod?.methods ?? mod?.default;
    expect(Array.isArray(methods)).toBe(true);
  });

  it('05-02: METHODS has at least 10 entries (top-10 visible on page)', async () => {
    const mod     = await import('@/lib/methodology/methods').catch(() => null);
    const methods = mod?.METHODS ?? mod?.methods ?? mod?.default ?? [];
    expect(methods.length).toBeGreaterThanOrEqual(10);
  });

  it('05-03: every entry has required string fields: id, name, dimension, effectSizeDelta, description, citation', async () => {
    // IE3: "Show all 47" disclosure renders ALL entries — check ALL, not just top-10.
    // test 05-04 (dimensions) and test 05-05 (effort) also validate all entries.
    const mod     = await import('@/lib/methodology/methods').catch(() => null);
    const methods: any[] = mod?.METHODS ?? mod?.methods ?? mod?.default ?? [];
    for (const m of methods) {
      expect(typeof m.id).toBe('string');
      expect(typeof m.name).toBe('string');
      expect(typeof m.dimension).toBe('string');
      expect(typeof m.effectSizeDelta).toBe('string');
      expect(typeof m.description).toBe('string');
      expect(typeof m.citation).toBe('string');
    }
  });

  it('05-04: all dimension values are from the canonical set', async () => {
    const validDimensions = new Set(['frequency', 'position', 'sentiment', 'context', 'accuracy']);
    const mod     = await import('@/lib/methodology/methods').catch(() => null);
    const methods: any[] = mod?.METHODS ?? mod?.methods ?? mod?.default ?? [];
    for (const m of methods) {
      expect(validDimensions.has(m.dimension)).toBe(true);
    }
  });

  it('05-05: all entries have a valid effort value — low | medium | high', async () => {
    // Sprint 11 spec types effort as required: 'low'|'medium'|'high'
    const validEffort = new Set(['low', 'medium', 'high']);
    const mod     = await import('@/lib/methodology/methods').catch(() => null);
    const methods: any[] = mod?.METHODS ?? mod?.methods ?? mod?.default ?? [];
    for (const m of methods) {
      // effort is required by the CitabilityMethod type — must be present and valid
      expect(validEffort.has(m.effort)).toBe(true);
    }
  });

  it('05-06: all ids are unique', async () => {
    const mod     = await import('@/lib/methodology/methods').catch(() => null);
    const methods: any[] = mod?.METHODS ?? mod?.methods ?? mod?.default ?? [];
    const ids = methods.map((m: any) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('05-07: Sprint 11 IE3 — all four named research citations present across methods', async () => {
    // IE3 names ALL FOUR sources: Princeton KDD 2024, AutoGEO ICLR 2026, Tinuiti, SE Ranking
    const expectedCitations = ['Princeton', 'AutoGEO', 'Tinuiti', 'SE Ranking'];
    const mod     = await import('@/lib/methodology/methods').catch(() => null);
    const methods: any[] = mod?.METHODS ?? mod?.methods ?? mod?.default ?? [];
    const allCitations = methods.map((m: any) => m.citation ?? '').join(' ');
    // Every named source must appear at least once (not just one of them)
    for (const expected of expectedCitations) {
      expect(allCitations).toContain(expected);
    }
  });
});
```

-----

### `tests/backend-e2e-s11/helpers/auth-mock.ts`

```typescript
/**
 * Shared mutable auth state for S11 backend E2E tests.
 * Set clerkUserId + organizationId in beforeAll, reset in afterAll.
 *
 * vi.mock() MUST be called in the TEST FILE at top-level (not here)
 * so vitest hoists it above all imports including the route handler.
 */
export const mockAuth = {
  clerkUserId:    '',
  organizationId: '',
};
```

-----

## 5. Run all tests

```bash
# Tests 01, 03, 04, 05 — no dev server required (Node only)
dotenv -e .env.test.local -- \
  pnpm vitest run \
  --config vitest.config.backend-e2e-s11.ts \
  --reporter=verbose \
  --exclude tests/backend-e2e-s11/02-public-seo-routes.test.ts

# Test 02 — ALL cases require a production build (ID3: next-sitemap generates both
# public/robots.txt AND public/sitemap.xml at postbuild — not available in pnpm dev)
pnpm build && pnpm start &
dotenv -e .env.test.local -- \
  pnpm vitest run \
  --config vitest.config.backend-e2e-s11.ts \
  --reporter=verbose \
  tests/backend-e2e-s11/02-public-seo-routes.test.ts

# Run everything at once (requires production build for test 02 — pnpm build && pnpm start)
dotenv -e .env.test.local -- \
  pnpm vitest run \
  --config vitest.config.backend-e2e-s11.ts \
  --reporter=verbose
```

Run a single file during development:

```bash
dotenv -e .env.test.local -- \
  pnpm vitest run \
  --config vitest.config.backend-e2e-s11.ts \
  tests/backend-e2e-s11/03-api-tour-complete.test.ts
```

-----

## 6. PASS criteria

All 5 test files green. Zero orphan rows in the test DB after the run.

|File                     |Tests|Invariant                                                                                                |
|-------------------------|-----|---------------------------------------------------------------------------------------------------------|
|`01-lib-seo-metadata`    |10   |IB1 / IP5 / IC2 — OG url + canonical never `undefined/...`; twitter card type; no placeholder description|
|`02-public-seo-routes`   |6    |IB4 — `/robots.txt` and `/sitemap.xml` return 200, valid content                                         |
|`03-api-tour-complete`   |5    |IC4 / IJ5 — route writes `productTourComplete`, 401 unauth, idempotent, spreads metadata                 |
|`04-db-product-tour-flag`|5    |IJ5 — flag persists in jsonb, coexists with Sprint 10 `firstTimeFlowComplete`                            |
|`05-lib-methodology`     |7    |IE3 — methods.ts shape, 10+ entries, valid dimensions, ALL 4 named citations required, effort required   |

Specifically must pass:

- `01-02`: `buildMetadata` OG URL never contains `"undefined"` (IB1)
- `01-10`: `openGraph.description` is never the literal `"..."` placeholder (IC2)
- `01-09`: `alternates.canonical` is correctly formed — `startsWith('http')`, no `"undefined"` (IP5)
- `03-03`: `org.metadata.productTourComplete === true` after one POST call (IC4)
- `03-05`: metadata spread preserves existing fields (no overwrite of `firstTimeFlowComplete`) (IC4)
- `04-03`: both `productTourComplete` and `firstTimeFlowComplete` coexist in the same jsonb object (IJ5)
- `05-05`: every method entry has a valid `effort` value — not vacuously passed (IE3)
- `05-07`: all four named citations present — Princeton, AutoGEO, Tinuiti, SE Ranking (IE3)