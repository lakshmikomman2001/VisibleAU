-- diag-0139-splice-subscription-state.sql (live invite test follow-ups, part 3, 8 Nov) -- why Splice's
-- billing page says "Next renewal 24 Sep 2026", a date already past.
--
-- The billing page (app/(auth)/settings/billing/page.tsx) showed subscriptions.current_period_end as "Next
-- renewal" for any workspace whose plan isn't free (lib/pricing/effective-tier.ts tierOfSubscription), with
-- no check that the date is still ahead or that Stripe renews the plan at all. Stripe's webhooks
-- (lib/stripe/webhook-handlers/subscription-period.ts, subscription-updated.ts) are what move the date on.
-- So a past date there means one of: a renewal Stripe made but whose webhook never updated the row, a
-- subscription Stripe isn't renewing (test mode, or ended without the event reaching us), or a row
-- written by hand.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: one SELECT in a READ ONLY transaction that ends in ROLLBACK. Workspace ids, plan names,
-- statuses and dates only -- no names, addresses, Stripe ids or prices. Sri runs it; NOT run from Claude
-- Code.
--
-- One row per open workspace whose plan isn't free (by its subscription row, or by the workspace's own
-- organizations.tier, which nothing reads any more). Read it as:
--   set_by = 'Stripe checkout (webhook)' and period_end_passed = t and status = active: a renewal webhook
--     was missed, or Stripe stopped renewing -- check the subscription in the Stripe dashboard (live mode).
--   set_by = 'manual (not a Stripe id)' or 'test or seed': no Stripe subscription renews it; the page now
--     says "Plan set by Vunnara, no automatic renewal".
--   last_changed_before_period_end = t: nothing has touched the row since before its period ended.

BEGIN TRANSACTION READ ONLY;

SELECT
  o.id AS organization_id,
  o.created_at::date AS workspace_created,
  o.tier::text AS workspace_tier_column,
  s.tier AS subscription_tier,
  s.status AS subscription_status,
  s.current_period_start::date AS period_start,
  s.current_period_end::date AS period_end,
  (s.current_period_end < now()) AS period_end_passed,
  s.cancel_at_period_end,
  coalesce(
    s.stripe_subscription_id ~ '^sub_[A-Za-z0-9]{14,}$' AND s.stripe_subscription_id NOT LIKE 'sub_test%',
    false
  ) AS has_stripe_subscription_id,
  CASE
    WHEN s.id IS NULL THEN 'workspace tier column only (no subscription row)'
    WHEN s.stripe_subscription_id LIKE 'sub_test%' OR s.stripe_customer_id LIKE 'cus_test%'
      OR s.stripe_price_id LIKE 'price_test%' THEN 'test or seed'
    WHEN s.stripe_subscription_id ~ '^sub_[A-Za-z0-9]{14,}$' THEN 'Stripe checkout (webhook)'
    ELSE 'manual (not a Stripe id)'
  END AS set_by,
  s.created_at::date AS subscription_created,
  s.updated_at::date AS subscription_last_changed,
  (s.updated_at < s.current_period_end AND s.current_period_end < now())
    AS last_changed_before_period_end,
  s.metadata = '{}'::jsonb AS metadata_empty
FROM organizations o
LEFT JOIN subscriptions s ON s.organization_id = o.id
WHERE o.deleted_at IS NULL
  AND (
    o.tier::text <> 'free'
    OR (s.id IS NOT NULL AND s.tier <> 'free' AND s.status NOT IN ('canceled', 'incomplete_expired'))
  )
ORDER BY s.current_period_end NULLS FIRST, o.created_at;

ROLLBACK;
