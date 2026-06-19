# VisibleAU — Feature Handoff: Smart Brand-Specific Prompt Pack
# Date: June 2026
# Written by: the Claude session that designed the feature (post Sprint 7 planning chat)
# For: a fresh Claude chat to independently review the fix prompt before Claude Code runs it
# Companion file: fix-brand-smart-prompt-pack.md (the actual Claude Code prompt)

This document gives the reviewing chat everything it needs to understand WHY this feature
exists, WHAT it does, HOW it was designed, and WHAT to check during review. Read it fully
before opening the fix prompt.

---

## SECTION A — BACKGROUND: HOW WE DISCOVERED THIS PROBLEM

### The real-LLM validation run

VisibleAU Phase 1 is built and running. Sri (the founder) completed the first real-LLM
validation run in June 2026 using Canva as a test brand — Australian-founded design
SaaS, globally recognised, strong AI presence in its actual market category.

The audit ran correctly end-to-end:
- Duration: 7m 39s (confirmed real API calls — mock = 1–2s)
- 40 LLM calls fired across 4 engines (ChatGPT, Claude, Gemini, Perplexity)
- Real citations extracted, real competitor names detected
- Pipeline: brand creation → Inngest job → LLM calls → scoring → results stored

The pipeline is correct. The infrastructure works.

### The result that revealed the problem

Canva's visibility score came back: **34.4 / 100**

That number is wrong for Canva. Canva is one of the most AI-visible Australian brands in
its category — it should score 80–95+. The low score was not a bug in the scoring engine.
It was caused by the prompts being sent to the LLM engines.

### What prompts were actually sent

The 10 prompts used for Canva's audit were drawn from the generic "SaaS" vertical pack:

  - "Best document management software for Australian law firms?"
  - "Best time tracking software for Australian consultancies?"
  - "Best helpdesk software for Australian customer support teams?"
  - "Best invoicing and accounting software for Australian freelancers?"
  - "Top CRM software that integrates with Xero for Australian companies?"
  - "Best HR software for small Australian businesses?"
  - "Top marketing automation tools used by Australian agencies?"
  - "What B2B SaaS tools are popular among Australian startups?"
  - "Best project management tools for Australian small businesses?"
  - "What e-commerce platforms do Australian businesses use?"

None of these are queries where Canva would naturally appear. Canva is a graphic design
and visual content creation tool. Nobody asking about law firm document management or
HR payroll software is going to mention Canva in the answer.

Canva appeared in only 3 of 30 responses (10% mention rate) — two incidental mentions
in the "B2B SaaS tools" and "HR software" questions where it snuck in as "oh, and there's
also Canva for marketing materials." That produced a legitimate 34.4 score — the SCORING
ENGINE IS CORRECT. The prompt selection was simply wrong for that brand.

### Root cause: vertical granularity is too coarse

The current system has three verticals: tradies, saas, allied_health.

"SaaS" as a single bucket covers:
- Canva (graphic design)
- Xero (accounting)
- Slack (team communication)
- Salesforce (enterprise CRM)
- Atlassian (developer tools)
- Employment Hero (HR payroll)

These are completely different query spaces. A user asking "what design tools does my
marketing team use?" is not asking about accounting or HR. The same prompt pack cannot
serve all of them and produce meaningful visibility scores.

The problem compounds as more brands are added. Every SaaS brand gets the same 10 prompts
regardless of what the brand actually does — making VisibleAU's core scores unreliable
for product differentiation and enterprise sales.

---

## SECTION B — WHY THIS MATTERS FOR THE PRODUCT

VisibleAU's entire value proposition is: "know how visible your brand is when AI answers
questions in your market." If the prompts don't match the brand's market, the score doesn't
reflect reality — and the product loses credibility with customers.

Specifically:

**For customer trust:** A customer who adds their design agency to VisibleAU and gets a
34.4 score will assume the product is broken, not that the prompts were wrong. They will
churn. The score has to be believable to be valuable.

