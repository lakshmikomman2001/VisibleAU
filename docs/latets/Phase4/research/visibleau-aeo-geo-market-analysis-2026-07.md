# VisibleAU — AEO / GEO Market Analysis

**Prepared:** 5 July 2026
**Scope:** What has changed in the Answer Engine Optimization (AEO) / Generative Engine Optimization (GEO) / AI-visibility space in H1 2026, filtered for direct relevance to VisibleAU (an AU-first AI-visibility auditing micro-SaaS for Australian SMBs and agencies).
**Method:** Web research across ~50 sources (vendor reports, platform announcements, analyst notes, AU-specific surveys), July 2026.
**Sourcing caveat (read first):** A large share of the figures below originate from vendor blogs with an incentive to overstate the AI channel shift. Treat specific percentages as **directional, not precise**. The *direction* of each finding is corroborated across multiple independent sources even where individual numbers vary. Platform announcements (OpenAI, Google, Shopify, Anthropic) and named research houses (Ahrefs, Roy Morgan, McKinsey, SurferSEO, Cloudflare, Gartner) are higher-confidence than marketing pages.

---

## Executive summary

The category has matured from "is AI search real?" to a crowded, well-funded tooling market — and, importantly for VisibleAU, a market with one consistent, unfilled gap and one geography nobody is serving.

**The five shifts that matter:**
1. **Google made "GEO is still SEO" official, and llms.txt was debunked.** Google's 2026 documentation says you don't need llms.txt; Ahrefs found 97% of llms.txt files get zero AI-bot requests. → Reposition VisibleAU's llms.txt/Signals dimension.
2. **ChatGPT ads launched (Feb 2026) with "Answer Independence"** — you cannot pay to change the answer, only show ads beside it. → Tailwind for organic-visibility tooling.
3. **Agentic commerce went live and is an organic-discovery game** — Shopify Agentic Storefronts default-on for 5.6M merchants; product results are organic and unsponsored. → New "AI shopping visibility" surface; agent-readiness is on-trend.
4. **The "Big 1" became the "Big 4"** — ChatGPT's AI-referral share fell from ~89% to ~63%; Claude surged to ~18%. → Rebalance engine weighting toward Claude.
5. **Ranking and citation have decoupled; query fan-out is why** — only ~12–17% of AI Overview citations rank in Google's top 10; AI Mode fires 9–11 sub-queries per prompt. → VisibleAU's fan-out simulation is on-trend and rare.

**The strategic openings for VisibleAU:**
- **Action layer = the market's #1 gap.** Every buyer's guide says the leaders "diagnose but don't fix." VisibleAU's Phase 2 (remediation tasks, drafts, workflow, reports) is exactly that layer.
- **SMB-first is underserved.** The major tools are priced/built for teams with analysts; SMBs are told to buy a one-time audit instead — VisibleAU's model.
- **AU-first is a genuine moat.** No competitor is AU-specific, and AU has a favourable adoption + data-sovereignty + service-business-conversion mix.

---

## 1. Market context

AI-assisted search is now a structural channel, not a novelty. Gartner has projected AI assistants will handle roughly a quarter of searches in 2026 and more than half by 2028. Consumer signals: ChatGPT reached ~900M weekly active users by February 2026, Google's AI Overviews reach ~2.5B people monthly, and AI Mode passed ~1B monthly users. Roughly a third of consumers now begin searches with an AI tool rather than a traditional engine.

Two facts frame the opportunity:
- **Volume and value have decoupled.** Traditional Google organic still sends the overwhelming majority of referral clicks (Cloudflare Radar put Google at ~87.5% of global referral traffic, April 2026), but AI referrals convert far better — reportedly **4.4x–9x higher for service businesses**, and AI referral traffic to US retail grew ~693% YoY over the 2025 holiday season, converting ~31% better than non-AI traffic (Adobe Digital Insights, Jan 2026).
- **The first-mover window is still open.** Only ~14% of marketers currently track AI-search performance (Conductor, 2026). Measurement adoption lags the behavioural shift — which is the window VisibleAU is selling into.

---

