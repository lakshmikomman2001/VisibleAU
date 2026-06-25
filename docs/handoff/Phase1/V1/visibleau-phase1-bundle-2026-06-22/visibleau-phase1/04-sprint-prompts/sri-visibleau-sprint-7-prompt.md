# Sprint 7 — Technical AI Infrastructure (Module 5b) + OSS Additions

**Sprint:** 7 of 12
**Estimated effort:** 130-180 hours (~16-22 weekends at 8 hrs/week — PRD §11 "~22 additional days vs baseline")
**Goal:** Build the v1.3 differentiator. Module 5b core (5 features) + OSS-derived audit dimensions (10 features) + 50-site validation corpus. Spearman correlation > 0.7 between audit scores and observed citation patterns is the acceptance gate.
**Prerequisites:** Sprint 6 complete. Action Center generating recommendations from multidimensional audits.
**Out of scope:** Local SEO module (moved to Sprint 8 per PRD §11), drift detection (Sprint 8), agency tier multi-brand (Sprint 9).

**Audit-flow design decision (v2.1 added, per second-pass-fix N3):** The technical audit runs **in parallel with the multidimensional audit** triggered by Sprint 4's "Run Audit" button. One click fires `audit/start` Inngest event → both `inngest/functions/run-audit.ts` (Sprint 3, 200 LLM calls) AND `inngest/functions/technical-audit-run.ts` (this sprint, site crawler) fire. Each completes independently; the audit-completion email summarizes both. **Shared quota:** one Run Audit click = one tier-quota slot (TIER_AUDIT_LIMITS per Sprint 9). **Cost budget:** per-audit budget rises from <US$3 (LLM only) to <US$3.50 to cover ~US$0.30 site-crawler cost (Playwright + bandwidth). **UI:** Sprint 4's audit-list shows the multidim audit as the primary row; a "+ technical audit" badge marks rows where both completed. The technical-audit page (`/brands/[id]/technical-audit`) shows the 8-dim drill-down + 5-cat rollup. CLAUDE.md §2 captures this design decision.

---

## 0. Read first

1. `CLAUDE.md`
2. `sri-geo-aeo-prd-v1.md` v1.14 §8 Module 5b (5 core features) + §8.8 OSS-derived additions + §11 Sprint 7 expanded scope + §16 OSS reference strategy
3. `visibleau-prototype.jsx` lines 2458-2870 (5 dedicated Module 5b screens + Brand & Entity audit + 47 citability methods page)
4. Reference (do NOT import as dependency): `Auriti-Labs/geo-optimizer-skill` README + SCORING_RUBRIC.md — methodology reference only

**This is the largest sprint by effort.** Sprint 7 v2.0 absorbs ~22 days of work that v1.0 underestimated as ~22 hours. Read PRD §11 carefully before committing to the timeline.

---

## 1. What ships this sprint

### Module 5b core (5 features per PRD §8)

- ✓ **llms.txt generator + validator** — Crawls customer site, identifies key pages by traffic + topical authority, generates compliant llms.txt in Markdown per Jeremy Howard's proposed standard. Validates (correct format, <10KB, served as text/plain or text/markdown). One-click download OR hosted via VisibleAU CDN. Auto-regenerates monthly. **Graduated /18 depth scoring** (per §8.8): 6 components — present, H1+blockquote, sections, links, depth, llms-full.txt companion.
- ✓ **robots.txt AI crawler configuration helper** — Suggests robots.txt entries for AI crawlers. **27 AI bots tracked across 3 tiers** (per §8.8 — use Auriti-Labs list with MIT attribution): Tier 1 must-allow (GPTBot, ChatGPT-User, ClaudeBot, anthropic-ai, PerplexityBot, Google-Extended, AppleBot-Extended); Tier 2 emerging (CCBot, BingBot, Mistral, DeepSeekBot, GrokBot, etc.); Tier 3 data crawlers (DataForSeoBot, AhrefsBot, etc.). Customer opts in/out per crawler.
- ✓ **Schema markup auditor (with reality-check)** — Scans existing schema markup, identifies gaps (Organization, LocalBusiness, FAQPage, Article). **Schema richness scoring /16** (per §8.8): count attributes per JSON-LD object. Reports honest impact: "Schema markup helps Google AI Overviews via traditional snippets (medium impact). Schema markup itself shows zero measurable impact on ChatGPT, Claude, Perplexity, Gemini per SE Ranking research."
- ✓ **Server-side rendering (SSR) check** — Detects whether key pages render content server-side (AI crawler visible) or client-side only (AI invisible). Critical for SPA-heavy sites. Per-page render-mode report. JS rendering check: content accessible without JavaScript? SPA framework detection.
- ✓ **Answer capsule formatter helper** — Identifies question-based H2/H3 headings on customer site, checks whether each is followed by a 20-25 word direct answer (the "answer capsule" pattern), suggests rewrites where missing.

### OSS-derived additions (per PRD §8.8 + §16)

- ✓ **CDN crawler access check** — Cloudflare/Akamai/Vercel blocking detection for GPTBot/ClaudeBot/PerplexityBot. Surface explicit "your CDN is blocking AI crawlers" warning with vendor-specific remediation steps.
- ✓ **AI discovery endpoints check** — `.well-known/ai.txt`, `/ai/summary.json`, `/ai/faq.json`, `/ai/service.json`. Emerging standards; check presence + validity.
- ✓ **AU-localised Brand & Entity scoring** — **ABN Lookup verification + Wikipedia AU presence + AU TLD signal + AU directory aggregate** (Hipages, Yellow Pages AU, ServiceSeeking, Word of Mouth). Sprint 7-original AU layer.
- ✓ **47 citability methods catalogue** — Top-10 publicly visible on `/methodology` page (Sprint 11 polishes; Sprint 7 stubs the route). Full 47 with effect-size deltas surfaced in Action Center evidence-links. Sources: Princeton KDD 2024 + AutoGEO ICLR 2026.
- ✓ **Negative signals detection (8 patterns)** — CTA overload, popup density, thin content (<300 words), keyword stuffing, missing author, high boilerplate ratio, broken outbound links, ad density. Each scored 0-10; aggregated into "negative signals score" (lower is better).
- ✓ **Prompt injection detection (8 patterns)** — Hidden text, invisible Unicode, LLM-instruction injections, HTML comment injection, monochrome text, micro-font, data-attr injection, aria-hidden abuse. Each flagged with severity (critical/warning/info). Reports detected pattern + offending element.
- ✓ **8 audit dimensions internally → 5 surfaced** (per §16 Gap D UX decision): score internally against 8 categories (Robots /18, llms.txt /18, Schema /16, Meta /14, Content /12, Brand & Entity /10, Signals /6, AI Discovery /6 = 100 pts) for diagnostic precision; surface as 5 Foglift-style categories rolled-up (Technical / Content / Authority / Schema / Performance-stub-for-v1.1). Disclosure UI expands 5 → 8.
- ✓ **Brand & Entity audit screen** — `/brands/[id]/brand-entity-audit` (per prototype line 2786). ABN Lookup card, Wikipedia AU card, AU TLD card, AU directory aggregate card.

### 50-site validation corpus (acceptance gate)

- ✓ **50 real-site corpus assembled** — 5 AU Tradies + 5 AU Allied Health + 5 AU SaaS + 5 each US/UK/CA/NZ + 5 known-good high-citation + 5 known-bad low-citation = 50 sites
- ✓ **Spearman correlation gate** — Sprint 7 audit scores must correlate > 0.7 with observed citation patterns from Sprint 3 multidimensional audits. If <0.7, the audit is mostly noise and Sprint 7 does NOT pass acceptance.
- ✓ **ATTRIBUTIONS.md** — Comprehensive credit to OSS reference layer (Auriti-Labs, Princeton GEO, AutoGEO, Tinuiti, SE Ranking, etc.) per PRD §16

**Definition of done:** A brand has 8 technical-infrastructure dimensions scored 0-100 each + roll-up to 5-category UI. Customer can generate compliant llms.txt + robots.txt. Schema audit reports gaps + reality-check. SSR check identifies invisible pages. Answer capsule formatter rewrites Q-headings. Brand & Entity audit shows AU-localised presence. 47 citability methods catalogue visible in Action Center evidence-links. Negative signals + prompt injection detection report site quality issues. 50-site validation corpus passes Spearman > 0.7 gate.

---

## 2. Dependencies to install

```bash
# Site crawling + parsing
pnpm add playwright cheerio
pnpm add @mozilla/readability jsdom

# Schema.org validation
pnpm add schema-dts

# Markdown for llms.txt generation
pnpm add unified remark-parse remark-stringify

# `simple-statistics` already installed Sprint 3 — used for Spearman correlation
```

---

## 3. Environment variables (additions)

```bash
# ABN Lookup (free AU government API)
ABN_LOOKUP_GUID=...   # request at abr.business.gov.au

# Site crawler tuning
CRAWLER_MAX_PAGES_PER_SITE=20
CRAWLER_TIMEOUT_MS=15000
CRAWLER_USER_AGENT=VisibleAU-Audit-Bot/1.0 (+https://visibleau.com/bot)
```

---

## 4. Project structure additions

