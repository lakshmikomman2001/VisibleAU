# HANDOFF — Review of the VisibleAU Prompt Intelligence Enhancement LLD (v1.5)

**For:** a fresh Claude reviewer chat (independent gate-check / critique role)
**From:** the spec/reviewer chat
**Date:** 5 July 2026
**Task:** independently review the **Prompt Intelligence Enhancement LLD (latest, v1.5)** — verify its 21 already-logged conflict resolutions (PI-1..21) are correct, hunt for **new** conflicts the five prior passes missed, and produce a ready-to-paste Claude Code fix prompt (or precise doc-edit) for **every** issue found.

---

## 1. Your role
Independent **reviewer** in a multi-chat relay: a spec chat drafts, you gate-check, Claude Code applies to the repo (`C:\startup\VisibleAU\src\`). **No repo access** — review against the attached canon. Direct, no padding. **Verify-before-claim**: grep the actual canon before asserting anything; don't trust memory or this handoff. **LLD wins over prototype on conflict.**

**Important:** this LLD has had **five audit passes (21 conflicts, all fixed)**. Don't re-derive them. Your value is (a) *verifying* those resolutions, and (b) finding what five passes missed. If your search comes back largely empty, **say so honestly** — do not manufacture findings (the project's "audit the audit" lesson: a careful reviewer can rationalize non-issues into findings).

## 2. VisibleAU + this feature in 60 seconds
AU-first GEO/AEO **AI-visibility auditing** micro-SaaS for AU SMBs + agencies (managed SaaS, not BYOK). The **prompt intelligence layer** — brand-specific prompt packs that drive every audit — is the product's heart and its one un-copyable asset. This LLD makes it **learn**: prompt efficacy scored from real audit outcomes, real-query grounding (autocomplete/GSC), commercial weighting, competitor-gap discovery, provenance/honesty, agency-editable prompts. **Design constraint: everything additive, zero breakage** (nullable columns, new tables, no scoring changes). Build status: Phase 1 complete; Phase 2 complete through Sprint 7. Canon = **Phase 2 LLD v8.70 + prototype FIX17 + Phase 1 foundations v1.12**.

## 3. Documents (attach these)
- **Under review:** `visibleau-prompt-intelligence-enhancement-lld-2026-07.md` (**v1.5**) — read **§0 first** (the five-pass conflict log, PI-1..21).
- **Grounding:** the v8.70 handoff bundle (`visibleau-handoff-2026-07-04.zip` → Phase 2 LLD v8.70, FIX17 prototype, Phase 1 foundations + sprint prompts).

## 4. Grounding facts to verify (spot-check — don't take on trust)
- **`vertical_pack_prompts`** (Phase 1, GLOBAL/RLS-disabled seed table): `id, packId, promptTemplate, rank, category, topic, expectedMentionType, notes, createdAt, retiredAt` + later `source` ('curated'|'ai_suggested'|'custom'), `persona_tag`, `branded_intent`. **No `brand_id`/`organization_id`** in the documented schema. 336 curated AU prompts.
- **`vertical_packs`**: `vertical`, **`region`** ('au'|'nz'|'uk' — NOT market_code), `version`, `promptsCount`. Canonical **verticalEnum = 'tradies' | 'allied_health' | 'saas'** (three, not five).
- **Niche Explorer** (Sprint 5 Wizard Step 2): GPT-4o-mini suggests brand-specific prompts → accept/edit/skip → documented as "added to `vertical_pack_prompts`" (**the scoping question — see §6**). Free/Starter 3, Growth+ 10.
- **Scoring:** `RUNS_PER_PROMPT=5` + Wilson CI (unchangeable); `sampling_policies` (incl. `max_prompts_per_audit` DEFAULT 50) governs Phase-2 scoring minimums — distinct from runsPerPrompt.
- **Tier execution matrix varies:** Free = 10 prompts × 2 engines (ChatGPT+Perplexity, 20-prompt library); Sample/TIER 0 = 5 × 1; higher tiers more. `audits` records `engines TEXT[], promptsCount, runsPerPrompt, totalCalls`; `BudgetService.estimate({promptCount…})` maps from it.
- **`audit/complete` has SIX listeners** (classify-citation-sources, calculate-share-of-voice, detect-hallucinations, capture-evidence-snapshot [Agency+], run-comparison-prompts, simulate-query-fan-out [Growth+]); `serve()=25/25` — a 7th function breaks it. `simulate-query-fan-out` already has **sample-org exclusion + retired-prompt filter** (the pattern to match).
- **`citations` has NO `brand_id`** — path is `citations.audit_id → audits.id → audits.brand_id`; `citations.brandMentioned` (NOT NULL boolean) is the appearance signal.
- **`prompt_pack_coverage`** (global): `required_template_keys` vs `available_template_keys` → `coverage_status`; **`prompt_pack_coverage_failed` is a live quality gate**.
- **`prompt_volume_estimates`** (global) already exists — estimated demand ("high volume + low presence" opportunities).
- **GA4 only, no GSC:** `organizations.ga4_measurement_id + ga4_api_secret` (plaintext, Sprint 9) is Measurement Protocol *push* — **no Search Console integration, no Google OAuth for reading queries exists.**
- **Drizzle returns NUMERIC as JS strings** → `Number()` coercion (the coverage_ratio-7000% bug class). Tier source = `subscriptions.tier`, never `organizations.tier`. `assertBrandAccess(user, brandId)` on brand-scoped routes. FIX17 has **zero prompt-management UI** (the §9 tab is net-new).

## 5. The 21 logged conflicts (verify, don't re-derive) — by pass
1. **Structural (PI-1..6):** GSC is a net-new build not a reuse (PI-1); efficacy keys on `pack_id` not an invented `vertical` column (PI-2); 3 verticals only (PI-3); `region` not `market_code` (PI-4); `prompt_efficacy` = global/RLS-disabled class, `prompt_candidates` = tenant/RLS (PI-5); efficacy as a `step.run()` **inside `calculate-share-of-voice`** — no 7th function (PI-6).
2. **Semantic (PI-7..12):** efficacy counts **executions not audits** (tier contamination, PI-7); per-**engine** efficacy, never cross-engine averages (PI-8); citations→audits join for brand (PI-9); **exclude sample orgs + retired prompts** (PI-10); boundary vs `prompt_volume_estimates` — demand vs discrimination vs commercial value (PI-11); minimums align to `sampling_policies`, never touch runsPerPrompt/Wilson (PI-12).
3. **Scoping/legality (PI-13..15):** brand-specific prompts must be **brand-scoped** — nullable `brand_id`/`organization_id` added; audit selection `WHERE brand_id IS NULL OR brand_id = :brandId` (PI-13 — **see §6, possible live bug**); autocomplete via **compliant API only**, never scrape Google (ToS) (PI-14); Niche Explorer wizard vs `prompt_candidates` = unified insert semantics, wizard stays for onboarding (PI-15).
4. **Temporal (PI-16..18):** retire/promote = **batched, versioned pack mutations** (`vertical_packs.version` bump; trend surfaces mark version boundaries) (PI-16); retirements **coverage-checked pre-commit** against `required_template_keys` (PI-17); rank changes never mid-cycle — tier top-N stability; real selection query = repo flag (PI-18).
5. **Surface/cost (PI-19..21):** selection precedence = brand-scoped first, then global by rank, truncated at caps; actual count → `promptsCount` → BudgetService (PI-19); `Number()` coercion on all new NUMERIC columns (PI-20); §9 is a **net-new Prompts tab** with explicit nav placement + gated routes — the nav-orphan class (PI-21).

## 6. THE headline repo item — PI-13 (possible LIVE bug, independent of this feature)
The canon documents the shipped Niche Explorer inserting **brand-specific, suburb-specific** accepted prompts into `vertical_pack_prompts` — a **global table with no brand/org column in its documented schema**. If the built code inserts unscoped: **(a) cross-tenant leak** (Org A's custom prompts visible to competitor orgs in the vertical) and **(b) cost pollution** (every brand executes every other brand's prompts × engines × 5 runs). The repo may already have solved this (an undocumented `brand_id`, or a separate table) — **your output must elevate this as the first repo check**, framed as: *"how does the built Sprint 5 wizard scope its inserts?"* If unscoped, it's a live Phase-1/2 bug to fix now, regardless of this LLD.

## 7. Review lens
1. **Verify PI-1..21** — each: confirmed-correct / incomplete / wrong (why, grounded in canon). Hardest: PI-7 (denominator), PI-13 (scoping), PI-16/17 (temporal safeguards vs the gate), PI-19 (precedence + cost flow).
2. **New conflicts — a genuinely different angle.** Five are done (structure, semantics, scoping/legality, time, surface/cost). Untried candidates: **privacy/data-governance** (GSC tokens as secrets; `prompt_candidates.evidence` JSONB holding competitor domains/GSC data — retention, AU Privacy Act); **operator workflow** (who reviews platform-level candidates; review-queue scale); **failure modes** (compliant-API outage mid-discovery; partial candidate batches); **testing strategy** (how do you test the efficacy math — the project's hollow-test lesson); **migration/backfill mechanics** (backfilling provenance/weights on 336 rows in BOTH DBs).
3. **The additive guarantee** — is PI-INV-1 (byte-identical with features off) actually airtight given the new columns + the audit-selection WHERE clause change?
4. **Non-negotiables:** performance (efficacy aggregate on hot path; indexes), security (RLS on candidates; brand scoping; token storage), scalability, UX/accessibility (the new tab; nav-orphan check).
5. **Honesty:** insufficient_data defaults; provenance; no confident-wrong numbers.

## 8. Sri's standards
Verify-before-claim (grep the canon). **A ready-to-paste Claude Code fix prompt for EVERY issue** — incl. LOW; group related; scope precisely (files/sections, exact change, verification greps, Report-back block). Spec-level issues → precise doc-edit instructions. Performance/Security/Scalability/UX first-class. LLD wins over prototype. English only. Direct. Right the first time.

## 9. Expected output
1. Verification of the 21 PIs (correct / incomplete / wrong, with grounding).
2. New findings by severity (Critical/High/Moderate/Low) + a fix prompt or doc-edit for each.
3. **The repo-verification checklist**, PI-13 first, then PI-18 (real selection query), PI-7 (per-tier prompt/engine matrix), the `calculate-share-of-voice` step structure, and the real `vertical_pack_prompts` Drizzle schema.
4. **Readiness verdict** — is v1.5 ready to become a build sprint prompt, or what must change first. Note: the efficacy loop only accrues value with **real audit volume**, so build-timing should follow the founder's go-to-market (first paying agencies), not precede it.
5. If little new is found, say so — that's a valid result for a five-times-audited doc.

---
*Enduring caveat: **canon ≠ built code.** The five passes converged on the same wall — the decisive unknowns (PI-13 scoping, PI-18 selection, PI-7 tier matrix) live in the repo, and only a Claude Code check can close them. Do not let doc-level findings crowd out that message.*