## 2. The five shifts since early 2026

### 2.1 Google: "GEO is still SEO" — and llms.txt debunked
In 2026 Google Search Central published "Optimizing your website for generative AI features," stating that optimizing for generative AI search *is* optimizing for the search experience, and is therefore still SEO — the first time Google put that position in official documentation. Google also explicitly told publishers they do **not** need to create llms.txt files, because Google Search doesn't use them.

The data backs the caution. Ahrefs analysed 137,000 domains (May 2026) and found **97% of llms.txt files received zero requests from AI retrieval bots**; PerplexityBot, OAI-SearchBot and Claude-SearchBot combined accounted for ~1.1% of requests. A widely-cited framing: most of GEO is ~70% the SEO fundamentals done well, and ~30% genuinely new moves.

**VisibleAU implication:** The Sprint 7 llms.txt generator should be **repositioned, not removed**. It's cheap to keep, and a minority of crawlers do read it, but presenting it as "foundational" is now a credibility risk. Reweight the llms.txt/Signals contribution down in the composite, and consider an in-product honesty note that Google states it's unnecessary. Lean the overall narrative toward fundamentals + off-site signals.

### 2.2 ChatGPT ads + "Answer Independence"
OpenAI launched ChatGPT advertising on **9 February 2026** (announced 16 January), initially for US users on the Free and Go tiers (Plus/Team/Enterprise remain ad-free). By May 2026 there was a self-serve OpenAI Ads Manager with CPC/CPM bidding and no minimum spend; OpenAI reportedly generated ~$100M in the first six weeks. Google is responding with ads across AI Overviews and AI Mode.

The load-bearing detail: OpenAI's **"Answer Independence" principle** means ads never influence the AI's actual response — advertisers cannot pay to change what ChatGPT says, only whether a labelled ad appears alongside. Australia is expected to get access slightly later than the US.

**VisibleAU implication:** This is a **tailwind**, not a threat. Because the answer itself can't be bought, organic AEO/GEO is the only lever for the recommendation — which is precisely what VisibleAU measures and improves. A future reporting angle: help brands understand organic vs paid presence, and use strong organic visibility to reduce ad dependence.

### 2.3 Agentic commerce went live — and it's organic discovery
The biggest new *surface*. Shopify turned on **Agentic Storefronts by default for ~5.6M merchants on 24 March 2026**, making products discoverable in ChatGPT, Copilot, Gemini and AI Mode with no setup; Shopify reported AI-referred traffic up ~7x and AI-attributed orders up ~11x since Jan 2025. ChatGPT's Instant Checkout (launched Sept 2025 with Etsy, expanded Feb 2026) runs on the **Agentic Commerce Protocol (ACP)**, co-developed by OpenAI and Stripe and open-sourced.

Ranking logic mirrors VisibleAU's thesis: OpenAI states product results are **organic and unsponsored, ranked purely on relevance**, and that paying does not influence results (Instant Checkout items are "not preferred"). The protocol stack: **ACP** (Stripe/OpenAI, ChatGPT checkout), **UCP** (Google/Shopify, full journey), **MCP** (Anthropic, real-time inventory/pricing/product data connectivity). Market sizing: McKinsey projects **$3–5T** globally by 2030; eMarketer estimated ~$20.9B of AI-platform retail spend in 2026.

**Reality check:** the hype is ahead of the plumbing. OpenAI quietly pulled native in-chat Instant Checkout in March 2026 because fewer than 30 Shopify merchants had gone live; today it's mostly **discovery + redirect** to the merchant site, not in-chat checkout at scale. LLMs were never designed for commerce, and the product-data plumbing is still being built.

**VisibleAU implication:** The *discovery* layer — does an AI recommend your product — is core VisibleAU territory, now extended to shopping. This validates the Sprint 6 **agent-readiness** direction and opens a concrete new feature: **AI Shopping Visibility for AU e-commerce SMBs** (does your product get recommended in ChatGPT/Gemini shopping queries), extended to ACP/UCP/MCP product-feed readiness. AI surfaces reward clean, structured, real-time product attributes.