**For competitive differentiation:** VisibleAU's AU-first vertical packs are called out
as a key differentiator in the PRD and landing page copy ("AU-first vertical packs —
Tradies, Allied Health, SaaS — with prompts that match how Australians actually search").
The current implementation doesn't deliver on that promise at the brand level.

**For agency and multi-brand tiers:** Agency accounts can add 5–25 brands across completely
different industries. A single generic vertical bucket per brand is unworkable at that
scale. The Agency tier is the highest revenue tier — it needs smart per-brand prompts.

**For Phase 2 intelligence:** Phase 2 (LLD v8.65, currently in design) builds a
7-layer intelligence platform on top of Phase 1. The brand classification produced by
this feature (category, buyerType, intentSignals, competitors, auRelevance) becomes
the foundation for the Workflow Intelligence layer, Market Gap analysis, and Competitive
Discovery. Building it now avoids a costly retrofit during Phase 2 sprint design.

---

## SECTION C — WHAT THE FEATURE DOES (overview)

### The three-part solution

**Part 1 — Brand classification (one-time, automatic)**
When a brand is added, a single Claude Haiku call (~$0.001) classifies the brand into a
specific category (e.g. 'saas_design_tools', 'accounting_software', 'trades_plumbing'),
determines the buyer type (smb / enterprise / consumer / freelancer / agency), extracts
intent signals (how users search for this TYPE of product), identifies direct competitors,
and assesses Australian market relevance. The classification is stored as JSONB on the
brands table and never repeated unless manually refreshed.

**Part 2 — Prompt template library (static, per category)**
A file containing 20+ AU-specific prompt template sets, one per business category. Each
template set contains the queries real Australians ask AI engines when looking for that
type of product or service. Prompts are MARKET queries — they ask what the market uses,
not what the brand does. The brand either appears in the answer or it doesn't. That IS
the audit. Templates have region tokens ({region}) resolved from the brand's location.

**Part 3 — Dynamic prompt pack generation (per brand, per audit)**
Before each audit, the system builds a brand-specific prompt pack from the stored
classification. Mix: 60% category templates (market queries) + 40% enriched brand-specific
prompts (competitor comparisons, intent signal queries, direct brand awareness). The pack
is cached on the brand row and reused across audits. If classification fails or hasn't
completed, the system falls back to the existing vertical pack — zero breaking changes.

### What Canva's prompts would look like with this fix

Instead of the generic SaaS queries above, Canva would get:

  1. "Best graphic design tools for Australian small businesses?"
  2. "What do Australian marketing teams use to create social media content?"
  3. "Affordable design software for Australian startups and SMEs?"
  4. "Best online design tools for non-designers in Australia?"
  5. "What tools do Australian businesses use for presentations and pitch decks?"
  6. "Best design collaboration tools for remote Australian teams?"
  7. "Canva vs Adobe Express — which is better for Australian businesses?"
  8. "What are the best alternatives to Canva in Australia?"
  9. "Best graphic design software for Australian businesses?"
  10. "Is Canva popular in Australia?"

Expected score with these prompts: 80–95+. That's what Canva's true AI visibility is.

---

## SECTION D — ARCHITECTURE DECISIONS (rationale for each)

**Why a one-time LLM classification call rather than scraping the domain?**
Domain scraping is fragile (robots.txt, JS-rendered pages, rate limits) and expensive to
maintain. A single Haiku call with the brand name + domain as input is more reliable,
costs $0.001, and produces richer structured output (competitors, intent signals) that
scraping can't easily derive. The classification only needs to be good enough to select
the right prompt category — Haiku handles this well.

**Why store classification as JSONB on brands rather than a separate table?**
The classification is a single document per brand, never queried across brands for
aggregation in Phase 1. JSONB on brands avoids a join on every audit prompt fetch.
Phase 2 can index specific JSONB keys if cross-brand queries become necessary.

**Why 60% category templates + 40% brand-specific enriched prompts?**
Pure category templates are market queries — they're the most realistic (matching how
real users actually ask AI engines) but they don't directly test brand awareness.
Pure brand-specific prompts (e.g. "Is Canva worth it?") bias toward brands with high
existing awareness and don't reflect organic discovery. The 60/40 mix balances
market-realistic queries with targeted brand signal capture.

**Why a static template file rather than generating prompts via LLM per audit?**
LLM-generated prompts are non-deterministic — the same brand could get different prompts
on each audit, making score trends meaningless. "Your score dropped from 82 to 71" should
reflect actual change in AI visibility, not prompt variation. Static templates ensure
score comparability across time. The enriched 40% does vary (competitor prompts, intent
signals) but those are derived from the stored classification, not re-generated per run.

**Why fire classification as non-blocking after brand creation?**
Brand creation must be instant from the user's perspective. A ~2–5 second LLM call in
the critical path would make the brand wizard feel slow. Fire-and-forget with a status
column (pending → processing → complete | failed) lets the UI show a subtle "prompts
being tuned" indicator without blocking the user. The first audit can use the vertical
fallback if classification hasn't completed — acceptable for the first run.

**Why a three-tier fallback chain in the audit runner?**
1. Stored prompt_pack (ideal — fast, brand-specific, deterministic)
2. Build from classification on-the-fly (classification complete but pack missing/short)
3. Existing vertical pack (classification not yet done — backward compatible)

This means the fix can be deployed while existing brands are being backfilled. No brand
ever gets zero prompts. No audit ever fails because of classification.

