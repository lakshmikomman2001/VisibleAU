# VisibleAU — Fix exec-summary "weakest dimension" logic (strongest = weakest bug) — Claude Code prompt
# Bug: the white-label PDF report's Executive Summary (added in the PDF polish) names the SAME dimension
#   as both strongest and weakest. On Marrickville (Frequency 0.0, Position 0.0, Sentiment 50.0,
#   Accuracy 0.0) it printed: "Strongest dimension: Sentiment (50.0). Weakest: Sentiment (50.0)."
#   Sentiment (50) is correctly the MAX, but the MIN should be one of the 0.0 dimensions
#   (Frequency/Position/Accuracy) — NOT Sentiment. The "weakest" selection is wrong.
# Likely cause: the min/max are computed incorrectly (e.g. both use max, or the reduce picks the wrong
#   one, or ties aren't handled). Fix the selection so weakest = the dimension with the LOWEST score.
# Scope: ONLY the exec-summary dimension picker. No other report content, no data source change.
# str_replace/exact-literal only. TS strict.

═══════════════════════════════════════════════════════════════════════════════
STEP 1 — Find the strongest/weakest dimension logic in the exec summary
═══════════════════════════════════════════════════════════════════════════════
> In the PDF report's executive-summary generation (the code that builds "Strongest dimension: X.
> Weakest: Y."), find how it picks the strongest and weakest of the 4 dimensions
> (Frequency, Position, Sentiment, Accuracy — each a numeric score).
> Report the current logic. Likely one of:
> - both "strongest" and "weakest" accidentally compute the MAX,
> - a reduce/sort that returns the wrong end,
> - or the dimensions aren't being compared by their numeric values correctly.

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — Fix: weakest = lowest-scoring dimension, strongest = highest
═══════════════════════════════════════════════════════════════════════════════
> Correct the selection so, over the 4 dimensions:
> - **strongest** = the dimension with the **highest** score (Marrickville → Sentiment 50.0). ✓ (already
>   correct)
> - **weakest** = the dimension with the **lowest** score (Marrickville → one of Frequency/Position/
>   Accuracy at 0.0). This is the bug — fix it to pick the minimum, not the maximum.
> - **Tie handling:** when several dimensions share the lowest score (Marrickville has THREE at 0.0),
>   pick one deterministically (e.g. the first in a fixed dimension order: Frequency → Position →
>   Sentiment → Accuracy). Don't print all three; one representative weakest is fine. Optionally, if it
>   reads better, the copy could say e.g. "Weakest: Frequency, Position & Accuracy (0.0)" — but a single
>   deterministic pick is acceptable and simpler.
> - **Guard the degenerate case:** if strongest === weakest only because ALL dimensions are EQUAL (e.g.
>   all 0, or all the same value), the "strongest/weakest" framing is meaningless — in that case, either
>   omit the strongest/weakest sentence or phrase it as "All dimensions scored equally (X.X)". (Not
>   Marrickville's case — its values differ — but worth handling so a flat-scored brand doesn't print
>   "Strongest: Frequency (0.0). Weakest: Frequency (0.0).")
> Keep the score formatting (one decimal) and the rest of the exec summary unchanged.

═══════════════════════════════════════════════════════════════════════════════
STEP 3 — Verify
═══════════════════════════════════════════════════════════════════════════════
> - Regenerate Marrickville's report. The exec summary should now read e.g.: "Strongest dimension:
>   Sentiment (50.0). Weakest: Frequency (0.0)." — strongest ≠ weakest, weakest is a 0.0 dimension.
> - Sanity-check a brand with distinct dimension values (e.g. if Bondi has 100/98/100/75 → strongest
>   Frequency or Sentiment (100), weakest Accuracy (75)) — strongest = true max, weakest = true min.
> - The all-equal guard: reason about / test a hypothetical all-0 or all-equal brand → it doesn't print
>   "strongest = weakest"; it omits or says "all equal".
> - Both preview and exported PDF reflect the fix; `npm run typecheck` passes.
> Report: the before/after exec-summary line for Marrickville, and the corrected logic.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- Tiny, contained fix — only the exec-summary's min/max dimension picker. The bug was visible on
  Marrickville because its dimensions (0/0/50/0) made the wrong "weakest" obvious; on a brand with
  spread-out scores it might have looked plausible while still being subtly wrong, so worth fixing.
- The tie + all-equal guards matter because Marrickville-class data (multiple zeros) and flat-scored
  brands would otherwise produce odd copy. A deterministic single pick is fine.
- This does NOT touch the 13.8 itself — that's the stale Marrickville audit (fixed separately by the
  real-mode backfill + re-audit). This only fixes how the summary DESCRIBES whatever the real
  dimensions are.
- Reminder: still open separately — the bulk CSV empty-data issue (need: which brand selected + dev/
  prod) and the optional real-mode backfill + Marrickville re-audit to get its real score.
