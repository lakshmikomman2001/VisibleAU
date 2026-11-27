# S04 — S03 carry-overs, then visibility reach: Local (default), State, Country, Global

> **Before Part 1:** follow `docs/lld/CLAUDE-CODE-RUNBOOK.md` (read order, pre-flight, rules, stop points). At the end, save your report-back to `docs/Sprints/reports/S04-report.md` and commit it as the last commit.

Start with `git fetch origin` and build on `origin/main` (S03 pushed: `7af3dc71`, 27 Nov 2026; 0156 applied; live check passed; `agency_questions` on for Splice only); say which hash. Read LLD **section 0** (v1.13 decisions and amendments) first, then sections 2.3, 4, 7.2, 7A (0157), 8.2.1, 8.3, 8.4 (all), 10, 13, 20 (agreed D-QI7–9) and appendix E; contract screens P01 (reach card), P02 (sections by reach, and Part 0's regeneration banner and edit-mode changes), P03 and P10.step3 (Part 0), P05 (Part 0), P07 (reach row, and Part 0's split), P09 (reach row).

**UI contract:** build every screen named above from `docs/prototypes/vunnara-ui-config.ts` (its `screens` entries; canonical for layout, tokens, exact copy, states, accessibility, responsive rules and acceptance), following `docs/prototypes/PROTOTYPE-GUIDE.md` and mapping every token and component through `docs/prototypes/token-map.md`. `client-enhancements-v2.html` and `docs/prototypes/screens/*.png` are the visual reference. Interactive and tested nodes get `data-testid` from `testIdOf(node id)`. A screen part isn't done until all of its listed states exist.

**Rules (every part):**
- One commit per numbered part; don't amend; commit only in a separate step after tests finish, never chained with `;`. **Never push.**
- Targeted tests only: related tests, new tests RED on the parent then GREEN, typecheck, lint, compared by name with `tests/known-failures.txt` (0 entries; keep 0), named guards. Full suites only if Sri asks. Playwright only in parts that change a screen or a shared UI component: run the specs `scripts/qa/e2e-specs-for.ts` maps to the files that part changed, one at a time, only with ≥ 6 GB free (otherwise "not run: memory" and list the specs). Parts that change only data, jobs, scoring, APIs or PDF rendering don't run Playwright; say "Playwright: not needed (no UI change)".
- ⛔ No mock data in production; no `any`; FORCE RLS; no new `serviceDb`; no production writes (migration 0157 as a run1–run4 set).
- **Local is always on and is the default for every brand, exactly as today.** No reach is ever enabled automatically. Existing brands: same questions, same headline number, same trend (N1–N3).
- Agreed decisions: no Google AI for Global; reaches per plan Free 1, Starter 1, Growth 2, Agency 4, Agency Pro 4, Enterprise 4; headline combines all enabled reaches and names them.
- Market-agnostic: AU data only in `lib/markets/au.ts`; `lib/markets/us.ts` is an empty stub with the same interface; a guard test fails on AU strings elsewhere in reach code.
- Behind `visibility_reach` (off). With it off, behaviour equals S03 plus Part 0.
- **Part 0 is S03's carry-overs (amendments 84–96), item 0a first.** Rule b's change (0g) is live for everyone (not flagged; N15 allows it). 0a's rule applies whatever the flags (a set a person applied exists only where `agency_questions` has been on; in production none has been applied yet), and its banner shows on the Questions page. 0b–0f sit behind `agency_questions` where S03 put them; that flag is on for Splice, so Splice sees them on the push.
- Migration 0157's run set follows runbook section 5: run2 ends with one summary SELECT; run3 needs no role switch and checks each privilege on its own (LLD amendment 92).
- If the LLD contradicts the code, the code wins: report with file:line; continue only with independent parts.

