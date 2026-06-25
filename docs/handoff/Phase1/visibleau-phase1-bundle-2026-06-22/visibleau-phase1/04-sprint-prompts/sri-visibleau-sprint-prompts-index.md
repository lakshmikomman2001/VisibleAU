# VisibleAU Sprint Prompts — Master Index

**Version:** 1.1
**Date:** 12 May 2026
**Purpose:** Single index for navigating the 12 sprint prompts. Each sprint lives in its own file for Claude Code to load just the sprint it needs.

---

## How to use this index

1. **At the start of any sprint:** Claude Code reads `CLAUDE.md` (project-level grounding) + the relevant sprint prompt file from this index.
2. **Operator workflow:** Sri opens this index → finds the active sprint → opens that sprint's file → pastes the "Claude Code prompt" section into Claude Code.
3. **All sprint prompts share a template:** Goals → Prereqs → Deps → Structure → Schema → APIs → Frontend → Tests → Acceptance → Pitfalls → Handoff. Navigate to the section you need.

---

## Sprint roadmap

| # | Sprint | Effort | File | Goal in one line |
|---|---|---|---|---|
| 1 | Project Foundation | 28-41h | `sri-visibleau-sprint-1-prompt.md` v1.1 | Multi-tenant Next.js + Clerk + Supabase RLS + Stripe products (incl. annual + one-off) + Drizzle + brand CRUD |
| 2 | Single-Engine Audit + Layer 1+4 cache | 18-22h | `sri-visibleau-sprint-2-prompt.md` v1.1 | ChatGPT audit + mock LLM + response cache + citation detection efficiency + Vercel AI SDK |
| 3 | Multi-Engine + Scoring + Layer 2 | 52-65h | `sri-visibleau-sprint-3-prompt.md` v1.1 | 4 engines + 5-dim scoring + Wilson 95% CIs + tier-aware model selector + canary prompts |
| 4 | First UI Layer | 56-72h | `sri-visibleau-sprint-4-prompt.md` v1.2 | 11 prototype screens + basic PDF/CSV/JSON exports (white-label → S9) |
| 5 | AU Vertical Packs | 30-40h | `sri-visibleau-sprint-5-prompt.md` v1.1 | 336 curated AU prompts (Tradies 124 + Allied Health 104 + SaaS 108) + topic field |
| 6 | Action Center | 30-40h | `sri-visibleau-sprint-6-prompt.md` v1.1 | **11 universal action types with research citations** (Tinuiti/SE Ranking/Princeton GEO/HubSpot AEO/Profound/TEAM LEWIS) + 12 anti-patterns + tier gating |
| 7 | **Module 5b Technical AI Infrastructure** | **130-180h** | `sri-visibleau-sprint-7-prompt.md` v2.0 | **llms.txt + robots.txt + schema audit + SSR + answer capsules + 27 AI bots + AU Brand & Entity + 47 citability methods + 8 negative signals + 8 prompt injection patterns + 50-site corpus (Spearman > 0.7 gate)** |
| 8 | Local SEO + Drift + Exports + Webhooks | 60-80h | `sri-visibleau-sprint-8-prompt.md` v2.0 | Module 4 Local SEO (GMB + 4 AU directories + NAP) + Wilson CI drift detection + SARIF/JUnit/GHA live + 6-channel webhooks + confidence labels at audit-result |
| 9 | **Agency Tier** | 30-40h | `sri-visibleau-sprint-9-prompt.md` v2.0 | Multi-brand workspace + white-label PDF + client portal (limited view) + bulk operations (CSV/GA4/Looker) + scheduled audits + weekly digest |
| 10 | **Onboarding + Sample Audit + Stripe** | 40-50h | `sri-visibleau-sprint-10-prompt.md` v2.0 | Self-serve flow + **sample audit (1 engine ChatGPT, 5 prompts, ~90s, ~A$0.10)** + Stripe Checkout + Customer Portal + webhooks (idempotent) + cancellation retention |
| 11 | Polish + Landing + Methodology | 10-15h | `sri-visibleau-sprint-11-prompt.md` v1.1 | Landing page + pricing polish + onboarding polish + error states + `/methodology` page (47 citability methods) + 3-4 Loom demos |
| 12 | Launch Readiness | 24-30h | `sri-visibleau-sprint-12-prompt.md` v1.1 | Sentry + alerting + backups + load test + security audit + legal docs + **5-10 beta customers** + **SOC 2 Type 1 kickoff plan** + production cutover |
| | **Total** | **528-689h** | | Active build effort. Sri pace: ~8 hrs/week = **66-86 weeks (~15-20 months)**. |

---

## Sprint dependencies

