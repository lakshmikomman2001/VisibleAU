# Claude Code — S7 §11 test track — SECTION 1 of 5: Backend Unit (pure scorers/derivers)

Building the S7 §11 test track SECTION BY SECTION (one section, re-break proof, confirm, then next — do NOT jump ahead).
This is SECTION 1: Backend Unit (pure scorers/derivers — no DB, no events). IMPORTANT: S7 ALREADY grew a test suite
DURING the fixes (44→60 tests / ~10 files + guards for each of the 7 findings). So INVENTORY what exists against the §11
list, VERIFY each Section-1 test is behavioral + fires on re-break, and FILL only gaps. Do NOT duplicate or rewrite
passing real tests. Pin assertions to the EXACT canon formula values below (LLD 7516 / §0.5).

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau`. LLM_MODE=mock. Never prod. tests/phase2/sprint7/.

## The §11 tests that belong to SECTION 1 (pure unit — the rest are Section 2 integration)
Section 1 (this): **journey-scorer**, **intent-classifier**, and the PURE verdict/derivation logic (comparison verdict
derivation, journey turn-result derivation) that can be tested without a DB or an event.
(Section 2 later: run-journey.integration, comparison-runner DB-write, technical-audit-dual-emit, comparison-cascade,
s3-benchmark.integration, discovery-rls, journey-vertical-check — all need DB/events.)

## SECTION 1 tests + the EXACT canon values to assert:

### 1. journey-scorer.test.ts (LLD 7516 — THE headline scorer, pin these exactly)
- **base** = `(brand_appeared_in_n_turns / total_turns) × 100`
- **early-mention bonus** = first_mention_turn **1 → +10**, **2 → +5**, **3+ → 0**
- **cap at 100.0**
- **The canonical fixture:** 3 of 5 turns, first mention turn 1 → `(3/5×100)+10 = **70.0**` (assert EXACTLY 70.0)
- Derivation: `brand_appeared_in_n_turns`, `total_turns`, `first_mention_turn` derived from turn_results (LLD 238-239).
- Edge cases: 0 turns appeared → 0.0 (+ no bonus, or bonus only if there's a first_mention — if never mentioned,
  first_mention_turn is null → +0); all 5 turns, first at turn 1 → (5/5×100)+10 = 110 → **capped to 100.0**; first
  mention at turn 3 → +0 bonus.
Re-break: change a bonus tier (turn1 +10→+20), or remove the 100.0 cap, or change the base ratio → a test must FAIL.
The 70.0 fixture is the load-bearing one — it must be asserted exactly.

### 2. intent-classifier.test.ts (lib/conversational/intent-classifier)
- Classifies a turn's intent to the canonical set (§0.5: `awareness|followup|compare|decide`, or the JourneyTurn intent
  enum the code uses). Assert each intent maps correctly from representative prompts.
Re-break: break a classification branch → FAIL.

### 3. comparison verdict derivation (pure part of comparison-runner)
- The PURE logic that derives `brand_won` (true/false/**null**) from a parsed engine response: brand_mentioned +
  competitor_mentioned + position → brand_won, with **null when inconclusive** (neither clearly wins). This is the
  derivation ONLY (not the DB write — that's Section 2's comparison-runner integration).
- Assert: brand clearly ahead → true; competitor clearly ahead → false; ambiguous/neither mentioned → **null**
  (inconclusive). (Metropolitan's real audit produced 8 true / 6 false / 2 null — the null path is real, assert it.)
Re-break: make the inconclusive case return false instead of null → FAIL (null is canon — brand_won is nullable).

### 4. journey turn-result derivation (pure part of journey-runner)
- {brandName} substitution into a prompt template (pure string op); the turn_result shape derivation from an engine
  response (brand mentioned? position? → the turn_result object). The PURE parts — context-carry-across-turns +
  isEngineEnabled gate are Section 2 (they touch the runner's execution).
Re-break: break the {brandName} substitution or the turn_result shape → FAIL.

## STEP 1 — Inventory: which Section-1 tests exist + are they REAL (behavioral, not source-greps)?
```bash
ls tests/phase2/sprint7/ 2>/dev/null
for f in journey-scorer intent-classifier comparison-runner journey-runner; do
  echo "=== $f ==="; find tests -iname "*$f*" 2>/dev/null; done
