# VisibleAU — Handoff to a new chat

> **NEW CHAT: READ THIS ENTIRE DOCUMENT FIRST, then read the canonical files listed in
> Section 3 BEFORE doing anything.** Do not write code, edit the LLD, edit the prototype,
> design sprint prompts, or answer architecture questions until you have read the relevant
> documents below. The penalty for skipping the reads is drift — wrong enums, wrong tiers,
> wrong routes, duplicated tables — which is exactly what this project spends most of its
> effort preventing. When in doubt, read more, not less.

All files live under `/mnt/user-data/outputs/`. Paths below are relative to that directory.

---

## 1. Who you're working with and how to respond

- **Sri** — Sydney-based solo full-stack developer (16+ yrs), full-time job in financial
  services, building VisibleAU as a side project at weekend pace (~8 hrs/week). Has a
  full-time developer hired for the build with an active build clock.
- **Bilingual responses are mandatory.** Every response: **English first, then the same
  content in Telugu.** Code and technical terms stay in English even inside the Telugu
  portion.
- **Non-negotiable first-class concerns for ALL work:** Performance, Security, Scalability,
  UX Design. That means optimised DB queries, proper indexing, RLS, no N+1s, secure auth
  patterns, accessible + mobile-responsive UI, loading states, error boundaries, and
  production-grade code quality. No corner-cutting on these.
- **Execution principle:** "do it first and get it right the first time." For Phase 2 sprint
  prompts and prototypes, execute completely and correctly on the first attempt — no
  pushback, stalling, or deferral.
- **Prototype fidelity:** Phase 2 prototypes must be fully Figma-style with completely
  specified UI styles (following the NexusBook approach) so Claude Code does not miss any
  styling.

---

## 2. What VisibleAU is, and where the project stands

**VisibleAU** is an AI-search-visibility auditing SaaS for the Australian market: it audits
how brands appear across AI engines (ChatGPT, Claude, Gemini, Perplexity), scores visibility,
detects hallucinations, tracks citations, and (Phase 2) adds a 7-layer intelligence platform.

**Architecture (locked):** Next.js 15+ App Router (server components for DB reads, client for
interactivity) · Supabase Postgres + RLS + Drizzle ORM · Better Auth (migrated from Clerk in
Phase 1) · Inngest for background jobs · Vercel AI SDK with a central model selector
(`lib/llm/model-selector.ts` — never hardcode model strings). Tiers: **Free / Starter /
Growth / Agency / Agency Pro** (pricing A$99 / A$299).

**Phase 1 (the built product):** 12 sprints. Sprints 1–6 are built and have had UI-fix passes
applied. Sprints 7–12 are not yet built (per-sprint UI-review cadence agreed). The live app is
running and being debugged screen-by-screen (see Section 6 for the most recent live bugs).

**Phase 2 (designed, not yet built):** a 7-layer intelligence platform captured in the LLD,
hardened through 36 conflict-audit passes, with a 14-screen prototype. Phase 2 build = 9
sprints, ~34 weeks at weekend pace, Sprint 1 (Platform Foundation) is a hard prerequisite and
cannot be reordered.

---

## 3. CANONICAL FILES TO READ (read these — ignore the dated `-vN.NN` drafts)

The outputs directory contains many historical versioned drafts (e.g.
`visibleau-prototype-v2.59.jsx`, `sri-visibleau-sprint-6-prompt-v1.16.md`). **Do NOT read
those.** Always use the unversioned canonical filename, which is the latest. The list below is
the authoritative set.

### 3a. Read FIRST — foundational context (read in this order)
1. `visibleau-prd-v1.15.md` — Product Requirements Document (the what/why; tiers, features,
   pricing, scoring model). **(Large.)**
2. `02-engineering/sri-visibleau-foundations.md` — canonical Foundations (schema conventions,
   shared types, auth/RLS patterns). Also at `visibleau-foundations-v1.12.md`.
3. `CLAUDE.md` — the build design doc / engineering rules Claude Code follows (model selector,
   Inngest paths, RLS, audit-job error handling, etc.). Also at `visibleau-CLAUDE-v1.23.md`.
4. `02-engineering/sri-visibleau-architecture-overview.md` — architecture overview. Also at
   `visibleau-architecture-overview-v1.6.md`.

### 3b. Phase 2 LLD — the primary design artifact (CURRENT)
5. `visibleau-7layer-lld.md` — **Phase 2 7-layer Low-Level Design, currently v8.55.** 37
   `CREATE TABLE`s, 16 GAPs, 25 Inngest functions. This has been through **36 conflict-audit
   passes**; the changelog at the top of the file documents every fix (v8.xx entries) — read
   the changelog block first to understand decisions already made. **(Very large, ~8,600 lines.)**

