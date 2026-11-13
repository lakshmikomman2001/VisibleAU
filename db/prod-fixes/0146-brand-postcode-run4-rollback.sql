-- 0146-brand-postcode-run4-rollback.sql (Sri's walk-through, 13 Nov, part 8): undoes run2.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). WRITES: drops brands.postcode and any postcodes
-- owners gave since (Google then uses the operator's postcode, or the suburb, city or state capital, as before).
-- Sri-authorized only; NOT run from Claude Code.
--
-- Only with the code from before this push deployed (never pushed, or reverted): the pushed code reads the column
-- on every read of brands.
BEGIN;

ALTER TABLE brands DROP CONSTRAINT IF EXISTS brands_postcode_four_digits;
ALTER TABLE brands DROP COLUMN IF EXISTS postcode;

COMMIT;
