# VisibleAU — Feature LLD: Presence Lenses (Local vs Global, built to scale)

**Version:** 2.0 (supersedes v1.0 — regenerated on a scalable, future-proof architecture after market/competitor/future-demand analysis)
**Date:** 5 July 2026
**Status:** Proposed feature — post-Phase-2 slot
**Owner:** Sri
**Canon analysed:** Phase 1 foundations v1.12 + sprint prompts + prototype; Phase 2 7-layer LLD v8.65 + sprint prompts + prototype (FIX 14). Related: multi-region PRD v0.2, the dual-scope complexity analysis, `visibleau-aeo-geo-market-analysis-2026-07.md`.

**Mandate:** distinguish **local presence** and **global presence** — scores, citations, share-of-voice — with clear separation across the app, industry-standard UX, a rich prototype, and configurable-not-hardcoded. **v2.0 addition:** do it on an architecture that is *highly scalable and easy to extend* so VisibleAU can keep pace with where the category is going, not just today's local/global ask.

**What changed from v1.0:** v1.0 modelled scope as a fixed two-value `presence_scope` enum ('local'|'global'). The market analysis below shows that would be a dead end — the category is fragmenting into *many* independent lenses (geography, persona, channel, vertical, modality). v2.0 generalises scope into a **config-defined Presence Lens registry** and ships local/global as the first two lenses, so future dimensions are added as **config, not code**. Everything else (config-driven, local-unchanged, no-blended-score, IntelCard-based UI, rich prototype) is preserved and strengthened.

---

## 1. Market / competitor / future-demand analysis (why generalise)

**The category is fragmenting, and the winning products track multiple independent lenses — not one geography split.** Directional signals (July 2026 research; treat vendor percentages as directional):

- **Engines are multiplying with distinct "retrieval fingerprints."** ChatGPT, Google AI Mode/Overview, Perplexity (Comet), Gemini, Copilot, Meta AI (in Instagram/Facebook feeds), Grok (cites X for trending), DeepSeek (favours technical/Stack Overflow), and regional engines (Baidu Ernie, Yandex) carving geography-specific dominance. Visibility is now **multi-surface**, and the surface set is growing.
- **"The new metrics pack" explicitly includes persona coverage.** Conductor's 2026 CMO report names sentiment, mentions, citations **and persona coverage across topics** as what marketers now demand — persona is becoming a first-class lens, not a nice-to-have. Scrunch already sells persona/funnel modelling.
- **Per-industry / per-market granularity is standard.** Conductor benchmarks across 10 industries / 22 subindustries (GICS); Profound covers ~10 countries. Competitors slice by **market and vertical**, not just "local vs global."
- **Agentic-commerce is a distinct channel.** Product/shopping visibility (ChatGPT Shopping, Amazon Rufus, Gemini shopping) is a separate lens from conversational chat — "brands invisible in AI search today will be invisible to AI purchasing agents tomorrow."
- **Modality and paid are coming.** Multi-modal citations (video/audio) and a $5B+ paid-AI-search channel are forecast by 2027 — future lenses (organic vs paid; text vs video vs audio).
- **The category is maturing into martech.** AEO is becoming a standard discipline with dedicated roles; CRM/martech platforms are expected to ship integrated AI-visibility dashboards by 2027. A **scalable, extensible platform** wins; a hardcoded one gets out-featured.

**Conclusion:** "Local vs Global" is one instance (the geography dimension) of a general need to measure presence through **any configurable lens**. Architect the general case, deliver the local/global case first. This is the competitive moat on the *engineering* side — VisibleAU adds new lenses (persona, channel, per-market, vertical) by config while competitors code them, and it compounds VisibleAU's product-velocity advantage.

---

## 2. Options considered

| Option | Design | Scales to persona/channel/per-market/vertical? | Verdict |
|---|---|---|---|
| **A** | Fixed `presence_scope` enum ('local'\|'global') (v1.0) | No — every new dimension is a schema + code change | Solves today, guarantees future rework |
| **B** | Config-defined *geography* scopes (local/global/per-market) | Partly — geography only; persona/channel still need rework | Better, still a dead end for non-geography lenses |
| **C ✅** | **Generalised, config-defined Presence Lens registry** — typed lenses (geography/persona/channel/vertical/…); results carry a `lens_id`; local/global ship as the first geography lenses | **Yes — new lenses are config rows, zero schema/code change** | **Recommended.** Scalable, future-proof, competitor-parity-ready; immediate local/global build is ~same effort as A |
| D | Full orthogonal dimension cube (every result multi-tagged across all dimensions simultaneously) | Yes, maximally — but heavy, complex, slow to build | Rejected — over-engineering / YAGNI now |

