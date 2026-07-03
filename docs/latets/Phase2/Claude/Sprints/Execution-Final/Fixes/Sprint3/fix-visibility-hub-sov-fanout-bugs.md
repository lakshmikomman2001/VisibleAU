# Claude Code — FIX: Visibility hub real bugs (SoV + fan-out) — copy the proven patterns, leave mock artifacts alone

Diagnosis (already done) confirmed these REAL bugs on the Bondi Plumbing visibility hub. Fix them. Three of the
four have a WORKING pattern elsewhere in the codebase — copy it, don't invent. Mock artifacts (canned sub-query
phrasing, fixed 0.500 similarity, 100%/100% mention/citation) are CORRECT mock behavior — do NOT "fix" them.

Brand: `6ece067f-063c-436b-ac42-7952c7d7a271`. Test in `LLM_MODE=mock` (as before). Report-first on STEP 0 only;
the rest are confirmed fixes.

---

## STEP 0 — Resolve the fan-out DUPLICATE question first (2 min, determines Bug 5 scope)
The latest on-screen check shows fan-out sub-queries DUPLICATED — each rank appears TWICE (rank 1 ×2, rank 2 ×2,
rank 3 ×2), producing duplicate-key errors `key '1'`, `'2'`, `'3'`. Determine WHY before fixing:
```bash
# Are there 2× rows per (prompt, rank) for this brand? And from how many DISTINCT audits?
psql "$DEV_DATABASE_URL" -c "SELECT audit_id, original_prompt, sub_query_rank, COUNT(*) FROM query_fan_out_results WHERE brand_id='6ece067f-063c-436b-ac42-7952c7d7a271' GROUP BY audit_id, original_prompt, sub_query_rank ORDER BY original_prompt, sub_query_rank;"
psql "$DEV_DATABASE_URL" -c "SELECT COUNT(DISTINCT audit_id) FROM query_fan_out_results WHERE brand_id='6ece067f-063c-436b-ac42-7952c7d7a271';"
```
Classify:
- **(5a) Multiple audits' rows, unscoped:** if there are 2+ distinct `audit_id`s and the UI shows ALL of them → the
  duplicates are two audit runs' data, and the bug is the API/query NOT scoping fan-out to the LATEST audit. → Fix:
  scope the fan-out route to the latest audit (or dedupe by latest).
- **(5b) Double-generation in ONE audit:** if a SINGLE `audit_id` has 2 rows per (prompt, rank) → the
  `simulate-query-fan-out` function double-inserts (a loop/registration bug producing 6 rows where it should make
  3). → Fix: the generation logic (dedupe / don't double-insert).
Report which, then apply the matching fix in Bug 5.

---

## BUG 1 (DATA, keystone) — `brandDomain` resolves to "" from empty audit.metadata
`calculate-share-of-voice.ts:19`, `aggregate-visibility-trend.ts:22`, and `calculate-topical-gaps.ts:18` read
`audit.metadata.domain`, but audit.metadata is `{"mockScenario": null}` — no `domain` key → `brandDomain = ""`. This
cascades: the brand's own domain (`bondiplumbing.com.au`) then gets counted as a COMPETITOR (passes the
`domain !== ""` filter), so the brand appears as both brand AND competitor → the 4 duplicate rows + nonsensical
shares. **NOT a mock artifact** — real mode also won't have `audit.metadata.domain`.

**Fix — copy the WORKING pattern:** `classify-citation-sources.ts:19` correctly queries `brands.domain` from the
brands table. Do the SAME in all 3 broken functions: resolve `brandDomain` by querying `brands.domain` for the
audit's brand (via serviceDb/tx as those functions already use), NOT from `audit.metadata.domain`.
- After the fix, `brandDomain` is the real domain, so the brand is correctly identified as the brand (not a
  competitor), and SoV rows are correct (brand once, real competitors only).
- Keep using the exact query/pattern `classify-citation-sources.ts` uses (same table, same column, same access
  path) — consistency.

## BUG 2 (RENDER) — SoV donut duplicate React keys
`sov-donut.tsx` keys by the non-unique domain string in TWO spots: line ~72 (legend `<div key={seg.label}>`) and
line ~110 (`<circle key={seg.label}>`). Also `dashboard-sov-strip.tsx:~122` (`key={bar.label}`).
**Fix:** use a unique key — composite `key={`${seg.label}-${i}`}` or index `key={i}` — in all 3 spots. (Even after
Bug 1, a real competitor appearing across multiple engines could repeat a label, so unique keys are needed
regardless.)

## BUG 3 (RENDER) — SoV donut doesn't aggregate across engines
`sov-donut.tsx` takes `entries[0].brandShare` arbitrarily as THE brand share and sorts ALL per-engine rows,
showing duplicates (a competitor in 4 engines appears 4×). The API returns per-engine rows.
**Fix — copy the WORKING pattern:** `dashboard-sov-strip.tsx` (lines ~32–36) already aggregates across engines via a
`competitorMap` (e.g. `Math.max` per domain). Apply the SAME aggregation in `sov-donut.tsx`: dedupe/aggregate the
per-engine rows by domain (one segment per distinct domain — brand once, each competitor once) before rendering.
Brand share should be the aggregated brand value, not `entries[0]`.
- Result: donut shows the brand once + distinct competitors, shares that make sense (per the aggregation the strip
  uses). Match the strip's approach so the two are consistent.

