# VisibleAU / VisibleGlobal — Full Feature Analysis
# Sources: PRD v1.14, Phase 2 Competitor PRD, ChatGPT LLD v7, ChatGPT Unified
# Intelligence, Final Research Pass, Sprint 4–7 prompts, live market research
# June 2026
# Purpose: Surface every strong, valuable feature for Phase 2+ product design

---

## HOW TO READ THIS DOCUMENT

Each feature is rated on two dimensions:
- **Strategic value** — how much moat it builds (A = category-defining, B = strong differentiator, C = parity/hygiene)
- **Build effort** — at solo weekend pace (S = small <1 week, M = medium 1–4 weeks, L = large 1–3 months, XL = >3 months)

Market gap status drawn from live June 2026 research across 20+ platforms.

---

## TIER 1 — CATEGORY-DEFINING (Build these or lose the market)

These are features that the market either does not have at all, or gates to enterprise
at $2,000+/mo. For VisibleAU targeting AU agencies and SMBs, these ARE the moat.

---

### F1 — Multidimensional Visibility Score
**Strategic value: A | Effort: M**

Every competitor reports a single "you appeared in 23% of responses" number.
This is strategically useless — a brand mentioned 30% of the time negatively is
worse than one mentioned 15% positively.

The 5 dimensions:
1. **Frequency** — % of queries where brand appears (the standard metric)
2. **Sentiment** — positive / neutral / negative across mentions
3. **Accuracy** — does AI describe the brand correctly? Hallucination flags here
4. **Position** — mentioned first / middle / last / buried in list
5. **Context** — recommended ("you should use X") vs listed vs described neutrally

**Why no competitor has this:** Sentiment is table stakes. Accuracy + Position +
Context are genuinely novel. No tool in the June 2026 market offers all 5 combined.

**Market evidence:** The Conductor AEO/GEO Benchmarks Report (Jan 2026) calls out
"AI shelf share" and multi-dimensional measurement as the next phase. Profound has
sentiment but not accuracy or context scoring.

**Source:** PRD v1.3 Module 1, Final Research Pass Finding 7, Princeton GEO 2024

---

### F2 — Research-Backed Action Center with Effect Sizes
**Strategic value: A | Effort: M**

The #1 universal complaint across every GEO tool in every market: "tools tell you
what's wrong but not what to do." Even tools that give recommendations give generic,
vague advice with no research backing.

VisibleAU's Action Center ties each recommendation to a named research source with
a quantified effect size:

| Action | Effect size | Source |
|--------|------------|--------|
| Add expert quotes | +41% visibility | Princeton GEO 2024 |
| Add cited statistics | +30–115% | Princeton GEO 2024 |
| FAQ blocks in content body | +12% AI Mode citations | SE Ranking Dec 2025 |
| Update content within 2 months | 5.0 vs 3.9 citations | SE Ranking Dec 2025 |
| Wikipedia presence | 47.9% ChatGPT citation share | Tinuiti Q1 2026 |
| Reddit participation | 24% Perplexity citation share | Tinuiti Jan 2026 |
| LinkedIn presence | #5 ChatGPT cited domain Feb 2026 | Profound |
| Comparison articles | High-intent AI query type | HubSpot AEO 2026 |
| AU local citations | Suburb-level LLM weighting | VisibleAU original |
| Press/earned media | Citation corroboration | TEAM LEWIS PR |

**Anti-snake-oil filter:** Explicitly blocks recommendations that don't work (AI meta
tags, FAQ schema markup, hidden prompt injection) — no other tool does this, and
this honesty is itself a positioning differentiator.

**Market gap:** Peec AI attempts recommendations but they're generic. AthenaHQ's
"Action Center" is incomplete per June 2026 agency reviews. No tool shows effect
sizes. Zero tools show an anti-pattern filter.

**Source:** PRD v1.3 Module 5, Final Research Pass Finding 8, ChatGPT Unified Doc

---

### F3 — AU Vertical Prompt Packs (124 / 104 / 108 prompts)
**Strategic value: A | Effort: L (content-heavy)**

Every global GEO tool uses generic or US-centric prompts. AU buyers search
differently — suburb names, Australian trades terminology, AU regulatory context
(AHPRA for allied health, licensed tradies, ABN lookup).

3 v1 packs + 9 more in roadmap:
- **AU Tradies** (124 prompts): plumbers, electricians, builders, HVAC — suburb-level
- **AU Allied Health** (104 prompts): physio, chiro, psych, OT — AHPRA-aware
- **AU SaaS** (108 prompts): AU-tuned comparison and buyer journey

