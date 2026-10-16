-- 0057 RUN 3 of 3 -- PRODUCTION branch. Post-check.
-- Expected: one row -- column_present = t, is_nullable = YES, column_default = NULL,
--           app_role_can_insert = t, app_role_can_select = t. Send Claude a screenshot.
-- Sri-authorized only. NOT run from Claude Code.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'citations' AND column_name = 'response_text') AS column_present,
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'response_text') AS is_nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'response_text') AS column_default,
  has_column_privilege('visibleau_app', 'citations', 'response_text', 'INSERT') AS app_role_can_insert,
  has_column_privilege('visibleau_app', 'citations', 'response_text', 'SELECT') AS app_role_can_select;
