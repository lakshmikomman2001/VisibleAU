# FIX S8-HIGH-12 — Viewer can read the audit trail (route reuses viewer-inclusive `view_reports`)

## Severity: HIGH — information disclosure of governance data to the least-privileged role
A **viewer** can read the full org audit trail via `GET /api/organizations/[orgId]/audit-trail`,
including the metadata of member-privilege changes: `member_role_changed` (who was
promoted/demoted, old→new role), `member_removed` (who was removed), `member_invited` (email +
assigned role), plus `hallucination_acknowledged` (brand). The audit trail is where access-control
HISTORY lives, and the lowest-trust role ("read-only access") can currently read all of it.

## Root cause (verified)
- Route `app/api/organizations/[orgId]/audit-trail/route.ts:27` gates on
  `canPerformAction(role, "view_reports")`.
- `lib/governance/access-control.ts:25` defines `view_reports: ["owner","admin","analyst","viewer"]`
  — the ONE permission in the matrix that includes viewer (it's for report VIEWING, which viewers
  are allowed).
- S8 prompt §9 line 395 explicitly scopes the audit-trail route to **owner/admin/analyst** — viewer
  is dropped. So reusing `view_reports` violates §9.

## Canon note (why this needs a NEW permission, not a swap)
The RBAC matrix (LLD 8556 / prompt §83–84) lists action-permissions — Run audit
(owner/admin/analyst), Approve drafts (owner/admin), Generate reports (owner/admin/analyst), Invite
members (owner/admin), Delete brand (owner), View reports (owner/admin/analyst/**viewer**). There is
**no audit-trail-view permission** in the matrix — §9 specifies the scope in prose only. So the
build had to pick an existing permission and picked the wrong (viewer-inclusive) one. The fix is to
add the missing permission with the §9 allow-list. (Flag for Sri: the LLD RBAC matrix should list
`view_audit_trail = owner/admin/analyst` explicitly so canon carries what §9 requires in prose.)

## Task

### Step 1 — Add the viewer-excluded permission
In `lib/governance/access-control.ts`:
- Add `view_audit_trail` to the `PermissionAction` union/type.
- Add to the RBAC matrix: `view_audit_trail: ["owner", "admin", "analyst"]` (NO viewer) — mirroring
  the "Run audit" / "Generate reports" scope, per §9.
- Do NOT alter `view_reports` (it correctly includes viewer for report viewing — other routes rely
  on that; changing it would over-restrict reports).

### Step 2 — Point the audit-trail route at the new permission
In `app/api/organizations/[orgId]/audit-trail/route.ts:27`:
```
- canPerformAction(role, "view_reports")
+ canPerformAction(role, "view_audit_trail")
```
Leave the rest of the guard chain unchanged (it's correct): getCurrentUser→401,
`orgId !== currentUser.organizationId`→404 (cross-org, verified PASS), getMemberRecord role
resolution, withRlsContext. Only the permission action changes.

### Step 3 — Confirm no other route wrongly shares this
```bash
cd c:/startup/VisibleAU/src
grep -Rn "view_reports\|view_audit_trail" app/api lib/ | grep -v test
```
Verify: the audit-trail route now uses `view_audit_trail`; genuine report-viewing routes still use
`view_reports` (viewers should keep report access). Confirm no OTHER governance-sensitive route
(members list? feature-flags?) is also leaking to viewer via `view_reports` when §9 scopes it
tighter — if `GET …/members` or `…/feature-flags` should exclude viewer per §9, note it (separate
finding, don't fix here unless it's the same one-line class).

## Verify
```bash
grep -n "view_audit_trail" lib/governance/access-control.ts "app/api/organizations/[orgId]/audit-trail/route.ts"
```
Behavioural (static evidence sufficient — do NOT create a viewer member to test live):
- `canPerformAction("viewer", "view_audit_trail")` → **false** (viewer denied).
- `canPerformAction("analyst", "view_audit_trail")` → true.
- `canPerformAction("owner"/"admin", "view_audit_trail")` → true.
- The route returns 403 for a viewer, 200 for owner/admin/analyst.
(Metropolitan has only an owner member, so a live viewer-denied test isn't possible without mutating
the org — the predicate + a unit test in the integration phase are the proof. This finding SHOULD
get a behavioural viewer-denied test in the Backend Integration section of the test track.)

## Constraints
- Add a NEW `view_audit_trail` permission (owner/admin/analyst); do NOT weaken `view_reports`.
- Only the permission action on the audit-trail route changes; the rest of the guard is verified
  correct — don't touch cross-org 404 / session / RLS.
- Flag the LLD RBAC-matrix gap for Sri (add `view_audit_trail` to canon).
- No viewer member created for testing — static predicate + a future integration test.

## Report back (paste inline)
1. The access-control.ts change (new permission + allow-list) and the route one-line change.
2. `canPerformAction("viewer","view_audit_trail")` = false confirmed (and analyst/owner/admin=true).
3. The Step 3 grep: audit-trail uses view_audit_trail; report routes still use view_reports; whether
   any OTHER route (members/feature-flags) has the same viewer-leak under §9 (note as separate).
