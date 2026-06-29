# VisibleAU Phase 2 — Sprint 6 Bundle (core + CDN enhancement + driver)
**Assembled:** 26 Jun 2026. **Canon:** LLD v8.68 (REVIEWED). **Status:** ready to build when Sri
reaches Phase 2 Sprint 6 (after Phase 1 S11–S12 and Phase 2 S1–S5).

This bundle is the complete, current artifact set for building **Phase 2 Sprint 6 — Retrieval
Intelligence + Agent Readiness** plus its **CDN Shield enhancement**. Everything here is the latest
version; superseded drafts (enhancement v1.0/v1.1/v1.2, the earlier enhancement-only review handoff) are
deliberately NOT included.

---

## CONTENTS (4 files)

1. **`visibleau-p2-sprint-6-prompt.md`** — **v1.5** — the canonical Sprint 6 build prompt
   (Gate-3 cross-audited against the LLD). Builds the 4 Layer-1 tables (crawler_visit_logs,
   content_structure_audits, llmstxt_versions, agent_readiness_scores) + the brands.brand_token
   ALTER, 5 Inngest functions, the public Visit API, 10 lib/retrieval modules, 5 screens, the S4
   wiring, and the §8.4a task-fit detection. **This is the authority for the core build; do not
   rewrite it.**

2. **`visibleau-p2-sprint6-cdn-shield-enhancement.md`** — **v1.3** — the net-new CDN delta layered
   ON TOP of the core. Adds the CDN firewall detector (`lib/crawler/cdn-shield-detector.ts`), the
   customer-facing WAF-bypass remediation snippet, the "AI Crawler Access Blocked" UI card, an
   optional Tier-0 conversion hook (§4), and an optional Visit-API SEC-A/SEC-B hardening (§5).
   Independently reviewed (verdict PASS); 3 minor review fixes applied in v1.1, a one-line
   consistency fix in v1.2, and a gate-precision alignment (§10 ↔ §1) in v1.3. **Zero schema change;
   no new Inngest function; detector in `lib/crawler/` not `lib/platform/`.**

3. **`RUN-sprint6-core-plus-cdn-enhancement.md`** — the **driver/orchestration prompt**. Paste this
   ONE file into a fresh Claude Code session to build both in the correct order: Phase A (core S6)
   → checkpoint (its §12 greps + typecheck + tests must pass) → Phase B (CDN enhancement) →
   checkpoint. The two prompt files stay separate and authoritative; the driver sequences them with
   a hard gate between, producing two separable commits.

4. **`REVIEW-HANDOFF-sprint6-bundle.md`** — handoff for a fresh Claude chat to review all three
   files **together** as a coherent package (mutual consistency + correct sequencing), not just the
   enhancement in isolation.

---

## HOW THESE RELATE
```
visibleau-p2-sprint-6-prompt.md (v1.5, core)  ──┐
                                                ├──►  RUN-...md (driver runs A then B)
visibleau-p2-sprint6-cdn-shield-...md (v1.3) ───┘
                                                      REVIEW-HANDOFF-...bundle.md (review all 3)
```
- The **enhancement layers on the core** — it edits surfaces the core builds (content-structure-
  audit.ts, the GPTBot crawl, the error_type column). Its Step-0 gate STOPS if the core isn't built.
- The **driver** is the recommended way to execute: one session, core first, enhancement second.
- **Do NOT merge the core and enhancement into one file** — keeping them separate preserves the
  core's Gate-3 provenance and keeps the net-new CDN work traceable + revertible.

---

## CANON DEPENDENCY (not included here — reference from the Phase 2 bundle)
The authority above all of these is the LLD: **`visibleau-7layer-lld.md` v8.68**, inside
`visibleau-phase2-v8_68-bundle-2026-06-25.zip` at `01-lld/`. When any prompt and the LLD disagree,
THE LLD WINS. Verify canon: `grep -m1 '^# Version:' visibleau-7layer-lld.md` → `# Version: 8.68`.

## TIMING
Apply at **Phase 2 Sprint 6** — which is behind: Phase 1 S11 → Phase 1 S12 (incl the
audits.status='complete' fix + retention cron) → Phase 2 S1 → S2 → S3 → S4 → S5 → **then S6**.
Do not run any of this before then; the enhancement's gates will refuse, and the core depends on
S1–S5 being merged.
