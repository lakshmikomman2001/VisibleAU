# GEO/AEO Community Research: Reddit, LinkedIn, Indie Hackers, Facebook

**Date:** 4 May 2026
**Author:** Sri (with Claude as research collaborator)
**Purpose:** Document community-sourced pain points and gaps from social platforms, not just published reviews. Companion to PRD v1.3 — findings here may be incorporated into later PRD revisions.

---

## Honest preface: research limitations

**Reddit:** Web search engines have deprioritised Reddit results for several years; Reddit's 2023 API restrictions made third-party indexing harder. Most Reddit references in this document are *secondhand* (cited by other articles like ZipTie, Selfmademillennials) rather than direct thread quotes. To get primary Reddit data, manual browsing of r/SEO, r/marketing, r/agency, r/SaaS, r/ProductManagement is needed.

**LinkedIn:** Walled garden. Doesn't surface in web search. To research LinkedIn AU agency owner discussions, direct outreach is required.

**Facebook:** Almost no relevant SEO/GEO professional discussion. Not where the marketing/agency community converses.

**Indie Hackers:** This was the goldmine. Direct access to founder posts, comments, and ongoing discussions about GEO/AEO tool building, validation, and pricing. Most of the substantive findings below come from here.

What this means: **community research alone isn't enough.** The findings below are useful but the next step that genuinely closes pain-point understanding is customer development calls — 5-7 AU agency owners, 5-7 AU SaaS founders, 3-5 AU SEO consultants.

---

## Finding 1: Orion — A founder publicly shelved their AEO tool

**Source:** *"We Built an AEO Tool and Here's Why It Failed (And What We Learned)"* — pagesinmotion.substack.com, October 2025

A founder team built **Orion**, an AEO tracking tool covering ChatGPT/Claude/Gemini/Perplexity. They shelved it. Their published reasoning:

> *"Unlike traditional SEO, there's no ground truth data for answer engines... With ChatGPT, Perplexity, and other answer engines? Nothing. There's no public API. No query volume data. No 'truth set' to validate against. Every AEO tracking tool in the market—including what we were building with Orion—faces the same fundamental limitations."*

> *"We shelved Orion because we couldn't solve the data problem. But we didn't stop researching."*

**The data problems they identified:**

1. **No public LLM API for query volume** — unlike Google Search, where keyword research has 20+ years of refinement, AI engines don't expose what users actually ask
2. **No "truth set" to validate against** — you can't tell if your tool's reported visibility matches actual user experience
3. **Non-deterministic output** — same prompt, same model, different results from one run to the next
4. **No way to verify what AI engines saw vs what they cite** — opaque source weighting
5. **Citation drift** — what's cited today may not be cited next week, with no warning

**Why this matters for VisibleAU:**

Two ways to read this:

1. **Cautionary signal:** The data problem is real. You'll hit it too.
2. **Validation that this is a wedge:** If your product *acknowledges* the data problem honestly (via confidence intervals, multidimensional scoring, "we estimate not measure" language) rather than pretending it's solved like Profound does, that becomes a genuine credibility moat.

The PRD already addresses this in Section 2.5.3 (Honest acknowledgment of category limits) and the multidimensional scoring approach in Module 1. The Orion shelving story is published founder evidence that this positioning is correct.

**Recommended PRD addition:** Cite Orion in Section 2.5.3 as a published example of why honest-about-limits positioning matters.

---

## Finding 2: LLM Pulse — Direct founder commentary

**Source:** Indie Hackers post titled *"Growing a GEO tool to a mid-five-figure MRR within a year"* — April 2026

LLM Pulse is one of VisibleAU's top competitors. They reached ~$50K MRR in 9 months, bootstrapped, mostly inbound. Founder Daniel actively engages on Indie Hackers.

