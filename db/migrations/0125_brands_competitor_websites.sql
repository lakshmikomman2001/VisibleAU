-- Migration 0125 (Vunnara, 7 Nov, "Fair competitor counting", Sri's
-- decision 4): each configured competitor's own website, so a mention of
-- the competitor can be verified the way the brand's is -- its site among
-- the sources the answer cited (lib/audit/verify-mention.ts).
--
-- brands.competitor_websites: { "<competitor name as in brands.competitors>":
--   "<host, e.g. rivalplumbing.com.au>" }. Set in brand settings; written
--   only by PATCH /api/brands/[brandId], which keeps the keys to the
--   brand's current competitors. A competitor with no entry can't be
--   verified, and share of voice leaves it out and says so
--   (lib/visibility/share-of-voice.ts).
--
-- NOT NULL DEFAULT '{}': on Postgres 11+ a constant default is stored once
-- in the catalog, so existing rows aren't rewritten. No backfill: no
-- competitor has a website until someone adds one.

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS competitor_websites jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'brands_competitor_websites_is_object'
  ) THEN
    ALTER TABLE brands
      ADD CONSTRAINT brands_competitor_websites_is_object
      CHECK (jsonb_typeof(competitor_websites) = 'object');
  END IF;
END $$;
