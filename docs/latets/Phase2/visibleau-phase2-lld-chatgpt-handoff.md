# VisibleAU — Phase 2 LLD Review Handoff for ChatGPT

**Document purpose:** Second-opinion audit of the VisibleAU Phase 2 Low-Level Design document  
**Prepared by:** Claude (Sonnet 4.6) on behalf of Sri (solo founder, Sydney AU)  
**Date:** June 2026  
**Primary artefact:** `visibleau-7layer-lld.md` — Version 7.7, 3,738 lines, 37 CREATE TABLEs

---

## 0. What you are being asked to do

You are acting as a second independent AI reviewer. Claude has already audited this document across 20+ audit passes covering security, schema, formulas, data flow, type contracts, operational completeness, and competitor coverage. You are being asked to find anything Claude missed.

**Your job:**

1. Read this entire handoff carefully. It tells you what has already been fixed so you don't re-raise closed issues.
2. Review the Phase 2 LLD through lenses Claude may have been blind to — product logic, AI engineering risk, solo-developer feasibility, AU market assumptions, and cross-layer consistency.
3. Return your findings in the format at the bottom of this document.
4. Be direct. Flag real gaps only. Do not re-raise issues already listed in §6.

---

## 1. Product context

**VisibleAU** is a multi-tenant SaaS that audits brand visibility across generative AI search engines — specifically: does ChatGPT, Claude, Gemini, or Perplexity mention and cite a brand when asked relevant buyer-intent queries?

**Primary market:** Australian agencies and SMBs in three verticals — Tradies, Allied Health, SaaS.

**Core value proposition:** "Do these AI engines mention my brand when relevant?" — answered affordably, without a month of setup, with AU-specific signals (ABN, AU directories, AU vertical prompts).

**Competitive positioning:** Match Profound/AthenaHQ/Scrunch/Peec/Otterly on visibility monitoring baseline. Win through operational intelligence, explainability, citation failure diagnosis, AU local market intelligence, and agency workflow.

**Pricing (locked, not up for review):**

| Tier | Price | Brands | Engines | Prompts | Frequency |
|---|---|---|---|---|---|
| Free | $0 | 1 | 2 (GPT + Perplexity) | 10 | On-demand |
| Starter | A$99/mo | 1 | 4 | 50 | Weekly (4/mo) |
| Growth | A$299/mo | 1 | 4 | up to 200 | 3×/week (12/mo) |
| Agency | A$499/mo | 5 | 4 | 100/brand | Daily (30/brand/mo) |
| Agency Pro | A$1,499/mo | 25 | 4 | 200/brand | 2×/day (60/brand/mo) |
| One-off | A$299 | 1 | 4 | 10 | Single run |

**v1 engines:** ChatGPT (GPT-4o), Claude (3.5 Sonnet), Gemini (1.5 Pro), Perplexity (pplx-70b-online).  
Each audit runs **5 prompt-engine combinations per prompt** (RUNS_PER_PROMPT=5, Wilson 95% CI math).

---

## 2. Tech stack (locked — do not suggest swaps)

| Layer | Choice |
|---|---|
| Framework | Next.js 14 App Router |
| Database | Supabase Postgres with Row-Level Security (RLS) |
| ORM | Drizzle ORM |
| Auth | Better Auth (not Clerk — migrated Sprint 1) |
| Background jobs | Inngest |
| Email | Resend (from noreply@visibleau.com) |
| AI SDK | Vercel AI SDK |
| Payments | Stripe |
| Storage | Supabase Storage |
| Hosting | Vercel |
| Analytics | PostHog |
| Crawler | Playwright (lib/crawler/index.ts — 20-page budget, 15s/page, 5min total) |

---

## 3. Phase 1 schema (already built — do not modify these)

Phase 1 (Sprints 1–12) is complete. The following tables exist and are in production:

**Core multi-tenant tables:**
`users`, `organizations`, `subscriptions`, `brands`, `audits`, `citations`, `recommendations`, `action_items`

**Sprint-specific Phase 1 tables:**
`vertical_packs`, `vertical_pack_prompts`, `audit_schedules`, `bulk_operations`, `audit_exports`, `llm_response_cache`, `drift_alerts`, `canary_prompts`, `notification_preferences`, `local_seo_results`, `brand_entity_scores`, `technical_audits`, `citability_methods`, `validation_corpus_results`, `webhook_endpoints`, `webhook_deliveries`, `processed_webhook_events`, `recommendation_research`, `agency_brand_assets`, `client_portal_invites`, `client_portal_views`

