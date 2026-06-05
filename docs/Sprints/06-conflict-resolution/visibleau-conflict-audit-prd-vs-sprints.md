# Conflict Audit: PRD v1.14 vs Design Doc + Prototype + Sprint Prompts

**Audit date:** 12 May 2026
**Auditor:** Claude (self-audit of the 12 sprint prompts I drafted in the prior turn)
**Canonical reference:** `sri-geo-aeo-prd-v1.md` v1.14

**Bottom line:** the sprint prompts I drafted have **significant conflicts** with the PRD. I should have read the PRD more carefully before drafting. The most expensive errors are wrong tier prices, wrong tier limits, and entirely missing Module 5b (Technical AI Infrastructure) which the PRD explicitly calls out as the v1.3 differentiator that ships in Sprint 7.

The prototype is correct — it matches the PRD. My docs drifted from both.

**Severity counts:** 5 critical, 5 high, 5 medium, 14 low = **29 conflicts**.

---

## How to read this

Each conflict has:
- **What** the conflict is, in one line
- **PRD says** — the canonical statement
- **My docs say** — what I drafted
- **Impact** — what breaks if not fixed
- **Recommended fix** — what to change

---

## CRITICAL — fix before Sprint 1 starts

### C1. Tier prices are wrong in CLAUDE.md, Sprint 1, Sprint 10

- **PRD says (§7):** Starter A$99, Growth A$299, Agency A$499, Agency Pro A$1,499 (monthly, AUD)
- **My docs say:** Starter A$49, Growth A$199, Agency A$499 ✓, Agency Pro A$1,499 ✓
  - CLAUDE.md §1
  - Sprint 1 `scripts/setup-stripe-products.ts` line: `priceAud: 4900` and `priceAud: 19900`
  - Sprint 10 §6 TIER_PRICING + §9 pricing-tier copy
