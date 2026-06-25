# VisibleAU — Claude Code Document Reading Order

**Purpose:** Hand this to Claude Code at the start of every new session or sprint.
The rule is simple: **CLAUDE.md is always read first, every sprint, no exceptions.**
Then the sprint-specific docs listed below. Nothing else unless the sprint prompt says so.

**Conflict rule:** If anything in a sprint prompt conflicts with CLAUDE.md or Foundations,
**stop and flag it to Sri before writing any code.**

---

## BEFORE STARTING ANY SPRINT (one-time setup read)

Read these once, in order, before sprint 1 begins:

| # | File | What it is | Sections to focus on |
|---|------|------------|----------------------|
| 1 | `CLAUDE.md` v1.5 | Master design doc — stack, architecture, conventions, anti-patterns | All of it (~5 min) |
| 2 | `sri-visibleau-foundations.md` v1.12 | Engineering foundations — folder structure, schema, patterns | §2 (folder structure) + §3 (schema) |
| 3 | `sri-visibleau-architecture-overview.md` v1.6 | How the system fits together | All of it |
| 4 | `sri-geo-aeo-prd-v1.md` v1.15 | The full PRD — what we're building and why | §3–§7 (product, pricing, regions) |
| 5 | `sri-visibleau-sprint-prompts-index.md` v1.1 | Sprint roadmap, dependencies, critical paths | All of it |
| 6 | `visibleau-prototype.jsx` | 44-screen UI prototype — visual reference only, NOT production code | Skim for layout awareness |

**Do not skip steps 1–5. These are the source of truth for every decision.**

---

## PER-SPRINT READING ORDER

### SPRINT 1 — Project Foundation
*Goal: Multi-tenant Next.js + Clerk + Supabase RLS + Stripe products + Drizzle + brand CRUD*

| Order | File | Why |
|-------|------|-----|
| 1 | `CLAUDE.md` v1.5 | Always first |
| 2 | `sri-visibleau-foundations.md` v1.12 | §2 folder structure + §3 schema — source of truth |
| 3 | `sri-geo-aeo-prd-v1.md` v1.15 | §3–§7 product framing, pricing tiers, regions |
| 4 | `sri-visibleau-sprint-1-prompt.md` | The sprint spec |

---

### SPRINT 2 — Single-Engine Audit + Mock LLM + Cost Cache
*Goal: ChatGPT audit end-to-end + mock LLM mode + Layer 1+4 cost control*

| Order | File | Why |
|-------|------|-----|
| 1 | `CLAUDE.md` v1.5 | Always first |
| 2 | `sri-visibleau-foundations.md` v1.12 | §3 schema additions for `audits` + `citations` |
| 3 | `sri-visibleau-architecture-overview.md` v1.6 | §5–§7 LLM layer, audit job flow, mock mode rationale |
| 4 | `sri-visibleau-sprint-2-prompt.md` | The sprint spec |

---

### SPRINT 3 — Multi-Engine + Multidimensional Scoring
*Goal: 4 engines + 5-dim scoring + Wilson 95% CIs + tier-aware model selector*

| Order | File | Why |
|-------|------|-----|
| 1 | `CLAUDE.md` v1.5 | Always first |
| 2 | `sri-visibleau-foundations.md` v1.12 | §3 schema additions — multidimensional columns + confidence intervals |
| 3 | `sri-visibleau-architecture-overview.md` v1.6 | §11 tier-aware model selector commitment |
| 4 | `sri-geo-aeo-prd-v1.md` v1.15 | §10 multidimensional scoring spec + Wilson CI math |
| 5 | `sri-visibleau-sprint-3-backend-tests.md` | Defines the test surface for this sprint |
| 6 | `sri-visibleau-sprint-3-prompt.md` | The sprint spec |

---

### SPRINT 4 — First UI Layer (11 screens)
*Goal: 11 prototype screens become real React components*

