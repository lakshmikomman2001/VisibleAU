# VisibleAU — Phase 2 LLD Review Handoff for ChatGPT

**Document purpose:** Independent second-opinion review of the VisibleAU Phase 2 Low-Level Design (LLD).
**Prepared by:** Claude, on behalf of Sri (solo founder, Sydney AU).
**Date:** June 2026.
**Primary artefact under review:** `visibleau-7layer-lld.md` — **Version 8.31, 7,243 lines, 37 `CREATE TABLE` statements, 7 intelligence layers, 16 market GAPs.**

> Attach `visibleau-7layer-lld.md` alongside this handoff. This document is the briefing; that file is the thing to review.

---

## 0. What you are being asked to do

You are an independent AI reviewer giving a second opinion. Since your last review (which targeted v8.25), the document has gone through **one product/GTM round (v8.26, your own prior feedback — now applied) plus five more fresh-angle conflict audits (v8.27 → v8.31)**. It is now extremely hardened on the technical side. Your value this round is **not** in finding more schema bugs — those are largely exhausted — but in judging whether the product, as specified, will actually succeed in market and is realistic for a solo founder to ship.

**Your job, in order:**

1. Read this handoff in full first. Sections 6 and 7 tell you what is already closed and which angles are exhausted — don't re-spend effort there.
2. Review through the lenses Claude is structurally weakest at: product-market fit, AI-engineering risk, solo-founder feasibility, AU-market correctness, onboarding, and whether the **whole system coheres** rather than 37 individually-correct tables.
3. Pay special attention to the **two new customer-facing surfaces** added since your last review (Section 5.1) — they are the freshest, least-reviewed parts.
4. Return findings in the exact format in Section 8. Be direct. Quality over quantity.

**Locked — do not relitigate:** pricing tiers, tech stack, Better Auth, the 7-layer architecture, and the additive-only Phase 2 approach.

---

## 1. Product context

**VisibleAU** measures brand visibility across generative-AI search engines: when someone asks ChatGPT, Claude, Gemini, or Perplexity a buyer-intent question, does the brand get **mentioned** and **cited** — and if not, why, and what should the owner do about it.

- **Market:** Australian agencies and SMBs, in three verticals — Tradies, Allied Health, SaaS.
- **Core promise:** "Do these AI engines mention my brand when relevant?" — answered affordably, fast, with AU-specific signals (ABN, AU directories, AU-localised vertical prompts).
- **Positioning:** match the visibility-monitoring baseline of Profound / AthenaHQ / Scrunch / Peec / Otterly, then win on operational intelligence, explainability, citation-failure diagnosis, AU local-market intelligence, and agency workflow.
- **Builder reality:** one full-time-employed solo founder building at weekend pace, plus one hired developer. Phase 2 is a 9-sprint plan, ~34 weeks. Feasibility for a small team is a first-class concern.

---

## 2. Pricing and engine model (locked — context only)

| Tier | Price (AUD/mo) | Brands | Engines | Prompts | Audit frequency |
|---|---|---|---|---|---|
| Free | $0 | 1 | 2 (ChatGPT + Perplexity) | 10 | On-demand |
| Starter | $99 | 1 | 4 | 50 | Weekly (4/mo) |
| Growth | $299 | 1 | 4 | up to 200 calls | 3×/week (12/mo) |
| Agency | $499 | 5 | 4 | 100/brand | Daily (30/brand/mo) |
| Agency Pro | $1,499 | 25 | 4 | 200/brand | 2×/day (60/brand/mo) |
| Enterprise | $3,000–15,000+ | ∞ | 4 | custom | custom (sales-led) |

- **v1 engines (4):** `chatgpt`, `claude`, `gemini`, `perplexity`. All paid tiers get four; Free gets two.
- **Scoring:** 5 dimensions, **5 runs per prompt** (Wilson 95% CI). Paid ≤200 LLM calls/audit; Free 100.
- **Naming subtlety (do not flag):** engine names (`chatgpt`/`claude`/`gemini`/`perplexity`) label stored data; **provider** names (`openai`/`anthropic`/`google`/`perplexity`) label the on/off feature flags. This dual vocabulary is intentional and hardened.

---

## 3. Tech stack (locked — do not suggest swaps)

