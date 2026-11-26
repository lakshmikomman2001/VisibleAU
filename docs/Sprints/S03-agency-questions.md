# S03 — Agency-written questions, apply flow, workspace Questions page, plan limits, mix and split score

> **Before Part 1:** follow `docs/lld/CLAUDE-CODE-RUNBOOK.md` (read order, pre-flight, rules, stop points). At the end, save your report-back to `docs/Sprints/reports/S03-report.md` and commit it as the last commit.

Start with `git fetch origin` and build on `origin/main` (S02 pushed: `717e8c40`, 27 Nov 2026; 0155 applied; hash parity confirmed on Hero's audit #56); say which hash. Read LLD **section 0** (v1.12 decisions and amendments) first, then sections 4, 7.1, 7.6, 7A (0156), 8.2.3, 8.3 (all), 10, 11, 20 (D2, D3, D4) and appendices C2, E; contract screens P02 (edit mode), P03, P04, P05, P07 (mix and split lines), P10 step 3 (for the confirm-screen questions step).

**UI contract:** build every screen named above from `docs/prototypes/vunnara-ui-config.ts` (its `screens` entries; canonical for layout, tokens, exact copy, states, accessibility, responsive rules and acceptance), following `docs/prototypes/PROTOTYPE-GUIDE.md` and mapping every token and component through `docs/prototypes/token-map.md`. `client-enhancements-v2.html` and `docs/prototypes/screens/*.png` are the visual reference. Interactive and tested nodes get `data-testid` from `testIdOf(node id)`. A screen part isn't done until all of its listed states exist.

**Rules (every part):**
- One commit per numbered part; don't amend; commit only in a separate step after tests finish, never chained with `;`. **Never push.**
- Targeted tests only: related tests, new tests RED on the parent then GREEN, typecheck, lint, compared by name with `tests/known-failures.txt` (0 entries; keep 0), named guards. Full suites only if Sri asks. Playwright only in parts that change a screen or a shared UI component: run the specs `scripts/qa/e2e-specs-for.ts` maps to the files that part changed, one at a time, only with ≥ 6 GB free (otherwise "not run: memory" and list the specs). Parts that change only data, jobs, scoring, APIs or PDF rendering don't run Playwright; say "Playwright: not needed (no UI change)".
- ⛔ No mock data in production; no `any`; FORCE RLS; no new `serviceDb`; no production writes (migration 0156 as a run1–run4 set).
- Non-regression: LLD section 4 (N1–N15) must hold after every part; list the guards you ran for each part.
- Behind `agency_questions` (off). With it off, behaviour equals S02.
- Decision defaults: D2 split score shown; D3 10 everyday included per paid plan; D4 Starter chooses among suggestions only. Follow Sri's choice if changed.
- Limits are enforced on the server; the UI only reflects them.
- If the LLD contradicts the code, the code wins: report with file:line; continue only with independent parts.
- Migration 0156's run set follows runbook section 5's Neon rule (LLD amendment 80): run2 ends with one summary SELECT before COMMIT; run3 needs no role switch.

## 0. Carry-overs from S02 (not flagged; one commit per item group; live for everyone on push where it changes what a customer sees)
- **The PDF code font** (amendment 76): replace JetBrains Mono 400/500 with JetBrains Mono NL 400/500 (the official no-ligature build; OFL; same metrics) wherever react-pdf registers it. First a render test, RED on the parent: every mono run (the cover's report name with an Agency tier name, evidence lines, audit tags, the Method page) printing "--", "...", "::", "//", "->", "==", "++", "</" and "A++" renders without "Offset is outside the bounds of the DataView". The embedded-font tests (Inter, Fraunces, JetBrains Mono) name the NL family; page counts of the four seeds unchanged (compare with S01C's `page-counts.json`). N14 and N15 hold. Remove the `pdf: false` workaround in the moved XSS check.
- **Client data in tests, the rest** (amendment 77):
  - replace the recorded DataForSEO answers (`tests/fixtures/google-surfaces/dataforseo/{aim,aio}-task-get-q11/q13.json`, the task-post files, golden `stored-answer-aio-q11.json`, spec 09) with invented recordings of the same shape (an invented business, invented reviewers and sites, no allegations), keep their consumer tests' assertions, and remove the guard's named exception;
  - rename the four client names in the remaining tests with S02 Part 0's mapping, then widen `tests/unit/copy/no-client-data-in-tests.test.ts` to all of `tests/` and `db/seed`;
  - move the 12 remaining users of `tests/helpers/report-data-fixture.ts` to the seeds (`tests/helpers/report-seeds.ts`), then delete the helper if nothing uses it.
- **Question refresh failure** (amendment 78): `customerAuditError` keeps S01C's sentence for `PromptPackGenerationError`: "Could not refresh this brand's questions before running the audit (a problem on our side)." Its banned-words test still passes.
- **Questions page details** (amendment 79, contract v1.8 P02): the intro names the plan's engines; the section line reads "Last audit (#{auditNumber}): {m} of {a} answers named you"; the legend `P02.legend` under the intro; the singular forms; the template pill. Component tests; Playwright: the specs the mapper lists (spec 16 among them).
- **Switching a flag on for everyone** (amendment 81): on `/admin/settings`, ticking a flag's Everyone box opens the existing confirm dialog "Turn {flag} on for every workspace?" (Cancel / Turn on for everyone); Cancel leaves it unticked and saves nothing; unticking needs no confirmation; the per-workspace dropdown is unchanged. Tests; Playwright: the mapped admin spec.
- **Cascade test** (amendment 75): an integration test on the real schema hard-deletes a brand, and separately a workspace, whose citations and engine-call failures carry `question_id`s, and both succeed; deleting a question a set uses on its own still fails.
- **Local `visibleau_test`** (amendment 82): recreate it from the migrations (local only), so 0155 and 0156 apply; section2's tests pass on it.
- Report-back for Part 0: what changed per item, tests RED/GREEN, and what a customer sees change on push (the font: nothing visible apart from the ligature sequences now printing as plain characters).

## 1. Plan entitlements (LLD 7.6, 8.3.5) and migration 0156
- Question limits are new work: today `PROMPTS_PER_AUDIT = 10` applies to every plan and `market_ai_budget_policies.max_prompts_per_audit` is never read (LLD section 0, #21). Don't wire the unused policy column; put the limits in `tiers.ts`.
- `tiers.ts`: `includedScoredQuestions`, `maxBrandedQuestions` (5), `canWriteQuestions`, `reachesAllowed`, `customBusinessTypes`, `reportCuration`, `questionPacks` per plan; `lib/questions/limits.ts` `getQuestionLimits(orgId, brandId)` and `assertQuestionLimits()` (also called at audit start).
- Migration 0156: `organizations.question_packs`, `brand_question_packs` (packs used in S10; default 0 means no change now).
- Public pages unchanged in this sprint (plan-claim guard must stay green).
- Tests: every plan's limits; 402 messages from appendix E.

## 2. Validation (LLD 8.3.2, appendix C2)
`lib/questions/validate.ts` shared by client (debounced) and server: length, one question, no links/contacts, duplicate by `question_text_key`, branded detection (name, domain, aliases; max 5 branded, D-QI-BR), place present for non-global reach (one-click fix suggestion), instruction-like screen, competitor named. `POST /api/brands/:id/questions/validate`. Tests for each rule including injection fixtures and unicode/dash variants.

## 3. Apply flow and versions (LLD 8.3.1, 8.3.7)
- `POST /api/brands/:id/question-sets` with `baseVersion`: one transaction, `select … for update` on the current set, insert new questions (`source='agency'` for typed ones, `created_by`), insert set v n+1 and items, flip `is_current`, compute `comparison_hash`; 409 on stale base, 402 over limits, 422 failed checks.
- Editing wording archives the old row and inserts the new one; questions used by any set are archived, never deleted.
- An audit already running keeps its set (it recorded `question_set_id` at start).
- Tests: concurrency (two applies → one 409), limits, archive rules, running-audit isolation, hash recomputation, trend restarts (comparator treats new hash as not comparable).

## 4. Questions tab edit mode, add drawer, apply modal (P02, P03, P04)
Edit mode with draft (sessionStorage convenience, server-validated), drag + Alt+↑/↓ + menu moves, swap for suggestion, move reach (Local only until S04), remove, archive, add (drawer P03 with live checks, `aria-live`), sticky draft bar with live counts, apply modal P04 with net changes and the new-comparison notice (audit numbers from the current comparison run), toast on success, 409/402 messages. Starter: swap/remove/reorder suggestions only; "Write your own" locked. Viewer and portal: read-only. Tests: components, e2e add → apply → next audit uses the new set (use the inline runner in the e2e environment).

## 5. Workspace → Questions settings page (LLD 8.3.4, P05)
Route `/settings/questions` in the settings group (sidebar item if the group exists, VERIFY): defaults for new brands (count within plan, fill with suggestions), brands table (areas, everyday active/allowed, written by agency, version, last change, link), "Copy questions from another brand" (same workspace only; copies land as suggestions in the target's library with places swapped where they match; never shared rows). APIs with brand access checks on both brands. Tests incl. cross-org refusal.

## 6. Disclosure and split score (LLD 8.3.3, P07)
- Mix line on the audit page, PDF method page (from the S01 snapshot) and portal.
- Split line under the headline only when both sources exist; headline counts all everyday questions (unchanged formula).
- Tests: mix and split on a fixture with 7 AI/template/original + 3 agency questions; the seeded fixtures standing in for Hero and Omega show only the mix line ("10 everyday (all from the original set)").

## 7. Questions step on the existing confirm screen (LLD 8.3.6, client request C4)
On "Confirm your business details", add a **Questions** step after the details: the questions that will be asked (templates for the confirmed types and place), grouped by reach, using the P02 row component; swap for a suggestion; on Growth and up "Add your own question" (P03 drawer and the same checks). "Confirm and start the first audit" saves set v1 from exactly what is shown (no regeneration afterwards). Existing confirmed brands are unaffected. Tests: e2e new brand with one agency-written question → first audit asks it, labelled; Starter sees swap only.

## Report-back
- Per part: file:line, changes, tests (RED/GREEN, by name), guards, Playwright run, "not run: memory" (with the specs) or "not needed (no UI change)".
- UI: for each screen touched, the guide's per-screen block (nodes built of specified, states, acceptance pass/fail, screenshots in `.qa/screens/S03/` at 1240 and 390, deviations with the contract change you propose).
- Commit hashes and `git log origin/main..main --oneline`.
- Push notes: Part 0's customer-visible changes (live for everyone); migration 0156 first; Inngest resync (no, unless the audit-start check changed a function: say which); safe while an audit runs; flag `agency_questions` off.

Commit messages end with these two lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015t9HuZaoYxNVzVR718W5od
