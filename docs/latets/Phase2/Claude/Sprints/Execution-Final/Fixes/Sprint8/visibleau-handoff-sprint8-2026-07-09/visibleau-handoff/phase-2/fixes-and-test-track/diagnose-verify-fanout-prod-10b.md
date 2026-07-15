# Claude Code — DIAGNOSE-then-VERIFY: why has fan-out NEVER run in prod? then prove clean sub-queries under real LLM (bug 10b)

## Situation (corrected — read carefully)
The earlier report concluded "bug 10b closed — dev-only stale data." That is **half right and half a false close.** True:
the old nested-question malformation (`"What are the best options for <full question>?"`) was a removed hardcoded
template; current code just asks the LLM (`Generate N search sub-queries for: <prompt>`) and splits on `\n` — no
wrapping. BUT the prod verification was vacuous: **prod has ZERO `query_fan_out_results` rows for ANY brand**, all 3
reports have `fan_out_summary: null`. So we did NOT verify "real LLM produces clean sub-queries" — we verified "no
sub-queries have ever been produced in prod." An empty table is the same information vacuum as mock had. **10b is not
closed until a real audit writes real fan-out rows and we read them.**

Also: `simulate-query-fan-out` having **never completed a run in prod** is itself suspect. Per the LLD it should fire
after every Growth+ audit. Bondi Plumbing is under an **Agency-tier** org (above the Growth+ gate) and a real audit ran
July 3 — so fan-out SHOULD have written rows. Zero rows = something is off. Find what, THEN verify.

**PART 1 is DIAGNOSE-ONLY (change nothing).** **PART 2 (trigger + verify) runs ONLY if Part 1's cause is benign
(never-triggered), NOT if it's a real wiring bug** — if it's a registration/event/budget bug, STOP after Part 1 and
report; that's a fix to scope separately.

Env: local **PROD** DB, real LLMs, `STORAGE_DRIVER=supabase`. Brand `0f531803-b529-4d09-9fd6-b6272b5baba8`
("Bondi Plumbing"), org "Test Org Agency 1" (Agency tier).

## Canon (verified against LLD v8.70 — the event contract is the crux)
- `simulate-query-fan-out.ts` (LLD 6601): triggers on **`audit/complete`** (SLASH — internal convention), **Growth+
  gate**, `concurrency: { limit: 5 }`. Reads `vertical_pack_prompts` (retired filter). Generates 3–12 sub-queries per
  prompt, embeds (`text-embedding-3-small`) + cosine-scores, writes `query_fan_out_results`.
- **THREE similarly-named events — do NOT confuse (v8.70 CANON CORRECTION):**
  - `audit.run` (DOT) — the RUNNER trigger; `run-audit.ts` listens on it with `{ auditId }`; audits row must exist
    first. (Old `audit/start` was WRONG — v8.70 fixed it.)
  - `audit/complete` (SLASH) — emitted by `run-audit.ts` at completion; the **6 post-audit Phase 2 functions listen on
    THIS**, incl. PC-06 fan-out. (LLD 1069–1077.)
  - `audit.completed` (DOT) — the EXTERNAL webhook event (VALID_EVENTS). Different thing.
- Budget: `run-audit.ts` calls `budgetService.estimate()`; if `!withinBudget && hardStopOnBudget` → throws
  `'Budget exceeded'` (LLD 5121). `hard_stop_on_budget` DEFAULT true.
- Sample-org skip: fan-out returns early WHERE `organizations.slug = 'sample'` (O-03).

---

# PART 1 — DIAGNOSE why zero fan-out rows (change NO source/data)

## STEP 1 — Is `simulate-query-fan-out` REGISTERED in the prod serve()? (prime suspect — same class as render-pdf)
```bash
grep -n "serve(" app/api/webhooks/inngest/route.ts
grep -nE "simulateQueryFanOut|simulate-query-fan-out|functions:\s*\[" app/api/webhooks/inngest/route.ts
```
Report: list EVERY function in the serve() array. Is `simulate-query-fan-out` present? **If absent → `audit/complete`
fires but nothing consumes it for fan-out → zero rows. That's the bug (STOP; report — it's a registration fix).**
(Note: the same array was missing render-report-pdf earlier — check the whole list while here; also confirm the other 5
post-audit functions — classify-citation-sources, calculate-share-of-voice, detect-hallucinations,
capture-evidence-snapshot, run-comparison-prompts — are registered, since they share the trigger.)

