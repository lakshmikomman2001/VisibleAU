-- 0104-close-accidental-workspaces-run4-drop-backup.sql
-- Close one account's accidental workspaces (Sri's decision C1, 31 Oct)
--
-- PRODUCTION branch (br-ancient-tooth). Run on its own, as one editor
-- submission. Run LAST: at least 7 days after run2, once run3 has read
-- all PASS and the account is working in Splice Marketing -- after this
-- the rollback file can no longer run. Sri-authorized only. NOT run from
-- Claude Code.
--
-- Expected result: "Statement executed successfully".
DROP TABLE IF EXISTS
  _backup_0104_targets,
  _backup_0104_organizations,
  _backup_0104_auth_organizations,
  _backup_0104_placeholder_profiles,
  _backup_0104_other_orgs,
  _backup_0104_other_auth_orgs;
