# Claude Code — FIX: Sprint 3 visibility tables don't exist — apply migrations 0013/0014 to the app's DB

**Root cause confirmed (unambiguous):** the Sprint 3 visibility routes 500 because the tables **do not exist in the
database the app queries.** All three errors are PostgreSQL `42P01: relation "..." does not exist`:
- `relation "topical_coverage_gaps" does not exist` (/topical-gaps route)
- `relation "visibility_trends" does not exist` (/visibility route)
- `relation "query_fan_out_results" does not exist` (/fan-out route)

The Drizzle schemas + the migration files (`0013_phase2_sprint3_visibility.sql`, `0014_phase2_sprint3_task_fks.sql`)
were CREATED during the Sprint 3 build, but **the migration was never APPLIED to the running dev database.** (68/68
tests passed because the test DB setup has the tables; the app's dev DB does not.) This is the same "file created ≠
migration applied" gap seen with `db:push` earlier. Fix = apply the migrations to the correct DB.

> ⚠️ **Which DB?** The app connects to a specific dev DB. Given this session's RLS work (the `visibleau_app` role,
> the dual `db`/`serviceDb` connection) and the earlier prod/dev confusion, the migration MUST be applied to the
> SAME database the app queries — NOT a different one, and NOT prod. Verify the target DB first.

---

## STEP 1 — Confirm which DB the app uses + whether 0013/0014 are pending
```bash
# What DB does the app's runtime connection point at? (the user-request connection)
grep -nE "DATABASE_URL|POSTGRES_URL" .env.local | head
# What migrations exist vs what's applied? Check the drizzle migrations table:
psql "$APP_DATABASE_URL" -c "SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 10;" 2>/dev/null || \
psql "$APP_DATABASE_URL" -c "SELECT * FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 10;" 2>/dev/null
# Do the Sprint 3 tables exist in the app's DB right now? (should be 0 before the fix)
psql "$APP_DATABASE_URL" -c "SELECT tablename FROM pg_tables WHERE tablename IN ('visibility_trends','topical_coverage_gaps','query_fan_out_results','share_of_voice_snapshots','prompt_volume_estimates','brand_web_mentions','google_ai_mode_results') ORDER BY tablename;"
```
Report: the app's DB name, whether `0013`/`0014` are applied or pending, and which of the 7 tables currently exist
(likely none). **Confirm the target DB is the dev DB the app uses (not prod).**

## STEP 2 — Apply the Sprint 3 migrations to the app's DB
```bash
# Apply pending migrations via the project's migration runner (check package.json for the exact script):
npx drizzle-kit migrate
# or: npm run db:migrate   /   pnpm db:migrate   (use whatever the project defines)
```
- Apply to the SAME DB the app's runtime connection uses (STEP 1). If the migration runner uses a different
  connection/role than the app, ensure `0013`/`0014` land in the app's DB.
- `0013_phase2_sprint3_visibility.sql` → the 7 tables + indexes + RLS.
- `0014_phase2_sprint3_task_fks.sql` → the 2 FK constraints onto remediation_tasks.
- These are MI-01 idempotent (CREATE TABLE IF NOT EXISTS, guarded FKs) — safe to run.

## STEP 3 — Verify the tables now exist WITH RLS (consistent with this session's security work)
```bash
# All 7 tables now present:
psql "$APP_DATABASE_URL" -c "SELECT tablename FROM pg_tables WHERE tablename IN ('visibility_trends','topical_coverage_gaps','query_fan_out_results','share_of_voice_snapshots','prompt_volume_estimates','brand_web_mentions','google_ai_mode_results') ORDER BY tablename;"
# RLS enabled + forced on the 6 tenant tables (prompt_volume_estimates is the global one, RLS DISABLED by design):
psql "$APP_DATABASE_URL" -c "SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS forced, (SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid) AS policies FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('visibility_trends','topical_coverage_gaps','query_fan_out_results','share_of_voice_snapshots','prompt_volume_estimates','brand_web_mentions','google_ai_mode_results') ORDER BY c.relname;"
# The 2 FK constraints on remediation_tasks:
psql "$APP_DATABASE_URL" -c "SELECT conname FROM pg_constraint WHERE conname IN ('fk_fan_out_gap','fk_topical_gap');"
```
Report: all 7 tables exist; the 6 tenant tables have RLS enabled+forced with policies; `prompt_volume_estimates`
is correctly RLS-DISABLED (global); both FK constraints present.

## STEP 4 — Confirm the routes stop 500ing (the on-screen fix)
- Reload the visibility hub: `localhost:3000/brands/6ece067f-063c-436b-ac42-7952c7d7a271/visibility`.
- The three routes (`/visibility`, `/topical-gaps`, `/fan-out`) should now return **200** (not 500). With **0
  audits**, they return EMPTY data → the hub should show the **graceful empty state** ("Run an audit to see
  visibility intelligence"), NOT the red "Failed to load visibility data" error.
- Confirm in the terminal: no more `42P01 relation does not exist` errors for these tables.

## INVARIANTS
- Apply migrations to the DEV DB the app uses — NOT prod, NOT a different DB.
- `prompt_volume_estimates` stays RLS-DISABLED (global seed table, by design); the other 6 get RLS (consistent with
  the session's tenant-isolation work).
- Migrations are idempotent — do not hand-edit table state; run the migration runner.
- Do NOT change the route code — the routes are correct; they were querying tables that didn't exist yet.

## VERIFY / REPORT
- STEP 1: app DB name; 0013/0014 pending or applied; which tables existed before (likely none).
- STEP 2: migrations applied to the app's DB (which command, which DB).
- STEP 3: all 7 tables now exist; 6 tenant tables RLS enabled+forced+policied; prompt_volume_estimates RLS-disabled;
  both FKs present.
- STEP 4: the 3 routes now return 200 (empty data → graceful empty state, NOT the error banner); no more 42P01 in
  the terminal.
- Confirm: applied to dev (not prod); route code unchanged; RLS consistent with the session's security posture.

## NOTE — this also flags a go-live/pipeline check
The Sprint 3 migration existing as a file but not being applied to the app's dev DB is the same class as go-live
Item 1 (migrations must actually run, not just exist). Two follow-ups to bank: (1) confirm `0013`/`0014` are in the
tracked migration pipeline so a fresh deploy applies them (they appear to be — they're numbered migration files —
but confirm they run via the pipeline, not just db:push); (2) once the tables exist, the BEHAVIOURAL PROOF for
Sprint 3 (banked earlier) can finally run: start Inngest, run a real audit, confirm the 5 visibility functions fire
and populate these now-existing tables — THAT is what turns "routes return 200 empty" into "the visibility pipeline
actually produces data." Do that after this fix (it needs the tables to exist first, which is why it couldn't run
before).
