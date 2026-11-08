-- 0140-auth-rate-limits-run4-rollback.sql (live invite test follow-ups, part 5): undoes run2.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). WRITES: drops auth_rate_limits (its counts are
-- only ever minutes old). Sri-authorized only; NOT run from Claude Code.
--
-- Only with the code from before this push deployed (never pushed, or reverted): the pushed code reads the
-- table on every sign-in, sign-up and reset request, which would fail without it.
BEGIN;

DROP TABLE IF EXISTS auth_rate_limits;

COMMIT;
