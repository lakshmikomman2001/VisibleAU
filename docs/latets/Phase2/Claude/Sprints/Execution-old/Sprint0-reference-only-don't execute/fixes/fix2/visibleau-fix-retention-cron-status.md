# VisibleAU — FIX PROMPT: Retention cron filters `audits.status='completed'` → deletes ZERO rows (Phase 2 blocker)

**Phase/Sprint:** Phase 1, Sprint 12 (`inngest/functions/audit-data-retention.ts`, JH4). **Severity: HIGH —
silent data/compliance bug + hard Phase 2 prerequisite.** The retention cron runs, reports success, and
deletes nothing — so audit data accumulates forever (privacy-policy + APP 11 breach + storage cost), AND the
Phase 2 retention CASCADE/SET-NULL chain that depends on this cron actually deleting audits will never fire.

> The cron does NOT error — it executes cleanly and returns `{ deleted: 0 }` every run. This is a
> "tests pass, does nothing" bug: the WHERE clause matches zero rows because of a one-letter enum mismatch.

---

## ROOT CAUSE (confirmed against canon)

`audits.status` is the enum **`'pending' | 'running' | 'complete' | 'failed'`** (CLAUDE.md line 286; Sprint 2
writes `status: 'complete'` at line 942 and tests `audits.status = 'complete'` at line 614). There is **no
`'completed'`** value — `'completed'` (with `-d`) is the `workflow_runs.status` value, a DIFFERENT table.

The retention cron filters:
```ts
const deleted = await db.delete(audits)
  .where(and(lt(audits.createdAt, cutoff), eq(audits.status, 'completed')))   // ← 'completed' never matches
  .returning({ id: audits.id });
```
Since no audit row ever has `status='completed'`, the filter matches **zero rows**, `deleted.length` is always
0, and no audit is ever purged. (This is the exact blocker the Phase 2 handoff has flagged for the whole Phase
2 design: Phase 2 retention cascades depend on this cron correctly deleting audits.)

## THE FIX — `'completed'` → `'complete'` (3 instances), then align the citations filter

### Step 0 — find every `audits.status='completed'` slip (there are 3; do NOT touch PostHog event names)
```bash
# The audits-status bug appears in 3 places. Find them in the BUILT code:
grep -rnE "status.*'completed'|eq\(audits.status, 'completed'\)|\.eq\('status', 'completed'\)|status: 'completed'" \
  inngest/ app/ lib/ scripts/ db/ tests/ 2>/dev/null
# Expected build sites (from the Sprint 12 prompt these were copied from):
#   1. inngest/functions/audit-data-retention.ts — the retention delete filter (THE critical one)
#   2. the OG/score-badge public lookup (a `.from('audits')...eq('status','completed')` query)
#   3. a test seed that inserts an audit with `status: 'completed'` (would create a row no 'complete'
#      query ever matches — a poisoned fixture)
#
# DO NOT change PostHog analytics event names: signup_completed / sample_audit_completed /
#   first_audit_completed / checkout_completed are EVENT STRINGS, not the audits column — leave them.
grep -rnE "posthog.capture\('[a-z_]*completed'" . 2>/dev/null   # → these are FINE, do not touch
```

### Step 1 — fix the retention cron delete filter (the blocker)
In `inngest/functions/audit-data-retention.ts`:
```ts
// BEFORE:
.where(and(lt(audits.createdAt, cutoff), eq(audits.status, 'completed')))
// AFTER:
.where(and(lt(audits.createdAt, cutoff), eq(audits.status, 'complete')))
```

### Step 2 — fix the other 2 instances
- The OG/score-badge audits lookup: `.eq('status', 'completed')` → `.eq('status', 'complete')`.
- The test seed: `db.insert(audits).values({ status: 'completed', ... })` → `status: 'complete'`. (A test
  that seeds `'completed'` is doubly wrong — it builds a row that no production query matches, so the test
  proves nothing about the real path.)

