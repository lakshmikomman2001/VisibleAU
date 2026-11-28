# S04B report: Perplexity on the Agent API, provider limits, reach views, and S04's follow-ups

28 Nov 2026. Pack v1.18 (docs commit `ae50ccde`), on `origin/main` = `be10c849`. Every part is committed locally;
**nothing is pushed**. `visibility_reach` stays off everywhere.

> **Migration 0158 is needed** (runbook stop point S04B): `engine_call_failures.error_class` has a CHECK (0089, re-added
> by 0123), so Part 2's new class `provider_quota` comes as **0158** with a run1–run4 set. **S05's migration becomes 0159**
> (and S06's 0160, S07's 0161, as the runbook's gate table shifts).

> **A decision for Sri (Part 1):** every plan now asks Perplexity's own **Sonar** (`perplexity/sonar` on the Agent API).
> Agency and up asked `sonar-pro`, which the Agent API doesn't offer. Perplexity's own migration table maps both Sonar
> and Sonar Pro to the `fast` effort, which answers with an OpenAI model (`openai/gpt-6-luna`), so I didn't use it.
> Our own drift notes already showed Perplexity answering Sonar Pro requests with Sonar ("Perplexity answered with
> sonar instead of sonar-pro (13 of 13 answers)"). The pricing cards for Agency and up now say "Perplexity (Sonar)".
> To use the `fast` effort instead, change `agentApiModel`/`agentApiRequestBody` in `lib/llm/perplexity-impl.ts`.

## Playwright: specs not run because of memory

**None.** Every spec `scripts/qa/e2e-specs-for.ts` mapped to a changed file ran and passed on a fresh server, one run
per call. Two runs had something to report:
- **sprint3 shard 1/2** stopped at the memory floor after 7 of 8 tests. Its leftover rows were removed, and the cut-off
  test then passed alone.
- **responsive-shell shard 15/16** had one failure: my new test, because of a bug in the test itself. It passed once
  fixed.

Details are under "Playwright" below.

## Pre-flight

- `origin/main` = local `main` = `be10c849` at the start, plus this session's docs commit `ae50ccde` (the update-step
  exception). The tree was clean apart from Sri's three untracked items (`GoogleAI/`, `prod-fixes/`,
  `db/prod-fixes/0131-run1b-is-active-nullable-check.sql`), which are untouched.
- The contract (v1.10) compiles with `tsc --strict`. Typecheck on the start tree is clean (temporary config
  `.qa/s04b/tsconfig.json`, gitignored, excluding `.next`).
- **Guards:** 223 source-scan guard files at the start (199 unit in 4 batches, 24 integration), 225 at the end. The only
  start-tree failures were the two known cold timeouts, `prompt-trend` and `avatar-color`; Part 6 gives both explicit
  timeouts. `tests/known-failures.txt` is empty and stayed empty, and `compare-failures` found no new failures in any
  part.
- **Memory at the start:** 2.68 GB free of 15.43 GB. The top users were `ollama app` 4.15 GB (not this session's; left
  running), svchost 1.63 GB (94 processes), msedgewebview2 1.07 GB, Memory Compression 0.74 GB and msedge 0.42 GB.
  From Part 4 on, 6.4–7.1 GB was free at each Playwright start.

## Part 1: Perplexity on the Agent API (`50a5ee5b`; amendment 99)

- **Request** (`lib/llm/perplexity-impl.ts`):
  - It posts to `https://api.perplexity.ai/v1/agent` (`:69`) with `model: "perplexity/sonar"` (`agentApiModel`, `:72`)
    and `tools: [{ type: "web_search" }]`.
  - `max_output_tokens` is the answer limit (8,192), and `temperature` is 0.7 as before (`agentApiRequestBody`, `:114`).
  - Timeouts, the single attempt (retries stay in `with-retry`), cache recording and mock mode are unchanged.
- **Response:**
  - The answer is every `output_text` of every `message` output item.
  - Sources are the `url_citation` annotations first, then the `search_results` item's URLs, de-duplicated in order
    (`sourceUrls`, `:210`). This mirrors Sonar's `citations` then `search_results`.
  - `usage.input_tokens`/`output_tokens`/`total_tokens`, and the cost from `usage.cost.total_cost` (provider-reported).
  - An `incomplete` response is a truncated answer (kept, flagged, never cached). A `content_filter` stop is
    `IncompleteAnswerError`. A `failed` or `cancelled` response throws, class `other`.
- **Location:** the Agent API's `web_search` takes `user_location`, so Perplexity is told the reach's location as Claude
  is (`lib/reach/engine-location.ts`):
  - Local: today's `buildEngineLocation` (city, state, "AU").
  - State: region and country.
  - Country: the country.
  - Worldwide: none.

  `lib/llm/reach-location-params.ts` quotes the doc. **LLD 8.4.4's Perplexity column, proposed:** local city, region,
  country; state region, country; country country; global none.