Each prompt has: category, topic, expected mention type, rank — enabling corpus
validation against real citation outcomes.

**Market gap:** Hall Technologies (Sydney, Blackbird-backed) is closest competitor
but is enterprise/sales-led. No self-serve AU-first prompt tool exists at SMB pricing.

**Source:** PRD §8 Module 2, Sprint 5 prompt

---

### F4 — llms.txt Generator + Validator
**Strategic value: A | Effort: M**

The "robots.txt for AI crawlers." Only 7.4% of Fortune 500 have implemented it;
AU SMB adoption is essentially zero. Among 20+ tools surveyed, only Cairrot and
Otterly touch it, and neither generate it properly.

VisibleAU generates a compliant llms.txt from a site crawl:
- Identifies key pages by traffic + topical authority
- Generates Markdown per Jeremy Howard's proposed standard
- Validates format, size (<10KB), and serving (text/plain or text/markdown)
- 6-component depth scoring (/18): present, H1+blockquote, sections, links, depth,
  llms-full.txt companion
- One-click download OR hosted via VisibleAU CDN
- Auto-regenerates monthly

**Market gap:** No tool at SMB pricing generates AND validates AND hosts llms.txt.

**Source:** PRD v1.3 Module 5b, Final Research Pass Finding 1, Sprint 7 prompt

---

### F5 — AI Crawler Log Analytics
**Strategic value: A | Effort: M**

Real-time monitoring of when GPTBot, ClaudeBot, PerplexityBot visit the customer
site — what pages they read, what errors they hit, whether they retry.

Per AI Search Tools 2026 evaluation: only Promptwatch and Profound (Enterprise
tier only, $2,000+/mo) offer this. VisibleAU ships it at Growth tier.

Implementation: lightweight JS snippet OR server log forwarding.

Data surfaced:
- AI bot visit frequency by page
- Pages with 404 errors for AI crawlers
- Pages with JS render failures (bot sees empty page)
- Pages with slow responses causing bot timeout
- Bot retry patterns

**Market gap:** Enterprise-only feature brought to Growth tier at indie pricing.

**Source:** PRD v1.1 roadmap, Final Research Pass Finding 2

---

### F6 — Local AI Trust Radius (Suburb-Level)
**Strategic value: A | Effort: M**

No GEO/AEO tool tracks visibility at suburb level. All competitors track at
country or state level at best. For AU tradies, allied health, and local service
businesses, suburb-level visibility IS the business.

VisibleAU tracks:
- Visibility score per suburb (from suburb-specific prompt variants)
- Comparison against nearby competitors in same suburb
- "Near me" and "in [suburb]" prompt success rate
- AU directory presence (Hipages, Yellow Pages AU, ServiceSeeking, Word of Mouth)
- Google Business Profile completeness + reviews + ratings
- NAP consistency across web mentions

**Market gap:** Confirmed by Scrunch, Profound, Otterly, AthenaHQ — all country-level
only. Australian agencies specifically need suburb-level for tradie/allied health clients.

**Source:** PRD §8 Module 4, Phase 2 Competitor PRD D6, ChatGPT Unified Doc

---

### F7 — Citation Failure Diagnosis
**Strategic value: A | Effort: M**

Answering the customer's actual question: "Why does AI recommend my competitor
instead of me?"

Surfaces:
- Which competitor pages are being cited (URL-level, not domain-level)
- What those pages have that yours don't (FAQ blocks, expert quotes, stats, authority signals)
- Which prompts trigger competitor citations but not yours
- Confidence label (Confirmed / Likely / Hypothesis) on each diagnosis
- Remediation recommendation with effect size

**Market gap:** AthenaHQ attempts this but June 2026 agency reviews describe it as
"incomplete." Peec AI has directional hints. No tool gives a full diagnosis with
evidence trail.

**Source:** Phase 2 Competitor PRD D2, ChatGPT Unified Doc, PRD §8 Module 5

---

## TIER 2 — STRONG DIFFERENTIATORS (Phase 2 must-haves)

---

### F8 — AI Share of Voice Engine
**Strategic value: B | Effort: M**

Competitive metric: what % of AI answers in your category go to you vs competitors?