**Chosen: Option C.** It delivers the local/global mandate now and makes the *next* five things the market will demand cheap. It also shares its foundation with the multi-region work (per-market lenses = the multi-region markets), so it's not throwaway. The one deliberate boundary vs D: a result belongs to **one** lens (single-tag), not many simultaneously (§14 LP-INV-3) — which covers local/global/persona/channel/per-market/vertical as *separate* lenses without the cube's complexity; true orthogonal slicing is a documented future extension, not precluded.

---

## 3. Core concept — the Presence Lens

- A **Presence Lens** is a configurable way of measuring a brand's presence. Each lens has a **dimension** (`geography` | `persona` | `channel` | `vertical` | `custom`) and a **definition** (which queries/markets/sources/persona/channel it represents).
- MVP ships two `geography` lenses: **Local** (the brand's home market) and **Global** (a configurable set of target markets). The mandate's "local vs global" *is* the geography dimension's two lenses.
- **Lenses are data, defined in config** (`config_bundle_cache.resolved_config.presence_lenses`), resolved per brand via `ConfigBundleService` — never code constants. Adding a persona/channel/per-market/vertical lens is a config row.
- Results (audits, citations, SoV, trends, gaps) carry a **`lens_id`** discriminator. The **default lens is the home-geography Local lens** — so all existing data/logic maps to Local and is byte-identical.

---

## 4. Grounding (from the canon analysis)

- **Pipeline is single-market today:** `share_of_voice_snapshots`, `visibility_trends`, `query_fan_out_results`, `topical_coverage_gaps`, `citation_source_intelligence`, `brand_web_mentions`, `audits` carry no market/scope dimension; market is derived from `org.region`. → A lens discriminator must be introduced (defaulting to Local preserves everything).
- **Config substrate exists:** `config_bundle_cache.resolved_config` (market-keyed, one active per tuple, `ConfigBundleService.activate/resolve`), `provider_market_capabilities`, `prompt_pack_coverage`, `sampling_policies`, budget/quality policies — all market-keyed. `organizations.region` enum + `region→market_code` mapper. → The lens registry lives here.
- **UI substrate exists:** `IntelCard` (`layer,label,value,max,delta,unit`; suppresses `/100` with `unit`; neutral zero-delta pill; BK4 ARIA on the score bar) renders every score. `citations.cited_source_type` already carries AU-specific source categorisation to extend. → One component change propagates app-wide.

---

## 5. Data model

### 5.1 The lens registry (config-backed, extensible)
Lenses are primarily a **config artifact**; a thin table materialises them for FK integrity + fast joins, synced from config on `ConfigBundleService.activate()`.
```sql
CREATE TABLE presence_lenses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID REFERENCES organizations(id),   -- NULL = global/market-pack default lens; non-NULL = brand/org override
  key               TEXT NOT NULL,                        -- 'geo_local' | 'geo_global' | 'geo_nz' | 'persona_evaluator' | 'channel_shopping' | ...
  dimension         TEXT NOT NULL,                        -- 'geography' | 'persona' | 'channel' | 'vertical' | 'custom'
  label             TEXT NOT NULL,                        -- display, from config.display
  definition        JSONB NOT NULL,                       -- see §9 (markets/query_pack/source_rules/persona_def/channel_def)
  display           JSONB NOT NULL,                       -- {accent_token, glyph, sort_order, ...}
  min_tier          TEXT,                                 -- gate by tier (config, not code); NULL = all tiers
  is_default        BOOLEAN NOT NULL DEFAULT false,       -- the default lens within its dimension (exactly one per dimension per brand)
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, key)
);
-- Seeded from config; RLS: org-scoped where organization_id set, readable defaults where NULL.
```

### 5.2 The lens discriminator on the pipeline (additive; defaults to Local)
```sql
-- lens_id default resolves to the home-geography Local lens via a trigger/app default,
-- so existing rows + local logic are byte-identical (backfill sets Local).
ALTER TABLE audits                       ADD COLUMN lens_id UUID REFERENCES presence_lenses(id);
ALTER TABLE citations                    ADD COLUMN lens_id UUID REFERENCES presence_lenses(id);
ALTER TABLE share_of_voice_snapshots     ADD COLUMN lens_id UUID REFERENCES presence_lenses(id);
ALTER TABLE visibility_trends            ADD COLUMN lens_id UUID REFERENCES presence_lenses(id);
ALTER TABLE query_fan_out_results        ADD COLUMN lens_id UUID REFERENCES presence_lenses(id);
ALTER TABLE topical_coverage_gaps        ADD COLUMN lens_id UUID REFERENCES presence_lenses(id);
ALTER TABLE citation_source_intelligence ADD COLUMN lens_id UUID REFERENCES presence_lenses(id);
ALTER TABLE brand_web_mentions           ADD COLUMN lens_id UUID REFERENCES presence_lenses(id);
```
- **UPSERT keys** gain `lens_id`, e.g. `visibility_trends` UNIQUE(brand_id, period_label, period_type) → **+ lens_id**; `topical_coverage_gaps` UNIQUE(brand_id, vertical, topic_cluster) → **+ lens_id**. Existing rows carry the Local lens → no collision.
- **Indexes** gain `lens_id` (e.g. `sov_brand_engine_idx` → `(brand_id, lens_id, engine, calculated_at DESC)`).
- *Why a UUID FK, not the `presence_scope` TEXT of v1.0:* a FK to a typed registry is what makes it general (any dimension), self-describing (dimension/label/definition travel with the id), and configurable — the whole point of Option C.

### 5.3 Citation geography (extends `cited_source_type`)
```sql
ALTER TABLE citations ADD COLUMN source_geography TEXT;   -- 'local' | 'global' | 'unknown' (classified from config rules)
-- lens_id = the lens whose queries produced the citation; source_geography = where the cited source lives.
```

### 5.4 Fast headline reads (per lens)
```sql
CREATE TABLE presence_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  lens_id UUID NOT NULL REFERENCES presence_lenses(id),
  score_composite NUMERIC(5,2), mention_rate NUMERIC(5,2), citation_rate NUMERIC(5,2), brand_share NUMERIC(5,2),  -- % (0-100)
  sample_quality TEXT NOT NULL, delta_vs_previous NUMERIC(5,2),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(brand_id, lens_id)
);   -- RLS enabled, org-scoped, assertBrandAccess on reads.
```

---

## 6. Scoring — per lens

- **Local lens = today's composite, unchanged** (LP-INV-1: byte-identical for the Local lens).
- **Every other lens = the same scoring modules** applied to that lens's tagged audits/citations. Scoring is lens-agnostic once rows carry `lens_id` — **no new scoring math**, ever, for any future lens.
- **Confidence per lens, independently** (`sampling_policies` + `lib/confidence-labels/classify.ts` + Wilson CI). New lenses start at "Insufficient data" honestly.
- **No blended score across lenses** (LP-INV-2). Comparison views show lenses side-by-side, never averaged.
- **Per-lens scoring weight overrides** allowed from `definition.scoring_weight_overrides` (e.g. down-weight local-identity signals for a Global lens) — config, defaulting to standard weights.

---

## 7. Citations — per lens + source geography

Two orthogonal, separately displayed reads (both config-driven): by **query lens** (`lens_id`) and by **source geography** (`source_geography`). Surfaces show, per lens: citation rate, cited sources grouped by geography, and the existing [GAP 9] mention-vs-cited divide *within* the lens. Local citation strength (cited by local sources when local buyers ask) is the hero; global secondary.

---

## 8. Services / pipeline

- **`run-audit.ts` is lens-aware** (default = Local lens; unchanged behaviour). For any other lens it resolves that lens's `query_pack`/markets/channel from config and runs it as its own audit lineage tagged with `lens_id`. The Local path is untouched.
- **Aggregation groups by `lens_id`** (`aggregate-visibility-trend.ts`, `calculate-share-of-voice.ts`); Local grouping unchanged. `refresh-presence-scores.ts` maintains `presence_scores` per lens.
- **`classify-citation-geography.ts`** sets `source_geography` from config rules (TLD/domain/signal lists) — no hardcoded domains.
- **Cost/quality gated per lens** via `BudgetPolicyService` (lens-specific budget policy) + quality gates. Non-Local lenses are opt-in.

---

## 9. Configurability — the lens config schema (the "not hardcoded" mandate, generalised)

All lenses live in `config_bundle_cache.resolved_config.presence_lenses` (market-pack defaults) + a `brand_scope_overrides` JSONB on `brands` (merged on top). Adding an *entire new dimension* (persona, channel) is a config change — **no code**.
```jsonc
{
  "default_lens_by_dimension": { "geography": "geo_local" },   // which lens each dimension opens on
  "dimensions_enabled": ["geography"],                          // turn on persona/channel/vertical later here
  "lenses": [
    { "key": "geo_local",  "dimension": "geography", "label": "Local (Australia)",
      "definition": { "market_codes": ["AU_EN"], "query_pack": "au_local_v1",
                      "competitor_set_ref": "au_default", "source_geography_rules": {"local_tlds": [".au",".nz"], "local_domains_ref": "au_directories", "default": "global"},
                      "scoring_weight_overrides": {} },
      "display": { "accent_token": "--lens-geo-local", "glyph": "region", "sort_order": 1 } },
    { "key": "geo_global", "dimension": "geography", "label": "Global",
      "definition": { "market_codes": ["US_EN","UK_EN"], "query_pack": "global_v1",
                      "competitor_set_ref": "global_default", "scoring_weight_overrides": {"entity": 0.5} },
      "display": { "accent_token": "--lens-geo-global", "glyph": "globe", "sort_order": 2 },
      "min_tier": "growth" }
    // FUTURE (config only, no code): 
    //  { "key":"geo_nz","dimension":"geography","definition":{"market_codes":["NZ_EN"],...} }        ← per-market (multi-region)
    //  { "key":"persona_evaluator","dimension":"persona","definition":{"persona_prompt_pack":"...","persona_def":{...}} }
    //  { "key":"channel_shopping","dimension":"channel","definition":{"channel":"ai_shopping","query_pack":"shopping_v1"} }
    //  { "key":"vertical_tradies","dimension":"vertical","definition":{"vertical":"tradies"} }
  ],
  "thresholds": { "score_bands": { "green": 75, "amber": 45 } }
}
```
- **Admin-editable + versioned** via the existing `ConfigBundleService.activate()` (one active per tuple). Retuning "what is Global", adding NZ, or turning on the persona dimension = a config edit, not a deploy.
- **`config:validate` extension** checks: enabled dimensions have ≥1 lens with a default; each lens has a `query_pack` + dimension-appropriate definition; gated lenses have `min_tier`.

---

## 10. UI / UX — clear separation, industry standards, generalised

**Principle: Local is the hero; other lenses strengthen it; never merge into one number.** The UI renders whatever lenses are configured, grouped by dimension — but MVP shows only the `geography` dimension (Local/Global), so today it looks exactly like the mandate while being ready for more.

- **Lens control (generalised segmented control).** For the active dimension, a segmented control renders its lenses — MVP: **`[ Local · Global · Compare ]`** (industry-standard segmented pattern), Local default (from config). Each segment carries a **glyph** (region marker / globe) + the config accent token, so the whole view shifts accent per lens (pre-attentive "which lens am I in"). URL-persisted (`?lens=geo_local`) → drives every card/table/chart. When more dimensions are enabled later, a lightweight dimension switcher appears above it (Geography / Persona / Channel) — same control, more tabs, zero redesign.
- **Hero — `PresenceCard` (wraps IntelCard).** Overview shows a split summary: **Local** (hero, larger, region accent, own confidence label) beside **Global** (secondary, muted, globe accent, own confidence) — two numbers, two accents, two glyphs, **never one blended figure**. Reuses IntelCard internals (score-bar `role="img"`+BK4 aria-label, `unit`, delta semantics). Generalises to N lens cards when more lenses exist.
- **Compare view.** Side-by-side comparison table (Composite, Mention %, Citation %, SoV) across the dimension's lenses + paired sparklines per metric; an explicit labelled gap ("+41 Local") — never an average.
- **Across the app** (propagates via IntelCard + `lens_id` filter): **Overview** (split summary + control), **Visibility** (SoV/trends/fan-out/topical filter by active lens), **Trust/Citations/Signals** (citation rate + cited-source breakdown split by lens *and* by `source_geography`; [GAP 9] divide per lens), **Reports** (a **Local Presence** section (hero) + **Global Presence** section (secondary), each geo-marked, scopes selectable, white-label safe), **Workflow** (fix tasks tagged by the lens they improve; filterable; explainability contract per lens), **Autopilot** (lens-aware).
- **Honesty & gating (trust-preserving):** a lens below sampling minimum shows **"Insufficient data — run a Global audit"** with a CTA, never a fake number; a tier-gated lens shows an **upgrade affordance** (config `min_tier`), not a dead control.
- **A11y & responsive:** control is an ARIA `tablist`/`radiogroup` with `aria-current`; glyphs have text labels (colour-blind safe, AA per BK4); score bars keep `role="img"`; cards stack on mobile (Local first), control full-width.

---

## 11. Prototype spec (Figma-style, rich; ships Local/Global)

Token-driven, dark + light (`[data-theme]`), reusing the Phase 2 token system; new lens accent tokens are **config-mapped** so lens colours are data.
- **Lens accents:** `--lens-geo-local: #1E88E5` (+ `-soft: color-mix(in srgb, var(--lens-geo-local) 12%, transparent)`); `--lens-geo-global: #7E57C2` (+ soft). Numerics tabular-nums + slashed-zero.
- **Lens segmented control:** 40px, pill container radius 10px `background var(--surface-2)`, active segment `var(--surface-0)` + `--elevation-1` + 2px accent left-border in the active lens token; icon 14px (region/globe) + label 13px; 150ms indicator slide; full-width ≤640px. (Dimension switcher, when present: text tabs above, 13px, underline-active.)
- **PresenceCard (split):** 2-col grid gap 16px (stacks ≤720px); shared header "Presence" + active-lens chip. Local sub-card (hero): padding 20px, radius 14px, `var(--surface-1)`, 3px top accent `--lens-geo-local`, region glyph + "Local (Australia)" 12px `--text-secondary`, score 40px bold tabular, 6px score bar (fill accent / track soft), delta pill 11px (green up / red down / **grey ±0** per CT-02), confidence chip 11px. Global sub-card: same, muted (32px score, accent opacity), globe glyph, `--lens-geo-global`; empty-state variant: dashed border + globe + "Insufficient data" + primary CTA "Run Global audit".
- **Compare view:** comparison table rows Composite/Mention %/Citation %/SoV, columns Local(accent)/Global(accent)/Gap; paired sparklines 28px (Local/Global lines in accents, shared legend); Gap pill labelled.
- **Citations (lens split):** sub-toggle "By query lens / By source origin"; cited-source list with geo badges (region chip / globe chip), count + green/amber presence dot; [GAP 9] two-bar mini chart per lens.
- **Report sections:** "Local Presence" (region marker, `--lens-geo-local` rule) + "Global Presence" (globe, `--lens-geo-global` rule), each hero score + SoV + top cited sources + top 3 fixes; white-label safe.
- **Motion:** lens switch cross-fades values (120ms) + slides indicator; number count-animate; respects `prefers-reduced-motion`.

---

## 12. Scalability & future-fit (the competitive point)

Because a lens is typed config + a single `lens_id` discriminator, each future demand from §1 is **config, not a rebuild**:
- **Per-market (multi-region: NZ/UK/US)** → new `geography` lenses; *shares plumbing with the multi-region PRD* (build once).
- **Persona coverage** (the "new metrics pack") → a `persona` dimension with persona lenses (persona prompt packs); UI gains a Persona tab via the same control.
- **Channel / agentic shopping** → a `channel` dimension (chat vs ai_shopping vs voice); ties into the AI-Shopping-Visibility PRD.
- **Vertical/industry segmentation** → a `vertical` dimension (reuses Phase 1 `verticalEnum`).
- **New engines** (Grok/DeepSeek/Copilot/Meta AI/regional) → already the `engine` column + `provider_market_capabilities` config; orthogonal to lenses.
- **Modality (video/audio) and paid-vs-organic** → future dimensions or `custom` lenses; the model doesn't preclude them.

None of these require touching the scoring engine, the results schema, or the UI framework — only config (+ a query pack). That is the engineering moat: VisibleAU adds a lens by config while competitors ship code, and it compounds the product-velocity advantage.

---

## 13. Tier gating & cost
- Local lens: all tiers that have visibility today (unchanged). Non-Local lenses gated by config `min_tier` (Global default `growth`) or packaged as add-ons; gated segment shows an upgrade affordance. Lens-specific `market_ai_budget_policies` + per-tier run caps; non-Local lenses are opt-in (user-triggered), never automatic on entry tiers. Reuses `BudgetPolicyService`.

## 14. Invariants
- **LP-INV-1 — Local unchanged.** With only the Local lens, all scores/tables/UI numbers are byte-identical to pre-feature (full regression, Phase-1-unchanged discipline).
- **LP-INV-2 — No blended score.** Lenses are never averaged into one figure (UI/report/API); Compare = side-by-side only.
- **LP-INV-3 — Single-tag boundary.** A result belongs to exactly one lens (not multiple dimensions simultaneously). Orthogonal slicing (geography × persona in one cell) is a documented future extension (a `lens_membership` join table), deliberately out of scope now to avoid the cube complexity of Option D — the model doesn't preclude it.
- Preserves Phase 2 invariants: tier source = `subscriptions.tier`; `TIER_ENGINES`/`selectModel`; `assertBrandAccess` on every brand-scoped read; explainability contract per scored surface (now lens-qualified); percentages 0–100, `mention_source_ratio` 0–1; IntelCard `unit`/zero-delta; BK4 ARIA. Manifest grows by 2 (`presence_lenses`, `presence_scores`); GAP count unaffected; `serve()` unaffected (Local reuses the audit function; a `run-lens-audit` event may be added if preferred).

## 15. Rollout
1. **Registry + discriminator + config, Local-only, zero customer change** (ALTERs default Local, `presence_lenses`, `presence_scores`, config plumbing, `config:validate` extension). Ship dark; **LP-INV-1 regression green**.
2. **Aggregation + citation classifier lens-aware** (Local grouping unchanged); populate `presence_scores` for Local.
3. **UI: lens control + PresenceCard + per-lens filtering** across surfaces, Local-only visible (Global gated/empty). Proves app-wide propagation with no non-Local data.
4. **Enable Global lens** — global query pack, global audit lineage, budget policy, geography rules; Global live behind the tier gate.
5. **Reports/Workflow/Autopilot** lens-awareness; Compare polish.
6. **Future lenses on demand** (per-market with multi-region; persona; channel) — config + query packs, no rearchitecture.

**Sequencing:** shares the scope/market plumbing with the multi-region activation — coordinate; build it once. Standalone ~3–4 sprints; on top of multi-region ~1–1.5 (see complexity analysis).

## 16. Tests / acceptance
- LP-INV-1 (Local byte-identical), LP-INV-2 (no blended score anywhere), LP-INV-3 (single-tag).
- Lens registry: config → `presence_lenses` sync on activate; default lens per dimension enforced.
- Discriminator: existing rows default Local; non-Local audits tag correctly; UPSERT keys separate lenses without collision.
- Per-lens scoring/confidence independent; new lens "Insufficient data" below minimum.
- Citation geography from config (no hardcoded domains); brand override merges.
- **Configurability**: adding a lens (incl. a whole new dimension like persona) changes behaviour with **no code change**; `config:validate` catches incomplete lens/dimension config.
- Tier gate per config `min_tier`; upgrade affordance not a dead control. Cost gated per lens; Local cost unchanged.
- A11y (tablist/radiogroup + aria-current; glyph labels; score-bar role="img"); report sections render + white-label safe.

## 17. Open questions
- OQ1. Global default = fixed set (US_EN+UK_EN) or "all enabled non-local markets"? (Config supports either.)
- OQ2. Citation: both lenses (`lens_id` + `source_geography`) in MVP, or `lens_id` first?
- OQ3. Non-Local audits: always manual, or schedulable per tier?
- OQ4. Compare view in MVP, or Local/Global toggle first?
- OQ5. **Sequencing with multi-region** — build the lens plumbing here or as the shared multi-region foundation? (Materially affects effort.)
- OQ6. Which future dimension is next after geography — persona (the "new metrics pack") or channel (agentic shopping)? (Informs how the dimension switcher is designed now.)

---

*Draft for review. Grounded in Phase 1/Phase 2 canon as written (v8.65); results tables are Sprint 3 (complete) — confirm against built code before a sprint estimate. Architecture chosen for scalability: scope is a typed, config-defined lens registry, so local/global ships now and persona/channel/per-market/vertical are future config, not code. Market claims are directional (July 2026 research) — re-verify before external use.*
