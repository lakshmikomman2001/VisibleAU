-- 0105-close-new-workspace-run4-drop-backup.sql
-- Close the new "vunnara" workspace one account made on 31 Oct, after 0104
-- (Sri's decision C1 stands)
--
-- PRODUCTION branch (br-ancient-tooth). Run on its own, as one editor
-- submission. Run LAST: at least 7 days after run2, once run3 has read
-- all PASS and the account is working in Splice Marketing -- after this
-- the rollback file can no longer run. Sri-authorized only. NOT run from
-- Claude Code. 0104's run4 is separate; the two can run on the same day.
--
-- Expected result: "Statement executed successfully".
DROP TABLE IF EXISTS
  _backup_0105_account_orgs,
  _backup_0105_organizations,
  _backup_0105_auth_organizations,
  _backup_0105_other_orgs,
  _backup_0105_other_auth_orgs;
