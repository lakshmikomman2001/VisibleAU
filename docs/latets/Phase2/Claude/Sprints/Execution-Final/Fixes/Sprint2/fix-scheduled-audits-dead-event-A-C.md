# Claude Code — FIX (urgent): scheduled audits never fire — dead `audit/start` in 2 functions (A + C)

Diagnosis confirmed `audit.run` (dot, payload `{ auditId }`) is the TRUE audit contract — the working path (POST
/api/audits) creates an audit row first, then sends `audit.run`. Three functions emit the dead `audit/start`
(slash) instead. This prompt fixes the TWO CLEAN ones that need the identical proven pattern:

- **(A) `inngest/functions/audit-schedules-cron.ts`** — Phase 1 scheduled recurring audits. **ACTIVELY BROKEN IN
  PROD.** The daily 2 AM cron finds active schedules, emits a dead event, updates nextRunAt/lastRunAt, returns —
  **no audit ever fires.** Proof: Bondi's active daily schedule has `last_run_at = NULL` despite being past due.
  Silent: no error, schedule shows "active" in UI, customer gets nothing. This is a shipped, UI-wired, paid
  feature. **P0.**
- **(C) `inngest/functions/schedule-workflow-runs.ts`** — Phase 2 workflow scheduler. **LATENT** (0 `workflow_runs`
  rows, never executed) but identically wired to fail. Fix now so it never ships broken. **P2.**

Both ALREADY have `checkQuota` — they only need: create an audit row → run via `audit.run`/`runAuditInline` →
remove the dead `audit/start` emit. Same shape as the proven `trigger-validation-reaudit.ts` fix.

> **(B) `bulk-reaudit-orchestrate.ts` is NOT in this prompt** — it has extra bugs (no quota gate, operationId/
> bulkOperationId field mismatch, a sequential-vs-concurrent decision) and is handled separately. Do NOT touch it
> here.

> **Investigate-first. Confirm the proven pattern before applying.** Read:
> - `inngest/functions/trigger-validation-reaudit.ts` — the ALREADY-FIXED reference. Copy its exact pattern:
>   create audit row in a transaction (`getNextAuditNumber(orgId, tx)`, `triggered_by`, metadata link) → set the
>   linking field → run via `runAuditInline(auditId)`. Match this shape; do NOT invent a new one.
> - `app/api/audits/route.ts` — confirm how the working path creates the audit row + what columns it sets
>   (audit_number, triggered_by, status, brand_id, org_id) and that it ultimately drives `audit.run` / runAudit.
> - `lib/audit/run-audit-inline.ts` (or wherever `runAuditInline` lives) — confirm its signature is
>   `runAuditInline(auditId)` and that it's the same function the reaudit fix used.
> - Both target files (`audit-schedules-cron.ts`, `schedule-workflow-runs.ts`) — confirm the current dead emit,
>   the existing `checkQuota` call, and the schedule/lastRunAt bookkeeping each does.
> Report the confirmed pattern + each file's current emit/quota/bookkeeping, then apply.

---

## THE FIX — same pattern in both functions

For EACH function, replace the dead `audit/start` emit with the proven reaudit pattern, **preserving the existing
`checkQuota` gate and all existing schedule bookkeeping**:

1. **Keep the quota gate.** The existing `checkQuota(orgId, brandId)` call stays exactly where it is and gates the
   audit firing. (Both functions already have it — do not remove or move it. Over-quota handling stays as-is.)
2. **Create an audit row** (the missing Bug-B step) — in a transaction, using the SAME helper the reaudit fix
   uses (`getNextAuditNumber(orgId, tx)`), setting `triggered_by` appropriately:
   - (A) audit-schedules-cron → `triggered_by: 'schedule'` (or whatever the working path's enum value is — match
     existing audits.triggered_by values; report what you used).
   - (C) schedule-workflow-runs → `triggered_by: 'workflow_run'` / the appropriate existing value.
   - Link metadata back to the source (schedule id for A; workflow_run id for C) the way the reaudit links taskId.
3. **Run the audit** the proven way: **`runAuditInline(auditId)`** (synchronous — matches the reaudit fix and is
   simplest), OR send `audit.run` with `{ auditId }` if the function should fan out concurrently. **Prefer
   `runAuditInline` for consistency with the reaudit fix unless there's a concrete concurrency reason** (report
   which you chose and why).
4. **Remove the dead `audit/start` emit entirely** — no `inngest.send('audit/start', …)` / `step.sendEvent(…
   'audit/start' …)` left behind.
5. **Preserve schedule bookkeeping** — (A) must still update `nextRunAt`/`lastRunAt` (and now `lastRunAt`
   reflects an audit that ACTUALLY ran); (C) must still do its workflow_runs status transitions
   (scheduled→running→completed). Make sure `lastRunAt` is set AFTER the audit is successfully created/run, so a
   failed audit doesn't falsely mark the schedule as run.

