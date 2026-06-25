# VisibleAU — Phase 2 Handoff (for a new chat)
**Last updated: 25 June 2026.** Paste this at the start of a new conversation focused on building
Phase 2. Read top-to-bottom. Phase 2 design is COMPLETE and Gate-3 audited; this handoff orients a new
chat to build it.

---

## 1. WHO + WHAT

**Operator:** Sri — Sydney-based solo full-stack dev (16+ yrs), full-time job + family, weekend pace
(~8 hrs/week). Strong OSS preference, sharp technical judgment, verify-before-claim discipline.

**Project: VisibleAU** — Australian-first **GEO/AEO visibility-auditing SaaS**: measures how visible a
brand is across AI answer engines (ChatGPT, Claude, Gemini, Perplexity) for AU SMBs/agencies. Per-brand
flat-rate AUD pricing.

**Phase 2** = the next major build on top of the built Phase 1. Design is **complete and Gate-3 audited**
at **LLD v8.68 / prototype FIX 16**, with all 9 sprint prompts cross-audited and ready. **Phase 2 build
has NOT started** as of 25 Jun 2026 (Phase 1 Sprints 1–10 are built; Phase 1 Sprint 10 = Stripe billing
was built & verified end-to-end on 25 Jun).

**Environment:** Windows (Lenovo Intel Evo, **NO WSL**), VS Code + Claude Code extension (native
Windows). PostgreSQL 18 local. pnpm.

---

## 2. THE TWO-CHAT WORKFLOW (how Sri works)

- **THIS chat (reviewer/spec)** = reads canon, verifies built work against canon + screenshots, and
  **writes ready-to-paste Claude Code prompts**. NO direct repo access.
- **A separate Claude Code session** (VS Code, on Sri's Windows machine) = applies the prompts.
So the assistant's output is **precise, self-contained Claude Code prompts** (Step 0 investigation,
exact changes, constraints, verification greps) — not direct edits. This chat's container resets between
sessions, so canon must be re-uploaded or referenced from the Phase 2 bundle.

---

## 3. WORKING METHOD / DISCIPLINES

- **Verify before claiming.** Grep canon before asserting. Never trust self-reports — "typecheck passes"
  ≠ "works on real data"; "builder says done" ≠ "correct on the rendered screen." Sri's screenshot
  discipline catches "Claude Code said done but the screen disagreed."
