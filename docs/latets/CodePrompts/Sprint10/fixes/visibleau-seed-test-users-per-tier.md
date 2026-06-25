# VisibleAU — Seed 2 test users per tier (login-able), for testing
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
Goal: create **2 users per tier** (free, starter, growth, agency, agency_pro — and enterprise if it's
a real tier), each in its own org set to that tier, so the operator can log in as a known account on
any tier without manually flipping the DB. Dev only.

## ⚠️ CRITICAL — these must be LOGIN-ABLE, not just DB rows
The app uses **Better Auth** (Clerk retired). Users are NOT just rows in a `users` table — they have
auth records (hashed passwords / auth provider rows) PLUS app-level `organizations`/`users` linkage.
A plain `INSERT INTO users` will create accounts that CANNOT log in. You MUST create users through the
auth layer (or seed BOTH the Better Auth tables and the app tables consistently) so sign-in works.

## STEP 0 — Investigate how auth + seeding actually work (report, then build)
```bash
# How are users created/seeded today? Existing seed scripts:
grep -rnE "seed|createUser|signUp|ensureSampleOrg|better-auth|betterAuth" scripts package.json lib | head -30
ls scripts/ 2>/dev/null

# Better Auth setup — how are accounts + passwords created?
grep -rnE "betterAuth|better-auth|emailAndPassword|hashPassword|auth\.api|signUpEmail" lib app | head -20
find . -name "auth.ts" -not -path "*/node_modules/*" | head

# The DB schema linking users <-> orgs <-> tier:
grep -rnE "organizations|users|tier|organizationId|role" db/schema/*.ts | grep -iE "tier|organizationId|pgTable|role" | head -30

# Better Auth's own tables (user/account/session) — where/how defined:
grep -rnE "account|session|verification|user" db/schema/*.ts | grep -iE "pgTable" | head

# Is there an existing programmatic "create a user" path we can reuse (e.g. a server action or the
# Better Auth server API)?
grep -rnE "auth\.api\.signUpEmail|signUpEmail|createOrganization|organization.*create" lib app | head
```
Report: how users are created in this codebase (Better Auth server API? a seed script? a signup
server action?), the exact tables involved (Better Auth user/account/session + app
organizations/users), how a user is linked to an org, and where `tier` lives. THEN choose the method
below that fits.

## STEP 1 — Create the seed (use the method STEP 0 reveals)
Preferred approach, in order of correctness:
1. **If Better Auth exposes a server API** (e.g. `auth.api.signUpEmail({ email, password, name })`):
   write a seed script (`scripts/seed-test-users.ts` or similar) that, for each tier, calls the
   real signup path to create the auth user, then creates/links an org and sets its `tier`. This
   guarantees login works because it uses the same path real signups use.
2. **If there's an existing seed/signup helper** in the repo, reuse it.
3. **Only if neither exists**, replicate Better Auth's user+account creation faithfully (correct
   password hashing per Better Auth's config) + org creation + linkage. Do this carefully — wrong
   hashing = can't log in.

For EACH tier in the tier enum (confirm the exact list from the schema — likely: free, starter,
growth, agency, agency_pro; enterprise only if it's a real seedable tier), create **2 users**:
- Emails following a clear pattern, e.g. `free1@test.visibleau.dev`, `free2@test.visibleau.dev`,
  `starter1@test.visibleau.dev`, … `agencypro2@test.visibleau.dev`.
- A SHARED, known dev password for all of them (e.g. `TestPass123!`) — so the operator can log in
  easily. (Dev only; document it in the output.)
- Each user in its OWN organization, with that org's `tier` set to the matching tier.
- Org names like `Test Org Free 1`, `Test Org Growth 2`, etc.
- Set any required NOT NULL fields correctly (e.g. `region='au'`, `onboardingComplete=true` so they
  skip onboarding, slug if required, role='owner' or 'admin' as the schema needs).

Make the seed **idempotent** — running it twice should not crash or create duplicates (check by email
first; skip if exists). And make it DEV-ONLY (guard against running in production, e.g. check
NODE_ENV or refuse if DATABASE_URL looks like prod).

## STEP 2 — Wire it up + run it
- Add an npm script if the repo uses them, e.g. `"seed:test-users": "tsx scripts/seed-test-users.ts"`.
- Run it once. Report success/failure per user.

## STEP 3 — Verify the users are real AND login-able
```sql
-- App side: orgs + tiers
SELECT o.name, o.tier, u.email
FROM organizations o JOIN users u ON u.organization_id = o.id
WHERE u.email LIKE '%@test.visibleau.dev'
ORDER BY o.tier, u.email;
-- expect 2 rows per tier
```
Also confirm the Better Auth side has the matching auth records (user/account rows) for these emails
— query the actual Better Auth tables (names from STEP 0). If the auth rows are missing, the users
CANNOT log in → the seed used the wrong method; fix it to go through the auth layer.

**Login smoke test (the real proof):** pick ONE seeded user (e.g. `growth1@test.visibleau.dev` /
`TestPass123!`) and confirm via the app's sign-in that it actually logs in. If it doesn't, the seed
didn't create proper auth records — report and fix.

## STEP 4 — Report
Output a table the operator can use:
| Tier | Email | Password | Org name |
…for all users, plus: the seed script path, the npm script, confirmation that auth records exist for
each, and the result of the one login smoke test. Note the shared password and that this is dev-only.

## Constraints
- Users MUST be login-able (created via the auth layer, not raw INSERTs). This is the whole point.
- Idempotent + dev-only (never seed prod).
- Use the REAL tier enum values from the schema (don't invent tier names).
- Set all NOT NULL / required fields (region, onboardingComplete, slug, role) correctly.
- Don't touch existing real data; only add the test users/orgs.
