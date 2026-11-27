-- 0156-s03-run3-post-check.sql (27 Nov 2026, sprint S03 part 1): after run2. Every check must pass before the push.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ ONLY (a read-only transaction, rolled back). Row-level security is checked from the catalogue (policies,
-- FORCE, grants), with no role switch: the production role can't SET ROLE visibleau_app (LLD amendment 80).
-- 6 result tabs.
--
-- Corrected in the chat review (27 Nov 2026): check 3 tests each privilege on its own. has_table_privilege and
-- has_column_privilege with a comma list ('SELECT,INSERT,...') are true if ANY one is held, so the first version would
-- pass with SELECT alone. Check 3 also re-checks 0155's grants the same way. Check 5 is ordered by table name.

BEGIN READ ONLY;

-- 1. organizations.question_packs: an integer, not null, default 0, with its CHECK.
--    Expected: 1 row: integer, NO, 0, check_exists t.
SELECT c.data_type, c.is_nullable, c.column_default,
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conname = 'organizations_question_packs_check' AND conrelid = 'public.organizations'::regclass)
    AS check_exists
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'organizations' AND c.column_name = 'question_packs';

-- 2. brand_question_packs has RLS, FORCE RLS and four policies, each on app.current_org_id.
--    Expected: 1 row: rls t, forced t, policies 4, every_policy_uses_org t, commands {DELETE,INSERT,SELECT,UPDATE}.
SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
  (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policies,
  (SELECT bool_and(coalesce(p.qual, '') || coalesce(p.with_check, '') LIKE '%current_setting(''app.current_org_id''%')
     FROM pg_policies p WHERE p.tablename = c.relname) AS every_policy_uses_org,
  (SELECT array_agg(p.cmd ORDER BY p.cmd) FROM pg_policies p WHERE p.tablename = c.relname) AS commands
FROM pg_class c
WHERE c.oid = 'public.brand_question_packs'::regclass;

-- 3. visibleau_app's grants, one privilege at a time, for 0156 and (re-checked) 0155; and that it doesn't bypass RLS.
--    Expected: 1 row: checked 28, missing 0, missing_list empty, app_bypasses_rls f.
WITH want(kind, obj, priv) AS (VALUES
  ('table', 'brand_question_packs', 'SELECT'), ('table', 'brand_question_packs', 'INSERT'),
  ('table', 'brand_question_packs', 'UPDATE'), ('table', 'brand_question_packs', 'DELETE'),
  ('column', 'organizations.question_packs', 'SELECT'), ('column', 'organizations.question_packs', 'UPDATE'),
  ('table', 'brand_questions', 'SELECT'), ('table', 'brand_questions', 'INSERT'),
  ('table', 'brand_questions', 'UPDATE'), ('table', 'brand_questions', 'DELETE'),
  ('table', 'brand_question_sets', 'SELECT'), ('table', 'brand_question_sets', 'INSERT'),
  ('table', 'brand_question_sets', 'UPDATE'), ('table', 'brand_question_sets', 'DELETE'),
  ('table', 'brand_question_set_items', 'SELECT'), ('table', 'brand_question_set_items', 'INSERT'),
  ('table', 'brand_question_set_items', 'UPDATE'), ('table', 'brand_question_set_items', 'DELETE'),
  ('column', 'audits.question_set_id', 'SELECT'), ('column', 'audits.question_set_id', 'INSERT'),
  ('column', 'audits.question_set_id', 'UPDATE'),
  ('column', 'citations.question_id', 'SELECT'), ('column', 'citations.question_id', 'INSERT'),
  ('column', 'citations.question_id', 'UPDATE'),
  ('column', 'engine_call_failures.question_id', 'SELECT'), ('column', 'engine_call_failures.question_id', 'INSERT'),
  ('column', 'engine_call_failures.question_id', 'UPDATE'),
  ('function', 'question_text_key(text)', 'EXECUTE')
), checked AS (
  SELECT obj, priv,
    CASE kind
      WHEN 'table' THEN has_table_privilege('visibleau_app', obj, priv)
      WHEN 'column' THEN has_column_privilege('visibleau_app', split_part(obj, '.', 1), split_part(obj, '.', 2), priv)
      ELSE has_function_privilege('visibleau_app', obj, priv)
    END AS ok
  FROM want
)
SELECT count(*) AS checked,
  count(*) FILTER (WHERE NOT ok) AS missing,
  coalesce(string_agg(obj || ' ' || priv, ', ') FILTER (WHERE NOT ok), '') AS missing_list,
  (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'visibleau_app') AS app_bypasses_rls
FROM checked;

-- 4. What run2 wrote. Expected: workspaces = run1's check 3, workspaces_not_0 = 0, packs_rows = 0.
SELECT
  (SELECT count(*) FROM organizations) AS workspaces,
  (SELECT count(*) FROM organizations WHERE question_packs <> 0) AS workspaces_not_0,
  (SELECT count(*) FROM brand_question_packs) AS packs_rows;

-- 5. A brand's or a workspace's delete takes its packs row (ON DELETE CASCADE, confdeltype 'c').
--    Expected: 2 rows, brands c, organizations c.
SELECT confrelid::regclass::text AS refers_to, confdeltype::text AS on_delete
FROM pg_constraint
WHERE conrelid = 'public.brand_question_packs'::regclass AND contype = 'f'
ORDER BY 1;

-- 6. The packs CHECK (packs >= 0) is there. Expected: 1 row.
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.brand_question_packs'::regclass AND contype = 'c';

ROLLBACK;
