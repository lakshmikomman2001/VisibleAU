# VisibleAU Fix — Agency "Manage schedules" → org-level all-schedules page (Option B)
**Claude Code prompt — paste this whole file into a fresh Claude Code session on the VisibleAU repo.**

---

## Context (read before editing)

On the Agency dashboard (`/agency`), the **Scheduled Audits** card shows "0 active schedules
configured" and a **"Manage schedules"** link. Clicking it does NOT reach a working schedules
screen — it lands the user back on `/brands` (the link points at a route that either doesn't exist
or is a per-brand route missing its `brandId`, and the app's fallback bounces to `/brands`).

**Why there's no spec for this:** "Manage schedules" is a BUILD-stage addition. It is not in the
prototype (the prototype's `AgencyDashboard` has no Scheduled Audits card — only a dead, unwired
"Schedule weekly recurring audits" button in Bulk actions), not in any sprint prompt, and not in the
LLD. So we are DEFINING its behaviour now, consistent with canon.

**The decision (Option B):** "Manage schedules" opens a NEW **org-level all-schedules page** that
lists every brand's schedule in the org. This matches the org-level framing of the Scheduled Audits
card. It is backed by the **already-canonical** `GET /api/audit-schedules` endpoint (Sprint 9 GG2),
which returns all org schedules with brand name + domain joined. Per-brand editing remains at the
canonical `/brands/[brandId]/schedule` route (Sprint 9 §6).

**Canon facts this fix must honour (verify, don't trust this prompt — grep them):**
- `audit_schedules` columns: `id`, `organizationId`, `brandId`, `frequency`
  ('daily'|'weekly'|'3x_weekly'|'2x_daily'|'monthly'), `status`
  ('active'|'paused'|'quota_exceeded'), `nextRunAt`, `lastRunAt`, `pausedReason`, `updatedAt`,
  `createdAt`. (db/schema/audit-schedules.ts)
- `GET /api/audit-schedules` returns `{ schedules: [{ ...all auditSchedules columns, brandName,
  domain }] }`, RLS-scoped, ordered by brand name. (Sprint 9 GG2 — already built)
- `PATCH /api/audit-schedules/[id]` takes `{ status: 'active'|'paused', pausedReason?: string }`,
  returns the updated row or 404 cross-org. (Sprint 9 GE4 — already built)
- Tier ceiling: `TIER_AUDIT_LIMITS[tier].maxScheduled` — Free 0, Starter 1, Growth 1, Agency 5,
  Agency Pro 25. (lib/scheduling/tier-limits.ts)
- Agency surface is tier-gated to `['agency','agency_pro','enterprise']` (mirror `/agency/page.tsx`
  GB1 pattern).
- **No fabricated data.** "0 active schedules configured" must remain an HONEST empty state driven
  by the real query — never a fake row or placeholder count.

---

## STEP 0 — Investigate before changing anything (report findings, then proceed)

1. **Find the current "Manage schedules" link** and report its exact target. Search:
   ```bash
   grep -rniE "manage schedule" app components
   ```
   Report the file, and whether it is an `<a href=...>`, `next/link` `<Link href=...>`, a
   `router.push(...)`, or an `onClick`. Capture the literal destination string (e.g.
   `/brands/undefined/schedule`, `/agency/schedule`, `/schedule`, `/agency/schedules`, or `#`).

2. **Confirm the API endpoint exists and its shape:**
   ```bash
   ls app/api/audit-schedules/route.ts app/api/audit-schedules/\[id\]/route.ts
   grep -nE "getTableColumns|brandName|domain|innerJoin|NextResponse.json\(\{ schedules" app/api/audit-schedules/route.ts
   ```
   Report whether `GET` returns `{ schedules: [...] }` with `brandName` + `domain` joined as the
   GG2 spec requires. If the GET handler is missing or returns a different shape, say so — STEP 2
   depends on it.

3. **Confirm the per-brand schedule page status (for row links):**
   ```bash
   ls app/\(auth\)/brands/\[brandId\]/schedule/page.tsx 2>/dev/null && echo "EXISTS" || echo "MISSING"
   ```
   Report EXISTS/MISSING. The new page's row links target `/brands/{brandId}/schedule`; if MISSING,
   the links are still correct (that page is canonical, Sprint 9 §6) but note it so Sri knows the
   drill-in may 404 until that page is built. Do NOT build the per-brand page in this task.

4. **Confirm the agency dashboard component** that renders the Scheduled Audits card (likely
   `components/domain/agency/*` or inline in `app/(auth)/agency/`). Report the file + the exact
   card JSX so STEP 3 edits the right place.

5. **Confirm tier-gate + auth helpers** used by `/agency/page.tsx`:
   ```bash
   grep -nE "getCurrentUser|setRlsContext|TierGate|requiredTier|agency_pro|enterprise" app/\(auth\)/agency/page.tsx
   ```
   Reuse the SAME helpers and the SAME tier-gate list in the new page — do not invent new ones.

Report all five findings, then continue.

---

## STEP 1 — Confirm the GET endpoint (only if STEP 0.2 found it missing/wrong)

If STEP 0.2 showed `GET /api/audit-schedules` already returns `{ schedules: [...] }` with
`brandName`/`domain` — **skip this step entirely.** Do not rewrite a working endpoint.

If it is missing or returns a different shape, add/repair it to EXACTLY this canonical GG2 shape
(do not deviate):

```typescript
// app/api/audit-schedules/route.ts  (GET portion only — leave POST untouched if present)
import { getTableColumns, eq, asc } from 'drizzle-orm';
// ...existing imports: db, auditSchedules, brands, getCurrentUser, setRlsContext, NextResponse

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await setRlsContext(db, currentUser.organizationId);
  const schedules = await db
    .select({ ...getTableColumns(auditSchedules), brandName: brands.name, domain: brands.domain })
    .from(auditSchedules)
    .innerJoin(brands, eq(auditSchedules.brandId, brands.id))
    .where(eq(auditSchedules.organizationId, currentUser.organizationId))
    .orderBy(asc(brands.name));
  return NextResponse.json({ schedules });
}
```

---

## STEP 2 — Create the org-level schedules page

Create **`app/(auth)/agency/schedules/page.tsx`** — a server component that mirrors the
`/agency/page.tsx` (GB1) auth + tier-gate + RLS pattern EXACTLY, fetches all org schedules with
the brand join, and renders them. Use the project's existing UI primitives (PageShell, Card, Badge,
Btn — the same ones `AgencyDashboard`/`AgencyDashboardView` use); do not introduce new UI deps.

```tsx
// app/(auth)/agency/schedules/page.tsx — server component
// Mirror the GB1 /agency/page.tsx pattern for auth + tier gate + RLS.
import { redirect } from 'next/navigation';
import { eq, asc, getTableColumns } from 'drizzle-orm';
import { db } from '@/db';
import { auditSchedules } from '@/db/schema/audit-schedules';
import { brands } from '@/db/schema/brands';
import { getCurrentUser } from '@/lib/auth/get-current-user';   // match the import the repo actually uses
import { setRlsContext } from '@/lib/db/rls';                    // match the repo's helper path
import { TIER_AUDIT_LIMITS } from '@/lib/scheduling/tier-limits';
import { TierGate } from '@/components/domain/tier-gate';        // match the repo's TierGate path
import { AgencySchedulesView } from '@/components/domain/agency/agency-schedules-view';

export default async function AgencySchedulesPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/sign-in');
  if (!['agency', 'agency_pro', 'enterprise'].includes(currentUser.tier))
    return <TierGate requiredTier="agency" />;
  await setRlsContext(db, currentUser.organizationId);

  const schedules = await db
    .select({ ...getTableColumns(auditSchedules), brandName: brands.name, domain: brands.domain })
    .from(auditSchedules)
    .innerJoin(brands, eq(auditSchedules.brandId, brands.id))
    .where(eq(auditSchedules.organizationId, currentUser.organizationId))
    .orderBy(asc(brands.name));

  const maxScheduled = TIER_AUDIT_LIMITS[currentUser.tier as keyof typeof TIER_AUDIT_LIMITS]?.maxScheduled ?? 0;
  const activeCount = schedules.filter(s => s.status === 'active').length;

  return <AgencySchedulesView schedules={schedules} activeCount={activeCount} maxScheduled={maxScheduled} />;
}
```

Then create **`components/domain/agency/agency-schedules-view.tsx`** (client component — it owns
the pause/resume interaction). Requirements:

- **Breadcrumbs:** `['Agency workspace', 'Scheduled audits']` (match the AgencyDashboard breadcrumb
  style).
- **Header:** "Scheduled audits" + a subtitle showing `{activeCount} of {maxScheduled} schedules
  active` (real numbers from props).
- **HONEST empty state:** if `schedules.length === 0`, render an EmptyState card: "No schedules
  configured yet." + one line explaining that schedules run audits automatically per the brand's
  cadence, and (if `maxScheduled > 0`) a hint that they can add one from a brand's page. Do NOT
  fabricate rows. (This is the data-backed equivalent of the dashboard's "0 active schedules
  configured".)
- **Table (when non-empty):** one row per schedule with columns:
  - **Brand** — `brandName` (+ `domain` as a muted sub-line). Link the brand name to
    `/brands/${s.brandId}/schedule` (the canonical per-brand schedule page, Sprint 9 §6). Use
    `next/link`.
  - **Frequency** — humanise the enum: daily→"Daily", weekly→"Weekly", 3x_weekly→"3× weekly",
    2x_daily→"2× daily", monthly→"Monthly". Use a lookup map, not string munging.
  - **Status** — Badge: `active`→success "Active", `paused`→neutral "Paused",
    `quota_exceeded`→warning "Quota exceeded". When `paused` and `pausedReason` is set, show the
    reason as a muted sub-line.
  - **Next run** — `nextRunAt` formatted (e.g. `d MMM yyyy, h:mm a` via the repo's existing date
    util / date-fns). If status is not 'active', show "—".
  - **Last run** — `lastRunAt` formatted, or "Never".
  - **Actions** — a Pause/Resume control:
    - If `status === 'active'`: a "Pause" button → `PATCH /api/audit-schedules/${s.id}` with
      `{ status: 'paused' }`.
    - If `status === 'paused'`: a "Resume" button → `PATCH` with `{ status: 'active' }`.
    - If `status === 'quota_exceeded'`: no toggle (disabled/“—”) — quota state is system-managed,
      not user-togglable (it clears when the monthly quota resets / cron re-activates).
    - On success, update local row state (optimistic or refetch). On failure, surface a small inline
      error and revert. Use `router.refresh()` after a successful PATCH if simpler than local state.
- **Accessibility / standards:** the Pause/Resume control is a real `<button>` with an
  entity-specific `aria-label` (e.g. `Pause schedule for ${brandName}`). Mobile-responsive: the
  table should degrade to stacked rows on narrow screens (match how other agency tables in the repo
  handle this — do not introduce a fixed-width grid with no responsive variant). Loading + error
  states present.

Match the repo's actual import paths for `getCurrentUser`, `setRlsContext`, `TierGate`, the date
util, and UI primitives — the paths above are indicative; grep and use the real ones.

---

## STEP 3 — Wire the "Manage schedules" link to the new page

In the Scheduled Audits card (the file from STEP 0.1 / 0.4), change the "Manage schedules" control
so it navigates to **`/agency/schedules`**. Prefer `next/link`:

```tsx
// BEFORE (whatever STEP 0 found — e.g. a bare button, a # href, or /brands/.../schedule)
// AFTER
<Link
  href="/agency/schedules"
  className="…(keep existing classes)…"
>
  Manage schedules
</Link>
```

If the card is a server component and the surrounding markup makes a `<Link>` awkward, a plain
`<a href="/agency/schedules">` is acceptable. Do NOT use `router.push` from a server component.
Keep the existing "0 active schedules configured" text exactly as-is (it is the honest empty-state
summary and is driven by the dashboard's existing `scheduledUpcoming`/`upcomingSchedules` query).

---

## Constraints (must hold)

- **No new tables, no schema changes, no migrations.** `audit_schedules` already exists.
- **Reuse the canonical API** (`GET` + `PATCH /[id]`) — do not create a new schedules endpoint.
- **Reuse `getCurrentUser()` + `setRlsContext()` + the `['agency','agency_pro','enterprise']` tier
  gate** exactly as `/agency/page.tsx` does. Cross-org access must 404/empty, never leak.
- **No fabricated data** anywhere — counts and rows come only from the real query; empty stays empty.
- **No new dependencies.** Use existing UI primitives, date util, and icon set.
- **Per-brand `/brands/[brandId]/schedule` is out of scope** for this task — only link to it.
- TypeScript strict, no `any`. Match existing code/import patterns and design tokens.

---

## Verification (run and report results)

1. `pnpm typecheck` and `pnpm lint` — clean.
2. Route exists:
   ```bash
   ls app/\(auth\)/agency/schedules/page.tsx
   grep -nE "agency-schedules-view|AgencySchedulesView" app/\(auth\)/agency/schedules/page.tsx
   ```
3. Link is corrected (no stale target remains):
   ```bash
   grep -rniE "manage schedule" app components        # the hit(s) now point at /agency/schedules
   grep -rnE "/brands/\$\{?undefined|/brands//schedule|/agency/schedule\b" app components   # → no matches
   ```
4. Manual flow (dev, Agency-tier org — the current VisibleAU Dev org):
   - From `/agency`, click **Manage schedules** → lands on `/agency/schedules` (NOT `/brands`).
   - With 0 schedules: the honest empty state renders ("No schedules configured yet"), header shows
     "0 of 5 schedules active".
   - Create/seed one active schedule for a brand → it appears as a row with the brand name (linking
     to `/brands/{id}/schedule`), humanised frequency, Active badge, next-run date.
   - Click **Pause** → row flips to Paused (PATCH 200); **Resume** → flips back to Active. A bad
     `id` / cross-org PATCH returns 404 and the UI reverts.
5. Tier gate: a non-agency org hitting `/agency/schedules` directly sees `<TierGate>` (or is
   redirected), not the table.

When done, summarise: STEP 0 findings (especially the link's original target), which steps you
applied vs skipped (e.g. STEP 1 skipped because GET already correct), the files created/edited, and
the verification output.
