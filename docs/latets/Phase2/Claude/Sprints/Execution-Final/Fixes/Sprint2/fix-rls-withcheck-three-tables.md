# Claude Code — FIX (security, write-path hole): add missing `WITH CHECK` to `content_drafts`, `remediation_tasks`, `subscriptions`

Three RLS policies are **`USING`-only, missing `WITH CHECK`**: `content_drafts`, `remediation_tasks`,
`subscriptions`. Now that Tier 1A stops the app bypassing RLS, this is a real, live **write-path hole**:
- `USING` filters which rows are VISIBLE (SELECT / UPDATE-target / DELETE-target).
- `WITH CHECK` validates the org of rows being **INSERTED** and the **NEW org on UPDATE**.
- Without `WITH CHECK`, a user-context write (as the now-RLS-subject app role) could **INSERT a row for another
  org, or UPDATE a row to MOVE it to another org** — defeating tenant isolation on the WRITE path even though reads
  are isolated.

This is a **known canon violation**: the LLD (v8.28 / v8.48 FIX 3) mandates the RLS policy pattern for written
tables is **`FOR ALL` with BOTH `USING` and `WITH CHECK`** — these three slipped through USING-only. `subscriptions`
is especially important: it's the **sole source of truth for tier** (Stripe mirror) — a cross-org write hole there
is a billing/entitlement-integrity risk.

> **Investigate-first — confirm each table's org-scoping column, because WITH CHECK must match it.** Read:
> - The current policies on the three tables:
>   ```bash
>   psql "$DEV_DATABASE_URL" -c "SELECT tablename, policyname, cmd, qual AS using_expr, with_check AS with_check_expr FROM pg_policies WHERE tablename IN ('content_drafts','remediation_tasks','subscriptions');"
>   ```
>   Confirm they have a `USING` expr and NULL `with_check` (the hole).
> - Each table's scoping column:
>   ```bash
>   psql "$DEV_DATABASE_URL" -c "SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('content_drafts','remediation_tasks','subscriptions') AND column_name IN ('organization_id','brand_id') ORDER BY table_name;"
>   ```
>   - If a table has **`organization_id`** → WITH CHECK uses the direct-org form.
>   - If a table has **`brand_id` only** (no organization_id) → WITH CHECK uses the brand→org JOIN form.
>   (subscriptions is a Stripe mirror — confirm whether it scopes by `organization_id` directly. content_drafts /
>   remediation_tasks — confirm which column they carry.)
> - The EXISTING policy name on each (so the DROP/CREATE reuses the SAME name — likely `org_isolation`).
> Report the current policies + each table's scoping column, then apply.

---

## THE FIX — add `WITH CHECK` matching the existing `USING`, per table's scoping column

Idempotent migration; for EACH of the three tables, DROP + reCREATE the policy as `FOR ALL` with BOTH clauses,
**mirroring the existing `USING` expression in `WITH CHECK`** (same org condition on both):

**Direct `organization_id` form** (use for tables that have `organization_id`):
```sql
DROP POLICY IF EXISTS "org_isolation" ON <table>;   -- use the ACTUAL existing policy name
CREATE POLICY "org_isolation" ON <table>
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));
```

**`brand_id`-scoped form** (use ONLY if the table has brand_id and NO organization_id):
```sql
DROP POLICY IF EXISTS "org_isolation" ON <table>;
CREATE POLICY "org_isolation" ON <table>
  FOR ALL
  USING (brand_id IN (SELECT id FROM brands WHERE organization_id::text = current_setting('app.current_org_id', true)))
  WITH CHECK (brand_id IN (SELECT id FROM brands WHERE organization_id::text = current_setting('app.current_org_id', true)));
```

- **WITH CHECK must mirror USING** — same org condition, so a write is only allowed into the caller's org.
- Reuse the **existing policy name** (from investigation) so you replace, not duplicate. Idempotent (DROP IF EXISTS).
- Do NOT change the USING expression's logic — only ADD the matching WITH CHECK. (If USING already scopes
  correctly, WITH CHECK is the same expression.)