### 2.4 The "Big 1" became the "Big 4" (Claude is the mover)
Goodie's Wave 2 referral panel: ChatGPT's share of measurable B2B AI referrals fell from **89.1% (Aug 2025) to 62.6% (Mar–Apr 2026)**, while **Claude rose from 1.4% to 18.5%** (April raw share 27.2%), Gemini reached ~10.6% and Perplexity ~7.3%. Four engines now split ~99% of AI referrals. Cloudflare Radar flagged Claude-SearchBot as among the most active AI retrieval crawlers (May 2026). Distribution shifts compound this: Apple confirmed a deal embedding Google's Gemini into Siri/Apple Intelligence (Jan 2026), reaching 2B+ devices.

**VisibleAU implication:** The four-engine coverage (ChatGPT, Claude, Gemini, Perplexity) maps exactly onto the "Big 4," but the **weighting should shift toward Claude** in scoring/reporting. Keep an eye on Perplexity's drift downward.

### 2.5 Rank ≠ citation, and query fan-out is the mechanism
Two independent studies found ranking and AI citation have decoupled: BrightEdge found only ~17% of AI Overview citations come from pages in Google's organic top 10; a Moz analysis of ~40,000 AI Mode queries found ~12%. The mechanism is **query fan-out**: Google AI Mode decomposes one prompt into **9–11 parallel sub-queries** (ChatGPT ~2.3–2.8), so content ranking only for the surface query misses 8–10 citation opportunities. It's measurable: a SurferSEO study of 173,902 URLs found a **0.77 correlation** between the number of fan-out queries a page ranks for and its probability of being cited in AI Overviews. Practitioner guides now explicitly recommend **simulating the fan-out** to check coverage — and pages cited in AI Overviews see CTR lift of ~35%.

