# Claude Code — DIAGNOSE ONLY: 7000% STILL showing after the fix — why? (3 candidates, one query settles it)

A NEW report was generated (05/07/2026, id 6fde33c5…) and it STILL reads "citation rate: 7000%, mention rate: 0%".
Before any more code changes, establish WHICH of three things is true. Change NOTHING. Run these and paste raw output.

## The key fact you may have missed
The report generator READS `visibility_trends` — it does NOT recompute it. So:
- If the fix was renderer-only (removed the ×100 in generate-narrative-report/pdf-builder), but the STORED
  `citation_rate` is still wrong, **every regenerated report keeps printing the wrong number** — because it re-reads the
  same stale row. A renderer fix requires the stored value to be sane; an aggregator fix requires RE-RUNNING the
  aggregation (not just regenerating the report) to overwrite the row.

## Q1 — The raw stored row (the single decisive query — I have NOT seen this yet)
```bash
psql "$DATABASE_URL" -c "SELECT period_label, period_type, mention_rate, citation_rate, mention_source_ratio, brand_archetype, updated_at FROM visibility_trends WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' AND period_label='2026-W27';"
```
Report the exact `mention_rate` and `citation_rate` numbers. Three cases:
- **citation_rate = 7000** → the ×100 is in the AGGREGATOR (stored already-scaled). Renderer fix can't help; the write
  site is wrong.
- **citation_rate = 70, mention_rate = 0** → stored unit OK-ish but DATA is impossible (citation>mention); AND the
  renderer is still ×100'ing 70→7000. Two bugs, and the renderer fix apparently didn't land (Q2).
- **citation_rate = 0.70** → stored as 0-1; aggregator ×100 missing.

## Q2 — Did the renderer fix actually land? (was it applied to the right file?)
```bash
grep -rn "citation_rate\|citationRate\|mention_rate\|mentionRate" inngest/functions/generate-narrative-report.ts lib/communication/ | grep -n "\* *100\|\*100"
grep -rn "7000\|\* 100\|\*100" inngest/functions/generate-narrative-report.ts lib/communication/pdf-builder.tsx
# Which file actually builds the "citation rate: X%" string? Confirm the ×100 is gone THERE specifically:
grep -rn "citation rate\|Mention rate\|citation_rate.*%\|toFixed" inngest/functions/generate-narrative-report.ts lib/communication/
```
Report: is there STILL a `* 100` on citation_rate/mention_rate anywhere in the report path? If yes → the fix wasn't
applied (or was applied to a different file than the one that builds this string). If no `*100` remains but the PDF
still shows 7000% → the value is stored as 7000 (Q1 case 1) OR the running server wasn't rebuilt (Q3).

## Q3 — Is the running server actually running the fixed code?
```bash
# Was the report regenerated AFTER the code change + a rebuild? Check the generate-narrative-report file mtime vs the
# new report's created_at, and confirm the dev server picked up the change (Fast Refresh / restart).
ls -la inngest/functions/generate-narrative-report.ts lib/communication/pdf-builder.tsx
psql "$DATABASE_URL" -c "SELECT id, created_at FROM generated_reports WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' ORDER BY created_at DESC LIMIT 1;"
```
Report: was the file modified before the new report was generated? Inngest functions often need the dev server
restarted (not just Fast Refresh) to pick up changes — was it restarted after the edit?

## Q4 — Was the AGGREGATION re-run, or just the report? (the likely miss)
If Q1 shows the stored citation_rate is wrong (7000 or 70-with-0-mention), the aggregator must be fixed AND re-run:
```bash
# When was the visibility_trends row last written vs when the fix was made?
psql "$DATABASE_URL" -c "SELECT period_label, updated_at FROM visibility_trends WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' AND period_label='2026-W27';"
grep -rn "citedSources\|brandDomain\|brand.*domain\|\* 100\|citation_rate\s*=" lib/visibility/visibility-trend-aggregator.ts inngest/functions/aggregate-visibility-trend.ts | head
```
Report: has the `visibility_trends` row's `updated_at` changed since the fix? If it's OLDER than the code change, the
aggregator never re-ran → the stored wrong value persists → report keeps reading it. The row must be RECOMPUTED (trigger
a fresh audit, or re-run aggregate-visibility-trend for W27) after fixing the aggregator.

---

## VERDICT — pick ONE with the Q1 numbers as evidence:
- **D1 — renderer fix NOT applied / wrong file** (Q2 still shows `*100`) → apply the ×100 removal to the ACTUAL string
  builder; rebuild/restart the dev server.
- **D2 — renderer fixed but STORED value wrong + aggregation not re-run** (Q2 clean, Q1 citation_rate=7000 or 70/0,
  Q4 updated_at stale) → fix the aggregator (citation numerator = brand domain; both rates same denominator) AND re-run
  aggregation so the row is overwritten, THEN regenerate the report.
- **D3 — server not rebuilt** (Q3: file changed but dev server not restarted) → restart Inngest dev server, regenerate.
- State which, with the raw mention_rate/citation_rate from Q1. Do NOT re-fix blind — Q1 tells us whether we're chasing
  the renderer, the aggregator, the data, or a stale server.

## NOTE
The tell is whether the STORED citation_rate is 7000, 70, or 0.70 (Q1) — I have not seen this number yet, and it
determines everything. Regenerating the report does NOT recompute visibility_trends; if the aggregator wrote a bad row,
only re-running the aggregation fixes it. And Inngest function edits usually need a dev-server restart, not just Fast
Refresh — a report generated right after an edit may have run the OLD code. One query (Q1) + two greps (Q2/Q4) settle
which of the three it is.
