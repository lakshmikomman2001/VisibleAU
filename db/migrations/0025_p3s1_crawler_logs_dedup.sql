-- AA-02: make re-uploading the same log a no-op (not a doubling).
-- Dedup key: brand + which bot + which URL + when + source IP (NULL IPs bucket to a sentinel).
-- source_ip is now INET (FIX-01), so the ::inet cast in COALESCE is valid on both DBs.
CREATE UNIQUE INDEX IF NOT EXISTS crawler_logs_dedup_idx
  ON crawler_visit_logs (
    brand_id,
    crawler_name,
    visited_url,
    visited_at,
    COALESCE(source_ip, '0.0.0.0'::inet)
  );
