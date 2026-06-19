# VisibleAU Phase 2 — SPRINT 1 PROMPT: Platform Foundation
# Version: 1.3 | Built against: LLD v8.66 (REVIEWED-r2) | Sprint: 1 of 9 | Duration: 4 weeks
# Source anchors: LLD §"PHASE 2 SPRINT 1 — PLATFORM FOUNDATION" (lines ~4760–5082),
# serve()/registry note (~4511), table inventory rows 1–7 (~8730), sprint plan (~8816).
# NOTE: exact line numbers are navigational, not literal — they may drift by a few lines
# between LLD copies (e.g. an added changelog annotation). Always open the cited region and
# confirm against content; per the handoff, the LLD wins over any number here.

> HOW TO USE THIS PROMPT: read §0 first, then paste §10 (the Claude Code prompt) into a
> fresh Claude Code session pointed at the VisibleAU repo. Sections 1–9 are the detailed
> spec Claude Code follows; §11–§14 are tests, acceptance, pitfalls, and the handoff.
> When the LLD and this prompt ever disagree, THE LLD WINS and this prompt is the bug.

---

## 0. READ FIRST — CONTEXT & CONVENTIONS

### 0.1 What Sprint 1 is
Platform Foundation. Installs the ChatGPT-LLD-v7 guardrails that prevent cost blowouts,
misleading confidence scores, and broken market config. **No customer-facing features.**
This sprint MUST complete before any other Phase 2 sprint — every later sprint's LLM calls
flow through the budget/sampling/provider services built here. (LLD 4760–4762, 8816.)

### 0.2 Files to have open
- `visibleau-7layer-lld.md` v8.65 — the authority for every schema/service detail.
- This repo's Phase 1 code — `run-audit.ts` and `refresh-audit.ts` (the two files this
  sprint wires the platform services INTO), the `audits` table, `organizations`, and
  `subscriptions`. Sprint 1 wires into these without changing their behaviour.

### 0.3 Verify you are on the right LLD before starting
```bash
grep -m1 "^# Version:" visibleau-7layer-lld.md          # → # Version: 8.66 (or 8.65 — both valid) | Date: June 2026
# Attribution-correction marker — accept EITHER wording (two canon copies exist):
grep -cE "ATTRIBUTION CORRECT(ED IN CROSS-REVIEW|ION)" visibleau-7layer-lld.md   # → ≥1
```
If the version line is below 8.65 (i.e. not 8.65 or 8.66), or the marker count is 0, STOP — you have a stale LLD.
(Marker-string note: the original REVIEWED bundle used "ATTRIBUTION CORRECTED IN
CROSS-REVIEW"; the r2 rebuild used "ATTRIBUTION CORRECTION". The regex above passes on
either. Sri may reconcile the two copies to a single marker — see Sprint 1 findings S1-01 —
but this check does not block the build in the meantime.)

### 0.4 SHARED CONVENTIONS (binding on this and every Phase 2 sprint)
- **Better Auth** is the canonical auth layer; **zero Clerk references** (any Clerk
  mention in CLAUDE.md/Foundations is documentation drift C-04, not a real dependency).
- **Tier source of truth is `subscriptions.tier`, NOT `organizations.tier`.** Always JOIN
  audits → organizations → subscriptions for any quota/budget read. The two can diverge
  between Stripe webhook firings. (LLD 4992–4995.)
- **TIER_ENGINES** governs engine counts (Free = 2, paid = 4) via
  `lib/llm/tier-engines.ts` — never hardcode engine lists. The
  `max_models_per_audit` column is a hard-stop CEILING (default 4 = paid canonical), a
  separate concept from the tier allowlist. (LLD 4799–4806.)
- Page routes use `[brandId]`; API routes use `[id]`. (Not exercised in S1 — no UI/API.)
- `LLM_MODE=mock` in all tests — never make real LLM calls in tests (CLAUDE.md §8).
- RLS USING + WITH CHECK on every multi-tenant table per the LLD RLS spec (§8626).
  Sprint 1 tables are **global seed config** — see §5.4 for their specific RLS posture.
- Money convention used in this sprint: USD→AUD cents via `usd * 100 / 0.65`. (LLD 4744.)

---

## 1. WHAT SHIPS THIS SPRINT
- 7 new platform tables (§5) + 4 nullable columns on the Phase 1 `audits` table.
- 6 platform services (§6): config bundles, budget policy, sampling policy, provider
  capability registry, observability, and quality gate (the writer of
  `audits.quality_status` — §6.6).
