# Claude Code — Sprint 2 Automated Tests: Section 4 (Frontend E2E Integration — Playwright)

Execute **Section 4 (Frontend End-to-End Integration Tests)** of the Phase 2 Sprint 2 test checklist
(`phase2-sprint-2-test-checklist.md`). Sections 1, 2, 3 are done and green. Work the FE-1 → FE-4 passes. These are
**real-browser, real-data** tests via **Playwright** (the project's E2E framework — `@playwright/test`, `e2e/`
dir, `test:e2e` script). They exercise the actual Sprint 2 screens end-to-end.

## ⚠️ DATABASE — handle this yourself, do NOT ask
These E2E tests drive the real app against a real DB and CREATE/TEAR DOWN test data. They must run against the
**DEV/test database, NOT prod.** The repo was recently pointed at the PROD database for a smoke-test — do NOT
assume the current connection is safe.
- Determine which DB the app/test run will use (the `DATABASE_URL` the app loads when Playwright starts it, or the
  webServer config in `playwright.config.ts`).
- If it points at **prod**, configure the E2E run to use the dev/test database (for the test run only — do NOT
  change prod, do NOT leave the app pointed at prod). Confirm in the report which DB the E2E run actually used.
- If no separate dev/test DB exists, STOP and report — do NOT run data-mutating E2E against prod.

