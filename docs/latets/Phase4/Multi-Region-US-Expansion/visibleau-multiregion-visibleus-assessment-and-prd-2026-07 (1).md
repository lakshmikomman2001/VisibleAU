# VisibleAU → Multi-Region (VisibleUS) — Market-Fit Assessment + Architecture PRD

**Version:** 0.1 (draft for review)
**Date:** 5 July 2026
**Status:** Strategic proposal — post-Phase-2 horizon
**Owner:** Sri
**Related canon:** Phase 2 7-layer LLD (Platform Foundation is already `market_code`/`locale`-keyed); `visibleau-aeo-geo-market-analysis-2026-07.md`; `visibleau-prd-new-opportunities-2026-07.md`

**How to read this:** Part 1 is the honest answer to "does VisibleAU fit the US market?" — it's blunt on purpose, because it changes how you should scope Part 2. Part 2 is the multi-region architecture PRD (one codebase, multi-tenant, region-partitioned), which is worth building **regardless of the US GTM decision**.

---

# Part 1 — Does VisibleAU fit the US market?

## Verdict

**The product can serve the US. The positioning cannot win there.** VisibleAU's entire differentiation is AU-specific, and the AU-first moat is precisely the thing that does not transfer across the Pacific. Building the **multi-region architecture is a yes** (cheap, high-optionality, good engineering). Launching **"VisibleUS" as a head-on US market assault is a no** — not now, not solo, not against this field. The smart move is to build the region capability and point it first at markets where your localization advantage *does* transfer and the competition is thinner (NZ, then UK/Canada), plus AU brands selling into the US — and treat a genuine US-market entry as a separate, later, narrowly-wedged (and probably funded) decision.

## Why the AU moat doesn't transfer

Everything that makes VisibleAU defensible in Australia is a local artefact:

| VisibleAU's AU edge | US equivalent | Transfers? |
|---|---|---|
| ABN validation (Brand & Entity) | EIN / DUNS — no clean public lookup like ABR | No — becomes a weaker/absent signal |
| AU business directories | US directory set (BBB, Yelp, etc.) | Rebuildable, but not an edge |
| AUD pricing / GST awareness | USD / sales-tax (per-state) | Neutral |
| On-shore data / "sovereign AI" appeal | US buyers don't value AU residency | No |
| ProductReview.com.au as a trust source | G2, Trustpilot, Yelp | Rebuildable, not differentiating |
| AU query localization / competitor sets | US localization | Table stakes for everyone |
| AU word-of-mouth / local network | None | No |

Strip those away and, in the US, VisibleAU is "another AI-visibility tool with an action layer." The action layer is real, but it's not unique in the US — and you'd be asserting it as a late entrant with no brand, no capital, and no local network.

## The US competitive reality (from this session's research)

The US is the most crowded, best-funded AI-visibility market on earth:

- **Profound** — ~$155M raised, ~$1B valuation, Fortune 500 clients, a ~1.5B-prompt consumer panel (data you cannot replicate), Shopping module, Prompt Volumes.
- **Peec** (~$29M), **Goodie** (full agentic-commerce suite + MCP), **Otterly** (Gartner Cool Vendor, $29 entry), **Brandlight**, **AthenaHQ**, **Scrunch**, **Evertune** — all real, funded, shipping weekly.
- **Incumbent bolt-ons** — Semrush AI Visibility Toolkit ($99), Ahrefs Brand Radar, HubSpot AEO (free grader + $50) — bundled into contracts brands already pay for.
- **Dozens of budget challengers** ($19–99) already fighting for the low end.

Against that, a solo, weekend-pace, unfunded entrant competing on features loses on funding, data depth, brand, and shipping velocity simultaneously. US customer acquisition is expensive and offers you no local advantage.

## The one wedge that isn't closed — and its caveats

The market research surfaced a genuine, still-open gap even in the US: **SMBs are underserved.** Multiple vendors explicitly tell SMBs "none of these tools are the right starting point — buy a one-time audit first." VisibleAU's audit-first, action-included, SMB-priced model fits that slot better than the enterprise leaders do.

But the caveats are heavy:
- The US SMB low-end is already crowded with $19–59/mo challengers.
- SMB is low-ACV and high-churn; winning it at scale needs cheap, high-volume acquisition (content/SEO/partnerships) that takes years to build — hard solo.
- Your AU-specific SMB advantages (ABN, local trust, AUD, sovereign-data) don't apply, so even in the SMB slot you're differentiating on price + UX + action-layer, not moat.