- Seed files (§5.5) for `metric_quality_gates` and `provider_market_capabilities` —
  **mandatory**: without them, audits stay `quality_status='pending'` forever and all
  Phase 2 provider lookups return empty (O-02, seed requirement at LLD 4848, 4906).
- A `config:validate` / `config:coverage` / `config:diff` CLI (§7), wired into CI.
- No user-facing UI. No Inngest functions are created this sprint (the platform services
  are called by existing Phase 1 Inngest functions — see §8).
- **GAP coverage:** none directly; Sprint 1 is the substrate the GAP sprints build on.

---

## 2. DEPENDENCIES TO INSTALL
No new runtime packages are required beyond the Phase 1 stack (Drizzle, postgres-js,
Inngest, the Vercel AI SDK). The CLI uses the existing project runner. If the repo does
not already have a CLI entrypoint, add a `bin` script wired to `pnpm visibleau` (§7).
Confirm `commander` (or the repo's existing arg-parser) is present before writing the CLI;
if absent, install the parser the repo already standardises on — do not introduce a new one.

---

## 3. ENVIRONMENT VARIABLES (additions)
None new for Sprint 1. Budget ceilings, sampling thresholds, and provider enablement are
**data** (seeded rows in the new tables), not env vars — this is deliberate so operators
tune them without redeploying. Confirm the existing `DATABASE_URL` and `LLM_MODE` are set.

---

## 4. PROJECT STRUCTURE ADDITIONS
Every file below is specified in §5–§7. No file appears here without a spec.
```
lib/platform/
├── config-bundle.service.ts          // §6.1
├── budget-policy.service.ts          // §6.2
├── sampling-policy.service.ts        // §6.3
├── provider-capability.registry.ts   // §6.4
├── observability.service.ts          // §6.5
├── quality-gate.service.ts           // §6.6 (writer of audits.quality_status)
└── types.ts                          // shared interfaces (§6.0)

db/
├── schema/
│   ├── config-bundle-cache.ts
│   ├── market-ai-budget-policies.ts
│   ├── sampling-policies.ts
│   ├── metric-quality-gates.ts
│   ├── prompt-pack-coverage.ts
│   ├── provider-market-capabilities.ts
│   └── audit-cost-snapshots.ts
├── migrations/
│   └── 00NN_phase2_sprint1_platform.sql   // 7 CREATEs + audits ALTER (§5)
└── seed/
    ├── metric-quality-gates.ts             // §5.5 (mandatory)
    └── provider-market-capabilities.ts     // §5.5 (mandatory)

cli/
└── visibleau/
    ├── index.ts                            // command router (§7)
    ├── config-validate.ts
    ├── config-coverage.ts
    └── config-diff.ts

tests/phase2/sprint1/
├── budget-policy.service.test.ts
├── sampling-policy.service.test.ts
├── provider-capability.registry.test.ts
├── config-bundle.service.test.ts
├── quality-gate.integration.test.ts
└── phase1-unchanged.regression.test.ts
```

---

## 5. DATABASE SCHEMA ADDITIONS

Translate each SQL definition below into a Drizzle schema file (one per table) AND a raw
SQL migration. Definitions are copied verbatim from the LLD — do not paraphrase column
names, types, defaults, or constraints. LLD anchor for each table given inline.

**MIGRATION IDEMPOTENCY (MI-01, LLD v8.29 — applies to the whole §5 migration).** The
migration mixes idempotent ALTERs with otherwise-non-idempotent statements; a CI retry or
resumed partial deploy would crash. Make the WHOLE Sprint-1 migration re-runnable: every
`CREATE TABLE` → `CREATE TABLE IF NOT EXISTS` (all 7 here); every `CREATE INDEX` /
`CREATE UNIQUE INDEX` → `… IF NOT EXISTS` (§5.3); and since Postgres has no
`CREATE POLICY IF NOT EXISTS`, precede the `audit_cost_snapshots` policy with
`DROP POLICY IF EXISTS "<name>" ON audit_cost_snapshots;` (§5.4). `ALTER … ENABLE RLS` is
already idempotent. (LLD MI-01 spec at ~8642–8652.)

### 5.1 The seven tables (LLD 4771–4960)

**config_bundle_cache** (LLD 4777). Columns: `id` UUID PK default gen_random_uuid();
`market_code` TEXT NOT NULL ('AU_EN'|'NZ_EN'|'UK_EN'); `locale` TEXT NOT NULL
('en-AU'|'en-NZ'|'en-GB'); `segment` TEXT NOT NULL ('smb'|'agency'|'enterprise');
`bundle_version` INTEGER NOT NULL; `config_digest` TEXT NOT NULL; `resolved_config` JSONB
NOT NULL; `is_active` BOOLEAN NOT NULL DEFAULT true; `created_at` TIMESTAMPTZ NOT NULL
DEFAULT now(). Constraints: `UNIQUE(market_code, locale, segment, bundle_version)` PLUS a
partial unique index `config_bundle_one_active ON (market_code, locale, segment) WHERE
is_active = true` — only one active bundle per market+locale+segment.
**Activation transaction (LLD 4771–4776):** `ConfigBundleService.activate(newId)` owns it:
in one transaction, INSERT the new active row, then UPDATE all other rows for the same
market+locale+segment to `is_active=false`. The partial index makes a missed deactivation
a hard error rather than silent duplication.

**market_ai_budget_policies** (LLD 4793). `id` UUID PK; `market_code` TEXT NOT NULL;
`segment` TEXT NOT NULL; `use_case` TEXT NOT NULL; `max_prompts_per_audit` INTEGER NOT
NULL DEFAULT 50; `max_models_per_audit` INTEGER NOT NULL DEFAULT 4 (paid-tier ceiling —
NOT the Free=2 allowlist, which lives in TIER_ENGINES; LLD 4799–4806);
`max_repeated_samples` INTEGER NOT NULL DEFAULT 5 (Wilson CI needs ≥5; LLD 4807–4809);
`max_estimated_cost_cents` INTEGER NOT NULL DEFAULT 500; `max_fan_out_sub_queries` INTEGER
NOT NULL DEFAULT 12 (v3.0; LLD 4811); `hard_stop_on_budget` BOOLEAN NOT NULL DEFAULT true;
`created_at` TIMESTAMPTZ NOT NULL DEFAULT now(). `UNIQUE(market_code, segment, use_case)`.

**sampling_policies** (LLD 4821). `id` UUID PK; `market_code`/`segment`/`use_case` TEXT NOT
NULL; `minimum_prompt_count` INTEGER NOT NULL DEFAULT 10; `recommended_prompt_count`
INTEGER NOT NULL DEFAULT 50; `minimum_repeated_samples` INTEGER NOT NULL DEFAULT 3 (minimum
AUDITS in a period before trend aggregation is meaningful — NOT Phase 1 runsPerPrompt=5;
LLD 4815–4833); `confidence_display_threshold` NUMERIC(5,2) NOT NULL DEFAULT 0.60;
`created_at`. `UNIQUE(market_code, segment, use_case)`.
**Design boundary (LLD 4814–4820):** this table governs Phase 2 visibility-scoring/
aggregation only. Phase 1 `run-audit.ts` always uses runsPerPrompt=5 and is NOT overridden.

**metric_quality_gates** (LLD 4869). `id` UUID PK; `metric_key` TEXT NOT NULL; `market_code`
TEXT NOT NULL; `minimum_samples` INTEGER NOT NULL; `minimum_provider_count` INTEGER NOT NULL
DEFAULT 2; `insufficient_data_label` TEXT NOT NULL DEFAULT 'Insufficient data'; `created_at`.
`UNIQUE(metric_key, market_code)`. **Must be seeded this sprint (§5.5).**

**prompt_pack_coverage** (LLD 4880). `id` UUID PK; `market_code`/`locale`/`segment`/
`use_case` TEXT NOT NULL; `required_template_keys` JSONB NOT NULL; `available_template_keys`
JSONB NOT NULL; `coverage_ratio` NUMERIC(5,2) NOT NULL; `coverage_status` TEXT NOT NULL
('complete'|'partial'|'missing'); `last_validated_at` TIMESTAMPTZ NOT NULL DEFAULT now().
`UNIQUE(market_code, locale, segment, use_case)`.

**provider_market_capabilities** (LLD 4894). `id` UUID PK; `provider_key` TEXT NOT NULL;
`model_key` TEXT NOT NULL; `market_code`/`locale` TEXT NOT NULL; `supports_web_retrieval`,
`supports_citations`, `supports_location_context`, `supports_query_fan_out` BOOLEAN NOT
NULL DEFAULT false; `max_fan_out_sub_queries` INTEGER NOT NULL DEFAULT 12;
`max_context_tokens` INTEGER (nullable); `average_latency_ms` INTEGER (nullable);
`estimated_cost_per_1k_cents` NUMERIC(8,4) (nullable); `is_enabled` BOOLEAN NOT NULL
DEFAULT false (ALL providers start disabled); `created_at`.
`UNIQUE(provider_key, model_key, market_code, locale)`. **Must be seeded this sprint
(§5.5)** or `ProviderCapabilityRegistry.getEnabledProviders()` returns empty and all Phase
2 fan-out + journey functions fail silently (LLD 4906–4918).

**audit_cost_snapshots** (LLD 4939). `id` UUID PK; `audit_id` UUID REFERENCES audits(id)
**ON DELETE CASCADE** (operational record, dies with the audit; LLD 4940); `organization_id`
UUID NOT NULL REFERENCES organizations(id); `market_code`/`locale` TEXT NOT NULL;
`estimated_cost_cents` INTEGER NOT NULL DEFAULT 0; `actual_cost_cents` INTEGER NOT NULL
DEFAULT 0; `prompt_count` INTEGER NOT NULL DEFAULT 0; `provider_call_count` INTEGER NOT NULL
DEFAULT 0; `budget_policy_id` UUID REFERENCES market_ai_budget_policies(id) **ON DELETE SET
NULL** (snapshot is a historical fact; if a policy is retired, null the link rather than
block the delete — FK-ON-DELETE fix v8.28, LLD 4953–4956); `created_at`.
**Writer:** `BudgetPolicyService` inserts one row per audit at completion via the
`audit/complete` event, populated in `refresh-audit.ts` after `totalCostUsd` is finalised
(LLD 4922–4938). **Exclusion:** skip when `org.slug = 'sample'` (D-03 + O-03, LLD 4937).

### 5.2 audits ALTER (LLD 4960–4978) — nullable, safe migration
```sql
ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS config_bundle_id     UUID REFERENCES config_bundle_cache(id),
  ADD COLUMN IF NOT EXISTS config_digest        TEXT,
  ADD COLUMN IF NOT EXISTS estimated_cost_cents INTEGER,
  ADD COLUMN IF NOT EXISTS quality_status       TEXT DEFAULT 'pending';
  -- quality_status ∈ 'pending' | 'sufficient' | 'insufficient' | 'partial'
```
**Writer of `quality_status`:** `QualityGateService.evaluate(auditId)`, called by Phase 1
`refresh-audit.ts` after scoring; reads `metric_quality_gates` for the audit's market_code
and sets the status (LLD 4965–4977). Default `'pending'` at row creation.

### 5.3 Indexes
Create the two unique constructs on `config_bundle_cache` (§5.1). Add a btree index on
`audit_cost_snapshots(organization_id, created_at DESC)` for cost-history reads, and on
`audit_cost_snapshots(audit_id)` for the cascade lookup. All other Sprint 1 tables are
small global-config tables keyed by their UNIQUE tuples; no extra indexes needed.
**Per MI-01, write every index as `CREATE [UNIQUE] INDEX IF NOT EXISTS`** (the partial
`config_bundle_one_active` unique index included).

### 5.4 RLS posture for Sprint 1 tables
The six config tables (`config_bundle_cache`, `market_ai_budget_policies`,
`sampling_policies`, `metric_quality_gates`, `prompt_pack_coverage`,
`provider_market_capabilities`) are **global seed config, not tenant data** — they have no
`organization_id` and are read by platform services, not by per-tenant queries. Follow the
LLD's precedent for non-tenant tables (RLS DISABLED, as `citability_methods` and
`validation_corpus_results` are; LLD ~8726). `audit_cost_snapshots` DOES carry
`organization_id` and IS tenant data → enable RLS with USING + WITH CHECK scoped to
`organization_id = current_setting('app.current_org_id', true)::uuid`, matching the LLD
RLS spec (§8626). **Per MI-01, precede the policy with
`DROP POLICY IF EXISTS "org_isolation" ON audit_cost_snapshots;`** (Postgres has no
`CREATE POLICY IF NOT EXISTS`) so the migration is re-runnable. Document the disabled-RLS
decision in each config schema file's header comment so a future audit doesn't "fix" it.

