-- 0079-brand-city-null-when-uncurated-run3-post-check.sql (Vunnara
-- hotfix, 18 Oct, post-df27ef8)
--
-- PRODUCTION branch. Run on its own, as one editor submission. READ-ONLY.
-- Run AFTER run2-apply.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Same predicate as diag-0078.sql, re-run against the now-updated table
-- -- every backed-up row should now have city IS NULL, so it can no
-- longer match "city = suburb" at all.
--
-- Expected result: remaining_mismatch_count = 0.
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
SELECT count(*) AS remaining_mismatch_count
FROM brands b
WHERE b.city IS NOT NULL
  AND b.city = b.suburb
  AND NOT EXISTS (
    SELECT 1 FROM curated_locations cl
    WHERE cl.state = b.state AND cl.suburb = b.suburb
  );
