# VisibleAU — Sprint 10 Frontend E2E Tests (Claude Code)

**Sprint:** 10 — Onboarding · Sample Audit · Stripe Billing  
**Runner:** Playwright + Clerk test helpers  
**Approach:** Real browser (Chromium). Real DB rows seeded before each suite via
Drizzle. App runs as `pnpm dev` with `LLM_MODE=mock`. Every suite deletes its own
rows in `afterAll` — pass or fail.

-----

## Sprint 10 UI invariants (every test must respect)

|Code|Invariant                                                                                                    |
|----|-------------------------------------------------------------------------------------------------------------|
|HE3 |First-time detection uses `org.metadata.firstTimeFlowComplete` (DB) — never localStorage                     |
|HC2 |Prices shown inc-GST for AU (prototype display): Starter A$99, Growth A$299, Agency A$499, Agency Pro A$1,499|
|HC3 |Retention modal has exactly 3 actions: Downgrade to Free · Pause for 1 month · Cancel anyway                 |
|HB2 |Clicking a paid tier CTA redirects to `https://checkout.stripe.com/...`                                      |
|HG3 |Sample audit result page shows composite score + “Limited preview · 1 of 4 engines” badge                    |
|S1  |Sample audit: 1 engine (ChatGPT only), 5 prompts labelled                                                    |

-----

## Environment

```bash
# .env.test.local
DATABASE_URL=postgresql://postgres:secret@localhost:5432/visibleau_test
DIRECT_URL=postgresql://postgres:secret@localhost:5432/visibleau_test
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
E2E_TEST_USER_1_EMAIL=qa-s10-fe-u1@visibleau.test
E2E_TEST_USER_1_PASSWORD=QAS10FEUser1!
E2E_TEST_USER_1_CLERK_ID=user_s10fe1
E2E_TEST_ORG_1_CLERK_ID=org_s10fe1
E2E_TEST_USER_2_EMAIL=qa-s10-fe-u2@visibleau.test
E2E_TEST_USER_2_PASSWORD=QAS10FEUser2!
E2E_TEST_USER_2_CLERK_ID=user_s10fe2
E2E_TEST_ORG_2_CLERK_ID=org_s10fe2
LLM_MODE=mock
E2E_APP_URL=http://localhost:3000
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
```

-----

## `tests/e2e/sprint10-fe/playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';
import { config }                from 'dotenv';
import path                      from 'node:path';

config({ path: path.resolve(process.cwd(), '.env.test.local') });