Breaks down by:
- Brand share vs competitor share
- By AI engine (ChatGPT SoV vs Gemini SoV vs Perplexity SoV)
- By prompt category (service discovery vs comparison vs pricing)
- By region (AU vs NZ vs UK once multi-region)
- Trend over time (weekly / monthly delta)
- Confidence + sample size warning when data is limited

**Market gap:** Profound and Peec have Share of Voice but not broken down by
engine + category + region simultaneously. AU agencies need all three at once.

**Source:** Phase 2 Competitor PRD R4, market research

---

### F9 — Visibility Drift Detection + Alerts
**Strategic value: B | Effort: M**

AI model updates change citation patterns overnight. Brands need to know when
their visibility declines before clients notice.

Triggers:
- Visibility score drops 10+ points in any dimension
- New competitor appears in responses you previously owned
- Citation of your brand disappears from a prompt you scored well on
- A model update detected (new behaviour pattern across prompt set)

Alert channels: email (Tuesday 9am AEST default), Slack webhook, Discord,
custom webhook, SMS (agency pro tier)

Re-audit trigger: 14 days after marking a recommendation "complete" to measure
actual impact of the fix.

**Market gap:** Most tools have basic alerts. VisibleAU differentiates by tying
alerts to per-engine, per-prompt level (not just overall score), and by connecting
alerts directly to the recommendation engine.

**Source:** PRD §8 Module 7, Phase 2 Competitor PRD R5, Sprint 8 prompt

---

### F10 — Technical AI Infrastructure Audit
**Strategic value: B | Effort: L**

8 technical dimensions scored internally, surfaced as 5 customer-facing categories:

Internal 8 dimensions:
1. robots.txt AI crawler config (/18) — 27 bots tracked across 3 tiers
2. llms.txt depth (/18) — 6-component scoring
3. Schema markup richness (/16) — reality-check: honest about what it actually affects
4. Meta signals (/14)
5. Content structure (/12) — answer capsules, FAQ blocks, headings
6. Brand & Entity signals (/10) — ABN Lookup, Wikipedia AU, AU TLD, AU directories
7. Negative signals (/6) — CTA overload, popup density, thin content, keyword stuffing
8. AI discovery endpoints (/6) — .well-known/ai.txt, /ai/summary.json

Customer-facing 5 categories (Foglift-style rollup):
Technical / Content / Authority / Schema / Performance

CDN blocking detection: Cloudflare, Akamai, Vercel blocking GPTBot/ClaudeBot.
SSR check: SPA pages invisible to AI crawlers flagged.
Answer capsule formatter: Q-headings without direct answers identified + suggested rewrites.

50-site validation corpus required (Spearman correlation >0.7 gate).

**Market gap:** Profound's Agent Analytics covers crawler logs. No tool does the
full 8-dimension technical stack at SMB pricing with AU-localised Brand & Entity.

**Source:** PRD §8 Module 5b, Sprint 7 prompt

---

### F11 — Agency Multi-Brand Dashboard
**Strategic value: B | Effort: M**

Core agency workflow features that most tools charge enterprise pricing for:
- Switch between client brands instantly (no re-login)
- Bulk re-audit triggering across multiple brands
- Unified alert inbox across all brands
- White-label PDF report generation (logo + colors swappable)
- Client login portal (limited view — client sees own data, agency edits)
- Per-client workspace with separate billing
- Bulk export to CSV, Looker Studio connector

**Market gap:** Profound's agency features are enterprise-priced. Slate is
agency-built but AU-unaware. VisibleAU targets AU agencies at indie-friendly pricing
($499/mo Agency tier for up to 5 brands).

**Source:** PRD §8 Module 6, Phase 2 Competitor PRD, market research

---

### F12 — Visibility Confidence Score
**Strategic value: B | Effort: S**

Every score carries a confidence label based on:
- Sample size (number of prompt runs)
- Provider variance (same prompt → different answer across runs)
- Prompt volatility (how much the answer changes run-to-run)
- Recency (how fresh the data is)

Labels: **Confirmed** / **Likely** / **Hypothesis**

Rules enforced:
- Never show high-confidence language when sample count is below threshold
- "Insufficient data" shown clearly when data is too thin
- Score display suppressed rather than shown misleadingly

**Market gap:** No competitor shows per-score confidence labels at SMB tier.
Profound has it at Enterprise. This is the anti-snake-oil play.

**Source:** PRD §8 Module 1, Phase 2 Competitor PRD D3, ChatGPT LLD v7

---

### F13 — Prompt Volume Intelligence (AU-scoped)
**Strategic value: B | Effort: L**

