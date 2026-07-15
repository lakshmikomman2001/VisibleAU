# Claude Code — DIAGNOSE + FIX: audit fails on citations insert AFTER applying S5 migrations (cross-sprint schema break)

Applying migrations 0016/0017 (to fix the trust 500) added S5 columns to the `citations` table — `is_accurate`,
`hallucination_flags`, `cited_source_type`, `cited_source_engine_affinity`. Now the AUDIT insert into `citations`
FAILS (screenshot: "Audit failed — Failed query: insert into citations (...) values (default,$1...default...)"). This
is a cross-sprint break: an S5 migration changed a table the Sprint-1/3 audit pipeline writes to, and the existing
insert no longer works. Get the exact Postgres error, fix the root, confirm audits run again — WITHOUT re-breaking the
trust feature.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau`, never prod. Failing audit
baa36ba7-7763-4d30-af41-adee1cbfd80d.

## STEP 1 — Get the EXACT Postgres error (the screenshot shows the query, not the constraint violation)
```bash
# Re-run the audit (Retry) and capture the dev-server terminal error — the precise line:
#   "null value in column X violates not-null constraint"  OR  "column X does not exist"  OR  a type error.
# Then inspect the actual citations table vs what the insert expects:
psql "$DATABASE_URL" -c "\d citations"
```
Report the EXACT error + the `\d citations` output (columns, types, NOT NULL, DEFAULT). Classify:
- **"null value in column ... violates not-null"** → an S5 column is NOT NULL with NO usable DEFAULT, but the insert
  passes `default` → fails. (Most likely — the insert uses `default` for is_accurate/hallucination_flags/etc.) → STEP 2A.
- **"column ... does not exist"** → the migration added columns under different names than the Drizzle insert expects,
  OR the ALTER partially applied → schema/migration mismatch. → STEP 2B.
- **type/enum error** → a new column's type/enum doesn't match the inserted value. → STEP 2C.

## STEP 2A — NOT NULL without default (fix the migration/schema)
For each S5 column the insert relies on `default` for (is_accurate, hallucination_flags, cited_source_type,
cited_source_engine_affinity):
```bash
psql "$DATABASE_URL" -c "SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name='citations' AND column_name IN ('is_accurate','hallucination_flags','cited_source_type','cited_source_engine_affinity');"
```
- If a column is `NOT NULL` with `column_default = NULL` → that's the bug. The insert says `default` but there's no
  default to use. FIX: either (a) add a sensible DEFAULT (e.g. is_accurate boolean DEFAULT true/null-ok;
  hallucination_flags jsonb DEFAULT '[]'; cited_source_type/engine_affinity DEFAULT null or a default enum), OR (b) make
  the column NULLABLE if the audit legitimately doesn't populate it at insert time (these S5 fields may be filled LATER
  by detect-hallucinations, not at citation insert).
- **Match canon:** check the S5 spec/LLD for whether these citations columns are meant to be populated at audit-insert
  time or later by the hallucination detector. If later → they should be NULLABLE (or DEFAULT null), and the audit
  insert is correct to pass `default`. The migration likely made them NOT NULL wrongly. Fix the migration to match the
  intended fill-time.
- Write the corrective migration (new numbered migration or fix 0016/0017 if not yet committed anywhere real) — idempotent, ADD ... / ALTER COLUMN ... DROP NOT NULL / SET DEFAULT as needed.

## STEP 2B — column-name/schema mismatch
```bash
# Compare the Drizzle citations schema (what the insert builds) vs the migrated table:
grep -n "is_accurate\|hallucination_flags\|cited_source_type\|cited_source_engine_affinity\|citations" db/schema/*.ts | head
```
Reconcile: the Drizzle schema column names/types must match the actual table. If the migration used different names,
fix the migration (or the schema) so they agree. Report the mismatch.

## STEP 2C — type/enum mismatch
Report the column, its type, and the value being inserted; align them (cast, enum value, or default).

## STEP 3 — Verify the audit runs AND trust still works (don't fix one, break the other)
```bash
# 1. Retry the failed audit → it COMPLETES (citations insert succeeds). Watch the audit detail page: success, not "Audit failed".
# 2. Confirm the trust hub STILL loads (the migration fix that started this must remain intact):
#    reload /brands/418f321f.../trust → real data / no 500.
# 3. Run the existing audit tests to confirm no regression:
<repo test cmd> run <audit / citations tests>
```
Report: the audit now completes, the trust hub still works, audit tests green.

## STEP 4 — Report + the bigger implication
- The exact error + which class (2A/2B/2C) + the fix (the corrective migration/schema change).
- Confirm: audit completes on retry AND trust hub still loads (both, not one).
- **FLAG for the audit:** this is a cross-sprint schema break — the S5 migration altered `citations` (a Sprint-1/3
  table) in a way that broke the audit insert, and it only surfaced when the migration was actually applied. This means
  (a) the S5 migrations were authored+tested without running against a DB that also exercises the audit insert, and (b)
  the "62 green" S5 tests did not cover "does the audit pipeline still work after S5 migrations". Both point to the same
  gap the audit-sprint5 prompt targets. Note whether OTHER Sprint-1/3 flows write to tables S5 altered (regression risk).

## Constraints
- Get the REAL Postgres error first (terminal) — do NOT guess which column; `\d citations` + the constraint message tell
  you exactly.
- Fix must MATCH canon intent: if the S5 citations columns are populated LATER (by detect-hallucinations), they should be
  NULLABLE / DEFAULT — the audit insert passing `default` is correct; the migration is wrong. If they're meant to be set
  at insert time, the AUDIT CODE must provide them (not `default`). Determine which from the spec.
- Do NOT re-break the trust feature (the migration that fixed the 500 must stay applied). Verify BOTH after the fix.
- Idempotent corrective migration. Dev DB `visibleau`, never prod. (/e?ip=0 404s = PostHog noise, ignore.)
- LLD v8.70 wins on conflict.

## NOTE
Applying the S5 migrations to fix the trust 500 added columns to `citations` (is_accurate, hallucination_flags,
cited_source_type, cited_source_engine_affinity) and now the audit insert fails — a cross-sprint schema break. Almost
certainly one of these new columns is NOT NULL without a usable DEFAULT while the audit insert passes `default`. The key
question is canon intent: are these citations fields set at audit-insert time or LATER by the hallucination detector? If
later, they must be NULLABLE/DEFAULT and the migration is wrong; if at insert, the audit code must populate them. Get
the exact Postgres error, fix to match intent, then confirm BOTH the audit completes AND the trust hub still loads —
don't fix one and break the other.