- **Prototype says (line 785-803):** A$99 / A$299 / A$499 / A$1,499 — **matches PRD, not my docs**
- **Impact:** Stripe products created at half-price for Starter and two-thirds for Growth. Revenue model breaks; competitive positioning wrong (Starter A$49 anchors too low per PRD §7 Principle #1: "Anchor higher than buyers expect. Otterly's $25/mo Lite anchors low...Start at A$99 = serious-but-accessible").
- **Fix:** CLAUDE.md §1 + Sprint 1 setup script + Sprint 10 §6 TIER_PRICING — change `49 → 99` and `199 → 299`. Pretty much s/A\$49/A\$99/g and s/A\$199/A\$299/g across the three files.

### C2. Tier audit limits are wrong in Sprint 9

- **PRD says (§7 + §8 Module 3):**

| Tier | Brands | Audits | Frequency |
|---|---|---|---|
| Free | 1 | 1/mo | manual |
| Starter | 1 | 4/mo | weekly |
| Growth | 1 | 12/mo | 3×/week |
| Agency | 5 | 30/brand/mo (150 total) | daily |
| Agency Pro | 25 | 60/brand/mo (1500 total) | 2×/day |
| Enterprise | unlimited | unlimited | daily |

- **My Sprint 9 §6 says:**

| Tier | Brands | Audits | Frequency |
|---|---|---|---|
| Free | 1 ✓ | 1/mo ✓ | manual ✓ |
| Starter | 1 ✓ | 5/mo ✗ | monthly ✗ |
| Growth | **5** ✗ | 25/mo ✗ | weekly ✗ |
| Agency | **20** ✗ | 100/mo ✗ | weekly ✗ |
| Agency Pro | **100** ✗ | 500/mo ✗ | daily ✗ |
| Enterprise | unlimited ✓ | unlimited ✓ | daily ✓ |

- **Impact:** Three tiers have wrong brand counts (Growth allows 5 instead of 1; Agency allows 20 instead of 5; Agency Pro allows 100 instead of 25). All paid tiers except Enterprise have wrong frequencies. The cron logic in Sprint 9 schedules audits at the wrong cadence; quota gate fires at the wrong moment.
- **Fix:** Rewrite Sprint 9 §6 `TIER_AUDIT_LIMITS` to match PRD §7. Update the frequency picker in Sprint 9 §8 schedule-form. Update the quota meter copy in Sprint 10 §8 settings billing.

### C3. Sample audit spec is wrong in Sprint 11 (engine count + sprint placement)

- **PRD says (§7 Pricing Principle #6 + §11 Sprint 10):** "1 engine (ChatGPT), 5 prompts, single run, ~90 seconds, ~A$0.10 cost". Built **Sprint 10** alongside onboarding.
- **My Sprint 11 §7 says:** "2 engines (ChatGPT + Claude) × 5 prompts × 1 run = 10 calls". Built **Sprint 11**.
- **Impact:** Double the cost (~A$0.20 vs A$0.10), longer wait (>90s with 2 engines in parallel), wrong sprint placement (Sprint 10 onboarding flow expects the sample audit endpoint to exist).
- **Fix:** Move sample audit to Sprint 10. Cut to 1 engine (ChatGPT only). Cost budget A$0.10. Update Sprint 11 to remove sample audit deliverable and Sprint 10 to add it.

### C4. Module 5b (Technical AI Infrastructure) is entirely missing from sprint plan

- **PRD says (§8 Module 5b + §11 Sprint 7):** v1 MVP includes 5 capabilities:
  1. **llms.txt generator + validator** ("Only 7.4% of Fortune 500 have implemented; AU SMB adoption essentially zero. This is a clear differentiator.")
  2. **robots.txt AI crawler configuration helper**
  3. **Schema markup auditor (with reality-check)**
  4. **SSR check** ("Client-side-only SPAs are completely invisible to AI crawlers — a foundational issue most tools don't surface")
  5. **Answer capsule formatter helper**
- **Prototype has dedicated screens** for all 5 (lines 2458 llms.txt, 2543 schema audit, 2600 SSR check, 2655 answer capsules, 2704 robots.txt).
- **My Sprint 7 says:** Local SEO + 50-site corpus + AU directory tracking. **Zero Module 5b coverage.**
- **Impact:** The v1.3 differentiator the PRD explicitly calls out doesn't ship. The prototype shows 5 screens that have no implementation path in my sprint plan. Customers expect "scan my site for llms.txt" on launch; it won't exist.
- **Fix:** Restructure Sprint 7 entirely. Per PRD §11 the original Sprint 7-8 was split specifically because Module 5b deserves its own sprint. My Sprint 7 should be Module 5b; my Sprint 8 (which is closer to PRD §11 Sprint 8) should absorb Local SEO + drift + exports + webhooks + confidence labels. See H2 below for the bigger sprint-scope correction.

### C5. Stack: Database choice contradicts PRD

- **PRD says (§10 Technical Architecture):** "Postgres via **Supabase** | Well-suited; Row Level Security helps multi-tenant"
- **PRD also says:** "**Row-level security on all tenant-scoped tables**" (§10 Security & compliance baseline)
- **My docs say:** Vercel Postgres
  - CLAUDE.md §3: "Vercel Postgres ... Hosted on Vercel Postgres in v1 (Hetzner option for v2)"
  - Sprint 1: `@vercel/postgres` dependency, Vercel Postgres setup
- **Impact:** Different deployment, different RLS model (Supabase has built-in RLS via Postgres policies; Vercel Postgres requires manual policy setup), different file storage path (Supabase Storage is in stack; Vercel has no equivalent). Auth flow may also differ if Clerk integration uses Supabase JWT exchange.
- **Fix:** Decide which is canonical. Two options:
  - **Option A (PRD wins):** Switch to Supabase. Bump CLAUDE.md §3 + Sprint 1 setup. Add RLS migration to Sprint 1. Use Supabase Storage for PDF reports.
  - **Option B (My docs win):** Update PRD §10 to reflect Vercel Postgres. Document why RLS is at app layer (not DB layer). Choose alternative file storage.
  - **Recommendation:** Option A. PRD §10 was carefully reasoned (RLS is part of multi-tenancy strategy). I drifted to Vercel Postgres without consulting the PRD.

---

## HIGH — missing scope; significant sprint restructuring needed

### H1. Sprint 7 / Sprint 8 scope is swapped vs PRD

- **PRD §11 says:**
  - **Sprint 7:** Module 5b (Technical Infrastructure) + 50-site validation corpus + OSS-derived additions (27 AI bots, CDN crawler check, AI discovery endpoints, schema richness scoring, llms.txt depth scoring, AU-localised Brand & Entity scoring, 47 citability methods, Negative signals detection, Prompt injection detection). **~22 additional days vs baseline.**
  - **Sprint 8:** Module 4 (Local SEO) + Multi-engine polish + drift detection + alerts + SARIF/JUnit/GHA + confidence labels + webhook integrations. **~5-7 additional days vs baseline.**
- **My sprints say:**
  - **Sprint 7:** Local SEO + 50-site corpus + citation aggregation. ~20-26 hours.
  - **Sprint 8:** Drift detection + SARIF/JUnit/GHA exports. ~24-30 hours.
- **Impact:**
  - Sprint 7 hour estimate is **off by an order of magnitude** (mine: 20-26h; PRD: ~130-180h at weekend pace). The 22 additional days × 6-8 hrs = 130-180h.
  - Sprint 8 is missing webhooks (Slack/Discord/Sheets/Airtable) and confidence labels (which I put in Sprint 6 instead).
  - 47 citability methods catalogue is missing from any sprint.
  - AU-localised Brand & Entity scoring (ABN Lookup, Wikipedia AU, AU TLD signal) is missing.
  - Negative signals detection (8 anti-citation patterns) is missing.
  - Prompt injection detection (8 manipulation patterns) is missing.
- **Fix:** Major rewrites of Sprint 7 + Sprint 8 prompts. Realistic option: split Sprint 7 into 7a (Module 5b core: llms.txt + robots.txt + schema audit + SSR + answer capsules) and 7b (OSS-derived adds: AI bots, CDN check, AI discovery, schema richness, llms.txt depth, Brand & Entity, negative signals, prompt injection, 47 methods catalogue). Each at 60-80 hours.

### H2. Sprint 9 / Sprint 10 scope is swapped vs PRD

- **PRD §11 says:**
  - **Sprint 9:** Agency tier — multi-brand support, agency dashboard, **white-label PDF reports**, **client login (limited view)**, bulk re-audit, bulk export to CSV/GA4/Looker Studio
  - **Sprint 10:** Onboarding — self-serve flow, **sample audit for free**, upgrade flow
- **My sprints say:**
  - **Sprint 9:** Scheduled audits + portfolio analytics + weekly digest (Inngest cron, audit_schedules table)
  - **Sprint 10:** Stripe billing + tier mgmt (webhooks, checkout, customer portal)
- **Impact:** PRD's Sprint 9 agency tier scope is **entirely missing**. PRD's Sprint 10 sample audit is in my Sprint 11 (and wrong; see C3).
  - White-label PDF (PRD: Agency tier feature) — my Sprint 4 has a basic PDF but no theming, no logo swap, no agency report styling.
  - Client portal / limited view — not in any of my sprints.
  - Bulk re-audit operations — not in any of my sprints.
  - GA4 / Looker Studio export — not in any of my sprints (mine has PDF/CSV/JSON/SARIF/JUnit/GHA only).
  - Schedule audits + portfolio analytics (my Sprint 9 content) **doesn't appear as a labelled sprint in PRD §11** — it's implicit in tier frequencies. So Sprint 9 in my plan is real work that PRD doesn't budget for; either remove it or claim space from another sprint.
  - Stripe billing is part of "Onboarding" sprint per PRD (upgrade flow). My Sprint 10 has all Stripe scope; PRD Sprint 10 has stripe AS PART OF onboarding alongside sample audit + self-serve flow.
- **Fix:** Rewrite Sprint 9 to be Agency tier (multi-brand, white-label PDF, client portal, bulk export). Move Stripe billing into Sprint 10 alongside sample audit + onboarding flow. Sprint 11 absorbs landing + polish (no sample audit). Either drop "scheduled audits + portfolio analytics" or find another sprint home (could be Sprint 9 alongside agency or Sprint 12 alongside launch).

### H3. Webhook integrations (Slack/Discord/Sheets/Airtable) missing from all sprints

- **PRD says (§11 Sprint 8 + §16 OSS feature #4-#5):**
  - "webhook integrations (Slack/Discord/Sheets/Airtable/custom + code recipes for Zapier/n8n/Make.com)"
  - "Webhook event taxonomy (`scan.completed`, `score.dropped`, `score.changed`) with code recipes" — Foglift reference
- **My docs say:** No mention of webhooks anywhere. Sprint 9 only has email digest.
- **Impact:** Agency tier customers expect Slack/Discord/Sheets integration. Not having it is a positioning gap vs Foglift.
- **Fix:** Add webhook layer to Sprint 8 prompt. Schema addition: `webhook_endpoints` table + `webhook_deliveries` log. Add event emission in Inngest after audit.complete and drift detection.

### H4. White-label PDF + client portal (Agency tier) missing

- **PRD says (§8 Module 6 + §11 Sprint 9):**
  - "White-label client report PDF generation (logo + colors swappable)"
  - "Client login (limited view) — clients see their data, agency edits"
- **Prototype has dedicated screens (line 3360 PDF builder, 3189 Agency workspace).**
- **My docs say:** Sprint 4 has basic PDF export (no white-label). No client portal anywhere.
- **Impact:** Agency tier (A$499/mo, 5 brands) loses its core deliverable — branded client reports. Agency Pro (A$1,499/mo, 25 brands) loses agency-staff-shows-clients UX.
- **Fix:** Add to Sprint 9 (rewrite per H2): white-label PDF templates, agency brand assets table (logo, colors, footer text), client portal route group with read-only views.

### H5. 47 citability methods catalogue + Brand & Entity scoring missing

- **PRD says (§11 Sprint 7 + §16 OSS feature #14):**
  - "47 citability methods catalogue exposure" — for Action Center recommendations
  - "AU-localised Brand & Entity scoring (ABN Lookup + Wikipedia AU + AU TLD signal + AU directory aggregate)"
- **Prototype has dedicated screens:** line 2841 "47 citability methods", line 2786 "Brand & Entity audit"
- **My docs say:** Nothing.
- **Impact:** Action Center recommendations lose the methodology grounding the PRD positions as "transparency differentiator" (PRD §8 anti-pattern transparency). Brand & Entity AU scoring is what differentiates VisibleAU from generic-global tools.
- **Fix:** Add both to Sprint 7 (per H1 restructure). 47-method catalogue is content (markdown/JSON file) + a methodology page route. Brand & Entity scoring is a new audit dimension that integrates with the multidimensional scoring from Sprint 3.

---

## MEDIUM — stack drift; architectural choices differ

### M1. LLM SDK approach: PRD says Vercel AI SDK, my docs use direct SDKs

- **PRD says (§10):** "Vercel AI SDK abstracting OpenAI, Anthropic, Google AI, Perplexity"
- **My docs say:** Direct provider SDKs (openai, @anthropic-ai/sdk, @google/generative-ai). Sprint 2 + Sprint 3 wire each provider individually.
- **Impact:** More boilerplate per engine; harder to swap providers; loses Vercel AI SDK's streaming + structured-output helpers.
- **Fix:** CLAUDE.md §3 + Sprint 2/3 — use `ai` package (Vercel AI SDK) with provider plugins `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`. LLMService interface stays; impl files use Vercel AI SDK underneath.

### M2. PostHog analytics not in any of my docs

- **PRD says (§10):** "Analytics | PostHog | Self-hosted option for AU data residency"
- **My docs say:** No analytics layer mentioned anywhere.
- **Impact:** No funnel tracking, no usage analytics. Cannot measure conversion (Pricing Principle #1 about Otterly's anchoring; PRD §13 success metrics).
- **Fix:** Add PostHog to CLAUDE.md §3 stack. Sprint 11 or Sprint 12 wires `posthog-js` for client-side + `posthog-node` for server events.

### M3. Supabase Storage not addressed; PDF report storage path unclear

- **PRD says (§10):** "File storage | Supabase Storage | PDF reports, branded assets"
- **My docs say:** Sprint 4 generates PDFs via `@react-pdf/renderer` but doesn't say where they're stored. Sprint 9 agency PDFs (per H4) need persistent storage.
- **Impact:** Generated PDFs are ephemeral; no audit trail; no re-download path.
- **Fix:** Use Supabase Storage (assuming C5 resolution = Supabase). Add `audit_exports` table tracking generated PDFs with URLs + retention policy.

### M4. Cost-control architecture: only 1 of 4 layers covered

- **PRD says (§10):** 4 layers:
  1. **Response cache** (24-72h by `(prompt, model)` tuple) — *"Reduces costs ~70% as customer base grows"*
  2. **Smart re-query schedule** (canary prompts detect drift; full re-audit only on drift)
  3. **Tier-based provider routing** ✓ (covered in my Sprint 3 model-selector)
  4. **Citation detection efficiency** (regex+entity for 80%, LLM for 20%)
- **My docs say:** Only Layer 3 (model-selector). Layers 1, 2, 4 missing.
- **Impact:** PRD target unit economics (Starter A$99 → ~85% gross margin) depend on all 4 layers. Without caching, real costs at scale could push margins to 30-50%.
- **Fix:** Add Layer 1 (response cache) as a Sprint 3 deliverable (Redis or Postgres-backed). Add Layer 2 (canary prompts + drift detection on cache validity) — interacts with Sprint 8 drift detection. Add Layer 4 (citation regex + entity matching) to Sprint 2 detect-mention logic.

### M5. REST + OpenAPI spec not addressed

- **PRD says (§10):** "API | Next.js Route Handlers + REST with OpenAPI spec | Decouples frontend/backend; supports external API access for Growth+ tier"
- **My docs say:** Sprint 1+ creates `/api/*` route handlers but no OpenAPI spec. External API access not in any sprint.
- **Impact:** Growth+ tier customers (PRD says they should get API access per v1.1) have no documented API. SDK generation impossible without spec.
- **Fix:** Add OpenAPI spec generation to Sprint 1 (or stub for v1.1 if scope-cut). Tool: `next-rest-framework` or `@asteasolutions/zod-to-openapi` with Zod schemas already in routes.

---

## LOW — minor scope/detail drift

### L1. Weekly digest day/time differs

- **PRD says (§8 Module 7):** "Weekly summary email (**Tuesday 9am AEST** default)"
- **My Sprint 9 says:** "Saturday 22:00 UTC ≈ **Sunday 09:00 AEDT**"
- **Fix:** Cron should be Mon 23:00 UTC (= Tue 09:00 AEDT during DST) or Tue 23:00 UTC (= Wed 09:00 AEDT). Per-user timezone preference per Sprint 9 `notification_preferences.timezone` should ALSO be honored.

### L2. AU directory list inconsistent

- **PRD §8 Module 4 says:** TrueLocal, Yellow Pages AU, **Whitepages**, **Localsearch**
- **PRD §11 Sprint 8 says:** "GMB completeness, AU directory presence (now incl. Word of Mouth — 4 directories total)"
- **PRD §16 Group 2 #10 says:** "Hipages, Yellow Pages AU, ServiceSeeking, **Word of Mouth**"
- **My Sprint 7 says:** Hipages, Yellow Pages AU, ServiceSeeking, Word of Mouth, Oneflare, True Local, Google Business Profile
- **PRD itself contradicts itself** — §8 Module 4 list ≠ §16 Group 2 #10 list. My list is closer to §16. This isn't entirely my drift; PRD has internal inconsistency to flag.
- **Fix:** Pick canonical list. Recommend §16 list + Google Business Profile = 5 directories total. Update PRD §8 Module 4 to match.

### L3. Action Center recommendation structure differs

- **PRD says (§8 Module 5):** ~11 universal action types (Wikipedia, FAQ, Expert quotes, Cited statistics, Stale content, Comparison article, Reddit, Medium, LinkedIn, Press, AU local citations) each with **named research citation** (Tinuiti Q1 2026, SE Ranking Dec 2025, Princeton GEO 2024, HubSpot AEO 2026, TEAM LEWIS PR).
- **My Sprint 6 says:** "~25 recommendation templates per vertical (75 total)"
- **Impact:** Different structure entirely. PRD = universal action types with research backing; mine = per-vertical templates with confidence labels.
- **Fix:** Sprint 6 should seed the 11 universal action types from PRD §8 Module 5 with their named citations. Vertical-specific overlays (e.g., "AU plumber + Reddit suggestion") can sit on top, but the base 11 are universal.

### L4. Confidence labels: sprint placement

- **PRD says (§11 Sprint 8):** "confidence labels (Confirmed/Likely/Hypothesis categorical, NOT %-numeric) for Action Center recommendations"
- **My Sprint 6 says:** Confidence labels in Action Center on Sprint 6.
- **Impact:** Minor. Both sprints define them; mine puts them earlier than PRD. As long as the labels are categorical (not %-numeric), placement is acceptable.
- **Fix:** No change needed if Sprint 6 categorical assertion holds. Add a note in Sprint 8 that confidence labels are inherited from Sprint 6.

### L5. Anti-pattern list differs

- **PRD says (§8 Module 5):** 4 explicit anti-patterns: "AI-specific meta tags", "FAQ schema markup for AI Mode visibility", "Hidden prompt injection content", "Generic E-E-A-T without specific actions"
- **My Sprint 6 says:** 12 anti-patterns (7 v1.0 + 5 v1.3) including ones not in PRD: "Add more keywords", "Pay for ads on ChatGPT", "Submit your site to AI search engines", "Get more backlinks", "Use AI to write content", "Update meta tags for AI", "Buy reviews", "Create AI-generated reviews", "Add structured data without entity verification", "Target competitor branded terms", "Run more audits to improve score"
- **Impact:** I expanded the list. The expansion captures legitimate anti-patterns (buying reviews illegal in AU; running more audits doesn't improve score — both real concerns). But the additions weren't in the PRD.
- **Fix:** Reconcile. Decide whether the additional 8 are PRD additions (good) or scope creep (drop). Recommendation: keep the 12 since they catch real bad advice, but flag to operator.

### L6. Free tier engines

- **PRD says (§7):** "Free: 2 (ChatGPT, Perplexity)"
- **My CLAUDE.md says:** "Free (1 brand, 2 engines, 20 prompts, monthly)" — doesn't specify which 2
- **My Sprint 11 sample audit (which is WRONG per C3) says:** "2 engines (ChatGPT + Claude)"
- **Fix:** PRD canonical = ChatGPT + Perplexity. Update CLAUDE.md §1 and Sprint 11 (which also fixes the C3 sample audit spec to 1 engine = ChatGPT only).

### L7. Stripe products: one-off audit + annual billing missing

- **PRD says (§7):** Two pricing options not in my Stripe products:
  - "One-off audit = **A$299**" (conversion path: someone runs audit, sees gaps, upgrades to monthly)
  - "Annual = 2 months free" (16% discount for annual billing)
- **My Sprint 1 setup-stripe-products.ts says:** Only monthly subscription products for Starter/Growth/Agency/Agency Pro.
- **Impact:** Cannot sell one-off audits. Cannot offer annual discount. Both are PRD-specified conversion levers.
- **Fix:** Add to Sprint 1 product setup:
  - One-off audit product (A$299 one-time charge, no recurring)
  - Annual recurring prices for each tier at `monthly × 10` (2 months free)

### L8. Public methodology page missing

- **PRD says (§11 Sprint 11):** "marketing site, pricing page, docs (with **public methodology page**), Loom demos"
- **My Sprint 11 says:** Landing + pricing + about/privacy/terms + sample audit + onboarding. No methodology page.
- **Prototype line 2841** has a "47 citability methods" methodology page.
- **Fix:** Add to Sprint 11: `/methodology` route with the 47 methods catalogue rendered as a public page (markdown table or styled cards). Cite Princeton KDD 2024 + Tinuiti + SE Ranking research as the backing.

### L9. Loom demos in Sprint 11 not addressed

- **PRD says (§11 Sprint 11):** "Loom demos"
- **My Sprint 11 says:** No Loom demos in deliverables list.
- **Impact:** Sales/conversion asset missing.
- **Fix:** Add to Sprint 11: "Record 3-4 short Loom demos (≤90s each): sample audit run, brand setup wizard, audit results walkthrough, Action Center." Embed on landing + pricing pages.

### L10. Beta with 5-10 customers missing from Sprint 12

- **PRD says (§11 Sprint 12):** "**Beta with 5-10 customers**, fix obvious issues, prep launch"
- **My Sprint 12 says:** Sentry + alerting + load testing + security + production cutover + ProductHunt prep. No beta cohort.
- **Impact:** Production launch without real-user beta. Higher risk of launch-day issues.
- **Fix:** Add to Sprint 12: "Recruit 5-10 friendly beta customers (likely from Sri's network or pre-launch waitlist). Run 1-2 audits each. Fix what breaks. THEN cut DNS over."

### L11. SOC 2 Type 1 by month 12 missing

- **PRD says (§10 Security baseline):** "SOC 2 Type 1 by month 12 (Type 2 by month 18 — required for enterprise tier)"
- **My Sprint 12 says:** Security audit + dependency scan + OWASP review, no SOC 2.
- **Impact:** Enterprise tier sales conversations blocked without SOC 2 (PRD claims A$3,000+/mo enterprise tier).
- **Fix:** Add to Sprint 12 post-launch milestones: "Plan SOC 2 Type 1 kickoff (Vanta or Drata) for Month 6 onwards. Type 1 target Month 12."

### L12. Topical authority gap analyzer + LLM conversion attribution + TikTok citations — v1.1 features I should reference

- **PRD §8 v1.1 says:**
  - Topical authority gap analyzer (Growth tier+)
  - LLM conversion attribution (Growth tier+)
  - TikTok citation tracking
- **My docs say:** Sprint 8 mentions "TikTok citation tracking placeholder (UI element grayed-out with 'Coming v1.1' — deferred)" ✓. The other two aren't referenced.
- **Impact:** Low — these are v1.1 features. But should be noted in CLAUDE.md §2 deferred-to-v1.1 list to avoid scope-creep risk during sprints.
- **Fix:** Add to CLAUDE.md §2 v1.1 list: Topical authority gap analyzer, LLM conversion attribution, AI crawler logs analysis.

### L13. Pricing model A/B test deferred decision

- **PRD says (§7.6 added v1.10):** Flat-rate vs token-based A/B test is a planned experiment "30 days post v1.0 launch"
- **My docs say:** No mention.
- **Impact:** Operator may forget the experiment plan.
- **Fix:** Add to CLAUDE.md §2 deferred-to-v1.1 list: "Pricing model A/B test (flat-rate vs token-based) per PRD §7.6 — schedule 30 days post-launch".

### L14. Multidimensional score 5-vs-8 dimension surfacing strategy missing

- **PRD §16 says (UX design note for scoring):** "score against Auriti's 8 detailed categories internally...surface to UX as Foglift-style 5 categories rolled-up for simpler scanning. The 8-dimension detail is available via disclosure"
- **My Sprint 3 says:** 5 dimensions only (frequency, position, sentiment, context, accuracy) — these are the AUDIT scoring dimensions, different from the Auriti 8 categories (Robots /18, llms.txt /18, Schema /16, Meta /14, Content /12, Brand & Entity /10, Signals /6, AI Discovery /6).
- **Impact:** Two different scoring concepts:
  - **Sprint 3's 5 dimensions** = how brand performs on AI engine queries (audit results)
  - **PRD's 8 categories rolled to 5** = how site is configured for AI discoverability (Module 5b score)
- These are different things. My Sprint 3 covers (1); Module 5b (per H1 fix) covers (2). They should be presented as separate scores.
- **Fix:** When rewriting Sprint 7 (per H1), explicitly distinguish: Audit dimensions (5) vs Citability categories (8 internal → 5 surfaced). Sprint 4 UI should show both as separate cards.

---

## Cross-cutting observations

### Observation 1: I drifted from the PRD because I didn't read it before drafting

The sprint prompts I wrote in the prior turn are internally consistent with each other and with CLAUDE.md. But they diverged from PRD v1.14 on multiple structural points (sprint scope, tier prices, tier limits, stack choice). The prototype is more PRD-aligned than my sprint prompts — which makes sense, since I claimed in CLAUDE.md to "synthesize Foundations + Architecture + PRD + Sprints + Sprint 4 + test docs" but I leaned heavily on Foundations and the existing Sprint 1-3 v1.12 bundle, not the PRD directly.

**Honest framing:** I should have grep-verified specific PRD claims before writing each sprint, the same way the CLAUDE.md §12 "verification before claim" rule says to. I didn't apply that rule to my own draft.

### Observation 2: The prototype is the cleanest reference for what to build

When PRD and sprint prompts disagree, the prototype usually matches the PRD. The prototype shows:
- Correct prices (A$99/A$299/A$499/A$1,499)
- Module 5b screens (llms.txt, schema, SSR, answer capsules, robots.txt)
- 47 citability methods page
- Brand & Entity audit page
- Agency workspace + PDF builder + bulk operations
- SARIF/JUnit/GHA in the export dropdown

Treat the prototype as the de-facto source of truth for "what the UI should show" while we reconcile the sprint prompts.

### Observation 3: Sprint hour estimates underestimate Sprint 7 by ~5-7x

PRD §11 explicitly says Sprint 7 has "~22 additional days vs baseline" because of the OSS-derived feature load (47 methods, 27 AI bots, CDN crawler check, schema richness, llms.txt depth, Brand & Entity AU, negative signals, prompt injection — all on top of Module 5b core). At weekend pace, 22 days = ~130-180 hours. My Sprint 7 estimate was 20-26 hours. **Off by ~5-7x.**

This isn't just a number error — it changes the launch timeline by ~3-4 months. If the operator builds at the 20-26h estimate, they will hit Sprint 7 acceptance gate and find half the PRD's Sprint 7 features missing, then need another 3-4 months of weekend work to fix.

### Observation 4: Sprint 9-10-11 scope is rotated by one position

What I called Sprint 9 (scheduled audits + portfolio) doesn't appear as a labeled sprint in PRD §11. What I called Sprint 10 (Stripe billing) is in PRD's Sprint 10 ALONGSIDE sample audit + onboarding. What I called Sprint 11 (polish + landing) matches PRD's Sprint 11.

To reconcile cleanly: PRD's Sprint 9 = Agency tier; PRD's Sprint 10 = Onboarding (incl. Stripe + sample audit). My "scheduled audits + portfolio" is real work but needs a home — could be tucked into Sprint 9 alongside agency dashboard (since agencies need scheduled audits for client brands) or into Sprint 11 polish.

---

## Recommended next steps

In priority order:

1. **Stop. Don't start Sprint 1 build until C1-C5 are fixed.** Tier prices, tier limits, sample audit spec, Module 5b plan, and Supabase decision all need operator decisions before code starts.

2. **Operator decisions needed (cannot resolve unilaterally):**
   - C5: Supabase or Vercel Postgres? (PRD says Supabase; my docs assumed Vercel. Operator picks.)
   - H2: Rotate sprint scope to match PRD §11, or keep my structure and update PRD §11? (Recommendation: rotate to match PRD; sprint structure is operator's deliberate design.)
   - L5: Keep my 12 anti-patterns or trim to PRD's 4? (Recommendation: keep the 12 — they catch real harms — but document the deviation.)

3. **Update CLAUDE.md v1.1 → v1.2** with the C1, C5, L6 fixes (prices, stack choice, free tier engines).

4. **Rewrite Sprint 1 prompt** with the C1 + C5 fixes + L7 (one-off audit + annual billing).

5. **Rewrite Sprint 7 prompt** as Module 5b core + OSS adds (H1 + C4 + H5).

6. **Rewrite Sprint 8 prompt** as Local SEO + drift + exports + webhooks + confidence labels (H1 + H3).

7. **Rewrite Sprint 9 prompt** as Agency tier (H2 + H4).

8. **Rewrite Sprint 10 prompt** as Onboarding + Stripe billing + sample audit (H2 + C3).

9. **Update Sprint 11 prompt** to remove sample audit, add methodology page + Loom demos (L8 + L9).

10. **Update Sprint 12 prompt** to add beta cohort + SOC 2 plan (L10 + L11).

Estimated effort to write these corrected prompts: ~6-10 hours.

---

## Honest closing note

The original Claude session (per the AURELIA handoff doc) documented a "7+ instance anti-pattern" where claims drift from sources because the author didn't grep-verify. I just reproduced that anti-pattern in the VisibleAU sprint prompts. The CLAUDE.md I wrote even explicitly warns against it (§12: "Verification before claim. When citing 'per Foundations §X' or 'per Sprint Y', grep the source first.").

I should have. I didn't. The result is 29 conflicts you now have to fix before Sprint 1 starts.

The good news: the conflicts are catalogued specifically. None of them are subtle architecture conflicts — they're "I wrote 49 where the PRD says 99" kinds of conflicts. The fix cost is ~6-10 hours of revision, not weeks. The bad news is that this audit should have been done before delivering the 12 sprint prompts, not after.

Your call on which conflicts to fix and in what order. I'll execute whichever subset you approve.
