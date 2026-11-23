# S02 — Question library and versioned question sets (today's questions become version 1)

> **Before Part 1:** follow `docs/lld/CLAUDE-CODE-RUNBOOK.md` (read order, pre-flight, rules, stop points). At the end, save your report-back to `docs/Sprints/reports/S02-report.md` and commit it as the last commit.

Start with `git fetch origin` and build on `origin/main` (S01 pushed); say which hash. Read LLD **section 0** (v1.6 decisions and amendments) first, then sections 4 (N1–N3 especially), 6, 7.1, 7A (0155 and the backfill steps), 8.2, 10, 13, 15 and `docs/lld/as-is-verification.md`; contract screens P02 (view mode only).

**UI contract:** build every screen named above from `docs/prototypes/vunnara-ui-config.ts` (its `screens` entries; canonical for layout, tokens, exact copy, states, accessibility, responsive rules and acceptance), following `docs/prototypes/PROTOTYPE-GUIDE.md` and mapping every token and component through `docs/prototypes/token-map.md`. `client-enhancements-v2.html` and `docs/prototypes/screens/*.png` are the visual reference. Interactive and tested nodes get `data-testid` from `testIdOf(node id)`. A screen part isn't done until all of its listed states exist.

**Rules (every part):**
- One commit per numbered part; don't amend; commit only in a separate step after tests finish, never chained with `;`. **Never push.**
- Targeted tests only: related tests, new tests RED on the parent then GREEN, typecheck, lint, compared by name with `tests/known-failures.txt` (0 entries; keep 0), named guards. Full suites only if Sri asks. Playwright only in parts that change a screen or a shared UI component: run the specs `scripts/qa/e2e-specs-for.ts` maps to the files that part changed, one at a time, only with ≥ 6 GB free (otherwise "not run: memory" and list the specs). Parts that change only data, jobs, scoring, APIs or PDF rendering don't run Playwright; say "Playwright: not needed (no UI change)".
- ⛔ No mock data in production; no `any`; FORCE RLS; no new `serviceDb` in request paths; no production writes (migration 0155 as a run1–run4 set).
- **This sprint must not change any audit's questions, order, hash, headline or comparability (N1–N3).** Every part proves it.
- The Questions tab is behind `question_library` (off). Audits read the current set regardless (LLD 17 note), which is safe only because set v1 equals the stored pack; the parity tests are the proof.
- If the LLD contradicts the code, the code wins: report with file:line; continue only with independent parts.

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
- Tests: for Hero, Omega and Bondi fixtures, prompts before vs after are identical byte for byte and in order (N1); both runners produce the same prompts; hash identical (N2); headline identical on #50/#51/#54/#55 fixtures (N3); branded detection unchanged (N4).

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
- Push notes: migration 0155 **run1 → run2 → run3 before the push** (the new code reads the new tables and writes `citations.question_id`, so those must exist first; with no set a brand falls back to today's logic); Inngest resync (yes: audit runners); safe while an audit runs (an audit in progress keeps its prompts); flag `question_library` off.

Commit messages end with these two lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015t9HuZaoYxNVzVR718W5od
