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
-- Equivalent to local migration 0042_org_members_invite_expiry.sql.
-- org_members is a small, low-write table (membership rows, not an
-- analytics table) -- a plain (non-CONCURRENTLY) transaction is fine,
-- no live-traffic table-lock concern like the ai_bot_ip_ranges index in
-- 0051.
BEGIN;

ALTER TABLE org_members ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE org_members
SET expires_at = COALESCE(invited_at, updated_at, now()) + interval '7 days'
WHERE expires_at IS NULL;

ALTER TABLE org_members ALTER COLUMN expires_at SET NOT NULL;

COMMIT;

-- POST-CHECK -- should show is_nullable = 'NO' and zero remaining nulls.
SELECT
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'org_members' AND column_name = 'expires_at') AS is_nullable, -- expect 'NO'
  (SELECT count(*) FROM org_members WHERE expires_at IS NULL) AS remaining_nulls; -- expect 0
