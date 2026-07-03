# Claude Code — FIX (Tier 1A, makes RLS REAL): run the app as a NON-superuser DB role

**This is the tier that makes all the RLS work actually apply to real traffic.** Tier 2 (`withRlsContext`) + the 14
table policies are PROVEN in tests — but tests validate under `rls_test_role` (non-superuser). If the **app itself
connects to Postgres as a superuser or a role with `BYPASSRLS`** (e.g. the `postgres` superuser, or the Supabase
`service_role`), then **RLS is bypassed for every real request** — the policies exist but the app sails straight
through them. Superuser and `BYPASSRLS` roles ignore RLS entirely, even `FORCE ROW LEVEL SECURITY`. So the whole
RLS model could be enforced only in tests, not in production.

Canon two-role model: **`service_role` bypasses RLS BY DESIGN** (used by Inngest background jobs — must keep
bypassing), while **API-route queries are supposed to be RLS-constrained**. Tier 1A ensures the API/user-request
path uses a NON-BYPASSRLS role so RLS actually enforces there, while preserving service_role for Inngest.

> **CONFIRM-FIRST — the critical unknown is what role the app currently connects as.** If it's already a properly
> scoped non-superuser role, this may be a no-op (report that). If it's superuser/service_role/BYPASSRLS on the
> user-request path, that's the gap to close.

---

## STEP 1 — Determine what role the app ACTUALLY connects as (the critical check)
```bash
# What connection string / role does the app's user-request DB client use?
grep -rnE "DATABASE_URL|SUPABASE_SERVICE|service_role|POSTGRES_URL|connectionString|postgres://|postgresql://" .env.local .env db/client.ts src/db/client.ts lib/db/*.ts 2>/dev/null | head -20
# Is there a SEPARATE service_role client for Inngest vs a user-request client for API routes?
grep -rn "service_role\|SERVICE_ROLE\|createClient\|new Pool\|drizzle(" db/ src/db/ lib/ inngest/ --include=*.ts | head -20
```
Then check the role's actual privileges in Postgres:
```bash
# Connect AS THE APP'S ROLE (use the role from DATABASE_URL the app uses) and check:
psql "$DEV_DATABASE_URL" -c "SELECT current_user, session_user;"
psql "$DEV_DATABASE_URL" -c "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;"
# List all roles + their RLS-bypass status:
psql "$DEV_DATABASE_URL" -c "SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles ORDER BY rolsuper DESC, rolbypassrls DESC;"
```
**Report the decisive facts:**
- What role does the app's **user-request** DB client connect as? Is `rolsuper = true` or `rolbypassrls = true`
  for it? **If yes → RLS is currently bypassed for all real app traffic (the gap).** If it's already a
  non-superuser, non-BYPASSRLS role → RLS is real; this tier may be a no-op (confirm + report).
- Is there a SEPARATE client for Inngest (service_role, SHOULD bypass) vs API routes (SHOULD NOT bypass)? Or does
  everything share ONE connection/role?

## STEP 2 — If the app-request path bypasses RLS: create a scoped non-superuser app role
Create a dedicated **non-superuser, non-BYPASSRLS** role for user-request/API queries, with least-privilege grants:
```sql
-- Idempotent-ish; adapt to Supabase/your PG. Name e.g. app_authenticated / visibleau_app.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'visibleau_app') THEN
    CREATE ROLE visibleau_app LOGIN PASSWORD '<from-secret>' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- Least-privilege grants: DML on the app's tenant/data tables, NO DDL, NO superuser.
GRANT USAGE ON SCHEMA public TO visibleau_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO visibleau_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO visibleau_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO visibleau_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO visibleau_app;
-- Ensure this role is subject to RLS: it must NOT own the tables (owners bypass RLS unless FORCE RLS),
-- and must NOT have BYPASSRLS. FORCE ROW LEVEL SECURITY on the tenant tables also guarantees enforcement
-- even for owners — confirm/enable FORCE RLS on the policied tables if not already.
```
- The role MUST be `NOSUPERUSER NOBYPASSRLS`. Confirm `rolsuper=false`, `rolbypassrls=false`.
- Grant exactly what the app needs (DML on data tables; no DDL, no role/db creation). Do NOT grant BYPASSRLS.
- If Supabase: the equivalent may be using the `authenticated`/`anon` role for user requests (RLS-subject) and
  reserving `service_role` for Inngest — report which model applies and use the RLS-subject role for API queries.
