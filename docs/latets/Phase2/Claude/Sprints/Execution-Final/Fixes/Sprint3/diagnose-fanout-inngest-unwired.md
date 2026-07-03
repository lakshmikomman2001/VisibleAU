# Claude Code — DIAGNOSE (report-first): fan-out Inngest function unwired — is it a stub, or a spec violation?

**Finding (BE-3, Seam 1):** the fan-out **Inngest function** `inngest/functions/simulate-query-fan-out.ts` does NOT
wire `selectModel`, `BudgetPolicyService`, or `maxFanOutSubQueries` — it emits mock data with hardcoded `count=3`.
The **library** `lib/visibility/fan-out-simulator.ts` IS correctly wired (BE-3 proved it). So the logic exists; it's
just not connected in the Inngest function.

## ✅ THREE-SOURCE CHECK (LLD v8.70 + Sprint 3 prompt + prototype) — done; this CHANGES the framing
The spec is UNAMBIGUOUS that the fan-out function MUST wire budget + selectModel in production:
- **Sprint 3 prompt §8.3 (L374-375) + §6.3 (L260-262):** "run each via `selectModel`, respect... budget
  `max_fan_out_sub_queries` (default 12)"; **§12 grep gate (L459, L492):** "no hardcoded model/engine; selectModel
  in fan-out."
- **LLD v8.70 (authority):** fan-out cost "**bounded by BudgetPolicy ✓**" (L1640, L1684); `simulate-query-fan-out.ts`
  is in the BudgetPolicy type contracts (L3446) and the CC-01 concurrency fix (L1249). LLD 6463 = the fan-out spec.
- **Prototype:** fan-out UI = the Query Fan-Out tiles (already reviewed); no conflict.
- **Conclusion:** there is NO spec reading where "hardcoded count=3, no budget, ever" is conformant. So this is NOT
  "planned, not a regression" by default — **if the Inngest function is the production path and never wires budget/
  selectModel, it's a real spec VIOLATION (a gap to fix).** The only acceptable "stub" is one gated to mock mode
  WITH a real wired branch for real mode. My earlier prompt leaned "intentional stub (A)" from the mock screenshots
  — the LLD + prompt correct that lean: the burden is to prove a real wired branch EXISTS, not to assume it's fine.

**Report only — do NOT change source.** The verdict decides bank-vs-fix.

## STEP 1 — Read the Inngest function + the library it should delegate to
```bash
cat inngest/functions/simulate-query-fan-out.ts
sed -n '1,60p' lib/visibility/fan-out-simulator.ts
grep -n "selectModel\|BudgetPolicyService\|maxFanOutSubQueries\|max_fan_out\|LLM_MODE\|mock\|count = 3\|count=3\|generateMockSubQueries\|simulateQueryFanOut" inngest/functions/simulate-query-fan-out.ts
```

## STEP 2 — The decisive question: is there a REAL (wired) branch for production, or is hardcoded-3 the ONLY path?
- Does the Inngest function call the wired library `simulateQueryFanOut` (selectModel + budget + up to 12) when
  `LLM_MODE` is NOT mock? → then hardcoded-3 is mock-only and production is spec-conformant → **(A) intentional
  stub**.
- Or does it ALWAYS emit hardcoded-3 with no real branch (no selectModel/budget in any mode)? → **(B) spec
  violation** — the production path ignores the LLD's BudgetPolicy requirement and the prompt's selectModel
  requirement.

## STEP 3 — Cross-check the §12 grep gate
The Sprint 3 prompt has a §12 acceptance grep: "selectModel in fan-out; no hardcoded model/engine." Run it against
the Inngest function specifically:
```bash
grep -n "selectModel\|BudgetPolicy" inngest/functions/simulate-query-fan-out.ts   # expected present for the real path
grep -rniE "claude-|gpt-|gemini-|'openai'|hardcod" inngest/functions/simulate-query-fan-out.ts
```
If the Inngest function has NO selectModel/BudgetPolicy anywhere (not even a real branch), it fails the sprint's own
§12 gate → that's evidence for (B).

## VERDICT (report one, with the 3-source spec in mind)
- **(A) INTENTIONAL DEV-MODE STUB (acceptable):** hardcoded-3 is gated to `LLM_MODE=mock` AND a real branch delegates
  to the wired library (selectModel + BudgetPolicy + max_fan_out) for real mode. → **Bank** a note that the real
  branch exists and is exercised in real mode; no fix. (Only valid if the real branch genuinely exists.)
- **(B) SPEC VIOLATION / REAL GAP:** no real wired branch — hardcoded-3 is the sole path, or budget/selectModel are
  never consulted even in real mode. → **Real fix required** (before production, arguably now given it violates the
  §12 gate): wire the Inngest function to delegate to the library `simulateQueryFanOut` (selectModel +
  BudgetPolicyService + maxFanOutSubQueries). Report this; the fix is a separate prompt.

## REPORT
- Does the Inngest function delegate to the wired library, or have its own hardcoded path?
- Is `count=3` mock-gated with a real branch, or the sole path?
- §12 grep result on the Inngest function (selectModel/BudgetPolicy present or absent).
- **Verdict (A stub-with-real-branch / B spec-violation)** + evidence + recommended action (bank vs fix).
- No source changed (diagnosis only).

## NOTE (three-source discipline)
Re-checked against LLD (authority), Sprint 3 prompt, and prototype before writing. This corrected my earlier lean:
the mock-mode screenshots suggested "intentional stub," but the LLD ("cost bounded by BudgetPolicy") and the prompt
(§8.3 + §12 gate) REQUIRE budget/selectModel wiring — so the real question is whether a wired production branch
exists. If not, it's a spec violation, not a benign stub. Per canon, LLD wins on any conflict.