**Why does LLM_MODE=mock return a fixture rather than skipping classification?**
Development and testing run with LLM_MODE=mock to avoid API costs. The classify-brand
module must respect this — otherwise every brand creation in dev would make a real Haiku
call and accumulate small but unnecessary costs. The mock fixture returns a valid
BrandClassification object so the full downstream flow (buildPromptPack, storage) can
be tested without a real LLM call.

---

## SECTION E — WHAT ALREADY EXISTS (do not duplicate)

The reviewer should verify the fix prompt does NOT duplicate or conflict with:

**Existing vertical system (KEEP AS-IS):**
- The user-facing vertical selector in the brand wizard (tradies / saas / allied_health)
  is preserved. The user still picks a vertical — it's used as a hint in the
  classification prompt and as the final fallback if classification fails.
- Existing vertical pack files (if they exist in lib/verticals/) are untouched.
- The VerticalPackBrowser and VerticalPackDetail UI screens are unaffected.

**Existing schema (ADD ONLY):**
- The brands table already has: id, name, domain, vertical, region, competitors (user-
  entered), createdAt, and audit-related columns. The fix adds 5 nullable columns only.
- No existing column is modified, renamed, or given a new constraint.

**Existing audit pipeline (INTEGRATION POINT ONLY):**
- scorer.ts, citation-detector.ts, and the LLM impl files are untouched.
- The only change to runner.ts is replacing the prompt-fetch call with a wrapper that
  has the three-tier fallback. Scoring, citation detection, and result storage are
  identical regardless of which prompt path was used.

**Existing Inngest functions (ADD ONE):**
- The backfill job (classify-existing-brands) is a new function added to serve().
- No existing Inngest function is modified.
- The invariant of 25/25 functions in serve() increases by 1 after this fix — update
  any documentation that references the 25/25 count.

---

## SECTION F — WHAT TO REVIEW IN THE FIX PROMPT

The companion fix prompt (fix-brand-smart-prompt-pack.md) is the actual Claude Code
instruction set. Review it for the following:

### F1 — Completeness
- [ ] Does Phase 1 (investigate) give Claude Code enough direction to find the right files
      without guessing? It should grep for the exact patterns that exist in the codebase.
- [ ] Does Phase 2 (migration) produce a safe, idempotent migration? All columns nullable,
      IF NOT EXISTS guards, index scoped to unclassified brands only.
- [ ] Does Phase 3 (classify-brand.ts) correctly guard LLM_MODE=mock?
- [ ] Does Phase 4 (templates.ts) have enough categories to cover the brands Sri is likely
      to add in the near term? (design, accounting, CRM, HR, trades, allied health, legal,
      fintech, property, e-commerce, project management, helpdesk, marketing automation)
- [ ] Does Phase 5 (integration) wire both the brand creation trigger AND the audit runner
      fallback chain correctly?
- [ ] Does Phase 6 (verification) give Claude Code enough checks to self-validate?
- [ ] Does Phase 7 (rollback) give Sri a safe exit if something breaks?

### F2 — Safety checks
- [ ] Is the classification call truly non-blocking at brand creation? (fire and forget,
      catch the error, never await in the response path)
- [ ] Does the audit runner fallback guarantee prompts are always returned (never empty)?
- [ ] Does the mock fixture in classify-brand.ts return a structurally valid
      BrandClassification that exercises the full downstream path in tests?
- [ ] Is the Inngest backfill job rate-limited? (it should sleep between brands to avoid
      hammering the LLM API with 100 concurrent classification calls)
- [ ] Does the migration use IF NOT EXISTS and IF EXISTS guards throughout?
- [ ] Does the Drizzle schema update use nullable columns with defaults, not NOT NULL?

### F3 — Architecture consistency with existing codebase
- [ ] Does classify-brand.ts use getLLMService() from model-selector, not a hardcoded
      model string? (VisibleAU convention: never hardcode model strings)
- [ ] Does build-prompt-pack.ts avoid any direct LLM calls? (it should be pure logic —
      template selection + shuffle + dedup — no async, no LLM)
- [ ] Does the Inngest backfill function follow the existing function structure pattern
      (inngest.createFunction with id, name, event trigger)?
- [ ] Are all new files in the correct directories? (lib/brands/, lib/prompts/,
      inngest/functions/, db/migrations/)

### F4 — Prompt template quality
- [ ] Are the templates market queries (what the market uses) rather than brand queries
      (what the brand is)? Brand queries bias toward awareness; market queries measure
      organic discovery — the correct metric for AI visibility.
- [ ] Do trades templates use {region} tokens so they work for Bondi AND Brisbane?
- [ ] Do the fallback chains (parent category → general) make sense? 'trades_plumbing'
      should fall back to 'trades_general' before 'general'.
