-- 0155-s02-run1-precheck.sql (26 Nov 2026, sprint S02 part 2): migration 0155 (db/migrations/0155_question_library.sql)
-- and its backfill: every brand's stored question pack becomes its question library and question set version 1.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ ONLY. Sri runs it before run2; nothing is written (the two pg_temp functions live only in this session).
-- Run it as the role that runs run2 (it must bypass RLS, as 0152's rehash did: check 2).

-- The backfill's rule for a question that names the business, in SQL: lib/audit/flag-branded-prompts.ts
-- isBrandedPrompt -- the brand's name pattern (lib/brands/normalize.ts brandNamePattern), then each of its aliases
-- (S00), then the domain stem (4+ characters) in the text with everything but letters and digits removed. The name
-- pattern is prod-fix 0073's, unchanged; tests/integration/question-library-backfill.integration.test.ts runs these
-- functions against the TS rule.
CREATE OR REPLACE FUNCTION pg_temp.s02_name_matches(prompt_text text, brand_name text)
RETURNS boolean AS $$
DECLARE
  words text[];
  escaped_words text[];
  w text;
  body text;
  pattern text;
BEGIN
  IF brand_name IS NULL OR btrim(brand_name) = '' THEN
    RETURN false;
  END IF;
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
  RETURN prompt_text ~* pattern;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION pg_temp.s02_is_branded(prompt_text text, brand_name text, brand_domain text, brand_aliases text[])
RETURNS boolean AS $$
DECLARE
  a text;
  stem text;
BEGIN
  IF pg_temp.s02_name_matches(prompt_text, brand_name) THEN
    RETURN true;
  END IF;
  FOREACH a IN ARRAY coalesce(brand_aliases, ARRAY[]::text[]) LOOP
    IF pg_temp.s02_name_matches(prompt_text, a) THEN
      RETURN true;
    END IF;
  END LOOP;
  stem := lower(regexp_replace(regexp_replace(lower(btrim(brand_domain)), '^https?://', ''), '[^a-z0-9.]', '', 'g'));
  stem := regexp_replace(stem, '\.(com\.au|net\.au|org\.au|com|net|org|io|co)+$', '');
  stem := regexp_replace(stem, '[^a-z0-9]', '', 'g');
  IF length(stem) < 4 THEN
    RETURN false;
  END IF;
  RETURN regexp_replace(lower(prompt_text), '[^a-z0-9]', '', 'g') LIKE '%' || stem || '%';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 1. Nothing of 0155 exists yet. Expected: every column f (a rerun after run2 shows t, which is fine: run2 is
--    idempotent and skips a brand that already has a set).
SELECT
  to_regclass('public.brand_questions') IS NOT NULL AS brand_questions_exists,
  to_regclass('public.brand_question_sets') IS NOT NULL AS brand_question_sets_exists,
  to_regclass('public.brand_question_set_items') IS NOT NULL AS brand_question_set_items_exists,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audits' AND column_name = 'question_set_id') AS audits_question_set_id,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'citations' AND column_name = 'question_id') AS citations_question_id,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'engine_call_failures' AND column_name = 'question_id') AS failures_question_id;

-- 2. What run2 needs. Expected: every column t (bypass_rls t: the backfill writes FORCE RLS tables for every workspace).
SELECT
  to_regprocedure('public.question_text_key(text)') IS NOT NULL AS question_text_key_exists,
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'visibleau_app') AS visibleau_app_role,
  (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass_rls,
  to_regclass('public.brands') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AS brands_and_users,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'aliases') AS brands_aliases;

-- The brands the backfill covers: not deleted, not the free sample's workspace, a stored pack of text.
CREATE TEMP VIEW s02_packs AS
SELECT b.id AS brand_id, b.organization_id, b.name, b.domain, b.aliases, b.prompt_pack_version,
       p.text, (p.ord - 1)::int AS position,
       pg_temp.s02_is_branded(p.text, b.name, b.domain, b.aliases) AS branded
FROM brands b
CROSS JOIN LATERAL jsonb_array_elements_text(b.prompt_pack) WITH ORDINALITY AS p(text, ord)
WHERE b.deleted_at IS NULL
  AND jsonb_typeof(b.prompt_pack) = 'array'
  AND b.organization_id NOT IN (SELECT id FROM organizations WHERE slug = '__sample__');

-- 3. How much run2 writes. Expected: the counts, for run3 to compare (everyday 10 per brand; 3 to 5 that name it).
SELECT count(DISTINCT brand_id) AS brands, count(*) AS questions,
       count(*) FILTER (WHERE NOT branded) AS everyday, count(*) FILTER (WHERE branded) AS branded
