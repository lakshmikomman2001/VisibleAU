# Claude Code — Sprint 1 BEHAVIOURAL verification (RLS + FK + table count)

The §12 structural greps passed. This task proves the two things greps **cannot** verify — that the RLS
policies actually isolate, and the FK ON DELETE rules actually fire — plus reconciles the table count. These
are behavioural proofs against real seeded data, the same way the retention cron was proven by watching a row
actually delete.

> This is verification, not a build. Use a THROWAWAY org/brand for seeding. Clean up all test rows at the end.
> If any proof FAILS, STOP and report the exact result — do not "fix" until the failure is understood (a
> failing RLS isolation test is a security finding, not a quick patch).

---

## PART 1 — Reconcile the table count (30 seconds)

The dev DB reportedly has 42 tables. Confirm that's the expected Phase-1 base + Sprint 1's 7 — not a
miscount or a stale table.
```sql
-- Total tables:
SELECT count(*) FROM information_schema.tables WHERE table_schema='public';   -- reported 42

-- List Sprint 1's 7 platform tables specifically (adjust names to the migration):
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
ORDER BY table_name;
```
**Expected:** (Phase-1 base count) + 7 = 42. State what the Phase-1 base count is and confirm the arithmetic.
If it doesn't add up (a table double-created, or a stale/renamed table lingering), report which table is
unexpected. Phase 2 canon totals **37 tables** at completion — Sprint 1 is only the first 7, so 42 in the dev
DB should be base+7, NOT 37.

---

## PART 2 — Prove RLS actually ISOLATES (the most important proof in Sprint 1)

The policies exist (greps confirmed). This proves they *work* — that a user scoped to org A genuinely cannot
read org B's rows. Every later sprint's brand-scoping rests on this; a policy with a wrong USING clause passes
every grep and still leaks.

```sql
-- Seed two throwaway orgs, each with one row in an RLS-protected Sprint 1 table.
-- (Adjust table/column names to the actual migration — use a table that has an RLS policy + an org/brand scope.)
INSERT INTO organizations (id, name, slug) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'RLS Test Org A', 'rls-test-a'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'RLS Test Org B', 'rls-test-b');

-- Put one RLS-scoped row under each org (pick a Sprint 1 RLS-protected table):
-- INSERT INTO <rls_table> (id, organization_id, ...) VALUES
--   ('...A-row...', 'aaaaaaaa-...', ...),
--   ('...B-row...', 'bbbbbbbb-...', ...);
```

Then, **simulating the app's RLS context** (the same `setRlsContext` / `SET LOCAL` mechanism the app uses —
use the real mechanism, not a superuser bypass):

```sql
-- As ORG A's context:
--   set the RLS context to org A (however the app does it: SET LOCAL app.current_org_id = '...A...', etc.)
SELECT count(*) AS a_sees_a FROM <rls_table> WHERE organization_id='aaaaaaaa-...';  -- → 1 (can see own)
SELECT count(*) AS a_sees_b FROM <rls_table> WHERE organization_id='bbbbbbbb-...';  -- → 0 (CANNOT see B)

-- As ORG B's context:
SELECT count(*) AS b_sees_b FROM <rls_table> WHERE organization_id='bbbbbbbb-...';  -- → 1
SELECT count(*) AS b_sees_a FROM <rls_table> WHERE organization_id='aaaaaaaa-...';  -- → 0
```

**PASS** = `a_sees_a=1, a_sees_b=0, b_sees_b=1, b_sees_a=0`. That proves isolation works in both directions.
**FAIL** = any cross-org count > 0 → RLS is NOT isolating (a row leaked). STOP and report the policy + the
table — this is a security finding, not a patch-and-move-on. **Critical:** make sure you are testing under the
app's real RLS role/context, NOT as a superuser/owner that bypasses RLS — a superuser will see everything and
give a false PASS. Confirm which role the connection used.

---

## PART 3 — Prove the FK ON DELETE rules actually FIRE

Greps confirmed 2 lines exist (one CASCADE, one SET NULL). This proves deleting the parent actually cascades /
actually nulls — the same "rule exists ≠ rule fires" lesson as the retention cron.

Identify the two FK relationships from the migration (one `ON DELETE CASCADE`, one `ON DELETE SET NULL`), then:

```sql
-- CASCADE case: deleting the parent should DELETE the child.
--   Seed a parent + a child row referencing it.
--   Capture child count = 1.
--   DELETE the parent.
SELECT count(*) AS child_after_cascade FROM <cascade_child> WHERE <fk_col>='<parent-id>';  -- → 0 (child gone)

-- SET NULL case: deleting the parent should NULL the child's FK, child row survives.
--   Seed a parent + a child row referencing it.
--   DELETE the parent.
SELECT <fk_col> AS fk_after_setnull, count(*) AS child_survives
FROM <setnull_child> WHERE id='<child-id>' GROUP BY <fk_col>;
--   → fk_after_setnull = NULL, child_survives = 1 (row still there, FK nulled)
```

**PASS** = CASCADE child count → 0 (deleted), SET NULL child → FK is NULL and row survives.
**FAIL** = CASCADE child still present (didn't cascade) OR SET NULL row deleted/FK not nulled → the FK rule
isn't behaving as declared. Report which FK.

---

## PART 4 — Clean up
```sql
-- Delete all throwaway rows seeded above (children first if any survived, then parents, then the test orgs).
DELETE FROM <rls_table> WHERE organization_id IN ('aaaaaaaa-...','bbbbbbbb-...');
DELETE FROM organizations WHERE id IN ('aaaaaaaa-...','bbbbbbbb-...');
-- (and any parent/child rows from Part 3)
```
Confirm no test rows remain.

---

## REPORT
- **Part 1:** the table count + the arithmetic (base + 7 = 42, or what's off).
- **Part 2:** the four RLS counts + PASS/FAIL, and **which DB role/context** the queries ran under (to prove
  it wasn't a superuser bypass).
- **Part 3:** the CASCADE and SET NULL results + PASS/FAIL.
- **Part 4:** cleanup confirmed.
- **Verdict:** Sprint 1 behaviourally proven (RLS isolates both ways; FKs fire as declared; table count
  reconciled) — or the exact failure to investigate. Make no source changes in this task; if a proof fails,
  report it for review first.
