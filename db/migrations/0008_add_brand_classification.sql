-- Migration: add brand classification and cached prompt pack
-- Safe: all columns nullable except classification_status which has a default

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS classification        JSONB,
  ADD COLUMN IF NOT EXISTS classification_status TEXT
    NOT NULL
    CHECK (classification_status IN ('pending','processing','complete','failed'))
    DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS classification_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prompt_pack           JSONB,
  ADD COLUMN IF NOT EXISTS prompt_pack_version   INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_brands_classification_status
  ON brands (classification_status)
  WHERE classification_status IN ('pending', 'failed');
