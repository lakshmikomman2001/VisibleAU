-- 0141-drop-plain-invite-token-run3-post-check.sql (live invite test follow-ups, part 5).
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). READ-ONLY: one SELECT. Counts only. Sri runs it;
-- NOT run from Claude Code. Run after run2.
--
-- Expected result: one row --
--   plain_column_exists = f, trigger_exists = f, function_exists = f
--   constraint_needs_hash = t
--   pending_invites: as before run2 (nothing else changed), every one with a hash (pending_without_hash = 0)
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'org_members' AND column_name = 'invitation_token'
  ) AS plain_column_exists,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.org_members'::regclass AND tgname = 'org_members_hash_invitation_token'
  ) AS trigger_exists,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'org_members_hash_invitation_token') AS function_exists,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.org_members'::regclass AND conname = 'org_members_profile_or_pending_invite'
      AND pg_get_constraintdef(oid) LIKE '%invitation_token_hash IS NOT NULL%'
      AND pg_get_constraintdef(oid) NOT LIKE '%invitation_token IS NOT NULL%'
  ) AS constraint_needs_hash,
  (SELECT count(*) FROM org_members WHERE accepted_at IS NULL AND expires_at > now()) AS pending_invites,
  (SELECT count(*) FROM org_members WHERE user_id IS NULL AND invitation_token_hash IS NULL)
    AS pending_without_hash;
