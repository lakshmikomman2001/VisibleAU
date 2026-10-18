-- 0073-branded-flag-correction-run3-post-check.sql (Vunnara Build 1, Part B)
--
-- PRODUCTION branch. Run on its own, as one editor submission (defines
-- its own pg_temp function). READ-ONLY. Run AFTER run2-apply.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Same comparison as diag-0072's Query 2, re-run against the
-- now-updated table.
--
-- Expected result: total_false_to_true = 0 AND total_true_to_false = 0.
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
  count(*) FILTER (WHERE COALESCE(stored, false) = false AND computed = true) AS total_false_to_true,
  count(*) FILTER (WHERE COALESCE(stored, false) = true AND computed = false) AS total_true_to_false
FROM computed;
