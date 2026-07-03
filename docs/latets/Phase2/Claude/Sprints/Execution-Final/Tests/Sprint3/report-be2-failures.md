# Claude Code — REPORT BE-2 results: list every failure BE-2 found (no fixes)

The BE-2 (deepen + behavioural) results didn't make it back to the reviewer intact. Re-run the Sprint 3 Section 2
BE-2 tests and **report every failure** in a clear list. **Report-first — do NOT fix anything.** (Fixes happen in
BE-4 after review.)

## Run + report
```bash
# Run the Sprint 3 Section 2 E2E / BE-2 tests (adjust the path/pattern to how they're named):
npx vitest run tests/phase2/sprint3/ --reporter=verbose 2>&1 | tail -120
# or the specific BE-2 file(s) if separate, e.g.:
# npx vitest run tests/phase2/sprint3/e2e-visibility-db.integration.test.ts --reporter=verbose
```

## What to report
Give the **exact count** of passes and failures (don't round or assume a number). Then for **each FAILURE**, list:
1. **Test name** + file.
2. **Which route/behaviour** it exercises (e.g. competitive-benchmark cross-org access; fan-out {location} fallback
   for a region-less brand; a tier boundary; a Zod 400; an UPSERT conflict; the volatility boundary).
3. **Expected** vs **Actual** — what the test asserted vs what actually happened when the route/function was CALLED
   (e.g. "expected 404, got 401"; "expected no literal `{location}`, got 'best plumbers in {location}'";
   "expected Agency=3 competitors, got 1").
4. **Is it a code bug or a wrong-test-expectation?** — your assessment (e.g. "route returns 401 for cross-org, but
   the convention is 404 → likely code bug" vs "the test expected 404 but this route intentionally returns 401 →
   test wrong"). Flag which, don't fix either.

## Specifically confirm these two (the highest-risk edge cases BE-2 targeted)
- **Cross-org access on each route:** when called as a user from org A for a brand in org B, does it return **404**
  (the convention), or something else (401 / data)? Report the actual code per route.
- **{location} fallback (region-less brand):** for a brand with **no `primaryRegions`**, does the fan-out/expand
  output leak a **literal `{location}`**, or does it degrade gracefully? Report the actual output string.

## If everything passed
If BE-2 is actually all-green, say so explicitly (count + "0 failures") — don't manufacture failures. A clean BE-2
is a valid result.

## Output format
```
BE-2 results: <N> passed, <M> failed

FAILURES (if any):
1. <test name> (<file>)
   Route/behaviour: ...
   Expected: ...  | Actual: ...
   Assessment: code bug | wrong test — <one line why>
2. ...

Cross-org per route: visibility <code>, fan-out <code>, topical-gaps <code>, citation-failure <code>,
  competitive-benchmark <code>, wins <code>
{location} region-less fallback: <graceful | leaks literal {location}> — actual output: "<string>"
```

Do NOT change any source or test in this pass — this is a reporting pass only.
