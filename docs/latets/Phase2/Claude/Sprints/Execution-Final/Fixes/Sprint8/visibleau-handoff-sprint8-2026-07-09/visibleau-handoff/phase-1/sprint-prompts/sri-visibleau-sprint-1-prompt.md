# Sprint 1 — Project Foundation

**Sprint:** 1 of 12
**Estimated effort:** 28-41 hours (~3-5 weekends at 8 hrs/week)
**Goal:** Stand up a multi-tenant Next.js app with Clerk auth, Stripe products configured, Drizzle schema for orgs + brands, and brand CRUD with region-aware tenant isolation.
**Prerequisites:** Fresh repo. Vercel account (hosting). Supabase Sydney project. Clerk account. Stripe account. PostHog account (Cloud or self-hosted).
**Out of scope:** LLM integration, audits, billing UI, vertical packs, dashboard analytics. All deferred to later sprints.

---

## 0. Read first

Before any code, read in order:

1. `CLAUDE.md` v1.4 — the design document (~5 min)
2. `sri-visibleau-foundations.md` v1.11 §2 (folder structure) + §3 (schema) — the source of truth for layout and tables
3. `sri-geo-aeo-prd-v1.md` v1.15 §3-§7 (product framing, pricing tiers, regions)

If anything in this prompt conflicts with CLAUDE.md or Foundations v1.11, flag the conflict to Sri before building.

---

## 1. What ships this sprint

- ✓ Next.js 15 project with App Router + TypeScript strict mode
- ✓ Tailwind v4 + shadcn/ui scaffolded
- ✓ Drizzle + Supabase Postgres connection + RLS policies + schema for: `organizations`, `users`, `brands`
- ✓ Clerk auth + organization sync via webhook
- ✓ Stripe products created (Free, Starter, Growth, Agency, Agency Pro) — products only, no checkout yet
- ✓ Region detection middleware (`/au`, `/nz`, `/uk`, `/us`, `/ca`, `/eu`)
- ✓ Feature flags via env (`FREE_TIER_ENABLED_AU=true`, etc.)
- ✓ Brand CRUD: list, create, detail, soft-delete
- ✓ Cross-org access returns 404 (not 401)
- ✓ Empty Inngest setup (no functions yet — Sprint 2 wires audit jobs)
- ✓ Basic dashboard layout with sidebar (no real data yet)
- ✓ CI passing: lint + typecheck + unit tests + integration tests

**Definition of done:** A user can sign up at `/au/sign-up`, land on `/dashboard`, click "Create brand", fill in name + domain + vertical, and see their brand appear. A second user from a different org cannot see the first user's brand (404 response).

---

## 2. Dependencies to install

```bash
# Core framework
pnpm add next@15 react@19 react-dom@19
pnpm add -D typescript @types/react @types/react-dom @types/node

# Styling
pnpm add tailwindcss@next @tailwindcss/postcss
pnpm add class-variance-authority clsx tailwind-merge

# shadcn/ui dependencies
pnpm add @radix-ui/react-slot @radix-ui/react-dialog @radix-ui/react-dropdown-menu
pnpm add @radix-ui/react-label @radix-ui/react-select @radix-ui/react-toast
pnpm add @radix-ui/react-tooltip @radix-ui/react-avatar
pnpm add lucide-react

# Auth
pnpm add @clerk/nextjs svix

# Database
pnpm add drizzle-orm postgres @supabase/supabase-js
pnpm add -D drizzle-kit

# Payments
pnpm add stripe @stripe/stripe-js

# Background jobs (configured this sprint, used Sprint 2+)
pnpm add inngest

# Email (used Sprint 2+; install now to validate)
pnpm add resend react-email @react-email/components

# Validation
pnpm add zod

# Testing
pnpm add -D vitest @vitest/ui @vitest/coverage-v8
pnpm add -D @testing-library/react @testing-library/jest-dom @testing-library/user-event
pnpm add -D @playwright/test
pnpm add -D msw

# Analytics (install Sprint 1 alongside other infra even though events fire Sprint 2+)
pnpm add posthog-js posthog-node
pnpm add -D tsx
```

Install Playwright browsers after install:
```bash
pnpm exec playwright install --with-deps chromium
```

---

## 3. Environment variables

Create `.env.local`:

```bash
# Next.js
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
# Z2 fix: without these, Clerk redirects to '/' after auth — user never reaches the app.
# After sign-in → dashboard. After sign-up → dashboard (Sprint 4 will redirect to wizard if 0 brands).
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# Supabase (Postgres + Storage + Auth-passthrough)
NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co
# W5 fix: NEXT_PUBLIC_SUPABASE_ANON_KEY is intentionally client-exposed.
# The anon key is designed to be public — it identifies your Supabase project but grants NO
# elevated permissions. It is safe ONLY because Row Level Security (RLS) is enabled on all
# tenant tables (§5). RLS ensures the anon key can only read/write rows that the active
# user's session is authorized to access. The service_role key (below) bypasses RLS and
# MUST remain server-only. If you see NEXT_PUBLIC_SUPABASE_ANON_KEY and think "this shouldn't
# be public" — you're right to think carefully, but it is correct with RLS in place.
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # server-only; never exposed to client; bypasses RLS
DATABASE_URL=postgresql://postgres.[project-id]:<password>@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres   # pooled
DIRECT_URL=postgresql://postgres.[project-id]:<password>@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres    # direct (for migrations)

# Stripe (test mode)
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Inngest (Sprint 2+ but install client now)
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...

# Resend (Sprint 2+ but install now)
RESEND_API_KEY=re_...

# Feature flags
FREE_TIER_ENABLED_AU=true
FREE_TIER_ENABLED_NZ=true
FREE_TIER_ENABLED_UK=false
FREE_TIER_ENABLED_US=false
FREE_TIER_ENABLED_CA=false
FREE_TIER_ENABLED_EU=false

# LLM mode (Sprint 2+ but set now)
LLM_MODE=mock

# PostHog analytics — PRD §10 + CLAUDE.md §3 canonical. Install Sprint 1; events fire Sprint 2+.
# Cloud: https://app.posthog.com. Self-hosted evaluated month 6+ for AU data residency.
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

Add `.env.test.local`:
```bash
# Y1 fix: must use DATABASE_URL to match db/client.ts (reads process.env.DATABASE_URL!).
# Previous: POSTGRES_URL=... — wrong name; db/client.ts would get undefined and crash at import.
# Points at local Postgres for integration tests (separate from production Supabase).
DATABASE_URL=postgresql://localhost:5432/visibleau_test
# Also set DIRECT_URL for any migration commands run against the test DB
DIRECT_URL=postgresql://localhost:5432/visibleau_test
LLM_MODE=mock
```

---

## 4. Project structure additions

This sprint creates the canonical structure declared in Foundations v1.11 §2:

```
app/
├── (auth)/
│   ├── layout.tsx                    # Clerk-protected layout with sidebar
│   ├── dashboard/
│   │   └── page.tsx                  # Empty dashboard (Sprint 4 fills in)
│   ├── brands/
│   │   ├── page.tsx                  # Brand list
│   │   ├── new/page.tsx              # Brand create form
│   │   └── [brandId]/page.tsx        # Brand detail
│   └── settings/
│       └── page.tsx                  # Stub
├── (marketing)/
│   ├── layout.tsx                    # Public layout (header + footer)
│   ├── page.tsx                      # Landing (stub)
│   └── pricing/page.tsx              # Pricing (stub)
├── api/
│   ├── brands/
│   │   ├── route.ts                  # GET (list), POST (create)
│   │   └── [brandId]/route.ts        # GET, PATCH, DELETE
│   ├── webhooks/
│   │   ├── clerk/route.ts            # Org + user sync
│   │   ├── stripe/route.ts           # Subscription stub (Sprint 10 fills in)
│   │   └── inngest/route.ts          # T4 fix: CLAUDE.md §6 canonical path is app/api/webhooks/inngest/route.ts
│   │                                  # Sprint 1 §4 originally had app/api/inngest/route.ts — wrong path.
│   │                                  # Inngest SDK registers at this endpoint; path must match dashboard config.
│   └── health/route.ts               # Health check
├── sign-in/[[...sign-in]]/page.tsx
├── sign-up/[[...sign-up]]/page.tsx
├── layout.tsx
├── page.tsx
└── globals.css

