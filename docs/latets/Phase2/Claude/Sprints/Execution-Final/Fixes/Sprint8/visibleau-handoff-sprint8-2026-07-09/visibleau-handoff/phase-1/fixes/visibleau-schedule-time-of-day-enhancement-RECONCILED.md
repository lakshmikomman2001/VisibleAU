# ⚠️ RECONCILIATION NOTE (read first — added after the runs-per-prompt work)
This prompt was written earlier this session. Since then, two things changed that you must keep in
mind while applying it:

1. **Runs-per-prompt is now env-configurable** (`runsForTier()` reads `TIER_RUNS_*`, clamped 1–5;
   `TIER_RUNS_FREE=3` is set). This prompt does NOT change runs-per-prompt — leave that alone. It only
   adds a per-schedule TIME-OF-DAY. The two are independent: runs = how many samples per prompt; this
   = what hour the scheduled audit fires.
2. **The cron currently fires daily at `0 2 * * *`** (confirmed still true on disk). This prompt
   changes it to hourly (`0 * * * *`) so a user-chosen hour can be honoured — that's the core of the
   change and is still correct.

Everything below is otherwise accurate against current canon (cron cadence, `calculateNextRun`
signature, region enum `'au'` default all re-verified). One scope reminder: this is a LARGER change
than a UI tweak — schema migration + DST-correct time math + cron change + UI + a required DST unit
test. Do it carefully; verify against a restarted server.

---

# VisibleAU Enhancement — Per-schedule time-of-day for audit schedules (Option 1)
**Claude Code prompt — paste this whole file into a fresh Claude Code session on the VisibleAU repo.**

---

## What this builds (and the ONE rule that governs it)

Today, creating a schedule sets `nextRunAt = now + interval` and the cron runs once daily at 02:00
UTC. The user has no control over *when in the day* an audit runs, and the displayed time
(e.g. "6:26 AM") is just an artifact of when they clicked create.

This enhancement lets the user pick a **time of day** (hour + minute, in their local AU timezone)
**per schedule**. The recurrence DATE is still governed by `frequency` (daily/weekly/etc.), which is
tier-locked and unchanged — so there is **no calendar/date picker**; the control is a **time
picker** plus a read-only frequency line.

**THE GOVERNING RULE (this is a trust product — do not violate it):** a control must never promise
precision the backend can't keep. The current daily-02:00-UTC cron can only fire once a day, so a
time picker would be decorative and misleading. Therefore this prompt **also changes the cron to run
hourly** so a user-chosen hour is actually honoured. Precision is "within the hour the user picked"
— that is honest and is stated in the UI. Do NOT ship the picker without the cron change; a
time picker over a once-daily cron is a lie.

**Timezone (read carefully — this is where these features usually break):**
- Orgs have a `region` enum (`au|nz|uk|us|eu|ca`, default `au`). There is **no per-org timezone
  column** and you must NOT add one. Derive the IANA zone from `region` via a small map
  (`au → 'Australia/Sydney'`, `nz → 'Pacific/Auckland'`, `uk → 'Europe/London'`,
  `us → 'America/New_York'`, `eu → 'Europe/Berlin'`, `ca → 'America/Toronto'`).
- The user picks a **local** time (e.g. 3:00 PM Sydney). Store the intent as local **hour+minute**,
  and compute `nextRunAt` (a UTC timestamp) from {next valid local date for the frequency, chosen
  local hour:minute, org IANA zone}. This MUST be DST-correct (Sydney is UTC+10 in winter / UTC+11
  in daylight time). Use a DST-aware library — see deps below.
- **Note / do not copy a latent bug:** the existing `weekly-digest-cron` comment says
  "Mon 23:00 UTC = Tue 09:00 AEST" — that is only true during AEDT; during AEST it's 10:00. Do NOT
  replicate fixed-offset math anywhere in this feature. Always go through the IANA zone.

---

## Dependencies

