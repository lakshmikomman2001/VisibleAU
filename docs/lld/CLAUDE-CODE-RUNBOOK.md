# Claude Code runbook: Vunnara client enhancements (sprints S00, S00B, S01, S01B, S01C, S02–S10, then the S11 full test suite)

Repo path: `docs/lld/CLAUDE-CODE-RUNBOOK.md` · version 1.11 · 27 Nov 2026 (after S02)

Follow this file at the start of every sprint session, before Part 1. Its rules apply on top of the sprint prompt. If a sprint prompt is stricter, the sprint prompt wins.

## 1. Where everything is

| Path | What it is | Who writes it |
|---|---|---|
| `docs/lld/vunnara-client-enhancements-lld-v1.md` | The LLD (v1.12): the build spec for behaviour, data, APIs, security, tests. **Section 0** holds Sri's decisions and the amendments from S00: read it first | Sri / Claude (chat) |
| `docs/lld/design/Vunnara-client-improvements-design.pdf`, `docs/lld/design/Vunnara-question-intelligence-design-v3.pdf` | Design documents: the reasoning behind the LLD. Read only where a sprint names them. The LLD wins over them | Sri / Claude (chat) |
| `docs/lld/as-is-verification.md` | What the code actually does, checked against the LLD (S00 Part 1). Where it says the LLD is wrong, it wins | You, in S00 |
| `docs/prototypes/vunnara-ui-config.ts` | The UI contract (v1.8): every screen's nodes, copy, states, accessibility, responsive rules, acceptance. Each colour token names its `app` variable: use that one in code. Check it compiles with `npx tsc --noEmit --strict --target es2022 --lib es2022 --module esnext --moduleResolution bundler --skipLibCheck docs/prototypes/vunnara-ui-config.ts` | Sri / Claude (chat) |
| `docs/prototypes/client-enhancements-v2.html`, `docs/prototypes/screens/*.png` | The visual reference, rendered from the contract | Sri / Claude (chat) |
| `docs/prototypes/PROTOTYPE-GUIDE.md` | How to build a screen from the contract and report on it | Sri / Claude (chat) |
| `docs/prototypes/token-map.md` | Contract tokens and components mapped to the app's own (S00 Part 0b) | You, in S00 |
| `docs/lld/fetch-inventory.md` | Every place that fetches a customer website, and its move onto the guarded fetcher | You, in S00B |
| `docs/Sprints/Sxx-*.md` | The sprint prompts S00, S00B, S01, S01B, S01C, S02–S10, and S11 (full test suite after S10). The folder is `docs/Sprints` with a capital S, as git tracks it | Sri / Claude (chat) |
| `docs/Sprints/reports/Sxx-report.md` | Your report-back for each sprint, saved at the end | You |

`docs/latets/` is Sri's local download folder. Use it only in the start step and in update steps (an `UPDATE-HERE.md` from a newer pack); never read from it otherwise and never commit it. Never edit the files Sri / Claude (chat) write; propose changes in your report.

## 2. When sources disagree

1. The running code and production behaviour. Report the difference with file:line; never "fix" existing behaviour to match a document.
2. The repo's `CLAUDE.md` files (project conventions).
3. `docs/lld/as-is-verification.md` (from S00 on).
4. The sprint prompt, for what to do in this sprint.
5. For UI: the contract (`vunnara-ui-config.ts`). For behaviour, data and APIs: the LLD.
6. The prototype HTML, then LLD prose, then the design PDFs.

If the sprint prompt and the LLD disagree, follow the sprint prompt for that sprint and list the difference in your report. If a contradiction blocks a part, stop that part, report it, and continue only with parts that don't depend on it.

## 3. Read order before every sprint (every session, in this order)

1. The repo's `CLAUDE.md` (root, and any in folders you will touch).
2. This runbook.
3. `docs/lld/as-is-verification.md` *(exists from S00 Part 1 on)*.
4. `docs/prototypes/token-map.md` *(exists from S00 Part 0b on)*.
5. `docs/Sprints/reports/`: every earlier report, at least the previous sprint's in full *(from S00B on)*.
6. LLD **section 0** (decisions and amendments), section 4 (non-regression N1–N15) and section 17 (feature flags). Every sprint.
7. The LLD sections, appendices and design-PDF sections named in the sprint's "Read" line.
8. For any sprint that builds UI: `docs/prototypes/PROTOTYPE-GUIDE.md`; the contract's `precedence`, tokens and `components` once per session; then the `screens` entry for each screen the sprint names, and its PNGs in `docs/prototypes/screens/`.
9. The whole sprint file, before starting Part 1.

