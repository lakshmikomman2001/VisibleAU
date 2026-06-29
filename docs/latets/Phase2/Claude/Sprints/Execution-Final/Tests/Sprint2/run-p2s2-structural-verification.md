# Claude Code — Phase 2 Sprint 2: STRUCTURAL VERIFICATION (§12 grep scorecard)

Sprint 2 ("Workflow Completion Engine") is built. Before the test sections, run the §12 verification greps to
confirm the build matches spec — the cheapest way to catch a missed/wrong implementation early. This mirrors
the Sprint 1 structural pass (which caught 2 real bugs). **Report-first: run the greps, report PASS/FAIL for
each, and for any FAIL, investigate + report — do NOT auto-fix without flagging to Sri.**

> Verification, not building. Run the checks, report the scorecard. A FAIL gets investigated and reported (is
> it a real build gap, or a check that needs interpreting?) for Sri to decide. Don't silently patch.

---

## THE §12 SCORECARD — run each, report expected vs actual

```bash
# Migrations: 3 tables, 3 policies, idempotent
grep -c "CREATE TABLE IF NOT EXISTS" db/migrations/*sprint2*.sql                    # expect 3
grep -c "DROP POLICY IF EXISTS" db/migrations/*sprint2*.sql                         # expect 3

# fan_out_gap_id / topical_gap_id are PLAIN UUID this sprint — NO REFERENCES (BD-01)
grep -E "fan_out_gap_id|topical_gap_id" db/migrations/*sprint2*.sql | grep -c "REFERENCES"   # expect 0

# Status enums spelled correctly (the -ed / -e / never-'done' traps)
grep -c "'ready_for_review'" db/schema/remediation-tasks.ts                         # expect ≥1
grep -c "'completed'" db/schema/workflow-runs.ts                                    # expect ≥1 (workflow_runs uses -ed)
grep -RcE "'done'" db/schema/remediation-tasks.ts                                   # expect 0  (never 'done')

# No hardcoded model; selectModel used (the content-draft generator)
grep -Rc "selectModel(" inngest/functions/generate-content-draft.ts                 # expect ≥1
grep -RnE "'claude-3|'gpt-4|'gemini-" inngest/functions/generate-content-draft.ts   # expect 0

# Tier source = subscriptions.tier, NOT organizations.tier
grep -RnE "organizations\.tier|org\.tier" lib/workflow/ | grep -iv subscriptions    # expect 0

# 3 Inngest functions registered in serve()
grep -cE "generateContentDraft|triggerValidationReaudit|scheduleWorkflowRuns" app/api/webhooks/inngest/route.ts  # expect 3

# Inngest events + the 14-day sleep on validation re-audit
grep -Rc "'task/completed'\|'draft/generate'" app/ inngest/                          # expect ≥2
grep -Rc "step.sleep" inngest/functions/trigger-validation-reaudit.ts               # expect ≥1

# Quota gate present on system-triggered re-audit
grep -Rc "checkQuota\|markReauditDeferred" inngest/functions/trigger-validation-reaudit.ts  # expect ≥2

# UI: no hex-alpha on var() (RT-01); tabular numerics present
grep -REc "var\(--[a-z-]+\)[0-9a-fA-F]{2}" components/domain/workflow/ components/phase2/    # expect 0
grep -Rc "tabular-nums" components/                                                  # expect ≥1

# Responsive variants present on the brand screens
grep -RcE "sm:grid-cols|md:grid-cols" app/\(auth\)/brands/                            # expect ≥1

# Reduced-motion guard in the animation foundation (RM-01)
grep -Rc "prefers-reduced-motion" app/globals.css app/ 2>/dev/null | grep -vc ':0$'      # expect ≥1

# No Clerk (Better Auth only)
grep -Rc "Clerk\|@clerk" lib/workflow/ db/ app/api/brands/                           # expect 0
```

## INTERPRETING RESULTS
- **All match expected → structural PASS**, proceed to report. The build is structurally sound; testing can begin.
- **Any mismatch → investigate before reporting it as a bug:**
  - Could be a **real build gap** (e.g. only 2 of 3 functions registered in serve() → a function is missing →
    real bug, flag for Sri).
  - Could be a **check that needs interpreting** (e.g. the grep's file glob `*sprint2*.sql` doesn't match the
    actual migration filename → adjust the path and re-run; not a bug). The Sprint 1 "index name mismatch"
    finding was this kind — a too-strict check, not a code problem.
  - Could be a **status-enum trap** (workflow_runs must be 'completed' -ed; remediation_tasks must never use
    'done'; content_drafts uses draft|approved|published|rejected) → if these are wrong, it's a REAL bug (the
    locked-invariant kind), flag prominently.
- For each FAIL: show the expected vs actual count, your read (real gap vs check-interpretation), and — if it
  looks like a real bug — describe it for Sri. **Do NOT fix without Sri's go-ahead.**

## ALSO — quick structural sanity beyond the greps
- Confirm the 3 new tables exist with the columns the §5 spec lists (esp. the enum columns, the
  `wont_fix_reason` required-when-wont_fix, the `content_format` column for GAP 8).
- Confirm the 6 lib modules + the shared `progress-summary` helper exist as files.
- Confirm the shared component foundation (§6U.0, `components/phase2/`) exists — later sprints depend on it.
- (These are existence/shape checks; deep behaviour is for the test sections.)

## REPORT (then STOP)
1. The §12 scorecard: each grep, expected vs actual, PASS/FAIL.
2. For any FAIL: investigation + your read (real build gap vs check-interpretation vs locked-invariant
   violation). List genuine-bug suspects separately for Sri.
3. The structural sanity: 3 tables + columns, 6 lib modules, shared foundation present?
4. Overall: structurally sound enough to begin testing, or are there gaps to resolve first?
5. Do NOT fix anything — report findings for Sri to decide. State "Structural verification complete — awaiting
   review before test sections."
```
