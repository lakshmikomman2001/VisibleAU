# Claude Code — FIX (Bug 1, report content): fan_out_coverage section dumps raw JSON instead of readable prose

The generated PDF renders correctly (pipeline works!) but the **fan_out_coverage section body shows RAW JSON**:
`{"coveredCount":0,"topUncovered":["What are the best options for Who are the best plumbers in Bondi, NSW??",...],"coveragePercent":0,"totalSubQueries":15}`
instead of readable text. The section `body` should be human-readable prose, not a serialized object.

## ✅ THREE-SOURCE CHECK (done)
- **§6.1:** the narrative-generator builds "the rendering logic for all 12 section types" — each section's `body` is
  RENDERED, READABLE text. `ReportSectionData = { title, body }` where body is prose.
- **§6.2 pdf-builder:** renders the sections into the PDF — it renders whatever `body` string it's given. So the bug
  is UPSTREAM in the narrative-generator: the fan_out_coverage section is putting a `JSON.stringify(summaryObject)`
  (or the raw object) into `body` instead of formatting it into a sentence.
- **LLD RULE 7/10/11:** section included when a row exists; evidence-bounded, no over-claiming — so the prose should
  state the actual numbers plainly (0/15, 0%) without inventing.
- **Conclusion:** fix the fan_out_coverage section builder to produce readable prose from the fan-out summary, not
  raw JSON. (Check the OTHER wired sections too — score_breakdown, mention_source_divide, topical_gap_summary,
  executive_summary — for the same raw-object-in-body bug.)

> Investigate-first: find where each section's `body` is built in the narrative generator.
```bash
grep -n "fan_out_coverage\|fanOut\|coveredCount\|topUncovered\|JSON.stringify\|body:\|ReportSectionData\|section" lib/communication/narrative-generator.ts
sed -n '1,140p' lib/communication/narrative-generator.ts
# Confirm the fan_out_summary shape the section reads from:
grep -n "fan_out_summary\|coveredCount\|topUncovered\|coveragePercent\|totalSubQueries" lib/communication/*.ts db/schema/*.ts
```

## THE FIX — render the fan_out_coverage body as prose
Where the fan_out_coverage section's `body` is built, replace the raw object/JSON with formatted, evidence-bounded
prose. Using the summary fields (coveredCount, totalSubQueries, coveragePercent, topUncovered):
- A readable body, e.g.:
  ```
  {coveredCount} of {totalSubQueries} sub-queries mention the brand ({coveragePercent}% coverage).
  Top uncovered queries:
   • {topUncovered[0]}
   • {topUncovered[1]}
   • {topUncovered[2]}
  ```
  (Build the bullet list from topUncovered — cap at ~3-5, join with newlines or the section's list rendering. If the
  PDF section renderer supports a list, use it; otherwise newline-separated text.)
- Evidence-bounded (RULE): state the real numbers (0/15, 0%) plainly; if coveredCount is 0, a plain
  "None of the {N} sub-queries mention the brand yet." reads better than "0 of 15".
- Do NOT `JSON.stringify` the object into the body. The body is prose a customer reads.

### Check the other 4 wired sections for the same bug
Confirm executive_summary, score_breakdown, mention_source_divide, topical_gap_summary each build a PROSE body
(not a raw object). Fix any that also dump JSON/objects. (The report screenshot only showed fan_out_coverage, but
the same pattern may affect the others.)

## INVARIANTS
- Section `body` is readable prose (never JSON.stringify of a data object).
- Evidence-bounded — real numbers, no over-claiming (RULE 7/10/11). No invented data.
- Keep the section framework (12 types, include/order); only fix the BODY formatting of the wired sections.
- Don't touch the forward-slot sections (S5/S6) — they're not wired.
- Note: the nested sub-query text ("What are the best options for Who are the best plumbers...??") is a SEPARATE
  upstream data bug in fan-out generation (diagnosed separately) — this fix just formats whatever topUncovered
  strings exist into prose; it doesn't fix the nesting (that's the fan-out generator).
- TS strict; core tsc clean; 78 tests green.

## VERIFY (open the actual PDF)
1. Generate a report → download → OPEN the PDF.
2. The **fan_out_coverage section reads as prose** (e.g. "None of the 15 sub-queries mention the brand yet. Top
   uncovered queries: …"), NOT raw JSON.
3. The other wired sections (executive_summary, score_breakdown, mention_source_divide, topical_gap_summary) also
   read as prose.
4. The numbers are accurate (0/15, 0%) — evidence-bounded.
5. Core tsc clean; 78 green.

## REPORT
- Where the fan_out_coverage body was built (the raw-JSON line) → the new prose formatting.
- Which OTHER wired sections had the same bug + their fixes.
- **On-screen: the PDF's sections read as readable prose** (with a before/after of the fan-out section).
- Confirm: no JSON.stringify in bodies; evidence-bounded; core tsc clean; 78 green.

## NOTE
Pipeline works — this is report CONTENT QUALITY: the section bodies must be readable prose, not serialized data. The
nested-query text is a separate upstream fan-out-generation bug (see the other diagnosis). Fix the prose rendering
here; the fan-out data nesting there.
