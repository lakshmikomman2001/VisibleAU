# FIX S8-HIGH-04 — Build the missing /api/auth/me route (F7) + seed the org_members owner row on provisioning (F6)

## Severity: HIGH (settings/team, audit-trail, data-residency all show "0 members"/empty + no gated controls; two linked root causes)

## The two root causes (from diagnosis)
1. **F7 — `/api/auth/me` never built.** All 3 governance pages call `fetch("/api/auth/me")` as
   their first step (e.g. `app/(auth)/settings/team/page.tsx:29`); on 404 they short-circuit
   (`if (!meRes.ok) return;`), so members never load and role defaults to `"viewer"` →
   `canManage=false` → invite/edit/remove controls hidden. This makes F6 (empty list), F10 (no
   invite button), and the masked F9 (pending section) all symptoms of F7.
   - Better Auth's catch-all does NOT serve `/api/auth/me` (its session route is
     `/api/auth/get-session`). The app's canonical server-side current-user primitive is
     `getCurrentUser()` in `lib/auth/current-user.ts` (LLD 3502 mandates
     `getCurrentUser() → setRlsContext() → queries`; canon references NO `/api/auth/me`).
2. **F6b — provisioning never seeds an `org_members` owner row.** `lib/auth/server.ts`
   `afterCreateOrganization` inserts organizations + users + reportTemplates + recordDataResidency,
   but NOT `org_members`. Grep = 0 for `orgMembers`/`org_members` in that file. Result: `org_members`
   has **0 rows across all orgs on BOTH DBs**. So even after F7 is fixed and the page reaches the
   members API, the API correctly returns `[]`. This is the SAME provisioning-gap class as DR-01
   (HIGH-02, residency writer) — table created + queried by S8 code, but the initial row never
   written on org creation.

## Canon basis
- Prototype `TeamManagement` always renders the current user's row (`isYou`) — owners MUST appear
  in the members list, which reads `org_members`. So the owner needs a seeded `org_members` row.
- 3-layer note (LLD 8626–8634): `org_members` is brand-scoped access ON TOP; `brand_access: null`
  = all brands. Seeding the owner with `role='owner'`, `brand_access=null` makes the owner appear
  AND have all-brand access — consistent with both the screen and the isolation model.
- `getCurrentUser()` returns the internal `users` row + `.organization` (userId, organizationId,
  and the org-level role). Confirm its exact return shape before shaping the route response.

## Task

### PART 1 — Build GET /api/auth/me (F7)

#### 1a — Confirm the exact getCurrentUser() shape + what the 3 pages destructure
```bash
cd c:/startup/VisibleAU/src
sed -n '1,80p' lib/auth/current-user.ts
grep -n "meRes\|/api/auth/me\|\.json()\|userId\|organizationId\|role\|orgId" \
  "app/(auth)/settings/team/page.tsx" \
  "app/(auth)/settings/audit-trail/page.tsx" \
  "app/(auth)/settings/data-residency/page.tsx"
```
Note the EXACT fields each page reads from the `/api/auth/me` response (e.g. `userId`,
`organizationId`/`orgId`, `role`). The route must return those field names verbatim.

#### 1b — Create `app/api/auth/me/route.ts`
A thin GET that wraps `getCurrentUser()` and returns the current user's identity + org + role in
the shape the pages expect:
```typescript
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  // Return the EXACT field names the 3 governance pages destructure (from 1a).
  // Example shape — ADAPT to match what the pages read:
  return NextResponse.json({
    userId: user.id,
    organizationId: user.organization.id,   // confirm the accessor from current-user.ts
    role: user.role,                          // org-level users.role (owner/admin/member)
    email: user.email,
    name: user.name ?? null,
  });
}
```
- Map the org-level `users.role` ('owner'|'admin'|'member') to what the page's `OrgRole`
  expects. The page defaults to `"viewer"`; canon's org roles are owner/admin/member. If the page
  treats `member` as analyst-equivalent (LLD 8654: "users.role='member' = analyst-equivalent"),
  map `member → analyst` so `canManage` is correct for owner/admin. Confirm the page's OrgRole
  union and map accordingly — do NOT invent a role the page can't handle.
- 401 (not 404) when unauthenticated. No RLS bypass; this only reads the caller's own identity.

### PART 2 — Seed the org_members owner row on provisioning (F6b)