### Step 3 — ALIGN the citations delete with the audits delete (correctness, not just the typo)
This is the subtle part. The cron deletes citations and audits with DIFFERENT filters:
```ts
await db.delete(citations).where(lt(citations.createdAt, cutoff));                       // time only
const deleted = await db.delete(audits)
  .where(and(lt(audits.createdAt, cutoff), eq(audits.status, 'complete'))) ...           // time + status
```
With the status fixed, these two filters now diverge: the citations delete removes citations older than the
cutoff **regardless of their parent audit's status**, while the audits delete keeps audits that are
`pending`/`running`/`failed`. So an old `failed` audit would have its citations deleted but the audit row
kept — orphaning, or deleting evidence you meant to keep. **Decide the intended retention rule and make both
deletes consistent.** Per the spec's intent ("audit results retained 12 months", purge old results), the
cleanest rule is: **purge by AGE only — delete audits AND their citations older than the cutoff, whatever the
status.** That removes old `failed`/`running` rows too (which you also don't want lingering past 12 months),
and keeps citations/audits in lockstep. Two valid ways:

- **Option A (recommended — age-only, simplest, no orphans):** drop the status filter from the audits delete
  so it matches the citations filter:
  ```ts
  await db.delete(citations).where(lt(citations.createdAt, cutoff));
  const deleted = await db.delete(audits)
    .where(lt(audits.createdAt, cutoff))            // age only — same predicate as citations
    .returning({ id: audits.id });
  ```
  (If you keep an explicit citations delete, this is correct in both FK cases — see Step 4.)

- **Option B (keep status filter — only if you deliberately want to retain non-complete audits forever):**
  then the citations delete MUST be scoped to citations whose parent audit is being deleted, not a blanket
  age filter — otherwise you orphan/over-delete. This is more complex and conflicts with APP 11 (don't keep
  old `failed` audits' personal data forever either). **Prefer Option A** unless there's a concrete reason to
  preserve old non-complete audits.

> Use Option A unless Sri says otherwise. It's simpler, leaves no orphans, and satisfies the 12-month
> retention intent for ALL audit rows.

### Step 4 — preserve the JU2 FK-cascade investigate-step (don't hardcode)
The spec's JU2 note tells the builder to verify the `citations.auditId` FK cascade BEFORE finalising, because
it changes whether the explicit `db.delete(citations)` is needed:
```bash
grep -rniE "auditId|audit_id" db/schema*.ts db/schema/ 2>/dev/null | grep -i "cascade\|references\|onDelete"
```
- **CASE A — `onDelete: 'cascade'` exists:** deleting audits auto-deletes citations. The explicit
  `db.delete(citations)` is then redundant (a harmless no-op after the audits delete, but you can keep it for
  clarity or remove it). Order doesn't matter.
- **CASE B — no cascade (plain `references`):** you MUST delete citations FIRST (the current order), or the
  audits delete throws an FK violation. Keep citations-before-audits.
Report which case the repo is in, and make sure the final order is valid for that case. (With Option A's
age-only filters, citations-first is safe in both cases.)

---

## CONSTRAINTS
- **`audits.status` is `'complete'` (no -d), full stop.** Never `'completed'` anywhere on the audits column —
  that value belongs to `workflow_runs.status`. The two enums must never be unified (this is a locked invariant
  carried into Phase 2).
- **Do not touch PostHog `*_completed` event names** — different namespace.
- **Citations and audits deletes must use a consistent predicate** (Option A: both age-only) so no row is
  orphaned and no citations are deleted for audits you're keeping.
- **Churn step (`delete-churned-org-data`) is unchanged** — it's subscription/age-based (cancelled >13mo +
  no active sub), correctly has NO status filter, and relies on FK cascade for audits/citations. Leave it.
- **No schedule change** (cron stays `0 4 * * 0`, the JM3-verified 1h gap from sample-audit-cleanup).
- No schema change, no new function.

---

## VERIFICATION (must pass)
```bash
# 1. No 'completed' remains on the audits column anywhere (PostHog events excluded):
grep -rnE "audits.status, 'completed'|status: 'completed'|\.eq\('status', 'completed'\)" inngest/ app/ lib/ scripts/ db/ tests/ 2>/dev/null   # → 0 matches
# 2. The retention cron now filters 'complete':
grep -nE "eq\(audits.status, 'complete'\)|lt\(audits.createdAt, cutoff\)" inngest/functions/audit-data-retention.ts   # → present
# 3. citations + audits deletes use a consistent predicate (Option A: both age-only):
grep -nE "delete\(citations\)|delete\(audits\)|lt\(.*createdAt, cutoff\)" inngest/functions/audit-data-retention.ts
# 4. PostHog event names untouched:
grep -rcE "posthog.capture\('[a-z_]*completed'" . 2>/dev/null   # → unchanged count
```

### The REAL proof — prove it deletes rows (a passing typecheck proves nothing here)
The whole bug is "runs clean, deletes nothing", so the test must show a row actually deleted:
```sql
-- 1. Seed an OLD complete audit (older than the 12-month cutoff) for a throwaway brand:
--    (adjust column names to your schema)
INSERT INTO audits (id, brand_id, status, score_composite, created_at)
VALUES (gen_random_uuid(), '<some-brand-id>', 'complete', 80, now() - interval '13 months');
-- note its id, and seed a citation for it with the same old created_at.
```
```bash
# 2. Trigger the retention function (Inngest dev dashboard "Run" on audit-data-retention,
#    or invoke its handler in a script). Then:
```
```sql
-- 3. Confirm the old audit (and its citations) are GONE, and a RECENT complete audit is UNTOUCHED:
SELECT count(*) FROM audits WHERE id = '<the-old-audit-id>';        -- → 0 (deleted)
SELECT count(*) FROM audits WHERE created_at > now() - interval '11 months';  -- → unchanged (kept)
```
- **Before the fix:** the old audit survives (cron matched 0 rows). **After:** it's deleted. That delta is
  the only thing that proves the fix — `{ deleted: N>0 }` in the function result, an actually-removed row.
- Also confirm a recent (<12mo) audit is NOT deleted (the age filter works at the boundary).

---

## NOTE FOR THE REVIEWER (not for Claude Code)
This is the long-flagged Phase 2 prerequisite (S12 retention cron `'completed'` vs `'complete'`). It was in the
Sprint 12 PROMPT's example code (3 sites: the cron delete, an OG-badge lookup, a test seed), so it shipped into
the build. It's invisible to any test that doesn't assert a row was actually deleted — and the poisoned test
seed (`status:'completed'`) means even a retention test could have "passed" against a fixture that real queries
never match. The companion correctness fix (aligning the citations/audits delete predicates, Step 3) prevents
orphaned citations once the status filter is corrected. After this lands, the Phase 2 build's hard prerequisite
is cleared. (Still separately open: the Inngest endpoint path drift S6/S9/S10 — not part of this fix.)