## 0. Carry-overs from S03 (one commit per item; 0a first)
- **0a. A set a person applied survives a regeneration** (amendment 84; LLD 8.2.1). Do it first and commit it before any other part: Part 3 changes the generator.
  - Find every path that regenerates a brand's pack (the brand update on a rename or a location change; the generator-version check at audit start in both runners; any other caller) and route them through one function. List them with file:line.
  - When the current set's `applied_by` is a user: write no set version; add the regenerated questions to the library as suggestions (skip text keys already live); update the brand's generator version so the next audit start doesn't regenerate again; record that suggestions arrived after the set, so P02 shows `P02.regenBanner` (contract v1.9) with "Review suggestions"; the set and its hash stay. The banner goes when a new version is applied. Otherwise (0155's backfill, or a regeneration's version): amendment 74, as today.
  - Brand settings: when a save kept the set this way, its inline status reads "Saved. Your questions didn't change: review the new suggestions in Questions." with the link.
  - Tests, RED on the parent: on a brand whose set a person applied, a rename, a location change and a generator bump each keep the version and the hash, add the suggestions once (a second audit start adds none and doesn't regenerate) and show the banner; on an untouched brand each still writes the next version; a running audit keeps its set; both runners.
  - Say in the push notes whether Inngest needs a resync for this item.
- **0b. The confirm step** (amendments 85, 93; P10.step3, P03): with no spare to swap in, no Swap buttons and the line "No other questions to swap in for this business type yet." under the everyday list; on the confirm screen the drawer's button reads "Add question" (P02's drawer keeps "Add to draft"). Component tests; spec 18.
- **0c. P02 edit mode** (amendment 96): "Keep your draft?" only when the saved draft differs from the current set; an unchanged draft is dropped silently. At the plan's limit, the suggestions' Add and "+ Add question" are disabled, with the limit sentence as their tooltip and as a help line under the everyday list; Swap and Remove still work. First report what Add does at the limit today (live it was enabled at 10 of 10). Component tests; spec 17.
- **0d. P05** (amendment 95): the same page wrapper as the other Account pages (live, the title and cards started at the sidebar's edge and ran off the right edge at about 1920 wide); "Last change" reads "Original questions · {date}", "Confirmed · {date} · {userName}" or "{date} · {userName}" (it printed "backfill"). responsive-shell covers `/settings/questions` at 390, 768, 1240 and 1920 with no horizontal overflow.
- **0e. The split** (amendments 88, 94): each source on its own line under the headline, right-aligned with it; when `headlineIncludesGoogle` is on, Google's answers are split too. Tests: the parts add up to the headline with the setting off and on. P07 screenshot at 1240 with a long agency name.
- **0f. P03's HTML line** (amendment 89): "Plain text only: remove the HTML." as its own blocking check in `validateQuestion` (drawer and server), instead of "One question". Validate tests.
- **0g. Rule b** (amendment 87; live for everyone, on the audit page, in Recommended actions and in every report):
  - first find what "any of 9 answers" counted in live audit #56, where the per-engine panel says Claude 0 of 10, and report it with file:line;
  - credit only the engines that cited the listed directories;
  - the reason reads "{Engine} didn't name you in any of its {n} answers to everyday questions. These are the directories it cited most in them.", with {n} the per-engine panel's count;
  - leave out directories the directory actions already name; if none is left, keep the reason and drop the action.
  - Tests on a seeded invented brand shaped like #56 (one engine never names it; Yellow Pages both cited by it and named by the directory action). The four seeds' page counts unchanged, or reported. N15.
- **0h. Client names in production comments** (amendment 90): neutral wording in `app/`, `lib/` and `components/` comments; the client-data guard covers those folders for the five business names (suburbs stay). RED on the parent.
- **0i. Test hygiene** (amendment 91): `tests/helpers/report-seeds.ts` picks the hidden item by title; spec 18 sets its 420 s timeout with `test.describe.configure({ timeout: 420_000 })` (or the config) so its sign-in fixture is covered; list any other spec that calls `test.setTimeout` inside a test that signs in through a fixture, and fix those the same way.
- **0j. Run-set grant checks** (amendment 92): replace `db/prod-fixes/0156-s03-run3-post-check.sql` with the reviewed copy in this pack (`prod-fixes/0156-s03-run3-post-check.sql`; it ran in production on 27 Nov 2026: checked 28, missing 0). The run-set test fails on any run3 from 0156 on that passes a comma list to `has_table_privilege` or `has_column_privilege`.
- Report-back for Part 0: per item what changed and its tests (RED/GREEN); what a customer sees change on the push (0g for everyone; 0a for brands whose set a person applied, none in production today; 0b–0f for workspaces with `agency_questions` on, today Splice); the "9 answers" finding; S03's sentence for the archive refusal, quoted (contract v1.10 records it); Playwright per the runbook.

## 1. Provider location parameters (no product change)
Confirm from each provider's current documentation the web-search location parameters for OpenAI, Anthropic, Perplexity (and that Gemini has none in our integration), and DataForSEO location names/codes for Australian states (do states exist in DataForSEO's locations list?). Quote each in a code comment with the link. Report the table that will drive Part 4.

