-- 0151-vertical-local-business-run2-apply.sql (16 Nov, part 4): the vertical enum gains 'local_business' (the
-- wizard's "Other local business"). Mirrors db/migrations/0151_vertical_local_business.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- WRITES (schema only: one enum value). Sri runs it after run1; NOT run from Claude Code. BEFORE the push.
--
-- Run it on its own, outside an explicit BEGIN: ALTER TYPE ... ADD VALUE commits by itself and the value can't be
-- used in the transaction that adds it. IF NOT EXISTS makes a re-run harmless. No row changes; RLS and grants are
-- untouched (an enum value carries neither).
ALTER TYPE "public"."vertical" ADD VALUE IF NOT EXISTS 'local_business';
