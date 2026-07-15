# VERIFY S8 — audit-trail ROUTE access control (viewer-excluded RBAC + cross-org 404 + RLS)

## Why (what the first verification pass missed)
The earlier audit-trail verification checked ROW RENDERING (§6U.3 → F20/F21). It did NOT check the
ROUTE's access control (§9). The prototype has no audit-trail screen, so §9 + the LLD RBAC matrix
are the authorities. Three route-level guarantees are unverified — all invisible on-screen because
you view as owner:

1. **`GET /api/organizations/[id]/audit-trail` is owner/admin/analyst ONLY — viewer EXCLUDED.**
   Subtle: the RBAC matrix lets a viewer "View reports" (✓) but the S8 prompt §9 line 395 scopes
   the audit-trail route to **owner/admin/analyst** — viewer is dropped. A build reusing a generic
   "any member can read" guard would wrongly let viewers read the audit trail (which contains
   member privilege-change history). This is a governance-sensitive gate.
2. **cross-org → 404** — requesting another org's audit-trail must 404 (RLS/access-control), not leak
   or 403-with-existence-disclosure.
3. **Better Auth session + setRlsContext + access-control** actually enforced on the route (the §12
   grep only proves `setRlsContext` is textually present, not that the RBAC scope is right).

READ-ONLY: inspect + report. No edits. If a gap is found, report it as a finding; fix comes after.

## Task

### Step 1 — Read the route's guard
```bash
cd c:/startup/VisibleAU/src
sed -n '1,120p' "app/api/organizations/[id]/audit-trail/route.ts" 2>/dev/null \
  || sed -n '1,120p' "app/api/organizations/[orgId]/audit-trail/route.ts"
```
Confirm, in order:
- Better Auth session check (401 if unauthenticated).
- `setRlsContext` called before the query.
- An access-control / RBAC check that resolves the caller's role in `[id]` and ALLOWS only
  owner/admin/analyst — and DENIES viewer. Capture the exact predicate (is it
  `role !== 'viewer'`? an allow-list `['owner','admin','analyst']`? a generic `isMember`?).
- cross-org handling: if the caller isn't a member of `[id]`, does it 404 (not 403/200)?

### Step 2 — What does the access-control helper actually permit?
```bash
grep -Rn "audit.?trail\|canViewAuditTrail\|owner.*admin.*analyst\|'viewer'\|role ===\|allowedRoles\|assertRole\|requireRole" lib/governance/ | grep -vi test | head
sed -n '1,80p' lib/governance/access-control.ts 2>/dev/null | grep -nE "viewer|analyst|admin|owner|audit|allow|deny|role"
```
Determine whether the guard used by the audit-trail route excludes `viewer`. If the route uses a
generic member check (any role passes), that's the gap — viewer would see the audit trail.

### Step 3 — Confirm behaviourally against the DB roles (no destructive writes)
```bash
# Roles present on Metropolitan (da1071de) — is there a viewer/analyst to reason about?
psql "$PROD" -c "
  SELECT user_id, role FROM org_members
  WHERE organization_id = 'da1071de-6dbd-4e08-8f43-29f76c123be9' ORDER BY role;"
```
If only an owner exists, the viewer-exclusion can't be exercised live — in that case REPORT the
guard's predicate from Steps 1–2 as the evidence (static), and note that a behavioural viewer-denied
test belongs in the integration phase. Do NOT create a viewer member just to test (that mutates the
org); the code predicate is sufficient evidence for this pass.

### Step 4 — cross-org 404 evidence
```bash
grep -n "404\|notFound\|not_found\|NotFound\|status(404)\|cross.?org" \
  "app/api/organizations/[id]/audit-trail/route.ts" 2>/dev/null \
  || grep -n "404\|notFound\|NotFound" "app/api/organizations/[orgId]/audit-trail/route.ts"
```
Confirm a non-member (or wrong-org) request resolves to 404, not a 403 that discloses existence or a
200 that leaks rows.

## Classification (report one of):
- **PASS** — route excludes viewer (owner/admin/analyst allow-list or explicit viewer-deny),
  setRlsContext present, cross-org → 404. Audit-trail route is correct; no finding.
- **FINDING (HIGH if viewer can read; MED if only cross-org/RLS is loose)** — the guard permits
  viewer, OR cross-org doesn't 404, OR RBAC isn't actually enforced. Name the exact line + predicate.

## Constraints
- READ-ONLY. No edits, no role mutations, no created members. Inspect the guard + DB roles only.
- `$PROD` from env.
- This is the route half of the audit-trail verification; the row half (§6U.3) is already done
  (F20 flagged, F21 fix pending its screenshot).

## Report back (paste inline)
1. The route guard (Step 1): session + setRlsContext + the exact RBAC predicate; does it exclude
   viewer?
2. The access-control helper (Step 2): owner/admin/analyst allow-list or generic member check?
3. DB roles on Metropolitan (Step 3) + whether viewer-exclusion is live-testable or static-only here.
4. cross-org 404 evidence (Step 4).
5. Classification: PASS or FINDING (with severity + exact location).
