# VisibleAU Master Bundle (Post-Conflict-Resolution + Second-Pass-Fix + Third-Pass-Fix)

**Bundle date:** 13 May 2026
**Bundle version:** third-pass-fix v1 (over second-pass-fix from 13 May, over post-conflict-resolution from 12 May)
**Project:** VisibleAU — multi-tenant SaaS for AI search visibility auditing (AU SMB market)
**Status:** Sprint 1 ready to start
**Operator:** Sri (Sydney, ~8 hrs/week weekend pace)

This bundle contains the latest version of every document. It adds 8 third-pass-fix corrections on top of the second-pass-fix bundle from earlier 13 May. The third pass was Sri's explicit "one more clean audit" request; it caught cascade regressions from the second-pass N1/N3 fixes that didn't propagate fully through every doc surface.

---

## What's new since the second-pass-fix bundle (earlier 13 May 2026)

The second-pass-fix bundle resolved 17 implementation-level gaps and PRD-internal contradictions surviving the 29-conflict audit. A **third-pass audit (Sri's explicit "one more clean audit" request)** found 8 more issues — mostly cascade regressions from my own N1/N3 fixes that I didn't propagate. All 8 fixed. See `06-conflict-resolution/third-pass-fix-audit.md` for full detail.

**Key fixes (third pass):**

- **B1 (critical)** — N1 fix added `TIER_ENGINES` but my updated Sprint 3 §0 goal statement, Sprint 3 §11 handoff step 6, and Sprint 4 audit-running + audit-results-rich + per-engine breakdown all still hardcoded "4 engines × 200 calls." Free tier audits would have rendered wrong UI. All now templated from `audit.engineCount`.
- **B2 (critical)** — N3 design said "+ technical audit badge" alongside multidim audit but `technical_audits` schema had no `audit_id` FK; join would have been a fragile time-window heuristic. Added FK + index; added badge column spec to Sprint 4 audit-list.
- **B3 (high)** — Tier-aware audit description propagated to HANDOFF tagline + constraint table, Sprint 11 landing copy, and 4 prototype locations (audit-running comment, wizard tutorial, landing how-it-works, docs page methodology).
- **B4 (high)** — Foundations "50-prompt audit" wording (fossil of the PRD §8 N8 mistake) + CLAUDE.md cost-target line both corrected to reflect tier-aware engine model + N3 combined budget.
- **B5 (high)** — 3 more broken PRD section refs: Sprint 6 §11 + §11.4 → §8 Module 5 + §8.5 anti-pattern table; Architecture §11.5 → §10 Layer 3.
- **B6 (medium)** — Sprint 9 TIER_AUDIT_LIMITS now documents the shared multidim+technical quota model (one click = one slot; technical_audits is satellite).
- **B7 (low)** — Doc-index TL;DR still pointed readers to a non-existent combined sprints file; now points to HANDOFF + individual sprint files.
- **B8 (low)** — Sprint 6 §0 PRD reference bumped v1.14 → v1.15; Foundations ref v1.9 → v1.10.

**Cumulative document state:** PRD v1.15, CLAUDE.md v1.4, Foundations v1.11, Architecture v1.6, Sprint 1 v1.1, Sprint 3 v1.3, Sprint 4 v1.3, Sprint 6 v1.2, Sprint 7 v2.2, Sprint 8 v2.1, Sprint 9 v2.1, Sprint 10 v2.1, Sprint 11 v1.2, Sprint 12 v1.2.

**Honest framing on what the third pass revealed:** my second-pass N1/N3 fixes were structurally correct but didn't propagate through every reference. CLAUDE.md §12's "verification before claim" rule catches exactly this. I should have grep-propagated the changed canonical statements after the second pass. The third pass shipped — but the lesson is the audit-pass pattern itself is finite: each pass tends to surface ~50% of remaining drift, so a fourth pass might find 3-4 more low-severity items. Sprint 1 is genuinely ready now; further passes are diminishing returns.

---

## What was new in the second-pass-fix bundle (13 May 2026)

A second-pass audit (13 May) found 17 issues surviving the 29-conflict resolution — implementation-level gaps (tier-engine filter, schema default), PRD-internal contradictions (4 prompt-count/price/directory mismatches), broken section refs, doc-set staleness. All 17 are fixed. See `06-conflict-resolution/second-pass-fix-audit.md`.

**Key second-pass fixes:**

- **N1 (Sprint 3)** — Added `lib/llm/tier-engines.ts` with `TIER_ENGINES` allowlist. Free runs 100 calls (2 engines); paid runs 200 (4 engines).
- **N2 (Foundations)** — Schema `organizations.tier` default `'starter'` → `'free'`.
- **N3 (Sprint 7 + CLAUDE.md)** — "Run Audit" triggers both multidim + technical audits in parallel; shared quota; <US$3.50 combined budget.
- **N5 (Sprint 10)** — First-audit-after-signup honours new user's tier; pre-signup sample audit is the ChatGPT-only teaser.
- **N6 (Sprint 11)** — Stale sample-audit infrastructure stripped; Sprint 10 owns it cleanly.
- **N7-N10 (PRD)** — 4 PRD-internal contradictions cleaned (one-off audit A$99→A$299; prompt count 50→10; AU directory list aligned; §8.5 engine count corrected).
- **N11 (Sprints 8, 11, 12)** — 3 broken PRD section references corrected.
- **N16 (doc-index)** — Staleness banner added.
- **All other fixes (N4, N8, N12, N13, N14, N15, N17)** — see audit doc.

---

## What was new in the 12 May bundle (post-conflict-resolution v1)

The previous bundle (`visibleau-bundle-latest-2026-05-12.zip`) shipped sprint prompts v1.0. A 29-conflict audit against PRD v1.14 surfaced significant drift between sprint prompts and PRD canonical. Sri greenlit full conflict resolution; the 12 May bundle contained the corrected docs.

**Key changes (12 May):**

- CLAUDE.md → v1.2 (prices corrected to A$99/A$299, Supabase + RLS, Vercel AI SDK, full 4-layer cost-control architecture)
- All 12 sprint prompts revised (v1.1 to v2.0 depending on scale of change)
- Four complete sprint rewrites: Sprint 7 (Module 5b), Sprint 8 (Local SEO + drift + webhooks), Sprint 9 (Agency tier), Sprint 10 (Onboarding + sample audit + Stripe)
- Total effort estimate corrected: 320-411h → **528-689h** (Sprint 7 was undercounted 5-7x)
- Timeline at weekend pace: ~10-13 months → **~15-20 months**

See `06-conflict-resolution/visibleau-conflict-audit-prd-vs-sprints.md` for the 29-conflict detail and `06-conflict-resolution/second-pass-fix-audit.md` and `06-conflict-resolution/third-pass-fix-audit.md` for the follow-up audits.

---

## Quick start

**At the start of Sprint 1:**
1. Extract this bundle to `C:\startup\VisibleAU\`
2. Move `CLAUDE.md` to repo root (auto-loads in Claude Code)
3. Open `03-sprint-prompts/sri-visibleau-sprint-1-prompt.md` (v1.1)
4. Scroll to §10 "Claude Code prompt (paste this when starting Sprint 1)"
5. Paste that block into Claude Code

For every subsequent sprint: repeat with the next sprint's prompt file.

**To bring a new Claude chat up to speed:** see `HANDOFF.md` at this bundle's root. It's a self-contained briefing document.

---

## Bundle contents

```
visibleau-master-bundle/
├── README.md                                    ← this file
├── HANDOFF.md                                   ← for new Claude chats (read this first)
├── CLAUDE.md                                    v1.2 — design doc (Claude Code auto-loads)
├── visibleau-prototype.jsx                      Babel-validated React, 44 screens (visual reference)
│
├── 01-product/                                  3 files
│   ├── sri-geo-aeo-prd-v1.md                    PRD v1.14 — canonical "what" and "why"
│   ├── sri-geo-aeo-final-research.md
│   └── sri-geo-aeo-community-research.md
│
├── 02-engineering/                              4 files
│   ├── sri-visibleau-foundations.md             v1.9 — folder structure + schema source of truth
│   ├── sri-visibleau-architecture-overview.md   v1.4 — architecture decisions + OSS posture
│   ├── sri-visibleau-multi-region-phase-2.md    v1.0 — multi-region rollout plan
│   └── sri-visibleau-doc-index.md               Doc set index
│
├── 03-sprint-prompts/                           13 files (post-conflict-resolution)
│   ├── sri-visibleau-sprint-prompts-index.md    v1.1
│   ├── sri-visibleau-sprint-1-prompt.md         v1.1 (28-41h)  — Supabase + RLS + correct prices
│   ├── sri-visibleau-sprint-2-prompt.md         v1.1 (18-22h)  — Vercel AI SDK + Layer 1+4 cost
│   ├── sri-visibleau-sprint-3-prompt.md         v1.1 (52-65h)  — Multi-engine + Layer 2 canary
│   ├── sri-visibleau-sprint-4-prompt.md         v1.2 (56-72h)  — UI; white-label PDF → S9
│   ├── sri-visibleau-sprint-5-prompt.md         v1.1 (30-40h)  — AU vertical packs + topic field
│   ├── sri-visibleau-sprint-6-prompt.md         v1.1 (30-40h)  — 11 universal action types
│   ├── sri-visibleau-sprint-7-prompt.md         v2.0 (130-180h) — Module 5b + OSS (biggest)
│   ├── sri-visibleau-sprint-8-prompt.md         v2.0 (60-80h)  — Local SEO + drift + webhooks
│   ├── sri-visibleau-sprint-9-prompt.md         v2.0 (30-40h)  — Agency tier
│   ├── sri-visibleau-sprint-10-prompt.md        v2.0 (40-50h)  — Onboarding + sample + Stripe
│   ├── sri-visibleau-sprint-11-prompt.md        v1.1 (10-15h)  — Polish + /methodology + Loom
│   └── sri-visibleau-sprint-12-prompt.md        v1.1 (24-30h)  — Launch + beta + SOC 2 kickoff
│
├── 04-test-specs/                               10 files
│   └── (Sprint 1-3 test specs unchanged from prior bundle)
│
├── 05-marketing-workflow/                       5 files
│   └── (operator-side workflow — not for Claude Code)
│
├── 06-conflict-resolution/                      1 file
│   └── visibleau-conflict-audit-prd-vs-sprints.md  — Full 29-conflict audit; provenance
│
└── 07-chatgpt-review/                           3 files
    ├── visibleau-chatgpt-review-assessment.md   — Claude's review of ChatGPT's killer-features
    ├── chatgpt-original-killer-features-and-pain-points.md
    └── chatgpt-original-market-research.md
```

**Total: 41 files.**

---

## Reading order for onboarding

If a fresh person (or fresh Claude Code session) needs to understand VisibleAU from scratch, ~45 minutes:

1. **`HANDOFF.md`** at this bundle's root (15 min) — self-contained briefing
2. **`CLAUDE.md`** at root (10 min) — design document
3. **`01-product/sri-geo-aeo-prd-v1.md`** skim (10 min) — product context
4. **`02-engineering/sri-visibleau-foundations.md`** skim (5 min) — engineering specifics
5. **`03-sprint-prompts/sri-visibleau-sprint-prompts-index.md`** (5 min) — build roadmap

---

## Latest versions

| Doc type | Latest version | Date |
|---|---|---|
| PRD | v1.15 | 13 May 2026 |
| Foundations | v1.11 | 13 May 2026 |
| Architecture | v1.6 | 13 May 2026 |
| Multi-region phase 2 | v1.0 | 9 May 2026 |
| Prototype | 1.14 (44 screens) | 13 May 2026 |
| Design doc (CLAUDE.md) | v1.4 | 13 May 2026 |
| Sprint prompts index | v1.1 | 12 May 2026 |
| Sprint 1 | v1.1 | 12 May 2026 |
| Sprint 2 | v1.1 | 12 May 2026 |
| Sprint 3 | v1.3 | 13 May 2026 |
| Sprint 4 | v1.3 | 13 May 2026 |
| Sprint 5 | v1.1 | 12 May 2026 |
| Sprint 6 | v1.2 | 13 May 2026 |
| Sprint 7 | v2.2 | 13 May 2026 |
| Sprint 8 | v2.1 | 13 May 2026 |
| Sprint 9 | v2.1 | 13 May 2026 |
| Sprint 10 | v2.1 | 13 May 2026 |
| Sprint 11 | v1.2 | 13 May 2026 |
| Sprint 12 | v1.2 | 13 May 2026 |
| Sprint test specs | v1.0-v1.4 per file | 7-9 May 2026 |
| Conflict audit (29-conflict) | 12 May 2026 | n/a |
| Second-pass-fix audit (17-item) | 13 May 2026 | n/a |
| Third-pass-fix audit (8-item) | 13 May 2026 | n/a |

---

## Locked technical decisions (do not change without operator approval)

These propagate from CLAUDE.md v1.2 and PRD v1.14:

- v1 engines: ChatGPT, Claude, Gemini, Perplexity (4 only); Free tier = ChatGPT + Perplexity only
- v1.1 adds: Microsoft Copilot, Google AI Overviews
- v1.2 adds: DeepSeek, Grok
- DIMENSION_WEIGHTS: frequency 25%, position 25%, sentiment 20%, context 15%, accuracy 15%
- `commodified` context score = 25 (NOT 0)
- 4 canonical mock LLM scenarios: `happy_path`, `no_mention`, `partial_failure`, `rate_limited`
- Cross-org access returns 404 (NOT 401)
- Multi-tenancy via Clerk Organizations + Supabase RLS (defense-in-depth)
- **AUD pricing (PRD §7):** Starter A$99, Growth A$299, Agency A$499, Agency Pro A$1,499
- One-off audit A$299 + annual billing 2 months free (10× monthly)
- Sample audit: 1 engine (ChatGPT), 5 prompts, 1 run, ~90s, ~A$0.10
- Stack: Next.js 15 + React 19 + Tailwind v4 + Drizzle + Supabase + Clerk + Stripe + Inngest + Resend + shadcn/ui + Vercel AI SDK + PostHog
- 4-layer cost-control: response cache (24-72h TTL by prompt+model), canary prompts (daily drift detection), tier-based provider routing, citation regex+entity efficiency
- Module 5b is the v1.3 differentiator (llms.txt, robots.txt, schema, SSR, answer capsules) — Sprint 7 scope, 130-180h
- 50-site validation corpus with Spearman > 0.7 as Sprint 7 acceptance gate

---

## What this bundle does NOT contain

- Source code (build starts at Sprint 1)
- Database (Supabase project provisioned during Sprint 1)
- Stripe products (created via Sprint 1 setup script)
- Clerk org (created during Sprint 1)
- Vertical pack prompts content (336 prompts authored during Sprint 5)
- 50-site corpus fixtures (50 JSON files authored during Sprint 7)
- 47 citability methods seed data (authored during Sprint 7)
- Production deployment artifacts (Sprint 12)
- Superseded document versions
- Audit history (32 rounds — canonical specs already incorporate fixes)