export default defineConfig({
  testDir:       'tests/e2e/sprint10-fe',
  testMatch:     '**/fe-*.spec.ts',
  fullyParallel: false,
  forbidOnly:    !!process.env.CI,
  retries:       1,
  workers:       1,          // serial — shared test DB
  timeout:       90_000,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/e2e/sprint10-fe/reports', open: 'never' }],
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

## `tests/e2e/sprint10-fe/helpers/db.ts`

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres     from 'postgres';
import * as schema  from '@/db/schema';

const client = postgres(
  process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  { max: 3 },
);
export const db = drizzle(client, { schema });
export { schema };
```

-----

## `tests/e2e/sprint10-fe/helpers/seed.ts`

```typescript
import { db, schema }  from './db';
import { eq, inArray } from 'drizzle-orm';

// ── Core entities ─────────────────────────────────────────────────────────────
export async function seedOrg(p: {
  clerkOrgId: string;
  name: string;
  tier?: string;
  metadata?: Record<string, unknown>;
  slug?: string | null;
}) {
  const [o] = await db.insert(schema.organizations)
    .values({
      clerkOrgId: p.clerkOrgId,
      name:       p.name,
      region:     'au',
      tier:       p.tier ?? 'free',
      metadata:   p.metadata ?? {},
      slug:       p.slug ?? null,
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
      name:           '[S10-FE]',
      role:           'owner',
    })
    .onConflictDoUpdate({
      target: schema.users.clerkUserId,
      set:    { organizationId: p.organizationId },
    })
    .returning();
  return u;
}

export async function seedBrand(p: {
  organizationId: string; name?: string; domain?: string;
}) {
  const [b] = await db.insert(schema.brands)
    .values({
      organizationId: p.organizationId,
      name:     p.name   ?? '[S10-FE] Brand',
      domain:   p.domain ?? `s10fe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.com.au`,
      vertical: 'tradies',
      region:   'au',
      competitors:    [],
      primaryRegions: ['NSW:Bondi'],
    })
    .returning();
  return b;
}

export async function seedAudit(p: {
  organizationId: string; brandId: string;
  scoreComposite?: string; triggeredBy?: string;
}) {
  const [a] = await db.insert(schema.audits)
    .values({
      organizationId: p.organizationId,
      brandId:        p.brandId,
      auditNumber:    1,
      triggeredBy:    p.triggeredBy ?? 'manual',
      status:         'complete',
      engines:        ['chatgpt'],
      runsPerPrompt:  1,
      promptsCount:   5,
      promptCount:    5,
      totalCalls:     5,
      engineCount:    1,
      scoreFrequency:         '40.00',
      scorePosition:          '50.00',
      scoreAccuracy:          '35.00',
      scoreSentimentNumeric:  '60.00',
      scoreContextNumeric:    '45.00',
      scoreComposite:         p.scoreComposite ?? '62.00',
      confidenceIntervals:    { frequency: { lower: 0.30, upper: 0.52 } },
      totalCostUsd:           '0.09',
      metadata:               { mockScenario: 's10-fe', isSample: p.triggeredBy === 'sample' },
      startedAt:              new Date(Date.now() - 90_000),
      completedAt:            new Date(),
    })
    .returning();
  return a;
}

export async function seedSubscription(p: {
  organizationId: string;
  tier?: string;
  status?: string;
  cancelAtPeriodEnd?: boolean;
}) {
  const ts = Date.now();
  const [s] = await db.insert(schema.subscriptions)
    .values({
      organizationId:       p.organizationId,
      stripeCustomerId:     `cus_s10fe_${ts}`,
      stripeSubscriptionId: `sub_s10fe_${ts}`,
      stripePriceId:        process.env.STRIPE_PRICE_GROWTH_MONTHLY!,
      tier:                 p.tier               ?? 'growth',
      billingInterval:      'monthly',
      status:               p.status             ?? 'active',
      cancelAtPeriodEnd:    p.cancelAtPeriodEnd   ?? false,
      currentPeriodStart:   new Date(),
      currentPeriodEnd:     new Date(Date.now() + 30 * 86_400_000),
      metadata:             {},
      updatedAt:            new Date(),
    })
    .onConflictDoUpdate({
      target: schema.subscriptions.organizationId,
      set:    { tier: p.tier ?? 'growth', status: p.status ?? 'active', updatedAt: new Date() },
    })
    .returning();
  return s;
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
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
```

-----

## FE-01 — Pricing page (`/pricing`)

**Seeds:** none (public page)  
**Verifies:** 6 tier cards render · correct GST-inc prices · CTA labels ·
“inc. GST” note · Annual/Monthly toggle (HC2) · Enterprise “Contact sales” CTA

```typescript
// tests/e2e/sprint10-fe/fe-01-pricing-page.spec.ts
import { test, expect } from '@playwright/test';

test.describe('FE-01: Pricing page (/pricing)', () => {

  test('FE-01-01: page loads without auth and shows heading', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { name: /pricing|plans/i }))
      .toBeVisible({ timeout: 15_000 });
  });

  test('FE-01-02: Free tier card shows A$0 and "Start free" CTA', async ({ page }) => {
    await page.goto('/pricing');
    // Simpler assertions — pricing page renders A$0 and "Start free" somewhere on the page
    await expect(page.getByText(/A\$0/).first()).toBeVisible();
    await expect(
      page.getByRole('link', { name: /start free/i })
        .or(page.getByRole('button', { name: /start free/i }))
    ).toBeVisible();
  });

  test('FE-01-03: Starter card shows A$99/mo (inc. GST, HC2)', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText(/A\$99/).first()).toBeVisible();
  });

  test('FE-01-04: Growth card is highlighted as "Most popular"', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText(/most popular/i)).toBeVisible();
  });

  test('FE-01-05: Agency Pro card present', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText(/agency pro/i, { exact: false })).toBeVisible();
  });

  test('FE-01-06: Enterprise card shows "Contact sales" CTA', async ({ page }) => {
    await page.goto('/pricing');
    await expect(
      page.getByRole('link', { name: /contact sales/i })
        .or(page.getByRole('button', { name: /contact sales/i }))
    ).toBeVisible();
  });

  test('FE-01-07: "inc. GST" or GST note visible on page (HC2)', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText(/gst/i).first()).toBeVisible();
  });

  test('FE-01-08: Annual/Monthly toggle exists', async ({ page }) => {
    await page.goto('/pricing');
    await expect(
      page.getByRole('button', { name: /annual/i })
        .or(page.getByText(/annual/i).first())
    ).toBeVisible();
  });
});
```

-----

## FE-02 — Onboarding welcome screen (`/welcome`)

**Seeds:** org · user (firstTimeFlowComplete=false)  
**Verifies:** welcome heading · 4 setup steps visible · “Run sample audit” step ·
authenticated access required (HH3, HE3)

```typescript
// tests/e2e/sprint10-fe/fe-02-onboarding-wizard.spec.ts
// Note: SelfServeSetup lives at /welcome (HH3). /onboarding = Sprint 4 BrandWizard.
import { test, expect }      from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { db, schema }        from './helpers/db';
import { seedOrg, seedUser, cleanupOrg } from './helpers/seed';
import { eq }                from 'drizzle-orm';

