-- 0144-subscription-cancel-at-run1-precheck.sql (mock-gate and retention follow-ups, part 8): before
-- subscriptions keeps Stripe's scheduled cancellation date. Mirrors db/migrations/0144_subscription_cancel_at.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: SELECTs only. Sri runs it; NOT run from Claude Code.
--
-- Order: run1 -> run2 -> run3, all BEFORE the push. The pushed code selects subscriptions.cancel_at on every read
-- of the table (Drizzle names every column), so without it the billing page, every plan gate and the Stripe
-- webhook fail. run4 only to undo run2, with the code from before this push deployed.

-- 1. Expected: column_exists = f (t if run2 already ran).
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'cancel_at'
) AS column_exists;

-- 2. Context: the subscriptions Stripe may have scheduled to cancel. A row here with cancel_at_period_end = f
--    is one whose cancellation is on a fixed date the app couldn't see (Splice's sandbox subscription: Stripe
--    says "Auto-cancels 23 Dec 2026"). After the push, the next customer.subscription.updated event for it
--    stores the date; to get one now, edit the subscription's metadata in Stripe (a re-sent old event is
--    skipped as a duplicate).
SELECT organization_id, stripe_subscription_id, tier, status, cancel_at_period_end, current_period_end
FROM subscriptions
WHERE status NOT IN ('canceled', 'incomplete_expired')
ORDER BY updated_at DESC;
