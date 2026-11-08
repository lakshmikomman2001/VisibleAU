-- 0134-invite-token-hash-run4-rollback.sql (follow-ups from 6e27afc..01a6a8c, part 4): undoes run2.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). WRITES: drops the trigger, its function, the
-- hash index, the hex CHECK and the column; restores 0131's CHECK. Sri-authorized only; NOT run from
-- Claude Code.
--
-- Only with the code from before this push deployed (never pushed, or reverted), and only BEFORE run2b:
-- that code finds invites by their plain token, which run2b clears. An invite the new code sent has only a
-- hash; without it, its link can't work, so those pending invites are cancelled here (deleted, as Cancel on
-- the Team page does) before 0131's CHECK comes back -- run3's hash_only_rows says how many. Re-send them
-- from the Team page afterwards.
BEGIN;

DELETE FROM org_members
WHERE invitation_token IS NULL AND invitation_token_hash IS NOT NULL AND accepted_at IS NULL;

DROP TRIGGER IF EXISTS org_members_hash_invitation_token ON org_members;
DROP FUNCTION IF EXISTS org_members_hash_invitation_token();
DROP INDEX IF EXISTS org_members_invitation_token_hash_idx;
ALTER TABLE org_members DROP CONSTRAINT IF EXISTS org_members_invitation_token_hash_hex;

ALTER TABLE org_members DROP CONSTRAINT IF EXISTS org_members_profile_or_pending_invite;
ALTER TABLE org_members ADD CONSTRAINT org_members_profile_or_pending_invite CHECK (
  user_id IS NOT NULL
  OR (invited_email IS NOT NULL AND invitation_token IS NOT NULL AND accepted_at IS NULL AND NOT is_active)
);

ALTER TABLE org_members DROP COLUMN IF EXISTS invitation_token_hash;

COMMIT;
