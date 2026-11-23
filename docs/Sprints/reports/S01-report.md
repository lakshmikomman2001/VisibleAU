# S01 report: report v2 and report tiers

Sprint S01 of the Vunnara client enhancements · 23 Nov 2026 · built on `origin/main` = `f1d9ffdb` (S00B, pushed; checked with `git fetch origin`) plus the v1.9 docs commit `1216b36f` · nothing pushed.


## Read first

1. **Stopped after Part 5, not Part 7.** Parts 0–5 are committed; Parts 6–12 are not started. This session's context was very full after six parts; Parts 6–7 (the Beyond-AI card, the PDF pages, the snapshot and the render tests) are the heaviest, so I stopped at a clean boundary rather than risk them half-done. Resume kickoff (runbook section 10, with Part 6): `Resume sprint S01 from Part 6. Follow docs/lld/CLAUDE-CODE-RUNBOOK.md (read order, including docs/Sprints/reports/ and git log origin/main..main), then continue docs/Sprints/S01-report-v2.md from Part 6.`
2. **Nothing to push yet as a sprint.** Migration 0154 is written with its run set; push notes are at the end, for when the sprint is finished.
3. **Playwright: every mapped spec ran and passed in every part that changed a screen** (Parts 0, 4, 5); nothing is "not run: memory". One flaky test in sprint3 (Part 0; passed alone and on a full re-run).
4. **Deviations to decide** (details in each part): plan refusals use the app's existing 403 + `plan_required`, not the prompt's 402 (Part 5); the crawl-route unit test gained a limiter stub (Part 0); the YouTube code gate is already on (Part 1); an inactive directory can show in the Google section, as it could before S00 (Part 0, no change).

## Pre-flight

