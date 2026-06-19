# VisibleAU Phase 2 — SPRINT-MASTER-PLAN
# Version: 1.0 | Date: June 2026 | Built against: LLD v8.65 (REVIEWED) + prototype FIX 14
# Built by: original chat (builder) per Playbook v1.0 §2 | Status: AWAITING REVIEW GATE 1
# Sources: LLD sprint plan (lines 8814–9010), table inventory (8728–8784), serve()
# registry (4511–4545), GAP index (527–553), layer sections (5083–8624), prototype
# component/screen anchors (492–3307). Every claim below carries its anchor.

## OPEN QUESTIONS FOR REVIEWER (resolve at Gate 1 — playbook §4.7)

Q1. EnhancedDashboard (proto 1061) is incremental across sprints. PROPOSAL: base shell +
    task/work cards ship S2; SoV/visibility strip increments S3; Autopilot tracker +
    Health Check banner increment S9. Each sprint's prompt specs only its increment.
Q2. HealthCheck screen (proto 1371): LLD calls its labeling "Sprint 10 packaging"
    (line ~8985) but the build plan has 9 sprints. PROPOSAL: the screen ships in S9
    (it is the Autopilot aha-moment); "Sprint 10" is read as post-S9 launch-packaging
    guidance, not a build sprint. Confirm or assign differently.
Q3. S2 acceptance includes "fan-out improvement" (LLD 8827) but fan-out data ships S3.
    PROPOSAL: record as a forward-data nuance — S2 builds the reaudit lift mechanism
    against Phase 1 scores; the fan-out component of lift activates after S3. No
    resequencing.
Q4. S4 report sections include LinkedIn/consensus (LLD 8907) but that data ships S5.
    PROPOSAL: apply the LLD's own CPR-01 precedent (8881–8895): S4 templates render
    those sections with explicit "available after next audit cycle" placeholders until
    S5 populates. NULL-handling contract written into the S4 prompt.

---

## 1. SPRINT ROSTER (verbatim from LLD §PHASE 2 SPRINT PLAN, 8814–9010)

| # | Sprint | Weeks | Layer | LLD anchor |
|---|--------|-------|-------|-----------|
| S1 | Platform Foundation | 4 | Platform (no layer) | 8816 |
| S2 | Workflow Intelligence | 4 | L5 | 8822 |
| S3 | Visibility Intelligence + Market Gaps | 4 | L2 | 8831 |
| S4 | Communication Intelligence | 4 | L6 | 8906 |
| S5 | Trust Intelligence | 4 | L3 | 8913 |
| S6 | Retrieval Intelligence + Agent Readiness | 4 | L1 | 8932 |
| S7 | Conversational Discovery Intelligence | 4 | L4 | 8945 |
| S8 | Governance Intelligence | 3 | L7 | 8960 |
| S9 | AI Visibility Autopilot UX | 3 | cross-layer UX | 8966 |

Build order is S1→S9 as listed. Layer sections in the LLD: L1 5083 · L2 5852 · L3 6684 ·
L4 7370 · L5 7564 · L6 8097 · L7 8406 · RLS spec 8626 · inventory 8728 · sprint plan 8814.
Sprint 1's own spec section: "## PHASE 2 SPRINT 1 — PLATFORM FOUNDATION" at 4760
(tables 4777–4960, serve() registry note 4511, platform services + config CLI).

## 2. TABLE OWNERSHIP MAP — 38 manifest rows = 37 new tables + 1 ALTER (inventory 8728–8784)

