# S00B report: one guarded fetch path for customer websites

Sprint S00B of the Vunnara client enhancements · 22–23 Nov 2026 · built on `origin/main` = `682a28a2` (S00, pushed; checked with `git fetch origin`) plus the v1.7 docs commit `afc8ee64` · nothing pushed.

## Read first

1. **Playwright: not needed in any part** (no screen or shared UI component changed). Nothing is "not run: memory".
2. **No migration, no flag, Inngest resync: no** (no file under `inngest/` changed). Nothing a customer sees changes for a public website.
3. **One visible change to check before the push: webhook endpoints on a port other than 80 or 443 stop receiving** (ports 80/443 only is one of the always-on rules; the endpoint URL was only checked to be a URL). Count them in production, read only: `SELECT count(*) FROM webhook_endpoints WHERE url !~* '^https?://[^/:]+(:(80|443))?(/|$)';`
4. **New direct dependency `undici` 7.27.2** (`package.json` +1 line, `pnpm-lock.yaml` +3): the exact version already installed through cheerio, so nothing new is downloaded. Why: Part 2b below.
5. **A pre-existing guard failure, not from S00B:** `tests/unit/load/no-silent-fetch-fallback.test.ts` flags `app/(auth)/brands/wizard/wizard-form.tsx:69` (`if (!res.ok) return;`), introduced by `70909f77` (S00 part 4). S00B touches no client file; it's listed here, not fixed.
6. **Gate:** S00 is on `origin/main` (checked). That 0153 is applied in production I can't check (no production access); taken from the push routine (run set before push) and the v1.7 gate table.

## Pre-flight

- `main`, clean apart from Sri's three untracked items. `git fetch origin`: local `main` = `origin/main` = `682a28a2` plus the v1.7 docs commit (the update step's one allowed local commit).
- Migration number: none expected, none written (0154 would be next).
- Baseline on the untouched tree: typecheck clean (`tsc` with `.next` and `next-env.d.ts` excluded: stale `.next/dev/types/routes.d.ts` breaks plain `tsc`); `vitest related` for every file S00B was going to touch: 105 files, 1,137 passed, 1 timeout under load (`tests/unit/crawler/failed-checks-not-negative.test.ts`, 18 of 18 alone). `tests/known-failures.txt`: 0 entries, still 0.
- Free memory 7.3 GB, 0 node processes. Flags: none added.

## Part 1. Inventory — `ce38cb63`

`docs/lld/fetch-inventory.md`. **12 fetch sites in 8 files**:
- the crawler: pages, robots.txt, the sitemap (from robots.txt's `Sitemap:` line, any host) and `fetchRobotsTxt`;
- the CDN Shield probe;
- llms.txt and llms-full.txt;
- the five AI files;
- MCP;
- the agency logo;
- webhook delivery and the webhook test.

They're reached by **9 crawl callers** and 6 others. For each: file:line, what it fetches, the trigger, role, plan, rate limit, user agent, timeout, redirects, size limit, robots.txt and scheme. All run on Node (no `runtime` export under `app/api`).
- **None can be started by an anonymous visitor.** Every route calls `getCurrentUser()` first; the free sample audit never crawls.
- `POST /api/crawl` is signed-in with `run_audit`, takes any domain string, and has no rate limit and no plan check.
- A brand's domain is any string up to 253 characters, cleaned of scheme and slashes only.
- Fixed-host clients out of scope, listed for Part 4: ABR (two), YouTube Data API, Wikipedia, DataForSEO, LLM providers, GA4, the AI crawler IP-range URLs (from the operator-seeded `ai_bot_registry`), Supabase, Stripe, Resend, Inngest, Upstash, Neon.
- Tests: none (docs). Playwright: not needed.

## Part 2. The guarded fetcher — `69e74713`, reworked in `99c5a103`

`lib/fetch/guarded-fetch.ts`, `lib/fetch/address-policy.ts`, `lib/fetch/transport.ts`.

- **Always on, for every caller:**
  - http/https only; ports 80 and 443 only; no credentials in the URL.
  - Refused: private, loopback, link-local, CGNAT, multicast, broadcast, unspecified, reserved, documentation and benchmarking ranges; IPv6 ULA, link-local and site-local; IPv4-mapped and IPv4-compatible; NAT64 or 6to4 carrying a blocked IPv4; Teredo; cloud metadata (169.254.169.254, fd00:ec2::254, 100.100.100.200, `metadata.google.internal`); `localhost`, `*.local`, `*.internal`.
  - IP literals in every notation. The WHATWG parser canonicalises decimal, octal, hex and short forms, and 42 forms are tested.
  - **DNS pinning:** the name is resolved once, every answer checked (one private answer refuses the host), and the socket connects only to checked addresses, with the original Host and SNI.
  - Every redirect is checked again from the start.
  - Hard caps of **60 s and 50 MB**, whatever a caller asks.
- **Per caller, defaulting to `fetch`'s behaviour:** user agent (or `fetch`'s own), timeout (the whole exchange, plus an optional headers-only limit), redirect mode and limit (20), byte limit, allowed content types (none checked), `obeyRobots` (off), per-host pace (off), `allowHttp` (on).
- **Refusals** are a `GuardedFetchError` with a code:
  - `blocked_address`, `blocked_scheme`, `blocked_port`, `too_many_redirects`, `too_large`, `timeout`, `bad_content_type`;
  - plus `blocked_credentials` and `blocked_by_robots` (proposed amendment 3).

  Each is logged as `{event, host, reason, detail}`, with no path, query, address or content. A timeout's error is named `TimeoutError`, so every caller's existing `outcomeForError` reads "timed out"; any other refusal reads "no answer". A timeout is logged only when it stops something being waited for (an unread probe body is closed silently).
