-- 0155-s02-run3-post-check.sql (26 Nov 2026, sprint S02 part 2): after run2. Every check must pass before the push.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- Sri runs it; NOT run from Claude Code. Nothing is kept: the test writes (check 8) are inside a transaction that is
-- rolled back at the end. A brand whose prompt_pack isn't a JSON array (NULL, or a scalar) is left out of every
-- check, as run2 leaves it out.

BEGIN;

-- 1. The three tables exist with FORCE RLS, and four policies each on app.current_org_id.
--    Expected: 3 rows, rls t, forced t, policies 4, every policy_uses_org t.
SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
  (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policies,
  (SELECT bool_and(coalesce(p.qual, '') || coalesce(p.with_check, '') LIKE '%app.current_org_id%')
     FROM pg_policies p WHERE p.tablename = c.relname) AS policy_uses_org
FROM pg_class c
WHERE c.relname IN ('brand_questions', 'brand_question_sets', 'brand_question_set_items') AND c.relkind = 'r'
ORDER BY c.relname;

-- 2. visibleau_app's grants. Expected: every column t.
SELECT
  has_table_privilege('visibleau_app', 'brand_questions', 'SELECT,INSERT,UPDATE,DELETE') AS questions_dml,
  has_table_privilege('visibleau_app', 'brand_question_sets', 'SELECT,INSERT,UPDATE,DELETE') AS sets_dml,
  has_table_privilege('visibleau_app', 'brand_question_set_items', 'SELECT,INSERT,UPDATE,DELETE') AS items_dml,
  has_column_privilege('visibleau_app', 'audits', 'question_set_id', 'SELECT,INSERT,UPDATE') AS audits_set_col,
  has_column_privilege('visibleau_app', 'citations', 'question_id', 'SELECT,INSERT,UPDATE') AS citations_question_col,
  has_column_privilege('visibleau_app', 'engine_call_failures', 'question_id', 'SELECT,INSERT,UPDATE') AS failures_question_col,
  has_function_privilege('visibleau_app', 'question_text_key(text)', 'EXECUTE') AS text_key_fn;

-- 3. What run2 wrote. Expected: brands and questions equal run1's check 3; sets = brands, every one version 1 and
--    current; items = questions; no brand with two current sets.
SELECT
  (SELECT count(DISTINCT brand_id) FROM brand_questions) AS brands,
  (SELECT count(*) FROM brand_questions) AS questions,
  (SELECT count(*) FROM brand_questions WHERE kind = 'everyday') AS everyday,
  (SELECT count(*) FROM brand_questions WHERE kind = 'branded') AS branded,
  (SELECT count(*) FROM brand_question_sets) AS sets,
  (SELECT count(*) FROM brand_question_sets WHERE version = 1 AND is_current) AS current_v1_sets,
  (SELECT count(*) FROM brand_question_set_items) AS items,
  (SELECT count(*) FROM (SELECT brand_id FROM brand_question_sets WHERE is_current GROUP BY brand_id HAVING count(*) > 1) d) AS brands_with_two_current;

-- 4. Each set is its brand's stored pack: the same questions in the same order. Expected: 0 rows.
WITH pack AS (
  SELECT b.id AS brand_id, array_agg(p.text ORDER BY p.ord) AS texts
  FROM brands b CROSS JOIN LATERAL jsonb_array_elements_text(b.prompt_pack) WITH ORDINALITY AS p(text, ord)
  WHERE jsonb_typeof(b.prompt_pack) = 'array' AND b.id IN (SELECT brand_id FROM brand_question_sets)
  GROUP BY b.id
),
setq AS (
  SELECT s.brand_id, array_agg(q.text ORDER BY i.position) AS texts
  FROM brand_question_sets s
  JOIN brand_question_set_items i ON i.set_id = s.id
  JOIN brand_questions q ON q.id = i.question_id
  WHERE s.is_current
  GROUP BY s.brand_id
)
SELECT p.brand_id, cardinality(p.texts) AS pack_length, cardinality(s.texts) AS set_length
FROM pack p LEFT JOIN setq s ON s.brand_id = p.brand_id
WHERE s.texts IS DISTINCT FROM p.texts;

-- 5. LLD 7A step 3, N2: brand by brand, version 1's comparison_hash against the question_set_hash of the brand's
--    latest complete audit. "asked_the_pack" is t when that audit asked exactly the stored pack's questions (its
--    answers' and failures' prompts are the pack's). Expected: same t on every row where asked_the_pack is t. A row
--    with asked_the_pack f is a brand whose pack changed after its last audit (or an audit that couldn't finish every
--    question): listed for review, NEVER fixed. A brand with no complete audit has no row.
WITH latest AS (
  SELECT DISTINCT ON (a.brand_id) a.brand_id, a.id AS audit_id, a.audit_number, a.question_set_hash,
         a.prompt_pack_version
  FROM audits a WHERE a.status = 'complete'
  ORDER BY a.brand_id, a.completed_at DESC NULLS LAST
),
asked AS (
  SELECT l.brand_id, array_agg(DISTINCT x.prompt ORDER BY x.prompt) AS prompts
  FROM latest l
  JOIN (SELECT audit_id, prompt FROM citations UNION SELECT audit_id, prompt FROM engine_call_failures) x
    ON x.audit_id = l.audit_id
  GROUP BY l.brand_id
),
pack AS (
  SELECT b.id AS brand_id, array_agg(DISTINCT p.text ORDER BY p.text) AS prompts
  FROM brands b CROSS JOIN LATERAL jsonb_array_elements_text(b.prompt_pack) AS p(text)
  WHERE jsonb_typeof(b.prompt_pack) = 'array'
  GROUP BY b.id
)
SELECT b.name, l.audit_number, s.comparison_hash = l.question_set_hash AS same,
       a.prompts = pk.prompts AS asked_the_pack,
       b.prompt_pack_version AS pack_version_now, l.prompt_pack_version AS audit_pack_version,
       CASE
         WHEN s.comparison_hash = l.question_set_hash THEN 'same'
         WHEN a.prompts = pk.prompts THEN 'DIFFERENT although the audit asked the pack: report it'
         WHEN b.prompt_pack_version > l.prompt_pack_version THEN 'the pack changed after the audit'
         ELSE 'the audit asked other questions (or not all of them)'
       END AS reason
FROM brand_question_sets s
JOIN brands b ON b.id = s.brand_id
JOIN latest l ON l.brand_id = s.brand_id
LEFT JOIN asked a ON a.brand_id = s.brand_id
LEFT JOIN pack pk ON pk.brand_id = s.brand_id
WHERE s.version = 1
ORDER BY (s.comparison_hash = l.question_set_hash), b.name;

-- 5b. The same, counted. Expected: different_although_asked 0.
WITH latest AS (
  SELECT DISTINCT ON (a.brand_id) a.brand_id, a.id AS audit_id, a.question_set_hash
  FROM audits a WHERE a.status = 'complete'
  ORDER BY a.brand_id, a.completed_at DESC NULLS LAST
),
asked AS (
  SELECT l.brand_id, array_agg(DISTINCT x.prompt ORDER BY x.prompt) AS prompts
  FROM latest l
  JOIN (SELECT audit_id, prompt FROM citations UNION SELECT audit_id, prompt FROM engine_call_failures) x
    ON x.audit_id = l.audit_id
  GROUP BY l.brand_id
),
pack AS (
  SELECT b.id AS brand_id, array_agg(DISTINCT p.text ORDER BY p.text) AS prompts
  FROM brands b CROSS JOIN LATERAL jsonb_array_elements_text(b.prompt_pack) AS p(text)
  WHERE jsonb_typeof(b.prompt_pack) = 'array'
  GROUP BY b.id
)
SELECT
  count(*) FILTER (WHERE s.comparison_hash = l.question_set_hash) AS same,
  count(*) FILTER (WHERE s.comparison_hash IS DISTINCT FROM l.question_set_hash AND a.prompts = pk.prompts) AS different_although_asked,
  count(*) FILTER (WHERE s.comparison_hash IS DISTINCT FROM l.question_set_hash AND a.prompts IS DISTINCT FROM pk.prompts) AS different_pack_changed
FROM brand_question_sets s
JOIN latest l ON l.brand_id = s.brand_id
LEFT JOIN asked a ON a.brand_id = s.brand_id
LEFT JOIN pack pk ON pk.brand_id = s.brand_id
WHERE s.version = 1;

-- 6. Every library question's kind against how the latest complete audit typed the same question
--    (citations.is_branded_prompt). Expected: 0 rows.
WITH latest AS (
  SELECT DISTINCT ON (a.brand_id) a.brand_id, a.id AS audit_id
  FROM audits a WHERE a.status = 'complete'
  ORDER BY a.brand_id, a.completed_at DESC NULLS LAST
)
SELECT q.brand_id, q.text, q.kind, bool_or(c.is_branded_prompt IS TRUE) AS stored_branded
FROM brand_questions q
JOIN latest l ON l.brand_id = q.brand_id
JOIN citations c ON c.audit_id = l.audit_id AND c.prompt = q.text
GROUP BY q.brand_id, q.text, q.kind
HAVING (q.kind = 'branded') IS DISTINCT FROM bool_or(c.is_branded_prompt IS TRUE);

-- 7. Every compared text is question_text_key(text), and nothing past is linked yet. Expected: 0, 0, 0, 0.
SELECT
  (SELECT count(*) FROM brand_questions WHERE text_key <> question_text_key(text)) AS bad_text_keys,
  (SELECT count(*) FROM audits WHERE question_set_id IS NOT NULL) AS audits_linked,
  (SELECT count(*) FROM citations WHERE question_id IS NOT NULL) AS citations_linked,
  (SELECT count(*) FROM engine_call_failures WHERE question_id IS NOT NULL) AS failures_linked;

-- 8. RLS as the app: one workspace sees and writes only its own rows. Expected: own_questions > 0, other_questions 0;
--    then the second INSERT fails with "new row violates row-level security policy" (the transaction is then aborted,
--    which is fine: everything here is rolled back).
SELECT set_config('s02.org', (SELECT organization_id::text FROM brand_questions LIMIT 1), true);
SET LOCAL ROLE visibleau_app;
SELECT set_config('app.current_org_id', current_setting('s02.org'), true);
SELECT
  (SELECT count(*) FROM brand_questions) AS own_questions,
  (SELECT count(*) FROM brand_questions WHERE organization_id::text <> current_setting('s02.org')) AS other_questions,
  (SELECT count(*) FROM brand_question_sets) AS own_sets;
INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source)
SELECT organization_id, brand_id, 'Run3 check question for RLS', question_text_key('Run3 check question for RLS'),
       'everyday', 'agency'
FROM brand_questions LIMIT 1;
INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source)
SELECT gen_random_uuid(), brand_id, 'Run3 check question, other org', question_text_key('Run3 check question, other org'),
       'everyday', 'agency'
FROM brand_questions LIMIT 1;

ROLLBACK;
