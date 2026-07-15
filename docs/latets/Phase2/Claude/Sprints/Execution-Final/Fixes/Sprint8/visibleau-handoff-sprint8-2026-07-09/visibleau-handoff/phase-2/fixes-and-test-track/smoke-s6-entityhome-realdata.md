# Claude Code — REAL-DATA SMOKE: prove Fix B+A work on screen (entity-home cols populate + section renders real data)

Fix B (persist entity-home cols) + Fix A (include:true) are code-complete + test-covered (81 green). But "tests green" ≠
"works on screen" — the tests assert the code CALLS onConflictDoUpdate + reads the real column; they do NOT confirm that
a REAL run populates the cols and the section RENDERS real data. Given the bug was "computes then discards → screen shows
a guess," the only proof is seeing real data on screen after a real run. Do the smoke.

Env: Windows repo `C:\startup\VisibleAU\src\`. App on LOCAL PROD `visibleau_prod` (migrations 0018/0019 applied to BOTH;
templates re-seeded to BOTH). Never real prod. Brand: Metropolitan 418f321f-2489-4560-aaa9-895728580465.

## STEP 0 — Confirm the re-seed landed on BOTH DBs (the "next step" from the fix)
```bash
# The 2 sections are include:true in the DEFAULT template on BOTH dev and prod:
psql "$DEV_URL"  -c "SELECT sections FROM report_templates WHERE is_default=true LIMIT 1;" | grep -oE "agent_readiness|entity_home_status" | sort -u
psql "$PROD_URL" -c "SELECT sections FROM report_templates WHERE is_default=true LIMIT 1;" | grep -oE "agent_readiness|entity_home_status" | sort -u
```
Report: both sections present with include:true in the default template on BOTH DBs. (If dev/prod differ → re-seed the
missing one. This is the 4th both-DBs moment — flag whether a db:seed:all / db:migrate:all convenience should exist.)

## STEP 1 — The F-2 reality: how does entity-home/agent-readiness get triggered in S6?
Canon (prompt line 384, SR-01): `technical-audit/complete` is emitted by "**S7's technical-audit-run**" — i.e. the
AUTOMATED emitter is Sprint-7 infrastructure, NOT built yet. So in S6 the ONLY emitter is the manual refresh route. This
means: entity-home + agent-readiness scoring fire on MANUAL refresh, and the automated-after-every-audit path is
correctly DEFERRED to S7 (F-2 is a forward dependency, not a bug — confirm this).
```bash
grep -rn "technical-audit/complete\|inngest.send\|emit" app/api/brands/**/entity-home*/refresh/route.ts app/api/brands/**/agent-readiness/refresh/route.ts app/api/brands/**/*refresh*/route.ts 2>/dev/null | head
grep -rn "technical-audit/complete" inngest/ lib/ app/ 2>/dev/null | grep -iE "send\(|emit" | head
```
Report: (a) the manual refresh route emits technical-audit/complete (the S6 path that works); (b) confirm nothing in S6
is SUPPOSED to auto-emit it (that's S7 — so entity-home being NULL until a manual refresh is EXPECTED in S6, not a bug).
Note for S7: it must wire the automated technical-audit-run emitter so this fires after every audit.

## STEP 2 — Trigger the REAL entity-home flow for Metropolitan (via the path that exists)
Fire the manual refresh (or emit technical-audit/complete for the brand) so auditEntityHomeFn + scoreAgentReadinessFn run
for real:
```bash
# via the refresh route (the S6 path) — however the app triggers it (button or route call):
#   POST /api/brands/418f321f.../agent-readiness/refresh   (or the entity-home refresh)
# Wait for the Inngest fns to complete (watch the dev server / Inngest dashboard).
```
Report: the fns ran (Inngest shows them complete, not errored).

## STEP 3 — Confirm the cols are ACTUALLY POPULATED (the core of Fix B — not NULL)
```bash
psql "$PROD_URL" -c "SELECT page_url, is_entity_home_candidate, entity_home_has_org_schema, entity_home_has_id_field, entity_home_same_as_count, entity_home_page_url FROM content_structure_audits WHERE brand_id='418f321f-2489-4560-aaa9-895728580465' AND is_entity_home_candidate IS NOT NULL;"
```
Report: is there a row with is_entity_home_candidate NON-NULL and the other 4 cols populated? This is the decisive Fix-B
check — the test proved the code constructs the UPSERT; THIS proves a real run actually WROTE the cols. If still all
NULL → the persistence isn't firing in the real flow (despite the test) → Fix B not actually working; report why (fn not
triggered? guard rejecting? wrong pageUrl match?).

## STEP 4 — Entity Home SCREEN shows REAL data (not the URL heuristic)
Open `/brands/418f321f.../trust/... /entity-home` (the RetrievalHub Entity Home page, §6U.6):
- Shows real **@id present / sameAs count (target ≥3) / org-schema present / gaps** — from the persisted cols.
- NOT the old URL-heuristic guess, NOT avgCitationProbability.
- If sameAs<3 or @id missing → the Action Center recommendation fired (LLD 5740).
Report on screen: real entity-home fields render (@id/sameAs/org-schema), not a heuristic.

## STEP 5 — DEFAULT-PATH REPORT renders BOTH sections with REAL data (Fix A + B together — the decisive proof)
Generate a report for Metropolitan on the DEFAULT template (no hand-inserted template) → open the PDF / read
narrative_text:
- **agent_readiness** section renders (reads agent_readiness_scores — now populated by STEP 2). ✓
- **entity_home_status** section renders with REAL @id/sameAs/org-schema data (because STEP 3 persisted the cols) — NOT
  empty, NOT a heuristic guess, NOT citation-probability.
Report: both sections render on the DEFAULT path; entity_home_status shows REAL audited data. This is the B-gates-A proof
— A lit the section up, B gave it real data to show.

## VERDICT
- STEP 0: both sections include:true on BOTH DBs.
- STEP 1: F-2 confirmed a forward-dep (S7 auto-emits technical-audit/complete), not a bug — entity-home fires on manual
  refresh in S6.
- STEP 3: the 5 entity-home cols are POPULATED (not NULL) after a real run — Fix B works in practice, not just in tests.
- STEP 4: Entity Home screen shows real @id/sameAs/org-schema, not the heuristic.
- STEP 5: the default-path report renders BOTH sections; entity_home_status shows REAL data — Fix A+B verified together.
If STEP 3 shows NULL cols or STEP 5 shows heuristic/empty → the fix is wired but not working in the real flow; report the
gap. NO code changes unless a gap is found — this is verification.

## Constraints
- This is the SCREEN/REAL-DATA proof, not the test suite — query the real cols, run the real flow, read the real report.
- STEP 3 (cols non-NULL after a real run) + STEP 5 (section shows real data on default path) are decisive — the test
  count doesn't substitute.
- F-2: confirm the automated emitter is S7's job (not an S6 bug) but flag it for S7 (else entity-home stays NULL until
  manual refresh for every brand).
- Local prod, never real prod. LLD v8.70 / §6U.6 / §8.5 win.

## NOTE
Fix B+A are test-green but not screen-verified. The tests prove the code CALLS onConflictDoUpdate + reads the real
column; they do NOT prove a real run POPULATES the cols and the section RENDERS real data — the exact gap that's bitten
every sprint. Run the real flow (manual refresh — the S6 path; the automated emitter is S7's job, F-2 is a forward-dep
not a bug), then: (STEP 3) query content_structure_audits — are the 5 entity-home cols NON-NULL? (STEP 4) does the Entity
Home screen show real @id/sameAs/org-schema, not the URL heuristic? (STEP 5) does the default-path report render BOTH
sections with entity_home_status showing REAL data? Those three are the proof B+A actually work — "81 green" isn't.