- **Part 2b, why the rework.** Part 2 first talked HTTP through `node:http` directly. But five existing caller test files, about 70 tests (`failed-checks-not-negative`, `ai-discovery/endpoints`, `technical-audit/scoring-version`, `methodology-facts-and-sources`, `webhook-user-agent`), fake websites by stubbing global `fetch`, and the sprint requires them to pass unchanged.
  - Now the exchange **is `fetch`**, called with `redirect: "manual"` and a dispatcher: an undici 7 `Agent` whose connect lookup is the guard's. Request headers, decoding and errors are therefore `fetch`'s own.
  - Next's patched `fetch` passes `init.dispatcher` through (`patch-fetch.js:627`, `...init`).
  - undici 7's `DispatcherBase.dispatch` unwraps to the legacy handler API, so the Agent works with Node 22's and Node 24's bundled `fetch`.
  - Node never calls a lookup for an IP literal, so literals are checked before `fetch` on every hop.
  - The first hop hands `fetch` the caller's own URL string, as the caller did (`tests/unit/crawler/user-agent.test.ts` records it).
- **Tests, all new:**
  - `tests/unit/fetch/guarded-fetch.test.ts`, 96 tests:
    - every blocked class, 42 IP literals and exact range edges;
    - names refused before lookup, private and mixed DNS answers;
    - **DNS rebinding** (public then private: one lookup, the connection to the public answer, the second fetch refused);
    - redirects to loopback, metadata, port 8080 and `file:`;
    - too many redirects (3, and the default 20);
    - manual and error modes, and POST to GET after a 303 while a 307 keeps the POST;
    - an oversize body, a declared oversize length, and a gzip bomb;
    - the hard timeout cap, content types, headers timeout, overall timeout and the caller's signal;
    - `obeyRobots` (own group, `*`, off by default) and pace;
    - the log line's contents;
    - **parity with a real `fetch`** on request headers, br on https, 7 content encodings, statuses 404, 500, 204 and 999, and a POST body.
  - `address-policy.test.ts`, 24 tests: DNS text forms, zone ids, full and compressed IPv6.
  - `guarded-fetch-real-transport.test.ts`, 3 tests: the production dispatcher connects to what its lookup gives for a name that doesn't exist, keeping the Host header.
  - `guarded-fetch-injection-guard.test.ts`, 4 tests: no env read in `lib/fetch`, no setter, options carry no resolver or connector, and only `guarded-fetch.ts` imports the transport.
  - Tests reach a local server only through `vi.mock` of the transport (`tests/helpers/guarded-fetch-test-transport.ts`).
- **RED / GREEN:**
  - RED: all 4 files fail on the parent, with `lib/fetch` moved aside. GREEN: 127 passed.
  - Mutation probes, not kept:
    - skipping the check on DNS answers fails 5 tests (and 5 again after the rework);
    - skipping the check on redirect hops fails 2 (2 again).