Then reply with a short plan: the parts in order, the files you expect to touch, the migration number, the flags, and the stop points (section 8). Start Part 1 straight after (don't wait for approval) unless something in the pre-flight fails.

## 4. Pre-flight (read-only; report the results before Part 1)

- `git status` is clean and you're on `main` *(S00 only: the files the start step copied are expected; nothing else)*. Run `git fetch origin`. Local `main` equals `origin/main`. If local commits exist that aren't on `origin/main`, stop: the previous sprint hasn't been pushed. *(Exceptions: a "Resume" kickoff, where those commits are this sprint's earlier parts; and the single docs-only commit an `UPDATE-HERE.md` step makes in this session.)*
- State the start hash.
- The kickoff message confirms the previous sprint's gate (pushed, migration set applied in production, report reviewed; see section 9). If it doesn't, ask and stop.
- The sprint's migration number is free under `db/`, and earlier run sets exist as expected.
- Baseline on the untouched tree: typecheck (excluding `.next` and `next-env.d.ts`), lint, **every source-scan guard file in the repo**, and the related tests for the areas you will touch. Record the results; pre-existing failures are listed, not fixed silently. `tests/known-failures.txt` has 0 entries and must stay at 0.
- Free memory for Playwright (≥ 6 GB, else every Playwright item is "not run: memory"; the memory rules are in section 5).
- The flags this sprint adds will default to off.

## 5. Rules for every part

- One commit per numbered part, made in a separate step after its tests finish, never chained with `;`, never amended. **Never push.** Commit messages end with the two attribution lines the sprint prompt gives.
- **Never publish or share anything:** no web pages, artifacts, gists, pastes, uploads or links to them. Reports, PDFs and screenshots stay in the repo and `.qa/`; Sri sends them to Claude (chat) himself.
- Targeted tests only (related tests, new tests RED on the parent then GREEN, typecheck with `.next` excluded, lint compared with the parent per changed file (the whole repo had 339 lint errors before S00), named guards). Full suites only if Sri asks (S11 is that ask).
- **Every source-scan guard file, in every part.** At the end of each part, run all of the repo's source-scan guard tests (85 files and about 1,500 tests in S00B), not only the ones the sprint names: S00 ran only its named guards and shipped a failure (`no-silent-fetch-fallback`, fixed in S01 Part 0). A guard that already fails on the sprint's start hash is listed in the report; a new failure is fixed before the part's commit.
- **Schema files and golden files.** When a part changes a `db/schema/*` file, also run every test that reads a golden file under `tests/**/__golden__/`, plus schema-drift (S01 part 2 missed one golden this way, `d8883e4f`).
- **The sprint's migration stays editable until it is applied.** While the sprint's migration isn't applied in production (it never is before the sprint ends), a later part that needs a schema change amends that migration and its run set and re-tests run1 → run2 → run3 → run4 → run1 locally, instead of adding a new migration number.
- **No network from tests** (LLD amendment 50, from S01B on): unit and integration tests never reach the internet; record a fixture or stub the client.
- **Report fixtures** (LLD amendment 51): report render tests and report images use invented businesses seeded as real audits and rendered through the real code path; never hand-composed render input, never client data.
- **Plan refusals** (LLD amendment 30): a feature the plan doesn't include answers 403 `plan_required` through `tierRefusal`; over a limit inside a feature the plan has answers 402 with a specific code, handled inline by the component.
- **Playwright only where the UI changed.** Run it in a part only if that part changes a screen or a shared UI component: the specs `scripts/qa/e2e-specs-for.ts` maps to the changed files, one at a time, ≥ 6 GB free (otherwise "not run: memory", listing the specs). Take the per-screen screenshots once, when a screen is finished, not after every part. Parts that change only data, jobs, scoring, APIs or PDF rendering report "Playwright: not needed (no UI change)". Never run the whole Playwright suite unless Sri asks.
- **Playwright memory** (measured in S00's run on 22 Nov 2026: Sri's machine has 16 GB with about 7.5 GB free once other apps are closed; one run peaks at 3.5–6.7 GB, nearly all of it the `next dev` server, which keeps every page it compiles). For every Playwright run: one worker; a fresh server for each spec or shard, never reused; ≥ 6 GB free before it starts (if not, wait 60 seconds and check again, up to 3 times, then mark it "not run: memory"); stop the run if free memory falls below 1.2 GB while it runs. A stopped run is not a failure: rerun only the tests it didn't reach, by `file:line`, on a fresh server; the spec counts as passed only if every test passed on a clean server. Run these specs in shards, one shard after another (`--shard=i/N`, as S00's run did): `tests/e2e/sprint9/s9-autopilot-e2e.spec.ts` (3; shard 1 of 2 came within 0.07 GB of the stop on 26 Nov 2026), `tests/e2e/sprint2/sprint2-workflow.spec.ts` (2), `tests/e2e/sprint3/sprint3-visibility.spec.ts` (2; it peaked at 6.06 GB unsharded on 24 Nov), `tests/e2e/responsive/responsive-shell.spec.ts` (8). Report each run's peak memory and lowest free memory, and name any other spec whose run peaked above 6 GB so it joins this list. After each run, check its server and browser processes have exited and the server's port is free.
- On Windows, don't watch a log file with `tail -F` (or anything that keeps it open) while it is being written: the writer loses lines (S00's run lost 52). Write each run's result to its own record and read the logs when the run ends.
- No production writes. Migrations are written as `db/prod-fixes/<n>-run1…run4` sets that Sri applies in Neon (production branch `br-ancient-tooth`) before he pushes.
- **Run sets fit Neon's SQL editor** (LLD amendment 80): it shows at most 25 result tabs, and the production role can't `SET ROLE visibleau_app`. run2 ends with one summary SELECT of what it wrote, just before COMMIT; run3 checks row-level security from the catalogue (policies, FORCE, grants) with no role switch; run1 and run3 keep each check's expected result in a comment above it. A run file that must exceed 25 statements says so at its top, and puts its most important check last.
- No mock, seed or placeholder data in production code paths; recorded fixtures in tests only; no live provider calls in tests.
- No `any`. FORCE RLS with `current_setting('app.current_org_id', true)::uuid` policies on new organisation tables; global reference tables go on the read-only list from S05 on (D-GT; before S05 the app role has DML on every table, as production does); no new `serviceDb` uses. Secrets by variable name only; never print `.env.neon` values.
- Provider and LLM costs are visible to operators only, never in customer responses or pages.
- New behaviour sits behind its flag, off by default. Flag off means the app is exactly as today.

