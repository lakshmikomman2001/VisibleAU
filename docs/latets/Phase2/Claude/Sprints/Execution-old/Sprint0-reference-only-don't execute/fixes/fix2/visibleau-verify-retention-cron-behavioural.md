# VERIFY — Retention cron actually deletes (behavioural proof, not a code read)

The retention cron was reported "already correct" from a code read. This task **proves it behaviourally** —
because the cron's entire failure mode is "runs clean, reports success, deletes nothing," which a code read
cannot detect. Seed an old audit, run the cron, confirm the old row is GONE and a recent row SURVIVES.

> This is a test, not a fix. Make no code changes. If the proof FAILS (old row survives), STOP and report —
> do not attempt a fix in this task.

Adjust table/column names to the real schema (the cron reads `audits` + `citations`; the cutoff is the
12-month retention window). Use a THROWAWAY brand/org so nothing real is touched.

---

## STEP 1 — Find the cutoff + how the cron is invoked
```bash
# Confirm the retention window (cutoff) the cron uses, and its trigger:
grep -nE "cutoff|interval|months|retention|delete\(audits\)|delete\(citations\)" inngest/functions/audit-data-retention.ts
```
Note: the exact age threshold (e.g. 12 months) and whether you can run it via the Inngest dev dashboard
("Run" on `audit-data-retention`) or by invoking its handler in a script.

## STEP 2 — Capture the BEFORE state + seed test rows
```sql
-- Pick a throwaway brand_id that already exists (or create one for a throwaway org).
-- Seed ONE audit older than the cutoff (13 months back) with status 'complete':
INSERT INTO audits (id, brand_id, status, score_composite, created_at)
VALUES ('11111111-1111-1111-1111-111111111111', '<throwaway-brand-id>', 'complete', 80, now() - interval '13 months')
RETURNING id, created_at;

-- Seed a citation belonging to that old audit, also old (so we prove the citations-first delete works):
INSERT INTO citations (id, audit_id, created_at)   -- adjust citations columns to real schema
VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', now() - interval '13 months');

-- Seed a RECENT audit (1 month back) that MUST survive:
INSERT INTO audits (id, brand_id, status, score_composite, created_at)
VALUES ('33333333-3333-3333-3333-333333333333', '<throwaway-brand-id>', 'complete', 80, now() - interval '1 month')
RETURNING id, created_at;

-- Confirm all three rows exist now:
SELECT id, status, created_at FROM audits WHERE id IN
  ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333');
SELECT id FROM citations WHERE id = '22222222-2222-2222-2222-222222222222';
```

## STEP 3 — Run the retention cron
Trigger `audit-data-retention` (Inngest dev dashboard "Run", or invoke its handler in a script). Capture the
function's return value / logs — note what it reports deleting (e.g. `{ deletedAudits: N }`).

## STEP 4 — Capture the AFTER state (the proof)
```sql
-- The OLD audit + its citation must be GONE:
SELECT count(*) AS old_audit_remaining FROM audits WHERE id = '11111111-1111-1111-1111-111111111111';   -- → 0
SELECT count(*) AS old_citation_remaining FROM citations WHERE id = '22222222-2222-2222-2222-222222222222'; -- → 0
-- The RECENT audit must SURVIVE:
SELECT count(*) AS recent_audit_remaining FROM audits WHERE id = '33333333-3333-3333-3333-333333333333';   -- → 1
```

## STEP 5 — Clean up the test rows (whatever remains)
```sql
DELETE FROM citations WHERE id = '22222222-2222-2222-2222-222222222222';
DELETE FROM audits    WHERE id IN ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333');
-- (and the throwaway brand/org if you created one solely for this test)
```

---

## PASS / FAIL
- **PASS** = `old_audit_remaining=0` AND `old_citation_remaining=0` AND `recent_audit_remaining=1`, and the
  cron's return value showed it deleted ≥1 audit. This proves the cron actually purges old data (and that the
  citations-first delete + the age cutoff both work). The "already correct" code read is now behaviourally confirmed.
- **FAIL** = the old audit/citation survived (cron deleted nothing) OR the recent audit was wrongly deleted
  (cutoff is off). STOP and report the exact counts + the cron's return value — do not fix in this task.

## REPORT
Report: the cutoff/window found (Step 1), the cron's return value/logs (Step 3), and the three AFTER counts
(Step 4), with a PASS/FAIL verdict. Confirm test rows were cleaned up (Step 5).
