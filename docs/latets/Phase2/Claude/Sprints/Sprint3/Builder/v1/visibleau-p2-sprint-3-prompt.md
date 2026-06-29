# VisibleAU Phase 2 — SPRINT 3 PROMPT: Visibility Intelligence + Market Gaps
# Version: 1.0 | Built against: LLD v8.65 (REVIEWED-r2, verified) | Sprint: 3 of 9 | 4 weeks
# Source anchors (r2): Sprint 3 plan (~8833), Layer 2 §"VISIBILITY INTELLIGENCE" (~5852),
# tables 12–18 (share_of_voice 5873, prompt_volume 5897, visibility_trends 5939,
# brand_web_mentions 6112, query_fan_out 6156, topical_coverage_gaps 6183, google_ai_mode
# 6235), the two FK ALTERs onto remediation_tasks (~7591/7600), citation-failure diagnose
# input shape (~8848), competitive-benchmark CPR-01 null contract (~8888), MI-01 (~8645),
# RLS spec (~8629), prototype VisibilityHub (1533), CitationFailureDiagnosis (1823),
# CompetitiveBenchmark (1973), dashboard SoV strip region.
# NOTE: line numbers are navigational, not literal — open the cited region; the LLD wins.

> HOW TO USE: read §0, then paste §10 into a fresh Claude Code session on the VisibleAU
> repo. §1–§9 are the spec; §11–§14 are tests/acceptance/pitfalls/handoff. When this
> prompt and the LLD disagree, THE LLD WINS and this prompt is the bug.

---

## 0. READ FIRST — CONTEXT & CONVENTIONS

### 0.1 What Sprint 3 is
**Visibility Intelligence + Market Gaps (Layer 2)** — the analytics core: Share of Voice,
visibility trends, the Mention-Source Divide (GAP 9), query fan-out (GAP 1), topical
coverage gaps (GAP 6), citation source classification (GAP 4 L2 half), brand web mentions
(GAP 14), citation volatility (GAP 15), the **Citation Failure Diagnosis** surface, and the
**Competitive Benchmark Workspace** data layer + basic panel. It also **closes the two
forward-reference FKs** that Sprint 2 left as plain UUIDs, **lights up the dashboard SoV
strip**, and **builds wins-feed Phase A in full** (moved here from S2 per the LLD).

### 0.2 Prerequisites
Sprints 1 + 2 merged. S3 reads Sprint 1's budget/provider services (fan-out LLM calls flow
through `BudgetPolicyService.estimate()` + `selectModel()`), and **writes the FK constraints
onto Sprint 2's `remediation_tasks`** (§5.8). Gap-spawned remediation tasks (S2) get their
`fan_out_gap_id` / `topical_gap_id` populated once these S3 tables exist.

### 0.3 Verify you are on the right LLD before starting
```bash
grep -m1 "^# Version:" visibleau-7layer-lld.md          # → # Version: 8.65 | Date: June 2026
grep -cE "ATTRIBUTION CORRECT(ED IN CROSS-REVIEW|ION)" visibleau-7layer-lld.md   # → ≥1
```
Canon is `visibleau-phase2-v8_65-complete-REVIEWED-r2`. If version ≠ 8.65 or marker count is
0, STOP — stale LLD.

