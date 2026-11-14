-- 0150-audits-question-set-hash-run2-apply.sql (15 Nov, part 2): audits.question_set_hash, backfilled.
-- Mirrors db/migrations/0150_audits_question_set_hash.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- Sri-authorized only. NOT run from Claude Code. Run AFTER run1 (runner_bypasses_rls = t), BEFORE the push. ONE
-- transaction.
--
-- The column is nullable with no default (metadata-only). The backfill writes each complete audit's hash from its
-- stored rows: the SHA-256 of its distinct everyday questions (its everyday answers' and failed everyday calls'
-- prompts), sorted bytewise and joined with a newline -- the same expression the audit runners use
-- (lib/audit/question-set.ts questionSetHashSql), so old and new hashes agree. It derives only from stored data;
-- an audit with no stored everyday row keeps NULL. Row locks on audits for the length of the UPDATE (one row per
-- complete audit); no other table is written.
BEGIN;

ALTER TABLE audits ADD COLUMN IF NOT EXISTS question_set_hash text;

UPDATE audits a
SET question_set_hash = (
  SELECT encode(sha256(convert_to(string_agg(q.prompt, E'\n' ORDER BY q.prompt COLLATE "C"), 'UTF8')), 'hex')
  FROM (
    SELECT c.prompt FROM citations c WHERE c.audit_id = a.id AND c.is_branded_prompt IS NOT TRUE
    UNION
    SELECT f.prompt FROM engine_call_failures f WHERE f.audit_id = a.id AND NOT f.is_branded_prompt
  ) q
)
WHERE a.status = 'complete' AND a.question_set_hash IS NULL;

COMMIT;