### 5.5 Seeds (MANDATORY — both run in Sprint 1)
`db/seed/metric-quality-gates.ts` — insert the 7 AU_EN rows exactly as the LLD enumerates
(LLD 4851–4861): frequency(10,2), sentiment(10,2), accuracy(5,2), position(10,2),
context(10,2), composite(3,2), citation_source(5,2); `ON CONFLICT (metric_key, market_code)
DO NOTHING`.
`db/seed/provider-market-capabilities.ts` — insert the 4 AU_EN/en-AU providers, all
`is_enabled=true` at seed time, with the FULL capability matrix below copied exactly from
the LLD (4908–4916). Columns: (supports_web_retrieval, supports_citations,
supports_location_context, supports_query_fan_out, max_fan_out_sub_queries). **All four
booleans DEFAULT false, so every true must be set explicitly — and note the one exception:
anthropic's `supports_citations` is FALSE.**
  - `openai` / `gpt-4o`            → web=true, citations=true,  location=true, fan_out=true,  max_fan_out=12
  - `anthropic` / `claude-3-5-sonnet` → web=true, **citations=FALSE**, location=true, fan_out=true,  max_fan_out=10
  - `google` / `gemini-1.5-pro`    → web=true, citations=true,  location=true, fan_out=true,  max_fan_out=12
  - `perplexity` / `pplx-70b-online` → web=true, citations=true,  location=true, **fan_out=FALSE**, max_fan_out=8
