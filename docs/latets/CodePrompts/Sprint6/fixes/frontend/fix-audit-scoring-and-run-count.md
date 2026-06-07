# Claude Code — fix audit SCORING (empty dimensions + sentiment) and RUN COUNT (40 vs 200)

## Situation

The Audit Results page now renders the rich layout correctly. It has surfaced two backend gaps:

1. **Scoring is incomplete.** The 5 multidimensional scores (Frequency / Position / Sentiment /
   Context / Accuracy) and their 95% confidence intervals render as "—". The **composite** score
   (e.g. 100.0) IS written, but its 5-dimension decomposition and CIs are NOT. Sentiment is empty too.
2. **Run count is wrong.** A completed **Agency-tier** audit ran only **40 LLM calls** = 4 engines ×
   10 prompts × **1 run**. Agency should be **4 engines × 10 prompts × 5 runs = 200 calls**. So
   runs-per-prompt is resolving to 1.

Likely shared root cause: the audit job is running **Sprint-2-level** behaviour (single run,
composite-only / simplified scoring) instead of the **Sprint-3** behaviour (5 runs per paid tier,
full 5-dimension scoring + Wilson 95% CIs). **Confirm this before fixing. Diagnose first, REPORT,
then fix.** Do not assume column names — find them.

Note: the app is still in mock mode (`LLM_MODE=mock`, happy_path). That's fine for this task — the
scoring CODE must write the columns regardless of data source. Sentiment/position *quality* will
improve once you're on real APIs (a separate task), but the columns must stop being NULL now.

═══════════════════════════════════════════════════════════════════════════════
## PHASE 1 — INVESTIGATE AND REPORT (change NO code in this phase)
═══════════════════════════════════════════════════════════════════════════════

### Run count
1. Find where runs-per-prompt is set. Search:
   `grep -rn "runs_per_prompt\|runsPerPrompt\|runsPer\|RUNS_PER\|perPrompt" --include=*.ts`
   Inspect the audit-creation handler (`POST /api/audits`) AND the audit job
   (`run-audit.ts` / the Inngest function). Report:
   - Is there a per-tier config for runs (and prompts, engines)? Where (tier-engines.ts, a tiers
     config, foundations)? What does **Agency** resolve to for runs_per_prompt and prompts_count?
   - Is runs hardcoded to 1 anywhere (a leftover Sprint-2 default)? Show the code.
2. Latest audit row (use the REAL column names; tier may live on the org, not the audit — report
   where tier is read from):
   ```sql
   SELECT id, audit_number, status, engine_count, prompts_count, runs_per_prompt,
          total_calls, engines
   FROM audits ORDER BY created_at DESC LIMIT 1;
   ```
3. The audit progress heading earlier read "10 prompts × 5 runs" yet only 40 calls ran. Find where
   that text is produced and reconcile it with the actual `runs_per_prompt` — is the heading
   hardcoded while the real config is 1? Report.

### Scoring
4. Find the scoring code:
   `grep -rn "scoreComposite\|score_composite\|scoreFrequency\|score_frequency\|confidenceInterval\|wilson\|computeScore\|dimensionScore\|frequencyDimension" --include=*.ts`
   - Is there a function that computes the 5 dimensions + composite + Wilson CIs? Where?
   - Is it CALLED by the audit job after citations are persisted? Show the call site, or report
     that it is NOT called.
5. Show the DB UPDATE that writes the audit's scores. Which columns does it set? Specifically, does
   it write ALL of: `score_composite, score_frequency, score_position, score_sentiment_numeric,
   score_context_numeric, score_accuracy, score_confidence_low, score_confidence_high,
   confidence_intervals` — or only `score_composite`?
6. How is the composite (e.g. 100.0) actually computed — the real weighted formula
   (Freq×.25 + Pos×.25 + Sent×.20 + Ctx×.15 + Acc×.15), or a simplified proxy (e.g. mention rate)?
7. Confirm what's NULL on the latest audit:
   ```sql
   SELECT score_composite, score_frequency, score_position, score_sentiment_numeric,
          score_context_numeric, score_accuracy, score_confidence_low,
          score_confidence_high, confidence_intervals
   FROM audits ORDER BY created_at DESC LIMIT 1;
   ```
