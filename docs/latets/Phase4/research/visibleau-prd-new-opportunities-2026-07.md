# VisibleAU — PRD: New Opportunities

**Version:** 0.1 (draft for review)
**Date:** 5 July 2026
**Status:** Proposed — not yet scheduled against the Phase 2 build
**Owner:** Sri
**Related canon:** Phase 2 7-layer LLD (Sprint 6 = Retrieval Intelligence + Agent Readiness, tables 8–11); Platform Foundation (Sprint 1); `visibleau-aeo-geo-market-analysis-2026-07.md`

**Sourcing caveat (read first):** Market figures below come from a mix of platform announcements (high confidence), named research houses (Adobe, McKinsey, Roy Morgan, Mastercard, Salesforce — medium-high), and vendor blogs (directional only). Treat percentages as directional; the *direction* is corroborated across independent sources. Re-verify any specific number before it appears in customer-facing material. Full source list at the end.

---

## 1. Overview

This PRD scopes five adjacent opportunities surfaced by the July 2026 market analysis. One is a **new module for a new segment** (AI Shopping Visibility for AU e-commerce SMBs); the other four are **signal enhancements** that strengthen VisibleAU's existing audit across all segments. They are deliberately ordered by strategic weight, not by build order.

- **A — AI Shopping Visibility (AU e-commerce SMBs)** — *new module, new segment.* Does an Australian brand's product get recommended when shoppers ask ChatGPT / Gemini / Perplexity to shop? Extends Sprint 6 agent-readiness to product-feed readiness. **This is the headline opportunity and the bulk of this document.**
- **B — Content Freshness signal** — *cheap, high-signal enhancement to the existing audit.*
- **C — Reviews / UGC trust dimension** — *enhancement to the Trust layer.*
- **D — Prompt / Demand intelligence** — *turns the audit into demand data (Profound's differentiator).* 
- **E — AI-mediated attribution** — *productizes the earlier AI-traffic attribution work.*

**Why now.** AI shopping is live and growing fast, but the winning layer has clarified in H1 2026: OpenAI retreated from in-chat checkout in March 2026, repositioning ChatGPT as a **discovery layer** that routes buyers to the merchant's own environment to transact. That is decisive for scoping — the durable, defensible value is *being recommended*, not *checkout integration*. Being recommended is exactly VisibleAU's competency, it's checkout-agnostic, and it works in Australia today even though the transactional rails (ChatGPT Instant Checkout, Shopify Agentic Storefronts) are still US-gated.

---

## 2. Goals & non-goals

**Goals**
- G1. Give AU e-commerce SMBs a clear, AU-first answer to "do AI shopping assistants recommend my products, and if not, what do I fix?"
- G2. Reuse VisibleAU's existing engine-tracking, fan-out, agent-readiness, remediation and reporting machinery rather than building a parallel stack.
- G3. Strengthen the core audit for *all* segments via the four signal enhancements (B–E).
- G4. Preserve VisibleAU's structural moat: AU-first, SMB-first, audit-first, action-layer-included.

**Non-goals (explicit)**
- N1. **We are not building checkout / payment integration** (ACP / UCP / Stripe SPT / Mastercard Agent Pay). We *measure and optimize discovery*; we do not process transactions. (The checkout layer is consolidating into merchant environments and payment networks — not our lane.)
- N2. We are not building an Amazon Rufus optimizer in the MVP (Rufus is a US-centric walled garden and Amazon blocks external agents — see §3.3). Revisit post-MVP.
- N3. We are not abandoning the service-business core. Shopping Visibility is an **adjacent segment module**, not a replacement — most of VisibleAU's existing AU SMB base is service businesses for whom it does not apply.
- N4. We are not building a full retail-media / paid-placement product. Focus is organic recommendation.

---

## 3. Opportunity A — AI Shopping Visibility for AU e-commerce SMBs

### 3.1 Problem & opportunity

When an Australian shopper asks ChatGPT "best waterproof hiking boots under $200 in Australia" or asks Gemini to compare options, the AI returns a synthesised, organic product recommendation. For an AU e-commerce SMB, three things are true and currently invisible to them: (a) whether their product appears at all; (b) where it ranks versus competitors; (c) why — which product-data and trust signals drove or blocked the recommendation. Standard analytics can't answer any of this, because much of the journey happens inside the chat and the click (if any) often lands as "direct" traffic.

The behavioural shift is real in Australia specifically: an AU study (Navigators AI Brandscape 2026) reports 39% of Australians use AI to make buying decisions and 31% act on AI recommendations; a PayPal survey found 61% would trust AI product recommendations. AI-referred e-commerce traffic to AU sites grew ~693% over the 2025 Nov–Dec peak (Adobe), and globally AI-referred retail traffic now converts materially better than non-AI traffic (Adobe reported +42% conversion in March 2026 — a reversal from a year earlier). Whatever the exact number, high-intent AI shoppers arrive pre-qualified.

### 3.2 Market & competitive analysis

**The incumbents (all US / enterprise-centric):**

| Tool | Shopping coverage | Metrics | Action layer | AU posture | Price |
|---|---|---|---|---|---|
| **Goodie** (Agentic Commerce Suite) | ChatGPT Shopping, Google AI Mode Shopping, Amazon Rufus, Perplexity Shopping — SKU-level | mention freq/product, rank position in comparisons, competitor placement, price-mention accuracy, category visibility share, Rufus labels | feed remediation, product copy/FAQs, schema injection, image opt; Shopify/BigCommerce/GMC/Meta/Amazon integrations; has an MCP | US-first; no AU focus | Starter ~US$295/mo; Rufus from Team tier |
| **Profound** (Shopping module) | ChatGPT Shopping + Amazon Rufus (product-placement level) | product placement, plus "Prompt Volumes" real-user demand (1.5B+ prompts) | content creation, agentic actions | lists ~10 countries; not AU-specific | ~US$99 (ChatGPT only) / $399 (3 engines) / enterprise |
| **Brandlight** | enterprise breadth incl. Rufus + Llama | share-of-voice | enterprise workflows | US/enterprise | custom |
| **Azoma** | Amazon Rufus + Walmart Sparky (e-commerce specialist) | marketplace-centric | marketplace opt | US | n/a |
| **AthenaHQ** | Shopify integration w/ revenue attribution | funnel | vertical | US | ~US$95+/mo |

**The gap:** the category is converging on a "monitor → fix → attribute" shopping workflow, but every vendor is US-centric and priced for teams with analysts. **Nobody serves AU e-commerce SMBs with AU-native pricing, AUD/GST-aware product-data checks, AU query sets, and an AU competitor lens.** VisibleAU's structural advantages (AU-first, SMB-first, audit-first, action layer already in Phase 2) map directly onto this gap.

**What to copy vs. differentiate:** copy the SKU-level "does my product appear / where / vs whom" core (table stakes). Differentiate on: AU-native (query sets, AUD price accuracy, AU shipping/availability, AU competitor set, on-shore data), SMB price point, one-time-audit entry, and honest scoping (discovery not checkout).

### 3.3 The critical scoping insight

Three findings reshape scope and must anchor the build:

1. **Discovery is the durable layer; checkout is retreating.** OpenAI pulled native in-chat Instant Checkout in March 2026 (fewer than ~30 Shopify merchants had gone live) and repositioned ChatGPT as discovery-plus-redirect to merchant environments. Product data across the web was "too messy, unstandardized, and fragmented" for reliable agent checkout. → **Build for discovery/recommendation visibility + product-data readiness. Do not build checkout.**
2. **AU transactional rails lag, but discovery works now.** ChatGPT Instant Checkout and Shopify Agentic Storefronts are US-gated; however ChatGPT/Gemini/Perplexity *recommend* AU products globally from open-web + structured data, and Mastercard Agent Pay went live in AU (CBA, Jan 2026). → **The visibility module is viable in AU today; a future checkout-readiness sub-score can track AU availability as it rolls out.**
3. **Amazon is a walled garden that blocks external agents.** Amazon blocks ChatGPT-User / OAI-SearchBot in robots.txt, so Amazon listings can't surface in ChatGPT shopping — a structural advantage for DTC storefronts. Rufus is on-Amazon only. → **MVP targets the open-web assistants (ChatGPT, Gemini/AI Mode, Perplexity), not Rufus. This also happens to be the cheaper, AU-relevant set.**

### 3.4 Target users / personas

- **Primary — "Mia, the AU Shopify SMB owner."** Runs a 1–15 person DTC brand on Shopify (AU's dominant SMB e-comm platform). Acts as her own marketer/CIO (the AU "Micro-Gap": micro-businesses ~33% AI adoption, mostly ad-hoc). Wants a plain-English "are AI assistants recommending me, yes/no, and the 3 things to fix." Price-sensitive; no analyst.
- **Secondary — "Dev, the AU agency."** Manages 5–20 AU e-commerce clients; needs white-label share-of-voice + "AI shelf" reports and a repeatable audit to sell. (Ties into the existing Sprint 4 white-label reports + Sprint 9 agency surfaces.)
- **Tertiary — mid-market AU retailer** wanting category share-of-voice vs named competitors.

### 3.5 Scope — MVP → phases

**MVP (Shopping Visibility v1) — "The AU AI Shelf audit"**
- Product-level visibility across ChatGPT, Google AI Mode/Gemini, Perplexity for a defined AU shopping-query set.
- Product-feed / agent-readiness score (extends Sprint 6).
- Competitor "AI shelf" share-of-voice for a named AU competitor set.
- Remediation tasks (reuses Sprint 2 Workflow Intelligence) + narrative report (reuses Sprint 4).

**Phase 2 (post-MVP):** price-mention accuracy (AUD/GST), Rufus (if/when AU-relevant), demand overlay (Opportunity D), attribution wiring (Opportunity E), auto-generated product copy/schema drafts (reuses Sprint 4 content drafts).

**Phase 3:** checkout-readiness sub-score as AU ACP/UCP availability matures; storefront-platform integrations (Shopify app).

### 3.6 Functional requirements (MVP)

*Discovery / visibility*
- **FR-A1.** For a brand + product catalogue (manual entry, CSV, or product-feed URL), generate an AU shopping-query set per product category (seeded, brand-specific — reuse the Smart Prompt Pack pattern; include "in Australia"/state modifiers and natural-language buyer questions).
- **FR-A2.** Run each shopping query against the enabled engines (ChatGPT, Gemini/AI Mode, Perplexity) using the existing multi-engine + fan-out infrastructure (`TIER_ENGINES`, `selectModel`, `maxFanOutSubQueries`), respecting `BudgetPolicyService` and quality gates. Shopping queries expand well under fan-out (AI Mode 9–11 sub-queries), so cap per budget policy.
- **FR-A3.** Parse each response to detect: (a) whether the brand's product(s) appear; (b) rank/order position within the recommendation set; (c) competing products named alongside; (d) any price/availability claims about the brand's product; (e) sentiment/label of the mention.
- **FR-A4.** Compute per-product **AI Shelf Presence** (appears / rank) and a brand-level **Shopping Share-of-Voice** vs the named AU competitor set, per engine and blended.
- **FR-A5.** Apply the platform explainability contract to each result: `{rationale, confidence_label, confidence_note, top_action}` (why the product did/didn't appear; the single highest-impact fix). Confidence must reflect run count / Wilson CI per the sampling policy (shopping recommendations are non-deterministic — do not over-claim from one run).

*Product-feed / agent readiness (extends Sprint 6)*
- **FR-A6.** Audit product-data machine-readability: presence and validity of schema.org `Product` / `Offer` JSON-LD (name, brand, price, priceCurrency=AUD, availability, GTIN/SKU, aggregateRating, review), on the PDP and/or feed.
- **FR-A7.** Audit AI-crawler access for the brand's storefront: are `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `Google-Extended` permitted in robots.txt (and no llms.txt/robots conflict)? Flag blocks that make the store invisible to shopping agents. (Note: unlike the general llms.txt finding, *crawler access* genuinely matters for shopping discovery.)
- **FR-A8.** Assess product-feed readiness against agentic-commerce feed expectations (clean attributes, real-time price/availability, natural-language descriptions vs keyword-stuffing) and emit a **Product Feed Readiness** score. Represent ACP/UCP/MCP feed-format readiness as a **readiness indicator**, not an integration.
- **FR-A9.** AU-specific checks: AUD price present and correctly denominated; AU availability/shipping signalled; GST-inclusive pricing clarity.

*Action + reporting*
- **FR-A10.** For every gap (incl. LOW), create a remediation task via Sprint 2 Workflow Intelligence, scoped to the exact product/PDP/feed field and change, priority-ranked by expected impact on recommendation probability.
- **FR-A11.** Produce a narrative "AU AI Shelf" report (Sprint 4) — per-product presence, share-of-voice vs competitors, the readiness scores, and the prioritized fix list — white-labelable for agencies.
- **FR-A12.** Re-audit on demand and on task completion (reuse the completion→re-audit loop), showing before/after movement.

**Non-functional:** all product/shopping data is tenant-isolated via `assertBrandAccess`; runs are cost-gated (`BudgetPolicyService`) and quality-gated; dev uses mock LLMs, prod uses real engines (existing two-DB mode); results carry confidence labels; UI is mobile-responsive with loading/error states.

### 3.7 Data model (new — extends the Sprint 6 layer)

New tables (names indicative; follow existing conventions — org-scoped RLS, `assertBrandAccess`, contiguous manifest, snake_case):

- `shopping_query_sets` — id, brand_id, org_id, category, market_code (AU_EN), locale (en-AU), query_text, query_type (comparison/feature/purchase-intent), created_at.
- `product_catalog` — id, brand_id, org_id, external_product_id/SKU, title, url (PDP), price_cents, currency, category, feed_source, last_seen_at. (Ingested from CSV / feed URL / manual.)
- `shopping_visibility_results` — id, brand_id, org_id, product_id (nullable if brand-level), query_set_id, engine, run_id, appeared (bool), rank_position (nullable), competitors_named (jsonb), price_claim (jsonb), sentiment, rationale, confidence_label, confidence_note, top_action, created_at.
- `product_feed_audits` — id, brand_id, org_id, product_id, schema_valid (bool), schema_fields_present (jsonb), crawler_access (jsonb: {oai, chatgpt_user, perplexity, google_extended}), feed_readiness_score, au_checks (jsonb: {aud_price, availability, gst_clarity}), acp_ucp_mcp_readiness (jsonb), created_at.
- `shopping_share_of_voice` — id, brand_id, org_id, engine, category, competitor_set (jsonb), brand_share (0–100), competitor_shares (jsonb), period, created_at.

Scoring: a new **Shopping Visibility** dimension (per-engine + blended presence/SoV) and a **Product Feed Readiness** dimension, rolled up like existing dimensions and surfaced with the explainability contract. Percentages follow the existing convention (share fields 0–100).

### 3.8 Technical approach

- **Reuse, don't rebuild.** Shopping queries ride the existing engine-selection + fan-out + budget/quality infrastructure. The only genuinely new work is (a) shopping-intent query generation, (b) product-recommendation parsing (structured extraction of product mentions/rank/competitors/price from responses), (c) the feed/schema/crawler audit, and (d) the two new dimensions + tables.
- **Parsing is the hard part.** Recommendations are prose; extraction must be robust to formatting. Use a structured-output extraction step (schema-constrained) over each engine response; store raw response for audit. Expect non-determinism — run N times per query per the sampling policy and report Wilson-CI-backed confidence, never single-run certainty.
- **Feed ingestion:** support manual entry + CSV + a product-feed/sitemap URL. A Shopify app integration is Phase 3, not MVP (keep MVP platform-agnostic).
- **Crawler-access + schema checks** extend the existing Sprint 7 technical-audit detectors (robots parsing, schema/JSON-LD parsing) — reuse that code.

### 3.9 Tier gating & pricing

- Shopping Visibility is a **new tier-gated capability**, most naturally at **Growth**, or packaged as an **e-commerce add-on** across tiers (e-commerce SMBs are a distinct segment; an add-on avoids diluting the service-business core plans). Decision open (OQ-A4).
- One-time **"AU AI Shelf Audit"** as the SMB entry point (mirrors the market's proven $50-ish one-time-audit motion) before any subscription — matches VisibleAU's audit-first model.
- AU-native AUD pricing is itself a differentiator vs US$295+/mo incumbents.

### 3.10 Success metrics

- **Product:** % of onboarded brands with ≥1 product appearing in ≥1 engine; median shopping SoV lift 30/60 days post-remediation; feed-readiness score improvement; re-audit completion rate.
- **Business:** conversion from one-time AU AI Shelf Audit → subscription/add-on; agency attach rate; e-commerce segment ARR.
- **Quality:** parsing precision/recall vs manual spot-checks (target ≥95% match, mirroring the accuracy bar competitors advertise); confidence-label calibration.

### 3.11 Risks & mitigations

- **R-A1. Non-determinism / accuracy.** Shopping answers vary run-to-run. → Multi-run + Wilson CI + explicit confidence labels; never sell single-run certainty. (This is also where honest confidence labelling beats competitors who imply precision.)
- **R-A2. Cost.** Shopping queries × fan-out × multiple engines × N runs is expensive. → Hard cost gating via `BudgetPolicyService`; tier-based query/run caps; category-level sampling rather than exhaustive SKU coverage on entry tiers.
- **R-A3. Platform volatility.** Shopping surfaces change monthly (Instant Checkout retreat is a live example). → Keep engine/parse logic behind the provider-capability registry; treat surface coverage as config, not code.
- **R-A4. Segment fit.** Most existing VisibleAU users are service businesses. → Position as an add-on/segment module; don't force it into core plans; validate demand with a small AU Shopify design-partner cohort before full build.
- **R-A5. AU transactional immaturity.** Checkout rails are US-first. → Explicitly scope to discovery (which works now); ship checkout-readiness only as a tracking sub-score later.
- **R-A6. Attribution scepticism.** SMBs will ask "did this drive sales?" → Pair with Opportunity E (branded-search lift + post-purchase survey + referrer capture); be honest that direct AI purchase attribution is imperfect industry-wide.

### 3.12 Open questions

- OQ-A1. Which engines in MVP — ChatGPT + Gemini/AI Mode + Perplexity confirmed; include Claude (surging, but weaker shopping surface today)?
- OQ-A2. Feed ingestion priority: CSV + feed-URL for MVP, Shopify app later — confirm.
- OQ-A3. Category taxonomy: adopt Google Merchant Center taxonomy or a lighter internal one?
- OQ-A4. Packaging: Growth-tier feature vs cross-tier e-commerce add-on vs standalone?
- OQ-A5. How many runs per query for acceptable confidence at acceptable cost (calibrate against sampling policy)?

---

## 4. Opportunity B — Content Freshness signal

**Problem/insight.** Freshness reportedly correlates strongly with citation: content under ~30 days old is cited materially more often (widely-cited practitioner figure ~3.2x; directional). VisibleAU currently doesn't score staleness.

**Scope.** A cheap, high-signal **Freshness** sub-signal within the existing content/technical audit.

**Functional requirements**
- FR-B1. Detect last-meaningful-update per key page (dateModified schema, visible "updated" dates, sitemap lastmod, content-hash change since last crawl — prefer corroborated signals over a single field).
- FR-B2. Emit a per-page and site-level **staleness flag** (fresh <30d / aging 30–180d / stale >180d), weighted toward the brand's highest-value / most-cited pages.
- FR-B3. Create remediation tasks for stale high-value pages ("refresh + restamp dateModified"), priority-ranked.
- FR-B4. Surface via the explainability contract (rationale = freshness's link to citation; top_action = which page to refresh first).

**Data model delta.** Add `last_meaningful_update`, `freshness_band`, `freshness_signals` (jsonb) to the existing page/content audit table; no new table required.

**Effort:** Small. Mostly detector logic + a scoring band; reuses existing crawl/schema parsing. Good early win.

**Risk:** Don't reward date-stamp gaming (restamping without real change). → Require content-change corroboration, not just a modified date.

---

## 5. Opportunity C — Reviews / UGC trust dimension

**Problem/insight.** LLMs increasingly treat aggregated user reviews as "ground truth" and default to review sentiment when a brand's own claims conflict with UGC. Review *velocity, volume, recency and sentiment* on high-trust platforms materially affect recommendation probability. This is a natural extension of the Phase 2 **Trust** layer (Sprint 5).

**Scope.** A **Reviews/UGC Trust** sub-dimension within Trust Intelligence.

**Functional requirements**
- FR-C1. Detect and aggregate presence of review/UGC signals across high-trust surfaces relevant to the brand (e.g., Google, Trustpilot, ProductReview.com.au for AU, category/community sources), and on-site review schema (aggregateRating/review JSON-LD).
- FR-C2. Compute a Reviews/UGC score from volume, recency/velocity, average sentiment, and cross-source consistency; flag conflicts between on-site claims and aggregated sentiment.
- FR-C3. AU emphasis: weight **ProductReview.com.au** and Google reviews (dominant AU consumer-review surfaces).
- FR-C4. Remediation tasks: review-velocity gaps, missing review schema, unaddressed negative-sentiment themes.
- FR-C5. Explainability contract on the score (rationale = UGC-as-ground-truth; top_action = the highest-leverage trust fix).

**Data model delta.** Extend the Trust layer tables with a `reviews_ugc` sub-score + a `review_sources` (jsonb) breakdown; potentially a small `review_signals` table if per-source history is wanted.

**Effort:** Medium. Depends on which review sources are in-scope (API vs public parsing) and rate/ToS constraints per source. Start with schema-based + Google + one AU source.

**Risk:** Review-platform access/ToS; don't ingest in a way that violates a source's terms. → Prefer official APIs / on-site schema; treat third-party surfaces conservatively.

---

## 6. Opportunity D — Prompt / Demand intelligence

**Problem/insight.** Profound's standout differentiator is showing **how many real users ask a query**, not just whether the brand appears — turning visibility into demand intelligence (their "Prompt Volumes," derived from consumer panels). VisibleAU's audits currently show presence without demand weighting, so a brand can't tell whether a query it's invisible for actually matters.

**Scope.** A **lightweight demand overlay** on existing prompts/queries — VisibleAU cannot replicate a proprietary consumer panel, so use proxy demand signals, clearly labelled as estimates.

**Functional requirements**
- FR-D1. Attach a **relative demand estimate** to each tracked prompt/shopping-query using available proxies: traditional keyword/search-volume for the underlying intent (e.g., via an existing SEO data source), branded-search trend, and query frequency across the brand's own audits.
- FR-D2. Re-rank the fix list by **visibility gap × demand** (prioritise queries that are both high-demand and low-presence).
- FR-D3. Label demand as **estimated/proxy** with a confidence note — do **not** imply panel-grade precision (honesty differentiator).
- FR-D4. Surface a "high-demand, invisible" watchlist per brand.

**Data model delta.** Add `demand_estimate`, `demand_source`, `demand_confidence` to the prompt/query tables; optional `demand_snapshots` for trend.

**Effort:** Small–Medium if leveraging an existing keyword/search-volume source; Large if attempting a genuine panel (out of scope — don't).

**Risk:** Over-claiming precision vs Profound's panel. → Explicitly position as directional demand weighting, not a panel substitute.

---

## 7. Opportunity E — AI-mediated attribution

**Problem/insight.** AI-mediated discovery/purchase is largely invisible to standard analytics: AI referrals frequently land as "direct" (users copy a brand name from the AI, then navigate directly); multi-session journeys mis-attribute (research in Perplexity, buy later elsewhere); on-Amazon Rufus sessions are indistinguishable from normal Amazon search. This is precisely the gap VisibleAU's earlier AI-traffic attribution design work targets, and it's the question every SMB asks ("did this drive sales?"). With ChatGPT now routing to merchant sites (post-checkout-retreat), a referrer/branded-lift approach is *more* viable than during the in-chat-checkout era.

**Scope.** An **AI-influence attribution toolkit** that combines the measurable signals into a defensible (not perfect) estimate.

**Functional requirements**
- FR-E1. Referrer capture: guidance + tagging to identify AI-source sessions where the referrer is exposed (e.g., chatgpt.com, perplexity.ai, gemini/google AI Mode), and a way to reconcile "direct" spikes correlated with visibility changes.
- FR-E2. Branded-search-lift tracking: connect Google Search Console branded-query trend to AI visibility movement (rising AI SoV + rising branded search = working funnel).
- FR-E3. Post-purchase / lead survey hook: a lightweight "How did you hear about us / did you use AI to research?" capture for self-reported AI influence.
- FR-E4. Blend the above into an **AI-influence indicator** per brand, with explicit confidence and method notes; feed it into reporting (Sprint 4) alongside visibility.
- FR-E5. For the Shopping module (A), attach AI-influence context to product recommendation performance where possible.

**Data model delta.** New `attribution_signals` table (brand_id, org_id, source_type {referrer/branded_lift/survey}, period, value, method, confidence); reporting reads from it.

**Effort:** Medium. Referrer + GSC connection is tractable; survey hook is light; the honest framing is the important part.

**Risk:** Attribution is imperfect industry-wide; overpromising erodes trust. → Sell it as "AI-influence signal," corroborated across methods, with confidence — not deterministic revenue attribution.

---

## 8. Sequencing / recommended roadmap

Ordered for value-per-effort and to de-risk the big bet:

1. **B — Content Freshness** (small, cheap, strengthens core for all segments) — quick win, ship first.
2. **C — Reviews/UGC Trust** (medium; high citation leverage; extends Sprint 5) — next.
3. **A — AI Shopping Visibility MVP** (the strategic bet) — but **gate it behind an AU Shopify design-partner validation** (5–10 brands) before full build, to confirm segment demand (R-A4). Reuses B, C, and the existing workflow/report machinery, so it benefits from doing those first.
4. **D — Demand overlay** (small–medium; multiplies the value of A and the core audit) — fold into A's Phase 2.
5. **E — Attribution toolkit** (medium; answers the "did it work" question; pairs with A) — fold in alongside A's Phase 2.

Each remains subject to the standing engineering non-negotiables (optimised queries, indexing, RLS, no N+1s, accessible mobile-responsive UI, loading/error states) and the platform invariants (tier source = subscriptions.tier, `TIER_ENGINES`, `selectModel`, `assertBrandAccess`, explainability contract, quality/sampling gates, two-DB mode).

---

## 9. Sourcing caveats (repeat)

The strongest claims here (checkout retreat, protocol status, AU rail availability, adoption scale) rest on platform announcements and named research houses. The performance percentages (conversion lift, freshness multiplier, review impact) come partly from vendor blogs and should be treated as directional and re-verified before customer-facing use. Competitor feature/pricing details are as published on the dates noted and shift monthly — re-verify before positioning against a named competitor.

---

## Appendix — Sources

Shopping competitors:
- Goodie — Agentic Commerce Suite. https://higoodie.com/features/agentic-commerce-suite/ ; Amazon Rufus optimization. https://higoodie.com/models/amazon-rufus/
- Profound alternatives / shopping module (via timsoulo.com). https://blog.timsoulo.com/14-profound-ai-alternatives-for-ai-search-visibility-tracking-2026/
- AI visibility platform rankings (shopping coverage). https://nicklafferty.com/blog/best-ai-visibility-optimization-platforms/ ; https://getairefs.com/blog/40-best-ai-search-tools-2026/
- AIVO — ChatGPT Shopping vs Perplexity vs Rufus platform priorities. https://www.tryaivo.com/blog/ecommerce-ai-visibility-chatgpt-perplexity-rufus-platform-priorities

Checkout retreat / protocols / AU rails:
- OpenAI — Buy it in ChatGPT / ACP. https://openai.com/index/buy-it-in-chatgpt/
- CNBC — OpenAI moving away from Instant Checkout to retailer apps. https://www.cnbc.com/2026/03/20/open-ai-agentic-shopping-etsy-shopify-walmart-amazon.html
- Retail-show.com.au — OpenAI shifts to retailer-run apps. https://www.retail-show.com.au/openai-chatgpt-shopping-retailer-apps-retail-trends-2026
- eCommerceNews AU — ChatGPT's checkout retreat, opportunity for Aussie retailers. https://ecommercenews.com.au/story/chatgpt-s-checkout-retreat-an-opportunity-for-aussie-retailers
- ACS Information Age — AI shopping arrives in Australia; Mastercard Agent Pay (CBA). https://ia.acs.org.au/article/2026/ai-shopping-arrives-in-australia--retailers-revolt.html
- Elogic — ChatGPT Commerce & Agentic Shopping Statistics 2026. https://elogic.co/blog/chatgpt-commerce-statistics/
- Ekamoira — ChatGPT Instant Checkout / ACP retailer guide (Amazon crawler block). https://www.ekamoira.com/blog/chatgpt-instant-checkout-agentic-commerce-protocol-2026
- SmartCompany AU — ChatGPT in-app shopping (AU expert view). https://www.smartcompany.com.au/retail/chatgpt-in-app-shopping-instant-checkout-australian-e-commerce-experts/

AU adoption / market:
- Navigators AI Brandscape 2026 (via eCommerceNews AU, above).
- Roy Morgan — AI tool usage March 2026. https://www.roymorgan.com/findings/10248-artificial-intelligence-ai-tools-usage-march-2026
- Adobe Digital Insights (AI retail traffic) — via omnibound/elogic aggregations.

*Draft for review. Numbers are directional; re-verify before external use.*