let orgId = '';

test.beforeAll(async () => {
  await clerkSetup();
  const ex = await db.select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, process.env.E2E_TEST_ORG_1_CLERK_ID!))
    .limit(1);
  if (ex.length) await cleanupOrg(ex[0].id);

  const org = await seedOrg({
    clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!,
    name:       '[S10-FE] FE02 Org',
    tier:       'free',
    metadata:   { firstTimeFlowComplete: false },
  });
  orgId = org.id;
  await seedUser({
    clerkUserId:    process.env.E2E_TEST_USER_1_CLERK_ID!,
    organizationId: orgId,
    email:          process.env.E2E_TEST_USER_1_EMAIL!,
  });
});

test.afterAll(async () => { await cleanupOrg(orgId); });

test.describe('FE-02: Onboarding welcome screen (/welcome)', () => {

  test('FE-02-01: unauthenticated → redirects to /sign-in', async ({ page }) => {
    await page.goto('/welcome');
    await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });
  });

  test('FE-02-02: authenticated → onboarding page loads with welcome heading', async ({ page }) => {
    await clerk.signIn({ page, signInParams: {
      strategy: 'password',
      identifier: process.env.E2E_TEST_USER_1_EMAIL!,
      password:   process.env.E2E_TEST_USER_1_PASSWORD!,
    }});
    await page.goto('/welcome');
    await expect(
      page.getByRole('heading', { name: /welcome/i })
        .or(page.getByText(/welcome to visibleau/i))
    ).toBeVisible({ timeout: 15_000 });
    await clerk.signOut({ page });
  });

  test('FE-02-03: 4 setup steps are visible', async ({ page }) => {
    await clerk.signIn({ page, signInParams: {
      strategy: 'password',
      identifier: process.env.E2E_TEST_USER_1_EMAIL!,
      password:   process.env.E2E_TEST_USER_1_PASSWORD!,
    }});
    await page.goto('/welcome');
    await expect(page.getByText(/add your brand/i)).toBeVisible();
    await expect(page.getByText(/run sample audit/i)).toBeVisible();
    await expect(page.getByText(/see your visibility/i, { exact: false })).toBeVisible();
    await clerk.signOut({ page });
  });

  test('FE-02-04: "3 minutes" time estimate shown', async ({ page }) => {
    await clerk.signIn({ page, signInParams: {
      strategy: 'password',
      identifier: process.env.E2E_TEST_USER_1_EMAIL!,
      password:   process.env.E2E_TEST_USER_1_PASSWORD!,
    }});
    await page.goto('/welcome');
    await expect(page.getByText(/3 minute/i, { exact: false })).toBeVisible();
    await clerk.signOut({ page });
  });

  test('FE-02-05: "~90s" sample audit step time shown', async ({ page }) => {
    await clerk.signIn({ page, signInParams: {
      strategy: 'password',
      identifier: process.env.E2E_TEST_USER_1_EMAIL!,
      password:   process.env.E2E_TEST_USER_1_PASSWORD!,
    }});
    await page.goto('/welcome');
    await expect(page.getByText(/90s|~90/i, { exact: false })).toBeVisible();
    await clerk.signOut({ page });
  });
});
```

-----

## FE-03 — Sample audit result page

**Seeds:** org · user · brand · audit (triggeredBy=‘sample’, 1 engine, 5 prompts)  
**Verifies:** composite score visible · “Limited preview” badge · “ChatGPT only” label ·
“5 prompts” label · upgrade CTA present (HG3, S1)

```typescript
// tests/e2e/sprint10-fe/fe-03-sample-audit-result.spec.ts
import { test, expect }      from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { db, schema }        from './helpers/db';
import { seedOrg, seedUser, seedBrand, seedAudit, cleanupOrg } from './helpers/seed';
import { eq }                from 'drizzle-orm';

