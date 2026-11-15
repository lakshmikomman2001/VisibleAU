-- 0152-question-text-key-run4-rollback.sql (17 Nov, leftovers task part 6): UNDO run2 -- only with the code from
-- before this push deployed (that code doesn't call question_text_key()).
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- WRITES. Sri runs it; NOT run from Claude Code. Needs a role that bypasses RLS, as run2 did.
--
-- Every complete audit's hash goes back to migration 0150's expression (the exact texts, no key), which is
-- deterministic, so no backup of the old hashes is needed; then the function is dropped.

BEGIN;

UPDATE audits a
SET question_set_hash = (
  SELECT encode(sha256(convert_to(string_agg(q.prompt, E'\n' ORDER BY q.prompt COLLATE "C"), 'UTF8')), 'hex')
  FROM (
    SELECT c.prompt FROM citations c WHERE c.audit_id = a.id AND c.is_branded_prompt IS NOT TRUE
    UNION
    SELECT f.prompt FROM engine_call_failures f WHERE f.audit_id = a.id AND NOT f.is_branded_prompt
  ) q
)
WHERE a.status = 'complete';

DROP FUNCTION IF EXISTS question_text_key(text);

COMMIT;
