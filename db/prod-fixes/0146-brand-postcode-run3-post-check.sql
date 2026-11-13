-- 0146-brand-postcode-run3-post-check.sql (Sri's walk-through, 13 Nov, part 8): after run2.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). READ-ONLY. Sri runs it; NOT run from Claude Code.

-- Expected: one row -- data_type = text, is_nullable = YES, column_default empty.
SELECT data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'postcode';

-- Expected: one row -- the CHECK, "CHECK (((postcode IS NULL) OR (postcode ~ '^[0-9]{4}$'::text)))".
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname = 'brands_postcode_four_digits';

-- Expected: 0 -- nothing has written a postcode yet (owners add theirs after the push).
SELECT count(*) AS brands_with_postcode FROM brands WHERE postcode IS NOT NULL;
