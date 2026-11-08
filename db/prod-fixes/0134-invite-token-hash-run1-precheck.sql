-- 0134-invite-token-hash-run1-precheck.sql (follow-ups from 6e27afc..01a6a8c, part 4): before storing invite
-- tokens as hashes. Mirrors db/migrations/0134_invite_token_hash.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: one SELECT. Counts only -- no tokens, addresses or names. Sri runs it; NOT run from Claude
-- Code.
--
-- Order: run1 -> run2 -> run3, all BEFORE the push; push; run3 again; run2b once the push is verified;
-- run3 a last time. run4 only to undo run2, and only before run2b.
--
-- Expected result: one row --
--   hash_column_exists = f (t if run2 already ran), trigger_exists = f
--   sha256_available = t
--   tokens = rows holding a plain token (pending invites, and any accepted row old code left one on)
--   pending_tokens = of those, not accepted and not expired: the links run2 must keep working
--   duplicate_tokens = 0 (the column is unique already, so the hash index can be too)
--   pending_constraint_exists = t (0131's org_members_profile_or_pending_invite, which run2 widens)
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'org_members' AND column_name = 'invitation_token_hash'
  ) AS hash_column_exists,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.org_members'::regclass AND tgname = 'org_members_hash_invitation_token'
  ) AS trigger_exists,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'sha256') AS sha256_available,
  (SELECT count(*) FROM org_members WHERE invitation_token IS NOT NULL) AS tokens,
  (SELECT count(*) FROM org_members
   WHERE invitation_token IS NOT NULL AND accepted_at IS NULL AND expires_at > now()) AS pending_tokens,
  (SELECT count(*) FROM (
     SELECT invitation_token FROM org_members WHERE invitation_token IS NOT NULL
     GROUP BY invitation_token HAVING count(*) > 1
   ) d) AS duplicate_tokens,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.org_members'::regclass AND conname = 'org_members_profile_or_pending_invite'
  ) AS pending_constraint_exists;
