# Claude Code — DIAGNOSE ONLY: report PDF renders "No data available for this period" → root-cause the empty prod pipeline

## What the PDF revealed (the real problem, finally visible)
The downloaded PDF is a near-empty **shell**: VisibleAU header, "AI Visibility Report", "Generated: 04/07/2026",
**"No data available for this period."**, Confidential footer. ~2155 bytes = cover page, zero content. The PDF pipeline
works; **the report has no data to render.** This is NOT a PDF bug — it is the narrative generator's empty-report guard
firing correctly (CC-05, LLD 1335: "generateText narrative call is SKIPPED when table is empty").

**Root cause is upstream, and it's ONE cause behind THREE symptoms we've seen:**
1. PDF says "No data available" (this screenshot)
2. All reports have `fan_out_summary: null` (earlier)
3. `query_fan_out_results` has ZERO rows in prod; `simulate-query-fan-out` never ran (earlier)

All three = **the Sprint-3 post-audit pipeline has never populated data for this brand/period in prod.** Every report
section is period-gated on Sprint-3 tables (LLD 8446-8460): RULE 4 fan-out needs `query_fan_out_results` for the
period; score/mention/topical sections need `visibility_trends` / `share_of_voice_snapshots` for the period. All empty
→ every section null → "No data available."

**This diagnostic SUPERSEDES the earlier fan-out re-run** (folds its Q1–Q5 in) and adds the period-label + empty-input
checks the PDF exposed. **DIAGNOSE ONLY — change NO source/data/env.** Answer every Q with command output.

## Canon (verified — the exact wiring + the two prime suspects)
- Report fires on **`trend/aggregated`** (LLD 6584: emitted by `aggregate-visibility-trend.ts` with
  `{ brandId, orgId, periodLabel, periodType }`), gated on an active delivery schedule.
- **SUSPECT A — the pipeline never ran:** post-audit functions listen on **`audit/complete`** (SLASH). If
  `run-audit.ts` emits the wrong event or the functions aren't in prod `serve()`, NONE of them run → all tables empty.
  (Same class as the render-report-pdf bug that WAS missing from serve() this session.)
- **SUSPECT B — EP-01 empty-period SKIP (LLD 1140-1145):** `aggregate-visibility-trend.ts` **does NOT insert a
  visibility_trends row if COUNT(completed audits in the period) = 0.** So even if the function runs, a brand with no
  completed audit *inside the period window* gets no trend row → no `trend/aggregated` with data → empty report. **This
  is the most likely cause given a single July-3 audit and a report period of `2026-W01`.**
- **SUSPECT C — period_label MISMATCH (L-02, LLD 3571-3573; 6078-6083):** canonical format is
  `format(startOfISOWeek(date), "yyyy-'W'II")` → `'2026-W01'` (ISO week, zero-padded). `UNIQUE(brand_id, period_label,
  period_type)` requires EXACT match. If the aggregator wrote data under a different label than the report queries, the
  WHERE finds nothing though data exists.
- Empty-report guard: narrative call SKIPPED when the section tables are empty → "No data available" (CC-05).

Env: local PROD DB, real LLMs, Supabase. Brand `0f531803-b529-4d09-9fd6-b6272b5baba8` ("Bondi Plumbing"), Agency org,
report period `2026-W01`.

---

## Q1 — Is the post-audit pipeline REGISTERED in prod serve()? (Suspect A, part 1)
```bash
sed -n '1,80p' app/api/webhooks/inngest/route.ts
grep -nE "aggregateVisibilityTrend|aggregate-visibility-trend|simulateQueryFanOut|calculateShareOfVoice|classifyCitationSources" app/api/webhooks/inngest/route.ts
```
ANSWER: paste the full `functions: [...]` array. Are `aggregate-visibility-trend`, `simulate-query-fan-out`,
`calculate-share-of-voice` in it — YES/NO each?

## Q2 — What event does run-audit.ts EMIT on completion? (Suspect A, part 2)
```bash
grep -n "inngest.send\|name: *'audit\|name: *\"audit\|audit/complete\|audit.complete\|markComplete" inngest/functions/run-audit.ts
```
ANSWER: quote the exact `inngest.send({ name: '...' })` line at audit completion. Is it EXACTLY `'audit/complete'`
(slash)? Or a dot form / absent?

## Q3 — Are the Sprint-3 tables ACTUALLY empty for this brand? (confirm the symptom + isolate)
```bash
psql "$DATABASE_URL" -c "
  SELECT 'visibility_trends' t, count(*) n FROM visibility_trends WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8'
  UNION ALL SELECT 'share_of_voice', count(*) FROM share_of_voice_snapshots WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8'
  UNION ALL SELECT 'query_fan_out', count(*) FROM query_fan_out_results WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8'
  UNION ALL SELECT 'citation_source_intel', count(*) FROM citation_source_intelligence WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8'
  UNION ALL SELECT 'topical_coverage_gaps', count(*) FROM topical_coverage_gaps WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8';"
```
ANSWER: which are zero, which have rows? If ALL zero → pipeline never populated (Q1/Q2/Q4). If SOME have rows →
partial run; focus on what's missing + Q5 period mismatch.

