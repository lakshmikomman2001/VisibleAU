-- Migration 0130 (Vunnara, 7 Nov, team follow-ups item 1): the address each team invite was sent to.
--
-- The Team page's pending invites showed only a role. An invite is an org_members row pointing at the
-- invitee's profile (users), and that profile lives in the invitee's own workspace, which the inviting
-- workspace's RLS context can't read (users_org_select), so the members list got NULL for its email.
-- org_members.invited_email is the address the invite route emailed, written with the invite and again on
-- every resend: a pending invite says who it's for without reading another workspace's profile.
--
-- Nullable, no default, no backfill here: NULL for a workspace owner's own membership (never invited) and
-- for every row from before this migration. prod-fix 0130-invited-email-run2b-backfill-pending.sql is the
-- optional step that fills it for invites still pending.

ALTER TABLE org_members ADD COLUMN IF NOT EXISTS invited_email text;