## ⚠️ APP + INNGEST must be running (the loop depends on events)
Sprint 2 E2E covers flows that fire Inngest events (draft generation, task completion → re-audit). For these to
work end-to-end:
- The Next.js app must be running (Playwright's `webServer` config can start it, or it runs separately).
- **Inngest must be reachable in DEV mode** — the client now keys dev/cloud off `isDev`/`NODE_ENV` (fixed this
  session). For E2E, ensure the app runs with the local Inngest dev server reachable (dev mode), so
  `draft/generate` and `task/completed` events actually process. If the E2E environment can't run Inngest, tests
  that depend on async event completion (draft appearing, lift populating) must either (a) run with Inngest up, or
  (b) be written to assert the synchronous/queued state + poll for the async result with a sensible timeout — NOT
  silently pass when the event never fired. Report how event-dependent steps are handled.
- Note: `triggerValidationReaudit` has a 14-day `step.sleep`. For E2E, do NOT wait 14 days — either assert up to
  the point the re-audit is queued, or use the established test approach (short-circuit/stub the sleep) so the
  lift step can be exercised. Report which.

## Safety rule (report-first)
- **FE-1, FE-2, FE-3:** write E2E tests, run them, **REPORT failures for review** — do NOT auto-edit source to make
  them pass. A failure may be a real app bug OR a flaky/wrong test; decide which before any source change.
- **FE-4 (run all + fix):** ONLY this pass may change source to get green — and only AFTER FE-1..3 failures are
  reviewed.
- A pass is "Done" only when its tests actually ran. Never invent passing results. "Done - errors fixed" /
  "Blocked - <reason>".

---

## TEST TARGETS (Sprint 2 screens — Layer 5)
Checklist names WorkflowHub, ContentDraftEditor, EnhancedDashboard (workflow strip). Include this session's new
surfaces. Drive the real screens on a seeded test brand (e.g. a Bondi-equivalent test brand in the dev DB).

## THE PASSES

### FE-1 — Write
Write Sprint 2 Playwright E2E tests for the screens, real test data. Cover the **full Workflow Completion Engine
loop through the UI**:
1. Navigate from the brand detail page → the **Workflow card** → the Workflow hub (the entry point added this
   session — assert you can reach it without typing the URL).
2. WorkflowHub → **Tasks | Drafts sub-nav** works (tab switching).
3. From a recommendation (Action Center) → **Create task** → task appears in the kanban **Open** column with the
   correct **impact badge**.
4. Move task across columns (Open → In Progress → Review → Done) via the drag/"Move to" controls; assert the
   column placement matches status (`ready_for_review`→Review, `complete`→Done — NOT complete-in-Review).
5. **Generate draft** from a task → (with Inngest up) the draft appears in the Drafts tab with content + format
   chip + word count.
6. Open the draft → **Approve** (and separately **Reject**) → status badge updates (Approved / Rejected).
7. **Complete** a task → it lands in Done; (with Inngest up + sleep short-circuited) the **re-audit runs** and the
   task card shows the **lift** (`before → after`, e.g. `80 → 88`) instead of `→ —`.
8. **Dashboard** "Work Completed" / "Measured Impact" reflects completed work (two-state).
REPORT results.

### FE-2 — Deepen + fill gaps
Find gaps: error states (e.g. draft generation when a backend dependency is unavailable — assert a clean error,
not a crash), empty states (no tasks / no drafts), the **Action Center "All brands ▾"** filter (aggregate vs
single-brand, brand badges), tier-gated Workflow card (locked for Free). Add tests (real test data). REPORT
failures.

### FE-3 — Cross-sprint gaps
Add E2E for cross-sprint flows: brand creation (Sprint 1) → run audit (earlier) → recommendation appears → create
task (Sprint 2) → full loop; brand-isolation at the UI level (a user/org cannot see another's brand/tasks). REPORT
failures.

### FE-4 — Run all + fix
Run ALL frontend E2E tests; fix app/test issues until green (post-review only).

---

## ASSERTIONS THAT MUST BE CORRECT (post-session — the checklist predates these)
1. **Reachability:** the Workflow area is reachable from the brand detail page via the **Workflow card** (no URL
   typing) — the orphaned-nav fix. And within Workflow, the **Tasks | Drafts** tabs navigate.
2. **Kanban column mapping on screen:** a `complete` task renders in **Done**, never in **Review** (the desync bug
   fixed this session). Assert by completing a task and confirming it's in Done.
3. **Idempotent completion (UI):** completing an already-complete task does NOT throw a visible
   "complete to complete" error / does not get stuck (the self-heal). If reproducible, assert no error banner.
4. **Lift renders on the card:** after re-audit, the task card shows `before → after` (e.g. `80 → 88`), not `→ —`.
5. **Draft loop:** generate → draft appears (Inngest up) → Approve/Reject updates the badge.
6. **Action Center aggregate:** "All brands" shows multiple brands' recs with brand badges; filter narrows to one;
   creating a task from the aggregate view creates it for the correct brand.
7. **Dashboard two-state:** Work Completed (count) and Measured Impact (lift) are distinct on screen.
8. **Stat label "Completed"** (not "Done this month").

(Use the correct status spellings throughout; a `complete`-in-Review assertion would be testing the OLD bug — do
not write tests that "pass" against pre-fix behaviour.)

## INVARIANTS
- DEV/test DB only — never prod. Confirm which DB the E2E run used.
- Inngest in dev mode for event-dependent steps (or poll-with-timeout / stubbed sleep — never silent-pass on a
  never-fired event). Report how handled.
- Report-first: FE-1..3 report failures (app-bug vs flaky/wrong-test judgement); only FE-4 changes source,
  post-review.
- Test CURRENT behaviour (post-session): reachable Workflow nav, `complete`→Done, lift rendering, "Completed"
  label, aggregate Action Center, two-state dashboard. A test asserting pre-fix behaviour is wrong.
- Playwright E2E should be resilient (proper waits/locators, not arbitrary sleeps) to avoid flake.

## REPORT
- **Which DB the E2E run used** (confirm DEV/test, not prod) + how Inngest/event-dependent steps + the 14-day
  sleep were handled.
- Per pass (FE-1..FE-4): tests written/added, run results, **failures reported** (app-bug-vs-flaky/wrong-test each;
  not auto-fixed except FE-4 post-review).
- Confirmation the post-session assertions are correct: Workflow reachability, `complete`→Done, idempotent
  completion (no stuck/error), lift on card, draft loop, Action Center aggregate, dashboard two-state, "Completed"
  label.
- Final Section 4 status: FE-1..FE-4 green (or blocked rows with reasons).
- Total E2E test count + overall suite count.

## NOTE
Section 4 of 5. After green: **Section 5 (QA — batch-script run)** is the last — run each feature's batch script,
confirm it closes & relaunches BOTH backend + frontend, exercises the feature with real test data, watched
end-to-end. This prompt covers Frontend E2E only.