## INVARIANTS — do not violate
- `audit.run` (dot) + `{ auditId }` is the contract. An audit ROW must exist before the audit runs (Bug B). Never
  emit `audit/start` again.
- The `checkQuota` gate is LOCKED — every audit-firing path goes through it (Sprint 9 rule). Do not weaken it.
- LinkedIn audits / consensus checks are NOT quota-tracked (only the audit firing consumes the slot) — if (C)
  fires those, leave their non-quota-tracked handling unchanged.
- Match the reaudit fix's audit-row creation EXACTLY (`getNextAuditNumber`, transaction, triggered_by, metadata
  link) — consistency across all audit-firing paths.
- Do NOT touch `bulk-reaudit-orchestrate.ts` (separate prompt). Do NOT change the audit pipeline, scoring, or
  `runAuditInline` itself — reuse as-is.
- `lastRunAt`/status bookkeeping must reflect reality (set only after the audit actually fires).

## VERIFY — (A) is testable on real data RIGHT NOW (there's an active schedule)
**(A) audit-schedules-cron — the urgent one:**
1. Confirm Bondi's active daily schedule exists and is past due (`last_run_at` NULL going in):
   ```bash
   psql "$DATABASE_URL" -c "SELECT id, brand_id, frequency, is_active, next_run_at, last_run_at FROM audit_schedules WHERE brand_id = '8f59b2a2-6aa0-4318-9848-b33ed520ca36';"
   ```
2. Trigger the cron manually (don't wait for 2 AM): in the Inngest dashboard (`localhost:8288`), find
   `audit-schedules-cron` under Functions and **invoke/trigger it** (or use the dashboard's "Send test event" /
   cron trigger). Confirm `START-INNGEST.bat` is running.
3. Inngest Runs: `audit-schedules-cron` runs → passes quota → **creates an audit row** → runs the audit (a real
   audit fires — give it time in prod mode) → completes. Then a NEW audit run appears and completes.
4. DB confirms an audit actually ran for the scheduled brand:
   ```bash
   psql "$DATABASE_URL" -c "SELECT id, brand_id, triggered_by, status, audit_number, created_at FROM audits WHERE brand_id = '8f59b2a2-6aa0-4318-9848-b33ed520ca36' AND triggered_by = 'schedule' ORDER BY created_at DESC LIMIT 3;"
   ```
   → at least one row with `triggered_by='schedule'`, `status='complete'`.
5. The schedule's `last_run_at` is now SET (not NULL) and `next_run_at` advanced — and it reflects a real audit.
6. No `audit/start` emit remains: `grep -rn "audit/start" inngest/functions/audit-schedules-cron.ts` → empty.

**(C) schedule-workflow-runs — latent, structural check:**
7. `grep -rn "audit/start" inngest/functions/schedule-workflow-runs.ts` → empty (dead emit gone, replaced with
   the audit-row + `audit.run`/runAuditInline pattern).
8. If quick to exercise (create a workflow_run of an audit type), confirm it now creates an audit row + fires;
   otherwise confirm via code review that it matches (A)'s corrected pattern. (0 rows today, so structural parity
   with (A) + tests is acceptable.)

9. Full suite still green (Sprint 1 + Sprint 2); the pre-existing Sprint 1 `audit_cost_snapshots` failure is the
   only known red — no NEW failures.

## REPORT
- Confirmed pattern from the reaudit fix (`getNextAuditNumber` + transaction + `triggered_by` + `runAuditInline`)
  and `runAuditInline`'s signature.
- Per function: the dead emit you removed, the audit-row creation you added (triggered_by value + metadata link),
  whether you used `runAuditInline` or `audit.run` and why, and that `checkQuota` + bookkeeping were preserved.
- **(A) behavioural proof:** cron triggered → audit row created (`triggered_by='schedule'`) → audit ran to
  complete → schedule `last_run_at` now SET (was NULL). This is the proof scheduled auditing now works.
- **(C):** dead emit gone, pattern matches (A); exercised or structurally confirmed (note 0 workflow_runs rows).
- Confirm invariants: `audit.run`+`{auditId}`, audit row before run, quota gate intact, bookkeeping reflects
  reality, bulk-reaudit untouched. Suite green (no new failures).

## NOTE — production impact (for Sri, beyond the code)
(A) means any customer with an active audit schedule has been getting NO scheduled audits, silently, since the
feature shipped — their data is stale and the UI showed "active." After this fix: consider (1) which orgs have
active schedules with NULL/stale last_run_at, and (2) whether to kick off a one-time catch-up audit for them so
they're not waiting until the next cron tick. That's an ops decision, not part of this code fix — flagging it so
it's tracked.
