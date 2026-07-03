# Claude Code — FIX (spec violation, verdict B): wire the fan-out Inngest function to selectModel + BudgetPolicy

**Confirmed (B) SPEC VIOLATION.** `inngest/functions/simulate-query-fan-out.ts` has ONE code path — it
unconditionally calls a local `generateMockSubQueries(prompt, 3)` (hardcoded 3, hardcoded `brandAppeared:false`,
hardcoded `0.500`). It never imports the wired library, `selectModel`, `BudgetPolicyService`, or
`maxFanOutSubQueries`, and has NO `LLM_MODE` gate. So in real/production mode it STILL emits hardcoded-3 with no
budget enforcement — fan-out doesn't actually work outside mock mode. The wired library
`lib/visibility/fan-out-simulator.ts` already does everything correctly; the Inngest function just doesn't call it.


## ✅ LEGITIMACY CONFIRMED (deep analysis, devil's-advocate pass done)
Verified this is a REAL issue, not an intentional stub, by actively searching for a get-out:
- **The LLD demonstrably marks intentional stubs when it means them** — "Coming soon"/placeholder/stub language
  exists for comparisonData (LLD 1336), Sprint 8 sarif/junit (2417), Wikidata (7480), etc. **There is ZERO such
  marking anywhere near `simulate-query-fan-out`.** The only fan-out "mock" reference (LLD 4680) is about TESTS
  ("must run under LLM_MODE=mock"), NOT about the production function being a stub. → "intentional dev stub" has no
  textual support; the gap is real.
- **§8.3 (Inngest fn) explicitly says its job is to INVOKE the library (§6.3):** "fan-out-simulator (§6.3), 3–12
  sub-queries via `selectModel`, respect Sprint 1 budget cap; INSERT query_fan_out_results." The current function
  invokes NEITHER the library nor selectModel/budget — it runs a private hardcoded-3 mock. That violates §8.3.