## BUG 4 (DATA) — Fan-out `{location}` stored unsubstituted
`simulate-query-fan-out.ts:39` stores `prompt.promptTemplate` as `originalPrompt` WITHOUT substituting `{location}`.
Templates like "Who are the best plumbers in {location}?" should have `{location}` replaced with the brand's
suburb/region before storage/use.
**Fix:** before storing/using the prompt, resolve `{location}` from the brand's region (e.g. the brand's
`primaryRegions` / suburb field — find how other code resolves the brand's location; reuse that). Substitute
`{location}` → the real suburb. If a brand has multiple regions, use the primary/first (match existing convention).
- The canned sub-query PHRASING ("What are the best options for {original}") and the fixed 0.500 similarity are MOCK
  artifacts (`generateMockSubQueries`, hardcoded) — LEAVE THEM. Only fix the `{location}` substitution.

## BUG 5 (from STEP 0) — Fan-out duplicate rows / rank collision
Apply the fix matching STEP 0's finding:
- **If (5a) multiple-audits-unscoped:** scope the fan-out API route to the LATEST audit for the brand (or dedupe by
  most recent audit_id), so the UI shows one audit's fan-out, not stacked runs.
- **If (5b) single-audit double-generation:** fix `simulate-query-fan-out.ts` so it produces ONE row per (prompt,
  rank) — remove the double-insert / dedupe on the UNIQUE key.
- **Plus (RENDER, regardless):** `fan-out-tree.tsx` keys by `subQueryRank`, which collides when ranks repeat. Make
  its key unique too — composite `key={`${r.originalPromptId ?? r.originalPrompt}-${r.subQueryRank}-${i}`}` or
  index within the group. (The diagnosis called this "fine," but the duplicate data proves it isn't.)

## INVARIANTS
- Copy the PROVEN patterns: Bug 1 → `classify-citation-sources.ts`'s `brands.domain` query; Bug 3 →
  `dashboard-sov-strip.tsx`'s aggregation. Don't invent new approaches.
- Do NOT touch mock artifacts: canned sub-query phrasing, 0.500 similarity, 100%/100% mention/citation — these are
  correct mock behavior and become realistic under `LLM_MODE=real`.
- Bug 1 changes 3 Inngest functions identically (same brands.domain resolution) — keep them consistent.
- Unique React keys everywhere a `.map()` could hit duplicate values (sov-donut ×2, dashboard-sov-strip,
  fan-out-tree).
- Don't change the RLS/`withRlsContext` wiring or the tables; these are logic + render fixes.
- Don't regress the 68/68 tests.

## VERIFY — re-run an audit + check the hub (behavioural, not just tests)
1. **Re-run an audit** for Bondi Plumbing (Inngest dev server up). Confirm the 5 visibility functions fire green
   (as before).
2. **SoV donut:** the brand now appears ONCE (not as its own competitor); shares are sensible (sum ~100% per the
   aggregation); NO duplicate-key errors for `bondiplumbing.com.au`. (With mock data + no real competitors, the
   donut may legitimately show just the brand at ~100% — that's correct now, vs the old 4× 50% mess.)
3. **Fan-out:** `{location}` is SUBSTITUTED (shows a real suburb, not `{location}`); each rank appears ONCE (no
   duplicate `1`/`2`/`3`); NO duplicate-key errors.
4. **Console: 0 duplicate-key errors** (the "10 Issues" → 0). Reload the hub and confirm the issue count is clear.
5. DB sanity: `SELECT * FROM share_of_voice_snapshots WHERE brand_id='6ece067f-...'` — brand no longer a
   competitor; fan-out has one row per (prompt, rank) for the latest audit.
6. 68/68 tests still green.

## REPORT
- STEP 0 classification (5a vs 5b) + the fan-out fix applied.
- Bug 1: the 3 functions now query `brands.domain` (matching classify-citation-sources); SoV no longer treats the
  brand as a competitor.
- Bugs 2 & 3: unique keys + engine aggregation in sov-donut (matching dashboard-sov-strip); donut shows brand once
  + distinct competitors.
- Bug 4: `{location}` substituted from the brand's region.
- Bug 5: fan-out duplicate resolved (latest-audit scope or de-dupe) + fan-out-tree unique keys.
- **Behavioural proof:** re-ran audit, functions green, SoV correct, fan-out substituted + de-duped, 0 duplicate-key
  errors on the hub.
- Mock artifacts left untouched (confirmed). 68/68 green.

## NOTE
This is the manual pass paying off: the pipeline works and produces data, but the DATA-SHAPE (empty-metadata domain,
fan-out {location} + duplicates) and RENDER (keys, no aggregation) bugs were invisible to 68 unit tests (clean
fixtures, not real pipeline output). After this, the SoV + fan-out surfaces should be correct on real (mock) data;
the remaining hub sections (topical gaps empty-state, competitive benchmark "Coming soon", citation-failure) can be
walked next. A real-mode (`LLM_MODE=real`) audit later would confirm the mock-artifact values become realistic.
