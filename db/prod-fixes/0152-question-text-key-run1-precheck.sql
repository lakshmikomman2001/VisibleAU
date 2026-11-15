-- 0152-question-text-key-run1-precheck.sql (17 Nov, leftovers task part 6): before each audit's question set is
-- hashed from its questions' compared text (question_text_key). Mirrors db/migrations/0152_question_text_key.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: SELECTs only, inside a READ ONLY transaction that is rolled back. Sri runs it; NOT run from Claude Code.
--
-- Order: run1 -> run2 -> run3, all BEFORE the push. The pushed code calls question_text_key() when an audit
-- completes; without it every audit fails at its last step. run4 only to undo run2, with the code from before this
-- push deployed.

BEGIN TRANSACTION READ ONLY;

-- 1. Expected: function_exists = f (t if run2 already ran); runner_bypasses_rls = t (run2 rehashes from citations and
--    engine_call_failures, which force RLS: without the bypass it sees no rows and every hash becomes NULL).
SELECT
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'question_text_key') AS function_exists,
  (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user) AS runner_bypasses_rls;

-- 2. Scale: the complete audits run2 rehashes, how many have a hash now, and how many have no stored everyday row
--    (they keep NULL). Expected: with_hash = complete_audits - without_everyday_rows.
SELECT
  count(*) AS complete_audits,
  count(*) FILTER (WHERE a.question_set_hash IS NOT NULL) AS with_hash,
  count(*) FILTER (
    WHERE NOT EXISTS (SELECT 1 FROM citations c WHERE c.audit_id = a.id AND c.is_branded_prompt IS NOT TRUE)
      AND NOT EXISTS (SELECT 1 FROM engine_call_failures f WHERE f.audit_id = a.id AND NOT f.is_branded_prompt)
  ) AS without_everyday_rows
FROM audits a
WHERE a.status = 'complete';

-- 3. WHOSE COMPARABILITY CHANGES: each brand's consecutive complete audits (by completed_at) whose question sets
--    compare differently under the new key. old_same / new_same: the hashes equal before / after. Expected: rows only
--    with old_same = f and new_same = t (a punctuation, case or spacing change only -- these pairs become comparable:
--    drift, trends and "up N points" will now compare them). A row with old_same = t and new_same = f can't happen
--    (the key only merges texts); if one appears, stop and send it to Claude.
WITH keyed AS (
  SELECT a.id, a.brand_id, a.audit_number, a.completed_at, a.question_set_hash AS old_hash,
    (
      SELECT encode(sha256(convert_to(string_agg(q.question, E'\n' ORDER BY q.question COLLATE "C"), 'UTF8')), 'hex')
      FROM (
        SELECT DISTINCT btrim(regexp_replace(
          translate(
            lower(p.prompt),
            '!"#$%&''()*+,-./:;<=>?@[\]^_`{|}~' || chr(8211) || chr(8212) || chr(8216) || chr(8217) || chr(8220)
              || chr(8221) || chr(8230) || chr(8722) || chr(8208) || chr(8209) || chr(160),
            repeat(' ', 43)
          ),
          '\s+', ' ', 'g'
        )) AS question
        FROM (
          SELECT c.prompt FROM citations c WHERE c.audit_id = a.id AND c.is_branded_prompt IS NOT TRUE
          UNION
          SELECT f.prompt FROM engine_call_failures f WHERE f.audit_id = a.id AND NOT f.is_branded_prompt
        ) p
      ) q
    ) AS new_hash
  FROM audits a
  WHERE a.status = 'complete'
),
paired AS (
  SELECT k.*, lag(k.audit_number) OVER w AS prev_number, lag(k.old_hash) OVER w AS prev_old_hash,
         lag(k.new_hash) OVER w AS prev_new_hash
  FROM keyed k
  WINDOW w AS (PARTITION BY k.brand_id ORDER BY k.completed_at, k.audit_number)
)
SELECT b.name AS brand, p.prev_number AS earlier_audit, p.audit_number AS later_audit,
       p.old_hash = p.prev_old_hash AS old_same, p.new_hash = p.prev_new_hash AS new_same
FROM paired p JOIN brands b ON b.id = p.brand_id
WHERE p.prev_number IS NOT NULL
  AND p.old_hash IS NOT NULL AND p.prev_old_hash IS NOT NULL
  AND (p.old_hash = p.prev_old_hash) IS DISTINCT FROM (p.new_hash = p.prev_new_hash)
ORDER BY b.name, p.audit_number;

-- 4. The demo brands' audits, for context: each one's everyday question count, and its count of distinct compared
--    texts. Expected: the two counts equal (no two questions in one audit differ only by punctuation).
SELECT b.name, a.audit_number,
  (SELECT count(*) FROM (
     SELECT c.prompt FROM citations c WHERE c.audit_id = a.id AND c.is_branded_prompt IS NOT TRUE
     UNION
     SELECT f.prompt FROM engine_call_failures f WHERE f.audit_id = a.id AND NOT f.is_branded_prompt
   ) q) AS everyday_questions
FROM audits a JOIN brands b ON b.id = a.brand_id
WHERE b.name IN ('Hero Home Services', 'Omega Services') AND b.deleted_at IS NULL AND a.status = 'complete'
ORDER BY b.name, a.audit_number DESC
LIMIT 12;

ROLLBACK;
