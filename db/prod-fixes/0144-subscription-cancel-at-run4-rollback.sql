-- 0144-subscription-cancel-at-run4-rollback.sql (mock-gate and retention follow-ups, part 8): undoes run2.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). WRITES: drops subscriptions.cancel_at and any dates
-- Stripe's events stored in it (they come back with Stripe's next event once re-added). Sri-authorized only; NOT
-- run from Claude Code.
--
-- Only with the code from before this push deployed (never pushed, or reverted): the pushed code reads the column
-- on every read of subscriptions.
BEGIN;

ALTER TABLE subscriptions DROP COLUMN IF EXISTS cancel_at;

COMMIT;
