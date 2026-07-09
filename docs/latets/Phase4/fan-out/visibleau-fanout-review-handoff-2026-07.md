# HANDOFF — Review of VisibleAU Fan-Out Documents

**For:** a fresh Claude reviewer chat (gate-check / critique role)
**From:** the spec/reviewer chat
**Date:** 5 July 2026
**Task:** critically review **two fan-out documents**, find conflicts/errors/gaps against the real canon, and produce a ready-to-paste Claude Code fix prompt for **every** issue found.

---

## 1. Your role
You are an independent **reviewer** in a multi-chat relay: a spec chat drafts, you gate-check, Claude Code applies to the repo (`C:\startup\VisibleAU\src\`). You have **no repo access** — review the documents against the attached canon. Be direct, no padding. Your working principle is **verify-before-claim**: grep/check the actual canon before asserting anything; do not trust memory or this handoff alone. **LLD wins over prototype on any conflict.**

## 2. VisibleAU in 60 seconds
AU-first GEO/AEO **AI-visibility auditing** micro-SaaS for Australian SMBs + agencies. Audits a brand's presence across ChatGPT/Claude/Gemini/Perplexity, scores it, and — the differentiator — tells them **what to fix** (the action layer). Solo founder (Sri), part-time, ~16 sprints shipped in 8 weeks, production-grade (real LLM APIs, Stripe, gov ABN, test automation). Go-to-market: **AU agencies first** (free audit on their client → white-label report → paid). Build status: **Phase 1 complete; Phase 2 complete through Sprint 4** (Reports). Canon authority = **Phase 2 LLD v8.70** + **prototype FIX17**.

## 3. The two documents under review (attach these to your chat)
1. **`visibleau-fanout-productisation-plan-2026-07.md`** — strategy/positioning: turn the existing query-fan-out capability into a headline metric ("AI Answer Coverage"), a demo, and an action link. Includes market case, competitive read, metric design, demo flow, build scope.
2. **`visibleau-fanout-visualization-ui-spec-2026-07.md`** — the Figma-style UI/interaction spec for the fan-out visualization (the demo centerpiece): the fan-out tree, coverage states, reveal motion, states, accessibility, data binding.

**Also attach for grounding** (so you can verify, not assume): the **v8.70 handoff bundle** (`visibleau-handoff-2026-07-04.zip` → `phase-2/visibleau-phase2-LLD-v8.70.md` and `phase-2/prototype/visibleau-phase2-prototype-FIX17.jsx`). Optional context: `visibleau-market-findings-action-plan-2026-07.md`, `visibleau-aeo-geo-market-analysis-2026-07.md`.

## 4. Grounding facts to verify against (spot-check these — don't take them on trust)
**The data model — `query_fan_out_results` (Phase 2, v8.70).** One row per sub-query. The UI spec must bind only to these real columns:
`audit_id` (FK, ON DELETE CASCADE), `brand_id`, `organization_id`, `original_prompt`, `original_prompt_id` (FK → `vertical_pack_prompts`, ON DELETE SET NULL), `engine`, `sub_query`, `sub_query_rank` (1=first), `brand_appeared` (BOOL), `brand_position` (INT, nullable), `content_similarity_score` (NUMERIC(4,3), 0–1), `above_threshold` (BOOL, `>0.88`), `run_at`. Also: `max_fan_out_sub_queries` **DEFAULT 12** (v3.0, was 8), and a stored **`coverage_ratio` NUMERIC(5,2)** (0–100). **Verify these column names/types exist in v8.70** — flag any invented field.

**Design system — FIX17 tokens** (theme-aware, flip on `[data-theme]`): `--layer-visibility` (#3b82f6 dark / #1d4ed8 light) + `-soft`; `--score-high` #22c55e / `--score-mid` #f59e0b / `--score-low` #ef4444; `--health-poor/moderate/good/great`; `--elevation-rest/-hover`; `--focus-ring`; `--glow-visibility`; step colors `--step-gap`/`--step-draft`; font **Geist/Inter**; component **`<ConfidenceBadge label="confirmed|likely|hypothesis" />`**; **`<LayerBadge layer="visibility" />`**. **Verify the spec uses real tokens/components** — flag anything not in FIX17. Note: fan-out is **not currently rendered in FIX17** (this is a net-new Visibility-layer surface), so there's no existing component to conflict with — but it must follow the system.

**Invariants to respect** (v8.70): 37 Phase 2 tables; `serve()=25/25` (no new Inngest function without breaking it); tier source = **`subscriptions.tier`** (never `organizations.tier`); **`assertBrandAccess(user, brandId)`** on brand-scoped reads; RLS on `organization_id` (USING + WITH CHECK); the **5-question Explainability Contract** with `confidenceLabel` on every output; percentages NUMERIC(5,2) 0–100; **Drizzle returns NUMERIC as JS strings → `Number()` coercion required** (silent-bug class).

**Market context** (directional, July 2026): rank ≠ AI citation (~68% of AI citations are outside the top 10; SEO-only misses ~88% of citation opportunities); AI fans 1 query → ~10–12 sub-questions, ~73% dynamic per search; **sub-query *generation* is commoditising** (free generators exist) — differentiation must be coverage + competitor overlay + action link + AU-local, not "we do fan-out."

## 5. Review lens — check for all of these
1. **Grounding accuracy.** Does every canon claim (table/column names, tokens, component names, invariants) match v8.70/FIX17? Flag drift or invented fields.
2. **Data-binding validity.** Can the UI spec actually be built from `query_fan_out_results` as it exists? Is anything specified that the data can't supply?
3. **The competitor-overlay data gap.** The spec flags that `query_fan_out_results` tracks only the *brand's* `brand_appeared`, not competitors' per sub-query — so competitor overlay needs new data. **Verify this flag is correct and that MVP doesn't depend on unbacked data.**
4. **Honesty / no over-claim.** Real denominator ("N of M", max 12)? Confidence labelling present (fan-out is dynamic)? "Simulated, not ground truth" acknowledged? Not sold as if fan-out itself is unique?
5. **Drizzle NUMERIC coercion.** Is `Number()` coercion called out for `coverage_ratio` / `content_similarity_score`?
6. **Non-negotiables** (Sri's first-class concerns): performance (indexing/N+1 on a high-volume table), security (RLS, `assertBrandAccess`), scalability, and **UX/accessibility** (ARIA, keyboard, color-not-sole-signal, responsive/mobile, loading/empty/error states). Are all states covered?
7. **The action link.** Does gap→fix wire into the *existing* remediation loop (recommendation → task → draft → approval → re-audit) rather than inventing a parallel one?
8. **Tier/cost.** Fan-out runs cost LLM spend (per engine × sub-queries). Is cost/tier-gating addressed? Does the feature respect `subscriptions.tier`?
9. **Strategic soundness.** Is the positioning right (differentiate on coverage+action)? Is the "productise fan-out **sooner** than multi-region because it upgrades the Phase-2 you're selling now" sequencing sound?
10. **Gaps / omissions.** Anything missing — analytics/tracking, empty-audit handling, white-label report parity, multi-prompt navigation, per-engine vs aggregate correctness?

## 6. Known flags already identified (confirm they're handled correctly; don't re-raise as new)
- Competitor overlay = fast-follow (data gap) — MVP ships the brand's own tree.
- Drizzle NUMERIC-as-string → `Number()` coercion.
- Denominator honesty ("N of M", `max_fan_out_sub_queries`=12).
- Confidence labelling (fan-out ~73% dynamic; don't present a single pull as certain).
- Simulated, not ground truth (every tool simulates; be transparent).
- Sub-query generation is commoditising → differentiate on coverage + action.
- Sequencing: do the productisation **sooner than multi-region** (compounds with go-to-market).

## 7. Sri's standards (apply throughout)
- **Verify-before-claim** — grep the real canon; never trust memory/handoff alone.
- **A ready-to-paste Claude Code fix prompt for EVERY issue found** — including LOW. Group related issues where sensible; scope each precisely (affected files/sections, exact change, verification greps/checks, constraints).
- **Performance, Security, Scalability, UX** are non-negotiable, first-class.
- **LLD wins over prototype** on conflict. **English only.** Direct, no padding. Do it right the first time.

## 8. Expected output
1. A **findings list by severity** (Critical / High / Moderate / Low), each: what, where (which doc + section), why it's an issue, grounded in the canon.
2. For **each** finding, a **ready-to-paste Claude Code fix prompt** (or a doc-edit instruction if it's a spec fix, not a code fix).
3. A short **verdict**: are the two documents ready to become a build sprint prompt, or what must change first.
4. Call out explicitly anything you **couldn't verify** against the attached canon (so it's checked against the repo).

---
*Note: these are design/spec documents, not built code. The enduring caveat is "canon ≠ built code" — where a claim depends on how something is actually wired in the repo (e.g., `coverage_ratio` computation, the remediation-loop hooks), flag it for verification via Claude Code rather than assuming the LLD and the build agree.*