**Phase 1 Drizzle enums (use these — never TEXT where an enum exists):**
`tierEnum` ('free'|'starter'|'growth'|'agency'|'agency_pro'|'enterprise'),  
`regionEnum` ('AU'|'UK'|'US'|'CA'|'NZ'|'EU'),  
`verticalEnum` ('tradies'|'allied_health'|'saas')

**Phase 1 critical locked decisions:**
- `subscriptions.tier` is the canonical tier source — never `organizations.tier`
- Engines stored as `TEXT` by design (deliberate, not a pgEnum gap — adding engines is a code change, not a migration)
- `lib/crawler/index.ts` is the only Playwright instance — no second crawler
- `RUNS_PER_PROMPT = 5` for Wilson CI math — this is not a config value, it's a code constant
- Every protected API route MUST call `setRlsContext(db, currentUser.organizationId)` before any DB query
- Cross-org access returns 404, never 401
- `lib/email/client.ts` Resend singleton — never create a new Resend instance elsewhere
- `LLM_MODE=mock` for all tests — real LLM gated behind `E2E_USE_REAL_LLM=true`
- 4 canonical mock scenarios: `happy_path`, `no_mention`, `partial_failure`, `rate_limited` — locked

**Phase 1 Brand Entity Scores (Sprint 7 table — Phase 2 extends via ALTER TABLE, not CREATE TABLE):**
`brand_entity_scores` has `abn_verified`, `score_of_10`, AU directory presence JSONB etc.
Phase 2 adds nullable columns via `ALTER TABLE` — this is documented in the LLD as Phase 1 ALTER TABLE operations. Do NOT flag this as a missing CREATE TABLE.

---

## 4. Phase 2 architecture — the 7-layer design

Phase 2 adds **37 new tables** across 7 intelligence layers. Build order follows sprint sequence.

### Layer 1 — Retrieval Intelligence (Sprint 6)
How AI crawlers read the brand's site and what content signals they find.  
Tables: `crawler_visit_logs`, `content_structure_audits`, `llmstxt_versions`, `agent_readiness_scores`

### Layer 2 — Visibility Intelligence (Sprint 3)
How often the brand appears in AI responses across prompts and providers.  
Tables: `visibility_trends`, `share_of_voice_snapshots`, `prompt_volume_estimates`, `query_fan_out_results`, `topical_coverage_gaps`, `citation_source_intelligence`, `brand_web_mentions`

### Layer 3 — Trust Intelligence (Sprint 5)
Whether AI treats the brand as a trustworthy, accurate, consistent source.  
Tables: `hallucination_incidents`, `evidence_snapshots`, `brand_consensus_checks`, `linkedin_presence_audits`, `youtube_presence_audits`  
Phase 1 ALTER: `brand_entity_scores` (adds Knowledge Panel, Wikidata, market_code columns)

### Layer 4 — Conversational Discovery Intelligence (Sprint 7)
How the brand performs in multi-turn AI conversations and comparison queries.  
Tables: `conversation_journeys`, `journey_run_results`, `comparison_prompt_results`

### Layer 5 — Workflow Intelligence (Sprint 2)
The task and content workflow layer that turns audit findings into action.  
Tables: `remediation_tasks`, `workflow_runs`, `content_drafts`

### Layer 6 — Communication Intelligence (Sprint 4)
AI-generated narrative reports and scheduled delivery.  
Tables: `report_templates`, `generated_reports`, `report_delivery_schedules`

### Layer 7 — Governance Intelligence (Sprint 8)
Multi-member access, audit trail, data residency, feature flags.  
Tables: `org_members`, `audit_trail`, `data_residency_log`, `org_feature_flags`

### Platform Foundation (Sprint 1 — no user-facing features)
Tables: `config_bundle_cache`, `market_ai_budget_policies`, `sampling_policies`, `metric_quality_gates`, `prompt_pack_coverage`, `provider_market_capabilities`, `audit_cost_snapshots`

### Stretch goal (Sprint 3)
Table: `google_ai_mode_results` — [GAP 5] Google AI Mode is a separate surface from Gemini; included as stretch goal only

---

## 5. The 16 research gaps the LLD addresses

These are product research findings from June 2026 that Phase 2 must address. They are labelled `[GAP N]` throughout the LLD.

