-- 0134-invite-token-hash-run1-precheck.sql -- PROPOSAL, not applied (see 0134_invite_token_hash.sql
-- beside it). Only if Sri decides to store hashes of invite tokens.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). READ-ONLY: one SELECT. Run FIRST, then
-- run2, then run3 -- all BEFORE the code that reads the hash is pushed. Sri runs it; NOT run from Claude
-- Code. Counts only; no tokens or addresses.
--
-- Expected result: one row --
--   hash_column_exists = f (t if run2 already ran)
--   sha256_available = t (Postgres 11+)
--   tokens = how many org_members rows hold a token (pending invites, plus any left by old code)
--   pending_tokens = of those, not accepted and not expired
--   duplicate_tokens = 0 (the column is unique already, so the hash index can be too)
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'org_members' AND column_name = 'invitation_token_hash'
  ) AS hash_column_exists,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'sha256') AS sha256_available,
  (SELECT count(*) FROM org_members WHERE invitation_token IS NOT NULL) AS tokens,
  (SELECT count(*) FROM org_members
   WHERE invitation_token IS NOT NULL AND accepted_at IS NULL AND expires_at > now()) AS pending_tokens,
  (SELECT count(*) FROM (
     SELECT invitation_token FROM org_members WHERE invitation_token IS NOT NULL
     GROUP BY invitation_token HAVING count(*) > 1
   ) d) AS duplicate_tokens;
