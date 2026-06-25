# VisibleAU — Better Auth Setup Conflict Audit
# Document audited: visibleau-better-auth-setup.md (919 lines, 15 steps)
# Cross-checked against: Sprint 1-12 prompts, CLAUDE.md v1.5, Foundations v1.12
# Method: read every file fresh, line by line, 17 independent checks
# Date: June 2026

---

## SEVERITY SCALE
🔴 FATAL     — will crash at runtime with no error recovery
🟠 BREAKING  — build failure or 100% wrong behaviour at first run
🟡 MISSING   — required piece completely absent from the document
🟢 LOW       — minor inconsistency, no immediate runtime impact

Total: 5 FATAL · 4 BREAKING · 3 MISSING · 3 LOW = 15 conflicts

---

## 🔴 FATAL — will crash, cannot recover without a fix

---

### FATAL-1  Duplicate `emailAndPassword` key in server.ts (Step 4)

Lines 235 and 273 of the setup document both declare `emailAndPassword`
inside the same `betterAuth({...})` object:

```typescript
// Line 235 — first declaration
emailAndPassword: {
  enabled: true,
  requireEmailVerification: false,
  minPasswordLength: 8,        // ← this property
},

// Line 273 — second declaration OVERWRITES the first
emailAndPassword: {
  enabled: true,
  requireEmailVerification: false,
  sendResetPassword: async ...  // ← this survives
},
```

JavaScript silently drops the first key. TypeScript does NOT warn.
Result: `minPasswordLength: 8` is lost. `sendResetPassword` works.
Password of any length is accepted. No error is ever thrown.

**Fix — merge both into one block:**
```typescript
emailAndPassword: {
  enabled: true,
  requireEmailVerification: false,
  minPasswordLength: 8,
  sendResetPassword: async ({ user, url }) => {
    console.log(`\n[AUTH EMAIL] Password reset for ${user.email}`);
    console.log(`[AUTH EMAIL] Click: ${url}\n`);
  },
},
```

---

### FATAL-2  `authOrgId` column does not exist — org insert crashes (Step 4)

The `organizationCreation.afterCreate` hook inserts:
```typescript
await db.insert(organizations).values({
  id:        crypto.randomUUID(),
  authOrgId: organization.id,    // ← THIS COLUMN DOES NOT EXIST
  name:      organization.name,
  tier:      'free',
  region:    'au',
}).onConflictDoNothing();
```

Sprint 1 §5 organizations schema (canonical, already migrated to Postgres):
```typescript
export const organizations = pgTable('organizations', {
  id:        uuid('id').primaryKey().defaultRandom(),
  clerkOrgId: text('clerk_org_id').unique().notNull(),  // ← THE REAL COLUMN
  name:      text('name').notNull(),
  region:    regionEnum('region').notNull().default('au'),
  tier:      tierEnum('tier').notNull().default('free'),
  ...
```

The Postgres column is `clerk_org_id`. There is no `auth_org_id`.
`onConflictDoNothing()` handles unique-constraint violations only —
it does not catch column-not-found errors. Drizzle throws immediately.

**Two bugs in one insert:**
1. Wrong field name: `authOrgId` → must be `clerkOrgId`
2. Missing import: `organizations` is used but never imported in `lib/auth/server.ts`

**Fix:**
```typescript
// Add at top of lib/auth/server.ts:
import { organizations } from '@/db/schema/organizations';

// Fix the insert:
await db.insert(organizations).values({
  id:         crypto.randomUUID(),
  clerkOrgId: organization.id,   // ← correct column name
  name:       organization.name,
  tier:       'free',
  region:     'au',
}).onConflictDoNothing();
```

---

### FATAL-3  `getCurrentUser()` is never updated — always returns null (Steps 4, 11)

Sprint 1 §9 step 3 specifies `lib/auth/current-user.ts`:
```typescript
import { auth } from '@clerk/nextjs/server';

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const { userId } = await auth();              // ← Clerk auth call
  if (!userId) return null;

  const [userRow] = await db
    .select().from(users).innerJoin(...)
    .where(eq(users.clerkUserId, userId));       // ← looks up by clerkUserId

  if (!userRow) return null;
  return { ...userRow.users, organization: userRow.organizations };
}
```

The Better Auth setup document **never mentions `lib/auth/current-user.ts`**.
Step 11 searches for `@clerk` imports and replaces them — but `current-user.ts`
imports from `@clerk/nextjs/server`, so it IS found. The document provides
a snippet for replacing `auth()` calls:

```typescript
// AFTER:
const session = await auth.api.getSession({ headers: headers() });
const userId = session?.user?.id;
```

But this snippet is in a generic "replace @clerk calls" section.
It does NOT tell Claude Code to update `getCurrentUser()` specifically.
It does NOT tell Claude Code to look up `users.clerkUserId` using `session.user.id`.
It does NOT tell Claude Code that when a user signs up via Better Auth,
no row is written to the VisibleAU `users` table — meaning
`getCurrentUser()` will always return null because the `users` table is empty.

**Cascade:** every protected API route calls `getCurrentUser()` → gets null →
returns 401. Brand CRUD, audit creation, dashboard — all return 401.
The app appears completely broken for all authenticated users.

**Fix — the complete updated `lib/auth/current-user.ts`:**
```typescript
import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
import { db } from '@/db/client';
import { users, organizations } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { User, Organization } from '@/db/schema';

export type CurrentUser = User & { organization: Organization };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user?.id) return null;

  // clerkUserId column now stores the Better Auth user ID
  const [userRow] = await db
    .select().from(users)
    .innerJoin(organizations, eq(users.organizationId, organizations.id))
    .where(eq(users.clerkUserId, session.user.id));

  if (!userRow) return null;
  return { ...userRow.users, organization: userRow.organizations };
}
```

**And the missing users table sync — add to sign-up flow (Step 10):**
After `signUp.email(...)` succeeds and `organization.create(...)` succeeds,
call a server action that inserts into `users`:
```typescript
// After org creation in the sign-up handler:
await fetch('/api/auth/sync-user', { method: 'POST' });

// app/api/auth/sync-user/route.ts:
export async function POST() {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session) return Response.json({ error: 'No session' }, { status: 401 });

  const orgId = session.session.activeOrganizationId;
  if (!orgId) return Response.json({ error: 'No org' }, { status: 400 });

  // Find the VisibleAU org row using clerkOrgId = Better Auth org ID
  const [org] = await db.select().from(organizations)
    .where(eq(organizations.clerkOrgId, orgId));
  if (!org) return Response.json({ error: 'Org not found' }, { status: 404 });

  await db.insert(users).values({
    clerkUserId:    session.user.id,    // Better Auth user ID → clerkUserId column
    organizationId: org.id,
    email:          session.user.email,
    name:           session.user.name ?? '',
    role:           'owner',
  }).onConflictDoNothing();

  return Response.json({ ok: true });
}
```

---

### FATAL-4  `setRlsContext` moved to new file — breaks every sprint import (Step 8)

Sprint 1 canonical pattern (referenced in Sprints 1, 2, 3, 4, 5, 6, 7, 8, 11):
```typescript
import { setRlsContext, db } from '@/db/client';
await setRlsContext(db, currentUser.organizationId);
```

Step 8 creates `lib/db/rls.ts` with `withOrgContext` and `getCurrentOrgId`.
`setRlsContext` is not mentioned. `lib/db/rls.ts` is a new file at a new path.

When Claude Code follows the Better Auth setup and Sprint 2+ prompts together:
- Better Auth Step 8 says → use `withOrgContext` from `lib/db/rls.ts`
- Sprint 2-11 say → use `setRlsContext` from `@/db/client`

Two different functions, two different files, two different API contracts.
The `withOrgContext` wraps everything in a callback closure — a fundamentally
different calling pattern from `setRlsContext`. Code cannot mix them safely.

**Fix:** Do not create `lib/db/rls.ts`. Instead, update `db/client.ts` in-place:
```typescript
// db/client.ts — updated setRlsContext to use Better Auth session
import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';

// Keep the same function signature — all sprint imports continue to work unchanged
export async function setRlsContext(
  db: ReturnType<typeof drizzle>,
  orgId: string
): Promise<void> {
  await db.execute(
    sql`SELECT set_config('app.current_org_id', ${orgId}, true)`
  );
}

// Add new helper for getting org from session
export async function getCurrentOrgId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: headers() });
  return session?.session?.activeOrganizationId ?? null;
}
```
All 12 sprint prompts import `setRlsContext` from `@/db/client` — unchanged.

---

### FATAL-5  Seed script `user.data?.token` does not exist in Better Auth response (Step 15)

```typescript
const user = await auth.api.signUpEmail({ body: { ... } });

const org = await auth.api.createOrganization({
  body: { ... },
  headers: new Headers({
    Cookie: `better-auth.session-token=${user.data?.token}`, // ← token may be undefined
  }),
});
```