`ON CONFLICT (provider_key, model_key, market_code, locale) DO NOTHING`. Getting
`anthropic.supports_citations` wrong would silently mis-route citation-dependent provider
selection in later sprints — copy the matrix, do not infer it.

---

## 6. PLATFORM SERVICES (LLD 4980–5074)

### 6.0 lib/platform/types.ts — shared interfaces (verbatim from LLD 4998–5005)
`AuditParams { brandId: string; organizationId: string; promptCount: number;
engineCount: number; }`; `CostEstimate { estimatedCostCents: number; maxAllowedCents:
number; withinBudget: boolean; policyId: string; }`; `BudgetPolicy { maxEstimatedCostCents:
number; hardStopOnBudget: boolean; }`; `EnforcementResult { allowed: boolean; reason?:
'budget_exceeded' | 'policy_disabled' | 'ok'; }`; `QualityLabel { label:
'Confirmed'|'Likely'|'Hypothesis'|'Insufficient data'; }`. Plus `ConfigBundle`,
`SamplingPolicy`, `Provider`, `Tier`, `ValidationResult`, `ObservabilityEvent` as needed.

### 6.1 ConfigBundleService (LLD 4983)
Methods: `resolve(market, locale, segment): Promise<ConfigBundle>`,
`get(bundleId): Promise<ConfigBundle>`, `invalidate(market): Promise<void>`, plus
`activate(newId)` owning the activation transaction (§5.1). `resolve` returns the single
`is_active=true` bundle for the tuple; if none, fall back per the observability
`config_fallback_used` event and a documented default. `config_digest` is a stable hash of
`resolved_config` for change detection (used by `config:diff`).

