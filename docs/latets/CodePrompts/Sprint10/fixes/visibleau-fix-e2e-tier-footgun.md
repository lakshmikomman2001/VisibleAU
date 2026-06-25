# VisibleAU — Fix the e2e test footgun: `UPDATE organizations SET tier='agency'` with NO WHERE clause
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
A data-integrity bug: `scripts/e2e-real-audit-test.ts:29` runs
`await db.update(organizations).set({ tier: "agency" })` with **no WHERE clause**, setting EVERY org
in the database to tier 'agency'. This already corrupted the per-tier test users once (they all became
'agency'); it will do so again every run. In a shared/staging DB it would silently upgrade REAL
customers to Agency for free — a billing-integrity hazard.

## STEP 0 — Understand what line 29 is actually trying to do (don't just bolt on a WHERE)
```bash
sed -n '1,60p' scripts/e2e-real-audit-test.ts
```
Read the surrounding code. Determine:
- Does this script CREATE its own test org earlier (capture that org's id)? If so, the intent is almost
  certainly "make THE TEST ORG agency so the audit runs at agency limits" — and the fix is to scope the
  update to that specific org id (`eq(organizations.id, testOrgId)`), NOT all orgs.
- Or does it operate on an existing/seeded org? Then scope to that one.
- What is the test verifying that requires tier='agency' (e.g. agency-tier engine/run counts)? Confirm
  the tier bump is even needed, and for WHICH org.
Report the intent before changing anything.

## STEP 1 — Fix: scope the update to ONLY the test org
Replace the unscoped update with one targeting the specific org the test uses/creates:
```ts
// BEFORE (dangerous — hits every org):
await db.update(organizations).set({ tier: "agency" });

// AFTER (scoped to the test's own org):
await db.update(organizations)
  .set({ tier: "agency" })
  .where(eq(organizations.id, testOrgId));   // testOrgId = the org this script created/uses
```
Use the actual variable/id the script has for its test org (from STEP 0). Ensure `eq` and
`organizations` are imported. If the script doesn't currently track a single test-org id, fix it to
create/identify one and scope to it.

## STEP 2 — Add a guardrail so this class of bug can't silently nuke all orgs again
Add a safety assertion before any bulk-ish tier mutation in this script (and ideally a lint/comment
convention): refuse to run an org tier UPDATE that lacks a WHERE / affects more than 1 row. Minimal
version — after the scoped update, assert it touched at most the test org. Also add a dev-only guard at
the TOP of the script so it cannot run against a production database:
```ts
if (process.env.NODE_ENV === "production" || /supabase\.co|prod/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("e2e-real-audit-test must not run against production");
}
```
(Adjust the prod-detection to match how prod DATABASE_URL actually looks.)

## STEP 3 — Verify the fix doesn't re-corrupt tiers
Confirm the seeded per-tier users are still correct AFTER a dry read (do NOT run the full e2e unless
safe), and that the script, if run, would now only touch its own test org:
```sql
SELECT o.tier, COUNT(*) FROM organizations o
JOIN users u ON u.organization_id = o.id
WHERE u.email LIKE '%@test.visibleau.dev'
GROUP BY o.tier ORDER BY o.tier;
-- expect the healthy spread: 2 free, 2 starter, 2 growth, 2 agency, 2 agency_pro
```
If the per-tier users are currently correct, the fix must preserve that. (If you actually run the e2e
script to validate, do it in dev only and re-check this query after — it should NOT have blasted
everything to agency.)

## STEP 4 — Scan for sibling footguns (same class)
This pattern may exist elsewhere. Grep for any other unscoped mutations that could nuke data:
```bash
grep -rnE "\.update\((organizations|users|brands|audits|subscriptions)\)\.set\(" scripts app lib | grep -v "\.where(" 
grep -rnE "\.delete\((organizations|users|brands|audits)\)" scripts app lib | grep -v "\.where("
```
Report any `.update(...).set(...)` or `.delete(...)` with NO `.where(...)` — those are the same hazard
(a bulk write/delete with no filter). List them; fix any that are clearly unintended (or flag for the
operator if intent is unclear). Do NOT blindly add WHERE to legitimate intentional bulk ops, but an
unscoped tier/credential/delete on a core table is almost always a bug.

## STEP 5 — Report
- STEP 0 intent finding (what line 29 was for, which org it should target).
- The scoped fix applied (show the diff).
- The prod guard + any assertion added.
- The verification query result (per-tier users still correct).
- Any sibling unscoped update/delete found in STEP 4.

## Constraints
- Scope to the test's OWN org; do not affect other orgs.
- Add the dev-only/prod guard.
- Don't break what the e2e test legitimately verifies — just stop it nuking all org tiers.
- Report sibling footguns; fix obvious ones, flag ambiguous ones.
