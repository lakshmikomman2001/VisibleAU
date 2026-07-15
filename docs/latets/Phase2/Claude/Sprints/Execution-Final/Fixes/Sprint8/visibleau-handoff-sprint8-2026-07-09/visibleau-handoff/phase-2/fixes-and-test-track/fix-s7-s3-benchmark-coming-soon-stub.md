# Claude Code — FIX: S3 Competitive Benchmark STILL shows "Coming soon" (CPR-01 acceptance criterion NOT met)

The S3 Competitive Benchmark card (on the Visibility screen, /brands/{id}/visibility, bottom) STILL shows **"Coming soon
/ Head-to-head comparison available after next audit cycle"** — the exact CPR-01 stub S7 was supposed to fill. But
comparison_prompt_results now has 16 rows (a fresh audit just populated them, and they render fine on the Discovery
comparisons screen). So the DATA exists; the S3 card just isn't wired to it. The build report CLAIMED "Removed CPR-01 stub
— competitive-benchmark route now queries comparison_prompt_results for real data" — that claim is FALSE on screen; the
stub is still there. This is the cross-sprint acceptance criterion (LLD 123-124, §14) and it's NOT met.

Env: Windows repo `C:\startup\VisibleAU\src\`. LOCAL PROD `visibleau_prod`. Never real prod. Brand: Metropolitan
418f321f-2489-4560-aaa9-895728580465 (16 comparison rows exist from the fresh audit).

## Canon (LLD 123-124, 279-282, §14)
- "The S3 Competitive Benchmark completion — comparison_prompt_results now has data, so S3's CPR-01 'Coming soon' card
  resolves to the real comparison view (§6U.4/§14)."
- "once comparison_prompt_results has rows, the S3 benchmark shows the real comparison data."
- **READ THE LATEST ONLY (LLD 280-282):** the benchmark must show the CURRENT head-to-head (the latest audit's
  comparison rows), NOT every historical cycle. (comparison_prompt_results is per-audit; scope to the most recent
  audit_id.)
- Acceptance (§14, s3-benchmark.integration.test.ts): the S3 Competitive Benchmark route returns real comparisonData, NOT
  the CPR-01 null/"Coming soon".

## STEP 1 — Find the S3 benchmark card + its data path (why it's still stubbed)
```bash
# The Visibility screen's competitive-benchmark card (where "Coming soon" renders):
grep -rn "Coming soon\|Head-to-head comparison available\|Competitive Benchmark\|competitive.benchmark\|CPR-01\|comparisonData" "app/(auth)/brands/[brandId]/visibility/page.tsx" components/domain/visibility/ 2>/dev/null | head
# The competitive-benchmark API route the build said it updated:
find . -path ./node_modules -prune -o -iname "*competitive-benchmark*" -print 2>/dev/null
grep -rn "comparison_prompt_results\|comparisonData\|Coming soon\|null" app/api/**/competitive-benchmark/**/*.ts 2>/dev/null | head
```
Report: (a) where the "Coming soon" string renders (the component), (b) does the competitive-benchmark route/query
actually SELECT from comparison_prompt_results, or does it still return null/"Coming soon"? (c) Is the card hardcoded to
the stub, OR does it query but the query returns nothing (wrong filter)?

## STEP 2 — Diagnose: hardcoded stub vs query-returns-nothing
```bash
# Does comparison_prompt_results actually have rows for this brand's latest audit?
psql "$PROD_URL" -c "SELECT audit_id, count(*) FROM comparison_prompt_results WHERE brand_id='418f321f-2489-4560-aaa9-895728580465' GROUP BY audit_id ORDER BY 1 DESC;"
# What's the latest audit_id?
psql "$PROD_URL" -c "SELECT id, status, created_at FROM audits WHERE brand_id='418f321f-2489-4560-aaa9-895728580465' ORDER BY created_at DESC LIMIT 3;"
```
Report which:
- **Hardcoded stub:** the card/route still literally renders "Coming soon" and never queries comparison_prompt_results →
  the build didn't actually remove the stub (despite claiming it did).
- **Query returns nothing:** the route queries but with a filter that misses the rows (e.g. wrong audit_id scoping, or
  querying the wrong table) → fix the query.

## STEP 3 — FIX: wire the S3 benchmark to comparison_prompt_results (latest audit only)
- Replace the "Coming soon" stub with a query of comparison_prompt_results for the brand, **scoped to the LATEST audit_id**
  (LLD 280-282: current head-to-head, not historical). Aggregate to the benchmark view §6U.4 expects (per-competitor
  win/loss/inconclusive, or however the S3 benchmark card presents it — match the S3 card's intended shape).
- Show the real comparison data when rows exist; keep a genuine empty state ONLY when there are truly no comparison rows
  yet (no audit has run) — but with 16 rows present, it must show data, not "Coming soon".
- If the competitive-benchmark ROUTE already queries correctly but the CARD ignores it (renders the stub regardless), fix
  the card to render the route's data.

## STEP 4 — Verify on screen
Reload `/brands/418f321f.../visibility`, scroll to the Competitive Benchmark card (bottom):
- It now shows **real head-to-head comparison data** (the latest audit's competitor results) — NOT "Coming soon".
- The data reflects the LATEST audit only (not a pile of every historical cycle).
- Consistent with the Discovery comparisons screen (same underlying comparison_prompt_results, latest audit).
Report: the S3 benchmark renders real data on screen (paste what it shows).

## STEP 5 — Report + guard
- STEP 1-2: why it was still stubbed (hardcoded vs query-miss).
- STEP 3: the fix (query comparison_prompt_results, latest audit).
- STEP 4: real data on the S3 benchmark screen.
- Fix/confirm the acceptance test: s3-benchmark.integration.test.ts must assert that WITH comparison_prompt_results rows,
  the competitive-benchmark route returns real comparisonData (NOT null/"Coming soon") — and re-break: empty the table →
  returns the empty/coming-soon state; add rows → returns data. If this test was passing while the screen showed "Coming
  soon", the test wasn't actually exercising the render path — fix it to catch this.
- Add a §12 grep: the visibility competitive-benchmark component does NOT hardcode "Coming soon" as its only state (it
  must have a data-rendering path).

## Constraints
- This is the CPR-01 acceptance criterion (LLD 123-124, §14) — S7's explicit cross-sprint obligation to S3. "Coming soon"
  with 16 comparison rows present = criterion NOT met.
- READ THE LATEST audit only (LLD 280-282) — current head-to-head, not every historical cycle.
- The build CLAIMED it removed the stub — verify it actually did (STEP 1); if it's still hardcoded, that's the bug.
- Verify on the actual Visibility screen, not just the route/DB. Local prod, never real prod. LLD v8.70 / §6U.4 / §14 win.

## NOTE
Finding #7: the S3 Competitive Benchmark card (Visibility screen) STILL shows "Coming soon / Head-to-head comparison
available after next audit cycle" — the CPR-01 stub S7 was supposed to fill — even though comparison_prompt_results has 16
rows from a fresh audit (they render fine on the Discovery comparisons screen). The build claimed "removed CPR-01 stub,
route now queries comparison_prompt_results" — FALSE on screen. Diagnose whether the card is still hardcoded to the stub
or queries with a filter that misses the rows; wire it to comparison_prompt_results scoped to the LATEST audit_id (LLD
280-282: current head-to-head, not historical). Verify real data on the Visibility screen. Fix the s3-benchmark test to
actually catch this (if it passed while the screen was stubbed, it wasn't testing the render path). This is the explicit
cross-sprint acceptance criterion (§14) and the last thing blocking S7 from done.
