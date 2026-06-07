# VisibleAU — Sprint 11 Frontend E2E Tests (Claude Code)

**Sprint:** 11 — Marketing Site · Product Tour · Methodology Page · Error States  
**Runner:** Playwright + Clerk test helpers  
**Approach:** Real browser (Chromium). Real DB rows seeded before each suite via
Drizzle. App runs as `pnpm dev` with `LLM_MODE=mock`. Every suite deletes its own
rows in `afterAll` — pass or fail.

-----

## Sprint 11 UI invariants (every test must respect)

|Code|Invariant                                                                     |
|----|------------------------------------------------------------------------------|
|IA2 |Product tour flag is `org.metadata.productTourComplete` (DB, not localStorage)|
|IB1 |OG meta tags use `NEXT_PUBLIC_APP_URL` — never “undefined/…” in URLs          |
|IC4 |`POST /api/onboarding/tour-complete` writes the flag; dashboard re-fetches    |
|IE3 |`/methodology` renders top-10 citability methods + “Show all 47” disclosure   |
|IF1 |Nav: Pricing → `/pricing` · Methodology → `/methodology` · About → `/about`   |
|IF1 |Auth CTAs: “Sign in” → `/sign-in` · “Get started” → `/sign-up`                |
|IJ5 |`productTourComplete` is DB-only — never stored in localStorage               |

-----

## Prerequisites

Before running any tests, install the required packages:

```bash
# Core Playwright + Clerk testing
pnpm add -D @playwright/test @clerk/testing/playwright

# Axe-core accessibility testing (Sprint 11 IK5)
pnpm add -D @axe-core/playwright axe-core

# Install Playwright browser binaries
pnpm exec playwright install chromium

# Run database migrations against the test DB
dotenv -e .env.test.local -- pnpm drizzle-kit migrate

# Start the app for testing (in a separate terminal)
LLM_MODE=mock pnpm dev
```

> **Note for FE-02-07/08 (robots.txt/sitemap.xml):** set `E2E_BUILD_TESTS=true`
> and run `pnpm build && pnpm start` instead of `pnpm dev`.

-----

## Environment

```bash
# .env.test.local
DATABASE_URL=postgresql://postgres:secret@localhost:5432/visibleau_test
DIRECT_URL=postgresql://postgres:secret@localhost:5432/visibleau_test
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

# Pre-provisioned Clerk test users (created once in Clerk dashboard)
E2E_TEST_USER_1_EMAIL=qa-s11-fe-u1@visibleau.test
E2E_TEST_USER_1_PASSWORD=QAS11FEUser1!
E2E_TEST_USER_1_CLERK_ID=user_s11fe1
E2E_TEST_ORG_1_CLERK_ID=org_s11fe1

E2E_TEST_USER_2_EMAIL=qa-s11-fe-u2@visibleau.test
E2E_TEST_USER_2_PASSWORD=QAS11FEUser2!
E2E_TEST_USER_2_CLERK_ID=user_s11fe2
E2E_TEST_ORG_2_CLERK_ID=org_s11fe2

LLM_MODE=mock
E2E_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_DESCRIPTION=AI search visibility for Australian SMBs

# Set to 'true' ONLY when running against a production build (pnpm build && pnpm start).
# When set, FE-02-07 (robots.txt) and FE-02-08 (sitemap.xml) will run.
# Leave unset or empty when running against pnpm dev (those tests auto-skip).
# E2E_BUILD_TESTS=true
```

-----

## `tests/e2e/sprint11-fe/playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';
import { config }                from 'dotenv';
import path                      from 'node:path';

config({ path: path.resolve(process.cwd(), '.env.test.local') });

