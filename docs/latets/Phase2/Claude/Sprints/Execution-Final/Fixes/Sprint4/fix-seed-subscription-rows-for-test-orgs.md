# Claude Code — FIX (test-data): seed subscriptions rows so subscriptions.tier matches org tier

**Confirmed test-data issue (not a code bug).** The Reports gate correctly reads `subscriptions.tier` (sole source
of truth) — but `subscriptions` has NO row for "Test Org Agency 1" (org da1071de-...) and 11 other test orgs.
`START-PROD.bat` seeds `organizations.tier='agency'` but never creates the matching `subscriptions` row → the gate
sees NULL → falls back to "free" → locks the Agency user out of Reports. **The gate code is correct — do NOT change
it.** Fix the DATA: seed subscription rows matching each org's intended tier.

## ✅ Why this is the right fix (not a gate change)
- The gate reads `subscriptions.tier` per the rule (Sprint 4 prompt line 46: "subscriptions.tier, never
  organizations.tier"). visibility + competitive-benchmark use the same canonical pattern. Correct.
- The bug is that `subscriptions` was never seeded for most test orgs, while `organizations.tier` WAS — so the two
  DIVERGED (the exact case the rule guards against). Seeding the subscription rows aligns them.
- This affects ALL subscriptions.tier-gated features (Reports, schedules, etc.) for those orgs — not just Reports.

> Investigate-first: the subscriptions schema + how orgs are seeded.
```bash
# The subscriptions table shape (columns, required fields, enum for tier/status):
grep -n "subscriptions\|tier\|status\|organization_id\|stripe\|current_period" db/schema/*subscription*.ts db/schema/*.ts 2>/dev/null | head -20
cat db/schema/subscriptions.ts 2>/dev/null | head -50
# How orgs are seeded (START-PROD.bat / seed.ts) — where org tier is set (so we add the matching subscription):
grep -rn "organizations\|tier\|INSERT\|seed\|agency\|starter\|growth" START-PROD.bat db/seed/*.ts scripts/*.ts 2>/dev/null | grep -iE "org|tier|subscription|insert" | head
# Which orgs exist + their intended tier (from organizations.tier) + which lack a subscription:
psql "$DATABASE_URL_PROD" -c "SELECT o.id, o.name, o.tier AS org_tier, s.tier AS sub_tier, s.status FROM organizations o LEFT JOIN subscriptions s ON s.organization_id=o.id ORDER BY o.name;"
```
Report the subscriptions schema (required columns + tier/status enums) and the current org↔subscription state.

## THE FIX — seed subscription rows for every org, matching organizations.tier
### Part A — a seed that creates matching subscription rows
Add/extend a seed (db/seed/seed.ts or a dedicated db/seed/subscriptions-seed.ts) that, for every organization,
UPSERTs a subscriptions row with tier = the org's intended tier and status='active':
```sql
-- Conceptually (use Drizzle + the real column names/enums from the schema):
INSERT INTO subscriptions (organization_id, tier, status, <other required cols>)
SELECT o.id, o.tier, 'active', <defaults>
FROM organizations o
ON CONFLICT (organization_id) DO UPDATE SET tier = EXCLUDED.tier, status = 'active';
```
- Use the REAL required columns from the schema (there may be stripe_customer_id, stripe_subscription_id,
  current_period_end, etc. — use sensible test defaults / NULLs where nullable; do NOT invent non-null values that
  break the insert).
- tier = `organizations.tier` (so subscription matches the intended tier per org).
- status = 'active' (so the gate treats it as a live subscription).
- Idempotent (ON CONFLICT) so re-running is safe.
- This aligns subscriptions.tier with organizations.tier for ALL test orgs (fixes Reports + all tier-gated features).

### Part B — wire it so it doesn't recur (the "file exists ≠ applied" lesson)
- Add the subscription seed to the seed sequence that runs for the PROD/test DB (START-PROD.bat's seed step, or
  db/seed/seed.ts's main). So a fresh DB reset seeds subscriptions alongside organizations — the divergence doesn't
  come back.
- If org creation elsewhere sets organizations.tier, ensure a matching subscription is created there too (or rely on
  this seed for test data).

### Part C — apply it NOW to the current DB
Run the seed against the current PROD DB so the existing orgs (esp. "Test Org Agency 1" / da1071de-...) get their
subscription rows immediately:
```bash
npx tsx db/seed/seed.ts   # or the specific subscription seed
# Verify:
psql "$DATABASE_URL_PROD" -c "SELECT o.name, o.tier AS org_tier, s.tier AS sub_tier, s.status FROM organizations o LEFT JOIN subscriptions s ON s.organization_id=o.id ORDER BY o.name;"
# expect: every org now has a matching sub_tier + status='active'
```

## DO NOT change the gate code
The Reports gate (and visibility/competitive-benchmark) correctly read subscriptions.tier — leave them. This is a
data seed fix only.

## VERIFY (on screen)
1. Run the seed → every org has a subscriptions row with tier matching organizations.tier, status='active'.
   Specifically "Test Org Agency 1" (da1071de-...) → subscriptions.tier='agency'.
2. Reload the Reports page for a Bondi Plumbing brand under that Agency org → **NO more "Growth plan required"** →
   the full Reports page (list + Generate CTA) shows. The Agency user now has access (correct per the entitlement
   matrix: Agency ✓ for reports).
3. Spot-check a lower-tier test org (e.g. a Starter org) still correctly sees the locked teaser (the gate still
   works — Starter ✗ for reports).
4. Core tsc clean; existing tests green (seed change shouldn't affect them, but confirm).

## REPORT
- The subscriptions schema (required cols) + the seed added (Part A) + where wired (Part B) + applied to current DB
  (Part C).
- The org↔subscription table AFTER seeding (every org has matching sub_tier + active).
- **On-screen: Reports page for the Agency org's brand now UNLOCKED** (list + Generate); a Starter org still locked.
- Confirm: gate code UNCHANGED; seed idempotent; wired into the seed sequence; which DB.

## NOTE — two separate follow-ups (bank, don't do here)
1. **Real rule violations found:** `app/(auth)/action-center/page.tsx:60` and `app/(auth)/agency/page.tsx:14` read
   `currentUser.organization.tier` (= organizations.tier) — VIOLATING the "subscriptions.tier sole truth" rule
   (Sprint 4 prompt line 46). These are REAL tier-source bugs (they'd read the stale org tier). Separate from this
   Reports fix (Reports is correct). Bank for a tier-source cleanup pass — should read subscriptions.tier like the
   correct gates do.
2. **Data-integrity:** organizations.tier and subscriptions.tier diverging is the exact risk the rule guards against
   — worth a longer-term decision on whether organizations.tier should exist at all for gating, or be kept in sync
   deliberately. Not urgent; note it.
