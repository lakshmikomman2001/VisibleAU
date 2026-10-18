-- diag-0072-branded-flag-mismatch.sql (Vunnara Build 1, Part B, read-only)
--
-- PRODUCTION branch. READ-ONLY. Paste into the Neon SQL editor as ONE
-- submission (the pg_temp function below only lives for this session,
-- so it must be defined in the same submission that uses it -- every
-- file in this fix repeats the definition for the same reason).
-- NOT run from Claude Code -- there is no prod access from that
-- environment. Sri-authorized only.
--
-- WHY: citations.is_branded_prompt was set by two rules that each got
-- it wrong in a different direction (Part 2 / Part 2 addendum reports):
-- isBrandedPromptTemplate missed every already-expanded intentSignal-
-- derived prompt (never flagged, even when it happened to name the
-- brand); isBrandedPackPrompt flagged by POOL MEMBERSHIP against
-- buildEnrichedPrompts' output, wrongly flagging Omega's 2 intentSignal
-- prompts as branded (they never name "Omega Services") and never
-- checking {domain}-only templates at all. This query recomputes the
-- correct value with a plpgsql mirror of lib/audit/flag-branded-
-- prompts.ts's isBrandedPrompt -- parity-tested against the real TS
-- function on 17 fixture cases (quotes, bold, possessive, hyphenated,
-- domain-only, "and"/"&", short-stem, a false-positive-prefix word) in
-- tests/integration/branded-flag-sql-parity.integration.test.ts -- and
-- counts both mismatch directions per completed audit.
--
-- Expected (from the Part 2 addendum's direct reproduction): Omega
-- Services' audit #27 shows true_to_false_count = 8 (its 2 intentSignal-
-- derived prompts, asked across its 4 engines, wrongly flagged branded
-- under the old pool-membership rule) and false_to_true_count = 0. Any
-- other brand whose stored prompts were sourced the same way (Get
-- Plumbing's intentSignal prompts are the other confirmed case from the
-- Part 2 report, exact counts not reproduced here -- this query is how
-- Sri confirms them against the real data) will show a similar pattern.
-- A nonzero false_to_true_count anywhere means a {domain}-only or
-- directly-named prompt was never flagged branded at all.

CREATE OR REPLACE FUNCTION pg_temp.is_branded_prompt_text(prompt_text text, brand_name text, brand_domain text)
RETURNS boolean AS $$
DECLARE
  words text[];
  escaped_words text[];
  w text;
  body text;
  pattern text;
  stem text;
  stripped_prompt text;
BEGIN
  words := string_to_array(btrim(regexp_replace(brand_name, '\s+', ' ', 'g')), ' ');
  escaped_words := ARRAY[]::text[];
  FOREACH w IN ARRAY words LOOP
    IF lower(w) = 'and' THEN
      escaped_words := array_append(escaped_words, '(?:and|&)');
    ELSE
      escaped_words := array_append(
        escaped_words,
        regexp_replace(w, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g')
      );
    END IF;
  END LOOP;
  body := array_to_string(escaped_words, '[\s\-–—&''’.]*');
  pattern := '(?:^|[^[:alnum:]])' || body || '(?:[''’]s?)?(?:$|[^[:alnum:]])';

  IF prompt_text ~* pattern THEN
    RETURN true;
  END IF;

  stem := lower(regexp_replace(regexp_replace(lower(btrim(brand_domain)), '^https?://', ''), '[^a-z0-9.]', '', 'g'));
  stem := regexp_replace(stem, '\.(com\.au|net\.au|org\.au|com|net|org|io|co)+$', '');
  stem := regexp_replace(stem, '[^a-z0-9]', '', 'g');
  IF length(stem) < 4 THEN
    RETURN false;
  END IF;
  stripped_prompt := regexp_replace(lower(prompt_text), '[^a-z0-9]', '', 'g');
  RETURN stripped_prompt LIKE '%' || stem || '%';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Query 1: per-audit counts, both directions.
WITH computed AS (
  SELECT
    c.id AS citation_id,
    c.audit_id,
    c.is_branded_prompt AS stored,
    pg_temp.is_branded_prompt_text(c.prompt, b.name, b.domain) AS computed
  FROM citations c
  JOIN audits a ON a.id = c.audit_id
  JOIN brands b ON b.id = a.brand_id
  WHERE a.status = 'complete'
)
SELECT
  audit_id,
  COUNT(*) FILTER (WHERE COALESCE(stored, false) = false AND computed = true) AS false_to_true_count,
  COUNT(*) FILTER (WHERE COALESCE(stored, false) = true AND computed = false) AS true_to_false_count
FROM computed
GROUP BY audit_id
HAVING COUNT(*) FILTER (WHERE COALESCE(stored, false) IS DISTINCT FROM computed) > 0
ORDER BY audit_id;

-- Query 2: grand totals, so Sri can see the blast radius at a glance.
WITH computed AS (
  SELECT
    c.is_branded_prompt AS stored,
    pg_temp.is_branded_prompt_text(c.prompt, b.name, b.domain) AS computed
  FROM citations c
  JOIN audits a ON a.id = c.audit_id
  JOIN brands b ON b.id = a.brand_id
  WHERE a.status = 'complete'
)
SELECT
  count(*) AS total_citation_rows_checked,
  count(*) FILTER (WHERE COALESCE(stored, false) = false AND computed = true) AS total_false_to_true,
  count(*) FILTER (WHERE COALESCE(stored, false) = true AND computed = false) AS total_true_to_false
FROM computed;