components/
├── ui/                               # shadcn/ui primitives — copy-paste, not installed
│   ├── button.tsx
│   ├── card.tsx
│   ├── input.tsx
│   ├── label.tsx
│   ├── select.tsx
│   ├── sheet.tsx
│   ├── toast.tsx
│   └── tooltip.tsx
└── domain/
    ├── app-sidebar.tsx
    ├── app-topbar.tsx
    └── brand-card.tsx

lib/
├── auth/
│   └── current-user.ts               # getCurrentUser() helper
├── region/
│   ├── detect.ts                     # Pure: { pathname, geoCountry } → Region
│   └── index.ts
├── feature-flags/
│   └── index.ts                      # isFreeTierEnabled(region)
├── brands/
│   └── index.ts                      # Pure: brand CRUD authorization, region inheritance
├── stripe/
│   └── client.ts                     # Stripe SDK instance
├── inngest/
│   └── client.ts                     # Inngest SDK instance (empty functions this sprint)
└── utils/
    └── cn.ts                         # tailwind-merge helper

db/
├── client.ts                         # Drizzle client + connection pool
├── schema/
│   ├── enums.ts                      # Tier, Region, Vertical, etc.
│   ├── organizations.ts
│   ├── users.ts
│   ├── brands.ts
│   └── index.ts                      # Barrel export
└── migrations/                       # drizzle-kit generated

inngest/
├── client.ts
└── functions/                        # Empty this sprint

middleware.ts                         # Clerk auth + region detection

tests/
├── unit/
│   ├── region/detect.test.ts
│   ├── feature-flags/index.test.ts
│   └── brands/index.test.ts
├── integration/
│   └── api/brands/
│       ├── list.test.ts
│       ├── create.test.ts
│       ├── update.test.ts
│       └── cross-org.test.ts
└── e2e/
    ├── auth.spec.ts
    └── brands.spec.ts

drizzle.config.ts
biome.json
tsconfig.json
playwright.config.ts
vitest.config.ts
```

---

## 5. Database schema

Drizzle schemas in `db/schema/`:

### `enums.ts`

```typescript
import { pgEnum } from 'drizzle-orm/pg-core';

export const tierEnum = pgEnum('tier', [
  'free', 'starter', 'growth', 'agency', 'agency_pro', 'enterprise'
]);

export const regionEnum = pgEnum('region', [
  'au', 'nz', 'uk', 'us', 'ca', 'eu'
]);

export const verticalEnum = pgEnum('vertical', [
  'tradies', 'allied_health', 'saas'
  // T8 note: v1.1 adds 'professional_services', 'real_estate' (Foundations v1.12 has these already).
  // Sprint 5 seeds 3 v1 packs; a Sprint 5 migration extends this enum when seeding v1.1 pack data.
  // Sprint 4 wizard shows v1.1 packs as locked/disabled; they become selectable once enum + seed added.
]);

