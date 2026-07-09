# Claude Code — AUDIT Sprint 5 before sign-off (are the "62 green" real, do the S4 stubs light up, are scores coerced?)

Sprint 5 reports complete: 6 tables, 11 lib modules, 7 Inngest fns, 8 screens, 13 routes, "62 tests green, §12 greps
pass." Sprint 4 reported "78 green / 0 errors" and was broken 9 ways with 4 source-grep "integration" tests that
couldn't catch their bugs. Do NOT sign off on the summary. This audit checks the three things most likely to be
green-but-broken, in priority order. DIAGNOSE + report; fix only what's confirmed broken (report first).

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau`, never prod.

## PRIORITY 1 — The S4-stub wiring (THE defining seam of Sprint 5)
S5's whole purpose (spec lines 20-40) is to light up the S4 dormant sections + fire the alerts. Built-in-isolation ≠
wired. Confirm each dormant S4 slot now renders WITH real S5 data, and each alert fires.

### 1a — Do the S4 report sections now populate? (was: dormant stubs)
```bash
# The narrative-generator slots S5 must wire (per spec): hallucination risk, linkedin_performance, consensus_score,
# knowledge_panel_status. Confirm generate-narrative-report READS the S5 tables now (not still-unwired stubs):
grep -n "hallucination\|linkedin\|consensus\|knowledge_panel\|entity_score\|brand_entity_scores\|brand_consensus\|linkedin_presence" inngest/functions/generate-narrative-report.ts lib/communication/narrative-generator.ts | head -25
```
Then REAL-DATA smoke: seed a brand with S5 rows (a hallucination_incident, a brand_consensus_check, a
linkedin_presence_audit, entity knowledge_panel cols) → generate a report → OPEN the PDF. Report: do the
hallucination-risk / linkedin_performance / consensus_score / knowledge_panel_status sections now RENDER real content
(prose, not empty, not raw JSON)? Or are they STILL omitted (stubs never wired — the sprint's core deliverable missing)?
This is the #1 thing — if the sections don't light up, S5 didn't do its job regardless of 62 green tests.

### 1b — Do the alerts fire at their thresholds? (dual-threshold is a known trap)
```bash
grep -n "consistency_score\|< 60\|< 70\|hallucination\|alert" lib/communication/alert-composer.ts inngest/functions/check-cross-platform-consensus.ts inngest/functions/detect-hallucinations.ts | head
```
Spec (lines 25-26, 38-39): TWO distinct consensus alerts — the S4 **EMAIL** alert at `consistency_score < 60` (LLD
8402) AND the in-app Action Center alert at `< 70` (LLD 7252). Confirm BOTH exist at their OWN threshold (not one
threshold for both, not 70 used for the email). And detect-hallucinations → the hallucination alert (NP-01 per-
preference gated — emailOnHallucination, not emailOnDrift). Report: are both consensus thresholds wired distinctly, and
does a real hallucination_incident actually compose the hallucination alert?

## PRIORITY 2 — Are the 62 tests REAL behavioral or source-greps? (Sprint 4 had 4 fakes)
```bash
# Scan the 9 test files for the source-grep tell (readFileSync → toContain asserts code CONTAINS strings):
grep -rln "readFileSync\|toContain\|readFile" tests/**/trust* tests/**/*hallucination* tests/**/*entity* tests/**/*consensus* tests/**/*sprint5* 2>/dev/null
grep -rn "readFileSync\|\.toContain(" tests/**/*trust* tests/**/*sprint5* 2>/dev/null | head -20
# vs real behavioral (db.insert, real fn call, expect on computed result / DB state):
grep -rn "db.insert\|await.*(\|expect(.*)\.toBe\|toEqual" tests/**/*trust* tests/**/*sprint5* 2>/dev/null | head
```
For EACH of the 9 test files, classify: REAL BEHAVIORAL (calls the fn / seeds DB / asserts computed output) vs
SOURCE-GREP (readFileSync→toContain — passes while the bug is live). Report the table. Any source-grep counted as
coverage for a real behavior = green theater → flag for rewrite.
**Re-break proof for the ones that matter:** break the hallucination-risk read-time formula (return a constant) and the
trust-scorer → do the corresponding tests FAIL? If they stay green, they're not testing the computation.

## PRIORITY 3 — Trust SCORES: Drizzle NUMERIC-as-string coercion (the 7000% bug class)
S5 is full of NUMERIC columns: `score_at_capture NUMERIC(5,2)`, `citation_share NUMERIC(5,2)`, `consistency_score`,
Phase-1 `score_of_10`, /100 scores. Drizzle returns NUMERIC as STRINGS; an `as number` cast lies until `.toFixed()`/
math runs → crash or 7000%-style garbage (the exact Sprint 4 tangle).
```bash
# Any as-number cast on a score column? (the landmine)
grep -rn "as number" lib/trust/ app/api/**/trust* app/api/**/*entity-score* app/api/**/*consensus* | grep -iE "score|share|consistency|risk|/100|of_10"
# Any .toFixed / arithmetic on score values without Number() coercion?
grep -rn "\.toFixed\|score.*\*\|\* *score\|score.*/\|Number(" lib/trust/ components/**/trust/ | head -25
# The read-time risk + score display path:
grep -n "toFixed\|Number(\|score_of_10\|consistency_score\|citation_share\|as number" lib/trust/hallucination-risk.ts lib/trust/trust-scorer.ts lib/trust/consensus-checker.ts | head
```
Report: any `as number` on a score column (→ latent crash), and whether score display/format uses `Number()` coercion.
REAL-DATA check: hit a score-bearing route (entity-score, consensus-score, trust) that reads a real Drizzle row and
render it — does the score display sanely (0-10 or 0-100, no NaN, no ×100 garbage, no .toFixed crash)? A unit test with
plain-object fixtures would NOT catch this — needs a real DB read.

## PRIORITY 4 — Platform contract + serve() registration (quick but real)
```bash
# ExplainabilityService.annotate() on ALL 7 score-bearing routes (§0.4 — "empty rationale fails CI"):
grep -rln "annotate\|ExplainabilityService" app/api/**/trust* app/api/**/*entity-score* app/api/**/*hallucination* app/api/**/*citation-source* app/api/**/*linkedin* app/api/**/*consensus* app/api/**/*youtube*
# All 7 Inngest fns registered in serve() (Sprint 4 shipped render-report-pdf MISSING from serve() — check the count):
grep -cE "detectHallucinations|captureEvidenceSnapshot|refreshEntityScore|buildCitationSourceIntelligence|auditLinkedinPresence|auditYoutubePresence|checkCrossPlatformConsensus" app/api/webhooks/inngest/route.ts
# The 3 crons registered with correct schedules (0 3 2, 0 3 3, 0 3 4):
grep -n "0 3 2\|0 3 3\|0 3 4\|cron" inngest/functions/audit-linkedin-presence.ts inngest/functions/audit-youtube-presence.ts inngest/functions/check-cross-platform-consensus.ts
```
Report: are all 7 fns in serve() (count = 7 registrations, likely 14 with imports)? Does every scored route call
annotate()? Any route missing annotate = platform-contract violation (CI should fail, per spec — does it?).

## VERDICT — report ONE status per priority, with evidence:
- **P1 (stubs light up):** the 4 S4 sections RENDER with real S5 data + both alerts fire at their thresholds → the
  sprint's core deliverable WORKS. Or: sections still omitted / alerts wrong threshold → core deliverable BROKEN
  (name which). **This is the make-or-break — a green suite means nothing if the stubs stayed dark.**
- **P2 (tests real):** the 9 files classified real-vs-source-grep; the re-break proof fired on hallucination-risk +
  trust-scorer. Or: N source-greps found → green theater, list them.
- **P3 (scores coerced):** no `as number` on score cols / scores render sanely from real Drizzle rows. Or: coercion
  landmine found (where).
- **P4 (contract+serve):** all 7 in serve(), annotate() on all 7 scored routes. Or: gaps (which).
Report each with command output + the real-data smoke results. NO fixes yet — report, then we scope fixes for whatever's
actually broken.

## Constraints
- Diagnose + report ONLY (no fixes this pass). Dev DB `visibleau`, never prod.
- The real-data smokes (P1 report render, P3 score render) are the point — greps confirm wiring EXISTS, the smoke
  confirms it WORKS. Do BOTH.
- Do NOT count a source-grep test as behavioral coverage (P2). Do NOT trust "62 green" without the re-break proof on the
  computation-bearing tests.
- LLD v8.70 WINS over the sprint prompt on any conflict.

## NOTE
Same discipline that unearthed Sprint 4's dozen bugs: greps/tests green ≠ works. The three real risks here: (1) the S4
dormant stubs didn't actually get wired (the sprint's whole purpose — check by generating a report + reading the PDF,
not by grepping), (2) the 62 tests include source-greps like Sprint 4's did (check with readFileSync grep + re-break),
(3) the trust SCORES hit the Drizzle-NUMERIC-string footgun that caused the 7000% (check as-number casts + render a real
score). P1 is make-or-break. Report all four with real-data evidence; then we fix what's confirmed broken.
