# Claude Code — Replace Clerk with Better Auth (Fully Local)

# No external services. Everything runs on local PC.

# Database: local PostgreSQL (visibleau + visibleau_test already created)

# 

# CONFLICTS FIXED (15 issues resolved against Sprint 1-12 prompts):

# FIX-1  Step 1  — added `pnpm remove svix` (Sprint 1 installs svix alongside Clerk)

# FIX-2  Step 2  — .env.test → .env.test.local (Next.js loads .env.test.local for tests)

# FIX-3  Step 4  — merged duplicate emailAndPassword key (JS silently dropped minPasswordLength)

# FIX-4  Step 4  — authOrgId → clerkOrgId (organizations column is clerk_org_id per Sprint 1 §5)

# FIX-5  Step 4  — added missing `organizations` import to lib/auth/server.ts

# FIX-6  Step 4  — added `users` sync in organizationCreation hook

# FIX-7  Step 4  — added new step: lib/auth/current-user.ts (fully replaced, not just snippets)

# FIX-8  Step 7  — restored region detection (Sprint 1 §1 deliverable; definition of done needs /au/)

# FIX-9  Step 8  — removed lib/db/rls.ts; setRlsContext stays in db/client.ts (all sprints import from there)

# FIX-10 Step 9  — sign-in page path: app/sign-in/ not app/(auth)/sign-in/ (Sprint 1 §4 canonical)

# FIX-11 Step 10 — sign-up page path: app/sign-up/ not app/(auth)/sign-up/ (Sprint 1 §4 canonical)

# FIX-12 Step 11 — added app/(auth)/layout.tsx replacement (uses <SignedIn><ClerkLoading> from Clerk)

# FIX-13 Step 11 — added explicit deletion of app/api/webhooks/clerk/route.ts

# FIX-14 Step 12 — Windows-safe migration command using cross-env

# FIX-15 Step 15 — seed script: sign in first to get real token before creating org

# FIX-A  Step 4  — wrong Drizzle .where() API replaced with eq(); eq imported; crypto→randomUUID

# FIX-B  Step 4  — users insert email:’’ → placeholder that satisfies NOT NULL constraint

# FIX-C  Step 3b — new step: update db/schema/index.ts to export auth tables (barrel)

# FIX-D  Step 12 — added drizzle.config.ts schema path verification

# FIX-E  Step 2  — added LLM_MODE, FREE_TIER_ENABLED_*, INNGEST stubs to .env.local

# FIX-F  Step 1,11 — remove resend/react-email; add lib/email/client.ts nodemailer replacement

# FIX-G  Step 11 — lib/email/client.ts keeps `resend` export name so Sprint 2 imports unchanged

# FIX-H  Step 4c — dashboard race condition guard (Sprint 1 AA3 fix, same race exists in Better Auth)

# FIX-I  Step 14 — verify checklist updated to match Sprint 1 §11 acceptance criteria

# FIX-J  Step 14 — added pnpm test:e2e to clean state checklist

# FIX-K  Step 11 — renamed duplicate ‘### C.’ section to ‘### D.’ and ‘### E.’

# FIX-L  Step 4  — removed member.email/member.name (not on Better Auth member object)

# FIX-M  Mocks   — jest.mock/jest.fn → vi.mock/vi.fn (project uses Vitest not Jest)

# FIX-N  Step 11 — added tests/integration/helpers/clerk-mock.ts Better Auth replacement

# FIX-O  Step 12 — cross-env sets DIRECT_URL not DATABASE_URL (drizzle.config.ts reads DIRECT_URL)

# FIX-P  Step 15 — added second test user seed for cross-org E2E tests

# FIX-Q  Step 3b — removed unused InferInsertModel import from barrel

# FIX-R  Step 4  — removed conflicting `type User` export from server.ts (collides with barrel)

# FIX-S  Step 10 — agencyName is now required; org.create unconditional (users must have org)

# FIX-T  Step 3b — restored InferInsertModel export to match Sprint 1 canonical barrel exactly

# FIX-U  Step 4  — added comment clarifying metadata omission is safe (Postgres default applies)

# FIX-V  Step 4,4b — set RLS context before org SELECT in afterCreate hook and sync-user route

# FIX-W  Step 8  — removed getCurrentOrgId from db/client.ts (circular dep: server→client→server)

# FIX-X  Step 4d — new step: update tests/setup.ts to truncate auth_* tables between tests

# FIX-Y  Step 11 — grep now includes tests/ directory (clerk-mock.ts has @clerk references)

# FIX-Z  Step 2  — added RESEND_DEV_RECIPIENT to .env.local (Sprint 2 S2 fix requirement)

# FIX-AA Step 4  — added `sql` to drizzle-orm import in server.ts (used in afterCreate hook)

# FIX-AB Step 4b — documented why getCurrentUser skips setRlsContext (postgres superuser bypasses RLS)

# FIX-AC Step 12 — clarified drizzle-kit vs Better Auth schema ownership to prevent duplicate tables

# FIX-AD Step 10 — sign-up page now handles org.create errors and sync-user failures gracefully

# FIX-AE Step 13 — CLAUDE.md update now covers clerkOrgId/clerkUserId column name explanation

# FIX-AF Step 1  — added `pnpm remove @clerk/testing` (Sprint 1 W3 installs it for Playwright)

# FIX-AG Step 11 — added tests/e2e/fixtures.ts replacement (used @clerk/testing/playwright)

# FIX-AH Step 2  — added E2E_TEST_USER env vars to .env.test.local (Playwright auth.spec.ts)

# FIX-AI Step 13 — added .github/workflows/ci.yml Clerk secret removal instructions

# FIX-AK Step 4  — afterCreate set_config used Wrong ID (org.id TEXT not UUID); capture UUID upfront

# FIX-AL Step 4b — sync-user set_config moved after org lookup; uses org.id UUID not Better Auth text id

# FIX-AM Step 1  — added vite-tsconfig-paths install (Sprint 1 Y3 fix — needed for @/ in Vitest)