export type Tier = typeof tierEnum.enumValues[number];
export type Region = typeof regionEnum.enumValues[number];
export type Vertical = typeof verticalEnum.enumValues[number];
```

### `organizations.ts`

```typescript
import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tierEnum, regionEnum } from './enums';

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkOrgId: text('clerk_org_id').unique().notNull(),
  name: text('name').notNull(),
  region: regionEnum('region').notNull().default('au'),
  tier: tierEnum('tier').notNull().default('free'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  subscriptionCancelledAt: timestamp('subscription_cancelled_at', { withTimezone: true }), // T3 fix: Foundations v1.6 canonical. Sprint 10 sets this on Stripe customer.subscription.deleted webhook. Must be created in Sprint 1 migration so Sprint 10 doesn't need an ALTER TABLE.
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
```

### `users.ts`

```typescript
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkUserId: text('clerk_user_id').unique().notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  email: text('email').notNull(),
  name: text('name'),
  role: text('role').default('member').notNull(), // 'owner' | 'admin' | 'member'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### `brands.ts`

```typescript
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { verticalEnum, regionEnum } from './enums';

export const brands = pgTable('brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: text('name').notNull(),
  domain: text('domain').notNull(),
  vertical: verticalEnum('vertical').notNull(),
  region: regionEnum('region').notNull(),       // inherits from org at create time
  competitors: text('competitors').array().default([]).notNull(),
  primaryRegions: text('primary_regions').array().default([]).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
```

Run migrations:
```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

### Row Level Security (RLS) policies

Per PRD §10 canonical: "Row-level security on all tenant-scoped tables." Supabase makes this straightforward. Create a Supabase migration (separate from Drizzle, applied via `supabase migration new`):

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

-- Helper: extract org_id from Clerk JWT (set in app code when establishing connection)
-- The app sets `SET LOCAL app.current_org_id = '<clerk-org-uuid>'` after each user authenticates,
-- so policies can reference current_setting('app.current_org_id', true)

-- V1 fix (eighth-pass audit): RLS policies for organizations and users were MISSING.
-- Enabling RLS without policies = deny-all for anon key reads.
-- Without these, app code cannot read org.tier (for model selection) or org.region (for brand creation).
-- Service-role key (used by Inngest jobs + webhook handlers) bypasses RLS — those still work.
-- App routes use the anon key + clerk JWT and need explicit SELECT policies.

CREATE POLICY "Users see only their own org"
  ON organizations FOR SELECT
  USING (id::text = current_setting('app.current_org_id', true));

CREATE POLICY "Users see only their own user row"
  ON users FOR SELECT
  USING (organization_id::text = current_setting('app.current_org_id', true));

CREATE POLICY "Users see only their org's brands"
  ON brands FOR SELECT
  USING (organization_id::text = current_setting('app.current_org_id', true));

CREATE POLICY "Users mutate only their org's brands"
  ON brands FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));

-- Service-role bypass (server-side Inngest jobs + Clerk/Stripe webhook handlers use service_role
-- key which bypasses RLS automatically. Never expose service_role key to the client.)
```

**Defense-in-depth model:** RLS is the database backstop. App-level authorization in API routes (cross-org → 404) is the primary control. Both must agree. Sprint 1 tests verify both layers.

---

## 6. Backend / API routes

### API route pattern (AA2 fix — thirteenth-pass audit: setRlsContext was never told to be called in any route)

Every protected API route **must** call `setRlsContext` after resolving the user. This sets the Postgres session variable that the RLS policies in §5 read. Without it, the RLS security backstop is silently bypassed even though it's enabled:

```typescript
// Standard pattern for every protected route:
import { getCurrentUser } from '@/lib/auth/current-user';
import { setRlsContext, db } from '@/db/client';
import { NextResponse } from 'next/server';

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // AA2: Must call setRlsContext before ANY db query so RLS policies can read app.current_org_id
  await setRlsContext(db, currentUser.organizationId);

  // Now all db queries are RLS-scoped to currentUser.organizationId
  // ...route logic here...
}
```

### `GET /api/brands` — list brands for current org

- Auth: required (Clerk `auth()`)
- Returns: `Brand[]` where `organizationId = currentUser.organizationId` and `deletedAt IS NULL`
- 401 if not authenticated

### `POST /api/brands` — create brand

- Auth: required
- Body validated by Zod — **(W4 fix — ninth-pass audit: primaryRegions format was unspecified)**:
  ```typescript
  const createBrandSchema = z.object({
    name: z.string().min(1).max(100),
    domain: z.string().min(1).max(253),
    vertical: z.enum(['tradies', 'allied_health', 'saas']),
    competitors: z.array(z.string()).optional().default([]),
    // Format: 'STATE:Suburb' e.g. 'NSW:Bondi', 'VIC:Fitzroy', 'QLD:Brisbane CBD'
    // Foundations §3 canonical: "['NSW:Bondi', 'NSW:Parramatta'] — sub-region locations within the org's region"
    primaryRegions: z.array(
      z.string().regex(/^[A-Z]{2,4}:[A-Za-z][A-Za-z\s]{0,49}$/, 'Format: STATE:Suburb (e.g. NSW:Bondi, VIC:Fitzroy)')
    ).optional().default([]),
  });
  ```
- `domain` validated: strip protocol (`https://`, `http://`), strip trailing slash, validate hostname shape
- **(V3 fix — eighth-pass audit) Brand-limit check before insert:**
  ```typescript
  const TIER_BRAND_LIMITS = { free: 1, starter: 1, growth: 1, agency: 5, agency_pro: 25, enterprise: Infinity };
  const existingCount = await db.select({ count: count() }).from(brands)
    .where(and(eq(brands.organizationId, org.id), isNull(brands.deletedAt)));
  if (existingCount[0].count >= TIER_BRAND_LIMITS[org.tier]) {
    return Response.json({ error: 'Brand limit reached for your tier. Upgrade to add more brands.' }, { status: 403 });
  }
  ```
  403 (not 400) because it's an authorization/entitlement rejection, not a validation error.
- Inserts brand with `region = currentUser.organization.region` (inherited)
- 400 on validation error, 401 if unauthenticated, 403 if brand limit reached, 201 + `{ brand: Brand }` on success

### `GET /api/brands/[brandId]` — single brand

- Auth: required
- **Returns 404 if `brand.organizationId !== currentUser.organizationId`** (NOT 401 — see CLAUDE.md §7)
- 404 if brand soft-deleted

### `PATCH /api/brands/[brandId]` — update

- Auth: required + cross-org check returns 404
- Updates `name`, `domain`, `vertical`, `competitors`, `primaryRegions` (NOT `region` — pinned at create)
- **(V4 fix — eighth-pass audit)** Returns `200 + { brand: Brand }` (updated brand JSON) on success. Not 204 — Sprint 4 UI reads the updated brand after save and needs the body.

### `DELETE /api/brands/[brandId]` — soft delete

- **(V5 fix — eighth-pass audit)** Cross-org check first: if `brand.organizationId !== currentUser.organizationId`, return 404 (same pattern as GET/PATCH — don't leak resource existence). If brand not found or already soft-deleted, return 404.
- Sets `deletedAt = NOW()` on the brand row
- 204 No Content on success

### `POST /api/webhooks/clerk` — Clerk webhook

**Z1 fix (twelfth-pass audit): How `org.region` reaches the database**

Clerk's `organization.created` webhook payload includes `id`, `name`, `public_metadata`, `private_metadata` — but NO region field natively. `organizations.region` is `NOT NULL`. The region must travel from the signup form to the DB via Clerk's `publicMetadata`:

**Step 1 — Signup form:** After the user fills in region + tier on the signup page, before Clerk creates the org, the client calls the Clerk JS SDK to create the org with `publicMetadata`:
```typescript
// In the signup page client component, after Clerk creates the user:
await clerkClient.organizations.createOrganization({
  name: orgName,
  publicMetadata: {
    region: selectedRegion,    // e.g. 'au'
    tier: selectedTier,         // e.g. 'free'
  },
});
```
Or, if using Clerk's hosted sign-up flow, set `publicMetadata` via a post-signup API route.

**Step 2 — Webhook handler reads `publicMetadata`:**
```typescript
case 'organization.created': {
  const { id, name, public_metadata } = evt.data;
  const region = (public_metadata?.region as string) ?? 'au';
  const tier = (public_metadata?.tier as string) ?? 'free';
  await db.insert(organizations).values({
    clerkOrgId: id,
    name,
    region: region as Region,
    tier: tier as Tier,
  }).onConflictDoNothing(); // idempotency
  break;
}
```

- Verify signature with `svix`
- Handle events:
  - `organization.created` → insert organizations row (with region + tier from `public_metadata` as above)
  - `organization.updated` → update name
  - `organization.deleted` → **(V2 fix)** soft-delete org row (`deletedAt = NOW()`); cascade soft-delete all brands for that org.
  - `organizationMembership.created` → insert/upsert users row with org link
  - `organizationMembership.deleted` → **(V2 fix)** hard-delete the users row for that membership
  - `user.updated` → update email/name
  - `user.deleted` → **(V2 fix)** hard-delete users row by clerkUserId (GDPR)
- Idempotent (handle replays gracefully)

### `POST /api/webhooks/stripe` — Stripe webhook stub

- Sprint 1 just creates the route with signature verification
- Sprint 10 fills in subscription event handling

### `GET /api/health` — health check

- Returns `{ status: 'ok', timestamp: '...', db: 'ok' | 'error' }`
- Used by uptime monitoring + CI

---

## 7. Stripe product setup (one-time script)

Create `scripts/setup-stripe-products.ts`:

```typescript
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const products = [
  { id: 'starter',   name: 'Starter',    priceAud: 9900,   auditsPerMonth: 4,   auditsPerBrand: null, brands: 1,  frequency: 'weekly'   },
  { id: 'growth',    name: 'Growth',     priceAud: 29900,  auditsPerMonth: 12,  auditsPerBrand: null, brands: 1,  frequency: '3x_weekly' },
  // W6 fix: Agency/Agency Pro use per-brand limits. Stripe metadata now stores auditsPerBrandPerMonth
  // to match Sprint 9's TIER_AUDIT_LIMITS shape (auditsPerBrandPerMonth: 30/60).
  // Old: audits: 150 (total = 5×30). New: auditsPerBrandPerMonth: 30, brandsMax: 5.
  // This prevents a future webhook-sync bug where reading metadata.audits as a global limit
  // would give Agency 150/month total instead of 30/brand.
  { id: 'agency',    name: 'Agency',     priceAud: 49900,  auditsPerMonth: null, auditsPerBrand: 30,  brands: 5,  frequency: 'daily'    },
  { id: 'agency_pro', name: 'Agency Pro', priceAud: 149900, auditsPerMonth: null, auditsPerBrand: 60, brands: 25, frequency: '2x_daily' },
];

// Each tier creates TWO recurring prices (monthly + annual at 10× monthly = 2 months free)
// PLUS a one-off audit product (A$299) for the conversion path per PRD §7 Principle #4

for (const p of products) {
  const product = await stripe.products.create({
    name: `VisibleAU ${p.name}`,
    metadata: {
      tier: p.id,
      brands: String(p.brands),
      frequency: p.frequency,
      // W6 fix: store per-brand vs total separately to match Sprint 9 TIER_AUDIT_LIMITS shape
      ...(p.auditsPerMonth !== null  && { auditsPerMonth:      String(p.auditsPerMonth) }),
      ...(p.auditsPerBrand !== null  && { auditsPerBrandPerMonth: String(p.auditsPerBrand) }),
    },
  });
  // Monthly
  await stripe.prices.create({
    product: product.id,
    unit_amount: p.priceAud,
    currency: 'aud',
    recurring: { interval: 'month' },
    metadata: { tier: p.id, billing: 'monthly' },
    nickname: `${p.name} monthly`,
  });
  // Annual (10× monthly = 2 months free, ~16% discount)
  await stripe.prices.create({
    product: product.id,
    unit_amount: p.priceAud * 10,
    currency: 'aud',
    recurring: { interval: 'year' },
    metadata: { tier: p.id, billing: 'annual' },
    nickname: `${p.name} annual`,
  });
  console.log(`Created ${p.name}: ${product.id} (monthly + annual)`);
}

// One-off audit product (PRD §7 Pricing Principle #4)
const oneOff = await stripe.products.create({
  name: 'VisibleAU One-off Audit',
  metadata: { type: 'one_off_audit' },
});
await stripe.prices.create({
  product: oneOff.id,
  unit_amount: 29900,  // A$299
  currency: 'aud',
  metadata: { type: 'one_off_audit' },
  nickname: 'One-off audit',
});
console.log(`Created One-off Audit: ${oneOff.id}`);
```

Run once:
```bash
pnpm tsx scripts/setup-stripe-products.ts
```

Free + Enterprise have no Stripe products (Free is free; Enterprise is sales-led).

---

## 8. Middleware: auth + region

`middleware.ts`:

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { detectRegion } from '@/lib/region/detect';
import { NextResponse } from 'next/server';

const isProtected = createRouteMatcher([
  '/dashboard(.*)',
  '/brands(.*)',
  '/audits(.*)',
  '/settings(.*)',
  '/api/brands(.*)',
  '/api/audits(.*)',
]);

const isPublic = createRouteMatcher([
  '/',
  '/pricing',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
  '/api/health',
]);

export default clerkMiddleware((auth, req) => {
  // Region detection
  const region = detectRegion({
    pathname: req.nextUrl.pathname,
    geoCountry: req.geo?.country,
  });
  const response = NextResponse.next();
  response.headers.set('x-visibleau-region', region);

  if (isProtected(req)) auth.protect();
  return response;
});

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js|json|png|jpg|jpeg|gif|svg|webp|ico)).*)'],
};
```

`lib/region/detect.ts`:

```typescript
import { Region } from '@/db/schema/enums';