Better Auth's `auth.api.signUpEmail()` returns the created user object —
not a session token. The `token` field does not exist on the response.
`user.data?.token` is `undefined`. The Cookie header becomes
`better-auth.session-token=undefined`. The org creation call has no valid
session and throws an auth error.

**Fix — sign in explicitly after sign-up to get a valid session token:**
```typescript
async function seedTestUser() {
  // Step 1: create the user
  await auth.api.signUpEmail({
    body: {
      name:     'Sri (Dev)',
      email:    'sri@visibleau.local',
      password: 'password123',
    },
  });

  // Step 2: sign in to get a real session token
  const session = await auth.api.signInEmail({
    body: {
      email:    'sri@visibleau.local',
      password: 'password123',
    },
  });

  const token = session.data?.token;
  if (!token) throw new Error('Sign-in returned no token');

  // Step 3: create org using the real session token
  const org = await auth.api.createOrganization({
    body: { name: 'VisibleAU Dev', slug: 'visibleau-dev' },
    headers: new Headers({ Cookie: `better-auth.session-token=${token}` }),
  });
  console.log('Org created:', org);
}
```

---

## 🟠 BREAKING — wrong behaviour from first run

---

### BREAK-1  Sign-in/sign-up pages in wrong folder (Steps 9, 10)

Steps 9 and 10 say:
```
Replace app/(auth)/sign-in/[[...sign-in]]/page.tsx
Replace app/(auth)/sign-up/[[...sign-up]]/page.tsx
```

Sprint 1 §4 canonical project structure:
```
app/
├── sign-in/[[...sign-in]]/page.tsx   ← PUBLIC, at app root
├── sign-up/[[...sign-up]]/page.tsx   ← PUBLIC, at app root
```

`app/(auth)/` is the protected route group with the sidebar layout (AA4 fix).
Sign-in and sign-up must not be inside it — they need the public layout
(no sidebar). Placing them inside `(auth)/` wraps them in the protected layout.
The middleware (Step 7) lists `/sign-in` and `/sign-up` as public routes so
redirects work, but the rendered page will include the auth sidebar shell.

**Fix:** Change both steps to use the Sprint 1 canonical paths:
- `app/sign-in/[[...sign-in]]/page.tsx`
- `app/sign-up/[[...sign-up]]/page.tsx`

---

### BREAK-2  Region detection middleware is completely removed (Step 7)

Sprint 1 §1 deliverables: `✓ Region detection middleware (/au, /nz, /uk, /us, /ca, /eu)`
Sprint 1 §4: `middleware.ts — Clerk auth + region detection`
Sprint 1 §1 definition of done: `"A user can sign up at /au/sign-up, land on /dashboard"`

Sprint 1's middleware calls `detectRegion()` and sets `x-visibleau-region` header:
```typescript
const region = detectRegion({ pathname, geoCountry: req.geo?.country });
response.headers.set('x-visibleau-region', region);
```

Step 7's replacement middleware has NONE of this. Region detection is gone.
`lib/region/detect.ts` is never called. `isFreeTierEnabled(region)` always
gets the wrong region. The `/au/sign-up` definition-of-done URL never resolves.

**Fix:** Add region detection to the Step 7 middleware:
```typescript
import { detectRegion } from '@/lib/region/detect';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Region detection — must run before auth check
  const region = detectRegion({
    pathname,
    geoCountry: request.geo?.country,
  });

  // ... existing public route checks ...

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const signInUrl = new URL('/sign-in', request.url);
    signInUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(signInUrl);
  }

  const response = NextResponse.next();
  response.headers.set('x-visibleau-region', region);  // set for downstream
  return response;
}
```

---

### BREAK-3  Step 12 migration command fails on Windows CMD/PowerShell

Step 12:
```bash
cd C:\startup\VisibleAU

DATABASE_URL=postgresql://postgres:password@localhost:5432/visibleau_test \
pnpm drizzle-kit migrate
```

The `DATABASE_URL=...` prefix syntax is Unix/bash only.
On Windows CMD: not recognised — the variable is not set, command fails silently.
On Windows PowerShell: syntax error — `=` in that position is invalid.
Sri's machine is Windows (`C:\startup\VisibleAU` path).

**Fix:**
```bash
# Install cross-env once:
pnpm add -D cross-env

# Then for the test database migration:
cross-env DATABASE_URL=postgresql://postgres:password@localhost:5432/visibleau_test pnpm drizzle-kit migrate
```
Or just update `.env` temporarily, run migrate, restore. Add `cross-env` to the
Step 1 install block so it's available when Step 12 runs.

