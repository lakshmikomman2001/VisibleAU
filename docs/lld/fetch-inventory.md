# Fetch inventory: every server-side fetch of a customer-supplied URL

Repo path: `docs/lld/fetch-inventory.md` · S00B Part 1 · 22 Nov 2026 · against `main` at `afc8ee64` (code as pushed at `682a28a2`).

S00B (LLD 8.6.2, D-SEC1, amendment 19) moves every place that fetches a URL built from customer input onto one guarded fetch path, `lib/fetch/guarded-fetch.ts`. This file lists them: what each fetches, who can make it happen, and the request options each uses today (which it keeps). "Customer input" here means a brand's domain, a link or redirect on the customer's own site, a sitemap URL from the customer's robots.txt, a webhook endpoint URL, or a logo URL. None of these is fetched with any check of the address it resolves to today; only the logo fetch has a string-only host check.

Totals: **12 fetch sites** in **8 files**, reached by **9 crawl callers** and 6 other callers (section 2). **None can be started by an anonymous visitor** (section 3). Every route listed runs on the Node runtime (no `export const runtime` anywhere under `app/api`).

## 1. The fetch sites

"Default fetch headers" means Node's `fetch` (undici 7) adds its own: `accept: */*`, `accept-language: *`, `sec-fetch-mode: cors`, `user-agent: node` when none is given, and `accept-encoding: br, gzip, deflate` (https) or `gzip, deflate` (http). "Follow" is `fetch`'s default redirect mode (up to 20 redirects, to any host, port or scheme `fetch` supports).