### 3c. Prototypes (CURRENT)
6. `visibleau-prototype.jsx` — **Phase 1 prototype (canonical).** Source of truth for Phase 1
   screen designs (includes the `AuditRunning` progress screen, audit results, brand detail,
   action center, billing, etc.).
7. `visibleau-prototype-phase2.jsx` — **Phase 2 prototype, 14 screens.** Aligned to the LLD
   through the recent bidirectional audits. The header comment lists prototype FIX 1–4
   (status enum, agent-readiness dimensions, text-corruption repair, lucide import hygiene).

### 3d. The 12 Phase 1 sprint prompts (CURRENT — in the sprint-prompts subfolder)
8. `03-sprint-prompts/sri-visibleau-sprint-1-prompt.md` … `…sprint-12-prompt.md` — the 12
   canonical, multi-pass-audited Claude Code sprint prompts (Platform → audit engine →
   scoring → results UI → vertical packs → recommendations → technical audit → narrative →
   scheduling → onboarding/billing → polish → retention/admin).
9. `03-sprint-prompts/sri-visibleau-sprint-prompts-index.md` — index/overview of the 12 sprints.
   (Ignore `sri-visibleau-sprint-12-prompt.md.bak`.)

### 3e. Phase 1 UI-fix prompts (applied / in-progress, Sprints 1–6 screens)
These are the screen-by-screen UI correction prompts already written for the built app:
- `visibleau-ui-fix-brand-detail.md`
- `visibleau-ui-fix-audit-results-sprint6.md`
- `visibleau-ui-fix-brands-list.md`
- `visibleau-ui-fix-action-center.md`
- `visibleau-ui-fix-action-detail.md`
- `visibleau-ui-fix-vertical-packs.md`
- `visibleau-ui-fix-vertical-pack-detail.md`
- `visibleau-ui-fix-overview-minor.md`
- `visibleau-ui-fix-audit-detail-minor.md`
- `visibleau-ui-fix-audit-breadcrumb.md`
- `visibleau-ui-fix-billing-breadcrumb.md`
- `visibleau-ui-fix-brands-server-error.md`
- Earlier Sprint 4 fix set: `visibleau-sprint4-dashboard-fix.md` (+ `-v2`, `-v3`),
  `visibleau-sprint4-brands-fix.md` (+ `-v2`), `visibleau-sprint4-signin-fix.md`,
  `visibleau-sprint4-theme-fix.md`, `visibleau-sprint4-billing-fix.md`,
  `visibleau-sprint4-audit-running-fix.md`.

### 3f. Live-app bug-fix prompts (MOST RECENT — see Section 6)
- `fix-run-audit-new-uuid-error.md` — fixes the "Run audit → `audits.id = 'new'`" UUID crash.
  **(Already resolved — the button now creates the audit and navigates correctly.)**
- `fix-audit-zero-engines.md` — fixes "Querying 0 engines × … = 0 LLM calls" (tier→engine
  resolution returning an empty list). **(Most recent open item — pending application.)**

### 3g. Supporting engineering docs (read when relevant to the task)
- `visibleau-local-stack-guide.md` + `visibleau-local-stack-conflict-audit.md` — local dev
  stack (PostgreSQL 18, no Docker).
- `visibleau-better-auth-setup.md` + `visibleau-better-auth-conflict-audit-v3.md` — Better
  Auth migration (replaced Clerk).
- `visibleau-external-services-guide.md` — third-party service setup.
- `visibleau-citation-diagnosis-spec.md` — citation-failure diagnosis spec.
- `visibleau-claude-code-reading-order.md` — Claude Code reading order for the build.
- Test specs live in `04-test-specs/` and the `SPRINTn-QA-FEATURE-DOC.md` / `SPRINTn-*-E2E.md`
  files at the top level.

---

## 4. The conflict-audit methodology (this is the core ongoing activity)

Most sessions are **conflict-audit passes** on the Phase 2 LLD and prototype. The established
method — follow it exactly:

1. Read the Phase 1 sprint prompts, CLAUDE.md, Foundations, the **current LLD**, and (since
   pass 33) the **Phase 2 prototype**.
2. Pick a **genuinely fresh angle** each pass (do not repeat a prior pass's angle — the LLD
   changelog lists what has already been checked).
3. Find conflicts. **For each conflict, FIRST assess which document is authoritative**
   (usually: the LLD schema is canonical for data shapes/enums; the prototype is canonical for
   UI/UX layout; Phase 1 sprint prompts are canonical for already-built behavior). **Then fix
   the conflict in the correct document** — sometimes that's the LLD, sometimes the prototype.
4. **Version-bump the LLD** (e.g. v8.55 → v8.56) with a detailed changelog entry describing the
   conflict, the authoritative-document assessment, the fix, and what was confirmed clean.
   When the prototype is edited, update its header fix-note too.
