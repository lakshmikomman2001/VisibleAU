# Claude Code — FIX (BLOCKER): apply Sprint 4 migration 0015 + run the default-template seed

**Root cause (diagnosis):** the Sprint 4 migration `0015_phase2_sprint4_communication.sql` was **written but never
applied** to the DB. All 3 Sprint 4 tables (`report_templates`, `generated_reports`, `report_delivery_schedules`)
are **missing** → every Sprint 4 DB feature throws "relation does not exist" at runtime. The missing is_default seed
is secondary (can't seed a non-existent table). This is the "file exists ≠ applied" pattern (5th time this session).

**Severity: BLOCKER** — reports API, template editor, delivery schedules, and report generation all fail until the
tables exist.

> ⚠️ Confirm which DB you apply this to. The diagnosis read `localhost:5432/visibleau` (dev). Apply to the DB the
> app is currently using for testing. If that's the prod DB (Sri has been testing on prod-via-local), apply there
> too so the screens Sri is testing actually work — but CONFIRM which DB before running, and report it.

## STEP 1 — Apply migration 0015 (creates the 3 tables + indexes + RLS)
```bash
# Confirm the migration exists + hasn't been applied (tables absent):
ls -la db/migrations/*0015*communication*.sql 2>/dev/null
psql "$DATABASE_URL" -c "SELECT to_regclass('public.report_templates'), to_regclass('public.generated_reports'), to_regclass('public.report_delivery_schedules');"  # expect 3x NULL before
# Apply it (use the project's migration runner if there is one; else psql the file):
# Prefer the app's migrate command if it exists:
grep -n "migrate\|drizzle-kit push\|migration" package.json | head
# e.g. npm run db:migrate    (use whatever the repo uses)
# OR direct apply:
psql "$DATABASE_URL" -f db/migrations/0015_phase2_sprint4_communication.sql
# Verify tables now exist:
psql "$DATABASE_URL" -c "SELECT to_regclass('public.report_templates'), to_regclass('public.generated_reports'), to_regclass('public.report_delivery_schedules');"  # expect 3x non-NULL
```
Confirm: the migration uses `CREATE TABLE IF NOT EXISTS` / `DROP POLICY IF EXISTS` (MI-01 re-runnable) so applying
is idempotent. Confirm RLS is enabled with USING + WITH CHECK on `organization_id` for all 3 tables (LLD 8629).

## STEP 2 — Run the default-template seed (is_default per org)
```bash
# Run the seed (creates the mandatory is_default 'Default Report' template per org — LLD 8320):
npx tsx db/seed/default-report-template.ts
# Verify every org now has exactly one is_default row:
psql "$DATABASE_URL" -c "SELECT o.name, COUNT(rt.id) FILTER (WHERE rt.is_default) AS has_default FROM organizations o LEFT JOIN report_templates rt ON rt.organization_id=o.id GROUP BY o.name ORDER BY o.name;"  # expect has_default=1 for all
# Verify the seeded template shape (5 core sections include:true, 7 forward include:false, tone='professional'):
psql "$DATABASE_URL" -c "SELECT name, template_type, tone, is_default, jsonb_array_length(sections) AS n FROM report_templates WHERE is_default=true LIMIT 1;"  # expect 'Default Report','standard','professional',true,12
```
Confirm: 12 sections total; the 5 core (executive_summary, score_breakdown, mention_source_divide, fan_out_coverage,
topical_gap_summary) are `include:true`; the other 7 `include:false` (LLD 8320-8336); ON CONFLICT DO NOTHING so
re-running is safe.

## STEP 3 — Wire the seed into org creation (so future orgs aren't missing it)
The seed is currently a one-off (not wired to org creation) → any NEW org would lack the is_default template.
- Find where orgs are created (`createOrganization` / onboarding / signup) and add the is_default template
  insert for the new org (reuse the seed's INSERT, scoped to the new org id), so every new org gets its default
  template automatically. (Alternatively/additionally add the seed to the dev-start sequence.)
- Keep it idempotent (ON CONFLICT DO NOTHING).
- If wiring into org-creation is non-trivial, at minimum REPORT where it should go — but prefer doing it, since a
  missing default template is a spec violation (LLD 8317: MUST exist in every org).

## VERIFY — on screen (the fix is only real if the screens work)
After applying + seeding, RELOAD and confirm (don't just trust the migration ran):
1. **Template Editor** (`/organizations/{orgId}/report-templates`) — now shows the **seeded "Default Report"
   template** with an **is_default badge** and the 12 section toggles (5 on, 7 off), NOT "No templates yet". (This
   was the symptom — it must now show the default template per §6U.4.)
2. **Reports page** (`/brands/{brandId}/reports`) — loads without DB error; "No reports yet" empty state is now a
   REAL empty (the table exists and is genuinely empty), not a masked error.
3. **Delivery schedules** (`/organizations/{orgId}/delivery-schedules`) — loads without DB error; "No schedules —
   add one".
4. **Generate a report** (the Reports "Generate report" CTA) — now that the tables exist + a default template is
   seeded, generation should run (reads the is_default template; §14 cross-sprint: pulls Sprint 3 visibility data).
   Confirm it produces a report row (and ideally a PDF) rather than a "relation does not exist" error.
5. Console: no "relation ... does not exist" errors on any Sprint 4 screen.

## INVARIANTS
- Confirm which DB you applied to (report it). Idempotent migration (IF NOT EXISTS / DROP POLICY IF EXISTS) + seed
  (ON CONFLICT DO NOTHING) — safe to re-run.
- RLS on all 3 tables (USING + WITH CHECK on organization_id). subscriptions.tier for any tier gating (not
  organizations.tier).
- Don't change the migration's or seed's intended shape — just APPLY them. (If the migration file has a real
  defect that prevents applying, report it rather than editing silently.)
- 78 Sprint 4 tests still green after.

## REPORT
- Which DB applied to (dev/prod); tables now exist (the to_regclass check); RLS confirmed.
- Seed ran; every org has is_default=1; the seeded template shape (12 sections, 5 core on).
- Org-creation wiring: done (where) or reported as needed.
- **On-screen verification:** Template Editor shows the Default Report template (not "no templates"); Reports +
  schedules load without DB error; Generate-report produces a report (not a relation error).
- Confirm: no source logic changed (migration + seed applied, org-creation wired); which DB; 78 tests green.

## NOTE — two things the diagnosis raised
1. **"File exists ≠ applied" (5th time this session):** the migration + seed being written but never run is a
   recurring seam. Worth adding Sprint 4's migration + seed to the dev-start sequence (`START-DEV.bat` or the
   migrate script) so this doesn't recur for the next tester/session.
2. **Masked errors:** the Reports/Templates screens rendered "empty" states while the tables didn't exist — meaning
   those empty states were masking DB errors (or the pages weren't really querying yet). After this fix, re-verify
   those screens show REAL data behaviour (a seeded default template, genuine empty reports), not swallowed errors.
   If a screen still shows "empty" when it should show the seeded template, that's a separate query-wiring bug to
   report.
