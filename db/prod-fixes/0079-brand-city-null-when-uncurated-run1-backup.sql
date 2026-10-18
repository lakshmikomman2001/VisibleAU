-- 0079-brand-city-null-when-uncurated-run1-backup.sql (Vunnara hotfix,
-- 18 Oct, post-df27ef8)
--
-- PRODUCTION branch. Run on its own, as one editor submission.
-- Run AFTER diag-0078-brand-city-equals-suburb.sql (to know what to expect).
-- Snapshots ONLY the affected rows' current city into
-- _backup_0079_brand_city (Neon's editor can't \copy) -- drop it later,
-- once run3's post-check looks right, via a separate file.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then
-- backup_row_count matches diag-0078's row count.
CREATE TABLE _backup_0079_brand_city AS
WITH curated_locations (state, suburb) AS (
  VALUES
    ('NSW', 'Sydney CBD'), ('NSW', 'Bondi'), ('NSW', 'Parramatta'), ('NSW', 'Chatswood'),
    ('NSW', 'Newtown'), ('NSW', 'North Sydney'), ('NSW', 'Manly'), ('NSW', 'Surry Hills'),
    ('VIC', 'Melbourne CBD'), ('VIC', 'Fitzroy'), ('VIC', 'Richmond'), ('VIC', 'St Kilda'),
    ('VIC', 'South Yarra'),
    ('QLD', 'Brisbane CBD'), ('QLD', 'Gold Coast'), ('QLD', 'Sunshine Coast'),
    ('WA', 'Perth CBD'), ('WA', 'Fremantle'),
    ('SA', 'Adelaide CBD'),
    ('ACT', 'Canberra CBD')
)
SELECT b.id, b.city
FROM brands b
WHERE b.city IS NOT NULL
  AND b.city = b.suburb
  AND NOT EXISTS (
    SELECT 1 FROM curated_locations cl
    WHERE cl.state = b.state AND cl.suburb = b.suburb
  );

SELECT count(*) AS backup_row_count FROM _backup_0079_brand_city;
