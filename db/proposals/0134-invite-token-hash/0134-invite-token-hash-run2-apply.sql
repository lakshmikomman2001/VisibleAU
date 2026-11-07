-- 0134-invite-token-hash-run2-apply.sql -- PROPOSAL, not applied (see 0134_invite_token_hash.sql beside
-- it). Only if Sri decides to store hashes of invite tokens.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). WRITES: adds a column, fills it for every
-- row holding a token, adds a partial unique index. Run after run1, BEFORE the code that reads the hash is
-- pushed; the code running now never reads the column. Sri-authorized only; NOT run from Claude Code.
-- Mirrors db/proposals/0134-invite-token-hash/0134_invite_token_hash.sql. Undone by run4.
--
-- Takes a brief lock on org_members (a small table). Idempotent.
BEGIN;

ALTER TABLE org_members ADD COLUMN IF NOT EXISTS invitation_token_hash bytea;

UPDATE org_members
SET invitation_token_hash = sha256(convert_to(invitation_token, 'UTF8'))
WHERE invitation_token IS NOT NULL AND invitation_token_hash IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS org_members_invitation_token_hash_idx
  ON org_members (invitation_token_hash)
  WHERE invitation_token_hash IS NOT NULL;

COMMIT;