export function detectRegion({
  pathname,
  geoCountry,
}: { pathname: string; geoCountry?: string }): Region {
  // URL prefix wins
  const match = pathname.match(/^\/(au|nz|uk|us|ca|eu)(\/|$)/);
  if (match) return match[1] as Region;

  // Then geo
  const map: Record<string, Region> = {
    AU: 'au', NZ: 'nz', GB: 'uk', US: 'us', CA: 'ca',
  };
  if (geoCountry && map[geoCountry]) return map[geoCountry];

  // EU detection
  const euCountries = ['DE','FR','IT','ES','NL','BE','PL','SE','AT','DK','FI','IE','PT','GR','CZ','RO','HU'];
  if (geoCountry && euCountries.includes(geoCountry)) return 'eu';

  return 'au';  // default
}
```

---

## 9. Claude Code prompt (paste this when starting Sprint 1)

```
We're building VisibleAU Sprint 1: project foundation. The full design lives in
CLAUDE.md v1.4 (auto-loaded) and sri-visibleau-foundations.md v1.11. Read both before
writing any code.

Sprint 1 deliverables, in order:

1. INITIALIZE PROJECT
   - Run pnpm create next-app@latest visibleau (TypeScript yes, ESLint no — we use Biome, App Router yes, src directory no, Tailwind v4 yes, import alias @/*)
   - Replace ESLint with Biome: pnpm add -D @biomejs/biome, create biome.json
   - Install all dependencies from Sprint 1 prompt §2
   - Set up tsconfig with strict: true and paths: { "@/*": ["./*"] }

2. CONFIGURE DRIZZLE + POSTGRES
   - Create db/client.ts with the following content (X1 fix — tenth-pass audit: content was never specified):

     ```typescript
     import { drizzle } from 'drizzle-orm/postgres-js';
     import postgres from 'postgres';
     import * as schema from './schema';

     // DATABASE_URL uses the pooled connection (port 6543) for all app queries.
     // drizzle.config.ts uses DIRECT_URL (port 5432) for migrations only.
     // max: 1 is important for serverless (Vercel Edge): prevents connection exhaustion.
     const client = postgres(process.env.DATABASE_URL!, {
       max: 1,
       idle_timeout: 20,
       connect_timeout: 10,
     });

     export const db = drizzle(client, { schema });

     // RLS session setup: call this in every API route after authenticating the user.
     // Sets the app.current_org_id Postgres variable so RLS policies can read it.
     // Usage: await setRlsContext(db, currentUser.organizationId)
     export async function setRlsContext(
       db: ReturnType<typeof drizzle>,
       orgId: string
     ): Promise<void> {
       await db.execute(
         sql`SELECT set_config('app.current_org_id', ${orgId}, true)`
       );
     }
     ```

   - Create db/schema/enums.ts, organizations.ts, users.ts, brands.ts per §5
   - Create db/schema/index.ts barrel export (AA5 fix — thirteenth-pass audit: content never specified):

     ```typescript
     // db/schema/index.ts — re-export everything; Drizzle client + drizzle.config.ts import from here
     export * from './enums';
     export * from './organizations';
     export * from './users';
     export * from './brands';

     // Drizzle inferred types — use these throughout lib/ and app/api/
     export type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
     import { organizations } from './organizations';
     import { users } from './users';
     import { brands } from './brands';
     import type { InferSelectModel } from 'drizzle-orm';

     export type Organization = InferSelectModel<typeof organizations>;
     export type User         = InferSelectModel<typeof users>;
     export type Brand        = InferSelectModel<typeof brands>;
     ```
   - Create drizzle.config.ts with the following content (W1 fix — ninth-pass audit: content was never specified):

     ```typescript
     import type { Config } from 'drizzle-kit';

     export default {
       schema: './db/schema/index.ts',
       out: './db/migrations',
       dialect: 'postgresql',
       dbCredentials: {
         // CRITICAL: use DIRECT_URL (port 5432) for migrations, not DATABASE_URL (port 6543).
         // Supabase's transaction-mode connection pooler (port 6543) does not support the
         // SET commands that drizzle-kit uses during migrations. Direct connections only.
         url: process.env.DIRECT_URL!,
       },
     } satisfies Config;
     ```

     The app itself (db/client.ts) uses DATABASE_URL (port 6543 pooler) for all runtime queries.
     drizzle.config.ts uses DIRECT_URL (port 5432) for `drizzle-kit generate` + `drizzle-kit migrate` only.

   - Run pnpm drizzle-kit generate then pnpm drizzle-kit migrate
   - Verify tables exist in Supabase Postgres dashboard

3. WIRE CLERK
   - Wrap app/layout.tsx with ClerkProvider
   - Create sign-in and sign-up route folders (Clerk catchall)
   - Create middleware.ts per §8
   - Configure Clerk dashboard: enable Organizations, set webhook URL to /api/webhooks/clerk
   - Implement /api/webhooks/clerk per §6 (org.created with publicMetadata region, organizationMembership.created, all deletion events per §6)
   - Test signup flow end-to-end: signup -> Clerk creates org with publicMetadata.region -> webhook fires -> organizations + users rows appear

   **lib/auth/current-user.ts** (AA1 fix — thirteenth-pass audit: content was never specified; every API route needs this):
   ```typescript
   import { auth } from '@clerk/nextjs/server';
   import { db } from '@/db/client';
   import { users, organizations } from '@/db/schema';
   import { eq } from 'drizzle-orm';
   import type { User, Organization } from '@/db/schema';

   export type CurrentUser = User & {
     organization: Organization;
   };

   /**
    * Resolves the authenticated Clerk user to a DB user row + their organization.
    * Returns null if the DB rows don't yet exist (Clerk webhook race — see AA3 note in §9 step 4).
    * Call this at the top of every protected API route.
    * After calling, pass currentUser.organizationId to setRlsContext().
    */
   export async function getCurrentUser(): Promise<CurrentUser | null> {
     const { userId } = await auth();
     if (!userId) return null;

     const [userRow] = await db
       .select()
       .from(users)
       .innerJoin(organizations, eq(users.organizationId, organizations.id))
       .where(eq(users.clerkUserId, userId));

     if (!userRow) return null;
     return { ...userRow.users, organization: userRow.organizations };
   }
   ```

4. SCAFFOLD UI
   - Install shadcn/ui base components (button, card, input, label, select, sheet, toast, tooltip)

   **app/(auth)/layout.tsx** (AA4 fix — thirteenth-pass audit: content never specified; this is the shell wrapping every authenticated page):
   ```tsx
   import { SignedIn, ClerkLoading } from '@clerk/nextjs';
   import { AppSidebar } from '@/components/domain/app-sidebar';
   import { AppTopbar } from '@/components/domain/app-topbar';

   export default function AuthLayout({ children }: { children: React.ReactNode }) {
     return (
       <>
         {/* ClerkLoading: renders while Clerk resolves the session (avoids flash of unauth content) */}
         <ClerkLoading>
           <div className="h-screen flex items-center justify-center">
             <span className="text-sm text-muted-foreground">Loading...</span>
           </div>
         </ClerkLoading>
         <SignedIn>
           <div className="flex h-screen overflow-hidden">
             <AppSidebar />
             <div className="flex-1 flex flex-col min-w-0">
               <AppTopbar />
               <main className="flex-1 overflow-y-auto">{children}</main>
             </div>
           </div>
         </SignedIn>
       </>
     );
   }
   ```

   **AA3 race condition note:** After signup, Clerk redirects to `/dashboard` before the `organization.created` + `organizationMembership.created` webhooks fire. `getCurrentUser()` may return `null` for 100-500ms. The dashboard server component must handle this:
   ```tsx
   // app/(auth)/dashboard/page.tsx — Sprint 1 empty stub with race-condition guard:
   import { getCurrentUser } from '@/lib/auth/current-user';
   import { redirect } from 'next/navigation';

   export default async function DashboardPage() {
     const user = await getCurrentUser();
     // Webhook race: if DB rows don't exist yet, redirect to a "setting up" page
     // that polls until they appear. In Sprint 1 this is rare but real.
     if (!user) redirect('/sign-in');  // or a /onboarding-pending stub
     // Sprint 4 fills in real dashboard content here.
     return <div className="p-8"><h1>Welcome to VisibleAU</h1></div>;
   }
   ```

   - Create components/domain/app-sidebar.tsx, app-topbar.tsx (Sprint 1: static nav — Overview, Brands, View plans)
   - Stub app/(auth)/settings/page.tsx
   - Stub app/(marketing)/page.tsx (landing placeholder — Sprint 11 builds real marketing site)
   - Stub app/(marketing)/pricing/page.tsx (reads `isFreeTierEnabled(region)` from §9 step 7)

5. IMPLEMENT BRAND CRUD
   - app/api/brands/route.ts: GET (list), POST (create with Zod validation)
   - app/api/brands/[brandId]/route.ts: GET, PATCH (returns 200 + brand body), DELETE (soft delete; returns 204; cross-org returns 404)
   - CRITICAL: cross-org access returns 404, not 401 — write this check carefully
   - lib/brands/index.ts: pure functions — spec below (X2 fix — tenth-pass audit: signatures were never specified):

     ```typescript
     import { db } from '@/db/client';
     import { brands, organizations } from '@/db/schema';
     import { eq, and, isNull, count } from 'drizzle-orm';
     import type { Brand, Organization } from '@/db/schema';

     export const TIER_BRAND_LIMITS: Record<string, number> = {
       free: 1, starter: 1, growth: 1, agency: 5, agency_pro: 25, enterprise: Infinity,
     };

     /**
      * Fetch a brand if and only if it belongs to the given org and is not soft-deleted.
      * Returns null for cross-org or missing brands (caller returns 404).
      */
     export async function getBrandForOrg(
       brandId: string,
       orgId: string
     ): Promise<Brand | null> {
       const [brand] = await db.select().from(brands)
         .where(and(eq(brands.id, brandId), eq(brands.organizationId, orgId), isNull(brands.deletedAt)));
       return brand ?? null;
     }

     /**
      * Returns the region the new brand should inherit.
      * Brands are pinned to org.region at create time and cannot be changed via PATCH.
      */
     export function inheritRegion(org: Organization): Organization['region'] {
       return org.region;
     }

     /**
      * Returns true if this org can create another brand (under the tier limit).
      * Pass the count of *existing, non-deleted* brands already in the org.
      */
     export function checkBrandLimit(org: Organization, currentBrandCount: number): boolean {
       const limit = TIER_BRAND_LIMITS[org.tier] ?? 1;
       return currentBrandCount < limit;
     }
     ```

   - app/(auth)/brands/page.tsx: list view with brand cards
   - app/(auth)/brands/new/page.tsx: create form; on success navigate to /brands (list), not /brands/[id]
   - app/(auth)/brands/[brandId]/page.tsx: detail view with inline edit + delete

6. STRIPE PRODUCT SETUP
   - Implement scripts/setup-stripe-products.ts per §7
   - Run once against test mode
   - Implement /api/webhooks/stripe with signature verification only (subscription handling is Sprint 10)

7. REGION + FEATURE FLAGS
   - lib/region/detect.ts pure function per §8
   - lib/feature-flags/index.ts — spec below (X3 fix — tenth-pass audit: function was never specified, but §11 acceptance requires the pricing page to hide the Free card when FREE_TIER_ENABLED_UK=false):

     ```typescript
     import type { Region } from '@/db/schema/enums';

     // Env var naming convention: FREE_TIER_ENABLED_<REGION_UPPERCASE>
     // e.g. FREE_TIER_ENABLED_AU=true, FREE_TIER_ENABLED_UK=false
     // All regions default to false if env var is not set (safe default — opt-in).

     export function isFreeTierEnabled(region: Region): boolean {
       const key = `FREE_TIER_ENABLED_${region.toUpperCase()}` as const;
       return process.env[key] === 'true';
     }
     ```

     Usage in pricing page server component:
     ```typescript
     const region = headers().get('x-visibleau-region') as Region ?? 'au';
     const showFreeTier = isFreeTierEnabled(region);
     // Pass showFreeTier to client to conditionally render the Free tier card
     ```

   - Middleware sets x-visibleau-region response header (used by pricing page above)

8. EMPTY INNGEST + STRIPE SETUP

   **lib/inngest/client.ts** (Z3 fix — content was never specified):
   ```typescript
   import { Inngest } from 'inngest';

   export const inngest = new Inngest({
     id: 'visibleau',
     // eventKey is read from process.env.INNGEST_EVENT_KEY automatically
   });
   ```

   **app/api/webhooks/inngest/route.ts** (T4 fix: canonical path per CLAUDE.md §6):
   ```typescript
   import { serve } from 'inngest/next';
   import { inngest } from '@/lib/inngest/client';
   // Sprint 2+ will import functions here:
   // import { runAudit } from '@/inngest/functions/run-audit';

   export const { GET, POST, PUT } = serve({
     client: inngest,
     functions: [
       // empty in Sprint 1 — Sprint 2 adds runAudit
     ],
   });
   ```

   **lib/stripe/client.ts** (Z4 fix — never mentioned despite stripe being in §2 deps):
   ```typescript
   import Stripe from 'stripe';

   // Singleton Stripe client — import this in any server-side route that needs Stripe.
   // Never import in client components (exposes secret key).
   export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
     apiVersion: '2024-04-10',
     typescript: true,
   });
   ```

   **app/api/health/route.ts** (Z5 fix — DB check implementation was never specified):
   ```typescript
   import { db } from '@/db/client';
   import { sql } from 'drizzle-orm';
   import { NextResponse } from 'next/server';

   export async function GET() {
     let dbStatus: 'ok' | 'error' = 'ok';
     try {
       await db.execute(sql`SELECT 1`);
     } catch {
       dbStatus = 'error';
     }
     return NextResponse.json({
       status: dbStatus === 'ok' ? 'ok' : 'degraded',
       timestamp: new Date().toISOString(),
       db: dbStatus,
     }, { status: dbStatus === 'ok' ? 200 : 503 });
   }
   ```

   **biome.json** (Z6 fix — content was never specified; default Biome is too strict for new projects):
   ```json
   {
     "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
     "organizeImports": { "enabled": true },
     "linter": {
       "enabled": true,
       "rules": {
         "recommended": true,
         "suspicious": {
           "noExplicitAny": "warn"
         },
         "style": {
           "noNonNullAssertion": "off"
         },
         "correctness": {
           "noUnusedVariables": "warn",
           "noUnusedImports": "warn"
         }
       }
     },
     "formatter": {
       "enabled": true,
       "indentStyle": "space",
       "indentWidth": 2,
       "lineWidth": 100
     },
     "files": {
       "ignore": ["node_modules", ".next", "db/migrations"]
     }
   }
   ```

   Register the Inngest endpoint in the Inngest dashboard: https://app.inngest.com → connect → paste `http://localhost:3000/api/webhooks/inngest`