# Flag any source-grep/typeof-smoke (the fake-test class):
grep -rln "readFileSync\|toContain.*import\|typeof.*===.*function" tests/phase2/sprint7/*{journey-scorer,intent,comparison,journey-runner}* 2>/dev/null
# Does journey-scorer already assert the 70.0 fixture?
grep -rn "70\|70.0\|3.*5\|first_mention\|cap\|100" tests/phase2/sprint7/*journey-scorer* 2>/dev/null
```
Report: which Section-1 tests exist, whether journey-scorer already pins the 70.0 fixture + the bonus tiers + the cap,
and flag any smoke tests.

## STEP 2 — Verify each is behavioral + fires on re-break (ONE AT A TIME)
For each Section-1 test that exists: confirm it asserts the ACTUAL canon values above, then prove re-break (break the
value → test FAILS → restore). Priority: journey-scorer (the 70.0 fixture + bonus tiers + 100.0 cap), comparison verdict
null-when-inconclusive. If a test is a source-grep/typeof-smoke → REWRITE it behavioral, then prove re-break.

## STEP 3 — Fill gaps
Any Section-1 scorer/deriver without a real behavioral test → write it with the canon values above. Each fails on
re-break.

## STEP 4 — Run Section 1 + report, then STOP
```bash
<repo test cmd> run tests/phase2/sprint7/
```
- The Section-1 tests: which existed real / rewritten / built new. Re-break fired for each (esp. journey-scorer 70.0 +
  cap, comparison null-inconclusive).
- Section 1 green; total count.
STOP — do NOT start Section 2. Report, and we do Section 2 (Backend Integration) next.

## Constraints
- SECTION 1 ONLY (pure scorers/derivers: journey-scorer, intent-classifier, comparison verdict derivation, journey
  turn-result derivation). NOT the integration tests (run-journey, comparison DB-write, dual-emit, cascade, s3-benchmark,
  rls, vertical-check) — those are Section 2+.
- Inventory FIRST — S7 grew 44→60 tests during the fixes; verify + fill, don't duplicate/rewrite passing real tests.
- Pin to EXACT canon values (LLD 7516): base ratio×100, bonus +10/+5/+0, cap 100.0, the 70.0 fixture. Not round numbers.
- Every test behavioral + fires on re-break. NO source-greps/typeof-smoke — rewrite if found.
- brand_won is NULLABLE — the inconclusive derivation must return null (assert it; re-break returning false → fail).
- LLM_MODE=mock. Dev DB `visibleau`, never prod. LLD v8.70 / §11 / §0.5 win.

## NOTE
Section 1 of 5 of the S7 §11 test track, section-by-section. Backend Unit = the PURE scorers/derivers only:
journey-scorer (pin LLD 7516 EXACTLY — base (appeared/total)×100 + early-mention bonus +10/+5/+0, cap 100.0, the
load-bearing 3-of-5-first-at-1 → 70.0 fixture), intent-classifier, the comparison verdict derivation (brand_won
true/false/NULL — null when inconclusive, the real audit produced 2 nulls), and the journey turn-result/{brandName}
derivation. S7 already grew 44→60 tests during the 7 fixes — INVENTORY against §11, VERIFY each is behavioral + fires on
re-break, FILL gaps, REWRITE any source-grep/typeof-smoke. STOP after Section 1 and report; Sections 2 (Backend
Integration: run-journey, comparison DB-write, technical-audit-dual-emit, comparison-cascade, s3-benchmark, discovery-rls,
journey-vertical-check), 3 (walk regression guards — the 7 findings' guards), 4 (Frontend Unit), 5 (Frontend E2E) follow
one at a time, then QA.
