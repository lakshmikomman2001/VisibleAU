-- 0134-invite-token-hash-run2b-after-push-clear-plain-tokens.sql (follow-ups from 6e27afc..01a6a8c, part 4):
-- the last plain invite tokens go, so a token exists only in the link that was emailed.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). WRITES: clears org_members.invitation_token
-- on every row, and the hash on rows already accepted (a used link has nothing left to match). Run AFTER
-- the push, once it's verified (an invite sent from production stores a hash only: run3's hash_only_rows
-- > 0). Sri-authorized only; NOT run from Claude Code.
--
-- The point of no return for the code: after this, the code from before the push can't find any invite
-- (it reads only the plain column), so reverting the push would break every pending link. Don't run it
-- until the push is staying. The column and the trigger are dropped by a later migration, once no deployed
-- code writes the column; until then the trigger hashes anything written to it.
--
-- Pending invites keep working: their hashes were written by run2 or by the trigger. Idempotent.
BEGIN;

UPDATE org_members SET invitation_token = NULL WHERE invitation_token IS NOT NULL;
UPDATE org_members SET invitation_token_hash = NULL
WHERE accepted_at IS NOT NULL AND invitation_token_hash IS NOT NULL;

COMMIT;
