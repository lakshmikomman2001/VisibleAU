# Claude Code — DIAGNOSE (report-first): is the fan-out Inngest function's unwired state intentional or a real gap?

**Finding (BE-3, Seam 1):** the fan-out **Inngest function** `inngest/functions/simulate-query-fan-out.ts` does NOT
wire up `selectModel`, `BudgetPolicyService`, or `maxFanOutSubQueries` — it generates mock data with a hardcoded
`count=3`. The **library** function `lib/visibility/fan-out-simulator.ts` IS correctly wired (BE-3 proved:
selectModel per tier, budget cap ≤ N, no hardcoded models). So the real logic EXISTS and works; it's just not
connected in the Inngest function, which currently emits mock/stub output.

**The question:** is this a **deliberate dev-mode stub** (with a plan to wire the real path before real-LLM /
production), or a **real gap** where the production path ships hardcoded-3 and ignores budget? These have opposite
resolutions (bank vs fix). **Report only — do NOT change source.**

## STEP 1 — Read the Inngest function + the library it should call
```bash
cat inngest/functions/simulate-query-fan-out.ts
echo "=== the wired library it (probably) should delegate to ==="
sed -n '1,60p' lib/visibility/fan-out-simulator.ts
grep -n "selectModel\|BudgetPolicyService\|maxFanOutSubQueries\|LLM_MODE\|mock\|count = 3\|count=3\|generateMockSubQueries\|simulateQueryFanOut" inngest/functions/simulate-query-fan-out.ts
```
Report:
- Does the Inngest function call the library `simulateQueryFanOut` (the wired one) at all, or does it have its own
  separate hardcoded mock path?
- Is the hardcoded `count=3` gated behind `LLM_MODE === 'mock'` (i.e. mock-only, with a real branch for
  real mode), or is it the SINGLE path regardless of mode?

## STEP 2 — Is the stub DOCUMENTED / PLANNED?
```bash
# Any TODO/stub/mock markers or notes pointing to future wiring?
grep -rniE "TODO|FIXME|stub|mock.*fan.?out|wire.*budget|not yet wired|dev.?mode|placeholder" inngest/functions/simulate-query-fan-out.ts
# Does the sprint prompt / LLD describe the fan-out Inngest path as mock-for-now vs production-wired?
grep -rniE "fan.?out.*mock|mock.*fan.?out|simulate.*fan.?out|fan.?out.*budget|fan.?out.*selectModel" docs/ 2>/dev/null | head
```
Report: is there an explicit note/plan that this is a temporary dev-mode stub to be wired later, or is it silently
hardcoded with no such marker?

## STEP 3 — What runs in production?
Determine which path executes when `LLM_MODE` is NOT mock (the real/production path):
- Does the Inngest function branch to the **real** `simulateQueryFanOut` (wired: selectModel + budget + up to 12)
  when not in mock mode? → then hardcoded-3 is mock-only and the production path is fine → **intentional stub**.
- Or does the Inngest function ALWAYS use the hardcoded mock (no real branch)? → then production fan-out would ship
  hardcoded-3 and ignore budget → **real gap** (would need wiring before launch).

## VERDICT (report one)
- **(A) INTENTIONAL DEV-MODE STUB:** hardcoded-3 is gated to mock mode; a real (wired) branch exists or is clearly
  planned/marked for real mode. → Action: **bank** as a pre-production wiring task (not a bug); note where the real
  branch is / needs to be. Consistent with the mock-mode artifacts seen elsewhere (canned sub-queries, 0.500
  similarity).
- **(B) REAL GAP:** the Inngest function has NO real branch — it always emits hardcoded-3 and never consults
  selectModel/budget, even in real mode. → Action: **real fix needed before production** — wire the Inngest
  function to delegate to the library `simulateQueryFanOut` (selectModel + BudgetPolicyService + maxFanOutSubQueries)
  for the real path. (Report this; the fix would be a separate prompt.)

## REPORT
- Whether the Inngest function delegates to the wired library or has its own hardcoded mock path.
- Whether `count=3` is mock-gated or the sole path.
- Any stub/TODO marker or plan doc indicating intentional-temporary.
- **The verdict (A intentional-stub / B real-gap)** with the evidence, and the recommended action (bank vs fix).
- No source changed (diagnosis only).

## NOTE
Evidence so far leans (A): the on-screen fan-out showed canned sub-queries + fixed 0.500 similarity (classified as
mock-mode behaviour), consistent with a dev-mode stub. But "consistent with mock mode" ≠ "confirmed there's a real
wired branch for production." This diagnosis confirms which — so we either bank it (A) or write a wiring fix (B),
rather than assuming. A production path that ships hardcoded-3 and ignores budget would be a real problem, so it's
worth confirming, not waving through.
