# S07 — Question intelligence 4b: the business's own directory listings

> **Before Part 1:** follow `docs/lld/CLAUDE-CODE-RUNBOOK.md` (read order, pre-flight, rules, stop points). At the end, save your report-back to `docs/Sprints/reports/S07-report.md` and commit it as the last commit.

Start with `git fetch origin` and build on `origin/main` (S06 pushed; evaluation fit target met); say which hash. Read LLD **section 0** (v1.7 decisions and amendments) first, then sections 7.4, 7.7 (`directory_registry`), 8.6.4, 11, 12, 20 (D-QI2); contract screens P10 (listing match banner).

**UI contract:** build every screen named above from `docs/prototypes/vunnara-ui-config.ts` (its `screens` entries; canonical for layout, tokens, exact copy, states, accessibility, responsive rules and acceptance), following `docs/prototypes/PROTOTYPE-GUIDE.md` and mapping every token and component through `docs/prototypes/token-map.md`. `client-enhancements-v2.html` and `docs/prototypes/screens/*.png` are the visual reference. Interactive and tested nodes get `data-testid` from `testIdOf(node id)`. A screen part isn't done until all of its listed states exist.

**Rules (every part):**
- One commit per numbered part; don't amend; commit only in a separate step after tests finish, never chained with `;`. **Never push.**
- Targeted tests only: related tests, new tests RED on the parent then GREEN, typecheck, lint, compared by name with `tests/known-failures.txt` (0 entries; keep 0), named guards. Full suites only if Sri asks. Playwright only in parts that change a screen or a shared UI component: run the specs `scripts/qa/e2e-specs-for.ts` maps to the files that part changed, one at a time, only with ≥ 6 GB free (otherwise "not run: memory" and list the specs). Parts that change only data, jobs, scoring, APIs or PDF rendering don't run Playwright; say "Playwright: not needed (no UI change)".
- ⛔ No mock data in production; recorded fixtures in tests, no live DataForSEO calls in tests. No `any`; FORCE RLS; no new `serviceDb`; no production writes.
- Non-regression: LLD section 4 (N1–N15) must hold after every part; list the guards you ran for each part.
- Only strong matches are offered; nothing is linked without the client's yes.
- Behind `qi_listings` (off). Decision default D-QI2: read a profile page only where robots.txt allows, one page per directory; otherwise use the search result's title and snippet as weaker evidence.
- If the LLD contradicts the code, the code wins: report with file:line; continue only with independent parts.

## 1. Directory terms check (no product change)
For each registry directory of kind general/trades/reviews/health: record its robots.txt rules for our bot and generic agents and any published terms on automated access (link), in `docs/lld/directory-access-notes.md`. Directories that disallow are snippet-only. Report the table.

## 2. Search and match (LLD 8.6.4)
`listings` step in `analysis-run`: two DataForSEO Google organic searches ("<name> <suburb or city>", "<name> <domain>") using the existing DataForSEO client and cost recording; keep registry domains; read the local pack for the Google Business Profile; match confidence from name similarity plus phone, postcode or website link (weights in code with tests); drop weak matches. Tests with recorded SERP fixtures: Hero's Localsearch profile matched strongly; a same-name business in another state not offered.

## 3. Read and extract
Allowed profiles fetched once via the guarded fetcher; extract categories, services and areas with quotes (quote verification as layer 1); otherwise snippet evidence marked `source_kind='listing'` with lower prominence weight. Normalise to taxonomy. Tests: extraction fixtures, snippet fallback, robots-disallow respected.

## 4. Confirm screen and linking (P10)
"Is this your <directory> profile?" banners (strong matches only); Yes writes the link into `brand_directory_listings` (status `listed`, `profile_url`, through the existing `PUT /api/brands/:id/directory-listings` rules) so later audits show "Your profile: {n} cited" / "Not linked yet" and the next Enhanced report's "Your directory profiles" tile (S01) counts it as linked; No stores the dismissal; listing evidence badges appear on services. Tests: e2e yes/no; audit directories card reads the new link; and the profile-link rule follows the table (LLD section 0, amendment 28): an integration test against the real `directory_registry` table in the test database adds a directory row and changes another row's `domain_pattern` (host and path prefix), clears the registry's 5-minute cache in the test (no waiting), and shows `PUT /api/brands/:id/directory-listings` accepting and rejecting pasted links by the new rule; hipages keeps its fixed `/connect/{slug}` rule.

## Report-back
- Per part: file:line, changes, tests (RED/GREEN, by name), guards, Playwright run, "not run: memory" (with the specs) or "not needed (no UI change)".
- Part 1's access table.
- Evaluation: run the harness for the 20 businesses with listings on; report wrong-profile offers (target 0).
- UI: for each screen touched, the guide's per-screen block (nodes built of specified, states, acceptance pass/fail, screenshots in `.qa/screens/S07/` at 1240 and 390, deviations with the contract change you propose).
- Commit hashes and `git log origin/main..main --oneline`.
- Push notes: no migration expected; Inngest resync (yes: analysis-run steps); safe while an audit runs; flag `qi_listings` off.

Commit messages end with these two lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015t9HuZaoYxNVzVR718W5od
