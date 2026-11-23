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

---

# Parts 8–12 (resumed session, 23 Nov 2026)

Resumed with the v1.11 `UPDATE-HERE.md` step: pack v1.11 copied and committed (`b9ce9ebc`; LLD v1.7, runbook v1.6, contract v1.3 and the prototype HTML, sprint prompts S01–S10; the contract typecheck passes). Start of this session: `origin/main` = `f1d9ffdb` (checked with `git fetch origin`), local `main` = that plus the 14 S01 commits listed in the update step, tree clean apart from Sri's three untracked items. Free memory 7.44 GB, 0 node processes.

## Before Part 8: outstanding Playwright (all passed; no Part 6 follow-up needed)

- `tests/e2e/responsive/responsive-shell.spec.ts`, 8 shards (`--fully-parallel --shard=i/8`, fresh server each): **94 of 94 passed** (12 × 7 + 10). Peak tree 5.92 GB, lowest free 1.88 GB (above the 1.2 GB stop), 0 leftovers, port 3000 free after each.
  - The first attempt failed in every shard's `beforeAll` in under 20 s: `duplicate key value violates unique constraint "audits_org_audit_number_idx"`. The cause was rows the previous session's stopped shard 1 left in `visibleau_e2e` (its `afterAll` never ran): org `responsive-9628eba8` and a sample audit #1 under the shared `__sample__` org, both made at 19:34:32 on 23 Nov. Removed the same way the spec's `afterAll` does (a scratch script that refuses any database but `visibleau_e2e`); the re-run passed.
- `tests/e2e/13-s01-beyond-ai.spec.ts` re-run: **2 of 2 passed**; `.qa/screens/S01/P07-{1240,390}-{light,dark}.png` retaken with the four-column layout at 1240.

## Read first (Parts 8–12)

1. **S01 is finished: Parts 8–12 are committed** (`7eefae34`, `35760774`, `63fab7fd`, `c2afabfa`, `84a0dc7b`, plus the screenshot spec `b86c754f`). Nothing is pushed.
2. **Playwright not run (memory)**: these must pass before the push, because Part 11's ABN field is live on push, and before `report_v2` is switched on.
   - Claude Code stopped Part 11's queue for low system memory after 8 of its 21 runs. All 8 had passed: 02, 03, 04, 05, 07, 10, 11-s01-part0, 14-s01-abn. As its notice says, I didn't restart it.
   - Not run:
     - `tests/e2e/responsive/responsive-shell.spec.ts`, 8 shards (`--fully-parallel --shard=1/8` … `8/8`);
     - `tests/e2e/sprint2/sprint2-workflow.spec.ts`, 2 shards. Shard 1 was 9 tests in, all passing, when it stopped; its `afterAll` didn't run, so the spec's rows may be left in `visibleau_e2e`;
     - `tests/e2e/sprint3/sprint3-visibility.spec.ts`;
     - `tests/e2e/sprint9/s9-autopilot-e2e.spec.ts`, 2 shards.
   - Not re-run after Part 12: 02-brands-list, 04-brand-detail, 07-acceptance and sprint4-reports. They are mapped to Part 12 but passed after Part 11, and Part 12 changed only the portal page and the plan-gate helper.
   - After that stop I ran only single specs in the foreground: 05-cross-org-isolation (9/9) for Part 12, and the screenshot spec (2/2). Free memory was 7.2–7.4 GB before each.
   - Every other mapped spec in every part passed (details per part). Since Part 6, `responsive-shell` has passed twice in full (94/94 before Part 8, and after Part 9).
3. **Found and fixed on the way:**
   - Part 7's reports list sent every row's whole `contents_snapshot` on each 4-second poll (Part 9);
   - the Enhanced refresh read just-written results with a millisecond time and missed them (Part 9);
   - the snapshot held the workspace, brand and trend audit ids (Part 8, amendment 41).
4. **One live call from a test, once.** In Part 9 the Part 8 tier test generated an Enhanced report before it stubbed the refresh runners. The real site runner ran once: a crawl of the fixture's made-up domain through the guarded fetcher, and a Wikipedia search. The test now stubs the runners, and the rows it left in `visibleau_integration` were removed.
5. **Deviations to decide** are in their own section below. The main ones:
   - the Enhanced refresh runs inside the generator's account-wide pool (no separate `brand_id` key) and re-runs the whole technical audit for crawler access;
   - P13 links are signed when the page loads (no new route, so no new `serviceDb` read);
   - the cover line's colour on the navy cover;
   - a Basic report on Agency gains the cover's name line, which N15 doesn't list.

## Part 8. Report tiers: plans, page sets, picker, schedules, server enforcement — `7eefae34`

