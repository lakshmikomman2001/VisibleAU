# VisibleAU — FIX PROMPT: Sample result shows "88.5 out of 10" (wrong scale label + unrounded)

**Phase/Sprint:** Phase 1, Sprint 10 (sample-audit result page). **Severity: HIGH — public credibility bug.**
The sample-audit result is the landing page's primary conversion surface, and it currently displays a
mathematically nonsensical score that undermines trust at first impression.

---

## SYMPTOM (observed on real completed sample audit, 26 Jun 2026)

At `/sample-audit/result/<id>` (e.g. for bondiplumbing.com.au), the page shows:

- Headline: **"Overall AI Visibility Score: 88.5"** with the sub-label **"out of 10"** ← WRONG
- Dimension cards: Frequency **100.0**, Position **84.0**, Sentiment **100.0**, Context **50.0**,
  Accuracy **100.0** (bare one-decimal numbers, no denominator)

**Why it's wrong:** 88.5 cannot be "out of 10." The composite and all five dimensions are computed on a
**0–100** scale (canon: Sprint 3 §32 "Composite visibility score **0-100** using DIMENSION_WEIGHTS";
`compositeVisibilityScore({all 100s}) === 100`). The displayed **value** (88.5) is correct for a 0–100
scale — it's the weighted composite of the five dimensions (25/25/20/15/15). The **label "out of 10" is
the bug**, plus the numbers aren't rounded.

## ROOT CAUSE

The built `SampleResultView` diverged from the canonical HI3 spec (Sprint 10, lines ~1081–1089), which
specifies:
- Headline = `{Math.round(Number(audit.scoreComposite))}` under the label **"Sample composite score"**
- Each dimension = `{Math.round(Number(score))}/100`

The build instead hardcoded an **"out of 10"** label under the composite and rendered raw
(un-`Math.round`ed) values. Almost certainly a confusion with the SEPARATE `score_of_10` concept
(`brand_entity_scores.score_of_10`, a Phase 2 entity score on a 0–10 scale) — but `scoreComposite` is
0–100 and must be labelled as such. The two scores are different and must not share a scale label.

---

## STEP 0 — INVESTIGATE FIRST (find the exact component + the "out of 10" string)
```bash
# 1. Find the sample result view and the offending label:
grep -rnE "out of 10|/10|SampleResultView|Overall AI Visibility|scoreComposite|Sample composite" \
  app/**/sample-audit/result/ components/ 2>/dev/null
#    Locate the JSX that renders "out of 10" and the headline number, and each dimension card.

# 2. Confirm scoreComposite's scale in the data it reads (must be 0-100, NOT 0-10):
grep -rnE "scoreComposite|score_composite|scores\b" app/**/sample-audit/result/ lib/sample-audit/ 2>/dev/null
#    Confirm the page reads audit.scoreComposite (the 0-100 composite) and audit.scores (per-dimension 0-100),
#    NOT score_of_10 / brand_entity_scores.

# 3. Confirm there's no actual 0-10 value being shown — i.e. nothing divides by 10 or reads score_of_10 here:
grep -rnE "score_of_10|scoreOf10|/ ?10|\* ?10|toFixed\(1\)" app/**/sample-audit/result/ components/ 2>/dev/null
#    If you find a `/10` or `score_of_10` read, that's the confusion to remove. toFixed(1) explains the ".0"/".5".
```
**Report:** the file + line of the "out of 10" label and the headline/dimension render, and confirm the
page is reading `scoreComposite` (0–100), not `score_of_10` (0–10).

---

## THE FIX — align the sample result view to the canonical HI3 spec