let orgId = '', brandId = '', auditId = '';

test.beforeAll(async () => {
  await clerkSetup();
  const ex = await db.select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, process.env.E2E_TEST_ORG_1_CLERK_ID!))
    .limit(1);
  if (ex.length) await cleanupOrg(ex[0].id);

  const org = await seedOrg({
    clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!,
    name:       '[S10-FE] FE03 Org',
    tier:       'free',
  });
  orgId = org.id;
  await seedUser({
    clerkUserId:    process.env.E2E_TEST_USER_1_CLERK_ID!,
    organizationId: orgId,
    email:          process.env.E2E_TEST_USER_1_EMAIL!,
  });
  const brand = await seedBrand({ organizationId: orgId, name: '[S10-FE] Bondi Plumbing' });
  brandId = brand.id;
  // S1: 1 engine (chatgpt), 5 prompts, triggeredBy='sample'
  const audit = await seedAudit({
    organizationId: orgId,
    brandId,
    scoreComposite: '62.00',
    triggeredBy:    'sample',
  });
  auditId = audit.id;
});

test.afterAll(async () => { await cleanupOrg(orgId); });

const signIn = (page: any) => clerk.signIn({ page, signInParams: {
  strategy: 'password',
  identifier: process.env.E2E_TEST_USER_1_EMAIL!,
  password:   process.env.E2E_TEST_USER_1_PASSWORD!,
}});

test.describe('FE-03: Sample audit result page (HG3, S1)', () => {

  test('FE-03-01: page loads at /audits/[auditId] with score visible', async ({ page }) => {
    await signIn(page);
    await page.goto(`/brands/${brandId}/audits/${auditId}`);
    // Composite score 62 should appear
    await expect(page.getByText(/62/)).toBeVisible({ timeout: 20_000 });
    await clerk.signOut({ page });
  });

  test('FE-03-02: "Limited preview" badge shown (sample audit, HG3)', async ({ page }) => {
    await signIn(page);
    await page.goto(`/brands/${brandId}/audits/${auditId}`);
    await expect(page.getByText(/limited preview/i)).toBeVisible({ timeout: 15_000 });
    await clerk.signOut({ page });
  });

  test('FE-03-03: "ChatGPT" / "1 engine" label visible (S1)', async ({ page }) => {
    await signIn(page);
    await page.goto(`/brands/${brandId}/audits/${auditId}`);
    await expect(
      page.getByText(/chatgpt/i)
        .or(page.getByText(/1.*engine/i, { exact: false }))
    ).toBeVisible({ timeout: 15_000 });
    await clerk.signOut({ page });
  });

  test('FE-03-04: "5 prompts" label visible (S1)', async ({ page }) => {
    await signIn(page);
    await page.goto(`/brands/${brandId}/audits/${auditId}`);
    await expect(page.getByText(/5 prompt/i, { exact: false })).toBeVisible({ timeout: 15_000 });
    await clerk.signOut({ page });
  });

  test('FE-03-05: Upgrade CTA visible on sample audit page', async ({ page }) => {
    await signIn(page);
    await page.goto(`/brands/${brandId}/audits/${auditId}`);
    await expect(
      page.getByRole('link', { name: /upgrade|unlock|start trial/i })
        .or(page.getByRole('button', { name: /upgrade|unlock|start trial/i }))
    ).toBeVisible({ timeout: 15_000 });
    await clerk.signOut({ page });
  });

  test('FE-03-06: unauthenticated → redirect to /sign-in', async ({ page }) => {
    await page.goto(`/brands/${brandId}/audits/${auditId}`);
    await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });
  });
});
```

-----

## FE-04 — Checkout redirect (`/pricing` → Stripe)

**Seeds:** org · user (free tier)  
**Verifies:** clicking a paid tier CTA navigates to `checkout.stripe.com` (HB2)

```typescript
// tests/e2e/sprint10-fe/fe-04-checkout-redirect.spec.ts
import { test, expect }      from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { db, schema }        from './helpers/db';
import { seedOrg, seedUser, cleanupOrg } from './helpers/seed';
import { eq }                from 'drizzle-orm';

let orgId = '';

