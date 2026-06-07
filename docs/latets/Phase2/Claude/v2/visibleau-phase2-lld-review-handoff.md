# VisibleAU — Phase 2 LLD Review Handoff for ChatGPT

**Document purpose:** Independent second-opinion audit of the VisibleAU Phase 2 Low-Level Design (LLD).
**Prepared by:** Claude, on behalf of Sri (solo founder, Sydney AU).
**Date:** June 2026.
**Primary artefact under review:** `visibleau-7layer-lld.md` — **Version 8.25, 6,742 lines, 37 `CREATE TABLE` statements, 7 intelligence layers, 16 market GAPs.**

> Attach `visibleau-7layer-lld.md` alongside this handoff. This document is the briefing; that file is the thing to review.

---

## 0. What you are being asked to do

You are an independent AI reviewer giving a second opinion. Claude has run **nine consecutive fresh-angle conflict audits** on this document (versions 8.16 → 8.25), each using a deliberately different lens, plus an earlier product review (v8.19) and ~14 competitor-teardown passes (v8.2–v8.15). The document is heavily hardened. Your value is in catching what a different kind of reviewer would see.

**Your job, in order:**

1. Read this handoff in full first. Section 6 lists what is already fixed and closed — do not re-raise those.
2. Review the LLD through lenses Claude is structurally weaker at: product-market judgment, AI-engineering risk, solo-founder feasibility under real time constraints, AU-market correctness, and whether the *whole thing actually hangs together as a buildable plan* rather than 37 individually-correct tables.
3. Return findings in the exact format in Section 8.
4. Be direct and specific. Cite line numbers or table/function names. Flag only real issues. Quality over quantity — three genuine findings beat twenty restatements of things already handled.

