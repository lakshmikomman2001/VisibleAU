# Claude Code — FIX: report shows "citation rate: 7000%" (MS-01 unit double-scaling) + duplicated section text

## The bug (visible in the PDF, root cause confirmed against canon)
The generated report reads: **"Brand archetype: niche authority. Mention rate: 0%, citation rate: 7000%."** A rate
cannot exceed 100%. **7000% = a value of 70 being multiplied by 100 a second time.**

**Canon (MS-01, LLD 578-592 — verified):** `visibility_trends.mention_rate` and `citation_rate` are stored as
**PERCENTAGE (0-100)**, not a 0-1 ratio. The producing formula already applies the ×100 at write time
(`aggregate-visibility-trend.ts`). The Phase 2 prototype displays them DIRECTLY — "citation rate 67% → 52%" — with NO
multiplier. So `citation_rate = 70.0` **already means 70%**. The narrative generator is applying another `× 100` →
`70 × 100 = 7000%`. That extra multiply is the bug. (This is the exact MS-01 unit-clash family: the archetype
thresholds were fixed 0.10→10 and the prototype was always right; the report's narrative RENDERING still treats the
stored 0-100 value as a 0-1 ratio.)

Two bugs on this page — fix both:
1. **PRIMARY — citation_rate (and check mention_rate) double-scaled** in the narrative string (×100 on an already-0-100
   value).
2. **MINOR — duplicated text:** the identical string "Brand archetype: niche authority. Mention rate: 0%, citation
   rate: 7000%." appears in BOTH the executive summary AND the "Mention Source Breakdown" section. Two sections should
   render DISTINCT content, not the same sentence twice.

Env: local PROD DB, real LLMs, Supabase. Brand `0f531803-b529-4d09-9fd6-b6272b5baba8` ("Bondi Plumbing"), period now
correctly `2026-W27`.

## STEP 1 — Confirm the RAW stored value first (correct the right layer)
Is `citation_rate` stored as 70 (=70%, correct unit → the bug is a ×100 in rendering) or as something else (e.g. a raw
count → the bug is upstream in the aggregator)?
```bash
psql "$DATABASE_URL" -c "SELECT period_label, period_type, mention_rate, citation_rate, brand_archetype, mention_source_ratio, score_composite_avg FROM visibility_trends WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' AND period_label='2026-W27';"
```
ANSWER: what are the raw `mention_rate` and `citation_rate` values?
- **If citation_rate ≈ 70** → stored unit is correct (0-100); the bug is a stray ×100 in the NARRATIVE renderer (STEP
  2). Expected.
- **If citation_rate ≈ 7000 or 0.70** → the stored value itself is wrong; the bug is in the AGGREGATOR's formula (a
  count mistaken for a rate, or a missing/extra ×100 at write time) — fix THERE, and report before proceeding.
- Also note mention_rate: is it genuinely 0 (plausible — no brand mentions this period) or also mis-scaled?

## STEP 2 — Find and remove the double-scale in the narrative generator
```bash
grep -rn "citation_rate\|citationRate\|mention_rate\|mentionRate\|\* 100\|\*100\|toFixed\|%\`\|archetype\|Mention rate\|citation rate" inngest/functions/generate-narrative-report.ts lib/communication/ | head -30
```
Find where the narrative string is built (e.g. `` `Mention rate: ${mentionRate * 100}%, citation rate: ${citationRate * 100}%` ``).
Fix: the values are ALREADY percentages (0-100) — render them WITHOUT `× 100`:
```ts
// WRONG (double-scales an already-0-100 value):
`Mention rate: ${Math.round(mentionRate * 100)}%, citation rate: ${Math.round(citationRate * 100)}%`
// CORRECT (value is already a percentage; just format):
`Mention rate: ${mentionRate.toFixed(1)}%, citation rate: ${citationRate.toFixed(1)}%`
```
- Remove EVERY `* 100` / `*100` applied to `mention_rate` / `citation_rate` in the report/narrative code path.
- Use `.toFixed(1)` (or `Math.round`) for display — but NO multiply. `70.0` → "70.0%", not "7000%".
- **Do NOT touch `mention_source_ratio`** — that one is genuinely 0-1 (the ×100 cancels in citation_rate/mention_rate),
  per MS-01; its thresholds are correct. Only the two raw RATES are mis-rendered.
- Check the PDF builder too (`lib/communication/pdf-builder.tsx`) in case the ×100 is in the render layer, not the
  narrative-text builder — fix wherever the multiply is.

## STEP 3 — MINOR: distinct content per section (de-duplicate)
The exec summary and "Mention Source Breakdown" currently render the same sentence. In
`generate-narrative-report.ts`, confirm each section builds its OWN summary:
```bash
grep -n "executive_summary\|mention_source_summary\|Mention Source\|archetype\|sections\|summary" inngest/functions/generate-narrative-report.ts | head
```
- Executive summary: the high-level visibility movement + archetype (the "Visibility improved by X points… Brand
  archetype: …" line).
- Mention Source Breakdown: should describe the mention-vs-citation SPLIT specifically (the archetype quadrant, the
  mention_source_ratio interpretation, cited-vs-mentioned) — NOT repeat the exec-summary sentence verbatim.
If they legitimately share the archetype fact, that's fine, but the Mention Source section must add its own
distinct analysis rather than being a byte-identical copy. Report what each section currently emits.

## STEP 4 — VERIFY (generate a NEW report, open the PDF, read the numbers)
```bash
# after generating a new report for W27 with the fix:
psql "$DATABASE_URL" -c "SELECT id, period_label, narrative_text, mention_source_summary, created_at FROM generated_reports WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' ORDER BY created_at DESC LIMIT 1;"
```
- `citation rate` now reads a SANE percentage (≤ 100%) — e.g. "70.0%", matching the raw `citation_rate` value from
  STEP 1. NO "7000%".
- `mention rate` reads correctly (0.0% if genuinely zero, or its real value — not mis-scaled).
- **OPEN the new PDF** and confirm: citation rate ≤ 100%, and the Mention Source Breakdown section says something
  DIFFERENT from the executive summary (STEP 3).
Report the exact rendered line + the raw DB values so they can be cross-checked (raw 70 → renders "70.0%").

## Constraints
- The stored unit is 0-100 (MS-01 authoritative) — do NOT "fix" by changing the aggregator to write 0-1; the prototype
  and thresholds all assume 0-100. Fix the RENDER (remove the ×100), unless STEP 1 shows the stored value itself is
  wrong (then fix the aggregator formula and report first).
- Leave `mention_source_ratio` (0-1) untouched.
- No status column; status stays CM-01-derived. No schema change expected.
- Old W27 report with 7000% is an append-only artifact — leave it; prove a NEW one is correct.

## Verification greps
```bash
grep -rn "citation_rate\|mention_rate" inngest/functions/generate-narrative-report.ts lib/communication/ | grep -n "\* *100"   # → expect 0 hits after fix
grep -rn "mention_source_ratio" inngest/functions/generate-narrative-report.ts lib/communication/                              # → the 0-1 ratio, NOT multiplied
```

## NOTE
This is MS-01 biting in the one place it wasn't fixed: the thresholds and prototype were corrected, but the report's
narrative renderer still double-scales the already-0-100 rates. The tell is the impossible 7000% — 70 × 100. STEP 1
(raw DB value) confirms whether it's a render ×100 (expected) or a corrupted stored value (upstream). Read the actual
rendered PDF line after the fix — "70.0%" is right, anything over 100% is still broken.
