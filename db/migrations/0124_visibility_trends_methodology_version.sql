-- Migration 0124 (Vunnara, 6 Nov, "Mention detection", part 6): which
-- methodology a weekly/monthly visibility trend row's averages come from.
--
-- visibility_trends.methodology_version: the audits' methodology version
--   (lib/llm/methodology.ts) that lib/visibility/visibility-trend-
--   aggregator.ts averaged. A period with audits under more than one
--   version averages only its newest. lib/communication/wins-feed.ts never
--   compares two periods with different versions: a rise could be the
--   improved detection (version 3, shown as v2.1) finding mentions the
--   earlier one missed, not the brand.
--
-- Nullable, no default, no backfill: NULL is a row written before this
-- migration (its audits ran under version 1 or 2). Two NULL rows still
-- compare as they always did; a NULL row and a version-3 row never do.

ALTER TABLE visibility_trends ADD COLUMN IF NOT EXISTS methodology_version integer;
