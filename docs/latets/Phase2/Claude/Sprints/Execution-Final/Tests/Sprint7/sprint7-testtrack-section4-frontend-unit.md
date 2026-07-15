# Claude Code — S7 §11 test track — SECTION 4 of 5: FRONTEND UNIT (Discovery component render tests)

Section-by-section: SECTIONS 1 (Backend Unit 20) + 2 (Backend Integration ~62) + 3 (Walk guards, 70 invariants) DONE.
This is SECTION 4 — FRONTEND UNIT: render tests for the 3 Discovery components, each with its STATES (loading/empty/data)
and correct data — especially the nullable-brand_won inconclusive card (the S7-specific render requirement that only the
screen confirmed during the walk). Some may exist from the build — INVENTORY, verify behavioral + re-break, fill gaps.
Do NOT duplicate. Do NOT jump to Section 5. Match the S5/S6 component-test pattern (testing-library, jsdom).

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau`. LLM_MODE=mock. Never prod. tests/phase2/sprint7/.

## The 3 BUILT Discovery components (§6U.3/§6U.4):

### 1. journey-flow-chart.tsx (§6U.3)
Visualises the turn sequence: **turn → prompt → intent** for each turn. Given a journey's turns, renders each turn with
its prompt + intent label, in order.
- Data: N turns → N steps rendered, in sequence, with intent labels (awareness/consideration/decision).
- States: empty (no turns) → a sensible empty/placeholder; a single-turn and multi-turn both render.
Re-break: break the turn ordering or drop the intent label → the test FAILS.

### 2. journey-result-card.tsx (§6U.3)
Shows a run's **journey_score** + **per-turn brand-mention** breakdown.
- Data: given a run result (journey_score + turn_results), renders the score prominently + per-turn mention indicators
  (mentioned / not).
- **Score rendering**: the journey_score (0-100) shows correctly — e.g. the 70.0 case renders as 70 (not 7, not 0.70).
- States: a completed run (score + turns) vs a pending/empty run.
Re-break: break the score display (e.g. render score/100 as a fraction) or the per-turn mention → FAILS.

### 3. comparison-verdict-card.tsx (§6U.4) — THE important one (nullable brand_won)
Shows **brand_won (win/loss/INCONCLUSIVE when null)**, the verdict_snippet, brand vs competitor mention, per engine.
- **brand_won=true → Win** (green); **false → Loss** (red); **null → INCONCLUSIVE / Draw** (neutral, NOT a crash) — THE
  S7-specific requirement (LLD 288: "inconclusive (brand_won null): a neutral verdict card"). The real audit produced 2
  nulls; the walk confirmed the card renders them as neutral. Assert all THREE states, especially null → neutral card.
- Renders verdict_snippet + brand_mentioned / competitor_mentioned (both NOT NULL) + the engine label.
- **Responsive**: verdict cards grid-cols-1 md:grid-cols-2 (assert the grid classes if the card/container sets them).
Re-break: make brand_won=null render as Loss (or crash) → the "null → neutral INCONCLUSIVE card" test FAILS. This is the
guard for the exact edge case the walk caught.

## STEP 1 — Inventory: which component tests exist + the test-render setup?
```bash
ls tests/phase2/sprint7/ | grep -iE "flow|result|verdict|card|chart|component|render"
grep -rln "render(\|screen\.\|@testing-library" tests/phase2/sprint7/ 2>/dev/null | head
head -20 tests/phase2/sprint6/*card*.test.* 2>/dev/null   # match the S6 component-test pattern
```
Report which of the 3 components have render tests, and the setup to match.

## STEP 2 — Render tests per component (STATES + data), one at a time
For each of the 3: the test RENDERS the component (testing-library) and asserts the DOM, then re-break (break the render
→ test fails). Priority re-breaks: comparison-verdict-card null→INCONCLUSIVE (the walk-caught edge case),
journey-result-card score rendering (70.0 shows as 70), journey-flow-chart turn ordering + intent labels.

## STEP 3 — Fill gaps
Any component without a real render test → write it per the spec above. Each fails on re-break.

## STEP 4 — Run + report, then STOP
```bash
<repo test cmd> run tests/phase2/sprint7/
```
- Which components had render tests / built new. STATES covered per component. Re-break fired (esp. verdict-card null →
  neutral, score rendering).
- Section 4 green; total count.
STOP — do NOT start Section 5. Report, and Section 5 (Frontend E2E) next.

## Constraints
- SECTION 4 ONLY (the 3 Discovery component render tests). Not Section 5.
- Each test RENDERS the component (testing-library) + asserts the DOM + fires on re-break. NO source-greps at the
  component level.
- comparison-verdict-card MUST assert all 3 brand_won states — especially **null → neutral INCONCLUSIVE card, not a
  crash** (LLD 288; the walk-caught edge case; 2 real nulls in the audit). journey-result-card MUST assert the score
  renders correctly (70.0 → 70, not a fraction).
- Match the S5/S6 component-test pattern (jsdom, testing-library). Inventory first; don't duplicate.
- LLM_MODE=mock. Dev DB `visibleau`, never prod. LLD v8.70 / §6U.3 / §6U.4 / 288 win.

## NOTE
Section 4 of 5 — FRONTEND UNIT: render tests for the 3 built Discovery components. journey-flow-chart (turn → prompt →
intent sequence), journey-result-card (journey_score prominent — 70.0 renders as 70, not 0.70/7 — + per-turn mention),
and the important one, comparison-verdict-card (brand_won true→Win / false→Loss / **null→neutral INCONCLUSIVE card, NOT a
crash** — LLD 288, the S7-specific requirement the walk caught with 2 real nulls; + verdict_snippet, mention flags, per
engine, responsive grid). INVENTORY against the build, verify behavioral + re-break (esp. the null-verdict neutral card
and the score rendering), fill gaps, match the S5/S6 testing-library pattern. STOP after Section 4 and report; Section 5
(Frontend E2E — the Discovery screens + the S3 benchmark render-proof that closes the hollow-test loop) then QA follow.
