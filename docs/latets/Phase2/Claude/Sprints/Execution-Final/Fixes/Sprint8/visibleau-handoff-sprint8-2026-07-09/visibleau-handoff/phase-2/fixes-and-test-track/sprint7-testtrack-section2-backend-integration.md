# Claude Code — S7 §11 test track — SECTION 2 of 5: Backend Integration (DB writes, event chains, RLS, cascade, CHECK)

Section-by-section: SECTION 1 (Backend Unit, 20 tests) DONE. This is SECTION 2 — Backend Integration, the MEATIEST +
most important section: it holds the tests for the two HIGH cross-sprint bugs the real audit caught (dual-emit,
comparisons-fire) + the CPR-01 acceptance criterion. Several already exist from the 7 fixes (esp. bug5-bug6-event-wiring
+ s3-benchmark + discovery-rls) — INVENTORY against §11, VERIFY each is behavioral + fires on re-break, FILL gaps. Do NOT
duplicate. Do NOT jump to Sections 3-5.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau`. LLM_MODE=mock. Never prod. tests/phase2/sprint7/.

## SECTION 2 — the §11 integration tests + exact canon:

### 1. technical-audit-dual-emit.test.ts (the F-2 seam — LLD 34-35)
technical-audit-run MUST emit BOTH: **`technical-audit.complete`** (DOT — webhook delivery / VALID_EVENTS) AND
**`technical-audit/complete`** (SLASH — internal chaining; wakes refresh-entity-score / score-agent-readiness /
audit-entity-home). Assert BOTH emits fire. AND (the Bug-5 regression) assert the SLASH payload carries **orgId** (+
brandId, auditId) — the functions destructure `orgId` (the bug was they read `organizationId` → undefined → NULL → 23502).
Re-break: (a) drop the dot emit → webhook-form assertion FAILS; (b) drop the slash emit → chaining assertion FAILS; (c)
drop orgId from the payload → the "payload carries orgId" assertion FAILS (this is the Bug-5 guard).
NOTE: bug5-bug6-event-wiring.test.ts likely already covers parts of this — confirm it asserts BOTH emits + the orgId
payload; merge/extend rather than duplicate.

### 2. run-journey.integration.test.ts (LLD 8.1)
step.run() **per engine per turn** with **stable step names** (so a retry resumes, not restarts); a retry after a
mid-journey failure **skips completed turns** (no full restart). concurrency limit 3 (CC-03). Agency+ data.
Re-break: make step names non-deterministic (include a timestamp) → the retry-resumes assertion FAILS (it restarts).

### 3. comparison-runner.test.ts — the DB-WRITE + tier part (Section 1 did the pure verdict derivation)
- Only runs when **brands.competitors non-empty** (empty → no rows, early return).
- Writes **comparison_prompt_results** rows.
- **brand_won nullable** (inconclusive rows persist with null — Section 1 tested the derivation; here assert the null
  actually WRITES to the column).
- **TIER_ENGINES respected:** Growth+ → 4 engines (chatgpt/claude/gemini/perplexity); Free/Starter → 2
  (chatgpt/perplexity). Reads **subscriptions.tier** (never organizations.tier).
Re-break: (a) empty competitors but it still writes → FAILS; (b) Starter brand producing 4-engine rows → the "2 engines"
assertion FAILS; (c) read organizations.tier instead of subscriptions.tier → the tier test FAILS.

### 4. comparison-cascade.test.ts (retention — LLD 65/113)
Deleting an **audit** cascades comparison_prompt_results (no FK violation → retention works); deleting a **journey**
cascades journey_run_results. Assert: insert audit+comparison rows → delete audit → comparison rows gone (no FK error);
same for journey→journey_run_results.
Re-break: change the FK to NO ACTION / RESTRICT → the delete throws an FK violation → the cascade test FAILS.

### 5. s3-benchmark.integration.test.ts (the CPR-01 acceptance criterion — the HOLLOW-test lesson)
Once comparison_prompt_results has rows, the S3 Competitive Benchmark route returns **real comparisonData**, NOT the
CPR-01 null/"Coming soon". CRITICAL: this test PASSED WHILE THE SCREEN SHOWED "Coming soon" (it tested the route, not the
render, and the route was never CALLED by the page). So it MUST assert the route returns real data for the CONFIGURED
competitors (brands.competitors — NOT a SOV domain), per-competitor, latest audit:
- seed comparison_prompt_results for the brand's configured competitors (latest audit) → the route returns per-competitor
  comparisonData (all configured competitors, not one, not a SOV domain like mbav.com.au).
- assert the route response's competitor_domains are a SUBSET of brands.competitors (the Bug-7b guard — SOV domains are
  NOT competitors).
- assert it reads the LATEST audit only (DISTINCT ON competitor_domain, engine / latest audit_id — LLD 284).
Re-break: (a) empty comparison_prompt_results → returns the empty/"coming soon" state (not fake data); (b) point the
competitor source at SOV's first domain → the "subset of brands.competitors" assertion FAILS.
NOTE: this test exists but was HOLLOW (passed while stubbed) — STRENGTHEN it to assert the configured-competitor data,
not just "route returns something".

### 6. discovery-rls.test.ts (cross-org isolation — LLD 66-68)
All 3 new tables (conversation_journeys, journey_run_results, comparison_prompt_results) carry **organization_id → DIRECT
org_id RLS** (USING + WITH CHECK on organization_id). Cross-org reads BLOCKED; cross-org → **404, not 401**. Protected
routes call **setRlsContext(db, orgId)** before any query (without it, RLS silently bypassed). Tier: **journeys API
Agency+**, **comparisons API Growth+** (reads subscriptions.tier).
Assert (rls_test_role NOSUPERUSER/NOBYPASSRLS + setRlsContext, the S5/S6 pattern): org A cannot read org B's rows on all
3 tables; re-break BOTH ways — drop the policy → cross-org read succeeds → FAIL; omit setRlsContext → silent bypass →
isolation test FAILS.

### 7. journey-vertical-check.test.ts (the CHECK constraint — LLD 92-94)
conversation_journeys.vertical CHECK accepts the 5 Phase-1 verticalEnum values, rejects others (insert an invalid vertical
→ CHECK violation). prompt_sequence Zod rejects <2 or >8 turns.
Re-break: insert an out-of-enum vertical and expect success → the "CHECK rejects" assertion FAILS; a 1-turn or 9-turn
prompt_sequence must be rejected by Zod.

## STEP 1 — Inventory: which of the 7 exist + are they real?
```bash
for f in technical-audit-dual-emit bug5-bug6-event-wiring run-journey comparison-runner comparison-cascade s3-benchmark discovery-rls journey-vertical-check; do
  echo "=== $f ==="; find tests -iname "*$f*" 2>/dev/null; done
