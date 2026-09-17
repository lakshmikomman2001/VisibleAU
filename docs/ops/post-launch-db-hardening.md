# Post-launch DB hardening

Found during the F-series sign-up-500 incident investigation (2026-09-18). None of these block
launch — Neon prod is verified clean (0 FATAL drift, 74 tables, 208 policies) as of migration 0031.
Filed here so they don't get lost, not fixed yet.

## 1. Rename the duplicate `0010_*` / `0011_*` migration files

`0010_baseline-reconcile.sql` / `0010_phase2_sprint1_platform.sql` and
`0011_phase2_sprint2_workflow.sql` / `0011_watery_cerebro.sql` share numeric prefixes. Whatever
process originally applied migrations to Neon almost certainly resolved this by lexicographic
filename order (`baseline-reconcile` before `phase2_sprint1_platform`, `phase2_sprint2_workflow`
before `watery_cerebro`) — fragile and non-obvious to a future reader. Renumber one file in each
pair (e.g. to `0010a_*` / `0010b_*`, or shift everything after up by one) with an explicit ordering
break-proof (a test or script assertion that migration filenames sort into a total, unambiguous
order) so this can't silently recur.

## 2. Diagnose and fix the `0008` duplicate-migration issue

Found as a side effect of a genuine fresh-build (0000→0031) replay for the F5 drift-guard proof:
`0008_add_brand_classification.sql` and `0008_brief_luckman.sql` both add `brands.classification`,
`classification_status`, `classification_at`, `prompt_pack`, `prompt_pack_version` — the second file
is not idempotent (`ADD COLUMN` without `IF NOT EXISTS`), so it errors on a fresh chain where the
first file already added them. On a chain run without `ON_ERROR_STOP`, this doesn't block the rest
of the migration (Postgres just logs the 5 errors and continues), which is presumably why it went
unnoticed — but it means fresh-build replays currently depend on that specific error-tolerant
behavior rather than actually succeeding cleanly. Make `0008_brief_luckman.sql`'s adds idempotent
(`IF NOT EXISTS`) and confirm a fresh replay has zero errors, not just zero *fatal* ones.

## 3. Make the migration runner hard-stop on the first failure

The current apply process (however migrations were originally run against Neon) evidently didn't
hard-stop when `0010_phase2_sprint1_platform.sql`'s `audits` `ADD COLUMN IF NOT EXISTS` block failed
to take effect — the rest of that file's later statements, and the rest of the migration chain,
continued regardless, and the gap went undetected until a real user hit it in production. Formalize
the migration runner as: one transaction per file (`BEGIN`/`COMMIT` wrapping the whole file, not just
individual guarded blocks) + `ON_ERROR_STOP=1`, so a failure anywhere in a file rolls back that file
entirely and stops the run rather than silently proceeding with a partially-applied migration. Add a
test that injects a deliberately failing statement into a scratch migration chain and asserts
nothing after it (in that file or subsequent files) got applied.

## 4. Bring local `visibleau_prod`'s stale types in line with Neon's (correct) types

`pnpm db:drift` (WARN-level, not FATAL) flags two type mismatches where **Neon has the correct,
already-fixed type** and the local mirror is stale:
- `ai_bot_ip_ranges.cidr`: local `text`, Neon `cidr` (fixed by migration 0026)
- `crawler_visit_logs.source_ip`: local `text`, Neon `inet` (fixed by migration 0026)

Local `visibleau`/`visibleau_prod` predate migration 0026's type fix in this respect. Re-run the
relevant portion of 0026 (or a targeted follow-up) against both local databases so all three
environments match exactly, and `db:drift`'s WARN list reflects only genuinely-unexplained
differences going forward.
