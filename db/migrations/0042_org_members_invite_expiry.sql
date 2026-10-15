-- Migration 0042 (task #46, 15th follow-up): org_members has no invite
-- expiry at all -- app/api/organizations/[orgId]/members/accept/route.ts's
-- own error message ("Invalid or expired invitation") already implied one,
-- but nothing in the schema backed it, so a raw invitation_token never
-- actually expired. Adding expires_at as NOT NULL (no silently-unenforced
-- nullable column) backfilled from invited_at + 7 days for every existing
-- row -- a fixed, generous window matching how long an email invite
-- realistically sits unread, applied uniformly to already-accepted rows
-- too (harmless there; the accept route only reads expires_at for
-- still-pending rows). COALESCE guards invited_at/updated_at both being
-- null, which shouldn't happen in practice (the invite route always sets
-- invited_at) but keeps the backfill correct either way.
ALTER TABLE org_members ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE org_members
SET expires_at = COALESCE(invited_at, updated_at, now()) + interval '7 days'
WHERE expires_at IS NULL;

-- Added while running the prod equivalent of this file (see
-- db/prod-fixes/0053-org-members-invite-expiry-apply-prod.sql): a
-- DB-level default protects any insert into org_members that runs before
-- the app code is deployed to set expires_at explicitly (e.g. a new
-- signup's owner-row insert). Harmless here too -- the app always sets
-- it explicitly once deployed; this is a safety net, not the primary
-- mechanism.
ALTER TABLE org_members ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days');

ALTER TABLE org_members ALTER COLUMN expires_at SET NOT NULL;