**What is NOT up for review** (locked decisions — please don't relitigate): the pricing tiers, the tech stack, the choice of Better Auth, the 7-layer architecture itself, and the decision to build Phase 2 as additive-only on top of a shipped Phase 1.

---

## 1. Product context

**VisibleAU** is a multi-tenant SaaS that measures brand visibility across generative-AI search engines: when someone asks ChatGPT, Claude, Gemini, or Perplexity a buyer-intent question, does the brand get **mentioned** and **cited** — and if not, why not, and what should the owner do about it.

- **Market:** Australian agencies and SMBs, in three verticals — Tradies, Allied Health, SaaS.
- **Core promise:** "Do these AI engines mention my brand when relevant?" — answered affordably, without a month of setup, using AU-specific signals (ABN, AU directories, AU-localised vertical prompts).
- **Positioning:** match the visibility-monitoring baseline of Profound / AthenaHQ / Scrunch / Peec / Otterly, then win on operational intelligence, explainability, citation-failure diagnosis, AU local-market intelligence, and agency workflow.
- **Builder reality:** one full-time-employed solo developer building at weekend pace, with one hired developer. Phase 2 is estimated at ~34 weeks across a 9-sprint plan. Feasibility for a small team is a first-class concern, not an afterthought.

---

## 2. Pricing and engine model (locked — context only, do not review)

| Tier | Price (AUD/mo) | Brands | Engines | Prompts | Audit frequency |
|---|---|---|---|---|---|
| Free | $0 | 1 | 2 (ChatGPT + Perplexity) | 10 | On-demand |
| Starter | $99 | 1 | 4 | 50 | Weekly (4/mo) |
| Growth | $299 | 1 | 4 | up to 200 calls | 3×/week (12/mo) |
| Agency | $499 | 5 | 4 | 100/brand | Daily (30/brand/mo) |
| Agency Pro | $1,499 | 25 | 4 | 200/brand | 2×/day (60/brand/mo) |
| Enterprise | $3,000–15,000+ | ∞ | 4 | custom | custom (sales-led) |

- **v1 engines (4):** `chatgpt`, `claude`, `gemini`, `perplexity` — all paid tiers get all four; Free gets two.
- **Scoring:** 5 dimensions (frequency, sentiment, accuracy, position, context), **5 runs per prompt** (`RUNS_PER_PROMPT=5`, required for Wilson 95% CI math). Paid = up to 200 LLM calls/audit; Free = 100.
- **A naming subtlety you will encounter:** engine names (`chatgpt`/`claude`/`gemini`/`perplexity`) are used for stored data; **provider** names (`openai`/`anthropic`/`google`/`perplexity`) are used for the engine on/off feature flags (`isEngineEnabled()` and `LLM_ENGINE_*_ENABLED` env vars). This dual vocabulary is intentional and was just hardened in v8.24 — please don't flag it as an inconsistency unless you find a *specific* place where the wrong vocabulary is used.

---

## 3. Tech stack (locked — do not suggest swaps)

- **Framework:** Next.js 15 (App Router), TypeScript, server actions for mutations.
- **DB:** Supabase Postgres with Row-Level Security (RLS), Drizzle ORM. App-layer multi-tenancy via `organization_id` + RLS `org_isolation` policy.
- **Auth:** Better Auth (migrated from Clerk; `users.id` is UUID PK, with a legacy `clerkUserId TEXT` column retained).
- **Async/jobs:** Inngest. Internal events use **slashes** (`audit/start`, `audit/complete`, `drift/detected`); external webhook delivery events use **dots** (`audit.completed`, `drift.detected`). This split is canonical (Sprint 8) — please don't flag it.
- **LLM access:** Vercel AI SDK. PDFs via `@react-pdf/renderer` (`renderToBuffer()`).
- **Costs:** there is a 4-layer cost-control architecture (config bundles, budget policies, sampling policies, quality gates) and a hard per-audit budget. USD→AUD conversion uses a fixed `0.65` rate (a known simplification — fair to comment on, but it is deliberate for v1).

---

## 4. How Phase 2 relates to Phase 1 (the most important structural rule)

Phase 1 is **already built and shipped** (12 sprints): the audit runner, 5-dimension scoring with Wilson CIs, 336 AU vertical-pack prompts (Tradies 124 + Allied Health 104 + SaaS 108), an 11-action recommendation engine, a Sprint 7 technical audit (8 dimensions/100), local SEO + drift + webhooks (Sprint 8), agency tier + white-label PDF + client portal (Sprint 9), sample audit + Stripe (Sprint 10), landing page (Sprint 11), and production hardening (Sprint 12).

**Phase 2 is strictly additive.** The cardinal rule, stated at the top of the LLD ("CRITICAL RULE — DO NOT BREAK PHASE 1"):

- No Phase 1 table is dropped or restructured.
- Phase 1 tables are extended **only** by adding **nullable** columns via `ALTER TABLE` (so existing rows are safe with no backfill required).
- The three Phase 1 tables extended this way are: `audits` (+4 cols), `citations` (+2 cols), and `brand_entity_scores` (+20 nullable cols).
- Phase 2 reuses Phase 1 infrastructure (the Playwright crawler with its 20-page budget, the quota system, the recommendation/confidence systems) rather than rebuilding it.

**A high-value review question:** does anything in Phase 2 *implicitly* break Phase 1 — e.g. assume a Phase 1 column has a value it may not, read a Phase 1 enum with the wrong spelling, fire an event Phase 1 doesn't emit, or rely on a Phase 1 cron behaving in a way Sprint 12 didn't actually specify? Several past audits found exactly this class of latent break.

---

## 5. The Phase 2 architecture you are reviewing

**7 intelligence layers** (each a `## LAYER N` section in the LLD), built on a Platform Foundation sprint that must complete first:

- **Platform Foundation** (Phase 2 Sprint 1): config bundles, market budget policies, sampling policies, metric quality gates, prompt-pack coverage, provider-market capabilities, cost snapshots. No customer-facing features.
- **Layer 1 — Retrieval Intelligence:** crawler visit logs, content-structure audits, llms.txt versions, agent-readiness scores. (Can the AI crawlers reach and parse the site?)
- **Layer 2 — Visibility Intelligence:** share-of-voice snapshots, visibility trends, prompt-volume estimates, query-fan-out results, topical-coverage gaps, citation-source intelligence, brand web mentions, Google AI Mode results.
- **Layer 3 — Trust Intelligence:** hallucination incidents, evidence snapshots, brand-consensus checks, LinkedIn presence, YouTube presence.
- **Layer 4 — Conversational Discovery:** conversation journeys, journey-run results, comparison-prompt results.
- **Layer 5 — Workflow Intelligence:** remediation tasks, workflow runs, content drafts.
- **Layer 6 — Communication Intelligence:** report templates, generated reports, report-delivery schedules.
- **Layer 7 — Governance Intelligence:** audit trail, org members, data-residency log, org feature flags.

**By the numbers:** 37 new tables, ~25 new Inngest functions, ~30 new API routes, 16 market GAPs addressed, 9-sprint build plan (~34 weeks at weekend pace).

**Where to focus first** (sections most worth a careful read): the "CRITICAL RULE — DO NOT BREAK PHASE 1" section near the top; the per-layer `CREATE TABLE` blocks (the comments encode formulas, enum value sets, UPSERT-vs-append semantics, and tier gates); the "New Inngest functions" comment blocks in each layer (they encode triggers, quota rules, engine gates, and sample-org exclusions); the "PHASE 2 RLS POLICY SPECIFICATION"; and the "PHASE 2 SPRINT PLAN."

---

## 6. Already fixed and CLOSED — please do not re-raise these

Claude has run nine fresh-angle conflict audits (v8.16–v8.25). Each used a distinct lens and is recorded in the LLD's own version changelog (search the file for `# v8.25` down to `# v8.16`). The cumulative set of resolved issue codes includes:

`AF-01, BE-01, C-04, D-01, D-05, E-03, E-03b, EG-01, H-03, H-05, I-03, J-01, K-01, L-01, N-06, O-03, O-03b, R-01, TG-01, U-09, U-13, U-14`

The audit **lenses already exhausted** (do not repeat these angles — they have been checked end-to-end):

- **Schema mechanics:** FK column types vs PK types; foreign keys to non-existent/wrong tables; missing foreign keys; `ON DELETE` behaviour on every audit-linked and ephemeral-table FK (CASCADE vs SET NULL chosen per lifecycle); duplicate column definitions; index-name collisions; composite-index column order; reserved SQL keywords as identifiers; CHECK-constraint usage; `NUMERIC(p,s)` precision/scale; `NOT NULL` booleans missing defaults; `DEFAULT 0` vs `NULL` semantics; UNIQUE-constraint completeness vs UPSERT functions; partial unique indexes on nullable columns.
- **Cross-document consistency:** snake_case (SQL) vs camelCase (Drizzle); Phase-1 column-name references (e.g. `promptsCount`); engine-name vs provider-name vocabulary; enum value/case drift; tier-slug spelling; tier-gate thresholds per feature; cross-table score scales (/100, /20, /18, 0–1); `period_label`/`period_type` formats; percent-vs-decimal representation; cents rounding and USD→AUD conversion; the three confidence-label systems.
- **Behaviour and ops:** RLS coverage and correctness on all 30 tenant tables (and RLS-disabled on the 7 global/seed tables); Inngest event-name delimiters (slash internal / dot delivery); Inngest function-ID/import uniqueness; `serve()` registration; cron-schedule collisions and UTC correctness; the engine on/off gate (`isEngineEnabled`); the sample-org (`slug='sample'`) exclusion across aggregate and per-audit functions; the retired-prompt filter (`retiredAt IS NULL`); the audit-quota gate on every function that fires `audit/start` (including re-audits); `LLM_MODE=mock` coverage; webhook HMAC signing and event taxonomy; pagination on list endpoints; Supabase Storage path patterns; migration ordering; the 20-page crawler-budget reuse; PDF library consistency.
- **Specific landmines already neutralised:** the `entity_score` vs `score_of_10` duplicate-column collision (entity_score was removed; `score_of_10` is canonical); the `conversation_journeys` UX tier regating from Growth+ to Agency+ (now consistent across the matrix, API routes, and cost table); the `complete` vs `completed` `audits.status` mismatch between Sprint 2 and the Sprint 12 retention cron (flagged as a Phase-1 dependency the Phase 2 retention CASCADE/SET-NULL behaviour relies on); UPSERT-vs-append mislabelling on `agent_readiness_scores` and `generated_reports`.

If you believe one of the above is still wrong, that is worth raising — but please point to the **specific current line/table** that's wrong, not the general category.

---

## 7. Where Claude is weakest — your highest-value review angles

These are the lenses Claude is structurally less good at. This is where you'll add the most.

1. **Does the product logic actually serve the customer?** Are the 16 GAPs the *right* gaps for an AU SMB/agency, or is some of this complexity that a Tradie or physio will never use? Is anything table-stakes for the buyer but missing?
2. **AI-engineering risk.** Query fan-out, multi-turn conversation journeys, hallucination detection, cosine-similarity content matching, embeddings — are any of these methods naive, likely to produce noisy/misleading output, or fragile as the underlying models change? Is the scoring defensible, or will it embarrass the company when a customer disputes a number?
3. **Solo-founder feasibility.** Given one part-time founder + one developer at ~34 weeks: is the scope realistic? Which layers/GAPs are over-engineered for v1 and should be deferred to Phase 3? Is there a smaller subset that captures most of the value? Where is the operational burden (monitoring, support, cost-runaway risk) underestimated?
4. **AU-market correctness.** ABN handling, AU directories (hipages, Yellow Pages, Service Seeking, Word of Mouth, True Local), AU subreddits, AU daylight-saving in cron timing, AUSTRAC/privacy (APP) implications of storing brand and mention data. Anything wrong or missing for Australia specifically?
5. **Cross-layer coherence.** Forget individual tables — does the *system* hang together? Do the layers feed each other sensibly (e.g. does Layer 2's gap detection actually drive Layer 5's remediation tasks, which drive Layer 6's reports, which close the loop with a re-audit)? Are there orphaned features that produce data nobody consumes?
6. **Go-to-market and packaging.** Is the tier-gating sensible — are the right features at the right tiers to drive Free→Starter→Growth→Agency upgrades? Does anything valuable sit at too low a tier (no upgrade pressure) or too high (no one ever sees it)?

---

## 8. Required output format

Please return your review in exactly this structure:

```
## SUMMARY
(2-4 sentences: overall assessment. Is this buildable as planned? Biggest single risk?)

## CRITICAL FINDINGS
(Issues that would break the build, corrupt data, mislead customers, or sink the product.
 For each: ID (C1, C2...), the specific table/function/line, what's wrong, why it matters,
 and a concrete fix.)

## MODERATE FINDINGS
(Real problems worth fixing but not blocking. Same per-item structure: M1, M2...)

## SCOPE / FEASIBILITY FINDINGS
(Where the plan is too big for a solo founder. What to cut or defer to Phase 3,
 and the smaller v1 subset you'd ship instead. S1, S2...)

## PRODUCT / GTM FINDINGS
(Product-market and packaging observations. P1, P2...)

## THINGS DONE WELL
(Brief — what's genuinely solid, so Sri knows what not to touch.)

## QUESTIONS FOR SRI
(Anything you'd need answered to give a firmer opinion.)
```

**Rules for your output:**

- Reference specific tables, functions, API routes, or line numbers wherever possible.
- Do not re-raise anything in Section 6 unless you can point to a specific still-wrong line.
- Distinguish "this is a bug" from "this is a judgment call I'd make differently" — label which is which.
- If you genuinely find nothing critical, say so plainly. Do not invent severity to fill the section.
- Keep fixes concrete and stack-appropriate (Next.js 15 / Supabase / Drizzle / Inngest / Vercel AI SDK).

---

*Prepared for a one-shot review. If anything in this handoff is ambiguous, state your assumption and proceed rather than stopping.*
