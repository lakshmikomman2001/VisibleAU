# Claude Code — BUILD: Kanban status-change interaction (drag + click/keyboard) — Finding 5

Sprint 2 manual testing: the Tasks kanban has **no working way to change a task's status**. Drag does nothing
(never implemented), clicking a card does nothing. Tasks are stuck in 'open' — the core workflow progression
(Open → In Progress → Review → Done) is unreachable, blocking the whole lift-measurement loop. The backend
exists (`PATCH /tasks/[id]`, `POST /tasks/[id]/complete`, task-manager status transitions) — only the UI
interaction is missing. Build it: **drag-and-drop + a click/keyboard fallback (both).**

> **Investigate-first.** Read `components/domain/workflow/task-kanban.tsx` + `task-card.tsx`, the
> `PATCH /api/brands/[id]/tasks/[taskId]` route, and the `POST .../complete` route. Confirm what (if anything)
> the kanban currently does on drag/click, and how the routes expect the status update, before building.

## WHAT TO BUILD — both interaction paths

### PATH A — Drag-and-drop (pointer)
- Make cards draggable between the 4 columns. On drop, set the task's status to the target column's enum value
  (mapping below) and persist via the right endpoint (see CRITICAL WIRING).
- **Optimistic update** the card into the new column; on server failure, **revert** + show an inline error.
- **Responsive:** `<md` collapses to the single-column grouped list (the §6U.3 fallback). Drag is pointer-only
  → on narrow/touch, users rely on PATH B.

### PATH B — Click / keyboard (REQUIRED — accessibility + touch fallback)
- The spec calls cards "buttons" + the board "keyboard-navigable." Add a click-based status control: clicking a
  card (or a clearly-labelled "Move to ▾" / status menu on the card) lets the user change status **without
  dragging**. Fully keyboard-operable (focus the control, select target status via keyboard).
- This is the WCAG-required alternative to drag (drag-alone fails 2.5.7) AND the touch fallback. It must work
  on its own even if drag is unavailable.

## COLUMN → STATUS MAPPING (locked — §0.5)
- **Open** → `open`
- **In Progress** → `in_progress`
- **Review** → `ready_for_review`
- **Done** → `complete`  ⚠️ **'complete' (NO -d)** — never 'completed', never 'done'. Locked invariant.

## ⚠️ CRITICAL WIRING — "Done" uses /complete, NOT plain PATCH
- Move to **In Progress** / **Review** → `PATCH /api/brands/[brandId]/tasks/[taskId]` with `{ status }`.
- Move to **Done** → **`POST /api/brands/[brandId]/tasks/[taskId]/complete`** (NOT a PATCH to status='complete').
  The `/complete` route emits `task/completed` → triggers `trigger-validation-reaudit` (the re-audit that
  measures lift). If "Done" just PATCHes status, the lift loop NEVER fires. Completion MUST route through
  `/complete`.
- Moving OUT of Done back to an earlier column (if allowed) → PATCH to that status. (Decide if backward moves
  are permitted; if a task is already 'complete' with a re-audit pending, moving it back is an edge case —
  keep it simple: allow forward moves cleanly; backward moves PATCH the status. Don't double-fire `/complete`.)

## INVARIANTS — do not violate
- Status enum: open | in_progress | ready_for_review | complete | wont_fix. **complete (no -d); never 'done'.**
- On PATCH/complete **failure → revert the card** to its prior column + inline error (no phantom moves).
- **Stat cards = lists** (§6U.2/§6U.3): after a move, the Workflow hub "Open tasks" + each column count update
  to match. (router.refresh or optimistic count update.)
- Kanban still **orders by integer `priority`** within each column (don't break the existing sort).
- Don't regress the impact badge (now derived from scoreBefore) or the confidence badge.

## DEPENDENCY DECISION (pick + report)
Sprint 2 says "no new runtime packages." Drag usually needs a lib. Two options:
- (a) **Add `@dnd-kit/core`** (+ `@dnd-kit/sortable` if needed) — modern, accessible, ~10kb, the clean choice.
  Justified: drag was under-specified; a small a11y-friendly lib beats hand-rolled HTML5 drag. **Preferred.**
- (b) Native HTML5 drag (`draggable`, `onDragStart/onDragOver/onDrop`) — no dep, but clunkier + weaker a11y.
PATH B (click/keyboard) needs NO library and is mandatory either way. **Report which you chose and why.**

## VERIFY (behavioural — on the real Bondi task)
1. **Drag:** on the Bondi kanban (`/brands/8f59b2a2-6aa0-4318-9848-b33ed520ca36/workflow/tasks`), drag the
   "Your AU local directory listings are incomplete" card from **Open → In Progress** → it stays there after
   reload (persisted), and the "Open tasks"/column counts update.
2. **Click/keyboard:** move a task via the click control (no drag) → status changes + persists. Tab to a card +
   operate the control via keyboard → works.
3. **Done → /complete fires:** move a task to **Done** → confirm it calls `POST .../complete` (not PATCH), the
   status becomes `complete`, AND `task/completed` is emitted (check the Inngest event fired / the re-audit
   scheduled). This is the critical one — Done must kick off the lift loop.
4. **Failure revert:** simulate a failed PATCH → the card snaps back to its prior column + shows an error.
5. **Counts:** after moves, Workflow hub stats + column counts match the actual cards.
6. Full suite green.

## REPORT
- What the kanban did before (drag/click no-ops confirmed?).
- PATH A (drag) impl + the dependency choice (a/b) + why.
- PATH B (click/keyboard) impl — the control + keyboard operability.
- The column→status mapping + that **Done routes through /complete** (emits task/completed).
- Behavioural confirmation: drag Open→In Progress persists; click/keyboard works; Done fires /complete +
  task/completed; failure reverts; counts stay in sync.
- Confirm invariants (complete no -d, stat=list, priority ordering, badges intact) + suite green.