So: a US SMB wedge is *possible*, but it's a fresh company-building problem, not a "flip a region flag" win.

## The smarter framing

Separate two decisions that "VisibleUS" conflates:

1. **Multi-region *capability*** — build it (Part 2). It's cheap because Phase 2 is already market-aware, it de-risks and future-proofs, and it unlocks nearer, easier markets.
2. **US-*market* entry** — defer as a distinct, later strategic bet with its own wedge, and don't assume it needs to be the first region you actually sell into.

Where to point the capability first (in order of "moat transfers × competition thinness × effort"):
- **NZ (NZ_EN)** — near-identical to AU, trivial to localize (NZBN instead of ABN, NZD, similar directories/trust sources), a fraction of the US competition, and your AU playbook mostly ports. **This is the natural first expansion and the cheapest proof of the multi-region path.**
- **AU brands selling into the US** — serve them *from* the AU product with a US market pack (they want to know if US shoppers/AI recommend them). Same customers, new value, no US GTM war.
- **UK / Canada (en-GB / en-CA)** — English, localization-driven differentiation still has some room, less saturated than the US.
- **US (US_EN)** — last, and only with a narrow wedge (a specific vertical, or the SMB one-time-audit motion) — or with funding.

**Bottom line for the message you asked for:** Don't build VisibleUS to fight Profound. Build multi-region to serve NZ/UK/CA and AU-outbound brands, keep US_EN as a supported market for those AU-outbound customers and as an option, and revisit a dedicated US assault only with a sharp wedge or capital. The architecture below is designed for exactly that — US is just one market pack among several.

---

# Part 2 — Multi-Region Architecture PRD

## 2.1 The key insight: you already built the hard part

Phase 2's Platform Foundation (Sprint 1) was designed market-aware from day one. Every foundational table is keyed by `market_code` + `locale`, and the config CLI already takes `--market`/`--locale`:

- `config_bundle_cache` (market_code, locale, segment)
- `market_ai_budget_policies` (market_code, segment, use_case)
- `sampling_policies` (market_code, segment, use_case)
- `metric_quality_gates` (metric_key, market_code)
- `provider_market_capabilities` (provider_key, model_key, market_code, locale)
- `prompt_pack_coverage` (market_code, locale, segment, use_case)

Today there's exactly one market row set: `AU_EN` / `en-AU`. **Adding a market is largely a data + config exercise, not a re-architecture.** The genuinely new work is three things: (1) a **region layer** above markets with tenancy + routing, (2) **data residency / region-partitioned storage**, and (3) a **market-pack abstraction** to lift the AU assumptions that are currently hardcoded outside the config tables.

## 2.2 Goals & non-goals

**Goals**
- G1. One codebase serves multiple regions; region behaviour is **configuration, not forks**.
- G2. Multi-tenant, with each tenant bound to a **home region**; tenant data is region-scoped and isolated.
- G3. Support data residency where a region requires it (extensible to EU later).
- G4. Adding a new market (NZ_EN, US_EN, en-GB…) is a defined, low-risk "market pack" procedure.
- G5. Preserve all existing Phase 2 invariants (tier source = subscriptions.tier, `TIER_ENGINES`, `selectModel`, `assertBrandAccess`, explainability contract, quality/sampling gates, two-DB dev/prod mode).