### 6.2 BudgetPolicyService (LLD 4990, 5048)
Methods: `estimate(params: AuditParams): Promise<CostEstimate>`,
`enforce(estimate, policy): Promise<EnforcementResult>`,
`record(auditId, actual: number): Promise<void>`.
- **`estimate` MUST JOIN to `subscriptions.tier`** (§0.4) and size the estimate using
  `TIER_ENGINES[tier].length` for engine count. It MUST include the per-function Phase 2
  cost targets (LLD 5014–5040) for any Phase 2 function scheduled in the current cycle.
- **Caller:** `run-audit.ts` calls `estimate()` BEFORE firing LLM calls; if
  `!withinBudget && policy.hardStopOnBudget` → throw 'Budget exceeded' (LLD 5008–5011).
- **`record`:** called by `refresh-audit.ts` after completion; writes the
  `audit_cost_snapshots` row (§5.1 writer block), skipping `org.slug='sample'`.
- Cost target reference (protect ~85–92% margin; LLD 5013–5042): Phase 2 adds
  <US$2.31/mo per brand on Growth+; Starter Phase-2 LLM functions are gated OFF → zero
  additional cost. Encode these per-function targets as named constants the estimate reads.

### 6.3 SamplingPolicyService (LLD 5044)
Methods: `getPolicy(market, segment, useCase): Promise<SamplingPolicy>`,
`validate(sampleCount, policy): Promise<ValidationResult>`,
`getQualityLabel(metric, sampleCount): Promise<QualityLabel>` returning
'Confirmed'|'Likely'|'Hypothesis'|'Insufficient data'. Quality-label thresholds derive
from `confidence_display_threshold` and `metric_quality_gates.minimum_samples` for the
metric; below `minimum_samples` → 'Insufficient data'.

