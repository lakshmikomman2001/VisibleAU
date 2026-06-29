# Claude Code — TEST: the re-audit → lift loop (shorten the 14-day sleep, verify lift is measured)

This is the FINAL untested link of the Sprint 2 Workflow loop — and the one that proves the product's core value
claim ("make the fix, we'll prove the lift"). All earlier links are verified working: create task → generate
draft → approve/reject → mark complete. Marking complete already fires `task/completed` →
`triggerValidationReaudit`, BUT that function does `step.sleep('14 days')` before running the re-audit, so the
lift has NEVER actually been measured. Every task card still shows `score_before → —` (the `—` = `score_after`
is NULL = no re-audit has run). This test makes the re-audit fire NOW and verifies the lift populates.

**This is a TEST with a TEMPORARY code change** (shorten the sleep) — clearly marked, reverted after. It is NOT a
permanent change. The 14-day sleep is correct production behaviour and must go back.

> **Investigate-first. Report the current state before changing anything.** Read:
> - `inngest/functions/trigger-validation-reaudit.ts` — confirm the `step.sleep('wait-14-days', '14 days')` line,
>   the `checkQuota` call, and that on success it fires `'audit/start'` (or however it invokes the full audit)
>   and ultimately writes `score_after` / `lift_achieved` to the task.
> - How `score_after` and `lift_achieved` get written: is it `triggerValidationReaudit` itself after the audit
>   completes, or does the `audit/start` → audit-completion path write them back by `reaudit_id`? Trace the
>   write so we know which function/row to watch. (LLD: "Measures score_after, fan_out_after, similarity_after";
>   `lift_achieved` = `score_after − score_before`; dashboard Measured Impact is gated on `score_after IS NOT
>   NULL`.)
> - The dashboard "Work Completed / Measured Impact" card source (`lib/workflow/progress-summary.ts`) — confirm
>   the SUM filters `score_after IS NOT NULL` (honesty rule) so it only lights up once a real re-audit ran.
> Report: the exact sleep line, what writes score_after/lift_achieved, and the current task statuses (how many
> completed tasks exist with score_after still NULL).

---

## STEP 1 — Temporarily shorten the sleep (TEST ONLY — mark it, revert after)
In `inngest/functions/trigger-validation-reaudit.ts`, change the sleep duration from `'14 days'` to a short
value (e.g. **`'10s'`** or **`'30s'`**) so the re-audit fires almost immediately instead of in two weeks.

- Add a clear marker comment so this is never shipped, e.g.:
  ```ts
  // ⚠️ TEMP TEST OVERRIDE — revert to '14 days' before commit. (Sprint 2 lift-loop manual test.)
  await step.sleep('wait-14-days', '10s'); // was '14 days'
  ```
- Do NOT change anything else — not the quota gate, not the audit-firing, not the write-back logic. ONLY the
  sleep duration. (If the sleep value is read from an env var or config rather than hardcoded, prefer setting
  that var locally instead of editing code — report which mechanism exists.)
- The Next.js app must be restarted for the changed function to re-sync to the Inngest dev server (Inngest reads
  the function definition at serve time). Confirm the app restarted + the Inngest dashboard shows the updated
  function.

## STEP 2 — Make sure a completable task exists (a fresh one is cleanest)
The existing completed tasks already passed their `task/completed` emit and are sleeping — completing a NEW task
is the clean way to test the shortened path end-to-end. On Bondi Plumbing
(`/brands/8f59b2a2-6aa0-4318-9848-b33ed520ca36`):
- Use the task currently in **Review** ("Your AU local directory listings", score_before 80), OR create a fresh
  task from a recommendation.
- Note its `score_before` (the card shows `80 → —`). That's the baseline; lift = new audit score − 80.