- **§6.3 (the library) is where selectModel + budget live** ("run each via selectModel; …; Respects Sprint 1 budget
  max_fan_out_sub_queries default 12; Consumed by §8.3"). BE-3 proved the library does this correctly. So the REAL
  fix is: **make the Inngest function actually call the library** — selectModel + budget come THROUGH the library.
  (The §12 "selectModel in fan-out" gate is satisfied transitively: the fn calls the library, the library calls
  selectModel. selectModel need NOT be literally inlined in the Inngest file.)

### Refined framing (important — cleaner than "inline selectModel into the Inngest fn")
- The violation = the Inngest function **does not invoke §6.3 (the library) at all**. The fix = **wire it to invoke
  the library** (`simulateQueryFanOut`), which already does selectModel + budget + cosine + >0.88.
- **Mock determinism comes from `LLMService` being mocked under `LLM_MODE=mock`** (LLD 4680: fan-out "uses
  LLMService.complete() for embeddings → must run under LLM_MODE=mock"). So the library's real path calls
  `LLMService.complete()`; under `LLM_MODE=mock` that service returns canned responses → deterministic tests
  automatically. You do NOT need to keep a separate parallel `generateMockSubQueries`; determinism should come from
  the mocked LLM service, matching how the other Phase-2 LLM functions stay deterministic in tests. (If the
  established pattern in this codebase IS a per-function mock branch, match that; but prefer LLMService-mock
  determinism per LLD 4680.)

## ✅ THREE-SOURCE CHECK (LLD v8.70 + Sprint 3 prompt + prototype) — fix REQUIRED by all three
- **LLD 6149 / 6463 (authority):** simulate-query-fan-out = "3–12 sub-queries via `selectModel`, respect Sprint 1
  budget cap." **LLD 1640/1684/3446:** fan-out cost "bounded by BudgetPolicy ✓"; the function is in the BudgetPolicy
  type contracts. → the current function VIOLATES the LLD.
- **Sprint 3 prompt §8.3:** "On `audit.complete`: fan-out-simulator (§6.3), 3–12 sub-queries via `selectModel`,
  respect Sprint 1 budget cap; INSERT query_fan_out_results." **§12 grep gate:** "selectModel in fan-out" — the
  Inngest function FAILS this gate.
- **LLD 4680 / 4685 (the mock contract — CRITICAL for not breaking tests):** simulate-query-fan-out "uses
  LLMService.complete() for embeddings → **must run under `LLM_MODE=mock`**"; the 5 Phase-2 LLM functions are in the
  LLM_MODE=mock fixtures. → the fix MUST keep a deterministic mock path for `LLM_MODE=mock` so the 263 green tests
  stay green.
- **Prototype:** fan-out UI = the Query Fan-Out tiles (already reviewed); no conflict.
- **Conclusion:** wire the real path (selectModel + BudgetPolicy + up to 12) AND keep a mock-gated path. No conflict
  between sources; the LLD, the prompt, and the §12 gate all require the wiring.

> Investigate-first: read both files + how OTHER Phase-2 Inngest functions gate LLM_MODE / call the LLM service, so
> the gating + service-call pattern MATCHES the established codebase convention (don't invent a new one).
```bash
cat inngest/functions/simulate-query-fan-out.ts
sed -n '1,90p' lib/visibility/fan-out-simulator.ts        # the wired library signature + its injected callbacks
# The established mock/real gate + LLM service pattern used by the OTHER Phase-2 LLM Inngest functions:
grep -rn "LLM_MODE\|getLLMService\|LLMService\|selectModel\|BudgetPolicyService\|mock" inngest/functions/ | grep -v simulate-query-fan-out | head -20
grep -rn "maxFanOutSubQueries\|max_fan_out_sub_queries\|BudgetPolicyService" lib/ | head
# How tier is resolved for budget (subscriptions.tier — sole source of truth, NOT organizations.tier):
grep -rn "subscriptions.tier\|check.ts\|quota" lib/quota/ lib/budget/ 2>/dev/null | head
```

## THE FIX — delegate to the wired library for the real path; keep mock gated
Rewrite `simulate-query-fan-out.ts` so it:
1. **Resolves the brand's tier** from **`subscriptions.tier`** (sole source of truth — JOIN audits → organizations →
   subscriptions; NEVER `organizations.tier`, which can diverge between Stripe webhooks — LLD 3962/5132).
2. **Gets the budget cap** `maxFanOutSubQueries` from `BudgetPolicyService` (default 12, min 3) — do NOT hardcode 3.
3. **Gates on `LLM_MODE`:**
   - **`LLM_MODE=mock`** (tests + dev) → the library's real path calls `LLMService.complete()`; under mock mode that
     service returns canned responses, so calling the library is ALREADY deterministic (LLD 4680). PREFER this
     (delete the parallel hardcoded `generateMockSubQueries`, let LLMService-mock provide determinism) so there is
     ONE path (the library) in all modes, mock-ness coming from the mocked service. Only keep a separate mock branch
     if that's the established pattern for the other Phase-2 Inngest functions. Either way, the 263 green tests MUST
     stay green.
   - **real mode** → delegate to the library **`simulateQueryFanOut`** from `@/lib/visibility/fan-out-simulator`,
     injecting the real callbacks: `selectModel(tier, engine, ...)`-driven generation, the real
     `checkBrandMention`, the real `computeSimilarity` (cosine), and `maxSubQueries = maxFanOutSubQueries`.
4. **Consults `BudgetPolicyService.estimate()`** on the LLM path (the S1 cost-control seam) — the fan-out cost must
   be bounded by BudgetPolicy (LLD 1640/1684), not run unbounded.
5. **INSERTs `query_fan_out_results`** with the real (or mock) results — same table write as now; `above_threshold`
   when similarity > 0.88; `sub_query_rank`; `content_similarity_score` NUMERIC(4,3).
- Reuse the library's shape (`FanOutSubQuery[]`) — don't reshape. Keep the `audit.complete` trigger + the Inngest
  concurrency limit (CC-01, LLD 1249) that's already there.

## INVARIANTS
- **Do NOT break `LLM_MODE=mock`:** the mock path stays deterministic; the 263 green Sprint 3 tests (which run in
  mock) must stay green. The real branch is ADDED alongside, gated on LLM_MODE.
- **selectModel — no hardcoded models/engines** (satisfies the §12 grep gate). Engines from the tier's configured
  set (Free 2 / paid 4), never a literal list.
- **Budget cap from BudgetPolicyService** (maxFanOutSubQueries, default 12, min 3) — never hardcoded 3. Fan-out cost
  bounded by BudgetPolicy (LLD 1640/1684).
- **Tier from `subscriptions.tier`** (JOIN audits→organizations→subscriptions), never `organizations.tier`.
- Keep the `audit.complete` trigger, the CC-01 concurrency limit, the table-write shape, `above_threshold` > 0.88.
- Match the established mock/real gating + LLM-service pattern of the OTHER Phase-2 Inngest functions (don't invent).
- TS strict, no `any`.

## VERIFY
1. **Mock mode (tests):** run the full Sprint 3 suite under `LLM_MODE=mock` → **still 263 green** (the mock path is
   preserved; no regression). The fan-out E2E tests still pass.
2. **§12 grep gate:** `grep -n "selectModel\|BudgetPolicy" inngest/functions/simulate-query-fan-out.ts` → now PRESENT
   (the gate passes); no hardcoded model/engine strings; no hardcoded `count = 3` as the sole path.
3. **Real path wiring (static + a targeted test):** assert the function, in real mode, delegates to
   `simulateQueryFanOut` with `maxSubQueries` from BudgetPolicy and `selectModel`-driven generation (a unit/integration
   test with a mocked LLM service confirming the library is called with the budget cap, not hardcoded 3).
4. **Tier source:** the budget/tier resolution reads `subscriptions.tier` (not organizations.tier) — assert the JOIN.
5. No regression to the other visibility functions or the wins-feed fix.

## REPORT
- The rewrite: how LLM_MODE gates mock vs real; the delegation to the library; the BudgetPolicy cap; the
  subscriptions.tier resolution.
- Mock suite still 263 green (or the exact count) — no regression.
- §12 grep gate now passes (selectModel + BudgetPolicy present; no hardcoded-3 sole path).
- Confirm: real path uses the wired library + selectModel + budget cap; mock path deterministic + preserved;
  subscriptions.tier used; audit.complete trigger + CC-01 concurrency kept.

## NOTE (three-source discipline)
Checked against LLD (authority) + Sprint 3 prompt (§8.3 + §12 gate) + prototype before writing. All three require the
selectModel/BudgetPolicy wiring; the LLD's mock contract (4680/4685) requires the mock path be preserved. The fix
adds the real branch WITHOUT breaking mock — satisfying both. Per canon, LLD wins; here LLD, prompt, and gate all
agree.
