-- 0073-branded-flag-correction-run1-backup.sql (Vunnara Build 1, Part B)
--
-- PRODUCTION branch. Run on its own, as one editor submission (defines
-- its own pg_temp function -- see diag-0072's header for why).
-- Run AFTER diag-0072-branded-flag-mismatch.sql.
-- Snapshots ONLY the citation rows that will change into
-- _backup_0073_citations_branded (id, is_branded_prompt) -- Neon's
-- editor can't \copy. Drop it later, once run3's post-check looks
-- right, via a separate file.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then
-- backup_row_count matches diag-0072 Query 2's
-- (total_false_to_true + total_true_to_false).
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

CREATE TABLE _backup_0073_citations_branded AS
SELECT c.id, c.is_branded_prompt
FROM citations c
JOIN audits a ON a.id = c.audit_id
JOIN brands b ON b.id = a.brand_id
WHERE a.status = 'complete'
  AND COALESCE(c.is_branded_prompt, false) IS DISTINCT FROM pg_temp.is_branded_prompt_text(c.prompt, b.name, b.domain);

SELECT count(*) AS backup_row_count FROM _backup_0073_citations_branded;