-----

## CONTEXT — WHY THIS CHANGE

The project is switching from Clerk (requires external account + API keys)
to Better Auth (self-hosted, runs fully on local PC, no external calls).
The database (PostgreSQL) is already running locally and tables are migrated.
This prompt completes the auth layer so the app starts with zero external dependencies
except the AI API keys (OpenAI, Anthropic, Perplexity, Gemini — those stay external,
they ARE the product).

-----

## READ THESE FIRST

1. `CLAUDE.md` — read §3 (tech stack), §5 (auth pattern), §6 (folder structure)
1. `sri-visibleau-foundations.md` v1.12 — read §2 (folder structure) + §3 (schema)
1. `sri-visibleau-sprint-1-prompt.md` — understand what Sprint 1 built

**IMPORTANT OVERRIDE:** Anywhere CLAUDE.md or sprint prompts say “Clerk”,
read it as “Better Auth”. The auth pattern (middleware, session, org context,
RLS, 404-not-401) stays exactly the same — only the library changes.

-----

## STEP 1 — REMOVE CLERK, INSTALL BETTER AUTH

```bash
# Remove Clerk, svix, resend and react-email
# svix: Clerk webhook verification only
# resend/react-email: replaced by nodemailer for local dev (Sprint 2 lib/email/client.ts)
pnpm remove @clerk/nextjs @clerk/backend @clerk/themes @clerk/testing svix resend react-email @react-email/components 2>/dev/null || true

# Install Better Auth
pnpm add better-auth

# Install cross-env for Windows-safe env var commands
pnpm add -D cross-env

# Install nodemailer for local email (replaces Resend for now)
pnpm add nodemailer
pnpm add -D @types/nodemailer

# vite-tsconfig-paths: needed for @/ path aliases in Vitest (Sprint 1 Y3 fix)
# Without this, all Vitest tests fail: "Cannot find module '@/...'"
pnpm add -D vite-tsconfig-paths

# Delete the Clerk webhook route — it is replaced by Better Auth hooks
# (see Step 11 for full details)
rm -f app/api/webhooks/clerk/route.ts
```

-----

## STEP 2 — UPDATE .env.local AND .env.test.local

Remove all Clerk environment variables.
Add Better Auth variables.

**`.env.local`** (dev database):

```env
# ── App ──────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ── Better Auth (replaces Clerk) ─────────────────────────────────────
BETTER_AUTH_SECRET=GENERATE_THIS_NOW
BETTER_AUTH_URL=http://localhost:3000

# ── Database (local PostgreSQL — already working) ─────────────────────
DATABASE_URL=postgresql://postgres:password@localhost:5432/visibleau
DIRECT_URL=postgresql://postgres:password@localhost:5432/visibleau

# ── Email (local — just logs to console for now) ──────────────────────
SMTP_HOST=localhost
SMTP_PORT=1025

# ── Analytics (disabled locally) ──────────────────────────────────────
NEXT_PUBLIC_POSTHOG_KEY=local-disabled
NEXT_PUBLIC_POSTHOG_HOST=http://localhost:3000

# ── Billing stub (real Stripe not needed until Sprint 10) ─────────────
STRIPE_SECRET_KEY=sk_test_local_stub
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_local_stub
STRIPE_WEBHOOK_SECRET=whsec_local_stub

# ── AI APIs (external — keep these as-is) ─────────────────────────────
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
PERPLEXITY_API_KEY=your_key_here
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here

# ── LLM mode (Sprint 2+ but set now per Sprint 1 §3) ──────────────────
LLM_MODE=mock

# ── Feature flags (Sprint 1 §3 — required for region middleware) ───────
FREE_TIER_ENABLED_AU=true
FREE_TIER_ENABLED_NZ=true
FREE_TIER_ENABLED_UK=false
FREE_TIER_ENABLED_US=false
FREE_TIER_ENABLED_CA=false
FREE_TIER_ENABLED_EU=false

# ── Inngest stubs (Sprint 2+ but install Sprint 1 per Z3 fix) ──────────
INNGEST_EVENT_KEY=local-stub
INNGEST_SIGNING_KEY=local-stub

# ── Email dev recipient (Sprint 2 S2 fix — audit completion email recipient) ─
RESEND_DEV_RECIPIENT=dev@visibleau.local
```

Generate the Better Auth secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and paste it as the value of `BETTER_AUTH_SECRET`.

**`.env.test.local`** (test database — note: .env.test.local, not .env.test):

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/visibleau_test
DIRECT_URL=postgresql://postgres:password@localhost:5432/visibleau_test
BETTER_AUTH_SECRET=test-secret-32-chars-minimum-here
BETTER_AUTH_URL=http://localhost:3000
LLM_MODE=mock

# E2E test users (Sprint 1 W3 fix — Playwright needs these for auth.spec.ts)
# Must match the users seeded by scripts/seed-auth-user.ts (Step 15)
E2E_TEST_USER_EMAIL=sri@visibleau.local
E2E_TEST_USER_PASSWORD=password123
E2E_TEST_USER_2_EMAIL=user2@visibleau.local
E2E_TEST_USER_2_PASSWORD=password123
```

-----

## STEP 3 — ADD BETTER AUTH TABLES TO DRIZZLE SCHEMA

Create `db/schema/auth.ts`:

```typescript
import {
  pgTable,
  text,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core';

// ── Better Auth core tables ──────────────────────────────────────────

export const authUsers = pgTable('auth_users', {
  id:            text('id').primaryKey(),
  name:          text('name').notNull(),
  email:         text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image:         text('image'),
  createdAt:     timestamp('created_at', { withTimezone: true })
                   .notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true })
                   .notNull().defaultNow(),
});

export const authSessions = pgTable('auth_sessions', {
  id:        text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token:     text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId:    text('user_id').notNull()
               .references(() => authUsers.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true })
               .notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
               .notNull().defaultNow(),
});

