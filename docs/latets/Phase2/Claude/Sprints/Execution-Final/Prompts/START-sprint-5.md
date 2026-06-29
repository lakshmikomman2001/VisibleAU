# Claude Code — START SPRINT 5: Trust Intelligence (Layer 3)

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
Open completely: **`visibleau-p2-sprint-5-prompt.md`**.
**Note:** this sprint REUSES the ExplainabilityService created in S3 — it renders it, does not recreate it.

## STEP 2 — Read ONLY the cited LLD regions
From `visibleau-7layer-lld.md`:
- Sprint 5 plan (~8946); Layer 3 §"TRUST INTELLIGENCE" (~6716)
- tables: hallucination_incidents (6755), evidence_snapshots (6826), brand_entity_scores ALTER (6850),
  citation_source_intelligence (6897), linkedin_presence_audits (6974), brand_consensus_checks (7024),
  youtube_presence_audits (7082)
- CT-04 risk formula (~6793); Inngest specs (~7140); lib modules (~7300); API routes (~7110)
- MI-01 (~8645), RLS spec (~8629)

Navigational line numbers — confirm by content. **LLD wins on conflict.**

## STEP 3 — Read ONLY the cited prototype components
From `visibleau-prototype-phase2.jsx`:
- TrustHub (~2370)

## STEP 4 — Run the prompt's own Step 0 against the REAL repo, then build
Confirm S3's ExplainabilityService + brand_entity_scores exist (this sprint ALTERs the latter, reuses the
former). Build per prompt; LLD tiebreaker.

---

## GUARDRAILS for this sprint
- **Explainability:** REUSE `lib/platform/explainability.ts` from S3 — do not create a second copy. Render the
  `{rationale, confidence_label, confidence_note, top_action}` contract on Trust's scored panels.
- **local_ai_trust_score is NULL for SaaS by design** (S6b-02 carries forward) — a SaaS-type brand shows N/A,
  not 0 or an error. (task_score still computes for all verticals — only the local-trust composite is SaaS-NULL.)
- **CT-04 risk formula** governs the trust risk score — follow the LLD spec.
- **Inngest:** S5's functions (detectHallucinations, captureEvidenceSnapshot, refreshEntityScore,
  buildCitationSourceIntelligence, auditLinkedinPresence, checkCrossPlatformConsensus, auditYoutubePresence)
  register in the SINGLE `app/api/webhooks/inngest/route.ts` serve() array. Verification grep targets that path.
- **assertBrandAccess** on the brand-scoped Trust Hub. Don't read the whole LLD. Post-build review is separate.
