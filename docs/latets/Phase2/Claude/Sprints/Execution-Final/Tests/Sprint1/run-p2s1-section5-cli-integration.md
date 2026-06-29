# Claude Code — Phase 2 Sprint 1 test checklist · SECTION 5 (adapted): CLI + Service Integration

Phase 2 Sprint 1 is a **backend platform-foundation sprint** — it has NO frontend (LLD-confirmed: §7 CLI, §8
"no new Inngest", §9 "no new API routes"; the app shell/nav/brand UI is Phase 1 and already exists). So
Sections 3 & 4 (Frontend Unit/E2E) are **N/A** and skipped. This adapted Section 5 covers what Sprint 1
*actually* delivers beyond the unit/E2E already done: the **Config Validation CLI** and the **service-
integration wiring** into the existing Phase 1 audit flow. (Sections 1 & 2 backend: DONE.)

> **REPORT-FIRST — strict (same as Sections 1 & 2).** Sprint 1 is verified. Passes report failures; don't
> change source to satisfy a generated assertion. Pass-2 may fix TESTS; genuine source-bug suspects get
> REPORTED to Sri, not patched.

---

## WHY THIS SECTION MATTERS MOST
Sprint 1 built 6 platform services — but services that are built-but-never-called are dead code. The real
end-to-end risk is whether the EXISTING Phase 1 Inngest functions actually INVOKE them. Per the LLD:
- `run-audit.ts` (or `lib/audit/runner.ts` — see ambiguity below) calls `BudgetPolicyService.estimate()`
  **pre-flight**; if `!withinBudget && policy.hardStopOnBudget` → throws `'Budget exceeded'`.
- `refresh-audit.ts` calls `BudgetPolicyService.record()` AND `QualityGateService.evaluate()` **post-scoring**.
If that wiring isn't there, the whole Phase 2 cost/quality system is inert. This section verifies it fires.

> **⚠️ Known ambiguity to RESOLVE (LLD line 509):** §0.2 named the pre-flight wiring target `lib/audit/
> runner.ts`, while §5/§6.2/§8/§10 say `run-audit.ts`. **Find which file ACTUALLY contains the audit run logic
> and the `estimate()` call**, and report it. (One is the real call-site; confirm which, so the test asserts
> against reality.)

---

## PART A — Config Validation CLI (§7)
Test the three CLI commands actually work:
```bash
pnpm visibleau config:validate --market AU_EN --locale en-AU
pnpm visibleau config:coverage --all-enabled-markets
pnpm visibleau config:diff --from v1 --to v2   # (use real bundle versions if present)
```
Verify (write integration tests around the CLI handlers, or run + assert exit codes):
- **`config:validate`** — resolves the active bundle for AU_EN/en-AU, checks `prompt_pack_coverage` is
  'complete', confirms ≥1 enabled provider, validates budget + sampling policy rows exist. **Non-zero exit on
  any failure** (so CI fails). Test BOTH: a valid config → exit 0; a deliberately-broken config (e.g. no
  enabled provider) → non-zero exit + clear message.
- **`config:coverage`** — runs coverage across all markets with ≥1 enabled provider; reports correctly.
- **`config:diff`** — diffs two `config_bundle_cache` versions by `config_digest`/`resolved_config`.
- **CI wiring (§7):** confirm the `config:validate` step is added to the existing CI workflow (LLD 5082). If
  missing, REPORT it (don't silently add — Sri decides).

## PART B — Service Integration into the Phase 1 audit flow (THE KEY TEST)
This is the highest-value check. Verify the services are actually CALLED:

**B1 — Pre-flight estimate + hard-stop (`run-audit.ts` / `runner.ts`):**
- Confirm the audit-run code calls `BudgetPolicyService.estimate()` BEFORE firing LLM calls.
- Confirm the hard-stop: when `!withinBudget && policy.hardStopOnBudget` → it throws `'Budget exceeded'` and
  does NOT proceed to LLM calls. (Integration test: stub a policy with a tiny ceiling → assert the throw +
  that no LLM call fired.)
- **Resolve the file ambiguity** — report whether the call lives in `run-audit.ts` or `lib/audit/runner.ts`.

**B2 — Post-scoring record() + evaluate() (`refresh-audit.ts`):**
- Confirm `refresh-audit.ts` calls `BudgetPolicyService.record(auditId, actual)` after scoring → writes the
  `audit_cost_snapshots` row, **skipping `org.slug='sample'`** (test both: normal org writes a row; sample org
  does NOT).
- Confirm `refresh-audit.ts` calls `QualityGateService.evaluate(auditId)` → sets `audits.quality_status`
  (sufficient/insufficient/partial) based on per-dimension sample counts vs `metric_quality_gates`. (Test: an
  audit with enough samples → 'sufficient'/complete; with too few → the insufficient status; default before
  evaluate → 'pending'.)

**B3 — `serve()` integrity:** confirm NO new Inngest function was registered this sprint (serve() unchanged),
AND the existing serve() array is intact (the 25 Phase 2 functions land later; this sprint adds none).

## THE PASSES (report-first)
1. **Write/run:** exercise the CLI (Part A) + write integration tests for the wiring (Part B) using the real
   DB where needed (RLS under **non-superuser role** if any test touches RLS — superuser = false pass). REPORT.
2. **Deepen:** the failure paths — broken-config exits, the hard-stop throw, sample-org skip, the quality-gate
   thresholds, the file-ambiguity resolution. REPORT failures, don't fix source.
3. **Run all + fix (TESTS only unless Sri confirms):** green the suite via test corrections; escalate any
   genuine source-bug or missing-wiring as a finding for Sri.

> **If the wiring is MISSING** (e.g. `estimate()` is never actually called by the audit runner) — that is a
> genuine Sprint 1 gap, NOT a test to fix. REPORT it prominently for Sri: the service exists but isn't invoked.
> Do not add the wiring yourself; flag it.

## REPORT (then STOP)
1. CLI: each of validate/coverage/diff — works? valid→exit0, broken→non-zero? CI step present or missing?
2. **Wiring B1:** is `estimate()` actually called pre-flight + does the hard-stop throw fire? Which file
   (`run-audit.ts` vs `runner.ts`)?
3. **Wiring B2:** are `record()` (with sample-skip) and `evaluate()` (quality_status) actually called post-scoring?
4. B3: serve() unchanged + intact?
5. Any failures categorized (wrong-test / source-bug / **missing-wiring**). Flag missing-wiring prominently.
6. Final suite status; RLS role for any RLS test; cleanup confirmed; no source changed.
7. State "Section 5 complete — Sprint 1 testing done (Sections 1, 2, 5; 3 & 4 N/A — no frontend)."