| GAP | Finding | Tables/Features |
|---|---|---|
| 1 | Query Fan-Out: AI sub-divides a single query into 3-12 sub-queries | `query_fan_out_results`, `simulate-query-fan-out.ts` |
| 2 | Agent Readiness Score: 5 dimensions × 20pts = /100 | `agent_readiness_scores`, `score-agent-readiness.ts` |
| 3 | MCP readiness check: is brand site MCP-ready? | `agent_readiness_scores.mcp_ready` column |
| 4 | Citation source type intelligence: who gets cited? | `citation_source_intelligence` |
| 5 | Google AI Mode is a separate surface from Gemini | `google_ai_mode_results` (stretch) |
| 6 | Topical coverage gap: topics competitors cover, brand doesn't | `topical_coverage_gaps`, `calculate-topical-gaps.ts` |
| 7 | LinkedIn Presence Intelligence: 40% of B2B AI citations from LinkedIn | `linkedin_presence_audits` |
| 8 | Content format detection: listicle vs how-to vs FAQ affects citation rate | `content_structure_audits.content_format_detected` |
| 9 | Mention-Source Divide: fewer than 1 in 5 brands are both mentioned AND cited | `visibility_trends.mention_rate`, `brand_archetype` |
| 10 | Cross-Platform Consensus Score: AI gives inconsistent brand descriptions | `brand_consensus_checks` |
| 11 | Knowledge Panel check: does brand appear in Google's Knowledge Graph? | `brand_entity_scores.knowledge_panel_*` columns |
| 12 | Entity Home audit: Kalicube principle — brand's canonical AI-description page | `content_structure_audits.is_entity_home_candidate` |
| 13 | Wikidata entry check: structured linked-data presence | `brand_entity_scores.wikidata_*` columns |
| 14 | Brand Web Mention Intelligence: Reddit/YouTube/Quora mentions | `brand_web_mentions`, `track-brand-web-mentions.ts` |
| 15 | Citation Volatility Score: std dev of citation_rate across last 12 audits | `visibility_trends.citation_volatility_score` |
| 16 | YouTube Presence Intelligence: #1 domain in Google AI Overviews | `youtube_presence_audits` |

---

## 6. What Claude has already audited and fixed

The following conflict series are closed. Do NOT re-raise these. Each letter series = one audit pass.

**C-series (v6.1):** brand_entity_scores Phase 1 conflict, Clerk→Better Auth stale refs, 3-layer auth model, hallucination scope, late-added Sprint 9/10 columns.

**D-series (v6.2):** entity_score/score_of_10 duplication, content_structure design note, sample audit org exclusion, `audit/start` event name, confidence label casing.

**E-series (v6.3):** FK TEXT→UUID corrections on 6 columns, RLS policies on 30 Phase 2 tables, CASCADE/SET NULL on retention FKs, `/api/organisations/` → `/api/organizations/` spelling, env flag priority order.

**G-series (v6.4):** visibility_trends score source columns (numeric not text), `lib/pdf/theme.ts` import in pdf-builder, `draft_type` underscore vs `recommendation_key` hyphen naming convention, agency_brand_assets FK in generated_reports, vertical TEXT constraints, schedule-workflow quota gate, sprint table numbers.

**H-series (v6.5):** `serve()` registration for all 25 Phase 2 Inngest functions, UTC cron expressions (Mon=0 20 * * 1), entity_clarity_score rename, prompt_sequence JSONB shape, time_of_day UTC default.

**I-series (v6.6):** Tier gate table (20 features × 5 tiers), ModelTask union extension (narrative_generation, content_draft), comparison_prompt_results competitor_domain source, scraping libraries (Reddit JSON API, YouTube Data API v3, Quora cheerio).

**J-series (v6.7):** updated_at on 10 mutable Phase 2 tables, org_members 4-role permission matrix, LinkedIn data source (cheerio + public pages), LLM cache TTL (narrative=720h, content_draft=bypass).

**K-series (v6.8):** citation_source_intelligence partial UNIQUE indexes (nullable audit_id), llmstxt_versions is_current management, config_bundle_cache is_active management, share_of_voice_snapshots competitor_domain source, YOUTUBE_API_KEY env var.

**L-series (v6.9):** brand_consensus_checks ON CONFLICT upsert pattern, period_label date-fns format strings (yyyy-'W'II weekly, yyyy-MM monthly), generate-narrative-report.ts 8-table input shape, agent_readiness_scores 5-dimension formulas.

