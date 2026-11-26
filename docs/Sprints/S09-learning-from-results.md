# S09 — Question intelligence 4e: learning from audit results

> **Before Part 1:** follow `docs/lld/CLAUDE-CODE-RUNBOOK.md` (read order, pre-flight, rules, stop points). At the end, save your report-back to `docs/Sprints/reports/S09-report.md` and commit it as the last commit.

Start with `git fetch origin` and build on `origin/main` (S08 pushed); say which hash. Read LLD **section 0** (v1.12 decisions and amendments) first, then sections 7.4 (`question_results`), 7A (0161), 8.6.1 (drift job), 8.6.8, 13, 14; contract screens P16, P02 (weak flag row).

**UI contract:** build every screen named above from `docs/prototypes/vunnara-ui-config.ts` (its `screens` entries; canonical for layout, tokens, exact copy, states, accessibility, responsive rules and acceptance), following `docs/prototypes/PROTOTYPE-GUIDE.md` and mapping every token and component through `docs/prototypes/token-map.md`. `client-enhancements-v2.html` and `docs/prototypes/screens/*.png` are the visual reference. Interactive and tested nodes get `data-testid` from `testIdOf(node id)`. A screen part isn't done until all of its listed states exist.

**Rules (every part):**
- One commit per numbered part; don't amend; commit only in a separate step after tests finish, never chained with `;`. **Never push.**
- Targeted tests only: related tests, new tests RED on the parent then GREEN, typecheck, lint, compared by name with `tests/known-failures.txt` (0 entries; keep 0), named guards. Full suites only if Sri asks. Playwright only in parts that change a screen or a shared UI component: run the specs `scripts/qa/e2e-specs-for.ts` maps to the files that part changed, one at a time, only with ≥ 6 GB free (otherwise "not run: memory" and list the specs). Parts that change only data, jobs, scoring, APIs or PDF rendering don't run Playwright; say "Playwright: not needed (no UI change)".
- ⛔ No mock data in production; no `any`; FORCE RLS; no new `serviceDb`; no production writes (0161 as a run1–run4 set).
- Non-regression: LLD section 4 (N1–N15) must hold after every part; list the guards you ran for each part.
- Nothing changes a brand's questions automatically: flags and suggestions only; swaps go through the S03 apply flow with the new-comparison notice.
- Behind `qi_learning` (off).
- If the LLD contradicts the code, the code wins: report with file:line; continue only with independent parts.

## 1. Schema (migration 0161) and computation
`question_results` per LLD 7.4. Inngest `question-results-compute` on the `audit.complete` event (added as a new listener, existing listeners untouched; it joins `POST_AUDIT_POOL`, which is account-wide with limit 1, so keep the function fast and say how long it takes per audit): per question → answers, business-naming answers (any business named or cited, using the rule f business-domain logic plus mentions of configured competitors), brand mentioned answers, competitors named, directories cited. Optional run2 backfill for each brand's last 4 audits (Sri decides; write it as a separate run set). Tests: computation on fixtures; idempotent re-run; both runners' audits.

## 2. Weak-question flags and swaps (P16)
Business-naming rate 0 in 2 consecutive audits → flag on the question (Questions tab row P02, and a Recommended action "AI doesn't name any business for this question") with the best spare for the same service and intent (from candidates; generate if none) as "Swap in draft"; "Keep" snoozes for 2 audits. Tests: flag logic edges (failed answers excluded; partial audits), snooze, swap enters the draft.

## 3. Website drift (LLD 8.6.1)
Weekly cron `analysis-website-drift`: sitemap + home fingerprint per brand with a confirmed profile (limit 5 concurrent); on change, request analysis with trigger `website_changed` producing suggestions only and a notice "Your website has changed. Review new services?". Tests: fingerprint change detection, no-change no-op, suggestions only.

## 4. Cross-workspace learning (operator-only)
Extend the S05 aggregate function or add `refresh_question_signals()` (aggregate-only, ≥ 3 workspaces): naming rate by business type × intent × reach. Operator page section on `/admin/taxonomy` ("Question signals"). Used by the writer as an intent prior (weights versioned). Tests: k ≥ 3; no text, brand or workspace data in output; non-operator 403.

## Report-back
- Per part: file:line, changes, tests (RED/GREEN, by name), guards, Playwright run, "not run: memory" (with the specs) or "not needed (no UI change)".
- Evaluation: weak flags on the evaluation set match a manual check.
- UI: for each screen touched, the guide's per-screen block (nodes built of specified, states, acceptance pass/fail, screenshots in `.qa/screens/S09/` at 1240 and 390, deviations with the contract change you propose).
- Commit hashes and `git log origin/main..main --oneline`.
- Push notes: migration 0161 first; Inngest resync (yes: new functions); safe while an audit runs; flag `qi_learning` off.

Commit messages end with these two lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015t9HuZaoYxNVzVR718W5od
