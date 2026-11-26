-- 0156-s03-run4-rollback.sql (27 Nov 2026, sprint S03 part 1): undoes run2. ONLY if run3 failed, or Sri decides to go
-- back.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
--
-- ONLY BEFORE THE S03 PUSH, or after reverting it: the pushed code reads organizations.question_packs (Drizzle reads
-- every schema column), so dropping it under that code makes every read of organizations fail. run2 wrote no rows of
-- its own (the column's default is the value; brand_question_packs starts empty), so this drops the schema only.

BEGIN;

-- What goes. Expected: packs_rows 0 (S10 is what writes them), workspaces_with_packs 0.
SELECT
  (SELECT count(*) FROM brand_question_packs) AS packs_rows,
  (SELECT count(*) FROM organizations WHERE question_packs <> 0) AS workspaces_with_packs;

DROP TABLE IF EXISTS "brand_question_packs";
ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organizations_question_packs_check";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "question_packs";

-- Expected: f, f (nothing of 0156 left).
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'question_packs')
    AS question_packs_column,
  to_regclass('public.brand_question_packs') IS NOT NULL AS packs_table;

COMMIT;
