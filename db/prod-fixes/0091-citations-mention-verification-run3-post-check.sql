-- 0091-citations-mention-verification-run3-post-check.sql (Vunnara,
-- 21 Oct, "audit reliability", Part B)
--
-- PRODUCTION branch. Run on its own, after run2-apply.sql finishes.
-- READ-ONLY. Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: one row -- column_present = t, is_nullable = YES,
-- column_default = NULL, constraint_present = t,
-- app_role_can_insert = t, app_role_can_select = t,
-- all_existing_rows_null = t (nothing has been classified yet --
-- that only happens for audits run after this deploys).
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'mention_verification'
  ) AS column_present,
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'mention_verification') AS is_nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'mention_verification') AS column_default,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'citations_mention_verification_check'
  ) AS constraint_present,
  has_column_privilege('visibleau_app', 'citations', 'mention_verification', 'INSERT') AS app_role_can_insert,
  has_column_privilege('visibleau_app', 'citations', 'mention_verification', 'SELECT') AS app_role_can_select,
  (SELECT count(*) = 0 FROM citations WHERE mention_verification IS NOT NULL) AS all_existing_rows_null;
