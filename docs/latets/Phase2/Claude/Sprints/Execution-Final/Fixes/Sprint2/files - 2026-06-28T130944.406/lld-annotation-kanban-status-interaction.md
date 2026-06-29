# LLD ANNOTATION — Kanban task status-change interaction (TC-03 / Finding 5)

**Status:** Resolves an under-specification found in Sprint 2 manual testing. The Tasks kanban (§6U.3) describes
columns + card contents but **never specified how a user moves a card between columns** to change status. Both
gestures fail in the build: drag does nothing (no drag was ever implemented — zero drag refs in LLD/prototype;
the only mention is the Sprint 2 responsive aside), and clicking a card does nothing. So a task is stuck in
'open' forever — the core workflow progression (Open → In Progress → Review → Done) is unreachable, even though
`PATCH /tasks/[id]` and `POST /tasks/[id]/complete` exist. This annotation defines the interaction.

> **Add near the §6U.3 Tasks kanban spec** (LLD + Sprint 2 prompt). Now canonical: the kanban status-change UX
> is defined here. Same situation/handling as TC-01 (task creation).

---

## THE RESOLVED DESIGN — drag-and-drop + click/keyboard fallback (both required)

The §6U.3 spec already calls for cards to be **"buttons" with accessible names** and a **"keyboard-navigable"
board** — so the accessible click/keyboard path is mandatory (WCAG: drag-alone fails 2.5.7 Dragging Movements).
Drag is the power-user gesture (the responsive note assumes "kanban drag is pointer-only"). Build BOTH:

### PATH A — Drag-and-drop (pointer)
- Cards are draggable between the 4 columns (Open / In Progress / Review / Done).
- On drop into a column, set the task's status to that column's enum value (mapping below) and **persist**.
- Provide the **list fallback for narrow/touch** the responsive note requires (`<md`: single-column grouped
  list — drag is pointer-only, so touch uses the click path).

### PATH B — Click / keyboard (accessible, REQUIRED)
- Each card is an accessible control (the spec's "cards are buttons"). Clicking a card (or a clearly-labelled
  status control on it — e.g. a "Move to ▾" menu / status dropdown) lets the user change status WITHOUT
  dragging.
- Keyboard: the board is keyboard-navigable (spec requirement) — a focused card can be moved via keyboard
  (e.g. arrow/enter to pick a target status). At minimum, the click-based status control must be fully
  keyboard-operable.
- This path is the WCAG-required alternative to drag and ALSO the touch fallback.

## COLUMN → STATUS MAPPING (locked — §0.5 enum)
- **Open** → `open`
- **In Progress** → `in_progress`
- **Review** → `ready_for_review`
- **Done** → `complete`  ⚠️ **'complete' (no -d)** — NOT 'completed' (that's workflow_runs). Locked invariant.

## ⚠️ CRITICAL WIRING — "Done" goes through /complete, not plain PATCH
- Moving a card to **In Progress** or **Review** → `PATCH /api/brands/[id]/tasks/[taskId]` with the new status.
- Moving a card to **Done** → **`POST /api/brands/[id]/tasks/[taskId]/complete`** — NOT a plain PATCH to
  status='complete'. The `/complete` route **emits `task/completed`** (§8.2), which triggers
  `trigger-validation-reaudit` (the 14-day re-audit that measures lift). If "Done" just PATCHes status, the
  whole lift-measurement loop never fires — completion MUST go through `/complete`.
- `wont_fix` is a separate path (not a column) — keep the existing PATCH + wont_fix_reason refine for that.

## INVARIANTS — do not violate
- Status enum: open | in_progress | ready_for_review | complete | wont_fix. **complete (no -d); never 'done'.**
- Optimistic UI is fine, but on PATCH/complete failure, **revert the card** to its prior column + show an error
  (don't leave the UI showing a move the server rejected).
- Stat cards must stay equal to the lists (§6U.2/§6U.3) — after a move, "Open tasks" / column counts update.
- The kanban still ORDERS by integer `priority` within a column (existing behaviour).

## DEPENDENCY NOTE (decide in the build)
Sprint 2 says "no new runtime packages." Drag-and-drop usually needs a library (`@dnd-kit/core` is the modern,
accessible, lightweight choice). Two options — the build should pick and report:
- (a) Add `@dnd-kit/core` (+ sortable) as a deliberate, justified dependency (drag was under-specified; a small,
  a11y-friendly lib is the clean way). Preferred if drag quality matters.
- (b) Native HTML5 drag events (no dependency) — works, but clunkier and harder to make accessible (which is
  why PATH B is mandatory regardless).
Either way, PATH B (click/keyboard) does NOT need a library and must exist for accessibility + touch.

## SCOPE NOTE
Backend already exists (`PATCH /tasks/[id]`, `POST /tasks/[id]/complete`, task-manager status transitions). This
adds only the **UI interaction** (drag + click/keyboard) that calls those endpoints. No data-model change.
