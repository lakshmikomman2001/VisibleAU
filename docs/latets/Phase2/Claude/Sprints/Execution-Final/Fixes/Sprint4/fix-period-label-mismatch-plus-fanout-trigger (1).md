# Claude Code — FIX: report period-label mismatch (V-B) + RE-OPEN fan-out trigger (your Q2 "eliminated" was wrong)

Two things. **PART 1** fixes the confirmed period-label bug (clean). **PART 2** corrects an error in your last diagnosis
and re-opens the fan-out trigger with the specific question you skipped. Do PART 1 as a fix; PART 2 is diagnose-only.

---

# PART 1 — FIX the period-label mismatch (V-B, confirmed)

## Root cause (your diagnosis, correct)
`app/api/brands/[id]/reports/generate/route.ts` derives the period with a naive week-of-month formula:
```ts
const periodLabel = parsed.data.periodLabel ??
  `${now.getFullYear()}-W${String(Math.ceil(now.getDate() / 7)).padStart(2, "0")}`;  // BUG
```
`Math.ceil(4/7)=1` → `'2026-W01'` (January), but the aggregator writes ISO-week `'2026-W27'` via the canonical
`formatPeriodLabel` (`format(startOfISOWeek(date), "yyyy-'W'II")`). Report queries W01, data lives under W27 → WHERE
finds nothing → empty-guard → "No data available." This is L-02 (LLD 3571-3573): period_label must be derived by ONE
canonical function across all producers/consumers; UNIQUE(brand_id, period_label, period_type) requires exact match.

## STEP 1 — Replace the naive fallback with the canonical function
```bash
sed -n '1,80p' "app/(auth)/../api/brands/[brandId]/reports/generate/route.ts" 2>/dev/null || find app -path "*reports/generate/route.ts"
grep -rn "formatPeriodLabel\|startOfISOWeek\|Math.ceil.*getDate\|period_label\|periodType\|period_type" app/api/brands/ lib/visibility/ | head
```
Fix: import and use `formatPeriodLabel` (the SAME function the aggregator uses — likely
`lib/visibility/visibility-trend-aggregator.ts`) instead of the inline formula:
```ts
import { formatPeriodLabel } from "@/lib/visibility/visibility-trend-aggregator"; // canonical source — verify path

// periodType must come from the request (or default 'weekly' to match the aggregator's default cadence):
const periodType = parsed.data.periodType ?? "weekly";                 // 'weekly' | 'monthly'
const periodLabel = parsed.data.periodLabel ?? formatPeriodLabel(now, periodType);
```
Delete the `Math.ceil(now.getDate() / 7)` line entirely. No other inline period math anywhere.

