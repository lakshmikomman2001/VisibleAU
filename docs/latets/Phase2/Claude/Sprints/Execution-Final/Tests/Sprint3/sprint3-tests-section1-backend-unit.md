# Claude Code — Sprint 3 automated tests · SECTION 1 of 5: BACKEND UNIT (lib modules)

This is **Section 1 (Backend Unit)** of the Sprint 3 automated test track — same 5-section structure as Sprint 2
(Backend Unit → Backend E2E → Frontend Unit → Frontend E2E → QA), **one section at a time**, dev DB,
`LLM_MODE=mock`, **report-first** (write the tests, run them, report — do not "fix" product code to pass unless a
test reveals a genuine regression, in which case flag it separately).

**Purpose:** lock in the Sprint 3 lib-module logic AND the **8 real bugs the manual pass found + fixed**, so they
can never silently regress. Where a test would encode a bug (e.g. asserting `audit.metadata.domain`), assert the
FIXED behaviour instead.

## SCOPE (Section 1 = lib/ unit tests only)
Test the pure lib modules in `lib/visibility/` + `lib/communication/wins-feed.ts`. NO route/component/Inngest tests
here (those are Sections 2–4). Use the existing test runner + `LLM_MODE=mock`. Put tests under
`tests/phase2/sprint3/` (match the existing layout).

> Investigate-first: read each lib module + any existing Sprint 3 tests so assertions match the real signatures
> and the fixes as shipped.
```bash
ls tests/phase2/sprint3/ 2>/dev/null
for f in sov-calculator mention-source-divide fan-out-simulator topical-gap-calculator citation-source-classifier citation-failure-diagnosis visibility-trend-aggregator; do echo "== $f =="; sed -n '1,40p' lib/visibility/$f.ts; done
sed -n '1,40p' lib/communication/wins-feed.ts
```

---

## THE TESTS — implement each, with the manual-pass regression guards baked in

### 1. `sov-calculator.test.ts`  (base §11 + KEYSTONE regression guards)
- **Base:** brand_share + competitor_share are **percentages (0–100)**, summing ~100 per engine/category (MS-02).
- **🔒 REGRESSION (Bug 1, keystone):** the brand's own domain is **resolved from `brands.domain`**, NOT from
  `audit.metadata.domain`. Add a test where `audit.metadata` has NO `domain` key (e.g. `{mockScenario:null}`) and
  assert the calculator still correctly identifies the brand (via brands.domain) and does NOT count the brand as
  its own competitor. (This is the empty-metadata bug that made the brand a 50% self-competitor.)
- **🔒 REGRESSION (brand-own-domain exclusion):** given SoV input where a competitor entry equals the brand's own
  domain (after normalising lowercase + stripping `www.`), assert that entry is **excluded from competitors** (not
  rendered as a rival). Cover the exact-match case the shipped fix handles.
- **🔒 REGRESSION (engine aggregation):** given per-engine rows for the same competitor domain across multiple
  engines, assert the aggregation yields **one entry per distinct domain** (no duplicate segments) — the
  competitorMap/Math.max behaviour.
- Note (documented gap, do NOT assert as fixed): `.com` vs `.com.au` TLD-variant normalisation is go-live #12 —
  add a `test.todo` or skipped test noting the variant case is NOT yet handled, so it's tracked.

### 2. `mention-source-divide.test.ts`  (§11)
- Archetype boundaries at **mention_rate ≥ 20** and **citation_rate ≥ 10** (PERCENTAGE-POINTS, not 0.2/0.1) — test
  each quadrant (recognised_authority / known_but_untrusted / niche_authority / invisible) at/around the
  thresholds.
- **Division-by-zero:** `mention_rate = 0` → `mention_source_ratio` is **NULL** (not 0) → archetype **'invisible'**.
- market_competition_label from competitor SoV averages (category_leader >2× / challenger 0.5–2× / niche_player
  <0.5× / **NULL when <2 competitors**).

### 3. `fan-out-simulator.test.ts`  (§11 + {location} + dedupe guards)
- **3–12 sub-queries** per prompt; `above_threshold` set when similarity **> 0.88**; respects the Sprint 1 budget
  cap (`max_fan_out_sub_queries`, default 12); **`selectModel` used — no hardcoded model** string.
- **🔒 REGRESSION (Bug 4, {location}):** the prompt used for fan-out has `{location}` **substituted** from the
  brand's region (e.g. "Bondi, NSW"), NOT the literal `{location}` placeholder. Assert no `{location}` token
  remains in the stored/produced prompt when the brand has a region.
