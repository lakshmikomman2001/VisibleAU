# Claude Code — Sprint 5 tail: 4 test fixes (real behavioral) + Bug C (S5 PDF section cards)

Close the Sprint 5 tail — test-polish on WORKING code + one cosmetic PDF fix. No dead features/security holes remain
(RLS verified, sections live, alerts fire). Five parts, independent — do all five.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau` (tests) + local prod `visibleau_prod` (Bug C render
check). Never real prod. Each test fix needs a re-break proof (break the thing, confirm the test fails, restore).

## PART 1 — citation-intelligence.test.ts: fix the type-broken test (post-P3 contract drift)
The P3 fix made the routes return real NUMBERS. This test passes STRINGS ("21") to computeGapSeverity's number param →
10 TS errors, and now tests a contract that no longer matches production.
```bash
grep -n "computeGapSeverity\|\"21\"\|'21'\|citationShare\|as any\|as number\|: number" tests/**/citation-intelligence.test.ts
sed -n '1,60p' tests/**/citation-intelligence.test.ts
grep -n "function computeGapSeverity\|computeGapSeverity(" lib/trust/citation-intelligence.ts   # the real signature
```
Fix: pass real NUMBERS matching the function's actual param types (the post-P3 "number in" contract). Clear all 10 TS
errors. Assertions stay behavioral (call computeGapSeverity, assert the severity output). 
Re-break: change the severity thresholds in the function → tests FAIL → restore.

## PART 2 — entity-checker.test.ts: rewrite smoke/fake → real behavioral
Currently only `typeof refreshEntityScore === "function"` + `.length >= 0` — tests nothing. Rewrite to call the real
function and assert computed output.
```bash
sed -n '1,50p' tests/**/entity-checker.test.ts
grep -n "export.*refreshEntityScore\|export.*computeEntityScore\|score_of_10\|scoreOf10\|knowledgePanel\|wikidata\|auTld" lib/trust/entity-checker.ts
```
Rewrite to assert real behavior of the entity scoring (per §6.1/D-01 — score_of_10 is canonical):
- given entity inputs (knowledge_panel_present/accurate, wikidata present, au_tld, etc. — the real signals), assert the
  computed score_of_10 is correct for known inputs (table-drive a few cases).
- assert edge cases: all-signals-present → high score; none → low; the specific formula the function implements.
- if refreshEntityScore is a DB-writing Inngest fn (not pure), test the pure scoring core it calls (extract if needed,
  behavior-preserving), OR seed a row + assert the written score. Don't just assert `typeof`.
Re-break: break the scoring formula → tests FAIL → restore. (If it stays green, it's still not behavioral.)

## PART 3 — entity-alter.migration.test.ts: rewrite source-grep → real DB assertion
Currently readFileSync + regex on the SQL file — CANNOT catch runtime bugs. (This session PROVED it worthless: the
migration wasn't applied to prod and a SQL-text grep would still pass.) Rewrite to assert the actual DB schema.
```bash
sed -n '1,50p' tests/**/entity-alter.migration.test.ts
```
Rewrite to query the REAL (dev) DB schema and assert the ALTER columns exist with correct types:
```ts
it('brand_entity_scores has the S5 ALTER columns', async () => {
  const cols = await db.execute(sql`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='brand_entity_scores'`);
  const names = cols.rows.map(r => r.column_name);
  expect(names).toContain('knowledge_panel_present');
  expect(names).toContain('knowledge_panel_accurate');
  expect(names).toContain('wikidata_present');   // + the other ALTER cols per the migration
  // D-01 guard: assert entity_score and scored_at are NOT added (Phase 1 score_of_10/checked_at canonical):
  expect(names).not.toContain('entity_score');
  expect(names).not.toContain('scored_at');
});
```
- Assert the actual ALTER columns (grep migration 0017 for the exact list) with correct nullability.
- Include the D-01 negative assertions (no entity_score, no scored_at — §101-102).
Re-break: this now tests the real DB, so it'll pass only when the migration is applied (which it is). (Optional: on a DB
missing the columns it would FAIL — that's the point; it now catches the migration-not-applied bug the grep version
couldn't.)

## PART 4 — WRITE computeTrustSummary test (the aggregate scorer — zero coverage, contaminated the card)
`computeTrustSummary` (trust-scorer, §6.3 — "aggregate trust signals → the Trust-hub score") has NO test. It produced
the 60 that contaminated the risk card earlier. Add real behavioral coverage — this is the "close the barn door" one.
```bash
grep -n "export.*computeTrustSummary\|computeTrustSummary(\|Number(\|scoreOf10\|aggregate" lib/trust/trust-scorer.ts
sed -n '1,80p' lib/trust/trust-scorer.ts
```
Test:
- given known trust signals (entity score_of_10, consensus, linkedin, etc. — the real inputs), assert the aggregated
  Trust-hub score is computed correctly (the /100 or /10 the function returns).
- assert the Drizzle-string safety: pass a scoreOf10 as a STRING (as Drizzle returns it) → the function still computes
  correctly (it already does Number() coercion at line ~66 — assert that survives; a string input must not break it).
- edge cases: all-high signals → high aggregate; missing signals → sensible handling (not NaN).
Re-break: break the aggregation formula → test FAILS → restore. This is the coverage whose absence let the card
contamination ship.

## PART 5 — Bug C: S5 sections get dedicated PDF section cards (not just narrative-text)
S5 content currently only appears as narrative_text paragraphs; S4 sections (fan-out, topical, mention-source) get
dedicated structured cards (title + data) in render-report-pdf. Extend the same pattern to the 5 S5 sections.
```bash
sed -n '51,110p' inngest/functions/render-report-pdf.ts   # the S4 card creation (fan-out/topical/mention-source)
grep -n "section card\|SectionCard\|fanOut\|topical\|mentionSource\|card\|title\|narrativeText" inngest/functions/render-report-pdf.ts lib/communication/pdf-builder.tsx | head
```
Add dedicated cards for the 5 S5 sections (linkedin_performance, consensus_score, knowledge_panel_status,
source_type_gaps, evidence_snapshots), matching the S4 card structure (title + the section's data/score), so they render
as structured cards in the PDF, not just paragraph text:
- Each card: section title + its key metric (LinkedIn 45/100, consensus 67/100 across N sources, knowledge-panel status,
  source-type gap count, evidence snapshot count) — pull from the same summary fields the narrative uses.
- Respect the same include/condition logic (only render a card when the section is included AND has data — e.g.
  knowledge_panel card only when the §240 condition renders it).
- Match the existing card component/styling (don't invent a new card style — reuse the S4 card pattern).
VERIFY (local prod, Metropolitan seeded): generate a report → open the PDF → the 5 S5 sections appear as STRUCTURED
CARDS with titles + data, not just plain narrative paragraphs. Report before/after.

## STEP FINAL — Run + report
```bash
<repo test cmd> run   # full suite
```
- Parts 1-4: each test now real behavioral; each re-break proof fired (break → fail → restore). Report the count.
- Also fix the S3 seam-count stale test (hardcoded count not reflecting S5 additions — bump to the correct number; it's
  Bucket A stale, same class as the earlier 24→27 fix).
- Part 5: S5 sections render as structured PDF cards (before/after on screen).
- Full suite green; report total (was ~1848 + trust-rls 30 + these).

## Constraints
- Real behavioral tests — NO source-greps (readFileSync→toContain), NO smoke (typeof/.length). Each must FAIL when its
  target breaks (the re-break proof) — that's the bar.
- Part 3 asserts the REAL DB schema (information_schema), not SQL text — the grep version was proven worthless this
  session.
- Part 4 must assert Drizzle-string safety (string scoreOf10 in → correct out) — the coercion that matters.
- Part 5: reuse the S4 card pattern/styling; respect include+condition (knowledge_panel §240); verify on screen.
- Fix the S3 seam-count stale test (bump the number) — don't leave it red.
- Dev DB for tests, local prod for the Bug C render check, never real prod. LLD v8.70 / D-01 / §240 win.

## NOTE
The tail — test-polish on working code + one cosmetic PDF fix. Make the 3 weak tests REAL: citation (pass numbers, post-
P3 contract), entity-checker (assert computed score, not typeof), entity-alter (query real DB schema, not grep SQL —
the grep couldn't catch the migration-not-applied bug this session hit). Add the missing computeTrustSummary test (the
aggregate that contaminated the card — assert correct aggregation + Drizzle-string safety). Bug C: give the 5 S5
sections structured PDF cards like the S4 sections, respecting the §240 condition. Every test fix needs the re-break
proof (break → fail → restore) — the standard that's held all session. Then Sprint 5's tail is clear.
