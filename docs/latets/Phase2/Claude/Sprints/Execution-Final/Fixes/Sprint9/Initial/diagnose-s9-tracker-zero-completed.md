# DIAGNOSE S9 — Tracker shows "0 / 1 gaps closed": correct-post-fix, or is `completed_at` NULL? (read-only)

## Why
The `/dashboard` tracker renders **"0 / 1 gaps closed this month"** — but the pre-walk data briefing
said `remediation_tasks` HAS rows with `status='complete'`, so we expected a positive count. The
honesty-rule half is CORRECT (Measured Impact = "Validation audit scheduled — pending" ✓). But the
Work Completed 0 needs explaining, because three very different things produce it:

1. **CORRECT (the F1 fix working)** — the tasks ARE complete, but their `completed_at` falls in a
   PREVIOUS month. Pre-fix the query used `updated_at` (so a recently-EDITED old task counted as
   "closed this month" — the inflation F1 described). Post-fix it correctly counts only tasks
   *completed* in the current UTC month → an honest 0. **This would mean the fix worked and the old
   number was inflated.** Good outcome.
2. **BUG — `completed_at` is NULL** on `status='complete'` tasks (nothing populates it when a task is
   marked complete). Then the count is 0 not because of the month but because the column is empty →
   the tracker shows **0 forever, for every brand**, permanently zeroing what the LLD calls "the most
   important retention metric." That's a real defect (in the completion path, not the tracker).
3. **Denominator question** — "0 / **1**": is 1 the right total? What is the denominator meant to be
   (all gaps? open+complete? this month? all-time)?

READ-ONLY. Classify; don't fix.

## Task

### 1 — The actual task rows for the brand on the dashboard (Bondi Plumbing)
```bash
cd c:/startup/VisibleAU/src
# Which brand is the dashboard tracker showing? (the banner said "Bondi Plumbing")
psql "$PROD" -c "SELECT id, name, domain FROM brands WHERE name ILIKE '%bondi%';"

# The tasks for that brand — status, completed_at, updated_at, score_after:
psql "$PROD" -c "
  SELECT id, status, completed_at, updated_at, score_before, score_after, lift_achieved
  FROM remediation_tasks
  WHERE brand_id = (SELECT id FROM brands WHERE name ILIKE '%bondi%' LIMIT 1)
  ORDER BY updated_at DESC;"

# The decisive question — across ALL tasks: do 'complete' tasks have completed_at populated?
psql "$PROD" -c "
  SELECT status,
         COUNT(*)                                   AS rows,
         COUNT(completed_at)                        AS with_completed_at,
         COUNT(*) FILTER (WHERE completed_at IS NULL) AS null_completed_at,
         MIN(completed_at) AS earliest, MAX(completed_at) AS latest
  FROM remediation_tasks
  GROUP BY status ORDER BY status;"

# And what the canonical query itself returns right now (the UTC month filter):
psql "$PROD" -c "
  SELECT COUNT(*) FILTER (WHERE status='complete'
            AND date_trunc('month', completed_at) = date_trunc('month', now())) AS work_completed_this_month,
         COALESCE(SUM(lift_achieved) FILTER (WHERE score_after IS NOT NULL
            AND date_trunc('month', completed_at) = date_trunc('month', now())), 0) AS measured_impact,
         date_trunc('month', now()) AS utc_month_start,
         now() AS now_utc
  FROM remediation_tasks
  WHERE brand_id = (SELECT id FROM brands WHERE name ILIKE '%bondi%' LIMIT 1);"
```

### 2 — CLASSIFY
- **CASE 1 (fix working):** complete tasks exist with `completed_at` populated, but dated in a PRIOR
  month → the 0 is HONEST and correct; the pre-fix `updated_at` query was inflating. ✅ No bug —
  note it as confirmation the F1 fix is doing its job. (Optionally: what WOULD the old `updated_at`
  query have shown? Run it to quantify the inflation we removed.)
- **CASE 2 (real bug):** `status='complete'` rows have `completed_at` **NULL** → the completion path
  never sets it. FINDING (MEDIUM+): the tracker will read 0 forever. Identify WHERE tasks are marked
  complete and whether it sets `completed_at`:
  ```bash
  grep -rn "status.*complete\|completedAt\|completed_at" \
    app/api/**/remediation*/**/*.ts lib/workflow/*.ts inngest/functions/*.ts 2>/dev/null \
    | grep -iE "set|update|complete" | head
  ```
- **CASE 3:** something else (no complete tasks at all for THIS brand — the briefing meant other
  brands). Then the 0 is correct for Bondi and we should check a brand that DOES have completions.

### 3 — The denominator ("/ 1")
What does the tracker's denominator represent? Confirm against the component + the helper:
```bash
grep -n "totalGaps\|denominator\|total\|closed\|/ \|gapsTotal" \
  components/domain/autopilot/action-progress-tracker.tsx lib/workflow/progress-summary.ts | head
```
Is "1" = total gaps for the brand (open + complete)? all-time or this-month? Confirm it matches
canon's intent ("4 of 11 gaps closed this month" implies 11 = the total gap set, not a monthly count).

### 4 — The second "Work Completed" section below the fold
The dashboard screenshot shows ANOTHER "Work Completed" heading beginning below the tracker cards.
Identify what it is (a task list? a duplicate of the tracker?) — screenshot or describe it. If it's a
duplicate of the same summary, that's a redundancy worth noting; if it's the task detail list, fine.

## Report back (paste inline)
1. The Bondi task rows (status / completed_at / updated_at / score_after).
2. The `completed_at` NULL-count by status across all tasks — **the decisive number**.
3. What the canonical query returns right now for that brand.
4. Classification: CASE 1 (fix working, honest 0) / CASE 2 (completed_at never set — FINDING) / CASE 3.
5. What the denominator "1" represents.
6. What the second "Work Completed" section below the fold is.