9a. CONFIGURE VITEST (Y3 fix — eleventh-pass audit: vitest.config.ts content was never specified)
    Create `vitest.config.ts`:

    ```typescript
    import { defineConfig } from 'vitest/config';
    import tsconfigPaths from 'vite-tsconfig-paths';

    export default defineConfig({
      plugins: [tsconfigPaths()],
      test: {
        environment: 'node',     // API routes are Node, not browser
        globals: true,           // vi, describe, it, expect without imports
        setupFiles: ['./tests/setup.ts'],
        include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
        // Separate pool for integration tests to avoid Postgres connection reuse issues
        pool: 'forks',
        coverage: {
          provider: 'v8',
          include: ['lib/**', 'app/api/**'],
          exclude: ['**/*.test.ts', 'tests/**'],
        },
      },
    });
    ```

    Also install `vite-tsconfig-paths` for `@/` path alias support:
    ```bash
    pnpm add -D vite-tsconfig-paths
    ```

    Create `tests/setup.ts` — truncates test tables before each integration test file:
    ```typescript
    import { afterAll, beforeEach } from 'vitest';
    import { db } from '@/db/client';
    import { brands, users, organizations } from '@/db/schema';

    // Wipe test data between test files (not between individual tests — use transactions for that)
    beforeEach(async () => {
      // Delete in FK-safe order (brands → users → organizations)
      await db.delete(brands);
      await db.delete(users);
      await db.delete(organizations);
    });

    afterAll(async () => {
      // Drizzle/postgres-js doesn't need explicit pool close in test env
    });
    ```

