-- 0144-subscription-cancel-at-run2-apply.sql (mock-gate and retention follow-ups, part 8): adds
-- subscriptions.cancel_at, Stripe's scheduled cancellation date. Mirrors
-- db/migrations/0144_subscription_cancel_at.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). WRITES: schema only -- one nullable column, no
-- default, no row changed. Run after run1, BEFORE the push. Sri-authorized only; NOT run from Claude Code.
-- Undone by run4.
--
-- Zero downtime: the code deployed now never names the column. Idempotent.
BEGIN;

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at timestamptz;

COMMIT;
