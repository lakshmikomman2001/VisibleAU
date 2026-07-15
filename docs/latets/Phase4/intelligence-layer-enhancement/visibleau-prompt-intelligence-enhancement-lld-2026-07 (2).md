# VisibleAU — Prompt Intelligence Layer: Enhancement LLD

**Version:** 1.5 (v1.0 + FIVE conflict-audit passes vs Phase 1 + Phase 2 canon — structural [PI-1..6], semantic [PI-7..12], scoping/legality [PI-13..15], temporal [PI-16..18], surface/cost [PI-19..21], see §0)
**Date:** 5 July 2026 · **Owner:** Sri
**Goal:** sharpen the prompt intelligence layer — the heart of the product and the one genuinely un-copyable asset — **without breaking existing functionality.**
**Grounding:** Phase 2 LLD v8.70 + Phase 1 foundations (verified inline) + 2026 market methodology research.
**Non-negotiable:** every change is **additive** (nullable columns, new tables, opt-in features). Zero breakage to existing audits, scoring, or queries.

---

## 0. Conflict-check log (audit vs Phase 1 + Phase 2 canon)

**Verified clean:** `vertical_pack_prompts` Phase-1 columns (`id, packId, promptTemplate, rank, category, topic, expectedMentionType, notes, createdAt, retiredAt`); `source`/`persona_tag`/`branded_intent` additions; the 336-prompt AU base pack; Niche Explorer (Sprint 5 Wizard Step 2, GPT-4o-mini, Free 3 / Growth+ 10); `RUNS_PER_PROMPT=5` + Wilson CI; `query_fan_out_results.original_prompt_id` → `vertical_pack_prompts`; `category`→buyer-stage mapping; `retiredAt` soft-retire. **Six conflicts found & fixed:**

- **PI-1 — GSC is NOT integrated (MAJOR — planning error, fixed).** §5 assumed I could "reuse the existing OAuth path." **Wrong.** The canon has **GA4 only** — `organizations.ga4_measurement_id` + `ga4_api_secret` (Sprint 9 GD1), and that's the **Measurement Protocol *push*** (sending events *out*), which is the opposite direction from reading a client's search queries. **There is no Google Search Console integration and no Google OAuth for reading GSC data.** **Resolved:** GSC grounding is a **net-new integration** — Google OAuth consent + Search Console API + token storage (and those tokens are *secrets*, tying to the control-plane/`ga4_api_secret`-plaintext concern). Re-scoped from "reuse" to **its own build**, moved later in the rollout, with **autocomplete/PAA grounding** promoted as the cheap interim (§5, §12).
- **PI-2 — `vertical` is not on the prompts table (structural, fixed).** The model is `vertical_packs` (`vertical`, `region`, `version`, `promptsCount`) → `vertical_pack_prompts.packId` (FK, cascade). My `prompt_efficacy.vertical TEXT` invented a column that doesn't live there. **Resolved:** efficacy keys on **`pack_id`** (the real FK), deriving vertical/region from `vertical_packs` — no duplicated denormalised column (§3).
- **PI-3 — only THREE verticals exist, not five (fixed).** Canonical `verticalEnum` = **`'tradies' | 'allied_health' | 'saas'`** (enforced across `conversation_journeys`, `topical_coverage_gaps`, `prompt_volume_estimates` per G-05). My "3 × 5 verticals" framing was wrong. **Resolved:** all vertical references pinned to the 3-value enum (§3, §12).
- **PI-4 — market vs region mismatch (fixed).** `vertical_packs` keys on **`region`** (`au|nz|uk`), not `market_code` (`AU_EN`). My efficacy/candidate tables used `market_code`, which would mis-join. **Resolved:** align to the pack's **`region`**, converting via `toMarketCode` only where market-keyed config is genuinely needed (§3).
- **PI-5 — RLS classification for `prompt_efficacy` (fixed).** The canon has an explicit **"Global tables — NO RLS (seed data, no org scoping)"** class (`config_bundle_cache`, `sampling_policies`, `prompt_pack_coverage`, `prompt_volume_estimates`, `citability_methods`, …), and `vertical_pack_prompts` itself is global. My table said "no RLS needed" as an ad-hoc justification rather than invoking the existing classification. **Resolved:** `prompt_efficacy` is explicitly declared a **global table (RLS DISABLED, no `organization_id`)**, consistent with `prompt_volume_estimates` — with the aggregate-only invariant (counts, never brand identifiers) documented as the reason it's safe (§3, §11).
- **PI-6 — the `audit/complete` fan-out is already crowded (fixed, and it strengthens the design).** **Six** functions already listen on `audit/complete` (`classify-citation-sources`, `calculate-share-of-voice`, `detect-hallucinations`, `capture-evidence-snapshot` (Agency+), `run-comparison-prompts`, `simulate-query-fan-out` (Growth+)). Adding a 7th listener would need a new Inngest function — **breaking `serve()=25/25`**. **Resolved:** the efficacy computation is a **`step.run()` appended inside an existing consumer** (recommend `calculate-share-of-voice`, which already aggregates per-prompt outcomes) — **no new function, `serve()` count preserved** (§4, §11). Note: `capture-evidence-snapshot`/`simulate-query-fan-out` are **tier-gated**, so efficacy must not depend on them firing.

**Standing caveat:** grounded in v8.70 + Phase 1 as written. Confirm against the **built repo** before implementing: the exact `calculate-share-of-voice` step structure, whether any Google OAuth scaffolding exists, and the real `vertical_packs`/`vertical_pack_prompts` Drizzle schema.

