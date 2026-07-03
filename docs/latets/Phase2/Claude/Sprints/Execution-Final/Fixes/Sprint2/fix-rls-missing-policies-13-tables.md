# Claude Code — FIX (security, confirm-first): add RLS policies to the org-scoped tables that have NONE

Diagnosis flagged **~13 org-scoped tables with NO RLS policy.** The Tier 2 `withRlsContext` wrapper (just done)
makes RLS work for tables that HAVE a policy — but does NOTHING for tables with no policy. So these tables are
currently protected ONLY by explicit org checks on their routes (which most lack), not by RLS. They are the
remaining live cross-tenant exposure.

**CONFIRM-FIRST, then fix.** "13 tables" is a claim to verify — some flagged tables may be **global/seed tables
that CORRECTLY have no RLS** (no `organization_id`, not tenant-scoped), in which case the real number is smaller.
And the fix differs by scoping pattern (see below). Confirm the exact list before adding any policy.

## Canon context (authoritative)
- The Phase 2 LLD lists **30 tenant tables that REQUIRE RLS** (Layers 1-6: audit_cost_snapshots, crawler_visit_logs,
  content_structure_audits, llmstxt_versions, agent_readiness_scores, share_of_voice_snapshots, visibility_trends,
  brand_web_mentions, query_fan_out_results, topical_coverage_gaps, google_ai_mode_results, hallucination_incidents,
  evidence_snapshots, citation_source_intelligence, linkedin_presence_audits, brand_consensus_checks,
  youtube_presence_audits, conversation_journeys, journey_run_results, comparison_prompt_results, remediation_tasks,
  workflow_runs, content_drafts, report_templates, … + the Phase 1 tenant tables). Use this as the "should have RLS"
  reference.
- **TWO scoping patterns — handle BOTH:**
  - **Direct `organization_id`:** policy uses `organization_id::text = current_setting('app.current_org_id', true)`.
  - **`brand_id` only, NO `organization_id`** (e.g. Phase 1 `brand_entity_scores`, and others — "RLS enforced via
    JOIN to brands"): the policy must scope via the brand's org, e.g.
    `brand_id IN (SELECT id FROM brands WHERE organization_id::text = current_setting('app.current_org_id', true))`.
    Do NOT try to compare a non-existent `organization_id` column on these.
- **Global/seed tables that CORRECTLY have NO RLS — do NOT add policies** (canon: 7 global tables, RLS DISABLED):
  e.g. `vertical_packs`, `vertical_pack_prompts`, `citability_methods`, `validation_corpus_results`, and other
  lookup/enum/seed tables with no `organization_id` and no tenant `brand_id`. Adding RLS to these would break shared
  content. Confirm each candidate is genuinely tenant-scoped before policying it.
- **Policy form (canon, REQUIRED):** `FOR ALL` with BOTH `USING` and `WITH CHECK` (NOT USING-only — WITH CHECK
  stops a user-context write from INSERTing/moving a row to another org). Idempotent: precede `CREATE POLICY` with
  `DROP POLICY IF EXISTS "org_isolation" ON <table>;` (Postgres has no CREATE POLICY IF NOT EXISTS).

> **Investigate-first (STEP 1 is the confirmation; do NOT add policies until the list is verified).**

---

## STEP 1 — Enumerate which tables ACTUALLY lack RLS, and classify each
```bash
# Every table: does it have RLS enabled + an org policy?
psql "$DEV_DATABASE_URL" -c "SELECT c.relname AS table, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced, (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY rls_enabled, policy_count, c.relname;"
# Which tables have organization_id vs brand_id vs neither?
psql "$DEV_DATABASE_URL" -c "SELECT table_name, MAX(CASE WHEN column_name='organization_id' THEN 1 ELSE 0 END) AS has_org_id, MAX(CASE WHEN column_name='brand_id' THEN 1 ELSE 0 END) AS has_brand_id FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name ORDER BY table_name;"
```
Build the **definitive list** of tables that are tenant-scoped (have `organization_id` OR `brand_id`) but have
`rls_enabled=false` OR `policy_count=0`. For EACH, classify:
- **(O)** has `organization_id` → needs direct-org policy.
- **(B)** has `brand_id` only (no `organization_id`) → needs brand-join policy.
- **(G)** GLOBAL/seed — no `organization_id`, no tenant `brand_id`, shared content (cross-ref the canon global list:
  vertical_packs, vertical_pack_prompts, citability_methods, validation_corpus_results, lookup/enum tables) →
  **NO policy, correctly RLS-disabled. EXCLUDE.**

**Report the classified list** (table → O/B/G → current rls/policy state). The count of (O)+(B) is the real number
needing policies. Confirm it against the diagnosis's "13" — note any discrepancy (e.g. some of the 13 turn out to
be (G) globals, or some tenant tables weren't in the 13).

## STEP 2 — Add `org_isolation` policies to the confirmed (O) and (B) tables ONLY
Create an idempotent migration adding, for EACH confirmed tenant table missing RLS:

**(O) direct organization_id:**
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON <table>;
CREATE POLICY "org_isolation" ON <table>
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));
```

**(B) brand_id-scoped (no organization_id):**
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON <table>;
CREATE POLICY "org_isolation" ON <table>
  FOR ALL
  USING (brand_id IN (SELECT id FROM brands WHERE organization_id::text = current_setting('app.current_org_id', true)))
  WITH CHECK (brand_id IN (SELECT id FROM brands WHERE organization_id::text = current_setting('app.current_org_id', true)));
```
- Match the EXACT canon pattern (`FOR ALL`, both `USING` + `WITH CHECK`, `current_setting('app.current_org_id',
  true)`). Policy name `org_isolation` (consistent with existing policies — confirm the convention).