Next.js 15 (App Router, server actions) · Supabase Postgres + RLS + Drizzle · Better Auth · Inngest (internal events use slashes, external webhook delivery uses dots — canonical, don't flag) · Vercel AI SDK · `@react-pdf/renderer`. A 4-layer cost-control architecture (config bundles, budget policies, sampling policies, quality gates) bounds per-audit spend; USD→AUD uses a fixed 0.65 rate (deliberate v1 simplification — fair to comment on).

---

## 4. How Phase 2 relates to Phase 1 (the cardinal rule)

Phase 1 is **built and shipped** (12 sprints: audit runner, 5-dim scoring with Wilson CIs, 336 AU vertical-pack prompts, 11-action recommendation engine, technical audit, local SEO + drift + webhooks, agency tier + white-label PDF + client portal, sample audit + Stripe, landing page, production hardening).

**Phase 2 is strictly additive.** No Phase 1 table is dropped or restructured; Phase 1 tables are extended only by **nullable** `ALTER TABLE` (existing rows safe, no backfill). The Phase 1 tables extended this way are `audits` (+4 cols), `citations` (+2 cols), `brand_entity_scores` (+20 nullable cols), and — new since your last review — `notification_preferences` (+3 nullable alert-preference booleans). Phase 2 reuses Phase 1 infrastructure (the Playwright crawler with its 20-page budget, quota, recommendation/confidence systems) rather than rebuilding it.

**High-value question:** does anything in Phase 2 *implicitly* break Phase 1 — assume a value a Phase 1 column may not have, read a Phase 1 enum with the wrong spelling, fire an event Phase 1 doesn't emit, or rely on a Phase 1 cron behaving in a way Sprint 12 didn't specify?

---

## 5. The Phase 2 architecture you are reviewing

**7 intelligence layers**, built on a Platform Foundation sprint that must complete first:

- **Platform Foundation** (Sprint 1): config bundles, market budget policies, sampling policies, metric quality gates, prompt-pack coverage, provider-market capabilities, cost snapshots. No customer-facing features.
- **L1 Retrieval:** crawler visit logs, content-structure audits, llms.txt versions, agent-readiness scores (incl. MCP-endpoint readiness, local AI trust).
- **L2 Visibility:** share-of-voice, visibility trends, prompt-volume estimates, query fan-out, topical-coverage gaps, citation-source intelligence, brand web mentions, Google AI Mode.
- **L3 Trust:** hallucination incidents, evidence snapshots, brand-consensus checks, LinkedIn presence, YouTube presence.
- **L4 Conversational Discovery:** conversation journeys, journey-run results, comparison-prompt results.
- **L5 Workflow:** remediation tasks, workflow runs, content drafts.
- **L6 Communication:** report templates, generated reports, report-delivery schedules.
- **L7 Governance:** audit trail, org members (4-role RBAC), data-residency log, org feature flags.

**By the numbers:** 37 new tables, ~25 new Inngest functions, ~30 new API routes, 16 GAPs, 9-sprint plan (~34 weeks at weekend pace).

### 5.1 NEW since your last review — please scrutinise these most

These were added in v8.26 (responding to your prior GTM feedback) and are the least-reviewed surface area. **Both are derived, read-only views over existing data — no new tables.**

1. **AI Visibility Wins Feed** (`GET /api/brands/[id]/wins`, Starter+) — a positive-moments surface to balance the gap/problem detection. A "win" = a new citation, a visibility-rate rise, a competitor's citation drop, a closed gap with positive lift, or a newly-visible engine. Attribution is shown as "likely linked to," never asserted as proven cause. **Review question:** is the win-detection logic sound, or will it surface noisy/misleading "wins" that erode trust? Is "likely linked to" honest enough, or still over-claiming?

2. **Action Progress Tracker** (`GET /api/brands/[id]/progress`) — a "what improved this month?" summary surfaced consistently across dashboard, reports, email digest, and white-label export. It sums `lift_achieved` only where a re-audit actually ran (`score_after IS NOT NULL`). **Review question:** is monthly the right window? Does showing lift only post-re-audit create a confusing lag where customers see effort but no number for weeks?

Also recorded as GTM guidance (not schema): outcome-framing with a *likely-range* traffic/lead impact (hard guardrail: never fabricate revenue), Local AI Trust as a first-class pillar, agency-first GTM, sell-outcomes-not-monitoring messaging, and a customer-facing launch sequence (Health Check → Visibility → Citation Tracking → Failure Diagnosis → Local AI Trust → Recommendations → White-label).

---

## 6. Already fixed and CLOSED — do not re-raise

Across nine fresh-angle conflict audits plus your product round, the cumulative resolved-issue set (searchable in the LLD's own changelog, `# v8.31` down to `# v8.16`) includes, most recently:

`BE-01, DR-01, HI-01, MI-01, NP-01, PT-01, RT-01, TG-01, TZ-01, WH-01` (v8.25–v8.31) — plus the earlier `AF-01, C-04, D-01, D-05, E-03/E-03b, EG-01, H-03, J-01, K-01, L-01, N-06, O-03/O-03b, R-01, U-09/U-13/U-14`.

A few of the most recent, so you don't reopen them: webhook events for the new alert types are now wired into `fanout-webhooks` (WH-01); per-alert notification preferences were added so disabling drift emails no longer suppresses critical hallucination alerts (NP-01); `hallucination_incidents` now uses `ON DELETE SET NULL` so trust history survives the 12-month citation purge (HI-01); the migration file is idempotent (`CREATE … IF NOT EXISTS`, `DROP POLICY IF EXISTS`) (MI-01); AEST/AEDT offsets in cron comments were corrected (TZ-01); a duplicate `citation-sources` route across two layers was removed (RT-01); the Progress Tracker query enforces its own honesty rule in SQL (PT-01); `data_residency_log` got its missing writer (DR-01).

## 7. Audit angles already exhausted — do not repeat

Schema mechanics (FK types/targets, `ON DELETE` on every FK by lifecycle, index names + composite order + redundancy, reserved words, CHECK usage, NUMERIC precision/scale, NOT NULL booleans, UNIQUE completeness + partial indexes + NULL handling, forward-reference ordering, UUID generator, TIMESTAMPTZ consistency); cross-document consistency (snake/camel, Phase-1 column names, engine-vs-provider vocab, enum value/case drift, tier slugs + gates, score scales, period formats, percent/decimal, cents + USD→AUD, the three confidence systems); behaviour & ops (RLS coverage + correctness + `WITH CHECK`, Inngest event delimiters + function-ID uniqueness + `serve()` registration + concurrency/cost-bounding, cron collisions + UTC + DST, the engine gate, sample-org exclusion, retired-prompt filter, quota gate incl. re-audits, mock mode, webhook HMAC + taxonomy + wiring, pagination, storage paths, migration ordering + idempotency, the 20-page crawler-budget reuse, PDF library); plus GAP→implementation completeness, route collisions, denormalization staleness, JSONB GIN need, NUMERIC overflow, task self-reference/loops, the reaudit cycle, email-in-retryable-step, env-var naming, and timestamp coverage.

If you believe one of these is still wrong, raise it — but point to the **specific current line/table**, not the category.

---

## 8. Required output format

```
## SUMMARY
(2-4 sentences: is this buildable as planned by a solo founder? Will it win in market? Biggest single risk?)

## CRITICAL FINDINGS
(Would break the build, corrupt data, mislead customers, or sink the product.
 Per item: ID (C1...), specific table/function/line, what's wrong, why it matters, concrete fix.)

## MODERATE FINDINGS
(Real but non-blocking. M1, M2... same structure.)

## NEW-SURFACE FINDINGS
(Specifically on the Wins Feed + Action Progress Tracker from Section 5.1. N1, N2...)

## SCOPE / FEASIBILITY FINDINGS
(Where the plan is too big for a solo founder. What to cut/defer to Phase 3, and the smaller v1
 subset you'd ship instead. S1, S2...)

## PRODUCT / GTM FINDINGS
(Product-market and packaging. P1, P2...)

## THINGS DONE WELL
(Brief — what's genuinely solid, so Sri knows what not to touch.)

## QUESTIONS FOR SRI
(Anything you'd need answered to give a firmer opinion.)
```

**Rules:** reference specific tables/functions/routes/lines; don't re-raise Section 6/7 items without a specific still-wrong line; label each finding "bug" vs "judgment call I'd make differently"; if you find nothing critical, say so plainly rather than inventing severity; keep fixes stack-appropriate (Next.js 15 / Supabase / Drizzle / Inngest / Vercel AI SDK).

---

*Prepared for a one-shot review. If anything here is ambiguous, state your assumption and proceed rather than stopping.*