### Second audit — semantic / behavioural (does the learning loop actually work?)

Pass 1 audited structure (schema, hooks, RLS). This pass audits **whether the loop computes anything meaningful given how audits really run.** Six conflicts — two of which would have made the efficacy metric **silently wrong**.

- **PI-7 — the efficacy denominator is contaminated by TIER, not quality (MAJOR, fixed).** Audits do **not** run the same prompts for every brand: **Free = 10 prompts × 2 engines**, **TIER 0/Sample = 5 prompts × 1 engine**, higher tiers more, with `sampling_policies.max_prompts_per_audit DEFAULT 50` as a cap. So a prompt's `appearance_rate` mixes brands that *ran* it with brands that never *included* it — and a prompt that merely sits low in `rank` (thus excluded from small-tier audits) would look **"dead"** when it was simply never asked. **Resolved:** efficacy counts only **runs where the prompt was actually executed** (`runs_observed` = executions, never audits); `discrimination_score` is computed **within comparable cohorts** (same engine set), and prompts below a minimum execution count stay **`insufficient_data`**. A prompt is never labelled `dead` for lack of *inclusion* (§3, §4).
- **PI-8 — engine asymmetry skews appearance (fixed).** Free runs **ChatGPT + Perplexity only**; others run 4 engines. Aggregating appearance across engine-sets makes prompts look better/worse purely by which brands' tiers ran them. **Resolved:** efficacy is computed **per (prompt, region, engine)** and only then rolled up — never a naïve cross-engine average (§3).
- **PI-9 — `citations` has NO `brand_id` (structural, fixed).** The canonical path is **`citations.audit_id → audits.id → audits.brand_id`** (FIX 3, v8.x: a query using `citations.brand_id` was a real bug). My efficacy aggregate implied a direct brand link. **Resolved:** the aggregate joins **`citations → audits`** for brand attribution; `brandMentioned` (a Phase-1 `citations` NOT NULL boolean) is the appearance signal — reuse it, don't invent a new one (§3, §4).
- **PI-10 — must respect the existing retired-prompt filter AND sample-org exclusion (fixed).** The canon already has both (`simulate-query-fan-out` has "sample-org exclusion, retired-prompt filter"). If efficacy counts **sample/demo org** audits, the synthetic demo brand pollutes real AU efficacy data — corrupting the very moat this feature builds. **Resolved:** the efficacy aggregate **excludes sample/demo orgs** and **skips retired prompts** (`retiredAt IS NOT NULL`), matching the established pattern (§4, §11).
- **PI-11 — `prompt_volume_estimates` already exists (near-duplication, boundary fixed).** A global table (`vertical`, `data_source`) that the canon already uses for "high volume + low brand presence" **opportunity** detection. That is *adjacent* to my `commercial_weight`. **Resolved:** boundary declared — `prompt_volume_estimates` = **external/estimated demand** (how much a prompt is asked); `prompt_efficacy` = **observed discriminative power** (how well it separates brands in *our* audits); `commercial_weight` = **business value** (Decision > Awareness). Three distinct axes; `commercial_weight` **may seed from `prompt_volume_estimates`** rather than duplicating it (§3, §6).
- **PI-12 — `runsPerPrompt=5` vs `sampling_policies` (clarified).** The canon explicitly warns these are different: `runsPerPrompt=5` is the **per-audit LLM call count (unchangeable, Wilson CI depends on it)**; `sampling_policies.max_repeated_samples`/minimums govern **Phase-2 visibility scoring**. **Resolved:** efficacy's minimum-observation threshold aligns to **`sampling_policies` minimums** and must **never** be conflated with `runsPerPrompt` — the Wilson CI math stays untouched (§4, OQ2).

**Second-audit standing note:** PI-7/PI-8 mean the efficacy metric is only trustworthy **within a comparable cohort** (same engine set, prompt actually executed). Verify the real per-tier prompt/engine matrix in the built code before computing anything — a wrong denominator here produces confident, wrong numbers, which is worse than none.

### Third audit — prompt-entry integration, data scoping & external-source legality

Pass 1 = structure, pass 2 = metric semantics. This pass audits **how new prompts actually enter the system and who can see them.** Three conflicts — the first is the sharpest of all three passes and may be a **latent canon issue**, not just mine.