## 6. Not breaking what already exists

- **Non-regression:** LLD section 4 (N1–N15) must hold after every part. List the guards you ran per part.
- **Existing tests:** never edit or delete an existing test to make it pass. If specified behaviour changes a test's expectation, name the test, quote the LLD line that changes it, and say so in the report.
- **Existing screens:** no visual change except D-UI1 (S00) and the listed carry-over fixes (S01 Part 0: the Starter claim and D-BAND). Change shared components (Button, Badge, Input, Dialog…) only by adding variants or props with today's defaults. When a shared component changes, take before/after screenshots of two existing screens that use it.
- **Existing APIs:** no breaking changes to request or response shapes. New fields are optional; new routes are new paths.
- **Existing data:** migrations are additive (new tables, columns, indexes, functions). No drops or renames. Backfills are idempotent, run in their own step and are checked in run3.
- **Existing jobs:** add new Inngest functions and listeners; never rename existing function ids or event names. Say "Inngest resync: yes" whenever functions change.
- **Running audits:** every change must be safe while an audit runs. An audit keeps the question set it started with.
- **Public claims:** pricing and marketing text changes only through `tiers.ts` with the plan-claim guard, and only for features that are built and switched on (setting-aware).
- **Fetching customer websites:** from S00B on, only through `lib/fetch/guarded-fetch.ts`; `tests/unit/fetch/no-unguarded-fetch.test.ts` fails on any new unguarded fetch. A new fixed-host client (an API whose host is fixed in code) needs an entry in that test's list (file, host, reason, exact call count), named in the sprint report.

## 7. UI work

Build every screen from the contract as `docs/prototypes/PROTOTYPE-GUIDE.md` says: colours with each token's `app` variable, type and components through `token-map.md` (no Radix, no toast library: follow the app's existing patterns listed there); nodes in order with exact copy; `data-testid` from `testIdOf(node id)`; every listed state; responsive and accessibility rules. Screenshots of what you built at 1240 and 390 wide (light; dark too for P01, P02, P07, P08, P10) go to `.qa/screens/<sprint>/` (gitignored). Report each screen in the guide's per-screen format. Tailwind v4: never mix arbitrary `min-[…]` breakpoints with named ones (`sm:`, `md:`) on the same property; use `min-[641px]` / `min-[901px]` / `min-[1100px]` for the contract's breakpoints (LLD amendment 42).

## 8. Stop points (wait for Sri)

| Sprint | Stop |
|---|---|
| S00 | If any design file is missing, or the contract doesn't compile. Part 1 (as-is verification) is the gate for every later sprint: Sri reviews it before S01 |
| S00B | Part 2 (the guarded fetcher) must pass all its security tests before Part 3 moves any caller onto it |
| S01 | If your context is getting full, stop after any committed part (Parts 8–12 are each a clean boundary), add to the report and stop; Sri resumes from the next part |
| S01C | Part 3d: if the page targets can't be met without breaking a layout rule, report the page map and the options, and carry on with the other parts |
| S05 | After Part 1 (taxonomy seed): Sri reviews and approves the taxonomy before Part 2 |
| S06 | Part 1 (the analysis fetch preset) must pass its tests before any other part fetches anything |
| S10 | After Part 1 (cost table): Sri sets prices and creates the Stripe prices before Part 2 |
| S11 | After Part 4 (full test suite report): Sri approves which fixes to make before Part 5 |
| Any | A contradiction between the code and the LLD that blocks dependent parts |

