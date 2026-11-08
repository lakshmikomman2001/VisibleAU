-- 0141-drop-plain-invite-token-run2-apply.sql (live invite test follow-ups, part 5): the plain invite token
-- column, and the trigger that hashed it, go. Mirrors db/migrations/0141_drop_plain_invite_token.sql.
--
-- RUN AFTER THE PUSH THAT CARRIES IT IS LIVE, NEVER BEFORE: the code before it names the column in every read
-- of org_members. Run after run1 shows pending_without_hash = 0.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). WRITES: re-creates 0131's CHECK to need the
-- hash, drops 0134's trigger and function, and drops org_members.invitation_token (with its unique
-- constraint and any plain token still in it). Sri-authorized only; NOT run from Claude Code. Undone, as far
-- as it can be, by run4.
--
-- Takes a brief lock on org_members (a small table). Idempotent.
BEGIN;

ALTER TABLE org_members DROP CONSTRAINT IF EXISTS org_members_profile_or_pending_invite;
ALTER TABLE org_members ADD CONSTRAINT org_members_profile_or_pending_invite CHECK (
  user_id IS NOT NULL
  OR (
    invited_email IS NOT NULL
    AND invitation_token_hash IS NOT NULL
    AND accepted_at IS NULL
    AND NOT is_active
  )
);

DROP TRIGGER IF EXISTS org_members_hash_invitation_token ON org_members;
DROP FUNCTION IF EXISTS org_members_hash_invitation_token();

ALTER TABLE org_members DROP COLUMN IF EXISTS invitation_token;

COMMIT;