- **LLD (v8.68) is canon. LLD > prototype on conflicts.** Flag when canon is silent rather than inventing.
- **A ready-to-paste fix prompt for EVERY issue** (incl. minor). Scope precisely.
- **Investigate-then-build prompts** when behaviour depends on the actual repo (auth, env, paths) — don't
  hardcode guesses (we were burned assuming the Inngest endpoint; it's `/api/webhooks/inngest`).
- **Performance, Security, Scalability, UX are first-class** — optimised queries, indexing, RLS, no
  N+1s, secure auth, accessible + mobile-responsive UI, loading states, error boundaries.
- **Phase 2 sprint/prototype design rule:** when asked to design sprint prompts/prototype, do it
  properly and completely on the FIRST attempt — don't push back, stall, or defer. Prototypes must be
  Figma-style with fully-specified UI styles (NexusBook approach) so Claude Code doesn't miss styling
  (a Phase 1 lesson). (Note: Phase 2 design is already done — this rule applies if revising.)
- **Communication:** direct, no padding, push back on weak proposals, mobile-readable markdown,
  plan-then-execute with approval gates. **English only** (Telugu OFF unless explicitly requested).

---

## 4. STACK (locked, same as Phase 1)

Next.js 15 (App Router) · Supabase/Postgres + RLS · Drizzle ORM · **Better Auth** (Clerk fully retired —
residual "Clerk" strings are documented drift C-04) · Inngest · Vercel AI SDK (central model-selector) ·
Stripe · Resend · Sentry · PostHog.
**Tiers:** Free / Starter / Growth / Agency / Agency Pro (+ Enterprise custom), all AUD.

---

## 5. ⚠️ CRITICAL LOCKED FACTS (prevent real bugs)

- **`audits.status` = `'complete'`** (NO -d). THREE different "complete" values exist, NEVER unify:
  audit status `'complete'`; `workflow_runs.status` = `'completed'`; webhook/analytics EVENT names like
  `checkout.session.completed`, `audit.completed`, `signup_completed` (correctly `-ed`). A blind
  find-replace of "completed" breaks Stripe + PostHog.
- **Route params:** PAGE routes `[brandId]`, API routes `[id]`.
- **`regionEnum`** lowercase COUNTRY: `'au'|'nz'|'uk'|'us'|'eu'|'ca'`, default `'au'` (NOT a state).
- **`primaryRegions`** `text[]` in `STATE:Suburb` format; regex `/^[A-Z]{2,4}:[A-Za-z][A-Za-z\s]{0,49}$/`.
  8 AU states: NSW/VIC/QLD/WA/SA/TAS/ACT/NT.
- **runs-per-prompt:** env-configurable via `lib/llm/tier-engines.ts` `runsForTier()` (clamp 1–5).
  Free = 3, paid = 5.
- **Inngest local endpoint `/api/webhooks/inngest`** (NOT `/api/inngest`); **Stripe webhook
  `/api/webhooks/stripe`**.
- **Better Auth users** created via the auth layer (not raw INSERT) or they can't log in.
- **Windows env chain:** `START-DEV.bat` copies `.env.dev` → `.env.local` (Next reads `.env.local`);
  env changes need a START-DEV.bat restart.
- **LLM_MODE=mock in dev** (deterministic ~92.0 mock scores — artifact, not real).

---

## 6. PHASE 2 CANON — v8.68 (what to build)

**Canonical version: LLD v8.68 / prototype FIX 16.** All 9 sprint prompts Gate-3 cross-audited
(PASS-WITH-FIXES, all applied). Versions at last audit: S1 v1.5 · S2 v1.5 · S3 v1.5 · S4 v1.4 ·
S5 v1.5 · S6 v1.4 · S7 v1.3 · S8 v1.4 · S9 v1.3. Treat anything below v8.66 as stale.

**Key v8.68 invariants / fixes (in the LLD):**
- 37 tables · 16 GAPs · serve()=25/25 · 'ATTRIBUTION CORRECTION' ×3.
- Platform-wide explainability contract `{ rationale, confidence_label, confidence_note, top_action }`
  (G3-01; in S3+S5 prompts).
- `assertBrandAccess()` = canonical brand-isolation gate (S8b-01). RBAC matrix has role-ceiling rows
  (S8b-02). audit_trail action enum additions (S8b-03).
- HealthCheck reconciled to 4 cross-layer dims (S9-02).
- run-comparison-prompts retry-safety (S7b-02); hallucination/acknowledged fanout producer at source
  (S8-01).
- **Deliberate deferral: OQ-1 `local_seo_results`** — NO DDL until a dedicated local-SEO pass; S6's
  `local_ai_trust_score` stays NULL by design (S6b-02).
- **Forward build rules:** RM-02 (aria-live) + responsive breakpoints.

**Prototype:** `visibleau-prototype-phase2.jsx` — Figma-style, fully-specified styles.

---

## 7. WHAT TO DO NEXT (Phase 2 build)

Phase 2 design is DONE; the next work is **building it**, sprint by sprint, via Claude Code:
- For each sprint, hand Claude Code the relevant `visibleau-p2-sprint-N-prompt.md` (build spec) +
  reference the LLD for detail. Build, then VERIFY against canon + rendered screens (Sri's discipline).
- Expect the same pattern as Phase 1: build → screenshot → catch discrepancies → ready-to-paste fix
  prompts. Phase 1 taught that real bugs hide behind "looks integrated" (e.g. the Stripe webhook
  deadlock, the ABN endpoint 404, the no-WHERE tier UPDATE) — exercise real flows, don't trust reports.
- A Vitest E2E suite pattern exists from Phase 2 Sprint 1 prep (15 files, two audit passes F-01..F-06,
  documented in AUDIT-FINDINGS.md) — reuse that testing rigor.

**Before building, confirm:** which sprint to start with, and that the canonical files (LLD v8.68 + the
sprint prompt) are uploaded so the assistant can grep rather than guess.

---

## 8. CANON LOCATIONS

**Phase 2 bundle:** `visibleau-phase2-v8.68-bundle-2026-06-25.zip`:
- `01-lld/visibleau-7layer-lld.md` — **LLD v8.68** (the canon; shared 7-layer LLD, serves as Phase 2's
  LLD).
- `02-prototype/visibleau-prototype-phase2.jsx` — Phase 2 prototype (FIX 16).
- `03-sprint-prompts/visibleau-p2-sprint-1..9-prompt.md` — all 9 sprint prompts.
- `04-handoff-and-contents/` — original Phase 2 handoff + contents manifest.
- `05-research/` — placeholder; ChatGPT research was NOT available to bundle (add it there if you have
  it).

**Phase 1 (built):** `visibleau-phase1-complete-bundle-2026-06-25.zip` (PRD v1.15, Foundations v1.12,
Architecture v1.6, prototype, 12 sprint prompts, all fix prompts across three eras).

**Overall project handoff:** `VisibleAU-HANDOFF.md` (covers Phase 1 build status + 25 Jun Stripe session
+ all locked facts + parked items).

---

## 9. CONTEXT FROM THE 25 JUN SESSION (Phase 1, but relevant background)

The most recent session built & verified **Phase 1 Sprint 10 (Stripe billing)** end-to-end — upgrade,
cancellation, customer portal, and atomicity-proven-by-fault-injection. It caught three real bugs
(webhook secret unset, a connection-pool deadlock, wrong success-copy) and eliminated a data-integrity
footgun (a no-WHERE `UPDATE organizations SET tier='agency'` in both an e2e script AND START-PROD.bat —
a prod landmine). It also switched ON real ABN Lookup verification (was bypassed) and fixed a 404
endpoint bug in it. Per-tier test users were seeded (`free1/2`, `starter1/2`, `growth1/2`, `agency1/2`,
`agencypro1/2` @test.visibleau.dev, password `TestPass123!`).
Phase 2 build was NOT touched in that session. These notes matter because Phase 2 will hit the same
classes of risk — exercise real flows, watch for unscoped writes, add timeouts on outbound calls, and
keep webhook/transaction handlers atomic + idempotent.