## 9. End of every sprint

1. Give the report-back exactly as the sprint asks (per part: file:line, changes, tests RED/GREEN by name, guards, Playwright or "not run: memory"; UI blocks; commit hashes; `git log origin/main..main --oneline`; push notes: migration run set first, Inngest resync yes/no, safe while an audit runs, flags off).
2. Save the same report to `docs/Sprints/reports/Sxx-report.md` and commit it as the sprint's last commit (`docs(sprints): Sxx report`). A resumed sprint adds a new section ("Parts 6–12", say) to the same file and keeps the earlier parts' section as it was.
3. List every Playwright spec that was "not run: memory" in one place at the top of the report. They must pass **before Sri switches the sprint's flag on** (flag off keeps production as today, so the push itself is safe). S00 is the exception: D-UI1 is not behind a flag, so its specs and screenshots must run before the push.
4. Stop. Sri reviews the report with Claude (chat), applies the migration run set in production, pushes, resyncs Inngest if needed, has any "not run" Playwright specs run, switches the sprint's flag on for one workspace, checks, and only then starts the next sprint.

## 10. Kickoff messages (what Sri pastes)

**Start of each sprint**
```
Sprint S01. S00B is pushed and I've reviewed its report.
Follow docs/lld/CLAUDE-CODE-RUNBOOK.md (read order and pre-flight), then execute docs/Sprints/S01-report-v2.md part by part.
```

**Start a sprint with a docs update first** (when Claude (chat) sends a newer pack)
```
Read docs/latets/Enhancements/vunnara-client-enhancements-v1.16/vunnara-enhancements/UPDATE-HERE.md and do what it says.
```

**Resume an interrupted sprint** (local commits from earlier parts exist)
```
Resume sprint S01 from Part 8. Follow docs/lld/CLAUDE-CODE-RUNBOOK.md (read order, including docs/Sprints/reports/ and git log origin/main..main), then continue docs/Sprints/S01-report-v2.md from Part 8.
```

**Run Playwright specs that were skipped for memory** (fresh session, nothing else open)
```
Run only these Playwright specs, one at a time, following the Playwright memory rules in docs/lld/CLAUDE-CODE-RUNBOOK.md section 5, and report pass/fail, peak memory and any failure output: <paste the list from the sprint report>. Don't change any code. If a test fails, rerun it once on its own to see whether it's flaky, then report.
```

**After a stop point**
```
Continue sprint S05 from Part 2: I've approved the taxonomy seed (my edits, if any, are committed in db/seed/taxonomy/au-v1.json).
```

| Sprint | File | Gate to write in the kickoff |
|---|---|---|
| S00 | `S00-verify-quick-wins-flags.md` | Done (one-time start step) |
| S00B | `S00B-guarded-fetcher.md` | Done (pushed 23 Nov 2026, `f1d9ffdb`; live check passed) |
| S01 | `S01-report-v2.md` | Done (pushed 24 Nov 2026, `bb5248d5`; 0154 applied; live checks passed) |
| S01B | `S01B-report-polish.md` | Done (pushed 25 Nov 2026, `69eb1fcd`; no migration; Inngest resynced) |
| S01C | `S01C-real-report-fixes.md` | Done (pushed 26 Nov 2026, `00fad405`; no migration; no Inngest resync; the 9 remaining Playwright specs passed before the push) |
| S02 | `S02-question-library.md` | Done (0155 applied and pushed 27 Nov 2026, `717e8c40`; Inngest resynced; parity confirmed on Hero's audit #56; `question_library` on for Splice only) |
| S03 | `S03-agency-questions.md` | S02 pushed, 0155 applied, hash parity confirmed in production (done 27 Nov 2026); started with the v1.16 `UPDATE-HERE.md` step |
| S04 | `S04-visibility-reach.md` | S03 pushed, 0156 applied, checked |
| S05 | `S05-business-taxonomy.md` | S04 pushed, 0157 applied |
| S06 | `S06-website-analysis-writer.md` | S05 pushed, 0158 applied, taxonomy approved |
| S07 | `S07-listings-layer.md` | S06 pushed, 0159 applied, evaluation fit target met |
| S08 | `S08-demand-competitors-pretest.md` | S07 pushed |
| S09 | `S09-learning-from-results.md` | S08 pushed, 0160 applied |
| S10 | `S10-question-packs.md` | S09 pushed, 0161 applied |
| S11 | `S11-full-test-suite.md` | S10 pushed, migrations 0153–0161 all applied, every earlier "not run: memory" spec has passed |
