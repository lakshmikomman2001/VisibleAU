# VisibleAU — Phase 2 LLD Handoff for ChatGPT Review
## Document purpose: Brief ChatGPT to audit `visibleau-7layer-lld.md` (v8.17)

**Date:** June 2026  
**Prepared by:** Sri + Claude  
**LLD current version:** 8.17 | 5,947 lines | 37 Phase 2 CREATE TABLEs  
**Primary file to review:** `visibleau-7layer-lld.md`  
**Supporting files:** `sri-visibleau-foundations.md` (v1.12), all 12 `sri-visibleau-sprint-N-prompt.md`

---

## 1. What VisibleAU Is

VisibleAU is a multi-tenant SaaS platform for AU agencies and SMBs to track, understand, and improve their brand's visibility in AI-generated search results (ChatGPT, Claude, Gemini, Perplexity). It runs LLM audits, computes multidimensional scores, and delivers research-backed remediation tasks.

**Phase 1** (12 sprints, fully built) delivered: multi-tenant Postgres/Supabase with RLS, 4-engine LLM audit runner, 5-dimension scoring with Wilson 95% CIs, 336 AU vertical pack prompts, 11-action recommendation engine, Sprint 7 technical audit (8 dimensions /100), Sprint 8 local SEO + drift detection + webhooks, Sprint 9 agency tier + white-label PDF, Sprint 10 sample audit + Stripe checkout.

**Phase 2** (LLD being reviewed) adds 7 intelligence layers on top of Phase 1, implemented as 9 new sprints. No Phase 1 table is dropped or structurally changed — only nullable columns are added via `ALTER TABLE`.

---

## 2. Phase 1 Canonical Facts — Do Not Contradict These

Any Phase 2 conflict that touches these values is a breaking error.

### Auth
- Auth system: **Better Auth** (migrated from Clerk during Phase 1 build; Clerk references in Foundations v1.12 and CLAUDE.md are stale — Better Auth is canonical)
- `auth_users`, `auth_sessions`, `auth_members`, `auth_organizations`, `auth_invitations`, `auth_verifications` — managed by Better Auth library, never write directly
- `users.id` is UUID PK + `clerkUserId TEXT UNIQUE` (now maps to Better Auth user ID)
- `organizations.clerkOrgId TEXT UNIQUE` (now maps to Better Auth org ID)

### Engines
- **v1 ships 4 engines on ALL paid tiers:** `chatgpt` | `claude` | `gemini` | `perplexity`
- v1.1 roadmap: adds `copilot` | `ai_overviews` (Growth+)
- v1.2 roadmap: adds `deepseek` | `grok` (Agency Pro)
- `citations.engine` is TEXT (not pgEnum) — deliberately, so adding engines is a code change not a migration
- Free tier: ChatGPT + Perplexity only (2 engines)

### Scoring
- **5 dimensions:** frequency, sentiment, accuracy, position, context
- **5 runs per prompt** (Wilson CI requires ≥5; `runsPerPrompt = 5`)
- **10 prompts per audit** from vertical pack
- Paid tier: 4 engines × 10 prompts × 5 runs = **200 LLM calls**
- Free tier: 2 engines × 10 prompts × 5 runs = **100 LLM calls**
- Cost budget: <US$3.00 paid / ~US$1.50 Free (LLM only); <US$3.50 combined with technical audit

### Audits table (Sprint 2/3 canonical columns)
```
engines TEXT[], promptsCount INTEGER, runsPerPrompt INTEGER, totalCalls INTEGER,
scoreComposite NUMERIC(5,2), totalCostUsd NUMERIC(8,4),
scoreFrequency, scoreSentiment, scoreSentimentNumeric, scoreAccuracy,
scorePosition, scoreContext, scoreContextNumeric,
scoreConfidenceLow, scoreConfidenceHigh, confidenceIntervals JSONB
```
Note: Foundations v1.12 shows old Sprint 1 names (`promptCount`/`engineCount`) — those are stale. Sprint 2/3 canonical names above are correct.

### Vertical packs (Sprint 5)
- 336 prompts total: Tradies 124 + Allied Health 104 + SaaS 108
- All queries filter `WHERE retiredAt IS NULL` — never omit this
- `vertical_pack_prompts` Phase 1 columns: `id, packId, promptTemplate, rank, category, topic, expectedMentionType, notes, createdAt, retiredAt`
- Phase 2 adds 3 nullable columns via ALTER TABLE: `persona_tag`, `branded_intent`, `source`

