-- 0152-question-text-key-run2-apply.sql (17 Nov, leftovers task part 6): the question_text_key() function, and every
-- complete audit's question_set_hash recomputed from its questions' compared texts. The same statements as
-- db/migrations/0152_question_text_key.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- WRITES: one function and one column of audits, in one transaction. Sri runs it after run1, BEFORE the push. Needs a
-- role that bypasses RLS (run1 query 1). Take a pg_dump of audits first (CLAUDE.md: production changes need a backup).

BEGIN;

CREATE OR REPLACE FUNCTION question_text_key(question text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT btrim(regexp_replace(
    translate(
      lower(question),
      '!"#$%&''()*+,-./:;<=>?@[\]^_`{|}~' || chr(8211) || chr(8212) || chr(8216) || chr(8217) || chr(8220)
        || chr(8221) || chr(8230) || chr(8722) || chr(8208) || chr(8209) || chr(160),
      repeat(' ', 43)
    ),
    '\s+', ' ', 'g'
  ))
$$;

UPDATE audits a
SET question_set_hash = (
  SELECT encode(sha256(convert_to(string_agg(q.question, E'\n' ORDER BY q.question COLLATE "C"), 'UTF8')), 'hex')
  FROM (
    SELECT DISTINCT question_text_key(p.prompt) AS question
    FROM (
      SELECT c.prompt FROM citations c WHERE c.audit_id = a.id AND c.is_branded_prompt IS NOT TRUE
      UNION
      SELECT f.prompt FROM engine_call_failures f WHERE f.audit_id = a.id AND NOT f.is_branded_prompt
    ) p
  ) q
)
WHERE a.status = 'complete';

COMMIT;
