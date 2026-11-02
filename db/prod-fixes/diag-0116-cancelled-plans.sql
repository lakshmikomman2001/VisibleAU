-- diag-0116-cancelled-plans.sql
-- "A cancelled plan must stop granting paid features everywhere" (Sri, 3 Nov)
--
-- PRODUCTION branch (Neon). READ-ONLY: SELECT statements only. Paste into
-- the Neon SQL editor. NOT run from Claude Code -- there is no prod access
-- from that environment. Sri-authorized only.
--
-- Run BEFORE the push. Today every plan gate reads subscriptions.tier and
-- ignores the status, so a cancelled workspace keeps what it paid for. From this
-- push on every gate reads lib/pricing/effective-tier.ts, and the workspaces in
-- query 2 become free at once: no data change, and none is needed.
--
-- Prints ids, plans, statuses, dates and counts only: no names, domains, emails,
-- URLs or Stripe ids.
--
-- Expected:
-- query 1 -- every subscription, by status and plan. Rows on manual test plans
--   show here too.
-- query 2 -- the workspaces this push takes to free. Empty means nobody loses
--   anything. Check any row that shouldn't be there before you push: an
--   ended status that was set by hand, say. Its brands and rows all stay; it
--   can't add brands, its schedules stop running, and its Agency pages lock.
-- query 3 -- not changed by this push, and your decision: a failed payment keeps
--   every paid gate open until Stripe ends the subscription.
-- query 4 -- rows whose stored period can't be real (under a day), from the old
--   checkout handler. Harmless: such a row keeps its plan until Stripe's
--   customer.subscription.deleted, and the next webhook after this push corrects it.

-- 1. Every subscription, by status and plan.
SELECT
  s.status AS subscription_status,
  s.tier AS subscription_tier,
  s.cancel_at_period_end,
  count(*) AS workspaces
FROM subscriptions s
GROUP BY s.status, s.tier, s.cancel_at_period_end
ORDER BY s.status, s.tier, s.cancel_at_period_end;

-- 2. Cancelled or ended, and still paid until this push: the row says a paid tier,
-- and either Stripe has ended it, or a scheduled cancellation's period has passed.
SELECT
  s.organization_id,
  o.deleted_at IS NOT NULL AS closed,
  s.tier AS subscription_tier,
  s.status AS subscription_status,
  o.tier AS organizations_tier,
  s.cancel_at_period_end,
  s.current_period_end,
  s.updated_at AS subscription_updated_at,
  (SELECT count(*) FROM brands b
    WHERE b.organization_id = s.organization_id AND b.deleted_at IS NULL) AS brands,
  (SELECT count(*) FROM audit_schedules a
    WHERE a.organization_id = s.organization_id AND a.status = 'active') AS active_schedules,
  (SELECT count(*) FROM client_portal_invites i
    WHERE i.organization_id = s.organization_id AND NOT i.is_revoked) AS open_portal_invites,
  (SELECT count(*) FROM org_members m
    WHERE m.organization_id = s.organization_id AND m.is_active) AS active_members
FROM subscriptions s
JOIN organizations o ON o.id = s.organization_id
WHERE s.tier <> 'free'
  AND (
    s.status IN ('canceled', 'incomplete_expired')
    OR (
      s.cancel_at_period_end
      AND s.current_period_end <= now()
      AND (s.current_period_start IS NULL
        OR s.current_period_end - s.current_period_start >= interval '1 day')
    )
  )
ORDER BY s.updated_at DESC;

-- 3. Your decision, not changed by this push: payment trouble, plan still open.
-- (The two weekly crons that join on status = 'active' already skip these.)
SELECT
  s.organization_id,
  o.deleted_at IS NOT NULL AS closed,
  s.tier AS subscription_tier,
  s.status AS subscription_status,
  s.cancel_at_period_end,
  s.current_period_end,
  s.updated_at AS subscription_updated_at
FROM subscriptions s
JOIN organizations o ON o.id = s.organization_id
WHERE s.status IN ('past_due', 'unpaid', 'paused', 'incomplete')
ORDER BY s.status, s.updated_at DESC;

-- 4. A stored period under a day long: the old checkout handler's, not Stripe's.
SELECT
  s.organization_id,
  s.status AS subscription_status,
  s.cancel_at_period_end,
  s.current_period_start,
  s.current_period_end
FROM subscriptions s
WHERE s.current_period_start IS NOT NULL
  AND s.current_period_end IS NOT NULL
  AND s.current_period_end - s.current_period_start < interval '1 day'
ORDER BY s.current_period_end DESC;