- `main`, clean apart from Sri's three untracked items. `git fetch origin`: local `main` = `origin/main` = `f1d9ffdb` plus the v1.9 docs commit `1216b36f` (the update step's one allowed local commit).
- Gate: S00B pushed, report reviewed, live name-suggestion check passed (kickoff, 23 Nov 2026).
- Migration number 0154 free (latest 0153, three files, one run set).
- Baseline on the untouched tree:
  - typecheck clean (temp tsconfig excluding `.next` and `next-env.d.ts`);
  - the 88 source-scan guard files (S00B's 85 plus its own): 1,542 passed, **1 failed: `no-silent-fetch-fallback`** (`app/(auth)/brands/wizard/wizard-form.tsx:69`, from S00 `70909f77`; fixed in Part 0);
  - `tests/known-failures.txt`: 0 entries, still 0.
- Free memory 7.42 GB, 0 node processes. Flags `report_v2` and `abn_suggestion` already exist (S00, `lib/flags/flags.ts`), off.

## Part 0. Carry-over fixes from S00 (not flagged)

### Starter claim
- `lib/pricing/tiers.ts:97`: "Email reports" removed from the Starter card (reports are Growth and up, `lib/pricing/brand-features.ts:137-141`).
- Plan-claim guard `tests/unit/pricing/pricing-claims.test.tsx`: new test "no plan below the reports plan promises reports, on its card or in the table" (RED on the parent: Starter's card matched /report/; GREEN after).
- Screenshots: `.qa/screens/S01/pricing-1240-light-{before,after}.png`, `pricing-390-light-{before,after}.png`.

### Aliases (C-27)
- `lib/brands/aliases.ts`: unique ignoring case for a name being added (`aliasProblem`), with the brand's stored list passed on PATCH (`checkAliases(list, name, saved)`), so aliases saved before S01 (S00 kept "techcoreit" and "TechCoreIT") stay as they are. `suggestAliases` removed: its only two forms were the name without spaces and the domain stem, which detection already matches.
- `app/api/brands/name-suggestion/route.ts`: `aliases` is always `[]` (field kept: response shape unchanged).
- `app/api/brands/[brandId]/route.ts`: PATCH passes the stored list. `app/api/brands/route.ts`: `nameSuggestion` cut to 120 characters on write (`NAME_SUGGESTION_MAX_LENGTH`), never refused for length (before: over 100 refused the whole brand).
- Brand settings (`components/domain/brand/brand-detail-client.tsx`) uses the same `aliasProblem`: a case-only twin of a listed name is "That name is already listed."

### D-BAND
- `lib/scoring/headline-color.ts` `shownHeadlineBand(value)`: the band of the figure shown (every surface prints a rate with no decimals). Used by the audit page (headline and engine bars), the PDF (cover/summary band through `report-format.ts`, engine rows), the badge SVG, `visibility-display.ts` (brand pages, Health Check, mentions and sources) and the public sample result.
- Not used by the CI export's build gate (`lib/exports/ci-checks.ts:59`): it fails a build, it doesn't colour a figure; D-BAND is visual only.
- No email shows a band (checked: `lib/email/templates/*`).
- The badge already banded `Math.round(score)`, the figure it prints; it now calls the shared helper.
- Screenshots of an audit at the band edge (4 of 41 = 9.76%, shown "10%"): `.qa/screens/S01/audit-band-edge-1240-light-{before,after}.png`, `-390-`: before Low (red), after Developing (amber), engine bar too.

### Silent fetch fallback
- `wizard-form.tsx` asks for the site's name through `fetchJson` (`lib/load/fetch-json.ts`), the guard's own documented way; no allowlist entry. A failed ask is kept in state (`siteNameAsk: {status: "failed", httpStatus}`, as `useLoad` keeps a failed load) and shown as no suggestion; the form stays usable.
- `tests/unit/load/no-silent-fetch-fallback.test.ts`: RED on the parent (`wizard-form.tsx:69 ... if (!res.ok) return;`), GREEN after.

### Why the wizard didn't offer "Hero Home Services"
- Cause: `wizard-form.tsx:75-78` (parent) applied the route's answer only while the name field was empty or still the wizard's own suggestion. The name field comes first in the form: a name typed before the domain ("herohomeservices") kept the field, and the answer was stored in `siteSuggestion` (`:74`) but never shown — only used for the help line (`:350`) and sent as `nameSuggestion` (`:159`). A failed request was also dropped silently (`:69`). The order of the domain-stem fill (`onDomainChange`, `:49-59`) and stale answers (`:72-73`) were handled correctly.
- Fix: the site's name is offered whenever the field holds another name (`siteNameOffer`); inside the run-together notice next to "Keep", otherwise on its own line. A typed name is replaced only by the click.
- S00 part 4 wrote no copy for this case. **Proposed copy** (in the existing notice's style): `Your website gives the name “{name}”.` with the link-button `Use “{name}”`; in the run-together notice: `… Use “{name}” · Keep “{typed}”`.
- Screenshots of the first step (route stubbed with the recorded production answer): `.qa/screens/S01/wizard-step1-1240-light-{before,after}.png`, `-390-`.

### `POST /api/crawl`
- Callers: **none in app code, scripts or e2e specs**. References: `tests/unit/fetch-callers/crawl-route.test.ts:20,42` (S00B parity test) and docs (`docs/lld/fetch-inventory.md:42`, `docs/lld/as-is-verification.md:503`, the LLD, S00B prompt and report). Sri decides about removing it (LLD 0.3).
- Limit: `checkPostgresRateLimit` keyed `user:<id>`, routeKey `crawl`, 10 per hour, after auth, `run_audit` and body validation (refused requests aren't counted). Over the limit: 429 `{ "error": "Too many requests" }` (the app's generic rate-limit answer, as `audits/[auditId]/status`, `sample-audit/[auditId]/status`, `visit`) with `Retry-After`, and an operator log line `crawl_rate_limited`.

### Directories cited (check first): no change, for Sri
- Where cited links become directory names, and whether an inactive row (the 7 US directories) can show:
  - Audit page "Directories AI cited" (`app/(auth)/audits/[auditId]/page.tsx:704` → `getDirectoryCitationsForAudit`, `lib/directories/citation-counts.ts:209`): **no** — only enabled directories of the brand's market (`:220-222`, `:280-282`).
  - PDF "Where AI looks" (`lib/reports/report-data.ts:474`), findings (`report-findings.ts:91` over `report-rules.ts directoryGaps`), the Action Center's directory advice (`lib/recommendations/gather-evidence.ts:227`), own-profile suggestions (same results): **no**, same function.
  - **Google Search AI section's "Directories cited"** (`lib/audit/google-surfaces/summary.ts:239` → `findDirectoryForSource`, `lib/directories/registry.ts:337,353`): **yes** — it searches every market and skips no inactive row.
  - Recommendation titles naming a directory (`lib/recommendations/confidence-labels.ts:271` → `directoriesNamedIn`, `registry.ts:317`): every market, inactive included.
- Which row each Yelp link matches: `yelp.com.au` → `yelp_au` (AU, active, cited-only, appendix B); `yelp.com` → `yelp` (US, **inactive**). Both are named "Yelp".
- Before S00 (`15f287b`): `summary.ts:236` → `findDirectoryByDomain` (`registry.ts:307`) also searched every market including `enabled: false` rows, and the US `yelp` row (`yelp.com`) existed, so a `yelp.com` link showed "Yelp" in the Google section then too; a `yelp.com.au` link wasn't a directory (no AU row). `directoriesNamedIn` also searched every market (`registry.ts:291`).
- So an inactive directory **could be shown before S00 too: changed nothing** (per the prompt). Which link audit #54 cited needs a production read (no production access here).

### Part 0 tests, Playwright and commit — `91bff33f`
- New tests RED on the parent, then GREEN: pricing-claims (1), name-suggestion (2), brand-aliases component (1), wizard-site-name-offer (9; 8 RED, 1 by design on both), shown-headline-band (22; 10 RED with the surfaces on the parent), brand-aliases.integration (4 RED), crawl-route-limit.integration (1 RED), no-silent-fetch-fallback (RED on the parent).
- Existing tests whose expectation the LLD changes, edited only there with the line quoted: `tests/unit/brands/name-suggestion.test.ts` (four `suggestAliases` tests removed with the function; "unique as written" → ignoring case, LLD 0.2 #5), `tests/unit/brands/wizard-name-suggestion.test.tsx` (no "Also recognised as" line, C-27), `tests/integration/brand-aliases.integration.test.ts` (first PATCH list was a case-only pair; route answers `aliases: []`), `tests/phase2/sprint9/unit/health-check-classify.test.ts` and `tests/unit/scoring/visibility-display.test.ts` (29.9 and 9.9 take their shown figure's band, D-BAND), `tests/unit/fetch-callers/__golden__/name-suggestion.json` (only the three `aliases` lists, now `[]`), `tests/unit/fetch-callers/crawl-route.test.ts` (the new limiter stubbed: unit tests never reach a database; no assertion changed — the prompt asked for the route's tests to pass unchanged, which a Postgres limiter can't allow in the unit project).
- vitest related (16 files): 324 files, 3,638 passed, 5 failed (the five expectations above), fixed: 15 of 15. All 88 guard files and the 120 other tests naming a changed path: 208 files, 3,127 passed. tsc clean; biome 0 new per changed file.
- Playwright (fresh server each, one at a time; peak tree ≤ 6.2 GB, lowest free 1.49 GB): new `tests/e2e/11-s01-part0-carryovers.spec.ts` 4 passed (4 failing on the parent, for the before screenshots); 02 (8), 03 (10), 04 (9), 05 (7), 07 (5), 09 (5), 10 (4), running-to-finished (4), f04 (2), sprint2 (11 + 8), s9 (13 + 13), responsive (12 ×7 + 10) all passed; sprint3 15 passed + 1 flaky (`FE-2 … 1. Empty visibility hub shows 'Run an audit' message`: strict-mode, both empty-state sentences on the page; passed alone, then 16 of 16 on a full re-run; the parent 16 of 16). Records: `.qa/screens/S01/playwright/p0/`, `p0-recheck/`.

## Part 1 — `78999350`
- Comment only (`lib/brand-entity/abn-lookup.ts`). vitest related 14 files, 190 passed; 88 guards + named tests 90 files, 1,569 passed. Playwright: not needed (no UI change).

### Part 1 findings: Beyond-AI sources

- **Business identity (ABN):** real. `lib/brand-entity/abn-lookup.ts` (GUID path, `AbnDetails.aspx`), run by the technical audit (`lib/audit/run-technical-audit-inline.ts:35-38`); results in `technical_audits.findings.brandEntity` (`:93-104`) and `brand_entity_scores` (`:109-…`: `abn_verified`, `abn_number`, `abn_entity_name`, `abn_status`, `wikipedia_au_*`, `au_tld_*`, `checked_at`). Statuses: `Active`/other ABR status; `check_skipped` (no GUID, or `ABN_LOOKUP_BYPASS`); `check_failed` (HTTP error, timeout, bad JSON); empty (no ABN on the brand, or not 11 digits). `lib/trust/entity-checker.ts:106-126` makes a second ABR call without a GUID (`refresh-entity-score`): untouched, as asked.
- **`MatchingNames.aspx` confirmed with the existing GUID** (one call on 23 Nov 2026, name "TechCore IT"): 200, JSONP, 10 names; first `{"Abn":"17701710947","AbnStatus":"0000000001","IsCurrent":true,"Name":"TechCore IT","NameType":"Business Name","Postcode":"2765","Score":100,"State":"NSW"}`. The name search's `AbnStatus` is a code, not "Active", so each candidate is confirmed with `AbnDetails` (LLD 8.8.6): `{"Abn":"17701710947","AbnStatus":"Active","EntityName":"ASTORIO GROUP PTY LTD","BusinessName":["TechCore IT"],"AddressPostcode":"2765","AddressState":"NSW",...}`. Both responses recorded for Part 11's tests. No postcode or state parameter exists on the JSON name search (only on the SOAP/simple-protocol methods): filtered in code.
- **ABR terms for automated lookups** (`https://abr.business.gov.au/Tools/WebServicesAgreement`, version 9.9.7; registration `https://abr.business.gov.au/Tools/WebServices`): free; a GUID is issued on accepting the agreement; non-exclusive licence; **no stated rate, volume, caching or attribution rule**; must delete withdrawn information when notified; must not use it in a misleading way or imply Commonwealth endorsement; extracts may be given to third parties at our own risk; service "as is", may be suspended. Recorded in a code comment in `abn-lookup.ts`.
- **YouTube:** real (YouTube Data API v3, `lib/trust/youtube-channel-lookup.ts`). The code gate `TRUST_CHECK_IMPLEMENTED.youtubePresence` is **true (on)** at `lib/trust/stub-implementation-status.ts:37` — not off, as the S01 prompt says; the gate is read by the cron (`inngest/functions/audit-youtube-presence.ts:19`), both routes (`app/api/brands/[brandId]/youtube-presence/route.ts:42`, `refresh/route.ts:48`) and the page layout. What turns real lookups on in production is **`YOUTUBE_API_KEY`**: without it a row stores `check_status='unavailable'`, `unavailable_reason='missing_api_key'` (`youtube-channel-lookup.ts:367-368`). The org flag key `youtube_audit_enabled` (`lib/governance/feature-flags.ts:11`) is defined but never read. Plan: Growth and up (`brand-features.ts:72-76`). Cron: monthly, `0 3 3 * *`. `cited_video_urls` is always `[]` (no "videos cited" line, as amended).
- **AI crawler access (robots):** real; `technical_audits.findings.robots` (search crawlers allowed/blocked, owners' choice), `score_robots`; "not checked" = no technical audit, or `findings.robots.readable = false` (site unreachable: no score stored).
- **Crawler visits:** real but only from what the customer supplies: `crawler_visit_logs` from uploaded logs (verified by CIDR/FCrDNS/ASN) and the visit beacon (no `source_ip`, never verified). CDN Shield writes none. "Not measured" = no rows in 30 days.
- **Technical score:** latest `technical_audits` row with `score_composite` (NULL when a scored check couldn't be measured), maximum by scoring version (`compositeMaxFor`, v4 /74).
- **Directory profiles:** `brand_directory_listings` (listed / not_listed / unsure, `profile_url`) with the basis audit's citations (`getDirectoryCitationsForAudit`).
- **Production environment variables for Enhanced reports** (Vercel, names only): `ABN_LOOKUP_GUID` set; `ABN_LOOKUP_BYPASS` **unset**; `YOUTUBE_API_KEY` set. The YouTube code gate needs no change (already on).

## Part 2. Migration 0154 — `42c6d0d0`, follow-up `d8883e4f`
- `db/migrations/0154_report_v2.sql` and `db/prod-fixes/0154-s01-run1-precheck.sql` → `run2-apply` → `run3-post-check` (`run4-rollback` only to undo). run2 is the migration's own statements in one transaction.
- Tables `report_brand_preferences`, `report_action_choices`, `agency_actions` (FORCE RLS, four `app.current_org_id` policies each, visibleau_app DML, ON DELETE CASCADE from brands and, for choices, from action_items); `generated_reports.contents_snapshot` + `report_tier` (default 'basic', CHECK), `report_delivery_schedules.report_tier` (same), `agency_brand_assets.report_tier_names` (CHECK through the IMMUTABLE `report_tier_names_ok(jsonb)`: 1–24 characters after trim, no control characters, unique ignoring case, known keys; workspace row only), `brands.abn_suggestion` jsonb.
- Run set tested on local `visibleau`: run1 → run2 → run3 (every check as expected) → run4 → run1 (back to nothing). Applied to `visibleau`, `visibleau_e2e`, `visibleau_integration` (migrate-local) and `visibleau_test` (psql -f).
- Tests: `tests/integration/report-v2-schema.integration.test.ts` (8; RED without 0154: the integration bootstrap refuses for schema drift), schema-drift, app-role-grants, db-role-check; 16 integration files on the altered tables, 182 passed; 88 guards + named, 1,554 passed.
- **Missed in part 2, fixed in `d8883e4f`:** `tests/integration/__golden__/google-surfaces-off-parity.json` records the brand row, so it gained `"abnSuggestion": null` (found by part 3's `vitest related`; part 2 skipped related on `db/schema/brands.ts`, which selects most of the suite).

## Part 3. Findings g–j — `dff973d7`
- `lib/reports/low-visibility-findings.ts` (rules g, h, i, j), `lib/reports/could-not-find.ts` (appendix C1), `lib/reports/finding-recommendations.ts` (Action Center items); wired into `report-findings.ts` (after a–f's three, before the strength), `report-data.ts` (`basisAuditEvidence({ lowVisibility })`, three indexed reads), `audit-findings.ts`, the PDF (`FINDINGS_CHECKED` replaces "No finding rule matched" with report_v2 on), both audit runners (inside the existing `build-recommendations` step; `run-audit-inline.ts` the same), `confidence-labels.ts` (ceilings "confirmed", `FINDING_KEYS` shown as measured), `general-advice.ts`.
- Dimensions: g, h frequency; i, j `accuracy` (the code's key for Source citation). Never context or sentiment.
- Rule g's "name or cite other businesses" is measured by citation only (other businesses' own sites); naming without a citation needs a model reading names, which the LLD rules out for evidence.
- LLD appendix C1's heading says "finding rule g"; the rule is h (8.1.5's table). Proposed: correct the heading.
- Tests: could-not-find (8), low-visibility-findings (14), finding-recommendations (6), low-visibility-findings.integration (4; 3 RED on the parent, the flag-off one passes on both). related 158 files 1,955 passed (+1: the golden above); guards + named 130 files 2,091 passed; integration naming the paths 35 files 207 passed. Playwright: not needed.
- No #54/#55 answers in the repo: the Hero report fixture (`tests/helpers/report-data-fixture.ts`) stands in.

## Part 4. General advice backed by evidence — `aafab26d`
- `lib/recommendations/general-advice-evidence.ts`: platform advice (Medium, LinkedIn, Reddit, Wikipedia) shown only when this audit's everyday answers cite the platform in ≥ 3 answers ("LinkedIn was cited in 9 of 40 answers"); other advice only with a verified research source; else hidden. Audit page (`app/(auth)/audits/[auditId]/page.tsx`), behind report_v2: only backed items, each with its evidence line (mono).
- The PDF has no general-advice list today (its "Recommended next" is the findings' recommendations); the PDF's "General advice, not drawn from this audit" group is part 5/7's.

## Part 5. "What to do next" and the report contents panel (P08) — `cb68d0ab`
- Data: `lib/reports/what-to-do-next.ts` + `lib/reports/report-contents.ts`. Measured actions are the basis audit's findings (`reportFindings`, the audit page's own "from this audit") with their evidence and " · audit #n", each joined to its Action Center item when there is one (status; the agency's choice is saved against it), then the other measured items in the audit page's order. **Why findings, not items:** findings g–j have Action Center items only for audits run after report_v2 is on, so items alone would leave TechCore's #52 "What to do next" empty. Then agency actions; done since the brand's previous generated report (`action_items.done_at`); part 4's evidence-backed general advice. Agency and up: saved order, hidden items, notes, toggles. Growth: priority order, everything included, no notes (D1).
- Panel view: `GET /api/brands/:id/report-preferences` (`lib/reports/report-contents-view.ts`) → `{ enabled: false }` with report_v2 off; else the basis audit the server will use (`selectReportBasis`; shown, never chosen), the groups, saved preferences, `curated`, the agency's name and the brand's name.
- Routes: `GET/PUT /api/brands/:id/report-preferences`, `POST/PATCH/DELETE /api/brands/:id/agency-actions` (DELETE archives): generate_reports, the workspace's own brand, zod (note ≤ 400, title 5–120, detail ≤ 600, the LLD's enums, each action once, no unknown field), RLS context. Reports Growth and up; curation and agency actions Agency and up (Growth may save its default report type). report_v2 off: writes 404.
- **Deviation: plan refusals are the app's 403 + `plan_required`, not 402.** The client recognises only that (`lib/pricing/plan-refusal.ts:26-36` `isPlanRefusal`, the page's `planRefused`; every brand-feature route answers through `tierRefusal`, `lib/governance/access-control.ts:183`). A 402 would skip the page's plan handling. Proposed: amend the S01 prompt and LLD 11 ("402 for plan") to "the app's plan refusal (403, plan_required)". Part 8's `report_tier_not_in_plan` is a separate code the panel handles itself (P08.overLimit), so it can stay 402 if Sri prefers.
- Generate accepts `contents`: with report_v2 on and a curating plan it's saved as the brand's choices before the report starts; otherwise ignored. The server still picks the basis audit.
- Reports page: Generate asks for the panel's view when pressed (the page's load is exactly as before; existing tests count its requests); report_v2 off, or a view that can't be read → today's direct generate.
- Guards caught three things, fixed before the commit: effective-tier-guard and plan-gate-entry-points (new gates and callers listed; the panel locks by "reports" first), and no-real-names-in-ui (`Array.prototype.splice` read as the "Splice" workspace).
- Tests: report-contents (7), the panel component (9), report-contents-routes.integration (6), what-to-do-next.integration (3), e2e `tests/e2e/12-s01-report-contents-panel.spec.ts` (2). RED on the parent: none can load or find the panel (all new). related 14 files 425 passed; guards + named 97 files 1,725 passed; integration on the paths 258 passed.
- Playwright: 12-s01-report-contents-panel 2, sprint4-reports 19, 09-google-surfaces 5 — all passed (a fresh server each).

```
P08 · Report contents panel (S01 part 5; the report type picker is part 8's)
Nodes: 7 of 10 built (P08.header, measured + item, agency, addAction, sections, outline, footer);
       P08.tier, P08.basicNote, P08.checks: parts 8-9
States: empty ✓ error ✓ planLock ✓ flagOff ✓; loading: the page's Generate button shows "Generating..." while
        the view loads (the view loads on click); overLimit: part 8
Acceptance:
  ✓ Growth can generate but not curate (component test; route test)
  - Tier refusal, page sets, snapshot: parts 7-8
Screenshots: .qa/screens/S01/P08-1240-light.png, P08-1240-dark.png, P08-390-light.png, P08-390-dark.png
Deviations from the contract: "Generate report" (no tier name until part 8); the outline title is "Report outline"
  (no tier yet); no loading skeleton (the view loads on click, behind the button's own state)
```

## Commits

```
cb68d0ab feat(reports): S01 part 5 -- "What to do next" data and the report contents panel (P08) ...
aafab26d feat(advice): S01 part 4 -- general advice shown only when evidence backs it ...
dff973d7 feat(reports): S01 part 3 -- findings g-j for low or zero visibility ...
d8883e4f test(golden): S01 part 2 follow-up -- the Google-surfaces-off parity golden gains abnSuggestion ...
42c6d0d0 feat(db): S01 part 2 -- migration 0154 ...
78999350 docs(abn): S01 part 1 -- the Beyond-AI sources verified; the ABR's terms ...
91bff33f fix(s01): S01 part 0 -- carry-over fixes from S00 ...
1216b36f docs: client-enhancements pack v1.9 (the update step's docs commit)
```
`git log origin/main..main --oneline`: these eight plus this report's commit. Nothing pushed.

## Push notes (for when the sprint is finished; not for a push at Part 5)
1. **Migration 0154 first** (`db/prod-fixes/0154-s01-run1-precheck.sql` → `run2-apply` → `run3-post-check`), after a pg_dump of `generated_reports`, `report_delivery_schedules`, `agency_brand_assets` and `brands`. The pushed code selects the new columns with every report, schedule, branding row and brand.
2. **Inngest resync: yes** (`generate-recommendations` changed inside an existing step, no new step id; parts 7–9 change the report jobs).
3. **Safe while an audit runs:** yes for parts 0–5 (additive columns with defaults; the recommendation change runs only at an audit's end, and only with report_v2 on).
4. **Flags off:** `report_v2` and `abn_suggestion` (no rows). With report_v2 off every report, the audit page and the Reports page are today's. Part 0 is live on push (Starter claim, aliases, D-BAND, the wizard, the crawl limit).
5. Environment variables for Enhanced reports (names only): `ABN_LOOKUP_GUID` set, `ABN_LOOKUP_BYPASS` unset, `YOUTUBE_API_KEY` set.

## Proposed changes to the documents (for Sri and Claude chat)
- **S01 prompt / LLD 11:** "402 for plan" → the app's plan refusal (403, `plan_required`) (Part 5).
- **S01 prompt Part 1:** the YouTube code gate is already on (`lib/trust/stub-implementation-status.ts:37`); production lookups need `YOUTUBE_API_KEY` only.
- **S01 prompt Part 0:** "the route's existing tests pass unchanged" can't hold for a Postgres limiter in the unit project (no database): the crawl-route unit test stubs the limiter; the limit itself is tested in integration.
- **LLD appendix C1:** the heading says "finding rule g"; it's rule h.
- **LLD 8.1.5 rule g:** "name or cite other businesses" is measured by citations of other businesses' own sites only (naming without a citation would need a model to read names).
- **LLD 8.1.3 / appendix D:** measured actions come from the audit's findings joined to Action Center items (items for g–j exist only for audits run with report_v2 on); `actionItemId` is null for a finding with no item (rules b–e), which is always included.
- **Contract P01.aliases:** "unique ignoring case" is now built (C-27); S00's proposed amendment ("as written") is withdrawn.
- **Proposed wizard copy** (Part 0): `Your website gives the name “{name}”.` / `Use “{name}”`.

## Memory and processes
Start: 7.42 GB free, 0 node processes. Every Playwright run had its own `next dev` server (Playwright's webServer, no reuse), ≥ 6 GB free at its start, peak tree ≤ 6.2 GB, lowest free 1.49 GB (no safety stop); after each, 0 leftover repo node processes and port 3000 free. End: 7.26 GB free, 0 node processes.

## Tests skipped by the testing-scope rules
Full suites: not run (not asked). No `next build`. `vitest related` on `db/schema/brands.ts` and the other schema files: not run (it selects most of the suite); schema-drift and the integration files on the changed tables covered them, and part 3's related run caught the one golden it missed (`d8883e4f`).

---

# Parts 6–7 (resumed session, 23 Nov 2026; stopped after Part 7)

Resumed with the v1.10 `UPDATE-HERE.md` step: pack v1.10 copied and committed (`94462fa5`; LLD, runbook, sprint prompts S01–S11; the contract typecheck passes). Start of this session: `origin/main` = `f1d9ffdb` (checked with `git fetch origin`), local `main` = that plus the nine S01 commits, tree clean apart from Sri's three untracked items.

## Read first (Parts 6–7)

1. **Stopped after Part 7, at the runbook's S01 stop point** ("if your context is getting full after Part 7, commit, report and stop; Sri resumes from Part 8"). Parts 8–12 are not started. Resume kickoff: `Resume sprint S01 from Part 8. Follow docs/lld/CLAUDE-CODE-RUNBOOK.md (read order, including docs/Sprints/reports/ and git log origin/main..main), then continue docs/Sprints/S01-report-v2.md from Part 8.`
2. **Playwright not run (the queue was stopped by Claude Code for low memory, not by a failure):** `tests/e2e/responsive/responsive-shell.spec.ts`, all 8 shards (`--fully-parallel --shard=1/8` … `8/8`), mapped to Part 6's audit page change. They must pass before `report_v2` is switched on. Also re-run `tests/e2e/13-s01-beyond-ai.spec.ts` once: it passed (2 of 2) before the card's column fix, and its re-run retakes `.qa/screens/S01/P07-*.png` with the 4-column layout. Nothing else is outstanding.
3. **Until Part 8 wires the tier, every report generated with `report_v2` on is the Enhanced set** (Part 7 renders the Enhanced page set behind the flag, as the prompt says). Don't switch `report_v2` on before Part 8 is done.
4. **Deviations to decide** (details below): a Basic report keeps today's Diagnosis heading (N15) rather than retitling it "Why your score is what it is"; the Summary page's "(see section 04)" now points at "Why, and what to do next" in Standard and Enhanced; two existing guard lists gained the new files.

## Before Part 6: Part 0 follow-up — `25d774b3`
- `app/(auth)/brands/wizard/wizard-form.tsx:393`: `Your website calls the business “{name}”.` (LLD amendment 35). The run-together notice already read `… Use “{name}” · Keep “{typed}”`.
- `tests/unit/brands/wizard-site-name-offer.test.tsx`: the own-line test now quotes the new copy (RED on the parent: 1 failed, 8 passed; GREEN 9 of 9).
- `tests/e2e/11-s01-part0-carryovers.spec.ts`: the run-together check asserts `Use “Hero Home Services” · Keep “herohomeservices”`; new test "another typed name: the site's name is offered on its own line (LLD amendment 35 copy)" with screenshots `.qa/screens/S01/wizard-step1-offer-{1240,390}-light-after.png`; `wizard-step1-*-after.png` retaken.
- Tests: related 7 files 44 passed; 89 guard files + named 95 files 1,616 passed; the two wizard integration files 13 passed; tsc clean; biome 0 new. Playwright (fresh server): 11-s01-part0 5 of 5 passed (peak tree 4.09 GB, lowest free 3.73 GB, 0 leftovers).

## Part 6. "Beyond AI answers" (LLD 8.1.4, P07) — `7bd8484b`
- `lib/reports/beyond-ai.ts`:
  - `getBeyondAiAnswers(db, { brand, asOf, basisAuditId? })`: one indexed query per module, each `<= asOf` (the report's time; now on the audit page): `brand_entity_scores` (latest by `checked_at`), `youtube_presence_audits` (by `audited_at`), `technical_audits` (by `created_at`; robots findings and the score), `crawler_visit_logs` (count by crawler in the 30 days before `asOf`), and, with a basis audit, `getDirectoryCitationsForAudit` for the PDF's directory tile (top 6 by citations, linked = the owner's confirmed profile). `db` is the caller's RLS-scoped transaction; no `serviceDb`.
  - `buildBeyondAiAnswers` (pure): each tile measured / not checked / failed, with its own `checkedAt` and `stale` (> 30 days before `asOf`).
  - `beyondTileViews`: the one wording for the audit page, the PDF and the portal (contract P07 copy), plus `directoriesLines` for the PDF tile.
- **Tile rules:**
  - Identity: "No ABN on file" + "Add your ABN" (brand settings) when the brand has none; "ABN verified" / "ABN not verified" with `{status} · {entity} · checked {date}` and `.au domain ✓ · Wikipedia: …`; `check_skipped` (no GUID / bypass) is "Not checked yet"; `check_failed` is "Couldn't check on {date}: the Australian Business Register didn't answer".
  - YouTube: "Channel found" + `{n} videos · last upload {date}` (no "videos cited" line); "No channel linked" + "Add your channel"; a channel whose website doesn't match, or that is unconfirmed, says so. The code gate off or `missing_api_key` is "Not checked" with no customer reason; the reason goes to an operator log line `beyond_ai_not_checked`. Quota or network: "Couldn't check on {date}: …".
  - Crawlers: "Search crawlers allowed" / "{n} search crawlers blocked" + names, `{allowed} of 4 · checked {date}`. With no robots.txt, the evaluator's verdicts count every search crawler as allowed (RFC 9309). An unreachable robots.txt fails with its date. Visits: `Visits in 30 days: {n} ({bots})` or "Visits: not measured · upload server logs" + link.
  - Technical: `{score} of {max}` with the audit's own maximum (`technicalScoringOf`), `checked {date} · v{n} scoring`, and the two weakest scored checks (for the PDF). No composite stored is "Couldn't check on {date}: we couldn't reach your website" (or "one of its checks couldn't be measured"), never a 0.
- Audit page (`app/(auth)/audits/[auditId]/page.tsx`): `beyondAi` loaded inside the page's RLS transaction only while `report_v2` is on, and the card renders after Recommended actions. Off: null, and the page is exactly as before.
- Card: `components/domain/audit/beyond-ai-card.tsx`. Test ids `p07-beyond`, `p07-beyond-{identity,youtube,crawlers,technical}`; each tile is read as `{label}: {value}, {detail}`; stale lines in `--warning`.
- **Layout bug found and fixed before the commit:** `sm:grid-cols-2 min-[1100px]:grid-cols-4` gave 2 columns at 1240 because Tailwind v4 emits arbitrary `min-[…]` rules before the named breakpoints (`.next` CSS: `min-[1100px]` at line 2760, `sm:grid-cols-2` at 2803). It is now `min-[641px]:grid-cols-2 min-[1100px]:grid-cols-4`, the contract's own breakpoints, with a component test that no named breakpoint is used.
- Tests (all new; RED on the parent):
  - `tests/unit/reports/beyond-ai.test.ts`: 27; every tile measured / not checked / stale / failed, the date rule against `asOf`, no 0 for "not measured", the directory lines.
  - `tests/unit/components/beyond-ai-card.test.tsx`: 5.
  - `tests/integration/beyond-ai.integration.test.ts`: 5. A result written after `asOf` is ignored and a later report sees it; visits in the 30-day window; the directory tile; RLS proved as `visibleau_app`, because the local test user is a superuser.
  - `tests/integration/audit-page-beyond-ai.integration.test.tsx`: 2. Flag off: no card. Flag on: four tiles. The flag-on case fails with the parent's page.
- **Existing test changed: `tests/unit/technical-audit/score-surfaces.test.ts`.** It lists every reader of `technical_audits`. It gained `lib/reports/beyond-ai.ts` (in `READERS` and in `USES_ITS_OWN_SCORING`) because LLD 8.1.4 makes the audit page, the PDF and the portal show "Website technical score … with its own maximum (compositeMaxFor)".
- Tests run:
  - related: 35 files, 194 passed;
  - 89 guard files + the unit tests naming the changed files: 95 files, 1,642 passed, after the guard entry above;
  - the 34 integration files that render the audit page or name the new files: 171 passed;
  - tsc clean; biome 0 new.
- Playwright (one at a time, fresh server each), all passed:
  - new `13-s01-beyond-ai` 2 of 2 (before the column fix);
  - 09-google-surfaces 5; 10-not-found 4; 11-s01-part0 5; running-to-finished 4; f04-audit-results 2; section5-aa 4; sprint6-retrieval 19.
  - Peak tree ≤ 5.26 GB, lowest free 2.58 GB.
  - responsive-shell: **not run**. The queue was stopped by Claude Code for low system memory while shard 1 was starting. Afterwards: 0 repo node processes, 0 Playwright browsers, port 3000 free, 7.66 GB free. Per that notice it wasn't restarted in this session.

```
P07 · Audit page additions (S01: the Beyond AI answers card; findings were part 3)
Nodes: P07.beyond + its 4 tiles built (P07.reachRow, P07.mix, P07.split: S03/S04)
States: stale ✓ empty ✓ (neutral pill + action link, never a 0) flagOff ✓; loading: server-rendered with the page
  (no separate skeleton: the page loads as one, as the contract's api line says)
Acceptance:
  ✓ Every Beyond tile shows its own date; none shows a 0 for "not measured" (unit + component tests)
  ✓ A 0% audit shows findings g-j and Recommended actions (part 3)
Screenshots: .qa/screens/S01/P07-1240-light.png, P07-1240-dark.png, P07-390-light.png, P07-390-dark.png
  (taken before the column fix: 2 columns at 1240; re-run 13-s01-beyond-ai to retake them at 4)
Deviations: the PDF/portal-only "Your directory profiles" tile isn't on the audit page (contract: four tiles there)
```

## Part 7. PDF pages and the snapshot (LLD 8.1.2, 8.1.3, appendix D, P09) — `70b5404e`
- **`lib/reports/report-tiers.ts`:** `REPORT_TIERS`, the default names, appendix E's descriptions, `pagesForTier`, `reportTierAllowed`, `capTierAtPlan`, `tierNamesFrom` and `lowestPlanForTier`.
  - `lib/pricing/tiers.ts` gains `maxReportTier` on each plan (Free and Starter null, Growth `standard`, Agency and up `enhanced`) and `reportTierNames` (Agency and up).
  - Nothing enforces the tier yet: that is Part 8.
- **`lib/reports/report-v2.ts`:**
  - `buildReportV2(db, { data, tier, now })` builds "What to do next" (`loadWhatToDoNext`, Part 5) for Standard and Enhanced, and "Beyond AI answers" as of generation time for Enhanced. It also sets the page set, the tier's name, the cover name (Agency and up only) and the question mix.
  - `reportV2ForGeneration` returns null while `report_v2` is off.
- **`lib/reports/report-snapshot.ts`:** appendix D's fields plus `reportData` (the render input itself), so a re-render prints the same figures, items, notes and check dates. Also `questionMixLine` (appendix E, zero parts omitted).
- **`lib/reports/report-render-input.ts`:** `loadReportRenderData` renders from the snapshot when there is one, and otherwise uses today's `buildReportData`.
- **`inngest/functions/generate-narrative-report.ts`:** inside the existing `generate-and-insert` step (no new step id), it calls `reportV2ForGeneration(tx, { data, tier: "enhanced" })` and stores `report_tier` and `contents_snapshot`. With `report_v2` off: `basic` and null, as today.
- **`inngest/functions/render-report-pdf.ts`:** selects `contents_snapshot` and renders through `loadReportRenderData`, so "Try again" re-renders the same report.
- **`lib/reports/pdf/report-document.tsx`:**
  - `reportPlan` follows the tier's page set. With no v2 contents the pages are today's.
  - New `NextPage` (P09.next):
    - eyebrow `{nn} · Why, and what to do next`, provenance `Measured · Audit #{n}`, title "What we found, and what to do next", and the contract's lede naming the agency;
    - today's finding cards, then the groups MEASURED ACTIONS, RECOMMENDED BY {AGENCY}, DONE SINCE THE LAST REPORT and GENERAL ADVICE, NOT DRAWN FROM THIS AUDIT (only when non-empty and switched on; hidden actions left out);
    - action cards show priority and status pills, the evidence in mono and "Note from {agency}: …", in agency violet #5B21B6 on #EDE9FE.
  - New `BeyondPage` (P09.beyond): `{nn} · Beyond AI answers`, "Separate checks · own dates", "What AI can read about you elsewhere", the footer sentence, 2 × 2 tiles, then "Your directory profiles" (`FROM AUDIT #{n} · {DATE}`).
  - The Over time page drops the prioritised list in Standard and Enhanced.
  - The method page adds "Questions asked: {mix line}" in every v2 tier, and "Checks outside AI answers: identity {date} · YouTube {date} · crawlers {date} · technical {date}" in Enhanced only.
  - Fonts, the palette and the cover are unchanged.
- Fixtures (no production data in the repo): `reportDataFixture("39")` stands in for Hero #54 and `reportDataFixture("37")` for Omega #55. TechCore #52's shape is the #39 fixture at 0 of 40 with Part 3's evidence (`kangaroo-it.com.au` 27 answers, Claude's "unable to find" quote, Local Business Guide not linked, ABN not verified). The snapshot test seeds a #52-shaped audit with `tests/helpers/report-fixture.ts`.
- Tests:
  - `tests/unit/reports/report-v2-pdf.test.tsx` (11):
    - **N15** for both fixtures: a Basic report's every page matches today's, and the method page adds only the mix line;
    - **N14**: in Enhanced, the cover, summary, engines and directories pages are identical apart from the footer's "of N" page count;
    - the next page's groups and lede, hidden actions left out; no "Prioritised by impact" in Standard; the Beyond page's five tiles and dates; the method lines; section numbers in order; TechCore's g–j with non-empty actions;
    - no Basic or Standard PDF names another tier, "upgrade", a plan or a price.
    - RED on the parent's `report-document.tsx`: 7 failed. The 4 that pass on both (unchanged pages, numbering, no upsell) hold today too.
  - `tests/unit/reports/report-tiers.test.ts`: 9.
  - `tests/integration/report-snapshot.integration.test.tsx`: 3.
    - Flag on: the snapshot and `report_tier` are stored, and rendering reads them.
    - Editing the action, its note and the agency action afterwards leaves the re-render byte-for-byte the same data.
    - Flag off: no snapshot, and the report rebuilds from live data.
- **Summary page pointer:** the narrative's "(see section 04)" pointed at Diagnosis. In Standard and Enhanced it now points at "Why, and what to do next", where the findings are (`report-document.tsx:892`); found by the N14 test.
- **Existing helper changed: `tests/helpers/plan-gates.ts`.** `DIRECT_GATES` gained `lib/reports/report-v2.ts`, which calls `effectiveTier` for curation and tier names, as `report-contents-view.ts` did in Part 5.
- Tests run:
  - related: 295 files, 3,354 passed, 7 skipped;
  - 89 guard files + the unit tests naming the changed files: 1,898 passed, after the entry above (`effective-tier-guard` caught it);
  - the plan-gates users: 151 passed;
  - 19 integration files naming the changed files, plus `cancelled-plan-gates`: 486 passed;
  - tsc clean; biome 0 new (the two `step: any` warnings were there before).
- Playwright: not needed (no UI change: PDF rendering, the jobs and the data only).

## Commits (this session)
```
70b5404e feat(reports): S01 part 7 -- PDF pages and the report snapshot ...
7bd8484b feat(reports): S01 part 6 -- "Beyond AI answers" ...
25d774b3 fix(wizard): S01 part 0 follow-up -- the site-name offer uses the copy in LLD amendment 35 ...
94462fa5 docs: client-enhancements pack v1.10 (decisions on S01 Parts 0-5)
```
`git log origin/main..main --oneline`: the nine commits before this session, these four, and this report's commit. Nothing pushed.

## Push notes (whole sprint so far; for when S01 is finished, not now)
1. **Migration 0154 first** (unchanged since Part 2).
2. **Inngest resync: yes.** `generate-narrative-report` and `render-report-pdf` changed inside existing steps; no new step ids so far.
3. **Safe while an audit runs:** yes. Generation and rendering change only while `report_v2` is on, and reports made before keep rebuilding as today.
4. **Flags off:** `report_v2` and `abn_suggestion`. With `report_v2` off, every report, the audit page and the Reports page are today's.
5. Don't switch `report_v2` on before Part 8 (tiers) and the not-run Playwright specs above have passed.

## Proposed changes to the documents (Parts 6–7)
- **P09.next / S01 prompt Part 7 vs N15:** "Basic keeps today's Diagnosis page … titled 'Why your score is what it is'" conflicts with N15, whose allowed differences don't include a new title. Built: the Basic page keeps today's heading ("Why AI isn't recommending you more, and what's working"), and "Why your score is what it is" is P08's outline label for it. Proposed: say so in P09.next.
- **LLD 8.1.2:** the Summary page's narrative refers to the findings' section by number; in Standard and Enhanced that is "Why, and what to do next" (built).
- **P07.beyond.identity:** the LLD's ABR link and the ABN number aren't in the contract's tile copy. Built to the contract (status, entity, date); the ABN shows only when it couldn't be checked.
- **Today's PDF has no general-advice list** (Part 4 found this). Basic's "general advice (evidence-backed)" therefore adds nothing; general advice appears only in What to do next.
- **Tailwind v4:** arbitrary `min-[…]` breakpoints don't combine with the named ones (`sm:`, `md:`) on the same property. New screens should use one kind per property (token-map.md platform section).

## Memory and processes (this session)
- Start: 7.45 GB free, 0 node processes.
- Every Playwright run had its own `next dev` server, with ≥ 6 GB free at its start; peak tree ≤ 5.26 GB.
- Claude Code stopped the Part 6 queue for low system memory while responsive shard 1 was starting. Its processes were gone afterwards (0 repo node processes, 0 browsers, port 3000 free).
- End: 7.87 GB free, 0 node processes.

## Tests skipped by the testing-scope rules (Parts 6–7)
- Full suites: not run (not asked). No `next build`.
- `responsive-shell` (8 shards) and the `13-s01-beyond-ai` re-run: not run (see "Read first", point 2).
