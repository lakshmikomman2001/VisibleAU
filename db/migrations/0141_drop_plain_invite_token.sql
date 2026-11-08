-- Migration 0141 (Vunnara, 8 Nov; live invite test follow-ups, part 5): the plain invite token column goes.
--
-- RUN AFTER THE PUSH THAT CARRIES IT IS LIVE, NEVER BEFORE (prod-fix 0141 run1 -> run3).
--
-- Migration 0134 stored each invite's token as its SHA-256 hash (org_members.invitation_token_hash) and kept
-- the plain column, with a trigger hashing anything written to it, while deployed code still named it. The
-- code from this push doesn't name it at all: it's gone from db/schema/org-members.ts and from every write
-- (tests/unit/auth/invite-token.test.ts checks nothing else in the code names it).
--
-- Why only after the push: Drizzle selects every column of its schema by name, so while the code before this
-- push is deployed, every read of org_members asks for invitation_token -- dropping it then would break every
-- membership query, sign-in and invite. Once this push is live nothing asks for it, and dropping it changes
-- nothing that runs. A pending invite needs only its hash, which every one has (0134 hashed the old tokens;
-- the trigger and the new code hashed every one since).
--
--   - org_members_profile_or_pending_invite (0131, widened by 0134): a row without a profile is a pending
--     invite with an address and a token's hash.
--   - The trigger and its function (0134) go with the column they kept in step.
--   - The column goes, and its unique constraint with it.
--
-- Idempotent.

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