5. **Verify before presenting:** 37 `CREATE TABLE`s intact, all 16 GAPs present, `serve()`
   registers 25/25 Inngest functions, no cron collisions, and the prototype's braces/parens
   balance (global `{`==`}` and `(`==`)`; the naive scanner shows false negatives from braces
   inside strings/JSX, so also check edited regions individually).
6. `present_files` the changed document(s).

**Gotcha learned the hard way:** when writing a changelog/fix-note that *describes* a corrupted
string you just fixed (e.g. a bad find-replace), do NOT reproduce the corrupted literal in the
note — it re-introduces the very string future greps look for. Describe the change in prose
instead.

---

## 5. Key locked facts (so you don't re-litigate settled decisions)

- 37 tables, 16 GAPs, 25 Inngest functions (serve() = 25/25). These counts are invariants —
  if a pass changes them, something is wrong unless the change is the explicit point of the pass.
- **Tiers & gates:** Journeys = Agency+ (regated from Growth+ in v8.19). Competitors: Growth=1,
  Agency=3, Agency Pro=unlimited. Engine counts: Free = 2 engines (ChatGPT + Perplexity), all
  paid tiers = 4 (`TIER_ENGINES` in `lib/llm/tier-engines.ts` is the single source of truth —
  never hardcode 4).
- **agent_readiness_scores:** 5 dimensions (Technical Accessibility, Entity Clarity, Claim
  Verifiability, Category Authority, Task-Fit Signals) × /20 = /100. Append-only. This is
  distinct from Phase 1 `technical_audits` (8 sub-scores /18,/16…). Do not conflate them.
- **Route params:** PAGE routes use `[brandId]`; API routes use `[id]`. These are separate
  Next.js route trees and must NOT be unified (RP-01).
- **Status enums:** `remediation_tasks.status` = open|in_progress|ready_for_review|complete|
  wont_fix (NOT 'done'). `workflow_runs.status` = scheduled|running|completed|failed (note '-ed').
  `audits.status` uses 'complete' (no '-d'). TEXT enums have NO CHECK constraints — validation
  is app-layer Zod only (Phase 1 convention); CHECK is used only for RLS.
- **Report status is UI-derived** (no column): `pdf_url` NULL → generating; set + `email_sent_at`
  NULL → ready; `email_sent_at` set → published.
- **Inngest event naming:** internal events use slash (`audit/complete`); external webhook
  delivery uses dots (`audit.completed`). Internal slash events must NOT appear in VALID_EVENTS.
- **Retention:** `audit-data-retention.ts` (Sunday cron) handles audits (12mo) + extends to
  `crawler_visit_logs` (90d) and `brand_web_mentions` (180d) during Phase 2 Sprints 6/5.

---

## 6. Most recent activity (live Phase 1 app debugging)

The last few turns moved from doc-auditing to **debugging the running app** (built via Claude
Code from the Phase 1 sprint prompts). Two bugs surfaced on the **Run audit** flow:

1. **`audits.id = 'new'` crash (RESOLVED).** Clicking Run audit hit the audit-detail page with
   `auditId = "new"`, which Postgres rejected as an invalid UUID. Fix prompt:
   `fix-run-audit-new-uuid-error.md` (create-then-redirect to the returned `auditId`, plus a
   UUID guard → `notFound()` on the audit routes). The button now navigates correctly to the
   progress page.
2. **"0 engines / 0 LLM calls" (OPEN — pending Claude Code application).** On an Agency-tier
   brand the progress page shows "Querying 0 engines × 10 prompts × 5 runs = 0 LLM calls" and
   sits at 0%. Root cause: the tier→engine resolution is returning an **empty** list (not even
   Free's 2), so the audit job has nothing to iterate. The progress screen itself is correct
   per the Phase 1 prototype's `AuditRunning` — it's truthfully rendering a row created with 0
   engines. Fix prompt: `fix-audit-zero-engines.md` (investigate tier value vs `TIER_ENGINES`
   keys / org-join / empty default; fix at source; never let an empty engine list reach the
   row; also fixes a cosmetic "10prompts" missing-space in the heading). **This is the most
   likely next thing Sri will pick up.**

If Sri reports a new live-app bug: diagnose from the actual error text, cross-check the
relevant sprint prompt + prototype to find intended behavior, decide whether the bug is in the
built code vs a spec gap, and (when asked) write a Claude Code fix prompt that tells Claude Code
to **investigate the real files first** (don't hardcode file paths/response shapes) and to
verify with typecheck + lint + the relevant test + the manual flow.

---

## 7. How to start your first response in the new chat

1. Confirm you have read this handoff and which canonical files you've loaded.
2. Ask Sri what they want to do next (continue Phase 2 LLD/prototype conflict audits? apply the
   open `fix-audit-zero-engines.md`? begin Phase 2 sprint-prompt design? fix another live
   screen?).
3. Respond in English then Telugu, and hold to the Performance / Security / Scalability / UX
   non-negotiables on everything.