export const authAccounts = pgTable('auth_accounts', {
  id:                    text('id').primaryKey(),
  accountId:             text('account_id').notNull(),
  providerId:            text('provider_id').notNull(),
  userId:                text('user_id').notNull()
                           .references(() => authUsers.id, { onDelete: 'cascade' }),
  accessToken:           text('access_token'),
  refreshToken:          text('refresh_token'),
  idToken:               text('id_token'),
  accessTokenExpiresAt:  timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope:                 text('scope'),
  password:              text('password'),
  createdAt:             timestamp('created_at', { withTimezone: true })
                           .notNull().defaultNow(),
  updatedAt:             timestamp('updated_at', { withTimezone: true })
                           .notNull().defaultNow(),
});

export const authVerifications = pgTable('auth_verifications', {
  id:         text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value:      text('value').notNull(),
  expiresAt:  timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true })
                .notNull().defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true })
                .notNull().defaultNow(),
});

// ── Multi-tenant org tables (replaces Clerk org model) ───────────────

export const authOrganizations = pgTable('auth_organizations', {
  id:        text('id').primaryKey(),
  name:      text('name').notNull(),
  slug:      text('slug').unique(),
  logo:      text('logo'),
  metadata:  text('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true })
               .notNull().defaultNow(),
});

export const authMembers = pgTable('auth_members', {
  id:             text('id').primaryKey(),
  organizationId: text('organization_id').notNull()
                    .references(() => authOrganizations.id, { onDelete: 'cascade' }),
  userId:         text('user_id').notNull()
                    .references(() => authUsers.id, { onDelete: 'cascade' }),
  role:           text('role').notNull().default('member'),
  createdAt:      timestamp('created_at', { withTimezone: true })
                    .notNull().defaultNow(),
});

export const authInvitations = pgTable('auth_invitations', {
  id:             text('id').primaryKey(),
  organizationId: text('organization_id').notNull()
                    .references(() => authOrganizations.id, { onDelete: 'cascade' }),
  email:          text('email').notNull(),
  role:           text('role'),
  status:         text('status').notNull().default('pending'),
  expiresAt:      timestamp('expires_at', { withTimezone: true }).notNull(),
  inviterId:      text('inviter_id').notNull()
                    .references(() => authUsers.id, { onDelete: 'cascade' }),
  createdAt:      timestamp('created_at', { withTimezone: true })
                    .notNull().defaultNow(),
});
```

## STEP 3b — UPDATE db/schema/index.ts BARREL EXPORT (FIX-C)

Sprint 1 §9 AA5 fix specifies the barrel export in `db/schema/index.ts`.
Add the new auth schema so all imports from `@/db/schema` find the auth tables:

```typescript
// db/schema/index.ts — add to existing exports
export * from './enums';
export * from './organizations';
export * from './users';
export * from './brands';
export * from './auth';   // FIX-C: add Better Auth tables to barrel

// Re-export Drizzle utility types for use throughout lib/ and app/api/
export type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

import { organizations } from './organizations';
import { users } from './users';
import { brands } from './brands';
import type { InferSelectModel } from 'drizzle-orm';

// Convenience aliases — import these instead of using InferSelectModel directly
export type Organization = InferSelectModel<typeof organizations>;
export type User         = InferSelectModel<typeof users>;   // VisibleAU DB user (NOT Better Auth user)
export type Brand        = InferSelectModel<typeof brands>;
```

-----

## STEP 4 — CREATE BETTER AUTH SERVER INSTANCE

Create `lib/auth/server.ts`:

```typescript
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { db } from '@/db/client';
import * as authSchema from '@/db/schema/auth';
// FIX-5: import organizations and users tables for sync hooks
import { organizations, users } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';  // FIX-A: eq for .where(); sql for set_config RLS context (FIX-V)
import { randomUUID } from 'crypto';  // FIX-A: named import is more reliable than default

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user:         authSchema.authUsers,
      session:      authSchema.authSessions,
      account:      authSchema.authAccounts,
      verification: authSchema.authVerifications,
    },
  }),

  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',

  // FIX-3: merged into one emailAndPassword block (was declared twice — JS
  // silently overwrites the first key, losing minPasswordLength)
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // disabled for local dev — enable for production
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      console.log(`\n[AUTH EMAIL] Password reset for ${user.email}`);
      console.log(`[AUTH EMAIL] Click: ${url}\n`);
    },
  },

  plugins: [
    organization({
      schema: {
        organization: authSchema.authOrganizations,
        member:       authSchema.authMembers,
        invitation:   authSchema.authInvitations,
      },
      organizationCreation: {
        afterCreate: async ({ organization: org, member }) => {
          // FIX-4: clerkOrgId is the correct column name (Sprint 1 §5 schema)
          // FIX-6: also sync the creating user into the VisibleAU users table
          // FIX-AK: capture the UUID upfront so we can use it for RLS context
          //         (org.id is Better Auth's TEXT id, not the UUID RLS policy checks)
          const newOrgId = randomUUID();
          await db.insert(organizations).values({
            id:         newOrgId,
            clerkOrgId: org.id,   // Better Auth org ID stored in this column
            name:       org.name,
            tier:       'free',
            region:     'au',
            // metadata: omitted — Sprint 1 schema has .default(sql`'{}'::jsonb`)
            // Postgres will use the column default. Drizzle does NOT require it here.
          }).onConflictDoNothing();

          // Sync the org creator into the VisibleAU users table
          // member.userId is the Better Auth auth_users.id of the creator
          // Note: postgres superuser bypasses RLS automatically (FIX-AB), so
          // set_config is optional here — but we set it for correctness using
          // newOrgId (the UUID), not org.id (Better Auth text id, wrong value).
          if (member?.userId) {
            await db.execute(
              sql`SELECT set_config('app.current_org_id', ${newOrgId}, true)`
            );
            const [orgRow] = await db
              .select()
              .from(organizations)
              .where(eq(organizations.clerkOrgId, org.id));

            if (orgRow) {
              // email/name not available on member object (Better Auth member has only
              // id/organizationId/userId/role/createdAt). Use placeholder — sync-user
              // route updates with real values once session is established.
              await db.insert(users).values({
                clerkUserId:    member.userId,
                organizationId: orgRow.id,
                email:          'pending@sync.local', // updated by sync-user route
                name:           '',
                role:           'owner',
              }).onConflictDoNothing();
            }
          }
        },
      },
    }),
  ],

  // Local email — just log to console (no external email service needed)
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      console.log(`\n[AUTH EMAIL] Verify email for ${user.email}`);
      console.log(`[AUTH EMAIL] Click: ${url}\n`);
    },
  },
});