---

### BREAK-4  `app/(auth)/layout.tsx` still imports Clerk components (Step 11)

Step 11 searches for `@clerk` imports. But `app/(auth)/layout.tsx` (AA4 fix)
contains:
```typescript
import { SignedIn, ClerkLoading } from '@clerk/nextjs';
```

After removing `@clerk/nextjs` in Step 1, this import causes a build failure:
`Cannot find module '@clerk/nextjs'`.

Step 11's search (`grep -rn "@clerk" ... --include="*.tsx"`) WILL find this file.
But the document provides no replacement for `<ClerkLoading>` or `<SignedIn>`.
Claude Code will be stuck — it knows to remove the import but has no spec for
what to replace these components with.

**Fix:** Add to Step 11 an explicit layout replacement:
```typescript
// app/(auth)/layout.tsx — replace Clerk components with Better Auth
import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/domain/app-sidebar';
import { AppTopbar } from '@/components/domain/app-topbar';

export default async function AuthLayout({
  children,
}: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: headers() });
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

---

## 🟡 MISSING — required piece completely absent

---

### MISSING-1  `svix` package not removed in Step 1

Step 1 removes: `@clerk/nextjs @clerk/backend @clerk/themes`
Not removed: `svix`

Sprint 1 §2 installs `svix` alongside Clerk: `pnpm add @clerk/nextjs svix`
`svix` is used ONLY to verify Clerk webhook signatures in `app/api/webhooks/clerk/route.ts`.
With Clerk gone and the webhook route deleted, `svix` is dead code.
It won't break anything but is misleading if Claude Code finds it in `package.json`.

**Fix:** Add to Step 1: `pnpm remove svix`

---

### MISSING-2  `app/api/webhooks/clerk/route.ts` is never deleted or replaced

Sprint 1 creates `app/api/webhooks/clerk/route.ts` — the webhook that syncs
org creation / user creation / deletion events to Postgres.
With Better Auth there is no Clerk webhook. This route should be deleted.

Step 11 greps for `@clerk` imports — this file imports from `@clerk/nextjs/server`
so it IS found. But the document says only to replace the import with
`auth.api.getSession()`. That doesn't make sense for a webhook route —
the entire route is now irrelevant and should be removed, not updated.

The webhook's job (syncing `organizations` and `users` rows) is now handled
by the `organizationCreation.afterCreate` hook (Step 4) and the
`sync-user` API route from FATAL-3. But none of this is documented.

**Fix:** Add to Step 11:
```
Delete: app/api/webhooks/clerk/route.ts
The Clerk webhook is replaced by Better Auth's afterCreate hooks.
Organization sync: handled by Step 4 organizationCreation hook.
User sync: handled by the /api/auth/sync-user route (see FATAL-3 fix).
```

---

### MISSING-3  Playwright E2E auth strategy is never replaced

Sprint 1 §10 (W3 fix) specifies a specific Playwright auth strategy:
```typescript
import { clerk, clerkSetup } from '@clerk/testing/playwright';
// Uses clerk.signIn() to bypass Clerk UI — cannot drive it via browser
```

After removing Clerk, `@clerk/testing` is also removed.
The E2E tests (`tests/e2e/auth.spec.ts`, `tests/e2e/brands.spec.ts`) all
use this strategy. Without a replacement, every E2E test fails at setup.

Step 11 searches for `@clerk` but does not address the test strategy replacement.
The clean state checklist says `pnpm test` passes — but E2E tests cannot
pass without an auth strategy.

**Fix:** Add to Step 11:
```typescript
// tests/helpers/auth.ts — Better Auth Playwright helper
import { Page } from '@playwright/test';

export async function signInAsTestUser(page: Page) {
  await page.goto('/sign-in');
  await page.fill('input[type="email"]', 'sri@visibleau.local');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard');
}
```
Better Auth uses standard HTML forms — Playwright can drive them directly,
no special SDK needed. This is actually simpler than the Clerk approach.

---

## 🟢 LOW — minor, no immediate runtime crash

---

### LOW-1  Step 2 `.env.test` filename conflicts with Sprint 1

Step 2 says update `.env.test`.
Sprint 1 §3 specifies `.env.test.local` (not `.env.test`).
From the Sprint 1 Y1 fix comment: "must use DATABASE_URL to match db/client.ts".
The filename itself is not specified but Next.js loads `.env.test.local` for
test environments, not `.env.test`. Using the wrong filename means the
DATABASE_URL override is silently ignored during test runs.

**Fix:** Change Step 2 to: `Also update .env.test.local:` (not `.env.test`)

---

### LOW-2  `set_config` third parameter: `TRUE` (Step 8) vs `true` (Sprint 1 canonical)

Step 8: `sql\`SELECT set_config('app.current_org_id', ${orgId}, TRUE)\``
Sprint 1 canonical: `sql\`SELECT set_config('app.current_org_id', ${orgId}, true)\``

