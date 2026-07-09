# VisibleAU Phase 2 — SPRINT 6 PROMPT: Retrieval Intelligence + Agent Readiness
# Version: 1.5 | Built against: LLD v8.68 (REVIEWED) | Sprint: 6 of 9 | 4 weeks
# v1.5 (26 Jun 2026): Added §8.4a — Task-Fit dimension detection logic for the three under-specified
#   task_* booleans (task_booking_accessible / task_pricing_visible / task_service_area_defined) in
#   score-agent-readiness.ts. The LLD locks the columns + /20 formula but never specified detection;
#   this fills that gap by reusing the existing crawl + P1-S7 answer-capsule finder. Guards added so
#   the logic stays OUT of local-ai-trust-scorer.ts (the /100 composite) and task_score is computed
#   for ALL verticals (only local_ai_trust_score is NULL for SaaS). Formula line, file-tree comment,
#   §10 Step-0 note, verification greps, and agent-readiness.test.ts cases updated to match. No schema,
#   table, or formula change. (Surfaced during the Gemini-review reconciliation; Gemini's own code
#   would have collided with local-ai-trust-scorer.ts — explicitly prevented here.)
# Source anchors (r2/v8.66): Sprint 6 plan (~8966), Layer 1 §"RETRIEVAL INTELLIGENCE" (~5115),
# tables crawler_visit_logs 5148, content_structure_audits 5225 (incl entity-home cols),
# llmstxt_versions 5371, agent_readiness_scores 5387; the Visit API route VA-01/BT-01/MW-01
# (~5684), the brands.brand_token ALTER (~5662), the explainability contract (~5490), the
# RLS setRlsContext pattern (~5620), Inngest specs (~5656), lib modules (~5752), prototype
# RetrievalHub (2537). NOTE: line numbers are navigational — open the region; the LLD wins.

> HOW TO USE: read §0, then paste §10 into a fresh Claude Code session on the VisibleAU
> repo. §1–§9 are the spec; §11–§14 are tests/acceptance/pitfalls/handoff. When this prompt
> and the LLD disagree, THE LLD WINS and this prompt is the bug.

---

## 0. READ FIRST — CONTEXT & CONVENTIONS

### 0.1 What Sprint 6 is
**Retrieval Intelligence + Agent Readiness (Layer 1)** — how AI crawlers reach + read the
brand, and how "agent-ready" the brand is. Ships: AI crawler visit logging (via a PUBLIC
Visit API + a customer middleware snippet), per-page content-structure auditing (answer
capsules, format detection GAP 8, freshness, citation-probability), llms.txt version tracking,
the 5-dimension Agent Readiness Score (GAP 2) including the MCP readiness check (GAP 3), the
content-format advisor (GAP 8), and the Entity Home audit (GAP 12). It also **closes the last
two Sprint-4 narrative-generator slots**: content_structure_audits → entity_home_status and
agent_readiness_scores → agent_readiness. (LLD 8966–8983.)

### 0.2 Prerequisites & the S4→S6 wiring contract (required this sprint)
Sprints 1–5 merged. S6 reads S1's services + `selectModel()`, uses the shared Playwright
crawler `lib/crawler/index.ts` (one canonical crawler — do NOT build a second/parallel one).
**Build-order note:** the LLD labels this crawler "Sprint 7 infrastructure", but S6 needs a
FULL WORKING crawler first (content-structure-audit §8.2 requires the real 20-page/15s/5min
crawl). So **S6 builds the full working `lib/crawler/index.ts` per the §8.2 spec (NOT a stub),
and Sprint 7 REUSES/EXTENDS it rather than recreating it** (see §13/§14). S6 also reads S3/S5
tables for the agent-readiness authority + local-trust composites. **Close the last two S4
slots:** wire
content_structure_audits (entity_home_* cols) → the S4 narrative-generator's `entity_home_status`
slot, and agent_readiness_scores → its `agent_readiness` slot. After this, all 12 S4 report
sections are wired.

### 0.3 Verify you are on the right LLD before starting
```bash
grep -m1 "^# Version:" visibleau-7layer-lld.md          # → # Version: 8.68 (or 8.67/8.66 — all valid) | Date: June 2026
grep -cE "ATTRIBUTION CORRECT(ED IN CROSS-REVIEW|ION)" visibleau-7layer-lld.md   # → ≥1
```
Canon is `visibleau-phase2-v8.66-complete-REVIEWED` (v8.65 r2 also valid). If version is below
8.65 or marker count is 0, STOP — stale LLD.

### 0.4 SHARED CONVENTIONS (binding; from master plan §7)
- **Better Auth** canonical; **zero Clerk**. Page routes `[brandId]`; API routes `[id]`.
- **`subscriptions.tier`**, never `organizations.tier`. **TIER_ENGINES** governs engine counts.
  **`selectModel(tier, engine, useCase)`** for every LLM call — never hardcoded.
- **MI-01 migration idempotency (v8.29):** whole migration re-runnable — `CREATE TABLE IF NOT
  EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` (the ALTERs), `DROP POLICY
  IF EXISTS "<name>" ON <table>;` before each `CREATE POLICY`.
- **RLS** USING + WITH CHECK on every tenant table (all 4 new tables carry organization_id →
  all get RLS). **Every protected Phase 2 route MUST call `setRlsContext(db,
  currentUser.organizationId)`** before any query (LLD 5620) — without it the route silently
  bypasses RLS. Cross-org access returns **404, not 401** (don't leak org membership; CLAUDE.md
  §8). **The PUBLIC Visit route is the ONE exception** — no session, secured by brandToken
  (§9.1).
- `LLM_MODE=mock` in all tests.
- **THE EXPLAINABILITY CONTRACT (LLD 5490) — applies to EVERY score-bearing Phase 2 response:**
  every endpoint returning a score/label/recommendation/gap must include `rationale` (plain-
  English why), `confidence_label` ('High'|'Medium'|'Low'|null), `confidence_note` (null for
  High), and `top_action` (single next step or null). Route data through
  `ExplainabilityService.annotate()` (lib/platform/explainability.ts) before responding.
- **Tier gates:** Retrieval hub = **Starter** (master plan §7); is_active_agent tracking
  (middleware snippet) = Growth+; passive log import = Starter+.
- **UI** token-driven (dark + `[data-theme="light"]`; `color-mix` for faint fills, RT-01;
  `--focus-ring`/`--elevation`; `tabular-nums`; ARIA per FIX 13; reduced-motion reset from S2).

### 0.5 The structural rules + enums + score formulas Sprint 6 introduces (copy EXACTLY)
- **agent_readiness_scores is APPEND-ONLY (U-13, LLD 5475)** — one dated row per scoring run,
  keyed by scored_at. NO UNIQUE, NO ON CONFLICT; query latest via `ORDER BY scored_at DESC
  LIMIT 1`. (History lets score-agent-readiness alert on a score drop.)
- **crawler_visit_logs is APPEND-ONLY (LLD 2064)** — each crawler/agent visit is a distinct log
  event. NO UNIQUE, NO ON CONFLICT; crawler-log-ingest INSERTs a new row per visit. An UPSERT
  would have no conflict target and would wrongly collapse distinct visits, destroying the
  visit-frequency data that is the point of the log.
