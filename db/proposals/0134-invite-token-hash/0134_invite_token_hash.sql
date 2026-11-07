-- PROPOSAL (follow-ups from d247ba7..f13411d, part 3, 8 Nov): NOT applied, and not in db/migrations, so
-- nothing runs it. Sri decides; if yes, this file moves to db/migrations/ and the prod-fix files beside it
-- move to db/prod-fixes/.
--
-- Migration 0134: store a hash of each invite's token, not the token.
--
-- Today org_members.invitation_token holds the token itself: anyone who can read that column (a database
-- backup, a log of a query, a person with production access) can accept every pending invite. With this,
-- the table holds sha256(token) only, the way a password is kept: the link still works, because the app
-- hashes the token it's given and looks that up, but nothing stored can be used as a link.
--
-- Step 1 (this file): add invitation_token_hash, fill it for every pending token, index it. Nothing reads
-- it yet, so the code running now is unaffected.
-- Step 2 (code, after Sri's decision): new invites store the hash and leave invitation_token NULL; every
-- lookup is by organization_id and the hash (lib/auth/invite-token.ts would hash the given token). Equality
-- on a hash leaks nothing about the token, so the constant-time scan in the app becomes belt and braces.
-- Step 3 (a later prod-fix, after step 2 is live): NULL the old plain tokens; later still, drop the column.
--
-- sha256() is built into Postgres 11+; no extension needed. Idempotent.
BEGIN;

ALTER TABLE org_members ADD COLUMN IF NOT EXISTS invitation_token_hash bytea;

UPDATE org_members
SET invitation_token_hash = sha256(convert_to(invitation_token, 'UTF8'))
WHERE invitation_token IS NOT NULL AND invitation_token_hash IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS org_members_invitation_token_hash_idx
  ON org_members (invitation_token_hash)
  WHERE invitation_token_hash IS NOT NULL;

COMMIT;