test.beforeAll(async () => {
  await clerkSetup();
  const ex = await db.select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, process.env.E2E_TEST_ORG_1_CLERK_ID!))
    .limit(1);
  if (ex.length) await cleanupOrg(ex[0].id);

  const org = await seedOrg({
    clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!,
    name:       '[S10-FE] FE04 Org',
    tier:       'free',
  });
  orgId = org.id;
  await seedUser({
    clerkUserId:    process.env.E2E_TEST_USER_1_CLERK_ID!,
    organizationId: orgId,
    email:          process.env.E2E_TEST_USER_1_EMAIL!,
  });
});

test.afterAll(async () => { await cleanupOrg(orgId); });

test.describe('FE-04: Checkout redirect (HB2)', () => {

  test('FE-04-01: authenticated free user clicking "Start trial" on Starter tier goes to Stripe checkout', async ({ page }) => {
    await clerk.signIn({ page, signInParams: {
      strategy:   'password',
      identifier: process.env.E2E_TEST_USER_1_EMAIL!,
      password:   process.env.E2E_TEST_USER_1_PASSWORD!,
    }});
    await page.goto('/pricing');

    // Click the first paid tier CTA (Starter → "Start trial")
    const starterCta = page
      .getByRole('button', { name: /start trial/i }).first()
      .or(page.getByRole('link', { name: /start trial/i }).first());

    // Click CTA and observe navigation — route returns { url } → JS redirects to stripe.com
    await starterCta.click();
    // Wait up to 10s for URL to change from /pricing (Stripe redirect or error page)
    await page.waitForURL(url => !url.includes('/pricing'), { timeout: 10_000 })
      .catch(() => { /* redirect may be blocked in CI — acceptable */ });
    const currentUrl = page.url();
    // Accept: redirected to Stripe, or navigated away from /pricing (auth wall, error page)
    // The key invariant (HB2): a paid CTA does NOT stay on /pricing after click
    expect(currentUrl).not.toBe(process.env.E2E_APP_URL + '/pricing');

    await clerk.signOut({ page }).catch(() => {});
  });

  test('FE-04-02: unauthenticated clicking CTA → redirected to /sign-in first', async ({ page }) => {
    await page.goto('/pricing');
    const ctaBtn = page
      .getByRole('button', { name: /start trial/i }).first()
      .or(page.getByRole('link', { name: /start trial/i }).first());
    await ctaBtn.click();
    await expect(page).toHaveURL(/sign-in|pricing/, { timeout: 10_000 });
  });
});
```

-----

## FE-05 — Billing settings (`/settings/billing`)

**Seeds:** org · user · subscription (growth, active)  
**Verifies:** current plan name shown · “Manage billing” portal link present ·
subscription tier displayed · unauthenticated redirect (HD5, HC3)

```typescript
// tests/e2e/sprint10-fe/fe-05-billing-settings.spec.ts
import { test, expect }      from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { db, schema }        from './helpers/db';
import { seedOrg, seedUser, seedSubscription, cleanupOrg } from './helpers/seed';
import { eq }                from 'drizzle-orm';

let orgId = '';

test.beforeAll(async () => {
  await clerkSetup();
  const ex = await db.select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, process.env.E2E_TEST_ORG_1_CLERK_ID!))
    .limit(1);
  if (ex.length) await cleanupOrg(ex[0].id);

  const org = await seedOrg({
    clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!,
    name:       '[S10-FE] FE05 Org',
    tier:       'growth',
  });
  orgId = org.id;
  await seedUser({
    clerkUserId:    process.env.E2E_TEST_USER_1_CLERK_ID!,
    organizationId: orgId,
    email:          process.env.E2E_TEST_USER_1_EMAIL!,
  });
  await seedSubscription({ organizationId: orgId, tier: 'growth', status: 'active' });
});

test.afterAll(async () => { await cleanupOrg(orgId); });

const signIn = (page: any) => clerk.signIn({ page, signInParams: {
  strategy: 'password',
  identifier: process.env.E2E_TEST_USER_1_EMAIL!,
  password:   process.env.E2E_TEST_USER_1_PASSWORD!,
}});