- **Model:** every plan asks `sonar` (`lib/llm/model-selector.ts`). `model-drift` reads `perplexity/sonar` as `sonar`,
  so Free–Growth's model set and trends continue unchanged. Agency and up change from `sonar-pro` to `sonar`, so their
  next audit's Perplexity is "models changed" for trends (once).
- **Errors:** an HTTP error carries its parsed body as `data`, so `classify-error` reads Perplexity's `error.type`.
  - 429 `request_rate_limit_exceeded`/`token_rate_limit_exceeded`: rate_limited, retried after `Retry-After`.
  - 401: other.
  - 500: other, with one retry.
  - 503: overloaded.
  - 402 (out of credits): `provider_quota` (Part 2).

### Documentation (read 28 Nov 2026)

| Item | What the docs say | Link |
|---|---|---|
| Retirement | "Sonar Chat Completions support ended on September 27, 2026. Synchronous and streaming requests keep working: they are being reformulated as Agent API requests, rolling out gradually by model." | https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/overview.md |
| Endpoint | "POST https://api.perplexity.ai/v1/agent" (`/v1/responses` is an alias); `Authorization: Bearer` | https://docs.perplexity.ai/docs/agent-api/quickstart |
| Body | `model` "in provider/model format"; `input` a string or items; `max_output_tokens` ("`max_tokens` is renamed to `max_output_tokens`"); `temperature` "forwarded to generation" | https://docs.perplexity.ai/api-reference/agent-post.md · https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/how-to.md |
| Web search | "Web search is opt-in"; `{"type": "web_search"}`; with no `search_type` "it uses "web""; `user_location`: `country` (ISO alpha-2), `region`, `city`, lat/long | https://docs.perplexity.ai/docs/agent-api/tools/web-search |
| Model | `perplexity/sonar`, "Perplexity's grounded search model", $0.25 in / $2.50 out per 1M tokens; no Sonar Pro on the Agent API | https://docs.perplexity.ai/docs/agent-api/models.md |
| Mapping | "`sonar` → `fast`, `sonar-pro` → `fast`, `sonar-reasoning-pro` → `low`"; `fast` runs on "`openai/gpt-6-luna`" | how-to.md above · https://docs.perplexity.ai/docs/agent-api/effort.md |
| Response | `output[]` message → `content[]` `output_text`; a `search_results` item (`results[]`: id, url, title, snippet, date); `url_citation` annotations; `status` completed/failed/incomplete/…; `usage` with `cost.total_cost` | agent-post.md, web-search above |
| Price | `web_search` "$2.50 per 1,000 invocations" (fast $1.00); "When present, `usage.cost.total_cost` reports an estimate" | https://docs.perplexity.ai/getting-started/pricing |
| Errors | 429 `error.type` `request_rate_limit_exceeded` / `token_rate_limit_exceeded` with `Retry-After`; "If your account runs out of credits, requests can return `402 Payment Required`" | https://docs.perplexity.ai/docs/admin/rate-limits-usage-tiers.md · https://docs.perplexity.ai/docs/resources/faq.md |

### Price per answer

One real call to each endpoint confirmed the response shape. The question was invented and generic: "Who are the
best-reviewed plumbers in Parramatta NSW for an emergency callout?" The raw JSON is in `.qa/s04b/perplexity-probe/`;
the test fixture keeps the shape with invented content.

| | Model answered | Tokens in / out | Cost per answer (provider-reported) | Sources |
|---|---|---|---|---|
| Sonar Chat Completions (today, Free–Growth) | sonar | 18 / 359 | US$0.00553 (input 0.00219, output 0.00084, request 0.0025) | 10 citations, 10 search results |
| Agent API, `perplexity/sonar` + web search | perplexity/sonar | 4,874 / 405 | US$0.00473 (input 0.00014, cache write 0.00108, output 0.00101, search 0.0025) | 15 search results, no `[n]` markers, no annotations |

- About 14% cheaper per answer on this question. The mock fixtures carry the recorded usage (US$0.00473).
- Sonar Pro (Agency and up) cost more today: the price table holds $3/$15 per 1M, and a 6 Nov real call reported
  US$0.00462 for 12 in / 4 out tokens.
- The price-table fallback rows (used only when a response has no `usage.cost`) are not changed: open item 3.

### Cache

- The key is unchanged: the model id stays `sonar`, still `grounded`, with a scope only beyond Local.
- So answers Sonar Chat Completions cached in the last 24 hours still replay where a cache read is allowed: sample
  audits, and a retry within the hour. Owner-started audits always fetch fresh.
- Agency's keys change (`sonar-pro` to `sonar`).
- The other engines' Local keys are unchanged (`makeKey` untouched).

### Customer-facing wording

The Methodology page and the PDF's method page keep "Perplexity" (`ENGINE_DISPLAY_NAMES`). The PDF's model line reads
"Sonar" through `modelName`.

### Tests

- `perplexity-agent-api.test.ts` 21 tests: the request body through a stubbed fetch, location per reach, parsing the
  recorded shape, annotations, truncation, filter, failure, mock mode and error mapping. 14 were RED on the parent; the
  7 that passed there pin unchanged behaviour.