## STEP 2 — Does run-audit.ts actually EMIT `audit/complete` (slash) on completion? (the v8.70 hazard)
If the runner emits the wrong form (or nothing), ALL 6 post-audit functions are dead, not just fan-out.
```bash
grep -n "audit/complete\|audit.complete\|audit\.completed\|inngest.send\|markComplete\|emit" inngest/functions/run-audit.ts
```
Report: does `run-audit.ts` emit exactly **`{ name: 'audit/complete', data: { auditId } }`** (slash) when the audit
finishes? Or does it emit `audit.complete` / `audit.completed` (dots) / nothing? A slash/dot mismatch here = every
post-audit Phase 2 function silently never fires. **If mismatched → that's the bug (STOP; report — cross-sprint fix).**

## STEP 3 — Do the OTHER post-audit functions have rows in prod? (isolates trigger vs fan-out-specific)
```bash
psql "$DATABASE_URL" -c "
  SELECT 'share_of_voice' t, count(*) FROM share_of_voice_snapshots
  UNION ALL SELECT 'citation_source_intel', count(*) FROM citation_source_intelligence
  UNION ALL SELECT 'hallucination_incidents', count(*) FROM hallucination_incidents
  UNION ALL SELECT 'comparison_prompt_results', count(*) FROM comparison_prompt_results
  UNION ALL SELECT 'query_fan_out_results', count(*) FROM query_fan_out_results
  UNION ALL SELECT 'visibility_trends', count(*) FROM visibility_trends;"
```
Report: are the OTHER post-audit tables also empty in prod?
- **ALL empty** → the shared trigger is broken (STEP 2) or none registered (STEP 1) → systemic, not fan-out-specific.
- **Others have rows, only fan-out empty** → the trigger works; fan-out specifically is failing (STEP 4/5: its own
  registration, budget, sample-skip, retired-prompt filter, or a runtime error).
(Note: some of these are S5/S6 tables that may not be built/enabled yet — interpret against what's actually merged in
prod. share_of_voice + visibility_trends are S3, should have rows if S3 audits ran.)

## STEP 4 — The July 3 audit: did fan-out even attempt? (Inngest run history + error)
```bash
psql "$DATABASE_URL" -c "SELECT id, brand_id, status, created_at, completed_at FROM audits WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' ORDER BY created_at DESC LIMIT 5;"
# Inngest run history for fan-out (correct single server port):
curl -s "http://localhost:8288/v1/events?limit=30" 2>&1 | grep -i "audit/complete\|fan" | head
curl -s "http://localhost:8288/v1/runs?limit=30"   2>&1 | head -80
```
Report: did the July 3 audit reach `status='complete'`? Is there ANY `simulate-query-fan-out` run in Inngest history —
did it run and error, run and skip (early return), or never appear? If it errored, the exact error + step.

## STEP 5 — Fan-out's own early-exit gates (if it ran but wrote nothing)
```bash
sed -n '1,120p' inngest/functions/simulate-query-fan-out.ts
grep -n "slug\|sample\|withinBudget\|hardStop\|Budget exceeded\|isEngineEnabled\|retired\|return\|estimate(" inngest/functions/simulate-query-fan-out.ts
# Is the org flagged 'sample'? (would trigger the O-03 early return)
psql "$DATABASE_URL" -c "SELECT o.id, o.slug, s.tier FROM organizations o LEFT JOIN subscriptions s ON s.organization_id=o.id WHERE o.id=(SELECT organization_id FROM brands WHERE id='0f531803-b529-4d09-9fd6-b6272b5baba8');"
# Are there non-retired prompts for this brand's vertical? (empty set → nothing to fan out)
psql "$DATABASE_URL" -c "SELECT count(*) FROM vertical_pack_prompts vpp JOIN vertical_packs vp ON vpp.pack_id=vp.id JOIN brands b ON b.vertical=vp.vertical WHERE b.id='0f531803-b529-4d09-9fd6-b6272b5baba8' AND vpp.retired_at IS NULL AND vp.retired_at IS NULL;"
```
Report: did any gate short-circuit it — `org.slug='sample'` (early return), budget hard-stop (`withinBudget=false`),
all engines disabled, or **zero non-retired prompts** for the vertical (nothing to fan out against)? Also confirm the
subscription tier is Agency (≥ Growth+, so the tier gate passes).

