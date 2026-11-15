-- 0151-vertical-local-business-run4-rollback.sql (16 Nov, part 4): undo run2 -- ONLY with the code from before this
-- push deployed, and only while no row uses 'local_business'.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- WRITES (schema). Sri runs it; NOT run from Claude Code.
--
-- Postgres can't drop an enum value, so this rebuilds the type without it: rename the old type, create the five-value
-- type, move the two columns onto it, drop the old one. It stops, changing nothing, if any brand or pack uses the value
-- (move those brands to another vertical first: UPDATE brands SET vertical = 'tradies' WHERE ... -- choose per brand).
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM brands WHERE vertical::text = 'local_business')
     OR EXISTS (SELECT 1 FROM vertical_packs WHERE vertical::text = 'local_business') THEN
    RAISE EXCEPTION 'rows still use vertical local_business: move them to another vertical first';
  END IF;
END $$;

ALTER TYPE "public"."vertical" RENAME TO "vertical_0151_old";
CREATE TYPE "public"."vertical" AS ENUM ('tradies', 'allied_health', 'saas', 'professional_services', 'real_estate');
ALTER TABLE "public"."brands" ALTER COLUMN "vertical" TYPE "public"."vertical" USING "vertical"::text::"public"."vertical";
ALTER TABLE "public"."vertical_packs" ALTER COLUMN "vertical" TYPE "public"."vertical" USING "vertical"::text::"public"."vertical";
DROP TYPE "public"."vertical_0151_old";

-- Expected: tradies, allied_health, saas, professional_services, real_estate.
SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS vertical_values
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'vertical';

COMMIT;
