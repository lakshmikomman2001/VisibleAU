# Vunnara client enhancements: low-level design (LLD) v1.8

| | |
|---|---|
| Version | 1.8, 24 Nov 2026: S01 as built and live (amendments 43–55), the PDF review, and the S01B sprint. 1.7, 23 Nov 2026: decisions on S01 Parts 6–7 (amendments 37–42; contract v1.3). 1.6, 23 Nov 2026: decisions on S01 Parts 0–5 (amendments 30–36, backlog additions). 1.5, 23 Nov 2026: S00B as built and checked live (amendment 19 corrected, amendment 29, section 8.6.2 rewritten) and the backlog (0.3). 1.4, 22 Nov 2026: amendment 28 (the profile-link rule) and in-place corrections after S00's Playwright run (216 of 216 passed); the Playwright memory rules are in the runbook, section 5. 1.3, 22 Nov 2026: the 27 amendments from S00's as-is verification and Sri's six decisions, summarised in section 0 (read it first). 1.2 added report tiers Basic, Standard and Enhanced (R6, 8.1.7, P17–P18, D-RT1–D-RT4). 1.1 added the UI contract `vunnara-ui-config.ts`, prototype v2, conflicts C-01–C-22 and decision D-UI1 |
| Owner | Sri |
| Repo location | `docs/lld/vunnara-client-enhancements-lld-v1.md` (commit it there with the prototype files in `docs/prototypes/`, listed in the next rows) |
| Builds on | `main` at `15f287b` (20 Nov 2026) or later |
| Inputs | Client document "Improvements suggested by the client" (21 Nov 2026), design doc "Vunnara client improvements: design and approach" (`docs/lld/design/Vunnara-client-improvements-design.pdf`), design doc "Vunnara question intelligence: layer-by-layer design" (v3, reach added; `docs/lld/design/Vunnara-question-intelligence-design-v3.pdf`), TechCore IT audit #52 and its PDF, Claude Code reports up to 20 Nov 2026 |
| How sprints run | `docs/lld/CLAUDE-CODE-RUNBOOK.md`: read order before each sprint, pre-flight, rules, stop points, kickoff messages. Sprint prompts in `docs/sprints/`, reports in `docs/sprints/reports/` |
| UI contract (canonical) | `docs/prototypes/vunnara-ui-config.ts`: tokens, components with every state, and for each screen P00–P16 its nodes, exact copy, states, interactions, accessibility, responsive rules and acceptance checks. How to use it: `docs/prototypes/PROTOTYPE-GUIDE.md` |
| Prototype | `docs/prototypes/client-enhancements-v2.html` (rendered from the contract; desktop and mobile frames, states, inspect mode) and `docs/prototypes/screens/*.png` (static references). Screen ids P00–P16 are referenced throughout |
| Sprint prompts | `sprints/S00`–`S10` |

**Ids.** Client requests are C1–C5, Sri's additions R1–R6, TechCore IT gaps T1–T8; sprints are S0–S10 (files S00–S10). All figures in the prototype are illustrative layout examples, not measurements.

**How to read this.** Sections 1–4 explain what is being built and why, and the rules that protect what already works. Sections 5–17 are the build specification. Section 18 is the sprint plan. Anything marked **VERIFY** is a statement about the current code taken from Claude Code's reports; sprint S0 confirms each one before any code changes and records differences in `docs/lld/as-is-verification.md`. Where the code differs, the code wins and this LLD is amended, never silently ignored.

---


## 0. What changed after S00, S00B and S01 (v1.8, read first)

S00 checked every VERIFY statement against the code (`docs/lld/as-is-verification.md`, with file:line evidence) and mapped the UI contract onto the app (`docs/prototypes/token-map.md`). Sri decided the open points on 22 Nov 2026. Where this section and older text below differ, this section wins; the most load-bearing passages below are also corrected in place.

### 0.1 Sri's decisions (22 Nov 2026)