### 6.4 ProviderCapabilityRegistry (LLD 5052)
Methods: `getEnabledProviders(market, locale): Promise<Provider[]>`,
`canHandle(provider, market, useCase): Promise<boolean>`,
`supportsFanOut(provider, market): Promise<boolean>`,
`getBestProvider(market, useCase, tier): Promise<Provider>`. Reads
`provider_market_capabilities` filtered by `is_enabled=true`. `getBestProvider` respects
the tier (a Free-tier request may only return providers within `TIER_ENGINES['free']`).

### 6.5 ObservabilityService (LLD 5060)
`emit(event: ObservabilityEvent): void`. Must support every event the LLD lists
(LLD 5062–5073): market_context_resolved, config_bundle_loaded, config_fallback_used,
prompt_pack_coverage_failed, provider_market_disabled, audit_budget_estimated,
audit_budget_exceeded, score_quality_gate_failed, report_confidence_downgraded,
frontend_market_changed, fan_out_simulated, agent_readiness_scored, mcp_check_completed,
topical_gap_calculated, citation_source_classified, linkedin_presence_audited,
consensus_score_calculated. Route to the repo's existing logging/telemetry sink.

### 6.6 QualityGateService
Referenced by the audits ALTER (§5.2) and the integration test. Implement it as part of
this sprint (it is the writer of `audits.quality_status`): `evaluate(auditId)` reads the
audit's market_code, compares per-dimension sample counts against `metric_quality_gates`,
and sets quality_status to sufficient/insufficient/partial. Place in
`lib/platform/quality-gate.service.ts`.

---

## 7. CONFIG VALIDATION CLI (LLD 5076–5082)
```bash
pnpm visibleau config:validate --market AU_EN --locale en-AU
pnpm visibleau config:coverage --all-enabled-markets
pnpm visibleau config:diff --from v1 --to v2
```
- `config:validate` — resolves the active bundle for the market/locale, checks
  `prompt_pack_coverage` is 'complete', confirms ≥1 enabled provider, validates budget +
  sampling policy rows exist; non-zero exit on any failure (so CI fails).
- `config:coverage` — runs the coverage check across all markets with ≥1 enabled provider.
- `config:diff` — diffs two `config_bundle_cache` versions by `config_digest`/
  `resolved_config`.
- **CI wiring:** run `config:validate` on every PR that touches config (LLD 5082). Add the
  step to the existing CI workflow.

---

## 8. INNGEST
No new Inngest functions this sprint. The platform services are invoked by EXISTING Phase 1
functions: `run-audit.ts` calls `BudgetPolicyService.estimate()` pre-flight;
`refresh-audit.ts` calls `BudgetPolicyService.record()` and `QualityGateService.evaluate()`
post-scoring. Do not register anything new in `serve()` this sprint — but preserve the
existing `serve()` array intact (the 25 Phase 2 functions land in later sprints; LLD 4511).

---

## 9. API
No new API routes this sprint. (The first Phase 2 routes appear in Sprint 3.)

---

## 10. CLAUDE CODE PROMPT (paste this to open Sprint 1)

