# HANDOFF — Review of the VisibleAU Presence Lenses Feature LLD (v2.5)

**For:** a fresh Claude reviewer chat (gate-check / critique role)
**From:** the spec/reviewer chat
**Date:** 5 July 2026
**Task:** critically review the **Presence Lenses feature LLD (latest, v2.5)** — verify its 18 already-logged conflict resolutions are correct, hunt for **new** conflicts the prior passes missed, assess the architecture, and produce a ready-to-paste Claude Code fix prompt (or doc-edit) for **every** issue found.

---

## 1. Your role
Independent **reviewer** in a multi-chat relay: a spec chat drafts, you gate-check, Claude Code applies to the repo (`C:\startup\VisibleAU\src\`). **No repo access** — review against the attached canon. Direct, no padding. **Verify-before-claim**: check the actual canon before asserting; don't trust memory or this handoff alone. **LLD wins over prototype on conflict.**

## 2. VisibleAU in 60 seconds
AU-first GEO/AEO **AI-visibility auditing** micro-SaaS for Australian SMBs + agencies. Audits a brand across ChatGPT/Claude/Gemini/Perplexity, scores it, and tells them **what to fix** (the action layer = the differentiator). Solo founder, part-time, production-grade. Build status: **Phase 1 complete; Phase 2 complete through Sprint 4.** Canon authority = **Phase 2 LLD v8.70** + **prototype FIX17**.

## 3. The document under review (attach these)
- **Under review:** **`visibleau-feature-lld-presence-lenses-v2-2026-07.md` (v2.5)** — the feature LLD.
- **Attach for grounding** (verify, don't assume): the **v8.70 handoff bundle** (`visibleau-handoff-2026-07-04.zip` → `phase-2/visibleau-phase2-LLD-v8.70.md`, `phase-2/prototype/visibleau-phase2-prototype-FIX17.jsx`, and Phase 1 materials).
- **Read §0 of the LLD first** — it's a conflict-check log (CC-1..18) documenting four prior audit passes. Your job is to *verify* those resolutions and find what they missed, not just re-derive them.

## 4. What this LLD is (so you know what you're reviewing)
The feature = **"Local vs Global Presence"** — separate AI-visibility scores/citations per geographic lens, with clear separation across the app, configurable-not-hardcoded, industry-standard UX. The architecture was deliberately **generalised**: instead of a fixed `local/global` enum, scope is a **config-defined "Presence Lens" registry** — typed lenses (`geography|persona|channel|vertical`), results carry a `lens_id`, and Local/Global ship as the first two *geography* lenses so future dimensions (persona coverage, agentic-shopping channel, per-market, vertical) are added as **config, not code**. This was chosen after market analysis showed the category fragmenting into many lenses.

**Key design invariants the LLD claims:**
- **LP-INV-1** — Local lens is byte-identical to today's behaviour (default lens; no regression).
- **LP-INV-2** — no blended score across lenses (side-by-side only, never averaged).
- **LP-INV-3** — single-tag boundary (a result belongs to one lens; orthogonal slicing is a documented future extension, not built now).

**Sequencing decision already made:** build this **after multi-region** (it shares the market/scope plumbing — building multi-region first makes this ~1–1.5 sprints vs ~3–4 standalone). Also decided: **keep it a separate LLD from multi-region**, with a boundary cleanup owed — the foundation work (CC-7 `resolveMarketCode`, CC-15 market seeding) should move *into* the multi-region LLD, leaving this to consume it. **Assess whether the LLD reflects that boundary or still describes building the foundation itself.**

## 5. Grounding facts to verify against (spot-check — don't take on trust)
**The core finding the design rests on:** the visibility **results pipeline is single-market today** — `share_of_voice_snapshots`, `visibility_trends`, `query_fan_out_results`, `topical_coverage_gaps`, `citation_source_intelligence`, `brand_web_mentions`, and `audits` carry **no market/scope column**; market is derived from the brand's region. Verify this holds in v8.70 (it's why a `lens_id` discriminator is introduced).

**The 8 tables that get `lens_id`** (verify names + that adding a nullable-defaulting discriminator + backfill to Local is sound): the six above + `audits` + `citations`. New tables the LLD adds: **`visibility_lenses`** (the lens catalog) and **`lens_scores`** (per-lens headline). Verify these names don't collide (see CC-12).

**Invariants (v8.70)** the LLD must respect: **37 Phase 2 tables** (the LLD takes this to **39** — intentional, CC-2); **`serve()=25/25`** (the LLD adds **no** new Inngest function — CC-1); tier source = **`subscriptions.tier`** never `organizations.tier` (CC-11); **`assertBrandAccess(user, brandId)`** on brand-scoped reads; RLS on `organization_id` USING+WITH CHECK, all tenant tables NOT NULL org_id (CC-8 handles the shared-catalog exception); the **5-question Explainability Contract** with `confidenceLabel` on every output (CC-3); percentages NUMERIC(5,2) 0–100, `mention_source_ratio` NUMERIC(4,3) 0–1; **Drizzle NUMERIC → JS strings, `Number()` coercion** (CC-14); config substrate = `config_bundle_cache.resolved_config` + `ConfigBundleService.resolve/activate`; `IntelCard` (`layer/label/value/max/delta/unit`, CT-01/CT-02, BK4 ARIA); `regionEnum` (`au|nz|uk`) → `market_code` (`AU_EN|NZ_EN|UK_EN`) via `toMarketCode`.

**The four already-logged conflict clusters to verify hardest:**
- **CC-7 (major) — market derivation.** `market_code` is derived from `org.region` via `toMarketCode` in **three** places (audit scoring, `metric_quality_gates` read, `BudgetPolicyService` policy lookup). The LLD's fix = a `resolveMarketCode(brand, lens)` resolver threaded through all three. **Verify there aren't *other* derivation sites the fix misses** — this is the highest-risk item.
- **CC-12 — naming collision.** `presence` was already taken (`linkedin_presence_audits.presence_score`, `youtube_presence_audits.presence_score`); tables were renamed to `lens_scores`/`visibility_lenses`. **Check for *other* collisions** (`lens`, `scope`, `coverage`, etc.).
- **CC-13 — UPSERT `ON CONFLICT` target.** Adding `lens_id` to unique keys forces every UPSERT writer's `ON CONFLICT (…)` to add `lens_id` (writers: `aggregate-visibility-trend`, `calculate-topical-gaps`, `calculate-share-of-voice`, `check-cross-platform-consensus`). **Verify the writer list is complete** and no UPSERT is missed (silent cross-lens overwrite risk).
- **CC-16 — re-audit lens propagation.** The workflow loop (`recommendations → tasks → trigger-validation-reaudit`) must carry `lens_id` end-to-end so a Global fix re-audits Global. **Verify the propagation is complete through the actual loop.**

## 6. Review lens — check all of these
1. **Verify the 18 CC resolutions** (§0). Are they each correct and grounded in v8.70? Any resolution that's wrong, incomplete, or introduces a new problem?
2. **New conflicts (a 5th angle).** Four passes covered structural / semantic-integration / migration-mechanics / downstream-integration. Bring a *different* angle — e.g. **security** (config-injection via `brand_lens_overrides`; cross-org lens leakage via the shared catalog; can a brand configure a lens to read another market/org's data?), **performance/scale** (index bloat from `lens_id`; row multiplication N lenses × volume; `refresh-lens-scores` cost), **analytics/observability**, **API/backward-compat** (existing routes/webhooks/agency-portal assuming a single score), or **config-validation failure modes** (malformed lens config, two defaults per dimension, invalid market_code).
3. **Architecture soundness.** Is the generalised lens registry the right call, or over-/under-engineered? Is **LP-INV-3 (single-tag)** the right tradeoff, or will orthogonal slicing (geography × persona) be needed sooner than "future"? Is the `lens_id` FK vs the noted `TEXT` lens-key alternative the better choice given the RLS/table-count constraints?
4. **The invariants (LP-INV-1/2/3).** Sound and enforceable? Is the byte-identical-Local claim actually guaranteed by the design (default lens + backfill + UPSERT keys)?
5. **Multi-region boundary.** Does the LLD still describe *building* the shared foundation (CC-7/CC-15) that was decided to move into the multi-region LLD? If so, flag the split that's owed.
6. **Buildability.** Could Claude Code build this from the LLD as written? Anything under-specified, ambiguous, or dependent on unstated assumptions?
7. **Non-negotiables:** performance (indexing/N+1), security (RLS, `assertBrandAccess`, config injection), scalability, **UX/accessibility** (the lens control, PresenceCard, empty/gated states, mobile). All covered?
8. **Honesty:** confidence per lens; no blended score; the "Insufficient data" empty state; not over-claiming.
9. **Open questions (OQ1–6).** Are they the right open questions? Any decision the LLD leaves open that actually blocks the build?

## 7. Known decisions/context (confirm handling; don't re-litigate)
- **Timing:** execute **after Phase 2 is finished AND after multi-region**, and only once an agency signals demand. Not now.
- **Sequencing:** shares plumbing with multi-region — build the foundation once (multi-region), lenses on top.
- **Separate LLDs** (not merged with multi-region), with the foundation-work boundary cleanup owed (§4/§6.5).
- The 18 CCs are already resolved *in the doc* — verify, don't just repeat.

## 8. Sri's standards
- **Verify-before-claim** — check the real canon; never trust memory/handoff alone.
- **A ready-to-paste Claude Code fix prompt for EVERY issue** — incl. LOW. Group related issues; scope each precisely (files/sections, exact change, verification greps, constraints). For spec-level issues, give a precise doc-edit instruction instead.
- **Performance, Security, Scalability, UX** non-negotiable, first-class. **LLD wins over prototype.** **English only.** Direct. Right the first time.

## 9. Expected output
1. **Verification of the 18 CCs** — for each, confirmed-correct / incomplete / wrong (with why).
2. **New findings by severity** (Critical / High / Moderate / Low) — what, where (section), why, grounded in canon.
3. A **fix prompt (or doc-edit) for every issue** — the two above.
4. **Architecture verdict** — is the generalised-lens design sound; keep or reconsider LP-INV-3 / the FK-vs-TEXT-key choice.
5. **Readiness verdict** — is v2.5 ready to become a build sprint prompt (post-multi-region), or what must change first.
6. An explicit list of anything you **couldn't verify** against the attached canon (flag for repo checking).

---
*Enduring caveat: **canon ≠ built code.** These 18 fixes assume v8.70 matches the repo; CC-7 (`resolveMarketCode` sites), CC-13 (UPSERT writers), and CC-16 (`trigger-validation-reaudit`) especially could be wired differently in `C:\startup\VisibleAU\src\` — flag those for Claude Code verification rather than assuming the LLD and build agree.*
