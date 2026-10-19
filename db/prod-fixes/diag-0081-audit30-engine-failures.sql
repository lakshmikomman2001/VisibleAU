-- diag-0081-audit30-engine-failures.sql (Vunnara, 19 Oct, post-ecc805d,
-- read-only)
--
-- PRODUCTION branch. READ-ONLY. Paste into the Neon SQL editor. NOT run
-- from Claude Code -- there is no prod access from that environment.
-- Sri-authorized only.
--
-- Pinned to: audit_id = '2cab2f88-304b-45c8-b195-1b02b4aa6dca'
--            brand_id = 'b8d7cb50-8722-4007-ae17-08a20e355956' (Omega Services)
--
-- WHY / IMPORTANT CAVEAT: a failed engine call writes NO citations row
-- at all. Both audit runners (lib/audit/run-audit-inline.ts, inngest/
-- functions/run-audit.ts) catch any thrown error generically, increment
-- an in-memory per-engine counter, and `continue` -- the citations
-- INSERT only ever runs on the success path. The citations table (db/
-- schema/citations.ts) has no status/error/error_code/latency column
-- at all; the ONLY trace a failure leaves is an aggregate COUNT per
-- engine, written once into audits.metadata.engineFailures (jsonb) at
-- audit-finalize time. There is therefore no way to recover, for any
-- one of Claude's 4 failed calls individually: which specific error it
-- was (429 / 529 / timeout / web-search tool error / parse failure),
-- its latency, or its cost -- none of that is ever persisted per call.
--
-- What CAN be recovered: WHICH of the 13 question texts never got a
-- Claude citations row for this audit, by diffing against the set of
-- prompts every OTHER engine in this same audit DID answer (assumes at
-- least one other engine answered all 13 -- true here per the report:
-- ChatGPT/Gemini/Perplexity mention rates are all based on a 13-prompt
-- denominator). status/error/latency/cost are NULL below by necessity,
-- not query error -- that's the actual, honest answer to "where is a
-- failed answer recorded": nowhere, at the per-call level.

-- 1. The aggregate failure count actually stored on the audit row.
SELECT
  id AS audit_id,
  status,
  prompts_count,
  engines,
  total_cost_usd,
  metadata->'engineFailures' AS engine_failures
FROM audits
WHERE id = '2cab2f88-304b-45c8-b195-1b02b4aa6dca';

-- 2. Per-engine citation row counts vs prompts_count, to confirm the
--    shape matches the reported "48 live, 4 failed" (13 x 4 = 52; one
--    engine short by 4 rows).
SELECT
  c.engine,
  COUNT(*) AS citation_rows,
  a.prompts_count,
  a.prompts_count - COUNT(*) AS missing_rows
FROM citations c
JOIN audits a ON a.id = c.audit_id
WHERE c.audit_id = '2cab2f88-304b-45c8-b195-1b02b4aa6dca'
GROUP BY c.engine, a.prompts_count
ORDER BY c.engine;

-- 3. The question text of each of Claude's missing answers, recovered
--    by set difference against every prompt answered by any other
--    engine in this audit. One row per missing answer; status / error
--    message / latency / cost are explicitly NULL -- never recorded.
WITH all_prompts AS (
  SELECT DISTINCT prompt, is_branded_prompt
  FROM citations
  WHERE audit_id = '2cab2f88-304b-45c8-b195-1b02b4aa6dca'
),
claude_prompts AS (
  SELECT prompt
  FROM citations
  WHERE audit_id = '2cab2f88-304b-45c8-b195-1b02b4aa6dca'
    AND engine = 'claude'
)
SELECT
  'claude' AS engine,
  ap.prompt AS question_text,
  ap.is_branded_prompt AS is_branded,
  NULL::text AS status,
  NULL::text AS error_message_or_code,
  NULL::numeric AS latency_ms,
  NULL::numeric AS cost_usd,
  NULL::timestamptz AS created_at
FROM all_prompts ap
LEFT JOIN claude_prompts cp ON cp.prompt = ap.prompt
WHERE cp.prompt IS NULL
ORDER BY ap.prompt;

-- 4. Summary of failures by engine and error. "Error" collapses to
--    "unknown (not recorded per-call)" for every engine -- the data
--    genuinely does not support a finer breakdown than a per-engine
--    count.
SELECT
  ef.engine,
  'unknown (not recorded per-call)' AS error,
  ef.count::int AS failure_count
FROM audits a,
     jsonb_each_text(a.metadata->'engineFailures') AS ef(engine, count)
WHERE a.id = '2cab2f88-304b-45c8-b195-1b02b4aa6dca';
