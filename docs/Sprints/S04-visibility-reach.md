# S04 — Visibility reach: Local (default), State, Country, Global

> **Before Part 1:** follow `docs/lld/CLAUDE-CODE-RUNBOOK.md` (read order, pre-flight, rules, stop points). At the end, save your report-back to `docs/Sprints/reports/S04-report.md` and commit it as the last commit.

Start with `git fetch origin` and build on `origin/main` (S03 pushed and checked); say which hash. Read LLD **section 0** (v1.7 decisions and amendments) first, then sections 2.3, 4, 7.2, 7A (0157), 8.4 (all), 10, 13, 20 (agreed D-QI7–9) and appendix E; contract screens P01 (reach card), P02 (sections by reach), P07 (reach row), P09 (reach row).

**UI contract:** build every screen named above from `docs/prototypes/vunnara-ui-config.ts` (its `screens` entries; canonical for layout, tokens, exact copy, states, accessibility, responsive rules and acceptance), following `docs/prototypes/PROTOTYPE-GUIDE.md` and mapping every token and component through `docs/prototypes/token-map.md`. `client-enhancements-v2.html` and `docs/prototypes/screens/*.png` are the visual reference. Interactive and tested nodes get `data-testid` from `testIdOf(node id)`. A screen part isn't done until all of its listed states exist.

**Rules (every part):**
- One commit per numbered part; don't amend; commit only in a separate step after tests finish, never chained with `;`. **Never push.**
- Targeted tests only: related tests, new tests RED on the parent then GREEN, typecheck, lint, compared by name with `tests/known-failures.txt` (0 entries; keep 0), named guards. Full suites only if Sri asks. Playwright only in parts that change a screen or a shared UI component: run the specs `scripts/qa/e2e-specs-for.ts` maps to the files that part changed, one at a time, only with ≥ 6 GB free (otherwise "not run: memory" and list the specs). Parts that change only data, jobs, scoring, APIs or PDF rendering don't run Playwright; say "Playwright: not needed (no UI change)".
- ⛔ No mock data in production; no `any`; FORCE RLS; no new `serviceDb`; no production writes (migration 0157 as a run1–run4 set).
- **Local is always on and is the default for every brand, exactly as today.** No reach is ever enabled automatically. Existing brands: same questions, same headline number, same trend (N1–N3).
- Agreed decisions: no Google AI for Global; reaches per plan Free 1, Starter 1, Growth 2, Agency 4, Agency Pro 4, Enterprise 4; headline combines all enabled reaches and names them.
- Market-agnostic: AU data only in `lib/markets/au.ts`; `lib/markets/us.ts` is an empty stub with the same interface; a guard test fails on AU strings elsewhere in reach code.
- Behind `visibility_reach` (off). With it off, behaviour equals S03.
- If the LLD contradicts the code, the code wins: report with file:line; continue only with independent parts.

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
- Generation fills each enabled reach's `target_count`; new questions land as suggestions or a draft through the S03 apply flow, never applied silently.
- Tests: TechCore IT example (Sydney/NSW/Australia) produces correct place words; NSW written "NSW", TAS written "Tasmania"; global questions contain no place; validator passes all.

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
- Per part: file:line, changes, tests (RED/GREEN, by name), guards (incl. the market-string guard), Playwright run, "not run: memory" (with the specs) or "not needed (no UI change)".
- Part 1's provider table with links.
- UI: for each screen touched, the guide's per-screen block (nodes built of specified, states, acceptance pass/fail, screenshots in `.qa/screens/S04/` at 1240 and 390, deviations with the contract change you propose).
- Commit hashes and `git log origin/main..main --oneline`.
- Push notes: migration 0157 first (run1→run2→run3); Inngest resync (yes: audit runners and Google surfaces); safe while an audit runs (running audits finish as Local); flag `visibility_reach` off.

Commit messages end with these two lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015t9HuZaoYxNVzVR718W5od
