# VisibleAU Phase 2 — REVIEWER HANDOFF: SPRINT 3 PROMPT (Gate 2)
# Date: June 2026 | Written by: the BUILDER chat (original chat)
# Reviewing: visibleau-p2-sprint-3-prompt.md v1.0 (Visibility Intelligence + Market Gaps)

YOUR ROLE. Independent reviewer of a SPRINT PROMPT before it drives ~4 weeks of Claude Code
work. Derive your own view from the LLD/prototype first, then compare — never accept a cited
line without opening it. Respond in English only (Telugu only if Sri explicitly asks).
Sprint 3 is the heaviest sprint so far; review accordingly.

## SECTION A — VERIFY INPUTS (run BEFORE reviewing; STOP on failure)
A1. visibleau-phase2-v8_65-complete-REVIEWED-r2.zip (canon)
    • grep -m1 "^# Version:" visibleau-7layer-lld.md → "# Version: 8.65 | Date: June 2026"
    • grep -cE "ATTRIBUTION CORRECT(ED IN CROSS-REVIEW|ION)" → ≥1 (r2 marker is "ATTRIBUTION
      CORRECTION"); read the bundled handoff Sections D (locked facts) + F (do-not-fix).
A2. visibleau-p2-sprint3-review-bundle.zip (under review)
    • visibleau-p2-sprint-3-prompt.md (v1.0) — status "Awaiting Gate 2"
    • visibleau-p2-SPRINT-PROMPT-PLAYBOOK-v1.0.md — the standard (§3 template, §4 specs, §6/§7)
    • SPRINT-MASTER-PLAN.md — context: S3 owns tables 12–18, 6 Inngest fns, adds the 2 FK ALTERs.

## SECTION B — WHAT SPRINT 3 IS
Visibility Intelligence + Market Gaps (Layer 2): SoV, visibility trends + Mention-Source
Divide (GAP 9), query fan-out (GAP 1), topical gaps (GAP 6), citation source classifier
(GAP 4 L2), brand web mentions (GAP 14), citation volatility (GAP 15), Citation Failure
Diagnosis, and the Competitive Benchmark data layer + basic panel. 7 new tables (12–18), the
2 FK ALTERs onto remediation_tasks (closing S2's plain-UUID BD-01 columns), 6 Inngest fns,
the dashboard SoV strip, and **wins-feed Phase A in full (moved here from S2)**. LLD
authority: Layer 2 (~5852) + Sprint 3 plan (~8833).

## SECTION C — GATE 2 CHECKS
C1. SCHEMA FIDELITY (7 tables) — open each LLD definition (anchors in prompt §5):
    share_of_voice_snapshots 5873, prompt_volume_estimates 5897, visibility_trends 5939,
    brand_web_mentions 6112, query_fan_out_results 6156, topical_coverage_gaps 6183,
    google_ai_mode_results 6235. Verify columns/types/defaults/constraints verbatim. Watch:
    SoV audit_id CASCADE; fan-out original_prompt_id SET NULL (CK3); topical updated_at +
    UNIQUE(brand,vertical,topic_cluster); the four brand_web_mentions indexes incl the partial.
C2. THE UNIT RULE (highest-value check) — confirm the prompt enforces, in spec + pitfalls +
    greps: mention_rate/citation_rate/brand_share/competitor_share = PERCENTAGES (0–100,
    ×100 formulas); mention_source_ratio = 0–1 AND NULL when mention_rate=0; archetype
    thresholds = percentage-points (mention≥20, citation≥10). (LLD 5969/5977/5980/6040.)
C3. SOURCE-COLUMN + period_label correctness — score_sentiment_avg uses
    scoreSentimentNumeric (NOT scoreSentiment text); score_context_avg uses
    scoreContextNumeric; period_label exact format ('2026-W23'/'2026-06') via one helper;
    topic_cluster hyphen→underscore. (LLD 5943/5953/5960/6196.)
C4. THE 2 FK ALTERs (BD-01 closure) — a SEPARATE migration after the tables; fk_fan_out_gap →
    query_fan_out_results, fk_topical_gap → topical_coverage_gaps, both ON DELETE SET NULL,
    each guarded by a pg_constraint-exists DO block (MI-01 re-runnable). (LLD 7591/7600.)
C5. INNGEST (6 fns) — calculate-share-of-voice, aggregate-visibility-trend (uses the §6.7
    aggregator + correct source columns), simulate-query-fan-out (3–12 sub-queries,
    selectModel, cosine >0.88, budget-capped), calculate-topical-gaps (cross_prompt_impact),
    classify-citation-sources, track-brand-web-mentions (weekly cron, Action Center fires on
    mentions<benchmark or volatility>15). All idempotent UPSERTs; all 6 in serve() (running
    total 9). (LLD 6411+.)
C6. CITATION-FAILURE + COMPETITIVE-BENCHMARK (CPR-01) — diagnose() reads 3 tables, two of
    which (citation_source_intelligence S5, comparison_prompt_results S7) don't exist yet:
    confirm graceful degradation, no error. The competitive-benchmark route MUST return
    comparisonData:null + competitorNarrative:null + dataAvailableFrom:'Sprint 7' when
    comparison_prompt_results is empty, SKIP the generateText narrative call, and the UI shows
    a "Coming soon" card not an error; Starter sees a locked teaser. (LLD 8848/8881.)
C7. WINS-FEED PHASE A (moved from S2) — confirm S3 builds it IN FULL: lib/communication/
    wins-feed.ts + GET /api/brands/[id]/wins (Starter+, LIMIT 20/?limit max 50, PA-01) +
    wins-feed.test.ts, 5 win types (new_citation, new_engine_coverage, visibility_up,
    competitor_down, gap_closed), reason "likely linked to:" (attribution honesty). (LLD 7779.)
C8. UI (§6U) — Visibility hub, Citation Failure Diagnosis (bound to diagnose()), Competitive
    Benchmark basic card + CPR-01 "Coming soon" state, dashboard SoV strip. Each screen has a
    STATES matrix + RESPONSIVE line; both themes; no hex-alpha on var() (RT-01); ARIA per
    FIX 13. Spot-check anchors: VisibilityHub 1533, CitationFailureDiagnosis 1823,
    CompetitiveBenchmark 1973.
C9. TEMPLATE + DEPTH — sections 0–14 + §6U; no unspecified files; §12 greps runnable; §10
    self-contained. (Heavy sprint — expect strong depth.)
C10. ANYTHING MISSING / WRONGLY BUILT — e.g. google_ai_mode_results is a STRETCH (confirm
    it's flagged as such, not over-invested); the L3 half of GAP 4 (citation_source_intelligence
    table) is correctly S5, not built here; market_competition_label is computed but its full
    UI is S9.

## SECTION D — FINDINGS FORMAT
Produce SPRINT3-FINDINGS.md: verdict PASS / PASS-WITH-FIXES / FAIL; numbered S3-01… with
severity + the LLD line checked + required fix; rulings on any OPEN QUESTIONS the prompt
flags; your independently-derived results; a clean pass is valid. Zip for Sri. Builder applies
fixes, bumps to v1.1, then Sprint 3 is ready for Claude Code.

## SECTION E — WHAT YOU MUST NOT DO
• Do not edit the prompt/LLD/prototype/plan — findings go back through Sri.
• Do not generate Sprint 4 (builder's job). • Do not bump any version (escalate real LLD
  gaps). • Do not re-litigate handoff §F do-not-fix items.

— End of reviewer handoff. Run Section A, then Gate 2 per Section C.