Profound's Conversation Explorer uses 1.5B+ anonymised real-user conversations.
VisibleAU can't compete at that data scale — but can offer a scoped AU version:

- AU-specific prompt volume estimates (what AU buyers actually ask AI about)
- Topic trending (which AU categories are growing in AI search volume)
- Prompt suggestion engine: "here are 10 high-volume prompts for AU tradies you're
  not currently tracking"
- Helps agencies discover which client prompts to track

Implementation: partner with a panel data provider OR model from VisibleAU's own
growing audit dataset as it scales post-launch. Start with directional, label clearly.

**Market gap:** Profound's prompt volume is US-enterprise-only. No AU-specific
prompt volume tool exists.

**Source:** Market research, Phase 2 Competitor PRD R1

---

### F14 — Client Narrative Reporting (Agency)
**Strategic value: B | Effort: M**

Auto-generated executive summary report for agency clients:
- "Your AI visibility this month: X" with plain-English interpretation
- What changed and why it matters
- Top 3 wins + Top 3 gaps
- Recommended next steps with expected impact
- Evidence snapshots (actual AI responses showing/not showing brand)
- White-label: agency logo, colors, custom domain

Monthly cadence with automated delivery. Not a dashboard — a story.

**Market gap:** Most tools produce dashboards. Agencies need client-ready narratives.
Profound has custom reporting but at enterprise pricing.

**Source:** Phase 2 Competitor PRD D5, ChatGPT Unified Doc (Client Narrative
Intelligence), ChatGPT Killer Features (Agency Recurring Reporting Engine)

---

### F15 — LLM Conversion Attribution
**Strategic value: B | Effort: M**

Tracks sessions that came from AI engines and connects them to conversions:
- Detects ChatGPT / Perplexity / Claude / Gemini referrers (HTTP referrer +
  user-agent patterns + UTM auto-tagging)
- Surfaces "X sessions this week from AI engines" dashboard tile
- Connects to existing analytics (GA4) for conversion data
- Shows AI-referred conversion rate vs Google-referred

Why this matters: Tinuiti data shows AI-referred visitors convert at 14.2% vs
Google's 2.8%. This single metric justifies the monthly subscription on its own.

**Market gap:** Profound has it at Enterprise only. AthenaHQ partial version.
No tool at SMB/agency pricing.

**Source:** PRD v1.1 roadmap, Final Research Pass

---

### F16 — Agentic Content Workflow
**Strategic value: B | Effort: L**

Close the gap between "here is the problem" and "here is the fix published":

- Visibility gap → AI-drafted content brief → human review → publish
- "You need a Wikipedia article" → AI drafts it → one-click to export
- "You need a comparison article [Competitor] vs [You]" → AI drafts outline + intro
- FAQ blocks identified as missing → AI generates them → copy to clipboard
- Expert quote opportunities identified → outreach email template generated

Content stays in VisibleAU until approved. No auto-publishing without human review.

**Market gap:** AirOps and Quattr do this at enterprise. Rankability does workflow.
No tool at AU SMB pricing. This is the "tracking to action" gap the entire market
has identified as the #1 missing feature.

**Source:** Market research, Phase 2 Competitor PRD, ChatGPT Unified Doc
(Operational Workflow Engine)

---

### F17 — Recurring Audit Scheduling
**Strategic value: B | Effort: S**

Schedule audits to run automatically:
- Starter: weekly
- Growth: 3x per week
- Agency: daily
- Compare results over time with delta report
- Detect improvement, decline, stable areas between periods

**Market gap:** Table stakes for enterprise tools but missing or manual in most
SMB-tier tools.

**Source:** PRD §8 Module 3, Phase 2 Competitor PRD D4

---

### F18 — AU Brand & Entity Audit
**Strategic value: B | Effort: M**

AU-localised entity verification that no global tool has:
- **ABN Lookup verification** — is the brand registered with the ATO? AI trusts
  verified entities more
- **Wikipedia AU presence** — Australian Wikipedia article vs global Wikipedia
- **AU TLD signal** — .com.au domain vs generic .com (AU AI queries weight this)
- **AU directory aggregate** — Hipages, Yellow Pages AU, ServiceSeeking, Word of
  Mouth, TrueLocal presence and rating
- **ABR (Australian Business Register) match** — business name vs registered entity

**Market gap:** Zero global tools have AU-specific entity scoring. This is a pure
VisibleAU original.

