-- Migration 0152 (17 Nov 2026, leftovers task part 6; Sri's production check of 16 Nov): an audit's question set is
-- compared by what its questions say, not by their exact characters.
--
-- RUN BEFORE THE PUSH THAT CARRIES IT (prod-fix 0152 run1 -> run3; run4 only to undo). Both audit runners call
-- question_text_key() when they mark an audit complete (lib/audit/question-set-sql.ts); without the function every
-- audit fails at its last step.
--
-- question_set_hash (migration 0150) hashed each everyday question's exact text, so a punctuation-only change to the
-- question generator (" -- " to " — ") made audits that asked the same thing "not comparable": no drift alert, no
-- trend, no "up 5 points". question_text_key(question) is the text a question is compared by: lower case, every
-- punctuation mark and dash (ASCII, and the en/em dashes, curly quotes, ellipsis, minus and no-break space a
-- generator or an editor writes) turned into a space, runs of white space made one space, trimmed. Two questions with
-- the same key ask the same thing; a changed word still changes the key.
--
-- The hash is then the SHA-256 (hex) of the audit's DISTINCT keys, sorted bytewise (COLLATE "C") and joined with a
-- newline -- the expression below, and lib/audit/question-set-sql.ts's questionSetHashSql(), the same one.
--
-- Backfill: every complete audit is rehashed (0150's backfill filled only NULLs, so it can't be re-run for this). An
-- audit with no stored everyday row keeps NULL, as before. Needs a role that bypasses RLS (citations and
-- engine_call_failures force it); run1 checks, and lists the audits whose comparability changes.
--
-- The function is IMMUTABLE (lower, translate, regexp_replace and btrim are), owned by the migrating role, executable
-- by PUBLIC (Postgres' default for functions), so the app role can call it; it reads no table.
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