- Keep `FORCE ROW LEVEL SECURITY` on these tables (already enabled in Tier 1A).

## INVARIANTS — do not violate
- WITH CHECK mirrors the table's existing USING org-scope (direct-org or brand-join, per the actual column).
- Only these THREE policies change. Do NOT alter other tables' policies, the Tier 2 wrapper, or the app role.
- `service_role` still bypasses (Inngest writes cross-org by design — must still work: e.g. a service_role job
  inserting a content_draft / updating a subscription from a webhook is unaffected, since service_role bypasses
  RLS entirely).
- Idempotent migration (DROP POLICY IF EXISTS → CREATE); re-runnable.
- `subscriptions.tier` remains the sole tier source-of-truth — this fix only adds write-path isolation, doesn't
  touch tier logic.

## VERIFY — write-path is now blocked cross-org (under the app role / non-superuser)
Validate as the **`visibleau_app` role** (NOT superuser, NOT service_role — those bypass):
1. Confirm WITH CHECK is now present:
   ```bash
   psql "$DEV_DATABASE_URL" -c "SELECT tablename, policyname, with_check FROM pg_policies WHERE tablename IN ('content_drafts','remediation_tasks','subscriptions');"
   ```
   → `with_check` is now non-NULL (the org condition) for all three.
2. **Write-path isolation (the point):** as `visibleau_app` inside `withRlsContext(orgA)`:
   - INSERT a row for **Org A** → succeeds.
   - Attempt to INSERT a row with **Org B's** organization_id (or a brand_id belonging to Org B) → **BLOCKED** by
     WITH CHECK (error / 0 rows), NOT allowed. (Previously this would have succeeded — the hole.)
   - Attempt to UPDATE an Org A row to set **Org B's** org (move it cross-org) → **BLOCKED** by WITH CHECK.
   - Do this for each of the three tables (subscriptions especially — confirm you can't inject/move a subscription
     cross-org).
3. **Read path unchanged:** Org A still reads only its own rows (USING still works).
4. **service_role still bypasses:** an Inngest-style service_role write (e.g. webhook updating a subscription) still
   works across orgs as designed.
5. **App healthy + no regression:** `GET /api/health` → 200; normal same-org creates/updates of tasks/drafts/
   subscriptions still succeed (WITH CHECK didn't block legitimate same-org writes). Full suite green; E2E RLS
   isolation still 11/11.

## REPORT
- The three tables' scoping columns found (organization_id vs brand_id) + the existing policy names.
- The WITH CHECK added to each (direct-org vs brand-join form), mirroring USING.
- **Write-path proof (as visibleau_app):** same-org INSERT/UPDATE succeeds; cross-org INSERT and cross-org UPDATE
  (move) are BLOCKED for all three tables (subscriptions included).
- Read path unchanged; service_role still bypasses; app healthy; suite green (+ E2E RLS 11/11).
- Confirm invariants: only these 3 policies changed, WITH CHECK mirrors USING, service_role intact, idempotent,
  tier logic untouched.

## NOTE — after this, RLS is complete (read + write) on the policied tables
With WITH CHECK on these three, all policied tenant tables enforce isolation on BOTH read and write paths, and the
app role (Tier 1A) can't bypass. The ONLY remaining security tier is **Tier 3** — explicit
`organization_id = currentUser.organizationId` checks on the ~20 routes relying on RLS-only, as defense-in-depth
(belt-and-suspenders on top of now-fully-working RLS; the 3 task routes already have it). Tier 3 is incremental and
lower-urgency now. **Go-live reminders (banked):** deployed prod must also (a) run the app as the non-superuser
role, (b) have these policies + WITH CHECK applied via the migration pipeline (not ad-hoc), (c) use real Inngest
Cloud keys. Also worth a quick look later: the `llm_response_cache` RLS-disabled decision (confirm no org-specific
content can leak via shared cache keys).