- **Guards:** all 85 whole-repo source-scan guard files: 1,484 passed, plus the 1 pre-existing failure (Read first, 5). Part 2 itself first broke `no-borrowed-user-agent` (a UA from a variable named other than `ua`); fixed.
- Typecheck clean; lint 0 new. **Stop point met:** every security test passed before Part 3 moved a caller.
- Playwright: not needed (no UI change).

## Part 3. Every caller on it

The same two tests in each group:
- **Parity:** the caller's output on recorded public sites, as a golden file written on the code *before* that caller moved, then compared byte for byte after. The fixtures go through a global-`fetch` stub with `fetch`'s own redirect rules (`tests/helpers/fetch-fixtures.ts`, `fixture-sites.ts`).
- **Refusal:** no transport mock. A local server stands in for an internal address. Before the move the caller read it or sent to it (RED); after, nothing connects and the caller's existing "couldn't reach" path answers (GREEN).

| Group | Commit | Change | New tests: RED before → GREEN | vitest related / files naming the path |
|---|---|---|---|---|
| 3a crawler (F1–F4) | `e3d55f70` | 4 fetches → `guardedFetch`; same UA, timeouts (a page's still covers its headers only), follow. Bounds: page body 60 s and 10 MB, robots.txt 5 MB, sitemap 50 MB | `crawler.test.ts`: parity on 4 sites × crawl 20/1/0 + `fetchRobotsTxt`. Refusal of a `Sitemap:` line, a home redirect and a robots redirect to internal, plus an internal brand domain. **4 RED** (the parent read the internal sitemap, the "Internal admin" page and robots.txt) → 5 GREEN | 27 files / 602 passed; 25 / 327 |
| 3b classification | `440dd23c` | comment only (it called the crawler "SSRF-safe") | `classification.test.ts`: parity of the prompt and result on 4 sites; refusal of a home redirect to internal. **1 RED** (the internal title reached the LLM prompt) → 2 GREEN | 10 / 75; 9 / 100 |
| 3c CDN Shield probe (F5) | `c5882a92` | → `guardedFetch` (our UA, manual, 5 s); the unread body is now cancelled | `cdn-shield.test.ts`: parity on 7 sites (Cloudflare 403, 302 not followed, Akamai 503, Sucuri 429…); internal domain refused and logged. **1 RED** (only robots.txt was guarded; the probe went out) → 3 GREEN | 2 / 10 |
| 3d name suggestion | `031cb065` | comment only | `name-suggestion.test.ts`: parity on 4 sites; refusal of a redirect to internal. **1 RED** ("Internal Corp" was suggested) → 2 GREEN | 2 / 12; 2 / 6 |
| 3e `POST /api/crawl` | `cdea0b41` | comment only: auth unchanged; not anonymous, so no limiter | `crawl-route.test.ts`: parity on 4 sites × 20/2 pages; refusal of a redirect to internal and of an internal domain. **2 RED** → 3 GREEN | 1 / 3 |
| 3f llms.txt, AI files, MCP (F6–F9) | `398cb9dc` | → `guardedFetch` with each one's own headers and timeout. Bounds: llms.txt 10 MB, llms-full.txt 50 MB, AI files and MCP 10 MB | `technical-audit-files.test.ts`: parity of technical-audit scores and findings, AI discovery and MCP on 4 sites; refusal of redirects to internal. **3 RED** (internal files counted as the site's own) → 4 GREEN | 30 / 349; 12 / 144 |
| 3g agency logo (F10) | `5c909ae9` | the loader passes a guarded fetch. `fetchAgencyLogo` keeps every rule; `fetchImpl` is now **required*** | `agency-logo.test.ts`: parity on 8 logo URLs; refusal of 198.18.0.1 (not in the string check). **1 RED** (the reserved address served the logo) → 2 GREEN | 66 / 710 |
| 3h webhooks (F11, F12) | `1efb5efc` | → `guardedFetch` (same POST, headers, UA, 10 s, follow); response bounded at 1 MB; the test route cancels the body | `webhooks.test.ts`: parity of both senders to 2xx, 500, 410, 301 and unknown host; refusal of an internal endpoint and of a 307 to one. **2 RED** (the internal server got the signed payload) → 3 GREEN | 3 / 105; 3 / 14 |

\* The logo module is bundled for the browser (`report-branding-form.tsx` reads `agencyInitials`), so it can't import the fetcher. With no default, no logo is fetched with a bare `fetch`. Every caller already passed one.

