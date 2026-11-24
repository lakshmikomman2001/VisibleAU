# S01B report: report polish and hardening

Sprint S01B of the Vunnara client enhancements · 24 Nov 2026 · built on `origin/main` = `bb5248d5` (S01, pushed; checked with `git fetch origin`) plus the v1.12 docs commit `a939c61c` · nothing pushed.

## Read first

1. **Parts 1–4 are done and committed. Part 5 (privacy wording) is blocked and needs Sri's decision.** Amendment 54's wording ends "…and delete it when the brand is deleted." That isn't true of the code. Deleting a brand only sets `brands.deleted_at` (`app/api/brands/[brandId]/route.ts:275`). Nothing ever deletes the ABR results: `brand_entity_scores` rows and `brands.abn_suggestion` stay, and neither table is in the retention job. Following the runbook (the code wins; never change behaviour to match a document), I didn't put that sentence on the public pages. The options and the exact places are in Part 5 below.
2. **The PDFs:** `.qa/screens/S01B/pdf/` (after) and `.qa/screens/S01B/pdf-before/` (before, the same seeds rendered by the code before Part 4). Each has every page as a PNG at 1240 px. There is one contact sheet per tier and folder: `.qa/screens/S01B/pdf-{today,basic,standard,enhanced}-sheet.png` and `pdf-before-…-sheet.png`. Every report is now 7 pages: Enhanced was 9 and Standard 8 (table below).
3. **Found and fixed on the way (not in the prompt):**
   - an Enhanced report never showed "Done since the last report": its contents are built after its own row is written, so the newest earlier report was itself (S01 Part 9; Part 4 here);
   - the weekly retention job never deleted technical audits that belong to no audit (Part 2).
4. **Playwright: nothing is "not run: memory".** The one spec mapped to Part 4 ran three times in full:
   - 5 of 5 on the third run;
   - its first test failed in two of the three full runs on Part 4's code, and passed alone. On the parent's code it passed 5 of 5 in one full run.
   - It waits 5 s for the contents panel after Generate on a cold server, and the page showed the panel's loading skeleton at the failure. I count it as a timing flake, not a regression, but say so plainly (details in Part 4).
5. **The one whole unit and integration run** (allowed for Part 3 only) found 16 tests reaching the network, all fixed (Part 3). It also found one failure that isn't this sprint's: `e2e-rls-fk-services` "audit_cost_audit_id_idx is gone" fails because `visibleau_integration` still has that index (Part 3).

## Pre-flight

- **Update step (v1.12):**
  - pack found (`README.md`: "v1.12");
  - `git fetch origin`: local `main` = `origin/main` = `bb5248d5`; the tree was clean apart from Sri's three untracked items;
  - copied the LLD, the runbook, the contract and its HTML, the guide and screens (unchanged), and `sprints/*.md` (adds `S01B-report-polish.md`);
  - contract typecheck: exit 0;
  - committed `a939c61c`.
- **Gate:** the kickoff line is Sri's confirmation: S01 pushed (`bb5248d5`), 0154 applied, live checks passed, report and PDFs reviewed, `report_v2` off.
- **Migration:** none in this sprint (latest is 0154; S02 owns 0155).
- **Baseline on the untouched tree:**
  - typecheck clean (temporary tsconfig excluding `.next` and `next-env.d.ts`; 2,031 files);
  - the 89 source-scan guard files (the `tests/unit` and `tests/phase2` files that read code through `tests/helpers/source-files.ts`, `readdirSync`, `globSync` or `git ls-files`): 1,600 passed, 0 failed;
  - `tests/known-failures.txt`: 0 entries.
