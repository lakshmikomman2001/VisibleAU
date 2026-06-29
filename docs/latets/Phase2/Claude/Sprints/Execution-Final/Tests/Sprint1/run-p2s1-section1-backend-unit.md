# Claude Code — Phase 2 Sprint 1 test checklist · SECTION 1 of 5: Backend Unit Tests

Run **Section 1 (Backend Unit Tests)** of the Phase 2 Sprint 1 test checklist. This is the FIRST of five
sections — do ONLY this section, then STOP and report. Sri reviews before Section 2.

> **REPORT-FIRST — strict.** Sprint 1 is ALREADY verified working (structural greps passed, RLS + FK proven
> behaviourally). So if a generated test FAILS, the test is the MORE LIKELY culprit, not the code. In the
> write / deepen / cross-sprint passes you **REPORT failures — do NOT change any source code to make a test
> pass.** A failing test gets reported for Sri to judge (is it a wrong test, or a real bug?). Only the final
> "run-all" pass MAY fix, and even then: fix the TEST if the test is wrong; only touch source if Sri confirms
> it's a genuine code bug. **Never "fix" verified-working Sprint 1 code to satisfy a generated assertion.**

---

## SCOPE — Section 1 only: backend UNIT tests, MOCK data

Sprint 1's backend surface (test these — they're real):
- **Services:** `BudgetPolicyService` (budget-policy.service.ts — estimate/enforce/record, the cost logic),
  `ProviderCapabilityRegistry` (provider-capability.registry.ts — `getEnabledProviders()`, `getBestProvider`,
  `is_enabled` filtering), and the sampling/config services in `lib/platform/`.
- **Tables (schema-level unit checks):** the 7 Sprint 1 platform tables (incl `metric_quality_gates`,
  `provider_market_capabilities`, `config_bundle_cache`) + the `audits` ALTER columns (`config_bundle_id`,
  `config_digest`, `estimated_cost_cents`, `quality_status default 'pending'`).
- **Seeds:** `metric-quality-gates.ts` (7 AU_EN rows), `provider-market-capabilities.ts` (4 AU_EN providers,
  `is_enabled=true`, with `anthropic.supports_citations=false` — the corrected boolean).
- **Existing test files** to extend, not duplicate: `budget-policy.service.test.ts`,
  `provider-capability.registry.test.ts` (+ others in the sprint's test dir).

Use **MOCK data** for these unit tests (no real DB rows needed — mock the inputs). E2E with real DB is Section 2.

## THE FOUR PASSES (escalating — report failures, don't auto-fix)

**Pass 1 — Write.** Run the EXISTING Sprint 1 backend unit tests first (they should pass — Sprint 1 is verified).
Then write any missing unit tests for the services/tables/seeds above. Use mock data. **Run them. REPORT
results — list any failures, do NOT change source.**

**Pass 2 — Deepen + fill gaps.** Analyse the Sprint 1 backend source for untested branches — budget
estimate/enforce edge cases (zero cost, missing policy row, over-budget), provider registry filtering
(`is_enabled=false` rows excluded, empty result when none enabled), the seed values (assert
`anthropic.supports_citations=false`, the 7 quality-gate rows, the 4 providers). Add tests (mock data). **Run.
REPORT failures — don't fix source.**

**Pass 3 — Cross-sprint gaps.** Sprint 1 is the foundation — test where its services are consumed: does
`BudgetPolicyService` produce values the audit path can use? Does the provider registry return the shape later
sprints expect? Add tests for these boundaries (mock data). **Run. REPORT.**

**Pass 4 — Run all + fix (TESTS only unless Sri confirms).** Run ALL backend unit tests. If any fail:
- If the failure is a **wrong test** (bad assertion, wrong expected value, mis-mocked input) → fix the TEST.
- If it looks like a **genuine source bug** → do NOT fix it; REPORT it to Sri with the evidence, because Sprint
  1 is verified and a real bug here would be surprising and worth Sri's eyes.
- Get the suite green by correcting tests; escalate anything that looks like a real code issue.

## RULES
- Section 1 only. Do not run frontend, E2E, or QA sections.
- Report-first: passes 1–3 never modify source. Pass 4 fixes TESTS; source bugs get reported, not silently patched.
- Don't duplicate existing tests — extend the existing files where sensible.
- RLS note (if any test touches RLS): must run under a **non-superuser** role (`SET ROLE`), never as postgres —
  superusers bypass RLS and give false passes. (Mostly Section 2's concern, but applies if a unit test hits the DB.)

## REPORT (then STOP — do not proceed to Section 2)
1. Existing Sprint 1 backend unit tests: pass/fail.
2. New tests added (per pass) + what they cover.
3. **Any failures, with your read: wrong-test vs possible-source-bug.** List source-bug suspects separately for
   Sri to judge.
4. Final backend-unit suite status (green, via test corrections only).
5. Confirm: no source code changed except where Sri would need to approve (and list any such cases — don't apply them).
6. State "Section 1 complete — awaiting review before Section 2."
