# VisibleAU — Local Stack Conflict Audit
# Compares: visibleau-better-auth-setup.md + visibleau-local-stack-guide.md
# Against:  All 12 sprint prompts + CLAUDE.md v1.5 + foundations v1.12
# Date: June 2026 | Auditor: Claude

---

## AUDIT SUMMARY

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 CRITICAL | 5 | Will break the build or cause silent bugs |
| 🟡 MEDIUM | 6 | Will cause confusion or require rework mid-sprint |
| 🟢 LOW | 4 | Documentation inconsistencies, low runtime impact |

---

## 🔴 CRITICAL CONFLICTS

---

### C1 — organizations table field name: `authOrgId` vs `clerkOrgId`

**Where:** `visibleau-better-auth-setup.md` Step 4 (server.ts, organizationCreation hook)
**Conflict with:** Sprint 1 §5, Foundations v1.12 §3, CLAUDE.md §5

**The problem:**
The Better Auth setup prompt inserts into the organizations table using `authOrgId`:
```typescript
await db.insert(organizations).values({
  authOrgId: organization.id,   // ← WRONG FIELD NAME
  ...
});
```

But Sprint 1 schema, Foundations v1.12, and CLAUDE.md all define the field as:
```typescript
clerkOrgId: text('clerk_org_id').unique().notNull()
```

**Impact:** Runtime crash on org creation. Drizzle throws `column "auth_org_id" does not exist`.
The tables were already migrated with `clerk_org_id` — the column name in Postgres is fixed.

**Fix:** In Better Auth setup Step 4, rename `authOrgId` → `authOrgId` field needs to be renamed
in the **organizations Drizzle schema** AND in the insert. Two options:

Option A (recommended — least schema churn): rename the column semantically in the schema
to be auth-agnostic: `authProviderId` or simply `externalOrgId`. Add a new Drizzle migration.

Option B: keep `clerkOrgId` as the column name (the Postgres column already exists as
`clerk_org_id`) and just use it — the name is just a historical label. The Better Auth
org ID goes into the same column. Add a comment: `// formerly clerkOrgId, now holds Better Auth org ID`

**Recommended resolution:** Option B — least disruption. Update the Better Auth Step 4 to:
```typescript
await db.insert(organizations).values({
  clerkOrgId: organization.id,  // Better Auth org ID stored in this column (renamed context only)
  name: organization.name,
  tier: 'free',
  region: 'au',
}).onConflictDoNothing();
```

---

### C2 — users table: `clerkUserId` column still expected by all API routes

**Where:** `visibleau-better-auth-setup.md` Steps 3, 7, 11
**Conflict with:** Sprint 1 §5 (users schema), Sprint 1 §6 (getCurrentUser), Sprint 2–9 (all API routes)

**The problem:**
The Better Auth setup creates `auth_users` as a **separate table** with its own `id TEXT PK`.
But the existing `users` table (already migrated to Postgres) has:
```typescript
clerkUserId: text('clerk_user_id').unique().notNull()
```
And `getCurrentUser()` in Sprint 1 does:
```typescript
const { userId } = await auth();  // was Clerk userId
.where(eq(users.clerkUserId, userId))  // looks up by clerkUserId
```

The Better Auth setup prompt replaces this with `session.user.id` — but that `id` is
Better Auth's own `auth_users.id`, not the `users.user_id`. There's now a join needed
between `auth_users` (Better Auth) and `users` (VisibleAU app) that is never specified.

**Impact:** `getCurrentUser()` returns null for every authenticated user.
Every protected API route returns 401. The entire app appears broken even after
successful sign-in.

**Fix:** The `visibleau-better-auth-setup.md` must specify the full bridge between
Better Auth's session and the VisibleAU `users` table. Two options:

Option A (recommended): Replace `clerkUserId` with `authUserId` in the `users` table
via a Drizzle migration. Update `getCurrentUser()` to look up `users` by
`users.authUserId = session.user.id`.

Option B: Treat Better Auth's `auth_users.id` as the new `clerkUserId`. On sign-up,
sync a row into the `users` table with `clerkUserId = authUser.id`. Same column,
different source. getCurrentUser then works without schema changes.

**Recommended resolution:** Add Step 3b to the Better Auth setup:
```sql
-- Migration: rename clerkUserId to authUserId for auth-agnostic naming
ALTER TABLE users RENAME COLUMN clerk_user_id TO auth_user_id;
-- Update the constraint name too
ALTER INDEX users_clerk_user_id_key RENAME TO users_auth_user_id_key;
```
And update the Drizzle schema + getCurrentUser accordingly.

---

