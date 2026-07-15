# INVENTORY S8 TESTS — read-only survey across all 5 phases + §12 QA (before writing the test track)

## Why
S8 has had 12 fixes applied, several of which ADDED tests (tier-rank, /api/auth/me, nav guard,
dedup instance-key, owner-seed, etc.). Before writing the 5-phase test track, inventory what
already exists so each section EXTENDS rather than duplicates — and so we can tell which existing
tests are behavioral (fire on re-break) vs hollow (source-grep / typeof-smoke that pass while
broken). READ-ONLY: list, classify, report. Do NOT write or modify any test.

## Task — survey each phase, report what exists + its quality

### 1 — Locate all S8-relevant test files
```bash
cd c:/startup/VisibleAU/src
# S8 test dir + any governance/webhook/tier tests anywhere:
find tests -type f 2>/dev/null | grep -iE "sprint8|governance|audit-trail|org-member|member|residency|feature-flag|fanout|webhook|tier|seat|access-control|assertBrandAccess|auth.?me" | sort
# Anything added by the recent fixes (may be outside tests/):
grep -Rln "TIER_SEAT_LIMITS\|TIER_RANK\|isTierAtLeast\|assertBrandAccess\|recordAction\|recordDataResidency\|internal_event_id\|/api/auth/me" tests/ 2>/dev/null | sort -u
# The QA script:
ls scripts/qa/ 2>/dev/null; test -f scripts/qa/sprint8-invariants.sh && echo "sprint8-invariants.sh EXISTS"
```

### 2 — Classify by the 5 phases (map each found file to its phase)
For each test file found, note which phase it belongs to and a one-line summary:
1. **Backend Unit** — pure scorers/derivers, no DB/events (tier logic, canPerform matrix,
   assertBrandAccess predicate, RESIDENCY map shape).
2. **Backend Integration** — DB writes / event chains / RLS (recordAction at the 9 sites, WH-01
   slash→dot + delivery + dedup instance-key, cross-org 404 on the 4 tables, owner-seed on
   provisioning, DR-01 writer, invite IC-01, owner-ceiling S8b-02).
3. **Walk regression guards** — one per manual-walk finding (nav-orphan settings guard,
   provisioning seeds, /api/auth/me contract, migration-on-both-DBs, page-module runtime import()).
4. **Frontend Unit** — component render tests (member-row, role-badge, invite-form incl.
   brand_access picker, audit-log-row, residency-table) across loading/empty/data/error.
5. **Frontend E2E** — Playwright mirroring the walk (tier-gate Agency-vs-Growth, audit-trail rows,
   residency 7-rows, invite lifecycle).

### 3 — Quality flag per existing test (the important part)
For each existing test, mark:
- **BEHAVIORAL** — asserts real behavior; would FAIL if the feature broke (re-break proof).
- **HOLLOW** — a source-grep (`existsSync`/regex/`typeof x === 'function'`) or a test that exercises
  a route/shape but not the actual behavior (the S7 CPR-01 class — passes while stubbed). Note any.
- **PAGE-MODULE SMOKE** — if it's a page-export smoke, is it a RUNTIME `import()` (executes the
  module) or a static existsSync/regex (HOLLOW — S6 proved these pass while the module is broken)?

### 4 — Coverage gaps vs the 12 findings (what's NOT yet guarded)
Cross-check the 12 findings against existing tests and list which have NO regression guard yet:
F1 migration-on-prod, F2 DR-01 writer wired, F3 nav-orphan (settings), F6 owner-seed, F7
/api/auth/me, F8 Joined column, F10/F11/F12 invite form + seats, F13 provider names, F18 tier-gate
render, F19 dedup instance-key. Which of these already have a behavioral test (from the fixes), and
which need one written in the track.

### 5 — The §12 QA script state
```bash
test -f scripts/qa/sprint8-invariants.sh && sed -n '1,120p' scripts/qa/sprint8-invariants.sh
```
Report: does it exist, how many checks, and — critically — does it assert the sprint's functions are
PRESENT in serve() (path app/api/webhooks/inngest/route.ts) rather than a running total? Note any
check that's a path mismatch or a weakened assertion (the original §12 greps had several that passed
while the feature was broken — e.g. counting a string vs proving behavior).

## Constraints
- READ-ONLY. Do not create, edit, or run tests (a survey, not execution). Listing + classifying only.
- Do not assume a test is behavioral because it exists — open it enough to classify (behavioral vs
  hollow vs runtime-import).

## Report back (paste inline)
1. The full list of S8-relevant test files, grouped by the 5 phases.
2. Per file: behavioral / hollow / page-module-smoke(runtime vs static) classification.
3. The coverage-gap table: which of the 12 findings already have a guard vs need one.
4. The §12 QA script state (checks count, serve()-present-not-total, any path/weakened issues).
