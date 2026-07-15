# VisibleAU — Verification Runbook: does a due schedule actually fire an audit?
**Launch-readiness check (Sprint 12 prep). Confirms scheduling's RUNTIME half — never observed yet.**
Mostly manual + a couple of SQL pokes. Do it in **dev, mock mode** (free). ~30–45 min.

---

## Why this exists
Scheduling's CONFIG half is verified (create/pause/resume/remove, both screens). What's NEVER been
seen work is the cron actually FIRING a due schedule. A schedule showing "Next run: tomorrow" is a
promise; this proves the system keeps it. On a product whose pitch is "scheduled recurring audits,"
a silently-non-firing schedule is the worst bug — the customer thinks they're monitored and aren't.

Two known footguns this also flushes out:
- the `'complete'` vs `'completed'` typo (if it's in the due-query or the fired audit's status path);
- idempotency (does a schedule double-fire on a retry / overlapping tick?).

---

## PART 0 — Confirm the cron is even BUILT (grep first; don't assume)
Sprint 9 GB3 SPECIFIES this cron, but "specified" ≠ "built correctly." Verify:
```bash
# (a) The file exists:
ls inngest/functions/audit-schedules-cron.ts

# (b) It's registered in the Inngest serve() array:
grep -rnE "auditSchedulesCron|audit-schedules-cron" app/api/inngest/route.ts inngest

# (c) The cron cadence + the DUE QUERY use the CORRECT status spelling ('active', and nextRunAt <= now):
grep -nE "cron:|'active'|nextRunAt|lte|checkQuota|audit/start|calculateNextRun|quota_exceeded" inngest/functions/audit-schedules-cron.ts

# (d) CRITICAL — confirm the due-query does NOT use the 'completed' typo anywhere, and uses 'active':
grep -nE "'completed'|status.*complete" inngest/functions/audit-schedules-cron.ts
```
**Expected:** file exists; registered; due-query filters `status = 'active'` AND `nextRunAt <= now()`;
fires `inngest.send({ name: 'audit/start', ... triggeredBy: 'schedule' })`; advances `nextRunAt` via
`calculateNextRun`; auto-pauses to `'quota_exceeded'` when `checkQuota` returns false.
**If (a)/(b) fail → the cron isn't built/registered → STOP, this becomes a build task, not a check.**
**If (d) finds a `'completed'` in the due-query → that's the footgun → it would match the WRONG rows;
flag it before proceeding.**

> Note: if the time-of-day enhancement has been applied later, the cadence will be hourly (`0 * * * *`)
> and the due-query/advance will use preferred-time logic. As of now it should be daily (`0 2 * * *`).
> Either way, the firing behaviour below is what matters.

---

## PART 1 — Set up a guaranteed-due schedule
1. In the UI (dev, mock, any Free/Agency org), create an **active** schedule on a brand with real
   audit history (e.g. Bondi). Confirm it shows on `/agency/schedules` as Active.
2. Note its id + brandId:
   ```sql
   SELECT id, brand_id, organization_id, status, frequency, next_run_at, last_run_at
   FROM audit_schedules WHERE status = 'active' ORDER BY created_at DESC LIMIT 1;
   ```
