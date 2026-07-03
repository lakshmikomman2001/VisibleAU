# Claude Code — DIAGNOSE (report-first, NO fixes): kanban state desync — task in "Review" column is actually `complete`

Dragging a task from **Review → Done** throws **`Cannot transition from 'complete' to 'complete'`** (400 on
`POST /api/brands/[id]/tasks/[id]/complete`). The UI shows the task in the **Review** column (Review count = 1),
but the SERVER rejects the complete because the task is **already `complete`** in the DB. So the card is RENDERED
in Review while its actual `remediation_tasks.status` is `complete` — a state/display desync.

Surfaced when testing against the **freshly-migrated prod database** (Sydney Plumbing Solutions, brand
`39a9e4c7-b01d-4289-890d-17203b13ec02`, task `6f8f26d8-3dc9-4ac8-945b-7e7ea87c722a`).

Canonical context (locked):
- `remediation_tasks.status` enum = **`open | in_progress | ready_for_review | complete | wont_fix`** (LLD ~line
  621). The **Review column maps to `ready_for_review`** — NOT `complete`. A task correctly in Review has status
  `ready_for_review`.
- THREE distinct status spellings, never unified: `remediation_tasks.status='complete'` (no -d),
  `workflow_runs.status='completed'` (-ed), `audits.status='complete'` (no -d). A surface reading the WRONG status
  field (e.g. a joined `workflow_runs.status` instead of `remediation_tasks.status`) is a classic desync cause.