> You are implementing **VisibleAU Phase 2 — Sprint 1: Platform Foundation**. This is a
> backend-only sprint that installs cost/quality/config guardrails before any other Phase 2
> work. There are NO user-facing features.
>
> Authority: `visibleau-7layer-lld.md` v8.65, the "PHASE 2 SPRINT 1 — PLATFORM FOUNDATION"
> section (lines ~4760–5082). Where this prompt and the LLD differ, the LLD wins.
>
> Build, in order:
> 1. Drizzle schemas + one SQL migration for the 7 tables in §5.1 and the `audits` ALTER
>    in §5.2 — copy column names/types/defaults/constraints exactly, including the
>    `config_bundle_one_active` partial unique index and the two FK ON DELETE rules
>    (audit_cost_snapshots: audit_id CASCADE, budget_policy_id SET NULL). Make the whole
>    migration re-runnable per MI-01: `CREATE TABLE IF NOT EXISTS`, `CREATE [UNIQUE] INDEX
>    IF NOT EXISTS`, and `DROP POLICY IF EXISTS "org_isolation" ON audit_cost_snapshots;`
>    before the `CREATE POLICY`.
> 2. The two mandatory seed files in §5.5 (metric_quality_gates: 7 AU_EN rows;
>    provider_market_capabilities: 4 AU_EN providers, is_enabled=true) with the documented
>    ON CONFLICT clauses.
> 3. `lib/platform/types.ts` then the 6 services in §6 (ConfigBundle, BudgetPolicy,
>    SamplingPolicy, ProviderCapabilityRegistry, Observability, QualityGate). Budget +
>    quality services must read `subscriptions.tier` (JOIN audits→organizations→
>    subscriptions), never `organizations.tier`.
> 4. Wire the services into the EXISTING Phase 1 `run-audit.ts` (pre-flight
>    `estimate()` + hard-stop) and `refresh-audit.ts` (`record()` + `QualityGateService.
>    evaluate()`), changing none of Phase 1's scoring behaviour.
> 5. The `pnpm visibleau config:validate|coverage|diff` CLI in §7 and a CI step running
>    `config:validate` on config PRs.
> 6. RLS exactly per §5.4: the 6 config tables RLS-DISABLED (global seed config, document
>    why in each header), `audit_cost_snapshots` RLS-ENABLED with USING + WITH CHECK on
>    organization_id.
>
> Constraints: TypeScript strict; no `any`. `LLM_MODE=mock` in tests; never call a real
> LLM in a test. Do not hardcode engine lists (TIER_ENGINES governs). Do not register new
> Inngest functions. After building, run the §12 verification greps and the §11 tests and
> report results.

---

## 11. TESTS REQUIRED (LLM_MODE=mock throughout)
- `budget-policy.service.test.ts` — estimate reads subscriptions.tier (not
  organizations.tier); hard-stop throws when over budget + hard_stop_on_budget=true;
  record() writes a snapshot and skips org.slug='sample'.
- `sampling-policy.service.test.ts` — getQualityLabel returns 'Insufficient data' below
  minimum_samples and the correct tier of label above it.
- `provider-capability.registry.test.ts` — getEnabledProviders returns empty when no rows
  seeded (proves the seed dependency), the 4 providers when seeded; getBestProvider
  respects tier.
- `config-bundle.service.test.ts` — activate() leaves exactly one is_active row per
  tuple (the partial index holds); resolve() returns it.
- `quality-gate.integration.test.ts` — a mock completed audit transitions
  quality_status pending→sufficient when sample thresholds met, →insufficient/partial
  otherwise.
- `phase1-unchanged.regression.test.ts` — a Phase 1 audit run produces identical scores
  and uses runsPerPrompt=5 with the platform services in the path (proves §0.4 boundary).

---

## 12. VERIFICATION GREPS (run after building)
```bash
# 7 new tables created
grep -cE "CREATE TABLE (IF NOT EXISTS )?(config_bundle_cache|market_ai_budget_policies|sampling_policies|metric_quality_gates|prompt_pack_coverage|provider_market_capabilities|audit_cost_snapshots)" db/migrations/*sprint1*.sql   # → 7
# MI-01 idempotency: all CREATEs re-runnable, policy DROP-guarded
grep -c "CREATE TABLE IF NOT EXISTS" db/migrations/*sprint1*.sql                    # → 7
grep -c "CREATE \(UNIQUE \)\?INDEX IF NOT EXISTS" db/migrations/*sprint1*.sql        # → ≥3
grep -c "DROP POLICY IF EXISTS" db/migrations/*sprint1*.sql                         # → ≥1
# anthropic citations=false present in the provider seed (the one boolean trap)
grep -A1 "anthropic" db/seed/provider-market-capabilities.ts | grep -ic "false"     # → ≥1
# audits ALTER present, all 4 columns
grep -c "ADD COLUMN IF NOT EXISTS" db/migrations/*sprint1*.sql                     # → 4
# the two FK ON DELETE rules
grep -E "ON DELETE (CASCADE|SET NULL)" db/migrations/*sprint1*.sql                  # → 2 lines
# partial unique active-bundle index
grep -c "config_bundle_one_active" db/migrations/*sprint1*.sql                      # → ≥1
# tier source-of-truth: NO organizations.tier reads in budget/quality services
grep -RnE "organizations\.tier|org\.tier" lib/platform/ | grep -iv "subscriptions"  # → 0
grep -Rc "subscriptions" lib/platform/budget-policy.service.ts                      # → ≥1
# no hardcoded engine list (TIER_ENGINES governs)
grep -RnE "\[(\s*'chatgpt'|\s*'claude'|\s*'gemini'|\s*'perplexity')" lib/platform/  # → 0
# no new Inngest registrations this sprint
git diff --stat app/api/inngest/route.ts                                           # → no change
# both seeds exist
ls db/seed/metric-quality-gates.ts db/seed/provider-market-capabilities.ts         # → both
# no Clerk
grep -Rc "Clerk\|@clerk" lib/platform/ db/                                          # → 0
```

