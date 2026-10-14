-- 0053-org-members-invite-expiry-rollback-prod.sql (task #46, 15th follow-up)
--
-- Only run this if 0053-...-apply-prod.sql needs to be reverted AND the
-- app code reading expires_at has already been rolled back first --
-- dropping the column while the new members/accept/route.ts is still
-- live would 500 every invite-accept attempt (missing column), the
-- same failure mode the apply file's header warns about in reverse.
-- Purely additive column, no index/FK depends on it -- safe to drop
-- outright, no data other than this column itself is lost.
ALTER TABLE org_members DROP COLUMN IF EXISTS expires_at;
