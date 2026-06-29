# Phase 2 Sprint 6 — Test Checklist: Retrieval Intelligence + Agent Readiness (Layer 1)

> Testing checklist for **Phase 2 Sprint 6**, modelled on the Phase 1 testing workflow.
> Run this **after** Phase 2 Sprint 6 is built. Mark each box `[x]` and note status (Done / Done - fixed / Blocked - reason).

## Before you start

- [ ] **Sprint built** — confirm Phase 2 Sprint 6's code exists in the repo. If it doesn't, STOP — the build hasn't happened yet; testing has nothing to target.
- [ ] **Canon check** — the build was done against LLD v8.68 (the canonical `Execution/Design/visibleau-7layer-lld.md`).
- [ ] **Seed/brand ready** — a test brand (e.g. Bondi Plumbing) exists for brand-scoped surfaces, with DB **test data** for the E2E sections.

## What this sprint added (test targets)

- **Tables:** crawler_visit_logs, content_structure_audits (incl entity-home cols), llmstxt_versions, agent_readiness_scores (+ brands.brand_token ALTER)
- **Inngest functions:** crawlerLogIngest, contentStructureAudit, llmstxtRefresh, scoreAgentReadiness, auditEntityHome
- **UI components:** RetrievalHub
- **Tier gating:** passive crawler-logs at Starter+ (not Growth+)

## Safety rule for this run (report-first)

- The **write** and **gap-fill** passes: generate tests, run them, and **REPORT failures for review** — do NOT auto-edit source to make them pass. A failure might be a code bug OR a wrong test; you decide which before any source changes.
- Only the **"run all + fix"** rows (the last row in each section) may change code to get green — and only after the earlier passes' failures have been reviewed.
- A box is `Done` only when its tests actually ran. Never invent passing results. Use `Done - errors fixed` if code was fixed; `Blocked - <reason>` if it couldn't complete.

---

### 1. Backend Unit Tests

- [ ] **BU-1 Write** — Write Phase 2 Sprint 6 unit tests for the backend (database + API) covering this sprint's tables and routes (crawler_visit_logs, content_structure_audits (incl entity-home cols), llmstxt_versions, agent_readiness_scores (+ brands.brand_token ALTER)). Use **mock data**. REPORT results, don't auto-fix.
- [ ] **BU-2 Deepen + fill gaps** — Analyse the backend source deeply for Phase 2 Sprint 6; find gaps in the unit tests, fill them, add new tests (mock data). REPORT any failures for review — don't change source yet.
- [ ] **BU-3 Cross-sprint gaps** — Analyse the backend across Sprints 1→6; find gaps where this sprint's code interacts with earlier sprints, add tests (mock data). REPORT failures.
- [ ] **BU-4 Run all + fix** — Run ALL backend unit tests and fix any code/test issues until green. (This row may change source — only after BU-1..3 failures were reviewed.)

### 2. Backend End-to-End Integration Tests

- [ ] **BE-1 Write** — Write Phase 2 Sprint 6 backend end-to-end integration tests (DB + API) using **real test data in the database**. REPORT results.
- [ ] **BE-2 Deepen + fill gaps** — Analyse the backend deeply; find gaps in the E2E integration tests, fill them, add new tests (real DB test data). REPORT failures.
- [ ] **BE-3 Cross-sprint gaps** — Analyse across Sprints 1→6; add E2E tests for cross-sprint backend flows (real DB test data). REPORT failures.
- [ ] **BE-4 Run all + fix** — Run ALL backend E2E integration tests and fix any issues until green. (May change source — post-review.)

### 3. Frontend Unit Tests

- [ ] **FU-1 Write** — Write Phase 2 Sprint 6 frontend unit tests for this sprint's components (RetrievalHub). Use **mock data**. REPORT results.
- [ ] **FU-2 Deepen + fill gaps** — Analyse the frontend source deeply for Phase 2 Sprint 6; find gaps in the unit tests, fill them, add new tests (mock data). REPORT failures.
- [ ] **FU-3 Cross-sprint gaps** — Analyse the frontend across Sprints 1→6; add tests for cross-sprint UI interactions (mock data). REPORT failures.
- [ ] **FU-4 Run all + fix** — Run ALL frontend unit tests and fix any issues until green. (May change source — post-review.)

### 4. Frontend End-to-End Integration Tests

- [ ] **FE-1 Write** — Write Phase 2 Sprint 6 frontend end-to-end integration tests for this sprint's screens (RetrievalHub). REPORT results.
- [ ] **FE-2 Deepen + fill gaps** — Analyse the frontend deeply; find gaps in the E2E tests, fill them, add new tests (real DB test data). REPORT failures.
- [ ] **FE-3 Cross-sprint gaps** — Analyse across Sprints 1→6; add frontend E2E tests for cross-sprint flows (real DB test data). REPORT failures.
- [ ] **FE-4 Run all + fix** — Run ALL frontend E2E integration tests and fix any issues until green. (May change source — post-review.)

### 5. QA

- [ ] **QA-1 Batch-script run** — Run each feature's batch script yourself. Confirm the script closes & relaunches BOTH the backend API and the frontend app, then exercises the feature with **real test data**. Mark Done only after you've watched it run end-to-end.

---

## Phase 2 Sprint 6 — specific things the tests MUST assert

- [ ] CDN-SHIELD detector lives in `lib/crawler/cdn-shield-detector.ts` (NOT lib/platform/). Requires a CDN fingerprint AND a 403/429/503 status — test that a 200 behind Cloudflare is NOT flagged as blocked. Adds zero schema, zero Inngest functions.
- [ ] VISIT API security: the IP-based throttle runs FIRST, before any DB work (VA-01/BT-01/MW-01) — test the throttle path.
- [ ] TASK-FIT signals live in `score-agent-readiness.ts` (not a local-trust scorer); task_score computes for ALL verticals.
- [ ] `local_ai_trust_score` stays NULL for SaaS in the S6→S8 window. Explainability reuses the S3 service. Inngest in the single webhooks/inngest route.

---

## Final

- [ ] All five sections green (or blocked rows documented with reasons).
- [ ] Sprint-specific assertions above all covered.
- [ ] Note: this is the automated/test-suite pass. The separate manual on-screen review of Phase 2 Sprint 6's UI (two-chat relay + the UI test plan) is still required — tests passing ≠ works on the rendered screen with real data.