**M-series (v7.0):** cosine similarity library (ml-distance, threshold >0.88), sampling_policies governs Phase 2 aggregation only (Phase 1 RUNS_PER_PROMPT=5 unchanged), engine_citation_seen cross-join mechanism, report_templates is_default seed pattern, journey_score formula.

**N-series (v7.0):** Drizzle barrel exports (8 schema file groups + db/schema/index.ts), content_format_detected→content_format mapping table, Phase 2 recommendation_keys seeding (8 new keys), YouTube API v3 endpoints (channels.list / playlistItems.list / videos.list), webhook event taxonomy (+5 Phase 2 events), is_false_positive column on hallucination_incidents.

**O-series (v7.1):** `setRlsContext()` mandatory on all 30+ Phase 2 API routes, quality_status writer (QualityGateService.evaluate from refresh-audit.ts), sample org exclusion extended to 4 more aggregation functions (aggregate-visibility-trend, track-brand-web-mentions, score-agent-readiness, simulate-query-fan-out), audit_cost_snapshots writer (refresh-audit.ts via BudgetPolicyService, USD→AUD), retired prompt filter in simulate-query-fan-out.ts (WHERE retiredAt IS NULL).

**P-series (v7.2):** send-scheduled-reports.ts email template spec (from/subject/body/PDF attachment/unsubscribe), sample_quality derivation rule (audit_count thresholds, Confirmed/Likely/Hypothesis/Insufficient data), brand_archetype thresholds (mention_rate≥0.20=high, citation_rate≥0.10=high), hallucination claim_type classification via hallucinationFlags JSONB keywords, metric_quality_gates AU_EN seed data (7 rows).

**Q-series (v7.3):** cross-org 404 guard in all Phase 2 routes (CLAUDE.md §8 compliance), isEngineEnabled() check in Phase 2 LLM functions (Sprint 12 JD3 gate), linkedin_presence_audits presence_score formula (company 30pts + founder 40pts + content 30pts), youtube_presence_audits presence_score formula (channel 15pts + volume 20pts + transcript/chapters 35pts + embedding+schema 20pts + AI citation signal 10pts), LLM_MODE=mock coverage for 5 Phase 2 LLM functions.

**R-series (v7.4):** wont_fix_reason TEXT column on remediation_tasks with Zod refine, topical_coverage_gaps.topic_cluster naming convention (hyphens→underscores translation, DISTINCT topic source from vertical_pack_prompts), org_members 5-step invitation flow (accepted_at population), BudgetPolicyService type definitions (AuditParams, CostEstimate, BudgetPolicy, EnforcementResult) + caller spec.

**S-series (v7.5):** org_feature_flags canonical flag_key values (8 keys, operator-only), report_delivery_schedules day_of_week/day_of_month mutual exclusivity + Zod refine + max day=28, citation_volatility_score NULL when audit_count<3 + UI 'Not enough data', content-structure-audit.ts REUSES lib/crawler/index.ts (UPSERT on UNIQUE(brand_id, page_url)), alert-composer.ts 4 alert types (hallucination/drift/consensus/volatility) with triggers/subjects/bodies/recipients.

**T-series (v7.6):** ChatGPT LLD v7 SQL addendum conflicts — max_models_per_audit=2 wrong (Phase 2 LLD=4 is correct per PRD §7), max_repeated_samples=3 wrong (Phase 2 LLD=5 is correct per Sprint 3 Wilson CI), sampling_policies minimum_repeated_samples=2 wrong (Phase 2 LLD=3 is correct). Citation Failure Diagnosis assigned to Sprint 3 (CitationFailureDiagnosis.tsx component already exists, no new table needed, reads citation_source_intelligence + comparison_prompt_results + topical_coverage_gaps at read-time via lib/visibility/citation-failure-diagnosis.ts).

**U-series (v7.7):** remediation_tasks.effort TEXT column added (denormalized from recommendations.effort; heuristic for gap-spawned tasks), mention_rate + citation_rate computation formulas (citations.brandMentioned BOOLEAN source, DISTINCT promptId counts), workflow_runs.result_summary JSONB shape (keyed by workflow_type), citation-failure-diagnosis.ts input shape (diagnose({ brandId, auditId?, promptId? })), mention_source_ratio division-by-zero guard (NULL when mention_rate=0, maps to 'invisible' archetype), provider_market_capabilities AU_EN seed (4 providers, is_enabled=true, in db/seed/provider-market-capabilities.ts Sprint 1).

