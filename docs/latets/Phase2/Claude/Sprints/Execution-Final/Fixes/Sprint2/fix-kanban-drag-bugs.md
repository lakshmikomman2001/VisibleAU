# Claude Code — FIX: kanban drag bugs (A non-draggable complete cards · B same-column no-op · C in-flight guard)

Diagnosis confirmed three small bugs in the new drag interaction (`components/domain/workflow/task-kanban.tsx`)
causing "Cannot transition from 'complete' to 'complete'" + repeated 400s. (The enum is fine — code uses
`'complete'` consistently; NOT an enum mismatch.) Apply all three fixes + a pending-state. Scope: ONLY
`task-kanban.tsx` (and `task-card.tsx` if the draggable/pending props live there).

> Targeted fixes to the drag handlers. Don't change the status enum, the endpoints, VALID_COLUMN_MOVES values,
> or the column→status mapping. Preserve the working forward-move path.

---

## FIX A (most important) — Done/wont_fix cards must NOT be draggable
**Bug:** line ~232 passes `onDragStart={() => {}}` to EVERY card; `!!(() => {})` is `true`, so every card is
`draggable` — including `complete` cards, whose `VALID_COLUMN_MOVES["complete"]` is `[]` (no valid moves).
**Fix:** only make a card draggable when it has allowed moves.
- Pass `onDragStart` (and set `draggable`) **only when `getAllowedMoves(t.status).length > 0`**. For a task with
  no allowed moves (`complete`, and `wont_fix` if displayed), pass `undefined`/no drag → `draggable={false}`.
- Result: complete cards can't be picked up. They render in Done, statically.

## FIX B — same-column drop is a silent no-op (not an error)
**Bug:** dropping a card on the column it's already in shows "Cannot move from X to X."
**Fix:** in `handleMoveTask`, **early-return as a no-op** when `task.status === newStatus` — do nothing, show NO
error. (Only show the "invalid transition" error for genuinely-disallowed *different*-status moves.)

## FIX C — in-flight guard prevents double-fire 400s
**Bug:** no in-flight lock, so rapid double-click / double-drag fires multiple `POST /complete` (or PATCH) calls;
the first succeeds (`ready_for_review → complete`), the second hits `complete → complete` → 400 (the repeated
400s the user saw).
**Fix:**
- Add a `movingTaskId` state (a `string | null`, or a `Set<string>` if multiple concurrent moves should be
  allowed for *different* tasks).
- At the top of `handleMoveTask`, if the task is already in-flight → **return early** (ignore the duplicate).
- Set it before the API call; clear it on success AND on failure (finally).
- **Pending-state feedback (do this too):** while a task is in-flight, render the card in a disabled/pending
  state — e.g. reduced opacity + `aria-busy="true"`, the "Move to" buttons disabled, and `draggable={false}`
  during the move. This prevents the *confusion* that causes the double-click (the user sees it's working).

## INVARIANTS — do not violate / do not regress
- Enum stays `'complete'` (no -d); column→status mapping unchanged (Open→open, In Progress→in_progress,
  Review→ready_for_review, Done→complete).
- **Done still routes through `POST /complete`** (emits `task/completed`) — don't change that. In Progress/Review
  still PATCH.
- Optimistic update + revert-on-failure stays. Stat cards = lists after a move.
- Kanban still orders by integer `priority`. Impact badge (derived from scoreBefore) + confidence badge intact.

## VERIFY (behavioural — on the real Bondi kanban)
`/brands/8f59b2a2-6aa0-4318-9848-b33ed520ca36/workflow/tasks`
1. **Fix A:** the `complete` task (131bad7b) renders in the **Done** column and **cannot be dragged** (try — it
   shouldn't pick up). No "complete → complete" error is possible because it's not draggable.
2. **Fix B:** drag an Open card and drop it back on **Open** → nothing happens, **no error banner**.
3. **Fix C:** rapidly double-click "Move to → Done" (or double-drag) on a `ready_for_review` task → only **ONE**
   `POST /complete` fires (check network/console — no second call, no 400). The card shows a pending state
   during the move.
4. **Forward path still works:** drag a task Open → In Progress → Review → Done cleanly; Done fires `/complete`
   **once** and emits `task/completed` (re-audit scheduled). Each step persists after reload.
5. **Counts in sync:** after moves, Workflow hub "Open tasks" + column counts match the cards.
6. Full suite green (the 322 Sprint 2 tests + any new ones for these guards).

## REPORT
- Fix A: the draggable condition (`getAllowedMoves(status).length > 0`) — confirm complete/wont_fix cards are
  non-draggable and render statically in their column.
- Fix B: the same-column no-op early return.
- Fix C: the in-flight guard (`movingTaskId`) + the pending/disabled card state.
- Behavioural confirmation: complete card non-draggable + in Done; same-column drop = no-op; double-click fires
  ONE request (no 400s); forward path Open→Done still works with Done firing /complete once.
- Confirm no regression (enum/mapping/endpoints/badges/ordering) + suite green.
