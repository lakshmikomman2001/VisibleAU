# LLD ANNOTATION — Recommendation → Task creation flow (closes the canon gap)

**Status:** Resolves an under-specification discovered in Sprint 2 manual testing. Neither the LLD nor the
prototype (FIX 16) defined HOW a `remediation_task` is created in the UI — the "New task" button had no
behaviour (prototype line 2173 has no onClick), and recommendations had no "create task" action. Yet the
canonical loop (LLD line 19 / prompt §0.1) is **Recommendation → Task → Draft → Approve → Re-audit → Lift**,
the schema has `remediation_tasks.recommendation_id REFERENCES recommendations(id)`, the create logic exists
(§6.1: "On create, set effort + confidence_label + priority via priority-scorer"), and `POST /api/brands/[id]/
tasks` exists — so the *entry point* was the only missing piece. This annotation defines it.

> **Add this to the LLD near the §6U.2 Workflow hub / §6U.3 Tasks kanban / Action Center recommendation specs,
> and to the Sprint 2 prompt §6U.** It is now canonical: the Recommendation→Task creation UX is defined here.

---

## THE RESOLVED DESIGN — two creation paths (primary + secondary)

### PATH 1 (PRIMARY) — "Create task" from a recommendation
The intended, FK-backed path. The empty-state copy ("create one from a recommendation"), the `recommendation_id`
FK, and the Workflow hub's "Fix → Draft → Approve → Measure" framing all point to this.

- **Where:** On the **recommendation detail** screen (Action Center → recommendation, e.g. `/action-center/[id]`),
  add a **"Create task"** action alongside the existing "Mark as done" / "Dismiss".
  - Optionally also surface it on the recommendation **list rows** (Action Center) as a secondary affordance,
    but the detail screen is the required location.
- **Behaviour:** Clicking "Create task" calls `POST /api/brands/[brandId]/tasks` with `{ recommendationId }`.
  The server (task-manager, per §6.1) populates the task FROM the recommendation:
  - `recommendation_id` = the recommendation's id
  - `effort` = denormalized from `recommendations.effort` (LLD 7676–7686)
  - `confidence_label` + `priority` = **derived by priority-scorer** from the parent audit's `quality_status`
    (§6.2) — NOT user-set
  - `title` = derived from the recommendation (e.g. the recommendation's action/title)
  - `status` = default `'open'`
  - the gap-source columns (`fan_out_gap_id`/`topical_gap_id` plain UUID, `linkedin_gap_source`/
    `consensus_gap_source` slugs) populated where the recommendation carries that provenance; else null
- **Idempotency / duplicate guard:** if a task already exists for this `recommendation_id` (open or in-progress),
  do NOT create a second one — either disable the button ("Task created") or navigate to the existing task.
  (Prevents N duplicate tasks from N clicks.)
- **After create:** navigate to the Tasks kanban (`/brands/[brandId]/workflow/tasks`) — or the new task — so the
  user sees the task they just created in the Open column. The Workflow hub "Open tasks" stat increments.

### PATH 2 (SECONDARY) — "New task" manual create form
The "New task" quick action on the Workflow hub (§6U.2) currently does nothing (prototype + build). Make it a
real action: open a **create form/modal** for a manual task (not tied to a recommendation).

- **Where:** "New task" button on the Workflow hub (§6U.2) opens a create form (modal or a `/workflow/tasks/new`
  route — implementer's choice; modal preferred for flow).
- **Fields (manual entry):** `title` (required), `effort` (low|medium|high, required), optional description,
  optional link to a recommendation. `status` defaults `'open'`.
- **Derived fields:** when no recommendation/audit is linked, `confidence_label` may be null and `priority`
  derived from effort + a default impact (priority-scorer must handle the no-audit case — if it currently
  assumes a parent audit, note that as a sub-task; a manual task with no audit still needs a valid `priority`
  INTEGER since the column is NOT NULL).
- **Behaviour:** submit → `POST /api/brands/[brandId]/tasks` → on success, close form + show the task in the kanban.

## INVARIANTS THIS MUST RESPECT (already canonical — do not violate)
- `remediation_tasks.status` default `'open'`; enum open|in_progress|ready_for_review|completed|wont_fix; **never
  'done'**.
- `confidence_label` + `priority` are **derived by priority-scorer**, not user-set (Path 1 always; Path 2 derives
  from whatever inputs exist).
- `priority` INTEGER **NOT NULL** — both paths must yield a valid integer (Path 2's no-audit case included).
- `recommendation_id` ON DELETE SET NULL (task outlives the recommendation) — already in schema.
- The Workflow hub stat cards MUST equal their lists (§6U.2: "a stat card MUST equal its task list") — after
  create, both the stat and the list reflect the new task.

## SCOPE NOTE
The backend create path (task-manager populate-on-create, priority-scorer derivation, `POST /tasks`) already
EXISTS per §6.1/§6.2/§9 — this annotation adds only the **UI entry points** (the "Create task" action on
recommendations + the "New task" form) and the **idempotency guard**. It does not change the data model or the
scoring logic.

## DESERVES A FOLLOW-UP CHECK
Path 2's no-audit `priority` derivation: confirm priority-scorer produces a valid NOT-NULL integer for a manual
task with no parent audit (it may currently assume `quality_status` from an audit). If it doesn't, that's a
small priority-scorer addition, not a blocker — note it.