## STEP 3 — Complete the task → the re-audit should now fire in ~seconds
- Move the task to **Done** (this routes through `POST /tasks/[id]/complete`, emits `task/completed`).
- Watch the **Inngest dashboard → Runs** (`localhost:8288/runs`):
  - `trigger-validation-reaudit` runs, sleeps only ~10–30s (not 14 days), then proceeds past the sleep.
  - It calls `checkQuota` (Bondi/VisibleAU Dev is Agency tier — quota should be allowed; if it defers with
    `markReauditDeferred('quota_exceeded')`, that's the quota path, not a failure — report it).
  - It fires `audit/start` → a **full re-audit run** appears and runs to completion (this is a real audit; in
    prod-mode it makes real LLM calls — give it time).
- Report each run's status (completed green / failed red). If any run errors, open it and capture the error.

## STEP 4 — Verify the lift was written (the actual payoff)
After the re-audit completes:
```bash
psql "$DATABASE_URL" -c "SELECT id, title, status, score_before, score_after, lift_achieved, reaudit_id, reaudit_triggered_at FROM remediation_tasks WHERE brand_id = '8f59b2a2-6aa0-4318-9848-b33ed520ca36' AND status = 'complete' ORDER BY updated_at DESC LIMIT 3;"
```
Confirm on the task you completed:
- **`score_after` is now NOT NULL** (a real number — the re-audit score).
- **`lift_achieved` = score_after − score_before** (e.g. score_before 80, score_after 87 → lift 7; can be
  negative if the score dropped — that's still honest/valid).
- **`reaudit_id`** is set (points to the audit that validated it) and **`reaudit_triggered_at`** is populated.

## STEP 5 — Verify it surfaces in the UI (the card finally lights up)
1. **Task card** (`/workflow/tasks`): the completed task should now show `80 → 87` (the actual after-score) instead
   of `80 → —`. The lift-indicator renders the before→after.
2. **Dashboard "Work Completed / Measured Impact" card**: the Measured Impact should now show a real lift number
   (sum of `lift_achieved` where `score_after IS NOT NULL`) instead of "validation audit scheduled — pending".
   (If the dashboard surface isn't reachable/built yet, note that — the DB + task-card check is the core proof.)

## STEP 6 — REVERT the sleep (REQUIRED — do not skip)
Put the sleep back to **`'14 days'`** and remove the TEMP marker comment. Restart the app so the production timing
is restored. Confirm the line reads the original `'14 days'` again.
```bash
grep -n "step.sleep" inngest/functions/trigger-validation-reaudit.ts   # → must show '14 days', no TEMP override
```

## INVARIANTS — do not violate
- The sleep change is **TEMPORARY** and reverted in STEP 6. `'14 days'` is correct prod behaviour.
- Do NOT remove/weaken the `checkQuota` gate, the `markReauditDeferred` over-quota path, or the
  `score_after IS NOT NULL` honesty filter on Measured Impact — those are locked.
- `lift_achieved` honesty rule: lift is shown ONLY where a real re-audit ran (`score_after IS NOT NULL`); never
  display projected/estimated lift as measured.
- Don't change the audit pipeline, the complete route, or the write-back logic — this test only shortens the
  wait and observes.

## REPORT
- The investigation findings: the sleep line, what writes score_after/lift_achieved (which function/path), and
  how many completed tasks had score_after NULL before the test.
- Inngest run results: did `trigger-validation-reaudit` proceed past the shortened sleep, pass the quota gate,
  fire `audit/start`, and the re-audit complete? (status of each run; any errors.)
- DB confirmation: score_after NOT NULL, lift_achieved = after − before, reaudit_id + reaudit_triggered_at set.
- UI confirmation: task card shows `before → after` (not `→ —`); dashboard Measured Impact shows a real lift (or
  note if the dashboard surface isn't built/reachable).
- **Confirm STEP 6 done:** sleep reverted to '14 days', TEMP marker removed, grep clean, app restarted.
- Confirm invariants held (quota gate intact, honesty filter intact, only the sleep was touched + reverted).