- **`lib/reports/report-tier-choice.ts`** (new): `chooseReportTier` decides a report's tier on the server from the workspace's live plan. A requested tier is kept when the plan includes it, else it's "over the limit". With none requested: the brand's saved `default_tier` when the plan includes it, else the plan's highest. Also `tierNotInPlanBody` (402 `{ error, code: "report_tier_not_in_plan", maxTier }` in P08.overLimit's words), `loadTierNames` (the workspace row, newest wins), `tierOptionsFor` (the P08 cards; a locked tier names the plan it needs) and `workspaceTierOptions`. Listed in `tests/helpers/plan-gates.ts` `DIRECT_GATES` (it reads `effectiveTier`).
- **Generate route** (`app/api/brands/[brandId]/reports/generate/route.ts`) takes `tier` (an enum; anything else is 400). With `report_v2` on:
  - above the plan: 402, and nothing starts;
  - the tier asked for becomes the brand's default;
  - contents are saved only for Standard and Enhanced on Agency and up (a Basic report drops them);
  - the event and the 202 carry the tier.
  With `report_v2` off the route is today's (the tier is ignored). Free and Starter keep today's 403 `plan_required`: the existing Growth gate runs first.
- **Preferences route:** PUT refuses a `defaultTier` above the plan with the same 402. **Panel view:** gains `tiers` and `defaultTier`.
- **Generator** (`inngest/functions/generate-narrative-report.ts`):
  - reads the active schedule's `report_tier`, the brand's own schedule before the workspace-wide one;
  - passes the route's tier for a manual report;
  - caps the tier at the plan in `reportV2ForGeneration`, with an operator log line `report_tier_capped` (a plan with no reports gets today's report, Basic);
  - logs `report_generated` with tier, plan and source. Part 7's hard-coded "enhanced" is gone.
- **Delivery schedules:**
  - `POST /api/organizations/:orgId/delivery-schedules` accepts `reportTier`, kept only while `report_v2` is on.
  - The form shows "Report type" from the new `GET /api/report-tiers`: the workspace's names, only the plan's tiers, default Basic, help "Scheduled reports use this report type.".
  - Each schedule shows "· {name} report".
- **P08 picker** (`components/domain/reports/report-tier-picker.tsx`):
  - three cards (Segmented `cards`, in the app's look), a radiogroup named "Report type"; arrow keys move and select among the tiers the plan includes;
  - a locked tier is `aria-disabled`, named "{tier}, available on {plan} and up", with the lock marker and "Available on {plan} and up · Upgrade" (to /pricing). The Upgrade link sits outside the radio so it stays reachable by keyboard.
- **The panel with a tier:**
  - Basic shows P08.basicNote instead of the lists; its second sentence only when Standard is in the plan.
  - The outline is "Report outline · {name}" with the tier's pages ("Why your score is what it is" for Basic; "Beyond AI answers" for Enhanced; pages the tier adds in 600).
  - The button reads "Generate {name} report", and Generate sends `{ periodType, tier, contents }` (no contents for Basic or below Agency). Save without generating saves `defaultTier`.
  - A 402 `report_tier_not_in_plan` shows its words inline, and the picker falls back to the plan's highest tier, locking the ones above.
  - Initial focus goes to the selected card.
- **Loading (P08.states.loading):** a new `app/(auth)/brands/[brandId]/reports/layout.tsx` reads `report_v2` on the server and passes it to the page (`components/domain/reports/report-v2-context.tsx`).
  - Flag on: Generate opens the panel at once with its skeleton (`ReportContentsPanelLoading`: three tier cards, then rows) while the view loads. The page's button never says "Generating..." for that.
  - Flag off: the page is exactly today's. Generate starts the report directly, with no view request.
- **The pricing page's "Reports" row:**
  - `lib/pricing/tiers.ts` now holds the report types' names and appendix E's descriptions; `report-tiers.ts` re-exports them, so there is one copy.
  - The row is built from each plan's `maxReportTier` and `reportTierNames`: Free and Starter "—", Growth "Basic and Standard", Agency plans "Basic, Standard and Enhanced, chosen per client report, with your own names". It sits right after "PDF export", with a footnote "What each report contains" (appendix E).
  - It shows only while `report_v2` is on globally (`components/domain/pricing/load-report-tiers-claim.ts`). The loader reads nothing without `DATABASE_URL`, as `registry-store.ts` does, so the unit tests and a build without a database show today's table.
- **Snapshot (LLD amendment 41):**
  - `contents_snapshot.reportData` no longer holds the workspace's id, the brand's id or the other audits' ids on the trend. Rendering puts them back from the report's own row (`snapshotReportData(snapshot, { organizationId, brandId })`).
  - Costs never reach the render input, and the report's Google block carries no provider name.
- **New tests.** RED on the parent: 23 failed. The picker and panel-tier files can't load there. 14 pass on both because they hold today: Free and Starter refused; everything with `report_v2` off; the table with the setting off; one schedule case where Part 7's hard-coded Enhanced matched.
  - `tests/integration/report-tiers.integration.test.ts` (22):
    - per plan: Free and Starter 403, Growth 402 for Enhanced, Agency all three; an unknown tier 400;
    - the defaults, the default saved, Basic dropping contents, flag off;
    - PUT of a default above the plan 402; the view's default and locks; `/api/report-tiers` (off, the agency's names, Growth's lock);
    - the generator: a manual tier; a schedule's tier, the brand's own first; the cap with its log line; flag off is today's report;
    - the snapshot holds no cost (`llm_cost_usd` seeded), no cost/usd/spend/provider key, and no workspace or brand id;
    - delivery schedules keep the type; an unknown one is 400; flag off stores Basic.
  - `tests/unit/components/report-tier-picker.test.tsx` (4) and `report-contents-panel-tiers.test.tsx` (11, including the page's skeleton).
  - `delivery-schedule-report-type.test.tsx` (2).
  - `tests/unit/pricing/pricing-reports-row.test.tsx` (7): the plan-claim guard for the row (words from `maxReportTier`, no price or plan name, setting-aware, the loader).
- **Existing tests changed**, with the contract line quoted:
  - `tests/unit/components/report-contents-panel.test.tsx` (Part 5's own): the props helper gains `tierOptions` and `initialTier`.
    - Save's body gains `defaultTier`: "Save without generating … (with default_tier)" (P08.footer).
    - Growth's Generate body gains `tier`: "the existing generate route with { periodType, tier, contents }" (P08.footer).
  - `tests/e2e/12-s01-report-contents-panel.spec.ts` gains a Part 8 test: Basic chosen by keyboard, the note, the outline, the tier sent.
- **Guards caught two things, fixed before the commit:**
  - `plan-names`: a `{tierName}` JSX child and `${o.tier}` in a template literal read as a plan code printed raw. Renamed the variable to `typeName` and used fixed test ids.
  - `no-silent-fetch-fallback`: biome split `.json().catch(...)` over lines. Moved it into a one-line `failureBody` helper.
- **Runs:**
  - related: 300 files, 3,396 passed, 7 skipped; its one failure was the plan-names guard above, re-run green;
  - 89 guard files + the tests naming the changed files: 129 files, 2,381 passed; its one failure is the one above, fixed and re-run green;
  - tsc clean; biome 0 new per changed file.
- **Playwright** (one at a time, a fresh server each), all passed:
  - 12-s01-report-contents-panel 3; 06-region-and-pricing 11; 09-google-surfaces 5; 11-s01-part0 5; 13-s01-beyond-ai 2;
  - sprint4-reports 19; s8-governance 13;
  - qa f02-region 8, f09-feature-flags 3, f11-pricing-checkout 10, f06-public-pages 4.
  - Peak tree ≤ 5.1 GB, lowest free 2.56 GB, 0 leftovers.

## Part 9. Enhanced checks before rendering (D-RT4, P08 checks list, P17 statuses) — `35760774`

- **Window logic, one place** (`lib/reports/enhanced-checks.ts`):
  - the windows: identity 30 days, AI crawler access 7, YouTube 7 (only when a channel is linked and the code gate is on), technical 30;
  - `planEnhancedChecks` (reuse / run / not linked / off), read from the same tiles the report prints (`getBeyondAiAnswers`);
  - `applyRefreshOutcomes`: a check that ran but left no newer result prints "Couldn't check on {date}: {reason}" with the refresh's date, never the old result as if fresh. The outcomes ride along as appendix D's `beyondAi.refreshed`;
  - the P08 list's lines.
- **The refresh** (`lib/reports/enhanced-refresh.ts`):
  - reads the checks, runs only the stale ones through their existing functions, waits at most 5 minutes in all (`Promise.race`), reads again and says what happened to each;
  - a runner that throws is a failed check, never a failed report;
  - operator log lines `enhanced_check_refreshed` (check, result, reason).
- **The runners** (`lib/reports/enhanced-check-runners.ts`):
  - **site**: the existing technical audit runner, `runTechnicalAuditInline(null, brandId, { emitComplete: false })`. One run refreshes identity (the ABR lookup with the GUID), AI crawler access (robots.txt) and the technical score. `runTechnicalAuditInline` now takes `auditId: string | null` (the column allows it) and an option not to send `technical-audit/complete`, so a report's refresh starts none of that event's jobs. Every other caller passes an audit and gets exactly what it did before.
  - **youtube**: the existing presence check (`buildYoutubePresenceAuditRow`), stored as the monthly cron stores it but under the workspace's RLS context (no `serviceDb`).
  - Both fetch customer sites only inside the functions they call (S00B's guarded fetcher); no new fetch.
- **Generator** (`inngest/functions/generate-narrative-report.ts`): the tier is decided first (`decideReportTier`). Basic and Standard are built and stored as in Part 8. An Enhanced report:
  - is written at once with no contents (the Reports page says "Running checks…");
  - then step **`refresh-enhanced-checks`** runs the stale checks;
  - then step **`write-report-snapshot`** builds its contents and snapshot as of then, with the outcomes, before `report/generated` starts the PDF.
  A run whose first step finished before this change (its step returned the id alone) is still read correctly.
- **One refresh at a time:** the generator runs in `POST_AUDIT_POOL` (account-wide limit 1), so two Enhanced reports for one brand never refresh together. The second finds the first one's results fresh and runs nothing (tested). There is no separate `brand_id` key (see deviations).
- **P17 statuses:**
  - `ReportStatus` gains `running_checks` while an Enhanced report's contents aren't stored; the stall rule still turns it into Failed;
  - the Reports page, the report page and `ReportStatusBadge` say "Running checks…", and the page keeps polling.
  - **Found and fixed:** since Part 7 the reports list sent every row's whole `contents_snapshot` (the PDF's render input) on each 4-second poll. The list now selects every column but the snapshot, plus whether one is stored, and `reportForPage` never returns a snapshot.
- **P08 checks list** (`components/domain/reports/report-checks-list.tsx`), shown for Enhanced only:
  - "Checks before this report", one row per check, from the view's `checks` (built only for a plan that includes Enhanced): "Checked {age} · will reuse", or "… · will run again (about 1 minute)" in `--warning`;
  - "No channel linked · shown as not linked"; "From audit #{n}" for the directory profiles;
  - the contract's note under it.
- **Found by the new test and fixed:** the read after a refresh used a millisecond `Date` as its "as of" time. A row the runner had just written (Postgres stores microseconds) could fall just after it and be ignored, so the refresh reported its own fresh result as "didn't complete". It now reads one second ahead.
- **Tests** (new; RED on the parent: 9 failed and `enhanced-checks.test.ts` can't load; 3 pass on both because they hold today: no list for Standard and Basic, and Basic and Standard never refresh):
  - `tests/unit/reports/enhanced-checks.test.ts` (7, fixed clock, recorded runners): the windows; only stale checks run (the site checks once for all three, YouTube alone); nothing runs when fresh; the timeout and "didn't complete" paths still print every tile; a throwing runner.
  - `tests/integration/enhanced-refresh.integration.test.tsx` (6), with recorded runners and the step order checked:
    - the row first ("Running checks"), the stale checks once, then the snapshot (`refreshed`, the new score);
    - a second Enhanced report runs nothing;
    - the timeout path prints "Couldn't check on {date}: the check took too long", and the PDF renders;
    - Basic and Standard never refresh;
    - the panel's list says what the refresh will do.
  - `tests/unit/communication/report-running-checks.test.tsx` (4) and `tests/unit/components/report-checks-list.test.tsx` (2).
- **Existing tests changed:**
  - `tests/integration/report-tiers.integration.test.ts` (Part 8's) now stubs the refresh runners: an Enhanced report refreshes its checks since this part.
  - **Its first run under Part 9 used the real runners once**, for its fixture brand: a crawl of the fixture's made-up domain through the guarded fetcher, and a Wikipedia search, i.e. one live call from a test. The fixture rows that run left in `visibleau_integration` were removed (one org, by a script that refuses any other database).
  - `tests/e2e/12-s01-report-contents-panel.spec.ts` gains a Part 9 test: the five rows with their lines, and none for Standard.
- **Runs:**
  - related: 95 files, 1,145 passed;
  - 89 guard files + the tests naming the changed files: 129 files, 2,303 passed;
  - the four report integration files together: 33 passed;
  - tsc clean; biome 0 new.
- **Playwright** (fresh server each), all passed:
  - 12-s01-report-contents-panel 4 (the final P08 screenshots `.qa/screens/S01/P08-{1240,390}-{light,dark}.png`: picker, plan, outline, checks list);
  - sprint4-reports 19;
  - responsive-shell 8 shards 94 of 94 (12 × 7 + 10).

## Part 10. Reports list, report names, cover name (P17, P18, P09.cover) — `63fab7fd`

- **P17** (`app/api/brands/[brandId]/reports/route.ts`, `app/(auth)/brands/[brandId]/reports/page.tsx`), only while `report_v2` is on:
  - each row carries `tierName`: the name in its snapshot (a later rename never changes it), else the workspace's name for its tier (a report from before tiers is Basic, so the agency's Basic name). It is read from the snapshot in SQL (`contents_snapshot->>'tierName'`), never by sending the snapshot.
  - The page shows it as a neutral pill in the Report cell (`p17-report-type`), and the download link is named "Download {name} PDF for {period}".
  - Statuses as in Part 9 ("Running checks…" → "Generating..." → Ready), with the existing 4-second polling.
- **P18** ("Report names" on `/settings/report-branding`, only while `report_v2` is on): `components/domain/branding/report-names-card.tsx` under the existing cards (`ReportBrandingForm` gains an optional `footer` slot, default nothing). It has:
  - three labelled inputs with their help;
  - a live cover preview (`aria-live="polite"`) with the Enhanced name in capitals;
  - "Save names", disabled until something changes and while a name breaks the rule, with the error under the field (tied by `aria-describedby`); "Reset to defaults" (still needs Save); inline "Report names saved.";
  - the read-only "What each report contains" table (the saved names, appendix E's words).
  - The rule lives in `lib/branding/report-tier-name-rules.ts` (pure; the card imports it): 1–24 characters after trimming, no control characters, unique ignoring case, the same as the migration's CHECK.
- **`PUT /api/report-branding { reportTierNames }`:**
  - below Agency: 403 `plan_required` (`tierRefusal`, amendment 30); not an owner or admin: 403; `report_v2` off: 404; a name that breaks the rule: 422 with the contract's words;
  - saves on the workspace row (made if the workspace has none), trimmed; the defaults are stored as null;
  - an audit-trail entry `report_branding_changed` with `changed: ["reportTierNames"]`, as other branding changes have;
  - every other PUT body is handled exactly as before.
- **P09.cover:** with a cover name (Agency and up, from the snapshot) the PDF prints it in capitals on its own line directly above "AI Visibility Report", JetBrains Mono 500, 8.5/12, tracking .14em, #FCD34D (see deviations). Growth and every report before tiers show no line; the rest of the cover is unchanged.
- **Tests** (new; RED on the parent: 11 failed, and the card's file can't load; 4 pass on both because they hold today: an analyst refused, the flag-off states, no line without a name, saving the defaults stores nothing):
  - `tests/integration/report-tier-names.integration.test.ts` (10): saved and trimmed with the audit trail; the defaults stored as null; 422 for each rule (25 characters, empty, a line break, the same ignoring case); an XSS payload stored as typed; Growth 403 `plan_required`; an analyst 403; flag off 404.
  - `tests/integration/report-list-tiers.integration.test.ts` (2): the snapshot's name, else the workspace's name for the tier; "running_checks"; no snapshot, `hasSnapshot` or render input in the response; flag off, no names.
  - `tests/unit/components/report-names-card.test.tsx` (5).
  - `tests/unit/reports/report-cover-tier.test.tsx` (3): the line above the title; the only addition; an XSS payload printed as text.
  - The snapshot keeping the name: the list test (a row named "Gold" while the workspace's names differ) and Part 7's snapshot test.
  - e2e: a Part 10 test in `12-s01-report-contents-panel.spec.ts` (the pill on the list; Report names with the live preview), with screenshots `.qa/screens/S01/P17-{1240,390}-light.png` and `P18-{1240,390}-light.png`.
- **Runs:** related 51 files, 789 passed; 89 guard files + the tests naming the changed files: 124 files, 2,267 passed; tsc clean; biome 0 new.
- **Playwright:** 12-s01-report-contents-panel 5 of 5 (run twice: the second retook P17/P18 in light), sprint4-reports 19 of 19; peak tree ≤ 4.77 GB, lowest free 2.16 GB, 0 leftovers.

## Part 11. ABN field and ABN suggestion (LLD 8.8.6, P01) — `c2afabfa`

- **ABN field (P01.abnField; not flagged: it was a missing field):**
  - brand settings (`components/domain/brand/brand-detail-client.tsx`) gains "ABN" under "Also known as", with the help "11 digits, from the Australian Business Register";
  - spaces as typed are fine and the digits are saved; empty means no ABN;
  - the ATO digit check runs on blur and on Save (`lib/brands/abn.ts`, using the existing `abnCheckDigitsValid` from `lib/product.ts`), with the contract's two messages under the field; Save is blocked while the ABN is invalid;
  - read-only until Edit, and Edit is for owners and admins (`manage_brands`).
- **`PATCH /api/brands/:id`** accepts `abn`, with the same rule (400 `abn: …`). A changed ABN:
  - goes in the audit trail (`brand_abn_changed`, a new action);
  - when not empty, queues the entity check with `after()`. That is `lib/brand-entity/entity-check.ts` `runBrandEntityCheck`: the lookups the technical audit runs for Brand & Entity (the ABR with the GUID, Wikipedia AU, .au), stored as a `brand_entity_scores` row under the workspace's RLS context, so the identity tile updates now rather than at the next audit.
- **ABN suggestion (P01.abn; flag `abn_suggestion`):**
  - `searchAbnByName(name, { postcode, state })` in `lib/brand-entity/abn-lookup.ts`:
    - the ABR's `MatchingNames.aspx` (the JSON method takes a name only), kept to current names that are the business's name;
    - filtered in code by postcode, else state;
    - a suggestion only when exactly one ABN is left and `AbnDetails` says it is Active;
    - with no GUID or with `ABN_LOOKUP_BYPASS` set, no lookup at all; the ABR not answering is "failed", never a guess.
  - `GET /api/brands/:id/abn-suggestion`: for a brand with no ABN in the Australian market, searched once and kept in `brands.abn_suggestion` until answered. A search that found nothing isn't repeated for 30 days (a failed one, for a day). Any member who can see the brand.
  - `POST { action: "confirm" | "dismiss" }` (owners and admins): Confirm writes `brands.abn` (the same column as the field), goes in the audit trail and queues the entity check; Not mine hides it for good. Flag off: GET says there's none and POST is 404.
  - The banner (`components/domain/brand/abn-suggestion-banner.tsx`): "Is this your ABN?", the ABR's line in mono ("17 701 710 947 · ASTORIO GROUP PTY LTD · NSW 2765 · Active"), "Found on the Australian Business Register by your business name.", Confirm / Not mine. After Confirm, the field shows the ABN with "ABN saved. We'll check the register now.".
- **Fixed-host client list:** `tests/unit/fetch/no-unguarded-fetch.test.ts`'s entry for `lib/brand-entity/abn-lookup.ts` (host `abr.business.gov.au`) now counts 2 calls: the name search and its confirmation share one new call site.
- **Recorded ABR responses** (S01 part 1's, 23 Nov 2026) in the tests; no live ABR call from any test (fetch is stubbed for `abr.business.gov.au` only, and the entity check is recorded).
- **Tests** (new; RED on the parent: 11 failed, including the fetch guard's count, and the suggestion test file can't load; 8 pass on both because they hold today: an analyst refused, flag-off states, the guard's other checks):
  - `tests/unit/brands/abn-suggestion.test.ts` (8): the field's rule; the search with recorded responses: one match, another place, two ABNs, not Active, no GUID or bypass, the ABR not answering.
  - `tests/integration/abn-routes.integration.test.ts` (8):
    - PATCH: digits saved, audit trail, entity check queued; empty clears it; the same ABN changes nothing; the bad checksum and too few digits in the contract's words; an analyst 403;
    - the suggestion: looked up once and kept; Confirm writes the ABN, with the audit trail and the check; Not mine for good; none with an ABN, outside Australia or with the flag off; an analyst can't answer.
  - `tests/unit/brands/brand-abn-field.test.tsx` (5).
  - `tests/e2e/14-s01-abn.spec.ts` (new, 2): the banner and Confirm with the suggestion route stubbed; the checksum message. Screenshots `.qa/screens/S01/P01-abn-{1240,390}-{light,dark}.png`.
- **Runs:**
  - related: 247 files, 2,565 passed, 7 skipped;
  - 89 guard files + the tests naming the changed files: 135 files, 2,471 passed;
  - tsc clean; biome 0 new (the brand page and brand settings keep their one existing diagnostic each).
- **Playwright:** 02-brands-list 8, 03-brand-create 10, 04-brand-detail 9, 05-cross-org-isolation 7, 07-acceptance 5, 10-not-found-and-errors 4, 11-s01-part0 5, the new 14-s01-abn 2: all passed (peak tree ≤ 5.25 GB, lowest free 2.61 GB). Then Claude Code stopped the queue for low system memory: sprint2-workflow (2 shards), sprint3-visibility, s9-autopilot-e2e (2 shards) and responsive-shell (8 shards) are not run (see Read first).

## Part 12. Client portal reports (LLD 8.1.6, P13) — `84a0dc7b`

- **`lib/client-portal/portal-reports.ts`** (`loadPortalReports`), under the invite's workspace RLS context: the invite's brand's generated reports with a stored PDF, newest first (up to 100). Each row has:
  - the report type's name: the snapshot's, else the workspace's name for its tier, so an old report is Basic;
  - the period, "Audit #{n}", and the Visibility the PDF printed (from the snapshot's headline; "—" for reports from before S01);
  - when it was made (in the workspace's time zone);
  - a download link signed for 10 minutes (`getDownloadUrl(path, 600)`, the existing storage pattern; never a public bucket).
  Only three fields are read from the snapshot, in SQL. Listed in `DIRECT_GATES` (it reads the plan for the names).
- **The portal page** (`app/client-portal/[inviteToken]/page.tsx`), only while `report_v2` is on for the agency's workspace:
  - the "Reports" card (`components/domain/portal/portal-reports.tsx`, P13): "AI visibility reports prepared for you.", the table Report (neutral pill) | Period (sticky on a phone) | Based on | Visibility (by band, D-BAND) | Generated | Download PDF (named "Download PDF for {period}");
  - the empty state "No reports yet. Your agency will share them here.";
  - after 10 minutes each link becomes "This download link has expired. Try again" (reloads for fresh links).
  Flag off: the portal as today.
- **Isolation:** only the invite's brand, never another brand of the same workspace or another workspace's, and never a report without a PDF (integration test). `tests/e2e/05-cross-org-isolation.spec.ts` gains a describe:
  - user 2 gets 404 for Org1's reports list, its report contents panel and Generate;
  - a portal link lists only its own brand's report.
- **Tests:** `tests/integration/portal-reports.integration.test.tsx` (2; RED on the parent: the list test fails, the flag-off test holds today) with the storage adapter recorded (no storage call). Plus the 05 extension.
- **Runs:** related 9 files, 76 passed; 89 guard files + the tests naming the changed files + `cancelled-plan-gates`: 100 files, 1,692 passed (the plan-names guard caught a `{r.tierName}` JSX child in the portal table: fixed with a helper and re-run green); tsc clean; biome 0 new.
- **Playwright:** 05-cross-org-isolation 9 of 9 (with the two new tests), run alone in the foreground after the memory stop (peak tree 4.36 GB, lowest free 2.97 GB, 0 leftovers); the other specs mapped to Part 12 are in Read first.

## PDF page images (the report-back's)

Rendered from recorded fixtures only, as Part 7 did; no production data in the repo:
- **Hero #54:** `reportDataFixture("39")`.
- **TechCore #52:** the #39 fixture at 0 of 40, with Part 3's evidence: kangaroo-it.com.au in 27 answers, Claude's "unable to find" sentence, Local Business Guide not linked, ABN not verified.

Splice Marketing is on Agency, so every cover names its tier.
- The PDFs: `.qa/screens/S01/pdf/{hero54,techcore52}-{basic,standard,enhanced}.pdf`.
- Every page at 1240 px wide: `.qa/screens/S01/pdf/{fixture}-{tier}-{n}.png`, 49 images.

| | Basic | Standard | Enhanced |
|---|---|---|---|
| Hero #54 stand-in | 7 pages | 8 | 9 |
| TechCore #52 shape | 8 | 8 | 9 |

- **Contact sheets, one per tier:** `.qa/screens/S01/pdf-basic-sheet.png`, `pdf-standard-sheet.png` and `pdf-enhanced-sheet.png`.
- **What to look at:**
  - the cover's name line;
  - Standard and Enhanced page 5–6 "Why, and what to do next": findings first, then measured actions, Splice Marketing's own action, done since the last report, general advice;
  - Enhanced page 7 "Beyond AI answers", with the directory profiles tile;
  - the method page's question mix and checks rows.
- **N15 for Basic:** `tests/unit/reports/report-v2-pdf.test.tsx` passes after Parts 8–12, for both fixtures. Every page of a Basic report matches today's, and the method page adds only the question mix line.
  - One more difference on Agency and up: the cover's report name (P09.cover, D-RT3), which N15's list doesn't name. Proposed: add it to N15's allowed differences.

## Other screens (screenshots in `.qa/screens/S01/`)

```
P08 · Report contents panel with the report type (S01 parts 5, 8, 9)
Nodes: 10 of 10 (header, tier, basicNote, measured + item, agency, addAction, checks, sections, outline, footer)
States: loading ✓ (skeleton at once) empty ✓ error ✓ planLock ✓ overLimit ✓ (402 inline, falls back) flagOff ✓
Acceptance: ✓ tier above the plan refused by the server (402); ✓ Growth generates Basic/Standard, can't curate;
  ✓ Enhanced lists each check with its age and re-runs only stale ones; ✓ re-render uses the snapshot;
  ✓ the PDF has the tier's pages (render + integration tests)
Screenshots: P08-1240-light, P08-1240-dark, P08-390-light, P08-390-dark (picker, plan, outline, checks list below)

P17 · Brand → Reports (part 10; statuses part 9)
Nodes: header, generate, list, table (Report pill in the existing Report cell; existing columns kept)
States: loading ✓ empty ✓ error ✓ noPermission ✓ (existing) flagOff ✓ (no pill, Generate as today)
Acceptance: ✓ every row shows its tier name, old rows Basic; ✓ Running checks… → Generating... → Ready;
  ✓ Try again uses the snapshot (Part 7)
Screenshots: P17-1240-light, P17-390-light

P18 · Report branding → Report names (part 10)
Nodes: card, basic, standard, enhanced, preview, actions, contents
States: error ✓ (under the field) flagOff ✓; planLock: the existing locked page; loading: server-rendered
Acceptance: ✓ names on the cover (Agency and up), in P17, P08 and the portal; ✓ old reports keep their snapshot's
  names; ✓ 403 plan_required below Agency, 422 invalid; ✓ XSS stored and shown as text
Screenshots: P18-1240-light, P18-390-light

P01 · ABN field and suggestion (part 11)
Nodes: abnField, abn (banner)
States: flagOff ✓ (no banner, no request); read-only until Edit (manage_brands)
Acceptance: ✓ the banner never shows when brands.abn is set; ✓ Not mine hides it for good
Screenshots: P01-abn-1240-light, -dark, P01-abn-390-light, -dark

P13 · Client portal: reports (part 12)
Nodes: header (existing), reports, table
States: empty ✓ error ✓ (expired link: Try again) flagOff ✓
Acceptance: ✓ only the portal's brand reports listed; ✓ signed URLs expire (10 minutes)
Screenshots: P13-1240-light, P13-390-light

Pricing "Reports" row (part 8): pricing-reports-row-off-1240.png, pricing-reports-row-on-1240.png
Schedules "Report type" (part 8): component tests only (no Playwright spec covers the schedules form)
```

## Commits (this session)

```
b86c754f test(e2e): S01 report-back screenshots -- the pricing page's Reports row ... and the portal's Reports card
84a0dc7b feat(portal): S01 part 12 -- reports in the client portal ...
c2afabfa feat(brands): S01 part 11 -- the ABN field and the ABN suggestion ...
63fab7fd feat(reports): S01 part 10 -- report names and the report type on the list and the cover ...
35760774 feat(reports): S01 part 9 -- Enhanced checks before rendering ...
7eefae34 feat(reports): S01 part 8 -- report tiers enforced ...
b9ce9ebc docs: client-enhancements pack v1.11 (decisions on S01 Parts 6-7, contract v1.3)
```

`git log origin/main..main --oneline` (`origin/main` = `f1d9ffdb`) holds 22 commits:
- the 14 S01 commits listed in the v1.11 update step, ending with the Parts 6–7 report `bfb80fd9`;
- the seven above;
- this report's commit.
Nothing is pushed.

`docs/prototypes/token-map.md`: amendment 42's Tailwind note added to the platform section (allowed by the update step), committed with this report.

## Memory and processes (this session)

- Start: 7.44 GB free, 0 node processes.
- Every Playwright run had its own `next dev` server, with ≥ 6 GB free at its start; peak tree ≤ 5.92 GB, lowest free 1.7 GB. After each run: 0 leftovers and port 3000 free.
- Claude Code stopped Part 11's background queue for low system memory, as described in "Read first". Afterwards: 0 repo node processes, no queue shells, port 3000 free, 7.29 GB free.
- End: 7.28 GB free, 0 repo node processes.

## Tests skipped by the testing-scope rules (Parts 8–12)

- Full suites: not run (not asked). No `next build`.
- Playwright: the not-run list in "Read first".

## Deviations and proposed changes to the documents (Parts 8–12)

- **Enhanced refresh and its concurrency (Part 9):**
  - The refresh is a step inside `generate-narrative-report`, which already runs one at a time account-wide (`POST_AUDIT_POOL`, limit 1). So refreshes are one per brand, and indeed one per account; the LLD's separate `brand_id` key isn't added (a second constraint or a separate function would change the post-audit pool's tested shape).
  - Cost: an Enhanced refresh holds that pool for up to 5 minutes (usually about a minute), delaying other post-audit jobs meanwhile.
  - Proposed: the LLD says "concurrency: one at a time per account (POST_AUDIT_POOL)", or Sri chooses a separate function with its own key.
- **AI crawler access re-runs the whole technical audit (Part 9):** the tile reads `technical_audits`, and the existing function that writes robots findings is the technical audit runner (a crawl of up to 20 pages). So a 7-day-old crawler check re-runs the technical score too, not "one robots.txt fetch" as LLD 8.1.7 says. Proposed: the LLD says so, or a robots-only result store is added later.
- **Refresh costs (Part 9):** the ABR and robots calls are free and the YouTube API is quota, not money. There is no existing cost log for these checks, so each refresh is an operator log line (`enhanced_check_refreshed`) and appears in the snapshot's `refreshed`; there is no `/admin/costs` line (LLD 14). Proposed: backlog.
- **P08 copy added (Part 9):**
  - "Not checked yet · will run again (about 1 minute)" for a check that has never run;
  - "Not checked · shown as not checked" for YouTube with the code gate off.
  The contract has neither case.
- **P17 (Part 10):**
  - The existing page's columns stay (Report | Period | Status | Actions), as P17's layout note asks. The report type is a neutral pill inside the existing Report cell, not a new column.
  - No pagination past 25 rows and no sticky column: the existing page has neither.
- **P18 plan lock (Part 10):** below Agency the whole Report branding page is already the existing plan-locked page (`PlanLockedPage`, `white_label_reports`), so the card's read-only locked state never shows. The API still answers 403 `plan_required` for names below Agency.
- **P09.cover colour and weight (Part 10):** the contract's #8A5A00 is for a white page; on this navy cover the tier line uses the amber the evidence block already uses (#FCD34D, well over 4.5:1). Only JetBrains Mono 400/500 are registered for the PDF, so the weight is 500, not 600.
- **P13 (Part 12):**
  - Download links are signed for 10 minutes when the page loads, rather than through a new signed-URL route: a route would have to resolve the invite token with a new `serviceDb` read (the portal page's existing bootstrap is the only one).
  - After 10 minutes each row says "This download link has expired." with Try again (reloads).
- **The snapshot (amendment 41):** it now leaves out the workspace and brand ids and the other audits' trend ids (rendering restores them from the row). Appendix D could list `reportData` with that note.
- **Generate without a tier (Part 8):** the route chooses the brand's saved default, else the plan's highest. A schedule whose tier the plan no longer includes is capped and logged. Proposed: LLD 8.1.7 states both.
- **Not done (privacy, LLD 12):** the data facts / FAQ / privacy draft don't mention ABR name lookups yet (`lib` has no data-facts file); Sri decides the wording.
## Push notes (the whole sprint)

1. **Migration 0154 first** (`db/prod-fixes/0154-s01-run1-precheck.sql` → `run2-apply` → `run3-post-check`; `run4-rollback` only to undo), after a pg_dump of `generated_reports`, `report_delivery_schedules`, `agency_brand_assets` and `brands`. Unchanged since Part 2: Parts 8–12 needed no schema change. The pushed code selects the new columns with every report, schedule, branding row and brand.
2. **Inngest resync: yes.** `generate-narrative-report` has two new step ids (`refresh-enhanced-checks`, `write-report-snapshot`, Part 9) and changed `generate-and-insert`'s return for Enhanced reports; `render-report-pdf` changed in Part 7. No function ids or event names changed and no function was added. Push when no report is being generated: a run that started before the push and resumes after it could meet a step it doesn't know (the StepNotFound risk seen before).
3. **Safe while an audit runs:** yes. Everything new runs only while `report_v2` (or `abn_suggestion`) is on, except Part 0 and the ABN field; the generator with `report_v2` off is today's. The technical audit runner's new options default to today's behaviour.
4. **Flags off:** `report_v2` and `abn_suggestion`. With `report_v2` off every report, the audit page, the Reports page, delivery schedules, Report branding, the pricing page and the client portal are today's.
5. **Live on push (not flagged):** Part 0's fixes and the ABN field in brand settings (Part 11).
6. **Before switching `report_v2` on** (names only): `ABN_LOOKUP_GUID` set and `ABN_LOOKUP_BYPASS` unset (identity checks and the ABN suggestion), `YOUTUBE_API_KEY` set (YouTube; without it the tile says "Not checked"). The pricing page's Reports row appears only when the flag is on globally, so turn it on per workspace first (as planned) and globally last.
7. **Before the push:** the Playwright specs listed as not run in "Read first" (responsive-shell 8 shards, sprint2-workflow 2 shards, sprint3-visibility, s9-autopilot-e2e 2 shards, and the re-runs after Part 12) must pass, because the ABN field (Part 11) is live on push. Use the runbook's "Run Playwright specs that were skipped for memory" kickoff with that list.