| # | File:line | What it fetches | User agent | Timeout | Redirects | Size limit | robots.txt | http / https |
|---|---|---|---|---|---|---|---|---|
| F1 | `lib/crawler/index.ts:31` (`fetchPage`) | `https://{domain}`, then every link on the fetched pages whose hostname equals the domain (any scheme, **any port**), breadth-first, up to `maxPages` | `CRAWLER_USER_AGENT` (`Vunnara-Audit-Bot/1.0 (+https://vunnara.com.au/about)`, `lib/product.ts`) | `timeoutMs` (caller's, else `CRAWLER_TIMEOUT_MS`, else 15 s) until the **response headers** only; the body has **no time limit** (`clearTimeout` at :36, then `res.text()`) | Follow | **None** | Not obeyed (fetched, never applied to the crawl) | Starts at https; same-host `http:` links and redirects to `http:` are followed |
| F2 | `lib/crawler/index.ts:105` | `https://{domain}/robots.txt` | ours | 10 s for the whole exchange (`FILE_FETCH_TIMEOUT_MS`, signal on the body too) | Follow | **None** | n/a | https |
| F3 | `lib/crawler/index.ts:132` | The robots.txt's first `Sitemap:` URL (**any host**, any scheme `fetch` supports), else `https://{domain}/sitemap.xml` | ours | 10 s whole exchange | Follow | **None** | n/a | Whatever the robots.txt names |
| F4 | `lib/crawler/index.ts:228` (`fetchRobotsTxt`) | `https://{domain}/robots.txt` | ours | 5 s whole exchange (callers pass none) | Follow | **None** | n/a | https |
| F5 | `lib/crawler/crawler-access.ts:49` (CDN Shield probe) | `GET https://{domain}`: status and headers only, body never read | ours | 5 s | **Manual** (a 3xx is the answer) | n/a (body not read) | n/a | https |
| F6 | `lib/technical-audit/orchestrate.ts:180` | `https://{domain}/llms.txt` | **Default fetch headers** (`node`) | 5 s whole exchange | Follow | **None** | n/a | https |
| F7 | `lib/technical-audit/orchestrate.ts:198` | `https://{domain}/llms-full.txt` | default | 5 s | Follow | **None** | n/a | https |
| F8 | `lib/ai-discovery/endpoints.ts:101` (`checkEndpoint`) | `https://{domain}` + `/.well-known/ai.txt`, `/ai.txt`, `/ai/summary.json`, `/ai/faq.json`, `/ai/service.json` (5 requests, in parallel) | default | 10 s (`ENDPOINT_TIMEOUT_MS`) | Follow | **None** | n/a | https |
| F9 | `lib/retrieval/mcp-checker.ts:27` | `https://{domain}/mcp.json`, then `/.well-known/mcp` | ours | 5 s | Follow | **None** | n/a | https |
| F10 | `lib/reports/agency-branding.ts:107` (`fetchAgencyLogo`) | An agency logo URL that isn't the workspace's own upload: only rows saved before uploads were required (`logoUrlAllowed`, `lib/branding/agency-assets.ts:144`, keeps an existing URL) | default | 5 s (`LOGO_FETCH_TIMEOUT_MS`) | **Error** (a redirect fails the logo) | 2 MB (content-length, then the bytes) | n/a | **https only**, plus a string-only `isPrivateHost` (`:59`): no DNS check, so a public name resolving to a private address passes |
| F11 | `lib/webhooks/deliver.ts:15` | `POST` to the workspace's webhook endpoint URL (signed JSON) | `WEBHOOK_USER_AGENT` | 10 s whole exchange | Follow (a 301/302/303 turns the POST into a GET, per `fetch`) | **None** (response body read, then returned) | n/a | Any: the URL is only `z.string().url()` (`app/api/webhooks-config/route.ts:13`), so any host, **any port**, http or https |
| F12 | `app/api/webhooks-config/[id]/test/route.ts:52` | The same endpoint, a test `POST` | `WEBHOOK_USER_AGENT` | 10 s | Follow | n/a (status only) | n/a | Any |

Response handling every site relies on (and the guarded fetcher must keep): `res.ok`, `res.status`, `res.headers` (`get`, `forEach`; F1 copies every header into `CrawlPage.headers`, F5 hands them to `CdnShieldDetector`), `res.text()` / `res.arrayBuffer()`, bodies decoded per `content-encoding` as `fetch` decodes them, and errors classified by `lib/crawler/fetch-outcome.ts:24` (`outcomeForError`: an error named `TimeoutError` or `AbortError` is "timed out", anything else "no answer").

## 2. Who can make each fetch happen

| Caller (file:line) | Fetch sites | Trigger | Who (signed in, role, plan) | Rate limit | Options passed |
|---|---|---|---|---|---|
| `lib/audit/run-technical-audit-inline.ts:31` (`crawlSite`) and `:66` (`orchestrateTechnicalAudit` → F6–F8) | F1–F3, F6–F8 | `POST /api/audits` (`app/api/audits/route.ts:189`) and background audits (`lib/audit/run-background-audit.ts:14`: scheduled, bulk, workflow) | Signed in, `run_audit` (`audits/route.ts:29`); background: the schedule's workspace | The daily spend check on manual audits | 20 pages, 15 s |
| `lib/brands/classify-brand.ts:38` | F1–F3 | `brand/created` (`app/api/brands/route.ts:190`; `retry-classification/route.ts:53`) → `classify-on-brand-create`; `brand/classify-all` (`app/api/admin/backfill-classify/route.ts:43`) → `classify-existing-brands` | Signed in, `manage_brands`; the backfill: operators | None | 1 page, 8 s |
| `inngest/functions/audit-entity-home.ts:35` | F1–F3 | `technical-audit/complete` | Server job after a technical audit | n/a | 10 pages |
| `inngest/functions/content-structure-audit.ts:40` | F1–F3 | cron `0 22 * * 3` (weekly) | Server job, every live brand | n/a | 20 pages, 15 s |
| `inngest/functions/llmstxt-refresh.ts:37` | F1–F3 | cron `0 3 1 * *` (monthly) | Server job | n/a | 20 pages |
| `inngest/functions/score-agent-readiness.ts:129`, `:150` (`checkMcpEndpoint`) | F1–F3, F9 | `technical-audit/complete` | Server job | n/a | 20 pages, 15 s |
| `app/api/brands/[brandId]/llmstxt/generate/route.ts:47` | F1–F3 | `POST` | Signed in, brand access, `generate_content` | None | from the route |
| `app/api/brands/[brandId]/agent-analytics/coverage/route.ts:57` | F2, F3 (`maxPages: 0`: no page) | `GET` | Signed in, brand access, plan `page_coverage` | None | 0 pages |
| `app/api/crawl/route.ts:31` | F1–F3 | `POST {domain, maxPages?}` | Signed in, `run_audit`; **any domain string** (`z.string().min(3)`), not tied to a brand; no plan check | **None** | up to 20 pages |
| `app/api/brands/name-suggestion/route.ts:49` (S00 part 4) | F1–F3 | `GET ?domain=` | Signed in, `manage_brands`; a plain host name only (`suggestionHost`, `lib/brands/name-suggestion.ts:115`: no IP, port, path, localhost, `.local`, `.internal`) | 30 per user per 10 min (`checkPostgresRateLimit`) | 1 page, 8 s |
| `lib/crawler/crawler-access.ts:37` (`fetchRobotsTxt`), `:49` (probe) | F4, F5 | `GET /api/brands/[brandId]/cdn-shield` (`route.ts:43`) | Signed in, brand access | None | 5 s each |
| `app/api/brands/[brandId]/agent-analytics/cdn-join/route.ts:58` | F4 | `GET` | Signed in, brand access, plan `cdn_shield_check` | None | 5 s |
| `fetchAgencyLogo` via `loadAgencyLogo` (`lib/reports/agency-logo-loader.ts:19`) | F10 | `render-report-pdf` (Inngest, `report/generated`), `GET /api/audits/[auditId]/export` (`route.ts:110`), `POST /api/report-branding/preview` | A report render; signed-in members of a white-label (Agency) workspace | None | 5 s, 2 MB |
| `inngest/functions/deliver-webhook.ts:49` | F11 | `webhook.deliver` (sent by `fanout-webhooks`, `:138`) | Server job; endpoints are created by `manage_integrations` on the `webhooks` plan (Agency, `lib/pricing/tiers.ts:123`) | n/a (Inngest retries 5) | 10 s |
| `app/api/webhooks-config/[id]/test/route.ts:52` | F12 | `POST` | Signed in, plan `webhooks`, `manage_integrations` | None | 10 s |

Where the domain comes from: a brand's `domain` is any string up to 253 characters (`app/api/brands/route.ts:29`, cleaned of scheme and trailing slashes only at `:86-91`; PATCH the same, `[brandId]/route.ts:28`). So today a brand named `169.254.169.254`, a site whose robots.txt names `Sitemap: http://10.0.0.5/…`, or a home page that redirects to an internal address is fetched as given.

## 3. Anonymous visitors

**None of the twelve can be started by a visitor who isn't signed in.** Every route above calls `getCurrentUser()` first and answers 401 without a user. The free sample audit (`app/api/sample-audit`, `lib/sample-audit/run.ts`) runs AI questions only: it never crawls, classifies or runs a technical audit. `app/api/visit` and `app/api/badge` fetch nothing. The sprint's "add the Upstash limiter if anonymous" therefore doesn't apply; `POST /api/crawl` stays as it is for signed-in members with `run_audit` (no limiter added), and the guarded fetcher removes the internal-address reach it had.

## 4. Not in scope: fixed-host clients (allowed by name in the Part 4 guard)

These call one fixed host (or a host from operator-only data). A customer can choose a query parameter at most, never the host.

| Client | File:line | Host |
|---|---|---|
| ABR (ABN lookup) | `lib/brand-entity/abn-lookup.ts:75`; second path `lib/trust/entity-checker.ts:108` | `abr.business.gov.au` |
| YouTube Data API | `lib/trust/youtube-channel-lookup.ts:204`, `:267`, `:314`, `:337` | `www.googleapis.com` (a user's channel URL is parsed, never fetched) |
| Wikipedia | `lib/brand-entity/wikipedia-au.ts:57` | `en.wikipedia.org` |
| DataForSEO | `lib/serp/dataforseo.ts:284` (injected `fetch`) | `api.dataforseo.com` |
| LLM providers | `lib/llm/*-impl.ts` through the `ai` SDK; direct `lib/llm/perplexity-impl.ts:77` | provider APIs |
| GA4 Measurement Protocol | `inngest/functions/ga4-push.ts:48` | `www.google-analytics.com` |
| AI crawler IP ranges | `lib/agent-analytics/ip-ranges.ts:48` | URLs from `ai_bot_registry.cidr_source_url` (operator-seeded global table, `db/seed/ai-bots/seed.ts`), never from a workspace |
| Supabase | `lib/supabase.ts:35` (the client's `fetch`), storage | `NEXT_PUBLIC_SUPABASE_URL` |
| Stripe, Resend, Inngest, Upstash, Neon | their SDKs (no direct `fetch` in app code) | fixed |

Also not in scope: the browser's own requests to the app's `/api/*` (client components, `lib/hooks/use-action.ts:43`, `lib/load/fetch-json.ts:69`, `lib/auth/workspace-errors.ts:79`), and DNS-only lookups of visitor IPs (`lib/agent-analytics/verify-crawler-hits.ts`: reverse/forward DNS, no HTTP).

## 5. What moving them changes, and what it doesn't

The network protections (scheme http/https only, ports 80 and 443 only, no credentials in the URL, every resolved address checked and pinned, every redirect checked again, a hard overall timeout and body cap) apply to all twelve. Everything else is each caller's own today and stays as an option: user agent (or none: the default fetch headers), timeout and what it covers, redirect mode and limit, size limit, content-type handling (each caller checks it itself today; the fetcher adds no check for existing callers), robots.txt (off for every existing caller), rate limit (off), and the scheme each one starts with. Where a caller had no limit (F1–F4, F6–F9, F11 size; F1's body time), Part 3 sets one and records which.

Visible to a customer only where the site itself does something the protections refuse, and then through the caller's existing "couldn't reach" path ("no answer", "Failed to fetch … (no answer)"):
- a page, robots.txt, sitemap or redirect on a private, loopback, link-local, CGNAT, multicast, reserved or metadata address, or behind an IP literal in one;
- a same-host link or redirect to a port other than 80 or 443 (F1: `https://example.com.au:8443/…` was crawled);
- a `Sitemap:` line naming a non-http(s) URL (F3; `fetch` also read `data:` URLs);
- a webhook endpoint on a port other than 80 or 443, or on an internal address (F11, F12). Sri: before the push, count them read-only in production: `SELECT count(*) FROM webhook_endpoints WHERE url !~* '^https?://[^/:]+(:(80|443))?(/|$)';`.

## 6. Migrated in (S00B part 5)

The guarded fetcher: `lib/fetch/guarded-fetch.ts` (`69e74713`; its exchange is `fetch` with a pinning undici dispatcher since `99c5a103`). Guard against new unguarded fetches: `tests/unit/fetch/no-unguarded-fetch.test.ts` (`f3c700fc`).

| # | Fetch site | Migrated in | Options kept | Bound added where there was none |
|---|---|---|---|---|
| F1 | crawler pages | `e3d55f70` | our UA; the page timeout on the headers; follow | body 60 s (hard limit), 10 MB |
| F2 | crawler robots.txt | `e3d55f70` | our UA; 10 s; follow | 5 MB |
| F3 | crawler sitemap | `e3d55f70` | our UA; 10 s; follow | 50 MB (the sitemap protocol's maximum) |
| F4 | `fetchRobotsTxt` | `e3d55f70` | our UA; 5 s; follow | 5 MB |
| F5 | CDN Shield probe | `c5882a92` | our UA; GET; manual; 5 s; body not read (now cancelled at once) | n/a |
| F6 | llms.txt | `398cb9dc` | fetch's own headers; 5 s; follow | 10 MB |
| F7 | llms-full.txt | `398cb9dc` | fetch's own headers; 5 s; follow | 50 MB |
| F8 | AI files | `398cb9dc` | fetch's own headers; 10 s; follow | 10 MB |
| F9 | MCP | `398cb9dc` | our UA; 5 s; follow | 10 MB |
| F10 | agency logo | `5c909ae9` | https only; its string host check; error on redirect; 5 s; 2 MB; PNG/JPEG by bytes | n/a |
| F11 | webhook delivery | `1efb5efc` | POST; signed headers; webhook UA; 10 s; follow (POST to GET after 301/302/303, as fetch) | response 1 MB (read for the result only; a failed read was already "") |
| F12 | webhook test | `1efb5efc` | the same; status only (body now cancelled) | n/a |

The callers that reach F1–F3 through `crawlSite` moved with the crawler (`e3d55f70`); each has its own parity and refusal test: classification (`440dd23c`), the name suggestion (`031cb065`), `POST /api/crawl` (`cdea0b41`), the technical audit, entity home, content structure, llms.txt refresh, agent readiness, llms.txt generate and coverage (through the crawler's own tests, `tests/unit/fetch-callers/crawler.test.ts`).

**Parity:** every migrated caller's output on recorded public sites is byte for byte its output before the move (the golden files in `tests/unit/fetch-callers/__golden__/`, each written on the code before its caller moved). **Refusal:** each caller's test points it at a local server standing in for an internal address (a redirect, a `Sitemap:` line, an endpoint URL, a reserved range); before the move each one read or sent to it, after it none connects.

**Left out, with the reason:**
- The fixed-host clients in section 4: the host is fixed in code (or comes from operator data), so a customer can't point them anywhere; the guard lists each by file, host and count.
- The browser's requests to the app's own `/api` (client components, `lib/load/fetch-json.ts`, `lib/auth/workspace-errors.ts`): not server code; relative paths.
- DNS-only lookups of visitor IPs (`lib/agent-analytics/verify-crawler-hits.ts`): no HTTP request is made.

**Proposed LLD amendments (8.6.2):**
1. Limits: hard caps for every caller are **60 s and 50 MB**; the LLD's 10 s / 2 MB / 3 redirects / HTML-only are the preset for the new S06+ callers, not limits on existing ones (which keep theirs, as D-SEC1 says).
2. "`http:` upgraded": existing callers keep fetching `http:` links and redirects as they did; `allowHttp: false` is the per-caller option (S06's preset can set it).
3. Refusal codes add `blocked_credentials` (a user name or password in the URL) and `blocked_by_robots` (only with `obeyRobots`).
4. robots.txt (`obeyRobots`, off for every existing caller): the bot's own group, then `*` (lib/robots-txt/evaluate.ts); a 4xx robots.txt allows everything, a 5xx or no answer disallows everything (RFC 9309 2.3.1); cached 10 minutes per origin and user agent.
5. The exchange is Node's `fetch` with an undici 7 dispatcher whose connect lookup is the guard's (dependency `undici` 7.27.2, the version already installed through cheerio), so request headers, decoding and errors are `fetch`'s own and every test that fakes `fetch` keeps working. IP literals are checked before `fetch` on every hop, because Node never calls a lookup for one.
6. Scope: amendment 19's "about eight places" is twelve fetch sites, including the agency logo (F10) and webhooks (F11, F12); webhook endpoints on a port other than 80 or 443 stop receiving.
