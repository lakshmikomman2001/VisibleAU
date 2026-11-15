-- 0152-question-text-key-run3-post-check.sql (17 Nov, leftovers task part 6): after run2. READ-ONLY.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- Sri runs it; NOT run from Claude Code. All three must pass before the push.

BEGIN TRANSACTION READ ONLY;

-- 1. The function exists, is immutable, and keys texts as expected. Expected: t, i, and four t's.
SELECT
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'question_text_key') AS function_exists,
  (SELECT provolatile FROM pg_proc WHERE proname = 'question_text_key') AS volatility,
  question_text_key('Who is a reliable plumber -- near Bondi?')
    = question_text_key('who is a reliable plumber ' || chr(8212) || ' near Bondi') AS dashes_and_case_match,
  question_text_key('Best  café in   Sydney?') = 'best café in sydney' AS spaces_collapse,
  question_text_key('Best café in Sydney') <> question_text_key('Best cafés in Sydney') AS a_changed_word_differs,
  question_text_key('') = '' AS empty_stays_empty;

-- 2. No complete audit with stored everyday rows is left without a hash. Expected: 0.
SELECT count(*) AS complete_audits_with_rows_but_no_hash
FROM audits a
WHERE a.status = 'complete' AND a.question_set_hash IS NULL
  AND (EXISTS (SELECT 1 FROM citations c WHERE c.audit_id = a.id AND c.is_branded_prompt IS NOT TRUE)
       OR EXISTS (SELECT 1 FROM engine_call_failures f WHERE f.audit_id = a.id AND NOT f.is_branded_prompt));

-- 3. Every stored hash equals the new expression recomputed now. Expected: 0 (and new audits the pushed code
--    completes will write the same, lib/audit/question-set-sql.ts).
SELECT count(*) AS hashes_not_matching_the_new_expression
FROM audits a
WHERE a.status = 'complete' AND a.question_set_hash IS DISTINCT FROM (
  SELECT encode(sha256(convert_to(string_agg(q.question, E'\n' ORDER BY q.question COLLATE "C"), 'UTF8')), 'hex')
  FROM (
    SELECT DISTINCT question_text_key(p.prompt) AS question
    FROM (
      SELECT c.prompt FROM citations c WHERE c.audit_id = a.id AND c.is_branded_prompt IS NOT TRUE
      UNION
      SELECT f.prompt FROM engine_call_failures f WHERE f.audit_id = a.id AND NOT f.is_branded_prompt
    ) p
  ) q
);

ROLLBACK;
