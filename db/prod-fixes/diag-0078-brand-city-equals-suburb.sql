-- diag-0078-brand-city-equals-suburb.sql (Vunnara hotfix, 18 Oct,
-- post-df27ef8, read-only)
--
-- PRODUCTION branch. READ-ONLY. Paste into the Neon SQL editor. NOT run
-- from Claude Code -- there is no prod access from that environment.
-- Sri-authorized only.
--
-- WHY: the location-confirm card and the wizard (components/domain/
-- brand/location-confirm-card.tsx, app/(auth)/brands/wizard/wizard-
-- form.tsx) used to fall back to the typed SUBURB as the city whenever
-- the suburb wasn't in the curated lib/locations list -- an invented
-- fact (a suburb is not a city). Live case: Omega Services, suburb
-- "Norwest" (not curated), city wrongly saved as "Norwest" too.
--
-- Uses NOT EXISTS (not a tuple NOT IN) against the curated (state,
-- suburb) pairs so a row with a NULL state is correctly caught too --
-- a plain NOT IN can silently miss those (row comparison against a
-- NULL field yields unknown, not true, for every candidate, so NOT IN
-- itself goes unknown and the row is dropped by WHERE). curated_locations
-- mirrors lib/locations/index.ts's AU_LOCATIONS exactly.
--
-- Expected result: at least 1 row (Omega Services). Note the row
-- count -- it's what 0079-run1-backup.sql's backup_row_count below
-- should match.
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
SELECT b.id, b.name, b.suburb, b.city, b.state
FROM brands b
WHERE b.city IS NOT NULL
  AND b.city = b.suburb
  AND NOT EXISTS (
    SELECT 1 FROM curated_locations cl
    WHERE cl.state = b.state AND cl.suburb = b.suburb
  )
ORDER BY b.id;
