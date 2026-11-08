-- Migration 0140 (Vunnara, 8 Nov; live invite test follow-ups, part 5): better-auth's own rate limits --
-- sign-in, sign-up, password reset, verification emails -- are kept in Postgres, so every serverless
-- instance counts the same requests.
--
-- better-auth limits those routes in production (lib/auth/server.ts rateLimit; its defaults: 3 sign-in or
-- sign-up attempts per 10 seconds, 3 reset or verification requests a minute, per caller and route). Its
-- store was each instance's memory, so a caller spread over N instances had N times the allowance. With
-- rateLimit.storage = "database" it reads and writes this table, through the same adapter as its other
-- tables (better-auth's model "rateLimit": key, count, lastRequest).
--
--   - auth_rate_limits: one row per caller and route (key), its count in the current window and when the
--     last request came (milliseconds since the epoch, as better-auth writes it). better-auth never deletes
--     a row; it resets the count when the window has passed.
--   - No row-level security: it holds no workspace's data, and only better-auth reads it, through the
--     service connection.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id text PRIMARY KEY,
  key text NOT NULL CONSTRAINT auth_rate_limits_key_unique UNIQUE,
  count integer NOT NULL,
  last_request bigint NOT NULL
);
