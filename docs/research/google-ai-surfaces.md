# Google AI Overviews and AI Mode for Australian suburbs (Phase 0 research)

Checked 8 November 2026. Research only: nothing here is built, and no app code changed.

**Question.** Vunnara asks Gemini through Google's API, which is not the answer people see in Google Search. Can it
measure the two Google Search surfaces people actually see, **AI Overviews** (the AI block on a normal results page) and
**AI Mode** (Google's AI chat results page), for an Australian suburb such as Norwest NSW 2153?

**Short answer.** Yes, through a SERP data provider. DataForSEO is the cheapest of the six checked. It targets
Australian postcodes such as 2153 for both surfaces, and coordinates for AI Overviews. Both surfaces cost **under A$0.05
per audit** at 13 questions in its standard queue.

The open question is not technical. Google's own terms and spam policies say automated queries to Google Search
violate them (section 1.6). None of the providers says it has Google's permission. Most put compliance with the target
site's terms on the customer, and two offer limited legal cover for their own collection. That is decision 1 for Sri.

Search Console can't replace this. Its new Generative AI report is impressions-only and isn't in the API (section 2).

Contents:
1. Provider comparison
2. First-party alternative: Google Search Console
3. Design sketch for Vunnara
4. Live sample (not run: no provider key)
5. Recommendation
6. Decisions for Sri
7. Sources

---

## 1. Provider comparison

Every fact comes from the provider's own docs, pricing, legal or status pages (or Google's, for Google), read on 8 Nov 2026.
Where a provider's own pages disagree with each other, that's noted. "Not documented" means it was looked for and not found.
Sources are listed in section 7, with the provider label in brackets: [DFS], [SERPAPI], [SEARCHAPI], [CLORO], [APIFY],
[OTHER], [GOOGLE].

### 1.1 Summary table

US$ throughout. The Apify actor is `apify/google-search-scraper`, Apify's own. "Other" is Oxylabs Web Scraper API
(1.5).

**Surfaces and answer fields**

| | DataForSEO | SerpApi | SearchApi | cloro | Apify actor | Oxylabs |
|---|---|---|---|---|---|---|
| AI Overviews | `google/organic` Advanced: an `ai_overview` item | `engine=google`, plus a second `google_ai_overview` call with a `page_token` when Google defers it | `engine=google`, plus `google_ai_overview` with a `page_token` when deferred | Google Search endpoint with `include.aioverview` | extracted when shown; an add-on proxy "increases the probability of capturing AI Overviews" | `google_search` source, rendered |
| AI Mode | `google/ai_mode` | `engine=google_ai_mode` | `engine=google_ai_mode` | separate endpoint | `aiModeSearch.enableAiMode` | `google_ai_mode` source |
| One call for both? | No | No | No | No | **Yes**: one run, one record | No |
| Full answer text | `markdown` per block, `text` per element | `text_blocks`; AI Mode adds `reconstructed_markdown` | `text_blocks`, `markdown` | `text`, optional `markdown` | `content` lines; AI Mode `text` | `answer_text` fragments; AI Mode `response_text` |
| Cited links | `references`: `source`, `domain`, `url`, `title`, `text` | `references`: `title`, `link`, `snippet`, `source`, `index` (no domain) | `reference_links`: `index`, `title`, `link`, `snippet`, `source` | `sources`: `url`, `label`, `description`, `position`; domain only in "citation pills" | `sources`: `url`, `title`, `description` (AI Mode adds `id`, `section`) | references: `source`, `url`; source panel: `url`, `source`, `title`, `pos`; AI Mode: `links` (`url`, `text`) and `citations` |
| Order preserved | Not documented below the block | `index` on each reference | `index` on each reference | `position` (1-indexed); AI Mode places in Google's order | Not documented | `pos` in the source panel; AI Mode not documented |
| "No AI Overview shown" | No flag: `ai_overview` missing from `items` and `item_types` | Docs: not documented (blog: key absent); `error` when it couldn't be generated | Not documented; `error` when it failed | A 200 with no `aioverview` key, and "the AI Overview add-on is still charged" | Not documented (AI Mode: "Null if not requested or unavailable") | Not documented |

**Location targeting**

| | DataForSEO | SerpApi | SearchApi | cloro | Apify actor | Oxylabs |
|---|---|---|---|---|---|---|
| Australia | Google's targeting list: 5,798 Australian rows, including 2,540 postcodes. **2153 NSW** and **Quakers Hill** present; "Norwest" absent | 4,148 Australian locations, including 2,540 postcodes. **2153** and **Quakers Hill** present; "Norwest" absent | Locations API needs a key (not tested) | Google location names; **no postcodes, no coordinates**; unknown names "fall back … typically country level" silently; country list needs a key | `countryCode` "au", and `locationUule` (Google Search only); no suburb targeting documented | Location names, Google criteria IDs, coordinates; unknown values succeed "with no location applied"; AI Mode "available in most countries worldwide" apart from 7 (not Australia) |
| Coordinates | AI Overviews: `latitude,longitude,radius`. AI Mode: `latitude,longitude,zoom` (one AI Mode page says radius) | AI Overviews: `lat`, `lon`, `radius` (metres). AI Mode: a coordinate `uule` only | AI Overviews: `latitude`/`longitude`. AI Mode: none documented | No | No (UULE only) | Google Search: `lat`, `lng`, `rad` (metres). AI Mode: not stated |
| google.com.au, device | `se_domain` (AI Overviews only); `device` desktop/mobile, `os` | `google_domain`; `device` desktop/tablet/mobile (AI Mode: device, no domain) | `google_domain` deprecated (use `gl`); `device` on Google only | No domain field; `device` desktop/mobile/iOS/Android | Always google.com with `gl`; `mobileResults` | `domain` removed (use location); device on AI Overviews only |

**Cost and limits**

| | DataForSEO | SerpApi | SearchApi | cloro | Apify actor | Oxylabs |
|---|---|---|---|---|---|---|
| Price per query | AI Overviews: 0.0006 standard / 0.0012 priority / 0.002 live, plus the same again when an async overview loads (refunded if none). AI Mode: 0.0012 / 0.0024 / 0.004 | Plan credits: $25 per 1,000 (Starter) to $10 per 1,000 (Production, $150/month). A deferred overview is a second credit (blog) | $4 per 1,000 (Developer, $40/month) to ~$2.86 per 1,000 (Production, $100/month) | AI Overviews 5 credits, AI Mode 4 (+2 synchronous). At Lite ($0.80 per 1,000 credits): $0.004 and $0.0032 | Pay per event, Starter plan: page $0.0025 + overview $0.002 + AI Mode $0.005 = **$0.0095 for both**. Free plan: AI Mode $0.20 | AI Mode $1.50 per 1,000; Google with rendering $1.35 per 1,000: ~$0.0015 and ~$0.00135 |
| Minimum | $50 top-up, pay as you go; $1 trial credit | Monthly plan; free 250 a month | Monthly plan; 100 free requests | Lite $30/month; credits expire; "We do not offer refunds" | $5 free credit; Starter plan $19/month | $5 welcome credit; Starter $15/month; non-refundable |
| Latency | Standard ~5 min average (target 45); priority ~1 min; live ~6 s | AI Mode 8.3 s, AI Overview API 7.8 s (30-day averages) | "Sub-2 second average" (not per engine); 90 s timeout | "30–60 seconds end-to-end" | Not documented | Not documented |
| Failures billed? | Conflicting: errors 40101/40102 billable; partial pages refunded; the FAQ says results only | No: "Only successful searches are counted"; valid empty results count | No: only "successful searches with a 200 status code" | Only results, except the overview add-on when none is shown | Events are charged when "successfully" scraped; the README says the page event is "always charged" | Faulted jobs and 5xx/6xx not charged; 2xx/4xx counted |