## Q4 — The July-3 audit: completed? inside the report's period window? did the pipeline fire? (Suspect B — LIKELY)
```bash
psql "$DATABASE_URL" -c "SELECT id, status, created_at, completed_at, EXTRACT(week FROM created_at) iso_week, to_char(created_at, 'IYYY-\"W\"IW') derived_label FROM audits WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' ORDER BY created_at DESC LIMIT 5;"
```
ANSWER:
- Did the July-3 audit reach `status='complete'`?
- What ISO-week label does its `created_at` derive to (`derived_label` col)? **Is it `2026-W01`** (the report's period)
  or a DIFFERENT week? **If the audit is NOT in the 2026-W01 window, EP-01 SKIPS the trend insert → empty report is
  EXPECTED.** (July 3 2026 is ISO week 27, NOT W01 — so if the report is asking for W01 there is a real period
  mismatch; confirm what the audit derives to and what the report queried.)
- Is there ANY `aggregate-visibility-trend` / `simulate-query-fan-out` run in Inngest history for this audit?
```bash
lsof -i :8288 -i :8290 2>/dev/null || netstat -ano | findstr ":8288 :8290"
curl -s "http://localhost:8288/v1/runs?limit=40" 2>&1 | head -80
```

## Q5 — Period-label consistency: what label did the aggregator WRITE vs what the report QUERIED? (Suspect C)
```bash
# What period_labels exist in visibility_trends for this brand (if any)?
psql "$DATABASE_URL" -c "SELECT DISTINCT period_label, period_type FROM visibility_trends WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8';"
# What period_label do the generated reports carry?
psql "$DATABASE_URL" -c "SELECT id, period_label, created_at FROM generated_reports WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' ORDER BY created_at DESC LIMIT 4;"
# How does the report route DERIVE the period it queries? And how does the aggregator FORMAT period_label?
grep -rn "period_label\|periodLabel\|startOfISOWeek\|IYYY\|'W'\|to_char\|isoWeek\|format(" inngest/functions/generate-narrative-report.ts inngest/functions/aggregate-visibility-trend.ts lib/communication/ | grep -i "period\|week\|format\|iso" | head
```
ANSWER: do the labels MATCH? Both `'2026-W01'` (or both the same real week)? Or does the report query one label while
any data sits under another? Confirm both use `format(startOfISOWeek(date), "yyyy-'W'II")` (L-02 canonical). A mismatch
here = data exists but the WHERE misses it.

## Q6 — Confirm the "No data" guard is what rendered the shell (consumer side)
```bash
grep -n "No data available\|No data\|SKIP\|hasData\|isEmpty\|generateText\|narrative_text\|sections\|return.*null" inngest/functions/generate-narrative-report.ts | head -20
psql "$DATABASE_URL" -c "SELECT id, period_label, narrative_text, headline, executive_summary, score_breakdown, fan_out_summary FROM generated_reports WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' ORDER BY created_at DESC LIMIT 1;"
```
ANSWER: on the newest report row — are narrative_text / executive_summary / score_breakdown / fan_out_summary ALL
null/empty? (Confirms the empty-guard fired because every section had no source rows — not a render bug.)

---

## VERDICT — pick ONE, backed by Q1–Q6 output:
- **V-A — PIPELINE NEVER RAN** (Q1 functions missing from serve() OR Q2 wrong `audit/complete` emit; Q3 all zero;
  Q4 no runs). → Real wiring bug. Fix = register functions / correct the emit. This unblocks EVERYTHING (fan-out +
  report content). **Most impactful if true.**
- **V-B — EMPTY-PERIOD / PERIOD MISMATCH** (Q4: audit completed but its ISO week ≠ the report's `2026-W01`, so EP-01
  skipped the trend insert; OR Q5: aggregator wrote one label, report queried another). → The pipeline is fine; the
  report is asking for a period with no data. Fix = generate the report for the period the audit actually populated,
  OR fix the period-label derivation to match (L-02). **Most likely given a single July-3 (W27) audit vs a W01 report.**
- **V-C — PARTIAL RUN** (Q3 some tables have rows, others empty) → specific function failing; report which + its error.
- State which, with the Q-by-Q evidence. Do NOT declare "report works" — the deliverable is empty; either the pipeline
  is broken (V-A) or the report is querying the wrong/empty period (V-B), and both need a fix.

## NOTE — this is ONE root cause, not three bugs
The empty PDF, the null fan_out_summary, and the never-ran fan-out are the SAME thing: no Sprint-3 data for the queried
period in prod. The two real candidates: (A) the whole post-audit pipeline never fired (serve()/emit — a genuine bug
that also explains the fan-out mystery), or (B) the report is asking for period `2026-W01` while the only audit ran in
ISO week 27 (July 3), so EP-01 correctly wrote nothing for W01. **Note July 3 2026 = ISO week 27; a report period of
2026-W01 is early January — so a period mismatch (V-B) is the leading hypothesis.** Q4 (the audit's derived week vs the
report's period) is the single most decisive check. Confirm PROD DB + real LLM throughout. Once we know V-A vs V-B, the
fix is small and specific — but "reports work" cannot be signed off against an empty PDF.