| Id | Decision |
|---|---|
| D-RT1 (revised) | Reports stay **Growth and up**, as today. Free and Starter have no reports. Growth: Basic and Standard. Agency, Agency Pro, Enterprise: all three, chosen per report. The Starter pricing card's false "Email reports" claim is removed in S01's first commit |
| D-SEC1 | A small security sprint **S00B** runs before S01: the guarded fetcher (8.6.2) is built and every existing place that fetches a customer website moves onto it (about eight, plus S00's name suggestion and `app/api/crawl`). Network protections apply to every caller; robots.txt obedience, user agent and rate limits stay as each caller has them today unless that caller is new. **Done in S00B (23 Nov 2026):** all 12 fetch sites moved (amendments 19 and 29) |
| D-QI-BR | A question set may hold up to **5** questions that name the business (today's packs carry 3 to 5). Every "3" for branded questions becomes 5 |
| D-BAND | The score band colour follows the figure shown (the rounded value), so "10%" is never coloured Low. Visual only; stored scores unchanged (S01 carry-over) |
| D-GT | From S05, reference tables the app must only read get a named read-only list: prod-fix 0052's grants, the drift check and `app-role-grants.integration.test.ts` allow it. `directory_registry` joins that list in S05; until then it keeps the app's DML grants |
| D-UI2 | Web fonts: none loaded today (Inter is named only). Not changed in these sprints; a separate task later |
| D-UI3 | Line heights: new components use the contract's values; existing screens keep theirs |
| D-UI4 | No toast library is mounted: wherever the contract says "toast", show the same copy as inline `role="status"` feedback (`components/shared/save-feedback.tsx` pattern) |
| D-UI5 | Upgrade links on locked features go to `/pricing` (23 existing uses) |
| D-UI6 | EngineDots gets a fourth state, "unverified" (the audit page's "Maybe": mentioned but not confirmed as the business) |

### 0.2 Amendments from S00's as-is verification

| # | Area (section) | Correct statement |
|---|---|---|
| 1 | Flags (17, 7A) | The store is `feature_settings` (global; CHECK widened by 0153), `org_feature_flags` (workspace, FORCE RLS) and `feature_setting_changes`. Read through `lib/flags/flags.ts` `isEnabled(flag, orgId)`; operator card on `/admin/settings` |
| 2 | Directory registry (7.7, 8.8.3) | Built in 0153 as `directory_registry(domain_pattern pk, directory_key, name, kind, market, applies_to trades/local/cited, profile_url_hint, active, sort_order)`, 35 rows / 30 directories; read through `lib/directories/registry.ts` (seed kept identical in code for the browser and unit tests) |
| 3 | Branded typing (5, 7A step 4) | One rule: `isBrandedPrompt(text, {name, domain})` in `lib/audit/flag-branded-prompts.ts` (aliases added in S00). `isBrandedPackPrompt` no longer exists |
| 4 | Categories (5, appendix A) | `CATEGORY_KEYS` has 28 keys; none for IT services |
| 5 | Aliases (8.8.2) | Detection already ignores case and spacing and checks the domain stem, so aliases matter only for genuinely different names. S01 carry-over: stop suggesting the name without spaces or the domain stem; aliases unique ignoring case; `brands.name_suggestion` (added in 0153) capped at 120 characters |
| 6 | Brand record (5) | `prompt_pack` is jsonb (string array); `vertical` and `region` are enums |
| 7 | Packs (N1, 5) | 10 everyday questions plus 3 to 5 that name the business |
| 8 | `{region}` (5) | From `resolveRegionLabel()` (`lib/brands/region-label.ts`): suburb → city → `primary_regions[0]` → region → "Australia" |
| 9 | Paths (5) | Runner `inngest/functions/run-audit.ts`; `brandReadyForAudit` in `lib/brands/needs-confirmation.ts`; `validateGeneratedQuestion` in `lib/prompts/validate-question.ts`; `lib/pricing/tiers.ts`; `db/open-workspace.ts`; `lib/scoring/dimension-labels.ts`; `lib/governance/google-surfaces.ts` |
| 10 | Mentions (5) | Shared function `answerMention()` (`lib/audit/answer-mention.ts`) |
| 11 | Findings (8.1.5, N15) | Existing rules are a–f (f: Reddit cited in 2+ everyday answers). The new rules are **g–j** (corrected in 8.1.5) |
| 12 | Audit-complete event (8.6.1, S9) | `audit.complete`; 14 listeners share `POST_AUDIT_POOL` (account-wide, limit 1). A new listener joins it and needs a resync |
| 13 | Report branding (7.5, 8.1.7) | `agency_brand_assets`: one workspace row (`brand_id IS NULL`, newest wins if duplicated) plus optional per-brand rows; `/settings/report-branding`; Agency plans, owners and admins. `report_tier_names` goes on the workspace row |
| 14 | Scheduled reports (8.1.7) | `report_delivery_schedules` (Agency) exist; every `audit.complete` can trigger a report through `generate-narrative-report` when a schedule is active, but the generator never reads the schedule row. S01 adds `report_tier` to it and makes the generator read it (capped at the plan) |
| 15 | Report plans (8.1.7) | Reports are Growth and up (`lib/pricing/brand-features.ts`); see D-RT1 (revised) |
| 16 | Generate route (8.1.3, 8.1.7) | `POST /api/brands/:id/reports/generate` takes `{ periodLabel?, periodType }`; the server picks the basis audit (`selectReportBasis`). S01 adds `tier` and `contents`, keeps the server's basis choice, and makes render and "Try again" use the saved snapshot for new reports (old reports keep rebuilding from live data) |
| 17 | Done since last report (8.1.3) | `action_items` has no status history: use `done_at` |
| 18 | Engine location (8.4) | `userLocation` lives in `lib/llm/openai-impl.ts` and `anthropic-impl.ts`; Gemini and Perplexity take none; country "AU" is sent only for a confirmed city |
| 19 | One fetch path (8.6.2) | Twelve server-side fetches of customer-supplied URLs, in 8 files, had no address check: the crawler's pages, robots.txt, sitemap and `fetchRobotsTxt`; the CDN Shield probe; llms.txt and llms-full.txt; the five AI files; MCP; the agency logo; webhook delivery and the webhook test. None can be started by an anonymous visitor. All twelve moved onto `lib/fetch/guarded-fetch.ts` in S00B (`docs/lld/fetch-inventory.md` lists each with its options and commit). Webhook endpoints on a port other than 80 or 443 stop receiving. `tests/unit/fetch/no-unguarded-fetch.test.ts` fails on any new unguarded fetch; a new fixed-host client needs an entry there (file, host, reason, exact call count). `POST /api/crawl` (signed in, `run_audit`, any domain, no limit) gets a per-user limit in S01 Part 0 |
| 20 | Directory links (8.6.4, 8.1.4) | `brand_directory_listings` (one row per brand and directory; status listed / not_listed / unsure; `profile_url`), edited on the brand overview page via `PUT /api/brands/:id/directory-listings`; audit label "Your profile: Not linked yet" / "{n} cited" |
| 21 | Question limits (7.6, 8.3.5) | `max_prompts_per_audit` is never read; `PROMPTS_PER_AUDIT = 10` on every plan. Per-plan question limits are new work in S03 |
| 22 | Report templates (8.1) | Only five optional-section flags take effect (`competitors`, `diagnosis`, `trend`, `recommended_next`, `method`); `tone` is ignored |
| 23 | Global table grants (7, runbook) | Every table is read-write for `visibleau_app` today (prod-fix 0052, drift check). See D-GT |
| 24 | RLS template (7) | Policies use `current_setting('app.current_org_id', true)::uuid`; newer migrations use 0145's loop |
| 25 | ABN (8.1.4, 8.8.6) | `brands.abn` exists but the wizard and `PATCH /api/brands/:id` can't set it. S01 adds an ABN field to brand settings (11 digits, ABN checksum) and PATCH support; the ABN suggestion writes the same column. The live entity check is `lib/brand-entity/abn-lookup.ts` (GUID); `lib/trust/entity-checker.ts` makes a second ABR call without a GUID: S01 uses the first only |
| 26 | Beyond AI answers (8.1.4) | Crawler visits come from uploaded logs and the visit beacon (CDN Shield writes none): say "upload server logs". YouTube's "videos cited by AI" has no source: removed. Business identity has one entity name: no "trading as". YouTube checks are gated off in code and need `YOUTUBE_API_KEY`; ABN needs `ABN_LOOKUP_GUID` set and `ABN_LOOKUP_BYPASS` unset in production |
| 27 | Reports list (P17) | No report-type column today; the list learns a PDF is ready by polling every 4 s for up to 12 minutes; statuses generating, ready, published (emailed), failed |
| 28 | Profile-link rule (7.7, 8.6.4) | The table doesn't store a pattern. `loadDirectoryRegistry()` (`lib/directories/registry-store.ts`) reads the rows and caches them per server process for 5 minutes; `profileUrlPatternFor()` (`lib/directories/registry.ts`) builds each directory's `profileUrlPattern` from its `directory_key` and `domain_pattern`: hipages `/connect/{slug}` (fixed in code by key), Google Business Profile any path on its domains, every other directory its first domain plus a non-empty path under the row's path prefix (for example `/company` for LinkedIn). `profile_url_hint` is description only. The same pattern drives the PUT route's check, own-profile suggestions and citation counts. A row change takes up to 5 minutes to apply. No test yet shows a row change moving the rule: S07 adds one |
| 29 | Guarded fetcher as built (8.6.2) | The exchange is Node's `fetch` (`redirect: 'manual'`) with an undici 7 dispatcher whose connect lookup is the guard's (direct dependency `undici` 7.27.2, the version cheerio already installed); IP literals are checked before every hop. Hard caps for every caller: 60 s and 50 MB. Existing callers keep their own user agent, timeout, redirect handling, size limit and `http:` handling (`allowHttp`); robots.txt (`obeyRobots`) and per-host pace are off for them. Refusal codes add `blocked_credentials` and `blocked_by_robots`. `lib/fetch` reads no environment variable and has no switch that turns it off (guard test). The LLD's earlier 10 s / 2 MB / 3 redirects / HTML-only figures are the S06+ analysis preset, not limits on existing callers |
| 30 | Plan refusals (11, 8.1.7, 8.3.5, all sprints) | Two kinds. **A feature the plan doesn't include** (reports below Growth, curation and agency actions below Agency, report names below Agency, and the like) answers with the app's existing plan refusal: **403 `plan_required`** through `tierRefusal` (`lib/governance/access-control.ts`), which the client recognises (`isPlanRefusal`, `lib/pricing/plan-refusal.ts`) and shows as its plan lock. **Over a limit inside a feature the plan has** (a report tier above the plan, more questions, reaches or custom types than included) answers **402 with a specific code** (`report_tier_not_in_plan`, the appendix E limit messages), handled inline by the component (P08.overLimit, P03, P05). Where older text says "402 for plan" about a whole feature, read 403 `plan_required` |
| 31 | YouTube (8.1.4, S01 Part 1) | The code gate `TRUST_CHECK_IMPLEMENTED.youtubePresence` is already on (`lib/trust/stub-implementation-status.ts`); production lookups need only `YOUTUBE_API_KEY` (without it a row stores `unavailable` / `missing_api_key`). The org flag key `youtube_audit_enabled` is defined but never read (backlog). Plan: Growth and up; monthly cron |
| 32 | Finding rules g and h (8.1.5, appendix C1) | Rule g ("others named instead") is measured by citations of other businesses' own sites only: naming a business without a citation would need a model to read names, which the evidence rules exclude. Appendix C1's phrase list belongs to rule **h** (heading corrected) |
| 33 | "What to do next" (8.1.3, appendix D) | Measured actions are the basis audit's findings (the audit page's "from this audit"), each joined to its Action Center item when there is one (status; the agency's choice is saved against it), then the other measured items. Items for findings g–j exist only for audits run with `report_v2` on, so findings carry older audits such as TechCore #52. A finding with no item (`actionItemId` null) is always included |
| 34 | Aliases and the name suggestion (8.8.2, P01.aliases, C-27) | Built in S01 Part 0: aliases unique ignoring case (a list saved before S01 stays as it is); the name-suggestion route returns `aliases: []` (field kept); `brands.name_suggestion` cut to 120 characters on write (S00 refused the whole brand over 100) |
| 35 | Wizard: the site's name (S00 part 4, fixed in S01 Part 0) | When the name-suggestion route returns a name and the name field holds a different one, the wizard offers it; a typed name is replaced only by the click. Copy: `Your website calls the business “{name}”.` with the link-button `Use “{name}”`; inside the run-together notice: `… Use “{name}” · Keep “{typed}”` |
| 36 | Directories cited (7.7, 8.6.4) | The audit page's "Directories AI cited", the PDF's "Where AI looks", findings, the Action Center's directory advice and own-profile suggestions use only enabled directories of the brand's market (`getDirectoryCitationsForAudit`). The Google Search AI section's "Directories cited" (`lib/audit/google-surfaces/summary.ts` → `findDirectoryForSource`) and recommendation titles (`directoriesNamedIn`) search every market, inactive rows included, as they did before S00: a `yelp.com` link shows "Yelp" there. Unchanged in S01 (backlog) |
| 37 | Basic report's findings page (8.1.2, P09; contract v1.3) | A Basic report keeps today's Diagnosis page **and its heading** ("Why AI isn't recommending you more, and what's working"), with findings a–j, as N15 requires. "Why your score is what it is" is only P08's outline label and the tier description for that page |
| 38 | Summary page pointer (8.1.2) | The Summary page's narrative points to the findings by section number; in Standard and Enhanced that section is "Why, and what to do next" (built in S01 Part 7) |
| 39 | Identity tile (8.1.4, P07.beyond.identity) | Built to the contract: status, entity name and check date (the ABN shows only when it couldn't be checked). The LLD's ABN number and link to the public ABR record are not shown (backlog) |
| 40 | General advice in reports (8.1.3, 8.8.5) | Today's PDF has no general-advice list, so a Basic report has none; evidence-backed general advice appears only in "What to do next" (Standard and Enhanced) and on the audit page |
| 41 | Report snapshot (8.1.7, appendix D) | `contents_snapshot` also stores the render input (`reportData`), so a re-render or "Try again" prints the same figures, items, notes and check dates. It may hold only what the PDF prints: no operator-only costs, provider names beyond what the report shows, or internal ids beyond appendix D's |
| 42 | Tailwind v4 breakpoints (UI) | Arbitrary `min-[…]` variants are emitted before the named ones (`sm:`, `md:`, `lg:`), so mixing the two on one property gives the wrong layout (S01 Part 6: two columns at 1240). Use one kind per property; for the contract's breakpoints use `min-[641px]`, `min-[901px]`, `min-[1100px]` throughout |
| 43 | Reports list (P17), as built | The report type is a neutral pill inside the existing Report cell; the page keeps its columns (Report, Period, Status, Actions) and has no pagination, as today. The download link is named "Download {name} PDF for {period}" |
| 44 | Report names (P18) below Agency | The whole Report branding page is already the existing plan-locked page (`white_label_reports`), so the card's own locked state never shows; `PUT /api/report-branding` answers 403 `plan_required` for names below Agency |
| 45 | Cover name (P09.cover) | On the navy cover the report name prints in amber #FCD34D (the evidence block's amber, well over 4.5:1), JetBrains Mono 500 (the registered weights are 400 and 500) |
| 46 | Portal reports (P13) | Download links are signed for 10 minutes when the portal page loads (no new route, so no new `serviceDb` read); afterwards each row says "This download link has expired." with Try again (reloads) |
| 47 | Choosing a report's tier (8.1.7) | Without a tier in the request: the brand's saved default when the plan includes it, else the plan's highest. A schedule whose tier the plan no longer includes is capped at the plan, with the operator log line `report_tier_capped` |
| 48 | Snapshot contents (appendix D) | `contents_snapshot.reportData` is the render input, without the workspace id, the brand id or the trend's other audit ids; rendering restores those from the report's own row. No operator-only cost ever enters it (tested) |
| 49 | Enhanced checks (8.1.7, D-RT4) | S01 runs the refresh as a step of `generate-narrative-report`, inside `POST_AUDIT_POOL` (account-wide limit 1), which can delay every post-audit job by up to 5 minutes: **S01B moves it into its own function, one per brand and at most 2 account-wide**. AI crawler access is refreshed by re-running the brand's technical audit (the only writer of robots findings), so the technical score refreshes with it; those rows have no `audit_id`, and every reader of `technical_audits` must handle that (S01B Part 2). Refreshes are recorded as the operator log line `enhanced_check_refreshed` and in the snapshot's `refreshed`; ABR and robots.txt are free and YouTube uses quota, so there is no cost line (backlog) |
| 50 | Tests and the network (15) | No unit or integration test may reach the network: the test setups refuse every connection except localhost and the test database (S01B Part 3). S01 Part 9 once crawled a made-up domain and searched Wikipedia from a test |
| 51 | PDF fixtures and consistency (15, P09) | Report render tests and report images use invented businesses seeded as real audits in the integration database and rendered through the real path (`buildReportData` → `buildReportV2` → snapshot → render), never hand-composed input. A test checks that every figure printed on more than one page (each directory's cited count and linked status, Visibility, each engine's figure) is identical everywhere |
| 52 | PDF layout (8.1.2, P09; contract v1.4) | **Each finding appears once:** in Standard and Enhanced its card carries its Action Center item's priority and status pills and the agency's note; the next group, OTHER ACTIONS FROM THIS AUDIT, lists only measured items not shown as a finding. **Today's findings limit stays in every tier:** at most 3 problem findings and 1 strength, by impact; the rest appear only as actions and in the Action Center. **Pages flow** in Standard and Enhanced from "Why, and what to do next" onwards: a section starts on the current page when at least a third of it is left; headings stay with their first item; cards never split. Basic keeps today's page breaks |
| 53 | N15 (4) | A Basic report on an Agency plan also gains the cover's report name line (D-RT3); N15's allowed differences include it |
| 54 | ABR name lookups and privacy (12) | The public FAQ, the privacy page or draft and any data-facts list say, where they list the other services data goes to: "To confirm your business, we look up your business name and ABN on the Australian Business Register (abr.business.gov.au), the government's public register. We keep what it returns (ABN, entity name, status, postcode and state) with your brand, and delete it when the brand is deleted." (Sri may edit this wording before S01B starts) |
| 55 | Small copy (P07, P08, P09) | Mono text uses words, never symbols the PDF font lacks: ".au domain: yes" / "no". The crawlers tile says "Visits: not measured" once, with the single "Next step: Upload server logs". P08's checks list adds "Not checked yet · will run again (about {duration})" (a check that never ran) and "Not checked · shown as not checked" (YouTube with its code gate off) |

S00 also proposed (and this version adopts): the contract typecheck command `npx tsc --noEmit --strict --target es2022 --lib es2022 --module esnext --moduleResolution bundler --skipLibCheck docs/prototypes/vunnara-ui-config.ts`; the sprint prompts and reports live in `docs/Sprints/` (capital S, as git tracks it); S11 compares lint with the pre-S00 baseline (339 errors in the whole repo).

S00's Playwright run (22 Nov 2026): all 15 specs, 216 of 216 tests passed against the local e2e database with 0153 applied; the directory table was read without errors in every run. Its memory measurements (one run with its `next dev` server peaks at 3.5–6.7 GB) set the Playwright memory rules in the runbook, section 5.

S00B (23 Nov 2026): 12 of 12 fetch sites migrated; every migrated caller's output on recorded public sites is byte for byte what it was before; each refusal is proven against a local stand-in for an internal address; no migration, flag or Inngest change. Pushed 23 Nov 2026 (`f1d9ffdb`): production had no webhook endpoints, `RATE_LIMIT_IP_SALT` is set in Vercel (Production), and the name suggestion for herohomeservices.com.au, omegaservices.com.au and techcoreit.com.au returned identical results before and after the push. It also found that S00 left one source-scan guard failing (`no-silent-fetch-fallback`, the wizard's name-suggestion request): fixed in S01 Part 0, and the runbook now has every guard file run in every part.

S01 Parts 0–5 (23 Nov 2026): carry-overs, Beyond-AI sources, migration 0154 (written and tested locally, not applied), findings g–j, evidence-backed general advice, "What to do next" and the contents panel (P08, 7 of 10 nodes). Stopped at a clean boundary before Part 6 because the session's context was full; resumed with the v1.10 update step. Decisions: amendments 30–36.

S01 Parts 6–7 (23 Nov 2026): the Part 0 copy follow-up, "Beyond AI answers" (audit page card behind `report_v2`), the PDF pages for Standard and Enhanced and the report snapshot. Stopped at the planned point after Part 7; resumed from Part 8 with the v1.11 update step. Outstanding before `report_v2` is switched on: `responsive-shell` (8 shards) and a re-run of `13-s01-beyond-ai`, scheduled at the start of the Part 8 session. Decisions: amendments 37–42.

S01 Parts 8–12 and the push (24 Nov 2026): report tiers enforced, Enhanced checks, report names and the cover line, the ABN field and suggestion, portal reports. Playwright 196 of 196 (plus every spec run per part); migration 0154 applied in production (all run3 checks as expected: 12 existing reports, all Basic); pushed as `bb5248d5`; Inngest resynced (49 functions); live checks passed with every flag off. Sri's PDF review found layout and consistency problems, and Claude (chat)'s report review found three hardening items: **S01B** fixes them before `report_v2` is switched on, even for Splice. Decisions: amendments 43–55.

### 0.3 Backlog (found, not scheduled; Sri schedules)

| Item | Found in | Note |
|---|---|---|
| Brand domain shape | S00B inventory | `POST` and `PATCH /api/brands` accept any text up to 253 characters as the domain, cleaned of scheme and slashes only (an IP address is accepted). Harmless for fetching since S00B (refused), but junk can be stored. Validate on create and whenever the domain changes, with the name suggestion's host rule (`suggestionHost`, `lib/brands/name-suggestion.ts`); existing brands untouched |
| Removing `POST /api/crawl` | S00B inventory; S01 Part 0 | S01 found **no caller** in app code, scripts or e2e specs (only S00B's parity test). Recommended: remove the route and its parity test. Until then it works for signed-in members with `run_audit`, 10 crawls per user per hour, through the guarded fetcher |
| Inactive directories in two places | S01 Part 0 (amendment 36) | Recommended: the Google Search AI section and recommendation titles use the same filter as the audit page (enabled directories of the brand's market), so the same audit never names a directory in one place and not another; a `yelp.com` link then counts as an ordinary cited site |
| `youtube_audit_enabled` | S01 Part 1 | Org flag key defined in `lib/governance/feature-flags.ts`, never read: remove it, or wire it if Sri wants a per-workspace YouTube switch |
| Robots-only check store | S01 Part 9 (amendment 49) | A light robots.txt result store so a 7-day crawler-access refresh needn't re-run the whole technical audit |
| Refresh costs on `/admin/costs` | S01 Part 9 (amendment 49) | Enhanced refreshes are visible only as operator log lines; add a line (count, and YouTube quota) to the operator costs page |
| ABN on the identity tile | S01 Part 6 (amendment 39) | Show the ABN and a link to its public ABR record on the identity tile (audit page, PDF, portal), as LLD 8.1.4 first intended: a contract change plus a small UI change |
| Second ABR call | S00, S01 Part 1 | `lib/trust/entity-checker.ts` (`refresh-entity-score`) calls the ABR without a GUID; consolidate onto `lib/brand-entity/abn-lookup.ts` |

## 1. Scope and traceability

### 1.1 What the client asked for (21 Nov 2026 demo)

| Id | Client request (their words, condensed) |
|---|---|
| C1 | Each improvement in the report: what the business should do next to improve its score, so the agency can show its clients |
| C2a | Smarter questions: analyse the brand's website for the services it provides, and look on the internet for what the brand provides, then build the questions |
| C2b | Agencies can add their own questions alongside AI-generated ones, choose which questions and how many the AI engines use; questions are always brand-specific; charge more for more questions (Sri) |
| C3 | More specific business types when adding a brand, with intelligence that learns and detects types more accurately over time |
| C4 | Add own questions on the confirm screen, plus a separate settings page (by plan) to add, edit and delete questions, set how many and which are used |
| C5 | More specific business types, and let customers (agencies, Growth etc.) add their own business type |

### 1.2 What Sri added after the demo (ids R1–R6)

| Id | Requirement |
|---|---|
| R1 | Visibility reach: Local (e.g. Sydney), State (NSW), Country (Australia), Global; questions generated, organised and scored by reach |
| R2 | Local is always the default, exactly as today |
| R3 | YouTube presence, AI crawlers and ABN lookup information must appear in the PDF report |
| R4 | Nothing existing may break; highly scalable, performant, customer-friendly, industry-standard |
| R5 | Decisions 7–9 of the question intelligence design: no Google AI check for Global; reaches per plan Starter 1, Growth 2, Agency and up 4; headline combines all chosen reaches and names them |
| R6 | Reports in three tiers: **Basic** (today's report), **Standard** (Basic plus what to do to improve the score) and **Enhanced** (Standard plus ABN lookup, YouTube presence, AI crawlers and other checks beyond AI answers). Agencies can generate all three and sell them to their clients at their own prices |

### 1.3 Gaps found in the TechCore IT audit (#52, 20 Nov 2026)

| Id | Gap |
|---|---|
| T1 | No IT or professional-services business type, so a managed IT provider was saved as "SaaS" while the header says "Local business" |
| T2 | Brand name taken from the domain ("techcoreit"), not the trading name ("TechCore IT") |
| T3 | Question grammar: "managed it services" (lower-case IT), "a good choice for a managed it services" |
| T4 | All questions pinned to one suburb although the business works remotely across Australia |
| T5 | A 0% audit produced no recommended actions, and the PDF's Diagnosis page said "No finding rule matched this audit" |
| T6 | The directory list only knows trades directories; Local Business Guide, Directso, Whereis, LinkedIn, Nextdoor, Birdeye and Cylex were cited but not shown |
| T7 | General advice not backed by evidence (Medium); LinkedIn is backed for IT businesses but isn't treated as evidence |
| T8 | ABN not entered, so the entity check couldn't run, although the ABR has a matching record (Astorio Group Pty Ltd, trading as TechCore IT, 2765) |

### 1.4 Traceability matrix

| Requirement | Feature (section) | Sprint | Acceptance proof |
|---|---|---|---|
| C1 | Report "What to do next" and report contents panel (8.1) | S1 | PDF for Hero and Omega shows curated actions with evidence lines; snapshot unchanged after Action Center edits |
| R3 | Report "Beyond AI answers" page (8.1.4) | S1 | Enhanced PDF shows ABN, YouTube, AI crawler access and visits, website technical score and directory profiles, each with its own check date or "Not checked" |
| R6 | Report tiers Basic, Standard, Enhanced (8.1.7) | S1 | Free and Starter have no reports, as today (D-RT1 revised); Growth Basic or Standard (402 for Enhanced); Agency and up pick any tier per report and rename the tiers; a Basic PDF equals today's report apart from the listed corrections (N15); an Enhanced report re-runs stale checks first |
| C2b, C4 | Question library, sets, versions (8.2); agency questions, confirm-screen questions step, Questions settings page, plan limits (8.3) | S2, S3 | Agency adds a question on the confirm screen or the Questions tab, applies, next audit uses it; trend restarts with notice; question mix disclosed |
| C2a | Question intelligence layers 1–7 (8.6) | S6–S9 | Evaluation set: question fit ≥ 90%, services found ≥ 90% |
| C3, C5, T1 | Business taxonomy, search picker, custom types, learning (8.5) | S5 | A managed IT provider is offered "Managed IT services provider"; Growth workspace creates a custom type |
| R1, R2, R5, T4 | Visibility reach (8.4) | S4 | Existing brands unchanged; a brand with Local + State + Country gets per-reach figures |
| C2b (pricing) | Question packs and entitlements (8.7) | S10 | Stripe add-on quantity limits active questions server-side |
| T2, T3, T5, T6, T7, T8 | Quick fixes (8.8) | S0, S1 | Guard tests per item |
| R4 | Non-regression contract (4), feature flags (17) | every sprint | Named guard suites green; flags off until checked in Splice |

---

## 2. Market analysis

### 2.1 Demand

- **Australians already use AI at scale.** Roy Morgan's March 2026 quarter research: 13.6 million Australians aged 14+ (58%) used AI tools in an average four weeks; ChatGPT had 10.5 million users (45%); use is highest at ages 25–34 (74%) and 35–49 (72%); sample 14,646. ([Roy Morgan](https://www.roymorgan.com/findings/10248-artificial-intelligence-ai-tools-usage-march-2026))
- **People ask AI to choose local businesses.** BrightLocal's Local Consumer Review Survey 2026 (US, 1,002 adults, published 10 Mar 2026): 45% used AI tools for local business recommendations, up from 6% the year before; ChatGPT 31%, Google AI Mode 23%; 63% of AI users trust the recommendations. US data, but the direction applies to Australia and to Vunnara's later US market. ([BrightLocal](https://www.brightlocal.com/research/lcrs-ai-trust/))

### 2.2 Competitors and what they do with questions

Prices as published by each vendor and collected on 14–20 Nov 2026 by the sources cited; currencies as published.

| Tool | Entry price | Unit sold | How questions are chosen | Location | Agency features | Recommendations |
|---|---|---|---|---|---|---|
| Peec AI | $95/mo (50 prompts), $245 (150), $495 (350) | Prompts | Custom prompts; custom setup on Enterprise | Multi-country from Advanced | Credit-based agency plans $245–$795/mo | Reporting |
| Otterly.AI | $29/mo (15 prompts), $189 (100), $489 (400) | Prompts, engine add-ons | Prompt research tool on all plans | 50+ countries | Unlimited brand reports | GEO audit |
| Semrush AI Visibility Toolkit | $99/mo per domain, 25 prompts; +50 prompts $60/mo | Prompts | Custom prompts plus a 317M-prompt research database | 220+ countries; volumes in 15 | Inside the SEO suite | Measurement only |
| AthenaHQ | $295/mo (3,600 responses) | Responses | "Discover": website analysis, keyword gaps, competitor landscape, Search Console, Reddit/YouTube; shows estimated volume per suggestion; flags "Already tracked" | Country and language per run | Not stated | Not stated |
| Promptwatch | $95/mo (50 prompts) | Prompts | Prompt volumes (weighted AI/Bing/Google keyword volume), difficulty, Search Console seeding | Country, language, down to city | Not stated | Not stated |
| BrightLocal Local AI Visibility | Included in BrightLocal plans | Locations | Suggests prompts from business category; up to 20 per location, editable | Every query anchored to a location | Inside agency local-SEO suite | AI-generated prioritised actions; citation gaps link to Citation Builder |
| Local Falcon | Credits | Grid scans | User chooses keywords | 9–441 grid points across a city | Competitor and trend reports | "Falcon AI" plain-language analysis with prioritised recommendations |
| Vizible AI | Not published; answer pools 10k–60k/mo | Analysed answers | AI-generated buyer questions grouped by theme, editable, or add your own; never include brand or competitor names | Country and language per client | Unlimited clients and prompts; white-label PDFs and no-login share links | Weekly recommendations per client |

Sources: [DEV Community price comparison, 20 Nov 2026](https://dev.to/raphaelaubry/ai-visibility-tools-pricing-compared-november-2026-cll) (author sells a competing tool, disclosed), [tools8020 on Peec AI](https://tools8020.com/tools/peec-ai/pricing/), [AEO Labs on Otterly](https://www.aeolabs.ai/blog/otterly-ai-pricing), [Honeyb on Semrush](https://www.honeyb.ai/blog/semrush-ai-visibility-toolkit) (sells a competing tool), [AthenaHQ docs](https://docs.athenahq.ai/discover), [Promptwatch](https://promptwatch.com/features/prompt-volumes), [BrightLocal](https://www.brightlocal.com/local-seo-tools/local-ai-visibility/), [Local Falcon](https://www.localfalcon.com/features/ai-search-visibility), [Vizible AI](https://vizibleai.com/en/blog/vizible-ai-features-for-agencies).

### 2.3 What this means for the design

1. **Everyone sells by question volume.** Prompts, responses or credits are the universal pricing unit; extra-prompt add-ons are normal (Semrush +50 for $60; Otterly +100 for $99). Vunnara's question packs (8.7) match buyer expectations.
2. **Custom plus suggested questions is table stakes.** Every serious tool lets users add their own and suggests others. Vunnara must have both (8.2, 8.3).
3. **The best suggestion engines show why a question is suggested** (AthenaHQ shows volume and source; Promptwatch shows volume and difficulty). Vunnara's "Why this question" chips (8.6.5) and evidence-checked services go further: every service is tied to a verbatim quote from the business's own site or listing.
4. **Local tools anchor every query to a place** (BrightLocal, Local Falcon) while national tools work by country. **Nobody offers a single ladder from suburb to state to country to worldwide with a separate score for each.** Visibility reach (8.4) is a genuine differentiator, and it matters for businesses like TechCore IT that are local in name but national in practice.
5. **Recommendations are where agencies see value** (BrightLocal's prioritised actions, Local Falcon's analysis, Vizible's weekly recommendations). The client asked for exactly this in the report (C1). Vunnara's edge is that each action carries its evidence line, which is the "evidence behind the score" the client praised.
6. **Agency workflow is expected:** white-label PDFs, share links without login, unlimited clients on agency plans. Vunnara already has white-label PDFs and a client portal; the portal must also show the generated reports (8.1.6).
7. **Agencies resell depth.** Agency tools compete on white-label output (Vizible AI's white-label PDFs, BrightLocal's agency suite). Three report tiers that an agency can rename and price for its own clients (8.1.7) turn Vunnara's evidence into something the agency sells, not only something it reads.
8. **Australian specifics are Vunnara's moat for now:** ABN verification, Australian directories, Australian taxonomy (ANZSIC). The design keeps them market-specific behind a market config so the US launch reuses the same code with US equivalents (NAICS, US directories, states).

---

## 3. Why YouTube, AI crawlers and ABN are not in the PDF today

**Short answer:** the PDF was rebuilt in November around one audit's measured answers, and these three checks live in separate modules that the PDF's data builder never reads. Some of them were also not yet real or not yet populated, so earlier honesty passes deliberately kept them out.

| Item | Where it lives today (VERIFY) | Why it isn't in the PDF |
|---|---|---|
| ABN | `lib/brand-entity/abn-lookup.ts` calls the ABR web service; scored through `brandEntityScore()` in `lib/audit/run-technical-audit-inline.ts` (Brand & Entity, part of the Technical Audit) | The report builder (`lib/reports/report-data.ts`) reads only the basis audit. The ABN check also only runs when `brands.abn` was typed in at setup and `ABN_LOOKUP_GUID` works, so many brands (TechCore IT) show "Not checked" |
| YouTube | `youtube_presence_audits` table, a YouTube cron, channel matching with domain-mismatch states | Separate module with its own schedule; at one point it was a stub and an honesty pass showed "Measurement not yet available" until it was real |
| AI crawlers | Access: robots.txt scoring in `lib/robots-txt/analyze.ts` (Technical Audit). Visits: `crawler_visit_logs` from uploaded server logs and the visit beacon (CDN Shield writes none) | Separate modules. Uploaded-log visits were never stored in production until the 20 Nov fix (date bug), so there was nothing true to show |

**Fix (S1, sections 8.1.4 and 8.1.7):** a "Beyond AI answers" page in **Enhanced** PDF reports (and a card on the audit page and in the client portal for every plan), with tiles (Business identity, YouTube, AI crawler access and visits, Website technical score). Each tile shows its own check date, comes from the module's latest real result, says "Not checked" with how to enable it when there is none, and is never counted in the Visibility score. S1 first verifies that each module is a real measurement; anything still stubbed stays out. S1 also adds ABN suggestion by business name (8.8.6), so the check runs for brands like TechCore IT.

---

## 4. Non-regression contract

These behaviours exist today and must be identical after every sprint unless this LLD says otherwise. Each sprint prompt lists the guards it must run.

| # | Behaviour that must not change | Guard |
|---|---|---|
| N1 | An existing brand's audit asks the same questions in the same order (stored `prompt_pack`, 10 everyday + 3 to 5 that name the business) | Integration test: audit prompts for Hero/Omega fixtures equal before and after backfill |
| N2 | `audits.question_set_hash` values and every "comparable / not comparable" decision for past audits | Prod run3 check: 0 hashes differ; unit test on comparator |
| N3 | Headline Visibility % for existing audits (everyday answers mentioning the brand ÷ successful everyday answers) | Snapshot tests on audit #50, #51, #54, #55 fixtures |
| N4 | Questions that name the business are shown but never counted | Existing guard plus new test for agency-written branded questions |
| N5 | Google AI results never counted in the headline; Starter never gets Google | Existing setting-aware guards |
| N6 | Technical score versions and maxima per audit (v4 out of 74) | Existing `compositeMaxFor` tests |
| N7 | RLS: every org table FORCE RLS on `app.current_org_id`; no new `serviceDb` reads in request paths | RLS guard suite; new tables added to it |
| N8 | White-label branding in PDFs and portal | Existing report-branding tests |
| N9 | The free sample audit (home page): 6 questions × 2 engines, deleted after a day, excluded from workspace counts | Existing sample-audit tests |
| N10 | Plan gates in `tiers.ts` and public pricing claims follow real settings | Plan-claim guard |
| N11 | Operator-only costs never shown to customers | Cost-visibility guard |
| N12 | No mock, seed or placeholder data in production | Placeholder guard; production writes only through run1–run4 sets |
| N13 | Inngest app id `visibleau` and existing function ids unchanged; new functions only added | Function-id snapshot test |
| N14 | Existing PDF sections and their figures for a Local-only brand with no new data | Render test compares page text for Hero #54 fixture, allowing only the added sections |
| N15 | A **Basic** report contains today's report pages. Allowed differences only: findings g–j replace "No finding rule matched" (T5), within today's limit of 3 problem findings and 1 strength (amendment 52); general advice only when backed by evidence (T7); the question mix line (S3); the reach row (S4); and the cover's report name line on Agency plans (D-RT3, amendment 53) | Render test: Basic PDF for Hero #54 and Omega #55 fixtures vs today's page text, diff limited to the allowed items |

**Feature flags.** Every new behaviour ships behind a flag that is off in production until Sri has checked it in the Splice workspace (section 17). Flags never change data; turning one off returns the old behaviour.

---

## 5. Current system (as-is), as relevant to this work (VERIFY in S0)

| Area | Files and tables (from Claude Code reports) | Notes |
|---|---|---|
| Brand record | `db/schema/brands.ts`: `name`, `domain`, `vertical`, `region` ('au'), `categories`, `classification` (jsonb: category, buyerType, confidence, auRelevance, competitors, intentSignals), `classification_status`, `prompt_pack` (text array), `prompt_pack_version`, `prompt_pack_generator_version`, `suburb`, `city`, `state`, `country`, `postcode`, `location_mode`, `location_confirmed_at`, `primary_regions` ('NSW:Sydney CBD'), `competitors` (names), `competitor_websites`, `abn`, `youtube_channel_url`, `logo_url`, `deleted_at` | `location_mode` is plain text; online-only brands verify mentions by domain only |
| Classification | `lib/brands/classify-brand.ts` (home page title, meta description, H1 → Claude), `classify-and-store.ts`, `audience.ts`, `intent-signals.ts` | Confidence < 0.7 or unconfirmed → confirm screen |
| Categories and templates | `lib/prompts/templates.ts`: closed `CATEGORY_KEYS`, `CATEGORY_TEMPLATES[category][buyerType]`, `CATEGORY_LABELS`, alias table, `resolveCategory()` (exact → alias → `{parent}_general` → `general`); templates use `{region}` from `primary_regions[0]` | 30 confirm-screen chips; no IT services key |
| Building questions | `lib/prompts/build-prompt-pack.ts` (`buildPromptPack`, `buildEnrichedPrompts` for the branded ones), `lib/audit/get-audit-prompts.ts` (`getAuditPrompts`, `BrandNeedsConfirmationError`, `PromptPackGenerationError`, `brandReadyForAudit`), `lib/verticals/expand-prompt.ts` (`{brand}`, `{domain}`, `{location}`, `{competitors}`; `validateGeneratedQuestion`), `isBrandedPrompt()` (`lib/audit/flag-branded-prompts.ts`; section 0, #3) | Order: 10 everyday then the branded ones; `PROMPTS_PER_AUDIT = 10` in `lib/llm/tier-engines.ts` |
| Running audits | `lib/audit/run-audit.ts` (Inngest) and `lib/audit/run-audit-inline.ts`; engines by tier in `lib/llm/tier-engines.ts` and `model-selector.ts`; per-engine settings in `lib/llm/web-search-config.ts` | Both runners must stay in step |
| Mentions | `lib/audit/detect-mention.ts`, `lib/audit/verify-mention.ts` | One shared match function (spacing, case, markdown) |
| Comparability | `audits.question_set_hash` computed with SQL `question_text_key()` over everyday questions | Excluded audits via `excluded_from_trends_reason` |
| Recommendations | `lib/recommendations/index.ts`, `triggers.ts`, `action_items`, `recommendation_research` | Labels via `dimension-labels.ts` |
| Report | `lib/reports/report-data.ts` (`pickBasisAudit`, `defaultReportPeriodLabel`), `lib/reports/pdf/report-document.tsx` (react-pdf, 7–8 A4 pages), `lib/reports/report-findings.ts` (rules a–f, up to 3 problems + 1 strength), `inngest/.../render-report-pdf.ts`, `generated_reports`, `report_templates` (`sections` jsonb, `tone` ignored), `lib/communication/pdf-builder.tsx` | Client portal does not list generated reports |
| Entity, YouTube, crawlers | See section 3 | |
| Google AI | `google-surfaces.ts`, `location.ts` (postcode → suburb → city → state capital, labelled) | Global and workspace switches on `/admin/settings` |
| Plans | `tiers.ts` (features, models line, Google line), `model-selector.ts` | Setting-aware public claims |
| Sample audit | `lib/sample-audit/run.ts`, `open-workspace.ts` (excludes `__sample__` workspace) | |


---

## 6. Target architecture

### 6.1 The question pipeline after this work

```
                 ┌──────────── Business profile (8.6) ────────────┐
 Website (L1) ─┐ │ services · places · attributes · reach signals │
 Listings (L2) ┼▶│ every item tied to evidence (quote + URL)      │
 Demand (L3) ──┤ └───────────────────────┬────────────────────────┘
 Competitors(L4)┘                        ▼
                     Writer + scorer per reach (L5) ──▶ question_candidates
                                         ▼
     Business types (8.5) ──▶ Templates per reach (8.4) ──┐
                                         ▼                 │
                 Brand question library (brand_questions) ◀┘  ◀── agency-written (8.3)
                                         ▼
                 Client confirms / applies (L6) ──▶ brand_question_sets (versioned)
                                         ▼
                 getAuditPrompts() ──▶ audit run (both runners) ──▶ citations (+question_id, reach)
                                         ▼
                 Scoring: headline + per reach + per source ──▶ audit page · PDF · portal
                                         ▼
                 question_results (L7) ──▶ weak-question flags ──▶ suggested swaps (back to library)
```

### 6.2 Principles

1. **One source of questions per audit:** the brand's current question set. `getAuditPrompts()` reads it; if a brand has no set (should never happen after backfill), it falls back to today's `prompt_pack` logic unchanged.
2. **Additive schema only.** New tables and nullable columns; nothing dropped or renamed. `prompt_pack` stays until a later cleanup sprint after one month of clean running.
3. **Every figure is traceable** to answers (audit), quotes (profile) or a dated check (Beyond AI answers).
4. **Market-agnostic core, market-specific data.** Reach places, taxonomy codes, directories and the ABN check are keyed by market (`brands.region`, today 'au'), so the US uses the same code with US data.
5. **Background work in Inngest, small reads in requests.** Analysis, generation, report rendering and result computation are Inngest functions with steps, retries and concurrency keys; pages read indexed tables.
6. **Flags off by default** (section 17).

---

## 7. Data model

All org-scoped tables: `organization_id uuid not null`, FORCE ROW LEVEL SECURITY, the same four policies (select/insert/update/delete) on `organization_id = current_setting('app.current_org_id')::uuid` as existing tables (copy the pattern from migration 0029's policy template, VERIFY name), grants to `visibleau_app`. Global tables: no `organization_id`, read-only to `visibleau_app` (SELECT only), written by migrations or a narrow SECURITY DEFINER function owned by the migration role. Timestamps `timestamptz not null default now()`. Text enums are `text` with CHECK constraints (the codebase convention; Drizzle enum options are TS-only).

### 7.1 Question library and sets (S2)

```sql
create table brand_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  text text not null check (char_length(text) between 10 and 200),
  text_key text not null,                         -- question_text_key(text), computed in the insert
  kind text not null check (kind in ('everyday','branded')),
  source text not null check (source in ('original','template','ai_suggested','agency')),
  reach text not null default 'local' check (reach in ('local','state','country','global')),
  service_label text,                             -- display text, e.g. "Microsoft 365 support"
  business_service_id uuid,                       -- FK business_type_services(id), S5
  place_label text,                               -- e.g. "Sydney", "NSW", "Australia"
  intent text check (intent in ('best','reviews','price','near','problem','emergency','comparison','other')),
  status text not null default 'ready' check (status in ('suggested','ready','archived')),
  rank numeric(6,3),                              -- writer score 0..1 (S6); null for original/agency
  reasons jsonb not null default '[]',            -- "Why this question" chips (8.6.5)
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index brand_questions_live_key on brand_questions (brand_id, text_key) where archived_at is null;
create index brand_questions_brand_status on brand_questions (organization_id, brand_id, status);

create table brand_question_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  version int not null check (version >= 1),
  is_current boolean not null default false,
  comparison_hash text not null,                  -- same algorithm as audits.question_set_hash
  reach_hashes jsonb not null default '{}',       -- {"local": "...", "state": "..."}
  applied_by uuid references users(id),           -- null for the backfill
  applied_at timestamptz not null default now(),
  note text,
  unique (brand_id, version)
);
create unique index brand_question_sets_one_current on brand_question_sets (brand_id) where is_current;

create table brand_question_set_items (
  set_id uuid not null references brand_question_sets(id) on delete cascade,
  organization_id uuid not null,
  question_id uuid not null references brand_questions(id) on delete restrict,
  position int not null,
  kind text not null,                             -- snapshot of the question at apply time
  reach text not null,
  source text not null,
  primary key (set_id, question_id),
  unique (set_id, position)
);

alter table audits add column question_set_id uuid references brand_question_sets(id);   -- null for past audits
alter table citations add column question_id uuid references brand_questions(id);         -- null for past rows
alter table engine_call_failures add column question_id uuid references brand_questions(id);
create index citations_question on citations (question_id) where question_id is not null;
```

- A question used by any set is never deleted (`on delete restrict`); "delete" in the UI archives it.
- Editing a question's wording archives the old row and inserts a new one, so each answer stays tied to the exact words asked.
- `comparison_hash` uses the existing algorithm: SHA-256 hex of the sorted (`COLLATE "C"`), de-duplicated `question_text_key()` of everyday questions joined by newline. A shared TS function `computeQuestionSetHash()` and the SQL function must agree (unit test with the 0152 fixtures).

### 7.2 Visibility reach (S4)

```sql
create table brand_visibility_scopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  reach text not null check (reach in ('local','state','country','global')),
  enabled boolean not null default true,
  place jsonb not null default '{}',   -- local: {"city":"Sydney","state":"NSW","areas":["Western Sydney"],"suburb":"Yennora","postcode":"2161"}
                                       -- state: {"state":"NSW"}  country: {"country":"AU"}  global: {}
  target_count int not null default 0 check (target_count between 0 and 60),
  updated_by uuid references users(id),
  updated_at timestamptz not null default now(),
  unique (brand_id, reach)
);
create table audit_reach_results (
  audit_id uuid not null references audits(id) on delete cascade,
  organization_id uuid not null,
  reach text not null,
  everyday_answers int not null,      -- successful everyday answers in this reach
  mentioned int not null,
  ci_low numeric(5,4), ci_high numeric(5,4),
  reach_hash text not null,
  primary key (audit_id, reach)
);
```

- Backfill: one `local` row per brand, `enabled = true`, place from `suburb/city/state/postcode`, `target_count` = the brand's current everyday count (normally 10). No other reach rows. That is S2 ("Local is the default").
- `audit_reach_results` is written when an audit completes; past audits get a `local` row from their existing figures during the S4 backfill so per-reach trends start with history.

### 7.3 Business taxonomy (S5)

```sql
create table business_sectors (          -- global
  id uuid primary key default gen_random_uuid(),
  market text not null default 'au',      -- 'au' now, 'us' later, '*' for shared
  slug text not null, name text not null, sort int not null,
  unique (market, slug)
);
create table business_types (            -- global
  id uuid primary key default gen_random_uuid(),
  sector_id uuid not null references business_sectors(id),
  slug text not null unique, name text not null,
  industry_code text,                     -- ANZSIC class for 'au' (e.g. '7000' Computer System Design); NAICS for 'us'
  aliases text[] not null default '{}',
  default_buyer text not null check (default_buyer in ('households','businesses','both')),
  default_reach text not null default 'local' check (default_reach in ('local','state','country','global')),
  legacy_category_keys text[] not null default '{}',   -- maps today's CATEGORY_KEYS
  template_family text not null,          -- key into question templates (8.4.3)
  status text not null default 'active' check (status in ('active','candidate','archived')),
  created_at timestamptz not null default now()
);
create table business_type_services (    -- global
  id uuid primary key default gen_random_uuid(),
  type_id uuid not null references business_types(id) on delete cascade,
  name text not null, aliases text[] not null default '{}', sort int not null,
  unique (type_id, name)
);
create table workspace_business_types (  -- org
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null check (char_length(name) between 3 and 60),
  parent_type_id uuid references business_types(id),
  sector_id uuid not null references business_sectors(id),
  description text check (char_length(description) <= 200),
  services text[] not null default '{}',
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references users(id), created_at timestamptz not null default now()
);
create unique index workspace_business_types_name on workspace_business_types (organization_id, lower(name)) where status = 'active';
create table brand_business_types (      -- org
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  brand_id uuid not null references brands(id) on delete cascade,
  type_id uuid references business_types(id),
  workspace_type_id uuid references workspace_business_types(id),
  is_main boolean not null default false,
  source text not null check (source in ('detected','user','legacy')),
  confidence numeric(4,3),
  check ((type_id is null) <> (workspace_type_id is null))
);
create unique index brand_business_types_one_main on brand_business_types (brand_id) where is_main;
create unique index brand_business_types_unique on brand_business_types (brand_id, coalesce(type_id, workspace_type_id));
create table classification_feedback (   -- org
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, brand_id uuid not null references brands(id) on delete cascade,
  detected jsonb not null,   -- [{"type":"saas-software","confidence":0.62}, ...]
  chosen jsonb not null,     -- [{"type":"managed-it-services","main":true}, {"workspace_type":"..."}]
  created_at timestamptz not null default now()
);
create table taxonomy_signal_counts (    -- global, aggregates only, written by a SECURITY DEFINER function
  signal text not null,      -- 'custom_type_name' | 'correction' | 'alias_candidate'
  key text not null,         -- normalised custom type name, or 'detected->chosen'
  workspace_count int not null check (workspace_count >= 3),
  occurrences int not null,
  computed_at timestamptz not null default now(),
  primary key (signal, key)
);
```

- `brands.vertical`, `brands.categories` and `brands.classification` stay and keep working; `brand_business_types` is added beside them. Backfill: for each brand, map `classification.category` via `legacy_category_keys` to a type (source 'legacy', main). Unmapped → the sector's general type.
- `taxonomy_signal_counts` is the only cross-workspace data. A SECURITY DEFINER function `refresh_taxonomy_signals()` aggregates `workspace_business_types` names and `classification_feedback` corrections, keeps only keys seen in **at least 3 distinct workspaces**, and stores no brand, workspace, URL or free text beyond the normalised type name. Operators read it on `/admin/taxonomy`. This is the controlled path the operator console plan describes; it must be reviewed with that plan (decision D12).

### 7.4 Business profile and question intelligence (S6–S9)

```sql
create table analysis_runs (              -- org
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, brand_id uuid not null references brands(id) on delete cascade,
  trigger text not null check (trigger in ('new_brand','improve','website_changed','operator')),
  status text not null check (status in ('queued','running','complete','partial','failed')),
  layers jsonb not null default '{}',     -- {"website":{"status":"complete","pages":9,"ms":4210}, "listings":{...}}
  cost_usd numeric(8,4) not null default 0,
  cost_breakdown jsonb not null default '{}',   -- operator-only
  site_fingerprint text, error text,
  started_at timestamptz, finished_at timestamptz, created_at timestamptz not null default now()
);
create index analysis_runs_brand on analysis_runs (organization_id, brand_id, created_at desc);

create table brand_profiles (             -- org, versioned
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, brand_id uuid not null references brands(id) on delete cascade,
  run_id uuid references analysis_runs(id),
  version int not null, status text not null check (status in ('draft','confirmed','superseded')),
  summary jsonb not null default '{}',    -- customer type, attributes (emergency, after hours, remote), reach signals
  confirmed_by uuid references users(id), confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (brand_id, version)
);
create table profile_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, profile_id uuid not null references brand_profiles(id) on delete cascade,
  name text not null, business_service_id uuid references business_type_services(id),
  prominence text check (prominence in ('high','medium','low')),
  demand text check (demand in ('high','medium','low')),
  status text not null check (status in ('suggested','confirmed','rejected','user_added')),
  sort int not null default 0
);
create table profile_places (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, profile_id uuid not null references brand_profiles(id) on delete cascade,
  name text not null, postcode text, state text,
  kind text not null check (kind in ('base','served','region')),
  status text not null check (status in ('suggested','confirmed','rejected','user_added'))
);
create table profile_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, profile_id uuid not null references brand_profiles(id) on delete cascade,
  item_type text not null check (item_type in ('service','place','attribute','reach_signal')),
  item_id uuid,                            -- profile_services.id / profile_places.id; null for attributes
  source_kind text not null check (source_kind in ('website','listing','competitor','structured_data','user')),
  url text not null, quote text not null check (char_length(quote) <= 300),
  fetched_at timestamptz not null
);
create index profile_evidence_item on profile_evidence (item_id);

create table question_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, brand_id uuid not null references brands(id) on delete cascade,
  run_id uuid not null references analysis_runs(id) on delete cascade,
  text text not null, text_key text not null,
  reach text not null, service_label text, place_label text, intent text,
  scores jsonb not null,                   -- {"r":1,"d":0.8,"k":0.7,"s":1,"total":0.86,"weights":"v1"}
  reasons jsonb not null default '[]',
  pretest jsonb,                           -- {"engine":"chatgpt","businesses_named":3,"directory_cited":true,"passed":true}
  status text not null check (status in ('chosen','spare','dropped')),
  drop_reason text
);
create index question_candidates_run on question_candidates (run_id, status);

create table page_cache (                 -- org (fetched for a brand inside a workspace)
  organization_id uuid not null, url_hash text not null,
  url text not null, fingerprint text not null, text text not null,
  structured_data jsonb, fetched_at timestamptz not null, expires_at timestamptz not null,
  primary key (organization_id, url_hash)
);
create table search_demand_cache (        -- global: public market data only
  phrase_key text not null, location_code int not null,
  volume int, monthly jsonb, fetched_at timestamptz not null,
  primary key (phrase_key, location_code)
);
create table question_results (           -- org, written after each audit (S9)
  audit_id uuid not null references audits(id) on delete cascade,
  question_id uuid not null references brand_questions(id),
  organization_id uuid not null, reach text not null,
  answers int not null, naming_answers int not null, mentioned_answers int not null,
  competitors_named jsonb not null default '{}', directories_cited jsonb not null default '{}',
  primary key (audit_id, question_id)
);
```

- `search_demand_cache` stores generic phrases only (built from service × place, never a business name) and is written through `upsert_search_demand()` SECURITY DEFINER.
- Retention: `page_cache` 7 days; `analysis_runs`, profiles and candidates deleted with the brand and by the existing weekly retention job after 12 months, like audits. Add them to the retention job and to `data-facts.ts`.

### 7.5 Report (S1)

```sql
create table report_brand_preferences (    -- org
  brand_id uuid primary key references brands(id) on delete cascade,
  organization_id uuid not null,
  include_general_advice boolean not null default true,     -- Standard and Enhanced; evidence-backed items only (8.8.5)
  include_done_since_last boolean not null default true,
  default_tier text check (default_tier in ('basic','standard','enhanced')),  -- null = the plan's highest tier (8.1.7)
  updated_by uuid references users(id), updated_at timestamptz not null default now()
);
create table report_action_choices (       -- org
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, brand_id uuid not null references brands(id) on delete cascade,
  action_item_id uuid not null references action_items(id) on delete cascade,
  included boolean not null default true, position int,
  note text check (char_length(note) <= 400),
  updated_by uuid references users(id), updated_at timestamptz not null default now(),
  unique (brand_id, action_item_id)
);
create table agency_actions (              -- org
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, brand_id uuid not null references brands(id) on delete cascade,
  title text not null check (char_length(title) between 5 and 120),
  detail text check (char_length(detail) <= 600),
  priority text not null check (priority in ('high','medium','low')),
  status text not null default 'open' check (status in ('open','in_progress','done')),
  position int, created_by uuid references users(id),
  created_at timestamptz not null default now(), archived_at timestamptz
);
alter table generated_reports add column contents_snapshot jsonb;   -- exactly what the PDF contained
alter table generated_reports add column report_tier text not null default 'basic'
  check (report_tier in ('basic','standard','enhanced'));           -- existing rows are today's report = basic
-- Tier names an agency sells under (8.1.7, P18).
alter table agency_brand_assets add column report_tier_names jsonb;     -- workspace row only (brand_id is null; newest wins if duplicated). {"basic":"Essentials","standard":"Growth Plan","enhanced":"Premium Audit"}
-- Scheduled reports (report_delivery_schedules, Agency) get a tier; the generator reads it, capped at the plan:
alter table report_delivery_schedules add column report_tier text not null default 'basic' check (report_tier in ('basic','standard','enhanced'));
```
`report_tier_names`: each value 1–24 characters after trimming, plain text, no line breaks or control characters, the three unique ignoring case; missing keys fall back to Basic, Standard, Enhanced. Validated by zod on write and by a `check` on `jsonb_typeof` plus lengths in the migration.

### 7.6 Plans and packs (S3, S10)

- `tiers.ts` gains per plan: `includedScoredQuestions` (10), `maxBrandedQuestions` (5, D-QI-BR), `canWriteQuestions`, `reachesAllowed` (Free 1, Starter 1, Growth 2, Agency 4, Agency Pro 4, Enterprise 4), `customBusinessTypes` (0/0/5/20/unlimited), `reportCuration` (Agency and up), `maxReportTier` (Free and Starter: none, reports stay Growth and up (D-RT1 revised); Growth `standard`; Agency, Agency Pro and Enterprise `enhanced`), `reportTierNames` (Agency and up can rename the tiers), `questionPacks` (Growth and up). Server code reads these; nothing in the browser enforces limits alone.
- ```sql
  alter table organizations add column question_packs int not null default 0 check (question_packs >= 0);  -- from the Stripe webhook
  create table brand_question_packs (organization_id uuid not null, brand_id uuid primary key references brands(id) on delete cascade, packs int not null check (packs >= 0), updated_at timestamptz not null default now());
  ```
  The assignment write locks the organization row (`select … for update`) and checks `sum(packs) <= organizations.question_packs` in the same transaction.

### 7.7 Smaller columns (S0, S1)

```sql
-- Built in S0 (0153): brands.aliases text[] not null default '{}' (≤ 10) and brands.name_suggestion text.
-- S1 (0154): brands.abn already exists (POST accepts it); PATCH and brand settings gain it. New:
alter table brands add column abn_suggestion jsonb;                      -- {"abn":"17701710947","entity":"Astorio Group Pty Ltd","postcode":"2765","state":"NSW","status":"Active","checked_at":"..."}
-- Built in S0 (0153), as amended (section 0, #2):
-- directory_registry(domain_pattern text pk, directory_key text, name text, kind text, market text,
--   applies_to text check in ('trades','local','cited'), profile_url_hint text, active boolean, sort_order int,
--   created_at, updated_at); 35 rows / 30 directories. App role has DML until S5 (D-GT).
```
`directory_registry` replaced `DIRECTORY_REGISTRY` in `lib/directories/registry.ts`; seeded from that list plus appendix B (applies_to `cited`: shown only when an audit cites them).

---

## 7A. Migrations

Numbers are indicative: use the next free number at build time (S0 may add one for flags) and keep the order.

| Migration | Sprint | Contents | Backfill and checks |
|---|---|---|---|
| 0153 | S0 | Flag keys (feature_settings CHECK), `brands.aliases` + `name_suggestion`, `directory_registry` (+ seed) | Built and applied as one run set |
| 0154 | S1 | `report_brand_preferences` (with `default_tier`), `report_action_choices`, `agency_actions`, `generated_reports.contents_snapshot` and `report_tier`, `report_tier_names` on the report-branding row, `brands.abn_suggestion` (and the schedule `report_tier` if scheduled reports exist) | Default `basic` for existing reports; run3: every existing `generated_reports` row is `basic` |
| 0155 | S2 | `brand_questions`, `brand_question_sets`, `brand_question_set_items`, `audits.question_set_id`, `citations.question_id`, `engine_call_failures.question_id` | run2 backfill (below); run3 proves hashes |
| 0156 | S3 | `organizations.question_packs`, `brand_question_packs` | Defaults 0 |
| 0157 | S4 | `brand_visibility_scopes`, `audit_reach_results` | Local row per brand; local results for past audits |
| 0158 | S5 | taxonomy tables + seed, `classification_feedback`, `taxonomy_signal_counts`, `refresh_taxonomy_signals()` | `brand_business_types` legacy mapping |
| 0159 | S6 | `analysis_runs`, `brand_profiles`, `profile_*`, `question_candidates`, `page_cache` | none |
| 0160 | S8 | `search_demand_cache`, `upsert_search_demand()` | none |
| 0161 | S9 | `question_results` | optional backfill for the last 4 audits per brand |

Each is a `db/prod-fixes/<n>-run1..run4` set as today: run1 read-only preview, run2 apply (enum `ADD VALUE` statements alone, outside a transaction), run3 verify (including `has_function_privilege` / `has_table_privilege` for `visibleau_app`), run4 rollback. Migrations go in before the push.

**S2 backfill (0155 run2), the delicate one:**
1. For each non-deleted brand with a non-empty `prompt_pack`: insert each prompt into `brand_questions` in stored order with `source = 'original'`, `kind` from `isBrandedPrompt()` (`lib/audit/flag-branded-prompts.ts`) re-expressed in SQL (the brand name, domain or aliases appear, using the same normalisation), `reach = 'local'`, `text_key = question_text_key(text)`.
2. Insert set version 1, `is_current = true`, items in stored order, `comparison_hash` computed in SQL with the existing algorithm.
3. run3 proves, brand by brand, that version 1's `comparison_hash` equals the `question_set_hash` of that brand's latest complete audit **when that audit used the stored pack**; it lists any mismatch (expected: brands whose pack changed after their last audit) for review. Mismatches are reported, never "fixed".
4. The SQL rule for `kind` must reproduce how stored packs are typed today (by text, `get-audit-prompts.ts` around lines 180–182, VERIFY). run1 checks it against stored truth: for every brand, each pack prompt's SQL `kind` is compared with `citations.is_branded_prompt` for the same prompt in that brand's latest complete audit. Expected: 0 differences. Any difference stops the run.
5. Scoring keeps using the run-time branded check exactly as today; the library's `kind` drives display, limits and disclosure. A unit test asserts the TS check and the stored `kind` agree for every question created after S2.


---

## 8. Feature specifications

### 8.1 Report v2: what to do next, beyond AI answers, and report tiers (C1, R3, R6, T5) — sprint S1

#### 8.1.1 Goals
- An agency can hand the PDF to its client as a plan: what we found, what to do next, why (evidence), and what was done since last time.
- The PDF also shows the checks outside AI answers (business identity and ABN, YouTube, AI crawlers, website technical score), each with its own date.
- Nothing measured is ever mixed with agency opinion or general advice without a label.
- Reports come in three tiers, Basic, Standard and Enhanced (8.1.7), so agencies can sell each depth to their clients at their own price.

#### 8.1.2 New and changed PDF pages (prototype P09)

Which of these pages a report contains depends on its tier (8.1.7): Basic keeps today's pages (with the corrections in N15), Standard turns Diagnosis into "Why, and what to do next", and Enhanced adds "Beyond AI answers".

| Page | Today | After S1 |
|---|---|---|
| Cover, Summary, Engines, Google, Directories, Competitors | As built in Nov 2026 | Unchanged for a Local-only brand (S4 adds the reach row) |
| Diagnosis | Findings rules a–f; "No finding rule matched this audit" when none | "Why, and what to do next": findings (a–f plus new g–j, 8.1.5), then **What to do next** (8.1.3). The "No finding rule matched" sentence is removed; a 0% audit always has findings f or g |
| NEW Beyond AI answers | — | Four tiles (8.1.4), placed after Diagnosis |
| Over time | Trend and prioritised list | Trend only; the prioritised list moves into "What to do next" |
| Method | Method, glossary, residency | Adds "Questions asked: 10 everyday (all AI-suggested)" or the mix once agencies write questions (S3), and a "Checks outside AI answers" row listing each check's date |

#### 8.1.3 "What to do next" (page section and audit-page card)

Each item renders:
1. **Action title**, plain words ("Link your Yellow Pages, hipages and Airtasker profiles").
2. **Evidence line** in mono, from this audit or the dated check ("Yellow Pages cited in 17 of 40 answers · audit #54"). Never editable.
3. **Priority** pill (High, Medium, Strength) and **status** from the Action Center (Open, In progress, Done).
4. **Agency note** when present, shown as "Note from Splice Marketing".

Groups, in order:
- **Measured actions** (from `action_items` linked to the basis audit, ranked by existing priority).
- **Recommended by <agency>** (from `agency_actions`), labelled, never shown as measured.
- **Done since the last report**: action items whose status changed to Done between the previous generated report's date and this one (by `action_items.updated_at` and status history if it exists, VERIFY).
- **General advice** only when `include_general_advice` is on, under "General advice, not drawn from this audit".

Who controls what (decision D1, updated for tiers): the section is part of **Standard and Enhanced** reports (8.1.7). Every plan that can generate those tiers gets all measured actions in priority order; **Agency and up** can include/hide and reorder measured actions, add notes, add agency-written actions and toggle "Done since" and general advice. The audit page's Recommended actions and the Action Center stay on every plan; only the PDF is tiered.

**Report contents panel** (P08): opened from "Generate report" on the brand's Reports page (P17). Top: the report type picker (Basic, Standard, Enhanced; tiers above the plan locked with the plan name). Left: the item list with include toggles, drag handle plus move up/down buttons, note field per item, "Add your own action". Right: live outline of the PDF pages. Choices save to `report_action_choices` / `report_brand_preferences` and become the default next time. "Generate report" starts the existing render job with `{ basisAuditId, contents }`.

**Snapshot:** `render-report-pdf` writes `generated_reports.contents_snapshot` with the exact items, notes, sections, figures and check dates it rendered. Re-rendering an old report ("Try again") uses its snapshot, so a report sent last month never changes when the Action Center does. Snapshot JSON schema in appendix D.

#### 8.1.4 "Beyond AI answers" (P09 page in Enhanced reports, P07 audit-page card, portal)

Four tiles on the audit page and portal, plus a fifth "Your directory profiles" tile on the PDF page; each built from the latest real result of its module **at or before** the report's generation time:

| Tile | Shows when measured | Source (VERIFY) | Not measured shows |
|---|---|---|---|
| Business identity | "ABN 17 701 710 947 · Active · Astorio Group Pty Ltd · verified on the Australian Business Register <date>" with a link to the public ABR record; ".au domain: yes"; "Wikipedia (AU): no article found (searched <date>)" | `lib/brand-entity/abn-lookup.ts`, `wikipedia-au.ts`, latest technical audit's entity findings | "ABN not checked: add the business's ABN in brand settings" (or the ABN suggestion, 8.8.6) |
| YouTube | "Channel found: <title> · <n> videos · last upload <date>" | `youtube_presence_audits` latest row with `check_status` measured | "No channel linked" / "Couldn't check (<reason>)" / "Channel found but its website doesn't match yours" (existing sub-states) |
| AI crawlers | Access: "Search crawlers allowed: OAI-SearchBot, Claude-SearchBot, PerplexityBot, Googlebot" and any blocked, from the robots.txt check (training crawlers listed as "your choice"). Visits (only when log or CDN data exists): visits in the last 30 days by crawler | `lib/robots-txt/analyze.ts` results in the latest technical audit; `crawler_visit_logs` | Access always measurable when the site is reachable; visits: "Not measured: upload server logs or connect CDN Shield" |
| Website technical score | "40 of 74 · scoring updated 20 Nov 2026" plus the two weakest checks | Latest technical audit with its own maximum (`compositeMaxFor`) | "No technical audit yet" |
| Your directory profiles (PDF only) | "Linked {n} of {m} directories AI cites for your questions", then per directory: linked or not, and how often AI cited it in the basis audit | Basis audit citations over `directory_registry` (S0) + the brand's directory links (existing store, VERIFY; S7 adds confirmed listing matches) | "No profiles linked yet" + the directories AI cited |

Rules:
- Each tile prints its own check date. If older than 30 days before the report date, it adds "Last checked <date>, may be out of date".
- A footer line on the page: "These checks are separate from the Visibility score and don't change it."
- S1 Part 1 verifies each module produces real measurements in production (YouTube real lookups, ABN real ABR calls with `ABN_LOOKUP_GUID` working, robots real). A module that is still a stub is shown as "Not measured yet" and is not described as checked.
- The audit page gets the same four tiles in a "Beyond AI answers" card for every plan; the client portal shows them read-only. In PDFs the page appears in **Enhanced** reports only (8.1.7).

#### 8.1.5 New finding rules (T5) in `report-findings.ts` and the audit page

| Rule | Condition | Finding text (example) | Evidence |
|---|---|---|---|
| g. Others are named instead | Brand mentioned in ≤ 10% of everyday answers and ≥ 50% of everyday answers name or cite other businesses | "AI recommends other providers: the sites it cited most were kangaroo-it.com.au (9 answers), crystaltec.com.au (6), suretech… (5)" | Counts of cited business domains (non-directory domains from `citations`) in everyday answers |
| h. AI couldn't find the business | In questions that name the business, at least one engine's answer contains an explicit "couldn't find information" statement | "Claude couldn't find information about TechCore IT: 'I was unable to find any verified information about a company specifically called TechCoreIT'" | The quoted sentence (≤ 200 chars), engine, question |
| i. Directories you're not on | Existing directory rule, now over `directory_registry` (all kinds) | "Local Business Guide cited in 14 of 40 answers; your profile: Not linked yet" | Directory counts |
| j. Identity not verified | Beyond-AI data: ABN not verified, or no Google Business Profile linked | "Your ABN isn't verified yet; AI engines read the ABR (ChatGPT cited abr.business.gov.au)" | ABN status; citation of abr.business.gov.au if present |

- Rule h's detector is a phrase list (appendix C) matched case-insensitively within answers to branded questions; the quote is the matched sentence. No model judgement, so it stays evidence-based.
- Rule g distinguishes business sites from directories using `directory_registry`; social and maps domains are excluded.
- These rules also create Action Center items (dimension "frequency" or "source", never context or sentiment), so the 0% audit page shows recommended actions instead of "0 from this audit".

#### 8.1.6 Client portal reports
The client portal lists the brand's generated reports (date, period, basis audit, download), using the stored PDF and snapshot. Portal access rules unchanged (invite token, brand access).

#### 8.1.7 Report tiers: Basic, Standard, Enhanced (R6)

**Purpose.** Agencies sell AI visibility reports to their own clients at different prices. Vunnara offers three depths of the same report; each workspace's plan sets the deepest tier it can generate, and agencies pick the tier for each report.

**What each tier contains** (all built from the same basis audit and the same data functions; nothing is calculated twice):

| PDF content | Basic | Standard | Enhanced |
|---|---|---|---|
| Today's pages: Cover, Summary (plus the reach row when the brand has more than one reach), Engine by engine, Google Search AI, Where AI looks, Competitors, Over time, Method and notes | ✓ | ✓ | ✓ |
| Findings: why the score is what it is (rules a–j; never "No finding rule matched") | ✓ on the Diagnosis page as today | ✓ | ✓ |
| Prioritised list on the Over time page, general advice backed by evidence | ✓ as today | Moved into "What to do next" | Moved into "What to do next" |
| **What to do next** (8.1.3): measured actions with evidence lines, priority and status; done since the last report; recommended by the agency and notes (Agency and up); general advice under its own label | — | ✓ | ✓ |
| **Beyond AI answers** (8.1.4): business identity and ABN, YouTube, AI crawler access (and visits when logs exist), website technical, your directory profiles | — | — | ✓ |

A Basic report is today's report, corrected (non-regression N15). With `report_v2` off, every report is today's report.

**Plans** (decision D-RT1, agreed with Sri 21 Nov 2026), from `tiers.ts` `maxReportTier`:

| Plan | Tiers it can generate |
|---|---|
| Free, Starter | None (as today; D-RT1 revised) |
| Growth | Basic, Standard |
| Agency, Agency Pro, Enterprise | Basic, Standard, Enhanced, chosen per report (D-RT2, agreed) |

**Choosing the tier** (P08). The report contents panel opens with a three-option picker. Default: the brand's last choice (`report_brand_preferences.default_tier`), else the plan's highest tier. Tiers above the plan show a lock with the plan name and an Upgrade link (in the app only). The outline on the right updates as the tier changes, and the button reads "Generate {tierName} report".

**Server enforcement.** The existing generate route (`{ periodLabel?, periodType }`; the server picks the basis audit) gains `tier` and `contents`. The server checks `tier <= maxReportTier(plan)` and returns 402 with code `report_tier_not_in_plan` otherwise. The server computes the page set from the tier; contents a tier doesn't include are dropped even if the request sends them. The snapshot (appendix D) stores `tier`, `tierName`, the page set and the check results it printed. Rendering and "Try again" use the snapshot for reports generated after S1 (tier included), so a later plan change never alters them; reports from before S1 keep today's rebuild from live data. Scheduled reports (`report_delivery_schedules`) store a tier; `generate-narrative-report` reads it and caps it at the plan when it runs (the cap is logged for operators).

**Enhanced checks before rendering** (decision D-RT4, default). When the tier is Enhanced, the render job first refreshes checks older than their window, then renders:

| Check | Window | How |
|---|---|---|
| Business identity (ABN, .au, Wikipedia) | 30 days | Existing entity check; ABR calls are free (counted in `/admin/costs`) |
| AI crawler access (robots.txt) | 7 days | Existing robots analysis (one fetch through the existing fetcher) |
| YouTube | 7 days | Existing presence check, when a channel is linked |
| Website technical | 30 days | Existing technical audit runner |
| Your directory profiles | — | Read from the basis audit; no new calls |
| AI crawler visits | — | Never fetched; shown only when uploaded logs or CDN data exist |

Rules: one refresh per brand at a time (Inngest concurrency key `brand_id`); the whole refresh step times out after 5 minutes; a check that fails or times out prints "Couldn't check on {date}: {reason}" on its tile and the report still renders; anything still older than 30 days prints "Last checked {date}, may be out of date" (8.1.4). P08 lists each check with its age and whether it will be reused or re-run.

**Tier names** (decision D-RT3, default; P18). Agency and up can rename the three tiers in Report branding (`/settings/report-branding`, stored on the workspace row of `agency_brand_assets`) (e.g. "Essentials", "Growth Plan", "Premium Audit"), stored in `report_tier_names`. Names appear on the PDF cover (above the title, Agency and up only), in the brand's reports list (P17), in P08 and in the client portal (P13). Other plans see the default names in the app and no tier name on the cover.

**No upsell inside a PDF.** A Basic or Standard PDF never mentions higher tiers, prices or Vunnara plans; an agency's client must never see a sales message in the agency's branded report. Upgrade prompts live in the app (P08 locks, P17).

**Public claims.** The pricing page comparison table gains a "Reports" row through `tiers.ts` (setting-aware: shown only while `report_v2` is on): Growth "Basic and Standard"; Agency plans "Basic, Standard and Enhanced, chosen per client report, with your own names". A footnote states what each tier contains in the words of appendix E. No prices are added for tiers: they are part of the plans.

**Observability.** `report_generated` logs tier and plan; `/admin/costs` shows Enhanced refresh calls by check; operators see reports per tier per plan (to learn which tiers agencies sell).

#### 8.1.8 Acceptance
- Hero #54 and Omega #55 reports: same figures as today on unchanged pages; new pages render; TechCore #52 report shows findings f, g, h, i and a non-empty "What to do next".
- Editing an action after generating does not change the generated PDF on re-render.
- Growth sees the section uncurated; Agency sees the panel.
- Tiers: Free and Starter still have no reports; Growth gets 402 for Enhanced; Agency generates all three for the same audit; each PDF contains exactly its tier's pages; a Basic PDF passes N15.
- An Enhanced report re-runs only checks older than their window (fixture clock) and still renders when a check fails or times out.
- Renamed tiers show on the cover (Agency and up), in the reports list and in the portal; no Basic or Standard PDF mentions another tier.

---

### 8.2 Question library, sets and versions (C2b, C4) — sprint S2

#### 8.2.1 Behaviour
- Every brand has a **library** (`brand_questions`) and a **current question set** (`brand_question_sets` with items). Audits ask the current set.
- After the S2 backfill every brand's set v1 is exactly its stored `prompt_pack`, so N1–N3 hold.
- `getAuditPrompts(brand)` becomes: read the current set's items in position order → `[{ text, kind, reach, questionId }]`. If none, run today's logic unchanged (and log a warning metric). Both runners call the same function (fixes the old divergence between the inline and Inngest runners).
- When an audit starts, it records `audits.question_set_id`; each citation and failure row records `question_id`.
- `audits.question_set_hash` keeps being computed exactly as today from the asked everyday questions; it equals the set's `comparison_hash` by construction.

#### 8.2.2 The Questions tab (P02), read-only in S2
- Location: brand page tab "Questions" (and a tile on the brand overview).
- Shows the current set grouped by reach (only Local until S4), each question with: text, kind ("Everyday" or "Names your business · not scored"), source badge ("Original set", later "AI-suggested", "Written by <agency>"), service and place (when known), last result ("Named by 2 of 4 engines last audit", from `citations`), and status.
- Header: "Version 1 · applied <date> · 10 everyday + 3 that name your business · comparing since audit #N".
- "Suggestions" section: AI suggestions generated from today's templates for the brand's category and place (`source = 'template'`, `status = 'suggested'`) so S2 already shows alternatives; they can't be applied until S3.

#### 8.2.3 Comparability
- Trends, "change since last audit" and alerts compare audits only when their `question_set_hash` matches (unchanged rule).
- Changing the set creates a new version; the UI says "This starts a new comparison. Audits #50–#54 stay in your history; the trend restarts from the next audit."

---

### 8.3 Agency-written questions, editing, Questions settings page, plan limits (C2b, C4) — sprint S3

#### 8.3.1 Editing flow (P02 edit mode, P03 add drawer, P04 apply modal)
1. "Edit questions" opens a **draft** (client state persisted in `sessionStorage` as a convenience, server-validated on apply).
2. The user can: add a question (drawer), swap a question for a suggestion, remove a question from the set, reorder, archive a question from the library, set the count within the plan.
3. A sticky bar shows "+2 added · −1 removed · 11 of 13 everyday slots" and "Apply from the next audit".
4. Apply opens the confirmation modal: what changes, the new-comparison notice, and "Apply". The server re-validates everything and creates set version n+1 in one transaction (insert questions, insert set, insert items, flip `is_current`), using `select … for update` on the brand's current set row to prevent concurrent applies. An audit already running keeps the version it started with; the next scheduled or manual audit uses the new one.

#### 8.3.2 Adding a question: checks (live as the user types, re-run on the server)

| Check | Rule | Blocking |
|---|---|---|
| Length | 10–200 characters | Yes |
| One question | One sentence ending in "?", no line breaks | Yes |
| No links or contact details | No URL, email or phone pattern | Yes |
| Duplicate | `question_text_key` matches a live question in the library | Yes |
| Names the business | Brand name, domain or alias appears (normalised) → kind = branded, "Names your business · not scored"; at most 5 branded in the set (D-QI-BR) | Yes beyond 5 |
| Place | No place from the brand's reaches in the text → warn and offer the button Add "in {place}" (one click adds the reach's main area or city) unless reach = global | No |
| Instruction-like | Starts with "ignore", "you are", "pretend", contains "system prompt" or similar (appendix C) → flagged | Yes |
| Competitor named | A configured competitor's name appears → "Comparison question" (allowed, counted as everyday only if the brand isn't named) | No |

#### 8.3.3 Disclosure and split score (decision D2, default as recommended)
- Audit page, PDF method page and portal: "13 questions: 10 everyday (7 AI-suggested, 3 written by Splice Marketing) and 3 that name the business."
- Under the headline: "AI-suggested questions: 30% (6 of 20) · Written by Splice Marketing: 10% (1 of 10)" whenever both sources exist. The headline itself counts all everyday questions.

#### 8.3.4 Workspace → Questions settings page (P05) — the separate page the client asked for
- Route `/settings/questions` (workspace settings group). Visible to owners and admins (existing settings rule); plan-gated actions.
- Table of every brand: brand, reaches, everyday questions (active / allowed), written by agency, last change, version, "Edit questions" link to the brand's tab.
- Defaults for new brands: number of everyday questions (within plan), whether AI suggestions fill empty slots, default reach (Local, fixed in S3; editable in S4).
- "Copy questions from another brand": pick source brand → its questions are copied into the target's library as `source = 'agency'` suggestions, places replaced by the target's places where they match the source's places; the user reviews and applies. Copies are copies (brand-specific rule).

#### 8.3.5 Plan limits (server-enforced; `tiers.ts`)

| Plan | Everyday questions included | Branded (not scored; D-QI-BR) | Write own | Reaches | Packs |
|---|---|---|---|---|---|
| Free | As today, fixed | As today | No | Local | No |
| Starter | 10 | Up to 5 | No (choose among suggestions) | 1 | No |
| Growth | 10 | Up to 5 | Yes | 2 | +10 per pack |
| Agency | 10 | Up to 5 | Yes | 4 | +10 per pack |
| Agency Pro | 10 | Up to 5 | Yes | 4 | +10 per pack |
| Enterprise | By arrangement | Up to 5 | Yes | 4 | By arrangement |

A brand can run fewer everyday questions, down to 5; the confidence range widens and says so. Limits are checked on apply and again when an audit starts (`assertQuestionLimits`), returning 402 with a plain message and an upgrade link.

#### 8.3.6 Questions on the confirm screen (C4)
Before the website analysis exists (S6), the existing "Confirm your business details" screen gains a **Questions** step after the business details: it lists the questions that will be asked (from templates for the confirmed types and place), grouped by reach, with swap-for-suggestion and, on Growth and up, "Add your own question" (the P03 drawer and checks). "Confirm and start the first audit" saves set v1 from exactly what is shown. S6 later replaces this step with P10 step 3 (same components).

#### 8.3.7 API (S3)
| Method and route | Body | Auth | Result |
|---|---|---|---|
| `GET /api/brands/:id/questions` | — | brand access | `{ set: {version, appliedAt, items[]}, library: [...], suggestions: [...], limits }` |
| `POST /api/brands/:id/questions/validate` | `{ text, reach }` | `edit_brand_data` (owners, admins, analysts) | `{ ok, kind, checks[] }` |
| `POST /api/brands/:id/question-sets` | `{ baseVersion, items: [{questionId?|text, reach, position}], count }` | `edit_brand_data` | 201 `{ version }`; 409 if `baseVersion` isn't current; 402 over limit; 422 failed checks |
| `POST /api/brands/:id/questions/:qid/archive` | — | `edit_brand_data` | 200; 409 if in current set |
| `POST /api/brands/:id/questions/copy-from` | `{ sourceBrandId }` | `edit_brand_data`, same workspace | 200 `{ added }` |

All routes run inside the request's RLS context; brand access via the existing `assertBrandAccess`.

---

### 8.4 Visibility reach (R1, R2, R5, T4) — sprint S4

#### 8.4.1 Model
- Reaches: `local`, `state`, `country`, `global`. A brand has 1–4 enabled reaches; **`local` is enabled for every brand by default** and its place comes from the location entered when the brand is added (today's behaviour).
- The client turns other reaches on in brand settings (P01, "Where do you want to be visible?"), within the plan's reach limit (Starter 1, Growth 2, Agency and up 4; decision D-QI8 agreed).
- Vunnara may suggest reaches (from the profile's reach signals in S6, or from `business_types.default_reach` in S5) as a dismissible prompt; it never enables one by itself.
- Each enabled reach has a `target_count`; the sum of everyday targets ≤ the plan's everyday limit (plus packs). Default split when the user adds reaches: keep at least 4 Local, share the rest evenly; the user can change it. A reach with fewer than 5 questions shows "small sample" beside its figure.

#### 8.4.2 Places per market (`lib/markets/`)
- `lib/markets/au.ts`: states and territories with names, abbreviations and capitals (NSW → Sydney, VIC → Melbourne, QLD → Brisbane, WA → Perth, SA → Adelaide, TAS → Hobart, ACT → Canberra, NT → Darwin), country "Australia" / "Australian", DataForSEO location names, phrasing rules (state written as the abbreviation for NSW, VIC, QLD, WA, SA, ACT, NT and as "Tasmania" for TAS in questions; configurable).
- `lib/markets/us.ts` stub with the same interface and no data (filled when the US launches); a guard test ensures no AU-specific string is hard-coded outside `lib/markets/au.ts` in the reach code.

#### 8.4.3 Questions per reach
- Template families (per business type, S5; per legacy category before S5) gain reach variants with `{place}`:
  - local: "Best {service} for small businesses in {city_or_area}?"
  - state: "Who offers {service} for small businesses in {state}?"
  - country: "Best {service} for Australian small businesses?" / "… in Australia?"
  - global: "Which companies provide {service} for small businesses?"
- Generation fills each reach's `target_count` from its family, then the writer (S6) replaces templates with profile-based questions.
- Every question except global names its place in the words, because Gemini can't take a location setting.

#### 8.4.4 Engine location per reach (`lib/llm/web-search-config.ts`, VERIFY provider parameters at build time)

| Reach | ChatGPT (OpenAI web search `user_location`) | Claude (web search tool `user_location`) | Perplexity | Gemini |
|---|---|---|---|---|
| local | city, region, country | city, region, country | country + approximate city coordinates if supported | place in the words only |
| state | region (state), country; city = capital | region, country | country | words only |
| country | country | country | country | words only |
| global | none | none | none | words only |

The exact parameter names are confirmed against each provider's current documentation in S4 Part 1 and quoted in a code comment with the link. Cache keys for answers include the reach and location so a Local answer is never replayed for a Country question.

#### 8.4.5 Google AI per reach (`google-surfaces.ts`, `location.ts`)
- local: as today (postcode → suburb → city → state capital, labelled).
- state: DataForSEO location for the state if it exists in DataForSEO's locations list; otherwise the state capital, labelled "Checked from Sydney, as NSW".
- country: Australia.
- global: not run (decision D-QI7 agreed); the Google section says "Worldwide questions are measured on the four AI engines only." (customer-facing word for `global` is "Worldwide" everywhere)
- The per-audit cost ceiling scales with the number of questions checked.

#### 8.4.6 Scoring and display
- **Per reach:** mentioned ÷ successful everyday answers in that reach, with a 95% Wilson interval (the method already used, VERIFY) and the answer count. Stored in `audit_reach_results`.
- **Headline:** all enabled reaches combined (decision D-QI9 agreed), labelled with the reaches it covers ("across Local, NSW and Australia"). For a Local-only brand the number is identical to today; the label reads "Local · Sydney".
- **"Where AI recommends you" row** (P07, P09): one tile per enabled reach: "Local · Sydney 30% (12 of 40)", "NSW 10% (2 of 20)", "Australia 0% (0 of 20)".
- Responses tab, per-engine table, Google section and competitors are grouped by reach.
- **Trends** compare a reach only with the same reach and the same `reach_hash`. Changing reaches starts a new comparison for the reaches that changed.

#### 8.4.7 API (S4)
| Method and route | Body | Result |
|---|---|---|
| `GET /api/brands/:id/reaches` | — | enabled reaches, places, targets, plan limit, suggestions |
| `PUT /api/brands/:id/reaches` | `{ reaches: [{reach, enabled, place, targetCount}] }` | 200 and a draft of new questions for added reaches, which goes through the S3 apply flow; 402 over plan limit; 422 invalid place |

#### 8.4.8 Acceptance
- Every existing brand: one Local reach, same questions, same headline, same trend.
- A test brand with Local + NSW + Australia: correct place words, engine location settings per reach, per-reach figures, Google skipped for Global, report row correct.


### 8.5 Business types: specific, custom, and better over time (C3, C5, T1) — sprint S5

#### 8.5.1 Taxonomy
- Three levels: **sector** (about 12) → **business type** (180–250 at launch) → **services** (5–30 per type). Seeded by migration 0158 from `db/seed/taxonomy/au-v1.json`, which is reviewed by Sri before the migration is written (S5 Part 1 produces the file and stops for review). Appendix A lists the sectors and the minimum types, including the IT and professional-services group TechCore IT needed.
- Each type has an ANZSIC 2006 class where one fits (`industry_code`), plain customer-facing names ("Plumber", "Managed IT services provider"), aliases ("sparky" → Electrician, "MSP" → Managed IT services provider), a default buyer, a default reach (Local for trades and clinics; State/Country suggestions for remote services; never auto-enabled), a template family, and its services.
- Every current `CATEGORY_KEYS` entry maps to at least one type through `legacy_category_keys` (a sync test fails if any key is unmapped).

#### 8.5.2 Picking a type (P06 wizard step 2, P10 confirm screen)
- Wizard step 2 "What does the business do?" becomes a combobox (keyboard operable, ARIA combobox pattern): matches type names, aliases and service names; shows the sector beneath each match; quick-pick sector chips below; the four existing cards remain as shortcuts that pre-filter by sector.
- Several types allowed; one main. Omega: Plumber (main), Electrician, Handyman.
- Confirm screen: detected types first (with confidence shown as High/Medium/Low, not a number), grouped by sector, plus search to add; "Fewer types" pattern kept.
- Brand settings "Kind of business" becomes the same picker (replacing the single select that showed "SaaS").

#### 8.5.3 Classification uses the taxonomy
- `classify-brand.ts` prompt receives the candidate list (type slugs with names and aliases, filtered by sector keywords to stay under ~150 entries) and must return slugs from it with confidence; output validated against the list. Below 0.7 → user is asked (existing threshold).
- `classification.category` is still written (mapped back from the type's `legacy_category_keys[0]`) so every existing reader keeps working until it is migrated.

#### 8.5.4 Custom types (Growth and up; limits 5 / 20 / unlimited)
- "Can't find it? Add a custom type" in the combobox → modal (P11): name, parent sector (required), closest existing type (optional), one-line description, services (chips).
- Visible only inside the workspace, badge "Custom". Question generation uses the parent type's template family plus the custom services and description.
- Editable and archivable on `/settings/business-types`.

#### 8.5.5 Getting better over time, safely
1. Every confirmation writes `classification_feedback` (detected vs chosen), inside the workspace.
2. Within a workspace, its custom types and its past choices for similar domains rank first.
3. Nightly `refresh_taxonomy_signals()` stores only aggregates seen in ≥ 3 workspaces: custom type names, detected→chosen corrections, new alias candidates.
4. `/admin/taxonomy` (operators only) lists them with counts; an operator can promote a candidate to a global type or alias through a reviewed migration-style change (S5 writes a `db/taxonomy-changes/` file plus a run1–run4 set; no live editing in production in v1).
5. Accuracy metric on `/admin/taxonomy`: share of new brands in the last 30 days where the top detected type was kept as main.
No model is trained on customer data; improvement happens through the taxonomy and prompts.

---

### 8.6 Question intelligence layers (C2a) — sprints S6–S9

The full rationale is in the design doc "Vunnara question intelligence: layer-by-layer design" (`docs/lld/design/Vunnara-question-intelligence-design-v3.pdf`). This section is the build spec.

#### 8.6.1 Pipeline and jobs

| Inngest function (new) | Event | Steps | Concurrency |
|---|---|---|---|
| `analysis-run` | `brand/analysis.requested` `{brandId, trigger}` | `fetch-plan` → `fetch-pages` → `extract` → `listings` (S7) → `demand` (S8) → `competitors` (S8) → `merge` → `generate` → `score` → `pretest` (S8) → `finalise` | key `organizationId`, limit 2; key `brandId`, limit 1 |
| `analysis-website-drift` | cron weekly | per brand: sitemap + home fingerprint; on change, send `brand/analysis.requested` with `website_changed` (suggestions only) | limit 5 |
| `question-results-compute` | `audit.complete` (joins `POST_AUDIT_POOL`, account-wide limit 1) | compute `question_results` and weak flags | key `brandId`, limit 1 |

Each step stores its status in `analysis_runs.layers` so the progress screen (P12) shows live state. A failed layer marks the run `partial`; later layers use whatever exists. Costs are recorded per step and stop paid steps at the ceiling (decision D-QI5, default US$0.50).

#### 8.6.2 Guarded fetcher (`lib/fetch/guarded-fetch.ts`, built in S00B) — security gate
Every server-side fetch of a URL that comes from customer input goes through `guardedFetch`. As built in S00B: the inventory, each caller's options and the commit it moved in are in `docs/lld/fetch-inventory.md` (amendments 19 and 29).
- **Always on, for every caller:** `http:` and `https:` only; ports 80 and 443 only; no credentials in the URL. The host is resolved once and every answer checked (one private answer refuses the host). Refused: private, loopback, link-local, CGNAT, multicast, broadcast, unspecified, reserved, documentation and benchmarking ranges; IPv6 ULA, link-local and site-local; IPv4-mapped and IPv4-compatible; NAT64 or 6to4 carrying a blocked IPv4; Teredo; cloud metadata (169.254.169.254, fd00:ec2::254, 100.100.100.200, `metadata.google.internal`); `localhost`, `*.local`, `*.internal`; IP literals in every notation. The connection is pinned to the checked address with the original Host and SNI (no second lookup, so DNS rebinding can't switch targets). Every redirect is checked again from the start. Hard caps of 60 s and 50 MB, whatever a caller asks.
- **Per caller (options):** user agent; timeout (the whole exchange, plus an optional headers-only limit); redirect mode and limit; byte limit; allowed content types; `obeyRobots`; per-host pace; `allowHttp`. Existing callers keep the behaviour they had before S00B (robots.txt and pace off; `http:` links and redirects followed as before), with a size bound added where they had none.
- **Refusals:** a `GuardedFetchError` with a code (`blocked_address`, `blocked_scheme`, `blocked_port`, `blocked_credentials`, `too_many_redirects`, `too_large`, `timeout`, `bad_content_type`, `blocked_by_robots`), logged with the host and reason only (no path, query, address or content). Each caller's existing "couldn't reach" path handles it.
- **robots.txt (`obeyRobots`):** the bot's own group, then `*` (`lib/robots-txt/evaluate.ts`); a 4xx robots.txt allows everything, a 5xx or no answer disallows everything (RFC 9309 2.3.1); cached 10 minutes per origin and user agent.
- **Analysis preset (new S06+ callers):** user agent `Vunnara-Audit-Bot/1.0 (+https://vunnara.com.au/about)`; `obeyRobots: true`; one request per second per host across all instances (the shared rate limiter, not only the in-process pace option); `maxRedirects: 3`; `timeoutMs: 10_000`; `maxBytes: 2 MB`; HTML and XHTML only (plain text for robots.txt, XML for sitemaps); `allowHttp: false`. One shared preset that callers can't weaken.
- **Implementation:** the exchange is Node's `fetch` (`redirect: 'manual'`) with an undici 7 dispatcher whose connect lookup is the guard's (dependency `undici` 7.27.2). IP literals are checked before `fetch` on every hop, because Node never calls a lookup for one. `lib/fetch` reads no environment variable and exposes no switch; tests reach a local server only by mocking the transport module.
- **Guard:** `tests/unit/fetch/no-unguarded-fetch.test.ts` fails when server code outside `lib/fetch` calls `fetch` (or undici, `node:http(s)`, axios, got, node-fetch, cross-fetch), except the named fixed-host clients, each listed with its file, host, reason and exact call count.

#### 8.6.3 Layer 1: website (S6)
1. Read robots.txt, sitemap(s) (first 500 URLs), home page links.
2. Score URLs and link text against service words (taxonomy services and aliases for the brand's types), area words (suburb names, "areas", "locations"), about/contact. Take home + top 10.
3. Fetch via the guarded fetcher; cache in `page_cache` 7 days by URL fingerprint.
4. Extract main content (strip nav, footer, scripts); read JSON-LD `LocalBusiness`/`Organization` (`areaServed`, `makesOffer`, `hasOfferCatalog`, `address`, `telephone`).
5. Model extraction against a fixed JSON schema (services, places with kind, attributes: emergency, after hours, 24/7, remote, interstate, licensed, residential, commercial; customer type; reach signals). Page text is passed inside delimiters with the instruction that it is data; output validated with zod; non-conforming output discarded.
6. **Quote verification:** every item must include `quote` and `url`; the quote is normalised (whitespace, quotes, dashes) and must appear in that page's extracted text, else the item is dropped.
7. Normalise services to `business_type_services` (aliases); unmatched kept as plain text.
8. Prominence: own page + heading = high; listed = medium; single mention = low.
9. Reach signals: street address / suburb list → local; "Australia-wide", "interstate", "nationally", several state names → state/country; "worldwide", "international", other currencies → global. Stored as `reach_signal` evidence (TechCore IT: "Work is mostly remote and we serve interstate clients").
10. If extracted text < 150 words: record "This site needs JavaScript to show its content" (decision D-QI1: no rendering in v1).

#### 8.6.4 Layer 2: listings (S7)
- Two DataForSEO Google searches: "<name> <suburb or city>" and "<name> <domain>"; keep results whose domain matches `directory_registry`; read the local pack for the Google Business Profile.
- Match confidence from name similarity plus phone, postcode or website link on the listing; only strong matches offered as "Is this your <directory> profile?" (P10). Weak matches dropped.
- Read profile pages only where robots.txt allows (one page per directory, guarded fetcher); else use the search result's title and snippet as weaker evidence (decision D-QI2).
- Confirmed links are saved into the existing directory-links store in brand settings (VERIFY store), which also fills the audits' "Your profile: cited / not cited".

#### 8.6.5 Layer 5: write, filter, score, choose (S6; demand and pre-test added in S8)
- Candidates: for top services (prominence, later demand) × intents (best, reviews, price, near, problem from "People also ask", emergency only if the profile says so) × places per enabled reach; about 3× the reach's target.
- Hard filters: names the business/domain/alias; no place (except global); not one question or outside 30–160 chars; how-to rather than who-to-use; duplicate (`question_text_key`) or near-duplicate (token Jaccard ≥ 0.8 with a stronger candidate).
- Score: `0.35·R + 0.30·D + 0.25·K + 0.10·S` (relevance, demand, recommends-businesses, specificity), each 0–1; D = 0.5 until S8; K from a model judgement until the pre-test replaces it. Weights versioned (`weights: "v1"`), tuned on the evaluation set.
- Choose per reach with balance: each high/medium service at least one question; no service more than 3 of 10; at least 3 intents; within Local at least half use the main city/suburb.
- Reasons stored per question (`reasons` jsonb): `[{"type":"service","label":"Microsoft 365","source":"website","url":"/services"}, {"type":"demand","label":"High"}, {"type":"phrasing","source":"people_also_ask"}, {"type":"pretest","label":"Named 3 businesses"}]`.

#### 8.6.6 Layer 6: confirm (S6, P10)
Three steps: **Your services** (sources, demand, tick/untick/add, competitor suggestions "Do you also offer…?"), **Where you work** (base and served places with quotes; reach switches with Local fixed on), **Your questions** (chosen set with "Why this question" chips; swap, add own on Growth+, count). "Confirm and start the first audit" saves the profile as confirmed and applies set v1 (new brand) or v n+1 ("Improve my questions" on an existing brand, with the new-comparison notice). Defaults pre-ticked so a busy owner confirms in under a minute.

#### 8.6.7 Layers 3, 4 and pre-test (S8)
- Demand: seeds = confirmed services × each reach's place; one Google Ads search-volume request for all seeds (≤ 1,000 per request, priced per request; 12 requests/min per account → global queue); autocomplete and "People also ask" for the top 3 services; demand per service = relative High/Medium/Low within the brand; labelled "Google search estimates (DataForSEO), region level". Cache in `search_demand_cache` 30 days, global. DataForSEO endpoints and costs confirmed in S8 Part 1 ([search volume](https://docs.dataforseo.com/v3/keywords_data/google_ads/search_volume/live/), [organic SERP with People also ask and local pack](https://docs.dataforseo.com/v3/serp/google/organic/live/advanced/)).
- Competitors: up to 3 confirmed competitors with websites; home + 3 service pages each; services offered by ≥ 2 competitors but missing → "Do you also offer…?" suggestions.
- Pre-test (decision D-QI4): chosen + 5 spares, once on the Starter low-cost engine; pass if ≥ 2 local businesses named or a directory cited; failures swapped for the best spare; never counted in any score.

#### 8.6.8 Layer 7: learning from results (S9)
- After each audit: `question_results` per question (answers, business-naming answers, brand mentioned, competitors named, directories cited).
- Weak question: business-naming rate 0 in 2 consecutive audits → flag "AI doesn't name any business here (last 2 audits)" on the row and Recommended action "AI doesn't name any business for this question" with the best spare for the same service and intent as a one-click swap (goes through the apply flow).
- Website drift weekly (8.6.1) → "Your website has changed. Review new services?"
- Cross-workspace: counts only, ≥ 3 workspaces (e.g. intent × type naming rates) to tune template weights; operator page only.

#### 8.6.9 Evaluation (gate for S6–S9)
`scripts/eval/question-intel/` runs locally (never in production) over 20 real Australian businesses with public websites listed in `eval/businesses.json` (Hero, Omega, TechCore IT with the owner's permission, 17 others chosen by Sri). Measures: question fit (blind human rating), business-naming rate vs today's questions, services found correctly (owner-confirmed where possible), services missed, questions kept. Targets: fit ≥ 90%, services correct ≥ 90%, missed ≤ 20%, kept ≥ 70%. Results committed to `docs/eval/<date>.md`. A sub-phase whose numbers miss targets stays off.

---

### 8.7 Question packs and entitlements (C2b pricing) — sprint S10
- Stripe: one add-on price per plan ("10 extra questions per brand"), billed per pack per month, quantity on the subscription; prorated. Prices set by Sri from a cost table S10 Part 1 produces from `/admin/costs` real spend per answer and each plan's audit frequency (the formula is in the client improvements design, section 5).
- Webhook updates `organizations.question_packs` (idempotent on event id, using the existing webhook hardening).
- Billing page (P14): packs owned, assigned per brand, "Buy packs" (Stripe checkout/portal), "Assign" per brand.
- Removing packs: the user picks which questions go inactive; otherwise the lowest-ranked everyday questions are removed from the next audit, through the apply flow with notice.
- Public pricing page and comparison table add "Extra questions: 10 per pack" for plans that have it, via `tiers.ts` (plan-claim guard).
- Google's per-audit cost ceiling scales with question count; the audit-start check (`assertQuestionLimits`) includes packs.

---

### 8.8 Quick fixes (T2, T3, T5–T8) — sprints S0 and S1

#### 8.8.1 Acronyms and articles in questions (T3, S0)
- `lib/prompts/phrasing.ts`: `toServicePhrase(label)` keeps a maintained acronym list in upper case (IT, AC, HVAC, CCTV, NDIS, SEO, AEO, GEO, CPA, GP, MRI, EV, VoIP, Wi-Fi, SaaS, CRM, ERP, HR, BAS, SMSF, WHS, IVF, ENT); `withArticle()` never puts "a"/"an" before a plural or uncountable service ("a good choice for managed IT services").
- `validateGeneratedQuestion` adds: no lower-case acronym from the list; no "a/an + plural noun"; no doubled spaces.
- Applied in templates, branded questions and the new writer; existing stored packs are **not** rewritten (N1). Brands get the corrected wording only when they apply a new set.

#### 8.8.2 Brand display name and aliases (T2, S0)
- When adding a brand, suggest the name from the site's `og:site_name`, the title's brand segment or the JSON-LD `name` ("TechCore IT"), not from the domain; the user can edit it.
- `brands.aliases` holds genuinely different names (detection already ignores case and spacing and checks the domain stem, so those forms are never suggested); unique ignoring case; mention detection and branded-question checks include aliases (normalised, same function).
- Brand settings shows "Also known as" chips.

#### 8.8.3 Directory registry (T6, S0)
`directory_registry` replaces the hard-coded list; seeded with the current list plus appendix B. The directories card shows any cited registry directory with its kind; unknown domains are never labelled directories.

#### 8.8.4 Findings for low or zero visibility (T5, S1) — see 8.1.5.

#### 8.8.5 General advice backed by evidence (T7, S1)
- General advice items carry `evidence_kind`: `research` (linked to a verified source in `verified-citations.ts`), `audit` (the audit cited that platform, e.g. LinkedIn cited in ≥ 3 answers), or none.
- Items with none are not shown. "Publish a how-to article on Medium" is removed unless the audit cited medium.com. LinkedIn advice shows when the audit cited LinkedIn ("LinkedIn was cited in 9 of 40 answers").

#### 8.8.6 ABN suggestion (T8, S1)
- `lib/brand-entity/abn-lookup.ts` gains `searchAbnByName(name, postcode?)` using the ABR JSON "Name Lookup" method (`MatchingNames.aspx?name=…&callback=…&guid=…`, same GUID as `AbnDetails.aspx`; [ABR JSON services](https://abr.business.gov.au/json/), [web services](https://abr.business.gov.au/Tools/WebServices)). The JSON method takes a name only, so results are filtered by postcode and state in code, then each candidate is confirmed with `AbnDetails` (status Active, entity and business names). Terms of use confirmed in S1 Part 1.
- On brand creation and in brand settings: if `abn` is empty, show "Is this your ABN? TechCore IT · Astorio Group Pty Ltd · NSW 2765 · Active" with Confirm / Not mine. Confirm writes `brands.abn` and triggers the entity check. Stored as `abn_suggestion` until answered. Australian market only.


---

## 9. Screens (prototype map)

The UI contract `vunnara-ui-config.ts` specifies every screen: nodes with exact copy, data and behaviour, all states (loading, empty, error, no permission, plan lock, flag off and screen-specific ones), interactions, APIs, accessibility, responsive rules and acceptance checks. `client-enhancements-v2.html` is rendered from the same data and shows each screen at 1240 px and 390 px. Where the contract and this LLD's prose differ on UI, the contract wins (it resolves 24 differences between prototype v1, this LLD and the sprint prompts, listed as C-01 to C-24). It uses the app's existing visual language: S00 Part 0b maps every token and component to the app (`docs/prototypes/token-map.md`) and adds only the four new tokens (`--border-control`, `--agency`, `--agency-tint`, `--on-status`); no second design system. Every screen works at 390 px and meets WCAG 2.2 AA in both themes, including 3:1 control boundaries (decision D-UI1).

| Id | Screen | Route | Sprint |
|---|---|---|---|
| P00 | Design tokens and components | — | all |
| P01 | Brand settings: "Where do you want to be visible?" (reach) + "Also known as" + ABN suggestion | `/brands/:id` settings card | S0, S1, S4 |
| P02 | Brand → Questions tab (view and edit mode, grouped by reach, draft bar) | `/brands/:id/questions` | S2, S3 |
| P03 | Add question drawer with live checks | drawer on P02 | S3 |
| P04 | Apply changes modal (new comparison notice) | modal on P02 | S3 |
| P05 | Workspace → Questions settings | `/settings/questions` | S3 |
| P06 | Add brand wizard step 2: business type search | `/brands/wizard` | S5 |
| P07 | Audit page: "Where AI recommends you", question mix, split score, findings for 0%, Beyond AI answers card | `/audits/:id` | S1, S3, S4 |
| P08 | Report contents panel with the report type picker (Basic, Standard, Enhanced) and Enhanced check freshness | `/brands/:id/reports` (panel) | S1 |
| P09 | PDF pages: cover tier name; Why and what to do next; Beyond AI answers (Enhanced, five tiles); reach row; method additions | PDF | S1, S4 |
| P10 | Confirm business v2 (services, where you work, questions; listing matches) | `/brands/:id` confirm | S6, S7 |
| P11 | Custom business type modal | modal | S5 |
| P12 | Analysis progress | `/brands/:id` | S6 |
| P13 | Client portal: reports list with report type | `/client-portal/:token` | S1 |
| P14 | Billing: question packs | `/settings/billing` | S10 |
| P15 | Operator: taxonomy signals | `/admin/taxonomy` | S5 |
| P16 | Weak question flag and swap | P02 | S9 |
| P17 | Brand → Reports: report type column, status, Generate opens P08 | `/brands/:id/reports` (existing page, VERIFY) | S1 |
| P18 | Report branding → Report names (Agency and up) | existing report branding settings (VERIFY route) | S1 |

---

## 10. Scoring and comparability rules (reference)

- **Everyday answer:** a successful answer to a question whose `kind = 'everyday'`. Failed answers are shown, never counted.
- **Headline Visibility** = mentioned everyday answers ÷ successful everyday answers, across all enabled reaches, labelled with the reaches. Identical to today for Local-only brands.
- **Per reach** = the same ratio within one reach; 95% interval as today (Wilson, VERIFY); "small sample" when the reach has < 5 questions.
- **By source** (shown only when both exist): the same ratio restricted to AI-suggested/original/template questions vs agency-written ones.
- **Comparable audits:** equal `question_set_hash` (overall) or equal `reach_hash` (per reach); excluded audits never compared; partial audits drawn hollow as today.
- **Google AI:** never in the headline; per reach where run; never for Global.
- **Technical, entity, YouTube, crawlers:** never in the headline; their own dates.

---

## 11. Security

| Threat | Control | Test |
|---|---|---|
| Cross-workspace data access | FORCE RLS on every new org table; routes use `assertBrandAccess`; no new `serviceDb` in request paths | RLS guard suite extended with every new table; cross-org e2e (05) extended to questions, reaches, reports |
| SSRF through website analysis | Guarded fetcher (8.6.2) | Unit tests per blocked class; DNS-rebinding test; redirect-to-private test |
| Prompt injection from websites or agency questions | Page text delimited and treated as data; schema-validated outputs; quotes verified; agency questions screened (8.3.2) and sent to engines as the user message only | Injection fixtures in extraction tests; validator tests |
| Stored XSS via agency text (questions, notes, custom types, actions, tier names) | Escaped everywhere (React default; react-pdf text only; emails escaped); length limits; no HTML accepted | Render tests with `<script>` and markdown payloads |
| Plan bypass | Limits enforced on the server at apply and at audit start; report tier checked on the server against `maxReportTier` and the page set derived on the server from the tier | Route tests for 402 (questions, packs, report tiers) |
| Concurrent applies | Row lock on the current set; `baseVersion` check → 409 | Concurrency test |
| Cost abuse | Re-analysis ≤ 3/day per brand; per-run cost ceiling; per-workspace concurrency 2 | Rate-limit tests (Upstash) |
| Cross-workspace learning leaks | Aggregates only, k ≥ 3 workspaces, no names/URLs/text beyond normalised type names | Function test with 2 vs 3 workspaces |

## 12. Privacy

- `data-facts.ts`, the FAQ "Is my data safe?" and `docs/privacy-policy-draft.md` add: pages and listings read for analysis (public pages only), what is stored (profile, evidence quotes ≤ 300 chars, page text cache 7 days), DataForSEO receiving generic service-and-place phrases for demand (never the business name) and business-name searches for listings, ABR name lookups, retention (deleted with the brand; 12-month retention job).
- All new data types added to the weekly retention job and the brand deletion cascade; tests prove deletion.

## 13. Performance and scale

| Path | Budget | How |
|---|---|---|
| Questions tab load | p95 < 300 ms server | One query joining current set items, library and last results (`citations` aggregated by `question_id` for the latest audit via index); no per-question queries |
| Audit page reach row | p95 < 150 ms | `audit_reach_results` (PK lookup) |
| Business type search | < 50 ms client | Taxonomy shipped as a versioned static JSON (≈ 250 types), cached by version; custom types fetched per workspace |
| Report render | Unchanged ±20% | Snapshot assembled in one data step; Beyond-AI data read with 4 indexed queries |
| Analysis run | p50 < 3 min | Parallel fetch within the per-host rate; caching; capped pages |
| Audit runtime | Linear in questions | Existing engine rate limits; more questions = longer audit, shown in progress |

Indexes are listed with each table (section 7). Every new list endpoint paginates beyond 100 rows. New Inngest functions declare concurrency keys; DataForSEO Google Ads calls go through a global queue honouring 12 requests/min.

## 14. Observability and costs (operator-only)

- `/admin/costs` gains lines: "Question analysis (website, listings, demand, pre-test)", per provider, "ABR lookups" (free, counted) and "Enhanced report checks" by check.
- Reports generated per tier per plan (operator view), to learn which tiers agencies sell.
- `analysis_runs` and render failures appear in `/admin/audits`-style lists for operators; customers see plain statuses only.
- Metrics logged: fallback to `prompt_pack` (should be 0 after S2), apply conflicts (409s), limit refusals (402s), extraction items dropped by quote verification, guarded-fetch refusals by reason.

## 15. Testing strategy

Per the project rule, prompts run targeted tests (related tests, new tests RED → GREEN, typecheck, lint, named guards), compared by name with `tests/known-failures.txt` (0 entries); full suites only when Sri asks. Playwright specs listed by `scripts/qa/e2e-specs-for.ts`, one at a time, only with ≥ 6 GB free.

| Layer | What |
|---|---|
| Unit | phrasing, validators, hash parity TS vs SQL fixtures, scorer, balance chooser, reach placement, guarded fetcher, quote verifier, finding rules g–j, entitlement math |
| Integration | backfill parity on fixtures; apply flow (versions, 409, 402); audit uses current set; per-reach results; report snapshot; report tiers (402 per plan, page set per tier, Basic vs today N15, Enhanced refresh windows, timeouts, tier names); ABN suggestion with recorded ABR responses (no live calls in tests) |
| Guard (source-scan) | no AU strings outside `lib/markets/au.ts` in reach code; no context/sentiment dimensions; plan claims via `tiers.ts`; placeholders; every new org table in the RLS list; no `serviceDb` in new routes |
| E2E | questions tab view/edit/apply; reach settings; wizard type search; report contents panel; cross-org isolation on new routes; responsive shell |
| Evaluation | question intelligence evaluation set (8.6.9) |
| Production checks | each sprint's read-only diag SQL for Sri |

## 16. Rollout

1. Migration set applied in Neon → push → Inngest resync when functions changed.
2. Flag on for the Splice workspace only (`/admin/settings` workspace override, the pattern used for Google AI).
3. Sri checks Hero, Omega and TechCore IT; diag SQL results reviewed.
4. Flag on per plan as designed; public pages mention a feature only once its flag is on (setting-aware pattern).

## 17. Feature flags

Stored in the existing platform-settings store used for Google AI on `/admin/settings` (global value + workspace override + Changes log; VERIFY table name). Read through `lib/flags/flags.ts` `isEnabled(flag, orgId)`, cached per request.

| Flag | Gates | Sprint |
|---|---|---|
| `report_v2` | What to do next, Beyond AI answers, contents panel, report tiers (picker, plan limits, tier names, pricing row), portal reports | S1 |
| `abn_suggestion` | ABN name lookup prompt | S1 |
| `question_library` | The Questions tab (audits read the current set either way; see the note below) | S2 |
| `agency_questions` | Editing, writing, applying, Questions settings page | S3 |
| `visibility_reach` | Reach card, per-reach generation and results | S4 |
| `business_taxonomy` | Type picker, custom types | S5 |
| `qi_website`, `qi_listings`, `qi_demand`, `qi_competitors`, `qi_pretest`, `qi_learning` | Each layer | S6–S9 |
| `question_packs` | Packs on billing and pricing | S10 |

Note on `question_library`: from S2 onward audits always read the current set (which equals the stored pack), whether or not the tab is visible. This keeps one code path; the parity tests (N1–N3) are what make it safe.

---

## 18. Sprint plan

| Sprint | Name | Covers | Depends on | Migration | Inngest resync | Gate before the next sprint |
|---|---|---|---|---|---|---|
| S0 | Verify, quick wins, flags | As-is verification; T2, T3, T6; flag scaffold | `main` | 0153 | No | As-is report reviewed by Sri; guards green |
| S0B | Security: guarded fetcher | D-SEC1: one guarded fetch path for every existing caller | S0 | none expected | Only if a function changes | Fetcher security tests and every migrated caller's tests green |
| S1 | Report v2 and report tiers | C1, R3, R6, T5, T7, T8; portal reports | S0 | 0154 | Yes (render job, Enhanced checks) | Hero/Omega/TechCore PDFs checked in all three tiers |
| S1B | Report polish and hardening | Amendments 49–55: Enhanced checks in their own function, refresh-made technical audits, no network from tests, PDF consistency and layout, ABR privacy wording | S1 | none | Yes (new function `refresh-enhanced-checks`) | PDFs of three seeded fixtures in all three tiers reviewed by Sri; then `report_v2` on for Splice and real Hero PDFs checked |
| S2 | Question library | C2b/C4 foundation | S0 | 0155 | Yes (audit runners) | run3: hash parity; N1–N3 tests |
| S3 | Agency questions and settings page | C2b, C4, plan limits | S2 | 0156 | No | Apply flow e2e; Splice check |
| S4 | Visibility reach | S1, S2, S5, T4 | S3 | 0157 | Yes | Existing brands unchanged; 4-reach test brand |
| S5 | Business taxonomy | C3, C5, T1 | S2 (S4 recommended) | 0158 | Yes (nightly signals) | Sri reviews taxonomy seed before migration |
| S6 | Website analysis and writer (4a) | C2a layers 1, 5, 6 | S4, S5 | 0159 | Yes | Security tests; evaluation fit ≥ 90% |
| S7 | Listings (4b) | C2a layer 2 | S6 | — | Yes | No wrong profile on evaluation set |
| S8 | Demand, competitors, pre-test (4c, 4d) | C2a layers 3, 4 | S6 | 0160 | Yes | Cost under ceiling; naming rate ↑ |
| S9 | Learning (4e) | C2a layer 7 | S3, S6 | 0161 | Yes | Weak flags correct on evaluation set |
| S10 | Question packs | C2b pricing | S3, S4 | (0156 columns) | Yes (webhook) | Stripe test-mode e2e; Sri sets prices |

Sprints run one at a time, each pushed and checked in production before the next starts.

## 19. Risks

| Risk | Control |
|---|---|
| Backfill changes a brand's questions or comparability | Parity proven in run1/run3 against stored truth; fallback path; flags |
| Agencies pick easy questions | Mix disclosed; split score; branded never counted |
| Both audit runners diverge | One `getAuditPrompts`; test runs both runners on the same fixture |
| Reach multiplies cost | Questions split within the plan's total; packs priced from real cost |
| Taxonomy quality | Sri reviews the seed; aliases; accuracy metric; operator promotion only via reviewed changes |
| SSRF / injection via analysis | Guarded fetcher, quote verification, schema validation, security gate |
| Directory terms | robots.txt respected; one profile page per directory; snippets otherwise |
| Report figures drift from the audit page | Report reads the same functions as the audit page; snapshot; render tests |
| Supabase Free pausing breaks PDFs | Move to Supabase Pro before agencies rely on reports (Sri) |
| Demo instability | Every feature flagged; Splice first |

## 20. Decisions

**Agreed:** D-QI7 no Google AI for Global; D-QI8 reaches per plan 1/2/4; D-QI9 headline combines reaches and names them; Local always default; questions always brand-specific; charge for more questions.

**Defaults assumed (recommendations); confirm or change before the sprint shown:**

| Id | Decision | Default in this LLD | Needed by |
|---|---|---|---|
| D1 | Who curates report actions and adds notes | Agency and up; Growth gets "What to do next" uncurated in Standard reports (updated for tiers) | S1 |
| D-RT1 | Report tiers per plan | **Revised 22 Nov 2026:** Free and Starter none (as today); Growth Basic and Standard; Agency, Agency Pro, Enterprise all three | S1 |
| D-SEC1, D-QI-BR, D-BAND, D-GT, D-UI2–D-UI6 | See section 0.1 | **Agreed 22 Nov 2026** | S0B, S1, S2–S3, S5 |
| D-RT2 | Who picks the tier | **Agreed:** Agency plans pick per report, so agencies can sell each tier to their clients at their own price | S1 |
| D-RT3 | Tier names | Agency and up can rename the three tiers (shown on the cover, reports list, portal); others see the default names in the app only | S1 |
| D-RT4 | Enhanced check freshness | Re-run before rendering when older than: identity 30 days, AI crawler access 7, YouTube 7, technical 30; 5-minute cap; failures shown on the tile | S1 |
| D2 | Score split by question source | Yes, shown under the headline | S3 |
| D3 | Everyday questions included per plan | 10 on every paid plan; packs for more | S3 |
| D4 | Writing own questions on Starter | No (choose among suggestions) | S3 |
| D5 | Custom business types | Growth 5, Agency 20, Agency Pro unlimited | S5 |
| D6 | Taxonomy backbone | Plain names mapped to ANZSIC 2006 classes | S5 |
| D7 | Cross-workspace learning | Counts only, ≥ 3 workspaces, operator promotes | S5 |
| D8 | Pack prices | Sri sets from S10's cost table | S10 |
| D-QI1 | Render JavaScript-only sites | Not in v1; fall back to listings and demand | S6 |
| D-QI2 | Directory profile reading | Profile page where robots.txt allows, one per directory; else snippets | S7 |
| D-QI3 | Extra DataForSEO spend for demand | Yes, with global 30-day cache | S8 |
| D-QI4 | Pre-test | Yes, Starter's low-cost engine, ≤ 15 answers per run | S8 |
| D-QI5 | Cost ceiling per analysis | US$0.50, reset after 20 measured runs | S6 |
| D-QI6 | Plans with full analysis | All paid plans for new brands; "Improve my questions" from Growth | S6 |
| D12 | Cross-workspace aggregate function | SECURITY DEFINER aggregate-only function, reviewed with the operator console plan | S5 |
| D-UI1 | Control borders at 3:1 contrast (WCAG 1.4.11) | App-wide: the existing control border variable takes the `--border-control` values (visual only) | S0 |


---

## Appendix A. Taxonomy v1: sectors and minimum business types (market 'au')

S5 Part 1 turns this into `db/seed/taxonomy/au-v1.json` with services and aliases, **verifies every ANZSIC code against the ABS ANZSIC 2006 class list** (codes below are indicative and must be checked), and stops for Sri's review before writing migration 0158. Default reach is Local unless shown.

| Sector | Business types (minimum set) | Indicative ANZSIC 2006 classes |
|---|---|---|
| Trades and home services | Plumber; Gas fitter; Electrician; Air conditioning and heating; Solar and battery installer; Builder (residential); Renovations (kitchen and bathroom); Carpenter; Roofer; Concreter; Bricklayer; Tiler; Painter; Plasterer; Glazier; Landscaper; Fencing; Handyman; Locksmith; Security and alarm installer; Pest control; Cleaner (home and office); Carpet cleaning; Gardener and lawn mowing; Removalist; Pool builder and maintenance; Garage doors; Flooring; Appliance repair; Waste and skip bins | 3231, 3232, 3233, 3234, 3239, 3011, 3242, 3223, 3221, 3222, 3243, 3244, 3241, 3245, 3291, 7312, 7311, 7313, 4610, 9421 |
| Health and wellbeing | GP clinic; Dentist; Orthodontist; Physiotherapist; Chiropractor; Osteopath; Podiatrist; Psychologist; Counsellor; Optometrist; Dietitian; Speech pathologist; Occupational therapist; Massage therapist; Pharmacy; Specialist medical clinic; Radiology and imaging; NDIS provider; Aged care at home; Veterinary clinic | 8511, 8531, 8533, 8534, 8539, 8532, 8512, 8520, 8601, 6970 |
| Beauty and personal care | Hair salon; Barber; Beauty salon; Nail salon; Day spa; Cosmetic clinic; Tattoo studio | 9511 |
| Food and hospitality | Café; Restaurant; Takeaway; Pub and bar; Bakery; Caterer; Food truck; Accommodation (hotel, B&B) | 4511, 4512, 4520, 1174, 4400 |
| Fitness and recreation | Gym; Personal trainer; Yoga and pilates studio; Martial arts; Dance school; Swim school; Sports club | 9111, 8211, 9112 |
| Professional services | Accountant and bookkeeper; Tax agent; Lawyer; Conveyancer; Financial adviser; Mortgage broker; Insurance broker; Architect; Engineer (consulting); Surveyor; Business consultant; HR and recruitment; Translator | 6932, 6931, 6419, 6420, 6921, 6923, 6962, 7211 |
| IT and technology services | **Managed IT services provider**; IT support (break-fix); Cybersecurity services; Cloud and Microsoft 365 services; Network and cabling; Web design and development; Software development (custom); Computer and phone repair; Data backup and recovery; AI and automation services | 7000, 5921, 9422 |
| Marketing and creative | Digital marketing agency; SEO, AEO and GEO agency; Social media agency; Branding and design studio; Photographer; Videographer; Printing; Signage | 6940, 6991, 1611 |
| Real estate and property | Real estate agent; Property manager; Buyer's agent; Strata manager; Building inspector | 6720, 6712 |
| Automotive | Mechanic; Auto electrician; Panel beater; Tyres; Car detailing; Car dealer; Driving school | 9419, 9411, 9412, 3911, 8219 |
| Education and childcare | Childcare centre; Tutoring; Music school; Training provider (RTO); Language school | 8710, 8220, 8212, 8101 |
| Retail and local shops | Clothing; Florist; Gift shop; Hardware; Pet shop and grooming; Bike shop; Furniture; Jeweller; Bottle shop | 4251, 4274, 4231, 4259 |
| Software and online products | SaaS product (default reach Country, suggestion only); Mobile app; Online store (ecommerce); Online course | 5420, 4310 |
| Community and other | Funeral services; Church and community group; Charity; Event venue; Wedding services; Cleaning (commercial) | 9520, 9540, 9551 |

**TechCore IT** would be offered "Managed IT services provider" (main), "Cybersecurity services", "Cloud and Microsoft 365 services", "AI and automation services" and "Digital marketing agency" (from "Branding and Marketing").

Every legacy `CATEGORY_KEYS` value (28 keys, `lib/prompts/templates.ts`) maps to one of these types; S5 includes the mapping table and a sync test.

## Appendix B. Directory registry v1 additions (market 'au')

Current hard-coded list (VERIFY) plus the domains AI cited in recent audits:

| Domain pattern | Name | Kind |
|---|---|---|
| localbusinessguide.com.au | Local Business Guide | general |
| directso.com.au | Directso | general |
| whereis.com | Whereis | maps |
| cylex-australia.com | Cylex | general |
| au.nextdoor.com | Nextdoor | social |
| reviews.birdeye.com, birdeye.com | Birdeye | reviews |
| linkedin.com/company, au.linkedin.com/company | LinkedIn | professional |
| hotfrog.com.au | Hotfrog | general |
| startlocal.com.au | StartLocal | general |
| aussieweb.com.au | AussieWeb | general |
| yelp.com.au | Yelp | reviews |
| productreview.com.au | ProductReview | reviews |
| oneflare.com.au, serviceseeking.com.au, airtasker.com, hipages.com.au | (existing) | trades |
| yellowpages.com.au, localsearch.com.au, truelocal.com.au, wordofmouth.com.au | (existing) | general |
| business.google.com, google.com/maps | Google Business Profile | maps |
| healthengine.com.au, hotdoc.com.au | HealthEngine, HotDoc | health |

## Appendix C. Phrase lists

**C1. "Couldn't find the business" (finding rule h)**, matched case-insensitively in answers to questions that name the business; the containing sentence is quoted:
"unable to find any (verified )?information", "could not find any information", "couldn't find any information", "no information available (online )?about", "I don't have (any )?(specific )?information about", "there is no (publicly available )?information about", "I could not verify", "no results for a (company|business) (named|called)", "may be referring to", "did not return any listings".

**C2. Instruction-like question screen (8.3.2)**: starts with or contains "ignore (all |any )?(previous|prior) instructions", "you are (now )?", "pretend", "act as", "system prompt", "developer message", "jailbreak", "respond only with", "do not mention".

## Appendix D. Report snapshot schema (`generated_reports.contents_snapshot`)

```json
{
  "schema": 1,
  "basisAuditId": "uuid",
  "tier": "enhanced",
  "tierName": "Premium Audit",
  "generatedAt": "2026-11-22T05:00:00Z",
  "headline": { "mentioned": 12, "answers": 40, "reaches": ["local"], "label": "Local · Sydney" },
  "reaches": [{ "reach": "local", "place": "Sydney", "mentioned": 12, "answers": 40, "ciLow": 0.18, "ciHigh": 0.45 }],
  "questionMix": { "everyday": 10, "branded": 3, "bySource": { "original": 10 } },
  "findings": [{ "rule": "h", "title": "...", "evidence": "..." }],
  "actions": [{ "kind": "measured", "actionItemId": "uuid", "title": "...", "evidence": "...", "priority": "high", "status": "open", "note": null }],
  "agencyActions": [{ "id": "uuid", "title": "...", "detail": "...", "priority": "medium" }],
  "doneSinceLast": [{ "title": "...", "doneAt": "2026-11-18" }],
  "generalAdvice": [],
  "beyondAi": {
    "identity": { "status": "measured", "checkedAt": "...", "abn": "...", "abnStatus": "Active", "entity": "...", "auDomain": true, "wikipedia": false },
    "youtube": { "status": "not_linked" },
    "crawlers": { "access": { "checkedAt": "...", "searchAllowed": ["OAI-SearchBot"], "searchBlocked": [] }, "visits": { "status": "not_measured" } },
    "technical": { "checkedAt": "...", "score": 40, "max": 74, "scoringVersion": 4 },
    "directories": { "basisAuditId": "uuid", "linked": 2, "cited": 4, "items": [{ "name": "Yellow Pages", "linked": false, "citedIn": 17 }] },
    "refreshed": [{ "check": "technical", "previousCheckedAt": "2026-10-14T00:00:00Z", "result": "measured" }]
  },
  "sections": ["cover","summary","engines","google","directories","competitors","diagnosis","beyond_ai","trend","method"],
  "_sectionsByTier": "basic: no beyond_ai and diagnosis without actions; standard: no beyond_ai; enhanced: all. Derived on the server from tier.",
  "branding": { "agencyName": "Splice Marketing" }
}
```

## Appendix E. Key copy (exact wording)

Summary only. The complete copy for every screen, state and message is in `vunnara-ui-config.ts` (node `copy` fields, `{placeholders}` are data); this table matches it.

| Where | Text |
|---|---|
| Reach card title | Where do you want to be visible? |
| Reach card help | Local is always on. Add NSW, Australia or worldwide to see whether AI recommends you beyond your area. Each area gets its own questions and its own score. |
| Reach suggestion | Your website says you work across Australia. Add NSW and Australia? · Add · Not now |
| Apply modal title | Apply new questions from the next audit? |
| Apply modal body | This starts a new comparison. Audits #{first}–#{last} stay in your history; the trend restarts from the next audit. An audit that is already running keeps the current questions. |
| Branded label | Names your business · not scored |
| Mix line | {total} questions: {everyday} everyday ({ai} AI-suggested, {agency} written by {agencyName}) and {branded} that name the business. (Zero parts omitted.) |
| Split line | AI-suggested questions: {pct}% ({m} of {n}) · Written by {agencyName}: {pct}% ({m} of {n}) |
| Beyond AI footer | These checks are separate from the Visibility score and don't change it. |
| ABN suggestion | Is this your ABN? TechCore IT · Astorio Group Pty Ltd · NSW 2765 · Active |
| Report type: Basic | Score, engine by engine, Google Search AI, where AI looks, competitors, trend, and why your score is what it is. |
| Report type: Standard | Everything in Basic, plus an action plan: what to do next, the evidence for each action, and what was done since the last report. |
| Report type: Enhanced | Everything in Standard, plus checks beyond AI answers: business identity and ABN, YouTube, AI crawler access, website technical health and your directory profiles. |
| Generate button | Generate {tierName} report |
| Tier locked | Available on {plan} and up |
| Enhanced checks note | Before an Enhanced report, checks older than their window run again. None of them change the Visibility score. |
| Pricing row "Reports" | Growth: Basic and Standard · Agency plans: Basic, Standard and Enhanced, chosen per client report, with your own names |
| Report names help | Shown on the report cover, in your reports list and in the client portal. Use the names you sell under. |
| Weak question | Row: AI doesn't name any business here (last 2 audits) · Swap banner: Swap it for “{suggestion}”? · Recommended action: AI doesn't name any business for this question |
| Small sample | Pill "Small sample"; tooltip "Small sample ({n} questions): this figure can move a lot between audits." |
| Plan limit (402) | Your plan includes 10 everyday questions per brand. Remove one, or add a question pack. |