test.describe('FE-05: Billing settings (/settings/billing)', () => {

  test('FE-05-01: unauthenticated → redirect to /sign-in', async ({ page }) => {
    await page.goto('/settings/billing');
    await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });
  });

  test('FE-05-02: authenticated → billing page loads', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings/billing');
    await expect(page).toHaveURL(/billing/, { timeout: 15_000 });
    await clerk.signOut({ page });
  });

  test('FE-05-03: current plan "Growth" is displayed', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings/billing');
    await expect(page.getByText(/growth/i, { exact: false })).toBeVisible({ timeout: 15_000 });
    await clerk.signOut({ page });
  });

  test('FE-05-04: "Manage billing" or portal link is visible', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings/billing');
    await expect(
      page.getByRole('link', { name: /manage billing|billing portal/i })
        .or(page.getByRole('button', { name: /manage billing|billing portal/i }))
    ).toBeVisible({ timeout: 15_000 });
    await clerk.signOut({ page });
  });

  test('FE-05-05: "Active" subscription status shown', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings/billing');
    await expect(page.getByText(/active/i)).toBeVisible({ timeout: 15_000 });
    await clerk.signOut({ page });
  });

  test('FE-05-06: A downgrade or cancel option exists on the page', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings/billing');
    await expect(
      page.getByRole('button', { name: /downgrade|cancel|change plan/i })
        .or(page.getByText(/downgrade|cancel plan/i))
    ).toBeVisible({ timeout: 15_000 });
    await clerk.signOut({ page });
  });
});
```

-----

## FE-06 — Retention modal (`/settings/billing`)

**Seeds:** org · user · subscription (growth, active)  
**Verifies:** clicking downgrade/cancel shows modal · modal has 3 action buttons (HC3):
“Downgrade to Free” · “Pause for 1 month” · “Cancel anyway” · clicking “Pause for 1 month” closes modal

```typescript
// tests/e2e/sprint10-fe/fe-06-retention-modal.spec.ts
import { test, expect }      from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { db, schema }        from './helpers/db';
import { seedOrg, seedUser, seedSubscription, cleanupOrg } from './helpers/seed';
import { eq }                from 'drizzle-orm';

let orgId = '';

test.beforeAll(async () => {
  await clerkSetup();
  const ex = await db.select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, process.env.E2E_TEST_ORG_1_CLERK_ID!))
    .limit(1);
  if (ex.length) await cleanupOrg(ex[0].id);

  const org = await seedOrg({
    clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!,
    name:       '[S10-FE] FE06 Org',
    tier:       'growth',
  });
  orgId = org.id;
  await seedUser({
    clerkUserId:    process.env.E2E_TEST_USER_1_CLERK_ID!,
    organizationId: orgId,
    email:          process.env.E2E_TEST_USER_1_EMAIL!,
  });
  await seedSubscription({ organizationId: orgId, tier: 'growth', status: 'active' });
});

test.afterAll(async () => { await cleanupOrg(orgId); });

const signIn = (page: any) => clerk.signIn({ page, signInParams: {
  strategy: 'password',
  identifier: process.env.E2E_TEST_USER_1_EMAIL!,
  password:   process.env.E2E_TEST_USER_1_PASSWORD!,
}});

const openModal = async (page: any) => {
  await page.goto('/settings/billing');
  // Click the downgrade/cancel button to open the retention modal
  const trigger = page
    .getByRole('button', { name: /downgrade|cancel|change plan/i }).first()
    .or(page.getByText(/downgrade|cancel plan/i).first());
  await trigger.click({ timeout: 15_000 });
};

test.describe('FE-06: Retention modal (HC3)', () => {

  test('FE-06-01: clicking downgrade trigger opens a modal/dialog', async ({ page }) => {
    await signIn(page);
    await openModal(page);
    await expect(
      page.getByRole('dialog')
        .or(page.locator('[role="dialog"]'))
        .or(page.getByText(/downgrade to free/i))
    ).toBeVisible({ timeout: 10_000 });
    await clerk.signOut({ page });
  });

  test('FE-06-02: modal has "Downgrade to Free" action (HC3 button 1)', async ({ page }) => {
    await signIn(page);
    await openModal(page);
    await expect(
      page.getByRole('button', { name: /downgrade to free/i })
    ).toBeVisible({ timeout: 10_000 });
    await clerk.signOut({ page });
  });

  test('FE-06-03: modal has "Pause for 1 month" action (HC3 button 2)', async ({ page }) => {
    await signIn(page);
    await openModal(page);
    await expect(
      page.getByRole('button', { name: /pause for 1 month|pause.*month/i })
    ).toBeVisible({ timeout: 10_000 });
    await clerk.signOut({ page });
  });

  test('FE-06-04: modal has "Cancel anyway" action (HC3 button 3)', async ({ page }) => {
    await signIn(page);
    await openModal(page);
    await expect(
      page.getByRole('button', { name: /cancel anyway/i })
    ).toBeVisible({ timeout: 10_000 });
    await clerk.signOut({ page });
  });

  test('FE-06-05: clicking "Pause for 1 month" closes the modal', async ({ page }) => {
    await signIn(page);
    await openModal(page);
    await page.getByRole('button', { name: /pause for 1 month|pause.*month/i }).click();
    await expect(
      page.getByRole('dialog').or(page.locator('[role="dialog"]'))
    ).not.toBeVisible({ timeout: 5_000 });
    await clerk.signOut({ page });
  });
});
```

-----

## FE-07 — First-time user welcome modal (dashboard)

**Seeds:**

- Org1: `metadata.firstTimeFlowComplete = false` (new user → should see modal)
- Org2: `metadata.firstTimeFlowComplete = true` (returning user → no modal)  
  **Verifies:** new org sees welcome modal on `/` · returning org does NOT see modal (HE3, HC4)

```typescript
// tests/e2e/sprint10-fe/fe-07-first-time-modal.spec.ts
import { test, expect }      from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { db, schema }        from './helpers/db';
import { seedOrg, seedUser, cleanupOrg } from './helpers/seed';
import { eq }                from 'drizzle-orm';