| Order | File | Why |
|-------|------|-----|
| 1 | `CLAUDE.md` v1.5 | Always first |
| 2 | `visibleau-prototype.jsx` | 44-screen prototype — visual + UX reference. Implement 11 screens. NOT production code — re-implement with real data |
| 3 | `sri-visibleau-foundations.md` v1.12 | §2 folder structure for `app/(auth)/*` routes |
| 4 | `sri-visibleau-sprint-3-frontend-e2e-tests.md` | Visual + interaction test surface |
| 5 | `sri-visibleau-sprint-4-prompt.md` | The sprint spec |

---

### SPRINT 5 — AU Vertical Packs (336 prompts)
*Goal: Tradies (124) + Allied Health (104) + SaaS (108) prompt packs in DB*

| Order | File | Why |
|-------|------|-----|
| 1 | `CLAUDE.md` v1.5 | Always first |
| 2 | `sri-geo-aeo-prd-v1.md` v1.15 | §16 vertical pack content sources + ATTRIBUTIONS.md matrix |
| 3 | Existing `lib/audit/prompts.ts` from Sprint 2 | The 10-prompt inline arrays being replaced |
| 4 | `sri-visibleau-sprint-5-prompt.md` | The sprint spec |

---

### SPRINT 6 — Action Center
*Goal: 11 universal action types + 12 anti-patterns + confidence labels + tier gating*

| Order | File | Why |
|-------|------|-----|
| 1 | `CLAUDE.md` v1.5 | Always first |
| 2 | `sri-geo-aeo-prd-v1.md` v1.15 | §8 Module 5 (Action Center spec) + §8.5 anti-pattern table |
| 3 | `sri-visibleau-foundations.md` v1.12 | §3 `action_items` schema |
| 4 | `sri-visibleau-sprint-6-prompt.md` | The sprint spec |

---

### SPRINT 7 — Technical AI Infrastructure (Module 5b) ⚠️ LARGEST SPRINT
*Goal: llms.txt + schema audit + SSR + 47 citability methods + 50-site corpus (Spearman > 0.7)*

| Order | File | Why |
|-------|------|-----|
| 1 | `CLAUDE.md` v1.5 | Always first |
| 2 | `sri-geo-aeo-prd-v1.md` v1.15 | §8 Module 5b (5 core features) + §8.8 OSS additions + **§11 Sprint 7 expanded scope** + §16 OSS reference strategy |
| 3 | `visibleau-prototype.jsx` | Lines 2458–2870 (5 Module 5b screens + Brand & Entity + 47 citability methods page) |
| 4 | `sri-visibleau-sprint-7-prompt.md` | The sprint spec |

> ⚠️ **Read PRD §11 carefully before committing to a timeline.** Sprint 7 v2.0 is the biggest sprint by far (~130–180h). The OSS reference (`Auriti-Labs/geo-optimizer-skill`) is methodology reference only — do NOT import as a dependency.

---

### SPRINT 8 — Local SEO + Drift Detection + Exports + Webhooks
*Goal: AU Local SEO + Wilson CI drift + SARIF/JUnit/GHA exports + 6-channel webhooks*

| Order | File | Why |
|-------|------|-----|
| 1 | `CLAUDE.md` v1.5 | Always first |
| 2 | `sri-geo-aeo-prd-v1.md` v1.15 | §8 Module 4 (Local SEO) + §8 Module 7 (Notifications) + §11 Sprint 8 scope + §16 OSS additions |
| 3 | `visibleau-prototype.jsx` | Lines 2905–3188 (Local SEO + AU directories + Alerts pages) |
| 4 | `sri-visibleau-sprint-8-prompt.md` | The sprint spec |

---

### SPRINT 9 — Agency Tier
*Goal: Multi-brand workspace + white-label PDF + client portal + bulk ops + scheduled audits*

