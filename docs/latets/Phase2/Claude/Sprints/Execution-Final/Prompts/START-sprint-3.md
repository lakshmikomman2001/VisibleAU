# Claude Code — START SPRINT 3: Visibility Intelligence + Market Gaps (Layer 2)

> **Paste this into a fresh Claude Code session to start this sprint.**
> Canonical folder: `C:\startup\VisibleAU\src\docs\latets\Phase2\Claude\Sprints\Execution-Final\`
> Read ONLY from this folder.

---

## STEP 0 — Canon check
```bash
cd "C:/startup/VisibleAU/src/docs/latets/Phase2/Claude/Sprints/Execution-Final"
grep -m1 '# Version:' visibleau-7layer-lld.md            # → # Version: 8.68
grep -c  'FIX 16 (v8.68)' visibleau-prototype-phase2.jsx   # → 1
grep -c  'ATTRIBUTION CORRECTION' visibleau-7layer-lld.md  # → 3
```
If any value is wrong, STOP — stale copy.

## STEP 1 — Read the sprint prompt IN FULL
Open completely: **`visibleau-p2-sprint-3-prompt.md`**.
**Note:** this sprint CREATES the platform-wide ExplainabilityService that S5/S6/S9 reuse — read its spec carefully.

## STEP 2 — Read ONLY the cited LLD regions
From `visibleau-7layer-lld.md`:
- Sprint 3 plan (~8833); Layer 2 §"VISIBILITY INTELLIGENCE" (~5852)
- tables 12–18: share_of_voice (5873), prompt_volume (5897), visibility_trends (5939),
  brand_web_mentions (6112), query_fan_out (6156), topical_coverage_gaps (6183), google_ai_mode (6235)
- the two FK ALTERs onto remediation_tasks (~7591 / ~7600)
- citation-failure diagnose input shape (~8848); competitive-benchmark CPR-01 null contract (~8888)
- MI-01 (~8645), RLS spec (~8629)

Navigational line numbers — confirm by content. **LLD wins on conflict.**

## STEP 3 — Read ONLY the cited prototype components
From `visibleau-prototype-phase2.jsx`:
- VisibilityHub (~1533), CitationFailureDiagnosis (~1823), CompetitiveBenchmark (~1973), dashboard SoV strip region

## STEP 4 — Run the prompt's own Step 0 against the REAL repo, then build
Confirm S2 tables (remediation_tasks etc.) exist — the FK ALTERs depend on them. Build per prompt; LLD tiebreaker.

---

## GUARDRAILS for this sprint
- **Explainability contract** `{rationale, confidence_label, confidence_note, top_action}` is CREATED here
  (`lib/platform/explainability.ts`) and rendered on scored routes. Rationale must be specific (>30 chars,
  naming a real signal) — never a bare number. S5/S6/S9 will reuse this service; build it cleanly.
- **Score scales:** composite + dimensions are 0–100; `mention_source_ratio` is 0–1; div-by-zero → NULL (not NaN).
- **Competitive Benchmark is Agency+** — lower tiers see a locked teaser (CPR-01 null contract for missing data).
- **Inngest:** S3's 6 functions (calculateShareOfVoice, aggregateVisibilityTrend, simulateQueryFanOut,
  calculateTopicalGaps, classifyCitationSources, trackBrandWebMentions) register in the SINGLE
  `app/api/webhooks/inngest/route.ts` serve() array. The verification grep targets that path.
- **assertBrandAccess** on brand-scoped pages. Don't read the whole LLD. Post-build review is separate.
