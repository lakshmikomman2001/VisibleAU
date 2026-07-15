# Claude Code — FIX [HIGH] ×2: (5) score-agent-readiness crashes on null organization_id in the AUTOMATED audit path + (6) run-comparison-prompts never fires on audit

A REAL audit run (surfacing what the 44 tests couldn't) exposed two HIGH cross-sprint bugs. GOOD NEWS FIRST: the S7
dual-emit WORKS — the audit chain woke score-agent-readiness automatically (F-2 discharged, the whole point of S7). But
the woken function CRASHES, and comparisons never fire.

## BUG 5 [HIGH] — score-agent-readiness inserts organization_id = NULL → 23502 NOT-NULL violation → 400
Terminal (real audit): `score-agent-readiness.ts:238` insert into agent_readiness_scores fails with
`null value in column "organization_id" violates not-null constraint` (code 23502), fires twice, second returns 400. The
insert supplies brandId correctly but organization_id is `default` → null. Canon (LLD 332-333): the dual-emit sends
`data: { brandId, orgId, auditId }` — **orgId is IN the event payload.** So the function must read `event.data.orgId`
and pass it to the insert. It isn't. (Latent bug: in S6 this function ran on MANUAL refresh where org was in context; S7's
dual-emit now wakes it via the audit chain where it must read orgId from the event — and it doesn't, so it's null.)

## BUG 6 [HIGH] — run-comparison-prompts never fires on the audit → comparisons stay empty
Terminal: the audit chain ran many functions (recommendations, fanout, drift, share-of-voice, topical-gaps,
citation-sources, local-seo...) but **run-comparison-prompts is ABSENT** — it never executed. /comparisons returns 200
empty after the audit. Canon (LLD 116): run-comparison-prompts listens on **`audit/complete`** (NOT the dual-emit's
`technical-audit/complete`). So comparisons + the S3-benchmark completion depend on `audit/complete` firing → the function
running → writing comparison_prompt_results. One of these is broken: (a) `audit/complete` isn't emitted, (b)
run-comparison-prompts isn't in serve(), or (c) it listens on the wrong event.