## PART 1 VERDICT (report ONE)
- **NOT REGISTERED** (STEP 1) → add to serve(). **Real bug — STOP, report for a fix prompt.**
- **`audit/complete` EMIT MISMATCH** (STEP 2) → run-audit emits wrong/no event. **Real cross-sprint bug — STOP, report.**
- **GATE SHORT-CIRCUIT** (STEP 5): budget hard-stop / sample-org / zero prompts / engines disabled. **Real bug or
  config — STOP, report** (unless it's simply "no audit triggered fan-out yet because the trigger is fine but no Growth+
  audit has completed since the code was correct" — then it's benign → Part 2).
- **BENIGN — never triggered** (registered ✓, emit correct ✓, gates clear ✓, just no completed Growth+ audit has run
  fan-out yet) → proceed to PART 2.
State which, with the STEP evidence. If ANY real bug (registration/event/gate), do NOT run Part 2 — report and await
the fix prompt.

---

# PART 2 — VERIFY (run ONLY if Part 1 verdict = BENIGN/never-triggered)

## STEP 6 — Trigger a real audit for Bondi Plumbing and watch fan-out fire
Trigger an audit the normal way (the true contract: create audits row via getNextAuditNumber in a txn with
triggered_by, then `runAuditInline(auditId)` or send `audit.run` with `{ auditId }`; checkQuota gates it — LLD 3778).
Prefer the UI "Run audit" button on Bondi Plumbing, or the app's existing audit-create route — do NOT hand-craft
events. Then watch the Inngest dashboard:
- `run-audit` completes → emits `audit/complete` → `simulate-query-fan-out` picks it up → runs (real LLM: `Generate N
  search sub-queries for: <prompt>` per prompt, embeds, scores) → writes `query_fan_out_results`.
Report: did `simulate-query-fan-out` run to completion (no error)? How long? Any budget/concurrency queueing?

## STEP 7 — READ the real-LLM fan-out rows (the actual verification)
```bash
psql "$DATABASE_URL" -c "
  SELECT f.engine, f.sub_query_rank, f.original_prompt, f.sub_query, f.content_similarity_score, f.above_threshold
  FROM query_fan_out_results f
  JOIN audits a ON f.audit_id=a.id
  WHERE f.brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8'
  ORDER BY a.created_at DESC, f.sub_query_rank ASC LIMIT 40;"
```
Report, from the NEW audit's rows:
- Are `sub_query` values **standalone, well-formed queries** (e.g. "emergency plumber Bondi 24/7", "licensed plumber
  eastern suburbs Sydney") — NOT the original prompt re-wrapped, NO nested `??`, NO stem-prefix?
- Do `original_prompt` and `sub_query` DIFFER (correct)? Is the count **3–12 per prompt** (LLD v3.0)?
- Are `content_similarity_score` (0.000–1.000) and `above_threshold` (>0.88) populated sanely?
- Any parsing artifacts from the `\n` split — blank rows, numbering ("1. ", "2. ") bleeding into sub_query text,
  markdown bullets? (The split-on-newline is naive; real LLMs often prefix "1. " or "- " — check whether that leaks
  into the stored `sub_query`. If it does, that's a NEW minor bug to report, not to fix here.)

## STEP 8 — Confirm the NEXT report renders the fan-out section (consumer, end-to-end)
A new audit → new `trend/aggregated` → (if an active delivery schedule exists) a new report. Generate a report for
Bondi (UI "Generate report" or the generate route) and confirm:
```bash
psql "$DATABASE_URL" -c "SELECT id, period_label, fan_out_summary, pdf_url IS NOT NULL AS has_pdf, created_at FROM generated_reports WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' ORDER BY created_at DESC LIMIT 2;"
```
- `fan_out_summary` is now NON-null and contains clean sub-queries (not the old malformation).
- **OPEN the generated PDF** and read the fan-out section — confirm real, well-formed sub-queries render on the page
  (the 10a lesson: JSON/logs can look fine while the rendered page doesn't). Report what the PDF section actually shows.

## PART 2 VERDICT
- **10b CLOSED** — real-LLM fan-out rows are well-formed standalone sub-queries (3–12/prompt), and the report/PDF
  fan-out section renders them cleanly. Report the row sample + the PDF section content as evidence.
- **NEW minor issue** (if STEP 7 shows numbering/bullet leakage from the `\n` split, or STEP 8 the section renders
  oddly) → report it precisely (it's a small post-processing fix — trim `^\s*[\d.\-•)]+\s*` per line — but do NOT fix
  here; scope a separate prompt).

---

## Constraints
- PART 1: change NO source/data/env. PART 2: only triggers an audit + generates a report through the app's NORMAL
  paths (no hand-crafted events, no direct row inserts). No schema/code edits in either part.
- Confirm throughout: PROD DB, real LLM (not LLM_MODE=mock), and which single Inngest port the app uses.
- If PART 1 finds a real wiring bug (registration / `audit/complete` mismatch / gate), STOP after Part 1 and report —
  Part 2 can't pass until that's fixed, and the fix is a separate scoped prompt.

## NOTE
The whole reason 10b moved to prod is that mock had no sub-query fixture — so mock rows meant nothing. Prod having ZERO
rows is the SAME vacuum. "The real LLM will return proper sub-queries" is an assumption until a real audit writes rows
we can read. Part 1 explains the empty table (most likely: fan-out not in prod serve(), OR run-audit's `audit/complete`
emit is wrong — the v8.70 hazard); Part 2 (only if benign) produces and reads real rows to actually close 10b. Do not
sign off the convergence test's "sub-queries CLEAN via real LLM" line against an empty table.
