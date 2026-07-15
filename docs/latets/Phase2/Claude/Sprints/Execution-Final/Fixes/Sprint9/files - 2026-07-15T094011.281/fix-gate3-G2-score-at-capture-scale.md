# FIX Gate 3 G-2 [MED] — `score_at_capture` stores −1..1 sentiment in a 0–100 column

## The bug
`evidence-archiver.ts:30` writes `citations.sentiment_score` (range **−1.00 to 1.00**) directly into
`evidence_snapshots.score_at_capture`, a `numeric(5,2)` column that everywhere else holds **0–100**
scores. The UI then renders it raw: **"Score: 0.85"** sitting beside genuine 0–100 values.

Two things are wrong at the seam:
1. **A scale mismatch** — a sentiment fraction stored in a score column.
2. **A rendering bug** — `0.85` shown next to `37`, `100`, etc., with no indication it's on a different
   scale.

## First — decide what the column is SUPPOSED to hold
⚠️ **Don't just rescale blindly.** Check the intent:
```bash
cd c:/startup/VisibleAU/src
cat lib/**/evidence-archiver.ts
grep -rn "score_at_capture\|scoreAtCapture" lib/ app/ components/ db/ --include=*.ts --include=*.tsx
```
- What is `score_at_capture` **meant** to capture — the citation's **sentiment**, or the brand's
  **composite score** at snapshot time?
- If it's meant to be **sentiment**: the column name/type is misleading, but the data is "right" — the
  fix is **display** (label it as sentiment, render on its own scale).
- If it's meant to be a **0–100 score**: the *wrong source value* is being written — the fix is at the
  **write** site (write the composite, or rescale sentiment to 0–100).

**Report which it is before changing anything.** The right fix depends entirely on the answer.

## Then fix the identified layer
- **If display:** render it distinctly — "Sentiment at capture: +0.85" (signed, own scale), never bare
  beside 0–100 values.
- **If wrong source:** correct the write. If sentiment genuinely belongs here on a 0–100 basis, convert
  explicitly (`(sentiment + 1) / 2 * 100`) **at the write site**, and **backfill or annotate** existing
  rows so old snapshots aren't misread.

⚠️ **Whichever layer: existing rows already hold −1..1 values.** State how they're handled — migrate,
annotate, or leave with a display guard. **Don't leave a column with mixed scales.**

## Break-proof
```
Capture a snapshot for a citation with sentiment −0.5.
Assert: the stored/displayed value is UNAMBIGUOUS on ONE scale —
  not a bare "-0.50" adjacent to 0–100 scores.
```

## Constraints
- Diagnose intent (sentiment vs composite) **before** editing — the fix site differs.
- Account for **existing rows** explicitly.
- No mixed-scale column left behind.

## Report back
1. ⚠️ **What is `score_at_capture` meant to hold** — sentiment or composite?
2. The fix layer (write-site rescale vs display), and why.
3. How **existing −1..1 rows** are handled.
4. The break-proof result.
