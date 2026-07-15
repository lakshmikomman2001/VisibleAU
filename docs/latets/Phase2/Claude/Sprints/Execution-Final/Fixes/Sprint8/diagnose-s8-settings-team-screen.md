# DIAGNOSE S8 — settings/team screen: /api/auth/me 404, "0 members" (owner row missing), missing Joined column + invite UI

## Purpose
The manual walk of `settings/team` (light theme, signed in as the org owner) surfaced 5 issues.
Before scoped fixes, gather the facts. READ-ONLY — no edits. The screen currently shows
"0 members", an empty table, and the server logged `GET /api/auth/me 404` (twice). Findings to
ground:
- F6 (HIGH) "0 members" — the owner (current user) is not shown; an org always has ≥1 member.
- F7 (HIGH) `/api/auth/me 404` — the endpoint the Team page calls does not resolve.
- F8 (MED) members table missing the **Joined** column (canon header = Member·Role·Brand access·Joined·Actions).
- F9 (MED) no **Pending invites** section rendered.
- F10 (MED) no **Invite member** button visible (owner should see it).

## Canon (for reference — do not edit canon)
Prototype FIX17 `TeamManagement` (lines 2847–2976):
- Header has an **Invite member** button (`UserPlus`, `var(--accent-primary)`).
- Members table is a **5-column** grid: `Member · Role · Brand access · Joined · Actions`.
- A **Pending invites** panel renders below the table (Mail icon, Resend / Cancel per invite).
- The current user renders with a "you" badge; owner/admin see Edit + Remove per non-self row.
LLD 8647 (org_members) + 8679–8695 (invite flow): membership rows live in `org_members`, FK'd to
the internal `users` mirror; provisioning creates the org (lib/auth/server.ts afterCreateOrganization).

## Task — diagnose, report inline, do not fix

### D1 — What endpoint does the Team page call, and does it exist?
```bash
cd c:/startup/VisibleAU/src
# The page + its data source:
sed -n '1,120p' "app/(auth)/settings/team/page.tsx"
# Every caller of /api/auth/me across the app:
grep -Rn "api/auth/me\|/auth/me" app/ components/ lib/ | grep -v test
# Does that route file exist?
find app/api -type d -name me; ls app/api/auth 2>/dev/null; find app/api/auth -name "route.ts" 2>/dev/null
# What auth/session helper SHOULD the app use (Better Auth)? Find the canonical "current user" util:
grep -Rn "getSession\|auth()\|getUser\|currentUser\|betterAuth\|auth.api" lib/ app/api/auth 2>/dev/null | grep -v test | head -30
```
REPORT: the exact fetch/URL the Team page uses to load members + current user; whether
`/api/auth/me` exists as a route; and what the app's real session/current-user mechanism is
(Better Auth session vs a `/api/auth/me` route that was assumed but never built).

### D2 — Is the members list itself wired to a real API, and does that API exist?
```bash
# The members list route (canon: GET /api/organizations/[id]/members):
find app/api/organizations -path "*members*" -name "route.ts"
sed -n '1,80p' "app/api/organizations/[orgId]/members/route.ts" 2>/dev/null || echo "MEMBERS ROUTE PATH DIFFERS — locate above"
# Does the page call it with a real org id, or does it depend on /api/auth/me resolving first?
grep -n "members\|organizationId\|orgId\|/api/organizations" "app/(auth)/settings/team/page.tsx"
```
REPORT: whether the members table is empty because (a) the members API returns [] , or (b) the
page never reaches the members call because `/api/auth/me` 404s first (the likely chain).

### D3 — Does provisioning insert the OWNER into org_members? (the "0 members" root)
```bash
# The provisioning hook (same file HIGH-02 used):
sed -n '30,110p' lib/auth/server.ts
grep -n "orgMembers\|org_members\|insert.*member\|role.*owner" lib/auth/server.ts
# And confirm the DB reality for the validation org:
# (use the real visibleau_prod conn from the env files)
grep -RnE "visibleau_prod|DATABASE_URL" .env .env.local .env.production.local 2>/dev/null
```
Then query prod:
```bash
psql "$PROD" -c "
  SELECT om.user_id, om.role, om.is_active, u.email
  FROM org_members om LEFT JOIN users u ON u.id = om.user_id
  WHERE om.organization_id = 'da1071de-6dbd-4e08-8f43-29f76c123be9';"
psql "$PROD" -c "
  SELECT count(*) AS member_rows
  FROM org_members
  WHERE organization_id = 'da1071de-6dbd-4e08-8f43-29f76c123be9';"
```
REPORT: does `lib/auth/server.ts` insert an `org_members` owner row on org creation? And does the
Metropolitan org actually have any `org_members` rows in prod (expect ≥1 owner; if 0, that's F6's
root — provisioning never seeded the owner, same class as the DR-01 orphaned-writer gap).

### D4 — Confirm the table-column + invite-UI gaps are in the source (F8/F9/F10)
```bash
# Column headers actually rendered:
grep -n "Joined\|Brand access\|Actions\|Member\|Role" "app/(auth)/settings/team/page.tsx" components/domain/governance/member-row.tsx 2>/dev/null
# Invite button + pending invites presence:
grep -n "Invite member\|UserPlus\|Pending invites\|invite-form\|InviteForm" "app/(auth)/settings/team/page.tsx" components/domain/governance/*.tsx 2>/dev/null
# Is the invite button gated on a role that can't resolve (tie to F7)?
grep -n "role\|canPerform\|owner\|admin\|isOwner\|useRole\|permission" "app/(auth)/settings/team/page.tsx" | head -20
```
REPORT: whether the **Joined** column exists in the render (F8), whether a **Pending invites**
section exists but is hidden-when-empty vs not built (F9), and whether the **Invite member** button
exists but is gated behind a role/permission that fails to resolve when `/api/auth/me` 404s (F10) —
i.e. are F10 and F7 the same root cause?

## Constraints
- READ-ONLY. No source edits, no schema changes, no writes to org_members. Diagnose only.
- Use the real `visibleau_prod` connection string from the env files.
- Do not "fix" the 404 by inventing a route yet — first report what the app's real session
  mechanism is, so the fix uses Better Auth correctly rather than stubbing a new endpoint.

## Report back (paste inline)
1. D1: the Team page's data-loading code (the fetch URLs) + whether `/api/auth/me` exists + the
   app's real current-user/session mechanism.
2. D2: whether the members API exists + whether the empty table is the members API returning [] or
   the page short-circuiting on the 404.
3. D3: whether provisioning seeds an org_members owner row + the prod `org_members` row dump for
   Metropolitan (the count).
4. D4: source confirmation for the Joined column (F8), pending-invites section (F9), and whether the
   invite button is gated on an unresolvable role (F10 = F7?).
