-- 0141-drop-plain-invite-token-run4-rollback.sql (live invite test follow-ups, part 5): puts back what run2
-- removed, empty.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). WRITES: re-adds org_members.invitation_token
-- (empty, unique), 0134's trigger and its function, and 0134's CHECK (a token or its hash). Sri-authorized
-- only; NOT run from Claude Code.
--
-- Only needed if code that names the column is deployed again (a revert to before this push). The plain
-- tokens themselves don't come back -- run2 dropped them, and 0134's run2b would have cleared them anyway --
-- so invites keep working by their hash, which every deployed version since 0134 reads.
BEGIN;

ALTER TABLE org_members ADD COLUMN IF NOT EXISTS invitation_token text;

DO $$
BEGIN
  ALTER TABLE org_members ADD CONSTRAINT org_members_invitation_token_unique UNIQUE (invitation_token);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

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

COMMIT;