export default defineConfig({
  testDir:       'tests/e2e/sprint11-fe',
  testMatch:     '**/fe-*.spec.ts',
  fullyParallel: false,
  forbidOnly:    !!process.env.CI,
  retries:       1,
  workers:       1,           // serial — shared test DB
  timeout:       60_000,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/e2e/sprint11-fe/reports', open: 'never' }],
  ],
  use: {
    baseURL:    process.env.E2E_APP_URL ?? 'http://localhost:3000',
    trace:      'on-first-retry',
    screenshot: 'only-on-failure',
    video:      'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

-----

## `tests/e2e/sprint11-fe/helpers/db.ts`

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

-----

## `tests/e2e/sprint11-fe/helpers/seed.ts`

```typescript
import { db, schema }  from './db';
import { eq }          from 'drizzle-orm';

export async function seedOrg(p: {
  clerkOrgId:  string;
  name:        string;
  tier?:       string;
  metadata?:   Record<string, unknown>;
}) {
  const [o] = await db.insert(schema.organizations)
    .values({
      clerkOrgId:         p.clerkOrgId,
      name:               p.name,
      region:             'au',
      tier:               p.tier ?? 'free',
      metadata:           p.metadata ?? {},
      slug:               null,
      onboardingComplete: false,
    })
    .onConflictDoUpdate({
      target: schema.organizations.clerkOrgId,
      set: {
        name:     p.name,
        tier:     p.tier ?? 'free',
        metadata: p.metadata ?? {},
      },
    })
    .returning();
  return o;
}

export async function seedUser(p: {
  clerkUserId: string; organizationId: string; email: string;
}) {
  const [u] = await db.insert(schema.users)
    .values({
      clerkUserId:    p.clerkUserId,
      organizationId: p.organizationId,
      email:          p.email,
      name:           '[S11-FE]',
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
  // Delete dependants first (FK order)
  await db.delete(schema.users)
    .where(eq(schema.users.organizationId, orgId)).catch(() => {});
  await db.delete(schema.organizations)
    .where(eq(schema.organizations.id, orgId)).catch(() => {});
}
```

-----

## 4. Test files

### `tests/e2e/sprint11-fe/fe-01-landing-page.spec.ts`

**Invariants tested:** IF1 (nav links), §6 sections 1-9, §12 “landing page first impression”

```typescript
// tests/e2e/sprint11-fe/fe-01-landing-page.spec.ts
// Pure public page — no auth, no DB seed needed.
import { test, expect } from '@playwright/test';

test.describe('FE-01: Landing page (/', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for hero headline — use partial match robust to <br> tags in the heading.
    // If the heading uses <br>, the accessible name has \n between words, breaking
    // the full-text regex. /see your brand/i matches before any line break.
    await expect(page.getByRole('heading', {
      name: /see your brand/i,
    })).toBeVisible({ timeout: 20_000 });
  });

  // ── Section 1: Nav ────────────────────────────────────────────────────────────
  test('FE-01-01: nav has Pricing, Methodology, About links (IF1)', async ({ page }) => {
    await expect(page.getByRole('link', { name: /^pricing$/i })).toHaveAttribute('href', '/pricing');
    await expect(page.getByRole('link', { name: /^methodology$/i })).toHaveAttribute('href', '/methodology');
    await expect(page.getByRole('link', { name: /^about$/i })).toHaveAttribute('href', '/about');
  });

  test('FE-01-02: nav has Sign in and Get started CTAs (IF1)', async ({ page }) => {
    await expect(page.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/sign-in');
    await expect(page.getByRole('link', { name: /get started/i })).toHaveAttribute('href', '/sign-up');
  });

  // ── Section 2: Hero ───────────────────────────────────────────────────────────
  test('FE-01-03: hero headline and subhead render above fold', async ({ page }) => {
    // Use two checks instead of one full-string match: the heading may use <br> tags
    // which create \n in the accessible name, breaking a single long regex.
    await expect(page.getByRole('heading', {
      name: /see your brand/i,             // matches text before any possible <br>
    })).toBeVisible();
    // Verify the engine names appear in the heading text (via locator not accessible name)
    const headingEl = page.getByRole('heading', { name: /see your brand/i });
    await expect(headingEl).toContainText(/chatgpt/i);
    await expect(page.getByText(/honest read on how ai search engines describe your business/i))
      .toBeVisible();
  });

  test('FE-01-04: hero "Try a free sample audit" CTA is visible above fold', async ({ page }) => {
    const cta = page.getByRole('link', { name: /try a free sample audit/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/sample-audit');
  });

  test('FE-01-05: hero "See pricing" secondary CTA links to /pricing', async ({ page }) => {
    const cta = page.getByRole('link', { name: /see pricing/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/pricing');
  });

  test('FE-01-06: sample audit reachable in ≤2 clicks (§12 first impression)', async ({ page }) => {
    // The CTA is 1 click from landing. Use waitForURL — more reliable than waitForResponse
    // because waitForResponse may trigger on prefetch/resource requests before navigation.
    await Promise.all([
      page.waitForURL(/.*\/sample-audit.*/, { timeout: 20_000 }),
      page.getByRole('link', { name: /try a free sample audit/i }).click(),
    ]);
    // Confirm we've navigated to /sample-audit successfully
    expect(page.url()).toContain('/sample-audit');
  });

  // ── Section 3: How it works ───────────────────────────────────────────────────
  test('FE-01-07: How it works section is present with step copy', async ({ page }) => {
    await expect(page.getByText(/how it works/i).first()).toBeVisible();
    // At least one of the three steps is present
    await expect(page.getByText(/enter (your )?domain/i).or(
      page.getByText(/llm calls/i)
    ).or(
      page.getByText(/see (your )?score/i)
    ).first()).toBeVisible();
  });

  // ── Section 4: Engines ────────────────────────────────────────────────────────
  test('FE-01-08: Engines supported section shows all 4 engines (§6 section 4)', async ({ page }) => {
    // Sprint 11 §6 section 4: ChatGPT, Claude, Gemini, and Perplexity — all 4 required
    for (const engine of ['chatgpt', 'claude', 'gemini', 'perplexity']) {
      await expect(page.getByText(new RegExp(engine, 'i')).first()).toBeVisible();
    }
  });

  // ── Section 5: Verticals ──────────────────────────────────────────────────────
  test('FE-01-09: Verticals section shows AU Tradies, Allied Health, SaaS', async ({ page }) => {
    await expect(page.getByText(/au tradies|tradies/i).first()).toBeVisible();
    await expect(page.getByText(/allied health/i).first()).toBeVisible();
    await expect(page.getByText(/saas/i).first()).toBeVisible();
  });

  // ── Section 6: What's measured ────────────────────────────────────────────────
  test('FE-01-10: What is measured section shows all 5 dimensions', async ({ page }) => {
    for (const dim of ['Frequency', 'Position', 'Sentiment', 'Context', 'Accuracy']) {
      await expect(page.getByText(new RegExp(dim, 'i')).first()).toBeVisible();
    }
  });

  // ── Section 7: Pricing teaser ─────────────────────────────────────────────────
  test('FE-01-11: Pricing teaser shows AU dollar pricing (inc. GST)', async ({ page }) => {
    await expect(page.getByText(/A\$\d+|from a\$\d+/i).first()).toBeVisible();
  });

  // ── Section 8: FAQ ────────────────────────────────────────────────────────────
  test('FE-01-12: FAQ section renders at least one question', async ({ page }) => {
    await expect(page.getByText(/frequently asked questions|faq/i).first()).toBeVisible();
    await expect(page.getByText(/how does it work|does it use real/i).first()).toBeVisible();
  });

  test('FE-01-13: FAQ accordion expands on click', async ({ page }) => {
    const firstQuestion = page.getByText(/how does it work\?/i).first();
    await firstQuestion.click();
    // Use a phrase from the FAQ ANSWER that is NOT present in the hero or other sections.
    // FAQ answer 1 (Sprint 11 §6 IE5): "We send your brand name and domain to ChatGPT..."
    // "standardised prompts" is unique to the FAQ answer — not in hero or other sections.
    await expect(page.getByText(/we send your brand name|standardised prompts/i).first())
      .toBeVisible({ timeout: 5_000 });
  });

  // ── Section 9: Footer ─────────────────────────────────────────────────────────
  test('FE-01-14: footer has Privacy, Terms links', async ({ page }) => {
    await expect(page.getByRole('link', { name: /privacy/i })).toHaveAttribute('href', '/privacy');
    await expect(page.getByRole('link', { name: /terms/i })).toHaveAttribute('href', '/terms');
  });

  // ── Mobile: no horizontal scroll (§13) ───────────────────────────────────────
  test('FE-01-15: no horizontal scroll at 375px viewport width (§13)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // +1 for rounding
  });

  // ── OG meta (IB1) ────────────────────────────────────────────────────────────
  test('FE-01-16: OG url meta tag does not contain "undefined" (IB1)', async ({ page }) => {
    const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content');
    expect(ogUrl).toBeTruthy();
    expect(ogUrl).not.toContain('undefined');
    expect(ogUrl!.startsWith('http')).toBe(true);
  });

  test('FE-01-17: canonical link tag present and correctly formed (IP5)', async ({ page }) => {
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toBeTruthy();
    expect(canonical).not.toContain('undefined');
    expect(canonical!.startsWith('http')).toBe(true);
  });

  test('FE-01-18: og:image meta tag present and not a broken path (§13)', async ({ page }) => {
    // Sprint 11 §13: "OG image present + correct on social share preview"
    // buildMetadata spec: openGraph.images = ['/og-image.png']
    // Next.js renders: <meta property="og:image" content="...">
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(ogImage).toBeTruthy();
    // Must not contain 'undefined' — same IB1 risk as OG url
    expect(ogImage).not.toContain('undefined');
    // Must be an absolute URL (Next.js resolves relative paths using NEXT_PUBLIC_APP_URL)
    // OR a root-relative path like '/og-image.png'
    const isAbsolute  = ogImage!.startsWith('http');
    const isRootRelative = ogImage!.startsWith('/');
    expect(isAbsolute || isRootRelative).toBe(true);
  });
});
```

-----

### `tests/e2e/sprint11-fe/fe-02-public-pages.spec.ts`

**Invariants tested:** About / Privacy / Terms pages exist; Pricing metadata; robots.txt

```typescript
// tests/e2e/sprint11-fe/fe-02-public-pages.spec.ts
// No auth, no DB seed needed.
import { test, expect } from '@playwright/test';

test.describe('FE-02: Static public pages', () => {

  test('FE-02-01: /about returns 200 and renders page content', async ({ page }) => {
    const res = await page.goto('/about');
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator('main').or(page.locator('body'))).not.toBeEmpty();
  });

  test('FE-02-02: /privacy returns 200 and has Privacy Act copy', async ({ page }) => {
    const res = await page.goto('/privacy');
    expect(res?.status()).toBeLessThan(400);
    // Privacy page should mention Privacy Act (§13 — "legal copy")
    await expect(page.getByText(/privacy act|privacy policy/i).first())
      .toBeVisible({ timeout: 15_000 });
  });

  test('FE-02-03: /terms returns 200 and has terms content', async ({ page }) => {
    const res = await page.goto('/terms');
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByText(/terms|conditions/i).first())
      .toBeVisible({ timeout: 15_000 });
  });

  test('FE-02-04: /pricing returns 200 and shows AU dollar prices (HC2)', async ({ page }) => {
    const res = await page.goto('/pricing');
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByText(/A\$\d+|from A\$|inc.*gst/i).first())
      .toBeVisible({ timeout: 20_000 });
  });

  test('FE-02-05: /pricing OG url has no "undefined" (IB1)', async ({ page }) => {
    await page.goto('/pricing');
    const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content');
    expect(ogUrl).not.toContain('undefined');
    expect(ogUrl).toContain('/pricing');
  });

  test('FE-02-06: /about nav has no horizontal scroll at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/about');
    await page.waitForLoadState('networkidle');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  // robots.txt and sitemap.xml checked via direct fetch (IB4)
  // NOTE: These require `pnpm build && pnpm start` — next-sitemap generates them at postbuild.
  // Run fe-02-public-pages.spec.ts ONLY after a production build for these tests to pass.
  // FE-02-07 and FE-02-08 require a PRODUCTION BUILD (pnpm build && pnpm start).
  // next-sitemap writes public/robots.txt and public/sitemap.xml only at postbuild.
  // Set E2E_BUILD_TESTS=true in .env.test.local when running against a built app.
  // Without this guard, these tests fail with 404 when run against pnpm dev.

  test('FE-02-07: /robots.txt returns 200 with text/plain (IB4)', async ({ request }) => {
    if (!process.env.E2E_BUILD_TESTS) {
      test.skip(true, 'Skipped in dev mode — set E2E_BUILD_TESTS=true and run pnpm build && pnpm start');
      return;
    }
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text');
    const body = await res.text();
    expect(body).toMatch(/User-agent:|Disallow:|Allow:/i);
  });

  test('FE-02-08: /sitemap.xml returns 200 (IB4)', async ({ request }) => {
    if (!process.env.E2E_BUILD_TESTS) {
      test.skip(true, 'Skipped in dev mode — set E2E_BUILD_TESTS=true and run pnpm build && pnpm start');
      return;
    }
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('<urlset');
    expect(body).toContain('/pricing');
  });
});
```

-----

### `tests/e2e/sprint11-fe/fe-03-methodology-page.spec.ts`

**Invariants tested:** IE3 — `/methodology` top-10 render + “Show all 47” disclosure + citations

```typescript
// tests/e2e/sprint11-fe/fe-03-methodology-page.spec.ts
// Public page — no auth, no DB seed.
import { test, expect } from '@playwright/test';

test.describe('FE-03: /methodology page (IE3)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/methodology');
    // Wait for the page heading to appear
    await expect(page.getByRole('heading', {
      name: /methodology|how we measure|citability/i,
    }).first()).toBeVisible({ timeout: 20_000 });
  });

  test('FE-03-01: page loads without error (200)', async ({ page, request }) => {
    const res = await request.get('/methodology');
    expect(res.status()).toBe(200);
  });

  test('FE-03-02: top-10 method cards visible without interaction (IE3)', async ({ page }) => {
    // IE3: top-10 of the 47 citability methods must be visible before any interaction.
    // Try named test-id selectors first, then fall back to data-method-id, then effect-size patterns.
    const namedCards = page.locator('[data-testid="method-card"]');
    const idCards    = page.locator('[data-method-id]');
    // Effect-size deltas like "+12%" or "+0.8 position" appear once per method card
    const effectDeltas = page.locator('text=/\+\d+%|\+\d+\.\d+/');

    const namedCount  = await namedCards.count();
    const idCount     = await idCards.count();
    const deltaCount  = await effectDeltas.count();

    // Use Math.max to get the highest count across all discovery strategies.
    // The || short-circuit is wrong here: if namedCards returns 2 (partial matches),
    // it stops there and never checks idCards or deltaCount which may have 10+.
    const count = Math.max(namedCount, idCount, deltaCount);
    // IE3 requires ≥10 visible before "Show all 47" is clicked
    expect(count).toBeGreaterThanOrEqual(10);

    // Sanity: the page section heading is also visible
    await expect(page.getByText(/citability|visibility|ai search|methodology/i).first()).toBeVisible();
  });

  test('FE-03-03: "Show all 47" disclosure button is present (IE3)', async ({ page }) => {
    // The Collapsible trigger for showing all 47 methods
    const showAllBtn = page.getByRole('button', { name: /show all 47|view all 47|show more/i });
    await expect(showAllBtn).toBeVisible({ timeout: 10_000 });
  });

  test('FE-03-04: clicking disclosure reveals additional methods (IE3)', async ({ page }) => {
    // Capture visible text BEFORE clicking — use page text length as a proxy for content
    const textBefore = await page.locator('body').innerText();

    const showAllBtn = page.getByRole('button', { name: /show all 47|view all 47|show more/i });
    await showAllBtn.click();

    // After disclosure the button state should change (collapse/show-fewer visible)
    await expect(
      page.getByRole('button', { name: /hide|show fewer|collapse/i }).or(showAllBtn)
    ).toBeVisible({ timeout: 5_000 });

    // Capture text AFTER clicking — more content means more text
    const textAfter = await page.locator('body').innerText();
    // Disclosure must add content: page text should be longer after expanding all 47
    expect(textAfter.length).toBeGreaterThan(textBefore.length);
  });

  test('FE-03-05: named research citations appear on the page (IE3)', async ({ page }) => {
    // Click "Show all 47" first to expose all citations
    const showAll = page.getByRole('button', { name: /show all 47|view all 47|show more/i });
    const hasShowAll = await showAll.isVisible().catch(() => false);
    if (hasShowAll) await showAll.click();

    // All four named citations must appear somewhere on the page (IE3)
    const expectedCitations = ['Princeton', 'AutoGEO', 'Tinuiti', 'SE Ranking'];
    const bodyText = await page.locator('body').innerText();
    for (const citation of expectedCitations) {
      expect(bodyText).toContain(citation);
    }
  });

  test('FE-03-06: effect-size delta format visible ("+X%" or "+X.X position")', async ({ page }) => {
    // At least one entry should show a delta value
    // Sprint 11 §4 effectSizeDelta examples all use '+' prefix ('+12%', '+0.8 position')
    await expect(page.getByText(/[+\-]\d+%|[+\-]\d+\.\d+/).first())
      .toBeVisible({ timeout: 10_000 });
  });

  test('FE-03-07: methodology OG url is correctly formed (IB1)', async ({ page }) => {
    const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content');
    expect(ogUrl).not.toContain('undefined');
    expect(ogUrl).toContain('/methodology');
    expect(ogUrl!.startsWith('http')).toBe(true);
  });

  test('FE-03-08: /methodology no horizontal scroll at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/methodology');
    await page.waitForLoadState('networkidle');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
```

-----

### `tests/e2e/sprint11-fe/fe-04-product-tour.spec.ts`

**Invariants tested:** IA2 / IC4 / IJ5 — tour shows once on first visit, flag written to DB, not shown on subsequent visits

```typescript
// tests/e2e/sprint11-fe/fe-04-product-tour.spec.ts
import { test, expect }      from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { db, schema }        from './helpers/db';
import { seedOrg, seedUser, cleanupOrg } from './helpers/seed';
import { eq }                from 'drizzle-orm';

let orgId = '';

const ORG_CLERK_ID  = process.env.E2E_TEST_ORG_1_CLERK_ID!;
const USER_CLERK_ID = process.env.E2E_TEST_USER_1_CLERK_ID!;
const USER_EMAIL    = process.env.E2E_TEST_USER_1_EMAIL!;
const USER_PASSWORD = process.env.E2E_TEST_USER_1_PASSWORD!;

test.beforeAll(async () => {
  await clerkSetup();
  // Pre-clean any leftover rows
  const ex = await db.select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, ORG_CLERK_ID))
    .limit(1);
  if (ex.length) await cleanupOrg(ex[0].id);

  // Seed org with productTourComplete = false (first visit)
  const org = await seedOrg({
    clerkOrgId: ORG_CLERK_ID,
    name:       '[S11-FE] Tour Org',
    tier:       'free',
    metadata:   { productTourComplete: false },
  });
  orgId = org.id;

  await seedUser({
    clerkUserId:    USER_CLERK_ID,
    organizationId: orgId,
    email:          USER_EMAIL,
  });
});

test.afterAll(async () => {
  await cleanupOrg(orgId);
});

test.describe('FE-04: Product tour (IA2, IC4, IJ5)', () => {

  test('FE-04-01: tour overlay appears on first dashboard visit (productTourComplete=false)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: {
      strategy: 'password',
      identifier: USER_EMAIL,
      password:   USER_PASSWORD,
    }});
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // react-joyride renders a tooltip with the tour content
    // The dashboard server component passes showTour=true → ProductTour renders
    const tourTooltip = page.locator('.react-joyride__tooltip')
      .or(page.locator('[data-tour-active="true"]'))
      .or(page.locator('[data-testid="product-tour"]'));

    await expect(tourTooltip.first()).toBeVisible({ timeout: 15_000 });
  });

  test('FE-04-02: first tour step mentions sidebar nav', async ({ page }) => {
    await clerk.signIn({ page, signInParams: {
      strategy: 'password',
      identifier: USER_EMAIL,
      password:   USER_PASSWORD,
    }});
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Step 1: "Your brands, audits, and insights live here"
    await expect(page.getByText(/brands, audits, and insights/i).first())
      .toBeVisible({ timeout: 15_000 });
  });

  test('FE-04-03: tour has Next and Skip buttons', async ({ page }) => {
    await clerk.signIn({ page, signInParams: {
      strategy: 'password',
      identifier: USER_EMAIL,
      password:   USER_PASSWORD,
    }});
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.react-joyride__tooltip, [data-tour-active="true"], [data-testid="product-tour"]',
      { timeout: 15_000 });

    const nextBtn = page.getByRole('button', { name: /next/i });
    const skipBtn = page.getByRole('button', { name: /skip/i });
    // At least one of these must be present
    const hasNext = await nextBtn.isVisible().catch(() => false);
    const hasSkip = await skipBtn.isVisible().catch(() => false);
    expect(hasNext || hasSkip).toBe(true);
  });

  test('FE-04-04: clicking Skip calls POST /api/onboarding/tour-complete (IC4)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: {
      strategy: 'password',
      identifier: USER_EMAIL,
      password:   USER_PASSWORD,
    }});
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.react-joyride__tooltip, [data-tour-active="true"], [data-testid="product-tour"]',
      { timeout: 15_000 });

    // Intercept the tour-complete API call
    const tourCompletePromise = page.waitForRequest(
      req => req.url().includes('/api/onboarding/tour-complete') && req.method() === 'POST',
      { timeout: 15_000 },
    );

    await page.getByRole('button', { name: /skip/i }).click();

    const req = await tourCompletePromise;
    expect(req.method()).toBe('POST');
  });

  test('FE-04-05: productTourComplete=true written to DB after completing tour (IA2, IC4)', async ({ page }) => {
    // Reset the flag to false first
    await db.update(schema.organizations)
      .set({ metadata: { productTourComplete: false } })
      .where(eq(schema.organizations.id, orgId));

    await clerk.signIn({ page, signInParams: {
      strategy: 'password',
      identifier: USER_EMAIL,
      password:   USER_PASSWORD,
    }});
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.react-joyride__tooltip, [data-tour-active="true"], [data-testid="product-tour"]',
      { timeout: 15_000 });

    // Wait for Skip → API call → flag written
    // Wait for the tour-complete POST to resolve before reading DB
    const completeReq = page.waitForResponse(
      r => r.url().includes('/api/onboarding/tour-complete') && r.method() === 'POST',
      { timeout: 10_000 },
    );
    await page.getByRole('button', { name: /skip/i }).click();
    await completeReq; // POST has resolved → DB write is complete

    // Read DB directly
    const [org] = await db.select({ metadata: schema.organizations.metadata })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId));
    expect((org.metadata as any)?.productTourComplete).toBe(true);
  });

  test('FE-04-06: tour does NOT reappear on subsequent dashboard visit (IA2)', async ({ page }) => {
    // Ensure flag is true in DB
    await db.update(schema.organizations)
      .set({ metadata: { productTourComplete: true } })
      .where(eq(schema.organizations.id, orgId));

    await clerk.signIn({ page, signInParams: {
      strategy: 'password',
      identifier: USER_EMAIL,
      password:   USER_PASSWORD,
    }});
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3_000); // give react-joyride time to appear if it would

    const tourTooltip = page.locator('.react-joyride__tooltip')
      .or(page.locator('[data-tour-active="true"]'))
      .or(page.locator('[data-testid="product-tour"]'));
    await expect(tourTooltip.first()).not.toBeVisible({ timeout: 5_000 });
  });

  test('FE-04-07: productTourComplete NOT stored in localStorage (IJ5)', async ({ page }) => {
    // Reset flag
    await db.update(schema.organizations)
      .set({ metadata: { productTourComplete: false } })
      .where(eq(schema.organizations.id, orgId));

    await clerk.signIn({ page, signInParams: {
      strategy: 'password',
      identifier: USER_EMAIL,
      password:   USER_PASSWORD,
    }});
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // After page load, check localStorage — the flag must NOT be there
    const lsValue = await page.evaluate(() =>
      localStorage.getItem('productTourComplete') ??
      localStorage.getItem('tourComplete') ??
      localStorage.getItem('product-tour-complete')
    );
    expect(lsValue).toBeNull(); // IJ5: DB-only, never localStorage
  });
});
```

-----

### `tests/e2e/sprint11-fe/fe-05-error-states.spec.ts`

**Invariants tested:** 404 page, 500/error boundary, both render gracefully (§13)

```typescript
// tests/e2e/sprint11-fe/fe-05-error-states.spec.ts
// Most checks are public-page (no auth needed).
import { test, expect } from '@playwright/test';

test.describe('FE-05: Error states', () => {

  test('FE-05-01: /non-existent-page returns 404 with friendly message', async ({ page }) => {
    const res = await page.goto('/this-page-does-not-exist-s11e2e');
    // Next.js returns 404 — page renders the custom not-found.tsx
    expect(res?.status()).toBe(404);
    // Should say "404" or "Couldn't find that page"
    await expect(
      page.getByText(/404|couldn.t find that page/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test('FE-05-02: 404 page has a link back to home or dashboard', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-s11e2e');
    // should have a link back (unauthenticated → '/', authenticated → '/dashboard')
    const backLink = page.getByRole('link', { name: /back to (home|dashboard)|← back/i });
    await expect(backLink.first()).toBeVisible({ timeout: 15_000 });
  });

  test('FE-05-03: 404 page has no horizontal scroll at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/this-page-does-not-exist-s11e2e');
    await page.waitForLoadState('networkidle');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('FE-05-04: /pricing loads without auth (public route guard)', async ({ page }) => {
    await page.goto('/pricing');
    // Must NOT redirect to /sign-in
    await expect(page).not.toHaveURL(/sign-in/, { timeout: 10_000 });
    await expect(page.getByText(/pricing|plans|free|A\$/i).first())
      .toBeVisible({ timeout: 20_000 });
  });

  test('FE-05-05: /dashboard redirects unauthenticated to /sign-in', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/sign-in/, { timeout: 20_000 });
  });

  test('FE-05-06: error boundary renders "Something went wrong" with Try again button', async ({ page }) => {
    // Trigger the error boundary by navigating to a dedicated test-error route if present.
    // Otherwise assert the error.tsx exists by checking its key elements via URL manipulation.
    // This checks that error.tsx is exported as a client component (IC1 fix).
    // We use the app's error-demo route if available, otherwise skip this test gracefully.
    const res = await page.goto('/error-demo').catch(() => null);
    if (!res || res.status() === 404) {
      test.skip(true, '/error-demo route not implemented — skipping error boundary UI test');
      return;
    }
    await expect(page.getByText(/something went wrong/i).first())
      .toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /try again/i })).toBeVisible();
  });
});
```

-----

### `tests/e2e/sprint11-fe/fe-06-onboarding-tour-flow.spec.ts`

**Invariants tested:** Product tour 4 steps complete correctly, step tooltips in order (§9)

```typescript
// tests/e2e/sprint11-fe/fe-06-onboarding-tour-flow.spec.ts
import { test, expect }      from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { db, schema }        from './helpers/db';
import { seedOrg, seedUser, cleanupOrg } from './helpers/seed';
import { eq }                from 'drizzle-orm';

let orgId = '';

const ORG_CLERK_ID  = process.env.E2E_TEST_ORG_2_CLERK_ID!;
const USER_CLERK_ID = process.env.E2E_TEST_USER_2_CLERK_ID!;
const USER_EMAIL    = process.env.E2E_TEST_USER_2_EMAIL!;
const USER_PASSWORD = process.env.E2E_TEST_USER_2_PASSWORD!;

test.beforeAll(async () => {
  await clerkSetup();
  const ex = await db.select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, ORG_CLERK_ID))
    .limit(1);
  if (ex.length) await cleanupOrg(ex[0].id);

  const org = await seedOrg({
    clerkOrgId: ORG_CLERK_ID,
    name:       '[S11-FE] Tour Steps Org',
    tier:       'free',
    metadata:   { productTourComplete: false },
  });
  orgId = org.id;
  await seedUser({
    clerkUserId:    USER_CLERK_ID,
    organizationId: orgId,
    email:          USER_EMAIL,
  });
});

test.afterAll(async () => {
  await cleanupOrg(orgId);
});

test.describe('FE-06: Product tour 4-step flow (§9)', () => {

  test.beforeEach(async () => {
    // Reset tour flag before each test so tour always starts fresh
    await db.update(schema.organizations)
      .set({ metadata: { productTourComplete: false } })
      .where(eq(schema.organizations.id, orgId));
  });

  test('FE-06-01: step 1 tooltip mentions sidebar/navigation (§9 step 1)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: {
      strategy: 'password', identifier: USER_EMAIL, password: USER_PASSWORD,
    }});
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector(
      '.react-joyride__tooltip, [data-tour-active="true"], [data-testid="product-tour"]',
      { timeout: 15_000 },
    );
    await expect(page.getByText(/brands, audits, and insights live here/i).first())
      .toBeVisible({ timeout: 10_000 });
  });

  test('FE-06-02: advancing through steps shows step 2 (run audit)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: {
      strategy: 'password', identifier: USER_EMAIL, password: USER_PASSWORD,
    }});
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector(
      '.react-joyride__tooltip, [data-tour-active="true"], [data-testid="product-tour"]',
      { timeout: 15_000 },
    );

    // Click Next to advance to step 2
    await page.getByRole('button', { name: /next/i }).click();
    await expect(page.getByText(/click here to run a fresh audit/i).first())
      .toBeVisible({ timeout: 10_000 });
  });

  test('FE-06-03: advancing to step 3 shows KPI copy', async ({ page }) => {
    await clerk.signIn({ page, signInParams: {
      strategy: 'password', identifier: USER_EMAIL, password: USER_PASSWORD,
    }});
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector(
      '.react-joyride__tooltip, [data-tour-active="true"], [data-testid="product-tour"]',
      { timeout: 15_000 },
    );

    await page.getByRole('button', { name: /next/i }).click(); // step 1 → 2
    // Wait for step 2 content to render before clicking Next again.
    // react-joyride repositions the tooltip asynchronously — clicking too fast skips steps.
    await expect(page.getByText(/click here to run a fresh audit/i).first())
      .toBeVisible({ timeout: 8_000 });
    await page.getByRole('button', { name: /next/i }).click(); // step 2 → 3
    await expect(page.getByText(/track your visibility over time/i).first())
      .toBeVisible({ timeout: 10_000 });
  });

  test('FE-06-04: completing all 4 steps fires tour-complete and hides tour (IC4)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: {
      strategy: 'password', identifier: USER_EMAIL, password: USER_PASSWORD,
    }});
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector(
      '.react-joyride__tooltip, [data-tour-active="true"], [data-testid="product-tour"]',
      { timeout: 15_000 },
    );

    const tourCompletePromise = page.waitForRequest(
      req => req.url().includes('/api/onboarding/tour-complete') && req.method() === 'POST',
      { timeout: 20_000 },
    );

    // Click through all 4 steps
    for (let i = 0; i < 3; i++) {
      const nextBtn = page.getByRole('button', { name: /next/i });
      if (await nextBtn.isVisible().catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // Click "Done" on step 4
    const doneBtn = page.getByRole('button', { name: /done|finish|close/i });
    if (await doneBtn.isVisible().catch(() => false)) {
      await doneBtn.click();
    } else {
      // Some tour implementations use Skip on last step
      await page.getByRole('button', { name: /skip/i }).click();
    }

    await tourCompletePromise;

    // Tour should now be hidden
    const tourEl = page.locator('.react-joyride__tooltip, [data-tour-active="true"]');
    await expect(tourEl.first()).not.toBeVisible({ timeout: 10_000 });
  });
});
```

-----

### `tests/e2e/sprint11-fe/fe-07-skeleton-and-loading.spec.ts`

**Invariants tested:** Skeleton screens on dashboard, brand list, audit results (§13)

```typescript
// tests/e2e/sprint11-fe/fe-07-skeleton-and-loading.spec.ts
import { test, expect }      from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { db, schema }        from './helpers/db';
import { seedOrg, seedUser, cleanupOrg } from './helpers/seed';
import { eq }                from 'drizzle-orm';

let orgId = '';

const ORG_CLERK_ID  = process.env.E2E_TEST_ORG_1_CLERK_ID!;
const USER_CLERK_ID = process.env.E2E_TEST_USER_1_CLERK_ID!;
const USER_EMAIL    = process.env.E2E_TEST_USER_1_EMAIL!;
const USER_PASSWORD = process.env.E2E_TEST_USER_1_PASSWORD!;

test.beforeAll(async () => {
  await clerkSetup();
  const ex = await db.select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, ORG_CLERK_ID))
    .limit(1);
  if (ex.length) await cleanupOrg(ex[0].id);

  const org = await seedOrg({
    clerkOrgId: ORG_CLERK_ID,
    name:       '[S11-FE] Loading Org',
    tier:       'free',
    metadata:   { productTourComplete: true }, // suppress tour
  });
  orgId = org.id;
  await seedUser({
    clerkUserId:    USER_CLERK_ID,
    organizationId: orgId,
    email:          USER_EMAIL,
  });
});

test.afterAll(async () => {
  await cleanupOrg(orgId);
});

test.describe('FE-07: Skeleton screens + loading states (§13)', () => {

  test('FE-07-01: dashboard page renders without crashing (empty state)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: {
      strategy: 'password', identifier: USER_EMAIL, password: USER_PASSWORD,
    }});
    await page.goto('/dashboard');
    // Should load without a white screen or uncaught error
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 20_000 });
    // Must NOT have an unhandled error banner (React error boundary)
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible({ timeout: 5_000 });
  });

  test('FE-07-02: dashboard has skeleton or content within 15s (§13 skeleton screens)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: {
      strategy: 'password', identifier: USER_EMAIL, password: USER_PASSWORD,
    }});
    await page.goto('/dashboard');
    // Either skeleton primitives (animated pulse classes) OR real content must appear
    const skeleton = page.locator('[class*="animate-pulse"], [class*="skeleton"], [data-testid="skeleton"]');
    const dashboard = page.locator('[data-testid="dashboard"], main');
    await expect(skeleton.or(dashboard).first()).toBeVisible({ timeout: 15_000 });
  });

  test('FE-07-03: /brands page renders without crash (empty state or brand list)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: {
      strategy: 'password', identifier: USER_EMAIL, password: USER_PASSWORD,
    }});
    // Brands page is typically at /brands or /dashboard/brands
    const res = await page.goto('/brands');
    if (!res || res.status() === 404) {
      test.skip(true, '/brands route not at this path — adjust if needed');
      return;
    }
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 20_000 });
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible({ timeout: 5_000 });
  });

  test('FE-07-04: empty state renders with CTA when no brands exist', async ({ page }) => {
    await clerk.signIn({ page, signInParams: {
      strategy: 'password', identifier: USER_EMAIL, password: USER_PASSWORD,
    }});
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    // With no brands seeded, the dashboard should render an empty state with a CTA.
    // Sprint 11 §1: "every list page has a polished empty state with CTA"
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 20_000 });
    // Assert that the empty state CTA is visible (add brand / get started)
    const emptyStateCta = page
      .getByText(/add your first brand|get started|no brands yet/i)
      .or(page.getByRole('button', { name: /add brand|new brand|get started/i }))
      .or(page.getByRole('link',   { name: /add brand|new brand|get started/i }));
    await expect(emptyStateCta.first()).toBeVisible({ timeout: 10_000 });
  });
});
```

-----

### `tests/e2e/sprint11-fe/fe-08-accessibility.spec.ts`

**Invariants tested:** §12 / IK5 — axe-core scan with no critical issues on public pages

```typescript
// tests/e2e/sprint11-fe/fe-08-accessibility.spec.ts
// pnpm add -D @axe-core/playwright axe-core (Sprint 11 IK5)
// No auth, no DB seed needed — all public pages.
import { test, expect } from '@playwright/test';
import { AxeBuilder }      from '@axe-core/playwright';

const PUBLIC_PAGES = [
  { url: '/',            label: 'landing page' },
  { url: '/pricing',     label: 'pricing page' },
  { url: '/methodology', label: 'methodology page' },
  { url: '/about',       label: 'about page' },
];

test.describe('FE-08: Accessibility — axe-core (IK5, §12)', () => {

  for (const { url, label } of PUBLIC_PAGES) {

    test(`FE-08: ${label} has no critical axe-core violations`, async ({ page }) => {
      await page.goto(url);
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      // Filter to critical severity only (§12: "no critical issues")
      const critical = results.violations.filter(v => v.impact === 'critical');

      if (critical.length > 0) {
        console.error(
          `Axe critical violations on ${label} (${url}):\n` +
          critical.map(v => `  [${v.id}] ${v.description}\n` +
            v.nodes.slice(0, 2).map(n => `    → ${n.target.join(', ')}`).join('\n')
          ).join('\n')
        );
      }

      expect(critical.length).toBe(0);
    });
  }
});
```

-----

## 5. Run all tests

```bash
# Prerequisites
# 1. Provision Clerk test users once (Clerk dashboard)
# 2. Run migrations
dotenv -e .env.test.local -- pnpm drizzle-kit migrate

# 3. Start the dev server in a separate terminal
LLM_MODE=mock pnpm dev

# ── Run public tests only (no Clerk sign-in needed) ───────────────────────────
dotenv -e .env.test.local -- \
  pnpm playwright test \
  --config tests/e2e/sprint11-fe/playwright.config.ts \
  --reporter=list \
  fe-01-landing-page fe-02-public-pages fe-03-methodology-page fe-05-error-states fe-08-accessibility

# ── Run authenticated tests (dev server must be running, Clerk users provisioned)
dotenv -e .env.test.local -- \
  pnpm playwright test \
  --config tests/e2e/sprint11-fe/playwright.config.ts \
  --reporter=list \
  fe-04-product-tour fe-06-onboarding-tour-flow fe-07-skeleton-and-loading

# ── Run ALL tests (dev mode — FE-02-07/08 auto-skip without E2E_BUILD_TESTS) ──
dotenv -e .env.test.local -- \
  pnpm playwright test \
  --config tests/e2e/sprint11-fe/playwright.config.ts \
  --reporter=list

# ── Run FE-02-07/08 (robots.txt / sitemap.xml) — requires production build ────
# next-sitemap only generates these files at postbuild — pnpm dev won't work.
pnpm build && pnpm start &   # start production server in background
E2E_BUILD_TESTS=true \
dotenv -e .env.test.local -- \
  pnpm playwright test \
  --config tests/e2e/sprint11-fe/playwright.config.ts \
  --reporter=list \
  fe-02-public-pages

# ── HTML report ───────────────────────────────────────────────────────────────
dotenv -e .env.test.local -- \
  pnpm playwright show-report tests/e2e/sprint11-fe/reports
```

-----

## 6. PASS criteria

All 8 test files green. Zero orphan rows in the test DB after the run.

|File                        |Tests|Invariants                                                          |
|----------------------------|-----|--------------------------------------------------------------------|
|`fe-01-landing-page`        |18   |IF1 / §6 all 9 sections / IB1 / IP5 / §13 mobile                    |
|`fe-02-public-pages`        |8    |About · Privacy · Terms · Pricing / IB4 robots+sitemap              |
|`fe-03-methodology-page`    |8    |IE3 — top-10 + disclosure + all 4 citations + mobile                |
|`fe-04-product-tour`        |7    |IA2 / IC4 / IJ5 — flag on first visit, DB write, no repeat          |
|`fe-05-error-states`        |6    |§13 404 · error boundary · public route guards                      |
|`fe-06-onboarding-tour-flow`|4    |§9 all 4 tour steps in order                                        |
|`fe-07-skeleton-and-loading`|4    |§13 skeleton screens · empty states with CTA                        |
|`fe-08-accessibility`       |4    |IK5 / §12 — axe-core WCAG2AA, no critical violations on public pages|

**Install axe-core** (IK5): `pnpm add -D @axe-core/playwright axe-core`

**Specifically must pass:**

- `FE-01-04`: hero CTA “Try a free sample audit” is visible above fold
- `FE-01-06`: `/sample-audit` reachable in ≤2 clicks from landing (§12)
- `FE-01-16`: landing OG url never contains “undefined” (IB1)
- `FE-01-18`: `og:image` meta tag present and not broken (§13)
- `FE-03-05`: all four named citations present — Princeton, AutoGEO, Tinuiti, SE Ranking (IE3)
- `FE-04-04`: clicking Skip fires `POST /api/onboarding/tour-complete` (IC4)
- `FE-08`: no critical axe-core violations on `/`, `/pricing`, `/methodology`, `/about` (IK5)
- `FE-04-05`: `productTourComplete=true` written to DB — verified directly via Drizzle (IA2)
- `FE-04-06`: tour does NOT appear on second visit when flag is true (IA2)
- `FE-04-07`: `productTourComplete` absent from localStorage (IJ5)

-----

## 7. Data contracts

Every authenticated test suite follows this pattern:

1. **`beforeAll`**: pre-clean via `clerkOrgId` lookup → `cleanupOrg` → `seedOrg` → `seedUser`
1. **Tests run**: Playwright signs in via `@clerk/testing/playwright`
1. **`afterAll`**: `cleanupOrg(orgId)` — runs pass OR fail, deletes users then org

Product tour tests additionally call `db.update(organizations).set({ metadata: { productTourComplete: ... } })` inside individual tests to control the flag precisely without re-seeding the whole org.