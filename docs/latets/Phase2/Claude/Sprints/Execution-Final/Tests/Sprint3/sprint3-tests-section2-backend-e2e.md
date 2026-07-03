# Claude Code — Sprint 3 automated tests · SECTION 2 of 5: BACKEND E2E (DB + API + Inngest, real test data)

Section 2 of the Sprint 3 test track — matches the **Sprint 2 test-checklist structure** (BE-1→BE-4 four-pass),
**report-first**, **dev DB**, `LLM_MODE=mock`. This section uses **REAL test data in the database** (not mocks) —
routes, Inngest functions, and RLS end-to-end.

> ⚠️ **DEV DB ONLY.** These tests SEED and TEAR DOWN real rows. Never run against prod. Confirm the test connection
> points at the dev database.
> ⚠️ **RLS test-role rule (critical):** any RLS isolation test MUST run under a **non-superuser** role
> (`SET ROLE rls_test_role`), NEVER `postgres`/superuser — superusers bypass ALL row-level security (even with FORCE
> RLS), giving a FALSE pass. Confirm which role the RLS test connection used.

## SAFETY RULE (report-first)
- **BE-1..BE-3** (Write / Deepen / Cross-sprint): generate tests, run them, **REPORT failures for review** — do NOT
  auto-edit source to make them pass. A failure may be a code bug OR a wrong test; decide before any source change.
- **BE-4** (Run-all-fix) is the ONLY pass that may change source to get green — and only after BE-1..3 failures were
  reviewed.
- A pass is "done" only when its tests actually ran. Never invent results. Use "Done - errors fixed" if code
  changed; "Blocked - <reason>" if it couldn't complete.

## SPRINT 3 TEST TARGETS (this section)
- **API routes** (`app/api/brands/[id]/...`): visibility, fan-out, topical-gaps, citation-failure,
  competitive-benchmark, wins.
- **Inngest functions** (fire on `audit.complete`, idempotent UPSERTs): calculate-share-of-voice,
  aggregate-visibility-trend, simulate-query-fan-out, calculate-topical-gaps, classify-citation-sources (+ the
  weekly track-brand-web-mentions cron).
- **The 6 new tenant tables** (RLS) + `prompt_volume_estimates` (global, RLS-disabled).
- **remediation_tasks FK constraints** fk_fan_out_gap / fk_topical_gap (ON DELETE SET NULL).

---

## BE-1 — WRITE (real-DB E2E integration tests). REPORT results.
Write Sprint 3 backend E2E tests using real dev-DB test data. Cover:

### The event wiring + functions firing (the behavioural proof, as an automated test)
- **🔒 `audit.complete` wiring:** emit an `audit.complete` event for a seeded audit and assert the **5 visibility
  functions run and UPSERT their tables** (share_of_voice_snapshots, visibility_trends, query_fan_out_results,
  topical_coverage_gaps, + citation classification). Assert the event string is **`audit.complete`** (dot, no
  trailing -d) — the built convention (NOT `audit/completed` or `audit.completed`).
- **🔒 MI-01 idempotency:** re-deliver the same `audit.complete` — assert **no double-write** (UPSERT on the
  documented UNIQUE keys; row counts stable).

### 🔒 CARRIED FROM SECTION 1 — aggregateVisibilityTrend DB behaviour (needs a DB client, deferred here)
- **Numeric source columns:** the trend row is computed from **`scoreSentimentNumeric` / `scoreContextNumeric`**,
  NOT the text `scoreSentiment` / `scoreContext`. Seed audits with known numeric values and assert the trend AVGs
  match (proving the numeric columns were used).
- **Rate math:** `mention_rate` / `citation_rate` stored as **×100 percentages** (0–100), with the exact LLD
  formulas (COUNT DISTINCT promptId … ×100).
- **Ratio NULL guard:** seed data with `mention_rate = 0` → assert `mention_source_ratio` is **NULL** (not 0) and
  archetype **'invisible'**.
- **period_label** exact format ('2026-W23' / '2026-06'); `UNIQUE(brand_id, period_label, period_type)` enforced.
- **Volatility > 15.0** trigger fires on the seeded high-variance case.

### 🔒 CARRIED FROM SECTION 1 — {location} substitution (lives in expand-prompt.ts, upstream of fan-out)
- Where fan-out consumes an expanded prompt, assert the prompt has **`{location}` substituted** from the brand's
  region (e.g. "Bondi, NSW" / "Sydney CBD, NSW"), with **no literal `{location}` token** remaining. (If the
  substitution is best tested directly on `expand-prompt.ts`, add that unit test too — the guard must live
  somewhere; do not drop it.)

### Route-level contracts
- **🔒 Competitive-benchmark CPR-01 null contract:** with `comparison_prompt_results` **empty** (the S3–S6 window),
  the route returns `comparisonData: null` + `competitorNarrative: null` + `dataAvailableFrom: 'Sprint 7'`,
  **status 200 (not 500)**, and **does NOT call generateText** (assert the LLM narrative call is skipped). Tier-gate
  the competitor count (Growth 1 / Agency 3; Starter locked).
