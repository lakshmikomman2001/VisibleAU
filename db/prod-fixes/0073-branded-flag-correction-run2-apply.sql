-- 0073-branded-flag-correction-run2-apply.sql (Vunnara Build 1, Part B)
--
-- PRODUCTION branch. Run on its own, as one editor submission (defines
-- its own pg_temp function). ONE transaction. Run AFTER run1-backup.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Only touches the rows run1 backed up -- never a blind UPDATE across
-- every citation.
--
-- Expected result: "Statement executed successfully", then
-- updated_row_count equals run1's backup_row_count.
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

BEGIN;

UPDATE citations c
SET is_branded_prompt = pg_temp.is_branded_prompt_text(c.prompt, b.name, b.domain)
FROM audits a, brands b
WHERE c.audit_id = a.id
  AND a.brand_id = b.id
  AND c.id IN (SELECT id FROM _backup_0073_citations_branded);

COMMIT;

SELECT count(*) AS updated_row_count
FROM citations c
JOIN _backup_0073_citations_branded backup ON backup.id = c.id
WHERE c.is_branded_prompt IS DISTINCT FROM backup.is_branded_prompt;