- **Existing tests unchanged** in every group, including the five files that stub `fetch`.
- **Integration**, against `visibleau_integration`: `brand-aliases` (the name-suggestion route), `report-branding` and `plan-feature-gates` (the webhook test route): 3 files, 122 passed.
- Typecheck clean after every group. Lint: 0 new per changed file. The import order was sorted where biome flagged it; in `lib/crawler/index.ts` and `crawler-access.ts` it was already unsorted before S00B.
- Playwright: not needed (no UI change).

## Part 4. Guard against new unguarded fetches — `f3c700fc`

`tests/unit/fetch/no-unguarded-fetch.test.ts`, 6 tests:
- Every server file (not "use client") under `app/`, `lib/` and `inngest/` outside `lib/fetch` that calls `fetch`, or hands it on as a value, is one of **11 named fixed-host clients**. Each entry gives the file, the host it names in its own code, why it's allowed, and its **exact count**, so a new fetch even in a listed file fails.
  - GA4; the AI bot IP ranges (operator table); the ABR (2); Wikipedia; Perplexity; DataForSEO; Supabase; YouTube (4 calls);
  - two browser helpers that call the app's own `/api`. `fetch-json` is asserted to be imported only by client components.
- No undici, `node:http(s)`, axios, got, node-fetch or cross-fetch outside `lib/fetch`.
- The 8 moved callers call `guardedFetch` and never `fetch`.
- **Proven to bite** (not kept): the pre-S00B crawler fails 2 checks; a new ``fetch(`https://${domain}`)`` in `lib/brands` fails the list; an undici import fails the library check.
- Guards: all 85 guard files, 1,484 passed, plus the 1 pre-existing failure. N13 and route guards (`post-audit-concurrency`, `s8-route-guards`): 62 passed. All S00B tests: 13 files, 157 passed.

## Part 5. Inventory update — `b73379e5`

`docs/lld/fetch-inventory.md` section 6:
- the commit each fetch site moved in;
- the options each kept and the bound added where there was none;
- what's left out and why: the fixed-host clients, the browser's `/api` requests, DNS-only visitor checks;
- **six proposed amendments to LLD 8.6.2:**
  1. hard caps of 60 s and 50 MB; the LLD's 10 s / 2 MB / 3 redirects / HTML-only are S06's preset, not limits on existing callers;
  2. `http:` kept per caller (`allowHttp`), not upgraded;
  3. two more refusal codes;
  4. the `obeyRobots` rules (own group then `*`; a 4xx allows, a 5xx or no answer disallows, RFC 9309; cached 10 min);
  5. the `fetch` + undici dispatcher design and the new dependency;
  6. the scope is 12 sites, logo and webhooks included, and the webhook port effect.

## Inventory summary

12 fetch sites. **12 migrated**, 0 left out. **0 anonymous.** 11 fixed-host clients are allowed by name in the guard.

## Fixture parity

Every migrated caller's output on recorded public sites is byte for byte what it was before its move:
- crawl results at 20, 1 and 0 pages, and `fetchRobotsTxt`;
- the classification prompt and result;
- the name suggestion;
- `/api/crawl`;
- CDN Shield verdicts;
- technical-audit scores and findings, AI discovery and MCP;
- the agency logo bytes;
- webhook results.

The goldens are in `tests/unit/fetch-callers/__golden__/`, each written with `UPDATE_GOLDEN=1` on the code before its caller moved. The crawler-backed goldens (classification, name suggestion, `/api/crawl`) were written on the crawler from `99c5a103`, before 3a.

## Non-regression (LLD section 4)

- **N1–N5, N8, N9, N14, N15:** nothing in S00B touches questions, mentions, scoring of AI answers, Google, branding, the sample audit or the PDF. The logo bytes have parity, and `report-branding.integration` passed.
- **N6:** technical-audit scores have parity (3f); `scoring-version.test.tsx` passed unchanged.
- **N7:** no new table; no new `serviceDb`; `rls-tenant-query-guard` passed.
- **N10:** no plan or claim change. **N11:** `no-cost-for-customers` passed. **N12:** no placeholder data, no production writes; `no-placeholders-on-customer-pages` passed.
- **N13:** no file under `inngest/` changed; `post-audit-concurrency` passed.

## Commits

