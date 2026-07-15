# 🔴 P1 INFRA — Fix `drizzle-kit`. There is no working path from code schema → database.

## The finding, in one line
> **`drizzle-kit push` and `drizzle-kit generate` are BOTH broken. Neither can reconcile the schema.
> Every schema change must be hand-written SQL, applied twice, with no tracking.**

## What it has already cost
This is not a tidiness issue. It is the **root cause** of the most expensive failures in the project:

| Consequence | Damage |
|---|---|
| **S8's CRITICAL F1** | The governance migration was applied to dev and **never to prod** → ⚠️ **all 44 brand routes 500'd.** A production-class outage. |
| **Migrations 0010–0022 applied out-of-band** | Only **10 of 25** are recorded in `__drizzle_migrations`. |
| **CI / a fresh machine gets a DIFFERENT schema** than either local DB | A fresh run produces **18 `_key` + 8 `_unique`**; both local DBs have **25 `_unique` + 0 `_key`**. |
| **The constraint rename had to be raw SQL** | Which is *why* the local DBs now diverge from the migration files. |
| **The dev/prod drift checker had to be BUILT BY HAND** | Because nothing in the toolchain could catch drift. |

**Phase 3 will add tables. The next dev/prod drift is a matter of WHEN, not IF.** Every sprint pays this
tax, and it has already produced one outage.

## The mechanism (a genuine catch-22)
1. `db/schema/auth.ts` **defines the auth tables** — needed for TypeScript inference in app code
2. `drizzle.config.ts` sets **`tablesFilter: ["!auth_*"]`** — they're owned by **Better Auth**, not
   Drizzle
3. On `push`: drizzle sees them **in the code** but not **in the DB** (they're filtered out of the
   introspection) → concludes they're missing → tries to **`CREATE`** → **`auth_accounts already
   exists`** → **fails**

⚠️ **Confirmed pre-existing** — it fails identically against a *fresh* migration DB that has the correct
auth tables. **This is structural, not environmental.**

---

## TASK

### 1 — Reproduce and read the actual error
```bash
cd c:/startup/VisibleAU/src
cat drizzle.config.ts
npx drizzle-kit push 2>&1 | head -30
npx drizzle-kit generate 2>&1 | head -30
```
**Report both errors verbatim.** Confirm `generate` fails too (not just `push`) — if `generate` works,
the fix is far simpler and we take that path.

### 2 — Pick a fix. Three options; evaluate each against THIS codebase.

**Option A — Split the schema (usually the right answer)**
Move auth tables out of the Drizzle schema barrel entirely. Keep the *types* for inference, but don't
let `drizzle-kit` see them as tables it owns.
- Are the auth tables exported from `db/schema/index.ts`? **Remove them from the barrel.**
- Does app code need auth *types*? Import them **directly** from `auth.ts`, not through the barrel.
- ⚠️ **Then `tablesFilter` may become unnecessary** — drizzle simply won't know about them.
- **Check:** does anything **JOIN** app tables to `auth_*` tables? If so, Drizzle needs the table
  definitions for query building, and this option is harder. **Report what you find.**

**Option B — A second drizzle config**
`drizzle.config.ts` (app tables, no auth) + `drizzle.auth.config.ts` (auth only, never pushed).
- Simpler, but keeps two configs in sync forever. **Fallback, not first choice.**

**Option C — Postgres schema separation**
Put auth tables in their own PG schema (`auth.*`) and scope drizzle to `public`.
- Cleanest conceptually. **But Better Auth may not support a custom schema — check its config before
  proposing this.**

⚠️ **Evaluate all three against the actual code. Do not just pick one — report what each would require,
then recommend.** The blocker for A is whether anything joins to `auth_*`.

### 3 — ⚠️ THE ACCEPTANCE TEST (this is what "fixed" means)
The fix is only real if this works **end to end**:
```bash
# 1. Add a trivial column to any app table in the schema
# 2. Generate a migration FROM THE CODE:
npx drizzle-kit generate
# → must produce a NEW migration file, and NOT try to CREATE auth tables
# 3. Apply it to BOTH DBs:
npx drizzle-kit migrate     # against visibleau
npx drizzle-kit migrate     # against visibleau_prod
# 4. Confirm it lands in __drizzle_migrations on BOTH
# 5. Revert the column, generate the down/next migration, re-apply
```
⚠️ **If `generate` still emits `CREATE TABLE auth_*`, it is NOT fixed** — regardless of whether `push`
now exits 0.

### 4 — Reconcile the migration history (the second half of the problem)
Fixing the tool doesn't fix the **15 untracked migrations**.
```bash
psql "$DEV"  -c "SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at;"
psql "$PROD" -c "SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at;"
ls db/migrations/*.sql | wc -l
```
**Report:** how many migration FILES exist vs how many are RECORDED, on each DB.

**Then propose (do not execute) a reconciliation strategy.** Options:
- **Baseline:** mark all existing migrations as applied (a "squash to current state" marker), and
  require every future one to go through drizzle.
- **Regenerate:** produce one migration representing the current schema, and treat it as migration 0.

⚠️ **Whichever we choose must guarantee: a fresh `git clone` + `drizzle-kit migrate` produces a schema
IDENTICAL to `visibleau_prod`.** **That is the actual goal.** Today it does not — it produces different
constraint names and (until F-2 is fixed) recreates the deferred `local_seo_results` table.

### 5 — While in here: the two broken guards
Both were reported today and both are **decorative**, which is worse than absent — a guard you've
learned to ignore occupies the slot a working one would fill:
- ⚠️ **The D2 dangling-import check doesn't run** — `[ -n "$DANGLING" ]` trips on Windows/`npx` empty
  output. **This is the guard added specifically because OQ-1's dead import shipped to `main`.** Fix it.
- **A10's `grep -c` emits `0\n0`** across multiple patterns → reports FAIL when the count is genuinely
  zero. Fix the aggregation.

---

## CONSTRAINTS
- ⚠️ **Do NOT run `drizzle-kit push` against `visibleau_prod`** until the acceptance test passes on a
  throwaway DB. **`push` is destructive** and prod holds the real data (19 audits, 3,405 citations).
- **Test on a fresh throwaway DB first.** Drop it after.
- **Do NOT execute the migration-history reconciliation** — propose it, and **Sri decides**.
- Do not remove `db/schema/auth.ts` — the **types** are needed. Change what `drizzle-kit` *sees*, not
  what TypeScript sees.

## REPORT BACK (paste inline)
1. The verbatim `push` **and** `generate` errors. **Does `generate` fail too?**
2. ⚠️ **Does anything JOIN app tables to `auth_*` tables?** (This decides whether Option A is viable.)
3. **All three options evaluated** against this codebase → **your recommendation, with reasoning.**
4. ⚠️ **The acceptance test:** does `generate` now produce a clean migration with **no `CREATE TABLE
   auth_*`**? Applied to both DBs and tracked?
5. **Migration files vs recorded migrations**, per DB. **Your proposed reconciliation** (do not run it).
6. The two broken guards — **fixed and re-broken**.
7. ⚠️ **The real question: does `git clone` + `drizzle-kit migrate` now reproduce `visibleau_prod`
   exactly?** If not, what's still missing?
