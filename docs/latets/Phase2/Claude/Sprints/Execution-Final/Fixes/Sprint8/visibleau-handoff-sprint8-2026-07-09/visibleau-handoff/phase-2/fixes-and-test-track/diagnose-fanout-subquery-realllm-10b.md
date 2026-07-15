# Claude Code — DIAGNOSE ONLY (NO fixes): fan-out sub-queries — are they clean under the real LLM? (handoff bug 10b)

## What we're checking
Earlier (in MOCK mode) the fan-out / report showed a **malformed nested sub-query**:
> "What are the best options for **Who are the best plumbers in Bondi, NSW?**?"
i.e. a full question wrapped inside another question stem → a double-nested prompt ending in `??`. The prior session's
verdict (handoff bug 10b) was: *"not worth fixing in mock; verify clean in PROD mode (real LLM generates proper
sub-queries). STILL TO VERIFY in prod mode."* We are now on **local PROD DB + real LLMs**, and the report PDF pipeline
runs end-to-end. So this is the moment to verify.

**The decisive question:** is that nesting (a) **stale legacy rows** left in `query_fan_out_results` from before a code
change (real LLM now writes clean rows going forward), or (b) a **live template-wrapping bug** in
`simulate-query-fan-out.ts` that STILL prepends a stem like `"What are the best options for " + original_prompt`,
producing nested questions even with the real LLM? These have different fixes, so we must know which.

**DIAGNOSE ONLY. Change NO source, NO data.** Report findings + a fix direction for approval; apply nothing.

## Canon (what "correct" looks like — verified against LLD v8.70)
- `query_fan_out_results` (LLD 6291): `original_prompt TEXT` = the SOURCE prompt (e.g. *"Who are the best plumbers in
  Bondi, NSW?"*); `sub_query TEXT` = the DERIVED sub-query (e.g. *"emergency plumber Bondi 24/7"*, *"licensed plumber
  near Bondi Beach"*). `sub_query_rank` 1..N (3–12 sub-queries per prompt, v3.0). Each sub-query should be a
  **standalone, well-formed query** — NOT the original prompt re-wrapped in another question stem.
- Producer: `inngest/functions/simulate-query-fan-out.ts` (LLD 6601) — triggers on `audit/complete`, Growth+; reads
  `vertical_pack_prompts` (retired filter), generates sub-queries per prompt, embeds + cosine-scores them, writes rows.
- Consumer that surfaced it: `generate-narrative-report.ts` reads `query_fan_out_results` for the `fan_out_coverage`
  report section (LLD 8361/8494). So a malformed `sub_query` shows up verbatim in the report.
- The LLD does NOT prescribe the sub-query GENERATION prompt template — that's implementation. The `"What are the best
  options for …"` stem is app code, and prepending it to a full question is the suspected bug.

---

## STEP 1 — Look at the ACTUAL rows the real LLM wrote (the decisive evidence)
Scope to this brand ("Bondi Plumbing") and its most RECENT audit, so we're reading REAL-LLM output, not old mock rows.
```bash
# Most recent audit for the brand, then its fan-out rows:
psql "$DATABASE_URL" -c "SELECT id, created_at, status FROM audits WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' ORDER BY created_at DESC LIMIT 3;"

# Fan-out rows for the LATEST audit — original_prompt vs sub_query, side by side:
psql "$DATABASE_URL" -c "
  SELECT f.run_at, f.engine, f.sub_query_rank, f.original_prompt, f.sub_query
  FROM query_fan_out_results f
  JOIN audits a ON f.audit_id = a.id
  WHERE f.brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8'
  ORDER BY a.created_at DESC, f.sub_query_rank ASC
  LIMIT 40;"
```
Report, from the LATEST audit's rows:
- Are the `sub_query` values **standalone, well-formed queries**, or do any still show the nesting
  (`"...for <full question>?"`, trailing `??`, or `original_prompt` embedded inside `sub_query`)?
- Do `original_prompt` and `sub_query` **differ** (correct — sub_query is derived), or is `sub_query` just
  `original_prompt` with a wrapper stem glued on (the bug)?
- How many sub-queries per prompt (should be 3–12)?

## STEP 2 — Old vs new: is the malformation only in STALE rows, or in fresh ones too?
```bash
# Count malformed rows and bucket them by recency. Adjust the LIKE patterns to the exact stem if STEP 1 revealed it.
psql "$DATABASE_URL" -c "
  SELECT
    (run_at > now() - interval '1 day') AS is_recent,
    count(*) AS rows,
    count(*) FILTER (WHERE sub_query LIKE '%What are the best options for %'
                        OR sub_query LIKE '%??'
                        OR position(original_prompt in sub_query) > 0) AS malformed
  FROM query_fan_out_results
  WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8'
  GROUP BY is_recent ORDER BY is_recent DESC;"
```
Report: are the malformed rows **only in the old bucket** (is_recent=false → stale legacy data; the real LLM writes
clean rows now → the fix is a data cleanup, not code) or **also in recent rows** (is_recent=true → the wrapping bug is
LIVE in current code → STEP 3 finds it)? This split is the whole answer.

## STEP 3 — If recent rows are malformed: find the wrapping in the producer
```bash
sed -n '1,200p' inngest/functions/simulate-query-fan-out.ts
# Hunt the stem / any string that PREPENDS text onto the original prompt to form a sub-query:
grep -n "What are the best options\|best options for\|sub_query\|subQuery\|generateSubQ\|expand\|\`\${\|+ prompt\|prompt +\|original_prompt\|originalPrompt\|template\|systemPrompt\|user:" inngest/functions/simulate-query-fan-out.ts
# Is there a lib helper doing the generation?
grep -rn "sub_query\|subQuery\|generateSubQ\|fanOut\|fan-out\|best options" lib/visibility/ lib/**/query-fan-out* 2>/dev/null | head
```
Report:
- WHERE do sub-queries come from — a real LLM call that RETURNS a list of sub-queries, or app code that MANUFACTURES
  them by string-wrapping `original_prompt` (e.g. `` `What are the best options for ${prompt}` ``)? 
- If it's an LLM call: is the malformation in the **prompt sent** to the LLM (a bad instruction/template producing
  nested questions), or in **post-processing** of the LLM's response (re-wrapping each returned line)? Quote the exact
  lines.