8. Do the citations carry the inputs scoring needs?
   ```sql
   SELECT engine, brand_mentioned, position, score_sentiment, cited_sources
   FROM citations WHERE audit_id = '<latest audit id>' LIMIT 5;
   ```
   Report whether position / score_sentiment / cited_sources are populated or NULL. (If the mock
   happy_path fixtures omit sentiment/position, note that the gap is partly "input data missing",
   not only "scoring not run".)
9. Read `03-sprint-prompts/sri-visibleau-sprint-3-prompt.md` for the canonical 5-dimension formulas,
   weights, and the Wilson 95% CI method, so the fix matches the spec exactly.

### → REPORT steps 1–9 and state the single root cause before touching Phase 2.

═══════════════════════════════════════════════════════════════════════════════
## PHASE 2 — FIX (using Phase 1 findings + the Sprint-3 canonical scoring)
═══════════════════════════════════════════════════════════════════════════════

### Run count
- `runs_per_prompt` (and prompts_count, engine count) must come from the canonical per-tier config —
  never a hardcoded 1. For **Agency**: 4 engines × 10 prompts × **5 runs = 200 calls**. Source the
  exact values from the tier config; if a per-tier runs/prompts mapping doesn't live alongside
  `tier-engines.ts`, add it there so it's a single source of truth.
- Resolve runs_per_prompt from the tier at audit creation, persist it on the row, and ensure the
  audit job loops that many runs per prompt per engine.
- Fix the progress-heading text to use the real resolved numbers (no hardcoded "5 runs").

### Scoring
- After citations persist, compute the 5 dimensions per the Sprint-3 spec (step 9) and write **ALL**
  columns in the audit UPDATE:
  - `score_frequency` — mention count / total calls (frequency dimension score)
  - `score_position` — from average position when mentioned
  - `score_sentiment_numeric` — from citation sentiment labels (numeric 0–100)
  - `score_context_numeric` — recommended vs listed vs mentioned mix
  - `score_accuracy` — from cited-sources presence on mention rows
  - `score_composite` — the weighted sum: Freq×.25 + Pos×.25 + Sent×.20 + Ctx×.15 + Acc×.15
  - `score_confidence_low` / `score_confidence_high` + `confidence_intervals` (JSONB: per-dimension
    `{lower, upper}` including composite) — Wilson 95% CI
- Apply the minimal correct fix based on Phase 1:
  - If the scoring module exists but **isn't called** → call it in the audit job after citations.
  - If it exists but **writes only the composite** → extend the UPDATE to write all 9 columns.
  - If it **doesn't exist** → implement it per the Sprint-3 spec.
- The composite MUST be the real weighted formula, not a mention-rate proxy — so the composite equals
  the weighted sum of the displayed dimensions (internally consistent).
- If an input is genuinely absent in the current mock citations (e.g. no sentiment label), compute
  what you can and write a defensible value for the rest — but do NOT leave columns NULL on a
  completed audit. List any such input gaps in your report.

Performance/correctness: scoring reads citations with grouped/aggregate queries (no per-row N+1);
keep all auth/RLS intact.

═══════════════════════════════════════════════════════════════════════════════
## PHASE 3 — VERIFY (run a fresh Agency-tier audit)
═══════════════════════════════════════════════════════════════════════════════

- Trigger a new audit on the Agency-tier brand. Confirm `total_calls = 200` (4 × 10 × 5).
- Verify the row:
  ```sql
  SELECT score_composite, score_frequency, score_position, score_sentiment_numeric,
         score_context_numeric, score_accuracy, score_confidence_low,
         score_confidence_high, confidence_intervals, total_calls, runs_per_prompt
  FROM audits ORDER BY created_at DESC LIMIT 1;
  ```
  All 5 dimension scores + both CI bounds + `confidence_intervals` must be NON-NULL, and
  `score_composite` must equal the weighted sum of the 5 dimensions (±0.1). `runs_per_prompt = 5`,
  `total_calls = 200`.
- Open the results page: the 5 dimensions show real numbers with CI bars (not "—"), sentiment shows
  a real score + breakdown, and the meta line reads "200 LLM calls".

## Final report
Summarise: (a) where runs resolved to 1 and how you fixed it; (b) whether the scoring module existed,
was called, and wrote all columns — and the exact fix; (c) whether the composite was a proxy or the
real formula; (d) any citation input gaps (especially from mock data); (e) the Phase 3 SQL output
confirming 200 calls and populated, internally-consistent dimensions. Paste the SQL outputs.