| Order | File | Why |
|-------|------|-----|
| 1 | `CLAUDE.md` v1.5 | Always first |
| 2 | `sri-geo-aeo-prd-v1.md` v1.15 | §8 Module 6 (Agency Dashboard) + §11 Sprint 9 + §16 OSS additions |
| 3 | `visibleau-prototype.jsx` | Lines 3189–3484 (Agency workspace + PDF builder + Bulk ops screens) |
| 4 | `sri-visibleau-sprint-9-prompt.md` | The sprint spec |

---

### SPRINT 10 — Onboarding + Sample Audit + Stripe Billing
*Goal: Self-serve signup → sample audit → Stripe Checkout + Customer Portal*

| Order | File | Why |
|-------|------|-----|
| 1 | `CLAUDE.md` v1.5 | Always first |
| 2 | `sri-geo-aeo-prd-v1.md` v1.15 | §7 Pricing Strategy (canonical prices + sample audit spec) + §7.6 A/B + §11 Sprint 10 |
| 3 | Stripe Checkout docs (live): stripe.com/docs/payments/checkout | Current Stripe API reference |
| 4 | Stripe webhook idempotency: stripe.com/docs/webhooks/best-practices | Critical — prevents tier flapping |
| 5 | `sri-visibleau-sprint-10-prompt.md` | The sprint spec |

> ⚠️ **Stripe webhook idempotency is a critical path item** — Sprint 10 is one of three highest blast-radius sprints. Without it, duplicate webhooks cause tier flapping and customer support nightmares.

---

### SPRINT 11 — Polish + Landing Page + Methodology
*Goal: Landing page + pricing polish + error states + /methodology page + Loom demos*

| Order | File | Why |
|-------|------|-----|
| 1 | `CLAUDE.md` v1.5 | Always first |
| 2 | `sri-geo-aeo-prd-v1.md` v1.15 | §11 Sprint 11 deliverables + §12 Go-to-Market (copy guidance) + §13 Success Metrics |
| 3 | `visibleau-prototype.jsx` | Marketing/landing variants |
| 4 | `sri-visibleau-sprint-11-prompt.md` | The sprint spec |

---

### SPRINT 12 — Launch Readiness
*Goal: Sentry + monitoring + load test + security audit + legal docs + 5–10 beta customers + SOC 2 kickoff*

| Order | File | Why |
|-------|------|-----|
| 1 | `CLAUDE.md` v1.5 | Always first |
| 2 | `sri-geo-aeo-prd-v1.md` v1.15 | §11 Sprint 12 checklist + §10 Security & compliance (SOC 2 + APP/GDPR) |
| 3 | Sentry Next.js integration docs (live) | Current Sentry API |
| 4 | OWASP Top 10 (current) | Security audit baseline |
| 5 | `sri-visibleau-sprint-12-prompt.md` | The sprint spec |

---

## QUICK REFERENCE — WHAT NEVER CHANGES

These are locked across all 12 sprints. If a sprint prompt seems to change them, stop and flag to Sri:

| Rule | Value |
|------|-------|
| Cross-org access | Always 404, never 401 |
| DIMENSION_WEIGHTS | 25 / 25 / 20 / 15 / 15 (fixed) |
| Commodified context score | 25 — NOT 0 |
| Mock LLM | Canonical 4 scenarios — do not change |
| Schema changes | Additive only via Drizzle migrations — never destructive |
| Folder structure | Additive only — never reorganise |
| Tech stack | No library swaps mid-build |

## CRITICAL PATH SPRINTS (allocate extra review time)

1. **Sprint 1** — sets multi-tenancy + 404 pattern + folder structure. Mistakes propagate everywhere.
2. **Sprint 3** — `model-selector.ts` defines the Agency Pro value prop. 72-combination test suite must pass.
3. **Sprint 10** — Stripe webhook idempotency. Non-negotiable.

## THREE THINGS THAT ARE OUT OF SCOPE FOR V1

If anyone asks for these, the answer is no until v1.1+:
- Microsoft Copilot / Google AI Overviews / DeepSeek / Grok engines
- Public API / white-label rebrand / self-hosted deployment
- Custom prompts (vertical packs only)