## 2. Schema (migration 0157) and backfill
- `brand_visibility_scopes`, `audit_reach_results` per LLD 7.2 (FORCE RLS, grants, indexes).
- run2: one `local` row per non-deleted brand (enabled, place from suburb/city/state/postcode, `target_count` = current everyday count); `audit_reach_results` `local` rows for past complete audits from their existing figures and `question_set_hash` as `reach_hash`.
- run3: every brand has exactly one enabled reach (local); every complete audit has a local result equal to its stored headline; grants.
- Add to RLS guard list, cascade and retention tests.

## 3. Markets and templates per reach (LLD 8.4.2, 8.4.3)
- `lib/markets/au.ts` (states, abbreviations, capitals, country words, DataForSEO names, phrasing rules) and the `us.ts` stub.
- Reach variants for every template family/legacy category with `{place}`; `toServicePhrase()` from S00; every non-global question names its place; global has none.
- Generation fills each enabled reach's `target_count`; new questions land as suggestions or a draft through the S03 apply flow, never applied silently (amendment 84 holds: generation never replaces a set a person applied).
- Tests: an invented IT-services business shaped like TechCore IT (amendment 66; Sydney/NSW/Australia) produces correct place words; NSW written "NSW", TAS written "Tasmania"; global questions contain no place; validator passes all.

## 4. Engine location and caching per reach (LLD 8.4.4)
- Location settings per reach from Part 1, set where they live today: `userLocation` in `lib/llm/openai-impl.ts` and `lib/llm/anthropic-impl.ts` (LLD section 0, #18; country "AU" is sent only for a confirmed city today); Gemini and Perplexity get none in our integration unless Part 1 shows a supported parameter (words only).
- Answer cache keys include reach and location so answers are never replayed across reaches.
- Tests: each engine's request payload per reach (snapshot of the provider request body, no live calls); cache key separation.

## 5. Google AI per reach (LLD 8.4.5)
- local as today; state via DataForSEO state location if available else capital labelled "Checked from Sydney, as NSW"; country = Australia; global not run, with the sentence "Worldwide questions are measured on the four AI engines only." (customer-facing word for `global` is "Worldwide", contract C-07)
- Cost ceiling scales with the number of questions checked.
- Tests: location chosen per reach; global skipped; existing Local behaviour unchanged.

## 6. Reach settings UI and API (LLD 8.4.1, 8.4.7, P01)
- `GET/PUT /api/brands/:id/reaches` (plan reach limit → 402; sum of targets ≤ plan everyday limit + packs → 422 with message; Local cannot be disabled → 422).
- P01 card exactly as the prototype: locked Local row, toggles, place chips, steppers (Local min 4), live total, small-sample note, suggestion banner (only from data; dismissible; never auto-enables), plan lock markers, "Save and review questions" → Questions tab edit mode with the draft for added reaches (P02 → P04).
- Tests: route rules; component; e2e enabling NSW + Australia on a test brand through to apply.

## 7. Scoring, display and trends per reach (LLD 8.4.6, 10)
- On audit completion write `audit_reach_results` (both runners); per-reach Wilson interval with the existing function; reach hash per reach.
- Headline combines enabled reaches; label lists them; Local-only label "Local · Sydney".
- P07 reach row (hidden for Local-only), Questions tab sections by reach, Responses tab, per-engine table, Google section and competitors grouped by reach; PDF Summary reach row (only with > 1 reach) and snapshot fields (`headline.reaches`, `reaches[]`).
- Trends: compare per reach by `reach_hash`; headline trend by overall hash as today.
- Tests: Local-only fixtures identical (N3, N14); 3-reach fixture figures, CIs, small-sample flags, PDF row, trend separation.

## Report-back
- Part 0: the block its last bullet asks for.
- Per part: file:line, changes, tests (RED/GREEN, by name), guards (incl. the market-string guard), Playwright run, "not run: memory" (with the specs) or "not needed (no UI change)".
- Part 1's provider table with links.
- UI: for each screen touched, the guide's per-screen block (nodes built of specified, states, acceptance pass/fail, screenshots in `.qa/screens/S04/` at 1240 and 390, deviations with the contract change you propose).
- Commit hashes and `git log origin/main..main --oneline`.
- Push notes: migration 0157 first (run1→run2→run3); Inngest resync (yes: audit runners and Google surfaces); safe while an audit runs (running audits finish as Local); flag `visibility_reach` off; what Part 0 changes for everyone (0g) and for Splice (0b–0f), and that 0a changes nothing until a person applies a set.

Commit messages end with these two lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015t9HuZaoYxNVzVR718W5od
