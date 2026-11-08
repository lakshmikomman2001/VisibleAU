-- Migration 0134 (Vunnara, 8 Nov; follow-ups from 6e27afc..01a6a8c, part 4 -- Sri's decision 4): an
-- invite's token is stored only as its SHA-256 hash.
--
-- org_members.invitation_token held the token itself, so anyone who could read that column (a backup, a
-- query log, a person with production access) could accept every pending invite. Now the row holds
-- invitation_token_hash = sha256(token) as 64 hex characters, and the token exists only in the emailed
-- link: the app hashes the token it's given and looks the hash up (lib/auth/invite-token.ts).
--
--   - invitation_token_hash: lower-case hex (CHECK), unique where set.
--   - Every row that holds a token gets its hash now, so links already emailed keep working -- the old
--     21-character tokens and the newer 43-character ones alike.
--   - org_members_hash_invitation_token (trigger): while the plain column exists, any token written to it
--     gets its hash too. That keeps the code deployed before this one working between this migration and
--     the push: it writes and clears the plain token; the trigger keeps the hash in step.
--   - org_members_profile_or_pending_invite (0131) takes a hash in place of the token.
--   - Not here: clearing the plain tokens (a prod-fix after the push, once no deployed code reads them) and
--     dropping the column and the trigger (a later migration, once no deployed code writes the column).
--
-- sha256() is built into Postgres 11+. Idempotent.

ALTER TABLE org_members ADD COLUMN IF NOT EXISTS invitation_token_hash text;

DO $$
BEGIN
  ALTER TABLE org_members ADD CONSTRAINT org_members_invitation_token_hash_hex
    CHECK (invitation_token_hash ~ '^[0-9a-f]{64}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE org_members
SET invitation_token_hash = encode(sha256(convert_to(invitation_token, 'UTF8')), 'hex')
WHERE invitation_token IS NOT NULL
  AND invitation_token_hash IS DISTINCT FROM encode(sha256(convert_to(invitation_token, 'UTF8')), 'hex');

CREATE UNIQUE INDEX IF NOT EXISTS org_members_invitation_token_hash_idx
  ON org_members (invitation_token_hash)
  WHERE invitation_token_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION org_members_hash_invitation_token() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
  IF NEW.invitation_token IS NOT NULL THEN
    NEW.invitation_token_hash := encode(sha256(convert_to(NEW.invitation_token, 'UTF8')), 'hex');
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS org_members_hash_invitation_token ON org_members;
CREATE TRIGGER org_members_hash_invitation_token
  BEFORE INSERT OR UPDATE OF invitation_token ON org_members
  FOR EACH ROW EXECUTE FUNCTION org_members_hash_invitation_token();

ALTER TABLE org_members DROP CONSTRAINT IF EXISTS org_members_profile_or_pending_invite;
ALTER TABLE org_members ADD CONSTRAINT org_members_profile_or_pending_invite CHECK (
  user_id IS NOT NULL
  OR (
    invited_email IS NOT NULL
    AND (invitation_token IS NOT NULL OR invitation_token_hash IS NOT NULL)
    AND accepted_at IS NULL
    AND NOT is_active
  )
);