Env: Windows repo `C:\startup\VisibleAU\src\`. LOCAL PROD `visibleau_prod`. Never real prod. Brand: Metropolitan
418f321f-2489-4560-aaa9-895728580465, org da1071de-6dbd-4e08-8f43-29f76c123be9. The fresh audit id was
8d22544c-400e-46a1-9a04-7fa5f49a27d2.

## BUG 5 — STEP 1: diagnose where organizationId should come from
```bash
sed -n '200,260p' inngest/functions/score-agent-readiness.ts    # the trigger + how it reads event data + the insert
grep -n "event.data\|orgId\|organizationId\|organization_id\|brandId\|technical-audit/complete\|trigger" inngest/functions/score-agent-readiness.ts
# And confirm the EMIT includes orgId (technical-audit-run.ts):
grep -n "technical-audit/complete\|technical-audit.complete\|orgId\|organizationId\|brandId\|auditId\|inngest.send" inngest/functions/technical-audit-run.ts
```
Report: (a) does score-agent-readiness read `event.data.orgId` (or organizationId)? (b) does the emit in
technical-audit-run.ts actually INCLUDE orgId in the payload (per LLD 332-333)? The bug is one of: function doesn't read
it, OR emit doesn't send it.

## BUG 5 — STEP 2: fix — supply organization_id to the insert from the event
- If the emit includes orgId but the function ignores it: in score-agent-readiness, read
  `const { brandId, orgId, auditId } = event.data` and pass `organizationId: orgId` to the
  `serviceDb.insert(agentReadinessScores).values({ ... organizationId: orgId ... })`.
- If the emit does NOT include orgId: fix technical-audit-run.ts to emit `data: { brandId, orgId, auditId }` (per LLD
  332-333) on BOTH the dot and slash forms, AND have the function read it.
- Do NOT hardcode/derive org from the brand as a workaround if the event is supposed to carry it — follow canon (event
  carries brandId, orgId, auditId). If the function legitimately must look it up (e.g. event only has brandId), then
  resolve organizationId from the brand record (SELECT organization_id FROM brands WHERE id = brandId) — but prefer the
  event payload per canon.
- Verify the fix path: the insert now supplies a non-null organization_id.

## BUG 6 — STEP 3: diagnose why run-comparison-prompts didn't fire
```bash
cat inngest/functions/run-comparison-prompts.ts | head -40    # what event does it listen on?
grep -n "audit/complete\|technical-audit\|inngest.createFunction\|event:\|trigger" inngest/functions/run-comparison-prompts.ts
# Is it registered in serve()?
grep -n "runComparisonPrompts\|run-comparison-prompts\|runComparison" app/api/inngest/route.ts app/api/webhooks/inngest/route.ts 2>/dev/null
# Is audit/complete actually EMITTED by the audit? (run-audit.ts or wherever the audit finishes)
grep -rn "'audit/complete'\|audit/complete\|inngest.send.*audit" inngest/functions/run-audit.ts inngest/functions/*.ts | grep -i "audit/complete" | head
```
Report which is broken: (a) run-comparison-prompts listens on the wrong event (not 'audit/complete'), (b) it's not in
serve(), or (c) 'audit/complete' is never emitted by the audit flow.

## BUG 6 — STEP 4: fix — wire run-comparison-prompts to fire on audit/complete
- If it's listening on the wrong event → change its trigger to `{ event: 'audit/complete' }` (per LLD 116).
- If it's not in serve() → add it to the serve() functions array (alongside run-journey, per LLD 116).
- If 'audit/complete' is never emitted → find where the audit COMPLETES (run-audit.ts final step) and emit
  `audit/complete` with `{ brandId, orgId, auditId }` (or confirm which existing event marks audit completion —
  comparisons must trigger off whatever fires when an audit finishes).
- Guard: run-comparison-prompts only runs when brands.competitors is non-empty (per comparison-runner spec) — Metropolitan
  HAS 4 competitors, so it should run.

## STEP 5 — RE-RUN the audit + verify BOTH on screen and in the DB
After both fixes, run a fresh audit on Metropolitan, then:
```bash
# Bug 5: agent_readiness_scores wrote WITH org_id (no 23502):
psql "$PROD_URL" -c "SELECT id, organization_id, total_score, scored_at FROM agent_readiness_scores WHERE brand_id='418f321f-2489-4560-aaa9-895728580465' ORDER BY scored_at DESC LIMIT 1;"
# Bug 6: comparisons wrote for the fresh audit:
psql "$PROD_URL" -c "SELECT count(*), audit_id FROM comparison_prompt_results WHERE brand_id='418f321f-2489-4560-aaa9-895728580465' GROUP BY audit_id ORDER BY 1 DESC LIMIT 3;"
```
- **Bug 5:** the terminal shows score-agent-readiness SUCCEEDS (no 23502, no 400); agent_readiness_scores has a fresh row
  with a non-null organization_id. AND the agent-readiness SCREEN shows the fresh auto-scored result (proving the
  automated dual-emit path now works end-to-end — the F-2 obligation genuinely discharged).
- **Bug 6:** the terminal shows run-comparison-prompts FIRES; comparison_prompt_results has rows for the fresh audit; the
  /discovery/comparisons SCREEN shows verdict cards (head-to-head vs the 4 competitors). Inconclusive (brand_won null)
  cards rendering is CORRECT, not a bug — just no crash and not-empty.
- **The S3 Competitive Benchmark screen** (CPR-01) now resolves to real data (not "Coming soon") — the cross-sprint
  completion.
Report the terminal (both functions succeed), the DB counts (both non-zero, org_id non-null), and the three screens.

## STEP 6 — Report + guards
- Bug 5: where org_id was dropped + the fix; agent_readiness_scores writes with org_id; agent-readiness screen shows the
  auto-scored result.
- Bug 6: why comparisons didn't fire + the fix; comparison_prompt_results populated; comparisons screen + S3 benchmark
  show data.
- Add guards to sprint7-invariants.sh: (a) score-agent-readiness reads orgId from event.data and the insert includes
  organizationId (grep the function) — a NOT-NULL insert without org_id is the bug; (b) run-comparison-prompts is in
  serve() AND triggers on 'audit/complete' (grep); (c) an integration test: emit technical-audit/complete → agent_readiness
  row written with org_id (re-break: drop orgId from the insert → NOT NULL fails); and emit audit/complete →
  comparison_prompt_results written (re-break: wrong event → no rows).

## Constraints
- Bug 5 is a real crash (23502) on the AUTOMATED path — the dual-emit (S7's core F-2 deliverable) woke the function but it
  can't write. org_id must come from the event payload (LLD 332-333: data carries brandId, orgId, auditId) — read it and
  pass it. This was LATENT (S6 ran this on manual refresh where org was in context); the dual-emit exposed it.
- Bug 6: comparisons fire on 'audit/complete' (LLD 116), a DIFFERENT event from the dual-emit's technical-audit/complete —
  don't conflate them. Fix whichever of trigger/serve()/emit is broken.
- Re-run a REAL audit to verify (you have live LLM). Verify in the DB (psql, both org_id-non-null and comparison rows) AND
  on all three screens (agent-readiness auto-scored, comparisons populated, S3 benchmark real).
- Local prod, never real prod. LLD v8.70 / 332-333 / 116 win.

## NOTE
A real audit run exposed two HIGH cross-sprint bugs the 44 tests missed. The GOOD news: S7's dual-emit WORKS — the audit
chain woke score-agent-readiness automatically (F-2 discharged). But (Bug 5) that woken function CRASHES inserting
agent_readiness_scores with organization_id NULL (23502, score-agent-readiness.ts:238, fires twice → 400) — it must read
orgId from event.data (LLD 332-333 emits { brandId, orgId, auditId }) and pass it to the insert; latent bug the dual-emit
exposed (S6 ran it on manual refresh where org was in context). And (Bug 6) run-comparison-prompts NEVER FIRES on the
audit — it's absent from the terminal, comparisons stay empty; it listens on 'audit/complete' (LLD 116, a different event
from the dual-emit) — fix whichever of trigger/serve()/emit is broken. Re-run a real audit, verify both functions succeed
in the terminal + DB (org_id non-null, comparison rows) + all three screens (agent-readiness auto-scored, comparisons
populated, S3 benchmark resolved). Add guards. These two are the sprint's actual cross-sprint obligations — the reason S7
exists — and neither worked end-to-end until this real-audit run caught them.
