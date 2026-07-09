-- Sprint 6: brands.brand_token ALTER for Visit API auth
-- MI-01: fully idempotent -- safe to re-run

ALTER TABLE brands ADD COLUMN IF NOT EXISTS brand_token TEXT UNIQUE;

-- Backfill existing brands with nanoid(32) tokens
-- Uses gen_random_uuid() as a fallback since nanoid isn't available in pure SQL;
-- the application layer generates proper nanoid(32) for new brands.
DO $$
BEGIN
  UPDATE brands
  SET brand_token = replace(replace(encode(gen_random_uuid()::text::bytea, 'base64'), '/', '_'), '+', '-')
  WHERE brand_token IS NULL;
END $$;