// Note: do NOT export `type User` here — it collides with
// the User type in db/schema/index.ts (InferSelectModel<typeof users>).
// Session type exported for use in middleware/layout where needed.
export type Session     = typeof auth.$Infer.Session;
export type BetterAuthUser = typeof auth.$Infer.Session.user;
```

-----

## STEP 4b — UPDATE lib/auth/current-user.ts (FIX-7)

This file is critical — every protected API route calls it. Sprint 1 specifies
its exact implementation using `@clerk/nextjs/server`. Replace entirely:

Create/replace `lib/auth/current-user.ts`:

```typescript
// FIX-7: replaces the Clerk-based implementation from Sprint 1 §9 AA1 fix.
// The users table column clerkUserId now stores the Better Auth user ID.
// All API routes continue to call getCurrentUser() + setRlsContext() unchanged.
import { auth } from '@/lib/auth/server';
import { db } from '@/db/client';
import { users, organizations } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import type { User, Organization } from '@/db/schema';

export type CurrentUser = User & {
  organization: Organization;
};

/**
 * Resolves the authenticated Better Auth user to a DB user row + their organization.
 * Returns null if the DB rows don't yet exist (race condition after signup).
 * Call this at the top of every protected API route.
 * After calling, pass currentUser.organizationId to setRlsContext().
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user?.id) return null;

  // Note: no setRlsContext() here — getCurrentUser() runs BEFORE we know the orgId.
  // On local PostgreSQL the connection user is `postgres` (superuser), which bypasses
  // RLS automatically. In production (Supabase with service_role key) the same applies.
  // The API routes call setRlsContext() AFTER getCurrentUser() returns, using the orgId.
  const [userRow] = await db
    .select()
    .from(users)
    .innerJoin(organizations, eq(users.organizationId, organizations.id))
    .where(eq(users.clerkUserId, session.user.id));

  if (!userRow) return null;
  return { ...userRow.users, organization: userRow.organizations };
}
```

Also create `app/api/auth/sync-user/route.ts` — called after sign-up to ensure
the users table row has the correct email/name from the session:

```typescript
import { auth } from '@/lib/auth/server';
import { db } from '@/db/client';
import { users, organizations } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST() {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user) return NextResponse.json({ error: 'No session' }, { status: 401 });

  const orgId = session.session?.activeOrganizationId;
  if (!orgId) return NextResponse.json({ error: 'No active org' }, { status: 400 });

  // Find the VisibleAU org row (postgres superuser bypasses RLS — FIX-AB)
  // orgId here is Better Auth auth_org TEXT id; we find the VisibleAU UUID via clerkOrgId
  const [org] = await db.select().from(organizations)
    .where(eq(organizations.clerkOrgId, orgId));
  if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 });

  // FIX-AL: set RLS context using org.id (UUID) — the value RLS policies actually check
  // (orgId = Better Auth text id; org.id = VisibleAU organizations.id UUID — these differ)
  await db.execute(
    sql`SELECT set_config('app.current_org_id', ${org.id}, true)`
  );

  // Upsert: update email + name if row already exists from the afterCreate hook
  await db.insert(users).values({
    clerkUserId:    session.user.id,
    organizationId: org.id,
    email:          session.user.email,
    name:           session.user.name ?? '',
    role:           'owner',
  }).onConflictDoUpdate({
    target: users.clerkUserId,
    set: {
      email: session.user.email,
      name:  session.user.name ?? '',
    },
  });

  return NextResponse.json({ ok: true });
}
```

-----

## STEP 4c — ADD DASHBOARD RACE CONDITION GUARD (FIX-H)

Sprint 1 AA3 fix: after signup, the user is redirected to `/dashboard` before
the `users` table row is fully written (sign-up → organization.create → sync-user
all happen sequentially, but there’s a window). `getCurrentUser()` can return null.

Update `app/(auth)/dashboard/page.tsx` to guard this:

```typescript
// app/(auth)/dashboard/page.tsx — Sprint 1 stub with race-condition guard
import { getCurrentUser } from '@/lib/auth/current-user';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  // Race condition: users row not yet written — redirect back to sign-in
  if (!user) redirect('/sign-in');
  // Sprint 4 fills in real dashboard content here.
  return <div className="p-8"><h1>Welcome to VisibleAU</h1></div>;
}
```

## STEP 4d — UPDATE tests/setup.ts TO CLEAN AUTH TABLES (FIX-X)

Sprint 1 §9 specifies `tests/setup.ts` truncates `brands → users → organizations`
between tests. After adding Better Auth, the `auth_*` tables also accumulate.
Update `tests/setup.ts` to also clean Better Auth tables:

```typescript
import { afterAll, beforeEach } from 'vitest';
import { db } from '@/db/client';
import { brands, users, organizations } from '@/db/schema';
import {
  authSessions, authAccounts, authVerifications,
  authMembers, authInvitations, authOrganizations, authUsers,
} from '@/db/schema/auth';

// Wipe test data between test files — FK-safe order
beforeEach(async () => {
  // Better Auth tables (delete sessions/accounts/members before users/orgs)
  await db.delete(authSessions);
  await db.delete(authAccounts);
  await db.delete(authVerifications);
  await db.delete(authInvitations);
  await db.delete(authMembers);
  // App tables (delete brands/users before organizations)
  await db.delete(brands);
  await db.delete(users);
  // Auth orgs and app orgs
  await db.delete(authOrganizations);
  await db.delete(organizations);
  // Auth users last (other tables reference them)
  await db.delete(authUsers);
});

afterAll(async () => {
  // postgres-js pool closes automatically in test env
});
```

-----

## STEP 5 — CREATE BETTER AUTH CLIENT

Create `lib/auth/client.ts`:

```typescript
import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  plugins: [organizationClient()],
});

// Named exports for direct use in components
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  useActiveOrganization,
  organization,
  useListOrganizations,
} = authClient;
```

-----

## STEP 6 — CREATE THE AUTH API ROUTE

Create `app/api/auth/[...all]/route.ts`:

```typescript
import { auth } from '@/lib/auth/server';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST } = toNextJsHandler(auth);
```

-----

## STEP 7 — REPLACE MIDDLEWARE (FIX-8: region detection restored)

Sprint 1 §1 deliverable: `✓ Region detection middleware (/au, /nz, /uk, /us, /ca, /eu)`
Sprint 1 definition of done: `"A user can sign up at /au/sign-up, land on /dashboard"`
Region detection must be preserved — `lib/region/detect.ts` is still called here.

Replace the existing `middleware.ts` with:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { detectRegion } from '@/lib/region/detect';

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/',
  '/sign-in',
  '/sign-up',
  '/api/auth',
  '/api/webhooks',
  '/api/health',
  '/methodology',
  '/pricing',
];

// Static asset prefixes — always allow
const PUBLIC_PREFIXES = [
  '/_next/',
  '/favicon',
  '/images/',
  '/fonts/',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow static assets
  if (PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Region detection — runs before auth check (Sprint 1 §1 deliverable)
  const region = detectRegion({
    pathname,
    geoCountry: request.geo?.country,
  });

  // Allow public routes
  if (PUBLIC_ROUTES.some(route =>
    pathname === route || pathname.startsWith(route + '/')
  )) {
    const response = NextResponse.next();
    response.headers.set('x-visibleau-region', region);
    return response;
  }

  // Check session cookie
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    const signInUrl = new URL('/sign-in', request.url);
    signInUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(signInUrl);
  }

  const response = NextResponse.next();
  response.headers.set('x-visibleau-region', region);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

-----

## STEP 8 — UPDATE db/client.ts RLS HELPER (FIX-9)

Do NOT create `lib/db/rls.ts`. All 12 sprint prompts import `setRlsContext`
from `@/db/client` — that import path must stay unchanged.

Update `db/client.ts` in-place — `setRlsContext` stays here, all sprint imports unchanged.
`getCurrentOrgId` is NOT added here (circular dependency — see FIX-W):

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { sql } from 'drizzle-orm';

const client = postgres(process.env.DATABASE_URL!, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });

// RLS session setup: call this in every API route after authenticating the user.
// Sets the app.current_org_id Postgres variable so RLS policies can read it.
// All sprint prompts import this from '@/db/client' — import path unchanged.
export async function setRlsContext(
  db: ReturnType<typeof drizzle>,
  orgId: string
): Promise<void> {
  await db.execute(
    sql`SELECT set_config('app.current_org_id', ${orgId}, true)`
  );
}

// Note: getCurrentOrgId() is intentionally NOT in this file to avoid
// a circular dependency (server.ts imports db/client, so db/client
// cannot import server.ts). Use getCurrentUser() from lib/auth/current-user.ts
// to get both user and org context in API routes.
```

-----

## STEP 9 — CREATE SIGN-IN PAGE (FIX-10: correct folder path)

Sprint 1 §4 canonical path: `app/sign-in/[[...sign-in]]/page.tsx` (at app root, NOT inside (auth)/)
Sign-in must be public — placing it inside (auth)/ wraps it in the protected sidebar layout.

Create `app/sign-in/[[...sign-in]]/page.tsx`:

```typescript
'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from '@/lib/auth/client';

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn.email({ email, password, callbackURL: redirectTo });

    if (result.error) {
      setError(result.error.message ?? 'Sign in failed');
      setLoading(false);
    } else {
      router.push(redirectTo);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md p-8 space-y-6">
        <h1 className="text-2xl font-bold">Sign in to VisibleAU</h1>
        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              required className="w-full px-3 py-2 border rounded-md"
              placeholder="you@agency.com.au" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              required className="w-full px-3 py-2 border rounded-md" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2 px-4 bg-teal-700 text-white rounded-md hover:bg-teal-800 disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p className="text-sm text-center">
          No account?{' '}
          <a href="/sign-up" className="text-teal-700 hover:underline">Create one</a>
        </p>
      </div>
    </div>
  );
}
```

-----

## STEP 10 — CREATE SIGN-UP PAGE (FIX-11: correct folder path)

Sprint 1 §4 canonical path: `app/sign-up/[[...sign-up]]/page.tsx` (at app root, NOT inside (auth)/)

Create `app/sign-up/[[...sign-up]]/page.tsx`:

```typescript
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signUp, organization } from '@/lib/auth/client';

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    // 1. Create the user account
    const result = await signUp.email({ name, email, password, callbackURL: '/dashboard' });
    if (result.error) {
      setError(result.error.message ?? 'Sign up failed');
      setLoading(false);
      return;
    }

    // 2. Create the agency organisation (required — users must belong to an org)
    const orgResult = await organization.create({
      name: agencyName,
      slug: agencyName.toLowerCase().replace(/\s+/g, '-'),
    });
    if (orgResult.error) {
      setError(orgResult.error.message ?? 'Failed to create agency');
      setLoading(false);
      return;
    }

    // 3. Sync user details into the VisibleAU users table
    const syncRes = await fetch('/api/auth/sync-user', { method: 'POST' });
    if (!syncRes.ok) {
      console.warn('[sign-up] sync-user returned', syncRes.status, '— dashboard will retry');
    }

    router.push('/dashboard');
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md p-8 space-y-6">
        <h1 className="text-2xl font-bold">Create your VisibleAU account</h1>
        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Your name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              required className="w-full px-3 py-2 border rounded-md" placeholder="Ellie Bakker" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Agency name</label>
            <input type="text" value={agencyName} onChange={e => setAgencyName(e.target.value)}
              required className="w-full px-3 py-2 border rounded-md" placeholder="Splice Marketing" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              required className="w-full px-3 py-2 border rounded-md"
              placeholder="you@agency.com.au" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              required minLength={8} className="w-full px-3 py-2 border rounded-md"
              placeholder="Min 8 characters" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2 px-4 bg-teal-700 text-white rounded-md hover:bg-teal-800 disabled:opacity-50">
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p className="text-sm text-center">
          Already have an account?{' '}
          <a href="/sign-in" className="text-teal-700 hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  );
}
```

-----

## STEP 11 — UPDATE ALL CLERK REFERENCES (FIX-12, FIX-13)

### A. Delete the Clerk webhook route (if not already deleted in Step 1)

```bash
rm -f app/api/webhooks/clerk/route.ts
```

The Clerk webhook synced org/user creation to Postgres via HTTP events.
Better Auth replaces this with the `organizationCreation.afterCreate` hook
(Step 4) and the `sync-user` API route (Step 4b). No webhook needed.

### B. Replace app/(auth)/layout.tsx (FIX-12)

Sprint 1 §9 AA4 fix specifies this layout uses `<ClerkLoading>` and `<SignedIn>` —
both from `@clerk/nextjs`. Replace the entire file:

```typescript
// app/(auth)/layout.tsx — Better Auth replacement for Clerk layout
// Sprint 1 AA4 fix: this is the shell wrapping every authenticated page.
import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/domain/app-sidebar';
import { AppTopbar } from '@/components/domain/app-topbar';

export default async function AuthLayout({
  children,
}: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: headers() });

  // If no session, redirect to sign-in (replaces Clerk's <SignedIn> guard)
  if (!session) redirect('/sign-in');

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AppTopbar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
```

### C. Replace lib/email/client.ts (FIX-F: resend removed)

Sprint 2 P6 fix specifies `lib/email/client.ts` imports from ‘resend’.
After removing resend in Step 1, Sprint 2 build fails without a replacement.
Create/replace `lib/email/client.ts`:

```typescript
// lib/email/client.ts — replaces Resend with Nodemailer for local dev
// Sprint 2 imports: `import { resend } from '@/lib/email/client'`
// Keep the export name `resend` so Sprint 2 imports work unchanged,
// but swap the implementation to Nodemailer.
import nodemailer from 'nodemailer';

const transport = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'localhost',
  port:   parseInt(process.env.SMTP_PORT || '1025'),
  secure: false,
  ignoreTLS: true,
});

// Named `resend` to match Sprint 2 import: `import { resend } from '@/lib/email/client'`
export const resend = {
  emails: {
    send: async (params: {
      from: string;
      to: string;
      subject: string;
      html?: string;
      text?: string;
    }) => {
      console.log(`\n[EMAIL] To: ${params.to} | Subject: ${params.subject}`);
      try {
        await transport.sendMail({
          from:    params.from,
          to:      params.to,
          subject: params.subject,
          html:    params.html,
          text:    params.text,
        });
      } catch {
        // Local dev: log but don't crash if SMTP not running
        console.log('[EMAIL] SMTP not available — email logged only');
      }
      return { id: `local-${Date.now()}` };
    },
  },
};
```

### D. Replace tests/integration/helpers/clerk-mock.ts (FIX-N)

Sprint 1 §10 specifies `tests/integration/helpers/clerk-mock.ts` with
`mockClerkAuth()` using `vi.mock('@clerk/nextjs/server', ...)`.
Replace with a Better Auth version — **keep the same function names** so all
integration test files continue to call `mockClerkAuth()` without changes:

```typescript
// tests/integration/helpers/clerk-mock.ts — Better Auth replacement
// Keeps the same export names so existing test imports work unchanged
import { vi } from 'vitest';

export function mockClerkAuth(
  overrides: Partial<{ userId: string; orgId: string; orgRole: string }> = {}
) {
  vi.mock('@/lib/auth/server', () => ({
    auth: {
      api: {
        getSession: vi.fn().mockResolvedValue({
          user:    { id: overrides.userId ?? 'test-user-id', email: 'test@test.com', name: 'Test' },
          session: { activeOrganizationId: overrides.orgId ?? 'test-org-id' },
        }),
      },
    },
  }));
  vi.mock('@/lib/auth/current-user', () => ({
    getCurrentUser: vi.fn().mockResolvedValue({
      id:             'test-user-uuid',
      clerkUserId:    overrides.userId ?? 'test-user-id',
      organizationId: 'test-org-uuid',
      email:          'test@test.com',
      name:           'Test User',
      role:           'owner',
      organization: {
        id:         'test-org-uuid',
        clerkOrgId: overrides.orgId ?? 'test-org-id',
        name:       'Test Agency',
        tier:       'starter',
        region:     'au',
      },
    }),
  }));
}

// For cross-org tests (Sprint 1 §10 cross-org.test.ts)
export function mockClerkAuthDifferentOrg() {
  return mockClerkAuth({ orgId: 'different-org-id' });
}
```

### E. Find and replace remaining @clerk imports

```bash
# Find all remaining Clerk references (include tests/ — clerk-mock.ts lives there)
grep -rn "@clerk" app/ lib/ components/ tests/ --include="*.ts" --include="*.tsx"
```

For each file found, apply these replacements:

```typescript
// ── SERVER SIDE ──────────────────────────────────────────────────────

// BEFORE:
import { auth, currentUser } from '@clerk/nextjs/server';
const { userId, orgId } = auth();

// AFTER:
import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
const session = await auth.api.getSession({ headers: headers() });
const userId = session?.user?.id;
const orgId  = session?.session?.activeOrganizationId;

// ── CLIENT SIDE ──────────────────────────────────────────────────────

// BEFORE:
import { useUser, useOrganization } from '@clerk/nextjs';
const { user } = useUser();
const { organization } = useOrganization();

// AFTER:
import { useSession, useActiveOrganization } from '@/lib/auth/client';
const { data: session } = useSession();
const user = session?.user;
const { data: organization } = useActiveOrganization();

// ── USER BUTTON / ORG SWITCHER (UI components) ───────────────────────

// BEFORE:
import { UserButton, OrganizationSwitcher } from '@clerk/nextjs';
<UserButton />
<OrganizationSwitcher />

// AFTER (Sprint 1 — simple sign-out button sufficient):
import { signOut } from '@/lib/auth/client';
<button onClick={() => signOut()}>Sign out</button>
```

### F. Replace Playwright E2E fixtures and add auth helper

Sprint 1 creates two files using `@clerk/testing/playwright`. Replace both.

**Replace `tests/e2e/fixtures.ts`** (was using `clerk.signIn()` — now uses plain Playwright):

```typescript
import { test as base, Page } from '@playwright/test';

// Shared fixture: signs in as test user 1 before each test
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    await page.goto('/sign-in');
    await page.fill('input[type="email"]', process.env.E2E_TEST_USER_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_USER_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
    await use(page);
  },
});
export { expect } from '@playwright/test';
```

**Create `tests/helpers/auth.ts`** (utility functions for E2E tests):

```typescript
import { Page } from '@playwright/test';

export async function signInAsTestUser(page: Page) {
  await page.goto('/sign-in');
  await page.fill('input[type="email"]', process.env.E2E_TEST_USER_EMAIL ?? 'sri@visibleau.local');
  await page.fill('input[type="password"]', process.env.E2E_TEST_USER_PASSWORD ?? 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard');
}

export async function signInAsTestUser2(page: Page) {
  await page.goto('/sign-in');
  await page.fill('input[type="email"]', process.env.E2E_TEST_USER_2_EMAIL ?? 'user2@visibleau.local');
  await page.fill('input[type="password"]', process.env.E2E_TEST_USER_2_PASSWORD ?? 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard');
}
```

-----

## STEP 12 — RUN MIGRATIONS (FIX-14: Windows-safe commands)

Apply the Better Auth tables to both databases.
`DATABASE_URL=...` prefix syntax is Unix-only — use cross-env on Windows:

```bash
cd C:\startup\VisibleAU

# Generate migration files from the updated schema
pnpm drizzle-kit generate

# Apply to dev database
pnpm drizzle-kit migrate

# Apply to test database (cross-env for Windows CMD/PowerShell compatibility)
cross-env DIRECT_URL=postgresql://postgres:password@localhost:5432/visibleau_test pnpm drizzle-kit migrate
```

**IMPORTANT — auth tables and drizzle-kit:**
Better Auth creates its own tables (`auth_users`, `auth_sessions` etc.) when the app
first boots via its drizzle adapter. Do NOT let `drizzle-kit generate` try to create
these same tables — you’ll get duplicate table errors.

Two options — pick one:

**Option A (recommended):** Let Better Auth create its auth tables on first boot,
and exclude them from drizzle-kit by keeping `db/schema/auth.ts` out of the config:

```typescript
// drizzle.config.ts — point ONLY to app schema files, not auth.ts
schema: ['./db/schema/organizations.ts', './db/schema/users.ts',
         './db/schema/brands.ts', './db/schema/enums.ts'],
out: './db/migrations',
dialect: 'postgresql',
dbCredentials: { url: process.env.DIRECT_URL! },
```

Then run `pnpm drizzle-kit generate && pnpm drizzle-kit migrate` for app tables only.
Better Auth will create its own tables on first `pnpm dev`.

**Option B:** If you want drizzle-kit to manage everything, check first that the
auth_ tables don’t already exist from a previous boot, then run generate+migrate.

Verify the new tables exist:

```bash
psql -U postgres -d visibleau -c "\dt auth_*"
```

Expected:

```
auth_users
auth_sessions
auth_accounts
auth_verifications
auth_organizations
auth_members
auth_invitations
```

-----

## STEP 13 — UPDATE CLAUDE.md TECH STACK SECTION

Find and replace in CLAUDE.md — all occurrences, not just three:

```
FIND:    - **Clerk** — Auth + multi-tenant org primitives.
REPLACE: - **Better Auth** — Self-hosted auth + multi-tenant org primitives.
           Runs fully locally, no external account or API keys required.

FIND:    - **Resend** — Transactional emails.
REPLACE: - **Nodemailer** — Transactional emails via local SMTP.
           Dev: logs to console. Production: configure real SMTP.

FIND:    Multi-tenant orgs via Clerk + Supabase RLS
REPLACE: Multi-tenant orgs via Better Auth + PostgreSQL RLS

FIND:    ├── webhooks/clerk/route.ts
REPLACE: (delete this line — Clerk webhook route is removed)

FIND:    any remaining "Clerk" in §4, §5, §6
REPLACE: "Better Auth"

FIND:    - `clerkOrgId TEXT UNIQUE` — sync from Clerk webhook
REPLACE: - `clerkOrgId TEXT UNIQUE` — stores Better Auth org ID (column name unchanged)

FIND:    - `clerkUserId TEXT UNIQUE`
REPLACE: - `clerkUserId TEXT UNIQUE` — stores Better Auth user ID (column name unchanged)"

Also update `.github/workflows/ci.yml` if it exists:
```

FIND (in the ci.yml env sections):
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.CLERK_PUBLISHABLE_KEY_TEST }}
CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY_TEST }}
REPLACE: (delete both lines — no Clerk keys needed)

FIND:
CLERK_PUBLISHABLE_KEY_TEST, CLERK_SECRET_KEY_TEST (in GitHub secrets list)
REPLACE: (remove — not needed; add BETTER_AUTH_SECRET instead)

FIND (in playwright env section):
CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY!
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!
REPLACE: (delete both lines — auth via HTML form now, no Clerk SDK needed)

```

```

-----

## STEP 14 — VERIFY THE APP STARTS

```bash
pnpm dev
```

Open <http://localhost:3000>

Expected:

- ✅ App starts with zero errors about missing API keys
- ✅ / (home) loads
- ✅ /au/sign-up resolves — region detection returns `x-visibleau-region: au`
- ✅ Sign-up creates user + org in local PostgreSQL + users table row synced
- ✅ Sign-in sets session cookie and redirects to /dashboard
- ✅ /dashboard is protected — redirects to /sign-in when not logged in
- ✅ User can create a brand → sees it in list (brand CRUD working, RLS scoped)
- ✅ Second org user CANNOT access first org’s brand (returns 404, not 401)
- ✅ Free-tier org with 1 brand: creating a second returns 403 “Brand limit reached”
- ✅ No calls to clerk.com, supabase.co, or any external auth service
- ✅ Console shows [AUTH EMAIL] logs instead of sending real emails
- ✅ `pnpm typecheck` passes
- ✅ `pnpm lint` passes (Biome)
- ✅ `pnpm test` passes (Vitest unit + integration)
- ✅ `pnpm test:e2e` passes (Playwright — uses tests/helpers/auth.ts)

-----

## STEP 15 — CREATE ONE TEST USER (SEED DATA) (FIX-15)

`auth.api.signUpEmail()` returns the user object, not a session token.
Must sign in first to get a real token before creating the org.

```typescript
// scripts/seed-auth-user.ts
import { auth } from '../lib/auth/server';

async function seedTestUser() {
  console.log('Creating test user...');

  // Step 1: create the user
  const signUpResult = await auth.api.signUpEmail({
    body: {
      name:     'Sri (Dev)',
      email:    'sri@visibleau.local',
      password: 'password123',
    },
  });
  if (signUpResult.error) {
    console.log('User may already exist, continuing...');
  } else {
    console.log('User created:', signUpResult.data?.user?.id);
  }

  // Step 2: sign in to get a real session token
  const signInResult = await auth.api.signInEmail({
    body: {
      email:    'sri@visibleau.local',
      password: 'password123',
    },
  });

  const token = signInResult.data?.token;
  if (!token) throw new Error('Sign-in failed — no token returned');
  console.log('Session token obtained');

  // Step 3: create org using the real session token
  const org = await auth.api.createOrganization({
    body: {
      name: 'VisibleAU Dev',
      slug: 'visibleau-dev',
    },
    headers: new Headers({
      Cookie: `better-auth.session-token=${token}`,
    }),
  });
  console.log('Org created:', org.data?.id);
}

async function seedTestUser2() {
  // Second user in a DIFFERENT org — needed for cross-org E2E tests
  await auth.api.signUpEmail({
    body: { name: 'Test User 2', email: 'user2@visibleau.local', password: 'password123' },
  });
  const session2 = await auth.api.signInEmail({
    body: { email: 'user2@visibleau.local', password: 'password123' },
  });
  const token2 = session2.data?.token;
  if (!token2) { console.log('User 2 sign-in failed — may already exist'); return; }
  await auth.api.createOrganization({
    body: { name: 'Test Agency 2', slug: 'test-agency-2' },
    headers: new Headers({ Cookie: `better-auth.session-token=${token2}` }),
  });
  console.log('User 2 + org 2 created');
}

seedTestUser()
  .then(() => seedTestUser2())
  .catch(console.error);
```

Run it:

```bash
pnpm tsx scripts/seed-auth-user.ts
```

Then log in at <http://localhost:3000/sign-in> with:

- User 1 (primary): `sri@visibleau.local` / `password123`
- User 2 (cross-org E2E): `user2@visibleau.local` / `password123`

-----

## CLEAN STATE — DONE WHEN ALL OF THESE PASS

- ✅ `pnpm dev` starts with zero errors
- ✅ No `@clerk` imports anywhere in the codebase
- ✅ `/au/sign-up` resolves (region detection working)
- ✅ Sign-up creates user + org + users table row in local PostgreSQL
- ✅ Sign-in sets a session cookie and redirects to /dashboard
- ✅ Protected routes redirect to /sign-in when not logged in
- ✅ `getCurrentUser()` returns the correct user+org for authenticated requests
- ✅ `setRlsContext` still imported from `@/db/client` — not from a new file
- ✅ `pnpm typecheck` passes
- ✅ `pnpm lint` passes
- ✅ `pnpm test` passes (Vitest unit + integration)
- ✅ `pnpm test:e2e` passes (Playwright)
- ✅ No external service calls except AI API keys

-----

## UPDATING MOCKS IN TESTS

Find all test files mocking Clerk and replace:

```typescript
// BEFORE (Clerk mock — uses vi.mock because project uses Vitest, not Jest)
vi.mock('@clerk/nextjs/server', () => ({
  auth: () => ({ userId: 'user_123', orgId: 'org_123' }),
  currentUser: () => ({ id: 'user_123' }),
}));

// AFTER (Better Auth mock)
vi.mock('@/lib/auth/server', () => ({
  auth: {
    api: {
      getSession: () => Promise.resolve({
        user:    { id: 'test-user-id', email: 'test@test.com', name: 'Test User' },
        session: { activeOrganizationId: 'test-org-id' },
      }),
    },
  },
}));

vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({
    data: {
      user:    { id: 'test-user-id', email: 'test@test.com' },
      session: { activeOrganizationId: 'test-org-id' },
    },
  }),
  useActiveOrganization: () => ({
    data: { id: 'test-org-id', name: 'Test Agency' },
  }),
  signOut: vi.fn(),
}));

// For getCurrentUser() — mock the helper itself:
vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUser: () => Promise.resolve({
    id:             'test-user-uuid',
    clerkUserId:    'test-user-id',
    organizationId: 'test-org-uuid',
    email:          'test@test.com',
    name:           'Test User',
    role:           'owner',
    organization: {
      id:         'test-org-uuid',
      clerkOrgId: 'test-org-id',
      name:       'Test Agency',
      tier:       'starter',
      region:     'au',
    },
  }),
}));
```