**Non-goals**
- N1. No per-region codebase fork (single codebase, region-config-driven).
- N2. No re-architecture of the scoring engine (it's already market-parameterised).
- N3. Not building EU/GDPR in the MVP — but the design must not preclude it.
- N4. Part 2 does not itself commit to a US GTM (see Part 1).

## 2.3 Region model (new concept above "market")

Introduce **Region** as a first-class entity that groups markets and carries residency + billing + hosting attributes:

- A **Region** (e.g., `AU`, `NZ`, `US`, `UK`, `CA`, future `EU`) has: data-residency policy, default currency, hosting/DB binding, compliance profile, and one-or-more **Markets**.
- A **Market** is the existing `market_code`/`locale` unit (e.g., `AU_EN`/`en-AU`, `US_EN`/`en-US`, `NZ_EN`/`en-NZ`). Region : Market is 1:many (a region can host several locales; MVP is 1:1).
- Every **tenant (organization)** has a `home_region`. All the tenant's brands, audits, and results live in that region's data store and are scoped to it.

## 2.4 Multi-tenant + multi-region data strategy

You specified "multi-region with multi-tenant database." Recommended approach — **region-partitioned storage with a region resolver**, chosen for data residency and clean isolation:

- **One database (or schema) per region**, each holding the multi-tenant data for that region's tenants (org-scoped RLS unchanged within the region). US tenants' data physically resides in the US store; AU tenants' in the AU store.
- A **region resolver** at the app/request layer determines the tenant's `home_region` from auth context and binds the request to that region's connection (extend the existing DB-connection layer; the rest of the code stays region-agnostic and reads region from context).
- **Global/config data** (the market-keyed config tables, provider capabilities, quality gates, prompt packs) can be **replicated to every region** (they're small, non-tenant, and change rarely) — so each regional store is self-sufficient and no cross-region call is on the hot path.
- **Cross-region isolation is structural** (separate stores) rather than only policy-based — a stronger guarantee than the single-DB `assertBrandAccess` alone, and the residency story enterprises expect.

Alternative (simpler, if residency proves a non-issue for the markets you actually sell into): single DB + `region` column on tenant + region-scoped RLS. **Recommendation:** design the region resolver + tenant→region binding now (so the app is region-aware), start AU+NZ in a single store if residency allows, and split to a dedicated US store when/if a US customer or compliance requires in-region data. The app code is identical either way; only the connection binding differs. This avoids premature ops cost while keeping the path open.

## 2.5 The market-pack abstraction (the core new work)

A **Market Pack** is the bundle of everything region/market-specific, so a new market is "add a pack," not "edit code." Most of it already lives in the market-keyed config tables; the job is to (a) add rows for the new market and (b) lift the remaining hardcoded AU assumptions into the pack.

A Market Pack defines:
- **Identity/entity signals** — the local business-identity check (AU: ABN via ABR; NZ: NZBN; US: EIN/DUNS or *none* — degrade gracefully where no clean public lookup exists), and local directory/citation sources.
- **Trust/review sources** — AU: ProductReview.com.au + Google; US: G2/Trustpilot/Yelp; per market.
- **Locale + currency + tax** — locale string, currency (AUD/NZD/USD/GBP), tax model (GST vs US sales tax vs VAT).
- **Prompt packs / query localization** — market-specific seed queries, "in [country]"/region modifiers, competitor sets.
- **Provider config** — `provider_market_capabilities` rows for the market (same engines; market-specific pricing/behaviour/availability — e.g., ChatGPT ads/shopping availability differs US vs AU).
- **Budget/sampling/quality policies** — `market_ai_budget_policies`, `sampling_policies`, `metric_quality_gates` rows (US LLM costs/behaviour may differ → its own budget policy).
- **Compliance/copy** — privacy-policy variant, consent copy, data-residency statement.
- **Scoring weights** — allow per-market weighting where a dimension's relevance differs (e.g., the ABN/EIN identity weight, or the llms.txt weight per the market-analysis finding).

**Refactor target:** audit the codebase for AU-hardcoded assumptions currently *outside* the config tables — ABN logic, ProductReview.com.au, AUD, GST, "Australia" query strings, AU directory lists — and route them through the Market Pack resolved from the tenant's market. This is the bulk of the engineering, and it's tractable because Sprint 1 already established the market-keyed pattern to extend.

## 2.6 Cross-cutting changes

- **Auth/onboarding** — sign-up captures/derives `home_region` (explicit selection or geo/ABN-style signal), binds the tenant, and routes to the region store. Existing Clerk→(note: Phase 2 canonical is Better Auth) tenancy extends with a region attribute.
- **Billing** — Stripe multi-currency (AUD/NZD/USD/GBP) and region-appropriate price books; tier tables unchanged (tier source stays `subscriptions.tier`), pricing per region.
- **Hosting/latency** — region-appropriate deployment (US customers served from US infra for latency + residency); Vercel/Supabase region config per region store.
- **LLM calls** — unchanged logic; `selectModel(tier, engine, task)` and `provider_market_capabilities` already parameterise per market; US_EN gets its own provider rows.
- **Reporting/UX** — region/market shown in reports; currency/locale formatting per market; white-label reports inherit market formatting.
- **Observability/governance** — the Sprint 8 governance layer (audit trail, residency, flags) extends with region context; residency flag becomes real per region.

## 2.7 Data model changes

New:
- `regions` — code (AU/NZ/US/…), name, residency_policy, default_currency, db_binding, compliance_profile, active.
- `market_packs` — market_code, region_code, locale, currency, tax_model, identity_provider (abn/nzbn/ein/none), review_sources (jsonb), directory_sources (jsonb), scoring_weight_overrides (jsonb), compliance_copy_ref, active.

Changed:
- `organizations` (or tenant table) — add `home_region` (FK regions), `market_code`, `locale`, `currency`.
- The market-keyed config tables — add rows per new market (no schema change).
- Anything currently assuming AU — reference the resolved Market Pack instead of constants.

Isolation: within a region store, the existing org-scoped RLS + `assertBrandAccess` are unchanged. Across regions, isolation is by separate store + tenant→region binding.

## 2.8 Rollout plan

1. **Region-enable the platform (no new market yet).** Add `regions`/`market_packs`, `home_region` on tenant, the region resolver + connection binding. AU becomes `region=AU, market=AU_EN` explicitly. Ship with AU-only; zero customer-visible change. *This is the real engineering milestone.*
2. **Extract the AU Market Pack.** Lift AU-hardcoded assumptions into the pack; prove AU still passes end-to-end (regression: AU scores/behaviour identical). 
3. **Add NZ_EN as the first new market.** Cheapest possible second market (NZBN, NZD, near-identical playbook). Proves the "add a pack" procedure and the multi-region path with minimal risk. **Recommended first go-live beyond AU.**
4. **Add US_EN as a supported market** — primarily to serve AU-outbound brands and to hold the option open; not a US GTM commitment. Decide US data store (dedicated US Supabase region) at this step based on residency needs.
5. **UK/CA and (later, if ever) a dedicated US market push** — separate GTM decisions per Part 1.

## 2.9 Effort & sequencing

- Steps 1–2 (region layer + AU pack extraction) are the substantive build — call it the "multi-region foundation" sprint(s), ideally right after Phase 2 closes so it lands on stable ground.
- Step 3 (NZ) is small once the pack procedure exists — largely data + a few localized sources.
- Step 4+ are incremental market packs.
- Do **not** start this mid-Phase-2 (Sprint 4 is in progress); it wants a stable Phase 2 base and would otherwise churn the foundation you're actively testing.

## 2.10 Risks & mitigations

- **R1. Premature US ops cost / GTM distraction.** → Region *capability* first; NZ/AU-outbound as first uses; US-assault deferred (Part 1).
- **R2. Residency creep (EU/GDPR).** → Region-partitioned design keeps EU addable without re-architecture; don't build it until needed.
- **R3. AU regression during pack extraction.** → Treat AU as the golden baseline; full regression that AU scores/behaviour are byte-identical after the refactor (mirrors the "Phase 1 unchanged" discipline).
- **R4. Hidden AU assumptions.** → Systematic grep/audit for AU constants (ABN, AUD, GST, "Australia", ProductReview) before declaring pack-complete.
- **R5. Cross-region data leakage.** → Structural isolation (separate stores) + tenant→region binding + tests that a tenant can never resolve another region's store.
- **R6. Cost blow-out from more markets × engines × queries.** → Per-market `market_ai_budget_policies` already gate this; set US/other budgets deliberately.

## 2.11 Success metrics

- Engineering: AU regression green post-refactor; "add a market" is a documented, sub-day procedure; cross-region isolation tests pass.
- Business: NZ (or AU-outbound US) first paying tenant on the new region path; time-to-add-market; % of code region-parameterised (no AU constants outside packs).

## 2.12 Open questions

- OQ1. First real market beyond AU — NZ (recommended) vs US-for-AU-outbound?
- OQ2. Storage: single store for AU+NZ initially, split US later — or per-region stores from day one?
- OQ3. US identity signal — is there an acceptable EIN/DUNS-based check, or does Brand & Entity degrade gracefully in the US (and is that acceptable)?
- OQ4. Billing: which currencies at launch (AUD + NZD first; USD when US market lands)?
- OQ5. Does any target enterprise segment force SOC 2 + in-region storage sooner than planned?

---

## Summary

- **Fit:** VisibleAU's product fits the US technically; its *moat* doesn't. Don't launch VisibleUS head-on against a $1B-funded field solo. **Build the multi-region capability; point it at NZ + AU-outbound + UK/CA first; keep US as a supported market and a later, narrowly-wedged (or funded) bet.**
- **Architecture:** The hard part (market-aware platform) is already built in Phase 2. The new work is a region layer (tenancy + routing + residency) and a market-pack abstraction to lift AU-hardcoded assumptions into config. It's a single codebase, config-driven, and should be built on a stable post-Phase-2 base — not now.

*Draft for review. The competitive/market claims draw on this session's July 2026 research (see the market-analysis doc for sources); re-verify specifics before external use.*
