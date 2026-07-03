# Claude Code — DIAGNOSE (report-first): Visibility hub data issues — SoV donut, duplicate keys, fan-out {location}

The Visibility hub now renders real data (pipeline works, 5 functions fired green), but manual on-screen testing
found several issues on the Bondi Plumbing hub (`/brands/6ece067f-063c-436b-ac42-7952c7d7a271/visibility`). This run
was **`LLM_MODE=mock`**, so SOME oddities may be acceptable mock artifacts — but others are real bugs. Diagnose which
is which BEFORE fixing. **Report findings; do not fix yet.**

Observed on screen:
1. **SoV donut is broken:** 4 segments ALL labeled `bondiplumbing.com.au`, with shares 50% / 50% / 50% / 33.3%
   (summing to ~183%, not 100%). Also throws React duplicate-key errors ("two children with the same key
   'bondiplumbing.com.au'").
2. **Query Fan-Out sub-queries look templated:** e.g. "What are the best options for Who are the best plumbers in
   {location}?" — the `{location}` placeholder is UNSUBSTITUTED, and sub-queries look like mechanical string
   concatenations, all scoring exactly 0.500.
3. **Mention-Source Divide:** Mention 100% / Citation 100% / Source Ratio 1.00 → "Recognised Authority" (may be
   correct given mock data — confirm).

## STEP 1 — Inspect the actual SoV rows (is it bad DATA or bad RENDERING?)
```bash
# What columns does the table have?
psql "$DEV_DATABASE_URL" -c "\d share_of_voice_snapshots"
# The actual rows for this brand:
psql "$DEV_DATABASE_URL" -c "SELECT * FROM share_of_voice_snapshots WHERE brand_id='6ece067f-063c-436b-ac42-7952c7d7a271' ORDER BY calculated_at DESC LIMIT 20;"
```
Determine and REPORT:
- **How many rows**, and what distinguishes them — one row per engine? per competitor? Are there genuinely 4 rows
  all for the BRAND itself (brand-only, no competitors)?
- **Do the share values in the DB actually sum wrong** (e.g. multiple 50% + 33.3% rows), or are the DB values sane
  and the COMPONENT is miscalculating the displayed percentages?
- **Is `competitor_share`/competitor data present at all**, or is this brand-only data (no real competitors — which
  in mock mode may be expected, but the donut still shouldn't render the brand as N duplicate segments summing >100%)?
- Classify the SoV bug:
  - **(DATA)** the `calculate-share-of-voice` function / `sov-calculator` is producing wrong rows (duplicate
    brand-only rows, shares not normalized to sum 100 per engine/category). → the FIX is in the calculator/function.
  - **(RENDER)** the DB rows are correct but `sov-donut.tsx` mis-keys (uses non-unique `seg.label`) and/or
    miscalculates the segment percentages. → the FIX is in the component.
  - **(BOTH)** — likely: bad data AND a non-unique key.

## STEP 2 — The duplicate-key issue (component, always a bug)
```bash
grep -n "key=" components/domain/visibility/sov-donut.tsx
grep -rn "key={.*label\|key={.*domain\|key={.*name}" components/domain/visibility/
```
Report: which components key rendered lists by a NON-UNIQUE field (`seg.label`/domain/name). This is a real bug
regardless of the data — React keys must be unique. Note ALL affected visibility components (sov-donut,
mention-source-matrix, fan-out-tree, topical-gap-list — anywhere `.map()` keys by a possibly-duplicate value).

## STEP 3 — The fan-out `{location}` template + sub-query quality
```bash
# The fan-out rows — is {location} literally stored unsubstituted?
psql "$DEV_DATABASE_URL" -c "SELECT original_prompt, sub_query, content_similarity_score FROM query_fan_out_results WHERE brand_id='6ece067f-063c-436b-ac42-7952c7d7a271' LIMIT 10;"
# The fan-out simulator + where prompts get their {location} substituted:
grep -rn "location\|{location}\|replace\|suburb\|interpolat" lib/visibility/fan-out-simulator.ts
```
Report:
- Is `{location}` stored **unsubstituted** in the DB (a real bug — the placeholder should be replaced with the
  brand's suburb before the prompt is used), or is it substituted in the data but the UI shows the template?
- Are the sub-queries mechanical concatenations ("What are the best options for {original}") — and is that
  **mock-mode behavior** (LLM_MODE=mock returns canned fan-out) or the real logic? (In mock mode, canned sub-queries
  may be acceptable; but `{location}` being unsubstituted is a bug regardless.)
- The `0.500` similarity for all — is that mock's fixed value (acceptable in mock) or a real scoring bug?

## STEP 4 — Separate REAL BUGS from MOCK ARTIFACTS
Classify each finding:
- **REAL BUG (fix regardless of mock):** duplicate React keys; SoV shares not summing to 100 / duplicate brand-only
  rows if the calculator is wrong; `{location}` stored unsubstituted.
- **MOCK ARTIFACT (acceptable, do NOT "fix"):** e.g. no real competitors in SoV (mock has none), canned fan-out
  sub-query phrasing, fixed 0.500 similarity, everything-100% — IF these are genuinely mock-mode behavior that would
  produce real values under `LLM_MODE=real`. Confirm by reading the mock vs real code paths.
- For anything ambiguous, report it as "confirm intended" rather than guessing.

## REPORT (no fixes yet)
- **SoV verdict:** the actual rows (count, per-engine/competitor, brand-only?), whether DB shares sum wrong or the
  component miscalculates, and the classification (DATA / RENDER / BOTH) → the precise fix location.
- **Duplicate keys:** which components key by a non-unique field (all of them).
- **Fan-out:** is `{location}` unsubstituted in the DB (real bug) or a display issue; are canned sub-queries +
  0.500 mock behavior or real logic.
- **Mention-Source / 100% values:** correct given mock, or a bug.
- A clear **REAL-BUG vs MOCK-ARTIFACT** split so the subsequent fix targets only genuine bugs, not intended mock
  behavior.
- Confirm: no source/data changed (diagnosis only).

## NOTE
The pipeline itself works (functions fire, tables populate, hub renders) — these are DATA-SHAPE and RENDERING bugs
in how real pipeline output is computed/displayed, which the 68 unit tests missed because they used clean fixtures,
not actual pipeline output. This is the manual pass doing its job. Once diagnosed, the fix will target the confirmed
real bugs (keys, SoV calc if wrong, {location}) and leave genuine mock artifacts alone.
