-- 0144-subscription-cancel-at-run3-post-check.sql (mock-gate and retention follow-ups, part 8): after run2.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). READ-ONLY. Sri runs it; NOT run from Claude Code.

-- Expected: one row -- data_type = timestamp with time zone, is_nullable = YES, column_default empty.
SELECT data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'cancel_at';

-- Expected: 0 -- nothing has written a date yet (the pushed handlers do, from Stripe's next event).
SELECT count(*) AS rows_with_cancel_at FROM subscriptions WHERE cancel_at IS NOT NULL;