9. TESTS
   - Unit: region/detect (16+ cases), feature-flags, brands authorization
   - Integration: brand CRUD with mocked Clerk session, cross-org isolation
   - E2E (Playwright): signup -> create brand -> see brand in list -> sign out -> sign in as second org user -> cannot see first org's brand

9b. POSTHOG SETUP (T2 fix: PostHog was in §1 prerequisites but missing from build steps)
   - posthog-js + posthog-node already installed (§2)
   - Create lib/analytics/posthog.ts: server-side PostHog client using NEXT_PUBLIC_POSTHOG_KEY
   - Add PostHogProvider wrapper in app/layout.tsx (client-side pageview tracking)
   - No events fire until Sprint 2 (first audit completion is the first meaningful funnel event)
   - Environment: NEXT_PUBLIC_POSTHOG_KEY + NEXT_PUBLIC_POSTHOG_HOST from §3

10a. PACKAGE.JSON SCRIPTS (W2 fix — never specified; referenced in §11 acceptance criteria)
    Add these scripts to package.json (in addition to what `pnpm create next-app` generates):
    ```json
    {
      "scripts": {
        "dev": "next dev",
        "build": "next build",
        "start": "next start",
        "lint": "biome check .",
        "lint:fix": "biome check --write .",
        "format": "biome format --write .",
        "typecheck": "tsc --noEmit",
        "test": "vitest run",
        "test:watch": "vitest",
        "test:ui": "vitest --ui",
        "test:coverage": "vitest run --coverage",
        "test:e2e": "playwright test",
        "test:e2e:ui": "playwright test --ui",
        "db:generate": "drizzle-kit generate",
        "db:migrate": "drizzle-kit migrate",
        "db:studio": "drizzle-kit studio",
        "stripe:setup": "tsx scripts/setup-stripe-products.ts"
      }
    }
    ```

10b. GITHUB ACTIONS CI WORKFLOW (Y4 fix — eleventh-pass audit: never specified)
    Create `.github/workflows/ci.yml`:

    ```yaml
    name: CI

    on:
      push:
        branches: [main]
      pull_request:
        branches: [main]

    jobs:
      lint:
        name: Lint (Biome)
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: pnpm/action-setup@v3
            with: { version: 9 }
          - uses: actions/setup-node@v4
            with: { node-version: '20', cache: 'pnpm' }
          - run: pnpm install --frozen-lockfile
          - run: pnpm lint

      typecheck:
        name: Type check
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: pnpm/action-setup@v3
            with: { version: 9 }
          - uses: actions/setup-node@v4
            with: { node-version: '20', cache: 'pnpm' }
          - run: pnpm install --frozen-lockfile
          - run: pnpm typecheck

      test:
        name: Unit + Integration tests (Vitest)
        runs-on: ubuntu-latest
        services:
          postgres:
            image: postgres:16
            env:
              POSTGRES_USER: postgres
              POSTGRES_PASSWORD: postgres
              POSTGRES_DB: visibleau_test
            ports: ['5432:5432']
            options: >-
              --health-cmd pg_isready
              --health-interval 10s
              --health-timeout 5s
              --health-retries 5
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/visibleau_test
          DIRECT_URL: postgresql://postgres:postgres@localhost:5432/visibleau_test
          LLM_MODE: mock
          # Clerk mock — unit/integration tests use vi.mock(), not real Clerk
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: pk_test_placeholder
          CLERK_SECRET_KEY: sk_test_placeholder
        steps:
          - uses: actions/checkout@v4
          - uses: pnpm/action-setup@v3
            with: { version: 9 }
          - uses: actions/setup-node@v4
            with: { node-version: '20', cache: 'pnpm' }
          - run: pnpm install --frozen-lockfile
          - run: pnpm db:migrate        # apply schema to test DB
          - run: pnpm test

      e2e:
        name: E2E tests (Playwright)
        runs-on: ubuntu-latest
        # E2E uses real Clerk test mode — credentials stored as GitHub secrets
        env:
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.CLERK_PUBLISHABLE_KEY_TEST }}
          CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY_TEST }}
          E2E_TEST_USER_EMAIL: ${{ secrets.E2E_TEST_USER_EMAIL }}
          E2E_TEST_USER_PASSWORD: ${{ secrets.E2E_TEST_USER_PASSWORD }}
          E2E_TEST_USER_2_EMAIL: ${{ secrets.E2E_TEST_USER_2_EMAIL }}
          E2E_TEST_USER_2_PASSWORD: ${{ secrets.E2E_TEST_USER_2_PASSWORD }}
          DATABASE_URL: ${{ secrets.DATABASE_URL_TEST }}
          DIRECT_URL: ${{ secrets.DATABASE_URL_TEST }}
          LLM_MODE: mock
        steps:
          - uses: actions/checkout@v4
          - uses: pnpm/action-setup@v3
            with: { version: 9 }
          - uses: actions/setup-node@v4
            with: { node-version: '20', cache: 'pnpm' }
          - run: pnpm install --frozen-lockfile
          - run: pnpm exec playwright install --with-deps chromium
          - run: pnpm build
          - run: pnpm test:e2e
    ```

    Store these GitHub secrets: `CLERK_PUBLISHABLE_KEY_TEST`, `CLERK_SECRET_KEY_TEST`, `E2E_TEST_USER_EMAIL`, `E2E_TEST_USER_PASSWORD`, `E2E_TEST_USER_2_EMAIL`, `E2E_TEST_USER_2_PASSWORD`, `DATABASE_URL_TEST` (points at Supabase test project or local Postgres).

10. CI
    - All four CI jobs (lint, typecheck, test, e2e) green before merging to main
    - CI config above handles Postgres service container for integration tests

POTENTIAL BLOCKERS to flag:
- Clerk Organizations beta API may have changed since May 2026
- Supabase Postgres provisioning may need region selection
- Drizzle-kit version compatibility with Next 15

Start with step 1. After project initializes cleanly, confirm before moving to step 2.
```

---

## 10. Tests required

### Unit (Vitest)

- `tests/unit/region/detect.test.ts` — 16+ cases covering: URL prefix wins over geo, fallback to AU, all 6 regions detected, EU country mapping
- `tests/unit/feature-flags/index.test.ts` — `isFreeTierEnabled('au')` reads env correctly, defaults to false for unknown env
- `tests/unit/brands/index.test.ts` — authorization check (own-org returns brand; cross-org returns null), region inheritance from org

### Integration (Vitest with test DB)

**Clerk mock strategy for integration tests (Y2 fix — eleventh-pass audit: never specified):**
Integration tests hit real API route handlers server-side. They don't go through the browser, so `@clerk/testing/playwright` doesn't apply here. Use `@clerk/nextjs/testing` with `vi.mock()`:

```typescript
// tests/integration/helpers/clerk-mock.ts
import { vi } from 'vitest';

// Call this at the top of each integration test file that needs auth
export function mockClerkAuth(overrides: Partial<{ userId: string; orgId: string; orgRole: string }> = {}) {
  vi.mock('@clerk/nextjs/server', () => ({
    auth: vi.fn().mockResolvedValue({
      userId: overrides.userId ?? 'test-user-id',
      orgId: overrides.orgId ?? 'test-org-id',
      orgRole: overrides.orgRole ?? 'org:member',
    }),
  }));
}