| # | Table | Sprint | CREATE anchor | Notes |
|---|-------|--------|---------------|-------|
| 1 | config_bundle_cache | S1 | 4777 | |
| 2 | market_ai_budget_policies | S1 | 4793 | max_fan_out_sub_queries=12 (v3.0) |
| 3 | sampling_policies | S1 | 4821 | |
| 4 | metric_quality_gates | S1 | 4869 | |
| 5 | prompt_pack_coverage | S1 | 4880 | |
| 6 | provider_market_capabilities | S1 | 4894 | |
| 7 | audit_cost_snapshots | S1 | 4939 | |
| 8 | crawler_visit_logs | S6 | 5116 | |
| 9 | content_structure_audits | S6 | 5193 | [GAP 8][GAP 12]; v4.0 entity-home cols |
| 10 | llmstxt_versions | S6 | 5339 | |
| 11 | agent_readiness_scores | S6 | 5355 | [GAP 2] |
| 12 | share_of_voice_snapshots | S3 | 5870 | |
| 13 | prompt_volume_estimates | S3 | 5894 | |
| 14 | visibility_trends | S3 | 5936 | [GAP 9][GAP 15]; rates are % 0–100 |
| 15 | query_fan_out_results | S3 | 6153 | [GAP 1]; 3–12 sub-queries |
| 16 | topical_coverage_gaps | S3 | 6180 | [GAP 6] |
| 17 | google_ai_mode_results | S3 | 6232 | [GAP 5] stretch |
| 18 | brand_web_mentions | S3 | 6109 | [GAP 14] |
| 19 | hallucination_incidents | S5 | 6723 | risk = LEAST(100,15c+5w+1i), CT-04 |
| 20 | evidence_snapshots | S5 | 6794 | |
| 21 | brand_entity_scores | S5 | (ALTER — no CREATE) | Phase 1 table; nullable col adds only; entity_score NOT added (D-01) |
| 22 | citation_source_intelligence | S5 | 6865 | [GAP 4] |
| 23 | linkedin_presence_audits | S5 | 6942 | [GAP 7] |
| 24 | brand_consensus_checks | S5 | 6992 | [GAP 10] |
| 25 | youtube_presence_audits | S5 | 7050 | [GAP 16] |
| 26 | conversation_journeys | S7 | 7382 | UX Agency+ gate (8948–8956) |
| 27 | journey_run_results | S7 | 7413 | |
| 28 | comparison_prompt_results | S7 | 7443 | Growth+; feeds S3 benchmark (CPR-01) |
| 29 | remediation_tasks | S2 | 7577 | status enum locked; INTEGER priority |
| 30 | workflow_runs | S2 | 7843 | status 'completed' (-ed) |
| 31 | content_drafts | S2 | 7882 | [GAP 8] content_format col |
| 32 | report_templates | S4 | 8111 | LinkedIn/consensus sections → Q4 |
| 33 | generated_reports | S4 | 8169 | Growth+ |
| 34 | report_delivery_schedules | S4 | 8215 | Agency+ |
| 35 | audit_trail | S8 | 8420 | |
| 36 | org_members | S8 | 8458 | |
| 37 | data_residency_log | S8 | 8512 | |
| 38 | org_feature_flags | S8 | 8560 | |

S9 creates NO tables (LLD 8966+: "No new tables" — tracker is one query; trend API is
read-only over Phase 1 citations via audits join, v8.16 fix noted at 8999–9001).
Coverage: S1×7, S6×4, S3×7, S5×7(incl ALTER), S7×3, S2×3, S4×3, S8×4 = 38 rows ✓.

## 3. INNGEST OWNERSHIP MAP — 25 functions (registry 4511–4545; layer→sprint per roster)

S2 (L5, 3): generate-content-draft (7991) · trigger-validation-reaudit (8015) ·
            schedule-workflow-runs (8049)
S3 (L2, 6): calculate-share-of-voice (6411) · aggregate-visibility-trend (6422) ·
            simulate-query-fan-out (6463) · calculate-topical-gaps (6512) ·
            classify-citation-sources (6540) · track-brand-web-mentions (6552, weekly)
S4 (L6, 2): generate-narrative-report · send-scheduled-reports (specs in L6 §8097+)
S5 (L3, 7): detect-hallucinations (7128) · capture-evidence-snapshot (7153) ·
            refresh-entity-score (7157, monthly) · build-citation-source-intelligence
            (7182) · audit-linkedin-presence (7188, monthly) ·
            check-cross-platform-consensus (7207) · audit-youtube-presence (7222, monthly)
S6 (L1, 5): crawler-log-ingest (5623; trigger 'visit/ingested' from PUBLIC
            app/api/visit/route.ts, VA-01) · content-structure-audit (5681) ·
            llmstxt-refresh (5695) · score-agent-readiness (5700) ·
            audit-entity-home (5711, after each content-structure pass)
S7 (L4, 2): run-journey (7480) · run-comparison-prompts (7512)
S1/S8/S9:   0 Inngest functions (S1 = platform services + CLI; S8 = CRUD/RBAC;
            S9 = read-only APIs + UX).
