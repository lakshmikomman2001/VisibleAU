# Claude Code — DIAGNOSE (report-first, NO fixes): missing is_default report template seed

**Symptom (manual pass):** the Template Editor (`/organizations/[orgId]/report-templates`, org
`49bc204c-ef83-4f08-ac76-a46f5d005d0e`) shows **"No templates yet"** (zero templates). Per spec, this should be
impossible — every org MUST have a seeded `is_default` "Default Report" template, and the empty state should be
*"only the default template: show it"* (§6U.4), not "no templates."

**DIAGNOSE ONLY — change no source or data. Report cause + fix direction.**

## ✅ THREE-SOURCE CHECK (done) — what SHOULD exist
- **LLD 8317-8319 (SEED REQUIREMENT, authority):** "A system-default template row (is_default=true) **MUST exist in
  every organization's report_templates** before generate-narrative-report.ts can run. Seed this in Phase 2 Sprint 4
  setup (`db/seed/default-report-template.ts`)." **M-04 (3526):** the is_default row must exist before generation.
- **The canonical seed (LLD 8320-8336):** `INSERT INTO report_templates (organization_id, name='Default Report',
  template_type='standard', sections=[...12 ReportSection types, 5 core `include:true`: executive_summary,
  score_breakdown, mention_source_divide, fan_out_coverage, topical_gap_summary; 7 forward `include:false`], tone=
  'professional', is_default=true) FROM organizations ... ON CONFLICT DO NOTHING`.
- **Sprint 4 prompt §5.4 (line 88-89):** "1 mandatory seed: the per-org is_default report template — **without it
  generate-narrative-report can't resolve a template (it FALLS BACK to all-core-sections, but...)**." §6U.4 empty
  state = "only the default template: show it".
- **IMPORTANT NUANCE (LLD 8338 + §5.4 line 89):** generate-narrative-report **"Falls back to all-core-sections if
  no row found."** So a MISSING seed may NOT hard-block generation (there's a fallback) — but it IS a spec
  violation (the mandatory seed is absent), the Template Editor shows a wrong "no templates" state, and the fallback
  is a safety net, not the intended path. Determine BOTH: is the seed missing, AND does generation actually fall
  back gracefully or fail.

## STEP 1 — Does the seed FILE exist, and was it run?
```bash
# The seed file the spec requires (§5.4, LLD 8319):
ls -la db/seed/default-report-template.ts 2>/dev/null || echo "MISSING: db/seed/default-report-template.ts"
find . -iname "*default*report*template*" -o -iname "*report*template*seed*" 2>/dev/null | grep -v node_modules | head
# Is it wired into a seed runner / package script / migration that actually executes?
grep -rn "default-report-template\|default.report.template\|Default Report\|is_default.*true" db/ scripts/ package.json 2>/dev/null | grep -iv node_modules | head
```
Report: does the seed file exist? Is it referenced by any runner/script that would execute it (or is it an orphan
file that was never run)?

## STEP 2 — Does the is_default row actually exist in the DB? (this org + all orgs)
```bash
# This specific org (the one showing "no templates"):
psql "$DATABASE_URL" -c "SELECT id, name, template_type, is_default, tone, jsonb_array_length(sections) AS n_sections, created_at FROM report_templates WHERE organization_id='49bc204c-ef83-4f08-ac76-a46f5d005d0e';"
# ALL orgs — how many have an is_default template vs how many orgs exist:
psql "$DATABASE_URL" -c "SELECT o.id, o.name, o.created_at, COUNT(rt.id) FILTER (WHERE rt.is_default) AS has_default FROM organizations o LEFT JOIN report_templates rt ON rt.organization_id=o.id GROUP BY o.id, o.name, o.created_at ORDER BY o.created_at;"
```
Report: does THIS org have an is_default row (expected: yes; likely: no)? How many of the total orgs have one? (If
zero orgs have it → the seed never ran anywhere. If only newer orgs have it → the seed runs on new-org creation and
existing orgs weren't backfilled.)

## STEP 3 — Determine WHEN the seed is supposed to run (org creation vs setup vs backfill)
```bash
# Is the seed invoked at org creation, or only as a one-off setup script?
grep -rn "default-report-template\|createOrganization\|onboard\|seedDefaultTemplate\|report_templates" app/ lib/ db/ 2>/dev/null | grep -iE "insert\|seed\|create.*org\|org.*create\|is_default" | grep -v node_modules | head
```
Report: is there code that seeds the is_default template when an org is created? Or is it purely a manual/setup
seed that must be run once? (This determines: run-the-seed vs backfill-existing-orgs vs wire-into-org-creation.)

## STEP 4 — Does generation actually fall back gracefully? (the severity question)
The LLD says generate-narrative-report falls back to all-core-sections if no is_default row. Confirm the code
really does this (so we know if "Generate report" will work despite the missing seed, or fail):
```bash
grep -n "is_default\|isDefault\|fallback\|all.core\|core.section\|report_templates\|LIMIT 1" inngest/functions/generate-narrative-report.ts lib/communication/narrative-generator.ts 2>/dev/null | head
```
Report: does `generate-narrative-report` handle the no-template case with a real fallback (all-core-sections), or
would it throw/misbehave if the is_default row is missing? (This tells us whether the missing seed BLOCKS report
generation or is "just" a spec/UX violation with a working fallback.)

## VERDICT (report, with evidence)
Classify:
- **Seed file missing entirely** → never created. Fix: create `db/seed/default-report-template.ts` per LLD 8320 +
  run it (+ wire into org creation).
- **Seed file exists but never ran** → the "file exists ≠ applied" pattern (hit repeatedly this session). Fix: run
  the seed against the DB (backfill all orgs missing the row).
- **Seed runs only on NEW org creation** → existing orgs (like this one) predate it. Fix: backfill existing orgs +
  confirm new-org path seeds it.
- **Seed logic exists but is broken** (e.g. ON CONFLICT skipping, wrong org scope) → report the bug.
And separately: **does generation fall back gracefully (works despite missing seed) or fail (blocked)?** — this sets
the severity (UX/spec violation vs generation blocker).

## REPORT
- STEP 1: seed file exists? wired to a runner?
- STEP 2: is_default row for THIS org (yes/no) + how many of all orgs have one.
- STEP 3: is the seed wired to org creation, or a one-off?
- STEP 4: does generate-narrative-report fall back to all-core-sections (works) or fail (blocked) without the row?
- **Verdict** (which of the 4 causes) + **severity** (blocker vs spec/UX-only, based on STEP 4) + the fix direction
  (create seed / run seed / backfill orgs / wire to org-creation / fix logic) for Sri to approve.
- Confirm: no source or data changed (diagnosis only); which DB (dev/prod) this read.

## NOTE — relationship to the Generate-report test
This gates the "Generate report" flow Sri is about to test. If STEP 4 shows generation FAILS without the is_default
row → the missing seed is a BLOCKER and must be fixed before report generation works. If generation FALLS BACK
gracefully → "Generate report" will work, but the Template Editor's "no templates" state is still a spec violation
(should show the seeded default) + the mandatory seed is still missing. Either way it's a real finding; STEP 4
decides how urgent.
