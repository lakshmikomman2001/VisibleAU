-- MI-01: Add internal_event_id to webhook_deliveries for per-instance dedup
-- Fixes F19: dedup was keyed on event TYPE, dropping legitimate repeat events

ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS internal_event_id TEXT;

-- Index for the corrected dedup query: (endpoint_id, internal_event_id)
CREATE INDEX IF NOT EXISTS webhook_deliveries_endpoint_event_id_idx
  ON webhook_deliveries (endpoint_id, internal_event_id);