- `vitest related` (5 sources): 390 files, 4,191 passed, 35 failed in 12 files. Every failure was an existing test that
  pinned the old Sonar shape, `sonar-pro` or "Perplexity takes no location" (see "Existing tests changed"). After the
  changes: 113/113 unit, 18/18 integration.
- Guards: 223 files passed, plus the tests that name the changed paths (no-unguarded-fetch, market-strings,
  model-set-comparison).
- Playwright: not needed (no UI change).

## Part 2: provider spend and quota limits (`23bb08d4`; amendment 100; migration 0158)

### Migration and run set

- `db/migrations/0158_engine_error_provider_quota.sql` re-adds the CHECK with 0123's eight classes plus
  `provider_quota`. No row is written.
- Run set `db/prod-fixes/0158-s04b-run1..run4`:
  - run1 is read-only.
  - run2 is the migration verbatim, with one summary SELECT before COMMIT.
  - run3 is read-only: nine classes, validated, no row outside them, counts checked against run1.
  - run4 relabels `provider_quota` rows `other`, then restores 0123's check.
- Cycled run4 → run1 → run2 → run3 → run4 → run1 → run2 → run3 on the local dev database (`.qa/s04b/0158-cycle/`).
  Applied to `visibleau`, `visibleau_e2e`, `visibleau_integration` and `visibleau_test`.
- run1's check 4 counts the spend and quota refusals already filed `other` (audit #57 has 10). They stay `other`: no
  backfill.

### Classification

`lib/llm/classify-error.ts:284` (`providerQuota`). Each doc was read 28 Nov 2026 and is quoted in the code.

| Provider | Classed `provider_quota` | Source |
|---|---|---|
| Anthropic | 400 `invalid_request_error`, message starting "You have reached your specified API usage limits" or "…specified workspace API usage limits"; 429 `rate_limit_error` with `error.details.error_code` `enforced_spend_limit_reached`; 402 `billing_error` | https://platform.claude.com/docs/en/api/rate-limits · https://platform.claude.com/docs/en/api/errors |
| OpenAI | 429 `insufficient_quota`; `credit_balance_exhausted`; `organization_spend_limit_exceeded`, `project_spend_limit_exceeded`, `organization_usage_limit_exceeded` | https://developers.openai.com/api/docs/guides/error-codes |
| Gemini | 402 `payment_required` ("Your Prepay credit balance is depleted."); 400 `FAILED_PRECONDITION` and 403 `PERMISSION_DENIED` when the message is about billing ("disabled billing", "citing an outstanding balance") | https://aistudio.google.com/docs/api-errors · https://aistudio.google.com/docs/troubleshooting |
| Perplexity | 402 Payment Required ("If your account runs out of credits"; no body documented) | https://docs.perplexity.ai/docs/resources/faq.md |

- Not quota, unchanged:
  - Ordinary 429s: Anthropic `rate_limit_error`, OpenAI `rate_limit_exceeded`, Perplexity's two rate-limit types.
  - Gemini's 429 `RESOURCE_EXHAUSTED`. Its docs say spend-based limits use it too, but a rate limit can't be told apart
    from one.
  - Gemini's daily grounded-search limit (`rate_limited`, not retried).
- `describeEngineFailure` names a `provider_quota` with no matching words as "account/credit"
  (`lib/audit/engine-failure.ts`).

### The stop after the first refusal

`lib/audit/provider-quota.ts`. Calls already in flight when the first refusal comes back still finish.

- **Inline runner** (`run-audit-inline.ts:215`): keeps the first refusal per engine in memory, since it runs as one
  execution.
- **Inngest runner** (`run-audit.ts:251`): reads the first recorded refusal (`attempts > 0`) at the start of each call
  step, since steps can run in separate invocations. No step id was added or renamed.
- Each remaining call is recorded as failed with class `provider_quota`, attempts 0, latency 0, cost 0, and the message
  "Not sent: {Engine} refused an earlier call in this audit. {the refusal's stored message}". So the operator reason is
  the same, and customers see "a problem on our side".
- The per-engine panel and the PDF still count every question as failed.

### What the operator sees

- **Email:** one per provider per 24 hours while refusals continue, through `operatorRecipients` and
  `claimOncePerWindow`, as Google's account alert does (`alertOperatorsOnProviderQuota`, `provider-quota.ts:116`).
  - The text is the sprint's: "{Engine} refused calls: its spend or quota limit is reached. {provider message}. Raise
    the limit in the provider's console."
  - It never fails the call. The claim is given back if the send fails.