### Sample audit (Sprint 10 — HC1 fix)
- **1 engine (ChatGPT ONLY)**, 5 prompts, 1 run, ~90 seconds, ~A$0.10
- Attaches to synthetic `organizations.slug = 'sample'` org (auto-deleted 24h)
- Rate-limited: 3 per IP per day via Upstash Redis

### Tier limits (Sprint 9 canonical)
```typescript
export const TIER_AUDIT_LIMITS = {
  free:       { auditsPerMonth: 1,              brandsMax: 1  },
  starter:    { auditsPerMonth: 4,              brandsMax: 1  },
  growth:     { auditsPerMonth: 12,             brandsMax: 1  },
  agency:     { auditsPerBrandPerMonth: 30,     brandsMax: 5  },
  agency_pro: { auditsPerBrandPerMonth: 60,     brandsMax: 25 },
  enterprise: { auditsPerBrandPerMonth: Infinity, brandsMax: Infinity },
};
```

### Pricing (canonical)
| Tier | Price |
|---|---|
| Free | A$0 |
| Starter | A$99/mo |
| Growth | A$299/mo |
| Agency | A$499/mo |
| Agency Pro | A$1,499/mo |
| Enterprise | A$4,000–A$15,000+/mo (custom, sales-led, no Stripe) |

### Technical audit (Sprint 7 — 8 dimensions)
Robots /18 + llms.txt /18 + Schema /16 + Meta /14 + Content /12 + Brand & Entity /10 + Signals /6 + AI Discovery /6 = 100 pts  
Surfaced to UI as 5 rolled-up categories (per §16 Gap D UX decision).  
`technical_audits.auditId` FK is **nullable** — technical audit runs alongside multidim audit but not always linked.

### RLS pattern (Sprint 1 canonical)
Every tenant table has `ENABLE ROW LEVEL SECURITY` + policy using `current_setting('app.current_org_id', true)`.  
App routes call `setRlsContext(db, orgId)` before any DB query.  
Cross-org access returns **404** (not 401) to avoid leaking resource existence.

### Webhook events (Sprint 8 — Phase 1 VALID_EVENTS)
`audit.completed` | `audit.score.dropped` | `audit.score.changed` | `drift.detected` | `recommendation.created`

---

## 3. Phase 2 Architecture Overview

### The 7 Intelligence Layers

| Layer | Name | Key tables | Phase 2 Sprint |
|---|---|---|---|
| 1 | Retrieval Intelligence | `crawler_visit_logs`, `content_structure_audits`, `llmstxt_versions`, `agent_readiness_scores` | Sprint 6 |
| 2 | Visibility Intelligence | `share_of_voice_snapshots`, `visibility_trends`, `prompt_volume_estimates`, `query_fan_out_results`, `topical_coverage_gaps`, `citation_source_intelligence`, `brand_web_mentions` | Sprint 3 |
| 3 | Trust Intelligence | `hallucination_incidents`, `evidence_snapshots`, `citation_source_intelligence`, `linkedin_presence_audits`, `brand_consensus_checks`, `youtube_presence_audits` | Sprint 5 |
| 4 | Conversational Discovery | `conversation_journeys`, `journey_run_results`, `comparison_prompt_results` | Sprint 7 |
| 5 | Workflow Intelligence | `remediation_tasks`, `workflow_runs`, `content_drafts` | Sprint 2 |
| 6 | Communication Intelligence | `report_templates`, `generated_reports`, `report_delivery_schedules` | Sprint 4 |
| 7 | Governance Intelligence | `audit_trail`, `org_members`, `data_residency_log`, `org_feature_flags` | Sprint 8 |

### The 16 Market Gaps (each addressed by a Phase 2 table or feature)

