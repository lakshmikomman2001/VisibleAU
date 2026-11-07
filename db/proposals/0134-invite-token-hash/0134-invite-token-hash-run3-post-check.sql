-- 0134-invite-token-hash-run3-post-check.sql -- PROPOSAL, not applied (see 0134_invite_token_hash.sql
-- beside it). Only if Sri decides to store hashes of invite tokens.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). READ-ONLY: one SELECT. Run after run2, and
-- again after the code that reads the hash is pushed. Sri runs it; NOT run from Claude Code. Counts only.
--
-- Expected result: one row --
--   hash_column_exists = t, hash_index_exists = t
--   tokens_without_hash = 0 (every token has its hash)
--   hashes_not_matching = 0 (each hash is the hash of its row's token)
--   after the code push, new invites show as hash_only_rows (a hash and no plain token)
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'org_members' AND column_name = 'invitation_token_hash'
  ) AS hash_column_exists,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'org_members_invitation_token_hash_idx'
  ) AS hash_index_exists,
  (SELECT count(*) FROM org_members
   WHERE invitation_token IS NOT NULL AND invitation_token_hash IS NULL) AS tokens_without_hash,
  (SELECT count(*) FROM org_members
   WHERE invitation_token IS NOT NULL
     AND invitation_token_hash <> sha256(convert_to(invitation_token, 'UTF8'))) AS hashes_not_matching,
  (SELECT count(*) FROM org_members
   WHERE invitation_token IS NULL AND invitation_token_hash IS NOT NULL) AS hash_only_rows;
