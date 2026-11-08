-- diag-0142-subscription-periods.sql (brand-feature locks and pricing claims, part 6, 8 Nov) -- whether each
-- Stripe subscription's stored period is a real one, and whether Stripe's subscription events reach us.
--
-- diag-0139 showed Splice's row (Agency Pro, active) with 24 Sep 2026 as both ends after its 24 Oct renewal.
-- Until 3 Nov (e0dbb8e) the handlers read the period off the subscription, which Stripe's API versions from
-- 2025-03-31 keep on the subscription items instead: checkout stored its own time as both ends, and the
-- renewal's customer.subscription.updated left them as they were. The code since 3 Nov reads the items; this
-- push also refuses a period whose end isn't after its start, and writes both ends or neither.
--
-- The 24 Oct event can't mend the row by being re-sent: the webhook route skips any event id it has already
-- processed (app/api/webhooks/stripe/route.ts, processed_webhook_events), and that one was. A NEW
-- customer.subscription.updated event does it -- the next renewal, or editing the subscription's metadata in
-- Stripe. Query 2 shows whether those events reach us at all.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: SELECTs only, in a READ ONLY transaction that ends in ROLLBACK. Workspace ids, plan names,
-- statuses, dates and counts only -- no names, addresses, Stripe ids or prices. Sri runs it; NOT run from
-- Claude Code. Run it before the metadata edit and again after it.
--
-- Expected:
--   1. Before: Splice's row with period_days = 0.0 and end_after_start = f. After the new event: its current
--      period (24 Oct to 24 Nov if it's billed monthly), end_after_start = t, period_end_passed = f.
--   2. customer.subscription.updated with a count above 0, one of them on 2026-10-24 (the renewal). If it's
--      0 in total, the endpoint isn't sent that event: add it to the endpoint's events in Stripe first.

BEGIN TRANSACTION READ ONLY;

-- 1. Each open workspace's Stripe subscription (by its id's shape; seeded and test rows left out): its stored
--    period, in UTC, how long it is, and whether it can be a real one.
SELECT
  o.id AS organization_id,
  s.tier AS subscription_tier,
  s.status AS subscription_status,
  s.billing_interval,
  s.cancel_at_period_end,
  to_char(s.current_period_start AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS period_start_utc,
  to_char(s.current_period_end AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS period_end_utc,
  round((extract(epoch FROM (s.current_period_end - s.current_period_start)) / 86400)::numeric, 1)
    AS period_days,
  (s.current_period_end > s.current_period_start) AS end_after_start,
  (s.current_period_end < now()) AS period_end_passed,
  s.created_at::date AS subscription_created,
  s.updated_at::date AS subscription_last_changed
FROM subscriptions s
JOIN organizations o ON o.id = s.organization_id AND o.deleted_at IS NULL
WHERE s.stripe_subscription_id ~ '^sub_[A-Za-z0-9]{14,}$'
  AND s.stripe_subscription_id NOT LIKE 'sub_test%'
ORDER BY s.current_period_end NULLS FIRST, o.created_at;

-- 2. The Stripe events the webhook route has processed, by type: in all, in the last 60 days, on the day of
--    Splice's renewal (24 Oct, Sydney), and the last day one came.
SELECT
  type,
  count(*) AS processed_in_all,
  count(*) FILTER (WHERE processed_at > now() - interval '60 days') AS processed_last_60_days,
  count(*) FILTER (
    WHERE (processed_at AT TIME ZONE 'Australia/Sydney')::date = DATE '2026-10-24'
  ) AS processed_on_24_oct,
  max(processed_at AT TIME ZONE 'Australia/Sydney')::date AS last_processed_sydney
FROM processed_webhook_events
GROUP BY type
ORDER BY type;

ROLLBACK;
