-- Migration 0146 (Vunnara, 13 Nov; Sri's walk-through, part 8): the brand's own postcode, for Google.
--
-- RUN BEFORE THE PUSH THAT CARRIES IT (prod-fix 0146 run1 -> run3; run4 only to undo).
--
-- Hero Home Services is in Yennora NSW (2161), but its Google block used "Sydney NSW ... Results for Sydney NSW,
-- not your suburb": brands had no postcode, the app's suburb list has none, and DataForSEO's location list
-- has Yennora's postcode (2161) but not the suburb's name -- so without an operator postcode on
-- /admin/settings the suburb fell back to the state capital. The owner gives the postcode with the suburb
-- now (the wizard and the location picker); Google uses it (lib/audit/google-surfaces/dispatch.ts), and the
-- operator's postcode (brand_google_locations) is an override only.
--
-- Why before the push: Drizzle selects every column of its schema, so the pushed code's reads of brands ask for
-- postcode. A nullable column with no default changes nothing for the code deployed now.
--
-- Idempotent.

ALTER TABLE brands ADD COLUMN IF NOT EXISTS postcode text;

DO $$
BEGIN
  ALTER TABLE brands ADD CONSTRAINT brands_postcode_four_digits CHECK (postcode IS NULL OR postcode ~ '^[0-9]{4}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