```
db/schema/
├── technical-audits.ts                       # NEW
├── brand-entity-scores.ts                    # NEW
├── citability-methods.ts                     # NEW (seeded)
└── validation-corpus-results.ts              # NEW

db/seed/
├── citability-methods/seed.ts                # 47 methods (Princeton KDD + AutoGEO ICLR)
├── ai-bots/seed.ts                           # 27 bots × 3 tiers (MIT-attributed)
│                                             # EC3 fix: §1 named Tier 1 (7 bots) but Tier 2+3 were "etc."
│                                             # EF1 fix: EC3 used Must-allow/Emerging/Data-crawlers taxonomy
│                                             # but prototype shows Training/Search-AI/User-agent (9/9/9).
│                                             # Use prototype taxonomy as canonical (it's the UX reference):
│                                             #
│                                             # TIER 1 — Training crawlers (indexing training data):
│                                             # GPTBot, ClaudeBot, anthropic-ai, Google-Extended,
│                                             # CCBot, FacebookBot, Bytespider, Diffbot, cohere-ai
│                                             #
│                                             # TIER 2 — Search-AI crawlers (powering AI search answers):
│                                             # OAI-SearchBot, PerplexityBot, GeminiBot, AppleBot-Extended,
│                                             # bingbot, YouBot, Amazonbot, Applebot, DuckAssistBot
│                                             #
│                                             # TIER 3 — User-agent crawlers (user-initiated AI queries):
│                                             # ChatGPT-User, Claude-User, Perplexity-User, Gemini-User,
│                                             # OpenAI-Search, AndiBot, Bingbot-AI-Tool, Cotoyogi, PetalBot
│                                             #
│                                             # Seed schema: { userAgent: string, displayName: string,
│                                             # tier: 1|2|3, tierLabel: string, defaultAllow: boolean,
│                                             # description: string }
└── validation-corpus/fifty-sites.ts          # 50 real-site fixtures

lib/
├── crawler/                                  # Playwright-based site crawler
│   ├── index.ts                              # crawlSite(domain, opts) → CrawlResult
│   ├── playwright-render.ts                  # SSR vs CSR detection
│   ├── extract-content.ts                    # @mozilla/readability extraction
│   │   # EH4 fix: output type and callers never specified.
│   │   # Function: extractContent(html: string, url: string): ExtractedContent
│   │   # Returns: { title: string, textContent: string, wordCount: number,
│   │   #            excerpt: string, siteName: string, byline: string | null }
│   │   # Uses: new Readability(new JSDOM(html, { url }).window.document).parse()
│   │   #
│   │   # CALLERS:
│   │   # 1. lib/negative-signals/detect.ts — uses textContent for:
│   │   #    - thin content: wordCount < 300
│   │   #    - keyword stuffing: term frequency on textContent
│   │   #    - missing author: byline === null on article pages
│   │   #    - boilerplate ratio: rawBodyWordCount vs wordCount
│   │   # 2. lib/answer-capsules/find-questions.ts — parses textContent to find H2/H3 + following text
│   │   # 3. lib/llms-txt/generate.ts — uses excerpt per page as section summary
│   │   #
│   │   # Called once per crawled page in lib/crawler/index.ts; result cached in CrawlResult.pages[]
│   ├── robots-fetcher.ts                     # robots.txt + sitemap.xml fetcher
│   └── types.ts
├── llms-txt/
│   ├── generate.ts                           # generateLlmsTxt(crawl, brand) → string
│   ├── validate.ts                           # validateLlmsTxt(text) → { score, issues }
│   ├── depth-score.ts                        # 6-component /18 graduated scoring
│   │                                         # EC2 fix: component criteria never specified.
│   │                                         # Each component = 3pts (6×3=18), binary 0 or 3:
│   │                                         # 1. Present: exists at /llms.txt, HTTP 200, <10KB, correct MIME
│   │                                         # 2. H1+blockquote: starts with H1 brand + blockquote summary
│   │                                         # 3. Sections: ≥3 H2 sections covering key service areas
│   │                                         # 4. Links: ≥5 internal page links (markdown format)
│   │                                         # 5. Depth: total file character count ≥1500 chars
│   │                                         #    ED1 fix: EC2 said 'avg section body ≥50 words' but
│   │                                         #    prototype shows '≥1500 chars' (total file depth).
│   │                                         #    Use prototype as canonical: total chars ≥1500.
│   │                                         # 6. llms-full.txt: companion file exists, >2KB, linked from header
│   └── templates/
│       ├── tradies.md.tmpl
│       ├── allied-health.md.tmpl
│       └── saas.md.tmpl
├── robots-txt/
│   ├── analyze.ts                            # parse + score AI bot access
│   ├── generate.ts                           # generate recommended robots.txt
│   │                                         # ED4 fix: never specified whether this generates a full
│   │                                         # replacement or AI-bot section only. Generating a full
│   │                                         # replacement that overwrites Disallow rules would break SEO.
│   │                                         # Canonical: generate the AI-BOT SECTION ONLY as a text block
│   │                                         # the customer appends to their existing robots.txt:
│   │                                         #
│   │                                         # Output format (insertable block):
│   │                                         # # === AI Crawler Configuration (VisibleAU) ===
│   │                                         # # Tier 1: Must-allow for LLM citation access
│   │                                         # User-agent: GPTBot
│   │                                         # Allow: /
│   │                                         # ... (one block per allowed bot)
│   │                                         # User-agent: DataForSeoBot
│   │                                         # Disallow: /  (if customer opted out)
│   │                                         # # === End AI Crawler Configuration ===
│   │                                         #
│   │                                         # The UI shows: "Add this to your existing robots.txt"
│   │                                         # with a copy button. NOT a replacement generator.
│   ├── ai-bots.ts                            # 27-bot registry
│   └── cdn-detect.ts                         # Cloudflare/Akamai/Vercel detection
├── schema-audit/
│   ├── extract.ts                            # parse JSON-LD blocks
│   ├── validate.ts                           # schema-dts validation
│   ├── richness-score.ts                     # /16 graduated scoring
│   │   # EH1 fix: "count attributes per JSON-LD object" but no formula to /16.
│   │   # Formula: 4 schema types × 4pts each = /16
│   │   #
│   │   # Per type scoring (4pts max):
│   │   #   1pt: type present in JSON-LD (e.g. @type: "Organization")
│   │   #   +1pt: has @id / url / sameAs (entity linking)
│   │   #   +1pt: has ≥5 attributes (rich: name, address, telephone, url, openingHours etc.)
│   │   #   +1pt: has ≥10 attributes (comprehensive: adds image, logo, geo, priceRange etc.)
│   │   #
│   │   # Types scored: Organization, LocalBusiness, FAQPage, Article
│   │   # (additional types count toward the nearest matching type)
│   │   # scoreSchema = sum of points across all 4 types (max 16)
│   └── reality-check.ts                      # honest per-engine impact reporting
│       # EF5 fix: per-engine claims need exact source citations for credibility.
│       # "zero measurable impact on ChatGPT/Claude/Perplexity/Gemini" — cite specifically:
│       #
│       # Source: SE Ranking "AI Mode Citation Source Analysis" (Dec 2025)
│       # URL: https://seranking.com/blog/ai-overviews-study/
│       # Finding: "Schema markup alone shows ~zero measurable impact on LLM citation rates;
│       #   FAQ schema in main content shows +0.5 avg citations vs 4.4 baseline (not schema, the content)"
│       #
│       # Canonical reality-check copy per engine (rendered in schema-audit page):
│       # Google AI Overviews: "Medium impact — schema helps traditional snippets which feed
│       #   AI Overviews indirectly. Not a direct citation signal."
│       # ChatGPT / Claude / Perplexity / Gemini: "No measurable direct impact per SE Ranking
│       #   Dec 2025 study (4.9 vs 4.4 avg citations — gap from FAQ content, not schema markup)."
│       #
│       # Implementation: export SCHEMA_REALITY_CHECK as a hardcoded const (not a DB query).
│       # Audit once per sprint for accuracy; update when new research publishes.
├── ssr-check/
│   ├── per-page.ts                           # render with + without JS, compare
│   │   # EF2 fix: two separate Playwright renders per page is expensive (doubles crawl time).
│   │   # Method: single SECOND lightweight Playwright context with javaScriptEnabled: false.
│   │   # Run ONCE per domain on the homepage only (not all 20 pages):
│   │   #
│   │   # const jsContext = await browser.newContext({ javaScriptEnabled: true });
│   │   # const noJsContext = await browser.newContext({ javaScriptEnabled: false });
│   │   # const [jsPage, noJsPage] = await Promise.all([
│   │   #   jsContext.newPage(), noJsContext.newPage()
│   │   # ]);
│   │   # await Promise.all([jsPage.goto(url), noJsPage.goto(url)]);
│   │   # const jsText = await jsPage.$eval('body', el => el.innerText);
│   │   # const noJsText = await noJsPage.$eval('body', el => el.innerText);
│   │   #
│   │   # SSR if: noJsText.length / jsText.length > 0.7 (70%+ of content visible without JS)
│   │   # CSR if: ratio < 0.7 (most content requires JS to render)
│   │   # SPA detected if: jsPage.url() !== url after navigation (hash routing)
│   └── spa-detect.ts                         # React/Vue/Angular detection
├── answer-capsules/
│   ├── find-questions.ts                     # H2/H3 ending in "?"
│   ├── check-capsule.ts                      # 20-25 word direct answer?
│   └── generate-capsule.ts                   # AI-suggested rewrite
│       # EF3 fix: model, prompt, cost, and trigger never specified.
│       # CRITICAL: do NOT run AI rewrite during the crawl — it would blow the per-audit budget.
│       # Run ON-DEMAND only: user clicks "Suggest rewrite" on a specific Q-heading.
│       #
│       # Model: claude-haiku-4-5-20251001 (cheapest, fast, sufficient for single-sentence rewrites)
│       # Prompt template:
│       #   "The heading '${question}' currently lacks a 20-25 word direct answer capsule.
│       #    The following content appears below it: '${existingContent.slice(0, 200)}'.
│       #    Write a single direct-answer sentence (20-25 words) that answers the question.
│       #    Start with the answer, not a preamble. Focus on what the customer gets, not who the brand is."
│       # Cost: ~0.1¢ per rewrite (haiku input+output ≈ 200 tokens). On-demand only.
│       # Endpoint: POST /api/answer-capsules/generate (new Route Handler, not during Inngest crawl)
├── ai-discovery/
│   └── endpoints.ts                          # .well-known/ai.txt etc.
│       # EH2 fix: 4 endpoints listed but no per-endpoint point values specified.
│       # 4 × 1.5 = 6 (non-integer) — not implementable cleanly.
│       # Canonical scoring (primary standard weighted higher):
│       #   .well-known/ai.txt: 3pts — primary emerging standard; highest adoption signal
│       #   /ai/summary.json:   1pt — structured brand summary for AI systems
│       #   /ai/faq.json:       1pt — FAQ data for AI Q&A systems
│       #   /ai/service.json:   1pt — service catalogue for local AI search
│       #   Total: 3+1+1+1 = 6pts
│       #
│       # "Present + valid" check per endpoint:
│       #   - HTTP 200 response
│       #   - Content-Type: application/json (for .json) or text/plain (for .txt)
│       #   - Non-empty body (>100 chars)
│       # Partial: endpoint exists but malformed → 0pts (binary pass/fail per endpoint)
├── brand-entity/
│   ├── abn-lookup.ts                         # https://abr.business.gov.au/Tools/JsonAbnLookup
│   │   # EF4 fix: API URL, response shape, and error handling never specified.
│   │   #
│   │   # Endpoint: GET https://abr.business.gov.au/Tools/JsonAbnLookup?guid=${ABN_LOOKUP_GUID}&abn=${abn}
│   │   # (abn = 11-digit ABN from brand record, no spaces)
│   │   #
│   │   # Success response shape:
│   │   # { Abn: string, AbnStatus: 'Active'|'Cancelled', EntityName: string,
│   │   #   EntityTypeCode: string, EntityTypeName: string, Gst: string,
│   │   #   BusinessName: Array<{ Name: string }>,
│   │   #   AddressState: string, AddressPostcode: string }
│   │   #
│   │   # Error cases:
│   │   # 1. abn not found → response has no Abn field → treat as unverified
│   │   # 2. Status 429 (rate limit) → retry once after 2s, then fail gracefully
│   │   # 3. Network error → log + return { abnVerified: false, abnStatus: null }
│   │   #
│   │   # Note: GUID from ABN_LOOKUP_GUID env var (§3). Free API, no OAuth needed.
│   ├── wikipedia-au.ts                       # Wikipedia API for AU presence
│   ├── au-tld-signal.ts                      # .com.au, .net.au, .org.au signal
│   ├── au-directory-aggregate.ts             # Hipages/YPAU/SS/WoM aggregate
│   └── score.ts                              # composite /10
│       # EE4 fix: prototype BrandEntityAudit shows 5 signals but brand_entity_scores has 4 data sources.
│       # Row 5 "Australian Business Register match" IS the ABN Lookup result (same ABR API call).
│       # The UI splits the ABN verification into two display rows for clarity:
│       #   Row 1: "ABN Lookup verification" — ABN number matches business name
│       #   Row 5: "Australian Business Register match" — trading name disputes check
│       # Both come from a single abn-lookup.ts API call. Do NOT add a 5th schema column.
│       # Score composition (/10): ABN(3) + Wikipedia AU(3) + AU TLD(2) + AU Directory(2) = /10
├── citability/
│   ├── catalogue.ts                          # 47 methods loader
│   ├── apply.ts                              # which methods apply?
│   └── effect-sizes.ts                       # effect-size delta map
├── negative-signals/
│   ├── detect.ts
│   └── patterns/                             # 8 pattern files (one each)
│       # EE2 fix: 8 patterns named in §1 but zero detection logic specified.
│       # Canonical detection per pattern (cheerio $ = parsed HTML):
│       #
│       # 1. CTA overload: count elements matching 'a.btn, button, .cta, [class*="cta"]'
│       #    Threshold: >7 CTAs on a single page = 'warning'; >12 = 'critical'
│       #
│       # 2. Popup density: count elements matching '[class*="modal"], [class*="popup"],
│       #    [class*="overlay"], [id*="popup"]'
│       #    Threshold: >2 popup triggers = 'warning'
│       #
│       # 3. Thin content: count words in main content (body text minus nav/footer/header)
│       #    Threshold: <300 words = 'warning'; <150 words = 'critical'
│       #
│       # 4. Keyword stuffing: compute term frequency for top 5 terms
│       #    Threshold: any term >3% density = 'warning'; >5% = 'critical'
│       #
│       # 5. Missing author: check for '[rel="author"], .author, [itemprop="author"]'
│       #    Threshold: absent on article/blog pages (check if page has <article> or .post) = 'info'
│       #
│       # 6. High boilerplate ratio: compare nav+footer+aside word count vs body word count
│       #    Threshold: boilerplate >60% of total = 'warning'
│       #
│       # 7. Broken outbound links: HTTP HEAD check on all external <a href> (max 20 links)
│       #    Threshold: any 4xx/5xx response = 'warning'
│       #
│       # 8. Ad density: count '[class*="ad-"], [id*="google_ad"], .advertisement, [class*="adsense"]'
│       #    Threshold: >3 ad containers = 'warning'; >6 = 'critical'
├── prompt-injection/
│   ├── detect.ts
│   └── patterns/                             # 8 pattern files (one each)
│       # EE3 fix: 8 patterns named in §1 but zero detection logic specified.
│       # Canonical detection per pattern:
│       #
│       # 1. Hidden text: CSS color matches background, or display:none, visibility:hidden
│       #    on elements with text content. Cheerio: check elements with style attr
│       #    containing 'color' matching 'background-color' (heuristic via computed style).
│       #    Playwright: getComputedStyle comparison. Severity: 'critical'
│       #
│       # 2. Invisible Unicode: regex /[\u00AD\u200B-\u200F\u2028-\u202F\uFEFF\u2060]/
│       #    on text content. These zero-width / soft-hyphen chars hide injected instructions.
│       #    Severity: 'critical'
│       #
│       # 3. LLM-instruction injections: regex /ignore (previous|all|above)|act as|
│       #    you are now|disregard|system prompt/i in text content.
│       #    Severity: 'critical'
│       #
│       # 4. HTML comment injection: regex /<!--.*?(ignore|disregard|act as|you are)/is
│       #    in raw HTML. LLMs sometimes include HTML comment content. Severity: 'warning'
│       #
│       # 5. Monochrome text: color === backgroundColor (exact hex match via Playwright
│       #    getComputedStyle). Severity: 'critical'
│       #
│       # 6. Micro-font: font-size < 2px on text-bearing elements. Playwright computed style.
│       #    Severity: 'warning'
│       #
│       # 7. Data-attr injection: attributes matching /data-(llm|ai|gpt|prompt|instruction)/i
│       #    with non-empty values. Severity: 'warning'
│       #
│       # 8. Aria-hidden abuse: <div aria-hidden="true"> containing >100 chars of text
│       #    (legitimate aria-hidden typically hides icons, not paragraphs). Severity: 'info'
└── technical-audit/
    ├── orchestrate.ts                        # run all 8 dimensions
    ├── score-aggregator.ts                   # 8 → 5 UX rollup per §16 Gap D
    │   # EC1 fix: mapping was referenced but never written. PRD §16 Gap D canonical mapping:
    │   #
    │   # export function rollupTo5Categories(dims: TechnicalAuditDimensions): CategoryRollup {
    │   #   return {
    │   #     technical: dims.scoreRobots + dims.scoreLlmsTxt + dims.scoreAiDiscovery + dims.scoreSignals,
    │   #     // max: 18 + 18 + 6 + 6 = 48 — normalise to /100:
    │   #     technicalPct: ((dims.scoreRobots + dims.scoreLlmsTxt + dims.scoreAiDiscovery + dims.scoreSignals) / 48) * 100,
    │   #     content:    dims.scoreContent + dims.scoreMeta,       // max: 12 + 14 = 26 → /100
    │   #     contentPct: ((dims.scoreContent + dims.scoreMeta) / 26) * 100,
    │   #     authority:    dims.scoreBrandEntity,                  // max: 10 → /100
    │   #     authorityPct: (dims.scoreBrandEntity / 10) * 100,
    │   #     schema:    dims.scoreSchema,                          // max: 16 → /100
    │   #     schemaPct: (dims.scoreSchema / 16) * 100,
    │   #     performance: null,  // stub for v1.1 — shows "Coming v1.1" in UX
    │   #   };
    │   # }
    │   # Each *Pct field is the 0-100 normalised score shown in the 5-category UI tiles.
    │   # The raw dimension scores (scoreRobots etc.) are shown in the 8-dim drill-down.
    └── types.ts

inngest/functions/
├── technical-audit-run.ts                    # NEW long-running orchestrator (~3-5 min/brand). Triggered by SAME `audit/start` Inngest event as Sprint 3's run-audit.ts. Runs in parallel; persists to `technical_audits` table; emits `technical-audit.complete` event the audit-completion email handler listens for.
└── corpus-validation.ts                      # NEW runs 50-site corpus, computes Spearman

app/(auth)/brands/[brandId]/
├── technical-audit/page.tsx                  # 8-dim drill-down + 5-cat rollup (EC5 spec)
├── llms-txt-generator/page.tsx
├── schema-audit/page.tsx
├── ssr-check/page.tsx
├── answer-capsules/page.tsx
├── robots-txt-config/page.tsx                # 27-bot matrix
└── brand-entity-audit/page.tsx
    # EG3 fix: sub-page fetch pattern never specified.
    # All 6 sub-pages read from technical_audits.findings — NO re-crawl on page load.
    # Pattern (same for all 6, substituting the findings key):
    #
    # export default async function LlmsTxtGeneratorPage({ params }) {
    #   const currentUser = await getCurrentUser();
    #   if (!currentUser) redirect('/sign-in');
    #   await setRlsContext(db, currentUser.organizationId);
    #   const [techAudit] = await db.select({ id: technicalAudits.id, findings: technicalAudits.findings,
    #     scoreLlmsTxt: technicalAudits.scoreLlmsTxt, crawledAt: technicalAudits.crawledAt })
    #     .from(technicalAudits).where(eq(technicalAudits.brandId, params.brandId))
    #     .orderBy(desc(technicalAudits.createdAt)).limit(1);
    #   if (!techAudit) return <EmptyState message="Run a technical audit first." />;
    #   const findings = techAudit.findings.llmsTxt;  // sub-key per dimension
    #   return <LlmsTxtGeneratorView findings={findings} score={techAudit.scoreLlmsTxt}
    #            crawledAt={techAudit.crawledAt} techAuditId={techAudit.id} brandId={params.brandId} />;
    # }
    #
    # The findings sub-key per page: llmsTxt | robots | schema | content | signals | aiDiscovery | meta | brandEntity

app/(auth)/methodology/page.tsx               # stub (Sprint 11 polishes)

app/api/
├── technical-audits/[id]/route.ts
│   # EE5 fix: route listed but body never specified. Critical for cross-org protection:
│   # export async function GET(req: Request, { params }: { params: { id: string } }) {
│   #   const currentUser = await getCurrentUser();
│   #   if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
│   #   await setRlsContext(db, currentUser.organizationId);
│   #   const [audit] = await db.select().from(technicalAudits)
│   #     .where(eq(technicalAudits.id, params.id));
│   #   if (!audit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
│   #   // RLS scopes to org — cross-org returns empty → 404 above
│   #   return NextResponse.json(audit);
│   # }
├── crawl/route.ts
├── brand-entity/[brandId]/route.ts
├── answer-capsules/
│   └── generate/route.ts                     # POST — EG4 fix: EF3 specified this endpoint but it was
│       # absent from project structure. On-demand Claude haiku rewrite (not during crawl):
│       # Auth + body: { brandId: string, question: string, existingContent: string }
│       # Returns: { capsule: string }  (~20-25 words)
└── citability-methods/route.ts               # GET — EG5 fix: route listed but body never specified.
    # Auth required. Free tier → top-10 by effectSizePct; Starter+ → all 47.
    # Returns: { methods: CitabilityMethod[], total: 47, shown: number }
    # No setRlsContext — citability_methods is global (DISABLE RLS per EB1).

components/domain/technical/
├── dimension-tile.tsx
├── llms-txt-preview.tsx
├── schema-richness-card.tsx
├── ssr-status-table.tsx
├── ai-bots-matrix.tsx                        # 27 bots × 3 tiers, toggle per bot
└── cdn-detection-card.tsx

ATTRIBUTIONS.md                               # NEW — full credits per PRD §16

tests/
├── unit/
│   ├── llms-txt/                             # generate.test.ts, depth-score.test.ts
│   ├── robots-txt/                           # analyze.test.ts, cdn-detect.test.ts
│   ├── schema-audit/                         # extract.test.ts, richness-score.test.ts
│   ├── ssr-check/per-page.test.ts
│   ├── answer-capsules/check-capsule.test.ts
│   ├── brand-entity/                         # abn-lookup.test.ts, score.test.ts
│   ├── negative-signals/detect.test.ts       # 8 sub-tests
│   └── prompt-injection/detect.test.ts       # 8 sub-tests
├── integration/
│   ├── crawler/end-to-end-crawl.test.ts
│   └── technical-audit/orchestrate.test.ts
└── corpus/
    ├── run-corpus.ts                         # Sprint 7's main acceptance script
    ├── report.ts
    └── reports/                              # markdown reports per run
```