// For cross-org tests: mock as a different org
export function mockClerkAuthDifferentOrg() {
  return mockClerkAuth({ orgId: 'different-org-id' });
}
```

Usage in integration tests:
```typescript
import { mockClerkAuth } from '../helpers/clerk-mock';
beforeEach(() => { mockClerkAuth(); });
```

- `tests/integration/api/brands/list.test.ts` — returns only current org's brands
- `tests/integration/api/brands/create.test.ts` — validates Zod schema, inherits region from org, returns 201 + brand body
- `tests/integration/api/brands/update.test.ts` — cannot update region (pinned); returns 200 + updated brand body
- `tests/integration/api/brands/cross-org.test.ts` — **must return 404 on cross-org GET, NOT 401**
- `tests/integration/api/brands/soft-delete.test.ts` — **(V6 fix)** DELETE returns 204; subsequent GET returns 404; brand row has `deletedAt` set; list excludes it.
- `tests/integration/api/brands/brand-limit.test.ts` — **(V7 fix)** Free-tier org at 1 brand: POST returns 403.
- `tests/integration/api/webhooks/clerk.test.ts` — **(V2 coverage)** deletion events cascade correctly.

### E2E (Playwright)

**Clerk E2E auth strategy (W3 fix — eighth-pass audit: never specified):**
Playwright cannot drive Clerk's full UI auth flow reliably (iframes, OAuth redirects). Use `@clerk/testing/playwright`:

```bash
pnpm add -D @clerk/testing
```

```typescript
// playwright.config.ts — add to env:
env: {
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY!,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!,
}

// tests/e2e/fixtures.ts — shared auth fixture:
import { test as base } from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';

