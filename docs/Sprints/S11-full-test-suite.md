# S11 — Full test suite after all sprints (S00–S10)

> **Before Part 1:** follow `docs/lld/CLAUDE-CODE-RUNBOOK.md` (read order, pre-flight, rules, stop points). At the end, save your report to `docs/sprints/reports/S11-report.md` and commit it as the last commit.

Sri has **explicitly asked for the full test suites** in this run. The project rule "targeted tests only" is lifted for this prompt only. This is a verification run: **no product code changes until Sri approves fixes (Part 5).**

**Rules (every part):**
- Never push. No production writes. No edits to existing tests to make them pass. Commit only the report until Part 5.
- **Never run tests against production.** Before any test touches a database, print the database host and branch the test environment will use (hide the password). If it is the production Neon branch (`br-ancient-tooth`) or the production host from `.env.neon`, stop. Tests use the local test database or the dev branch the existing test setup names.
- **No live provider spend.** Tests run on recorded fixtures. Before starting, check the test environment for live LLM, DataForSEO, YouTube, ABR or Stripe live keys. If a suite needs live providers (for example a "live" tag), skip it and list it. Stripe stays in test mode.
- Memory: Playwright only with ≥ 6 GB free, `--workers=1`. If memory is short, run the Playwright suite in shards one after another (e.g. `--shard=1/4` … `4/4`) and check free memory before each shard. If it's still short, stop and ask Sri to close other apps. Don't let a low-memory run produce failures.
- Save every log to `.qa/full-suite/<date-time>/` (gitignored) and keep the report to summaries plus the exact failure output.
- A full run took over 3 hours before. Don't stop part-way because it's slow; do stop on any safety check above.

## 0. Read and plan (no runs yet)
- Read order from the runbook, including **all** reports in `docs/sprints/reports/` (S00–S10) and LLD sections 4 (N1–N15), 15 (testing) and 17 (flags).
- Pre-flight: `main` equals `origin/main` and includes S10; working tree clean; state the hash. Sri's kickoff confirms migrations 0153–0161 are applied in production (if not stated, ask and stop). Dependencies installed from the lockfile without changing it.
- Discover every suite from `package.json` scripts, test configs and `CLAUDE.md` ("Testing scope"): typecheck, lint, source-scan guards (plan-claim, cost-visibility, GST and any others), unit, integration (database), RLS/tenant-isolation, API route, component, PDF render, accessibility (axe), production build, Playwright end-to-end. List each with its command and how it's configured.
- Find the pre-sprint baseline hash in the S00 report (the hash S00 started from; `15f287b` or later).
- Find how tests switch feature flags on and off (S00 Part 2 scaffold, per-workspace overrides in tests). Never through the production settings store.
- Report the plan (suites in order, commands, configurations, safety check results), then start Part 1.

## 1. Configuration A: all new flags off (non-regression)
All 13 flags from LLD 17 off: `report_v2`, `abn_suggestion`, `question_library`, `agency_questions`, `visibility_reach`, `business_taxonomy`, `qi_website`, `qi_listings`, `qi_demand`, `qi_competitors`, `qi_pretest`, `qi_learning`, `question_packs`. With all of them off the app must behave as it did before S00, apart from the D-UI1 control borders.
Run in this order, continuing past failures: typecheck → lint → source-scan guards → unit → component → API routes → integration (database) → RLS and tenant isolation → PDF render → production build (`next build`) → accessibility → Playwright full suite (production build if the Playwright config supports it).

## 2. Configuration B: all new flags on (new features together)
All 13 flags on for the test workspace(s). Re-run only the suites whose results can depend on flags: component, API routes, integration, RLS, PDF render (including Basic, Standard and Enhanced reports), accessibility and Playwright. This checks the new features working together: report tiers with reach, agency questions with packs, taxonomy with website analysis, and so on.

## 3. Triage every failure
For each failing test:
1. **Flaky or real:** run it alone twice more. Passes on a re-run → flaky (still reported); fails consistently → real.
2. **New or pre-existing:** run that one test on the pre-sprint baseline hash in a separate `git worktree`. Fails there too → pre-existing; passes there → introduced by S00–S10.
3. **Which sprint:** for introduced failures, find the sprint from `git log` of the files involved; if unclear, `git bisect` with that single test (at most 10 steps, in the worktree).
4. **Cause:** one or two sentences with file:line, and whether the fix belongs in product code, test setup or environment. Never "fix" by changing an existing test's expectation; if you believe the expectation itself is wrong, quote the LLD or contract line that says so.

## 4. Report (commit only this file), then STOP
`docs/sprints/reports/S11-report.md`:
- Summary table: suite × configuration → total, passed, failed, skipped, flaky, duration.
- Non-regression: N1–N15, each with the tests that cover it and pass/fail in configuration A.
- Failures table: test, suite, configuration, flaky/real, new/pre-existing, sprint, cause (file:line), proposed fix.
- Skipped suites or tests and why (live providers, memory, environment).
- Coverage for the new modules if the repo already measures coverage (don't add tooling).
- `tests/known-failures.txt` is still empty; say so.
- Free memory and shard notes; log folder path.

Commit the report (`docs(sprints): S11 full test suite report`). **Stop.** Sri reviews the report with Claude (chat) and tells you which fixes to make.

## 5. Approved fixes only (when Sri says so)
- Fix only the items Sri approves, one commit per fix: failing test RED on the parent, GREEN after; targeted tests plus the full suite file(s) the fix touches, in both configurations where flags matter.
- Never edit an existing test to pass. Migrations, if any fix needs one, follow the run1–run4 pattern for Sri to apply.
- Re-run the suites that failed (both configurations) and append an "After fixes" section to the report with the new counts. Commit it.

## Report-back
- Part 0: the suite list with commands, configurations and safety check results.
- Part 4: the report path and the summary table; stop.
- Part 5: per fix: file:line, change, tests (RED/GREEN by name), suites re-run; commit hashes and `git log origin/main..main --oneline`; push notes (migration if any, Inngest resync yes/no, safe while an audit runs).

Commit messages end with these two lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015t9HuZaoYxNVzVR718W5od