```
b73379e5 docs(lld): S00B part 5 -- fetch inventory: the commit each of the 12 fetch sites moved in ...
f3c700fc test(fetch): S00B part 4 -- guard against new unguarded fetches ...
1efb5efc feat(webhooks): S00B part 3h -- webhook deliveries and the settings page's test delivery ...
5c909ae9 feat(reports): S00B part 3g -- an agency logo URL ... is fetched through the guarded fetcher ...
398cb9dc feat(technical-audit): S00B part 3f -- llms.txt, llms-full.txt, the AI files and MCP ...
cdea0b41 test(crawl): S00B part 3e -- POST /api/crawl is on the guarded fetcher through the crawler ...
031cb065 test(brands): S00B part 3d -- the name suggestion (S00 part 4) is on the guarded fetcher ...
c5882a92 feat(crawler): S00B part 3c -- CDN Shield's home-page probe goes through the guarded fetcher ...
440dd23c test(brands): S00B part 3b -- classification's home-page read is on the guarded fetcher ...
e3d55f70 feat(crawler): S00B part 3a -- the crawler's pages, robots.txt, sitemap and fetchRobotsTxt ...
99c5a103 feat(fetch): S00B part 2b -- the guarded fetcher's exchange is fetch itself, with a pinning undici dispatcher ...
69e74713 feat(fetch): S00B part 2 -- the guarded fetcher (lib/fetch/guarded-fetch.ts) ...
ce38cb63 docs(lld): S00B part 1 -- fetch inventory ...
afc8ee64 docs: client-enhancements pack v1.7 (S00 amendments, Playwright memory rules and Sri's decisions)
```

`git log origin/main..main --oneline`: these 14 plus this report's commit. Nothing pushed.

## Vercel environment (names only)

- **Nothing new is required.** `lib/fetch` reads no environment variable (a guard test holds it).
- **`RATE_LIMIT_IP_SALT`** (optional) is the variable behind `rate_limit_ip_salt_missing`:
  - It's read only by the Postgres rate limiter's IP hash, `lib/governance/pg-rate-limit.ts:43-51`. Without it, the hash uses a built-in default salt, logs the warning once per process, and **never blocks a request**.
  - The limits still work in production without it. What's lost is the defence-in-depth against linking hashes across deployments.
  - `POST /api/crawl` gets no limiter (not anonymous). The name suggestion's limiter (`user:<id>` keys) hashes through the same function.
- **`CRAWLER_TIMEOUT_MS`, `CRAWLER_MAX_PAGES_PER_SITE`** (optional, unchanged). A page timeout above 60 s is now cut to the hard limit.
- Unrelated to S00B and unchanged: `UPSTASH_REDIS_REST_URL` / `_TOKEN` (the sample audit's limiter, which falls back to Postgres), `ABN_LOOKUP_GUID`, `YOUTUBE_API_KEY`.

## Push notes

1. **Migration: none.**
2. **Inngest resync: no.** No function, step or configuration changed. `deliver-webhook` calls `deliver()`, which is now guarded; its definition is the same.
3. **Safe while an audit runs: yes.** Audits keep fetching public sites with the same options. A deploy mid-audit only changes which code makes the next request.
4. **No flag.** Nothing customer-visible changes for public sites. The one visible change is webhooks on non-standard ports: count them first (Read first, 3).
5. **Dependency:** `undici` 7.27.2 is now a direct dependency (lockfile updated; already installed).
6. Playwright: nothing to run (no UI change in any part).

## Proposed changes to the documents (for Sri and Claude chat)

- **LLD 8.6.2:** the six amendments in `docs/lld/fetch-inventory.md` section 6.
- **LLD 0.2 #19:** twelve fetch sites, including the logo and webhooks, not "about eight".
- **Runbook section 5:** "Fetching customer websites ... only through `lib/fetch/guarded-fetch.ts`" now has its guard, `tests/unit/fetch/no-unguarded-fetch.test.ts`. A new fixed-host client needs an entry there (file, host, why, count).
- **For S06:** its fetch preset is these options: `{ obeyRobots: true, perHostIntervalMs: 1000, maxRedirects: 3, timeoutMs: 10_000, maxBytes: 2 MB, allowedContentTypes: [...], allowHttp: false }`, with our user agent.

## Memory and processes

Start: 7.3 GB free, 0 node processes. No dev server, Playwright run or build in this sprint. End: 6.80 GB free, 0 node processes.

## Tests skipped by the testing-scope rules

Full suites: not run (not asked). No `next build`. Playwright: not needed (no UI change).
