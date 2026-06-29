# Claude Code — START SPRINT 8: Governance Intelligence (Layer 7)

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
Open completely: **`visibleau-p2-sprint-8-prompt.md`**.
**Note:** this sprint formalizes `assertBrandAccess` as the canonical brand-isolation gate (S8b-01) — S1–S7
were retrofitted to it; build it as the authority here.

## STEP 2 — Read ONLY the cited LLD regions
From `visibleau-7layer-lld.md`:
- Sprint 8 plan (~9038); Layer 7 §"GOVERNANCE INTELLIGENCE" (~8493)
- tables: audit_trail (8507), org_members (8545), data_residency_log (8599), org_feature_flags (8647)
- the fanout-webhooks WH-01 extension (~3850); audit_trail Phase 2 actions AT-01 (~8512)
- the 3-layer auth model + RBAC matrix (~8533); the residency UPSERT DR-01/DR-02 (~8620)
- MI-01 (~8700), RLS spec (~8684)

Navigational line numbers — confirm by content. **LLD wins on conflict.**

## STEP 3 — Read ONLY the cited prototype components
From `visibleau-prototype-phase2.jsx`:
- TeamManagement (~2800), DataResidency (~3034)

## STEP 4 — Run the prompt's own Step 0 against the REAL repo, then build
Confirm S1–S7 surfaces exist (this sprint adds governance over them, and assertBrandAccess gates them). Build
per prompt; LLD tiebreaker.

---

## GUARDRAILS for this sprint
- **assertBrandAccess(user, brandId)** is the CANONICAL brand-isolation gate — org-scoped RLS does NOT enforce
  `org_members.brand_access`. This sprint formalizes it; ensure every brand-scoped surface uses it.
- **RBAC matrix — role ceilings:** admin CANNOT act on owner → 403 (S8b-02). Enforce the role-ceiling rows.
- **audit_trail** gains Phase 2 actions including `member_role_changed` + `member_removed` (S8b-03 / AT-01).
- **Data residency UPSERT** (DR-01/DR-02) — must UPSERT, not create duplicate rows; reflects AU region.
- **Team Management is Agency+.** Both Team and Data Residency are workspace-level (`/team`, `/data-residency`).
- **Inngest:** S8 adds NO new Inngest function (serve() stays 25/25). The fanout extension is WH-01 on existing
  webhooks. Do NOT create `app/api/inngest/route.ts`.
- This is the SECURITY-critical sprint — test the isolation + RBAC boundaries hard in the post-build review.
- Don't read the whole LLD. Post-build review is separate.