- **Memory:** 7.21 GB free, 0 node processes.
- **Read:**
  - the runbook;
  - LLD section 0 (amendments 43–55), 4, 8.1, 11, 12, 15 and 17;
  - the S01 report in full;
  - as-is verification 1.12 and the token map's summary;
  - the contract v1.4 diff (P07, P08, P09, P13, P17, P18).
  - Not read: the S00 and S00B reports in full (S01's report carries what they found).

## Part 1. Enhanced checks in their own function (amendment 49) — `cea0dc4f`

- **Shared steps:** `lib/reports/enhanced-report-steps.ts` (new):
  - `ENHANCED_CHECKS_REQUESTED = "report/enhanced-checks-requested"` (`:22`);
  - `enhancedChecksRequest` checks the event's data;
  - `runEnhancedRefresh` (`:69`) and `writeEnhancedSnapshot` (`:84`) hold S01 Part 9's two step bodies, unchanged in behaviour.
- **New function:** `inngest/functions/refresh-enhanced-checks.ts` (`:28`), id `refresh-enhanced-checks`.
  - Concurrency `[{ key: "event.data.brandId", limit: 1 }, { scope: "account", key: '"enhanced-checks"', limit: 2 }]`, not `POST_AUDIT_POOL`.
  - Steps `refresh-enhanced-checks` → `write-report-snapshot` → `emit-report-generated`.
  - Registered in `app/api/webhooks/inngest/route.ts:34,84`, and added to `scripts/qa/inngest-serve-manifest.txt`.
- **The generator** (`inngest/functions/generate-narrative-report.ts`):
  - for an Enhanced report, `generate-and-insert` writes the row ("Running checks…"); step `request-enhanced-checks` (`:249`) sends the event, with id `enhanced-checks-{reportId}` so a retried send starts one refresh;
  - then the run ends, which frees the post-audit pool at once.
- **In-flight runs: I kept the existing step ids readable.**
  - `generate-and-insert` now returns `checksIn: "refresh-enhanced-checks"` (`:217`).
  - A run whose first step finished under the old code has no `checksIn` in its memoized result. It still runs the old `refresh-enhanced-checks` and `write-report-snapshot` steps in the generator (`:261`), so Inngest never asks for a step id the new code lacks. This is tested.
- **N13:**
  - there was no vitest function-id snapshot (only the shell manifest), so I added one: `tests/unit/inngest/function-ids.test.ts`. It asserts the app id `visibleau`, every registered id (S01's 47 plus `refresh-enhanced-checks`), and that every function defined is served;
  - `tests/phase2/sprint3/e2e-cross-sprint-seams` "serve() array has 47 functions" now says 48, with a dated note, as each earlier addition did.
- **Tests:**
  - `tests/unit/inngest/enhanced-checks-concurrency.test.ts` (5) reads each function's real `concurrency` option and admits runs as Inngest documents it:
    - two Enhanced reports for one brand: one at a time;
    - brand A doesn't wait for brand B;
    - at most two account-wide;
    - a post-audit job starts while refreshes run, and vice versa.
  - `tests/integration/enhanced-checks-function.integration.test.tsx` (5), on a real database with recorded runners:
    - the generator ends after the request;
    - two reports for one brand run one refresh;
    - brand A's report completes while brand B's refresh is held, and a post-audit job (the generator) runs meanwhile;
    - a failing check prints its line, every tile prints and the PDF is started;
    - a run in flight finishes under the old step ids.
  - Helper `tests/helpers/report-generation.ts` runs the generator, then the function for each request, as Inngest does.
  - **RED on the parent:** unit 6 failed (2 hold today: the app id, every function served); integration 4 failed (the brand-A test hangs on the parent: B's held refresh blocks the generator) and 1 holds (the in-flight path is the parent's behaviour).
- **Existing tests changed** (amendment 49: "S01B moves it into its own function, one per brand and at most 2 account-wide"):
  - `tests/integration/enhanced-refresh.integration.test.tsx`: its helper runs both functions; the expected step list is now "{function}: {step}"; the "never refreshes" check matches the new names;
  - `tests/integration/report-tiers.integration.test.ts`: `runGenerator` uses the helper; no assertion changed;
  - the seams count (above).
- **Found:** that count guard splits the serve list on commas without stripping comments, so a comment with a comma counts as a function. My comment there has none.
- **Runs:**
  - related: 8 files, 61 passed;
  - 89 guard files plus the unit tests naming the changed paths: 96 files, 1,683 passed;
  - integration tests naming them: 13 files, 306 passed, 1 skipped;
  - tsc clean; Biome 0 new (the generator's `step: any` warning was there before); N14/N15 passed.
- **Playwright:** not needed (no UI change). **Inngest resync: yes.**
- **Risk for Sri:** the account is on Inngest's Hobby plan, which runs 5 steps at once account-wide. `run-audit` splits what's left after `POST_AUDIT_POOL`'s 1 slot among its engines. A refresh is one step lasting up to 5 minutes, outside the pool. So two refreshes while an audit runs take 2 of the 5 slots, and Inngest queues (doesn't fail) the audit's engine calls meanwhile. I built the 2 the amendment asks for. If audits slow down while Enhanced reports run, set it to 1, or tie it to `ACCOUNT_CONCURRENCY_HEADROOM_SLOTS`.

## Part 2. Technical audits that belong to no audit (amendment 49) — `e6ce803f`

Every reader of `technical_audits`: the score-surfaces guard's `READERS`, plus a grep of `app`, `components`, `lib`, `inngest`, `db` and `scripts`. None uses `audit_id`; each reads the brand's latest row(s) by `created_at`.

| Reader | file:line | What it shows | With `audit_id` null |
|---|---|---|---|
| Technical Audit page | `app/(auth)/brands/[brandId]/technical-audit/page.tsx:121` | latest 2 rows: composite and checks (`technicalScoringOf`), "Crawled {date}", "vs {date}" / "Scoring updated" | the refresh row is the latest check, dated; "vs" compares it with the row before; no audit number or link. Fine |
| Check pages: AI Discovery `:105`, llms.txt `:223`, Brand & Entity `:75`, robots.txt `:46`, schema `:103`, meta tags `:114`, signals `:46`, answer capsules `:60`, SSR `:43` | `app/(auth)/brands/[brandId]/{page}/page.tsx` | the latest row's score and findings; "on this audit" means the technical audit run | fine (a refresh row is a technical audit run) |
| Health Check | `app/api/brands/[brandId]/site-readiness/route.ts:65` | latest composite, `checkedAt` | fine (tested) |
| Raw row | `app/api/technical-audits/[id]/route.ts:18` | the row with its scoring; no UI caller | `auditId: null`, never invented. Fine (tested) |
| Entity score | `app/api/brands/[brandId]/entity-score/route.ts:79` | Wikipedia from the latest findings | fine |
| Agent readiness | `inngest/functions/score-agent-readiness.ts:205` | Wikipedia from the latest findings; triggered by `technical-audit/complete`, which a refresh doesn't send | fine |
| Beyond AI answers | `lib/reports/beyond-ai.ts:444` | the latest row at or before the report's time | fine (S01's own rows) |
| Writer | `lib/audit/run-technical-audit-inline.ts:84` | — | writes `auditId` null for a refresh |
| **Retention job** | `lib/retention/audit-retention.ts` | — | **Broken:** rows went only by cascade from their audit, so refresh rows were never deleted. **Fixed** (`:157`) |
| Brand deletion | `app/api/brands/[brandId]/route.ts:275` | a soft delete (`deleted_at`) | removes no row of either kind; both go with the retention job (tested) |
| Sample purge | `lib/sample-audit/retention.ts` | hard-deletes `__sample__` brands | sample brands get no technical audits (`run-audit-inline` only) and no reports, so no refresh rows. No change |
| Trends, exports, admin pages, emails, webhooks, agency dashboard, portal | — | — | none reads `technical_audits` (score-surfaces guard) |

- **Fix:** `deleteExpiredAudits` deletes `technical_audits` rows with no audit on the same 12-month cutoff, after the audits, in the same bounded batches. It reports `deletedUnlinkedTechnicalAudits`, and `more` counts these rows too.
- **Tests:** `tests/integration/technical-audit-refresh-rows.integration.test.ts` (3):
  - the readers with a refresh row present (holds on the parent);
  - retention deletes an old refresh row and keeps a new one;
  - after a brand deletion both kinds stay, then the retention job removes both together.
  - RED on the parent: 2 failed, 1 held.
- **Existing guard list changed:** `tests/unit/technical-audit/score-surfaces.test.ts` `READERS` gains the retention job.
- **Runs:** related 5 files, 29 passed; 89 guard files, 1,601 passed; integration naming the file (plus the sample clean-up), 4 files, 16 passed; tsc clean; Biome clean; N14/N15 passed. Playwright: not needed.

## Part 3. No live network from tests (amendment 50) — `6dda6f8f`

- **The guard** (`tests/helpers/no-network-guard.ts`, installed by `tests/no-network.setup.ts` in the unit and the integration project, `vitest.config.ts`):
  - **`net.Socket#connect`** (`:180`; `node:http`, `node:https`, `tls` and undici all end there): an IP address is judged as it is. A name with its own `lookup` is judged by the address that lookup returns, so S00B's pinning dispatcher still reaches its local server under a made-up name. Any other name must be `localhost`.
  - **DNS** (`:226`): `dns.lookup` and `dns.promises.lookup` refuse names that aren't local; every resolve and reverse query is refused (the module, `dns.promises` and both `Resolver` classes). ESM named imports see the patch (`syncBuiltinESMExports`).
  - **Node's global `fetch` dispatcher** (`:270`): an undici Agent that refuses before a socket is opened.
  - **What's allowed:** this machine (`localhost`, 127.0.0.0/8, `::1`) and the test database's host, read from the project's database URL.
  - **The error** names the host: "{host}: tests must not reach the network; record a fixture (…)". Each attempt is recorded and fails its test, even when the code under test swallows the error (as the no-database guard does).
- **Two traps found while building it:**
  - `net.connect` hands `Socket#connect` an already-normalised array;
  - `http` passes `path: null`, and only a non-empty path is a pipe.
  - `tests/helpers/no-database-guard.ts` now skips the network guard's frames when it names a caller, since both wrap the same `connect`.
- **Tests:**
  - `tests/unit/qa/no-network-guard.test.ts` (6). Fail fast, with the message: `fetch`, `http.get`, a raw TCP and a TLS connect, and DNS lookups in callback, promise and ESM form, plus `resolve4` and `Resolver#reverse`. Also: a swallowed refusal still fails the test; a local server stays reachable by address and by `localhost`; the pinning dispatcher still reaches its local server, while a lookup that returns an outside address is refused. Only `.invalid` names and 192.0.2.x addresses are used, so nothing reaches anyone even without the guard.
  - `tests/integration/no-network-guard.integration.test.ts` (2): the test database is reachable; an outbound fetch is refused.
  - S00B's fetcher tests (`tests/unit/fetch/`) still pass.
  - RED with the parent's `vitest.config.ts` (guard not installed): unit 5 failed, 1 held (local reachability); integration 1 failed, 1 held (database reachable).
- **The whole run with the guard on** (unit, then integration, `--maxWorkers=1`, 19 minutes):
  - unit: 630 files, 7,936 passed; nothing reached the network;
  - integration: 2,182 passed, 17 failed, 12 skipped. compare-failures by name: 17 new against an empty baseline.

| Test(s) that reached the network | What it tried | Fix |
|---|---|---|
| `answer-token-counts` (inline runner), `audit-engine-failure`, `citations-response-text`, `cost-honesty` (item 2), `google-surfaces-collect` (inline runner hands over), `google-surfaces-off-parity`, `out-of-quota-not-retried`, `provider-reported-cost` (inline runner), `scheduled-audit-follow-ups` (Inngest unreachable), `stop-reasons` (inline runner), `phase2/sprint4/invisible-brand-scoring` (both tests): 12 tests in 11 files | `en.wikipedia.org:443`: the inline audit runner's recommendation step (`lib/audit/run-audit-inline.ts:651` → `gatherRecommendationEvidence` → `checkWikipediaAuStatus`, `lib/brand-entity/wikipedia-au.ts:57`) searched Wikipedia for the fixture business. Each test passed anyway: a failed search is "unavailable" | each file mocks `@/lib/brand-entity/wikipedia-au` with `recordedWikipedia` (`tests/helpers/recorded-network.ts`): MediaWiki's answer for an invented name, no article, as `audit-inline-confidence-basis` already did |
| `cancelled-plan-gates`: the four "cdn-join / coverage isn't refused" tests | DNS for the fixture brand's made-up `gates-….example.com.au` through the guarded fetcher (`lib/fetch/transport.ts`): `agent-analytics/cdn-join` → `fetchRobotsTxt`, `coverage` → `crawlSite` (`lib/crawler`) | mocks `@/lib/fetch/guarded-fetch` with `recordedEmptySite`: a site with nothing on it (404) |

- After the fixes the 12 files pass: 287 tests, no network.
- **Not this sprint:** `tests/phase2/sprint1/e2e-rls-fk-services` "audit_cost_audit_id_idx is gone" fails on the test database's own state.
  - `visibleau_integration`, and dev `visibleau`, still have that index, which migration 0092 drops; `visibleau_e2e` doesn't.
  - The test only reads `pg_indexes`, and no S01B commit touches `db/`.
  - I didn't rebuild the database. Proposal: rebuild `visibleau_integration` from scratch (`pnpm db:setup:integration` on a dropped database) and see whether a fresh build keeps the index.
- **Runs after the fixes:** the 12 files, 287 passed; the two hand-re-edited files and the integration guard test, 8 passed; the two guard tests in the unit project, 13 passed; the 90 guard files (Part 1's function-id test joined the set), 1,604 passed; tsc clean (Part 3's files). Biome: 0 new; two infos on lines I didn't touch. Biome `--write` reformatted two whole older test files, so I reverted it and re-applied only my lines. Playwright: out of scope.

## Part 4. PDF layout and consistency (amendments 51–53, 55; contract v1.4 P09) — `3cc65b05`

- **a. Fixtures** (`tests/helpers/report-seeds.ts`): three invented businesses, each seeded as real audits in `visibleau_integration`, named after what they render:
  - **Bluegum Home Services** (like Hero #54): Chatswood, 6 of 40; Yellow Pages 17, hipages 9, Airtasker 6, Localsearch 4; the Yellow Pages profile linked; ABN verified; an earlier audit for the trend; agency note, agency action, an item done since the last report, and one hidden action;
  - **Ironstone Property Services** (like Omega #55): Castle Hill, Claude out of credit for the whole audit, 5 of 30, seven directories with none linked, Reddit cited twice;
  - **Kurrajong IT Solutions** (like TechCore #52): Penrith, 0 of 40; other providers' sites cited in 27, 9 and 6 answers; Claude says it can't find the business; Local Business Guide not linked; an ABN on file that isn't verified.
  - **Invented data:** own domains are under `example.com.au`; the other providers are under the reserved `.test` domain; the ABNs fail the ATO checksum, so none can be a real entity's.
  - **The real path:** Action Center items come from the audit's own recommendation step (`buildRecommendations`, the g–j items, `persistRecommendations`), with only Wikipedia's answer recorded. Reports come from the real generator, Enhanced through `refresh-enhanced-checks`, rendered with `loadReportRenderData` → `buildReportPdf`.
  - **Retired:** S01's hand-composed render test `tests/unit/reports/report-v2-pdf.test.tsx`, which used real client names (TechCore IT, its ABR entity and ABN, a competitor's real domain). Amendment 51: "Report render tests and report images use invented businesses seeded as real audits … never hand-composed input." Every one of its 11 checks now runs on the seeds in `tests/integration/report-pdf-seeds.integration.test.tsx` (N15, N14, the next page's groups and hidden actions, the Over time list, the Beyond tiles, the method lines, numbering, TechCore's g–j, no upsell).
- **b.** `report-pdf-seeds` checks that every figure printed on more than one page is the same everywhere, in all three tiers of all three businesses: each directory's cited count (table, findings, actions, the Beyond tile), whether its profile is linked (the Beyond tile, "Not linked yet", the summary tile never "Not checked" while one is linked), Visibility (cover, summary, glossary), and each engine's figure.
- **c.** Each finding appears once (`lib/reports/pdf/report-document.tsx`):
  - `FindingCard` (`:1942`) carries its Action Center item's priority and status pills in place of the impact label, and "Note from {agency}: …" under the fix;
  - `NextSection` (`:2287`) then lists OTHER ACTIONS FROM THIS AUDIT: measured items not shown as a finding, so findings past the limit appear here. Then RECOMMENDED BY {AGENCY}, DONE SINCE THE LAST REPORT and GENERAL ADVICE, NOT DRAWN FROM THIS AUDIT, as before;
  - the match is `MeasuredActionSource.findingRule` (`lib/reports/report-contents.ts:133`, set at `lib/reports/what-to-do-next.ts:152`), falling back to the title for snapshots written before it.
  - **Design choice for Sri:** a finding whose action the agency hid keeps its card (it's a measured fact) without the action's pills or note. Bluegum's PDFs show this on the identity card, because its only other open items are findings' own.
- **d.** `shownFindings` (`lib/reports/report-findings.ts:430`; used by `reportContext`, `report-document.tsx:3005`):
  - at most 3 problem findings and 1 strength, in every tier: high impact before medium, then rule order;
  - with rules a–f alone that is exactly today's choice (a and b high; c, e, f medium in that order), so N15 holds;
  - the Action Center still gets every finding's item (`findingRecommendations` reads `reportFindings`), and the audit page is unchanged.
  - Kurrajong: g and h (high) and i are cards; j is under OTHER ACTIONS.
- **e.** Standard and Enhanced flow from "Why, and what to do next" onwards in one run of pages (`FlowingPages`, `:2961`): `NextSection`, `BeyondSection` (`:2457`), `TrendSection` (`:2764`), `MethodContent` (`:2795`).
  - A section starts after a zero-height marker with `minPresenceAhead` set to a third of the content area (`PAGE_THIRD`, `:2247`). react-pdf moves it to the next page only when less than that is left and what follows doesn't fit.
  - Group and section headings sit in one unbreakable block with their first item; cards and tile rows never split.
  - Basic keeps today's pages: `TrendAndNextPage` and `MethodPage` render the same blocks as before.
- **f.** `.au domain: yes` / `no` (`lib/reports/beyond-ai.ts:601`). `tests/helpers/pdf-fonts.ts` walks the document with each run's inherited font and checks every character with fontkit's `hasGlyphForCodePoint`, through react-pdf's own font store (`Font.getFont`; no new dependency). Before, the three Enhanced PDFs pulled in a fallback font (poppler: "Symbol"/"ArialUnicode"); after, they embed only Inter, Fraunces and JetBrains Mono. The Inter ✓ in "Done since" and Over time's ○ have glyphs, so they stay.
- **g.** The crawlers tile says "Visits: not measured" (`beyond-ai.ts:736`) and its action "Next step: Upload server logs" once. The audit page's card uses the same words.
- **Found and fixed: "Done since the last report" in Enhanced.** An Enhanced report's contents are built after its row is written, so `loadWhatToDoNext`'s "previous report" was the report itself and nothing counted as done. `buildReportV2` / `buildDecidedReportV2` take the report's id and `loadWhatToDoNext` excludes it (`what-to-do-next.ts:81`, `:121`); `writeEnhancedSnapshot` passes it. Origin: S01 Part 9's step order.
- **Tests:** `tests/integration/report-pdf-seeds.integration.test.tsx` (55; with `REPORT_PDF_OUT` set it also writes the PDFs and their page counts).
  - RED on the parent's lib code: 22 failed (c, d, e, f in Enhanced, g, the hidden action's group, TechCore's g–j, N15 for Kurrajong's renumbering); 33 hold (N15 and N14 in most cases, consistency, the glyph check in Basic and Standard, the method lines, no upsell).
  - GREEN: 55 of 55, and `enhanced-checks-function` still 5 of 5.
- **Existing tests changed:**
  - `tests/unit/reports/beyond-ai.test.ts`: the identity and crawler lines (amendment 55 quoted in the test);
  - `tests/integration/low-visibility-findings.integration.test.tsx`: "Your business identity isn't verified yet" is no longer a card in that Basic PDF. Amendment 52: "the rest appear only as actions and in the Action Center"; its Action Center item is checked in the same file;
  - `tests/integration/enhanced-checks-function` (Part 1's): its made-up ABN, which happened to pass the checksum.

### Page counts (physical PDF pages; the same seeds, before and after Part 4)

| Fixture | report_v2 off | Basic | Standard | Enhanced |
|---|---|---|---|---|
| Bluegum Home Services (Hero-like) | 7 → 7 | 7 → 7 | 8 → 7 | 9 → 7 |
| Ironstone Property Services (Omega-like) | 7 → 7 | 8 → 7 | 8 → 7 | 9 → 7 |
| Kurrajong IT Solutions (TechCore-like) | 7 → 7 | 7 → 7 | 8 → 7 | 9 → 7 |

- Ironstone's Basic was 8 before because its findings overflowed the Diagnosis page; the limit brings it back to today's 7.
- What to look at: the Standard and Enhanced pages 5–6 (cards with pills and the agency note, OTHER ACTIONS, the group headings, sections flowing), the identity and crawlers tiles, and the last page (Method).

### Part 4 runs

- related: 97 files, 1,064 passed;
- the 90 guard files plus the unit tests naming the changed files: 109 files, 1,797 passed;
- integration tests naming them: 11 files, 119 passed;
- tsc clean; Biome 0 diagnostics on every changed file.

### Part 4 Playwright

- `scripts/qa/e2e-specs-for.ts` maps one spec: `tests/e2e/12-s01-report-contents-panel.spec.ts`, because the outline's labels match the PDF's. Fresh server each run; ≥ 7 GB free at each start.
- **Run 1:** 4 passed, 1 failed. "report_v2 on: Generate opens the panel…" (`:83`) waits 5 s for `p08-panel`; the page showed the dialog's loading skeleton.
- **Alone:** that test passed.
- **Run 2:** 4 passed, the same test failed.
- **Parent's lib code:** 5 of 5.
- **Run 3:** 5 of 5.
- **Reading:** the panel's view request compiles its API route on a cold dev server, close to the test's 5 s. Part 4 adds nothing to that route's imports beyond a type. If it recurs, give that one expectation a longer timeout (a change to S01's test, for Sri to approve).
- Lowest free memory 5.46 GB. After every run: 0 repo node processes, port 3000 free.

## Part 5. Privacy wording for ABR lookups (amendment 54) — blocked, not done

**Where it would go:**
- `lib/legal/data-facts.ts`: the shared sentences, a new constant beside `SENT_WHEN_A_BUSINESS_IS_ADDED`. S01 looked for `data-facts.ts` at the `lib` root; it's in `lib/legal/`.
- The FAQ "Is my data safe?": `components/domain/landing/faq-section.tsx:104-124`, after `SENT_WHEN_A_BUSINESS_IS_ADDED`.
- The privacy page's "Third-party services": `app/(marketing)/privacy/page.tsx:72-90`, beside DataForSEO.
- The draft: `docs/privacy-policy-draft.md`'s processors table (`:55`) and retention table (`:68-78`).

**Why it's blocked:** the wording ends "and delete it when the brand is deleted". In the code:
- deleting a brand only sets `brands.deleted_at` (`app/api/brands/[brandId]/route.ts:275`);
- `brand_entity_scores` (ABN, entity name, status) is never deleted, by brand deletion or by the retention job;
- `brands.abn_suggestion` (ABN, name, state, postcode, status) stays on the deleted brand's row;
- only `technical_audits.findings.brandEntity` goes, with its audit, after 12 months.

**Also:** the technical audit's ABN lookup has sent ABNs to the ABR since before S01, and no public page says so today.

**Options for Sri:**
1. Wording true today, e.g. "To confirm your business, we look up your business name and ABN on the Australian Business Register (abr.business.gov.au), the government's public register. We keep what it returns (ABN, entity name, status, postcode and state) with your brand until you ask us to delete it." This can ship in a short follow-up.
2. Make brand deletion delete the ABR results (`brand_entity_scores` rows, `brands.abn_suggestion`, and `brands.abn` if wanted), then use amendment 54 as written. A behaviour change, and a small piece of work of its own.

Playwright for Part 5: not run (nothing changed).

## Commits

```
3cc65b05 feat(reports): S01B part 4 -- PDF layout and consistency
6dda6f8f test(network): S01B part 3 -- no live network from tests
e6ce803f fix(retention): S01B part 2 -- technical audits that belong to no audit
cea0dc4f feat(reports): S01B part 1 -- Enhanced checks in their own function
a939c61c docs: client-enhancements pack v1.12 (S01 as built, PDF review, sprint S01B)
```

`git log origin/main..main --oneline` holds these five, plus this report's commit. Nothing is pushed.

## Push notes

1. **Migration:** none.
2. **Inngest resync: yes.**
   - New function `refresh-enhanced-checks` (production lists one more function after the resync than it does now).
   - `generate-narrative-report` gains step `request-enhanced-checks`, and its `generate-and-insert` return gains `checksIn`.
   - **Push only when no report is generating** (no report row without a PDF or a failure). A run already in flight is still handled (Part 1), but keep the routine.
3. **Safe while an audit runs:** yes. Enhanced reports exist only with `report_v2` on (off in production). The retention change deletes only technical audits with no audit, which only Enhanced refreshes write, and none exist in production yet. The network guard is test-only.
4. **Flags unchanged:** `report_v2` and `abn_suggestion` off. With `report_v2` off the PDF is today's: Basic is drawn by today's page components, and N15 is tested on all three seeds.
5. **Privacy wording: not live.** Part 5 is blocked (above).
6. **Before switching `report_v2` on for Splice:**
   - Sri's review of `.qa/screens/S01B/pdf/`;
   - a decision on the Inngest concurrency risk (Part 1);
   - the S02 gate in the runbook (real Basic, Standard and Enhanced PDFs for Hero).

## Proposed changes to the documents (for Sri and Claude chat)

- **Amendment 54:** the deletion clause (Part 5).
- **Amendment 49 / LLD 8.1.7:** "at most 2 account-wide" competes with audits on the Hobby plan's 5 steps (Part 1); consider 1.
- **P09.next:** say that a finding whose action the agency hid keeps its card without the action's pills or note (Part 4c).
- **Amendment 52:** the findings limit applies to the PDF; the audit page's "from this audit" still lists every finding (unchanged).
- **Amendment 51, further:** other render tests still use the hand-composed `tests/helpers/report-data-fixture.ts` (the design, Google section, cover-tier and running-checks tests), and recorded responses with real client data remain: TechCore's ABR record in S01 Part 11's ABN tests, `ASTORIO GROUP PTY LTD` / `17701710947` in `tests/unit/reports/beyond-ai.test.ts`. Backlog: move them to invented records.
- **Backlog:**
  - `scripts/qa/inngest-serve-manifest.txt` and `sprint9-invariants.sh` A3 were already out of date before S01B: they list the retired `calculateShareOfVoiceFn`, miss three functions, and read comment words as names. `tests/unit/inngest/function-ids.test.ts` now covers N13.
  - The no-database guard has the same `path: null` gap as Part 3's guard had, for an `http`-style connect to a Postgres port. Harmless in practice.

## Memory and processes

- Start: 7.21 GB free, 0 node processes.
- The whole unit and integration run took 19 minutes at one worker, with no build or server running at the same time.
- Playwright: fresh server each run, ≥ 7 GB free at each start, lowest 5.46 GB after; afterwards 0 repo node processes and port 3000 free each time.
- A stray interactive `python` started by a bad command was stopped at once (TaskStop); no python process was left.
- End: 6.77 GB free, 0 node processes, port 3000 free.

## Tests skipped by the testing-scope rules

- Full suites: run once, for Part 3 only, as the sprint allows; not otherwise. No `next build`.
- Playwright: only the spec mapped to Part 4; none for Parts 1–3 (no UI change); none for Part 5 (not done).