### 0.4 SHARED CONVENTIONS (binding; from master plan §7)
- **Better Auth** canonical; **zero Clerk**. Page routes `[brandId]`; API routes `[id]`.
- **`subscriptions.tier`**, never `organizations.tier`. **TIER_ENGINES** governs engine
  counts (Free 2 / paid 4) — never hardcode engine lists. **`selectModel(tier, engine,
  useCase)`** for every LLM call (fan-out simulation uses the audit's engine set).
- **MI-01 migration idempotency (v8.29):** whole migration re-runnable — `CREATE TABLE IF
  NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS "<name>" ON <table>;`
  before each `CREATE POLICY`. The §5.8 ALTER uses `ADD CONSTRAINT IF NOT EXISTS` /
  guard (see §5.8).
- **RLS** USING + WITH CHECK on every tenant table. **Global seed tables**
  (`prompt_volume_estimates`) carry no `organization_id` → **RLS DISABLED** (per the
  `citability_methods` precedent; the LLD says so inline at 5901). All others get RLS.
- `LLM_MODE=mock` in all tests.
- **THE UNIT CONVENTION (MS-01 / MS-02) — the single most important correctness rule this
  sprint:** `mention_rate`, `citation_rate`, `brand_share`, `competitor_share` are
  **PERCENTAGES (0–100)** (the formulas multiply ×100). `mention_source_ratio` is **0–1**
  (the ×100 cancels). Archetype thresholds are therefore percentage-points: high mention
  `>= 20`, high citation `>= 10`. (LLD 5984–6048.)
- **UI** token-driven: dark + `[data-theme="light"]` overrides exist; `color-mix` for faint
  fills (RT-01, never hex-alpha on var()); `--focus-ring` / `--elevation`; `tabular-nums`
  on numerics; ARIA per FIX 13; `prefers-reduced-motion` reset already in the S2 foundation.

### 0.5 Status / enum / naming traps Sprint 3 introduces
- `visibility_trends.sample_quality` & `share_of_voice_snapshots.sample_quality` =
  **Confirmed | Likely | Hypothesis | Insufficient data** — reuse Phase 1
  `lib/confidence-labels/classify.ts` (do not re-implement). (LLD 5963.)
- `visibility_trends.brand_archetype` = recognised_authority | known_but_untrusted |
  niche_authority | invisible. `market_competition_label` = category_leader | challenger |
  niche_player | NULL. (LLD 5988, 6000.)
- `brand_web_mentions.source_platform` = reddit | youtube | quora | news | review_site |
  forum | other. `mention_sentiment` = positive | neutral | negative. (LLD 6118, 6133.)
- **period_label format is exact** (LLD 5943): weekly `format(startOfISOWeek(d),
  "yyyy-'W'II")` → '2026-W23'; monthly `format(startOfMonth(d), 'yyyy-MM')` → '2026-06'.
  The `UNIQUE(brand_id, period_label, period_type)` requires byte-exact match — wrong: 'W23',
  '2026-6', '2026-23'. Use one helper across all producers.
- **topic_cluster naming (LLD 6196):** `vertical_pack_prompts.topic` uses hyphens
  ('emergency-service'); `topic_cluster` stores underscores ('emergency_service').
  calculate-topical-gaps.ts must `topic.replace(/-/g, '_')`.
- **DIVISION-BY-ZERO (LLD 5980):** when `mention_rate = 0`, `mention_source_ratio` MUST be
  NULL (not 0) → 'invisible' archetype, UI shows 'N/A'.

---

## 1. WHAT SHIPS THIS SPRINT
- 7 new tables (§5): share_of_voice_snapshots (#12), prompt_volume_estimates (#13),
  visibility_trends (#14), brand_web_mentions (#18), query_fan_out_results (#15),
  topical_coverage_gaps (#16), google_ai_mode_results (#17, stretch).
- **2 FK ALTER constraints** on remediation_tasks (§5.8): fk_fan_out_gap, fk_topical_gap.
- 6 Inngest functions (§8): calculate-share-of-voice, aggregate-visibility-trend,
  simulate-query-fan-out, calculate-topical-gaps, classify-citation-sources,
  track-brand-web-mentions (weekly) — all registered in `serve()`.
- Lib modules (§6): mention-source-divide, citation-failure-diagnosis, fan-out-simulator,
  topical-gap-calculator, sov-calculator, plus **wins-feed.ts (Phase A — moved from S2)**.
- Screens (§6U): Visibility hub, Citation Failure Diagnosis, Competitive Benchmark panel
  (data + basic card), and the **dashboard SoV strip increment**.
- API routes (§9): visibility metrics, fan-out, topical gaps, citation-failure,
  competitive-benchmark (with the CPR-01 null contract), and the **wins feed**.
- **GAP coverage:** 1 (fan-out), 4 (citation sources — L2 classifier), 5 (Google AI Mode,
  stretch), 6 (topical gaps), 9 (Mention-Source Divide), 14 (web mentions), 15 (volatility).

---

## 2. DEPENDENCIES TO INSTALL
`date-fns` (period_label formatting — confirm Sprint 4's note that it's already installed;
if not, install it). No other new runtime packages beyond the Phase 1 + S1/S2 stack.

## 3. ENVIRONMENT VARIABLES (additions)
Optional `GOOGLE_TRENDS_*` is **not required** for Phase 2 — prompt_volume_estimates seeds
from the `visibleau_corpus` data source (internal audit history) by default; google_trends_au
is an optional enrichment (LLD 5909–5921). Brand-web-mention scraping uses the existing
scrape/HTTP client; confirm no new key is needed for the Phase-A platforms (reddit/youtube/
quora public surfaces).

---

## 4. PROJECT STRUCTURE ADDITIONS
Every file below is specified in §5–§9 / §6U. No file appears without a spec.
```
db/
├── schema/
│   ├── share-of-voice-snapshots.ts · prompt-volume-estimates.ts · visibility-trends.ts
│   ├── brand-web-mentions.ts · query-fan-out-results.ts · topical-coverage-gaps.ts
│   └── google-ai-mode-results.ts
└── migrations/
    ├── 00NN_phase2_sprint3_visibility.sql      // 7 CREATEs (IF NOT EXISTS) + indexes + RLS
    └── 00NN_phase2_sprint3_task_fks.sql        // §5.8 the 2 ALTER ADD CONSTRAINT (guarded)

lib/visibility/
├── sov-calculator.ts                // §6.1 share-of-voice math
├── mention-source-divide.ts         // §6.2 [GAP 9] archetype + thresholds (MS-01 units)
├── fan-out-simulator.ts             // §6.3 [GAP 1] 3–12 sub-queries, cosine >0.88
├── topical-gap-calculator.ts        // §6.4 [GAP 6] gaps + cross_prompt_impact (jewel wins)
├── citation-source-classifier.ts    // §6.5 [GAP 4 L2] source_type classification
├── citation-failure-diagnosis.ts    // §6.6 read-time diagnose() — no new table
├── visibility-trend-aggregator.ts   // §6.7 the period rollup (rates, archetype, volatility)
└── types.ts                         // CitationDiagnosis + shared interfaces (§6.0)
lib/communication/
└── wins-feed.ts                     // §6.8 [moved from S2] Phase A 5 win types

inngest/functions/
├── calculate-share-of-voice.ts · aggregate-visibility-trend.ts · simulate-query-fan-out.ts
├── calculate-topical-gaps.ts · classify-citation-sources.ts
└── track-brand-web-mentions.ts      // weekly cron

app/(auth)/brands/[brandId]/visibility/
├── page.tsx                         // Visibility hub (§6U.2)
└── citation-failure/page.tsx        // Citation Failure Diagnosis (§6U.3)
components/domain/visibility/
├── sov-donut.tsx · mention-source-matrix.tsx · fan-out-tree.tsx · topical-gap-list.tsx
├── citation-failure-card.tsx · competitive-benchmark-panel.tsx · volatility-indicator.tsx

app/api/brands/[id]/visibility/route.ts · fan-out/route.ts · topical-gaps/route.ts
app/api/brands/[id]/citation-failure/route.ts
app/api/brands/[id]/competitive-benchmark/route.ts
app/api/brands/[id]/wins/route.ts            // [moved from S2]

tests/phase2/sprint3/  (§11)
```

---

## 5. DATABASE SCHEMA ADDITIONS

Copy each definition VERBATIM from the LLD (anchors inline). Apply **MI-01** to the whole
visibility migration. The §5.8 ALTER is a SEPARATE migration that runs AFTER the table
migration (the FKs reference tables created above).

### 5.1 share_of_voice_snapshots (#12, LLD 5873)
`audit_id` REFERENCES audits(id) **ON DELETE CASCADE** (per-audit analytics, dies at 12-mo
retention — E-03; without it the retention DELETE fails). `brand_share`/`competitor_share`
NUMERIC(5,2) = **PERCENTAGES 0–100** (MS-02; per-engine shares in a category sum ~100;
matches the prototype donut 34/28/22/16 and IntelCard `unit="%"`). Index
`sov_brand_engine_idx (brand_id, engine, calculated_at DESC)`.

### 5.2 prompt_volume_estimates (#13, LLD 5897) — GLOBAL seed table, RLS DISABLED
No `organization_id`. `vertical` ∈ tradies|allied_health|saas (Phase 1 verticalEnum);
`volume_trend` ∈ rising|stable|declining; `data_source` ∈ visibleau_corpus|google_trends_au
|combined (LLD 5909–5921). `UNIQUE(market_code, vertical, topic, period_start)`. Seed from
`visibleau_corpus` (90-day internal audit history) via the weekly demand-scorer cron.

### 5.3 visibility_trends (#14, LLD 5939) — the central table
Per-dimension NUMERIC(5,2) averages. **SOURCE columns matter (LLD 5953, 5960):**
`score_sentiment_avg` = AVG(audits.**scoreSentimentNumeric**) (NOT scoreSentiment, which is
text 'positive'|'neutral'|'negative'); `score_context_avg` = AVG(audits.**scoreContextNumeric**)
(NOT scoreContext text). `sample_quality` derived per §0.5. `mention_rate`/`citation_rate`
NUMERIC(5,2) **= PERCENTAGES** with the exact formulas at LLD 5969/5977 (COUNT DISTINCT
promptId … ×100). `mention_source_ratio` = citation_rate/mention_rate, **NULL when
mention_rate=0** (§0.5). `brand_archetype` + `market_competition_label` enums (§0.5).
`citation_volatility_score` NUMERIC(5,2) [GAP 15] — see §6.7. `period_label`/`period_type`
exact format (§0.5). `UNIQUE(brand_id, period_label, period_type)`.

### 5.4 brand_web_mentions (#18, LLD 6112) — GAP 14
`source_platform` + `mention_sentiment` enums (§0.5); `subreddit` AU community identifiers;
relevance flags (is_indexed_by_google, engine_citation_seen, vertical_match). Four indexes
incl the partial `brand_mentions_cited_idx … WHERE engine_citation_seen IS NOT NULL`.

### 5.5 query_fan_out_results (#15, LLD 6156) — GAP 1
`audit_id` ON DELETE CASCADE; `original_prompt_id` REFERENCES vertical_pack_prompts(id) **ON
DELETE SET NULL** (CK3 — keep fan-out history, null provenance; v8.28). `sub_query_rank`
INTEGER (1=first); `content_similarity_score` NUMERIC(4,3) 0.000–1.000; `above_threshold`
BOOLEAN (true if > 0.88). Three indexes incl `fan_out_threshold_idx`.

### 5.6 topical_coverage_gaps (#16, LLD 6183) — GAP 6
`topic_cluster` underscores (§0.5 naming); `competitor_coverage` JSONB
`[{domain,has_content,depth,passage_count}]`; `estimated_citation_impact` NUMERIC(4,2);
`cross_prompt_impact` INTEGER (jewel-wins count — distinct prompts a single fix improves;
NULL when < 2); `updated_at` set on UPSERT (J-01). `UNIQUE(brand_id, vertical, topic_cluster)`.
Indexes `topic_gaps_brand_priority_idx` + `topic_gaps_cross_prompt_idx (… DESC NULLS LAST)`.

### 5.7 google_ai_mode_results (#17, LLD 6235) — GAP 5 STRETCH
Reproduce the schema as given. Mark it clearly as a stretch surface (separate from Gemini);
build the table + ingest but it may stay behind a flag if the engine isn't enabled in
`provider_market_capabilities`.

### 5.8 ALTER remediation_tasks — close the two forward-reference FKs (BD-01, LLD 7591/7600)
Separate migration, runs AFTER §5.1–§5.7. Sprint 2 created `fan_out_gap_id` /
`topical_gap_id` as plain UUIDs; now add:
```sql
ALTER TABLE remediation_tasks
  ADD CONSTRAINT fk_fan_out_gap FOREIGN KEY (fan_out_gap_id)
    REFERENCES query_fan_out_results(id) ON DELETE SET NULL;
ALTER TABLE remediation_tasks
  ADD CONSTRAINT fk_topical_gap FOREIGN KEY (topical_gap_id)
    REFERENCES topical_coverage_gaps(id) ON DELETE SET NULL;
```
Both **ON DELETE SET NULL** (a task outlives the gap that spawned it). **MI-01 guard:** wrap
each in a `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_fan_out_gap')
THEN ... END IF; END $$;` block (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`) so the
migration is re-runnable.

### 5.9 RLS
All tables EXCEPT `prompt_volume_estimates` (global, §5.2) carry `organization_id` → enable
RLS with USING + WITH CHECK on `organization_id`, MI-01 `DROP POLICY IF EXISTS` guard before
each policy. `prompt_volume_estimates` stays RLS-DISABLED (document why in its header).

---

## 6. LIB MODULES

### 6.0 types.ts — CitationDiagnosis (match the prototype's interface, LLD 8848)
`CitationDiagnosis { patternKey: string; severity: 'high'|'medium'|'low'; evidence: string;
… }` — field-match the `CitationFailureDiagnosis.tsx` component's type. Plus shared trend/
SoV interfaces.

### 6.1 sov-calculator.ts
`(brand_mention_count / total_mentions_in_category) × 100` per engine/category → brand_share
+ competitor_share (PERCENTAGES, MS-02). Consumed by §8.1.

### 6.2 mention-source-divide.ts — GAP 9 (LLD 5984–6048)
Classify brand_archetype from the 2×2 of mention_rate (≥20 high) × citation_rate (≥10 high)
— **percentage-point thresholds, not 0–1**. Compute market_competition_label from SoV
competitor averages (category_leader >2× / challenger 0.5–2× / niche_player <0.5×; NULL when
<2 competitors). Owns the threshold constants.

### 6.3 fan-out-simulator.ts — GAP 1 (LLD 6149)
Derive 3–12 sub-queries per prompt (GPT-5.4 uses 10+); run each via `selectModel`; compute
`content_similarity_score` (cosine), set `above_threshold` when > 0.88. Respects Sprint 1
budget `max_fan_out_sub_queries` (default 12). Consumed by §8.3.

### 6.4 topical-gap-calculator.ts — GAP 6 (LLD 6196)
Seed topic_cluster from DISTINCT `vertical_pack_prompts.topic` (hyphen→underscore); compute
brand vs competitor coverage, `estimated_citation_impact`, and `cross_prompt_impact` (the
jewel-wins COUNT DISTINCT prompts query at LLD 6210). UPSERT sets updated_at (J-01).

### 6.5 citation-source-classifier.ts — GAP 4 (L2 half)
Classify cited sources by `source_type`; feeds both the trend view and the citation-failure
diagnosis. (The L3 half — citation_source_intelligence table — is Sprint 5.)

### 6.6 citation-failure-diagnosis.ts — read-time, NO new table (LLD 8848)
`async diagnose(input: { brandId; auditId?; promptId? }): Promise<CitationDiagnosis[]>`.
Reads THREE existing tables: citation_source_intelligence (what IS cited — **S5 table, guard
for absence until S5**), comparison_prompt_results (competitor cited instead — **S7 table,
guard for absence**), topical_coverage_gaps (this sprint). Returns CitationDiagnosis[]
(patternKey, severity, evidence) matching the component type. **CPR-01 pattern:** when the
S5/S7 tables are empty, degrade gracefully — diagnose from topical_coverage_gaps alone, never
error.

### 6.7 visibility-trend-aggregator.ts — the period rollup (consumed by §8.2)
Computes all visibility_trends columns: per-dimension AVGs (from the correct *Numeric source
columns*, §5.3), mention_rate/citation_rate (×100), mention_source_ratio (NULL-guarded),
brand_archetype, market_competition_label, sample_quality (reuse Phase 1 classify.ts), and
`citation_volatility_score` [GAP 15] (std-dev-based volatility of citation_rate across recent
periods; the Action Center trigger fires when **> 15.0**). period_label via the exact §0.5
helper.

### 6.8 wins-feed.ts — Phase A, MOVED FROM SPRINT 2 (LLD 7779)
`GET /api/brands/[id]/wins` (Starter+); derived, read-only. **Phase A = 5 win types** now
that the S3 data sources exist: new_citation + new_engine_coverage (Phase 1 citations table),
**visibility_up (visibility_trends, this sprint)**, **competitor_down (share_of_voice_snapshots,
this sprint)**, gap_closed (remediation_tasks, S2). Win shape per LLD 7783 (type, headline,
metric_delta, reason prefixed "likely linked to:", detected_at, optional engine/prompt).
**Attribution honesty (v8.19):** `reason` is best-effort correlation, never asserted cause.
ORDER BY detected_at DESC; default LIMIT 20, `?limit=N` max 50 (PA-01). (Phase B
`trust_improved` extends this in S5.)

---

## 6U. UI SPECIFICATION

GLOBAL UI RULES (per S2 §6U): tokens only; `color-mix` faint fills (RT-01); `--focus-ring`
+ `--elevation`; `tabular-nums` on all numerics; ARIA per FIX 13; reduced-motion reset
already present. Each screen specifies its STATES matrix and a `RESPONSIVE:` line. The shared
component foundation (LayerBadge/IntelCard/etc.) already exists from S2 — consume it.

### 6U.2 Visibility hub — VisibilityHub (prototype 1533)
LayerBadge "visibility". Sections: SoV donut (sov-donut.tsx — IntelCard `unit="%"`, shares
sum ~100), the **Mention-Source 2×2 matrix** (mention-source-matrix.tsx — the four
archetypes; brand plotted by mention_rate × citation_rate; show 'N/A' when ratio is NULL),
the fan-out tree (fan-out-tree.tsx — sub-queries, above_threshold highlighted), the topical
gap list (topical-gap-list.tsx — sorted by cross_prompt_impact DESC; "HIGH LEVERAGE — fix
this → improves N prompts" badge when ≥2), and the volatility indicator (>15.0 = alert).
STATES — loading: section skeletons (`aria-busy`); empty (no audits yet): EmptyState
"Run an audit to see visibility intelligence"; insufficient-data: show the metric with a
ConfidenceBadge "Insufficient data" (do NOT hide it); error: boundary.
**RESPONSIVE:** sections `grid-cols-1 lg:grid-cols-2`; the SoV donut + matrix stack on `<lg`.

### 6U.3 Citation Failure Diagnosis — CitationFailureDiagnosis (prototype 1823)
The component already exists in the prototype — reproduce it, bound to `diagnose()` (§6.6)
output (CitationDiagnosis[]). Per-pattern cards (citation-failure-card.tsx): patternKey
headline, severity pill (danger/warning/info), evidence text, competitor-cited comparison,
evidence-backed remediation CTA (links to creating a remediation_task). Route
`/brands/[brandId]/visibility/citation-failure`.
STATES — loading: card skeletons; empty (brand cited everywhere / no absence found):
EmptyState "No citation gaps found for this prompt set" (a *positive* empty state); partial
(S5/S7 tables absent): diagnose from topical gaps alone, show available patterns + a muted
"deeper diagnosis available after trust + comparison data" note (CPR-01); error: boundary.
**RESPONSIVE:** single-column card list; filters collapse to a sheet on `<md`.

### 6U.4 Competitive Benchmark panel — CompetitiveBenchmark (prototype 1973), DATA + BASIC CARD
This sprint delivers the **data layer + a basic competitor-scoped card** (Sprint 9 completes
the full view; Sprint 7 fills comparison data). competitive-benchmark-panel.tsx renders the
LLD layout (LLD 8896): "You 34% vs Them 67% ↓ gap -33%", "Topics they own: N", "Why they're
winning" (top topical-gap reason), "Your fastest path" (highest cross_prompt_impact action).
**CPR-01 NULL CONTRACT (critical, LLD 8881):** the route returns `comparisonData: null` +
`competitorNarrative: null` + `dataAvailableFrom: 'Sprint 7'` when comparison_prompt_results
is empty (the S3–S6 window). **UI: when comparisonData is null, show a "Coming soon"
placeholder card, NOT an error.** Tiering: Growth 1 competitor / Agency 3 / Agency Pro
unlimited; **Starter sees a locked teaser** ("[Competitor] appears 2× more than you in AI
search — see full breakdown → Growth") via TierGate.
STATES — loading: skeleton; comparisonData null: "Coming soon" card (not error); locked
(Starter): TierGate teaser; error: boundary.
**RESPONSIVE:** the head-to-head stat row wraps to stacked rows on `<sm`.

### 6U.5 Dashboard SoV strip increment — EnhancedDashboard (prototype 1533 SoV region)
Add the **Share-of-Voice strip** to the dashboard built in S2 (the S2 base shell + Work
Completed card stay; the S9 Autopilot tracker + Health Check banner remain out of scope).
The strip shows the brand's current SoV % vs top competitors (sov-donut or a compact bar),
sourced from share_of_voice_snapshots. tabular-nums; `unit="%"`.
STATES — loading: strip skeleton; empty (no SoV yet): "Run an audit to see share of voice";
error: boundary.
**RESPONSIVE:** strip is full-width; competitor bars wrap on `<sm`.

---

## 7. (No CLI changes this sprint.)

## 8. INNGEST FUNCTIONS (register all 6 in serve() alongside S1/S2; LLD 6411+)
All fire after an audit completes (event `audit/completed`) except track-brand-web-mentions
(weekly cron). Each writes its table idempotently (UPSERT on the documented UNIQUE keys).

### 8.1 calculate-share-of-voice.ts (LLD 6411)
On `audit/completed`: compute per-engine/category brand_share + competitor_share (×100,
sov-calculator), UPSERT share_of_voice_snapshots.

### 8.2 aggregate-visibility-trend.ts (LLD 6422)
On `audit/completed` (and/or a period boundary): run visibility-trend-aggregator (§6.7) →
UPSERT visibility_trends on `(brand_id, period_label, period_type)`. Uses the correct
*Numeric* source columns (§5.3) and the exact period_label helper (§0.5).

### 8.3 simulate-query-fan-out.ts (LLD 6463)
On `audit/completed`: fan-out-simulator (§6.3), 3–12 sub-queries via `selectModel`, respect
Sprint 1 budget cap; INSERT query_fan_out_results.

### 8.4 calculate-topical-gaps.ts (LLD 6512)
On `audit/completed`: topical-gap-calculator (§6.4), UPSERT topical_coverage_gaps
(hyphen→underscore translation; cross_prompt_impact jewel-wins query).

### 8.5 classify-citation-sources.ts (LLD 6540)
On `audit/completed`: citation-source-classifier (§6.5).

### 8.6 track-brand-web-mentions.ts (LLD 6552) — WEEKLY CRON
Scrape Reddit/YouTube/Quora (Phase-A platforms) per brand, classify + store brand_web_mentions.
**Action Center fires** when mention count < vertical benchmark OR volatility > 15.0.
Not quota-tracked (no `audit/start`).

**serve():** add all 6 to the existing array; remove none. (Running Phase 2 total after S3:
3 (S2) + 6 (S3) = 9 of the eventual 25.)

---

## 9. API ROUTES (LLD 8870+) — `[id]` params; Better Auth + org scoping; Zod
- `GET /api/brands/[id]/visibility` — trends + SoV + archetype + volatility summary.
- `GET …/fan-out` — fan-out results for an audit/prompt.
- `GET …/topical-gaps` — gaps sorted by cross_prompt_impact DESC NULLS LAST.
- `GET …/citation-failure?promptId=` — diagnose() output (CitationDiagnosis[]).
- `GET …/competitive-benchmark?competitor=<domain>` — **the CPR-01 null contract (§6U.4):**
  always return shareOfVoice + topicalGaps; `comparisonData`/`competitorNarrative` = null +
  `dataAvailableFrom:'Sprint 7'` when comparison_prompt_results is empty; **skip the
  generateText narrative call when comparisonData is null.** Tier-gate competitor count.
- `GET …/wins` (Starter+; derived; default LIMIT 20, `?limit` max 50 — PA-01).
Every route: Better Auth session + org scoping; Zod on params/query; correct codes.

---

## 10. CLAUDE CODE PROMPT (paste this to open Sprint 3)

> You are implementing **VisibleAU Phase 2 — Sprint 3: Visibility Intelligence + Market
> Gaps**, the analytics core. Sprints 1 + 2 are merged. Authority:
> `visibleau-7layer-lld.md` v8.65 (REVIEWED-r2), Layer 2 "VISIBILITY INTELLIGENCE" (~5852)
> and the Sprint 3 plan (~8833). Where this prompt and the LLD differ, the LLD wins.
>
> Build, in order:
> 1. Drizzle schemas + an MI-01-idempotent migration for the 7 tables (§5): CREATE TABLE IF
>    NOT EXISTS ×7, indexes IF NOT EXISTS, DROP POLICY IF EXISTS before each CREATE POLICY.
>    RLS USING + WITH CHECK on all EXCEPT prompt_volume_estimates (global seed → RLS
>    DISABLED, no organization_id). THE UNIT RULE: mention_rate/citation_rate/brand_share/
>    competitor_share are PERCENTAGES (0–100); mention_source_ratio is 0–1 and NULL when
>    mention_rate=0; archetype thresholds are mention≥20 / citation≥10. Use the EXACT
>    period_label format helper and the correct scoreSentimentNumeric/scoreContextNumeric
>    source columns. topic_cluster stores underscores (translate from the hyphenated
>    vertical_pack_prompts.topic).
> 2. A SECOND migration (runs after #1) adding the two FK constraints onto remediation_tasks:
>    fk_fan_out_gap → query_fan_out_results, fk_topical_gap → topical_coverage_gaps, both ON
>    DELETE SET NULL, each wrapped in a pg_constraint-exists DO block (MI-01 re-runnable).
> 3. The lib modules (§6): sov-calculator, mention-source-divide (percentage-point
>    thresholds), fan-out-simulator (3–12 sub-queries, selectModel, cosine >0.88,
>    budget-capped), topical-gap-calculator (cross_prompt_impact jewel-wins),
>    citation-source-classifier, citation-failure-diagnosis (read-time diagnose(), guards for
>    the S5/S7 tables being absent — CPR-01), visibility-trend-aggregator (all trend columns,
>    volatility >15 trigger), and wins-feed.ts (Phase A 5 win types — MOVED from S2 — with
>    "likely linked to:" attribution honesty, LIMIT 20 / ?limit max 50).
> 4. The 6 Inngest functions (§8), registered in serve() alongside S1/S2: calculate-share-
>    of-voice, aggregate-visibility-trend, simulate-query-fan-out, calculate-topical-gaps,
>    classify-citation-sources (all on audit/completed, idempotent UPSERTs), and track-brand-
>    web-mentions (weekly cron, Action Center fires on mentions<benchmark or volatility>15).
> 5. The screens (§6U): Visibility hub, Citation Failure Diagnosis (bind the existing
>    component to diagnose()), the Competitive Benchmark panel (data + basic card with the
>    CPR-01 "Coming soon" null state, Starter locked teaser), and the dashboard SoV strip
>    increment. Both themes; STATES matrices + RESPONSIVE per screen; ARIA per FIX 13.
> 6. The API routes (§9): [id] params, Better Auth + org scoping, Zod; the competitive-
>    benchmark route implements the CPR-01 null contract (comparisonData null + skip the
>    narrative generateText when empty); the wins route paginated.
>
> Constraints: TS strict, no `any`. LLM_MODE=mock in tests. subscriptions.tier (never
> organizations.tier). selectModel() — no hardcoded models or engine lists. Run §12 greps
> + §11 tests and report.

---

## 11. TESTS REQUIRED (LLM_MODE=mock)
- `sov-calculator.test.ts` — shares are percentages summing ~100 per category.
- `mention-source-divide.test.ts` — archetype boundaries at mention=20 / citation=10
  (percentage-points); mention_rate=0 → mention_source_ratio NULL → 'invisible'.
- `fan-out-simulator.test.ts` — 3–12 sub-queries; above_threshold set at >0.88; respects the
  Sprint 1 budget cap; selectModel used (no hardcoded model).
- `topical-gap-calculator.test.ts` — hyphen→underscore topic_cluster; cross_prompt_impact
  COUNT correct; NULL when <2.
- `citation-failure-diagnosis.test.ts` — diagnoses from topical gaps alone when the S5/S7
  tables are empty (no error); returns CitationDiagnosis[] matching the component type.
- `visibility-trend-aggregator.test.ts` — uses scoreSentimentNumeric/scoreContextNumeric (not
  the text columns); exact period_label format; volatility>15 trigger; sample_quality via
  Phase 1 classify.ts.
- `competitive-benchmark.integration.test.ts` — CPR-01: comparisonData null when
  comparison_prompt_results empty, no generateText call, 200 not 500; tier-gates competitor count.
- `wins-feed.test.ts` — Phase A 5 win types; visibility_up/competitor_down now populated;
  LIMIT 20 / ?limit max 50; reason prefixed "likely linked to:".
- `task-fk.migration.test.ts` — the two ALTERs add fk_fan_out_gap/fk_topical_gap as ON
  DELETE SET NULL; re-running the migration is a no-op (pg_constraint guard).
- `visibility-rls.test.ts` — cross-org reads blocked on all tenant tables;
  prompt_volume_estimates is global (no org scoping).

## 12. VERIFICATION GREPS
```bash
grep -c "CREATE TABLE IF NOT EXISTS" db/migrations/*sprint3_visibility.sql           # → 7
grep -c "DROP POLICY IF EXISTS" db/migrations/*sprint3_visibility.sql                # → 6  (all but prompt_volume_estimates)
# the 2 task FKs added, both SET NULL, guarded
grep -cE "ADD CONSTRAINT fk_(fan_out|topical)_gap" db/migrations/*sprint3_task_fks.sql # → 2
grep -c "ON DELETE SET NULL" db/migrations/*sprint3_task_fks.sql                     # → 2
grep -c "pg_constraint" db/migrations/*sprint3_task_fks.sql                          # → 2  (MI-01 re-runnable)
# THE UNIT RULE: percentages ×100, ratio NULL-guarded
grep -Rc "× 100\|\* 100" lib/visibility/sov-calculator.ts lib/visibility/visibility-trend-aggregator.ts  # → ≥2
grep -Rc "mentionRate > 0 ?" lib/visibility/visibility-trend-aggregator.ts           # → ≥1  (div-by-zero guard)
grep -RnE ">= ?20|>= ?10" lib/visibility/mention-source-divide.ts                    # → ≥2  (pp thresholds)
# correct source columns (not the text categoricals)
grep -Rc "scoreSentimentNumeric\|scoreContextNumeric" lib/visibility/visibility-trend-aggregator.ts  # → ≥2
grep -RnE "AVG\(.*scoreSentiment\b|AVG\(.*scoreContext\b" lib/visibility/             # → 0  (never AVG the text columns)
# no hardcoded model/engine; selectModel in fan-out
grep -Rc "selectModel(" lib/visibility/fan-out-simulator.ts                          # → ≥1
grep -RnE "'claude-3|'gpt-4|'gemini-" lib/visibility/                                # → 0
# 6 functions registered
grep -cE "calculateShareOfVoice|aggregateVisibilityTrend|simulateQueryFanOut|calculateTopicalGaps|classifyCitationSources|trackBrandWebMentions" app/api/webhooks/inngest/route.ts  # → 6
# CPR-01 null contract present
grep -Rc "comparisonData" app/api/brands/\[id\]/competitive-benchmark/route.ts        # → ≥1
grep -Rc "dataAvailableFrom" app/api/brands/\[id\]/competitive-benchmark/route.ts     # → ≥1
# wins-feed now lives here (moved from S2)
ls lib/communication/wins-feed.ts app/api/brands/\[id\]/wins/route.ts                # → both exist
# UI: no hex-alpha on var(); RESPONSIVE + tabular present
grep -REc "var\(--[a-z-]+\)[0-9a-fA-F]{2}" components/domain/visibility/             # → 0
grep -RcE "sm:grid-cols|lg:grid-cols|md:" app/\(auth\)/brands/\[brandId\]/visibility/ # → ≥1
# subscriptions.tier, no Clerk
grep -RnE "organizations\.tier|org\.tier" lib/visibility/ | grep -iv subscriptions   # → 0
grep -Rc "Clerk\|@clerk" lib/visibility/ db/ app/api/brands/                          # → 0
```

## 13. COMMON PITFALLS / SPRINT 3 ANTI-PATTERNS
- **Storing rates as 0–1 ratios.** mention_rate/citation_rate/brand_share/competitor_share
  are PERCENTAGES (0–100). Archetype thresholds are percentage-points (≥20 / ≥10), NOT 0.2/0.1.
- **mention_source_ratio = 0 when mention_rate = 0.** It must be NULL (division undefined) →
  'invisible' archetype, UI 'N/A'.
- **AVG-ing the text score columns.** Use scoreSentimentNumeric / scoreContextNumeric, never
  scoreSentiment / scoreContext (those are 'positive'/'recommended' text — AVG fails).
- **Inconsistent period_label.** One helper, exact format ('2026-W23' / '2026-06'); the
  UNIQUE constraint needs byte-exact match.
- **Forgetting hyphen→underscore on topic_cluster** (vertical_pack_prompts.topic is hyphenated).
- **Adding the task FKs in the table migration** or without the pg_constraint guard — they go
  in the second migration, after the referenced tables exist, and must be re-runnable.
- **citation-failure-diagnosis / competitive-benchmark erroring when S5/S7 tables are empty.**
  Both must degrade per CPR-01 — diagnose from available data; return comparisonData:null with
  a "Coming soon" card, never a 500.
- **Hardcoding the fan-out model or engine list** instead of selectModel + TIER_ENGINES.
- **Skipping the generateText narrative guard** — when comparisonData is null, do NOT call the
  LLM for a competitor narrative (wasted cost + the v8.38 CPR-01 fix).
- **wins-feed asserting cause.** `reason` is "likely linked to:" correlation, never proven.
- **Missing RLS** on a tenant table, or enabling it on the global prompt_volume_estimates.

## 14. HANDOFF TO SPRINT 4
After Sprint 3: the analytics core exists; remediation_tasks' two FKs are closed; the SoV
strip + wins-feed Phase A are live; citation-failure + a basic competitive-benchmark panel
ship (the latter shows "Coming soon" for head-to-head until S7). **Sprint 4 (Communication
Intelligence, Layer 6)** builds report_templates / generated_reports / report_delivery_schedules
and the narrative report generator — consuming this sprint's SoV, trends, topical gaps, and
archetype (reports' visibility sections). LinkedIn/consensus report sections will placeholder
until Sprint 5 (CPR-01-style). Sprint 4 requires: S3 visibility data + S2 task summaries + S1
budget services.

## CHANGELOG
- v1.0 — Initial Sprint 3 prompt, generated single-pass against verified LLD v8.65
  (REVIEWED-r2). Schema/Inngest/lib/route detail cited to LLD ~5852–6300 + ~8833–8905; UI to
  prototype anchors; conventions from master plan §7. Carries the wins-feed Phase A moved
  from Sprint 2 (S2-01) and the two BD-01 FK ALTERs onto remediation_tasks. Awaiting Gate 2.