You need DST-correct zoned time math. Check what's already in the repo first:
```bash
grep -nE "date-fns-tz|luxon|dayjs|@js-joda" package.json
```
- If `date-fns` is already used (it is — `calculate-next-run.ts` imports it), add **`date-fns-tz`**
  (`fromZonedTime`, `toZonedTime`) — smallest, consistent with existing code.
- If `luxon` is already present, use it instead (don't add a second tz lib).
Add the lib only after confirming it's not already there. No other new deps.

---

## STEP 0 — Investigate before changing anything (report findings, then proceed)

```bash
# 1. The schedule schema (column to add):
sed -n '1,40p' db/schema/audit-schedules.ts

# 2. The create/update path (POST) and PATCH:
grep -nE "calculateNextRun|nextRunAt|frequency|TIER_AUDIT_LIMITS" app/api/audit-schedules/route.ts app/api/audit-schedules/\[id\]/route.ts

# 3. calculateNextRun (will be extended to anchor to a local time):
cat lib/scheduling/calculate-next-run.ts

# 4. The cron (cadence will change daily→hourly):
cat inngest/functions/audit-schedules-cron.ts

# 5. The per-brand schedule UI (where the picker goes):
cat app/\(auth\)/brands/\[brandId\]/schedule/brand-schedule-view.tsx
cat app/\(auth\)/brands/\[brandId\]/schedule/page.tsx

# 6. How org region is available to server code (for tz derivation):
grep -rnE "region" lib/auth/*.ts app/\(auth\)/brands/\[brandId\]/schedule/page.tsx | head
grep -nE "region" db/schema/*.ts | head

# 7. Existing date util / formatting helper (reuse for display):
grep -rnE "format\(|date-fns|formatInTimeZone|toLocaleString" lib | head
```
Report: the exact `audit_schedules` columns; whether `getCurrentUser()` exposes `region` (if not,
how to fetch the org's region in the page + cron); the current `calculateNextRun` signature; the
current cron cadence string; and the UI component's create-form structure. Then proceed, applying
only what's needed.

---

## STEP 1 — Schema: add local time-of-day columns

In `db/schema/audit-schedules.ts`, add two columns (store the user's chosen LOCAL wall-clock time;
`nextRunAt` remains the computed UTC threshold):
```typescript
// Local wall-clock time-of-day the user chose, in the org's region timezone.
// nextRunAt (UTC) is derived from these + frequency + org IANA zone (DST-correct).
preferredHour:   integer('preferred_hour').notNull().default(2),    // 0–23, local
preferredMinute: integer('preferred_minute').notNull().default(0),  // 0–59, local
```
Rationale for default 2: preserves today's "early morning" behaviour for any pre-existing rows
(02:00) without a data backfill. Existing rows simply adopt 02:00 local going forward.

Generate + apply a **proper Drizzle migration** (do NOT hand-apply raw SQL — prod must get this):
```bash
pnpm drizzle-kit generate
# then the repo's migrate step (e.g. pnpm drizzle-kit migrate / the project's migrate script)
```
Report the generated migration filename.

> NOTE — also fix a known gap from the prior schedule build: the `audit_schedules_brand_unique_idx`
> unique index was previously applied to dev via raw SQL with **no migration file**. While you are
> generating this migration, confirm that unique index is present in `db/schema/audit-schedules.ts`
> and is captured by `drizzle-kit generate` so prod gets BOTH the unique index and the new columns.
> If the index is in the schema file, this generate will include it. Report whether it did.

---

## STEP 2 — Timezone helper

Create `lib/scheduling/region-timezone.ts`:
```typescript
// Maps the org region enum to an IANA timezone. v1 is AU-first; all 6 regions mapped for readiness.
export const REGION_TIMEZONE: Record<string, string> = {
  au: 'Australia/Sydney',
  nz: 'Pacific/Auckland',
  uk: 'Europe/London',
  us: 'America/New_York',
  eu: 'Europe/Berlin',
  ca: 'America/Toronto',
};
export function tzForRegion(region: string | null | undefined): string {
  return REGION_TIMEZONE[region ?? 'au'] ?? 'Australia/Sydney';
}
```

---

## STEP 3 — `calculateNextRun`: anchor to the chosen local time (DST-correct)

Extend `lib/scheduling/calculate-next-run.ts` so the next run lands on the chosen local hour:minute
in the org's zone, then converts to UTC. Keep the old interval logic for the DATE step; add the
time anchoring. Do NOT break the existing call sites — make the new params optional and provide an
overload/default so any caller not yet passing tz/time still compiles (then update the real callers
in STEP 4/5).

```typescript
import { addDays, addHours, addMonths } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export interface NextRunOpts {
  timeZone: string;        // IANA, from tzForRegion(org.region)
  preferredHour: number;   // 0–23 local
  preferredMinute: number; // 0–59 local
}

// Backwards-compatible: if opts omitted, behaves like the old interval-only version.
export function calculateNextRun(frequency: string, from: Date, opts?: NextRunOpts): Date {
  // 1) advance the DATE by the frequency interval (unchanged semantics):
  let next: Date;
  switch (frequency) {
    case 'daily':     next = addDays(from, 1); break;
    case 'weekly':    next = addDays(from, 7); break;
    case '3x_weekly': next = addDays(from, Math.ceil(7 / 3)); break;
    case '2x_daily':  next = addHours(from, 12); break;   // 2x_daily keeps interval semantics (see note)
    case 'monthly':   next = addMonths(from, 1); break;
    default:          next = addDays(from, 7);
  }
  if (!opts) return next;

  // 2) for cadences that have ONE run per day, pin to the chosen local time-of-day:
  //    (2x_daily is excluded — it runs every 12h; pinning to one clock time would drop a run.)
  if (frequency === '2x_daily') return next;

  // Express `next` in the org's local zone, set the chosen wall-clock time, convert back to UTC:
  const local = toZonedTime(next, opts.timeZone);
  local.setHours(opts.preferredHour, opts.preferredMinute, 0, 0);
  return fromZonedTime(local, opts.timeZone); // DST-correct UTC instant
}

// Helper for the CREATE path: the FIRST run should be the next future occurrence of the chosen
// local time (today if it hasn't passed yet, else tomorrow), respecting frequency for non-daily.
export function firstRunAt(frequency: string, now: Date, opts: NextRunOpts): Date {
  const localNow = toZonedTime(now, opts.timeZone);
  const todayAtTime = new Date(localNow);
  todayAtTime.setHours(opts.preferredHour, opts.preferredMinute, 0, 0);
  // If today's chosen time is still in the future, first run is today; otherwise advance by frequency.
  if (todayAtTime > localNow) return fromZonedTime(todayAtTime, opts.timeZone);
  return calculateNextRun(frequency, fromZonedTime(todayAtTime, opts.timeZone), opts);
}
```
> `2x_daily` note: it runs every 12h by interval, so a single time-of-day doesn't apply cleanly. For
> `2x_daily`, the UI should DISABLE the time picker and show "Runs every 12 hours" (Agency Pro only).
> For all single-per-day cadences (daily/weekly/3x_weekly/monthly — Agency is daily), the time picker
> is active. State this in the UI (STEP 5).

---

## STEP 4 — API: accept + validate the chosen time

In `app/api/audit-schedules/route.ts` (POST create-or-update) and
`app/api/audit-schedules/[id]/route.ts` (PATCH), accept `preferredHour` + `preferredMinute`:

- **Zod:** `preferredHour: z.number().int().min(0).max(23)`,
  `preferredMinute: z.number().int().min(0).max(59)`. Optional on PATCH (time-only edit allowed),
  required-with-default on create (default 2 / 0 if the client omits — but the UI always sends them).
- Derive the org timezone server-side: fetch `organizations.region` for `currentUser.organizationId`
  (or read `currentUser.region` if STEP 0.6 showed it's already on the session), then
  `tzForRegion(region)`.
- On **create**, set `nextRunAt = firstRunAt(frequency, new Date(), { timeZone, preferredHour,
  preferredMinute })` and persist `preferredHour`/`preferredMinute`. Keep the tier-lock, one-per-brand
  upsert, and `maxScheduled` ceiling exactly as they are.
- On **PATCH** time edits, recompute `nextRunAt = firstRunAt(...)` with the new time so the change
  takes effect from the next occurrence (don't wait a full cycle). Pause/resume PATCH behaviour is
  unchanged; when resuming, recompute `nextRunAt` from the stored preferred time too.
- **Frequency stays tier-locked and client-rejected if mismatched** — unchanged.

Do NOT accept a timezone or a date from the client. TZ is derived from region; date is derived from
frequency. The only new client input is hour + minute.

---

## STEP 5 — UI: a time picker to the design standards, with honest framing

In `app/(auth)/brands/[brandId]/schedule/brand-schedule-view.tsx`:

**Create state (no schedule yet):**
- Keep the read-only tier-locked **Frequency** line ("Daily — Your Agency plan runs audits daily").
- Add a **time-of-day picker** labelled clearly, e.g. "Run at" with helper text naming the zone:
  "Time shown in Sydney time (AEST/AEDT)". Resolve the zone label from the org region (pass the
  region/zone from the server component as a prop — do not hardcode "Sydney" in the component;
  derive the human label from the same `tzForRegion`/region the page already knows).
- **Picker design (meet the bar — accessible, mobile-first, not a raw `<input type=time>` dump):**
  - Provide an **hour** control + **minute** control. Minutes constrained to sensible steps
    (00/15/30/45) to avoid false precision — the cron is hourly, so sub-hour minutes are a display
    nicety, not a guarantee; surface this honestly (see microcopy). Acceptable implementations:
    two native `<select>`s styled with the repo's tokens, or the repo's existing Select primitive
    (shadcn/ui Select if present). A 12-hour AM/PM presentation is fine for AU users; store 24h.
  - Real `<label for>` / `aria-label` on every control; keyboard-operable; visible focus ring;
    44px min touch targets on mobile; tokens only (no ad-hoc colors). Loading + error states on save.
  - **Honest microcopy under the picker:** "Audits run within the hour you choose." (Because the
    scheduler checks hourly.) This is required — it keeps the control truthful.
- **Create schedule** button → POST with `{ brandId, preferredHour, preferredMinute }`.

**Active/paused state (schedule exists):**
- Show **Run at** as a row alongside Frequency/Next run/Last run, formatted in the org zone
  (e.g. "3:00 PM (AEST)") using `formatInTimeZone` from date-fns-tz (or the repo's date util with the
  zone). `nextRunAt` continues to display the real next UTC instant rendered in local zone.
- Add an **Edit time** affordance (inline edit or a small form) → PATCH
  `{ preferredHour, preferredMinute }`; on success, Next run updates to reflect the new time. Keep
  Pause/Resume/Remove unchanged.
- For **2x_daily** (Agency Pro): disable the picker, show "Runs every 12 hours" instead of a time.

**The org-level `/agency/schedules` list:** add the **Run at** value to each row (local zone), so the
portfolio view shows when each brand runs. Reuse the same formatter. (Edit/remove still happen on the
per-brand page; the list stays read-only + pause/resume as today.)

---

## STEP 6 — Cron: daily → hourly (the change that makes the picker honest)

In `inngest/functions/audit-schedules-cron.ts`, change the schedule from daily 02:00 UTC to
**hourly**:
```typescript
// BEFORE: { cron: '0 2 * * *' }   // 02:00 UTC daily
// AFTER:  { cron: '0 * * * *' }    // top of every hour, UTC
```
The body's "due" logic is unchanged in principle — it still loads active schedules where
`nextRunAt <= now()` and fires them — but because it now runs every hour, a schedule whose
`nextRunAt` was anchored to (say) 3:00 PM Sydney will be picked up in the 3-something UTC-equivalent
hour rather than waiting for a single daily tick. After firing, advance with the time-anchored
`calculateNextRun(frequency, lastRunAt, { timeZone: tzForRegion(org.region), preferredHour,
preferredMinute })` — which means the cron now needs each schedule's `preferredHour`/`preferredMinute`
and the org region in its `load-due` select (add those columns + a join to `organizations.region`).
Keep: no `setRlsContext` in the cron (it runs as system, as documented), the quota check, and the
auto-pause-on-`quota_exceeded` behaviour.

**Idempotency guard (important now that it runs 24×/day):** ensure a schedule can't double-fire
within its interval. The existing `nextRunAt <= now()` + advancing `nextRunAt` after firing handles
this, but verify the advance happens in the SAME step that fires (or transactionally) so a retry
can't fire twice. If the current code fires then advances in separate non-atomic steps, tighten it
(advance `nextRunAt` first/optimistically, or use a guard column) and note what you changed.

---

## Constraints (must hold)

- **Cron MUST change to hourly** in the same change as the picker. Never ship the picker over the
  daily cron.
- **No timezone or date input from the client.** TZ derived from `organizations.region`; date from
  `frequency`. Only hour+minute are user input.
- **DST-correct** via IANA zone (date-fns-tz / luxon). No fixed-offset math anywhere. Do not copy the
  digest cron's "= 09:00 AEST" fixed-offset comment.
- **Frequency stays tier-locked**; `maxScheduled` ceiling, one-per-brand upsert, cross-org 404,
  `getCurrentUser()` + `setRlsContext()` (except the system cron) — all unchanged.
- **Proper Drizzle migration** for the new columns (and confirm the prior unique index is captured) —
  no raw-SQL-to-dev-only. Prod parity is required.
- **No fabricated data.** All times shown are real stored/derived values.
- **Accessibility + mobile-responsive + loading/error states** on the picker — first-class, per
  project standards. TypeScript strict, no `any`. Design tokens only.
- Do NOT touch unrelated crons, the scoring path, or Phase 2.

---

## Verification (run and report results)

1. `pnpm typecheck` + `pnpm lint` clean.
2. Migration exists and includes the new columns (+ the unique index):
   ```bash
   ls drizzle/  # or the repo's migrations dir — newest file is the one generated
   grep -rnE "preferred_hour|preferred_minute|audit_schedules_brand_unique_idx" drizzle/
   ```
3. Cron cadence changed:
   ```bash
   grep -nE "cron: '0 \* \* \* \*'|0 2 \* \* \*" inngest/functions/audit-schedules-cron.ts   # expect the hourly one
   ```
4. DST correctness (unit test — REQUIRED, since it can't be eyeballed):
   - Add a Vitest in `lib/scheduling/__tests__/calculate-next-run.test.ts`:
     - daily @ 15:00 `Australia/Sydney` in **January** (AEDT, UTC+11) → `nextRunAt` UTC hour == 04:00.
     - daily @ 15:00 `Australia/Sydney` in **July** (AEST, UTC+10) → `nextRunAt` UTC hour == 05:00.
     - `firstRunAt`: if local now is 14:00 and chosen 15:00 → first run is **today** 15:00 local;
       if local now is 16:00 and chosen 15:00 → first run is **tomorrow** 15:00 local.
   - Report the assertions pass. This proves the picker isn't lying.
5. Manual (dev, Agency org, Bondi):
   - Brand → Audit Schedule → pick **3:00 PM**, Create → card shows **Run at 3:00 PM (AEST/AEDT)**
     and **Next run** = the correct local 3:00 PM rendered date (today if before 3 PM, else tomorrow).
   - `/agency/schedules` shows the **Run at** column for Bondi.
   - **Edit time** to 6:00 AM → Next run updates accordingly.
   - Pause → Next run "—"; Resume → recomputes from 6:00 AM.
6. Cron smoke (optional but recommended — proves the hourly pickup): trigger
   `audit-schedules-cron` manually via the Inngest dev dashboard with a schedule whose `nextRunAt`
   is set to a moment in the past; confirm it fires `audit/start` once and advances `nextRunAt` to
   the next local-3PM (or chosen time), not double-firing on a second manual trigger.

When done, summarise: STEP 0 findings, steps applied vs skipped, the migration filename, the cron
change, the DST test results, and the manual-flow outcome — explicitly confirming the picker's chosen
time drives `nextRunAt` and that the cron is now hourly.