---

## 13. COMMON PITFALLS / SPRINT 1 ANTI-PATTERNS
- **Skipping the seeds.** Without metric_quality_gates seed, every audit's quality_status
  is stuck 'pending' (O-02). Without provider seed, all Phase 2 provider lookups return
  empty and later sprints fail silently. Both seeds are part of Sprint 1's definition.
- **Reading `organizations.tier`.** Always `subscriptions.tier` via JOIN (§0.4) — the
  single most important correctness rule this sprint.
- **Hardcoding engine counts.** `max_models_per_audit` (ceiling, default 4) is NOT the
  Free=2 allowlist; TIER_ENGINES is the allowlist. Don't conflate them.
- **Confusing the two sample knobs.** `max_repeated_samples`/runsPerPrompt=5 (Phase 1
  per-audit LLM calls, unchangeable) vs `minimum_repeated_samples`=3 (minimum audits in a
  period before Phase 2 trend aggregation). The LLD calls this out repeatedly (4807, 4815).
- **Enabling RLS on the global config tables** (they have no organization_id) or
  **forgetting it on audit_cost_snapshots** (it has one). See §5.4.
- **Changing Phase 1 scoring.** The platform services wrap Phase 1; they must not alter its
  outputs. The regression test guards this.
- **Wrong FK ON DELETE.** audit_cost_snapshots.audit_id = CASCADE; budget_policy_id = SET
  NULL. Reversing either is a bug (v8.28).

---

## 14. HANDOFF TO SPRINT 2
After Sprint 1: the platform substrate exists — budget enforcement, sampling/quality
labels, provider registry, config bundles + CLI, cost snapshots, and the audits ALTER
columns, all wired into the unchanged Phase 1 audit path. **Sprint 2 (Workflow
Intelligence)** builds the first user-facing layer (tables 29–31: remediation_tasks,
workflow_runs, content_drafts) plus the shared UI component foundation, and its
`generate-content-draft` LLM calls will flow through `BudgetPolicyService.estimate()` built
here. Sprint 2 requires: this sprint's cost services (for draft-generation budgeting) and
the unchanged Phase 1 recommendations/audits/scores.

---

## CHANGELOG
- v1.3 — Re-pinned to canon v8.66 (coordinated RM-01 batch). The §0.3 version check now
  accepts 8.66 (8.65 also valid; v8.66 changed only the prototype reduced-motion reset,
  nothing this prompt cites). No other change.
- v1.2 — Gate 2 pass-2 findings applied (internal-consistency angle). S1P2-01 [LOW-MOD]:
  §0.2 named the pre-flight wiring target `lib/audit/runner.ts` while §5/§6.2/§8/§10 (and
  the LLD) use `run-audit.ts` — aligned §0.2 to `run-audit.ts` (+ `refresh-audit.ts`),
  reconciling the one divergent filename. S1P2-02 [LOW]: restated the MI-01 idempotency
  requirement in the §10 paste-block step 1 for self-containment parity. Both prompt-internal,
  no LLD change. Pass-2 also re-verified all pass-1 fixes (S1-01..05) landed correctly; J1/J2
  reconfirmed. Validated against r2 canon before applying.
- v1.1 — Gate 2 findings applied (reviewer chat). S1-02: added quality-gate.service.ts to
  the §4 tree and corrected the service count to 6. S1-03: applied MI-01 (v8.29) migration
  idempotency — CREATE TABLE/INDEX IF NOT EXISTS + DROP POLICY IF EXISTS guard, with §12
  greps. S1-04: reproduced the full 4-provider capability matrix inline in §5.5, flagging
  anthropic supports_citations=FALSE. S1-05: marked line anchors navigational/approximate.
  S1-01 (marker-string divergence) mitigated: §0.3 now accepts either marker so the build
  is never blocked; the canonical reconciliation remains Sri's call. J1/J2 confirmed correct
  by the reviewer — no change. All findings validated against LLD v8.65 before applying.
- v1.0 — Initial Sprint 1 prompt, generated single-pass against LLD v8.65 (REVIEWED).
  All schema/service/seed/CLI detail cited to LLD lines ~4760–5082; conventions block from
  the master plan §7.
