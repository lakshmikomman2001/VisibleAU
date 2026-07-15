# FIX S8-MED-08 — Define TIER_SEAT_LIMITS + complete the team header subtitle (seats) + seat-gate the invite button (F12 close)

## Severity: MEDIUM (completes F12 — team seat model was undefined in canon; Sri has now set the numbers)

## Context
F12 (MED-06) left the seat count unresolved because canon defines NO seats-per-tier (only
`TIER_BRAND_LIMITS` = brand capacity, a different limit). The build correctly flagged rather than
invented. Sri has now decided the seat numbers. This fix defines them, shows them in the subtitle,
and enforces them on the invite button.

## Canon basis (so the seat model is consistent, not contradictory)
- `org_members` (team RBAC) is an **Agency-tier feature** (LLD 4191/4211): Free/Starter/Growth see
  it as a LOCKED teaser ("Add team members with role-based access → Agency A$499"); only **Agency**
  and **Agency Pro** get team RBAC FULL. So the lower tiers effectively have **1 seat** (owner only,
  no invites) — and the PRIMARY lower-tier protection is the feature-availability gate, NOT the seat
  number. The seat map below is consistent with that (1 for locked tiers) but does not replace the
  feature gate.
- Tier source-of-truth is **`subscriptions.tier`** — the seat lookup MUST use it, NEVER
  `organizations.tier` (the recurring invariant).

## Sri's decision (the seat numbers — DEFINITIVE)
```
Free        → 1   (RBAC locked; owner only)
Starter     → 1   (RBAC locked; owner only)
Growth      → 1   (RBAC locked; owner only)
Agency      → 5
Agency Pro  → 15
```
Counting rule (for now): **all roles count** toward the limit. Viewer-exemption is DEFERRED — leave
a clearly-marked TODO so it's a one-line change later, not a rediscovery.

## Task

### Step 1 — Define TIER_SEAT_LIMITS next to the existing tier-limit constants
Find where `TIER_BRAND_LIMITS` (and any `TIER_AUDIT_LIMITS`) live and co-locate the new map so all
tier limits sit together:
```bash
cd c:/startup/VisibleAU/src
grep -Rn "TIER_BRAND_LIMITS\|TIER_AUDIT_LIMITS" lib/ | grep -v test
```
Add (matching the exact tier-key casing the other maps use — confirm 'Agency Pro' vs 'agency_pro'):
```typescript
// Team seats per tier. Team RBAC (org_members) is an Agency+ feature (LLD 4191/4211);
// Free/Starter/Growth have the feature LOCKED, so effectively 1 seat (owner only).
// Seat numbers set by Sri (product decision — canon had no seats-per-tier, only brand limits).
// TODO(seats): viewer-role invites currently COUNT toward the limit; revisit exempting 'viewer'.
export const TIER_SEAT_LIMITS: Record<Tier, number> = {
  free: 1,
  starter: 1,
  growth: 1,
  agency: 5,
  agency_pro: 15,
};
// [LLD escalation flag] canon should add TIER_SEAT_LIMITS to the tier matrix so future team logic
// inherits it (parallels TIER_BRAND_LIMITS / TIER_AUDIT_LIMITS).
```
Use the SAME key convention as `TIER_BRAND_LIMITS` (if that map keys on 'Agency Pro' with a space,
match it; if 'agency_pro', match that). A key-casing mismatch = a silent undefined lookup.

### Step 2 — Subtitle: append the seat count
In `app/(auth)/settings/team/page.tsx`, the subtitle currently renders
`"{count} member(s) · {pending} pending invites · {tier} plan"`. Append the seat limit:
`"… · {tierLabel} plan ({seatLimit} seats)"`
- `seatLimit = TIER_SEAT_LIMITS[tier]` where `tier` comes from the `/api/auth/me` response
  (already extended in MED-06 to include `tier` from `subscriptions.tier`).
- Pluralize: "1 seat" vs "5 seats".
- Keep the existing member/pending clauses.

### Step 3 — Seat-gate the invite button
When `activeMembers + pendingInvites >= seatLimit`, the invite action must be blocked:
- Disable the Invite button (and/or the whole invite form's submit) with a clear reason, e.g. a
  small helper line: "Seat limit reached ({used}/{limit}). Upgrade to add more." — link to
  /settings/billing.
- This is a CLIENT-side UX gate for now; if the invite API should also reject over-limit invites
  server-side, note it (defense in depth) but the primary ask is the button gate. If you add the
  server check, it must also read `subscriptions.tier`.
- Count rule: `used = activeMembers.length + pendingInvites.length` (all roles counted — the
  deferred viewer-exemption TODO).

### Step 4 — Consistency with the feature-availability gate (do NOT regress lower tiers)
Confirm the invite form is ALREADY gated by team-feature availability (Agency+). The seat limit is
a SECOND layer; it must not accidentally ENABLE invites on a tier where the feature is locked.
```bash
grep -Rn "org_members\|team.*gate\|Agency\|feature.*flag\|canManage\|isFeatureEnabled" \
  "app/(auth)/settings/team/page.tsx" lib/feature-flags/index.ts lib/governance/ | grep -v test | head
```
If the team feature is NOT tier-gated at all on this screen (i.e. a Growth user reaches a working
invite form), REPORT it — that's a separate finding (lower-tier team-feature leak), and the seat=1
map alone should not be the only thing stopping a Growth user from inviting.

## Verify
```bash
grep -Rn "TIER_SEAT_LIMITS" lib/ "app/(auth)/settings/team/page.tsx"
```
On screen (Agency org, owner): subtitle reads "1 member · 0 pending invites · Agency plan (5 seats)".
Seed/simulate 5 members+pending → the Invite button disables with the seat-limit helper. On an
Agency Pro org → 15 seats. On a lower tier → confirm the team feature is gated upstream (invite not
reachable), independent of the seat map.

## Constraints
- Seat lookup via `subscriptions.tier` ONLY — never `organizations.tier`.
- Match the tier-key casing of the existing TIER_* maps exactly.
- Keep the deferred-viewer-exemption as a marked TODO (do not implement exemption now).
- Token-driven styling; the seat-limit helper is accessible (not color-only); no hex-alpha.
- Do not weaken the existing feature-availability gate; the seat gate is additive.

## Report back (paste inline)
1. Where TIER_SEAT_LIMITS was added + the key casing used (matching TIER_BRAND_LIMITS).
2. Subtitle before/after (showing "(5 seats)").
3. The invite-button seat-gate behaviour + whether a server-side check was added.
4. Step 4: whether the team feature is already tier-gated on this screen (or a lower-tier leak to
   report).