export const test = base.extend({
  page: async ({ page }, use) => {
    await clerkSetup();
    // Sign in as a pre-seeded test user (created in Clerk test mode dashboard)
    await clerk.signIn({
      page,
      signInParams: {
        strategy: 'password',
        identifier: process.env.E2E_TEST_USER_EMAIL!,
        password: process.env.E2E_TEST_USER_PASSWORD!,
      },
    });
    await use(page);
    await clerk.signOut({ page });
  },
});
```

Add to `.env.test.local`:
```bash
E2E_TEST_USER_EMAIL=test-user@visibleau.test
E2E_TEST_USER_PASSWORD=Test1234!
E2E_TEST_USER_2_EMAIL=test-user-2@visibleau.test
E2E_TEST_USER_2_PASSWORD=Test1234!
```

Create these two users in Clerk test-mode dashboard. Each must belong to a different Clerk org so cross-org isolation tests work.

- `tests/e2e/auth.spec.ts` — signup flow + redirect to dashboard
- `tests/e2e/brands.spec.ts` — create brand + see in list + cross-org isolation

---

## 11. Acceptance criteria

Sprint 1 is done when:

- [ ] `pnpm dev` starts the app on localhost:3000
- [ ] `pnpm lint` passes (Biome)
- [ ] `pnpm typecheck` passes (tsc --noEmit)
- [ ] `pnpm test` passes (Vitest unit + integration)
- [ ] `pnpm test:e2e` passes (Playwright)
- [ ] Signup at `/au/sign-up` creates a Clerk org + syncs to `organizations` row via webhook
- [ ] User can navigate `/dashboard`, see empty layout with sidebar
- [ ] User can click "Create brand" → fill form → submit → see brand in list
- [ ] User can click a brand → see detail page → edit inline → save
- [ ] User can delete a brand → it disappears from list (soft-deleted in DB; `deletedAt` set, not null; hard-delete never called)
- [ ] Second org user cannot access first org's brand URL (returns 404)
- [ ] Cross-org DELETE returns 404 (not 204 or 500)
- [ ] Free-tier org with 1 brand: creating a second brand returns 403 "Brand limit reached"
- [ ] Stripe products visible in test-mode dashboard (5 products total: Starter, Growth, Agency, Agency Pro recurring + One-off Audit non-recurring; per §7 setup script)
- [ ] Region detection: `/au/*` routes return `x-visibleau-region: au`; `/uk/*` returns `uk`
- [ ] Feature flag: `FREE_TIER_ENABLED_UK=false` is reflected in pricing page UI (Free card hidden on /uk/pricing)
- [ ] CI on GitHub Actions green on a PR to main

---

## 12. Common pitfalls / Sprint 1 anti-patterns

- **Do not** enable RLS on a table without creating policies for it. RLS enabled + no policies = deny-all for anon key reads. `organizations` and `users` both need explicit SELECT policies (see §5 RLS section). The service-role key bypasses RLS for Inngest/webhook handlers; app routes use anon key and need policies.
- **Do not** create a brand without checking the tier's brand limit first. Free/Starter/Growth = 1 brand; Agency = 5; Agency Pro = 25. Use `TIER_BRAND_LIMITS` from `lib/brands/index.ts` and return 403 (not 400) if limit is exceeded.
- **Do not** return 401 on cross-org access. The conventions in CLAUDE.md §7 are clear: 404. A test enforces this.
- **Do not** hard-delete brands. Use soft-delete (`deletedAt = NOW()`). All read queries filter `WHERE deletedAt IS NULL`.
- **Do not** pin the brand's region to user's current request region. Pin to the organization's region at create time. Users can travel; orgs don't.
- **Do not** allow `region` to be updated via PATCH. It's pinned at create.
- **Do not** trust client-side authorization. Every API route checks `currentUser.organizationId` server-side.
- **Do not** install ESLint. Project uses Biome.
- **Do not** use the Drizzle Query API. Use the SQL builder API (`db.select().from(...)`).
- **Do not** start implementing Stripe subscription handling. That's Sprint 10. Sprint 1 just creates products + webhook route stub.
- **Do not** skip the Clerk webhook idempotency. Clerk replays events; your handler must be safe to call twice.

---

## 13. Handoff to Sprint 2

After Sprint 1 acceptance passes, the following is ready for Sprint 2:

- ✓ `lib/inngest/client.ts` exists; `inngest/functions/` directory ready for `run-audit.ts`
- ✓ Resend SDK installed; email layer ready for completion email
- ✓ `audits` and `citations` tables NOT yet created — Sprint 2 adds them
- ✓ `LLM_MODE=mock` env var set; mock fixtures NOT yet created — Sprint 2 adds them
- ✓ `tier` enum on organizations is in place — Sprint 3's `model-selector.ts` will read it
- ✓ Brand has `vertical` field — Sprint 2 will use it to select prompts (vertical packs themselves arrive Sprint 5; Sprint 2 uses inline 10-prompt arrays)
- ✓ Multi-tenant isolation pattern (404 not 401) established — Sprint 2 audits follow same pattern

**Not ready (intentionally):**
- Vertical pack tables (Sprint 5)
- Action Center / recommendations (Sprint 6)
- Scheduled audits (Sprint 9)
- Stripe checkout flow (Sprint 10)

---

- **Do not** use `app/api/inngest/route.ts` as the Inngest handler path. The canonical path per CLAUDE.md §6 is `app/api/webhooks/inngest/route.ts`. Using the wrong path means the Inngest dashboard cannot connect to your local or deployed endpoint.
- **Do not** skip the PostHog install even though no events fire in Sprint 1. Install `posthog-js posthog-node`, set env vars, wrap `app/layout.tsx` with PostHogProvider. Sprint 2 fires the first funnel event. Installing later is much more disruptive than doing it now.

---

## Changelog

- v1.9 (15 May 2026): **Thirteenth-pass audit — API integration patterns and missing layout specs (AA1-AA5).** **(AA1)** §9 step 3: `lib/auth/current-user.ts` content now specified — `getCurrentUser()` calls Clerk `auth()`, looks up the `users` row joined to `organizations` by `clerkUserId`, returns typed `CurrentUser | null`. Every API route depends on this. **(AA2)** §6: `setRlsContext()` call pattern now documented in every protected route — must call `await setRlsContext(db, currentUser.organizationId)` before any DB query; without it the RLS policies (§5) are enabled but never triggered, silently bypassing the DB security backstop. **(AA3)** §9 step 4: Clerk webhook race condition documented — after signup, `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard` sends users to `/dashboard` before `organization.created` + `organizationMembership.created` webhooks fire. `getCurrentUser()` returns null during this window. Dashboard page.tsx spec now includes a `if (!user) redirect('/sign-in')` guard. **(AA4)** §9 step 4: `app/(auth)/layout.tsx` content now specified — `<ClerkLoading>` spinner + `<SignedIn>` wrapping the sidebar+topbar shell. **(AA5)** §9 step 2: `db/schema/index.ts` barrel export content now specified — re-exports all tables and enums, plus `Organization`, `User`, `Brand` inferred types from Drizzle's `InferSelectModel`.
- v1.8 (15 May 2026): **Twelfth-pass audit — data-flow plumbing, missing library specs (Z1-Z6).** **(Z1)** §6 Clerk webhook `organization.created`: critical gap fixed — Clerk's webhook payload has no native region field; `organizations.region NOT NULL` would fail on insert. Region must be stored in Clerk org `publicMetadata` at org-creation time, then read as `evt.data.public_metadata.region` in the webhook. Full implementation pattern now documented in §6. **(Z2)** §3 env: added missing `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard` and `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard` — without these, Clerk redirects to `/` after auth and the user never reaches the app. **(Z3)** §9 step 8: `lib/inngest/client.ts` content now specified — `new Inngest({ id: 'visibleau' })`. `app/api/webhooks/inngest/route.ts` content now specified — `serve({ client: inngest, functions: [] })` with empty functions list for Sprint 1. **(Z4)** §9 step 8: `lib/stripe/client.ts` now specified — was never mentioned despite `stripe` being in §2 deps and `STRIPE_SECRET_KEY` in §3 env. Exports singleton `new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })`. **(Z5)** §9 step 8: `app/api/health/route.ts` now fully specified — `db.execute(sql\`SELECT 1\`)` try/catch; returns `{ status, timestamp, db }` with 503 if DB unreachable. **(Z6)** §9 step 8: `biome.json` content now specified — `recommended: true`, `noNonNullAssertion: off` (needed for `process.env.X!`), `noExplicitAny: warn` (not error), formatter with 2-space indent and lineWidth 100.
- v1.7 (15 May 2026): **Tenth-pass audit — navigation, fixture data, missing implementation specs (X1-X3).** **(X1)** §9 step 2: `db/client.ts` actual content now specified — `drizzle-orm/postgres-js` + `postgres` with `max: 1` for serverless, plus `setRlsContext()` helper that calls `SET LOCAL app.current_org_id` per connection (required so the RLS policies from §5 can identify the current tenant). **(X2)** §9 step 5: `lib/brands/index.ts` function signatures now specified — `getBrandForOrg()`, `inheritRegion()`, `checkBrandLimit()` with TypeScript types matching the schema. Unit test `tests/unit/brands/index.test.ts` can now test against real signatures. **(X3)** §9 step 7: `lib/feature-flags/index.ts` function now specified — `isFreeTierEnabled(region)` reads `FREE_TIER_ENABLED_<REGION>` env var; §11 acceptance requires the pricing page to hide the Free card when this returns false for a region.
- v1.6 (15 May 2026): **Ninth-pass audit — implementation specifications (W1-W6).** **(W1)** §9 step 2: `drizzle.config.ts` content now specified — uses `DIRECT_URL` (port 5432) for migrations, not `DATABASE_URL` (port 6543 pooled). Supabase pooler does not support the SET commands Drizzle uses during migrations. **(W2)** §9 step 10a: `package.json` scripts section added — `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm db:generate`, `pnpm db:migrate`, `pnpm stripe:setup` now all defined. **(W3)** §10 E2E tests: Clerk E2E auth strategy added using `@clerk/testing/playwright`. Playwright cannot drive Clerk UI reliably; `clerk.signIn()` fixture bypasses Clerk UI. Two pre-seeded test users in Clerk test-mode dashboard. `E2E_TEST_USER_EMAIL/PASSWORD` env vars added. **(W4)** §6 `POST /api/brands`: `primaryRegions` Zod schema now specifies `STATE:Suburb` regex (`/^[A-Z]{2,4}:[A-Za-z][A-Za-z\s]{0,49}$/`) matching Foundations §3 canonical format. **(W5)** §3 env: `NEXT_PUBLIC_SUPABASE_ANON_KEY` now has security explanation — it IS intentionally public, safe ONLY because RLS is enforced. **(W6)** §7 Stripe products: Agency/Agency Pro metadata changed from `audits: 150/1500` (totals) to `auditsPerBrandPerMonth: 30/60` to match Sprint 9 `TIER_AUDIT_LIMITS` field names and prevent a future webhook-sync bug.
- v1.5 (15 May 2026): **Eighth-pass audit — test coverage, security, API contracts (V1-V7).** **(V1)** §5 RLS section: added missing policies for `organizations` (SELECT by org_id) and `users` (SELECT by org_id) — enabling RLS without policies = deny-all for anon key; app cannot read org.tier/region. **(V2)** §6 Clerk webhook: added `organization.deleted` (cascade soft-delete org + brands), `organizationMembership.deleted` (remove user row), `user.deleted` (hard-delete for GDPR). **(V3)** §6 `POST /api/brands`: added brand-limit check using `TIER_BRAND_LIMITS` map before insert; 403 "Brand limit reached" if exceeded. **(V4)** §6 `PATCH /api/brands`: added `200 + { brand: Brand }` response spec — Sprint 4 reads updated brand after save. **(V5)** §6 `DELETE /api/brands`: added cross-org + not-found → 404 before soft-delete. **(V6)** §10: added `soft-delete.test.ts` integration test. **(V7)** §10: added `brand-limit.test.ts` integration test. §11 acceptance and §12 anti-patterns updated.
- v1.4 (15 May 2026): **Seventh-pass audit U1.** §1 Definition of Done line said "/au/signup" (no hyphen) — inconsistent with §3 env var `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`, §4 project file `sign-up/[[...sign-up]]/page.tsx`, §11 acceptance "Signup at /au/sign-up", and all 4 other occurrences in the prompt. Fixed to `/au/sign-up`.
- v1.3 (15 May 2026): **Sixth-pass audit — technical completeness angle.** **(T1)** `regionEnum` was internally consistent with Sprint 1 lowercase (`'au','nz',...`) — Foundations was the outlier; that's fixed in Foundations v1.12. **(T2)** PostHog added to §2 dependencies (`posthog-js posthog-node`) and §3 env vars (`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`); added §9b PostHog setup step; added §12 anti-pattern note. PostHog is listed as a prerequisite in §1 and is in PRD §10 + CLAUDE.md §3 but was absent from the actual build instructions. **(T3)** `subscriptionCancelledAt` added to organizations schema in §5. Foundations v1.6 added it; Sprint 10 reads it (`customer.subscription.deleted`); not creating it in Sprint 1 migration would require an ALTER TABLE in Sprint 10 mid-flow. **(T4)** Inngest route path corrected in §4 project structure and §9 step 8: `app/api/inngest/route.ts` → `app/api/webhooks/inngest/route.ts` per CLAUDE.md §6 canonical. The wrong path means the Inngest dashboard cannot connect to the handler. Anti-pattern added in §12. **(T8)** verticalEnum v1.1 migration note added: Sprint 5 extends the enum when seeding Professional Services + Real Estate packs; Sprint 4 wizard shows them locked in the prototype until then.

- v1.2 (15 May 2026): **Fifth-pass audit S1+S2.** §0 "Read first" references bumped: Foundations v1.9 → v1.11 (current); PRD v1.14 → v1.15 (current); CLAUDE.md now explicitly v1.4. Same versions updated at §4 body and §9 Claude Code prompt. §11 acceptance checklist: Stripe product count corrected from "4 products (Starter, Growth, Agency, Agency Pro)" to "5 products total (4 recurring + One-off Audit)" — the §7 setup script already creates the one-off audit; the checklist was just stale.
- v1.1 (12 May 2026): Conflict-resolution fixes. **Stack:** Vercel Postgres → Supabase Postgres + RLS policies (PRD §10). **Stripe products:** Starter A$49→A$99, Growth A$199→A$299 (PRD §7); brand counts corrected (Growth 5→1, Agency 20→5, Agency Pro 100→25); tier frequencies added (weekly/3x_weekly/daily/2x_daily); annual billing added (10× monthly = 2 months free); one-off audit product A$299 added (PRD §7 Principle #4). Dependencies: `@vercel/postgres` → `@supabase/supabase-js`. Environment vars updated. RLS policy section added between schema and API routes.
- v1.0 (12 May 2026): Initial comprehensive sprint prompt per Sri's "no missing requirements" ask. Supersedes the Sprint 1 section of sri-visibleau-sprints-1-3.md v1.12.
