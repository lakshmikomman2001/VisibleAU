# VisibleAU Phase 2 — SPRINT 3 PROMPT: GATE 2 FINDINGS
# Reviewer: independent reviewer chat | Date: June 2026
# Reviewing: visibleau-p2-sprint-3-prompt.md v1.0 (Visibility Intelligence + Market Gaps)
# Canon used: visibleau-phase2-v8_65-complete-REVIEWED-r2 (LLD v8.65, 9,192 lines)
# Method: derived each check from the LLD/prototype directly; every cited line opened.
# (The prompt's anchors are r2-accurate — no line offset. §A1 now uses the r2 marker — good.)

---

## 1. VERDICT — **PASS-WITH-FIXES** (near-clean: two LOW/LOW-MOD items; the data/logic core is faithful)

The heaviest sprint so far, and the substance is strong. All four builder-flagged high-risk
areas are **clean and excellent**: the unit rule (C2), the two FK ALTERs (C4), CPR-01
graceful degradation (C6), and wins-feed Phase A built in full here (C7). Schema fidelity
(C1), source-column correctness (C3), and UI anchors (C8) all verify. The two findings are a
recurring §1-summary under-enumeration (S3-01) and one mislabelled UI anchor (S3-02) — both
LOW-impact; no HIGH or data/logic defect.

---

## 2. FINDINGS

### S3-01 — [LOW-MOD] §1 "Lib modules" list omits two of the seven visibility modules (recurring pattern)
- **Claim in the prompt:** §1 lists "Lib modules (§6): mention-source-divide,
  citation-failure-diagnosis, fan-out-simulator, topical-gap-calculator, sov-calculator,
  plus wins-feed.ts" — 5 visibility modules + wins-feed.
- **What I checked:** the §4 tree and §6 specify **7** visibility modules — §6.1
  sov-calculator, §6.2 mention-source-divide, §6.3 fan-out-simulator, §6.4
  topical-gap-calculator, **§6.5 citation-source-classifier**, §6.6 citation-failure-diagnosis,
  **§6.7 visibility-trend-aggregator** — plus types.ts (§6.0) and wins-feed (§6.8). §1 omits
  **citation-source-classifier (§6.5)** and **visibility-trend-aggregator (§6.7)**. The latter
  is the central period-rollup engine (computes every visibility_trends column, consumed by
  §8.2 aggregate-visibility-trend) — not a minor helper.
- **Why it matters:** this is the **third recurrence** of the same class (Sprint 1 S1-02:
  service count 5 vs 6; Sprint 2 S2b-01: lib count 5 vs 7). The §4 tree + §6 are complete and
  authoritative, so there's no build risk, but §1 ("what ships") repeatedly under-enumerates.
- **Required fix:** complete §1's enumeration — "7 visibility lib modules (§6.1–§6.7) + the
  shared wins-feed.ts (§6.8, moved from S2)" — or mark it "key modules incl." **Recommendation
  for S4–S9:** treat §1's module list as a complete enumeration of the §4 tree to stop this
  recurring. No LLD change.

### S3-02 — [LOW] §6U.5 dashboard SoV-strip anchor mislabels VisibilityHub as EnhancedDashboard
- **Claim in the prompt:** §6U.5 heads "Dashboard SoV strip increment — **EnhancedDashboard
  (prototype 1533 SoV region)**."
- **What I checked:** prototype line **1533 is `VisibilityHub`** (`const VisibilityHub =
  ({ onNav, tier='Agency' }) =>`), not the dashboard. `EnhancedDashboard` is at **~1061**, and
  its body (1061–1230) has **no** Share-of-Voice region yet (grep empty) — consistent with S3
  *adding* the strip. So the anchor names one component (EnhancedDashboard) while pointing at
  another's line (VisibilityHub).
- **Why it's only LOW:** anchors are declared navigational; the intent is clearly "add an SoV
  strip to EnhancedDashboard, reusing the SoV donut visual that lives in VisibilityHub." Same
  class as Sprint 2's S2-04 (the ~856 anchor). **Fix:** "EnhancedDashboard (~1061); reuse the
  SoV donut/bar visual from VisibilityHub (~1533)."

### Minor note (optional, not a numbered finding)
`citation-source-classifier.ts` (§6.5) has **no dedicated test** in §11 (the other six
visibility libs do). It "feeds the trend view and the citation-failure diagnosis," so it's
plausibly covered indirectly via `citation-failure-diagnosis.test.ts` — and the playbook
doesn't mandate 1:1 test coverage — but a one-line `citation-source-classifier.test.ts`
(source_type classification) would close the gap. Optional.

---

## 3. RULINGS / OPEN-QUESTION CHECK
The prompt carries **no OPEN QUESTIONS block** (none needed). It correctly scopes the
deferred-feature boundaries: the dashboard SoV strip is added while the S9 Autopilot tracker
+ Health Check banner stay out of scope; the Competitive Benchmark ships data + a basic card
with the CPR-01 "Coming soon" state (full view S9, comparison data S7).

---

## 4. CLEAN — independently derived against the LLD/prototype (not manufacturing findings)

