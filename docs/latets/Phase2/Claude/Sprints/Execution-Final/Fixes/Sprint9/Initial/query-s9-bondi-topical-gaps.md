# QUERY — Does Bondi have a `topical_coverage_gaps` row? (settles whether F17's fallback is honest or masking a bug)

## Why this matters
F17's fix added a fallback to step 2:
```ts
description: topGap ? `${topGap.topicLabel}: priority #${topGap.priorityRank}`
           : topTask ? `${topTask.title}`          // ← the new fallback
           : "No gaps identified yet",
```
Bondi's step 2 will now show **"Update local directory listings"** — but that's the **task title**,
which means `topGap` was **falsy**. Two very different explanations produce the identical screen:

- **CASE 1 — the fallback is LEGITIMATE:** Bondi genuinely has NO `topical_coverage_gaps` row (only a
  `remediation_task`). Task-without-gap is a real state, the fallback is correct, F17 is closed. ✅
- **CASE 2 — the fallback is MASKING a live bug:** Bondi DOES have a gap row, but `/topical-gaps`
  still isn't delivering it (the unwrap didn't take, or the route filters it out). The fallback then
  makes the loop *look* like it works while the gap fetch stays broken — **a fix that hides the very
  thing it was meant to expose.** ❌ New finding.

The same concern applies to `deriveStepStatus` (changed from `if (!topGap)` to
`if (!topGap && !task)`) — if gaps simply aren't arriving, that change makes the loop *appear* to
advance on broken data.

**On screen, CASE 1 and CASE 2 look identical.** Only the DB distinguishes them.

READ-ONLY. No edits.

## Task

### 1 — Does Bondi have gap rows?
```bash
cd c:/startup/VisibleAU/src
psql "$PROD" -c "
  SELECT COUNT(*) AS gap_rows
  FROM topical_coverage_gaps
  WHERE brand_id = '0f531803-b529-4d09-9fd6-b6272b5baba8';"

# If any exist, show them (this is what step 2 SHOULD be displaying):
psql "$PROD" -c "
  SELECT id, topic_label, topic_cluster, priority_rank, gap_severity, created_at
  FROM topical_coverage_gaps
  WHERE brand_id = '0f531803-b529-4d09-9fd6-b6272b5baba8'
  ORDER BY priority_rank ASC
  LIMIT 5;"
```

### 2 — And for Metropolitan (the control)
```bash
psql "$PROD" -c "
  SELECT COUNT(*) AS gap_rows
  FROM topical_coverage_gaps
  WHERE brand_id = '418f321f-2489-4560-aaa9-895728580465';"
```
(Metropolitan shows "No gaps identified yet" — confirm that's honest: it should have 0 gaps AND 0
open tasks.)

### 3 — Gap counts across ALL brands (is the table populated at all?)
```bash
psql "$PROD" -c "
  SELECT b.name, COUNT(g.id) AS gaps
  FROM brands b
  LEFT JOIN topical_coverage_gaps g ON g.brand_id = b.id
  GROUP BY b.name
  ORDER BY gaps DESC;"
```
If EVERY brand has 0 gaps, then `topical_coverage_gaps` is empty system-wide — the gap fetch can't be
proven either way from the UI, and step 2 will *always* fall back to the task. Worth knowing (it would
mean S2's gap analysis never wrote rows for these brands — an upstream data question, not an S9 bug).

### 4 — If Bondi HAS gaps: is the route returning them?
Only run this if step 1 returned ≥1:
```bash
# What does the route actually filter on? (status? severity? a limit?)
grep -n "where\|eq(\|limit\|status\|severity\|orderBy" \
  "app/api/brands/[brandId]/topical-gaps/route.ts" | head -15
```
A route that filters (e.g. `WHERE status='open'` on a gap table that has no such column, or an
overly-narrow filter) would return `{ gaps: [] }` — an empty envelope, correctly unwrapped, still
yielding nothing. That would be CASE 2.

## Report back (paste inline)
1. **Bondi's gap count** — the decisive number.
2. If ≥1: the gap rows (topic_label, priority_rank) — i.e. what step 2 SHOULD show.
3. Metropolitan's gap count (confirm its "No gaps identified yet" is honest).
4. The all-brands gap counts (is the table populated at all?).
5. **CLASSIFY:**
   - **CASE 1** — Bondi has 0 gaps → the `topTask.title` fallback is legitimate → **F17 CLOSED**.
   - **CASE 2** — Bondi has gaps but they're not reaching the UI → **NEW FINDING** (the fallback is
     masking a still-broken `/topical-gaps` fetch) → report what the route does with them.
