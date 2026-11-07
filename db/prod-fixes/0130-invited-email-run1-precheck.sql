-- 0130-invited-email-run1-precheck.sql (Vunnara, 7 Nov, team follow-ups item 1:
-- pending invites show who they're for)
--
-- PRODUCTION branch (Neon). READ-ONLY. Run BEFORE run2-apply.sql, and BEFORE
-- pushing the code that writes the column -- the invite route inserts and
-- updates org_members.invited_email, so every invite (new or re-sent) would
-- fail (42703, column does not exist) until run2 has run.
-- Mirrors db/migrations/0130_org_member_invited_email.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- No backup step: the migration only adds a nullable column; no existing value
-- changes. (The optional run2b fills it for pending invites: its own header
-- says what.)
--
-- Expected result: one row -- invited_email_present = f; the membership rows;
-- the invites still pending; and how many of those are for someone whose
-- profile is in another workspace (the Team page shows those with a role and
-- no address until this change and run2b). Counts only.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'org_members' AND column_name = 'invited_email'
  ) AS invited_email_present,
  (SELECT count(*) FROM org_members) AS member_rows,
  (SELECT count(*) FROM org_members WHERE accepted_at IS NULL) AS pending_invites,
  (SELECT count(*)
   FROM org_members m
   JOIN users u ON u.id = m.user_id
   WHERE m.accepted_at IS NULL AND u.organization_id <> m.organization_id) AS pending_for_other_workspace;
