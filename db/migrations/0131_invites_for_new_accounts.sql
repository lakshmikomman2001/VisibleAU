-- Migration 0131 (Vunnara, 8 Nov, team follow-ups item 4): an invite to an address that has no account yet.
--
-- An invite was an org_members row pointing at the invitee's profile (users), so inviting an address that
-- had never signed up answered "User not found". Now such an invite is a row with no profile yet:
-- user_id NULL, the address in invited_email (migration 0130), a token, still pending. Signing up through
-- its link links the new account to it by that token, in one transaction (app/api/invites/[orgId]/[token]/
-- sign-up/route.ts): the profile is made in the inviting workspace and user_id set. Nothing is ever looked
-- up by the address alone.
--
--   - user_id loses NOT NULL.
--   - org_members_profile_or_pending_invite: a row without a profile is a pending invite with an address
--     and a token -- an accepted or active membership always has one.
--   - org_members_pending_address_idx: one such invite per address per workspace (re-inviting re-sends it).
--
-- Idempotent. Every existing row has a user_id, so the constraint holds for all of them.

ALTER TABLE org_members ALTER COLUMN user_id DROP NOT NULL;

DO $$
BEGIN
  ALTER TABLE org_members ADD CONSTRAINT org_members_profile_or_pending_invite CHECK (
    user_id IS NOT NULL
    OR (invited_email IS NOT NULL AND invitation_token IS NOT NULL AND accepted_at IS NULL AND NOT is_active)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS org_members_pending_address_idx
  ON org_members (organization_id, lower(invited_email))
  WHERE user_id IS NULL;
