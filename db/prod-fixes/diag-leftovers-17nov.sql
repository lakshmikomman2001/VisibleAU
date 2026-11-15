-- diag-leftovers-17nov.sql -- READ-ONLY. For Sri, on production (visibleau_prod), before pushing the 17 Nov
-- "leftovers" commits (parts 2, 3 and 6). Nothing here writes: one READ ONLY transaction, rolled back.
--
--   psql "$PROD_URL" -v ON_ERROR_STOP=1 -f db/prod-fixes/diag-leftovers-17nov.sql
--
-- HOW TO READ THE RESULTS (paste them back as they come):
--   1. Fine: 0. Needs a fix: any row -- an "impersonation" task a customer can see; say how many and we'll decide
--      whether to dismiss them (part 3 stops making them; this query doesn't touch them).
--   2. Fine: every complete audit's week has a trend row updated after it (week_row_updated_after_audit = t).
--      Needs a fix: f on a "schedule" (or bulk/workflow/validation) audit -- what part 2 fixes going forward; f on a
--      "manual" audit after 11 Nov -- the Google hand-off didn't send audit.complete (query 4 says more).
--   3. Fine: 0. Needs a fix: nothing -- the agency count no longer includes these (part 6); they stay in the table.
--   4. Fine: 0 rows. Needs a fix: any audit whose Google collection never finished -- its follow-ups (and its week's
--      trend) never ran; check that collect-google-surfaces is synced in Inngest.
--   5. Fine: any -- a rough count of audits by how they were started, to size part 2's change.

BEGIN TRANSACTION READ ONLY;

-- 1. "Possible impersonation" tasks (made from a share of unverified crawler hits; part 3 removes the rule).
SELECT b.name, t.title, t.status, t.created_at
FROM remediation_tasks t JOIN brands b ON b.id = t.brand_id
WHERE t.recommendation_key = 'investigate_impersonation' OR t.title ILIKE '%possible impersonation%'
ORDER BY t.created_at DESC
LIMIT 20;

-- 2. Each recent complete audit, how it was started, and whether its ISO week's trend row was recomputed after it
--    (updated_at; calculated_at was only set when the row was first made).
SELECT b.name, a.audit_number, a.triggered_by, a.completed_at,
       to_char(a.completed_at AT TIME ZONE 'UTC', 'IYYY-"W"IW') AS iso_week,
       t.updated_at AS week_row_updated_at,
       t.updated_at >= a.completed_at AS week_row_updated_after_audit
FROM audits a
JOIN brands b ON b.id = a.brand_id
LEFT JOIN visibility_trends t ON t.brand_id = a.brand_id AND t.period_type = 'weekly'
  AND t.period_label = to_char(a.completed_at AT TIME ZONE 'UTC', 'IYYY-"W"IW')
WHERE a.status = 'complete' AND b.deleted_at IS NULL AND a.completed_at > now() - interval '21 days'
ORDER BY a.completed_at DESC
LIMIT 40;

-- 3. Pending drift alerts of deleted brands (what the agency dashboard's "Pending drift alerts" counted).
SELECT b.name, count(*) AS pending_alerts
FROM drift_alerts d JOIN brands b ON b.id = d.brand_id
WHERE d.acknowledged = false AND b.deleted_at IS NOT NULL
GROUP BY b.name;

-- 4. Google collection that never finished for an audit over an hour old (audit.complete waits for it).
SELECT b.name, a.audit_number, a.completed_at, g.status, g.status_reason
FROM audit_google_surfaces g JOIN audits a ON a.id = g.audit_id JOIN brands b ON b.id = a.brand_id
WHERE g.status <> 'complete' AND a.completed_at < now() - interval '1 hour'
ORDER BY a.completed_at DESC
LIMIT 20;

-- 5. Audits by how they were started, last 30 days.
SELECT triggered_by, status, count(*) AS audits
FROM audits
WHERE created_at > now() - interval '30 days'
GROUP BY triggered_by, status
ORDER BY triggered_by, status;

ROLLBACK;
