# Claude Code — START SPRINT 2: Workflow Intelligence (Layer 5)

> **Paste this into a fresh Claude Code session to start this sprint.**
> Canonical folder: `C:\startup\VisibleAU\src\docs\latets\Phase2\Claude\Sprints\Execution-Final\`
> Read ONLY from this folder. Do not open Phase 2 copies in any other directory.

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
Open completely: **`visibleau-p2-sprint-2-prompt.md`** — the build instruction + index.

## STEP 2 — Read ONLY the cited LLD regions
From `visibleau-7layer-lld.md`:
- Sprint 2 plan (~8825)
- Layer 5 §"WORKFLOW INTELLIGENCE" (~7567)
- tables 29–31: remediation_tasks (7580), workflow_runs (7846), content_drafts (7885)
- Inngest specs (~7991)
- MI-01 idempotency (~8645), RLS spec (~8629)

Line numbers are navigational — confirm by content. **LLD wins on any conflict with the prompt.**

## STEP 3 — Read ONLY the cited prototype components
From `visibleau-prototype-phase2.jsx`:
- WorkflowHub (~2096), ContentDraftEditor (~2231), EnhancedDashboard (~1061), shared components (~492–840)

## STEP 4 — Run the prompt's own Step 0 against the REAL repo, then build
Confirm Sprint 1's platform tables/shell exist before building. Then build per the prompt; LLD is tiebreaker.

---

## GUARDRAILS for this sprint
- **Status enums (critical this sprint):** `workflow_runs.status='completed'` (with -d) vs `audits.status=
  'complete'` (no -d) — NEVER unify. `remediation_tasks` uses open/in_progress/ready_for_review/complete/
  wont_fix (NOT 'done'). `content_drafts` uses draft/approved/published/rejected.
- **Inngest:** register S2's functions (e.g. generateContentDraft, triggerValidationReaudit,
  scheduleWorkflowRuns) in the SINGLE `app/api/webhooks/inngest/route.ts` serve() array — never a second file.
  The prompt's verification grep targets that canonical path.
- **MI-01 idempotency** applies to the Inngest functions — follow the LLD spec.
- **assertBrandAccess(user, brandId)** on brand-scoped surfaces — org RLS alone is insufficient.
- Don't read the whole LLD. Post-build review is a separate step.