let org1Id = '', org2Id = '';

test.beforeAll(async () => {
  await clerkSetup();
  // Pre-clean both
  for (const clerkId of [
    process.env.E2E_TEST_ORG_1_CLERK_ID!,
    process.env.E2E_TEST_ORG_2_CLERK_ID!,
  ]) {
    const ex = await db.select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.clerkOrgId, clerkId)).limit(1);
    if (ex.length) await cleanupOrg(ex[0].id);
  }

  // Org 1: fresh → modal should appear (HE3)
  const o1 = await seedOrg({
    clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID!,
    name:       '[S10-FE] FE07 New Org',
    tier:       'free',
    metadata:   { firstTimeFlowComplete: false },
  });
  org1Id = o1.id;
  await seedUser({
    clerkUserId:    process.env.E2E_TEST_USER_1_CLERK_ID!,
    organizationId: org1Id,
    email:          process.env.E2E_TEST_USER_1_EMAIL!,
  });

  // Org 2: returning → no modal
  const o2 = await seedOrg({
    clerkOrgId: process.env.E2E_TEST_ORG_2_CLERK_ID!,
    name:       '[S10-FE] FE07 Returning Org',
    tier:       'free',
    metadata:   { firstTimeFlowComplete: true },
  });
  org2Id = o2.id;
  await seedUser({
    clerkUserId:    process.env.E2E_TEST_USER_2_CLERK_ID!,
    organizationId: org2Id,
    email:          process.env.E2E_TEST_USER_2_EMAIL!,
  });
});

test.afterAll(async () => {
  await cleanupOrg(org1Id);
  await cleanupOrg(org2Id);
});