**Source:** PRD §8.8, Sprint 7 prompt, Final Research Pass

---

## TIER 3 — PARITY / TABLE STAKES (Phase 2 must-have but not differentiating)

These features are required to be credible against Profound, AthenaHQ, and Otterly.
Not building them means losing deals to competitors.

---

### F19 — Prompt Intelligence Engine
Multi-engine prompt tracking with historical comparison. Track which prompts surface
the brand, which don't, performance trend over time. Competitor prompts tracked too.
**Effort: M** | Already in Phase 1 (Sprint 1–3)

### F20 — Citation Tracking
URL-level citation extraction: which pages are AI citing, citation frequency,
citation trend, citation share vs competitors. Store evidence snapshots.
**Effort: M** | Already in Phase 1 (Sprint 3)

### F21 — Mention Tracking
Brand mention frequency, competitor mentions, mention sentiment, mention context
snippets, multi-provider comparison.
**Effort: S** | Already in Phase 1 (Sprint 3)

### F22 — Competitor Benchmarking
Side-by-side visibility comparison against named competitors, by engine and prompt
category. Share of Voice relative to competitors.
**Effort: M** | Partially in Phase 1

### F23 — Multi-Engine Coverage
v1: ChatGPT, Claude, Gemini, Perplexity (4 engines)
v2: Copilot, AI Overviews, DeepSeek, Grok
**Effort: S per engine** | In Phase 1

### F24 — Hallucination Detection
Flag when AI incorrectly describes the brand (wrong pricing, wrong products, wrong
location). Alert customer with evidence. Suggest correction approach.
**Effort: M** | Deferred to v1.1

### F25 — Content Gap Analysis
Identify topics where competitors are cited and the brand is absent. Surface as
actionable content opportunities ranked by prompt volume + impact.
**Effort: M** | Phase 2

### F26 — Schema Markup Auditor (with reality-check)
Scan existing schema, identify gaps, generate correct schema — AND be honest that
schema has zero measurable impact on ChatGPT/Claude/Gemini/Perplexity per SE
Ranking research. This honesty is itself a differentiator.
**Effort: S** | Sprint 7

---

## TIER 4 — FUTURE MOAT (Phase 3 / v2.0)

These are early-stage or emerging features that become strategic moats if built
before competitors, but are not v1 or v2 priorities.

---

### F27 — MCP Server Scaffolding
Generate MCP (Model Context Protocol) server stubs for SMB use cases:
booking, inventory, FAQ, real-time availability. MCP lets AI agents ACT on
your site — not just read it. 12–18 months ahead of the market.
**Effort: XL** | v2.0 (months 10–15)

### F28 — Topical Authority Gap Analyzer
Cluster site pages by topic embedding similarity. Compare topical depth against
competitors who get cited. Output: "Your competitors own [topic] with 12–18 cluster
pages; you have 2." Growth tier+.
**Effort: L** | v1.1

### F29 — Founder / Personal Brand Visibility Tracking
Parallel audit for the founder alongside the brand. "Who is the leading [vertical]
expert in [region]?" prompts. No existing tool tracks founders.
**Effort: M** | v1.2

### F30 — Topical Sentiment Segmentation
Sentiment by topic cluster, not just overall. A brand may be "neutral" overall but
very negative on "pricing" and very positive on "customer service." Surfaces as
heatmap. Growth tier+.
**Effort: M** | v1.2

### F31 — Conversation Explorer (Real User Prompt Data)
What users actually ask AI about your category. Profound's version uses 1.5B+ real
conversations at enterprise pricing. VisibleAU builds AU-scoped version from own
audit data + optional panel partnership. Long-term data asset.
**Effort: XL** | v2.0

### F32 — AI Reputation Defense
Bundle: sentiment monitoring + anti-pattern filter + drift detection + competitor
displacement alerts under a single named product surface. Agency retention feature.
**Effort: M (naming + UI)** | v1.1 polish

### F33 — Adaptive Segment-Aware UX
Different default dashboard views for agencies vs SMBs vs local businesses.
Agency sees multi-brand table. SMB sees health check + top 5 fixes. Local business
sees suburb-level trust radius. Same data, adaptive presentation.
**Effort: M** | Phase 2

### F34 — Citation Outreach Automation
Identify third-party articles that cite competitors but not the brand. Surface verified
publisher contact details. Generate ready-to-send outreach email. Close the citation
gap through PR not just content.
**Effort: M** | v1.1

