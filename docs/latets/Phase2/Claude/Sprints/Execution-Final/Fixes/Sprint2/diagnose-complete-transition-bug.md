# Claude Code — DIAGNOSE: "Cannot transition from 'complete' to 'complete'" + 400s on the kanban

Sprint 2 manual testing: drag-and-drop works now, BUT a task throws **"Cannot transition from 'complete' to
'complete'"** with repeated **400s** on `POST .../tasks/131bad7b.../complete` and `PATCH .../tasks/131bad7b...`.
The kanban shows **"Done 0"** (no cards in Done) even though a task with status `complete` apparently exists and
is being re-transitioned. **Diagnose the root cause — do NOT fix yet. Report findings for Sri to decide.**

Stuck task id: `131bad7b-88af-4dd5-b16a-bd56b173c68c`
Brand id: `8f59b2a2-6aa0-4318-9848-b33ed520ca36`

> **Report-first.** This is investigation only. Run the checks, report what you find against the hypotheses
> below. Do NOT change source until Sri confirms the diagnosis + fix direction.

## CONTEXT — the suspected causes (test each)
1. **ENUM MISMATCH** — the LLD canon is `remediation_tasks.status = 'complete'` (no -d). The Sprint 2 PROMPT §0.5
   erroneously said `'completed'`. If the build mixed the two (some code `'complete'`, some `'completed'`), a
   task saved as one won't match logic expecting the other → "not in Done column" + transition confusion.
   (workflow_runs legitimately uses `'completed'` — exclude it.)
2. **COLUMN-MAPPING / DISPLAY** — a `complete` task isn't rendering in the **Done** column (Done shows 0), so it
   appears somewhere draggable, and dragging it fires a "complete → X" transition that the validator rejects.
   A `complete` task should land in Done and be NON-draggable (`complete → nothing` per VALID_COLUMN_MOVES).
3. **RETRY LOOP** — repeated identical 400s suggest something re-fires the failed PATCH/complete (optimistic
   update fails → reverts → re-fires). Check whether the move handler can loop.

## STEP 1 — The actual stored status (decisive)
```bash
# What status is the stuck task + all Bondi tasks ACTUALLY in?
# (use the project's DB access — psql / drizzle studio / a one-off script)
psql "$DATABASE_URL" -c "SELECT id, title, status, created_at FROM remediation_tasks WHERE brand_id = '8f59b2a2-6aa0-4318-9848-b33ed520ca36' ORDER BY created_at;"
psql "$DATABASE_URL" -c "SELECT id, title, status FROM remediation_tasks WHERE id = '131bad7b-88af-4dd5-b16a-bd56b173c68c';"
```
Report: the exact `status` string of task 131bad7b (is it `complete`, `completed`, or something else?) and the
statuses of all Bondi tasks.

## STEP 2 — Enum consistency in the code
```bash
# Any 'completed' (WRONG value) in remediation_tasks code? (exclude workflow_runs)
grep -rni "completed" lib/workflow/ components/domain/workflow/ app/api/brands/*/tasks/ db/schema/remediation-tasks.ts | grep -iv "workflow_run\|workflow-run\|workflowRun"

# The 'complete' usages for comparison
grep -rni "'complete'\|\"complete\"" lib/workflow/ components/domain/workflow/ app/api/brands/*/tasks/ db/schema/remediation-tasks.ts | grep -iv "workflow_run\|workflow-run\|workflowRun" | head -30
```
Report: does any `remediation_tasks` code use `'completed'`? List every place. (If yes → enum mismatch confirmed.)

## STEP 3 — The column→status mapping + move rules
```bash
# How does the kanban map columns to status? Does "Done" expect 'complete' or 'completed'?
grep -rn "Done\|complete\|completed\|ready_for_review\|in_progress\|COLUMN\|statusToColumn\|columnToStatus" components/domain/workflow/task-kanban.tsx | head -30

# VALID_COLUMN_MOVES + where the transition is validated/rejected
grep -rn "VALID_COLUMN_MOVES\|Cannot transition\|transition\|status ===\|already\|complete" components/domain/workflow/task-kanban.tsx lib/workflow/task-manager.ts app/api/brands/*/tasks/*/complete/route.ts app/api/brands/*/tasks/*/route.ts | head -30
```
Report: which status value "Done" maps to, what VALID_COLUMN_MOVES allows from `complete` (should be nothing),
and where "Cannot transition from X to X" is thrown.

## STEP 4 — Why isn't the complete task in Done? + the loop
- Read the kanban's grouping logic: how does it decide which column a task renders in? If task status =
  `complete` (from STEP 1) but it's NOT in the Done column, trace why (the mapping doesn't match the status
  value → likely the enum mismatch, or the mapping omits `complete`).
- Read the drag/move handler: can a failed move re-fire (explaining the repeated 400s)? Is the card draggable
  while `complete` (it shouldn't be)?

## REPORT (no fix — for Sri to decide)
1. **Task 131bad7b's actual stored status** (the exact string).
2. **Enum verdict:** does remediation_tasks code use `'completed'` anywhere? List each. → mismatch confirmed or not.
3. **Column mapping:** what value does "Done" map to; does it match the stored status; why is the complete task
   not in Done (Done=0)?
4. **Move rules:** what VALID_COLUMN_MOVES allows from `complete`; where "X to X" is thrown; is the card
   draggable while complete?
5. **Root-cause call:** which of the 3 hypotheses (enum mismatch / column-mapping / retry-loop) — or a combo —
   explains BOTH the "not in Done" AND the "complete→complete" 400s. Cite the specific lines.
6. **Proposed fix direction** (for Sri to approve) — e.g. "converge enum onto 'complete'" and/or "fix Done-column
   mapping so complete tasks render in Done + are non-draggable." Do NOT apply it yet.