---

## 5. Database schema additions

### `technical_audits.ts`

```typescript
import { pgTable, uuid, numeric, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { brands } from './brands';
import { organizations } from './organizations';
import { audits } from './audits';

export const technicalAudits = pgTable('technical_audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').references(() => brands.id).notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),

  // Links to the parallel multidim audit fired by the same `audit/start` event (v2.2 third-pass-fix B2).
  // Nullable to permit standalone technical audits (future feature, e.g., a "Run Technical Audit Only" button).
  // For the v1 "Run Audit triggers both" design, this column IS populated.
  auditId: uuid('audit_id').references(() => audits.id),

  // 8 internal dimensions (UX surfaces as 5 rolled-up per §16 Gap D)
  scoreRobots: numeric('score_robots', { precision: 5, scale: 2 }),       // /18
  // EH5 fix: scoreRobots /18 composition never specified (parallels llms.txt /18 from EC2).
  // 6 components × 3pts each = /18, binary (0 or 3):
  // 1. robots.txt present: file exists at /robots.txt, HTTP 200, non-empty
  // 2. Tier 1 bots explicitly allowed: ≥3 of 7 must-allow Tier 1 bots have Allow: / rules
  //    (or no Disallow: / rule — default allow is acceptable)
  // 3. No blanket AI block: no User-agent: * Disallow: / that would block ALL crawlers
  // 4. Sitemap declared: Sitemap: https://... directive present in robots.txt
  // 5. CDN not blocking AI bots: CDN detection check passes (no Cloudflare AI block etc.)
  // 6. AI bots not explicitly blocked: none of the Tier 1 bots have Disallow: / entries
  scoreLlmsTxt: numeric('score_llms_txt', { precision: 5, scale: 2 }),    // /18
  scoreSchema: numeric('score_schema', { precision: 5, scale: 2 }),       // /16
  scoreMeta: numeric('score_meta', { precision: 5, scale: 2 }),           // /14
  // EG2 fix: 5 sub-signals (title, description, og, canonical, hreflang) with no per-signal weights.
  // Weights derived from citation signal importance (title/description most critical):
  //   Title tag present and ≥10 chars: 4pts (most important — directly used in snippets)
  //   Meta description present and 50-160 chars: 3pts
  //   OG tags present (og:title, og:description, og:image): 3pts
  //   Canonical tag present: 2pts (prevents duplicate content confusion)
  //   Hreflang present (for AU-localised sites): 2pts
  //   Total: 4+3+3+2+2 = 14pts
  scoreContent: numeric('score_content', { precision: 5, scale: 2 }),     // /12
  // EG1 fix: scoreContent composition never specified.
  // Content dimension = SSR check + answer capsule quality:
  //   SSR score (0-6):
  //     6pts: SSR (noJs/js ratio > 0.7 on homepage)
  //     3pts: Partial (0.4-0.7 ratio — some CSR but substantial static content)
  //     0pts: CSR (ratio < 0.4 — page invisible to AI crawlers without JS)
  //   Answer capsule score (0-6):
  //     capsulePassRate = questionsWithCapsule / totalQuestions (if 0 questions: 1.0 = full marks)
  //     capsuleScore = Math.round(capsulePassRate * 6)
  //   scoreContent = ssrScore + capsuleScore
  scoreBrandEntity: numeric('score_brand_entity', { precision: 5, scale: 2 }),  // /10
  scoreSignals: numeric('score_signals', { precision: 5, scale: 2 }),     // /6 (neg + prompt injection)
  scoreAiDiscovery: numeric('score_ai_discovery', { precision: 5, scale: 2 }),  // /6

  scoreComposite: numeric('score_composite', { precision: 5, scale: 2 }),
  // EA4 fix: composite formula never specified. The 8 dimensions have different max values:
  // Robots /18 + llms.txt /18 + Schema /16 + Meta /14 + Content /12 + BrandEntity /10 + Signals /6 + AIDiscovery /6 = 100 pts total.
  // scoreComposite = sum of all 8 raw scores (already on the shared 100-pt scale).
  // Computed in lib/technical-audit/score-aggregator.ts:
  //   const raw = (scoreRobots + scoreLlmsTxt + scoreSchema + scoreMeta + scoreContent
  //              + scoreBrandEntity + scoreSignals + scoreAiDiscovery);
  //   scoreComposite = Number(raw.toFixed(2));  // 0-100, 2 decimal places
  // Do NOT normalise — the dimension max values already sum to 100.

  findings: jsonb('findings').default('{}').notNull(),
  // EB5 fix: findings shape only partially described. Full type definition for all 8 dimensions:
  // findings: {
  //   llmsTxt: {
  //     present: boolean, url: string|null, depthScore: number,  // /18
  //     issues: string[], hasFullTxt: boolean, sizeKb: number
  //   },
  //   robots: {
  //     present: boolean, score: number,  // /18
  //     aiBotsAllowed: string[], aiBotsBlocked: string[], cdnBlockingDetected: boolean,
  //     cdnVendor: string|null, recommendations: string[]
  //   },
  //   schema: {
  //     typesFound: string[],  // 'Organization'|'LocalBusiness'|'FAQPage'|'Article' etc.
  //     richness: number,  // /16
  //     gaps: string[], realityCheck: { chatgpt: string, claude: string, gemini: string, perplexity: string }
  //   },
  //   meta: {
  //     score: number,  // /14
  //     titlePresent: boolean, descriptionPresent: boolean, ogPresent: boolean,
  //     canonicalPresent: boolean, hreflangPresent: boolean
  //   },
  //   content: {
  //     score: number,  // /12
  //     wordCount: number, answerCapsulesFound: number, answerCapsulesSuggested: number,
  //     negativeSignals: Array<{ pattern: string, severity: 'critical'|'warning'|'info', count: number }>,
  //     promptInjections: Array<{ pattern: string, severity: 'critical'|'warning'|'info', element: string }>
  //   },
  //   brandEntity: {
  //     score: number,  // /10
  //     abnVerified: boolean, abnNumber: string|null, wikipediaAuPresent: boolean,
  //     auTldPresent: boolean, directoryPresence: Array<{ name: string, present: boolean, url: string|null }>
  //   },
  //   signals: { score: number },  // /6 — aggregated from negativeSignals + promptInjections
  //   aiDiscovery: {
  //     score: number,  // /6
  //     aiTxtPresent: boolean, aiSummaryPresent: boolean, aiFaqPresent: boolean, aiServicePresent: boolean
  //   }
  // }

  crawledAt: timestamp('crawled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  // EA2 fix: updatedAt missing — technical audits can be re-run (e.g. re-crawl after llms.txt fix).
  // Without updatedAt there is no audit trail for re-runs or score changes.
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// EA2 fix: RLS never specified. technical_audits is tenant data (has organizationId).
// Add to Sprint 7 migration SQL:
// ALTER TABLE technical_audits ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "org_isolation" ON technical_audits
//   USING (organization_id = current_setting('app.current_organization_id')::uuid);
// Same pattern as action_items (Sprint 6 DM5 fix).
```

