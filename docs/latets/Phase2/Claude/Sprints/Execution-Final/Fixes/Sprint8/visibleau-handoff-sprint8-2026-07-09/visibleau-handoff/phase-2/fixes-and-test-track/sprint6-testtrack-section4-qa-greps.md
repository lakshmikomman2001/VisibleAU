# Claude Code — S6 §11 test track — SECTION 4 of 4 (FINAL): the §12 verification greps in a re-runnable script

Section-by-section: SECTIONS 1 (Backend Unit 48), 2 (Backend Integration +19), 3 (walk regression guards, guards 6+7 now
runtime-import) all DONE. This is SECTION 4, the LAST — assemble the §12 verification greps (core + CDN enhancement) into
a re-runnable `scripts/qa/sprint6-invariants.sh`, matching S4's `sprint4-invariants.sh` and S5's `sprint5-invariants.sh`.
Add the walk-found grep guards. This completes the S6 track.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau`. Never prod.

## STEP 1 — Confirm the S4/S5 QA-script pattern to match
```bash
ls scripts/qa/ 2>/dev/null
head -30 scripts/qa/sprint5-invariants.sh 2>/dev/null   # match its structure (echo PASS/FAIL per check, exit code)
```
Report the pattern (how it prints PASS/FAIL, how it exits non-zero on any failure).

## STEP 2 — Build scripts/qa/sprint6-invariants.sh (re-runnable; PASS/FAIL per check; non-zero exit on any FAIL)
Assemble ALL of these (from core §12 + CDN §12). Each line asserts an invariant — print PASS/FAIL, track a failure count,
exit non-zero if any fail:

### Migrations / schema
- `grep -c "CREATE TABLE IF NOT EXISTS" db/migrations/*sprint6_retrieval.sql` → 4
- `grep -c "DROP POLICY IF EXISTS" db/migrations/*sprint6_retrieval.sql` → 4
- `grep -c "ADD COLUMN IF NOT EXISTS brand_token" db/migrations/*sprint6_brand_token.sql` → ≥1
- partial unique indexes: `grep -cE "llmstxt_one_current_per_brand|crawler_logs_purpose_idx" db/migrations/*sprint6_retrieval.sql` → 2

### Write patterns (append-only vs UPSERT — the clause, not comments)
- agent_readiness APPEND-ONLY: `grep -iE "\.onConflict\(|insert[^;]*on conflict" db/schema/agent-readiness-scores.ts` → none ("no ON CONFLICT OK")
- crawler_visit_logs APPEND-ONLY: `grep -iE "\.onConflict\(|insert[^;]*on conflict" inngest/functions/crawler-log-ingest.ts` → none
- content_structure_audits UPSERT: `grep -RcE "ON CONFLICT \(brand_id, page_url\)|onConflict.*page" inngest/functions/content-structure-audit.ts` → ≥1

### Score gotchas
- entity_clarity NOT score_of_10: `grep -iE "score_of_10\s*[:=)]|\.score_of_10\b" lib/retrieval/agent-readiness.ts` → none ("no score_of_10 read OK")
- local_ai_trust NULL for SaaS: `grep -Rc "vertical.*saas|'saas'" lib/platform/local-ai-trust-scorer.ts` → ≥1
- §8.4a task-fit in the RIGHT place: `grep -RcE "task_booking_accessible|task_pricing_visible|task_service_area_defined" inngest/functions/score-agent-readiness.ts lib/platform/task-fit-detector.ts` → ≥1
- and NOT in the /100 scorer: `grep -RcE "task_booking_accessible|task_pricing_visible|task_score" lib/platform/local-ai-trust-scorer.ts` → 0
- no second crawl in the scorer: `grep -RcE "crawlSite\(|fetch\(brand\.domain" inngest/functions/score-agent-readiness.ts` → 0

### Public Visit API
- isPublic: `grep -Rc "/api/visit" middleware.ts` → ≥1
- brandToken: `grep -Rc "brand_token|brandToken" app/api/visit/route.ts` → ≥1
- emit visit/ingested: `grep -Rc "visit/ingested" app/api/visit/route.ts inngest/functions/crawler-log-ingest.ts` → ≥2
- 202: `grep -Rc "202" app/api/visit/route.ts` → ≥1

### Crawler reuse + Inngest triggers
- crawler reuse (NOT a 2nd crawler): `grep -Rc "from '@/lib/crawler'|lib/crawler/index" inngest/functions/content-structure-audit.ts` → ≥1
- Wed cron: `grep -Rc "'0 22 \* \* 3'" inngest/functions/content-structure-audit.ts` → ≥1
- technical-audit/complete trigger: `grep -Rc "'technical-audit/complete'" inngest/functions/score-agent-readiness.ts inngest/functions/audit-entity-home.ts` → ≥2
- agent/readiness-scored emit: `grep -Rc "'agent/readiness-scored'" inngest/functions/score-agent-readiness.ts` → ≥1
- **5 S6 functions registered in serve()**: `grep -cE "crawlerLogIngest|contentStructureAudit|llmstxtRefresh|scoreAgentReadiness|auditEntityHome" app/api/inngest/route.ts` → **5**
  (NOTE: assert the 5 S6 fns are PRESENT — do NOT assert serve() total = 23. The real serve() total is 39 = 18 P1 + 21 P2;
  "23" in the prompt was a Phase-2-only design figure. Assert the 5, not a total.)

### Retention + explainability + RLS
- retention guarded: `grep -Rc "crawler_visit_logs" inngest/functions/*retention*.ts` → ≥1
- explainability contract: `grep -Rc "rationale|confidence_label|top_action" lib/platform/explainability.ts` → ≥1
- setRlsContext on a protected route: `grep -Rc "setRlsContext" app/api/brands/\[id\]/agent-readiness/route.ts` (or the real path) → ≥1

### Hygiene
- no hardcoded model: `grep -RnE "'claude-3|'gpt-4|'gemini-" lib/retrieval/` → 0
- no hex-alpha on CSS vars: `grep -REc "var\(--[a-z-]+\)[0-9a-fA-F]{2}" components/domain/retrieval/` → 0
- responsive present: `grep -RcE "sm:grid-cols|md:|lg:grid-cols" "app/(auth)/brands/[brandId]/retrieval/"` → ≥1
- no Clerk: `grep -Rc "Clerk|@clerk" lib/retrieval/ db/ app/api/brands/` → 0

### CDN enhancement (§12)
- detector in the right place: `test -f lib/crawler/cdn-shield-detector.ts` → OK; `test ! -f lib/platform/cdn-shield-detector.ts` → OK (no collision)
- honest-block codes present: `grep -qE "403|429|503" lib/crawler/cdn-shield-detector.ts` → OK
- wired into the crawl + writes blocked_cdn: `grep -qE "CdnShieldDetector|analyzeHeaders" inngest/functions/content-structure-audit.ts` → OK; `grep -qE "blocked_cdn" inngest/functions/content-structure-audit.ts` → OK
- NO firewall schema drift: `! grep -rqE "ADD COLUMN.*(firewall|cdn|remediation)" db/` → OK (must find NOTHING)
- 200-not-blocked test exists: `grep -qE "200" tests/phase2/sprint6/cdn-shield-detector.test.ts && grep -qE "false|toBe\(false\)"` → OK

### The WALK-FOUND grep guards (this session's bugs — keep them in the invariant script too)
- **hardcoded-white (the recurring class)**: `grep -rEc "color:\s*[\"']white[\"']" app/ components/` → **0**
- **the -foreground/-fg typo (S5's class, confirm it stays 0)**: `grep -rc "accent-primary-foreground" app/ components/` → 0
- **no standalone llms.txt depth /18 hub card** (if greppable in the hub component): assert the depth stat card copy is
  absent from the hub stat-summary component → 0

## STEP 3 — Run the script + report
```bash
bash scripts/qa/sprint6-invariants.sh; echo "exit: $?"
```
- Every check PASSES; exit 0.
- If any FAILS → report which (a real invariant violation to investigate, OR a path mismatch in the grep to correct —
  distinguish which). Adjust grep PATHS to the real repo paths where needed (the prompt's paths are indicative); do NOT
  weaken an ASSERTION to make it pass — fix the path or report the real violation.
- Re-runnable: run it twice, same result.

## STEP 4 — Final report: the WHOLE S6 test track (all 4 sections)
- Section 1 (Backend Unit): count.
- Section 2 (Backend Integration): count.
- Section 3 (walk regression guards, incl. the runtime-import guards 6+7): count.
- Section 4 (this): the §12 grep script green + re-runnable.
- Full sprint6 suite total (unit + integration) + the QA script.
- Confirm the track matches the S2/S3/S4/S5 structure: §11 named tests + §12 grep script.

## Constraints
- Match the S4/S5 QA-script pattern (PASS/FAIL per check, non-zero exit on any fail, re-runnable).
- Assert the 5 S6 functions PRESENT in serve() — NOT serve() total = 23 (the real total is 39; 23 was a Phase-2-only
  figure). Asserting =23 would FALSELY fail.
- Fix grep PATHS to real repo paths where the indicative paths differ; do NOT weaken an assertion to pass — fix path or
  report the real violation.
- Include the walk-found grep guards (color:"white" → 0; -foreground → 0) in the invariant script.
- Never prod. LLD v8.70 / §12 / CDN §12 win.

## NOTE
Section 4 of 4 — the FINAL section: the §12 verification greps (core + CDN enhancement) assembled into a re-runnable
scripts/qa/sprint6-invariants.sh matching S4/S5's pattern (PASS/FAIL per check, non-zero exit on fail). Covers the
write-pattern clauses, score gotchas, the public Visit API, Inngest triggers, RLS/explainability, hygiene, the CDN
honest-block + no-schema-drift, AND the walk-found grep guards (hardcoded color:"white" → 0, the -foreground typo → 0).
IMPORTANT: assert the 5 S6 functions PRESENT in serve(), NOT serve() total = 23 (the real total is 39 = 18 P1 + 21 P2;
"23" was a Phase-2-only design figure — asserting it would falsely fail). Fix grep paths to the real repo, don't weaken
assertions. This completes the S6 §11 track: Backend Unit + Backend Integration + walk regression guards + the §12 QA
script — matching the S2/S3/S4/S5 structure.
