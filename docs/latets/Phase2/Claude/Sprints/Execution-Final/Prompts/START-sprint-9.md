# Claude Code — START SPRINT 9: AI Visibility Autopilot UX (FINAL SPRINT, Layer 7)

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
Open completely: **`visibleau-p2-sprint-9-prompt.md`** — the capstone. It assembles the visible Autopilot loop
and finalizes the screens that only reach final form now (Health Check, Dashboard).

## STEP 2 — Read ONLY the cited LLD regions
From `visibleau-7layer-lld.md`:
- Sprint 9 plan (~9050–9090): tracker (~9060), trend API + the v8.16 join fix (~9075)
- the explainability contract (~5556)
- the Autopilot-loop step backing (~802)

Navigational line numbers — confirm by content. **LLD wins on conflict.**

## STEP 3 — Read ONLY the cited prototype components
From `visibleau-prototype-phase2.jsx`:
- EnhancedDashboard (~1089), HealthCheck (~1399), AutopilotLoop (~3127)

## STEP 4 — Run the prompt's own Step 0 against the REAL repo, then build
This is the FINAL sprint — confirm ALL of S1–S8's tables/services/layers exist, because the capstone screens
reconcile data across every layer. Build per prompt; LLD tiebreaker.

---

## GUARDRAILS for this sprint
- **No new tables, no new Inngest functions** — serve() stays 25/25. This sprint is the VISIBLE loop over
  existing backends. Do NOT create `app/api/inngest/route.ts`; do NOT add tables.
- **HealthCheck** reconciles to the LLD's 4 CROSS-LAYER dimensions (AI Sentiment / AI Presence / Site Readiness
  / Local Authority, + the #1 action as the 5th element) — S9-02 / FIX 16. Populate all 4 from real layer data,
  no placeholders.
- **Dashboard trend API:** apply the v8.16 join fix (~9075) — the trend tracker must return correct time-series rows.
- **Explainability:** reuse the S3 service; the Autopilot loop ties to REAL remediation tasks + content drafts
  (from S2), not mock steps.
- **RM-02 (forward build rule):** dynamic-status regions (generating→ready, toasts) in `aria-live="polite"` with
  `aria-busy`; responsive breakpoints incl. mobile <375px. Apply on these screens.
- **assertBrandAccess** on the brand-scoped Autopilot + Health Check.
- After this sprint, Phase 2 is feature-complete — run the full UI test plan + a final cross-layer review.
- Don't read the whole LLD. Post-build review is separate.
