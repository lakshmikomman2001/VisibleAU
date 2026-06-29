# Claude Code — START SPRINT 6: Retrieval Intelligence + Agent Readiness (Layer 1)

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
Open completely: **`visibleau-p2-sprint-6-prompt.md`**.
**Note:** this is the sprint with the Task-Fit detection + the CDN-shield work. If your bundle includes a
separate Sprint-6 enhancement/CDN-shield doc, read it too — but the core prompt is the index.

## STEP 2 — Read ONLY the cited LLD regions
From `visibleau-7layer-lld.md`:
- Sprint 6 plan (~8966); Layer 1 §"RETRIEVAL INTELLIGENCE" (~5115)
- tables: crawler_visit_logs (5148), content_structure_audits (5225, incl entity-home cols),
  llmstxt_versions (5371), agent_readiness_scores (5387)
- Visit API route VA-01/BT-01/MW-01 (~5684); brands.brand_token ALTER (~5662)
- the explainability contract (~5490); RLS setRlsContext pattern (~5620)
- Inngest specs (~5656); lib modules (~5752)

Navigational line numbers — confirm by content. **LLD wins on conflict.**

## STEP 3 — Read ONLY the cited prototype components
From `visibleau-prototype-phase2.jsx`:
- RetrievalHub (~2537)

## STEP 4 — Run the prompt's own Step 0 against the REAL repo, then build
Confirm earlier sprints' tables exist. Build per prompt; LLD tiebreaker.

---

## GUARDRAILS for this sprint
- **CDN-shield detector** lives in `lib/crawler/cdn-shield-detector.ts` (NOT `lib/platform/`). It requires a
  CDN fingerprint AND a 403/429/503 status — a 200 behind Cloudflare is NOT blocked. Passive crawler-logs at
  Starter+ (not Growth+). Adds zero schema, zero Inngest functions; serve() count unchanged by the shield.
- **Task-Fit signals** (booking/pricing/service_area via schema/table/areaServed; faq reuses P1-S7
  find-questions.ts): detection lives in `score-agent-readiness.ts`, NOT in a local-trust scorer. task_score
  computes for ALL verticals.
- **local_ai_trust_score stays NULL for SaaS** (S6b-02) and in the S6→S8 window.
- **Visit API security:** the IP-based throttle runs FIRST (before any DB work) per the SEC hardening — follow
  VA-01/BT-01/MW-01 exactly.
- **Inngest:** S6's functions (crawlerLogIngest, contentStructureAudit, llmstxtRefresh, scoreAgentReadiness,
  auditEntityHome) register in the SINGLE `app/api/webhooks/inngest/route.ts` serve() array. Grep targets that path.
- **Explainability:** reuse the S3 service. **assertBrandAccess** on the brand-scoped Retrieval Hub.
- Don't read the whole LLD. Post-build review is separate.
