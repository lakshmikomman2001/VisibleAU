# S02 — Question library and versioned question sets (today's questions become version 1)

> **Before Part 1:** follow `docs/lld/CLAUDE-CODE-RUNBOOK.md` (read order, pre-flight, rules, stop points). At the end, save your report-back to `docs/Sprints/reports/S02-report.md` and commit it as the last commit.

Start with `git fetch origin` and build on `origin/main` (S01C pushed: `00fad405`, 26 Nov 2026; the real reports regenerated for Splice and checked); say which hash. Read LLD **section 0** (v1.11 decisions and amendments) first, then sections 4 (N1–N3 especially), 6, 7.1, 7A (0155 and the backfill steps), 8.2, 10, 13, 15 and `docs/lld/as-is-verification.md`; contract screens P02 (view mode only).

**UI contract:** build every screen named above from `docs/prototypes/vunnara-ui-config.ts` (its `screens` entries; canonical for layout, tokens, exact copy, states, accessibility, responsive rules and acceptance), following `docs/prototypes/PROTOTYPE-GUIDE.md` and mapping every token and component through `docs/prototypes/token-map.md`. `client-enhancements-v2.html` and `docs/prototypes/screens/*.png` are the visual reference. Interactive and tested nodes get `data-testid` from `testIdOf(node id)`. A screen part isn't done until all of its listed states exist.

**Rules (every part):**
- One commit per numbered part; don't amend; commit only in a separate step after tests finish, never chained with `;`. **Never push.**
- Targeted tests only: related tests, new tests RED on the parent then GREEN, typecheck, lint, compared by name with `tests/known-failures.txt` (0 entries; keep 0), named guards. Full suites only if Sri asks. Playwright only in parts that change a screen or a shared UI component: run the specs `scripts/qa/e2e-specs-for.ts` maps to the files that part changed, one at a time, only with ≥ 6 GB free (otherwise "not run: memory" and list the specs). Parts that change only data, jobs, scoring, APIs or PDF rendering don't run Playwright; say "Playwright: not needed (no UI change)".
- ⛔ No mock data in production; no `any`; FORCE RLS; no new `serviceDb` in request paths; no production writes (migration 0155 as a run1–run4 set).
- **This sprint must not change any audit's questions, order, hash, headline or comparability (N1–N3).** Every part proves it.
- The Questions tab is behind `question_library` (off). Audits read the current set regardless (LLD 17 note), which is safe only because set v1 equals the stored pack; the parity tests are the proof.
- If the LLD contradicts the code, the code wins: report with file:line; continue only with independent parts.

