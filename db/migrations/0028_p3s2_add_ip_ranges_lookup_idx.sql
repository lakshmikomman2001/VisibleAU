-- Migration 0028: Legitimize ai_bot_ip_ranges_lookup_idx in dev
-- This index existed on prod (from drizzle-push) but never in a dev migration.
-- It accelerates refreshIpRangesForVendor (WHERE vendor = ? AND is_current = true).
-- Adding it to dev closes the last DIFF-01 difference → full dev/prod parity.

CREATE INDEX IF NOT EXISTS ai_bot_ip_ranges_lookup_idx
  ON public.ai_bot_ip_ranges USING btree (vendor, is_current);
