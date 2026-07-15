# Claude Code — FIX (CORRECTED): the ×100 removal crashed because the value is a STRING, not a number

## What the crash revealed (this is the real root cause)
`narrative-generator.ts:155` now throws: **`TypeError: mentionRate.toFixed is not a function`** — retried 3×,
permanently failed. So report generation is CRASHING → no new PDF written → the PDF on screen is the STALE 6fde33c5
report from before (same ID), which is why it still shows 7000%.

**Why it crashed — and why this explains the ENTIRE saga:** line 153 does `(trend.mentionRate as number | null) ?? 0`.
That `as number` is a TypeScript CAST — it satisfies the compiler but does NOTHING at runtime. **Drizzle returns
`NUMERIC(5,2)` columns as JavaScript STRINGS** (`"0.00"`, `"70.00"`), not numbers. (Same class as the Sprint-3
`getWinsFeed` fix where `sql<Date>` MAX() actually returned a string and needed `new Date(...)` coercion.) So:
- OLD code `mentionRate * 100` "worked" by ACCIDENT — JS coerces `"70.00" * 100` → `7000` in arithmetic. The ×100 was
  multiplying an already-0-100 value AND silently string-coercing. That's the 7000%.
- NEW code `mentionRate.toFixed(1)` CRASHES — strings have no `.toFixed`.

The stored value is the string `"70.00"`. The `as number` cast has been lying the whole time.

## The fix — coerce to a real number FIRST, then the no-×100 logic is correct
`lib/communication/narrative-generator.ts`, lines ~153-155 (and 226-227 for the mentionSourceSummary):
```ts
// WRONG (cast doesn't convert; value is a string at runtime):
const mentionRate  = ((trend as Record<string, unknown>).mentionRate  as number | null) ?? 0;
const citationRate = ((trend as Record<string, unknown>).citationRate as number | null) ?? 0;
// ... `Mention rate: ${mentionRate * 100}%` (old) / `${mentionRate.toFixed(1)}%` (crashes)

// RIGHT — coerce with Number(), THEN format without ×100 (value is already 0-100 per MS-01):
const mentionRate  = Number((trend as Record<string, unknown>).mentionRate  ?? 0);
const citationRate = Number((trend as Record<string, unknown>).citationRate ?? 0);
// ... `Mention rate: ${mentionRate.toFixed(1)}%, citation rate: ${citationRate.toFixed(1)}%`
```
- `Number("70.00")` → `70` → `.toFixed(1)` → `"70.0"`. Crash gone, renders 70.0% (NOT 7000%, NOT a TypeError).
- Apply the SAME `Number(...)` coercion at lines 226-227 (mentionSourceSummary passed to the PDF) — and remove any
  `* 100` there too.
- Guard NaN: `Number(null)`→0 via `?? 0` on the field; if a value could be non-numeric, `Number.isFinite(x) ? x : 0`.
- Do NOT reintroduce `* 100`. The value is already a percentage (MS-01). The ONLY change vs the last attempt is
  coercing string→number before calling `.toFixed`.

## STEP 1 — Apply + restart + regenerate (the crash means nothing has regenerated yet)
```bash
sed -n '150,160p' lib/communication/narrative-generator.ts
sed -n '222,230p' lib/communication/narrative-generator.ts
```
Fix both spots, then **RESTART the Inngest dev server** (function edits need a restart, not Fast Refresh), then click
Generate report. Watch the Inngest terminal: the `generate-narrative-report` step must complete with NO
`toFixed is not a function`.

## STEP 2 — Verify the display is fixed
```bash
psql "$DATABASE_URL" -c "SELECT id, period_label, narrative_text, created_at FROM generated_reports WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' ORDER BY created_at DESC LIMIT 1;"
```
- NEW report (created_at just now, NEW id ≠ 6fde33c5), narrative reads "citation rate: 70.0%" — a value ≤ 100%, no
  7000%, no crash.
- OPEN the new PDF: sane percentage.

## STEP 3 — SWEEP for the same landmine elsewhere (as-number casts on Drizzle NUMERIC/aggregate columns)
This bug is `as number` on a NUMERIC column. It's almost certainly not the only one — anywhere the code does MATH on
such a cast, JS coercion hides it; the moment a number METHOD is called (`.toFixed`, `.toPrecision`), it crashes.
```bash
grep -rn "as number" lib/communication/ lib/visibility/ inngest/functions/ | grep -iE "rate|score|share|ratio|composite|avg|volatility|estimate|percent|numeric" | head -40
grep -rn "\.toFixed\|\.toPrecision\|Number(" lib/communication/ lib/visibility/ | head
```
Report any OTHER `as number` casts on rate/score/share/ratio columns that feed `.toFixed`/arithmetic-then-display.
Don't fix them all now — LIST them so we can decide scope. (Prime candidates: score_composite_avg, brand_share,
competitor_share, mention_source_ratio, citation_volatility_score.)

## STEP 4 — DATA BUG still stands (BUG A — separate, do NOT skip)
Fixing the crash makes it render "70.0% / 0%" — which is STILL impossible data. Stored `citation_rate=70, mention_rate=0`
violates the subset rule (a prompt citing the brand domain is a prompt mentioning the brand → citation ≤ mention). That
is the aggregator bug from the previous prompt (citation numerator likely not filtered to the BRAND domain; or the
mention detector under-counts). Run STEP A1/A2 from the prior fix (`fix-citation-rate-7000-percent-scaling`'s BUG A
section) — read both numerators, run the FILTER SQL to see which counter lies, fix it, re-aggregate. The display fix and
the data fix are independent; both are required before this is done.

## Constraints
- Coerce with `Number(...)`; keep NO `* 100` (value is 0-100 per MS-01).
- Restart the Inngest dev server before regenerating (edits to inngest/lib used by functions don't hot-reload reliably).
- The stale 6fde33c5 PDF won't change until generation SUCCEEDS — verify a NEW report id.
- Leave mention_source_ratio's NULL-on-zero-mention guard intact.

## Verification greps
```bash
grep -n "mentionRate\|citationRate" lib/communication/narrative-generator.ts | grep -E "Number\(|\* *100"   # → Number() present, no *100
grep -n "as number" lib/communication/narrative-generator.ts                                                # → the rate casts replaced by Number()
```

## NOTE
The `.toFixed` crash is the tell that unravels everything: the value is the STRING "70.00" (Drizzle NUMERIC → string),
the `as number` cast never converted it, and the old `* 100` only "worked" via JS string→number coercion (which is ALSO
why it was 7000% — multiplying an already-percentage). Fix = `Number(...)` then `.toFixed(1)`, no `* 100`. That renders
70.0% and stops the crash. Then STEP 3 sweeps for sibling `as number` landmines, and STEP 4 (the aggregator's impossible
70/0) is still a separate, required fix. Restart the server; confirm a NEW report id; read the PDF.