- **PI-13 — brand-specific prompts in a GLOBAL table = cross-tenant leak + cost pollution (MAJOR, fixed).** `vertical_pack_prompts` is a **global, RLS-disabled seed table** with **no `brand_id`/`organization_id`** (Phase-1 columns verified). Yet the canon's own Niche Explorer says accepted **"brand-specific… suburb/service-specific"** suggestions are *"added to `vertical_pack_prompts`"* — and my §8 agency-supplied prompts did the same. Consequences if taken literally: **(a) leak** — Org A's "emergency plumber Parramatta after-hours" prompt becomes visible to competitor orgs in the same vertical; **(b) cost pollution** — *every* brand in the vertical would execute every other brand's custom prompts in their audits (× engines × 5 runs). **Resolved (this LLD):** accepted brand-specific candidates are **brand-scoped, never global** — add **nullable `brand_id` (+ `organization_id`) to `vertical_pack_prompts`** (additive: NULL = global curated pack, unchanged; non-NULL = visible/executed **only** for that brand, RLS-guarded via a partial policy or enforced in the audit's prompt-selection query: `WHERE brand_id IS NULL OR brand_id = :brandId`). **Flagged (canon/repo):** the built Niche Explorer may already have solved this (e.g. an added `brand_id` or a separate brand-prompts table) — **verify in the repo**; if it inserts unscoped, that's a live Phase-1/2 bug worth a Claude Code check *independent of this feature*. Efficacy note: brand-scoped prompts have `brands_observed=1` → `discrimination_score` stays `insufficient_data` (correct), but `appearance_rate`/`citation_yield` remain useful *for that brand* (§3, §8).
- **PI-14 — autocomplete/PAA "cheap and free" overstated; scraping Google violates ToS (fixed).** No autocomplete/PAA infrastructure exists in the canon (existing scraping = Reddit/YouTube/Quora via `track-brand-web-mentions`, with the RL-01 rate-limit lesson). **Scraping Google autocomplete/PAA directly is against Google's ToS** — a legality/security non-negotiable. **Resolved:** §5a uses a **compliant third-party suggest/SERP API** (DataForSEO-class) — small real per-query cost (not "~zero"), budgeted via `market_ai_budget_policies`-style limits, rate-limited per the RL-01 pattern; **never scrape Google directly** (§5a, §10).
- **PI-15 — two parallel review paths for the same concept (fixed).** The existing **Niche Explorer** (Sprint 5 Wizard Step 2: GPT-4o-mini suggests → user accepts/edits/skips → insert) and my **`prompt_candidates`** review flow are duplicate accept-gates. **Resolved:** the wizard's onboarding flow **stays as built** (it's shipped UX); all **post-onboarding** discovery (`gsc`, `competitor_gap`, `autocomplete`, `agency`) flows through `prompt_candidates`; **both converge on identical insert semantics** (brand-scoped per PI-13, provenance set, PI-INV-3 review satisfied by either gate). Optionally (v1.1+) the wizard writes through `prompt_candidates` with `status='accepted'` for a single audit trail (§8).

**Third-audit standing note:** PI-13 is the one to check in the repo **first** — how the built Niche Explorer scopes its inserts determines whether this LLD's fix is an extension or a bug-fix of existing behaviour.

### Fourth audit — temporal integrity & feedback stability (the loop vs the system it measures)

Passes 1–3 = structure, metric semantics, scoping. This pass audits the **time axis**: the learning loop *mutates the prompt set*, but trends, quality gates, and tier selection all *assume* it. Three conflicts — this is the "measurement changes the measured" class.

- **PI-16 — retire/promote breaks trend comparability (MAJOR, fixed).** `visibility_trends` (UNIQUE `brand_id, period_label, period_type`; UPSERT by `aggregate-visibility-trend`) compares periods over time. If the executed prompt set changes between periods, a visibility "drop" may just be a **pack change** — apples-to-oranges, silently. The canon already has the mechanism: **`vertical_packs.version` + `promptsCount`**, and audits record their own `promptsCount`/`engines` (Sprint 2 canonical). **Resolved:** (a) any accepted retire/promote batch **bumps `vertical_packs.version`** (+ recomputes `promptsCount`); (b) retirements are **batched** (periodic review cadence, e.g. quarterly), never continuous drift — long stable windows between versions; (c) trend surfaces show a **"pack changed" marker** when compared periods span a version boundary (Explainability Contract: the confidence note names the version change) (§4, §11).
- **PI-17 — retirement can trip the coverage QUALITY GATE (fixed).** `prompt_pack_coverage` is keyed `(market_code, locale, segment, use_case)` with `required_template_keys` vs `available_template_keys` → `coverage_status`, and **`prompt_pack_coverage_failed` is a live gate** in the canon (it can fail scoring). Retiring a prompt that is the **last provider of a required template key** flips coverage to `partial|missing` → trips the gate → degrades/blocks audits. **Resolved:** the retire flow **re-validates coverage pre-commit** — a retirement that would drop any `required_template_key` is **rejected until a replacement exists**; the review UI shows which template keys a candidate retirement touches (§4).
- **PI-18 — rank-driven selection = the loop changes what small tiers measure (fixed + repo flag).** Tier limits execute top-N prompts (Free 10, Sample 5…), plausibly **by `rank`** — so efficacy-driven promotion **changes which prompts a Free brand's next audit runs**, altering its score basis (non-stationarity; compounds PI-16). **Resolved:** rank changes ride the **same versioned, batched mutation** as retirements (PI-16) — never silent mid-cycle reordering; within a trend-comparison window a brand's selected set stays stable. **Repo flag (verify-before-claim):** the actual selection query (`ORDER BY rank`? per-tier subset tables?) isn't explicit in the LLD doc — **confirm the real mechanism in the built code** before wiring promotion (§4).

**Fourth-audit standing note:** the loop is safe only as **versioned, batched, coverage-checked mutations** — continuous automatic drift would corrupt trends, trip gates, and destabilize tier measurement. This strengthens PI-INV-3 (human-gated changes) from a policy into a *correctness requirement*.

### Fifth audit — product surface & cost integration

Passes 1–4 = structure, semantics, scoping, time. This pass audits **where the feature lives and what it costs.** Three conflicts:

- **PI-19 — brand-scoped prompts vs tier caps: selection precedence and cost flow undefined (fixed).** Tiers cap executed prompts (Free = 10 per audit from a 20-prompt library; `sampling_policies.max_prompts_per_audit` DEFAULT 50), `audits.promptsCount` records the executed count, and `BudgetService.estimate({ promptCount … })` maps from it. Once a brand has accepted custom prompts (PI-13 brand-scoped), **which N run?** Undefined in v1.3 — a Free brand accepting 3 Niche Explorer + 2 agency prompts could silently displace core pack prompts or blow the cap. **Resolved:** selection precedence defined — **brand-scoped prompts first (they're the brand's explicit choices), then global pack by `rank`, truncated at the tier cap and `max_prompts_per_audit`**; the audit's *actual* count flows into `promptsCount` → BudgetService estimate → quota, so cost estimation reflects per-brand variable counts, never a fixed assumption. The candidate-review UI shows the displacement effect before acceptance ("accepting this will replace prompt #10 in your audits") (§4, §8, §10).
- **PI-20 — Drizzle NUMERIC-as-string on the new columns (fixed).** The canonical bug class (`coverage_ratio` 7000%-style): Drizzle returns NUMERIC as **JS strings**. My new columns — `appearance_rate`, `discrimination_score`, `citation_yield` NUMERIC(5,2); `commercial_weight` NUMERIC(3,2) — never stated the `Number()` coercion requirement. **Resolved:** coercion noted at the schema and on every read path (efficacy display, weight math — string × weight silently concatenates/NaNs) (§3, §9).
- **PI-21 — the §9 UI is a NET-NEW surface, not an extension (fixed — falsifies my own claim).** FIX17 has **zero** prompt-management UI (verified: no prompt panel/page/library component exists). My "extends existing surfaces — no new nav" was **false**. A net-new surface carries the project's recurring **nav-orphan** bug class (S5's trust hub: built, unreachable). **Resolved:** §9 rewritten as a net-new **Prompts tab** on the brand page — explicit nav placement (brand tabs, after Visibility), routes (`GET/POST /api/brands/[id]/prompts`, `GET/PATCH /api/brands/[id]/prompt-candidates`) each with Better Auth session + `setRlsContext` + `assertBrandAccess` + `subscriptions.tier` gates, mobile layout, both themes, EmptyState — and a **reachable-by-click** acceptance check (§9).

**Fifth-audit standing note:** findings are now surface-spec and plumbing (descending severity — pass 1 caught a missing integration, pass 5 a missing nav entry). The decisive unknowns remain repo-side: PI-13 (wizard insert scoping — possibly a live bug), PI-18 (the real selection query), PI-7 (the per-tier prompt/engine matrix).

---

## 0. What already exists (verified against canon — do NOT rebuild)

The layer is **more mature than the market baseline.** Confirmed in v8.70/Phase 1:

| Existing capability | Canon |
|---|---|
| `vertical_pack_prompts` (Phase 1) | `id, packId, promptTemplate, rank, category, topic, expectedMentionType, notes, createdAt, retiredAt` |
| **336 curated AU prompts** across verticals | the base pack |
| **`source`** | `'curated'` \| `'ai_suggested'` \| `'custom'` |
| **`persona_tag`** (nullable) | persona layer (~40 of 336 tagged); Growth+ filter |
| **`branded_intent`** (nullable) | PATCH AE-01 |
| **`category` → buyer stage** | discovery/problem → Awareness; comparison/reviews → Consideration; recommendation/pricing/compliance/emergency → **Decision** |
| **`topic`** | topic-cluster grouping |
| **Niche Explorer** (Sprint 5 Wizard Step 2) | one GPT-4o-mini call (~A$0.001); user accepts/edits/skips → `source='ai_suggested'`; Free/Starter 3 suggestions, Growth+ 10 |
| **`retiredAt`** | soft-retire already supported |
| Scoring | `RUNS_PER_PROMPT = 5` + **Wilson CI** (Sprint 3) — **must not change** |
| `query_fan_out_results.original_prompt_id` → `vertical_pack_prompts` | fan-out already links back to the prompt |
| `prompt_pack_coverage` | per-market coverage config |

**Market check:** research consensus is 20–40 tracked prompts, ~75/25 unbranded/branded, spread across buyer stages, with persona modifiers and geo qualifiers. **You already do all of this.** The gaps are elsewhere (§1).

## 1. The real gaps (what this LLD adds)

Market research (SE Ranking, Conductor, seoClarity, Quattr, Getfluence, 2026) converges on five things you **don't** yet do:

- **G1 — No learning loop.** Prompts are generated once and never improve from results. *"Gaps where rivals get cited but you don't = confirmed demand, go there first"* — you capture that data and don't use it. **This is the biggest gap and the biggest moat.**
- **G2 — No grounding in real AU query language.** Prompts are LLM-generated, not evidenced. Research: *"Build prompts from real language in Search Console, Google question boxes, Reddit… Long-tail GSC queries (10+ words) are essentially prompts already."* GSC is the single best free source and you don't use it.
- **G3 — No commercial weighting.** All prompts count equally. Research: prioritise **bottom-of-funnel** first; *"which prompts, if lost to competitors, would cost you leads?"* A brand can be strong on Decision and invisible on Awareness — currently indistinguishable in one blended score.
- **G4 — No competitor-gap discovery.** Prompts where a competitor is cited and the brand isn't = **confirmed live demand** (a proven AU customer question with a real winner). Highest-signal prompt source there is; unused.
- **G5 — No efficacy/provenance signal.** Dead prompts (nobody ever appears, or everybody does) measure nothing and waste LLM spend; hallucinated prompts (never actually asked) are a credibility risk.