---

## 7. Key design decisions ChatGPT must not contradict

These are irrevocable architectural choices. If your audit produces a finding that conflicts with one of these, note the tension but do not recommend reverting the decision.

1. **Tier source of truth:** `subscriptions.tier` — never `organizations.tier`
2. **Engine storage:** `TEXT` field (not pgEnum) — deliberate; adding engines is a code change, not a migration
3. **Runner count:** `RUNS_PER_PROMPT = 5` — Wilson CI math, not configurable
4. **Auth system:** Better Auth — Clerk references in any doc are stale and were already corrected
5. **RLS pattern:** `setRlsContext(db, organizationId)` before every query — never bypassed
6. **Sample org:** `organizations.slug = 'sample'` — excluded from all aggregation functions
7. **Crawler:** Only `lib/crawler/index.ts` — no second Playwright instance
8. **Mock scenarios:** Exactly 4 canonical — locked across all test docs
9. **Phase 2 LLD defaults correct over ChatGPT LLD v7 addendum defaults** where they conflict (see T-series above)
10. **No user-created custom prompt libraries in v1** — intentionally descoped per CLAUDE.md §2; v1.1 feature

---

## 8. Angles Claude covered

The following audit angles have been thoroughly examined. ChatGPT should focus energy elsewhere.

- FK data types (TEXT vs UUID) ✓
- RLS policies on every table ✓
- CASCADE / SET NULL choices per table ✓
- API route spelling (American English) ✓
- Inngest serve() registration for all functions ✓
- UTC cron expressions ✓
- pgEnum vs TEXT usage ✓
- setRlsContext on every API route ✓
- Cross-org 404 (not 401) pattern ✓
- isEngineEnabled() gate on LLM functions ✓
- LLM_MODE=mock coverage ✓
- Sample org exclusion in aggregation functions ✓
- Drizzle barrel exports ✓
- Naming conventions (draft_type underscores, recommendation_key hyphens, topic_cluster underscores) ✓
- Resend singleton usage ✓
- Wilson CI math (RUNS_PER_PROMPT=5) ✓
- Budget policy defaults (max_models=4, max_repeated_samples=5) ✓
- Scoring formulas (agent_readiness, LinkedIn presence, YouTube presence, journey_score) ✓
- Division-by-zero guards (mention_source_ratio) ✓
- NULL handling (citation_volatility_score <3 runs) ✓
- Seed data (metric_quality_gates, provider_market_capabilities, recommendation_keys) ✓
- Type contracts (BudgetPolicyService, CitationDiagnosis input shape, result_summary JSONB) ✓
- Status machine completeness (quality_status writer, wont_fix_reason Zod refine) ✓
- Invitation flow (org_members accepted_at 5-step) ✓
- Alert triggers (4 alert types, recipients, subjects) ✓
- Competitor PRD coverage (R1-R5 Must Have, D1-D6 differentiators) ✓
- Email template specs (scheduled reports, from address, subject patterns) ✓
- Crawler reuse (content-structure-audit.ts reuses lib/crawler/index.ts) ✓
- Flag key canonical values (8 keys, operator-only) ✓
- Mutual exclusivity constraints (day_of_week vs day_of_month) ✓

---

## 9. Suggested audit angles for ChatGPT

The following angles have NOT been exhaustively covered, or warrant a fresh set of eyes:

**Product logic:**
- Do the 9 sprint scopes form a coherent build sequence? Are any sprint dependencies inverted (Sprint N uses a table not created until Sprint M)?
- Are the 16 GAPs all addressable in Phase 2's 9 sprints (36 weeks)? Which are most at risk of scope creep?
- Does the Mention-Source Divide (brand_archetype quadrant) produce actionable recommendations in all 4 quadrants, or do some quadrants lead to dead-ends?
- Is the journey_score formula (brand_appeared / total × 100 + early-mention bonus) meaningful enough to drive decisions? What if early-mention bonus creates perverse incentives?

**AI engineering risk:**
- Are there prompt injection risks in any Phase 2 function that passes brand-supplied content into LLM prompts?
- Is the cosine similarity threshold (>0.88) appropriate for AU English vs US English embeddings? What does a false positive at 0.88 look like?
- Does the hallucination detection (citations.is_accurate=false → claim_type classification) risk false positives that could alarm brands unnecessarily?
- Is the citation-failure-diagnosis.ts approach (read-time join of 3 tables, no new table) performant enough for brands with 500+ audit rows?

