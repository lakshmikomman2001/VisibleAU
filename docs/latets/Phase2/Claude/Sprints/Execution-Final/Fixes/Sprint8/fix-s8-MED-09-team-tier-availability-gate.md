# FIX S8-MED-09 — Team RBAC has no tier-availability gate (Growth owner reaches a working invite form; F18)

## Severity: MEDIUM (packaging: a non-Agency org sees a working team page; currently blocked only by the accidental seat=1 coincidence — wrong UX + fragile)

## The finding (from MED-08 Step 4)
The team screen's `canManage` (`app/(auth)/settings/team/page.tsx:53`) is **purely role-based**
(`owner || admin`) with **NO tier check**. Per canon, team RBAC (`org_members`) is an **Agency+**
feature (LLD 4191/4211) — Free/Starter/Growth should see it LOCKED with an upgrade teaser, not a
functional team page.

Why it's not currently an exploit but IS a real finding:
- The `TIER_SEAT_LIMITS` map (MED-08) gives lower tiers `seatLimit=1`, and a solo owner is already
  1 member, so a Growth owner hits "Seat limit reached (1/1)" and can't actually invite. The
  functional leak is blocked **by accident**.
- But (a) the UX is WRONG — a Growth user sees a fully-rendered team page with a "seat limit
  reached, upgrade to add more" error (implying "buy more seats"), when the correct message is
  "team management is an Agency feature" (a conversion teaser, not a dead-end); and (b) the block is
  **load-bearing on an unrelated constant** — change Growth's seat number and the leak reopens
  silently.
- Same CLASS as the carried S6 tier-gate leak (an Agency+/Starter+ feature not gated on the UI).

## Canon — reuse the existing pattern, do NOT invent
There is a canonical **`TierGate`** overlay component (prototype FIX17 700–738):
```
<TierGate requiredTier="Agency" currentTier="Growth" feature="Team Management" />
```
It renders a blurred overlay + lock icon + "Available on {requiredTier} plan. You're on
{currentTier}." + an "Upgrade to {requiredTier}" button. This is exactly how Agency+/Growth+
features are locked elsewhere (BrandIntelTabs, discovery-hub). Use it — don't build a new lock.

## Task

### Step 1 — Locate the TierGate component + the tier the screen already has
```bash
cd c:/startup/VisibleAU/src
grep -Rn "TierGate\|requiredTier\|currentTier" components/ app/ | grep -v test | head
# The team page already receives tier from /api/auth/me (MED-06/08). Confirm:
grep -n "tier\|/api/auth/me\|canManage\|TIER_SEAT_LIMITS" "app/(auth)/settings/team/page.tsx"
# The tier-rank / availability convention used elsewhere (to compute "is this tier >= Agency"):
grep -Rn "tierRank\|TIER_RANK\|>= *Agency\|minTier\|isFeatureEnabled\|feature.*availab" lib/ components/ | grep -v test | head
```

### Step 2 — Gate the team feature to Agency+ using TierGate
Define the availability check by tier rank (Agency and Agency Pro pass; Free/Starter/Growth are
locked). Use the SAME tier-rank convention the app already uses (from Step 1); if none exists as a
shared util, add a minimal `TIER_RANK` next to `TIER_SEAT_LIMITS` in `lib/brands/index.ts` and use
it (snake_case keys to match).
```typescript
// team RBAC is Agency+ (LLD 4191/4211)
const TEAM_MIN_TIER = "agency";
const isTeamAvailable = TIER_RANK[tier] >= TIER_RANK[TEAM_MIN_TIER]; // agency + agency_pro (+ enterprise)
```
Render behaviour:
- **If `isTeamAvailable`** → the current team page (members table + invite form + seat logic) as-is.
- **If NOT** → show the locked state: the page content behind a `TierGate` overlay
  `requiredTier="Agency" currentTier={prettyTier} feature="Team Management"`, OR (cleaner for a
  full-page settings screen) replace the members/invite region with the teaser card. Match how
  other full-screen locks are done in the app — if the app locks brand-intel TABS with an overlay
  but full SCREENS with a teaser block, follow the screen convention. Either way the lower-tier user
  must NOT see a working invite form or a "seat limit reached" error.
- The locked view's copy should read as an UPGRADE prompt, not an error — align with canon's teaser
  ("Add team members with role-based access → Agency", LLD 4191).

### Step 3 — Keep the seat gate as the SECOND layer (don't remove it)
The seat limit (MED-08) stays for Agency/Agency Pro orgs that hit their real seat cap. After Step 2,
the two layers are: (1) tier-availability (Agency+ or locked teaser), then (2) within Agency+, the
seat limit (5 / 15). A lower tier is stopped by layer 1, NOT by the accidental seat=1 — so the block
is now intentional and correct.

### Step 4 — Tier source-of-truth
The `tier` used here MUST originate from `subscriptions.tier` (the `/api/auth/me` response already
sources it there per MED-06). NEVER `organizations.tier`. Confirm.

## Verify
```bash
grep -n "TierGate\|TEAM_MIN_TIER\|isTeamAvailable\|TIER_RANK" "app/(auth)/settings/team/page.tsx" lib/brands/index.ts
```
On screen:
- **Agency / Agency Pro owner** → full team page (members + invite + seats) as before.
- **Growth (or Starter/Free) owner** → the locked teaser / TierGate ("Available on Agency plan"),
  NOT a working invite form and NOT a "seat limit reached (1/1)" error.
- (If you can switch a test org's `subscriptions.tier` to growth, confirm the locked view renders.)

## Constraints
- Reuse the canonical `TierGate` (prototype 700–738) — do not invent a new lock component.
- Tier from `subscriptions.tier` only.
- Keep the MED-08 seat gate intact as the second layer.
- Token-driven; a11y (the upgrade CTA is text-labeled, not color-only); no hex-alpha.
- [LLD escalation flag] The team-RBAC Agency+ gate lives only in canon prose (LLD 4191/4211); the
  LLD tier-gate table should list Team Management = Agency+ explicitly so future work inherits it —
  note for Sri (parallels the TG-02 BrandIntelTabs reconciliation).

## Report back (paste inline)
1. Whether a shared tier-rank util already existed (reused) or a minimal TIER_RANK was added.
2. How the lock is rendered (full-page teaser vs TierGate overlay) + which convention the app uses
   for full-screen locks.
3. Confirmation: Agency = full page; Growth = locked teaser (not a working form, not a seat error).
4. Confirmation the tier came from subscriptions.tier.
