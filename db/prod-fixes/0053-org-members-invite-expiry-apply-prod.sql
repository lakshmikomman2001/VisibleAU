-- 0053-org-members-invite-expiry-apply-prod.sql (task #46, 15th follow-up)
--
-- Run on the PRODUCTION branch (Neon SQL editor) AFTER
-- 0053-...-precheck-prod.sql confirms the column is missing.
--
-- ⚠️ APPLY-BEFORE-PUSH: the new app/api/organizations/[orgId]/members/
-- accept/route.ts code in this commit reads org_members.expires_at
-- unconditionally. Deploying that code before this file is applied here
-- will 500 every invite-accept attempt in production (missing column) --
-- run this file FIRST, confirm the post-check below, THEN push/deploy.
--
-- Equivalent to local migration 0042_org_members_invite_expiry.sql, plus
-- one addition made while actually running this against prod: a
-- DB-level DEFAULT. The application code deployed at the time this file
-- runs (before the push that teaches members/invite/route.ts to set
-- expires_at explicitly) does not know this column exists -- without a
-- default, any insert into org_members in the gap between this apply and
-- the push (e.g. a new signup's owner-row insert via
-- lib/auth/server.ts's afterCreateOrganization hook) would fail the new
-- NOT NULL constraint. The post-push code still always sets expires_at
-- explicitly; the default only protects that gap and any insert path
-- that doesn't set it.
-- org_members is a small, low-write table (membership rows, not an
-- analytics table) -- a plain (non-CONCURRENTLY) transaction is fine,
-- no live-traffic table-lock concern like the ai_bot_ip_ranges index in
-- 0051.
BEGIN;

ALTER TABLE org_members ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE org_members
SET expires_at = COALESCE(invited_at, updated_at, now()) + interval '7 days'
WHERE expires_at IS NULL;

ALTER TABLE org_members ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days');

ALTER TABLE org_members ALTER COLUMN expires_at SET NOT NULL;

COMMIT;

-- POST-CHECK -- should show is_nullable = 'NO', zero remaining nulls, and
-- a column_default mentioning "now() + '7 days'".
SELECT
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'org_members' AND column_name = 'expires_at') AS is_nullable, -- expect 'NO'
  (SELECT count(*) FROM org_members WHERE expires_at IS NULL) AS remaining_nulls, -- expect 0
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'org_members' AND column_name = 'expires_at') AS column_default;