In the sample result component (Step 0 #1), make these changes:

1. **Headline label:** change **"out of 10"** → the canonical label. Per HI3 the sub-label is
   **"Sample composite score"** (no "/N" suffix on the big number). If you keep an explicit scale for
   clarity, it must be **"out of 100"**, never "out of 10". Recommended: match canon exactly —
   big number = `Math.round(Number(audit.scoreComposite))`, sub-label = "Sample composite score".

2. **Round the headline:** display `Math.round(Number(audit.scoreComposite))` → **89**, not `88.5`.
   (Canon uses `Math.round`. Do not show decimals on the headline.)

3. **Dimension cards:** render each as `{Math.round(Number(score))}/100` → **"100/100", "84/100",
   "100/100", "50/100", "100/100"**. Round (no `.0`) and show the `/100` denominator so the scale is
   self-evident. (Frequency 100, Position 84, Sentiment 100, Context 50, Accuracy 100 — these confirm the
   0–100 scale and that 88.5 is their correct weighted composite.)

4. **Do NOT change any scoring math.** The values are correct. This is a presentation-layer fix only —
   the label and rounding, nothing in `lib/scoring/` or `compositeVisibilityScore()`.

> If Step 0 reveals the page is genuinely reading a 0–10 value somewhere (a `score_of_10` or a `/10`
> division), remove that — the sample result must show the 0–100 `scoreComposite`. But most likely the
> data is already 0–100 and only the label/rounding is wrong.

---

## CONSTRAINTS
- **`scoreComposite` is 0–100.** This page shows the 0–100 composite + 0–100 dimensions. It must NOT use
  the 0–10 `score_of_10` entity score (a separate Phase 2 concept). Never label the composite "out of 10".
- **Presentation only.** Do not touch `lib/scoring/*`, `compositeVisibilityScore()`, the dimension
  formulas, or the DIMENSION_WEIGHTS (25/25/20/15/15). The numbers are right; only the display is wrong.
- **Round for display** per canon (`Math.round`), but do not round/alter the stored values.
- **Match the HI3 canon** (Sprint 10 ~1081–1089): "Sample composite score" + `Math.round(composite)` +
  per-dimension `Math.round(score)/100`.
- No schema change, no new component, no route change.
- **`audits.status` is `'complete'`** (no -d) — unrelated here, but don't let any incidental edit touch it.

---

## VERIFICATION (must pass)
```bash
# 1. The "out of 10" label is gone; the page uses the canonical label / 0-100 scale:
grep -rnE "out of 10|/10\b" app/**/sample-audit/result/ components/ 2>/dev/null   # → 0 matches (no "out of 10")
grep -rnE "Sample composite score|out of 100|/100" app/**/sample-audit/result/ components/ 2>/dev/null  # → present

# 2. Headline is rounded (no toFixed(1) on the composite):
grep -rnE "Math.round\(Number\(.*scoreComposite|Math.round\(.*composite" app/**/sample-audit/result/ components/ 2>/dev/null  # → present
grep -rnE "toFixed\(1\)|\.0\b" app/**/sample-audit/result/ components/ 2>/dev/null  # → none on the score render

# 3. No 0-10 value is being read here:
grep -rnE "score_of_10|scoreOf10" app/**/sample-audit/result/ components/ 2>/dev/null  # → 0 matches
```

### Manual test (re-run / re-view the real result)
1. Re-open the existing result in incognito: `localhost:3000/sample-audit/result/72197462-fa39-4670-b898-23fa48591a88`
   (or run a fresh sample audit and view its result).
2. **Headline now reads "89" under "Sample composite score"** (or "89 out of 100") — NOT "88.5 out of 10".
3. **Dimension cards read "100/100", "84/100", "100/100", "50/100", "100/100"** — rounded, with the /100
   denominator.
4. Sanity-check the composite by hand: `100×0.25 + 84×0.25 + 100×0.20 + 50×0.15 + 100×0.15`
   = `25 + 21 + 20 + 7.5 + 15` = **88.5 → rounds to 89**. The number was always right; only the label and
   rounding were wrong. (This also confirms the 25/25/20/15/15 weights are being applied correctly.)

---

## NOTE FOR THE REVIEWER (not for Claude Code)
This is a presentation bug at the Sprint 10 sample-result surface: the built `SampleResultView` diverged
from the HI3 spec (which already specified "Sample composite score" + `Math.round` + `/100`). Likely caused
by confusion with the 0–10 `score_of_10` entity score. The math is correct (88.5 = the weighted composite).
S1–S10 tests missed it because the score-scale assertion lives in the scoring unit tests (which test the
0–100 composite value, not the sample page's label), and the sample E2E was scoped to "CTA href only"
(IJ2) — neither asserts the rendered label. Worth a small E2E/RTL assertion: the sample result page renders
the composite as an integer with a "/100" or "out of 100" scale, never "out of 10".

While here, note the secondary CTA copy at the bottom ("This sample used 1 AI engine and 5 prompts. Full
audits use 4 engines and up to **50 prompts**...") — this is the sample-cap copy and reads correctly
(1 engine × 5 prompts for the sample is the C3-locked cap; the screenshot confirms the cap held). That is
the canonical copy and is NOT part of this fix. (Separately, the landing-page "How it works" still says
"Free: 100 calls × 2 engines" — that's the free-TIER audit, a different number from the sample, and is the
still-open copy-consistency item to verify against the FAQ — not part of this fix.)