grep -rln "readFileSync\|toContain.*import" tests/phase2/sprint7/*{dual-emit,event-wiring,cascade,s3-benchmark,rls,vertical}* 2>/dev/null
```
Report which exist (esp. how bug5-bug6-event-wiring overlaps dual-emit; whether s3-benchmark is the hollow version).

## STEP 2 — Verify each behavioral + re-break (ONE AT A TIME)
These hit the real dev DB / real route handlers / real emit (mocked transport) — NOT source greps. For each: confirm the
assertions above, prove re-break (break → fail → restore). Priority (the cross-sprint + acceptance ones): dual-emit
(both emits + orgId payload), s3-benchmark (STRENGTHEN from hollow → configured-competitor data), comparison-runner
(null writes + TIER_ENGINES), discovery-rls (both directions), cascade (FK), vertical CHECK.

## STEP 3 — Fill gaps + STRENGTHEN the hollow s3-benchmark
Any missing → write per spec. And STRENGTHEN s3-benchmark specifically — it passed while the screen was stubbed, so it
must now assert the configured-competitor data (subset of brands.competitors, per-competitor, latest audit), with the
re-break that empty rows → empty state and SOV-source → fails.

## STEP 4 — Run Section 2 + report, then STOP
```bash
<repo test cmd> run tests/phase2/sprint7/
```
- The 7: existed real / rewritten / built new. Re-break fired for each (esp. dual-emit orgId, s3-benchmark
  configured-competitor, comparison null+tier, rls both ways).
- Section 2 green; total count (Section 1 was 20; S7 total was 68).
STOP — do NOT start Section 3. Report, and Section 3 (walk regression guards) next.

## Constraints
- SECTION 2 ONLY (the 7 integration tests). Not Sections 3-5.
- Integration = real DB / real route / real emit (mocked transport) — NOT source greps. Inventory first; don't duplicate.
- The dual-emit test must assert BOTH the dot AND slash emits AND the orgId payload (the Bug-5 + Bug-6 guards). The
  s3-benchmark test must assert CONFIGURED-competitor data (not a SOV domain) — it was hollow before (passed while the
  screen showed "Coming soon"); the fix is to assert the rendered-shape data, latest audit.
- brand_won NULLABLE writes; TIER_ENGINES Growth 4 / Starter 2 on subscriptions.tier; RLS direct org_id, 404-not-401,
  setRlsContext required; cascade on audit + journey delete; vertical CHECK + prompt_sequence Zod 2-8 turns.
- LLM_MODE=mock. Dev DB `visibleau`, never prod. LLD v8.70 / §11 / §8 / §5 win.

## NOTE
Section 2 of 5 — Backend Integration, the meatiest: the tests for the two HIGH cross-sprint bugs the REAL AUDIT caught
(dual-emit: BOTH dot+slash emits + the orgId payload that Bug-5 dropped; comparison-runner: brand_won null WRITES +
TIER_ENGINES Growth-4/Starter-2 on subscriptions.tier) + the CPR-01 acceptance criterion (s3-benchmark — which was HOLLOW,
passed while the screen showed "Coming soon" because it tested the route not the render/config-competitors → STRENGTHEN
to assert configured-competitor data, subset of brands.competitors, per-competitor, latest audit) + retention cascade
(delete audit/journey → children gone, no FK) + discovery-rls (3 tables, direct org_id, 404-not-401, setRlsContext, both
re-break directions, journeys Agency+ / comparisons Growth+) + the vertical CHECK + prompt_sequence Zod 2-8. Several
exist from the fixes (bug5-bug6-event-wiring overlaps dual-emit; s3-benchmark exists but hollow) — INVENTORY, verify
behavioral + re-break, fill gaps, STRENGTHEN the hollow one. STOP after Section 2 and report; Sections 3 (walk guards),
4 (Frontend Unit), 5 (Frontend E2E), then QA follow.
