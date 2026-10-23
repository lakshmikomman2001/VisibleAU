-- diag-0097-audit-e23f10f6-engine-progress.sql
-- "The Running audit page shows made-up numbers" (23 Oct), item 1
--
-- PRODUCTION branch. READ-ONLY. Paste into the Neon SQL editor. NOT run
-- from Claude Code -- there is no prod access from that environment.
-- Sri-authorized only.
--
-- WHY: Omega Services' audit e23f10f6-be99-4f0c-9dbd-f9c19e73b2a5's
-- running page showed "Querying 10 questions x 2 engines x 5 runs =
-- 100 answers" and per-engine rows like "ChatGPT 8/0 - 0%". This pins
-- down exactly what the audit row itself says, and what the real
-- per-engine answer/failure counts are, to confirm (or rule out) a
-- real engine-selection bug versus a display/population-timing bug.
--
-- Expected result: row 1 shows engines = the full agency_pro set
-- (chatgpt, claude, gemini, perplexity -- 4, not 2) and
-- engine_count = 4; prompts_count is either 13 or NULL depending on
-- whether this audit has reached inngest/functions/run-audit.ts's
-- finalize step yet (the root cause this task's item 1 traces to --
-- that step is the ONLY place the Inngest runner ever wrote
-- prompts_count/total_calls, so it stayed NULL for this audit's
-- entire run). Rows 2-3 show the real per-engine answer/failure
-- counts, for comparison against whatever the running page showed at
-- the time.
SELECT
  a.id,
  a.audit_number,
  a.status,
  a.engines,
  a.engine_count,
  a.prompts_count,
  a.runs_per_prompt,
  a.total_calls,
  a.started_at,
  a.completed_at,
  a.failed_at,
  (a.metadata ->> 'error') AS error_text,
  a.total_cost_usd
FROM audits a
WHERE a.id = 'e23f10f6-be99-4f0c-9dbd-f9c19e73b2a5';

-- Real answers received per engine (citations, run_number = 1 only --
-- same basis every other read-time query in this codebase uses).
SELECT
  c.engine,
  count(*) AS answers_received
FROM citations c
WHERE c.audit_id = 'e23f10f6-be99-4f0c-9dbd-f9c19e73b2a5'
  AND c.run_number = 1
GROUP BY c.engine
ORDER BY c.engine;

-- Real failures per engine (engine_call_failures -- a failed call
-- never writes to citations, so this is the other half of "answers
-- received" alongside the query above).
SELECT
  f.engine,
  count(*) AS failures,
  string_agg(DISTINCT f.error_class, ', ') AS error_classes
FROM engine_call_failures f
WHERE f.audit_id = 'e23f10f6-be99-4f0c-9dbd-f9c19e73b2a5'
GROUP BY f.engine
ORDER BY f.engine;

-- The org's subscription tier (agency_pro, per the task) and what
-- lib/llm/tier-engines.ts's enginesForTier resolves it to -- the
-- comparison that answers "did this audit run on fewer engines than
-- its tier allows".
SELECT
  o.id AS organization_id,
  s.tier
FROM audits a
JOIN organizations o ON o.id = a.organization_id
LEFT JOIN subscriptions s ON s.organization_id = o.id
WHERE a.id = 'e23f10f6-be99-4f0c-9dbd-f9c19e73b2a5';
