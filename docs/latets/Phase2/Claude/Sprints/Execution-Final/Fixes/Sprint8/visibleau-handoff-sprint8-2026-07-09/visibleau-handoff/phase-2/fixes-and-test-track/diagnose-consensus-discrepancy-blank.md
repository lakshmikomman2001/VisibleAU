# Claude Code — DIAGNOSE + FIX: consensus discrepancy rows render blank (`: this source says "", website says ""`)

The Cross-Platform Consensus screen is mostly correct (67/100 → High badge ✓, Refresh readable ✓, per-source scores
75/75/50 average to 67 ✓, match booleans ✓). BUT every discrepancy row renders EMPTY:
`: this source says "", website says ""` — no field name before the colon, both quoted values blank. Spec §348 says it
should read `"website says X, Hipages says Y"` with REAL values. Two possible causes — find which, fix accordingly.

Env: Windows repo `C:\startup\VisibleAU\src\`. App runs on LOCAL PROD `visibleau_prod`; dev `visibleau`. Never real prod.
Brand 418f321f-2489-4560-aaa9-895728580465.

## STEP 1 — Look at what's ACTUALLY in the discrepancies JSONB (settles seed-vs-code in one query)
```bash
psql "$PROD_URL" -c "SELECT source_type, consistency_score, discrepancies FROM brand_consensus_checks WHERE brand_id='418f321f-2489-4560-aaa9-895728580465' ORDER BY source_type;"
```
Report the raw `discrepancies` value for each source. Classify:
- **JSONB is empty / blank / placeholder** (e.g. `[{"field":"","sourceValue":"","websiteValue":""}]` or `[]` or nulls)
  → **SEED ISSUE**: the display is faithfully rendering empty seeded data. The component is likely FINE. → STEP 2A.
- **JSONB has REAL data** (e.g. `[{"field":"service","sourceValue":"24/7 emergency","websiteValue":"business hours"}]`)
  but the screen shows blanks → **CODE BUG**: the component reads the wrong keys. → STEP 2B.

## STEP 2A — If SEED ISSUE: re-seed with realistic discrepancies (display was correct)
The reddit source (50/100, most ✗'s) should have the most discrepancies; google/linkedin (75) fewer. Re-seed the
`discrepancies` JSONB with realistic field/value pairs matching the EXACT keys the component reads (confirm from
consensus-discrepancy-card.tsx — see STEP 2B grep for the real key names):
```sql
-- example shape (USE THE REAL KEYS from the component — field/sourceValue/websiteValue or whatever it reads):
UPDATE brand_consensus_checks SET discrepancies = '[{"field":"differentiators","sourceValue":"budget plumber","websiteValue":"premium 24/7 service"}]'::jsonb
  WHERE brand_id='418f321f...' AND source_type='google_business_profile';
UPDATE brand_consensus_checks SET discrepancies = '[{"field":"service","sourceValue":"general handyman","websiteValue":"licensed plumbing"},{"field":"location","sourceValue":"Sydney","websiteValue":"Melbourne"},{"field":"differentiators","sourceValue":"","websiteValue":"emergency callout"}]'::jsonb
  WHERE brand_id='418f321f...' AND source_type='reddit';
-- etc — match the discrepancy COUNT to the ✗ booleans per source.
```
Then reload → the discrepancy rows show real "field: this source says X, website says Y". Report.

## STEP 2B — If CODE BUG: fix the key mismatch in the discrepancy card
```bash
cat components/domain/trust/consensus-discrepancy-card.tsx 2>/dev/null || find . -name "consensus-discrepancy-card.tsx"
# What keys does the component read vs what consensus-checker WRITES?
grep -n "field\|sourceValue\|websiteValue\|source_value\|website_value\|this source says\|website says\|discrepanc\|\.map(" components/domain/trust/consensus-discrepancy-card.tsx
grep -n "field\|sourceValue\|websiteValue\|source_value\|website_value\|discrepancies\|push(" lib/trust/consensus-checker.ts
```
Compare the keys: the component's `d.field / d.sourceValue / d.websiteValue` (or whatever it reads) MUST match the keys
consensus-checker writes into the JSONB. If they differ (e.g. checker writes `source_value` snake but component reads
`sourceValue` camel, or the field key is named differently) → that's the bug (a property-name mismatch, the same class
as brandMentioned→brandAppeared). Fix the component to read the ACTUAL keys the checker writes (or normalize at the
route boundary). The empty leading colon = the field key is being read wrong (undefined → ""); empty quotes = the value
keys are wrong.
Fix + reload → rows render real values. Report the mismatch found.

## STEP 3 — Verify on screen
Reload `/brands/418f321f.../trust/consensus`:
- Each discrepancy row shows `<field>: this source says "<real value>", website says "<real value>"` — no empty colon,
  no empty quotes.
- reddit (50/100) shows more discrepancies than google/linkedin (75/100) — consistent with the ✗ booleans.
Report: discrepancy rows now populated with real field + values.

## STEP 4 — Report
- STEP 1 result: what was in the discrepancies JSONB (empty → seed; real → code).
- Which cause + the fix (re-seeded with real data, OR fixed the component's key mismatch).
- On-screen confirmation: rows show real field/values.
- If CODE BUG: note whether real-customer consensus data would ALSO have rendered blank (i.e. was this a live bug, not
  just a seed artifact) — and whether the Sprint 5 test track needs a consensus-discrepancy render guard.

## Constraints
- STEP 1 FIRST — do not guess seed-vs-code; the JSONB content settles it in one query.
- If SEED: match the discrepancy JSONB keys to what the component actually reads (STEP 2B grep) so re-seeded data renders.
- If CODE: fix the component to read the keys the checker WRITES (or normalize once at the route) — don't rename the
  written data if other things depend on it; align the reader.
- Verify on screen (local prod), not by grep. Never real prod.
- LLD v8.70 / §348 (the "website says X, source says Y" format) win.

## NOTE
The consensus screen's scores/badge/booleans are correct — only the discrepancy ROWS render blank (`: this source says
"", website says ""`). STEP 1's query settles it: if the discrepancies JSONB is empty/placeholder, it's a SEED artifact
(display is correct — re-seed with real field/value pairs); if the JSONB has real data but renders blank, it's a
component KEY MISMATCH (the reader reads different keys than consensus-checker writes — same class as
brandMentioned→brandAppeared — fix the reader). The empty leading colon = field key read wrong; empty quotes = value keys
wrong. Fix whichever, verify real values render on screen. If it's a code bug, it'd blank real customer data too — flag
for a test guard.
