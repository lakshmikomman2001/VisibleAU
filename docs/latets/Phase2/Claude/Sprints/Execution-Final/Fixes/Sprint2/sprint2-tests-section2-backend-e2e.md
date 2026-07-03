# Claude Code — Sprint 2 Automated Tests: Section 2 (Backend E2E Integration)

Execute **Section 2 (Backend End-to-End Integration Tests)** of the Phase 2 Sprint 2 test checklist
(`phase2-sprint-2-test-checklist.md`). Section 1 (Backend Unit) is done. Work the BE-1 → BE-4 passes below.

## ⚠️ DATABASE — handle this yourself, do NOT ask
These E2E tests CREATE and TEAR DOWN real test data. They must run against the **DEV database, NOT prod.** The repo
was recently pointed at the PROD database for a migration smoke-test, so DO NOT assume the current connection is
safe.
- First, determine which DB the test connection will use (check the test env / `DATABASE_URL` the test runner
  loads — `.env.test`, `.env.local`, vitest/jest config, whatever applies).
- If it points at **prod**, switch the TEST run to the dev database (use the dev `DATABASE_URL` for the test
  command only — do NOT change the app's runtime config, do NOT touch prod). Confirm in your report which DB the
  tests actually ran against.
- If there's no separate dev/test DB configured, STOP and report that — do NOT run data-mutating E2E tests against
  prod. (A test DB / dev DB is required for this section.)

## ⚠️ RLS test role (critical — false-pass trap)
Any RLS isolation test MUST run under a **non-superuser** role: `SET ROLE rls_test_role` (or the project's test
role). NEVER as `postgres`/superuser — superusers BYPASS all row-level security, even with `FORCE ROW LEVEL
SECURITY`, giving a FALSE pass (perfect-looking isolation that proves nothing). Report which DB role the test
connection used for RLS assertions.

## Safety rule (report-first)
- **BE-1, BE-2, BE-3 (write/deepen/cross-sprint):** generate tests, run them, **REPORT failures for review** — do
  NOT auto-edit source to make them pass. A failure may be a code bug OR a wrong test; decide which before any
  source change.
- **BE-4 (run all + fix):** ONLY this pass may change source to get green — and only AFTER BE-1..3 failures have
  been reported/reviewed.
- A pass is "Done" only when its tests actually ran. Never invent passing results. Use "Done - errors fixed" if
  code was changed; "Blocked - <reason>" if it couldn't complete.

---

## TEST TARGETS (Sprint 2, Layer 5 — Workflow Intelligence)
- **Tables:** `remediation_tasks`, `workflow_runs`, `content_drafts`
- **Inngest functions:** `generateContentDraft`, `triggerValidationReaudit`, `scheduleWorkflowRuns` (+ the
  bulk-reaudit + audit-schedules functions touched this session)
- **API routes:** the workflow/tasks/drafts routes, the complete route, the re-audit path.

## THE PASSES

### BE-1 — Write
Write Sprint 2 backend E2E integration tests (DB + API) using **real test data in the dev/test DB**. Cover the
Workflow Completion Engine loop end-to-end at the integration level:
recommendation → create task → generate draft → approve/reject → complete → re-audit → lift recorded.
REPORT results (do not auto-fix).

### BE-2 — Deepen + fill gaps
Analyse the backend deeply; find gaps in the E2E coverage (error paths, edge cases, RLS, idempotency), add tests
(real DB test data). REPORT failures.

### BE-3 — Cross-sprint gaps
Analyse across Sprints 1→2; add E2E tests where Sprint 2 code interacts with earlier sprints (audits, quota,
tier→engines, brand isolation). REPORT failures.

### BE-4 — Run all + fix
Run ALL backend E2E tests; fix code/test issues until green (post-review only). Includes the known-failure
diagnosis below.

---

## ⚠️ ASSERTIONS THAT MUST BE CORRECT (post-session — the checklist predates these fixes)
The tests MUST assert the CURRENT (fixed) behaviour, not the old buggy contracts. Critical:

1. **`audit.run` is the audit event — NOT `audit/start`.** The re-audit flow (and all audit-firing paths) emit
   `audit.run` (dot) with `{ auditId }`, and an `audits` row is created BEFORE the run. Tests for
   `triggerValidationReaudit` / scheduled / bulk re-audit MUST assert `audit.run` + audit-row-first. If any test
   asserts `audit/start`, it's wrong — `audit/start` is the dead event that caused this session's bug. (Do NOT let
   a test pass by asserting the old broken contract.)

2. **Idempotent completion:** completing an already-`complete` task is a **no-op SUCCESS (200)**, NOT a 400. Assert:
   `complete` → `complete` returns success (the task), does not throw "cannot transition from complete to
   complete". Other invalid transitions still rejected.

3. **Decoupled completion event (`reauditQueued`):** the complete route commits the DB then emits `task/completed`
   in a SEPARATE try/catch. If the event send fails, the route returns **200** with `reauditQueued: false` (logged,
   NOT swallowed silently, NOT a 400). Assert: DB-commit success → 200 regardless of event delivery; event failure
   is surfaced via the flag, not a 500/400. (If feasible, simulate an event-send failure and assert 200 +
   `reauditQueued:false`.)

4. **Three status spellings — NEVER unified (assert explicitly):**
   - `remediation_tasks.status` ∈ `open | in_progress | ready_for_review | complete | wont_fix` (`complete`, no -d;
     NOT `done`).
   - `workflow_runs.status` = `completed` (WITH -d).
   - `audits.status` = `complete` (no -d).
   - `content_drafts.status` ∈ `draft | approved | published | rejected`.
   Assert the distinct spellings hold (a task is `complete`, its workflow_run is `completed`, its audit is
   `complete`) — they must not be conflated.

5. **MI-01 idempotency on Inngest functions:** assert a RE-DELIVERED event does NOT double-write (e.g. re-sending
   `task/completed` or `draft/generate` doesn't create duplicate rows / double-fire the re-audit).

6. **`assertBrandAccess(user, brandId)` on brand-scoped surfaces:** assert brand-isolation (org RLS alone is
   insufficient). NOTE: `assertBrandAccess` is stored-but-inert until Sprint 8 — so test what's actually enforced
   NOW (org-level RLS isolation), and mark brand-level `assertBrandAccess` enforcement as a Sprint 8 target if the
   gate isn't yet wired. Report which isolation level is actually testable.

7. **Inngest registration:** assert the Sprint 2 Inngest functions are registered in the single
   `app/api/webhooks/inngest/route.ts` `serve()` array.

8. **Re-audit → lift:** assert `triggerValidationReaudit` (post-sleep) creates an audit row, runs it, and writes
   `score_after` + `lift_achieved = score_after − score_before` to the task; the honesty rule (`score_after IS NOT
   NULL` gates measured lift) holds. (The sleep can be stubbed/short-circuited in the test.)

## KNOWN FAILURE TO DIAGNOSE (in BE-4)
There is a pre-existing failing test around **`audit_cost_snapshots` (FK-cascade)** — the lone red in the
otherwise-green suite. In BE-4:
- Diagnose WHY it fails (FK constraint / cascade-delete ordering / missing parent row / test-teardown order).
- Determine: is it a **real code/schema bug** (FK cascade misconfigured) or a **wrong test** (teardown deletes
  parent before child, or seeds in wrong order)?
- REPORT the root cause + proposed fix BEFORE changing source (per the safety rule). If it's a test-ordering issue,
  fix the test; if it's a genuine FK/cascade defect, report it for review.

---

## REPORT
- **Which DB the tests ran against** (confirm DEV/test, not prod) + the RLS role used (`rls_test_role`, not
  superuser).
- Per pass (BE-1..BE-4): tests written/added, run results, and **failures reported** (with code-bug-vs-wrong-test
  judgement for each — not auto-fixed except in BE-4 post-review).
- Confirmation the post-session assertions are correct: `audit.run` (not `audit/start`), idempotent completion,
  `reauditQueued` decoupling, the three status spellings, MI-01 idempotency, brand isolation (+ Sprint 8 note),
  Inngest registration, re-audit→lift + honesty rule.
- **`audit_cost_snapshots` diagnosis:** root cause + whether it's a code bug or a wrong test + the fix applied (or
  proposed).
- Final Section 2 status: BE-1..BE-4 green, or blocked rows documented with reasons.
- Reminder noted: this is the automated pass; the manual on-screen UI review (already done this session for the
  core loop) is the separate track — tests passing ≠ works on screen.

## NOTE
This is Section 2 of 5. After it's green: Section 3 (Frontend Unit), Section 4 (Frontend E2E), Section 5 (QA
batch-script). Do those in subsequent passes — this prompt covers Backend E2E only.