## 0. Carry-overs from S01B and S01C (not flagged; no product change)
- **No client data in tests** (LLD amendment 57): replace TechCore's ABR record in the ABN tests (S01 Part 11) and `ASTORIO GROUP PTY LTD` / its ABN in `tests/unit/reports/beyond-ai.test.ts` with invented records; move the remaining users of the hand-composed `tests/helpers/report-data-fixture.ts` (the design, Google section, cover-tier and running-checks render tests) to the seeded fixtures in `tests/helpers/report-seeds.ts`. List what you changed; a source-scan test fails on the real names and ABNs found (list them in the test as forbidden strings, no other client data in it). Also `tests/e2e/12-s01-report-contents-panel.spec.ts`, which seeds a brand named "TechCore IT", and any other spec or fixture that seeds a real client's name, ABN or domain (list them): invented names (amendment 66).
- **Serve manifest:** fix or retire `scripts/qa/inngest-serve-manifest.txt` and `sprint9-invariants.sh` A3 (out of date; `tests/unit/inngest/function-ids.test.ts` covers N13). Say which and why.
- **No-database guard:** close the same `path: null` gap S01B fixed in the network guard (an `http`-style connect to a Postgres port).
- **Unused code** (S01C's report): `namedCitedInAnswersList` (`lib/directories/cited-in-answers.ts`) is used only by tests: remove it and those uses. The directories parameter of `entityProfilesAction` and `displayRecommendationAction` is no longer read: remove it, and the directory lookups its callers still make (the Action Center detail page, the audit export, the latest-audit route).
- One commit; tests as the runbook says. Playwright: not needed.

## 0B. Small fixes from S01C's review (live for everyone on push; not flagged; LLD amendments 68, 69, 71–73)
- **Other actions order** (68): when the agency saved an order for OTHER ACTIONS FROM THIS AUDIT in the report contents panel, the PDF keeps it; otherwise High, Medium, Low, then newest first (contract v1.7 P09.next). Test both on the seeds (Standard and Enhanced).
- **Report file names** (69): a plain hyphen, "{Brand} - AI Visibility Report ({Tier name}) - Week {w} {yyyy}.pdf" (`lib/communication/report-file-name.ts`), everywhere S01C Part 5a listed. Tests: the name, and that its ASCII fallback equals it.
- **Plain reasons, the rest** (71). For each, file:line and the old and new words:
  - the report-PDF-failed alert's org copy: "We couldn't create this report because of a problem on our side. Try again in a few minutes.";
  - Google's daily-cap customer reason (`lib/audit/google-surfaces/reasons.ts:62`): "Google wasn't checked in this audit because of a problem on our side.";
  - whole-audit errors through `customerAuditError` that aren't about the customer's own setup (e.g. "Budget exceeded", an unexpected exception's message): "This audit couldn't finish because of a problem on our side." The customer-caused reasons (an unconfirmed business type, the workspace's daily audit limit) keep their words; list every reason and which group it is in;
  - the audit page banner: platform admins (the existing platform-admin check) also see the provider detail under the plain line; everyone else sees only the plain line.
  - Extend S01C's banned-words test to these surfaces; the operator email keeps its detail.
- **Renaming a brand** (72): the PATCH in `app/api/brands/[brandId]/route.ts` clears a dismissed `abn_suggestion` too (with its ABR data), not only the dateless marker. Test in `tests/integration/abr-retention.integration.test.ts`.
- **Reports page** (73, contract P17): dates "25 Nov 2026" with the app's date formatter; period "Week 47, 2026" (a monthly report: "November 2026"). The pink "Communication" label beside the page title: find its source (file:line) and what it means; remove it unless it tells the reader something they need, and report which.
- One commit. N14 and N15 hold (no PDF wording changes in 0B). Playwright: the specs `scripts/qa/e2e-specs-for.ts` maps to the changed files (the Reports page and the audit page among them), one at a time, with the runbook's memory rules.

## 1. Schema (migration 0155) and hash parity
- Tables and columns exactly as LLD 7.1 (`brand_questions`, `brand_question_sets`, `brand_question_set_items`, `audits.question_set_id`, `citations.question_id`, `engine_call_failures.question_id`), FORCE RLS, policies, grants, indexes.
- `lib/questions/hash.ts` `computeQuestionSetHash()` reproducing the SQL algorithm used for `audits.question_set_hash` (sorted `COLLATE "C"`, distinct `question_text_key()`, newline-joined, SHA-256 hex). Unit test against the 0150/0152 fixtures and against real hashes from the local DB: identical.
- Add new tables to the RLS guard list, deletion cascade and retention tests.

## 2. Backfill set (0155 run1–run4) — the delicate part
Follow LLD 7A steps 1–5 exactly:
- Packs carry 10 everyday questions plus 3 to 5 that name the business (LLD section 0, #7); `kind` follows `isBrandedPrompt()` (`lib/audit/flag-branded-prompts.ts`, aliases included since S00).
- run1 (read-only): per brand, the pack prompts with SQL-derived `kind` compared to `citations.is_branded_prompt` from that brand's latest complete audit for the same prompt; expected 0 differences; also counts per brand.
- run2: insert library rows (`source='original'`, `reach='local'`, `status='ready'`), set v1 (`is_current=true`), items in stored order, `comparison_hash` in SQL.
- run3: brand by brand, v1 `comparison_hash` vs the latest complete audit's `question_set_hash` where that audit used the stored pack; list mismatches with reason (never fix them); grants and RLS checks.
- run4: delete exactly what run2 inserted.
- Local integration test runs the same SQL on fixtures and asserts parity.

## 3. One `getAuditPrompts()` reading the current set
- `lib/audit/get-audit-prompts.ts`: current set items in position order → `[{text, kind, reach, questionId}]`; fallback to today's logic only when no set exists (log a metric). Existing errors (`BrandNeedsConfirmationError`, `PromptPackGenerationError`) keep their behaviour.
- Both runners (`run-audit.ts`, `run-audit-inline.ts`) call it; remove the inline-vs-Inngest divergence and the hard-coded 10s (use `PROMPTS_PER_AUDIT` only for template generation).
- Audit start records `audits.question_set_id`; citation and failure inserts record `question_id`.
- `audits.question_set_hash` still computed exactly as today.
- Tests: for the invented fixtures standing in for Hero, Omega and Bondi (amendment 66), prompts before vs after are identical byte for byte and in order (N1); both runners produce the same prompts; hash identical (N2); headline identical on #50/#51/#54/#55 fixtures (N3); branded detection unchanged (N4).

## 4. Questions tab, read-only (LLD 8.2.2, P02 view mode)
- `GET /api/brands/:id/questions`: current set, library, suggestions, limits; one query joining set items, library and last-audit results aggregated by `question_id` (index use shown with EXPLAIN on local data); brand access, RLS context.
- UI per P02 view mode: sections by reach (Local only for now), badges, service/intent chips when known, per-engine dots for the last audit (four states including "unverified" for the audit page's "Maybe", D-UI6), header line (version, applied, counts, "comparing since audit #N"), skeleton/empty/error states, 390 px layout.
- Suggestions: template-generated alternatives (`source='template'`, `status='suggested'`) for the brand's category and place, created on demand and stored; "Add" disabled until S03.
- Tests: route (auth, RLS, cross-org 404), component, e2e view; responsive shell spec updated.

## Report-back
- Per part: file:line, changes, tests (RED/GREEN, by name), guards, Playwright run, "not run: memory" (with the specs) or "not needed (no UI change)".
- Part 2: run1/run3 queries and what Sri should expect; local parity results.
- EXPLAIN output for the Questions tab query.
- UI: for each screen touched, the guide's per-screen block (nodes built of specified, states, acceptance pass/fail, screenshots in `.qa/screens/S02/` at 1240 and 390, deviations with the contract change you propose).
- Commit hashes and `git log origin/main..main --oneline`.
- Push notes: migration 0155 **run1 → run2 → run3 before the push** (the new code reads the new tables and writes `citations.question_id`, so those must exist first; with no set a brand falls back to today's logic); Inngest resync (yes: audit runners); safe while an audit runs (an audit in progress keeps its prompts); flag `question_library` off. Part 0B is live for everyone on push (not flagged): list what a customer will see change.

Commit messages end with these two lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015t9HuZaoYxNVzVR718W5od
