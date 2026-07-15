# Claude Code — VERIFY (not fix): does fan-out actually WRITE rows now? (close bug 10b) + confirm the graceful-skip

The try/catch fix for fan-out (Gemini 429 no longer kills the step) is APPLIED but never exercised — fan-out rows are
still 0 for Metropolitan because the fix landed after the audit. "Compiles and doesn't crash" ≠ "writes rows". This run
proves it does. Also confirm the fix's new failure mode (swallow → `[]`/`{appeared:false}`) doesn't silently produce
zero rows for EVERY engine. Change no code; this is verification.

Env: local PROD DB, real LLMs (4 engines now routed correctly), Supabase. Brand = Metropolitan Plumbing
(`metropolitanplumbing.com.au`).

## STEP 1 — Restart, re-trigger a Metropolitan audit, watch fan-out with the Inngest dashboard open
Restart the Inngest dev server first (fresh build — the stale-Turbopack "stuck RUNNING" was part of the original
symptom). Run a NEW audit for Metropolitan via the normal path. In the Inngest dashboard, watch `simulate-query-fan-out`:
- Does it now COMPLETE (not throw, not stuck RUNNING)?
- If an engine 429s (Gemini did last time), does the per-engine try/catch SKIP that engine and continue — rather than
  killing the whole step? Report which engines succeeded vs were skipped.

## STEP 2 — The decisive check: are rows actually written? (not just "no crash")
```bash
psql "$DATABASE_URL" -c "
  SELECT f.engine, COUNT(*) AS rows
  FROM query_fan_out_results f
  JOIN audits a ON f.audit_id=a.id
  WHERE f.brand_id=(SELECT id FROM brands WHERE domain='metropolitanplumbing.com.au')
    AND a.created_at > now() - interval '1 hour'
  GROUP BY f.engine ORDER BY f.engine;"
```
Report: which engines wrote rows, and how many each?
- **Rows present for ≥1 engine (the ones that didn't 429)** → fix VERIFIED: it writes rows AND gracefully skips failures.
- **Zero rows across ALL engines despite the audit completing** → the graceful-skip is TOO graceful (swallowing every
  engine, or the store step never runs) → that's a NEW problem the try/catch introduced; report it, don't call 10b
  closed.

## STEP 3 — Read the sub-queries (close the ORIGINAL 10b nesting question on real data)
```bash
psql "$DATABASE_URL" -c "
  SELECT f.engine, f.sub_query_rank, f.original_prompt, f.sub_query, f.content_similarity_score, f.above_threshold
  FROM query_fan_out_results f
  JOIN audits a ON f.audit_id=a.id
  WHERE f.brand_id=(SELECT id FROM brands WHERE domain='metropolitanplumbing.com.au')
    AND a.created_at > now() - interval '1 hour'
  ORDER BY f.engine, f.sub_query_rank LIMIT 30;"
```
Report:
- Are `sub_query` values clean STANDALONE queries (e.g. "emergency plumber Melbourne 24/7") — NOT the original prompt
  re-wrapped, no nested `??`, no "What are the best options for <full question>" stem, no "1. "/"- " numbering leaking
  from the `\n`-split?
- Do `original_prompt` and `sub_query` DIFFER? 3–12 sub-queries per prompt? Similarity scores + above_threshold sane?

## VERDICT
- **10b CLOSED:** STEP 2 shows rows written for the succeeding engines, STEP 1 shows failed engines skipped (not
  crashing), STEP 3 shows clean standalone sub-queries. Report the row counts + a sub-query sample.
- **NOT CLOSED — writes nothing:** zero rows despite completion → graceful-skip swallowing everything → report.
- **NOT CLOSED — malformed:** rows present but sub_query nested / numbered / = original_prompt → report the samples
  (that's the wrapper/parse bug, separate from the crash fix).

## Constraints
- Change nothing; verification only. Restart the dev server before the audit (stale build was part of the original bug).
- Real 4-engine spend — ONE audit is enough. Confirm PROD DB + real LLM.
- If an engine 429s again, that's fine and expected — the point is that fan-out survives it AND still writes rows for
  the others.

## NOTE
The fix traded a loud crash for a quiet swallow — good for resilience, but it makes "silently wrote nothing" look like
"gracefully skipped a bad engine". STEP 2 is the one that matters: rows must actually appear for the engines that
didn't fail. Rows + clean sub-queries = 10b finally closed on real data. Zero rows = the try/catch is masking, not
fixing. Read the rows, not just the dashboard status.