### C3 — Sprint 9: Supabase Storage used for logo uploads — no local replacement specified

**Where:** Sprint 9 §1, §4, §8, §12 (14 references to Supabase Storage)
**Conflict with:** `visibleau-local-stack-guide.md` (claims to replace all Supabase deps)

**The problem:**
Sprint 9 hardcodes Supabase Storage for agency logo uploads:
```typescript
logoUrl: text('logo_url'),  // Supabase Storage URL
// Sprint 9 §1: Supabase Storage RLS policies for logo uploads — public-read on logos bucket
// Sprint 9 §8: /agency/branding UI for logo upload (Supabase Storage) + color pickers
```

The local stack guide says to replace Supabase hosting with local Postgres — but
Supabase Storage is a **file storage service**, not a database. It's a separate system.
No local replacement is specified for it.

**Impact:** Sprint 9 logo upload will fail completely without Supabase Storage or a replacement.

**Fix:** Add to the local stack guide — for Sprint 9, replace Supabase Storage with one of:
- **Local filesystem storage** (`/public/uploads/logos/`) — simplest, fine for dev
- **MinIO** (S3-compatible object storage, runs in Docker) — production-grade local option

Local filesystem option (add to local stack guide):
```typescript
// lib/storage/local.ts — replaces Supabase Storage for logo uploads
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function uploadLogo(
  orgId: string,
  file: Buffer,
  filename: string
): Promise<string> {
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'logos', orgId);
  await mkdir(uploadDir, { recursive: true });
  const filepath = path.join(uploadDir, filename);
  await writeFile(filepath, file);
  return `/uploads/logos/${orgId}/${filename}`;
}
```

---

### C4 — Sprint 2 RLS migration uses `supabase migration new` CLI command

**Where:** Sprint 2 §5
**Conflict with:** Local setup (no Supabase CLI installed, no Supabase project)

**The problem:**
Sprint 2 explicitly says:
```
Create a new Supabase migration (supabase migration new sprint2_rls):
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE citations ENABLE ROW LEVEL SECURITY;
```

And Sprint 5 says:
```
Add to the Sprint 5 Supabase migration SQL:
ALTER TABLE vertical_packs DISABLE ROW LEVEL SECURITY;
```

And Sprint 6:
```
Add to the Sprint 6 Supabase migration SQL (DH3 fix)
```

This is `supabase migration new` — a Supabase CLI command that creates migration files
in `supabase/migrations/`. Without Supabase CLI, this command doesn't exist.

**Impact:** Claude Code will try to run `supabase migration new` and fail.
RLS policies for audits, citations, vertical_packs, recommendations tables will not be applied.
The security backstop will silently be missing for all post-Sprint-1 tables.

**Fix:** Add a global instruction for Claude Code — whenever sprint prompts say
`supabase migration new <name>`, replace with a plain SQL file + `psql` execution:
```bash
# Instead of: supabase migration new sprint2_rls
# Do this:
psql -U postgres -d visibleau -f scripts/db/sprint2_rls.sql
psql -U postgres -d visibleau_test -f scripts/db/sprint2_rls.sql
```
Or add it to the Drizzle migration via `db.execute(sql`...`)` in a migration file.

---

### C5 — Sprint 12 references Supabase PITR backup and production Supabase project

**Where:** Sprint 12 §1, §8, §12
**Conflict with:** Local-only stack approach

**The problem:**
Sprint 12 hardcodes Supabase for production:
```
✓ Backup verification: Supabase Postgres point-in-time recovery tested
✓ Production deployment: Vercel production env vars, Supabase production project
SUPABASE_SERVICE_ROLE_KEY (production project)
NEXT_PUBLIC_SUPABASE_URL (production project URL)
```

**Impact:** Sprint 12 launch checklist cannot be completed as written without Supabase.

**Fix (honest):** This is a production concern, not a development concern.
For local development through Sprint 11, this doesn't block anything.
For production (Sprint 12), a decision is needed: either accept Supabase for hosting,
or choose a different managed Postgres provider (Railway, Neon, Render, fly.io).
Add a note to Sprint 12 prompt that PITR backup strategy must be revisited for the chosen host.

---

## 🟡 MEDIUM CONFLICTS

---

### M1 — `getCurrentUser()` in Better Auth setup references `organizations` import that doesn't exist

**Where:** `visibleau-better-auth-setup.md` Step 4 (server.ts organizationCreation hook)
**Problem:**
```typescript
import { organizations } from somewhere  // ← never imported in the Better Auth server.ts
await db.insert(organizations).values({...})
```
The `organizations` table is in `db/schema/organizations.ts` but Better Auth server.ts
as written never imports it. Claude Code will get a TypeScript compile error.