- If it's pure string manufacture (no LLM for sub-query generation): that contradicts the spec intent (real LLM should
  derive sub-queries) — note it; the "real LLM fixes it" assumption would be FALSE and the wrapper is the bug.

## STEP 4 — Confirm what the REPORT renders (consumer side)
The report's `fan_out_coverage` section reads these rows — verify the current report shows clean sub-queries.
```bash
# The most recent generated report's fan_out summary JSONB:
psql "$DATABASE_URL" -c "SELECT id, period_label, fan_out_summary, created_at FROM generated_reports WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' ORDER BY created_at DESC LIMIT 2;"
# How the report builds that summary — does it pass sub_query through verbatim?
grep -rn "fan_out\|fanOut\|query_fan_out\|sub_query\|subQuery" inngest/functions/generate-narrative-report.ts lib/communication/ | head
```
Report: does `fan_out_summary` (and the rendered PDF section) contain clean sub-queries or the nested malformation? If
STEP 1 rows are clean but the report still looks wrong, the bug is in the report's summary-building, not the fan-out.
**Open the actual generated PDF's fan-out section and read it** — logs/JSON can look fine while the rendered page
doesn't (the 10a JSON-dump lesson).

---

## VERDICT (report ONE, with row samples as evidence)
- **A — STALE DATA ONLY:** malformed rows exist only in the OLD bucket; the LATEST-audit rows (real LLM) are clean +
  well-formed. → The real-LLM assumption held; fix = a one-off cleanup of the legacy rows (or leave them — they age out
  with audit retention). No code change. **This closes bug 10b.**
- **B — LIVE WRAPPING BUG:** recent rows are ALSO malformed → `simulate-query-fan-out.ts` (or a lib helper) wraps
  `original_prompt` in a stem / mis-instructs the LLM / re-wraps the response. → Fix = correct the generation
  (quote the exact lines). Bug 10b is NOT closed until this is fixed.
- **C — CONSUMER BUG:** table rows are clean but the report's `fan_out_summary` / PDF section renders them wrong. → Fix
  is in `generate-narrative-report` summary-building, not the fan-out.
- State which, with: STEP 1 sample rows (original_prompt vs sub_query), STEP 2 old-vs-recent malformed counts, STEP 3
  the generation code (if recent rows are bad), STEP 4 the report/PDF section. **No source/data changed. Confirm PROD
  DB + that these rows are from a real-LLM run (not LLM_MODE=mock).**

## NOTE
The point of moving 10b to PROD was precisely this test: mock had no sub-query fixture, so mock output was meaningless.
Only real-LLM rows answer whether sub-queries are well-formed. If STEP 2 shows the malformation is confined to old rows
and the newest audit is clean, 10b is closed (data cleanup at most). If the newest audit still nests, there's a live
wrapper to fix — and STEP 3 will show exactly where. Don't declare clean from the report alone — read the actual
`query_fan_out_results` rows AND open the PDF's fan-out section.
