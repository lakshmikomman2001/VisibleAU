# As-is verification: the client-enhancements LLD against the code

Repo path: `docs/lld/as-is-verification.md` · S00 Part 1 · 22 Nov 2026 · checked against `main` at `0124f30a` (code as pushed at `15f287b`, plus the design files).

Every statement marked VERIFY in `docs/lld/vunnara-client-enhancements-lld-v1.md` (v1.2), every file, table, column, function and event named in its section 5 (and the section 3 table), and the twelve questions of S00 Part 1. Status is **confirmed**, **different** (what the code does, with file:line) or **missing**. Where the code and the LLD differ, the code wins (runbook section 2) and this file wins over the LLD until the LLD is amended. Read-only: nothing was changed to match the LLD.

Totals: sections 3 and 5 and line 211: 97 confirmed, 18 different, 1 missing. Other VERIFY lines: see the table near the end. Part 1 questions: answered in full below.

## Proposed LLD amendments (read these first)

Each is one line; the evidence is in the section named in brackets.

**Data and naming**
1. **Flags store (17, 7A).** "The platform-settings store" is three tables: global values in `feature_settings` (key text PK **with a CHECK listing six Google keys**, `db/migrations/0145_google_ai_surfaces.sql:25-36`), workspace overrides in `org_feature_flags` (free-text `flag_key`, FORCE RLS since 0029, `db/schema/org-feature-flags.ts:4`), history in `feature_setting_changes` (`0145:38-48`). It can't hold new global keys without widening that CHECK: S00 Part 2 adds that as migration 0153 (flag keys). [1.4]
2. **Directory registry (7.7, 8.8.3, appendix B).** The "hard-coded list" is `DIRECTORY_REGISTRY` in `lib/directories/registry.ts:92` (the path the LLD plans for the new reader): 10 AU entries + 7 US (disabled), each with `key`, `name`, `domains[]`, `profileUrlPattern` (RegExp), `categories` (which types see it) and `enabled`. The planned table (`domain_pattern` PK, `kind`, `profile_url_hint`, `active`) has no key, no categories and no URL pattern; its rows must carry the existing fields or the existing behaviour (which directories a brand's card shows, profile-link validation, citation matching by host) changes. [1.1]
3. **Branded typing (5, 7A S2 backfill step 4).** `isBrandedPackPrompt()` no longer exists (a guard fails if it comes back). The one rule is `isBrandedPrompt(text, {name, domain})`, `lib/audit/flag-branded-prompts.ts:29`: the brand name pattern, or the domain stem (≥ 4 characters) in the text with punctuation removed. Stored packs are typed by it at `lib/audit/get-audit-prompts.ts:185-189`. [1.2]
4. **Categories (5, appendix A).** `CATEGORY_KEYS` has **28** keys, not 30 (`lib/prompts/templates.ts:17-47`); there is no IT-services key. [1.3]
5. **Aliases (7.7, 8.8.2).** `brands.aliases` doesn't exist. Detection already ignores spacing and checks the domain stem (`lib/audit/detect-mention.ts:113-136`), so the suggested aliases "techcoreit" and "TechCoreIT" add nothing for a brand named "TechCore IT"; aliases matter for genuinely different names. [1.6]
6. `prompt_pack` is **jsonb** (a string array), not a text array; `vertical` and `region` are Postgres enums; the brand list omits `audience`, `category_confirmed_at`, `classification_at`, `classification_error`, `client_tag`, `brand_token`. [section 5: Brand record]
7. A pack is 10 everyday questions plus **3 to 5** that name the business, not "up to 3" (N1 and section 5). [section 5: Building questions]
8. `{region}` comes from `resolveRegionLabel()` (`lib/brands/region-label.ts:43`: suburb → city → `primary_regions[0]` → region name → "Australia"), not `primary_regions[0]` alone. [section 5]
9. Paths: the Inngest runner is `inngest/functions/run-audit.ts` (no `lib/audit/run-audit.ts`); `brandReadyForAudit` is in `lib/brands/needs-confirmation.ts:96`; `validateGeneratedQuestion` in `lib/prompts/validate-question.ts:56`; `tiers.ts` is `lib/pricing/tiers.ts`; `open-workspace.ts` is `db/open-workspace.ts`; `dimension-labels.ts` is `lib/scoring/dimension-labels.ts`; Google switches `lib/governance/google-surfaces.ts`. [section 5]
10. The shared mention function is `answerMention()` (`lib/audit/answer-mention.ts:30`), which wraps detect and verify for both runners and Google. [section 5: Mentions]
11. Finding rules are **a–f** (f: Reddit pages cited in 2+ everyday answers), so the new findings in 8.1.5 / N15 should be **g–j**, not f–i. [section 5: Report]
12. Event name: **`audit.complete`** (`lib/audit/audit-complete.ts:13`), not `audit/complete`; 14 functions listen, all on `POST_AUDIT_POOL` (account-wide, limit 1). A new listener (S9 `question-results-compute`) joins that pool and needs a resync. [1.5]
13. Report branding is `agency_brand_assets` (one workspace row, `brand_id IS NULL`, plus optional per-brand rows; duplicates possible, read the newest). `report_tier_names` belongs on the workspace row. [1.12e]
14. Scheduled reports exist: `report_delivery_schedules` (Agency); generation never reads `schedule.template_id`, so a `report_tier` column there does nothing unless the generator reads the schedule. [1.12f]
15. Reports start at **Growth** (`lib/pricing/brand-features.ts:137-141`): Free and Starter have none. "Starter: Basic" in 8.1.7 is a new entitlement, a decision for Sri (and the Starter card already lists "Email reports", `lib/pricing/tiers.ts:97`). [1.12a]
16. The generate route takes only `{ periodLabel?, periodType }`; the server picks the basis audit. The chain is `trend/aggregated` → `generate-narrative-report` → `report/generated` → `render-report-pdf` (`inngest/functions/render-report-pdf.ts`); re-render rebuilds from live data. [1.12c]
17. `action_items` has no status history: use `done_at` (cleared when an item goes back to in progress), not `updated_at`. [Other VERIFY, L597]
18. Engine location parameters live in the provider implementations (`lib/llm/openai-impl.ts`, `lib/llm/anthropic-impl.ts`: `userLocation` city/region/country), not `web-search-config.ts`; Gemini and Perplexity take none; country is "AU", sent only for a confirmed city. [L802]
19. "One fetch path" (8.6.2): `lib/crawler/index.ts` exists, but customer sites are fetched from about eight places, none with an SSRF guard or robots.txt check; `app/api/crawl` accepts any domain. S6's guarded fetcher has more to migrate than the crawler. [L890]
20. Directory links: `brand_directory_listings`, edited on the brand overview page through `PUT /api/brands/:id/directory-listings`; the audit label is "Your profile: Not linked yet / {n} cited". [1.10]
21. `max_prompts_per_audit` is never read; the only enforced ceiling is `max_estimated_cost_cents`, and only the inline runner checks it. `PROMPTS_PER_AUDIT = 10` is the same on every plan. [1.11]
22. `report_templates`: only five optional-section flags take effect; `tone` is ignored; UI-made templates can't become the default. [1.9]

**Security and grants**
23. **Global tables "SELECT-only for `visibleau_app`" (7, runbook 5) conflicts with production's grants:** every table, global ones included, is read-write for `visibleau_app` (prod-fix 0052 plus default privileges), and `tests/integration/app-role-grants.integration.test.ts:41-56` and the integration global setup's `appRolePrivilegeDrift` report a read-only table as drift. Either drop the rule or change 0052, the drift check and the test to allow a named read-only list (a decision for Sri; S00 Part 5 follows the code). [line 211]
24. Policies use `current_setting('app.current_org_id', true)::uuid` (with `true`); 0029 has no named template (it repeats a block per table); newer migrations use 0145's loop. [line 211]

**Beyond AI answers (8.1.4)**
25. ABN: the live wizard has no ABN field and `PATCH /api/brands/:id` can't set one (only the unlinked `/brands/new` and `POST /api/brands` accept it), so "add the ABN in brand settings" has no field to point at: S1 needs an ABN input as well as the suggestion. There's no "Not checked" copy today ("No ABN on file…", "Check temporarily unavailable…", "Couldn't check the ABR…"). [section 3]
26. CDN Shield writes no visits (it's a read-only verdict, `lib/agent-analytics/cdn-shield-join.ts`); visits come from uploaded logs and the visit beacon. "Connect CDN Shield" should read "upload server logs". YouTube "videos cited by AI" has no source (`cited_video_urls` is always `[]`). Business identity: one entity name only, so "trading as" isn't available. [1.7, L610-616]

**UI (P17)**
27. The brand reports page has no report-type column; the list API returns no tier; it learns a PDF is ready by polling every 4 s for up to 12 min. [1.12b]

## Answers 1.1–1.4 and 1.6

### 1.1 The hard-coded directory list

`DIRECTORY_REGISTRY` in `lib/directories/registry.ts:92-266`, keyed by market (`"AU_EN"`, `"US_EN"`, `:28`). Each entry (`DirectoryEntry`, `:30-55`): `key`, `name`, `domains` (registrable domains; the first is canonical), `profileUrlPattern` (RegExp validating an owner-pasted profile link: host first, then path), `categories` (the `CATEGORY_KEYS` it applies to), `enabled`.

| Market | key | Name | Domains | Profile URL pattern | Categories | Enabled |
|---|---|---|---|---|---|---|
| AU_EN | hipages | hipages | hipages.com.au | `/connect/{slug}` (verified, `:99-108`) | trades (4) | yes |
| AU_EN | serviceseeking | ServiceSeeking | serviceseeking.com.au | host + any path | trades | yes |
| AU_EN | oneflare | Oneflare | oneflare.com.au | host + any path | trades | yes |
| AU_EN | airtasker | Airtasker | airtasker.com | host + any path | trades | yes |
| AU_EN | yellow_pages_au | Yellow Pages | yellowpages.com.au | host + any path | every local type (`LOCAL_CATEGORY_KEYS`) | yes |
| AU_EN | true_local | True Local | truelocal.com.au | host + any path | local | yes |
| AU_EN | localsearch | Localsearch | localsearch.com.au | host + any path | local | yes |
| AU_EN | product_review | ProductReview | productreview.com.au | host + any path | local | yes |
| AU_EN | word_of_mouth | Word of Mouth | wordofmouth.com.au, womo.com.au | host + any path | local | yes |
| AU_EN | google_business_profile | Google Business Profile | google.com, business.google.com, g.page | host only (`:183-186`) | local | yes |
| US_EN | yelp, angi, thumbtack, homeadvisor, bbb, nextdoor, houzz | Yelp, Angi, Thumbtack, HomeAdvisor, Better Business Bureau, Nextdoor, Houzz | one each (.com / bbb.org) | host + any path | local or trades | **no** (all disabled) |

"Trades" is `trades_plumbing`, `trades_electrical`, `trades_building`, `trades_general` (`:63-68`); "local" is `LOCAL_CATEGORY_KEYS` (`lib/prompts/templates.ts:935`: every type whose templates name `{region}`).

Readers (all synchronous): `getDirectoriesForMarket` (`:280`), `getDirectoriesForBrand` (`:297`: market by `marketCodeForRegion`, then category overlap; a brand with no confirmed categories sees every enabled directory), `directoriesNamedIn` (`:308`: display name as a whole phrase), `findDirectoryByDomain` (`:325`: host or subdomain, every market). Callers include `lib/directories/citation-counts.ts`, `own-profile.ts`, `linked-state.ts`, `profile-status.ts`, `cited-in-answers.ts`, the brand's directory-listings card and its API route.

Compared with appendix B: the list has no LinkedIn, Local Business Guide, Directso, Whereis, Cylex, Nextdoor (AU), Birdeye, Hotfrog, StartLocal, AussieWeb, Yelp AU, HealthEngine or HotDoc; it has `womo.com.au` and `g.page`, which appendix B lacks; and there is no `kind`.

### 1.2 How stored packs are typed branded vs everyday, and `citations.is_branded_prompt`

- Stored packs are typed **by text at read time**, never by provenance: `getAuditPrompts` returns each stored prompt as `{ text, isBranded: isBrandedPrompt(text, currentBrand) }` (`lib/audit/get-audit-prompts.ts:180-189`; live packs `:216`, vertical-pack fallback `:245`).
- `isBrandedPrompt` (`lib/audit/flag-branded-prompts.ts:29-42`): true when `brandNamePattern(brand.name)` matches (`lib/brands/normalize.ts:45`: words with space, hyphen, dash, `&`, apostrophe or full stop between them, "and" ⇄ "&", a possessive, letter/digit boundaries), or the text with everything but letters and digits removed contains `domainStem(brand.domain)` when the stem has 4+ characters (`normalize.ts:69`). It does **not** use `spacingFreeNamePattern` (detection does, 1.6).
- `citations.is_branded_prompt` is a nullable boolean (`db/schema/citations.ts:48`), written by both runners from the prompt's `isBranded` (`inngest/functions/run-audit.ts:277, 333`; `lib/audit/run-audit-inline.ts:250, 348`). Every citation the runners write carries it; NULL only on rows from before the column (readers treat NULL as everyday: `lib/audit/organic-filter.ts:16`, `IS NOT TRUE`). `engine_call_failures.is_branded_prompt` and `google_surface_results.is_branded_prompt` are NOT NULL.

### 1.3 The full `CATEGORY_KEYS` list

`lib/prompts/templates.ts:17-47`, 28 keys: `saas_design_tools`, `accounting_software`, `crm_software`, `project_management`, `hr_software`, `helpdesk_software`, `marketing_automation`, `ecommerce_platform`, `trades_plumbing`, `trades_electrical`, `trades_building`, `trades_general`, `allied_health_dental`, `allied_health_physio`, `allied_health_mental`, `allied_health_general`, `legal_services`, `legal_tech`, `fintech_payments`, `real_estate_agency`, `education_online`, `hospitality_restaurant`, `cafe`, `fitness_gym`, `beauty_salon`, `retail_shop`, `accounting_practice`, `general`.

The `{service}` types (the classifier's own words fill the template): `general`, `beauty_salon`, `retail_shop` (`templates.ts:370-374`), with fallbacks "local business", "salon", "local shop". TechCore IT's lower-case "managed it services" came this way: type `general`, service words from the classifier, lower-cased by `sanitizeServicePhrase` (`lib/brands/service-phrase.ts:48`), "a"/"an" from `withIndefiniteArticle` (`:27`) in `buildPromptPack`'s "good choice" question (`lib/prompts/build-prompt-pack.ts:276-302`).

### 1.4 The platform-settings store behind `/admin/settings`

- Page `app/(auth)/admin/settings/page.tsx` (operators only, `checkPlatformAdmin`, `lib/auth/platform-admin.ts`); API `app/api/admin/settings/route.ts` (GET view, POST `{kind: "setting" | "workspace" | "brand"}`, 403 for anyone else); logic `lib/governance/google-surfaces.ts`.
- **Global value:** `feature_settings` (`db/schema/google-surfaces.ts:32`): `key` text PK, `value` jsonb, `updated_by_user_id`, `updated_at`. No RLS (global). The key has a CHECK allowing only `google_ai_overviews_enabled`, `google_ai_mode_enabled`, `google_surfaces_count_in_headline`, `google_surfaces_queue_mode`, `google_surfaces_device`, `google_surfaces_max_cost_usd_per_audit` (`db/migrations/0145_google_ai_surfaces.sql:25-36`). A missing row is the key's default.
- **Workspace override:** `org_feature_flags` (`db/schema/org-feature-flags.ts:4-25`; `0021_phase2_sprint8_governance.sql:94-105`): `organization_id`, `flag_key` (free text, no CHECK), `is_enabled`, `reason`, `set_by`, `expires_at`, unique (`organization_id`, `flag_key`). FORCE RLS (`0029:685-686`). An expired row is no override (`lib/governance/feature-flags.ts:27`). Existing keys: `CANONICAL_FLAG_KEYS` (`feature-flags.ts:5-14`); the Google override keys are `google_ai_overviews_enabled` / `google_ai_mode_enabled`.
- **Changes log:** `feature_setting_changes` (`0145:38-48`): `scope` ('global' | 'workspace' | 'brand'), `setting_key` (free text), `target_workspace_id`, `target_brand_id`, `old_value`, `new_value`, `changed_by_user_id`, `created_at`. A workspace override is also written to that workspace's audit trail (`recordAction`, `google-surfaces.ts:598`). No-op saves return "unchanged" and write nothing (`:565`).
- **Arbitrary keys?** Workspace overrides: yes (`flag_key` is free text). Global values: no, because of the CHECK. Part 2 widens the CHECK (migration 0153, flag keys) and keeps everything else.
- Note: the existing code reads and writes these through `serviceDb` (allowed for `lib/governance/**` in `biome.json`). Part 2's new code reads `org_feature_flags` under `withRlsContext` and `feature_settings` with the app connection (no new `serviceDb`).

### 1.6 `brands.aliases`, and how mention detection uses name and domain

- `brands.aliases` **doesn't exist** (no match in `db/schema/` or `db/migrations/`). S00 Part 4 adds it.
- Detection: `detectBrandMention(response, {name, domain})` (`lib/audit/detect-mention.ts:113-136`), the one test for the four engines, Google and competitors (via `answerMention`, `lib/audit/answer-mention.ts:30-36`; also `competitor-mentions.ts:112`, `recompute-citation-positions.ts:34`, `resolve-audit-dimensions.ts:288`, `fan-out-engine-loop.ts:87`). On `detectionText(response)` (markdown flattened): the earlier of `brandNamePattern(name)` and `spacingFreeNamePattern(name)` (any spacing between the letters, ≥ 4 letters; `:66-74`), confidence high, method `regex`; else the domain stem with spacing ignored, confidence medium, method `entity`. A name match still needs `verifyMention` (`lib/audit/verify-mention.ts:85`: a cited source on the brand's own domain, or the confirmed suburb/city within ±300 characters; online-only brands by domain only).
- So for a brand named "TechCore IT": "TechCoreIT" and "Techcore IT" already match `spacingFreeNamePattern`, and "techcoreit" matches the domain stem. Aliases add value only for other names (a legal name, an abbreviation).
- The branded-question rule (`isBrandedPrompt`, 1.2) uses `brandNamePattern` and the stem, not `spacingFreeNamePattern`. Part 4 adds aliases to both through the same functions.

## Answers 1.5 and 1.7–1.12


### 1.5 The audit-complete event and its listeners

- **The event is `audit.complete`, with a dot. It is not `audit/complete`.** It is defined once as `AUDIT_COMPLETE_EVENT = "audit.complete"` at `lib/audit/audit-complete.ts:13`. Its data is `{ auditId, brandId, organizationId }` (`lib/audit/audit-complete.ts:15-18`, `:21-30`).
- The outgoing webhook name is different: `audit.completed` (`inngest/functions/fanout-webhooks.ts:12`).
- Four places send it:
  - `inngest/functions/run-audit.ts:596-603`: the manual runner, step id `audit-complete-email`.
  - `lib/audit/run-audit-inline.ts:522`: the inline runner (scheduled, bulk, workflow and validation audits). It calls `sendAuditComplete()`. If Inngest can't be reached, it falls back to its own inline drift, recommendations and alerts.
  - `inngest/functions/collect-google-surfaces.ts:48` and `lib/audit/google-surfaces/collect.ts:605`. When a Google surface is on, `audit.complete` is held back until Google collection finishes (`inngest/functions/run-audit.ts:578-591`).
- Fourteen functions listen. All are registered in `app/api/webhooks/inngest/route.ts:51-103`:

| Function id | Trigger (file:line) | Concurrency |
|---|---|---|
| `aggregate-visibility-trend` | `inngest/functions/aggregate-visibility-trend.ts:15` (it then sends `trend/aggregated`, `:58-75`) | POST_AUDIT_POOL |
| `calculate-topical-gaps` | `inngest/functions/calculate-topical-gaps.ts:27` | POST_AUDIT_POOL |
| `capture-evidence-snapshot` | `inngest/functions/capture-evidence-snapshot.ts:12` | POST_AUDIT_POOL |
| `classify-citation-sources` | `inngest/functions/classify-citation-sources.ts:15` | POST_AUDIT_POOL |
| `detect-drift` | `inngest/functions/detect-drift.ts:23` | POST_AUDIT_POOL |
| `detect-hallucinations` | `inngest/functions/detect-hallucinations.ts:16` | POST_AUDIT_POOL |
| `fanout-webhooks` | `inngest/functions/fanout-webhooks.ts:28` (one of 9 triggers) | POST_AUDIT_POOL |
| `ga4-push` | `inngest/functions/ga4-push.ts:10` | POST_AUDIT_POOL |
| `generate-recommendations` | `inngest/functions/generate-recommendations.ts:22` | POST_AUDIT_POOL |
| `notify-engine-total-failure` | `inngest/functions/notify-engine-total-failure.ts:22` | POST_AUDIT_POOL |
| `notify-model-drift` | `inngest/functions/notify-model-drift.ts:17` | POST_AUDIT_POOL |
| `run-comparison-prompts` | `inngest/functions/run-comparison-prompts.ts:31` | POST_AUDIT_POOL |
| `send-audit-complete-email` | `inngest/functions/send-audit-complete-email.ts:26` | POST_AUDIT_POOL |
| `simulate-query-fan-out` | `inngest/functions/simulate-query-fan-out.ts:24`. It returns at once while query simulation is paused (`:46-48`). | POST_AUDIT_POOL |

- Reached indirectly, not listening to `audit.complete` itself:
  - `generate-narrative-report`, on `trend/aggregated`.
  - `render-report-pdf`, on `report/generated`.
- `POST_AUDIT_POOL` is account-wide, key `"post-audit-pool"`, limit `ACCOUNT_CONCURRENCY_HEADROOM_SLOTS = 1` (`lib/inngest/concurrency.ts:41-45`, `lib/audit/concurrency-limit.ts:58`).

### 1.7 Are the YouTube, ABN and robots/crawler checks real?

| Check | Verdict | The real measurement | Stub or fallback branches found |
|---|---|---|---|
| **YouTube** (`youtube_presence_audits`) | **Real.** The flag `TRUST_CHECK_IMPLEMENTED.youtubePresence = true` (`lib/trust/stub-implementation-status.ts:37`). | YouTube Data API v3: search `lib/trust/youtube-channel-lookup.ts:203-204`; channels `:266-267` and `:313-314`; playlistItems `:336-337`. Orchestrated by `buildYoutubePresenceAuditRow` (`lib/trust/youtube-presence-check.ts:41-154`). | (1) A flag gate is left in the cron and the routes, currently off: `inngest/functions/audit-youtube-presence.ts:19-21`, `app/api/brands/[brandId]/youtube-presence/refresh/route.ts:48`, `.../youtube-presence/route.ts:42`, page layout `app/(auth)/brands/[brandId]/trust/youtube-presence/layout.tsx:11`. (2) No `YOUTUBE_API_KEY` stores `check_status='unavailable'`, reason `missing_api_key` (`youtube-channel-lookup.ts:367-368`). (3) **`cited_video_urls` is always written as `[]`** (`audit-youtube-presence.ts:55`, `refresh/route.ts:103`). Nothing measures which videos AI cited. |
| YouTube cron | `audit-youtube-presence`, cron `0 3 3 * *` (**monthly**, 03:00 UTC on the 3rd), all live brands (`inngest/functions/audit-youtube-presence.ts:10-12`, `:23-25`) | | |
| `check_status` values | `confirmed`, `not_found`, `unconfirmed`, `unavailable`, or NULL on old rows. CHECK in `db/migrations/0037_youtube_channel_confirmation.sql:31-35`. Only `confirmed` gets a `presence_score` (`youtube-presence-check.ts:65-90`, `:92-127`). For `unconfirmed`, `gaps` holds `["domain_mismatch", <domain>]` or `["no_domain_signal"]` (`:108-111`). | | |
| **ABN** (`lib/brand-entity/abn-lookup.ts`) | **Real, but it depends on env.** Production can't fake a pass. | ABR JSON `https://abr.business.gov.au/json/AbnDetails.aspx?abn=…&guid=${ABN_LOOKUP_GUID}` (`abn-lookup.ts:71-75`). Result at `:86-91` (`abnVerified = AbnStatus==="Active"`). Called from `lib/audit/run-technical-audit-inline.ts:36-39`. | `ABN_LOOKUP_BYPASS=mock-verified` returns fake data outside production. Production refuses it (`mockShortcutAllowed`, `lib/mock-mode.ts:48-58`) and returns `check_skipped` (`abn-lookup.ts:21-45`). `ABN_LOOKUP_BYPASS=skip` gives `check_skipped` (`:47-52`). No GUID gives `check_skipped` (`:65-66`). HTTP error, timeout or bad JSON gives `check_failed` (`:80`, `:92-98`). A non-11-digit ABN returns empty with no status (`:69`). The code can't show whether prod has the GUID set and the bypass unset. A repo doc says it is bypassed: `prod-fixes/prompts/Vunnara-vercel-env-vars-checklist.md:93`. |
| ABN, second path | A **second ABR call with no GUID** (`&callback=cb`) at `lib/trust/entity-checker.ts:106-126`. It is run by `refresh-entity-score` on `technical-audit/complete` and writes `brand_entity_scores.local_reg_*`. It is mock-gated at `:102-104`. In the same file the Knowledge Panel and Wikidata checks are hard stubs (`:130-139`), gated off by flags (`:57-60`). | | |
| **robots.txt / AI crawlers** (`lib/robots-txt/analyze.ts`) | **Real.** | The fetch is `lib/crawler/index.ts:104-126`, in `crawlSite`. Every crawler in the list is evaluated against RFC 9309 (`analyze.ts:93-96`). Points come only from search crawlers (`:134-183`). Training crawlers and control tokens go in `ownersChoiceBlocked` (`:187-200`). Results are stored as `technical_audits.findings.robots` (`lib/technical-audit/orchestrate.ts:168`, `:273`). | When robots.txt can't be reached, the file is marked `readable:false` and no score is stored (`analyze.ts:82-83`, `run-technical-audit-inline.ts:72-73`). That is not a stub. |
| **CDN Shield** | **Real**, and honest about its limits. | (a) It probes the home page as our own UA (`lib/crawler/crawler-access.ts:48-66`) and fingerprints the vendor from headers (`lib/crawler/cdn-shield-detector.ts:48-85`). Route: `app/api/brands/[brandId]/cdn-shield/route.ts:43`. (b) It joins robots.txt verdicts with verified `crawler_visit_logs` (`lib/agent-analytics/cdn-shield-join.ts:189-220`). Route: `app/api/brands/[brandId]/agent-analytics/cdn-join/route.ts:58-60`. | It never sends another company's UA. Without log data the verdict is `not_testable` (`cdn-shield-join.ts:138-141`). |
| **`crawler_visit_logs`** | **Real data, but only from what the customer supplies.** | Uploaded logs: `app/api/brands/[brandId]/crawler-logs/upload/route.ts:117` → `parse-crawler-log` (`inngest/functions/parse-crawler-log.ts:161`) → `verify-crawler-hits` (CIDR, FCrDNS, ASN: `lib/agent-analytics/verify-crawler-hits.ts:61-154`). | The visit API (`app/api/visit/route.ts:76` → `crawler-log-ingest`, `inngest/functions/crawler-log-ingest.ts:38-52`) inserts rows with **no `source_ip`**. They can never become `verified`, so they count as "has log data" but never as verified visits. |

### 1.8 The Wilson interval

- `wilsonCI(successes, trials, z = 1.96)` at `lib/scoring/wilson.ts:1-15`. It returns 0–100 bounds, and `{0,0}` when trials = 0.
- `wilsonCIFromScore(score, sampleSize, z = 1.96)` at `lib/scoring/wilson.ts:32-40` adapts a mean score to the same interval.
- Direct callers:
  - `computeDimensionCIs` (`lib/scoring/dimension-ci.ts:50-62`): Frequency and the headline use `wilsonCI(mentioned, totalCalls)`. Sentiment and Context use `wilsonCIFromScore`. It is called at audit end by `inngest/functions/run-audit.ts:466` and `lib/audit/run-audit-inline.ts:428`, and stored in `audits.confidence_intervals` (`run-audit-inline.ts:449`, `:670`).
  - `resolveOrganicDimensions` (`lib/scoring/resolve-audit-dimensions.ts:146`) works out the headline at read time with `wilsonCI(mentionedCount, sampleCount)` (`:308-312`, zero case `:342`). It is reached through `resolveAuditDimensionsAndHeadline` (`:366`), which about 40 files read. Among them: the audit page, `lib/reports/report-data.ts`, `lib/drift/build-input.ts`, the export and full API routes, email and digest functions, and the badge.
- Drift significance is a CI-overlap test: `ciOverlaps` (`lib/drift/significance.ts:3-13`).

### 1.9 `report_templates.sections` and `tone`

- Schema: `db/schema/report-templates.ts:4-16`. It has `sections jsonb not null` and `tone text default 'professional'`.
- Writers:
  - `POST /api/organizations/[orgId]/report-templates` (`app/api/organizations/[orgId]/report-templates/route.ts:84-95`). It requires `edit_report_templates`, which is owner or admin (`:65`, `lib/governance/permissions.ts:67`).
  - The default template, created when an org is created (`lib/auth/server.ts:303-320`).
  - `db/seed/default-report-template.ts:41-54`.
  - **There is no update or delete route.** The UI always posts `isDefault: false` (`app/(auth)/organizations/[orgId]/report-templates/page.tsx:80`). A template made in the UI therefore never becomes the default.
- Readers of `sections`:
  - `generate-narrative-report` reads the org's **default** template (`inngest/functions/generate-narrative-report.ts:68-81`) and stores its id on the report.
  - `render-report-pdf` reads the report's `template_id` (`inngest/functions/render-report-pdf.ts:99-114`).
  - Both pass it to `buildReportData`, where `reportSectionFlags()` turns it into flags (`lib/reports/report-data.ts:903`, `lib/reports/report-sections.ts:43-54`).
  - Only five optional sections can be switched off: `competitors`, `diagnosis`, `trend`, `recommended_next`, `method` (`lib/reports/report-sections.ts:10-16`). The PDF reads the flags at `lib/reports/pdf/report-document.tsx:394-397` and `:1753`.
- **`tone` affects nothing.** It is only displayed in the templates list (`report-templates/page.tsx:309`). The code says so explicitly at `generate-narrative-report.ts:67` and `render-report-pdf.ts:96-98`.
- `report_delivery_schedules.template_id` is also never read when a report is generated.

### 1.10 The directory-links store

- **Table `brand_directory_listings`** (`db/schema/brand-directory-listings.ts:17-47`): `organization_id`, `brand_id`, `directory_key` (text matching the code registry), `status` (`listed`, `not_listed` or `unsure`), `profile_url`, `confirmed_at`, `confirmed_by`, `created_at`, `updated_at`. There is one row per (brand, directory), unique index at `:40-43`. It is not jsonb.
- **The registry is code, not a table:** `DIRECTORY_REGISTRY` at `lib/directories/registry.ts:92`. There is no `directory_registry` table anywhere in `db/`.
- **Component:** `components/domain/brand/directory-listings-card.tsx:28-110`. It does GET at `:40` and PUT at `:72` against `/api/brands/${brandId}/directory-listings` with body `{directoryKey, status, profileUrl?}`. It is mounted on the **brand overview page** (`app/(auth)/brands/[brandId]/page.tsx:329`), not a separate settings route.
- **Route** `app/api/brands/[brandId]/directory-listings/route.ts`:
  - GET at `:32`: every relevant directory, with `status: null` when the brand hasn't confirmed it (`:57-66`).
  - PUT at `:76`: requires `edit_brand_data` (owner, admin or analyst, `:90`). Body schema at `:23-25`. The profile URL is checked by host and the registry's `profileUrlPattern` (`:105-125`). Upsert at `:149`. Audit-trail entry at `:160`.
- **How audits show it:**
  - `getDirectoryCitationsForAudit` (`lib/directories/citation-counts.ts:196`) matches the audit's citation URLs against the confirmed `listed` profile URL (`:288-304`) and sets `ownerProfileLinked` and `ownerProfileCitedCount` (`:316-318`).
  - `DirectoriesCitedPanel` prints **"· Your profile: {label}"** (`components/domain/audit/directories-cited-panel.tsx:134`). The label is **"Not linked yet"** or **"{n} cited"** (`lib/directories/profile-status.ts:10`, `:20-30`). It is not "cited / not cited".
  - The panel is used at `app/(auth)/audits/[auditId]/page.tsx:1660`. The PDF has a "Your profile" column (`lib/reports/pdf/report-document.tsx:1664`).
  - A suggested own-profile link ("Link it") PUTs to the same route (`components/domain/audit/link-suggested-profile.tsx:33`).

### 1.11 `market_ai_budget_policies.max_prompts_per_audit`

- Schema: `db/schema/market-ai-budget-policies.ts:11`, int, not null, default 50. Migration `db/migrations/0010_phase2_sprint1_platform.sql:26`.
- **No application code reads it.** The only references outside tests are the schema, migrations and prod-fix diagnostics.
- The policy row is loaded in full by `BudgetPolicyService.estimate`, keyed on `AU_EN / smb / brand_audit` (`lib/platform/budget-policy.service.ts:111-120`). Only `maxEstimatedCostCents` (default 500) and `id` are used (`:122-123`). `max_models_per_audit`, `max_repeated_samples`, `max_fan_out_sub_queries` and `hard_stop_on_budget` are also unread. Callers pass `hardStopOnBudget: true` themselves (`lib/audit/run-audit-inline.ts:169-171`).
- An audit with more than 50 prompts: **nothing happens.** No check exists.
- The pre-flight estimate runs only in the inline runner (`run-audit-inline.ts:158-173`), the Google collector (`lib/audit/google-surfaces/collect.ts:362`) and the paused fan-out. The manual Inngest runner checks only the daily spend (`app/api/audits/route.ts:104`). It never calls `estimate`.
- `PROMPTS_PER_AUDIT = 10` (`lib/llm/tier-engines.ts:19`) is a single global number. It is used by `inngest/functions/run-audit.ts:130` and `lib/audit/run-audit-inline.ts:131` through `getAuditPrompts`. A frozen prompt pack is used **in full**: 10 organic questions plus the branded extras on top (`lib/audit/get-audit-prompts.ts:175-180`; pack size `lib/prompts/build-prompt-pack.ts:257`).
- **Question counts don't vary by plan.** Plans differ only in engines (`TIER_ENGINES`, `lib/llm/tier-engines.ts:3-10`: Free 2, the rest 4) and in models and frequency. `TierDefinition` has no question-count field (`lib/pricing/tiers.ts:46-70`).

### 1.12 Reports

**(a) Entitlements**

- Two files hold them:
  - `lib/pricing/brand-features.ts` covers brand-page features.
  - `lib/pricing/tiers.ts` covers plan features: `white_label_reports`, which Agency unlocks (`tiers.ts:123`), and others.
- **Reports are Growth and up** (`lib/pricing/brand-features.ts:137-141`). **Free can't generate reports, and neither can Starter.**
- The check is `assertTier(org, brandFeaturePlan("reports"))`. It appears in the generate route (`app/api/brands/[brandId]/reports/generate/route.ts:32`), the list route (`app/api/brands/[brandId]/reports/route.ts:31`) and retry-pdf (`.../retry-pdf/route.ts:44`). `assertTier` is at `lib/governance/access-control.ts:171-176`. The page locks through `useBrandFeatureGate("reports")` (`app/(auth)/brands/[brandId]/reports/page.tsx:77`, `:175`).
- Roles: `generate_reports` is owner, admin or analyst (`lib/governance/permissions.ts:59`).
- A mismatch already exists: the Starter pricing card lists "Email reports" (`lib/pricing/tiers.ts:97`).

**(b) The brand reports page**

- Page: `app/(auth)/brands/[brandId]/reports/page.tsx`. The detail page is `.../reports/[reportId]/page.tsx`.
- Columns (`:294-297`):
  - Report: the headline plus its created date (`:328-331`). A failed report also shows "PDF couldn't be created.", and a generating one shows a note.
  - Period
  - Status
  - Actions: Download PDF, Pending..., "Unavailable right now" or Try again.
- `reportType` is fetched but **not shown**.
- Statuses are `generating`, `ready`, `published` and `failed` (`:44-58`). They come from `deriveReportStatus` (`lib/communication/types.ts:119-132`):
  - No PDF and a failure reason means failed.
  - No PDF and more than 10 minutes without an update also means failed (`:62-63`).
  - A PDF with no email sent means ready.
  - A PDF with an email sent means published.
- **How it learns a render finished: client polling.**
  - It polls `GET /api/brands/:id/reports` through `useSafePoll` every 4 s, slowing to 10 s when it falls behind (`page.tsx:23`, `:93-130`).
  - It polls while any report is `generating`, or after Generate until a new row appears (`lib/communication/should-poll-reports.ts:10-16`).
  - It stops after `REPORT_MAX_WAIT_MS` = 12 min (`lib/communication/report-poll.ts:18`). The "awaiting" flag clears after 120 s (`page.tsx:133-137`).
  - There is no revalidation or push. Nothing emails anyone when a PDF is ready (`report-poll.ts:12-15`).

**(c) The generate route and the render job**

- `POST /api/brands/[brandId]/reports/generate` takes `{ periodLabel?: string, periodType: "weekly"|"monthly" = "weekly" }` (`generate/route.ts:17-20`). The page sends `{periodType:"weekly"}` (`page.tsx:155-159`).
- **There is no basis-audit input.** The basis is chosen server-side by `selectReportBasis` (`inngest/functions/generate-narrative-report.ts:97-103`).
- The chain:
  1. The route sends `trend/aggregated {brandId, organizationId, periodLabel, periodType, manual:true}` (`generate/route.ts:69-78`).
  2. `generate-narrative-report` (`inngest/functions/generate-narrative-report.ts:12`, `:18`) inserts a `generated_reports` row (`:142-157`) and sends `report/generated` (`:167-172`).
  3. **`render-report-pdf`** (`inngest/functions/render-report-pdf.ts:23`, trigger `:32`) rebuilds `buildReportData` from live data (`:107-115`) and calls `buildReportPdf` (`lib/communication/pdf-builder.tsx:20-23`). It uploads `${orgId}/${reportId}.pdf` (`:121-123`) and sets `pdf_url` (`:163-173`). On failure it sets `pdf_failure_reason` (`:140-150`).
- "Try again" sends `report/generated` again (`app/api/brands/[brandId]/reports/[reportId]/retry-pdf/route.ts:98-99`), which re-renders from **current** data.

**(d) The PDF cover**

- `Cover` is at `lib/reports/pdf/report-document.tsx:487-685`. Its top bar is `CoverTopBar` (`:419-485`).
- What it prints:
  - The agency logo, or a gradient initials tile, plus the agency name. Both appear **only when an agency name is set** (`:440-477`).
  - "Powered by Vunnara" (`:478-482`).
  - The eyebrow "AI Visibility Report". This **fixed title** can't be configured (`:548`).
  - The brand name (`:559`) and a fixed subtitle (`:562`).
  - A meta line: location · vertical · **period** (`periodFull`, `:491`, `:565`; `lib/reports/report-format.ts:74-76`).
  - The headline Visibility %, or "Not enough answers" (`:579-616`).
  - Chips: "Based on Audit #N · date", "x of y engines answered", "95% CI …" (`:631-640`).
  - A footer: "Generated <date> · {footerText ?? 'Confidential'}" and the host (`:676-681`). The contact line appears only in the running footer (`:2421-2429`).
- The agency data comes from `loadPrintableAgencyAssets`, which returns nothing unless the plan has `white_label_reports` (`lib/branding/agency-assets.ts:100-107`). It is then resolved field by field, brand row first and workspace row second (`lib/reports/agency-branding.ts:29-41`, `lib/reports/report-data.ts:753-759`). The logo is loaded at render time (`lib/communication/pdf-builder.tsx:22`).

**(e) Report branding storage**

- **Table `agency_brand_assets`** (`db/schema/agency-brand-assets.ts:5-26`): `organization_id`, `brand_id` (nullable), `logo_url`, `primary_color`, `secondary_color`, `accent_color`, `footer_text`, `contact_line`, `agency_name`, `contact_email`, `updated_at`.
- **It is per org with optional per-brand overrides.** The row with `brand_id IS NULL` is the workspace's. Colours are workspace-only (`app/api/report-branding/route.ts:160-165`).
- The unique index `(organization_id, brand_id)` (`:23-25`) doesn't stop duplicate NULL-brand rows. Readers take the newest (`lib/branding/agency-assets.ts:69-70`).
- API: `GET/PUT/DELETE /api/report-branding` (`app/api/report-branding/route.ts:99`, `:136`, `:219`), and the preview at `/api/report-branding/preview`. Logos go through `/api/branding/logo`. The legacy PATCH is at `/api/agency/branding`.
- Page: **`/settings/report-branding`** (`app/(auth)/settings/report-branding/page.tsx`).
- Who can edit:
  - Agency plan and up (`white_label_reports`, `lib/branding/agency-assets.ts:48-50`).
  - Owners and admins only (`manage_branding`, `lib/governance/permissions.ts:68`, `brandingRefusal` `agency-assets.ts:59-66`).
  - Changes are written to the audit trail (`report-branding/route.ts:74-97`).

**(f) Scheduled and automatic reports exist**

- Table `report_delivery_schedules` (`db/schema/report-delivery-schedules.ts:6-22`): `brand_id` (nullable, meaning workspace-wide), `template_id`, `frequency` (weekly or monthly), `day_of_week`, `day_of_month`, `time_of_day`, `recipient_emails`, `is_active`, `last_sent_at`.
- API: `app/api/organizations/[orgId]/delivery-schedules/route.ts`. POST requires `manage_schedules` (`:61`) and **Agency tier** (`:72-78`). UI: `/organizations/[orgId]/delivery-schedules`.
- **Automatic generation:** every `audit.complete` leads to `aggregate-visibility-trend`, which sends `trend/aggregated`. `generate-narrative-report` then makes a report only when an active schedule exists for the brand or the workspace (`generate-narrative-report.ts:42-63`). That leads to `report/generated` and then `render-report-pdf`.
- **Emailing:** the `send-scheduled-reports` cron runs hourly, `0 * * * *` (`inngest/functions/send-scheduled-reports.ts:18-19`). It emails the **newest existing PDF** for due schedules (`:26-47`, `:62-70`). It doesn't generate anything.

## Sections 3 and 5 and line 211, item by item

### A. LLD section 3 (entity, YouTube, crawlers)

| LLD claim (line) | Status | What the code does (path:line) |
|---|---|---|
| `lib/brand-entity/abn-lookup.ts` calls the ABR web service (118) | confirmed | `lookupAbn()` lib/brand-entity/abn-lookup.ts:11 fetches `abr.business.gov.au/json/AbnDetails.aspx` (:71), 10 s timeout, one retry (:73-96). |
| Scored through `brandEntityScore()` in `lib/audit/run-technical-audit-inline.ts` (118) | different | Defined in lib/brand-entity/score.ts:36 (ABN 3 + Wikipedia AU 3 + .au TLD 2, max 8, :28-34). It's only *called* from run-technical-audit-inline.ts:60. |
| Brand & Entity is part of the Technical Audit (118) | confirmed | Stored as technical_audits.score_brand_entity (run-technical-audit-inline.ts:84) plus a brand_entity_scores row (:110-126); max 8 from scoring v2 (lib/technical-audit/scoring-version.ts:45). The technical audit runs inline only (app/api/audits/route.ts:188-192, lib/audit/run-background-audit.ts:13). |
| The report builder `lib/reports/report-data.ts` reads only the basis audit (118) | confirmed | It reads audits, citations, engine_call_failures, brands, directory/source-type citations, share of voice and agency branding, plus earlier complete audits for the trend (report-data.ts:1-36, 280-330). It doesn't import technical_audits, brand_entity_scores, youtube or crawler tables. |
| The ABN check runs only when `brands.abn` is set (118) | confirmed | `if (!abn) return empty` (abn-lookup.ts:54), status null. |
| …and when `ABN_LOOKUP_GUID` works (118) | confirmed | No GUID gives abnStatus `check_skipped` (:65-66). HTTP error or timeout gives `check_failed` (:60-64, 80, 94). There's also an `ABN_LOOKUP_BYPASS` env (skip / mock-verified, refused in prod) (:19-52). |
| `brands.abn` "typed in at setup" (118) | different | The live wizard (/brands/wizard: components/domain/new-brand-button.tsx:10, app/(auth)/brands/wizard/wizard-form.tsx) has **no ABN field**. Only the unlinked legacy app/(auth)/brands/new/page.tsx:73-83 and POST /api/brands (app/api/brands/route.ts:31,161) accept one. The PATCH schema has no `abn` (app/api/brands/[brandId]/route.ts:23-65), so the app has no way to add an ABN today. |
| Many brands (TechCore IT) show "Not checked" (118) | different | With no ABN on file, the Brand & Entity page says "No ABN on file — add it in brand settings to verify against the ABR" (app/(auth)/brands/[brandId]/brand-entity-audit/page.tsx:148-149), but no settings field exists. check_skipped shows "Check temporarily unavailable — verification pending" (:146-147). check_failed shows "Couldn't check the ABR on this audit…" (:144-145). |
| `youtube_presence_audits` table (119) | confirmed | db/schema/youtube-presence-audits.ts:15-61 (org-scoped; check_status, match_confidence, presence_score, gaps, audited_at). |
| A YouTube cron (119) | confirmed | inngest/functions/audit-youtube-presence.ts:8-13: id `audit-youtube-presence`, cron `0 3 3 * *` (monthly, on the 3rd), walks `liveBrandsOnly()` (:24). There's also a manual refresh route, app/api/brands/[brandId]/youtube-presence/refresh/route.ts, which stores a user-given channel URL (:81). |
| Channel matching with domain-mismatch states (119) | confirmed | lib/trust/youtube-channel-lookup.ts:57-72 has four outcomes: `confirmed` (via domain or user_url); `unconfirmed` (no_domain_signal or domain_mismatch, plus the conflicting domain); `not_found`; `unavailable` (missing_api_key, quota_exceeded or network_error). Stored as check_status (lib/trust/youtube-presence-check.ts:31, 99-122). |
| At one point a stub, shown as "Measurement not yet available" until real (119) | confirmed | Historical. `TRUST_CHECK_IMPLEMENTED.youtubePresence = true` (lib/trust/stub-implementation-status.ts:37); the gate is still in the cron (audit-youtube-presence.ts:19-21). The copy is gone from the code (added in 92b92b17, placeholders removed in 27506d10). |
| Access: robots.txt scoring in `lib/robots-txt/analyze.ts` (Technical Audit) (120) | confirmed | `analyzeRobots()` analyze.ts:78, called from lib/technical-audit/orchestrate.ts:10. Rules come from lib/robots-txt/evaluate.ts (RFC 9309). Since scoring v4, only the search crawlers score. |
| Visits: `crawler_visit_logs` (120) | confirmed | db/schema/crawler-visit-logs.ts:15; `ingest_source` is `log_upload` or the default `visit_api` (:54). |
| Visits come from uploaded server logs (120) | confirmed | inngest/functions/parse-crawler-log.ts:85-100 inserts with ingestSource `log_upload`. The file is read from the private `crawler-logs` bucket (:22). |
| Visits come from CDN Shield (120) | different | CDN Shield writes no visits. lib/agent-analytics/cdn-shield-join.ts:13-33 is a read-only verdict that combines robots.txt rules with verified visits from crawler_visit_logs (:197-208). The other visit source is the visit beacon: app/api/visit/route.ts:76 sends `visit/ingested`, and inngest/functions/crawler-log-ingest.ts:38 stores it (ingest_source `visit_api`). |
| Uploaded-log visits never stored in production until the 20 Nov fix (date bug) (120) | confirmed | Commit 999e9e3e (20 Nov, on origin/main): the step result turned each Date into a string, the insert threw, and the error was logged as "skipped one row". Fixed with `timestamp: new Date(hit.timestamp)` at parse-crawler-log.ts:77. The commit says "likely" none were stored; production wasn't counted here. |
| These modules live outside the PDF's data builder (114) | confirmed | No technical, entity, YouTube or crawler reference in lib/reports/report-data.ts or lib/reports/pdf/report-document.tsx. |

**Section 4 identifiers in the same range (126-149)**

| LLD claim (line) | Status | What the code does (path:line) |
|---|---|---|
| N1: stored pack is "10 everyday + up to 3 that name the business" (132) | different | Branded questions are **3 to 5**: "Is X a good choice…" (lib/prompts/build-prompt-pack.ts:302), plus 0-2 "X vs competitor", plus "best alternatives to X" and "Is X popular in…" (:327-344). |
| N6: `compositeMaxFor` tests, v4 out of 74 (137) | confirmed | lib/technical-audit/score-aggregator.ts:96; v4 maxima at lib/technical-audit/scoring-version.ts:19,47. |
| N13: Inngest app id `visibleau` (144) | confirmed | lib/inngest/client.ts:5-6. |
| N15: "No finding rule matched" text (146) | confirmed | lib/reports/pdf/report-document.tsx:2022. The new rules can't be named "f–i", because rule `f` already exists (see Report below). |

### B. LLD section 5 (current system)

#### Brand record (156)

| LLD claim (line) | Status | What the code does (path:line) |
|---|---|---|
| `db/schema/brands.ts` | confirmed | db/schema/brands.ts:7-86. |
| `name` | confirmed | text not null :12. |
| `domain` | confirmed | text not null :13. |
| `vertical` | confirmed | A Postgres **pgEnum** `vertical` (tradies, allied_health, saas, professional_services, real_estate, local_business), not text + CHECK: :14, db/schema/enums.ts:14-23. |
| `region` ('au') | confirmed | pgEnum `region` (au, nz, uk, us, ca, eu) :15, enums.ts:12. Copied from organizations.region (default 'au') by `inheritRegion` (lib/brands/index.ts:36, app/api/brands/route.ts:151). |
| `categories` | confirmed | text[] default [] :59 (the owner-confirmed CATEGORY_KEYS). |
| `classification` jsonb: category, buyerType, confidence, auRelevance, competitors, intentSignals | confirmed | :41, type lib/types/brand.ts:10-27. It also has two optional keys the LLD omits: `audience` and `service` (16 Nov). |
| `classification_status` | confirmed | text, TS enum pending / processing / complete / failed / needs_confirmation (:42-46); DB CHECK from db/migrations/0147. |
| `prompt_pack` (text array) | different | **jsonb** typed `string[] \| null`, default null (:77; db/migrations/0008_add_brand_classification.sql:11). It isn't a text[]. |
| `prompt_pack_version` | confirmed | integer default 1 :78. Bumped only when the content changes (lib/prompts/regenerate-prompt-pack.ts:99-131). |
| `prompt_pack_generator_version` | confirmed | integer default 1 :84; current `PROMPT_GENERATOR_VERSION = 6` (lib/prompts/generator-version.ts:37). |
| `suburb` | confirmed | :67 (0048). |
| `city` | confirmed | :68. |
| `state` | confirmed | :69. |
| `country` | confirmed | :74. |
| `postcode` | confirmed | :73 (migration 0146). |
| `location_mode` (plain text) | confirmed | :75, TS enum fixed / online_only. In the DB it's plain text with no CHECK (db/migrations/0048_brands_location_confirmation.sql:20). |
| `location_confirmed_at` | confirmed | :76. |
| `primary_regions` ('NSW:Sydney CBD') | confirmed | text[] :24; PATCH validates the "STATE:Suburb" format (app/api/brands/[brandId]/route.ts:39). |
| `competitors` (names) | confirmed | text[] :16. |
| `competitor_websites` | confirmed | jsonb `Record<name, site>` :20-23 (0125). |
| `abn` | confirmed | text :25 (see section A for how it can be set). |
| `youtube_channel_url` | confirmed | :32 (0037). |
| `logo_url` | confirmed | :37 (0113). |
| `deleted_at` | confirmed | :40. |
| Column list is complete | different | Columns it omits: `audience` (households / businesses / both, owner-confirmed) :58, `category_confirmed_at` :57, `classification_at` :47, `classification_error` :51, `client_tag` :26, `brand_token` (unique) :85, created_at/updated_at. The confirmation gate reads audience and category_confirmed_at. |
| Online-only brands verify mentions by domain only | confirmed | lib/audit/verify-mention.ts:91-92 skips the suburb/city check when location_mode is `online_only`. |

#### Classification (157)

| LLD claim (line) | Status | What the code does (path:line) |
|---|---|---|
| `lib/brands/classify-brand.ts` (home page title, meta description, H1 → Claude) | confirmed | `fetchHomepageSignals` crawls 1 page for the title, excerpt (used as meta description) and first h1 (:36-49), then `getLLMService("claude")` (:121-127). Confidence is capped at 0.5 if the home page fetch fails (:155); the parse-failure fallback is 0.3 (:162-173). |
| `classify-and-store.ts` | confirmed | `classifyAndStoreBrand` :7 sets needs_confirmation when confidence < 0.7 **or** category = "general" (:49-58), then calls regeneratePromptPack (:68). |
| `audience.ts` | confirmed | `deriveAudienceFromBuyerType` :13, `resolveAudience` :30. |
| `intent-signals.ts` | confirmed | `sanitizeIntentSignal(s)` :13, :22. |
| Confidence < 0.7 or unconfirmed → confirm screen | confirmed | lib/brands/needs-confirmation.ts:66-79 (threshold :11). Also triggers when the category isn't a CATEGORY_KEYS entry, and for any `complete` brand the owner hasn't confirmed (category_confirmed_at + valid categories + audience, :56-64). Card: components/domain/brand/classification-confirm-card.tsx. |

#### Categories and templates (158)

| LLD claim (line) | Status | What the code does (path:line) |
|---|---|---|
| `lib/prompts/templates.ts`: closed `CATEGORY_KEYS` | confirmed | :17-47, 28 keys. |
| `CATEGORY_TEMPLATES[category][buyerType]` | confirmed | :396 (`PromptTemplateMap = Partial<Record<BuyerType,string[]>>` :5). Selection (`getTemplatesForCategory` :897) also orders and filters by audience (TEMPLATE_AUDIENCE_OVERRIDES :148). |
| `CATEGORY_LABELS` | confirmed | :54. |
| Alias table | confirmed | `CATEGORY_ALIASES` :195. |
| `resolveCategory()` exact → alias → `{parent}_general` → `general` | confirmed | :310-326, after normalising the slug (:294). |
| Templates use `{region}` from `primary_regions[0]` | different | `{region}` comes from `resolveRegionLabel` (lib/brands/region-label.ts:43-62), in this order: suburb (plus ", STATE" when there's no city), then city, then primary_regions[0] with the "STATE:" prefix stripped, then the region name, then "Australia". Callers: regenerate-prompt-pack.ts:72, get-audit-prompts.ts:199. `{category}` and `{service}` are filled too (build-prompt-pack.ts:111-115), and many SaaS templates have no `{region}` at all. |
| 30 confirm-screen chips | different | **28** (every CATEGORY_KEYS entry, `general` included), shown as the vertical's types first and the rest under "Other types" (lib/brands/category-choices.ts:8-60; card :82). |
| No IT services key | confirmed | No it_* or managed-services key or alias in templates.ts. |

#### Building questions (159)

| LLD claim (line) | Status | What the code does (path:line) |
|---|---|---|
| `lib/prompts/build-prompt-pack.ts` `buildPromptPack` | confirmed | :247. |
| `buildEnrichedPrompts` for the branded ones | different | `buildEnrichedPrompts` :307 makes 0-2 "vs competitor", "best alternatives" and "popular in" (:327-344). The "Is X a good choice for…" question is built in `buildPromptPack` itself (:302). Total branded: 3-5. |
| `lib/audit/get-audit-prompts.ts` `getAuditPrompts` | confirmed | :104. Order of work: readiness gate, regenerate a stale pack, use the stored pack in full, else a live build, else the vertical-pack fallback. |
| `BrandNeedsConfirmationError` | confirmed | :28. |
| `PromptPackGenerationError` | confirmed | :53. |
| `brandReadyForAudit` (in get-audit-prompts.ts) | different | Defined in lib/brands/needs-confirmation.ts:96 (complete + confirmed + location_mode set) and imported at get-audit-prompts.ts:5. |
| `lib/verticals/expand-prompt.ts` (`{brand}`, `{domain}`, `{location}`, `{competitors}`) | confirmed | :26-62. Used only by the vertical-pack fallback (get-audit-prompts.ts:241) and app/api/vertical-packs/[id]/prompts/route.ts:38. |
| `validateGeneratedQuestion` (in expand-prompt.ts) | different | Defined in lib/prompts/validate-question.ts:56; called from expand-prompt.ts:49 and build-prompt-pack.ts:119,169. |
| `isBrandedPackPrompt()` | missing | Deleted. Replaced by `isBrandedPrompt(text, brand)` lib/audit/flag-branded-prompts.ts:29, which checks the text: brandNamePattern, or the domain stem (4+ chars). tests/unit/audit/flag-branded-prompts.test.ts:230 fails if the old name comes back. |
| Order: 10 everyday then the branded ones | confirmed | `[...organic, goodChoice, ...enriched]` (build-prompt-pack.ts:304). The stored pack is used in full, never re-sliced (get-audit-prompts.ts:175-190). Everyday can be fewer than 10 (warning at :240). |
| `PROMPTS_PER_AUDIT = 10` in `lib/llm/tier-engines.ts` | confirmed | :19. |

#### Running audits (160)

| LLD claim (line) | Status | What the code does (path:line) |
|---|---|---|
| `lib/audit/run-audit.ts` (Inngest) | different | No such file. The Inngest runner is inngest/functions/run-audit.ts:51-70 (id `run-audit`, event `audit.run`, sent only from app/api/audits/route.ts:155-158). |
| `lib/audit/run-audit-inline.ts` | confirmed | Runs when the Inngest send fails (app/api/audits/route.ts:179-186), for background audits (lib/audit/run-background-audit.ts:13) and for the sample (lib/sample-audit/run.ts:173). |
| Engines by tier in `lib/llm/tier-engines.ts` | confirmed | `TIER_ENGINES` :3-10 (free: chatgpt + perplexity; paid: 4 engines), `enginesForTier`. |
| `model-selector.ts` | confirmed | lib/llm/model-selector.ts `selectModel` :62, `auditModelFor` :74. |
| Per-engine settings in `lib/llm/web-search-config.ts` | confirmed | `ENGINE_CALL_TIMEOUT_MS` :32, `isWebSearchEnabled` :48, search fees :266-341. |
| Both runners must stay in step | confirmed | Both call getAuditPrompts (run-audit-inline.ts:131 / inngest run-audit.ts:130), answerMention (:233 / :310) and questionSetHashSql (:458 / :496). Parity tests: tests/unit/audit/run-audit-citedurls-parity.test.ts, run-audit-failure-parity.test.ts. |

#### Mentions (161)

| LLD claim (line) | Status | What the code does (path:line) |
|---|---|---|
| `lib/audit/detect-mention.ts` | confirmed | `detectBrandMention` :115 tries the name (brandNamePattern + spacingFreeNamePattern :66), then the domain stem. |
| `lib/audit/verify-mention.ts` | confirmed | `verifyMention` :87 returns verified_domain, verified_location (suburb or city near the match, :93-110) or unverified. |
| One shared match function (spacing, case, markdown) | confirmed | The shared entry point is `answerMention()` in **lib/audit/answer-mention.ts:30**, which the LLD doesn't name. Both runners and the Google collector use it (lib/audit/google-surfaces/collect.ts:191). Normalisation is in lib/audit/detection-text.ts:33; guard: tests/unit/audit/one-mention-check.test.ts. |

#### Comparability (162)

| LLD claim (line) | Status | What the code does (path:line) |
|---|---|---|
| `audits.question_set_hash` | confirmed | db/schema/audits.ts:76 (migration 0150). |
| Computed with SQL `question_text_key()` over everyday questions | confirmed | `questionSetHashSql` lib/audit/question-set-sql.ts:29-41: SHA-256 hex of the DISTINCT question_text_key(prompt) values from citations (is_branded_prompt IS NOT TRUE) plus non-branded engine_call_failures, sorted COLLATE "C" and newline-joined. The function is defined in db/migrations/0152_question_text_key.sql:24-35; both runners write the hash when the audit completes. |
| Comparison | confirmed | `sameQuestionSet` lib/audit/question-set.ts:27; falls back to prompt_pack_version when either hash is null. |
| Excluded audits via `excluded_from_trends_reason` | confirmed | audits.ts:70 (0148); `isExcludedFromTrends` lib/audit/trend-exclusion.ts:18; `includedInTrends` lib/audit/trend-exclusion-sql.ts:10; set on /admin/audits. |

#### Recommendations (163)

| LLD claim (line) | Status | What the code does (path:line) |
|---|---|---|
| `lib/recommendations/index.ts` | confirmed | `buildRecommendations` :18. |
| `triggers.ts` | confirmed | `evaluateTriggers` lib/recommendations/triggers.ts:628. |
| `action_items` | confirmed | db/schema/action-items.ts:6. |
| `recommendation_research` | confirmed | db/schema/recommendation-research.ts:3; a global table with no RLS (0029:1052 comment). |
| Labels via `dimension-labels.ts` | confirmed | Path is lib/scoring/dimension-labels.ts: DIMENSION_LABELS :16, taskDimensionLabel :78, assertMeasuredTaskDimension :88 (used by lib/recommendations/persist.ts:4). |

#### Report (164)

| LLD claim (line) | Status | What the code does (path:line) |
|---|---|---|
| `lib/reports/report-data.ts` `pickBasisAudit` | confirmed | :280. Picks the latest full audit in the period, then the latest partial one, then the latest before the period. |
| `defaultReportPeriodLabel` | confirmed | :404 (async). |
| `lib/reports/pdf/report-document.tsx` (react-pdf) | confirmed | `@react-pdf/renderer` :18; `ReportDocument` :2500. |
| 7-8 A4 pages | confirmed | Always: Cover, Summary, Engines, Directories. Optional (template sections): Diagnosis, Trend & next, Method (:2507-2520). That's 7 pages with every section on and ≤15 matrix rows (MATRIX_ROWS_PER_PAGE :62), plus 1 page per 30 extra rows; 4 pages minimum. |
| `lib/reports/report-findings.ts` rules a–e | different | **Six rules, a–f.** Rule f fires when Reddit pages are cited in 2+ everyday answers (:20-33, `FindingRule` :43, `redditFinding` :347). |
| Up to 3 problems + 1 strength | confirmed | `reportFindings` :412-424: problems in order a, b, c, e, f, sliced to 3; the strength is rule d. |
| `inngest/.../render-report-pdf.ts` | confirmed | inngest/functions/render-report-pdf.ts:23-32: id `render-report-pdf`, event `report/generated`, concurrency POST_AUDIT_POOL; calls buildReportPdf at :119. |
| `generated_reports` | confirmed | db/schema/generated-reports.ts:8 (pdf_url, pdf_failure_reason/detail, template_id, report_type, period_label). |
| `report_templates` (`sections` jsonb, `tone` ignored) | confirmed | db/schema/report-templates.ts:4-16. `tone` is stored (professional / plain_english / executive, app/api/organizations/[orgId]/report-templates/route.ts:37) but never read: inngest/functions/generate-narrative-report.ts:67-69 selects only the default template's id and sections. |
| `lib/communication/pdf-builder.tsx` | confirmed | `buildReportPdf` :20 (renders ReportDocument), `buildBrandingPreviewPdf` :31. |
| Client portal does not list generated reports | confirmed | app/client-portal/[inviteToken]/page.tsx has no generated_reports or pdf query (branding theme only). |

#### Google AI (166)

| LLD claim (line) | Status | What the code does (path:line) |
|---|---|---|
| `google-surfaces.ts` | confirmed | The name is ambiguous; there are three. **Switches:** lib/governance/google-surfaces.ts (`resolveGoogleSurfaces` :253, `publicGoogleAi` :305), resolved in order env, credentials, global feature_settings, workspace org_feature_flags, plan Growth+ (:31-46). **Tables:** db/schema/google-surfaces.ts (feature_settings :32, brand_google_locations :60, audit_google_surfaces :79, google_surface_results :100). **Collector:** lib/audit/google-surfaces/collect.ts. |
| `location.ts` (postcode → suburb → city → state capital, labelled) | confirmed | lib/google-surfaces/location.ts:7-19, `resolveGoogleLocation` :89, `googleLocationForBrand` :166. The postcode is the operator's brand_google_locations override, else brands.postcode. Online-only brands and brands with no state get no Google. |
| Global and workspace switches on `/admin/settings` | confirmed | app/(auth)/admin/settings/page.tsx:1,38 (GoogleSurfacesAdmin). There's also an env kill switch, `GOOGLE_AI_SURFACES_ENABLED`. |

#### Plans (167)

| LLD claim (line) | Status | What the code does (path:line) |
|---|---|---|
| `tiers.ts` (features, models line, Google line) | confirmed | lib/pricing/tiers.ts: TIER_DEFINITIONS :72, `planModelsLine` :286, `GOOGLE_AI_FROM_TIER = "growth"` :37. `cardFeatures` :301-317 adds the Google line only when given `publicGoogleAi`. |
| `model-selector.ts` | confirmed | `auditModelFor` feeds `planModel` (tiers.ts:277-280). |
| Setting-aware public claims | confirmed | `publicGoogleAi()` (null while the global setting is off) is read by the marketing pages (app/(marketing)/pricing, methodology, about, home) and components/domain/google-ai/load-google-ai-claim.ts. |

#### Sample audit (168)

| LLD claim (line) | Status | What the code does (path:line) |
|---|---|---|
| `lib/sample-audit/run.ts` | confirmed | Calls runAuditInline with SAMPLE_AUDIT_CONFIG (chatgpt + perplexity, 6 prompts: lib/sample-audit/config.ts:20-21) at run.ts:173-175; passes the gate via allowUnconfirmed (run-audit-inline.ts:131-133). |
| `open-workspace.ts` (excludes `__sample__` workspace) | confirmed | Path is **db/open-workspace.ts**: `inOpenWorkspace` :20, `notTheSampleWorkspace` :25, `liveBrandsOnly` :41. `SAMPLE_ORG_SLUG = "__sample__"` (lib/sample-audit/sample-org-slug.ts:6). Data is deleted after 24 h (lib/sample-audit/retention.ts:23). |

### C. Migration 0029 policy template (line 211)

| LLD claim (line) | Status | What the code does (path:line) |
|---|---|---|
| Copy "migration 0029's policy template (VERIFY name)" | different | There is no named template or function. db/migrations/0029_rls_full_tenant_isolation.sql repeats a literal block per table for 50 direct-scoped tables (:42ff): ENABLE + FORCE, then policies `<table>_org_select` / `_org_insert` / `_org_update` / `_org_delete` (e.g. action_items :45-60). Newer migrations use a DO-loop version and cite "migration 0089's pattern" (db/migrations/0145_google_ai_surfaces.sql:122-139). 0029 also has a self-scoped variant (organizations, :964-983) and a join-scoped one (citations via audits, :984-1026). |
| The four policies on `organization_id = current_setting('app.current_org_id')::uuid` | different | The code uses **`current_setting('app.current_org_id', true)::uuid`** (missing_ok, so an unset GUC gives NULL and 0 rows: fail-closed, 0029:5-6, :49). INSERT uses WITH CHECK; UPDATE uses USING + WITH CHECK (:51-58). |
| FORCE ROW LEVEL SECURITY | confirmed | 0029:46 per table; also enforced by `APP_ROLE_FORCE_RLS` (scripts/db/app-role-grants.ts:28) and the drift check (:99). |
| Grants to `visibleau_app` | confirmed | 0029 grants nothing itself. Each new table's migration grants DML (0089:50, 0145:141-144). db/prod-fixes/0052-app-role-apply-prod.sql:34-38 and scripts/db/tier1a-app-role.sql:21-24 grant DML on ALL TABLES plus DEFAULT PRIVILEGES. |
| Global tables: SELECT only for `visibleau_app` | different | Every public table, global ones included, has SELECT/INSERT/UPDATE/DELETE for visibleau_app (0052 plus default privileges; e.g. feature_settings 0145:141). The guard tests/integration/app-role-grants.integration.test.ts:41-56 requires DML on every table, and `appRolePrivilegeDrift` (scripts/db/app-role-grants.ts:69-103, run by the integration global setup) reports any missing INSERT/UPDATE/DELETE as drift. A SELECT-only table fails both. |
| Text enums are `text` + CHECK (codebase convention) | different | Only partly. Newer columns use CHECK (0147 classification_status, 0125, 0145), but `brands.vertical`, `brands.region` and `tier` are pgEnums (db/schema/enums.ts:3-23), and `location_mode` has no CHECK (0048:20). |

## Other VERIFY statements


| LLD line | Statement | Status | What the code does (path:line) |
|---|---|---|---|
| L504-506 | The table that holds report branding | different | `agency_brand_assets`: per org (`brand_id IS NULL`) plus optional per-brand overrides (`db/schema/agency-brand-assets.ts:5-26`). Agency plan, owners and admins. Duplicate workspace rows are possible; the newest wins (`lib/branding/agency-assets.ts:69-70`). |
| L507-508 | The report schedule table | confirmed (exists) | `report_delivery_schedules` (`db/schema/report-delivery-schedules.ts:6`). Its `template_id` isn't read when reports are generated (`generate-narrative-report.ts:68-77` reads the org's default template). |
| L597 | `action_items` status history | missing (no history) | Only `status`, `done_at`, `dismissed_at`, `updated_at` (`db/schema/action-items.ts:40-45`). PATCH sets `done_at` on done and **clears it on in_progress**, with no audit-trail entry (`app/api/action-items/[id]/status/route.ts:40-46`). The auto-dismiss in `lib/recommendations/persist.ts:94-107` doesn't touch `updated_at`. |
| L610 | Business-identity sources: `abn-lookup.ts`, `wikipedia-au.ts`, the technical audit's entity findings | confirmed, with gaps | `technical_audits.findings.brandEntity` holds `abnVerified`, `abnNumber`, `abnStatus`, `wikipediaAuPresent`, `wikipediaAuStatus`, `wikipediaAuUrl`, `auTldPresent` (`lib/audit/run-technical-audit-inline.ts:93-105`). **The entity name is only in `brand_entity_scores.abn_entity_name`** (`:110-126`). It is a single name (`EntityName ?? BusinessName[0]`, `abn-lookup.ts:89`), so "trading as" isn't available. Wikipedia has 3 states (`lib/brand-entity/wikipedia-au.ts:17-19`). |
| L611 | YouTube from `youtube_presence_audits.check_status` | confirmed, with a gap | Values: `confirmed`, `not_found`, `unconfirmed`, `unavailable` (`db/migrations/0037_youtube_channel_confirmation.sql:31-35`). "Videos cited by AI in this audit" isn't measured: `cited_video_urls` is always `[]` (`inngest/functions/audit-youtube-presence.ts:55`). The cron is monthly (`:12`). |
| L612 | AI crawlers from `analyze.ts` plus `crawler_visit_logs`; "connect CDN Shield" | different | Robots findings: `technical_audits.findings.robots` (`lib/technical-audit/orchestrate.ts:273`). Its `aiBotsAllowed` means search crawlers only (`lib/robots-txt/analyze.ts:137-139`). `SEARCH_CRAWLERS` is OAI-SearchBot, Claude-SearchBot, Googlebot, PerplexityBot (`lib/robots-txt/evaluate.ts:201-208`, `:220`). Verified visits come only from uploaded logs. CDN Shield is not a visit source (`lib/agent-analytics/cdn-shield-join.ts:13-27`), so there is nothing to "connect". |
| L613 | `compositeMaxFor` | confirmed (exists; unused) | `lib/technical-audit/score-aggregator.ts:96-98` (100, then 98, then 95, now 74). Nothing in app code calls it yet. |
| L614 | `directory_registry` (S0) | different | There is no such table. The registry is the code constant `DIRECTORY_REGISTRY` (`lib/directories/registry.ts:92`). |
| L660 | Whether Free has reports | different (Free: no; Starter: no) | Reports are Growth and up (`lib/pricing/brand-features.ts:137-141`), enforced at `app/api/brands/[brandId]/reports/generate/route.ts:32`. The LLD's "Starter → Basic" would be a **new** entitlement. |
| L802 | `lib/llm/web-search-config.ts` per-engine location parameters | different | That file has **no** location parameters. OpenAI `webSearch({searchContextSize:"medium", userLocation:{type:"approximate", city, region, country}})` is at `lib/llm/openai-impl.ts:58-64`. Anthropic `webSearch_20250305({maxUses:5, userLocation:{type:"approximate", …}})` is at `lib/llm/anthropic-impl.ts:72-77`. Gemini `googleSearch({})` takes none (`lib/llm/google-impl.ts:68`). Perplexity takes none (`lib/llm/perplexity-impl.ts`). The input type is `{city?, region?, country?}` (`lib/llm/interface.ts:91-95`), built by `buildEngineLocation`: only when the location is fixed, confirmed and has a city; country is hard-coded `"AU"` (`lib/brands/region-label.ts:74-85`). |
| L821, L1006 | Wilson interval "already used" | confirmed | `lib/scoring/wilson.ts:1-15`, z = 1.96. Callers are listed in 1.8. |
| L880 | `audit/complete` | different | The event is `audit.complete` (`lib/audit/audit-complete.ts:13`). There are 14 listeners on the account-wide `POST_AUDIT_POOL` with limit 1 (`lib/inngest/concurrency.ts:41-45`). |
| L890 | `lib/crawler/index.ts` exists; every fetch path to customer sites | confirmed (exists), but many paths | `crawlSite` covers robots.txt, the sitemap (whose URL is taken from robots.txt and may be any host) and BFS pages with `redirect:"follow"` and **no private-IP or SSRF check, and no robots obedience** (`lib/crawler/index.ts:86-215`). It also has `fetchRobotsTxt` (`:226-241`). The other paths are listed under "Fetch paths" below. |
| L908 | The directory-links store | confirmed (table, not jsonb) | `brand_directory_listings` (`db/schema/brand-directory-listings.ts:17-47`), written by `PUT /api/brands/[brandId]/directory-listings` (`app/api/brands/[brandId]/directory-listings/route.ts:76-160`). The audit label is "Your profile: Not linked yet / {n} cited" (`lib/directories/profile-status.ts:10-30`). |
| L997 | `/brands/:id/reports` exists | confirmed | `app/(auth)/brands/[brandId]/reports/page.tsx`. There is no report-type column today. |
| L998 | The report branding settings route | confirmed | `/settings/report-branding` (`app/(auth)/settings/report-branding/page.tsx`). API `/api/report-branding` (`app/api/report-branding/route.ts`). |
| L602 | "Generate report starts the existing render job with `{ basisAuditId, contents }`" | different | The generate body is only `{periodLabel?, periodType}` (`generate/route.ts:17-20`). It goes through `trend/aggregated` → `generate-narrative-report` → `report/generated` → `render-report-pdf`. The render rebuilds from live data and has no snapshot (`render-report-pdf.ts:107-115`). |

**Fetch paths to customer sites (L890).** None of them is SSRF-guarded.

- `crawlSite` callers:
  - `lib/audit/run-technical-audit-inline.ts:31`
  - `lib/brands/classify-brand.ts:38` (its comment calls the crawler "SSRF-safe", which it isn't)
  - `inngest/functions/audit-entity-home.ts:35`
  - `inngest/functions/content-structure-audit.ts:40`
  - `inngest/functions/llmstxt-refresh.ts:37`
  - `inngest/functions/score-agent-readiness.ts:129`
  - `app/api/brands/[brandId]/llmstxt/generate/route.ts:47`
  - `app/api/brands/[brandId]/agent-analytics/coverage/route.ts:57`
  - `app/api/crawl/route.ts:31` (any domain from any member with `run_audit`)
- `fetchRobotsTxt` callers: `lib/crawler/crawler-access.ts:37` and `app/api/brands/[brandId]/agent-analytics/cdn-join/route.ts:58`.
- Home-page probe: `lib/crawler/crawler-access.ts:49`.
- llms.txt and llms-full.txt: `lib/technical-audit/orchestrate.ts:180` and `:198` (no User-Agent header).
- `/ai/*` and `ai.txt` endpoints: `lib/ai-discovery/endpoints.ts:101` (no User-Agent).
- MCP: `lib/retrieval/mcp-checker.ts:27`.