**Solo developer feasibility:**
- Which of the 9 Phase 2 sprints is most likely to overrun for a solo developer? What's the single biggest risk to the Phase 2 timeline?
- Is the Phase 2 Sprint 1 (Platform Foundation — no user-facing features) appropriately scoped or is it underestimated?
- Are there any tables in Phase 2 that require complex database-level work (triggers, stored procedures, materialised views) that would slow down a solo developer?

**AU market assumptions:**
- The ABN/AU directory signals are central to the brand entity layer. Are there edge cases where AU businesses legitimately don't have these (e.g., sole traders, partnerships, trusts)?
- The AU subreddit seed list (r/australia, r/AusFinance, r/sydney, r/melbourne, r/brisbane, r/auslaw, r/AustralianPolitics + vertical-specific) — is this sufficient for the three target verticals (Tradies, Allied Health, SaaS)?
- For Allied Health specifically — are there AHPRA compliance risks in how VisibleAU surfaces AI-generated health claims in hallucination_incidents?

**Cross-layer consistency:**
- Do all 7 layers have consistent error handling patterns (failed Inngest functions, failed crawls, failed LLM calls)?
- Is there any table in Phase 2 where the data retention policy conflicts with evidence_snapshots being legally-grade immutable archive?
- Do the Phase 2 webhook events (+5 events) cover all the new Phase 2 triggers, or are there new Inngest events that should also fire webhooks?
- Is the governance layer (Layer 7 — Sprint 8) scoped too late? Do earlier sprints (1–7) produce data that should be audit-trailed but won't be, because audit_trail doesn't exist until Sprint 8?

**Schema review:**
- Are there any missing indexes on Phase 2 tables for likely query patterns (e.g., `visibility_trends` filtered by brand_id + period_label)?
- Are there any tables that should have a `UNIQUE` constraint but don't (preventing silent duplicate inserts)?
- `google_ai_mode_results` is a stretch goal — does it have enough detail to be implementable if the scope is approved mid-sprint?

---

## 10. Output format requested

Return your findings as:

```
## Finding [N] — [Title]

**Severity:** BREAKING | MODERATE | LOW | PRODUCT-RISK
**Layer:** [Layer 1-7 / Platform / Sprint N]
**Tables affected:** [table names]

**Problem:**
[Precise description of the gap or conflict]

**Recommended fix:**
[Specific, actionable recommendation]

**Evidence:**
[Quote from LLD or source doc that supports the finding]
```

For findings that require a schema change, include the exact SQL or Drizzle ORM code to fix it.

For findings that require a logic fix, include the exact TypeScript pattern.

Do not include findings that are already in §6 (covered by Claude's audit series). If you believe Claude's fix for a conflict was itself wrong, flag it separately as a **CORRECTION** type finding.

---

## 11. Source documents available to ChatGPT for cross-referencing

| Document | Location | Purpose |
|---|---|---|
| Phase 2 LLD v7.7 | `visibleau-7layer-lld.md` | Primary document under review |
| Foundations v1.12 | `02-engineering/sri-visibleau-foundations.md` | Phase 1 schema + conventions |
| CLAUDE.md v1.23 | `CLAUDE.md` | Canonical design doc + anti-patterns |
| PRD v1.15 | `01-product/sri-geo-aeo-prd-v1.md` | Product spec |
| Sprint prompts 1–12 | `03-sprint-prompts/sri-visibleau-sprint-N-prompt.md` | Sprint-by-sprint specs |
| Architecture overview | `02-engineering/sri-visibleau-architecture-overview.md` | System architecture |
| Multi-region doc | `02-engineering/sri-visibleau-multi-region-phase-2.md` | UK/US/CA/NZ expansion |
| Competitor PRD | (uploaded separately) | Competitor landscape validation |
| Killer Features doc | (uploaded separately) | Reddit/YouTube/Agency research findings |

---

## 12. One thing to know about Sri

Sri is a solo developer building this on weekends (~8 hours/week). He has 16+ years of full-stack experience and will push back on vague findings. Every finding you raise must be specific enough that he can open the relevant file in VS Code and make the fix without further clarification. "Consider improving X" is not a finding. "Table Y is missing a UNIQUE constraint on (brand_id, period_label) which will cause silent duplicate rows from the weekly cron" is a finding.

---

*End of handoff document. The Phase 2 LLD is attached or available at the location above.*