**Fix:** Add to Step 4 server.ts:
```typescript
import { organizations } from '@/db/schema/organizations';
```

---

### M2 — Better Auth setup Step 8 RLS helper uses `TRUE` but Sprint 1 uses `true`

**Where:** `visibleau-better-auth-setup.md` Step 8
**Problem:**
Better Auth setup:
```typescript
sql`SELECT set_config('app.current_org_id', ${orgId}, TRUE)`  // uppercase TRUE
```
Sprint 1 (canonical):
```typescript
sql`SELECT set_config('app.current_org_id', ${orgId}, true)`  // lowercase true
```
PostgreSQL is case-insensitive here so this is not a runtime error, but it creates
inconsistency that confuses Claude Code when it cross-references the two documents.
Sprint 1's lowercase `true` is the canonical form — it matches foundations v1.12.

**Fix:** Change `TRUE` to `true` in Step 8 of the Better Auth setup.

---

### M3 — Better Auth setup does not specify how `region` reaches the organizations table

**Where:** `visibleau-better-auth-setup.md` Step 4 (organizationCreation hook)
**Conflict with:** Sprint 1 §6 (Z1 fix — thirteenth-pass audit)

**The problem:**
Sprint 1 has a critical documented fix (Z1) explaining that `organizations.region NOT NULL`
requires region to flow from the signup form → Clerk `publicMetadata` → webhook.
This was a hard-won fix across multiple audit passes.

The Better Auth setup's org creation hook does this:
```typescript
await db.insert(organizations).values({
  authOrgId: organization.id,
  name: organization.name,
  tier: 'free',
  region: 'au',   // ← hardcoded 'au'
})
```

Hardcoding `'au'` means every org gets region `au` regardless of what the user selected.
The sign-up form's region selection (if it exists) is silently ignored.

**Fix:** The sign-up page (Step 10) must pass region to the organization creation call,
and Better Auth's org plugin must carry it through. Add a custom field or use `metadata`.
Alternatively, add a post-signup step that updates `organizations.region` based on
the user's selection. The fix depends on the sprint timeline — for Sprint 1 local dev
with hardcoded `'au'` it's acceptable; document it clearly as a known limitation.

---

### M4 — Better Auth setup replaces `mockClerkAuth` in tests but doesn't update the test file names

**Where:** `visibleau-better-auth-setup.md` Step 15 (updating mocks in tests)
**Conflict with:** Sprint 1 §10 tests, specifically:
```typescript
// Sprint 1 §10:
export function mockClerkAuth(overrides) {...}
// Used in: tests/integration/api/brands/list.test.ts etc.
```

The Better Auth setup says to find and replace `mockClerkAuth` with the new mock,
but doesn't specify which test files to update or what the new helper should be named.
Claude Code will search for `mockClerkAuth` and may miss it if it's defined in a
shared test utility file (e.g. `tests/helpers/auth.ts`).

**Fix:** Add explicit instruction: rename `mockClerkAuth` → `mockBetterAuth` in
`tests/helpers/auth.ts` (or wherever it's defined) and update all imports.

---

### M5 — Sprint 1 §4 folder structure has `webhooks/clerk/route.ts` — local stack never addresses this

**Where:** Sprint 1 §4 project structure
**Conflict with:** `visibleau-better-auth-setup.md`

**The problem:**
Sprint 1 creates `app/api/webhooks/clerk/route.ts` — the Clerk webhook handler that
syncs org creation, user creation, membership changes to the local `organizations` and
`users` tables. This is a significant piece of Sprint 1.

With Better Auth, there is no Clerk webhook. But the webhook's job (syncing org/user
data to Postgres) still needs to happen — Better Auth's `organizationCreation` hook
does some of it, but the full `users` table sync on sign-up is not addressed.

Specifically, when a user signs up via Better Auth, a row in `auth_users` is created —
but **no row is created in the `users` table** (the VisibleAU app table). This means
`getCurrentUser()` always returns null.

**Fix:** Add a Better Auth `afterSignUp` hook in server.ts:
```typescript
user: {
  afterSignUp: async ({ user, session }) => {
    // Sync to VisibleAU users table (replaces Clerk webhook organizationMembership.created)
    await db.insert(users).values({
      authUserId: user.id,  // or clerkUserId per C2 resolution
      organizationId: '...',  // needs org context — see M3
      email: user.email,
      name: user.name ?? '',
      role: 'owner',
    }).onConflictDoNothing();
  },
},
```

---

### M6 — Sprint 9 `magic-link auth` references Clerk's session API specifically

