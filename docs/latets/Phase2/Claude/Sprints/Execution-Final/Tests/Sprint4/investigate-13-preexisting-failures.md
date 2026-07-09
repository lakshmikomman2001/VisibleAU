# Claude Code — INVESTIGATE the 13 pre-existing test failures (4 files) → classify, then fix ONLY if legitimate

Sprint 3 closed at 344 GREEN. There are now 13 failing tests across 4 files, reported as "pre-existing / failing before
our changes too" and skipped twice. That is a classification to JUSTIFY, not a reason to ignore. Investigate each, put
it in exactly one bucket, and fix only the buckets that warrant it — with the CORRECT fix direction per bucket.

**CRITICAL — fix direction depends on the bucket. Do NOT get this backwards:**
- If a test is red because it asserts OLD behavior this session's fixes deliberately CHANGED → the TEST is wrong now.
  **Fix = update the test to the corrected behavior. Do NOT change the code back to satisfy a stale test** (that would
  silently revert this session's fixes).
- If a test is red because the CODE is genuinely broken → fix the code.
- If it's the one known-accepted infra failure → leave it, document it.
Deciding wrong here re-breaks fixed bugs. So classify BEFORE touching anything.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau` (NEVER prod).

## STEP 1 — Enumerate: exactly which 13 tests, which 4 files, what each asserts + why it fails
```bash
<repo test cmd> run 2>&1 | tee /tmp/testrun.txt
grep -iE "fail|✗|✘|×|FAIL" /tmp/testrun.txt | head -80
# The 4 failing files:
grep -iE "FAIL|✗" /tmp/testrun.txt | grep -oE "[A-Za-z0-9_./-]+\.test\.[tj]s" | sort -u
```
For EACH of the 4 files, print the failing test(s) + the exact assertion + the actual-vs-expected from the runner:
```bash
sed -n '1,120p' <failing-file-1>
# ...repeat per file. Capture: expected X, received Y — the specific mismatch.
```
Report a table: file | failing test name | expected | actual | (git blame: last changed when — before or after S3 close?).
```bash
git log --oneline -5 -- <failing-file>   # was this file/its target changed recently?
```

## STEP 2 — Classify EACH of the 4 files into ONE bucket (with evidence)

**Bucket A — STALE (fix-invalidated): the test asserts OLD behavior this session changed.** Check specifically:
```bash
grep -nE "\* *100|7000|citationRate.*100|mentionRate.*100" <failing-files>   # bug 3: old ×100 rate math
grep -nE "getLLMService\(\)|single.*engine|gpt-4.1-mini.*all|OpenAIImpl" <failing-files>  # bug 4: old single-engine
grep -nE "Math\.ceil.*getDate|week.*of.*month|W01" <failing-files>            # bug 2: old week-of-month label
grep -nE "brandMentioned" <failing-files>                                     # bug 6: old property name
grep -nE "Mention rate.*citation rate|archetype.*Mention rate" <failing-files> # bug 8: old duplicated summary text
grep -nE "as number|\.tier|organization\.tier" <failing-files>               # bug 7 / Drizzle-string era
```
If a failing test expects any of these OLD behaviors → **Bucket A**. Evidence: the assertion expects the value the fix
removed (e.g. expects '7000%' or '2026-W01', or spies a single OpenAI impl, or reads brandMentioned).
→ FIX = update the test to assert the CORRECTED behavior (70.0% / ISO week / four impls / brandAppeared / distinct
summary). Do NOT revert the code.

**Bucket B — REAL CODE REGRESSION: the code is genuinely broken, unrelated to this session's fixes.** The test asserts
still-correct behavior and the code no longer satisfies it. → FIX = the code. Report what regressed + git blame the
offending code change if findable.

**Bucket C — KNOWN-ACCEPTED INFRA: the documented stable Sprint 1 failure** — `audit_cost_snapshots` FK-cascade
`confdeltype` assertion (a Postgres introspection quirk, not a product bug). If a failure is exactly this → leave it,
add a comment/skip-with-reason so it stops masquerading as unexplained. (This is ONE test — if all 13 claim to be this,
that's wrong; only the actual FK-cascade one qualifies.)

**Bucket D — FLAKY/ENV: fails due to test-env issues (missing seed, order-dependence, Inngest not up, timing), not
code.** → FIX = the test's setup/isolation. Report the env cause.

Report each of the 4 files' bucket with the concrete evidence (the assertion + the grep hit).

## STEP 3 — Apply the CORRECT fix per bucket
- **A (stale):** update each test to the corrected behavior. After updating, the test should PASS against current code
  AND still be a meaningful assertion (not just changed-to-pass — it must assert the NEW correct value). For each: show
  the before/after assertion.
- **B (real regression):** fix the code; re-run; confirm green. Report the code change.
- **C (known infra):** annotate/skip with a clear reason comment referencing the FK-cascade introspection quirk. Do not
  "fix" by weakening unrelated things.
- **D (flaky/env):** fix isolation/seed/setup; confirm deterministic across 2 runs.
Do NOT make a test pass by asserting less, deleting the assertion, or `.skip`-ing a legitimate failure. A weakened test
is worse than a red one.

## STEP 4 — Verify + guard against the stale-test trap
```bash
<repo test cmd> run 2>&1 | grep -iE "pass|fail" | tail -5
```
- Full suite: report the new pass/fail count. Target: 0 unexplained reds (green, or the ONE known-infra explicitly
  skipped-with-reason).
- **Anti-revert check (critical for Bucket A):** for any test you updated as stale, confirm the CODE still has the FIX
  (you updated the test, not reverted the code):
```bash
grep -n "brandAppeared" inngest/functions/*.ts lib/communication/*.ts    # bug 6 fix still present
grep -n "getLLMService(engine\|getRealImpl" lib/llm/*.ts                  # bug 4 fix still present
grep -n "formatPeriodLabel\|startOfISOWeek" lib/visibility/*.ts           # bug 2 fix still present
grep -n "Number(" lib/communication/format-helpers.ts                     # bug 3 fix still present
```
Confirm every session fix is intact. If updating a "stale" test tempted a code revert, STOP — the test was misclassified
(it was Bucket B, or the code is right and the test needs updating, not the reverse).

## What to report back
1. The table: 4 files, 13 tests, each with expected/actual + bucket (A/B/C/D) + evidence.
2. What you did per bucket (test updated / code fixed / skipped-with-reason / env fixed) with before/after.
3. Final suite count: green or every red explicitly classified.
4. Anti-revert confirmation: all 6 session fixes (bugs 2,3,4,5,6,7,8) still present in code.

## Constraints
- Classify with evidence BEFORE fixing. Wrong classification re-breaks fixed bugs.
- NEVER revert a this-session fix to satisfy a stale test — update the test instead.
- NEVER weaken/delete/skip a legitimate assertion to force green. Skip is only for the documented infra failure, with a
  reason comment.
- Dev DB `visibleau`, never prod.
- If unsure whether a failure is Bucket A (stale) or B (real), report it as ambiguous with both readings rather than
  guessing — a wrong guess here is costly.

## NOTE
The danger isn't the 13 reds — it's "fixing" them the wrong direction. Several are likely STALE: tests written before
this session that assert the OLD ×100 rate / single-engine routing / week-of-month label / brandMentioned property /
duplicated summary — all things the fixes deliberately changed. Those tests are wrong NOW; the fix is to UPDATE the test
to the corrected behavior, NOT to change the code back. The anti-revert check (STEP 4) is the safeguard: after all
fixes, every session bug fix must still be present in the code. Green achieved by reverting a fix is a regression wearing
a passing badge.