Index `(auditId)` for the audit-list join in Sprint 4. Index `(brandId, createdAt DESC)` for the brand-level technical-audit history view.

### `brand_entity_scores.ts`

```typescript
import { pgTable, uuid, text, boolean, integer, jsonb, numeric, timestamp } from 'drizzle-orm/pg-core';
// EA1 fix: boolean type needed for abnVerified and wikipediaAuPresent.
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').references(() => brands.id).notNull(),

  // EA1 fix: abnVerified and wikipediaAuPresent were text('...').default('false') — booleans stored
  // as string literals. Drizzle has a boolean() type which maps to PostgreSQL BOOLEAN and TypeScript
  // boolean. Using text forces string comparisons ('true'/'false') throughout the codebase.
  abnVerified: boolean('abn_verified').default(false).notNull(),
  abnNumber: text('abn_number'),
  abnEntityName: text('abn_entity_name'),
  abnStatus: text('abn_status'),

  wikipediaAuPresent: boolean('wikipedia_au_present').default(false).notNull(),
  wikipediaAuUrl: text('wikipedia_au_url'),
  wikipediaAuMentions: integer('wikipedia_au_mentions').default(0).notNull(),

  auTldDomains: jsonb('au_tld_domains').default('[]').notNull(),
  auDirectoryPresence: jsonb('au_directory_presence').default('[]').notNull(),

  scoreOf10: numeric('score_of_10', { precision: 5, scale: 2 }),

  checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### `citability_methods.ts` (seeded, not user-mutable)

```typescript
export const citabilityMethods = pgTable('citability_methods', {
  id: uuid('id').primaryKey().defaultRandom(),
  methodKey: text('method_key').unique().notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  source: text('source').notNull(),          // 'Princeton KDD 2024' | 'AutoGEO ICLR 2026'
  effectSizePct: numeric('effect_size_pct', { precision: 5, scale: 2 }),
  effectSizeNotes: text('effect_size_notes'),
  appliesTo: jsonb('applies_to').default('[]').notNull(),  // engines + content types
});
```

### `validation_corpus_results.ts`

```typescript
export const validationCorpusResults = pgTable('validation_corpus_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  fixtureName: text('fixture_name').notNull(),
  domain: text('domain').notNull(),
  vertical: text('vertical').notNull(),
  region: text('region').notNull(),
  category: text('category').notNull(),
  expectedScoreMin: numeric('expected_score_min', { precision: 5, scale: 2 }),
  expectedScoreMax: numeric('expected_score_max', { precision: 5, scale: 2 }),
  actualScore: numeric('actual_score', { precision: 5, scale: 2 }),
  withinBand: text('within_band').notNull(),
  spearmanContribution: numeric('spearman_contribution', { precision: 10, scale: 6 }),
  runAt: timestamp('run_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Migrate:
```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
pnpm tsx db/seed/citability-methods/seed.ts
pnpm tsx db/seed/ai-bots/seed.ts
```

**EB1 fix — barrel exports and `db/client.ts` never specified (same gap as Sprint 5 CH2/CN3 + Sprint 6 DA4):**

```typescript
// Add to db/schema/index.ts:
export * from './technical-audits';
export * from './brand-entity-scores';
export * from './citability-methods';
export * from './validation-corpus-results';
export type TechnicalAudit = InferSelectModel<typeof technicalAudits>;
export type BrandEntityScore = InferSelectModel<typeof brandEntityScores>;
export type CitabilityMethod = InferSelectModel<typeof citabilityMethods>;
export type ValidationCorpusResult = InferSelectModel<typeof validationCorpusResults>;

// Add to db/client.ts schema object (alongside Sprint 5 + Sprint 6 additions):
import { technicalAudits, brandEntityScores, citabilityMethods, validationCorpusResults } from './schema';
// Add all 4 to the drizzle(client, { schema: { ...existing..., technicalAudits, brandEntityScores,
//   citabilityMethods, validationCorpusResults } }) call.
```

**RLS:** `technical_audits` → ENABLE (tenant data, EA2). `brand_entity_scores` → ENABLE (tenant data). `citability_methods` → DISABLE (global seed data). `validation_corpus_results` → DISABLE (corpus data, no org scoping).

---

## 6. The 50-site validation corpus (acceptance gate)

50 fixture files in `tests/fixtures/validation-corpus/`:

**ED5 fix — fixture domains must be REAL sites that Claude Code cannot invent. Sri must author all 50.**
Invented domains (example.com, test.com) return empty crawl results; Spearman correlation cannot be computed.
Sample real domains Sri should use (illustrative — verify these are live):
- au-tradies: bondiplumbing.com.au, sydneyelectrical.com.au, masterbuilders.com.au, ...
- known-good: wikipedia.org (for entity scoring baseline), ato.gov.au (authoritative AU site)
- known-bad: sites with thin content, missing llms.txt, CDN-blocked AI crawlers

Each fixture must have a REAL `domain` that VisibleAU bot can actually crawl. The corpus is the acceptance gate — Sri must author all 50 files before Sprint 7 can pass.

```
tests/fixtures/validation-corpus/
├── au-tradies/         # 5
├── au-allied-health/   # 5
├── au-saas/            # 5
├── us/                 # 5
├── uk/                 # 5
├── ca/                 # 5
├── nz/                 # 5
├── known-good/         # 5 (high mention + high Module 5b score)
├── known-bad/          # 5 (low mention + low Module 5b score)
└── edge-cases/         # 5 (single-word, ambiguous names, etc.)
```

Each fixture:
```json
{
  "name": "bondi-plumbing",
  "domain": "bondiplumbing.com.au",
  "vertical": "tradies",
  "region": "au",
  "category": "au-tradies",
  "expectedTechnicalScore": { "min": 35, "max": 65 },
  "expectedMentionRate": { "min": 30, "max": 60 },
  "notes": "Known-good AU plumber with GMB + Hipages + reviews."
}
```

The runner (`tests/corpus/run-corpus.ts`):
1. For each fixture, run Sprint 7 technical audit + Sprint 3 multi-engine audit (mock mode)
2. Persist to `validation_corpus_results`
3. Compute Spearman correlation between technical-score rank and mention-rate rank
4. **Acceptance gate:** Spearman > 0.7 → Sprint 7 passes. Otherwise fail with report.

**ED3 fix — Spearman implementation never specified. Exact call:**

```typescript
import { sampleCorrelation } from 'simple-statistics';
// simple-statistics.sampleCorrelation computes Pearson; for Spearman use ranked arrays:
import { spearman } from 'simple-statistics';  // available in simple-statistics v7+

// After running all 50 fixtures:
const techScores = results.map(r => r.actualScore);            // 0-100 composite
const mentionRates = results.map(r => r.expectedMentionRate);  // fixture expectedMentionRate.min

// Rank both arrays (1 = highest):
function rankArray(arr: number[]): number[] {
  const sorted = [...arr].sort((a, b) => b - a);
  return arr.map(v => sorted.indexOf(v) + 1);
}

const techRanks    = rankArray(techScores);
const mentionRanks = rankArray(mentionRates);

// Spearman = Pearson correlation of the ranked arrays:
const spearmanR = sampleCorrelation(techRanks, mentionRanks);
console.log(`Spearman r = ${spearmanR.toFixed(3)}`);

if (spearmanR > 0.7) {
  console.log('✅ ACCEPTANCE GATE PASSED — Sprint 7 approved');
} else {
  console.error(`❌ ACCEPTANCE GATE FAILED (r=${spearmanR.toFixed(3)} < 0.7). Do NOT mark Sprint 7 complete.`);
  process.exit(1);
}
```

---

## 7. Claude Code prompt (paste this when starting Sprint 7)

```
We're building VisibleAU Sprint 7: Technical AI Infrastructure (Module 5b) + OSS additions.
This is the LARGEST sprint by effort (~130-180h at weekend pace). It's the v1.3 differentiator
the PRD calls out — without it, VisibleAU is "another audit dashboard." With it, it's "the
only tool that audits your site's AI-readiness AND your AI visibility."

Read CLAUDE.md + PRD §8 Module 5b + PRD §8.8 OSS-derived additions + PRD §11 expanded Sprint 7
scope + PRD §16 OSS reference strategy. Read the prototype lines 2458-2870.

Sprint 7 deliverables, in order:

1. SCHEMA + SEED
   - 4 new tables per §5
   - Seed 47 citability methods + 27 AI bots
   - Migrate
   - **EB4 fix — citability-methods/seed.ts content never specified. 47 methods must cite real Princeton KDD 2024 + AutoGEO ICLR 2026 data. Claude Code must NOT invent effect sizes.**

     Seed shape (`db/seed/citability-methods/seed.ts`):
     ```typescript
     export const CITABILITY_METHODS = [
       {
         methodKey: 'add-statistics-with-sources',
         title: 'Add cited statistics with source links',
         description: 'Include verifiable statistics with attribution (e.g. "73% of AU homeowners..." per ABS 2024).',
         source: 'Princeton KDD 2024',
         effectSizePct: 30.0,
         effectSizeNotes: '+30% visibility across 10,000 queries (Allen et al. 2024, arXiv:2404.11973)',
         appliesTo: ['ChatGPT', 'Perplexity', 'Gemini'],
       },
       {
         methodKey: 'add-expert-quotes',
         title: 'Add attributed expert quotes',
         description: 'Include direct quotes from named industry experts with credentials.',
         source: 'Princeton KDD 2024',
         effectSizePct: 41.0,
         effectSizeNotes: '+41% across 10,000 queries (Allen et al. 2024)',
         appliesTo: ['ChatGPT', 'Claude', 'Perplexity', 'Gemini'],
       },
       // ... remaining 45 methods — Sri to author from Princeton KDD 2024 + AutoGEO ICLR 2026 papers.
       // DO NOT have Claude Code invent effect sizes or source attributions.
       // Pull exact percentages from the published papers only.
     ];
     ```

2. CRAWLER FOUNDATION
   - lib/crawler/* — Playwright headless + cheerio parsing
   - Per-site budget: 20 pages max, 15s timeout, 5min total
   - Custom user-agent identifying VisibleAU bot
   - **EB2 fix — Playwright requires Chromium binaries (~120MB). Inngest workers are HTTP handlers, not Lambdas. This project deploys on Coolify/Hetzner VPS (a full VM, not AWS Lambda). Playwright CAN run on Coolify — but only if Chromium is pre-installed on the host.**

     Add to deployment/Dockerfile or Coolify build script:
     ```bash
     # Install Playwright Chromium (run once after pnpm install):
     pnpm exec playwright install chromium --with-deps
     ```

     In `lib/crawler/index.ts`, use `chromium.launch({ executablePath: process.env.CHROMIUM_PATH })` with a fallback to `playwright.chromium.executablePath()`. Set `CHROMIUM_PATH=/ms-playwright/chromium-*/chrome-linux/chrome` in the Coolify environment config.

     **Do NOT use Playwright inside `app/api/` Next.js route handlers** (those may be serverless on Vercel). Playwright only runs inside Inngest worker functions via `technical-audit-run.ts`.

3. MODULE 5b CORE — implement in this order:
   a. SSR check (simplest)
   b. Schema audit (parse JSON-LD, richness /16, reality-check by engine)
   c. robots.txt config (27-bot registry, CDN detection, generate recommended)
   d. Answer capsule formatter (find H2/H3 ending in "?", check 20-25 word capsule)
   e. llms.txt generator (last; depends on understanding the rest of the site)

4. OSS-DERIVED ADDITIONS
   - AI discovery endpoints check
   - Brand & Entity audit (ABN Lookup → Wikipedia AU → AU TLD → AU directory aggregate)
   - 47 citability methods catalogue surfaced
   - Negative signals detection (8 patterns)
   - Prompt injection detection (8 patterns)

5. AUDIT ORCHESTRATION
   - inngest/functions/technical-audit-run.ts — long-running (3-5 min/brand)
   - 8-dimension internal scoring + 5-category UX rollup
   - Persist to technical_audits + brand_entity_scores
   - **EE1 fix — `technical-audit-run.ts` Inngest function body never specified (same gap as Sprint 6 DD2):**
     ```typescript
     export const technicalAuditRun = inngest.createFunction(
       { id: 'technical-audit-run', timeoutMs: 5 * 60 * 1000 },
       { event: 'audit/start' },
       async ({ event, step }) => {
         const { brandId, organizationId, domain, auditId } = event.data;

         const crawl = await step.run('crawl-site', async () =>
           crawlSite(domain, { maxPages: 20, timeoutMs: 15_000 }));

         const [robots, llmsTxt, schema, ssr, meta, brandEntity, signals, aiDiscovery] =
           await Promise.all([
             step.run('score-robots',       () => analyzeRobots(crawl)),
             step.run('score-llms-txt',     () => scoreLlmsTxt(crawl)),
             step.run('score-schema',       () => scoreSchema(crawl)),
             step.run('score-ssr',          () => checkSSR(domain, crawl)),
             step.run('score-meta',         () => scoreMeta(crawl)),
             step.run('score-brand-entity', () => scoreBrandEntity(domain, crawl)),
             step.run('score-signals',      () => detectNegativeAndInjection(crawl)),
             step.run('score-ai-discovery', () => checkAiDiscovery(domain, crawl)),
           ]);

         const scoreComposite = robots.score + llmsTxt.score + schema.score + meta.score
                              + ssr.score + brandEntity.score + signals.score + aiDiscovery.score;

         await step.run('persist', async () => {
           await setRlsContext(db, organizationId);
           await db.insert(technicalAudits).values({
             brandId, organizationId, auditId,
             scoreRobots: robots.score, scoreLlmsTxt: llmsTxt.score, scoreSchema: schema.score,
             scoreMeta: meta.score, scoreContent: ssr.score, scoreBrandEntity: brandEntity.score,
             scoreSignals: signals.score, scoreAiDiscovery: aiDiscovery.score, scoreComposite,
             findings: { robots: robots.findings, llmsTxt: llmsTxt.findings, schema: schema.findings,
                         meta: meta.findings, content: ssr.findings, brandEntity: brandEntity.findings,
                         signals: signals.findings, aiDiscovery: aiDiscovery.findings },
             crawledAt: new Date(),
           });
           if (brandEntity.entityScore) {
             await db.insert(brandEntityScores).values({ brandId, ...brandEntity.entityScore });
           }
         });

         await inngest.send({ name: 'technical-audit.complete', data: { brandId, organizationId, auditId } });
       },
     );
     ```
     ```typescript
     // app/api/inngest/route.ts — update serve():
     import { technicalAuditRun } from '@/inngest/functions/technical-audit-run';
     import { corpusValidation } from '@/inngest/functions/corpus-validation';

     export const { GET, POST, PUT } = serve({
       client: inngest,
       functions: [
         runAudit,
         sendAuditCompleteEmail,
         generateRecommendations,   // Sprint 6 (DB5)
         technicalAuditRun,         // Sprint 7 — listens on audit/start (fires in parallel with runAudit)
         // ED2 fix: corpusValidation was added here by EA3 but corpus-validation.ts is a CLI acceptance
         // script (run via pnpm tsx tests/corpus/run-corpus.ts), NOT an event-triggered Inngest function.
         // Do NOT add corpusValidation to serve(). It has no event trigger and runs only once at acceptance time.
       ],
     });
     ```
     Both `runAudit` and `technicalAuditRun` listen to `{ event: 'audit/start' }`. Inngest correctly routes one event to all matching functions — both fire in parallel.

     **EB3 fix — `audit/start` event payload never specified. `technical-audit-run.ts` needs the brand domain to crawl:**

     The `audit/start` event payload (fired by Sprint 4's "Run Audit" button handler):
     ```typescript
     // Event fired from app/api/audits/route.ts (POST) or similar:
     await inngest.send({
       name: 'audit/start',
       data: {
         auditId: string,          // the newly-created audits row id
         brandId: string,          // brand being audited
         organizationId: string,   // tenant scoping
         domain: string,           // brand.domain — needed by crawler without a DB round-trip
         vertical: string,         // 'tradies'|'allied_health'|'saas' — for vertical pack selection
       },
     });
     ```
     `technical-audit-run.ts` reads `event.data.domain` directly — no additional DB query needed to start the crawl. If `domain` is not in the Sprint 3 payload, add it when extending the event in Sprint 7.

6. UI
   - /brands/[id]/technical-audit (8-dim drill-down + 5-cat toggle)
   - 5 dedicated screens per prototype (llms.txt, schema, SSR, answer capsules, robots.txt)
   - Brand & Entity audit screen
   - /methodology stub
   - **EC4 fix — `brand_entity_scores` has no FK to `technical_audits`. Join via `brandId + MAX(checkedAt)`:**
     The `technical-audit-run.ts` Inngest function persists to both tables in the same run.
     The technical-audit page retrieves both with:
     ```typescript
     const [latestTechAudit] = await db.select().from(technicalAudits)
       .where(eq(technicalAudits.brandId, brandId))
       .orderBy(desc(technicalAudits.createdAt)).limit(1);

     const [latestEntityScore] = await db.select().from(brandEntityScores)
       .where(eq(brandEntityScores.brandId, brandId))
       .orderBy(desc(brandEntityScores.checkedAt)).limit(1);
     ```
   - **EC5 fix — `technical-audit/page.tsx` server component fetch pattern never specified:**
     ```tsx
     // app/(auth)/brands/[brandId]/technical-audit/page.tsx — server component
     export default async function TechnicalAuditPage({ params }: { params: { brandId: string } }) {
       const currentUser = await getCurrentUser();
       if (!currentUser) redirect('/sign-in');
       await setRlsContext(db, currentUser.organizationId);

       const [techAudit] = await db.select().from(technicalAudits)
         .where(eq(technicalAudits.brandId, params.brandId))
         .orderBy(desc(technicalAudits.createdAt)).limit(1);

       const [entityScore] = await db.select().from(brandEntityScores)
         .where(eq(brandEntityScores.brandId, params.brandId))
         .orderBy(desc(brandEntityScores.checkedAt)).limit(1);

       if (!techAudit) {
         return <EmptyState message="No technical audit yet. Run an audit to see results." />;
       }

       const rollup = rollupTo5Categories(techAudit);  // EC1 formula
       return <TechnicalAuditView techAudit={techAudit} entityScore={entityScore} rollup={rollup} />;
     }
     ```

7. 50-SITE VALIDATION CORPUS — DO NOT SKIP
   - Author 50 fixture files
   - run-corpus.ts runs all 50 against mock LLM + technical audit
   - Spearman correlation between technical-rank and mention-rank
   - ACCEPTANCE GATE: Spearman > 0.7. If <0.7, do NOT mark sprint complete.

8. ATTRIBUTIONS.md
   - Auriti-Labs (MIT, attributed; 8-cat structure + 27 bots + 47 methods reference)
   - Princeton KDD 2024 + AutoGEO ICLR 2026 (citability methods)
   - Tinuiti / SE Ranking / Profound (research citations)
   - Full list per PRD §16
   - **EA5 fix — "Full list per PRD §16" is insufficient; Claude Code must invent citation text without the content. Canonical ATTRIBUTIONS.md for Sprint 7:**

     ```markdown
     # VisibleAU — Attributions

     Sprint 7 writes the first substantive entries (OSS reference layer for technical audit).

     ## OSS Reference Layer (Sprint 7)

     VisibleAU's technical audit module (Sprint 7) was informed by the following OSS projects
     and research publications. Per PRD §16 OSS-layer reference strategy: these are used as
     **reference implementations** (MIT licence permits copying with attribution), not runtime
     dependencies. All code is independently re-implemented with a 50-site validation corpus.

     ### Auriti-Labs/geo-optimizer-skill (MIT Licence)
     - Source: https://github.com/Auriti-Labs/geo-optimizer-skill
     - Used as reference for: 8-category scoring structure, 27 AI bot registry, 47 citability
       methods taxonomy, SARIF/JUnit/GHA output format concepts.
     - Sprint 7 re-implements these independently with AU-localised Brand & Entity scoring.

     ### Princeton KDD 2024 — "GEO: Generative Engine Optimization"
     - Authors: Allen et al. (2024). arXiv:2404.11973
     - Used as reference for: 47 citability methods effect-size deltas.

     ### AutoGEO ICLR 2026
     - Authors: [AutoGEO team]. ICLR 2026 workshop proceedings.
     - Used as reference for: complementary citability methods (supplements Princeton KDD).

     ### Tinuiti — AI Citation Report Q1 2026
     - Source: https://tinuiti.com/research/ (internal research report)
     - Used as reference for: Reddit 24% Perplexity citation share; Medium/Gemini preference.

     ### SE Ranking — AI Mode Citation Analysis (Dec 2025)
     - Source: https://seranking.com/blog/ai-overviews-study/
     - Used as reference for: FAQ schema impact data; schema richness scoring benchmarks.

     ### TEAM LEWIS — Earned Media GEO Study
     - Source: https://teamlewis.com/research/ (research report)
     - Used as reference for: press mentions as GEO lever.

     ### Profound — LinkedIn AI Citation Surge
     - Source: https://www.profound.com/research/ (research report)
     - Used as reference for: LinkedIn as emerging AI citation source.

     (Further attributions added in Sprints 8, 9, 11, 12 per PRD §16 matrix.)
     ```

9. TESTS
   - Unit per §4 (~30 files)
   - Integration: full crawl + 8-dim audit completes <5min per site
   - E2E: navigate every Module 5b screen, drill into dimensions, download llms.txt
   - Corpus regression: pnpm test:corpus passes Spearman > 0.7

POTENTIAL BLOCKERS:
- Playwright cold-start at scale — pre-warm browsers in Inngest worker
- ABN Lookup + Wikipedia API rate limits — cache aggressively
- First corpus run may be <0.7 — SIGNAL to tune scoring, not lower the threshold
- Large site crawls — respect 20-page budget, log truncations
- Cloudflare bot challenges — legit UA + robots.txt respect + 403 backoff

Start with step 1. Don't proceed past step 2 (crawler) until it handles 10 diverse domains
reliably. The corpus gate (step 7) is non-negotiable for sprint acceptance.
```

---

## 8. Tests required

- Unit: per §4 (~30 test files)
- Integration: crawler + each dimension orchestration
- E2E: navigate Module 5b screens + Brand & Entity audit + verify scoring renders
- **Corpus regression:** `pnpm test:corpus` runs 50-site corpus, asserts Spearman > 0.7

---

## 9. Acceptance criteria

- [ ] 4 new tables migrated + seeded (47 methods + 27 bots)
- [ ] Crawler reliably handles 10 diverse test domains within budget
- [ ] 5 Module 5b core features functional (llms.txt, robots.txt, schema, SSR, answer capsules)
- [ ] 10 OSS-derived additions functional
- [ ] 8-dimension internal scoring + 5-category UX rollup both render correctly
- [ ] `/methodology` page shows top-10 citability methods (full 47 in Action Center)
- [ ] **Spearman correlation > 0.7** on 50-site corpus
- [ ] ATTRIBUTIONS.md complete + accurate
- [ ] No regression on Sprint 1-6 tests
- [ ] CI green

---

## 10. Common pitfalls / Sprint 7 anti-patterns

- **Do not** skip the 50-site corpus. Spearman > 0.7 is the only honest acceptance gate.
- **Do not** import Auriti-Labs or any OSS GEO/AEO repo as production dependency. PRD §16 is explicit: reference-only, re-implement, attribute. 1,189 mocked tests ≠ production validation.
- **Do not** generate llms.txt that "games" the LLM (misleading summaries to get cited). PRD §8 anti-pattern. Generate honest, structured summaries.
- **Do not** lower the Spearman threshold to make Sprint 7 pass. If <0.7, fix scoring weights or corpus, not threshold.
- **Do not** crawl >20 pages per site without explicit operator approval. AU SMB sites ~30-100 pages; crawling all = legal/ethics + cost.
- **Do not** ship CDN detection without testing against real Cloudflare/Akamai/Vercel-protected AU SMB sites. False positives erode trust.
- **Do not** conflate this 8-dim scoring with Sprint 3's 5-dim audit-results scoring. They measure different things (site configuration vs brand performance on AI queries). UI must clearly separate.

---

## 11. Handoff to Sprint 8

Ready:
- ✓ Site crawler infrastructure — Sprint 8 Local SEO reuses for GMB/NAP checks
- ✓ Brand & Entity audit — Sprint 8 adds GMB completeness on top
- ✓ `technical_audits` rows persist — Sprint 8 drift detection compares consecutive

Not ready:
- Local SEO Module 4 (Sprint 8)
- Drift detection across audits (Sprint 8)
- SARIF/JUnit/GHA exports working (Sprint 8 ships them)
- Webhook integrations (Sprint 8)

---

## Changelog

- v1.10 (18 May 2026): **Eighth-pass audit — schema richness formula, aiDiscovery weights, prototype M01 field names, extractContent callers, scoreRobots components (EH1-EH5).** **(EH1)** §4 richness-score.ts: 4 types × 4pts = /16 — 1pt presence + 1pt entity-linking + 1pt ≥5 attrs + 1pt ≥10 attrs per type. **(EH2)** §4 ai-discovery/endpoints.ts: .well-known/ai.txt(3pts) + 3 JSON endpoints(1pt each) = /6 — primary standard weighted 3×; binary pass/fail per endpoint. **(EH3)** Prototype CitabilityMethodsReference: `id`/`name`/`delta` corrected to `methodKey`/`title`/`effectSizePct` matching `citability_methods` schema; `key={m.methodKey}` replaces `key={m.id}`; `+{n}%` formatted from numeric effectSizePct. **(EH4)** §4 extract-content.ts: ExtractedContent type specified; 3 callers identified — negative-signals (thin content/keyword stuffing/byline), answer-capsules/find-questions, llms-txt/generate; called once per crawled page, cached in CrawlResult. **(EH5)** §5 scoreRobots /18: 6 components × 3pts specified — robots.txt present, Tier 1 bots allowed, no blanket AI block, sitemap declared, CDN not blocking, Tier 1 not explicitly Disallowed.
- v1.9 (18 May 2026): **Seventh-pass audit — scoreContent formula, scoreMeta weights, sub-page fetch, answer-capsules route, citability-methods route (EG1-EG5).** **(EG1)** §5 scoreContent /12: SSR(0-6) + answerCapsulePct×6 formula specified — SSR binary maps to 6/3/0 pts; capsule pass rate × 6; sum = /12. **(EG2)** §5 scoreMeta /14: per-signal weights — title(4)+description(3)+og(3)+canonical(2)+hreflang(2)=14; integer weights based on citation signal importance. **(EG3)** §4 sub-page fetch: all 6 dimension sub-pages read from `technical_audits.findings[key]` — no re-crawl on page load; pattern specified with `EmptyState` when no audit exists; findings sub-key per page listed. **(EG4)** §4 API: `answer-capsules/generate/route.ts` added to project structure — EF3 referenced this endpoint but it was absent; POST handler for on-demand Claude haiku rewrite. **(EG5)** §4 API: `citability-methods/route.ts` body specified — auth required; Free→top-10, Starter+→all 47; no setRlsContext (global data, RLS disabled).
- v1.8 (18 May 2026): **Sixth-pass audit — bot tier taxonomy, SSR detection, answer-capsule AI model, ABN Lookup API, schema reality-check (EF1-EF5).** **(EF1)** §4 ai-bots seed: taxonomy corrected to match prototype — Training/Search-AI/User-agent crawlers (9/9/9) vs EC3's Must-allow/Emerging/Data-crawlers (7/13/7); all 27 bot names now match prototype display groups. **(EF2)** §4 ssr-check/per-page.ts: two-pass Playwright method specified — parallel contexts with javaScriptEnabled true/false; SSR if noJsText/jsText ratio >0.7; homepage only (not all 20 pages). **(EF3)** §4 answer-capsules/generate-capsule.ts: on-demand only (not during crawl); claude-haiku-4-5-20251001; POST /api/answer-capsules/generate endpoint; cost ~0.1¢/rewrite. **(EF4)** §4 brand-entity/abn-lookup.ts: ABN Lookup API URL, response JSON shape, error cases (not found/429/network) specified. **(EF5)** §4 schema-audit/reality-check.ts: SE Ranking Dec 2025 source citation + per-engine copy hardcoded as const; update each sprint with new research.
- v1.7 (18 May 2026): **Fifth-pass audit — technical-audit-run.ts body, negative-signals detection, prompt-injection detection, 5 vs 4 brand signals, GET route (EE1-EE5).** **(EE1)** §7 step 5: `technical-audit-run.ts` Inngest step sequence specified — crawl-site → 8 parallel dimension steps → persist to both tables → emit `technical-audit.complete`; same structural pattern as Sprint 6 DD2. **(EE2)** §4 negative-signals/patterns: detection logic specified for all 8 — thresholds, CSS selectors, DOM queries (CTA overload, popup density, thin content, keyword stuffing, missing author, boilerplate ratio, broken outbound links, ad density). **(EE3)** §4 prompt-injection/patterns: detection logic specified for all 8 — regex patterns, Unicode ranges, CSS checks (hidden text, invisible Unicode, LLM-instruction text, HTML comment injection, monochrome text, micro-font, data-attr, aria-hidden abuse). **(EE4)** §4 brand-entity/score.ts: clarified 4 data sources not 5 — prototype row 5 "Australian Business Register match" is sub-detail of ABN Lookup (same API call); score composition /10 = ABN(3)+Wikipedia AU(3)+AU TLD(2)+Directory(2). **(EE5)** §4 API: `GET /api/technical-audits/[id]` route body specified — auth+setRlsContext+RLS cross-org protection.
- v1.6 (18 May 2026): **Fourth-pass audit — depth chars vs words, corpus-validation CLI, Spearman call, robots.txt section-only, corpus domains (ED1-ED5).** **(ED1)** §4 depth-score.ts: component 5 corrected to ≥1500 chars (total file) matching prototype — EC2 said avg section body ≥50 words which conflicts with prototype's character-count display. **(ED2)** §7 step 5: `corpusValidation` removed from `serve()` — corpus runner is a CLI acceptance script (`pnpm tsx tests/corpus/run-corpus.ts`), not an event-triggered function; no event trigger exists for it. **(ED3)** §6: Spearman implementation specified — `rankArray` helper + `sampleCorrelation(techRanks, mentionRanks)` from simple-statistics; `process.exit(1)` on failure prevents accidental sprint sign-off. **(ED4)** §4 generate.ts: robots.txt generate mode specified as AI-bot section only (appendable block) — full replacement would overwrite customer Disallow rules, breaking SEO. **(ED5)** §6 corpus fixtures: all 50 domains flagged as "Sri to author with real live sites" — invented domains return empty crawl results; Spearman cannot be computed without real crawl data.
- v1.5 (18 May 2026): **Third-pass audit — 8→5 rollup formula, llms.txt depth components, 27 bot names, brand_entity join, technical-audit page (EC1-EC5).** **(EC1)** §4 score-aggregator.ts: 8→5 rollup formula from PRD §16 Gap D now specified — Technical=(Robots+llmsTxt+AIDiscovery+Signals)/48×100; Content=(Content+Meta)/26×100; Authority=BrandEntity/10×100; Schema=Schema/16×100; Performance=null stub. **(EC2)** §4 depth-score.ts: 6 component criteria specified — each 3pts binary (0 or 3): present/H1+blockquote/sections/links/depth/llms-full.txt. **(EC3)** §4 ai-bots seed: all 27 bot names specified across 3 tiers — Tier 1 (7 must-allow), Tier 2 (13 emerging), Tier 3 (7 data crawlers); seed schema shape added. **(EC4)** §7 step 6: brand_entity_scores join via brandId+MAX(checkedAt) specified — no FK to technical_audits; both retrieved with separate orderBy(desc(createdAt)).limit(1) queries. **(EC5)** §7 step 6: technical-audit page.tsx server component pattern specified — setRlsContext + two ordered queries + rollupTo5Categories + EmptyState when no audit exists.
- v1.4 (18 May 2026): **Second-pass audit — barrel exports, Playwright runtime, audit/start payload, citability seed shape, findings jsonb type (EB1-EB5).** **(EB1)** §5: barrel exports specified for all 4 new tables; RLS policy matrix added (technical_audits+brand_entity_scores ENABLE, citability_methods+validation_corpus_results DISABLE). **(EB2)** §7 step 2: Playwright runtime clarified — Coolify VPS supports Chromium binaries (not Lambda); `playwright install chromium` in Dockerfile; only runs inside Inngest worker, not Next.js API routes. **(EB3)** §7 step 5: `audit/start` event payload specified — `{ auditId, brandId, organizationId, domain, vertical }`; `technical-audit-run.ts` reads `event.data.domain` directly without a DB round-trip. **(EB4)** §7 step 1: citability-methods seed shape specified — 2 sample rows shown; remaining 45 flagged "Sri to author from published papers only; DO NOT invent effect sizes." **(EB5)** §5 technical_audits findings: full TypeScript type definition for all 8 dimension findings objects.
- v1.3 (18 May 2026): **First-pass audit — boolean columns, updatedAt+RLS, serve() registration, composite formula, ATTRIBUTIONS content (EA1-EA5).** **(EA1)** §5 brand_entity_scores: `abnVerified` and `wikipediaAuPresent` changed from `text().default('false')` to `boolean().default(false)` — Drizzle has a native boolean type; text forced string comparisons throughout. **(EA2)** §5 technical_audits: `updatedAt` timestamp added; RLS SQL specified — tenant data needs both. **(EA3)** §7 step 5: `technicalAuditRun` + `corpusValidation` added to `serve()` array — Inngest cannot route `audit/start` to `technical-audit-run.ts` without registration; both `runAudit` and `technicalAuditRun` can listen to the same event (Inngest fans out correctly). **(EA4)** §5 technical_audits `scoreComposite`: formula specified — sum of 8 raw dimension scores (already on shared 100-pt scale); do NOT normalise; computed in `score-aggregator.ts`. **(EA5)** §7 step 8: canonical ATTRIBUTIONS.md content specified — 7 OSS sources with real URLs, licence notes, and usage descriptions; prevents Claude Code from fabricating attribution text.

---

- v2.2 (13 May 2026): **Third-pass-fix audit B2.** `technical_audits` schema gained `auditId: uuid('audit_id').references(() => audits.id)` (nullable). This is required so Sprint 4's audit-list can show a "+ technical audit" badge alongside the multidim audit row — without the FK, the join would be a fragile `(brand_id, created_at within 10min)` heuristic. The N3 design decision (Run Audit triggers both) is now schema-supported. Two indexes added: `(auditId)` for audit-list joins, `(brandId, createdAt DESC)` for brand-level history.
- v2.1 (13 May 2026): **Second-pass-fix audit N3.** Added explicit audit-flow design decision to header: technical audit runs in parallel with Sprint 3's multidim audit, triggered by the same `audit/start` Inngest event; shared quota; per-audit cost budget rises to <US$3.50 to cover site-crawler cost. Clarified `technical-audit-run.ts` is fired by the SAME event as `run-audit.ts`. CLAUDE.md §2 carries the matching design note.
- v2.0 (12 May 2026): **Complete rewrite per conflict-audit C4 + H1.** Sprint 7 v1.0 had Local SEO + 50-site corpus at ~22h. PRD §11 says Sprint 7 = Module 5b core + OSS additions at ~22 days (130-180h at weekend pace). v2.0 implements PRD canonical: 5 core features (llms.txt, robots.txt, schema, SSR, answer capsules) + 10 OSS-derived additions (CDN check, AI discovery, AU Brand & Entity, 47 methods, 8 negative signals, 8 prompt injection patterns, 27 AI bots, schema richness, llms.txt depth, 8-internal→5-surfaced rollup) + 50-site corpus with Spearman > 0.7 gate. Local SEO moved to Sprint 8.
- v1.0 (12 May 2026): Initial. **Conflict: missed Module 5b entirely.**
