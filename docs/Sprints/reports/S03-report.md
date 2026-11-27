# S03 report: agency questions

Sprint S03 of the Vunnara client enhancements · 27 Nov 2026 · built on `origin/main` = `717e8c40` (S02, pushed; checked with `git fetch origin`) plus the v1.16 docs commit `56746db9` · nothing pushed.

## Read first

1. **Every part is done and committed: 0 (seven item groups), 1, 2, 3, 4, 5, 6 and 7.** Commits are listed at the end. One item isn't done: Part 0's local `visibleau_test` rebuild (amendment 82), because Claude Code's permission check refused the `DROP DATABASE`. The exact commands are under Open items.
2. **Before the push: migration 0156 as a run set, run1 → run2 → run3 on production. Strictly first.**
   - The schema now declares `organizations.question_packs`. Code that reads every column of `organizations` fails without it, and two such reads exist: sign-up's workspace row (`lib/auth/server.ts:216`) and the free sample's workspace (`lib/sample-audit/synthetic-org.ts:8`).
   - run2 ends with one summary SELECT; run3 has no role switch (Neon's rules, as asked).
   - **Inngest resync: no.** No Inngest function or step changed. The audit-start limit check is in the `POST /api/audits` route.
   - Safe while an audit runs: an audit in progress keeps the set it recorded.
   - Flag `agency_questions` stays off. Off, the app behaves as after S02 (each part tests its flag-off case).
3. **Part 0 goes live for everyone on the push (not flagged).** What a customer sees change is listed under Push notes. In short: the PDF's code font is the no-ligature build, so ligature sequences print as plain characters where they used to crash the PDF; one audit-failure sentence is back to S01C's wording.
4. **The headline never changes.** S03 adds lines next to it (the question mix; each source's own Visibility when both kinds were asked). The headline still counts every everyday question, by the same rule; the two split figures add up to its AI-engine answers (Part 6's test; a headline that includes Google is Open items 7).
5. **Two findings Sri should know about (Part 7):**
   - One business type gives the generator at most 10 everyday questions (plumbing alone: 9). A single-type brand therefore has no spare to swap in on the confirm screen; two types give 19.
   - With the workspace's default count at the plan's limit, the confirm screen's Questions step starts full. I added Remove (down to 5), so someone can make room for their own question. P10 doesn't list it; it's under the deviations.
6. **Playwright: not run: memory for Parts 5–7, including the new spec 18.** After Part 7's commit, this PC stayed at 5.83–6.03 GB free with none of my processes running. The rest was Chrome, Edge WebView, Windows services, Defender and Postgres, which I didn't touch. The runner's 6 GB floor was never met long enough: two attempts, each waiting 3 minutes, then a 20-minute wait checking every 30 s; about 40 minutes in all. So the 27 specs mapped to Parts 5–7 are listed under Playwright with their commands, and P05's, P07's and P10's screenshots aren't taken. Parts 0 and 4 ran theirs and passed: 16, 09 and 17 (10 tests).

## Update step and pre-flight

- **Update step (v1.16):**
  - pack found (`README.md`: "v1.16");
  - `git fetch origin`: `origin/main` = local `main` = `717e8c40`, no local commits; the tree was clean apart from Sri's three untracked items (`GoogleAI/`, `prod-fixes/`, `db/prod-fixes/0131-run1b-is-active-nullable-check.sql`), never touched;
  - copied the LLD (v1.12), the runbook (v1.11), the contract v1.8 and its HTML, the five P02 PNGs and sprints S03–S10 (17 files; S00–S02 and S11 were identical already);
  - the pack's P07, P08 and P09 PNGs (8 files) differ from the repo's by bytes only: identical pixels, plus a C2PA `caBX` chunk. Not copied, since the copy list names only P02's images;
  - contract typecheck: exit 0;
  - committed `56746db9`.
- **Gate:** the kickoff (UPDATE-HERE) is Sri's confirmation: S02 pushed, 0155 applied, hash parity in production, amendments 74–83, contract v1.8, decisions D2–D4 at their recommended defaults.
- **Migration:** 0156 was free (latest 0155; run sets 0150–0155 exist). **Flag:** `agency_questions` already existed in `lib/flags/flags.ts`, default off.
- **Memory:** 6.58 GB free of 15.43 GB, 0 node processes.
- **Baseline on the untouched tree:**
  - typecheck clean (a temporary `tsconfig.s03.json` excluding `.next`, `next-env.d.ts`, `.qa`, `docs` and bundles; removed at the end);
  - 226 source-scan guard files (210 unit in 4 batches, 16 phase2 integration): 3,464 passed, 1 failed, prompt-trend's cold-import 5 s timeout (7/7 alone); the integration guards 461 passed, 6 skipped;
  - `tests/known-failures.txt`: 0 entries, kept at 0.

## Part 0: carry-overs from S02 (seven commits; live for everyone on push where a customer sees it)

### a. The PDF code font (amendment 76; `358b7558`)
- `lib/reports/pdf/fonts/jetbrains-mono-nl/`: JetBrains Mono NL Regular and Medium with their OFL, from JetBrains' own release v2.304. v2.211 isn't on GitHub releases. Same metrics: 1000 units per em, ascent 1020, descent −300, advance 600. NL has no GSUB table. The old `jetbrains-mono/` folder is removed.
- `fonts.ts` registers the family "JetBrains Mono NL"; `tokens.ts` sets `FONT.mono` to it.
- New `tests/integration/report-mono-ligatures.integration.test.tsx` (11 tests): every mono run (the cover's report name with an Agency tier name, evidence lines, audit tags) prints "--", "...", "::", "//", "->", "==", "++", "</" and "A++" without the DataView error, in every tier. RED on the parent: 10 failed (the three tiers threw; "today" has no mono run). GREEN 11/11, three runs.
  - Rule h's quote can't carry "..." (its sentence ends at the first full stop) or "->" (could-not-find strips Markdown marks), so the cover name, an agency action and the entity name carry those. The Method page has no mono run.
  - Found on the way: `tests/helpers/report-seeds.ts` hides one open item with `ORDER BY created_at, id LIMIT 1`. The created_at values are equal and the ids random, so OTHER ACTIONS sometimes has no item. My test deletes the hidden item itself; the seed is unchanged (Open items).
- Three existing tests changed, quoting amendment 76 ("the embedded-font tests name the NL family"): report-render-seeded (its XSS check is now laid out: `pdf: false` removed, pageCount 7), report-pdf-render (`JetBrainsMonoNL-Regular`), report-layout-s01c (the audit tags' family).
- Page counts equal S01C's `page-counts.json` (Bluegum, Ironstone and Kurrajong 7 in each of the four versions; Waratah 8): `.qa/screens/S03/pdf/`.
- Customer-visible: nothing, apart from ligature sequences printing as plain characters. Before, they crashed the PDF; no ligature was ever drawn.

### b. Client data in tests (amendment 77; `1222887a`, and `7cde331e` for the fixture's users)
- **Invented recordings:** the DataForSEO answers q11 and q13 (AI Overview and AI Mode) and the two task-post files are rewritten for an invented business, Yabby Services (`yabbyservices.com.au`). Its name-alike is `yabby-plumbing.com.au`. The press site, Reddit thread, reviewers, Google viewer id and paid ad are all invented; Yelp and ProductReview stay as platforms with invented pages. Element counts, references, distinct URLs and the Google/own split are as before. The consumer tests' assertions are unchanged, and golden `stored-answer-aio-q11.json` was regenerated. The guard's named exception is removed.
- **The four names** were renamed in `tests/` and `db/seed` with S02's mapping (Hero → Wren, Omega → Yabby, Bondi → Galah, Splice → Possum): 1,589 replacements in 205 files, then the decorated forms (full-width letters, zero-width characters). Real details went too: the client's street address, licence number and domains.
- **The mock model's canned answers** (`lib/llm/mock-responses`, 12 files) named "Bondi Plumbing", and that was their only "Bondi". It verified a Bondi brand by location, so renaming alone changed the off-parity golden. They now say "Galah Plumbing of Bondi". The regenerated golden differs only in that text and in the CSV rows' fixed-length truncation; every number is identical.
- **Initials expectations:** "SP" became "PO" (agency initials are the first two letters) and avatar "O" became "Y".
- **The guard is widened:** `tests/unit/copy/no-client-data-in-tests.test.ts` checks the four names across `tests/`, `db/seed`, the mock answers and the demo seed, and that the recorded files hold none of the real details (`RECORDED_DETAILS`). RED on the parent's tree: 223 files and 8 of 16 recordings. Working tree: 0 and 0.
- **The fixture's last users** (`7cde331e`, through a subagent whose work I re-ran): the 15 users of `tests/helpers/report-data-fixture.ts` now seed real brands (`tests/helpers/seeded-report-data.ts`) as `tests/integration/*.integration.test.ts(x)`, and the helper is deleted. 154 tests before, 154 after; my rerun with report-render-seeded: 187/187. Two expectations changed with the real path: directory-kind counts only cited rows, and business-examples' glossary example follows the registry's order ("(e.g. ServiceSeeking)").
- **Left, not guard-checked:** first names standing alone in comments ("Hero #54"), Bondi as a suburb, and app/lib production comments that name clients (116, outside this item).

### c. Question refresh failure (amendment 78; `ecaee96d`)
- `lib/costs/customer-safe.ts` `QUESTIONS_NOT_REFRESHED` is S01C's sentence. `customerAuditError` returns it for `PromptPackGenerationError`, and for a stored message starting "Could not refresh this brand's questions before running the audit". The banned-words test still passes.
- customer-audit-error's and customer-reasons' expectations changed, quoting amendment 78. RED on the parent: 4 failed. GREEN: 38/38. Related: 77 files, 807 passed.

### d. Questions page details (amendment 79; `bd9c0e32`; behind `question_library`)
- `questions-tab.tsx`: the section line `lastAuditLine` "Last audit (#54): 3 of 7 answers named you"; the legend `P02.legend` under the intro, only when a row shows engine squares, naming the squares' engines in their order. The intro's engines, the singular forms and the template pill were already in S02 (its deviations 1–4).
- The tab test's expectation changed, quoting amendment 79, plus 3 legend tests. Spec 16 expects the legend and "Last audit (#1): 3 of 39".

### e. Switching a flag on for everyone (amendment 81; `59107845`)
- `components/domain/admin/feature-flags-admin.tsx` `GlobalSwitch`: ticking Everyone opens the ConfirmDialog "Turn {flag} on for every workspace?" with Cancel and Turn on for everyone. Cancel leaves it unticked and saves nothing; unticking saves at once; the per-workspace dropdown is unchanged.
- The dialog's body, "{gates}. A workspace with its own setting keeps it.", isn't in the amendment: ConfirmDialog needs one, and it's true (`lib/flags/flags.ts`: a workspace override wins).
- 2 existing tests changed, quoting amendment 81, and 5 new ones. RED with item d on the parent: 8 failed. GREEN: 29/29. Spec 09 gains a Cancel-only test (a global save in the shared e2e database would touch every spec).

### f. Cascade test (amendment 75; `2c07d809`)
- `tests/integration/question-cascade.integration.test.ts` (5 tests) pins today's behaviour; it passes on the parent too, since the amendment asked for the test.
- Found: `audits.brand_id` and `organization_id`, `brands.organization_id` and about 35 brand-referencing tables are NO ACTION (pre-0155). So a raw DELETE of a brand or workspace with audits fails, with or without questions. The app hard-deletes brands only in the sample-audit cleanup, children first, and only closes workspaces (`deleted_at`).
- The test therefore checks:
  1. the sample cleanup on a sample brand whose answers and failures carry question ids;
  2. a workspace deleted children-first in one transaction;
  3. a brand delete after its audits taking its questions, set and items in one statement;
  4. a question a set uses can't be deleted alone (23503, as a statement and in a transaction);
  5. the items' foreign key is deferrable and deferred.

### g. Local `visibleau_test` (amendment 82): not done
Claude Code's permission check refused `DROP DATABASE visibleau_test`. Before: 87 tables, a ledger stopping at 0042, no workspaces, brands or audits; section2 and section3 on it: 30 passed, 1 skipped. 0156 was applied to it with `psql -f`. The commands are under Open items.

### Tests (Part 0)
- Guards on the tree before these commits: 226 files. The failures were prompt-trend's and avatar-color's timeouts and the lint-fence fixture race (contact-addresses, no-silent-fetch-fallback, effective-tier-guard, renewal-line ENOENT); all 42 pass alone.
- Playwright (`.qa/s03/playwright/`): 16-s02-questions-view 2/2 (peak 4.05 GB used, lowest free 2.91 GB, 0 leftovers, port free); 09-google-surfaces 6/6 with `PLATFORM_ADMIN_EMAILS` (peak 3.69, lowest free 3.22, 0 leftovers).

## Part 1: plan entitlements and migration 0156 (`01bdf329`)

- **`db/migrations/0156_question_packs.sql`:**
  - `organizations.question_packs` (integer, not null, default 0, CHECK ≥ 0);
  - `brand_question_packs` (`brand_id` primary key cascading from brands; `organization_id` cascading from organizations; `packs` ≥ 0; `updated_at`), FORCE RLS like the 0155 tables, grants to `visibleau_app`.
- **Run set** `db/prod-fixes/0156-s03-run1-precheck.sql`, `run2-apply.sql` (the migration verbatim plus one summary SELECT before COMMIT), `run3-post-check.sql` (BEGIN READ ONLY, catalogue checks, no SET ROLE, ROLLBACK) and `run4-rollback.sql`.
- **Applied locally:** `visibleau` and `visibleau_e2e` (migrate-local), `visibleau_integration` (setup-integration-db), `visibleau_test` (`psql -f`). Each shows the column and the forced table.
- **The local cycle** on dev `visibleau` (`.qa/s03/0156-cycle/`): run4 → run1 (f/f; t/t/t; 2 workspaces, 1 live brand, 0 rows) → run2 (summary 2 | 2 | 0 | 4 | t) → run3 (integer, not null, default 0, the check; RLS forced with 4 grants; both foreign keys cascade) → run4 (0 0, then f f) → run1 → run2 again. Dev keeps it.
- **`lib/pricing/tiers.ts`, per plan:**

  | Field | Free | Starter | Growth | Agency | Agency Pro | Enterprise |
  |---|---|---|---|---|---|---|
  | `includedScoredQuestions` | 10 | 10 | 10 | 10 | 10 | 10 |
  | `maxBrandedQuestions` | 5 | 5 | 5 | 5 | 5 | 5 |
  | `canWriteQuestions` | no | no | yes | yes | yes | yes |
  | `reachesAllowed` | 1 | 1 | 2 | 4 | 4 | 4 |
  | `customBusinessTypes` | 0 | 0 | 5 | 20 | unlimited | unlimited |
  | `reportCuration` | no | no | no | yes | yes | yes |
  | `questionPacks` | no | no | yes | yes | yes | yes |

- **`lib/questions/limits.ts`:** `questionLimitsFor(plan, packs)`, `getQuestionLimits(db, org, brand)`, `assertQuestionLimits`, and the 402 `question_limit` with appendix E's sentence, "Your plan includes {limit} everyday questions per brand. Remove one, or add a question pack."
  - Writing your own below Growth is 403 `plan_required` (amendment 30).
  - More than 5 naming the business, or fewer than 5 everyday, is 422.
- **Audit start:** `POST /api/audits` returns that 402 when `agency_questions` is on and the current set is over its limit.
  - Scheduled audits aren't checked. An over-limit set can't exist until S10 lets packs be removed: 10 is included on every plan, and apply refuses an over-limit set. Open items has the note.
- **Public pages unchanged.** The plan-claim guard is green.
- **Tests:**
  - limits.test.ts 7 and run-set-0156 5 (verbatim, one SELECT before COMMIT, no role switch or writes in run3);
  - question-limits.integration 7, question-packs-schema 4;
  - RED on the parent: the unit files can't load; integration 4 failed, and the 3 that passed are the route as before.
  - Related: 331 files, 3,740 passed, 1 cold timeout (brand-feature-locks, 74/74 alone).
  - Guards: effective-tier-guard failed until `lib/questions/limits.ts` was listed in `tests/helpers/plan-gates.ts`. The rest were the known timeouts and the race (29/29 alone); cancelled-plan-gates 249/249.

## Part 2: the checks on a question (`a93a37f8`)

- `lib/questions/validate.ts` `validateQuestion(raw, ctx)`, shared by the drawer (debounced) and the server, with P03's copy exactly (`CHECK_COPY`). The checks:
  - length 10–200;
  - one question;
  - no links, emails or phone numbers;
  - a duplicate by `question_text_key`;
  - naming the business (name, domain, aliases), with at most 5 per set (D-QI-BR);
  - a place for a non-global reach, with the one-click fix (`withPlace`);
  - an instruction-like screen (appendix C2's phrases);
  - a competitor named.
- HTML fails "One question" (LLD 11: "no HTML accepted"). P03 has no line for it; Open items has it.
- `lib/questions/validation-context.ts` (`brandPlaces`, `loadValidationContext`) and `POST /api/brands/:id/questions/validate`:
  - 401 signed out; 404 flag off or another workspace's brand; 403 for a role without `edit_brand_data`; 400 for a bad body;
  - 403 `plan_required` below Growth.
- Tests:
  - validate.test.ts 41: every rule, injection fixtures, unicode and dash variants;
  - question-validate-route.integration 5;
  - RED: the unit file can't load, and the route's 5/5 failed.

## Part 3: apply a new set from the next audit; archive (`f5e04c31`)

- `lib/questions/apply.ts` `applyQuestionSet` runs in one transaction with the brand row locked (FOR UPDATE):
  - 409 `stale_version` with P02's conflict sentence;
  - 403 for typed questions below Growth;
  - 422 for problems: positions, a reach other than Local, an id or text but not both, an unknown or archived question, failed checks, duplicates, more than 5 naming the business, a count mismatch, fewer than 5 everyday;
  - 402 over the limit.
- What it writes:
  - reworded questions archived first;
  - chosen suggestions made ready;
  - typed questions as `source='agency'` with `created_by`;
  - set version max+1 with its `comparison_hash` and items, and `is_current` flipped.
- `lib/questions/archive.ts`: 409 `in_current_set`, otherwise archived; never deleted.
- Routes `POST /api/brands/:id/question-sets` and `POST …/questions/:id/archive`. Audit Trail: `brand_questions_applied` ("Applied new questions") and `brand_question_archived` ("Archived a question").
- A running audit keeps its set, because it recorded `question_set_id` at start. A new hash isn't comparable, so the trend restarts.
- Tests: question-apply.integration 11, three runs:
  - two applies at once give one 409;
  - limits, archive rules, running-audit isolation, the hash, comparability;
  - RED: 10 of 11 failed.

## Part 4: the Questions tab's edit mode, the add drawer and the apply modal (`2162f009`; behind `agency_questions`)

- **GET /api/brands/:id/questions** also sends:
  - the brand's name;
  - who writes the agency's questions (`lib/questions/agency-name.ts`: report branding's agency name for the brand, then the workspace, else the workspace's name);
  - the limits the apply route enforces: `editable` = flag on, `edit_brand_data` and not Free; everyday allowed and minimum; at most 5 naming the business; whether the plan writes its own.
- **View rows** bind "Written by {agencyName}" (S02 printed "your agency").
- **P02 edit mode** (`components/domain/questions/question-editor.tsx`), opened by "Edit questions" (`?edit=1`):
  - The draft lives in this tab's sessionStorage, as a convenience; the server checks everything on apply.
  - Everyday rows move by drag, by their handle with Alt+↑/↓ (announced "Moved to position {n} of {m}"), or by the menu: Edit wording, Swap for a suggestion, Move up, Move down, Remove from set, Archive.
  - Suggestions' Add works in edit mode.
  - "+ Add question" opens the drawer. On Starter it shows the Growth lock, "Writing your own questions is available on Growth and up." and Upgrade.
  - The draft bar shows the chips, "{everyday} of {limit} everyday · {branded} of 5 naming you", Discard (with a confirm) and Apply. At ≤ 640 it's fixed to the bottom.
- **P03 add drawer:**
  - checks 250 ms after typing stops, the last response winning;
  - the draft's own duplicate and naming count added in the browser;
  - the place fix and the label line;
  - Add to draft only when nothing fails;
  - Esc with text asks "Discard this question?";
  - at ≤ 640, a full-screen sheet.
- **P04 apply modal:**
  - the net changes and the comparison notice from the current version's audits;
  - focus on Cancel;
  - 201 shows "Questions applied. The next audit will use version {v}." inline (D-UI4);
  - 409 shows the conflict banner with Reload; 402 shows the plan's sentence; 422 shows the checks sentence.
- **`lib/questions/text-key.ts`:** `questionTextKey` moved, byte for byte, so the browser can load it.
- **Overlays:** the drawer and the modal sit at z-50, like ConfirmDialog, so they cover the cookie banner. The contract's overlay 40 sits below the banner, and the app's value wins.
- **Tests:**
  - question-editor.test.tsx 12 and questions-route-edit.integration 3; RED 12/12 and 3/3. S02's tab 21/21 and route 5/5 unchanged.
  - Related: 71 files, 858 passed.
  - Guards found two problems, both fixed: no-real-names-in-ui caught "splice", the array method (now slices); no-silent-fetch-fallback caught an archive-after-apply failure that was dropped. Now it's counted and said: "{n} removed question(s) couldn't be archived; they stay in the library."
- **Playwright:**
  - new 17-s03-questions-edit 2/2: edit by keyboard and menu, add through the drawer, apply; then POST /api/audits runs the inline runner and the audit asks version 2 with the agency's question. The first run failed on the cookie banner covering the drawer, fixed by the z-50 above.
  - 16-s02-questions-view 2/2.

## Part 5: Workspace → Questions settings (`69d50bb5`, guard fix `a1469465`; behind `agency_questions`)

- **`/settings/questions`** (`app/(auth)/settings/questions/page.tsx`, `components/domain/questions/question-settings.tsx`), for owners and admins (the existing settings rule). Others see "Only owners and admins can open question settings."; flag off is 404.
  - **Defaults for new brands:**
    - everyday questions per brand, 5 to the plan's included count, as a stepper (a spinbutton by keyboard), with the help line "{plan} includes {n} per brand, plus packs";
    - "Fill empty slots with AI suggestions";
    - "Local · always on".
    - They save 500 ms after a change with an inline "Saved" (D-UI4), stored in `organizations.metadata.questionDefaults`. They never touch an existing brand (tested).
  - **The brands table** comes from one query (`loadQuestionSettings`). Columns: Brand, Areas, Everyday ("{active} / {allowed}", with a packs pill on a plan with packs), Written by you, Version, Last change ("backfill" for 0155's version 1, else "{date} · {name}"), and Edit questions (`/brands/:id/questions?edit=1`).
    - A search box past 10 brands, pages past 50, a sticky brand column when the table scrolls.
  - **"Copy questions from another brand":** a modal picks source and target, refusing the same brand. Then: "Copied {n} questions to {target} as suggestions. Review them in its Questions tab."
  - **Starter:** the stepper, the switch and Copy are off, with the Growth marker; the table is read-only. Loading, empty ("No brands yet. Add a brand to set its questions." with Add brand) and error ("We couldn't load question settings. Try again." with Retry) states.
- **`GET`/`PUT /api/settings/questions`** (`manage_brands`):
  - PUT is Growth and up (403 `plan_required`);
  - a count outside 5 and the included number is 422 "Choose between 5 and {included} everyday questions.";
  - "unchanged" when nothing changed;
  - a save goes in the Audit Trail (`question_defaults_changed`, "Changed question defaults for new brands").
- **`POST /api/brands/:id/questions/copy-from { sourceBrandId }`:**
  - `assertBrandAccess` on both brands, so another workspace's brand is 404 either way; `edit_brand_data`; Growth and up;
  - the source's current everyday questions land in the target's library as suggestions (`source='agency'`), with the source's suburb, city and state swapped for the target's as whole words. They're always copies, never shared rows;
  - ones the target already has, and ones naming the target, are skipped;
  - Audit Trail: `brand_questions_copied`.
  - P02's suggestions now carry each suggestion's source, so a copied one reads "Written by {agency}".
- **Navigation:** Questions sits after Notifications in `ACCOUNT_ITEMS`, marked with its flag. The layout says whether to show it (flag on, owner or admin) to the sidebar, the phone drawer and the `/settings` index. With the flag off, the Account list is as before.
  - s8-walk-regression's order list gains "Questions", quoting sprint S03 §5: "Route `/settings/questions` in the settings group (sidebar item if the group exists)".
- **Tests:**
  - question-settings.integration 7: the rows, packs, backfill, roles, flag off, PUT bounds, Starter 403, the Audit Trail, copy with places swapped and duplicates skipped, a second copy adds 0, cross-workspace 404 both ways, the same brand 422, a viewer 403;
  - question-settings.test.tsx 6;
  - RED: the component can't load; 7/7 integration failed.
  - Related: 22 files, 462 passed.
  - Guards: three found in this part and fixed — NAV-ORPHAN (the page had no `ACCOUNT_ITEMS` entry), D-UI1 (the switch's off track is `--border-control`), no-hex (the thumb's `#fff` fallback). The cold timeouts pass alone.
- **The guard gap (fixed, and saved to memory):**
  - no-arbitrary-first-brand lists files with `git ls-files`, so this part's untracked `settings.ts` wasn't scanned. Part 6's run caught its two brand reads.
  - `a1469465` names each brand in its own filter.
  - From then on, new files were listed with `git add -N` before each guard run.

## Part 6: the question mix and the split score (`5c8d31de`; behind `agency_questions`)

- **`lib/questions/mix.ts` `loadAuditQuestionMix`:** who wrote what the audit asked, from the set it recorded when it started (`audits.question_set_id`).
  - The agency's own questions against everything else (original, template, AI suggestions: "AI-suggested", as LLD 10 groups them).
  - An audit from before S02 recorded no set: its prompts are typed by the run-time branded check, all from the original set.
  - When both kinds were asked, each kind's Visibility comes from its own everyday answers, counted exactly as the headline counts them: every everyday answer on run 1, and a mention unless it's 'unverified'. So the two add up to the headline's AI-engine answers.
- **`lib/questions/mix-line.ts`** (no database, so the PDF can print it), with zero parts left out and singulars:
  - "{total} questions: {everyday} everyday (…) and {branded} that name the business.";
  - "(all from the original set)" for a brand whose questions were never changed;
  - the split, "AI-suggested questions: {pct}% ({m} of {n}) · Written by {agency}: {pct}% ({m} of {n})", only when both kinds were asked.
- **Audit page:** the mix line under the header's audit line; the split under the headline. The headline is unchanged.
- **Client portal:** the mix line under "Mentioned in …"; never the split, since P07.split is the audit page's.
- **Report:**
  - `buildReportV2` stores the mix, without the split (amendment 41), as `v2.questionMix.detail` while the flag is on, so the snapshot keeps it.
  - The Method page prints it; reports without it print S01's line.
- **Tests:**
  - mix.test.ts 5: every wording.
  - question-mix.integration 7:
    - the 7 + 3 fixture's mix line;
    - the split "AI-suggested questions: 14% (4 of 28) · Written by Possum Marketing: 17% (2 of 12)", with Gemini's 'unverified' mention not counted;
    - the headline still "Mentioned in 6 of 40 answers";
    - the report fixture standing in for Omega and the Ironstone seed standing in for Hero show only "(all from the original set)" on the audit page, the portal and the Method page;
    - the line comes back from `contents_snapshot` without the split;
    - Basic and Enhanced page counts equal the flag-off renders, also with 3 agency questions;
    - flag off: none of it.
  - RED: the unit file can't load; 5 of 7 integration failed (the 2 flag-off tests pass, as they should).
  - Related: 79 files, 724 passed.
  - Guards: the known timeouts and the lint-fence race pass alone, and no-arbitrary-first-brand's failure was Part 5's (above). The 10 `git ls-files` guards were run again with this part's files listed: 13 files passed.
- **Contract note:** P07.mix's example for an untouched brand, "13 questions: 13 everyday.", disagrees with the sprint and LLD 8.3.3, which give "10 everyday (all from the original set)" with the branded ones counted apart. I built the sprint's wording.

## Part 7: the Questions step on a new brand's "Confirm your business details" (`b238dbcf`; behind `agency_questions`)

- **When it shows:** for a brand with no audit yet whose place is confirmed (the card's "start the first audit" case). With the flag off, or for a brand with audits, the card confirms exactly as before. The route then doesn't load the new code, and the card loads the step lazily.
- **The card:**
  - two steps, "1 · Business details" and "2 · Questions", with `aria-current`;
  - "Next: questions" asks `POST /api/brands/:id/questions/confirm-preview` for the questions the chosen, unsaved types, audience and competitors make:
    - the generator's pack, with `regeneratePromptPack`'s inputs and the brand's place;
    - the workspace's everyday count (Part 5), filled from suggestions when it says so;
    - spares from the same generator.
  - Back keeps the choices.
- **The step** (`components/domain/questions/confirm-questions-step.tsx`):
  - P02's rows (`QuestionRow`, now exported with an action slot) under "Local · {place}", everyday ones first, then those that name the business, and "{everyday} of {limit} everyday";
  - Swap an everyday question for a spare (every paid plan);
  - Remove one, down to 5; a removed generated one goes back to the spares;
  - on Growth and up, "Add your own question" opens P03's drawer and checks. It's disabled at the plan's limit, with appendix E's sentence;
  - Free keeps the questions as offered;
  - "Confirm and start the first audit" sends exactly the list shown.
- **The confirm** (`PATCH confirm-classification` with `questions`, read only while the flag is on): after the details are saved, `confirmQuestions`:
  1. rebuilds the offer from the saved brand; a non-agency question the step didn't offer is 422 `questions_changed`;
  2. adds the offered questions to the library as suggestions;
  3. applies the shown list through `applyQuestionSet`, with every Part 3 check, as the next set: version 1 for a new brand;
  4. stores it as the pack with today's generator version, so the first audit asks exactly it and the audit start never regenerates it.
  - A refusal is thrown out of the transaction, so the details aren't saved either.
  - Audit Trail: `brand_questions_applied` with `{from: "confirm"}`.
- **Findings:**
  - One type gives the generator at most 10 everyday questions (plumbing alone 9; two types 19), so a single-type brand has no spare to swap.
  - With the default count at the plan's limit, the step starts full. That's why Remove exists.
- **Tests:**
  - question-confirm.integration 6:
    - the preview writes nothing;
    - fewer than 5 everyday is 422, and an unoffered question is 422, each with nothing saved;
    - exactly the list becomes version 1 and the pack; `getAuditQuestions` asks exactly it, with the agency question's id; the Audit Trail;
    - Starter's own question is 403 with nothing saved, and a swap is fine;
    - flag off: the preview 404s and the questions are ignored.
  - confirm-questions-step.test.tsx 8.
  - RED: the unit file can't load; 6/6 integration failed.
  - Related: 35 files, 693 passed. The flag and the module load lazily now; before that, the existing confirm-classification unit test's partial `@/db/schema` mock broke on the new import chain.
  - Guards on the final tree: only avatar-color's cold timeout, which passes alone.
  - New Playwright spec 18 (below).

## Playwright (Parts 5–7): not run: memory

- **Part 0:** 16-s02-questions-view 2/2 and 09-google-surfaces 6/6. **Part 4:** 17-s03-questions-edit 2/2 and 16 again 2/2 (details in their parts).
- **Parts 5–7:** `scripts/qa/e2e-specs-for.ts` maps 27 specs to their changed files: 13 for Part 5, 21 for Part 6 and 14 for Part 7, with spec 17 added because `questions-tab.tsx` changed.
  - Root config: 02, 03, 04, 05, 07, 09 (with `PLATFORM_ADMIN_EMAILS`), 10, 11, 12, 13, 14, 15, 16, 17 and the new 18.
  - Folder configs: audit-running/running-to-finished, responsive/responsive-shell (8 shards), section5-aa-e2e, sprint2 (2 shards), sprint3 (2), sprint4, sprint6, sprint7, sprint9/s9-autopilot (3 shards), qa sprint4 f04-audit-results, qa sprint9 f07-client-portal-e2e and f08-schedules-e2e.
- **Not run: memory, all of them.** Free memory after Part 7's commit:
  - 5.88 GB at the start;
  - runner attempts 1 and 2: 5.89 and 5.94 GB after 3 waits each;
  - a 20-minute wait: 5.90 to 6.03 GB, never 6.05 GB for a 30-second check.
  - 0 node processes of mine throughout. The top users by name were svchost (92 processes, 1.65 GB), Chrome 1.22 GB, Edge WebView 0.98 GB, Memory Compression 0.92 GB, Edge 0.55 GB, Defender 0.45 GB and Postgres 0.32 GB.
- **What that leaves unproven in a browser:**
  - spec 18 itself (new, never run): the confirm screen's Questions step end to end, the first audit asking exactly the confirmed list, the agency question labelled, and Starter seeing Swap only;
  - /settings/questions at every width in responsive-shell, and the Account entry;
  - the mix and split lines on the audit page;
  - the rest of the mapped specs on the pages Parts 5–7 touched.
  - The same behaviour is covered by integration and component tests (each part above), but not in a browser.
- **Screenshots not taken:** P05, P07 and P10 (spec 18 takes them). P02's edit mode, P03 and P04 are in `.qa/screens/S03/` from Part 4.

Each on a fresh e2e server, one at a time, with at least 6 GB free (`--workers=1`; for shards, `--fully-parallel`):

```
# root config (tests/e2e/NN-*.spec.ts)
npx playwright test 18-s03-confirm-questions.spec.ts --workers=1
npx playwright test 17-s03-questions-edit.spec.ts --workers=1
npx playwright test 16-s02-questions-view.spec.ts --workers=1
npx playwright test 02-brands-list.spec.ts --workers=1      # and 03, 04, 05, 07, 10, 11, 12, 13, 14, 15 the same way
PLATFORM_ADMIN_EMAILS=google-surfaces-operator@example.test npx playwright test 09-google-surfaces.spec.ts --workers=1
# folder configs
npx playwright test --config tests/e2e/responsive/playwright.config.ts responsive-shell.spec.ts --shard=1/8 --fully-parallel   # … 8/8
npx playwright test --config tests/e2e/sprint2/playwright.config.ts sprint2-workflow.spec.ts --shard=1/2 --fully-parallel      # … 2/2
npx playwright test --config tests/e2e/sprint3/playwright.config.ts sprint3-visibility.spec.ts --shard=1/2 --fully-parallel    # … 2/2
npx playwright test --config tests/e2e/sprint9/playwright.config.ts s9-autopilot-e2e.spec.ts --shard=1/3 --fully-parallel      # … 3/3
npx playwright test --config tests/e2e/audit-running/playwright.config.ts running-to-finished.spec.ts
npx playwright test --config tests/e2e/section5/playwright.config.ts section5-aa-e2e.spec.ts
npx playwright test --config tests/e2e/sprint4/playwright.config.ts sprint4-reports.spec.ts
npx playwright test --config tests/e2e/sprint6/playwright.config.ts sprint6-retrieval.spec.ts
npx playwright test --config tests/e2e/sprint7/playwright.config.ts sprint7-discovery.spec.ts
npx playwright test --config tests/qa/sprint4/playwright.config.ts f04-audit-results.spec.ts
npx playwright test --config tests/qa/sprint9/playwright.config.ts f07-client-portal-e2e.spec.ts
npx playwright test --config tests/qa/sprint9/playwright.config.ts f08-schedules-e2e.spec.ts
```

Compare their failures by name: `npx tsx scripts/qa/compare-failures.ts --e2e <saved output>` (`tests/e2e/known-failures.txt` is empty). Spec 18 also takes the P05, P07 and P10 screenshots into `.qa/screens/S03/`.

## Screens

### P02 · Brand → Questions tab (S03 edit mode)

```
P02 · Brand → Questions tab (edit mode)
Nodes: 13 of 14 built (P02.row.weak: S09); edit mode adds P02.header.edit, P02.addQuestion, P02.draftBar
States: loading ✓ empty ✓ error ✓ noPermission ✓ flagOff ✓ planLock ✓ (Starter: the Growth lock + Upgrade on + Add
  question; Free: view only) conflict ✓ (409 banner + Reload) overLimit ✓ (402: the plan's sentence in the modal)
Acceptance:
  ✓ View mode renders from one request; no N+1 per row (S02's EXPLAIN, rerun 27 Nov on the same fixture: 2.1 ms, the same index path; .qa/s03/explain/)
  ✓ Sections follow reach order then "Names your business"; branded rows aren't draggable (only everyday rows have handles)
  ✓ Header counts equal the set; "comparing since" equals the first audit with this hash (S02's route test)
  ✓ Edit mode works by keyboard alone: Alt+↑/↓, the menu, add, apply (component test; spec 17)
  ✓ A draft survives a reload in the same tab and is discarded on request (component test: Keep your draft? / Discard)
  ✓ Viewer and client portal never see edit controls (editable needs edit_brand_data; the portal has no tab)
  ✓ Flags off: no edit mode (agency_questions off) / no tab (question_library off)
Screenshots: .qa/screens/S03/P02-edit-1240-{light,dark}.png, P02-edit-390-{light,dark}.png
Deviations: listed below
```

### P03 · Add a question (drawer)

```
P03 · Add a question
Nodes: 7 of 7 built
States: idle ✓ checking ✓ ("Checking…") warn ✓ fail ✓ error ✓ (Try again) discard ✓ ("Discard this question?")
Acceptance:
  ✓ Every LLD 8.3.2 check is shown with P03's copy, blocking or warning as listed (validate.test.ts 41; component test)
  ✓ Server re-validation rejects anything the client let through (apply: 422 with each check; question-apply test)
  ✓ The one-click place fix produces a question that passes (component test; validate test)
  ✓ Keyboard only: open, type, (area: Local only until S04), fix place, add (component test; spec 17)
Screenshots: .qa/screens/S03/P03-1240-{light,dark}.png, P03-390-{light,dark}.png
```

### P04 · Apply new questions (modal)

```
P04 · Apply new questions
Nodes: 5 of 5 built
States: ready ✓ applying ✓ (Esc off) conflict ✓ (409) overLimit ✓ (402) invalid ✓ (422)
Acceptance:
  ✓ The audit range in the notice matches the comparison run in the data (component test from the history's audits)
  ✓ A running audit is unaffected: it keeps its question_set_id (question-apply test)
  ✓ Double-clicking Apply creates one version (the button disables on the first click; two applies at once: one 409)
Screenshots: .qa/screens/S03/P04-1240-{light,dark}.png (P04 at 390 not taken)
```

### P05 · Workspace → Questions settings

```
P05 · Workspace → Questions settings
Nodes: 7 of 7 built
States: loading ✓ (two skeleton blocks) empty ✓ error ✓ (one banner: the page loads from one request) noPermission ✓
  planLock ✓ (Starter: stepper, switch and Copy off with "Growth"; table read-only) flagOff ✓ (404, no Account entry)
Acceptance:
  ✓ One query for the table, no per-brand requests (loadQuestionSettings: one SQL; one fetch in the component)
  ✓ Changing defaults never changes an existing brand's set (integration test compares every set before and after)
  ✓ Copy lands as suggestions only and keeps brand-specific places (integration test: the target's places swapped in)
Screenshots: not taken (spec 18 not run: memory; it writes P05-1240-{light,dark}.png and P05-390-light.png)
Deviations: listed below
```

### P07 · Audit page: the mix and split lines (S03's part of P07)

```
P07 · Audit page (S03: P07.mix, P07.split)
Nodes: 2 of 2 of S03's built (P07.mix, P07.split); the others are S01's and S04's
States: flagOff ✓ (no lines) untouched brand ✓ (mix only, "(all from the original set)") both sources ✓ (mix + split)
Acceptance (P07's, for these nodes):
  ✓ Zero parts omitted (mix-line test)
  ✓ The split only when both sources exist; the headline counts all everyday questions (integration test: 6 of 40)
  ✓ The same mix line on the Method page (from the snapshot) and in the client portal (integration test)
Screenshots: not taken (spec 18 not run: memory; it writes P07-1240-{light,dark}.png and P07-390-light.png)
Deviations: listed below
```

### P10 · Confirm your business details: the Questions step (S03's part of P10)

```
P10 · Confirm business (S03: the Questions step on today's card)
Nodes: P10.steps (two steps in S03: Business details, Questions), P10.step3 built; the rest of P10 is S05–S08's
States: flagOff ✓ (today's card) loading ✓ ("Loading the questions…") error ✓ (the server's sentence, else "We
  couldn't save your details. Try again.")
Acceptance (P10's, as S03 can meet them):
  ✓ Nothing is used until Confirm (the preview writes nothing; integration test)
  ✓ Flags off: today's confirm screen (component test; the route ignores questions)
  ✓ Confirm saves exactly what is shown as set v1, and the first audit asks it (integration test: getAuditQuestions;
    spec 18 not run: memory)
  ✓ Starter sees Swap only; Growth and up add their own (component and integration tests; spec 18 not run: memory)
Screenshots: not taken (spec 18 not run: memory; it writes P10-1240-{light,dark}.png and P10-390-light.png)
Deviations: listed below
```

**Deviations from the contract, with the change I propose for each:**
1. **P02: "Keep your draft?" is asked when you come back, not when you leave.** A custom prompt on leaving isn't possible: `beforeunload` shows the browser's own. The draft is kept in sessionStorage. Change P02's interaction to "on return".
2. **P02: "Move to another area" is hidden until S04.** Local is the only area.
3. **P02: success is an inline status, not a toast** (D-UI4: no toast library is mounted).
4. **P02: Free is view-only.** The contract's edit rules name Starter and Growth and up only; LLD 8.3.5 says Free is "as today, fixed". Add Free to P02's access line.
5. **P02/P04: copy not in the contract:**
   - "Keep at least 5 everyday questions." (422);
   - the archive refusal for a question in the current set;
   - "Only Local questions for now." (422);
   - "{n} removed question(s) couldn't be archived; they stay in the library."
   - Add them to the copy lists.
6. **P04: overlay at z-50, not 40,** so the modal and P03's drawer cover the cookie banner (also z-50, earlier in the page), as ConfirmDialog does.
7. **P05: one error banner for the page, not one per card.** The page loads from one request, so both cards fail together. Change P05.states.error.
8. **P05: the loading skeleton is two blocks,** not "3 fields + 5 rows". Accept, or I'll match it in S04.
9. **P07: the untouched brand's mix line.** P07.mix's example, "13 questions: 13 everyday.", disagrees with the sprint and LLD 8.3.3 ("10 everyday (all from the original set)", with the branded ones counted apart). I built the sprint's wording. Change the example.
10. **P07: the split isn't in the portal.** P07.split is the audit page's; LLD 8.3.3's "under the headline" doesn't name a surface. Say if the portal should have it too.
11. **P10: Remove on everyday rows.** P10.step3 lists swap and add. With the workspace's count at the plan's limit, the step starts full and add is impossible without it. Remove goes down to 5, and a removed generated question returns to the spares. Add Remove to P10.step3.
12. **P10: two steps, not three.** S03 adds Questions after today's details (LLD 8.3.6); "Where you work" is S06's step 2. P10.steps reads "1 · Business details · 2 · Questions" until then.
13. **P10/P03: the drawer's button says "Add to draft"** on the confirm screen too (P03's copy). Say if it should read "Add question" there.

## Push notes

1. **Before the push, on production: migration 0156 as its run set**, `db/prod-fixes/0156-s03-run1-precheck.sql` → `run2-apply.sql` → `run3-post-check.sql`, each checked against Part 1's local cycle.
   - run1 and run3 are read-only. run2 is the migration verbatim and ends with one summary SELECT. run3 has no role switch.
   - `run4-rollback.sql` drops both again (only before the push, or after a revert).
   - **Strictly first:** the schema declares `organizations.question_packs`, and two reads select every column of `organizations` (sign-up's workspace row in `lib/auth/server.ts:216`; the free sample's workspace in `lib/sample-audit/synthetic-org.ts:8`). Without the column they fail.
2. **Inngest resync: no.** No Inngest function or step changed. The audit-start limit check is in the `POST /api/audits` route, and only while `agency_questions` is on.
3. **Safe while an audit runs.** An audit in progress keeps the set it recorded at start.
4. **Flag `agency_questions` stays off.** Off, every page and route behaves as after S02 (tested in each part):
   - the Questions tab's view mode;
   - no Workspace → Questions page and no Account entry;
   - no mix or split lines; the report prints S01's line;
   - the confirm card as before.
   - To try it, turn it on for one workspace; `question_library` must be on there too for the Questions tab.
5. **What customers will see change from Part 0 (live for everyone, not flagged):**
   - the report PDF's code font is JetBrains Mono NL. It looks the same, but sequences such as "--", "...", "->" or "A++" (an Agency tier name, an evidence line) print as plain characters. Before, they crashed the PDF.
   - an audit that fails because its questions couldn't be refreshed says S01C's sentence again: "Could not refresh this brand's questions before running the audit (a problem on our side)." (amendment 78).
   - behind `question_library`: the Questions page's section line reads "Last audit (#N): m of a answers named you", and the engine legend sits under the intro (amendment 79).
   - operators only: ticking a flag's Everyone box asks first (amendment 81).

## Open items and proposals

1. **Local `visibleau_test` (amendment 82), not done:** Claude Code's permission check refused the drop. 0156 is applied to it with `psql -f`; its section2 and section3 tests pass (30, 1 skipped). Your commands:
   ```
   "C:/Program Files/PostgreSQL/18/bin/psql.exe" -d postgres -c "DROP DATABASE visibleau_test"
   DATABASE_URL=postgresql://postgres:password@localhost:5432/visibleau_test DIRECT_URL=postgresql://postgres:password@localhost:5432/visibleau_test npx tsx scripts/db/migrate-local.ts --create-database
   npx vitest run --project integration tests/integration/section2 tests/integration/section3
   ```
2. **Amendment 74's regeneration and edited sets.** When the app regenerates a brand's pack (rename, location change, newer generator), S02 writes the new pack as the next set version. Now that agencies edit sets (Parts 3, 4 and 7), that would replace an agency's set with the generator's.
   - Proposal: once a set has a version the agency applied, a regeneration keeps the set, or swaps only the original questions.
   - Part 7's confirm stamps today's generator version, so the first audit never regenerates. A later generator bump would, though.
3. **Spares for one business type.** The generator has at most 10 everyday templates per type (plumbing 9), so a single-type brand gets no spare on the confirm screen or in P02's suggestions. S05's taxonomy is the natural fix. Until then the step shows no Swap there (it says nothing about why).
4. **Scheduled audits aren't checked against the question limit** (Part 1). Over-limit sets can't exist yet: 10 is included on every plan, and apply, copy and confirm all refuse over-limit sets. S10, when packs can be removed, should check at the scheduled start too.
5. **Rule b's action title** (seen by the Part 0 2c subagent; production copy, not changed). It names the directories an engine that never names you cites, but its reason doesn't say so. And it credits every such engine ("the directories ChatGPT and Gemini cite most") when only one cited them.
6. **`tests/helpers/report-seeds.ts` hides an arbitrary item:** `ORDER BY created_at, id LIMIT 1` over equal created_at values and random ids. Proposal: order by title, or seed distinct times. My test deletes the hidden choice itself.
7. **The split counts AI-engine answers only.** A brand whose headline includes Google AI Overviews and AI Mode (`headlineIncludesGoogle`) gets a split whose two parts add up to the AI-engine answers, not the headline's total. Say if Google's answers should be split too.
8. **HTML in a typed question** fails P03's "One question" check (LLD 11: "no HTML accepted"). P03 has no line of its own for it; propose one, or confirm this.
9. **Contract deviations,** each with the change I propose, are listed with the screens below.

## Commits

`git log origin/main..main --oneline` before the report commit (`origin/main` = `717e8c40`):

```
b238dbcf feat(questions): S03 part 7 -- the Questions step on a new brand's "Confirm your business details" (LLD 8.3.6, client request C4; contract P10 step 3)
5c8d31de feat(questions): S03 part 6 -- the question mix line and the split score: audit page, client portal, the report's Method page (LLD 8.3.3, D2; contract P07.mix, P07.split, P09.method)
a1469465 fix(questions): S03 part 5 -- copy-from's two brand reads name their brand (no-arbitrary-first-brand guard)
69d50bb5 feat(questions): S03 part 5 -- Workspace -> Questions settings: defaults for new brands, the brands table, copy questions from another brand (LLD 8.3.4; contract P05)
2162f009 feat(questions): S03 part 4 -- the Questions tab's edit mode, the add drawer and the apply modal (LLD 8.3.1; contract P02 edit mode, P03, P04)
f5e04c31 feat(questions): S03 part 3 -- apply a new question set from the next audit, and archive a question (LLD 8.3.1, 8.3.7, 8.2.3; contract P04)
a93a37f8 feat(questions): S03 part 2 -- the checks on a question someone writes, shared by the drawer and the server, and POST /api/brands/:id/questions/validate (LLD 8.3.2, appendix C2; contract P03)
01bdf329 feat(questions): S03 part 1 -- plan entitlements for questions, migration 0156 (question packs) and the limit check when an audit starts (LLD 7.6, 8.3.5, 7A)
7cde331e chore(tests): S03 part 0 -- the last users of the hand-composed report fixture move to seeded brands; the fixture is deleted (LLD amendments 51, 77)
2c07d809 test(questions): S03 part 0 -- hard deletes of a brand and a workspace whose answers and failures link questions, on the real schema (LLD amendment 75)
bd9c0e32 feat(questions): S03 part 0 -- the Questions page's section line names its audit, and a legend says what the squares are (LLD amendment 79; contract v1.8 P02)
59107845 fix(admin): S03 part 0 -- turning a flag on for every workspace asks first (LLD amendment 81)
1222887a chore(tests): S03 part 0 -- no client data left in tests: invented Google recordings, the four names everywhere, the mock model's answers (LLD amendment 77)
ecaee96d fix(audit): S03 part 0 -- a question-generator failure keeps S01C's own plain sentence (LLD amendment 78)
358b7558 fix(reports): S03 part 0 -- the PDF code font is JetBrains Mono NL, so ligature sequences no longer crash react-pdf (LLD amendment 76)
56746db9 docs: client-enhancements pack v1.16 (S02 done, S03 Part 0)
```

The report itself is the last commit, `docs(sprints): S03 report`.

## End of the task

- **Removed:** `tsconfig.s03.json`, the temporary typecheck config. Never committed.
- **Tree:** clean apart from Sri's three untracked items, never touched. Nothing pushed, deployed or run against production. No `drizzle-kit push`.
- **Databases:** 0156 applied locally to `visibleau`, `visibleau_e2e`, `visibleau_integration` and `visibleau_test`. The EXPLAIN fixture rolled back. `visibleau_test` isn't rebuilt (Open items 1).
- **`tests/known-failures.txt`** and the e2e list: 0 entries, kept at 0. Every failure in every run was compared by name. The only ones were the cold-import 5 s timeouts and the lint-fence fixture race, which pass alone, plus the guard findings each part fixed.
- **Not run, by the testing rules:** the full unit and integration suites (not asked for), `next build` (not asked for), and Playwright for Parts 5–7 (memory, above).
- **Memory at the end:** 5.94 GB free of 15.43 GB, 0 node processes (no dev server or Playwright run started after Part 4's, whose processes all exited: 0 leftovers, port 3000 free).
