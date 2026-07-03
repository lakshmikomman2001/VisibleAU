# Claude Code — Sprint 3 Section 2 · BE-4: RUN ALL + FIX (closes Section 2)

Final pass of Section 2. BE-1 (72) + BE-2 (62) were green with **0 source bugs**; BE-3 (cross-sprint seams) ran —
**this pass re-runs the ENTIRE Sprint 3 suite fresh** (Section 1 unit + Section 2 BE-1/BE-2/BE-3), reports the
complete current state, and is the **only pass allowed to change source** — and only to fix a genuine regression a
test surfaced (post-review), never to force a wrong test green.

> **This is the fix pass:** if a real code bug is red, fix it and document it. If a red is a wrong-test, fix the
> test. If a red is a real cross-sprint seam mismatch from BE-3, triage (code vs test) then fix the correct side.
> **Dev DB only.** RLS under **`rls_test_role` (non-superuser)**.

## STEP 1 — Run the WHOLE Sprint 3 suite and report the full fresh result
```bash
npx vitest run tests/phase2/sprint3/ --reporter=verbose 2>&1 | tail -160
```
Report:
- **Total pass/fail/todo counts** across ALL Sprint 3 files (Section 1 + BE-1/2/3).
- **Every failure** (if any): test name + file, which behaviour/seam, expected vs actual.
- **In particular, surface whatever BE-3 (cross-sprint) found** — since its report may not have been reviewed yet,
  BE-4's full run is the authoritative current state. Explicitly call out any cross-sprint seam failure (S1 budget /
  S2 remediation_tasks FK / wins-feed / classify.ts / vertical_pack_prompts / the audit.complete event alignment /
  serve() array).

## STEP 2 — Triage each failure (if any)
For each red:
- **Code bug** (the product is wrong) → fix the source, minimally and correctly; note the file + change + why.
- **Wrong test** (the assertion was incorrect) → fix the test; note why the expectation was wrong.
- **Environment/tooling** (e.g. the earlier `require()` vs `await import()` alias issue, or a bad UUID fixture) →
  fix the test/setup, not the source; note it.
Do NOT force a test green by weakening it or by changing source to match a wrong assertion.

## STEP 3 — Fix + re-run to green
Apply the fixes, re-run the full suite, confirm green (or document any row that stays blocked, with the reason).

## INVARIANTS (must remain true after BE-4)
The regression guards from the whole track must be green — do NOT let a fix erode them:
- `audit.complete` wiring (dot) — the 5 functions fire + UPSERT; MI-01 idempotent (no double-write on re-deliver).
- SoV resolves brand from **brands.domain** (not audit.metadata.domain); brand not its own competitor; engine
  aggregation (one row per domain).
- Fan-out: `{location}` substituted (real suburb, no literal token; region-less → graceful fallback, no leak);
  latest-audit scoping; ≤ Sprint 1 budget cap; `selectModel` (no hardcoded models/engines).
- Routes behavioural: real 401 (unauth) / 404 (cross-org) / 400 (bad Zod) / 200; tier gates enforced.
- CPR-01: competitive-benchmark comparisonData null + no generateText + 200 (not 500); citation-failure 200 + valid
  diagnosis when S5/S7 absent.
- Trend: numeric score columns (scoreSentimentNumeric/scoreContextNumeric, not text); ×100 rates; ratio NULL on
  mention=0 → 'invisible'; exact period_label; volatility > 15.0 boundary.
- RLS cross-org isolation on the 6 tenant tables (non-superuser); prompt_volume_estimates global; the two FK ON
  DELETE SET NULL.
- wins-feed reads real S2 remediation_tasks + Phase 1 citations + S3 trends; "likely linked to:" attribution;
  LIMIT 20 / max 50.
- go-live #12 TLD-variant normalisation stays a `test.todo` (NOT silently "fixed" — it's a real pre-launch item).
- `subscriptions.tier` (never `organizations.tier`); TS strict, no `any`.

## VERIFY / REPORT (Section 2 closeout)
- Final counts: total passed / failed / todo across the full Sprint 3 suite.
- **What BE-3 surfaced** (from this authoritative full run) + how each was resolved (code fix / test fix / none).
- Every source change BE-4 made, with the reason (should be minimal — BE-1/BE-2 found 0 source bugs; only BE-3
  seam mismatches, if any, would drive source changes here).
- Confirm all the INVARIANT guards above are green (none eroded by a fix).
- Confirm: dev-DB only; RLS under rls_test_role; test data torn down; #12 still a todo.
- **Section 2 (Backend E2E) status: COMPLETE** — or list any blocked row with its reason.

## NEXT — Section 3 (Frontend Unit)
Components with **mock data**: `sov-donut.tsx` (⚠️ **now renders ranked BARS, not a donut** — update/replace any
donut-specific DOM assertions to assert the bars: brand row highlighted via `--layer-visibility` + "you" chip,
competitors muted, percentages, engine tabs, sorted by share DESC), `mention-source-matrix.tsx` (active archetype
quadrant), `fan-out-tree.tsx` (threshold accent + quality dot), `topical-gap-list.tsx` (leverage badge),
`dashboard-sov-strip.tsx` (same bars). Then Section 4 (Frontend E2E) and Section 5 (QA / batch-script run).