#### 2a — Add the owner insert to the provisioning hook
In `lib/auth/server.ts` `afterCreateOrganization`, AFTER the organizations row AND the users row
are committed (the owner's internal `users.id` must exist — org_members FKs to users), insert:
```typescript
import { orgMembers } from "@/db/schema";   // confirm the export name
// … after org + user rows exist:
await db.insert(orgMembers).values({
  organizationId: orgRow.id,
  userId: userRow.id,          // the creating owner's internal users.id
  role: "owner",
  brandAccess: null,           // null = all brands
  acceptedAt: new Date(),      // owner is immediately active (not a pending invite)
  isActive: true,
  invitedBy: userRow.id,       // self / creator
}).onConflictDoNothing();      // idempotent — never duplicate the owner on re-provision
```
- Use `onConflictDoNothing()` on `UNIQUE(organization_id, user_id)` so re-runs are safe.
- Order matters: this MUST run after the users insert (FK dependency). Place it before or after
  recordDataResidency — both are post-user; keep them grouped.
- Wrap defensively like recordDataResidency (log + continue) so a member-seed failure can't roll
  back org creation, but log loudly.

#### 2b — One-time backfill for existing orgs (all 13 prod orgs have 0 members)
Provide a runnable backfill that, for every existing org, inserts an owner `org_members` row for
that org's owner. Determining "the owner" for an existing org: the `users` row for that org whose
org-level `users.role='owner'` (or the org creator). Reuse the same insert + `onConflictDoNothing`.
Run against BOTH `visibleau` (dev) and `visibleau_prod`.
```bash
# e.g. scripts/backfill-org-members-owner.mjs <conn> — mirror the residency backfill pattern.
```
If "owner" is ambiguous for some orgs (no users.role='owner'), REPORT those orgs rather than
guessing — do not seed a non-owner as owner.

### PART 3 — Verify (both DBs + on screen)

```bash
# org_members now has the owner for Metropolitan + every org:
for DB in visibleau visibleau_prod; do
  echo "=== $DB ==="
  psql "$<conn>" -c "
    SELECT om.role, om.is_active, om.brand_access, u.email
    FROM org_members om LEFT JOIN users u ON u.id=om.user_id
    WHERE om.organization_id='da1071de-6dbd-4e08-8f43-29f76c123be9';"
  psql "$<conn>" -c "SELECT count(DISTINCT organization_id) AS orgs_with_members, count(*) AS member_rows FROM org_members;"
done
# /api/auth/me now resolves:
# (load /settings/team in-app and watch the terminal)
```
EXPECT:
- Metropolitan has ≥1 `org_members` row: `role=owner`, `is_active=true`, `brand_access=null`.
- `orgs_with_members` = org count on each DB (not 0).
- Terminal shows `GET /api/auth/me 200` (not 404) on the Team page load.
- The Team screen shows the owner row (with the "you" badge), `1 member` (or the real count), and —
  because role now resolves to owner — the **Invite member** button appears and `canManage` is true.
- Idempotency: re-run the backfill → member counts unchanged (onConflictDoNothing held).

## Constraints
- F7 route returns 401 when unauthenticated, not 404. Field names MUST match what the 3 pages read
  (from step 1a) — a shape mismatch re-breaks the pages silently.
- Owner seed: `brand_access=null`, `accepted_at` set (owner is active, NOT a pending invite —
  do NOT leave accepted_at NULL or the owner shows as "pending"). `onConflictDoNothing` on
  UNIQUE(org,user).
- Do NOT write to Better Auth `auth_members` — org_members is the separate Phase 2 layer (LLD 8631).
- subscriptions.tier unchanged. Provisioning member-seed must not block org creation on failure.
- Do NOT touch the members API (`app/api/organizations/[orgId]/members/route.ts`) — the diagnosis
  confirmed it is correct; it was just returning [] because the table was empty.

## Report back (paste inline)
1. Part 1: the getCurrentUser() shape, the exact fields the 3 pages read, and the created
   `/api/auth/me/route.ts` response shape + the role mapping used.
2. Part 2: the provisioning insert diff + the backfill mechanism; any orgs where "owner" was
   ambiguous.
3. Part 3: the org_members dump + counts for BOTH DBs, the `GET /api/auth/me 200` terminal line,
   and the idempotency re-count.
