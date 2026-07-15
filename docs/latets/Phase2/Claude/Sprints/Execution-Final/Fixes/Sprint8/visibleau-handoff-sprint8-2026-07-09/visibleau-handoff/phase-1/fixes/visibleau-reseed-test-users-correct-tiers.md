# VisibleAU — Re-seed test users with CORRECT tiers (wipe + recreate)
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
Dev only. Fixes a prior seed where users could LOG IN fine (auth creation was correct) but their orgs
got the WRONG tier (e.g. "Test Org Free 1" ended up on Agency). Wipe the existing test users/orgs and
recreate 2 per tier with the correct tier set.

## Confirmed context
- The previous seed's AUTH creation WORKS (operator logged in successfully as a seeded user). So
  REUSE that same user-creation method (Better Auth path) — do NOT change how users are created.
- The BUG is tier assignment: orgs were created with the wrong `tier` (looks like all/most got
  'agency' regardless of intended tier). Find WHY, then fix.

## STEP 0 — Find the prior seed + diagnose the tier bug (report, then fix)
```bash
# The existing seed script (from the prior prompt):
ls scripts/ | grep -iE "seed|test-user" ; grep -rniE "seed-test-users|test.visibleau.dev|TestPass123" scripts package.json

# Open it and find HOW tier is set on the org:
grep -nE "tier|createOrganization|organizations|insert|values" scripts/seed-test-users.ts 2>/dev/null

# WHY did tier come out wrong? Common causes — check each:
# (a) org tier has a DB default of 'agency' (or similar) and the seed never set it explicitly:
grep -rnE "tier" db/schema/*.ts | grep -iE "default|tierEnum|pgEnum"
# (b) the seed set tier on the wrong table/column, or used a tier value the enum rejects silently:
grep -rnE "tierEnum|'free'|'starter'|'growth'|'agency'|'agency_pro'|'enterprise'" db/schema/*.ts | head
# (c) Better Auth's organization plugin sets a default plan/tier that overrode the seed:
grep -rniE "organization|plan|tier|default" lib/auth*.ts lib/**/auth*.ts 2>/dev/null | grep -iE "tier|plan|default" | head
```
Report: the exact reason the tiers were wrong (DB default? seed set wrong column? enum mismatch? auth
plugin default?), the real tier enum values, and which table/column actually holds the org's billing
tier. THEN fix accordingly.

## STEP 1 — Wipe the existing test users/orgs (test data only — be precise)
Delete ONLY the seeded test accounts (identified by the @test.visibleau.dev email pattern). Remove in
FK-safe order (auth account/session rows → users → orgs, per the actual schema relationships). Do NOT
touch any real/other data.
```sql
-- Identify first (report these before deleting):
SELECT o.id AS org_id, o.name, o.tier, u.id AS user_id, u.email
FROM organizations o JOIN users u ON u.organization_id = o.id
WHERE u.email LIKE '%@test.visibleau.dev';
```
Then delete the matching auth rows (Better Auth user/account/session — use the real table names found
in STEP 0), the app `users` rows, and their `organizations`. Make the wipe idempotent/safe (no error
if already gone). Report how many of each were removed.

## STEP 2 — Recreate 2 users per tier with CORRECT tier
Reuse the WORKING auth-creation method from the prior seed (operator confirmed login works). For EACH
tier in the real enum (confirm exact list — likely free, starter, growth, agency, agency_pro; include
enterprise ONLY if it's a normal seedable tier), create 2 users:
- Emails: `free1@test.visibleau.dev`, `free2@…`, `starter1@…`, `starter2@…`, `growth1@…`, `growth2@…`,
  `agency1@…`, `agency2@…`, `agencypro1@…`, `agencypro2@…` (+ enterprise1/2 if applicable).
- Shared dev password: `TestPass123!` (document it).
- Each in its OWN org, with the org `tier` set EXPLICITLY to the matching tier — and set it on the
  correct table/column identified in STEP 0. **Do not rely on the default.** If an auth-plugin default
  overrides it, set the tier AFTER org creation (an explicit UPDATE) so the final value is correct.
- Org names that ENCODE the real tier: `Test Org Free 1`, `Test Org Growth 2`, etc.
- Required NOT NULL fields set: `region='au'`, `onboardingComplete=true` (skip onboarding),
  `role='owner'`/'admin' as schema requires, slug if required.
Idempotent (skip/replace if email exists) and DEV-ONLY (guard against prod DATABASE_URL/NODE_ENV).

## STEP 3 — Verify tiers are now CORRECT (the whole point)
```sql
SELECT o.tier, o.name, u.email
FROM organizations o JOIN users u ON u.organization_id = o.id
WHERE u.email LIKE '%@test.visibleau.dev'
ORDER BY
  CASE o.tier WHEN 'free' THEN 0 WHEN 'starter' THEN 1 WHEN 'growth' THEN 2
              WHEN 'agency' THEN 3 WHEN 'agency_pro' THEN 4 ELSE 5 END, u.email;
```
Confirm EACH user's org tier matches its email/name (free1 → tier 'free', growth1 → 'growth', etc.) —
2 per tier. THIS is the fix's proof: the prior run had everything on 'agency'; now each must match.

Also re-confirm login still works: pick `free1@test.visibleau.dev` / `TestPass123!` and verify sign-in
(the auth method is unchanged, so it should — but confirm).

## STEP 4 — Report
Output:
- STEP 0 diagnosis (WHY tiers were wrong — the root cause).
- Wipe counts.
- A table: | Tier | Email | Password | Org name | — for all recreated users.
- The verification query result (proving tiers now correct).
- Login confirmation for the smoke-test user.

## Constraints
- Reuse the working auth-creation method (don't break login). Fix ONLY the tier assignment.
- Set tier EXPLICITLY on the correct column; if a default/plugin overrides it, force-set after creation.
- Wipe touches ONLY @test.visibleau.dev accounts. Never real data. Dev-only.
- Use real tier enum values from the schema.
