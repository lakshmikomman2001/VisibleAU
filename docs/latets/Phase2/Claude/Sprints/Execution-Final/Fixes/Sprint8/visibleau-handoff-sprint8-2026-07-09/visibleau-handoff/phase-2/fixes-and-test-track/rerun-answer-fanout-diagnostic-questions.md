# Claude Code — RE-RUN, ANSWER THE ACTUAL QUESTIONS (the last reply skipped them)

Your last reply re-ran the dev-vs-prod row comparison + the code inspection from the PRIOR turn and relabelled them
STEP 1–4. That is not what this diagnosis asked. You did NOT answer: (1) is fan-out registered in prod serve()? (2)
does run-audit.ts emit `audit/complete`? (3) do the OTHER post-audit tables have rows? (4) does Inngest run history show
a fan-out run+error for the July 3 audit? (5) the gate checks. Those five are the diagnosis. Answer THEM, with command
output — do not restate the code inspection or the dev/prod malformation counts (already established: wrapper gone,
dev-only stale rows). 

Also: **"CLOSED by code inspection" is rejected.** 10b was deferred to PROD precisely because reading the code is NOT
sufficient — the code was equally readable in mock. A bug whose verification requires real-LLM output cannot be closed
by re-reading source. And an unexplained ZERO-row `query_fan_out_results` on a feature that SHOULD fire after a
completed Agency-tier audit is an OPEN question, not a "clean slate." Diagnose the empty table. Change NO source/data.

Run these EXACTLY and paste the raw output of each:

## Q1 — Is `simulate-query-fan-out` in the prod serve() array? (yes/no + the list)
```bash
sed -n '1,80p' app/api/webhooks/inngest/route.ts
grep -nE "simulateQueryFanOut|simulate-query-fan-out|classifyCitationSources|calculateShareOfVoice|detectHallucinations|runComparisonPrompts|aggregateVisibilityTrend|renderReportPdf|generateNarrativeReport" app/api/webhooks/inngest/route.ts
```
ANSWER: paste the full `functions: [ ... ]` array. Is `simulate-query-fan-out` in it — YES or NO? Which of the other
post-audit functions are in it? (Don't summarise — show the array.)

## Q2 — What event does run-audit.ts EMIT on completion? (the exact string)
```bash
grep -n "inngest.send\|name: *'audit\|name: *\"audit\|audit/complete\|audit.complete\|audit.completed\|markComplete\|emit" inngest/functions/run-audit.ts
sed -n '1,40p' inngest/functions/run-audit.ts | grep -n "event\|audit"
```
ANSWER: quote the exact `inngest.send({ name: '...' })` line run-audit uses when the audit finishes. Is it EXACTLY
`'audit/complete'` (slash)? Or `audit.complete` / `audit.completed` (dot) / absent? (This one line decides whether ALL
6 post-audit functions are dead.)

## Q3 — Do the OTHER post-audit tables have rows in prod? (isolates shared-trigger vs fan-out-specific)
```bash
psql "$DATABASE_URL" -c "
  SELECT 'share_of_voice' t, count(*) n FROM share_of_voice_snapshots
  UNION ALL SELECT 'visibility_trends', count(*) FROM visibility_trends
  UNION ALL SELECT 'citation_source_intel', count(*) FROM citation_source_intelligence
  UNION ALL SELECT 'query_fan_out_results', count(*) FROM query_fan_out_results;"
```
ANSWER: paste the counts. Are share_of_voice / visibility_trends (both S3, same `audit/complete` trigger) ALSO zero, or
do they have rows? **If they have rows and only fan-out is zero → the trigger works, fan-out specifically is broken. If
ALL are zero → the shared trigger (Q2) or registration (Q1) is the systemic cause.** This is the single most
diagnostic query — do not skip it.

## Q4 — Inngest run history: did fan-out ever attempt for the July 3 audit?
```bash
lsof -i :8288 -i :8290 2>/dev/null || netstat -ano | findstr ":8288 :8290"
curl -s "http://localhost:8288/v1/events?limit=40" 2>&1 | grep -iE "audit/complete|fan|simulate" | head
curl -s "http://localhost:8288/v1/runs?limit=40" 2>&1 | head -60
```
ANSWER: is there ANY `simulate-query-fan-out` run in Inngest history? Did it run-and-error, run-and-skip, or never
appear? If the app points at a different Inngest port, use it. If run history is gone (dev server restarted), say so —
then Q1+Q2+Q3 carry the diagnosis.

## Q5 — Gates (only if Q1–Q4 show it SHOULD have run): what would short-circuit it?
```bash
psql "$DATABASE_URL" -c "SELECT o.slug, s.tier FROM organizations o LEFT JOIN subscriptions s ON s.organization_id=o.id WHERE o.id=(SELECT organization_id FROM brands WHERE id='0f531803-b529-4d09-9fd6-b6272b5baba8');"
psql "$DATABASE_URL" -c "SELECT count(*) non_retired_prompts FROM vertical_pack_prompts vpp JOIN vertical_packs vp ON vpp.pack_id=vp.id JOIN brands b ON b.vertical=vp.vertical WHERE b.id='0f531803-b529-4d09-9fd6-b6272b5baba8' AND vpp.retired_at IS NULL AND vp.retired_at IS NULL;"
```
ANSWER: org.slug (is it 'sample' → O-03 early return?), subscription tier (≥ Growth+?), and non-retired prompt count
(zero → nothing to fan out). 

---

## VERDICT — pick ONE, backed by Q1–Q5 output (NOT by code inspection):
- **R1 — NOT REGISTERED** (Q1 = fan-out absent from serve()) → the bug. Fix = add to serve(). Report; await fix prompt.
- **R2 — EMIT MISMATCH** (Q2 = run-audit emits dot/none, not `audit/complete` slash) → all 6 post-audit fns dead. Real
  cross-sprint bug. Report; await fix prompt.
- **R3 — FAN-OUT-SPECIFIC FAILURE** (Q3 = others have rows, fan-out zero; Q4 = fan-out ran+errored) → report the error.
- **R4 — GATE** (Q5 = sample-org / zero prompts / sub-Growth tier) → report which.
- **R5 — BENIGN, NEVER TRIGGERED** (Q1 registered ✓, Q2 emit correct ✓, Q3 others also empty because no post-fix
  Growth+ audit has completed, Q5 gates clear) → THEN it's a test gap, and the ONLY close is to trigger a real audit and
  READ the rows. Not "closed by inspection."

Do not write "closed by code inspection." Either name a concrete cause (R1–R4) with the command output that proves it,
or confirm R5 with Q1/Q2/Q3 evidence — in which case 10b stays OPEN until a real audit writes real fan-out rows we read.
The wrapper being gone is accepted; that is a DIFFERENT claim from "the empty prod table is fine" and from "real-LLM
sub-queries are clean." Answer Q1–Q5 with output.