- Done column → `POST /tasks/[id]/complete` (emits `task/completed`). The 400 guard ("cannot transition from
  complete to complete") is the completion route correctly refusing to re-complete an already-complete task.

So the GUARD is working correctly — the bug is that a `complete` task is being PLACED in the Review column, then
the user is (reasonably) trying to complete it, hitting the guard. Find WHY a complete task renders under Review.

**DIAGNOSE ONLY. Report the root cause + fix direction. Change NO source until Sri decides.**

> Note: this is on PROD DATA post-migration. The desync may be (a) a kanban column-mapping bug (live code issue,
> would affect dev too), or (b) bad/half-migrated task rows in prod (data issue from the migration), or (c) a
> status-field-read bug (reading workflow_runs.status vs remediation_tasks.status). The diagnosis must distinguish
> these — the fix differs sharply for each.

---

## STEP 1 — What is the task's ACTUAL status in the DB?
```bash
psql "$PROD_DATABASE_URL" -c "SELECT id, title, status, score_before, score_after, reaudit_id, updated_at FROM remediation_tasks WHERE id = '6f8f26d8-3dc9-4ac8-945b-7e7ea87c722a';"
```
Report `status`. Expected per the error: **`complete`**. If so, confirm the desync (DB=complete, UI=Review). Also
note: does it have `score_after`/`reaudit_id` (i.e. did it already complete + re-audit), or is it `complete` with
NULL re-audit (completed but re-audit never ran)?

## STEP 2 — How does the kanban map status → column? (the likely bug)
Find the column-grouping logic in the kanban:
```bash
grep -rnE "ready_for_review|'review'|\"review\"|Review|column|status ===|groupBy.*status|Open|In Progress|Done|complete|in_progress" components/domain/workflow/task-kanban.tsx components/domain/workflow/*.tsx app/\(auth\)/brands/\[brandId\]/workflow/tasks/*.tsx | head -40
```
Report: how are tasks bucketed into Open / In Progress / Review / Done?
- Which `remediation_tasks.status` value maps to the **Review** column? It SHOULD be `ready_for_review`. If the
  board maps `complete` (or some fallback/default) into Review, THAT'S the bug.
- Is there a default/else branch that dumps unmatched statuses into Review? (e.g. a switch with no `complete` case
  → falls through to Review.)
- Does the Done column correctly map `complete`? If `complete` tasks are supposed to be in Done but this one shows
  in Review, the mapping is wrong OR a different status field is being read.

## STEP 3 — Is the board reading the RIGHT status field? (the three-spellings trap)
```bash
grep -rnE "workflow_runs|\.status|remediationTasks.status|task.status|run.status|join.*workflow" components/domain/workflow/task-kanban.tsx app/\(auth\)/brands/\[brandId\]/workflow/tasks/*.tsx lib/workflow/task-manager.ts | head -30
```
Report: does the kanban bucket by **`remediation_tasks.status`** (correct), or is it accidentally reading a joined
**`workflow_runs.status`** (`scheduled|running|completed`) or some other status? If the board groups by
`workflow_runs.status` and that row says something that maps to "Review" while `remediation_tasks.status='complete'`,
that's the desync — two different status fields disagreeing.

## STEP 4 — Is this ONE bad row, or systemic? (data vs code)
```bash
# How many tasks have a status that doesn't cleanly map, across this brand + all brands?
psql "$PROD_DATABASE_URL" -c "SELECT status, COUNT(*) FROM remediation_tasks WHERE brand_id='39a9e4c7-b01d-4289-890d-17203b13ec02' GROUP BY status;"
psql "$PROD_DATABASE_URL" -c "SELECT status, COUNT(*) FROM remediation_tasks GROUP BY status;"
# Any tasks with status='complete' that the board would show in Review? (depends on STEP 2 mapping)
```
Report: the status distribution. Is `6f8f26d8` an isolated `complete` row, or are there many `complete` tasks (in
which case they'd ALL mis-render in Review if it's a mapping bug)? Compare prod vs dev if dev is reachable — does
the SAME task/status mis-render in dev, or only in prod? (Dev mis-renders too → code bug. Only prod → migration
data issue.)

## STEP 5 — Did the migration introduce bad status values?
Since this is post-migration prod:
```bash
# Any status values OUTSIDE the canonical enum? (migration could have carried odd values)
psql "$PROD_DATABASE_URL" -c "SELECT DISTINCT status FROM remediation_tasks;"
```
Report: are all status values within `open|in_progress|ready_for_review|complete|wont_fix`? Any stray/legacy
values (e.g. `completed`, `done`, `ready`, NULL) that the board can't map → would fall into a default column?

## VERDICT (report one, with evidence)
- **(A) KANBAN COLUMN-MAPPING BUG (code)** — the board maps `complete` (or a default/else) into the Review column,
  or has no `complete`→Done case. Affects dev too. → Fix the column mapping (every status → its correct column;
  `complete`→Done, `ready_for_review`→Review; no silent fallthrough). Report the exact mapping defect.
- **(B) WRONG STATUS FIELD READ (code)** — the board buckets by `workflow_runs.status` (or another field) instead
  of `remediation_tasks.status`. → Fix to read `remediation_tasks.status`. Report where.
- **(C) BAD MIGRATED DATA (data)** — `6f8f26d8` (and/or others) have a `status` that's correct (`complete`) but
  the task shouldn't be `complete` (e.g. it was mid-Review in dev and migrated as complete), OR stray non-enum
  values exist. Code is fine; the prod rows are wrong. → Data cleanup (correct the affected rows' status), not a
  code change. Report which rows + correct values.
- **(D) COMBINATION** — e.g. a `complete` task legitimately exists but the board mis-places it (mapping bug) AND
  there's stray data. Report both.

## REPORT
- STEP 1: the task's actual `status` (confirm `complete`) + whether it has re-audit data.
- STEP 2: the exact status→column mapping; which status the Review column expects; any default/fallthrough.
- STEP 3: whether the board reads `remediation_tasks.status` or a different status field.
- STEP 4: status distribution (this brand + all); isolated row vs systemic; dev-vs-prod reproduction.
- STEP 5: any non-canonical status values from the migration.
- **The verdict (A/B/C/D)** with evidence + the precise fix direction for Sri to approve (do NOT apply).
- Confirm: no source/data changed (diagnosis only).

## NOTE
Key distinguishing question: does this desync reproduce in the DEV database, or ONLY in prod? If dev shows the same
`complete`-task-in-Review behaviour → it's a code mapping/field bug (A or B) that was always there and just wasn't
hit. If ONLY prod → the migration produced task rows in a state the board can't place (C). This single comparison
splits "fix the code" from "fix the data" — report it explicitly.