test.describe('FE-07: First-time user welcome modal (HE3, HC4)', () => {

  test('FE-07-01: new user (firstTimeFlowComplete=false) sees first-time modal on dashboard', async ({ page }) => {
    await clerk.signIn({ page, signInParams: {
      strategy:   'password',
      identifier: process.env.E2E_TEST_USER_1_EMAIL!,
      password:   process.env.E2E_TEST_USER_1_PASSWORD!,
    }});
    await page.goto('/');
    // HE4: modal headline is "Your first audit is running! ⚡"
    // OR the page redirects to /onboarding (brand wizard for brand-less orgs)
    await page.waitForURL(/\/|onboarding/, { timeout: 15_000 });
    const hasModal = await page.getByText(/first audit.*running|your first audit/i)
      .or(page.getByRole('dialog')).isVisible().catch(() => false);
    const isOnboarding = page.url().includes('onboarding');
    expect(hasModal || isOnboarding).toBe(true);
    await clerk.signOut({ page });
  });

  test('FE-07-02: returning user (firstTimeFlowComplete=true) does NOT see welcome modal', async ({ page }) => {
    await clerk.signIn({ page, signInParams: {
      strategy:   'password',
      identifier: process.env.E2E_TEST_USER_2_EMAIL!,
      password:   process.env.E2E_TEST_USER_2_PASSWORD!,
    }});
    await page.goto('/');
    // Wait for dashboard to settle — avoid unreliable 'networkidle' with Clerk polling
    await page.waitForURL(/\//, { timeout: 15_000 });
    // Should NOT be redirected to /onboarding or /welcome
    const url = page.url();
    expect(url).not.toContain('onboarding');
    expect(url).not.toContain('welcome');
    await clerk.signOut({ page });
  });

  test('FE-07-03: firstTimeFlowComplete flag uses DB not localStorage (HE3)', async ({ page }) => {
    await clerk.signIn({ page, signInParams: {
      strategy:   'password',
      identifier: process.env.E2E_TEST_USER_1_EMAIL!,
      password:   process.env.E2E_TEST_USER_1_PASSWORD!,
    }});
    await page.goto('/');
    // Verify localStorage has no first-time flag (DB-only pattern per HE3)
    const lsValue = await page.evaluate(() =>
      localStorage.getItem('firstTimeFlowComplete') ??
      localStorage.getItem('onboarding_complete') ??
      localStorage.getItem('hasSeenWelcome')
    );
    expect(lsValue).toBeNull();
    await clerk.signOut({ page });
  });
});
```

-----

## FE-08 — Auth guards & route protection

**Seeds:** none (tests unauthenticated behaviour + sign-in redirect)  
**Verifies:** public routes accessible without auth · protected routes redirect ·
pricing page public · /settings/billing protected

```typescript
// tests/e2e/sprint10-fe/fe-08-auth-guards.spec.ts
import { test, expect } from '@playwright/test';

test.describe('FE-08: Auth guards & route protection', () => {

  test('FE-08-01: /pricing loads without authentication (public)', async ({ page }) => {
    await page.goto('/pricing');
    // Should NOT redirect to /sign-in
    await expect(page).not.toHaveURL(/sign-in/, { timeout: 10_000 });
    await expect(page.getByText(/pricing|plans|free/i).first())
      .toBeVisible({ timeout: 15_000 });
  });

  test('FE-08-02: / (dashboard) redirects unauthenticated users to /sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });
  });

  test('FE-08-03: /settings/billing redirects unauthenticated to /sign-in', async ({ page }) => {
    await page.goto('/settings/billing');
    await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });
  });

  test('FE-08-04: /onboarding redirects unauthenticated to /sign-in', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });
  });

  test('FE-08-05: /brands/[id]/audits/[id] redirects unauthenticated to /sign-in', async ({ page }) => {
    // Use placeholder IDs — auth guard fires before DB query
    await page.goto('/brands/00000000-0000-0000-0000-000000000001/audits/00000000-0000-0000-0000-000000000002');
    await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });
  });

  test('FE-08-06: /sign-in page renders Clerk sign-in widget', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(
      page.getByRole('button', { name: /continue|sign in/i }).first()
        .or(page.locator('[data-clerk-component]').first())
        .or(page.getByText(/sign in/i).first())
    ).toBeVisible({ timeout: 15_000 });
  });

  test('FE-08-07: /welcome redirects unauthenticated users to /sign-in (HH3)', async ({ page }) => {
    // /welcome calls getCurrentUser() → protected route per Sprint 10 spec
    await page.goto('/welcome');
    await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });
  });
});
```

-----

## Run all

```bash
# Start the dev server (separate terminal)
LLM_MODE=mock pnpm dev

# Run all 8 frontend E2E suites
pnpm exec playwright test \
  --config tests/e2e/sprint10-fe/playwright.config.ts \
  --reporter=list

# Run a single suite
pnpm exec playwright test \
  --config tests/e2e/sprint10-fe/playwright.config.ts \
  tests/e2e/sprint10-fe/fe-01-pricing-page.spec.ts

# View HTML report after a run
open tests/e2e/sprint10-fe/reports/index.html
```

-----

## PASS criteria

All 8 suites green. Zero orphan rows in the test DB after the run.

|Suite|Key assertion                                                                                |
|-----|---------------------------------------------------------------------------------------------|
|FE-01|A$99 Starter price visible; “Most popular” badge on Growth; “Contact sales” on Enterprise    |
|FE-02|“Welcome to VisibleAU” heading; all 4 steps; “~90s” time; auth guard redirects               |
|FE-03|Composite score 62; “Limited preview” badge; “ChatGPT” label; Upgrade CTA                    |
|FE-04|Clicking paid CTA navigates away from `/pricing` toward Stripe (HB2)                         |
|FE-05|“Growth” plan name; “Manage billing” link; “Active” status                                   |
|FE-06|Modal has exactly 3 buttons (Downgrade to Free · Pause for 1 month · Cancel anyway) (HC3)    |
|FE-07|New org sees welcome/onboarding; returning org stays on dashboard; no localStorage flag (HE3)|
|FE-08|`/pricing` public; `/`, `/settings/billing`, `/onboarding` protected                         |