```
Sprint 1 (Foundation: Supabase + RLS + Stripe products + brand CRUD)
   ↓
Sprint 2 (Single-engine audit + mock LLM + Layer 1+4 cost-control)
   ↓
Sprint 3 (Multi-engine + 5-dim scoring + tier-aware model selector + Layer 2 canary)
   ↓
Sprint 4 (UI: 11 screens + basic PDF/CSV/JSON)
   ↓
Sprint 5 (AU vertical packs: 336 prompts)
   ↓
Sprint 6 (Action Center: 11 universal action types with research citations)
   ↓
Sprint 7 (Module 5b: 5 core features + 10 OSS-derived + 50-site corpus Spearman > 0.7)
   ↓
Sprint 8 (Local SEO + Drift + Exports + 6-channel Webhooks)
   ↓
Sprint 9 (Agency tier: multi-brand + white-label + client portal + bulk + scheduled audits)
   ↓
Sprint 10 (Onboarding + sample audit + Stripe Checkout + Customer Portal)
   ↓
Sprint 11 (Polish + landing + /methodology + Loom demos)
   ↓
Sprint 12 (Launch: Sentry + beta + SOC 2 kickoff + cutover)
```

---

## Sprint dependencies

```
Sprint 1 (Foundation)
   ↓
Sprint 2 (Audit, 1 engine) — depends on Sprint 1 multi-tenancy
   ↓
Sprint 3 (Multi-engine + scoring) — depends on Sprint 2 LLM layer
   ↓
Sprint 4 (UI) — depends on Sprint 3 rich audit payload
   ↓
Sprint 5 (Vertical packs) — depends on Sprint 4 wizard step 2
   ↓
Sprint 6 (Action Center) — depends on Sprint 5 categorized prompts
   ↓
Sprint 7 (Corpus + Local SEO) — depends on Sprint 6 (validates recommendations work)
   ↓
Sprint 8 (Drift + Exports) — depends on Sprint 7 corpus (regression suite)
   ↓
Sprint 9 (Scheduled audits) — depends on Sprint 8 drift detection (auto-detects drift on schedule)
   ↓
Sprint 10 (Billing) — depends on Sprint 9 tier limits (Stripe enforces them)
   ↓
Sprint 11 (Polish + Landing) — depends on Sprint 10 billing (pricing CTAs work)
   ↓
Sprint 12 (Launch) — depends on everything
```

**Dependencies are strict — sprints must complete in order.** Skipping creates rework.

---

## Critical paths

These three sprints have the highest blast radius if rushed:

1. **Sprint 1** — sets the multi-tenancy pattern, folder structure, and 404-not-401 convention. Mistakes here propagate to every subsequent sprint.
2. **Sprint 3** — `model-selector.ts` defines the Agency Pro value prop. The 72-combination test suite prevents silent regression.
3. **Sprint 10** — Stripe webhook idempotency. Without it, duplicate webhooks cause tier flapping and customer support nightmares.

Allocate extra review time for these three.

---

## What's NOT in any sprint (out of v1 scope)

These were considered and explicitly deferred or excluded:

| Item | Decision | Where to revisit |
|---|---|---|
| Microsoft Copilot engine | Deferred to v1.1 (Q3 2026) | Sprint 13 (v1.1 kickoff) |
| Google AI Overviews engine | Deferred to v1.1 | Sprint 13 |
| DeepSeek engine | Deferred to v1.2 (Q4 2026) | Sprint 14 |
| Grok engine | Deferred to v1.2 | Sprint 14 |
| TikTok citation tracking | Deferred to v1.1 | Sprint 13 |
| Opus model on Agency Pro | Deferred to v1.1 | Sprint 13 |
| White-label / agency rebrand | Out of scope | v2 consideration |
| Self-hosted deployment | Out of scope | Not planned |
| Public API | Out of scope | v2 consideration |
| Mobile app | Out of scope | Web responsive only |
| Browser extension | Out of scope | Not planned |
| Custom prompts | Out of scope | Vertical packs only |
| Multi-workspace per org | Out of scope for v1 | v2 |

If a sprint prompt seems to want one of these, flag the conflict to Sri.

---

## Acceptance gate model

