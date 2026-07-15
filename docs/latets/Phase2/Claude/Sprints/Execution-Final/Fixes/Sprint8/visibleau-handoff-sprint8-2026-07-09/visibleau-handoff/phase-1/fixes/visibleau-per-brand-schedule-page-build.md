# VisibleAU Build — Per-brand Audit Schedule page (`/brands/[brandId]/schedule`)
**Claude Code prompt — paste this whole file into a fresh Claude Code session on the VisibleAU repo.**

---

## Context (read before editing)

The org-level all-schedules page (`/agency/schedules`) is built and its empty state tells users to
"add a schedule from any brand's page under Audit Schedule." That per-brand page is **named in canon
(Sprint 9 §6: `/brands/[id]/schedule` UI for per-brand frequency + status) but never UI-specified,
and is not built.** Until it exists, no schedule can be created, so the org-level list can never
populate. This task BUILDS it and closes the loop.

**Canon status of the pieces (verify, don't trust this prompt — grep each):**
- ✅ `audit_schedules` table EXISTS (db/schema/audit-schedules.ts): `id`, `organizationId`,
  `brandId`, `frequency` ('daily'|'weekly'|'3x_weekly'|'2x_daily'|'monthly'), `status`
  ('active'|'paused'|'quota_exceeded'), `nextRunAt` (NOT NULL), `lastRunAt`, `pausedReason`,
  `updatedAt`, `createdAt`. Index on `(status, nextRunAt)`.
- ✅ `GET /api/audit-schedules` (list, GG2) and `PATCH /api/audit-schedules/[id]` (pause/resume, GE4)
  EXIST.
- ✅ `lib/scheduling/calculate-next-run.ts` → `calculateNextRun(frequency, from)` EXISTS (GC3).
- ✅ `lib/scheduling/quota-check.ts` → `checkQuota(orgId, brandId)` EXISTS (GD3).
- ✅ `lib/scheduling/tier-limits.ts` → `TIER_AUDIT_LIMITS` EXISTS. Per-tier:
  - free `{ frequency: 'manual', maxScheduled: 0 }`
  - starter `{ frequency: 'weekly', maxScheduled: 1 }`
  - growth `{ frequency: '3x_weekly', maxScheduled: 1 }`
  - agency `{ frequency: 'daily', maxScheduled: 5 }`
  - agency_pro `{ frequency: '2x_daily', maxScheduled: 25 }`
  - enterprise `{ frequency: 'daily', maxScheduled: Infinity }`
- ❌ `POST /api/audit-schedules` (create) — named in Sprint 9 ("GET list + POST create") but its body
  was NEVER specified. **This task defines it** (STEP 1).
- ❌ `DELETE /api/audit-schedules/[id]` — the route file `[id]/route.ts` is specced for "PATCH +
  DELETE" but only PATCH has a body. **This task adds DELETE** (STEP 1) so a schedule can be removed.
- ❌ The per-brand page UI — **this task builds it** (STEP 2 + 3). The prototype has NO reference for
  this screen (only a dead, unwired "Schedule weekly recurring audits" label), so build to the
  repo's existing brand-detail conventions and design tokens — do not invent a new visual language.

**Design rules derived from canon (these are the business logic — honour them exactly):**
1. **One schedule per brand.** A brand has at most one row in `audit_schedules`. Creating when one
   exists is an update, not a duplicate. Enforce with an upsert keyed on `brandId`
   (add a UNIQUE index if one isn't already present — see STEP 1 note).
2. **Frequency is tier-locked.** The only valid frequency for a schedule is
   `TIER_AUDIT_LIMITS[org.tier].frequency`. Do NOT let the user pick an arbitrary cadence — the UI
   shows the tier's cadence (e.g. Agency = "Daily") as the fixed frequency, and the API rejects any
   other value with 400. (Higher cadence is a paid-tier upgrade, not a per-schedule choice.)
3. **`maxScheduled` ceiling is per-org.** Before creating a NEW schedule (one that doesn't already
   exist for the brand), count the org's existing schedules; if `count >= maxScheduled`, reject with
   409 and a clear message ("You've reached your plan's limit of N scheduled audits — upgrade or
   remove one"). Free tier (`maxScheduled: 0`) can never create a schedule → 403/empty with an
   "Upgrade to schedule audits" CTA.
4. **`nextRunAt` on create** = `calculateNextRun(frequency, new Date())` (next interval from now).
   Reuse the canonical helper; do NOT hand-roll date math.
5. **No fabricated data.** Everything the page shows comes from the real row or the real brand. No
   placeholder schedules, no fake next-run dates.

---

## STEP 0 — Investigate before changing anything (report findings, then proceed)

1. **Per-brand page existence + brand-detail structure:**
   ```bash
   ls app/\(auth\)/brands/\[brandId\]/schedule/page.tsx 2>/dev/null && echo "EXISTS" || echo "MISSING"
   ls app/\(auth\)/brands/\[brandId\]/
   ```
   Report MISSING/EXISTS and list the sibling routes (so the new page matches their layout/shell).
   Open the brand-detail page (`app/(auth)/brands/[brandId]/page.tsx`) and report how it fetches the
   brand + how it renders any tabs/nav, so STEP 3 adds the entry point consistently.

2. **API surface:**
   ```bash
   sed -n '1,80p' app/api/audit-schedules/route.ts
   sed -n '1,80p' app/api/audit-schedules/\[id\]/route.ts
   ```
   Report: does `route.ts` already export `POST`? Does `[id]/route.ts` already export `DELETE`?
   Report the exact import style (db, schema, getCurrentUser, setRlsContext, NextResponse, zod).

3. **Confirm the canonical helpers exist and their signatures:**
   ```bash
   grep -nE "export (async )?function (calculateNextRun|checkQuota)" lib/scheduling/*.ts
   grep -nE "maxScheduled|frequency:" lib/scheduling/tier-limits.ts
   ```
   Report the exact exported names + the `TIER_AUDIT_LIMITS` shape. Reuse them; do NOT reimplement.

4. **UNIQUE index on brandId?**
   ```bash
   grep -nE "uniqueIndex|unique\(|brandId" db/schema/audit-schedules.ts
   ```
   Report whether a unique constraint on `brandId` (or `(organizationId, brandId)`) exists. If not,
   STEP 1 adds one (one schedule per brand).

5. **Auth + tier-gate pattern** used elsewhere for brand-scoped pages:
   ```bash
   grep -nE "getCurrentUser|setRlsContext|404|notFound|organizationId" app/\(auth\)/brands/\[brandId\]/page.tsx
   ```
   Reuse the SAME cross-org guard (brand not in org → `notFound()`/404, never 401-leak).

Report all five findings, then continue. Apply only the steps that are actually needed (e.g. skip
the DELETE addition if it already exists).

---

## STEP 1 — API: add `POST` create + `DELETE`, and a one-schedule-per-brand guard

### 1a. Migration (only if STEP 0.4 found no unique constraint on brandId)
Add a unique index so a brand can't accumulate duplicate schedules:
```typescript
// db/schema/audit-schedules.ts — add to the table's index callback:
brandUnique: uniqueIndex('audit_schedules_brand_unique_idx').on(t.brandId),
```
Generate + apply the migration with the repo's standard command (e.g. `pnpm drizzle-kit generate`
then the migrate step). If a constraint already exists, skip.

### 1b. `POST /api/audit-schedules` (create-or-update — body never specified in canon; define it now)
Add to `app/api/audit-schedules/route.ts` (leave the existing GET untouched):
```typescript
// Zod: { brandId: z.string().uuid() }
//   frequency is NOT accepted from the client — it is derived from the org tier (tier-locked).
import { z } from 'zod';
import { and, eq, ne, sql, count } from 'drizzle-orm';
import { TIER_AUDIT_LIMITS } from '@/lib/scheduling/tier-limits';
import { calculateNextRun } from '@/lib/scheduling/calculate-next-run';
// ...existing imports

const createSchema = z.object({ brandId: z.string().uuid() });

export async function POST(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await setRlsContext(db, currentUser.organizationId);

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const { brandId } = parsed.data;

  const limits = TIER_AUDIT_LIMITS[currentUser.tier as keyof typeof TIER_AUDIT_LIMITS];
  if (!limits || limits.maxScheduled === 0)
    return NextResponse.json({ error: 'Your plan does not include scheduled audits.' }, { status: 403 });

  const frequency = limits.frequency; // tier-locked cadence (e.g. agency → 'daily')

  // Brand must belong to the org (RLS + explicit check → 404 on cross-org):
  const [brand] = await db.select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.organizationId, currentUser.organizationId)));
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Existing schedule for this brand? (one-per-brand → update it)
  const [existing] = await db.select({ id: auditSchedules.id })
    .from(auditSchedules)
    .where(and(eq(auditSchedules.brandId, brandId),
               eq(auditSchedules.organizationId, currentUser.organizationId)));

  if (!existing) {
    // NEW schedule — enforce per-org maxScheduled ceiling:
    if (Number.isFinite(limits.maxScheduled)) {
      const [{ c }] = await db.select({ c: count() })
        .from(auditSchedules)
        .where(eq(auditSchedules.organizationId, currentUser.organizationId));
      if (c >= limits.maxScheduled)
        return NextResponse.json(
          { error: `You've reached your plan's limit of ${limits.maxScheduled} scheduled audits. Remove one or upgrade.` },
          { status: 409 });
    }
    const [created] = await db.insert(auditSchedules).values({
      organizationId: currentUser.organizationId,
      brandId,
      frequency,
      status: 'active',
      nextRunAt: calculateNextRun(frequency, new Date()),
    }).returning();
    return NextResponse.json(created, { status: 201 });
  }

  // Existing → re-activate / refresh cadence (tier may have changed):
  const [updated] = await db.update(auditSchedules)
    .set({ frequency, status: 'active', pausedReason: null,
           nextRunAt: calculateNextRun(frequency, new Date()), updatedAt: new Date() })
    .where(and(eq(auditSchedules.id, existing.id),
               eq(auditSchedules.organizationId, currentUser.organizationId)))
    .returning();
  return NextResponse.json(updated);
}
```

### 1c. `DELETE /api/audit-schedules/[id]` (only if STEP 0.2 found it missing)
Add to `app/api/audit-schedules/[id]/route.ts` (leave the existing PATCH untouched):
```typescript
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await setRlsContext(db, currentUser.organizationId);
  const [deleted] = await db.delete(auditSchedules)
    .where(and(eq(auditSchedules.id, params.id),
               eq(auditSchedules.organizationId, currentUser.organizationId)))
    .returning({ id: auditSchedules.id });
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

---

## STEP 2 — Page: `app/(auth)/brands/[brandId]/schedule/page.tsx` (server component)

Mirror the brand-detail page's auth + brand fetch + cross-org 404 pattern (from STEP 0.1/0.5). It
must: resolve the brand (404 if not in org), read the org tier limits, load the brand's existing
schedule (if any), and render a client view. Use the same PageShell/Card primitives as the rest of
`/brands/[brandId]/*`.

```tsx
// app/(auth)/brands/[brandId]/schedule/page.tsx — server component
import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { brands } from '@/db/schema/brands';
import { auditSchedules } from '@/db/schema/audit-schedules';
import { getCurrentUser } from '@/lib/auth/get-current-user';   // use the repo's real path
import { setRlsContext } from '@/lib/db/rls';                    // use the repo's real path
import { TIER_AUDIT_LIMITS } from '@/lib/scheduling/tier-limits';
import { BrandScheduleView } from '@/components/domain/brands/brand-schedule-view';

export default async function BrandSchedulePage({ params }: { params: { brandId: string } }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/sign-in');
  await setRlsContext(db, currentUser.organizationId);

  const [brand] = await db.select({ id: brands.id, name: brands.name, domain: brands.domain })
    .from(brands)
    .where(and(eq(brands.id, params.brandId), eq(brands.organizationId, currentUser.organizationId)));
  if (!brand) notFound();

  const [schedule] = await db.select().from(auditSchedules)
    .where(and(eq(auditSchedules.brandId, brand.id),
               eq(auditSchedules.organizationId, currentUser.organizationId)));

  const limits = TIER_AUDIT_LIMITS[currentUser.tier as keyof typeof TIER_AUDIT_LIMITS]
    ?? { frequency: 'manual', maxScheduled: 0 };

  return <BrandScheduleView brand={brand} schedule={schedule ?? null}
            tierFrequency={limits.frequency} maxScheduled={limits.maxScheduled} tier={currentUser.tier} />;
}
```

Also add `app/(auth)/brands/[brandId]/schedule/loading.tsx` — a skeleton (one Card placeholder),
matching the repo's existing `loading.tsx` pattern for brand routes (BK3 convention).

---

## STEP 3 — Client view: `components/domain/brands/brand-schedule-view.tsx`

A `'use client'` component. Requirements:

- **Breadcrumbs / header:** brand name + "Audit schedule" subtitle. Show the brand's domain muted.
- **If `maxScheduled === 0` (Free):** render an upgrade state — "Scheduled audits are available on
  Agency plans" + a link to `/billing` or `/agency` (match how other tier-gated CTAs link in the
  repo). No form. Stop here.
- **If no schedule yet (`schedule === null`):**
  - A short explainer: "Run an automatic audit for {brand.name} on a recurring schedule."
  - **Frequency** shown as a fixed, tier-locked value — display the humanised `tierFrequency`
    (daily→"Daily", weekly→"Weekly", 3x_weekly→"3× weekly", 2x_daily→"2× daily") as read-only text
    or a disabled select with the single option. Make clear it's set by their plan ("Your {tier}
    plan runs audits {humanised}"). Do NOT offer a free choice of cadence.
  - A **"Create schedule"** primary button → `POST /api/audit-schedules` with `{ brandId }`.
    On 201: re-render in the "active schedule" state (refetch or `router.refresh()`).
    On 403/409: surface the API's error message inline (plan limit / no schedule on plan).
- **If a schedule exists:** show a status card:
  - **Status** badge (active→success "Active", paused→neutral "Paused", quota_exceeded→warning
    "Quota exceeded"; show `pausedReason` muted when present).
  - **Frequency** (humanised), **Next run** (`nextRunAt` formatted via the repo's date util; "—" if
    not active), **Last run** (`lastRunAt` or "Never").
  - **Pause/Resume** button → `PATCH /api/audit-schedules/{id}` `{ status: 'paused' | 'active' }`
    (no toggle when `quota_exceeded` — system-managed).
  - **Remove schedule** (destructive) → `DELETE /api/audit-schedules/{id}`, with a confirm step.
    On success, return to the "no schedule" state.
- **Standards:** all actions are real `<button>`s with entity-specific `aria-label`s (e.g.
  `Pause audit schedule for ${brand.name}`). Loading + error states on every mutation. Optimistic
  update with revert-on-failure, or `router.refresh()` after success. Mobile-responsive; design
  tokens only; TypeScript strict, no `any`.

Use the repo's real import paths for `getCurrentUser`, `setRlsContext`, the date util, UI primitives,
and icons (grep — the paths above are indicative).

---

## STEP 4 — Wire the entry point on the brand-detail page

On the brand-detail page (`app/(auth)/brands/[brandId]/page.tsx` or its tab/nav component from STEP
0.1), add an **"Audit Schedule"** entry point (tab, nav link, or card — match the existing pattern)
linking to `/brands/${brandId}/schedule` via `next/link`. Label it "Audit Schedule" so it matches
the org-level empty-state copy ("…under Audit Schedule"). Keep cross-org safety intact.

---

## Constraints (must hold)

- **Reuse canon helpers** `calculateNextRun` (GC3) and `checkQuota` (GD3) — do NOT reimplement date
  math or quota logic. (checkQuota is used by the cron at run-time; the page's create path enforces
  the *maxScheduled* ceiling, which is a different limit — schedule count vs monthly audit count.)
- **Frequency is tier-locked** (`TIER_AUDIT_LIMITS[tier].frequency`); the API rejects any other
  value. The UI never offers a free cadence choice.
- **One schedule per brand** (unique index + upsert). No duplicate rows.
- **Cross-org → 404** everywhere (brand fetch + all schedule mutations). Never leak via 401.
- `getCurrentUser()` + `setRlsContext()` on every server entry.
- **No fabricated data.** Empty stays empty; all values from real rows.
- **No new dependencies.** Existing UI primitives, date util, icons. No schema changes beyond the
  optional `brandId` unique index in STEP 1a.
- Do NOT touch the cron (`audit-schedules-cron.ts`), the org-level `/agency/schedules` page, or the
  existing GET/PATCH bodies.

---

## Verification (run and report results)

1. `pnpm typecheck` and `pnpm lint` — clean.
2. Routes exist:
   ```bash
   ls app/\(auth\)/brands/\[brandId\]/schedule/page.tsx app/\(auth\)/brands/\[brandId\]/schedule/loading.tsx
   grep -nE "export (async )?function (POST)" app/api/audit-schedules/route.ts
   grep -nE "export (async )?function (DELETE)" app/api/audit-schedules/\[id\]/route.ts
   ```
3. One-per-brand + tier lock guards present:
   ```bash
   grep -nE "audit_schedules_brand_unique_idx|maxScheduled|limits.frequency" db/schema/audit-schedules.ts app/api/audit-schedules/route.ts
   ```
4. Manual flow (dev, Agency-tier org = VisibleAU Dev, which has 3 brands):
   - Open a brand → click **Audit Schedule** → lands on `/brands/{brandId}/schedule`.
   - No schedule yet: frequency shows "Daily" as the fixed plan cadence; click **Create schedule**
     → 201, view flips to an Active schedule with a real Next-run date (~tomorrow).
   - Go to `/agency/schedules` → the brand now appears as an **Active / Daily** row (loop closed).
   - Back on the brand page: **Pause** → Paused; **Resume** → Active; **Remove** → confirms, returns
     to the empty "Create schedule" state, and the row disappears from `/agency/schedules`.
   - Create schedules on enough brands to hit the Agency ceiling (5): the 6th create attempt returns
     409 with the plan-limit message. (Only 3 brands exist, so verify the count guard via a unit
     test or by temporarily checking the 409 path — note this in your report.)
   - A Free-tier org (or simulate one) sees the "Scheduled audits are available on Agency plans"
     upgrade state, no form; a direct `POST` returns 403.
   - Cross-org: hitting `/brands/{someOtherOrgBrandId}/schedule` → 404; a PATCH/DELETE with a
     foreign `id` → 404.

When done, summarise: STEP 0 findings, which steps applied vs skipped (e.g. DELETE already existed),
files created/edited, the migration (if added), and the verification output — especially confirming
the create→list→pause→remove loop works end to end.