- **No in-app notification path exists.** The topbar bell (`components/domain/app-topbar.tsx:122-133`) has no handler,
  and there is no notifications table. Under runbook section 2 the code wins, so the in-app signal is `/admin/settings`
  → Provider errors → a new **"AI engines"** table (`google-surfaces-admin.tsx:314`, `lib/audit/engine-refusals.ts:37`).
  - Its columns: engine, class, the provider's own message, first seen, last seen, audits affected (refused, not sent).
    Newest first.
  - It reads every workspace with `serviceDb`, as Google's provider errors do. This is the sprint's one new `serviceDb`
    read, on a platform-admin page.
  - Screenshot with an invented refusal (Claude's spend limit, 1 refused + 3 not sent):
    `.qa/screens/S04B/admin-engine-refusals-1240-light.png`, `-1240-dark.png`, `-390-light.png`.
- **Found by the parity golden:** the audit page's failure line named the raw class to customers ("3 failed: 3
  provider_quotas, not counted"). `provider_quota` now reads "error", as `other` did, with counts merged by label
  (`page.tsx:155`). With that, the golden page is byte-identical; only the three stored `error_class` values change.

### Tests

New, all RED on the parent (the modules didn't exist; the integration test failed 4/4):
- `provider-quota-classify.test.ts` 23 tests: every shape above, the non-quota ones, one attempt, the operator and
  customer reasons, and the call not sent.
- `provider-quota-alert.test.ts` 5 tests: the sprint's wording, once per provider per day, another provider's own email,
  a failed send releasing the claim, no operator list.
- `provider-quota-stop.integration` 4 tests: both runners on the mock model's `openai_out_of_quota`, the real claim (one
  email across two audits), and the admin list.
- `run-set-0158.test.ts` 5 and `engine-refusals-admin.test.tsx` 3.

Runs:
- `vitest related` (12 sources): 458 files, 4,603 passed, 6 failed. All 6 were existing tests pinning class `other`;
  changed under amendment 100.
- The page's own related run: 36 files / 191 passed.
- Golden readers and schema-drift passed. Path-naming tests passed: 33 unit and 20 integration files.
- Guards: 224 files passed.
- Playwright: not needed (no UI change except the admin table, shot above).

## Part 3: the results write and `audit.complete` (`4687379a`; amendments 104, 105)

- **`writeAuditReachResults`** (`lib/reach/results.ts:122`):
  - The delete and the insert run in one transaction.
  - A failure logs one line, `{"event":"reach_results_not_stored","auditId","sqlstate"}`, with no SQL or parameters.
  - An audit that asked no everyday question stores Local 0 of 0 with no interval, hashed as 0157's backfill does
    (`noAnswersResult`, `:157`). An audit whose everyday calls all failed already stored 0 of 0 per reach.
  - Still non-fatal, still called where S04 calls it.
- **"Oldest cached answer": nothing to change (the code wins).**
  - The audit page reads `MIN(citations.cached_from_at)` (`app/(auth)/audits/[auditId]/page.tsx:388-391`). Both
    runners set that from the cache hit's `fetchedAt`, and a hit beyond Local is read with its reach's scope (since S04
    part 4).
  - The scope-less `getOldestCacheEntryDate` (`lib/llm/cache.ts:122`) has no production caller; only a test uses it.
    S04's open item 3, and amendment 104's last clause, describe that function, not the page.
  - A test pins a State question's cached time.
  - Proposal: remove `getOldestCacheEntryDate`, and correct the amendment.
- **Finalize run twice** (`inngest/functions/run-audit.ts:548`):
  - When the UPDATE matches no row because the audit is already complete, the step re-runs its repeat-safe tail. That
    is the cost snapshot (`ON CONFLICT DO NOTHING`), the reach results rewrite and the quality gate. The function then
    goes on to `audit.complete` instead of ending "already_terminal".
  - An audit the stale-run guard failed is unchanged.
  - Every `audit.complete` carries the audit id as its event id (`lib/audit/audit-complete.ts:34`): both runners and
    the Google collector. So Inngest drops a repeat, and the email, report and follow-ups happen once. The only other
    explicit event id in the code is `enhanced-checks-${reportId}`, so ids don't collide.
- **Tests:**
  - New: `reach-results-write.integration` 4 tests (a failed re-write keeps the rows, the log line's shape, 0 answers,
    the State cached time) and `finalize-sends-audit-complete.integration` 4 tests (finalize body run twice; the whole
    function twice with one event id, delivered once; the stale-guard case; the inline runner).
  - RED 5 of 8 on the parent. The 3 that pass there pin behaviour that was already right.
  - `vitest related`: 108 files, 1,168 passed, 1 failed: `scheduled-audit-follow-ups` pinned the event without its id;
    updated under amendment 105, now 5/5.
  - Guards: 224 passed.
- **Inngest resync: yes.** The finalize body changed; no step id was added or renamed.

## Part 4: reach views (`36dd5211`; amendment 102; behind `visibility_reach`)

- **P02 edit mode by reach** (`components/domain/questions/question-editor.tsx`, `byReach` `:1059`):
  - One section per enabled reach, in reach order (plus any reach a draft row is still in), then "Names your business".
  - Each section has its own "+ Add question", which opens P03 with that reach chosen.
  - Rows reorder within their own section only: menu, Alt+arrow and drag.
  - The row menu's "Move to another area" (`:897`) lists the other enabled reaches and moves the row to the end of that
    section. It is hidden with one reach.
  - The draft bar counts moves per section (`draftChanges`, `:89`): a row moved to NSW is "1 moved". The global
    position count said 7.
  - With the flag off, the S04 code paths are unchanged.
- **P07 Responses by reach** (`page.tsx:2179`): for an audit with more than one reach, one section per reach (label and
  question count), with the questions naming the business last. S04's per-row reach pill is gone.
- **P07 reach filter** (`components/domain/audit/reach-filter.tsx`; wiring at `page.tsx:802`):
  - "All areas · {reaches}" is a radiogroup named Area, above the per-engine table. It sets `?area=` without scrolling.
  - A reach chosen shows the per-engine table and its failure lines from one grouped read
    (`lib/reach/views.ts:45`).
  - It also shows the competitor context from the same competitor scan: `countCompetitorMentions` per reach
    (`competitor-mentions.ts:145`), through `shareOfVoiceForBrands`. Shares come from the one counter
    (`shareOfVoiceInReach`, `share-of-voice.ts:201`), only where the whole audit shows shares.
  - "All areas", or an unknown area, renders the page byte for byte as before.
- **Fixed while building:**
  1. A missing React key on the edit sections showed Next's "1 Issue" badge in the first screenshot.
  2. A bug S03 shipped (`7af3dc71`): at 640 px and below, edit-mode rows used a three-column grid while the drag handle
     was hidden. The text fell into the 20 px column and wrapped a letter at a time, live for `agency_questions`
     workspaces on phones. The row is now two columns there. This changes on the push for Splice.
- **Guards that caught something in this part:**
  - `no-real-names-in-ui` read `.splice(` as a client's name.
  - `one-share-of-voice` caught `views.ts` working out a share itself. That moved into the counter.

### Tests

- New: `edit-by-reach.test.tsx` 6, `reach-filter.test.tsx` 3, `reach-views.test.ts` 3, `reach-views.integration` 5 (the
  page through its real loader on seeded Ironstone: 4 Local and 3 NSW questions, the rest Australia).
- New e2e `20-s04b-reach-views.spec.ts` 2 tests, on an invented 3-reach brand:
  - Move a Local question to NSW, remove one NSW question, add one in Australia from its section, apply. The set is
    3/3/4.
  - The next audit's Responses sections are in order. Each area's filter figures add up to its tile, and the tiles to
    the headline.
- `responsive-shell` gains "Questions by reach": view and edit mode at 390, 768, 1240 and 1920.
- The unit files and 3 of the 5 integration tests were RED on the parent. The rest pin the flag-off and one-reach cases.
- `vitest related` (7 sources): 169 files, 2,024 passed, 1 failed: `reach-display.integration`'s navigation mock lacked
  `usePathname`/`useSearchParams`; extended.
- Guards: 224 passed. Path-naming tests passed: 11 unit, 7 integration.

## Part 5: small fixes (`45693a9a`; amendments 98, 101, 103, 106, 110)

- **Free and regeneration** (101): `lib/prompts/regenerate-prompt-pack.ts:166` keeps a person's set only when
  `effectiveTier()` isn't Free. It is read inside the regeneration's transaction, so it uses the plan at that time.
  Listed in `tests/helpers/plan-gates.ts` (the effective-tier guard).
  - Test: `regeneration-free-plan.integration` 3 tests. Free writes the next version; Starter keeps the set; Starter
    dropped to Free writes the next version.
  - RED 2/3 on the parent; the Starter case passes, as before.
- **P01 copy** (103): built in S04 part 6 (`reach-card.tsx:226-227`, and "(small sample)" for Local under 5). A new
  test pins "Starter: up to 1 area".
- **Rule b with one directory** (106; live for everyone): "This is the directory it cited most in them." when the action
  names one directory, "These are the directories …" otherwise (`lib/reports/report-findings.ts:293`).
  - Tests: `rule-b-one-directory.test.ts` 2 (both forms, one and two engines).
  - The four seeds' page counts are unchanged: `report-render-seeded` and `report-layout-s01c` (N15).
- **The audit page's Google place line** (110; live for everyone): `google-search-ai-section.tsx:58` prints the PDF's
  `googlePlaceLine`, "Kurrajong Heights NSW 2758 · desktop · 28 Nov 2026", when Google was asked at the brand's own
  postcode. Otherwise the provider's place, as before.
  - Test: `google-place-line.test.tsx` 2 tests, RED on the parent.
- **Reach refusals** (98): nothing to change. `tests/integration/reach-settings.integration.test.ts:255` pins 403
  `plan_required` and 402 `question_limit` ("PUT refusals: role, Local off, place, Local under 4, plan reach limit (403),
  everyday limit (402)").
- **Runs:** `vitest related`: 146 files, 1,546 passed, 0 failed. Guards: 224 passed after listing the new gate.
  Playwright: no spec maps to the changed files; ran 09 (the Google card) anyway, 6/6.

## Part 6: run sets and test hygiene (`6cddc50b`; amendments 107, 108)

- `db/prod-fixes/0157-s04-run2-apply.sql` is now the reviewed copy: the RLS-bypass check, and `nullif` in the Wilson
  interval.
  - Run on a local copy (dev) with a complete audit that has no answers: run4 → run1 → run2 → run3, all clean. That audit
    stored Local 0 of 0 with no interval (`.qa/s04b/0157-run2-reviewed-cycle/`).
  - `run-set-0157` and `visibility-reach-schema.integration` pass with it.
- **New guard** `tests/unit/db/run-set-backfill-guards.test.ts`: every run2 from 0157 on that inserts into a FORCE RLS
  table checks `rolbypassrls` before its first insert and guards every division with `nullif`.
  - The FORCE RLS tables are read from `db/migrations`, including the `FOREACH … ARRAY[…]` loops 0145 and 0154–0157 use.
  - RED on the old run2, on both checks.
- **Test hygiene:**
  - sprint3 FE-2.1 waits for the exact "Run an audit to see visibility intelligence".
  - `prompt-trend`'s 404 test and `avatar-color`'s row test set 30 s for their cold first import or render.
  - The dead-link "race" was `group-b-orphans` writing its dead-link break-proof file into `components/domain/brand/`,
    which the dead-link guard scans. It now writes to its own temporary folder.
- **Shard counts:** no script holds them. The note in `tests/e2e/helpers/e2e-config.ts` said 8 shards and now says 16.
- **Runs:** all 225 guard files passed with the three hygiene fixes in the batches. sprint3 16/16 (see Playwright).

## Existing tests changed (runbook: each named, with the LLD line)

- **Amendment 99** ("S04B Part 1 moves the adapter to the Agent API with web search on"):
  - These moved to the Agent API's response shape (shared helper `tests/helpers/perplexity-agent-response.ts`):
    `perplexity-impl.test.ts`, `model-drift.test.ts` (the two Perplexity cases), `answer-token-counts.test.ts`,
    `output-limit.test.ts`, `provider-reported-cost.integration`.
  - These expect `sonar` for Agency (no Sonar Pro on the Agent API): `model-selector.test.ts`,
    `llm-service-factory.test.ts`, `engine-routing.integration`, `model-price-coverage.test.ts`,
    `plan-models-and-google-row.test.tsx`.
  - These expect Perplexity to take a location: `reach-location-params.test.ts` and `engine-location.test.ts`.
- **Amendment 100** ("such refusals get `error_class` 'provider_quota'"):
  - `spend-limit-failure.test.ts`, `out-of-quota-not-retried.test.ts`, `out-of-quota-not-retried.integration`.
  - The `google-surfaces-off-parity` golden, regenerated with `UPDATE_GOLDEN=1`: only the three `error_class` values
    change.
- **Amendment 102** ("P02's edit mode in one section per reach"):
  - `reach-sections.test.tsx`: "a question beyond Local is in its reach's section", which was S04's reach chip.
  - `reach-display.integration`: its navigation mock (the filter renders there).
- **Amendment 105** ("sends `audit.complete` … with the audit id as the event id"): `scheduled-audit-follow-ups.integration`.
- **Amendment 106** ("'This is the directory it cited most in them.'"): `rule-b-directories.integration` and
  `measured-wording.integration`. Each case names one directory.
- **Amendment 108** ("sprint3 FE-2.1 … exact-text locator; prompt-trend and avatar-color explicit timeouts; dead-link-guard
  its own temporary folder"): `sprint3-visibility.spec.ts`, `prompt-trend.test.ts`, `avatar-color.test.tsx`,
  `group-b-orphans.test.ts`.

## UI: per screen

```
P02 · Brand → Questions tab (S04B: edit mode by reach)
Nodes: P02.section by reach in edit mode ✓, P02.row.more "Move to another area" ✓, P02.addQuestion at each reach section's foot ✓,
       P02.draftBar "{moved} moved" per section ✓
States: flagOff ✓ (S04's single "Everyday questions" edit section), planLock ✓ (Starter's lock in each section), overLimit ✓
        (Add off with the limit sentence; the help line once, under the last reach section)
Acceptance:
  ✓ Sections follow reach order then "Names your business"; branded questions never draggable into reaches (edit-by-reach, spec 20)
  ✓ Edit mode works by keyboard alone: menu, Move to another area, Alt+arrow within the section (edit-by-reach)
  ✓ A row dragged onto another section's row stays where it was (edit-by-reach)
  ✓ "+ Add question" opens P03 with that reach chosen; the question lands in that section (edit-by-reach, spec 20)
  ✓ responsive-shell "Questions by reach": view and edit fit 390, 768, 1240 and 1920
Screenshots: .qa/screens/S04B/P02-edit-by-reach-{1240,390}-{light,dark}.png, P02-view-by-reach-{1240,390}-{light,dark}.png
  (the view-mode reach screenshots owed since S04)
Deviations: none from the contract. Fixed S03's rows at <=640 (letter-per-line text), as above.
```

```
P03 · Add question drawer (S04B: area preselected)
Nodes: P03.area ✓ preselected from the section that opened the drawer
Acceptance: ✓ the section's reach is checked on open (edit-by-reach, spec 20: "Australia" checked)
Deviations: none
```

```
P07 · Audit page (S04B: Responses by reach, reach filter, Google place line)
Nodes: P07.responses ✓, P07.reachFilter ✓, P07.googlePlace ✓
States: flagOff ✓ (no filter, no sections: reach-views.integration), one reach ✓ (no filter, no headers)
Acceptance:
  ✓ "All areas" (and no ?area, and an unknown area) is the page as before, byte for byte (reach-views.integration)
  ✓ Each area's per-engine figures add up to its tile, the tiles to the headline (spec 20); every engine's reaches add up to All areas (reach-views.integration)
  ✓ One grouped read for the answers by reach and engine, one for the failures; competitors per reach from the same scan (no query per reach)
  ✓ The Google line reads "{suburb} {STATE} {postcode} · {device} · {date}" at the brand's own postcode (google-place-line)
Screenshots: .qa/screens/S04B/P07-reach-filter-1240-{light,dark}.png (the filter and the cards it filters), P07-reach-filter-390-{light,dark}.png
Deviations: the filter lives in the URL (?area=), as the page's tabs do; the contract says "the choice isn't remembered between audits", which holds.
  spec 20's brand has no competitors, so its screenshot shows "No competitors configured"; the per-reach competitor rows are tested in reach-views.test.ts.
```

```
P01 · Brand settings reach card (amendment 103)
Nodes: P01.reach plan chip ✓ singular for one area; P01.reach.legend "(small sample)" ✓ for any reach under 5, Local included
Deviations: none (built in S04 part 6; S04B adds the test for the singular)
```

## Playwright

One spec, or one shard, per call. Each ran on a fresh server that Playwright started, with at least 6 GB free at the
start and a stop below 1.2 GB. After every run the server and browser processes had exited, port 3000 was free and no
node processes were left. No run peaked above 6 GB.

| Spec | Result | Peak tree / lowest free (GB) |
|---|---|---|
| 20-s04b-reach-views (new) | 2/2 (final run; 3 earlier runs before fixes also 2/2) | 4.45 / 1.97 |
| 16-s02-questions-view | 2/2 | 3.93 / 2.27 |
| 17-s03-questions-edit | 2/2 | 4.05 / 2.63 |
| 18-s03-confirm-questions | 2/2 | 4.80 / 1.71 |
| 19-s04-reach-settings | 3/3 | 4.68 / 1.82 |
| 09-google-surfaces (`PLATFORM_ADMIN_EMAILS` set) | 6/6 (Part 4), 6/6 (Part 5) | 3.71 / 2.99 |
| 10-not-found-and-errors | 4/4 | 4.12 / 2.36 |
| 11-s01-part0-carryovers | 5/5 | 3.75 / 2.77 |
| 13-s01-beyond-ai | 2/2 | 3.82 / 2.83 |
| audit-running/running-to-finished | 4/4 | 3.21 / 3.41 |
| qa/sprint4 f04-audit-results | 2/2 | 3.25 / 3.21 |
| sprint2/sprint2-workflow (2 shards) | 11/11 + 8/8 | 4.88 / 1.62 |
| responsive/responsive-shell (16 shards) | 98/98 (see below) | 4.97 / 1.89 |
| sprint3/sprint3-visibility (2 shards) | 16/16 (see below) | 5.54 / 1.15 (stopped) |

- **responsive-shell:**
  - Shards 1–8 and 10–14 passed 7/7 each.
  - Shards 9 and 16 hold no tests (Playwright's split of 98).
  - Shard 15 was 6/7. The failure was the new "Questions by reach" test: it set only the set items' reach, while the tab
    reads the library row's. The test was fixed and passed alone on a fresh server.
- **sprint3:**
  - Shard 1/2 (the FE-1 serial block) stopped at the memory floor after tests 1–7, with no failures logged.
  - Its leftover spec accounts were removed through `removeSpecAccount` on `visibleau_e2e` only.
  - The cut-off test (`:418`) then passed alone. Shard 2/2 passed 8/8, FE-2.1 included.
  - FE-1 can't be split further by `--shard`. Proposal: run it in two `--grep` halves.

## Commits

```
6cddc50b chore(db): S04B part 6 -- the reviewed 0157 run2 in the repo and a guard on backfilling run2s; test hygiene: an exact-text locator, cold-start timeouts and a temporary folder of its own (LLD amendments 107, 108)
45693a9a fix(questions): S04B part 5 -- Free brands' sets follow amendment 74 on a regeneration; rule b says "This is the directory" for one; the audit page's Google line reads as the PDF's (LLD amendments 98, 101, 103, 106, 110)
36dd5211 feat(reach): S04B part 4 -- reach views: P02 edit mode in one section per reach, the audit page's Responses by reach, and the reach filter for the per-engine table and competitor context (LLD amendment 102; behind visibility_reach)
4687379a fix(audit): S04B part 3 -- reach results are rewritten in one transaction and logged in one line; a finalize step run again still sends audit.complete, once, by its audit-id event id (LLD amendments 104, 105)
23bb08d4 feat(engines): S04B part 2 -- a spend, credit or quota refusal is provider_quota; after the first one an engine is sent no more calls in the audit, and the operators are told (LLD amendment 100; migration 0158)
50a5ee5b feat(llm): S04B part 1 -- Perplexity answers through its Agent API with web search on, told each reach's location; every plan asks Perplexity's own Sonar (LLD amendment 99)
ae50ccde docs: client-enhancements pack v1.18 (S04 done, S04B)
```

(`git log origin/main..main --oneline` at the time of writing; this report's own commit follows.)

## Push notes

1. **Migration 0158 first, in production: run1 → run2 → run3** (`db/prod-fixes/0158-s04b-run1..run3`), with the pg_dump
   backup first.
   - From the push on, the runners record a spend or quota refusal as `provider_quota`. The old check refuses that
     (23514) and fails the call's step.
   - run2 changes no row; run3 is read-only. run4 is only for reverting before the push.
   - The 0157 run2 in the repo is the reviewed copy. Production already ran the original, which wrote the same rows;
     nothing to re-run.
2. **Inngest resync: yes.** No step id was added or renamed, so in-flight runs replay into the same steps. What changed:
   - Part 1: Perplexity's request path, inside run-audit's call step.
   - Part 2: the call steps read the first refusal and alert.
   - Part 3: the finalize body, and every `audit.complete` carries its event id.
3. **Safe while an audit runs.** A running audit's calls go through the same steps.
   - A Perplexity call made after the push uses the Agent API.
   - An audit that hits a quota refusal after the push stops calling that engine.
   - The finalize change only matters on a repeat.
4. **What changes for everyone on the push:**
   - Part 1: Perplexity answers through the Agent API, as `perplexity/sonar` with web search and the Local location.
     Agency and up ask Sonar (no Sonar Pro), and their pricing cards say "Perplexity (Sonar)".
   - Part 2: refusals are classed and stopped, and the operator email and admin table work. Customers still see "a
     problem on our side", and the audit page's failure line still says "errors".
   - Part 3: the results write and `audit.complete`; nothing a customer sees.
   - Part 5: rule b's singular wording, and the Google place line. A Free brand's set now regenerates as amendment 74
     says.
   - **Behind `agency_questions` (Splice):** S03's edit-mode rows at 640 px and below no longer wrap a letter per line.
5. **Behind `visibility_reach` (off):** Part 4's reach views. Turn it on only together with `question_library` and
   `agency_questions`, as for S04.
6. **Suggested live check (one audit):**
   - Perplexity answered through the Agent API: its citations rows' `llm_model_answered` is `perplexity/sonar`, and the
     answers have sources.
   - The stored Local row in `audit_reach_results` equals the page's figures.
   - The Google card reads "{Suburb} NSW {postcode} · desktop · {date}".
   - `/admin/settings` shows the "AI engines" table (it says "None recorded." until a provider refuses).

## Open items for Sri

1. **Perplexity model** (top of the report): Sonar for every plan, or the `fast` effort (an OpenAI model) for Agency
   and up?
2. **No in-app notification store** exists for operators (the topbar bell has no handler). Proposal: backlog, with the
   amendment reading "the admin settings page and one email per provider per day".
3. **Price-table fallback for Perplexity** (`lib/audit/compute-cost.ts`): the `sonar` row is $1/$1 per 1M with no
   request fee, "as first entered". The Agent API docs list `perplexity/sonar` at $0.25/$2.50 per 1M plus $0.0025 per
   search. It is only used when a response has no `usage.cost`, so it's unchanged. Proposal: correct it.
4. **`getOldestCacheEntryDate`** (`lib/llm/cache.ts:122`) has no production caller: amendment 104's cached-time clause
   describes it, not the page. Proposal: remove it, and correct the amendment.
5. **The audit page's failure line has no label for `incomplete_answer`** (a raw "incomplete_answers" would show).
   Pre-existing; found beside Part 2's fix. Proposal: label it "incomplete answer".
6. **LLD 8.4.4**: Perplexity's column, as in Part 1.
7. **sprint3 FE-1** peaks at 5.5 GB in one shard and can't be split by `--shard`. Proposal: two `--grep` halves in the
   runbook's list.
8. A **live Gemini 429 RESOURCE_EXHAUSTED** can be a spend limit or a rate limit; it stays a rate limit, as the docs
   give no way to tell them apart.

Memory at the end: 6.51 GB free of 15.43 GB; node processes: 0 (this repo's and in all), as after every Playwright run.