- **🔒 Fan-out latest-audit scoping (Bug 5a):** seed **two** completed audits for a brand, each with fan-out rows;
  assert the fan-out route returns **only the latest audit's** rows (no stacked/duplicate ranks across audits).
- **🔒 SoV brand-domain resolution (Bug 1, at the write path):** run calculate-share-of-voice for a seeded audit
  whose `audit.metadata` has **no `domain` key**; assert the SoV rows resolve the brand via **brands.domain** and
  the brand is **NOT** written as its own competitor.
- **Topical-gaps route:** sorted by `cross_prompt_impact DESC NULLS LAST`.
- **Citation-failure route (CPR-01):** with S5/S7 tables empty, returns a valid diagnosis (from topical gaps
  alone), **200 not 500**.
- **Wins route:** Phase A 5 win types; default LIMIT 20, `?limit` max 50; `reason` prefixed "likely linked to:".
- Every route: Better Auth session + org scoping + `assertBrandAccess` on brand-scoped surfaces (org RLS alone is
  insufficient); Zod on params/query; correct status codes.

### RLS (non-superuser)
- **🔒 Cross-org isolation:** under `rls_test_role` (NON-superuser), a user from org A **cannot read** org B's rows
  in the 6 new tenant tables (share_of_voice_snapshots, visibility_trends, brand_web_mentions,
  query_fan_out_results, topical_coverage_gaps, google_ai_mode_results) — cross-org read returns 0 rows / 404, not
  data. WITH CHECK blocks cross-org writes.
- `prompt_volume_estimates` is **global** (RLS disabled) — readable without org scoping (assert it's NOT
  org-filtered).

### The FK constraints
- fk_fan_out_gap / fk_topical_gap on remediation_tasks are **ON DELETE SET NULL**: delete a referenced
  fan_out/topical row → the task's FK column goes NULL (task survives). Re-running the FK migration is a no-op
  (pg_constraint guard).

## BE-2 — DEEPEN + FILL GAPS. REPORT failures.
Analyse the Sprint 3 backend deeply; find gaps in the BE-1 E2E tests, add tests (real DB data). E.g. edge cases:
empty audit (no mentions) → SoV/trend behaviour; a brand with a region vs without ({location} fallback); tier
boundaries on competitive-benchmark; the volatility trigger boundary; UPSERT conflict paths.

## BE-3 — CROSS-SPRINT GAPS (S1→S3). REPORT failures.
Add E2E tests where Sprint 3 interacts with earlier sprints: the `audit.complete` event is emitted by the S-earlier
audit pipeline (assert the S3 functions consume what the pipeline actually emits); fan-out respects the **Sprint 1
budget cap** (`max_fan_out_sub_queries`); wins-feed reads S2 remediation_tasks (gap_closed) + S3 tables; the FK
ALTERs correctly reference S2's remediation_tasks columns.

## BE-4 — RUN ALL + FIX. (May change source — post-review only.)
Run ALL Sprint 3 backend E2E tests. For any failure from BE-1..3 that was reviewed and is a genuine code bug, fix
it and note it. If a failure is a wrong test, fix the test. Report the final green state + every source change made
(with why).

## INVARIANTS
- Dev DB; `LLM_MODE=mock`; RLS tests under `rls_test_role` (non-superuser) — confirm the role.
- Assert **fixed** behaviour: `audit.complete` (dot), brands.domain (not metadata.domain), {location} substituted,
  fan-out latest-audit-scoped, CPR-01 (comparisonData null + no generateText, 200 not 500), numeric score columns,
  ratio-NULL, pp thresholds, MI-01 idempotent.
- `subscriptions.tier` (never `organizations.tier`); `selectModel` (no hardcoded models/engines); TS strict, no
  `any`.
- Report-first: BE-1..3 report failures (no source edits); only BE-4 may change source, post-review.
- Tear down seeded test data; never touch prod.

## VERIFY / REPORT
- BE-1..BE-4 pass/fail counts per pass; the RLS role used (confirm non-superuser).
- Confirm the **carried Section-1 guards landed**: aggregateVisibilityTrend numeric-columns + ×100 rates +
  ratio-NULL; {location} substitution.
- Confirm the **Section-2 regression guards** green: audit.complete wiring + MI-01 idempotency; SoV brands.domain
  write-path; fan-out latest-audit scoping; competitive-benchmark CPR-01 (200, comparisonData null, no generateText);
  citation-failure CPR-01; RLS cross-org isolation on the 6 tenant tables; prompt_volume_estimates global; the two
  FK ON DELETE SET NULL.
- Any genuine regression surfaced (flagged in BE-1..3, fixed in BE-4) — with the source change + reason.
- Final: full suite green (or blocked rows documented); dev-DB only; test data torn down.

## NEXT
Section 3 (Frontend Unit) — the visibility components with mock data, **including updating any donut-specific
assertions to the new ranked-bars** `sov-donut.tsx` (it renders bars now), the mention-source matrix, fan-out-tree,
topical-gap-list, and the dashboard SoV strip. Then Section 4 (Frontend E2E) and Section 5 (QA / batch-script run).