- **llmstxt_versions one-current-per-brand** via a **partial unique index**
  `llmstxt_one_current_per_brand ON (brand_id) WHERE is_current = true` (LLD 5380); the
  Inngest function sets all others is_current=false in a transaction before inserting (no DB
  trigger).
- **content_structure_audits is UPSERT** on `UNIQUE(brand_id, page_url)` — re-crawls update
  the page row (freshness/format change week to week).
- **The 5 Agent Readiness dimension formulas (LLD 5400–5470)** are pure functions in
  `lib/retrieval/agent-readiness.ts`, each /20 (the exact point breakdowns are in §6.6):
  tech_score, entity_clarity_score, verify_score, authority_score, task_score → total_score
  /100. **`entity_clarity_score` is NOT `brand_entity_scores.score_of_10`** — different scale,
  different table, different meaning (it's the entity-clarity *dimension* of agent readiness).
- **`local_ai_trust_score`** (LLD 5440) is a /100 composite (gmb 0.25 + directory 0.25 + abn
  0.15 + nap 0.20 + citation 0.15) computed in `lib/platform/local-ai-trust-scorer.ts`;
  **NULL for SaaS brands** (the scorer checks brand.vertical and skips 'saas').
- `crawler_visit_logs.visit_purpose` = retrieval | indexing | training | NULL — derived by
  `lib/crawler/visit-classifier.ts` (is_active_agent→retrieval; data tier→training;
  must_allow + >3 pages→indexing; else NULL). `crawler_tier` = must_allow | emerging | data.
- `content_structure_audits.freshness_risk` = fresh (<30d) | aging (30–60d) | at_risk (60–90d)
  | stale (>90d). `content_format_detected` = listicle | how_to_guide | comparison_article |
  faq_block | expert_article | case_study | product_page | other.

---

## 1. WHAT SHIPS THIS SPRINT
- 4 new tables (§5): crawler_visit_logs (#8), content_structure_audits (#9 — incl the
  entity-home cols), llmstxt_versions (#10), agent_readiness_scores (#11) + the
  **brands.brand_token ALTER** (for Visit API auth).
- The PUBLIC **Visit API route** (`app/api/visit/route.ts`) + the `/api/visit` middleware
  allowlist entry (MW-01) + the customer middleware snippet (§9.1).
- 5 Inngest functions (§8): crawler-log-ingest, content-structure-audit (weekly),
  llmstxt-refresh (monthly), score-agent-readiness, audit-entity-home — all registered in
  `serve()`.
- 10 lib modules under `lib/retrieval/` (§6) + 2 under `lib/platform/` (local-ai-trust-scorer
  + explainability — the latter if not already present).
- The **S4 wiring** (§0.2) — the last two narrative-generator slots.
- 5 screens (§6U) under the Retrieval hub + the per-GAP components.
- API routes (§9): retrieval/crawler/llmstxt/content-structure/agent-readiness/entity-home.
- The **audit-data-retention extension** for crawler_visit_logs (§8.6 — extend the Phase 1
  Sprint 12 cron, guarded).
- **GAP coverage:** 2 (Agent Readiness), 3 (MCP check), 8 (content format — L1 advisor + the
  format-detection cols), 12 (Entity Home).

---

## 2. DEPENDENCIES TO INSTALL
`nanoid` (brand_token generation — confirm Phase 1 already has it; reuse). Playwright is the
Sprint 7 crawler dependency — reused, not re-installed. No other new runtime packages.

## 3. ENVIRONMENT VARIABLES (additions)
None strictly new for the core build. The middleware snippet posts to the production Visit API
URL (`https://api.visibleau.com.au/v1/visit`) — confirm the deployed route path. Rate-limiting
the public endpoint uses the existing rate-limit utility; no new key.

---

## 4. PROJECT STRUCTURE ADDITIONS
Every file below is specified in §5–§9 / §6U. No file appears without a spec.
```
db/
├── schema/
│   ├── crawler-visit-logs.ts · content-structure-audits.ts · llmstxt-versions.ts
│   ├── agent-readiness-scores.ts
│   └── brands.ts                         // EDIT Phase 1 schema: add brand_token TEXT UNIQUE
├── migrations/
│   ├── 00NN_phase2_sprint6_retrieval.sql      // 4 CREATEs (IF NOT EXISTS) + indexes + RLS
│   └── 00NN_phase2_sprint6_brand_token.sql    // brands.brand_token ALTER + nanoid backfill

lib/retrieval/
├── crawler-log-parser.ts · visit-classifier.ts   // §6.1 (parser + purpose classifier)
├── content-auditor.ts · content-format-advisor.ts // §6.2 [GAP 8]
├── citation-probability-scorer.ts                 // §6.2 [GAP 8] the headline score
├── entity-home-auditor.ts                         // §6.3 [GAP 12]
├── llmstxt-generator.ts                           // §6.4 (version tracking)
├── agent-readiness.ts · mcp-checker.ts            // §6.5 [GAP 2/3]
├── retrieval-scorer.ts                            // §6.5 aggregate
└── index.ts
lib/platform/
├── local-ai-trust-scorer.ts    // §6.6 [SE5] /100 composite, NULL for SaaS
└── explainability.ts           // §0.4 ExplainabilityService.annotate() — if not already present

inngest/functions/
├── crawler-log-ingest.ts       // §8.1 event 'visit/ingested'
├── content-structure-audit.ts  // §8.2 cron '0 22 * * 3' (Wed 22:00 UTC), UPSERT
├── llmstxt-refresh.ts          // §8.3 cron '0 3 1 * *', one-current transaction
├── score-agent-readiness.ts    // §8.4 event 'technical-audit/complete', emits 'agent/readiness-scored'; §8.4a task_* detection (NOT in local-ai-trust-scorer)
└── audit-entity-home.ts        // §8.5 event 'technical-audit/complete' [GAP 12]

app/api/visit/route.ts          // §9.1 PUBLIC POST — brandToken auth, 202, emits 'visit/ingested'
app/(auth)/brands/[brandId]/retrieval/
├── page.tsx · crawler-logs/page.tsx · content-structure/page.tsx
├── agent-readiness/page.tsx · entity-home/page.tsx
components/domain/retrieval/   (the 9 components listed in §6U)

app/api/brands/[id]/retrieval-audit/route.ts · crawler-logs/route.ts
app/api/brands/[id]/llmstxt/route.ts · llmstxt/generate/route.ts
app/api/brands/[id]/content-structure/route.ts
app/api/brands/[id]/agent-readiness/route.ts · agent-readiness/refresh/route.ts
app/api/brands/[id]/entity-home/route.ts

public/visibleau-snippet.js     // §9.1 the customer middleware snippet
tests/phase2/sprint6/  (§11)
```

---

## 5. DATABASE SCHEMA ADDITIONS

Copy each definition VERBATIM from the LLD (anchors inline). Apply **MI-01** to both
migrations. Run the table migration first, then the brand_token ALTER.

### 5.1 crawler_visit_logs (#8, LLD 5148)
Full columns per the LLD. `crawler_tier` + `visit_purpose` enums (§0.5); `is_active_agent`
BOOLEAN (active AI agent vs passive crawl); `referrer_ai_session`. Three indexes incl the
**partial** `crawler_logs_purpose_idx … WHERE visit_purpose IS NOT NULL`. **Retention:** this
table grows unbounded → §8.6 extends the Sprint 12 retention cron (90-day window).

### 5.2 content_structure_audits (#9, LLD 5225) — incl the entity-home cols
All content/format/freshness cols + the **[GAP 8]** `content_format_detected`,
`freshness_risk`, `citation_probability_score` (the headline metric — NUMERIC(4,3),
0.000–1.000); the **[GAP 12]** entity-home cols (is_entity_home_candidate,
entity_home_has_org_schema, entity_home_has_id_field, entity_home_same_as_count,
entity_home_page_url); `outbound_citation_count`, `has_author_attribution` (positive citability
signals). `UNIQUE(brand_id, page_url)` → **UPSERT** (§0.5).

### 5.3 llmstxt_versions (#10, LLD 5371)
`content`/`depth_score` (/18)/`hosted_url`/`is_current`/`generated_at`. **Partial unique index**
`llmstxt_one_current_per_brand ON (brand_id) WHERE is_current = true` (§0.5).

### 5.4 agent_readiness_scores (#11, LLD 5387) — APPEND-ONLY
The 5 dimensions × their boolean/integer signals + the 5 dimension scores + `local_ai_trust_score`
(NULL for SaaS) + `total_score` /100 + `gaps` JSONB. **APPEND-ONLY** (§0.5) — no UNIQUE, no ON
CONFLICT; index `agent_readiness_brand_idx (brand_id, scored_at DESC)`.

### 5.5 brands.brand_token ALTER (LLD 5662) — Visit API auth
`ALTER TABLE brands ADD COLUMN IF NOT EXISTS brand_token TEXT UNIQUE;` then backfill
`UPDATE brands SET brand_token = <nanoid(32)> WHERE brand_token IS NULL;` (generate per-row —
do it in code or a DO block, since SQL has no nanoid). brand_token is nanoid(32), generated at
brand creation or lazily on first snippet use. The Visit route validates against it (§9.1).

### 5.6 RLS
All 4 new tables carry organization_id → enable RLS with USING + WITH CHECK on organization_id,
MI-01 `DROP POLICY IF EXISTS` guard. brands keeps its Phase 1 RLS posture (the ALTER only adds
a column). NOTE: the Visit route is public and writes crawler_visit_logs via the Inngest
function (server-side, RLS context set from the validated brand's org) — not via a user session.

---

## 6. LIB MODULES (LLD 5752)

### 6.1 crawler-log-parser.ts + visit-classifier.ts
- parser: server log lines / forwarded headers → structured visit events.
- visit-classifier (§0.5): derive visit_purpose (is_active_agent→retrieval; data tier→training;
  must_allow + pages_in_session>3→indexing; else NULL) and crawler_tier from the user-agent.

### 6.2 content-auditor.ts + content-format-advisor.ts + citation-probability-scorer.ts
- content-auditor: answer-capsule score, optimal passage count (134–167 words),
  content_format_detected, freshness_risk (§0.5).
- **content-format-advisor [GAP 8]** (LLD 5800): the `FORMAT_BY_ENGINE` map (chatgpt→listicle/
  expert_article; gemini→how_to_guide; perplexity→listicle/faq_block; all_local→listicle/
  suburb_specific_article); rule "for every 3 listicle pages recommend 1 how-to guide";
  `recommendFormat(engine, queryType, existingFormatMix)`.
- **citation-probability-scorer [GAP 8]** (LLD 5260): the headline score — content_format
  (how_to_guide +0.18 … product_page +0.02) + answer_capsule (0–0.25) + freshness + 
  is_entity_home_candidate (+0.08) + optimal_passage_count≥3 (+0.05) + outbound_citation
  (0/+0.03/+0.06/+0.09) + has_author_attribution (+0.04); ~0.85 practical ceiling. **Freshness
  contribution — map ALL FOUR column enum values** (the LLD's citation_probability comment uses
  a 3-tier current/ageing/stale that doesn't cover the 4-tier column enum, so bind to the column
  names §0.5): `fresh → +0.10, aging → +0.05, at_risk → +0.025, stale → 0.00`. This is the
  HEADLINE metric in the content audit UI (≥0.70 green / 0.40–0.69 amber / <0.40 red).

### 6.3 entity-home-auditor.ts — GAP 12 (LLD 5820)
`auditEntityHome(brandDomain, pages)`: find the Entity Home candidate (About/home), extract
Organisation JSON-LD, check @id points to canonical domain, count sameAs (target ≥3), build
gaps. Writes the content_structure_audits entity-home cols (via §8.5).

### 6.4 llmstxt-generator.ts
Generate llms.txt + depth_score (/18) + version tracking. The one-current transaction lives in
§8.3 (set others false, insert new current).

### 6.5 agent-readiness.ts + mcp-checker.ts + retrieval-scorer.ts
- **agent-readiness [GAP 2]** (LLD 5400): the 5 dimension scorers, each /20 with the EXACT point
  breakdowns (§6.6). entity_clarity_score is the AR dimension, NOT score_of_10 (§0.5).
- **mcp-checker [GAP 3]** (LLD 5408): /mcp.json or .well-known/mcp present + valid + tools count
  (informational, 0 pts). Feeds tech_score.
- retrieval-scorer: aggregate the 8-dim content + agent readiness into the hub display.

### 6.6 The 5 Agent Readiness dimension formulas (verbatim, LLD 5404–5468) + local-ai-trust
- **tech_score /20:** llmstxt_present(3)+llmstxt_valid(3)+robots_allows_crawlers(3)+
  ssr_passes(3)+ai_discovery_endpoints(2)+page_load_fast(2)+mcp_endpoint_present(2)+
  mcp_endpoint_valid(2); mcp_tools_count = 0 pts.
- **entity_clarity_score /20:** org_schema(5)+local_business_schema(4)+local_reg_in_schema(4)+
  name_consistent(4)+service_readable(3).
- **verify_score /20:** abn_confirmed(5)+wikipedia_au(5)+au_directories(min(n,4))+
  review_citations(min(n,3))+expert_quotes(3).
- **authority_score /20:** topical_coverage(TCG 0–100→0–8)+prompt_appearance(citation_rate×6,
  max 6)+citation_diversity(min(n,6)).
- **task_score /20:** booking(5)+pricing(5)+service_area(5)+faq_direct_answers(min(n,5)).
  Detection of each signal is specified in **§8.4a** (reuses the existing crawl + the P1-S7
  answer-capsule finder; lives in `score-agent-readiness.ts`, **NOT** `local-ai-trust-scorer.ts`).
- **local_ai_trust_score /100** (lib/platform/local-ai-trust-scorer.ts, §0.5): gmb×0.25 +
  directory×0.25 + abn×0.15 + nap×0.20 + citation×0.15; **NULL for vertical='saas'**. Reads
  local_seo_results (Sprint 8) + brand_entity_scores (S5) + citation_source_intelligence (S5).
  **local_seo_results is an S8 table — it does NOT exist when S6 runs, and it supplies gmb (0.25)
  + nap (0.20) = 45% of the score. DECISION (binding): until local_seo_results exists, set
  `local_ai_trust_score = NULL`** (reusing the same nullable semantics as the SaaS case) rather
  than computing a partial — a partial would cap a perfect brand at ~55/100, a misleadingly-low
  number on a customer-facing metric (the honest-data discipline, same reason CPR-01 shows
  "Coming soon" instead of a wrong value). Do NOT use gmb/nap=0. The UI shows the
  local-AI-trust card in a "Coming soon — full local trust scoring activates with local SEO
  data (Sprint 8)" state while NULL. When S8 lands, local_seo_results is present and the full
  composite computes. (Guard the read with table presence — `to_regclass('local_seo_results')`
  — so the scorer is safe to run in the S6→S8 window.)

### 6.7 Wire the last two S4 slots (§0.2 — required this sprint)
Wire content_structure_audits (entity_home_* cols) → the S4 narrative-generator
`entity_home_status` slot, and agent_readiness_scores → the `agent_readiness` slot. After this
all 12 S4 report sections are wired.

---

## 6U. UI SPECIFICATION

GLOBAL UI RULES (per S2 §6U): tokens only; `color-mix` faint fills (RT-01); `--focus-ring` +
`--elevation`; `tabular-nums`; ARIA per FIX 13; reduced-motion reset from S2. Each screen has a
STATES matrix + a `RESPONSIVE:` line. Shared foundation exists from S2 — consume it. Retrieval
hub = Starter+. **Every score-bearing view surfaces the explainability fields (§0.4):** show
the rationale + confidence + top_action, not just the number.

### 6U.2 Retrieval hub — RetrievalHub (prototype 2537)
LayerBadge "retrieval". retrieval-score-card.tsx (8-dim → 5-cat with expand) +
agent-readiness-gauge.tsx (spider chart, 5 dimensions /20). Section tiles → the 4 sub-screens.
STATES — loading: skeletons; empty (no audit yet): EmptyState "Run an audit to see retrieval
intelligence"; error: boundary.
**RESPONSIVE:** tiles `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`; the gauge scales down on `<md`.

### 6U.3 Crawler logs — crawler-logs/page.tsx + crawler-log-table.tsx
Visit timeline with the visit_purpose badges (🟢 retrieval "AI recommended you in N live
conversations" / 🔵 indexing / ⚪ training — §0.5), error highlighting (blocked_cdn /
js_render_fail / 404). is_active_agent tracking is Growth+ (TierGate the snippet setup);
passive log import Starter+.
STATES — loading: row skeletons; empty (no visits / snippet not installed): EmptyState with a
"Install the tracking snippet" CTA; error: boundary.
**RESPONSIVE:** table reflows to stacked cards on `<md`.

### 6U.4 Content structure — content-structure/page.tsx
Per-page audit. content-format-card.tsx (format detected + the advisor recommendation),
freshness-badge.tsx (fresh/aging/at_risk/stale), passage-counter.tsx. **The
citation_probability_score is the HEADLINE** (LLD 5260): "How likely is this page to be cited
by AI? 73% ↑ +12%" with the ≥0.70 green / 0.40–0.69 amber / <0.40 red badge — do NOT bury it
in a table.
STATES — loading: skeleton; empty: EmptyState; error: boundary.
**RESPONSIVE:** page cards `grid-cols-1 md:grid-cols-2`; the headline score stays full-width.

### 6U.5 Agent readiness — agent-readiness/page.tsx
agent-readiness-gauge.tsx (5 dimensions /20 spider) + mcp-status-card.tsx (present/valid/tools
count) + per-dimension breakdowns + the local-AI-trust card (Growth+, hidden/NULL for SaaS).
llmstxt-viewer.tsx (file + depth_score /18 + download).
STATES — loading: skeleton; empty: "Run an agent-readiness check"; SaaS brand: local-AI-trust
card shows "Not applicable for SaaS"; error: boundary.
**RESPONSIVE:** gauge + cards stack on `<md`.

### 6U.6 Entity Home — entity-home/page.tsx + entity-home-status.tsx (GAP 12)
@id present / sameAs count (target ≥3) / org-schema present / the gaps with recommendations.
STATES — loading: skeleton; empty (no entity home identified): EmptyState "We haven't
identified your Entity Home yet — run an audit"; error: boundary.
**RESPONSIVE:** single-column status + gap list.

---

## 7. (No CLI changes this sprint.)

## 8. INNGEST FUNCTIONS (register all 5 in serve() alongside S2–S5; LLD 5656)

### 8.1 crawler-log-ingest.ts (LLD 5656)
Event **`visit/ingested`** (emitted by the Visit route §9.1 for active visits AND by the
passive log-upload path per parsed line). Parses → **INSERT** a new crawler_visit_logs row per
visit (the table is APPEND-ONLY — §0.5; each visit is a distinct log event, no UNIQUE/conflict
target exists, never ON CONFLICT); sets
is_active_agent + referrer_ai_session for active-agent rows; runs visit-classifier for
visit_purpose.

### 8.2 content-structure-audit.ts (LLD 5710)
Cron **`'0 22 * * 3'`** (Wed 22:00 UTC — CR-01). **REUSES `lib/crawler/index.ts`** (Sprint 7
Playwright; 20-page budget, 15s/page, 5min total — do NOT build a second crawler). Scores
answer_capsule/format/freshness/passage_count/citation_probability per URL; **UPSERT** into
content_structure_audits on UNIQUE(brand_id, page_url); recommends format mix (GAP 8: >80%
listicle → suggest how-to).

### 8.3 llmstxt-refresh.ts (LLD 5728)
Cron **`'0 3 1 * *'`** (1st 03:00 UTC). Regenerates llms.txt; **in a transaction set all
is_current=false then insert the new current row** (the partial unique index enforces one
current); compares depth_score, alerts if degraded.

### 8.4 score-agent-readiness.ts (LLD 5734)
Event **`technical-audit/complete`** (slash, internal — SR-01; S7's technical-audit-run emits
both dot+slash — verify when S7 is built). Runs the 5-dimension checks incl MCP validation;
INSERT agent_readiness_scores (append-only); **emit `agent/readiness-scored`**
(`{ organizationId, brandId, compositeScore }` — WH-01d, fanout-webhooks maps to
`agent.readiness.scored`); alert on a significant score drop (compare newest to previous row).

#### 8.4a Task-Fit dimension detection (`task_score` /20)
The LLD locks the columns + formula (`task_booking_accessible`/`task_pricing_visible`/
`task_service_area_defined`/`task_faq_direct_answers`; booking 5 + pricing 5 + service_area 5 +
faq min(n,5) = /20) but does **not** specify how the three booleans are detected. Detect them here,
from the crawl this sprint **already performs** — do NOT open a second crawl. Read the parsed pages
produced by `content-structure-audit.ts` (runs earlier this sprint, keyed by `(brand_id, page_url)`)
and reuse the **Phase 1 Sprint 7** primitives `crawlSite()` / `extractContent()` and the schema
auditor's `typesFound[]`. Keep this logic **in `score-agent-readiness.ts`** (or a private helper it
imports). **Do NOT add it to `lib/platform/local-ai-trust-scorer.ts`** — that file owns the unrelated
`/100` local composite (§6.6, NULL for SaaS); the two scores are different and must not share code.
Renders as the prototype's **"Task-Fit Signals"** bar (RT-1, `/20`).

- **`task_booking_accessible` (BOOLEAN → 5pts):** true if ANY crawled page exposes a machine-
  discoverable, **unauthenticated** booking/enquiry path. Detect (priority order): (1) JSON-LD
  `typesFound` includes `Reservation`/`ReserveAction`/`OrderAction`/`ScheduleAction`, or a
  `potentialAction` of one of those types; (2) an anchor whose href-path or link-text matches
  `/(book|booking|appointment|schedule|reserve|enquir|get-a-quote|request-a-quote)/i` AND resolves
  without a login redirect (status 200, not behind sign-in); (3) a recognised embedded-scheduler host
  (calendly.com, acuityscheduling.com, cal.com, simplybook, squareup.com/appointments, setmore) in an
  iframe/script src. **False** if the only route is auth-gated, `mailto:`/`tel:`-only, or no page was
  retrievable (e.g. `error_type='blocked_cdn'`). This boolean drives the RT-1 copy "AI agents can read
  your site but cannot take actions (e.g., bookings)".

- **`task_pricing_visible` (BOOLEAN → 5pts):** true only if pricing is **machine-readable structured**,
  not prose. Detect (any of): (1) JSON-LD `typesFound` includes `Offer`/`AggregateOffer`/
  `PriceSpecification`, or a `Product`/`Service` node with an `offers` field carrying `price`/
  `priceCurrency`; (2) an HTML `<table>` on a pricing/plans/services page whose cells contain AU
  currency tokens (`/\bA?\$\s?\d|\bAUD\b|\bGST\b/i`) in ≥2 rows; (3) a repeated pricing-card component
  (≥2 cards each with a currency token + a plan/tier label). A single inline price sentence in a
  paragraph ("from $99") with NO table/schema/card structure → **false** (prose pricing isn't
  agent-parsable — that is the entire point of the signal).

- **`task_service_area_defined` (BOOLEAN → 5pts):** true if the service area is machine-verifiable.
  Detect (any of): (1) JSON-LD `LocalBusiness`/`Organization` with `areaServed` or `serviceArea`
  populated (string/array/GeoShape/GeoCircle); (2) a structured suburb/region list (`<ul>`/`<ol>` or a
  JSON array) of ≥3 AU place names matching the brand's `primaryRegions` `STATE:Suburb` set or known AU
  suburb/state tokens (reuse the 8-state list NSW/VIC/QLD/WA/SA/TAS/ACT/NT + the brand's own
  `primaryRegions` for the match); (3) `LocalBusiness.address` with a region/locality present. A vague
  prose claim ("servicing all of Sydney") with no schema/list structure → **false**. Most meaningful
  for location verticals (Tradies, Allied Health, Accountants, Dentists); for `vertical='saas'` it will
  almost always be **false** and that is correct — a SaaS brand has no geographic service area. **This
  is a per-signal `false`, NOT the SaaS-NULL rule** — `task_score` is always computed for every
  vertical; only `local_ai_trust_score` is NULL for SaaS.

- **`task_faq_direct_answers` (INTEGER → min(n,5)pts):** **REUSE** the Phase 1 Sprint 7 answer-capsule
  finder (`lib/answer-capsules/find-questions.ts`) — count question-form H2/H3 headings each followed by
  a 20–25-word direct answer ("answer capsule"). `n` = that count, capped at 5 by the formula. If
  `FAQPage` JSON-LD is present, each well-formed `mainEntity` Q&A pair also counts. **Do not
  re-implement** the finder.

Write each boolean to its `agent_readiness_scores` column verbatim; `task_score` = the formula over
those columns. **Honest-data:** booleans are `false` when unverifiable — never default a signal to
`true` on missing/blocked data. Persist per-signal evidence (which page, which rule fired) into the
row's `gaps` JSONB so the Action Center can cite it and the explainability rationale (§0.4) is concrete
(>30 chars, e.g. "no structured pricing table found on /pricing") rather than "task score is 10/20".

### 8.5 audit-entity-home.ts (LLD 5740) — GAP 12
Event **`technical-audit/complete`** (slash, internal — AE-01). Identifies the Entity Home
candidate from the crawl, checks Organisation JSON-LD @id + sameAs count, updates the
content_structure_audits entity-home cols on the confirmed row; **Action Center recommendation
when sameAs < 3** (or @id missing).

### 8.6 Extend the Sprint 12 retention cron (RT-01, LLD 5200)
Extend the Phase 1 `audit-data-retention.ts` (Sunday cron '0 4 * * 0') to also purge
`DELETE FROM crawler_visit_logs WHERE visited_at < now() - interval '90 days';` — **guard with
the table's presence** (the Phase 1 function must not reference a Phase 2 table before its
migration has run). No audit_id FK on this table, so the 12-mo cascade doesn't cover it.

**serve():** add all 5 to the existing array; remove none. (Running Phase 2 total after S6:
3 (S2) + 6 (S3) + 2 (S4) + 7 (S5) + 5 (S6) = 23 of the eventual 25.)

---

## 9. API ROUTES (LLD 5500) — `[id]` params; Better Auth + org scoping + setRlsContext; Zod;
every score-bearing response carries the explainability fields (§0.4); cross-org → 404.
- `GET /api/brands/[id]/retrieval-audit` — full retrieval + agent readiness report.
- `GET …/crawler-logs` — visit history.
- `GET …/llmstxt` · `POST …/llmstxt/generate`.
- `GET …/content-structure` — per-page audit + format + freshness (citation_probability
  headline).
- `GET …/agent-readiness` · `POST …/agent-readiness/refresh`.
- `GET …/entity-home` — GAP 12 result.

### 9.1 The PUBLIC Visit API route — app/api/visit/route.ts (VA-01/BT-01/MW-01, LLD 5684)
- **PUBLIC, unauthenticated** (the customer's snippet calls it from visitors' browsers). **Add
  `/api/visit` to the `isPublic` matcher in middleware.ts** (MW-01) — Phase 1 currently lists
  '/', '/pricing', '/sign-in(.*)', '/sign-up(.*)', '/api/webhooks(.*)', '/api/health'; without
  adding '/api/visit' the auth middleware 401s visitors and tracking silently breaks.
- **Security via brandToken (BT-01), NOT a session.** Steps: (a) Zod-validate
  `{ brandToken, url(.url()), userAgent, referrer?, timestamp }`; (b) look up
  `SELECT id, organization_id FROM brands WHERE brand_token = body.brandToken` → **401 if not
  found** (never process without a valid token); (c) **rate-limit per brandToken** (~100
  req/min); (d) `inngest.send({ name: 'visit/ingested', data: { brandId, orgId, ...body } })`;
  (e) **return 202 Accepted immediately** (don't block the visitor's page).
- **The snippet** (`public/visibleau-snippet.js` + a Next.js middleware template): reads
  User-Agent + headers, and when it matches an AI-agent pattern (ChatGPT-User, Claude-User,
  PerplexityBot…) POSTs to the Visit API with the brandToken. Must install in <5 min, zero
  sales contact (self-serve moat).

---

## 10. CLAUDE CODE PROMPT (paste this to open Sprint 6)

> You are implementing **VisibleAU Phase 2 — Sprint 6: Retrieval Intelligence + Agent
> Readiness** (Layer 1) — AI crawler logging, content-structure auditing, agent readiness, and
> the Entity Home audit; it also closes the last two Sprint-4 narrative-generator slots.
> Sprints 1–5 are merged. Authority: `visibleau-7layer-lld.md` v8.66, Layer 1 "RETRIEVAL
> INTELLIGENCE" (~5115) and the Sprint 6 plan (~8966). Where this prompt and the LLD differ,
> the LLD wins.
>
> **BEFORE WRITING CODE — two Task-Fit guards (§8.4a):** (1) `lib/platform/local-ai-trust-scorer.ts`
> ALREADY EXISTS and computes the `/100` local composite (gmb/directory/abn/nap/citation, NULL for
> SaaS). Do **NOT** put the Task-Fit (`/20`) detection there — it belongs in
> `score-agent-readiness.ts`. (2) `task_score` is computed for **every** vertical incl. SaaS; only
> `local_ai_trust_score` is NULL for SaaS. Detect the three `task_*` booleans from the crawl
> `content-structure-audit.ts` already runs (reuse `crawlSite()`/`extractContent()` + the P1-S7
> answer-capsule finder) — do **not** open a second crawl.
>
> Build, in order:
> 1. Drizzle schemas + TWO MI-01-idempotent migrations: (a) the 4 new tables (CREATE TABLE IF
>    NOT EXISTS, indexes IF NOT EXISTS incl the partial crawler_logs_purpose_idx +
>    llmstxt_one_current_per_brand, DROP POLICY IF EXISTS before each CREATE POLICY, RLS on all
>    4 — all carry organization_id); (b) brands.brand_token ALTER (ADD COLUMN IF NOT EXISTS +
>    nanoid(32) backfill). CRITICAL: agent_readiness_scores is APPEND-ONLY (no UNIQUE/ON
>    CONFLICT — query latest by scored_at DESC); content_structure_audits is UPSERT on
>    UNIQUE(brand_id, page_url); llmstxt_versions has the partial unique index for one-current;
>    entity_clarity_score is the AR dimension, NOT score_of_10; local_ai_trust_score is NULL
>    for SaaS brands.
> 2. The 8 lib/retrieval modules + lib/platform/local-ai-trust-scorer + explainability (§6):
>    visit-classifier (purpose derivation), content-auditor + content-format-advisor (the
>    FORMAT_BY_ENGINE map + 3:1 listicle:how-to rule) + citation-probability-scorer (the
>    headline score with the exact contributions), entity-home-auditor (@id + sameAs≥3),
>    llmstxt-generator, agent-readiness (the 5 dimension formulas /20 EXACTLY per §6.6) +
>    mcp-checker, retrieval-scorer, local-ai-trust-scorer (/100 composite, NULL for SaaS). All
>    LLM calls use selectModel — no hardcoded models.
> 3. The PUBLIC Visit API route (§9.1): add '/api/visit' to the middleware isPublic matcher
>    (MW-01); brandToken auth (BT-01 — 401 if not found, never process without it); rate-limit
>    per token; emit 'visit/ingested'; return 202. Plus the customer snippet
>    (public/visibleau-snippet.js).
> 4. The 5 Inngest functions (§8), registered in serve() alongside S2–S5: crawler-log-ingest
>    ('visit/ingested'), content-structure-audit (cron 0 22 * * 3, REUSE lib/crawler/index.ts —
>    do NOT build a second crawler, UPSERT), llmstxt-refresh (cron 0 3 1 * *, one-current
>    transaction), score-agent-readiness ('technical-audit/complete', emits
>    'agent/readiness-scored', alert on score drop), audit-entity-home ('technical-audit/
>    complete', Action Center when sameAs<3). Extend the Sprint 12 retention cron to purge
>    crawler_visit_logs >90d (guarded by table presence).
> 5. **Wire the last two S4 slots (§0.2/§6.7):** content_structure_audits entity_home_* →
>    entity_home_status, agent_readiness_scores → agent_readiness in the S4 narrative-generator.
> 6. The 5 Retrieval screens (§6U) + the 9 components: the crawler-log table with visit_purpose
>    badges, the content-structure view with citation_probability as the HEADLINE (green/amber/
>    red), the agent-readiness spider gauge + MCP card + local-AI-trust (NULL/hidden for SaaS),
>    the Entity Home status. Both themes; STATES + RESPONSIVE per screen; ARIA per FIX 13;
>    Retrieval hub Starter+, is_active_agent tracking Growth+.
> 7. The API routes (§9): [id] params, Better Auth + setRlsContext + org scoping, Zod, cross-
>    org → 404, and **every score-bearing response carries the explainability fields**
>    (rationale/confidence_label/confidence_note/top_action via ExplainabilityService.annotate).
>
> Constraints: TS strict, no `any`. LLM_MODE=mock in tests. subscriptions.tier (never
> organizations.tier). selectModel() — no hardcoded models/engine lists. Run §12 greps + §11
> tests and report.

---

## 11. TESTS REQUIRED (LLM_MODE=mock)
- `visit-classifier.test.ts` — purpose derivation (active→retrieval; data tier→training;
  must_allow+>3 pages→indexing; else NULL).
- `visit-route.integration.test.ts` — PUBLIC route: valid brandToken → 202 + emits
  visit/ingested; invalid token → 401; rate-limit triggers; '/api/visit' is in isPublic.
- `citation-probability-scorer.test.ts` — the contributions sum correctly; ~0.85 ceiling;
  format/freshness/entity-home/author inputs each move the score.
- `content-format-advisor.test.ts` — FORMAT_BY_ENGINE map; the 3:1 listicle:how-to rule.
- `agent-readiness.test.ts` — each of the 5 dimension formulas at its thresholds; total /100;
  entity_clarity_score is independent of score_of_10. **Task-Fit (§8.4a):** structured pricing
  `<table>`/`Offer` schema → `task_pricing_visible=true`, but a prose "from $99" → `false`;
  a Calendly/`ReserveAction` path → `task_booking_accessible=true`, an auth-gated booking → `false`;
  **SaaS brand → `task_score` IS NOT NULL** (computed) while `local_ai_trust_score` IS NULL;
  **all-pages `error_type='blocked_cdn'` → all three booleans `false`** (no signal defaulted true);
  rationale for a partial score names a concrete missing signal (length > 30).
- `local-ai-trust-scorer.test.ts` — /100 composite weights; **NULL for vertical='saas'**;
  degrades when local_seo_results absent.
- `entity-home-auditor.test.ts` — @id-points-to-domain detection; sameAs count; sameAs<3 gap.
- `llmstxt-refresh.test.ts` — the one-current transaction leaves exactly one is_current row.
- `agent-readiness.append-only.test.ts` — a new scoring run INSERTs a new row (no UPSERT);
  latest via scored_at DESC.
- `s4-wiring.integration.test.ts` — once an S6 row exists, the S4 narrative-generator renders
  entity_home_status + agent_readiness (the last two slots now wired).
- `retrieval-rls.test.ts` — cross-org reads blocked on all 4 new tables; protected routes call
  setRlsContext; the Visit route is the documented public exception.

## 12. VERIFICATION GREPS
```bash
grep -c "CREATE TABLE IF NOT EXISTS" db/migrations/*sprint6_retrieval.sql             # → 4
grep -c "DROP POLICY IF EXISTS" db/migrations/*sprint6_retrieval.sql                  # → 4
grep -c "ADD COLUMN IF NOT EXISTS brand_token" db/migrations/*sprint6_brand_token.sql # → ≥1
# APPEND-ONLY agent_readiness (no ON CONFLICT) — target the clause, not comments
grep -iE "\.onConflict\(|insert[^;]*on conflict" db/schema/agent-readiness-scores.ts || echo "no ON CONFLICT OK"
# APPEND-ONLY crawler_visit_logs (no ON CONFLICT — INSERT a new row per visit) — clause, not comments
grep -iE "\.onConflict\(|insert[^;]*on conflict" inngest/functions/crawler-log-ingest.ts || echo "no ON CONFLICT OK"
# partial unique indexes
grep -cE "llmstxt_one_current_per_brand|crawler_logs_purpose_idx" db/migrations/*sprint6_retrieval.sql  # → 2
# content_structure_audits UPSERT on (brand_id, page_url)
grep -Rc "ON CONFLICT (brand_id, page_url)\|onConflict.*page" inngest/functions/content-structure-audit.ts  # → ≥1
# entity_clarity_score is NOT score_of_10 — target an actual property access, not comment text
grep -iE "score_of_10\s*[:=)]|\.score_of_10\b" lib/retrieval/agent-readiness.ts || echo "no score_of_10 read OK"
# local_ai_trust_score NULL for SaaS
grep -Rc "vertical.*saas\|'saas'" lib/platform/local-ai-trust-scorer.ts               # → ≥1
# PUBLIC visit route: isPublic + brandToken + 202 + emit
grep -Rc "/api/visit" middleware.ts                                                    # → ≥1
grep -Rc "brand_token\|brandToken" app/api/visit/route.ts                             # → ≥1
grep -Rc "visit/ingested" app/api/visit/route.ts inngest/functions/crawler-log-ingest.ts  # → ≥2
grep -Rc "202" app/api/visit/route.ts                                                  # → ≥1
# crawler reuse (NOT a second crawler)
grep -Rc "from '@/lib/crawler'\|lib/crawler/index" inngest/functions/content-structure-audit.ts  # → ≥1
# Inngest crons + events
grep -Rc "'0 22 \* \* 3'" inngest/functions/content-structure-audit.ts                # → ≥1
grep -Rc "'technical-audit/complete'" inngest/functions/score-agent-readiness.ts inngest/functions/audit-entity-home.ts  # → ≥2
grep -Rc "'agent/readiness-scored'" inngest/functions/score-agent-readiness.ts        # → ≥1
# §8.4a Task-Fit detection landed in the right place — and NOT in the local-trust scorer:
grep -RcE "task_booking_accessible|task_pricing_visible|task_service_area_defined" inngest/functions/score-agent-readiness.ts lib/platform/task-fit-detector.ts 2>/dev/null  # → ≥1 (logic present here)
grep -RcE "task_booking_accessible|task_pricing_visible|task_score" lib/platform/local-ai-trust-scorer.ts  # → 0 (no task logic in the /100 scorer)
grep -Rc "find-questions\|answer-capsule" inngest/functions/score-agent-readiness.ts lib/platform/task-fit-detector.ts 2>/dev/null  # → ≥1 (faq REUSES P1-S7 finder)
grep -RcE "crawlSite\(|fetch\(brand\.domain" inngest/functions/score-agent-readiness.ts  # → 0 (reuses content-structure-audit's crawl; no second crawl)
# retention extension guarded
grep -Rc "crawler_visit_logs" inngest/functions/*retention*.ts                        # → ≥1
# explainability contract on score routes
grep -Rc "rationale\|confidence_label\|top_action" lib/platform/explainability.ts     # → ≥1
# setRlsContext on protected routes (spot-check one)
grep -Rc "setRlsContext" app/api/brands/\[id\]/agent-readiness/route.ts               # → ≥1
# 5 functions registered (running total 23)
grep -cE "crawlerLogIngest|contentStructureAudit|llmstxtRefresh|scoreAgentReadiness|auditEntityHome" app/api/inngest/route.ts  # → 5
# no hardcoded model; UI no hex-alpha; RESPONSIVE
grep -RnE "'claude-3|'gpt-4|'gemini-" lib/retrieval/                                  # → 0
grep -REc "var\(--[a-z-]+\)[0-9a-fA-F]{2}" components/domain/retrieval/                # → 0
grep -RcE "sm:grid-cols|md:|lg:grid-cols" app/\(auth\)/brands/\[brandId\]/retrieval/   # → ≥1
grep -Rc "Clerk\|@clerk" lib/retrieval/ db/ app/api/brands/                           # → 0
```

## 13. COMMON PITFALLS / SPRINT 6 ANTI-PATTERNS
- **Building a second crawler, OR shipping a stub.** There is ONE canonical
  `lib/crawler/index.ts`. content-structure-audit (§8.2) needs the FULL working crawler (20-page
  budget, 15s/page, 5min total) — S6 BUILDS that full crawler (the LLD's "Sprint 7" label is a
  planning-order artifact; S6 needs it first). Do NOT fork a parallel crawler, and do NOT ship a
  stub (a stub leaves content-structure-audit non-functional). Sprint 7 reuses/extends this same
  module — it must not recreate it.
- **Forgetting '/api/visit' in the middleware isPublic matcher (MW-01).** The auth middleware
  will 401 visitors' browsers and crawler tracking silently breaks.
- **Processing the Visit route without brandToken validation (BT-01).** Always SELECT the brand
  by brand_token first → 401 if absent; rate-limit; return 202.
- **Making agent_readiness_scores an UPSERT.** It's APPEND-ONLY (U-13) — history powers the
  score-drop alert; query latest by scored_at DESC.
- **Confusing entity_clarity_score with score_of_10.** Different scale (/20 vs /10), table, and
  meaning. agent-readiness must never read score_of_10 for this dimension.
- **Computing local_ai_trust_score for SaaS brands.** It's NULL for vertical='saas' (no GMB/
  directory signals). Check brand.vertical and skip.
- **Burying citation_probability_score in a table.** It's the HEADLINE content-audit metric
  (green/amber/red), not a column in a grid.
- **Wrong Inngest triggers.** crawler-log-ingest on visit/ingested; content-structure-audit on
  its Wed cron; score-agent-readiness + audit-entity-home on technical-audit/complete (slash,
  internal — and S7 must emit both dot+slash); llmstxt-refresh on the 1st-of-month cron.
- **Skipping the explainability fields.** Every score-bearing response needs rationale +
  confidence_label + confidence_note + top_action (LLD 5490).
- **Referencing crawler_visit_logs in the Phase 1 retention cron without a presence guard** →
  the Phase 1 function breaks before the Sprint 6 migration runs.
- **Missing setRlsContext on a protected route** → silent RLS bypass; cross-org must 404 not 401.
- **Forgetting the S4 wiring (§0.2)** → entity_home_status + agent_readiness stay dormant in S4
  reports; this sprint is what lights them up (the last two slots).
- **Missing RLS** on any of the 4 new tables, or the MI-01 idempotency guards.

## 14. HANDOFF TO SPRINT 7
After Sprint 6: the retrieval layer is live, the public Visit API + snippet track AI crawler
traffic, agent readiness + Entity Home are scored, and **all 12 S4 narrative-generator slots
are now wired** (S5 closed 5, S6 closed the last 2). **Sprint 7 (Conversational Discovery
Intelligence, Layer 4)** creates tables 26–28 (conversation_journeys, journey_run_results,
comparison_prompt_results) — and crucially **builds `technical-audit-run.ts`** that S5/S6
already depend on (so confirm it emits `technical-audit.complete` (dot) AND
`technical-audit/complete` (slash)), and **REUSES/EXTENDS the `lib/crawler/index.ts` Playwright
crawler that Sprint 6 already built** (per S6 §0.2/§13 — S7 must NOT recreate it). It also
completes the S3 Competitive Benchmark (comparison_prompt_results fills the CPR-01 "Coming
soon" data). Sprint 7 requires: S1 services, S3's benchmark scaffold.

## CHANGELOG
- v1.4 — Re-pinned to canon v8.68 (consolidated LLD+prototype hygiene pass: S7b-02
  run-comparison step structure, S8-01 acknowledge emit at source, S8b-01 assertBrandAccess
  formalised, S8b-02 owner-role ceiling, S8b-03 audit actions, S9-02 prototype HealthCheck → 4
  cross-layer dims). §0.3 gate now accepts v8.68 (8.67/8.66 still valid). v8.68 brought CANON into
  line with what this prompt already builds — no prompt content changed; gate + header only.
- v1.3 — Re-pinned to canon v8.67 (consolidated hygiene + security pass: S4-02 DDL
  comma, S5-02 webhook severity enum, S6-02 freshness-tier, SEC-A/SEC-B Visit-route
  hardening). §0.3 version gate now accepts v8.67 (8.66/8.65 still valid). v8.67 changed
  only those five LLD spots — nothing this prompt's core spec contradicts. No other change.
- v1.2 — Gate 2 pass-2 findings applied (forward-dependency / guard-integrity angle), all
  validated against canon first. S6b-01 [LOW]: two §12 "absence" greps (the agent_readiness and
  the v1.1 crawler no-ON-CONFLICT greps) false-failed by matching the mandated "never ON
  CONFLICT" comment text — same class as S5b-01; tightened both to target an actual clause
  (`\.onConflict\(|insert[^;]*on conflict`), and swept the related score_of_10 absence grep to a
  property-access target too. S6b-02 [LOW-MOD]: §6.6 offered two conflicting behaviours for the
  S8 local_seo_results-absent case (gmb+nap = 45% of local_ai_trust_score) — "treat as absent"
  caps a perfect brand at ~55/100, violating the honest-data discipline. Made a BINDING decision:
  local_ai_trust_score = NULL until local_seo_results exists (reusing the SaaS NULL semantics),
  UI shows a "Coming soon" state, to_regclass-guarded; the LLD gap (no absence spec) flagged to
  Sri. S6b-03 [LOW]: "scaffold the crawler" was undefined (stub vs full) and §13 contradicted
  §14 — reconciled across §0.2/§13/§14 to: S6 builds the FULL working lib/crawler/index.ts (the
  LLD's "Sprint 7" label is a planning-order artifact; S6 needs it first), and S7 REUSES/EXTENDS
  it rather than recreating it. No structural/feature change; no existing wiring touched. Pass-2
  confirmed all three v1.1 fixes correct, the SEC-A/SEC-B escalations correctly left as LLD items,
  and the forward-dependency guards sound (the S7 event is dormant-until-emit, the S8 webhook is
  emit-before-consumer, the Phase-1 retention extension is table-presence-guarded).
- v1.1 — Gate 2 findings applied (reviewer chat), all validated against canon first. S6-01
  [MOD]: §8.1 wrongly said crawler-log-ingest "UPSERT crawler_visit_logs" — but the table is
  APPEND-ONLY (LLD 2064: "append-only (not UPSERT) — no UNIQUE needed"; the table body has zero
  UNIQUE constraints). A literal UPSERT has no conflict target and would collapse distinct
  visits, destroying visit-frequency data. Fixed to INSERT a new row per visit; added the §0.5
  append-only rule for crawler_visit_logs + a §12 no-ON-CONFLICT grep (paralleling
  agent_readiness). S6-02 [LOW-MOD]: the freshness contribution to citation_probability used a
  3-tier current/ageing/stale that didn't cover the 4-tier column enum (fresh/aging/at_risk/
  stale) — at_risk had no mapping. Gave the explicit 4→contribution mapping in §6.2 using the
  column enum names (fresh +0.10, aging +0.05, at_risk +0.025, stale 0.00); the LLD-internal
  3-vs-4-tier mismatch (LLD 5240 vs 5262) is flagged to Sri. S6-03 [LOW-MOD]: §1 said "8 lib
  modules + local-ai-trust-scorer" but §6/§4 tree specify 10 lib/retrieval + 2 lib/platform
  (the §1-under-enumeration pattern recurred — S4/S5 held it); corrected to "10 + 2". No
  structural/feature change; no existing wiring touched. Reviewer confirmed the three high-risk
  areas clean: the structural traps (C2 — all five), the PUBLIC Visit route (C4 — VA-01/BT-01/
  MW-01 verbatim), and the S4→S6 last-two-slots wiring (C6).
  SECURITY ESCALATIONS (LLD-level, NOT prompt bugs — the prompt mirrors the LLD faithfully;
  for Sri to decide on the LLD's Visit-route spec): SEC-A [LOW] — the posted `url` is validated
  only as z.string().url(), not against the brand's registered domain, so a (necessarily public)
  brandToken holder can post visits for arbitrary URLs; suggest validating new URL(body.url).host
  against brand.domain before ingest. SEC-B [LOW-MOD] — the LLD orders brand-token DB lookup
  before rate-limit, and the limit is per-token only, so a flood of INVALID tokens never hits the
  limit yet each still triggers a DB SELECT (un-throttled DB-amplification on an unauthenticated
  endpoint); suggest an IP-based throttle before the brand lookup and/or a short-TTL negative
  cache for unknown tokens. Both are Performance/Security/Scalability items per the standing
  non-negotiables.
- v1.0 — Initial Sprint 6 prompt, generated single-pass against verified LLD v8.66
  (REVIEWED-r2). Schema/Inngest/lib/route detail cited to LLD ~5115–5850 + ~8966; UI to
  prototype RetrievalHub (2537); conventions from master plan §7. §1 module list is the
  complete enumeration of the §4 tree (per the S3-01 lesson). Closes the last two S4
  narrative-generator slots (entity_home_status + agent_readiness); introduces the PUBLIC
  Visit API (VA-01/BT-01/MW-01) + the brands.brand_token ALTER + the retention extension.
  Awaiting Gate 2.
- v1.0 — Initial Sprint 6 prompt, generated single-pass against verified LLD v8.66
  (REVIEWED-r2). Schema/Inngest/lib/route detail cited to LLD ~5115–5850 + ~8966; UI to
  prototype RetrievalHub (2537); conventions from master plan §7. §1 module list is the
  complete enumeration of the §4 tree (per the S3-01 lesson). Closes the last two S4
  narrative-generator slots (entity_home_status + agent_readiness); introduces the PUBLIC
  Visit API (VA-01/BT-01/MW-01) + the brands.brand_token ALTER + the retention extension.
  Awaiting Gate 2.
