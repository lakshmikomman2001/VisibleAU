-- 0134-invite-token-hash-run2-apply.sql (follow-ups from 6e27afc..01a6a8c, part 4): store a hash of each
-- invite's token. Mirrors db/migrations/0134_invite_token_hash.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). WRITES: adds a column, a CHECK, a partial
-- unique index, a trigger and its function; fills the column for every row holding a token; widens 0131's
-- CHECK to take a hash in place of the token. Run after run1, BEFORE the push. Sri-authorized only; NOT
-- run from Claude Code. Undone by run4 (only before run2b).
--
-- Zero downtime: the code deployed now never reads the new column, and keeps writing and clearing the
-- plain token; the trigger keeps each hash in step with it. So an invite sent between run2 and the push
-- gets its hash from the trigger, and its link works after the push; one accepted in between has its
-- plain token cleared and keeps its hash, which the new code finds and refuses as used. The new code
-- needs the column, so the push must come after this, never before.
--
-- Takes a brief lock on org_members (a small table). Idempotent.
BEGIN;

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

COMMIT;