## STEP 2 — CRITICAL: match on period_type too, not just period_label (secondary L-02 trap)
The UNIQUE key is **(brand_id, period_label, period_type)** — BOTH must match for the report's WHERE to find the trend
row. Note the enum split (verified against LLD 6085 + the aggregator signature):
- `formatPeriodLabel(date, periodType)` takes **`'weekly' | 'monthly'`**
- but `visibility_trends.period_type` column stores **`'week' | 'month'`**
So confirm what the aggregator actually WROTE into `period_type` (`'week'` or `'weekly'`?) and make the report query the
SAME value. Grep both sides:
```bash
grep -rn "period_type\|periodType\|'week'\|'weekly'\|'month'\|'monthly'" lib/visibility/visibility-trend-aggregator.ts inngest/functions/aggregate-visibility-trend.ts inngest/functions/generate-narrative-report.ts app/api/brands/*/reports/ | head
psql "$DATABASE_URL" -c "SELECT DISTINCT period_label, period_type FROM visibility_trends WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8';"
```
Ensure: the report's section queries filter `WHERE period_label = <formatPeriodLabel result> AND period_type = <the
exact value the aggregator stored>`. If the aggregator stores `'week'` but the report derives `'weekly'`, normalise so
BOTH the label AND the type match. Report the exact values on both sides.

## STEP 3 — VERIFY the fix produces a NON-empty report
The 4 existing reports are permanently stamped W01 (wrong) — leave them or clean up; they're append-only artifacts.
Generate a NEW report and confirm it now finds the W27 data:
```bash
# after clicking "Generate report" (or POST /generate) with the fix in place:
psql "$DATABASE_URL" -c "SELECT id, period_label, narrative_text IS NOT NULL AS has_narrative, headline, score_breakdown IS NOT NULL AS has_score, created_at FROM generated_reports WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' ORDER BY created_at DESC LIMIT 2;"
```
- NEW report's `period_label` = `2026-W27` (matches the data), NOT W01.
- `narrative_text` is REAL prose (not "No data available"); `score_breakdown` / mention-source sections populated
  (SoV has 84 rows + trends has 1 row for W27, so these MUST render now).
- **OPEN the new PDF** — confirm it contains the actual AI Visibility narrative + score breakdown + mention-source
  sections, NOT the "No data available" shell. (Fan-out/topical may still be absent — that's PART 2, separate.)
Report: does the new report render real content for W27?

## PART 1 constraints
- ONE canonical period function everywhere — no inline `Math.ceil`/`getDate` week math survives.
- Match BOTH period_label AND period_type (the full UNIQUE key).
- No status column, no schema change. Status stays CM-01-derived.
- Don't rewrite the 4 old rows; just prove a NEW report is correct.

---

# PART 2 — RE-OPEN fan-out trigger: your Q2 "eliminated" was WRONG (diagnose only)

## Correcting the record
Your Q2 said run-audit emits `audit.complete` (dot) and concluded that "matches all post-audit triggers → Suspect A
eliminated." **That is backwards.** Canon (LLD 1070-1077, verified): all 6 post-audit functions — including PC-06
`simulate-query-fan-out` AND PC-02 `calculate-share-of-voice` — listen on **`audit/complete` with a SLASH**. The
slash/dot split is deliberate throughout this codebase (LLD 1105-1108): **slash = internal function chaining; dot =
webhook/VALID_EVENTS delivery.** The `audit.complete` (dot) you found has event id `"audit-complete-email"` — that's the
EMAIL notification path, not the fan-out trigger. So you verified the EMIT of ONE event and assumed the consumers listen
for it; you never checked the listener side.

## The contradiction you didn't reconcile (this is the real clue)
Your Q3: **share_of_voice = 84 rows, query_fan_out = 0 rows.** Both PC-02 and PC-06 listen on the SAME `audit/complete`
(slash). If that trigger fired, SoV got 84 rows — so the trigger clearly WORKS for SoV. Then why 0 fan-out rows on the
same trigger, same audit? It **cannot** be both "trigger works (SoV proves it)" and "fan-out is a separate unrelated
issue." Either fan-out has a DIFFERENT trigger binding than SoV, or fan-out fired and errored/early-returned. Find out
which — don't hand-wave "errored or budget-blocked."

## Q-A — What event does simulate-query-fan-out actually LISTEN on? (the check you skipped)
```bash
grep -n "event:\|'audit/complete'\|\"audit/complete\"\|audit.complete\|createFunction\|inngest.createFunction" inngest/functions/simulate-query-fan-out.ts | head
grep -n "event:\|'audit/complete'\|\"audit/complete\"\|audit.complete" inngest/functions/calculate-share-of-voice.ts | head
```
ANSWER: does fan-out's `createFunction({ event: '...' })` bind to **`audit/complete`** (slash)? Does SoV bind to the
SAME string? If they differ → that's why one has rows and the other doesn't. If they're identical → the trigger fired
for both and fan-out failed at runtime (Q-C).

## Q-B — Does run-audit ALSO emit the SLASH event? (you only found the dot/email one)
```bash
grep -n "inngest.send\|step.sendEvent\|sendEvent\|name:.*audit\|'audit/complete'\|\"audit/complete\"\|audit.complete" inngest/functions/run-audit.ts
```
ANSWER: list EVERY event run-audit emits — is there an `audit/complete` (slash) emit in addition to the
`audit.complete` (dot, "audit-complete-email")? **If run-audit ONLY emits the dot and the functions listen on the
slash, NOTHING should have triggered — yet SoV has 84 rows.** That means either (i) run-audit emits the slash too
(find it), or (ii) SoV is triggered elsewhere. Resolve this — it's the crux. (If run-audit truly only emits the dot,
then the 84 SoV rows came from an EARLIER run/backfill, and the CURRENT trigger is broken for everything — a real bug.)

## Q-C — If fan-out IS correctly triggered: did it run and fail? (Inngest history + gates)
```bash
curl -s "http://localhost:8288/v1/runs?limit=50" 2>&1 | grep -i "fan\|simulate" | head
# fan-out's own early-exits:
grep -n "return\|withinBudget\|hardStop\|Budget\|slug\|sample\|retired\|isEngineEnabled\|estimate(" inngest/functions/simulate-query-fan-out.ts | head
psql "$DATABASE_URL" -c "SELECT count(*) non_retired FROM vertical_pack_prompts vpp JOIN vertical_packs vp ON vpp.pack_id=vp.id JOIN brands b ON b.vertical=vp.vertical WHERE b.id='0f531803-b529-4d09-9fd6-b6272b5baba8' AND vpp.retired_at IS NULL AND vp.retired_at IS NULL;"
```
ANSWER: is there a `simulate-query-fan-out` run in Inngest history for the July-3 audit? Failed / early-returned / never
appeared? If it ran and threw, the exact error. If early-returned: budget hard-stop, sample-org, zero non-retired
prompts, or engines disabled?

## PART 2 VERDICT (report ONE)
- **F-1 — DIFFERENT TRIGGER BINDING:** fan-out binds to a different/wrong event than SoV (Q-A) → why SoV=84, fan-out=0.
  Real bug. Report the two bindings.
- **F-2 — TRIGGER FINE, RUNTIME FAILURE:** both bind to `audit/complete`, run-audit emits it (Q-B), fan-out ran and
  errored/early-returned (Q-C) → report the error/gate.
- **F-3 — STALE SoV + BROKEN CURRENT TRIGGER:** run-audit only emits the dot, functions listen on slash, the 84 SoV
  rows are from an older run → the current trigger is broken for ALL post-audit functions (Q-B) → the big one; report it.
- Do NOT write "fan-out separate, remains open, probably errored." Name which of F-1/F-2/F-3 with the Q-A/Q-B/Q-C
  output. The 84-vs-0 split MUST be explained.

---

## NOTE
PART 1 is the confirmed fix — swap the naive week-of-month formula for the canonical `formatPeriodLabel` and match on
the full UNIQUE key (label + type). That alone turns the empty PDF into a real report (SoV+trends data exists for W27).
PART 2 corrects the diagnosis: the dot event you found is the email path, not the fan-out trigger (canon: functions
listen on `audit/complete` SLASH), and the 84-SoV-vs-0-fan-out split is unexplained — that contradiction is the actual
lead, not "fan-out errored separately." Confirm PROD DB + real LLM throughout.