**Reliability, legal cover and residency**

| | DataForSEO | SerpApi | SearchApi | cloro | Apify actor | Oxylabs |
|---|---|---|---|---|---|---|
| SLA | None in the terms (marketing: 99.95%) | 99.95% with credits (§21). Measured: AI Mode 99.2%, AI Overview API 99.99% | 99.9% with credits | 99.9%, excluding the target's changes; credits only | None ("Platform availability is not guaranteed"). 30 days: 98.0% succeeded, 1.8% timed out | None ("reasonable efforts") |
| Legal cover | None; the customer indemnifies (ToS 7.2) | "U.S. Legal Shield" to US$2M, Production and up, U.S. law only | "Legal Protection Guarantee" to US$2M, Production and up, worldwide where permissible | None; customer must not breach the target's terms or robots.txt (§7.5) | None; the customer is responsible and indemnifies | None; must not breach "relevant terms of use/service" (AUP) |
| Processing location | Not documented. Estonia company, Ukraine team; processors in the US and Germany | US (Austin, TX); AWS. GDPR "In Progress" | US only (DPA §6.1); AWS. SOC 2 Type II | Not documented. Malta address, Irish law; transfers to the US | "Primarily in the European Union and the United States"; Czech company | Not documented. Lithuania; providers in the EEA and US |

### 1.2 DataForSEO [DFS]

**Surfaces.** AI Overviews and AI Mode are separate endpoints. "The Google Organic Live Advanced endpoint returns an ai_overview
item whenever Google shows one on a SERP … The Google AI Mode Live Advanced endpoint returns content in the same format"
[DFS HC-PARSE].
- AI Overviews: `POST /v3/serp/google/organic/task_post` (standard), then `tasks_ready` and `task_get/advanced/$id`;
  or `/organic/live/advanced`.
- AI Mode: `/v3/serp/google/ai_mode/task_post` or `/ai_mode/live/advanced`.
- The Regular function lists an overview but doesn't return it [DFS D-ORG-REG].
- Asynchronous overviews need `load_async_ai_overview: true`. Without it, "you will only obtain ai_overview items from
  cache" [DFS D-ORG-POST].

**Fields.**
- `ai_overview` carries `markdown` ("the text of the ai_overview formatted in the markdown markup language"), elements
  with `text`, and `references`. Each reference has "source", "domain" ("domain name of the reference"), "url",
  "title" and "text" [DFS D-ORG-LIVE, D-AIM-LIVE].
- The block's own position is given (`rank_group`, `rank_absolute`). References and elements carry no index; whether
  array order matches the page is not documented.
- No local-business element exists in either AI schema. Local businesses in normal results come as a separate
  `local_pack` item.

**No overview shown.**
- There is no explicit flag. The `ai_overview` item is absent; it's included in `item_types` "whenever we detect it in
  the search results" [DFS UPD-AIO].
- With async loading off and an async overview detected, the API returns `"ai_overview": null` [DFS HC-AIO].
- An AI Mode query with no answer is not documented.

**Location.**
- `location_code`, `location_name`, or `location_coordinate` in "latitude,longitude,radius" format for AI Overviews.
  The radius is between 199 and 199999, and its unit is printed "(mm)" [DFS D-ORG-POST].
- "We use Google Geographical Targeting for defining locations … Besides, we provide SERP results data based on GPS
  coordinates" [DFS FAQ].
- The free locations list (CSV updated 2026-11-02) has these rows:
  - `9071744,"2153,New South Wales,Australia",…,"Postal Code"`;
  - `9190591,"Quakers Hill,New South Wales,Australia",…,City`;
  - Quakers Hill's postcode `2763`;
  - "Norwest" itself has no row. Bella Vista, Baulkham Hills and Castle Hill do [DFS D-LOC, CSV].