- **C1 schema (7 tables) — verbatim ✓.** SoV: `audit_id` ON DELETE CASCADE (E-03),
  brand_share/competitor_share NUMERIC(5,2) **percentages** (MS-02), `sov_brand_engine_idx`.
  prompt_volume_estimates: **global, RLS-DISABLED** (no organization_id) with the
  citability_methods precedent, enums + UNIQUE verbatim. visibility_trends: per-dimension
  AVGs, the unit + source-column rules below, `UNIQUE(brand_id, period_label, period_type)`.
  brand_web_mentions: `source_platform`/`mention_sentiment` enums + **4 indexes incl the
  partial** `brand_mentions_cited_idx … WHERE engine_citation_seen IS NOT NULL`. fan-out:
  `audit_id` CASCADE, `original_prompt_id` **ON DELETE SET NULL (CK3/v8.28)**,
  content_similarity_score NUMERIC(4,3), above_threshold `> 0.88`, `fan_out_threshold_idx`.
  topical: `topic_cluster` underscores, `cross_prompt_impact` (NULL <2), `updated_at` on UPSERT
  (J-01), `UNIQUE(brand_id, vertical, topic_cluster)`, `topic_gaps_cross_prompt_idx … DESC
  NULLS LAST`. google_ai_mode_results: reproduced + flagged **stretch**.
- **C2 unit rule (highest-value) — PERFECT ✓.** `mention_rate`/`citation_rate`/`brand_share`/
  `competitor_share` = PERCENTAGES (×100 formulas); `mention_source_ratio` = 0–1 and **NULL
  when mention_rate=0**; archetype thresholds = percentage-points (mention ≥20, citation ≥10).
  Enforced in spec (§0.4 "the single most important correctness rule"), pitfalls (§13), AND
  greps (§12: `× 100` ≥2, `mentionRate > 0 ?` guard, `>= 20`/`>= 10` thresholds). Matches the
  LLD MS-01/MS-02 fix (LLD 472–484, 5969–6048).
- **C3 source columns + period_label + topic_cluster — ✓.** `score_sentiment_avg` =
  AVG(**scoreSentimentNumeric**) not the text `scoreSentiment`; `score_context_avg` =
  AVG(**scoreContextNumeric**); enforced by greps (`scoreSentimentNumeric|scoreContextNumeric`
  ≥2 AND `AVG(.*scoreSentiment\b` → 0). period_label exact ('2026-W23'/'2026-06') via one
  helper with the UNIQUE byte-match warning. topic_cluster hyphen→underscore (§0.5/§6.4).
- **C4 the 2 FK ALTERs — PERFECT ✓.** A **separate** migration after the tables;
  `fk_fan_out_gap` → query_fan_out_results, `fk_topical_gap` → topical_coverage_gaps, **both
  ON DELETE SET NULL**, each wrapped in a `pg_constraint`-exists DO block (MI-01 re-runnable).
  Matches the LLD remediation_tasks ALTER spec (LLD 7591/7600); greps verify (2 / 2 / 2).
- **C5/C8 UI — ✓.** Anchors land: VisibilityHub 1533, CitationFailureDiagnosis 1823,
  CompetitiveBenchmark 1973 (the latter two screens take a `tier` prop matching the gating).
  Each §6U screen carries a STATES matrix + a `RESPONSIVE:` line; reduced-motion is correctly
  consumed from the S2 foundation (not rebuilt). (Anchor nit = S3-02.)
- **C6 CPR-01 — PERFECT ✓.** The competitive-benchmark route returns `comparisonData:null` +
  `competitorNarrative:null` + `dataAvailableFrom:'Sprint 7'` when comparison_prompt_results
  is empty, **skips the generateText narrative call**, UI shows a "Coming soon" card (not an
  error), Starter sees a locked teaser. citation-failure diagnose() degrades from topical gaps
  alone when the S5/S7 tables are absent. Matches LLD 8884–8893; greps + integration test cover it.
- **C7 wins-feed Phase A — correct placement ✓.** S3 builds it IN FULL:
  `lib/communication/wins-feed.ts` + `GET /api/brands/[id]/wins` (Starter+, LIMIT 20/?limit 50,
  PA-01) + `wins-feed.test.ts`; 5 win types incl **visibility_up/competitor_down now that
  visibility_trends + share_of_voice_snapshots exist**; `reason` prefixed "likely linked to:"
  (attribution honesty, v8.19). This correctly resolves Sprint 2's S2-01 deferral.
- **C9 template/depth — ✓.** Sections 0–14 + §6U present; 542 lines (heavy sprint; the
  ~400-line token block is referenced by anchor per S2's defensible pattern); §12 greps are
  logically sound and runnable.
- **C10 nothing wrongly built/dropped — ✓.** google_ai_mode_results flagged **stretch**; the
  L3 half of GAP 4 (`citation_source_intelligence` table) correctly **deferred to S5**;
  `market_competition_label` is computed but its full UI is correctly **S9**.
- **Wiring/counts — ✓.** 6 Inngest functions consistent across §1/§8/§12 (serve total → 9);
  6 API routes consistent between §4 tree and §9; 10 tests (incl the FK-migration guard test,
  CPR-01 integration test, and RLS test); every `§` reference resolves.

---

## 5. NEXT STEP
Two prompt-internal fixes, no LLD change:
- **S3-01** (complete §1's lib enumeration — add citation-source-classifier + the central
  visibility-trend-aggregator) — LOW-MOD; worth a v1.1 and worth fixing the recurring pattern
  for the remaining sprints.
- **S3-02** (clarify the §6U.5 dashboard anchor: EnhancedDashboard ~1061, reuse VisibilityHub
  ~1533's SoV visual) — LOW.
- Optional: add `citation-source-classifier.test.ts`.
With S3-01/S3-02 applied, Sprint 3 is ready for Claude Code. This was a strong pass on the
hardest sprint yet: the unit rule, the BD-01 FK closure, CPR-01, and the wins-feed relocation
are all correct, and the fresh consistency angle surfaced only minor items.

— End of SPRINT3-FINDINGS.md