- Idempotent (`IF EXISTS` drops, `ENABLE RLS` is no-op if already on). Whole migration re-runnable.
- Consider `FORCE ROW LEVEL SECURITY` if that's the existing convention on the other 30 tables (so even the table
  owner is subject to RLS) — match what the already-policied tables do. Report.

## STEP 3 — Do NOT touch
- The (G) global/seed tables — leave RLS disabled (vertical_packs, vertical_pack_prompts, citability_methods,
  validation_corpus_results, lookup/enum tables). Adding RLS breaks shared content.
- The 30 tables that already HAVE correct policies — don't duplicate/alter.
- This is the policy-addition pass ONLY. Do NOT do Tier 3 (explicit route org checks) or Tier 1A (DB role) here.

## INVARIANTS — do not violate
- Policies added ONLY to confirmed tenant-scoped tables ((O) or (B)). Global/seed tables stay RLS-disabled.
- `FOR ALL` + `USING` + `WITH CHECK`, `current_setting('app.current_org_id', true)` — the canon form. WITH CHECK is
  mandatory (write-path isolation).
- brand_id-only tables use the brand→org JOIN form, NOT a non-existent organization_id comparison.
- Idempotent migration (DROP POLICY IF EXISTS before CREATE; CREATE TABLE/INDEX patterns already established).
- service_role bypass preserved (Inngest jobs use service_role which bypasses RLS by design — must still work).
- Don't regress the Tier 2 wrapper or existing passing tests.

## VERIFY — under NON-superuser role (or false pass)
1. After migration, re-run the enumeration (STEP 1 query): the confirmed tenant tables now show `rls_enabled=true`
   + `policy_count≥1`. The (G) globals still show disabled (correctly).
2. **Isolation tests under `rls_test_role` (non-superuser):** for a representative NEW-policy table of EACH type
   ((O) and (B)), set context to Org A and confirm:
   - Reading returns ONLY Org A's rows (not Org B's).
   - With context = Org A, attempting to INSERT/UPDATE a row with Org B's org/brand is BLOCKED by WITH CHECK.
   - (B) tables: cross-org access via a foreign brand_id returns empty.
   NEVER validate as superuser — superuser bypasses RLS (false pass). Confirm the role.
3. **service_role still bypasses** (Inngest path): a service_role query still sees across orgs as designed (not
   broken by the new policies).
4. Full suite green (1237+); the Tier 2 isolation tests still pass; correct-org reads/writes still work (policies
   didn't over-restrict).

## REPORT
- **STEP 1 classified list:** every tenant-scoped table missing RLS → (O)/(B)/(G), with current state. The real
  count of (O)+(B) needing policies, and how it compares to the diagnosis's "13" (note discrepancies — e.g. which
  flagged tables were actually (G) globals).
- The migration added (which tables, (O) direct vs (B) brand-join form).
- **Verification under non-superuser role:** new-policy tables now isolate (read + WITH CHECK write block) for both
  (O) and (B); globals still disabled; service_role still bypasses. Suite green.
- Confirm invariants: only tenant tables policied, globals untouched, FOR ALL + USING + WITH CHECK, brand-join form
  where needed, idempotent, service_role intact, Tier 2 not regressed.

## NOTE — remaining tiers
After this: the org-scoped tables that had no RLS now have it (and the Tier 2 wrapper makes it actually enforce).
Remaining reviewed passes: **Tier 3** — explicit `organization_id = currentUser.organizationId` checks on the ~20
routes that rely on RLS-only, as defense-in-depth (the 3 task routes already have this); **Tier 1A** — run the app
as a NON-superuser DB role so the app connection can't bypass RLS even if something's misconfigured (one-time
migration + connection-string/env change). Recommended next: Tier 1A (small, high-value — closes the "app role
bypasses RLS" gap that the verify step relies on a test role to simulate), then Tier 3 (incremental).
