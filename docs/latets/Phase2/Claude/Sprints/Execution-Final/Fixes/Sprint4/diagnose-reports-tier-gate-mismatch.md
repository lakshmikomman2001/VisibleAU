# Claude Code — DIAGNOSE (report-first, NO fixes): Reports shows "Growth plan required" for an Agency-tier user

On the Reports page (`/brands/0f531803-b529-4d09-9fd6-b6272b5baba8/reports`), with the org "Test Org Agency 1"
(Agency tier) and brand "Bondi Plumbing", the page shows **"🔒 Growth plan required — Upgrade"** (LOCKED). But
Reports requires **Growth+**, and Agency qualifies — so it should NOT be locked. Either (a) the gate reads the WRONG
tier source (organizations.tier vs subscriptions.tier — they've diverged), or (b) this brand belongs to a
lower-tier org than assumed (test-data confusion). Determine which.

**DIAGNOSE ONLY. Change NO source/data. This is a tier-gating correctness/security issue.**

## Context — the standing rule
`subscriptions.tier` is the SOLE source of truth for tier; `organizations.tier` must NEVER be read for gating (they
can diverge — the exact §12 Sprint 3 grep gate: `organizations.tier → expect 0`). A prior fix (the reports-card
`tier` crash fix) was flagged as reading `organizations.tier` — this may be that bug surfacing.

## STEP 1 — What tier does EACH source say, for THIS brand's org?
```bash
# Which ORG owns this brand?
psql "$DATABASE_URL_PROD" -c "SELECT b.id AS brand_id, b.name AS brand, b.organization_id, o.name AS org, o.tier AS org_tier FROM brands b JOIN organizations o ON o.id=b.organization_id WHERE b.id='0f531803-b529-4d09-9fd6-b6272b5baba8';"
# What does the SUBSCRIPTION say for that org (the SOLE source of truth)?
psql "$DATABASE_URL_PROD" -c "SELECT s.organization_id, o.name AS org, s.tier AS subscription_tier, s.status FROM subscriptions s JOIN organizations o ON o.id=s.organization_id WHERE s.organization_id=(SELECT organization_id FROM brands WHERE id='0f531803-b529-4d09-9fd6-b6272b5baba8');"
```
Report: for THIS brand's org — what is `organizations.tier`? What is `subscriptions.tier`? **Do they MATCH or
DIVERGE?** And is this brand's org actually the Agency org "Test Org Agency 1", or a DIFFERENT (lower-tier) org?
(Use the PROD DB — Sri is in production mode.)

## STEP 2 — What tier source does the Reports gate actually READ?
```bash
# The reports page + the tier gate:
grep -rn "tier\|Growth\|GROWTH_PLUS\|TierGate\|subscription\|organizations.tier\|org.tier" "app/(auth)/brands/[brandId]/reports/page.tsx" 2>/dev/null | head
sed -n '1,60p' "app/(auth)/brands/[brandId]/reports/page.tsx"
# Where does the tier value come from — the server page's tier resolution:
grep -rn "tier\|subscriptions\|organizations\|getTier\|resolveTier\|withRlsContext" "app/(auth)/brands/[brandId]/reports/page.tsx" | head
# The brand-detail Reports CARD gate (from the earlier fix) — does IT read organizations.tier?
grep -rn "organizations.tier\|org.tier\|subscriptions.tier\|currentUser.organization.tier\|GROWTH_PLUS" "app/(auth)/brands/[brandId]/page.tsx" components/domain/brand/brand-detail-client.tsx 2>/dev/null | head
```
Report: does the Reports page (and the reports-card gate) resolve tier from **`organizations.tier`** or
**`subscriptions.tier`**? (The earlier crash-fix used `currentUser.organization.tier` = organizations.tier — confirm
if that's the source here.)

## STEP 3 — The canonical tier resolution — how do OTHER correct gates read it?
```bash
# How does a KNOWN-correct gate (e.g. competitive-benchmark from Sprint 3, which passed the §12 gate) read tier?
grep -rn "subscriptions.tier\|getTier\|tier" "app/api/brands/[id]/competitive-benchmark/route.ts" lib/quota/ lib/subscription* 2>/dev/null | head
grep -rn "subscriptions" lib/ | grep -i tier | head
```
Report: the canonical way tier is resolved elsewhere (should be from subscriptions.tier). Is there a helper the
Reports gate SHOULD use but doesn't?

## VERDICT (report one, with the tier values as evidence)
- **Tier-source bug** — the Reports gate reads `organizations.tier`, which DIVERGES from `subscriptions.tier` for
  this org (org row says < Growth, subscription says Agency). → The Agency user is wrongly locked out. Fix: read
  `subscriptions.tier` (the sole source of truth), like competitive-benchmark does. THIS is the flagged bug.
- **Test-data: brand under a lower-tier org** — this brand's org is genuinely NOT Agency (both sources agree it's
  Free/Starter). → The lock is CORRECT; the confusion is that this specific brand isn't under the Agency org. No code
  bug — Sri just needs a brand under the Agency org to test Reports. (But still confirm the gate reads
  subscriptions.tier.)
- **Divergence exists** (org_tier ≠ subscription_tier) regardless → that's a data-integrity issue worth noting even
  if this brand is separate.
Report which, with the exact tier values from both sources.

## REPORT
- STEP 1: this brand's org + organizations.tier + subscriptions.tier — match or diverge? Is it the Agency org?
- STEP 2: what source the Reports page + reports-card gate READ (organizations.tier or subscriptions.tier).
- STEP 3: the canonical tier resolution other gates use.
- **Verdict** (tier-source bug / test-data / divergence) + fix direction. No source/data changed; PROD DB.

## NOTE
This is the tier-source question flagged when the reports-card `tier` crash was fixed (it read
`organizations.tier`/`currentUser.organization.tier`). The rule: `subscriptions.tier` is the SOLE truth;
`organizations.tier` can diverge (webhook desync). If the Reports gate reads organizations.tier and it's diverged,
an Agency customer is wrongly locked out of a feature they paid for — a real correctness/security bug. STEP 1 (the
two tier values) is decisive: if they diverge and the gate reads the wrong one → real bug; if this brand is just
under a non-Agency org → test-data. Confirm before fixing.