- Ensure tenant tables have **`FORCE ROW LEVEL SECURITY`** (so even if the role somehow owns a table, RLS still
  applies) — match the convention on the already-policied tables.

## STEP 3 — Point the app's USER-REQUEST connection at the non-superuser role
- Switch the **API-route / user-request** DB client's connection string to the new `visibleau_app` role (local
  `.env.local` for now; the deployed prod env gets the same treatment at go-live — flag, don't set prod here).
- **KEEP `service_role` for the Inngest client** — Inngest jobs bypass RLS BY DESIGN (canon). Do NOT move Inngest
  to the constrained role, or background jobs that legitimately operate across orgs will break.
- If everything currently shares ONE client/role, SPLIT it: a service_role client for Inngest, a `visibleau_app`
  (RLS-subject) client for API routes. Report how you split it.
- LOCAL scope: change `.env.local` only. Do NOT change deployed prod config here (go-live task).

## INVARIANTS — do not violate
- The API/user-request role is `NOSUPERUSER NOBYPASSRLS` — RLS MUST apply to it.
- **`service_role` (RLS-bypass) preserved for Inngest** — background jobs legitimately cross orgs; don't break them.
- Least-privilege: DML only for the app role, no DDL/superuser/BYPASSRLS.
- Do NOT weaken the Tier 2 wrapper or the 14 policies. Do NOT do Tier 3 (route checks) here.
- LOCAL `.env.local` only — deployed prod role switch is a separate go-live step (flag it).
- `withRlsContext` still sets `app.current_org_id`; now it actually MATTERS because the role can't bypass.

## VERIFY — RLS now enforces for the APP's OWN connection (not just a test role)
This is the proof the whole RLS model is real in the app:
1. Confirm the app's user-request role: `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname='visibleau_app';`
   → both **false**.
2. **Connect AS `visibleau_app`** (the app's actual role, not a superuser, not the test role) and, inside a
   `withRlsContext(orgA)` transaction, confirm:
   - Reading a tenant table returns ONLY Org A's rows.
   - WITHOUT setting context (or with a foreign org), the query returns EMPTY (RLS enforced) — NOT all rows.
   - This must hold for the ACTUAL app role, proving RLS isn't bypassed on real traffic.
3. **service_role still bypasses** (Inngest path): connect as service_role, confirm it still sees across orgs (jobs
   work).
4. App healthy end-to-end on the new role: `GET /api/health` → 200; a normal authenticated request returns the
   correct org's data (the app role has sufficient grants — not over-restricted, no permission-denied errors).
5. Full suite green (1237/1186+); Tier 2 isolation tests still pass; no new permission-denied failures from the
   grant scoping.

## REPORT
- **STEP 1 (the key finding):** what role the app's user-request path connected as, and whether it was
  superuser/BYPASSRLS (RLS bypassed on real traffic) or already constrained. Whether Inngest and API shared one
  role/client.
- The `visibleau_app` role created (NOSUPERUSER NOBYPASSRLS + grants), or confirmation the app was already on a
  proper role (no-op).
- How the connection was split (service_role for Inngest, app role for API) and the `.env.local` change.
- **Verification:** RLS enforces for the app's OWN role (read scoped, unset-context returns empty), service_role
  still bypasses, app healthy, no permission-denied, suite green.
- Confirm invariants: app role NOSUPERUSER/NOBYPASSRLS, service_role preserved for Inngest, least-privilege, Tier 2
  + policies intact, local-only (prod role switch flagged for go-live).

## NOTE — after this, RLS is real; only Tier 3 remains
Once the app runs as a non-BYPASSRLS role, the Tier 2 wrapper + the policies actually enforce on production traffic
(not just tests). Remaining: **Tier 3** — explicit `organization_id = currentUser.organizationId` checks on the ~20
routes that rely on RLS-only, as defense-in-depth (belt-and-suspenders on top of now-working RLS; the 3 task routes
already have this). Tier 3 is incremental and lower-urgency now that RLS genuinely enforces. **Go-live reminder:**
the deployed prod app connection must ALSO use the non-superuser role (this prompt changed local only) — set that
when configuring prod, alongside the prod Inngest Cloud keys.
