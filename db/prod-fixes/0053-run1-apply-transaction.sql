-- 0053 RUN 1 of 2 -- PRODUCTION branch. Adds org_members.expires_at (one transaction).
-- Run AFTER 0053-...-precheck-prod.sql shows column_missing_as_expected = t.
-- Expected: "Statement executed successfully" on every tab. Then run 0053-run2.
--
-- One line added vs Claude Code's apply file: a DB-level DEFAULT. The code
-- live right now (56316a1) doesn't know about expires_at, so without a
-- default, any insert into org_members between this apply and the push
-- (e.g. a new signup creating its org's owner membership) would fail the
-- NOT NULL. The new code still sets expires_at explicitly, so the default
-- only protects older code and any insert path that doesn't set it.
BEGIN;

ALTER TABLE org_members ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE org_members
SET expires_at = COALESCE(invited_at, updated_at, now()) + interval '7 days'
WHERE expires_at IS NULL;

ALTER TABLE org_members ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days');

ALTER TABLE org_members ALTER COLUMN expires_at SET NOT NULL;

COMMIT;
