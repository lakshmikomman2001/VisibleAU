# Claude Code — Phase 2 Sprint 1 test checklist · SECTION 2 of 5: Backend E2E Integration

Run **Section 2 (Backend End-to-End Integration Tests)** of the Phase 2 Sprint 1 checklist. SECOND of five —
do ONLY this section, then STOP and report. Sri reviews before Section 3. (Section 1 backend-unit: DONE, 144
green, zero source bugs.)

> **REPORT-FIRST — strict (same as Section 1).** Sprint 1 is verified working (greps + RLS/FK behaviourally
> proven). If a generated test FAILS, the TEST is the more likely culprit. Passes 1–3: **report failures, do
> NOT change source.** Pass 4 may fix the TEST (bad assertion/setup); a genuine source-bug suspect gets
> **REPORTED to Sri, not patched.** Never "fix" verified Sprint 1 code to satisfy a generated assertion.

> **⚠️ RLS TEST ROLE — non-negotiable.** This section hits the real DB, so RLS is live. Any test that exercises
> RLS isolation MUST run under a **non-superuser** role (`SET ROLE rls_test_role`), NEVER as `postgres`/
> superuser. Superusers bypass ALL row-level security — even with `FORCE ROW LEVEL SECURITY` — so testing as
> one gives a FALSE PASS (perfect-looking isolation that proves nothing). This trap already sprang once on this
> project's Sprint 1 verification. **Confirm and REPORT which DB role each RLS test ran under.** A passing RLS
> test as superuser = invalid, re-run under the non-superuser role.

---

## SCOPE — Section 2 only: backend E2E with REAL DB test data

Unlike Section 1 (mock data), these tests use **real rows in a real database** — seed test data, run the
service against it, assert the DB state. Sprint 1's E2E-relevant surface:

- **The 7 platform tables** actually created + their constraints firing against real rows:
  `config_bundle_cache`, `metric_quality_gates`, `provider_market_capabilities`, + the others, plus the
  `audits` ALTER columns (`config_bundle_id` FK, `config_digest`, `estimated_cost_cents`, `quality_status`).
- **RLS posture (§5.4):** Sprint 1 tables are GLOBAL SEED CONFIG (`metric_quality_gates`,
  `provider_market_capabilities`) — they have a specific RLS posture (no tenant scoping). Test that the
  global-config tables behave per their declared posture, AND that any tenant-scoped table isolates correctly
  under a non-superuser role. Confirm the §5.4 posture matches reality.
- **FK behaviour against real rows:** the `audits.config_bundle_id → config_bundle_cache(id)` FK (and the
  budget_policy FK from the earlier behavioural test) — seed parent+child, delete parent, confirm the declared
  ON DELETE rule (CASCADE / SET NULL) actually fires. (This re-confirms behaviourally at the integration level.)
- **Services against real DB:** `BudgetPolicyService.record()` actually writing a row to the DB at audit
  completion; `ProviderCapabilityRegistry.getEnabledProviders()` reading the seeded `provider_market_capabilities`
  rows and returning the 4 AU_EN providers (with `anthropic.supports_citations=false`).
- **Seeds against real DB:** run/verify the two mandatory seeds populate correctly — 7 `metric_quality_gates`
  AU_EN rows, 4 `provider_market_capabilities` providers, all `is_enabled=true`, correct capability matrix.

Use a THROWAWAY/test schema or clearly-tagged test rows; clean up after.

## THE FOUR PASSES (report failures, don't auto-fix source)

**Pass 1 — Write.** Run existing Sprint 1 backend E2E/integration tests first (should pass). Then write E2E
tests with **real DB data** for the surface above: seed rows → run service → assert DB state. **Run. REPORT
results.** For any RLS test, state the DB role used.

**Pass 2 — Deepen + fill gaps.** Find untested integration paths against real data: `record()` writing the
correct cost row, the provider registry returning the seeded matrix, FK cascade/set-null firing on real
parent/child rows, the global-config tables' RLS posture (§5.4) holding, unique constraints rejecting dup rows
(`UNIQUE(metric_key, market_code)`, `UNIQUE(provider_key, model_key, market_code, locale)`). Add tests (real
DB). **Run. REPORT failures — don't fix source.**

**Pass 3 — Cross-sprint gaps.** Test Sprint 1's tables/services as the foundation other sprints build on:
does an audit row with the new ALTER columns persist + read back correctly? Does the budget row written by
`record()` have the shape later sprints query? Add integration tests for these boundaries (real DB). **Run.
REPORT.**

**Pass 4 — Run all + fix (TESTS only unless Sri confirms).** Run ALL backend E2E/integration tests. Failures:
- **Wrong test** (bad setup, wrong expected DB state, superuser-RLS false-negative) → fix the TEST.
- **RLS test that passed as superuser** → INVALID → re-run under non-superuser role; report the corrected result.
- **Genuine source bug** → do NOT fix → REPORT to Sri with evidence (surprising for verified Sprint 1).

## RULES
- Section 2 only. No frontend, no QA section.
- Report-first: passes 1–3 never modify source. Pass 4 fixes TESTS; source bugs reported, not patched.
- **RLS under non-superuser role always** — report the role for every RLS test. Superuser pass = invalid.
- Real DB test data (not mocks). Clean up test rows after. Don't run unscoped UPDATE/DELETE.
- Extend existing test files where sensible; don't duplicate.

## REPORT (then STOP — do not proceed to Section 3)
1. Existing Sprint 1 backend E2E tests: pass/fail.
2. New E2E tests added (per pass) + what real-DB behaviour each verifies.
3. **For every RLS test: which DB role it ran under** (must be non-superuser; flag any that used postgres).
4. FK cascade/set-null + unique-constraint results against real rows.
5. Any failures, categorized wrong-test vs possible-source-bug. List source-bug suspects separately for Sri.
6. Final backend-E2E suite status (green, via test corrections only) + confirm cleanup of test rows.
7. Confirm no source changed (list any source-bug cases for Sri, don't apply).
8. State "Section 2 complete — awaiting review before Section 3."
