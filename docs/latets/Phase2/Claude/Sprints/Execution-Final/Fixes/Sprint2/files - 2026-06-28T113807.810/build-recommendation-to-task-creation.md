# Claude Code — BUILD: Recommendation → Task creation UI (the missing entry point)

Sprint 2 manual testing found there is **no working UI path to create a remediation task** — so the entire
Workflow loop (task → draft → approve → re-audit → lift) is unreachable. Root cause: neither the LLD nor the
prototype defined the creation UX. The "New task" button has no behaviour; recommendations have only "Mark as
done"/"Dismiss". The backend create path EXISTS (`POST /api/brands/[id]/tasks`, task-manager populate-on-create,
priority-scorer derivation) — only the UI entry points are missing. Build them per the resolved design below.

> **Investigate-first.** Before building, read: the recommendation detail component (Action Center), the
> Workflow hub (`app/(auth)/brands/[brandId]/workflow/page.tsx`), the Tasks kanban, the existing `POST
> /api/brands/[id]/tasks` route, and `lib/workflow/task-manager.ts` (the create logic). Confirm what the create
> route already does so the UI calls it correctly rather than duplicating logic.

---

## WHAT TO BUILD — two creation paths

### PATH 1 (PRIMARY) — "Create task" on a recommendation
- **Add a "Create task" action** to the **recommendation detail** screen (Action Center recommendation, e.g.
  `app/(auth)/action-center/[id]/...`), alongside the existing "Mark as done" / "Dismiss".
- **On click:** `POST /api/brands/[brandId]/tasks` with `{ recommendationId: <this recommendation's id> }`.
  - The brandId comes from the recommendation's brand. (Recommendations belong to a brand — use that.)
  - The **server already populates** the task from the recommendation (effort denormalized, confidence_label +
    priority derived by priority-scorer, recommendation_id set, status 'open'). DO NOT recompute these in the
    UI — just pass `recommendationId` and let task-manager do it. If the route doesn't yet accept
    `recommendationId` + populate from it, extend the route/task-manager to do so (per §6.1: "On create, set
    effort + confidence_label + priority via priority-scorer").
- **Duplicate guard (REQUIRED):** if an open/in-progress task already exists for this `recommendation_id`, do
  NOT create a duplicate. Either (a) disable the button with "Task created" + a link to the task, or (b) on the
  server, return the existing task instead of inserting. Prevents N clicks → N tasks.
- **After success:** navigate to the Tasks kanban (`/brands/[brandId]/workflow/tasks`) so the user sees the new
  task in the Open column. (Or to the task detail — kanban preferred so they see it land.)
- **States:** loading (button shows spinner/disabled while POSTing); error (inline error, button re-enabled);
  success (navigate).

### PATH 2 (SECONDARY) — "New task" manual create form
- **Wire the "New task" button** on the Workflow hub (`§6U.2`, currently no-op) to **open a create form** —
  a modal (preferred) or a `/workflow/tasks/new` route.
- **Form fields:** `title` (required, text), `effort` (required, select: low|medium|high), optional description,
  optional "link to recommendation" (can be omitted in v1 if it complicates — title + effort is the minimum).
- **On submit:** `POST /api/brands/[brandId]/tasks` with the form values. `status` defaults 'open'.
- **Derived fields / the no-audit case:** a manual task may have no parent audit, so priority-scorer may not
  have a `quality_status` to derive from. `priority` INTEGER is **NOT NULL** — ensure the server yields a valid
  integer for a manual task (e.g. priority-scorer derives from effort + a default impact when no audit/
  recommendation is linked). If priority-scorer currently assumes an audit, add a no-audit branch that still
  returns a valid priority. `confidence_label` may be null in this case (that's allowed).
- **After success:** close the form + refresh the kanban/hub so the new task appears. Show it in Open.

## INVARIANTS — do not violate (already canonical)
- `remediation_tasks.status` default `'open'`; enum open|in_progress|ready_for_review|completed|wont_fix;
  **never 'done'**.
- `confidence_label` + `priority` **derived by priority-scorer**, not user-set. Path 1: always derived from the
  recommendation's audit. Path 2: derived from available inputs (effort + default), priority still NOT NULL.
- `recommendation_id` ON DELETE SET NULL (already in schema — don't change).
- **Stat cards MUST equal their lists** (§6U.2): after create, the Workflow hub "Open tasks" count AND the kanban
  Open column both reflect the new task. Verify they stay in sync.
- Use the existing shared components (StatusBadge, PriorityBadge, EmptyState, etc.) and design tokens — don't
  invent new ones. Form follows the app's existing input/modal styling + ARIA (labels, focus management,
  `--focus-ring`).

## VERIFY (behavioural — actually create tasks on screen)
1. **Path 1:** Open a recommendation (e.g. Bondi Plumbing → Action Center → "Your AU local directory listings
   are incomplete") → click "Create task" → confirm: a task is created, you land on the kanban, the task appears
   in the **Open** column with a derived PriorityBadge + the recommendation's effort, and `recommendation_id` is
   set (check the row). Click "Create task" again on the same recommendation → confirm NO duplicate (guard works).
2. **Path 2:** Workflow hub → "New task" → confirm a form opens → enter a title + effort → submit → confirm the
   task appears in the kanban Open column with a valid priority (NOT NULL), and the Workflow hub "Open tasks"
   stat incremented to match.
3. **Stat = list:** after creating tasks, the "Open tasks" stat card equals the number of Open rows.
4. **Enum:** the created task's status is 'open' (never 'done'); a `wont_fix` transition still requires a reason
   (don't regress the existing PATCH refine).
5. Full test suite still green (the existing 200 Sprint 2 tests + the create-path tests).

## REPORT
- Path 1: the "Create task" action added to the recommendation detail + the POST wiring + the duplicate guard.
- Path 2: the "New task" form/modal + the no-audit priority handling (and whether priority-scorer needed a
  no-audit branch).
- Behavioural confirmation: a task created via EACH path, appearing in the kanban Open column, stats in sync,
  recommendation_id set on Path 1, no duplicates.
- Any backend change needed (route accepting recommendationId, priority-scorer no-audit branch) — describe it.
- Confirm invariants held (status 'open'/never 'done', derived priority/confidence, stat=list) + suite green.
