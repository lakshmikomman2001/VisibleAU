-- 0141-drop-plain-invite-token-run1-precheck.sql (live invite test follow-ups, part 5): before the plain invite
-- token column goes. Mirrors db/migrations/0141_drop_plain_invite_token.sql.
--
-- RUN AFTER THE PUSH THAT CARRIES IT IS LIVE, NEVER BEFORE. Until then the deployed code names the column in
-- every read of org_members (Drizzle lists every column), so dropping it would break every membership query.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: one SELECT. Counts only -- no tokens, hashes or addresses. Sri runs it; NOT run from Claude Code.
--
-- Order: the push is live -> run1 -> run2 -> run3. run4 only to put the (empty) column back.
--
-- Expected result: one row --
--   plain_column_exists = t (f if run2 already ran), trigger_exists = t
--   pending_without_hash = 0: every pending invite can be opened by its hash alone. If it isn't 0, stop: the
--     constraint run2 adds would refuse those rows (re-send them from the Team page, then run1 again)
--   plain_tokens: rows still holding a plain token (0 after 0134's run2b; any left go with the column, which
--     is what 0134's run2b would have done)
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'org_members' AND column_name = 'invitation_token'
  ) AS plain_column_exists,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.org_members'::regclass AND tgname = 'org_members_hash_invitation_token'
  ) AS trigger_exists,
  (SELECT count(*) FROM org_members
   WHERE user_id IS NULL AND invitation_token_hash IS NULL) AS pending_without_hash,
  (SELECT count(*) FROM org_members
   WHERE to_jsonb(org_members) ->> 'invitation_token' IS NOT NULL) AS plain_tokens;