- AI Mode uses the same list (with "check Google Search Help for the list of countries where AI Mode is currently
  available"). Its coordinates are "latitude,longitude,zoom", 4z to 18z [DFS D-AIM-LIVE].
- `se_domain` (e.g. google.com.au) is on AI Overviews only. `device` (desktop/mobile) and `os` are on both.
- Whether AI Mode serves Australia is not documented by DataForSEO. Its 2025 posts said "only in the US, UK, and
  India" and "only in English" [DFS BLOG-AIM, HC-AIM]; its current language list has about 40 languages
  [DFS D-AIM-LANG]. **The live sample (section 4) is the way to confirm Australia.**

**Cost** (US$ per question; "The location, language, and device you request do not affect the price" [DFS P-ORG]):

| | Standard | Priority | Live |
|---|---|---|---|
| AI Overviews (10 results) | 0.0006 | 0.0012 | 0.002 |
| + async AI Overview (refunded when none) | +0.0006 | +0.0006 (docs) or +0.0012 (pricing page) | +0.002 |
| AI Mode | 0.0012 | 0.0024 | 0.004 |

- "$50 minimum top-up", with a $1 trial credit [DFS P-ROOT].
- Standard is "charged only for setting a task". Live is "charged for each request". Results stay fetchable "within the
  next 30 days for free".
- Rate limits: "up to 10000 API calls per minute" with ≤100 tasks per POST (the FAQ still says 2,000), and 30
  simultaneous requests [DFS D-AIM-POST, D-ERR].
- Turnaround:
  - standard "~5 minutes on average", "Target: 45 minutes" (one help page says "guaranteed");
  - priority "Up to 1 minute";
  - live "Up to 6 seconds on average", with a 120-second live timeout [DFS P-AIM, HC-COST, D-ERR].
- Delivery: tasks_ready polling, or a pingback or postback to Vunnara's own URL.

**Reliability.**
- The terms have no SLA: "DataForSEO cannot be held liable for system down time" (ToS 8.1). Marketing pages say 99.95%
  (one says 99.99%).
- No success rates are published for AI Overviews or AI Mode.
- The status page shows a SERP API partial outage on 8 Oct 2026, lasting 19,140 s.
- Billing of failures conflicts across DataForSEO's own pages:
  - 40101 (search engine error after retries) and 40102 (no results) are "billable because processing resources have
    already been used" [DFS HC-40101, HC-40102];
  - 40106 partial results: "You have not been charged for the pages that were not returned";
  - the older FAQ: "We charge your balance only when you get a result".

**Terms (quoted, not advice).**
- On collection: "DataForSEO collects only publicly available data … Collecting unauthenticated public data in this
  manner is lawful under applicable law" [DFS HC-LEGAL #5]. Also: "user preferences, search history, and other
  personalized search factors are ignored by our system" [DFS D-AIM-OVR].
- Use: "any search engine results page (SERP) data … shall not be used to compete with or adversely affect the
  business interests of the search engine providers from which such data originates" (ToS 7.1) [DFS TOS].
- Showing results to customers: "The Terms do not restrict processing API outputs into analytics, reports, dashboards or
  scores inside the client's own product, or showing those to the client's own paying users … The limit that applies
  is Section 7.1" [DFS HC-LEGAL #6].
- No resale of raw data: "any onward distribution of our datasets as an untransformed standalone feed, database dump,
  public endpoint, or raw API service requires a separate written agreement" [DFS HC-LEGAL #3].
- Google's terms are the customer's: "The client is responsible for ensuring compliance with the applicable terms and
  conditions of Google … Our Terms of Service do not grant any licenses from … any upstream provider"
  [DFS HC-LEGAL #5]. Also: "You agree to indemnify, defend, and hold harmless DataForSEO from any and all claims …
  including any use of SERP data that violates the terms of service or legal rights of the search engine providers"
  (ToS 7.2).

**Data residency.**
- Company: "DataForSEO OÜ, company No. 14502291, Tallinn, Estonia"; "DataForSEO is based in Ukraine" [DFS HC-LEGAL #17,
  ABOUT].
- Processing location: not documented. The processors listed are Google, AWS and Azure (United States) and Hetzner
  (Germany), "Data center operator" [DFS PRIV 7.b].
- A DPA with EU SCCs is incorporated when GDPR applies.
- Retention: "API output will be retained for 31 days for SERP … client tasks, results, payload will be retained for 12
  months"; "We do not offer zero data retention" [DFS DPA, HC-LEGAL #15].

### 1.3 SerpApi [SERPAPI] and SearchApi [SEARCHAPI]

Both work the same way: the normal Google results call includes an `ai_overview` block. When Google loads the overview
separately, they return a short-lived `page_token` for a second call to a `google_ai_overview` engine. SerpApi says it
expires "within 1 minute"; two SerpApi blog posts say about 4 minutes. A separate `google_ai_mode` engine covers AI Mode.

**SerpApi.**
- "Currently, the AI Overview block is only seen for English searches (hl=en) with a limited range of countries (gl)"
  [SERPAPI ai-overview].
- References have `index`, `title`, `link`, `snippet` and `source` (a publisher name, no domain field). AI Mode adds
  `reconstructed_markdown`.
- Location: `location` uses canonical names from a free list. 2153 NSW and Quakers Hill are present, "Norwest" is
  absent. `lat`/`lon`/`radius` (metres) work on normal results only. AI Mode takes `location`, `uule`, `gl`, `hl` and
  `device`, but no coordinates or domain.
- Cost:
  - "Only successful searches are counted … Cached, errored, and failed searches are not". Empty but valid results
    still count.
  - Plans: Starter $25/1,000 searches; Developer $75/5,000; Production $150/15,000 ($10 per 1,000).
  - The extra `page_token` call is undocumented in the docs; the blog says "it uses another one search credit".
- Throughput is 20% of the plan's monthly volume per hour.
- SLA: "99.95% SLA guarantee with all plans … credits up to 100% of the monthly price" (§21).
- Measured over 30 days: AI Mode 99.2% success, AI Overview API 99.99%, Google Search 94.3%. On 8 Nov the status page
  showed AI Mode, AI Overview and Google as "Degraded Performance".
- Terms:
  - "You agree not to reproduce, duplicate, copy, sell, resell or exploit any portion of the Service … without express
    written permission" (§2).
  - **U.S. Legal Shield** (§13, Production plan and up): "SerpApi will assume the liabilities of scraping and parsing
    search engine results … with up to $2 million in coverage … SerpApi assumes liability for the lawful collection of
    public search data … but not for how that data is ultimately used … limited to claims brought under U.S. state or
    federal law in a U.S. court".
  - Showing results to end customers is not addressed.
- Residency:
  - "SerpApi, LLC … Austin, TX … United States"; AWS; search data retained 31 days.
  - DPA on request. GDPR listed as "In Progress"; SOC 2 Type II and ISO 27001 "Acquired".

**SearchApi.**
- References have `index`, `title`, `link`, `snippet` and `source`. Overview links are Google redirects unless you pass
  `link=resolved`.
- Normal results take `latitude`/`longitude`. `google_domain` is "Deprecated" ("Google began phasing out country code
  top-level domains"; use `gl`).
- AI Mode takes `location`, `uule`, `gl` and `hl` only. Its changelog notes that on 6 Oct 2026 "Answers now follow
  location and uule, which Google had been ignoring".
- The locations API needs a key, so Australian suburbs weren't checked.
- Cost:
  - "Only successful searches with a 200 status code incur charges".
  - Plans: Developer $40/10,000 ($4 per 1,000); Production $100/35,000 (~$2.86 per 1,000).
  - 100 free requests. 20% of plan credits per hour.
- SLA 99.9% with credits; no per-engine success rates.
- Terms:
  - No resale or redistribution "without prior written consent".
  - The **Legal Protection Guarantee** (Production and up) "accepts legal responsibility … for third-party claims under
    U.S. law and jurisdiction that arise solely from SearchApi's own collection and parsing of publicly available
    search results", capped at US$2M a year.
  - It "does not apply to any claim arising from your use, storage, redistribution, or commercialization of data", and
    "applies to customers worldwide … in any jurisdiction where doing so is legally permissible".
- Residency: "SearchApi, LLC is a US company and all data infrastructure are located in the US"; "Processing Location.
  SearchApi's Services are operated from the United States" (DPA §6.1). SOC 2 Type II.

### 1.4 cloro [CLORO] and an Apify actor [APIFY]

**cloro** (cloro.dev, Cloro Incorporation Ltd). It's an API for monitoring AI answers across ChatGPT, Gemini,
Perplexity, Google AI Overviews and AI Mode, and others.
- AI Overviews come "returned by the Google Search endpoint when you set `include.aioverview`". AI Mode is a separate
  endpoint.
- Sources carry a 1-indexed `position`. AI Mode's places appear "in the order Google AI Mode ranks them".
- It's the only provider that documents the not-shown case: "When Google shows no AI Overview … the response is a 200
  with no `aioverview` key … That case is not retried, and the AI Overview add-on is still charged".
- Location is country plus a Google location name or UULE. Its own list of what's "not supported" includes:
  "Zip/postal code targeting" and "Latitude/longitude coordinates". "`location` is not validated against Google's
  geotargets list … Google falls back to broader targeting — typically country level. You get a `200` with
  country-level results, not an error".
- Cost: "AI Overview (incl. SERP) 5 credits", "AI Mode 4 credits", with a +2 surcharge for synchronous calls. The Lite
  plan is $30 a month for 37,500 credits ($0.80 per 1,000). "There is no pay-as-you-go"; credits expire monthly;
  "We do not offer refunds".
- Latency "30–60 seconds end-to-end". The terms target 99.9% availability, excluding "target platform unavailability
  or changes".
- Terms:
  - §2.3: no resale.
  - §7.5: "You shall ensure that your use of the Services for automated data gathering activities (a) does not violate
    … the applicable terms of service, robots.txt directives, or other access restrictions of the target website or
    platform, … except to the extent that Applicable Laws expressly permit you to do so notwithstanding such
    restrictions". A breach of section 7 is "a material breach".
- Malta address, Irish law; personal data transferred to the US. Server locations not documented.

**Apify: "Google Search Results Scraper"** (`apify/google-search-scraper`, developed by Apify; "229,636 total users,
27,483 monthly users"; changelog updated 2026-11-02). It was chosen over `apify/google-ai-mode-scraper` (AI Mode only,
394 users) and a third-party actor with 3 users.
- **One run returns both surfaces**: "AI Overviews are extracted automatically when they appear", and AI Mode comes
  back in `aiModeResult` in the same record.
- Overview sources have `url`, `title` and `description`, with no position or domain. "No AI Overview" isn't
  documented; AI Mode is "Null if not requested or unavailable".
- Location:
  - country (`countryCode`, "au" listed) and `locationUule` "for the exact location", which only applies to Google
    Search;
  - no coordinates or postcodes;
  - "Keyword searches use `google.com` with the country in the `gl` parameter".
- Pay per event (from 7 Oct 2026). On the Starter plan ($19 a month): a results page $0.0025, an AI Overview $0.002,
  AI Mode $0.005, so **$0.0095 per question for both**. On the Free plan AI Mode alone is $0.20.
- No SLA: "Platform availability is not guaranteed". Its 30-day run record: 9,079,635 succeeded, 169,014 timed out.
- Terms:
  - output is "Customer Data", and "You are solely responsible for the legality … and use of all Customer Data";
  - no resale of platform features;
  - the README says to "factor in Google's Terms of Use … consult your lawyers".
- Apify is a Czech company; data is processed "primarily in the European Union and the United States".

### 1.5 One more provider with both surfaces: Oxylabs Web Scraper API [OTHER]

- AI Overviews come from the `google_search` source, rendered: "receive both the general response and AI Overviews
  content with a single request". AI Mode is a separate `google_ai_mode` source.
- AI Overview fields:
  - text fragments with references (`source`, `url`);
  - a source panel with `pos`;
  - `pos_overall` for the block's place on the page.
- AI Mode returns `response_text`, `links` and `citations`, with no positions.
- Location (`geo_location`): Google location names, "numeric ID from Google's geotargets list", and coordinates
  "`lat: <lat>, lng: <lng>, rad: <metres>`". Postcodes aren't documented, but a postcode's criteria ID may serve.
  "A misspelled or unrecognised `geo_location` value is not rejected: the request succeeds with no location applied."
- AI Mode availability: "Google AI Mode is available in most countries worldwide apart from these exceptions: France,
  Turkey, China, Iran, North Korea, Syria, Cuba". That's Oxylabs' statement, not Google's.
- Cost: AI Mode "$1.50/1K res." and Google with rendering "$1.35/1K res." at the lowest tier (~$0.0015 and
  ~$0.00135). Plans from $15 a month; a $5 welcome credit; "non-refundable".
- "You are not charged for any `faulted` jobs"; 2xx and 4xx responses count as successful.
- No uptime figure: "reasonable efforts". Lithuanian law. Processing location not documented.
- Acceptable use: the customer must not use the services "in violation of relevant terms of use/service or other legal
  documents".

### 1.6 Google's own terms on automated queries [GOOGLE]

Quoted only, not legal advice:
- Google Terms of Service (effective 30 Jul 2026), "Don't abuse our services": "using automated means to access
  content from any of our services in violation of the machine-readable instructions on our web pages (for example,
  robots.txt files that disallow crawling, training, or other activities)" [GOOGLE terms].
- The same terms on suspension: "we reasonably believe that your conduct causes harm or liability to a user, third
  party, or Google — for example, by … scraping content that doesn't belong to you" [GOOGLE terms].
- `https://www.google.com/robots.txt`, for `User-agent: *`: `Disallow: /search` (with `Allow: /search/about` and a
  few other exceptions) [GOOGLE robots].
- Search spam policies (updated 2026-08-28): "Machine-generated traffic (also called automated traffic) refers to the
  practice of sending automated queries to Google. This includes scraping results for rank-checking purposes or other
  types of automated access to Google Search conducted without express permission. … Such activities violate our spam
  policies and the Google Terms of Service" [GOOGLE spam].
- Google Search Help, "What Google considers automated traffic": "Use of software that sends searches to Google to
  find how a website or web page ranks on Google" [GOOGLE 86640].

Every provider here collects Google's results by automated means on its customers' behalf. Not one says it has
Google's permission. On Google's terms they say different things:
- **Compliance is the customer's:**
  - DataForSEO;
  - Apify ("You are solely responsible for the legality … and use of all Customer Data"; its README says to "factor
    in Google's Terms of Use").
- **The customer must not breach the target's terms at all:**
  - cloro (§7.5: "terms of service, robots.txt directives, or other access restrictions of the target website", a
    material breach);
  - Oxylabs (its acceptable-use policy).
  For Google Search, whose robots.txt disallows `/search`, that's hard to reconcile with using them for this.
- **Say nothing about Google's terms:** SerpApi and SearchApi. Instead they offer limited legal cover for their own
  collection, not for the customer's use.

This is decision 1 (section 6).

---

## 2. First-party alternative: Google Search Console [GOOGLE]

**The Generative AI performance report (Search).**
- Search Central blog, 3 June 2026; "As of August 31, 2026, we've rolled out these insights to all websites
  worldwide" [GOOGLE 16984139, blog 2026/06].
- It "includes impressions for the following generative AI capabilities on Google Search: AI Overviews / AI Mode", and
  "Impressions are how many times links to your site were shown to a user in a generative AI feature on Google
  Search".
- Dimensions: pages, countries, dates and devices.
- Clicks, positions, queries, and any split between AI Overviews and AI Mode are **not documented**: impressions only,
  both surfaces together.
- The normal Performance report also counts AI traffic inside "Web": AI Mode since 16 June 2025, AI Overviews clarified
  15 Aug 2024. "An AI Overview occupies a single position in search results, and all links in the AI Overview are
  assigned that same position" [GOOGLE 7042828].

**Not in the API.** The Search Console API's `searchanalytics.query`:
- `type` is web, image, video, news, discover or googleNews;
- `dimensions` are date, hour, query, page, country, device and searchAppearance;
- no `searchAppearance` value relates to AI;
- the API's own machine-readable definition (revision 20261107) has no "generative" or "overview" anywhere.

AI traffic sits inside `type=web` totals and can't be separated [GOOGLE searchanalytics/query, 17011259].

**What "Connect Google Search Console" would need.**
- Scope `https://www.googleapis.com/auth/webmasters.readonly` ("Read-only access"), OAuth 2.0 only.
- The scope is not on Google's restricted list. Whether it counts as "sensitive" isn't published: the Cloud Console
  shows it when the scope is added.
- Verification:
  - brand verification takes "2-3 business days";
  - sensitive-scope review, if it applies, "up to 10 days", with a justification and an unlisted YouTube demo video;
  - Vunnara's own domain must be verified in Search Console by a project owner [GOOGLE cloud 13463817,
    brand-verification].
- Before verification: "up to 100 test users", whose authorisations "expire seven days from the time of consent", and
  a 100-user lifetime cap for an unverified production app [GOOGLE cloud 15549945, 7454865].
- Per client: whoever connects needs "read permissions" on the property (owner, full user or restricted user)
  [GOOGLE webmaster-tools prereqs, 7687615].

**Verdict.** Not worth building now for AI measurement. The only AI-specific data, impressions by page, isn't
reachable through the API, and the API's web totals don't separate AI Overviews or AI Mode. It's worth revisiting when
Google adds the Generative AI report to the API. Until then a client can open the report in Search Console themselves,
and Vunnara can link to it.

---

## 3. Design sketch for Vunnara (no code)

### 3.1 Engine model

**How an engine works today:**
- It's a value of `Engine`: chatgpt, claude, gemini or perplexity (`lib/llm/interface.ts:1`).
- An `LLMService.complete()` implementation answers it (`lib/llm/*-impl.ts`).
- `TIER_ENGINES` picks the engines for each plan (`lib/llm/tier-engines.ts:3`).
- Each answer is stored as one row per audit, engine and question in `citations`, where `engine` is free text
  (`db/schema/citations.ts:22`).

Google's two surfaces aren't calls Vunnara makes to a model. They're Google results fetched through a SERP provider.
They fit the same pipeline at both ends with a different client in the middle:

| Piece | LLM engines today | Google AI Overviews / AI Mode |
|---|---|---|
| Engine id | `Engine` union | `google_ai_overview` and `google_ai_mode`, as a separate `GoogleSurface` type, so every `Record<Engine, …>` stays exhaustive and nothing assumes the four model engines; display names "Google AI Overviews" and "Google AI Mode" |
| Client | `complete()` returns `CompleteOutput` | one `lib/serp/<provider>.ts` client: `fetchGoogleSurface({ surface, question, location, device, language, domain, queue })` returns the same `CompleteOutput` shape (`response` = the answer's text, `citedUrls` = its references as `AnswerSource`s with their real `domain`, in order), plus `shown: boolean` and the request's location, device, domain and date |
| Which plans | `TIER_ENGINES` | its own `GOOGLE_SURFACES_BY_TIER` (3.6), so the pricing page's "4 AI engines" doesn't change by accident |
| Answer rows | `citations` | the same table when an answer was shown. Mention detection, verification, position, sentiment, directory evidence and the evidence page then work unchanged. The old `google_ai_mode_results` table (`db/schema/google-ai-mode-results.ts`, a "GAP 5 stretch" design that nothing writes) is left unused, so there's one answer table |
| No overview shown | (doesn't happen) | a row with a new nullable `citations.surface_shown = false` and no answer text: not an answer, not a failure (3.2) |
| Failures | `engine_call_failures` (one row per failed engine and question, with `cost_usd` and `cost_source`) | the same table and `engine` values. The reason holds the provider's own code (DataForSEO's `status_code`). A failure the provider doesn't bill has `cost_usd = 0` |
| Cost | per answer: `citations.llm_cost_usd` and `llm_cost_source` (`provider_reported` or `price_table`); per audit: `audit_cost_snapshots`; the daily cap (`lib/platform/budget-policy.service.ts`) | each task's charge as the provider reports it (DataForSEO returns a `cost` per task) as `provider_reported`, else the provider's published price in `lib/audit/compute-cost.ts` as `price_table`. Counted in `audit_cost_snapshots` and the daily cap like any call. A refunded async-overview surcharge is a later credit, reconciled from the provider's figure, never guessed |
| Mention verification | `lib/audit/verify-mention.ts`: a name match is verified by a cited URL on the brand's own domain, or by the brand's confirmed suburb or city within 300 characters | unchanged. The references are cited sources and the answer text is the response, so `verified_domain` should be common on Google answers |
| Directory evidence | `lib/directories/citation-counts.ts:297` `getCitedDirectoryNames` matches cited domains against `lib/directories/registry.ts` (hipages, Oneflare, Airtasker, Yellow Pages, Localsearch, Word of Mouth, ServiceSeeking, True Local and others) | unchanged, as long as each reference keeps its domain. DataForSEO gives `domain`; SerpApi and SearchApi give only `link`, so the domain comes from the URL. SearchApi needs `link=resolved` for AI Overviews, because its links are Google redirects |
| Cache | `lib/llm/cache.ts`, keyed by prompt and model | not used for audits: a Google result is a dated observation of one place, not a reusable answer |
| Data residency page | `lib/governance/residency-config.ts` lists each processor and region | one more entry: the provider, where it processes (section 1), and its retention |

**Timing.** In DataForSEO's standard queue a result takes "~5 minutes on average" with a 45-minute target.
- The Google step should post its tasks when the audit starts and collect them as a separate step, by pingback to a
  Vunnara webhook or by polling `tasks_ready`.
- The audit page shows Google as "Checking Google…" until the results arrive, and as "Google couldn't be checked" if
  they miss a deadline. They never hold up the four model engines.
- An owner-started audit or a demo can use priority (~1 minute) or live (~6 s) instead, a setting in 3.5.

### 3.2 Honest counting

A question where Google showed no AI Overview is not a failure (nothing went wrong). It's not "not mentioned" either:
there was no answer to be mentioned in. It's a third state, and the page says so:

> **Google AI Overviews** · Norwest NSW 2153 · desktop · google.com.au · 8 Nov 2026, 10:42
> AI Overview shown for 6 of 13 questions · you were mentioned in 2 of those 6

- A question whose request failed is listed like any engine failure ("1 question couldn't be checked"). It's in
  neither count.
- AI Mode answers every question it accepts. Its line reads "you were mentioned in 4 of 13 AI Mode answers", and an
  empty answer is handled like a not-shown overview.
- A branded question ("Is Omega Services reputable?") is handled as it is for the other engines. It's listed with the
  rest, and `is_branded_prompt` / `ORGANIC_ONLY` keep it out of any count that feeds the headline.

**The headline.** The audit's Visibility % (`lib/scoring/resolve-audit-dimensions.ts`) is verified mentions over
successful organic answers, per engine.
- **Recommendation: keep Google out of the headline at first.** Show it as its own block beside the engine table, with
  its own counts and label (3.3). Three reasons:
  - its denominator moves with Google's choice to show an overview (6 of 13 this week, 9 next), not with the brand;
  - Google results vary run to run and by place and person (3.7);
  - folding it in changes every audit's headline the day it ships, so `methodology_version` would have to mark it and
    every trend would have to split on it.
- After a few weeks of runs, if the counts are steady, Sri can add it to the headline as a methodology change. It
  would count only the questions where an overview was shown ("mentioned in 2 of the 6 overviews shown"), never the 7
  without one.
- Either way, "counts in the headline" is a setting (3.5). Each audit stores the value it ran with, so a past
  audit's headline never moves when the setting does.

### 3.3 Labelling

Every Google result stores, and every place that shows it prints:
- the **location** sent: "Norwest NSW 2153" for the postcode location, or "-33.73, 150.96 (within 2 km)" when
  coordinates were used, with the provider's own location id;
- the **device** (desktop or mobile), the **Google domain** (google.com.au) and the **language** (English);
- the **date and time** fetched (Sydney time) and the **provider**.

These live on the answer row (a JSON `surface_context` column), written once and never recomputed.

### 3.4 Cost per audit (13 questions)

US$, from section 1 prices; A$ at the app's own rate, US$0.65 = A$1 (`lib/constants/currency.ts:13`).

**DataForSEO.** Ranges cover the async-overview surcharge, which is refunded when there's no async overview.

| Per audit | Standard | Priority | Live |
|---|---|---|---|
| AI Overviews | $0.008–0.016 | $0.016–0.031 | $0.026–0.052 |
| AI Mode | $0.016 | $0.031 | $0.052 |
| **Both** | **$0.023–0.031 (A$0.04–0.05)** | $0.047–0.062 (A$0.07–0.10) | $0.078–0.104 (A$0.12–0.16) |

**The others,** both surfaces per audit, at their entry paid plans:

| Provider | Per audit (13 questions) | Monthly minimum |
|---|---|---|
| SerpApi Production ($10 per 1,000; a deferred overview is a second search) | $0.26–0.39 (A$0.40–0.60) | $150 |
| SearchApi Production (~$2.86 per 1,000; same second search) | $0.07–0.11 (A$0.11–0.17) | $100 |
| cloro Lite (asynchronous) | $0.09 (A$0.14) | $30 |
| Apify actor, Starter plan (both in one run) | $0.12 (A$0.19) | $19 |
| Oxylabs (lowest tier) | ~$0.04 (A$0.06) | $15 |

**A month at the plans' full schedules.** From `lib/pricing/tiers.ts`: brands × audit frequency × 26 queries,
DataForSEO standard, worst case.

| Plan | Audits a month | Google queries | US$ per month | A$ per month |
|---|---|---|---|---|
| Growth (1 brand, 3×/week) | ~13 | ~340 | ~$0.41 | ~A$0.62 |
| Agency (5 brands, daily) | ~150 | ~3,900 | ~$4.68 | ~A$7.20 |
| Agency Pro (25 brands, 2×/day) | ~1,500 | ~39,000 | ~$46.80 | ~A$72 |

A single Agency Pro workspace at full use would need SerpApi's Big Data plan ($275/month for 30,000) or more.

### 3.5 On/off configuration (Sri, 1 Nov)

| Setting | Where | Why |
|---|---|---|
| Global kill switch `GOOGLE_AI_SURFACES_ENABLED` (default off) | env var | read when each audit starts; it must work even when the database or an admin page is the problem. Same pattern as `QUERY_SIMULATION_ENABLED` and `LLM_MODE` |
| Provider credentials, e.g. `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | env var | secrets never go in the database |
| Hard cost ceiling per audit, `GOOGLE_AI_SURFACES_MAX_AUD_PER_AUDIT` | env var | bounds the admin ceiling below, so a typo in a setting can't spend more than the deployment allows |
| Per-surface switches: AI Overviews on/off, AI Mode on/off | database: a new admin-only setting (nothing like it exists today; a one-row `platform_settings` table) | Sri flips these during demos without a redeploy. Each audit reads them once and stores them |
| Per-workspace enablement | database: `org_feature_flags`, which already exists with an `expires_at`. `google_ai_mode_enabled` is already a canonical key (`lib/governance/feature-flags.ts:13`); add `google_ai_overviews_enabled` | turns it on for a demo workspace or a pilot client before any plan includes it, and lets a pilot expire on its own |
| Counts in the headline (default off) | database admin setting, stored on each audit | 3.2 |
| Provider settings: queue (standard, priority, live), location method (postcode location or coordinates with radius), device, language, Google domain | database admin setting, with defaults: standard, postcode, desktop, English, google.com.au | tuning without a deploy; each result stores what it used (3.3) |
| Cost ceiling per audit (A$) | database admin setting, at most the env ceiling | when it's reached, the run stops fetching Google results and says so: "Google checked for 9 of 13 questions: cost limit reached" |

One audit resolves them in order: env kill switch → surface switch → plan (3.6) or workspace flag → ceiling.

There's no admin page today. Until there is one, the database settings are changed by a reviewed SQL file, as the
prod-fixes are. Alternatively, a small settings page can open only to Sri's account.

### 3.6 Tiering

Cost isn't the limit at DataForSEO's standard prices: under A$75 a month for the busiest Agency Pro workspace,
against a A$1,499 plan.

**Recommendation:**
- **Before launch:** per-workspace flags only, for demos and pilots.
- **At launch: Growth and up get both surfaces.** That matches the other Growth brand features (Trust, Retrieval,
  Workflow).
- **Free and Starter don't.**

When it ships, the pricing line "4 AI engines" and the comparison table need the Google surfaces in
`lib/pricing/tiers.ts` (one place, per the 8 Nov pricing-claims change). Separately, the landing page already says
"Coming soon: Microsoft Copilot, Google AI Overviews (Q3 2026)" (`components/domain/landing/engines-supported.tsx:28`).
Q3 2026 has passed, so that line is now untrue whatever is decided here.

### 3.7 Risks

- **Volatility.** Google decides per query and per run whether to show an AI Overview, and what it says. One sample per
  question per audit is a snapshot.
  - Show "shown for X of 13", date every result, and don't trend on counts this small.
  - A second sample per question would double the cost, which is still trivial; it's the first lever if counts jump.
- **Personalisation.** Providers fetch without a user: "user preferences, search history, and other personalized
  search factors are ignored" [DFS D-AIM-OVR]. A real person's results can differ. The label says it's the logged-out
  view for that location.
- **Location.** "Norwest" isn't one of Google's locations. Postcode 2153 is, and so are coordinates.
  - How Google turns a coordinate or a postcode into results isn't documented by any provider.
  - Each result records exactly what was sent (3.3).
  - Comparing postcode and coordinates for the same questions is a cheap test in the live sample.
- **AI Mode in Australia.** DataForSEO doesn't document it; its 2025 notes said US, UK and India only. Oxylabs' docs
  say AI Mode is "available in most countries worldwide" apart from seven, none of them Australia. Google's own page
  wasn't checked. The live sample must confirm it before AI Mode is offered.
- **Provider outages.** On 8 Oct 2026 DataForSEO's status page showed a 5-hour partial outage. On 8 Nov SerpApi's
  showed AI Mode and AI Overviews as "Degraded Performance". So:
  - Google results are always optional: an audit completes without them and says "Google couldn't be checked";
  - a provider failure is an `engine_call_failures` row like any other.
- **Billing ambiguity.** DataForSEO's own pages disagree on whether empty or failed results are billed, and on the
  priority surcharge. Use the per-task `cost` the provider returns, and check it against the provider's dashboard after
  the first week.
- **Terms.** Google's terms and spam policies prohibit automated queries without permission (1.6). Providers place
  compliance on the customer, or cover only their own collection under U.S. law. This is decision 1.
- **Data residency.** The questions, each naming a kind of business and a suburb (and a few naming the business), go
  to the provider:
  - DataForSEO: Estonia and Ukraine, with processors in the US and Germany; it keeps task data 12 months, with no
    zero-retention option;
  - SerpApi and SearchApi: US.
  - The Data Residency page and the privacy page's list of services must name the provider before the feature ships.

### 3.8 Not covered by this sketch

- **Google's local pack and Maps results.** They're returned separately (`local_pack`) and are a different measurement.
- **Following a question up in AI Mode.** DataForSEO documents no follow-up. SearchApi's AI Mode has a
  `conversation_token`.

---

## 4. Live sample

**Not run.** No provider key exists in `.env.local`, `.env.dev` or `.env.prod`: none of `DATAFORSEO_*`, `SERPAPI_*`,
`SEARCHAPI_*`, `APIFY_*` or `CLORO_*` (names checked, values never read).

What Sri needs for the sample (and for the feature), with DataForSEO:
1. Create an account at dataforseo.com. New accounts get a $1 trial credit, which covers the sample: 13 AI Overview
   questions at up to $0.0012 and 13 AI Mode questions at $0.0012 come to about $0.03 in the standard queue.
2. For real use, top up the minimum US$50 [DFS P-ROOT].
3. Put the API login and password from the DataForSEO dashboard in `.env.local` as `DATAFORSEO_LOGIN` and
   `DATAFORSEO_PASSWORD`. In Vercel, add them only once the feature exists.
4. Then rerun this Phase 0's section 4:
   - Omega Services' 13 current questions;
   - AI Overviews (`google/organic/task_post`, `load_async_ai_overview: true`) and AI Mode (`google/ai_mode/task_post`);
   - location code `9071744` ("2153,New South Wales,Australia"), standard queue;
   - raw responses saved to the scratchpad only.

   For each question, report:
   - whether an overview was shown;
   - the reference count;
   - whether Omega Services or omegaservices.com.au appears;
   - which directories appear;
   - the charged cost, which DataForSEO returns per task.

The same sample would answer the one thing no provider documents: **whether AI Mode answers for an Australian
location today**.

---

## 5. Recommendation

- **Provider: DataForSEO.**
  - It's the only one checked that gives each reference's domain directly.
  - It targets Australian postcodes and coordinates with a radius for AI Overviews.
  - It's pay-as-you-go from a US$50 top-up, with no monthly plan.
  - It's 5–10× cheaper per audit than SerpApi at any volume.
  - It takes up to 100 tasks per request, with webhooks, which suits Inngest.
  - Weak points:
    - no SLA in its terms;
    - its billing pages disagree with each other;
    - no documented processing location;
    - no legal cover; Vunnara indemnifies DataForSEO.
  - If legal cover matters more than price, **SearchApi** is the alternative. Its Legal Protection Guarantee, from the
    Production plan at $100/month, applies worldwide where permissible, for its own collection. It processes in the US
    only and is SOC 2 Type II. It's about 2–3× DataForSEO's cost. Its AI Mode has no device or coordinate parameters.
  - Not recommended:
    - **cloro**: it can't target postcodes or coordinates, which rules out suburbs. It also charges the overview
      add-on when none is shown.
    - **The Apify actor**: country and UULE only, and pricier. Its one convenience is both surfaces in one run.
    - **Oxylabs**: close on price with coordinates and criteria IDs. But its AI Mode targeting is undocumented, it has
      no SLA, and its acceptable-use policy forbids breaching the target's terms.
- **Location method: the postcode location.** Location code 9071744 is "2153,New South Wales,Australia". It's in
  Google's own targeting list and is the same for both surfaces. Coordinates with a radius stay an option for AI
  Overviews, and the live sample should compare the two.
- **Queue: standard for scheduled audits**, at ~5 minutes average, up to 45, and the cheapest. Priority (~1 minute) for
  an owner-started audit or a demo; both are a setting (3.5). Live only when a result is needed within seconds.
- **Headline: out at first** (3.2).
- **Search Console: not now.** The AI report is impressions-only and not in the API (section 2). Revisit when Google
  adds it to the API.
- **Before any build:** Sri decides on the terms (decision 1), then runs the live sample (section 4, about US$0.03) to
  confirm AI Mode answers for Australia and what an overview for Norwest looks like.

---

## 6. Decisions for Sri

1. **Is Sri comfortable with a third party collecting Google results on Vunnara's behalf?**
   - Google's position: its terms prohibit "using automated means to access content from any of our services in
     violation of the machine-readable instructions on our web pages (for example, robots.txt files …)", and
     robots.txt disallows `/search`. Its spam policies say automated queries, "including scraping results for
     rank-checking purposes … without express permission", "violate our spam policies and the Google Terms of
     Service" (1.6).
   - DataForSEO: "The client is responsible for ensuring compliance with the applicable terms and conditions of
     Google", and the client indemnifies DataForSEO (ToS 7.2). Its ToS 7.1 also bars using the data "to compete with
     or adversely affect the business interests of the search engine providers".
   - SerpApi's U.S. Legal Shield and SearchApi's Legal Protection Guarantee cover claims about their collection, under
     U.S. law (SerpApi) or wherever permissible (SearchApi). Neither covers Vunnara's use of the data.
   - cloro (§7.5) and Oxylabs (acceptable-use policy) require the customer not to breach the target site's terms or
     robots.txt. Apify leaves it to the customer and points to Google's Terms of Use.
   - The 1 Nov market research lists BrightLocal, SE Visible, Otterly and Peec as covering AI Overviews and/or AI
     Mode. How they collect it wasn't checked here.
   - Not legal advice. If it matters, ask a lawyer with these quotes.
2. **Should AI Overview results count in the headline Visibility %?** Recommendation: not at first (3.2). Show them as
   their own block, "AI Overview shown for 6 of 13 questions · you were mentioned in 2 of those 6". Reconsider after a
   few weeks of runs, as a methodology change counting only shown overviews.
3. **Which plans get it?** Recommendation: Growth and up, after a pilot behind per-workspace flags (3.6). Free and
   Starter don't. Cost at DataForSEO's standard prices is under A$0.05 per audit.

Also for Sri, outside this research: the landing page's "Coming soon: Microsoft Copilot, Google AI Overviews
(Q3 2026)" is past its date (3.6).

---

## 7. Sources (all read 8 November 2026)

Quotes were taken from each page's own text. Where a provider's pages disagree, both are quoted above.

**[DFS] DataForSEO**
- D-AIM-LIVE https://docs.dataforseo.com/v3/serp-google-ai_mode-live-advanced/
- D-AIM-POST https://docs.dataforseo.com/v3/serp/google/ai_mode/task_post/
- D-AIM-OVR https://docs.dataforseo.com/v3/serp/google/ai_mode/overview/
- D-AIM-LANG https://docs.dataforseo.com/v3/serp/google/ai_mode/languages/
- D-AIM-GET https://docs.dataforseo.com/v3/serp/google/ai_mode/task_get/advanced/
- D-AIM-LIVEHTML https://docs.dataforseo.com/v3/serp/google/ai_mode/live/html/
- D-ORG-LIVE https://docs.dataforseo.com/v3/serp/google/organic/live/advanced/
- D-ORG-POST https://docs.dataforseo.com/v3/serp/google/organic/task_post/
- D-ORG-REG https://docs.dataforseo.com/v3/serp/google/organic/live/regular/
- D-ORG-OVR https://docs.dataforseo.com/v3/serp/google/organic/overview/
- D-LOC https://docs.dataforseo.com/v3/serp/google/locations/
- CSV https://cdn.dataforseo.com/v3/locations/locations_serp_google_2026_11_02.csv
- D-ERR https://docs.dataforseo.com/v3/appendix/errors/
- P-ROOT https://dataforseo.com/pricing
- P-AIM https://dataforseo.com/pricing/google-serp/google-ai-mode-serp-api
- P-ORG https://dataforseo.com/pricing/google-serp/google-organic-serp-api
- HC-PARSE https://dataforseo.com/help-center/parse-google-ai-overviews-ai-mode
- HC-AIO https://dataforseo.com/help-center/how-to-scrape-google-ai-overviews-with-serp-api
- HC-AIM https://dataforseo.com/help-center/what-is-google-ai-mode-and-how-to-retrieve-data-from-it
- HC-COST https://dataforseo.com/help-center/serp-api-cost-explained
- HC-40101 https://dataforseo.com/help-center/what-does-the-40101-error-mean
- HC-40102 https://dataforseo.com/help-center/what-does-the-40102-error-mean
- HC-LEGAL https://dataforseo.com/help-center/quick-answers-to-frequently-asked-legal-questions
- TOS https://dataforseo.com/terms-of-service/
- PRIV https://dataforseo.com/privacy-policy/
- DPA https://dataforseo.com/wp-content/uploads/2026/06/DataForSEO_DPA-12-06-26.pdf
- ABOUT https://dataforseo.com/about-us
- FAQ https://dataforseo.com/faq
- UPD-AIO https://dataforseo.com/update/ai-overview-in-google-serp-api
- BLOG-AIM https://dataforseo.com/blog/beyond-traditional-serp-data-accessing-google-ai-mode-results-with-dataforseo-apis
- STATUS https://status.dataforseo.com/

**[SERPAPI] SerpApi**
- ai-overview https://serpapi.com/ai-overview
- google-ai-overview-api https://serpapi.com/google-ai-overview-api
- google-ai-mode-api https://serpapi.com/google-ai-mode-api
- search-api https://serpapi.com/search-api
- locations https://serpapi.com/locations-api, https://serpapi.com/locations.json
- countries and domains https://serpapi.com/google-countries, https://serpapi.com/google-domains
- pricing and limits https://serpapi.com/pricing, https://serpapi.com/faq, https://serpapi.com/enterprise
- metrics https://serpapi.com/google-ai-mode-api/api-metrics, https://serpapi.com/google-ai-overview-api/api-metrics,
  https://serpapi.com/search-api/api-metrics
- status https://status.serpapi.com/
- errors https://serpapi.com/api-status-and-error-codes
- legal https://serpapi.com/legal, https://serpapi.com/us-legal-shield, https://serpapi.com/security
- blogs https://serpapi.com/blog/scrape-google-ai-overviews/, https://serpapi.com/blog/ai-overview-rank-tracker-using-python/,
  https://serpapi.com/blog/fetching-ai-overviews-with-node-js/

**[SEARCHAPI] SearchApi**
- docs https://www.searchapi.io/docs/google, https://www.searchapi.io/docs/google-ai-overview-api,
  https://www.searchapi.io/docs/google-ai-mode-api, https://www.searchapi.io/docs/locations-api
- specs https://www.searchapi.io/openapi/google.yaml, https://www.searchapi.io/openapi/google_ai_overview.yaml,
  https://www.searchapi.io/openapi/google_ai_mode.yaml
- pricing https://www.searchapi.io/pricing
- legal https://www.searchapi.io/legal/terms, https://www.searchapi.io/legal/privacy, https://www.searchapi.io/legal/dpa,
  https://www.searchapi.io/legal/subprocessors
- changelog https://www.searchapi.io/announcements
- status https://status.searchapi.io/

**[CLORO] cloro**
- docs https://cloro.dev/docs/index.md, https://cloro.dev/docs/api-reference/endpoint/monitor-google.md,
  https://cloro.dev/docs/api-reference/endpoint/google/ai-overview.md, https://cloro.dev/docs/api-reference/endpoint/monitor-aimode.md,
  https://cloro.dev/docs/api-reference/endpoint/google/ai-overview/sources.md,
  https://cloro.dev/docs/api-reference/endpoint/aimode/places.md, https://cloro.dev/docs/api-reference/endpoint/countries.md,
  https://cloro.dev/docs/guides/providers.md
- pricing and billing https://cloro.dev/pricing/, https://cloro.dev/docs/guides/billing.md,
  https://cloro.dev/docs/guides/concurrency.md, https://cloro.dev/docs/guides/making-requests/async.md,
  https://cloro.dev/docs/guides/error-handling.md
- legal https://cloro.dev/terms/, https://cloro.dev/privacy/, https://cloro.dev/dpa/
- product https://cloro.dev/ai-overview/, https://cloro.dev/ai-mode/

**[APIFY] Apify `apify/google-search-scraper`**
- https://apify.com/apify/google-search-scraper (and its README `.md`, input schema, changelog and API pages)
- https://api.apify.com/v2/acts/apify~google-search-scraper (pricing events, run statistics)
- https://api.apify.com/v2/acts/apify~google-search-scraper/builds/default (input and dataset schemas)
- https://apify.com/pricing
- https://docs.apify.com/legal/general-terms-and-conditions, https://docs.apify.com/legal/actor-terms-and-conditions,
  https://docs.apify.com/legal/acceptable-use-policy, https://docs.apify.com/legal/data-processing-addendum,
  https://docs.apify.com/legal/privacy-policy

**[OTHER] Oxylabs Web Scraper API**
- https://developers.oxylabs.io/products/web-scraper-api/targets/search-engines/google/ai-overviews.md
- https://developers.oxylabs.io/products/web-scraper-api/targets/search-engines/google/ai-mode.md
- https://developers.oxylabs.io/products/web-scraper-api/features/localization/serp-localization
- https://developers.oxylabs.io/changelog
- https://developers.oxylabs.io/products/web-scraper-api/usage-and-billing/rate-limits
- https://developers.oxylabs.io/products/web-scraper-api/integration-methods/push-pull.md
- https://oxylabs.io/products/web-api/scrape/pricing, https://oxylabs.io/products/web-api/scrape/targets/pricing
- https://oxylabs.io/legal/oxylabs-terms-of-service, https://oxylabs.io/legal/oxylabs-acceptable-use-policy,
  https://oxylabs.io/legal/data-processing-terms, https://oxylabs.io/legal/privacy

**[GOOGLE] Google**
- terms https://policies.google.com/terms
- robots https://www.google.com/robots.txt
- spam https://developers.google.com/search/docs/essentials/spam-policies
- 86640 https://support.google.com/websearch/answer/86640
- 16984139 https://support.google.com/webmasters/answer/16984139 (Generative AI performance report)
- blog 2026/06 https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports
- https://developers.google.com/search/docs/appearance/ai-features
- https://developers.google.com/search/updates
- 7042828 https://support.google.com/webmasters/answer/7042828
- 17011259 https://support.google.com/webmasters/answer/17011259 (search appearance types)
- searchanalytics/query https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- https://developers.google.com/webmaster-tools/v1/how-tos/authorizing
- prereqs https://developers.google.com/webmaster-tools/v1/prereqs
- https://searchconsole.googleapis.com/$discovery/rest?version=v1 (the API's machine-readable definition, revision 20261107)
- https://developers.google.com/identity/protocols/oauth2/scopes
- brand-verification https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification
- https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- cloud https://support.google.com/cloud/answer/13463817, https://support.google.com/cloud/answer/13464325,
  https://support.google.com/cloud/answer/15549945, https://support.google.com/cloud/answer/7454865
- 7687615 https://support.google.com/webmasters/answer/7687615 (Search Console permissions)