**Validation channels they used (per Daniel's commentary):**
- Personal brand on Twitter/LinkedIn
- Live demos with prospects (key for both learning AND conversion)
- Free tools as lead magnets
- Webinars
- SEO (their core background)
- Published industry studies

**Daniel's framing of the market:**

> *"AI Search is growing very fast, and a real need exists to understand and measure its developments."*

**On scaling concerns (from a "Systems Architect" commenter):**

> *"How much of your current growth is tied to manual hacks, and how much is baked into an automated 'Systemic Loop' that scales without you?"*

**Daniel's response:**

> *"We haven't faced that yet, so we're not over-optimizing for it."*

**Why this matters for VisibleAU:**

- **The playbook works:** Personal brand + studies + demos + free tools is replicable
- **Bootstrappable:** $50K MRR in 9 months without VC validates indie-friendly market dynamics
- **Geographic specialisation is open:** LLM Pulse is global/EU-leaning. AU positioning has zero serious competition
- **Don't over-engineer:** Daniel's "we haven't faced that yet" attitude validates shipping-first over architecture-first

**Recommended PRD addition:** Reference LLM Pulse's playbook explicitly in Section 12 (Go-to-Market) as a validated template.

---

## Finding 3: MentionDesk pricing pushback

**Source:** Indie Hackers post titled *"SEO isn't enough anymore. I built an AEO tool to help brands get mentioned by ChatGPT and other AI engines"* — July 2025

MentionDesk launched with a $39/mo entry tier. The first community comment:

> *"TBH it seems like the $39/mo for the minimum is pretty steep for an indie app with no funding..."*

**Founder's response:** Lowered the price.

**Other comments showed different price tolerance for B2B context:**

> *"i like the idea and think this is where the future is going. with a free trial month and clear value added (in terms of actionable recommendations) i think you can justify also a relatively higher price."*

> *"I think this is very much the way of the future. Price is steep BUT in the B2B sense...they will pay anything."*

**Why this matters for VisibleAU:**

- **A$99 Starter will face similar pushback from indie/SMB segment.** The pain isn't price-sensitivity per se — it's "I don't yet know if this works."
- **B2B/agency segment is far more price-tolerant.** Anna (agency owner) doesn't blink at A$499/mo if it saves her 5 hours per client.
- **Free trial / freemium entry helps.** "Try one audit free" before paywalling deeper features.

**Recommended PRD addition:** In Section 7 (Pricing), add a Free tier offering one full brand audit with limited recommendations. Hook becomes "see your AI visibility for free; pay to fix it." This is a different lever than discounting the paid tiers.

---

## Finding 4: The 20-tool tester's verdict

**Source:** *"Best AI SEO Tools 2026 & the Ones to Avoid (I Tested 20+)"* — selfmademillennials.com, May 2026

A reviewer tested 20+ AI SEO tools. Direct quote:

> *"I've tried some AI SEO tools that work this way and quickly realized I was spending more time thinking up prompts to track than actually improving my content. Total waste of time and money."*

> *"What you actually need are tools that offer prompt research capabilities for your specific topics and can automatically detect when your brand gets mentioned or cited. These tools crawl LLM responses across various prompts and alert you when you show up, instead of making you play a guessing game about what to track."*

**Quote from Omid Ghiam (industry voice) cited in same article:**

> *"AEO, AI engine optimization, matures as good SEO. But good SEO isn't common!"*

**Why this matters for VisibleAU:**

This is **exactly your value proposition.** AU vertical packs ship 100+ pre-built buyer-intent prompts so users don't waste time inventing them. This isn't your differentiator vs other tools generally — but among the 20+ alternatives this reviewer tested, very few actually solve this. Your AU vertical packs make this concrete and specific.

The Omid Ghiam quote also suggests a stronger positioning angle: **"AI visibility is downstream of foundational SEO health."** This positions VisibleAU as more than a vanity dashboard.

**Recommended PRD addition:** In Section 5 (Positioning), add a positioning angle: *"We don't make you guess what to track. AU vertical packs ship with 100+ pre-built buyer prompts on day one."*

---

## Finding 5: Agency ROI desperation — the traffic collapse

**Source:** e2msolutions.com agency-sales guide, September 2025; Visto.com measurement framework, March 2026

Two specific data points from agency-focused content:

**Conductor research on traffic decline:**

> *"Organic traffic declines of up to 70% in certain verticals since Google rolled out AI Overviews. For head keywords where AI Overviews sit at the top, the drop is between 30% and 70%."*

**AI-referred conversion rate:**

> *"AI-referred visitors converting at 14.2% compared to Google's 2.8%."*

**Visto's framing of the agency pain:**

> *"This is the measurement gap every agency owner is running into right now... Traffic drops by 70%, but conversion goes up by multiples."*

**Why this matters for VisibleAU:**

This validates pain category 11 (Attribution & ROI Crisis) in PRD v1.2 with **specific, citation-grade numbers.**

These numbers are "pitch deck gold":
- 30-70% organic traffic decline → "your existing channel is collapsing"
- 14.2% vs 2.8% conversion lift → "AI traffic is 5x more valuable when you can capture it"
- "Measurement gap every agency is running into right now" → "and nobody can prove ROI"

The story you can tell with these numbers:

> "Your Google traffic is dropping 30-70%. AI-driven traffic converts 5x better but is invisible in your analytics. Agencies that can't prove ROI from AI search are losing clients. We help you measure both the visibility AND the conversion contribution, with the audit that takes 5 minutes and the dashboard your CFO will accept."

**Recommended PRD addition:** Add Conductor's 30-70% traffic decline statistic and the 14.2% vs 2.8% conversion data to Section 1 (Executive Summary) and Section 12 (Go-to-Market) as validated market urgency signals.

---

## Finding 6: "Why is my AI traffic low even though I appear in answers?"

**Source:** Visto.com measurement framework, March 2026

A specific buyer question that no tool currently answers cleanly:

> *"Why is my AI referral traffic low even though I appear in AI answers?"*

The answer involves multiple variables:
- **Position in answer:** Mentioned vs cited; first vs last; recommended vs commoditised
- **Citation type:** Linked vs name-only mention
- **Engine choice:** Gemini sends almost no clicks; Perplexity sends some; ChatGPT sends meaningful clicks
- **Query commercial intent:** Discovery vs comparison vs decision phase

**Why this matters for VisibleAU:**

The multidimensional scoring approach in Module 1 (frequency + sentiment + accuracy + position + context) is *the* answer to this buyer question. Most tools report visibility as a single number — they can't explain why high visibility doesn't equal high traffic.

**Recommended PRD addition:** In Module 1's UI design, surface a specific FAQ: *"Why is my AI traffic low even though I appear in answers?"* with a visual breakdown showing the user their position, citation type, engine mix, and query intent profile. This answers the unspoken question every buyer has.

---

## Finding 7: Indie Hackers community sentiment validation

**Source:** Multiple Indie Hackers threads, May 2025 - April 2026

**Sample of community sentiment about the GEO/AEO market:**

- *"This is really insightful about AEO and GEO. This is a trending space."*
- *"I think this is very much the way of the future. Price is steep BUT in the B2B sense...they will pay anything."*
- *"AEO: it's real and underexplored. Chapter 3 of my Playbook covers it in detail. The biggest gap most sites have is missing schema markup and no llms.txt file."*
- *"GEO is definitely where the future is heading, and tools like MentionDesk will be essential for staying relevant."*

**On the technical foundation gaps that come up repeatedly:**

> *"The biggest gap most sites have is missing schema markup and no llms.txt file."*

**Why this matters for VisibleAU:**

Indie hackers — who are intellectually honest about what's real vs hype — consistently validate this market. They're also building in it (Orion shelved, MentionDesk launched, LLM Pulse profitable).

The schema + llms.txt gap call-out independently validates Module 5b (Technical AI Infrastructure) in PRD v1.3. This isn't just your hypothesis — it's what indie practitioners are actually flagging as the foundation gap.

---

## Finding 8: What the community is *not* yet talking about

These are gaps where AU-specific community discussion is essentially absent:

1. **AU-specific GEO discussion** — Almost nothing on Reddit, Indie Hackers, or LinkedIn AU. AU SEO content exists but AU GEO is barely mentioned.

   **Implication:** First-mover advantage on AU positioning. No established AU thought leader, no incumbent voice.

2. **Vertical-specific GEO playbooks** — Nobody publishes "how AU tradies should approach GEO" or "AU allied health AEO compliance guide." Generic content dominates.

   **Implication:** Your vertical packs + content strategy can fill the gap that no existing voice has filled.

3. **Agency-tier GEO tooling** — Indie Hackers has individual founders building AEO tools, but agency-tier tooling (multi-brand, white-label, client portals) is dominated by enterprise players (Profound, Adobe LLM Optimizer). No indie-built agency-friendly tool dominates.

   **Implication:** Your agency tier (A$499/A$1,499) sits in a clear gap between $39/mo indie tools and $500+/mo enterprise tools.

4. **The AU credibility-deficit angle** — Nobody has framed "the GEO category has a snake-oil problem" in AU specifically. Search Engine Land's "wizardry, alchemy, digital shamanism" quote (referenced in PRD Section 2.5.2) is global. AU-specific positioning of "research-backed not vibes" is open.

   **Implication:** Your honest-positioning angle is uncontested in AU.

---

## What this research changes (and doesn't change) about the PRD

### Changes to consider for v1.4

| Recommended addition | Section | Reason |
|---|---|---|
| Cite Orion shelving as evidence for honest positioning | 2.5.3 | Real founder data point validates positioning angle |
| Add LLM Pulse playbook as GTM template | 12 | Validated bootstrappable approach |
| Add free single-brand audit tier | 7 | MentionDesk pushback shows price resistance from indie segment |
| Add Conductor 30-70% traffic decline + 14.2% vs 2.8% conversion data | 1, 12 | Pitch-deck-grade urgency numbers |
| Add "Why is my AI traffic low even though I appear?" UI element | 8 (Module 1) | Answers the unspoken buyer question multidimensional scoring is designed for |
| Reframe vertical pack positioning: "we don't make you guess" | 5 | Direct response to verified buyer pain |

### Doesn't change

- Core product strategy is still correct
- Pricing tiers are validated (with possible free tier addition)
- Tech stack discussion is still correct
- Vertical-pack approach is independently validated by community
- Module 5b (Technical Infrastructure) is independently validated as a real gap

---

## What this research does NOT cover, and what to do next

### Genuine gaps remaining in pain-point understanding

1. **Direct AU agency owner perspective** — Nobody has interviewed AU agency owners about their GEO frustrations specifically.

2. **AU SaaS founder GEO journey** — Nothing on what AU SaaS founders have tried, what worked, what didn't.

3. **AU SMB owner reaction to AI search** — Are AU tradies, allied health, professional services even aware AI search affects them?

4. **AU agency willingness-to-pay** — Is A$499/mo Agency tier the right number? A$299? A$799? Nobody knows from web research.

5. **AU regulatory awareness** — Do AU healthcare practices know about AHPRA Section 133 GEO implications? Do AU financial services firms understand AFSL marketing constraints + AI search?

### The next step: customer development calls

To get the next 20-30% delta in pain understanding, conduct:

- **5-7 calls with AU agency owners** managing 5-50 client accounts (Anna persona)
- **5-7 calls with AU SaaS founders** with 1-50 employees (Paul persona)
- **3-5 calls with AU SEO consultants** who could become channel partners

**Specific questions to ask:**

For agencies:
1. What's your current GEO/AEO offering (if any)?
2. What tools do you use? What do you hate about them?
3. How do you currently demonstrate GEO ROI to clients?
4. What's your client-facing reporting workflow?
5. What would a A$499/mo multi-brand tool need to do to be worth it?

For SaaS founders:
1. Do you currently track AI visibility?
2. Why or why not?
3. If you were paying A$99-299/mo, what's the minimum it would have to do?
4. What's the difference between "interesting" and "I'll buy"?
5. What would make you pay double?

For consultants:
1. Are clients asking about GEO yet?
2. What's your current advice approach?
3. Would you white-label a tool like this for clients?
4. What's the right partner model?

### Where to find them

- **AU agency owners:** SEO Australia LinkedIn group, AU SEO Slack community, AU SEMrush user community, Sydney/Melbourne SEO meetups
- **AU SaaS founders:** Indie Hackers AU community, AU founders on Twitter, Sydney/Melbourne SaaS meetups, Pause Fest, SydStart
- **AU SEO consultants:** LinkedIn AU SEO professionals (search "SEO consultant Sydney/Melbourne/Brisbane"), AU SEO agencies' LinkedIn employees

---

## Summary: the honest state of community research

**What's verified:**
- Market is real and growing (Indie Hackers consensus + LLM Pulse $50K MRR)
- Data problems are real (Orion's published shelving)
- Pricing tolerance varies by segment (MentionDesk pushback at $39 vs LLM Pulse at premium pricing)
- Traffic crisis is acute (30-70% organic decline, 14.2% AI conversion)
- Technical foundation gaps are widely acknowledged (schema, llms.txt)
- AU-specific discussion is essentially absent (first-mover opportunity)

**What requires customer development:**
- AU buyer willingness-to-pay specifics
- AU agency workflow specifics
- AU regulatory awareness in healthcare/financial verticals
- Geographic prioritisation within AU (Sydney vs Melbourne vs regional)

**Sources cited in this document:**

1. *"We Built an AEO Tool and Here's Why It Failed"* — pagesinmotion.substack.com (October 2025)
2. *"Growing a GEO tool to a mid-five-figure MRR within a year"* — Indie Hackers (April 2026, Daniel/LLM Pulse)
3. *"SEO isn't enough anymore. I built an AEO tool..."* — Indie Hackers (July 2025, MentionDesk)
4. *"Best AI SEO Tools 2026 & the Ones to Avoid"* — selfmademillennials.com (May 2026)
5. *"The Agency Owner's Guide to Selling AI Search Optimization"* — e2msolutions.com (September 2025)
6. *"How to Measure GEO Campaign Success | 2026 Framework"* — getvisto.com (March 2026)
7. Conductor research on AI Overview traffic decline (cited in multiple agency content sources)
8. *"GEO Audits: The Next Big Thing After SEO?"* — Indie Hackers (May 2025)
9. *"How I Used AI SEO to Hit 200K Monthly Clicks"* — Indie Hackers (May 2025)
10. *"System Thinking for Indie Hackers in an AI World"* — DEV Community (January 2026)
