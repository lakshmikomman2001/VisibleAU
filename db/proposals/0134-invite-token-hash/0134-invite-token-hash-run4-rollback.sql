-- 0134-invite-token-hash-run4-rollback.sql -- PROPOSAL, not applied (see 0134_invite_token_hash.sql
-- beside it). Only if Sri decides to store hashes of invite tokens, and then wants to undo run2.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). WRITES: drops the index and the column.
-- Safe only while every invite still has its plain token too: BEFORE the code that writes only hashes is
-- pushed, or after that code is reverted AND no invite was sent in between (an invite sent by it has no
-- plain token, and dropping its hash would make its link unusable; run3's hash_only_rows says how many).
-- Sri-authorized only; NOT run from Claude Code.
BEGIN;

DROP INDEX IF EXISTS org_members_invitation_token_hash_idx;
ALTER TABLE org_members DROP COLUMN IF EXISTS invitation_token_hash;

COMMIT;
