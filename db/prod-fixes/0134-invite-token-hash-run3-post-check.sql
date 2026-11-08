-- 0134-invite-token-hash-run3-post-check.sql (follow-ups from 6e27afc..01a6a8c, part 4).
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). READ-ONLY: one SELECT. Counts only. Sri
-- runs it; NOT run from Claude Code. Run after run2, again after the push, and again after run2b.
--
-- Expected result: one row --
--   hash_column_exists = t, hash_index_exists = t, trigger_exists = t, hex_check_exists = t,
--   pending_constraint_takes_hash = t
--   tokens_without_hash = 0 and hashes_not_matching = 0 (every plain token has its own hash)
--   pending_without_any_key = 0 (every pending invite can still be opened)
--   hash_only_rows: 0 before the push; > 0 once an invite is sent by the new code
--   plain_tokens: as in run1 before run2b; 0 after it
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'org_members' AND column_name = 'invitation_token_hash'
  ) AS hash_column_exists,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'org_members_invitation_token_hash_idx'
  ) AS hash_index_exists,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.org_members'::regclass AND tgname = 'org_members_hash_invitation_token'
  ) AS trigger_exists,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.org_members'::regclass AND conname = 'org_members_invitation_token_hash_hex'
  ) AS hex_check_exists,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.org_members'::regclass AND conname = 'org_members_profile_or_pending_invite'
      AND pg_get_constraintdef(oid) LIKE '%invitation_token_hash%'
  ) AS pending_constraint_takes_hash,
  (SELECT count(*) FROM org_members
   WHERE invitation_token IS NOT NULL AND invitation_token_hash IS NULL) AS tokens_without_hash,
  (SELECT count(*) FROM org_members
   WHERE invitation_token IS NOT NULL
     AND invitation_token_hash <> encode(sha256(convert_to(invitation_token, 'UTF8')), 'hex'))
    AS hashes_not_matching,
  (SELECT count(*) FROM org_members
   WHERE accepted_at IS NULL AND expires_at > now()
     AND invitation_token IS NULL AND invitation_token_hash IS NULL) AS pending_without_any_key,
  (SELECT count(*) FROM org_members
   WHERE invitation_token IS NULL AND invitation_token_hash IS NOT NULL) AS hash_only_rows,
  (SELECT count(*) FROM org_members WHERE invitation_token IS NOT NULL) AS plain_tokens;
