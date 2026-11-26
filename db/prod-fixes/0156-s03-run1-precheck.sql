-- 0156-s03-run1-precheck.sql (27 Nov 2026, sprint S03 part 1): migration 0156 (db/migrations/0156_question_packs.sql),
-- question packs: organizations.question_packs and brand_question_packs.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ ONLY. Sri runs it before run2; nothing is written. 4 result tabs (Neon's editor shows at most 25).

-- 1. Nothing of 0156 exists yet.
--    Expected: question_packs_column f, packs_table f. (A rerun after run2 shows t, t: fine.)
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'question_packs')
    AS question_packs_column,
  to_regclass('public.brand_question_packs') IS NOT NULL AS packs_table;

-- 2. What run2 needs: the role owns organizations (ALTER TABLE) and may create tables in public.
--    Expected: owns_organizations t, can_create t, app_role_exists t.
SELECT
  pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = 'public.organizations'::regclass), 'USAGE')
    AS owns_organizations,
  has_schema_privilege(current_user, 'public', 'CREATE') AS can_create,
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'visibleau_app') AS app_role_exists;

-- 3. What run2 touches. Expected: the counts as they are (keep them for run3's check 4): every workspace gets
--    question_packs 0; no brand gets a packs row.
SELECT
  (SELECT count(*) FROM organizations) AS workspaces,
  (SELECT count(*) FROM brands WHERE deleted_at IS NULL) AS live_brands;

-- 4. Nothing else is named brand_question_packs or uses the constraint name run2 adds.
--    Expected: 0 rows.
SELECT conname, conrelid::regclass AS on_table
FROM pg_constraint
WHERE conname IN ('organizations_question_packs_check', 'brand_question_packs_pkey')
UNION ALL
SELECT policyname, tablename::regclass FROM pg_policies WHERE tablename = 'brand_question_packs';
