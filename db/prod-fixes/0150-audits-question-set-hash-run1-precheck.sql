-- 0150-audits-question-set-hash-run1-precheck.sql (15 Nov, part 2): before each audit stores its everyday questions'
-- hash. Mirrors db/migrations/0150_audits_question_set_hash.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: SELECTs only. Sri runs it; NOT run from Claude Code.
--
-- Order: run1 -> run2 -> run3, all BEFORE the push. The pushed code selects audits.question_set_hash on every read
-- of audits (Drizzle names every column), so without it every audit page, report and API fails. run4 only to undo
-- run2, with the code from before this push deployed.

-- 1. Expected: column_exists = f (t if run2 already ran); runner_bypasses_rls = t (run2's backfill reads citations
--    and engine_call_failures, which force RLS: without the bypass it sees no rows and every hash stays NULL).
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audits' AND column_name = 'question_set_hash'
  ) AS column_exists,
  (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user) AS runner_bypasses_rls;

-- 2. Scale: the complete audits run2 backfills, and how many have no stored everyday row (they keep NULL).
SELECT
  count(*) AS complete_audits,
  count(*) FILTER (
    WHERE NOT EXISTS (SELECT 1 FROM citations c WHERE c.audit_id = a.id AND c.is_branded_prompt IS NOT TRUE)
      AND NOT EXISTS (SELECT 1 FROM engine_call_failures f WHERE f.audit_id = a.id AND NOT f.is_branded_prompt)
  ) AS without_everyday_rows
FROM audits a
WHERE a.status = 'complete';

-- 3. Context: Hero Home Services' audits -- each one's pack version and its everyday question count. Expected: #48
--    has 11 everyday questions and #50 has 10, with the same prompt_pack_version (the stamp that missed the change).
SELECT
  a.audit_number,
  a.prompt_pack_version,
  a.completed_at,
  (SELECT count(*) FROM (
     SELECT c.prompt FROM citations c WHERE c.audit_id = a.id AND c.is_branded_prompt IS NOT TRUE
     UNION
     SELECT f.prompt FROM engine_call_failures f WHERE f.audit_id = a.id AND NOT f.is_branded_prompt
   ) q) AS everyday_questions
FROM audits a
JOIN brands b ON b.id = a.brand_id
WHERE b.name ILIKE 'hero%' AND b.deleted_at IS NULL AND a.status = 'complete'
ORDER BY a.audit_number DESC
LIMIT 6;