PostgreSQL is case-insensitive for boolean literals — both work identically.
But Sprint 1 uses lowercase `true` consistently across all 12 sprint prompts.
Using `TRUE` in the Better Auth setup creates a visual inconsistency that
confuses Claude Code when cross-referencing documents.

**Fix:** Change `TRUE` → `true` in Step 8 for consistency.

---

### LOW-3  Step 13 CLAUDE.md update is incomplete

Step 13 says to replace three lines in CLAUDE.md. But CLAUDE.md §6 also contains:
```
├── webhooks/clerk/route.ts
```
And CLAUDE.md §4 still has Clerk in multiple places beyond the three listed.

After completing Steps 1–12, Claude Code will update CLAUDE.md with only the
three replacements listed in Step 13. The rest of CLAUDE.md still says Clerk.
Any future sprint that reads CLAUDE.md will encounter confusing mixed references.

**Fix:** Add to Step 13: "Also search CLAUDE.md for all remaining 'Clerk'
references and update them to 'Better Auth'. Specifically: §6 folder structure
`webhooks/clerk/route.ts` → delete this line; §4 auth model references."

---

## PRIORITY ORDER — fix before giving to Claude Code

### Fix RIGHT NOW (before Step 4 runs):
1. **FATAL-1** — Merge duplicate `emailAndPassword` blocks (Step 4) · 3 min
2. **FATAL-2** — Fix `authOrgId` → `clerkOrgId` + add `organizations` import (Step 4) · 5 min
3. **FATAL-3** — Add `getCurrentUser()` replacement + `sync-user` API route (Steps 4, 10, 11) · 30 min
4. **FATAL-4** — Remove `lib/db/rls.ts` — keep `setRlsContext` in `db/client.ts` (Step 8) · 5 min
5. **BREAK-1** — Fix page paths: `app/(auth)/sign-in` → `app/sign-in` (Steps 9, 10) · 2 min
6. **BREAK-2** — Add region detection back to middleware (Step 7) · 10 min
7. **BREAK-4** — Add `app/(auth)/layout.tsx` Better Auth replacement (Step 11) · 10 min

### Fix before first `pnpm test` run:
8. **BREAK-3** — Add `cross-env` for Windows migration command (Step 12) · 2 min
9. **MISSING-1** — Add `pnpm remove svix` to Step 1 · 1 min
10. **MISSING-2** — Add deletion of `webhooks/clerk/route.ts` to Step 11 · 5 min
11. **MISSING-3** — Add Playwright auth helper for E2E tests · 10 min

### Fix before Sprint 15 seed run:
12. **FATAL-5** — Fix seed script session token (Step 15) · 10 min

### Fix anytime (no runtime impact):
13. **LOW-1** — `.env.test` → `.env.test.local` (Step 2) · 1 min
14. **LOW-2** — `TRUE` → `true` in Step 8 · 1 min
15. **LOW-3** — Complete the CLAUDE.md update in Step 13 · 5 min

---

## WHAT IS CORRECT AND DOES NOT NEED CHANGING

- ✅ Step 1 install commands (minus missing `pnpm remove svix`)
- ✅ Step 2 `.env.local` env var list (correct replacements)
- ✅ Step 3 Better Auth Drizzle schema tables (correct structure)
- ✅ Step 5 Better Auth client exports (correct)
- ✅ Step 6 auth API route handler (correct)
- ✅ Step 9 sign-in page component logic (correct — just wrong folder)
- ✅ Step 10 sign-up page component logic (correct — just wrong folder, missing region)
- ✅ Step 11 server-side and client-side hook replacement patterns (correct snippets)
- ✅ Step 12 `pnpm drizzle-kit generate` and `migrate` commands (correct, minus Windows issue)
- ✅ Step 14 verify checklist (correct expectations)
- ✅ Test mock patterns (correct Better Auth mock structure)
- ✅ 404-not-401 pattern maintained in Step 8 `requireOrgAccess`
- ✅ RLS `set_config` concept is correct (just needs to stay in `db/client.ts`)
