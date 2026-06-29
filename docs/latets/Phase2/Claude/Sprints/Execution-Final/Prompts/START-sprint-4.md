# Claude Code — START SPRINT 4: Communication Intelligence (Layer 6)

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
Open completely: **`visibleau-p2-sprint-4-prompt.md`**.

## STEP 2 — Read ONLY the cited LLD regions
From `visibleau-7layer-lld.md`:
- Sprint 4 plan (~8939); Layer 6 §"COMMUNICATION INTELLIGENCE" (~8129)
- tables 32–34: report_templates (8143), generated_reports (8201), report_delivery_schedules (8247)
- narrative RULES 1–11 (~8290); API routes (~8330)
- Inngest specs generate-narrative-report + send-scheduled-reports (~8350); lib modules (~8395)
- MI-01 (~8645), RLS spec (~8629)

Navigational line numbers — confirm by content. **LLD wins on conflict.**

## STEP 3 — Read ONLY the cited prototype components
From `visibleau-prototype-phase2.jsx`:
- ReportsList (~2682)

## STEP 4 — Run the prompt's own Step 0 against the REAL repo, then build
Confirm earlier sprints' data exists (reports draw on visibility/workflow data). Build per prompt; LLD tiebreaker.

---

## GUARDRAILS for this sprint
- **Tier gate nuance (watch this):** the Reports *tab* may be Starter+, but **generated_reports is Growth+** —
  Starter has NO report-generation entitlement even if the tab shows. Honor the entitlement, not just the tab.
- **Narrative RULES 1–11** govern report copy generation — follow the LLD spec exactly.
- **Inngest:** S4's functions (generateNarrativeReport, sendScheduledReports) register in the SINGLE
  `app/api/webhooks/inngest/route.ts` serve() array. The verification grep targets that path.
- Reports is workspace-level (`/reports`), not brand-scoped. Don't read the whole LLD. Post-build review is separate.
