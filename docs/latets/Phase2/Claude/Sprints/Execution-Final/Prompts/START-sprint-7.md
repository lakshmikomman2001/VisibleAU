# Claude Code — START SPRINT 7: Conversational Discovery Intelligence (Layer 4)

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
Open completely: **`visibleau-p2-sprint-7-prompt.md`**.
**Note:** at the end of this sprint serve() reaches 25/25 Inngest functions — the full Phase 2 set.

## STEP 2 — Read ONLY the cited LLD regions
From `visibleau-7layer-lld.md`:
- Sprint 7 plan (~9032); Layer 4 §"CONVERSATIONAL DISCOVERY INTELLIGENCE" (~7457)
- tables: conversation_journeys (7469), journey_run_results (7500), comparison_prompt_results (7530)
- Inngest run-journey + run-comparison-prompts (~7570)
- the dual-emit requirement on technical-audit-run (~1064, ~7246)
- the crawler reuse/UA note (~3343); lib modules (~7640); API routes (~7556)
- MI-01 (~8700), RLS spec (~8684)

Navigational line numbers — confirm by content. **LLD wins on conflict.**

## STEP 3 — Read ONLY the cited prototype components
From `visibleau-prototype-phase2.jsx`:
- DiscoveryHub (~2944)

## STEP 4 — Run the prompt's own Step 0 against the REAL repo, then build
Confirm earlier sprints' tables/services exist (S7 also enriches the S3 Competitive Benchmark). Build per
prompt; LLD tiebreaker.

---

## GUARDRAILS for this sprint
- **Discovery Hub is Agency+ ONLY** — the clearest tier gate in Phase 2. Growth sees a locked "Agency+" teaser,
  never the data. Enforce the gate.
- **run-comparison-prompts** uses a per-competitor×engine step.run structure (S7b-02) — follow the LLD spec.
- **Dual-emit on technical-audit-run** — the hallucination/acknowledged fanout PRODUCER emit must be added at
  source; the companion visibility/trend-updated emit already exists. Follow the LLD.
- **Inngest:** S7's functions (runJourney, runComparisonPrompts) register in the SINGLE
  `app/api/webhooks/inngest/route.ts` serve() array — after this, serve() = 25/25. Grep targets that path.
- **assertBrandAccess** on the brand-scoped Discovery Hub. Don't read the whole LLD. Post-build review is separate.