Total: 3+6+2+7+5+2 = 25 ✓. Every prompt embeds the serve() registration reminder
(Phase 1 GA1 lesson, LLD 4512).

## 4. GAP COVERAGE MAP (GAP index 527–553; primary sprint = where its table/feature ships)

| GAP | Title | Sprint(s) |
|-----|-------|-----------|
| 1 | Query Fan-Out Intelligence | S3 (#15) |
| 2 | AI Agent Readiness Score | S6 (#11) |
| 3 | MCP readiness check (moved Phase 3→2, L1) | S6 |
| 4 | Citation Source Type Intelligence (L2+L3) | S5 (#22) + S3 classifier fn |
| 5 | Google AI Mode engine (stretch) | S3 (#17) |
| 6 | Topical Coverage Gap Score | S3 (#16) |
| 7 | LinkedIn Presence Intelligence | S5 (#23) |
| 8 | Content Format Intelligence (L5+L1) | S2 (#31 format col) + S6 (#9 advisor) + S3 benchmark UX (SE8, 8869) |
| 9 | Mention-Source Divide | S3 (#14) |
| 10 | Cross-Platform Consensus Score | S5 (#24) |
| 11 | Knowledge Panel check | S5 (#21 ALTER cols) |
| 12 | Entity Home audit | S6 (#9 cols + audit-entity-home fn) |
| 13 | Wikidata entry check | S5 (#21 ALTER cols) |
| 14 | Brand Web Mention Intelligence | S3 (#18) |
| 15 | Citation Volatility Score | S3 (#14 col) |
| 16 | YouTube Presence Intelligence | S5 (#25) |

All 16 covered; multi-layer GAPs (4, 8) list every contributing sprint ✓.

## 5. SCREEN / COMPONENT OWNERSHIP MAP (prototype anchors; screenMap 3294–3307)

SHARED FOUNDATION → S2 (first user-facing sprint builds the chrome; later sprints consume):
  Phase2Styles tokens+CSS (84–490) · LayerBadge 492 · IntelCard 527 · MetricRow 596 ·
  SectionHeader 630 · TierGate 653 · EmptyState 691 · StatusBadge 719 · PriorityBadge 754 ·
  ConfidenceBadge 773 · Phase2Sidebar (~840) · TopBar · BrandIntelTabs 989 (gates locked:
  overview=Free, visibility/retrieval/workflow=Starter, trust/reports=Growth,
  discovery=Agency).

| Screen (screenMap id) | Component @ line | Sprint |
|---|---|---|
| dashboard | EnhancedDashboard 1061 | S2 base; S3 + S9 increments (Q1) |
| workflow-hub | WorkflowHub 2096 | S2 |
| content-draft | ContentDraftEditor 2231 | S2 |
| visibility-hub | VisibilityHub 1533 | S3 |
| citation-failure | CitationFailureDiagnosis 1823 | S3 |
| competitive | CompetitiveBenchmark 1973 | S3 data + basic card; S7 completes comparison data; S9 full view (LLD 8866–8898) |
| reports | ReportsList 2682 | S4 |
| trust-hub | TrustHub 2370 | S5 |
| retrieval-hub | RetrievalHub 2537 | S6 |
| discovery-hub | DiscoveryHub 2916 | S7 (Agency+ gate) |
| team | TeamManagement 2772 | S8 |
| data-residency | DataResidency 3006 | S8 |
| autopilot | AutopilotLoop 3099 | S9 |
| health-check | HealthCheck 1371 | S9 (Q2) |

Out of Phase 2 scope (handoff §F.3): brand-list, action-center, vertical-packs, billing
(Phase 1 screens). 14 screens + shared foundation = full prototype coverage ✓.

## 6. DEPENDENCY GRAPH (acyclic; build order = roster order)

S1 → provides: config/budget/sampling/quality-gate/cost platform services, config:validate
     CLI. requires: Phase 1 baseline only. (Acceptance: Phase 1 audits unchanged.)
S2 → requires: S1 (cost snapshots for draft-generation LLM calls), Phase 1
     (recommendations, audits, scores). provides: tasks/drafts/workflow_runs loop, UI
     chrome + shared components, reaudit-lift mechanism (fan-out facet activates
     post-S3 — Q3).
S3 → requires: S1 (budget policies cap fan-out at 12), S2 (remediation_tasks receives
     gap-sourced tasks; Action Center wiring). provides: SoV/trends/gaps/fan-out/
     mentions/volatility data; citation-failure diagnosis (read-time over #16/#22/#28
     — #28 empty until S7, CPR-01 null contract 8881–8895); benchmark data layer.
S4 → requires: S3 (fan-out coverage, topical gaps, archetype in reports), S2 (task
     summaries). provides: report templates/generation/delivery. LinkedIn/consensus
     sections placeholder until S5 (Q4).
S5 → requires: S1 (LLM budget), Phase 1 brand_entity_scores (ALTER target). provides:
     hallucination/evidence/entity/citation-source/linkedin/consensus/youtube data →
     fills S4 report sections, feeds Action Center.
S6 → requires: S1; PUBLIC /api/visit route (VA-01). provides: crawler/structure/llms.txt/
     agent-readiness/entity-home data → Action Center triggers (sameAs<3, missing @id).
S7 → requires: S3 (benchmark panel awaits #28), S1 (journey LLM budget). provides:
     journeys + comparison_prompt_results → completes S3 benchmark; Agency+ UX gate.
S8 → requires: nothing layer-specific (Phase 1 auth/org). provides: audit_trail, RBAC
     (org_members), residency log, feature flags consumed by all surfaces.
S9 → requires: S2+S3 (the loop: gaps→tasks→drafts→approve→reaudit→trend delta), Phase 1
     citations (per-prompt trend API, join via audits — v8.16 fix, 8999). provides: the
     visible Autopilot loop, Action Progress Tracker ("4 of 11", 8978–8983), per-prompt
     sparklines, Health Check packaging.

No cycle: forward-data nuances (S3→S2 acceptance facet, S5→S4 sections, S7→S3 benchmark)
are data-arrival timing handled by the LLD's own CPR-01 null-contract pattern, not build
dependencies.

## 7. SHARED CONVENTIONS BLOCK (playbook §4.4 — copy VERBATIM into every prompt §0)

• Better Auth canonical; zero Clerk references (drift C-04 is documentation-only).
• Page routes use [brandId]; API routes use [id].
• TIER_ENGINES gating: Free=2 engines, paid=4 — never hardcode engine lists.
• Tab tier gates: overview=Free; visibility/retrieval/workflow=Starter; trust/reports=
  Growth; discovery=Agency. Journeys UX = Agency+ (LLD 8948); comparison data = Growth+.
• remediation_tasks.status = open|in_progress|ready_for_review|complete|wont_fix (never
  'done'); priority = INTEGER rank (1 = top); the high/med/low pill is DERIVED from
  effort + expectedImpactScore.
• workflow_runs.status uses 'completed' (-ed); audits.status uses 'complete'. Report
  status is UI-DERIVED (generating/ready/published) — no DB column.
• mention_rate / citation_rate / brand_share / competitor_share are PERCENTAGES (0–100);
  mention_source_ratio is 0–1. Archetype thresholds: mention ≥20, citation ≥10 (MS-01).
• Hallucination Risk = LEAST(100, 15×critical + 5×warning + 1×info) over OPEN,
  non-false-positive incidents (CT-04; lib/trust/hallucination-risk.ts; no risk column).
• Entity display = ROUND(score_of_10 × 10); entity_score column must NOT be added (D-01).
• UI: tokens only (no raw hex where a token exists); dark default + [data-theme="light"]
  accent overrides exist — never re-derive them; faint accent fills via
  color-mix(in srgb, var(--token) N%, transparent) — NEVER hex-alpha suffixes on var()
  strings (RT-01); --focus-ring + --elevation tokens; tabular-nums on mono numerics;
  ARIA per FIX 13 build rules (icon-only buttons labeled, tablist/tab/aria-selected,
  textbox roles, aria-hidden decorative icons, APG tabs completion).
• Inngest: every function registered in serve() (GA1 lesson); idempotent via UPSERT keys;
  LLM_MODE=mock coverage in tests (CLAUDE.md §8).
• RLS: USING + WITH CHECK on every multi-tenant table per LLD §8626 spec.
• Do-not-fix list (handoff §F) is binding on prompts.

## 8. CONTEXT PACKS (playbook §5 — a generation session reads ONLY its pack + this plan)

S1: LLD 4760–5082 (Sprint-1 section incl tables 1–7 + services + CLI), 4511–4560
    (registry + lib list), 8626–8812 (RLS spec + inventory), 8816–8821. Prototype: none
    (no UI). P1 analogue: per index. Provides→all; requires Phase 1 only.
    Hot-list: budget max_fan_out=12; config:validate CI gate; cost snapshots feed
    every later LLM call.
S2: LLD 7564–8096 (L5), 8822–8830; remediation/workflow/draft enums verbatim. Prototype:
    84–1060 (tokens+shared+chrome), 1061–1370 (dashboard base, Q1), 2096–2369 (hub +
    editor). Hot-list: status enums; INTEGER priority; derived pill (EV-01); FIX 13
    ARIA; serve() ×3.
S3: LLD 5852–6683 (L2), 8831–8905 (sprint + benchmark + CPR-01). Prototype: 1533–1972,
    1823–1972 anchors incl diagnosis cards, dashboard SoV increment (Q1). Hot-list:
    % units (MS-01/02); volatility >15 trigger; fan-out 3–12; CPR-01 null contract;
    benchmark tiers Growth 1 / Agency 3 / Pro unlimited (8897).
S4: LLD 8097–8405 (L6), 8906–8912. Prototype: 2682–2771. Hot-list: Growth+ reports;
    Agency+ schedules; Q4 placeholder contract; report status UI-derived.
S5: LLD 6684–7369 (L3), 8913–8931. Prototype: 2370–2536. Hot-list: CT-04 formula;
    D-01 (no entity_score col); ALTER-only on #21; monthly crons; YouTube checks (8925+).
S6: LLD 5083–5851 (L1), 8932–8944. Prototype: 2537–2681. Hot-list: VA-01 public visit
    route; entity-home cols + sameAs<3 trigger; GAP 2 5-dim ×/20; agent-readiness
    Starter entitlement.
S7: LLD 7370–7563 (L4), 8945–8959. Prototype: 2916–3005. Hot-list: Agency+ UX gate with
    Growth teaser copy (8950); lib/conversational/ namespace (NM-01); journey scoring;
    completes S3 benchmark.
S8: LLD 8406–8625 (L7), 8960–8965. Prototype: 2772–2915 (team), 3006–3098 (residency).
    Hot-list: audit_trail on all actions; brand-scoped RBAC; residency accuracy.
S9: LLD 8966–9010 (full section incl tracker spec 8978–8983, trend API + v8.16 join
    8993–9006). Prototype: 1371–1532 (HealthCheck), 3099–3293 (AutopilotLoop incl
    stepper note §F.1), dashboard increments (Q1). Hot-list: "4 of 11" tracker source
    COUNT; loop story end-to-end; per-prompt sparkline Growth+; no new tables.

P1 analogue for all packs: consult 04-sprint-prompts/sri-visibleau-sprint-prompts-index.md
and pick the closest theme; default calibration file = sri-visibleau-sprint-3-prompt.md
(verified structure, 1,364 lines).

## 9. COVERAGE INVARIANTS — Gate 1 battery (run results)

• Table map rows: 38 (37 CREATE anchors verified by grep "^CREATE TABLE" = 37; #21
  ALTER-only) — every inventory entry appears exactly once; sprint sums 7+3+7+3+7+4+3+4
  +0 = 38 ✓
• Inngest map: 25 names = registry imports one-to-one (L1 5, L2 6, L3 7, L4 2, L5 3,
  L6 2) ✓
• GAP map: 1–16 each present, no duplicates as PRIMARY (4 and 8 list contributing
  sprints explicitly) ✓
• Screen map: 14 screenMap ids all assigned; 4 Phase-1 ids excluded per §F.3; shared
  components assigned (S2) ✓
• Dependency graph: acyclic; every "requires" appears as an earlier sprint's "provides";
  3 forward-data nuances documented with the LLD's own CPR-01 pattern (Q3/Q4) ✓

— End of plan. NEXT: Review Gate 1 in the reviewer chat. Generation sessions must not
start until Gate 1 findings (including Q1–Q4 rulings) are applied.