Each sprint has its own acceptance criteria (in the sprint file's §11 or §12). The pattern:

1. All tests pass: unit + integration + E2E
2. Lint + typecheck pass
3. Sprint-specific manual QA pass
4. CI green on a PR to main
5. Sri reviews + signs off

**Do not move to Sprint N+1 until Sprint N's acceptance gate passes.**

---

## What changes between sprints

Stable across all 12:
- Tech stack (no library swaps)
- Multi-tenancy pattern (404 not 401)
- Folder structure (additive only)
- Schema (additive only — Drizzle migrations)
- Anti-patterns (additive)

Per-sprint additions:
- New tables / columns
- New API routes
- New components
- New env vars
- New deps (additive)
- New Inngest functions

Never changes:
- 404 cross-org pattern
- DIMENSION_WEIGHTS (25/25/20/15/15)
- Commodified context score = 25 (NOT 0)
- Mock LLM canonical 4 scenarios

---

## Quick lookup: where do I add X?

- **New database table** → Sprint that needs it (each sprint adds its own tables)
- **New API route** → `app/api/<resource>/route.ts`
- **New Inngest function** → `inngest/functions/<name>.ts` + register in `app/api/inngest/route.ts`
- **New component** → `components/domain/<feature>/<name>.tsx`
- **New utility function** → `lib/<domain>/<name>.ts`
- **New environment variable** → `.env.local` + production env in Vercel
- **New dep** → `pnpm add <name>` after operator approval

---

## Estimated timeline

At 8 hrs/week (Sri's weekend pace):

| Sprint | Cumulative weeks | Cumulative date |
|---|---|---|
| Sprint 1 | 4-5 weeks | June 2026 |
| Sprint 2 | 5-7 weeks | June-July 2026 |
| Sprint 3 | 11-14 weeks | August-September 2026 |
| Sprint 4 | 18-23 weeks | October-November 2026 |
| Sprint 5 | 22-28 weeks | November-December 2026 |
| Sprint 6 | 26-33 weeks | January 2027 |
| Sprint 7 | 29-37 weeks | February 2027 |
| Sprint 8 | 32-41 weeks | March 2027 |
| Sprint 9 | 35-44 weeks | March-April 2027 |
| Sprint 10 | 37-46 weeks | April 2027 |
| Sprint 11 | 38-48 weeks | May 2027 |
| Sprint 12 | 41-52 weeks | May-June 2027 |

**Honest timeline: ~10-13 months from Sprint 1 start to launch.** This is a v1 with full multidimensional scoring and 4 engines. Sri can compress by:

- Skipping Sprint 7 corpus initially (defer to v1.1) → save 20-26h
- Skipping Sprint 8 drift detection initially → save 24-30h
- Launching at Sprint 6 (no Local SEO, no drift, no scheduled audits) → save 70-96h ≈ 9-12 weeks

Trade-off: launching earlier means manual audits only. Drift detection + scheduled audits are the differentiation vs the "run once and forget" competitors.

---

## Per-sprint changelog

Each sprint file maintains its own changelog. When updating a sprint prompt:
1. Bump version (v1.0 → v1.1)
2. Add changelog entry at bottom
3. Update this index if scope changed

---

## File manifest

```
sri-visibleau-sprint-prompts-index.md     ← this file (master index) v1.1
sri-visibleau-sprint-1-prompt.md          v1.1 (28-41h)
sri-visibleau-sprint-2-prompt.md          v1.1 (18-22h)
sri-visibleau-sprint-3-prompt.md          v1.1 (52-65h)
sri-visibleau-sprint-4-prompt.md          v1.2 (56-72h)
sri-visibleau-sprint-5-prompt.md          v1.1 (30-40h)
sri-visibleau-sprint-6-prompt.md          v1.1 (30-40h)
sri-visibleau-sprint-7-prompt.md          v2.0 (130-180h)   ← biggest sprint
sri-visibleau-sprint-8-prompt.md          v2.0 (60-80h)
sri-visibleau-sprint-9-prompt.md          v2.0 (30-40h)
sri-visibleau-sprint-10-prompt.md         v2.0 (40-50h)
sri-visibleau-sprint-11-prompt.md         v1.1 (10-15h)
sri-visibleau-sprint-12-prompt.md         v1.1 (24-30h)
```

---

## Changelog

- v1.1 (12 May 2026): **Conflict-resolution update per 29-conflict audit.** All 12 sprint prompts revised. Effort totals corrected: 320-411h → 528-689h (was undercounting Sprint 7 Module 5b scope by 5-7x). Critical sprint scope changes: Sprint 7 v2.0 = Module 5b + OSS additions (was Local SEO); Sprint 8 v2.0 = Local SEO + drift + webhooks (was drift+exports only); Sprint 9 v2.0 = Agency tier (was scheduled audits); Sprint 10 v2.0 = Onboarding + sample audit + Stripe (was Stripe only). Sprint 1 v1.1 adopts Supabase + RLS. Sprint 2 v1.1 adopts Vercel AI SDK + response cache + citation detection efficiency. Sprint 3 v1.1 adds canary prompts. Sprint 6 v1.1 = 11 universal action types with research citations (was 25 per-vertical templates). Sprint 11 v1.1 adds /methodology + Loom demos. Sprint 12 v1.1 adds beta cohort + SOC 2 kickoff. Estimated timeline: ~15-20 months at weekend pace (was ~10-13).
- v1.0 (12 May 2026): Initial master index. Drafts all 12 sprint prompts up front (deviates from CLAUDE.md v1.0's "drafted as each prior sprint completes" — superseded). CLAUDE.md v1.1 reflects this change.
