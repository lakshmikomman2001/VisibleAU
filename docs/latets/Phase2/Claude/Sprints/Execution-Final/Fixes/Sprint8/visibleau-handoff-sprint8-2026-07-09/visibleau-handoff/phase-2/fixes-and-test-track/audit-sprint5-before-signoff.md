# Claude Code — AUDIT Sprint 5 before sign-off (do the S4 stubs light up, are the "62 green" real, are scores coerced?)

Sprint 5 reports complete: 6 tables, 11 lib modules, 7 Inngest fns, 8 screens, 13 routes, "62 tests green, §12 greps
pass." Sprint 4 reported "78 green / 0 errors" and was broken 9 ways with 4 source-grep "integration" tests that couldn't
catch their bugs. AND looking at the running app already found 4 Sprint-5 issues (nav-orphan tile, migrations not applied
to prod, a badge contradicting its score, trust-aggregate prose bleeding into the risk card). So do NOT sign off on the
summary. This audit checks the things NOT yet looked at, in priority order. DIAGNOSE + report; fix only what's confirmed
broken (report first).

Env: Windows repo `C:\startup\VisibleAU\src\`. App runs on LOCAL PROD `visibleau_prod` (migrations now applied there);
dev is `visibleau`. Never touch real/hosted prod.

## PRIORITY 1 — Do the S4 dormant report sections LIGHT UP with real data? (THE defining deliverable of Sprint 5)
S5's whole purpose (spec lines 20-40) is to wire the S4 dormant sections + fire the alerts. Built-in-isolation ≠ wired.
Metropolitan Plumbing now HAS trust data (the hub renders it) — so this is the moment for the real-data PDF smoke.

### 1a — Generate a report + OPEN the PDF; confirm the dormant sections now render
```bash
# Confirm generate-narrative-report READS the S5 tables (not still-unwired stubs):
grep -n "hallucination\|linkedin\|consensus\|knowledge_panel\|entity_score\|brand_entity_scores\|brand_consensus\|linkedin_presence" inngest/functions/generate-narrative-report.ts lib/communication/narrative-generator.ts | head -25
```
Then: generate a report for Metropolitan (which has trust data) → OPEN the PDF. Report: do the **hallucination-risk /
linkedin_performance / consensus_score / knowledge_panel_status** sections now RENDER real content (prose, not empty, not
raw JSON)? Or are they STILL omitted (stubs never wired — the sprint's core deliverable missing)? This is #1 — if the
sections don't light up, S5 didn't do its job regardless of 62 green tests.

### 1a-WATCH — the annotate-contamination pattern (a real bug was just found on the trust card)
The trust hub's Hallucination Risk card had `ExplainabilityService.annotate()` called with the WRONG score (the trust
aggregate 60), and BOTH its outputs (confidence_label "High" + trust-aggregate rationale) contaminated the RISK card →
"0/100 High" contradiction + wrong prose. The report sections read the SAME trust data through the SAME annotate/score
plumbing. So in the PDF, check EACH trust section for the same class of bug:
- Does a section show the WRONG score (trust aggregate where a specific metric belongs)?
- A badge/label contradicting its number (like 0-risk labeled "High")?
- annotate() rationale describing a DIFFERENT metric than the section's number?
```bash
grep -n "annotate\|confidence_label\|rationale\|riskLevel\|score:" lib/communication/narrative-generator.ts | head
```
Report any section where the score/badge/prose disagree — the card bug likely has siblings in the report.

### 1b — Do the alerts fire at their thresholds? (dual-threshold is a known trap)
```bash
grep -n "consistency_score\|< 60\|< 70\|hallucination\|emailOnHallucination\|alert" lib/communication/alert-composer.ts inngest/functions/check-cross-platform-consensus.ts inngest/functions/detect-hallucinations.ts | head
```
Spec (lines 25-26, 38-39): TWO distinct consensus alerts — the S4 **EMAIL** alert at `consistency_score < 60` (LLD 8402)
AND the in-app Action Center alert at `< 70` (LLD 7252). Confirm BOTH exist at their OWN threshold (not one for both).
And detect-hallucinations → the hallucination alert (NP-01 gated on emailOnHallucination, NOT emailOnDrift). Report:
both consensus thresholds distinct? does a real hallucination_incident compose the hallucination alert?

## PRIORITY 2 — Are the 62 tests REAL behavioral or source-greps? (Sprint 4 had 4 fakes; the card bug slipped past 19 green trust tests)
```bash
grep -rln "readFileSync\|toContain\|readFile" tests/**/trust* tests/**/*hallucination* tests/**/*entity* tests/**/*consensus* tests/**/*sprint5* 2>/dev/null
grep -rn "readFileSync\|\.toContain(" tests/**/*trust* tests/**/*sprint5* 2>/dev/null | head -20
grep -rn "db.insert\|expect(.*)\.toBe\|toEqual" tests/**/*trust* tests/**/*sprint5* 2>/dev/null | head
```
For EACH of the 9 test files: REAL BEHAVIORAL (calls fn / seeds DB / asserts computed output) vs SOURCE-GREP
(readFileSync→toContain — passes while the bug is live). Report the table. **Re-break proof:** break the hallucination-
risk formula (return a constant) and the trust-scorer → do the tests FAIL? If they stay green, they're not testing the
computation. (Note: 19 green trust tests did NOT catch the annotate-contamination card bug — a hint the trust tests may
not exercise rendered behavior.)

## PRIORITY 3 — Trust SCORES Drizzle NUMERIC-as-string (the OTHER cards — consensus/entity/citation ARE NUMERIC)
The risk score is JS-computed (confirmed — no Drizzle issue). BUT consensus_score, entity score_of_10, citation_share
NUMERIC(5,2), presence_score, consistency_score ARE NUMERIC columns → Drizzle returns STRINGS; `as number` lies until
`.toFixed()`/math/threshold-compare runs → crash or wrong badge (like the risk card's).
```bash
grep -rn "as number" lib/trust/ app/api/**/trust* app/api/**/*entity-score* app/api/**/*consensus* app/api/**/*citation* | grep -iE "score|share|consistency|presence|of_10"
grep -rn "\.toFixed\|Number(\|score.*[<>]\|[<>].*score" lib/trust/consensus-checker.ts lib/trust/trust-scorer.ts lib/trust/citation-intelligence.ts components/domain/trust/ | head -25
```
Report: any `as number` on a score col (→ latent crash/wrong badge). REAL-DATA check: open the OTHER trust sub-screens
(Consensus Score, Entity Score, Citation Sources, LinkedIn, YouTube) — does each score render sanely (right range, no
NaN, no ×100, and the badge MATCHES the score direction — the risk card just had a badge-contradiction bug, check these
for the same)?

## PRIORITY 4 — Platform contract + serve() registration
```bash
grep -rln "annotate\|ExplainabilityService" app/api/**/trust* app/api/**/*entity-score* app/api/**/*hallucination* app/api/**/*citation-source* app/api/**/*linkedin* app/api/**/*consensus* app/api/**/*youtube*
grep -cE "detectHallucinations|captureEvidenceSnapshot|refreshEntityScore|buildCitationSourceIntelligence|auditLinkedinPresence|auditYoutubePresence|checkCrossPlatformConsensus" app/api/webhooks/inngest/route.ts
grep -n "0 3 2\|0 3 3\|0 3 4\|cron" inngest/functions/audit-linkedin-presence.ts inngest/functions/audit-youtube-presence.ts inngest/functions/check-cross-platform-consensus.ts
```
Report: all 7 fns in serve() (count = 7 registrations)? every scored route calls annotate()? Any route missing = contract
violation (§0.4 "empty rationale fails CI").

## VERDICT — ONE status per priority, with evidence:
- **P1 (make-or-break):** the 4 S4 sections RENDER real data in the PDF + no annotate-contamination + both alerts fire →
  sprint's core deliverable WORKS. Or: sections omitted / contaminated / alerts wrong → BROKEN (name which). **A green
  suite means nothing if the stubs stayed dark or show the wrong scores.**
- **P2:** 9 files classified real-vs-source-grep; re-break fired on hallucination-risk + trust-scorer. Or: N source-greps.
- **P3:** no `as number` on score cols / other cards render sanely with matching badges. Or: coercion/badge bug found.
- **P4:** all 7 in serve(), annotate() on all 7 scored routes. Or: gaps.
Report each with command output + real-data smoke results. NO fixes yet — report, then scope fixes for what's broken.

## Constraints
- Diagnose + report ONLY (no fixes this pass). App runs on LOCAL PROD `visibleau_prod`; never real/hosted prod.
- The real-data smokes (P1 PDF render, P3 other-card renders) are the point — greps confirm wiring EXISTS, the smoke
  confirms it WORKS AND shows the RIGHT score/badge (the card bug proved rendering can be wrong while tests pass).
- Do NOT count a source-grep as behavioral coverage. Do NOT trust "62 green" without the re-break proof.
- LLD v8.70 WINS over the sprint prompt on any conflict.

## NOTE
Same discipline that unearthed Sprint 4's dozen bugs AND Sprint 5's first four. The real risks: (1) the S4 dormant
sections didn't get wired OR render the wrong score like the trust card did (check by generating a report + reading the
PDF, not grepping) — this is make-or-break; (2) the 62 tests include source-greps like Sprint 4's, and 19 green trust
tests already missed the card bug (check with readFileSync grep + re-break); (3) the OTHER trust scores (consensus/
entity/citation — real NUMERIC columns) hit the Drizzle-string footgun or have the same badge-contradiction the risk
card had. P1 is make-or-break. Report all four with real-data evidence; then fix what's confirmed broken.