FROM s02_packs;

SELECT b.name, count(*) FILTER (WHERE NOT p.branded) AS everyday, count(*) FILTER (WHERE p.branded) AS branded
FROM s02_packs p JOIN brands b ON b.id = p.brand_id
GROUP BY b.id, b.name ORDER BY b.name;

-- 4. Packs run2 can't take as they are. Expected: 0 rows for each query. Any row stops the run: report it.
--    a. an element that isn't a string
SELECT b.id, b.name FROM brands b
WHERE b.deleted_at IS NULL AND jsonb_typeof(b.prompt_pack) = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(b.prompt_pack) e WHERE jsonb_typeof(e) <> 'string');
--    b. a question outside 10-200 characters (brand_questions' CHECK)
SELECT brand_id, position, char_length(text) AS length FROM s02_packs WHERE char_length(text) NOT BETWEEN 10 AND 200;
--    c. two questions in one pack with the same compared text (one live library row per compared text)
SELECT brand_id, question_text_key(text) AS text_key, count(*) FROM s02_packs
GROUP BY brand_id, question_text_key(text) HAVING count(*) > 1;
--    d. a pack with no everyday question (a set's comparison_hash can't be empty)
SELECT brand_id FROM s02_packs GROUP BY brand_id HAVING count(*) FILTER (WHERE NOT branded) = 0;

-- 5. The SQL rule against how today's audits typed the same questions (LLD 7A step 4): for every brand, each pack
--    question's SQL kind against citations.is_branded_prompt in that brand's latest complete audit, where that audit
--    asked it. Expected: 0 rows. Any row stops the run.
WITH latest AS (
  SELECT DISTINCT ON (a.brand_id) a.brand_id, a.id AS audit_id, a.audit_number
  FROM audits a WHERE a.status = 'complete'
  ORDER BY a.brand_id, a.completed_at DESC NULLS LAST
),
asked AS (
  SELECT l.brand_id, l.audit_number, c.prompt, bool_or(c.is_branded_prompt IS TRUE) AS stored_branded
  FROM latest l JOIN citations c ON c.audit_id = l.audit_id
  GROUP BY l.brand_id, l.audit_number, c.prompt
)
SELECT p.brand_id, a.audit_number, p.text, p.branded AS sql_branded, a.stored_branded
FROM s02_packs p JOIN asked a ON a.brand_id = p.brand_id AND a.prompt = p.text
WHERE p.branded IS DISTINCT FROM a.stored_branded;

-- 5b. How many pack questions check 5 could compare (asked in the latest complete audit) and how many it couldn't.
WITH latest AS (
  SELECT DISTINCT ON (a.brand_id) a.brand_id, a.id AS audit_id
  FROM audits a WHERE a.status = 'complete'
  ORDER BY a.brand_id, a.completed_at DESC NULLS LAST
)
SELECT
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM latest l JOIN citations c ON c.audit_id = l.audit_id
                                 WHERE l.brand_id = p.brand_id AND c.prompt = p.text)) AS compared,
  count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM latest l JOIN citations c ON c.audit_id = l.audit_id
                                     WHERE l.brand_id = p.brand_id AND c.prompt = p.text)) AS not_asked_in_latest
FROM s02_packs p;

-- 6. A preview of run3's hash check: version 1's comparison_hash against the latest complete audit's
--    question_set_hash. Expected: same for every brand whose latest audit asked the stored pack; a brand whose pack
--    changed after its last audit shows same f with pack_version_now > audit_pack_version (reported, never fixed).
WITH v1 AS (
  SELECT brand_id,
         encode(sha256(convert_to(string_agg(k, E'\n' ORDER BY k COLLATE "C"), 'UTF8')), 'hex') AS comparison_hash
  FROM (SELECT DISTINCT brand_id, question_text_key(text) AS k FROM s02_packs WHERE NOT branded) e
  GROUP BY brand_id
),
latest AS (
  SELECT DISTINCT ON (a.brand_id) a.brand_id, a.audit_number, a.question_set_hash, a.prompt_pack_version
  FROM audits a WHERE a.status = 'complete'
  ORDER BY a.brand_id, a.completed_at DESC NULLS LAST
)
SELECT b.name, l.audit_number, v1.comparison_hash = l.question_set_hash AS same,
       b.prompt_pack_version AS pack_version_now, l.prompt_pack_version AS audit_pack_version
FROM v1 JOIN brands b ON b.id = v1.brand_id LEFT JOIN latest l ON l.brand_id = v1.brand_id
ORDER BY same NULLS FIRST, b.name;
