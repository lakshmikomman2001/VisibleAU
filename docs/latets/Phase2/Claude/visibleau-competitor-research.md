# VisibleAU — Competitor Research Document
## Session: June 5, 2026 | LLD Version 8.12 → 8.15

This document records all competitor research conducted in today's session.
Five competitors were reviewed in depth. Each section covers: product overview,
pricing, key features, review data, gaps found in the competitor, patches applied
to the VisibleAU Phase 2 LLD, and VisibleAU's advantages.

---

## Table of Contents

1. [Semrush AI Visibility Toolkit](#1-semrush-ai-visibility-toolkit)
2. [danishashko OSS geo-aeo-tracker](#2-danishashko-oss-geo-aeo-tracker)
3. [MentionDesk](#3-mentiondesk)
4. [Foglift](#4-foglift)
5. [Summary: All Patches Applied Today](#5-summary-all-patches-applied-today)
6. [VisibleAU Competitive Position](#6-visibleau-competitive-position)

---

## 1. Semrush AI Visibility Toolkit

### Category
**Legacy SEO platform with AI add-on** — the largest and most established SEO tool
in the market, now with a purpose-built AI Visibility Toolkit layer.

### Company Overview
- **Owner:** Adobe (acquired Semrush for $1.9B on April 28, 2026 — now a wholly-owned
  Adobe subsidiary)
- **Users:** 28M global, 117,000+ paying customers
- **AI Toolkit launched:** October 2025
- **Data infrastructure:** 100M+ LLM prompts globally (90M US, 29M ChatGPT) — the
  largest AI prompt database in the market
- **Named:** "most feature-complete AEO suite shipped by a legacy SEO vendor" (Docket.io)

### Pricing
| Product | Price |
|---|---|
| AI Visibility Toolkit (standalone add-on) | $99/mo |
| Semrush base plan (required) | $140/mo minimum |
| **Effective minimum to use AI Toolkit** | **$239/mo** |
| Semrush One (bundled SEO + AI) | $199–$549/mo |
| Free trial (AI Toolkit alone) | None |

### Core Features (AI Toolkit)
Six reports make up the AI Visibility Toolkit:

**Visibility Overview** — AI Visibility Score (0-100) across ChatGPT, Google AI Overviews,
AI Mode, Perplexity, and Gemini. Worldwide or region-specific. Powered by the 100M+ prompt
database.

**Competitor Research** — Topic and prompt gap analysis vs up to 4 competitors. Shows
which prompts competitors appear for that you don't.

**Prompt Research** — "Keyword research for the AI era." Volume, difficulty, and intent
at scale. Based on the historical prompt database, not real-time responses.

**Brand Performance** — Share of Voice, sentiment, and two standout sub-features:
- *Business Drivers:* scores individual brand attributes (Price, Convenience, Innovation,
  Trust) — "Warby Parker scores 55 on Omnichannel Access but only 25 on Value-Driven."
- *Narrative Drivers:* splits brand mentions into branded vs non-branded intent —
  separating loyalty signals from awareness signals.

**Prompt Tracking** — Daily tracking for up to 25 specific prompts on the base plan.

**AI Search Site Audit** — Technical issues that may block AI crawlers. Flags GPTBot,
ClaudeBot, and Google-Extended access problems.

**Additional:** MCP Server (ChatGPT + Claude + Cursor integration, 50K API units/month
included), AI PR Toolkit (find LLM-trusted media outlets for targeted pitches).

### Review Data
- **G2:** 4.5/5 from 3,300+ verified reviews (largest review base in the AEO category)
- **Trustpilot:** 2.8/5 — almost entirely billing and cancellation complaints
- **Notable:** No self-serve cancel button in the dashboard (dark pattern); cancellation
  requires contacting support, submitting a form, confirming via email, and clicking a
  verification link. BBB complaints document customers charged after cancellation.

### Gaps Found in Semrush
- **Keyword-focused, not prompt-level:** Extends SEO keyword workflow into AI visibility;
  not built around the conversational prompt-as-unit-of-measurement that pure-play AEO tools use.
- **Google-centric:** Primary tracking is Google AI Overviews. ChatGPT and Perplexity are
  secondary. Misses 37% of product discovery queries that now start in ChatGPT/Perplexity.
- **No execution layer:** Monitoring and insights only. No content drafts, no outreach briefs,
  no remediation tasks.
- **No AU-specific prompt packs:** The 100M prompt database is US-weighted. No AU vertical
  packs for tradies, allied health, or AU SaaS.
- **No crawler/agent traffic monitoring:** No equivalent to `crawler_visit_logs`.
- **No hallucination detection.**
- **Steep learning curve:** 55+ tools; the AI Toolkit adds density to an already
  cluttered interface. Not self-serve in under 10 minutes.
- **No free trial for the AI Toolkit standalone.**
- **Dark pattern cancellation** drives Trustpilot rating to 2.8/5.

### Patches Applied to VisibleAU LLD

**PATCH AE-01 — `branded_intent` TEXT on `vertical_pack_prompts`** (v8.12)

Inspired by Semrush's "Narrative Drivers" feature. Splits prompt performance into
branded vs non-branded — a different business problem requiring a different fix.

- Values: `'non_branded'` | `'branded'` | `'semi_branded'` | `NULL` (legacy)
- Detection: seed-time string check — if `promptTemplate` contains `{brandName}` →
  `'branded'`; if suburb-level specifics → `'semi_branded'`; else → `'non_branded'`
- Distribution: ~90% of 336 AU prompts are `non_branded`, ~25 `branded`, ~20 `semi_branded`
- UI (Sprint 9, Growth+): "Intent" filter — Awareness (non-branded) / Reputation (branded) / All
- Headlines: *"How often AI recommends you when buyers haven't heard of you"* (non-branded)
  vs *"How accurately AI describes your brand when asked directly"* (branded)
- Semrush charges add-on pricing for this. VisibleAU includes it on Growth (A$299/mo),
  derived from prompt template content at seed time — zero LLM cost.

**PATCH AE-02 — Business Drivers (v1.2 roadmap note on `visibility_trends`)** (v8.12)

Semrush's attribute-level scoring is genuinely powerful but Phase 3 in complexity.
AU-specific attribute taxonomy required:
- Tradies: Licensed/Insured, Local, Responsive, Fixed-Price, Guaranteed Work
- Allied Health: Qualified, Bulk Billing, Short Wait Times, Specialist, Accessible
- SaaS: AU Data Residency, Integrations, Support Quality, Pricing, Ease of Use

v1.2 design: `brand_attribute_scores` table, attribute seeds per vertical, post-audit
Inngest keyword extraction from `contextSnippets`, radar chart UI on Growth+.
Enterprise annual contracts lock this in at no extra cost when v1.2 ships.

### VisibleAU Advantages Over Semrush
- 4 engines on A$99/mo Starter vs $239/mo minimum at Semrush
- AU vertical packs (336 AU-specific prompts) vs US-weighted 100M database
- Execution layer: content drafts, outreach briefs, remediation tasks — absent from Semrush
- Hallucination detection on Growth+ vs entirely absent at Semrush
- 90-second self-serve onboarding vs steep learning curve
- No billing dark patterns; clean Stripe cancel-anytime

---

## 2. danishashko OSS geo-aeo-tracker

### Category
**Open-source self-hosted tool / Bright Data lead magnet** — a fully MIT-licensed
local-first AI visibility dashboard built by a Bright Data employee as marketing
for Bright Data's LLM Scraper API.

### Company Overview
- **Author:** Daniel Shashko, Senior SEO/GEO at Bright Data
- **Purpose:** Lead magnet for Bright Data's LLM Scraper API — not a standalone business
- **GitHub:** 132 stars, 39 forks, 9 commits (very fresh — March 2026)
- **License:** MIT (fully open source, readable code)
- **Stack:** Next.js, Supabase (optional), Vercel, Recharts, IndexedDB/localStorage
- **Data collection:** Bright Data LLM Scraper API (UI scraping via Bright Data's
  bot-blocking infrastructure — not direct API calls)

### Pricing
- **Free to run:** Self-hosted, open source
- **Running cost:** Bright Data API (pay-per-query, fractions of a cent per query)
- **Model:** BYOK (Bring Your Own Keys) — user provides Bright Data + OpenRouter API keys

### Core Features (13 feature tabs)
| Tab | What it does |
|---|---|
| Project Settings | Brand name, aliases, website, industry, keywords |
| Prompt Hub | {brand} injection, batch runs across all 6 engines in parallel |
| **Persona Fan-Out** | Generates persona-specific prompt variants from a base prompt |
| **Niche Explorer** | AI generates 5-10 high-intent queries specific to your brand/niche |
| Responses | Browse full AI responses with brand/competitor highlighting |
| Visibility Analytics | 0-100 score trends over time (Recharts line charts), CSV export |
| Citations | Domain-grouped citation frequency analysis |
| Citation Opportunities | URLs competitors get cited for that you don't — with outreach briefs |
| Competitive Intel | Side-by-side competitor comparison |
| Drift Alerts | Auto-alerts when visibility score changes significantly |
| SRO Analysis | 6-stage pipeline: SERP + page + LLM → 0-100 score + recommendations |
| Report Builder | Generate client-ready reports |
| Settings | API keys, export/import |

**Engines:** ChatGPT, Perplexity, Gemini, Grok, Google AI Mode, Copilot (6 engines)

**SRO Analysis detail:** Stage 1 Gemini Grounding → Stage 2 Cross-Platform Citations →
Stage 3 SERP rank → Stage 4 Page Scraping → Stage 5 Site Context → Stage 6 LLM Analysis.
Output: SRO Score 0-100 + prioritised recommendations + content gaps + competitor insights.
Correlates AI visibility with traditional Google SERP rank.

### Review Data
- No G2 reviews (self-hosted OSS tool, no SaaS product to review)
- GitHub: 132 stars, 39 forks — modest but legitimate developer traction
- Bright Data blog post (March 2026): full technical deep-read available
- README.md read in full

### Features Already Covered in VisibleAU
| danishashko Feature | VisibleAU Coverage |
|---|---|
| {brand} prompt injection + batch runs | `promptTemplate` + `{brandName}` (Sprint 5) |
| Visibility Analytics 0-100 trends | `visibility_trends` (Phase 2) |
| Citations domain-grouped | `citation_source_intelligence` (Phase 2) |
| Citation Opportunities | `outreach_brief` + `gap_severity` (Phase 2) |
| Drift Alerts | Sprint 8 `canary_prompts` + `send-alerts.ts` |
| Full response browsing | `citations.rawResponse` (Phase 1) |
| Competitive Intel | `comparison_prompt_results` (Phase 2) |
| Local-first storage | Not a gap — VisibleAU is managed SaaS by design |
| BYOK model | Not a gap — VisibleAU is managed SaaS by design |

### Gaps Found in danishashko

**Genuine Gap 1 — Niche Explorer (AI-generated prompt suggestions)**

336 AU prompts are comprehensive for mainstream verticals but AU SMBs in edge cases
(NDIS-specific physio in Penrith, specialist conveyancer for off-the-plan buyers,
niche SaaS for AU registered training organisations) may need prompts specific to
their suburb, service type, or buyer that don't exist in the base pack.

**Genuine Gap 2 — SRO rank correlation (SERP vs AI)**

The 6-stage SRO pipeline produces a compelling insight: "You rank #1 on Google for
this query but AI only mentions you 8% of the time." For AU SMBs who rank well locally
on Google but are invisible in AI, this explains *why* without guesswork.

**Deferred — Persona Fan-Out**

Generating prompt variants per persona ("best plumber Sydney for homeowner") is
interesting but the 336 AU prompts already have persona-tagged variants. Fan-Out would
inflate prompt counts and LLM cost for marginal gain. Noted for v1.1 wizard.

### Patches Applied to VisibleAU LLD

**PATCH AF-01 — AI prompt suggestions + `source` column on `vertical_pack_prompts`** (v8.13)

Sprint 5 brand setup wizard (Step 2, after vertical selection) runs one GPT-4o-mini call:
- Input: brand description + vertical + location
- Output: 5-10 suggested prompts shown as checkboxes
- User can: accept / edit / skip each suggestion
- Accepted prompts saved to `vertical_pack_prompts` with `source = 'ai_suggested'`

New column: `source TEXT DEFAULT 'curated'`
- `'curated'` = from the 336 AU base pack (default — all existing prompts)
- `'ai_suggested'` = generated by Niche Explorer for this brand
- `'custom'` = manually added by user

Tier gate: Starter/Free get 3 suggestions; Growth+ gets 10.
Cost: ~A$0.001 per brand setup. Not quota-counted.
Effect: VisibleAU feels personalised from day one rather than generic.

**PATCH AF-02 — SERP rank correlation (v1.1 roadmap design note)** (v8.13)

Full SRO pipeline is out of scope for Phase 2 (external API dependency, significant
complexity). Scoped version documented for v1.1:
- Add `google_serp_rank SMALLINT` nullable to `citations` table
- Populated by optional SerpAPI call (ValueSERP AU, ~A$0.001/query)
- Display: *"You rank #3 on Google for this prompt. AI cites you 12% of the time.
  Most #1-3 Google results earn 60%+ AI citation rates."*
- Growth+ feature, v1.1 timing, clearly marked as optional dependency

### VisibleAU Advantages Over danishashko
- Managed SaaS — no BYOK, no self-hosting, no Bright Data account required
- Multi-tenant agency portal (danishashko is single-tenant by design)
- 336 AU vertical packs vs generic prompt library (AU-specific moat)
- Execution layer: content drafts, remediation tasks, outreach briefs
- Hallucination detection
- White-label PDF reports for agency clients
- danishashko is a Bright Data marketing tool — not a product with a support team

---

## 3. MentionDesk

### Category
**Thin monitoring-only AEO tool** — a very early-stage product with no verified
customer reviews and no independent validation.

### Company Overview
- **HQ:** Latvia, founded 2025
- **Funding:** None disclosed
- **Reviews:** **Zero verified G2 or independent reviews**
- **G2 status:** G2 alternatives page lists Miro, Creately, and Alteryx — completely
  wrong category, indicating MentionDesk has virtually no G2 category presence
- **One review found:** Booststash (August 2025) — likely affiliate/promotional content,
  not independent testing

### Pricing
| Plan | Price | Prompts | Domains |
|---|---|---|---|
| Lite | $29/mo | 15 | 1 |
| Standard | $119/mo | 50 | 3 |
| Growth | $189/mo | 100 | 5 |
| Advanced | $349/mo | 200 | Unlimited |
| Custom | Quote | Tailored | Unlimited |

**Engines:** ChatGPT, ChatGPT Search, Perplexity, DeepSeek, Google AI Overviews,
Claude, Mistral (7 engines)

### Core Features
- AI visibility tracking (mentions, rankings, reach across platforms)
- Prompt management with visibility scores, unique mentions, average positions per prompt
- Historical response archive (every AI response logged with full context)
- Competitive intelligence (side-by-side competitor comparison)
- Source Intelligence (which sources AI cites for competitors — described as the
  "golden feature" by the one reviewer)
- Sentiment analysis
- Team collaboration (multi-user, role-based permissions, comments, task assignment)
- CSV / PDF / JSON export

### Review Data
- **G2:** Zero verified reviews
- **Trustpilot:** No listing found
- **Slashdot / SourceForge:** Listed but zero reviews
- **Booststash review (August 2025):** 4.8/5 rating — content appears promotional/affiliate
  - Reviewer's explicit complaints about MentionDesk:
    - *"No prompt suggestion engine"* — biggest stated gap
    - *"Reporting not exceptional — I often export data to create better presentations"*
    - Monitoring-only with no content creation or execution tools

### Gaps Found in MentionDesk
Given zero verified reviews, gaps are derived from product descriptions and the one
available review:
- **No prompt suggestion engine** (reviewer explicitly called this out)
- **No execution layer** — monitoring only, no content drafts, no outreach briefs
- **No AU-specific vertical packs or local market focus**
- **No crawler/agent traffic analytics**
- **No technical audit** (crawlability, schema, SSR check)
- **No hallucination detection**
- **Reporting weak** — data visualisation "functional but not exceptional"
- **B2B/enterprise focused** — not suited to local SMBs

### Features Already Covered in VisibleAU
| MentionDesk Feature | VisibleAU Coverage |
|---|---|
| Source Intelligence | `citation_source_intelligence` + `source_affinity_note` (AA-02) + `brand_web_mentions.source_url` |
| Historical archive | `citations.rawResponse` (Phase 1 Sprint 2) |
| Competitive intel | `comparison_prompt_results` (Phase 2) |
| Sentiment | `audits.scoreSentiment` + `scoreSentimentNumeric` (Phase 1) |
| Team collaboration | `remediation_tasks` (Phase 2, more execution-focused) |
| Export | `audit_exports` CSV/PDF/JSON (Phase 1 Sprint 4) |
| Prompt suggestion (reviewer gap) | `AF-01` ai_suggested prompts (v8.13, added today) |
| White-label reporting | `generated_reports` + white-label PDF (Sprint 9 Agency+) |

### Patches Applied to VisibleAU LLD

**No schema patches warranted.** All MentionDesk features are already covered.

**One UI spec note confirmed** (already noted from earlier reviews): per-prompt historical
trend sparkline chart in Sprint 9 Growth+ prompt results view. Data already exists in
`citations` table. One new read-only GET endpoint. No schema change.

This confirmation is meaningful — the per-prompt trend view has now been cited by
three separate competitor reviews (MentionDesk, Scrunch, Peec AI), confirming it is
a widely valued feature worth prioritising in Sprint 9.

### What This Review Confirms
MentionDesk's reviewer explicitly complaints about it (no prompt suggestions, weak
reporting, monitoring-only) are things VisibleAU already addresses by design. The
review confirms VisibleAU's existing architecture is already stronger than MentionDesk's.

### VisibleAU Advantages Over MentionDesk
- 336 AU-specific vertical pack prompts vs generic prompt tracking
- Execution layer: content drafts, outreach briefs, remediation tasks
- Hallucination detection
- AU-specific source intelligence (r/tradies, Hipages, YPAU, WOMO)
- AI-generated prompt suggestions (AF-01)
- Technical audit (Sprint 7: robots.txt, schema, SSR, entity)
- Crawler/agent traffic analytics (`crawler_visit_logs` + `visit_purpose`)
- Verified design (Hall 12 reviews, Profound 827, Scrunch 73, Otterly 49, HubSpot
  3,300+) vs zero verified MentionDesk reviews

---

## 4. Foglift

### Category
**Indie developer-first AEO tool** — a very fresh (March 2026 Product Hunt launch)
combined SEO + GEO + AEO platform with a strong developer integration story (CLI, REST
API, and MCP server all included on the free tier).

### Company Overview
- **Team:** Small indie team ("scrappy" — self-described)
- **Launch:** Product Hunt, March 24, 2026
- **Positioning:** *"Founder-built alternative to Profound, Peec, and Otterly"*
- **Funding:** None disclosed
- **Reviews:** No G2 reviews. All content is self-published on foglift.io.
- **Notable:** Referenced approvingly in VisibleAU PRD v1.9 OSS competitor landscape.
  Mentioned in multiple comparison articles by other tools.

### Pricing
Foglift uses a **token-based pricing model** — each AI engine query costs tokens, and
you only pay for the engines you use.

| Plan | Price | Tokens/mo | Brands | Monitoring |
|---|---|---|---|---|
| Free | $0 | 200 | 1 | — |
| Launch | $49/mo | 4,000 | 3 | Daily |
| Growth | $129/mo | 11,500 | 10 | 2×/day |
| Enterprise | $299/mo | 27,000 | Unlimited | Hourly |

**Token costs per engine query:**
- Perplexity: 5 tokens
- Google AI Overview: 3 tokens
- ChatGPT: 3 tokens
- Gemini: 1 token
- Claude: 5 tokens

**Free unlimited Technical Audits** (no tokens, no signup, no credit card) on all plans.
**API + CLI + MCP server** included on every tier including Free.

### Core Features
**Six-category combined scan (30 seconds, free, no login):**
SEO + GEO + AEO + Performance + Security + Accessibility in one URL scan.

**AEO Content Score — 8 dimensions:**
1. Structured Data Richness (JSON-LD depth: FAQPage, HowTo, Article, Product, Org)
2. Heading Clarity (H1-H6 hierarchy, question-format headings, section organisation)
3. FAQ Quality (structured FAQ content AI can extract answers from)
4. Entity Identity (brand entity signals, company identity)
5. Content Depth (factual density, comprehensiveness, evidence)
6. **Citation Formatting** (in-text citations, references, source attribution in content)
7. Topical Authority (domain expertise signals, topic focus)
8. AI Crawler Access (robots.txt for GPTBot/ClaudeBot/PerplexityBot/Google-Extended)

**Free unlimited Technical Audits:** URL-only input, no account, no credit card, 30 seconds.

**Developer primitives (all free tier):**
- `npx foglift-scan` CLI — MIT licensed, same engine as dashboard
- REST API (`GET /api/v1/scan?url=...`)
- MCP server (Cursor, Claude Code, Windsurf)

**Real browser automation:** Opens actual ChatGPT/Perplexity/Claude in a browser rather
than calling APIs — captures what users actually see including real-time search results.

**AI Content Briefs:** Automated content recommendations based on what AI engines are
actually looking for in your industry.

**Daily monitoring with alerts:** Slack, email, and webhook alerts when visibility shifts.

### Review Data
- **G2:** No reviews
- **Product Hunt:** Launched March 24, 2026 — no upvote count recorded
- **Comparison articles:** Referenced as strong developer tool option, praised for
  free tier generosity (API + CLI + MCP at $0 is unusual in the category)
- All available content is from Foglift's own blog (self-promotional)

### Gap Analysis: Foglift 8 AEO Dimensions vs VisibleAU

| Foglift Dimension | VisibleAU Coverage |
|---|---|
| Structured Data Richness | Sprint 7 schema auditor (16/100 dimension) |
| Heading Clarity | `content_structure_audits.heading_structure` JSONB |
| FAQ Quality | `faq_block_present` + `faq_schema_present` + `answer_capsule_score` |
| Entity Identity | `brand_entity_scores` (ABN/Wikipedia/AU directories) |
| Content Depth | `word_count` + `optimal_passage_count` + thin content detection |
| **Citation Formatting** | **MISSING — genuine gap (see patch AG-01)** |
| Topical Authority | Partially covered via `cross_prompt_impact` + topical gap analysis |
| AI Crawler Access | Sprint 7 robots.txt (18/100 dimension) + CDN block detection |

**The one genuine gap:** Foglift's "Citation Formatting" dimension checks whether a page's
own content cites credible sources in-text (outbound links to .gov.au, .edu.au, ABS,
Wikipedia, AU news publishers, published research). This is a *positive* citability signal
— completely distinct from Sprint 7's broken outbound link check, which is a *negative* signal.

The Princeton GEO paper (Aggarwal et al., KDD 2024) — already cited in the VisibleAU PRD
— confirms that citing authoritative sources increases AI citation probability.

`content_structure_audits` already has `citation_probability_score` as the headline metric
but was missing the input signals for outbound citation richness and author attribution.

### Features Already Covered in VisibleAU
| Foglift Feature | VisibleAU Coverage |
|---|---|
| SEO + GEO + AEO in one scan | Sprint 7 `technical_audits` (8 dimensions, 5 surfaced) |
| AEO Content Score (7 of 8 dimensions) | `content_structure_audits` + Sprint 7 |
| Free no-account scan | Sample Audit (TIER 0, 90s, no login) |
| Real browser automation | AA-01 (web search tools make API ≈ browser result) |
| CLI + API + MCP | v1.1 roadmap (not needed for AU SMB market in v1) |
| Daily monitoring + drift alerts | Sprint 8 drift detection + `send-alerts.ts` |
| AI Content Briefs | `content_drafts` + `outreach_brief` (Phase 2 Sprint 6) |
| Competitor scanning | `comparison_prompt_results` (Phase 2) |

### Patches Applied to VisibleAU LLD

**PATCH AG-01 — `outbound_citation_count` + `has_author_attribution` on
`content_structure_audits`** (v8.15)

Two additive nullable columns — both detected by the existing Playwright crawl in
`content-structure-audit.ts`, no new infrastructure.

**`outbound_citation_count INTEGER`**

Counts credible outbound citations in the page body — external links to:
- `.gov.au` | `.edu.au` | `.org.au` — AU government, academic, non-profit
- `abs.gov.au` — Australian Bureau of Statistics
- `wikipedia.org` — encyclopaedic reference
- Known AU news publishers (smh.com.au, afr.com, abc.net.au, theaustralian.com.au)
- Published research (pubmed, arxiv, nature, springer)

Contribution to `citation_probability_score`:
- `count = 0`: no adjustment
- `count = 1–2`: +0.03
- `count = 3–5`: +0.06
- `count = 6+`: +0.09

Action Center message when count = 0 on high-priority pages:
*"This page has no references to credible sources. AI engines are 2-3× more likely to
cite pages that link to authoritative references like ABS data, government sources, or
published research. Add 2-3 relevant outbound citations."*

**`has_author_attribution BOOLEAN`**

Does the page have:
- `<meta name="author">` tag?
- A visible byline element (class contains 'author', 'byline', 'written-by')?
- A `schema.org/Person` or `schema.org/author` JSON-LD block?
- A `rel="author"` link?

Any one of the above → `true`.

Contribution: `+0.04` to `citation_probability_score` when `true`.

Especially important for Allied Health (AHPRA-registered practitioner attribution is
the highest trust signal for medical AI citations) and Professional Services (lawyer/
accountant name + credentials). Less critical for tradie service pages.

Note: Sprint 7 already checks for `missing author` as a *negative* signal in
`technical_audits`. This column is the Phase 2 per-page *positive* counterpart — a
different scope (per-page content audit, not brand-level technical audit).

**Research basis:** Princeton GEO paper (Aggarwal et al., KDD 2024) — the same paper
that forms the foundation of VisibleAU's 47 citability methods catalogue.

### VisibleAU Advantages Over Foglift
- AU-specific vertical packs (336 prompts) vs generic monitoring
- Multi-tenant agency architecture vs single-brand tool
- AU SMB positioning (tradies, allied health) vs B2B SaaS / developer focus
- Hallucination detection
- Execution layer: remediation tasks, outreach briefs, white-label reports
- ABN verification, AU directory integration, AU entity scoring
- Foglift's developer-first CLI/MCP distribution has no relevance for AU tradie clients

---

## 5. Summary: All Patches Applied Today

| Patch ID | Version | Competitor | What Was Added | Schema Change? |
|---|---|---|---|---|
| AE-01 | v8.12 | Semrush | `branded_intent TEXT` on `vertical_pack_prompts` | ALTER TABLE (nullable) |
| AE-02 | v8.12 | Semrush | Business Drivers — v1.2 roadmap note | No |
| AF-01 | v8.13 | danishashko | AI prompt suggestions + `source TEXT` on `vertical_pack_prompts` | ALTER TABLE (nullable) |
| AF-02 | v8.13 | danishashko | SERP rank correlation — v1.1 roadmap note | No |
| — | v8.14 | MentionDesk | Per-prompt trend sparkline — Sprint 9 UI note confirmed | No |
| AG-01 | v8.15 | Foglift | `outbound_citation_count INTEGER` + `has_author_attribution BOOLEAN` on `content_structure_audits` | ALTER TABLE (nullable ×2) |

**LLD state after today's session:**
- Version: 8.15
- Lines: 5,809
- CREATE TABLEs: 37 (no new tables added today — all changes were additive columns)
- All 16 GAPs intact
- All 7 Layers intact

---

## 6. VisibleAU Competitive Position

### What today's research confirms

After reviewing five competitors across two sessions (plus Hall, Profound, AthenaHQ,
Scrunch, Otterly, Peec AI, and HubSpot reviewed previously), the competitive landscape
picture is clear.

**The tier VisibleAU sits in:**

| Tier | Competitor | Differentiation |
|---|---|---|
| 1 — Enterprise | Profound ($96M Series C, G2 Leader) | Enterprise, GA4 attribution, SOC 2 |
| 1 — Enterprise | Scrunch ($15M Series A, 500+ brands) | Agency-leaning, 9 LLMs, AXP shadow site |
| 2 — Mid-market | AthenaHQ (Gartner Cool Vendor) | Strong content audit, Enterprise-only persona |
| 2 — Mid-market | Peec AI ($29M raised, 2,000+ customers) | Source intelligence, mid-market focus |
| 2 — Mid-market | Semrush ($1.9B, Adobe) | Legacy SEO + AI add-on, US-weighted |
| 3 — Entry | Otterly (15,000 users, Gartner Cool Vendor) | Prompt monitoring, starter-friendly |
| 3 — Entry | HubSpot AEO ($50/mo) | CRM-connected, excellent free Grader |
| 4 — Dev/OSS | Foglift (indie, March 2026) | Developer primitives, token pricing |
| 4 — Dev/OSS | danishashko OSS tracker (132★, MIT) | Bright Data lead magnet |
| 5 — Early | MentionDesk (Latvia, 0 reviews) | Monitoring only, unvalidated |

**VisibleAU's moat — what no competitor in any tier has:**
1. **AU vertical packs** — 336 AU-specific prompts (tradies, allied health, SaaS) curated
   for how Australians actually ask AI, not US-weighted databases
2. **ABN verification + AU entity scoring** — AHPRA, Hipages, YPAU, WOMO, Airtasker
   integration that no US-built tool can replicate without AU market expertise
3. **Execution-first design** — every audit ends with specific actions, not just scores
4. **AU SMB pricing** — A$99/mo Starter gets 4 engines, all AU prompts, full audit;
   comparable feature set at Semrush requires $239/mo minimum
5. **Hallucination detection** — critical for regulated AU industries; enterprise-only
   or absent at all competitors reviewed

**Per-patch impact ranked by business value:**

The single most impactful finding across all reviews is `source_affinity_note` (AA-02,
Peec AI review, previous session) — it closes the #1 complaint across every competitor's
G2 reviews: *"the tool shows what's happening but not why."*

Of today's patches, the most impactful are:
- **AE-01 (branded_intent):** Enables a genuinely different strategic insight — awareness
  problem vs reputation problem are different business problems for AU SMBs
- **AF-01 (AI prompt suggestions):** Makes VisibleAU feel personalised from day one for
  edge-case AU verticals at near-zero cost (A$0.001 per brand setup)
- **AG-01 (outbound_citation_count + has_author_attribution):** Closes the Citation
  Formatting gap with Princeton GEO research basis; strengthens the
  `citation_probability_score` formula with two real input signals

---

*Document prepared: June 5, 2026*
*LLD current version: v8.15 | 5,809 lines | 37 tables*
*Research scope: Semrush, danishashko OSS, MentionDesk, Foglift (today's session)*
*Prior session research (Hall, Profound, AthenaHQ, Scrunch, Otterly, Peec AI, HubSpot)
documented in the LLD changelog (v8.2–v8.11).*