| GAP | Description | Layer |
|---|---|---|
| 1 | Query Fan-Out Intelligence (3–12 sub-queries per top-level prompt) | L2 |
| 2 | AI Agent Readiness Score (crawlability, MCP, llms.txt, entity) | L1 |
| 3 | MCP endpoint check (/mcp.json, .well-known/mcp) | L1 |
| 4 | Citation Source Type Intelligence (reddit/linkedin/youtube/etc.) | L2+L3 |
| 5 | Google AI Mode as separate engine (stretch, 75M+ daily users) | L2 |
| 6 | Topical Coverage Gap Score (topic cluster analysis) | L2 |
| 7 | LinkedIn Presence Intelligence (#1 cited domain professional queries) | L3 |
| 8 | Content Format Intelligence (how-to/FAQ/comparison → citation probability) | L5+L1 |
| 9 | Mention-Source Divide (2×2 matrix: mention rate vs citation rate) | L2 |
| 10 | Cross-Platform Consensus Score (consistent brand facts across sources) | L3 |
| 11 | Knowledge Graph / Knowledge Panel check | L3 |
| 12 | Entity Home audit (canonical brand URL, @id, sameAs) | L1 |
| 13 | Wikidata entry check | L3 |
| 14 | Brand Web Mention Intelligence (Reddit/YouTube/Quora/LinkedIn mentions) | L2 |
| 15 | Citation Volatility Score (std dev of citation rate across audits) | L2 |
| 16 | YouTube Presence Intelligence (#1 domain in AI Overviews 30% share) | L3 |

### Phase 2 → Phase 1 Column Additions (ALTER TABLE)

```sql
-- audits table (Phase 1)
ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS config_bundle_id     UUID REFERENCES config_bundle_cache(id),
  ADD COLUMN IF NOT EXISTS config_digest        TEXT,
  ADD COLUMN IF NOT EXISTS estimated_cost_cents INTEGER,
  ADD COLUMN IF NOT EXISTS quality_status       TEXT DEFAULT 'pending';
  -- 'pending' | 'sufficient' | 'insufficient' | 'partial'

-- citations table (Phase 1)
ALTER TABLE citations
  ADD COLUMN IF NOT EXISTS cited_source_type           TEXT,
  ADD COLUMN IF NOT EXISTS cited_source_engine_affinity TEXT;

-- vertical_pack_prompts table (Phase 1 Sprint 5)
ALTER TABLE vertical_pack_prompts
  ADD COLUMN IF NOT EXISTS persona_tag   TEXT;       -- 'cto'|'developer'|'homeowner'|etc. NULL=all
  ADD COLUMN IF NOT EXISTS branded_intent TEXT;      -- 'branded'|'non_branded'|'semi_branded'|NULL
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'curated'; -- 'curated'|'ai_suggested'|'custom'

-- brand_entity_scores table (Phase 1 Sprint 7)
-- Phase 2 adds ~21 nullable columns via ALTER TABLE (market_code, organization_id,
-- hipages/directory typed fields, Knowledge Panel, Wikidata, entity_score, etc.)
```

### Key Phase 2 Services

```
lib/platform/
  config-bundle.service.ts     — market config snapshot per audit
  budget-policy.service.ts     — per-function cost enforcement
  sampling-policy.service.ts   — quality gate (Confirmed/Likely/Hypothesis)
  quality-gate.service.ts      — sets audits.quality_status post-audit
  explainability.service.ts    — mandatory rationale on every scored response
  region-to-market-code.ts     — maps organizations.region → market_code (AU_EN etc.)
```

### Phase 2 Cost Budget (BudgetPolicyService)

All figures are per-brand per-month additions on top of Phase 1 audit cost:

| Function | Cost target | Frequency | Tier gate |
|---|---|---|---|
| simulate-query-fan-out.ts | <US$0.40/mo | per audit | Growth+ |
| run-journey.ts | <US$0.50/mo | 2×/mo | Growth+ |
| run-comparison-prompts.ts | <US$0.60/mo | 2×/mo | Growth+ |
| generate-narrative-report.ts | <US$0.30/mo | 1×/mo | Growth+ |
| generate-content-draft.ts | <US$0.20/mo | on-demand | Growth+ |
| build-citation-source-intelligence.ts | <US$0.10/mo | per audit | Growth+ |
| content-structure-audit.ts | <US$0.08/mo | 4×/mo | Growth+ |
| audit-linkedin-presence.ts | <US$0.02/mo | 4×/mo | Growth+ |
| audit-youtube-presence.ts | <US$0.04/mo | 4×/mo | Growth+ |
| track-brand-web-mentions.ts | <US$0.05/mo | 4×/mo | Growth+ |
| score-agent-readiness.ts | <US$0.02/mo | 1×/mo | Growth+ |

**Phase 2 total addition: <US$2.31/brand/month on Growth+. Phase 1 margin stays >85%.**

---

## 4. Conflicts Already Fixed — Do Not Re-Open

These were found and resolved across audits v6.1 through v8.17. Any suggestion to change them requires understanding why they were fixed this way.

### Critical structural fixes (do not revert)
- **E-01 (v6.3):** All `REFERENCES users(id)` are UUID — not TEXT. Any TEXT FK to users is a bug.
- **E-02 (v6.3):** All 30 tenant tables have `ENABLE ROW LEVEL SECURITY`. 7 global seed tables are correctly exempt.
- **E-03 (v6.3):** `audit_id` FKs use `ON DELETE CASCADE` or `ON DELETE SET NULL` — never NOT NULL without a delete clause.
- **E-04 (v6.3):** All routes use `/api/organizations/` (American spelling, matches table name).
- **J-01 (v6.7):** All mutable UPSERT tables have `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Latest fix in v8.17 added it to 6 more tables.
- **K-01 (v6.8):** `citation_source_intelligence` uses TWO partial unique indexes (not one UNIQUE constraint) because `audit_id` is nullable.
- **K-02 (v6.8):** `llmstxt_versions.is_current` uses partial unique index + managed via transaction.
- **L-01 (v6.9):** `brand_consensus_checks` uses `ON CONFLICT DO UPDATE` pattern (upsert, not insert).
- **L-02 (v6.9):** `visibility_trends.period_label` format is exact: `yyyy-'W'II` (ISO week) or `yyyy-MM` (month).
- **N-01 (v7.0):** Phase 2 requires Drizzle schema files + barrel exports. 8 schema file groups documented.
- **O-01 (v7.1):** Every Phase 2 API route calls `setRlsContext(db, orgId)` before DB queries.
- **P-02 (v7.2):** `visibility_trends.sample_quality` derivation: `audit_count < 3 → 'Insufficient data'`; `coverage > 0.60 → 'Confirmed'`; `0.40-0.60 → 'Likely'`; `< 0.40 → 'Hypothesis'`.
- **P-03 (v7.2):** `brand_archetype` thresholds: `mention_rate ≥ 0.20 = high`; `citation_rate ≥ 0.10 = high`.
- **T-01 (v7.6):** `market_ai_budget_policies.max_models_per_audit DEFAULT 4` (not 2) — matches PRD §7 canonical 4 engines.
- **T-02 (v7.6):** `market_ai_budget_policies.max_repeated_samples DEFAULT 5` (not 3) — Sprint 3 Wilson CI requires 5 runs.
- **C-01 (v6.1):** `brand_entity_scores` is a Phase 1 Sprint 7 table — Phase 2 EXTENDS via ALTER TABLE, never recreates it.
- **C-04 (v6.1):** Clerk references in CLAUDE.md/Foundations are stale — Better Auth is canonical throughout Phase 2.

### Phase 2-specific design decisions (locked)
- `audits.quality_status` writer is `QualityGateService.evaluate(auditId)` — called from `refresh-audit.ts` after scoring.
- `visibility_trends.period_label` uses `date-fns` format strings: weekly = `format(startOfISOWeek(date), "yyyy-'W'II")`; monthly = `format(startOfMonth(date), 'yyyy-MM')`.
- `generate-narrative-report.ts` reads from 8 specific tables (visibility_trends, query_fan_out_results, topical_coverage_gaps, citation_source_intelligence, linkedin_presence_audits, brand_consensus_checks, brand_entity_scores, content_structure_audits).
- `journey_run_results.journey_score` formula: `(brand_appeared_in_n_turns / total_turns) × 100`; turn 1 bonus +10pts, turn 2 +5pts, turn 3+ no bonus; cap 100.
- `content_format_detected → content_drafts.draft_type` mapping: `'product_page'→'comparison_article'`; `'other'→'expert_article'`.
- `org_members.role` values (`owner`/`admin`/`analyst`/`viewer`) differ from `users.role` (`owner`/`admin`/`member`). The 3-layer permission model is: Better Auth session → `users.role` (org-level) → `org_members.role` (brand-scoped).
- `report_templates.is_default = true` seed row MUST exist before `generate-narrative-report.ts` can run.
- All Phase 2 LLM-calling functions must run under `LLM_MODE=mock` in tests (5 functions mapped to existing 4 canonical scenarios — no new scenarios without Sri approval).
- `topical_coverage_gaps.topic_cluster` uses underscores (e.g. `'emergency_service'`); `vertical_pack_prompts.topic` uses hyphens (`'emergency-service'`). `calculate-topical-gaps.ts` must translate: `topic.replace(/-/g, '_')`.
- Sample org exclusion: `aggregate-visibility-trend.ts`, `track-brand-web-mentions.ts`, `score-agent-readiness.ts`, `simulate-query-fan-out.ts` must all skip `organizations.slug = 'sample'`.

### Fixes from the v8.16/v8.17 audit (latest — do not re-open)
- `source TEXT DEFAULT 'curated'` on `vertical_pack_prompts` is now real SQL in the ALTER TABLE block (was previously only in a comment).
- Sample Audit TIER 0 explicitly specifies **ChatGPT ONLY** as the engine.
- Per-prompt trend query correctly JOINs audits: `FROM citations c JOIN audits a ON c.audit_id = a.id WHERE a.brand_id = ?` (citations has no `brand_id` column).
- `updated_at` added to 6 mutable UPSERT tables: `visibility_trends`, `topical_coverage_gaps`, `agent_readiness_scores`, `brand_consensus_checks`, `citation_source_intelligence`, `generated_reports`.

---

## 5. Phase 2 New Table Inventory (37 tables)

### Layer 1 — Retrieval Intelligence (Sprint 6, Tables 8–11)
| Table | Purpose | Write pattern |
|---|---|---|
| `crawler_visit_logs` | AI bot visit tracking + `visit_purpose` classification | Append-only |
| `content_structure_audits` | Per-page citability audit (`UNIQUE(brand_id, page_url)`) | UPSERT; uses `audited_at` |
| `llmstxt_versions` | llms.txt version history + depth score | Append (versioned via `is_current`) |
| `agent_readiness_scores` | /100 composite readiness score per brand | UPSERT monthly; `updated_at` ✓ |

### Layer 2 — Visibility Intelligence (Sprint 3, Tables 12–18)
| Table | Purpose | Write pattern |
|---|---|---|
| `share_of_voice_snapshots` | SoV per engine + competitor per audit | Append-only |
| `visibility_trends` | Weekly/monthly roll-up `UNIQUE(brand_id, period_label, period_type)` | UPSERT; `updated_at` ✓ |
| `prompt_volume_estimates` | AU prompt demand from Google Trends AU | Global seed, no RLS |
| `query_fan_out_results` | Sub-query results (3–12 per top-level prompt) | Append-only |
| `topical_coverage_gaps` | Topic cluster gaps vs competitors `UNIQUE(brand_id, vertical, topic_cluster)` | UPSERT; `updated_at` ✓ |
| `citation_source_intelligence` | Source type breakdown (reddit/linkedin/etc.) | UPSERT via partial indexes; `updated_at` ✓ |
| `brand_web_mentions` | Reddit/YouTube/Quora/LinkedIn mentions scraped weekly | Append-only |

### Layer 3 — Trust Intelligence (Sprint 5, Tables 19–25)
| Table | Purpose | Write pattern |
|---|---|---|
| `hallucination_incidents` | Named hallucination events (tracked/acknowledged) | Mutable; `updated_at` ✓ |
| `evidence_snapshots` | Immutable legal-grade snapshots; `audit_id ON DELETE SET NULL` | Append-only (immutable) |
| `brand_consensus_checks` | Cross-platform fact consistency `UNIQUE(brand_id, source_type)` | UPSERT; `updated_at` ✓ |
| `linkedin_presence_audits` | LinkedIn company/founder presence scored monthly | Append-only (new row per check) |
| `google_ai_mode_results` | Google AI Mode separate surface results | Append-only |
| `youtube_presence_audits` | YouTube channel/video presence scored monthly | Append-only |

### Layer 4 — Conversational Discovery (Sprint 7, Tables 26–28)
| Table | Purpose | Write pattern |
|---|---|---|
| `conversation_journeys` | Multi-turn journey templates per vertical | Mutable; `updated_at` ✓ |
| `journey_run_results` | Execution results per journey turn | Append-only |
| `comparison_prompt_results` | Brand vs competitor per prompt per engine | Append-only (run_at timestamp) |

### Layer 5 — Workflow Intelligence (Sprint 2, Tables 29–31)
| Table | Purpose | Write pattern |
|---|---|---|
| `remediation_tasks` | Action items from Phase 2 analysis | Mutable; `updated_at` ✓ |
| `workflow_runs` | Inngest workflow execution records | Mutable; `updated_at` ✓ |
| `content_drafts` | AI-generated draft content per recommendation | Mutable; `updated_at` ✓ |

### Layer 6 — Communication Intelligence (Sprint 4, Tables 32–34)
| Table | Purpose | Write pattern |
|---|---|---|
| `report_templates` | White-label report layout + sections JSONB | Mutable; `updated_at` ✓ |
| `generated_reports` | Completed narrative reports per brand | UPSERT when regenerated; `updated_at` ✓ |
| `report_delivery_schedules` | Auto-send config per org | Mutable; `updated_at` ✓ |

### Layer 7 — Governance Intelligence (Sprint 8, Tables 35–38)
| Table | Purpose | Write pattern |
|---|---|---|
| `audit_trail` | Immutable action log for compliance | Append-only |
| `org_members` | Brand-scoped RBAC on top of Better Auth | Mutable; `updated_at` ✓ |
| `data_residency_log` | AU data residency event log | Append-only |
| `org_feature_flags` | Per-org feature overrides | Mutable; `updated_at` ✓ |

### Platform tables (Sprint 1, Tables 1–7)
| Table | Purpose | RLS |
|---|---|---|
| `config_bundle_cache` | Market config snapshot per audit | Global seed — DISABLED |
| `market_ai_budget_policies` | Per-market LLM budget limits | Global seed — DISABLED |
| `sampling_policies` | Sample count requirements per metric | Global seed — DISABLED |
| `metric_quality_gates` | Quality gate thresholds per market | Global seed — DISABLED |
| `provider_market_capabilities` | Which LLM providers are enabled per market | Global seed — DISABLED |
| `prompt_pack_coverage` | Vertical pack coverage metrics | Global seed — DISABLED |
| `audit_cost_snapshots` | Cost tracking per audit | Append-only; ENABLED RLS |

---

## 6. Suggested Audit Angles for ChatGPT

The v8.16 and v8.17 audits covered these angles (do not duplicate effort):
- RLS `ENABLE ROW LEVEL SECURITY` coverage on all 37 tables ✓
- `updated_at` presence on all mutable UPSERT tables ✓
- FK type consistency (all `UUID`, not `TEXT`) ✓
- Route naming (`/organizations/` American) ✓
- `serve()` Inngest registration for all Phase 2 functions ✓
- Drizzle barrel export groups ✓
- `LLM_MODE=mock` coverage ✓
- Sprint 11/12 schema changes (none) ✓
- Webhook event taxonomy (10 events total) ✓
- `citations.brand_id` does not exist — query must JOIN audits ✓

**Suggested fresh angles for ChatGPT to examine:**

### Angle A — Tier gate consistency
The LLD has a comprehensive tier gate table. Check whether every Phase 2 feature that should be tier-gated (Growth+, Agency+, etc.) has:
1. The correct tier gate in the tier gate reference table
2. A matching `checkQuota(orgId, brandId)` call in the Inngest function comment
3. Consistent `locked: true, tier_required: 'growth'` in the API response spec
4. A `LOCKED-VISIBLE` pattern specified in the TIER experience design

Look particularly at: `agent_readiness_scores`, `brand_consensus_checks`, `conversation_journeys`, `hallucination_incidents`, `evidence_snapshots`, `youtube_presence_audits`.

### Angle B — Cron job UTC expressions and scheduling conflicts
The LLD specifies cron expressions for Phase 2 Inngest functions. Check:
1. All cron expressions use UTC (not AEST/AEDT) — Sprint 9 precedent: `'0 20 * * 1'` (Mon 20:00 UTC = Tue 06:00 AEDT)
2. No two Phase 2 crons fire at the same UTC time (H-02 fix noted Phase 1 crons at specific times — Phase 2 must not collide)
3. The weekly digest cron (Tuesday 09:00 AEST = Monday 22:00 UTC or Monday 23:00 UTC depending on daylight saving — H-05 fix changed default to `'23:00'` UTC)

### Angle C — Seed data completeness
Phase 2 requires several seed tables to be populated before functions can run:
1. `metric_quality_gates` — 7 seed rows per AU_EN market (P-05 fix)
2. `provider_market_capabilities` — 4 providers seeded with `is_enabled=true` for AU_EN (U-14 fix)
3. `report_templates.is_default = true` — one row must exist (M-04 fix)
4. `recommendation_research` — 8 new Phase 2 recommendation keys must be seeded
5. `citability_methods` — 47 rows (Princeton KDD + AutoGEO) — Sri must author from papers
6. `prompt_volume_estimates` — Google Trends AU data per vertical

Check whether each of these has: (a) a seed file path specified, (b) a sample row shape documented, (c) a Phase 2 sprint assigned.

### Angle D — API response shapes and ExplainabilityService
The v7.3 V-03 fix established: every Phase 2 scored response must include `rationale`, `confidence_label`, `confidence_note`, `top_action`. Check that the Phase 2 API route specs (GET `/api/brands/[id]/share-of-voice`, `/api/brands/[id]/visibility-trend`, etc.) include these fields in their response shapes — or whether any route spec is missing the Explainability contract.

### Angle E — ON DELETE CASCADE propagation
Sprint 12 runs a 12-month data retention cron (`JH4 fix`) that deletes old `audits` rows. This cascades to `citations` (has `ON DELETE CASCADE`). Check all Phase 2 tables with `audit_id` FK to verify each has the correct `ON DELETE` clause:
- `evidence_snapshots.audit_id` → `ON DELETE SET NULL` (immutable archive must survive)
- `audit_cost_snapshots.audit_id` → `ON DELETE CASCADE`
- `query_fan_out_results.audit_id` → `ON DELETE CASCADE`
- `google_ai_mode_results.audit_id` → `ON DELETE CASCADE`
- `hallucination_incidents.citation_id` → `ON DELETE CASCADE`

Any Phase 2 table with a NOT NULL `audit_id` FK that is missing an `ON DELETE` clause will break the retention cron.

### Angle F — Market code / region consistency
Phase 2 introduces `market_code TEXT` (e.g. `'AU_EN'`) as the Phase 2 regional identifier, distinct from Phase 1's `region` enum (`'au'`). Check:
1. The mapping function `lib/platform/region-to-market-code.ts` is specified (`'au' → 'AU_EN'`)
2. Every Phase 2 table that needs market scoping has `market_code TEXT NOT NULL` (not `region` text)
3. Phase 2 functions that read `organizations.region` correctly map via `region-to-market-code.ts`
4. No Phase 2 table uses `region` TEXT when it should use `market_code`

### Angle G — Hallucination incident two-level model
Phase 1 already has `citations.is_accurate BOOLEAN` and `citations.hallucination_flags JSONB` (Sprint 3 sentiment analyzer). Phase 2 adds `hallucination_incidents` as a higher-level named-incident tracker. Verify the LLD correctly distinguishes these scopes:
- `citations.hallucination_flags` — per-response low-level signal (Sprint 3, Phase 1)
- `hallucination_incidents` — named, tracked, acknowledged incident (Phase 2, Sprint 5)
- The `detect-hallucinations.ts` function reads `citations.hallucinationFlags` and creates `hallucination_incidents` rows — it should not duplicate the Phase 1 storage

### Angle H — Cross-table formula consistency
Check that values referenced across tables are consistent. Key examples:
1. `visibility_trends.citation_volatility_score` uses `std_dev` of `citation_rate` over last 12 `audits` — verify the NULL guard (`< 3 audits → NULL`, not `0.0`)
2. `visibility_trends.mention_source_ratio` = `citation_rate / mention_rate` — verify `NULLIF(mention_rate, 0)` guard (divide-by-zero when brand is completely invisible)
3. `agent_readiness_scores` total `/100` = sum of 5 dimension scores — verify the weights sum to 100: tech(20) + entity_clarity(20) + verify(20) + authority(20) + task(20) = 100

---

## 7. Phase 2 Sprint Plan Summary (v4.0)

| Sprint | Layer | Tables | Duration |
|---|---|---|---|
| Sprint 1 — Platform Foundation | Infrastructure | 1–7 (platform tables) | 4 weeks |
| Sprint 2 — Workflow Intelligence | L5 | 29–31 | 4 weeks |
| Sprint 3 — Visibility Intelligence | L2 | 12–18 | 4 weeks |
| Sprint 4 — Communication Intelligence | L6 | 32–34 | 4 weeks |
| Sprint 5 — Trust Intelligence | L3 | 19–25 + brand_entity_scores ALTER | 4 weeks |
| Sprint 6 — Retrieval Intelligence | L1 | 8–11 + content_structure_audits cols | 4 weeks |
| Sprint 7 — Conversational Discovery | L4 | 26–28 | 4 weeks |
| Sprint 8 — Governance Intelligence | L7 | 35–38 | 3 weeks |
| Sprint 9 — Adaptive Segment-Aware UX | All | No new tables | 3 weeks |

**Total Phase 2 build estimate: ~34 weeks at weekend pace (Sri solo + Claude Code)**

---

## 8. Key Files for Review

| File | Role |
|---|---|
| `visibleau-7layer-lld.md` (v8.17) | **Primary review target** — 5,947 lines, all Phase 2 SQL DDL, service specs, tier experience design |
| `sri-visibleau-foundations.md` (v1.12) | Phase 1 canonical schema (note: Clerk refs stale — use Better Auth) |
| `sri-visibleau-sprint-1-prompt.md` | RLS patterns, multi-tenant setup, Stripe integration |
| `sri-visibleau-sprint-2-prompt.md` | LLM cache, audit columns (promptsCount/runsPerPrompt/engines TEXT[]) |
| `sri-visibleau-sprint-3-prompt.md` | 5-dimension scoring, Wilson CI, 200 LLM calls, model-selector |
| `sri-visibleau-sprint-5-prompt.md` | 336 vertical pack prompts, retiredAt filter, category field |
| `sri-visibleau-sprint-6-prompt.md` | 11 universal action types, CONFIDENCE_LEVELS, anti-patterns |
| `sri-visibleau-sprint-7-prompt.md` | 8-dimension technical audit, brand_entity_scores (Phase 1 table) |
| `sri-visibleau-sprint-8-prompt.md` | Drift detection, webhooks, SARIF/JUnit, confidence labels |
| `sri-visibleau-sprint-9-prompt.md` | Agency tier, TIER_AUDIT_LIMITS, white-label PDF, GA4 |
| `sri-visibleau-sprint-10-prompt.md` | Sample audit (ChatGPT-only), Stripe checkout, onboarding |

---

## 9. How to Report Findings

For each conflict found, please report:

```
CONFLICT [ID]: [SHORT TITLE]
Severity: BREAKING | MODERATE | LOW
Location in LLD: [section / table name / line reference]
Phase 1 canonical source: [sprint N, section, exact quote]
Current LLD state: [what it currently says]
Correct state: [what it should say]
Fix: [specific change required]
```

Mark anything that is **already fixed** in the v8.16/v8.17 audit as "SKIP — already resolved in v8.16/v8.17" to avoid re-opening resolved issues.

If a finding is uncertain — e.g. the LLD is ambiguous but not clearly wrong — flag it as:
```
QUESTION [ID]: [TITLE]
Ambiguity: [what's unclear]
Possible interpretations: [A] ... [B] ...
Recommendation: [which to pick and why]
```

---

## 10. What to Prioritise

**Highest value findings:**

1. **Breaking schema issues** — anything that would cause a migration to fail, a query to return wrong data, or a Phase 1 table to be corrupted
2. **Tier gate gaps** — features that should be locked to Growth+ or Agency+ but aren't gated, or features that are over-gated
3. **Missing seed rows** — Phase 2 functions that will silently fail because a required seed table is empty
4. **ON DELETE clause gaps** — Phase 2 tables whose audit_id FK has no ON DELETE clause (breaks Sprint 12 retention cron)
5. **Formula inconsistencies** — cross-table values that don't add up (mention_rate computation, score weightings)

**Lower priority (already extensively audited):**
- Table naming conventions (snake_case, plural) — already verified
- Updated_at on mutable tables — fixed in v8.17
- RLS ENABLE statements — verified in v8.17
- UUID FK types — verified in v8.16/v8.17

---

*This handoff was prepared from the VisibleAU Phase 2 LLD v8.17 (June 2026).*  
*All conflict IDs in this document correspond to the LLD changelog.*  
*The primary file for review is `visibleau-7layer-lld.md` — paste that file in full to ChatGPT alongside this handoff.*
