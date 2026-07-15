# Claude Code — S7 §11 test track — FINAL PHASE: QA §12 invariant grep script

Section-by-section: SECTIONS 1-5 DONE (Backend Unit 20 / Backend Integration ~29 / Walk guards 72 invariants / Frontend
Unit 17 / Frontend E2E 15). This is the FINAL phase — the §12 verification greps assembled into a re-runnable
`scripts/qa/sprint7-invariants.sh` (PASS/FAIL per check, non-zero exit on any fail), matching S4/S5/S6's pattern. NOTE:
Section 3 already produced 72 invariants in this script — so this is INVENTORY + FILL: confirm the §12 checks below are
present (many are), add any missing, correct paths/counts to the REAL repo. After this, S7's track matches S2-S6.

Env: Windows repo `C:\startup\VisibleAU\src\`. Never prod. scripts/qa/sprint7-invariants.sh already exists (72 checks).

## STEP 1 — Inventory the existing script vs the §12 list
```bash
wc -l scripts/qa/sprint7-invariants.sh
grep -cE "PASS|FAIL|check|grep" scripts/qa/sprint7-invariants.sh
# Which §12 checks are already in it?
grep -nE "CREATE TABLE|DROP POLICY|CASCADE|JourneyTurn|min\(2\)|early.mention|technical-audit|audit.complete|step.run|concurrency|isEngineEnabled|ENGINE_TO_PROVIDER|PlaywrightCrawler|Agency|Growth|LLMService|setRlsContext|runJourney|hex|md:grid|Clerk" scripts/qa/sprint7-invariants.sh | head -40
```
Report which §12 checks (list below) already exist vs need adding. The script has 72 checks (Section 3's guards); the §12
list overlaps heavily — don't duplicate, just ensure all §12 items are covered.

## STEP 2 — Ensure ALL §12 checks are present (add missing; correct paths/counts). The canonical list:

### Migrations / schema
- `grep -c "CREATE TABLE IF NOT EXISTS" db/migrations/*sprint7_discovery.sql` → 3
- `grep -c "DROP POLICY IF EXISTS" db/migrations/*sprint7_discovery.sql` → 3
- vertical CHECK 5 values: `grep -Rc "professional_services\|real_estate" db/migrations/*sprint7_discovery.sql` → ≥1
- CASCADE: `grep -E "journey_id|audit_id" db/migrations/*sprint7_discovery.sql | grep -c "ON DELETE CASCADE"` → ≥2

### Types / Zod / scorer
- `grep -Rc "JourneyTurn" lib/conversational/types.ts` → ≥1
- `grep -RcE "\.min\(2\)\.max\(8\)" lib/conversational/` → ≥1
- `grep -Rc "early.mention\|first_mention_turn" lib/conversational/journey-scorer.ts` → ≥1

### DUAL-EMIT (Obligation 1) — BOTH forms in technical-audit-run (the F-2 seam)
- `grep -Rc "'technical-audit\.complete'" inngest/functions/technical-audit-run.ts` → ≥1 (DOT)
- `grep -Rc "'technical-audit/complete'" inngest/functions/technical-audit-run.ts` → ≥1 (SLASH)
(BOTH must be present — this is the intentional dual-emit. The dot-vs-slash CONVENTION guard from Section 3 is scoped to
NOT flag this.)

### run-comparison-prompts — CORRECTED trigger (the Bug-6 fix)
- **NOTE the fix:** run-comparison-prompts listens on **`audit.complete`** (DOT — matches run-audit's emit), NOT
  `audit/complete` (slash — the original §12 said slash; the walk PROVED the emit is dot, so the fn was fixed to dot).
  Assert the CORRECTED form:
  `grep -Rc "'audit\.complete'" inngest/functions/run-comparison-prompts.ts` → ≥1
  AND `grep -Rc "'audit/complete'" inngest/functions/run-comparison-prompts.ts` → **0** (the slash form is the bug).
- `grep -Rc "competitors" inngest/functions/run-comparison-prompts.ts` → ≥1 (reads brands.competitors)
- Same corrected trigger for the 3 collateral fns (detect-hallucinations, ga4-push, capture-evidence-snapshot): they use
  `audit.complete` (dot), 0 on `audit/complete` (slash).

### run-journey steps / concurrency / trigger
- `grep -Rc "step.run(" inngest/functions/run-journey.ts` → ≥1
- `grep -Rc "persist-" inngest/functions/run-journey.ts` → ≥1 (the result-row INSERT is a step — retry-idempotent)
- `grep -Rc "'journey/run-requested'" app/api/brands/\[id\]/journeys/\[journeyId\]/run/route.ts inngest/functions/run-journey.ts` → ≥2 (producer+consumer agree)
- `grep -RcE "concurrency:\s*\{\s*limit:\s*3" inngest/functions/run-journey.ts inngest/functions/run-comparison-prompts.ts` → ≥2

### engine gate / provider map
- `grep -Rc "isEngineEnabled" inngest/functions/run-journey.ts inngest/functions/run-comparison-prompts.ts` → ≥2
- `grep -Rc "ENGINE_TO_PROVIDER\|chatgpt:.*openai" inngest/functions/run-journey.ts inngest/functions/run-comparison-prompts.ts` → ≥1

### crawler reuse (Obligation 2 — NOT a second crawler)
- `grep -REc "new (PlaywrightCrawler|chromium)" lib/conversational/ inngest/functions/run-journey.ts` → 0

### tier gates
- `grep -Rc "Agency" app/api/brands/\[id\]/journeys/route.ts` → ≥1 (journeys Agency+)
- `grep -Rc "Growth\|growth" app/api/brands/\[id\]/comparisons/route.ts` → ≥1 (comparisons Growth+)

### no hardcoded model / LLMService / RLS
- `grep -RnE "'claude-3|'gpt-4|'gemini-" lib/conversational/` → 0
- `grep -Rc "LLMService" lib/conversational/` → ≥1
- `grep -Rc "setRlsContext" app/api/brands/\[id\]/journeys/route.ts` → ≥1

### functions registered in serve()
- **NOTE the path + count:** the route is **app/api/webhooks/inngest/route.ts** (S6 established this — NOT
  app/api/inngest). And assert the 2 S7 fns are PRESENT, NOT the total:
  `grep -cE "runJourney|runComparisonPrompts" app/api/webhooks/inngest/route.ts` → **2**
  (The §12 said "running total 25" — assert the 2 S7 fns present, not a total count, which drifts. S6 lesson.)

### UI hygiene
- `grep -REc "var\(--[a-z-]+\)[0-9a-fA-F]{2}" components/domain/discovery/` → 0 (no hex-alpha on CSS vars)
- `grep -RcE "md:grid-cols|sm:" "app/(auth)/brands/[brandId]/discovery/"` → ≥1 (responsive)
- `grep -Rc "Clerk\|@clerk" lib/conversational/ db/ app/api/brands/` → 0

### The WALK-FOUND grep guards (Section 3 — confirm they're in the script)
- nav-orphan: brand-detail-client.tsx references /discovery AND /retrieval AND /trust (each layer route) → ≥1 each
- cyan token: `#06b6d4`/`#0e7490` present in globals.css; `#f97316`/`#ea580c` for --layer-discovery → 0
- prebuilt seed: conversation_journeys ≥3 per vertical (psql count, tradies ≥3)
- empty-state copy: "clone a pre-built" present, "via the API" → 0
- s3-benchmark: the competitive-benchmark reads brands.competitors (configured), not a SOV domain; data={null} → 0 in the visibility page

## STEP 3 — Run + report
```bash
bash scripts/qa/sprint7-invariants.sh; echo "exit: $?"
```
- Every check PASSES; exit 0.
- If any FAILS → report which: a real invariant violation to investigate, OR a path mismatch to correct (fix the path,
  do NOT weaken the assertion). Distinguish which.
- Re-runnable: run twice, same result.
- Final count (Section 3 was 72; this may add a few for the §12 items not yet covered).

## STEP 4 — Final report: the WHOLE S7 track
- Sections 1-5 counts + this QA script.
- Confirm the track matches S2-S6 structure: §11 five-phase tests + §12 grep script.
- The two cross-sprint seams (dual-emit, CPR-01) are guarded at multiple levels (integration + E2E + these greps).

## Constraints
- Match the S4/S5/S6 QA-script pattern (PASS/FAIL per check, non-zero exit on fail, re-runnable). Section 3 already built
  72 checks — INVENTORY + FILL, don't duplicate.
- CORRECTED per the walk: run-comparison-prompts (+ the 3 collateral fns) listen on `audit.complete` (DOT), assert 0 on
  `audit/complete` (SLASH) — the original §12 said slash but the emit is dot (the Bug-6 fix). The technical-audit-run
  DUAL-EMIT keeps BOTH forms (intentional).
- serve() path = app/api/webhooks/inngest/route.ts; assert the 2 S7 fns PRESENT, not "total 25" (counts drift — S6 lesson).
- Fix grep PATHS to real repo paths where the indicative paths differ; do NOT weaken an assertion to pass.
- Never prod. LLD v8.70 / §12 win.

## NOTE
FINAL phase of the S7 track — the §12 verification greps assembled into a re-runnable scripts/qa/sprint7-invariants.sh
(PASS/FAIL, non-zero exit, matching S4-S6). Section 3 already produced 72 checks — INVENTORY + FILL the §12 items,
correct paths/counts to the real repo. KEY CORRECTIONS from the walk: (1) run-comparison-prompts (+ detect-hallucinations,
ga4-push, capture-evidence-snapshot) listen on `audit.complete` DOT — assert 0 on the SLASH form (the §12 originally said
slash, but the emit is dot — the Bug-6 fix); (2) the technical-audit-run DUAL-EMIT keeps BOTH dot+slash (intentional —
the convention guard is scoped around it); (3) serve() path = app/api/webhooks/inngest/route.ts, assert the 2 S7 fns
present not "total 25". Fix paths, don't weaken assertions. This completes the S7 §11 five-phase track + §12 grep script —
matching S2-S6 structure; the two cross-sprint seams (dual-emit, CPR-01) now guarded at integration + E2E + grep levels.