## 2. Design principles

1. **Additive only.** New nullable columns + new tables. No changes to existing columns, queries, or the audit loop.
2. **Never change scoring silently.** `RUNS_PER_PROMPT=5` + Wilson CI untouched. **Weighted scores are a NEW, separate metric shown alongside the existing score — never a redefinition of it** (INV-3).
3. **Learning is per-vertical-per-market, not per-brand.** Cross-brand learning happens inside `(vertical, market_code)` — never leaks a brand's data to another org (RLS-safe: efficacy is aggregate, org-agnostic).
4. **Honesty first.** Every prompt carries provenance (observed vs inferred) and confidence — consistent with the 5-question Explainability Contract.
5. **Tiered, cost-controlled.** New LLM calls respect `market_ai_budget_policies`; heavy features are Growth+/Agency.

**Invariants:**
- **PI-INV-1** — existing audits produce **byte-identical** results with all new features off/absent.
- **PI-INV-2** — the canonical visibility score is unchanged; **commercial-weighted visibility is an additional metric**.
- **PI-INV-3** — no prompt is auto-retired or auto-added without operator/agency review (no silent drift in what's measured).

## 3. Schema (all additive)

```sql
-- A) Efficacy + commercial value + provenance on the EXISTING prompt table (all nullable → zero breakage)
ALTER TABLE vertical_pack_prompts ADD COLUMN IF NOT EXISTS commercial_weight NUMERIC(3,2);   -- 0.00–1.00; NULL = 1.00 (unweighted, back-compat)
ALTER TABLE vertical_pack_prompts ADD COLUMN IF NOT EXISTS provenance TEXT;                   -- 'gsc_observed'|'autocomplete'|'competitor_gap'|'agency_supplied'|'llm_inferred'|NULL(legacy curated)
ALTER TABLE vertical_pack_prompts ADD COLUMN IF NOT EXISTS evidence_note TEXT;                -- e.g. "GSC: 34 impressions/mo"
ALTER TABLE vertical_pack_prompts ADD COLUMN IF NOT EXISTS geo_qualifier TEXT;                -- 'suburb'|'city'|'near_me'|'national'|NULL
ALTER TABLE vertical_pack_prompts ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE CASCADE;          -- PI-13: NULL = global curated pack (unchanged); non-NULL = THIS brand only
ALTER TABLE vertical_pack_prompts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;  -- PI-13: scoping for brand-specific rows
-- PI-13: audit prompt-selection MUST filter: WHERE brand_id IS NULL OR brand_id = :brandId — one org's suburb-specific prompts must never run in (or be visible to) another org's audits.
-- (persona_tag, branded_intent, source, category, topic, rank, retiredAt already exist — reuse, don't duplicate)

-- B) NEW: prompt efficacy, learned from audit outcomes (aggregate — no tenant data)
--    GLOBAL TABLE — RLS DISABLED, no organization_id (same class as prompt_volume_estimates,
--    sampling_policies, prompt_pack_coverage per the canon's "Global tables — NO RLS" list).
--    Safe because it stores COUNTS ONLY — never brand identifiers (PI-5).
CREATE TABLE prompt_efficacy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES vertical_pack_prompts(id) ON DELETE CASCADE,
  pack_id UUID NOT NULL REFERENCES vertical_packs(id) ON DELETE CASCADE,  -- PI-2: vertical/region derive from vertical_packs (no denormalised column)
  region TEXT NOT NULL,                            -- PI-4: packs key on region ('au'|'nz'|'uk'), NOT market_code
  engine TEXT NOT NULL,                            -- PI-8: per-engine — tiers run different engine sets (Free = ChatGPT+Perplexity only); never cross-engine average
  executions_observed INTEGER NOT NULL DEFAULT 0,  -- PI-7: times the prompt was ACTUALLY EXECUTED (never "audits") — tiers run different prompt counts
  brands_observed INTEGER NOT NULL DEFAULT 0,      -- distinct brands (COUNT only — never brand ids)
  appearance_rate NUMERIC(5,2),                    -- % of executions where the audited brand appeared (0–100)
  discrimination_score NUMERIC(5,2),               -- 0–100: how well it SEPARATES brands (the key signal)
  citation_yield NUMERIC(5,2),                     -- % of executions producing a citation
  efficacy_label TEXT,                             -- 'high_signal'|'low_signal'|'saturated'|'dead'|'insufficient_data' (default until minimum executions)
  last_computed_at TIMESTAMPTZ,
  UNIQUE(prompt_id, region, engine)                -- PI-8
);
-- PI-20: all NUMERIC columns above return as JS STRINGS via Drizzle — Number()-coerce on every read (the coverage_ratio-7000% bug class).

-- C) NEW: candidate prompts awaiting review (PI-INV-3 — nothing enters the pack silently)
--    TENANT TABLE — RLS ENABLED (org-scoped, USING + WITH CHECK on organization_id).
CREATE TABLE prompt_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = platform-level candidate (operator-only)
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,                -- NULL = pack-level
  pack_id UUID REFERENCES vertical_packs(id) ON DELETE SET NULL,        -- PI-2/PI-3: vertical comes from the pack ('tradies'|'allied_health'|'saas')
  region TEXT NOT NULL,                                                  -- PI-4
  prompt_text TEXT NOT NULL,
  discovery_method TEXT NOT NULL,   -- 'gsc'|'competitor_gap'|'autocomplete'|'agency'|'llm'
  evidence JSONB NOT NULL DEFAULT '{}',  -- e.g. {"gsc_impressions":34,"competitor":"abcplumbing.com.au","engine":"chatgpt"}
  confidence_label TEXT,            -- confirmed|likely|hypothesis (Explainability Contract)
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending'|'accepted'|'rejected'
  reviewed_by TEXT, reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX prompt_candidates_org_status_idx ON prompt_candidates (organization_id, status, created_at DESC);
```

## 4. Feature 1 — The learning loop (G1) ★ the moat

**Mechanism.** After each audit completes, aggregate per-prompt outcomes into `prompt_efficacy` (per prompt × region × engine, brand-agnostic):

**Source of truth (PI-9):** appearance comes from the Phase-1 **`citations.brandMentioned`** boolean, joined **`citations → audits`** for brand attribution — **`citations` has NO `brand_id`** (the canonical path is `citations.audit_id → audits.id → audits.brand_id`; a direct `citations.brand_id` query was a real prior bug). Reuse this signal; don't invent a new one.

**Mandatory exclusions (PI-10)** — matching the established pattern in `simulate-query-fan-out`:
- **Exclude sample/demo orgs** — otherwise the synthetic demo brand pollutes real AU efficacy data, corrupting the very moat this builds.
- **Skip retired prompts** (`retiredAt IS NOT NULL`).

**Honest denominator (PI-7).** `executions_observed` counts times the prompt was **actually executed** — never "audits run." Tiers execute different prompt counts (Free 10 × 2 engines; Sample 5 × 1; cap `max_prompts_per_audit`=50), so a low-`rank` prompt excluded from small-tier audits must **never** be labelled `dead` for lack of *inclusion*. Below the minimum execution threshold (aligned to `sampling_policies` minimums — **not** `runsPerPrompt`, PI-12), the label stays **`insufficient_data`**.

- **`discrimination_score` is the key metric.** A prompt where *every* brand appears (saturated) or *no* brand ever appears (dead) measures nothing. A prompt where **some brands win and some lose** is doing real work. Compute from the spread of appearance across brands **within a comparable cohort (same region + engine)** — e.g. normalized variance, or `1 − |2·appearance_rate/100 − 1|` (high when appearance ≈ 50%, low at the extremes).
- **Labels:** `high_signal` (discriminates), `saturated` (≈all appear), `dead` (≈none appear, *and* it was genuinely executed enough times), `low_signal`, `insufficient_data` (**the default**).

**Where it runs (PI-6).** **`audit/complete` already has SIX listeners** (`classify-citation-sources`, `calculate-share-of-voice`, `detect-hallucinations`, `capture-evidence-snapshot` (Agency+), `run-comparison-prompts`, `simulate-query-fan-out` (Growth+)) — a **7th listener would require a new Inngest function and break `serve()=25/25`.** So efficacy is a **`step.run()` appended inside an existing consumer** — recommend **`calculate-share-of-voice`**, which already aggregates per-prompt outcomes and is **not tier-gated** (unlike evidence-snapshot/fan-out, so it always fires). Cheap: a DB aggregate, **no LLM call**.

**What it drives (all review-gated, INV-3):**
- **Retire/promote suggestions** — dead/saturated prompts surfaced to the operator for retirement (existing `retiredAt`); high-signal ones promoted in `rank`. **Temporal safeguards (PI-16/17/18):** changes apply as **batched, versioned pack mutations** (bump `vertical_packs.version`, recompute `promptsCount`; periodic cadence, never continuous drift); each retirement is **coverage-checked pre-commit** (must not drop any `prompt_pack_coverage.required_template_key` — the `prompt_pack_coverage_failed` gate is live); trend surfaces mark periods that span a pack-version boundary; rank changes never reorder mid-cycle (tier top-N selection stays stable within a comparison window).
- **Pack quality compounds** — by audit 50, the tradies AU pack is measurably better than any generic pack. *This is the compounding asset no competitor can buy.*
- **Cost saving** — dropping dead prompts cuts LLM spend per audit (5 runs × 4 engines each).

## 5. Feature 2 — Real-query grounding (G2) ★ highest-value

The single best source of **real AU customer language** — it turns prompts from *plausible* to *evidenced*.

> **⚠ PI-1 correction: GSC is NOT currently integrated.** The canon has **GA4 only** (`organizations.ga4_measurement_id` + `ga4_api_secret`, Sprint 9 GD1) — and that's the **Measurement Protocol *push*** (sending events *out*), the opposite direction from reading a client's search queries. **There is no Search Console integration and no Google OAuth for reading GSC data.** So GSC grounding is a **net-new integration**, not a reuse.

**5a — Autocomplete / PAA grounding (the cheap interim — do this first).**
AU-locale autocomplete + People-Also-Ask give real query *patterns* with no OAuth and no client action. **Sourcing (PI-14): via a compliant third-party suggest/SERP API (DataForSEO-class) — never scrape Google directly (ToS violation).** Small real per-query cost (budget-capped, rate-limited per the RL-01 pattern). Emit as `prompt_candidates` (`discovery_method='autocomplete'`, `confidence_label='likely'`). Immediate value, works for every brand from day one.

**5b — GSC grounding (the real prize — a genuine build).**
Long-tail Search Console queries (**≥6–10 words**) are *literally prompts already*, and they're **observed** demand, not inferred.
- **Requires (net-new):** Google OAuth consent flow + Search Console API client + **refresh-token storage** — and those tokens are **secrets** (note: `ga4_api_secret` is already plaintext in the tenant DB — don't repeat that; this is a candidate for the encrypted secret store).
- **Who connects:** the **agency**, on behalf of the client brand (they usually already have GSC access) — per-brand token.
- **Extract:** long-tail, question-form, and local-intent (suburb/near-me) queries.
- **Emit:** `prompt_candidates` with `discovery_method='gsc'`, `evidence={impressions, clicks, position}`, `confidence_label='confirmed'` (observed demand).
- **Review:** agency accepts/edits/rejects → accepted rows insert into `vertical_pack_prompts` with `source='custom'`, `provenance='gsc_observed'`, `evidence_note`.

**The check to run BEFORE building any of this:** take Metropolitan Plumbing's generated pack and put it beside that client's real GSC queries (manually — you don't need the integration to *look*). If they don't describe the same universe, prompt grounding is the most important bug in the product, and 5a/5b are the fix.

## 6. Feature 3 — Commercial weighting (G3)

Not all prompts are equal: "emergency plumber Sydney" ≫ "what is a P-trap."

- `commercial_weight` (0.00–1.00) on each prompt; **NULL ⇒ treated as 1.00** (so existing behaviour is unchanged — PI-INV-1).
- Seed from `category`→buyer-stage (Decision > Consideration > Awareness) + `branded_intent`, and **may seed from the existing `prompt_volume_estimates`** (global table, already used for "high volume + low brand presence" opportunity detection) — **do not duplicate it** (PI-11). Three distinct axes: `prompt_volume_estimates` = *estimated external demand*; `prompt_efficacy` = *observed discriminative power in our audits*; `commercial_weight` = *business value*.
- **NEW metric: "Commercial Visibility"** = visibility weighted by `commercial_weight`, shown **alongside** (never replacing) the canonical score (PI-INV-2).
- **Why it sells:** "You're visible on general questions but invisible on the ones that convert" is a diagnosis an agency can act on — and it's the buyer-stage story the market says matters most.

## 7. Feature 4 — Competitor-gap discovery (G4) ★ highest-signal source

Research: *"Gaps where rivals get cited but you don't = confirmed demand, go there first."*

- You already run competitor comparisons (`comparison_prompt_results`) and fan-out (`query_fan_out_results` links `original_prompt_id`). When a **competitor appears and the brand doesn't**, that prompt/sub-query is **proven live in the AU market with a real winner**.
- Emit those as `prompt_candidates` with `discovery_method='competitor_gap'`, `evidence={competitor, engine, prompt}`, `confidence_label='confirmed'`.
- Also mine **fan-out sub-queries** where a competitor covers and the brand doesn't → new prompt candidates.
- Feeds the action layer: an absent-but-contested prompt is a *prioritised* content gap.

## 8. Feature 5 — Provenance, honesty & agency-supplied prompts (G5)

- **Provenance + confidence on every prompt** — `gsc_observed` / `competitor_gap` (observed → confidence `confirmed`) vs `llm_inferred` (→ `hypothesis`). Displayed in UI + reports. Protects against the worst failure: an agency noticing your "customer questions" aren't questions any customer asks.
- **Agency-editable prompts** — agencies *know* their clients' customers. Let them add/edit prompts (`source='custom'`, `provenance='agency_supplied'`, **`brand_id` set — brand-scoped, never global**, PI-13). Cheap, a relevance win **and** a stickiness feature. **Review-path unification (PI-15):** the shipped Niche Explorer wizard stays as-is for onboarding; all post-onboarding discovery (`gsc`/`competitor_gap`/`autocomplete`/`agency`) flows through `prompt_candidates` — both gates converge on identical brand-scoped insert semantics.
- **Optional autocomplete/PAA grounding** — AU-locale autocomplete/People-Also-Ask as a further evidence source (`discovery_method='autocomplete'`).

## 9. UI — a NET-NEW "Prompts" tab (PI-21: FIX17 has no prompt-management surface today)

- **Nav placement (anti-nav-orphan):** a **Prompts tab on the brand page** (brand tabs, after Visibility) — reachable by click, not URL-only. Acceptance check: navigate to it from the brand page without typing a URL.
- **Routes** (each: Better Auth session + `setRlsContext` + `assertBrandAccess` + `subscriptions.tier` gate): `GET/POST /api/brands/[id]/prompts`, `GET/PATCH /api/brands/[id]/prompt-candidates`.
- **Prompt list:** the brand's effective set (brand-scoped first, then global by `rank` — PI-19), with provenance badge (Observed/Inferred), commercial weight, efficacy label, buyer stage (`category`), persona (`persona_tag`), and the tier-cap line showing which prompts actually execute.
- **Candidate review** (Growth+/Agency): pending `prompt_candidates` with evidence + Accept/Edit/Reject — the PI-INV-3 human gate — including the PI-19 displacement preview ("accepting this replaces prompt #10").
- **Commercial Visibility** next to the canonical score (with explainer). All NUMERIC reads `Number()`-coerced (PI-20).
- FIX17 tokens/components; `ConfidenceBadge`; tabular-nums; both themes; mobile = stacked list; EmptyState for no-candidates.

## 10. Tiering & cost

| Feature | Tier | Cost |
|---|---|---|
| Efficacy loop (learning) | all (invisible) | ~zero (DB aggregate) |
| Commercial weighting | all | zero |
| Provenance display | all | zero |
| Competitor-gap candidates | **Growth+** | ~zero (reuses existing audit data) |
| Autocomplete/PAA grounding | **Growth+** | small per-query API cost (compliant provider — PI-14), budget-capped |
| GSC grounding *(net-new integration)* | **Growth+** | zero LLM (GSC API) + build cost |
| Agency-supplied prompts | **Agency+** | zero |
| Niche Explorer (existing) | Free 3 / Growth+ 10 | ~A$0.001 |

Tier source = **`subscriptions.tier`** (never `organizations.tier`). Any LLM use respects `market_ai_budget_policies`.

## 11. Invariants preserved (no breakage)

- **`RUNS_PER_PROMPT = 5` + Wilson CI unchanged** — scoring math untouched.
- **Canonical visibility score unchanged**; Commercial Visibility is additive (PI-INV-2).
- **`serve()=25/25`** — no new Inngest function. `audit/complete` already has **six** listeners; efficacy is a `step.run()` **inside `calculate-share-of-voice`** (not tier-gated, so it always fires) — PI-6.
- **All new columns nullable** → every existing query (incl. `retiredAt IS NULL` filters) works unchanged (PI-INV-1).
- **RLS** — `prompt_candidates` is a **tenant table**: RLS enabled, org-scoped (USING + WITH CHECK). `prompt_efficacy` is a **global table (RLS DISABLED, no `organization_id`)** — the canon's established class (`prompt_volume_estimates`, `sampling_policies`, `prompt_pack_coverage`…); safe because it stores **counts only, never brand identifiers** (PI-5).
- **`assertBrandAccess()`** on all brand-scoped prompt routes.
- **Nothing enters or leaves the pack silently** (PI-INV-3) — human review gate.
- **Efficacy excludes sample/demo orgs and retired prompts** (PI-10) — matching `simulate-query-fan-out`'s established filters; the demo brand must never pollute real AU efficacy data.
- **Appearance reads `citations.brandMentioned` via `citations → audits`** — `citations` has **no `brand_id`** (PI-9).
- **Efficacy is per (prompt, region, engine) and counts executions, not audits** (PI-7/PI-8) — tiers run different prompt/engine sets, so a naïve denominator would produce confidently wrong labels.
- **Brand-specific prompts are brand-scoped, never global** (PI-13) — `brand_id IS NULL OR brand_id = :brandId` in audit prompt selection; one org's prompts never visible to, or executed for, another org.
- **No direct Google autocomplete/PAA scraping** (PI-14) — compliant API only; legality is non-negotiable.
- **Pack mutations are versioned, batched, and coverage-checked** (PI-16/17/18) — `vertical_packs.version` bumps on every accepted batch; retirements never violate `prompt_pack_coverage.required_template_keys`; trends flag version boundaries. PI-INV-3 (human gate) is thereby a *correctness* requirement, not just policy.
- Explainability Contract: every new surface carries `confidence_label`.

## 12. Rollout (each step independently shippable, all reversible)

1. **Schema migration** — the 4 nullable columns + 2 tables (both DBs: `visibleau` **and** `visibleau_prod`). Zero behaviour change.
2. **Efficacy loop** — compute `prompt_efficacy` on audit complete. Invisible; starts accumulating the moat immediately. *(Do this first — it needs volume, so start collecting ASAP.)*
3. **Provenance + commercial weight** — backfill (`curated` → provenance NULL/legacy; weights from `category`); display.
4. **Competitor-gap candidates** — mine existing comparison/fan-out data (no new audit cost).
5. **Autocomplete/PAA grounding** — cheap, no OAuth, works for every brand immediately (§5a).
6. **GSC grounding** — **net-new build**: Google OAuth + Search Console API + encrypted token storage + review UI (§5b, PI-1). Later because it's a real integration, not a reuse.
7. **Agency-supplied prompts + candidate review UI**.
8. **Commercial Visibility metric** — alongside the canonical score.

## 13. Open questions

- OQ1. `discrimination_score` formula — variance-based vs the simple "distance from 50% appearance" heuristic? (Start simple; refine with data.)
- OQ2. Minimum `runs_observed` before an efficacy label is trusted (align with `sampling_policies` minimums)?
- OQ3. Should high-efficacy prompts discovered in one org's audits be promoted into the **shared** vertical pack (benefiting all)? *(Aggregate-only, no tenant data — but confirm it's acceptable; recommend yes, it's the compounding asset.)*
- OQ4. GSC connection — per-brand agency-initiated OAuth (recommended) vs client-initiated?
- OQ5. Auto-retire dead prompts, or always operator-reviewed? *(PI-INV-3 says reviewed — and PI-16/17/18 make review a correctness requirement. Confirm.)*
- OQ6. Pack-mutation cadence — quarterly batches vs monthly? (Longer windows = cleaner trends; shorter = faster learning.)
- OQ7. The real tier prompt-selection mechanism (`ORDER BY rank`? subset tables?) — repo verification required before wiring promotion (PI-18).

---
*Grounded in v8.70 as written — `vertical_pack_prompts` Phase 1 columns, `source`/`persona_tag`/`branded_intent`, the 336-prompt AU base pack, Niche Explorer, RUNS_PER_PROMPT=5 + Wilson CI, `query_fan_out_results.original_prompt_id`. **Confirm against built code before implementation.** The learning loop (§4) is the highest-value item and the only truly un-copyable one — but it requires real audit volume, so it sharpens only when real agencies run real audits.*
