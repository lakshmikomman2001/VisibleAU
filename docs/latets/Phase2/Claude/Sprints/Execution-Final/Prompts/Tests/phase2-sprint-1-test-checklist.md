# Phase 2 Sprint 1 — Test Checklist: Platform Foundation (Platform)

> Testing checklist for **Phase 2 Sprint 1**, modelled on the Phase 1 testing workflow.
> Run this **after** Phase 2 Sprint 1 is built. Mark each box `[x]` and note status (Done / Done - fixed / Blocked - reason).

## Before you start

- [ ] **Sprint built** — confirm Phase 2 Sprint 1's code exists in the repo. If it doesn't, STOP — the build hasn't happened yet; testing has nothing to target.
- [ ] **Canon check** — the build was done against LLD v8.68 (the canonical `Execution/Design/visibleau-7layer-lld.md`).
- [ ] **Seed/brand ready** — a test brand (e.g. Bondi Plumbing) exists for brand-scoped surfaces, with DB **test data** for the E2E sections.
- [ ] **RLS test role (critical)** — any RLS isolation test MUST run under a **non-superuser** role (`SET ROLE rls_test_role`), NEVER as `postgres`/superuser. PostgreSQL superusers bypass ALL row-level security — even with `FORCE ROW LEVEL SECURITY` (that flag only affects the table owner, not superusers). Testing as a superuser gives a FALSE pass (perfect-looking isolation that proves nothing). Confirm which DB role the test connection used.

## What this sprint added (test targets)

- **Tables:** the platform-foundation tables (rows 1–7 of the table inventory) + the `audits` ALTER
- **Inngest functions:** (Sprint 1 adds platform tables + the audits ALTER; confirm whether any net-new Inngest function is in scope — usually none)
- **UI components:** the app shell, sidebar/nav, brand switcher, tier-aware navigation
- **Tier gating:** tier-aware navigation (nav items appear/lock by tier)

## Safety rule for this run (report-first)

- The **write** and **gap-fill** passes: generate tests, run them, and **REPORT failures for review** — do NOT auto-edit source to make them pass. A failure might be a code bug OR a wrong test; you decide which before any source changes.
- Only the **"run all + fix"** rows (the last row in each section) may change code to get green — and only after the earlier passes' failures have been reviewed.
- A box is `Done` only when its tests actually ran. Never invent passing results. Use `Done - errors fixed` if code was fixed; `Blocked - <reason>` if it couldn't complete.

---

### 1. Backend Unit Tests

- [ ] **BU-1 Write** — Write Phase 2 Sprint 1 unit tests for the backend (database + API) covering this sprint's tables and routes (the platform-foundation tables (rows 1–7 of the table inventory) + the `audits` ALTER). Use **mock data**. REPORT results, don't auto-fix.
- [ ] **BU-2 Deepen + fill gaps** — Analyse the backend source deeply for Phase 2 Sprint 1; find gaps in the unit tests, fill them, add new tests (mock data). REPORT any failures for review — don't change source yet.
- [ ] **BU-3 Cross-sprint gaps** — Analyse the backend across Sprints 1→1; find gaps where this sprint's code interacts with earlier sprints, add tests (mock data). REPORT failures.
- [ ] **BU-4 Run all + fix** — Run ALL backend unit tests and fix any code/test issues until green. (This row may change source — only after BU-1..3 failures were reviewed.)

### 2. Backend End-to-End Integration Tests

- [ ] **BE-1 Write** — Write Phase 2 Sprint 1 backend end-to-end integration tests (DB + API) using **real test data in the database**. REPORT results.
- [ ] **BE-2 Deepen + fill gaps** — Analyse the backend deeply; find gaps in the E2E integration tests, fill them, add new tests (real DB test data). REPORT failures.
- [ ] **BE-3 Cross-sprint gaps** — Analyse across Sprints 1→1; add E2E tests for cross-sprint backend flows (real DB test data). REPORT failures.
- [ ] **BE-4 Run all + fix** — Run ALL backend E2E integration tests and fix any issues until green. (May change source — post-review.)

### 3. Frontend Unit Tests

- [ ] **FU-1 Write** — Write Phase 2 Sprint 1 frontend unit tests for this sprint's components (the app shell, sidebar/nav, brand switcher, tier-aware navigation). Use **mock data**. REPORT results.
- [ ] **FU-2 Deepen + fill gaps** — Analyse the frontend source deeply for Phase 2 Sprint 1; find gaps in the unit tests, fill them, add new tests (mock data). REPORT failures.
- [ ] **FU-3 Cross-sprint gaps** — Analyse the frontend across Sprints 1→1; add tests for cross-sprint UI interactions (mock data). REPORT failures.
- [ ] **FU-4 Run all + fix** — Run ALL frontend unit tests and fix any issues until green. (May change source — post-review.)

### 4. Frontend End-to-End Integration Tests

- [ ] **FE-1 Write** — Write Phase 2 Sprint 1 frontend end-to-end integration tests for this sprint's screens (the app shell, sidebar/nav, brand switcher, tier-aware navigation). REPORT results.
- [ ] **FE-2 Deepen + fill gaps** — Analyse the frontend deeply; find gaps in the E2E tests, fill them, add new tests (real DB test data). REPORT failures.
- [ ] **FE-3 Cross-sprint gaps** — Analyse across Sprints 1→1; add frontend E2E tests for cross-sprint flows (real DB test data). REPORT failures.
- [ ] **FE-4 Run all + fix** — Run ALL frontend E2E integration tests and fix any issues until green. (May change source — post-review.)

### 5. QA

- [ ] **QA-1 Batch-script run** — Run each feature's batch script yourself. Confirm the script closes & relaunches BOTH the backend API and the frontend app, then exercises the feature with **real test data**. Mark Done only after you've watched it run end-to-end.

---

## Phase 2 Sprint 1 — specific things the tests MUST assert

- [ ] Any Inngest function registers in the SINGLE `app/api/webhooks/inngest/route.ts` serve() array — never create `app/api/inngest/route.ts`.
- [ ] RLS context (`setRlsContext`) must be set on every brand/org-scoped query.
- [ ] This is the foundation — its tables underpin every later sprint; test the schema + RLS isolation hard.

---

## Final

- [ ] All five sections green (or blocked rows documented with reasons).
- [ ] Sprint-specific assertions above all covered.
- [ ] Note: this is the automated/test-suite pass. The separate manual on-screen review of Phase 2 Sprint 1's UI (two-chat relay + the UI test plan) is still required — tests passing ≠ works on the rendered screen with real data.
