-- diag-0140-auth-rate-limits.sql (brand-feature locks and pricing claims, part 5, 8 Nov) -- what better-auth's
-- shared sign-in counts (auth_rate_limits, migration 0140, pushed with 936c163) hold.
--
-- Each row is one caller's count on one route: key = "<IP address>|<path>" (better-auth 1.6.14,
-- @better-auth/core createRateLimitKey), count, last_request (milliseconds since the epoch). better-auth never
-- deletes a row. From this push, the daily cleanup (inngest/functions/sample-audit-cleanup.ts) deletes the
-- ones whose last request is more than 24 hours old, and only these routes keep a count: sign-in, sign-up,
-- change-password, change-email, request-password-reset, forget-password, reset-password,
-- send-verification-email (lib/auth/rate-limit-rules.ts). Before it, every /api/auth/* route did.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: SELECTs only, in a READ ONLY transaction that ends in ROLLBACK. Counts, paths and ages only --
-- no keys, no addresses. Sri runs it; NOT run from Claude Code.
--
-- Expected:
--   1. rows_older_than_24h: anything up to the first daily run after this push; 0 the day after it.
--      keys_without_an_address: 0 -- a key whose first part isn't an IP address would be a counter shared by
--      every caller. keys_with_a_loopback_address: 0 -- 127.0.0.1 or ::1 is the address better-auth uses
--      for a request without one in development and tests, never in production.
--   2. One row per path: after this push, new rows only for the routes listed above.

BEGIN TRANSACTION READ ONLY;

-- 1. Totals.
WITH parts AS (
  SELECT
    split_part(key, '|', 1) AS address,
    last_request,
    count
  FROM auth_rate_limits
)
SELECT
  count(*) AS rows_in_total,
  count(*) FILTER (
    WHERE last_request < (extract(epoch FROM now()) * 1000)::bigint - 86400000
  ) AS rows_older_than_24h,
  count(*) FILTER (
    WHERE address !~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' AND address !~ '^[0-9A-Fa-f:.]*:[0-9A-Fa-f:.]*$'
  ) AS keys_without_an_address,
  count(*) FILTER (WHERE address IN ('127.0.0.1', '::1')) AS keys_with_a_loopback_address,
  max(count) AS highest_count,
  round(
    max((extract(epoch FROM now()) * 1000 - last_request) / 3600000.0)::numeric,
    1
  ) AS oldest_row_hours
FROM parts;

-- 2. By path: how many callers' counts each route keeps, and how old the oldest is.
SELECT
  split_part(key, '|', 2) AS path,
  count(*) AS rows,
  count(*) FILTER (
    WHERE last_request < (extract(epoch FROM now()) * 1000)::bigint - 86400000
  ) AS older_than_24h,
  round(
    max((extract(epoch FROM now()) * 1000 - last_request) / 3600000.0)::numeric,
    1
  ) AS oldest_hours
FROM auth_rate_limits
GROUP BY 1
ORDER BY rows DESC, path;

ROLLBACK;