### F35 — Prompt Fan-Out
One prompt → automatically generate 20–30 variations (short, long, comparison,
"what should I choose?", persona-aware). Track which variant surfaces the brand.
AthenaHQ has a version of this. VisibleAU adds AU-specific phrase patterns.
**Effort: M** | Phase 2

### F36 — Multi-Region Expansion
NZ, UK, Canada separate prompt libraries + local SEO signals. True multi-region
only when: UK customer demands data residency OR >30% MRR from non-AU region.
**Effort: XL** | v2.0 (months 10–15)

### F37 — OSS Funnel Components
Open-source narrow funnel-feeders that drive VisibleAU awareness:
- @visibleau/wilson-ci-scorer (npm)
- @visibleau/llms-txt-generator (npm + CLI)
- visibleau/au-tradies-prompt-pack (GitHub, MIT)
- visibleau/au-allied-health-prompt-pack (GitHub, MIT)
- visibleau/citation-source-extractor (GitHub, MIT)
**Effort: S–M each** | Sprint 11–12

---

## FEATURE PRIORITY MATRIX BY PHASE

### Phase 1 (Sprints 1–12, current) — Foundation
F3 Vertical packs, F17 Recurring audits, F19–F23 Parity features,
F4 llms.txt generator, F10 Technical audit, F2 Action Center,
F1 Multidimensional score, F12 Confidence labels, F18 AU Brand Entity

### Phase 2 (new sprint sequence, start Sprint 1) — Differentiation
F5 AI crawler logs, F6 Local AI trust radius, F7 Citation failure diagnosis,
F8 Share of Voice, F9 Drift detection, F11 Agency multi-brand,
F13 Prompt volume (AU-scoped), F14 Client narrative reporting,
F15 LLM conversion attribution, F16 Agentic content workflow,
F24 Hallucination detection, F25 Content gap analysis,
F33 Adaptive segment-aware UX, F35 Prompt fan-out

### Phase 2.5 — Expansion
F28 Topical authority gap, F29 Founder visibility, F30 Topical sentiment,
F32 AI reputation defense (naming + bundle), F34 Citation outreach,
F37 OSS funnel components

### Phase 3 — Moat
F27 MCP scaffolding, F31 Conversation Explorer (real user data),
F36 Multi-region expansion

---

## KEY MARKET INTELLIGENCE FINDINGS (June 2026)

1. **Profound raised $96M Series C (Lightspeed + Sequoia), valued $1B.** Named G2
   Winter 2026 AEO Leader. Their moat: Conversation Explorer (1.5B+ real user
   prompts), Agent Analytics (server log crawler monitoring), 10+ engine coverage.
   Enterprise-only pricing ($2,000+/mo) — VisibleAU's target market is below their
   ICP.

2. **The #1 identified market gap in June 2026:** "You can see the problem. You
   cannot fix it inside the tool." Every review article independently concludes that
   monitoring-to-action workflow is where all tools fall short. This is F2 + F16.

3. **Agentic workflows are the new frontier.** Quattr, AirOps, and Evertune are
   building "visibility gap → published content" pipelines. All are US-enterprise.
   VisibleAU can own this at AU SMB/agency tier.

4. **Prompt volume estimation is now a category.** Profound, OmniSEO, and new
   entrants all offer "AI search volume." AU-specific prompt volume = genuine gap.

5. **Local/multi-location tracking is emerging.** Rank Prompt offers one-click
   multi-location tracking for franchises. No AU-specific local tool exists.

6. **94% of CMOs plan to increase GEO/AEO investment in 2026** (Conductor report).
   Enterprise budget is flowing in. SMB/agency tier is still underserved.

7. **AU market: Hall Technologies (Sydney, Blackbird-backed) is the closest
   direct competitor** — but sales-led, enterprise-focused, AU-built. VisibleAU
   self-serve + AU-first + indie pricing = complementary market position, not
   head-to-head.

8. **No AU-specific GEO platform exists at SMB/agency self-serve pricing.**
   The AU agency market is being served by global tools with zero AU context.

---

## WHAT VisibleAU DELIBERATELY DOES NOT BUILD

- Backlink building service (different category)
- Content publishing automation (we suggest, you publish — agentic workflow stops at draft)
- Social media scheduling
- Email marketing / CRM
- Enterprise SOC 2 / SSO / RBAC (Phase 3 if needed)
- Full multilingual UI (English-first through Phase 2)
- Paid ad management

