# Claude Code — Sprint 2 Automated Tests: Section 3 (Frontend Unit)

Execute **Section 3 (Frontend Unit Tests)** of the Phase 2 Sprint 2 test checklist
(`phase2-sprint-2-test-checklist.md`). Sections 1 (Backend Unit) and 2 (Backend E2E) are done and green. Work the
FU-1 → FU-4 passes. **Mock data** (these are unit tests — no DB, no network; mock the API/data layer).

## Safety rule (report-first)
- **FU-1, FU-2, FU-3 (write/deepen/cross-sprint):** generate tests, run them, **REPORT failures for review** — do
  NOT auto-edit source to make them pass. A failure may be a component bug OR a wrong test; decide which before any
  source change.
- **FU-4 (run all + fix):** ONLY this pass may change source to get green — and only AFTER FU-1..3 failures are
  reported/reviewed.
- A pass is "Done" only when its tests actually ran. Never invent passing results. "Done - errors fixed" if code
  changed; "Blocked - <reason>" if it couldn't complete.

## No DB / no prod risk
Frontend unit tests use mock data and render components in isolation (the project's component-test setup —
Testing Library / vitest / jsdom, whatever's configured). They do NOT touch any database. (Section 4 Frontend E2E
is the one that uses real data — not this section.)

---

## TEST TARGETS (Sprint 2 UI — Layer 5)
The checklist names: **WorkflowHub, ContentDraftEditor, EnhancedDashboard (workflow strip)**. Since this session
added/changed several Sprint 2 UI surfaces, the component tests must cover the CURRENT components, including the
ones built this session. Investigate the actual component files first, then test:

- **WorkflowHub** (`workflow-hub-client.tsx`) — the Open/In Progress/Done stat cards; the "Generate draft" / "New
  task" actions; the "Completed" stat label (NOT "Done this month" — that was relabelled this session).
- **WorkflowSubNav** (`components/domain/workflow/workflow-sub-nav.tsx`) — the **Tasks | Drafts** tab strip built
  this session (active-tab state, Link navigation, accent-blue active border). Test active/inactive rendering +
  that it links to the right routes.
- **Tasks kanban** (`task-kanban.tsx` / tasks-page-client) — the Open/In Progress/Review/Done columns; status→
  column mapping (`ready_for_review`→Review, `complete`→Done — NOT `complete` in Review); the drag/"Move to" status
  controls; the **impact badge** (derived from `scoreBefore`, not raw priority rank — the inversion fixed earlier);
  the lift indicator rendering (`80 → 88` when `score_after` present, `80 → —` when null).
- **ContentDraftEditor** (`drafts-page-client` + the editor/detail) — renders the draft content, the format chip
  (e.g. "Expert Article"), word count, and the Approve/Reject actions; the status badge (Approved/Rejected/Draft).
- **GenerateDraftModal** (`generate-draft-modal.tsx`) — the content-format select; submit behaviour; loading/error
  states (e.g. it surfaces a failure message rather than crashing).
- **Brand-detail Workflow card** (the entry point added this session in `brand-detail-client.tsx`) — renders in the
  tools grid; tier-gate state (locked/dimmed + Lock icon for Free tier, active link for Starter+).
- **Action Center** (`action-center` page client + `brand-filter.tsx` + recommendation cards) — the "All brands ▾"
  selector; per-row brand badge in aggregate view (hidden when filtered to one brand); impact-based ordering;
  empty states.
- **EnhancedDashboard "Work Completed" / Measured Impact** (the workflow strip / `work-completed-card.tsx`) — the
  two-state display (Work Completed count vs Measured Impact lift as DISTINCT); the aggregate framing; empty state.

## THE PASSES

### FU-1 — Write
Write Sprint 2 frontend unit tests for the components above, mock data. Cover: correct rendering of each
component's key states (data present / empty / loading / error), props handling, and the user-facing labels/badges.
REPORT results (do not auto-fix).

