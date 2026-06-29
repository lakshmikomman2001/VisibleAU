# Claude Code — Phase 2 Sprint 2 test checklist · SECTION 1 of 5: Backend Unit Tests

Run **Section 1 (Backend Unit Tests)** of the Phase 2 Sprint 2 checklist. FIRST of five — do ONLY this section,
then STOP and report. Sri reviews before Section 2. (Structural verification: DONE — 18/18 §12 checks pass,
zero build gaps.)

> **REPORT-FIRST — strict (same as Sprint 1).** Sprint 2 is structurally verified. If a generated test FAILS,
> the TEST is the more likely culprit. Passes 1–3: **report failures, do NOT change source.** Pass 4 may fix
> the TEST (bad assertion/mock); a genuine source-bug suspect gets **REPORTED to Sri, not patched.** Never
> "fix" verified Sprint 2 code to satisfy a generated assertion.

---

## SCOPE — Section 1 only: backend UNIT tests, MOCK data (LLM_MODE=mock)

Sprint 2's backend surface (test these — they're real, and §11 already specifies the key assertions):

**The 8 lib modules (`lib/workflow/`):**
- **`task-manager.ts`** — CRUD + status transitions enforce the §0.5 enum (open | in_progress | ready_for_review
  | completed | wont_fix; **never 'done'**); `wont_fix_reason` REQUIRED when status='wont_fix' (the Zod refine
  rejects otherwise); on create, sets effort + confidence_label + priority via priority-scorer.
- **`priority-scorer.ts`** — TWO derivations: (a) **confidence_label** from parent audit `quality_status`:
  sufficient→'High', (the rest of the mapping per §6.2); (b) **priority INTEGER** = Impact×ConfidenceWeight ÷
  EffortWeight, ranked; re-rank on quality_status change.
- **`content-generator.ts`** — **recommendation_key (hyphens) → draft_type (underscores)** translation table
  (NO string equality — content-generator owns the mapping); `selectModel` called with `'content_draft'` (NOT
  a hardcoded model).
- **`content-format-selector.ts`** — [GAP 8] detected→draft format map (e.g. product_page→comparison_article,
  other→expert_article).
- **`validation-scheduler.ts`** — 14-day reaudit scheduling + quota gate.
- **`workflow-orchestrator.ts`** — workflow run lifecycle.
- **`progress-summary.ts`** — the **Measured Impact SUM excludes `score_after IS NULL` rows** (the honesty rule —
  deferred/incomplete re-audits don't count toward measured lift). This is a correctness-critical assertion.

**Schema-level unit checks (the 3 tables):** the enum defaults (remediation_tasks 'open', workflow_runs
'scheduled', content_drafts 'draft'), `wont_fix_reason`, `content_format NOT NULL`, the plain-UUID gap columns.

**The §11 required tests** (write/confirm these exact ones):
`task-manager.test.ts`, `priority-scorer.test.ts`, `content-format-selector.test.ts`, `content-generator.test.ts`,
`progress-summary.test.ts` (+ the integration/RLS ones belong to Section 2/5).

Use **MOCK data** (LLM_MODE=mock). Real-DB E2E + RLS is Section 2.

## THE FOUR PASSES (escalating — report failures, don't auto-fix source)

**Pass 1 — Write.** Run existing Sprint 2 backend unit tests first (should pass — 77 green at build). Then
write any missing unit tests for the modules above, hitting the §11 assertions. Mock data. **Run. REPORT.**

**Pass 2 — Deepen + fill gaps.** Untested branches:
- task-manager: each status transition (valid + rejected), wont_fix WITHOUT reason → rejected, the create-time
  priority/confidence/effort wiring.
- priority-scorer: the FULL confidence_label mapping (every quality_status value), the priority formula edge
  cases (zero effort, equal scores → stable rank), re-rank on quality_status change.
- content-generator: the recommendation_key→draft_type table (every mapping pair; a key with no mapping →
  documented fallback), selectModel called with 'content_draft'.
- content-format-selector: every detected→format pair incl the `other→expert_article` fallback.
- progress-summary: the `score_after IS NULL` exclusion (a deferred re-audit row must NOT count toward measured
  impact) — assert the SUM with mixed null/non-null rows.
Add tests (mock). **Run. REPORT failures — don't fix source.**

**Pass 3 — Cross-sprint gaps.** Sprint 2 consumes Sprint 1's platform (selectModel, budget, quality_status) and
provides the shared foundation later sprints use. Test the boundaries: does content-generator's selectModel
call use the Sprint 1 model-selector correctly? Does priority-scorer read quality_status the way Sprint 1 sets
it? Add boundary tests (mock). **Run. REPORT.**

**Pass 4 — Run all + fix (TESTS only unless Sri confirms).** Run ALL backend unit tests. Failures:
- **Wrong test** (bad assertion/mock, alias-import like the Sprint 1 `require("@/...")` issue) → fix the TEST.
- **Genuine source bug** → do NOT fix → REPORT to Sri with evidence (surprising for verified Sprint 2).
- **The known pre-existing `audit_cost_snapshots` cascade failure** (Sprint 1 FK test, was red at build): if it
  surfaces in this run, note it but DON'T chase it here — it's a Sprint 1 FK/cascade test, properly diagnosed
  in Section 2 (backend E2E). Just flag that it's the known pre-existing one.

## RULES
- Section 1 only. No frontend, E2E, or QA sections.
- Report-first: passes 1–3 never modify source. Pass 4 fixes TESTS; source bugs reported.
- Don't duplicate existing tests — extend the existing files.
- Mock data (LLM_MODE=mock). RLS/real-DB is Section 2.

## REPORT (then STOP)
1. Existing Sprint 2 backend unit tests: pass/fail.
2. New tests added (per pass) + what they cover (esp. the §11 assertions + the score_after-NULL honesty rule).
3. Any failures, categorized wrong-test vs possible-source-bug. Source-bug suspects listed separately for Sri.
4. Note if the known `audit_cost_snapshots` pre-existing failure appeared (don't fix — Section 2).
5. Final backend-unit suite status (green via test corrections only); confirm no source changed (list any
   source-bug cases for Sri, don't apply).
6. State "Section 1 complete — awaiting review before Section 2."
