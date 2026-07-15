# VERIFY — the constraint rename may have drifted BOTH DBs away from the migration files

## The concern
The sync report says:
> *"Renamed 13 FK constraints **on prod** to match dev"* ✅ **correct — prod was the target**
> *"Renamed 22 unique constraints **on BOTH databases** from `_key` to `_unique`"* ⚠️ **dev was changed too**

**The task was to sync prod → dev. If dev was also mutated, dev is no longer the reference it was
validated against** — and ~2,900 S9 tests were green against dev's *previous* constraint names.

**The bigger risk:** these renames were applied as **raw SQL against live databases**, with **no
migration file recording them**. So:
- A **fresh `drizzle-kit migrate`** (CI, a new machine, a new environment) would create constraints
  with Postgres's default **`_key`** suffix — **not `_unique`.**
- ⚠️ **Both local DBs may now disagree with the migrations, which are the actual source of truth.**

This compounds a known Gate 3 finding: *"only **6 of the journal's migrations** are recorded in
`__drizzle_migrations` — the rest were applied out-of-band as raw SQL."* **CI and a fresh dev machine
already take a different path than your local DBs.** This may have widened that gap.

READ-ONLY. Diagnose; change nothing.

---

## 1 — Was dev actually changed, or is "both" loose wording?
```bash
cd c:/startup/VisibleAU/src
# Current unique-constraint names on BOTH:
psql "$DEV"  -c "SELECT conname FROM pg_constraint WHERE contype='u' ORDER BY conname;" > /tmp/dev_u.txt
psql "$PROD" -c "SELECT conname FROM pg_constraint WHERE contype='u' ORDER BY conname;" > /tmp/prod_u.txt
diff /tmp/dev_u.txt /tmp/prod_u.txt && echo "IDENTICAL"
# How many end in _key vs _unique on each?
psql "$DEV"  -c "SELECT CASE WHEN conname LIKE '%_key' THEN '_key' WHEN conname LIKE '%_unique' THEN '_unique' ELSE 'other' END AS suffix, COUNT(*) FROM pg_constraint WHERE contype='u' GROUP BY 1;"
psql "$PROD" -c "SELECT CASE WHEN conname LIKE '%_key' THEN '_key' WHEN conname LIKE '%_unique' THEN '_unique' ELSE 'other' END AS suffix, COUNT(*) FROM pg_constraint WHERE contype='u' GROUP BY 1;"
```
**Report:** did **dev** genuinely have `_key` names before (i.e. was it changed), or did it already
have `_unique` and only prod was touched? **If dev was mutated, say so plainly.**

## 2 — ⚠️ THE DECISIVE QUESTION: what would a FRESH migration produce?
```bash
# What do the migration files themselves declare?
grep -rn "CONSTRAINT.*unique\|UNIQUE\|_key\|_unique" db/migrations/*.sql | head -20
# Does any migration EXPLICITLY name a unique constraint, or does it let Postgres default to _key?
grep -rn "ADD CONSTRAINT" db/migrations/*.sql | grep -i unique | head
```
⚠️ **If the migrations use bare `UNIQUE (...)` (no explicit `CONSTRAINT name`), Postgres names it
`<table>_<col>_key` — meaning a FRESH DB gets `_key`, and BOTH local DBs (now `_unique`) diverge from
what the migrations produce.**

**Then prove it:**
```bash
# Spin a throwaway DB, run the migrations, and see what names come out:
createdb visibleau_freshtest 2>/dev/null
# apply the migrations the way CI would (drizzle-kit migrate, or the raw .sql files in order)
psql visibleau_freshtest -c "SELECT conname FROM pg_constraint WHERE contype='u' ORDER BY conname LIMIT 10;"
dropdb visibleau_freshtest
```
⚠️ **This is the test that matters.** A fresh DB is what CI and every new environment gets. **If it
differs from your local DBs, the local DBs are the outliers — and "synced" is misleading.**

## 3 — Does anything reference a constraint BY NAME?
A rename is only safe if nothing depends on the old name.
```bash
grep -rn "ON CONFLICT ON CONSTRAINT\|onConflictDoUpdate\|onConflictDoNothing\|DROP CONSTRAINT\|ADD CONSTRAINT" \
  db/ lib/ app/ inngest/ tests/ --include=*.ts --include=*.sql | head -20
```
⚠️ **Any `onConflictDoUpdate({ target: ... })` that names a CONSTRAINT (rather than a column) now
points at a name that may no longer exist** — an upsert that used to work would fail at runtime, and
**it would not fail at compile time.** Report every hit and whether it targets a column (safe) or a
named constraint (at risk).

## 4 — Do the tests still pass against the mutated dev DB?
```bash
npx vitest run tests/phase2/sprint9/ 2>&1 | tail -5
```
The S9 suite (~2,900 tests) was validated against dev's **previous** constraint names. **Confirm it's
still green.** If anything went red, the rename broke something.

## 5 — Is the auth-table issue actually pre-existing, or newly blocking?
```bash
npx drizzle-kit push 2>&1 | head -20
grep -n "tablesFilter" drizzle.config.ts
```
The report calls the `auth_accounts already exists` failure "pre-existing." **Confirm that** — and
note the implication: **`drizzle-kit` cannot currently reconcile the schema at all**, which is why
these renames had to be raw SQL. **That is the underlying problem**, and it means every future schema
change is also going to be applied out-of-band. **Flag it as a real infra finding, not a footnote.**

---

## CONSTRAINTS
- **READ-ONLY.** Do not rename anything else, do not "fix" a drift you find. **Report it.**
- Do not drop/recreate constraints to make things match.
- The throwaway DB in step 2 must be **dropped** afterwards.

## REPORT BACK (paste inline)
1. **Was dev mutated?** (Did it have `_key` before, or already `_unique`?)
2. ⚠️ **What does a FRESH migration run produce — `_key` or `_unique`?** **If `_key`, both local DBs
   now diverge from the migrations, and CI will get a different schema than either.**
3. Any code referencing a constraint **by name** (upserts especially)?
4. Is the S9 suite still green against the mutated dev DB?
5. **The `drizzle-kit push` failure** — pre-existing, and what it means for future schema changes.
6. **VERDICT:** are dev and prod now consistent **with each other AND with the migration files**? Or
   only with each other?