### FU-2 — Deepen + fill gaps
Analyse the frontend source deeply; find gaps (edge states, conditional rendering, tier-gate branches, error
boundaries, accessibility roles where relevant), add tests (mock data). REPORT failures.

### FU-3 — Cross-sprint gaps
Analyse across Sprints 1→2; add tests for cross-sprint UI interactions (e.g. the brand-detail page integrating the
new Workflow card alongside existing tool cards; the dashboard strip alongside earlier dashboard content; nav
between brand surfaces and workflow surfaces). REPORT failures.

### FU-4 — Run all + fix
Run ALL frontend unit tests; fix component/test issues until green (post-review only).

---

## ASSERTIONS THAT MUST BE CORRECT (post-session UI behaviours — the checklist predates these)
Test the CURRENT behaviour, not pre-fix:

1. **Stat label is "Completed", not "Done this month"** — the WorkflowHub stat card was relabelled this session
   (the query is all-time, so the label must say "Completed"). Assert the label text.
2. **Impact badge derives from `scoreBefore`** — High/Medium/Low impact is computed from `scoreBefore`, NOT the raw
   integer priority rank (the inversion bug fixed earlier). Assert a known `scoreBefore` → expected impact label.
3. **Lift indicator two-state** — renders `before → after` (e.g. `80 → 88`) when `score_after` is present, and
   `before → —` when `score_after` is null. Assert both.
4. **Kanban column mapping** — `ready_for_review` → Review column; `complete` → Done column. A `complete` task must
   NOT render in Review (the desync bug). Assert the status→column mapping.
5. **WorkflowSubNav active state** — the active tab (Tasks or Drafts) shows the active style; links target the
   correct routes. Assert active/inactive per the current route.
6. **Brand-detail Workflow card tier gate** — Free tier → locked/dimmed (Lock icon, not a working link);
   Starter+ → active link to `/workflow`. Assert both tier states.
7. **Action Center aggregate** — in "All brands" mode, recommendation rows show a brand badge; filtering to one
   brand hides the badge; ordering is impact-based (HIGH before MEDIUM before LOW). Assert these.
8. **Dashboard two-state** — "Work Completed" (count) and "Measured Impact" (lift) render as DISTINCT values; a
   completed-but-not-re-audited state shows work done without inflating measured lift. Assert they're separate.
9. **content_drafts status badges** — Draft / Approved / Published / Rejected render with the correct styling per
   status. Assert the status→badge mapping.

(Where a component reads status, ensure tests use the correct spellings: `remediation_tasks` `complete`/
`ready_for_review` etc., `content_drafts` `draft|approved|published|rejected` — don't assert `done`.)

## INVARIANTS
- Mock data only; no DB/network in unit tests. Do NOT run these against any database.
- Report-first: FU-1..3 report failures (component-bug vs wrong-test judgement); only FU-4 changes source,
  post-review.
- Test CURRENT behaviour (the post-session labels/badges/mappings above) — a test asserting pre-fix behaviour
  (e.g. "Done this month" label, `complete` in Review, raw-rank impact badge) is WRONG and must not be written to
  "pass" against a reverted bug.
- Do NOT change component logic to satisfy a test except in FU-4 post-review.

## REPORT
- Per pass (FU-1..FU-4): tests written/added, run results, **failures reported** (component-bug-vs-wrong-test
  judgement each; not auto-fixed except FU-4 post-review).
- Confirmation the post-session assertions are correct: "Completed" label, scoreBefore-derived impact badge,
  lift two-state, kanban column mapping (`complete`→Done not Review), WorkflowSubNav active state, brand-card tier
  gate, Action Center aggregate + badge + ordering, dashboard two-state, draft status badges.
- Final Section 3 status: FU-1..FU-4 green, or blocked rows documented with reasons.
- Total test count after this section (frontend unit added to the existing suite).

## NOTE
Section 3 of 5. After green: Section 4 (Frontend E2E — uses real test data, dev DB, same DB-safety as Section 2),
then Section 5 (QA batch-script). This prompt covers Frontend Unit only.