**Where:** Sprint 9 §8 known issues:
```
Magic-link auth UX: Clerk's session API needs special config for token-based sessions
```

**Impact:** If this Clerk-specific magic-link config is in the Sprint 9 code, it will
break with Better Auth (which handles magic links differently via `signIn.magicLink()`).

**Fix:** Note in the reading-order document that when Claude Code reaches Sprint 9,
it should implement magic-link using `authClient.signIn.magicLink()` instead of
Clerk's token-based session API.

---

## 🟢 LOW SEVERITY

---

### L1 — Version mismatch: Sprint 1 §0 says "Read CLAUDE.md v1.4" but current is v1.5

**Where:** Sprint 1 §0 "Read first" section
**Problem:** Sprint 1 prompt says `CLAUDE.md v1.4` but the actual file is v1.5.
**Impact:** Claude Code may flag this as a version mismatch and pause to ask.
**Fix:** Update Sprint 1 §0 to reference v1.5, or add a preamble note that v1.5 is current.

---

### L2 — Sprint 1 §0 says "Read Foundations v1.11" but current is v1.12

**Where:** Sprint 1 §0 "Read first" section
**Problem:** Foundations v1.12 is the current version with the T5/T6/T7 schema fixes.
Sending Claude Code to read v1.11 means it misses 4 critical schema corrections.
**Impact:** Claude Code may use the older, conflicting schema from v1.11 if it can find it.
**Fix:** Update Sprint 1 §0 reference to Foundations v1.12.

---

### L3 — `visibleau-claude-code-reading-order.md` still references Clerk

**Where:** `visibleau-claude-code-reading-order.md` (the reading order guide we created)
**Problem:** The reading order document references Clerk in the Sprint 1 and Sprint 10
sections without noting the Better Auth override. Claude Code reading this document
before starting sprints will see the old stack.
**Fix:** Add a bold banner at the top of the reading order document:
```
⚠️ STACK UPDATE: Clerk → Better Auth. Inngest → BullMQ.
See visibleau-better-auth-setup.md before starting Sprint 1.
Anywhere sprint prompts say "Clerk", read as "Better Auth".
```

---

### L4 — `visibleau-lucky-test-runner-prompt-v4.md` mocks reference `mockClerkAuth`

**Where:** `visibleau-lucky-test-runner-prompt-v4.md` Step "Updating mocks in tests"
**Problem:** The test runner prompt tells Claude Code to find `mockClerkAuth` but
doesn't say where the helper is defined or what file to update.
**Fix:** Add: "Search `tests/` and `__mocks__/` for `mockClerkAuth` — it's likely in
`tests/helpers/auth.ts`. Replace the entire function and update all imports."

---

## ACTION PRIORITY

### Do before Sprint 1 starts (tonight)

| # | Action | File to update | Time |
|---|--------|---------------|------|
| 1 | Fix C1 — rename `authOrgId` → `clerkOrgId` in org insert | `visibleau-better-auth-setup.md` Step 4 | 5 min |
| 2 | Fix C2 — add `afterSignUp` hook to sync `users` table | `visibleau-better-auth-setup.md` Step 4 | 15 min |
| 3 | Fix M1 — add `organizations` import to Better Auth server.ts | `visibleau-better-auth-setup.md` Step 4 | 2 min |
| 4 | Fix M5 — add user sync hook (same as C2) | `visibleau-better-auth-setup.md` Step 4 | (same as C2) |
| 5 | Fix L3 — add stack-update banner to reading order doc | `visibleau-claude-code-reading-order.md` | 5 min |

### Do before Sprint 2

| # | Action | File to update |
|---|--------|---------------|
| 6 | Fix C4 — add `supabase migration new` → `psql` override instruction | `visibleau-better-auth-setup.md` or sprint preamble |

### Do before Sprint 9

| # | Action | File to update |
|---|--------|---------------|
| 7 | Fix C3 — add local filesystem storage to replace Supabase Storage | `visibleau-local-stack-guide.md` |
| 8 | Fix M6 — note Better Auth magic-link override | Sprint 9 reading order notes |

### Do before Sprint 12

| # | Action |
|---|--------|
| 9 | Fix C5 — decide on production Postgres host (Supabase, Railway, Neon, or fly.io) |

---

## THE GOOD NEWS

The conflicts above are all fixable with targeted edits — none require
rewriting sprint prompts 2–12. The core architecture (Drizzle, RLS, 404-not-401,
multi-tenancy, scoring, vertical packs) is untouched and correct across all sprints.

The critical path is C2 (user table sync) — everything else is blocked or confused
until `getCurrentUser()` can successfully join Better Auth sessions to VisibleAU users.
Fix that first. Everything else is secondary.