- **🔒 REGRESSION (fan-out dedupe):** assert the simulator produces **one row per (prompt, rank)** — no duplicate
  ranks (the duplicate-generation symptom). (Note: the shipped 5a fix scopes the API to the latest audit — that's a
  route test in Section 2; here assert the generator itself doesn't double-produce.)

### 4. `topical-gap-calculator.test.ts`  (§11)
- `topic_cluster` stored with **underscores**, translated from the hyphenated `vertical_pack_prompts.topic`
  (`emergency-service` → `emergency_service`).
- `cross_prompt_impact` COUNT correct (jewel-wins: distinct prompts a single fix improves); **NULL when < 2**.
- UPSERT sets `updated_at` (J-01).

### 5. `citation-failure-diagnosis.test.ts`  (§11 + CPR-01 regression)
- **🔒 REGRESSION (CPR-01 degradation):** when the **S5 (`citation_source_intelligence`) and S7
  (`comparison_prompt_results`) tables are empty/absent**, `diagnose()` **degrades gracefully** — diagnoses from
  `topical_coverage_gaps` alone and **never throws**. Assert it returns a valid `CitationDiagnosis[]` (possibly
  empty) rather than erroring. This is the graceful-degradation that shipped on both the citation-failure page and
  competitive benchmark.
- Returns `CitationDiagnosis[]` matching the component type (patternKey, severity ∈ high|medium|low, evidence).

### 6. `visibility-trend-aggregator.test.ts`  (§11)
- Uses **`scoreSentimentNumeric` / `scoreContextNumeric`** (the numeric source columns), **never** the text
  `scoreSentiment` / `scoreContext`.
- `mention_rate` / `citation_rate` = ×100 percentages; `mention_source_ratio` NULL-guarded (mention_rate=0).
- Exact **`period_label`** format ('2026-W23' weekly / '2026-06' monthly).
- `citation_volatility_score` computed; the **> 15.0** volatility trigger.
- `sample_quality` via the reused Phase 1 `lib/confidence-labels/classify.ts` (Confirmed|Likely|Hypothesis|
  Insufficient data) — not re-implemented.

### 7. `citation-source-classifier.test.ts`  (§11 optional)
- `source_type` classification of cited sources.

### 8. `wins-feed.test.ts`  (§11)
- Phase A **5 win types** (new_citation, new_engine_coverage, visibility_up, competitor_down, gap_closed);
  visibility_up / competitor_down now populated from the S3 tables.
- `reason` prefixed **"likely linked to:"** (attribution honesty — correlation, never asserted cause).
- Default **LIMIT 20**, `?limit` **max 50** (PA-01). ORDER BY detected_at DESC.

## INVARIANTS
- `LLM_MODE=mock`; dev DB; tests under `tests/phase2/sprint3/`.
- Assert the **FIXED** behaviour, never the old bug (brands.domain not metadata.domain; brand-own-domain excluded;
  {location} substituted; one-row-per-(prompt,rank); CPR-01 graceful; pp thresholds; numeric score columns).
- Report-first: if a test FAILS because product code regressed, **report it** — don't silently patch product code
  to make the test pass (flag it as a found regression, like the manual pass did).
- `subscriptions.tier` (never `organizations.tier`); `selectModel` (no hardcoded models); no `any` (TS strict).
- Section 1 is lib-only — do NOT add route/component/Inngest tests here.
- Don't modify product code except to fix a genuine regression a test surfaces (and flag it if so).

## VERIFY / REPORT
- Run the Section 1 tests (the 8 files) and report pass/fail counts.
- Confirm the **regression guards** are present and green: brands.domain keystone, brand-own-domain exclusion,
  engine aggregation, {location} substitution, fan-out no-duplicate-ranks, CPR-01 graceful degradation, archetype
  pp thresholds + ratio-NULL, numeric score columns.
- Note the **go-live #12 `test.todo`** (TLD-variant normalisation not yet handled) so it's tracked, not forgotten.
- Report any test that surfaced a real regression (should be none if the fixes hold) — flagged, not silently
  patched.
- Confirm the full existing suite still green (no collateral breakage): overall count.
- Confirm: lib-only, mock mode, dev DB, fixed-behaviour asserted, nothing silently patched.

## NEXT
After Section 1 passes: **Section 2 (Backend E2E)** — the API routes + Inngest functions end-to-end (the
`audit.complete` wiring, the 5 functions firing + UPSERTing, the competitive-benchmark CPR-01 null contract at the
route level, the fan-out latest-audit scoping at the route level, RLS on the new tables). Then Sections 3
(Frontend Unit — including updating any donut-specific assertions to the new bars), 4 (Frontend E2E), 5 (QA).