- [ ] Is the 'general' fallback category sufficient for edge cases (unusual business
      types Claude Haiku might not classify into a known category)?

### F5 — Potential gaps to flag
- [ ] The fix prompt assumes the brands table has a `region` column for resolving
      {region} tokens. Verify this exists in the schema. If not, the buildPromptPack
      call should default to 'Australia' (which the code does — confirm).
- [ ] The fix prompt assumes `getLLMService()` accepts a `prompt` string and returns
      the completion text. Verify the actual interface of model-selector.ts during
      Phase 1 investigation — the call signature in Phase 3 may need adjusting.
- [ ] The fix prompt does not add any UI for "classification status" on the brand card
      or brand detail page. This is intentional — it's a background process. If Sri
      wants a "prompts being tuned" indicator in the wizard, that's a follow-up UI fix.
- [ ] The Inngest serve() count will increase from its current number by 1. If any
      documentation or invariant check references the exact function count, it needs
      updating after this fix.

---

## SECTION G — EXPECTED OUTCOME AFTER THE FIX

**Canva re-audit:** score should move from 34.4 → 80–95+ using design-specific prompts.
This is the clearest validation that the fix works correctly.

**Bondi Plumbing (existing brand):** score should be unchanged — the fallback to the
trades vertical pack ensures existing brands are unaffected until they're backfilled.

**Any new brand created after the fix:** classification fires automatically on creation.
By the time the user runs their first audit (~30–120 seconds later), classification is
likely already complete and the brand gets its own tailored prompt pack.

**Cost impact:** ~$0.001 per brand classified (one Haiku call). For 100 brands that's
$0.10 total. Negligible. The per-audit cost is unchanged — the same number of LLM calls
run, just with better prompts.

---

## SECTION H — WHAT THIS SETS UP FOR PHASE 2

The BrandClassification object stored on each brand becomes the seed data for Phase 2:

- **Workflow Intelligence (Sprint 2):** the `intentSignals` array feeds the recommended
  action prompts ("You should be visible for 'graphic design tools Australia' — you're
  not. Here's why and how to fix it.")

- **Market Gap analysis (Sprint 3):** the `competitors` array feeds the competitive
  position tracking. Phase 2 already has competitor_scores and competitor_mentions tables
  — this feature populates the competitor list automatically rather than requiring manual
  entry.

- **Discovery layer (Sprint 5+):** the `category` and `buyerType` become the taxonomy
  for the vertical intelligence hub and the benchmark comparisons.

Building this in Phase 1 now means Phase 2 sprint prompts can reference a rich, stored
brand classification rather than designing a separate classification system from scratch.

---

## SECTION I — FILES INVOLVED IN THIS FEATURE

### Companion file (required reading for review):
  fix-brand-smart-prompt-pack.md  ← the actual Claude Code prompt to review

### New files Claude Code will create:
  db/migrations/<timestamp>_add_brand_classification.sql
  lib/brands/classify-brand.ts
  lib/brands/classify-and-store.ts
  lib/prompts/templates.ts
  lib/prompts/build-prompt-pack.ts
  inngest/functions/classify-existing-brands.ts

### Existing files Claude Code will modify (additive only):
  db/schema/<brands-schema-file>.ts           ← add 5 nullable columns
  app/api/brands/route.ts (or equivalent)     ← fire classifyAndStoreBrand after insert
  lib/audit/runner.ts                         ← wrap prompt fetch with fallback chain
  app/api/inngest/route.ts                    ← add classifyExistingBrands to serve()

### Zero changes to:
  Any existing schema columns · scorer.ts · citation-detector.ts · LLM impl files ·
  Any existing Inngest functions · Any UI components · Any API response shapes ·
  Existing brands or audit history · The brand wizard vertical selector UI

---

## SECTION J — WORKING AGREEMENTS WITH SRI

• English only — no Telugu unless Sri explicitly requests it in that conversation.
• Review the fix prompt for correctness, completeness, and safety. Flag any gaps.
• Do not re-architect the solution — the design decisions in Section D are locked.
  If you find a genuine bug (e.g. wrong function signature, missing null guard), flag it
  and suggest the minimal fix. Do not redesign the approach.
• If the fix prompt is clean, say so clearly. A clean review is a valid result.
• Performance, Security, Scalability, UX are non-negotiable — flag anything that
  violates these (e.g. an await in the brand creation response path, a missing index,
  an unguarded JSON parse without try/catch).
• This fix runs AFTER Sprint 7 completes. Do not suggest merging it into Sprint 7.

— End of handoff. Read fix-brand-smart-prompt-pack.md next.