3. **Force it "due"** by backdating `next_run_at` to the past:
   ```sql
   UPDATE audit_schedules SET next_run_at = now() - interval '1 hour'
   WHERE id = '<schedule-id-from-step-2>';
   ```
   (Now `nextRunAt <= now()` so the cron's due-query will pick it up.)

---

## PART 2 — Fire the cron manually (don't wait for 02:00 UTC)
Use the **Inngest dev dashboard** (usually http://localhost:8288 when `npx inngest-cli dev` /
the inngest dev server is running alongside `pnpm dev`).
1. Find the **`audit-schedules-cron`** function in the dashboard.
2. **Invoke / trigger it manually** (Inngest dev UI has a "Run"/"Invoke" button for cron functions;
   or send its trigger event). This runs the function NOW.
3. Watch the run timeline: it should execute `load-due` (returns ≥1 schedule) then `process-<id>`.

> If you can't find a manual-invoke in the dashboard, alternative: temporarily change the cron to
> `* * * * *` (every minute), restart, wait one minute, watch it run, then REVERT to `0 2 * * *`.
> (Revert is mandatory — don't leave a per-minute cron.)

---

## PART 3 — Assert the firing behaviour (the actual proof)
After the manual trigger, verify ALL of these:

1. **An audit was fired for that brand.** A new audit row appears:
   ```sql
   SELECT id, brand_id, status, created_at, triggered_by
   FROM audits WHERE brand_id = '<brandId>' ORDER BY created_at DESC LIMIT 2;
   ```
   - Newest row is fresh (just now), and — if the schema has it — `triggered_by = 'schedule'`.
   - In mock mode it should progress to `status = 'complete'` (NOT `'completed'`) within seconds.
   - Confirm exactly ONE new audit was created (not zero, not several).

2. **`nextRunAt` advanced + `lastRunAt` set:**
   ```sql
   SELECT id, status, next_run_at, last_run_at FROM audit_schedules WHERE id = '<schedule-id>';
   ```
   - `last_run_at` ≈ now.
   - `next_run_at` moved to the FUTURE by one frequency interval (daily → ~+1 day). It is NO LONGER
     in the past — which is what prevents an immediate re-fire.
   - `status` still `'active'` (assuming quota wasn't exceeded).

3. **The schedule is no longer "due"** (this is the idempotency foundation):
   ```sql
   SELECT count(*) FROM audit_schedules
   WHERE status = 'active' AND next_run_at <= now() AND id = '<schedule-id>';
   -- expect 0 (it advanced past now)
   ```

## PART 4 — Idempotency / no double-fire
4. **Trigger the cron AGAIN immediately** (same manual invoke).
   - The schedule should NOT fire a second audit (its `next_run_at` is now in the future, so the
     due-query skips it). Re-run the audit-count query from PART 3.1 — still only the one new audit.
   - If a SECOND audit appears → idempotency bug: the cron isn't relying on `nextRunAt` correctly, or
     advances non-atomically. Flag it (this burns customer quota in prod).

## PART 5 — Quota-exceeded auto-pause (best-effort)
5. The cron is supposed to flip a schedule to `'quota_exceeded'` (not fire) when `checkQuota` returns
   false. Hard to force with low dev volume, so EITHER:
   - **(preferred)** confirm via a unit test that `checkQuota` returning false → cron sets
     `status='quota_exceeded'`, `pausedReason='Monthly audit quota reached'`, and does NOT send
     `audit/start`; OR
   - temporarily make `checkQuota` return false (or set the org's monthly count above its cap), force
     a due schedule, trigger the cron, and confirm:
     ```sql
     SELECT status, paused_reason FROM audit_schedules WHERE id = '<schedule-id>';
     -- expect status='quota_exceeded', paused_reason='Monthly audit quota reached'
     ```
     and that NO new audit row was created. Revert the temporary change after.
   - Report which method you used.

---

## What "PASS" looks like
- Cron is built + registered; due-query uses `'active'` + `nextRunAt <= now()`; no `'completed'` typo.
- Manual trigger fires exactly ONE audit for the due brand (`triggered_by='schedule'`, reaches
  `'complete'`).
- `nextRunAt` advances to the future, `lastRunAt` set, schedule stays `'active'`.
- Re-triggering does NOT double-fire (idempotent via advanced `nextRunAt`).
- Quota-exceeded path auto-pauses to `'quota_exceeded'` without firing (test or forced).

## If anything FAILS — capture for a fix prompt
- PART 0 fail (not built/registered, or `'completed'` in due-query) → cron build/fix needed.
- Fires ZERO audits despite a due schedule → due-query bug (status spelling? `lte` vs `lt`? timezone
  on `nextRunAt`?). Capture the `load-due` output from the Inngest run timeline.
- Double-fires → idempotency/atomicity bug in the advance step.
- Quota path doesn't pause → checkQuota wiring or the update branch.
Send: the PART 0 grep output, the Inngest run timeline (load-due result + process step), and the
before/after SQL for the schedule + audits. I'll write a scoped fix prompt per failure.

## Cleanup after
- Revert any temporary cron cadence change (back to `0 2 * * *`) or `checkQuota` change.
- Delete/reset the test schedule + any test audit rows so dev isn't cluttered.