**VisibleAU implication:** The Sprint 3 **fan-out simulation is genuinely on-trend and rare** — most competitors do citation tracking, not fan-out simulation. Surface it as a headline differentiator, and consider scoring "answer-cluster coverage" (does the brand's content answer the sub-query set) rather than single-query presence.

---

## 3. Competitive landscape

**The players (tiers):**
- **Enterprise:** Profound (~$155M raised, ~$1B valuation; differentiator = "Prompt Volumes" / search-demand intelligence; ~$499+/mo), AthenaHQ, Brandlight, Bluefish, Evertune.
- **Mid-market:** Peec AI (Berlin; ~$29M raised; unlimited seats; UI-scraping for accuracy; ~€89–199/mo), Scrunch (persona/funnel modelling; ~$250+/mo), Goodie AI (AI-shopping visibility; ~$295–495/mo).
- **Entry / SMB-adjacent:** Otterly (Austria; Gartner Cool Vendor 2025; GEO audit + monitoring; ~$29/mo), plus budget challengers (Rankscale, Sanbi.ai ~$37/mo, Knowatoa, GetCito ~$19/mo).
- **SEO incumbents with bolt-ons:** Semrush AI Visibility Toolkit (~$99/mo), Ahrefs Brand Radar; HubSpot (free AEO Grader + ~$50/mo monitoring). "Shallow but bundled."

**Feature table-stakes in 2026:** multi-model tracking (ChatGPT, Perplexity, Gemini, Claude, AI Overviews, AI Mode, Copilot, DeepSeek, Grok), share-of-voice, competitor benchmarking, brand-mention vs source-citation distinction, sentiment, GEO/AEO audit (on-page factors), white-label reporting + delivery scheduling.

**Emerging differentiators:** prompt/demand volumes (Profound), persona/funnel modelling (Scrunch), UI-scraping vs API for accuracy (Peec/Profound/ZipTie), source-level citation URLs (Airefs), AI-shopping visibility (Profound/Goodie/Brandlight — ChatGPT Shopping, Amazon Rufus), Looker Studio connectors, hallucination detection (some lack it).

**The two gaps VisibleAU exploits:**
1. **The action-layer gap (universal critique).** Buyer's guides repeatedly conclude the leaders "diagnose the problem but don't fix it" — they track citations but leave content, schema, and authority-building to the customer. Measurement without action is "theater." **This is exactly VisibleAU's Phase 2.**
2. **The SMB gap.** Multiple vendors state that SMBs who've never measured AI visibility shouldn't start with any major tool — they should buy a one-time audit first. **This is VisibleAU's audit-first, SMB-first model.**

---

## 4. The Australian market — VisibleAU's moat

No competitor above is AU-specific, and three AU dynamics compound in VisibleAU's favour:

- **Broad, mainstream adoption.** 58% of Australians aged 14+ (13.6M) used AI tools in an average four weeks (Roy Morgan, Q1 2026): ChatGPT ~45% (10.5M), Gemini ~21% (5M), Copilot ~17% (4M). Usage peaks at 74% among 25–34s and 72% among 35–49s.
- **The "Micro-Gap" — the underserved ICP.** 64% of Australian SMBs use AI regularly (up from 39% in mid-2024), but **micro-businesses sit at just ~33%**, mostly using free consumer-grade ChatGPT rather than systematic integration; owners act as their own CIOs. This is precisely VisibleAU's underserved target.
- **Data sovereignty tailwind.** Data privacy is the "sleeper issue" of 2026 — ~89% of employees concerned about misuse — driving migration toward private "Enterprise AI," alongside a government "Sovereign AI Capability" push. VisibleAU's on-shore data, ABN validation, AUD pricing, and local-compliance posture align with this sentiment.
- **Service-business economics.** AI search reportedly converts **4.4x–9x higher for service businesses** — ideal for VisibleAU's tradie/local-service SMB segments.

Competitor pricing is US/EU-centric, so VisibleAU's AU cost structure and compliance are hard for incumbents to replicate quickly.

---

## 5. Implications for VisibleAU (prioritized)

### 5.1 Validated — lean in
- **Make the action layer the headline.** Position as "we tell you what to fix and draft it," not "another dashboard." This is the market's single clearest unmet need.
- **Promote fan-out simulation** as a differentiator; move toward scoring answer-cluster coverage over single-query presence.
- **Keep Big-4 engine coverage; rebalance weighting toward Claude** given its surge.
- **Double down on AU-first + SMB-first + audit-first** — the intersection nobody else occupies.

### 5.2 Re-evaluate
- **Reposition the llms.txt generator / Signals dimension.** Keep it (cheap; some crawlers use it) but stop framing it as foundational; reweight down; add an honest in-product note re Google's stance. Overselling it is now a credibility risk.
- **Reframe the overall value narrative around fundamentals + off-site signals** (matching Google's official position), not "GEO hacks."
- **Frame organic visibility against the new ads reality** — since answers can't be bought, strong organic presence is the durable lever.

### 5.3 New opportunities to scope
1. **AI Shopping Visibility for AU e-commerce SMBs** — product-recommendation tracking in ChatGPT/Gemini shopping queries; extend Sprint 6 agent-readiness to ACP/UCP/MCP product-feed readiness. Nobody does this AU-first.
2. **Content-freshness signal** — content <30 days old reportedly earns ~3.2x more citations; a staleness flag is a cheap, high-signal addition.
3. **Reviews/UGC as a trust dimension** — LLMs increasingly treat aggregated review sentiment as "ground truth," defaulting to it when brand claims conflict; review velocity/quality is a scoreable signal.
4. **Prompt/demand intelligence** — even a lightweight version of Profound's "how many users ask this" turns audits into demand data.
5. **AI-mediated attribution** — AI discovery/purchase is largely invisible to standard analytics; VisibleAU's earlier AI-traffic-attribution work is increasingly valuable, especially for the agentic-commerce subset.

---

## 6. Watch-list (re-check quarterly)
- ChatGPT ads rollout to Australia (timing + formats).
- Claude's share trajectory (consolidating or still taking from ChatGPT).
- Agentic-commerce protocol consolidation (ACP vs UCP; whether native in-chat checkout matures).
- Any AU-specific AI-search or data-residency regulation.
- Whether Google/OpenAI change stance on machine-readable markup (llms.txt et al).

---

## Appendix — Sources

Platform / primary:
- OpenAI — "Buy it in ChatGPT: Instant Checkout and the Agentic Commerce Protocol." https://openai.com/index/buy-it-in-chatgpt/
- Shopify — "Millions of merchants can sell in AI chats" (Agentic Storefronts). https://www.shopify.com/news/agentic-commerce-momentum ; "Agentic Commerce: Benefits & How To Get Started (2026)." https://www.shopify.com/blog/agentic-commerce
- Google Search Central — "Optimizing your website for generative AI features" (2026) [referenced via Search Engine Journal / AIThinkerLab].

Research / analyst:
- Ahrefs (via AMA SF) — llms.txt bot-request analysis, May 2026. https://www.amasf.org/blog/generative-engine-optimization-what-geo-and-aeo-require/
- Roy Morgan — AI tools usage, March 2026. https://www.roymorgan.com/findings/10248-artificial-intelligence-ai-tools-usage-march-2026
- Goodie — "2026 AI Search Traffic Report: ChatGPT Is Slipping." https://higoodie.com/blog/ai-search-traffic-report-2026/
- AI Lab Australia — "2026 State of AI Adoption in Australian SMBs." https://www.ailabaustralia.com/blog/ai-adoption-australian-smbs-2026
- roi.com.au — "AI Usage & Adoption Statistics in Australia (2026)." https://roi.com.au/blog/stats/ai-usage-adoption-statistics-in-australia-2026
- Omnibound — "AI Search Statistics (2025–2026)." https://www.omnibound.ai/blog/ai-search-statistics
- SEO Sherpa — "AI Search Statistics 2026." https://seosherpa.com/ai-search-statistics/

Query fan-out:
- Search Engine Land — "Query fan-out in AI search." https://searchengineland.com/guide/query-fan-out
- upGrowth — "Query Fan-Out Explained: AI Mode + ChatGPT [2026]." https://upgrowth.in/query-fan-out-google-ai-mode-chatgpt-explained/
- LinkSurge — "What Is Query Fan-Out?" (SurferSEO correlation). https://linksurge.jp/blog/en/query-fan-out-guide-2026/

Agentic commerce:
- Opascope — "AI Shopping Assistant Guide 2026." https://opascope.com/insights/ai-shopping-assistant-guide-2026-agentic-commerce-protocols/
- Ekamoira — "ChatGPT Instant Checkout: ACP Protocol Retailer Guide (2026)." https://www.ekamoira.com/blog/chatgpt-instant-checkout-agentic-commerce-protocol-2026
- Fast Company — "Shop 'til you bot" (Instant Checkout reality check). https://www.fastcompany.com/91533534/

ChatGPT ads:
- AdVenture Media — "ChatGPT Ads Launch 2026." https://adventuremedia.ai/blog/chatgpt-ads-launch-2026-everything-us-businesses-need-to-know
- 2Point Agency — "ChatGPT Advertising: The Complete 2026 Guide." https://www.2pointagency.com/guides/

Competitive landscape:
- Surmado — "Best AI Visibility Tools 2026." https://www.surmado.com/blog/best-ai-visibility-tools-2026
- getairefs — "12 Best AI Search Visibility Tools in 2026." https://getairefs.com/blog/ai-search-visibility-tools/
- Loamly — "The Complete Comparison of AI Search Visibility Tools: 2026 Buyer's Guide." https://www.loamly.ai/blog/comparison-ai-search-visibility-tools-2026-buyers-guide
- Slate — "Top AI Visibility Tools for Marketing Agencies in 2026." https://slatehq.com/blog/ai-visibility-tools
- Sanbi.ai — "AI Visibility Platform Comparison 2026." https://sanbi.ai/blog/ai-visibility-platform-comparison-peec-profound-scrunch

Reference / definitional:
- Wikipedia — "Generative engine optimization." https://en.wikipedia.org/wiki/Generative_engine_optimization
- LLM Pulse — "GEO: The Complete Guide for 2026." https://llmpulse.ai/blog/geo-guide/

*All figures are as reported by the sources above on the dates noted; percentages should be read as directional. Re-verify before using any specific number in customer-facing material.*
